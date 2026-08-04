/**
 * Fase 16-F — Dieta e Alimentação · as 8 famílias de notificação do módulo (PURO).
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ⛔ AS TRÊS REGRAS QUE ESTE ARQUIVO EXISTE PARA GARANTIR                                ║
 * ║                                                                                       ║
 * ║ 1. SEM LINGUAGEM DE CULPA. A notificação CONSTATA e oferece um caminho; nunca          ║
 * ║    repreende, nunca insinua fracasso, nunca conta quantas vezes a pessoa "falhou".     ║
 * ║    Este módulo trata de comida e de corpo — o custo de errar o tom aqui é alto.        ║
 * ║    "O almoço continua sem registro" é constatação. "Você não registrou de novo" não.   ║
 * ║                                                                                       ║
 * ║ 2. `dedupe_key` DETERMINÍSTICO. Rodar o Cron duas vezes no mesmo dia NÃO pode produzir ║
 * ║    duas notificações. Nada de índice de laço, nada de timestamp na chave.              ║
 * ║                                                                                       ║
 * ║ 3. AUSÊNCIA DE DADO NÃO É ZERO. Um dia sem registro não vira "0 kcal consumidas", e    ║
 * ║    uma despensa com `quantity` nula ("tenho, não sei quanto") não é "acabou".          ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * INTEGRA, NÃO REIMPLEMENTA: o status derivado da refeição sai de `effectiveMealStatus`
 * (16-B) e a aritmética de data pura sai de `src/lib/nutrition/calendar.ts` (`Date.UTC`).
 * Nenhuma regra do módulo Dieta é reescrita aqui.
 *
 * Sem `Date.now()`: `hoje` e `minutosAgora` são SEMPRE injetados.
 */
import {
  diffDaysIso,
  shortTime,
  startOfWeekIso,
  timeToMinutes,
} from "@/lib/nutrition/calendar";
import { effectiveMealStatus } from "@/lib/nutrition/diary";
import type { MealStatus, NutrientTotalQuality } from "@/lib/nutrition/constants";
import { formatDate } from "@/lib/format";
import {
  diaryLink,
  foodLink,
  measurementsLink,
  pantryLink,
  shoppingListLink,
} from "@/lib/search/nutrition-links";
import type { NotificationPriority, NotificationType } from "./constants";

/** Mesmo shape de `NotificationCandidate` em generate.ts (evita import circular). */
type Candidate = {
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  description: string | null;
  link: string | null;
  entity_type: string | null;
  entity_id: string | null;
  dedupe_key: string;
};

/* ───────────────────────────── Estruturas de entrada ───────────────────────────── */

/**
 * Uma refeição do dia, venha do diário (já materializada) ou do planejamento (ainda não).
 * `origin` entra no `dedupe_key` porque os dois lados têm ids de tabelas diferentes e
 * poderiam colidir.
 */
export type GenNutritionMeal = {
  id: string;
  origin: "diario" | "planejado";
  /** Data pura 'yyyy-MM-dd'. */
  date: string;
  mealName: string;
  /** 'HH:mm[:ss]' ou null (refeição sem horário nunca vira atraso — não há como saber). */
  plannedTime: string | null;
  /** Status GRAVADO. 'pendente' não existe no banco: é derivado aqui. */
  status: MealStatus;
  /** Itens que contam para o consumo. 0 = nada registrado. */
  entries: number;
};

/** Estado do planejamento da semana que vem. */
export type GenNutritionWeekPlan = {
  /** 'yyyy-MM-dd' do primeiro dia da semana. */
  weekStart: string;
  /** Refeições já planejadas para essa semana. */
  plannedMeals: number;
};

export type GenShoppingList = {
  id: string;
  name: string;
  /** Só lista 'ativa' e não arquivada gera aviso. */
  status: string;
  isArchived: boolean;
  /** Itens ainda a pegar ('pendente' + 'no_carrinho'). */
  pendingItems: number;
};

export type GenPantryItem = {
  id: string;
  label: string;
  /** 'yyyy-MM-dd' ou null (sem validade informada — nada a avisar). */
  expiresOn: string | null;
  /** NULA = "tenho, não sei quanto". ZERO = "acabou" — e acabado não vence. */
  quantity: number | null;
};

export type GenMeasurementDue = {
  typeId: string;
  typeName: string;
  /** 'yyyy-MM-dd' da última medição, ou null se nunca houve. */
  lastMeasuredOn: string | null;
};

/** Progresso de UM nutriente com meta no dia de hoje. */
export type GenGoalProgress = {
  code: string;
  label: string;
  unit: string;
  amount: number;
  target: number;
  quality: NutrientTotalQuality;
};

export type GenFoodReview = {
  id: string;
  name: string;
  reason: "sem_energia" | "sem_fonte" | "em_revisao";
};

export type NutritionGenInput = {
  /** 'yyyy-MM-dd' em Brasília. */
  todayIso: string;
  /** Minutos desde a meia-noite, em Brasília. */
  minutosAgora: number;
  meals?: GenNutritionMeal[];
  weekPlan?: GenNutritionWeekPlan | null;
  shoppingLists?: GenShoppingList[];
  pantry?: GenPantryItem[];
  measurements?: GenMeasurementDue[];
  goalProgress?: GenGoalProgress[];
  foodsToReview?: GenFoodReview[];
  options?: NutritionGenOptions;
};

export type NutritionGenOptions = {
  /** Aviso de "próxima refeição" a partir de N minutos antes do horário. */
  minutosAntesRefeicao?: number;
  /** Item de despensa avisado a partir de N dias antes da validade. */
  diasValidadeDespensa?: number;
  /** Medida considerada pendente depois de N dias sem registro. */
  diasSemMedida?: number;
  /** Lembra a semana que vem a partir de N dias antes de ela começar. */
  diasAntesDaSemana?: number;
  /** Fração da meta a partir da qual "está por perto" (0..1). */
  fracaoMetaProxima?: number;
  /** Máximo de alimentos a revisar por execução (a lista pode ser longa). */
  limiteAlimentosRevisao?: number;
};

export const NUTRITION_GEN_DEFAULTS: Required<NutritionGenOptions> = {
  minutosAntesRefeicao: 60,
  diasValidadeDespensa: 5,
  diasSemMedida: 7,
  diasAntesDaSemana: 2,
  fracaoMetaProxima: 0.85,
  limiteAlimentosRevisao: 3,
};

/** Motivo por extenso de um alimento marcado para revisão. */
const REVIEW_REASONS: Record<GenFoodReview["reason"], string> = {
  sem_energia: "está sem energia analisada — os totais que o incluem ficam parciais",
  sem_fonte: "está sem fonte registrada",
  em_revisao: "está marcado como em revisão",
};

/** Formata um número em pt-BR sem casas supérfluas. */
function num(value: number, digits = 0): string {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: digits }).format(value);
}

/* ───────────────────────────── Gerador ───────────────────────────── */

/**
 * As 8 famílias da 16-F. Devolve candidatos com `dedupe_key` determinístico; quem decide o
 * que entra no banco é `selectNewCandidates` (Fase 13), e quem respeita as preferências do
 * usuário é `filterByPrefs` — nada aqui presume que a notificação vai ser criada.
 */
export function generateNutritionNotifications(input: NutritionGenInput): Candidate[] {
  const opt = { ...NUTRITION_GEN_DEFAULTS, ...(input.options ?? {}) };
  const today = input.todayIso;
  const now = { hoje: today, minutosAgora: input.minutosAgora };
  const out: Candidate[] = [];

  /* ── 1 e 2. Refeições: a que vem aí × a que ficou sem registro ── */
  for (const meal of input.meals ?? []) {
    const state = effectiveMealStatus(
      { status: meal.status, diaryDate: meal.date, plannedTime: meal.plannedTime },
      now,
    );

    // (1) Próxima refeição — só hoje, só com horário, só antes de o horário chegar.
    if (
      state.status === "planejada" &&
      meal.date === today &&
      meal.plannedTime !== null &&
      meal.entries === 0
    ) {
      const minutos = timeToMinutes(meal.plannedTime);
      if (minutos !== null) {
        const faltam = minutos - input.minutosAgora;
        if (faltam >= 0 && faltam <= opt.minutosAntesRefeicao) {
          out.push({
            type: "nutrition_meal_upcoming",
            priority: "low",
            title: `${meal.mealName} às ${shortTime(meal.plannedTime)}`,
            description:
              faltam === 0
                ? "É o horário previsto no seu planejamento."
                : `Faltam ${num(faltam)} min para o horário previsto.`,
            link: diaryLink(meal.date),
            entity_type: meal.origin === "diario" ? "nutrition_diary_meal" : "nutrition_planned_meal",
            entity_id: meal.id,
            dedupe_key: `nutrition_meal_upcoming:${meal.origin}:${meal.id}:${meal.date}`,
          });
        }
      }
    }

    // (2) Refeição sem registro — passou do horário (com a tolerância de 45 min da 16-B) e
    // não há nenhum item. CONSTATAÇÃO, não cobrança: as duas saídas são oferecidas.
    if (state.status === "pendente" && state.isLate && meal.entries === 0) {
      const quando =
        state.daysLate !== null
          ? `Ficou em aberto desde ${formatDate(meal.date)}.`
          : `O horário previsto era ${shortTime(meal.plannedTime)}.`;
      out.push({
        type: "nutrition_meal_missing",
        priority: "low",
        title: `${meal.mealName} continua sem registro`,
        description: `${quando} Dá para registrar o que você comeu ou marcar como não consumida.`,
        link: diaryLink(meal.date),
        entity_type: meal.origin === "diario" ? "nutrition_diary_meal" : "nutrition_planned_meal",
        entity_id: meal.id,
        dedupe_key: `nutrition_meal_missing:${meal.origin}:${meal.id}:${meal.date}`,
      });
    }
  }

  /* ── 3. Planejamento da semana que vem ── */
  const week = input.weekPlan;
  if (week && week.plannedMeals === 0) {
    const faltamDias = diffDaysIso(today, week.weekStart);
    if (faltamDias >= 0 && faltamDias <= opt.diasAntesDaSemana) {
      out.push({
        type: "nutrition_plan_week",
        priority: "low",
        title: "A semana que vem ainda não tem refeições planejadas",
        description: `A semana começa em ${formatDate(week.weekStart)}. Planejar é opcional — o diário funciona sem plano.`,
        link: `/nutricao/planejamento?data=${week.weekStart}`,
        entity_type: "nutrition_plan",
        entity_id: null,
        // Uma por semana: a chave é o início da semana, não o dia em que o Cron rodou.
        dedupe_key: `nutrition_plan_week:${week.weekStart}`,
      });
    }
  }

  /* ── 4. Lista de compras com itens a pegar ── */
  for (const list of input.shoppingLists ?? []) {
    if (list.isArchived || list.status !== "ativa" || list.pendingItems <= 0) continue;
    out.push({
      type: "nutrition_shopping_pending",
      priority: "low",
      title: `${list.name} — ${num(list.pendingItems)} ${list.pendingItems === 1 ? "item" : "itens"} a pegar`,
      description: "A lista continua aberta.",
      link: shoppingListLink(list.id),
      entity_type: "nutrition_shopping_list",
      entity_id: list.id,
      // Semanal por lista: uma lista aberta há um mês não vira 30 notificações.
      dedupe_key: `nutrition_shopping_pending:${list.id}:${startOfWeekKey(today)}`,
    });
  }

  /* ── 5. Despensa perto da validade ── */
  for (const item of input.pantry ?? []) {
    if (!item.expiresOn) continue;
    // `quantity` ZERO é "acabou": não há o que vencer. NULA é "tenho, não sei quanto" — e
    // isso continua sendo alguma coisa na despensa, então avisa.
    if (item.quantity === 0) continue;

    const dias = diffDaysIso(today, item.expiresOn);
    if (dias > opt.diasValidadeDespensa) continue;

    const vencido = dias < 0;
    out.push({
      type: "nutrition_pantry_expiring",
      priority: vencido ? "medium" : "low",
      title: vencido
        ? `${item.label} passou da validade`
        : dias === 0
          ? `${item.label} vence hoje`
          : `${item.label} vence em ${num(dias)} ${dias === 1 ? "dia" : "dias"}`,
      description: `Validade informada: ${formatDate(item.expiresOn)}.`,
      link: pantryLink(),
      entity_type: "nutrition_pantry_item",
      entity_id: item.id,
      // A validade compõe a chave: mudar a data (repor o item) permite um aviso novo.
      dedupe_key: `nutrition_pantry_expiring:${item.id}:${item.expiresOn}`,
    });
  }

  /* ── 6. Medida pendente ── */
  for (const measure of input.measurements ?? []) {
    const dias = measure.lastMeasuredOn ? diffDaysIso(measure.lastMeasuredOn, today) : null;
    if (dias !== null && dias < opt.diasSemMedida) continue;
    out.push({
      type: "nutrition_measurement_due",
      priority: "low",
      title: `${measure.typeName} — faz um tempo desde a última medição`,
      description:
        dias === null
          ? "Ainda não há nenhuma medição registrada deste tipo."
          : `A última foi em ${formatDate(measure.lastMeasuredOn as string)} (${num(dias)} dias).`,
      link: measurementsLink(),
      entity_type: "body_measurement_type",
      entity_id: measure.typeId,
      // Semanal por tipo: a chave não usa o dia, senão viraria um aviso por dia enquanto
      // a medição não acontecesse — que é exatamente a cobrança que a regra 1 proíbe.
      dedupe_key: `nutrition_measurement_due:${measure.typeId}:${startOfWeekKey(today)}`,
    });
  }

  /* ── 7. Meta do dia por perto (OPT-IN) ── */
  for (const goal of input.goalProgress ?? []) {
    if (goal.target <= 0) continue;
    const fracao = goal.amount / goal.target;
    if (fracao < opt.fracaoMetaProxima || fracao > 1) continue;
    const falta = goal.target - goal.amount;
    out.push({
      type: "nutrition_goal_close",
      priority: "low",
      title: `${goal.label}: ${num(goal.amount)} de ${num(goal.target)} ${goal.unit} hoje`,
      description:
        goal.quality === "exato"
          ? `Faltam ${num(falta)} ${goal.unit} para a meta do dia.`
          : `Faltam cerca de ${num(falta)} ${goal.unit}. Alguns itens do dia não têm este nutriente analisado, então o total é o mínimo conhecido.`,
      link: diaryLink(today),
      entity_type: "nutrition_goal",
      entity_id: null,
      dedupe_key: `nutrition_goal_close:${goal.code}:${today}`,
    });
  }

  /* ── 8. Alimento a revisar ── */
  for (const food of (input.foodsToReview ?? []).slice(0, opt.limiteAlimentosRevisao)) {
    out.push({
      type: "nutrition_food_review",
      priority: "low",
      title: `${food.name} pode ser revisado`,
      description: `O alimento ${REVIEW_REASONS[food.reason]}.`,
      link: foodLink(food.id),
      entity_type: "nutrition_food",
      entity_id: food.id,
      // O motivo entra na chave: resolver a energia e depois perder a fonte são fatos
      // diferentes. O mês evita repetir o mesmo aviso todo dia.
      dedupe_key: `nutrition_food_review:${food.id}:${food.reason}:${today.slice(0, 7)}`,
    });
  }

  return out;
}

/**
 * Chave da semana de uma data pura, para os `dedupe_key` semanais.
 * REUSA `startOfWeekIso` (aritmética em `Date.UTC`, testada na 16-B) — a semana começa na
 * segunda, fixa, porque a chave precisa ser estável mesmo se o usuário mudar a preferência
 * de primeiro dia da semana no meio do caminho.
 */
function startOfWeekKey(iso: string): string {
  return startOfWeekIso(iso, 1);
}
