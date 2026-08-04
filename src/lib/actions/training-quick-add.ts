"use server";

/**
 * Fase 17-F — Treinos no lançamento rápido (server-only).
 *
 * ⛔ ENTRA PELO CAMINHO OFICIAL. `quickStartTraining` só resolve QUAL treino iniciar e delega
 * para `createSession` + `startSession` (17-C). O snapshot congelado, a máquina de estados, o
 * índice de "uma sessão em execução" e a idempotência continuam sendo os mesmos do fluxo
 * normal — não existe um segundo caminho de criação de sessão, como não existe um segundo
 * caminho de gravação no diário da Dieta (16-F).
 *
 * O peso corporal do lançamento rápido é o do MÓDULO CENTRAL `body_*` (16-E), o mesmo que a
 * Dieta usa — por isso ele não tem action própria aqui: `saveMeasurement` já serve aos dois.
 */
import { authContext, dbError, notAuthed } from "@/lib/actions/helpers";
import { createSession, startSession } from "@/lib/actions/training-sessions";
import { hojeISO } from "@/lib/format";
import { derivePlannedStatus } from "@/lib/training/schedule";
import type { ActionResult } from "@/types/finance";

/** Uma opção de treino para o seletor do lançamento rápido. */
export type QuickTrainingWorkout = {
  id: string;
  name: string;
  /** Preenchido quando este treino é o planejado para hoje. */
  scheduledId: string | null;
  plannedTime: string | null;
  /** Status derivado do dia planejado ('hoje', 'atrasado'…), quando houver. */
  plannedStatus: string | null;
};

export type TrainingQuickAddOptions = {
  /** Treinos ativos, com o planejado de hoje em primeiro lugar. */
  workouts: QuickTrainingWorkout[];
  /** Já existe sessão em execução? A tela oferece continuar em vez de iniciar outra. */
  runningSessionId: string | null;
  /** Existe algum hábito, treino ou plano — evita um formulário vazio sem explicação. */
  hasModule: boolean;
};

/**
 * Opções do lançamento rápido de treino. Leitura enxuta de propósito: o modal precisa abrir
 * rápido, e o formulário completo continua sendo o da preparação da sessão.
 */
export async function loadTrainingQuickAddOptions(): Promise<TrainingQuickAddOptions> {
  const ctx = await authContext();
  if (!ctx) return { workouts: [], runningSessionId: null, hasModule: false };

  const hoje = hojeISO();

  const [workoutsRes, scheduledRes, runningRes] = await Promise.all([
    ctx.supabase
      .from("training_workouts")
      .select("id,name,status,archived_at,superseded_by,position")
      .eq("user_id", ctx.userId)
      .is("archived_at", null)
      .is("superseded_by", null)
      .neq("status", "arquivado")
      .order("position", { ascending: true })
      .limit(100),
    ctx.supabase
      .from("training_scheduled_workouts")
      .select("id,workout_id,scheduled_date,planned_time,entry_kind,status")
      .eq("user_id", ctx.userId)
      .eq("scheduled_date", hoje)
      .eq("entry_kind", "treino")
      .limit(10),
    ctx.supabase
      .from("training_sessions")
      .select("id,status")
      .eq("user_id", ctx.userId)
      .in("status", ["ativa", "descansando", "pausada"])
      .limit(1),
  ]);

  const scheduledByWorkout = new Map(
    (scheduledRes.data ?? [])
      .filter((row) => row.workout_id && row.status === "planejado")
      .map((row) => [row.workout_id as string, row]),
  );

  const workouts: QuickTrainingWorkout[] = (workoutsRes.data ?? []).map((row) => {
    const planned = scheduledByWorkout.get(row.id);
    return {
      id: row.id,
      name: row.name,
      scheduledId: planned?.id ?? null,
      plannedTime: planned?.planned_time ? planned.planned_time.slice(0, 5) : null,
      // O status é DERIVADO na leitura, com `hoje` do servidor (17-B).
      plannedStatus: planned
        ? derivePlannedStatus(
            {
              scheduledDate: planned.scheduled_date,
              status: planned.status as never,
            },
            hoje,
          )
        : null,
    };
  });

  // O treino planejado para hoje vem primeiro — é o que a pessoa quer 9 vezes em 10.
  workouts.sort((a, b) => Number(Boolean(b.scheduledId)) - Number(Boolean(a.scheduledId)));

  return {
    workouts,
    runningSessionId: (runningRes.data ?? [])[0]?.id ?? null,
    hasModule: workouts.length > 0,
  };
}

/**
 * Inicia um treino a partir do lançamento rápido.
 *
 * Delega para o caminho oficial: `createSession` (rascunho + snapshot) e `startSession`
 * (congelamento e máquina de estados). Se já houver sessão em execução, a recusa vem de lá,
 * com a mensagem de lá — nada é descartado por conta própria.
 */
export async function quickStartTraining(input: {
  workout_id: string;
  scheduled_workout_id?: string | null;
}): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const created = await createSession({
    origin_kind: input.scheduled_workout_id ? "planejado" : "modelo",
    workout_id: input.workout_id,
    scheduled_workout_id: input.scheduled_workout_id ?? null,
  });
  if (!created.ok) return created;

  const started = await startSession({ id: created.data.id });
  if (!started.ok) {
    // O rascunho fica: a preparação continua acessível e nada foi perdido.
    return started;
  }

  return { ok: true, data: { id: created.data.id } };
}

/** Continua a sessão em execução (o botão do lançamento rápido quando já há treino ativo). */
export async function quickResumeTraining(): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const { data } = await ctx.supabase
    .from("training_sessions")
    .select("id")
    .eq("user_id", ctx.userId)
    .in("status", ["ativa", "descansando", "pausada"])
    .limit(1)
    .maybeSingle();

  if (!data) return dbError("Não há treino em andamento.");
  return { ok: true, data: { id: data.id } };
}
