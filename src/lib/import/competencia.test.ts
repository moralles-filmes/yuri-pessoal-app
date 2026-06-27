import { describe, expect, it } from "vitest";
import { detectarCompetenciaFatura } from "@/lib/import/competencia";

// Cartão exemplo (Azul do usuário): fecha dia 21, vence dia 28.
const FECHA = 21;
const VENCE = 28;

describe("detectarCompetenciaFatura", () => {
  it("usa as compras à vista para achar a competência (ignora linhas parceladas)", () => {
    const fatura = detectarCompetenciaFatura(
      [
        { dataNorm: "2026-06-10", parcelasTotal: null },
        { dataNorm: "2026-06-15", parcelasTotal: null },
        { dataNorm: "2026-06-18", parcelasTotal: null },
        // Linhas parceladas trazem a data da compra ORIGINAL (antiga) → não contam.
        { dataNorm: "2026-02-25", parcelasTotal: 10 },
        { dataNorm: "2025-09-25", parcelasTotal: 10 },
      ],
      FECHA,
      VENCE,
    );
    expect(fatura?.competencia).toBe("2026-06-01");
    expect(fatura?.dataFechamento).toBe("2026-06-21");
    expect(fatura?.dataVencimento).toBe("2026-06-28");
  });

  it("compra após o fechamento cai na competência do mês seguinte", () => {
    // Dia 25 > fechamento 21 → fecha em julho.
    const fatura = detectarCompetenciaFatura(
      [{ dataNorm: "2026-06-25", parcelasTotal: null }],
      FECHA,
      VENCE,
    );
    expect(fatura?.competencia).toBe("2026-07-01");
  });

  it("escolhe a competência com mais linhas à vista", () => {
    const fatura = detectarCompetenciaFatura(
      [
        { dataNorm: "2026-06-10", parcelasTotal: null },
        { dataNorm: "2026-06-12", parcelasTotal: null },
        { dataNorm: "2026-06-14", parcelasTotal: null },
        { dataNorm: "2026-06-25", parcelasTotal: null }, // julho (minoria)
      ],
      FECHA,
      VENCE,
    );
    expect(fatura?.competencia).toBe("2026-06-01");
  });

  it("empate: desempata pela competência mais recente", () => {
    const fatura = detectarCompetenciaFatura(
      [
        { dataNorm: "2026-06-10", parcelasTotal: null }, // junho
        { dataNorm: "2026-06-25", parcelasTotal: null }, // julho
      ],
      FECHA,
      VENCE,
    );
    expect(fatura?.competencia).toBe("2026-07-01");
  });

  it("sem linhas à vista válidas → null", () => {
    expect(
      detectarCompetenciaFatura(
        [
          { dataNorm: "2026-02-25", parcelasTotal: 10 },
          { dataNorm: null, parcelasTotal: null },
        ],
        FECHA,
        VENCE,
      ),
    ).toBeNull();
  });

  it("lista vazia → null", () => {
    expect(detectarCompetenciaFatura([], FECHA, VENCE)).toBeNull();
  });
});
