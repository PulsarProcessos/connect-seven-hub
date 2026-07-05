import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type AppRole = Database["public"]["Enums"]["app_role"];

export type Profile = {
  id: string;
  nome: string;
  email: string;
  role: AppRole;
  id_loja: string | null;
};

export type Loja = { id: string; nome: string };

type AuthState = {
  loading: boolean;
  userId: string | null;
  profile: Profile | null;
  lojas: Loja[];
  selectedLojaId: string | null; // null = todas
  setSelectedLojaId: (v: string | null) => void;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthCtx = createContext<AuthState | null>(null);

// Rotas permitidas por role (paths conhecidos da sidebar)
const ROLE_ROUTES: Record<AppRole, string[]> = {
  administrador: [
    "/",
    "/vendas",
    "/detalhamento",
    "/extrato",
    "/conciliacao",
    "/extrato-financeiro",
    "/alertas",
    "/financeiras",
    "/lojas",
    "/contas",
    "/categorias",
    "/usuarios",
  ],
  master: ["/", "/detalhamento", "/conciliacao", "/extrato-financeiro", "/alertas"],
  gerente: ["/", "/vendas", "/detalhamento", "/extrato", "/conciliacao", "/extrato-financeiro", "/alertas", "/contas", "/usuarios"],
  analista: ["/", "/vendas", "/detalhamento", "/extrato", "/conciliacao", "/extrato-financeiro", "/alertas"],
  operador: ["/", "/vendas", "/detalhamento", "/extrato", "/conciliacao", "/extrato-financeiro", "/alertas"],
};

export function isPathAllowed(role: AppRole, pathname: string): boolean {
  const allowed = ROLE_ROUTES[role] ?? ["/"];
  return allowed.some((p) => (p === "/" ? pathname === "/" : pathname.startsWith(p)));
}

export function allowedRoutesFor(role: AppRole): string[] {
  return ROLE_ROUTES[role] ?? ["/"];
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [lojas, setLojas] = useState<Loja[]>([]);
  const [selectedLojaId, setSelectedLojaId] = useState<string | null>(null);

  const loadProfile = async (uid: string) => {
    const { data: perfil } = await supabase
      .from("usuarios_perfis")
      .select("id, nome, email, role, id_loja")
      .eq("id", uid)
      .maybeSingle();

    if (!perfil) {
      setProfile(null);
      setLojas([]);
      return;
    }
    setProfile(perfil as Profile);

    // Load lojas
    const { data: lojasData } = await supabase
      .from("lojas")
      .select("id, nome_fantasia")
      .order("nome_fantasia");

    const list: Loja[] = (lojasData ?? []).map((l) => ({
      id: l.id,
      nome: l.nome_fantasia,
    }));
    setLojas(list);


    // default selection
    if (perfil.role === "administrador" || perfil.role === "master") {
      setSelectedLojaId(null); // todas
    } else {
      setSelectedLojaId(perfil.id_loja ?? null);
    }
  };

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(async ({ data }) => {
      const uid = data.session?.user.id ?? null;
      if (!mounted) return;
      setUserId(uid);
      if (uid) await loadProfile(uid);
      if (mounted) setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED")
        return;
      const uid = session?.user.id ?? null;
      setUserId(uid);
      if (uid) {
        await loadProfile(uid);
      } else {
        setProfile(null);
        setLojas([]);
        setSelectedLojaId(null);
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      loading,
      userId,
      profile,
      lojas,
      selectedLojaId,
      setSelectedLojaId,
      signOut: async () => {
        await supabase.auth.signOut();
      },
      refreshProfile: async () => {
        if (userId) await loadProfile(userId);
      },
    }),
    [loading, userId, profile, lojas, selectedLojaId],
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
