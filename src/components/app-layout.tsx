import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Receipt,
  FileUp,
  GitCompareArrows,
  Bell,
  Building2,
  Users,
  Landmark,
  Wallet,
  LifeBuoy,
  LogOut,
  Menu,
  ChevronDown,
  ChevronRight,
  Search,
  BarChart3,
  Tags,
  ListTree,
} from "lucide-react";
import { Connect7Logo } from "./connect7-logo";
import { NovaMovimentacaoButton } from "./nova-movimentacao-button";
import { useAuth, isPathAllowed, type AppRole } from "@/lib/auth-context";

type NavItem = {
  label: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: AppRole[];
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

const DASHBOARD: NavItem = {
  label: "Dashboard",
  to: "/",
  icon: LayoutDashboard,
  roles: ["administrador", "master", "gerente", "analista", "operador"],
};

const GROUPS: NavGroup[] = [
  {
    label: "Ucase",
    items: [
      { label: "Vendas", to: "/vendas", icon: Receipt, roles: ["administrador", "gerente", "analista", "operador"] },
      { label: "Detalhamento", to: "/detalhamento", icon: BarChart3, roles: ["administrador", "master", "gerente", "analista", "operador"] },
    ],
  },
  {
    label: "Movimentação Bancária",
    items: [
      { label: "Extrato Bancário", to: "/extrato", icon: FileUp, roles: ["administrador", "gerente", "analista", "operador"] },
      { label: "Conciliação Bancária", to: "/conciliacao", icon: GitCompareArrows, roles: ["administrador", "master", "gerente", "analista", "operador"] },
      { label: "Extrato Financeiro", to: "/extrato-financeiro", icon: ListTree, roles: ["administrador", "master", "gerente", "analista", "operador"] },
    ],
  },
  {
    label: "Configurações",
    items: [
      { label: "Financeiras", to: "/financeiras", icon: Landmark, roles: ["administrador"] },
      { label: "Lojas", to: "/lojas", icon: Building2, roles: ["administrador"] },
      { label: "Contas Bancárias", to: "/contas", icon: Wallet, roles: ["administrador", "gerente"] },
      { label: "Categorias (DRE)", to: "/categorias", icon: Tags, roles: ["administrador"] },
      { label: "Usuários", to: "/usuarios", icon: Users, roles: ["administrador", "gerente"] },
    ],
  },
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

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Sidebar (desktop) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-sidebar-border bg-sidebar lg:flex lg:flex-col">
        <SidebarBody role={profile.role} currentPath={location.pathname} />
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
              role={profile.role}
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
            <NovaMovimentacaoButton />
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
  role,
  currentPath,
  onNavigate,
}: {
  role: AppRole;
  currentPath: string;
  onNavigate?: () => void;
}) {
  const visibleGroups = useMemo(
    () =>
      GROUPS.map((g) => ({
        label: g.label,
        items: g.items.filter((i) => i.roles.includes(role)),
      })).filter((g) => g.items.length > 0),
    [role],
  );

  const showDashboard = DASHBOARD.roles.includes(role);

  // Descobre a qual grupo pertence a rota atual (match mais específico primeiro)
  const activeGroupLabel = useMemo(() => {
    let best: { label: string; len: number } | null = null;
    for (const g of visibleGroups) {
      for (const item of g.items) {
        const matches =
          item.to === "/" ? currentPath === "/" : currentPath.startsWith(item.to);
        if (matches && (!best || item.to.length > best.len)) {
          best = { label: g.label, len: item.to.length };
        }
      }
    }
    return best?.label ?? null;
  }, [visibleGroups, currentPath]);

  // Accordion: um único grupo aberto por vez. Inicia no grupo da página atual.
  const [openGroup, setOpenGroup] = useState<string | null>(activeGroupLabel);

  // Ao navegar para outra página, abre automaticamente o grupo correspondente.
  useEffect(() => {
    if (activeGroupLabel) setOpenGroup(activeGroupLabel);
  }, [activeGroupLabel]);

  return (
    <>
      <div className="flex h-16 items-center border-b border-sidebar-border px-4">
        <Connect7Logo />
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {showDashboard && (
          <SidebarLink item={DASHBOARD} currentPath={currentPath} onNavigate={onNavigate} />
        )}
        {visibleGroups.map((g) => (
          <SidebarGroup
            key={g.label}
            label={g.label}
            items={g.items}
            currentPath={currentPath}
            onNavigate={onNavigate}
            isOpen={openGroup === g.label}
            onToggle={() =>
              setOpenGroup((cur) => (cur === g.label ? null : g.label))
            }
          />
        ))}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground/70">
          <LifeBuoy className="h-4 w-4 text-muted-foreground" />
          Suporte
        </div>
      </div>
    </>
  );
}

function SidebarGroup({
  label,
  items,
  currentPath,
  onNavigate,
  isOpen,
  onToggle,
}: {
  label: string;
  items: NavItem[];
  currentPath: string;
  onNavigate?: () => void;
  isOpen: boolean;
  onToggle: () => void;
}) {
  // Indica visualmente quando o grupo contém a página atual mas está fechado
  const hasActive = items.some((item) =>
    item.to === "/" ? currentPath === "/" : currentPath.startsWith(item.to),
  );

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-[11px] font-semibold uppercase tracking-wider transition-colors ${
          hasActive && !isOpen
            ? "text-primary"
            : "text-sidebar-foreground/60 hover:text-sidebar-foreground"
        }`}
      >
        <ChevronRight
          className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${
            isOpen ? "rotate-90" : ""
          }`}
        />
        <span className="truncate">{label}</span>
        {hasActive && !isOpen && (
          <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
        )}
      </button>

      <div
        className={`grid transition-all duration-200 ease-in-out ${
          isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="overflow-hidden">
          <div className="mt-0.5 space-y-0.5 pb-1 pl-2">
            {items.map((item) => (
              <SidebarLink
                key={item.to}
                item={item}
                currentPath={currentPath}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SidebarLink({
  item,
  currentPath,
  onNavigate,
}: {
  item: NavItem;
  currentPath: string;
  onNavigate?: () => void;
}) {
  const active =
    item.to === "/" ? currentPath === "/" : currentPath.startsWith(item.to);
  const Icon = item.icon;
  return (
    <Link
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
