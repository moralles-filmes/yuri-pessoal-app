import { describe, expect, it } from "vitest";
import { coberturaDaFatura } from "@/lib/import/cobertura";

/** Cartão do caso real: fecha dia 4, vence dia 11. */
const cartao = { diaFechamento: 4, diaVencimento: 11 };

describe("coberturaDaFatura", () => {
  it("avisa quando o arquivo termina antes do fechamento de uma fatura já fechada", () => {
    // Caso real: OFX ia até 25/06, a fatura de julho fechou em 04/07 — a compra de 03/07
    // (R$ 7,95) nunca esteve no arquivo, e a fatura entrou R$ 7,96 menor que a do banco.
    const r = coberturaDaFatura({
      datas: ["2026-06-04", "2026-06-25", "2026-06-16"],
      competencia: "2026-07-01",
      ...cartao,
      hoje: "2026-08-06",
    });
    expect(r).toEqual({
      ultimaData: "2026-06-25",
      dataFechamento: "2026-07-04",
      diasDescobertos: 9,
    });
  });

  it("não avisa quando o arquivo alcança o fechamento", () => {
    expect(
      coberturaDaFatura({
        datas: ["2026-06-25", "2026-07-04"],
        competencia: "2026-07-01",
        ...cartao,
        hoje: "2026-08-06",
      }),
    ).toBeNull();
  });

  it("não avisa em fatura ainda ABERTA (arquivo parcial é o esperado)", () => {
    expect(
      coberturaDaFatura({
        datas: ["2026-06-25"],
        competencia: "2026-07-01",
        ...cartao,
        hoje: "2026-07-01", // antes do fechamento (04/07)
      }),
    ).toBeNull();
  });

  it("não avisa por um dia de intervalo (ninguém compra todo dia)", () => {
    expect(
      coberturaDaFatura({
        datas: ["2026-07-03"],
        competencia: "2026-07-01",
        ...cartao,
        hoje: "2026-08-06",
      }),
    ).toBeNull();
  });

  it("avisa a partir de dois dias de intervalo", () => {
    const r = coberturaDaFatura({
      datas: ["2026-07-02"],
      competencia: "2026-07-01",
      ...cartao,
      hoje: "2026-08-06",
    });
    expect(r?.diasDescobertos).toBe(2);
  });

  it("sem competência, sem dias do cartão ou sem data válida, não afirma nada", () => {
    const base = { datas: ["2026-06-25"], ...cartao, hoje: "2026-08-06" };
    expect(coberturaDaFatura({ ...base, competencia: null })).toBeNull();
    expect(
      coberturaDaFatura({ ...base, competencia: "2026-07-01", diaFechamento: null }),
    ).toBeNull();
    expect(
      coberturaDaFatura({
        datas: [null, "", "data ruim"],
        competencia: "2026-07-01",
        ...cartao,
        hoje: "2026-08-06",
      }),
    ).toBeNull();
  });

  it("clampa o dia de fechamento em mês curto (fechamento 31 em fevereiro)", () => {
    const r = coberturaDaFatura({
      datas: ["2026-02-10"],
      competencia: "2026-02-01",
      diaFechamento: 31,
      diaVencimento: 10,
      hoje: "2026-04-01",
    });
    expect(r?.dataFechamento).toBe("2026-02-28");
    expect(r?.diasDescobertos).toBe(18);
  });

  it("atravessa a virada de mês/ano na contagem de dias", () => {
    const r = coberturaDaFatura({
      datas: ["2025-12-20"],
      competencia: "2026-01-01",
      diaFechamento: 4,
      diaVencimento: 11,
      hoje: "2026-02-01",
    });
    expect(r).toEqual({
      ultimaData: "2025-12-20",
      dataFechamento: "2026-01-04",
      diasDescobertos: 15,
    });
  });
});
