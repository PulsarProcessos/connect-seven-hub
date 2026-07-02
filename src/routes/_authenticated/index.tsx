import { createFileRoute } from "@tanstack/react-router";
import {
  TrendingUp,
  Wallet,
  AlertTriangle,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { AppLayout } from "@/components/app-layout";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard · Connect 7" },
      {
        name: "description",
        content:
          "Painel consolidado do Connect 7: vendas, conciliação bancária e recebíveis de adquirentes para toda a rede.",
      },
    ],
  }),
  component: Dashboard,
});

type Kpi = {
  label: string;
  value: string;
  delta: string;
  trend: "up" | "down";
  icon: React.ComponentType<{ className?: string }>;
  tone: "primary" | "success" | "warning" | "muted";
};

const KPIS: Kpi[] = [
  {
    label: "Vendas totais (mês)",
    value: "R$ 1.248.580,00",
    delta: "+12,4%",
    trend: "up",
    icon: TrendingUp,
    tone: "primary",
  },
  {
    label: "Saldo conciliado",
    value: "R$ 985.208,45",
    delta: "+4,3%",
    trend: "up",
    icon: Wallet,
    tone: "success",
  },
  {
    label: "Pendências críticas",
    value: "24 unidades",
    delta: "−2,1%",
    trend: "down",
    icon: AlertTriangle,
    tone: "warning",
  },
  {
    label: "Ticket médio do grupo",
    value: "R$ 158,28",
    delta: "+0,7%",
    trend: "up",
    icon: Activity,
    tone: "muted",
  },
];

function Dashboard() {
  return (
    <AppLayout>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Visão consolidada
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Acompanhe o desempenho financeiro em tempo real de toda a rede.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted">
            Exportar relatório
          </button>
          <button className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-95">
            Filtrar dados
          </button>
        </div>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {KPIS.map((kpi) => (
          <KpiCard key={kpi.label} kpi={kpi} />
        ))}
      </div>

      {/* Content grid placeholders */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <PanelCard
          className="lg:col-span-2"
          title="Volume de vendas vs. conciliação"
          subtitle="Últimos 7 dias · atualização automática"
          legend={[
            { label: "Vendas", color: "bg-primary" },
            { label: "Conciliado", color: "bg-primary/30" },
          ]}
        >
          <ChartPlaceholder />
        </PanelCard>

        <PanelCard title="Performance por filial" subtitle="Top performance nesta semana">
          <ul className="divide-y divide-border">
            {[
              { name: "Connect São Paulo", city: "Matriz Central", value: "R$ 458.200", status: "Conciliada" },
              { name: "Connect Rio", city: "Filial RJ", value: "R$ 318.050", status: "Conciliada" },
              { name: "Connect Curitiba", city: "Filial PR", value: "R$ 205.480", status: "Pendente" },
            ].map((row) => (
              <li key={row.name} className="flex items-center justify-between py-3">
                <div>
                  <div className="text-sm font-medium text-foreground">{row.name}</div>
                  <div className="text-xs text-muted-foreground">{row.city}</div>
                </div>
                <div className="text-right">
                  <div className="tabular text-sm font-semibold text-foreground">{row.value}</div>
                  <StatusPill status={row.status} />
                </div>
              </li>
            ))}
          </ul>
          <button className="mt-3 w-full rounded-md border border-border py-2 text-xs font-medium text-muted-foreground hover:bg-muted">
            Ver todas as filiais (24)
          </button>
        </PanelCard>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <PanelCard
          title={
            <span className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-destructive/10 text-destructive">
                <AlertTriangle className="h-3.5 w-3.5" />
              </span>
              Ação requerida
            </span>
          }
          subtitle="Existem divergências não resolvidas em 4 filiais com data de vencimento hoje."
        >
          <button className="text-sm font-semibold text-primary hover:underline">
            Visualizar pendências →
          </button>
        </PanelCard>

        <PanelCard
          title={
            <span className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-success/15 text-success">
                <Activity className="h-3.5 w-3.5" />
              </span>
              Status de integração
            </span>
          }
          subtitle="Última sincronização: agora mesmo"
        >
          <div className="flex flex-wrap gap-4 text-xs">
            <IntegrationDot label="Bancos" ok />
            <IntegrationDot label="ERP" ok />
            <IntegrationDot label="API Cartões" ok />
          </div>
        </PanelCard>
      </div>
    </AppLayout>
  );
}

function KpiCard({ kpi }: { kpi: Kpi }) {
  const toneMap: Record<Kpi["tone"], string> = {
    primary: "bg-primary/10 text-primary",
    success: "bg-success/15 text-success",
    warning: "bg-warning/20 text-warning-foreground",
    muted: "bg-muted text-muted-foreground",
  };
  const Icon = kpi.icon;
  const TrendIcon = kpi.trend === "up" ? ArrowUpRight : ArrowDownRight;
  const trendClass = kpi.trend === "up" ? "text-success" : "text-destructive";

  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-start justify-between">
        <span className={`flex h-8 w-8 items-center justify-center rounded-md ${toneMap[kpi.tone]}`}>
          <Icon className="h-4 w-4" />
        </span>
        <span className={`flex items-center gap-0.5 text-xs font-semibold ${trendClass}`}>
          <TrendIcon className="h-3.5 w-3.5" />
          {kpi.delta}
        </span>
      </div>
      <div className="mt-4 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {kpi.label}
      </div>
      <div className="mt-1 tabular text-2xl font-semibold text-foreground">{kpi.value}</div>
    </div>
  );
}

function PanelCard({
  title,
  subtitle,
  legend,
  children,
  className = "",
}: {
  title: React.ReactNode;
  subtitle?: string;
  legend?: { label: string; color: string }[];
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-lg border border-border bg-card p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${className}`}
    >
      <header className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {legend && (
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {legend.map((l) => (
              <span key={l.label} className="flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-sm ${l.color}`} />
                {l.label}
              </span>
            ))}
          </div>
        )}
      </header>
      {children}
    </section>
  );
}

function ChartPlaceholder() {
  const bars = [42, 58, 46, 71, 88, 63, 51];
  const labels = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
  return (
    <div>
      <div className="flex h-52 items-end gap-3">
        {bars.map((h, i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-1">
            <div className="flex w-full flex-col-reverse gap-0.5">
              <div
                className="w-full rounded-t-sm bg-primary"
                style={{ height: `${h * 1.6}px` }}
              />
              <div
                className="w-full rounded-t-sm bg-primary/25"
                style={{ height: `${h * 0.55}px` }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-3">
        {labels.map((l) => (
          <div key={l} className="flex-1 text-center text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {l}
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const isOk = status.toLowerCase().includes("concil");
  return (
    <span
      className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
        isOk ? "bg-success/15 text-success" : "bg-warning/25 text-warning-foreground"
      }`}
    >
      {status}
    </span>
  );
}

function IntegrationDot({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span className="flex items-center gap-1.5 text-muted-foreground">
      <span className={`h-2 w-2 rounded-full ${ok ? "bg-success" : "bg-destructive"}`} />
      <span className="font-medium text-foreground">{label}</span>
      <span>{ok ? "Online" : "Offline"}</span>
    </span>
  );
}
