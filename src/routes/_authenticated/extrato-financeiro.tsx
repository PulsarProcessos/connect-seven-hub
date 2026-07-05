import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, LayoutList, TrendingDown, TrendingUp } from "lucide-react";
import { AppLayout } from "@/components/app-layout";
import { NovaMovimentacaoButton } from "@/components/nova-movimentacao-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

export const Route = createFileRoute("/_authenticated/extrato-financeiro")({
  head: () => ({
    meta: [
      { title: "Extrato Financeiro · Connect 7" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ExtratoFinanceiroPage,
});

type Row = {
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

const fmtBRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString("pt-BR");

const firstOfMonth = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};
const lastOfMonth = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
};

function ExtratoFinanceiroPage() {
  const { profile, selectedLojaId } = useAuth();
  const isGlobal = profile?.role === "administrador" || profile?.role === "master";
  const escopoLoja = isGlobal ? selectedLojaId : profile?.id_loja ?? null;

  const [dtIni, setDtIni] = useState(firstOfMonth());
  const [dtFim, setDtFim] = useState(lastOfMonth());
  const [tipo, setTipo] = useState<string>("todos");
  const [origem, setOrigem] = useState<string>("todos");
  const [idCategoria, setIdCategoria] = useState<string>("todos");
  const [status, setStatus] = useState<string>("todos");

  const catsQ = useQuery({
    queryKey: ["categorias_flat"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dre_categorias")
        .select("id, nome, id_grupo, dre_grupos(nome)")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as { id: string; nome: string; dre_grupos: { nome: string } | null }[];
    },
  });

  const rowsQ = useQuery({
    queryKey: [
      "extrato_financeiro",
      { escopoLoja, dtIni, dtFim, tipo, origem, idCategoria, status },
    ],
    queryFn: async () => {
      let q = supabase
        .from("vw_extrato_financeiro")
        .select("*")
        .gte("data_movimento", dtIni)
        .lte("data_movimento", dtFim)
        .order("data_movimento", { ascending: false });

      if (escopoLoja) q = q.eq("id_loja", escopoLoja);
      if (tipo !== "todos") q = q.eq("tipo", tipo);
      if (origem !== "todos") {
        if (origem === "ucase") q = q.eq("origem", "venda_ucase");
        else q = q.eq("origem", "manual");
      }
      if (idCategoria !== "todos") q = q.eq("id_categoria", idCategoria);
      if (status !== "todos") q = q.eq("status_conciliacao", status);

      const { data, error } = await q;
      if (error) throw error;
      return ((data ?? []) as Row[]).map((r) => ({
        ...r,
        valor: Number(r.valor),
      }));
    },
  });

  const rows = rowsQ.data ?? [];

  const totais = useMemo(() => {
    let entradas = 0;
    let saidas = 0;
    for (const r of rows) {
      if (r.tipo === "transferencia") continue;
      if (r.natureza === "receita") entradas += r.valor;
      else saidas += r.valor;
    }
    return { entradas, saidas, saldo: entradas - saidas };
  }, [rows]);

  const exportCsv = () => {
    const header = [
      "Data",
      "Descrição",
      "Grupo DRE",
      "Categoria DRE",
      "Tipo",
      "Origem",
      "Natureza",
      "Valor",
      "Status",
    ];
    const lines = rows.map((r) =>
      [
        fmtDate(r.data_movimento),
        `"${r.descricao.replace(/"/g, '""')}"`,
        `"${r.grupo_dre}"`,
        `"${r.categoria_dre}"`,
        r.tipo,
        r.origem === "venda_ucase" ? "Ucase" : "Manual",
        r.natureza,
        r.valor.toFixed(2).replace(".", ","),
        r.status_conciliacao,
      ].join(";"),
    );
    const blob = new Blob(["\ufeff" + [header.join(";"), ...lines].join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `extrato-financeiro_${dtIni}_a_${dtFim}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AppLayout>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Extrato Financeiro</h1>
          <p className="text-sm text-muted-foreground">
            Visão unificada de vendas Ucase e movimentações manuais.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <NovaMovimentacaoButton />
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="h-4 w-4" />
            Exportar CSV
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <div className="mt-5 grid grid-cols-2 gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-6">
        <div className="grid gap-1.5">
          <Label className="text-xs">Data inicial</Label>
          <Input type="date" value={dtIni} onChange={(e) => setDtIni(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs">Data final</Label>
          <Input type="date" value={dtFim} onChange={(e) => setDtFim(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs">Tipo</Label>
          <Select value={tipo} onValueChange={setTipo}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="venda">Venda</SelectItem>
              <SelectItem value="despesa">Despesa</SelectItem>
              <SelectItem value="transferencia">Transferência</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs">Origem</Label>
          <Select value={origem} onValueChange={setOrigem}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas</SelectItem>
              <SelectItem value="ucase">Ucase</SelectItem>
              <SelectItem value="manual">Manual</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs">Categoria DRE</Label>
          <Select value={idCategoria} onValueChange={setIdCategoria}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas</SelectItem>
              {(catsQ.data ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.dre_grupos?.nome ? `${c.dre_grupos.nome} › ` : ""}{c.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs">Status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="pendente">Pendente</SelectItem>
              <SelectItem value="conciliado">Conciliado</SelectItem>
              <SelectItem value="atrasado">Atrasado</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Totais */}
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        <TotalCard
          label="Entradas"
          value={totais.entradas}
          tone="up"
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <TotalCard
          label="Saídas"
          value={totais.saidas}
          tone="down"
          icon={<TrendingDown className="h-4 w-4" />}
        />
        <TotalCard
          label="Saldo do período"
          value={totais.saldo}
          tone={totais.saldo >= 0 ? "up" : "down"}
          icon={<LayoutList className="h-4 w-4" />}
        />
      </div>

      <Tabs defaultValue="lista" className="mt-6">
        <TabsList>
          <TabsTrigger value="lista">Lista</TabsTrigger>
          <TabsTrigger value="dre">Ver como DRE</TabsTrigger>
        </TabsList>

        <TabsContent value="lista" className="mt-3">
          <div className="rounded-lg border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">Data</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Grupo DRE</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rowsQ.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                      Carregando…
                    </TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                      Nenhum lançamento no período.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((r) => (
                    <TableRow key={`${r.origem}-${r.id}`}>
                      <TableCell className="font-mono text-xs">{fmtDate(r.data_movimento)}</TableCell>
                      <TableCell className="max-w-xs truncate">{r.descricao}</TableCell>
                      <TableCell className="text-muted-foreground">{r.grupo_dre}</TableCell>
                      <TableCell>{r.categoria_dre}</TableCell>
                      <TableCell><TipoBadge tipo={r.tipo} /></TableCell>
                      <TableCell><OrigemBadge origem={r.origem} /></TableCell>
                      <TableCell
                        className={`text-right font-mono ${
                          r.tipo === "transferencia"
                            ? "text-muted-foreground"
                            : r.natureza === "receita"
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-rose-600 dark:text-rose-400"
                        }`}
                      >
                        {r.natureza === "despesa" && r.tipo !== "transferencia" ? "− " : ""}
                        {fmtBRL(r.valor)}
                      </TableCell>
                      <TableCell><StatusBadge status={r.status_conciliacao} /></TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="dre" className="mt-3">
          <DreView rows={rows} />
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
}

function TotalCard({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: number;
  tone: "up" | "down";
  icon: React.ReactNode;
}) {
  const cls =
    tone === "up"
      ? "text-emerald-600 dark:text-emerald-400"
      : "text-rose-600 dark:text-rose-400";
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className={`mt-2 font-mono text-2xl font-semibold ${cls}`}>
        {fmtBRL(value)}
      </div>
    </div>
  );
}

function TipoBadge({ tipo }: { tipo: string }) {
  const map: Record<string, string> = {
    venda: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 ring-emerald-500/20",
    despesa: "bg-rose-500/10 text-rose-700 dark:text-rose-400 ring-rose-500/20",
    transferencia: "bg-sky-500/10 text-sky-700 dark:text-sky-400 ring-sky-500/20",
  };
  const label: Record<string, string> = {
    venda: "Venda",
    despesa: "Despesa",
    transferencia: "Transferência",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1 ring-inset ${map[tipo] ?? "bg-muted text-muted-foreground"}`}
    >
      {label[tipo] ?? tipo}
    </span>
  );
}

function OrigemBadge({ origem }: { origem: string }) {
  const isUcase = origem === "venda_ucase";
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${
        isUcase
          ? "bg-primary/10 text-primary ring-primary/20"
          : "bg-muted text-muted-foreground ring-border"
      }`}
    >
      {isUcase ? "Ucase" : "Manual"}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pendente: "bg-amber-500/10 text-amber-700 dark:text-amber-400 ring-amber-500/20",
    conciliado: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 ring-emerald-500/20",
    atrasado: "bg-rose-500/10 text-rose-700 dark:text-rose-400 ring-rose-500/20",
  };
  const label: Record<string, string> = {
    pendente: "Pendente",
    conciliado: "Conciliado",
    atrasado: "Atrasado",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1 ring-inset ${map[status] ?? "bg-muted text-muted-foreground"}`}
    >
      {label[status] ?? status}
    </span>
  );
}

function DreView({ rows }: { rows: Row[] }) {
  const grouped = useMemo(() => {
    // { natureza -> { grupo -> { total, cats: { categoria -> total } } } }
    const byNatureza: Record<
      "receita" | "despesa",
      Record<string, { total: number; cats: Record<string, number> }>
    > = { receita: {}, despesa: {} };

    for (const r of rows) {
      if (r.tipo === "transferencia") continue;
      const nat = (r.natureza === "receita" ? "receita" : "despesa") as
        | "receita"
        | "despesa";
      const g = byNatureza[nat][r.grupo_dre] ?? { total: 0, cats: {} };
      g.total += r.valor;
      g.cats[r.categoria_dre] = (g.cats[r.categoria_dre] ?? 0) + r.valor;
      byNatureza[nat][r.grupo_dre] = g;
    }

    const receitasTotal = Object.values(byNatureza.receita).reduce(
      (s, g) => s + g.total,
      0,
    );
    const despesasTotal = Object.values(byNatureza.despesa).reduce(
      (s, g) => s + g.total,
      0,
    );
    return {
      receitas: byNatureza.receita,
      despesas: byNatureza.despesa,
      receitasTotal,
      despesasTotal,
      resultado: receitasTotal - despesasTotal,
    };
  }, [rows]);

  const renderGrupos = (
    map: Record<string, { total: number; cats: Record<string, number> }>,
    tone: "up" | "down",
  ) => {
    const entries = Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
    if (entries.length === 0)
      return (
        <div className="px-4 py-2 text-xs text-muted-foreground">Sem lançamentos.</div>
      );
    return entries.map(([grupo, g]) => (
      <div key={grupo} className="border-t border-border">
        <div className="flex items-center justify-between bg-muted/30 px-4 py-2 text-sm font-semibold">
          <span>{grupo}</span>
          <span
            className={`font-mono ${
              tone === "up"
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-rose-600 dark:text-rose-400"
            }`}
          >
            {tone === "down" ? "− " : ""}
            {fmtBRL(g.total)}
          </span>
        </div>
        {Object.entries(g.cats)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([cat, val]) => (
            <div
              key={cat}
              className="flex items-center justify-between px-8 py-1.5 text-sm"
            >
              <span className="text-muted-foreground">{cat}</span>
              <span className="font-mono text-foreground">
                {tone === "down" ? "− " : ""}
                {fmtBRL(val)}
              </span>
            </div>
          ))}
      </div>
    ));
  };

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
          Receitas
        </h3>
        <span className="font-mono text-sm font-semibold text-emerald-600 dark:text-emerald-400">
          {fmtBRL(grouped.receitasTotal)}
        </span>
      </div>
      {renderGrupos(grouped.receitas, "up")}

      <div className="flex items-center justify-between border-y border-border bg-muted/40 px-4 py-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-rose-700 dark:text-rose-400">
          (−) Despesas
        </h3>
        <span className="font-mono text-sm font-semibold text-rose-600 dark:text-rose-400">
          − {fmtBRL(grouped.despesasTotal)}
        </span>
      </div>
      {renderGrupos(grouped.despesas, "down")}

      <div className="flex items-center justify-between border-t-2 border-primary/40 bg-primary/5 px-4 py-4">
        <span className="text-sm font-bold uppercase tracking-wider text-foreground">
          = Resultado
        </span>
        <span
          className={`font-mono text-lg font-bold ${
            grouped.resultado >= 0
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-rose-600 dark:text-rose-400"
          }`}
        >
          {fmtBRL(grouped.resultado)}
        </span>
      </div>
    </div>
  );
}
