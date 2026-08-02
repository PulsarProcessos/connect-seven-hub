import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { AppLayout } from "@/components/app-layout";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { fmtBRL } from "@/lib/money";

export const Route = createFileRoute("/_authenticated/dashboard-financeiro")({
  head: () => ({
    meta: [
      { title: "Dashboard Financeiro · Connect 7" },
      {
        name: "description",
        content: "DRE por categoria e fluxo de caixa projetado da sua loja.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DashboardFinanceiroPage,
});

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

const MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

const pad = (n: number) => String(n).padStart(2, "0");
const firstDay = (y: number, m: number) => `${y}-${pad(m)}-01`;
const lastDay = (y: number, m: number) => {
  const d = new Date(y, m, 0).getDate();
  return `${y}-${pad(m)}-${pad(d)}`;
};
const fmtDate = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString("pt-BR");
const todayISO = () => new Date().toISOString().slice(0, 10);
const pct = (v: number, base: number) =>
  base > 0 ? `${((v / base) * 100).toFixed(1).replace(".", ",")}%` : "—";

type ExtratoRow = {
  id: string;
  id_loja: string;
  origem: string;
  tipo: string;
  data_movimento: string;
  descricao: string;
  valor: number;
  natureza: string;
  id_categoria: string | null;
  grupo_dre: string;
  categoria_dre: string;
  status_conciliacao: string;
};

/* ------------------------------------------------------------------ */
/* page                                                                */
/* ------------------------------------------------------------------ */

function DashboardFinanceiroPage() {
  const { profile, selectedLojaId, lojas } = useAuth();
  const isGlobal = profile?.role === "administrador" || profile?.role === "master";
  // Usuários de loja ficam sempre travados na própria loja.
  const escopoLoja = isGlobal ? selectedLojaId : (profile?.id_loja ?? null);

  const now = new Date();
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [ano, setAno] = useState(now.getFullYear());

  const dtIni = firstDay(ano, mes);
  const dtFim = lastDay(ano, mes);

  const anos = useMemo(() => {
    const y = now.getFullYear();
    return [y - 2, y - 1, y, y + 1];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const nomeLoja = escopoLoja
    ? (lojas.find((l) => l.id === escopoLoja)?.nome ?? "Loja")
    : "Todas as lojas";

  return (
    <AppLayout>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Dashboard Financeiro</h1>
          <p className="text-sm text-muted-foreground">
            {nomeLoja} · {MESES[mes - 1]} de {ano}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid gap-1.5">
            <Label className="text-xs">Mês</Label>
            <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
              <SelectTrigger className="w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MESES.map((m, i) => (
                  <SelectItem key={m} value={String(i + 1)}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Ano</Label>
            <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
              <SelectTrigger className="w-[110px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {anos.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <Tabs defaultValue="dre" className="mt-5">
        <TabsList>
          <TabsTrigger value="dre">DRE</TabsTrigger>
          <TabsTrigger value="fluxo">Fluxo de Caixa</TabsTrigger>
        </TabsList>

        <TabsContent value="dre" className="mt-4">
          <DreSection escopoLoja={escopoLoja} dtIni={dtIni} dtFim={dtFim} />
        </TabsContent>

        <TabsContent value="fluxo" className="mt-4">
          <FluxoSection escopoLoja={escopoLoja} dtIni={dtIni} dtFim={dtFim} />
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
}

/* ------------------------------------------------------------------ */
/* DRE                                                                 */
/* ------------------------------------------------------------------ */

function DreSection({
  escopoLoja,
  dtIni,
  dtFim,
}: {
  escopoLoja: string | null;
  dtIni: string;
  dtFim: string;
}) {
  const [sel, setSel] = useState<{ key: string; label: string } | null>(null);
  const [fechados, setFechados] = useState<Record<string, boolean>>({});

  const q = useQuery({
    queryKey: ["dre_dashboard", { escopoLoja, dtIni, dtFim }],
    queryFn: async () => {
      let query = supabase
        .from("vw_extrato_financeiro")
        .select("*")
        .gte("data_movimento", dtIni)
        .lte("data_movimento", dtFim)
        .order("data_movimento", { ascending: false });
      if (escopoLoja) query = query.eq("id_loja", escopoLoja);
      const { data, error } = await query;
      if (error) throw error;
      return ((data ?? []) as ExtratoRow[])
        .filter((r) => r.tipo !== "transferencia")
        .map((r) => ({ ...r, valor: Number(r.valor) }));
    },
  });

  const rows = q.data ?? [];
  const catKey = (r: ExtratoRow) => r.id_categoria ?? `${r.grupo_dre}::${r.categoria_dre}`;

  const { grupos, receita, despesa } = useMemo(() => {
    const map = new Map<
      string,
      {
        nome: string;
        natureza: string;
        total: number;
        cats: Map<string, { key: string; nome: string; total: number }>;
      }
    >();
    let receita = 0;
    let despesa = 0;
    for (const r of rows) {
      if (r.natureza === "receita") receita += r.valor;
      else despesa += r.valor;
      const gk = `${r.natureza}::${r.grupo_dre}`;
      if (!map.has(gk))
        map.set(gk, {
          nome: r.grupo_dre,
          natureza: r.natureza,
          total: 0,
          cats: new Map(),
        });
      const g = map.get(gk)!;
      g.total += r.valor;
      const ck = catKey(r);
      const c = g.cats.get(ck) ?? { key: ck, nome: r.categoria_dre, total: 0 };
      c.total += r.valor;
      g.cats.set(ck, c);
    }
    const grupos = [...map.entries()]
      .map(([key, g]) => ({
        key,
        ...g,
        cats: [...g.cats.values()].sort((a, b) => b.total - a.total),
      }))
      .sort((a, b) =>
        a.natureza === b.natureza
          ? b.total - a.total
          : a.natureza === "receita"
            ? -1
            : 1,
      );
    return { grupos, receita, despesa };
  }, [rows]);

  const lancamentos = useMemo(() => {
    if (!sel) return rows;
    return rows.filter((r) => catKey(r) === sel.key || `${r.natureza}::${r.grupo_dre}` === sel.key);
  }, [rows, sel]);

  const totalSel = lancamentos.reduce((s, r) => s + r.valor, 0);

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard label="Receita" value={receita} tone="positive" />
        <KpiCard label="Despesas" value={despesa} tone="negative" />
        <KpiCard label="Resultado" value={receita - despesa} tone="neutral" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* DRE */}
        <div className="rounded-lg border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <div className="text-sm font-medium">DRE por categoria</div>
            <p className="text-xs text-muted-foreground">
              Clique em uma categoria para ver os lançamentos ao lado.
            </p>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Categoria</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="w-24 text-right">% Receita</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.isLoading ? (
                <TableRow>
                  <TableCell colSpan={3} className="py-10 text-center text-sm text-muted-foreground">
                    Carregando…
                  </TableCell>
                </TableRow>
              ) : grupos.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="py-10 text-center text-sm text-muted-foreground">
                    Nenhum lançamento no período.
                  </TableCell>
                </TableRow>
              ) : (
                grupos.map((g) => {
                  const aberto = !fechados[g.key];
                  return (
                    <>
                      <TableRow
                        key={g.key}
                        className="cursor-pointer bg-muted/40 font-medium"
                        onClick={() => {
                          setFechados((f) => ({ ...f, [g.key]: aberto }));
                          setSel({ key: g.key, label: g.nome });
                        }}
                      >
                        <TableCell className="flex items-center gap-1.5">
                          {aberto ? (
                            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                          {g.nome}
                        </TableCell>
                        <TableCell
                          className={`text-right font-mono ${
                            g.natureza === "receita" ? "text-emerald-600" : "text-rose-600"
                          }`}
                        >
                          {fmtBRL(g.total)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {pct(g.total, receita)}
                        </TableCell>
                      </TableRow>
                      {aberto &&
                        g.cats.map((c) => (
                          <TableRow
                            key={c.key}
                            data-state={sel?.key === c.key ? "selected" : undefined}
                            className="cursor-pointer"
                            onClick={() => setSel({ key: c.key, label: c.nome })}
                          >
                            <TableCell className="pl-8 text-sm">{c.nome}</TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {fmtBRL(c.total)}
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs text-muted-foreground">
                              {pct(c.total, receita)}
                            </TableCell>
                          </TableRow>
                        ))}
                    </>
                  );
                })
              )}
              {grupos.length > 0 && (
                <TableRow className="border-t-2 border-border font-semibold">
                  <TableCell>Resultado do período</TableCell>
                  <TableCell className="text-right font-mono">
                    {fmtBRL(receita - despesa)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {pct(receita - despesa, receita)}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Lançamentos */}
        <div className="rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <div className="text-sm font-medium">
                {sel ? `Lançamentos · ${sel.label}` : "Todos os lançamentos"}
              </div>
              <p className="text-xs text-muted-foreground">
                {lancamentos.length} registro(s) · total {fmtBRL(totalSel)}
              </p>
            </div>
            {sel && (
              <button
                className="text-xs text-primary hover:underline"
                onClick={() => setSel(null)}
              >
                Limpar seleção
              </button>
            )}
          </div>
          <div className="max-h-[520px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">Data</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lancamentos.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="py-10 text-center text-sm text-muted-foreground">
                      Nenhum lançamento.
                    </TableCell>
                  </TableRow>
                ) : (
                  lancamentos.map((r) => (
                    <TableRow key={`${r.origem}-${r.id}`}>
                      <TableCell className="font-mono text-xs">
                        {fmtDate(r.data_movimento)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {r.descricao}
                        <div className="text-xs text-muted-foreground">
                          {r.categoria_dre}
                        </div>
                      </TableCell>
                      <TableCell
                        className={`text-right font-mono text-sm ${
                          r.natureza === "receita" ? "text-emerald-600" : "text-rose-600"
                        }`}
                      >
                        {fmtBRL(r.valor)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Fluxo de caixa                                                      */
/* ------------------------------------------------------------------ */

type Receber = {
  id: string;
  data_prevista_recebimento: string | null;
  valor_liquido_previsto: number;
  status_conciliacao: string;
  numero_venda: string | null;
  meio_pagamento: string;
};
type Pagar = {
  id: string;
  descricao: string;
  fornecedor: string | null;
  valor: number;
  data_vencimento: string;
  status: string;
};

function FluxoSection({
  escopoLoja,
  dtIni,
  dtFim,
}: {
  escopoLoja: string | null;
  dtIni: string;
  dtFim: string;
}) {
  const q = useQuery({
    queryKey: ["fluxo_caixa", { escopoLoja, dtIni, dtFim }],
    queryFn: async () => {
      let vq = supabase
        .from("vendas_ucase")
        .select(
          "id, data_prevista_recebimento, valor_liquido_previsto, status_conciliacao, numero_venda, meio_pagamento",
        )
        .gte("data_prevista_recebimento", dtIni)
        .lte("data_prevista_recebimento", dtFim)
        .order("data_prevista_recebimento");
      let cq = supabase
        .from("contas_pagar")
        .select("id, descricao, fornecedor, valor, data_vencimento, status")
        .neq("status", "cancelado")
        .gte("data_vencimento", dtIni)
        .lte("data_vencimento", dtFim)
        .order("data_vencimento");
      if (escopoLoja) {
        vq = vq.eq("id_loja", escopoLoja);
        cq = cq.eq("id_loja", escopoLoja);
      }
      const [v, c] = await Promise.all([vq, cq]);
      if (v.error) throw v.error;
      if (c.error) throw c.error;
      return {
        receber: ((v.data ?? []) as Receber[]).map((r) => ({
          ...r,
          valor_liquido_previsto: Number(r.valor_liquido_previsto),
        })),
        pagar: ((c.data ?? []) as Pagar[]).map((r) => ({ ...r, valor: Number(r.valor) })),
      };
    },
  });

  const receber = q.data?.receber ?? [];
  const pagar = q.data?.pagar ?? [];
  const hoje = todayISO();

  const totReceber = receber.reduce((s, r) => s + r.valor_liquido_previsto, 0);
  const recebido = receber
    .filter((r) => r.status_conciliacao === "conciliado")
    .reduce((s, r) => s + r.valor_liquido_previsto, 0);
  const atrasados = receber
    .filter((r) => r.status_conciliacao === "atrasado")
    .reduce((s, r) => s + r.valor_liquido_previsto, 0);
  const totPagar = pagar.reduce((s, r) => s + r.valor, 0);
  const pago = pagar.filter((r) => r.status === "pago").reduce((s, r) => s + r.valor, 0);
  const vencidas = pagar
    .filter((r) => r.status === "aberto" && r.data_vencimento < hoje)
    .reduce((s, r) => s + r.valor, 0);

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="A receber no mês" value={totReceber} tone="positive" hint={`${fmtBRL(recebido)} já recebido`} />
        <KpiCard label="A pagar no mês" value={totPagar} tone="negative" hint={`${fmtBRL(pago)} já pago`} />
        <KpiCard label="Saldo projetado" value={totReceber - totPagar} tone="neutral" />
        <KpiCard
          label="Em atraso"
          value={atrasados + vencidas}
          tone="negative"
          hint={`${fmtBRL(atrasados)} a receber · ${fmtBRL(vencidas)} a pagar`}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-card">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-medium">
            <ArrowUpRight className="h-4 w-4 text-emerald-600" />
            Recebimentos previstos
          </div>
          <div className="max-h-[520px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">Previsão</TableHead>
                  <TableHead>Venda</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {q.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={3} className="py-10 text-center text-sm text-muted-foreground">
                      Carregando…
                    </TableCell>
                  </TableRow>
                ) : receber.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="py-10 text-center text-sm text-muted-foreground">
                      Nada previsto para este período.
                    </TableCell>
                  </TableRow>
                ) : (
                  receber.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs">
                        {r.data_prevista_recebimento
                          ? fmtDate(r.data_prevista_recebimento)
                          : "—"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {r.numero_venda ?? "Venda Ucase"}
                        <div className="text-xs text-muted-foreground">
                          {r.meio_pagamento === "cartao"
                            ? "Cartão"
                            : r.meio_pagamento === "financeira"
                              ? "Financeira"
                              : "À vista"}{" "}
                          ·{" "}
                          <StatusBadge
                            status={r.status_conciliacao}
                            atrasado={r.status_conciliacao === "atrasado"}
                          />
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm text-emerald-600">
                        {fmtBRL(r.valor_liquido_previsto)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-medium">
            <ArrowDownRight className="h-4 w-4 text-rose-600" />
            Pagamentos previstos
          </div>
          <div className="max-h-[520px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">Vencimento</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {q.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={3} className="py-10 text-center text-sm text-muted-foreground">
                      Carregando…
                    </TableCell>
                  </TableRow>
                ) : pagar.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="py-10 text-center text-sm text-muted-foreground">
                      Nenhuma conta no período.
                    </TableCell>
                  </TableRow>
                ) : (
                  pagar.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs">
                        {fmtDate(r.data_vencimento)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {r.descricao}
                        <div className="text-xs text-muted-foreground">
                          {r.fornecedor ? `${r.fornecedor} · ` : ""}
                          <StatusBadge
                            status={r.status}
                            atrasado={r.status === "aberto" && r.data_vencimento < hoje}
                          />
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm text-rose-600">
                        {fmtBRL(r.valor)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* bits                                                                */
/* ------------------------------------------------------------------ */

function StatusBadge({ status, atrasado }: { status: string; atrasado: boolean }) {
  const label = atrasado ? "vencido" : status;
  const cls = atrasado
    ? "bg-rose-100 text-rose-700"
    : status === "conciliado" || status === "pago"
      ? "bg-emerald-100 text-emerald-700"
      : "bg-muted text-muted-foreground";
  return (
    <span className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium ${cls}`}>
      {label}
    </span>
  );
}

function KpiCard({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: number;
  tone: "positive" | "negative" | "neutral";
  hint?: string;
}) {
  const color =
    tone === "positive"
      ? "text-emerald-600"
      : tone === "negative"
        ? "text-rose-600"
        : value >= 0
          ? "text-foreground"
          : "text-rose-600";
  const Icon = tone === "negative" ? Wallet : tone === "positive" ? TrendingUp : Wallet;
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className={`mt-1 font-mono text-lg font-semibold ${color}`}>{fmtBRL(value)}</div>
      {hint && <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}
