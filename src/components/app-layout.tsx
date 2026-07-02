import { useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Receipt,
  Upload,
  GitCompareArrows,
  Bell,
  Building2,
  Users,
  Settings,
  LifeBuoy,
  LogOut,
  Menu,
  ChevronDown,
  Search,
} from "lucide-react";
import { Connect7Logo } from "./connect7-logo";

type NavItem = {
  label: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
};

const NAV: NavItem[] = [
  { label: "Dashboard", to: "/", icon: LayoutDashboard },
  { label: "Vendas Ucase", to: "/vendas", icon: Receipt },
  { label: "Importar", to: "/importar", icon: Upload },
  { label: "Conciliação", to: "/conciliacao", icon: GitCompareArrows },
  { label: "Alertas", to: "/alertas", icon: Bell },
  { label: "Cadastros", to: "/cadastros", icon: Building2 },
  { label: "Usuários", to: "/usuarios", icon: Users },
];

export function AppLayout({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const { location } = useRouterState();

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Sidebar (desktop) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-sidebar-border bg-sidebar lg:flex lg:flex-col">
        <SidebarBody currentPath={location.pathname} />
      </aside>

      {/* Sidebar (mobile) */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-foreground/30 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col border-r border-sidebar-border bg-sidebar">
            <SidebarBody currentPath={location.pathname} onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      {/* Topbar */}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur-md sm:px-6">
          <button
            className="rounded-md p-2 text-muted-foreground hover:bg-muted lg:hidden"
            onClick={() => setOpen(true)}
            aria-label="Abrir menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          <StoreSelector />

          <div className="relative hidden flex-1 max-w-md md:block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              placeholder="Buscar relatório, financeira, loja…"
              className="h-9 w-full rounded-md border border-input bg-card pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30"
            />
          </div>

          <div className="ml-auto flex items-center gap-3">
            <button className="relative rounded-md p-2 text-muted-foreground hover:bg-muted">
              <Bell className="h-5 w-5" />
              <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-destructive" />
            </button>

            <div className="flex items-center gap-2.5 rounded-md border border-border bg-card px-2 py-1.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                AS
              </div>
              <div className="hidden text-left leading-tight sm:block">
                <div className="text-xs font-semibold text-foreground">Ana Silva</div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Administrador
                </div>
              </div>
            </div>

            <button
              className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Sair"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

function SidebarBody({
  currentPath,
  onNavigate,
}: {
  currentPath: string;
  onNavigate?: () => void;
}) {
  return (
    <>
      <div className="flex h-16 items-center border-b border-sidebar-border px-4">
        <Connect7Logo />
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
        {NAV.map((item) => {
          const active =
            item.to === "/" ? currentPath === "/" : currentPath.startsWith(item.to);
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              className={`group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
              }`}
            >
              <Icon
                className={`h-4 w-4 ${active ? "text-primary" : "text-muted-foreground group-hover:text-foreground"}`}
              />
              {item.label}
              {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <button className="mb-2 flex w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-95">
          + Nova conciliação
        </button>
        <Link
          to="/"
          className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent/50"
        >
          <Settings className="h-4 w-4 text-muted-foreground" />
          Configurações
        </Link>
        <Link
          to="/"
          className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent/50"
        >
          <LifeBuoy className="h-4 w-4 text-muted-foreground" />
          Suporte
        </Link>
      </div>
    </>
  );
}

function StoreSelector() {
  return (
    <button className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground hover:bg-muted">
      <Building2 className="h-4 w-4 text-muted-foreground" />
      <span className="hidden font-medium sm:inline">Todas as unidades</span>
      <span className="font-medium sm:hidden">Unidades</span>
      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
    </button>
  );
}
