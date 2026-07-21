
-- 1. Revoke EXECUTE from anon (and PUBLIC) on SECURITY DEFINER helper functions.
--    Trigger functions get EXECUTE revoked from PUBLIC entirely (triggers run as table owner).
--    App-callable helpers keep EXECUTE for authenticated/service_role only.

REVOKE ALL ON FUNCTION public.can_access_loja(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_master() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_global() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public."current_role"() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_loja() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.calcular_comissao(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_atualizar_status_atrasados() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.add_dias_uteis(date, integer) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.can_access_loja(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_master() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_global() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."current_role"() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_loja() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.calcular_comissao(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_atualizar_status_atrasados() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.add_dias_uteis(date, integer) TO authenticated, service_role;

-- Trigger-only functions: not callable from the API at all.
REVOKE ALL ON FUNCTION public.fn_pos_conciliacao_mov() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_pos_conciliacao() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_conta_pagar_concilia() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_conta_pagar_pos() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_calc_previsao_venda() FROM PUBLIC, anon, authenticated;

-- 2. Tighten reference-data SELECT policies from `auth.uid() IS NOT NULL` to
--    `TO authenticated USING (true)` so they are explicit and not readable
--    via the anon role. Writes remain admin-only via existing policies.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename IN ('cartoes','financeiras','tipos_loja','feriados','dre_grupos')
       AND cmd = 'SELECT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

CREATE POLICY "Authenticated can read cartoes" ON public.cartoes
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can read financeiras" ON public.financeiras
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can read tipos_loja" ON public.tipos_loja
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can read feriados" ON public.feriados
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can read dre_grupos" ON public.dre_grupos
  FOR SELECT TO authenticated USING (true);

-- Ensure anon has no table-level SELECT grant on these reference tables.
REVOKE SELECT ON public.cartoes, public.financeiras, public.tipos_loja,
                 public.feriados, public.dre_grupos FROM anon;

-- 3. Add an explicit restrictive INSERT policy on usuarios_perfis so no
--    signed-in user can self-insert a profile row (and thus self-assign a
--    role). Profile creation goes through the `gerenciar-usuario` edge
--    function which uses the service_role and bypasses RLS.

DROP POLICY IF EXISTS "No client-side inserts on usuarios_perfis" ON public.usuarios_perfis;
CREATE POLICY "No client-side inserts on usuarios_perfis"
  ON public.usuarios_perfis
  AS RESTRICTIVE
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (false);
