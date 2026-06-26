/**
 * Fonte única de verdade dos enums de Estudos (Fase 11).
 * Os arrays `as const` alimentam os tipos TS (src/types/database.ts), os schemas Zod
 * (src/lib/validators/study.ts) e os rótulos pt-BR da UI. Os valores precisam casar
 * com os CHECK constraints das migrations (study_courses/sessions/vocabulary/practice).
 * Cores em hex legíveis em dark E light (identidade preto/branco/dourado).
 */

/* ───────────────────────────── Categoria do curso ───────────────────────────── */

/** Casa com o CHECK de study_courses.category. */
export const STUDY_CATEGORIES = [
  "marketing",
  "trafego_pago",
  "ingles",
  "idiomas",
  "negocios",
  "tecnologia",
  "design",
  "vendas",
  "desenvolvimento_pessoal",
  "outro",
] as const;
export type StudyCategory = (typeof STUDY_CATEGORIES)[number];

export const STUDY_CATEGORY_LABELS: Record<StudyCategory, string> = {
  marketing: "Marketing",
  trafego_pago: "Tráfego pago",
  ingles: "Inglês",
  idiomas: "Idiomas",
  negocios: "Negócios",
  tecnologia: "Tecnologia",
  design: "Design",
  vendas: "Vendas",
  desenvolvimento_pessoal: "Desenvolvimento pessoal",
  outro: "Outro",
};

export const STUDY_CATEGORY_EMOJI: Record<StudyCategory, string> = {
  marketing: "📣",
  trafego_pago: "🎯",
  ingles: "🇺🇸",
  idiomas: "🗣️",
  negocios: "💼",
  tecnologia: "💻",
  design: "🎨",
  vendas: "🤝",
  desenvolvimento_pessoal: "🌱",
  outro: "🎓",
};

/** Categorias consideradas "idioma" — sugerem marcar o curso como is_language. */
export const LANGUAGE_CATEGORIES: ReadonlySet<StudyCategory> = new Set([
  "ingles",
  "idiomas",
]);

/* ───────────────────────────── Status do curso ───────────────────────────── */

/** Casa com o CHECK de study_courses.status. */
export const STUDY_STATUSES = [
  "nao_iniciado",
  "em_andamento",
  "pausado",
  "concluido",
] as const;
export type StudyStatus = (typeof STUDY_STATUSES)[number];

export const STUDY_STATUS_LABELS: Record<StudyStatus, string> = {
  nao_iniciado: "Não iniciado",
  em_andamento: "Em andamento",
  pausado: "Pausado",
  concluido: "Concluído",
};

/** Cor do status (badge). Dourado = em andamento (foco/identidade). */
export const STUDY_STATUS_COLORS: Record<StudyStatus, string> = {
  nao_iniciado: "#64748B", // slate
  em_andamento: "#C99A2E", // dourado
  pausado: "#EA580C", // laranja
  concluido: "#1FA971", // verde
};

/* ───────────────────────────── Prioridade ───────────────────────────── */

/** Casa com o CHECK de study_courses.priority. */
export const STUDY_PRIORITIES = ["baixa", "media", "alta"] as const;
export type StudyPriority = (typeof STUDY_PRIORITIES)[number];

export const STUDY_PRIORITY_LABELS: Record<StudyPriority, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
};

export const STUDY_PRIORITY_COLORS: Record<StudyPriority, string> = {
  baixa: "#64748B",
  media: "#2F6FED",
  alta: "#DC2626",
};

/* ───────────────────────────── Dificuldade da sessão ───────────────────────────── */

/** Casa com o CHECK de study_sessions.difficulty. */
export const STUDY_DIFFICULTIES = ["facil", "media", "dificil"] as const;
export type StudyDifficulty = (typeof STUDY_DIFFICULTIES)[number];

export const STUDY_DIFFICULTY_LABELS: Record<StudyDifficulty, string> = {
  facil: "Fácil",
  media: "Média",
  dificil: "Difícil",
};

export const STUDY_DIFFICULTY_COLORS: Record<StudyDifficulty, string> = {
  facil: "#1FA971", // verde
  media: "#C99A2E", // dourado
  dificil: "#DC2626", // vermelho
};

/* ───────────────────────────── Vocabulário (idiomas) ───────────────────────────── */

/** Casa com o CHECK de study_vocabulary.mastery. */
export const VOCAB_MASTERY = ["novo", "aprendendo", "dominado"] as const;
export type VocabMastery = (typeof VOCAB_MASTERY)[number];

export const VOCAB_MASTERY_LABELS: Record<VocabMastery, string> = {
  novo: "Novo",
  aprendendo: "Aprendendo",
  dominado: "Dominado",
};

export const VOCAB_MASTERY_COLORS: Record<VocabMastery, string> = {
  novo: "#64748B", // slate
  aprendendo: "#C99A2E", // dourado
  dominado: "#1FA971", // verde
};

/* ───────────────────────────── Habilidades (idiomas) ───────────────────────────── */

/** Casa com o CHECK de study_language_practice.skill. */
export const LANGUAGE_SKILLS = [
  "listening",
  "speaking",
  "reading",
  "writing",
] as const;
export type LanguageSkill = (typeof LANGUAGE_SKILLS)[number];

export const LANGUAGE_SKILL_LABELS: Record<LanguageSkill, string> = {
  listening: "Escuta",
  speaking: "Fala",
  reading: "Leitura",
  writing: "Escrita",
};

export const LANGUAGE_SKILL_EMOJI: Record<LanguageSkill, string> = {
  listening: "🎧",
  speaking: "🗣️",
  reading: "📖",
  writing: "✍️",
};

/* ───────────────────────────── Visões da tela ───────────────────────────── */

/** Visões da tela de estudos (estado em URL `?view=`). */
export const STUDY_VIEWS = ["painel", "cursos", "sessoes", "idiomas"] as const;
export type StudyView = (typeof STUDY_VIEWS)[number];

export const STUDY_VIEW_LABELS: Record<StudyView, string> = {
  painel: "Painel",
  cursos: "Cursos",
  sessoes: "Sessões",
  idiomas: "Idiomas",
};

/* ───────────────────────────── Paletas ───────────────────────────── */

/** Paleta sugerida para a "capa" do curso (mesma identidade dos demais módulos). */
export const STUDY_COVER_PALETTE = [
  "#C99A2E",
  "#2F6FED",
  "#7C5CFC",
  "#1FA971",
  "#0EA5E9",
  "#EA580C",
  "#DC2626",
  "#64748B",
] as const;

/* ───────────────────────────── Formatação ───────────────────────────── */

/**
 * Formata uma duração em minutos de forma amigável pt-BR: "3h 20min", "45min", "2h".
 * Negativos/zero viram "0min". Usado em sessões, carga horária e horas estudadas.
 */
export function formatMinutes(totalMinutes: number): string {
  const min = Math.max(0, Math.round(Number.isFinite(totalMinutes) ? totalMinutes : 0));
  if (min === 0) return "0min";
  const hours = Math.floor(min / 60);
  const rest = min % 60;
  if (hours > 0 && rest > 0) return `${hours}h ${rest}min`;
  if (hours > 0) return `${hours}h`;
  return `${rest}min`;
}

/** Converte minutos em horas com 1 casa (para eixos de gráfico): 200 → 3,3. */
export function minutesToHours(totalMinutes: number): number {
  const min = Math.max(0, Number.isFinite(totalMinutes) ? totalMinutes : 0);
  return Math.round((min / 60) * 10) / 10;
}

/** Formata um percentual inteiro pt-BR (0–100): 42.7 → "43%". */
export function formatPercent(value: number): string {
  const v = Number.isFinite(value) ? value : 0;
  return `${Math.round(v)}%`;
}
