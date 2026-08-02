CREATE OR REPLACE FUNCTION public.fn_atualizar_status_atrasados()
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  update public.vendas_ucase
     set status_conciliacao = 'atrasado'
   where status_conciliacao = 'pendente'
     and meio_pagamento <> 'a_vista'
     and data_prevista_recebimento is not null
     and data_prevista_recebimento < current_date
     and private.can_access_loja(id_loja);
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_atualizar_status_atrasados() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_atualizar_status_atrasados() TO authenticated, service_role;