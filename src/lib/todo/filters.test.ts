import { describe, expect, it } from "vitest";
import {
  buildTaskTree,
  countActiveFilters,
  filterTasks,
  groupTasks,
  isCompletedToday,
  isFilterActive,
  isInbox,
  isTodayBucket,
  matchesFilter,
  sortTasks,
  type TodoGroupLookups,
} from "./filters";
import type { TodoTask } from "./types";

const HOJE = "2026-07-28";

let seq = 0;
function task(patch: Partial<TodoTask> = {}): TodoTask {
  seq += 1;
  return {
    id: `t${seq}`,
    projectId: null,
    sectionId: null,
    parentTaskId: null,
    title: `Tarefa ${seq}`,
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
    createdAt: "2026-07-01T10:00:00.000Z",
    updatedAt: "2026-07-01T10:00:00.000Z",
    labels: [],
    recurrence: null,
    subtaskCount: 0,
    subtaskDoneCount: 0,
    commentCount: 0,
    attachmentCount: 0,
    reminderCount: 0,
    ...patch,
  };
}

const lookups: TodoGroupLookups = {
  projectName: (id) => (id ? `Projeto ${id}` : "Caixa de entrada"),
  projectColor: () => "gold",
  sectionName: (id) => (id ? `Seção ${id}` : "Sem seção"),
  dateLabel: (iso) => iso ?? "Sem data",
};

describe("matchesFilter — regras básicas", () => {
  it("filtro vazio aceita tarefas abertas", () => {
    expect(matchesFilter(task(), {}, HOJE)).toBe(true);
  });

  it("filtro vazio esconde tarefas fechadas", () => {
    expect(matchesFilter(task({ status: "concluida" }), {}, HOJE)).toBe(false);
    expect(matchesFilter(task({ status: "arquivada" }), {}, HOJE)).toBe(false);
  });

  it("includeCompleted traz as concluídas de volta", () => {
    expect(
      matchesFilter(task({ status: "concluida" }), { includeCompleted: true }, HOJE),
    ).toBe(true);
  });

  it("pedir um status fechado explicitamente já basta", () => {
    expect(
      matchesFilter(task({ status: "cancelada" }), { statuses: ["cancelada"] }, HOJE),
    ).toBe(true);
  });
});

describe("matchesFilter — busca textual", () => {
  it("procura no título e na descrição, sem diferenciar caixa", () => {
    const t = task({ title: "Pagar Internet", description: "Boleto do mês" });
    expect(matchesFilter(t, { search: "internet" }, HOJE)).toBe(true);
    expect(matchesFilter(t, { search: "BOLETO" }, HOJE)).toBe(true);
    expect(matchesFilter(t, { search: "academia" }, HOJE)).toBe(false);
  });

  it("busca só de espaços não filtra nada", () => {
    expect(matchesFilter(task(), { search: "   " }, HOJE)).toBe(true);
  });
});

describe("matchesFilter — listas são OR, campos são AND", () => {
  it("aceita qualquer projeto da lista", () => {
    const t = task({ projectId: "p2" });
    expect(matchesFilter(t, { projectIds: ["p1", "p2"] }, HOJE)).toBe(true);
    expect(matchesFilter(t, { projectIds: ["p1", "p3"] }, HOJE)).toBe(false);
  });

  it("exige que TODOS os campos passem", () => {
    const t = task({ projectId: "p1", priority: 1 });
    expect(matchesFilter(t, { projectIds: ["p1"], priorities: [1] }, HOJE)).toBe(true);
    expect(matchesFilter(t, { projectIds: ["p1"], priorities: [3] }, HOJE)).toBe(false);
  });

  it("aceita qualquer etiqueta da lista", () => {
    const t = task({ labels: [{ id: "l1", name: "casa", color: "gold" }] });
    expect(matchesFilter(t, { labelIds: ["l1", "l2"] }, HOJE)).toBe(true);
    expect(matchesFilter(t, { labelIds: ["l9"] }, HOJE)).toBe(false);
  });
});

describe("matchesFilter — intervalos de data", () => {
  it("filtra por data programada dentro do intervalo (inclusivo)", () => {
    const t = task({ scheduledDate: "2026-08-10" });
    expect(matchesFilter(t, { scheduledFrom: "2026-08-01", scheduledTo: "2026-08-31" }, HOJE)).toBe(
      true,
    );
    expect(matchesFilter(t, { scheduledFrom: "2026-08-10", scheduledTo: "2026-08-10" }, HOJE)).toBe(
      true,
    );
    expect(matchesFilter(t, { scheduledFrom: "2026-08-11" }, HOJE)).toBe(false);
  });

  it("tarefa sem data não passa quando há intervalo", () => {
    expect(matchesFilter(task(), { scheduledFrom: "2026-08-01" }, HOJE)).toBe(false);
  });

  it("filtra por data de conclusão", () => {
    const t = task({ status: "concluida", completedAt: "2026-07-28T12:00:00.000Z" });
    expect(
      matchesFilter(t, { includeCompleted: true, completedFrom: "2026-07-28" }, HOJE),
    ).toBe(true);
    expect(
      matchesFilter(t, { includeCompleted: true, completedFrom: "2026-07-29" }, HOJE),
    ).toBe(false);
  });
});

describe("matchesFilter — atalhos booleanos (tri-state)", () => {
  it("onlyOverdue exige atraso", () => {
    expect(matchesFilter(task({ scheduledDate: "2026-07-01" }), { onlyOverdue: true }, HOJE)).toBe(
      true,
    );
    expect(matchesFilter(task({ scheduledDate: "2026-08-01" }), { onlyOverdue: true }, HOJE)).toBe(
      false,
    );
  });

  it("false não filtra nada (só true exige)", () => {
    expect(matchesFilter(task(), { onlyOverdue: false }, HOJE)).toBe(true);
    expect(matchesFilter(task(), { onlyRecurring: false }, HOJE)).toBe(true);
  });

  it("onlyNoDate, onlyRecurring e os contadores", () => {
    expect(matchesFilter(task(), { onlyNoDate: true }, HOJE)).toBe(true);
    expect(matchesFilter(task({ scheduledDate: HOJE }), { onlyNoDate: true }, HOJE)).toBe(false);
    expect(matchesFilter(task({ commentCount: 2 }), { onlyWithComments: true }, HOJE)).toBe(true);
    expect(matchesFilter(task(), { onlyWithComments: true }, HOJE)).toBe(false);
    expect(matchesFilter(task({ attachmentCount: 1 }), { onlyWithAttachments: true }, HOJE)).toBe(
      true,
    );
    expect(matchesFilter(task({ reminderCount: 1 }), { onlyWithReminder: true }, HOJE)).toBe(true);
  });

  it("separa tarefas principais de subtarefas", () => {
    expect(matchesFilter(task(), { onlyParents: true }, HOJE)).toBe(true);
    expect(matchesFilter(task({ parentTaskId: "x" }), { onlyParents: true }, HOJE)).toBe(false);
    expect(matchesFilter(task({ parentTaskId: "x" }), { onlySubtasks: true }, HOJE)).toBe(true);
    expect(matchesFilter(task(), { onlySubtasks: true }, HOJE)).toBe(false);
  });
});

describe("filterTasks / isFilterActive / countActiveFilters", () => {
  it("aplica o filtro à lista", () => {
    const list = [task({ priority: 1 }), task({ priority: 4 }), task({ priority: 1 })];
    expect(filterTasks(list, { priorities: [1] }, HOJE)).toHaveLength(2);
  });

  it("detecta filtro ativo, ignorando valores vazios", () => {
    expect(isFilterActive({})).toBe(false);
    expect(isFilterActive({ search: "", projectIds: [] })).toBe(false);
    expect(isFilterActive({ onlyOverdue: false })).toBe(false);
    expect(isFilterActive({ onlyOverdue: true })).toBe(true);
    expect(isFilterActive({ projectIds: ["p1"] })).toBe(true);
  });

  it("conta quantas regras estão ativas", () => {
    expect(countActiveFilters({ projectIds: ["p1"], onlyOverdue: true, search: "" })).toBe(2);
  });
});

describe("sortTasks", () => {
  it("ordena por prioridade com P1 primeiro", () => {
    const list = [task({ priority: 4 }), task({ priority: 1 }), task({ priority: 3 })];
    expect(sortTasks(list, "prioridade").map((t) => t.priority)).toEqual([1, 3, 4]);
    expect(sortTasks(list, "prioridade", "desc").map((t) => t.priority)).toEqual([4, 3, 1]);
  });

  it("ordena por data deixando as sem data por último em QUALQUER direção", () => {
    const list = [
      task({ scheduledDate: null, title: "sem data" }),
      task({ scheduledDate: "2026-08-10", title: "b" }),
      task({ scheduledDate: "2026-08-01", title: "a" }),
    ];
    expect(sortTasks(list, "data").map((t) => t.title)).toEqual(["a", "b", "sem data"]);
    expect(sortTasks(list, "data", "desc").map((t) => t.title)).toEqual(["b", "a", "sem data"]);
  });

  it("ordena por nome respeitando acentuação pt-BR", () => {
    const list = [task({ title: "Zebra" }), task({ title: "Água" }), task({ title: "banana" })];
    expect(sortTasks(list, "nome").map((t) => t.title)).toEqual(["Água", "banana", "Zebra"]);
  });

  it("ordem manual usa position", () => {
    const list = [task({ position: 2 }), task({ position: 0 }), task({ position: 1 })];
    expect(sortTasks(list, "manual").map((t) => t.position)).toEqual([0, 1, 2]);
  });

  it("não muta a lista original", () => {
    const list = [task({ priority: 4 }), task({ priority: 1 })];
    const antes = list.map((t) => t.id);
    sortTasks(list, "prioridade");
    expect(list.map((t) => t.id)).toEqual(antes);
  });

  it("desempata de forma determinística", () => {
    const a = task({ priority: 2, position: 1, title: "B" });
    const b = task({ priority: 2, position: 0, title: "A" });
    expect(sortTasks([a, b], "prioridade").map((t) => t.title)).toEqual(["A", "B"]);
  });
});

describe("groupTasks", () => {
  it("sem agrupamento devolve um único grupo", () => {
    const groups = groupTasks([task(), task()], "nenhum", lookups, HOJE);
    expect(groups).toHaveLength(1);
    expect(groups[0].tasks).toHaveLength(2);
  });

  it("agrupa por projeto e joga a caixa de entrada para o fim", () => {
    const groups = groupTasks(
      [task({ projectId: null }), task({ projectId: "p1" })],
      "projeto",
      lookups,
      HOJE,
    );
    expect(groups.map((g) => g.key)).toEqual(["p1", "__inbox__"]);
  });

  it("agrupa por prioridade em ordem P1 → P4", () => {
    const groups = groupTasks(
      [task({ priority: 4 }), task({ priority: 1 }), task({ priority: 2 })],
      "prioridade",
      lookups,
      HOJE,
    );
    expect(groups.map((g) => g.key)).toEqual(["p1", "p2", "p4"]);
  });

  it("agrupa por etiqueta e repete a tarefa em cada etiqueta", () => {
    const t = task({
      labels: [
        { id: "l1", name: "casa", color: "gold" },
        { id: "l2", name: "trabalho", color: "azul" },
      ],
    });
    const groups = groupTasks([t], "etiqueta", lookups, HOJE);
    expect(groups).toHaveLength(2);
    expect(groups.every((g) => g.tasks.length === 1)).toBe(true);
  });

  it("agrupa por status usando o status EFETIVO (atrasada derivada)", () => {
    const groups = groupTasks(
      [task({ scheduledDate: "2026-07-01" }), task()],
      "status",
      lookups,
      HOJE,
    );
    expect(groups.map((g) => g.key).sort()).toEqual(["atrasada", "pendente"]);
  });
});

describe("buildTaskTree", () => {
  it("aninha subtarefas sob a tarefa-mãe", () => {
    const mae = task({ id: "m" });
    const filha = task({ id: "f", parentTaskId: "m" });
    const tree = buildTaskTree([mae, filha]);
    expect(tree).toHaveLength(1);
    expect(tree[0].children.map((c) => c.id)).toEqual(["f"]);
  });

  it("sobe para a raiz a subtarefa cuja mãe foi filtrada de fora", () => {
    const orfa = task({ id: "f", parentTaskId: "inexistente" });
    const tree = buildTaskTree([orfa]);
    expect(tree.map((t) => t.id)).toEqual(["f"]);
  });

  it("ignora auto-referência sem entrar em laço", () => {
    const t = task({ id: "x", parentTaskId: "x" });
    const tree = buildTaskTree([t]);
    expect(tree).toHaveLength(1);
    expect(tree[0].children).toHaveLength(0);
  });
});

describe("helpers das visões fixas", () => {
  it("isInbox: aberta, sem projeto e sem mãe", () => {
    expect(isInbox(task())).toBe(true);
    expect(isInbox(task({ projectId: "p1" }))).toBe(false);
    expect(isInbox(task({ parentTaskId: "m" }))).toBe(false);
    expect(isInbox(task({ status: "concluida" }))).toBe(false);
  });

  it("isTodayBucket junta as de hoje com as atrasadas", () => {
    expect(isTodayBucket(task({ scheduledDate: HOJE }), HOJE)).toBe(true);
    expect(isTodayBucket(task({ scheduledDate: "2026-07-01" }), HOJE)).toBe(true);
    expect(isTodayBucket(task({ scheduledDate: "2026-08-01" }), HOJE)).toBe(false);
  });

  it("isCompletedToday só aceita conclusão na data de hoje", () => {
    expect(
      isCompletedToday(task({ status: "concluida", completedAt: `${HOJE}T15:00:00.000Z` }), HOJE),
    ).toBe(true);
    expect(
      isCompletedToday(
        task({ status: "concluida", completedAt: "2026-07-27T15:00:00.000Z" }),
        HOJE,
      ),
    ).toBe(false);
    expect(isCompletedToday(task(), HOJE)).toBe(false);
  });
});
