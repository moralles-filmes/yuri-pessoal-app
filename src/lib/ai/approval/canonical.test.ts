/**
 * Fase 18-C · Bloco 3 — IA · A serialização canônica.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ OS VETORES SÃO ESCRITOS À MÃO, E É O QUE FAZ ESTE ARQUIVO PROVAR ALGUMA COISA.        ║
 * ║                                                                                       ║
 * ║ Um teste que chamasse `canonicalizar` para montar o esperado espelharia a              ║
 * ║ implementação: ele continuaria verde depois de qualquer mudança na regra, inclusive a  ║
 * ║ que fizesse dois efeitos DIFERENTES colidirem no mesmo hash. Aqui a string canônica é  ║
 * ║ digitada, e o sha256 é calculado sobre ELA, com `node:crypto` direto — a implementação ║
 * ║ tem de chegar ao mesmo lugar por conta própria.                                        ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  canonicalizar,
  ErroDeCanonicalizacao,
  hashDoEfeito,
  serializarEfeito,
  VERSAO_CANONICA,
  type EfeitoDaProposta,
} from "./canonical";

describe("canonicalizar — vetores escritos à mão", () => {
  it("ordena as chaves de objeto, em qualquer profundidade", () => {
    expect(canonicalizar({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    expect(canonicalizar({ z: { y: 1, x: 2 }, a: 3 })).toBe('{"a":3,"z":{"x":2,"y":1}}');
  });

  /**
   * A ordem de inserção de um objeto JS não é o efeito, e o `jsonb` do Postgres devolve numa
   * ordem que não é a de escrita. Duas montagens do MESMO efeito têm de dar a mesma string —
   * senão a revalidação recusaria propostas legítimas todas as vezes.
   */
  it("a ordem de escrita do objeto não muda a saída", () => {
    expect(canonicalizar({ valor: 12000, conta: "x", data: "2026-08-07" })).toBe(
      canonicalizar({ data: "2026-08-07", conta: "x", valor: 12000 }),
    );
  });

  /**
   * ⛔ ARRAY NÃO É ORDENADO. A ordem das alternativas de substituição é a prioridade DO
   * USUÁRIO (invariante 16 da Dieta), e a ordem dos itens de uma ação em massa é a que ele
   * leu na tela. Ordenar aqui faria duas listas diferentes virarem a mesma proposta.
   */
  it("preserva a ordem dos arrays", () => {
    expect(canonicalizar([3, 1, 2])).toBe("[3,1,2]");
    expect(canonicalizar([3, 1, 2])).not.toBe(canonicalizar([1, 2, 3]));
  });

  it("campo undefined em objeto é campo ausente", () => {
    expect(canonicalizar({ a: undefined, b: 1 })).toBe('{"b":1}');
    expect(canonicalizar({ a: undefined, b: 1 })).toBe(canonicalizar({ b: 1 }));
  });

  // ...mas `null` NÃO é ausência: "campo apagado" e "campo não mexido" são efeitos distintos.
  it("null é diferente de ausente", () => {
    expect(canonicalizar({ a: null })).toBe('{"a":null}');
    expect(canonicalizar({ a: null })).not.toBe(canonicalizar({}));
  });

  it("-0 e 0 dão a mesma saída", () => {
    expect(canonicalizar(-0)).toBe("0");
    expect(canonicalizar({ centavos: -0 })).toBe(canonicalizar({ centavos: 0 }));
  });

  /**
   * "café" com acento composto (U+00E9) e com acento combinante (e + U+0301) são O MESMO
   * TEXTO. O Postgres guarda os bytes que recebeu, sem normalizar; sem NFC aqui, o recálculo
   * recusaria uma proposta idêntica — e a recusa seria inexplicável para quem comparasse os
   * dois textos na tela.
   */
  it("normaliza string em NFC — mesmo texto, mesma saída", () => {
    // ⚠️ A PRIMEIRA ASSERÇÃO EXISTE PARA PROTEGER AS OUTRAS DUAS. As strings abaixo são
    // bytes diferentes que se leem igual; se um editor, um lint ou uma configuração de
    // repositório normalizar o arquivo, elas viram a mesma coisa e o teste passaria a
    // comparar a string consigo mesma — verde permanente sobre uma regra que teria deixado
    // de existir. Ela falha alto nesse caso, que é o único jeito de descobrir.
    const composto = "café";        // é
    const combinante = "café";     // e + acento combinante
    expect(composto).not.toBe(combinante);
    expect(canonicalizar(composto)).toBe(canonicalizar(combinante));
  });

  it("normaliza tambem a CHAVE, nao so o valor", () => {
    expect(canonicalizar({ ["café"]: 1 })).toBe(canonicalizar({ ["café"]: 1 }));
  });

  it.each([
    ["NaN", NaN],
    ["Infinity", Infinity],
    ["Date", new Date("2026-08-07T12:00:00Z")],
    // `BigInt(10)` e não `10n`: o literal exige target ES2020+, e o do projeto é menor.
    ["BigInt", BigInt(10)],
    ["função", () => 1],
    ["Map", new Map()],
    ["undefined solto", undefined],
  ])("recusa %s em vez de convertê-lo em silêncio", (_nome, valor) => {
    expect(() => canonicalizar(valor)).toThrow();
  });

  /**
   * `JSON.stringify(NaN)` devolve `"null"` — um valor que não existe viraria um valor que
   * existe, e o hash não acusaria nada. Este teste é o que separa a nossa função dele.
   */
  it("onde o JSON.stringify converteria, nós recusamos", () => {
    expect(JSON.stringify({ a: NaN })).toBe('{"a":null}');
    expect(() => canonicalizar({ a: NaN })).toThrow(ErroDeCanonicalizacao);
  });

  it("undefined dentro de array é erro — posição sem valor não tem representação honesta", () => {
    expect(() => canonicalizar([1, undefined, 3])).toThrow(ErroDeCanonicalizacao);
  });

  it("o erro aponta o CAMINHO, para o defeito ser achável", () => {
    try {
      canonicalizar({ previsao: { linhas: [{ valor: NaN }] } });
      expect.unreachable("deveria ter lançado");
    } catch (e) {
      expect((e as ErroDeCanonicalizacao).caminho).toBe("$.previsao.linhas[0].valor");
    }
  });
});

describe("hashDoEfeito", () => {
  const EFEITO: EfeitoDaProposta = {
    tool: "todo.criar_tarefa",
    toolVersion: "1",
    command: "criarTarefaTodo",
    payload: { titulo: "Comprar pão", data: "2026-08-08" },
    entidades: [{ tipo: "todo_project", id: "p-1" }],
    previsao: { resumo: "Criar a tarefa", ressalvas: [] },
  };

  /**
   * ⛔ A STRING ABAIXO É DIGITADA, NÃO GERADA. Ela é o contrato: chaves ordenadas, sem
   * espaço, prefixo de versão numa linha própria.
   */
  const CANONICA_ESCRITA_A_MAO =
    "ia-efeito-v1\n" +
    "{" +
    '"command":"criarTarefaTodo",' +
    '"entidades":[{"id":"p-1","tipo":"todo_project"}],' +
    '"payload":{"data":"2026-08-08","titulo":"Comprar pão"},' +
    '"previsao":{"ressalvas":[],"resumo":"Criar a tarefa"},' +
    '"tool":"todo.criar_tarefa",' +
    '"toolVersion":"1"' +
    "}";

  it("serializa exatamente a string escrita à mão", () => {
    expect(serializarEfeito(EFEITO)).toBe(CANONICA_ESCRITA_A_MAO);
  });

  it("o hash é o sha256 DAQUELA string", () => {
    const esperado = createHash("sha256")
      .update(CANONICA_ESCRITA_A_MAO, "utf8")
      .digest("hex");
    expect(hashDoEfeito(EFEITO)).toBe(esperado);
  });

  it("o hash tem o formato que o CHECK do banco exige", () => {
    expect(hashDoEfeito(EFEITO)).toMatch(/^[0-9a-f]{64}$/);
  });

  /**
   * ⛔ O CASO QUE DÁ NOME À DECISÃO §3.4: os ARGUMENTOS são idênticos e a PREVISÃO mudou.
   * Um hash sobre os argumentos daria o mesmo valor nos dois, e a confirmação de ontem
   * aplicaria o efeito de hoje.
   */
  it("mesma entrada + previsão diferente = hash diferente", () => {
    const outraPrevisao: EfeitoDaProposta = {
      ...EFEITO,
      previsao: { resumo: "Criar a tarefa", ressalvas: ["cai na fatura de setembro"] },
    };
    expect(hashDoEfeito(outraPrevisao)).not.toBe(hashDoEfeito(EFEITO));
  });

  // E o outro lado do mesmo argumento: a entidade resolvida entra no hash. "A tarefa do
  // mercado" apontando para outro registro é OUTRA proposta, com o mesmo texto de pedido.
  it("mesma previsão + entidade resolvida diferente = hash diferente", () => {
    const outraEntidade: EfeitoDaProposta = {
      ...EFEITO,
      entidades: [{ tipo: "todo_project", id: "p-2" }],
    };
    expect(hashDoEfeito(outraEntidade)).not.toBe(hashDoEfeito(EFEITO));
  });

  it("versão da ferramenta entra no hash", () => {
    expect(hashDoEfeito({ ...EFEITO, toolVersion: "2" })).not.toBe(hashDoEfeito(EFEITO));
  });

  /**
   * O prefixo existe para que uma mudança futura na regra de canonicalização INVALIDE os
   * hashes antigos em vez de arriscar colidir com eles. Se ele sumir, o pior caso deixa de
   * ser "proposta velha recusada" e passa a ser "proposta velha aceita com outro efeito".
   */
  it("a string hasheada começa pelo prefixo de versão, em linha própria", () => {
    expect(serializarEfeito(EFEITO).startsWith(`${VERSAO_CANONICA}\n`)).toBe(true);
  });
});
