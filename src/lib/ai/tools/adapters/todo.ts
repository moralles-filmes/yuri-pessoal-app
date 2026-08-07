import "server-only";

/**
 * Fase 18-C — IA · As três ferramentas do TO-DO. CASCAS FINAS.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ NENHUM `.from()` E NENHUM `select()` NESTE ARQUIVO.                                   ║
 * ║ Tudo sai de `todo/queries.ts`, `todo/status.ts` e `todo/filters.ts` — os MESMOS que a ║
 * ║ tela usa. Uma segunda leitura discordaria da primeira no primeiro campo novo, e o     ║
 * ║ número que a IA relata deixaria de bater com o número que o usuário vê.               ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ `atrasada` É DERIVADO NA LEITURA, E ESTA CAMADA NÃO PODE ESQUECER DISSO.              ║
 * ║                                                                                       ║
 * ║ A invariante do módulo é que `atrasada` NUNCA é gravado: `todo_tasks.status` guarda   ║
 * ║ `pendente` numa tarefa cuja data já passou. Relatar `status` cru faria a IA dizer     ║
 * ║ "você tem 0 tarefas atrasadas" com doze vencidas na tela. Por isso todo status que    ║
 * ║ sai daqui passa por `effectiveStatus(task, hoje)`, com `hoje` INJETADO pelo servidor. ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * `user_id` não aparece em lugar nenhum: as queries rodam sob RLS, com a sessão do usuário.
 */

import { z } from "zod";
import { getTodoProjects, getTodoTasks } from "@/lib/todo/queries";
import { filterTasks } from "@/lib/todo/filters";
import {
  daysBetween,
  effectiveStatus,
  hasNoDate,
  isClosed,
  isDueToday,
  isOverdue,
  isUpcoming,
} from "@/lib/todo/status";
import {
  TODO_EFFECTIVE_STATUS_LABELS,
  TODO_PRIORITY_LABELS,
} from "@/lib/todo/constants";
import type { TodoTask } from "@/lib/todo/types";
import { hojeISO } from "@/lib/format";
import { emptyToolOutput, type ToolOutput, type ToolRef } from "../contracts";

/** ⚠️ `.strict()` em todos: campo a mais é erro, e é por aqui que `user_id` seria barrado. */
export const getAgendaInput = z
  .object({
    dias: z.number().int().min(1).max(90).optional(),
  })
  .strict();

export const searchTasksInput = z
  .object({
    texto: z.string().trim().min(1).max(120).optional(),
    incluir_concluidas: z.boolean().optional(),
  })
  .strict();

export const getProjectsInput = z.object({}).strict();

const JANELA_PADRAO_DIAS = 7;

/**
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ O TETO DE LINHAS DA CONSULTA PRECISA SER VISÍVEL AQUI — SENÃO ELE MENTE EM SILÊNCIO.  ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * `getTodoTasks` corta em `TASK_LIMIT = 5000` (constante PRIVADA de `todo/queries.ts`, e a
 * função **não aceita `limit`**). Diferente de `getSessionHistory`, aqui não há como pedir
 * "teto + 1" para provar saturação: o único sinal disponível é o retorno ter exatamente o
 * tamanho do teto.
 *
 * Então é isso que usamos, e a consequência é declarada: com exatamente 5000 tarefas o
 * resultado é marcado como **parcial** mesmo que a consulta não tenha cortado nada. Errar
 * para o lado de "pode faltar coisa" é o único erro aceitável aqui — o inverso é apresentar
 * um total incompleto como completo, que é o que esta fase existe para impedir.
 *
 * O valor está repetido de propósito, e não importado: `TASK_LIMIT` não é exportado. O teste
 * amarra os dois lendo o arquivo de origem.
 */
const TETO_TAREFAS_DA_CONSULTA = 5000;

const refDaTarefa = (id: string): ToolRef => ({
  tipo: "tarefa_todo",
  id,
  // O MESMO formato que a busca global usa (`search/queries.ts`): uma segunda convenção de
  // deep-link daria dois links diferentes para a mesma tarefa, e um deles envelheceria.
  rota: `/todo?v=todas&task=${id}`,
});

const refDoProjeto = (id: string): ToolRef => ({
  tipo: "projeto_todo",
  id,
  rota: `/todo?v=projeto&id=${id}`,
});

/**
 * A data que manda numa tarefa: a MAIS PRÓXIMA entre programada e prazo. É a mesma regra de
 * `isUpcoming` (`status.ts`) — se a tarefa é programada para amanhã mas o prazo vence hoje,
 * ela é de hoje. Reimplementar a escolha aqui com outra precedência faria a IA ordenar a
 * agenda de um jeito e a tela de outro.
 */
function dataRelevante(t: TodoTask): string | null {
  const datas = [t.scheduledDate, t.deadlineAt].filter((d): d is string => Boolean(d));
  if (datas.length === 0) return null;
  return datas.reduce((a, b) => (a < b ? a : b));
}

/** O item como o modelo o recebe. Campos escolhidos: o que responde pergunta, e só. */
function itemDaTarefa(
  t: TodoTask,
  hoje: string,
  nomeDoProjeto: (id: string | null) => string | null,
) {
  return {
    titulo: t.title,
    projeto: nomeDoProjeto(t.projectId),
    // Nunca `t.status` cru — ver o cabeçalho.
    status: TODO_EFFECTIVE_STATUS_LABELS[effectiveStatus(t, hoje)],
    prioridade: TODO_PRIORITY_LABELS[t.priority],
    data_programada: t.scheduledDate,
    horario: t.scheduledTime,
    prazo_final: t.deadlineAt,
    // "Recorrente" muda o significado de concluir — a resposta precisa poder dizer isso.
    recorrente: t.recurrence !== null,
    subtarefas: t.subtaskCount,
    subtarefas_concluidas: t.subtaskDoneCount,
  };
}

/**
 * O trio que viaja com todo total desta ferramenta quando a consulta pode ter saturado.
 * Fala do TOTAL, nunca da lista — a poda de lista é do executor e escreve noutro campo.
 */
function ressalvaDoTeto(quantidade: number): {
  completude: "exato" | "parcial";
  motivo_incompleto?: string;
} {
  if (quantidade < TETO_TAREFAS_DA_CONSULTA) return { completude: "exato" };
  return {
    completude: "parcial",
    motivo_incompleto: `A consulta de tarefas traz no máximo ${TETO_TAREFAS_DA_CONSULTA} registros e devolveu exatamente esse número: pode haver tarefa fora destes totais. Peça um recorte menor para um número que feche.`,
  };
}

async function lerTarefasEProjetos(hoje: string) {
  const [tarefas, projetos] = await Promise.all([
    getTodoTasks(),
    getTodoProjects(hoje),
  ]);
  const nomes = new Map(projetos.map((p) => [p.id, p.name]));
  return {
    tarefas,
    projetos,
    nomeDoProjeto: (id: string | null) => (id ? (nomes.get(id) ?? null) : null),
  };
}

export async function getAgenda(input: { dias?: number }): Promise<ToolOutput> {
  const dias = input.dias ?? JANELA_PADRAO_DIAS;
  const hoje = hojeISO();
  const { tarefas, nomeDoProjeto } = await lerTarefasEProjetos(hoje);

  const abertas = tarefas.filter((t) => !isClosed(t));

  const atrasadas = abertas.filter((t) => isOverdue(t, hoje));
  const deHoje = abertas.filter((t) => isDueToday(t, hoje));
  // "Próximas" é a janela pedida, contada a partir de amanhã. `isUpcoming` já garante que a
  // data mais próxima é posterior a hoje; `daysBetween` recorta a janela sem construir data
  // nova — aritmética em `Date.UTC`, como o resto do módulo.
  const proximas = abertas.filter((t) => {
    if (!isUpcoming(t, hoje)) return false;
    const data = dataRelevante(t);
    return data !== null && daysBetween(hoje, data) <= dias;
  });
  const semData = abertas.filter((t) => hasNoDate(t));

  const relevantes = [...atrasadas, ...deHoje, ...proximas].sort((a, b) => {
    const da = dataRelevante(a) ?? "";
    const db = dataRelevante(b) ?? "";
    if (da !== db) return da < db ? -1 : 1;
    // Prioridade 1 é a mais alta (`TODO_PRIORITY_LABELS`), então ordem crescente.
    return a.priority - b.priority;
  });

  if (relevantes.length === 0) {
    return {
      ...emptyToolOutput(
        `Nada atrasado, nada para hoje e nada nos próximos ${dias} dias. Há ${abertas.length} tarefa(s) aberta(s) no total, das quais ${semData.length} sem data definida.`,
      ),
      ...ressalvaDoTeto(tarefas.length),
      agregados: {
        atrasadas: 0,
        para_hoje: 0,
        proximos_dias: dias,
        nos_proximos_dias: 0,
        abertas_no_total: abertas.length,
        sem_data: semData.length,
      },
    };
  }

  return {
    periodo: null,
    contagem: relevantes.length,
    ...ressalvaDoTeto(tarefas.length),
    agregados: {
      atrasadas: atrasadas.length,
      para_hoje: deHoje.length,
      proximos_dias: dias,
      nos_proximos_dias: proximas.length,
      abertas_no_total: abertas.length,
      // Sem data NÃO é "sem importância": é o que a Caixa de entrada do módulo existe para
      // organizar, e some da agenda se não for contado aqui.
      sem_data: semData.length,
    },
    itens: relevantes.map((t) => itemDaTarefa(t, hoje, nomeDoProjeto)),
    refs: relevantes.map((t) => refDaTarefa(t.id)),
  };
}

export async function searchTasks(input: {
  texto?: string;
  incluir_concluidas?: boolean;
}): Promise<ToolOutput> {
  const hoje = hojeISO();
  const { tarefas, nomeDoProjeto } = await lerTarefasEProjetos(hoje);

  /**
   * ⚠️ O FILTRO É O DO MÓDULO, COM A BUSCA DO MÓDULO — inclusive as limitações dela.
   *
   * `matchesFilter` compara com `toLowerCase()` e **não remove acento**: "reuniao" não acha
   * "Reunião". Normalizar por fora daria à IA um resultado que a tela não dá — ela afirmaria
   * ter encontrado uma tarefa que o usuário não encontra digitando o mesmo texto. Quando isso
   * incomodar, o lugar de corrigir é `todo/filters.ts`, para os dois ao mesmo tempo.
   *
   * (Diferente do filtro de recordes da 18-B, onde `getPersonalRecords` não tem filtro próprio
   * e a normalização precisou nascer no adapter.)
   */
  const encontradas = filterTasks(
    tarefas,
    {
      search: input.texto ?? null,
      includeCompleted: input.incluir_concluidas === true,
      includeArchived: false,
    },
    hoje,
  );

  if (encontradas.length === 0) {
    return {
      ...emptyToolOutput(
        input.texto
          ? `Nenhuma tarefa ${input.incluir_concluidas ? "" : "aberta "}com "${input.texto}" no título ou na descrição. A busca do módulo diferencia acentos.`
          : "Nenhuma tarefa encontrada com esse recorte.",
      ),
      ...ressalvaDoTeto(tarefas.length),
    };
  }

  return {
    periodo: null,
    contagem: encontradas.length,
    ...ressalvaDoTeto(tarefas.length),
    agregados: {
      encontradas: encontradas.length,
      atrasadas: encontradas.filter((t) => isOverdue(t, hoje)).length,
      concluidas_incluidas: input.incluir_concluidas === true,
    },
    itens: encontradas.map((t) => itemDaTarefa(t, hoje, nomeDoProjeto)),
    refs: encontradas.map((t) => refDaTarefa(t.id)),
  };
}

export async function getProjects(): Promise<ToolOutput> {
  const hoje = hojeISO();
  const projetos = await getTodoProjects(hoje);
  const ativos = projetos.filter((p) => p.status === "ativo");

  if (ativos.length === 0) {
    return emptyToolOutput(
      projetos.length === 0
        ? "Ainda não há projeto criado no TO-DO."
        : `Não há projeto ativo — os ${projetos.length} existentes estão arquivados.`,
    );
  }

  return {
    periodo: null,
    contagem: ativos.length,
    // As contagens vêm da consulta enxuta de `getTodoProjects`, que não tem teto próprio.
    completude: "exato",
    agregados: {
      projetos_ativos: ativos.length,
      projetos_arquivados: projetos.length - ativos.length,
      tarefas_abertas: ativos.reduce((s, p) => s + p.openTasks, 0),
      tarefas_atrasadas: ativos.reduce((s, p) => s + p.overdueTasks, 0),
    },
    itens: ativos.map((p) => ({
      projeto: p.name,
      favorito: p.isFavorite,
      secoes: p.sections.length,
      tarefas_abertas: p.openTasks,
      tarefas_atrasadas: p.overdueTasks,
      tarefas_concluidas: p.completedTasks,
    })),
    refs: ativos.map((p) => refDoProjeto(p.id)),
  };
}
