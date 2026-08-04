/**
 * Fase 18-A — IA · A fórmula da reserva.
 *
 * Os quatro exemplos numéricos do anexo D do arquivo da fase estão aqui, com as tarifas
 * ilustrativas de lá. Eles provam a propriedade que interessa: **a reserva cobre qualquer
 * caminho autorizado**, incluindo o fallback para o modelo mais caro — porque o fallback
 * NÃO ganha uma segunda reserva.
 */

import { describe, expect, it } from "vitest";
import type { AiRate } from "@/lib/ai/core/pricing";
import { computeReservation, estimarTokensDeEntrada, MARGEM_PADRAO } from "./reservation";
import { round6 } from "./meter";

function tarifa(entrada: string, saida: string, id: string): AiRate {
  return {
    provider: "openai",
    modelId: id,
    inputPerMillion: entrada,
    outputPerMillion: saida,
    cachedInputPerMillion: null,
    longContextThresholdTokens: null,
    longInputPerMillion: null,
    longOutputPerMillion: null,
    currency: "USD",
    effectiveFrom: "2026-01-01",
    effectiveUntil: null,
    verifiedAt: "2026-08-04",
    source: "teste",
  };
}

// Modelo A (selecionado) e Modelo B (fallback autorizado, mais caro) — anexo D.
const A = tarifa("1.00", "5.00", "modelo-a");
const B = tarifa("3.00", "15.00", "modelo-b");

const ENTRADA = 4_000;
const TETO_SAIDA = 2_000;

const RESERVA = computeReservation({
  rates: [A, B],
  tokensEntradaEstimados: ENTRADA,
  tetoDeSaida: TETO_SAIDA,
  maxRetries: 1,
  maxFallbacks: 1,
  margem: MARGEM_PADRAO,
});

describe("fórmula da reserva (anexo D)", () => {
  it("usa a tarifa do PIOR modelo da cadeia autorizada", () => {
    // base = 4.000/1e6 × 3,00 + 2.000/1e6 × 15,00 = 0,012 + 0,030 = 0,042
    // reserva = 0,042 × 3 × 1,15 = 0,144900
    expect(RESERVA.tarifaEntradaUsada).toBe(3);
    expect(RESERVA.tarifaSaidaUsada).toBe(15);
    expect(RESERVA.multiplicadorDeTentativas).toBe(3);
    expect(RESERVA.valorUsd).toBe(0.1449);
  });

  it("a explicação mostra COMO o número saiu, não só o número", () => {
    expect(RESERVA.explicacao).toContain("4000 tokens de entrada");
    expect(RESERVA.explicacao).toContain("× 3 tentativas");
    expect(RESERVA.explicacao).toContain("margem 1.15");
  });

  it("exemplo 1 — sucesso sem retry cabe folgado", () => {
    const custo = round6((4_100 / 1e6) * 1 + (900 / 1e6) * 5);
    expect(custo).toBe(0.0086);
    expect(custo).toBeLessThan(RESERVA.valorUsd);
  });

  it("exemplo 2 — retry no mesmo modelo NÃO cria segunda reserva", () => {
    const t1 = round6((4_100 / 1e6) * 1 + (300 / 1e6) * 5);
    const t2 = round6((4_100 / 1e6) * 1 + (950 / 1e6) * 5);
    expect(t1).toBe(0.0056);
    expect(t2).toBe(0.00885);
    expect(round6(t1 + t2)).toBe(0.01445);
    expect(t1 + t2).toBeLessThan(RESERVA.valorUsd);
  });

  it("exemplo 3 — fallback para o modelo MAIS CARO ainda cabe na reserva original", () => {
    const t1 = round6((4_100 / 1e6) * 1 + 0);
    const t2 = round6((4_100 / 1e6) * 3 + (1_800 / 1e6) * 15);
    expect(t1).toBe(0.0041);
    expect(t2).toBe(0.0393);
    expect(round6(t1 + t2)).toBe(0.0434);
    // É ESTA a propriedade que justifica reservar pelo pior modelo.
    expect(t1 + t2).toBeLessThan(RESERVA.valorUsd);
  });

  it("exemplo 4 — cancelamento com uso parcial é registrado e cabe", () => {
    const t1 = round6((4_100 / 1e6) * 1 + (620 / 1e6) * 5);
    expect(t1).toBe(0.0072);
    expect(t1).toBeLessThan(RESERVA.valorUsd);
  });

  it("sem fallback autorizado, a reserva é menor", () => {
    const soA = computeReservation({
      rates: [A],
      tokensEntradaEstimados: ENTRADA,
      tetoDeSaida: TETO_SAIDA,
      maxRetries: 1,
      maxFallbacks: 0,
      margem: MARGEM_PADRAO,
    });
    expect(soA.multiplicadorDeTentativas).toBe(2);
    expect(soA.valorUsd).toBeLessThan(RESERVA.valorUsd);
  });

  it("margem inválida cai no padrão em vez de zerar a reserva", () => {
    const r = computeReservation({
      rates: [A],
      tokensEntradaEstimados: 1_000,
      tetoDeSaida: 1_000,
      maxRetries: 0,
      maxFallbacks: 0,
      margem: 0,
    });
    expect(r.margem).toBe(MARGEM_PADRAO);
    expect(r.valorUsd).toBeGreaterThan(0);
  });

  it("arredonda PARA CIMA — a reserva tem de sobrar", () => {
    const r = computeReservation({
      rates: [tarifa("0.0000001", "0.0000001", "microscopico")],
      tokensEntradaEstimados: 1,
      tetoDeSaida: 1,
      maxRetries: 0,
      maxFallbacks: 0,
      margem: 1.15,
    });
    expect(r.valorUsd).toBeGreaterThan(0);
  });
});

describe("estimativa de tokens de entrada", () => {
  it("é CONSERVADORA (≈3 caracteres por token)", () => {
    // A média em português fica perto de 4; subestimar aqui fura a reserva.
    expect(estimarTokensDeEntrada("a".repeat(300))).toBe(100);
    expect(estimarTokensDeEntrada("")).toBe(0);
  });

  it("cresce com o prompt montado, não com o texto cru", () => {
    const curto = estimarTokensDeEntrada("oi");
    const longo = estimarTokensDeEntrada("oi".repeat(1_000));
    expect(longo).toBeGreaterThan(curto);
  });
});
