/**
 * Fase 18-C · Bloco 4 — IA · Os commands do TO-DO.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ O TESTE QUE DÁ NOME AO BLOCO É O DE EQUIVALÊNCIA (§6.6 do design): **a ferramenta e o ║
 * ║ formulário produzem o MESMO registro para a mesma entrada.**                           ║
 * ║                                                                                       ║
 * ║ Ele não é decorativo. A regra "nenhuma regra de negócio é reescrita" só vale enquanto  ║
 * ║ os dois caminhos convergirem num ponto — e o ponto é `todoQuickTaskSchema`. O dia em   ║
 * ║ que alguém acrescentar um campo ao formulário e esquecer da tradução da IA, é este     ║
 * ║ arquivo que fica vermelho, e não o usuário que descobre.                               ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * ⚠️ As queries do módulo são mockadas: o que se testa aqui é a DECISÃO (tradução, previsão,
 * resolução de entidade, recusa), não o banco. `executar` não é exercitado — ele é uma casca
 * sobre `todo/services.ts`, e a fronteira que impede o run de alcançá-lo é `boundaries.test.ts`.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

type Projeto = { id: string; name: string; status: string };
type Tarefa = Record<string, unknown>;

let projetos: Projeto[] = [];
let tarefas: Tarefa[] = [];

vi.mock("@/lib/todo/queries", () => ({
  getTodoProjects: async () => projetos,
  getTodoTasks: async () => tarefas,
}));

// `hojeISO` é injetado no módulo real; aqui basta ser estável para a previsão não oscilar.
vi.mock("@/lib/format", async (original) => {
  const real = await original<typeof import("@/lib/format")>();
  return { ...real, hojeISO: () => "2026-08-07" };
});

const {
  criarTarefaEntrada,
  paraOSchemaDoFormulario,
  preverCriarTarefa,
  preverReagendarTarefa,
  reagendarTarefaEntrada,
} = await import("./todo-preview");
const { EfeitoImpossivel } = await import("../contracts");
const { todoQuickTaskSchema } = await import("@/lib/validators/todo");

const UUID = "11111111-2222-4333-8444-555555555555";
/**
 * Ids de projeto precisam ser uuid DE VERDADE. Não é rigor de fixture: `project_id` do
 * formulário é `z.uuid()`, e um "p-1" faria a tradução estourar — que é exatamente o que
 * aconteceu na primeira execução deste arquivo, e é o schema do módulo fazendo o trabalho
 * dele sobre um caminho que a IA agora percorre.
 */
const PROJ_1 = "22222222-2222-4333-8444-555555555555";
const PROJ_2 = "33333333-2222-4333-8444-555555555555";

const tarefaBase = (extra: Partial<Record<string, unknown>> = {}) => ({
  id: UUID,
  title: "Comprar pão",
  status: "pendente",
  scheduledDate: "2026-08-08",
  scheduledTime: null,
  deadlineAt: null,
  projectId: null,
  priority: 4,
  recurrence: null,
  subtaskCount: 0,
  subtaskDoneCount: 0,
  ...extra,
});

beforeEach(() => {
  projetos = [];
  tarefas = [];
});

/* ══════════════════════════════════════════════════════════════════════════════════════
   A entrada
   ══════════════════════════════════════════════════════════════════════════════════════ */

describe("a entrada da ferramenta é fechada", () => {
  it("aceita o pedido mínimo", () => {
    expect(criarTarefaEntrada.safeParse({ titulo: "Comprar pão" }).success).toBe(true);
  });

  /**
   * ⛔ O CAMPO QUE NUNCA PODE PASSAR. `user_id` não existe no schema, e `.strict()` o recusa —
   * é a mesma trava da 18-A, valendo agora para um caminho que ESCREVE.
   */
  it("recusa user_id e qualquer campo a mais", () => {
    for (const campo of ["user_id", "userId", "owner_id", "project_id", "source"]) {
      const r = criarTarefaEntrada.safeParse({ titulo: "x", [campo]: UUID });
      expect(r.success, campo).toBe(false);
    }
  });

  /**
   * ⛔ E O CAMPO QUE O MODELO MAIS TENTARIA MANDAR: um id de projeto. O schema aceita NOME, e
   * quem resolve nome → id é o servidor. Um uuid vindo do modelo seria adivinhação com cara
   * de precisão — e apontaria para o projeto de outra pessoa se ele acertasse por acaso.
   */
  it("`projeto` é nome, não id — e id não vira nome por engano", () => {
    const r = criarTarefaEntrada.safeParse({ titulo: "x", projeto: UUID });
    // O uuid PASSA no schema (é uma string), e é `resolverProjeto` quem o recusa por não
    // casar com nome nenhum. O teste existe para deixar claro qual camada decide.
    expect(r.success).toBe(true);
  });

  it("recusa data e horário fora do formato", () => {
    expect(criarTarefaEntrada.safeParse({ titulo: "x", data: "08/08/2026" }).success).toBe(
      false,
    );
    expect(criarTarefaEntrada.safeParse({ titulo: "x", horario: "9h" }).success).toBe(false);
    expect(criarTarefaEntrada.safeParse({ titulo: "x", prioridade: 5 }).success).toBe(false);
    expect(criarTarefaEntrada.safeParse({ titulo: "" }).success).toBe(false);
  });

  it("reagendar exige um id de tarefa de verdade", () => {
    expect(reagendarTarefaEntrada.safeParse({ tarefa_id: "abc", data: "2026-08-09" }).success)
      .toBe(false);
    expect(reagendarTarefaEntrada.safeParse({ tarefa_id: UUID, data: "amanhã" }).success).toBe(
      false,
    );
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════════
   O TESTE DE EQUIVALÊNCIA
   ══════════════════════════════════════════════════════════════════════════════════════ */

describe("equivalência: a IA e o formulário produzem o mesmo registro", () => {
  /**
   * ⛔ O caso completo. O que o formulário manda (`todoQuickTaskSchema` cru) e o que a IA
   * manda (traduzido) têm de sair IDÊNTICOS do schema — inclusive nos campos que nenhum dos
   * dois preencheu, porque é ali que uma divergência passaria despercebida.
   */
  it("mesmo pedido, mesmo objeto — campo a campo", () => {
    const daIa = paraOSchemaDoFormulario(
      {
        titulo: "Comprar pão",
        data: "2026-08-08",
        horario: "09:30",
        prazo: "2026-08-10",
        prioridade: 2,
      },
      UUID,
    );

    const doFormulario = todoQuickTaskSchema.parse({
      title: "Comprar pão",
      project_id: UUID,
      section_id: null,
      parent_task_id: null,
      scheduled_date: "2026-08-08",
      scheduled_time: "09:30",
      deadline_at: "2026-08-10",
      priority: 2,
      label_ids: [],
      recurrence: null,
    });

    expect(daIa).toEqual(doFormulario);
  });

  /**
   * O caso mínimo é o que mais engana: os DEFAULTS têm de vir do schema do formulário, nunca
   * de um valor escrito na tradução. Prioridade 4, etiquetas vazias e recorrência nula são
   * decisões do módulo — repeti-las na tradução criaria uma segunda fonte para elas.
   */
  it("o pedido mínimo herda os padrões DO FORMULÁRIO", () => {
    const daIa = paraOSchemaDoFormulario({ titulo: "Só o título" }, null);

    expect(daIa.priority).toBe(4);
    expect(daIa.label_ids).toEqual([]);
    expect(daIa.recurrence).toBeNull();
    expect(daIa.project_id).toBeNull();
    expect(daIa.scheduled_date).toBeNull();

    expect(daIa).toEqual(
      todoQuickTaskSchema.parse({ title: "Só o título", label_ids: [], recurrence: null }),
    );
  });

  /**
   * ⛔ A VALIDAÇÃO CRUZADA DO FORMULÁRIO VALE PARA A IA TAMBÉM. Prazo antes da data programada
   * é recusado pelo `superRefine` de `todoQuickTaskSchema` — e como a tradução PASSA por ele,
   * a recusa acontece na PREVISÃO, antes de o dono ver um cartão de confirmação para algo que
   * o formulário nunca aceitaria.
   */
  it("prazo anterior à data programada é recusado, como no formulário", () => {
    expect(() =>
      paraOSchemaDoFormulario(
        { titulo: "x", data: "2026-08-10", prazo: "2026-08-01" },
        null,
      ),
    ).toThrow();
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════════
   A previsão
   ══════════════════════════════════════════════════════════════════════════════════════ */

describe("preverCriarTarefa", () => {
  it("monta a previsão sem projeto, e diz o que a ferramenta não faz", async () => {
    const efeito = await preverCriarTarefa({ titulo: "Comprar pão", data: "2026-08-08" });

    expect(efeito.command).toBe("criarTarefaTodo");
    expect(efeito.entidades).toEqual([]);
    expect(efeito.previsao.resumo).toContain("Comprar pão");
    expect(efeito.previsao.linhas).toContainEqual({
      rotulo: "Projeto",
      valor: "Caixa de entrada",
    });
    // A ressalva que impede o dono de supor que a etiqueta que ele citou entrou junto.
    expect(efeito.previsao.ressalvas.join(" ")).toContain("sem etiquetas");
  });

  it("sem data, avisa que a tarefa não aparece na agenda do dia", async () => {
    const efeito = await preverCriarTarefa({ titulo: "Um dia eu faço" });
    expect(efeito.previsao.ressalvas.join(" ")).toContain("Caixa de entrada");
  });

  it("com data, NÃO repete o aviso da caixa de entrada", async () => {
    const efeito = await preverCriarTarefa({ titulo: "x", data: "2026-08-08" });
    expect(efeito.previsao.ressalvas.join(" ")).not.toContain("não aparece na agenda");
  });

  /**
   * ⛔ O PROJETO RESOLVIDO ENTRA NAS ENTIDADES — e é o que amarra o hash. O mesmo pedido
   * apontando para outro projeto é outra proposta (§3.4).
   */
  it("resolve o projeto pelo nome e o registra como entidade", async () => {
    projetos = [{ id: PROJ_1, name: "Casa", status: "ativo" }];
    const efeito = await preverCriarTarefa({ titulo: "x", projeto: "casa" });

    expect(efeito.entidades).toEqual([
      { tipo: "projeto_todo", id: PROJ_1, rota: `/todo?v=projeto&id=${PROJ_1}` },
    ]);
    expect(efeito.previsao.linhas).toContainEqual({ rotulo: "Projeto", valor: "Casa" });
  });

  /**
   * ⛔ NOME QUE NÃO EXISTE NÃO VIRA "SEM PROJETO" EM SILÊNCIO. O dono pediu uma coisa e
   * receberia outra — e a previsão que ele leria não diria isso.
   */
  it("projeto inexistente cancela a proposta, com o motivo", async () => {
    projetos = [{ id: PROJ_1, name: "Casa", status: "ativo" }];
    await expect(preverCriarTarefa({ titulo: "x", projeto: "Trabalho" })).rejects.toThrow(
      EfeitoImpossivel,
    );
  });

  /** Ambiguidade é do dono para resolver — o sistema não sorteia. */
  it("nome que casa com dois projetos cancela a proposta e NOMEIA os candidatos", async () => {
    projetos = [
      { id: PROJ_1, name: "Casa nova", status: "ativo" },
      { id: PROJ_2, name: "Casa de praia", status: "ativo" },
    ];
    await expect(preverCriarTarefa({ titulo: "x", projeto: "casa" })).rejects.toThrow(
      /Casa nova.*Casa de praia|Casa de praia.*Casa nova/,
    );
  });

  /** Casamento EXATO vence o parcial — senão "Casa" seria ambíguo com "Casa de praia". */
  it("nome exato vence o casamento parcial", async () => {
    projetos = [
      { id: PROJ_1, name: "Casa", status: "ativo" },
      { id: PROJ_2, name: "Casa de praia", status: "ativo" },
    ];
    const efeito = await preverCriarTarefa({ titulo: "x", projeto: "Casa" });
    expect(efeito.entidades[0]?.id).toBe(PROJ_1);
  });

  /**
   * ⛔ A PREVISÃO É DETERMINÍSTICA. Duas montagens do mesmo pedido têm de dar o mesmo objeto —
   * senão a revalidação da execução recusaria propostas legítimas todas as vezes.
   */
  it("o mesmo pedido produz o mesmo efeito, duas vezes", async () => {
    projetos = [{ id: PROJ_1, name: "Casa", status: "ativo" }];
    const a = await preverCriarTarefa({ titulo: "x", projeto: "Casa", data: "2026-08-08" });
    const b = await preverCriarTarefa({ titulo: "x", projeto: "Casa", data: "2026-08-08" });
    expect(a).toEqual(b);
  });
});

describe("preverReagendarTarefa", () => {
  it("mostra a data ATUAL e a nova — e é a atual que faz o hash mudar quando o mundo muda", async () => {
    tarefas = [tarefaBase()];
    const efeito = await preverReagendarTarefa({ tarefa_id: UUID, data: "2026-08-15" });

    const rotulos = efeito.previsao.linhas.map((l) => l.rotulo);
    expect(rotulos).toContain("Data atual");
    expect(rotulos).toContain("Nova data");
    expect(efeito.entidades[0]).toMatchObject({ tipo: "tarefa_todo", id: UUID });
  });

  it("tarefa que não existe (ou não é sua) cancela a proposta", async () => {
    tarefas = [];
    await expect(
      preverReagendarTarefa({ tarefa_id: UUID, data: "2026-08-15" }),
    ).rejects.toThrow(EfeitoImpossivel);
  });

  it("tarefa já concluída cancela a proposta em vez de não fazer nada", async () => {
    tarefas = [tarefaBase({ status: "concluida" })];
    await expect(
      preverReagendarTarefa({ tarefa_id: UUID, data: "2026-08-15" }),
    ).rejects.toThrow(/concluída ou cancelada/);
  });

  /** Recorrente muda de significado: o dono precisa saber que a REGRA não é tocada. */
  it("tarefa recorrente ganha a ressalva de que só a ocorrência muda", async () => {
    tarefas = [tarefaBase({ recurrence: { frequency: "semanal" } })];
    const efeito = await preverReagendarTarefa({ tarefa_id: UUID, data: "2026-08-15" });
    expect(efeito.previsao.ressalvas.join(" ")).toContain("só esta ocorrência");
  });

  /**
   * ⛔ A RESSALVA QUE EVITA UMA SURPRESA CARA: mover a execução para depois do prazo faz a
   * tarefa nascer atrasada, e o prazo NÃO é movido junto de propósito.
   */
  it("nova data depois do prazo final é avisada, e o prazo não é alterado", async () => {
    tarefas = [tarefaBase({ deadlineAt: "2026-08-10" })];
    const efeito = await preverReagendarTarefa({ tarefa_id: UUID, data: "2026-08-20" });
    expect(efeito.previsao.ressalvas.join(" ")).toContain("POSTERIOR ao prazo final");
  });

  it("dentro do prazo, nenhuma ressalva é inventada", async () => {
    tarefas = [tarefaBase({ deadlineAt: "2026-08-30" })];
    const efeito = await preverReagendarTarefa({ tarefa_id: UUID, data: "2026-08-20" });
    expect(efeito.previsao.ressalvas).toEqual([]);
  });
});
