/**
 * REDESIGN-03-B — `mediaDeSaidas`: a divergência entre a tela e o sino vira parâmetro.
 *
 * As duas fórmulas de antes estão copiadas VERBATIM abaixo — a da página do dashboard
 * financeiro e a do Cron — e a função nova tem de dar o mesmo número que cada uma, na
 * configuração de cada uma. Os três eixos em que elas discordam CONTINUAM discordando: a 03-B
 * não muda número (desenho, §5).
 *
 * Fixture sintética.
 */

import { describe, expect, it } from "vitest";
import { mediaDeSaidas, type EvolucaoPonto } from "@/lib/finance/dashboard";

/** A tela · `financeiro/page.tsx`, antes da 03-B. */
function formulaDaTela(evolucao: EvolucaoPonto[], mesSel: string): number {
  const anteriores = evolucao.filter((p) => p.mes < mesSel && p.saidas > 0);
  const mediaSaidas =
    anteriores.length > 0
      ? anteriores.reduce((s, p) => s + p.saidas, 0) / anteriores.length
      : 0;
  return mediaSaidas;
}

/** O sino · `notifications/cron.ts`, antes da 03-B (`priorSaidas` já calculado por mês). */
function formulaDoSino(priorSaidas: number[]): number {
  const priorMonths = [1, 2, 3];
  const mediaSaidas = priorSaidas.reduce((a, b) => a + b, 0) / priorMonths.length;
  return mediaSaidas;
}

const ponto = (mes: string, saidas: number): EvolucaoPonto => ({
  mes,
  entradas: 0,
  saidas,
  saldo: -saidas,
});

// Seis meses terminando no selecionado, com um mês sem saída e um NEGATIVO (estorno maior
// que o gasto) — os dois casos em que as réguas se separam.
const evolucao: EvolucaoPonto[] = [
  ponto("2026-01", 300.1),
  ponto("2026-02", 0),
  ponto("2026-03", -45.5),
  ponto("2026-04", 410.25),
  ponto("2026-05", 199.9),
  ponto("2026-06", 999), // o próprio mês selecionado: nunca entra na média dele
];
const MES_SEL = "2026-06";

describe("03-B — mediaDeSaidas na configuração da TELA (ignora mês sem saída)", () => {
  const daTela = (pts: EvolucaoPonto[], mesSel: string) =>
    mediaDeSaidas(pts.filter((p) => p.mes < mesSel), { ignorarMesesSemSaida: true });

  it("dá o mesmo número que a fórmula de antes", () => {
    expect(daTela(evolucao, MES_SEL)).toBe(formulaDaTela(evolucao, MES_SEL));
  });

  it("descarta o mês zerado E o mês negativo — o filtro é > 0, não !== 0 (N6)", () => {
    // (300.1 + 410.25 + 199.9) / 3; com `!== 0` o -45.5 entraria e dividiria por 4.
    expect(daTela(evolucao, MES_SEL)).toBeCloseTo((300.1 + 410.25 + 199.9) / 3, 10);
    expect(mediaDeSaidas([ponto("2026-01", -45.5)], { ignorarMesesSemSaida: true })).toBe(0);
  });

  it("sem mês anterior com saída, devolve 0 — não NaN", () => {
    expect(daTela([ponto("2026-06", 500)], MES_SEL)).toBe(0);
    expect(daTela([ponto("2026-05", 0), ponto("2026-06", 500)], MES_SEL)).toBe(0);
    expect(formulaDaTela([ponto("2026-06", 500)], MES_SEL)).toBe(0);
  });
});

describe("03-B — mediaDeSaidas na configuração do SINO (mês zerado conta e divide)", () => {
  const tresMeses = [ponto("2026-05", 199.9), ponto("2026-04", 0), ponto("2026-03", 410.25)];

  it("dá o mesmo número que a fórmula de antes", () => {
    expect(mediaDeSaidas(tresMeses, { ignorarMesesSemSaida: false })).toBe(
      formulaDoSino(tresMeses.map((p) => p.saidas)),
    );
  });

  it("o mês sem saída puxa a média para baixo — é aqui que as duas réguas se separam (N5)", () => {
    expect(mediaDeSaidas(tresMeses, { ignorarMesesSemSaida: false })).toBeCloseTo(
      (199.9 + 0 + 410.25) / 3,
      10,
    );
    expect(mediaDeSaidas(tresMeses, { ignorarMesesSemSaida: true })).toBeCloseTo(
      (199.9 + 410.25) / 2,
      10,
    );
  });

  it("negativo também conta no sino (ele nunca filtrou)", () => {
    const comEstorno = [ponto("2026-05", 100), ponto("2026-04", -40), ponto("2026-03", 100)];
    expect(mediaDeSaidas(comEstorno, { ignorarMesesSemSaida: false })).toBe(
      formulaDoSino([100, -40, 100]),
    );
  });

  it("lista vazia devolve 0 — não NaN", () => {
    expect(mediaDeSaidas([], { ignorarMesesSemSaida: false })).toBe(0);
    expect(mediaDeSaidas([], { ignorarMesesSemSaida: true })).toBe(0);
  });
});
