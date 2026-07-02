
create extension if not exists "uuid-ossp";

do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type app_role as enum ('administrador','master','gerente','analista','operador');
  end if;
  if not exists (select 1 from pg_type where typname = 'status_conciliacao') then
    create type status_conciliacao as enum ('pendente','conciliado','atrasado');
  end if;
end$$;

-- LOJAS
create table if not exists public.lojas (
  id            uuid primary key default uuid_generate_v4(),
  nome_fantasia text        not null,
  cnpj          text        unique not null,
  tipo          text        not null default 'filial',
  ativa         boolean     not null default true,
  created_at    timestamptz not null default now()
);
grant select, insert, update, delete on public.lojas to authenticated;
grant all on public.lojas to service_role;

-- USUARIOS_PERFIS
create table if not exists public.usuarios_perfis (
  id          uuid primary key references auth.users(id) on delete cascade,
  id_loja     uuid references public.lojas(id) on delete restrict,
  nome        text not null,
  email       text not null,
  role        app_role not null default 'operador',
  ativo       boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists idx_perfis_loja on public.usuarios_perfis(id_loja);
create index if not exists idx_perfis_role on public.usuarios_perfis(role);
grant select, insert, update, delete on public.usuarios_perfis to authenticated;
grant all on public.usuarios_perfis to service_role;

-- FINANCEIRAS
create table if not exists public.financeiras (
  id                     uuid primary key default uuid_generate_v4(),
  nome                   text not null,
  taxa_padrao            decimal(6,3) not null default 0,
  prazo_recebimento_dias int not null default 30,
  ativa                  boolean not null default true,
  created_at             timestamptz not null default now()
);
grant select, insert, update, delete on public.financeiras to authenticated;
grant all on public.financeiras to service_role;

-- CONTAS_BANCARIAS
create table if not exists public.contas_bancarias (
  id         uuid primary key default uuid_generate_v4(),
  id_loja    uuid not null references public.lojas(id) on delete cascade,
  banco      text not null,
  agencia    text not null,
  conta      text not null,
  ativa      boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_contas_loja on public.contas_bancarias(id_loja);
grant select, insert, update, delete on public.contas_bancarias to authenticated;
grant all on public.contas_bancarias to service_role;

-- IMPORTACOES_UCASE
create table if not exists public.importacoes_ucase (
  id              uuid primary key default uuid_generate_v4(),
  id_loja         uuid not null references public.lojas(id) on delete cascade,
  nome_arquivo    text not null,
  total_registros int not null default 0,
  importado_por   uuid references public.usuarios_perfis(id),
  created_at      timestamptz not null default now()
);
create index if not exists idx_imp_ucase_loja on public.importacoes_ucase(id_loja);
grant select, insert, update, delete on public.importacoes_ucase to authenticated;
grant all on public.importacoes_ucase to service_role;

-- VENDAS_UCASE
create table if not exists public.vendas_ucase (
  id                     uuid primary key default uuid_generate_v4(),
  id_loja                uuid not null references public.lojas(id) on delete cascade,
  id_financeira          uuid not null references public.financeiras(id) on delete restrict,
  id_importacao          uuid references public.importacoes_ucase(id) on delete set null,
  data_venda             timestamptz not null,
  mes_venda              text not null default '',
  valor_bruto            decimal(14,2) not null,
  valor_liquido_previsto decimal(14,2) not null default 0,
  data_prevista_recebimento date,
  status_conciliacao     status_conciliacao not null default 'pendente',
  created_at             timestamptz not null default now()
);
create index if not exists idx_vendas_loja        on public.vendas_ucase(id_loja);
create index if not exists idx_vendas_financeira   on public.vendas_ucase(id_financeira);
create index if not exists idx_vendas_status       on public.vendas_ucase(status_conciliacao);
create index if not exists idx_vendas_mes          on public.vendas_ucase(mes_venda);
create index if not exists idx_vendas_data_prev    on public.vendas_ucase(data_prevista_recebimento);
grant select, insert, update, delete on public.vendas_ucase to authenticated;
grant all on public.vendas_ucase to service_role;

-- IMPORTACOES_EXTRATO
create table if not exists public.importacoes_extrato (
  id                 uuid primary key default uuid_generate_v4(),
  id_loja            uuid not null references public.lojas(id) on delete cascade,
  id_conta_bancaria  uuid not null references public.contas_bancarias(id) on delete cascade,
  nome_arquivo       text not null,
  total_lancamentos  int not null default 0,
  importado_por      uuid references public.usuarios_perfis(id),
  created_at         timestamptz not null default now()
);
create index if not exists idx_imp_ext_loja on public.importacoes_extrato(id_loja);
grant select, insert, update, delete on public.importacoes_extrato to authenticated;
grant all on public.importacoes_extrato to service_role;

-- EXTRATO_LANCAMENTOS
create table if not exists public.extrato_lancamentos (
  id                 uuid primary key default uuid_generate_v4(),
  id_loja            uuid not null references public.lojas(id) on delete cascade,
  id_conta_bancaria  uuid not null references public.contas_bancarias(id) on delete cascade,
  id_importacao      uuid references public.importacoes_extrato(id) on delete set null,
  data_lancamento    date not null,
  descricao          text,
  valor              decimal(14,2) not null,
  fitid              text,
  conciliado         boolean not null default false,
  created_at         timestamptz not null default now()
);
create index if not exists idx_extrato_loja  on public.extrato_lancamentos(id_loja);
create index if not exists idx_extrato_conta on public.extrato_lancamentos(id_conta_bancaria);
create index if not exists idx_extrato_data  on public.extrato_lancamentos(data_lancamento);
create unique index if not exists uq_extrato_fitid
  on public.extrato_lancamentos(id_conta_bancaria, fitid)
  where fitid is not null;
grant select, insert, update, delete on public.extrato_lancamentos to authenticated;
grant all on public.extrato_lancamentos to service_role;

-- CONCILIACAO_EXTRATO
create table if not exists public.conciliacao_extrato (
  id                   uuid primary key default uuid_generate_v4(),
  id_loja              uuid not null references public.lojas(id) on delete cascade,
  id_venda_ucase       uuid not null references public.vendas_ucase(id) on delete cascade,
  id_extrato_lancamento uuid references public.extrato_lancamentos(id) on delete set null,
  id_conta_bancaria    uuid not null references public.contas_bancarias(id) on delete restrict,
  data_identificacao   timestamptz not null default now(),
  valor_pago_banco     decimal(14,2) not null,
  tipo                 text not null default 'automatica',
  conciliado_por       uuid references public.usuarios_perfis(id),
  created_at           timestamptz not null default now()
);
create index if not exists idx_conc_loja  on public.conciliacao_extrato(id_loja);
create index if not exists idx_conc_venda on public.conciliacao_extrato(id_venda_ucase);
grant select, insert, update, delete on public.conciliacao_extrato to authenticated;
grant all on public.conciliacao_extrato to service_role;

-- FUNÇÕES AUXILIARES
create or replace function public.current_role()
returns app_role language sql stable security definer set search_path = public as $$
  select role from public.usuarios_perfis where id = auth.uid();
$$;

create or replace function public.current_loja()
returns uuid language sql stable security definer set search_path = public as $$
  select id_loja from public.usuarios_perfis where id = auth.uid();
$$;

create or replace function public.is_master()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'master' from public.usuarios_perfis where id = auth.uid()), false);
$$;

create or replace function public.is_global()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('administrador','master') from public.usuarios_perfis where id = auth.uid()), false);
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'administrador' from public.usuarios_perfis where id = auth.uid()), false);
$$;

create or replace function public.can_access_loja(p_loja uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_global() or p_loja = public.current_loja();
$$;

-- TRIGGERS
create or replace function public.fn_calc_previsao_venda()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_taxa  decimal(6,3);
  v_prazo int;
begin
  select taxa_padrao, prazo_recebimento_dias into v_taxa, v_prazo
    from public.financeiras where id = new.id_financeira;
  new.valor_liquido_previsto := round(new.valor_bruto - (new.valor_bruto * coalesce(v_taxa,0) / 100), 2);
  new.data_prevista_recebimento := (new.data_venda + (coalesce(v_prazo,0) || ' days')::interval)::date;
  new.mes_venda := to_char(new.data_venda, 'YYYY-MM');
  return new;
end;
$$;

drop trigger if exists trg_calc_previsao on public.vendas_ucase;
create trigger trg_calc_previsao
  before insert or update of valor_bruto, id_financeira, data_venda
  on public.vendas_ucase
  for each row execute function public.fn_calc_previsao_venda();

create or replace function public.fn_atualizar_status_atrasados()
returns void language sql security definer set search_path = public as $$
  update public.vendas_ucase
     set status_conciliacao = 'atrasado'
   where status_conciliacao = 'pendente'
     and data_prevista_recebimento is not null
     and data_prevista_recebimento < current_date;
$$;

create or replace function public.fn_pos_conciliacao()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.vendas_ucase set status_conciliacao = 'conciliado' where id = new.id_venda_ucase;
  if new.id_extrato_lancamento is not null then
    update public.extrato_lancamentos set conciliado = true where id = new.id_extrato_lancamento;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_pos_conciliacao on public.conciliacao_extrato;
create trigger trg_pos_conciliacao
  after insert on public.conciliacao_extrato
  for each row execute function public.fn_pos_conciliacao();

-- RLS
alter table public.lojas                enable row level security;
alter table public.usuarios_perfis      enable row level security;
alter table public.financeiras          enable row level security;
alter table public.contas_bancarias     enable row level security;
alter table public.importacoes_ucase    enable row level security;
alter table public.vendas_ucase         enable row level security;
alter table public.importacoes_extrato  enable row level security;
alter table public.extrato_lancamentos  enable row level security;
alter table public.conciliacao_extrato  enable row level security;

-- LOJAS policies
drop policy if exists lojas_select on public.lojas;
create policy lojas_select on public.lojas for select
  using (public.is_global() or id = public.current_loja());
drop policy if exists lojas_admin_all on public.lojas;
create policy lojas_admin_all on public.lojas for all
  using (public.is_admin()) with check (public.is_admin());

-- USUARIOS_PERFIS policies
drop policy if exists perfis_select on public.usuarios_perfis;
create policy perfis_select on public.usuarios_perfis for select
  using (
    id = auth.uid()
    or public.is_global()
    or (public.current_role() = 'gerente' and id_loja = public.current_loja())
  );
drop policy if exists perfis_admin_all on public.usuarios_perfis;
create policy perfis_admin_all on public.usuarios_perfis for all
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists perfis_gerente_update on public.usuarios_perfis;
create policy perfis_gerente_update on public.usuarios_perfis for update
  using (public.current_role() = 'gerente' and id_loja = public.current_loja())
  with check (
    public.current_role() = 'gerente'
    and id_loja = public.current_loja()
    and role in ('analista','operador')
  );

-- FINANCEIRAS policies
drop policy if exists fin_select on public.financeiras;
create policy fin_select on public.financeiras for select
  using (auth.uid() is not null);
drop policy if exists fin_admin_all on public.financeiras;
create policy fin_admin_all on public.financeiras for all
  using (public.is_admin()) with check (public.is_admin());

-- CONTAS_BANCARIAS policies
drop policy if exists contas_select on public.contas_bancarias;
create policy contas_select on public.contas_bancarias for select
  using (public.can_access_loja(id_loja));
drop policy if exists contas_write on public.contas_bancarias;
create policy contas_write on public.contas_bancarias for all
  using (
    public.is_admin()
    or (public.current_role() = 'gerente' and id_loja = public.current_loja())
  )
  with check (
    public.is_admin()
    or (public.current_role() = 'gerente' and id_loja = public.current_loja())
  );

-- IMPORTACOES_UCASE policies
drop policy if exists imp_ucase_select on public.importacoes_ucase;
create policy imp_ucase_select on public.importacoes_ucase for select
  using (public.can_access_loja(id_loja));
drop policy if exists imp_ucase_insert on public.importacoes_ucase;
create policy imp_ucase_insert on public.importacoes_ucase for insert
  with check (not public.is_master() and public.can_access_loja(id_loja));

-- VENDAS_UCASE policies
drop policy if exists vendas_select on public.vendas_ucase;
create policy vendas_select on public.vendas_ucase for select
  using (public.can_access_loja(id_loja));
drop policy if exists vendas_write on public.vendas_ucase;
create policy vendas_write on public.vendas_ucase for all
  using (not public.is_master() and public.can_access_loja(id_loja))
  with check (not public.is_master() and public.can_access_loja(id_loja));

-- IMPORTACOES_EXTRATO policies
drop policy if exists imp_ext_select on public.importacoes_extrato;
create policy imp_ext_select on public.importacoes_extrato for select
  using (public.can_access_loja(id_loja));
drop policy if exists imp_ext_insert on public.importacoes_extrato;
create policy imp_ext_insert on public.importacoes_extrato for insert
  with check (not public.is_master() and public.can_access_loja(id_loja));

-- EXTRATO_LANCAMENTOS policies
drop policy if exists extrato_select on public.extrato_lancamentos;
create policy extrato_select on public.extrato_lancamentos for select
  using (public.can_access_loja(id_loja));
drop policy if exists extrato_write on public.extrato_lancamentos;
create policy extrato_write on public.extrato_lancamentos for all
  using (not public.is_master() and public.can_access_loja(id_loja))
  with check (not public.is_master() and public.can_access_loja(id_loja));

-- CONCILIACAO_EXTRATO policies
drop policy if exists conc_select on public.conciliacao_extrato;
create policy conc_select on public.conciliacao_extrato for select
  using (public.can_access_loja(id_loja));
drop policy if exists conc_write on public.conciliacao_extrato;
create policy conc_write on public.conciliacao_extrato for all
  using (not public.is_master() and public.can_access_loja(id_loja))
  with check (not public.is_master() and public.can_access_loja(id_loja));
