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
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ USAR A MESMA FUNÇÃO NÃO BASTA: É PRECISO USAR AS MESMAS OPÇÕES.                       ║
 * ║                                                                                       ║
 * ║ `sessionMetrics`/`aggregateSessions` sem `MetricOptions` caem no padrão do CÓDIGO     ║
 * ║ (`includeWarmup: false`, `unilateralRule: 'soma_dos_lados'`) — e toda tela do módulo  ║
 * ║ passa a PREFERÊNCIA do usuário (`dashboard/queries.ts`, `goal-queries.ts`,            ║
 * ║ `history-client.tsx`). Com `unilateral_volume_rule = 'serie_completa'`, a IA relataria ║
 * ║ 1200 kg onde a tela mostra 600. Por isso toda ferramenta que agrega lê                 ║
 * ║ `getTrainingPreferences()` e leva `regra_de_contagem` JUNTO do número (invariante 12   ║
 * ║ da Fase 17: a regra de contagem aparece ao lado do total, nunca implícita).            ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * `user_id` não aparece em lugar nenhum: as queries rodam sob RLS, com a sessão do usuário.
 */

import { z } from "zod";
import { getPersonalRecords, getSessionHistory } from "@/lib/training/history-queries";
import {
  aggregateSessions,
  partialExplanation,
  sessionMetrics,
  volumeRuleLabel,
  type MetricOptions,
  type MetricTotals,
} from "@/lib/training/metrics";
import { getTrainingPreferences } from "@/lib/training/queries";
import { addDaysIso } from "@/lib/training/schedule";
import type { TrainingPreferences } from "@/lib/training/types";
import type { VolumeUnit } from "@/lib/training/tracking";
import { normalizarTexto } from "@/lib/ai/core/text";
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

/**
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ O TETO DE LINHAS DA CONSULTA PRECISA SER VISÍVEL AQUI — SENÃO ELE MENTE EM SILÊNCIO.  ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * `getSessionHistory` corta em 500 sessões por padrão. Chamando sem `limit`, uma janela com
 * mais que isso volta truncada **sem nenhum sinal**: `aggregateSessions` soma só as 500 mais
 * recentes e o resultado sairia com `completude: "exato"` — um total parcial apresentado como
 * completo, que é exatamente a mentira que esta subfase existe para impedir.
 *
 * Por isso pedimos `TETO + 1`: a linha extra não é usada em nada além de **provar que o teto
 * foi atingido**. Sem ela, 500 devolvidas são indistinguíveis de "existem exatamente 500".
 *
 * O valor está repetido aqui de propósito, e não importado: `SESSION_LIMIT` não é exportado
 * por `history-queries.ts`, e passar o `limit` explicitamente é o que dá a esta camada o
 * controle sobre a própria honestidade. O teste amarra os dois.
 */
const TETO_SESSOES_DA_JANELA = 500;

/**
 * A janela do "último treino". O `limit: 1` do histórico corta o RESULTADO, não a janela:
 * sem isto, `getSessionHistory` volta só 365 dias e quem parou de treinar há mais de um ano
 * receberia "não há treino registrado" — afirmação falsa sobre o registro do usuário. O
 * texto do caso vazio declara a janela consultada de qualquer modo.
 */
const JANELA_HISTORICO_COMPLETO_DIAS = 3650;
const ANOS_DO_HISTORICO_COMPLETO = Math.round(JANELA_HISTORICO_COMPLETO_DIAS / 365);

const refDaSessao = (id: string): ToolRef => ({
  tipo: "sessao_de_treino",
  id,
  rota: `/treinos/historico/${id}`,
});

/**
 * As MESMAS opções que a tela usa. Sem isto, o número da IA e o da tela divergem.
 *
 * ⚠️ O retorno é `Required<MetricOptions>`, não `MetricOptions`. Todo campo de `MetricOptions`
 * é opcional, então com o tipo frouxo uma opção NOVA em `metrics.ts` passaria a existir para a
 * tela e continuaria caindo no default aqui — sem erro de compilação, sem teste vermelho, e com
 * a IA relatando um número diferente do que o usuário vê. Foi exatamente assim que
 * `unilateralRule` divergiu. Com `Required`, acrescentar um campo lá quebra o `tsc` aqui.
 */
const opcoesDe = (prefs: TrainingPreferences): Required<MetricOptions> => ({
  includeWarmup: prefs.countWarmupInVolume,
  unilateralRule: prefs.unilateralVolumeRule,
});

/**
 * Quais totais entram no agregado — a MESMA decisão que a tela toma. `metrics-summary.tsx`
 * testa `totals.units.includes("kg")` para decidir se o card de Volume aparece; aqui vale o
 * mesmo, com uma folga a mais (`|| valor !== 0`) para o caso inverso: total diferente de zero
 * nunca é escondido por a unidade não ter sido declarada.
 *
 * Um período só de corrida tem `units: ["distancia"]`: relatar `volume_kg: 0` ali levaria o
 * modelo a dizer "seu volume foi 0 kg" para quem correu 20 km, exatamente o "ausência vira
 * zero" que a invariante 21 da 17-E proíbe.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ⚠️ O CASO LIMITE DA INVARIANTE 3, DECIDIDO DE PROPÓSITO: O ZERO PASSA.                 ║
 * ║                                                                                       ║
 * ║ Um treino só de barra fixa SEM peso corporal do dia tem `units: ["kg"]` (houve série  ║
 * ║ elegível de unidade kg) e `volumeKg: 0` (nenhuma pôde contribuir). Aqui o zero PASSA — ║
 * ║ e é o que a tela também mostra: "0 kg" com o selo "Parcial — veja o motivo abaixo".   ║
 * ║                                                                                       ║
 * ║ "Sem peso corporal do dia, a carga efetiva é INDISPONÍVEL, nunca zero" é honrada pelo ║
 * ║ TRIO que viaja junto com esse número — `completude: "parcial"` + `motivo_incompleto`  ║
 * ║ (a frase do próprio módulo) + `agregados.lacunas` (`sem_peso_corporal`) — e não por    ║
 * ║ esconder o campo. Esconder faria a IA relatar um treino que a tela mostra, o que é     ║
 * ║ justamente o defeito que esta fase mais evita.                                         ║
 * ║                                                                                       ║
 * ║ Se a tela um dia deixar de mostrar o zero, ESTE PONTO MUDA JUNTO — há teste dos dois  ║
 * ║ lados fixando a paridade.                                                              ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */
function totaisReportaveis(totals: MetricTotals): Record<string, number> {
  const entra = (unidade: VolumeUnit, valor: number) =>
    totals.units.includes(unidade) || valor !== 0;

  return {
    ...(entra("kg", totals.volumeKg) ? { volume_kg: totals.volumeKg } : {}),
    ...(entra("reps", totals.reps) ? { repeticoes: totals.reps } : {}),
    ...(entra("segundos", totals.durationSeconds)
      ? { segundos_sob_tensao: totals.durationSeconds }
      : {}),
    ...(entra("distancia", totals.distanceM) ? { distancia_m: totals.distanceM } : {}),
    ...(entra("calorias", totals.calories) ? { calorias: totals.calories } : {}),
  };
}

/**
 * A ressalva do agregado é a MESMA frase que a tela mostra (`partialExplanation`, 17-D).
 * Escrever um texto próprio aqui faria a IA explicar o "parcial" com palavras diferentes das
 * do módulo — a mesma classe de divergência que as `MetricOptions` causam no número.
 */
function ressalva(totals: MetricTotals): { motivo_incompleto?: string } {
  if (totals.quality === "exato") return {};
  const frase = partialExplanation(totals);
  return {
    motivo_incompleto:
      frase ||
      "Parte das séries não pôde entrar no volume em kg. O motivo aparece em `agregados.lacunas`.",
  };
}

export async function getLastWorkout(): Promise<ToolOutput> {
  const [prefs, historico] = await Promise.all([
    getTrainingPreferences(),
    getSessionHistory({ days: JANELA_HISTORICO_COMPLETO_DIAS, limit: 1 }),
  ]);

  const sessao = historico[0];
  if (!sessao) {
    return emptyToolOutput(
      `Ainda não há treino registrado na janela consultada (os últimos ${ANOS_DO_HISTORICO_COMPLETO} anos).`,
    );
  }

  const options = opcoesDe(prefs);
  const m = sessionMetrics(sessao, options);

  return {
    periodo: { de: sessao.sessionDate, ate: sessao.sessionDate },
    contagem: 1,
    // A qualidade do agregado VIAJA COM O NÚMERO: sem peso corporal do dia, a carga
    // efetiva de exercício de peso corporal é indisponível, e o total é parcial.
    completude: m.totals.quality === "exato" ? "exato" : "parcial",
    ...ressalva(m.totals),
    agregados: {
      treino: sessao.workoutName,
      data: sessao.sessionDate,
      ...totaisReportaveis(m.totals),
      series: m.totals.sets,
      series_de_trabalho: m.totals.workingSets,
      series_de_aquecimento: m.totals.warmupSets,
      unidades: m.totals.units,
      lacunas: m.totals.gaps,
      // Invariante 12 da Fase 17: a regra de contagem aparece AO LADO do número.
      regra_de_contagem: volumeRuleLabel(options),
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

  const [prefs, encontradas] = await Promise.all([
    getTrainingPreferences(),
    getSessionHistory({ from: de, to: ate, limit: TETO_SESSOES_DA_JANELA + 1 }),
  ]);

  // A 501ª só serve de prova de que há mais; ela não entra na soma, para o total ser sempre
  // "as N mais recentes" e não variar conforme a linha extra tenha vindo ou não.
  const saturou = encontradas.length > TETO_SESSOES_DA_JANELA;
  const sessoes = saturou ? encontradas.slice(0, TETO_SESSOES_DA_JANELA) : encontradas;

  if (sessoes.length === 0) {
    return {
      ...emptyToolOutput(
        `Nenhum treino registrado entre ${de} e ${ate}. Isso é ausência de registro, não um treino de volume zero.`,
      ),
      periodo: { de, ate },
    };
  }

  // O MESMO agregador da tela, com as MESMAS opções da tela. Não recalcule nada aqui.
  const options = opcoesDe(prefs);
  const p = aggregateSessions(sessoes, options);

  // Duas causas independentes de total incompleto: séries que não convertem em kg (a
  // `ressalva` de sempre) e a janela ter mais treinos que o teto da consulta. A segunda
  // vence na mensagem porque é a que afeta TODOS os números, não só o volume.
  const motivoDoTeto = saturou
    ? `O período tem mais de ${TETO_SESSOES_DA_JANELA} treinos registrados e a consulta traz os ${TETO_SESSOES_DA_JANELA} mais recentes: estes totais cobrem essa parte, não o período inteiro. Peça uma janela menor para um número que feche.`
    : null;

  return {
    periodo: { de, ate },
    contagem: p.sessionCount,
    completude: !saturou && p.totals.quality === "exato" ? "exato" : "parcial",
    ...ressalva(p.totals),
    ...(motivoDoTeto ? { motivo_incompleto: motivoDoTeto } : {}),
    agregados: {
      sessoes: p.sessionCount,
      dias_com_treino: p.trainedDays.length,
      ...totaisReportaveis(p.totals),
      series: p.totals.sets,
      series_por_grupo_muscular: p.setsByMuscleGroup,
      volume_por_grupo_muscular: p.volumeByMuscleGroup,
      unidades: p.totals.units,
      lacunas: p.totals.gaps,
      // Invariante 12 da Fase 17: a regra de contagem aparece AO LADO do número.
      regra_de_contagem: volumeRuleLabel(options),
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
  // A MESMA normalização do roteador: sem tirar acento, "triceps" não casa "Tríceps" e a
  // resposta afirmaria que não há recorde onde há.
  const filtro = input.exercicio ? normalizarTexto(input.exercicio) : undefined;
  // `exerciseName` é nulo no recorde de escopo geral: sem nome, ele nunca casa com um
  // filtro por exercício — atribuí-lo a quem foi pesquisado seria inventar procedência.
  const recordes = filtro
    ? todos.filter((r) => normalizarTexto(r.exerciseName ?? "").includes(filtro))
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
    /**
     * ⚠️ DEDUPLICADO por id de sessão, e não é detalhe de estilo: dois recordes distintos
     * podem ter sido batidos NO MESMO TREINO ("1RM supino" e "peso máximo supino" na mesma
     * sessão). Sem o `Set`, a mesma referência sai duas vezes — a tela lista o mesmo link
     * repetido em "Ver dados usados" e o React recebe duas chaves iguais (`tipo-id`).
     * `contagem` continua sendo o número de RECORDES; `refs` é para onde ir, não quantos são.
     */
    refs: [
      ...new Set(recordes.map((r) => r.sessionId).filter(Boolean) as string[]),
    ].map(refDaSessao),
  };
}
