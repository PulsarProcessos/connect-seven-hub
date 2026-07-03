import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Power } from "lucide-react";
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
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/_authenticated/contas")({
  head: () => ({
    meta: [
      { title: "Contas Bancárias · Connect 7" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ContasPage,
});

type Conta = {
  id: string;
  id_loja: string;
  banco: string;
  agencia: string;
  conta: string;
  ativa: boolean;
};

function ContasPage() {
  const { profile, lojas } = useAuth();
  const [rows, setRows] = useState<Conta[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Conta | null>(null);

  const isAdmin = profile?.role === "administrador";
  const isGerente = profile?.role === "gerente";
  const canAccess = isAdmin || isGerente;

  const lojaMap = useMemo(
    () => Object.fromEntries(lojas.map((l) => [l.id, l.nome])),
    [lojas],
  );

  const load = async () => {
    if (!profile) return;
    setLoading(true);
    let q = supabase
      .from("contas_bancarias")
      .select("id, id_loja, banco, agencia, conta, ativa");
    if (isGerente && profile.id_loja) q = q.eq("id_loja", profile.id_loja);
    const { data, error } = await q.order("banco");
    if (error) toast.error("Erro ao carregar contas");
    else setRows((data ?? []) as Conta[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, profile?.role]);

  if (profile && !canAccess) {
    return (
      <AppLayout>
        <p className="text-sm text-muted-foreground">Acesso restrito.</p>
      </AppLayout>
    );
  }

  const toggle = async (r: Conta) => {
    const { error } = await supabase
      .from("contas_bancarias")
      .update({ ativa: !r.ativa })
      .eq("id", r.id);
    if (error) return toast.error("Falha ao atualizar status");
    toast.success(!r.ativa ? "Conta ativada" : "Conta desativada");
    load();
  };

  return (
    <AppLayout>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Contas Bancárias</h1>
          <p className="text-sm text-muted-foreground">
            {isAdmin
              ? "Contas de todas as lojas da rede."
              : "Contas da sua loja."}
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          <Plus className="h-4 w-4" />
          Nova conta
        </Button>
      </div>

      <div className="mt-6 rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Loja</TableHead>
              <TableHead>Banco</TableHead>
              <TableHead>Agência</TableHead>
              <TableHead>Conta</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-24 text-right">Ações</TableHead>
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
                  Nenhuma conta cadastrada.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{lojaMap[r.id_loja] ?? "—"}</TableCell>
                  <TableCell>{r.banco}</TableCell>
                  <TableCell className="font-mono">{r.agencia}</TableCell>
                  <TableCell className="font-mono">{r.conta}</TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        r.ativa
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {r.ativa ? "Ativa" : "Inativa"}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setEditing(r);
                        setOpen(true);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => toggle(r)}>
                      <Power className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <ContaDialog
        open={open}
        onOpenChange={setOpen}
        editing={editing}
        onSaved={load}
      />
    </AppLayout>
  );
}

function ContaDialog({
  open,
  onOpenChange,
  editing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: Conta | null;
  onSaved: () => void;
}) {
  const { profile, lojas } = useAuth();
  const isGerente = profile?.role === "gerente";
  const lockedLoja = isGerente ? (profile?.id_loja ?? "") : "";

  const [idLoja, setIdLoja] = useState("");
  const [banco, setBanco] = useState("");
  const [agencia, setAgencia] = useState("");
  const [conta, setConta] = useState("");
  const [ativa, setAtiva] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setIdLoja(editing.id_loja);
      setBanco(editing.banco);
      setAgencia(editing.agencia);
      setConta(editing.conta);
      setAtiva(editing.ativa);
    } else {
      setIdLoja(lockedLoja);
      setBanco("");
      setAgencia("");
      setConta("");
      setAtiva(true);
    }
  }, [open, editing, lockedLoja]);

  const submit = async () => {
    if (!idLoja) return toast.error("Selecione a loja");
    if (!banco.trim()) return toast.error("Informe o banco");
    if (!agencia.trim()) return toast.error("Informe a agência");
    if (!conta.trim()) return toast.error("Informe a conta");

    setSaving(true);
    const payload = {
      id_loja: idLoja,
      banco: banco.trim(),
      agencia: agencia.trim(),
      conta: conta.trim(),
      ativa,
    };
    const { error } = editing
      ? await supabase.from("contas_bancarias").update(payload).eq("id", editing.id)
      : await supabase.from("contas_bancarias").insert(payload);
    setSaving(false);

    if (error) return toast.error(error.message);
    toast.success(editing ? "Conta atualizada" : "Conta criada");
    onOpenChange(false);
    onSaved();
  };

  const lojaOptions = isGerente
    ? lojas.filter((l) => l.id === profile?.id_loja)
    : lojas;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Editar conta" : "Nova conta bancária"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>Loja</Label>
            <Select
              value={idLoja}
              onValueChange={setIdLoja}
              disabled={isGerente || !!editing}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione…" />
              </SelectTrigger>
              <SelectContent>
                {lojaOptions.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>Banco</Label>
            <Input value={banco} onChange={(e) => setBanco(e.target.value)} placeholder="Ex.: Itaú" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Agência</Label>
              <Input value={agencia} onChange={(e) => setAgencia(e.target.value)} placeholder="0000" />
            </div>
            <div className="grid gap-2">
              <Label>Conta</Label>
              <Input value={conta} onChange={(e) => setConta(e.target.value)} placeholder="00000-0" />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2">
            <div>
              <div className="text-sm font-medium">Status</div>
              <div className="text-xs text-muted-foreground">
                {ativa ? "Ativa" : "Inativa"}
              </div>
            </div>
            <Switch checked={ativa} onCheckedChange={setAtiva} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
