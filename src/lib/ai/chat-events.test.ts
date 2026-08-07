/**
 * Fase 18-B — IA · O ELO entre o que o runner EMITE e o que a tela TRATA.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ESTE TESTE EXISTE POR CAUSA DE UM DEFEITO REAL DESTA BRANCH.                           ║
 * ║                                                                                       ║
 * ║ A Task 10 acrescentou o evento `tool` ao `ChatRunnerEvent`, o Route Handler passou a   ║
 * ║ encaminhá-lo verbatim… e o `switch` de `chat-client.tsx` não tinha `case` para ele nem ║
 * ║ `default`. Resultado: toda leitura de dado do usuário chegava à tela e era DESCARTADA  ║
 * ║ em silêncio, por duas tasks inteiras. Nada ficou vermelho — o servidor tinha teste, o  ║
 * ║ transporte tinha teste, e o elo entre eles não tinha ninguém.                          ║
 * ║                                                                                       ║
 * ║ É a mesma lição da Task 11 ("cobrir as duas pontas não cobre o elo"), aplicada à       ║
 * ║ fronteira que o projeto não consegue testar com componente: `vitest` roda em ambiente  ║
 * ║ `node` e não há um único `.test.tsx` no repositório. Enquanto for assim, o contrato    ║
 * ║ dos eventos é verificado no CÓDIGO-FONTE — que é fraco, e é melhor que nada.           ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = path.resolve(__dirname, "..", "..");

const runner = fs.readFileSync(
  path.join(SRC, "lib", "ai", "server", "chat-runner.ts"),
  "utf8",
);
const tela = fs.readFileSync(
  path.join(SRC, "components", "ai", "chat-client.tsx"),
  "utf8",
);

/** O bloco da união `ChatRunnerEvent`, do `export type` até o `export type` seguinte. */
function blocoDoTipo(codigo: string, nome: string): string {
  const inicio = codigo.indexOf(`export type ${nome} =`);
  expect(inicio, `não achei \`export type ${nome}\``).toBeGreaterThan(-1);
  const resto = codigo.slice(inicio + 1);
  const fim = resto.indexOf("\nexport type ");
  return fim === -1 ? resto : resto.slice(0, fim);
}

const emitidos = new Set(
  [...blocoDoTipo(runner, "ChatRunnerEvent").matchAll(/readonly type:\s*"([a-z-]+)"/g)].map(
    (m) => m[1],
  ),
);

const tratados = new Set(
  [...tela.matchAll(/\n\s*case "([a-z-]+)":/g)].map((m) => m[1]),
);

describe("todo evento do runner é tratado pela tela do chat", () => {
  it("a leitura dos dois arquivos encontrou eventos de verdade", () => {
    // Sem isto, um `matchAll` que deixasse de casar transformaria o teste em tautologia:
    // dois conjuntos vazios são iguais.
    expect(emitidos.size).toBeGreaterThanOrEqual(5);
    expect(emitidos.has("tool")).toBe(true);
    expect(tratados.size).toBeGreaterThanOrEqual(5);
  });

  it("nenhum evento emitido é ignorado em silêncio", () => {
    const ignorados = [...emitidos].filter((e) => !tratados.has(e)).sort();
    expect(ignorados).toEqual([]);
  });

  it("a tela não trata evento que o runner nunca emite", () => {
    const inventados = [...tratados].filter((e) => !emitidos.has(e)).sort();
    expect(inventados).toEqual([]);
  });
});
