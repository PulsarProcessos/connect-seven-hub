import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Upload, X, FileText } from "lucide-react";
import { toast } from "sonner";
import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
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

export const Route = createFileRoute("/_authenticated/extrato")({
  head: () => ({
    meta: [
      { title: "Importar Extrato Bancário · Connect 7" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ImportarExtratoPage,
});

type Loja = { id: string; nome_fantasia: string };
type Conta = { id: string; id_loja: string; banco: string; agencia: string; conta: string; ativa: boolean };

type Tx = {
  fitid: string;
  data: string; // yyyy-mm-dd
  descricao: string;
  valor: number;
  duplicado: boolean;
};

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function formatDateBR(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function parseOfxDate(raw: string): string {
  // OFX date: YYYYMMDD[HHMMSS[.XXX]][TZ]
  const m = raw.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!m) return "";
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function parseOfx(content: string): Tx[] {
  // Normalize: strip SGML-style unclosed tags to XML-ish by closing them
  // Simple approach: extract STMTTRN blocks via regex
  const txs: Tx[] = [];
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
    const dtRaw = getTag(block, "DTPOSTED");
    const amt = getTag(block, "TRNAMT");
    const memo = getTag(block, "MEMO") || getTag(block, "NAME");
    const data = parseOfxDate(dtRaw);
    const valor = parseFloat(amt.replace(",", "."));
    if (!fitid || !data || isNaN(valor)) continue;
    txs.push({ fitid, data, descricao: memo, valor, duplicado: false });
  }
  return txs;
}

function ImportarExtratoPage() {
  const { profile, selectedLojaId } = useAuth();
  const isAdmin = profile?.role === "administrador";
  const inputRef = useRef<HTMLInputElement>(null);

  const [lojas, setLojas] = useState<Loja[]>([]);
  const [contas, setContas] = useState<Conta[]>([]);
  const [targetLoja, setTargetLoja] = useState<string>("");
  const [targetConta, setTargetConta] = useState<string>("");
  const [fileName, setFileName] = useState<string>("");
  const [rows, setRows] = useState<Tx[]>([]);
  const [importing, setImporting] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const lojaId = isAdmin ? (targetLoja || selectedLojaId || "") : (profile?.id_loja ?? "");

  useEffect(() => {
    (async () => {
      if (isAdmin) {
        const { data } = await supabase.from("lojas").select("id, nome_fantasia").eq("ativa", true).order("nome_fantasia");
        setLojas((data ?? []) as Loja[]);
      }
    })();
  }, [isAdmin]);

  useEffect(() => {
    (async () => {
      if (!lojaId) { setContas([]); return; }
      const { data } = await supabase
        .from("contas_bancarias")
        .select("id, id_loja, banco, agencia, conta, ativa")
        .eq("id_loja", lojaId)
        .eq("ativa", true)
        .order("banco");
      setContas((data ?? []) as Conta[]);
    })();
    setTargetConta("");
    setRows([]);
    setFileName("");
  }, [lojaId]);

  async function markDuplicates(txs: Tx[], contaId: string): Promise<Tx[]> {
    if (!contaId || txs.length === 0) return txs;
    const fitids = txs.map((t) => t.fitid);
    const { data } = await supabase
      .from("extrato_lancamentos")
      .select("fitid")
      .eq("id_conta_bancaria", contaId)
      .in("fitid", fitids);
    const existing = new Set((data ?? []).map((r) => r.fitid as string));
    return txs.map((t) => ({ ...t, duplicado: existing.has(t.fitid) }));
  }

  async function handleFile(file: File) {
    if (!targetConta) {
      toast.error("Selecione a conta bancária de destino antes de enviar o arquivo.");
      return;
    }
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
      const marked = await markDuplicates(parsed, targetConta);
      setRows(marked);
      const novos = marked.filter((r) => !r.duplicado).length;
      toast.success(`${parsed.length} transações lidas · ${novos} novas`);
    } catch (err) {
      console.error(err);
      toast.error("Falha ao ler o arquivo OFX.");
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  const novosCount = useMemo(() => rows.filter((r) => !r.duplicado).length, [rows]);
  const dupCount = rows.length - novosCount;

  async function handleImport() {
    if (!lojaId) { toast.error("Selecione a loja."); return; }
    if (!targetConta) { toast.error("Selecione a conta bancária."); return; }
    const novos = rows.filter((r) => !r.duplicado);
    if (novos.length === 0) { toast.error("Não há transações novas para importar."); return; }

    setImporting(true);
    try {
      const { data: imp, error: impErr } = await supabase
        .from("importacoes_extrato")
        .insert({
          id_loja: lojaId,
          id_conta_bancaria: targetConta,
          nome_arquivo: fileName,
          total_lancamentos: novos.length,
          importado_por: profile?.id ?? null,
        })
        .select("id")
        .single();
      if (impErr) throw impErr;

      const payload = novos.map((r) => ({
        id_loja: lojaId,
        id_conta_bancaria: targetConta,
        id_importacao: imp.id,
        data_lancamento: r.data,
        descricao: r.descricao,
        valor: r.valor,
        fitid: r.fitid,
      }));

      const batchSize = 300;
      for (let i = 0; i < payload.length; i += batchSize) {
        const slice = payload.slice(i, i + batchSize);
        const { error } = await supabase.from("extrato_lancamentos").insert(slice);
        if (error) throw error;
      }

      toast.success(`${novos.length} lançamentos importados · ${dupCount} ignorados por duplicidade`);
      setRows([]);
      setFileName("");
      if (inputRef.current) inputRef.current.value = "";
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message ?? "Erro ao importar extrato.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <AppLayout>
      <div className="mx-auto max-w-6xl space-y-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">Importar Extrato Bancário</h1>
          <p className="text-sm text-muted-foreground">Envie um arquivo OFX para registrar os lançamentos na conta selecionada.</p>
        </header>

        <div className="rounded-lg border bg-card p-5">
          <div className="grid gap-4 md:grid-cols-2">
            {isAdmin && (
              <div className="space-y-2">
                <Label>Loja</Label>
                <Select value={targetLoja} onValueChange={setTargetLoja}>
                  <SelectTrigger><SelectValue placeholder="Selecione a loja" /></SelectTrigger>
                  <SelectContent>
                    {lojas.map((l) => (
                      <SelectItem key={l.id} value={l.id}>{l.nome_fantasia}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>Conta bancária</Label>
              <Select value={targetConta} onValueChange={setTargetConta} disabled={!lojaId}>
                <SelectTrigger><SelectValue placeholder={lojaId ? "Selecione a conta" : "Selecione uma loja primeiro"} /></SelectTrigger>
                <SelectContent>
                  {contas.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.banco} · Ag {c.agencia} · CC {c.conta}
                    </SelectItem>
                  ))}
                  {contas.length === 0 && lojaId && (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">Nenhuma conta ativa</div>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-10 text-center transition ${dragOver ? "border-primary bg-primary/5" : "border-border bg-card"}`}
        >
          <Upload className="mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium">Arraste um arquivo .ofx aqui</p>
          <p className="mb-4 text-xs text-muted-foreground">ou clique para selecionar</p>
          <input
            ref={inputRef}
            type="file"
            accept=".ofx"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
          <Button variant="outline" onClick={() => inputRef.current?.click()} disabled={!targetConta}>
            Selecionar arquivo
          </Button>
          {fileName && (
            <div className="mt-4 flex items-center gap-2 rounded-md bg-muted px-3 py-1.5 text-xs">
              <FileText className="h-3.5 w-3.5" />
              <span>{fileName}</span>
              <button className="ml-1 text-muted-foreground hover:text-foreground" onClick={() => { setRows([]); setFileName(""); if (inputRef.current) inputRef.current.value = ""; }}>
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>

        {rows.length > 0 && (
          <div className="rounded-lg border bg-card">
            <div className="flex items-center justify-between border-b px-5 py-3">
              <div className="text-sm">
                <span className="font-medium">{rows.length}</span> transações ·{" "}
                <span className="text-emerald-600 font-medium">{novosCount} novas</span> ·{" "}
                <span className="text-muted-foreground">{dupCount} já importadas</span>
              </div>
              <Button onClick={handleImport} disabled={importing || novosCount === 0}>
                {importing ? "Importando..." : `Importar ${novosCount} novos`}
              </Button>
            </div>
            <div className="max-h-[520px] overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-card">
                  <TableRow>
                    <TableHead className="w-28">Data</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="w-36 text-right">Valor</TableHead>
                    <TableHead className="w-28">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.fitid} className={r.duplicado ? "opacity-50" : ""}>
                      <TableCell className="font-mono text-xs">{formatDateBR(r.data)}</TableCell>
                      <TableCell className="text-sm">{r.descricao}</TableCell>
                      <TableCell className={`text-right font-mono text-xs ${r.valor < 0 ? "text-red-600" : "text-emerald-600"}`}>
                        {BRL.format(r.valor)}
                      </TableCell>
                      <TableCell>
                        {r.duplicado ? (
                          <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Já importado</span>
                        ) : (
                          <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">Novo</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
