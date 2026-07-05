import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Plus, ArrowRightLeft, TrendingDown, TrendingUp } from "lucide-react";
import { toast } from "sonner";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

type TipoMov = "venda" | "despesa" | "transferencia";

type Conta = { id: string; id_loja: string; banco: string; agencia: string; conta: string };
type Cat = { id: string; nome: string; id_grupo: string };
type Grupo = { id: string; nome: string; natureza: "receita" | "despesa" };

const todayISO = () => new Date().toISOString().slice(0, 10);

export function NovaMovimentacaoButton() {
  const [open, setOpen] = useState<TipoMov | null>(null);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" />
            Novo
            <ChevronDown className="h-3.5 w-3.5 opacity-80" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onSelect={() => setOpen("venda")}>
            <TrendingUp className="h-4 w-4 text-emerald-500" />
            Venda
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setOpen("despesa")}>
            <TrendingDown className="h-4 w-4 text-rose-500" />
            Despesa
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setOpen("transferencia")}>
            <ArrowRightLeft className="h-4 w-4 text-primary" />
            Transferência
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {open && (
        <MovimentacaoDialog tipo={open} onClose={() => setOpen(null)} />
      )}
    </>
  );
}

function MovimentacaoDialog({
  tipo,
  onClose,
}: {
  tipo: TipoMov;
  onClose: () => void;
}) {
  const { profile, lojas, selectedLojaId } = useAuth();
  const qc = useQueryClient();

  const isGlobal = profile?.role === "administrador" || profile?.role === "master";
  const defaultLoja = isGlobal ? (selectedLojaId ?? "") : (profile?.id_loja ?? "");

  const [idLoja, setIdLoja] = useState<string>(defaultLoja);
  const [data, setData] = useState<string>(todayISO());
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [idCategoria, setIdCategoria] = useState<string>("");
  const [idConta, setIdConta] = useState<string>("");
  const [idContaDestino, setIdContaDestino] = useState<string>("");

  useEffect(() => {
    setIdLoja(defaultLoja);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const contasQ = useQuery({
    queryKey: ["contas_por_loja", idLoja],
    enabled: !!idLoja,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contas_bancarias")
        .select("id, id_loja, banco, agencia, conta")
        .eq("id_loja", idLoja)
        .eq("ativa", true)
        .order("banco");
      if (error) throw error;
      return (data ?? []) as Conta[];
    },
  });

  const catsQ = useQuery({
    queryKey: ["dre_all"],
    enabled: tipo !== "transferencia",
    queryFn: async () => {
      const [g, c] = await Promise.all([
        supabase
          .from("dre_grupos")
          .select("id, nome, natureza")
          .eq("ativo", true)
          .order("ordem"),
        supabase
          .from("dre_categorias")
          .select("id, nome, id_grupo")
          .eq("ativo", true)
          .order("ordem"),
      ]);
      if (g.error) throw g.error;
      if (c.error) throw c.error;
      return {
        grupos: (g.data ?? []) as Grupo[],
        categorias: (c.data ?? []) as Cat[],
      };
    },
  });

  const grupoDaNatureza = useMemo(() => {
    if (!catsQ.data) return { grupos: [], categorias: [] };
    if (tipo === "venda") {
      const grupos = catsQ.data.grupos.filter((g) => g.natureza === "receita");
      const ids = new Set(grupos.map((g) => g.id));
      return { grupos, categorias: catsQ.data.categorias.filter((c) => ids.has(c.id_grupo)) };
    }
    if (tipo === "despesa") {
      const grupos = catsQ.data.grupos.filter((g) => g.natureza === "despesa");
      const ids = new Set(grupos.map((g) => g.id));
      return { grupos, categorias: catsQ.data.categorias.filter((c) => ids.has(c.id_grupo)) };
    }
    return catsQ.data;
  }, [catsQ.data, tipo]);

  const salvar = useMutation({
    mutationFn: async () => {
      if (!idLoja) throw new Error("Selecione a loja");
      if (!data) throw new Error("Informe a data");
      if (!descricao.trim()) throw new Error("Informe a descrição");
      const valorNum = Number(valor.replace(",", "."));
      if (!(valorNum > 0)) throw new Error("Valor deve ser maior que zero");
      if (tipo !== "transferencia" && !idCategoria) throw new Error("Selecione a categoria");
      if (!idConta) throw new Error("Selecione a conta bancária");
      if (tipo === "transferencia") {
        if (!idContaDestino) throw new Error("Selecione a conta de destino");
        if (idConta === idContaDestino)
          throw new Error("Conta de destino deve ser diferente da origem");
      }

      const payload = {
        id_loja: idLoja,
        tipo,
        data_movimento: data,
        descricao: descricao.trim(),
        valor: valorNum,
        id_categoria: tipo === "transferencia" ? null : idCategoria,
        id_conta_bancaria: idConta,
        id_conta_destino: tipo === "transferencia" ? idContaDestino : null,
        criado_por: profile?.id ?? null,
      };
      const { error } = await supabase.from("movimentacoes").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(
        tipo === "venda"
          ? "Venda cadastrada"
          : tipo === "despesa"
            ? "Despesa cadastrada"
            : "Transferência cadastrada",
      );
      qc.invalidateQueries({ queryKey: ["extrato_financeiro"] });
      qc.invalidateQueries({ queryKey: ["movimentacoes"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const showLojaSelect = isGlobal;
  const title =
    tipo === "venda"
      ? "Nova venda"
      : tipo === "despesa"
        ? "Nova despesa"
        : "Nova transferência";

  const contas = contasQ.data ?? [];
  const contaLabel = (c: Conta) =>
    `${c.banco} · Ag. ${c.agencia} / Cc. ${c.conta}`;

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {showLojaSelect && (
            <div className="grid gap-2">
              <Label>Loja</Label>
              <Select value={idLoja} onValueChange={setIdLoja}>
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
              {!selectedLojaId && (
                <p className="text-xs text-muted-foreground">
                  Selecione uma loja específica para lançar.
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Data</Label>
              <Input
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Valor (R$)</Label>
              <Input
                inputMode="decimal"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                placeholder="0,00"
                className="font-mono"
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Descrição</Label>
            <Textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              rows={2}
              placeholder="Ex.: Aluguel · agosto"
            />
          </div>

          {tipo !== "transferencia" && (
            <div className="grid gap-2">
              <Label>Categoria (DRE)</Label>
              <Select value={idCategoria} onValueChange={setIdCategoria}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a categoria" />
                </SelectTrigger>
                <SelectContent>
                  {grupoDaNatureza.grupos.map((g) => {
                    const items = grupoDaNatureza.categorias.filter(
                      (c) => c.id_grupo === g.id,
                    );
                    if (items.length === 0) return null;
                    return (
                      <SelectGroup key={g.id}>
                        <SelectLabel>{g.nome}</SelectLabel>
                        {items.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {g.nome} › {c.nome}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          )}

          {tipo !== "transferencia" ? (
            <div className="grid gap-2">
              <Label>
                {tipo === "venda" ? "Conta de crédito" : "Conta de débito"}
              </Label>
              <Select
                value={idConta}
                onValueChange={setIdConta}
                disabled={!idLoja || contas.length === 0}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      !idLoja
                        ? "Selecione a loja primeiro"
                        : contas.length === 0
                          ? "Nenhuma conta cadastrada"
                          : "Selecione a conta"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {contas.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {contaLabel(c)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Conta origem</Label>
                <Select
                  value={idConta}
                  onValueChange={setIdConta}
                  disabled={!idLoja || contas.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Origem" />
                  </SelectTrigger>
                  <SelectContent>
                    {contas.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {contaLabel(c)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Conta destino</Label>
                <Select
                  value={idContaDestino}
                  onValueChange={setIdContaDestino}
                  disabled={!idLoja || contas.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Destino" />
                  </SelectTrigger>
                  <SelectContent>
                    {contas
                      .filter((c) => c.id !== idConta)
                      .map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {contaLabel(c)}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={salvar.isPending}>
            Cancelar
          </Button>
          <Button onClick={() => salvar.mutate()} disabled={salvar.isPending}>
            {salvar.isPending ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
