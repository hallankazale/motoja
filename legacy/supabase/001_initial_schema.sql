-- MotoJá | Campo Verde - MT
-- Base segura para passageiros, motociclistas, veículos, tarifas e corridas.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (char_length(full_name) between 2 and 100),
  phone text,
  role text not null default 'passenger' check (role in ('passenger','driver','admin')),
  account_status text not null default 'active' check (account_status in ('active','blocked')),
  city text not null default 'Campo Verde',
  state text not null default 'MT',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.drivers (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  approval_status text not null default 'pending' check (approval_status in ('pending','approved','rejected','suspended')),
  pix_key text,
  is_online boolean not null default false,
  monthly_fee numeric(10,2) not null default 100.00 check (monthly_fee >= 0),
  subscription_status text not null default 'trial' check (subscription_status in ('trial','paid','overdue','blocked')),
  subscription_due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null unique references public.drivers(user_id) on delete cascade,
  plate text not null unique,
  model text not null,
  color text not null,
  year smallint check (year between 1990 and 2100),
  document_status text not null default 'pending' check (document_status in ('pending','approved','rejected')),
  created_at timestamptz not null default now()
);

create table if not exists public.pricing_rules (
  id uuid primary key default gen_random_uuid(),
  city text not null,
  state text not null,
  base_fare numeric(10,2) not null check (base_fare >= 0),
  minimum_fare numeric(10,2) not null check (minimum_fare >= 0),
  price_per_km numeric(10,2) not null check (price_per_km >= 0),
  price_per_minute numeric(10,2) not null default 0 check (price_per_minute >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(city, state)
);

insert into public.pricing_rules(city,state,base_fare,minimum_fare,price_per_km,price_per_minute)
values ('Campo Verde','MT',4.00,7.00,1.70,0.00)
on conflict (city,state) do update set
  base_fare=excluded.base_fare,
  minimum_fare=excluded.minimum_fare,
  price_per_km=excluded.price_per_km,
  price_per_minute=excluded.price_per_minute,
  updated_at=now();

create table if not exists public.rides (
  id uuid primary key default gen_random_uuid(),
  passenger_id uuid not null references public.profiles(id),
  driver_id uuid references public.drivers(user_id),
  pickup_address text not null,
  destination_address text not null,
  pickup_lat numeric(9,6),
  pickup_lng numeric(9,6),
  destination_lat numeric(9,6),
  destination_lng numeric(9,6),
  distance_km numeric(8,2) not null check (distance_km > 0 and distance_km <= 300),
  estimated_price numeric(10,2) not null check (estimated_price >= 0),
  final_price numeric(10,2) check (final_price >= 0),
  payment_method text not null check (payment_method in ('cash','pix')),
  payment_status text not null default 'pending' check (payment_status in ('pending','confirmed','disputed')),
  status text not null default 'requested' check (status in ('requested','accepted','driver_arriving','in_progress','completed','cancelled')),
  safety_code text not null,
  requested_at timestamptz not null default now(),
  accepted_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz
);

create index if not exists rides_passenger_idx on public.rides(passenger_id, requested_at desc);
create index if not exists rides_driver_idx on public.rides(driver_id, requested_at desc);
create index if not exists rides_open_idx on public.rides(status) where status='requested';

create table if not exists public.ratings (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null unique references public.rides(id) on delete cascade,
  passenger_id uuid not null references public.profiles(id),
  driver_id uuid not null references public.drivers(user_id),
  stars smallint not null check (stars between 1 and 5),
  comment text check (char_length(comment) <= 500),
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.profiles where id=auth.uid() and role='admin' and account_status='active');
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.profiles(id,full_name,phone,role)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'full_name',''), split_part(new.email,'@',1), 'Usuário'),
    new.raw_user_meta_data->>'phone',
    case when new.raw_user_meta_data->>'requested_role'='driver' then 'driver' else 'passenger' end
  );
  if new.raw_user_meta_data->>'requested_role'='driver' then
    insert into public.drivers(user_id) values(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.calculate_fare(p_distance_km numeric)
returns numeric language plpgsql stable security definer set search_path=public as $$
declare r public.pricing_rules;
begin
  if p_distance_km <= 0 or p_distance_km > 300 then raise exception 'Distância inválida'; end if;
  select * into r from public.pricing_rules where city='Campo Verde' and state='MT' and active=true limit 1;
  if not found then raise exception 'Tarifa indisponível'; end if;
  return round(greatest(r.minimum_fare, r.base_fare + (r.price_per_km * p_distance_km))::numeric, 2);
end;
$$;

create or replace function public.create_ride(
  p_pickup_address text,
  p_destination_address text,
  p_distance_km numeric,
  p_payment_method text,
  p_pickup_lat numeric default null,
  p_pickup_lng numeric default null,
  p_destination_lat numeric default null,
  p_destination_lng numeric default null
) returns public.rides language plpgsql security definer set search_path=public as $$
declare created public.rides; code text;
begin
  if auth.uid() is null then raise exception 'Não autenticado'; end if;
  if not exists(select 1 from public.profiles where id=auth.uid() and role='passenger' and account_status='active') then raise exception 'Conta de passageiro inválida'; end if;
  if p_payment_method not in ('cash','pix') then raise exception 'Pagamento inválido'; end if;
  if trim(p_pickup_address)='' or trim(p_destination_address)='' then raise exception 'Origem e destino são obrigatórios'; end if;
  code := lpad((floor(random()*10000))::int::text,4,'0');
  insert into public.rides(passenger_id,pickup_address,destination_address,pickup_lat,pickup_lng,destination_lat,destination_lng,distance_km,estimated_price,payment_method,safety_code)
  values(auth.uid(),trim(p_pickup_address),trim(p_destination_address),p_pickup_lat,p_pickup_lng,p_destination_lat,p_destination_lng,p_distance_km,public.calculate_fare(p_distance_km),p_payment_method,code)
  returning * into created;
  return created;
end;
$$;

create or replace function public.accept_ride(p_ride_id uuid)
returns public.rides language plpgsql security definer set search_path=public as $$
declare accepted public.rides;
begin
  if not exists(select 1 from public.drivers where user_id=auth.uid() and approval_status='approved' and is_online=true and subscription_status in ('trial','paid')) then
    raise exception 'Motociclista não autorizado ou offline';
  end if;
  update public.rides set driver_id=auth.uid(),status='accepted',accepted_at=now()
  where id=p_ride_id and status='requested' and driver_id is null returning * into accepted;
  if accepted.id is null then raise exception 'Corrida indisponível'; end if;
  return accepted;
end;
$$;

alter table public.profiles enable row level security;
alter table public.drivers enable row level security;
alter table public.vehicles enable row level security;
alter table public.pricing_rules enable row level security;
alter table public.rides enable row level security;
alter table public.ratings enable row level security;

create policy profiles_read on public.profiles for select using (
  id=auth.uid() or public.is_admin() or exists(
    select 1 from public.rides r where (r.passenger_id=auth.uid() and r.driver_id=profiles.id) or (r.driver_id=auth.uid() and r.passenger_id=profiles.id)
  )
);
create policy profiles_update_self on public.profiles for update using(id=auth.uid()) with check(id=auth.uid());
create policy profiles_admin_all on public.profiles for all using(public.is_admin()) with check(public.is_admin());

create policy drivers_read on public.drivers for select using(user_id=auth.uid() or public.is_admin() or approval_status='approved');
create policy drivers_update_self on public.drivers for update using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy drivers_admin_all on public.drivers for all using(public.is_admin()) with check(public.is_admin());

create policy vehicles_read on public.vehicles for select using(driver_id=auth.uid() or public.is_admin() or document_status='approved');
create policy vehicles_write_own on public.vehicles for all using(driver_id=auth.uid() or public.is_admin()) with check(driver_id=auth.uid() or public.is_admin());

create policy pricing_read on public.pricing_rules for select using(active=true or public.is_admin());
create policy pricing_admin on public.pricing_rules for all using(public.is_admin()) with check(public.is_admin());

create policy rides_read on public.rides for select using(passenger_id=auth.uid() or driver_id=auth.uid() or public.is_admin() or (status='requested' and exists(select 1 from public.drivers d where d.user_id=auth.uid() and d.approval_status='approved')));
create policy rides_admin on public.rides for all using(public.is_admin()) with check(public.is_admin());

create policy ratings_read on public.ratings for select using(passenger_id=auth.uid() or driver_id=auth.uid() or public.is_admin());
create policy ratings_insert on public.ratings for insert with check(passenger_id=auth.uid());

revoke all on function public.create_ride(text,text,numeric,text,numeric,numeric,numeric,numeric) from public;
grant execute on function public.create_ride(text,text,numeric,text,numeric,numeric,numeric,numeric) to authenticated;
revoke all on function public.accept_ride(uuid) from public;
grant execute on function public.accept_ride(uuid) to authenticated;
grant execute on function public.calculate_fare(numeric) to anon, authenticated;
