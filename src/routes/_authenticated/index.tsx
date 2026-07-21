import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Building2, Layers, TrendingUp, AlertTriangle, Wallet } from "lucide-react";
import { AppLayout } from "@/components/app-layout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [{ title: "Visão Geral · Connect 7" }, { name: "robots", content: "noindex" }],
  }),
  component: VisaoGeralPage,
});

type ResumoLoja = {
  id_loja: string;
  nome_fantasia: string;
  tipo_socio: "propria" | "franqueado";
  ativa: boolean;
  total_bruto_mes: number;
  total_liquido_mes: number;
  qtd_vendas_mes: number;
  vendas_pendentes: number;
  vendas_atrasadas: number;
  contas_pagar_aberto: number;
  contas_pagar_vencidas: number;
};

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const fmt = (v: unknown) => BRL.format(Number(v ?? 0) || 0);

function VisaoGeralPage() {
  const { profile, setSelectedLojaId } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<ResumoLoja[]>([]);
  const [loading, setLoading] = useState(true);

  const isGlobal = profile?.role === "administrador" || profile?.role === "master";

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("vw_resumo_lojas")
        .select("*")
        .eq("ativa", true)
        .order("nome_fantasia");
      setRows((data ?? []) as unknown as ResumoLoja[]);
      setLoading(false);
    })();
  }, []);

  // Usuário de loja única não vê blocos: vai direto para o dashboard da sua loja
  useEffect(() => {
    if (!profile || isGlobal) return;
    if (profile.id_loja) {
      setSelectedLojaId(profile.id_loja);
      navigate({ to: "/dashboard-vendas", replace: true });
    }
  }, [profile, isGlobal, navigate, setSelectedLojaId]);

  const consolidado = useMemo(
    () =>
      rows.reduce(
        (acc, r) => ({
          bruto: acc.bruto + Number(r.total_bruto_mes ?? 0),
          liquido: acc.liquido + Number(r.total_liquido_mes ?? 0),
          vendas: acc.vendas + Number(r.qtd_vendas_mes ?? 0),
          atrasadas: acc.atrasadas + Number(r.vendas_atrasadas ?? 0),
          aPagar: acc.aPagar + Number(r.contas_pagar_aberto ?? 0),
          vencidas: acc.vencidas + Number(r.contas_pagar_vencidas ?? 0),
        }),
        { bruto: 0, liquido: 0, vendas: 0, atrasadas: 0, aPagar: 0, vencidas: 0 },
      ),
    [rows],
  );

  const abrir = (lojaId: string | null) => {
    setSelectedLojaId(lojaId);
    navigate({ to: "/dashboard-vendas" });
  };

  if (!isGlobal) {
    return (
      <AppLayout>
        <p className="text-sm text-muted-foreground">Redirecionando…</p>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div>
        <h1 className="text-xl font-semibold">Visão Geral</h1>
        <p className="text-sm text-muted-foreground">
          Selecione uma unidade para analisar, ou veja o consolidado do grupo.
        </p>
      </div>

      {loading ? (
        <p className="mt-8 text-sm text-muted-foreground">Carregando unidades…</p>
      ) : (
        <>
          <button
            onClick={() => abrir(null)}
            className="mt-6 flex w-full flex-col gap-4 rounded-lg border-2 border-primary/30 bg-primary/5 p-5 text-left transition-colors hover:border-primary/60"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Layers className="h-5 w-5 text-primary" />
              <span className="font-semibold text-primary">Consolidado do grupo</span>
              <span className="ml-auto text-xs text-muted-foreground">
                {rows.length} unidade(s) · mês corrente
              </span>
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Metric label="Vendas (bruto)" value={fmt(consolidado.bruto)} />
              <Metric label="Líquido previsto" value={fmt(consolidado.liquido)} />
              <Metric label="A pagar em aberto" value={fmt(consolidado.aPagar)} />
              <Metric
                label="Alertas"
                value={String(consolidado.atrasadas + consolidado.vencidas)}
                danger={consolidado.atrasadas + consolidado.vencidas > 0}
              />
            </div>
          </button>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((r) => {
              const alertas =
                Number(r.vendas_atrasadas ?? 0) + Number(r.contas_pagar_vencidas ?? 0);
              return (
                <button
                  key={r.id_loja}
                  onClick={() => abrir(r.id_loja)}
                  className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 text-left transition-all hover:border-primary/50 hover:shadow-sm"
                >
                  <div className="flex items-start gap-2">
                    <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{r.nome_fantasia}</div>
                      <span
                        className={`mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          r.tipo_socio === "propria"
                            ? "bg-primary/10 text-primary"
                            : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {r.tipo_socio === "propria" ? "Loja Própria" : "Franqueado"}
                      </span>
                    </div>
                    {alertas > 0 && (
                      <span className="flex shrink-0 items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
                        <AlertTriangle className="h-3 w-3" />
                        {alertas}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3 border-t border-border pt-3">
                    <div>
                      <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <TrendingUp className="h-3 w-3" />
                        Vendas do mês
                      </div>
                      <div className="mt-0.5 font-mono text-sm font-medium">
                        {fmt(r.total_bruto_mes)}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {Number(r.qtd_vendas_mes ?? 0)} lançamento(s)
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Wallet className="h-3 w-3" />A pagar
                      </div>
                      <div className="mt-0.5 font-mono text-sm font-medium">
                        {fmt(r.contas_pagar_aberto)}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {Number(r.contas_pagar_vencidas ?? 0)} vencida(s)
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {rows.length === 0 && (
            <p className="mt-8 text-sm text-muted-foreground">
              Nenhuma unidade ativa cadastrada.
            </p>
          )}
        </>
      )}
    </AppLayout>
  );
}

function Metric({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={`mt-0.5 font-mono text-sm font-semibold ${danger ? "text-destructive" : ""}`}>
        {value}
      </div>
    </div>
  );
}
