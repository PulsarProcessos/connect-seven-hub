import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { Upload, X, FileSpreadsheet, Building2 } from "lucide-react";
import { toast } from "sonner";
import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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

export const Route = createFileRoute("/_authenticated/vendas")({
  head: () => ({
    meta: [
      { title: "Importar Vendas Ucase · Connect 7" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ImportarVendasPage,
});

type Financeira = {
  id: string;
  nome: string;
  taxa_padrao: number;
  prazo_recebimento_dias: number;
  ativa: boolean;
};

type Loja = { id: string; nome_fantasia: string };

type Cartao = {
  id: string;
  nome: string;
  taxa_padrao: number;
  prazo_recebimento_dias: number;
  ativa: boolean;
};

type MeioPagamento = "cartao" | "financeira" | "a_vista";

type Row = {
  selected: boolean;
  data_venda: string; // yyyy-mm-dd
  meio_pagamento: MeioPagamento;
  id_financeira: string | null;
  id_cartao: string | null;
  valor_bruto: number;
  originalFinanceira?: string;
  numero_venda?: string | null;
  qtde_parcelas?: number | null;
};

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function formatBRL(v: number): string {
  if (!Number.isFinite(v)) return "—";
  return BRL.format(v);
}

function formatBRDate(iso: string): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

const DATA_KEYS = ["data", "data venda", "data da venda", "dt venda", "dt", "date"];
const FIN_KEYS = [
  "forma pgto",
  "forma pagamento",
  "forma de pagamento",
  "financeira",
  "bandeira",
  "adquirente",
  "operadora",
  "credenciadora",
];
// IMPORTANTE: "valor pgto" vem antes de "total" — numa venda dividida em várias
// formas de pagamento, a coluna TOTAL repete o valor cheio em cada linha e
// inflaria o faturamento. O valor correto da linha é o do pagamento.
const VAL_KEYS = [
  "valor pgto",
  "valor pagamento",
  "valor bruto",
  "vlr bruto",
  "bruto",
  "valor",
  "vlr",
  "valor total",
  "total",
  "vl bruto",
];
const VENDA_KEYS = ["venda", "n venda", "numero venda", "nº venda", "pedido", "cupom"];
const PARC_KEYS = ["qtde. parcelas", "qtde parcelas", "parcelas", "qtd parcelas"];

// Formas de pagamento à vista: recebidas na hora, sem taxa nem previsão.
const A_VISTA_KEYS = ["dinheiro", "pix", "vale", "especie", "espécie"];

function isAVista(forma: string): boolean {
  const n = normalize(forma);
  return A_VISTA_KEYS.some((k) => n.includes(normalize(k)));
}

// "CARTÃO (MASTERCARD)" → "MASTERCARD" ; usado para casar com a tabela cartoes
function extrairBandeira(forma: string): string | null {
  const n = normalize(forma);
  if (!n.includes("cartao") && !n.includes("credito") && !n.includes("debito")) return null;
  const m = forma.match(/\(([^)]+)\)/);
  return m ? m[1].trim() : forma.trim();
}

function detectColumns(headers: string[]) {
  const norm = headers.map((h) => normalize(h));
  const find = (keys: string[]) => {
    // 1) match exato, respeitando a ordem de prioridade das chaves
    for (const k of keys) {
      const i = norm.indexOf(normalize(k));
      if (i >= 0) return i;
    }
    // 2) match parcial — percorre por PRIORIDADE DE CHAVE, não por posição da
    //    coluna. Sem isso, "TOTAL R$" (coluna anterior) venceria
    //    "VALOR PGTO R$", que é o valor correto da linha.
    for (const k of keys) {
      const kn = normalize(k);
      const i = norm.findIndex((h) => h.includes(kn));
      if (i >= 0) return i;
    }
    return -1;
  };
  return {
    data: find(DATA_KEYS),
    financeira: find(FIN_KEYS),
    valor: find(VAL_KEYS),
    venda: find(VENDA_KEYS),
    parcelas: find(PARC_KEYS),
  };
}

function parseDateCell(v: unknown): string | null {
  if (v == null || v === "") return null;
  // Excel serial number
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  const s = String(v).trim();
  // dd/mm/yyyy or dd-mm-yyyy
  const br = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (br) {
    let [, d, m, y] = br;
    if (y.length === 2) y = `20${y}`;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  // yyyy-mm-dd
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dt = new Date(s);
  if (!isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
  return null;
}

function parseValorCell(v: unknown): number {
  if (v == null || v === "") return NaN;
  if (typeof v === "number") return v;
  let s = String(v).trim().replace(/[R$\s]/gi, "");
  // handle both "1.234,56" and "1234.56"
  if (s.includes(",") && s.includes(".")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function matchByNome<T extends { id: string; nome: string }>(
  raw: string,
  list: T[],
): string | null {
  const n = normalize(raw);
  if (!n) return null;
  const exact = list.find((f) => normalize(f.nome) === n);
  if (exact) return exact.id;
  const contains = list.find(
    (f) => normalize(f.nome).includes(n) || n.includes(normalize(f.nome)),
  );
  return contains?.id ?? null;
}

function ImportarVendasPage() {
  const { profile, selectedLojaId } = useAuth();
  const [financeiras, setFinanceiras] = useState<Financeira[]>([]);
  const [cartoes, setCartoes] = useState<Cartao[]>([]);
  const [lojas, setLojas] = useState<Loja[]>([]);
  const [targetLoja, setTargetLoja] = useState<string>("");
  const [fileName, setFileName] = useState<string>("");
  const [rows, setRows] = useState<Row[]>([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const isAdmin = profile?.role === "administrador";
  const finById = useMemo(
    () => Object.fromEntries(financeiras.map((f) => [f.id, f])),
    [financeiras],
  );

  useEffect(() => {
    (async () => {
      const [{ data: fins }, { data: cds }, { data: lj }] = await Promise.all([
        supabase
          .from("financeiras")
          .select("id, nome, taxa_padrao, prazo_recebimento_dias, ativa")
          .eq("ativa", true)
          .order("nome"),
        supabase
          .from("cartoes")
          .select("id, nome, taxa_padrao, prazo_recebimento_dias, ativa")
          .eq("ativa", true)
          .order("nome"),
        supabase.from("lojas").select("id, nome_fantasia").eq("ativa", true).order("nome_fantasia"),
      ]);
      setFinanceiras((fins ?? []) as Financeira[]);
      setCartoes((cds ?? []) as Cartao[]);
      setLojas((lj ?? []) as Loja[]);
      if (!isAdmin && profile?.id_loja) setTargetLoja(profile.id_loja);
    })();
  }, [profile?.id_loja, isAdmin]);

  // O seletor do topo manda: ao escolher uma unidade lá (ou clicar num bloco
  // da Visão Geral), esta tela passa a importar para aquela loja.
  // Em "Todas as unidades" o destino fica em aberto, e a tela pede a escolha.
  useEffect(() => {
    if (isAdmin) setTargetLoja(selectedLojaId ?? "");
  }, [selectedLojaId, isAdmin]);

  const buildRows = (
    data: unknown[][],
    headers: string[],
    fins: Financeira[],
    cds: Cartao[],
  ) => {
    const cols = detectColumns(headers);
    if (cols.data < 0 || cols.financeira < 0 || cols.valor < 0) {
      toast.error(
        "Não foi possível identificar todas as colunas. Verifique cabeçalhos: data, forma de pagamento e valor.",
      );
      return [];
    }
    const built: Row[] = [];
    for (const raw of data) {
      if (!raw || raw.every((c) => c == null || c === "")) continue;
      const dataStr = parseDateCell(raw[cols.data]);
      const val = parseValorCell(raw[cols.valor]);
      const finRaw = raw[cols.financeira] == null ? "" : String(raw[cols.financeira]);
      if (!dataStr || !Number.isFinite(val)) continue;

      // Classifica o meio de pagamento a partir do texto da planilha
      let meio: MeioPagamento;
      let idFin: string | null = null;
      let idCartao: string | null = null;

      if (isAVista(finRaw)) {
        meio = "a_vista";
      } else {
        const bandeira = extrairBandeira(finRaw);
        if (bandeira) {
          meio = "cartao";
          idCartao = matchByNome(bandeira, cds);
        } else {
          meio = "financeira";
          idFin = matchByNome(finRaw, fins);
        }
      }

      const numVenda =
        cols.venda >= 0 && raw[cols.venda] != null ? String(raw[cols.venda]).trim() : null;
      const parc =
        cols.parcelas >= 0 && raw[cols.parcelas] != null
          ? Number(String(raw[cols.parcelas]).replace(/\D/g, "")) || null
          : null;

      built.push({
        selected: true,
        data_venda: dataStr,
        meio_pagamento: meio,
        id_financeira: idFin,
        id_cartao: idCartao,
        valor_bruto: Math.round(val * 100) / 100,
        originalFinanceira: finRaw,
        numero_venda: numVenda,
        qtde_parcelas: parc,
      });
    }
    return built;
  };

  const handleFile = async (file: File) => {
    setFileName(file.name);
    setRows([]);
    const ext = file.name.split(".").pop()?.toLowerCase();
    try {
      if (ext === "csv") {
        Papa.parse<string[]>(file, {
          skipEmptyLines: true,
          complete: (res) => {
            const arr = res.data as string[][];
            if (arr.length < 2) return toast.error("Arquivo vazio");
            const headers = arr[0].map((h) => String(h ?? ""));
            const built = buildRows(arr.slice(1), headers, financeiras, cartoes);
            setRows(built);
            if (built.length) toast.success(`${built.length} linha(s) lida(s)`);
          },
          error: (err) => toast.error(`Erro CSV: ${err.message}`),
        });
      } else if (ext === "xlsx" || ext === "xls") {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array", cellDates: false });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const arr = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
          header: 1,
          blankrows: false,
          raw: true,
        });
        if (arr.length < 2) return toast.error("Arquivo vazio");
        const headers = (arr[0] as unknown[]).map((h) => String(h ?? ""));
        const built = buildRows(arr.slice(1) as unknown[][], headers, financeiras, cartoes);
        setRows(built);
        if (built.length) toast.success(`${built.length} linha(s) lida(s)`);
      } else {
        toast.error("Formato não suportado. Use .csv, .xlsx ou .xls");
      }
    } catch (e) {
      toast.error(`Falha ao ler arquivo: ${(e as Error).message}`);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const updateRow = (idx: number, patch: Partial<Row>) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const selectedCount = rows.filter((r) => r.selected).length;

  const importar = async () => {
    if (!profile) return;
    const loja = targetLoja || profile.id_loja;
    if (!loja) return toast.error("Selecione a loja-alvo");
    const toImport = rows.filter((r) => r.selected);
    if (toImport.length === 0) return toast.error("Selecione ao menos uma linha");
    const semRef = toImport.filter(
      (r) =>
        (r.meio_pagamento === "financeira" && !r.id_financeira) ||
        (r.meio_pagamento === "cartao" && !r.id_cartao),
    );
    if (semRef.length > 0)
      return toast.error(
        `${semRef.length} linha(s) sem financeira/cartão definido. Ajuste antes de importar.`,
      );

    setImporting(true);
    setProgress(0);

    const { data: imp, error: impErr } = await supabase
      .from("importacoes_ucase")
      .insert({
        id_loja: loja,
        nome_arquivo: fileName,
        total_registros: toImport.length,
        importado_por: profile.id,
      })
      .select("id")
      .single();

    if (impErr || !imp) {
      setImporting(false);
      return toast.error(`Erro ao registrar importação: ${impErr?.message}`);
    }

    // insert in batches to show progress
    const BATCH = 200;
    let inserted = 0;
    for (let i = 0; i < toImport.length; i += BATCH) {
      const slice = toImport.slice(i, i + BATCH).map((r) => ({
        id_loja: loja,
        meio_pagamento: r.meio_pagamento,
        id_financeira: r.meio_pagamento === "financeira" ? r.id_financeira : null,
        id_cartao: r.meio_pagamento === "cartao" ? r.id_cartao : null,
        forma_pagamento_origem: r.originalFinanceira ?? null,
        numero_venda: r.numero_venda ?? null,
        qtde_parcelas: r.qtde_parcelas ?? null,
        id_importacao: imp.id,
        data_venda: r.data_venda,
        valor_bruto: r.valor_bruto,
      }));
      const { error } = await supabase.from("vendas_ucase").insert(slice);
      if (error) {
        setImporting(false);
        return toast.error(`Erro ao importar: ${error.message}`);
      }
      inserted += slice.length;
      setProgress(Math.round((inserted / toImport.length) * 100));
    }

    setImporting(false);
    setProgress(0);
    setRows([]);
    setFileName("");
    toast.success(`${inserted} venda(s) importada(s) com sucesso`);
  };

  if (profile && profile.role === "master") {
    return (
      <AppLayout>
        <p className="text-sm text-muted-foreground">Acesso restrito.</p>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Importar Vendas Ucase</h1>
          <p className="text-sm text-muted-foreground">
            Envie o arquivo exportado da adquirente (.csv, .xlsx, .xls) e revise antes de importar.
          </p>
        </div>
      </div>

      {isAdmin &&
        (selectedLojaId ? (
          <div className="mt-6 flex max-w-md items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2">
            <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <div className="text-xs text-muted-foreground">Importando para</div>
              <div className="truncate text-sm font-medium">
                {lojas.find((l) => l.id === selectedLojaId)?.nome_fantasia ?? "Unidade"}
              </div>
            </div>
            <span className="ml-auto shrink-0 text-xs text-muted-foreground">
              troque no seletor do topo
            </span>
          </div>
        ) : (
          <div className="mt-6 grid max-w-md gap-2">
            <Label>Loja de destino</Label>
            <Select value={targetLoja} onValueChange={setTargetLoja}>
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
            <p className="text-xs text-muted-foreground">
              Você está em “Todas as unidades”. A importação precisa de uma loja
              específica — escolha aqui ou no seletor do topo.
            </p>
          </div>
        ))}

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`mt-6 flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-10 text-center transition ${
          dragActive
            ? "border-primary bg-primary/5"
            : "border-border bg-card hover:border-primary/50"
        }`}
      >
        <Upload className="h-8 w-8 text-muted-foreground" />
        <p className="mt-3 text-sm font-medium">
          Arraste o arquivo ou <span className="text-primary">clique para selecionar</span>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">.csv, .xlsx, .xls</p>
        <Input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.currentTarget.value = "";
          }}
        />
      </div>

      {fileName && (
        <div className="mt-4 flex items-center justify-between rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-primary" />
            <span className="font-medium">{fileName}</span>
            <span className="text-muted-foreground">
              — {rows.length} linha(s), {selectedCount} selecionada(s)
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setRows([]);
              setFileName("");
            }}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {rows.length > 0 && (
        <>
          <div className="mt-4 rounded-lg border border-border bg-card">
            <div className="max-h-[520px] overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-card">
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={rows.every((r) => r.selected)}
                        onCheckedChange={(v) =>
                          setRows((prev) => prev.map((r) => ({ ...r, selected: !!v })))
                        }
                      />
                    </TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Forma / Origem</TableHead>
                    <TableHead className="text-right">Valor bruto</TableHead>
                    <TableHead className="text-right">Líq. previsto</TableHead>
                    <TableHead>Prev. recebimento</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r, i) => {
                    const aVista = r.meio_pagamento === "a_vista";
                    const isCartao = r.meio_pagamento === "cartao";
                    const ref = isCartao
                      ? cartoes.find((c) => c.id === r.id_cartao)
                      : r.id_financeira
                        ? finById[r.id_financeira]
                        : null;
                    const pendente = !aVista && !ref;
                    const liq = aVista
                      ? r.valor_bruto
                      : ref
                        ? Math.round(
                            (r.valor_bruto - (r.valor_bruto * Number(ref.taxa_padrao)) / 100) * 100,
                          ) / 100
                        : NaN;
                    const prev = aVista
                      ? r.data_venda
                      : ref
                        ? addDays(r.data_venda, ref.prazo_recebimento_dias)
                        : "";
                    return (
                      <TableRow key={i} className={pendente ? "bg-amber-50/40" : ""}>
                        <TableCell>
                          <Checkbox
                            checked={r.selected}
                            onCheckedChange={(v) => updateRow(i, { selected: !!v })}
                          />
                        </TableCell>
                        <TableCell className="font-mono text-xs">{formatBRDate(r.data_venda)}</TableCell>
                        <TableCell>
                          {aVista ? (
                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                                À vista
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {r.originalFinanceira}
                              </span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span
                                className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                  isCartao
                                    ? "bg-sky-100 text-sky-700"
                                    : "bg-primary/10 text-primary"
                                }`}
                              >
                                {isCartao ? "Cartão" : "Financeira"}
                              </span>
                              <Select
                                value={(isCartao ? r.id_cartao : r.id_financeira) ?? ""}
                                onValueChange={(v) =>
                                  updateRow(i, isCartao ? { id_cartao: v } : { id_financeira: v })
                                }
                              >
                                <SelectTrigger className="h-8 min-w-[170px]">
                                  <SelectValue
                                    placeholder={
                                      r.originalFinanceira
                                        ? `? ${r.originalFinanceira}`
                                        : "Selecione"
                                    }
                                  />
                                </SelectTrigger>
                                <SelectContent>
                                  {(isCartao ? cartoes : financeiras).map((f) => (
                                    <SelectItem key={f.id} value={f.id}>
                                      {f.nome}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {formatBRL(r.valor_bruto)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm text-muted-foreground">
                          {Number.isFinite(liq) ? formatBRL(liq) : "—"}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {prev ? formatBRDate(prev) : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              {selectedCount} de {rows.length} selecionada(s)
            </div>
            <div className="flex items-center gap-3">
              {importing && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <div className="h-2 w-40 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  {progress}%
                </div>
              )}
              <Button onClick={importar} disabled={importing || selectedCount === 0}>
                {importing ? "Importando…" : `Importar ${selectedCount} selecionado(s)`}
              </Button>
            </div>
          </div>
        </>
      )}
    </AppLayout>
  );
}
