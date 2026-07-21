-- CONNECT 7 — MIGRATION V5
do $$
begin
  if not exists (select 1 from pg_type where typname = 'meio_pagamento') then
    create type meio_pagamento as enum ('cartao','financeira','a_vista');
  end if;
end$$;

create table if not exists public.cartoes (
  id                     uuid primary key default uuid_generate_v4(),
  nome                   text not null unique,
  taxa_padrao            decimal(6,3) not null default 0,
  prazo_recebimento_dias int not null default 30,
  ativa                  boolean not null default true,
  created_at             timestamptz not null default now()
);
grant select, insert, update, delete on public.cartoes to authenticated;
grant all on public.cartoes to service_role;

alter table public.cartoes enable row level security;

drop policy if exists cartoes_select on public.cartoes;
create policy cartoes_select on public.cartoes for select
  using (auth.uid() is not null);

drop policy if exists cartoes_admin on public.cartoes;
create policy cartoes_admin on public.cartoes for all
  using (public.is_admin()) with check (public.is_admin());

insert into public.cartoes (nome, taxa_padrao, prazo_recebimento_dias) values
  ('Mastercard', 0, 30),
  ('Visa',       0, 30),
  ('Elo',        0, 30)
on conflict (nome) do nothing;

insert into public.financeiras (nome, taxa_padrao, prazo_recebimento_dias) values
  ('AIVA',       0, 30),
  ('PayJoy',     0, 30),
  ('Crefaz',     0, 30),
  ('PayLiber',   0, 30),
  ('BrasilCard', 0, 30)
on conflict do nothing;

alter table public.vendas_ucase
  add column if not exists meio_pagamento meio_pagamento not null default 'financeira';
alter table public.vendas_ucase
  add column if not exists id_cartao uuid references public.cartoes(id) on delete restrict;
alter table public.vendas_ucase
  add column if not exists forma_pagamento_origem text;
alter table public.vendas_ucase
  add column if not exists numero_venda text;
alter table public.vendas_ucase
  add column if not exists qtde_parcelas int;

alter table public.vendas_ucase alter column id_financeira drop not null;

create index if not exists idx_vendas_cartao on public.vendas_ucase(id_cartao);
create index if not exists idx_vendas_meio   on public.vendas_ucase(meio_pagamento);
create index if not exists idx_vendas_numero on public.vendas_ucase(numero_venda);

alter table public.vendas_ucase drop constraint if exists chk_meio_pagamento;
alter table public.vendas_ucase add constraint chk_meio_pagamento check (
  (meio_pagamento = 'cartao'     and id_cartao is not null and id_financeira is null)
  or (meio_pagamento = 'financeira' and id_financeira is not null and id_cartao is null)
  or (meio_pagamento = 'a_vista'    and id_cartao is null and id_financeira is null)
);

create unique index if not exists uq_venda_forma
  on public.vendas_ucase(id_loja, numero_venda, forma_pagamento_origem, valor_bruto)
  where numero_venda is not null;

create or replace function public.fn_calc_previsao_venda()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_taxa  decimal(6,3) := 0;
  v_prazo int := 0;
begin
  if new.meio_pagamento = 'a_vista' then
    new.valor_liquido_previsto := new.valor_bruto;
    new.data_prevista_recebimento := new.data_venda::date;
    new.status_conciliacao := 'conciliado';
  else
    if new.meio_pagamento = 'cartao' then
      select taxa_padrao, prazo_recebimento_dias into v_taxa, v_prazo
        from public.cartoes where id = new.id_cartao;
    else
      select taxa_padrao, prazo_recebimento_dias into v_taxa, v_prazo
        from public.financeiras where id = new.id_financeira;
    end if;

    new.valor_liquido_previsto :=
      round(new.valor_bruto - (new.valor_bruto * coalesce(v_taxa,0) / 100), 2);
    new.data_prevista_recebimento :=
      public.add_dias_uteis(new.data_venda::date, coalesce(v_prazo,0));
  end if;

  new.mes_venda := to_char(new.data_venda, 'YYYY-MM');
  return new;
end;
$$;

drop trigger if exists trg_calc_previsao on public.vendas_ucase;
create trigger trg_calc_previsao
  before insert or update of valor_bruto, id_financeira, id_cartao, meio_pagamento, data_venda
  on public.vendas_ucase
  for each row execute function public.fn_calc_previsao_venda();

create or replace function public.fn_atualizar_status_atrasados()
returns void
language sql security definer set search_path = public
as $$
  update public.vendas_ucase
     set status_conciliacao = 'atrasado'
   where status_conciliacao = 'pendente'
     and meio_pagamento <> 'a_vista'
     and data_prevista_recebimento is not null
     and data_prevista_recebimento < current_date;
$$;

create or replace view public.vw_vendas_ucase as
  select
    v.*,
    case v.meio_pagamento
      when 'cartao'     then c.nome
      when 'financeira' then f.nome
      else 'À vista'
    end as origem_nome,
    case v.meio_pagamento
      when 'cartao'     then 'Cartão'
      when 'financeira' then 'Financeira'
      else 'À vista'
    end as meio_label
  from public.vendas_ucase v
  left join public.cartoes     c on c.id = v.id_cartao
  left join public.financeiras f on f.id = v.id_financeira;

alter view public.vw_vendas_ucase set (security_invoker = true);
grant select on public.vw_vendas_ucase to authenticated;

create or replace view public.vw_extrato_financeiro as
  select
    v.id,
    v.id_loja,
    'venda_ucase'::text as origem,
    'venda'::text       as tipo,
    v.data_venda::date  as data_movimento,
    coalesce(
      case v.meio_pagamento
        when 'cartao'     then c.nome
        when 'financeira' then f.nome
        else 'À vista'
      end, 'Ucase')     as descricao,
    v.valor_liquido_previsto as valor,
    'receita'::text     as natureza,
    null::uuid          as id_categoria,
    'Receita Bruta'::text as grupo_dre,
    ('Vendas ' || coalesce(
      case v.meio_pagamento
        when 'cartao'     then c.nome
        when 'financeira' then f.nome
        else 'À vista'
      end, 'Ucase'))    as categoria_dre,
    null::uuid          as id_conta_bancaria,
    v.status_conciliacao,
    v.created_at
  from public.vendas_ucase v
  left join public.cartoes     c on c.id = v.id_cartao
  left join public.financeiras f on f.id = v.id_financeira

  union all

  select
    m.id,
    m.id_loja,
    'manual'::text as origem,
    m.tipo::text   as tipo,
    m.data_movimento,
    m.descricao,
    m.valor,
    case when m.tipo = 'despesa' then 'despesa' else 'receita' end as natureza,
    m.id_categoria,
    coalesce(g.nome,'—') as grupo_dre,
    coalesce(cat.nome,'—') as categoria_dre,
    m.id_conta_bancaria,
    m.status_conciliacao,
    m.created_at
  from public.movimentacoes m
  left join public.dre_categorias cat on cat.id = m.id_categoria
  left join public.dre_grupos     g   on g.id  = cat.id_grupo;

alter view public.vw_extrato_financeiro set (security_invoker = true);
grant select on public.vw_extrato_financeiro to authenticated;