import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

export const Route = createFileRoute("/_authenticated/conciliacao")({
  head: () => ({
    meta: [
      { title: "Conciliação · Connect 7" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ConciliacaoPage,
});

type Venda = {
  id: string;
  id_loja: string;
  data_venda: string;
  valor_bruto: number;
  valor_liquido_previsto: number;
  data_prevista_recebimento: string;
  status_conciliacao: string;
  id_financeira: string;
  financeira_nome?: string;
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

type Loja = { id: string; nome_fantasia: string };

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function formatDateBR(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

function diffDays(a: string, b: string): number {
  const da = new Date(a.slice(0, 10)).getTime();
  const db = new Date(b.slice(0, 10)).getTime();
  return Math.round(Math.abs(da - db) / 86400000);
}

function ConciliacaoPage() {
  const { profile, selectedLojaId } = useAuth();
  const isAdmin = profile?.role === "administrador";
  const isMaster = profile?.role === "master";
  const readonly = isMaster;

  const [lojas, setLojas] = useState<Loja[]>([]);
  const [targetLoja, setTargetLoja] = useState<string>("");
  const [vendas, setVendas] = useState<Venda[]>([]);
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [loading, setLoading] = useState(false);

  const [tolValor, setTolValor] = useState(0.02);
  const [tolDias, setTolDias] = useState(2);

  const [selVenda, setSelVenda] = useState<string | null>(null);
  const [selLanc, setSelLanc] = useState<string | null>(null);

  const lojaId = isAdmin || isMaster ? (targetLoja || selectedLojaId || "") : (profile?.id_loja ?? "");

  useEffect(() => {
    (async () => {
      if (isAdmin || isMaster) {
        const { data } = await supabase.from("lojas").select("id, nome_fantasia").eq("ativa", true).order("nome_fantasia");
        setLojas((data ?? []) as Loja[]);
      }
    })();
  }, [isAdmin, isMaster]);

  async function reload() {
    if (!lojaId) { setVendas([]); setLancamentos([]); return; }
    setLoading(true);
    try {
      await supabase.rpc("fn_atualizar_status_atrasados" as never);
    } catch { /* noop */ }
    try {
      const [{ data: v }, { data: l }, { data: fs }, { data: cs }] = await Promise.all([
        supabase
          .from("vendas_ucase")
          .select("id, id_loja, id_financeira, data_venda, valor_bruto, valor_liquido_previsto, data_prevista_recebimento, status_conciliacao")
          .eq("id_loja", lojaId)
          .in("status_conciliacao", ["pendente", "atrasado"])
          .order("data_prevista_recebimento", { ascending: true }),
        supabase
          .from("extrato_lancamentos")
          .select("id, id_loja, id_conta_bancaria, data_lancamento, descricao, valor")
          .eq("id_loja", lojaId)
          .eq("conciliado", false)
          .order("data_lancamento", { ascending: true }),
        supabase.from("financeiras").select("id, nome"),
        supabase.from("contas_bancarias").select("id, banco, agencia, conta"),
      ]);
      const fmap = new Map((fs ?? []).map((f: any) => [f.id, f.nome]));
      const cmap = new Map((cs ?? []).map((c: any) => [c.id, `${c.banco} · Ag ${c.agencia} · CC ${c.conta}`]));
      setVendas(((v ?? []) as any[]).map((r) => ({ ...r, financeira_nome: fmap.get(r.id_financeira) })));
      setLancamentos(((l ?? []) as any[]).map((r) => ({ ...r, conta_label: cmap.get(r.id_conta_bancaria) })));
      setSelVenda(null);
      setSelLanc(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [lojaId]);

  // Suggestions: greedy match by (loja) + valor≈ + data≈
  const { suggestions, vendasMatched, lancsMatched } = useMemo(() => {
    const sugg: { venda: Venda; lanc: Lancamento; deltaValor: number; deltaDias: number; confianca: "alta" | "media" }[] = [];
    const usedV = new Set<string>();
    const usedL = new Set<string>();
    const candidates: { v: Venda; l: Lancamento; dv: number; dd: number }[] = [];
    for (const v of vendas) {
      for (const l of lancamentos) {
        const dv = Math.abs(Number(v.valor_liquido_previsto) - Math.abs(Number(l.valor)));
        const dd = diffDays(v.data_prevista_recebimento, l.data_lancamento);
        if (dv <= tolValor && dd <= tolDias) candidates.push({ v, l, dv, dd });
      }
    }
    candidates.sort((a, b) => (a.dv - b.dv) || (a.dd - b.dd));
    for (const c of candidates) {
      if (usedV.has(c.v.id) || usedL.has(c.l.id)) continue;
      usedV.add(c.v.id); usedL.add(c.l.id);
      sugg.push({
        venda: c.v, lanc: c.l, deltaValor: c.dv, deltaDias: c.dd,
        confianca: c.dv <= 0.01 && c.dd === 0 ? "alta" : "media",
      });
    }
    return { suggestions: sugg, vendasMatched: usedV, lancsMatched: usedL };
  }, [vendas, lancamentos, tolValor, tolDias]);

  const suggByVenda = useMemo(() => new Map(suggestions.map((s) => [s.venda.id, s])), [suggestions]);
  const suggByLanc = useMemo(() => new Map(suggestions.map((s) => [s.lanc.id, s])), [suggestions]);

  async function conciliar(venda: Venda, lanc: Lancamento, tipo: "automatica" | "manual") {
    const { error } = await supabase.from("conciliacao_extrato").insert({
      id_loja: venda.id_loja,
      id_venda_ucase: venda.id,
      id_extrato_lancamento: lanc.id,
      id_conta_bancaria: lanc.id_conta_bancaria,
      valor_pago_banco: Math.abs(Number(lanc.valor)),
      tipo,
      conciliado_por: profile?.id ?? null,
    });
    if (error) throw error;
  }

  async function handleConciliarSugestao(id: string) {
    const s = suggByVenda.get(id);
    if (!s) return;
    try {
      await conciliar(s.venda, s.lanc, "automatica");
      toast.success("Conciliação registrada.");
      reload();
    } catch (err: any) {
      toast.error(err?.message ?? "Erro ao conciliar.");
    }
  }

  async function handleConciliarTodas() {
    if (suggestions.length === 0) return;
    try {
      for (const s of suggestions) await conciliar(s.venda, s.lanc, "automatica");
      toast.success(`${suggestions.length} sugestões conciliadas.`);
      reload();
    } catch (err: any) {
      toast.error(err?.message ?? "Erro ao conciliar em lote.");
    }
  }

  async function handleConciliarManual() {
    const v = vendas.find((x) => x.id === selVenda);
    const l = lancamentos.find((x) => x.id === selLanc);
    if (!v || !l) { toast.error("Selecione uma venda e um lançamento."); return; }
    try {
      await conciliar(v, l, "manual");
      toast.success("Conciliação manual registrada.");
      reload();
    } catch (err: any) {
      toast.error(err?.message ?? "Erro ao conciliar.");
    }
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Conciliação</h1>
            <p className="text-sm text-muted-foreground">
              {readonly ? "Visualização das conciliações pendentes." : "Cruze vendas previstas com lançamentos do extrato."}
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            {(isAdmin || isMaster) && (
              <div className="space-y-1">
                <Label className="text-xs">Loja</Label>
                <Select value={targetLoja} onValueChange={setTargetLoja}>
                  <SelectTrigger className="w-52"><SelectValue placeholder="Selecione a loja" /></SelectTrigger>
                  <SelectContent>
                    {lojas.map((l) => (
                      <SelectItem key={l.id} value={l.id}>{l.nome_fantasia}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-xs">Tolerância valor (R$)</Label>
              <Input
                type="number" step="0.01" min="0" className="w-28"
                value={tolValor}
                onChange={(e) => setTolValor(Number(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Tolerância dias</Label>
              <Input
                type="number" min="0" className="w-24"
                value={tolDias}
                onChange={(e) => setTolDias(parseInt(e.target.value) || 0)}
              />
            </div>
            <Button variant="outline" onClick={reload} disabled={loading}>
              {loading ? "Atualizando..." : "Atualizar"}
            </Button>
          </div>
        </header>

        {!readonly && suggestions.length > 0 && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="font-medium">{suggestions.length} sugestões automáticas</span>
                <span className="text-muted-foreground">
                  · {suggestions.filter((s) => s.confianca === "alta").length} de alta confiança
                </span>
              </div>
              <Button size="sm" onClick={handleConciliarTodas}>Conciliar todas</Button>
            </div>
            <div className="max-h-60 overflow-auto rounded-md border bg-card">
              <Table>
                <TableHeader className="sticky top-0 bg-card">
                  <TableRow>
                    <TableHead>Venda</TableHead>
                    <TableHead>Lançamento</TableHead>
                    <TableHead className="text-right">Δ valor</TableHead>
                    <TableHead className="text-right">Δ dias</TableHead>
                    <TableHead>Confiança</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {suggestions.map((s) => (
                    <TableRow key={s.venda.id}>
                      <TableCell className="text-xs">
                        <div className="font-mono">{BRL.format(s.venda.valor_liquido_previsto)}</div>
                        <div className="text-muted-foreground">{formatDateBR(s.venda.data_prevista_recebimento)} · {s.venda.financeira_nome}</div>
                      </TableCell>
                      <TableCell className="text-xs">
                        <div className="font-mono">{BRL.format(Math.abs(Number(s.lanc.valor)))}</div>
                        <div className="text-muted-foreground">{formatDateBR(s.lanc.data_lancamento)} · {s.lanc.conta_label}</div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">{BRL.format(s.deltaValor)}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{s.deltaDias}</TableCell>
                      <TableCell>
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs ${s.confianca === "alta" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"}`}>
                          {s.confianca}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={() => handleConciliarSugestao(s.venda.id)}>Conciliar</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border bg-card">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div className="text-sm font-medium">Vendas a receber ({vendas.length})</div>
              <div className="text-xs text-muted-foreground">Pendentes e atrasadas</div>
            </div>
            <div className="max-h-[560px] overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-card">
                  <TableRow>
                    {!readonly && <TableHead className="w-8"></TableHead>}
                    <TableHead>Data prev.</TableHead>
                    <TableHead>Financeira</TableHead>
                    <TableHead className="text-right">Líquido prev.</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vendas.map((v) => {
                    const sug = suggByVenda.has(v.id);
                    return (
                      <TableRow
                        key={v.id}
                        onClick={() => !readonly && setSelVenda(v.id === selVenda ? null : v.id)}
                        className={`${!readonly ? "cursor-pointer" : ""} ${sug ? "border-l-2 border-l-primary" : ""} ${selVenda === v.id ? "bg-primary/10" : ""}`}
                      >
                        {!readonly && (
                          <TableCell>
                            <input type="radio" checked={selVenda === v.id} readOnly />
                          </TableCell>
                        )}
                        <TableCell className="font-mono text-xs">{formatDateBR(v.data_prevista_recebimento)}</TableCell>
                        <TableCell className="text-xs">{v.financeira_nome ?? "—"}</TableCell>
                        <TableCell className="text-right font-mono text-xs">{BRL.format(v.valor_liquido_previsto)}</TableCell>
                        <TableCell>
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs ${v.status_conciliacao === "atrasado" ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"}`}>
                            {v.status_conciliacao}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {vendas.length === 0 && (
                    <TableRow><TableCell colSpan={readonly ? 4 : 5} className="text-center text-sm text-muted-foreground py-8">Nenhuma venda pendente.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="rounded-lg border bg-card">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div className="text-sm font-medium">Lançamentos do extrato ({lancamentos.length})</div>
              <div className="text-xs text-muted-foreground">Não conciliados</div>
            </div>
            <div className="max-h-[560px] overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-card">
                  <TableRow>
                    {!readonly && <TableHead className="w-8"></TableHead>}
                    <TableHead>Data</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lancamentos.map((l) => {
                    const sug = suggByLanc.has(l.id);
                    return (
                      <TableRow
                        key={l.id}
                        onClick={() => !readonly && setSelLanc(l.id === selLanc ? null : l.id)}
                        className={`${!readonly ? "cursor-pointer" : ""} ${sug ? "border-l-2 border-l-primary" : ""} ${selLanc === l.id ? "bg-primary/10" : ""}`}
                      >
                        {!readonly && (
                          <TableCell>
                            <input type="radio" checked={selLanc === l.id} readOnly />
                          </TableCell>
                        )}
                        <TableCell className="font-mono text-xs">{formatDateBR(l.data_lancamento)}</TableCell>
                        <TableCell className="text-xs">
                          <div>{l.descricao ?? "—"}</div>
                          <div className="text-muted-foreground">{l.conta_label}</div>
                        </TableCell>
                        <TableCell className={`text-right font-mono text-xs ${Number(l.valor) < 0 ? "text-red-600" : ""}`}>
                          {BRL.format(Number(l.valor))}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {lancamentos.length === 0 && (
                    <TableRow><TableCell colSpan={readonly ? 3 : 4} className="text-center text-sm text-muted-foreground py-8">Nenhum lançamento pendente.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>

        {!readonly && (
          <div className="flex items-center justify-end gap-3 rounded-lg border bg-card p-3">
            <div className="text-xs text-muted-foreground">
              {selVenda && selLanc ? "Pronto para conciliar manualmente." : "Selecione uma venda e um lançamento para conciliar manualmente."}
            </div>
            <Button onClick={handleConciliarManual} disabled={!selVenda || !selLanc}>
              Conciliar manual
            </Button>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
