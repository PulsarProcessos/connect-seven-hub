import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Receipt,
  GitCompareArrows,
  Bell,
  Building2,
  Users,
  Landmark,
  Wallet,
  Settings,
  LifeBuoy,
  LogOut,
  Menu,
  ChevronDown,
  Search,
} from "lucide-react";
import { Connect7Logo } from "./connect7-logo";
import { useAuth, isPathAllowed, type AppRole } from "@/lib/auth-context";

type NavItem = {
  label: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: AppRole[];
};

const NAV: NavItem[] = [
  { label: "Dashboard", to: "/", icon: LayoutDashboard, roles: ["administrador", "master", "gerente", "analista", "operador"] },
  { label: "Vendas Ucase", to: "/vendas", icon: Receipt, roles: ["administrador", "master", "gerente", "analista", "operador"] },
  { label: "Conciliação", to: "/conciliacao", icon: GitCompareArrows, roles: ["administrador", "master", "gerente", "analista", "operador"] },
  { label: "Alertas", to: "/alertas", icon: Bell, roles: ["administrador", "master", "gerente", "analista", "operador"] },
  { label: "Financeiras", to: "/financeiras", icon: Landmark, roles: ["administrador"] },
  { label: "Lojas", to: "/lojas", icon: Building2, roles: ["administrador"] },
  { label: "Contas Bancárias", to: "/contas", icon: Wallet, roles: ["administrador", "gerente"] },
  { label: "Usuários", to: "/usuarios", icon: Users, roles: ["administrador", "gerente"] },
];

export function AppLayout({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const { location } = useRouterState();
  const { profile, loading, signOut } = useAuth();
  const navigate = useNavigate();

  // Redireciona se o role não permite a rota
  useEffect(() => {
    if (!profile) return;
    if (!isPathAllowed(profile.role, location.pathname)) {
      navigate({ to: "/", replace: true });
    }
  }, [profile, location.pathname, navigate]);

  if (loading || !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-sm text-muted-foreground">Carregando…</div>
      </div>
    );
  }

  const items = NAV.filter((i) => i.roles.includes(profile.role));

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Sidebar (desktop) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-sidebar-border bg-sidebar lg:flex lg:flex-col">
        <SidebarBody items={items} currentPath={location.pathname} />
      </aside>

      {/* Sidebar (mobile) */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-foreground/30 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col border-r border-sidebar-border bg-sidebar">
            <SidebarBody
              items={items}
              currentPath={location.pathname}
              onNavigate={() => setOpen(false)}
            />
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
                {initials(profile.nome)}
              </div>
              <div className="hidden text-left leading-tight sm:block">
                <div className="text-xs font-semibold text-foreground">{profile.nome}</div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {roleLabel(profile.role)}
                </div>
              </div>
            </div>

            <button
              onClick={async () => {
                await signOut();
                navigate({ to: "/auth", replace: true });
              }}
              className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Sair"
              title="Sair"
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
  items,
  currentPath,
  onNavigate,
}: {
  items: NavItem[];
  currentPath: string;
  onNavigate?: () => void;
}) {
  return (
    <>
      <div className="flex h-16 items-center border-b border-sidebar-border px-4">
        <Connect7Logo />
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
        {items.map((item) => {
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
        <div className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground/70">
          <Settings className="h-4 w-4 text-muted-foreground" />
          Configurações
        </div>
        <div className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground/70">
          <LifeBuoy className="h-4 w-4 text-muted-foreground" />
          Suporte
        </div>
      </div>
    </>
  );
}

function StoreSelector() {
  const { profile, lojas, selectedLojaId, setSelectedLojaId } = useAuth();
  const [open, setOpen] = useState(false);
  if (!profile) return null;

  const isGlobal = profile.role === "administrador" || profile.role === "master";

  if (!isGlobal) {
    const nome = lojas.find((l) => l.id === profile.id_loja)?.nome ?? "Minha loja";
    return (
      <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground">
        <Building2 className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium">{nome}</span>
      </div>
    );
  }

  const label =
    selectedLojaId === null
      ? "Todas as unidades"
      : (lojas.find((l) => l.id === selectedLojaId)?.nome ?? "Unidade");

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground hover:bg-muted"
      >
        <Building2 className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium">{label}</span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-20 mt-1 w-64 overflow-hidden rounded-md border border-border bg-card shadow-lg">
            <button
              className={`flex w-full items-center px-3 py-2 text-left text-sm hover:bg-muted ${selectedLojaId === null ? "font-semibold text-primary" : "text-foreground"}`}
              onClick={() => {
                setSelectedLojaId(null);
                setOpen(false);
              }}
            >
              Todas as unidades
            </button>
            <div className="max-h-72 overflow-y-auto border-t border-border">
              {lojas.map((l) => (
                <button
                  key={l.id}
                  className={`flex w-full items-center px-3 py-2 text-left text-sm hover:bg-muted ${selectedLojaId === l.id ? "font-semibold text-primary" : "text-foreground"}`}
                  onClick={() => {
                    setSelectedLojaId(l.id);
                    setOpen(false);
                  }}
                >
                  {l.nome}
                </button>
              ))}
              {lojas.length === 0 && (
                <div className="px-3 py-2 text-xs text-muted-foreground">
                  Nenhuma loja cadastrada
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function initials(nome: string): string {
  return nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function roleLabel(role: AppRole): string {
  const map: Record<AppRole, string> = {
    administrador: "Administrador",
    master: "Master",
    gerente: "Gerente",
    analista: "Analista",
    operador: "Operador",
  };
  return map[role];
}
