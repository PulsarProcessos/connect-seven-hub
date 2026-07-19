create table if not exists public.feriados (
  data       date primary key,
  descricao  text not null,
  created_at timestamptz not null default now()
);
grant select on public.feriados to authenticated;
grant all on public.feriados to service_role;
alter table public.feriados enable row level security;
drop policy if exists feriados_select on public.feriados;
create policy feriados_select on public.feriados for select using (auth.uid() is not null);
drop policy if exists feriados_admin on public.feriados;
create policy feriados_admin on public.feriados for all using (public.is_admin()) with check (public.is_admin());

insert into public.feriados (data, descricao) values
  ('2025-01-01','Confraternização Universal'),
  ('2025-03-03','Carnaval'),('2025-03-04','Carnaval'),
  ('2025-04-18','Sexta-feira Santa'),('2025-04-21','Tiradentes'),
  ('2025-05-01','Dia do Trabalho'),('2025-06-19','Corpus Christi'),
  ('2025-09-07','Independência'),('2025-10-12','Nossa Senhora Aparecida'),
  ('2025-11-02','Finados'),('2025-11-15','Proclamação da República'),
  ('2025-11-20','Consciência Negra'),('2025-12-25','Natal'),
  ('2026-01-01','Confraternização Universal'),
  ('2026-02-16','Carnaval'),('2026-02-17','Carnaval'),
  ('2026-04-03','Sexta-feira Santa'),('2026-04-21','Tiradentes'),
  ('2026-05-01','Dia do Trabalho'),('2026-06-04','Corpus Christi'),
  ('2026-09-07','Independência'),('2026-10-12','Nossa Senhora Aparecida'),
  ('2026-11-02','Finados'),('2026-11-15','Proclamação da República'),
  ('2026-11-20','Consciência Negra'),('2026-12-25','Natal'),
  ('2027-01-01','Confraternização Universal'),
  ('2027-02-08','Carnaval'),('2027-02-09','Carnaval'),
  ('2027-03-26','Sexta-feira Santa'),('2027-04-21','Tiradentes'),
  ('2027-05-01','Dia do Trabalho'),('2027-05-27','Corpus Christi'),
  ('2027-09-07','Independência'),('2027-10-12','Nossa Senhora Aparecida'),
  ('2027-11-02','Finados'),('2027-11-15','Proclamação da República'),
  ('2027-11-20','Consciência Negra'),('2027-12-25','Natal')
on conflict (data) do nothing;

create or replace function public.add_dias_uteis(p_data date, p_dias int)
returns date language plpgsql immutable security definer set search_path = public
as $$
declare
  v_data date := p_data;
  v_restantes int := greatest(p_dias, 0);
begin
  while v_restantes > 0 loop
    v_data := v_data + 1;
    if extract(dow from v_data) not in (0, 6)
       and not exists (select 1 from public.feriados f where f.data = v_data) then
      v_restantes := v_restantes - 1;
    end if;
  end loop;
  return v_data;
end;
$$;

create or replace function public.fn_calc_previsao_venda()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v_taxa  decimal(6,3);
  v_prazo int;
begin
  select taxa_padrao, prazo_recebimento_dias into v_taxa, v_prazo
    from public.financeiras where id = new.id_financeira;
  new.valor_liquido_previsto := round(new.valor_bruto - (new.valor_bruto * coalesce(v_taxa,0) / 100), 2);
  new.data_prevista_recebimento := public.add_dias_uteis(new.data_venda::date, coalesce(v_prazo,0));
  new.mes_venda := to_char(new.data_venda, 'YYYY-MM');
  return new;
end;
$$;