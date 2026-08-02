CREATE OR REPLACE FUNCTION private.can_access_loja(p_loja uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select private.is_global() or p_loja = private.current_loja();
$function$;

REVOKE EXECUTE ON FUNCTION private.can_access_loja(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_access_loja(uuid) TO authenticated, service_role;