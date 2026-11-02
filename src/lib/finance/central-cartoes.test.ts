/**
 * REDESIGN-05-A — testes de `montarVisaoGeral` (Visão geral da central de cartões).
 *
 * Fixture de QUATRO cartões (a lição do desenho §7: uma fixture de um cartão escondeu o 6×N),
 * com `hoje = 2026-11-02`, que reproduz a prévia aprovada:
 *  - Roxinho:    ativo, fecha 27, vence 10 (vence no mês SEGUINTE ao fechamento).
 *  - Laranjinha: ativo, fecha 28, vence 5  (idem).
 *  - Verdinho:   ativo, fecha 1,  vence 8  (vence no MESMO mês do fechamento).
 *  - Azulzinho:  INATIVO, fecha 21, vence 28 (mesmo mês).
 *
 * Datas coerentes com `resolverFatura`/`montarFatura`: o Verdinho fecha dia 1, então a fatura
 * fechada de hoje tem competência 2026-11 (fecha 01/11, vence 08/11) e o ciclo aberto é o de
 * 2026-12 (fecha 01/12). Os valores e as contagens são os da prévia.
 */
import { describe, expect, it } from "vitest";
import type { DashStatement } from "@/lib/finance/dashboard";
import { parteDosTerceirosPorFatura } from "@/lib/finance/dashboard";
import { resumirRecebivel } from "@/lib/finance/recebimentos";
import type { ReceivableWithPerson } from "@/types/database";
import {
  cicloEmAberto,
  montarVisaoGeral,
  parteDosTerceirosPorPessoa,
  type CartaoDaCentral,
  type LinhaDaCentral,
} from "./central-cartoes";

const HOJE = "2026-11-02";

const roxinho: CartaoDaCentral = { id: "c-rox", nome: "Roxinho", cor: "#7a3ff2", ativo: true, dia_fechamento: 27, dia_vencimento: 10 };
const laranjinha: CartaoDaCentral = { id: "c-lar", nome: "Laranjinha", cor: "#f28a1c", ativo: true, dia_fechamento: 28, dia_vencimento: 5 };
const verdinho: CartaoDaCentral = { id: "c-ver", nome: "Verdinho", cor: "#2fa84f", ativo: true, dia_fechamento: 1, dia_vencimento: 8 };
const azulzinho: CartaoDaCentral = { id: "c-azu", nome: "Azulzinho", cor: "#2b6cdf", ativo: false, dia_fechamento: 21, dia_vencimento: 28 };
const CARTOES = [roxinho, laranjinha, verdinho, azulzinho];

function fatura(p: Partial<DashStatement> & Pick<DashStatement, "id" | "card_id" | "competencia" | "data_fechamento" | "data_vencimento">): DashStatement {
  return { pago_em: null, total_atual: 0, ...p };
}

/** Faturas fechadas da prévia (e a aberta do Roxinho / Verdinho). */
const azuOut = fatura({ id: "s-azu-out", card_id: azulzinho.id, competencia: "2026-10-01", data_fechamento: "2026-10-21", data_vencimento: "2026-10-28", total_atual: 640 });
const larOut = fatura({ id: "s-lar-out", card_id: laranjinha.id, competencia: "2026-10-01", data_fechamento: "2026-10-28", data_vencimento: "2026-11-05", total_atual: 1754.4 });
const verFechada = fatura({ id: "s-ver-fech", card_id: verdinho.id, competencia: "2026-11-01", data_fechamento: "2026-11-01", data_vencimento: "2026-11-08", total_atual: -35 });
const roxOut = fatura({ id: "s-rox-out", card_id: roxinho.id, competencia: "2026-10-01", data_fechamento: "2026-10-27", data_vencimento: "2026-11-10", total_atual: 2010, pago_em: "2026-11-01T13:00:00Z" });
const roxNov = fatura({ id: "s-rox-nov", card_id: roxinho.id, competencia: "2026-11-01", data_fechamento: "2026-11-27", data_vencimento: "2026-12-10", total_atual: 3480 });
const verAberta = fatura({ id: "s-ver-ab", card_id: verdinho.id, competencia: "2026-12-01", data_fechamento: "2026-12-01", data_vencimento: "2026-12-08", total_atual: 0 });

const STATEMENTS = [azuOut, larOut, verFechada, roxOut, roxNov, verAberta];

function recebivel(p: {
  id: string;
  statementId: string;
  personId: string;
  nome: string | null;
  valor: number;
  status?: string;
  recebimentos?: number[];
}): ReceivableWithPerson {
  return {
    id: p.id,
    statement_id: p.statementId,
    installment_id: null,
    transaction_id: null,
    person_id: p.personId,
    valor: p.valor,
    status: p.status ?? "pendente",
    recebimentos: (p.recebimentos ?? []).map((v, i) => ({
      id: `${p.id}-r${i}`,
      receivable_id: p.id,
      valor: v,
      recebido_em: "2026-11-01",
      observacoes: null,
      created_at: "2026-11-01T12:00:00Z",
    })),
    person: p.nome === null ? null : { id: p.personId, nome: p.nome },
  } as unknown as ReceivableWithPerson;
}

const RECEBIVEIS = [
  recebivel({ id: "r1", statementId: larOut.id, personId: "p-ana", nome: "Ana", valor: 482 }),
  recebivel({ id: "r2", statementId: roxOut.id, personId: "p-ana", nome: "Ana", valor: 410 }),
  recebivel({ id: "r3", statementId: roxNov.id, personId: "p-ana", nome: "Ana", valor: 835.2 }),
  recebivel({ id: "r4", statementId: roxNov.id, personId: "p-bru", nome: "Bruno", valor: 487.2 }),
];

const visao = (over: Partial<Parameters<typeof montarVisaoGeral>[0]> = {}) =>
  montarVisaoGeral({ hoje: HOJE, cards: CARTOES, statements: STATEMENTS, receivables: RECEBIVEIS, ...over });

const linha = (linhas: LinhaDaCentral[], cardId: string, comp: string) =>
  linhas.find((l) => l.card.id === cardId && l.competencia === comp);

describe("montarVisaoGeral — fechadas", () => {
  it("fechadas: atrasada de desativado entra e soma", () => {
    const l = linha(visao().fechadas, azulzinho.id, "2026-10");
    expect(l).toBeDefined();
    expect(l?.estado).toBe("atrasada");
    expect(l?.card.ativo).toBe(false);
    expect(l?.entraNaSoma).toBe(true);
    expect(l?.valores?.totalCent).toBe(64000);
  });

  it("fechadas: paga fica até o vencimento, fora da soma", () => {
    const l = linha(visao().fechadas, roxinho.id, "2026-10");
    expect(l?.estado).toBe("paga");
    expect(l?.entraNaSoma).toBe(false);
    expect(l?.dataVencimento).toBe("2026-11-10");
    expect(l?.pagoEm).toBe("2026-11-01T13:00:00Z");
    // Depois do vencimento a linha some.
    const depois = montarVisaoGeral({ hoje: "2026-11-11", cards: CARTOES, statements: STATEMENTS, receivables: RECEBIVEIS });
    expect(linha(depois.fechadas, roxinho.id, "2026-10")).toBeUndefined();
  });

  it("fechadas: crédito fora da soma", () => {
    const l = linha(visao().fechadas, verdinho.id, "2026-11");
    expect(l).toBeDefined();
    expect(l?.credito).toBe(true);
    expect(l?.entraNaSoma).toBe(false);
    expect(l?.valores?.totalCent).toBe(-3500);
    expect(l?.dataVencimento).toBe("2026-11-08");
  });

  it("totais da prévia", () => {
    const v = visao();
    expect(v.aPagar).toEqual({ totalCent: 239440, meuCent: 191240 });
    expect(v.qtdAPagar).toBe(2);
    expect(v.qtdAtrasadas).toBe(1);
    expect(v.proximoVencimento).toBe("2026-11-05");
    expect(v.fechadas.map((l) => l.card.nome)).toEqual(["Azulzinho", "Laranjinha", "Verdinho", "Roxinho"]);
  });

  it("duas não pagas do mesmo cartão = duas linhas, as duas na soma", () => {
    const setembro = fatura({ id: "s-lar-set", card_id: laranjinha.id, competencia: "2026-09-01", data_fechamento: "2026-09-28", data_vencimento: "2026-10-05", total_atual: 300 });
    const v = visao({ statements: [...STATEMENTS, setembro] });
    const doLaranjinha = v.fechadas.filter((l) => l.card.id === laranjinha.id);
    expect(doLaranjinha.map((l) => l.estado)).toEqual(["atrasada", "fechada"]);
    expect(v.aPagar).toEqual({ totalCent: 239440 + 30000, meuCent: 191240 + 30000 });
    expect(v.qtdAPagar).toBe(3);
    expect(v.qtdAtrasadas).toBe(2);
  });

  it("fechamento hoje vai para fechadas", () => {
    const v = montarVisaoGeral({ hoje: "2026-11-27", cards: CARTOES, statements: STATEMENTS, receivables: RECEBIVEIS });
    const fechada = linha(v.fechadas, roxinho.id, "2026-11");
    expect(fechada?.estado).toBe("fechada");
    expect(fechada?.entraNaSoma).toBe(true);
    expect(linha(v.abertas, roxinho.id, "2026-11")).toBeUndefined();
    expect(linha(v.abertas, roxinho.id, "2026-12")?.estado).toBe("prevista");
  });
});

describe("montarVisaoGeral — em aberto", () => {
  it("abertas: prevista sem valor e fora da soma", () => {
    const v = visao();
    const prevista = linha(v.abertas, laranjinha.id, "2026-11");
    expect(prevista?.estado).toBe("prevista");
    expect(prevista?.valores).toBeNull();
    expect(prevista?.statementId).toBeNull();
    expect(prevista?.entraNaSoma).toBe(false);
    expect(prevista?.dataFechamento).toBe("2026-11-28");
    expect(prevista?.dataVencimento).toBe("2026-12-05");
    // Roxinho 3480,00 (Ana 835,20 e Bruno 487,20) + Verdinho 0,00; a prevista não entra.
    expect(v.emAberto).toEqual({ totalCent: 348000, meuCent: 348000 - 83520 - 48720 });
    // Só previstas → sem número.
    const soPrevistas = montarVisaoGeral({ hoje: HOJE, cards: [laranjinha], statements: [], receivables: [] });
    expect(soPrevistas.emAberto).toBeNull();
    expect(soPrevistas.abertas).toHaveLength(1);
  });

  it("abertas: desativado não tem linha", () => {
    expect(visao().abertas.some((l) => l.card.id === azulzinho.id)).toBe(false);
    expect(visao().abertas.map((l) => l.card.nome)).toEqual(["Roxinho", "Laranjinha", "Verdinho"]); // por fechamento: 27/11, 28/11, 01/12
  });

  it("zero medido é zero, não prevista", () => {
    const l = linha(visao().abertas, verdinho.id, "2026-12");
    expect(l?.estado).toBe("aberta");
    expect(l?.valores?.totalCent).toBe(0);
    expect(l?.entraNaSoma).toBe(true);
  });

  it("paga antes de fechar fica em abertas", () => {
    const paga = { ...roxNov, pago_em: "2026-11-02T01:30:00Z" };
    const v = visao({ statements: [azuOut, larOut, verFechada, roxOut, paga, verAberta] });
    const l = linha(v.abertas, roxinho.id, "2026-11");
    expect(l?.estado).toBe("paga");
    expect(l?.entraNaSoma).toBe(false);
    expect(linha(v.fechadas, roxinho.id, "2026-11")).toBeUndefined();
    // Fora da soma: só o Verdinho (0,00) acumula.
    expect(v.emAberto).toEqual({ totalCent: 0, meuCent: 0 });
  });

  it("virada de ano", () => {
    const v = montarVisaoGeral({
      hoje: "2026-12-29",
      cards: [{ ...roxinho, dia_fechamento: 28, dia_vencimento: 5 }],
      statements: [],
      receivables: [],
    });
    expect(v.abertas).toHaveLength(1);
    expect(v.abertas[0].competencia).toBe("2027-01");
    expect(v.abertas[0].dataFechamento).toBe("2027-01-28");
    expect(v.abertas[0].estado).toBe("prevista");
  });
});

describe("montarVisaoGeral — por pessoa", () => {
  it("por pessoa fecha com parteDosTerceirosPorFatura (ignorado e parcial incluídos)", () => {
    const extras = [
      // `ignorado` com 100 recebidos: só o que ele pagou conta como parte do terceiro.
      recebivel({ id: "r5", statementId: larOut.id, personId: "p-bru", nome: "Bruno", valor: 300, status: "ignorado", recebimentos: [100] }),
      // Parcial: o VALOR conta, não o saldo.
      recebivel({ id: "r6", statementId: roxNov.id, personId: "p-ana", nome: "Ana", valor: 200, status: "parcial", recebimentos: [50] }),
    ];
    const recs = [...RECEBIVEIS, ...extras];
    const v = visao({ receivables: recs });
    const terceiros = parteDosTerceirosPorFatura(
      recs.map((r) => ({
        statement_id: r.statement_id,
        installment_id: r.installment_id,
        valor: r.valor,
        status: r.status,
        recebido: resumirRecebivel(r).recebido,
      })),
    );
    const reais = [...v.fechadas, ...v.abertas].filter((l) => l.valores);
    expect(reais.length).toBeGreaterThan(0);
    for (const l of reais) {
      const soma = Object.values(l.valores!.porPessoaCent).reduce((s, c) => s + c, 0);
      expect(soma).toBe(l.valores!.totalCent - l.valores!.meuCent);
      expect(soma).toBe(terceiros.get(l.statementId!) ?? 0);
    }
    expect(linha(v.fechadas, laranjinha.id, "2026-10")?.valores?.porPessoaCent).toEqual({ "p-ana": 48200, "p-bru": 10000 });
    expect(linha(v.abertas, roxinho.id, "2026-11")?.valores?.porPessoaCent).toEqual({ "p-ana": 83520 + 20000, "p-bru": 48720 });
  });

  it("parteDosTerceirosPorPessoa: statementId → personId → centavos", () => {
    const m = parteDosTerceirosPorPessoa(RECEBIVEIS);
    expect(m.get(roxNov.id)?.get("p-ana")).toBe(83520);
    expect(m.get(roxNov.id)?.get("p-bru")).toBe(48720);
    expect(m.get(larOut.id)?.get("p-ana")).toBe(48200);
    expect(m.has(azuOut.id)).toBe(false);
  });

  it("colunas de pessoa por tabela", () => {
    const v = visao();
    // Ana tem parte nas duas tabelas; Bruno só em abertas.
    expect(v.pessoasFechadas).toEqual([{ id: "p-ana", nome: "Ana" }]);
    expect(v.pessoasAbertas).toEqual([
      { id: "p-ana", nome: "Ana" },
      { id: "p-bru", nome: "Bruno" },
    ]);
    // Numa linha real, pessoa da tabela sem parte = 0 (zero medido).
    expect(linha(v.fechadas, azulzinho.id, "2026-10")?.valores?.porPessoaCent).toEqual({ "p-ana": 0 });
    expect(linha(v.abertas, verdinho.id, "2026-12")?.valores?.porPessoaCent).toEqual({ "p-ana": 0, "p-bru": 0 });
    // Prevista não tem valores.
    expect(linha(v.abertas, laranjinha.id, "2026-11")?.valores).toBeNull();
  });

  it("pessoa sem person vira 'Pessoa sem nome', com o id como chave", () => {
    const orfa = recebivel({ id: "r9", statementId: azuOut.id, personId: "p-orfa", nome: null, valor: 40 });
    const v = visao({ receivables: [...RECEBIVEIS, orfa] });
    expect(v.pessoasFechadas).toContainEqual({ id: "p-orfa", nome: "Pessoa sem nome" });
    expect(linha(v.fechadas, azulzinho.id, "2026-10")?.valores).toEqual({
      totalCent: 64000,
      meuCent: 60000,
      porPessoaCent: { "p-ana": 0, "p-orfa": 4000 },
    });
  });
});

describe("cicloEmAberto", () => {
  const cartao = { dia_fechamento: 27, dia_vencimento: 10 };

  it("antes do fechamento: o ciclo corrente fecha no dia 27 deste mês", () => {
    expect(cicloEmAberto("2026-11-02", cartao).dataFechamento).toBe("2026-11-27");
  });

  it("no dia do fechamento o aberto é o ciclo seguinte", () => {
    expect(cicloEmAberto("2026-11-27", cartao).dataFechamento).toBe("2026-12-27");
  });

  it("virada de ano: depois do fechamento de dezembro, a competência é janeiro", () => {
    expect(cicloEmAberto("2026-12-28", cartao).competencia.slice(0, 7)).toBe("2027-01");
  });
});

describe("montarVisaoGeral — cartões", () => {
  it("inativo sem dívida não aparece e temCartaoAtivo reflete os ativos", () => {
    const v = montarVisaoGeral({ hoje: HOJE, cards: [azulzinho], statements: [], receivables: [] });
    expect(v.fechadas).toEqual([]);
    expect(v.abertas).toEqual([]);
    expect(v.aPagar).toBeNull();
    expect(v.emAberto).toBeNull();
    expect(v.proximoVencimento).toBeNull();
    expect(v.temCartaoAtivo).toBe(false);
    expect(visao().temCartaoAtivo).toBe(true);
  });
});
