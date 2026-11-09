import { describe, expect, it } from "vitest";
import {
  TOOL_PERMISSIONS,
  TOOL_WRITE_PERMISSIONS,
  type ToolPermission,
  type ToolWritePermission,
} from "@/lib/ai/tools/contracts";
import { ASSISTENTE_PESSOAL_ID, findAgent } from "./registry";
import {
  MAX_ESPECIALISTAS,
  MAX_TAREFA_CHARS,
  MOTIVO_PARA_AUDITORIA,
  TOOL_NAME_ACIONAMENTO,
  catalogoDeEspecialistas,
  decidirAcionamentos,
  definicoesDeAcionamento,
  type EspecialistaOferecido,
  type MotivoDeRecusa,
} from "./especialistas";

const TUDO_LIGADO = Object.fromEntries(TOOL_PERMISSIONS.map((p) => [p, true])) as Record<
  ToolPermission,
  boolean
>;
const ESCRITA_LIGADA = Object.fromEntries(
  TOOL_WRITE_PERMISSIONS.map((p) => [p, true]),
) as Record<ToolWritePermission, boolean>;

const catalogoCompleto = () => catalogoDeEspecialistas(TUDO_LIGADO, ESCRITA_LIGADA);

const nomeDe = (agentId: string) => {
  const o = catalogoCompleto().ofertas.find((x) => x.agentId === agentId);
  if (!o) throw new Error(`sem oferta para ${agentId}`);
  return o.ferramenta;
};

const chamada = (callId: string, agentId: string, tarefa: unknown = "Resuma o mês") => ({
  callId,
  toolName: nomeDe(agentId),
  input: { tarefa },
});

describe("catalogoDeEspecialistas", () => {
  it("todos ligados: oito especialistas oferecidos, nenhum orquestrador", () => {
    const { ofertas, desligados } = catalogoCompleto();
    expect(ofertas).toHaveLength(8);
    expect(ofertas.some((o) => o.agentId === ASSISTENTE_PESSOAL_ID)).toBe(false);
    expect(desligados).toEqual([]);
  });

  it("allow_finance desligada: Financeiro sai das ofertas e entra em desligados (pelo rótulo)", () => {
    const { ofertas, desligados } = catalogoDeEspecialistas(
      { ...TUDO_LIGADO, allow_finance: false },
      ESCRITA_LIGADA,
    );
    expect(ofertas.some((o) => o.agentId === "financeiro")).toBe(false);
    expect(ofertas).toHaveLength(7);
    expect(desligados).toEqual([findAgent("financeiro")!.label]);
  });

  it("allow_training desligada e allow_body ligada: Treinos continua oferecido", () => {
    const { ofertas, desligados } = catalogoDeEspecialistas(
      { ...TUDO_LIGADO, allow_training: false },
      ESCRITA_LIGADA,
    );
    expect(ofertas.some((o) => o.agentId === "treinos")).toBe(true);
    expect(desligados).toEqual([]);
  });

  it("training e body desligadas: Treinos sai (memory.lembrar é escrita e não conta)", () => {
    const { ofertas, desligados } = catalogoDeEspecialistas(
      { ...TUDO_LIGADO, allow_training: false, allow_body: false },
      ESCRITA_LIGADA,
    );
    expect(ofertas.some((o) => o.agentId === "treinos")).toBe(false);
    expect(desligados).toEqual([findAgent("treinos")!.label]);
  });

  it("nada ligado: ninguém oferecido e todos os rótulos desligados, na ordem do registry", () => {
    const { ofertas, desligados } = catalogoDeEspecialistas({}, {});
    expect(ofertas).toEqual([]);
    expect(desligados).toEqual(
      ["treinos", "todo", "habitos", "estudos", "agenda", "tarefas", "financeiro", "dieta"].map(
        (id) => findAgent(id)!.label,
      ),
    );
  });

  it("o rótulo da oferta é o do perfil", () => {
    const fin = catalogoCompleto().ofertas.find((o) => o.agentId === "financeiro");
    expect(fin?.rotulo).toBe(findAgent("financeiro")!.label);
  });

  it("o nome da ferramenta só tem [a-z0-9_] e começa com acionar_", () => {
    for (const o of catalogoCompleto().ofertas) {
      expect(o.ferramenta).toMatch(/^acionar_[a-z0-9_]+$/);
    }
  });

  it("os nomes são distintos entre si", () => {
    const nomes = catalogoCompleto().ofertas.map((o) => o.ferramenta);
    expect(new Set(nomes).size).toBe(nomes.length);
  });

  it("o nome de auditoria não é um nome oferecido ao provedor", () => {
    expect(TOOL_NAME_ACIONAMENTO).toBe("coordenador.acionar");
    expect(catalogoCompleto().ofertas.map((o) => o.ferramenta)).not.toContain(
      TOOL_NAME_ACIONAMENTO,
    );
  });
});

describe("definicoesDeAcionamento", () => {
  it("uma definição por oferta, com a descrição do agente", () => {
    const { ofertas } = catalogoCompleto();
    const defs = definicoesDeAcionamento(ofertas);
    expect(defs).toHaveLength(ofertas.length);
    for (const [i, d] of defs.entries()) {
      expect(d.name).toBe(ofertas[i].ferramenta);
      expect(d.description).toContain(findAgent(ofertas[i].agentId)!.description);
    }
  });

  it("a definição exige `tarefa` de 1 a 1500, sem campo a mais", () => {
    const [def] = definicoesDeAcionamento(catalogoCompleto().ofertas);
    expect(def.inputSchema).toMatchObject({
      type: "object",
      required: ["tarefa"],
      additionalProperties: false,
      properties: { tarefa: { type: "string", minLength: 1, maxLength: MAX_TAREFA_CHARS } },
    });
    expect(MAX_TAREFA_CHARS).toBe(1500);
  });

  it("situa o \"você\" da descrição do agente como o dono", () => {
    for (const d of definicoesDeAcionamento(catalogoCompleto().ofertas)) {
      expect(d.description).toMatch(/escrita para o dono/);
    }
  });

  it("oferta sem perfil no registry é erro explícito", () => {
    expect(() =>
      definicoesDeAcionamento([{ agentId: "nao-existe", rotulo: "X", ferramenta: "acionar_x" }]),
    ).toThrow(/nao-existe/);
  });

  it("sem ofertas, sem definições", () => {
    expect(definicoesDeAcionamento([])).toEqual([]);
  });
});

describe("decidirAcionamentos", () => {
  it("aceita na ordem recebida e carrega callId, agentId, rótulo e tarefa aparada", () => {
    const d = decidirAcionamentos({
      chamadas: [chamada("c1", "financeiro", "  Quanto gastei?  "), chamada("c2", "dieta")],
      ofertas: catalogoCompleto().ofertas,
      allowCrossModule: true,
    });
    expect(d.recusados).toEqual([]);
    expect(d.aceitos).toEqual([
      {
        callId: "c1",
        agentId: "financeiro",
        rotulo: findAgent("financeiro")!.label,
        tarefa: "Quanto gastei?",
      },
      {
        callId: "c2",
        agentId: "dieta",
        rotulo: findAgent("dieta")!.label,
        tarefa: "Resuma o mês",
      },
    ]);
  });

  it("recusa o repetido", () => {
    const d = decidirAcionamentos({
      chamadas: [chamada("c1", "financeiro"), chamada("c2", "financeiro")],
      ofertas: catalogoCompleto().ofertas,
      allowCrossModule: true,
    });
    expect(d.aceitos.map((a) => a.callId)).toEqual(["c1"]);
    expect(d.recusados).toEqual([
      { callId: "c2", toolName: nomeDe("financeiro"), agentId: "financeiro", motivo: "REPETIDO" },
    ]);
  });

  it("o 7º distinto é ACIMA_DO_TETO", () => {
    const ids = ["financeiro", "todo", "habitos", "estudos", "agenda", "tarefas", "dieta"];
    const d = decidirAcionamentos({
      chamadas: ids.map((id, i) => chamada(`c${i}`, id)),
      ofertas: catalogoCompleto().ofertas,
      allowCrossModule: true,
    });
    expect(MAX_ESPECIALISTAS).toBe(6);
    expect(d.aceitos).toHaveLength(6);
    expect(d.recusados).toHaveLength(1);
    expect(d.recusados[0]).toMatchObject({ callId: "c6", agentId: "dieta", motivo: "ACIMA_DO_TETO" });
  });

  it("cruzar módulos desligado aceita só o primeiro", () => {
    const d = decidirAcionamentos({
      chamadas: [chamada("c1", "financeiro"), chamada("c2", "todo")],
      ofertas: catalogoCompleto().ofertas,
      allowCrossModule: false,
    });
    expect(d.aceitos.map((a) => a.agentId)).toEqual(["financeiro"]);
    expect(d.recusados).toEqual([
      {
        callId: "c2",
        toolName: nomeDe("todo"),
        agentId: "todo",
        motivo: "CRUZAR_MODULOS_DESLIGADO",
      },
    ]);
  });

  it("cruzar módulos desligado: o repetido continua REPETIDO (a ordem das recusas)", () => {
    const d = decidirAcionamentos({
      chamadas: [chamada("c1", "financeiro"), chamada("c2", "financeiro")],
      ofertas: catalogoCompleto().ofertas,
      allowCrossModule: false,
    });
    expect(d.recusados[0].motivo).toBe("REPETIDO");
  });

  it.each([
    ["vazia", ""],
    ["só de espaços", "   \n\t "],
    ["acima de 1500", "a".repeat(MAX_TAREFA_CHARS + 1)],
    ["não texto", 42],
    ["ausente", undefined],
  ])("tarefa %s é TAREFA_INVALIDA", (_nome, tarefa) => {
    const d = decidirAcionamentos({
      chamadas: [{ callId: "c1", toolName: nomeDe("financeiro"), input: { tarefa } }],
      ofertas: catalogoCompleto().ofertas,
      allowCrossModule: true,
    });
    expect(d.aceitos).toEqual([]);
    expect(d.recusados).toEqual([
      {
        callId: "c1",
        toolName: nomeDe("financeiro"),
        agentId: "financeiro",
        motivo: "TAREFA_INVALIDA",
      },
    ]);
  });

  it("exatamente 1500 caracteres é aceito", () => {
    const d = decidirAcionamentos({
      chamadas: [chamada("c1", "financeiro", "a".repeat(MAX_TAREFA_CHARS))],
      ofertas: catalogoCompleto().ofertas,
      allowCrossModule: true,
    });
    expect(d.aceitos).toHaveLength(1);
  });

  it("campo extra é TAREFA_INVALIDA", () => {
    const d = decidirAcionamentos({
      chamadas: [
        {
          callId: "c1",
          toolName: nomeDe("financeiro"),
          input: { tarefa: "ok", userId: "outro-dono" },
        },
      ],
      ofertas: catalogoCompleto().ofertas,
      allowCrossModule: true,
    });
    expect(d.aceitos).toEqual([]);
    expect(d.recusados[0].motivo).toBe("TAREFA_INVALIDA");
  });

  it("input que não é objeto é TAREFA_INVALIDA", () => {
    const d = decidirAcionamentos({
      chamadas: [{ callId: "c1", toolName: nomeDe("financeiro"), input: "texto solto" }],
      ofertas: catalogoCompleto().ofertas,
      allowCrossModule: true,
    });
    expect(d.recusados[0].motivo).toBe("TAREFA_INVALIDA");
  });

  it("nome fora da oferta é NAO_OFERECIDO, sem agentId", () => {
    const d = decidirAcionamentos({
      chamadas: [
        { callId: "c1", toolName: "acionar_inexistente", input: { tarefa: "x" } },
        { callId: "c2", toolName: "finance.get_balances", input: {} },
      ],
      ofertas: catalogoCompleto().ofertas,
      allowCrossModule: true,
    });
    expect(d.aceitos).toEqual([]);
    expect(d.recusados).toEqual([
      { callId: "c1", toolName: "acionar_inexistente", agentId: null, motivo: "NAO_OFERECIDO" },
      { callId: "c2", toolName: "finance.get_balances", agentId: null, motivo: "NAO_OFERECIDO" },
    ]);
  });

  it("especialista desligado (fora da oferta) é NAO_OFERECIDO mesmo com o nome certo", () => {
    const completo = catalogoCompleto().ofertas;
    const semFinanceiro = completo.filter((o) => o.agentId !== "financeiro");
    const d = decidirAcionamentos({
      chamadas: [chamada("c1", "financeiro")],
      ofertas: semFinanceiro,
      allowCrossModule: true,
    });
    expect(d.recusados[0].motivo).toBe("NAO_OFERECIDO");
  });

  it("a recusa por nome vence a por tarefa (a ordem das recusas)", () => {
    const d = decidirAcionamentos({
      chamadas: [{ callId: "c1", toolName: "acionar_inexistente", input: { tarefa: "" } }],
      ofertas: catalogoCompleto().ofertas,
      allowCrossModule: true,
    });
    expect(d.recusados[0].motivo).toBe("NAO_OFERECIDO");
  });

  it("tarefa inválida vence o repetido e não conta para o teto", () => {
    const d = decidirAcionamentos({
      chamadas: [
        chamada("c1", "financeiro"),
        chamada("c2", "financeiro", ""),
        chamada("c3", "todo"),
      ],
      ofertas: catalogoCompleto().ofertas,
      allowCrossModule: true,
    });
    expect(d.recusados.map((r) => [r.callId, r.motivo])).toEqual([["c2", "TAREFA_INVALIDA"]]);
    expect(d.aceitos.map((a) => a.callId)).toEqual(["c1", "c3"]);
  });

  it("sem chamadas, nada aceito e nada recusado", () => {
    expect(
      decidirAcionamentos({ chamadas: [], ofertas: catalogoCompleto().ofertas, allowCrossModule: true }),
    ).toEqual({ aceitos: [], recusados: [] });
  });
});

describe("MOTIVO_PARA_AUDITORIA", () => {
  it("mapeia cada motivo para o código de recusa da auditoria", () => {
    const esperado: Record<MotivoDeRecusa, string> = {
      NAO_OFERECIDO: "TOOL_NOT_ALLOWED_FOR_AGENT",
      REPETIDO: "TOOL_INCOHERENT",
      ACIMA_DO_TETO: "TOOL_INCOHERENT",
      CRUZAR_MODULOS_DESLIGADO: "TOOL_PERMISSION_DENIED",
      TAREFA_INVALIDA: "TOOL_INVALID_INPUT",
    };
    expect(MOTIVO_PARA_AUDITORIA).toEqual(esperado);
  });
});

// Garante que o tipo exportado é o que as Tasks 12/13 consomem.
const _oferta: EspecialistaOferecido = { agentId: "x", rotulo: "X", ferramenta: "acionar_x" };
void _oferta;
