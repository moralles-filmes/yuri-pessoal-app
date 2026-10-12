import { beforeEach, describe, expect, it, vi } from "vitest";
import { getFinanceCardData } from "@/lib/dashboard/queries";
import type { FinanceCardData } from "@/lib/dashboard/types";
import { indicadorCoerente } from "../contracts";
import { coletarFinanceiro } from "./finance";

vi.mock("@/lib/dashboard/queries", () => ({
  getFinanceCardData: vi.fn(),
}));

const HOJE = "2026-08-07";
const MOTIVOS = ["Leitura de lançamentos incompleta.", "Contagem indisponível."] as const;
const MOTIVO = "Leitura de lançamentos incompleta. Contagem indisponível.";

let mesParcial: string | null;

/** Valores sintéticos já agregados pelo card: o coletor só os transporta. */
function cardDoMes(mes: string): FinanceCardData {
  return {
    completude: mes === mesParcial
      ? { estado: "parcial", motivos: MOTIVOS }
      : { estado: "exato" },
    mes,
    saldo: 12345.67,
    entradas: 5000,
    entradasMeu: 5000,
    entradasTerceiros: 0,
    saidas: 3200,
    meu: 2700,
    perdoado: 0,
    terceiros: 500,
    cartao: 1800,
    aVista: 1400,
    aReceber: 500,
    contasTotal: 750,
    contasCount: 2,
    proximaConta: null,
  };
}

beforeEach(() => {
  mesParcial = null;
  vi.mocked(getFinanceCardData).mockReset();
  vi.mocked(getFinanceCardData).mockImplementation(async (mes) => cardDoMes(mes));
});

const DO_MES = [
  "financeiro.saidas_mes",
  "financeiro.entradas_mes",
  "financeiro.gasto_meu_mes",
  "financeiro.no_cartao_mes",
  "financeiro.a_receber",
];
const COMPARACAO = ["financeiro.saidas.diferenca", "financeiro.saidas.variacao"];
const MEDIAS = ["financeiro.saidas.media_3", "financeiro.gasto_meu.media_3"];

describe("coletarFinanceiro — completude por mês", () => {
  it("usa hoje injetado e mantém indicadores exatos sem motivo quando todos os cards são exatos", async () => {
    const coleta = await coletarFinanceiro(HOJE);

    expect(vi.mocked(getFinanceCardData).mock.calls).toEqual([
      ["2026-05", HOJE, undefined],
      ["2026-06", HOJE, undefined],
      ["2026-07", HOJE, undefined],
      ["2026-08", HOJE, undefined],
    ]);
    expect(coleta.indicadores.map((i) => i.id)).toEqual([...DO_MES, ...COMPARACAO, ...MEDIAS]);
    for (const indicador of coleta.indicadores) {
      expect(indicador.qualidade).toBe("exato");
      expect(indicador).not.toHaveProperty("motivo_incompleto");
      expect(indicadorCoerente(indicador)).toBe(true);
    }
  });

  it.each([
    { mes: "2026-08", parciais: DO_MES },
    { mes: "2026-07", parciais: [...COMPARACAO, ...MEDIAS] },
    { mes: "2026-06", parciais: [...COMPARACAO, ...MEDIAS] },
    { mes: "2026-05", parciais: MEDIAS },
  ])("propaga o motivo de $mes só aos indicadores que usam esse mês, sem mudar valores", async ({ mes, parciais }) => {
    const exata = await coletarFinanceiro(HOJE);
    mesParcial = mes;
    const coleta = await coletarFinanceiro(HOJE);

    expect(coleta).toEqual({
      ...exata,
      indicadores: exata.indicadores.map((indicador) => parciais.includes(indicador.id)
        ? { ...indicador, qualidade: "parcial", motivo_incompleto: MOTIVO }
        : indicador),
    });
    for (const indicador of coleta.indicadores) {
      expect(indicadorCoerente(indicador)).toBe(true);
      if (!parciais.includes(indicador.id)) {
        expect(indicador).not.toHaveProperty("motivo_incompleto");
      }
    }
  });
});
