/**
 * Fase 18-B — IA · `getRunSources`: a trilha que a tela lê.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ O QUE ESTE ARQUIVO GUARDA                                                             ║
 * ║                                                                                       ║
 * ║  • UMA consulta para TODAS as execuções da conversa — a assinatura por lista existe   ║
 * ║    para não virar N+1 na tela que mais tem runs.                                       ║
 * ║  • `ai_run_steps` NÃO é consultada. Passo `started` sob run terminal é resíduo de      ║
 * ║    processo morto (`ai_reconcile_abandoned_runs` não toca essa tabela); lê-lo como     ║
 * ║    "em andamento" mostraria execuções eternas. Quem responde isso é o status do RUN.   ║
 * ║  • colunas EXPLÍCITAS, nunca `select('*')` — a disciplina de todo `queries.ts` daqui.  ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

type Linha = Record<string, unknown>;

let linhas: Linha[] = [];
const tabelasConsultadas: string[] = [];
const colunasPedidas: string[] = [];
const filtros: { coluna: string; valor: unknown }[] = [];
/** Filtros de exclusão (`.neq`). O mock os APLICA, como o banco faria. */
const exclusoes: { coluna: string; valor: unknown }[] = [];
let tetoPedido: number | null = null;

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (tabela: string) => {
      tabelasConsultadas.push(tabela);
      const encadeado = {
        select: (colunas: string) => {
          colunasPedidas.push(colunas);
          return encadeado;
        },
        eq: (coluna: string, valor: unknown) => {
          filtros.push({ coluna, valor });
          return encadeado;
        },
        in: (coluna: string, valor: unknown) => {
          filtros.push({ coluna, valor });
          return encadeado;
        },
        neq: (coluna: string, valor: unknown) => {
          exclusoes.push({ coluna, valor });
          return encadeado;
        },
        order: () => encadeado,
        limit: (n: number) => {
          tetoPedido = n;
          const restantes = linhas.filter((l) =>
            exclusoes.every(({ coluna, valor }) => l[coluna] !== valor),
          );
          return Promise.resolve({ data: restantes, error: null });
        },
      };
      return encadeado;
    },
  }),
}));

const { getRunSources } = await import("./queries");
const { TOOL_NAME_ACIONAMENTO } = await import("./agents/especialistas");

const LINHA_BASE: Linha = {
  run_id: "run-1",
  tool_name: "training.get_volume",
  tool_version: "1",
  status: "executada",
  rejection_reason: null,
  records_read: 3,
  duration_ms: 42,
  refs: [{ tipo: "sessao_de_treino", id: "s1", rota: "/treinos/historico/s1" }],
  arguments_sanitized: { dias: 7 },
  created_at: "2026-08-06T18:00:00.000Z",
};

beforeEach(() => {
  linhas = [];
  tabelasConsultadas.length = 0;
  colunasPedidas.length = 0;
  filtros.length = 0;
  exclusoes.length = 0;
  tetoPedido = null;
});

describe("getRunSources", () => {
  it("sem execução nenhuma, NÃO consulta o banco", async () => {
    const r = await getRunSources("user-1", []);
    expect(r).toEqual({});
    expect(tabelasConsultadas).toEqual([]);
  });

  it("uma consulta só, em `ai_tool_calls` — e em mais nenhuma tabela", async () => {
    linhas = [LINHA_BASE];
    await getRunSources("user-1", ["run-1", "run-2", "run-3"]);

    expect(tabelasConsultadas).toEqual(["ai_tool_calls"]);
    expect(tabelasConsultadas).not.toContain("ai_run_steps");
  });

  it("colunas EXPLÍCITAS, nunca `*`", async () => {
    linhas = [LINHA_BASE];
    await getRunSources("user-1", ["run-1"]);

    const colunas = colunasPedidas[0] ?? "";
    expect(colunas).not.toContain("*");
    for (const coluna of [
      "run_id",
      "tool_name",
      "tool_version",
      "status",
      "rejection_reason",
      "records_read",
      "duration_ms",
      "refs",
      "arguments_sanitized",
      "created_at",
    ]) {
      expect(colunas, coluna).toContain(coluna);
    }
  });

  it("filtra por `user_id` E pelos runs pedidos, com teto", async () => {
    linhas = [LINHA_BASE];
    await getRunSources("user-1", ["run-1", "run-2"]);

    expect(filtros).toContainEqual({ coluna: "user_id", valor: "user-1" });
    expect(filtros).toContainEqual({ coluna: "run_id", valor: ["run-1", "run-2"] });
    expect(tetoPedido).toBeGreaterThan(0);
  });

  it("agrupa por execução, preservando a ordem das chamadas", async () => {
    linhas = [
      { ...LINHA_BASE, run_id: "run-1", tool_name: "training.get_volume" },
      { ...LINHA_BASE, run_id: "run-2", tool_name: "training.get_records" },
      { ...LINHA_BASE, run_id: "run-1", tool_name: "training.get_last_workout" },
    ];

    const r = await getRunSources("user-1", ["run-1", "run-2"]);

    expect(Object.keys(r).sort()).toEqual(["run-1", "run-2"]);
    expect(r["run-1"].chamadas.map((c) => c.toolName)).toEqual([
      "training.get_volume",
      "training.get_last_workout",
    ]);
    expect(r["run-2"].chamadas).toHaveLength(1);
  });

  it("`records_read` nulo continua NULO — rejeição não leu zero registros", async () => {
    linhas = [
      {
        ...LINHA_BASE,
        status: "rejeitada",
        rejection_reason: "TOOL_PERMISSION_DENIED",
        records_read: null,
        refs: [],
        tool_version: "-",
      },
    ];

    const r = await getRunSources("user-1", ["run-1"]);
    const chamada = r["run-1"].chamadas[0];

    expect(chamada.recordsRead).toBeNull();
    expect(chamada.rejectionReason).toBe("TOOL_PERMISSION_DENIED");
    // O marcador chega CRU do banco; quem decide não exibi-lo é `versaoVisivel`, na tela.
    expect(chamada.toolVersion).toBe("-");
  });

  it("`refs` malformado vindo do jsonb não vira link", async () => {
    linhas = [
      {
        ...LINHA_BASE,
        refs: [
          { tipo: "x", id: "1", rota: "https://exemplo.com/roubo" },
          { tipo: "sessao_de_treino", id: "s1", rota: "/treinos/historico/s1" },
          "lixo",
        ],
      },
    ];

    const r = await getRunSources("user-1", ["run-1"]);

    expect(r["run-1"].chamadas[0].refs).toEqual([
      { tipo: "sessao_de_treino", id: "s1", rota: "/treinos/historico/s1" },
    ]);
  });

  it("os argumentos pedidos chegam achatados para a tela", async () => {
    linhas = [{ ...LINHA_BASE, arguments_sanitized: { dias: 30 } }];

    const r = await getRunSources("user-1", ["run-1"]);

    expect(r["run-1"].chamadas[0].argumentos).toEqual([{ chave: "dias", valor: "30" }]);
  });

  it("banco sem linha nenhuma devolve mapa vazio — não inventa execução", async () => {
    linhas = [];
    expect(await getRunSources("user-1", ["run-1"])).toEqual({});
  });

  /**
   * O acionamento de um especialista é auditado em `ai_tool_calls` (é o PEDIDO do coordenador),
   * mas não leu dado nenhum: mostrá-lo em "Ver dados usados" faria a tela listar como fonte uma
   * chamada que não consultou registro algum.
   */
  it("não devolve as linhas de acionamento como fonte", async () => {
    linhas = [
      {
        ...LINHA_BASE,
        tool_name: TOOL_NAME_ACIONAMENTO,
        tool_version: "v1",
        records_read: null,
        refs: [],
        arguments_sanitized: { especialista: "treinos", tarefa: "volume da semana" },
      },
      { ...LINHA_BASE, tool_name: "training.get_volume" },
    ];

    const r = await getRunSources("user-1", ["run-1"]);

    expect(r["run-1"].chamadas.map((c) => c.toolName)).toEqual(["training.get_volume"]);
  });

  it("run que só teve acionamento não aparece com fonte nenhuma", async () => {
    linhas = [{ ...LINHA_BASE, tool_name: TOOL_NAME_ACIONAMENTO, refs: [] }];

    expect(await getRunSources("user-1", ["run-1"])).toEqual({});
  });
});
