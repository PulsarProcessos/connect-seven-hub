import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  Banknote,
  DoorClosed,
  DoorOpen,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
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
import { ComprovantesPanel } from "@/components/comprovantes-panel";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { fmtBRL, maskMoney, parseMoney, toMoneyInput, friendlyDbError } from "@/lib/money";

export const Route = createFileRoute("/_authenticated/caixa")({
  head: () => ({
    meta: [
      { title: "Caixa · Connect 7" },
      {
        name: "description",
        content:
          "Abertura por turno, sangria, suprimento, depósito na lotérica e fechamento de caixa por loja.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CaixaPage,
});

type Caixa = {
  id: string;
  id_loja: string;
  turno: string;
  data_abertura: string;
  data_fechamento: string | null;
  saldo_inicial: number;
  saldo_inicial_esperado: number;
  saldo_final_informado: number | null;
  saldo_final_calculado: number | null;
  divergencia_abertura: number;
  divergencia_fechamento: number | null;
  total_entradas: number;
  total_saidas: number;
  total_sangrias: number;
  total_suprimentos: number;
  total_depositado: number;
  dinheiro_apurado: number | null;
  diferenca_caixa: number | null;
  status: "aberto" | "fechado";
  observacao: string | null;
  motivo_reabertura: string | null;
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
  id_conta_bancaria: string | null;
};

type Deposito = {
  id: string;
  numero_comprovante: string;
  valor: number;
  data_deposito: string;
  id_conta_bancaria: string | null;
  conciliado: boolean;
  observacao: string | null;
};

const LABEL: Record<Lanc["tipo"], string> = {
  entrada: "Entrada",
  saida: "Saída",
  sangria: "Sangria",
  suprimento: "Suprimento",
};

const SINAL: Record<Lanc["tipo"], number> = {
  entrada: 1,
  suprimento: 1,
  saida: -1,
  sangria: -1,
};

const TURNOS = [
  { value: "unico", label: "Único" },
  { value: "manha", label: "Manhã" },
  { value: "tarde", label: "Tarde" },
  { value: "noite", label: "Noite" },
];

/** Formas que exigem conta bancária de destino/origem. */
export const FORMAS_BANCARIAS = ["pix", "transferencia", "deposito_bancario"];

const fmtDateTime = (iso: string) => new Date(iso).toLocaleString("pt-BR");
const fmtDate = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("pt-BR");
const hoje = () => new Date().toISOString().slice(0, 10);

function CaixaPage() {
  const { profile, selectedLojaId, lojas } = useAuth();
  const qc = useQueryClient();
  const isGlobal = profile?.role === "administrador" || profile?.role === "master";
  const podeOperar = profile?.role !== "master";
  const podeGerir = profile?.role === "administrador" || profile?.role === "gerente";
  const lojaId = isGlobal ? selectedLojaId : (profile?.id_loja ?? null);

  const [abrirDlg, setAbrirDlg] = useState(false);
  const [fecharDlg, setFecharDlg] = useState(false);
  const [lancDlg, setLancDlg] = useState<{ lanc: Lanc | null } | null>(null);
  const [depDlg, setDepDlg] = useState<{ dep: Deposito | null } | null>(null);
  const [reabrirDlg, setReabrirDlg] = useState<Caixa | null>(null);

  const caixaQ = useQuery({
    queryKey: ["caixa_aberto", lojaId],
    enabled: !!lojaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("caixas")
        .select("*")
        .eq("id_loja", lojaId!)
        .eq("status", "aberto")
        .order("data_abertura", { ascending: false })
        .limit(1)
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
          "id, tipo, valor, descricao, forma_pagamento, created_at, id_categoria, id_cliente, id_fornecedor, id_conta_bancaria",
        )
        .eq("id_caixa", caixa!.id)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as Lanc[];
    },
  });

  const depQ = useQuery({
    queryKey: ["caixa_depositos", caixa?.id],
    enabled: !!caixa?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("caixa_depositos")
        .select("id, numero_comprovante, valor, data_deposito, id_conta_bancaria, conciliado, observacao")
        .eq("id_caixa", caixa!.id)
        .order("data_deposito", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Deposito[];
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

  const contasQ = useQuery({
    queryKey: ["caixa_contas", lojaId],
    enabled: !!lojaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contas_bancarias")
        .select("id, banco, agencia, conta")
        .eq("id_loja", lojaId!)
        .eq("ativa", true)
        .order("banco");
      if (error) throw error;
      return data ?? [];
    },
  });

  const lancamentos = lancQ.data ?? [];
  const depositos = depQ.data ?? [];

  const resumo = useMemo(() => {
    let entradas = 0;
    let saidas = 0;
    let sangrias = 0;
    let suprimentos = 0;
    for (const l of lancamentos) {
      const v = Number(l.valor);
      if (l.tipo === "entrada") entradas += v;
      else if (l.tipo === "saida") saidas += v;
      else if (l.tipo === "sangria") sangrias += v;
      else suprimentos += v;
    }
    const depositado = depositos.reduce((s, d) => s + Number(d.valor), 0);
    const saldo =
      Number(caixa?.saldo_inicial ?? 0) + entradas + suprimentos - saidas - sangrias - depositado;
    return { entradas, saidas, sangrias, suprimentos, depositado, saldo };
  }, [lancamentos, depositos, caixa]);

  const ultimoFechado = historicoQ.data?.[0] ?? null;
  const esperadoAbertura = Number(ultimoFechado?.saldo_final_informado ?? 0);

  const invalidarTudo = () => {
    qc.invalidateQueries({ queryKey: ["caixa_aberto"] });
    qc.invalidateQueries({ queryKey: ["caixa_historico"] });
    qc.invalidateQueries({ queryKey: ["caixa_lancamentos"] });
    qc.invalidateQueries({ queryKey: ["caixa_depositos"] });
  };

  const abrir = useMutation({
    mutationFn: async (p: { saldo: number; obs: string; turno: string }) => {
      if (!lojaId) throw new Error("Selecione uma loja específica no topo");
      const { error } = await supabase.from("caixas").insert({
        id_loja: lojaId,
        aberto_por: profile?.id ?? null,
        turno: p.turno,
        saldo_inicial: p.saldo,
        saldo_inicial_esperado: esperadoAbertura,
        divergencia_abertura: Math.round((p.saldo - esperadoAbertura) * 100) / 100,
        observacao: p.obs || null,
      });
      if (error) throw new Error(friendlyDbError(error));
    },
    onSuccess: () => {
      toast.success("Caixa aberto");
      invalidarTudo();
      setAbrirDlg(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const fechar = useMutation({
    mutationFn: async (p: { apurado: number; obs: string }) => {
      if (!caixa) throw new Error("Nenhum caixa aberto");
      // Cada lançamento vira um título em contas a pagar / a receber.
      const pagar = lancamentos
        .filter((l) => l.tipo === "saida" || l.tipo === "sangria")
        .map((l) => ({
          id_loja: caixa.id_loja,
          descricao: `Caixa ${LABEL[l.tipo]} · ${l.descricao}`,
          valor: Number(l.valor),
          data_vencimento: hoje(),
          data_competencia: hoje(),
          id_categoria: l.id_categoria,
          id_fornecedor: l.id_fornecedor,
          id_conta_bancaria: l.id_conta_bancaria,
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
          data_vencimento: hoje(),
          data_competencia: hoje(),
          id_categoria: l.id_categoria,
          id_cliente: l.id_cliente,
          id_conta_bancaria: l.id_conta_bancaria,
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
          dinheiro_apurado: p.apurado,
          saldo_final_informado: p.apurado,
          saldo_final_calculado: resumo.saldo,
          diferenca_caixa: Math.round((p.apurado - resumo.saldo) * 100) / 100,
          divergencia_fechamento: Math.round((p.apurado - resumo.saldo) * 100) / 100,
          observacao: p.obs || caixa.observacao,
        })
        .eq("id", caixa.id);
      if (error) throw new Error(friendlyDbError(error));
    },
    onSuccess: () => {
      toast.success("Caixa fechado e lançamentos gerados");
      invalidarTudo();
      qc.invalidateQueries({ queryKey: ["contas_receber"] });
      qc.invalidateQueries({ queryKey: ["extrato_financeiro"] });
      setFecharDlg(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reabrir = useMutation({
    mutationFn: async (p: { id: string; motivo: string }) => {
      const { error } = await supabase
        .from("caixas")
        .update({ status: "aberto", motivo_reabertura: p.motivo || null })
        .eq("id", p.id);
      if (error) throw new Error(friendlyDbError(error));
    },
    onSuccess: () => {
      toast.success("Caixa reaberto");
      invalidarTudo();
      setReabrirDlg(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const excluirFechamento = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("caixas").delete().eq("id", id);
      if (error) throw new Error(friendlyDbError(error));
    },
    onSuccess: () => {
      toast.success("Fechamento excluído");
      invalidarTudo();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const excluirLanc = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("caixa_lancamentos").delete().eq("id", id);
      if (error) throw new Error(friendlyDbError(error));
    },
    onSuccess: () => {
      toast.success("Lançamento excluído");
      invalidarTudo();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const excluirDep = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("caixa_depositos").delete().eq("id", id);
      if (error) throw new Error(friendlyDbError(error));
    },
    onSuccess: () => {
      toast.success("Depósito excluído");
      invalidarTudo();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const nomeConta = (id: string | null) => {
    const c = (contasQ.data ?? []).find((x) => x.id === id);
    return c ? `${c.banco} ${c.agencia}/${c.conta}` : "—";
  };

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
            {lojas.find((l) => l.id === lojaId)?.nome ?? "Unidade"} — abertura por turno,
            movimentos, depósitos e fechamento.
          </p>
        </div>
        {podeOperar &&
          (caixa ? (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => setLancDlg({ lanc: null })}>
                <Plus className="h-4 w-4" />
                Novo lançamento
              </Button>
              <Button size="sm" variant="outline" onClick={() => setDepDlg({ dep: null })}>
                <Banknote className="h-4 w-4" />
                Depósito lotérica
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

          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Card label="Saldo inicial" value={Number(caixa.saldo_inicial)} />
            <Card label="Entradas" value={resumo.entradas} tone="up" />
            <Card label="Suprimentos" value={resumo.suprimentos} tone="up" />
            <Card label="Saídas" value={resumo.saidas} tone="down" />
            <Card label="Sangrias" value={resumo.sangrias} tone="down" />
            <Card label="Depositado" value={resumo.depositado} tone="down" />
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            <Card
              label="Dinheiro em caixa (calculado)"
              value={resumo.saldo}
              tone={resumo.saldo >= 0 ? "up" : "down"}
            />
            <Card
              label="Diferença de caixa (apurado − calculado)"
              value={Number(caixa.dinheiro_apurado ?? resumo.saldo) - resumo.saldo}
              tone="neutral"
            />
          </div>

          <p className="mt-3 text-xs text-muted-foreground">
            Turno {TURNOS.find((t) => t.value === caixa.turno)?.label ?? caixa.turno} · aberto em{" "}
            {fmtDateTime(caixa.data_abertura)}
            {caixa.motivo_reabertura ? ` · reaberto: ${caixa.motivo_reabertura}` : ""}
          </p>

          <h2 className="mt-6 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Lançamentos
          </h2>
          <div className="mt-3 rounded-lg border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-40">Horário</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Forma</TableHead>
                  <TableHead>Conta</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {lancamentos.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
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
                      <TableCell className="text-xs text-muted-foreground">
                        {l.id_conta_bancaria ? nomeConta(l.id_conta_bancaria) : "—"}
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
                      <TableCell className="text-right">
                        {podeOperar && (
                          <div className="flex justify-end gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() => setLancDlg({ lanc: l })}
                              title="Editar"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            {podeGerir && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-destructive"
                                onClick={() => {
                                  if (confirm("Excluir este lançamento?"))
                                    excluirLanc.mutate(l.id);
                                }}
                                title="Excluir"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <h2 className="mt-6 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Depósitos na lotérica
          </h2>
          <div className="mt-3 rounded-lg border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Nº comprovante</TableHead>
                  <TableHead>Conta de destino</TableHead>
                  <TableHead>Conciliação</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {depositos.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                      Nenhum depósito registrado neste caixa.
                    </TableCell>
                  </TableRow>
                ) : (
                  depositos.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="font-mono text-xs">{fmtDate(d.data_deposito)}</TableCell>
                      <TableCell className="font-mono text-xs">{d.numero_comprovante}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {nomeConta(d.id_conta_bancaria)}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] ${
                            d.conciliado
                              ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                              : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                          }`}
                        >
                          {d.conciliado ? "Conciliado" : "A conciliar"}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-mono">{fmtBRL(Number(d.valor))}</TableCell>
                      <TableCell className="text-right">
                        {podeOperar && (
                          <div className="flex justify-end gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() => setDepDlg({ dep: d })}
                              title="Editar / comprovante"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            {podeGerir && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-destructive"
                                onClick={() => {
                                  if (confirm("Excluir este depósito?")) excluirDep.mutate(d.id);
                                }}
                                title="Excluir"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        )}
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
      <div className="mt-3 overflow-x-auto rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Abertura</TableHead>
              <TableHead>Turno</TableHead>
              <TableHead>Fechamento</TableHead>
              <TableHead className="text-right">Saldo inicial</TableHead>
              <TableHead className="text-right">Sangrias</TableHead>
              <TableHead className="text-right">Suprimentos</TableHead>
              <TableHead className="text-right">Depositado</TableHead>
              <TableHead className="text-right">Apurado</TableHead>
              <TableHead className="text-right">Diferença</TableHead>
              {podeGerir && <TableHead className="w-24" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {(historicoQ.data ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={podeGerir ? 10 : 9} className="py-6 text-center text-sm text-muted-foreground">
                  Sem fechamentos registrados.
                </TableCell>
              </TableRow>
            ) : (
              (historicoQ.data ?? []).map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono text-xs">{fmtDateTime(c.data_abertura)}</TableCell>
                  <TableCell className="text-xs">
                    {TURNOS.find((t) => t.value === c.turno)?.label ?? c.turno}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {c.data_fechamento ? fmtDateTime(c.data_fechamento) : "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {fmtBRL(Number(c.saldo_inicial))}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {fmtBRL(Number(c.total_sangrias ?? 0))}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {fmtBRL(Number(c.total_suprimentos ?? 0))}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {fmtBRL(Number(c.total_depositado ?? 0))}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {fmtBRL(Number(c.dinheiro_apurado ?? c.saldo_final_informado ?? 0))}
                  </TableCell>
                  <TableCell
                    className={`text-right font-mono text-xs ${
                      Math.abs(Number(c.diferenca_caixa ?? c.divergencia_fechamento ?? 0)) > 0.001
                        ? "text-rose-600 dark:text-rose-400"
                        : "text-muted-foreground"
                    }`}
                  >
                    {fmtBRL(Number(c.diferenca_caixa ?? c.divergencia_fechamento ?? 0))}
                  </TableCell>
                  {podeGerir && (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          title="Reabrir caixa"
                          onClick={() => setReabrirDlg(c)}
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive"
                          title="Excluir fechamento"
                          onClick={() => {
                            if (confirm("Excluir este fechamento e todos os seus lançamentos?"))
                              excluirFechamento.mutate(c.id);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  )}
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
          onConfirm={(saldo, obs, turno) => abrir.mutate({ saldo, obs, turno })}
          saving={abrir.isPending}
        />
      )}

      {fecharDlg && caixa && (
        <FecharDialog
          caixa={caixa}
          calculado={resumo.saldo}
          onClose={() => setFecharDlg(false)}
          onConfirm={(apurado, obs) => fechar.mutate({ apurado, obs })}
          saving={fechar.isPending}
        />
      )}

      {lancDlg && caixa && (
        <LancamentoDialog
          idCaixa={caixa.id}
          idLoja={caixa.id_loja}
          contas={contasQ.data ?? []}
          lanc={lancDlg.lanc}
          onClose={() => setLancDlg(null)}
          onSaved={() => {
            invalidarTudo();
            setLancDlg(null);
          }}
        />
      )}

      {depDlg && caixa && (
        <DepositoDialog
          idCaixa={caixa.id}
          idLoja={caixa.id_loja}
          contas={contasQ.data ?? []}
          dep={depDlg.dep}
          onClose={() => setDepDlg(null)}
          onSaved={() => {
            invalidarTudo();
          }}
        />
      )}

      {reabrirDlg && (
        <ReabrirDialog
          onClose={() => setReabrirDlg(null)}
          saving={reabrir.isPending}
          onConfirm={(motivo) => reabrir.mutate({ id: reabrirDlg.id, motivo })}
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
  onConfirm: (saldo: number, obs: string, turno: string) => void;
  saving: boolean;
}) {
  const [saldo, setSaldo] = useState("");
  const [obs, setObs] = useState("");
  const [turno, setTurno] = useState("unico");
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
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Turno</Label>
              <Select value={turno} onValueChange={setTurno}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TURNOS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
          <Button onClick={() => onConfirm(parseMoney(saldo), obs, turno)} disabled={saving}>
            {saving ? "Abrindo…" : "Abrir caixa"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FecharDialog({
  caixa,
  calculado,
  onClose,
  onConfirm,
  saving,
}: {
  caixa: Caixa;
  calculado: number;
  onClose: () => void;
  onConfirm: (apurado: number, obs: string) => void;
  saving: boolean;
}) {
  const [saldo, setSaldo] = useState("");
  const [obs, setObs] = useState("");
  const diff = parseMoney(saldo) - calculado;

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Fechar caixa</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
            Dinheiro esperado em caixa:{" "}
            <span className="font-mono font-semibold">{fmtBRL(calculado)}</span>
          </div>
          <div className="grid gap-2">
            <Label>Valor em dinheiro apurado (R$)</Label>
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
                Diferença de caixa: <span className="font-mono font-semibold">{fmtBRL(diff)}</span>.
                Registre a justificativa na observação.
              </span>
            </div>
          )}
          <div className="grid gap-2">
            <Label>Observação</Label>
            <Textarea rows={2} value={obs} onChange={(e) => setObs(e.target.value)} />
          </div>

          <div className="rounded-md border border-border p-3">
            <ComprovantesPanel
              origemTipo="caixa"
              origemId={caixa.id}
              idLoja={caixa.id_loja}
              compact
            />
            <p className="mt-2 text-[11px] text-muted-foreground">
              Use "Foto" para fotografar o comprovante direto pelo celular ou tablet.
            </p>
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

function ReabrirDialog({
  onClose,
  onConfirm,
  saving,
}: {
  onClose: () => void;
  onConfirm: (motivo: string) => void;
  saving: boolean;
}) {
  const [motivo, setMotivo] = useState("");
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reabrir caixa</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <p className="text-sm text-muted-foreground">
            O caixa volta a ficar aberto para correção de lançamentos. O motivo fica registrado
            no histórico.
          </p>
          <div className="grid gap-2">
            <Label>Motivo da reabertura</Label>
            <Textarea rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => onConfirm(motivo)} disabled={saving || !motivo.trim()}>
            {saving ? "Reabrindo…" : "Reabrir"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type ContaBancaria = { id: string; banco: string; agencia: string; conta: string };

function DepositoDialog({
  idCaixa,
  idLoja,
  contas,
  dep,
  onClose,
  onSaved,
}: {
  idCaixa: string;
  idLoja: string;
  contas: ContaBancaria[];
  dep: Deposito | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { profile } = useAuth();
  const [numero, setNumero] = useState(dep?.numero_comprovante ?? "");
  const [valor, setValor] = useState(dep ? toMoneyInput(dep.valor) : "");
  const [data, setData] = useState(dep?.data_deposito ?? hoje());
  const [conta, setConta] = useState<string | null>(dep?.id_conta_bancaria ?? null);
  const [obs, setObs] = useState(dep?.observacao ?? "");
  const [criadoId, setCriadoId] = useState<string | null>(dep?.id ?? null);

  const salvar = useMutation({
    mutationFn: async () => {
      const v = parseMoney(valor);
      if (!numero.trim()) throw new Error("Informe o número do comprovante");
      if (!(v > 0)) throw new Error("Valor deve ser maior que zero");
      if (!conta) throw new Error("Selecione a conta bancária de destino");
      const payload = {
        id_caixa: idCaixa,
        id_loja: idLoja,
        numero_comprovante: numero.trim(),
        valor: v,
        data_deposito: data,
        id_conta_bancaria: conta,
        observacao: obs || null,
        criado_por: profile?.id ?? null,
      };
      if (criadoId) {
        const { error } = await supabase
          .from("caixa_depositos")
          .update(payload)
          .eq("id", criadoId);
        if (error) throw new Error(friendlyDbError(error));
        return criadoId;
      }
      const { data: row, error } = await supabase
        .from("caixa_depositos")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw new Error(friendlyDbError(error));
      return row.id as string;
    },
    onSuccess: (id) => {
      setCriadoId(id);
      toast.success("Depósito salvo — anexe a foto do comprovante");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Depósito em espécie (lotérica)</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Nº do comprovante</Label>
              <Input value={numero} onChange={(e) => setNumero(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Valor depositado (R$)</Label>
              <Input
                inputMode="decimal"
                className="font-mono"
                value={valor}
                onChange={(e) => setValor(maskMoney(e.target.value))}
                placeholder="0,00"
              />
            </div>
            <div className="grid gap-2">
              <Label>Data do depósito</Label>
              <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Conta bancária de destino</Label>
              <EntityCombobox
                options={contas.map((c) => ({
                  value: c.id,
                  label: `${c.banco} ${c.agencia}/${c.conta}`,
                }))}
                value={conta}
                onChange={setConta}
                placeholder="Selecione a conta"
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Observação</Label>
            <Textarea rows={2} value={obs} onChange={(e) => setObs(e.target.value)} />
          </div>

          <div className="rounded-md border border-border p-3">
            {criadoId ? (
              <ComprovantesPanel
                origemTipo="caixa_deposito"
                origemId={criadoId}
                idLoja={idLoja}
                compact
              />
            ) : (
              <p className="text-xs text-muted-foreground">
                Salve o depósito para anexar a imagem do comprovante.
              </p>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            O depósito entra na conciliação bancária como lançamento esperado na conta escolhida.
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Fechar</Button>
          <Button onClick={() => salvar.mutate()} disabled={salvar.isPending}>
            {salvar.isPending ? "Salvando…" : criadoId ? "Salvar alterações" : "Salvar depósito"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LancamentoDialog({
  idCaixa,
  idLoja,
  contas,
  lanc,
  onClose,
  onSaved,
}: {
  idCaixa: string;
  idLoja: string;
  contas: ContaBancaria[];
  lanc: Lanc | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { profile } = useAuth();
  const [tipo, setTipo] = useState<Lanc["tipo"]>(lanc?.tipo ?? "entrada");
  const [valor, setValor] = useState(lanc ? toMoneyInput(lanc.valor) : "");
  const [descricao, setDescricao] = useState(lanc?.descricao ?? "");
  const [forma, setForma] = useState(lanc?.forma_pagamento ?? "dinheiro");
  const [idCategoria, setIdCategoria] = useState<string | null>(lanc?.id_categoria ?? null);
  const [idPessoa, setIdPessoa] = useState<string | null>(
    lanc?.id_cliente ?? lanc?.id_fornecedor ?? null,
  );
  const [idConta, setIdConta] = useState<string | null>(lanc?.id_conta_bancaria ?? null);

  const entrada = tipo === "entrada" || tipo === "suprimento";
  const exigeConta = FORMAS_BANCARIAS.includes(forma);

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
      if (exigeConta && !idConta)
        throw new Error("Informe a conta bancária deste recebimento/pagamento");
      const payload = {
        id_caixa: idCaixa,
        id_loja: idLoja,
        tipo,
        valor: v,
        descricao: descricao.trim(),
        forma_pagamento: forma,
        id_categoria: idCategoria,
        id_cliente: entrada ? idPessoa : null,
        id_fornecedor: entrada ? null : idPessoa,
        id_conta_bancaria: exigeConta ? idConta : null,
        criado_por: profile?.id ?? null,
      };
      if (lanc) {
        const { error } = await supabase
          .from("caixa_lancamentos")
          .update(payload)
          .eq("id", lanc.id);
        if (error) throw new Error(friendlyDbError(error));
      } else {
        const { error } = await supabase.from("caixa_lancamentos").insert(payload);
        if (error) throw new Error(friendlyDbError(error));
      }
    },
    onSuccess: () => {
      toast.success(lanc ? "Lançamento atualizado" : "Lançamento registrado");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{lanc ? "Editar lançamento" : "Novo lançamento de caixa"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Tipo</Label>
              <Select
                value={tipo}
                onValueChange={(v) => {
                  setTipo(v as Lanc["tipo"]);
                  setIdPessoa(null);
                }}
              >
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
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Forma de pagamento</Label>
              <Select value={forma} onValueChange={setForma}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="dinheiro">Dinheiro</SelectItem>
                  <SelectItem value="pix">PIX</SelectItem>
                  <SelectItem value="transferencia">Transferência</SelectItem>
                  <SelectItem value="deposito_bancario">Depósito bancário</SelectItem>
                  <SelectItem value="cartao">Cartão</SelectItem>
                  <SelectItem value="outros">Outros</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {exigeConta && (
              <div className="grid gap-2">
                <Label>Conta bancária</Label>
                <EntityCombobox
                  options={contas.map((c) => ({
                    value: c.id,
                    label: `${c.banco} ${c.agencia}/${c.conta}`,
                  }))}
                  value={idConta}
                  onChange={setIdConta}
                  placeholder="Obrigatório"
                />
              </div>
            )}
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
          {lanc && (
            <div className="rounded-md border border-border p-3">
              <ComprovantesPanel
                origemTipo="caixa_lancamento"
                origemId={lanc.id}
                idLoja={idLoja}
                compact
              />
            </div>
          )}
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
