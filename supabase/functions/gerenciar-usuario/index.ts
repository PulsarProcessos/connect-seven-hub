// Edge Function: gerenciar-usuario
// Ações: "criar" (padrão), "atualizar", "resetar_senha"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type AppRole = "administrador" | "master" | "gerente" | "analista" | "operador";
type Acao = "criar" | "atualizar" | "resetar_senha";

type Payload = {
  acao?: Acao;
  id?: string;
  nome?: string;
  email?: string;
  senha?: string;
  role?: AppRole;
  id_loja?: string | null;
  ativo?: boolean;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const VALID_ROLES: AppRole[] = ["administrador", "master", "gerente", "analista", "operador"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Não autenticado" }, 401);

  const userClient = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return json({ error: "Sessão inválida" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: caller, error: callerErr } = await admin
    .from("usuarios_perfis")
    .select("id, role, id_loja")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (callerErr || !caller) return json({ error: "Perfil do solicitante não encontrado" }, 403);

  if (caller.role !== "administrador" && caller.role !== "gerente") {
    return json({ error: "Sem permissão" }, 403);
  }

  let body: Payload;
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }

  const acao: Acao = body.acao ?? "criar";

  // Helper: gerente pode atuar sobre este usuário?
  async function loadTarget(id: string) {
    const { data, error } = await admin
      .from("usuarios_perfis")
      .select("id, role, id_loja")
      .eq("id", id)
      .maybeSingle();
    if (error || !data) return null;
    return data as { id: string; role: AppRole; id_loja: string | null };
  }

  function gerenteCanTouch(target: { role: AppRole; id_loja: string | null }): string | null {
    if (!caller.id_loja) return "Gerente sem loja associada";
    if (!["analista", "operador"].includes(target.role)) {
      return "Gerente só pode gerenciar Analista ou Operador";
    }
    if (target.id_loja !== caller.id_loja) return "Usuário fora da sua loja";
    return null;
  }

  // ─────────────────────────── CRIAR ───────────────────────────
  if (acao === "criar") {
    const nome = (body.nome ?? "").trim();
    const email = (body.email ?? "").trim().toLowerCase();
    const senha = body.senha ?? "";
    const role = body.role;
    let id_loja = body.id_loja ?? null;

    if (!nome || !email || !senha || !role) return json({ error: "Campos obrigatórios ausentes" }, 400);
    if (senha.length < 8) return json({ error: "Senha deve ter ao menos 8 caracteres" }, 400);
    if (!VALID_ROLES.includes(role)) return json({ error: "Role inválido" }, 400);

    if (caller.role === "gerente") {
      if (!caller.id_loja) return json({ error: "Gerente sem loja associada" }, 403);
      if (!["analista", "operador"].includes(role)) {
        return json({ error: "Gerente só pode criar Analista ou Operador" }, 403);
      }
      id_loja = caller.id_loja;
    }

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
  }

  // ─────────────────────────── ATUALIZAR ───────────────────────────
  if (acao === "atualizar") {
    const id = body.id;
    if (!id) return json({ error: "ID obrigatório" }, 400);
    const target = await loadTarget(id);
    if (!target) return json({ error: "Usuário não encontrado" }, 404);

    if (caller.role === "gerente") {
      const err = gerenteCanTouch(target);
      if (err) return json({ error: err }, 403);
    }

    const update: Record<string, unknown> = {};
    if (typeof body.nome === "string" && body.nome.trim()) update.nome = body.nome.trim();
    if (typeof body.email === "string" && body.email.trim()) {
      const email = body.email.trim().toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(email)) return json({ error: "E-mail inválido" }, 400);
      update.email = email;
    }
    if (typeof body.ativo === "boolean") update.ativo = body.ativo;

    if (typeof body.role === "string") {
      if (!VALID_ROLES.includes(body.role)) return json({ error: "Role inválido" }, 400);
      if (caller.role === "gerente" && !["analista", "operador"].includes(body.role)) {
        return json({ error: "Gerente só pode atribuir Analista ou Operador" }, 403);
      }
      update.role = body.role;
    }

    if (body.id_loja !== undefined) {
      if (caller.role === "gerente") {
        // gerente não muda loja; ignora
      } else {
        update.id_loja = body.id_loja;
      }
    }

    // Atualiza email no Auth também se mudou
    if (update.email) {
      const { error: authErr } = await admin.auth.admin.updateUserById(id, {
        email: update.email as string,
        email_confirm: true,
      });
      if (authErr) return json({ error: `Auth: ${authErr.message}` }, 400);
    }

    const { error: upErr } = await admin.from("usuarios_perfis").update(update).eq("id", id);
    if (upErr) return json({ error: upErr.message }, 400);
    return json({ ok: true });
  }

  // ─────────────────────────── RESETAR SENHA ───────────────────────────
  if (acao === "resetar_senha") {
    const id = body.id;
    const senha = body.senha ?? "";
    if (!id) return json({ error: "ID obrigatório" }, 400);
    if (senha.length < 8) return json({ error: "Senha deve ter ao menos 8 caracteres" }, 400);

    const target = await loadTarget(id);
    if (!target) return json({ error: "Usuário não encontrado" }, 404);

    if (caller.role === "gerente") {
      const err = gerenteCanTouch(target);
      if (err) return json({ error: err }, 403);
    }

    const { error: pwErr } = await admin.auth.admin.updateUserById(id, { password: senha });
    if (pwErr) return json({ error: pwErr.message }, 400);
    return json({ ok: true });
  }

  return json({ error: "Ação inválida" }, 400);
});
