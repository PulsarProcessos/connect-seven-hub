/** Utilitários de máscara/parse no padrão brasileiro (pt-BR). */

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export const fmtBRL = (v: unknown) => BRL.format(Number(v ?? 0) || 0);

/** Máscara monetária: digita da direita para a esquerda (1234 -> 12,34). */
export function maskMoney(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 12);
  if (!d) return "";
  return (parseInt(d, 10) / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Converte "1.234,56" (ou "1234.56") em número. */
export function parseMoney(s: string): number {
  if (!s) return 0;
  const cleaned = s.trim().replace(/[^\d.,-]/g, "");
  const normalized = cleaned.includes(",")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

/** Formata um número já existente para o input monetário. */
export function toMoneyInput(v: unknown): string {
  return (Number(v ?? 0) || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Máscara percentual com 3 casas (12345 -> 12,345). */
export function maskPct(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 6);
  if (!d) return "";
  return (parseInt(d, 10) / 1000).toLocaleString("pt-BR", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
}

export function parsePct(s: string): number {
  return parseMoney(s);
}

export const fmtPct = (v: unknown) =>
  Number(v ?? 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });

/** Mensagem amigável a partir de um erro do banco. */
export function friendlyDbError(e: unknown, fallback = "Não foi possível salvar."): string {
  const err = e as { message?: string; code?: string; details?: string } | null;
  const msg = err?.message ?? "";
  const code = err?.code ?? "";
  if (code === "42501" || /row-level security/i.test(msg))
    return "Você não tem permissão para esta operação nesta loja.";
  if (code === "23505" || /duplicate key/i.test(msg))
    return "Já existe um registro com estes dados.";
  if (code === "23503" || /foreign key/i.test(msg))
    return "Registro relacionado inválido ou inexistente.";
  if (code === "23514" || /check constraint/i.test(msg))
    return "Os valores informados não atendem às regras de validação.";
  if (code === "22003" || /numeric field overflow/i.test(msg))
    return "Valor acima do limite permitido.";
  if (code === "23502" || /not-null/i.test(msg))
    return "Preencha todos os campos obrigatórios.";
  return msg || fallback;
}
