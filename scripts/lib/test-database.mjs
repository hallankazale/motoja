import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';

/** Fresh local database only. This module never connects to the hosted project. */
export async function createTestDatabase({ legacyFixture = false } = {}) {
const db = new PGlite();
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
const files = (await readdir(new URL('../../supabase/migrations/', import.meta.url))).filter(file => file.endsWith('.sql')).sort();
for (const file of files) await db.exec(await readFile(new URL(`../../supabase/migrations/${file}`, import.meta.url), 'utf8'));
return db;
}
