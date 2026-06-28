import { describe, it, expect } from "vitest";
import { resolverFatura, statusEfetivo } from "@/lib/finance/invoice";

describe("resolverFatura — qual ciclo (antes/no dia/depois do fechamento)", () => {
  // Cartão: fecha dia 10, vence dia 20 (vencimento no mesmo mês do fechamento).
  it("compra ANTES do fechamento entra na fatura que fecha no mês da compra", () => {
    expect(resolverFatura("2026-01-05", 10, 20)).toEqual({
      competencia: "2026-01-01",
      dataFechamento: "2026-01-10",
      dataVencimento: "2026-01-20",
    });
  });

  it("compra NO dia do fechamento entra na fatura que fecha no mês da compra (borda)", () => {
    expect(resolverFatura("2026-01-10", 10, 20)).toEqual({
      competencia: "2026-01-01",
      dataFechamento: "2026-01-10",
      dataVencimento: "2026-01-20",
    });
  });

  it("compra DEPOIS do fechamento entra na fatura do mês seguinte", () => {
    expect(resolverFatura("2026-01-11", 10, 20)).toEqual({
      competencia: "2026-02-01",
      dataFechamento: "2026-02-10",
      dataVencimento: "2026-02-20",
    });
  });
});

describe("resolverFatura — vencimento <= fechamento vence no mês seguinte ao fechamento", () => {
  // Cartão: fecha dia 10, vence dia 05.
  it("vencimento menor que fechamento → vence no mês seguinte", () => {
    expect(resolverFatura("2026-01-05", 10, 5)).toEqual({
      competencia: "2026-01-01",
      dataFechamento: "2026-01-10",
      dataVencimento: "2026-02-05",
    });
  });

  it("vencimento IGUAL ao fechamento → vence no mês seguinte (sempre depois do fechamento)", () => {
    const f = resolverFatura("2026-01-05", 10, 10);
    expect(f.dataFechamento).toBe("2026-01-10");
    expect(f.dataVencimento).toBe("2026-02-10");
    expect(f.dataFechamento < f.dataVencimento).toBe(true);
  });
});

describe("resolverFatura — virada de ano (dez → jan)", () => {
  it("compra depois do fechamento em dezembro fecha/vence em janeiro do ano seguinte", () => {
    expect(resolverFatura("2025-12-25", 10, 20)).toEqual({
      competencia: "2026-01-01",
      dataFechamento: "2026-01-10",
      dataVencimento: "2026-01-20",
    });
  });

  it("compra antes do fechamento em dezembro permanece em dezembro", () => {
    expect(resolverFatura("2025-12-05", 10, 20)).toEqual({
      competencia: "2025-12-01",
      dataFechamento: "2025-12-10",
      dataVencimento: "2025-12-20",
    });
  });

  it("virada de ano com vencimento no mês seguinte ao fechamento", () => {
    // fecha 28, vence 10; compra 29/12 → fecha jan/2026, vence fev/2026.
    expect(resolverFatura("2025-12-29", 28, 10)).toEqual({
      competencia: "2026-01-01",
      dataFechamento: "2026-01-28",
      dataVencimento: "2026-02-10",
    });
  });
});

describe("resolverFatura — clamp do fechamento (dias 28–31)", () => {
  it("fechamento 31 em fevereiro (ano não bissexto) clampa para 28", () => {
    // 2026 não é bissexto.
    expect(resolverFatura("2026-02-27", 31, 10)).toEqual({
      competencia: "2026-02-01",
      dataFechamento: "2026-02-28",
      dataVencimento: "2026-03-10",
    });
  });

  it("fechamento 31 em fevereiro bissexto (2024) clampa para 29", () => {
    expect(resolverFatura("2024-02-28", 31, 10)).toEqual({
      competencia: "2024-02-01",
      dataFechamento: "2024-02-29",
      dataVencimento: "2024-03-10",
    });
  });

  it("compra no último dia de fevereiro (28) entra na fatura de fevereiro quando fechamento é 31", () => {
    // dia 28 <= fechamento clampado (28) → fecha em fevereiro.
    const f = resolverFatura("2026-02-28", 31, 10);
    expect(f.competencia).toBe("2026-02-01");
    expect(f.dataFechamento).toBe("2026-02-28");
  });

  it("fechamento 31 em abril (30 dias) clampa para 30", () => {
    expect(resolverFatura("2026-04-30", 31, 15)).toEqual({
      competencia: "2026-04-01",
      dataFechamento: "2026-04-30",
      dataVencimento: "2026-05-15",
    });
  });
});

describe("resolverFatura — clamp do vencimento em mês curto", () => {
  it("vencimento 31 cai em fevereiro → clampa para o último dia", () => {
    // fecha 05/02, vence 31 (>05 → mesmo mês) clampado a 28/02.
    expect(resolverFatura("2026-02-03", 5, 31)).toEqual({
      competencia: "2026-02-01",
      dataFechamento: "2026-02-05",
      dataVencimento: "2026-02-28",
    });
  });

  it("borda: fechamento 30 e vencimento 31 em fevereiro não colapsam (vencimento vai p/ mês seguinte)", () => {
    // Ambos clampariam para 28/02; a guarda empurra o vencimento para 31/03.
    const f = resolverFatura("2026-02-28", 30, 31);
    expect(f.dataFechamento).toBe("2026-02-28");
    expect(f.dataVencimento).toBe("2026-03-31");
    expect(f.dataFechamento < f.dataVencimento).toBe(true);
  });
});

describe("resolverFatura — invariantes", () => {
  const dias = [1, 5, 10, 15, 28, 29, 30, 31];
  const compras = [
    "2024-01-01",
    "2024-02-29",
    "2025-12-31",
    "2026-02-28",
    "2026-04-15",
    "2026-07-31",
    "2026-11-30",
  ];

  it("competência é sempre o dia 1 e fechamento < vencimento em toda combinação", () => {
    for (const compra of compras) {
      for (const fech of dias) {
        for (const venc of dias) {
          const f = resolverFatura(compra, fech, venc);
          expect(f.competencia.endsWith("-01")).toBe(true);
          expect(f.dataFechamento < f.dataVencimento).toBe(true);
        }
      }
    }
  });
});

describe("statusEfetivo — derivado de hoje vs datas", () => {
  const base = { data_fechamento: "2026-01-10", data_vencimento: "2026-01-20" };

  it("pago_em definido → paga (vence as demais)", () => {
    expect(
      statusEfetivo({ ...base, pago_em: "2026-01-30T12:00:00Z" }, "2026-01-30"),
    ).toBe("paga");
    // Mesmo atrasada vira paga se pago_em.
    expect(
      statusEfetivo({ ...base, pago_em: "2026-02-01T00:00:00Z" }, "2026-02-15"),
    ).toBe("paga");
  });

  it("antes do fechamento → aberta", () => {
    expect(statusEfetivo({ ...base, pago_em: null }, "2026-01-05")).toBe(
      "aberta",
    );
  });

  it("do fechamento ATÉ o vencimento (inclusive) → fechada", () => {
    expect(statusEfetivo({ ...base, pago_em: null }, "2026-01-10")).toBe(
      "fechada",
    );
    expect(statusEfetivo({ ...base, pago_em: null }, "2026-01-15")).toBe(
      "fechada",
    );
    // No próprio dia do vencimento ainda dá pra pagar → fechada, não atrasada.
    expect(statusEfetivo({ ...base, pago_em: null }, "2026-01-20")).toBe(
      "fechada",
    );
  });

  it("só DEPOIS do vencimento, sem pagamento → atrasada", () => {
    expect(statusEfetivo({ ...base, pago_em: null }, "2026-01-21")).toBe(
      "atrasada",
    );
    expect(statusEfetivo({ ...base, pago_em: null }, "2026-02-01")).toBe(
      "atrasada",
    );
  });
});
