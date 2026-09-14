-- New isolated API. Existing profiles, trips, credentials and legacy records are preserved.
-- Only public invoker wrappers are exposed to PostgREST. Private definer functions
-- authenticate/authorize each operation; no client has table-level access here.
create schema if not exists motoja_private;
revoke all on schema motoja_private from public, anon, authenticated;
grant usage on schema motoja_private to authenticated, service_role;
alter default privileges in schema motoja_private revoke all on tables from public, anon, authenticated;
alter default privileges in schema motoja_private revoke execute on functions from public, anon, authenticated;

create table motoja_private.settings (
 id boolean primary key default true check(id), mode text not null default 'closed' check(mode in ('closed','pilot','live')),
 city text not null default 'Campo Verde', terms_version text not null default 'piloto-2026-09-v1',
 support_phone text not null default '', support_email text not null default '',
 base_cents integer not null default 400 check(base_cents between 0 and 50000),
 minimum_cents integer not null default 700 check(minimum_cents between 0 and 50000),
 per_km_cents integer not null default 170 check(per_km_cents between 0 and 10000),
 per_minute_cents integer not null default 0 check(per_minute_cents between 0 and 10000),
 routing_ready boolean not null default false, legal_ready boolean not null default false,
 insurance_ready boolean not null default false, legal_reference text not null default ''
);
insert into motoja_private.settings(id) values(true);
create table motoja_private.profiles (
 id uuid primary key references auth.users(id), full_name text not null check(length(full_name) between 2 and 100),
 phone text not null default '' check(length(phone)<=20), role text not null check(role in ('passenger','driver','admin')),
 account_status text not null default 'active' check(account_status in ('active','blocked')),
 is_tester boolean not null default false, terms_version text, terms_accepted_at timestamptz,
 created_at timestamptz not null default now()
);
create table motoja_private.drivers (
 user_id uuid primary key references motoja_private.profiles(id), approval_status text not null default 'pending' check(approval_status in ('pending','approved','rejected','suspended')),
 is_online boolean not null default false, model text not null default '', color text not null default '', plate text not null default '',
 pix_key text not null default '' check(length(pix_key)<=140), documents_valid_until date, review_note text,
 reviewed_at timestamptz, reviewed_by uuid references motoja_private.profiles(id)
);
create unique index mj_vehicle_plate_unique on motoja_private.drivers(plate) where plate<>'';
create table motoja_private.driver_locations (
 user_id uuid primary key references motoja_private.drivers(user_id), lat double precision not null,
 lng double precision not null, accuracy double precision not null check(accuracy between 0 and 150),
 recorded_at timestamptz not null, received_at timestamptz not null default now()
);
create index mj_locations_fresh on motoja_private.driver_locations(received_at);
create table motoja_private.quotes (
 id uuid primary key default gen_random_uuid(), passenger_id uuid not null references motoja_private.profiles(id),
 pickup jsonb not null, destination jsonb not null, distance_m integer not null check(distance_m between 100 and 80000),
 duration_s integer not null check(duration_s between 10 and 14400), price_cents integer not null check(price_cents between 0 and 500000),
 expires_at timestamptz not null default now()+interval '3 minutes', consumed_at timestamptz,
 provider text not null, created_at timestamptz not null default now()
);
create index mj_quotes_owner on motoja_private.quotes(passenger_id, created_at desc);
create table motoja_private.rides (
 id uuid primary key default gen_random_uuid(), passenger_id uuid not null references motoja_private.profiles(id),
 driver_id uuid references motoja_private.drivers(user_id), quote_id uuid not null unique references motoja_private.quotes(id),
 idempotency_key uuid not null, pickup jsonb not null, destination jsonb not null,
 distance_m integer not null, duration_s integer not null, price_cents integer not null,
 status text not null default 'requested' check(status in ('requested','accepted','arriving','arrived','in_progress','completed','cancelled')),
 payment_method text not null check(payment_method in ('pix','cash')),
 payment_status text not null default 'pending' check(payment_status in ('pending','confirmed','disputed')),
 pin text not null, pin_failures integer not null default 0, pin_locked_until timestamptz,
 requested_at timestamptz not null default now(), accepted_at timestamptz, arrived_at timestamptz,
 started_at timestamptz, completed_at timestamptz, cancelled_at timestamptz, cancellation_reason text,
 unique(passenger_id,idempotency_key), check(driver_id is null or driver_id<>passenger_id)
);
-- The database is the final arbiter even if two phones race or an HTTP response is lost.
create unique index mj_one_active_passenger on motoja_private.rides(passenger_id) where status not in ('completed','cancelled');
create unique index mj_one_active_driver on motoja_private.rides(driver_id) where status not in ('completed','cancelled') and driver_id is not null;
create index mj_rides_dispatch on motoja_private.rides(requested_at) where status='requested';
create index mj_rides_driver_history on motoja_private.rides(driver_id,requested_at desc);
create index mj_rides_passenger_history on motoja_private.rides(passenger_id,requested_at desc);
create table motoja_private.offers (
 id uuid primary key default gen_random_uuid(), ride_id uuid not null references motoja_private.rides(id),
 driver_id uuid not null references motoja_private.drivers(user_id),
 status text not null default 'pending' check(status in ('pending','accepted','declined','expired')),
 expires_at timestamptz not null default now()+interval '30 seconds', created_at timestamptz not null default now(),
 unique(ride_id,driver_id)
);
create unique index mj_one_pending_offer on motoja_private.offers(driver_id) where status='pending';
create unique index mj_one_offer_per_ride on motoja_private.offers(ride_id) where status='pending';
create table motoja_private.events (
 id bigint generated always as identity primary key, ride_id uuid references motoja_private.rides(id),
 actor_id uuid, event_type text not null, details jsonb not null default '{}',
 occurred_at timestamptz not null default clock_timestamp(), previous_hash text, event_hash text not null
);
create index mj_event_ride on motoja_private.events(ride_id,id desc);
create table motoja_private.documents (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references motoja_private.drivers(user_id),
 kind text not null check(kind in ('identity','license','vehicle','permit','insurance')),
 object_path text not null unique, expires_on date not null, status text not null default 'pending' check(status in ('pending','approved','rejected')),
 created_at timestamptz not null default now()
);
create index mj_documents_owner on motoja_private.documents(user_id,kind);
create table motoja_private.ratings (
 ride_id uuid not null references motoja_private.rides(id), author_id uuid not null references motoja_private.profiles(id),
 stars integer not null check(stars between 1 and 5), comment text not null default '' check(length(comment)<=500),
 created_at timestamptz not null default now(), primary key(ride_id,author_id)
);
create table motoja_private.incidents (
 id uuid primary key default gen_random_uuid(), ride_id uuid references motoja_private.rides(id),
 reporter_id uuid not null references motoja_private.profiles(id),
 category text not null check(category in ('safety','payment','behavior','support','privacy','delete_account')),
 description text not null check(length(description) between 10 and 2000),
 status text not null default 'open' check(status in ('open','reviewing','resolved')), created_at timestamptz not null default now(),
 resolution text, resolved_by uuid references motoja_private.profiles(id), resolved_at timestamptz
);
create index mj_incident_queue on motoja_private.incidents(status,created_at desc);
create index mj_incident_reporter on motoja_private.incidents(reporter_id,created_at desc);
create table motoja_private.shares (
 token_hash text primary key, ride_id uuid not null references motoja_private.rides(id),
 created_by uuid not null references motoja_private.profiles(id), expires_at timestamptz not null, revoked_at timestamptz
);
create index mj_share_ride on motoja_private.shares(ride_id);
create table motoja_private.rate_limits (
 bucket text primary key, started_at timestamptz not null default clock_timestamp(), hits integer not null default 1
);
create table public.mj_sync (
 user_id uuid primary key references auth.users(id), revision bigint not null default 1, updated_at timestamptz not null default now()
);
alter table public.mj_sync enable row level security;
revoke all on public.mj_sync from public, anon, authenticated;
grant select on public.mj_sync to authenticated;
create policy mj_sync_own on public.mj_sync for select to authenticated using(user_id=(select auth.uid()));
do $$ declare t text; begin
 for t in select tablename from pg_tables where schemaname='motoja_private' loop
  execute format('alter table motoja_private.%I enable row level security',t);
 end loop;
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  alter publication supabase_realtime add table public.mj_sync;
 end if;
end $$;

create function motoja_private.in_area(point jsonb) returns boolean language sql immutable set search_path='' as $$
 select jsonb_typeof(point->'lat')='number' and jsonb_typeof(point->'lng')='number'
 and (point->>'lat')::double precision between -15.68 and -15.43
 and (point->>'lng')::double precision between -55.32 and -55.04
 and length(coalesce(point->>'label','')) between 3 and 250;
$$;
create function motoja_private.metres(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision language sql immutable set search_path='' as $$
 select 6371000*2*asin(least(1,sqrt(power(sin(radians(lat2-lat1)/2),2)+cos(radians(lat1))*cos(radians(lat2))*power(sin(radians(lng2-lng1)/2),2))));
$$;
create function motoja_private.limit_request(key text, max_hits integer, seconds integer) returns void language plpgsql set search_path='' as $$
 declare v_hits integer;
 begin
 insert into motoja_private.rate_limits(bucket) values(key)
 on conflict(bucket) do update set
 hits=case when motoja_private.rate_limits.started_at < clock_timestamp()-make_interval(secs=>seconds) then 1 else motoja_private.rate_limits.hits+1 end,
 started_at=case when motoja_private.rate_limits.started_at < clock_timestamp()-make_interval(secs=>seconds) then clock_timestamp() else motoja_private.rate_limits.started_at end
 returning rate_limits.hits into v_hits;
 if v_hits>max_hits then raise exception 'Muitas tentativas. Aguarde um minuto e tente novamente.'; end if;
 end $$;
create function motoja_private.audit(ride uuid, event text, details jsonb default '{}') returns void language plpgsql set search_path='' as $$
 declare previous text; stamp timestamptz:=clock_timestamp();
 begin
 -- Serialize each chain. This detects changes to persisted event content; it does not replace independent backups.
 perform pg_advisory_xact_lock(hashtextextended(coalesce(ride::text,'admin-audit'),10));
 select event_hash into previous from motoja_private.events where ride_id is not distinct from ride order by id desc limit 1;
 insert into motoja_private.events(ride_id,actor_id,event_type,details,occurred_at,previous_hash,event_hash)
 values(ride,auth.uid(),event,details,stamp,previous,encode(sha256(convert_to(concat_ws('|',previous,ride::text,auth.uid()::text,event,details::text,stamp::text),'UTF8')),'hex'));
 insert into public.mj_sync(user_id)
 select distinct id from motoja_private.profiles where role='admin' or id=auth.uid() or id in
 (select passenger_id from motoja_private.rides where id=ride union select driver_id from motoja_private.rides where id=ride)
 on conflict(user_id) do update set revision=mj_sync.revision+1,updated_at=now();
 end $$;

create function motoja_private.actor() returns motoja_private.profiles language plpgsql set search_path='' as $$
 declare result motoja_private.profiles; account auth.users;
 begin
 if auth.uid() is null then raise exception 'Entre na sua conta para continuar.'; end if;
 select * into account from auth.users where id=auth.uid();
 if account.id is null or (account.email_confirmed_at is null and account.phone_confirmed_at is null) then raise exception 'Confirme sua conta antes de continuar.'; end if;
 insert into motoja_private.profiles(id,full_name,phone,role)
 values(account.id, left(coalesce(nullif(trim(account.raw_user_meta_data->>'full_name'),''),'Pessoa usuária'),100),
 left(coalesce(account.raw_user_meta_data->>'phone',''),20),case when account.raw_user_meta_data->>'requested_role'='driver' then 'driver' else 'passenger' end)
 on conflict(id) do nothing;
 select * into result from motoja_private.profiles where id=auth.uid();
 if result.account_status<>'active' then raise exception 'Conta suspensa. Entre em contato com o suporte.'; end if;
 if result.role='driver' then insert into motoja_private.drivers(user_id) values(result.id) on conflict do nothing; end if;
 return result;
 end $$;

create function motoja_private.command(action text, payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
 declare person motoja_private.profiles; trip motoja_private.rides; quote motoja_private.quotes;
 config motoja_private.settings; driver motoja_private.drivers; offer motoja_private.offers; item uuid;
 result jsonb; target uuid; secret text; valid_until date; status_value text;
 begin
 if payload is null or jsonb_typeof(payload)<>'object' or octet_length(payload::text)>16000 then raise exception 'Dados inválidos.'; end if;
 person:=motoja_private.actor();
 select * into config from motoja_private.settings;
 if action='snapshot' then return motoja_private.snapshot(person); end if;
 perform motoja_private.limit_request(person.id::text||':'||action,case when action='location' then 30 else 15 end,60);

 if action='accept_terms' then
  if payload->>'version' is distinct from config.terms_version then raise exception 'Os termos foram atualizados. Leia a versão atual.'; end if;
  update motoja_private.profiles set terms_version=config.terms_version,terms_accepted_at=now() where id=person.id;
  perform motoja_private.audit(null,'terms_accepted',jsonb_build_object('version',config.terms_version));
  return jsonb_build_object('ok',true);
 elsif action='update_profile' then
  if length(trim(coalesce(payload->>'full_name',''))) not between 3 and 100 or length(coalesce(payload->>'phone','')) not between 10 and 20 then raise exception 'Confira nome e celular com DDD.'; end if;
  update motoja_private.profiles set full_name=trim(payload->>'full_name'),phone=payload->>'phone' where id=person.id;
  return jsonb_build_object('ok',true);
 elsif action='save_driver' then
  if person.role<>'driver' then raise exception 'Cadastro exclusivo para motociclistas.'; end if;
  if exists(select 1 from motoja_private.rides where driver_id=person.id and status not in ('completed','cancelled')) then raise exception 'Conclua a corrida antes de alterar o veículo.'; end if;
  if length(trim(coalesce(payload->>'model',''))) not between 3 and 100 or length(trim(coalesce(payload->>'color',''))) not between 3 and 40
   or coalesce(payload->>'plate','')!~'^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$' or length(coalesce(payload->>'pix_key',''))>140 then raise exception 'Confira modelo, cor, placa e chave Pix.'; end if;
  update motoja_private.drivers set model=trim(payload->>'model'),color=trim(payload->>'color'),plate=payload->>'plate',pix_key=coalesce(payload->>'pix_key',''),approval_status='pending',is_online=false where user_id=person.id;
  perform motoja_private.audit(null,'driver_profile_submitted'); return jsonb_build_object('ok',true);
 elsif action='submit_document' then
  if person.role<>'driver' then raise exception 'Cadastro exclusivo para motociclistas.'; end if;
  if payload->>'kind' not in ('identity','license','vehicle','permit','insurance') then raise exception 'Tipo de documento inválido.'; end if;
  valid_until:=(payload->>'expires_on')::date;
  if valid_until is null or valid_until<current_date or valid_until>current_date+interval '15 years' then raise exception 'Confira a validade do documento.'; end if;
  if not exists(select 1 from storage.objects where bucket_id='motoja-documents' and name=payload->>'object_path' and split_part(name,'/',1)=person.id::text) then raise exception 'Documento não encontrado ou sem permissão.'; end if;
  if exists(select 1 from motoja_private.rides where driver_id=person.id and status not in ('completed','cancelled')) then raise exception 'Envie documentos após concluir a corrida.'; end if;
  insert into motoja_private.documents(user_id,kind,object_path,expires_on) values(person.id,payload->>'kind',payload->>'object_path',valid_until);
  update motoja_private.drivers set approval_status='pending',is_online=false where user_id=person.id;
  perform motoja_private.audit(null,'document_submitted',jsonb_build_object('kind',payload->>'kind')); return jsonb_build_object('ok',true);
 elsif action='location' then
  if person.role<>'driver' then raise exception 'Localização exclusiva de motociclista.'; end if;
  if not coalesce(motoja_private.in_area(jsonb_build_object('lat',payload->'lat','lng',payload->'lng','label','localização')),false) then raise exception 'Localização fora da área de atendimento.'; end if;
  if (payload->>'accuracy')::float8 is null or (payload->>'accuracy')::float8 not between 0 and 150
    or (payload->>'recorded_at')::timestamptz is null or (payload->>'recorded_at')::timestamptz not between now()-interval '30 seconds' and now()+interval '10 seconds' then raise exception 'GPS impreciso ou desatualizado.'; end if;
  insert into motoja_private.driver_locations(user_id,lat,lng,accuracy,recorded_at)
  values(person.id,(payload->>'lat')::float8,(payload->>'lng')::float8,(payload->>'accuracy')::float8,(payload->>'recorded_at')::timestamptz)
  on conflict(user_id) do update set lat=excluded.lat,lng=excluded.lng,accuracy=excluded.accuracy,recorded_at=excluded.recorded_at,received_at=now()
  where excluded.recorded_at>=driver_locations.recorded_at;
  return jsonb_build_object('ok',true);
 elsif action='set_online' then
  if person.role<>'driver' then raise exception 'Cadastro exclusivo para motociclistas.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(person.id::text,20));
  if coalesce((payload->>'online')::boolean,false) then
   perform motoja_private.check_operation(person);
   select * into driver from motoja_private.drivers where user_id=person.id;
   if driver.approval_status<>'approved' or driver.documents_valid_until is null or driver.documents_valid_until<current_date then raise exception 'Aguarde a aprovação dos documentos e do veículo.'; end if;
   if not exists(select 1 from motoja_private.driver_locations where user_id=person.id and received_at>now()-interval '30 seconds') then raise exception 'Ative a localização antes de ficar disponível.'; end if;
  elsif exists(select 1 from motoja_private.rides where driver_id=person.id and status not in ('completed','cancelled')) then raise exception 'Conclua ou cancele a corrida antes de ficar indisponível.';
  end if;
  update motoja_private.drivers set is_online=coalesce((payload->>'online')::boolean,false) where user_id=person.id;
  if not coalesce((payload->>'online')::boolean,false) then update motoja_private.offers set status='declined' where driver_id=person.id and status='pending'; end if;
  perform motoja_private.dispatch(); return jsonb_build_object('ok',true);
 elsif action='request_ride' then
  if person.role not in ('passenger','admin') then raise exception 'Use uma conta de passageiro para pedir corridas.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(person.id::text,20));
  -- A repeat of a successful command stays successful even after a quote has expired.
  select * into trip from motoja_private.rides where passenger_id=person.id and idempotency_key=(payload->>'idempotency_key')::uuid;
  if found then return motoja_private.ride_json(trip,person.id); end if;
  perform motoja_private.check_operation(person);
  if payload->>'payment_method' is null or payload->>'payment_method' not in ('pix','cash') then raise exception 'Forma de pagamento inválida.'; end if;
  if exists(select 1 from motoja_private.rides where passenger_id=person.id and status not in ('completed','cancelled')) then raise exception 'Você já tem uma corrida em andamento.'; end if;
  select * into quote from motoja_private.quotes where id=(payload->>'quote_id')::uuid and passenger_id=person.id for update;
  if not found or quote.expires_at<=now() or quote.consumed_at is not null then raise exception 'O valor expirou. Calcule a corrida novamente.'; end if;
  insert into motoja_private.rides(passenger_id,quote_id,idempotency_key,pickup,destination,distance_m,duration_s,price_cents,payment_method,pin)
  values(person.id,quote.id,(payload->>'idempotency_key')::uuid,quote.pickup,quote.destination,quote.distance_m,quote.duration_s,quote.price_cents,payload->>'payment_method',
    lpad(((('x'||substr(replace(gen_random_uuid()::text,'-',''),1,8))::bit(32)::bigint)%10000)::text,4,'0')) returning * into trip;
  update motoja_private.quotes set consumed_at=now() where id=quote.id;
  perform motoja_private.audit(trip.id,'requested'); perform motoja_private.dispatch(); return motoja_private.ride_json(trip,person.id);
 elsif action='respond_offer' then
  if person.role<>'driver' then raise exception 'Acesso exclusivo de motociclista.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(person.id::text,20));
  select * into offer from motoja_private.offers where id=(payload->>'offer_id')::uuid and driver_id=person.id for update;
  if not found then raise exception 'Oferta não encontrada.'; end if;
  select * into trip from motoja_private.rides where id=offer.ride_id for update;
  if offer.status='accepted' and trip.driver_id=person.id then return motoja_private.ride_json(trip,person.id); end if;
  if offer.status<>'pending' or offer.expires_at<=now() or trip.status<>'requested' then raise exception 'A chamada não está mais disponível.'; end if;
  if not coalesce((payload->>'accept')::boolean,false) then update motoja_private.offers set status='declined' where id=offer.id; perform motoja_private.dispatch(); return jsonb_build_object('ok',true); end if;
  perform motoja_private.check_operation(person);
  select * into driver from motoja_private.drivers where user_id=person.id;
  if driver.approval_status<>'approved' or not driver.is_online or driver.documents_valid_until is null or driver.documents_valid_until<current_date then raise exception 'Motociclista indisponível ou com documentos pendentes.'; end if;
  if not exists(select 1 from motoja_private.driver_locations where user_id=person.id and received_at>now()-interval '45 seconds') then raise exception 'Sua localização está desatualizada.'; end if;
  if exists(select 1 from motoja_private.rides where driver_id=person.id and status not in ('completed','cancelled')) then raise exception 'Você já tem uma corrida em andamento.'; end if;
  update motoja_private.rides set driver_id=person.id,status='accepted',accepted_at=now() where id=trip.id returning * into trip;
  update motoja_private.offers set status='accepted' where id=offer.id;
  perform motoja_private.audit(trip.id,'accepted'); return motoja_private.ride_json(trip,person.id);
 elsif action in ('arriving','arrived','start','complete','cancel','confirm_payment','dispute_payment','rate','share','revoke_share') then
  -- One lock serializes cancellation, boarding, completion and payment for this trip.
  select * into trip from motoja_private.rides where id=(payload->>'ride_id')::uuid for update;
  if not found or (person.id<>trip.passenger_id and person.id is distinct from trip.driver_id and person.role<>'admin') then raise exception 'Corrida não encontrada.'; end if;
  if person.role='admin' and person.id not in (trip.passenger_id,coalesce(trip.driver_id,trip.passenger_id)) then
   perform motoja_private.require_admin();
   if action<>'cancel' then raise exception 'Ação exclusiva dos participantes da corrida.'; end if;
  end if;
  if action in ('arriving','arrived','start','complete','confirm_payment') and person.id is distinct from trip.driver_id then raise exception 'Ação exclusiva do motociclista desta corrida.'; end if;
  if action='arriving' then
   if trip.status='arriving' then return motoja_private.ride_json(trip,person.id); end if;
   if trip.status<>'accepted' then raise exception 'Etapa de corrida inválida.'; end if;
   update motoja_private.rides set status='arriving' where id=trip.id;
  elsif action='arrived' then
   if trip.status='arrived' then return motoja_private.ride_json(trip,person.id); end if;
   if trip.status not in ('accepted','arriving') then raise exception 'Etapa de corrida inválida.'; end if;
   if not exists(select 1 from motoja_private.driver_locations l where l.user_id=person.id and l.recorded_at>now()-interval '45 seconds' and motoja_private.metres(l.lat,l.lng,(trip.pickup->>'lat')::float8,(trip.pickup->>'lng')::float8)<=300) then raise exception 'Confirme sua chegada perto do ponto de embarque com GPS atualizado.'; end if;
   update motoja_private.rides set status='arrived',arrived_at=now() where id=trip.id;
  elsif action='start' then
   if trip.status='in_progress' then return motoja_private.ride_json(trip,person.id); end if;
   if trip.status<>'arrived' then raise exception 'Confirme a chegada antes do embarque.'; end if;
   select * into driver from motoja_private.drivers where user_id=person.id;
   if driver.approval_status<>'approved' or driver.documents_valid_until is null or driver.documents_valid_until<current_date then raise exception 'Motociclista com aprovação ou documentos pendentes. Cancele a corrida e procure o suporte.'; end if;
   if not exists(select 1 from motoja_private.driver_locations l where l.user_id=person.id and l.recorded_at>now()-interval '45 seconds' and motoja_private.metres(l.lat,l.lng,(trip.pickup->>'lat')::float8,(trip.pickup->>'lng')::float8)<=300) then raise exception 'Atualize o GPS perto do ponto de embarque antes de iniciar.'; end if;
   if trip.pin_locked_until>now() then raise exception 'PIN temporariamente bloqueado. Aguarde cinco minutos.'; end if;
   if coalesce(payload->>'pin','')<>trip.pin then
    update motoja_private.rides set pin_failures=pin_failures+1,pin_locked_until=case when (pin_failures+1)%5=0 then now()+interval '5 minutes' else pin_locked_until end where id=trip.id;
    perform motoja_private.audit(trip.id,'pin_rejected');
    -- Return instead of RAISE: the failed-attempt counter must COMMIT.
    return jsonb_build_object('error','PIN incorreto. Confira com o passageiro.');
   end if;
   if coalesce((payload->>'helmets_checked')::boolean,false)=false then raise exception 'Confirme o uso dos capacetes antes de iniciar.'; end if;
   update motoja_private.rides set status='in_progress',started_at=now() where id=trip.id;
  elsif action='complete' then
   if trip.status='completed' then return motoja_private.ride_json(trip,person.id); end if;
   if trip.status<>'in_progress' then raise exception 'A viagem ainda não foi iniciada.'; end if;
   update motoja_private.rides set status='completed',completed_at=now() where id=trip.id;
   update motoja_private.shares set revoked_at=now() where ride_id=trip.id;
  elsif action='cancel' then
   if trip.status='cancelled' then return motoja_private.ride_json(trip,person.id); end if;
   if trip.status not in ('requested','accepted','arriving','arrived') then raise exception 'A corrida já começou. Use a central de segurança para registrar um problema.'; end if;
   if length(trim(coalesce(payload->>'reason',''))) not between 3 and 300 then raise exception 'Informe o motivo do cancelamento.'; end if;
   update motoja_private.rides set status='cancelled',cancelled_at=now(),cancellation_reason=payload->>'reason' where id=trip.id;
   update motoja_private.offers set status='expired' where ride_id=trip.id and status='pending';
   update motoja_private.shares set revoked_at=now() where ride_id=trip.id;
  elsif action='confirm_payment' then
   if trip.status<>'completed' or trip.payment_status='disputed' then raise exception 'Confirmação de pagamento indisponível.'; end if;
   if trip.payment_status='confirmed' then return motoja_private.ride_json(trip,person.id); end if;
   update motoja_private.rides set payment_status='confirmed' where id=trip.id;
  elsif action='dispute_payment' then
   if trip.status<>'completed' then raise exception 'A corrida ainda não foi concluída.'; end if;
   update motoja_private.rides set payment_status='disputed' where id=trip.id;
  elsif action='rate' then
   if trip.status<>'completed' then raise exception 'Você só pode avaliar uma corrida concluída.'; end if;
   insert into motoja_private.ratings(ride_id,author_id,stars,comment) values(trip.id,person.id,(payload->>'stars')::integer,coalesce(payload->>'comment','')) on conflict(ride_id,author_id) do nothing;
  elsif action='share' then
   if trip.status in ('completed','cancelled') then raise exception 'O compartilhamento está disponível durante a corrida.'; end if;
   secret:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
   insert into motoja_private.shares(token_hash,ride_id,created_by,expires_at) values(encode(sha256(convert_to(secret,'UTF8')),'hex'),trip.id,person.id,now()+interval '2 hours');
   perform motoja_private.audit(trip.id,'share_created'); return jsonb_build_object('token',secret);
  elsif action='revoke_share' then
   update motoja_private.shares set revoked_at=now() where ride_id=trip.id and created_by=person.id;
  end if;
  perform motoja_private.audit(trip.id,action,case when action='cancel' then jsonb_build_object('reason',payload->>'reason') else '{}'::jsonb end);
  select * into trip from motoja_private.rides where id=trip.id; return motoja_private.ride_json(trip,person.id);
 elsif action='incident' then
  target:=nullif(payload->>'ride_id','')::uuid;
  if target is not null and not exists(select 1 from motoja_private.rides where id=target and person.id in (passenger_id,driver_id)) then raise exception 'Corrida não encontrada.'; end if;
  insert into motoja_private.incidents(ride_id,reporter_id,category,description) values(target,person.id,payload->>'category',trim(payload->>'description')) returning id into item;
  perform motoja_private.audit(target,'incident_created',jsonb_build_object('incident_id',item)); return jsonb_build_object('id',item);
 elsif action='review_driver' then
  perform motoja_private.require_admin(); target:=(payload->>'driver_id')::uuid;
  status_value:=payload->>'status';
  if status_value is null or status_value not in ('approved','rejected','suspended') then raise exception 'Situação inválida.'; end if;
  if length(trim(coalesce(payload->>'note',''))) not between 10 and 1000 then raise exception 'Registre a justificativa da análise.'; end if;
  select * into driver from motoja_private.drivers where user_id=target for update;
  if not found then raise exception 'Motociclista não encontrado.'; end if;
  if status_value='approved' then
   if length(driver.model)<3 or driver.plate!~'^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$' then raise exception 'Cadastro da moto incompleto.'; end if;
   if (select count(distinct kind) from motoja_private.documents where user_id=target and status='approved' and expires_on>=current_date)<5 then raise exception 'Revise e aprove identidade, CNH, veículo, autorização e seguro antes de liberar.'; end if;
   select min(expiry) into valid_until from (select kind,max(expires_on) expiry from motoja_private.documents where user_id=target and status='approved' and expires_on>=current_date group by kind) d;
  end if;
  update motoja_private.drivers set approval_status=status_value,is_online=false,documents_valid_until=valid_until,review_note=payload->>'note',reviewed_at=now(),reviewed_by=person.id where user_id=target;
  perform motoja_private.audit(null,'driver_reviewed',jsonb_build_object('driver_id',target,'status',status_value,'note',payload->>'note')); return jsonb_build_object('ok',true);
 elsif action='review_document' then
  perform motoja_private.require_admin();
  if payload->>'status' is null or payload->>'status' not in ('approved','rejected') then raise exception 'Situação inválida.'; end if;
  update motoja_private.documents set status=payload->>'status' where id=(payload->>'document_id')::uuid returning user_id into target;
  if target is null then raise exception 'Documento não encontrado.'; end if;
  update motoja_private.drivers set is_online=false,approval_status='pending' where user_id=target;
  perform motoja_private.audit(null,'document_reviewed',jsonb_build_object('document_id',payload->>'document_id','status',payload->>'status')); return jsonb_build_object('ok',true);
 elsif action='resolve_incident' then
  perform motoja_private.require_admin();
  if length(trim(coalesce(payload->>'resolution',''))) not between 10 and 2000 then raise exception 'Registre como o chamado foi atendido.'; end if;
  update motoja_private.incidents set status='resolved',resolution=payload->>'resolution',resolved_by=person.id,resolved_at=now() where id=(payload->>'incident_id')::uuid returning id into item;
  if item is null then raise exception 'Chamado não encontrado.'; end if;
  perform motoja_private.audit(null,'incident_resolved',jsonb_build_object('incident_id',item)); return jsonb_build_object('ok',true);
 elsif action='set_tester' then
  perform motoja_private.require_admin();
  update motoja_private.profiles set is_tester=coalesce((payload->>'enabled')::boolean,false) where id=(payload->>'user_id')::uuid returning id into target;
  if target is null then raise exception 'Conta não encontrada.'; end if;
  perform motoja_private.audit(null,'pilot_access_changed',jsonb_build_object('user_id',target,'enabled',payload->'enabled')); return jsonb_build_object('ok',true);
 elsif action='set_account_status' then
  perform motoja_private.require_admin(); target:=(payload->>'user_id')::uuid;
  if target=person.id or payload->>'status' is null or payload->>'status' not in ('active','blocked') then raise exception 'Alteração inválida.'; end if;
  if length(trim(coalesce(payload->>'reason','')))<10 then raise exception 'Registre a justificativa.'; end if;
  update motoja_private.profiles set account_status=payload->>'status' where id=target and role<>'admin';
  update motoja_private.drivers set is_online=false where user_id=target;
  perform motoja_private.audit(null,'account_status_changed',jsonb_build_object('user_id',target,'status',payload->>'status','reason',payload->>'reason')); return jsonb_build_object('ok',true);
 elsif action='settings' then
  perform motoja_private.require_admin();
  -- Public operation is not enabled through an ordinary switch. Its external review is a separate release gate.
  if payload->>'mode' is null or payload->>'mode' not in ('closed','pilot') then raise exception 'Liberação pública exige revisão operacional antes do lançamento.'; end if;
  update motoja_private.settings set mode=payload->>'mode',support_phone=left(coalesce(payload->>'support_phone',''),20),support_email=left(coalesce(payload->>'support_email',''),254),
   base_cents=(payload->>'base_cents')::integer,minimum_cents=(payload->>'minimum_cents')::integer,per_km_cents=(payload->>'per_km_cents')::integer,per_minute_cents=(payload->>'per_minute_cents')::integer;
  perform motoja_private.audit(null,'settings_updated',payload); return jsonb_build_object('ok',true);
 end if;
 raise exception 'Operação não reconhecida.';
 end $$;

create function motoja_private.public_config() returns jsonb language sql stable security definer set search_path='' as $$
 select to_jsonb(s)-array['id','legal_reference'] from motoja_private.settings s;
$$;
create function motoja_private.shared_ride(token text) returns jsonb language plpgsql stable security definer set search_path='' as $$
 declare trip motoja_private.rides;
 begin
 if token is null or length(token)<>64 then return null; end if;
 select r.* into trip from motoja_private.shares s join motoja_private.rides r on r.id=s.ride_id
 where s.token_hash=encode(sha256(convert_to(token,'UTF8')),'hex') and s.revoked_at is null and s.expires_at>now() and r.status not in ('completed','cancelled');
 if not found then return null; end if;
 return jsonb_build_object('status',trip.status,'requested_at',trip.requested_at,'destination',trip.destination,
 'driver_name',(select split_part(full_name,' ',1) from motoja_private.profiles where id=trip.driver_id),
 'vehicle',(select jsonb_build_object('model',model,'color',color,'plate',plate) from motoja_private.drivers where user_id=trip.driver_id),
 'location',(select jsonb_build_object('lat',lat,'lng',lng,'recorded_at',recorded_at) from motoja_private.driver_locations where user_id=trip.driver_id));
 end $$;
create function motoja_private.store_quote(user_id uuid, route jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
 declare person motoja_private.profiles; config motoja_private.settings; result motoja_private.quotes; metres integer; seconds integer;
 begin
 -- This function is executable only by service_role, after the edge function verifies the user's JWT.
 select * into person from motoja_private.profiles where id=user_id and account_status='active';
 if not found then raise exception 'Conta indisponível.'; end if;
 if not coalesce(motoja_private.in_area(route->'pickup'),false) or not coalesce(motoja_private.in_area(route->'destination'),false) then raise exception 'Origem ou destino fora da área de atendimento.'; end if;
 metres:=(route->>'distance_m')::integer; seconds:=(route->>'duration_s')::integer;
 select * into config from motoja_private.settings;
 insert into motoja_private.quotes(passenger_id,pickup,destination,distance_m,duration_s,price_cents,provider)
 values(user_id,route->'pickup',route->'destination',metres,seconds,greatest(config.minimum_cents,round(config.base_cents+metres*config.per_km_cents/1000.0+seconds*config.per_minute_cents/60.0)::integer),route->>'provider') returning * into result;
 return to_jsonb(result)-array['passenger_id','consumed_at','provider','created_at'];
 end $$;
create function motoja_private.maps_access(user_id uuid) returns void language plpgsql security definer set search_path='' as $$
 begin
 if not exists(select 1 from motoja_private.profiles where id=user_id and account_status='active') then raise exception 'Conta indisponível.'; end if;
 perform motoja_private.limit_request(user_id::text||':maps',12,60);
 end $$;

create function public.mj_command(action text,payload jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$ select motoja_private.command(action,payload); $$;
create function public.mj_public_config() returns jsonb language sql security invoker set search_path='' as $$ select motoja_private.public_config(); $$;
create function public.mj_shared_ride(token text) returns jsonb language sql security invoker set search_path='' as $$ select motoja_private.shared_ride(token); $$;
create function public.mj_store_quote(user_id uuid,route jsonb) returns jsonb language sql security invoker set search_path='' as $$ select motoja_private.store_quote(user_id,route); $$;
create function public.mj_maps_access(user_id uuid) returns void language sql security invoker set search_path='' as $$ select motoja_private.maps_access(user_id); $$;
create function motoja_private.is_admin() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from motoja_private.profiles where id=auth.uid() and role='admin' and account_status='active');
$$;
create function motoja_private.require_admin() returns void language plpgsql set search_path='' as $$
 begin
 if not motoja_private.is_admin() then raise exception 'Acesso restrito à administração.'; end if;
 if coalesce(auth.jwt()->>'aal','')<>'aal2' then raise exception 'Confirme a autenticação em duas etapas para esta ação.'; end if;
 end $$;
create function motoja_private.check_operation(person motoja_private.profiles) returns void language plpgsql set search_path='' as $$
 declare config motoja_private.settings;
 begin
 select * into config from motoja_private.settings;
 if config.mode='closed' then raise exception 'Corridas ainda não liberadas. O MotoJá está em preparação.'; end if;
 if config.mode='pilot' and not person.is_tester then raise exception 'O piloto está disponível apenas para participantes convidados.'; end if;
 if config.mode='live' and not(config.legal_ready and config.insurance_ready and config.routing_ready and length(config.legal_reference)>10 and config.support_phone<>'') then raise exception 'A operação ainda não está liberada.'; end if;
 if person.terms_version is distinct from config.terms_version then raise exception 'Leia e aceite os termos atuais antes de continuar.'; end if;
 end $$;

create function motoja_private.ride_json(trip motoja_private.rides, viewer uuid) returns jsonb language plpgsql stable set search_path='' as $$
 declare result jsonb; other_id uuid;
 begin
 result:=to_jsonb(trip)-array['pin','pin_failures','pin_locked_until','idempotency_key','quote_id'];
 if trip.passenger_id=viewer and trip.status not in ('completed','cancelled') then result:=result||jsonb_build_object('pin',trip.pin); end if;
 if viewer in (trip.passenger_id,trip.driver_id) then
  other_id:=case when viewer=trip.passenger_id then trip.driver_id else trip.passenger_id end;
  result:=result||jsonb_build_object('counterparty',(select jsonb_build_object('full_name',full_name,'phone',case when trip.status not in ('completed','cancelled') then phone else '' end) from motoja_private.profiles where id=other_id));
  result:=result||jsonb_build_object('vehicle',(select jsonb_build_object('model',model,'plate',plate,'color',color,'pix_key',case when trip.passenger_id=viewer then pix_key else '' end) from motoja_private.drivers where user_id=trip.driver_id));
  if trip.status not in ('completed','cancelled') then result:=result||jsonb_build_object('location',(select jsonb_build_object('lat',lat,'lng',lng,'recorded_at',recorded_at) from motoja_private.driver_locations where user_id=trip.driver_id)); end if;
  result:=result||jsonb_build_object('my_rating',(select stars from motoja_private.ratings where ride_id=trip.id and author_id=viewer));
 end if;
 return result;
 end $$;

create function motoja_private.dispatch() returns void language plpgsql set search_path='' as $$
 declare trip motoja_private.rides; chosen uuid;
 begin
 if not pg_try_advisory_xact_lock(902104) then return; end if;
 update motoja_private.offers set status='expired' where status='pending' and expires_at<=now();
 update motoja_private.drivers d set is_online=false where is_online and not exists(select 1 from motoja_private.driver_locations l where l.user_id=d.user_id and l.received_at>now()-interval '45 seconds');
 for trip in select * from motoja_private.rides where status='requested' and requested_at<now()-interval '5 minutes' for update loop
  update motoja_private.rides set status='cancelled',cancelled_at=now(),cancellation_reason='Nenhum motociclista disponível no prazo de busca.' where id=trip.id;
  update motoja_private.offers set status='expired' where ride_id=trip.id and status='pending';
  perform motoja_private.audit(trip.id,'search_expired');
 end loop;
 for trip in select * from motoja_private.rides r where status='requested' and not exists(select 1 from motoja_private.offers o where o.ride_id=r.id and o.status='pending') order by requested_at limit 20 loop
  select d.user_id into chosen from motoja_private.drivers d join motoja_private.driver_locations l on l.user_id=d.user_id join motoja_private.profiles p on p.id=d.user_id cross join motoja_private.settings s
  where d.is_online and d.approval_status='approved' and d.documents_valid_until>=current_date and p.account_status='active' and p.terms_version=s.terms_version
   and (s.mode='live' or (s.mode='pilot' and p.is_tester)) and d.user_id<>trip.passenger_id
   and l.received_at>now()-interval '45 seconds' and l.recorded_at>now()-interval '45 seconds'
   and not exists(select 1 from motoja_private.rides r where r.driver_id=d.user_id and r.status not in ('completed','cancelled'))
   and not exists(select 1 from motoja_private.offers o where (o.driver_id=d.user_id and o.status='pending') or (o.driver_id=d.user_id and o.ride_id=trip.id))
   and motoja_private.metres(l.lat,l.lng,(trip.pickup->>'lat')::float8,(trip.pickup->>'lng')::float8)<7000
  order by motoja_private.metres(l.lat,l.lng,(trip.pickup->>'lat')::float8,(trip.pickup->>'lng')::float8),d.user_id limit 1;
  if chosen is not null then
   insert into motoja_private.offers(ride_id,driver_id) values(trip.id,chosen);
   insert into public.mj_sync(user_id) values(chosen) on conflict(user_id) do update set revision=mj_sync.revision+1,updated_at=now();
  end if;
 end loop;
 end $$;

create function motoja_private.snapshot(person motoja_private.profiles) returns jsonb language plpgsql set search_path='' as $$
 declare result jsonb;
 begin
 perform motoja_private.dispatch();
 result:=jsonb_build_object('profile',to_jsonb(person),'settings',(select to_jsonb(s)-array['id','legal_reference'] from motoja_private.settings s),
 'driver',(select to_jsonb(d) from motoja_private.drivers d where user_id=person.id),
 'active_ride',(select motoja_private.ride_json(r,person.id) from motoja_private.rides r where person.id in (r.passenger_id,r.driver_id) and status not in ('completed','cancelled') order by requested_at desc limit 1),
 'rides',coalesce((select jsonb_agg(motoja_private.ride_json(r,person.id)) from (select * from motoja_private.rides where person.id in (passenger_id,driver_id) order by requested_at desc limit 30) r),'[]'),
 'offer',(select jsonb_build_object('id',o.id,'ride_id',r.id,'price_cents',r.price_cents,'distance_m',r.distance_m,'duration_s',r.duration_s,'pickup_lat',round((r.pickup->>'lat')::numeric,3),'pickup_lng',round((r.pickup->>'lng')::numeric,3),'expires_at',o.expires_at) from motoja_private.offers o join motoja_private.rides r on r.id=o.ride_id where o.driver_id=person.id and o.status='pending' and o.expires_at>now() and r.status='requested' limit 1),
 'incidents',coalesce((select jsonb_agg(to_jsonb(i)-array['reporter_id','resolved_by']) from (select * from motoja_private.incidents where reporter_id=person.id order by created_at desc limit 30) i),'[]'),
 'documents',coalesce((select jsonb_agg(to_jsonb(d)) from motoja_private.documents d where user_id=person.id),'[]'));
 if person.role='admin' then
  perform motoja_private.require_admin();
  result:=result||jsonb_build_object('admin',jsonb_build_object(
   'drivers',coalesce((select jsonb_agg(to_jsonb(d)||jsonb_build_object('full_name',p.full_name,'documents',coalesce((select jsonb_agg(to_jsonb(doc)) from motoja_private.documents doc where doc.user_id=d.user_id),'[]'))) from motoja_private.drivers d join motoja_private.profiles p on p.id=d.user_id),'[]'),
   'incidents',coalesce((select jsonb_agg(to_jsonb(i)) from (select * from motoja_private.incidents order by created_at desc limit 100) i),'[]'),
   'rides',coalesce((select jsonb_agg(motoja_private.ride_json(r,person.id)) from (select * from motoja_private.rides order by requested_at desc limit 100) r),'[]')));
 end if;
 return result;
 end $$;

create function motoja_private.can_delete_document(path text) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and split_part(path,'/',1)=auth.uid()::text
 and not exists(select 1 from motoja_private.documents where object_path=path);
$$;
create function motoja_private.can_upload_document() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from motoja_private.profiles where id=auth.uid() and role='driver' and account_status='active')
 and (select count(*) from storage.objects where bucket_id='motoja-documents' and split_part(name,'/',1)=auth.uid()::text)<30;
$$;
revoke all on all tables in schema motoja_private from public, anon, authenticated;
revoke execute on all functions in schema motoja_private from public, anon, authenticated;
revoke all on function public.mj_command(text,jsonb),public.mj_public_config(),public.mj_shared_ride(text),public.mj_store_quote(uuid,jsonb),public.mj_maps_access(uuid) from public,anon,authenticated;
grant usage on schema motoja_private to anon;
grant execute on function motoja_private.command(text,jsonb),public.mj_command(text,jsonb) to authenticated;
grant execute on function motoja_private.public_config(),public.mj_public_config(),motoja_private.shared_ride(text),public.mj_shared_ride(text) to anon,authenticated;
grant execute on function motoja_private.store_quote(uuid,jsonb),public.mj_store_quote(uuid,jsonb),motoja_private.maps_access(uuid),public.mj_maps_access(uuid) to service_role;
grant execute on function motoja_private.is_admin() to authenticated;
grant execute on function motoja_private.can_delete_document(text),motoja_private.can_upload_document() to authenticated;

-- Preserve existing accounts and operator role. Approval is intentionally re-reviewed
-- against private documents; the migration does not fabricate a completed verification.
do $$ begin
 if to_regclass('public.profiles') is not null then
  insert into motoja_private.profiles(id,full_name,phone,role,account_status)
  select id,left(full_name,100),left(coalesce(phone,''),20),role::text,account_status::text from public.profiles on conflict do nothing;
  insert into motoja_private.drivers(user_id) select id from motoja_private.profiles where role='driver' on conflict do nothing;
 end if;
end $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('motoja-documents','motoja-documents',false,5242880,array['application/pdf','image/jpeg','image/png']) on conflict(id) do nothing;
create policy mj_document_upload on storage.objects for insert to authenticated with check(
 bucket_id='motoja-documents' and (storage.foldername(name))[1]=(select auth.uid())::text
 and (select motoja_private.can_upload_document())
 and lower(storage.extension(name)) in ('pdf','jpg','jpeg','png')
);
create policy mj_document_read on storage.objects for select to authenticated using(
 bucket_id='motoja-documents' and ((storage.foldername(name))[1]=(select auth.uid())::text or ((select motoja_private.is_admin()) and (select auth.jwt()->>'aal')='aal2'))
);
create policy mj_document_remove_orphan on storage.objects for delete to authenticated using(
 bucket_id='motoja-documents' and (storage.foldername(name))[1]=(select auth.uid())::text
 and motoja_private.can_delete_document(name)
);
