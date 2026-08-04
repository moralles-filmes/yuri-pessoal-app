/**
 * Fase 17-F — Treinos · as 9 famílias de notificação do módulo (PURO).
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ⛔ AS QUATRO REGRAS QUE ESTE ARQUIVO EXISTE PARA GARANTIR                              ║
 * ║                                                                                       ║
 * ║ 1. LEMBRETE NÃO É COBRANÇA. A notificação constata e oferece um caminho; nunca         ║
 * ║    repreende, nunca conta falhas, nunca manda treinar. "O treino de terça continua em  ║
 * ║    aberto" é constatação — "você faltou de novo" não é.                                ║
 * ║                                                                                       ║
 * ║ 2. `dedupe_key` DETERMINÍSTICO. Rodar o Cron duas vezes no mesmo dia não pode produzir  ║
 * ║    duas notificações. Nada de índice de laço, nada de timestamp na chave.               ║
 * ║                                                                                       ║
 * ║ 3. SEM PRESCRIÇÃO. Nenhuma notificação sugere carga, volume, alvo de meta ou "o ideal   ║
 * ║    seria". Recorde é constatação do que já foi feito, nunca convite a tentar mais.      ║
 * ║                                                                                       ║
 * ║ 4. AUSÊNCIA DE DADO NÃO É ZERO. Meta sem valor apurado não vira "0% da meta": ela       ║
 * ║    simplesmente não gera aviso de progresso.                                            ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * INTEGRA, NÃO REIMPLEMENTA: o status do planejamento sai de `derivePlannedStatus` (17-B), a
 * aritmética de data pura de `schedule.ts` (`Date.UTC`) e o status da meta de `deriveGoalStatus`
 * (17-E). Nenhuma regra do módulo é reescrita aqui — e nenhum agregado é recalculado: quem
 * apura número é `metrics.ts` (17-D), do lado do Cron.
 *
 * Sem `Date.now()`: `hoje` e `minutosAgora` são SEMPRE injetados.
 */
import { formatDate } from "@/lib/format";
import { diffDaysIso } from "@/lib/training/schedule";
import {
  goalLink,
  liveSessionLink,
  programLink,
  recordLink,
  scheduleLink,
  todayLink,
} from "@/lib/search/training-links";
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

/** Um dia planejado (17-B), já com o nome resolvido pelo lado do I/O. */
export type GenTrainingPlanned = {
  id: string;
  /** Data pura 'yyyy-MM-dd'. */
  scheduledDate: string;
  /** 'treino' | 'descanso'. Descanso nunca gera aviso — não há nada a fazer. */
  entryKind: string;
  /** Status GRAVADO (o derivado nasce aqui). */
  status: string;
  /** 'HH:mm[:ss]' ou null. Sem horário, nunca há "está chegando". */
  plannedTime: string | null;
  label: string;
  /** Já houve sessão registrada nesse dia? Então não há o que lembrar. */
  hasSession: boolean;
};

/** Sessão que ficou em execução (17-C). */
export type GenTrainingOpenSession = {
  id: string;
  label: string;
  /** Epoch ms do início. */
  startedAtMs: number;
};

/** Recorde consolidado (17-D) recém-registrado. */
export type GenTrainingRecord = {
  id: string;
  recordKey: string;
  exerciseName: string;
  typeLabel: string;
  valueLabel: string;
  /** 'yyyy-MM-dd' da marca. */
  achievedOn: string;
  /** Marca anterior já formatada, quando havia. */
  previousLabel: string | null;
};

/** Meta com o status JÁ derivado por `deriveGoalStatus` (17-E). */
export type GenTrainingGoal = {
  id: string;
  name: string;
  /** 'ativa' | 'atingida' | 'em_atraso' | 'expirada' | … (derivado). */
  derivedStatus: string;
  /** Início da janela vigente ('yyyy-MM-dd') — compõe as chaves periódicas. */
  rangeFrom: string;
  /** Prazo final da meta, quando existe. */
  endsOn: string | null;
  /** 0–100. `null` = sem base para calcular (e então não há aviso de progresso). */
  percent: number | null;
  /** Texto pronto do valor atual × alvo, montado pelo lado do I/O. */
  progressLabel: string | null;
  /** Meta de período curto (semanal/mensal) — só essas geram aviso de andamento. */
  isShortPeriod: boolean;
};

/** Programa perto do fim (17-B). */
export type GenTrainingProgram = {
  id: string;
  name: string;
  /** 'yyyy-MM-dd' do fim planejado. */
  endsOn: string;
};

export type TrainingGenInput = {
  /** 'yyyy-MM-dd' em Brasília. */
  todayIso: string;
  /** Minutos desde a meia-noite, em Brasília. */
  minutosAgora: number;
  /** Epoch ms de agora (só a sessão aberta precisa de instante). */
  nowMs: number;
  planned?: GenTrainingPlanned[];
  openSession?: GenTrainingOpenSession | null;
  records?: GenTrainingRecord[];
  goals?: GenTrainingGoal[];
  programs?: GenTrainingProgram[];
  options?: TrainingGenOptions;
};

export type TrainingGenOptions = {
  /** Aviso de "está chegando" a partir de N minutos antes do horário. */
  minutosAntesDoTreino?: number;
  /** Quantos dias para trás um treino em aberto continua sendo lembrado. */
  diasTreinoEmAberto?: number;
  /** Sessão em execução considerada esquecida depois de N horas. */
  horasSessaoAberta?: number;
  /** Recorde avisado enquanto tiver no máximo N dias. */
  diasRecordeNovo?: number;
  /** Meta avisada quando faltarem N dias ou menos para o prazo. */
  diasPrazoMeta?: number;
  /** Programa avisado quando faltarem N dias ou menos para o fim. */
  diasFimPrograma?: number;
  /** Máximo de recordes avisados por execução (uma sessão boa gera vários). */
  limiteRecordes?: number;
};

export const TRAINING_GEN_DEFAULTS: Required<TrainingGenOptions> = {
  minutosAntesDoTreino: 90,
  diasTreinoEmAberto: 3,
  horasSessaoAberta: 4,
  diasRecordeNovo: 2,
  diasPrazoMeta: 7,
  diasFimPrograma: 7,
  limiteRecordes: 3,
};

/** 'HH:mm[:ss]' → minutos desde a meia-noite; null quando não dá para ler. */
export function timeToMinutes(time: string | null): number | null {
  if (!time) return null;
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(time.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

/** 'HH:mm:ss' → 'HH:mm' (só apresentação). */
export function shortTime(time: string | null): string {
  if (!time) return "";
  const minutes = timeToMinutes(time);
  if (minutes === null) return "";
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

const num = (value: number) =>
  new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(value);

/** Status de planejamento que já tiveram desfecho — não há o que lembrar. */
const CLOSED_STATUSES = new Set(["concluido", "cancelado", "nao_realizado", "reagendado"]);

/* ───────────────────────────── Gerador ───────────────────────────── */

/**
 * As 8 famílias da 17-F. Devolve candidatos com `dedupe_key` determinístico; quem decide o que
 * entra no banco é `selectNewCandidates` (Fase 13) e quem respeita as preferências do usuário
 * é `filterByPrefs` (16-F) — nada aqui presume que a notificação vai ser criada.
 */
export function generateTrainingNotifications(input: TrainingGenInput): Candidate[] {
  const opt = { ...TRAINING_GEN_DEFAULTS, ...(input.options ?? {}) };
  const today = input.todayIso;
  const out: Candidate[] = [];

  /* ── 1, 2 e 3. Planejamento: hoje · está chegando · continua em aberto ── */
  for (const entry of input.planned ?? []) {
    // Descanso não pede nada de ninguém, e o que já teve desfecho está resolvido.
    if (entry.entryKind === "descanso") continue;
    if (CLOSED_STATUSES.has(entry.status)) continue;
    if (entry.hasSession) continue;

    const minutos = timeToMinutes(entry.plannedTime);

    if (entry.scheduledDate === today) {
      // (1) Treino de hoje. Uma vez por dia, sem horário na chave.
      out.push({
        type: "training_planned_today",
        priority: "low",
        title: `Hoje tem ${entry.label}`,
        description: minutos !== null
          ? `Previsto para ${shortTime(entry.plannedTime)}. Dá para começar quando você quiser.`
          : "Está no seu planejamento de hoje. Dá para começar quando você quiser.",
        link: todayLink(),
        entity_type: "training_scheduled_workout",
        entity_id: entry.id,
        dedupe_key: `training_planned_today:${entry.id}:${entry.scheduledDate}`,
      });

      // (2) O horário está chegando — só com horário definido e antes de ele passar.
      if (minutos !== null) {
        const faltam = minutos - input.minutosAgora;
        if (faltam >= 0 && faltam <= opt.minutosAntesDoTreino) {
          out.push({
            type: "training_session_soon",
            priority: "low",
            title: `${entry.label} às ${shortTime(entry.plannedTime)}`,
            description:
              faltam === 0
                ? "É o horário previsto no seu planejamento."
                : `Faltam ${num(faltam)} min para o horário previsto.`,
            link: todayLink(),
            entity_type: "training_scheduled_workout",
            entity_id: entry.id,
            dedupe_key: `training_session_soon:${entry.id}:${entry.scheduledDate}`,
          });
        }
      }
      continue;
    }

    // (3) Ficou para trás e continua sem desfecho. CONSTATAÇÃO + as duas saídas.
    const diasAtras = diffDaysIso(entry.scheduledDate, today);
    if (diasAtras > 0 && diasAtras <= opt.diasTreinoEmAberto) {
      out.push({
        type: "training_planned_missed",
        priority: "low",
        title: `${entry.label} continua em aberto`,
        description: `Estava planejado para ${formatDate(entry.scheduledDate)}. Dá para reagendar, marcar como não realizado ou simplesmente seguir.`,
        link: scheduleLink(entry.scheduledDate),
        entity_type: "training_scheduled_workout",
        entity_id: entry.id,
        dedupe_key: `training_planned_missed:${entry.id}:${entry.scheduledDate}`,
      });
    }
  }

  /* ── 4. Sessão em execução esquecida ── */
  const open = input.openSession;
  if (open) {
    const horas = (input.nowMs - open.startedAtMs) / 3_600_000;
    if (horas >= opt.horasSessaoAberta) {
      out.push({
        type: "training_session_open",
        priority: "medium",
        title: `${open.label} continua em execução`,
        description: `Começou há ${num(horas)}h. Dá para retomar de onde parou ou finalizar — o que já foi registrado está salvo.`,
        link: liveSessionLink(),
        entity_type: "training_session",
        entity_id: open.id,
        // Uma vez por sessão: a sessão em aberto é um fato único, não um evento diário.
        dedupe_key: `training_session_open:${open.id}`,
      });
    }
  }

  /* ── 5. Recorde novo ── */
  for (const record of (input.records ?? []).slice(0, opt.limiteRecordes)) {
    const dias = diffDaysIso(record.achievedOn, today);
    if (dias < 0 || dias > opt.diasRecordeNovo) continue;
    out.push({
      type: "training_record",
      priority: "low",
      title: `Nova marca em ${record.exerciseName}`,
      description: record.previousLabel
        ? `${record.typeLabel}: ${record.valueLabel} (a marca anterior era ${record.previousLabel}).`
        : `${record.typeLabel}: ${record.valueLabel}.`,
      link: recordLink(record.id),
      entity_type: "training_personal_record",
      entity_id: record.id,
      // A chave é a MARCA (o que foi conquistado), não a linha: consolidar de novo o mesmo
      // recorde não gera um segundo aviso.
      dedupe_key: `training_record:${record.recordKey}:${record.achievedOn}`,
    });
  }

  /* ── 6, 7 e 8. Metas: atingida · andamento (opt-in) · prazo chegando ── */
  for (const goal of input.goals ?? []) {
    if (goal.derivedStatus === "atingida") {
      out.push({
        type: "training_goal_reached",
        priority: "low",
        title: `Meta atingida: ${goal.name}`,
        description: goal.progressLabel
          ? `${goal.progressLabel}. Dá para encerrar a meta, prorrogar ou deixar correndo.`
          : "Dá para encerrar a meta, prorrogar ou deixar correndo.",
        link: goalLink(goal.id),
        entity_type: "training_goal",
        entity_id: goal.id,
        // Por JANELA: uma meta semanal atingida em duas semanas seguidas avisa duas vezes.
        dedupe_key: `training_goal_reached:${goal.id}:${goal.rangeFrom}`,
      });
      continue;
    }

    // Andamento — OPT-IN. Fora do pedido, avisar sobre o quanto falta vira cobrança.
    if (
      goal.isShortPeriod &&
      (goal.derivedStatus === "ativa" || goal.derivedStatus === "em_atraso") &&
      goal.percent !== null &&
      goal.progressLabel
    ) {
      out.push({
        type: "training_goal_progress",
        priority: "low",
        title: `${goal.name}: ${num(goal.percent)}% do período`,
        description: `${goal.progressLabel}. É um acompanhamento, não uma cobrança.`,
        link: goalLink(goal.id),
        entity_type: "training_goal",
        entity_id: goal.id,
        // Uma por janela — um aviso diário de progresso seria exatamente a cobrança que a
        // regra 1 proíbe.
        dedupe_key: `training_goal_progress:${goal.id}:${goal.rangeFrom}`,
      });
    }

    // Prazo chegando — só o que ainda está correndo.
    if (
      goal.endsOn &&
      (goal.derivedStatus === "ativa" || goal.derivedStatus === "em_atraso") &&
      diffDaysIso(today, goal.endsOn) >= 0 &&
      diffDaysIso(today, goal.endsOn) <= opt.diasPrazoMeta
    ) {
      const dias = diffDaysIso(today, goal.endsOn);
      out.push({
        type: "training_goal_deadline",
        priority: "low",
        title: `${goal.name} termina ${dias === 0 ? "hoje" : `em ${num(dias)} ${dias === 1 ? "dia" : "dias"}`}`,
        description: goal.progressLabel
          ? `${goal.progressLabel}. Prazo final em ${formatDate(goal.endsOn)}.`
          : `Prazo final em ${formatDate(goal.endsOn)}.`,
        link: goalLink(goal.id),
        entity_type: "training_goal",
        entity_id: goal.id,
        dedupe_key: `training_goal_deadline:${goal.id}:${goal.endsOn}`,
      });
    }
  }

  /* ── 9. Programa perto do fim ── */
  for (const program of input.programs ?? []) {
    const dias = diffDaysIso(today, program.endsOn);
    if (dias < 0 || dias > opt.diasFimPrograma) continue;
    out.push({
      type: "training_program_ending",
      priority: "low",
      title: `${program.name} termina ${dias === 0 ? "hoje" : `em ${num(dias)} ${dias === 1 ? "dia" : "dias"}`}`,
      description: `O período planejado vai até ${formatDate(program.endsOn)}. Dá para prorrogar, encerrar ou começar outro.`,
      link: programLink(program.id),
      entity_type: "training_program",
      entity_id: program.id,
      dedupe_key: `training_program_ending:${program.id}:${program.endsOn}`,
    });
  }

  return out;
}
