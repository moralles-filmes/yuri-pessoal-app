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
import {
  MAX_TOOL_STEPS,
  MAX_TOOLS_POR_PASSO,
  TOKENS_POR_RESULTADO_DE_FERRAMENTA,
} from "@/lib/ai/tools/limits";
import { MAX_ESPECIALISTAS } from "@/lib/ai/agents/especialistas";
import {
  computeReservation,
  computeReservationDoCoordenador,
  estimarTokensDeEntrada,
  MARGEM_PADRAO,
  TETO_SAIDA_DECISAO,
  TETO_SAIDA_ESPECIALISTA,
} from "./reservation";
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

describe("reserva com passos de ferramenta (18-B)", () => {
  // Reusa a fábrica `tarifa()` já definida acima — evita `as unknown as` para montar um AiRate.
  const TARIFA_UNICA: readonly AiRate[] = [tarifa("10", "30", "m")];

  const comum = {
    rates: TARIFA_UNICA,
    tokensEntradaEstimados: 1000,
    tetoDeSaida: 1000,
    maxRetries: 0,
    maxFallbacks: 0,
    margem: 1,
  };

  it("sem passos, o valor é idêntico ao da 18-A (compatibilidade)", () => {
    const semCampo = computeReservation(comum);
    const comZero = computeReservation({ ...comum, maxToolSteps: 0 });
    expect(comZero.valorUsd).toBe(semCampo.valorUsd);
  });

  it("cada passo acrescenta uma chamada E o contexto de ATÉ MAX_TOOLS_POR_PASSO ferramentas", () => {
    const um = computeReservation({ ...comum, maxToolSteps: 1 });
    const zero = computeReservation({ ...comum, maxToolSteps: 0 });

    // Passo 0: 1000 entrada + 1000 saída. Passo 1: um passo pode ter disparado até
    // MAX_TOOLS_POR_PASSO ferramentas em paralelo — cada uma vira o SEU bloco no contexto,
    // não um só (achado da revisão: contar um bloco por passo subestima o pior caso 2,5×).
    const esperado =
      (1000 / 1e6) * 10 + (1000 / 1e6) * 30 +
      ((1000 + MAX_TOOLS_POR_PASSO * TOKENS_POR_RESULTADO_DE_FERRAMENTA) / 1e6) * 10 +
      (1000 / 1e6) * 30;

    expect(um.valorUsd).toBeCloseTo(esperado, 6);
    expect(um.valorUsd).toBeGreaterThan(zero.valorUsd);
  });

  it("cresce de forma monótona até o teto do módulo", () => {
    let anterior = 0;
    for (let passos = 0; passos <= MAX_TOOL_STEPS; passos += 1) {
      const v = computeReservation({ ...comum, maxToolSteps: passos }).valorUsd;
      expect(v).toBeGreaterThan(anterior);
      anterior = v;
    }
  });

  it("a explicação em pt-BR menciona os passos de ferramenta", () => {
    const r = computeReservation({ ...comum, maxToolSteps: 2 });
    expect(r.explicacao).toContain("2 passos de ferramenta");
  });

  it("retries e fallbacks continuam multiplicando o total", () => {
    const simples = computeReservation({ ...comum, maxToolSteps: 2 });
    const comRetry = computeReservation({ ...comum, maxToolSteps: 2, maxRetries: 1 });
    expect(comRetry.valorUsd).toBeCloseTo(simples.valorUsd * 2, 5);
  });

  // ─────────────────────────────────────────────────────────────────────────────────────
  // Os testes acima RECALCULAM com as mesmas constantes e as mesmas operações da
  // implementação — continuariam verdes mesmo com a fórmula contando só UM bloco de
  // ferramenta por passo em vez de MAX_TOOLS_POR_PASSO (o Critical que a revisão achou).
  // Os dois testes abaixo existem para não repetir esse erro: um literal calculado à mão,
  // fora da implementação, e uma desigualdade contra um modelo de custo montado do zero.
  // ─────────────────────────────────────────────────────────────────────────────────────

  it("valor literal no teto do módulo — conta à mão, sem reusar a fórmula da implementação", () => {
    // maxToolSteps = MAX_TOOL_STEPS (3). TOKENS_POR_RESULTADO_DE_FERRAMENTA = 2867 (18-B,
    // ver tools/limits.ts: ceil((8000 + 600) / 3)). MAX_TOOLS_POR_PASSO = 4, então cada
    // passo soma 4 × 2867 = 11.468 tokens ao que entra no passo seguinte:
    //
    //   passo 0: entrada 1.000                → 1.000×10 + 1.000×30 (em US$/M) = 0,04000
    //   passo 1: entrada 1.000 + 1×11.468     = 12.468  → 0,12468 + 0,03 = 0,15468
    //   passo 2: entrada 1.000 + 2×11.468     = 23.936  → 0,23936 + 0,03 = 0,26936
    //   passo 3: entrada 1.000 + 3×11.468     = 35.404  → 0,35404 + 0,03 = 0,38404
    //
    // soma = 0,04000 + 0,15468 + 0,26936 + 0,38404 = 0,84808 (multiplicador 1, margem 1).
    const r = computeReservation({ ...comum, maxToolSteps: MAX_TOOL_STEPS });
    expect(r.valorUsd).toBeCloseTo(0.848080, 6);
  });

  it("cobre um modelo de custo real montado do zero no teste (chamada a chamada, sem atalho)", () => {
    const passos = MAX_TOOL_STEPS;
    const r = computeReservation({ ...comum, maxToolSteps: passos });

    // Simula o pior caso de verdade: em CADA passo, até MAX_TOOLS_POR_PASSO ferramentas
    // rodam e cada uma acrescenta o SEU bloco `wrapUntrusted` ao contexto do passo seguinte
    // — sem usar o laço de `computeReservation`, só a definição do problema.
    let custoRealDoPiorCaso = 0;
    let tokensNoContexto = comum.tokensEntradaEstimados;
    for (let passo = 0; passo <= passos; passo += 1) {
      custoRealDoPiorCaso +=
        (tokensNoContexto / 1e6) * 10 + (comum.tetoDeSaida / 1e6) * 30;
      for (let ferramenta = 0; ferramenta < MAX_TOOLS_POR_PASSO; ferramenta += 1) {
        tokensNoContexto += TOKENS_POR_RESULTADO_DE_FERRAMENTA;
      }
    }

    // Esta é a invariante que protege o orçamento: a reserva nunca fica abaixo do pior
    // caso real, mesmo se alguém mudar as constantes de `tools/limits.ts` depois.
    expect(r.valorUsd).toBeGreaterThanOrEqual(custoRealDoPiorCaso);
  });
});

/**
 * Fase 18-D — o custo do ARQUIVO dentro da reserva.
 *
 * A metade que faltava: `estimarTokensDeEntrada` conta CARACTERES, e uma foto de nota tem
 * zero caractere. Sem `tokensDeArquivos`, o Processo 2 reservaria quase nada.
 */
describe("18-D · tokens de arquivo", () => {
  const A_SOZINHO = tarifa("10.00", "30.00", "só-esse");

  const comum = {
    rates: [A_SOZINHO],
    tokensEntradaEstimados: 1_000,
    tetoDeSaida: 1_000,
    maxRetries: 0,
    maxFallbacks: 0,
    margem: 1,
  };

  it("ausente reproduz EXATAMENTE a fórmula anterior", () => {
    // É o que garante que as 18-A e 18-B não mudaram de comportamento.
    const sem = computeReservation(comum);
    const zero = computeReservation({ ...comum, tokensDeArquivos: 0 });
    expect(zero.valorUsd).toBe(sem.valorUsd);
    expect(zero.explicacao).toBe(sem.explicacao);
  });

  it("soma ao custo de entrada", () => {
    // entrada 1.000 + arquivo 12.000 = 13.000 tokens
    // 13.000/1e6 × 10,00 = 0,13   ·   1.000/1e6 × 30,00 = 0,03   →  0,16
    const r = computeReservation({ ...comum, tokensDeArquivos: 12_000 });
    expect(r.valorUsd).toBeCloseTo(0.16, 6);
    expect(r.explicacao).toContain("12000 tokens de arquivo");
  });

  it("⛔ ENTRA EM TODO PASSO, não só no primeiro", () => {
    // O arquivo não sai do contexto entre os passos do laço. Com 2 passos de ferramenta
    // são TRÊS chamadas, e o arquivo é pago nas três.
    //
    //   passo 0: entrada 1.000 + arquivo 12.000 + 0 de ferramenta = 13.000
    //   passo 1: entrada 1.000 + arquivo 12.000 + 1×(MAX_TOOLS × TOKENS_FERRAMENTA)
    //   passo 2: entrada 1.000 + arquivo 12.000 + 2×(MAX_TOOLS × TOKENS_FERRAMENTA)
    //
    // A propriedade verificável, sem repetir a fórmula: a diferença entre reservar COM e
    // SEM o arquivo tem de ser 3× o custo do arquivo — uma vez por passo. Se alguém somar
    // o arquivo fora do laço, a diferença cai para 1×.
    const passos = 2;
    const semArquivo = computeReservation({ ...comum, maxToolSteps: passos });
    const comArquivo = computeReservation({
      ...comum,
      maxToolSteps: passos,
      tokensDeArquivos: 12_000,
    });

    const custoDeUmArquivo = (12_000 / 1e6) * 10; // 0,12
    expect(comArquivo.valorUsd - semArquivo.valorUsd).toBeCloseTo(
      custoDeUmArquivo * (passos + 1),
      6,
    );
  });

  it("valor negativo não reduz a reserva", () => {
    const r = computeReservation({ ...comum, tokensDeArquivos: -99_999 });
    expect(r.valorUsd).toBe(computeReservation(comum).valorUsd);
  });
});

/**
 * Chat livre com coordenador · Task 8 — a reserva do COORDENADOR pelo pior caso.
 *
 * Conta (Gemini 3.6 Flash: US$ 1,50/M entrada, US$ 7,50/M saída; maxRetries 1, maxFallbacks 0,
 * margem 1,15; coordenador 10.000 tokens; especialista 4.000; síntese com teto de saída 4.000):
 *
 *   Por especialista — 4 passos de ferramenta, entradas 4.000 + i·4·2.867 para i = 0..3:
 *     4.000 + 15.468 + 26.936 + 38.404 = 84.808 tokens × 1,50/M = 0,127212
 *     saída 4 × 1.500 = 6.000 × 7,50/M = 0,045
 *     = 0,172212 por especialista · × 6 = 1,033272
 *   Decisão — entrada 10.000, saída 2.500, 1 + 1 tentativas:
 *     (0,015 + 0,01875) × 2 = 0,0675
 *   Síntese — entrada 10.000 + 6 × 1.650 = 19.900, saída 4.000, 1 + 1 tentativas:
 *     (19.900 × 1,50/M + 4.000 × 7,50/M) × 2 = 0,1197
 *   Paralelo = 1,033272 + 0,1197 = 1,152972 · direto = 0,494424 (menor, não domina)
 *   Total = (0,0675 + 1,152972) × 1,15 = 1,40354
 */
describe("chat livre · reserva do coordenador (pior caso por constantes)", () => {
  const GEMINI_FLASH = tarifa("1.50", "7.50", "gemini-3.6-flash");

  const PIOR_CASO = {
    rates: [GEMINI_FLASH],
    tokensEntradaDoCoordenador: 10_000,
    tokensEntradaDoEspecialista: 4_000,
    tetoSaidaDaSintese: 4_000,
    maxRetries: 1,
    maxFallbacks: 0,
    margem: 1.15,
  };

  it("pior caso com o Gemini 3.6 Flash fica perto de US$ 1,40", () => {
    const r = computeReservationDoCoordenador(PIOR_CASO);
    expect(r.valorUsd).toBeCloseTo(1.4035, 2);
  });

  it("a síntese usa 1.650 tokens por resposta (1.500 × 1,1 em inteiro): o total bate com a conta à mão", () => {
    // Com `Math.ceil(1500 * 1.1)` seriam 1.651 por resposta: +6 tokens de entrada na síntese,
    // +2 × 6 × 1,50/M × 1,15 ≈ 0,0000207 — invisível em precisão 2, visível em precisão 5.
    const r = computeReservationDoCoordenador(PIOR_CASO);
    expect(r.valorUsd).toBeCloseTo(1.40354, 5);
  });

  it("o modo direto não domina o paralelo com estes números", () => {
    const paralelo = 1.152972;
    const direto = 0.494424;
    expect(direto).toBeLessThan(paralelo);
    const r = computeReservationDoCoordenador(PIOR_CASO);
    expect(r.explicacao).toContain("(paralelo)");
  });

  it("quando o direto é o mais caro, a reserva o cobre (o max olha os dois caminhos)", () => {
    // Síntese com teto de saída enorme: o direto gasta esse teto em CADA um dos 4 passos, a
    // síntese só uma vez. Com 200.000 tokens de saída o direto passa o paralelo.
    const r = computeReservationDoCoordenador({ ...PIOR_CASO, tetoSaidaDaSintese: 200_000 });
    expect(r.explicacao).toContain("(direto)");
    const direto = computeReservation({
      rates: PIOR_CASO.rates,
      maxRetries: 1,
      maxFallbacks: 0,
      margem: 1,
      tokensEntradaEstimados: 4_000,
      tetoDeSaida: 200_000,
      maxToolSteps: MAX_TOOL_STEPS,
    }).valorUsd;
    const decisao = (10_000 * 1.5 + 2_500 * 7.5) / 1e6 * 2;
    expect(r.valorUsd).toBeCloseTo((decisao + direto) * 1.15, 5);
  });

  it("os especialistas não carregam o multiplicador de tentativas", () => {
    // Dobrar as tentativas do coordenador (1 → 2 retries) multiplica decisão e síntese por
    // 3/2, e NÃO os seis especialistas (que não repetem). O delta é só a parte do coordenador:
    //   (0,03375 + 0,05985) × 1,15 = 0,10764.
    // Se os especialistas também multiplicassem, o delta seria ~0,10764 + 6 × 0,172212 × 1,15.
    const um = computeReservationDoCoordenador({ ...PIOR_CASO, maxRetries: 1 });
    const dois = computeReservationDoCoordenador({ ...PIOR_CASO, maxRetries: 2 });
    expect(dois.valorUsd - um.valorUsd).toBeCloseTo((0.03375 + 0.05985) * 1.15, 4);
  });

  it("o número de especialistas vem da constante, não de um parâmetro", () => {
    // A função não aceita quantidade (o tsc garante). Este teste documenta o valor que a conta usa.
    expect(MAX_ESPECIALISTAS).toBe(6);
    expect(TETO_SAIDA_DECISAO).toBe(2_500);
    expect(TETO_SAIDA_ESPECIALISTA).toBe(1_500);
  });

  it("a explicação em pt-BR descreve as partes: decisão, especialistas e síntese", () => {
    const r = computeReservationDoCoordenador(PIOR_CASO);
    expect(r.explicacao).toContain("decisão");
    expect(r.explicacao).toContain("6 especialistas");
    expect(r.explicacao).toContain("síntese");
    expect(r.multiplicadorDeTentativas).toBe(2);
    expect(r.margem).toBe(1.15);
    expect(r.tarifaEntradaUsada).toBe(1.5);
    expect(r.tarifaSaidaUsada).toBe(7.5);
  });
});
