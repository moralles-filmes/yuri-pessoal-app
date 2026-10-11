/**
 * REDESIGN-03-B → 03-B2 — a média de saídas do alerta de gasto alto.
 *
 * Na 03-B a divergência entre a tela e o sino virou PARÂMETRO (`ignorarMesesSemSaida`). Na 03-B2
 * o dono decidiu (B2, 2026-09-27): UMA régua só — a da tela —, e o sino a adota por
 * `reguaDoGastoAlto`, a mesma função que a página do dashboard financeiro chama. A configuração
 * do sino deixou de existir, e com ela a mutação N5 da 03-B. A N6 (o filtro é `> 0`, não
 * `!== 0`) continua valendo.
 *
 * A fórmula de antes da TELA está copiada VERBATIM abaixo: a régua única tem de dar o mesmo
 * número que ela — o número da tela não muda; muda o do sino (ver `notifications/cron.test.ts`).
 *
 * Fixture sintética.
 */

import { describe, expect, it } from "vitest";
import {
  evolucaoMensal,
  gerarAlertas,
  mediaDeSaidas,
  reguaDoGastoAlto,
  resumoMes,
  ultimosMeses,
  type DashStatement,
  type DashTx,
  type EvolucaoPonto,
} from "@/lib/finance/dashboard";

/** A tela · `financeiro/page.tsx`, antes da 03-B. */
function formulaDaTela(evolucao: EvolucaoPonto[], mesSel: string): number {
  const anteriores = evolucao.filter((p) => p.mes < mesSel && p.saidas > 0);
  const mediaSaidas =
    anteriores.length > 0
      ? anteriores.reduce((s, p) => s + p.saidas, 0) / anteriores.length
      : 0;
  return mediaSaidas;
}

const ponto = (mes: string, saidas: number): EvolucaoPonto => ({
  mes,
  entradas: 0,
  saidas,
  saldo: -saidas,
});

// Seis meses terminando no selecionado, com um mês sem saída e um NEGATIVO (estorno maior
// que o gasto).
const evolucao: EvolucaoPonto[] = [
  ponto("2026-01", 300.1),
  ponto("2026-02", 0),
  ponto("2026-03", -45.5),
  ponto("2026-04", 410.25),
  ponto("2026-05", 199.9),
  ponto("2026-06", 999), // o próprio mês selecionado: nunca entra na média dele
];
const MES_SEL = "2026-06";

describe("03-B2 — mediaDeSaidas: uma régua só (ignora mês sem saída)", () => {
  const anteriores = (pts: EvolucaoPonto[], mesSel: string) =>
    mediaDeSaidas(pts.filter((p) => p.mes < mesSel));

  it("dá o mesmo número que a fórmula de antes da tela", () => {
    expect(anteriores(evolucao, MES_SEL)).toBe(formulaDaTela(evolucao, MES_SEL));
  });

  it("descarta o mês zerado E o mês negativo — o filtro é > 0, não !== 0 (N6)", () => {
    // (300.1 + 410.25 + 199.9) / 3; com `!== 0` o -45.5 entraria e dividiria por 4.
    expect(anteriores(evolucao, MES_SEL)).toBeCloseTo((300.1 + 410.25 + 199.9) / 3, 10);
    expect(mediaDeSaidas([ponto("2026-01", -45.5)])).toBe(0);
  });

  it("sem mês com saída, devolve 0 — não NaN", () => {
    expect(mediaDeSaidas([])).toBe(0);
    expect(anteriores([ponto("2026-06", 500)], MES_SEL)).toBe(0);
    expect(anteriores([ponto("2026-05", 0), ponto("2026-06", 500)], MES_SEL)).toBe(0);
  });
});

/* ───────────────────────────── A régua única ───────────────────────────── */

const despesa = (competence_date: string, amount: number): DashTx => ({
  amount,
  valor_pessoal: null,
  type: "despesa",
  payment_method: "pix",
  status: "pago",
  competence_date,
  card_id: null,
  statement_id: null,
  parcelado: false,
  category_id: null,
  category: null,
});

const fatura = (competencia: string, total_atual: number): DashStatement => ({
  id: `st-${competencia}`,
  card_id: "card-1",
  competencia: `${competencia}-01`,
  data_fechamento: `${competencia}-05`,
  data_vencimento: `${competencia}-15`,
  pago_em: null,
  total_atual,
});

describe("03-B2 B2 — reguaDoGastoAlto, a régua que a tela e o sino chamam", () => {
  const MES = "2026-06";
  const transactions = [
    despesa("2025-12-10", 99999), // 6º mês para trás: fora da régua
    despesa("2026-01-10", 300.1),
    // fevereiro: sem nenhuma saída
    despesa("2026-04-10", 410.25),
    despesa("2026-05-10", 199.9),
    despesa("2026-06-10", 999),
    despesa("2026-06-28", 1),
  ];
  // Março NEGATIVO: estorno maior que o gasto na fatura.
  const statements = [fatura("2026-03", -45.5)];
  const entrada = { mes: MES, transactions, statements, receivables: [] };

  it("dá o mesmo número que a fórmula de antes da TELA — o número da tela não muda", () => {
    const evo = evolucaoMensal({ meses: ultimosMeses(MES, 6), transactions, statements, receivables: [] });
    const r = reguaDoGastoAlto(entrada);
    expect(r.mediaSaidas).toBe(formulaDaTela(evo, MES));
    expect(r.saidas).toBe(resumoMes(entrada).saidas);
  });

  it("usa os 5 meses anteriores, ignora o zerado e o negativo, e o mês corrente entra cheio", () => {
    const r = reguaDoGastoAlto(entrada);
    expect(r.mediaSaidas).toBeCloseTo((300.1 + 410.25 + 199.9) / 3, 10);
    expect(r.saidas).toBe(1000);
  });

  it("sem mês anterior com saída, a média é 0 e o alerta não nasce (sem NaN)", () => {
    const soAtual = { mes: MES, transactions: [despesa("2026-06-10", 500)], statements: [], receivables: [] };
    const r = reguaDoGastoAlto(soAtual);
    expect(r.mediaSaidas).toBe(0);
    expect(Number.isNaN(r.mediaSaidas)).toBe(false);
    const alertas = gerarAlertas({
      hoje: "2026-06-20",
      resumoAtual: resumoMes(soAtual),
      mediaSaidas: r.mediaSaidas,
      cards: [],
      statements: [],
      receivables: [],
    });
    expect(alertas.some((a) => a.kind === "gasto_alto")).toBe(false);
  });
});
