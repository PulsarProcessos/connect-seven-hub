DROP TRIGGER IF EXISTS trg_pos_conciliacao ON public.conciliacao_extrato;
CREATE TRIGGER trg_pos_conciliacao
AFTER INSERT ON public.conciliacao_extrato
FOR EACH ROW EXECUTE FUNCTION public.fn_pos_conciliacao();