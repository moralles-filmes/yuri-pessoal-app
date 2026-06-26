/**
 * Fase 12 — Período e visão do Dashboard Geral (lógica PURA, testada em period.test.ts).
 *
 * SEM efeitos colaterais: `today` é SEMPRE injetado ('yyyy-MM-dd', data LOCAL pt-BR —
 * nunca UTC, mesma regra de datas das fases anteriores). `resolveWindow` traduz o
 * período escolhido (hoje/semana/mês/mês anterior/personalizado) numa janela concreta
 * [from, to] inclusiva que propaga para TODOS os cards, mais o mês de referência usado
 * pelos cards financeiros (que são mensais por natureza).
 */
import {
  endOfMonth,
  endOfWeek,
  format,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";

const ISO = "yyyy-MM-dd";

/* ───────────────────────────── Período ───────────────────────────── */

/** Presets de período (filtro principal — define a janela [from, to]). */
export const DASH_PERIODS = [
  "hoje",
  "semana",
  "mes",
  "mes_anterior",
  "custom",
] as const;
export type DashPeriod = (typeof DASH_PERIODS)[number];

export const DASH_PERIOD_LABELS: Record<DashPeriod, string> = {
  hoje: "Hoje",
  semana: "Semana",
  mes: "Mês",
  mes_anterior: "Mês anterior",
  custom: "Personalizado",
};

/* ───────────────────────────── Visão (granularidade) ───────────────────────────── */

/** Visão (granularidade) — alternância dia/semana/mês. */
export const DASH_VIEWS = ["dia", "semana", "mes"] as const;
export type DashView = (typeof DASH_VIEWS)[number];

export const DASH_VIEW_LABELS: Record<DashView, string> = {
  dia: "Dia",
  semana: "Semana",
  mes: "Mês",
};

/** O preset de período correspondente a cada visão (o toggle de visão é um atalho). */
export const VIEW_TO_PERIOD: Record<DashView, DashPeriod> = {
  dia: "hoje",
  semana: "semana",
  mes: "mes",
};

/* ───────────────────────────── Tipos & helpers ───────────────────────────── */

/** Janela resolvida que propaga para todos os cards. */
export type DashWindow = {
  period: DashPeriod;
  /** Visão derivada da janela (para destacar o toggle dia/semana/mês). */
  view: DashView;
  /** Início inclusivo 'yyyy-MM-dd' (data local). */
  from: string;
  /** Fim inclusivo 'yyyy-MM-dd' (data local). */
  to: string;
  /** Mês de referência 'yyyy-MM' para os cards financeiros (mensais). */
  mes: string;
};

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

/** True se a string é uma data 'yyyy-MM-dd' válida (e existe no calendário). */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_RE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return (
    dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d
  );
}

/** Converte 'yyyy-MM-dd' em Date LOCAL (00:00) — evita o parse UTC de new Date(iso). */
function localDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Dias entre duas datas locais (toIso - fromIso). */
function daysBetween(fromIso: string, toIso: string): number {
  return Math.round(
    (localDate(toIso).getTime() - localDate(fromIso).getTime()) / 86_400_000,
  );
}

/** Visão derivada do tamanho de uma janela [from, to] (para o período custom). */
function viewForSpan(fromIso: string, toIso: string): DashView {
  const days = daysBetween(fromIso, toIso) + 1;
  if (days <= 1) return "dia";
  if (days <= 7) return "semana";
  return "mes";
}

/* ───────────────────────────── Resolução da janela ───────────────────────────── */

/**
 * Resolve a janela concreta a partir do período. Para `custom`, valida `from`/`to`
 * (inverte se vierem trocados) e cai para `mes` quando inválidos. Semana = segunda a
 * domingo (weekStartsOn:1), igual ao resto do app (hábitos/estudos/financeiro).
 */
export function resolveWindow(params: {
  period: DashPeriod;
  today: string;
  from?: string | null;
  to?: string | null;
}): DashWindow {
  const today = isIsoDate(params.today)
    ? params.today
    : format(new Date(), ISO);
  const t = localDate(today);

  switch (params.period) {
    case "hoje":
      return { period: "hoje", view: "dia", from: today, to: today, mes: today.slice(0, 7) };

    case "semana": {
      const from = format(startOfWeek(t, { weekStartsOn: 1 }), ISO);
      const to = format(endOfWeek(t, { weekStartsOn: 1 }), ISO);
      return { period: "semana", view: "semana", from, to, mes: today.slice(0, 7) };
    }

    case "mes": {
      const from = format(startOfMonth(t), ISO);
      const to = format(endOfMonth(t), ISO);
      return { period: "mes", view: "mes", from, to, mes: to.slice(0, 7) };
    }

    case "mes_anterior": {
      const p = subMonths(t, 1);
      const from = format(startOfMonth(p), ISO);
      const to = format(endOfMonth(p), ISO);
      return { period: "mes_anterior", view: "mes", from, to, mes: from.slice(0, 7) };
    }

    case "custom": {
      let from = params.from ?? null;
      let to = params.to ?? null;
      if (!isIsoDate(from) || !isIsoDate(to)) {
        // Personalizado incompleto/ inválido → cai para o mês atual (sem quebrar).
        return resolveWindow({ period: "mes", today });
      }
      if (from > to) [from, to] = [to, from]; // datas trocadas
      return {
        period: "custom",
        view: viewForSpan(from, to),
        from,
        to,
        mes: to.slice(0, 7),
      };
    }

    default:
      return resolveWindow({ period: "mes", today });
  }
}

/* ───────────────────────────── Rótulos ───────────────────────────── */

/** 'yyyy-MM-dd' → 'dd/MM'. */
function ddMM(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

/** 'yyyy-MM' → "junho de 2026" (pt-BR). */
function monthYear(mes: string): string {
  const [y, m] = mes.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
  }).format(new Date(y, m - 1, 1));
}

/** Rótulo legível pt-BR da janela (para o cabeçalho do dashboard). */
export function windowLabel(w: DashWindow): string {
  switch (w.period) {
    case "hoje":
      return `Hoje · ${ddMM(w.from)}/${w.from.slice(0, 4)}`;
    case "semana":
      return `Semana · ${ddMM(w.from)} a ${ddMM(w.to)}`;
    case "mes":
    case "mes_anterior":
      return monthYear(w.mes).replace(/^\w/, (c) => c.toUpperCase());
    case "custom":
      return `${ddMM(w.from)}/${w.from.slice(0, 4)} – ${ddMM(w.to)}/${w.to.slice(0, 4)}`;
    default:
      return "";
  }
}

/** Sufixo curto pt-BR do período (ex.: "no período" / "na semana") para rótulos de card. */
export function periodWord(period: DashPeriod): string {
  switch (period) {
    case "hoje":
      return "hoje";
    case "semana":
      return "na semana";
    case "mes":
      return "no mês";
    case "mes_anterior":
      return "mês anterior";
    case "custom":
      return "no período";
    default:
      return "no período";
  }
}

/** Normaliza um valor desconhecido para um DashPeriod válido (default 'mes'). */
export function asPeriod(value: unknown): DashPeriod {
  return DASH_PERIODS.includes(value as DashPeriod) ? (value as DashPeriod) : "mes";
}

/** Normaliza um valor desconhecido para uma DashView válida (default 'mes'). */
export function asView(value: unknown): DashView {
  return DASH_VIEWS.includes(value as DashView) ? (value as DashView) : "mes";
}
