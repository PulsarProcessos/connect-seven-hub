import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { TrendingUp, Wallet, Clock, AlertTriangle } from "lucide-react";
import { AppLayout } from "@/components/app-layout";
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

export const Route = createFileRoute("/_authenticated/dashboard-vendas")({
  head: () => ({
    meta: [
      { title: "Dashboard de Vendas · Connect 7" },
      {
        name: "description",
        content:
          "Painel consolidado do Connect 7: vendas, recebíveis previstos e conciliados.",
      },
    ],
  }),
  component: Dashboard,
});

type Venda = {
  id: string;
  id_loja: string;
  id_financeira: string;
  data_venda: string;
  mes_venda: string;
  valor_bruto: number;
  valor_liquido_previsto: number;
  status_conciliacao: "pendente" | "conciliado" | "atrasado";
};
type Financeira = { id: string; nome: string };
type Loja = { id: string; nome_fantasia: string };
type Conc = { id_venda_ucase: string; valor_pago_banco: number };

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function Dashboard() {
  const { profile, selectedLojaId } = useAuth();
  const isGlobal =
    profile?.role === "administrador" || profile?.role === "master";

  const [vendas, setVendas] = useState<Venda[]>([]);
  const [financeiras, setFinanceiras] = useState<Financeira[]>([]);
  const [lojas, setLojas] = useState<Loja[]>([]);
  const [conc, setConc] = useState<Conc[]>([]);
  const [loading, setLoading] = useState(true);

  const [fFinanceira, setFFinanceira] = useState<string>("all");
  const [fMes, setFMes] = useState<string>("all");
  const [fStatus, setFStatus] = useState<string>("all");

  useEffect(() => {
    (async () => {
      setLoading(true);
      let q = supabase
        .from("vendas_ucase")
        .select(
          "id, id_loja, id_financeira, data_venda, mes_venda, valor_bruto, valor_liquido_previsto, status_conciliacao",
        );
      if (!isGlobal && profile?.id_loja) q = q.eq("id_loja", profile.id_loja);
      else if (isGlobal && selectedLojaId) q = q.eq("id_loja", selectedLojaId);

      const [{ data: v }, { data: f }, { data: l }, { data: c }] =
        await Promise.all([
          q.order("data_venda", { ascending: false }),
          supabase.from("financeiras").select("id, nome").order("nome"),
          supabase.from("lojas").select("id, nome_fantasia").order("nome_fantasia"),
          supabase
            .from("conciliacao_extrato")
            .select("id_venda_ucase, valor_pago_banco"),
        ]);
      setVendas((v ?? []) as Venda[]);
      setFinanceiras((f ?? []) as Financeira[]);
      setLojas((l ?? []) as Loja[]);
      setConc((c ?? []) as Conc[]);
      setLoading(false);
    })();
  }, [profile?.id, selectedLojaId, isGlobal, profile?.id_loja]);

  const filtered = useMemo(() => {
    return vendas.filter((v) => {
      if (fFinanceira !== "all" && v.id_financeira !== fFinanceira) return false;
      if (fMes !== "all" && v.mes_venda !== fMes) return false;
      if (fStatus !== "all" && v.status_conciliacao !== fStatus) return false;
      return true;
    });
  }, [vendas, fFinanceira, fMes, fStatus]);

  const mes = currentMonth();
  const doMes = filtered.filter((v) => v.mes_venda === mes);
  const totBruto = doMes.reduce((s, v) => s + Number(v.valor_bruto), 0);
  const totLiquido = doMes.reduce(
    (s, v) => s + Number(v.valor_liquido_previsto),
    0,
  );
  const concIds = new Set(conc.map((c) => c.id_venda_ucase));
  const totConc = doMes
    .filter((v) => concIds.has(v.id))
    .reduce((s, v) => s + Number(v.valor_liquido_previsto), 0);
  const totPend = doMes
    .filter((v) => v.status_conciliacao === "pendente")
    .reduce((s, v) => s + Number(v.valor_liquido_previsto), 0);
  const totAtr = doMes
    .filter((v) => v.status_conciliacao === "atrasado")
    .reduce((s, v) => s + Number(v.valor_liquido_previsto), 0);

  // Bar chart: vendas por mês (líquido previsto)
  const porMes = useMemo(() => {
    const map = new Map<string, { mes: string; bruto: number; liquido: number }>();
    for (const v of filtered) {
      const cur = map.get(v.mes_venda) ?? {
        mes: v.mes_venda,
        bruto: 0,
        liquido: 0,
      };
      cur.bruto += Number(v.valor_bruto);
      cur.liquido += Number(v.valor_liquido_previsto);
      map.set(v.mes_venda, cur);
    }
    return [...map.values()].sort((a, b) => a.mes.localeCompare(b.mes)).slice(-12);
  }, [filtered]);

  // Line: previsto vs conciliado por mês
  const evolucao = useMemo(() => {
    const map = new Map<string, { mes: string; previsto: number; conciliado: number }>();
    for (const v of filtered) {
      const cur = map.get(v.mes_venda) ?? {
        mes: v.mes_venda,
        previsto: 0,
        conciliado: 0,
      };
      cur.previsto += Number(v.valor_liquido_previsto);
      if (concIds.has(v.id)) cur.conciliado += Number(v.valor_liquido_previsto);
      map.set(v.mes_venda, cur);
    }
    return [...map.values()].sort((a, b) => a.mes.localeCompare(b.mes)).slice(-12);
  }, [filtered, concIds]);

  const meses = useMemo(
    () => [...new Set(vendas.map((v) => v.mes_venda))].sort().reverse(),
    [vendas],
  );

  // Consolidado por filial (apenas global)
  const porFilial = useMemo(() => {
    if (!isGlobal) return [];
    const map = new Map<
      string,
      { id: string; bruto: number; liquido: number; conciliado: number; pendente: number; atrasado: number }
    >();
    for (const v of filtered) {
      const cur = map.get(v.id_loja) ?? {
        id: v.id_loja,
        bruto: 0,
        liquido: 0,
        conciliado: 0,
        pendente: 0,
        atrasado: 0,
      };
      cur.bruto += Number(v.valor_bruto);
      cur.liquido += Number(v.valor_liquido_previsto);
      if (concIds.has(v.id)) cur.conciliado += Number(v.valor_liquido_previsto);
      if (v.status_conciliacao === "pendente")
        cur.pendente += Number(v.valor_liquido_previsto);
      if (v.status_conciliacao === "atrasado")
        cur.atrasado += Number(v.valor_liquido_previsto);
      map.set(v.id_loja, cur);
    }
    return [...map.values()].sort((a, b) => b.liquido - a.liquido);
  }, [filtered, concIds, isGlobal]);

  const lojaNome = (id: string) =>
    lojas.find((l) => l.id === id)?.nome_fantasia ?? "—";

  return (
    <AppLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Visão consolidada de vendas e recebíveis.
        </p>
      </div>

      {/* Filtros */}
      <div className="mb-6 flex flex-wrap gap-3">
        <div className="min-w-[180px]">
          <Select value={fFinanceira} onValueChange={setFFinanceira}>
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
              {meses.map((m) => (
                <SelectItem key={m} value={m}>{m}</SelectItem>
              ))}
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
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={TrendingUp} tone="primary" label="Vendas do mês (bruto)" value={brl(totBruto)} sub={`Líquido previsto: ${brl(totLiquido)}`} />
        <Kpi icon={Wallet} tone="success" label="Recebido / conciliado" value={brl(totConc)} sub={`${doMes.filter(v => concIds.has(v.id)).length} vendas`} />
        <Kpi icon={Clock} tone="muted" label="Pendente" value={brl(totPend)} sub={`${doMes.filter(v => v.status_conciliacao === "pendente").length} vendas`} />
        <Kpi icon={AlertTriangle} tone="warning" label="Em atraso" value={brl(totAtr)} sub={`${doMes.filter(v => v.status_conciliacao === "atrasado").length} vendas`} />
      </div>

      {/* Charts */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Vendas por mês" subtitle="Bruto e líquido previsto (últimos 12 meses)">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={porMes} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="mes" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
                <Tooltip
                  cursor={{ fill: "hsl(var(--muted))" }}
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number) => brl(v)}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="bruto" name="Bruto" fill="hsl(215 20% 65%)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="liquido" name="Líquido previsto" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Recebíveis: previsto vs conciliado" subtitle="Evolução mensal">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={evolucao} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="mes" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number) => brl(v)}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="previsto" name="Previsto" stroke="hsl(215 20% 55%)" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="conciliado" name="Conciliado" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      {/* Consolidado por filial */}
      {isGlobal && (
        <div className="mt-6">
          <Panel title="Consolidado por filial" subtitle="Totais considerando os filtros aplicados">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Filial</TableHead>
                    <TableHead className="text-right">Bruto</TableHead>
                    <TableHead className="text-right">Líquido previsto</TableHead>
                    <TableHead className="text-right">Conciliado</TableHead>
                    <TableHead className="text-right">Pendente</TableHead>
                    <TableHead className="text-right">Atrasado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {porFilial.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Sem dados no período.</TableCell></TableRow>
                  ) : porFilial.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{lojaNome(r.id)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{brl(r.bruto)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{brl(r.liquido)}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-success">{brl(r.conciliado)}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-muted-foreground">{brl(r.pendente)}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-destructive">{brl(r.atrasado)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Panel>
        </div>
      )}

      {loading && (
        <div className="mt-6 text-center text-sm text-muted-foreground">Carregando…</div>
      )}
    </AppLayout>
  );
}

function Kpi({
  icon: Icon,
  tone,
  label,
  value,
  sub,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone: "primary" | "success" | "warning" | "muted";
  label: string;
  value: string;
  sub?: string;
}) {
  const toneMap = {
    primary: "bg-primary/10 text-primary",
    success: "bg-success/15 text-success",
    warning: "bg-destructive/10 text-destructive",
    muted: "bg-muted text-muted-foreground",
  } as const;
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between">
        <span className={`flex h-8 w-8 items-center justify-center rounded-md ${toneMap[tone]}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-4 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}
