import "server-only";

/**
 * Fase 18-C — IA · As duas ferramentas de Tarefas e Rotinas (Fase 09). CASCAS FINAS.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ESTE MÓDULO NÃO É O TO-DO — E A CONFUSÃO ENTRE OS DOIS É O RISCO PRINCIPAL AQUI.      ║
 * ║                                                                                       ║
 * ║ O projeto tem DOIS módulos de tarefas, de propósito: `/todo` (Fase 15, o gerenciador  ║
 * ║ principal, tabelas `todo_*`) e `/tarefas` + `/rotinas` (Fase 09, legado + rotinas com ║
 * ║ check-in diário, tabelas `tasks`/`routines`). São dados SEPARADOS: uma tarefa criada  ║
 * ║ num não existe no outro.                                                              ║
 * ║                                                                                       ║
 * ║ Por isso os textos desta ferramenta NOMEIAM o módulo de onde o número veio. Um total  ║
 * ║ de "tarefas pendentes" sem essa qualificação levaria o usuário a somar mentalmente as ║
 * ║ duas listas — ou a achar que uma some.                                                 ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * `atrasada` também aqui é DERIVADA na leitura (`tasks/status.ts`): o CHECK do banco aceita o
 * valor por compatibilidade, mas ele nunca é escrito.
 *
 * `user_id` não aparece em lugar nenhum: as queries rodam sob RLS, com a sessão do usuário.
 */

import { z } from "zod";
import { getRoutinesWithToday, getTasks } from "@/lib/tasks/queries";
import {
  compareTasks,
  effectiveTaskStatus,
  isDueToday,
  isOpen,
  isOverdue,
} from "@/lib/tasks/status";
import {
  ROUTINE_TYPE_LABELS,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  type TaskStoredStatus,
} from "@/lib/tasks/constants";
import type { RoutineWithToday, TaskWithRelations } from "@/types/database";
import { hojeISO } from "@/lib/format";
import { emptyToolOutput, type ToolOutput, type ToolRef } from "../contracts";

/** ⚠️ `.strict()` nos dois: campo a mais é erro, e é por aqui que `user_id` seria barrado. */
export const getPendingInput = z.object({}).strict();
export const getRoutinesTodayInput = z.object({}).strict();

/**
 * `getTasks` corta em 2000 (literal na query, sem parâmetro). Mesma disciplina do TO-DO: o
 * único sinal disponível é o retorno ter exatamente o tamanho do teto, e nesse caso o total
 * é marcado como parcial. O teste amarra este valor ao da query lendo o arquivo do disco.
 */
const TETO_TAREFAS_DA_CONSULTA = 2000;

const refDaTarefa = (id: string): ToolRef => ({
  tipo: "tarefa",
  id,
  rota: `/tarefas?task=${id}`,
});

const REF_DAS_ROTINAS: ToolRef = {
  tipo: "painel_de_rotinas",
  id: "rotinas",
  rota: "/rotinas",
};

/** `TaskWithRelations` carrega o status como `string`; o módulo puro exige o tipo estreito. */
const comoTaskLike = (t: TaskWithRelations) => ({
  status: t.status as TaskStoredStatus,
  due_date: t.due_date,
});

export async function getPending(): Promise<ToolOutput> {
  const hoje = hojeISO();
  const todas = await getTasks();

  const abertas = todas.filter((t) => isOpen(comoTaskLike(t)));

  // A MESMA ordenação da tela: atrasadas primeiro, depois por vencimento, depois prioridade.
  const ordenadas = [...abertas].sort((a, b) =>
    compareTasks(
      { ...comoTaskLike(a), priority: a.priority as never, position: a.position },
      { ...comoTaskLike(b), priority: b.priority as never, position: b.position },
      hoje,
    ),
  );

  const atrasadas = abertas.filter((t) => isOverdue(comoTaskLike(t), hoje));
  const deHoje = abertas.filter((t) => isDueToday(comoTaskLike(t), hoje));
  const semData = abertas.filter((t) => t.due_date === null);

  const saturou = todas.length >= TETO_TAREFAS_DA_CONSULTA;
  const ressalva = saturou
    ? {
        completude: "parcial" as const,
        motivo_incompleto: `A consulta traz no máximo ${TETO_TAREFAS_DA_CONSULTA} tarefas e devolveu esse número: pode haver tarefa fora destes totais.`,
      }
    : { completude: "exato" as const };

  if (ordenadas.length === 0) {
    return {
      ...emptyToolOutput(
        "Nenhuma tarefa aberta no módulo Tarefas e Rotinas (Fase 09). Atenção: este é o módulo legado — as tarefas do TO-DO são outras, e ficam em outro lugar.",
      ),
      ...ressalva,
    };
  }

  return {
    periodo: null,
    contagem: ordenadas.length,
    ...ressalva,
    agregados: {
      modulo: "Tarefas e Rotinas (Fase 09) — NÃO é o TO-DO",
      abertas: abertas.length,
      atrasadas: atrasadas.length,
      para_hoje: deHoje.length,
      sem_data: semData.length,
    },
    itens: ordenadas.map((t) => ({
      titulo: t.title,
      projeto: t.project?.name ?? null,
      // Nunca `t.status` cru: `atrasada` é derivada e o banco guarda `pendente`.
      status: TASK_STATUS_LABELS[effectiveTaskStatus(comoTaskLike(t), hoje)],
      prioridade: TASK_PRIORITY_LABELS[t.priority as keyof typeof TASK_PRIORITY_LABELS],
      vence_em: t.due_date,
      // Checklist parcial muda o que a resposta pode dizer sobre "quanto falta".
      itens_do_checklist: t.checklist?.length ?? 0,
      itens_concluidos: t.checklist?.filter((c) => c.is_done).length ?? 0,
    })),
    refs: ordenadas.map((t) => refDaTarefa(t.id)),
  };
}

function itemDaRotina(r: RoutineWithToday) {
  /**
   * ⚠️ Mesma regra dos Hábitos: `computeAdherence` devolve `rate: 0` quando não houve dia
   * agendado na janela. Relatar 0% sobre uma rotina que não caía nenhum dia seria falso —
   * a taxa vai nula com o motivo, e os dois números medidos continuam indo.
   */
  const a = r.adherence7;
  return {
    rotina: r.name,
    tipo: ROUTINE_TYPE_LABELS[r.type as keyof typeof ROUTINE_TYPE_LABELS],
    ativa: r.is_active,
    agendada_hoje: r.scheduledToday,
    concluida_hoje: r.todayLog?.is_done ?? false,
    itens: r.items?.length ?? 0,
    sequencia_atual: r.streak,
    ultimos_7_dias: {
      agendados: a.scheduled,
      concluidos: a.done,
      taxa_percentual: a.scheduled === 0 ? null : Math.round(a.rate * 100),
      ...(a.scheduled === 0
        ? {
            taxa_indisponivel_porque:
              "Nenhum dia agendado nesta janela — não há denominador para uma taxa. Isso não é 0% de conclusão.",
          }
        : {}),
    },
  };
}

export async function getRoutinesToday(): Promise<ToolOutput> {
  const hoje = hojeISO();
  const rotinas = await getRoutinesWithToday(hoje);
  const ativas = rotinas.filter((r) => r.is_active);

  if (ativas.length === 0) {
    return emptyToolOutput(
      rotinas.length === 0
        ? "Ainda não há rotina cadastrada."
        : `Não há rotina ativa — as ${rotinas.length} existentes estão desativadas.`,
    );
  }

  const doDia = ativas.filter((r) => r.scheduledToday);
  const feitas = doDia.filter((r) => r.todayLog?.is_done === true);

  return {
    periodo: { de: hoje, ate: hoje },
    contagem: ativas.length,
    completude: "exato",
    agregados: {
      ativas: ativas.length,
      agendadas_hoje: doDia.length,
      concluidas_hoje: feitas.length,
      // Como nos Hábitos: o dia está em andamento. "Pendente" nunca é "perdida".
      pendentes_hoje: doDia.length - feitas.length,
      nao_agendadas_hoje: ativas.length - doDia.length,
    },
    itens: ativas.map(itemDaRotina),
    refs: [REF_DAS_ROTINAS],
  };
}
