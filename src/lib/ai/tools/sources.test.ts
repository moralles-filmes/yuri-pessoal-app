/**
 * Fase 18-B — IA · A trilha que a tela mostra.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ AS TRÊS PERGUNTAS DESTE ARQUIVO                                                       ║
 * ║                                                                                       ║
 * ║  1. Um `refs` malformado no jsonb pode virar `href`? (a coluna é livre e imutável)    ║
 * ║  2. Zero e ausência continuam distintos depois de agregados?                          ║
 * ║  3. A tela sabe distinguir MARCADOR (`tool_version = "-"`) de dado?                   ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */

import { describe, expect, it } from "vitest";
import {
  execucaoEmAndamento,
  MAX_ARGUMENTO_CHARS,
  parseArgumentos,
  parseRefs,
  resumirFontes,
  versaoVisivel,
  type ToolCallRecord,
} from "./sources";

const CHAMADA_BASE: ToolCallRecord = {
  toolName: "training.get_volume",
  toolVersion: "1",
  status: "executada",
  rejectionReason: null,
  recordsRead: 0,
  durationMs: 12,
  refs: [],
  argumentos: [],
  createdAt: "2026-08-07T12:00:00.000Z",
};

const chamada = (patch: Partial<ToolCallRecord>): ToolCallRecord => ({
  ...CHAMADA_BASE,
  ...patch,
});

// ─────────────────────────── refs → href ───────────────────────────

describe("parseRefs — o único campo desta tela que vira navegação", () => {
  it("aceita a referência bem formada, com rota interna", () => {
    expect(
      parseRefs([
        { tipo: "sessao_de_treino", id: "abc", rota: "/treinos/historico/abc" },
      ]),
    ).toEqual([{ tipo: "sessao_de_treino", id: "abc", rota: "/treinos/historico/abc" }]);
  });

  /**
   * A coluna é `jsonb` livre e a tabela é IMUTÁVEL: uma linha gravada com rota externa (por
   * um adapter futuro, ou por um `refs` montado errado) viraria link para fora do sistema a
   * cada leitura, para sempre. `//` é o caso traiçoeiro — o navegador o trata como
   * protocolo-relativo e sai do domínio, mesmo começando com barra.
   */
  const ROTAS_RECUSADAS = [
    "https://exemplo.com/roubo",
    "//exemplo.com/roubo",
    "javascript:alert(1)",
    "data:text/html,<script>",
    "treinos/historico/abc",
    "",
    "  /treinos",
    // ⚠️ Os quatro abaixo COMEÇAM com uma barra só e passariam por qualquer checagem de
    // prefixo — e o parser de URL os resolve para fora do domínio do mesmo jeito. Ver a
    // tabela no teste seguinte, que é onde isso está provado em vez de afirmado.
    "/\\exemplo.com/roubo",
    "/\t/exemplo.com/roubo",
    "/\r\n/exemplo.com/roubo",
    "/treinos\\..\\exemplo.com",
  ];

  for (const rota of ROTAS_RECUSADAS) {
    it(`descarta a referência com rota ${JSON.stringify(rota)}`, () => {
      expect(parseRefs([{ tipo: "sessao_de_treino", id: "abc", rota }])).toEqual([]);
    });
  }

  /**
   * ⚠️ ESTE TESTE NÃO CONFIA NA NOSSA LEITURA DA ESPECIFICAÇÃO — ele PERGUNTA AO PARSER.
   *
   * A trava anterior recusava `//` e deixava passar `/\`, porque "começa com uma barra só"
   * parece seguro. O parser de URL discorda: os dois caem no mesmo estado e saem do domínio.
   * Enumerar as formas ruins é uma corrida que se perde, então o que se afirma aqui é o
   * critério positivo — quem sai do domínio é recusado, e quem fica é aceito.
   */
  it("nenhuma rota aceita resolve para fora do domínio (perguntado ao parser de URL)", () => {
    const BASE = "https://app.exemplo.com.br";
    const CANDIDATAS = [
      "/treinos/historico/abc",
      "/treinos/recordes",
      "//exemplo.com/roubo",
      "/\\exemplo.com/roubo",
      "/\t/exemplo.com/roubo",
      "/\r\n/exemplo.com/roubo",
      "/treinos\\..\\exemplo.com",
      "https://exemplo.com/roubo",
    ];

    for (const rota of CANDIDATAS) {
      const aceita =
        parseRefs([{ tipo: "sessao_de_treino", id: "abc", rota }]).length === 1;
      const saiDoDominio = new URL(rota, BASE).origin !== BASE;

      // A implicação que importa: aceita ⇒ não sai do domínio.
      expect(aceita && saiDoDominio, `${JSON.stringify(rota)} aceita e saindo`).toBe(false);
    }

    // E a contraprova de que o teste não passa por vacuidade: alguma É aceita.
    expect(
      CANDIDATAS.filter(
        (rota) => parseRefs([{ tipo: "s", id: "a", rota }]).length === 1,
      ),
    ).toEqual(["/treinos/historico/abc", "/treinos/recordes"]);
  });

  it("descarta o que não tem a forma de referência, sem derrubar o resto", () => {
    const entrada = [
      null,
      "texto solto",
      42,
      { tipo: "x" },
      { tipo: "x", id: "y" },
      { tipo: "x", id: "", rota: "/treinos" },
      { tipo: "", id: "y", rota: "/treinos" },
      { tipo: "sessao_de_treino", id: "ok", rota: "/treinos/historico/ok" },
    ];
    expect(parseRefs(entrada)).toEqual([
      { tipo: "sessao_de_treino", id: "ok", rota: "/treinos/historico/ok" },
    ]);
  });

  it("jsonb que não é vetor devolve lista vazia — nunca lança", () => {
    for (const valor of [null, undefined, {}, "", 0, { refs: [] }]) {
      expect(parseRefs(valor)).toEqual([]);
    }
  });
});

// ─────────────────────────── argumentos ───────────────────────────

describe("parseArgumentos — o que o MODELO pediu", () => {
  it("achata os primitivos em pares legíveis", () => {
    expect(parseArgumentos({ dias: 30, exercicio: "supino" })).toEqual([
      { chave: "dias", valor: "30" },
      { chave: "exercicio", valor: "supino" },
    ]);
  });

  it("corta valor longo — o texto veio do modelo e pode ser lixo", () => {
    const [par] = parseArgumentos({ exercicio: "a".repeat(500) });
    // 60 caracteres + a reticência.
    expect(par.valor).toHaveLength(MAX_ARGUMENTO_CHARS + 1);
    expect(par.valor.endsWith("…")).toBe(true);
  });

  it("objeto e vetor aninhados não são exibidos", () => {
    expect(parseArgumentos({ filtro: { a: 1 }, lista: [1, 2], dias: 7 })).toEqual([
      { chave: "dias", valor: "7" },
    ]);
  });

  it("argumentos vazios (o caso de `get_last_workout`) não inventam linha", () => {
    expect(parseArgumentos({})).toEqual([]);
    expect(parseArgumentos(null)).toEqual([]);
    expect(parseArgumentos(["dias"])).toEqual([]);
  });
});

// ─────────────────────────── resumo ───────────────────────────

describe("resumirFontes — ausência não é zero", () => {
  it("nenhuma consulta executada: registros encontrados é `null`, não 0", () => {
    const r = resumirFontes([
      chamada({ status: "rejeitada", recordsRead: null }),
      chamada({ status: "timeout", recordsRead: null }),
    ]);
    expect(r.registrosEncontrados).toBeNull();
    expect(r.executadas).toBe(0);
    expect(r.semLeitura).toBe(2);
  });

  it("executada com contagem ZERO é zero medido — e continua sendo 0", () => {
    const r = resumirFontes([chamada({ status: "executada", recordsRead: 0 })]);
    expect(r.registrosEncontrados).toBe(0);
    expect(r.parcial).toBe(false);
  });

  // 12 + 3 = 15, escrito à mão.
  it("soma só as executadas", () => {
    const r = resumirFontes([
      chamada({ status: "executada", recordsRead: 12 }),
      chamada({ status: "executada", recordsRead: 3 }),
      chamada({ status: "falhou", recordsRead: null }),
    ]);
    expect(r.registrosEncontrados).toBe(15);
    expect(r.chamadas).toBe(3);
    expect(r.executadas).toBe(2);
    expect(r.semLeitura).toBe(1);
    expect(r.parcial).toBe(false);
  });

  it("executada SEM contagem torna o total parcial — e não some do total", () => {
    const r = resumirFontes([
      chamada({ status: "executada", recordsRead: 7 }),
      chamada({ status: "executada", recordsRead: null }),
    ]);
    expect(r.registrosEncontrados).toBe(7);
    expect(r.parcial).toBe(true);
  });

  it("lista vazia não inventa nada", () => {
    expect(resumirFontes([])).toEqual({
      chamadas: 0,
      executadas: 0,
      semLeitura: 0,
      registrosEncontrados: null,
      parcial: false,
    });
  });
});

// ─────────────────────────── "em andamento" ───────────────────────────

/**
 * ⚠️ ESTE É O TESTE QUE GUARDA A DECISÃO DO LEDGER: quem responde "ainda está rodando?" é o
 * STATUS DO RUN, nunca um passo `started`.
 *
 * Quando o processo morre (timeout da plataforma, deploy no meio do stream) o `finally` do
 * laço não roda e `ai_reconcile_abandoned_runs` não toca `ai_run_steps`: sobra passo aberto
 * sob run terminal. Uma tela que lesse o passo mostraria "consultando…" para sempre.
 */
describe("execucaoEmAndamento — quem manda é o RUN", () => {
  it("reserved e streaming ainda estão vivos", () => {
    expect(execucaoEmAndamento("reserved")).toBe(true);
    expect(execucaoEmAndamento("streaming")).toBe(true);
  });

  it("os três terminais terminaram, e nenhum passo aberto muda isso", () => {
    expect(execucaoEmAndamento("completed")).toBe(false);
    expect(execucaoEmAndamento("cancelled")).toBe(false);
    expect(execucaoEmAndamento("failed")).toBe(false);
  });
});

// ─────────────────────────── marcador ≠ versão ───────────────────────────

describe("versaoVisivel — `-` é MARCADOR, não versão", () => {
  it('a rejeição sem descriptor grava "-" e a tela não mostra "v-"', () => {
    expect(versaoVisivel("-")).toBeNull();
    expect(versaoVisivel("   ")).toBeNull();
    expect(versaoVisivel("")).toBeNull();
  });

  it("versão de verdade aparece", () => {
    expect(versaoVisivel("1")).toBe("1");
    expect(versaoVisivel(" 2 ")).toBe("2");
  });
});
