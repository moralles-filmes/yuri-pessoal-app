import "server-only";

/**
 * Fase 18-B — IA · As três ferramentas de Treinos. CASCAS FINAS.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ NENHUM `.from()` E NENHUM `select()` NESTE ARQUIVO.                                   ║
 * ║ Tudo sai de `training/history-queries.ts` e de `training/metrics.ts` — os MESMOS que  ║
 * ║ a tela usa. Uma segunda leitura discordaria da primeira no primeiro campo novo, e o    ║
 * ║ número que a IA relata deixaria de bater com o número que o usuário vê.                ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * `user_id` não aparece em lugar nenhum: as queries rodam sob RLS, com a sessão do usuário.
 */

import { z } from "zod";
import { getPersonalRecords, getSessionHistory } from "@/lib/training/history-queries";
import { aggregateSessions, sessionMetrics } from "@/lib/training/metrics";
import { addDaysIso } from "@/lib/training/schedule";
import { hojeISO } from "@/lib/format";
import { emptyToolOutput, type ToolOutput, type ToolRef } from "../contracts";

/** ⚠️ `.strict()` em todos: campo a mais é erro, e é por aqui que `user_id` seria barrado. */
export const getLastWorkoutInput = z.object({}).strict();

export const getVolumeInput = z
  .object({
    dias: z.number().int().min(1).max(365).optional(),
  })
  .strict();

export const getRecordsInput = z
  .object({
    exercicio: z.string().trim().min(1).max(80).optional(),
  })
  .strict();

const JANELA_PADRAO_DIAS = 7;

const refDaSessao = (id: string): ToolRef => ({
  tipo: "sessao_de_treino",
  id,
  rota: `/treinos/historico/${id}`,
});

export async function getLastWorkout(): Promise<ToolOutput> {
  const historico = await getSessionHistory({ limit: 1 });
  const sessao = historico[0];
  if (!sessao) {
    return emptyToolOutput("Ainda não há treino registrado no histórico.");
  }

  const m = sessionMetrics(sessao);

  return {
    periodo: { de: sessao.sessionDate, ate: sessao.sessionDate },
    contagem: 1,
    // A qualidade do agregado VIAJA COM O NÚMERO: sem peso corporal do dia, a carga
    // efetiva de exercício de peso corporal é indisponível, e o total é parcial.
    completude: m.totals.quality === "exato" ? "exato" : "parcial",
    ...(m.totals.quality === "parcial"
      ? {
          motivo_incompleto:
            "Algumas séries ficaram de fora do volume em kg. O motivo aparece em `agregados.lacunas`.",
        }
      : {}),
    agregados: {
      treino: sessao.workoutName,
      data: sessao.sessionDate,
      volume_kg: m.totals.volumeKg,
      repeticoes: m.totals.reps,
      segundos_sob_tensao: m.totals.durationSeconds,
      series: m.totals.sets,
      series_de_trabalho: m.totals.workingSets,
      series_de_aquecimento: m.totals.warmupSets,
      unidades: m.totals.units,
      lacunas: m.totals.gaps,
      duracao_total_segundos: sessao.totalSeconds,
      duracao_ativa_segundos: sessao.activeSeconds,
    },
    itens: sessao.exercises.map((e) => ({
      exercicio: e.exerciseName,
      grupo_muscular: e.muscleGroup,
      tipo_de_medicao: e.trackingType,
      series: e.sets.length,
    })),
    refs: [refDaSessao(sessao.id)],
  };
}

export async function getVolume(input: { dias?: number }): Promise<ToolOutput> {
  const dias = input.dias ?? JANELA_PADRAO_DIAS;
  const ate = hojeISO();
  // Janela INCLUSIVA nos dois extremos: 7 dias terminando hoje é de hoje-6 até hoje.
  const de = addDaysIso(ate, -(dias - 1));

  const sessoes = await getSessionHistory({ from: de, to: ate });
  if (sessoes.length === 0) {
    return {
      ...emptyToolOutput(
        `Nenhum treino registrado entre ${de} e ${ate}. Isso é ausência de registro, não um treino de volume zero.`,
      ),
      periodo: { de, ate },
    };
  }

  // O MESMO agregador da tela. Não recalcule nada aqui.
  const p = aggregateSessions(sessoes);

  return {
    periodo: { de, ate },
    contagem: p.sessionCount,
    completude: p.totals.quality === "exato" ? "exato" : "parcial",
    ...(p.totals.quality === "parcial"
      ? {
          motivo_incompleto:
            "Parte das séries não pôde entrar no volume em kg. Os motivos estão em `agregados.lacunas`.",
        }
      : {}),
    agregados: {
      sessoes: p.sessionCount,
      dias_com_treino: p.trainedDays.length,
      volume_kg: p.totals.volumeKg,
      repeticoes: p.totals.reps,
      segundos_sob_tensao: p.totals.durationSeconds,
      distancia_m: p.totals.distanceM,
      series: p.totals.sets,
      series_por_grupo_muscular: p.setsByMuscleGroup,
      volume_por_grupo_muscular: p.volumeByMuscleGroup,
      unidades: p.totals.units,
      lacunas: p.totals.gaps,
    },
    itens: sessoes.map((s) => ({
      data: s.sessionDate,
      treino: s.workoutName,
      exercicios: s.exercises.length,
    })),
    refs: sessoes.map((s) => refDaSessao(s.id)),
  };
}

export async function getRecords(input: { exercicio?: string }): Promise<ToolOutput> {
  const todos = await getPersonalRecords();
  const filtro = input.exercicio?.toLowerCase();
  // `exerciseName` é nulo no recorde de escopo geral: sem nome, ele nunca casa com um
  // filtro por exercício — atribuí-lo a quem foi pesquisado seria inventar procedência.
  const recordes = filtro
    ? todos.filter((r) => (r.exerciseName ?? "").toLowerCase().includes(filtro))
    : todos;

  if (recordes.length === 0) {
    return emptyToolOutput(
      filtro
        ? `Nenhum recorde registrado para "${input.exercicio}".`
        : "Ainda não há recorde pessoal registrado.",
    );
  }

  return {
    periodo: null,
    contagem: recordes.length,
    completude: "exato",
    agregados: { total_de_recordes: recordes.length },
    itens: recordes.map((r) => ({
      exercicio: r.exerciseName,
      tipo: r.recordType,
      valor: r.value,
      unidade: r.unit,
      repeticoes: r.reps,
      peso_kg: r.weightKg,
      // 1RM é ESTIMATIVA. A fórmula viaja junto para a resposta poder dizer isso.
      formula_1rm: r.oneRmFormula,
      alcancado_em: r.achievedOn,
      marca_anterior: r.previousValue,
      marca_anterior_em: r.previousAchievedOn,
    })),
    refs: recordes
      .filter((r) => r.sessionId)
      .map((r) => refDaSessao(r.sessionId as string)),
  };
}
