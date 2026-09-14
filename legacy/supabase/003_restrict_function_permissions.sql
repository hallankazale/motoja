-- Restringe funções SECURITY DEFINER ao mínimo necessário.
revoke execute on function public.accept_ride(uuid) from public, anon;
revoke execute on function public.create_ride(text,text,numeric,text,numeric,numeric,numeric,numeric) from public, anon;
revoke execute on function public.calculate_fare(numeric) from public;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.protect_profile_sensitive_fields() from public, anon, authenticated;
revoke execute on function public.protect_driver_sensitive_fields() from public, anon, authenticated;
revoke execute on function public.is_admin() from public, anon;

grant execute on function public.accept_ride(uuid) to authenticated;
grant execute on function public.create_ride(text,text,numeric,text,numeric,numeric,numeric,numeric) to authenticated;
grant execute on function public.calculate_fare(numeric) to anon, authenticated;
grant execute on function public.is_admin() to authenticated;

-- O cálculo apenas lê uma regra pública; não precisa elevar privilégios.
alter function public.calculate_fare(numeric) security invoker;
