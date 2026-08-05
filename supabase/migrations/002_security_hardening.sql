-- Impede usuários comuns de promover a própria conta ou aprovar a si mesmos.

create or replace function public.protect_profile_sensitive_fields()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    new.role := old.role;
    new.account_status := old.account_status;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists protect_profile_sensitive_fields_trigger on public.profiles;
create trigger protect_profile_sensitive_fields_trigger
before update on public.profiles
for each row execute function public.protect_profile_sensitive_fields();

create or replace function public.protect_driver_sensitive_fields()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    new.approval_status := old.approval_status;
    new.monthly_fee := old.monthly_fee;
    new.subscription_status := old.subscription_status;
    new.subscription_due_date := old.subscription_due_date;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists protect_driver_sensitive_fields_trigger on public.drivers;
create trigger protect_driver_sensitive_fields_trigger
before update on public.drivers
for each row execute function public.protect_driver_sensitive_fields();

-- Passageiro não altera diretamente preço, motorista ou estado da corrida.
revoke insert, update, delete on public.rides from authenticated;
revoke insert, update, delete on public.pricing_rules from authenticated;

grant select on public.profiles, public.drivers, public.vehicles, public.pricing_rules, public.rides, public.ratings to authenticated;
grant update(full_name, phone) on public.profiles to authenticated;
grant update(pix_key, is_online) on public.drivers to authenticated;
grant insert, update, delete on public.vehicles to authenticated;
grant insert on public.ratings to authenticated;

grant select on public.pricing_rules to anon;
