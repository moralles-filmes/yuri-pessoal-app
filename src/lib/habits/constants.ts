/**
 * Fonte única de verdade dos enums de Hábitos (Fase 10).
 * Os arrays `as const` alimentam os tipos TS (src/types/database.ts), os schemas
 * Zod (src/lib/validators/habit.ts) e os rótulos pt-BR da UI. Os valores precisam
 * casar com os CHECK constraints das migrations (habits.category/frequency/unit).
 */

/* ───────────────────────────── Categorias ───────────────────────────── */

/** Categoria do hábito (casa com o CHECK de habits.category). */
export const HABIT_CATEGORIES = [
  "leitura",
  "exercicios",
  "agua",
  "sono",
  "alimentacao",
  "caminhada",
  "estudos",
  "outro",
] as const;
export type HabitCategory = (typeof HABIT_CATEGORIES)[number];

export const HABIT_CATEGORY_LABELS: Record<HabitCategory, string> = {
  leitura: "Leitura",
  exercicios: "Exercícios",
  agua: "Água",
  sono: "Sono",
  alimentacao: "Alimentação",
  caminhada: "Caminhada",
  estudos: "Estudos",
  outro: "Outro",
};

/** Emoji padrão por categoria (usado quando o hábito não tem ícone próprio). */
export const HABIT_CATEGORY_EMOJI: Record<HabitCategory, string> = {
  leitura: "📖",
  exercicios: "🏋️",
  agua: "💧",
  sono: "😴",
  alimentacao: "🥗",
  caminhada: "🚶",
  estudos: "🎓",
  outro: "🎯",
};

/**
 * Cor por categoria (ponto/realce/borda). Hex legíveis em dark E light.
 * Identidade preto/branco/dourado: leitura puxa o dourado; demais usam neutros auxiliares.
 */
export const HABIT_CATEGORY_COLORS: Record<HabitCategory, string> = {
  leitura: "#C99A2E", // dourado (identidade)
  exercicios: "#1FA971", // verde
  agua: "#2F9FED", // azul-água
  sono: "#7C5CFC", // violeta
  alimentacao: "#EA580C", // laranja
  caminhada: "#0EA5E9", // ciano
  estudos: "#2F6FED", // azul
  outro: "#64748B", // cinza-azulado
};

/* ───────────────────────────── Frequência ───────────────────────────── */

/** Frequência do hábito (casa com o CHECK de habits.frequency). */
export const HABIT_FREQUENCIES = [
  "diaria",
  "semanal",
  "dias_especificos",
] as const;
export type HabitFrequency = (typeof HABIT_FREQUENCIES)[number];

export const HABIT_FREQUENCY_LABELS: Record<HabitFrequency, string> = {
  diaria: "Todos os dias",
  semanal: "Semanal",
  dias_especificos: "Dias específicos",
};

/* ───────────────────────────── Unidade ───────────────────────────── */

/** Unidade da meta (casa com o CHECK de habits.unit). */
export const HABIT_UNITS = [
  "vezes",
  "minutos",
  "horas",
  "litros",
  "ml",
  "paginas",
  "passos",
  "km",
] as const;
export type HabitUnit = (typeof HABIT_UNITS)[number];

export const HABIT_UNIT_LABELS: Record<HabitUnit, string> = {
  vezes: "Vezes",
  minutos: "Minutos",
  horas: "Horas",
  litros: "Litros",
  ml: "Mililitros (ml)",
  paginas: "Páginas",
  passos: "Passos",
  km: "Quilômetros (km)",
};

/** Forma singular/plural curta para compor "3 páginas", "1 copo", etc. */
const UNIT_SHORT: Record<HabitUnit, [singular: string, plural: string]> = {
  vezes: ["vez", "vezes"],
  minutos: ["min", "min"],
  horas: ["h", "h"],
  litros: ["L", "L"],
  ml: ["ml", "ml"],
  paginas: ["página", "páginas"],
  passos: ["passo", "passos"],
  km: ["km", "km"],
};

/** Quantidade no input rápido que faz sentido por unidade (passo do "+"). */
export const HABIT_UNIT_STEP: Record<HabitUnit, number> = {
  vezes: 1,
  minutos: 5,
  horas: 0.5,
  litros: 0.25,
  ml: 250,
  paginas: 5,
  passos: 500,
  km: 0.5,
};

/* ───────────────────────────── Água ───────────────────────────── */

/** Conversão documentada de água: 1 copo = 250 ml = 0,25 L. Reutilizável. */
export const WATER_GLASS_ML = 250;

/** Converte uma quantidade de copos para a unidade configurada do hábito de água. */
export function glassesToUnit(glasses: number, unit: HabitUnit): number {
  const ml = glasses * WATER_GLASS_ML;
  if (unit === "ml") return ml;
  if (unit === "litros") return ml / 1000;
  // Quando a unidade é "vezes", 1 copo = 1 vez.
  return glasses;
}

/* ───────────────────────────── Formatação ───────────────────────────── */

/** Formata um número pt-BR sem casas desnecessárias (8, 1,5, 0,25). */
export function formatAmount(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 2,
  }).format(safe);
}

/** Formata "valor + unidade" (ex.: "8 copos d'água" → "8 ml", "10 páginas"). */
export function formatHabitValue(value: number, unit: HabitUnit): string {
  const [singular, plural] = UNIT_SHORT[unit];
  const word = value === 1 ? singular : plural;
  // Unidades "coladas" ao número (min, h, L, km, ml) não levam espaço extra fora do padrão.
  return `${formatAmount(value)} ${word}`;
}

/* ───────────────────────────── Visões da tela ───────────────────────────── */

/** Visões da tela de hábitos (estado em URL `?view=`). */
export const HABIT_VIEWS = [
  "hoje",
  "agua",
  "leitura",
  "exercicios",
  "consistencia",
  "gerenciar",
] as const;
export type HabitView = (typeof HABIT_VIEWS)[number];

export const HABIT_VIEW_LABELS: Record<HabitView, string> = {
  hoje: "Hoje",
  agua: "Água",
  leitura: "Leitura",
  exercicios: "Exercícios",
  consistencia: "Consistência",
  gerenciar: "Gerenciar",
};

/** Paleta sugerida para o seletor de cor de hábitos (mesma identidade das rotinas). */
export const HABIT_COLOR_PALETTE = [
  "#C99A2E",
  "#2F6FED",
  "#7C5CFC",
  "#1FA971",
  "#0EA5E9",
  "#2F9FED",
  "#EA580C",
  "#64748B",
] as const;
