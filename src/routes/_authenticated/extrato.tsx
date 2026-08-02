import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, FileText, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { EntityCombobox } from "@/components/entity-combobox";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { fmtBRL, friendlyDbError } from "@/lib/money";

export const Route = createFileRoute("/_authenticated/extrato")({
  head: () => ({
    meta: [
      { title: "Extrato Bancário · Connect 7" },
      {
        name: "description",
        content:
          "Importe o arquivo OFX do banco e classifique cada lançamento com fornecedor, cliente e categoria.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ExtratoBancarioPage,
});

type Loja = { id: string; nome_fantasia: string };
type Conta = { id: string; id_loja: string; banco: string; agencia: string; conta: string };

type Tx = {
  fitid: string;
  data: string;
  descricao: string;
  valor: number;
  duplicado: boolean;
  // classificação
  match: { tipo: "pagar" | "receber" | "venda"; id: string; label: string } | null;
  criar: boolean;
  idPessoa: string | null;
  idCategoria: string | null;
  descricaoSistema: string;
};

const fmtDate = (iso: string) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

function parseOfxDate(raw: string): string {
  const m = raw.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!m) return "";
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function parseOfx(content: string) {
  const txs: Omit<Tx, "duplicado" | "match" | "criar" | "idPessoa" | "idCategoria" | "descricaoSistema">[] = [];
  const blockRe = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
  const getTag = (block: string, tag: string) => {
    const re = new RegExp(`<${tag}>([^<\\r\\n]*)`, "i");
    const m = block.match(re);
    return m ? m[1].trim() : "";
  };
  let match: RegExpExecArray | null;
  while ((match = blockRe.exec(content)) !== null) {
    const block = match[1];
    const fitid = getTag(block, "FITID");
    const data = parseOfxDate(getTag(block, "DTPOSTED"));
    const valor = parseFloat(getTag(block, "TRNAMT").replace(",", "."));
    const memo = getTag(block, "MEMO") || getTag(block, "NAME");
    if (!fitid || !data || isNaN(valor)) continue;
    txs.push({ fitid, data, descricao: memo, valor });
  }
  return txs;
}

function ExtratoBancarioPage() {
  const { profile, selectedLojaId } = useAuth();
  const isGlobal = profile?.role === "administrador" || profile?.role === "master";
  const inputRef = useRef<HTMLInputElement>(null);

  const [setupOpen, setSetupOpen] = useState(false);
  const [lojaId, setLojaId] = useState<string>(
    isGlobal ? (selectedLojaId ?? "") : (profile?.id_loja ?? ""),
  );
  const [contaId, setContaId] = useState<string>("");
  const [confirmado, setConfirmado] = useState(false);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<Tx[]>([]);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (isGlobal && selectedLojaId) setLojaId(selectedLojaId);
  }, [selectedLojaId, isGlobal]);

  const lojasQ = useQuery({
    queryKey: ["lojas_extrato"],
    enabled: isGlobal,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lojas")
        .select("id, nome_fantasia")
        .eq("ativa", true)
        .order("nome_fantasia");
      if (error) throw error;
      return (data ?? []) as Loja[];
    },
  });

  const contasQ = useQuery({
    queryKey: ["contas_extrato", lojaId],
    enabled: !!lojaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contas_bancarias")
        .select("id, id_loja, banco, agencia, conta")
        .eq("id_loja", lojaId)
        .eq("ativa", true)
        .order("banco");
      if (error) throw error;
      return (data ?? []) as Conta[];
    },
  });

  const fornecedoresQ = useQuery({
    queryKey: ["fornecedores_combo"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fornecedores")
        .select("id, nome")
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

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
    queryKey: ["cats_extrato"],
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

  const contas = contasQ.data ?? [];
  const contaLabel = (c: Conta) => `${c.banco} · Ag. ${c.agencia} / Cc. ${c.conta}`;
  const contaSel = contas.find((c) => c.id === contaId) ?? null;

  async function handleFile(file: File) {
    if (!/\.ofx$/i.test(file.name)) {
      toast.error("Envie um arquivo .ofx");
      return;
    }
    setFileName(file.name);
    try {
      const text = await file.text();
      const parsed = parseOfx(text);
      if (parsed.length === 0) {
        toast.warning("Nenhuma transação encontrada no arquivo.");
        setRows([]);
        return;
      }
      // Duplicidade por FITID
      const fitids = parsed.map((t) => t.fitid);
      const { data: existentes } = await supabase
        .from("extrato_lancamentos")
        .select("fitid")
        .eq("id_conta_bancaria", contaId)
        .in("fitid", fitids);
      const jaImportados = new Set((existentes ?? []).map((r) => r.fitid as string));

      // Candidatos para sugestão de correspondência
      const datas = parsed.map((t) => t.data).sort();
      const ini = datas[0];
      const fim = datas[datas.length - 1];
      const [pagar, receber, vendas] = await Promise.all([
        supabase
          .from("contas_pagar")
          .select("id, descricao, valor, data_vencimento")
          .eq("id_loja", lojaId)
          .eq("status", "aberto"),
        supabase
          .from("contas_receber")
          .select("id, descricao, valor, data_vencimento")
          .eq("id_loja", lojaId)
          .eq("status", "aberto"),
        supabase
          .from("vendas_ucase")
          .select("id, valor_liquido_previsto, data_prevista_recebimento, numero_venda")
          .eq("id_loja", lojaId)
          .eq("status_conciliacao", "pendente")
          .gte("data_prevista_recebimento", ini)
          .lte("data_prevista_recebimento", fim),
      ]);

      const diasEntre = (a: string, b: string) =>
        Math.abs(
          (new Date(a + "T00:00:00").getTime() - new Date(b + "T00:00:00").getTime()) /
            86400000,
        );

      const built: Tx[] = parsed.map((t) => {
        let match: Tx["match"] = null;
        const abs = Math.abs(t.valor);
        if (t.valor < 0) {
          const cand = (pagar.data ?? []).find(
            (c) =>
              Math.abs(Number(c.valor) - abs) <= 0.02 &&
              diasEntre(c.data_vencimento, t.data) <= 5,
          );
          if (cand)
            match = { tipo: "pagar", id: cand.id, label: `A pagar · ${cand.descricao}` };
        } else {
          const cr = (receber.data ?? []).find(
            (c) =>
              Math.abs(Number(c.valor) - abs) <= 0.02 &&
              diasEntre(c.data_vencimento, t.data) <= 5,
          );
          if (cr) match = { tipo: "receber", id: cr.id, label: `A receber · ${cr.descricao}` };
          if (!match) {
            const v = (vendas.data ?? []).find(
              (c) =>
                Math.abs(Number(c.valor_liquido_previsto) - abs) <= 0.02 &&
                c.data_prevista_recebimento &&
                diasEntre(c.data_prevista_recebimento, t.data) <= 5,
            );
            if (v)
              match = {
                tipo: "venda",
                id: v.id,
                label: `Venda ${v.numero_venda ?? ""}`.trim(),
              };
          }
        }
        return {
          ...t,
          duplicado: jaImportados.has(t.fitid),
          match,
          criar: !match,
          idPessoa: null,
          idCategoria: null,
          descricaoSistema: t.descricao,
        };
      });

      setRows(built);
      const novos = built.filter((r) => !r.duplicado).length;
      toast.success(`${parsed.length} transações lidas · ${novos} novas`);
    } catch (err) {
      console.error(err);
      toast.error("Falha ao ler o arquivo OFX.");
    }
  }

  const novos = useMemo(() => rows.filter((r) => !r.duplicado), [rows]);
  const dupCount = rows.length - novos.length;
  const classificados = novos.filter((r) => r.match || r.idCategoria).length;

  const update = (fitid: string, patch: Partial<Tx>) =>
    setRows((prev) => prev.map((r) => (r.fitid === fitid ? { ...r, ...patch } : r)));

  async function importar() {
    if (!lojaId || !contaId) return toast.error("Selecione loja e conta bancária.");
    if (novos.length === 0) return toast.error("Não há transações novas para importar.");
    setImporting(true);
    try {
      const { data: imp, error: impErr } = await supabase
        .from("importacoes_extrato")
        .insert({
          id_loja: lojaId,
          id_conta_bancaria: contaId,
          nome_arquivo: fileName,
          total_lancamentos: novos.length,
          importado_por: profile?.id ?? null,
        })
        .select("id")
        .single();
      if (impErr) throw impErr;

      const payload = novos.map((r) => ({
        id_loja: lojaId,
        id_conta_bancaria: contaId,
        id_importacao: imp.id,
        data_lancamento: r.data,
        descricao: r.descricao,
        valor: r.valor,
        fitid: r.fitid,
        id_categoria: r.idCategoria,
        id_fornecedor: r.valor < 0 ? r.idPessoa : null,
        id_cliente: r.valor >= 0 ? r.idPessoa : null,
        classificado: !!(r.match || r.idCategoria),
        conciliado: !!r.match,
      }));

      const { data: inseridos, error } = await supabase
        .from("extrato_lancamentos")
        .insert(payload)
        .select("id, fitid, valor");
      if (error) throw error;

      const idPorFitid = new Map((inseridos ?? []).map((r) => [r.fitid as string, r.id as string]));

      // Baixa dos títulos correspondentes e criação dos lançamentos novos
      for (const r of novos) {
        const idExtrato = idPorFitid.get(r.fitid) ?? null;
        if (r.match) {
          if (r.match.tipo === "pagar") {
            await supabase
              .from("contas_pagar")
              .update({
                status: "pago",
                data_pagamento: r.data,
                id_conta_bancaria: contaId,
                id_extrato_lancamento: idExtrato,
              })
              .eq("id", r.match.id);
          } else if (r.match.tipo === "receber") {
            await supabase
              .from("contas_receber")
              .update({
                status: "recebido",
                data_recebimento: r.data,
                valor_recebido: Math.abs(r.valor),
                id_conta_bancaria: contaId,
                id_extrato_lancamento: idExtrato,
              })
              .eq("id", r.match.id);
          } else {
            await supabase
              .from("vendas_ucase")
              .update({ status_conciliacao: "conciliado" })
              .eq("id", r.match.id);
          }
        } else if (r.idCategoria) {
          await supabase.from("movimentacoes").insert({
            id_loja: lojaId,
            tipo: r.valor < 0 ? "despesa" : "venda",
            data_movimento: r.data,
            descricao: r.descricaoSistema || r.descricao,
            valor: Math.abs(r.valor),
            id_categoria: r.idCategoria,
            id_conta_bancaria: contaId,
            id_fornecedor: r.valor < 0 ? r.idPessoa : null,
            id_cliente: r.valor >= 0 ? r.idPessoa : null,
            liquidado: true,
            data_liquidacao: r.data,
            status_conciliacao: "conciliado",
            id_extrato_lancamento: idExtrato,
            criado_por: profile?.id ?? null,
          });
        }
      }

      toast.success(
        `${novos.length} lançamentos importados · ${dupCount} ignorados por duplicidade`,
      );
      setRows([]);
      setFileName("");
      setConfirmado(false);
      if (inputRef.current) inputRef.current.value = "";
    } catch (err) {
      toast.error(friendlyDbError(err, "Erro ao importar extrato."));
    } finally {
      setImporting(false);
    }
  }

  return (
    <AppLayout>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Extrato Bancário</h1>
          <p className="text-sm text-muted-foreground">
            Importe o arquivo OFX e classifique cada lançamento do banco.
          </p>
        </div>
        <Button size="sm" onClick={() => setSetupOpen(true)}>
          <Upload className="h-4 w-4" />
          Importar arquivo
        </Button>
      </div>

      {confirmado && contaSel && (
        <div className="mt-5 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          <span className="font-medium">{contaLabel(contaSel)}</span>
          {fileName && (
            <span className="flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs">
              <FileText className="h-3.5 w-3.5" />
              {fileName}
              <button
                className="ml-1 text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setRows([]);
                  setFileName("");
                }}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          )}
          {rows.length === 0 && (
            <Button
              size="sm"
              variant="outline"
              className="ml-auto"
              onClick={() => inputRef.current?.click()}
            >
              Selecionar arquivo .ofx
            </Button>
          )}
          <input
            ref={inputRef}
            type="file"
            accept=".ofx"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
        </div>
      )}

      {rows.length > 0 && (
        <>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3">
            <div className="text-sm">
              <span className="font-medium">{rows.length}</span> transações ·{" "}
              <span className="font-medium text-emerald-600">{novos.length} novas</span> ·{" "}
              <span className="text-muted-foreground">{dupCount} já importadas</span> ·{" "}
              <span className="text-muted-foreground">{classificados} classificadas</span>
            </div>
            <Button onClick={importar} disabled={importing || novos.length === 0}>
              {importing ? "Importando…" : `Importar ${novos.length} lançamentos`}
            </Button>
          </div>

          <div className="mt-4 grid grid-cols-[1fr_1fr] gap-px overflow-hidden rounded-lg border border-border bg-border">
            <div className="bg-muted/50 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Lançamento do banco
            </div>
            <div className="bg-muted/50 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Lançamento no sistema
            </div>
            {rows.map((r) => {
              const saida = r.valor < 0;
              const pessoas = saida ? (fornecedoresQ.data ?? []) : (clientesQ.data ?? []);
              const cats = (catsQ.data ?? []).filter((c) =>
                saida
                  ? c.dre_grupos?.natureza === "despesa"
                  : c.dre_grupos?.natureza === "receita",
              );
              return (
                <div key={r.fitid} className="contents">
                  <div
                    className={`bg-card p-4 ${r.duplicado ? "opacity-50" : ""}`}
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-mono text-xs text-muted-foreground">
                        {fmtDate(r.data)}
                      </span>
                      <span
                        className={`font-mono text-sm font-semibold ${
                          saida
                            ? "text-rose-600 dark:text-rose-400"
                            : "text-emerald-600 dark:text-emerald-400"
                        }`}
                      >
                        {fmtBRL(r.valor)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm">{r.descricao}</p>
                    {r.duplicado && (
                      <span className="mt-2 inline-flex rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                        Já importado
                      </span>
                    )}
                  </div>
                  <div className="bg-card p-4">
                    {r.duplicado ? (
                      <p className="text-xs text-muted-foreground">
                        Ignorado nesta importação.
                      </p>
                    ) : r.match ? (
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                        <div className="text-sm">
                          <div className="font-medium">{r.match.label}</div>
                          <button
                            className="text-xs text-muted-foreground underline"
                            onClick={() => update(r.fitid, { match: null, criar: true })}
                          >
                            Não é este — classificar manualmente
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="grid gap-2">
                        <div className="grid gap-1">
                          <Label className="text-xs">
                            {saida ? "Fornecedor" : "Cliente"}
                          </Label>
                          <EntityCombobox
                            options={pessoas.map((p) => ({ value: p.id, label: p.nome }))}
                            value={r.idPessoa}
                            onChange={(v) => update(r.fitid, { idPessoa: v })}
                            placeholder="Digite para filtrar"
                          />
                        </div>
                        <div className="grid gap-1">
                          <Label className="text-xs">Categoria</Label>
                          <EntityCombobox
                            options={cats.map((c) => ({
                              value: c.id,
                              label: c.nome,
                              hint: c.dre_grupos?.nome,
                            }))}
                            value={r.idCategoria}
                            onChange={(v) => update(r.fitid, { idCategoria: v })}
                            placeholder="Selecione a categoria"
                          />
                        </div>
                        <div className="grid gap-1">
                          <Label className="text-xs">Descrição</Label>
                          <Input
                            value={r.descricaoSistema}
                            onChange={(e) =>
                              update(r.fitid, { descricaoSistema: e.target.value })
                            }
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {!confirmado && rows.length === 0 && (
        <div className="mt-6 rounded-lg border border-dashed border-border bg-card p-10 text-center">
          <Upload className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">Nenhum arquivo importado</p>
          <p className="text-xs text-muted-foreground">
            Clique em “Importar arquivo” para escolher a loja, a conta e o arquivo OFX.
          </p>
        </div>
      )}

      <Dialog open={setupOpen} onOpenChange={setSetupOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Importar extrato</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            {isGlobal && (
              <div className="grid gap-2">
                <Label>Loja</Label>
                <Select
                  value={lojaId}
                  onValueChange={(v) => {
                    setLojaId(v);
                    setContaId("");
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a loja" />
                  </SelectTrigger>
                  <SelectContent>
                    {(lojasQ.data ?? []).map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.nome_fantasia}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid gap-2">
              <Label>Conta bancária</Label>
              <Select value={contaId} onValueChange={setContaId} disabled={!lojaId}>
                <SelectTrigger>
                  <SelectValue
                    placeholder={lojaId ? "Selecione a conta" : "Escolha a loja primeiro"}
                  />
                </SelectTrigger>
                <SelectContent>
                  {contas.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {contaLabel(c)}
                    </SelectItem>
                  ))}
                  {contas.length === 0 && lojaId && (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">
                      Nenhuma conta ativa nesta loja
                    </div>
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                As contas são carregadas conforme a loja escolhida.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSetupOpen(false)}>
              Cancelar
            </Button>
            <Button
              disabled={!lojaId || !contaId}
              onClick={() => {
                setConfirmado(true);
                setSetupOpen(false);
                setRows([]);
                setFileName("");
                setTimeout(() => inputRef.current?.click(), 150);
              }}
            >
              Escolher arquivo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
