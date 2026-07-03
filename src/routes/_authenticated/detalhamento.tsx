import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
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
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/_authenticated/detalhamento")({
  head: () => ({
    meta: [
      { title: "Detalhamento Ucase · Connect 7" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DetalhamentoPage,
});

type Venda = {
  id: string;
  id_loja: string;
  id_financeira: string;
  data_venda: string;
  mes_venda: string;
  valor_bruto: number;
  valor_liquido_previsto: number;
  data_prevista_recebimento: string | null;
  status_conciliacao: "pendente" | "conciliado" | "atrasado";
};
type Financeira = { id: string; nome: string };
type Loja = { id: string; nome_fantasia: string };
type Conta = { id: string; id_loja: string; banco: string; agencia: string; conta: string };

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (s: string | null) => {
  if (!s) return "—";
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
};

function DetalhamentoPage() {
  const { profile, selectedLojaId } = useAuth();
  const isGlobal = profile?.role === "administrador" || profile?.role === "master";

  const [vendas, setVendas] = useState<Venda[]>([]);
  const [financeiras, setFinanceiras] = useState<Financeira[]>([]);
  const [lojas, setLojas] = useState<Loja[]>([]);
  const [contas, setContas] = useState<Conta[]>([]);
  const [loading, setLoading] = useState(true);

  const [fFin, setFFin] = useState("all");
  const [fMes, setFMes] = useState("all");
  const [fStatus, setFStatus] = useState("all");
  const [fConta, setFConta] = useState("all");

  useEffect(() => {
    (async () => {
      setLoading(true);
      let q = supabase
        .from("vendas_ucase")
        .select(
          "id, id_loja, id_financeira, data_venda, mes_venda, valor_bruto, valor_liquido_previsto, data_prevista_recebimento, status_conciliacao",
        );
      if (!isGlobal && profile?.id_loja) q = q.eq("id_loja", profile.id_loja);
      else if (isGlobal && selectedLojaId) q = q.eq("id_loja", selectedLojaId);

      const [{ data: v }, { data: f }, { data: l }, { data: c }] = await Promise.all([
        q.order("data_venda", { ascending: false }),
        supabase.from("financeiras").select("id, nome").order("nome"),
        supabase.from("lojas").select("id, nome_fantasia").order("nome_fantasia"),
        supabase.from("contas_bancarias").select("id, id_loja, banco, agencia, conta"),
      ]);
      setVendas((v ?? []) as Venda[]);
      setFinanceiras((f ?? []) as Financeira[]);
      setLojas((l ?? []) as Loja[]);
      setContas((c ?? []) as Conta[]);
      setLoading(false);
    })();
  }, [profile?.id, selectedLojaId, isGlobal, profile?.id_loja]);

  const meses = useMemo(
    () => [...new Set(vendas.map((v) => v.mes_venda))].sort().reverse(),
    [vendas],
  );

  const contasVisiveis = useMemo(() => {
    if (isGlobal && !selectedLojaId) return contas;
    const lojaId = isGlobal ? selectedLojaId : profile?.id_loja;
    return contas.filter((c) => c.id_loja === lojaId);
  }, [contas, isGlobal, selectedLojaId, profile?.id_loja]);

  // Filtro por conta: por loja da conta (vendas não têm conta direta)
  const contaLojaId = contas.find((c) => c.id === fConta)?.id_loja;

  const filtered = useMemo(() => {
    return vendas.filter((v) => {
      if (fFin !== "all" && v.id_financeira !== fFin) return false;
      if (fMes !== "all" && v.mes_venda !== fMes) return false;
      if (fStatus !== "all" && v.status_conciliacao !== fStatus) return false;
      if (fConta !== "all" && contaLojaId && v.id_loja !== contaLojaId) return false;
      return true;
    });
  }, [vendas, fFin, fMes, fStatus, fConta, contaLojaId]);

  const finNome = (id: string) => financeiras.find((f) => f.id === id)?.nome ?? "—";
  const lojaNome = (id: string) => lojas.find((l) => l.id === id)?.nome_fantasia ?? "—";

  const exportarCSV = () => {
    const header = [
      "Data da venda",
      "Loja",
      "Financeira",
      "Valor bruto",
      "Valor líquido previsto",
      "Data prevista recebimento",
      "Status",
    ];
    const rows = filtered.map((v) => [
      fmtDate(v.data_venda),
      lojaNome(v.id_loja),
      finNome(v.id_financeira),
      Number(v.valor_bruto).toFixed(2).replace(".", ","),
      Number(v.valor_liquido_previsto).toFixed(2).replace(".", ","),
      fmtDate(v.data_prevista_recebimento),
      v.status_conciliacao,
    ]);
    const csv =
      [header, ...rows]
        .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"))
        .join("\n") + "\n";
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `detalhamento-ucase-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AppLayout>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Detalhamento Ucase</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Todas as vendas importadas com filtros e exportação.
          </p>
        </div>
        <Button onClick={exportarCSV} variant="outline">
          <Download className="mr-2 h-4 w-4" /> Exportar CSV
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <div className="min-w-[180px]">
          <Select value={fFin} onValueChange={setFFin}>
            <SelectTrigger><SelectValue placeholder="Financeira" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas financeiras</SelectItem>
              {financeiras.map((f) => (
                <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[160px]">
          <Select value={fMes} onValueChange={setFMes}>
            <SelectTrigger><SelectValue placeholder="Mês" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os meses</SelectItem>
              {meses.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[160px]">
          <Select value={fStatus} onValueChange={setFStatus}>
            <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos status</SelectItem>
              <SelectItem value="pendente">Pendente</SelectItem>
              <SelectItem value="conciliado">Conciliado</SelectItem>
              <SelectItem value="atrasado">Atrasado</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[220px]">
          <Select value={fConta} onValueChange={setFConta}>
            <SelectTrigger><SelectValue placeholder="Conta" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas contas</SelectItem>
              {contasVisiveis.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.banco} · Ag {c.agencia} / {c.conta}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                {isGlobal && <TableHead>Loja</TableHead>}
                <TableHead>Financeira</TableHead>
                <TableHead className="text-right">Bruto</TableHead>
                <TableHead className="text-right">Líquido previsto</TableHead>
                <TableHead>Prev. recebimento</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={isGlobal ? 7 : 6} className="text-center text-muted-foreground">Carregando…</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={isGlobal ? 7 : 6} className="text-center text-muted-foreground">Nenhuma venda encontrada.</TableCell></TableRow>
              ) : filtered.map((v) => (
                <TableRow key={v.id}>
                  <TableCell>{fmtDate(v.data_venda)}</TableCell>
                  {isGlobal && <TableCell>{lojaNome(v.id_loja)}</TableCell>}
                  <TableCell>{finNome(v.id_financeira)}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{brl(Number(v.valor_bruto))}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{brl(Number(v.valor_liquido_previsto))}</TableCell>
                  <TableCell>{fmtDate(v.data_prevista_recebimento)}</TableCell>
                  <TableCell><StatusBadge status={v.status_conciliacao} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
          {filtered.length} venda(s) listada(s)
        </div>
      </div>
    </AppLayout>
  );
}

function StatusBadge({ status }: { status: "pendente" | "conciliado" | "atrasado" }) {
  const map = {
    pendente: "bg-muted text-muted-foreground",
    conciliado: "bg-success/15 text-success",
    atrasado: "bg-destructive/10 text-destructive",
  } as const;
  const label = { pendente: "Pendente", conciliado: "Conciliado", atrasado: "Atrasado" } as const;
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${map[status]}`}>
      {label[status]}
    </span>
  );
}
