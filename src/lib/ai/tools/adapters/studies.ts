import "server-only";

/**
 * Fase 18-C — IA · As duas ferramentas de Estudos. CASCAS FINAS.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ NENHUM `.from()` E NENHUM `select()` NESTE ARQUIVO.                                   ║
 * ║ Tudo sai de `getStudyDashboard(hoje)` — a MESMA leitura agregada que a tela usa, e a  ║
 * ║ mesma que já resolve progresso, minutos, sequência e o motivo do atraso por           ║
 * ║ `studies/progress.ts`. Recalcular aqui faria a IA e a tela discordarem.                ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ "ATRASADO" É DERIVADO NA LEITURA, E TEM DOIS MOTIVOS DIFERENTES.                      ║
 * ║                                                                                       ║
 * ║ `courseOverdueReason` devolve `target` (passou da data-alvo) ou `inactive` (nenhuma   ║
 * ║ sessão em 7 dias). São coisas distintas, e achatar as duas em "atrasado" faria a      ║
 * ║ resposta cobrar prazo de quem só ficou uma semana sem estudar. O motivo viaja junto.  ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * `user_id` não aparece em lugar nenhum: a query roda sob RLS, com a sessão do usuário.
 */

import { z } from "zod";
import { getStudyDashboard } from "@/lib/studies/queries";
import {
  STUDY_CATEGORY_LABELS,
  STUDY_PRIORITY_LABELS,
  STUDY_STATUS_LABELS,
} from "@/lib/studies/constants";
import { STALE_DAYS, type OverdueReason } from "@/lib/studies/progress";
import type { StudyCourseStats } from "@/types/database";
import { hojeISO } from "@/lib/format";
import { emptyToolOutput, type ToolOutput, type ToolRef } from "../contracts";

/** ⚠️ `.strict()` nos dois: campo a mais é erro, e é por aqui que `user_id` seria barrado. */
export const getCoursesInput = z
  .object({
    // Sem o filtro, "quais cursos estou fazendo?" traz também os concluídos e os pausados —
    // e a resposta vira uma lista que o usuário não pediu.
    apenas_em_andamento: z.boolean().optional(),
  })
  .strict();

export const getStudyTimeInput = z.object({}).strict();

/** O módulo TEM rota por curso — então aqui a ref é por registro, não do painel. */
const refDoCurso = (id: string): ToolRef => ({
  tipo: "curso",
  id,
  // O MESMO formato da busca global (`search/queries.ts`).
  rota: `/estudos/${id}`,
});

/**
 * O motivo do atraso, em pt-BR, escrito por igualdade exata da chave — nunca interpolando o
 * valor cru. `satisfies` obriga a cadastrar a frase se um terceiro motivo entrar em
 * `OverdueReason`, em vez de deixar a IA relatar o identificador interno.
 */
const MOTIVO_DO_ATRASO = {
  target: "passou da data-alvo definida para o curso",
  inactive: `nenhuma sessão de estudo nos últimos ${STALE_DAYS} dias`,
} as const satisfies Record<OverdueReason, string>;

function itemDoCurso(c: StudyCourseStats) {
  return {
    curso: c.title,
    categoria: STUDY_CATEGORY_LABELS[c.category],
    status: STUDY_STATUS_LABELS[c.status],
    prioridade: STUDY_PRIORITY_LABELS[c.priority],
    progresso_percentual: c.progressPct,
    aulas_concluidas: c.doneLessons,
    aulas_no_total: c.totalLessons,
    minutos_estudados: c.studiedMinutes,
    // `null` é "nunca estudou" — é diferente de "estudou há muito tempo", e o modelo precisa
    // poder dizer a coisa certa.
    ultima_sessao: c.lastSessionDate,
    proxima_aula: c.nextLessonTitle,
    data_alvo: c.target_date,
    atrasado: c.overdue !== null,
    ...(c.overdue ? { motivo_do_atraso: MOTIVO_DO_ATRASO[c.overdue] } : {}),
  };
}

export async function getCourses(input: {
  apenas_em_andamento?: boolean;
}): Promise<ToolOutput> {
  const hoje = hojeISO();
  const painel = await getStudyDashboard(hoje);

  const cursos = input.apenas_em_andamento
    ? painel.courses.filter((c) => c.status === "em_andamento")
    : painel.courses;

  if (cursos.length === 0) {
    return emptyToolOutput(
      painel.courses.length === 0
        ? "Ainda não há curso cadastrado."
        : `Nenhum curso em andamento. Há ${painel.courses.length} curso(s) cadastrado(s) em outros estados (concluído, pausado ou não iniciado).`,
    );
  }

  return {
    periodo: null,
    contagem: cursos.length,
    completude: "exato",
    agregados: {
      cursos_listados: cursos.length,
      total_cadastrados: painel.totalCourses,
      em_andamento: painel.inProgress,
      concluidos: painel.completed,
      atrasados: painel.overdue.length,
      /**
       * ⚠️ O agregado de atraso vem de `painel.overdue`, que é sobre TODOS os cursos —
       * enquanto `itens` respeita o filtro pedido. Nomear o campo pelo que ele realmente
       * mede é o que impede o modelo de somar as duas coisas como se fossem a mesma.
       */
      atrasados_considera: "todos os cursos, mesmo com o filtro aplicado à lista",
    },
    itens: cursos.map(itemDoCurso),
    refs: cursos.map((c) => refDoCurso(c.id)),
  };
}

export async function getStudyTime(): Promise<ToolOutput> {
  const hoje = hojeISO();
  const painel = await getStudyDashboard(hoje);

  /**
   * Zero aqui é FATO MEDIDO, não ausência: as sessões existem ou não existem, e "não estudei
   * esta semana" é uma resposta verdadeira. É o mesmo caso da frequência de treino na 17-E —
   * diferente de "dia sem registro", onde o zero seria invenção.
   */
  const nuncaEstudou =
    painel.minutesWeek === 0 && painel.minutesMonth === 0 && painel.streak === 0;

  const metaSemanal = painel.courses
    .map((c) => c.weekly_goal_minutes)
    .filter((m): m is number => typeof m === "number" && m > 0)
    .reduce((a, b) => a + b, 0);

  return {
    periodo: null,
    contagem: painel.weekly.length,
    completude: "exato",
    agregados: {
      minutos_na_semana: painel.minutesWeek,
      minutos_no_mes: painel.minutesMonth,
      sequencia_atual_dias: painel.streak,
      melhor_sequencia_dias: painel.bestStreak,
      // Soma das metas semanais declaradas por curso. Zero significa "nenhum curso tem meta
      // semanal definida" — nunca "a meta é zero minutos".
      ...(metaSemanal > 0
        ? { meta_semanal_somada_minutos: metaSemanal }
        : {
            meta_semanal_somada_minutos: null,
            meta_indisponivel_porque:
              "Nenhum curso tem meta semanal definida. Isso não é uma meta de zero minutos.",
          }),
      ...(nuncaEstudou
        ? {
            observacao_do_periodo:
              "Nenhuma sessão de estudo registrada na semana nem no mês. Zero aqui é medição, não ausência de dado.",
          }
        : {}),
    },
    // A série semanal já vem pronta do painel (`StudyWeekPoint`), com o rótulo que a tela usa.
    itens: painel.weekly.map((p) => ({
      semana_de: p.weekStart,
      rotulo: p.label,
      minutos: p.minutes,
    })),
    refs: [{ tipo: "painel_de_estudos", id: "estudos", rota: "/estudos" }],
  };
}
