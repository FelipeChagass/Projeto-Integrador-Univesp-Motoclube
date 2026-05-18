-- Sprint 5: RLS e policies para public.usuarios
-- Observacao: este projeto ja usa public.usuarios.id como FK para auth.users(id).
-- Nao e necessario criar uma coluna auth_user_id separada.

alter table public.usuarios enable row level security;

create or replace function public.current_user_is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.usuarios u
    where u.id = auth.uid()
      and u.perfil = 'admin'
      and coalesce(u.ativo, true) = true
  );
$$;

revoke all on function public.current_user_is_admin() from public;
grant execute on function public.current_user_is_admin() to authenticated;

drop policy if exists "Admins can read users" on public.usuarios;
drop policy if exists "Admins can insert users" on public.usuarios;
drop policy if exists "Admins can update users" on public.usuarios;
drop policy if exists "Admins can delete users" on public.usuarios;

create policy "Admins can read users"
on public.usuarios
for select
to authenticated
using (
  public.current_user_is_admin()
  or auth.uid() = id
);

create policy "Admins can insert users"
on public.usuarios
for insert
to authenticated
with check (
  public.current_user_is_admin()
);

create policy "Admins can update users"
on public.usuarios
for update
to authenticated
using (
  public.current_user_is_admin()
)
with check (
  public.current_user_is_admin()
);

create policy "Admins can delete users"
on public.usuarios
for delete
to authenticated
using (
  public.current_user_is_admin()
);
