import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  DoorClosed,
  DoorOpen,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { EntityCombobox } from "@/components/entity-combobox";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { fmtBRL, maskMoney, parseMoney, friendlyDbError } from "@/lib/money";

export const Route = createFileRoute("/_authenticated/caixa")({
  head: () => ({
    meta: [
      { title: "Caixa · Connect 7" },
      {
        name: "description",
        content: "Abertura, sangria, suprimento e fechamento de caixa por loja.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CaixaPage,
});

type Caixa = {
  id: string;
  id_loja: string;
  data_abertura: string;
  data_fechamento: string | null;
  saldo_inicial: number;
  saldo_inicial_esperado: number;
  saldo_final_informado: number | null;
  saldo_final_calculado: number | null;
  divergencia_abertura: number;
  divergencia_fechamento: number | null;
  status: "aberto" | "fechado";
  observacao: string | null;
};

type Lanc = {
  id: string;
  tipo: "entrada" | "saida" | "sangria" | "suprimento";
  valor: number;
  descricao: string;
  forma_pagamento: string | null;
  created_at: string;
  id_categoria: string | null;
  id_cliente: string | null;
  id_fornecedor: string | null;
};

const SINAL: Record<Lanc["tipo"], number> = {
  entrada: 1,
  suprimento: 1,
  saida: -1,
  sangria: -1,
};

const LABEL: Record<Lanc["tipo"], string> = {
  entrada: "Entrada",
  saida: "Saída",
  sangria: "Sangria",
  suprimento: "Suprimento",
};

const fmtDateTime = (iso: string) => new Date(iso).toLocaleString("pt-BR");

function CaixaPage() {
  const { profile, selectedLojaId, lojas } = useAuth();
  const qc = useQueryClient();
  const isGlobal = profile?.role === "administrador" || profile?.role === "master";
  const podeOperar = profile?.role !== "master";
  const lojaId = isGlobal ? selectedLojaId : (profile?.id_loja ?? null);

  const [abrirDlg, setAbrirDlg] = useState(false);
  const [fecharDlg, setFecharDlg] = useState(false);
  const [lancDlg, setLancDlg] = useState(false);

  const caixaQ = useQuery({
    queryKey: ["caixa_aberto", lojaId],
    enabled: !!lojaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("caixas")
        .select("*")
        .eq("id_loja", lojaId!)
        .eq("status", "aberto")
        .maybeSingle();
      if (error) throw error;
      return (data as Caixa | null) ?? null;
    },
  });

  const caixa = caixaQ.data ?? null;

  const lancQ = useQuery({
    queryKey: ["caixa_lancamentos", caixa?.id],
    enabled: !!caixa?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("caixa_lancamentos")
        .select(
          "id, tipo, valor, descricao, forma_pagamento, created_at, id_categoria, id_cliente, id_fornecedor",
        )
        .eq("id_caixa", caixa!.id)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as Lanc[];
    },
  });

  const historicoQ = useQuery({
    queryKey: ["caixa_historico", lojaId],
    enabled: !!lojaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("caixas")
        .select("*")
        .eq("id_loja", lojaId!)
        .eq("status", "fechado")
        .order("data_fechamento", { ascending: false })
        .limit(15);
      if (error) throw error;
      return (data ?? []) as Caixa[];
    },
  });

  const lancamentos = lancQ.data ?? [];

  const resumo = useMemo(() => {
    let entradas = 0;
    let saidas = 0;
    for (const l of lancamentos) {
      if (SINAL[l.tipo] > 0) entradas += Number(l.valor);
      else saidas += Number(l.valor);
    }
    const saldo = Number(caixa?.saldo_inicial ?? 0) + entradas - saidas;
    return { entradas, saidas, saldo };
  }, [lancamentos, caixa]);

  const ultimoFechado = historicoQ.data?.[0] ?? null;
  const esperadoAbertura = Number(ultimoFechado?.saldo_final_informado ?? 0);

  const abrir = useMutation({
    mutationFn: async (p: { saldo: number; obs: string }) => {
      if (!lojaId) throw new Error("Selecione uma loja específica no topo");
      const { error } = await supabase.from("caixas").insert({
        id_loja: lojaId,
        aberto_por: profile?.id ?? null,
        saldo_inicial: p.saldo,
        saldo_inicial_esperado: esperadoAbertura,
        divergencia_abertura: Math.round((p.saldo - esperadoAbertura) * 100) / 100,
        observacao: p.obs || null,
      });
      if (error) throw new Error(friendlyDbError(error));
    },
    onSuccess: () => {
      toast.success("Caixa aberto");
      qc.invalidateQueries({ queryKey: ["caixa_aberto"] });
      setAbrirDlg(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const fechar = useMutation({
    mutationFn: async (p: { saldoFinal: number; obs: string }) => {
      if (!caixa) throw new Error("Nenhum caixa aberto");
      // Cada lançamento vira um título em contas a pagar / a receber.
      const pagar = lancamentos
        .filter((l) => l.tipo === "saida" || l.tipo === "sangria")
        .map((l) => ({
          id_loja: caixa.id_loja,
          descricao: `Caixa ${LABEL[l.tipo]} · ${l.descricao}`,
          valor: Number(l.valor),
          data_vencimento: new Date().toISOString().slice(0, 10),
          id_categoria: l.id_categoria,
          id_fornecedor: l.id_fornecedor,
          status: "pago" as const,
          criado_por: profile?.id ?? null,
        }));
      const receber = lancamentos
        .filter((l) => l.tipo === "entrada" || l.tipo === "suprimento")
        .map((l) => ({
          id_loja: caixa.id_loja,
          origem: "caixa" as const,
          descricao: `Caixa ${LABEL[l.tipo]} · ${l.descricao}`,
          valor: Number(l.valor),
          data_vencimento: new Date().toISOString().slice(0, 10),
          id_categoria: l.id_categoria,
          id_cliente: l.id_cliente,
          status: "recebido" as const,
          criado_por: profile?.id ?? null,
        }));

      if (pagar.length) {
        const { error } = await supabase.from("contas_pagar").insert(pagar);
        if (error) throw new Error(friendlyDbError(error));
      }
      if (receber.length) {
        const { error } = await supabase.from("contas_receber").insert(receber);
        if (error) throw new Error(friendlyDbError(error));
      }

      const { error } = await supabase
        .from("caixas")
        .update({
          status: "fechado",
          data_fechamento: new Date().toISOString(),
          fechado_por: profile?.id ?? null,
          saldo_final_informado: p.saldoFinal,
          saldo_final_calculado: resumo.saldo,
          divergencia_fechamento: Math.round((p.saldoFinal - resumo.saldo) * 100) / 100,
          observacao: p.obs || caixa.observacao,
        })
        .eq("id", caixa.id);
      if (error) throw new Error(friendlyDbError(error));
    },
    onSuccess: () => {
      toast.success("Caixa fechado e lançamentos gerados");
      qc.invalidateQueries({ queryKey: ["caixa_aberto"] });
      qc.invalidateQueries({ queryKey: ["caixa_historico"] });
      qc.invalidateQueries({ queryKey: ["contas_receber"] });
      qc.invalidateQueries({ queryKey: ["extrato_financeiro"] });
      setFecharDlg(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!lojaId) {
    return (
      <AppLayout>
        <h1 className="text-xl font-semibold">Caixa</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Selecione uma loja específica no seletor do topo para operar o caixa.
        </p>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Caixa</h1>
          <p className="text-sm text-muted-foreground">
            {lojas.find((l) => l.id === lojaId)?.nome ?? "Unidade"} — abertura, movimentos e
            fechamento.
          </p>
        </div>
        {podeOperar &&
          (caixa ? (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setLancDlg(true)}>
                <Plus className="h-4 w-4" />
                Novo lançamento
              </Button>
              <Button size="sm" onClick={() => setFecharDlg(true)}>
                <DoorClosed className="h-4 w-4" />
                Fechar caixa
              </Button>
            </div>
          ) : (
            <Button size="sm" onClick={() => setAbrirDlg(true)}>
              <DoorOpen className="h-4 w-4" />
              Abrir caixa
            </Button>
          ))}
      </div>

      {caixa ? (
        <>
          {Math.abs(Number(caixa.divergencia_abertura)) > 0.001 && (
            <div className="mt-5 flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
              <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-600" />
              <div className="text-sm">
                <div className="font-semibold text-amber-700 dark:text-amber-400">
                  Divergência na abertura: {fmtBRL(Number(caixa.divergencia_abertura))}
                </div>
                <p className="text-muted-foreground">
                  O saldo informado na abertura ({fmtBRL(Number(caixa.saldo_inicial))}) difere
                  do saldo esperado pelo último fechamento (
                  {fmtBRL(Number(caixa.saldo_inicial_esperado))}). Regularize essa diferença
                  antes do fechamento.
                </p>
              </div>
            </div>
          )}

          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
            <Card label="Saldo inicial" value={Number(caixa.saldo_inicial)} />
            <Card label="Entradas" value={resumo.entradas} tone="up" />
            <Card label="Saídas" value={resumo.saidas} tone="down" />
            <Card label="Saldo atual" value={resumo.saldo} tone={resumo.saldo >= 0 ? "up" : "down"} />
          </div>

          <p className="mt-3 text-xs text-muted-foreground">
            Aberto em {fmtDateTime(caixa.data_abertura)}
          </p>

          <div className="mt-4 rounded-lg border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-40">Horário</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Forma</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lancamentos.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                      Nenhum lançamento neste caixa.
                    </TableCell>
                  </TableRow>
                ) : (
                  lancamentos.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="font-mono text-xs">{fmtDateTime(l.created_at)}</TableCell>
                      <TableCell>{l.descricao}</TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1 text-xs">
                          {SINAL[l.tipo] > 0 ? (
                            <ArrowUpCircle className="h-3.5 w-3.5 text-emerald-500" />
                          ) : (
                            <ArrowDownCircle className="h-3.5 w-3.5 text-rose-500" />
                          )}
                          {LABEL[l.tipo]}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {l.forma_pagamento ?? "—"}
                      </TableCell>
                      <TableCell
                        className={`text-right font-mono ${
                          SINAL[l.tipo] > 0
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-rose-600 dark:text-rose-400"
                        }`}
                      >
                        {SINAL[l.tipo] > 0 ? "" : "− "}
                        {fmtBRL(Number(l.valor))}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </>
      ) : (
        <div className="mt-6 rounded-lg border border-dashed border-border bg-card p-10 text-center">
          <DoorOpen className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">Nenhum caixa aberto nesta loja</p>
          <p className="text-xs text-muted-foreground">
            Saldo esperado para a abertura: {fmtBRL(esperadoAbertura)}
          </p>
        </div>
      )}

      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        Últimos fechamentos
      </h2>
      <div className="mt-3 rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Abertura</TableHead>
              <TableHead>Fechamento</TableHead>
              <TableHead className="text-right">Saldo inicial</TableHead>
              <TableHead className="text-right">Calculado</TableHead>
              <TableHead className="text-right">Informado</TableHead>
              <TableHead className="text-right">Divergência</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(historicoQ.data ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-6 text-center text-sm text-muted-foreground">
                  Sem fechamentos registrados.
                </TableCell>
              </TableRow>
            ) : (
              (historicoQ.data ?? []).map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono text-xs">{fmtDateTime(c.data_abertura)}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {c.data_fechamento ? fmtDateTime(c.data_fechamento) : "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {fmtBRL(Number(c.saldo_inicial))}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {fmtBRL(Number(c.saldo_final_calculado ?? 0))}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {fmtBRL(Number(c.saldo_final_informado ?? 0))}
                  </TableCell>
                  <TableCell
                    className={`text-right font-mono text-xs ${
                      Math.abs(Number(c.divergencia_fechamento ?? 0)) > 0.001
                        ? "text-rose-600 dark:text-rose-400"
                        : "text-muted-foreground"
                    }`}
                  >
                    {fmtBRL(Number(c.divergencia_fechamento ?? 0))}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {abrirDlg && (
        <AbrirDialog
          esperado={esperadoAbertura}
          onClose={() => setAbrirDlg(false)}
          onConfirm={(saldo, obs) => abrir.mutate({ saldo, obs })}
          saving={abrir.isPending}
        />
      )}

      {fecharDlg && caixa && (
        <FecharDialog
          calculado={resumo.saldo}
          onClose={() => setFecharDlg(false)}
          onConfirm={(saldoFinal, obs) => fechar.mutate({ saldoFinal, obs })}
          saving={fechar.isPending}
        />
      )}

      {lancDlg && caixa && (
        <LancamentoDialog
          idCaixa={caixa.id}
          idLoja={caixa.id_loja}
          onClose={() => setLancDlg(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["caixa_lancamentos"] });
            setLancDlg(false);
          }}
        />
      )}
    </AppLayout>
  );
}

function Card({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "up" | "down" | "neutral";
}) {
  const cls =
    tone === "up"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "down"
        ? "text-rose-600 dark:text-rose-400"
        : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-2 font-mono text-xl font-semibold ${cls}`}>{fmtBRL(value)}</div>
    </div>
  );
}

function AbrirDialog({
  esperado,
  onClose,
  onConfirm,
  saving,
}: {
  esperado: number;
  onClose: () => void;
  onConfirm: (saldo: number, obs: string) => void;
  saving: boolean;
}) {
  const [saldo, setSaldo] = useState("");
  const [obs, setObs] = useState("");
  const diff = parseMoney(saldo) - esperado;

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Abrir caixa</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
            Saldo esperado (último fechamento):{" "}
            <span className="font-mono font-semibold">{fmtBRL(esperado)}</span>
          </div>
          <div className="grid gap-2">
            <Label>Saldo informado (R$)</Label>
            <Input
              inputMode="decimal"
              className="font-mono"
              value={saldo}
              onChange={(e) => setSaldo(maskMoney(e.target.value))}
              placeholder="0,00"
              autoFocus
            />
          </div>
          {saldo && Math.abs(diff) > 0.001 && (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <span>
                Divergência de <span className="font-mono font-semibold">{fmtBRL(diff)}</span>{" "}
                em relação ao saldo esperado. O caixa pode ser aberto, mas essa diferença
                precisa ser resolvida.
              </span>
            </div>
          )}
          <div className="grid gap-2">
            <Label>Observação</Label>
            <Textarea rows={2} value={obs} onChange={(e) => setObs(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => onConfirm(parseMoney(saldo), obs)} disabled={saving}>
            {saving ? "Abrindo…" : "Abrir caixa"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FecharDialog({
  calculado,
  onClose,
  onConfirm,
  saving,
}: {
  calculado: number;
  onClose: () => void;
  onConfirm: (saldoFinal: number, obs: string) => void;
  saving: boolean;
}) {
  const [saldo, setSaldo] = useState("");
  const [obs, setObs] = useState("");
  const diff = parseMoney(saldo) - calculado;

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Fechar caixa</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
            Saldo calculado pelo sistema:{" "}
            <span className="font-mono font-semibold">{fmtBRL(calculado)}</span>
          </div>
          <div className="grid gap-2">
            <Label>Saldo conferido em caixa (R$)</Label>
            <Input
              inputMode="decimal"
              className="font-mono"
              value={saldo}
              onChange={(e) => setSaldo(maskMoney(e.target.value))}
              placeholder="0,00"
              autoFocus
            />
          </div>
          {saldo && Math.abs(diff) > 0.001 && (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <span>
                Divergência de <span className="font-mono font-semibold">{fmtBRL(diff)}</span>.
                Registre a justificativa na observação.
              </span>
            </div>
          )}
          <div className="grid gap-2">
            <Label>Observação</Label>
            <Textarea rows={2} value={obs} onChange={(e) => setObs(e.target.value)} />
          </div>
          <p className="text-xs text-muted-foreground">
            Ao fechar, os lançamentos deste caixa geram títulos em Contas a Pagar e Contas a
            Receber.
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => onConfirm(parseMoney(saldo), obs)} disabled={saving}>
            {saving ? "Fechando…" : "Fechar caixa"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LancamentoDialog({
  idCaixa,
  idLoja,
  onClose,
  onSaved,
}: {
  idCaixa: string;
  idLoja: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { profile } = useAuth();
  const [tipo, setTipo] = useState<Lanc["tipo"]>("entrada");
  const [valor, setValor] = useState("");
  const [descricao, setDescricao] = useState("");
  const [forma, setForma] = useState("dinheiro");
  const [idCategoria, setIdCategoria] = useState<string | null>(null);
  const [idPessoa, setIdPessoa] = useState<string | null>(null);

  const entrada = tipo === "entrada" || tipo === "suprimento";

  const pessoasQ = useQuery({
    queryKey: ["caixa_pessoas", entrada],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(entrada ? "clientes" : "fornecedores")
        .select("id, nome")
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const catsQ = useQuery({
    queryKey: ["caixa_cats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dre_categorias")
        .select("id, nome, dre_grupos(nome, natureza)")
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return (data ?? []) as unknown as {
        id: string;
        nome: string;
        dre_grupos: { nome: string; natureza: string } | null;
      }[];
    },
  });

  const salvar = useMutation({
    mutationFn: async () => {
      const v = parseMoney(valor);
      if (!(v > 0)) throw new Error("Valor deve ser maior que zero");
      if (!descricao.trim()) throw new Error("Informe a descrição");
      const { error } = await supabase.from("caixa_lancamentos").insert({
        id_caixa: idCaixa,
        id_loja: idLoja,
        tipo,
        valor: v,
        descricao: descricao.trim(),
        forma_pagamento: forma,
        id_categoria: idCategoria,
        id_cliente: entrada ? idPessoa : null,
        id_fornecedor: entrada ? null : idPessoa,
        criado_por: profile?.id ?? null,
      });
      if (error) throw new Error(friendlyDbError(error));
    },
    onSuccess: () => {
      toast.success("Lançamento registrado");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo lançamento de caixa</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Tipo</Label>
              <Select value={tipo} onValueChange={(v) => { setTipo(v as Lanc["tipo"]); setIdPessoa(null); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="entrada">Entrada</SelectItem>
                  <SelectItem value="saida">Saída</SelectItem>
                  <SelectItem value="sangria">Sangria</SelectItem>
                  <SelectItem value="suprimento">Suprimento</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Valor (R$)</Label>
              <Input
                inputMode="decimal"
                className="font-mono"
                value={valor}
                onChange={(e) => setValor(maskMoney(e.target.value))}
                placeholder="0,00"
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Descrição</Label>
            <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>Forma de pagamento</Label>
            <Select value={forma} onValueChange={setForma}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="dinheiro">Dinheiro</SelectItem>
                <SelectItem value="pix">PIX</SelectItem>
                <SelectItem value="cartao">Cartão</SelectItem>
                <SelectItem value="outros">Outros</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>{entrada ? "Cliente" : "Fornecedor"}</Label>
            <EntityCombobox
              options={(pessoasQ.data ?? []).map((p) => ({ value: p.id, label: p.nome }))}
              value={idPessoa}
              onChange={setIdPessoa}
              placeholder="Opcional — digite para filtrar"
            />
          </div>
          <div className="grid gap-2">
            <Label>Categoria (DRE)</Label>
            <EntityCombobox
              options={(catsQ.data ?? [])
                .filter((c) =>
                  entrada
                    ? c.dre_grupos?.natureza === "receita"
                    : c.dre_grupos?.natureza === "despesa",
                )
                .map((c) => ({ value: c.id, label: c.nome, hint: c.dre_grupos?.nome }))}
              value={idCategoria}
              onChange={setIdCategoria}
              placeholder="Opcional"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => salvar.mutate()} disabled={salvar.isPending}>
            {salvar.isPending ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
