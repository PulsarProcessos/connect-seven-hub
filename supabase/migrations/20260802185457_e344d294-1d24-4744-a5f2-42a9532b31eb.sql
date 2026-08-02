-- ============ helpers ============
create or replace function private.is_admin_or_gerente()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.usuarios_perfis p
    where p.id = auth.uid() and p.ativo and p.role in ('administrador','gerente')
  );
$$;
revoke all on function private.is_admin_or_gerente() from public, anon, authenticated;

-- ============ colunas novas ============
alter table public.caixas
  add column if not exists turno text not null default 'unico',
  add column if not exists total_sangrias numeric(14,2) not null default 0,
  add column if not exists total_suprimentos numeric(14,2) not null default 0,
  add column if not exists total_entradas numeric(14,2) not null default 0,
  add column if not exists total_saidas numeric(14,2) not null default 0,
  add column if not exists total_depositado numeric(14,2) not null default 0,
  add column if not exists dinheiro_apurado numeric(14,2),
  add column if not exists diferenca_caixa numeric(14,2),
  add column if not exists reaberto_por uuid references public.usuarios_perfis(id),
  add column if not exists reaberto_em timestamptz,
  add column if not exists motivo_reabertura text;

alter table public.caixa_lancamentos
  add column if not exists id_conta_bancaria uuid references public.contas_bancarias(id);

alter table public.contas_pagar
  add column if not exists data_competencia date,
  add column if not exists id_loja_rateio_origem uuid references public.lojas(id),
  add column if not exists percentual_rateio numeric(6,3);
update public.contas_pagar set data_competencia = coalesce(data_competencia, data_vencimento);
alter table public.contas_pagar alter column data_competencia set default current_date;
alter table public.contas_pagar alter column data_competencia set not null;

alter table public.contas_receber add column if not exists data_competencia date;
update public.contas_receber set data_competencia = coalesce(data_competencia, data_vencimento);
alter table public.contas_receber alter column data_competencia set default current_date;
alter table public.contas_receber alter column data_competencia set not null;

alter table public.movimentacoes add column if not exists data_competencia date;
update public.movimentacoes set data_competencia = coalesce(data_competencia, data_movimento);
alter table public.movimentacoes alter column data_competencia set default current_date;
alter table public.movimentacoes alter column data_competencia set not null;

alter table public.lojas add column if not exists saldo_inicial_caixa numeric(14,2) not null default 0;

-- ============ comprovantes ============
create table if not exists public.comprovantes (
  id uuid primary key default gen_random_uuid(),
  id_loja uuid not null references public.lojas(id) on delete cascade,
  origem_tipo text not null check (origem_tipo in ('caixa','caixa_deposito','caixa_lancamento','conta_pagar','conta_receber','movimentacao')),
  origem_id uuid not null,
  caminho text not null unique,
  nome_arquivo text not null,
  content_type text,
  tamanho bigint,
  enviado_por uuid references public.usuarios_perfis(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_comprovantes_origem on public.comprovantes(origem_tipo, origem_id);
grant select, insert, update, delete on public.comprovantes to authenticated;
grant all on public.comprovantes to service_role;
alter table public.comprovantes enable row level security;
create policy comp_select on public.comprovantes for select to authenticated
  using (private.can_access_loja(id_loja));
create policy comp_write on public.comprovantes for all to authenticated
  using (private.can_access_loja(id_loja) and not private.is_master())
  with check (private.can_access_loja(id_loja) and not private.is_master());

-- ============ depósitos (lotérica) ============
create table if not exists public.caixa_depositos (
  id uuid primary key default gen_random_uuid(),
  id_caixa uuid references public.caixas(id) on delete cascade,
  id_loja uuid not null references public.lojas(id),
  numero_comprovante text not null,
  valor numeric(14,2) not null,
  data_deposito date not null default current_date,
  id_conta_bancaria uuid references public.contas_bancarias(id),
  id_extrato_lancamento uuid references public.extrato_lancamentos(id),
  conciliado boolean not null default false,
  observacao text,
  criado_por uuid references public.usuarios_perfis(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_caixa_depositos_caixa on public.caixa_depositos(id_caixa);
grant select, insert, update, delete on public.caixa_depositos to authenticated;
grant all on public.caixa_depositos to service_role;
alter table public.caixa_depositos enable row level security;
create policy dep_select on public.caixa_depositos for select to authenticated
  using (private.can_access_loja(id_loja));
create policy dep_write on public.caixa_depositos for all to authenticated
  using (private.can_access_loja(id_loja) and not private.is_master())
  with check (private.can_access_loja(id_loja) and not private.is_master());
create trigger trg_dep_touch before update on public.caixa_depositos
  for each row execute function public.fn_touch_updated_at();

-- ============ orçamentos ============
create table if not exists public.orcamentos (
  id uuid primary key default gen_random_uuid(),
  id_loja uuid not null references public.lojas(id) on delete cascade,
  id_categoria uuid not null references public.dre_categorias(id) on delete cascade,
  ano integer not null,
  mes integer not null check (mes between 1 and 12),
  valor numeric(14,2) not null default 0,
  observacao text,
  criado_por uuid references public.usuarios_perfis(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id_loja, id_categoria, ano, mes)
);
grant select, insert, update, delete on public.orcamentos to authenticated;
grant all on public.orcamentos to service_role;
alter table public.orcamentos enable row level security;
create policy orc_select on public.orcamentos for select to authenticated
  using (private.can_access_loja(id_loja));
create policy orc_write on public.orcamentos for all to authenticated
  using (private.can_access_loja(id_loja) and private.is_admin_or_gerente())
  with check (private.can_access_loja(id_loja) and private.is_admin_or_gerente());
create trigger trg_orc_touch before update on public.orcamentos
  for each row execute function public.fn_touch_updated_at();

-- ============ regras do caixa ============
create or replace function public.fn_caixa_lanc_valida()
returns trigger language plpgsql set search_path = public as $$
begin
  if lower(coalesce(new.forma_pagamento,'')) in ('pix','transferencia','transferência','deposito','depósito','deposito_bancario','depósito bancário')
     and new.id_conta_bancaria is null then
    raise exception 'Informe a conta bancária para recebimentos por PIX, transferência ou depósito.';
  end if;
  return new;
end $$;
create trigger trg_caixa_lanc_valida before insert or update on public.caixa_lancamentos
  for each row execute function public.fn_caixa_lanc_valida();

create or replace function public.fn_recalcular_caixa(p_caixa uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_e numeric := 0; v_s numeric := 0; v_sa numeric := 0; v_su numeric := 0; v_d numeric := 0; v_ini numeric := 0; v_ap numeric;
begin
  select coalesce(sum(case when tipo = 'entrada' then valor else 0 end),0),
         coalesce(sum(case when tipo = 'saida' then valor else 0 end),0),
         coalesce(sum(case when tipo = 'sangria' then valor else 0 end),0),
         coalesce(sum(case when tipo = 'suprimento' then valor else 0 end),0)
    into v_e, v_s, v_sa, v_su
    from public.caixa_lancamentos where id_caixa = p_caixa;
  select coalesce(sum(valor),0) into v_d from public.caixa_depositos where id_caixa = p_caixa;
  select saldo_inicial, dinheiro_apurado into v_ini, v_ap from public.caixas where id = p_caixa;

  update public.caixas set
    total_entradas = v_e, total_saidas = v_s,
    total_sangrias = v_sa, total_suprimentos = v_su, total_depositado = v_d,
    saldo_final_calculado = coalesce(v_ini,0) + v_e + v_su - v_s - v_sa - v_d,
    diferenca_caixa = case when v_ap is null then null
      else v_ap - (coalesce(v_ini,0) + v_e + v_su - v_s - v_sa - v_d) end,
    updated_at = now()
  where id = p_caixa;
end $$;
revoke all on function public.fn_recalcular_caixa(uuid) from public, anon;
grant execute on function public.fn_recalcular_caixa(uuid) to authenticated, service_role;

create or replace function public.fn_caixa_recalc_trg()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.fn_recalcular_caixa(coalesce(new.id_caixa, old.id_caixa));
  return coalesce(new, old);
end $$;
create trigger trg_caixa_lanc_recalc after insert or update or delete on public.caixa_lancamentos
  for each row execute function public.fn_caixa_recalc_trg();
create trigger trg_caixa_dep_recalc after insert or update or delete on public.caixa_depositos
  for each row execute function public.fn_caixa_recalc_trg();

-- reabrir / excluir fechamento: apenas admin e gerente
create or replace function public.fn_caixa_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'fechado' and not private.is_admin_or_gerente() then
      raise exception 'Apenas administrador ou gerente pode excluir um caixa fechado.';
    end if;
    return old;
  end if;
  if old.status = 'fechado' and new.status = 'aberto' then
    if not private.is_admin_or_gerente() then
      raise exception 'Apenas administrador ou gerente pode reabrir um caixa.';
    end if;
    new.reaberto_por := auth.uid();
    new.reaberto_em := now();
    new.data_fechamento := null;
    new.saldo_final_informado := null;
    new.divergencia_fechamento := null;
  end if;
  return new;
end $$;
create trigger trg_caixa_guard before update or delete on public.caixas
  for each row execute function public.fn_caixa_guard();

-- ============ storage: comprovantes ============
create policy comprovantes_read on storage.objects for select to authenticated
  using (bucket_id = 'comprovantes' and private.can_access_loja(((storage.foldername(name))[1])::uuid));
create policy comprovantes_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'comprovantes' and private.can_access_loja(((storage.foldername(name))[1])::uuid) and not private.is_master());
create policy comprovantes_delete on storage.objects for delete to authenticated
  using (bucket_id = 'comprovantes' and private.can_access_loja(((storage.foldername(name))[1])::uuid) and not private.is_master());

-- ============ views ============
create or replace view public.vw_fluxo_caixa
with (security_invoker = on) as
  select cp.id, 'pagar'::text as origem, cp.id_loja, cp.id_categoria,
         cp.descricao, -cp.valor::numeric as valor,
         cp.data_competencia, cp.data_vencimento, cp.data_pagamento as data_realizacao,
         (cp.status = 'pago') as realizado, cp.status::text as status
    from public.contas_pagar cp
   where cp.status <> 'cancelado'
  union all
  select cr.id, 'receber', cr.id_loja, cr.id_categoria,
         cr.descricao, coalesce(cr.valor_recebido, cr.valor)::numeric,
         cr.data_competencia, cr.data_vencimento, cr.data_recebimento,
         (cr.status = 'recebido'), cr.status::text
    from public.contas_receber cr
   where cr.status <> 'cancelado'
  union all
  select v.id, 'recebivel_cartao', v.id_loja, null::uuid,
         coalesce('Repasse venda ' || v.numero_venda, 'Repasse de venda'),
         v.valor_liquido_previsto::numeric,
         v.data_venda::date, v.data_prevista_recebimento, null::date,
         false, v.status_conciliacao::text
    from public.vendas_ucase v
   where v.meio_pagamento <> 'a_vista'
     and v.status_conciliacao <> 'conciliado'
     and v.data_prevista_recebimento is not null;
grant select on public.vw_fluxo_caixa to authenticated;

create or replace view public.vw_dre_competencia
with (security_invoker = on) as
  -- receita de vendas
  select v.id_loja, null::uuid as id_categoria, 'Receita de Vendas'::text as categoria,
         'receita'::text as natureza, v.data_venda::date as data_competencia,
         v.valor_bruto::numeric as valor
    from public.vendas_ucase v
  union all
  -- receitas manuais / contas a receber
  select cr.id_loja, cr.id_categoria, coalesce(c.nome,'Outras receitas'), 'receita',
         cr.data_competencia, cr.valor::numeric
    from public.contas_receber cr
    left join public.dre_categorias c on c.id = cr.id_categoria
   where cr.status <> 'cancelado' and cr.id_venda_ucase is null
  union all
  -- despesas: parte da própria loja (aplicando o rateio quando houver)
  select cp.id_loja, cp.id_categoria, coalesce(c.nome,'Outras despesas'), 'despesa',
         cp.data_competencia,
         (cp.valor * coalesce(cp.percentual_rateio, 100) / 100)::numeric
    from public.contas_pagar cp
    left join public.dre_categorias c on c.id = cp.id_categoria
   where cp.status <> 'cancelado'
  union all
  -- despesas: parte remanescente atribuída à loja de origem do rateio
  select cp.id_loja_rateio_origem, cp.id_categoria, coalesce(c.nome,'Outras despesas'), 'despesa',
         cp.data_competencia,
         (cp.valor * (100 - coalesce(cp.percentual_rateio, 100)) / 100)::numeric
    from public.contas_pagar cp
    left join public.dre_categorias c on c.id = cp.id_categoria
   where cp.status <> 'cancelado'
     and cp.id_loja_rateio_origem is not null
     and coalesce(cp.percentual_rateio, 100) < 100;
grant select on public.vw_dre_competencia to authenticated;

create or replace view public.vw_orcado_realizado
with (security_invoker = on) as
  with realizado as (
    select id_loja, id_categoria,
           extract(year from data_competencia)::int as ano,
           extract(month from data_competencia)::int as mes,
           sum(valor)::numeric as realizado
      from public.vw_dre_competencia
     where id_categoria is not null and id_loja is not null
     group by 1,2,3,4
  )
  select coalesce(o.id_loja, r.id_loja) as id_loja,
         coalesce(o.id_categoria, r.id_categoria) as id_categoria,
         coalesce(o.ano, r.ano) as ano,
         coalesce(o.mes, r.mes) as mes,
         coalesce(o.valor, 0)::numeric as orcado,
         coalesce(r.realizado, 0)::numeric as realizado,
         case when coalesce(o.valor,0) = 0 then null
              else round(((coalesce(r.realizado,0) - o.valor) / o.valor) * 100, 2) end as variacao_pct
    from public.orcamentos o
    full outer join realizado r
      on r.id_loja = o.id_loja and r.id_categoria = o.id_categoria
     and r.ano = o.ano and r.mes = o.mes;
grant select on public.vw_orcado_realizado to authenticated;