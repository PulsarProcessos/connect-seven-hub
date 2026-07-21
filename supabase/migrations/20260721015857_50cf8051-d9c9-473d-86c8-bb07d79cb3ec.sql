-- CONNECT 7 — MIGRATION V6
do $$
begin
  if not exists (select 1 from pg_type where typname = 'status_conta_pagar') then
    create type status_conta_pagar as enum ('aberto','pago','cancelado');
  end if;
end$$;

create table if not exists public.loja_financeiras (
  id                     uuid primary key default uuid_generate_v4(),
  id_loja                uuid not null references public.lojas(id) on delete cascade,
  id_financeira          uuid not null references public.financeiras(id) on delete restrict,
  taxa_padrao            decimal(6,3) not null default 0,
  prazo_recebimento_dias int not null default 30,
  ativa                  boolean not null default true,
  created_at             timestamptz not null default now(),
  unique (id_loja, id_financeira)
);
create index if not exists idx_lojafin_loja on public.loja_financeiras(id_loja);
grant select, insert, update, delete on public.loja_financeiras to authenticated;
grant all on public.loja_financeiras to service_role;

create table if not exists public.loja_cartoes (
  id                     uuid primary key default uuid_generate_v4(),
  id_loja                uuid not null references public.lojas(id) on delete cascade,
  id_cartao              uuid not null references public.cartoes(id) on delete restrict,
  taxa_padrao            decimal(6,3) not null default 0,
  prazo_recebimento_dias int not null default 30,
  ativa                  boolean not null default true,
  created_at             timestamptz not null default now(),
  unique (id_loja, id_cartao)
);
create index if not exists idx_lojacar_loja on public.loja_cartoes(id_loja);
grant select, insert, update, delete on public.loja_cartoes to authenticated;
grant all on public.loja_cartoes to service_role;

insert into public.loja_financeiras (id_loja, id_financeira, taxa_padrao, prazo_recebimento_dias, ativa)
select l.id, f.id, f.taxa_padrao, f.prazo_recebimento_dias, f.ativa
  from public.lojas l cross join public.financeiras f
on conflict (id_loja, id_financeira) do nothing;

insert into public.loja_cartoes (id_loja, id_cartao, taxa_padrao, prazo_recebimento_dias, ativa)
select l.id, c.id, c.taxa_padrao, c.prazo_recebimento_dias, c.ativa
  from public.lojas l cross join public.cartoes c
on conflict (id_loja, id_cartao) do nothing;

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
      select lc.taxa_padrao, lc.prazo_recebimento_dias into v_taxa, v_prazo
        from public.loja_cartoes lc
       where lc.id_loja = new.id_loja and lc.id_cartao = new.id_cartao;
      if not found then
        select c.taxa_padrao, c.prazo_recebimento_dias into v_taxa, v_prazo
          from public.cartoes c where c.id = new.id_cartao;
      end if;
    else
      select lf.taxa_padrao, lf.prazo_recebimento_dias into v_taxa, v_prazo
        from public.loja_financeiras lf
       where lf.id_loja = new.id_loja and lf.id_financeira = new.id_financeira;
      if not found then
        select f.taxa_padrao, f.prazo_recebimento_dias into v_taxa, v_prazo
          from public.financeiras f where f.id = new.id_financeira;
      end if;
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

create table if not exists public.contas_pagar (
  id                 uuid primary key default uuid_generate_v4(),
  id_loja            uuid not null references public.lojas(id) on delete cascade,
  descricao          text not null,
  fornecedor         text,
  id_categoria       uuid references public.dre_categorias(id) on delete set null,
  valor              decimal(14,2) not null,
  data_vencimento    date not null,
  data_pagamento     date,
  id_conta_bancaria  uuid references public.contas_bancarias(id) on delete set null,
  status             status_conta_pagar not null default 'aberto',
  id_extrato_lancamento uuid references public.extrato_lancamentos(id) on delete set null,
  observacao         text,
  criado_por         uuid references public.usuarios_perfis(id),
  created_at         timestamptz not null default now()
);
create index if not exists idx_cp_loja  on public.contas_pagar(id_loja);
create index if not exists idx_cp_venc  on public.contas_pagar(data_vencimento);
create index if not exists idx_cp_stat  on public.contas_pagar(status);
create index if not exists idx_cp_cat   on public.contas_pagar(id_categoria);
grant select, insert, update, delete on public.contas_pagar to authenticated;
grant all on public.contas_pagar to service_role;

create or replace function public.fn_conta_pagar_pos()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'pago' and new.data_pagamento is null then
    new.data_pagamento := current_date;
  end if;
  if new.status <> 'pago' then
    new.data_pagamento := null;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_conta_pagar_pos on public.contas_pagar;
create trigger trg_conta_pagar_pos
  before insert or update of status on public.contas_pagar
  for each row execute function public.fn_conta_pagar_pos();

create or replace function public.fn_conta_pagar_concilia()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.id_extrato_lancamento is not null
     and (old.id_extrato_lancamento is distinct from new.id_extrato_lancamento) then
    update public.extrato_lancamentos set conciliado = true
     where id = new.id_extrato_lancamento;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_conta_pagar_concilia on public.contas_pagar;
create trigger trg_conta_pagar_concilia
  after update of id_extrato_lancamento on public.contas_pagar
  for each row execute function public.fn_conta_pagar_concilia();

create table if not exists public.comissao_faixas (
  id           uuid primary key default uuid_generate_v4(),
  id_loja      uuid not null references public.lojas(id) on delete cascade,
  valor_min    decimal(14,2) not null default 0,
  valor_max    decimal(14,2),
  percentual   decimal(6,3) not null,
  ativa        boolean not null default true,
  created_at   timestamptz not null default now()
);
create index if not exists idx_comfaixa_loja on public.comissao_faixas(id_loja);
grant select, insert, update, delete on public.comissao_faixas to authenticated;
grant all on public.comissao_faixas to service_role;

alter table public.comissao_faixas drop constraint if exists chk_faixa_ordem;
alter table public.comissao_faixas add constraint chk_faixa_ordem
  check (valor_max is null or valor_max > valor_min);

create or replace function public.calcular_comissao(p_loja uuid, p_mes text)
returns table (
  total_vendido  decimal(14,2),
  total_comissao decimal(14,2)
)
language plpgsql stable security definer set search_path = public
as $$
declare
  v_total  decimal(14,2) := 0;
  v_com    decimal(14,2) := 0;
  r        record;
  v_fatia  decimal(14,2);
begin
  select coalesce(sum(valor_bruto),0) into v_total
    from public.vendas_ucase
   where id_loja = p_loja and mes_venda = p_mes;

  for r in
    select valor_min, valor_max, percentual
      from public.comissao_faixas
     where id_loja = p_loja and ativa
     order by valor_min
  loop
    v_fatia := least(coalesce(r.valor_max, v_total), v_total) - r.valor_min;
    if v_fatia > 0 then
      v_com := v_com + round(v_fatia * r.percentual / 100, 2);
    end if;
  end loop;

  total_vendido  := v_total;
  total_comissao := v_com;
  return next;
end;
$$;

alter table public.dre_grupos     add column if not exists fixo boolean not null default true;
alter table public.dre_categorias add column if not exists fixo boolean not null default true;
alter table public.dre_categorias add column if not exists id_loja uuid
  references public.lojas(id) on delete cascade;
create index if not exists idx_dre_cat_loja on public.dre_categorias(id_loja);

alter table public.dre_categorias drop constraint if exists chk_cat_fixo;
alter table public.dre_categorias add constraint chk_cat_fixo check (
  (fixo = true and id_loja is null) or (fixo = false and id_loja is not null)
);

drop policy if exists dre_cat_select on public.dre_categorias;
create policy dre_cat_select on public.dre_categorias for select
  using (fixo = true or public.can_access_loja(id_loja));

drop policy if exists dre_cat_admin on public.dre_categorias;
create policy dre_cat_admin on public.dre_categorias for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists dre_cat_loja_write on public.dre_categorias;
create policy dre_cat_loja_write on public.dre_categorias for all
  using (fixo = false and public.can_access_loja(id_loja) and not public.is_master())
  with check (fixo = false and public.can_access_loja(id_loja) and not public.is_master());

alter table public.loja_financeiras enable row level security;
alter table public.loja_cartoes     enable row level security;
alter table public.contas_pagar     enable row level security;
alter table public.comissao_faixas  enable row level security;

drop policy if exists lojafin_select on public.loja_financeiras;
create policy lojafin_select on public.loja_financeiras for select
  using (public.can_access_loja(id_loja));
drop policy if exists lojafin_admin on public.loja_financeiras;
create policy lojafin_admin on public.loja_financeiras for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists lojacar_select on public.loja_cartoes;
create policy lojacar_select on public.loja_cartoes for select
  using (public.can_access_loja(id_loja));
drop policy if exists lojacar_admin on public.loja_cartoes;
create policy lojacar_admin on public.loja_cartoes for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists cp_select on public.contas_pagar;
create policy cp_select on public.contas_pagar for select
  using (public.can_access_loja(id_loja));
drop policy if exists cp_write on public.contas_pagar;
create policy cp_write on public.contas_pagar for all
  using (public.can_access_loja(id_loja) and not public.is_master())
  with check (public.can_access_loja(id_loja) and not public.is_master());

drop policy if exists comfaixa_select on public.comissao_faixas;
create policy comfaixa_select on public.comissao_faixas for select
  using (public.can_access_loja(id_loja));
drop policy if exists comfaixa_admin on public.comissao_faixas;
create policy comfaixa_admin on public.comissao_faixas for all
  using (public.is_admin()) with check (public.is_admin());

create or replace view public.vw_resumo_lojas as
  select
    l.id                    as id_loja,
    l.nome_fantasia,
    l.razao_social,
    l.tipo_socio,
    l.ativa,
    coalesce(v.total_bruto, 0)      as total_bruto_mes,
    coalesce(v.total_liquido, 0)    as total_liquido_mes,
    coalesce(v.qtd_vendas, 0)       as qtd_vendas_mes,
    coalesce(v.pendentes, 0)        as vendas_pendentes,
    coalesce(v.atrasadas, 0)        as vendas_atrasadas,
    coalesce(cp.total_aberto, 0)    as contas_pagar_aberto,
    coalesce(cp.vencidas, 0)        as contas_pagar_vencidas
  from public.lojas l
  left join (
    select id_loja,
           sum(valor_bruto)                                      as total_bruto,
           sum(valor_liquido_previsto)                           as total_liquido,
           count(*)                                              as qtd_vendas,
           count(*) filter (where status_conciliacao = 'pendente') as pendentes,
           count(*) filter (where status_conciliacao = 'atrasado') as atrasadas
      from public.vendas_ucase
     where mes_venda = to_char(current_date, 'YYYY-MM')
     group by id_loja
  ) v on v.id_loja = l.id
  left join (
    select id_loja,
           sum(valor) filter (where status = 'aberto')            as total_aberto,
           count(*)   filter (where status = 'aberto'
                              and data_vencimento < current_date) as vencidas
      from public.contas_pagar
     group by id_loja
  ) cp on cp.id_loja = l.id;

alter view public.vw_resumo_lojas set (security_invoker = true);
grant select on public.vw_resumo_lojas to authenticated;