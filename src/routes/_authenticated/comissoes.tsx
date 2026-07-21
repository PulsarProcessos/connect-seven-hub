import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Calculator, AlertTriangle } from "lucide-react";
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

export const Route = createFileRoute("/_authenticated/comissoes")({
  head: () => ({
    meta: [
      { title: "Comissões · Connect 7" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ComissoesPage,
});

type Faixa = {
  id: string;
  id_loja: string;
  valor_min: number;
  valor_max: number | null;
  percentual: number;
  ativa: boolean;
};

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const fmt = (v: unknown) => BRL.format(Number(v ?? 0) || 0);
const fmtPct = (v: unknown) =>
  Number(v ?? 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });

/** Máscara monetária: digita da direita para a esquerda. */
function maskMoney(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 12);
  if (!d) return "";
  return (parseInt(d, 10) / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
function parseMoney(s: string): number {
  return Number(s.replace(/\./g, "").replace(",", ".")) || 0;
}
function maskPct(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 6);
  if (!d) return "";
  return (parseInt(d, 10) / 1000).toLocaleString("pt-BR", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
}
function parsePct(s: string): number {
  return Number(s.replace(/\./g, "").replace(",", ".")) || 0;
}

/** Cálculo progressivo, espelhando a função calcular_comissao do banco. */
function calcularComissao(faixas: Faixa[], total: number): number {
  let com = 0;
  for (const f of faixas.filter((x) => x.ativa).sort((a, b) => a.valor_min - b.valor_min)) {
    const teto = f.valor_max == null ? total : Math.min(Number(f.valor_max), total);
    const fatia = teto - Number(f.valor_min);
    if (fatia > 0) com += (fatia * Number(f.percentual)) / 100;
  }
  return Math.round(com * 100) / 100;
}

function ComissoesPage() {
  const { profile, lojas } = useAuth();
  const [lojaSel, setLojaSel] = useState("");
  const [faixas, setFaixas] = useState<Faixa[]>([]);
  const [loading, setLoading] = useState(false);
  const [dlg, setDlg] = useState(false);
  const [editing, setEditing] = useState<Faixa | null>(null);
  const [simulacao, setSimulacao] = useState("");

  const isAdmin = profile?.role === "administrador";

  const load = async (loja: string) => {
    if (!loja) return setFaixas([]);
    setLoading(true);
    const { data, error } = await supabase
      .from("comissao_faixas")
      .select("id, id_loja, valor_min, valor_max, percentual, ativa")
      .eq("id_loja", loja)
      .order("valor_min");
    if (error) toast.error("Erro ao carregar faixas");
    else setFaixas((data ?? []) as Faixa[]);
    setLoading(false);
  };

  useEffect(() => {
    if (!lojaSel && lojas.length > 0) setLojaSel(lojas[0].id);
  }, [lojas, lojaSel]);

  useEffect(() => {
    if (lojaSel) load(lojaSel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lojaSel]);

  const ordenadas = useMemo(
    () => [...faixas].sort((a, b) => Number(a.valor_min) - Number(b.valor_min)),
    [faixas],
  );

  /** Detecta buracos e sobreposições entre as faixas. */
  const inconsistencias = useMemo(() => {
    const msgs: string[] = [];
    const ativas = ordenadas.filter((f) => f.ativa);
    for (let i = 0; i < ativas.length - 1; i++) {
      const atual = ativas[i];
      const prox = ativas[i + 1];
      if (atual.valor_max == null) {
        msgs.push("Uma faixa sem teto não pode ter faixas depois dela.");
        break;
      }
      const fim = Number(atual.valor_max);
      const ini = Number(prox.valor_min);
      if (ini > fim) msgs.push(`Intervalo descoberto entre ${fmt(fim)} e ${fmt(ini)}.`);
      if (ini < fim) msgs.push(`Sobreposição entre ${fmt(ini)} e ${fmt(fim)}.`);
    }
    if (ativas.length > 0 && Number(ativas[0].valor_min) > 0)
      msgs.push(`Nenhuma faixa cobre de ${fmt(0)} até ${fmt(ativas[0].valor_min)}.`);
    if (ativas.length > 0 && ativas[ativas.length - 1].valor_max != null)
      msgs.push("A última faixa deveria ficar sem teto, para cobrir vendas acima do limite.");
    return msgs;
  }, [ordenadas]);

  const valorSimulado = parseMoney(simulacao);
  const comissaoSimulada = calcularComissao(ordenadas, valorSimulado);

  const remover = async (f: Faixa) => {
    const { error } = await supabase.from("comissao_faixas").delete().eq("id", f.id);
    if (error) return toast.error(error.message);
    toast.success("Faixa removida");
    load(lojaSel);
  };

  if (!isAdmin) {
    return (
      <AppLayout>
        <p className="text-sm text-muted-foreground">Acesso restrito ao administrador.</p>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Comissões</h1>
          <p className="text-sm text-muted-foreground">
            Faixas por volume mensal de vendas. O cálculo é progressivo — cada fatia do
            faturamento usa o percentual da sua faixa.
          </p>
        </div>
        <Button
          disabled={!lojaSel}
          onClick={() => {
            setEditing(null);
            setDlg(true);
          }}
        >
          <Plus className="h-4 w-4" />
          Nova faixa
        </Button>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
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
      </div>

      {inconsistencias.length > 0 && (
        <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3">
          <div className="flex items-center gap-2 text-sm font-medium text-amber-800">
            <AlertTriangle className="h-4 w-4" />
            Revise as faixas
          </div>
          <ul className="mt-1 list-inside list-disc text-xs text-amber-700">
            {inconsistencias.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>De</TableHead>
              <TableHead>Até</TableHead>
              <TableHead className="text-right">Percentual</TableHead>
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
            ) : ordenadas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                  Nenhuma faixa cadastrada para esta loja.
                </TableCell>
              </TableRow>
            ) : (
              ordenadas.map((f) => (
                <TableRow key={f.id}>
                  <TableCell className="font-mono text-sm">{fmt(f.valor_min)}</TableCell>
                  <TableCell className="font-mono text-sm">
                    {f.valor_max == null ? (
                      <span className="text-muted-foreground">sem teto</span>
                    ) : (
                      fmt(f.valor_max)
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm font-medium">
                    {fmtPct(f.percentual)}%
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        f.ativa
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {f.ativa ? "Ativa" : "Inativa"}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setEditing(f);
                        setDlg(true);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => remover(f)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Simulador */}
      {ordenadas.length > 0 && (
        <div className="mt-6 rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Calculator className="h-4 w-4 text-primary" />
            Simulador
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Informe um faturamento mensal para conferir a comissão resultante.
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-4">
            <div className="grid gap-2">
              <Label className="text-xs">Faturamento do mês (R$)</Label>
              <Input
                className="w-[200px] font-mono"
                value={simulacao}
                onChange={(e) => setSimulacao(maskMoney(e.target.value))}
                inputMode="numeric"
                placeholder="0,00"
              />
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Comissão</div>
              <div className="font-mono text-lg font-semibold text-primary">
                {fmt(comissaoSimulada)}
              </div>
            </div>
            {valorSimulado > 0 && (
              <div>
                <div className="text-xs text-muted-foreground">Efetivo</div>
                <div className="font-mono text-sm">
                  {((comissaoSimulada / valorSimulado) * 100).toFixed(3)}%
                </div>
              </div>
            )}
          </div>

          {valorSimulado > 0 && (
            <div className="mt-4 border-t border-border pt-3">
              <div className="text-xs font-medium text-muted-foreground">
                Detalhamento por fatia
              </div>
              <div className="mt-2 space-y-1">
                {ordenadas
                  .filter((f) => f.ativa)
                  .map((f) => {
                    const teto =
                      f.valor_max == null
                        ? valorSimulado
                        : Math.min(Number(f.valor_max), valorSimulado);
                    const fatia = teto - Number(f.valor_min);
                    if (fatia <= 0) return null;
                    const v = (fatia * Number(f.percentual)) / 100;
                    return (
                      <div key={f.id} className="flex items-center gap-2 text-xs">
                        <span className="font-mono text-muted-foreground">
                          {fmt(fatia)}
                        </span>
                        <span className="text-muted-foreground">×</span>
                        <span className="font-mono">{fmtPct(f.percentual)}%</span>
                        <span className="text-muted-foreground">=</span>
                        <span className="font-mono font-medium">{fmt(v)}</span>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </div>
      )}

      <FaixaDialog
        open={dlg}
        onOpenChange={setDlg}
        editing={editing}
        lojaId={lojaSel}
        onSaved={() => load(lojaSel)}
      />
    </AppLayout>
  );
}

function FaixaDialog({
  open,
  onOpenChange,
  editing,
  lojaId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: Faixa | null;
  lojaId: string;
  onSaved: () => void;
}) {
  const [vMin, setVMin] = useState("");
  const [vMax, setVMax] = useState("");
  const [semTeto, setSemTeto] = useState(false);
  const [pct, setPct] = useState("");
  const [ativa, setAtiva] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setVMin(
        Number(editing.valor_min).toLocaleString("pt-BR", { minimumFractionDigits: 2 }),
      );
      setSemTeto(editing.valor_max == null);
      setVMax(
        editing.valor_max == null
          ? ""
          : Number(editing.valor_max).toLocaleString("pt-BR", { minimumFractionDigits: 2 }),
      );
      setPct(fmtPct(editing.percentual));
      setAtiva(editing.ativa);
    } else {
      setVMin("");
      setVMax("");
      setSemTeto(false);
      setPct("");
      setAtiva(true);
    }
  }, [open, editing]);

  const submit = async () => {
    if (!lojaId) return toast.error("Selecione a loja");
    const min = parseMoney(vMin);
    const max = semTeto ? null : parseMoney(vMax);
    const p = parsePct(pct);
    if (p <= 0) return toast.error("Informe o percentual");
    if (max != null && max <= min)
      return toast.error("O valor final deve ser maior que o inicial");

    setSaving(true);
    const payload = {
      id_loja: lojaId,
      valor_min: min,
      valor_max: max,
      percentual: p,
      ativa,
    };
    const { error } = editing
      ? await supabase.from("comissao_faixas").update(payload).eq("id", editing.id)
      : await supabase.from("comissao_faixas").insert(payload);
    setSaving(false);

    if (error) return toast.error(error.message);
    toast.success(editing ? "Faixa atualizada" : "Faixa criada");
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar faixa" : "Nova faixa"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>De (R$)</Label>
              <Input
                className="font-mono"
                value={vMin}
                onChange={(e) => setVMin(maskMoney(e.target.value))}
                inputMode="numeric"
                placeholder="0,00"
              />
            </div>
            <div className="grid gap-2">
              <Label>Até (R$)</Label>
              <Input
                className="font-mono"
                value={semTeto ? "" : vMax}
                onChange={(e) => setVMax(maskMoney(e.target.value))}
                inputMode="numeric"
                placeholder={semTeto ? "sem teto" : "0,00"}
                disabled={semTeto}
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Switch checked={semTeto} onCheckedChange={setSemTeto} />
            Sem teto (última faixa)
          </label>

          <div className="grid gap-2">
            <Label>Percentual (%)</Label>
            <Input
              className="font-mono"
              value={pct}
              onChange={(e) => setPct(maskPct(e.target.value))}
              inputMode="decimal"
              placeholder="0,000"
            />
          </div>

          <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2">
            <div className="text-sm font-medium">Ativa</div>
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
