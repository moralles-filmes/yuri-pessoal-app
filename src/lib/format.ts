/**
 * Utilitários de formatação pt-BR (moeda BRL e datas).
 * Centralizados aqui para reuso em todos os módulos.
 */

const brlFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

/** Fuso oficial do sistema. Todo instante é lido/escrito como hora de Brasília. */
export const TIMEZONE = "America/Sao_Paulo";

/**
 * Offset fixo de Brasília. O Brasil **não** tem horário de verão desde 2019 (Decreto
 * 9.772/2019), então UTC-3 vale o ano inteiro — é o que permite converter "hora de parede"
 * → instante com uma string, sem biblioteca de fuso. Leitura (instante → hora de parede)
 * usa `Intl` com `timeZone`, que continuaria certo mesmo se o DST voltasse.
 */
export const SAO_PAULO_UTC_OFFSET = "-03:00";

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: TIMEZONE,
});

/** Formata um número como moeda brasileira (R$ 1.234,56). */
export function formatCurrency(value: number): string {
  return brlFormatter.format(Number.isFinite(value) ? value : 0);
}

/** Uma data pura 'yyyy-MM-dd' (coluna `date`), que não representa instante nenhum. */
function isDatePura(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

/**
 * Formata uma data no formato brasileiro (dd/mm/aaaa).
 *
 * Dois caminhos, de propósito:
 *  - **data pura** ('yyyy-MM-dd', vinda de coluna `date`): reordenada como TEXTO. Nunca vira
 *    `Date`, então nenhum fuso — nem do servidor, nem do dispositivo — pode deslocá-la.
 *  - **instante** (`Date`/epoch/ISO com hora): formatado no fuso de São Paulo.
 */
export function formatDate(date: Date | string | number): string {
  if (isDatePura(date)) {
    const [y, m, d] = date.split("-");
    return `${d}/${m}/${y}`;
  }
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  return dateFormatter.format(d);
}

/** Partes 'yyyy-MM-dd' de uma entrada: texto puro passa direto; instante vira data de SP. */
function partesData(date: Date | string | number): [string, string, string] | null {
  if (isDatePura(date)) {
    return date.split("-") as [string, string, string];
  }
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  return dateInSaoPaulo(d).split("-") as [string, string, string];
}

/**
 * Formata uma data segundo a preferência do usuário (Fase 14). Suporta os formatos
 * brasileiros/ISO de `DATE_FORMATS` (settings.date_format). Default: dd/MM/yyyy.
 */
export function formatDateWith(
  date: Date | string | number,
  fmt: "dd/MM/yyyy" | "dd/MM/yy" | "yyyy-MM-dd" = "dd/MM/yyyy",
): string {
  const partes = partesData(date);
  if (!partes) return "";
  const [yyyy, mm, dd] = partes;
  switch (fmt) {
    case "dd/MM/yy":
      return `${dd}/${mm}/${yyyy.slice(-2)}`;
    case "yyyy-MM-dd":
      return `${yyyy}-${mm}-${dd}`;
    default:
      return `${dd}/${mm}/${yyyy}`;
  }
}

const DIA_EXTENSO = new Intl.DateTimeFormat("pt-BR", {
  weekday: "short",
  day: "numeric",
  month: "long",
});

/**
 * Rótulo de um dia do extrato a partir de uma DATA PURA: "ter., 28 de julho".
 *
 * A data pura vira uma "data de grade" (meia-noite construída componente a componente, no
 * fuso local) só para o `Intl` saber o dia da semana — nunca um instante. Passar
 * 'yyyy-MM-dd' direto para `new Date()` o interpretaria como UTC e, em Brasília, mostraria
 * o dia anterior.
 */
export function diaExtenso(dataPura: string): string {
  if (!isDatePura(dataPura)) return "";
  const [y, m, d] = dataPura.split("-").map(Number);
  return DIA_EXTENSO.format(new Date(y, m - 1, d));
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

/**
 * Data do calendário ('yyyy-MM-dd') de um instante NO FUSO pt-BR (America/Sao_Paulo),
 * independente do timezone em que o código roda. Crítico no servidor: na Vercel o
 * processo roda em UTC, então `toDateInputValue(new Date())` "vira o dia" à noite
 * (ex.: 21h BRT = 00h UTC do dia seguinte) e faria uma fatura parecer atrasada um dia
 * antes do vencimento. `en-CA` formata como 'yyyy-MM-dd'.
 */
const SAO_PAULO_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
export function dateInSaoPaulo(date: Date): string {
  if (Number.isNaN(date.getTime())) return "";
  return SAO_PAULO_DATE.format(date);
}

/** Data de hoje ('yyyy-MM-dd') no fuso pt-BR. Use no servidor em vez de `toDateInputValue(new Date())`. */
export function hojeISO(): string {
  return dateInSaoPaulo(new Date());
}

const SAO_PAULO_TIME = new Intl.DateTimeFormat("pt-BR", {
  timeZone: TIMEZONE,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** Hora de parede ('HH:mm') de um instante, em Brasília. Par de leitura do `dateInSaoPaulo`. */
export function timeInSaoPaulo(date: Date): string {
  if (Number.isNaN(date.getTime())) return "";
  return SAO_PAULO_TIME.format(date);
}

/**
 * "Hora de parede em Brasília" → instante.
 *
 * O usuário digita 19:00 querendo dizer 19:00 **em Brasília**, não 19:00 no fuso do aparelho
 * dele. `new Date("2026-07-19T19:00")` resolveria pelo fuso do dispositivo — num celular
 * configurado em outro fuso (viagem, VPN, tablet errado) o evento entraria no banco com
 * horas de diferença. Ancorar no offset fixo remove a ambiguidade.
 *
 * @param data 'yyyy-MM-dd'  @param hora 'HH:mm' (default meia-noite)
 */
export function saoPauloWallClockToInstant(data: string, hora = "00:00"): Date {
  const hhmm = /^\d{2}:\d{2}/.test(hora) ? hora.slice(0, 5) : "00:00";
  return new Date(`${data}T${hhmm}:00${SAO_PAULO_UTC_OFFSET}`);
}

/** Instante → valor de `<input type="datetime-local">` ('yyyy-MM-ddTHH:mm') em Brasília. */
export function toDateTimeLocalInSaoPaulo(date: Date): string {
  if (Number.isNaN(date.getTime())) return "";
  return `${dateInSaoPaulo(date)}T${timeInSaoPaulo(date)}`;
}
