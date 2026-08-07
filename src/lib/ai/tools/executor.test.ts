/**
 * Fase 18-B — IA · O Tool Executor.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ Este é o ponto do sistema onde uma decisão do MODELO vira uma leitura de dado REAL.   ║
 * ║ O que se testa aqui não é o feliz caminho: é que a ferramenta NÃO roda quando o guard ║
 * ║ nega, que `user_id` no argumento é recusado antes de qualquer execução, e que tudo    ║
 * ║ que volta ao modelo — inclusive erro — vai empacotado como NÃO CONFIÁVEL.             ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * O registry é injetado por mock de propósito: a integridade do registry REAL é assunto de
 * `registry.test.ts`, e aqui interessam timeout curto e teto de registros pequeno, para o
 * teste ser determinístico e legível.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { MAX_UNTRUSTED_CHARS } from "@/lib/ai/security/untrusted";
import type { ToolDescriptor, ToolOutput, ToolPermission } from "./contracts";

const LEITURA: ToolDescriptor = {
  name: "training.get_volume",
  version: "3",
  module: "training",
  kind: "leitura",
  risk: 1,
  description: "Totais do período.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  outputSchema: { type: "object" },
  allowedAgents: ["treinos"],
  requiredPermission: "allow_training",
  timeoutMs: 30,
  maxRecords: 2,
  itemLabel: "sessões de treino",
  requiresConfirmation: false,
  idempotent: true,
};

const SEM_EXECUTOR: ToolDescriptor = { ...LEITURA, name: "training.get_orfa", version: "9" };

vi.mock("./registry", () => ({
  AI_TOOL_REGISTRY: [LEITURA, SEM_EXECUTOR],
}));

/** O que o executor de mentira devolve. Cada teste troca isto. */
let respostaDaFerramenta: () => Promise<ToolOutput> = async () => saidaCom(1);
const chamadas: unknown[] = [];

vi.mock("./executors", () => ({
  TOOL_EXECUTORS: {
    "training.get_volume": {
      schema: z.object({ dias: z.number().int().optional() }).strict(),
      run: async (input: unknown) => {
        chamadas.push(input);
        return respostaDaFerramenta();
      },
    },
  },
}));

const auditadas: Record<string, unknown>[] = [];
let auditoriaFalha = false;

vi.mock("./audit", () => ({
  recordToolCall: async (input: Record<string, unknown>) => {
    if (auditoriaFalha) throw new Error("banco indisponível");
    auditadas.push(input);
  },
}));

const { executeTool } = await import("./executor");

function saidaCom(itens: number): ToolOutput {
  return {
    periodo: { de: "2026-08-01", ate: "2026-08-07" },
    contagem: itens,
    completude: "exato",
    agregados: { volume_kg: 1080 },
    itens: Array.from({ length: itens }, (_, i) => ({ n: i + 1 })),
    refs: Array.from({ length: itens }, (_, i) => ({
      tipo: "sessao_de_treino",
      id: `s${i + 1}`,
      rota: `/treinos/historico/s${i + 1}`,
    })),
  };
}

const ctx = {
  runId: "run-1",
  userId: "user-1",
  stepId: "step-1",
  agent: { id: "treinos", allowedTools: ["training.get_volume"] },
  permissions: { allow_training: true } as Partial<Record<ToolPermission, boolean>>,
};

const chamada = (input: unknown = {}) => ({
  callId: "call-1",
  toolName: "training.get_volume",
  input,
});

beforeEach(() => {
  chamadas.length = 0;
  auditadas.length = 0;
  auditoriaFalha = false;
  respostaDaFerramenta = async () => saidaCom(1);
});

describe("executeTool — o caminho feliz", () => {
  it("devolve o resultado empacotado como NÃO CONFIÁVEL, nunca o objeto cru", async () => {
    const r = await executeTool(ctx, chamada({ dias: 7 }));

    expect(r.isError).toBe(false);
    expect(r.callId).toBe("call-1");
    expect(r.block.untrusted).toBe(true);
    expect(r.block.source).toBe("resultado_de_ferramenta");
    expect(r.block.origin).toBe("training.get_volume");
    expect((r.block.content as ToolOutput).agregados).toEqual({ volume_kg: 1080 });
    expect(r.recordsRead).toBe(1);
    expect(chamadas).toEqual([{ dias: 7 }]);
  });

  it("audita a execução com a versão do descriptor e as referências lidas", async () => {
    await executeTool(ctx, chamada({ dias: 7 }));

    expect(auditadas).toHaveLength(1);
    expect(auditadas[0]).toMatchObject({
      runId: "run-1",
      userId: "user-1",
      stepId: "step-1",
      toolName: "training.get_volume",
      toolVersion: "3",
      providerCallId: "call-1",
      status: "executada",
      rejectionReason: null,
      recordsRead: 1,
    });
    expect(auditadas[0].refs).toEqual([
      { tipo: "sessao_de_treino", id: "s1", rota: "/treinos/historico/s1" },
    ]);
  });

  it("entrada ausente vale como objeto vazio — a ferramenta sem argumento roda", async () => {
    const r = await executeTool(ctx, { callId: "c", toolName: "training.get_volume", input: null });

    expect(r.isError).toBe(false);
    expect(chamadas).toEqual([{}]);
  });
});

describe("executeTool — nada roda sem passar pelo guard", () => {
  it("ferramenta fora da allowlist do agente NÃO é executada", async () => {
    const r = await executeTool(
      { ...ctx, agent: { id: "treinos", allowedTools: [] } },
      chamada(),
    );

    expect(r.isError).toBe(true);
    expect(chamadas).toEqual([]);
    expect(auditadas[0]).toMatchObject({
      status: "rejeitada",
      rejectionReason: "TOOL_NOT_ALLOWED_FOR_AGENT",
    });
  });

  it("flag do módulo desligada NÃO é executada", async () => {
    const r = await executeTool({ ...ctx, permissions: {} }, chamada());

    expect(r.isError).toBe(true);
    expect(chamadas).toEqual([]);
    expect(auditadas[0]).toMatchObject({
      status: "rejeitada",
      rejectionReason: "TOOL_PERMISSION_DENIED",
    });
  });

  it("nome fora do registry NÃO é executado", async () => {
    const r = await executeTool(ctx, { callId: "c", toolName: "finance.drop", input: {} });

    expect(r.isError).toBe(true);
    expect(chamadas).toEqual([]);
    expect(auditadas[0]).toMatchObject({ status: "rejeitada", rejectionReason: "TOOL_UNKNOWN" });
  });

  it("descriptor sem executor é REJEITADO, nunca executado às cegas", async () => {
    const r = await executeTool(
      { ...ctx, agent: { id: "treinos", allowedTools: ["training.get_orfa"] } },
      { callId: "c", toolName: "training.get_orfa", input: {} },
    );

    expect(r.isError).toBe(true);
    expect(chamadas).toEqual([]);
    expect(auditadas[0]).toMatchObject({ status: "rejeitada", rejectionReason: "TOOL_UNKNOWN" });
  });

  // ⚠️ A regra central da fase: `user_id` não existe no schema de entrada, e `.strict()`
  // transforma "campo a mais" em erro. Se isto passar a executar, o modelo passa a escolher
  // de quem é o dado que ele lê.
  it("argumento com user_id é RECUSADO antes de qualquer leitura", async () => {
    const r = await executeTool(ctx, chamada({ dias: 7, user_id: "outro-usuario" }));

    expect(r.isError).toBe(true);
    expect(chamadas).toEqual([]);
    expect(auditadas[0]).toMatchObject({
      status: "rejeitada",
      rejectionReason: "TOOL_INVALID_INPUT",
    });
  });

  it("argumento de tipo errado é recusado", async () => {
    const r = await executeTool(ctx, chamada({ dias: "sete" }));

    expect(r.isError).toBe(true);
    expect(chamadas).toEqual([]);
  });

  it("toda rejeição volta ao modelo como bloco não confiável, com o motivo", async () => {
    const r = await executeTool({ ...ctx, permissions: {} }, chamada());

    expect(r.block.untrusted).toBe(true);
    expect(r.block.source).toBe("resultado_de_ferramenta");
    expect(r.recordsRead).toBe(0);
    expect((r.block.content as { erro: string }).erro).toBe("TOOL_PERMISSION_DENIED");
    expect((r.block.content as { mensagem: string }).mensagem).toContain("autoriz");
  });
});

/**
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ `completude` FALA DO TOTAL; `itens_truncados` FALA DA LISTA.                          ║
 * ║                                                                                       ║
 * ║ Enquanto o corte de lista virava `completude: "parcial"`, o modelo lia "este total    ║
 * ║ está incompleto" para um total calculado sobre o período INTEIRO — e o prompt manda    ║
 * ║ dizer o que ficou de fora, ou seja, ele hedgearia um número certo. Com o orçamento de ║
 * ║ caracteres o caso deixou de ser raro (97 de 400 sessões numa medição).                 ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */
describe("executeTool — teto de registros", () => {
  it("poda pelo maxRecords do DESCRIPTOR e declara a lista truncada", async () => {
    respostaDaFerramenta = async () => saidaCom(5);

    const r = await executeTool(ctx, chamada());
    const saida = r.block.content as ToolOutput;

    expect(saida.itens).toHaveLength(2);
    expect(saida.refs).toHaveLength(2);
    expect(saida.itens_truncados).toMatchObject({ mostrando: 2, de: 5 });
  });

  // ⚠️ A separação inteira depende disto: cortar a LISTA não pode alterar a qualidade do
  // TOTAL. Os agregados foram calculados antes da poda, sobre o período inteiro.
  it("cortar a lista NÃO torna o total parcial", async () => {
    respostaDaFerramenta = async () => saidaCom(5);

    const saida = (await executeTool(ctx, chamada())).block.content as ToolOutput;

    expect(saida.completude).toBe("exato");
    expect(saida.motivo_incompleto).toBeUndefined();
    expect(saida.agregados).toEqual({ volume_kg: 1080 });
  });

  // "Mostrando 50 de 51 registros" ao lado de `contagem: 1` faz o modelo relatar "50 de 51
  // treinos". O que foi podado tem NOME, e o nome mora no descriptor.
  it("a mensagem da poda NOMEIA o que foi podado, em vez de dizer 'registros'", async () => {
    respostaDaFerramenta = async () => saidaCom(5);

    const r = await executeTool(ctx, chamada());
    const motivo = (r.block.content as ToolOutput).itens_truncados?.motivo ?? "";

    expect(motivo).toContain("Mostrando 2 de 5 sessões de treino");
    expect(motivo).not.toContain("registros");
  });

  // O teto é do descriptor: dizer que "não coube no tamanho" quando quem cortou foi o teto
  // sugere que a ferramenta devolveria os 5 numa resposta menor. Ela não devolveria.
  it("corte só pelo teto ATRIBUI ao teto, não ao tamanho da resposta", async () => {
    respostaDaFerramenta = async () => saidaCom(5);

    const saida = (await executeTool(ctx, chamada())).block.content as ToolOutput;

    expect(saida.itens_truncados?.motivo).toContain("teto da ferramenta é 2");
    expect(saida.itens_truncados?.motivo).not.toContain("limite de tamanho");
  });

  /**
   * ⚠️ A frase do teto afirmava, SEMPRE, que "os totais em `agregados` cobrem o período
   * inteiro". Isso é falso justamente quando o adapter já devolveu `completude: "parcial"` —
   * seriam duas afirmações opostas no mesmo resultado, e esta é a que o modelo lê por último.
   *
   * O corte de LISTA (teto) e o total incompleto são coisas separadas de propósito; este
   * ponto só repassa a segunda, nunca a contradiz.
   */
  it("com o total PARCIAL, a frase do teto não promete o período inteiro", async () => {
    respostaDaFerramenta = async () => ({
      ...saidaCom(5),
      completude: "parcial" as const,
      motivo_incompleto: "A janela tem mais treinos que o teto da consulta.",
    });

    const saida = (await executeTool(ctx, chamada())).block.content as ToolOutput;
    const motivo = saida.itens_truncados?.motivo ?? "";

    expect(motivo).toContain("teto da ferramenta é 2");
    expect(motivo).toContain("NÃO cobrem o período inteiro");
    // E o motivo do adapter sobrevive: quem explica o total é ele, não este ponto.
    expect(saida.motivo_incompleto).toBe(
      "A janela tem mais treinos que o teto da consulta.",
    );
  });

  it("com o total EXATO, a frase do teto continua garantindo o período inteiro", async () => {
    respostaDaFerramenta = async () => saidaCom(5);

    const saida = (await executeTool(ctx, chamada())).block.content as ToolOutput;

    expect(saida.itens_truncados?.motivo).toContain(
      "Os totais em `agregados` cobrem o período inteiro.",
    );
  });

  it("lista dentro do teto não declara truncamento nenhum", async () => {
    respostaDaFerramenta = async () => saidaCom(2);

    const saida = (await executeTool(ctx, chamada())).block.content as ToolOutput;

    expect(saida.completude).toBe("exato");
    expect(saida.itens_truncados).toBeUndefined();
    expect(saida.motivo_incompleto).toBeUndefined();
  });

  /**
   * ⚠️ Este teste passa pela poda DE VERDADE (5 itens com teto 2). A versão anterior usava
   * 1 item com teto 2 — nunca entrava no ramo que dizia estar testando, e passava com uma
   * implementação que apagava a ressalva do adapter.
   */
  it("a ressalva do adapter SOBREVIVE à poda, e continua falando só do total", async () => {
    respostaDaFerramenta = async () => ({
      ...saidaCom(5),
      completude: "parcial" as const,
      motivo_incompleto: "Séries sem peso corporal ficaram de fora.",
    });

    const r = await executeTool(ctx, chamada());
    const saida = r.block.content as ToolOutput;

    expect(saida.itens).toHaveLength(2);
    // O do adapter, intacto: a poda não escreve por cima nem concatena o próprio motivo nele.
    expect(saida.completude).toBe("parcial");
    expect(saida.motivo_incompleto).toBe("Séries sem peso corporal ficaram de fora.");
    // …e o da lista, no campo dele. Perder qualquer um dos dois é apresentar como completo
    // o que não é.
    expect(saida.itens_truncados?.motivo).toContain("2 de 5 sessões de treino");
  });
});

/**
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ `refs` NEM SEMPRE É 1:1 COM `itens` — E FATIAR POR POSIÇÃO QUEBRA O "VER DADOS USADOS".║
 * ║                                                                                       ║
 * ║  • `get_last_workout`: 1 ref (a sessão) e N itens (os exercícios do treino).          ║
 * ║  • `get_records`: `refs` é `recordes.filter(r => r.sessionId)` — com um recorde sem   ║
 * ║    sessão, o índice k de `refs` deixa de ser o k de `itens`.                          ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */
describe("executeTool — refs e a rastreabilidade", () => {
  const umaRef = (id: string) => ({
    tipo: "sessao_de_treino",
    id,
    rota: `/treinos/historico/${id}`,
  });

  it("com refs 1:1, o corte da lista corta as refs junto", async () => {
    respostaDaFerramenta = async () => saidaCom(5);

    const saida = (await executeTool(ctx, chamada())).block.content as ToolOutput;

    expect(saida.itens).toHaveLength(2);
    expect(saida.refs).toEqual([umaRef("s1"), umaRef("s2")]);
  });

  /**
   * A forma do `get_last_workout`: 1 ref (a sessão) e N itens (os exercícios). Aqui o
   * orçamento derruba a lista até ZERO — e é exatamente aí que fatiar por posição apagaria o
   * ÚNICO link do "Ver dados usados", enquanto os agregados daquele treino continuam sendo
   * relatados. O usuário perderia a conferência do número que a IA acabou de dizer.
   */
  it("a ref única SOBREVIVE mesmo quando a lista é cortada até zero", async () => {
    respostaDaFerramenta = async () => ({
      ...saidaCom(5),
      itens: Array.from({ length: 5 }, (_, i) => ({ n: i + 1, texto: "x".repeat(9000) })),
      refs: [umaRef("s1")],
    });

    const saida = (await executeTool(ctx, chamada())).block.content as ToolOutput;

    expect(saida.itens).toEqual([]);
    expect(saida.refs).toEqual([umaRef("s1")]);
  });

  /**
   * A forma do `get_records`: `refs` é `recordes.filter(r => r.sessionId)`. Com 5 recordes e
   * 3 com sessão vinculada, o índice k de `refs` NÃO é o k de `itens` — um `slice(0, 2)`
   * guardaria duas refs que não correspondem aos dois itens mantidos, e o "Ver dados usados"
   * apontaria para a sessão errada.
   */
  it("refs em cardinalidade diferente da dos itens não é fatiada por posição", async () => {
    respostaDaFerramenta = async () => ({
      ...saidaCom(5),
      refs: [umaRef("r1"), umaRef("r3"), umaRef("r5")],
    });

    const saida = (await executeTool(ctx, chamada())).block.content as ToolOutput;

    expect(saida.itens).toHaveLength(2);
    expect(saida.refs).toEqual([umaRef("r1"), umaRef("r3"), umaRef("r5")]);
  });
});

describe("executeTool — orçamento de caracteres do bloco não confiável", () => {
  /** Cada item ocupa ~5 kB: dois já estouram os 8 000 caracteres do envelope. */
  const saidaGorda = (itens: number): ToolOutput => ({
    ...saidaCom(itens),
    itens: Array.from({ length: itens }, (_, i) => ({
      n: i + 1,
      texto: "x".repeat(5000),
    })),
  });

  /**
   * Antes, `wrapUntrusted` cortava a string serializada no meio de um token JSON: o modelo
   * recebia `truncated: true` e `completude: "exato"` ao mesmo tempo, e relatava o total de
   * um período cujos últimos registros ele nunca viu.
   */
  it("corta ANTES do envelope, e o envelope não precisa truncar nada", async () => {
    respostaDaFerramenta = async () => saidaGorda(2);

    const r = await executeTool(ctx, chamada());
    const saida = r.block.content as ToolOutput;

    expect(r.block.truncated).toBe(false);
    expect(JSON.stringify(saida).length).toBeLessThanOrEqual(MAX_UNTRUSTED_CHARS);
    expect(saida.itens.length).toBeLessThan(2);
  });

  it("o corte por tamanho é declarado com o motivo, nunca um total mudo", async () => {
    respostaDaFerramenta = async () => saidaGorda(2);

    const saida = (await executeTool(ctx, chamada())).block.content as ToolOutput;

    expect(saida.itens_truncados?.motivo).toContain("não coube no limite de tamanho");
    expect(saida.itens_truncados?.motivo).toContain("sessões de treino");
    // …e o TOTAL continua exato: os agregados vieram do período inteiro.
    expect(saida.completude).toBe("exato");
    expect(saida.agregados).toEqual({ volume_kg: 1080 });
  });

  /**
   * Quando o teto JÁ cortou (5 → 2) e o tamanho cortou de novo (2 → 0/1), atribuir todo o
   * corte ao tamanho sugere que a ferramenta devolveria as 5 numa resposta menor. O teto do
   * descriptor a impediria de qualquer forma — a mensagem tem de nomear as duas causas.
   */
  it("quando teto E tamanho cortaram, a mensagem nomeia as DUAS causas", async () => {
    respostaDaFerramenta = async () => ({
      ...saidaCom(5),
      itens: Array.from({ length: 5 }, (_, i) => ({ n: i + 1, texto: "x".repeat(5000) })),
    });

    const saida = (await executeTool(ctx, chamada())).block.content as ToolOutput;

    expect(saida.itens_truncados?.de).toBe(5);
    expect(saida.itens_truncados?.motivo).toContain("teto da ferramenta é 2");
    expect(saida.itens_truncados?.motivo).toContain("não coube no limite de tamanho");
  });

  /**
   * ⚠️ O caso em que nem a saída SEM ITEM NENHUM cabe: a parte não-item (`agregados`,
   * `motivo_incompleto`) estoura sozinha. As três ferramentas de hoje não chegam perto, mas
   * uma quarta com `agregados` gordo reintroduziria o corte no meio do JSON — e o modelo
   * receberia um objeto mutilado achando que recebeu o resultado.
   *
   * Aqui `completude` vira "parcial" com razão: os agregados também caíram.
   */
  it("se nem os agregados couberem, o resultado é EXPLICITAMENTE recusado", async () => {
    respostaDaFerramenta = async () => ({
      ...saidaCom(3),
      agregados: { volume_kg: 1080, detalhe: "y".repeat(9000) },
    });

    const r = await executeTool(ctx, chamada());
    const saida = r.block.content as ToolOutput;

    expect(r.block.truncated).toBe(false);
    expect(JSON.stringify(saida).length).toBeLessThanOrEqual(MAX_UNTRUSTED_CHARS);
    expect(saida.itens).toEqual([]);
    expect(saida.agregados).toEqual({});
    expect(saida.completude).toBe("parcial");
    expect(saida.motivo_incompleto).toContain("grande demais");
    expect(saida.itens_truncados).toMatchObject({ mostrando: 0, de: 3 });
    // E nenhum pedaço do agregado gigante vaza cortado ao meio.
    expect(JSON.stringify(saida)).not.toContain("yyyy");
  });

  it("saída que cabe no envelope não é tocada pelo orçamento", async () => {
    respostaDaFerramenta = async () => saidaCom(2);

    const saida = (await executeTool(ctx, chamada())).block.content as ToolOutput;

    expect(saida.itens).toHaveLength(2);
    expect(saida.itens_truncados).toBeUndefined();
    expect(saida.motivo_incompleto).toBeUndefined();
  });
});

describe("executeTool — falha e timeout", () => {
  it("ferramenta que estoura o tempo vira TOOL_TIMEOUT, não resposta vazia", async () => {
    respostaDaFerramenta = () => new Promise(() => {});

    const r = await executeTool(ctx, chamada());

    expect(r.isError).toBe(true);
    expect((r.block.content as { erro: string }).erro).toBe("TOOL_TIMEOUT");
    expect(auditadas[0]).toMatchObject({ status: "timeout", rejectionReason: "TOOL_TIMEOUT" });
  });

  it("erro da query não vaza detalhe interno para o modelo", async () => {
    respostaDaFerramenta = async () => {
      throw new Error('relation "training_sessions" does not exist — user_id 42');
    };

    const r = await executeTool(ctx, chamada());

    expect(r.isError).toBe(true);
    expect((r.block.content as { erro: string }).erro).toBe("TOOL_FAILED");
    expect(JSON.stringify(r.block)).not.toContain("training_sessions");
    expect(JSON.stringify(r.block)).not.toContain("user_id");
    expect(auditadas[0]).toMatchObject({ status: "falhou", rejectionReason: "TOOL_FAILED" });
  });

  /**
   * ⚠️ O QUE ESTE TESTE COBRE, E O QUE ELE NÃO COBRE.
   *
   * `supabase-js` NÃO LANÇA em erro de banco — devolve `{ error }`. Esse caminho é tratado
   * (e logado) dentro de `audit.ts`, e quem o exercita é `audit.test.ts`. O que ainda pode
   * LANÇAR antes da query é `createClient()`, que abre os cookies da requisição: é esse
   * cenário que o mock reproduz aqui.
   */
  it("exceção ANTES da query de auditoria não derruba a resposta do usuário", async () => {
    auditoriaFalha = true;

    const r = await executeTool(ctx, chamada());

    expect(r.isError).toBe(false);
    expect(r.recordsRead).toBe(1);
  });
});

describe("executeTool — a rejeição não é um oráculo do registry", () => {
  /**
   * "Não existe" e "existe, mas não é deste agente" com códigos ou textos distintos deixam o
   * modelo mapear o registry por sondagem: 20 chamadas, 20 respostas, e ele sabe quais
   * ferramentas os outros agentes têm. O motivo VERDADEIRO continua inteiro na auditoria.
   */
  it("nome inexistente e nome fora da allowlist devolvem a MESMA coisa ao modelo", async () => {
    const desconhecida = await executeTool(ctx, {
      callId: "c1",
      toolName: "finance.get_saldo",
      input: {},
    });
    const proibida = await executeTool(
      { ...ctx, agent: { id: "treinos", allowedTools: [] } },
      chamada(),
    );

    expect(desconhecida.block.content).toEqual(proibida.block.content);
    expect((desconhecida.block.content as { erro: string }).erro).toBe("TOOL_INDISPONIVEL");

    // …e a auditoria continua sabendo a diferença.
    expect(auditadas[0]).toMatchObject({ rejectionReason: "TOOL_UNKNOWN" });
    expect(auditadas[1]).toMatchObject({ rejectionReason: "TOOL_NOT_ALLOWED_FOR_AGENT" });
  });
});
