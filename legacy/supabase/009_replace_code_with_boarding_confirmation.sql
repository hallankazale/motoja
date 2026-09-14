alter table public.rides add column if not exists passenger_boarded_at timestamptz;

alter table public.ride_events drop constraint if exists ride_events_event_type_check;
alter table public.ride_events add constraint ride_events_event_type_check
check (event_type = any (array[
  'requested','accepted','driver_arriving','arrived','boarding_confirmed',
  'started','completed','cancelled','payment_confirmed','rated'
]));

create or replace function public.confirm_passenger_boarding(p_ride_id uuid)
returns public.rides
language plpgsql
security definer
set search_path = public
as $$
declare result public.rides;
begin
  update public.rides
     set passenger_boarded_at = now()
   where id = p_ride_id
     and passenger_id = auth.uid()
     and status = 'driver_arriving'
     and arrived_at is not null
     and passenger_boarded_at is null
  returning * into result;

  if result.id is null then
    raise exception 'A corrida ainda não está pronta para confirmar o embarque';
  end if;

  perform public.log_ride_event(p_ride_id, 'boarding_confirmed');
  return result;
end;
$$;

drop function if exists public.start_ride(uuid, text);

create or replace function public.start_ride(p_ride_id uuid)
returns public.rides
language plpgsql
security definer
set search_path = public
as $$
declare result public.rides;
begin
  update public.rides
     set status = 'in_progress', started_at = now()
   where id = p_ride_id
     and driver_id = auth.uid()
     and status = 'driver_arriving'
     and arrived_at is not null
     and passenger_boarded_at is not null
  returning * into result;

  if result.id is null then
    raise exception 'Aguarde o passageiro confirmar que embarcou';
  end if;

  perform public.log_ride_event(p_ride_id, 'started');
  return result;
end;
$$;

revoke all on function public.confirm_passenger_boarding(uuid) from public, anon;
revoke all on function public.start_ride(uuid) from public, anon;
grant execute on function public.confirm_passenger_boarding(uuid) to authenticated;
grant execute on function public.start_ride(uuid) to authenticated;