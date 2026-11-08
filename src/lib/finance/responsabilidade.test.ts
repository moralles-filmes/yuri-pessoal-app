import { describe, expect, it } from "vitest";
import {
  type DashReceivable,
  type DashStatement,
  type DashTx,
  evolucaoMensal,
} from "@/lib/finance/dashboard";
import {
  ROTULO_DA_RESPONSABILIDADE,
  evolucaoDaResponsabilidade,
  fatiasDaResponsabilidade,
  responsabilidadeDaUrl,
} from "@/lib/finance/responsabilidade";
import { termosProibidosEm } from "@/lib/tone/vocabulary";
import { reaisParaCentavos } from "@/lib/format";

/**
 * 04-A2, Tarefa 3 — a responsabilidade é uma ESCOLHA de campo, não uma conta nova.
 *
 * Fixture SINTÉTICA ("Cartão A", "Categoria A", valores inventados). Contas à mão:
 *
 * Outubro/2026:
 *   receita à conta 400 (sem valor_pessoal ⇒ toda minha)
 *   à vista 50 (meu 50)
 *   ⇒ entradas 400 · entradasMeu 400 · entradasTerceiros 0 · saidas 50 · meu 50 · terceiros 0
 *
 * Novembro/2026:
 *   receita à conta 1000 (valor_pessoal 700 ⇒ terceiros 300)
 *   à vista 100,10 (valor_pessoal 60,05 ⇒ terceiros 40,05)
 *   cartão A, fatura de novembro 200 — compra 200 com 80 de terceiro (recebível pendente de 80)
 *   ⇒ entradas 1000 · entradasMeu 700 · entradasTerceiros 300
 *   ⇒ saidas 300,10 (100,10 à vista + 200 cartão) · meu 180,05 (60,05 + 120) · terceiros 120,05 (40,05 + 80)
 */

const MES_1 = "2026-10";
const MES_2 = "2026-11";
const MESES = [MES_1, MES_2];

const base = {
  status: "pago" as const,
  parcelado: false,
  payment_method: "pix" as const,
  category_id: "cat-a",
  category: { id: "cat-a", name: "Categoria A", color: null },
};

const TRANSACOES: DashTx[] = [
  { ...base, id: "r-out", type: "receita", amount: 400, valor_pessoal: null, competence_date: "2026-10-03", card_id: null, statement_id: null },
  { ...base, id: "d-out", type: "despesa", amount: 50, valor_pessoal: null, competence_date: "2026-10-05", card_id: null, statement_id: null },
  { ...base, id: "r-nov", type: "receita", amount: 1000, valor_pessoal: 700, competence_date: "2026-11-01", card_id: null, statement_id: null },
  { ...base, id: "d-nov", type: "despesa", amount: 100.1, valor_pessoal: 60.05, competence_date: "2026-11-02", card_id: null, statement_id: null },
  {
    ...base,
    id: "c-nov",
    type: "despesa",
    amount: 200,
    valor_pessoal: 120,
    payment_method: "cartao_credito",
    competence_date: "2026-11-03",
    card_id: "cartao-a",
    statement_id: "fatura-a-nov",
  },
];

const FATURAS: DashStatement[] = [
  {
    id: "fatura-a-nov",
    card_id: "cartao-a",
    competencia: "2026-11-01",
    data_fechamento: "2026-11-10",
    data_vencimento: "2026-11-18",
    pago_em: null,
    total_atual: 200,
  },
];

const RECEBIVEIS: DashReceivable[] = [
  { transaction_id: "c-nov", statement_id: "fatura-a-nov", installment_id: null, valor: 80, status: "pendente" },
];

const PARAMS = { meses: MESES, transactions: TRANSACOES, statements: FATURAS, receivables: RECEBIVEIS };

describe("responsabilidadeDaUrl", () => {
  it("aceita 'terceiros' e 'consolidado'", () => {
    expect(responsabilidadeDaUrl("terceiros")).toBe("terceiros");
    expect(responsabilidadeDaUrl("consolidado")).toBe("consolidado");
  });

  it("ausente, inválido ou repetido cai em 'meu'", () => {
    expect(responsabilidadeDaUrl(undefined)).toBe("meu");
    expect(responsabilidadeDaUrl("meu")).toBe("meu");
    expect(responsabilidadeDaUrl("x")).toBe("meu");
    expect(responsabilidadeDaUrl(["terceiros"])).toBe("meu");
  });
});

describe("evolucaoDaResponsabilidade", () => {
  it("'meu' é exatamente evolucaoMensal com as mesmas entradas", () => {
    expect(evolucaoDaResponsabilidade({ ...PARAMS, resp: "meu" })).toEqual(evolucaoMensal(PARAMS));
  });

  it("meu + terceiros = consolidado, mês a mês, em centavos", () => {
    const meu = evolucaoDaResponsabilidade({ ...PARAMS, resp: "meu" });
    const terceiros = evolucaoDaResponsabilidade({ ...PARAMS, resp: "terceiros" });
    const consolidado = evolucaoDaResponsabilidade({ ...PARAMS, resp: "consolidado" });

    expect(consolidado.map((p) => p.mes)).toEqual(MESES);
    consolidado.forEach((c, i) => {
      expect(reaisParaCentavos(meu[i].entradas) + reaisParaCentavos(terceiros[i].entradas)).toBe(
        reaisParaCentavos(c.entradas),
      );
      expect(reaisParaCentavos(meu[i].saidas) + reaisParaCentavos(terceiros[i].saidas)).toBe(
        reaisParaCentavos(c.saidas),
      );
    });
  });

  it("'terceiros' e 'consolidado' escolhem os campos certos e o saldo é entradas − saidas", () => {
    expect(evolucaoDaResponsabilidade({ ...PARAMS, resp: "terceiros" })).toEqual([
      { mes: MES_1, entradas: 0, saidas: 0, saldo: 0 },
      { mes: MES_2, entradas: 300, saidas: 120.05, saldo: 179.95 },
    ]);
    expect(evolucaoDaResponsabilidade({ ...PARAMS, resp: "consolidado" })).toEqual([
      { mes: MES_1, entradas: 400, saidas: 50, saldo: 350 },
      { mes: MES_2, entradas: 1000, saidas: 300.1, saldo: 699.9 },
    ]);
  });
});

describe("fatiasDaResponsabilidade", () => {
  const FATIAS = [{ nome: "Categoria A", movimentado: 100.1, meu: 60.05 }];

  it("os três valores de uma fatia são meu, terceiros e consolidado, em centavos", () => {
    expect(fatiasDaResponsabilidade(FATIAS, "meu")[0].valor).toBe(60.05);
    expect(fatiasDaResponsabilidade(FATIAS, "terceiros")[0].valor).toBe(40.05);
    expect(fatiasDaResponsabilidade(FATIAS, "consolidado")[0].valor).toBe(100.1);
  });

  it("preserva os campos da fatia e acrescenta só o valor", () => {
    expect(fatiasDaResponsabilidade(FATIAS, "terceiros")[0]).toEqual({
      nome: "Categoria A",
      movimentado: 100.1,
      meu: 60.05,
      valor: 40.05,
    });
  });
});

describe("ROTULO_DA_RESPONSABILIDADE", () => {
  it("tem os três rótulos pt-BR", () => {
    expect(ROTULO_DA_RESPONSABILIDADE).toEqual({
      meu: "Meu",
      terceiros: "Terceiros",
      consolidado: "Consolidado",
    });
  });

  it("passa no vocabulário proibido e nunca diz 'meu gasto'", () => {
    for (const rotulo of Object.values(ROTULO_DA_RESPONSABILIDADE)) {
      expect(termosProibidosEm(rotulo)).toEqual([]);
      expect(rotulo.toLocaleLowerCase("pt-BR")).not.toContain("meu gasto");
    }
  });
});
