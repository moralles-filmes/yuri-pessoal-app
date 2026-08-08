import "server-only";

/**
 * Fase 18-C · Bloco 4 — IA · A METADE QUE SÓ LÊ dos commands do TO-DO.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ POR QUE OS COMMANDS SÃO PARTIDOS EM DOIS ARQUIVOS.                                    ║
 * ║                                                                                       ║
 * ║ O Bloco 3 fechou uma trava FÍSICA: nada dentro do run alcança `approval/execute.ts`.  ║
 * ║ O Bloco 4 quase a desfez sem querer — porque quem PROPÕE roda dentro do run, e a       ║
 * ║ proposta precisa de `parse` e `prever`. Importar o objeto `Command` inteiro no Tool    ║
 * ║ Executor faria o laço passar a SEGURAR `executar` na mão. Nada o chamaria; a garantia  ║
 * ║ deixaria de ser "não alcança" e viraria "não chama", que é outra coisa e se esquece.   ║
 * ║                                                                                       ║
 * ║   este arquivo       → schemas + `prever`. Importa `todo/queries` (LEITURA) e mais nada.║
 * ║   `commands/todo.ts` → junta com `todo/services` (ESCRITA) e monta o `Command`.        ║
 * ║                                                                                       ║
 * ║ Resultado: a partir de `tools/`, NÃO EXISTE caminho de import até uma função que       ║
 * ║ escreve. Há teste de fronteira para os dois lados.                                     ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * ⚠️ `prever` é UMA implementação, usada nas DUAS pontas: ao propor, para o dono ler; e ao
 * executar, para descobrir se o mundo mudou. É o que torna a revalidação por hash honesta.
 */

import { z } from "zod";
import { todoQuickTaskSchema } from "@/lib/validators/todo";
import { getTodoProjects, getTodoTasks } from "@/lib/todo/queries";
import { TODO_PRIORITY_LABELS } from "@/lib/todo/constants";
import { effectiveStatus, isClosed } from "@/lib/todo/status";
// Pura, e a MESMA que a conclusão usa: a previsão da próxima ocorrência não pode ser uma
// segunda conta, senão o cartão prometeria uma data e o serviço gravaria outra.
import { materializeNext } from "@/lib/todo/recurrence";
import { formatDate, hojeISO } from "@/lib/format";
import {
  EfeitoImpossivel,
  type EfeitoProposto,
  type PrevisaoDoEfeito,
} from "../contracts";

/* ══════════════════════════════════════════════════════════════════════════════════════
   Entrada — o schema que vale nas DUAS pontas
   ══════════════════════════════════════════════════════════════════════════════════════ */

/**
 * ⚠️ ESTE SCHEMA É MENOR QUE O DO FORMULÁRIO, E É DE PROPÓSITO.
 *
 * `todoQuickTaskSchema` aceita `project_id`, `section_id`, `parent_task_id`, `label_ids` e uma
 * regra de recorrência inteira. Nada disso entra aqui: o modelo não tem como escolher um uuid
 * com honestidade (ele inventaria), e recorrência muda o significado de concluir a tarefa para
 * sempre — não é coisa de se propor a partir de uma frase. O que o schema aceita é o que a
 * previsão consegue mostrar por inteiro ao dono, numa tela que cabe na conversa.
 *
 * `projeto` é NOME, não id. Quem resolve nome → id é `prever`, com uma consulta, e o projeto
 * resolvido entra no hash: o mesmo pedido apontando para outro projeto é outra proposta.
 *
 * ⛔ `user_id` não existe aqui, e `.strict()` recusa campo a mais — inclusive um `user_id` que
 * o modelo resolvesse mandar.
 */
export const criarTarefaEntrada = z
  .object({
    titulo: z.string().trim().min(1).max(300),
    data: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Data no formato AAAA-MM-DD")
      .nullable()
      .optional(),
    horario: z
      .string()
      .regex(/^\d{2}:\d{2}$/, "Horário no formato HH:MM")
      .nullable()
      .optional(),
    prazo: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Data no formato AAAA-MM-DD")
      .nullable()
      .optional(),
    prioridade: z.number().int().min(1).max(4).nullable().optional(),
    projeto: z.string().trim().min(1).max(120).nullable().optional(),
  })
  .strict();

export type CriarTarefaEntrada = z.infer<typeof criarTarefaEntrada>;

export const excluirTarefaEntrada = z.object({ tarefa_id: z.uuid() }).strict();
export type ExcluirTarefaEntrada = z.infer<typeof excluirTarefaEntrada>;

export const reagendarTarefaEntrada = z
  .object({
    tarefa_id: z.uuid(),
    data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data no formato AAAA-MM-DD"),
  })
  .strict();
export type ReagendarTarefaEntrada = z.infer<typeof reagendarTarefaEntrada>;

/** O `parse` de um command, na forma que o contrato pede. */
export function parseCom<T extends z.ZodType>(schema: T) {
  return (payload: unknown): { ok: true; valor: unknown } | { ok: false } => {
    const r = schema.safeParse(payload);
    return r.success ? { ok: true, valor: r.data } : { ok: false };
  };
}

/* ══════════════════════════════════════════════════════════════════════════════════════
   Resolução de entidades
   ══════════════════════════════════════════════════════════════════════════════════════ */

export const rotaDaTarefa = (id: string) => `/todo?v=todas&task=${id}`;

/**
 * Resolve o projeto pelo NOME. `null` quando o pedido não mencionou projeto nenhum.
 *
 * ⚠️ Nome que não casa com nada NÃO vira "sem projeto" em silêncio — o dono pediu uma coisa e
 * receberia outra, e a previsão não diria isso. Vira `EfeitoImpossivel`, com o motivo, e a
 * tela mostra o motivo no lugar do botão de confirmar.
 *
 * A comparação é a do módulo (`toLowerCase`, sem tirar acento), pelo mesmo motivo da busca de
 * tarefas: normalizar aqui daria à IA um resultado que a tela do usuário não dá.
 */
export async function resolverProjeto(
  nome: string | null | undefined,
  hoje: string,
): Promise<{ id: string; nome: string } | null> {
  if (!nome) return null;

  const projetos = await getTodoProjects(hoje);
  const alvo = nome.toLowerCase();
  const exatos = projetos.filter((p) => p.name.toLowerCase() === alvo);
  const candidatos =
    exatos.length > 0 ? exatos : projetos.filter((p) => p.name.toLowerCase().includes(alvo));

  if (candidatos.length === 0) {
    throw new EfeitoImpossivel(
      `Não há projeto chamado "${nome}" no TO-DO. A tarefa não foi preparada: crie o projeto primeiro, ou peça a tarefa sem projeto.`,
    );
  }
  // Ambiguidade é do dono para resolver, nunca do sistema para sortear.
  if (candidatos.length > 1) {
    throw new EfeitoImpossivel(
      `"${nome}" casa com ${candidatos.length} projetos do TO-DO (${candidatos
        .map((p) => p.name)
        .join(", ")}). Diga qual deles.`,
    );
  }
  return { id: candidatos[0].id, nome: candidatos[0].name };
}

/** Carrega a tarefa que a ação vai alterar, ou explica por que não dá. */
export async function carregarTarefa(taskId: string, hoje: string) {
  const tarefas = await getTodoTasks();
  const t = tarefas.find((x) => x.id === taskId);
  if (!t) {
    throw new EfeitoImpossivel("A tarefa não existe mais (ou não é sua). Nada foi alterado.");
  }
  return { tarefa: t, situacao: effectiveStatus(t, hoje), fechada: isClosed(t) };
}

/** A data como o dono a lê. Ausência vira frase, nunca um traço mudo. */
export const dataLegivel = (iso: string | null | undefined) =>
  iso ? formatDate(iso) : "sem data";

/* ══════════════════════════════════════════════════════════════════════════════════════
   1 · criarTarefaTodo
   ══════════════════════════════════════════════════════════════════════════════════════ */

/**
 * Traduz a entrada da IA para o schema do FORMULÁRIO. É o ponto exato em que os dois caminhos
 * convergem: daqui para baixo, `criarTarefaNoTodo` recebe o mesmo objeto que receberia vindo
 * do campo "Adicionar tarefa".
 *
 * `todoQuickTaskSchema.parse` roda aqui de propósito — ele é quem aplica as transformações
 * (prioridade padrão 4, `label_ids: []`, recorrência `null`) e as validações cruzadas (prazo
 * anterior à data programada). Traduzir sem revalidar seria pular o que o formulário sofre.
 */
export function paraOSchemaDoFormulario(d: CriarTarefaEntrada, projectId: string | null) {
  return todoQuickTaskSchema.parse({
    title: d.titulo,
    project_id: projectId,
    section_id: null,
    parent_task_id: null,
    scheduled_date: d.data ?? null,
    scheduled_time: d.horario ?? null,
    deadline_at: d.prazo ?? null,
    priority: d.prioridade ?? undefined,
    label_ids: [],
    recurrence: null,
  });
}

function previsaoDeCriar(
  d: CriarTarefaEntrada,
  projeto: { id: string; nome: string } | null,
): PrevisaoDoEfeito {
  const linhas: { rotulo: string; valor: string }[] = [
    { rotulo: "Título", valor: d.titulo },
    { rotulo: "Projeto", valor: projeto ? projeto.nome : "Caixa de entrada" },
    { rotulo: "Data programada", valor: dataLegivel(d.data) },
  ];
  if (d.horario) linhas.push({ rotulo: "Horário", valor: d.horario });
  if (d.prazo) linhas.push({ rotulo: "Prazo final", valor: dataLegivel(d.prazo) });
  linhas.push({
    rotulo: "Prioridade",
    valor: TODO_PRIORITY_LABELS[(d.prioridade ?? 4) as 1 | 2 | 3 | 4],
  });

  // O dono precisa saber o que a ferramenta NÃO faz — senão ele lê "criar tarefa" e supõe que
  // a etiqueta e a repetição que mencionou na frase entraram junto.
  const ressalvas = [
    "A tarefa é criada sem etiquetas, sem subtarefas e sem recorrência — esses campos só pelo TO-DO.",
  ];
  if (!d.data && !d.prazo) {
    ressalvas.push("Sem data, ela vai para a Caixa de entrada e não aparece na agenda do dia.");
  }

  return {
    resumo: `Criar a tarefa "${d.titulo}"${projeto ? ` no projeto ${projeto.nome}` : ""}.`,
    linhas,
    ressalvas,
  };
}

export async function preverCriarTarefa(payload: unknown): Promise<EfeitoProposto> {
  const d = payload as CriarTarefaEntrada;
  const projeto = await resolverProjeto(d.projeto, hojeISO());
  // A validação do formulário roda AQUI, na previsão — para o erro aparecer antes de o dono
  // confirmar, e não depois.
  paraOSchemaDoFormulario(d, projeto?.id ?? null);

  return {
    command: "criarTarefaTodo",
    payload: { ...d },
    // Criar não tem alvo; o projeto RESOLVIDO é a entidade, e é ele que amarra o hash.
    entidades: projeto
      ? [{ tipo: "projeto_todo", id: projeto.id, rota: `/todo?v=projeto&id=${projeto.id}` }]
      : [],
    previsao: previsaoDeCriar(d, projeto),
  };
}

/* ══════════════════════════════════════════════════════════════════════════════════════
   2 · excluirTarefaTodo — o desfazer da criação (§3.7)
   ══════════════════════════════════════════════════════════════════════════════════════ */

export async function preverExcluirTarefa(payload: unknown): Promise<EfeitoProposto> {
  const { tarefa_id } = payload as ExcluirTarefaEntrada;
  const { tarefa } = await carregarTarefa(tarefa_id, hojeISO());

  return {
    command: "excluirTarefaTodo",
    payload: { tarefa_id },
    entidades: [{ tipo: "tarefa_todo", id: tarefa.id, rota: rotaDaTarefa(tarefa.id) }],
    previsao: {
      resumo: `Excluir a tarefa "${tarefa.title}".`,
      linhas: [
        { rotulo: "Título", valor: tarefa.title },
        { rotulo: "Data programada", valor: dataLegivel(tarefa.scheduledDate) },
      ],
      ressalvas: [
        "A exclusão é definitiva: comentários, etiquetas e histórico da tarefa vão junto.",
        ...(tarefa.subtaskCount > 0
          ? [`A tarefa tem ${tarefa.subtaskCount} subtarefa(s), que também serão excluídas.`]
          : []),
      ],
    },
  };
}

/* ══════════════════════════════════════════════════════════════════════════════════════
   3 · concluirTarefaTodo · e o desfazer dele
   ══════════════════════════════════════════════════════════════════════════════════════ */

export const concluirTarefaEntrada = z.object({ tarefa_id: z.uuid() }).strict();
export type ConcluirTarefaEntrada = z.infer<typeof concluirTarefaEntrada>;

export async function preverConcluirTarefa(payload: unknown): Promise<EfeitoProposto> {
  const { tarefa_id } = payload as ConcluirTarefaEntrada;
  const hoje = hojeISO();
  const { tarefa, fechada } = await carregarTarefa(tarefa_id, hoje);

  if (fechada) {
    throw new EfeitoImpossivel(
      "Esta tarefa já está concluída (ou cancelada). Nada seria alterado.",
    );
  }

  const linhas = [
    { rotulo: "Tarefa", valor: tarefa.title },
    { rotulo: "Ocorrência concluída", valor: dataLegivel(tarefa.scheduledDate ?? hoje) },
  ];
  const ressalvas: string[] = [];

  /**
   * ⛔ A RESSALVA QUE MUDA O SIGNIFICADO DE "CONCLUIR", E POR ISSO ENTRA NA PREVISÃO.
   *
   * Numa tarefa recorrente, concluir NÃO fecha a tarefa: ela avança a própria linha para a
   * próxima data (invariante do TO-DO desde a Fase 15). Quem confirma sem saber disso pensa
   * que está riscando um item da lista e está, na verdade, marcando presença numa série.
   *
   * A data é calculada aqui pela MESMA função pura que a conclusão usa (`materializeNext`),
   * e por isso ela é confiável — e entra no hash: se a regra da série mudar entre propor e
   * confirmar, a próxima data muda e a confirmação é recusada.
   */
  if (tarefa.recurrence && !tarefa.recurrence.isPaused) {
    const proxima = materializeNext(
      tarefa.recurrence,
      { scheduledDate: tarefa.scheduledDate, deadlineAt: tarefa.deadlineAt },
      hoje,
    );
    if (proxima?.scheduledDate) {
      linhas.push({ rotulo: "Próxima ocorrência", valor: dataLegivel(proxima.scheduledDate) });
      ressalvas.push(
        "A tarefa é recorrente: ela não é fechada, ela AVANÇA para a próxima data acima.",
      );
    } else {
      ressalvas.push(
        "A tarefa é recorrente e esta é a última ocorrência da série: ela será fechada de vez.",
      );
    }
  }

  if (tarefa.subtaskCount > tarefa.subtaskDoneCount) {
    // Concluir NÃO cascateia por aqui: o serviço só cascateia com `cascade`, e a ferramenta
    // não o liga. Dizer isso é mais honesto que deixar o dono descobrir depois.
    ressalvas.push(
      `Há ${tarefa.subtaskCount - tarefa.subtaskDoneCount} subtarefa(s) em aberto, e elas NÃO serão concluídas junto.`,
    );
  }

  return {
    command: "concluirTarefaTodo",
    payload: { tarefa_id },
    entidades: [{ tipo: "tarefa_todo", id: tarefa.id, rota: rotaDaTarefa(tarefa.id) }],
    previsao: { resumo: `Concluir "${tarefa.title}".`, linhas, ressalvas },
  };
}

export const reabrirTarefaEntrada = z.object({ tarefa_id: z.uuid() }).strict();
export type ReabrirTarefaEntrada = z.infer<typeof reabrirTarefaEntrada>;

export async function preverReabrirTarefa(payload: unknown): Promise<EfeitoProposto> {
  const { tarefa_id } = payload as ReabrirTarefaEntrada;
  const { tarefa } = await carregarTarefa(tarefa_id, hojeISO());

  return {
    command: "reabrirTarefaTodo",
    payload: { tarefa_id },
    entidades: [{ tipo: "tarefa_todo", id: tarefa.id, rota: rotaDaTarefa(tarefa.id) }],
    previsao: {
      resumo: `Reabrir "${tarefa.title}".`,
      linhas: [{ rotulo: "Tarefa", valor: tarefa.title }],
      ressalvas: tarefa.recurrence
        ? [
            "A tarefa é recorrente: reabrir remove a última conclusão e devolve a data daquela ocorrência — o estado volta exatamente ao de antes.",
          ]
        : [],
    },
  };
}

/* ══════════════════════════════════════════════════════════════════════════════════════
   4 · reagendarTarefaTodo
   ══════════════════════════════════════════════════════════════════════════════════════ */

export async function preverReagendarTarefa(payload: unknown): Promise<EfeitoProposto> {
  const d = payload as ReagendarTarefaEntrada;
  const { tarefa, fechada } = await carregarTarefa(d.tarefa_id, hojeISO());

  if (fechada) {
    throw new EfeitoImpossivel(
      "A tarefa já está concluída ou cancelada — reagendar não faria nada. Reabra pelo TO-DO primeiro.",
    );
  }

  const ressalvas: string[] = [];
  if (tarefa.recurrence !== null) {
    ressalvas.push(
      "A tarefa é recorrente: só esta ocorrência muda de data. A regra de repetição continua igual.",
    );
  }
  if (tarefa.deadlineAt && d.data > tarefa.deadlineAt) {
    ressalvas.push(
      `A nova data é POSTERIOR ao prazo final (${dataLegivel(tarefa.deadlineAt)}). O prazo não é alterado, e a tarefa passa a nascer atrasada.`,
    );
  }

  return {
    command: "reagendarTarefaTodo",
    payload: { ...d },
    entidades: [{ tipo: "tarefa_todo", id: tarefa.id, rota: rotaDaTarefa(tarefa.id) }],
    previsao: {
      resumo: `Reagendar "${tarefa.title}" para ${dataLegivel(d.data)}.`,
      linhas: [
        { rotulo: "Tarefa", valor: tarefa.title },
        // A data ATUAL entra na previsão, e por isso entra no hash: se a tarefa for movida
        // entre propor e confirmar, o recálculo diverge e a confirmação é recusada. É o
        // caso que dá nome à §3.4 — a proposta é imutável, quem muda é o mundo.
        { rotulo: "Data atual", valor: dataLegivel(tarefa.scheduledDate) },
        { rotulo: "Nova data", valor: dataLegivel(d.data) },
      ],
      ressalvas,
    },
  };
}
