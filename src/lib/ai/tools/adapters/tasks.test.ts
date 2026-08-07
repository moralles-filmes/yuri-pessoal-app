/**
 * Fase 18-C — IA · O que a ferramenta de Tarefas e Rotinas relata bate com a tela.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ O RISCO PRINCIPAL DESTE MÓDULO NÃO É UM NÚMERO ERRADO — É O MÓDULO ERRADO.            ║
 * ║                                                                                       ║
 * ║ O projeto tem DOIS módulos de tarefas, com dados separados. Um total sem a            ║
 * ║ qualificação de origem leva o usuário a somar as duas listas mentalmente, ou a achar  ║
 * ║ que uma sumiu. Por isso há teste sobre o TEXTO, e não só sobre a contagem.            ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */

import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RoutineWithToday, TaskWithRelations } from "@/types/database";

const HOJE = "2026-08-07";

let tarefasFalsas: TaskWithRelations[] = [];
let rotinasFalsas: RoutineWithToday[] = [];

vi.mock("@/lib/format", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/format")>()),
  hojeISO: () => HOJE,
}));

vi.mock("@/lib/tasks/queries", () => ({
  getTasks: async () => tarefasFalsas,
  getRoutinesWithToday: async () => rotinasFalsas,
}));

const { getPending, getRoutinesToday } = await import("./tasks");

/* ═══════════════════════════ Fixtures mínimas ═══════════════════════════ */

function tarefa(
  over: Partial<TaskWithRelations> & { id: string; title: string },
): TaskWithRelations {
  return {
    user_id: "u1",
    calendar_event_id: null,
    completed_at: null,
    created_at: "2026-08-01T12:00:00.000Z",
    due_date: null,
    notes: null,
    position: 0,
    priority: "media",
    project_id: null,
    recurrence: null,
    reminder_at: null,
    start_date: null,
    status: "pendente",
    tags: [],
    updated_at: "2026-08-01T12:00:00.000Z",
    project: null,
    checklist: [],
    attachments: [],
    calendar_event: null,
    ...over,
  } as TaskWithRelations;
}

function rotina(
  over: Partial<RoutineWithToday> & { id: string; name: string },
): RoutineWithToday {
  return {
    user_id: "u1",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    description: null,
    frequency: "diario",
    is_active: true,
    position: 0,
    type: "manha",
    weekdays: [1, 2, 3, 4, 5, 6, 7],
    items: [],
    todayLog: null,
    scheduledToday: true,
    adherence7: { scheduled: 7, done: 5, rate: 5 / 7 },
    streak: 2,
    ...over,
  } as RoutineWithToday;
}

/**
 * FIXTURE de tarefas — "hoje" é 2026-08-07.
 *
 *  T1  vence 05/08, pendente     → ATRASADA
 *  T2  vence 07/08, em_andamento → HOJE
 *  T3  sem data, pendente        → SEM DATA
 *  T4  vence 01/08, CONCLUÍDA    → fechada, fora de tudo
 *
 *  abertas = 3 · atrasadas = 1 · hoje = 1 · sem data = 1
 */
const TAREFAS: TaskWithRelations[] = [
  tarefa({ id: "t1", title: "Renovar seguro", due_date: "2026-08-05" }),
  tarefa({
    id: "t2",
    title: "Ligar para o contador",
    due_date: HOJE,
    status: "em_andamento",
    priority: "alta",
  }),
  tarefa({ id: "t3", title: "Organizar gaveta", priority: "baixa" }),
  tarefa({
    id: "t4",
    title: "Já resolvida",
    due_date: "2026-08-01",
    status: "concluida",
    completed_at: "2026-08-01T18:00:00.000Z",
  }),
];

beforeEach(() => {
  tarefasFalsas = [...TAREFAS];
  rotinasFalsas = [
    rotina({ id: "r1", name: "Rotina da manhã", streak: 4 }),
    rotina({
      id: "r2",
      name: "Faxina de sábado",
      frequency: "semanal",
      scheduledToday: false,
      // Não caiu nenhum dia na janela de 7: 0 de 0 agendados.
      adherence7: { scheduled: 0, done: 0, rate: 0 },
    }),
    rotina({ id: "r3", name: "Desativada", is_active: false }),
  ];
});

/* ═══════════════════════════════ Testes ═══════════════════════════════ */

describe("tasks.get_pending", () => {
  it("conta abertas, atrasadas, de hoje e sem data com os números da fixture", async () => {
    const saida = await getPending();
    expect(saida.agregados).toMatchObject({
      abertas: 3,
      atrasadas: 1,
      para_hoje: 1,
      sem_data: 1,
    });
    expect(saida.contagem).toBe(3);
  });

  /** `t1.status` é `"pendente"` no banco — `atrasada` nunca é gravada. */
  it("relata o status DERIVADO, não o gravado", async () => {
    const saida = await getPending();
    const t1 = saida.itens.find(
      (i) => (i as { titulo: string }).titulo === "Renovar seguro",
    ) as { status: string };

    expect(TAREFAS[0].status).toBe("pendente");
    expect(t1.status).toBe("Atrasada");
  });

  it("ordena como a tela: atrasada primeiro, depois vencimento, depois prioridade", async () => {
    const saida = await getPending();
    const titulos = saida.itens.map((i) => (i as { titulo: string }).titulo);
    expect(titulos).toEqual([
      "Renovar seguro", // atrasada
      "Ligar para o contador", // vence hoje
      "Organizar gaveta", // sem data, por último
    ]);
  });

  /** ⚠️ O teste sobre o TEXTO: o número precisa vir com o módulo de origem. */
  it("declara de qual módulo o número veio, e que não é o TO-DO", async () => {
    const saida = await getPending();
    expect(saida.agregados).toMatchObject({
      modulo: "Tarefas e Rotinas (Fase 09) — NÃO é o TO-DO",
    });
  });

  it("o texto do caso vazio também avisa que o TO-DO é outro", async () => {
    tarefasFalsas = [TAREFAS[3]];
    const saida = await getPending();
    expect(saida.contagem).toBe(0);
    expect(saida.observacao).toContain("TO-DO");
  });

  it("as refs apontam para a rota do módulo da Fase 09", async () => {
    const saida = await getPending();
    expect(saida.refs[0]).toEqual({
      tipo: "tarefa",
      id: "t1",
      rota: "/tarefas?task=t1",
    });
  });

  /**
   * ⚠️ O COMPILADOR NUNCA VÊ ISTO. `getTasks` corta em 2000 num literal dentro da query, sem
   * parâmetro. O adapter repete o valor por não ter como importá-lo — se alguém mudar o
   * literal lá, o adapter passa a chamar de "exato" um resultado cortado.
   */
  it("o teto repetido no adapter é o mesmo literal da query", () => {
    const RAIZ = path.resolve(__dirname, "..", "..", "..", "..", "..");
    const queries = fs.readFileSync(
      path.join(RAIZ, "src", "lib", "tasks", "queries.ts"),
      "utf8",
    );
    const adapter = fs.readFileSync(path.join(__dirname, "tasks.ts"), "utf8");

    const noAdapter = adapter.match(/const TETO_TAREFAS_DA_CONSULTA = (\d+)/)?.[1];
    expect(noAdapter, "TETO_TAREFAS_DA_CONSULTA sumiu do adapter").toBeDefined();
    // `getTasks` é a primeira função do arquivo; o `.limit(N)` dela é o primeiro do arquivo.
    const primeiroLimit = queries.match(/\.limit\((\d+)\)/)?.[1];
    expect(primeiroLimit, "o .limit() de getTasks sumiu").toBeDefined();
    expect(noAdapter).toBe(primeiroLimit);
  });

  it("saturar o teto marca o total como parcial", async () => {
    tarefasFalsas = Array.from({ length: 2000 }, (_, i) =>
      tarefa({ id: `g${i}`, title: `T${i}`, due_date: HOJE }),
    );
    const saida = await getPending();
    expect(saida.completude).toBe("parcial");
    expect(saida.motivo_incompleto).toContain("2000");
  });
});

describe("tasks.get_routines_today", () => {
  it("conta ativas, agendadas e pendentes, ignorando a desativada", async () => {
    const saida = await getRoutinesToday();
    expect(saida.agregados).toMatchObject({
      ativas: 2,
      agendadas_hoje: 1,
      concluidas_hoje: 0,
      pendentes_hoje: 1,
      nao_agendadas_hoje: 1,
    });
  });

  it("rotina marcada hoje entra em concluídas", async () => {
    rotinasFalsas = [
      rotina({
        id: "r1",
        name: "Rotina da manhã",
        todayLog: { is_done: true } as RoutineWithToday["todayLog"],
      }),
    ];
    const saida = await getRoutinesToday();
    expect(saida.agregados).toMatchObject({ concluidas_hoje: 1, pendentes_hoje: 0 });
  });

  /** Mesma regra dos Hábitos: sem dia agendado não há denominador, e 0% seria falso. */
  it("aderência sem dia agendado vem NULA, com o motivo", async () => {
    const saida = await getRoutinesToday();
    const faxina = saida.itens.find(
      (i) => (i as { rotina: string }).rotina === "Faxina de sábado",
    ) as {
      ultimos_7_dias: { taxa_percentual: number | null; taxa_indisponivel_porque?: string };
    };

    expect(faxina.ultimos_7_dias.taxa_percentual).toBeNull();
    expect(faxina.ultimos_7_dias.taxa_indisponivel_porque).toContain("não é 0%");
  });

  it("com denominador, a taxa aparece arredondada", async () => {
    const saida = await getRoutinesToday();
    const manha = saida.itens.find(
      (i) => (i as { rotina: string }).rotina === "Rotina da manhã",
    ) as { ultimos_7_dias: { taxa_percentual: number | null } };

    // 5 de 7 = 71,43% → 71
    expect(manha.ultimos_7_dias.taxa_percentual).toBe(71);
  });

  it("sem rotina ativa, distingue 'nenhuma cadastrada' de 'todas desativadas'", async () => {
    rotinasFalsas = [rotina({ id: "r3", name: "Desativada", is_active: false })];
    expect((await getRoutinesToday()).observacao).toContain("desativadas");

    rotinasFalsas = [];
    expect((await getRoutinesToday()).observacao).toContain("não há rotina cadastrada");
  });
});
