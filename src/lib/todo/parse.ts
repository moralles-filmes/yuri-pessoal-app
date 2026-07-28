/**
 * Fase 15 — Módulo TO-DO · Interpretação de linguagem natural na criação rápida.
 *
 * Transforma "Pagar internet amanhã às 10h #casa @contas p1" em campos estruturados.
 *
 * PRINCÍPIOS (valem como contrato desta função):
 *  1. **Função pura.** `hoje` é injetado (`todayIso`); nada aqui chama `Date.now()`.
 *  2. **Não altera o texto do usuário.** Devolve `title` (o texto sem os trechos
 *     reconhecidos) e a lista de `tokens` com os intervalos exatos — quem chama decide
 *     o que mostrar. A caixa de digitação continua com o texto original.
 *  3. **Nada é adivinhado em silêncio.** Todo campo preenchido tem um token
 *     correspondente, com o texto encontrado e uma descrição em pt-BR, para a interface
 *     confirmar o que entendeu ANTES de salvar.
 *  4. **Só reconhece o que tem certeza.** Padrão ambíguo → ignora e deixa no título.
 *
 * A comparação é feita sobre uma cópia sem acentos e em minúsculas com o MESMO
 * comprimento do original (troca 1 caractere por 1 caractere), então todo índice de
 * regex vale igualmente para o texto original.
 */
import {
  TODO_PRIORITY_LABELS,
  WEEKDAY_LABELS,
  type TodoPriority,
} from "@/lib/todo/constants";
import {
  addDaysIso,
  daysInMonth,
  describeRule,
  nextOccurrence,
  weekdayOf,
  type TodoRecurrenceRule,
} from "@/lib/todo/recurrence";

/* ───────────────────────────── Tipos ───────────────────────────── */

export type ParsedTokenKind =
  | "data"
  | "hora"
  | "prazo"
  | "prioridade"
  | "etiqueta"
  | "projeto"
  | "recorrencia";

export interface ParsedToken {
  kind: ParsedTokenKind;
  /** Trecho exato do texto original. */
  text: string;
  /** O que foi entendido, em pt-BR (vai no chip de confirmação). */
  label: string;
  start: number;
  end: number;
  /** true quando o `#projeto`/`@etiqueta` não existe ainda. */
  unresolved?: boolean;
}

export interface ParsedQuickTask {
  /** Texto sem os trechos reconhecidos — é o que vira o título da tarefa. */
  title: string;
  scheduledDate: string | null;
  /** 'HH:mm'. */
  scheduledTime: string | null;
  deadlineAt: string | null;
  priority: TodoPriority | null;
  projectId: string | null;
  /** Nome escrito depois do `#`, mesmo quando não existe projeto com ele. */
  projectName: string | null;
  /** Ids das etiquetas que já existem. */
  labelIds: string[];
  /** Nomes das etiquetas escritas com `@` que ainda não existem. */
  newLabelNames: string[];
  recurrence: TodoRecurrenceRule | null;
  tokens: ParsedToken[];
}

export interface ParseNamed {
  id: string;
  name: string;
}

export interface ParseOptions {
  projects?: ParseNamed[];
  labels?: ParseNamed[];
}

/* ───────────────────────────── Normalização ───────────────────────────── */

/**
 * Remove acentos preservando o comprimento (1 caractere → 1 caractere). `normalize`
 * do JS não serve aqui porque decompõe em dois code points e desalinha os índices.
 */
const ACCENT_MAP: Record<string, string> = {
  á: "a", à: "a", â: "a", ã: "a", ä: "a",
  é: "e", è: "e", ê: "e", ë: "e",
  í: "i", ì: "i", î: "i", ï: "i",
  ó: "o", ò: "o", ô: "o", õ: "o", ö: "o",
  ú: "u", ù: "u", û: "u", ü: "u",
  ç: "c", ñ: "n",
};

export function fold(text: string): string {
  let out = "";
  for (const char of text.toLowerCase()) {
    out += ACCENT_MAP[char] ?? char;
  }
  return out;
}

/* ───────────────────────────── Dicionários ───────────────────────────── */

const WEEKDAYS: Record<string, number> = {
  domingo: 0,
  segunda: 1,
  terca: 2,
  quarta: 3,
  quinta: 4,
  sexta: 5,
  sabado: 6,
};

const WEEKDAY_ALT = "domingo|segunda|terca|quarta|quinta|sexta|sabado";

const MONTHS: Record<string, number> = {
  janeiro: 1, jan: 1,
  fevereiro: 2, fev: 2,
  marco: 3, mar: 3,
  abril: 4, abr: 4,
  maio: 5, mai: 5,
  junho: 6, jun: 6,
  julho: 7, jul: 7,
  agosto: 8, ago: 8,
  setembro: 9, set: 9,
  outubro: 10, out: 10,
  novembro: 11, nov: 11,
  dezembro: 12, dez: 12,
};

const MONTH_ALT = Object.keys(MONTHS).join("|");

/* ───────────────────────────── Utilidades de data ───────────────────────────── */

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function ymdToIso(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}`;
}

function partsOf(iso: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

/** Valida dia/mês reais (rejeita 31/02 e 30/02 em vez de "corrigir" em silêncio). */
function validDate(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1) return false;
  return d <= daysInMonth(y, m);
}

/** Próxima ocorrência do dia da semana, sempre no futuro (hoje → daqui a 7 dias). */
function nextWeekday(todayIso: string, target: number): string {
  const delta = (target - weekdayOf(todayIso) + 7) % 7;
  return addDaysIso(todayIso, delta === 0 ? 7 : delta);
}

/** Próximo dia N do mês: neste mês se ainda não passou, senão no mês seguinte. */
function nextDayOfMonth(todayIso: string, day: number): string | null {
  const today = partsOf(todayIso);
  if (!today) return null;
  if (day >= today.d && validDate(today.y, today.m, day)) {
    return ymdToIso(today.y, today.m, day);
  }
  let { y, m } = today;
  for (let i = 0; i < 14; i++) {
    m += 1;
    if (m > 12) { m = 1; y += 1; }
    if (validDate(y, m, day)) return ymdToIso(y, m, day);
  }
  return null;
}

/** Ano de 2 dígitos → 20xx. */
function fullYear(raw: string): number {
  const n = Number(raw);
  return raw.length <= 2 ? 2000 + n : n;
}

function addMonthsIso(iso: string, months: number): string | null {
  const p = partsOf(iso);
  if (!p) return null;
  const total = p.y * 12 + (p.m - 1) + months;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return ymdToIso(y, m, Math.min(p.d, daysInMonth(y, m)));
}

/* ───────────────────────────── Máscara de consumo ───────────────────────────── */

/**
 * Controla quais posições do texto já foram usadas por um reconhecedor, para que
 * "toda segunda" não seja lido de novo como a data "segunda".
 */
class Mask {
  private readonly used: boolean[];

  constructor(length: number) {
    this.used = new Array<boolean>(length).fill(false);
  }

  free(start: number, end: number): boolean {
    for (let i = start; i < end; i++) if (this.used[i]) return false;
    return true;
  }

  take(start: number, end: number): void {
    for (let i = start; i < end; i++) this.used[i] = true;
  }

  /** Reconstrói o texto sem os trechos consumidos, com espaços normalizados. */
  remainder(original: string): string {
    let out = "";
    for (let i = 0; i < original.length; i++) {
      out += this.used[i] ? " " : original[i];
    }
    return out.replace(/\s+/g, " ").trim();
  }
}

/* ───────────────────────────── Reconhecedores ───────────────────────────── */

type Handler = (match: RegExpExecArray) => { label: string; apply: () => void } | null;

/**
 * Aplica um padrão sobre o texto normalizado, aceitando a primeira ocorrência ainda
 * livre. `handler` devolve null quando o texto casa mas não faz sentido (31/02),
 * e aí a busca continua.
 */
function scan(
  folded: string,
  original: string,
  mask: Mask,
  tokens: ParsedToken[],
  kind: ParsedTokenKind,
  pattern: RegExp,
  handler: Handler,
): boolean {
  const re = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
  let match: RegExpExecArray | null;
  while ((match = re.exec(folded)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (match[0].length === 0) { re.lastIndex += 1; continue; }
    if (!mask.free(start, end)) continue;

    const result = handler(match);
    if (!result) continue;

    result.apply();
    mask.take(start, end);
    tokens.push({
      kind,
      text: original.slice(start, end).trim(),
      label: result.label,
      start,
      end,
    });
    return true;
  }
  return false;
}

/* ───────────────────────────── Parser ───────────────────────────── */

/**
 * Interpreta o texto da criação rápida. `todayIso` é 'yyyy-MM-dd' e define o "hoje"
 * (no servidor vem de `hojeISO()`, fuso America/Sao_Paulo).
 */
export function parseQuickTask(
  input: string,
  todayIso: string,
  options: ParseOptions = {},
): ParsedQuickTask {
  const original = input;
  const folded = fold(original);
  const mask = new Mask(original.length);
  const tokens: ParsedToken[] = [];

  let scheduledDate: string | null = null;
  let scheduledTime: string | null = null;
  let deadlineAt: string | null = null;
  let priority: TodoPriority | null = null;
  let projectId: string | null = null;
  let projectName: string | null = null;
  const labelIds: string[] = [];
  const newLabelNames: string[] = [];
  let recurrence: TodoRecurrenceRule | null = null;

  /* ── 1. Etiquetas (@) e projeto (#) ──
   * Casam pelo NOME CADASTRADO mais longo primeiro, para "@compras de casa" achar a
   * etiqueta "compras de casa" em vez de parar em "compras". Sem correspondência,
   * cai para uma única palavra e marca como não encontrado. */
  const byLongestName = (list: ParseNamed[]) =>
    [...list].sort((a, b) => b.name.length - a.name.length);

  function matchNamed(list: ParseNamed[], afterIndex: number): ParseNamed | null {
    const rest = folded.slice(afterIndex);
    for (const item of byLongestName(list)) {
      const name = fold(item.name);
      if (!name) continue;
      if (rest.startsWith(name)) {
        // Só aceita se terminar em fronteira de palavra.
        const nextChar = rest[name.length];
        if (nextChar === undefined || !/[a-z0-9]/.test(nextChar)) return item;
      }
    }
    return null;
  }

  // Etiquetas: pode haver várias.
  {
    const re = /@([a-z0-9_][a-z0-9_ -]*)/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(folded)) !== null) {
      const at = match.index;
      const known = matchNamed(options.labels ?? [], at + 1);
      const rawName = known ? fold(known.name) : /^[a-z0-9_-]+/.exec(match[1])?.[0] ?? "";
      if (!rawName) continue;
      const end = at + 1 + rawName.length;
      if (!mask.free(at, end)) continue;

      const display = original.slice(at + 1, end);
      if (known) {
        if (!labelIds.includes(known.id)) labelIds.push(known.id);
      } else if (!newLabelNames.includes(display)) {
        newLabelNames.push(display);
      }
      mask.take(at, end);
      tokens.push({
        kind: "etiqueta",
        text: original.slice(at, end),
        label: known ? `Etiqueta @${known.name}` : `Nova etiqueta @${display}`,
        start: at,
        end,
        unresolved: !known,
      });
      re.lastIndex = end;
    }
  }

  // Projeto: apenas o primeiro.
  {
    const re = /#([a-z0-9_][a-z0-9_ -]*)/g;
    const match = re.exec(folded);
    if (match) {
      const at = match.index;
      const known = matchNamed(options.projects ?? [], at + 1);
      const rawName = known ? fold(known.name) : /^[a-z0-9_-]+/.exec(match[1])?.[0] ?? "";
      if (rawName) {
        const end = at + 1 + rawName.length;
        if (mask.free(at, end)) {
          const display = original.slice(at + 1, end);
          projectName = known ? known.name : display;
          projectId = known?.id ?? null;
          mask.take(at, end);
          tokens.push({
            kind: "projeto",
            text: original.slice(at, end),
            label: known ? `Projeto ${known.name}` : `Projeto "${display}" não encontrado`,
            start: at,
            end,
            unresolved: !known,
          });
        }
      }
    }
  }

  /* ── 2. Prioridade ── */
  scan(folded, original, mask, tokens, "prioridade", /\bp([1-4])\b/, (m) => {
    const value = Number(m[1]) as TodoPriority;
    return {
      label: TODO_PRIORITY_LABELS[value],
      apply: () => { priority = value; },
    };
  });

  /* ── 3. Recorrência — ANTES das datas ──
   * "toda segunda" é uma regra semanal, não a data da próxima segunda. Como o trecho
   * é consumido, o reconhecedor de data não o vê mais. */
  const setRule = (rule: TodoRecurrenceRule) => () => { recurrence = rule; };
  const base = { mode: "fixo" as const, intervalCount: 1 };

  const recurrenceFound =
    // "todo dia 10" → mensal no dia 10 (precede "todo dia").
    scan(folded, original, mask, tokens, "recorrencia",
      /\btodo(?:s os)? dias? (\d{1,2})\b/, (m) => {
        const day = Number(m[1]);
        if (day < 1 || day > 31) return null;
        const rule: TodoRecurrenceRule = { ...base, frequency: "mensal", dayOfMonth: day };
        return { label: describeRule(rule), apply: setRule(rule) };
      }) ||
    // Último / primeiro dia útil do mês.
    scan(folded, original, mask, tokens, "recorrencia",
      /\btodo (?:ultimo|último) dia util do mes\b|\bultimo dia util do mes\b/, () => {
        const rule: TodoRecurrenceRule = {
          ...base, frequency: "mensal", businessDayRule: "ultimo_dia_util",
        };
        return { label: describeRule(rule), apply: setRule(rule) };
      }) ||
    scan(folded, original, mask, tokens, "recorrencia",
      /\btodo primeiro dia util do mes\b|\bprimeiro dia util do mes\b/, () => {
        const rule: TodoRecurrenceRule = {
          ...base, frequency: "mensal", businessDayRule: "primeiro_dia_util",
        };
        return { label: describeRule(rule), apply: setRule(rule) };
      }) ||
    // Dias úteis.
    scan(folded, original, mask, tokens, "recorrencia",
      /\b(?:todo dia util|todos os dias uteis|em dias uteis|dias uteis)\b/, () => {
        const rule: TodoRecurrenceRule = {
          ...base, frequency: "diaria", businessDayRule: "apenas_dias_uteis",
        };
        return { label: describeRule(rule), apply: setRule(rule) };
      }) ||
    // "a cada 2 semanas" / "de 2 em 2 dias".
    scan(folded, original, mask, tokens, "recorrencia",
      /\b(?:a cada (\d{1,3})|de (\d{1,3}) em \2) (dias?|semanas?|mes(?:es)?|meses|anos?)\b/, (m) => {
        const n = Number(m[1] ?? m[2]);
        if (!Number.isFinite(n) || n < 1) return null;
        const unit = m[3];
        const frequency = unit.startsWith("dia")
          ? ("diaria" as const)
          : unit.startsWith("semana")
            ? ("semanal" as const)
            : unit.startsWith("ano")
              ? ("anual" as const)
              : ("mensal" as const);
        const rule: TodoRecurrenceRule = { ...base, frequency, intervalCount: n };
        return { label: describeRule(rule), apply: setRule(rule) };
      }) ||
    // "toda segunda", "todas as sextas".
    scan(folded, original, mask, tokens, "recorrencia",
      new RegExp(String.raw`\btod[ao]s?(?: as| os)? (${WEEKDAY_ALT})s?(?:-feiras?)?\b`), (m) => {
        const day = WEEKDAYS[m[1]];
        if (day === undefined) return null;
        const rule: TodoRecurrenceRule = { ...base, frequency: "semanal", daysOfWeek: [day] };
        return { label: describeRule(rule), apply: setRule(rule) };
      }) ||
    scan(folded, original, mask, tokens, "recorrencia",
      /\b(?:todo(?:s os)? dias?|diariamente)\b/, () => {
        const rule: TodoRecurrenceRule = { ...base, frequency: "diaria" };
        return { label: describeRule(rule), apply: setRule(rule) };
      }) ||
    scan(folded, original, mask, tokens, "recorrencia",
      /\b(?:tod[ao]s?(?: as)? semanas?|semanalmente)\b/, () => {
        const rule: TodoRecurrenceRule = { ...base, frequency: "semanal" };
        return { label: describeRule(rule), apply: setRule(rule) };
      }) ||
    scan(folded, original, mask, tokens, "recorrencia",
      /\b(?:todo(?:s os)? mes(?:es)?|mensalmente)\b/, () => {
        const rule: TodoRecurrenceRule = { ...base, frequency: "mensal" };
        return { label: describeRule(rule), apply: setRule(rule) };
      }) ||
    scan(folded, original, mask, tokens, "recorrencia",
      /\b(?:todo(?:s os)? anos?|anualmente)\b/, () => {
        const rule: TodoRecurrenceRule = { ...base, frequency: "anual" };
        return { label: describeRule(rule), apply: setRule(rule) };
      });

  // "…a cada 7 dias após concluir" muda só o modo da regra já reconhecida.
  if (recurrenceFound) {
    scan(folded, original, mask, tokens, "recorrencia",
      /\b(?:apos (?:a )?conclusao|depois de concluir|apos concluir)\b/, () => ({
        label: "Contar a partir da conclusão",
        apply: () => {
          if (recurrence) recurrence = { ...recurrence, mode: "apos_conclusao" };
        },
      }));
  }

  /* ── 4. Prazo ("até <data>") — antes da data programada ── */
  const dateAlternatives = [
    String.raw`(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?`,
    String.raw`(\d{1,2}) de (${MONTH_ALT})(?: de (\d{4}))?`,
    String.raw`depois de amanha`,
    String.raw`amanha`,
    String.raw`hoje`,
    String.raw`(?:proxim[ao] |na |neste |nesta )?(${WEEKDAY_ALT})(?:-feira)?(?: que vem)?`,
    String.raw`dia (\d{1,2})`,
    String.raw`em (\d{1,3}) (dias?|semanas?|mes(?:es)?|meses)`,
  ];

  /** Resolve um trecho de data já isolado. Devolve null se não fizer sentido. */
  function resolveDate(text: string): { iso: string; label: string } | null {
    const t = text.trim();

    const dmy = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/.exec(t);
    if (dmy) {
      const d = Number(dmy[1]);
      const m = Number(dmy[2]);
      const today = partsOf(todayIso);
      if (!today) return null;
      if (dmy[3]) {
        const y = fullYear(dmy[3]);
        if (!validDate(y, m, d)) return null;
        return { iso: ymdToIso(y, m, d), label: `${pad(d)}/${pad(m)}/${y}` };
      }
      // Sem ano: este ano; se já passou, o ano que vem.
      for (const y of [today.y, today.y + 1]) {
        if (!validDate(y, m, d)) continue;
        const iso = ymdToIso(y, m, d);
        if (iso >= todayIso) return { iso, label: `${pad(d)}/${pad(m)}/${y}` };
      }
      return null;
    }

    const named = new RegExp(String.raw`^(\d{1,2}) de (${MONTH_ALT})(?: de (\d{4}))?$`).exec(t);
    if (named) {
      const d = Number(named[1]);
      const m = MONTHS[named[2]];
      const today = partsOf(todayIso);
      if (!today || m === undefined) return null;
      const years = named[3] ? [Number(named[3])] : [today.y, today.y + 1];
      for (const y of years) {
        if (!validDate(y, m, d)) continue;
        const iso = ymdToIso(y, m, d);
        if (named[3] || iso >= todayIso) return { iso, label: `${pad(d)}/${pad(m)}/${y}` };
      }
      return null;
    }

    if (t === "hoje") return { iso: todayIso, label: "Hoje" };
    if (t === "amanha") return { iso: addDaysIso(todayIso, 1), label: "Amanhã" };
    if (t === "depois de amanha") {
      return { iso: addDaysIso(todayIso, 2), label: "Depois de amanhã" };
    }

    const inN = /^em (\d{1,3}) (dias?|semanas?|mes(?:es)?|meses)$/.exec(t);
    if (inN) {
      const n = Number(inN[1]);
      if (n < 1) return null;
      const unit = inN[2];
      if (unit.startsWith("dia")) {
        return { iso: addDaysIso(todayIso, n), label: `Em ${n} dia(s)` };
      }
      if (unit.startsWith("semana")) {
        return { iso: addDaysIso(todayIso, n * 7), label: `Em ${n} semana(s)` };
      }
      const iso = addMonthsIso(todayIso, n);
      return iso ? { iso, label: `Em ${n} mês(es)` } : null;
    }

    const dayOnly = /^dia (\d{1,2})$/.exec(t);
    if (dayOnly) {
      const iso = nextDayOfMonth(todayIso, Number(dayOnly[1]));
      if (!iso) return null;
      const p = partsOf(iso);
      return p ? { iso, label: `${pad(p.d)}/${pad(p.m)}/${p.y}` } : null;
    }

    const weekday = new RegExp(
      String.raw`^(?:proxim[ao] |na |neste |nesta )?(${WEEKDAY_ALT})(?:-feira)?(?: que vem)?$`,
    ).exec(t);
    if (weekday) {
      const day = WEEKDAYS[weekday[1]];
      if (day === undefined) return null;
      return { iso: nextWeekday(todayIso, day), label: WEEKDAY_LABELS[day] };
    }

    return null;
  }

  scan(folded, original, mask, tokens, "prazo",
    new RegExp(String.raw`\b(?:ate|prazo|vence(?:\s+em)?)\s+(?:o\s+dia\s+)?(${dateAlternatives.join("|")})\b`),
    (m) => {
      const resolved = resolveDate(m[1]);
      if (!resolved) return null;
      return {
        label: `Prazo final: ${resolved.label}`,
        apply: () => { deadlineAt = resolved.iso; },
      };
    });

  /* ── 5. Horário ── */
  // "às" já chega aqui sem acento (o texto foi normalizado), por isso só "as ".
  scan(folded, original, mask, tokens, "hora",
    /\b(?:as )?(\d{1,2})(?::(\d{2})|h(\d{2})|h)(?!\d)/, (m) => {
      const hour = Number(m[1]);
      const minute = Number(m[2] ?? m[3] ?? 0);
      if (hour > 23 || minute > 59) return null;
      const value = `${pad(hour)}:${pad(minute)}`;
      return { label: `Às ${value}`, apply: () => { scheduledTime = value; } };
    });

  scan(folded, original, mask, tokens, "hora", /\bmeio-?dia\b/, () => ({
    label: "Às 12:00",
    apply: () => { scheduledTime = "12:00"; },
  }));

  /* ── 6. Data programada ── */
  scan(folded, original, mask, tokens, "data",
    new RegExp(String.raw`\b(?:para\s+|em\s+)?(${dateAlternatives.join("|")})\b`),
    (m) => {
      const resolved = resolveDate(m[1]);
      if (!resolved) return null;
      return {
        label: resolved.label,
        apply: () => { scheduledDate = resolved.iso; },
      };
    });

  /* ── 7. Coerência final ──
   * Tarefa recorrente PRECISA de uma data (o schema exige). Sem data explícita,
   * usa a primeira ocorrência a partir de hoje — inclusive hoje, se couber. */
  if (recurrence && !scheduledDate) {
    scheduledDate = nextOccurrence(recurrence, addDaysIso(todayIso, -1));
  }

  return {
    title: mask.remainder(original),
    scheduledDate,
    scheduledTime,
    deadlineAt,
    priority,
    projectId,
    projectName,
    labelIds,
    newLabelNames,
    recurrence,
    // Ordem de leitura, não de reconhecimento — os chips seguem o texto.
    tokens: tokens.sort((a, b) => a.start - b.start),
  };
}

/** true quando o parser encontrou alguma coisa (a interface só mostra os chips então). */
export function hasParsedAnything(parsed: ParsedQuickTask): boolean {
  return parsed.tokens.length > 0;
}

/**
 * Converte a regra para o formato snake_case que o Zod das actions espera
 * (`todoRecurrenceSchema`). Fica aqui, e não no editor de recorrência, para este
 * módulo continuar puro e livre de componentes.
 */
export function recurrenceToPayload(rule: TodoRecurrenceRule) {
  return {
    frequency: rule.frequency,
    interval_count: rule.intervalCount,
    days_of_week: rule.daysOfWeek ?? null,
    day_of_month: rule.dayOfMonth ?? null,
    month_of_year: rule.monthOfYear ?? null,
    week_of_month: rule.weekOfMonth ?? null,
    business_day_rule: rule.businessDayRule ?? null,
    recurrence_mode: rule.mode,
    starts_on: rule.startsOn ?? null,
    ends_on: rule.endsOn ?? null,
    max_occurrences: rule.maxOccurrences ?? null,
    is_paused: rule.isPaused ?? false,
  };
}
