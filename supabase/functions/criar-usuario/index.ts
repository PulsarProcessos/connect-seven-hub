// Edge Function: criar-usuario
// Cria usuários no Auth + insere perfil em usuarios_perfis com regras de RBAC.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type AppRole = "administrador" | "master" | "gerente" | "analista" | "operador";

type Payload = {
  nome?: string;
  email?: string;
  senha?: string;
  role?: AppRole;
  id_loja?: string | null;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Não autenticado" }, 401);

  // Cliente com JWT do solicitante para identificar quem chama
  const userClient = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return json({ error: "Sessão inválida" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Perfil do solicitante
  const { data: caller, error: callerErr } = await admin
    .from("usuarios_perfis")
    .select("id, role, id_loja")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (callerErr || !caller) return json({ error: "Perfil do solicitante não encontrado" }, 403);

  let body: Payload;
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }

  const nome = (body.nome ?? "").trim();
  const email = (body.email ?? "").trim().toLowerCase();
  const senha = body.senha ?? "";
  const role = body.role as AppRole | undefined;
  let id_loja = body.id_loja ?? null;

  if (!nome || !email || !senha || !role) return json({ error: "Campos obrigatórios ausentes" }, 400);
  if (senha.length < 8) return json({ error: "Senha deve ter ao menos 8 caracteres" }, 400);

  const validRoles: AppRole[] = ["administrador", "master", "gerente", "analista", "operador"];
  if (!validRoles.includes(role)) return json({ error: "Role inválido" }, 400);

  // Regras de autorização
  if (caller.role === "gerente") {
    if (!caller.id_loja) return json({ error: "Gerente sem loja associada" }, 403);
    if (!["analista", "operador"].includes(role)) {
      return json({ error: "Gerente só pode criar Analista ou Operador" }, 403);
    }
    // Força id_loja do gerente, ignorando o que veio
    id_loja = caller.id_loja;
  } else if (caller.role === "administrador") {
    // Admin pode tudo — id_loja opcional (obrigatório se role != administrador/master? Deixamos livre)
  } else {
    return json({ error: "Sem permissão para criar usuários" }, 403);
  }

  // Cria no Auth
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    user_metadata: { nome },
  });
  if (createErr || !created.user) {
    return json({ error: createErr?.message ?? "Erro ao criar usuário" }, 400);
  }

  const newUserId = created.user.id;

  // Insere perfil (rollback se falhar)
  const { error: profileErr } = await admin.from("usuarios_perfis").insert({
    id: newUserId,
    nome,
    email,
    role,
    id_loja,
    ativo: true,
  });

  if (profileErr) {
    await admin.auth.admin.deleteUser(newUserId);
    return json({ error: `Falha ao criar perfil: ${profileErr.message}` }, 400);
  }

  return json({ ok: true, id: newUserId });
});
