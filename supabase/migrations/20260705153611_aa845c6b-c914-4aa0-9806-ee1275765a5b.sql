
do $$
begin
  if not exists (select 1 from pg_type where typname = 'natureza_dre') then
    create type natureza_dre as enum ('receita','despesa');
  end if;
  if not exists (select 1 from pg_type where typname = 'tipo_movimentacao') then
    create type tipo_movimentacao as enum ('venda','despesa','transferencia');
  end if;
end$$;

create table if not exists public.dre_grupos (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null,
  natureza   natureza_dre not null default 'despesa',
  ordem      int not null default 0,
  ativo      boolean not null default true,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.dre_grupos to authenticated;
grant all on public.dre_grupos to service_role;

create table if not exists public.dre_categorias (
  id         uuid primary key default gen_random_uuid(),
  id_grupo   uuid not null references public.dre_grupos(id) on delete cascade,
  nome       text not null,
  ordem      int not null default 0,
  ativo      boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_dre_cat_grupo on public.dre_categorias(id_grupo);
grant select, insert, update, delete on public.dre_categorias to authenticated;
grant all on public.dre_categorias to service_role;

create table if not exists public.movimentacoes (
  id                    uuid primary key default gen_random_uuid(),
  id_loja               uuid not null references public.lojas(id) on delete cascade,
  tipo                  tipo_movimentacao not null,
  data_movimento        date not null,
  descricao             text not null,
  valor                 decimal(14,2) not null,
  id_categoria          uuid references public.dre_categorias(id) on delete set null,
  id_conta_bancaria     uuid references public.contas_bancarias(id) on delete set null,
  id_conta_destino      uuid references public.contas_bancarias(id) on delete set null,
  status_conciliacao    status_conciliacao not null default 'pendente',
  id_extrato_lancamento uuid references public.extrato_lancamentos(id) on delete set null,
  criado_por            uuid references public.usuarios_perfis(id),
  created_at            timestamptz not null default now()
);
create index if not exists idx_mov_loja   on public.movimentacoes(id_loja);
create index if not exists idx_mov_tipo   on public.movimentacoes(tipo);
create index if not exists idx_mov_data   on public.movimentacoes(data_movimento);
create index if not exists idx_mov_cat    on public.movimentacoes(id_categoria);
create index if not exists idx_mov_status on public.movimentacoes(status_conciliacao);
grant select, insert, update, delete on public.movimentacoes to authenticated;
grant all on public.movimentacoes to service_role;

alter table public.movimentacoes drop constraint if exists chk_transferencia;
alter table public.movimentacoes add constraint chk_transferencia check (
  tipo <> 'transferencia'
  or (
    id_conta_bancaria is not null
    and id_conta_destino is not null
    and id_conta_bancaria <> id_conta_destino
  )
);

create or replace view public.vw_extrato_financeiro as
  select
    v.id,
    v.id_loja,
    'venda_ucase'::text                as origem,
    'venda'::text                      as tipo,
    v.data_venda::date                 as data_movimento,
    coalesce(f.nome,'Ucase')           as descricao,
    v.valor_liquido_previsto           as valor,
    'receita'::text                    as natureza,
    null::uuid                         as id_categoria,
    'Receita Bruta'::text              as grupo_dre,
    ('Vendas '||coalesce(f.nome,'Ucase')) as categoria_dre,
    v.id_financeira                    as id_conta_bancaria,
    v.status_conciliacao,
    v.created_at
  from public.vendas_ucase v
  left join public.financeiras f on f.id = v.id_financeira
  union all
  select
    m.id,
    m.id_loja,
    'manual'::text                     as origem,
    m.tipo::text                       as tipo,
    m.data_movimento,
    m.descricao,
    m.valor,
    case when m.tipo = 'despesa' then 'despesa' else 'receita' end as natureza,
    m.id_categoria,
    coalesce(g.nome,'—')               as grupo_dre,
    coalesce(c.nome,'—')               as categoria_dre,
    m.id_conta_bancaria,
    m.status_conciliacao,
    m.created_at
  from public.movimentacoes m
  left join public.dre_categorias c on c.id = m.id_categoria
  left join public.dre_grupos     g on g.id = c.id_grupo;

alter view public.vw_extrato_financeiro set (security_invoker = true);
grant select on public.vw_extrato_financeiro to authenticated;

create or replace function public.fn_pos_conciliacao_mov()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status_conciliacao = 'conciliado'
     and new.id_extrato_lancamento is not null
     and (old.id_extrato_lancamento is distinct from new.id_extrato_lancamento) then
    update public.extrato_lancamentos set conciliado = true
     where id = new.id_extrato_lancamento;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_pos_conciliacao_mov on public.movimentacoes;
create trigger trg_pos_conciliacao_mov
  after update of status_conciliacao, id_extrato_lancamento on public.movimentacoes
  for each row execute function public.fn_pos_conciliacao_mov();

alter table public.dre_grupos     enable row level security;
alter table public.dre_categorias enable row level security;
alter table public.movimentacoes  enable row level security;

drop policy if exists dre_grp_select on public.dre_grupos;
create policy dre_grp_select on public.dre_grupos for select
  using (auth.uid() is not null);
drop policy if exists dre_grp_admin on public.dre_grupos;
create policy dre_grp_admin on public.dre_grupos for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists dre_cat_select on public.dre_categorias;
create policy dre_cat_select on public.dre_categorias for select
  using (auth.uid() is not null);
drop policy if exists dre_cat_admin on public.dre_categorias;
create policy dre_cat_admin on public.dre_categorias for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists mov_select on public.movimentacoes;
create policy mov_select on public.movimentacoes for select
  using (public.can_access_loja(id_loja));
drop policy if exists mov_write on public.movimentacoes;
create policy mov_write on public.movimentacoes for all
  using (public.can_access_loja(id_loja))
  with check (public.can_access_loja(id_loja));
