import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/_authenticated/financeiras")({
  head: () => ({
    meta: [
      { title: "Financeiras · Connect 7" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: FinanceirasPage,
});

type Financeira = {
  id: string;
  nome: string;
  taxa_padrao: number;
  prazo_recebimento_dias: number;
  ativa: boolean;
};

function FinanceirasPage() {
  const { profile } = useAuth();
  const [rows, setRows] = useState<Financeira[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Financeira | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("financeiras")
      .select("id, nome, taxa_padrao, prazo_recebimento_dias, ativa")
      .order("nome");
    if (error) toast.error("Erro ao carregar financeiras");
    else setRows((data ?? []) as Financeira[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  if (profile && profile.role !== "administrador") {
    return (
      <AppLayout>
        <p className="text-sm text-muted-foreground">Acesso restrito.</p>
      </AppLayout>
    );
  }

  const toggle = async (r: Financeira) => {
    const { error } = await supabase
      .from("financeiras")
      .update({ ativa: !r.ativa })
      .eq("id", r.id);
    if (error) return toast.error("Falha ao atualizar status");
    toast.success(!r.ativa ? "Financeira ativada" : "Financeira desativada");
    load();
  };

  return (
    <AppLayout>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Financeiras</h1>
          <p className="text-sm text-muted-foreground">
            Adquirentes, taxas padrão e prazos de recebimento.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          <Plus className="h-4 w-4" />
          Nova financeira
        </Button>
      </div>

      <div className="mt-6 rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead className="text-right">Taxa padrão (%)</TableHead>
              <TableHead className="text-right">Prazo (dias)</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-24 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                  Carregando…
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                  Nenhuma financeira cadastrada.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.nome}</TableCell>
                  <TableCell className="text-right font-mono">
                    {Number(r.taxa_padrao).toFixed(3).replace(".", ",")}
                  </TableCell>
                  <TableCell className="text-right font-mono">{r.prazo_recebimento_dias}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch checked={r.ativa} onCheckedChange={() => toggle(r)} />
                      <span className="text-xs text-muted-foreground">
                        {r.ativa ? "Ativa" : "Inativa"}
                      </span>
                    </div>
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

      <FinanceiraDialog
        open={open}
        onOpenChange={setOpen}
        editing={editing}
        onSaved={load}
      />
    </AppLayout>
  );
}

function FinanceiraDialog({
  open,
  onOpenChange,
  editing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: Financeira | null;
  onSaved: () => void;
}) {
  const [nome, setNome] = useState("");
  const [taxa, setTaxa] = useState("0,000");
  const [prazo, setPrazo] = useState("30");
  const [ativa, setAtiva] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setNome(editing.nome);
      setTaxa(Number(editing.taxa_padrao).toFixed(3).replace(".", ","));
      setPrazo(String(editing.prazo_recebimento_dias));
      setAtiva(editing.ativa);
    } else {
      setNome("");
      setTaxa("0,000");
      setPrazo("30");
      setAtiva(true);
    }
  }, [open, editing]);

  const submit = async () => {
    if (!nome.trim()) return toast.error("Informe o nome");
    const taxaNum = Number(taxa.replace(",", "."));
    const prazoNum = Number(prazo);
    if (Number.isNaN(taxaNum) || taxaNum < 0) return toast.error("Taxa inválida");
    if (!Number.isInteger(prazoNum) || prazoNum < 0) return toast.error("Prazo inválido");

    setSaving(true);
    const payload = {
      nome: nome.trim(),
      taxa_padrao: taxaNum,
      prazo_recebimento_dias: prazoNum,
      ativa,
    };
    const { error } = editing
      ? await supabase.from("financeiras").update(payload).eq("id", editing.id)
      : await supabase.from("financeiras").insert(payload);
    setSaving(false);

    if (error) return toast.error(error.message);
    toast.success(editing ? "Financeira atualizada" : "Financeira criada");
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Editar financeira" : "Nova financeira"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>Nome</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Cielo" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Taxa padrão (%)</Label>
              <Input
                value={taxa}
                onChange={(e) => setTaxa(e.target.value)}
                inputMode="decimal"
                placeholder="2,990"
              />
            </div>
            <div className="grid gap-2">
              <Label>Prazo (dias)</Label>
              <Input
                value={prazo}
                onChange={(e) => setPrazo(e.target.value.replace(/\D/g, ""))}
                inputMode="numeric"
                placeholder="30"
              />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2">
            <div>
              <div className="text-sm font-medium">Status</div>
              <div className="text-xs text-muted-foreground">
                {ativa ? "Ativa — disponível em vendas" : "Inativa — oculta em novas vendas"}
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
