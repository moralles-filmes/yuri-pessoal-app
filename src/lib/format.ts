/**
 * Utilitários de formatação pt-BR (moeda BRL e datas).
 * Centralizados aqui para reuso em todos os módulos.
 */

const brlFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

/** Formata um número como moeda brasileira (R$ 1.234,56). */
export function formatCurrency(value: number): string {
  return brlFormatter.format(Number.isFinite(value) ? value : 0);
}

/** Formata uma data no formato brasileiro (dd/mm/aaaa). */
export function formatDate(date: Date | string | number): string {
  let d: Date;
  if (date instanceof Date) {
    d = date;
  } else if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    // Data pura 'yyyy-MM-dd': interpreta como data LOCAL. Evita o deslocamento de
    // 1 dia que `new Date("yyyy-MM-dd")` provoca ao parsear como UTC (crítico para
    // datas de fechamento/vencimento de fatura em fusos negativos como o BR).
    const [y, m, day] = date.split("-").map(Number);
    d = new Date(y, m - 1, day);
  } else {
    d = new Date(date);
  }
  return dateFormatter.format(d);
}

/** Converte qualquer entrada de data num Date local (sem o shift UTC de 'yyyy-MM-dd'). */
function toLocalDate(date: Date | string | number): Date {
  if (date instanceof Date) return date;
  if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const [y, m, day] = date.split("-").map(Number);
    return new Date(y, m - 1, day);
  }
  return new Date(date);
}

/**
 * Formata uma data segundo a preferência do usuário (Fase 14). Suporta os formatos
 * brasileiros/ISO de `DATE_FORMATS` (settings.date_format). Default: dd/MM/yyyy.
 */
export function formatDateWith(
  date: Date | string | number,
  fmt: "dd/MM/yyyy" | "dd/MM/yy" | "yyyy-MM-dd" = "dd/MM/yyyy",
): string {
  const d = toLocalDate(date);
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = String(d.getFullYear());
  const yy = yyyy.slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  switch (fmt) {
    case "dd/MM/yy":
      return `${dd}/${mm}/${yy}`;
    case "yyyy-MM-dd":
      return `${yyyy}-${mm}-${dd}`;
    default:
      return `${dd}/${mm}/${yyyy}`;
  }
}

/** Gera iniciais (até 2 letras) a partir de um nome ou e-mail. */
export function getInitials(nameOrEmail?: string | null): string {
  if (!nameOrEmail) return "U";
  const base = nameOrEmail.split("@")[0].replace(/[._-]+/g, " ").trim();
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "U";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Converte uma string digitada (ex.: "1.234,56", "1234,56" ou "1234.56") em número.
 * Retorna 0 quando não for possível interpretar. Útil para inputs de moeda.
 */
export function parseCurrencyToNumber(input: string): number {
  const cleaned = String(input)
    .trim()
    .replace(/[^\d.,-]/g, "");
  if (!cleaned) return 0;
  // Se houver vírgula, ela é o separador decimal (padrão BR): remove pontos de milhar.
  const normalized = cleaned.includes(",")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned;
  const n = Number.parseFloat(normalized);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Converte reais (numeric(14,2), ex.: 1234.56) para centavos inteiros (123456).
 * Trabalhar em centavos evita erro de ponto flutuante ao dividir parcelas (Fase 04).
 * `Math.round` neutraliza imprecisões como 19.99 * 100 = 1998.9999999999998.
 */
export function reaisParaCentavos(valor: number): number {
  return Math.round((Number.isFinite(valor) ? valor : 0) * 100);
}

/** Converte centavos inteiros (123456) de volta para reais (1234.56). */
export function centavosParaReais(centavos: number): number {
  return Math.round(centavos) / 100;
}

/** Formata uma data como 'yyyy-MM-dd' (valor de um <input type="date">). */
export function toDateInputValue(date: Date | string | number): string {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
