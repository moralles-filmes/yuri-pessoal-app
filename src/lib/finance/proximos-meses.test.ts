/**
 * REDESIGN-05-C — testes de `montarProximosMeses` (grade mês × cartão).
 *
 * Fixture com `hoje = 2026-11-02`:
 *  - A: ativo, fecha 27, vence 10 (vence no mês seguinte ao fechamento).
 *  - B: ativo, fecha 1,  vence 8  (vence no mesmo mês do fechamento).
 *  - C: DESATIVADO, fecha 15, vence 25.
 *  - D: ativo, fecha 31, vence 10 (mês curto: fevereiro clampa o fechamento).
 */
import { describe, expect, it } from "vitest";
import {
  faturasPorMes,
  mesDe,
  parteDosTerceirosPorFatura,
  type DashStatement,
} from "@/lib/finance/dashboard";
import { montarEntradas } from "@/lib/finance/pipeline";
import { reaisParaCentavos } from "@/lib/format";
import type { ReceivableWithPerson } from "@/types/database";
import type { CartaoDaCentral } from "./central-cartoes";
import { horizonteDeMeses, montarProximosMeses, type CelulaDoMes } from "./proximos-meses";

const HOJE = "2026-11-02";

const A: CartaoDaCentral = { id: "c-a", nome: "Alfa", cor: "#7a3ff2", ativo: true, dia_fechamento: 27, dia_vencimento: 10 };
const B: CartaoDaCentral = { id: "c-b", nome: "Beta", cor: "#2fa84f", ativo: true, dia_fechamento: 1, dia_vencimento: 8 };
const C: CartaoDaCentral = { id: "c-c", nome: "Aaa Desativado", cor: "#999999", ativo: false, dia_fechamento: 15, dia_vencimento: 25 };
const D: CartaoDaCentral = { id: "c-d", nome: "Delta", cor: "#111111", ativo: true, dia_fechamento: 31, dia_vencimento: 10 };

function fatura(
  p: Partial<DashStatement> &
    Pick<DashStatement, "id" | "card_id" | "competencia" | "data_fechamento" | "data_vencimento">,
): DashStatement {
  return { pago_em: null, total_atual: 0, ...p };
}

function recebivel(statementId: string, personId: string, valor: number): ReceivableWithPerson {
  return {
    id: `r-${statementId}-${personId}`,
    statement_id: statementId,
    installment_id: null,
    transaction_id: null,
    person_id: personId,
    valor,
    status: "pendente",
    recebimentos: [],
    person: { id: personId, nome: personId },
  } as unknown as ReceivableWithPerson;
}

const aNov = fatura({ id: "s-a-nov", card_id: A.id, competencia: "2026-11-01", data_fechamento: "2026-11-27", data_vencimento: "2026-12-10", total_atual: 3480 });
const bNovPaga = fatura({ id: "s-b-nov", card_id: B.id, competencia: "2026-11-01", data_fechamento: "2026-11-01", data_vencimento: "2026-11-08", total_atual: 500, pago_em: "2026-11-02T12:00:00Z" });
const bJanZero = fatura({ id: "s-b-jan", card_id: B.id, competencia: "2027-01-01", data_fechamento: "2027-01-01", data_vencimento: "2027-01-08", total_atual: 0 });

const RECEBIVEIS = [recebivel(aNov.id, "p-ana", 1000)];

const montar = (over: Partial<Parameters<typeof montarProximosMeses>[0]> = {}) =>
  montarProximosMeses({
    hoje: HOJE,
    n: 6,
    cards: [A, B, C],
    statements: [aNov, bNovPaga, bJanZero],
    receivables: RECEBIVEIS,
    ...over,
  });

function celula(r: ReturnType<typeof montar>, cardId: string, mes: string): CelulaDoMes {
  const c = r.celulas[cardId]?.[mes];
  if (!c) throw new Error(`sem célula ${cardId}/${mes}`);
  return c;
}

describe("horizonteDeMeses", () => {
  it("aceita só 3, 6 e 12; o resto vale 6", () => {
    expect(horizonteDeMeses("3")).toBe(3);
    expect(horizonteDeMeses("12")).toBe(12);
    expect(horizonteDeMeses("6")).toBe(6);
    expect(horizonteDeMeses(undefined)).toBe(6);
    expect(horizonteDeMeses("99")).toBe(6);
    expect(horizonteDeMeses("6abc")).toBe(6);
    expect(horizonteDeMeses("")).toBe(6);
  });
});

describe("montarProximosMeses — meses", () => {
  it("n=6 vai de nov/2026 a abr/2027", () => {
    expect(montar().meses).toEqual(["2026-11", "2026-12", "2027-01", "2027-02", "2027-03", "2027-04"]);
  });

  it("n=3 em dezembro cruza o ano", () => {
    expect(montar({ hoje: "2026-12-10", n: 3 }).meses).toEqual(["2026-12", "2027-01", "2027-02"]);
  });
});

describe("montarProximosMeses — células reais", () => {
  it("real aberta: valores em centavos e meu = total − terceiros", () => {
    const c = celula(montar(), A.id, "2026-11");
    expect(c.tipo).toBe("real");
    if (c.tipo !== "real") return;
    expect(c.estado).toBe("aberta");
    expect(c.tabela).toBe("abertas");
    expect(c.aPagar).toBe(false);
    expect(c.credito).toBe(false);
    expect(c.totalCent).toBe(348000);
    const { recs } = montarEntradas({
      recebiveis: RECEBIVEIS.map((r) => ({ ...r, statement: null, transaction: null })),
    });
    const terc = parteDosTerceirosPorFatura(recs).get(aNov.id) ?? 0;
    expect(terc).toBeGreaterThan(0);
    expect(c.meuCent).toBe(348000 - terc);
    expect(c.href).toBe("/faturas?card=c-a&month=2026-11");
    expect(c.dataFechamento).toBe("2026-11-27");
    expect(c.dataVencimento).toBe("2026-12-10");
  });

  it("real paga: não é a pagar, entra no total e conta em qtdPagas", () => {
    const r = montar();
    const c = celula(r, B.id, "2026-11");
    expect(c.tipo).toBe("real");
    if (c.tipo !== "real") return;
    expect(c.estado).toBe("paga");
    expect(c.aPagar).toBe(false);
    expect(c.tabela).toBe("fechadas");
    expect(c.pagoEm).toBe("2026-11-02T12:00:00Z");
    const t = r.totais["2026-11"];
    expect(t?.qtdPagas).toBe(1);
    expect(t?.totalCent).toBe(348000 + 50000);
  });

  it("zero medido é real com totalCent 0 e nada a pagar", () => {
    const c = celula(montar(), B.id, "2027-01");
    expect(c.tipo).toBe("real");
    if (c.tipo !== "real") return;
    expect(c.totalCent).toBe(0);
    expect(c.aPagar).toBe(false);
  });

  it("zero medido vencido e não pago é atrasada, mas não é a pagar", () => {
    const c = celula(montar({ hoje: "2027-01-20" }), B.id, "2027-01");
    expect(c.tipo).toBe("real");
    if (c.tipo !== "real") return;
    expect(c.estado).toBe("atrasada");
    expect(c.aPagar).toBe(false);
  });

  it("fechada e atrasada com total > 0 são a pagar", () => {
    const fechada = fatura({ id: "s-a-dez", card_id: A.id, competencia: "2026-12-01", data_fechamento: "2026-12-27", data_vencimento: "2027-01-10", total_atual: 100 });
    const r = montar({ hoje: "2026-12-28", statements: [fechada] });
    const c = celula(r, A.id, "2026-12");
    if (c.tipo !== "real") throw new Error("esperava real");
    expect(c.estado).toBe("fechada");
    expect(c.aPagar).toBe(true);
    const vencida = fatura({ id: "s-a-dez2", card_id: A.id, competencia: "2026-12-01", data_fechamento: "2026-12-05", data_vencimento: "2026-12-15", total_atual: 100 });
    const r2 = montar({ hoje: "2026-12-28", statements: [vencida] });
    const c2 = celula(r2, A.id, "2026-12");
    if (c2.tipo !== "real") throw new Error("esperava real");
    expect(c2.estado).toBe("atrasada");
    expect(c2.aPagar).toBe(true);
  });

  it("crédito: credito=true, não é a pagar, entra no total com sinal", () => {
    const cred = fatura({ id: "s-a-cred", card_id: A.id, competencia: "2026-12-01", data_fechamento: "2026-12-27", data_vencimento: "2027-01-10", total_atual: -50 });
    const r = montar({ hoje: "2026-12-28", statements: [cred] });
    const c = celula(r, A.id, "2026-12");
    if (c.tipo !== "real") throw new Error("esperava real");
    expect(c.credito).toBe(true);
    expect(c.aPagar).toBe(false);
    expect(c.totalCent).toBe(-5000);
    expect(r.totais["2026-12"]?.totalCent).toBe(-5000);
  });
});

describe("montarProximosMeses — células sem fatura real", () => {
  it("prevista: ciclo ainda não fechou", () => {
    const c = celula(montar(), A.id, "2027-03");
    expect(c).toEqual({
      tipo: "prevista",
      dataFechamento: "2027-03-27",
      dataVencimento: "2027-04-10",
      href: "/faturas?card=c-a&month=2027-03",
    });
  });

  it("fechou sem lançamentos: o ciclo já fechou (B fecha dia 1)", () => {
    expect(celula(montar({ statements: [] }), B.id, "2026-11")).toEqual({ tipo: "fechou-sem-lancamentos" });
  });

  it("dia exato do fechamento nunca é prevista", () => {
    const r = montar({ hoje: "2026-11-27", statements: [] });
    expect(celula(r, A.id, "2026-11")).toEqual({ tipo: "fechou-sem-lancamentos" });
    expect(celula(montar({ hoje: "2026-11-26", statements: [] }), A.id, "2026-11").tipo).toBe("prevista");
  });

  it("dia_fechamento 31 em fevereiro: prevista com fechamento em 28/02", () => {
    const r = montar({ cards: [A, B, D], statements: [] });
    const c = celula(r, D.id, "2027-02");
    expect(c.tipo).toBe("prevista");
    if (c.tipo !== "prevista") return;
    expect(c.dataFechamento).toBe("2027-02-28");
    expect(c.href).toBe("/faturas?card=c-d&month=2027-02");
    // E a célula de janeiro continua em janeiro.
    const jan = celula(r, D.id, "2027-01");
    if (jan.tipo !== "prevista") throw new Error("esperava prevista");
    expect(jan.dataFechamento).toBe("2027-01-31");
  });

  it("fatura real com competência no horizonte entra mesmo com datas fora do ciclo calculado", () => {
    const reconfig = fatura({ id: "s-a-dez", card_id: A.id, competencia: "2026-12-01", data_fechamento: "2026-12-05", data_vencimento: "2026-12-15", total_atual: 900 });
    const r = montar({ statements: [reconfig] });
    const c = celula(r, A.id, "2026-12");
    expect(c.tipo).toBe("real");
    if (c.tipo !== "real") return;
    expect(c.totalCent).toBe(90000);
    expect(c.dataFechamento).toBe("2026-12-05");
    // Não há prevista extra em dezembro para A.
    const tipos = r.meses.map((m) => celula(r, A.id, m).tipo);
    expect(tipos.filter((t) => t === "real")).toHaveLength(1);
    expect(r.totais["2026-12"]?.qtdPrevistas).toBe(r.cartoes.filter((c2) => c2.ativo && c2.id !== A.id).length);
  });

  it("desativado sem fatura real: não projeta", () => {
    const r = montar({ statements: [aNov] });
    // C não está em cartoes sem real; vira coluna quando há uma real no horizonte.
    expect(r.cartoes.map((c) => c.id)).not.toContain(C.id);
    const cReal = fatura({ id: "s-c-nov", card_id: C.id, competencia: "2026-11-01", data_fechamento: "2026-11-15", data_vencimento: "2026-11-25", total_atual: 70 });
    const r2 = montar({ hoje: "2026-11-20", statements: [cReal] });
    expect(r2.cartoes.map((c) => c.id)).toContain(C.id);
    expect(celula(r2, C.id, "2026-12")).toEqual({ tipo: "nao-projeta" });
    expect(celula(r2, C.id, "2027-04")).toEqual({ tipo: "nao-projeta" });
    const nov = celula(r2, C.id, "2026-11");
    if (nov.tipo !== "real") throw new Error("esperava real");
    expect(nov.estado).toBe("fechada");
    expect(nov.aPagar).toBe(true);
  });

  it("desativado com fatura real FORA do horizonte não vira coluna", () => {
    const velha = fatura({ id: "s-c-set", card_id: C.id, competencia: "2026-09-01", data_fechamento: "2026-09-15", data_vencimento: "2026-09-25", total_atual: 70 });
    const r = montar({ statements: [velha] });
    expect(r.cartoes.map((c) => c.id)).not.toContain(C.id);
  });
});

describe("montarProximosMeses — colunas", () => {
  it("ativos antes (por nome), depois desativados", () => {
    const cReal = fatura({ id: "s-c-nov", card_id: C.id, competencia: "2026-11-01", data_fechamento: "2026-11-15", data_vencimento: "2026-11-25", total_atual: 70 });
    const r = montar({ cards: [C, B, A], statements: [cReal] });
    expect(r.cartoes.map((c) => c.id)).toEqual([A.id, B.id, C.id]);
  });

  it("vazio: nenhum cartão ativo e nenhuma real de desativado no horizonte", () => {
    expect(montar({ cards: [C], statements: [] }).vazio).toBe(true);
    expect(montar({ cards: [], statements: [] }).vazio).toBe(true);
    expect(montar().vazio).toBe(false);
  });
});

describe("montarProximosMeses — totais", () => {
  it("Σ das células reais = faturasPorMes em centavos", () => {
    const r = montar();
    const { recs } = montarEntradas({
      recebiveis: RECEBIVEIS.map((x) => ({ ...x, statement: null, transaction: null })),
    });
    const ref = faturasPorMes({
      statements: [aNov, bNovPaga, bJanZero],
      receivables: recs,
      meses: r.meses,
      agrupar: "competencia",
    });
    for (const f of ref) {
      const t = r.totais[f.mes];
      const soma = r.cartoes.reduce((s, c) => {
        const cel = r.celulas[c.id]?.[f.mes];
        return s + (cel?.tipo === "real" ? cel.totalCent : 0);
      }, 0);
      if (t === null) {
        expect(soma).toBe(0);
        continue;
      }
      expect(t.totalCent).toBe(reaisParaCentavos(f.total));
      expect(t.meuCent).toBe(reaisParaCentavos(f.meu));
      expect(soma).toBe(t.totalCent);
    }
    expect(mesDe("2026-11-01")).toBe("2026-11");
  });

  it("mês só com previstas ⇒ null", () => {
    expect(montar().totais["2027-03"]).toBeNull();
  });

  it("mês com real e prevista conta a prevista", () => {
    const r = montar();
    // dez: A tem real? não. Nov: A real + B real, sem previstas entre A/B (C fica de fora).
    expect(r.totais["2026-11"]?.qtdPrevistas).toBe(0);
    const comD = montar({ cards: [A, B, C, D] });
    expect(comD.totais["2026-11"]?.qtdPrevistas).toBe(1);
  });
});

describe("montarProximosMeses — atrasadas antes do horizonte", () => {
  it("atrasada com total > 0 e competência anterior entra", () => {
    const set = fatura({ id: "s-a-set", card_id: A.id, competencia: "2026-09-01", data_fechamento: "2026-09-27", data_vencimento: "2026-10-10", total_atual: 250 });
    const r = montar({ statements: [set] });
    expect(r.atrasadasAntes).toEqual([{ cardId: A.id, cardNome: "Alfa", competencia: "2026-09" }]);
  });

  it("total 0 vencida não entra; paga não entra", () => {
    const zero = fatura({ id: "s-a-set", card_id: A.id, competencia: "2026-09-01", data_fechamento: "2026-09-27", data_vencimento: "2026-10-10", total_atual: 0 });
    const paga = fatura({ id: "s-b-set", card_id: B.id, competencia: "2026-09-01", data_fechamento: "2026-09-01", data_vencimento: "2026-09-08", total_atual: 90, pago_em: "2026-09-05T12:00:00Z" });
    expect(montar({ statements: [zero, paga] }).atrasadasAntes).toEqual([]);
  });
});
