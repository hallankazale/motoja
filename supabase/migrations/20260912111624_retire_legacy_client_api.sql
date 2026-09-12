-- Retire the superseded client API atomically, preserving every legacy record.
-- A backup of privileges is kept privately for an operator-led rollback.
create table motoja_private.legacy_acl_backup (
 object_kind text not null, object_name text not null, acl text,
 saved_at timestamptz not null default now(), primary key(object_kind,object_name)
);
alter table motoja_private.legacy_acl_backup enable row level security;
revoke all on motoja_private.legacy_acl_backup from public,anon,authenticated;
do $$ declare item record; column_names text; begin
 if to_regclass('public.rides') is not null then
  lock table public.rides in access exclusive mode;
  if exists(select 1 from public.rides where status not in ('completed','cancelled')) then
   raise exception 'Legacy trips are still active. Finish them before retiring the legacy API.';
  end if;
 end if;
 for item in select c.oid,c.relname,c.relacl from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r' and c.relname in ('profiles','drivers','vehicles','rides','ride_events','ratings','pricing_rules') loop
  insert into motoja_private.legacy_acl_backup(object_kind,object_name,acl) values('table',format('public.%I',item.relname),item.relacl::text);
  insert into motoja_private.legacy_acl_backup(object_kind,object_name,acl)
   select 'column',format('public.%I.%I',item.relname,a.attname),a.attacl::text from pg_attribute a where a.attrelid=item.oid and a.attnum>0 and not a.attisdropped and a.attacl is not null;
  execute format('revoke all on table public.%I from public,anon,authenticated',item.relname);
  select string_agg(format('%I',a.attname),',') into column_names from pg_attribute a where a.attrelid=item.oid and a.attnum>0 and not a.attisdropped;
  execute format('revoke select(%s),insert(%s),update(%s),references(%s) on public.%I from public,anon,authenticated',column_names,column_names,column_names,column_names,item.relname);
 end loop;
 for item in select p.oid,p.proacl from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname not like 'mj\_%' escape '\'
  and not exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e') loop
  insert into motoja_private.legacy_acl_backup(object_kind,object_name,acl) values('function',item.oid::regprocedure::text,item.proacl::text);
  execute format('revoke execute on function %s from public,anon,authenticated',item.oid::regprocedure);
 end loop;
end $$;
