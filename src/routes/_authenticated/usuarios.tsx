import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { KeyRound, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { useAuth, type AppRole } from "@/lib/auth-context";

export const Route = createFileRoute("/_authenticated/usuarios")({
  head: () => ({
    meta: [
      { title: "Usuários · Connect 7" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: UsuariosPage,
});

type Row = {
  id: string;
  nome: string;
  email: string;
  role: AppRole;
  id_loja: string | null;
  ativo: boolean;
};

type Loja = { id: string; nome_fantasia: string };

const ROLE_LABEL: Record<AppRole, string> = {
  administrador: "Administrador",
  master: "Master",
  gerente: "Gerente",
  analista: "Analista",
  operador: "Operador",
};

const FN = "gerenciar-usuario";

async function invokeFn(body: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.functions.invoke(FN, { body });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    if (ctx) {
      try {
        const j = await ctx.json();
        return { ok: false, error: j.error ?? error.message };
      } catch { /* ignore */ }
    }
    return { ok: false, error: error.message };
  }
  if (data && (data as { error?: string }).error) {
    return { ok: false, error: (data as { error: string }).error };
  }
  return { ok: true };
}

function UsuariosPage() {
  const { profile } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [lojas, setLojas] = useState<Loja[]>([]);
  const [loading, setLoading] = useState(true);
  const [openNovo, setOpenNovo] = useState(false);
  const [editRow, setEditRow] = useState<Row | null>(null);
  const [pwRow, setPwRow] = useState<Row | null>(null);

  const allowed =
    profile && (profile.role === "administrador" || profile.role === "gerente");
  const isGerente = profile?.role === "gerente";

  const load = async () => {
    if (!profile) return;
    setLoading(true);
    let q = supabase
      .from("usuarios_perfis")
      .select("id, nome, email, role, id_loja, ativo")
      .order("nome");
    if (profile.role === "gerente" && profile.id_loja) {
      q = q.eq("id_loja", profile.id_loja);
    }
    const [{ data, error }, { data: lojasData }] = await Promise.all([
      q,
      supabase.from("lojas").select("id, nome_fantasia").order("nome_fantasia"),
    ]);
    if (error) toast.error("Erro ao carregar usuários");
    else setRows((data ?? []) as Row[]);
    setLojas((lojasData ?? []) as Loja[]);
    setLoading(false);
  };

  useEffect(() => {
    if (allowed) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  const lojaMap = useMemo(
    () => Object.fromEntries(lojas.map((l) => [l.id, l.nome_fantasia])),
    [lojas],
  );

  const canManage = (r: Row): boolean => {
    if (profile?.role === "administrador") return true;
    if (isGerente) {
      return (
        (r.role === "analista" || r.role === "operador") &&
        r.id_loja === profile?.id_loja
      );
    }
    return false;
  };

  const toggleAtivo = async (r: Row) => {
    if (!canManage(r)) return toast.error("Sem permissão");
    const res = await invokeFn({ acao: "atualizar", id: r.id, ativo: !r.ativo });
    if (!res.ok) return toast.error(res.error ?? "Erro");
    toast.success(r.ativo ? "Usuário desativado" : "Usuário reativado");
    load();
  };

  if (profile && !allowed) {
    return (
      <AppLayout>
        <p className="text-sm text-muted-foreground">Acesso restrito.</p>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Usuários</h1>
          <p className="text-sm text-muted-foreground">
            Perfis, papéis e vínculos com lojas.
          </p>
        </div>
        <Button onClick={() => setOpenNovo(true)}>
          <Plus className="h-4 w-4" />
          Novo usuário
        </Button>
      </div>

      <div className="mt-6 rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead>Loja</TableHead>
              <TableHead>Nível</TableHead>
              <TableHead>Ativo</TableHead>
              <TableHead className="w-32 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  Carregando…
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  Nenhum usuário encontrado.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => {
                const manageable = canManage(r);
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.nome}</TableCell>
                    <TableCell className="text-muted-foreground">{r.email}</TableCell>
                    <TableCell>
                      {r.id_loja ? lojaMap[r.id_loja] ?? "—" : (
                        <span className="text-muted-foreground">Global</span>
                      )}
                    </TableCell>
                    <TableCell>{ROLE_LABEL[r.role]}</TableCell>
                    <TableCell>
                      <Switch
                        checked={r.ativo}
                        disabled={!manageable}
                        onCheckedChange={() => toggleAtivo(r)}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={!manageable}
                          onClick={() => setEditRow(r)}
                          title="Editar"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={!manageable}
                          onClick={() => setPwRow(r)}
                          title="Redefinir senha"
                        >
                          <KeyRound className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <NovoUsuarioDialog
        open={openNovo}
        onOpenChange={setOpenNovo}
        lojas={lojas}
        onSaved={load}
      />
      <EditarUsuarioDialog
        row={editRow}
        onClose={() => setEditRow(null)}
        lojas={lojas}
        onSaved={load}
      />
      <ResetSenhaDialog
        row={pwRow}
        onClose={() => setPwRow(null)}
      />
    </AppLayout>
  );
}

// ─────────────────────────── Novo ───────────────────────────

function NovoUsuarioDialog({
  open,
  onOpenChange,
  lojas,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lojas: Loja[];
  onSaved: () => void;
}) {
  const { profile } = useAuth();
  const isGerente = profile?.role === "gerente";

  const roleOptions: AppRole[] = isGerente
    ? ["analista", "operador"]
    : ["administrador", "master", "gerente", "analista", "operador"];

  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [role, setRole] = useState<AppRole>(roleOptions[0]);
  const [idLoja, setIdLoja] = useState<string>(
    isGerente ? profile?.id_loja ?? "" : "",
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNome("");
    setEmail("");
    setSenha("");
    setRole(roleOptions[0]);
    setIdLoja(isGerente ? profile?.id_loja ?? "" : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const needsLoja = role !== "administrador" && role !== "master";

  const submit = async () => {
    if (!nome.trim()) return toast.error("Informe o nome");
    if (!/^\S+@\S+\.\S+$/.test(email)) return toast.error("E-mail inválido");
    if (senha.length < 8) return toast.error("Senha deve ter ao menos 8 caracteres");
    if (needsLoja && !idLoja) return toast.error("Selecione uma loja");

    setSaving(true);
    const res = await invokeFn({
      acao: "criar",
      nome: nome.trim(),
      email: email.trim().toLowerCase(),
      senha,
      role,
      id_loja: needsLoja ? idLoja : null,
    });
    setSaving(false);
    if (!res.ok) return toast.error(res.error ?? "Erro");
    toast.success("Usuário criado");
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo usuário</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>Nome</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>E-mail</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Senha</Label>
              <Input
                type="password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                placeholder="mín. 8 caracteres"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Nível</Label>
              <Select value={role} onValueChange={(v) => setRole(v as AppRole)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {roleOptions.map((r) => (
                    <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Loja</Label>
              <Select
                value={idLoja}
                onValueChange={setIdLoja}
                disabled={isGerente || !needsLoja}
              >
                <SelectTrigger>
                  <SelectValue placeholder={needsLoja ? "Selecione" : "—"} />
                </SelectTrigger>
                <SelectContent>
                  {lojas.map((l) => (
                    <SelectItem key={l.id} value={l.id}>{l.nome_fantasia}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isGerente && (
                <p className="text-xs text-muted-foreground">Travado na sua loja.</p>
              )}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Criando…" : "Criar usuário"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────── Editar ───────────────────────────

function EditarUsuarioDialog({
  row,
  onClose,
  lojas,
  onSaved,
}: {
  row: Row | null;
  onClose: () => void;
  lojas: Loja[];
  onSaved: () => void;
}) {
  const { profile } = useAuth();
  const isGerente = profile?.role === "gerente";
  const roleOptions: AppRole[] = isGerente
    ? ["analista", "operador"]
    : ["administrador", "master", "gerente", "analista", "operador"];

  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AppRole>("operador");
  const [idLoja, setIdLoja] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!row) return;
    setNome(row.nome);
    setEmail(row.email);
    setRole(row.role);
    setIdLoja(row.id_loja ?? "");
  }, [row]);

  if (!row) return null;

  const needsLoja = role !== "administrador" && role !== "master";

  const submit = async () => {
    if (!nome.trim()) return toast.error("Informe o nome");
    if (!/^\S+@\S+\.\S+$/.test(email)) return toast.error("E-mail inválido");
    if (needsLoja && !idLoja) return toast.error("Selecione uma loja");

    setSaving(true);
    const res = await invokeFn({
      acao: "atualizar",
      id: row.id,
      nome: nome.trim(),
      email: email.trim().toLowerCase(),
      role,
      id_loja: isGerente ? undefined : (needsLoja ? idLoja : null),
    });
    setSaving(false);
    if (!res.ok) return toast.error(res.error ?? "Erro");
    toast.success("Usuário atualizado");
    onClose();
    onSaved();
  };

  return (
    <Dialog open={!!row} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar usuário</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>Nome</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>E-mail</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Nível</Label>
              <Select value={role} onValueChange={(v) => setRole(v as AppRole)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {roleOptions.map((r) => (
                    <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Loja</Label>
              <Select
                value={idLoja}
                onValueChange={setIdLoja}
                disabled={isGerente || !needsLoja}
              >
                <SelectTrigger>
                  <SelectValue placeholder={needsLoja ? "Selecione" : "—"} />
                </SelectTrigger>
                <SelectContent>
                  {lojas.map((l) => (
                    <SelectItem key={l.id} value={l.id}>{l.nome_fantasia}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isGerente && (
                <p className="text-xs text-muted-foreground">Loja travada.</p>
              )}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────── Reset Senha ───────────────────────────

function ResetSenhaDialog({ row, onClose }: { row: Row | null; onClose: () => void }) {
  const [senha, setSenha] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (row) setSenha("");
  }, [row]);

  if (!row) return null;

  const submit = async () => {
    if (senha.length < 8) return toast.error("Senha deve ter ao menos 8 caracteres");
    setSaving(true);
    const res = await invokeFn({ acao: "resetar_senha", id: row.id, senha });
    setSaving(false);
    if (!res.ok) return toast.error(res.error ?? "Erro");
    toast.success("Senha redefinida");
    onClose();
  };

  return (
    <Dialog open={!!row} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Redefinir senha</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <p className="text-sm text-muted-foreground">
            Nova senha para <span className="font-medium text-foreground">{row.nome}</span>.
          </p>
          <div className="grid gap-2">
            <Label>Nova senha</Label>
            <Input
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder="mín. 8 caracteres"
              autoFocus
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Salvando…" : "Redefinir"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
