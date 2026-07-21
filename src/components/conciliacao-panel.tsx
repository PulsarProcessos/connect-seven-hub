import { useEffect, useMemo, useState } from "react";
import { Link2, Check, Wand2, AlertTriangle, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
 * Painel de conciliação bancária.
 *
 * Cruza os lançamentos do extrato com dois lados:
 *  - CRÉDITOS  → vendas a receber (vendas_ucase pendentes/atrasadas)
 *  - DÉBITOS   → contas a pagar em aberto
 *
 * O sinal do lançamento decide contra qual lado ele é comparado,
 * evitando sugerir que uma despesa quite uma venda.
 */

type Venda = {
  id: string;
  id_loja: string;
  data_venda: string;
  valor_liquido_previsto: number;
  data_prevista_recebimento: string;
  status_conciliacao: string;
  origem_nome?: string;
};

type ContaPagar = {
  id: string;
  id_loja: string;
  descricao: string;
  fornecedor: string | null;
  valor: number;
  data_vencimento: string;
  id_conta_bancaria: string | null;
};

type Lancamento = {
  id: string;
  id_loja: string;
  id_conta_bancaria: string;
  data_lancamento: string;
  descricao: string | null;
  valor: number;
  conta_label?: string;
};

type Sugestao =
  | { tipo: "venda"; alvo: Venda; lanc: Lancamento; dv: number; dd: number; alta: boolean }
  | { tipo: "conta"; alvo: ContaPagar; lanc: Lancamento; dv: number; dd: number; alta: boolean };

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const fmt = (v: unknown) => BRL.format(Number(v ?? 0) || 0);

function fmtData(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

function diffDays(a: string, b: string): number {
  const da = new Date(a.slice(0, 10)).getTime();
  const db = new Date(b.slice(0, 10)).getTime();
  return Math.round(Math.abs(da - db) / 86400000);
}

export function ConciliacaoPanel({ lojaId }: { lojaId: string }) {
  const { profile } = useAuth();
  const readonly = profile?.role === "master";

  const [vendas, setVendas] = useState<Venda[]>([]);
  const [contas, setContas] = useState<ContaPagar[]>([]);
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [loading, setLoading] = useState(false);
  const [tolValor, setTolValor] = useState(0.02);
  const [tolDias, setTolDias] = useState(2);
  const [busy, setBusy] = useState(false);

  // seleção para conciliação manual
  const [selLado, setSelLado] = useState<{ tipo: "venda" | "conta"; id: string } | null>(null);
  const [selLanc, setSelLanc] = useState<string | null>(null);

  const reload = async () => {
    if (!lojaId) {
      setVendas([]);
      setContas([]);
      setLancamentos([]);
      return;
    }
    setLoading(true);
    try {
      await supabase.rpc("fn_atualizar_status_atrasados" as never);
    } catch {
      /* função pode não existir ainda; segue */
    }
    const [v, cp, l, cb] = await Promise.all([
      supabase
        .from("vendas_ucase")
        .select(
          "id, id_loja, data_venda, valor_liquido_previsto, data_prevista_recebimento, status_conciliacao",
        )
        .eq("id_loja", lojaId)
        .in("status_conciliacao", ["pendente", "atrasado"])
        .order("data_prevista_recebimento"),
      supabase
        .from("contas_pagar")
        .select("id, id_loja, descricao, fornecedor, valor, data_vencimento, id_conta_bancaria")
        .eq("id_loja", lojaId)
        .eq("status", "aberto")
        .is("id_extrato_lancamento", null)
        .order("data_vencimento"),
      supabase
        .from("extrato_lancamentos")
        .select("id, id_loja, id_conta_bancaria, data_lancamento, descricao, valor")
        .eq("id_loja", lojaId)
        .eq("conciliado", false)
        .order("data_lancamento"),
      supabase.from("contas_bancarias").select("id, banco, agencia, conta"),
    ]);

    const cmap = new Map(
      (cb.data ?? []).map((c) => [
        c.id,
        `${c.banco} · Ag ${c.agencia} · CC ${c.conta}`,
      ]),
    );
    setVendas((v.data ?? []) as Venda[]);
    setContas((cp.data ?? []) as ContaPagar[]);
    setLancamentos(
      ((l.data ?? []) as Lancamento[]).map((r) => ({
        ...r,
        conta_label: cmap.get(r.id_conta_bancaria),
      })),
    );
    setSelLado(null);
    setSelLanc(null);
    setLoading(false);
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lojaId]);

  /**
   * Matching guloso: monta todos os candidatos dentro da tolerância,
   * ordena pelo menor desvio e consome sem repetir alvo nem lançamento.
   * Créditos só casam com vendas; débitos só com contas a pagar.
   */
  const { sugestoes, alvosUsados, lancsUsados } = useMemo(() => {
    const cands: Sugestao[] = [];

    for (const l of lancamentos) {
      const valorAbs = Math.abs(Number(l.valor));
      const isCredito = Number(l.valor) >= 0;

      if (isCredito) {
        for (const v of vendas) {
          const dv = Math.abs(Number(v.valor_liquido_previsto) - valorAbs);
          const dd = diffDays(v.data_prevista_recebimento, l.data_lancamento);
          if (dv <= tolValor && dd <= tolDias)
            cands.push({
              tipo: "venda",
              alvo: v,
              lanc: l,
              dv,
              dd,
              alta: dv <= 0.01 && dd === 0,
            });
        }
      } else {
        for (const c of contas) {
          const dv = Math.abs(Number(c.valor) - valorAbs);
          const dd = diffDays(c.data_vencimento, l.data_lancamento);
          if (dv <= tolValor && dd <= tolDias)
            cands.push({
              tipo: "conta",
              alvo: c,
              lanc: l,
              dv,
              dd,
              alta: dv <= 0.01 && dd === 0,
            });
        }
      }
    }

    cands.sort((a, b) => a.dv - b.dv || a.dd - b.dd);
    const usadosAlvo = new Set<string>();
    const usadosLanc = new Set<string>();
    const out: Sugestao[] = [];
    for (const c of cands) {
      if (usadosAlvo.has(c.alvo.id) || usadosLanc.has(c.lanc.id)) continue;
      usadosAlvo.add(c.alvo.id);
      usadosLanc.add(c.lanc.id);
      out.push(c);
    }
    return { sugestoes: out, alvosUsados: usadosAlvo, lancsUsados: usadosLanc };
  }, [vendas, contas, lancamentos, tolValor, tolDias]);

  /** Grava a conciliação conforme o lado */
  async function conciliar(s: Sugestao, tipoOrigem: "automatica" | "manual") {
    if (s.tipo === "venda") {
      const { error } = await supabase.from("conciliacao_extrato").insert({
        id_loja: s.alvo.id_loja,
        id_venda_ucase: s.alvo.id,
        id_extrato_lancamento: s.lanc.id,
        id_conta_bancaria: s.lanc.id_conta_bancaria,
        valor_pago_banco: Math.abs(Number(s.lanc.valor)),
        tipo: tipoOrigem,
        conciliado_por: profile?.id ?? null,
      });
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("contas_pagar")
        .update({
          id_extrato_lancamento: s.lanc.id,
          status: "pago" as const,
          data_pagamento: s.lanc.data_lancamento.slice(0, 10),
          id_conta_bancaria: s.lanc.id_conta_bancaria,
        })
        .eq("id", s.alvo.id);
      if (error) throw error;
    }
  }

  const conciliarUma = async (s: Sugestao) => {
    setBusy(true);
    try {
      await conciliar(s, "automatica");
      toast.success("Conciliado");
      await reload();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const conciliarTodas = async () => {
    if (sugestoes.length === 0) return;
    setBusy(true);
    let ok = 0;
    try {
      for (const s of sugestoes) {
        await conciliar(s, "automatica");
        ok++;
      }
      toast.success(`${ok} sugestão(ões) conciliada(s)`);
      await reload();
    } catch (e) {
      toast.error(`Conciliadas ${ok}. Erro: ${(e as Error).message}`);
      await reload();
    } finally {
      setBusy(false);
    }
  };

  const conciliarManual = async () => {
    if (!selLado || !selLanc) return;
    const lanc = lancamentos.find((l) => l.id === selLanc);
    if (!lanc) return;
    const alvo =
      selLado.tipo === "venda"
        ? vendas.find((v) => v.id === selLado.id)
        : contas.find((c) => c.id === selLado.id);
    if (!alvo) return;

    // Impede casar crédito com conta a pagar e vice-versa
    const isCredito = Number(lanc.valor) >= 0;
    if (isCredito && selLado.tipo === "conta")
      return toast.error("Um crédito não quita uma conta a pagar.");
    if (!isCredito && selLado.tipo === "venda")
      return toast.error("Um débito não recebe uma venda.");

    setBusy(true);
    try {
      await conciliar(
        { tipo: selLado.tipo, alvo, lanc, dv: 0, dd: 0, alta: false } as Sugestao,
        "manual",
      );
      toast.success("Conciliado manualmente");
      await reload();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!lojaId)
    return (
      <p className="mt-6 text-sm text-muted-foreground">
        Selecione uma loja para conciliar.
      </p>
    );

  return (
    <>
      {/* Controles */}
      <div className="mt-4 flex flex-wrap items-end gap-4">
        <div className="grid gap-1">
          <Label className="text-xs">Tolerância de valor (R$)</Label>
          <Input
            className="w-[130px] font-mono"
            type="number"
            step="0.01"
            min="0"
            value={tolValor}
            onChange={(e) => setTolValor(Number(e.target.value) || 0)}
          />
        </div>
        <div className="grid gap-1">
          <Label className="text-xs">Tolerância de dias</Label>
          <Input
            className="w-[110px] font-mono"
            type="number"
            min="0"
            value={tolDias}
            onChange={(e) => setTolDias(Number(e.target.value) || 0)}
          />
        </div>
        <Button variant="outline" onClick={reload} disabled={loading || busy}>
          Atualizar
        </Button>
        {!readonly && sugestoes.length > 0 && (
          <Button onClick={conciliarTodas} disabled={busy}>
            <Wand2 className="h-4 w-4" />
            Conciliar {sugestoes.length} sugestão(ões)
          </Button>
        )}
      </div>

      {/* Sugestões */}
      {sugestoes.length > 0 && (
        <div className="mt-4 rounded-lg border-2 border-primary/30 bg-primary/5">
          <div className="flex items-center gap-2 border-b border-primary/20 px-4 py-2">
            <Link2 className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-primary">
              {sugestoes.length} correspondência(s) sugerida(s)
            </span>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tipo</TableHead>
                <TableHead>Registro</TableHead>
                <TableHead className="text-right">Valor previsto</TableHead>
                <TableHead>Lançamento no banco</TableHead>
                <TableHead className="text-right">Valor no banco</TableHead>
                <TableHead>Confiança</TableHead>
                <TableHead className="w-24 text-right">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sugestoes.map((s, i) => (
                <TableRow key={`${s.alvo.id}-${s.lanc.id}-${i}`}>
                  <TableCell>
                    {s.tipo === "venda" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        <ArrowDownLeft className="h-3 w-3" />
                        Receber
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                        <ArrowUpRight className="h-3 w-3" />
                        Pagar
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {s.tipo === "venda" ? (
                      <>
                        Venda de {fmtData(s.alvo.data_venda)}
                        <div className="text-xs text-muted-foreground">
                          previsto {fmtData(s.alvo.data_prevista_recebimento)}
                        </div>
                      </>
                    ) : (
                      <>
                        {s.alvo.descricao}
                        <div className="text-xs text-muted-foreground">
                          venc. {fmtData(s.alvo.data_vencimento)}
                        </div>
                      </>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {fmt(
                      s.tipo === "venda" ? s.alvo.valor_liquido_previsto : s.alvo.valor,
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {fmtData(s.lanc.data_lancamento)}
                    <div className="max-w-[220px] truncate text-xs text-muted-foreground">
                      {s.lanc.descricao ?? "—"}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {fmt(Math.abs(Number(s.lanc.valor)))}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        s.alta
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {s.alta ? "Alta" : `±${fmt(s.dv)} · ${s.dd}d`}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    {!readonly && (
                      <Button size="sm" onClick={() => conciliarUma(s)} disabled={busy}>
                        <Check className="h-3.5 w-3.5" />
                        Conciliar
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Conciliação manual */}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {/* Lado esquerdo: a receber e a pagar */}
        <div className="rounded-lg border border-border bg-card">
          <div className="border-b border-border px-4 py-2 text-sm font-medium">
            Pendentes no sistema
          </div>
          <div className="max-h-[420px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Registro</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Data</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={3} className="py-6 text-center text-sm text-muted-foreground">
                      Carregando…
                    </TableCell>
                  </TableRow>
                ) : vendas.length + contas.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="py-6 text-center text-sm text-muted-foreground">
                      Nada pendente.
                    </TableCell>
                  </TableRow>
                ) : (
                  <>
                    {vendas.map((v) => (
                      <TableRow
                        key={v.id}
                        onClick={() => setSelLado({ tipo: "venda", id: v.id })}
                        className={`cursor-pointer ${
                          selLado?.id === v.id ? "bg-primary/10" : ""
                        } ${alvosUsados.has(v.id) ? "opacity-50" : ""}`}
                      >
                        <TableCell className="text-sm">
                          <span className="inline-flex items-center gap-1 text-emerald-700">
                            <ArrowDownLeft className="h-3 w-3" />
                            Venda
                          </span>
                          {v.status_conciliacao === "atrasado" && (
                            <AlertTriangle className="ml-1 inline h-3 w-3 text-destructive" />
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {fmt(v.valor_liquido_previsto)}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {fmtData(v.data_prevista_recebimento)}
                        </TableCell>
                      </TableRow>
                    ))}
                    {contas.map((c) => (
                      <TableRow
                        key={c.id}
                        onClick={() => setSelLado({ tipo: "conta", id: c.id })}
                        className={`cursor-pointer ${
                          selLado?.id === c.id ? "bg-primary/10" : ""
                        } ${alvosUsados.has(c.id) ? "opacity-50" : ""}`}
                      >
                        <TableCell className="text-sm">
                          <span className="inline-flex items-center gap-1 text-amber-700">
                            <ArrowUpRight className="h-3 w-3" />
                          </span>
                          <span className="ml-1">{c.descricao}</span>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {fmt(c.valor)}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {fmtData(c.data_vencimento)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </>
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Lado direito: lançamentos do extrato */}
        <div className="rounded-lg border border-border bg-card">
          <div className="border-b border-border px-4 py-2 text-sm font-medium">
            Lançamentos não conciliados
          </div>
          <div className="max-h-[420px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={3} className="py-6 text-center text-sm text-muted-foreground">
                      Carregando…
                    </TableCell>
                  </TableRow>
                ) : lancamentos.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="py-6 text-center text-sm text-muted-foreground">
                      Nenhum lançamento pendente. Importe um extrato na aba anterior.
                    </TableCell>
                  </TableRow>
                ) : (
                  lancamentos.map((l) => (
                    <TableRow
                      key={l.id}
                      onClick={() => setSelLanc(l.id)}
                      className={`cursor-pointer ${selLanc === l.id ? "bg-primary/10" : ""} ${
                        lancsUsados.has(l.id) ? "opacity-50" : ""
                      }`}
                    >
                      <TableCell className="font-mono text-xs">
                        {fmtData(l.data_lancamento)}
                      </TableCell>
                      <TableCell className="max-w-[220px] truncate text-sm">
                        {l.descricao ?? "—"}
                      </TableCell>
                      <TableCell
                        className={`text-right font-mono text-sm ${
                          Number(l.valor) < 0 ? "text-destructive" : "text-emerald-600"
                        }`}
                      >
                        {fmt(l.valor)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      {!readonly && (
        <div className="mt-4 flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3">
          <span className="text-sm text-muted-foreground">
            {selLado && selLanc
              ? "Pronto para conciliar manualmente."
              : "Selecione um registro pendente e um lançamento para conciliar manualmente."}
          </span>
          <Button
            className="ml-auto"
            disabled={!selLado || !selLanc || busy}
            onClick={conciliarManual}
          >
            <Link2 className="h-4 w-4" />
            Conciliar selecionados
          </Button>
        </div>
      )}
    </>
  );
}
