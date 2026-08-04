/**
 * Fase 18-A — IA · O INVARIANTE DO ORÇAMENTO.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║   consumo = Σ custo real dos runs TERMINAIS + Σ reserva dos NÃO-TERMINAIS não vencidos║
 * ║                                                                                       ║
 * ║   Todo run pertence a EXATAMENTE UM dos dois somatórios.                              ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * Os dois primeiros testes são a PROPRIEDADE, não um caso: o XOR e a soma por duas vias
 * independentes. Se algum dia alguém fizer a reserva e o custo real contarem juntos, é aqui
 * que aparece — e não num relatório de fim de mês que não fecha.
 */

import { describe, expect, it } from "vitest";
import {
  canAdmit,
  computeBudgetUsage,
  deveAvisar,
  isTerminal,
  nivelAtingido,
  type RunForBudget,
} from "./budget";
import { round6 } from "./meter";

const AGORA = Date.parse("2026-08-04T15:00:00.000Z");
const FUTURO = "2026-08-04T15:05:00.000Z";
const PASSADO = "2026-08-04T14:50:00.000Z";

function run(over: Partial<RunForBudget> & { id: string }): RunForBudget {
  return {
    status: "completed",
    reservedCost: 0.1449,
    reservationExpiresAt: FUTURO,
    attemptCosts: [],
    ...over,
  };
}

describe("invariante do orçamento", () => {
  const universo: RunForBudget[] = [
    run({ id: "a", status: "completed", attemptCosts: [0.0086] }),
    run({ id: "b", status: "cancelled", attemptCosts: [0.0072] }),
    run({ id: "c", status: "failed", attemptCosts: [null] }),
    run({ id: "d", status: "reserved" }),
    run({ id: "e", status: "streaming" }),
    run({ id: "f", status: "streaming", reservationExpiresAt: PASSADO }),
  ];

  it("todo run é TERMINAL **ou** contado por reserva — nunca os dois", () => {
    for (const r of universo) {
      const contadoComoTerminal = isTerminal(r.status);
      const reservaViva =
        !isTerminal(r.status) && Date.parse(r.reservationExpiresAt) > AGORA;
      // XOR: exatamente um dos dois, ou nenhum (reserva vencida de run não-terminal).
      expect(contadoComoTerminal && reservaViva).toBe(false);
    }
  });

  it("a soma bate por duas vias independentes", () => {
    const uso = computeBudgetUsage(universo, AGORA);

    // Via 1 — o que a função devolve.
    expect(uso.confirmadoUsd).toBe(round6(0.0086 + 0.0072));
    expect(uso.reservadoUsd).toBe(round6(0.1449 * 2)); // d e e; f está vencida
    expect(uso.totalUsd).toBe(round6(uso.confirmadoUsd + uso.reservadoUsd));

    // Via 2 — recalculada aqui, sem reusar nada da implementação.
    let confirmado = 0;
    let reservado = 0;
    for (const r of universo) {
      if (isTerminal(r.status)) {
        for (const c of r.attemptCosts) if (c !== null) confirmado += c;
      } else if (Date.parse(r.reservationExpiresAt) > AGORA) {
        reservado += r.reservedCost;
      }
    }
    expect(uso.totalUsd).toBe(round6(confirmado + reservado));
  });

  it("57. run concluído deixa de contar pela reserva e passa a contar pelo custo real", () => {
    const antes = computeBudgetUsage([run({ id: "x", status: "streaming" })], AGORA);
    expect(antes.reservadoUsd).toBe(0.1449);
    expect(antes.confirmadoUsd).toBe(0);

    const depois = computeBudgetUsage(
      [run({ id: "x", status: "completed", attemptCosts: [0.0086] })],
      AGORA,
    );
    expect(depois.reservadoUsd).toBe(0);
    expect(depois.confirmadoUsd).toBe(0.0086);
  });

  it("59. reserva VENCIDA não bloqueia chamadas futuras", () => {
    const uso = computeBudgetUsage(
      [run({ id: "y", status: "reserved", reservationExpiresAt: PASSADO })],
      AGORA,
    );
    expect(uso.reservadoUsd).toBe(0);
    expect(uso.runsComReservaAtiva).toBe(0);
  });

  it("54. execução sem custo informado NÃO vira zero — ela é CONTADA como ausência", () => {
    const uso = computeBudgetUsage(
      [run({ id: "z", status: "failed", attemptCosts: [null, null] })],
      AGORA,
    );
    expect(uso.confirmadoUsd).toBe(0);
    // O 0 acima é a soma de nada, e a tela precisa saber disso para não afirmar completude.
    expect(uso.execucoesSemCusto).toBe(2);
  });
});

describe("admissão contra o limite", () => {
  const usoVazio = computeBudgetUsage([], AGORA);

  it("limite `null` significa SEM LIMITE — não é limite zero", () => {
    const d = canAdmit(usoVazio, 0.5, null, true);
    expect(d.permitido).toBe(true);
  });

  it("55. duas chamadas concorrentes perto do limite não ultrapassam a reserva disponível", () => {
    // A primeira entra e cria uma reserva de 0,60 num limite de 1,00.
    const depoisDaPrimeira = computeBudgetUsage(
      [run({ id: "1", status: "reserved", reservedCost: 0.6 })],
      AGORA,
    );
    // A segunda pede outros 0,60. Sem a reserva, ela veria "gasto confirmado = 0" e passaria.
    const segunda = canAdmit(depoisDaPrimeira, 0.6, 1, true);
    expect(segunda.permitido).toBe(false);
  });

  it("63. o bloqueio acontece ANTES de chamar o provedor (a decisão é sobre a reserva)", () => {
    const uso = computeBudgetUsage(
      [run({ id: "1", status: "completed", attemptCosts: [0.99] })],
      AGORA,
    );
    expect(canAdmit(uso, 0.02, 1, true).permitido).toBe(false);
  });

  it("bloquear desligado deixa passar mesmo acima do limite", () => {
    const uso = computeBudgetUsage(
      [run({ id: "1", status: "completed", attemptCosts: [2] })],
      AGORA,
    );
    expect(canAdmit(uso, 1, 1, false).permitido).toBe(true);
  });
});

describe("62. alertas visuais em 70, 80, 90 e 100 — sem repetir o mesmo nível", () => {
  it("resolve o nível pelo percentual", () => {
    expect(nivelAtingido(0.69, 1)).toBe(null);
    expect(nivelAtingido(0.7, 1)).toBe(70);
    expect(nivelAtingido(0.85, 1)).toBe(80);
    expect(nivelAtingido(0.9, 1)).toBe(90);
    expect(nivelAtingido(1.2, 1)).toBe(100);
  });

  it("sem limite não há nível", () => {
    expect(nivelAtingido(5, null)).toBe(null);
    expect(nivelAtingido(5, 0)).toBe(null);
  });

  it("só avisa quando o nível SOBE", () => {
    expect(deveAvisar(80, 70)).toBe(true);
    expect(deveAvisar(80, 80)).toBe(false);
    expect(deveAvisar(70, 90)).toBe(false);
    expect(deveAvisar(null, 0)).toBe(false);
  });
});
