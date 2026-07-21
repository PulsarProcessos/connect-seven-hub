import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Store, Tag } from "lucide-react";
import { toast } from "sonner";
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

/**
 * Gestão de catálogo (Financeiras ou Cartões) + as taxas de cada loja.
 *
 * Duas abas:
 *  - Catálogo: nomes das marcas, compartilhados por todas as lojas.
 *  - Taxas por loja: taxa e prazo que cada loja negociou com cada marca.
 *
 * A taxa da loja é a que o motor de previsão usa; o catálogo guarda
 * apenas o padrão de fallback.
 */

export type CatalogoItem = {
  id: string;
  nome: string;
  taxa_padrao: number;
  prazo_recebimento_dias: number;
  ativa: boolean;
};

export type VinculoLoja = {
  id: string;
  id_loja: string;
  taxa_padrao: number;
  prazo_recebimento_dias: number;
  ativa: boolean;
} & Record<string, unknown>;

type Props = {
  /** "financeiras" | "cartoes" */
  catalogoTable: "financeiras" | "cartoes";
  /** "loja_financeiras" | "loja_cartoes" */
  vinculoTable: "loja_financeiras" | "loja_cartoes";
  /** coluna FK no vínculo: "id_financeira" | "id_cartao" */
  fkColuna: "id_financeira" | "id_cartao";
  titulo: string;
  subtitulo: string;
  /** rótulo singular, ex.: "financeira" | "cartão" */
  singular: string;
  placeholderNome: string;
};

/** Máscara de taxa: digita da direita para a esquerda, sempre 3 casas. */
function maskTaxa(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 6);
  if (!digits) return "";
  const num = parseInt(digits, 10) / 1000;
  return num.toLocaleString("pt-BR", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
}

function parseTaxa(s: string): number {
  return Number(s.replace(/\./g, "").replace(",", ".")) || 0;
}

function fmtTaxa(v: unknown): string {
  return Number(v ?? 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
}

export function CatalogoTaxasPage({
  catalogoTable,
  vinculoTable,
  fkColuna,
  titulo,
  subtitulo,
  singular,
  placeholderNome,
}: Props) {
  const { profile, lojas } = useAuth();
  const [aba, setAba] = useState<"catalogo" | "taxas">("catalogo");
  const [itens, setItens] = useState<CatalogoItem[]>([]);
  const [vinculos, setVinculos] = useState<VinculoLoja[]>([]);
  const [lojaSel, setLojaSel] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [dlgItem, setDlgItem] = useState(false);
  const [editing, setEditing] = useState<CatalogoItem | null>(null);
  const [dlgVinculo, setDlgVinculo] = useState(false);
  const [editVinculo, setEditVinculo] = useState<VinculoLoja | null>(null);

  const isAdmin = profile?.role === "administrador";

  const loadCatalogo = async () => {
    const { data, error } = await supabase
      .from(catalogoTable)
      .select("id, nome, taxa_padrao, prazo_recebimento_dias, ativa")
      .order("nome");
    if (error) toast.error(`Erro ao carregar ${titulo.toLowerCase()}`);
    else setItens((data ?? []) as CatalogoItem[]);
  };

  const loadVinculos = async (loja: string) => {
    if (!loja) return setVinculos([]);
    const { data, error } = await supabase
      .from(vinculoTable)
      .select(`id, id_loja, ${fkColuna}, taxa_padrao, prazo_recebimento_dias, ativa`)
      .eq("id_loja", loja);
    if (error) toast.error("Erro ao carregar taxas da loja");
    else setVinculos((data ?? []) as unknown as VinculoLoja[]);
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadCatalogo();
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!lojaSel && lojas.length > 0) setLojaSel(lojas[0].id);
  }, [lojas, lojaSel]);

  useEffect(() => {
    if (lojaSel) loadVinculos(lojaSel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lojaSel]);

  const itemById = useMemo(
    () => Object.fromEntries(itens.map((i) => [i.id, i])),
    [itens],
  );

  /** Itens do catálogo que ainda não têm taxa cadastrada nesta loja */
  const semVinculo = useMemo(
    () => itens.filter((i) => !vinculos.some((v) => v[fkColuna] === i.id)),
    [itens, vinculos, fkColuna],
  );

  if (!isAdmin) {
    return <p className="text-sm text-muted-foreground">Acesso restrito ao administrador.</p>;
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{titulo}</h1>
          <p className="text-sm text-muted-foreground">{subtitulo}</p>
        </div>
        {aba === "catalogo" ? (
          <Button
            onClick={() => {
              setEditing(null);
              setDlgItem(true);
            }}
          >
            <Plus className="h-4 w-4" />
            {`Nova ${singular}`}
          </Button>
        ) : (
          <Button
            disabled={!lojaSel || semVinculo.length === 0}
            onClick={() => {
              setEditVinculo(null);
              setDlgVinculo(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Adicionar à loja
          </Button>
        )}
      </div>

      {/* Abas */}
      <div className="mt-6 flex gap-1 border-b border-border">
        <TabButton active={aba === "catalogo"} onClick={() => setAba("catalogo")}>
          <Tag className="h-4 w-4" />
          Catálogo
        </TabButton>
        <TabButton active={aba === "taxas"} onClick={() => setAba("taxas")}>
          <Store className="h-4 w-4" />
          Taxas por loja
        </TabButton>
      </div>

      {aba === "catalogo" ? (
        <>
          <p className="mt-4 text-xs text-muted-foreground">
            Cadastro das marcas disponíveis para todas as lojas. A taxa aqui é apenas o
            padrão de referência — o que vale no cálculo é a taxa definida por loja.
          </p>
          <div className="mt-3 rounded-lg border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead className="text-right">Taxa padrão (%)</TableHead>
                  <TableHead className="text-right">Prazo (dias úteis)</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-16 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                      Carregando…
                    </TableCell>
                  </TableRow>
                ) : itens.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                      Nenhum registro. Clique em “Nova {singular}”.
                    </TableCell>
                  </TableRow>
                ) : (
                  itens.map((f) => (
                    <TableRow key={f.id}>
                      <TableCell className="font-medium">{f.nome}</TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {fmtTaxa(f.taxa_padrao)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {f.prazo_recebimento_dias}
                      </TableCell>
                      <TableCell>
                        <StatusBadge ativa={f.ativa} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setEditing(f);
                            setDlgItem(true);
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
        </>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Label className="text-sm">Loja</Label>
            <Select value={lojaSel} onValueChange={setLojaSel}>
              <SelectTrigger className="w-[280px]">
                <SelectValue placeholder="Selecione a loja" />
              </SelectTrigger>
              <SelectContent>
                {lojas.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {semVinculo.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {semVinculo.length} sem taxa nesta loja
              </span>
            )}
          </div>

          <div className="mt-3 rounded-lg border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead className="text-right">Taxa da loja (%)</TableHead>
                  <TableHead className="text-right">Prazo (dias úteis)</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-24 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!lojaSel ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                      Selecione uma loja.
                    </TableCell>
                  </TableRow>
                ) : vinculos.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                      Nenhuma taxa cadastrada para esta loja.
                    </TableCell>
                  </TableRow>
                ) : (
                  vinculos.map((v) => {
                    const item = itemById[String(v[fkColuna])];
                    return (
                      <TableRow key={v.id}>
                        <TableCell className="font-medium">{item?.nome ?? "—"}</TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {fmtTaxa(v.taxa_padrao)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {v.prazo_recebimento_dias}
                        </TableCell>
                        <TableCell>
                          <StatusBadge ativa={v.ativa} />
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setEditVinculo(v);
                              setDlgVinculo(true);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={async () => {
                              const { error } = await supabase
                                .from(vinculoTable)
                                .delete()
                                .eq("id", v.id);
                              if (error) return toast.error(error.message);
                              toast.success("Removido desta loja");
                              loadVinculos(lojaSel);
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <ItemDialog
        open={dlgItem}
        onOpenChange={setDlgItem}
        editing={editing}
        table={catalogoTable}
        singular={singular}
        placeholderNome={placeholderNome}
        onSaved={loadCatalogo}
      />

      <VinculoDialog
        open={dlgVinculo}
        onOpenChange={setDlgVinculo}
        editing={editVinculo}
        disponiveis={semVinculo}
        itemById={itemById}
        lojaId={lojaSel}
        table={vinculoTable}
        fkColuna={fkColuna}
        singular={singular}
        onSaved={() => loadVinculos(lojaSel)}
      />
    </>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
        active
          ? "border-primary text-primary"
          : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function StatusBadge({ ativa }: { ativa: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        ativa ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"
      }`}
    >
      {ativa ? "Ativa" : "Inativa"}
    </span>
  );
}

/** Cadastro/edição do item do catálogo */
function ItemDialog({
  open,
  onOpenChange,
  editing,
  table,
  singular,
  placeholderNome,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: CatalogoItem | null;
  table: "financeiras" | "cartoes";
  singular: string;
  placeholderNome: string;
  onSaved: () => void;
}) {
  const [nome, setNome] = useState("");
  const [taxa, setTaxa] = useState("");
  const [prazo, setPrazo] = useState("");
  const [ativa, setAtiva] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setNome(editing.nome);
      setTaxa(fmtTaxa(editing.taxa_padrao));
      setPrazo(String(editing.prazo_recebimento_dias));
      setAtiva(editing.ativa);
    } else {
      setNome("");
      setTaxa("");
      setPrazo("");
      setAtiva(true);
    }
  }, [open, editing]);

  const submit = async () => {
    if (!nome.trim()) return toast.error("Informe o nome");
    const prazoNum = Number(prazo || 0);
    if (!Number.isInteger(prazoNum) || prazoNum < 0) return toast.error("Prazo inválido");

    setSaving(true);
    const payload = {
      nome: nome.trim(),
      taxa_padrao: parseTaxa(taxa),
      prazo_recebimento_dias: prazoNum,
      ativa,
    };
    const { error } = editing
      ? await supabase.from(table).update(payload).eq("id", editing.id)
      : await supabase.from(table).insert(payload);
    setSaving(false);

    if (error) {
      if (error.code === "23505") return toast.error("Já existe um registro com este nome");
      return toast.error(error.message);
    }
    toast.success(editing ? "Atualizado" : "Cadastrado");
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>
            {editing ? `Editar ${singular}` : `Nova ${singular}`}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>Nome</Label>
            <Input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder={placeholderNome}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Taxa padrão (%)</Label>
              <Input
                value={taxa}
                onChange={(e) => setTaxa(maskTaxa(e.target.value))}
                inputMode="decimal"
                placeholder="0,000"
              />
            </div>
            <div className="grid gap-2">
              <Label>Prazo (dias úteis)</Label>
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
                {ativa ? "Ativa — disponível em vendas" : "Inativa"}
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

/** Cadastro/edição da taxa daquela loja */
function VinculoDialog({
  open,
  onOpenChange,
  editing,
  disponiveis,
  itemById,
  lojaId,
  table,
  fkColuna,
  singular,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: VinculoLoja | null;
  disponiveis: CatalogoItem[];
  itemById: Record<string, CatalogoItem>;
  lojaId: string;
  table: "loja_financeiras" | "loja_cartoes";
  fkColuna: "id_financeira" | "id_cartao";
  singular: string;
  onSaved: () => void;
}) {
  const [itemId, setItemId] = useState("");
  const [taxa, setTaxa] = useState("");
  const [prazo, setPrazo] = useState("");
  const [ativa, setAtiva] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setItemId(String(editing[fkColuna] ?? ""));
      setTaxa(fmtTaxa(editing.taxa_padrao));
      setPrazo(String(editing.prazo_recebimento_dias));
      setAtiva(editing.ativa);
    } else {
      setItemId("");
      setTaxa("");
      setPrazo("");
      setAtiva(true);
    }
  }, [open, editing, fkColuna]);

  // Ao escolher um item novo, sugere a taxa padrão do catálogo
  useEffect(() => {
    if (editing || !itemId) return;
    const base = itemById[itemId];
    if (base) {
      setTaxa(fmtTaxa(base.taxa_padrao));
      setPrazo(String(base.prazo_recebimento_dias));
    }
  }, [itemId, editing, itemById]);

  const submit = async () => {
    if (!lojaId) return toast.error("Selecione a loja");
    if (!editing && !itemId) return toast.error(`Selecione a ${singular}`);
    const prazoNum = Number(prazo || 0);
    if (!Number.isInteger(prazoNum) || prazoNum < 0) return toast.error("Prazo inválido");

    setSaving(true);
    let error;
    if (editing) {
      ({ error } = await supabase
        .from(table)
        .update({
          taxa_padrao: parseTaxa(taxa),
          prazo_recebimento_dias: prazoNum,
          ativa,
        })
        .eq("id", editing.id));
    } else if (table === "loja_financeiras") {
      ({ error } = await supabase.from("loja_financeiras").insert({
        id_loja: lojaId,
        id_financeira: itemId,
        taxa_padrao: parseTaxa(taxa),
        prazo_recebimento_dias: prazoNum,
        ativa,
      }));
    } else {
      ({ error } = await supabase.from("loja_cartoes").insert({
        id_loja: lojaId,
        id_cartao: itemId,
        taxa_padrao: parseTaxa(taxa),
        prazo_recebimento_dias: prazoNum,
        ativa,
      }));
    }
    setSaving(false);

    if (error) {
      if (error.code === "23505")
        return toast.error("Esta loja já possui taxa cadastrada para este item");
      return toast.error(error.message);
    }
    toast.success(editing ? "Taxa atualizada" : "Taxa cadastrada");
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Editar taxa da loja" : "Adicionar à loja"}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          {editing ? (
            <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm font-medium">
              {itemById[String(editing[fkColuna])]?.nome ?? "—"}
            </div>
          ) : (
            <div className="grid gap-2">
              <Label>Selecione</Label>
              <Select value={itemId} onValueChange={setItemId}>
                <SelectTrigger>
                  <SelectValue placeholder="Escolha…" />
                </SelectTrigger>
                <SelectContent>
                  {disponiveis.map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Taxa desta loja (%)</Label>
              <Input
                value={taxa}
                onChange={(e) => setTaxa(maskTaxa(e.target.value))}
                inputMode="decimal"
                placeholder="0,000"
              />
            </div>
            <div className="grid gap-2">
              <Label>Prazo (dias úteis)</Label>
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
                {ativa ? "Ativa nesta loja" : "Inativa nesta loja"}
              </div>
            </div>
            <Switch checked={ativa} onCheckedChange={setAtiva} />
          </div>

          <p className="text-xs text-muted-foreground">
            Esta é a taxa usada no cálculo do líquido previsto das vendas desta loja.
          </p>
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
