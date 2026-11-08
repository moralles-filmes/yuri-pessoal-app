/**
 * MOD-ia-005 — o prazo global da requisição, em aritmética pura.
 *
 * A função da Vercel morre aos 60 s (`maxDuration`), e quando ela morre o `finally` não roda:
 * run e tentativa ficam presos até a lease. Estas regras são o que garante que quem encerra
 * somos nós, com o estado consistente.
 */
import { describe, expect, it } from "vitest";
import {
  AI_DEADLINE,
  criarPrazo,
  PISO_POR_CHAMADA_MS,
  PRAZO_DA_REQUISICAO_MS,
  restanteMs,
  timeoutDaChamada,
} from "./prazo";

describe("prazo da requisição", () => {
  it("os números são os declarados", () => {
    expect(PRAZO_DA_REQUISICAO_MS).toBe(55_000);
    expect(PISO_POR_CHAMADA_MS).toBe(5_000);
    expect(AI_DEADLINE).toBe("AI_DEADLINE");
  });

  it("a chamada recebe o MENOR entre o timeout configurado e o que resta", () => {
    expect(timeoutDaChamada(criarPrazo(0), 0, 60_000)).toBe(55_000);
  });

  it("com folga, vale o timeout configurado", () => {
    expect(timeoutDaChamada(criarPrazo(0), 10_000, 30_000)).toBe(30_000);
  });

  it("abaixo do piso não há chamada: devolve null", () => {
    expect(timeoutDaChamada(criarPrazo(0), 51_000, 60_000)).toBeNull();
  });

  it("exatamente no piso ainda cabe uma chamada", () => {
    expect(timeoutDaChamada(criarPrazo(0), 50_000, 60_000)).toBe(5_000);
  });

  it("o restante nunca é negativo", () => {
    expect(restanteMs(criarPrazo(0), 70_000)).toBe(0);
  });

  it("a duração é injetável, e o início conta a partir do relógio de quem chamou", () => {
    const prazo = criarPrazo(1_000, 10_000);
    expect(prazo.fimMs).toBe(11_000);
    expect(restanteMs(prazo, 4_000)).toBe(7_000);
  });
});
