/**
 * Fase 12 — Registro dos cards do Dashboard Geral + shape do layout persistido.
 *
 * Módulo PURO (sem React/runtime de UI) para poder ser importado tanto no servidor
 * quanto em src/types/database.ts (estreitamento do jsonb `settings.dashboard_layout`).
 * Os ícones/títulos de UI ficam no client; aqui só ids, ordem padrão e a reconciliação
 * do layout (validar o jsonb e absorver cards novos de fases futuras sem quebrar).
 */
import { asPeriod, asView, type DashPeriod, type DashView } from "./period";

/** Ids dos cards do dashboard (ordem = ordem padrão). */
export const DASH_CARD_IDS = [
  "financeiro",
  "todo",
  "faturas",
  "agenda",
  "tarefas",
  "habitos",
  "estudos",
  "notificacoes",
] as const;
export type DashCardId = (typeof DASH_CARD_IDS)[number];

/** Título pt-BR de cada card (usado no cabeçalho e no menu "Personalizar"). */
export const DASH_CARD_TITLES: Record<DashCardId, string> = {
  financeiro: "Financeiro",
  todo: "TO-DO",
  faturas: "Cartões & Faturas",
  agenda: "Agenda",
  tarefas: "Tarefas & Rotinas",
  habitos: "Hábitos",
  estudos: "Estudos",
  notificacoes: "Notificações",
};

/** Preferência de layout do dashboard (persistida em settings.dashboard_layout). */
export type DashboardLayout = {
  /** Ordem dos cards (sempre contém todos os ids conhecidos). */
  order: DashCardId[];
  /** Cards ocultos (subconjunto de order). */
  hidden: DashCardId[];
  /** Período padrão. */
  period: DashPeriod;
  /** Visão padrão. */
  view: DashView;
};

/** Layout padrão (ordem natural, nada oculto, mês atual). */
export const DEFAULT_DASHBOARD_LAYOUT: DashboardLayout = {
  order: [...DASH_CARD_IDS],
  hidden: [],
  period: "mes",
  view: "mes",
};

const KNOWN = new Set<string>(DASH_CARD_IDS);

/** Filtra/dedup uma lista para apenas ids de card conhecidos. */
function cleanIds(value: unknown): DashCardId[] {
  if (!Array.isArray(value)) return [];
  const out: DashCardId[] = [];
  const seen = new Set<string>();
  for (const v of value) {
    if (typeof v === "string" && KNOWN.has(v) && !seen.has(v)) {
      seen.add(v);
      out.push(v as DashCardId);
    }
  }
  return out;
}

/**
 * Reconcilia um layout cru (jsonb desconhecido) num DashboardLayout válido:
 * mantém a ordem salva, ANEXA cards novos que ainda não estão na ordem (fases
 * futuras), descarta ids desconhecidos e garante period/view válidos. Nunca lança.
 */
export function normalizeLayout(raw: unknown): DashboardLayout {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

  const savedOrder = cleanIds(obj.order);
  // Anexa qualquer card conhecido ausente (preserva a ordem do usuário).
  const order: DashCardId[] = [...savedOrder];
  for (const id of DASH_CARD_IDS) {
    if (!order.includes(id)) order.push(id);
  }

  const hidden = cleanIds(obj.hidden).filter((id) => order.includes(id));

  return {
    order,
    hidden,
    period: asPeriod(obj.period),
    view: asView(obj.view),
  };
}

/** Cards visíveis na ordem salva (exclui ocultos). */
export function visibleCards(layout: DashboardLayout): DashCardId[] {
  const hidden = new Set(layout.hidden);
  return layout.order.filter((id) => !hidden.has(id));
}
