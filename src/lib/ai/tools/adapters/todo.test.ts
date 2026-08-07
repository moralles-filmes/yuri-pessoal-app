/**
 * Fase 18-C — IA · O que a ferramenta do TO-DO relata bate com o que a tela mostra.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ AS CONTAGENS ESPERADAS SÃO LITERAIS, DERIVADAS À MÃO DA FIXTURE NO COMENTÁRIO.        ║
 * ║                                                                                       ║
 * ║ Chamar `isOverdue` dentro do teste e comparar com a saída do adapter não julgaria     ║
 * ║ nada: seriam as duas a mesma conta. A fixture tem 7 tarefas de propósito — se o total ║
 * ║ não couber na cabeça, ela está grande demais.                                          ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * `hojeISO` é FIXADO aqui. O adapter injeta "hoje" nas funções puras de status, e um teste
 * que dependesse do dia real falharia sozinho amanhã — e daria resultado diferente em
 * `TZ=UTC`, que a suíte precisa atravessar.
 */

import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TodoProject, TodoTask } from "@/lib/todo/types";

const HOJE = "2026-08-07";

let tarefasFalsas: TodoTask[] = [];
let projetosFalsos: TodoProject[] = [];

vi.mock("@/lib/format", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/format")>()),
  hojeISO: () => HOJE,
}));

vi.mock("@/lib/todo/queries", () => ({
  getTodoTasks: async () => tarefasFalsas,
  getTodoProjects: async () => projetosFalsos,
}));

const { getAgenda, searchTasks, getProjects } = await import("./todo");

/* ═══════════════════════════ Fixtures mínimas ═══════════════════════════ */

function tarefa(over: Partial<TodoTask> & { id: string; title: string }): TodoTask {
  return {
    projectId: null,
    sectionId: null,
    parentTaskId: null,
    description: null,
    status: "pendente",
    priority: 4,
    scheduledDate: null,
    scheduledTime: null,
    durationMinutes: null,
    deadlineAt: null,
    isAllDay: true,
    position: 0,
    seriesId: null,
    completedAt: null,
    cancelledAt: null,
    archivedAt: null,
    source: "manual",
    externalReference: null,
    createdAt: "2026-08-01T12:00:00.000Z",
    updatedAt: "2026-08-01T12:00:00.000Z",
    labels: [],
    recurrence: null,
    subtaskCount: 0,
    subtaskDoneCount: 0,
    commentCount: 0,
    attachmentCount: 0,
    reminderCount: 0,
    ...over,
  } as TodoTask;
}

/**
 * FIXTURE — "hoje" é 2026-08-07.
 *
 *  T1  05/08 programada, pendente          → ATRASADA
 *  T2  07/08 programada, pendente          → HOJE
 *  T3  09/08 programada, pendente          → PRÓXIMA (2 dias)
 *  T4  30/08 programada, pendente          → fora da janela de 7 dias
 *  T5  sem data, pendente                  → SEM DATA
 *  T6  01/08 programada, CONCLUÍDA         → fechada, não entra em nada
 *  T7  prazo 06/08, sem data programada    → ATRASADA (pelo prazo)
 *
 *  abertas = 6 (T1 T2 T3 T4 T5 T7) · atrasadas = 2 · hoje = 1 · próximas(7) = 1 · sem data = 1
 *  relevantes na lista = 2 + 1 + 1 = 4
 */
const FIXTURE: TodoTask[] = [
  tarefa({ id: "t1", title: "Pagar boleto", scheduledDate: "2026-08-05", projectId: "p1" }),
  tarefa({ id: "t2", title: "Reunião de equipe", scheduledDate: HOJE, priority: 1 }),
  tarefa({ id: "t3", title: "Revisar contrato", scheduledDate: "2026-08-09" }),
  tarefa({ id: "t4", title: "Planejar viagem", scheduledDate: "2026-08-30" }),
  tarefa({ id: "t5", title: "Ideia solta" }),
  tarefa({
    id: "t6",
    title: "Já feita",
    scheduledDate: "2026-08-01",
    status: "concluida",
    completedAt: "2026-08-01T15:00:00.000Z",
  }),
  tarefa({ id: "t7", title: "Entregar relatório", deadlineAt: "2026-08-06" }),
];

const PROJETOS: TodoProject[] = [
  {
    id: "p1",
    parentProjectId: null,
    name: "Casa",
    description: null,
    icon: null,
    color: "azul",
    isFavorite: true,
    defaultView: "lista",
    status: "ativo",
    position: 0,
    archivedAt: null,
    sections: [],
    totalTasks: 3,
    openTasks: 2,
    completedTasks: 1,
    overdueTasks: 1,
  },
  {
    id: "p2",
    parentProjectId: null,
    name: "Antigo",
    description: null,
    icon: null,
    color: "grafite",
    isFavorite: false,
    defaultView: "lista",
    status: "arquivado",
    position: 1,
    archivedAt: "2026-07-01T00:00:00.000Z",
    sections: [],
    totalTasks: 5,
    openTasks: 0,
    completedTasks: 5,
    overdueTasks: 0,
  },
];

beforeEach(() => {
  tarefasFalsas = [...FIXTURE];
  projetosFalsos = [...PROJETOS];
});

/* ═══════════════════════════════ Testes ═══════════════════════════════ */

describe("todo.get_agenda", () => {
  it("conta atrasadas, hoje, próximas e sem data com os números da fixture", async () => {
    const saida = await getAgenda({});

    expect(saida.agregados).toMatchObject({
      atrasadas: 2,
      para_hoje: 1,
      proximos_dias: 7,
      nos_proximos_dias: 1,
      abertas_no_total: 6,
      sem_data: 1,
    });
    expect(saida.contagem).toBe(4);
    expect(saida.itens).toHaveLength(4);
  });

  /**
   * ⚠️ O TESTE CENTRAL DESTA FERRAMENTA.
   *
   * `t1.status` é `"pendente"` no banco — `atrasada` NUNCA é gravado. Se o adapter relatasse
   * o status cru, a IA diria "nenhuma tarefa atrasada" com duas vencidas na tela.
   */
  it("relata o status DERIVADO, não o gravado", async () => {
    const saida = await getAgenda({});
    const t1 = saida.itens.find(
      (i) => (i as { titulo: string }).titulo === "Pagar boleto",
    ) as { status: string };

    expect(FIXTURE[0].status).toBe("pendente");
    expect(t1.status).toBe("Atrasada");
  });

  it("a janela pedida muda o que entra em próximas, e o total de abertas não", async () => {
    // 30/08 está a 23 dias de 07/08 — entra com `dias: 30`, não com o padrão de 7.
    const saida = await getAgenda({ dias: 30 });

    expect(saida.agregados).toMatchObject({
      proximos_dias: 30,
      nos_proximos_dias: 2,
      abertas_no_total: 6,
    });
    expect(saida.contagem).toBe(5);
  });

  it("ordena por data e, no mesmo dia, pela prioridade mais alta", async () => {
    const saida = await getAgenda({});
    const datas = saida.itens.map((i) => (i as { data_programada: string | null }).data_programada);
    // t7 (prazo 06/08, sem data programada) vem antes de t2 (07/08): a ordenação usa a data
    // relevante, que para t7 é o prazo.
    expect(datas).toEqual(["2026-08-05", null, HOJE, "2026-08-09"]);
  });

  it("tarefa fechada não entra em nenhum total", async () => {
    const saida = await getAgenda({});
    const titulos = saida.itens.map((i) => (i as { titulo: string }).titulo);
    expect(titulos).not.toContain("Já feita");
  });

  it("agenda vazia diz quantas abertas existem — não finge que não há nada", async () => {
    tarefasFalsas = [tarefa({ id: "x", title: "Sem data nenhuma" })];
    const saida = await getAgenda({});

    expect(saida.contagem).toBe(0);
    expect(saida.agregados).toMatchObject({ abertas_no_total: 1, sem_data: 1 });
    expect(saida.observacao).toContain("1 tarefa(s) aberta(s)");
  });

  it("as refs apontam para o deep-link do módulo", async () => {
    const saida = await getAgenda({});
    expect(saida.refs[0]).toEqual({
      tipo: "tarefa_todo",
      id: "t1",
      rota: "/todo?v=todas&task=t1",
    });
  });
});

describe("o teto da consulta não mente em silêncio", () => {
  it("saturar o teto marca o total como parcial, com o motivo", async () => {
    tarefasFalsas = Array.from({ length: 5000 }, (_, i) =>
      tarefa({ id: `g${i}`, title: `Tarefa ${i}`, scheduledDate: HOJE }),
    );

    const saida = await getAgenda({});
    expect(saida.completude).toBe("parcial");
    expect(saida.motivo_incompleto).toContain("5000");
  });

  it("abaixo do teto o total é exato", async () => {
    const saida = await getAgenda({});
    expect(saida.completude).toBe("exato");
    expect(saida.motivo_incompleto).toBeUndefined();
  });

  /**
   * ⚠️ O COMPILADOR NUNCA VÊ ISTO. `TASK_LIMIT` é constante PRIVADA de `todo/queries.ts`, e o
   * adapter repete o valor por não ter como importá-lo. Sem este teste, alguém sobe o teto lá
   * e o adapter passa a considerar "exato" um resultado que a consulta cortou — que é
   * exatamente a mentira que a fase existe para impedir.
   */
  it("o teto repetido no adapter é o mesmo TASK_LIMIT da query", () => {
    const RAIZ = path.resolve(__dirname, "..", "..", "..", "..", "..");
    const queries = fs.readFileSync(
      path.join(RAIZ, "src", "lib", "todo", "queries.ts"),
      "utf8",
    );
    const adapter = fs.readFileSync(path.join(__dirname, "todo.ts"), "utf8");

    const naQuery = queries.match(/const TASK_LIMIT = (\d+)/)?.[1];
    const noAdapter = adapter.match(/const TETO_TAREFAS_DA_CONSULTA = (\d+)/)?.[1];

    expect(naQuery, "TASK_LIMIT sumiu de todo/queries.ts").toBeDefined();
    expect(noAdapter, "TETO_TAREFAS_DA_CONSULTA sumiu do adapter").toBeDefined();
    expect(noAdapter).toBe(naQuery);
  });
});

describe("todo.search_tasks", () => {
  it("acha pelo título e devolve a contagem do que achou", async () => {
    const saida = await searchTasks({ texto: "contrato" });
    expect(saida.contagem).toBe(1);
    expect((saida.itens[0] as { titulo: string }).titulo).toBe("Revisar contrato");
  });

  /**
   * A busca do módulo compara com `toLowerCase()` e NÃO remove acento. O adapter reusa
   * `filterTasks` de propósito: normalizar por fora faria a IA achar o que a tela não acha.
   * Se este teste um dia falhar, é porque `todo/filters.ts` mudou — e aí a tela mudou junto,
   * que é o comportamento correto.
   */
  it("diferencia acento, como a busca da tela — e o texto do vazio explica isso", async () => {
    const semAcento = await searchTasks({ texto: "reuniao" });
    expect(semAcento.contagem).toBe(0);
    expect(semAcento.observacao).toContain("acentos");

    const comAcento = await searchTasks({ texto: "reunião" });
    expect(comAcento.contagem).toBe(1);
  });

  it("concluídas ficam de fora por padrão e entram quando pedido", async () => {
    expect((await searchTasks({ texto: "feita" })).contagem).toBe(0);
    expect(
      (await searchTasks({ texto: "feita", incluir_concluidas: true })).contagem,
    ).toBe(1);
  });
});

describe("todo.get_projects", () => {
  it("lista só os ativos e soma as contagens deles", async () => {
    const saida = await getProjects();

    expect(saida.contagem).toBe(1);
    expect(saida.agregados).toMatchObject({
      projetos_ativos: 1,
      projetos_arquivados: 1,
      // Só do projeto ativo: o arquivado não entra na soma.
      tarefas_abertas: 2,
      tarefas_atrasadas: 1,
    });
  });

  it("sem projeto ativo, diz que os existentes estão arquivados", async () => {
    projetosFalsos = [PROJETOS[1]];
    const saida = await getProjects();
    expect(saida.contagem).toBe(0);
    expect(saida.observacao).toContain("arquivados");
  });
});
