import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Tags, Trash2, Search } from "lucide-react";
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

export const Route = createFileRoute("/_authenticated/lojas")({
  head: () => ({
    meta: [
      { title: "Lojas · Connect 7" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: LojasPage,
});

type TipoSocio = "propria" | "franqueado";

type TipoLoja = {
  id: string;
  nome: string;
  ordem: number;
  ativo: boolean;
};

type Loja = {
  id: string;
  razao_social: string;
  nome_fantasia: string;
  cnpj: string;
  tipo_socio: TipoSocio;
  id_tipo_loja: string | null;
  ativa: boolean;
};

const SOCIO_LABEL: Record<TipoSocio, string> = {
  propria: "Loja Própria",
  franqueado: "Franqueado",
};

function formatCnpj(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

function LojasPage() {
  const { profile } = useAuth();
  const [rows, setRows] = useState<Loja[]>([]);
  const [tipos, setTipos] = useState<TipoLoja[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [tiposOpen, setTiposOpen] = useState(false);
  const [editing, setEditing] = useState<Loja | null>(null);

  // Filtros
  const [busca, setBusca] = useState("");
  const [fSocio, setFSocio] = useState<string>("todos");
  const [fTipo, setFTipo] = useState<string>("todos");

  const load = async () => {
    setLoading(true);
    const [lojasRes, tiposRes] = await Promise.all([
      supabase
        .from("lojas")
        .select("id, razao_social, nome_fantasia, cnpj, tipo_socio, id_tipo_loja, ativa")
        .order("nome_fantasia"),
      supabase.from("tipos_loja").select("id, nome, ordem, ativo").order("ordem"),
    ]);
    if (lojasRes.error) toast.error("Erro ao carregar lojas");
    else setRows((lojasRes.data ?? []) as Loja[]);
    if (!tiposRes.error) setTipos((tiposRes.data ?? []) as TipoLoja[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const tipoNome = useMemo(
    () => Object.fromEntries(tipos.map((t) => [t.id, t.nome])),
    [tipos],
  );

  const filtered = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, "");
    return rows.filter((r) => {
      if (fSocio !== "todos" && r.tipo_socio !== fSocio) return false;
      if (fTipo !== "todos") {
        if (fTipo === "sem" ? r.id_tipo_loja !== null : r.id_tipo_loja !== fTipo) return false;
      }
      if (!q) return true;
      return (
        r.nome_fantasia.toLowerCase().includes(q) ||
        r.razao_social.toLowerCase().includes(q) ||
        (qDigits.length > 0 && r.cnpj.replace(/\D/g, "").includes(qDigits))
      );
    });
  }, [rows, busca, fSocio, fTipo]);

  if (profile && profile.role !== "administrador") {
    return (
      <AppLayout>
        <p className="text-sm text-muted-foreground">Acesso restrito.</p>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Lojas</h1>
          <p className="text-sm text-muted-foreground">
            Unidades próprias e franqueadas do grupo.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setTiposOpen(true)}>
            <Tags className="h-4 w-4" />
            Tipos de loja
          </Button>
          <Button
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Nova loja
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, razão social ou CNPJ…"
          />
        </div>
        <Select value={fSocio} onValueChange={setFSocio}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Tipo sócio" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os sócios</SelectItem>
            <SelectItem value="propria">Loja Própria</SelectItem>
            <SelectItem value="franqueado">Franqueado</SelectItem>
          </SelectContent>
        </Select>
        <Select value={fTipo} onValueChange={setFTipo}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Tipo de loja" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os tipos</SelectItem>
            {tipos.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.nome}
              </SelectItem>
            ))}
            <SelectItem value="sem">— Sem tipo definido</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="mt-4 rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tipo Sócio</TableHead>
              <TableHead>CNPJ</TableHead>
              <TableHead>Razão Social</TableHead>
              <TableHead>Nome Loja</TableHead>
              <TableHead>Tipo de Loja</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-16 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                  Carregando…
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                  {rows.length === 0
                    ? "Nenhuma loja cadastrada."
                    : "Nenhuma loja encontrada com esses filtros."}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        r.tipo_socio === "propria"
                          ? "bg-primary/10 text-primary"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {SOCIO_LABEL[r.tipo_socio]}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{formatCnpj(r.cnpj)}</TableCell>
                  <TableCell className="max-w-[260px] truncate" title={r.razao_social}>
                    {r.razao_social}
                  </TableCell>
                  <TableCell className="font-medium">{r.nome_fantasia}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {r.id_tipo_loja ? (tipoNome[r.id_tipo_loja] ?? "—") : "—"}
                  </TableCell>
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
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {!loading && filtered.length > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          {filtered.length} de {rows.length} loja(s)
        </p>
      )}

      <LojaDialog
        open={open}
        onOpenChange={setOpen}
        editing={editing}
        tipos={tipos}
        onSaved={load}
      />
      <TiposLojaDialog open={tiposOpen} onOpenChange={setTiposOpen} onSaved={load} />
    </AppLayout>
  );
}

function LojaDialog({
  open,
  onOpenChange,
  editing,
  tipos,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: Loja | null;
  tipos: TipoLoja[];
  onSaved: () => void;
}) {
  const [razaoSocial, setRazaoSocial] = useState("");
  const [nome, setNome] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [tipoSocio, setTipoSocio] = useState<TipoSocio>("propria");
  const [idTipoLoja, setIdTipoLoja] = useState<string>("sem");
  const [ativa, setAtiva] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setRazaoSocial(editing.razao_social ?? "");
      setNome(editing.nome_fantasia);
      setCnpj(formatCnpj(editing.cnpj));
      setTipoSocio(editing.tipo_socio ?? "propria");
      setIdTipoLoja(editing.id_tipo_loja ?? "sem");
      setAtiva(editing.ativa);
    } else {
      setRazaoSocial("");
      setNome("");
      setCnpj("");
      setTipoSocio("propria");
      setIdTipoLoja("sem");
      setAtiva(true);
    }
  }, [open, editing]);

  const submit = async () => {
    if (!razaoSocial.trim()) return toast.error("Informe a razão social");
    if (!nome.trim()) return toast.error("Informe o nome da loja");
    const cnpjDigits = cnpj.replace(/\D/g, "");
    if (cnpjDigits.length !== 14) return toast.error("CNPJ deve ter 14 dígitos");

    setSaving(true);
    const payload = {
      razao_social: razaoSocial.trim(),
      nome_fantasia: nome.trim(),
      cnpj: cnpjDigits,
      tipo_socio: tipoSocio,
      id_tipo_loja: idTipoLoja === "sem" ? null : idTipoLoja,
      ativa,
    };
    const { error } = editing
      ? await supabase.from("lojas").update(payload).eq("id", editing.id)
      : await supabase.from("lojas").insert(payload);
    setSaving(false);

    if (error) {
      if (error.code === "23505" || /duplicate|unique/i.test(error.message)) {
        return toast.error("Já existe uma loja com este CNPJ");
      }
      return toast.error(error.message);
    }
    toast.success(editing ? "Loja atualizada" : "Loja criada");
    onOpenChange(false);
    onSaved();
  };

  const tiposAtivos = tipos.filter((t) => t.ativo || t.id === idTipoLoja);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar loja" : "Nova loja"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>
                Tipo Sócio <span className="text-destructive">*</span>
              </Label>
              <Select value={tipoSocio} onValueChange={(v) => setTipoSocio(v as TipoSocio)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="propria">Loja Própria</SelectItem>
                  <SelectItem value="franqueado">Franqueado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>
                CNPJ <span className="text-destructive">*</span>
              </Label>
              <Input
                value={cnpj}
                onChange={(e) => setCnpj(formatCnpj(e.target.value))}
                placeholder="00.000.000/0000-00"
                inputMode="numeric"
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label>
              Razão Social <span className="text-destructive">*</span>
            </Label>
            <Input
              value={razaoSocial}
              onChange={(e) => setRazaoSocial(e.target.value)}
              placeholder="Ex.: CONNECT 7 LTDA"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>
                Nome Loja <span className="text-destructive">*</span>
              </Label>
              <Input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex.: VIA SUL"
              />
            </div>
            <div className="grid gap-2">
              <Label>Tipo de Loja</Label>
              <Select value={idTipoLoja} onValueChange={setIdTipoLoja}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sem">— Não definido</SelectItem>
                  {tiposAtivos.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2">
            <div>
              <div className="text-sm font-medium">Status</div>
              <div className="text-xs text-muted-foreground">
                {ativa ? "Ativa" : "Inativa — oculta em operações"}
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

function TiposLojaDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const [tipos, setTipos] = useState<TipoLoja[]>([]);
  const [novo, setNovo] = useState("");
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("tipos_loja")
      .select("id, nome, ordem, ativo")
      .order("ordem");
    if (error) toast.error("Erro ao carregar tipos");
    else setTipos((data ?? []) as TipoLoja[]);
    setLoading(false);
  };

  useEffect(() => {
    if (open) load();
  }, [open]);

  const adicionar = async () => {
    const nome = novo.trim();
    if (!nome) return;
    const ordem = tipos.length ? Math.max(...tipos.map((t) => t.ordem)) + 1 : 1;
    const { error } = await supabase.from("tipos_loja").insert({ nome, ordem });
    if (error) {
      if (error.code === "23505") return toast.error("Este tipo já existe");
      return toast.error(error.message);
    }
    setNovo("");
    toast.success("Tipo adicionado");
    load();
    onSaved();
  };

  const alternarAtivo = async (t: TipoLoja) => {
    const { error } = await supabase
      .from("tipos_loja")
      .update({ ativo: !t.ativo })
      .eq("id", t.id);
    if (error) return toast.error(error.message);
    load();
    onSaved();
  };

  const remover = async (t: TipoLoja) => {
    const { error } = await supabase.from("tipos_loja").delete().eq("id", t.id);
    if (error) return toast.error("Não foi possível remover. Verifique se há lojas usando este tipo.");
    toast.success("Tipo removido");
    load();
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Tipos de loja</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="flex gap-2">
            <Input
              value={novo}
              onChange={(e) => setNovo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") adicionar();
              }}
              placeholder="Ex.: Loja de Shopping"
            />
            <Button onClick={adicionar} disabled={!novo.trim()}>
              <Plus className="h-4 w-4" />
              Adicionar
            </Button>
          </div>

          <div className="rounded-md border border-border">
            {loading ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Carregando…</p>
            ) : tipos.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nenhum tipo cadastrado.
              </p>
            ) : (
              tipos.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between border-b border-border px-3 py-2 last:border-b-0"
                >
                  <span className={`text-sm ${t.ativo ? "" : "text-muted-foreground line-through"}`}>
                    {t.nome}
                  </span>
                  <div className="flex items-center gap-2">
                    <Switch checked={t.ativo} onCheckedChange={() => alternarAtivo(t)} />
                    <Button variant="ghost" size="icon" onClick={() => remover(t)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Desativar mantém o tipo nas lojas que já o utilizam, mas oculta em novos cadastros.
          </p>
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
