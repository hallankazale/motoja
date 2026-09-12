import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
process.on('uncaughtException', error => { console.error(JSON.stringify({ message: error.message, detail: error.detail, where: error.where, position: error.position })); process.exit(1); });

// Real PostgreSQL semantics in an isolated WASM database; no production users or trips are modified.
const db = new PGlite();
const legacyFixture = process.argv.includes('--legacy');
await db.exec(`
 create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; create schema storage;
 grant usage on schema auth,storage to anon,authenticated,service_role;
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claims',true)::jsonb->>'sub','')::uuid; $$;
 create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb; $$;
 create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}',email_confirmed_at timestamptz,phone_confirmed_at timestamptz);
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,metadata jsonb);
 alter table storage.objects enable row level security;
 grant select,insert,delete on storage.objects to authenticated;
 create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1]; $$;
 create function storage.extension(name text) returns text language sql immutable as $$ select reverse(split_part(reverse(name),'.',1)); $$;
`);
if (legacyFixture) await db.exec(`
 create table public.profiles(id uuid,full_name text,phone text,role text,account_status text);
 create table public.rides(id uuid default gen_random_uuid(),status text);
 insert into public.rides(status) values('completed'),('cancelled');
 grant all on public.rides to anon,authenticated;
 create function public.legacy_test() returns integer language sql security definer as $$ select 1; $$;
 grant execute on function public.legacy_test() to public,anon,authenticated;
`);
const files = (await readdir(new URL('../supabase/migrations/', import.meta.url))).filter(file => file.endsWith('.sql')).sort();
for (const file of files) await db.exec(await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8'));
console.log(`PASS: migrations apply to ${legacyFixture ? 'an existing legacy' : 'a fresh'} PostgreSQL database`);

const users = { passenger: '10000000-0000-4000-8000-000000000001', passenger2: '10000000-0000-4000-8000-000000000002', driver: '20000000-0000-4000-8000-000000000001', driver2: '20000000-0000-4000-8000-000000000002', admin: '30000000-0000-4000-8000-000000000001' };
for (const [name,id] of Object.entries(users)) {
  const role = name.startsWith('passenger') ? 'passenger' : name.startsWith('driver') ? 'driver' : 'admin';
  await db.query(`insert into auth.users(id,email_confirmed_at,raw_user_meta_data) values($1,now(),$2)`, [id, JSON.stringify({ full_name: `Conta ${name}`, requested_role: role })]);
  await db.query(`insert into motoja_private.profiles(id,full_name,role,is_tester,terms_version) values($1,$2,$3,true,'piloto-2026-09-v1')`,[id,`Conta ${name}`,role]);
  if (role==='driver') {
    await db.query(`insert into motoja_private.drivers(user_id,approval_status,is_online,documents_valid_until,model,color,plate) values($1,'approved',true,current_date+30,'Moto teste','Azul',$2)`,[id,name==='driver'?'ABC1D23':'DEF4G56']);
    await db.query(`insert into motoja_private.driver_locations(user_id,lat,lng,accuracy,recorded_at) values($1,-15.546,-55.165,10,now())`,[id]);
  }
}
await db.exec(`update motoja_private.settings set mode='pilot';`);
const point = { lat:-15.546,lng:-55.165,label:'Ponto de teste de embarque' };
const destination = { lat:-15.550,lng:-55.163,label:'Ponto de teste de destino' };
async function as(user, sql, params=[], aal='aal1', role='authenticated') {
 return db.transaction(async tx => {
  await tx.exec(`set local role ${role}`);
  await tx.query(`select set_config('request.jwt.claims',$1,true)`,[JSON.stringify({ sub:user,role,aal })]);
  return tx.query(sql,params);
 });
}
async function cmd(user, action, payload={},aal='aal1') {
 const result=await as(user,'select public.mj_command($1,$2::jsonb) result',[action,JSON.stringify(payload)],aal);
 return result.rows[0].result;
}
async function quote(user=users.passenger) {
 const {rows}=await as(null,'select public.mj_store_quote($1,$2::jsonb) result',[user,JSON.stringify({pickup:point,destination,distance_m:2400,duration_s:400,provider:'local-test'})],'aal1','service_role');
 return rows[0].result;
}
let passes=1;
async function test(name,fn){await fn();passes++;console.log(`PASS: ${name}`);}
try {
 if(legacyFixture) await test('legacy records survive while obsolete client access is revoked',async()=>{
  assert.equal((await db.query('select count(*) n from public.rides')).rows[0].n,2);
  await assert.rejects(as(users.passenger,'select * from public.rides'));
  await assert.rejects(as(users.passenger,'select public.legacy_test()'));
  assert.ok((await db.query('select count(*) n from motoja_private.legacy_acl_backup')).rows[0].n>0);
 });
 await test('anonymous cannot invoke commands or read private tables',async()=>{
  await assert.rejects(as(null,`select public.mj_command('snapshot','{}')`,[],'aal1','anon'));
  await assert.rejects(as(users.passenger,'select * from motoja_private.rides'));
  await assert.rejects(as(users.passenger,`update motoja_private.profiles set role='admin'`));
 });
 await test('unverified and blocked users cannot perform operations',async()=>{
  await db.query(`update auth.users set email_confirmed_at=null where id=$1`,[users.passenger2]);
  await assert.rejects(cmd(users.passenger2,'snapshot'),/Confirme/);
  await db.query(`update auth.users set email_confirmed_at=now() where id=$1`,[users.passenger2]);
  await db.query(`update motoja_private.profiles set account_status='blocked' where id=$1`,[users.passenger2]);
  await assert.rejects(cmd(users.passenger2,'snapshot'),/suspensa/);
  await db.query(`update motoja_private.profiles set account_status='active' where id=$1`,[users.passenger2]);
 });
 await test('admin data and commands require MFA',async()=>{
  await assert.rejects(cmd(users.admin,'snapshot'),/duas etapas/);
  assert.ok((await cmd(users.admin,'snapshot',{},'aal2')).admin);
  await assert.rejects(cmd(users.passenger,'settings',{mode:'pilot'}),/restrito/);
 });
 await test('server quotes enforce service area, bounds, cents and permissions',async()=>{
  const result=await quote();assert.equal(result.price_cents,808);
  await assert.rejects(as(users.passenger,'select public.mj_store_quote($1,$2::jsonb)',[users.passenger,JSON.stringify({})]));
  await assert.rejects(as(null,'select public.mj_store_quote($1,$2::jsonb)',[users.passenger,JSON.stringify({pickup:{...point,lat:90},destination,distance_m:1000,duration_s:100,provider:'test'})],'aal1','service_role'));
 });
 const q=await quote();let ride;
 const request={quote_id:q.id,payment_method:'pix',idempotency_key:'40000000-0000-4000-8000-000000000001',price_cents:1};
 await test('request uses server price and is idempotent',async()=>{
  ride=await cmd(users.passenger,'request_ride',request);
  assert.equal(ride.price_cents,808);assert.equal(ride.pin.length,4);
  assert.equal((await cmd(users.passenger,'request_ride',request)).id,ride.id);
  const other=await quote();await assert.rejects(cmd(users.passenger,'request_ride',{...request,quote_id:other.id,idempotency_key:'40000000-0000-4000-8000-000000000002'}),/já tem/);
 });
 let offer;
 await test('dispatch offers are private and exclude PIN and exact addresses',async()=>{
  const snapshot=await cmd(users.driver,'snapshot');offer=snapshot.offer;
  assert.ok(offer);assert.equal(offer.pin,undefined);assert.equal(offer.pickup,undefined);
  assert.equal((await cmd(users.passenger2,'snapshot')).active_ride,null);
  await assert.rejects(cmd(users.driver2,'respond_offer',{offer_id:offer.id,accept:true}),/não encontrada/);
 });
 await test('only the assigned driver accepts and cannot double-book',async()=>{
  const accepted=await cmd(users.driver,'respond_offer',{offer_id:offer.id,accept:true});assert.equal(accepted.driver_id,users.driver);assert.equal(accepted.pin,undefined);
  assert.equal((await cmd(users.driver,'respond_offer',{offer_id:offer.id,accept:true})).id,ride.id);
  await assert.rejects(cmd(users.passenger2,'cancel',{ride_id:ride.id,reason:'Teste'}),/não encontrada/);
 });
 await test('boarding requires arrival and proximity; failed PIN attempts persist',async()=>{
  await assert.rejects(cmd(users.driver,'start',{ride_id:ride.id,pin:ride.pin,helmets_checked:true}),/chegada/);
  await cmd(users.driver,'arriving',{ride_id:ride.id});
  await db.query('update motoja_private.driver_locations set lat=-15.62 where user_id=$1',[users.driver]);
  await assert.rejects(cmd(users.driver,'arrived',{ride_id:ride.id}),/GPS/);
  await db.query('update motoja_private.driver_locations set lat=-15.546,recorded_at=now() where user_id=$1',[users.driver]);
  await cmd(users.driver,'arrived',{ride_id:ride.id});
  await db.query("update motoja_private.driver_locations set recorded_at=now()-interval '2 minutes' where user_id=$1",[users.driver]);
  await assert.rejects(cmd(users.driver,'start',{ride_id:ride.id,pin:ride.pin,helmets_checked:true}),/GPS/);
  await db.query('update motoja_private.driver_locations set recorded_at=now() where user_id=$1',[users.driver]);
  await db.query("update motoja_private.drivers set approval_status='suspended' where user_id=$1",[users.driver]);
  await assert.rejects(cmd(users.driver,'start',{ride_id:ride.id,pin:ride.pin,helmets_checked:true}),/documentos/);
  await db.query("update motoja_private.drivers set approval_status='approved' where user_id=$1",[users.driver]);
  for(let n=0;n<5;n++)assert.ok((await cmd(users.driver,'start',{ride_id:ride.id,pin:'WRONG',helmets_checked:true})).error);
  await assert.rejects(cmd(users.driver,'start',{ride_id:ride.id,pin:ride.pin,helmets_checked:true}),/bloqueado/);
  assert.equal((await db.query('select pin_failures from motoja_private.rides where id=$1',[ride.id])).rows[0].pin_failures,5);
  await db.query(`update motoja_private.rides set pin_locked_until=now()-interval '1 second' where id=$1`,[ride.id]);
  await assert.rejects(cmd(users.driver,'start',{ride_id:ride.id,pin:ride.pin,helmets_checked:false}),/capacetes/);
  await cmd(users.driver,'start',{ride_id:ride.id,pin:ride.pin,helmets_checked:true});
 });
 let token;
 await test('share token is scoped and omits PIN, phone and passenger identity',async()=>{
  ({token}=await cmd(users.passenger,'share',{ride_id:ride.id}));
  const shared=(await as(null,'select public.mj_shared_ride($1) result',[token],'aal1','anon')).rows[0].result;
  assert.equal(shared.status,'in_progress');assert.equal(shared.pin,undefined);assert.equal(shared.passenger_id,undefined);assert.equal(shared.phone,undefined);
 });
 await test('completion, payment, disputes and ratings require correct participant and state',async()=>{
  await assert.rejects(cmd(users.driver,'cancel',{ride_id:ride.id,reason:'Teste'}),/já começou/);
  await assert.rejects(cmd(users.passenger,'complete',{ride_id:ride.id}),/exclusiva/);
  await cmd(users.driver,'complete',{ride_id:ride.id});
  const ended=(await as(null,'select public.mj_shared_ride($1) result',[token],'aal1','anon')).rows[0].result;assert.equal(ended,null);
  await assert.rejects(cmd(users.passenger,'confirm_payment',{ride_id:ride.id}),/exclusiva/);
  await cmd(users.driver,'confirm_payment',{ride_id:ride.id});await cmd(users.driver,'confirm_payment',{ride_id:ride.id});
  await cmd(users.passenger,'rate',{ride_id:ride.id,stars:5,comment:'Teste de integração'});
  await cmd(users.passenger,'rate',{ride_id:ride.id,stars:1});
  assert.equal((await cmd(users.passenger,'snapshot')).rides[0].my_rating,5);
  await cmd(users.passenger,'dispute_payment',{ride_id:ride.id});
  await assert.rejects(cmd(users.driver,'confirm_payment',{ride_id:ride.id}),/indisponível/);
 });
 await test('private incident survives reload and admin review requires MFA',async()=>{
  const incident=await cmd(users.passenger,'incident',{ride_id:ride.id,category:'safety',description:'Relato sintético para teste de integração.'});
  assert.ok((await cmd(users.passenger,'snapshot')).incidents.some(i=>i.id===incident.id));
  assert.equal((await cmd(users.passenger2,'snapshot')).incidents.length,0);
  await assert.rejects(cmd(users.admin,'resolve_incident',{incident_id:incident.id,resolution:'Atendido no teste.'}),/duas etapas/);
  await cmd(users.admin,'resolve_incident',{incident_id:incident.id,resolution:'Atendido no teste.'},'aal2');
 });
 await test('driver cannot self-approve or go online with expired documents',async()=>{
  await assert.rejects(cmd(users.driver,'review_driver',{driver_id:users.driver,status:'approved',note:'Aprovação indevida'}),/restrito/);
  await db.query(`update motoja_private.drivers set documents_valid_until=current_date-1 where user_id=$1`,[users.driver]);
  await assert.rejects(cmd(users.driver,'set_online',{online:true}),/aprovação/);
  await assert.rejects(cmd(users.admin,'review_driver',{driver_id:users.driver,status:'approved',note:'Análise de teste válida.'},'aal2'),/Revise/);
 });
 await test('closed operations and non-invited accounts cannot request rides',async()=>{
  const q=await quote(users.passenger2);const payload={quote_id:q.id,payment_method:'cash',idempotency_key:'40000000-0000-4000-8000-000000000003'};
  await db.query(`update motoja_private.profiles set is_tester=false where id=$1`,[users.passenger2]);
  await assert.rejects(cmd(users.passenger2,'request_ride',payload),/convidados/);
  await db.exec(`update motoja_private.settings set mode='closed'`);
  await assert.rejects(cmd(users.passenger2,'request_ride',payload),/preparação/);
 });
 await test('all private tables have RLS and no anonymous table grants',async()=>{
  const insecure=await db.query(`select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='motoja_private' and c.relkind='r' and not c.relrowsecurity`);assert.equal(insecure.rows.length,0);
  assert.equal((await db.query(`select count(*) n from information_schema.role_table_grants where table_schema='motoja_private' and grantee in ('anon','authenticated','PUBLIC')`)).rows[0].n,0);
 });
 console.log(`\n${passes} database integration scenarios passed.`);
} finally {await db.close();}
