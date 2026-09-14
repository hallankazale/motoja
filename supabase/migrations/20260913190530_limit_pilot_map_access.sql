-- Maps can incur provider costs even when no ride is created. In preparation/pilot,
-- only deliberately invited accounts and administrators may consume those services.
create or replace function motoja_private.maps_access(user_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare person motoja_private.profiles; operation_mode text;
begin
 select * into person from motoja_private.profiles where id=user_id and account_status='active';
 if not found then raise exception 'Conta indisponível.' using errcode='42501'; end if;
 select mode into operation_mode from motoja_private.settings;
 if operation_mode<>'live' and not (person.is_tester or person.role='admin') then
  raise exception 'Seu acesso ao piloto precisa ser liberado pela administração.' using errcode='42501';
 end if;
 perform motoja_private.limit_request(user_id::text||':maps',12,60);
 perform motoja_private.limit_request('maps:global:minute',60,60);
 perform motoja_private.limit_request('maps:global:day',600,86400);
end $$;
revoke all on function motoja_private.maps_access(uuid),public.mj_maps_access(uuid) from public,anon,authenticated;
grant execute on function motoja_private.maps_access(uuid),public.mj_maps_access(uuid) to service_role;
