/**
 * REDESIGN-04-A (K3) — a régua do alerta de gasto alto, a MESMA para a tela e para o sino, agora
 * "até o dia D, sem o cartão" no mês em andamento. Mês fechado: a conta de antes, inalterada.
 *
 * Fixture sintética.
 */

import { describe, expect, it } from "vitest";
import {
  gerarAlertas,
  resumoMes,
  type DashStatement,
  type DashTx,
} from "@/lib/finance/dashboard";
import { reguaDoGastoAlto } from "@/lib/finance/regua-do-gasto-alto";

const despesa = (
  competence_date: string,
  amount: number,
  status: DashTx["status"] = "pago",
): DashTx => ({
  amount,
  valor_pessoal: null,
  type: "despesa",
  payment_method: "pix",
  status,
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

// Novembro: 100 à vista no dia 10, 900 PENDENTE à vista no dia 25 e uma fatura de 5000.
// Ago/set/out: 100 à vista no dia 10 e 1000 no dia 20 (depois do corte D = 18).
const transactions: DashTx[] = [
  despesa("2026-08-10", 100),
  despesa("2026-08-20", 1000),
  despesa("2026-09-10", 100),
  despesa("2026-09-20", 1000),
  despesa("2026-10-10", 100),
  despesa("2026-10-20", 1000),
  despesa("2026-11-10", 100),
  despesa("2026-11-25", 900, "pendente"),
];
const statements = [fatura("2026-11", 5000)];

describe("04-A K3 — reguaDoGastoAlto até o dia D", () => {
  it("(a) mês em andamento: só o à vista até o dia D, sem o cartão, e a média cortada na mesma altura", () => {
    const r = reguaDoGastoAlto({
      mes: "2026-11",
      hoje: "2026-11-18",
      transactions,
      statements,
      receivables: [],
    });
    // Novembro até o dia 18: só os 100 do dia 10 (o pendente do dia 25 e a fatura de 5000 ficam fora).
    expect(r.saidas).toBe(100);
    // Ago/set/out até o dia 18: 100 cada (os 1000 do dia 20 ficam fora) -> média 100.
    expect(r.mediaSaidas).toBe(100);
    expect(r.ateODia).toBe(18);
    expect(r.cartaoFora).toBe(true);
  });

  it("(b) mês fechado: a conta de antes, mês inteiro e com o cartão", () => {
    const entrada = {
      mes: "2026-11",
      hoje: "2026-12-05",
      transactions,
      statements,
      receivables: [],
    };
    const r = reguaDoGastoAlto(entrada);
    // Novembro inteiro: 100 + 900 (pendente conta) + 5000 da fatura = 6000.
    expect(r.saidas).toBe(resumoMes(entrada).saidas);
    expect(r.saidas).toBe(6000);
    // Média pela regra antiga: jun/jul sem saída são ignorados; ago/set/out = 100 + 1000 = 1100 cada.
    expect(r.mediaSaidas).toBe(1100);
    expect(r.ateODia).toBeNull();
    expect(r.cartaoFora).toBe(false);
  });

  it("(c) mês anterior sem saída até o dia D é ignorado na média", () => {
    const r = reguaDoGastoAlto({
      mes: "2026-11",
      hoje: "2026-11-18",
      transactions: [
        despesa("2026-08-20", 1000), // depois do dia 18: até o dia 18 agosto não tem saída
        despesa("2026-09-10", 100),
        despesa("2026-10-10", 300),
        despesa("2026-11-10", 100),
      ],
      statements: [],
      receivables: [],
    });
    // (100 + 300) / 2 = 200; com agosto entrando como zero seria 133,33.
    expect(r.mediaSaidas).toBe(200);
  });

  it("(d) hoje 31/03: fevereiro é cortado no dia 28 (a despesa de 28/02 conta)", () => {
    const r = reguaDoGastoAlto({
      mes: "2026-03",
      hoje: "2026-03-31",
      transactions: [
        despesa("2026-01-10", 100),
        despesa("2026-02-28", 200),
        despesa("2026-03-05", 500),
      ],
      statements: [],
      receivables: [],
    });
    expect(r.ateODia).toBe(31);
    // (100 + 200) / 2 = 150; sem o 28/02 a média seria 100.
    expect(r.mediaSaidas).toBe(150);
    expect(r.saidas).toBe(500);
  });

  it("(e) gerarAlertas escreve o texto do corte com ateODia, e o antigo sem ele", () => {
    const resumoAtual = resumoMes({
      mes: "2026-11",
      transactions: [],
      statements: [],
      receivables: [],
    });
    const base = {
      hoje: "2026-11-18",
      resumoAtual,
      cards: [],
      statements: [],
      receivables: [],
    };
    const comCorte = gerarAlertas({
      ...base,
      regua: { saidas: 700, mediaSaidas: 500, ateODia: 18, cartaoFora: true },
    }).find((a) => a.kind === "gasto_alto");
    expect(comCorte?.detail).toBe(
      "As saídas à vista até o dia 18 superam a média dos meses anteriores até o mesmo dia em 40%. O cartão fica de fora desta conta.",
    );
    expect(comCorte?.valor).toBe(700);

    const semCorte = gerarAlertas({
      ...base,
      regua: { saidas: 700, mediaSaidas: 500, ateODia: null, cartaoFora: false },
    }).find((a) => a.kind === "gasto_alto");
    expect(semCorte?.detail).toBe("As saídas do mês superam a média recente em 40%.");
    expect(semCorte?.valor).toBe(700);
  });
});
