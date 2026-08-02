-- ============ ENUMS ============
DO $$ BEGIN CREATE TYPE public.status_conta_receber AS ENUM ('aberto','recebido','cancelado'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.origem_receber AS ENUM ('venda','caixa','manual'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.status_caixa AS ENUM ('aberto','fechado'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.tipo_caixa_lancamento AS ENUM ('entrada','saida','sangria','suprimento'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ FORNECEDORES ============
CREATE TABLE public.fornecedores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_loja uuid REFERENCES public.lojas(id) ON DELETE CASCADE,
  nome text NOT NULL,
  documento text,
  telefone text,
  email text,
  observacao text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fornecedores TO authenticated;
GRANT ALL ON public.fornecedores TO service_role;
ALTER TABLE public.fornecedores ENABLE ROW LEVEL SECURITY;
CREATE POLICY forn_select ON public.fornecedores FOR SELECT TO authenticated
  USING (id_loja IS NULL OR private.can_access_loja(id_loja));
CREATE POLICY forn_write ON public.fornecedores FOR ALL TO authenticated
  USING ((id_loja IS NULL OR private.can_access_loja(id_loja)) AND NOT private.is_master())
  WITH CHECK ((id_loja IS NULL OR private.can_access_loja(id_loja)) AND NOT private.is_master());

-- ============ CLIENTES ============
CREATE TABLE public.clientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_loja uuid REFERENCES public.lojas(id) ON DELETE CASCADE,
  nome text NOT NULL,
  documento text,
  telefone text,
  email text,
  observacao text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clientes TO authenticated;
GRANT ALL ON public.clientes TO service_role;
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
CREATE POLICY cli_select ON public.clientes FOR SELECT TO authenticated
  USING (id_loja IS NULL OR private.can_access_loja(id_loja));
CREATE POLICY cli_write ON public.clientes FOR ALL TO authenticated
  USING ((id_loja IS NULL OR private.can_access_loja(id_loja)) AND NOT private.is_master())
  WITH CHECK ((id_loja IS NULL OR private.can_access_loja(id_loja)) AND NOT private.is_master());

-- ============ COMISSAO REGRAS ============
CREATE TABLE public.comissao_regras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_loja uuid NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
  id_vendedor uuid REFERENCES public.usuarios_perfis(id) ON DELETE CASCADE,
  valor_min numeric(14,2) NOT NULL DEFAULT 0,
  valor_max numeric(14,2),
  percentual numeric(6,3) NOT NULL DEFAULT 0,
  vigencia_inicio date NOT NULL DEFAULT current_date,
  ativa boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.comissao_regras TO authenticated;
GRANT ALL ON public.comissao_regras TO service_role;
ALTER TABLE public.comissao_regras ENABLE ROW LEVEL SECURITY;
CREATE POLICY comreg_select ON public.comissao_regras FOR SELECT TO authenticated
  USING (private.can_access_loja(id_loja));
CREATE POLICY comreg_write ON public.comissao_regras FOR ALL TO authenticated
  USING (private.is_admin()) WITH CHECK (private.is_admin());

INSERT INTO public.comissao_regras (id_loja, valor_min, valor_max, percentual, ativa)
SELECT id_loja, valor_min, valor_max, percentual, ativa FROM public.comissao_faixas;

-- ============ CONTAS A RECEBER ============
CREATE TABLE public.contas_receber (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_loja uuid NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
  origem public.origem_receber NOT NULL DEFAULT 'manual',
  id_cliente uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  id_categoria uuid REFERENCES public.dre_categorias(id) ON DELETE SET NULL,
  id_venda_ucase uuid REFERENCES public.vendas_ucase(id) ON DELETE CASCADE,
  descricao text NOT NULL,
  valor numeric(14,2) NOT NULL,
  valor_recebido numeric(14,2),
  data_vencimento date NOT NULL DEFAULT current_date,
  data_recebimento date,
  id_conta_bancaria uuid REFERENCES public.contas_bancarias(id) ON DELETE SET NULL,
  id_extrato_lancamento uuid REFERENCES public.extrato_lancamentos(id) ON DELETE SET NULL,
  status public.status_conta_receber NOT NULL DEFAULT 'aberto',
  observacao text,
  criado_por uuid REFERENCES public.usuarios_perfis(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contas_receber TO authenticated;
GRANT ALL ON public.contas_receber TO service_role;
ALTER TABLE public.contas_receber ENABLE ROW LEVEL SECURITY;
CREATE POLICY cr_select ON public.contas_receber FOR SELECT TO authenticated
  USING (private.can_access_loja(id_loja));
CREATE POLICY cr_write ON public.contas_receber FOR ALL TO authenticated
  USING (private.can_access_loja(id_loja) AND NOT private.is_master())
  WITH CHECK (private.can_access_loja(id_loja) AND NOT private.is_master());

-- ============ CAIXA ============
CREATE TABLE public.caixas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_loja uuid NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
  aberto_por uuid REFERENCES public.usuarios_perfis(id),
  fechado_por uuid REFERENCES public.usuarios_perfis(id),
  data_abertura timestamptz NOT NULL DEFAULT now(),
  data_fechamento timestamptz,
  saldo_inicial numeric(14,2) NOT NULL DEFAULT 0,
  saldo_inicial_esperado numeric(14,2) NOT NULL DEFAULT 0,
  saldo_final_informado numeric(14,2),
  saldo_final_calculado numeric(14,2),
  divergencia_abertura numeric(14,2) NOT NULL DEFAULT 0,
  divergencia_fechamento numeric(14,2),
  status public.status_caixa NOT NULL DEFAULT 'aberto',
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX caixas_um_aberto_por_loja ON public.caixas (id_loja) WHERE status = 'aberto';
GRANT SELECT, INSERT, UPDATE, DELETE ON public.caixas TO authenticated;
GRANT ALL ON public.caixas TO service_role;
ALTER TABLE public.caixas ENABLE ROW LEVEL SECURITY;
CREATE POLICY caixa_select ON public.caixas FOR SELECT TO authenticated
  USING (private.can_access_loja(id_loja));
CREATE POLICY caixa_write ON public.caixas FOR ALL TO authenticated
  USING (private.can_access_loja(id_loja) AND NOT private.is_master())
  WITH CHECK (private.can_access_loja(id_loja) AND NOT private.is_master());

CREATE TABLE public.caixa_lancamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_caixa uuid NOT NULL REFERENCES public.caixas(id) ON DELETE CASCADE,
  id_loja uuid NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
  tipo public.tipo_caixa_lancamento NOT NULL,
  valor numeric(14,2) NOT NULL,
  descricao text NOT NULL,
  id_categoria uuid REFERENCES public.dre_categorias(id) ON DELETE SET NULL,
  id_cliente uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  id_fornecedor uuid REFERENCES public.fornecedores(id) ON DELETE SET NULL,
  forma_pagamento text,
  criado_por uuid REFERENCES public.usuarios_perfis(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.caixa_lancamentos TO authenticated;
GRANT ALL ON public.caixa_lancamentos TO service_role;
ALTER TABLE public.caixa_lancamentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY caixalanc_select ON public.caixa_lancamentos FOR SELECT TO authenticated
  USING (private.can_access_loja(id_loja));
CREATE POLICY caixalanc_write ON public.caixa_lancamentos FOR ALL TO authenticated
  USING (private.can_access_loja(id_loja) AND NOT private.is_master())
  WITH CHECK (private.can_access_loja(id_loja) AND NOT private.is_master());

-- ============ COLUNAS NOVAS ============
ALTER TABLE public.contas_bancarias
  ADD COLUMN IF NOT EXISTS saldo_inicial numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS data_saldo_inicial date NOT NULL DEFAULT current_date;

ALTER TABLE public.vendas_ucase
  ADD COLUMN IF NOT EXISTS id_vendedor uuid REFERENCES public.usuarios_perfis(id) ON DELETE SET NULL;

ALTER TABLE public.contas_pagar
  ADD COLUMN IF NOT EXISTS id_fornecedor uuid REFERENCES public.fornecedores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS id_venda_origem uuid REFERENCES public.vendas_ucase(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS id_vendedor uuid REFERENCES public.usuarios_perfis(id) ON DELETE SET NULL;

ALTER TABLE public.movimentacoes
  ADD COLUMN IF NOT EXISTS id_fornecedor uuid REFERENCES public.fornecedores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS id_cliente uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS liquidado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS data_liquidacao date;

ALTER TABLE public.extrato_lancamentos
  ADD COLUMN IF NOT EXISTS id_categoria uuid REFERENCES public.dre_categorias(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS id_fornecedor uuid REFERENCES public.fornecedores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS id_cliente uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS classificado boolean NOT NULL DEFAULT false;

-- ============ TRIGGER updated_at ============
CREATE OR REPLACE FUNCTION public.fn_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
REVOKE EXECUTE ON FUNCTION public.fn_touch_updated_at() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_forn_upd BEFORE UPDATE ON public.fornecedores FOR EACH ROW EXECUTE FUNCTION public.fn_touch_updated_at();
CREATE TRIGGER trg_cli_upd BEFORE UPDATE ON public.clientes FOR EACH ROW EXECUTE FUNCTION public.fn_touch_updated_at();
CREATE TRIGGER trg_comreg_upd BEFORE UPDATE ON public.comissao_regras FOR EACH ROW EXECUTE FUNCTION public.fn_touch_updated_at();
CREATE TRIGGER trg_cr_upd BEFORE UPDATE ON public.contas_receber FOR EACH ROW EXECUTE FUNCTION public.fn_touch_updated_at();
CREATE TRIGGER trg_caixa_upd BEFORE UPDATE ON public.caixas FOR EACH ROW EXECUTE FUNCTION public.fn_touch_updated_at();

-- baixa automática de contas a receber
CREATE OR REPLACE FUNCTION public.fn_conta_receber_pos()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status = 'recebido' THEN
    IF NEW.data_recebimento IS NULL THEN NEW.data_recebimento := current_date; END IF;
    IF NEW.valor_recebido IS NULL THEN NEW.valor_recebido := NEW.valor; END IF;
  ELSE
    NEW.data_recebimento := NULL;
    NEW.valor_recebido := NULL;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_conta_receber_pos() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_cr_pos BEFORE INSERT OR UPDATE ON public.contas_receber FOR EACH ROW EXECUTE FUNCTION public.fn_conta_receber_pos();

-- ============ VIEWS ============
CREATE OR REPLACE VIEW public.vw_saldos_contas WITH (security_invoker = true) AS
SELECT cb.id AS id_conta_bancaria,
       cb.id_loja,
       cb.banco, cb.agencia, cb.conta,
       cb.saldo_inicial,
       cb.saldo_inicial
         + COALESCE((SELECT sum(e.valor) FROM public.extrato_lancamentos e WHERE e.id_conta_bancaria = cb.id), 0)
         + COALESCE((SELECT sum(cr.valor_recebido) FROM public.contas_receber cr
                      WHERE cr.id_conta_bancaria = cb.id AND cr.status = 'recebido' AND cr.id_extrato_lancamento IS NULL), 0)
         - COALESCE((SELECT sum(cp.valor) FROM public.contas_pagar cp
                      WHERE cp.id_conta_bancaria = cb.id AND cp.status = 'pago' AND cp.id_extrato_lancamento IS NULL), 0)
       AS saldo_atual
  FROM public.contas_bancarias cb;
GRANT SELECT ON public.vw_saldos_contas TO authenticated;

DROP VIEW IF EXISTS public.vw_extrato_financeiro;
CREATE VIEW public.vw_extrato_financeiro WITH (security_invoker = true) AS
SELECT v.id, v.id_loja, 'venda_ucase'::text AS origem, 'venda'::text AS tipo,
       v.data_venda::date AS data_movimento,
       COALESCE(CASE v.meio_pagamento WHEN 'cartao' THEN c.nome WHEN 'financeira' THEN f.nome ELSE 'À vista' END, 'Ucase') AS descricao,
       v.valor_liquido_previsto AS valor,
       'receita'::text AS natureza,
       NULL::uuid AS id_categoria,
       'Receita Bruta'::text AS grupo_dre,
       'Vendas ' || COALESCE(CASE v.meio_pagamento WHEN 'cartao' THEN c.nome WHEN 'financeira' THEN f.nome ELSE 'À vista' END, 'Ucase') AS categoria_dre,
       NULL::uuid AS id_conta_bancaria,
       v.status_conciliacao,
       (v.status_conciliacao = 'conciliado') AS liquidado,
       CASE WHEN v.status_conciliacao = 'conciliado' THEN v.data_prevista_recebimento END AS data_liquidacao,
       NULL::text AS contraparte,
       v.created_at
  FROM public.vendas_ucase v
  LEFT JOIN public.cartoes c ON c.id = v.id_cartao
  LEFT JOIN public.financeiras f ON f.id = v.id_financeira
UNION ALL
SELECT m.id, m.id_loja, 'manual'::text, m.tipo::text, m.data_movimento, m.descricao, m.valor,
       CASE WHEN m.tipo = 'despesa' THEN 'despesa' ELSE 'receita' END,
       m.id_categoria,
       COALESCE(g.nome, '—'), COALESCE(cat.nome, '—'),
       m.id_conta_bancaria, m.status_conciliacao,
       m.liquidado, m.data_liquidacao,
       COALESCE(fo.nome, cl.nome),
       m.created_at
  FROM public.movimentacoes m
  LEFT JOIN public.dre_categorias cat ON cat.id = m.id_categoria
  LEFT JOIN public.dre_grupos g ON g.id = cat.id_grupo
  LEFT JOIN public.fornecedores fo ON fo.id = m.id_fornecedor
  LEFT JOIN public.clientes cl ON cl.id = m.id_cliente
UNION ALL
SELECT cp.id, cp.id_loja, 'conta_pagar'::text, 'despesa'::text, cp.data_vencimento, cp.descricao, cp.valor,
       'despesa'::text, cp.id_categoria,
       COALESCE(g2.nome, '—'), COALESCE(cat2.nome, '—'),
       cp.id_conta_bancaria,
       CASE WHEN cp.status = 'pago' THEN 'conciliado'::status_conciliacao ELSE 'pendente'::status_conciliacao END,
       (cp.status = 'pago'), cp.data_pagamento,
       COALESCE(fo2.nome, cp.fornecedor),
       cp.created_at
  FROM public.contas_pagar cp
  LEFT JOIN public.dre_categorias cat2 ON cat2.id = cp.id_categoria
  LEFT JOIN public.dre_grupos g2 ON g2.id = cat2.id_grupo
  LEFT JOIN public.fornecedores fo2 ON fo2.id = cp.id_fornecedor
  WHERE cp.status <> 'cancelado'
UNION ALL
SELECT cr.id, cr.id_loja, 'conta_receber'::text, 'venda'::text, cr.data_vencimento, cr.descricao, cr.valor,
       'receita'::text, cr.id_categoria,
       COALESCE(g3.nome, 'Receita Bruta'), COALESCE(cat3.nome, '—'),
       cr.id_conta_bancaria,
       CASE WHEN cr.status = 'recebido' THEN 'conciliado'::status_conciliacao ELSE 'pendente'::status_conciliacao END,
       (cr.status = 'recebido'), cr.data_recebimento,
       cl3.nome,
       cr.created_at
  FROM public.contas_receber cr
  LEFT JOIN public.dre_categorias cat3 ON cat3.id = cr.id_categoria
  LEFT JOIN public.dre_grupos g3 ON g3.id = cat3.id_grupo
  LEFT JOIN public.clientes cl3 ON cl3.id = cr.id_cliente
  WHERE cr.status <> 'cancelado' AND cr.origem <> 'venda';
GRANT SELECT ON public.vw_extrato_financeiro TO authenticated;