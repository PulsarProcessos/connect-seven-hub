import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
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
import { friendlyDbError } from "@/lib/money";

export type PessoaTabela = "fornecedores" | "clientes";

type Pessoa = {
  id: string;
  id_loja: string | null;
  nome: string;
  documento: string | null;
  telefone: string | null;
  email: string | null;
  observacao: string | null;
  ativo: boolean;
};

const vazio = (idLoja: string | null): Pessoa => ({
  id: "",
  id_loja: idLoja,
  nome: "",
  documento: "",
  telefone: "",
  email: "",
  observacao: "",
  ativo: true,
});

export function PessoasPage({
  tabela,
  titulo,
  subtitulo,
  singular,
}: {
  tabela: PessoaTabela;
  titulo: string;
  subtitulo: string;
  singular: string;
}) {
  const { profile, lojas, selectedLojaId } = useAuth();
  const qc = useQueryClient();
  const isGlobal = profile?.role === "administrador" || profile?.role === "master";
  const podeEditar = profile?.role !== "master";

  const [busca, setBusca] = useState("");
  const [dlg, setDlg] = useState<Pessoa | null>(null);

  const listaQ = useQuery({
    queryKey: [tabela, selectedLojaId, profile?.id_loja],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(tabela)
        .select("id, id_loja, nome, documento, telefone, email, observacao, ativo")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as Pessoa[];
    },
  });

  const lojaNome = (id: string | null) =>
    id ? (lojas.find((l) => l.id === id)?.nome ?? "—") : "Todas as lojas";

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    let list = listaQ.data ?? [];
    if (!isGlobal) list = list;
    else if (selectedLojaId)
      list = list.filter((p) => p.id_loja === selectedLojaId || p.id_loja === null);
    if (!termo) return list;
    return list.filter((p) =>
      [p.nome, p.documento, p.email, p.telefone]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(termo)),
    );
  }, [listaQ.data, busca, isGlobal, selectedLojaId]);

  const salvar = useMutation({
    mutationFn: async (p: Pessoa) => {
      if (!p.nome.trim()) throw new Error("Informe o nome");
      const payload = {
        id_loja: p.id_loja,
        nome: p.nome.trim(),
        documento: p.documento?.trim() || null,
        telefone: p.telefone?.trim() || null,
        email: p.email?.trim() || null,
        observacao: p.observacao?.trim() || null,
        ativo: p.ativo,
      };
      const res = p.id
        ? await supabase.from(tabela).update(payload).eq("id", p.id)
        : await supabase.from(tabela).insert(payload);
      if (res.error) throw new Error(friendlyDbError(res.error));
    },
    onSuccess: () => {
      toast.success(`${singular} salvo`);
      qc.invalidateQueries({ queryKey: [tabela] });
      setDlg(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from(tabela).delete().eq("id", id);
      if (error) throw new Error(friendlyDbError(error));
    },
    onSuccess: () => {
      toast.success(`${singular} excluído`);
      qc.invalidateQueries({ queryKey: [tabela] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppLayout>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{titulo}</h1>
          <p className="text-sm text-muted-foreground">{subtitulo}</p>
        </div>
        {podeEditar && (
          <Button
            size="sm"
            onClick={() =>
              setDlg(vazio(isGlobal ? (selectedLojaId ?? null) : (profile?.id_loja ?? null)))
            }
          >
            <Plus className="h-4 w-4" />
            Novo {singular.toLowerCase()}
          </Button>
        )}
      </div>

      <div className="mt-5 flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome, documento, e-mail…"
          className="w-full bg-transparent text-sm outline-none"
        />
      </div>

      <div className="mt-4 rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Documento</TableHead>
              <TableHead>Telefone</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead>Loja</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {listaQ.isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                  Carregando…
                </TableCell>
              </TableRow>
            ) : filtradas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                  Nenhum registro.
                </TableCell>
              </TableRow>
            ) : (
              filtradas.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.nome}</TableCell>
                  <TableCell className="font-mono text-xs">{p.documento ?? "—"}</TableCell>
                  <TableCell className="text-sm">{p.telefone ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{p.email ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {lojaNome(p.id_loja)}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1 ring-inset ${
                        p.ativo
                          ? "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20 dark:text-emerald-400"
                          : "bg-muted text-muted-foreground ring-border"
                      }`}
                    >
                      {p.ativo ? "Ativo" : "Inativo"}
                    </span>
                  </TableCell>
                  <TableCell>
                    {podeEditar && (
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => setDlg(p)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (confirm(`Excluir ${p.nome}?`)) excluir.mutate(p.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-rose-500" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {dlg && (
        <Dialog open onOpenChange={(v) => !v && setDlg(null)}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {dlg.id ? `Editar ${singular.toLowerCase()}` : `Novo ${singular.toLowerCase()}`}
              </DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="grid gap-2">
                <Label>Nome</Label>
                <Input
                  value={dlg.nome}
                  onChange={(e) => setDlg({ ...dlg, nome: e.target.value })}
                  autoFocus
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Documento (CPF/CNPJ)</Label>
                  <Input
                    value={dlg.documento ?? ""}
                    onChange={(e) => setDlg({ ...dlg, documento: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Telefone</Label>
                  <Input
                    value={dlg.telefone ?? ""}
                    onChange={(e) => setDlg({ ...dlg, telefone: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label>E-mail</Label>
                <Input
                  type="email"
                  value={dlg.email ?? ""}
                  onChange={(e) => setDlg({ ...dlg, email: e.target.value })}
                />
              </div>
              {isGlobal && (
                <div className="grid gap-2">
                  <Label>Loja</Label>
                  <Select
                    value={dlg.id_loja ?? "todas"}
                    onValueChange={(v) => setDlg({ ...dlg, id_loja: v === "todas" ? null : v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todas">Todas as lojas</SelectItem>
                      {lojas.map((l) => (
                        <SelectItem key={l.id} value={l.id}>
                          {l.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="grid gap-2">
                <Label>Observação</Label>
                <Textarea
                  rows={2}
                  value={dlg.observacao ?? ""}
                  onChange={(e) => setDlg({ ...dlg, observacao: e.target.value })}
                />
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  checked={dlg.ativo}
                  onCheckedChange={(v) => setDlg({ ...dlg, ativo: v })}
                />
                <span className="text-sm">Ativo</span>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setDlg(null)}>
                Cancelar
              </Button>
              <Button onClick={() => salvar.mutate(dlg)} disabled={salvar.isPending}>
                {salvar.isPending ? "Salvando…" : "Salvar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </AppLayout>
  );
}
