
do $$
begin
  if not exists (select 1 from pg_type where typname = 'tipo_socio') then
    create type tipo_socio as enum ('propria','franqueado');
  end if;
end$$;

create table if not exists public.tipos_loja (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null unique,
  ordem      int not null default 0,
  ativo      boolean not null default true,
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on public.tipos_loja to authenticated;
grant all on public.tipos_loja to service_role;

alter table public.tipos_loja enable row level security;

drop policy if exists tipos_loja_select on public.tipos_loja;
create policy tipos_loja_select on public.tipos_loja for select
  using (auth.uid() is not null);

drop policy if exists tipos_loja_admin on public.tipos_loja;
create policy tipos_loja_admin on public.tipos_loja for all
  using (public.is_admin()) with check (public.is_admin());

insert into public.tipos_loja (nome, ordem) values
  ('Loja de Shopping', 1),
  ('Loja de Rua',      2),
  ('Quiosque',         3),
  ('Franquia',         4)
on conflict (nome) do nothing;

alter table public.lojas add column if not exists razao_social text;
alter table public.lojas add column if not exists tipo_socio   tipo_socio;
alter table public.lojas add column if not exists id_tipo_loja uuid
  references public.tipos_loja(id) on delete set null;

create index if not exists idx_lojas_tipo_loja  on public.lojas(id_tipo_loja);
create index if not exists idx_lojas_tipo_socio on public.lojas(tipo_socio);

update public.lojas
   set tipo_socio = 'propria'
 where tipo_socio is null;

update public.lojas
   set razao_social = nome_fantasia
 where razao_social is null or btrim(razao_social) = '';

alter table public.lojas alter column razao_social  set not null;
alter table public.lojas alter column tipo_socio    set not null;
alter table public.lojas alter column tipo_socio    set default 'propria';
alter table public.lojas alter column nome_fantasia set not null;
alter table public.lojas alter column cnpj          set not null;

alter table public.lojas drop column if exists tipo;

create or replace view public.vw_lojas as
  select
    l.id,
    l.cnpj,
    l.razao_social,
    l.nome_fantasia,
    l.tipo_socio,
    case l.tipo_socio
      when 'propria'    then 'Loja Própria'
      when 'franqueado' then 'Franqueado'
    end                        as tipo_socio_label,
    l.id_tipo_loja,
    t.nome                     as tipo_loja,
    l.ativa,
    l.created_at
  from public.lojas l
  left join public.tipos_loja t on t.id = l.id_tipo_loja;

alter view public.vw_lojas set (security_invoker = true);
grant select on public.vw_lojas to authenticated;
