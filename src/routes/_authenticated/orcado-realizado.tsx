import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Target, TrendingDown, TrendingUp } from "lucide-react";
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

export const Route = createFileRoute("/_authenticated/orcado-realizado")({
  head: () => ({
    meta: [
      { title: "Orçado x Realizado · Connect 7" },
      {
        name: "description",
        content:
          "Comparativo entre o orçamento e o realizado por categoria da DRE, loja e mês.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OrcadoRealizadoPage,
});

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

type Linha = {
  id_loja: string;
  id_categoria: string;
  ano: number;
  mes: number;
  orcado: number;
  realizado: number;
  variacao_pct: number | null;
};

function OrcadoRealizadoPage() {
  const { profile, selectedLojaId, lojas } = useAuth();
  const isGlobal = profile?.role === "administrador" || profile?.role === "master";
  const escopoLoja = isGlobal ? selectedLojaId : (profile?.id_loja ?? null);

  const hoje = new Date();
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const [ano, setAno] = useState(hoje.getFullYear());

  const dadosQ = useQuery({
    queryKey: ["orcado_realizado", { escopoLoja, mes, ano }],
    queryFn: async () => {
      let q = supabase
        .from("vw_orcado_realizado")
        .select("id_loja, id_categoria, ano, mes, orcado, realizado, variacao_pct")
        .eq("ano", ano)
        .eq("mes", mes);
      if (escopoLoja) q = q.eq("id_loja", escopoLoja);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Linha[];
    },
  });

  const catsQ = useQuery({
    queryKey: ["orc_cats_nome"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dre_categorias")
        .select("id, nome, dre_grupos(nome, natureza)");
      if (error) throw error;
      return (data ?? []) as unknown as {
        id: string;
        nome: string;
        dre_grupos: { nome: string; natureza: string } | null;
      }[];
    },
  });

  const nomeCat = (id: string) => catsQ.data?.find((c) => c.id === id)?.nome ?? "Sem categoria";
  const grupoCat = (id: string) => catsQ.data?.find((c) => c.id === id)?.dre_grupos?.nome ?? "—";
  const nomeLoja = (id: string) => lojas.find((l) => l.id === id)?.nome ?? "—";

  const linhas = dadosQ.data ?? [];

  const porCategoria = useMemo(() => {
    const map = new Map<string, { orcado: number; realizado: number }>();
    for (const l of linhas) {
      const cur = map.get(l.id_categoria) ?? { orcado: 0, realizado: 0 };
      cur.orcado += Number(l.orcado);
      cur.realizado += Number(l.realizado);
      map.set(l.id_categoria, cur);
    }
    return [...map.entries()]
      .map(([id, v]) => ({ id, ...v, variacao: v.orcado > 0 ? ((v.realizado - v.orcado) / v.orcado) * 100 : null }))
      .sort((a, b) => b.realizado - a.realizado);
  }, [linhas]);

  const porLoja = useMemo(() => {
    const map = new Map<string, { orcado: number; realizado: number }>();
    for (const l of linhas) {
      const cur = map.get(l.id_loja) ?? { orcado: 0, realizado: 0 };
      cur.orcado += Number(l.orcado);
      cur.realizado += Number(l.realizado);
      map.set(l.id_loja, cur);
    }
    return [...map.entries()]
      .map(([id, v]) => ({ id, ...v, variacao: v.orcado > 0 ? ((v.realizado - v.orcado) / v.orcado) * 100 : null }))
      .sort((a, b) => b.realizado - a.realizado);
  }, [linhas]);

  const totais = useMemo(() => {
    let orcado = 0;
    let realizado = 0;
    for (const l of linhas) {
      orcado += Number(l.orcado);
      realizado += Number(l.realizado);
    }
    return {
      orcado,
      realizado,
      variacao: orcado > 0 ? ((realizado - orcado) / orcado) * 100 : null,
    };
  }, [linhas]);

  const semOrcamento = totais.orcado === 0 && linhas.length > 0;
  const anos = Array.from({ length: 6 }, (_, i) => hoje.getFullYear() - 3 + i);

  return (
    <AppLayout>
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <Target className="h-5 w-5 text-primary" />
          Orçado x Realizado
        </h1>
        <p className="text-sm text-muted-foreground">
          Comparativo por categoria do plano de contas e por loja, com variação percentual.
        </p>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-5">
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
        <Metric label="Orçado" value={totais.orcado} />
        <Metric label="Realizado" value={totais.realizado} />
        <div className="rounded-md border border-border bg-muted/20 p-3">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
            {(totais.variacao ?? 0) >= 0 ? (
              <TrendingUp className="h-4 w-4" />
            ) : (
              <TrendingDown className="h-4 w-4" />
            )}
            Variação
          </div>
          <div className="mt-1 font-mono text-lg font-semibold">
            {totais.variacao === null ? "—" : `${totais.variacao.toFixed(1)}%`}
          </div>
        </div>
      </div>

      {semOrcamento && (
        <div className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          Nenhum orçamento cadastrado para o período/loja selecionado. Os valores realizados
          continuam sendo exibidos; cadastre o orçado em Movimentação Bancária › Orçamento.
        </div>
      )}

      <h2 className="mt-6 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        Por categoria
      </h2>
      <div className="mt-3 rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Categoria</TableHead>
              <TableHead>Grupo</TableHead>
              <TableHead className="text-right">Orçado</TableHead>
              <TableHead className="text-right">Realizado</TableHead>
              <TableHead className="text-right">Variação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {porCategoria.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                  Sem dados no período.
                </TableCell>
              </TableRow>
            ) : (
              porCategoria.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{nomeCat(c.id)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{grupoCat(c.id)}</TableCell>
                  <TableCell className="text-right font-mono">{fmtBRL(c.orcado)}</TableCell>
                  <TableCell className="text-right font-mono">{fmtBRL(c.realizado)}</TableCell>
                  <TableCell className="text-right font-mono">
                    {c.variacao === null ? (
                      <span className="text-xs text-muted-foreground">sem orçamento</span>
                    ) : (
                      <span
                        className={
                          c.variacao >= 0
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-rose-600 dark:text-rose-400"
                        }
                      >
                        {c.variacao.toFixed(1)}%
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <h2 className="mt-6 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        Por loja
      </h2>
      <div className="mt-3 rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Loja</TableHead>
              <TableHead className="text-right">Orçado</TableHead>
              <TableHead className="text-right">Realizado</TableHead>
              <TableHead className="text-right">Variação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {porLoja.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                  Sem dados no período.
                </TableCell>
              </TableRow>
            ) : (
              porLoja.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="font-medium">{nomeLoja(l.id)}</TableCell>
                  <TableCell className="text-right font-mono">{fmtBRL(l.orcado)}</TableCell>
                  <TableCell className="text-right font-mono">{fmtBRL(l.realizado)}</TableCell>
                  <TableCell className="text-right font-mono">
                    {l.variacao === null ? (
                      <span className="text-xs text-muted-foreground">sem orçamento</span>
                    ) : (
                      <span
                        className={
                          l.variacao >= 0
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-rose-600 dark:text-rose-400"
                        }
                      >
                        {l.variacao.toFixed(1)}%
                      </span>
                    )}
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

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-muted/20 p-3">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-lg font-semibold">{fmtBRL(value)}</div>
    </div>
  );
}
