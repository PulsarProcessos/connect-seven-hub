import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  CheckCircle2,
  RotateCcw,
  AlertTriangle,
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
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/_authenticated/contas-pagar")({
  head: () => ({
    meta: [
      { title: "Contas a Pagar · Connect 7" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ContasPagarPage,
});

type StatusCP = "aberto" | "pago" | "cancelado";

type Conta = {
  id: string;
  id_loja: string;
  descricao: string;
  fornecedor: string | null;
  id_categoria: string | null;
  valor: number;
  data_vencimento: string;
  data_pagamento: string | null;
  id_conta_bancaria: string | null;
  status: StatusCP;
  observacao: string | null;
};

type Categoria = { id: string; nome: string; id_grupo: string };
type Grupo = { id: string; nome: string };
type ContaBancaria = { id: string; banco: string; agencia: string; conta: string };

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const fmt = (v: unknown) => BRL.format(Number(v ?? 0) || 0);
const hoje = () => new Date().toISOString().slice(0, 10);

function fmtData(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

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

/** Períodos pré-definidos para o filtro rápido */
type Periodo = "hoje" | "semana" | "mes" | "ano" | "custom";

function rangeDoPeriodo(p: Periodo): { de: string; ate: string } {
  const now = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  if (p === "hoje") return { de: iso(now), ate: iso(now) };
  if (p === "semana") {
    const ini = new Date(now);
    ini.setDate(now.getDate() - now.getDay());
    const fim = new Date(ini);
    fim.setDate(ini.getDate() + 6);
    return { de: iso(ini), ate: iso(fim) };
  }
  if (p === "mes") {
    const ini = new Date(now.getFullYear(), now.getMonth(), 1);
    const fim = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { de: iso(ini), ate: iso(fim) };
  }
  if (p === "ano") {
    return { de: `${now.getFullYear()}-01-01`, ate: `${now.getFullYear()}-12-31` };
  }
  return { de: "", ate: "" };
}

function ContasPagarPage() {
  const { profile, lojas, selectedLojaId } = useAuth();
  const [rows, setRows] = useState<Conta[]>([]);
  const [cats, setCats] = useState<Categoria[]>([]);
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [contasBanc, setContasBanc] = useState<ContaBancaria[]>([]);
  const [loading, setLoading] = useState(true);
  const [dlg, setDlg] = useState(false);
  const [editing, setEditing] = useState<Conta | null>(null);

  const [busca, setBusca] = useState("");
  const [fStatus, setFStatus] = useState<string>("todos");
  const [fCat, setFCat] = useState<string>("todas");
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");

  const isGlobal = profile?.role === "administrador" || profile?.role === "master";
  const podeEditar = profile?.role !== "master";
  const lojaAtual = isGlobal ? selectedLojaId : (profile?.id_loja ?? null);

  useEffect(() => {
    const r = rangeDoPeriodo(periodo);
    if (periodo !== "custom") {
      setDe(r.de);
      setAte(r.ate);
    }
  }, [periodo]);

  const load = async () => {
    setLoading(true);
    let q = supabase
      .from("contas_pagar")
      .select(
        "id, id_loja, descricao, fornecedor, id_categoria, valor, data_vencimento, data_pagamento, id_conta_bancaria, status, observacao",
      )
      .order("data_vencimento");
    if (lojaAtual) q = q.eq("id_loja", lojaAtual);
    if (de) q = q.gte("data_vencimento", de);
    if (ate) q = q.lte("data_vencimento", ate);

    const [contasRes, catsRes, gruposRes, cbRes] = await Promise.all([
      q,
      supabase.from("dre_categorias").select("id, nome, id_grupo").order("nome"),
      supabase.from("dre_grupos").select("id, nome").order("ordem"),
      supabase
        .from("contas_bancarias")
        .select("id, banco, agencia, conta")
        .eq("ativa", true),
    ]);

    if (contasRes.error) toast.error("Erro ao carregar contas a pagar");
    else setRows((contasRes.data ?? []) as Conta[]);
    setCats((catsRes.data ?? []) as Categoria[]);
    setGrupos((gruposRes.data ?? []) as Grupo[]);
    setContasBanc((cbRes.data ?? []) as ContaBancaria[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lojaAtual, de, ate]);

  const catById = useMemo(
    () => Object.fromEntries(cats.map((c) => [c.id, c])),
    [cats],
  );
  const grupoById = useMemo(
    () => Object.fromEntries(grupos.map((g) => [g.id, g])),
    [grupos],
  );

  const filtered = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return rows.filter((r) => {
      if (fStatus !== "todos" && r.status !== fStatus) return false;
      if (fCat !== "todas" && r.id_categoria !== fCat) return false;
      if (!q) return true;
      return (
        r.descricao.toLowerCase().includes(q) ||
        (r.fornecedor ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, busca, fStatus, fCat]);

  const totais = useMemo(() => {
    const h = hoje();
    return filtered.reduce(
      (acc, r) => {
        const v = Number(r.valor ?? 0);
        if (r.status === "aberto") {
          acc.aberto += v;
          if (r.data_vencimento < h) acc.vencido += v;
        } else if (r.status === "pago") acc.pago += v;
        return acc;
      },
      { aberto: 0, vencido: 0, pago: 0 },
    );
  }, [filtered]);

  const marcarPago = async (c: Conta) => {
    const { error } = await supabase
      .from("contas_pagar")
      .update({ status: "pago" as StatusCP })
      .eq("id", c.id);
    if (error) return toast.error(error.message);
    toast.success("Marcada como paga");
    load();
  };

  const reabrir = async (c: Conta) => {
    const { error } = await supabase
      .from("contas_pagar")
      .update({ status: "aberto" as StatusCP })
      .eq("id", c.id);
    if (error) return toast.error(error.message);
    toast.success("Reaberta");
    load();
  };

  const remover = async (c: Conta) => {
    const { error } = await supabase.from("contas_pagar").delete().eq("id", c.id);
    if (error) return toast.error(error.message);
    toast.success("Removida");
    load();
  };

  return (
    <AppLayout>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Contas a Pagar</h1>
          <p className="text-sm text-muted-foreground">
            Pagamentos da empresa por vencimento, categoria e situação.
          </p>
        </div>
        {podeEditar && (
          <Button
            onClick={() => {
              setEditing(null);
              setDlg(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Nova conta
          </Button>
        )}
      </div>

      {/* Totais */}
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <CardTotal label="Em aberto" value={fmt(totais.aberto)} />
        <CardTotal label="Vencido" value={fmt(totais.vencido)} danger={totais.vencido > 0} />
        <CardTotal label="Pago no período" value={fmt(totais.pago)} ok />
      </div>

      {/* Filtros */}
      <div className="mt-6 flex flex-wrap items-end gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por descrição ou fornecedor…"
          />
        </div>

        <div className="grid gap-1">
          <Label className="text-xs">Período</Label>
          <Select value={periodo} onValueChange={(v) => setPeriodo(v as Periodo)}>
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="hoje">Hoje</SelectItem>
              <SelectItem value="semana">Esta semana</SelectItem>
              <SelectItem value="mes">Este mês</SelectItem>
              <SelectItem value="ano">Este ano</SelectItem>
              <SelectItem value="custom">Personalizado</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {periodo === "custom" && (
          <>
            <div className="grid gap-1">
              <Label className="text-xs">De</Label>
              <Input
                type="date"
                className="w-[150px]"
                value={de}
                onChange={(e) => setDe(e.target.value)}
              />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Até</Label>
              <Input
                type="date"
                className="w-[150px]"
                value={ate}
                onChange={(e) => setAte(e.target.value)}
              />
            </div>
          </>
        )}

        <div className="grid gap-1">
          <Label className="text-xs">Situação</Label>
          <Select value={fStatus} onValueChange={setFStatus}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas</SelectItem>
              <SelectItem value="aberto">Em aberto</SelectItem>
              <SelectItem value="pago">Pagas</SelectItem>
              <SelectItem value="cancelado">Canceladas</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-1">
          <Label className="text-xs">Categoria</Label>
          <Select value={fCat} onValueChange={setFCat}>
            <SelectTrigger className="w-[190px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas</SelectItem>
              {cats.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {grupoById[c.id_grupo]?.nome
                    ? `${grupoById[c.id_grupo].nome} › ${c.nome}`
                    : c.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vencimento</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Fornecedor</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead className="w-28 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                  Carregando…
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                  Nenhuma conta encontrada no período.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => {
                const vencida = r.status === "aberto" && r.data_vencimento < hoje();
                return (
                  <TableRow key={r.id} className={vencida ? "bg-destructive/5" : ""}>
                    <TableCell className="font-mono text-xs">
                      <div className="flex items-center gap-1">
                        {vencida && <AlertTriangle className="h-3 w-3 text-destructive" />}
                        {fmtData(r.data_vencimento)}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{r.descricao}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.fornecedor ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.id_categoria ? (catById[r.id_categoria]?.nome ?? "—") : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">{fmt(r.valor)}</TableCell>
                    <TableCell>
                      <StatusBadge status={r.status} vencida={vencida} />
                    </TableCell>
                    <TableCell className="text-right">
                      {podeEditar && (
                        <>
                          {r.status === "aberto" ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Marcar como paga"
                              onClick={() => marcarPago(r)}
                            >
                              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Reabrir"
                              onClick={() => reabrir(r)}
                            >
                              <RotateCcw className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setEditing(r);
                              setDlg(true);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => remover(r)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {!loading && filtered.length > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          {filtered.length} conta(s) no período
        </p>
      )}

      <ContaDialog
        open={dlg}
        onOpenChange={setDlg}
        editing={editing}
        cats={cats}
        grupoById={grupoById}
        contasBanc={contasBanc}
        lojaAtual={lojaAtual}
        lojas={lojas}
        isGlobal={isGlobal}
        onSaved={load}
      />
    </AppLayout>
  );
}

function CardTotal({
  label,
  value,
  danger,
  ok,
}: {
  label: string;
  value: string;
  danger?: boolean;
  ok?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={`mt-1 font-mono text-lg font-semibold ${
          danger ? "text-destructive" : ok ? "text-emerald-600" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function StatusBadge({ status, vencida }: { status: StatusCP; vencida: boolean }) {
  if (status === "pago")
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
        Paga
      </span>
    );
  if (status === "cancelado")
    return (
      <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
        Cancelada
      </span>
    );
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        vencida ? "bg-destructive/10 text-destructive" : "bg-amber-100 text-amber-700"
      }`}
    >
      {vencida ? "Vencida" : "Em aberto"}
    </span>
  );
}

function ContaDialog({
  open,
  onOpenChange,
  editing,
  cats,
  grupoById,
  contasBanc,
  lojaAtual,
  lojas,
  isGlobal,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: Conta | null;
  cats: Categoria[];
  grupoById: Record<string, Grupo>;
  contasBanc: ContaBancaria[];
  lojaAtual: string | null;
  lojas: { id: string; nome: string }[];
  isGlobal: boolean;
  onSaved: () => void;
}) {
  const { profile } = useAuth();
  const [descricao, setDescricao] = useState("");
  const [fornecedor, setFornecedor] = useState("");
  const [valor, setValor] = useState("");
  const [venc, setVenc] = useState(hoje());
  const [cat, setCat] = useState("sem");
  const [contaBanc, setContaBanc] = useState("sem");
  const [status, setStatus] = useState<StatusCP>("aberto");
  const [obs, setObs] = useState("");
  const [lojaSel, setLojaSel] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setDescricao(editing.descricao);
      setFornecedor(editing.fornecedor ?? "");
      setValor(
        Number(editing.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 }),
      );
      setVenc(editing.data_vencimento);
      setCat(editing.id_categoria ?? "sem");
      setContaBanc(editing.id_conta_bancaria ?? "sem");
      setStatus(editing.status);
      setObs(editing.observacao ?? "");
      setLojaSel(editing.id_loja);
    } else {
      setDescricao("");
      setFornecedor("");
      setValor("");
      setVenc(hoje());
      setCat("sem");
      setContaBanc("sem");
      setStatus("aberto");
      setObs("");
      setLojaSel(lojaAtual ?? "");
    }
  }, [open, editing, lojaAtual]);

  const submit = async () => {
    if (!descricao.trim()) return toast.error("Informe a descrição");
    const v = parseMoney(valor);
    if (v <= 0) return toast.error("Informe o valor");
    if (!venc) return toast.error("Informe o vencimento");
    const loja = lojaSel || lojaAtual;
    if (!loja) return toast.error("Selecione a loja");

    setSaving(true);
    const payload = {
      id_loja: loja,
      descricao: descricao.trim(),
      fornecedor: fornecedor.trim() || null,
      valor: v,
      data_vencimento: venc,
      id_categoria: cat === "sem" ? null : cat,
      id_conta_bancaria: contaBanc === "sem" ? null : contaBanc,
      status,
      observacao: obs.trim() || null,
      criado_por: profile?.id ?? null,
    };
    const { error } = editing
      ? await supabase.from("contas_pagar").update(payload).eq("id", editing.id)
      : await supabase.from("contas_pagar").insert(payload);
    setSaving(false);

    if (error) return toast.error(error.message);
    toast.success(editing ? "Conta atualizada" : "Conta criada");
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar conta" : "Nova conta a pagar"}</DialogTitle>
        </DialogHeader>
        <div className="grid max-h-[70vh] gap-4 overflow-y-auto py-2">
          {isGlobal && !editing && (
            <div className="grid gap-2">
              <Label>Loja</Label>
              <Select value={lojaSel} onValueChange={setLojaSel}>
                <SelectTrigger>
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
          )}

          <div className="grid gap-2">
            <Label>
              Descrição <span className="text-destructive">*</span>
            </Label>
            <Input
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Ex.: Aluguel de julho"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Fornecedor</Label>
              <Input
                value={fornecedor}
                onChange={(e) => setFornecedor(e.target.value)}
                placeholder="Opcional"
              />
            </div>
            <div className="grid gap-2">
              <Label>
                Valor (R$) <span className="text-destructive">*</span>
              </Label>
              <Input
                className="font-mono"
                value={valor}
                onChange={(e) => setValor(maskMoney(e.target.value))}
                inputMode="numeric"
                placeholder="0,00"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>
                Vencimento <span className="text-destructive">*</span>
              </Label>
              <Input type="date" value={venc} onChange={(e) => setVenc(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Situação</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as StatusCP)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="aberto">Em aberto</SelectItem>
                  <SelectItem value="pago">Paga</SelectItem>
                  <SelectItem value="cancelado">Cancelada</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Categoria</Label>
              <Select value={cat} onValueChange={setCat}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sem">— Sem categoria</SelectItem>
                  {cats.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {grupoById[c.id_grupo]?.nome
                        ? `${grupoById[c.id_grupo].nome} › ${c.nome}`
                        : c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Conta bancária</Label>
              <Select value={contaBanc} onValueChange={setContaBanc}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sem">— Não definida</SelectItem>
                  {contasBanc.map((cb) => (
                    <SelectItem key={cb.id} value={cb.id}>
                      {cb.banco} · {cb.agencia}/{cb.conta}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Observação</Label>
            <Textarea
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              rows={2}
              placeholder="Opcional"
            />
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
