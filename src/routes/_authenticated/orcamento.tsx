import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Save, Target } from "lucide-react";
import { toast } from "sonner";
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
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { fmtBRL, maskMoney, parseMoney, toMoneyInput, friendlyDbError } from "@/lib/money";

export const Route = createFileRoute("/_authenticated/orcamento")({
  head: () => ({
    meta: [
      { title: "Orçamento · Connect 7" },
      {
        name: "description",
        content: "Cadastro do orçado por categoria da DRE, loja e mês.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OrcamentoPage,
});

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

type Categoria = {
  id: string;
  nome: string;
  id_grupo: string;
  dre_grupos: { nome: string; natureza: string; ordem: number } | null;
};

function OrcamentoPage() {
  const { profile, selectedLojaId, lojas } = useAuth();
  const qc = useQueryClient();
  const isGlobal = profile?.role === "administrador" || profile?.role === "master";
  const lojaId = isGlobal ? selectedLojaId : (profile?.id_loja ?? null);

  const [ano, setAno] = useState(new Date().getFullYear());
  // chave: `${idCategoria}|${mes}` -> texto do input
  const [valores, setValores] = useState<Record<string, string>>({});

  const catsQ = useQuery({
    queryKey: ["orc_cats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dre_categorias")
        .select("id, nome, id_grupo, dre_grupos(nome, natureza, ordem)")
        .eq("ativo", true)
        .order("ordem");
      if (error) throw error;
      return (data ?? []) as unknown as Categoria[];
    },
  });

  const orcQ = useQuery({
    queryKey: ["orcamentos", lojaId, ano],
    enabled: !!lojaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orcamentos")
        .select("id, id_categoria, mes, valor")
        .eq("id_loja", lojaId!)
        .eq("ano", ano);
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    const map: Record<string, string> = {};
    for (const o of orcQ.data ?? []) {
      map[`${o.id_categoria}|${o.mes}`] = toMoneyInput(o.valor);
    }
    setValores(map);
  }, [orcQ.data]);

  const grupos = useMemo(() => {
    const map = new Map<string, { nome: string; natureza: string; cats: Categoria[] }>();
    for (const c of catsQ.data ?? []) {
      const key = c.id_grupo;
      if (!map.has(key))
        map.set(key, {
          nome: c.dre_grupos?.nome ?? "Sem grupo",
          natureza: c.dre_grupos?.natureza ?? "despesa",
          cats: [],
        });
      map.get(key)!.cats.push(c);
    }
    return [...map.values()];
  }, [catsQ.data]);

  const salvar = useMutation({
    mutationFn: async () => {
      if (!lojaId) throw new Error("Selecione uma loja específica no topo");
      const rows = Object.entries(valores)
        .map(([k, v]) => {
          const [id_categoria, mes] = k.split("|");
          return {
            id_loja: lojaId,
            id_categoria,
            ano,
            mes: Number(mes),
            valor: parseMoney(v),
            criado_por: profile?.id ?? null,
          };
        })
        .filter((r) => r.valor > 0);
      if (rows.length === 0) throw new Error("Informe ao menos um valor orçado");
      const { error } = await supabase
        .from("orcamentos")
        .upsert(rows, { onConflict: "id_loja,id_categoria,ano,mes" });
      if (error) throw new Error(friendlyDbError(error));
    },
    onSuccess: () => {
      toast.success("Orçamento salvo");
      qc.invalidateQueries({ queryKey: ["orcamentos"] });
      qc.invalidateQueries({ queryKey: ["orcado_realizado"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const replicarJaneiro = () => {
    setValores((cur) => {
      const next = { ...cur };
      for (const c of catsQ.data ?? []) {
        const base = cur[`${c.id}|1`];
        if (!base) continue;
        for (let m = 2; m <= 12; m++) next[`${c.id}|${m}`] = base;
      }
      return next;
    });
    toast.success("Janeiro replicado para o ano — revise e salve");
  };

  const totalAno = useMemo(
    () => Object.values(valores).reduce((s, v) => s + parseMoney(v), 0),
    [valores],
  );

  const anos = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 1 + i);

  if (!lojaId) {
    return (
      <AppLayout>
        <h1 className="text-xl font-semibold">Orçamento</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Selecione uma loja específica no seletor do topo para cadastrar o orçamento.
        </p>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <Target className="h-5 w-5 text-primary" />
            Orçamento
          </h1>
          <p className="text-sm text-muted-foreground">
            {lojas.find((l) => l.id === lojaId)?.nome ?? "Unidade"} — valor orçado por categoria
            da DRE, mês a mês.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid gap-1.5">
            <Label className="text-xs">Ano</Label>
            <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                {anos.map((a) => (
                  <SelectItem key={a} value={String(a)}>{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" variant="outline" onClick={replicarJaneiro}>
            <Copy className="h-4 w-4" />
            Replicar janeiro
          </Button>
          <Button size="sm" onClick={() => salvar.mutate()} disabled={salvar.isPending}>
            <Save className="h-4 w-4" />
            {salvar.isPending ? "Salvando…" : "Salvar orçamento"}
          </Button>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-border bg-card p-4 text-sm">
        Total orçado no ano:{" "}
        <span className="font-mono font-semibold">{fmtBRL(totalAno)}</span>
      </div>

      <div className="mt-4 overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted/40">
            <tr>
              <th className="min-w-56 px-3 py-2 text-left text-xs uppercase tracking-wider text-muted-foreground">
                Categoria
              </th>
              {MESES.map((m) => (
                <th
                  key={m}
                  className="min-w-28 px-2 py-2 text-right text-xs uppercase tracking-wider text-muted-foreground"
                >
                  {m}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grupos.map((g) => (
              <>
                <tr key={g.nome} className="bg-muted/20">
                  <td
                    colSpan={13}
                    className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    {g.nome} · {g.natureza === "receita" ? "Receita" : "Despesa"}
                  </td>
                </tr>
                {g.cats.map((c) => (
                  <tr key={c.id} className="border-t border-border">
                    <td className="px-3 py-1.5">{c.nome}</td>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                      <td key={m} className="px-1 py-1">
                        <Input
                          inputMode="decimal"
                          className="h-8 text-right font-mono text-xs"
                          placeholder="0,00"
                          value={valores[`${c.id}|${m}`] ?? ""}
                          onChange={(e) =>
                            setValores((cur) => ({
                              ...cur,
                              [`${c.id}|${m}`]: maskMoney(e.target.value),
                            }))
                          }
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </>
            ))}
            {grupos.length === 0 && (
              <tr>
                <td colSpan={13} className="py-8 text-center text-sm text-muted-foreground">
                  Cadastre categorias da DRE para montar o orçamento.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </AppLayout>
  );
}
