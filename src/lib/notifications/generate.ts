/**
 * Fase 13 — Geração de alertas (lógica PURA, testada em generate.test.ts).
 *
 * SEM efeitos colaterais: não toca Supabase/Next, não usa Date.now() — `todayIso`/`nowMs`
 * são SEMPRE injetados. Recebe estruturas simples (mapeadas das linhas cruas pelo Cron) e
 * devolve `NotificationCandidate[]`, cada uma com um `dedupe_key` determinístico. O Cron
 * insere apenas as que faltam (`selectNewCandidates`), então rodar N vezes não duplica.
 *
 * REUSO, NÃO REESCRITA: reaproveita os módulos puros já testados das fases anteriores
 * (`statusEfetivo` da Fase 03, `isOverdue`/`isDueToday` da Fase 09, `courseOverdueReason`
 * da Fase 11). Nenhuma regra de negócio nova de outro módulo.
 */
import { getDaysInMonth, format } from "date-fns";
import { statusEfetivo } from "@/lib/finance/invoice";
import { isDueToday, isOverdue } from "@/lib/tasks/status";
import { courseOverdueReason } from "@/lib/studies/progress";
import {
  isDeadlineNear as todoDeadlineNear,
  isDueToday as todoIsDueToday,
  isOverdue as todoIsOverdue,
} from "@/lib/todo/status";
import type { TodoStatus } from "@/lib/todo/constants";
import { formatCurrency, formatDate } from "@/lib/format";
import type { TaskPriority, TaskStoredStatus } from "@/lib/tasks/constants";
import {
  generateNutritionNotifications,
  type NutritionGenInput,
} from "./nutrition";
import { notificationEnabled, type NotificationPrefs } from "@/lib/settings/constants";
import type { NotificationPriority, NotificationType } from "./constants";

const ISO = "yyyy-MM-dd";
const DAY_MS = 86_400_000;

/* ───────────────────────────── Estruturas de entrada ───────────────────────────── */

export type GenStatement = {
  id: string;
  cardId: string;
  cardNome: string;
  /** 'yyyy-MM-dd' (dia 1 do mês de competência) ou 'yyyy-MM'. */
  competencia: string;
  data_fechamento: string; // 'yyyy-MM-dd'
  data_vencimento: string; // 'yyyy-MM-dd'
  pago_em: string | null; // 'yyyy-MM-dd' ou null
  total: number; // reais
};

export type GenCard = {
  id: string;
  nome: string;
  limite_total: number; // reais (0 = sem limite definido → ignora)
};

export type GenBill = {
  id: string;
  name: string;
  amount: number; // reais
  due_day: number; // 1..31
  is_active: boolean;
};

export type GenReceivable = {
  id: string;
  personNome: string | null;
  valor: number; // reais
  status: string; // 'pendente' | 'cobrado' | ...
  /** Vencimento da fatura de origem ('yyyy-MM-dd') ou null. */
  dataVencimento: string | null;
};

export type GenTask = {
  id: string;
  title: string;
  status: TaskStoredStatus;
  due_date: string | null;
  priority: TaskPriority;
};

export type GenEvent = {
  id: string;
  title: string;
  startMs: number; // epoch ms da ocorrência
  startIso: string; // 'yyyy-MM-dd' da ocorrência (link + dedupe)
  tipo: string;
};

export type GenHabit = {
  id: string;
  name: string;
  category: string; // 'agua' dispara water_goal
  scheduledToday: boolean;
  done: boolean;
  value: number;
  target: number;
  unit: string;
};

export type GenCourse = {
  id: string;
  title: string;
  status: string;
  target_date: string | null;
  lastSessionIso: string | null;
};

export type GenSpending = {
  mes: string; // 'yyyy-MM'
  saidas: number; // reais
  mediaSaidas: number; // reais
};

/** Tarefa do módulo TO-DO (Fase 15). Datas em 'yyyy-MM-dd' puro. */
export type GenTodoTask = {
  id: string;
  title: string;
  status: string;
  scheduled_date: string | null;
  deadline_at: string | null;
  priority: number; // 1 = P1 … 4 = P4
  projectId: string | null;
};

/** Lembrete de tarefa TO-DO pendente de disparo. */
export type GenTodoReminder = {
  id: string;
  taskId: string;
  taskTitle: string;
  /** Epoch ms do disparo. */
  remindAtMs: number;
  /** 'yyyy-MM-dd' do disparo (compõe o dedupe_key). */
  remindAtIso: string;
  projectId: string | null;
};

export type GenerateOptions = {
  /** Fatura/conta "a vencer" dentro de N dias. */
  diasVencimento?: number;
  /** Recebível "a vencer" dentro de N dias. */
  diasRecebivel?: number;
  /** Conta vencida ainda relevante até N dias depois do vencimento. */
  diasContaVencida?: number;
  /** Evento "próximo" dentro de N horas. */
  horasEvento?: number;
  /** Limite do cartão: alerta a partir desta fração de uso (0..1). */
  limiarLimite?: number;
  /** Gasto alto: saídas acima da média × este fator. */
  limiarGastoAlto?: number;
  /** Prazo do TO-DO "próximo" dentro de N dias. */
  diasPrazoTodo?: number;
};

export type GenerateInput = {
  todayIso: string; // 'yyyy-MM-dd' local
  nowMs: number; // epoch ms
  statements?: GenStatement[];
  cards?: GenCard[];
  bills?: GenBill[];
  receivables?: GenReceivable[];
  tasks?: GenTask[];
  events?: GenEvent[];
  habits?: GenHabit[];
  courses?: GenCourse[];
  spending?: GenSpending | null;
  todoTasks?: GenTodoTask[];
  todoReminders?: GenTodoReminder[];
  /**
   * Fase 16-F — as 8 famílias do módulo Dieta. Ficam num arquivo próprio
   * (`./nutrition.ts`) por volume, mas entram pelo MESMO gerador: `dedupe_key`,
   * `selectNewCandidates` e o Cron continuam sendo um caminho só.
   */
  nutrition?: NutritionGenInput | null;
  options?: GenerateOptions;
};

/** Notificação proposta pelo gerador (sem id/user_id — o Cron completa). */
export type NotificationCandidate = {
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  description: string | null;
  link: string | null;
  entity_type: string | null;
  entity_id: string | null;
  dedupe_key: string;
};

const DEFAULTS: Required<GenerateOptions> = {
  diasVencimento: 5,
  diasRecebivel: 7,
  diasContaVencida: 10,
  horasEvento: 24,
  limiarLimite: 0.8,
  limiarGastoAlto: 1.2,
  diasPrazoTodo: 3,
};

/* ───────────────────────────── Helpers de data (puros) ───────────────────────────── */

/** Diferença em dias inteiros entre duas datas 'yyyy-MM-dd' (b − a). */
function diffDias(aIso: string, bIso: string): number {
  const [ay, am, ad] = aIso.split("-").map(Number);
  const [by, bm, bd] = bIso.split("-").map(Number);
  const a = Date.UTC(ay, am - 1, ad);
  const b = Date.UTC(by, bm - 1, bd);
  return Math.round((b - a) / DAY_MS);
}

/** Dia de vencimento (clampado ao mês) numa competência específica. */
function vencimentoNoMes(year: number, month0: number, dueDay: number): string {
  const dim = getDaysInMonth(new Date(year, month0, 1));
  const day = Math.min(Math.max(1, dueDay), dim);
  return format(new Date(year, month0, day), ISO);
}

/** Próximo vencimento (>= hoje) de um vencimento mensal no dia `dueDay`. */
function proximoVencimento(todayIso: string, dueDay: number): string {
  const [y, m] = todayIso.split("-").map(Number);
  const esteMes = vencimentoNoMes(y, m - 1, dueDay);
  if (esteMes >= todayIso) return esteMes;
  // Mês seguinte (trata virada de ano).
  const next = new Date(y, m, 1);
  return vencimentoNoMes(next.getFullYear(), next.getMonth(), dueDay);
}

/** Vencimento do dia `dueDay` no mês corrente de `todayIso`. */
function vencimentoMesCorrente(todayIso: string, dueDay: number): string {
  const [y, m] = todayIso.split("-").map(Number);
  return vencimentoNoMes(y, m - 1, dueDay);
}

const brDate = (iso: string) => formatDate(iso);

/* ───────────────────────────── Gerador ───────────────────────────── */

export function generateNotifications(input: GenerateInput): NotificationCandidate[] {
  const opt = { ...DEFAULTS, ...(input.options ?? {}) };
  const today = input.todayIso;
  const out: NotificationCandidate[] = [];

  /* ── Faturas (a vencer / atrasada) + limite do cartão ── */
  const statements = input.statements ?? [];
  const usadoPorCartao = new Map<string, number>();
  for (const s of statements) {
    const eff = statusEfetivo(
      { data_fechamento: s.data_fechamento, data_vencimento: s.data_vencimento, pago_em: s.pago_em },
      today,
    );
    const mes = s.competencia.slice(0, 7);
    const link = `/faturas?card=${s.cardId}&month=${mes}`;
    if (eff !== "paga") {
      usadoPorCartao.set(s.cardId, (usadoPorCartao.get(s.cardId) ?? 0) + s.total);
    }
    if (eff === "atrasada") {
      out.push({
        type: "invoice_overdue",
        priority: "urgent",
        title: `Fatura atrasada — ${s.cardNome}`,
        description: `Venceu em ${brDate(s.data_vencimento)} • ${formatCurrency(s.total)}`,
        link,
        entity_type: "card_statement",
        entity_id: s.id,
        dedupe_key: `invoice_overdue:${s.id}`,
      });
    } else if (
      eff === "fechada" &&
      s.data_vencimento >= today &&
      diffDias(today, s.data_vencimento) <= opt.diasVencimento
    ) {
      out.push({
        type: "invoice_due",
        priority: "high",
        title: `Fatura a vencer — ${s.cardNome}`,
        description: `Vence em ${brDate(s.data_vencimento)} • ${formatCurrency(s.total)}`,
        link,
        entity_type: "card_statement",
        entity_id: s.id,
        dedupe_key: `invoice_due:${s.id}`,
      });
    }
  }

  for (const card of input.cards ?? []) {
    if (card.limite_total <= 0) continue;
    const usado = usadoPorCartao.get(card.id) ?? 0;
    const pct = usado / card.limite_total;
    if (pct >= opt.limiarLimite) {
      out.push({
        type: "card_limit",
        priority: pct >= 1 ? "urgent" : "high",
        title: `Limite do cartão ${card.nome}`,
        description: `${Math.round(pct * 100)}% do limite comprometido em faturas em aberto (${formatCurrency(usado)}).`,
        link: "/cartoes",
        entity_type: "credit_card",
        entity_id: card.id,
        dedupe_key: `card_limit:${card.id}:${today.slice(0, 7)}`,
      });
    }
  }

  /* ── Contas fixas (a vencer / vencida) ── */
  for (const bill of input.bills ?? []) {
    if (!bill.is_active) continue;
    const prox = proximoVencimento(today, bill.due_day);
    const dias = diffDias(today, prox);
    if (prox >= today && dias <= opt.diasVencimento) {
      out.push({
        type: "bill_due",
        priority: dias <= 1 ? "high" : "medium",
        title: `Conta a vencer — ${bill.name}`,
        description: `Vence em ${brDate(prox)} • ${formatCurrency(bill.amount)}`,
        link: "/financeiro/contas-fixas",
        entity_type: "bill",
        entity_id: bill.id,
        dedupe_key: `bill_due:${bill.id}:${prox}`,
      });
    }
    // Vencida: o vencimento deste mês já passou (até N dias atrás). Lembrete de confirmação.
    const venceuEsteMes = vencimentoMesCorrente(today, bill.due_day);
    if (venceuEsteMes < today && diffDias(venceuEsteMes, today) <= opt.diasContaVencida) {
      out.push({
        type: "bill_overdue",
        priority: "high",
        title: `Conta vencida — ${bill.name}`,
        description: `Venceu em ${brDate(venceuEsteMes)} • ${formatCurrency(bill.amount)} • confirme o pagamento`,
        link: "/financeiro/contas-fixas",
        entity_type: "bill",
        entity_id: bill.id,
        dedupe_key: `bill_overdue:${bill.id}:${venceuEsteMes}`,
      });
    }
  }

  /* ── Recebíveis pendentes (terceiros) ── */
  for (const r of input.receivables ?? []) {
    if (r.status !== "pendente" && r.status !== "cobrado") continue;
    const venc = r.dataVencimento;
    const atrasado = !!venc && venc < today;
    const aVencer = !!venc && venc >= today && diffDias(today, venc) <= opt.diasRecebivel;
    if (!atrasado && !aVencer) continue;
    const nome = r.personNome ?? "alguém";
    out.push({
      type: "receivable_pending",
      priority: atrasado ? "high" : "medium",
      title: atrasado ? `Recebimento atrasado — ${nome}` : `A receber — ${nome}`,
      description: venc
        ? `${atrasado ? "Venceu" : "Vence"} em ${brDate(venc)} • ${formatCurrency(r.valor)}`
        : formatCurrency(r.valor),
      link: "/terceiros",
      entity_type: "receivable",
      entity_id: r.id,
      dedupe_key: `receivable_pending:${r.id}`,
    });
  }

  /* ── Tarefas (atrasada / do dia) ── */
  for (const t of input.tasks ?? []) {
    if (isOverdue(t, today)) {
      out.push({
        type: "task_overdue",
        priority: t.priority === "urgente" ? "urgent" : "high",
        title: `Tarefa atrasada — ${t.title}`,
        description: t.due_date ? `Venceu em ${brDate(t.due_date)}` : null,
        link: "/tarefas?view=atrasadas",
        entity_type: "task",
        entity_id: t.id,
        dedupe_key: `task_overdue:${t.id}`,
      });
    } else if (isDueToday(t, today)) {
      out.push({
        type: "task_today",
        priority: t.priority === "urgente" || t.priority === "alta" ? "high" : "medium",
        title: `Tarefa para hoje — ${t.title}`,
        description: "Vence hoje",
        link: "/tarefas?view=hoje",
        entity_type: "task",
        entity_id: t.id,
        dedupe_key: `task_today:${t.id}:${today}`,
      });
    }
  }

  /* ── Eventos próximos ── */
  const horizonteMs = opt.horasEvento * 3_600_000;
  for (const e of input.events ?? []) {
    const delta = e.startMs - input.nowMs;
    if (delta < 0 || delta > horizonteMs) continue;
    const horas = delta / 3_600_000;
    out.push({
      type: "event_upcoming",
      priority: horas <= 3 ? "high" : "medium",
      title: `Compromisso — ${e.title}`,
      description:
        horas < 1
          ? "Começa em menos de 1 hora"
          : `Começa em ${Math.round(horas)}h (${brDate(e.startIso)})`,
      link: `/agenda?view=dia&date=${e.startIso}`,
      entity_type: "calendar_event",
      entity_id: e.id,
      dedupe_key: `event_upcoming:${e.id}:${e.startIso}`,
    });
  }

  /* ── Hábitos pendentes / meta de água ── */
  for (const h of input.habits ?? []) {
    if (!h.scheduledToday || h.done) continue;
    if (h.category === "agua") {
      out.push({
        type: "water_goal",
        priority: "medium",
        title: "Meta de água não atingida",
        description: `${formatAmount(h.value, h.unit)} de ${formatAmount(h.target, h.unit)} hoje`,
        link: "/habitos?view=agua",
        entity_type: "habit",
        entity_id: h.id,
        dedupe_key: `water_goal:${h.id}:${today}`,
      });
    } else {
      out.push({
        type: "habit_pending",
        priority: "low",
        title: `Hábito pendente — ${h.name}`,
        description: "Ainda não registrado hoje",
        link: "/habitos?view=hoje",
        entity_type: "habit",
        entity_id: h.id,
        dedupe_key: `habit_pending:${h.id}:${today}`,
      });
    }
  }

  /* ── Estudos atrasados ── */
  for (const c of input.courses ?? []) {
    const reason = courseOverdueReason(
      { status: c.status, target_date: c.target_date },
      c.lastSessionIso,
      today,
    );
    if (!reason) continue;
    out.push({
      type: "study_overdue",
      priority: reason === "target" ? "high" : "medium",
      title:
        reason === "target"
          ? `Curso atrasado — ${c.title}`
          : `Curso parado — ${c.title}`,
      description:
        reason === "target"
          ? c.target_date
            ? `Passou da data-alvo (${brDate(c.target_date)})`
            : "Passou da data-alvo"
          : "Sem sessão de estudo há mais de 7 dias",
      link: `/estudos/${c.id}`,
      entity_type: "study_course",
      entity_id: c.id,
      dedupe_key: `study_overdue:${c.id}:${reason}`,
    });
  }

  /* ── TO-DO (Fase 15): atrasadas, do dia e prazo próximo ── */
  for (const t of input.todoTasks ?? []) {
    // Reusa a MESMA regra pura da UI (nada de reimplementar "atrasada" aqui).
    const shape = {
      status: t.status as TodoStatus,
      scheduledDate: t.scheduled_date,
      deadlineAt: t.deadline_at,
    };
    const link = t.projectId
      ? `/todo?v=projeto&id=${t.projectId}&task=${t.id}`
      : `/todo?v=todas&task=${t.id}`;

    if (todoIsOverdue(shape, today)) {
      const urgente = t.priority === 1;
      out.push({
        type: "todo_overdue",
        priority: urgente ? "urgent" : "high",
        // A tarefa P1 atrasada ganha destaque próprio, conforme o pedido da fase.
        title: urgente ? `Urgente atrasada — ${t.title}` : `Tarefa atrasada — ${t.title}`,
        description: t.scheduled_date
          ? `Estava programada para ${brDate(t.scheduled_date)}`
          : t.deadline_at
            ? `Prazo venceu em ${brDate(t.deadline_at)}`
            : null,
        link,
        entity_type: "todo_task",
        entity_id: t.id,
        dedupe_key: `todo_overdue:${t.id}`,
      });
    } else if (todoIsDueToday(shape, today)) {
      out.push({
        type: "todo_today",
        priority: t.priority <= 2 ? "high" : "medium",
        title: `Tarefa para hoje — ${t.title}`,
        description: "Programada para hoje",
        link,
        entity_type: "todo_task",
        entity_id: t.id,
        // Inclui o dia: a mesma tarefa pode voltar a ser "de hoje" numa recorrência.
        dedupe_key: `todo_today:${t.id}:${today}`,
      });
    }

    // Prazo próximo é um alerta SEPARADO de "vence hoje" — são conceitos diferentes.
    if (todoDeadlineNear(shape, today, opt.diasPrazoTodo) && !todoIsDueToday(shape, today)) {
      out.push({
        type: "todo_deadline",
        priority: t.priority <= 2 ? "high" : "medium",
        title: `Prazo próximo — ${t.title}`,
        description: t.deadline_at ? `Prazo final em ${brDate(t.deadline_at)}` : null,
        link,
        entity_type: "todo_task",
        entity_id: t.id,
        dedupe_key: `todo_deadline:${t.id}:${t.deadline_at}`,
      });
    }
  }

  /* ── Lembretes de tarefa cujo horário já chegou ── */
  for (const r of input.todoReminders ?? []) {
    if (r.remindAtMs > input.nowMs) continue;
    out.push({
      type: "todo_reminder",
      priority: "high",
      title: `Lembrete — ${r.taskTitle}`,
      description: "Você pediu para ser lembrado desta tarefa.",
      link: r.projectId
        ? `/todo?v=projeto&id=${r.projectId}&task=${r.taskId}`
        : `/todo?v=todas&task=${r.taskId}`,
      entity_type: "todo_task",
      entity_id: r.taskId,
      // Chave pelo ID do lembrete: cada lembrete dispara uma vez só.
      dedupe_key: `todo_reminder:${r.id}`,
    });
  }

  /* ── Gasto alto ── */
  const sp = input.spending;
  if (sp && sp.mediaSaidas > 0 && sp.saidas > sp.mediaSaidas * opt.limiarGastoAlto) {
    const pct = Math.round((sp.saidas / sp.mediaSaidas - 1) * 100);
    out.push({
      type: "high_spending",
      priority: "medium",
      title: "Gasto acima da média",
      description: `As saídas do mês superam a média recente em ${pct}% (${formatCurrency(sp.saidas)}).`,
      link: "/dashboard/financeiro",
      entity_type: null,
      entity_id: null,
      dedupe_key: `high_spending:${sp.mes}`,
    });
  }

  /* ── Dieta e Alimentação (Fase 16-F) ── */
  if (input.nutrition) {
    out.push(...generateNutritionNotifications(input.nutrition));
  }

  return out;
}

/**
 * Fase 16-F — respeita `settings.notification_prefs`.
 *
 * PURO e separado da geração de propósito: o gerador continua dizendo "isto é verdade sobre
 * os dados", e este filtro diz "isto o usuário quer receber". Junto de `notificationEnabled`,
 * é o que faz TODA notificação ser desativável — e o que faz os tipos opt-in (a meta do dia)
 * nascerem desligados.
 *
 * ⚠️ Filtrar aqui, e não dentro de cada família, é o que impede um tipo novo de escapar da
 * preferência por esquecimento de quem o escreveu.
 */
export function filterByPrefs(
  candidates: NotificationCandidate[],
  prefs: NotificationPrefs | null | undefined,
): NotificationCandidate[] {
  return candidates.filter((c) => notificationEnabled(prefs, c.type));
}

/** Formata "valor unidade" de hábito de forma enxuta (pt-BR). */
function formatAmount(value: number, unit: string): string {
  const n = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value);
  return `${n} ${unit}`;
}

/**
 * Idempotência: dado o conjunto de `dedupe_key` já existentes no banco, devolve só os
 * candidatos novos (e remove duplicados dentro do próprio lote). Rodar o Cron N vezes
 * com os mesmos dados não gera notificações repetidas.
 */
export function selectNewCandidates(
  candidates: NotificationCandidate[],
  existingKeys: Set<string>,
): NotificationCandidate[] {
  const seen = new Set<string>(existingKeys);
  const fresh: NotificationCandidate[] = [];
  for (const c of candidates) {
    if (seen.has(c.dedupe_key)) continue;
    seen.add(c.dedupe_key);
    fresh.push(c);
  }
  return fresh;
}
