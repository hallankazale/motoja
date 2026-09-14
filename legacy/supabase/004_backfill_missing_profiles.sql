-- Corrige contas criadas antes da instalação do gatilho de perfis.

insert into public.profiles (id, full_name, phone, role)
select
  u.id,
  coalesce(nullif(u.raw_user_meta_data->>'full_name',''), split_part(u.email,'@',1), 'Usuário'),
  u.raw_user_meta_data->>'phone',
  case when u.raw_user_meta_data->>'requested_role'='driver' then 'driver' else 'passenger' end
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;

insert into public.drivers (user_id)
select p.id
from public.profiles p
left join public.drivers d on d.user_id = p.id
where p.role = 'driver' and d.user_id is null;
