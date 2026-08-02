import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useMemo, useState } from "react";
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
/* DRE — por data de competência                                       */
/* ------------------------------------------------------------------ */

type DreRow = {
  id_loja: string | null;
  id_categoria: string | null;
  categoria: string;
  natureza: string;
  data_competencia: string;
  valor: number;
};

function DreSection({
  escopoLoja,
  dtIni,
  dtFim,
}: {
  escopoLoja: string | null;
  dtIni: string;
  dtFim: string;
}) {
  const { lojas } = useAuth();
  const [fechados, setFechados] = useState<Record<string, boolean>>({});
  const [lojaDrill, setLojaDrill] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["dre_competencia", { escopoLoja, dtIni, dtFim }],
    queryFn: async () => {
      let query = supabase
        .from("vw_dre_competencia")
        .select("id_loja, id_categoria, categoria, natureza, data_competencia, valor")
        .gte("data_competencia", dtIni)
        .lte("data_competencia", dtFim);
      if (escopoLoja) query = query.eq("id_loja", escopoLoja);
      const { data, error } = await query;
      if (error) throw error;
      return ((data ?? []) as DreRow[]).map((r) => ({ ...r, valor: Number(r.valor) }));
    },
  });

  const catsQ = useQuery({
    queryKey: ["dre_cats_grupos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dre_categorias")
        .select("id, nome, dre_grupos(nome, natureza, ordem)");
      if (error) throw error;
      return (data ?? []) as unknown as {
        id: string;
        nome: string;
        dre_grupos: { nome: string; natureza: string; ordem: number } | null;
      }[];
    },
  });

  const grupoDe = (r: DreRow) => {
    if (!r.id_categoria) return r.natureza === "receita" ? "Receita de Vendas" : "Outras despesas";
    return catsQ.data?.find((c) => c.id === r.id_categoria)?.dre_grupos?.nome ?? "Sem grupo";
  };

  const todas = q.data ?? [];
  const rows = useMemo(
    () => (lojaDrill ? todas.filter((r) => r.id_loja === lojaDrill) : todas),
    [todas, lojaDrill],
  );

  const { grupos, receita, despesa, cmv, comissoes } = useMemo(() => {
    const map = new Map<
      string,
      { nome: string; natureza: string; total: number; cats: Map<string, { nome: string; total: number }> }
    >();
    let receita = 0;
    let despesa = 0;
    let cmv = 0;
    let comissoes = 0;
    for (const r of rows) {
      const grupo = grupoDe(r);
      if (r.natureza === "receita") receita += r.valor;
      else despesa += r.valor;
      if (/cmv|custo/i.test(grupo)) cmv += r.valor;
      if (/comiss/i.test(grupo) || /comiss/i.test(r.categoria)) comissoes += r.valor;
      const gk = `${r.natureza}::${grupo}`;
      if (!map.has(gk))
        map.set(gk, { nome: grupo, natureza: r.natureza, total: 0, cats: new Map() });
      const g = map.get(gk)!;
      g.total += r.valor;
      const c = g.cats.get(r.categoria) ?? { nome: r.categoria, total: 0 };
      c.total += r.valor;
      g.cats.set(r.categoria, c);
    }
    const grupos = [...map.entries()]
      .map(([key, g]) => ({ key, ...g, cats: [...g.cats.values()].sort((a, b) => b.total - a.total) }))
      .sort((a, b) =>
        a.natureza === b.natureza ? b.total - a.total : a.natureza === "receita" ? -1 : 1,
      );
    return { grupos, receita, despesa, cmv, comissoes };
  }, [rows, catsQ.data]);

  // Comparação entre lojas — sempre com a base completa do período.
  const comparativo = useMemo(() => {
    const map = new Map<string, { receita: number; despesa: number }>();
    for (const r of todas) {
      if (!r.id_loja) continue;
      const cur = map.get(r.id_loja) ?? { receita: 0, despesa: 0 };
      if (r.natureza === "receita") cur.receita += r.valor;
      else cur.despesa += r.valor;
      map.set(r.id_loja, cur);
    }
    return [...map.entries()]
      .map(([id, v]) => ({ id, ...v, resultado: v.receita - v.despesa }))
      .sort((a, b) => b.receita - a.receita);
  }, [todas]);

  const nomeLoja = (id: string) => lojas.find((l) => l.id === id)?.nome ?? "Loja";

  return (
    <div>
      <p className="mb-3 text-xs text-muted-foreground">
        DRE apurada por <strong>data de competência</strong> — receita de vendas, CMV, despesas e
        comissões.
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard label="Receita" value={receita} tone="positive" />
        <KpiCard label="CMV" value={cmv} tone="negative" />
        <KpiCard label="Despesas" value={despesa} tone="negative" />
        <KpiCard label="Comissões" value={comissoes} tone="negative" />
        <KpiCard label="Resultado" value={receita - despesa} tone="neutral" />
      </div>

      {comparativo.length > 1 && (
        <div className="mt-4 rounded-lg border border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
            <div>
              <div className="text-sm font-medium">Comparação entre lojas</div>
              <p className="text-xs text-muted-foreground">
                Clique em uma loja para ver a DRE apenas dela (drill-down).
              </p>
            </div>
            {lojaDrill && (
              <button className="text-xs text-primary hover:underline" onClick={() => setLojaDrill(null)}>
                Ver consolidado do grupo
              </button>
            )}
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Loja</TableHead>
                <TableHead className="text-right">Receita</TableHead>
                <TableHead className="text-right">Despesas</TableHead>
                <TableHead className="text-right">Resultado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {comparativo.map((l) => (
                <TableRow
                  key={l.id}
                  className="cursor-pointer"
                  data-state={lojaDrill === l.id ? "selected" : undefined}
                  onClick={() => setLojaDrill(lojaDrill === l.id ? null : l.id)}
                >
                  <TableCell className="font-medium">{nomeLoja(l.id)}</TableCell>
                  <TableCell className="text-right font-mono text-emerald-600">
                    {fmtBRL(l.receita)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-rose-600">
                    {fmtBRL(l.despesa)}
                  </TableCell>
                  <TableCell className="text-right font-mono">{fmtBRL(l.resultado)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="mt-4 rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <div className="text-sm font-medium">
            DRE por categoria {lojaDrill ? `· ${nomeLoja(lojaDrill)}` : "· consolidado"}
          </div>
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
                  <Fragment key={g.key}>
                    <TableRow
                      className="cursor-pointer bg-muted/40 font-medium"
                      onClick={() => setFechados((f) => ({ ...f, [g.key]: aberto }))}
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
                        <TableRow key={`${g.key}-${c.nome}`}>
                          <TableCell className="pl-8 text-sm">{c.nome}</TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {fmtBRL(c.total)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs text-muted-foreground">
                            {pct(c.total, receita)}
                          </TableCell>
                        </TableRow>
                      ))}
                  </Fragment>
                );
              })
            )}
            {grupos.length > 0 && (
              <TableRow className="border-t-2 border-border font-semibold">
                <TableCell>Resultado do período</TableCell>
                <TableCell className="text-right font-mono">{fmtBRL(receita - despesa)}</TableCell>
                <TableCell className="text-right font-mono text-xs">
                  {pct(receita - despesa, receita)}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Fluxo de caixa — 3 bases de data, realizado x projetado             */
/* ------------------------------------------------------------------ */

type FluxoRow = {
  id: string;
  origem: string;
  id_loja: string;
  descricao: string;
  valor: number;
  data_competencia: string | null;
  data_vencimento: string | null;
  data_realizacao: string | null;
  realizado: boolean;
  status: string;
};

type BaseData = "competencia" | "vencimento" | "realizacao";

const CAMPO_DATA: Record<BaseData, keyof FluxoRow> = {
  competencia: "data_competencia",
  vencimento: "data_vencimento",
  realizacao: "data_realizacao",
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
  const { lojas } = useAuth();
  const [base, setBase] = useState<BaseData>("realizacao");

  const q = useQuery({
    queryKey: ["fluxo_caixa_view", { escopoLoja, dtIni, dtFim, base }],
    queryFn: async () => {
      const campo = CAMPO_DATA[base] as string;
      let query = supabase
        .from("vw_fluxo_caixa")
        .select(
          "id, origem, id_loja, descricao, valor, data_competencia, data_vencimento, data_realizacao, realizado, status",
        )
        .gte(campo, dtIni)
        .lte(campo, dtFim);
      if (escopoLoja) query = query.eq("id_loja", escopoLoja);
      const { data, error } = await query;
      if (error) throw error;
      return ((data ?? []) as FluxoRow[]).map((r) => ({ ...r, valor: Number(r.valor) }));
    },
  });

  const saldosQ = useQuery({
    queryKey: ["saldo_inicial_lojas", escopoLoja],
    queryFn: async () => {
      let query = supabase.from("lojas").select("id, saldo_inicial_caixa");
      if (escopoLoja) query = query.eq("id", escopoLoja);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows = q.data ?? [];
  const saldoInicial = (saldosQ.data ?? []).reduce(
    (s, l) => s + Number(l.saldo_inicial_caixa ?? 0),
    0,
  );

  const totais = useMemo(() => {
    let entradasR = 0;
    let saidasR = 0;
    let entradasP = 0;
    let saidasP = 0;
    for (const r of rows) {
      const v = Number(r.valor);
      if (r.realizado) {
        if (v >= 0) entradasR += v;
        else saidasR += -v;
      } else if (v >= 0) entradasP += v;
      else saidasP += -v;
    }
    return { entradasR, saidasR, entradasP, saidasP };
  }, [rows]);

  const realizado = totais.entradasR - totais.saidasR;
  const projetado = totais.entradasP - totais.saidasP;
  const saldoFinal = saldoInicial + realizado + projetado;

  const nomeLoja = (id: string) => lojas.find((l) => l.id === id)?.nome ?? "—";
  const dataDe = (r: FluxoRow) => (r[CAMPO_DATA[base]] as string | null) ?? null;

  const ordenadas = useMemo(
    () =>
      [...rows].sort((a, b) => String(dataDe(a) ?? "").localeCompare(String(dataDe(b) ?? ""))),
    [rows, base],
  );

  const rotuloOrigem: Record<string, string> = {
    pagar: "Contas a pagar",
    receber: "Contas a receber",
    recebivel_cartao: "Recebível de cartão/financeira",
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4">
        <div className="grid gap-1.5">
          <Label className="text-xs">Visão por data de</Label>
          <Select value={base} onValueChange={(v) => setBase(v as BaseData)}>
            <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="competencia">Competência</SelectItem>
              <SelectItem value="vencimento">Vencimento</SelectItem>
              <SelectItem value="realizacao">Realização (caixa)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <p className="max-w-md text-xs text-muted-foreground">
          Recebíveis de cartão e financeira entram pela data prevista de repasse do adquirente,
          não pela data da venda.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard label="Saldo inicial das lojas" value={saldoInicial} tone="neutral" />
        <KpiCard
          label="Realizado"
          value={realizado}
          tone="neutral"
          hint={`${fmtBRL(totais.entradasR)} entradas · ${fmtBRL(totais.saidasR)} saídas`}
        />
        <KpiCard
          label="Projetado"
          value={projetado}
          tone="neutral"
          hint={`${fmtBRL(totais.entradasP)} entradas · ${fmtBRL(totais.saidasP)} saídas`}
        />
        <KpiCard label="Saldo final do mês" value={saldoFinal} tone="neutral" />
        <KpiCard label="Lançamentos" value={rows.length} tone="neutral" hint="no período" />
      </div>

      <div className="mt-4 rounded-lg border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-medium">
          <ArrowUpRight className="h-4 w-4 text-emerald-600" />
          Realizado x Projetado
          <ArrowDownRight className="h-4 w-4 text-rose-600" />
        </div>
        <div className="max-h-[560px] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">Data</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Loja</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead className="text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                    Carregando…
                  </TableCell>
                </TableRow>
              ) : ordenadas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                    Nada previsto ou realizado neste período.
                  </TableCell>
                </TableRow>
              ) : (
                ordenadas.map((r) => (
                  <TableRow key={`${r.origem}-${r.id}`}>
                    <TableCell className="font-mono text-xs">
                      {dataDe(r) ? fmtDate(dataDe(r)!) : "—"}
                    </TableCell>
                    <TableCell className="text-sm">{r.descricao}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {nomeLoja(r.id_loja)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {rotuloOrigem[r.origem] ?? r.origem}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                          r.realizado
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {r.realizado ? "realizado" : "projetado"}
                      </span>
                    </TableCell>
                    <TableCell
                      className={`text-right font-mono text-sm ${
                        r.valor >= 0 ? "text-emerald-600" : "text-rose-600"
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
