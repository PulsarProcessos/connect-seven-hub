import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock, Plus, TrendingUp } from "lucide-react";
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
import { fmtBRL, maskMoney, parseMoney, toMoneyInput, friendlyDbError } from "@/lib/money";

export const Route = createFileRoute("/_authenticated/contas-receber")({
  head: () => ({
    meta: [
      { title: "Contas a Receber · Connect 7" },
      {
        name: "description",
        content: "Acompanhe todas as entradas previstas e dê baixa nos recebimentos.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ContasReceberPage,
});

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso + "T00:00:00").toLocaleDateString("pt-BR") : "—";

type Item = {
  key: string;
  id: string;
  fonte: "conta_receber" | "venda";
  id_loja: string;
  descricao: string;
  cliente: string | null;
  valor: number;
  valor_recebido: number | null;
  vencimento: string;
  recebimento: string | null;
  recebido: boolean;
  origem: string;
};

type ContaReceber = {
  id: string;
  id_loja: string;
  origem: string;
  descricao: string;
  valor: number;
  valor_recebido: number | null;
  data_vencimento: string;
  data_recebimento: string | null;
  status: string;
  id_cliente: string | null;
  id_categoria: string | null;
  id_conta_bancaria: string | null;
  observacao: string | null;
  clientes: { nome: string } | null;
};

function ContasReceberPage() {
  const { profile, selectedLojaId, lojas } = useAuth();
  const qc = useQueryClient();
  const isGlobal = profile?.role === "administrador" || profile?.role === "master";
  const podeEditar = profile?.role !== "master";
  const escopoLoja = isGlobal ? selectedLojaId : (profile?.id_loja ?? null);

  const hoje = new Date();
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const [ano, setAno] = useState(hoje.getFullYear());
  const [status, setStatus] = useState("todos");
  const [detalhe, setDetalhe] = useState<Item | null>(null);
  const [novo, setNovo] = useState(false);

  const dtIni = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const dtFim = new Date(ano, mes, 0).toISOString().slice(0, 10);

  const crQ = useQuery({
    queryKey: ["contas_receber", { escopoLoja, dtIni, dtFim }],
    queryFn: async () => {
      let q = supabase
        .from("contas_receber")
        .select(
          "id, id_loja, origem, descricao, valor, valor_recebido, data_vencimento, data_recebimento, status, id_cliente, id_categoria, id_conta_bancaria, observacao, clientes(nome)",
        )
        .gte("data_vencimento", dtIni)
        .lte("data_vencimento", dtFim)
        .neq("status", "cancelado")
        .order("data_vencimento");
      if (escopoLoja) q = q.eq("id_loja", escopoLoja);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as ContaReceber[];
    },
  });

  const vendasQ = useQuery({
    queryKey: ["cr_vendas", { escopoLoja, dtIni, dtFim }],
    queryFn: async () => {
      let q = supabase
        .from("vendas_ucase")
        .select(
          "id, id_loja, data_prevista_recebimento, valor_liquido_previsto, status_conciliacao, meio_pagamento, numero_venda, data_venda",
        )
        .gte("data_prevista_recebimento", dtIni)
        .lte("data_prevista_recebimento", dtFim)
        .order("data_prevista_recebimento");
      if (escopoLoja) q = q.eq("id_loja", escopoLoja);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const itens = useMemo<Item[]>(() => {
    const list: Item[] = [];
    for (const c of crQ.data ?? []) {
      list.push({
        key: `cr-${c.id}`,
        id: c.id,
        fonte: "conta_receber",
        id_loja: c.id_loja,
        descricao: c.descricao,
        cliente: c.clientes?.nome ?? null,
        valor: Number(c.valor),
        valor_recebido: c.valor_recebido == null ? null : Number(c.valor_recebido),
        vencimento: c.data_vencimento,
        recebimento: c.data_recebimento,
        recebido: c.status === "recebido",
        origem: c.origem === "caixa" ? "Caixa" : "Manual",
      });
    }
    for (const v of vendasQ.data ?? []) {
      list.push({
        key: `v-${v.id}`,
        id: v.id,
        fonte: "venda",
        id_loja: v.id_loja,
        descricao: `Venda ${v.numero_venda ?? ""} · ${v.meio_pagamento}`.trim(),
        cliente: null,
        valor: Number(v.valor_liquido_previsto),
        valor_recebido:
          v.status_conciliacao === "conciliado" ? Number(v.valor_liquido_previsto) : null,
        vencimento: v.data_prevista_recebimento ?? "",
        recebimento:
          v.status_conciliacao === "conciliado" ? v.data_prevista_recebimento : null,
        recebido: v.status_conciliacao === "conciliado",
        origem: "Venda",
      });
    }
    const filtered =
      status === "todos"
        ? list
        : list.filter((i) => (status === "recebido" ? i.recebido : !i.recebido));
    return filtered.sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  }, [crQ.data, vendasQ.data, status]);

  const totais = useMemo(() => {
    const hojeIso = new Date().toISOString().slice(0, 10);
    let recebido = 0;
    let aReceber = 0;
    let vencido = 0;
    for (const i of itens) {
      if (i.recebido) recebido += i.valor_recebido ?? i.valor;
      else {
        aReceber += i.valor;
        if (i.vencimento && i.vencimento < hojeIso) vencido += i.valor;
      }
    }
    return { recebido, aReceber, vencido };
  }, [itens]);

  const contasQ = useQuery({
    queryKey: ["contas_bancarias_todas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contas_bancarias")
        .select("id, id_loja, banco, agencia, conta")
        .eq("ativa", true)
        .order("banco");
      if (error) throw error;
      return data ?? [];
    },
  });

  const baixar = useMutation({
    mutationFn: async (p: {
      item: Item;
      data: string;
      valor: number;
      idConta: string | null;
    }) => {
      if (p.item.fonte === "venda") {
        const { error } = await supabase
          .from("vendas_ucase")
          .update({ status_conciliacao: "conciliado" })
          .eq("id", p.item.id);
        if (error) throw new Error(friendlyDbError(error));
      } else {
        const { error } = await supabase
          .from("contas_receber")
          .update({
            status: "recebido",
            data_recebimento: p.data,
            valor_recebido: p.valor,
            id_conta_bancaria: p.idConta,
          })
          .eq("id", p.item.id);
        if (error) throw new Error(friendlyDbError(error));
      }
    },
    onSuccess: () => {
      toast.success("Recebimento registrado");
      qc.invalidateQueries({ queryKey: ["contas_receber"] });
      qc.invalidateQueries({ queryKey: ["cr_vendas"] });
      qc.invalidateQueries({ queryKey: ["extrato_financeiro"] });
      setDetalhe(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const estornar = useMutation({
    mutationFn: async (item: Item) => {
      const res =
        item.fonte === "venda"
          ? await supabase
              .from("vendas_ucase")
              .update({ status_conciliacao: "pendente" })
              .eq("id", item.id)
          : await supabase
              .from("contas_receber")
              .update({ status: "aberto" })
              .eq("id", item.id);
      if (res.error) throw new Error(friendlyDbError(res.error));
    },
    onSuccess: () => {
      toast.success("Recebimento estornado");
      qc.invalidateQueries({ queryKey: ["contas_receber"] });
      qc.invalidateQueries({ queryKey: ["cr_vendas"] });
      setDetalhe(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const anos = Array.from({ length: 6 }, (_, i) => hoje.getFullYear() - 3 + i);

  return (
    <AppLayout>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Contas a Receber</h1>
          <p className="text-sm text-muted-foreground">
            Todas as entradas previstas — vendas, caixa e lançamentos manuais.
          </p>
        </div>
        {podeEditar && (
          <Button size="sm" onClick={() => setNovo(true)}>
            <Plus className="h-4 w-4" />
            Nova conta a receber
          </Button>
        )}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-4">
        <div className="grid gap-1.5">
          <Label className="text-xs">Mês</Label>
          <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {MESES.map((m, i) => (
                <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs">Ano</Label>
          <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {anos.map((a) => (
                <SelectItem key={a} value={String(a)}>{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs">Situação</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas</SelectItem>
              <SelectItem value="aberto">Em aberto</SelectItem>
              <SelectItem value="recebido">Recebidas</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs">Loja</Label>
          <div className="flex h-10 items-center rounded-md border border-border bg-muted/30 px-3 text-sm">
            {escopoLoja
              ? (lojas.find((l) => l.id === escopoLoja)?.nome ?? "Unidade")
              : "Todas as lojas"}
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        <Card label="Recebido" value={totais.recebido} tone="up" icon={<CheckCircle2 className="h-4 w-4" />} />
        <Card label="A receber" value={totais.aReceber} tone="neutral" icon={<TrendingUp className="h-4 w-4" />} />
        <Card label="Vencido" value={totais.vencido} tone="down" icon={<Clock className="h-4 w-4" />} />
      </div>

      <div className="mt-4 rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">Vencimento</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Origem</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead className="w-32">Situação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {crQ.isLoading || vendasQ.isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  Carregando…
                </TableCell>
              </TableRow>
            ) : itens.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  Nenhuma entrada no período.
                </TableCell>
              </TableRow>
            ) : (
              itens.map((i) => (
                <TableRow
                  key={i.key}
                  className="cursor-pointer"
                  onClick={() => setDetalhe(i)}
                >
                  <TableCell className="font-mono text-xs">{fmtDate(i.vencimento)}</TableCell>
                  <TableCell className="max-w-xs truncate">{i.descricao}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{i.cliente ?? "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{i.origem}</TableCell>
                  <TableCell className="text-right font-mono text-emerald-600 dark:text-emerald-400">
                    {fmtBRL(i.valor)}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1 ring-inset ${
                        i.recebido
                          ? "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20 dark:text-emerald-400"
                          : "bg-amber-500/10 text-amber-700 ring-amber-500/20 dark:text-amber-400"
                      }`}
                    >
                      {i.recebido ? "Recebido" : "Em aberto"}
                    </span>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {detalhe && (
        <DetalheDialog
          item={detalhe}
          contas={(contasQ.data ?? []).filter((c) => c.id_loja === detalhe.id_loja)}
          podeEditar={podeEditar}
          onClose={() => setDetalhe(null)}
          onBaixar={(data, valor, idConta) =>
            baixar.mutate({ item: detalhe, data, valor, idConta })
          }
          onEstornar={() => estornar.mutate(detalhe)}
          saving={baixar.isPending || estornar.isPending}
        />
      )}

      {novo && (
        <NovaContaReceberDialog
          idLoja={escopoLoja}
          onClose={() => setNovo(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["contas_receber"] });
            setNovo(false);
          }}
        />
      )}
    </AppLayout>
  );
}

function Card({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: number;
  tone: "up" | "down" | "neutral";
  icon: React.ReactNode;
}) {
  const cls =
    tone === "up"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "down"
        ? "text-rose-600 dark:text-rose-400"
        : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className={`mt-2 font-mono text-2xl font-semibold ${cls}`}>{fmtBRL(value)}</div>
    </div>
  );
}

function DetalheDialog({
  item,
  contas,
  podeEditar,
  onClose,
  onBaixar,
  onEstornar,
  saving,
}: {
  item: Item;
  contas: { id: string; banco: string; agencia: string; conta: string }[];
  podeEditar: boolean;
  onClose: () => void;
  onBaixar: (data: string, valor: number, idConta: string | null) => void;
  onEstornar: () => void;
  saving: boolean;
}) {
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [valor, setValor] = useState(toMoneyInput(item.valor));
  const [idConta, setIdConta] = useState<string | null>(null);

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Detalhes do recebimento</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-2 text-sm">
          <Linha rotulo="Descrição" valor={item.descricao} />
          <Linha rotulo="Cliente" valor={item.cliente ?? "—"} />
          <Linha rotulo="Origem" valor={item.origem} />
          <Linha rotulo="Vencimento" valor={fmtDate(item.vencimento)} />
          <Linha rotulo="Valor previsto" valor={fmtBRL(item.valor)} />
          {item.recebido && (
            <>
              <Linha rotulo="Recebido em" valor={fmtDate(item.recebimento)} />
              <Linha
                rotulo="Valor recebido"
                valor={fmtBRL(item.valor_recebido ?? item.valor)}
              />
            </>
          )}

          {!item.recebido && podeEditar && (
            <div className="mt-2 grid gap-3 rounded-md border border-border p-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label className="text-xs">Data do recebimento</Label>
                  <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">Valor recebido</Label>
                  <Input
                    inputMode="decimal"
                    className="font-mono"
                    value={valor}
                    onChange={(e) => setValor(maskMoney(e.target.value))}
                    disabled={item.fonte === "venda"}
                  />
                </div>
              </div>
              {item.fonte === "conta_receber" && (
                <div className="grid gap-1.5">
                  <Label className="text-xs">Conta bancária de crédito</Label>
                  <EntityCombobox
                    options={contas.map((c) => ({
                      value: c.id,
                      label: `${c.banco} · Ag. ${c.agencia} / Cc. ${c.conta}`,
                    }))}
                    value={idConta}
                    onChange={setIdConta}
                    placeholder="Opcional"
                  />
                </div>
              )}
            </div>
          )}

          {item.fonte === "conta_receber" && (
            <div className="rounded-md border border-border p-3">
              <ComprovantesPanel
                origemTipo="conta_receber"
                origemId={item.id}
                idLoja={item.id_loja}
                compact
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Fechar
          </Button>
          {podeEditar &&
            (item.recebido ? (
              <Button variant="outline" onClick={onEstornar} disabled={saving}>
                Estornar recebimento
              </Button>
            ) : (
              <Button
                onClick={() => onBaixar(data, parseMoney(valor), idConta)}
                disabled={saving}
              >
                {saving ? "Salvando…" : "Dar como recebido"}
              </Button>
            ))}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border/60 pb-1.5">
      <span className="text-muted-foreground">{rotulo}</span>
      <span className="text-right font-medium">{valor}</span>
    </div>
  );
}

function NovaContaReceberDialog({
  idLoja,
  onClose,
  onSaved,
}: {
  idLoja: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { profile, lojas } = useAuth();
  const [loja, setLoja] = useState<string | null>(idLoja);
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [venc, setVenc] = useState(new Date().toISOString().slice(0, 10));
  const [idCliente, setIdCliente] = useState<string | null>(null);
  const [idCategoria, setIdCategoria] = useState<string | null>(null);
  const [obs, setObs] = useState("");

  const clientesQ = useQuery({
    queryKey: ["clientes_combo"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clientes")
        .select("id, nome")
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const catsQ = useQuery({
    queryKey: ["cats_receita"],
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
      if (!loja) throw new Error("Selecione a loja");
      if (!descricao.trim()) throw new Error("Informe a descrição");
      const v = parseMoney(valor);
      if (!(v > 0)) throw new Error("Valor deve ser maior que zero");
      const { error } = await supabase.from("contas_receber").insert({
        id_loja: loja,
        origem: "manual",
        descricao: descricao.trim(),
        valor: v,
        data_vencimento: venc,
        id_cliente: idCliente,
        id_categoria: idCategoria,
        observacao: obs.trim() || null,
        criado_por: profile?.id ?? null,
      });
      if (error) throw new Error(friendlyDbError(error));
    },
    onSuccess: () => {
      toast.success("Conta a receber criada");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova conta a receber</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>Loja</Label>
            <EntityCombobox
              options={lojas.map((l) => ({ value: l.id, label: l.nome }))}
              value={loja}
              onChange={setLoja}
              placeholder="Selecione a loja"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Vencimento</Label>
              <Input type="date" value={venc} onChange={(e) => setVenc(e.target.value)} />
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
            <Label>Cliente</Label>
            <EntityCombobox
              options={(clientesQ.data ?? []).map((c) => ({ value: c.id, label: c.nome }))}
              value={idCliente}
              onChange={setIdCliente}
              placeholder="Opcional — digite para filtrar"
            />
          </div>
          <div className="grid gap-2">
            <Label>Categoria (DRE)</Label>
            <EntityCombobox
              options={(catsQ.data ?? [])
                .filter((c) => c.dre_grupos?.natureza === "receita")
                .map((c) => ({
                  value: c.id,
                  label: c.nome,
                  hint: c.dre_grupos?.nome,
                }))}
              value={idCategoria}
              onChange={setIdCategoria}
              placeholder="Opcional"
            />
          </div>
          <div className="grid gap-2">
            <Label>Observação</Label>
            <Textarea rows={2} value={obs} onChange={(e) => setObs(e.target.value)} />
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
