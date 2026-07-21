
-- 1) Prevent gerente from editing their own profile row (self role escalation guard)
DROP POLICY IF EXISTS perfis_gerente_update ON public.usuarios_perfis;
CREATE POLICY perfis_gerente_update ON public.usuarios_perfis
  FOR UPDATE
  TO authenticated
  USING (
    public."current_role"() = 'gerente'::app_role
    AND id_loja = public.current_loja()
    AND id <> auth.uid()
  )
  WITH CHECK (
    public."current_role"() = 'gerente'::app_role
    AND id_loja = public.current_loja()
    AND id <> auth.uid()
    AND role = ANY (ARRAY['analista'::app_role, 'operador'::app_role])
  );

-- 2) Belt-and-suspenders: forbid DELETE of fixed DRE categories via restrictive policy
DROP POLICY IF EXISTS dre_cat_no_delete_fixo ON public.dre_categorias;
CREATE POLICY dre_cat_no_delete_fixo ON public.dre_categorias
  AS RESTRICTIVE
  FOR DELETE
  TO authenticated
  USING (fixo = false);

-- 3) Revoke EXECUTE from authenticated on SECURITY DEFINER functions
--    that don't need to be callable by end users.
REVOKE EXECUTE ON FUNCTION public.add_dias_uteis(date, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.calcular_comissao(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_atualizar_status_atrasados() FROM PUBLIC, anon, authenticated;
