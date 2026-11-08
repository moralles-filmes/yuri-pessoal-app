/**
 * REDESIGN-05-C — testes de `montarRelatorioDeCartao`.
 *
 * Fixture de DOIS cartões, `hoje = 2026-11-02`:
 *  - Alfa (ativo):   fatura de out/2026 (competência) que VENCE em nov (10/11); crédito em ago/2026.
 *  - Beta (inativo): fatura de out/2026 que vence em out (05/10), com recebível `ignorado`.
 */
import { describe, expect, it } from "vitest";
import {
  type DashStatement,
  parteDosTerceirosPorFatura,
  ultimosMeses,
} from "@/lib/finance/dashboard";
import { resumirRecebivel } from "@/lib/finance/recebimentos";
import type { ReceivableWithPerson } from "@/types/database";
import type { CartaoDaCentral } from "./central-cartoes";
import {
  baseDoRelatorio,
  montarRelatorioDeCartao,
  periodoDoRelatorio,
} from "./relatorio-de-cartao";

const HOJE = "2026-11-02";

const alfa: CartaoDaCentral = { id: "c-alfa", nome: "Alfa", cor: "#7a3ff2", ativo: true, dia_fechamento: 27, dia_vencimento: 10 };
const beta: CartaoDaCentral = { id: "c-beta", nome: "Beta", cor: "#2b6cdf", ativo: false, dia_fechamento: 20, dia_vencimento: 5 };
const CARTOES = [beta, alfa]; // fora de ordem de propósito

function fatura(p: Pick<DashStatement, "id" | "card_id" | "competencia" | "data_fechamento" | "data_vencimento" | "total_atual">): DashStatement {
  return { pago_em: null, ...p };
}

const alfaOut = fatura({ id: "s-alfa-out", card_id: alfa.id, competencia: "2026-10-01", data_fechamento: "2026-10-27", data_vencimento: "2026-11-10", total_atual: 1000 });
const alfaAgo = fatura({ id: "s-alfa-ago", card_id: alfa.id, competencia: "2026-08-01", data_fechamento: "2026-08-27", data_vencimento: "2026-09-10", total_atual: -50 });
const betaOut = fatura({ id: "s-beta-out", card_id: beta.id, competencia: "2026-10-01", data_fechamento: "2026-10-20", data_vencimento: "2026-10-05", total_atual: 500 });
const STATEMENTS = [alfaOut, alfaAgo, betaOut];

function recebivel(p: {
  id: string;
  statementId: string;
  valor: number;
  status?: string;
  recebimentos?: number[];
}): ReceivableWithPerson {
  return {
    id: p.id,
    statement_id: p.statementId,
    installment_id: null,
    transaction_id: null,
    person_id: "p-ana",
    valor: p.valor,
    status: p.status ?? "pendente",
    recebimentos: (p.recebimentos ?? []).map((v, i) => ({
      id: `${p.id}-r${i}`,
      receivable_id: p.id,
      valor: v,
      recebido_em: "2026-10-01",
      observacoes: null,
      created_at: "2026-10-01T12:00:00Z",
    })),
    person: { id: "p-ana", nome: "Ana" },
  } as unknown as ReceivableWithPerson;
}

const RECEBIVEIS = [
  recebivel({ id: "r1", statementId: alfaOut.id, valor: 300 }),
  // `ignorado` com 80 recebidos: só o que ele pagou conta como parte do terceiro.
  recebivel({ id: "r2", statementId: betaOut.id, valor: 200, status: "ignorado", recebimentos: [80] }),
];

const relatorio = (over: Partial<Parameters<typeof montarRelatorioDeCartao>[0]> = {}) =>
  montarRelatorioDeCartao({
    hoje: HOJE,
    base: "competencia",
    n: 12,
    cardId: undefined,
    cards: CARTOES,
    statements: STATEMENTS,
    receivables: RECEBIVEIS,
    ...over,
  });

const mes = (r: ReturnType<typeof relatorio>, m: string) => r.porMes.find((x) => x.mes === m)?.valores;

describe("parâmetros da URL", () => {
  it("baseDoRelatorio: padrão competencia, lixo cai no padrão", () => {
    expect(baseDoRelatorio("vencimento")).toBe("vencimento");
    expect(baseDoRelatorio("competencia")).toBe("competencia");
    expect(baseDoRelatorio("caixa")).toBe("competencia");
    expect(baseDoRelatorio(undefined)).toBe("competencia");
  });

  it("periodoDoRelatorio: 6 ou 12, o resto cai em 12", () => {
    expect(periodoDoRelatorio("6")).toBe(6);
    expect(periodoDoRelatorio("12")).toBe(12);
    expect(periodoDoRelatorio("24")).toBe(12);
    expect(periodoDoRelatorio("99")).toBe(12);
    expect(periodoDoRelatorio(undefined)).toBe(12);
  });
});

describe("montarRelatorioDeCartao — meses e base", () => {
  it("meses = ultimosMeses(mês de hoje, n)", () => {
    expect(relatorio().meses).toEqual(ultimosMeses("2026-11", 12));
    expect(relatorio({ n: 6 }).meses).toEqual(ultimosMeses("2026-11", 6));
    expect(relatorio().porMes.map((x) => x.mes)).toEqual(relatorio().meses);
  });

  it("a mesma fatura cai em meses diferentes conforme a base", () => {
    const comp = relatorio({ base: "competencia", cardId: alfa.id });
    expect(mes(comp, "2026-10")?.totalCent).toBe(100000);
    expect(mes(comp, "2026-11")).toBeNull();

    const venc = relatorio({ base: "vencimento", cardId: alfa.id });
    expect(mes(venc, "2026-11")?.totalCent).toBe(100000);
    expect(mes(venc, "2026-10")).toBeNull();
  });

  it("competência: soma os dois cartões do mês, com a parte dos terceiros", () => {
    // 1000 + 500; terceiros 300 (pendente, o valor) + 80 (ignorado, só o que pagou).
    expect(mes(relatorio(), "2026-10")).toEqual({ totalCent: 150000, meuCent: 112000, terceirosCent: 38000, faturas: 2 });
  });

  it("vencimento: cada fatura no mês em que vence", () => {
    const r = relatorio({ base: "vencimento" });
    expect(mes(r, "2026-11")).toEqual({ totalCent: 100000, meuCent: 70000, terceirosCent: 30000, faturas: 1 });
    expect(mes(r, "2026-10")).toEqual({ totalCent: 50000, meuCent: 42000, terceirosCent: 8000, faturas: 1 });
  });
});

describe("montarRelatorioDeCartao — ausência não é zero", () => {
  it("mês sem fatura é null, nunca zero", () => {
    const r = relatorio();
    expect(mes(r, "2026-07")).toBeNull();
    expect(mes(r, "2026-11")).toBeNull();
    expect(r.porMes.filter((x) => x.valores !== null).map((x) => x.mes)).toEqual(["2026-08", "2026-10"]);
  });

  it("período sem nenhuma fatura: totais null, todos os meses null, porCartao vazio", () => {
    const r = relatorio({ statements: [], receivables: [] });
    expect(r.totais).toBeNull();
    expect(r.porMes.every((x) => x.valores === null)).toBe(true);
    expect(r.porCartao).toEqual([]);
  });

  it("fatura fora do período não conta (e cartão só com ela não aparece)", () => {
    const antiga = fatura({ id: "s-antiga", card_id: beta.id, competencia: "2024-01-01", data_fechamento: "2024-01-20", data_vencimento: "2024-02-05", total_atual: 900 });
    const r = relatorio({ statements: [alfaOut, antiga] });
    expect(r.totais?.faturas).toBe(1);
    expect(r.porCartao.map((x) => x.card.id)).toEqual([alfa.id]);
  });

  it("fatura real com total 0 é zero MEDIDO: o mês não é null", () => {
    const zero = fatura({ id: "s-zero", card_id: alfa.id, competencia: "2026-09-01", data_fechamento: "2026-09-27", data_vencimento: "2026-10-10", total_atual: 0 });
    const r = relatorio({ statements: [zero], receivables: [] });
    expect(mes(r, "2026-09")).toEqual({ totalCent: 0, meuCent: 0, terceirosCent: 0, faturas: 1 });
    expect(r.totais).toEqual({ totalCent: 0, meuCent: 0, terceirosCent: 0, faturas: 1 });
  });

  it("fatura sem cartão é ignorada na contagem e nos valores", () => {
    const orfa = fatura({ id: "s-orfa", card_id: null, competencia: "2026-10-01", data_fechamento: "2026-10-20", data_vencimento: "2026-11-05", total_atual: 777 });
    const r = relatorio({ statements: [...STATEMENTS, orfa] });
    expect(mes(r, "2026-10")?.faturas).toBe(2);
    expect(mes(r, "2026-10")?.totalCent).toBe(150000);
  });
});

describe("montarRelatorioDeCartao — totais e por cartão", () => {
  it("Σ por cartão = totais (total, meu, terceiros, faturas)", () => {
    for (const base of ["competencia", "vencimento"] as const) {
      const r = relatorio({ base });
      expect(r.totais).not.toBeNull();
      const soma = r.porCartao.reduce(
        (a, x) => ({
          totalCent: a.totalCent + x.valores.totalCent,
          meuCent: a.meuCent + x.valores.meuCent,
          terceirosCent: a.terceirosCent + x.valores.terceirosCent,
          faturas: a.faturas + x.valores.faturas,
        }),
        { totalCent: 0, meuCent: 0, terceirosCent: 0, faturas: 0 },
      );
      expect(soma).toEqual(r.totais);
    }
    expect(relatorio().totais).toEqual({ totalCent: 145000, meuCent: 107000, terceirosCent: 38000, faturas: 3 });
  });

  it("total = meu + terceiros em todo mês e no total", () => {
    const r = relatorio();
    for (const { valores } of r.porMes) {
      if (valores) expect(valores.meuCent + valores.terceirosCent).toBe(valores.totalCent);
    }
    expect(r.totais!.meuCent + r.totais!.terceirosCent).toBe(r.totais!.totalCent);
  });

  it("porCartao: ativos antes, só quem teve fatura", () => {
    const r = relatorio();
    expect(r.porCartao.map((x) => x.card.nome)).toEqual(["Alfa", "Beta"]);
    expect(r.porCartao[0].valores).toEqual({ totalCent: 95000, meuCent: 65000, terceirosCent: 30000, faturas: 2 });
    expect(r.porCartao[1].valores).toEqual({ totalCent: 50000, meuCent: 42000, terceirosCent: 8000, faturas: 1 });

    const semBeta = relatorio({ statements: [alfaOut, alfaAgo], receivables: [RECEBIVEIS[0]] });
    expect(semBeta.porCartao.map((x) => x.card.id)).toEqual([alfa.id]);
  });

  it("cartão que a leitura não trouxe aparece como 'Cartão sem nome' e Σ continua fechando", () => {
    const r = relatorio({ cards: [alfa] });
    expect(r.porCartao.map((x) => x.card.nome)).toEqual(["Alfa", "Cartão sem nome"]);
    expect(r.porCartao[1].card.id).toBe(beta.id);
    expect(r.porCartao[1].card.ativo).toBe(false);
    expect(r.porCartao.reduce((s, x) => s + x.valores.totalCent, 0)).toBe(r.totais!.totalCent);
  });
});

describe("montarRelatorioDeCartao — filtro de cartão", () => {
  it("cardId de um cartão restringe porMes, totais e porCartao", () => {
    const r = relatorio({ cardId: alfa.id });
    expect(r.cardId).toBe(alfa.id);
    expect(mes(r, "2026-10")).toEqual({ totalCent: 100000, meuCent: 70000, terceirosCent: 30000, faturas: 1 });
    expect(r.totais).toEqual({ totalCent: 95000, meuCent: 65000, terceirosCent: 30000, faturas: 2 });
    expect(r.porCartao.map((x) => x.card.id)).toEqual([alfa.id]);
  });

  it("cartão filtrado sem fatura no período: totais null", () => {
    const r = relatorio({ cardId: beta.id, statements: [alfaOut] });
    expect(r.cardId).toBe(beta.id);
    expect(r.totais).toBeNull();
    expect(r.porCartao).toEqual([]);
  });

  it("cardId desconhecido vira null e vale como todos", () => {
    const todos = relatorio();
    const lixo = relatorio({ cardId: "id-de-outro-dono" });
    expect(lixo.cardId).toBeNull();
    expect(lixo).toEqual(todos);
    expect(relatorio({ cardId: "" }).cardId).toBeNull();
  });
});

describe("montarRelatorioDeCartao — crédito e terceiros", () => {
  it("crédito (total < 0) entra com sinal, no mês e no total", () => {
    const r = relatorio({ cardId: alfa.id });
    expect(mes(r, "2026-08")).toEqual({ totalCent: -5000, meuCent: -5000, terceirosCent: 0, faturas: 1 });
    expect(r.totais!.totalCent).toBe(100000 - 5000);
  });

  it("terceiros (incluindo ignorado) conciliam com parteDosTerceirosPorFatura", () => {
    const porFatura = parteDosTerceirosPorFatura(
      RECEBIVEIS.map((r) => ({
        statement_id: r.statement_id,
        installment_id: r.installment_id,
        valor: r.valor,
        status: r.status,
        recebido: resumirRecebivel(r).recebido,
      })),
    );
    const esperado = (porFatura.get(alfaOut.id) ?? 0) + (porFatura.get(betaOut.id) ?? 0);
    expect(esperado).toBe(38000);
    expect(mes(relatorio(), "2026-10")?.terceirosCent).toBe(esperado);
    expect(relatorio().totais?.terceirosCent).toBe(esperado);
  });
});
