import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { AppLayout } from "@/components/app-layout";
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

export const Route = createFileRoute("/_authenticated/alertas")({
  head: () => ({
    meta: [
      { title: "Alertas · Connect 7" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AlertasPage,
});

type Venda = {
  id: string;
  id_loja: string;
  id_financeira: string;
  data_venda: string;
  valor_liquido_previsto: number;
  data_prevista_recebimento: string | null;
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
const diasAtraso = (s: string | null) => {
  if (!s) return 0;
  const [y, m, d] = s.split("-").map(Number);
  const prev = new Date(y, m - 1, d).getTime();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.max(0, Math.floor((today - prev) / (1000 * 60 * 60 * 24)));
};

function AlertasPage() {
  const { profile, selectedLojaId } = useAuth();
  const isGlobal = profile?.role === "administrador" || profile?.role === "master";

  const [vendas, setVendas] = useState<Venda[]>([]);
  const [financeiras, setFinanceiras] = useState<Financeira[]>([]);
  const [lojas, setLojas] = useState<Loja[]>([]);
  const [contas, setContas] = useState<Conta[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      // Marca atrasadas antes de listar
      await supabase.rpc("fn_atualizar_status_atrasados");
      let q = supabase
        .from("vendas_ucase")
        .select(
          "id, id_loja, id_financeira, data_venda, valor_liquido_previsto, data_prevista_recebimento",
        )
        .eq("status_conciliacao", "atrasado");
      if (!isGlobal && profile?.id_loja) q = q.eq("id_loja", profile.id_loja);
      else if (isGlobal && selectedLojaId) q = q.eq("id_loja", selectedLojaId);

      const [{ data: v }, { data: f }, { data: l }, { data: c }] = await Promise.all([
        q.order("data_prevista_recebimento", { ascending: true }),
        supabase.from("financeiras").select("id, nome"),
        supabase.from("lojas").select("id, nome_fantasia"),
        supabase.from("contas_bancarias").select("id, id_loja, banco, agencia, conta").eq("ativa", true),
      ]);
      setVendas((v ?? []) as Venda[]);
      setFinanceiras((f ?? []) as Financeira[]);
      setLojas((l ?? []) as Loja[]);
      setContas((c ?? []) as Conta[]);
      setLoading(false);
    })();
  }, [profile?.id, selectedLojaId, isGlobal, profile?.id_loja]);

  const finNome = (id: string) => financeiras.find((f) => f.id === id)?.nome ?? "—";
  const lojaNome = (id: string) => lojas.find((l) => l.id === id)?.nome_fantasia ?? "—";
  const contaDaLoja = (id: string) => {
    const c = contas.find((x) => x.id_loja === id);
    return c ? `${c.banco} · Ag ${c.agencia} / ${c.conta}` : "—";
  };

  const ordenadas = useMemo(
    () =>
      [...vendas].sort(
        (a, b) => diasAtraso(b.data_prevista_recebimento) - diasAtraso(a.data_prevista_recebimento),
      ),
    [vendas],
  );

  const totalAtraso = ordenadas.reduce(
    (s, v) => s + Number(v.valor_liquido_previsto),
    0,
  );

  return (
    <AppLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Alertas de recebíveis</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Vendas com previsão de recebimento vencida e sem baixa no banco.
        </p>
      </div>

      <div className="mb-4 flex items-center gap-3 rounded-md border-l-4 border-destructive bg-destructive/5 px-4 py-3">
        <AlertTriangle className="h-5 w-5 text-destructive" />
        <div className="text-sm">
          <span className="font-semibold text-destructive">{ordenadas.length}</span>{" "}
          venda(s) em atraso · Total {" "}
          <span className="font-mono font-semibold">{brl(totalAtraso)}</span>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Financeira</TableHead>
                {isGlobal && <TableHead>Loja</TableHead>}
                <TableHead>Data da venda</TableHead>
                <TableHead className="text-right">Valor líquido previsto</TableHead>
                <TableHead>Data prevista</TableHead>
                <TableHead>Atraso</TableHead>
                <TableHead>Conta esperada</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={isGlobal ? 7 : 6} className="text-center text-muted-foreground">Carregando…</TableCell></TableRow>
              ) : ordenadas.length === 0 ? (
                <TableRow><TableCell colSpan={isGlobal ? 7 : 6} className="text-center text-muted-foreground">Nenhum alerta no momento. 🎉</TableCell></TableRow>
              ) : ordenadas.map((v) => {
                const dias = diasAtraso(v.data_prevista_recebimento);
                return (
                  <TableRow key={v.id} className="border-l-2 border-destructive/60">
                    <TableCell>{finNome(v.id_financeira)}</TableCell>
                    {isGlobal && <TableCell>{lojaNome(v.id_loja)}</TableCell>}
                    <TableCell>{fmtDate(v.data_venda)}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{brl(Number(v.valor_liquido_previsto))}</TableCell>
                    <TableCell>{fmtDate(v.data_prevista_recebimento)}</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center rounded-md bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                        {dias} {dias === 1 ? "dia" : "dias"}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{contaDaLoja(v.id_loja)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    </AppLayout>
  );
}
