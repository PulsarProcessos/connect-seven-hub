import { useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, ExternalLink, Loader2, Paperclip, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { friendlyDbError } from "@/lib/money";

export type OrigemComprovante =
  | "caixa"
  | "caixa_deposito"
  | "caixa_lancamento"
  | "conta_pagar"
  | "conta_receber"
  | "movimentacao";

const BUCKET = "comprovantes";

/** Sanitiza o nome do arquivo para um caminho seguro no storage. */
function slug(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .slice(-80);
}

export function useComprovantesCount(origemTipo: OrigemComprovante, ids: string[]) {
  return useQuery({
    queryKey: ["comprovantes_count", origemTipo, ids.slice().sort().join(",")],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("comprovantes")
        .select("origem_id")
        .eq("origem_tipo", origemTipo)
        .in("origem_id", ids);
      if (error) throw error;
      const set = new Set((data ?? []).map((d) => d.origem_id as string));
      return set;
    },
  });
}

/**
 * Painel reutilizável de comprovantes: envio por arquivo ou foto (celular/tablet),
 * listagem, visualização por link temporário e exclusão.
 */
export function ComprovantesPanel({
  origemTipo,
  origemId,
  idLoja,
  readOnly = false,
  compact = false,
}: {
  origemTipo: OrigemComprovante;
  origemId: string;
  idLoja: string;
  readOnly?: boolean;
  compact?: boolean;
}) {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);

  const listaQ = useQuery({
    queryKey: ["comprovantes", origemTipo, origemId],
    enabled: !!origemId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("comprovantes")
        .select("id, caminho, nome_arquivo, content_type, tamanho, created_at")
        .eq("origem_tipo", origemTipo)
        .eq("origem_id", origemId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const enviar = useMutation({
    mutationFn: async (file: File) => {
      if (!idLoja) throw new Error("Loja não identificada para o comprovante.");
      const caminho = `${idLoja}/${origemTipo}/${origemId}/${Date.now()}-${slug(file.name || "comprovante.jpg")}`;
      const up = await supabase.storage.from(BUCKET).upload(caminho, file, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });
      if (up.error) throw new Error(up.error.message);
      const { error } = await supabase.from("comprovantes").insert({
        id_loja: idLoja,
        origem_tipo: origemTipo,
        origem_id: origemId,
        caminho,
        nome_arquivo: file.name || "comprovante.jpg",
        content_type: file.type || null,
        tamanho: file.size,
        enviado_por: profile?.id ?? null,
      });
      if (error) {
        await supabase.storage.from(BUCKET).remove([caminho]);
        throw new Error(friendlyDbError(error));
      }
    },
    onSuccess: () => {
      toast.success("Comprovante enviado");
      qc.invalidateQueries({ queryKey: ["comprovantes"] });
      qc.invalidateQueries({ queryKey: ["comprovantes_count"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const excluir = useMutation({
    mutationFn: async (p: { id: string; caminho: string }) => {
      const { error } = await supabase.from("comprovantes").delete().eq("id", p.id);
      if (error) throw new Error(friendlyDbError(error));
      await supabase.storage.from(BUCKET).remove([p.caminho]);
    },
    onSuccess: () => {
      toast.success("Comprovante removido");
      qc.invalidateQueries({ queryKey: ["comprovantes"] });
      qc.invalidateQueries({ queryKey: ["comprovantes_count"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const abrir = async (caminho: string) => {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(caminho, 120);
    if (error || !data) {
      toast.error("Não foi possível abrir o comprovante.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener");
  };

  const lista = listaQ.data ?? [];

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Paperclip className="h-3.5 w-3.5" />
          Comprovantes {lista.length > 0 && `(${lista.length})`}
        </span>
        {!readOnly && (
          <div className="ml-auto flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => fileRef.current?.click()}
              disabled={enviar.isPending}
            >
              {enviar.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              Anexar
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => camRef.current?.click()}
              disabled={enviar.isPending}
            >
              <Camera className="h-4 w-4" />
              Foto
            </Button>
          </div>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) enviar.mutate(f);
          e.target.value = "";
        }}
      />
      <input
        ref={camRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) enviar.mutate(f);
          e.target.value = "";
        }}
      />

      {lista.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {compact ? "Sem comprovantes." : "Nenhum comprovante anexado a este lançamento."}
        </p>
      ) : (
        <ul className="grid gap-1.5">
          {lista.map((c) => (
            <li
              key={c.id}
              className="flex items-center gap-2 rounded-md border border-border bg-muted/20 px-2.5 py-1.5 text-xs"
            >
              <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{c.nome_arquivo}</span>
              <div className="ml-auto flex items-center gap-1">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => abrir(c.caminho)}
                  title="Visualizar"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </Button>
                {!readOnly && (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive"
                    onClick={() => excluir.mutate({ id: c.id, caminho: c.caminho })}
                    title="Excluir"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
