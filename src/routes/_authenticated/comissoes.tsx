import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import {
  fmtBRL,
  fmtPct,
  friendlyDbError,
  maskMoney,
  maskPct,
  parseMoney,
  parsePct,
  toMoneyInput,
} from "@/lib/money";

export const Route = createFileRoute("/_authenticated/comissoes")({
  head: () => ({
    meta: [
      { title: "Cadastro de Comissões · Connect 7" },
      {
        name: "description",
        content: "Faixas progressivas de comissão por loja e por vendedor.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ComissoesPage,
});

type Regra = {
  id: string;
  id_loja: string;
  id_vendedor: string | null;
  valor_min: number;
  valor_max: number | null;
  percentual: number;
  ativa: boolean;
};

const LOJA_TODOS = "__loja__";

/** Cálculo progressivo, espelhando a função calcular_comissao do banco. */
function calcularComissao(regras: Regra[], total: number): number {
  let com = 0;
  for (const f of regras
    .filter((x) => x.ativa)
    .sort((a, b) => Number(a.valor_min) - Number(b.valor_min))) {
    const teto = f.valor_max == null ? total : Math.min(Number(f.valor_max), total);
    const fatia = teto - Number(f.valor_min);
    if (fatia > 0) com += (fatia * Number(f.percentual)) / 100;
  }
  return Math.round(com * 100) / 100;
}

function ComissoesPage() {
  const { profile, lojas } = useAuth();
  const qc = useQueryClient();
  const isAdmin = profile?.role === "administrador";

  const [lojaSel, setLojaSel] = useState<string>(profile?.id_loja ?? "");
  const [vendedorSel, setVendedorSel] = useState<string>(LOJA_TODOS);
  const [dlg, setDlg] = useState(false);
  const [editing, setEditing] = useState<Regra | null>(null);
  const [simulacao, setSimulacao] = useState("");

  const vendedoresQ = useQuery({
    queryKey: ["vendedores_loja", lojaSel],
    enabled: !!lojaSel,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("usuarios_perfis")
        .select("id, nome")
        .eq("id_loja", lojaSel)
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const regrasQ = useQuery({
    queryKey: ["comissao_regras", lojaSel, vendedorSel],
    enabled: !!lojaSel,
    queryFn: async () => {
      let q = supabase
        .from("comissao_regras")
        .select("id, id_loja, id_vendedor, valor_min, valor_max, percentual, ativa")
        .eq("id_loja", lojaSel)
        .order("valor_min");
      q = vendedorSel === LOJA_TODOS ? q.is("id_vendedor", null) : q.eq("id_vendedor", vendedorSel);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Regra[];
    },
  });

  const regras = regrasQ.data ?? [];

  const sobreposicao = useMemo(() => {
    const ordenadas = [...regras].sort((a, b) => Number(a.valor_min) - Number(b.valor_min));
    for (let i = 1; i < ordenadas.length; i++) {
      const ant = ordenadas[i - 1];
      if (ant.valor_max == null) return true;
      if (Number(ordenadas[i].valor_min) < Number(ant.valor_max)) return true;
    }
    return false;
  }, [regras]);

  const remover = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("comissao_regras").delete().eq("id", id);
      if (error) throw new Error(friendlyDbError(error));
    },
    onSuccess: () => {
      toast.success("Faixa removida.");
      qc.invalidateQueries({ queryKey: ["comissao_regras"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const simulado = calcularComissao(regras, parseMoney(simulacao));

  return (
    <AppLayout>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Cadastro de Comissões</h1>
          <p className="text-sm text-muted-foreground">
            Faixas progressivas por loja. Deixe em “Regra da loja” para valer para todos, ou
            selecione um vendedor para uma regra específica.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setDlg(true);
          }}
          disabled={!lojaSel || !isAdmin}
        >
          <Plus className="h-4 w-4" />
          Nova faixa
        </Button>
      </div>

      <div className="mt-5 grid gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-3">
        <div className="grid gap-1.5">
          <Label className="text-xs">Loja</Label>
          <Select
            value={lojaSel}
            onValueChange={(v) => {
              setLojaSel(v);
              setVendedorSel(LOJA_TODOS);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione a loja" />
            </SelectTrigger>
            <SelectContent>
              {lojas.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.nome_fantasia}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs">Vendedor</Label>
          <Select value={vendedorSel} onValueChange={setVendedorSel} disabled={!lojaSel}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={LOJA_TODOS}>Regra da loja (todos)</SelectItem>
              {(vendedoresQ.data ?? []).map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs">Simular venda</Label>
          <Input
            inputMode="numeric"
            placeholder="0,00"
            value={simulacao}
            onChange={(e) => setSimulacao(maskMoney(e.target.value))}
          />
        </div>
      </div>

      {simulacao && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
          <Calculator className="h-4 w-4 text-primary" />
          Sobre {fmtBRL(parseMoney(simulacao))} a comissão é{" "}
          <span className="font-semibold text-primary">{fmtBRL(simulado)}</span>
        </div>
      )}

      {sobreposicao && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <AlertTriangle className="h-4 w-4" />
          Há faixas sobrepostas ou sem teto no meio da tabela — revise os limites.
        </div>
      )}

      <div className="mt-4 rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>De</TableHead>
              <TableHead>Até</TableHead>
              <TableHead className="text-right">Percentual</TableHead>
              <TableHead>Ativa</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {!lojaSel ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                  Selecione uma loja.
                </TableCell>
              </TableRow>
            ) : regrasQ.isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                  Carregando…
                </TableCell>
              </TableRow>
            ) : regras.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                  Nenhuma faixa cadastrada para esta seleção.
                </TableCell>
              </TableRow>
            ) : (
              regras.map((f) => (
                <TableRow key={f.id}>
                  <TableCell className="font-mono">{fmtBRL(f.valor_min)}</TableCell>
                  <TableCell className="font-mono">
                    {f.valor_max == null ? "Sem limite" : fmtBRL(f.valor_max)}
                  </TableCell>
                  <TableCell className="text-right font-mono">{fmtPct(f.percentual)}%</TableCell>
                  <TableCell>{f.ativa ? "Sim" : "Não"}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={!isAdmin}
                      onClick={() => {
                        setEditing(f);
                        setDlg(true);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={!isAdmin}
                      onClick={() => remover.mutate(f.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <FaixaDialog
        open={dlg}
        onOpenChange={setDlg}
        editing={editing}
        idLoja={lojaSel}
        idVendedor={vendedorSel === LOJA_TODOS ? null : vendedorSel}
      />
    </AppLayout>
  );
}

function FaixaDialog({
  open,
  onOpenChange,
  editing,
  idLoja,
  idVendedor,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: Regra | null;
  idLoja: string;
  idVendedor: string | null;
}) {
  const qc = useQueryClient();
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const [semTeto, setSemTeto] = useState(false);
  const [pct, setPct] = useState("");
  const [ativa, setAtiva] = useState(true);
  const [key, setKey] = useState<string>("");

  const currentKey = `${open}-${editing?.id ?? "novo"}`;
  if (currentKey !== key) {
    setKey(currentKey);
    setMin(editing ? toMoneyInput(editing.valor_min) : "");
    setMax(editing?.valor_max != null ? toMoneyInput(editing.valor_max) : "");
    setSemTeto(editing ? editing.valor_max == null : false);
    setPct(editing ? fmtPct(editing.percentual) : "");
    setAtiva(editing ? editing.ativa : true);
  }

  const salvar = useMutation({
    mutationFn: async () => {
      if (!idLoja) throw new Error("Selecione a loja.");
      const vMin = parseMoney(min);
      const vMax = semTeto ? null : parseMoney(max);
      const vPct = parsePct(pct);
      if (vPct <= 0 || vPct > 100) throw new Error("Informe um percentual entre 0 e 100.");
      if (vMax != null && vMax <= vMin)
        throw new Error("O valor final deve ser maior que o inicial.");

      const payload = {
        id_loja: idLoja,
        id_vendedor: idVendedor,
        valor_min: vMin,
        valor_max: vMax,
        percentual: vPct,
        ativa,
      };
      const { error } = editing
        ? await supabase.from("comissao_regras").update(payload).eq("id", editing.id)
        : await supabase.from("comissao_regras").insert(payload);
      if (error) throw new Error(friendlyDbError(error));
    },
    onSuccess: () => {
      toast.success(editing ? "Faixa atualizada." : "Faixa cadastrada.");
      qc.invalidateQueries({ queryKey: ["comissao_regras"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Editar faixa" : "Nova faixa"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label className="text-xs">De (R$)</Label>
              <Input
                inputMode="numeric"
                value={min}
                onChange={(e) => setMin(maskMoney(e.target.value))}
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Até (R$)</Label>
              <Input
                inputMode="numeric"
                value={semTeto ? "" : max}
                disabled={semTeto}
                onChange={(e) => setMax(maskMoney(e.target.value))}
              />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
            <Label className="text-sm">Sem limite superior</Label>
            <Switch checked={semTeto} onCheckedChange={setSemTeto} />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Percentual (%)</Label>
            <Input
              inputMode="numeric"
              value={pct}
              onChange={(e) => setPct(maskPct(e.target.value))}
            />
          </div>
          <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
            <Label className="text-sm">Faixa ativa</Label>
            <Switch checked={ativa} onCheckedChange={setAtiva} />
          </div>
          <p className="text-xs text-muted-foreground">
            {idVendedor
              ? "Esta faixa vale apenas para o vendedor selecionado."
              : "Esta faixa vale para todos os vendedores da loja."}
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => salvar.mutate()} disabled={salvar.isPending}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
