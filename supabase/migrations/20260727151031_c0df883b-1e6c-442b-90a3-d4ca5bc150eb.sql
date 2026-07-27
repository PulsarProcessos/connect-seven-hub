CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

ALTER FUNCTION public.is_admin() SET SCHEMA private;
ALTER FUNCTION public.is_global() SET SCHEMA private;
ALTER FUNCTION public.is_master() SET SCHEMA private;
ALTER FUNCTION public."current_role"() SET SCHEMA private;
ALTER FUNCTION public.current_loja() SET SCHEMA private;
ALTER FUNCTION public.can_access_loja(uuid) SET SCHEMA private;

ALTER FUNCTION private.is_admin() SET search_path = public;
ALTER FUNCTION private.is_global() SET search_path = public;
ALTER FUNCTION private.is_master() SET search_path = public;
ALTER FUNCTION private."current_role"() SET search_path = public;
ALTER FUNCTION private.current_loja() SET search_path = public;
ALTER FUNCTION private.can_access_loja(uuid) SET search_path = public;

REVOKE ALL ON FUNCTION private.is_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.is_global() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.is_master() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private."current_role"() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.current_loja() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.can_access_loja(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION private.is_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_global() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_master() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private."current_role"() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.current_loja() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.can_access_loja(uuid) TO authenticated, service_role;