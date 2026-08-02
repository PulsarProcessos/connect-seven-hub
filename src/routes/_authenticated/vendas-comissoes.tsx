import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Percent, Trophy, Users } from "lucide-react";
import { AppLayout } from "@/components/app-layout";
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
import { fmtBRL } from "@/lib/money";

export const Route = createFileRoute("/_authenticated/vendas-comissoes")({
  head: () => ({
    meta: [
      { title: "Comissões de Vendas · Connect 7" },
      {
        name: "description",
        content: "Desempenho de vendas e comissões apuradas por loja e por vendedor.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ComissoesVendasPage,
});

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

type Regra = {
  id: string;
  id_loja: string;
  id_vendedor: string | null;
  valor_min: number;
  valor_max: number | null;
  percentual: number;
  ativa: boolean;
};

/** Cálculo progressivo por faixas, igual ao usado no cadastro. */
function calcular(regras: Regra[], total: number): number {
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

function ComissoesVendasPage() {
  const { profile, selectedLojaId, lojas } = useAuth();
  const isGlobal = profile?.role === "administrador" || profile?.role === "master";
  const escopoLoja = isGlobal ? selectedLojaId : (profile?.id_loja ?? null);

  const hoje = new Date();
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const [ano, setAno] = useState(hoje.getFullYear());
  const mesRef = `${ano}-${String(mes).padStart(2, "0")}`;

  const vendasQ = useQuery({
    queryKey: ["comissoes_vendas", { escopoLoja, mesRef }],
    queryFn: async () => {
      let q = supabase
        .from("vendas_ucase")
        .select("id, id_loja, id_vendedor, valor_bruto")
        .eq("mes_venda", mesRef);
      if (escopoLoja) q = q.eq("id_loja", escopoLoja);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const regrasQ = useQuery({
    queryKey: ["comissao_regras_all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("comissao_regras")
        .select("id, id_loja, id_vendedor, valor_min, valor_max, percentual, ativa")
        .eq("ativa", true);
      if (error) throw error;
      return (data ?? []) as Regra[];
    },
  });

  const vendedoresQ = useQuery({
    queryKey: ["vendedores_all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("usuarios_perfis")
        .select("id, nome, id_loja")
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const pagarQ = useQuery({
    queryKey: ["comissoes_pagar", { escopoLoja, mesRef }],
    queryFn: async () => {
      let q = supabase
        .from("contas_pagar")
        .select("id, id_loja, id_vendedor, valor, status")
        .not("id_venda_origem", "is", null);
      if (escopoLoja) q = q.eq("id_loja", escopoLoja);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const nomeVendedor = (id: string | null) =>
    id ? ((vendedoresQ.data ?? []).find((v) => v.id === id)?.nome ?? "—") : "Sem vendedor";
  const nomeLoja = (id: string) => lojas.find((l) => l.id === id)?.nome ?? "—";

  const porLoja = useMemo(() => {
    const map = new Map<string, { total: number; qtd: number }>();
    for (const v of vendasQ.data ?? []) {
      const cur = map.get(v.id_loja) ?? { total: 0, qtd: 0 };
      cur.total += Number(v.valor_bruto);
      cur.qtd += 1;
      map.set(v.id_loja, cur);
    }
    const regras = regrasQ.data ?? [];
    return [...map.entries()]
      .map(([id_loja, r]) => ({
        id_loja,
        ...r,
        comissao: calcular(
          regras.filter((x) => x.id_loja === id_loja && x.id_vendedor === null),
          r.total,
        ),
      }))
      .sort((a, b) => b.total - a.total);
  }, [vendasQ.data, regrasQ.data]);

  const porVendedor = useMemo(() => {
    const map = new Map<string, { id_loja: string; total: number; qtd: number }>();
    for (const v of vendasQ.data ?? []) {
      const key = `${v.id_loja}|${v.id_vendedor ?? ""}`;
      const cur = map.get(key) ?? { id_loja: v.id_loja, total: 0, qtd: 0 };
      cur.total += Number(v.valor_bruto);
      cur.qtd += 1;
      map.set(key, cur);
    }
    const regras = regrasQ.data ?? [];
    return [...map.entries()]
      .map(([key, r]) => {
        const idVendedor = key.split("|")[1] || null;
        const doVendedor = regras.filter(
          (x) => x.id_loja === r.id_loja && x.id_vendedor === idVendedor,
        );
        const daLoja = regras.filter(
          (x) => x.id_loja === r.id_loja && x.id_vendedor === null,
        );
        const usadas = doVendedor.length > 0 ? doVendedor : daLoja;
        return {
          idVendedor,
          id_loja: r.id_loja,
          total: r.total,
          qtd: r.qtd,
          comissao: calcular(usadas, r.total),
          regraPropria: doVendedor.length > 0,
        };
      })
      .sort((a, b) => b.total - a.total);
  }, [vendasQ.data, regrasQ.data]);

  const totaisPagar = useMemo(() => {
    let pago = 0;
    let aberto = 0;
    for (const c of pagarQ.data ?? []) {
      if (c.status === "pago") pago += Number(c.valor);
      else if (c.status === "aberto") aberto += Number(c.valor);
    }
    return { pago, aberto };
  }, [pagarQ.data]);

  const anos = Array.from({ length: 6 }, (_, i) => hoje.getFullYear() - 3 + i);

  return (
    <AppLayout>
      <div>
        <h1 className="text-xl font-semibold">Comissões</h1>
        <p className="text-sm text-muted-foreground">
          Desempenho e comissão apurada por loja e por vendedor.
        </p>
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
        <Metric label="Comissões em aberto" value={totaisPagar.aberto} icon={<Percent className="h-4 w-4" />} />
        <Metric label="Comissões pagas" value={totaisPagar.pago} icon={<Trophy className="h-4 w-4" />} />
      </div>

      <h2 className="mt-6 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        <Trophy className="h-4 w-4" /> Desempenho por loja
      </h2>
      <div className="mt-3 rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Loja</TableHead>
              <TableHead className="text-right">Vendas</TableHead>
              <TableHead className="text-right">Total vendido</TableHead>
              <TableHead className="text-right">Comissão apurada</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {porLoja.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                  Sem vendas no período.
                </TableCell>
              </TableRow>
            ) : (
              porLoja.map((l) => (
                <TableRow key={l.id_loja}>
                  <TableCell className="font-medium">{nomeLoja(l.id_loja)}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{l.qtd}</TableCell>
                  <TableCell className="text-right font-mono">{fmtBRL(l.total)}</TableCell>
                  <TableCell className="text-right font-mono text-primary">
                    {fmtBRL(l.comissao)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <h2 className="mt-6 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        <Users className="h-4 w-4" /> Desempenho por vendedor
      </h2>
      <div className="mt-3 rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vendedor</TableHead>
              <TableHead>Loja</TableHead>
              <TableHead className="text-right">Vendas</TableHead>
              <TableHead className="text-right">Total vendido</TableHead>
              <TableHead className="text-right">Comissão apurada</TableHead>
              <TableHead>Regra</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {porVendedor.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  Sem vendas no período.
                </TableCell>
              </TableRow>
            ) : (
              porVendedor.map((v) => (
                <TableRow key={`${v.id_loja}-${v.idVendedor ?? "none"}`}>
                  <TableCell className="font-medium">{nomeVendedor(v.idVendedor)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {nomeLoja(v.id_loja)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">{v.qtd}</TableCell>
                  <TableCell className="text-right font-mono">{fmtBRL(v.total)}</TableCell>
                  <TableCell className="text-right font-mono text-primary">
                    {fmtBRL(v.comissao)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {v.regraPropria ? "Do vendedor" : "Da loja"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </AppLayout>
  );
}

function Metric({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-border bg-muted/20 p-3">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1 font-mono text-lg font-semibold">{fmtBRL(value)}</div>
    </div>
  );
}
