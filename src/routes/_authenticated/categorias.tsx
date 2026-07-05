import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/_authenticated/categorias")({
  head: () => ({
    meta: [
      { title: "Categorias (DRE) · Connect 7" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CategoriasPage,
});

type Natureza = "receita" | "despesa";
type Grupo = {
  id: string;
  nome: string;
  natureza: Natureza;
  ordem: number;
  ativo: boolean;
};
type Categoria = {
  id: string;
  id_grupo: string;
  nome: string;
  ordem: number;
  ativo: boolean;
};

function CategoriasPage() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [openNovoGrupo, setOpenNovoGrupo] = useState(false);
  const [editGrupo, setEditGrupo] = useState<Grupo | null>(null);
  const [delGrupo, setDelGrupo] = useState<Grupo | null>(null);

  const grupos = useQuery({
    queryKey: ["dre_grupos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dre_grupos")
        .select("id, nome, natureza, ordem, ativo")
        .order("natureza")
        .order("ordem")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as Grupo[];
    },
  });

  const categorias = useQuery({
    queryKey: ["dre_categorias"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dre_categorias")
        .select("id, id_grupo, nome, ordem, ativo")
        .order("ordem")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as Categoria[];
    },
  });

  const toggleGrupo = useMutation({
    mutationFn: async (g: Grupo) => {
      const { error } = await supabase
        .from("dre_grupos")
        .update({ ativo: !g.ativo })
        .eq("id", g.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Grupo atualizado");
      qc.invalidateQueries({ queryKey: ["dre_grupos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removerGrupo = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("dre_grupos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Grupo removido");
      qc.invalidateQueries({ queryKey: ["dre_grupos"] });
      qc.invalidateQueries({ queryKey: ["dre_categorias"] });
      setDelGrupo(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (profile && profile.role !== "administrador") {
    return (
      <AppLayout>
        <p className="text-sm text-muted-foreground">Acesso restrito.</p>
      </AppLayout>
    );
  }

  const loading = grupos.isLoading || categorias.isLoading;

  return (
    <AppLayout>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Categorias (DRE)</h1>
          <p className="text-sm text-muted-foreground">
            Estrutura do Demonstrativo de Resultados: grupos e categorias.
          </p>
        </div>
        <Button onClick={() => setOpenNovoGrupo(true)}>
          <Plus className="h-4 w-4" />
          Novo grupo
        </Button>
      </div>

      <div className="mt-6 space-y-4">
        {loading && <p className="text-sm text-muted-foreground">Carregando…</p>}
        {!loading && grupos.data?.length === 0 && (
          <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
            Nenhum grupo cadastrado.
          </div>
        )}
        {grupos.data?.map((g) => (
          <GrupoCard
            key={g.id}
            grupo={g}
            categorias={(categorias.data ?? []).filter((c) => c.id_grupo === g.id)}
            onToggle={() => toggleGrupo.mutate(g)}
            onEdit={() => setEditGrupo(g)}
            onDelete={() => setDelGrupo(g)}
          />
        ))}
      </div>

      <GrupoDialog
        open={openNovoGrupo || !!editGrupo}
        grupo={editGrupo}
        onClose={() => {
          setOpenNovoGrupo(false);
          setEditGrupo(null);
        }}
      />

      <AlertDialog open={!!delGrupo} onOpenChange={(v) => !v && setDelGrupo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir grupo?</AlertDialogTitle>
            <AlertDialogDescription>
              Todas as categorias vinculadas a{" "}
              <strong>{delGrupo?.nome}</strong> serão removidas em cascata. Esta
              ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => delGrupo && removerGrupo.mutate(delGrupo.id)}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}

function GrupoCard({
  grupo,
  categorias,
  onToggle,
  onEdit,
  onDelete,
}: {
  grupo: Grupo;
  categorias: Categoria[];
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const qc = useQueryClient();
  const [novaCat, setNovaCat] = useState(false);
  const [novoNome, setNovoNome] = useState("");
  const [novoOrdem, setNovoOrdem] = useState<string>("0");

  const criarCat = useMutation({
    mutationFn: async () => {
      const nome = novoNome.trim();
      if (!nome) throw new Error("Informe o nome");
      const { error } = await supabase.from("dre_categorias").insert({
        id_grupo: grupo.id,
        nome,
        ordem: Number(novoOrdem) || 0,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Categoria criada");
      setNovaCat(false);
      setNovoNome("");
      setNovoOrdem("0");
      qc.invalidateQueries({ queryKey: ["dre_categorias"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const natCls =
    grupo.natureza === "receita"
      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 ring-emerald-500/20"
      : "bg-rose-500/10 text-rose-700 dark:text-rose-400 ring-rose-500/20";

  return (
    <section
      className={`rounded-lg border border-border bg-card ${
        grupo.ativo ? "" : "opacity-60"
      }`}
    >
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1 ring-inset ${natCls}`}
        >
          {grupo.natureza}
        </span>
        <h2 className="text-sm font-semibold text-foreground">{grupo.nome}</h2>
        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
          #{grupo.ordem}
        </span>
        <div className="ml-auto flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch checked={grupo.ativo} onCheckedChange={onToggle} />
            <span className="text-xs text-muted-foreground">
              {grupo.ativo ? "Ativo" : "Inativo"}
            </span>
          </div>
          <Button variant="ghost" size="icon" onClick={onEdit} title="Editar grupo">
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onDelete}
            title="Excluir grupo"
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </header>

      <div className="divide-y divide-border">
        {categorias.length === 0 && !novaCat && (
          <div className="px-4 py-3 text-xs text-muted-foreground">
            Nenhuma categoria neste grupo.
          </div>
        )}
        {categorias.map((c) => (
          <CategoriaRow key={c.id} categoria={c} />
        ))}
        {novaCat && (
          <div className="flex items-center gap-2 bg-muted/40 px-4 py-2">
            <Input
              value={novoOrdem}
              onChange={(e) => setNovoOrdem(e.target.value)}
              className="w-16 font-mono"
              placeholder="0"
            />
            <Input
              value={novoNome}
              onChange={(e) => setNovoNome(e.target.value)}
              placeholder="Nome da categoria"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") criarCat.mutate();
                if (e.key === "Escape") setNovaCat(false);
              }}
            />
            <Button
              size="sm"
              onClick={() => criarCat.mutate()}
              disabled={criarCat.isPending}
            >
              <Check className="h-4 w-4" /> Salvar
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setNovaCat(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      <footer className="border-t border-border px-4 py-2">
        {!novaCat && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setNovaCat(true)}
            className="text-primary hover:text-primary"
          >
            <Plus className="h-4 w-4" /> Categoria
          </Button>
        )}
      </footer>
    </section>
  );
}

function CategoriaRow({ categoria }: { categoria: Categoria }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [nome, setNome] = useState(categoria.nome);
  const [ordem, setOrdem] = useState(String(categoria.ordem));

  const salvar = useMutation({
    mutationFn: async () => {
      const n = nome.trim();
      if (!n) throw new Error("Informe o nome");
      const { error } = await supabase
        .from("dre_categorias")
        .update({ nome: n, ordem: Number(ordem) || 0 })
        .eq("id", categoria.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Categoria atualizada");
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["dre_categorias"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("dre_categorias")
        .update({ ativo: !categoria.ativo })
        .eq("id", categoria.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dre_categorias"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const remover = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("dre_categorias")
        .delete()
        .eq("id", categoria.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Categoria removida");
      qc.invalidateQueries({ queryKey: ["dre_categorias"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (editing) {
    return (
      <div className="flex items-center gap-2 bg-muted/40 px-4 py-2">
        <Input
          value={ordem}
          onChange={(e) => setOrdem(e.target.value)}
          className="w-16 font-mono"
        />
        <Input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") salvar.mutate();
            if (e.key === "Escape") setEditing(false);
          }}
        />
        <Button size="sm" onClick={() => salvar.mutate()} disabled={salvar.isPending}>
          <Check className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div
      className={`flex items-center gap-3 px-4 py-2 text-sm ${categoria.ativo ? "" : "opacity-60"}`}
    >
      <span className="w-10 font-mono text-xs text-muted-foreground">
        #{categoria.ordem}
      </span>
      <span className="flex-1 text-foreground">{categoria.nome}</span>
      <Switch
        checked={categoria.ativo}
        onCheckedChange={() => toggle.mutate()}
      />
      <Button variant="ghost" size="icon" onClick={() => setEditing(true)}>
        <Pencil className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => {
          if (confirm(`Remover a categoria "${categoria.nome}"?`)) remover.mutate();
        }}
      >
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
    </div>
  );
}

function GrupoDialog({
  open,
  grupo,
  onClose,
}: {
  open: boolean;
  grupo: Grupo | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [nome, setNome] = useState("");
  const [natureza, setNatureza] = useState<Natureza>("receita");
  const [ordem, setOrdem] = useState("0");

  // reset on open change
  useResetOnOpen(open, () => {
    setNome(grupo?.nome ?? "");
    setNatureza((grupo?.natureza as Natureza) ?? "receita");
    setOrdem(String(grupo?.ordem ?? 0));
  });

  const salvar = useMutation({
    mutationFn: async () => {
      const n = nome.trim();
      if (!n) throw new Error("Informe o nome");
      if (grupo) {
        const { error } = await supabase
          .from("dre_grupos")
          .update({ nome: n, natureza, ordem: Number(ordem) || 0 })
          .eq("id", grupo.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("dre_grupos").insert({
          nome: n,
          natureza,
          ordem: Number(ordem) || 0,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(grupo ? "Grupo atualizado" : "Grupo criado");
      qc.invalidateQueries({ queryKey: ["dre_grupos"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{grupo ? "Editar grupo" : "Novo grupo"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>Nome</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Natureza</Label>
              <Select value={natureza} onValueChange={(v) => setNatureza(v as Natureza)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="receita">Receita</SelectItem>
                  <SelectItem value="despesa">Despesa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Ordem</Label>
              <Input
                type="number"
                value={ordem}
                onChange={(e) => setOrdem(e.target.value)}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={salvar.isPending}>
            Cancelar
          </Button>
          <Button onClick={() => salvar.mutate()} disabled={salvar.isPending}>
            {salvar.isPending ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// small helper hook
import { useEffect } from "react";
function useResetOnOpen(open: boolean, cb: () => void) {
  useEffect(() => {
    if (open) cb();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
}
