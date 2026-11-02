/**
 * REDESIGN-05-B — testes de `organizarFaturasDoCartao` (faturas de um cartão, por prioridade).
 *
 * Fixture: `hoje = 2026-11-02`, cartão que fecha 27 e vence 10 (vence no mês SEGUINTE ao
 * fechamento). Faturas reais: set (atrasada, 412,30), out (fechada, 1.754,40, terceiros 482,00),
 * nov (aberta, 3.480,00) e ago (paga). Competência = mês do fechamento.
 */
import { describe, expect, it } from "vitest";
import { parteDoTerceiroCentavos, perdoadoCentavos, resumirRecebivel } from "@/lib/finance/recebimentos";
import type { ReceivableWithPerson } from "@/types/database";
import { organizarFaturasDoCartao, type FaturaLida } from "./faturas-do-cartao";

const HOJE = "2026-11-02";
const CARD = { dia_fechamento: 27, dia_vencimento: 10 };

function fatura(p: Partial<FaturaLida> & Pick<FaturaLida, "id" | "competencia" | "data_fechamento" | "data_vencimento">): FaturaLida {
  return { pago_em: null, total_atual: 0, itens: 0, ...p };
}

const ago = fatura({ id: "s-ago", competencia: "2026-08-01", data_fechamento: "2026-08-27", data_vencimento: "2026-09-10", total_atual: 900, itens: 7, pago_em: "2026-09-09T12:00:00Z" });
const set = fatura({ id: "s-set", competencia: "2026-09-01", data_fechamento: "2026-09-27", data_vencimento: "2026-10-10", total_atual: 412.3, itens: 3 });
const out = fatura({ id: "s-out", competencia: "2026-10-01", data_fechamento: "2026-10-27", data_vencimento: "2026-11-10", total_atual: 1754.4, itens: 12 });
const nov = fatura({ id: "s-nov", competencia: "2026-11-01", data_fechamento: "2026-11-27", data_vencimento: "2026-12-10", total_atual: 3480, itens: 20 });
const STATEMENTS = [ago, set, out, nov];

function recebivel(p: {
  id: string;
  statementId: string;
  personId?: string;
  valor: number;
  status?: string;
  recebimentos?: number[];
}): ReceivableWithPerson {
  const personId = p.personId ?? "p-ana";
  return {
    id: p.id,
    statement_id: p.statementId,
    installment_id: null,
    transaction_id: null,
    person_id: personId,
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
    person: { id: personId, nome: "Ana" },
  } as unknown as ReceivableWithPerson;
}

const RECEBIVEIS = [recebivel({ id: "r1", statementId: out.id, valor: 482 })];

const organizar = (over: Partial<Parameters<typeof organizarFaturasDoCartao>[0]> = {}) =>
  organizarFaturasDoCartao({
    hoje: HOJE,
    card: CARD,
    statements: STATEMENTS,
    receivables: RECEBIVEIS,
    month: null,
    status: null,
    ...over,
  });

const comps = (l: { competencia: string }[]) => l.map((f) => f.competencia);

describe("organizarFaturasDoCartao — grupos", () => {
  it("separa pagar, em aberto, próximas e anteriores", () => {
    const { grupos } = organizar();
    expect(comps(grupos.pagar)).toEqual(["2026-09", "2026-10"]);
    expect(grupos.emAberto).toHaveLength(1);
    expect(grupos.emAberto[0].competencia).toBe("2026-11");
    expect(grupos.emAberto[0].marca).toBe("atual");
    expect(grupos.proximas).toHaveLength(1);
    expect(grupos.proximas[0].competencia).toBe("2026-12");
    expect(grupos.proximas[0].estado).toBe("prevista");
    expect(grupos.proximas[0].valores).toBeNull();
    expect(grupos.proximas[0].statementId).toBeNull();
    expect(grupos.proximas[0].chave).toBe("prevista|2026-12");
    expect(grupos.proximas[0].marca).toBe("proxima");
    expect(comps(grupos.anteriores)).toEqual(["2026-08"]);
  });

  it("atrasada vem antes da fechada, mesmo com vencimento depois", () => {
    const { grupos } = organizar({ statements: [out, set] });
    expect(grupos.pagar.map((f) => f.estado)).toEqual(["atrasada", "fechada"]);
  });

  it("entre duas atrasadas, o vencimento mais antigo vem primeiro", () => {
    const antiga = fatura({ id: "s-ago2", competencia: "2026-08-01", data_fechamento: "2026-08-27", data_vencimento: "2026-09-10", total_atual: 50 });
    const { grupos } = organizar({ statements: [set, antiga] });
    expect(comps(grupos.pagar)).toEqual(["2026-08", "2026-09"]);
  });

  it("a fatura de set (atrasada) é 'pagar' com ação pagar e tabela fechadas", () => {
    const f = organizar().grupos.pagar[0];
    expect(f.estado).toBe("atrasada");
    expect(f.acao).toBe("pagar");
    expect(f.tabela).toBe("fechadas");
    expect(f.itens).toBe(3);
  });
});

describe("organizarFaturasDoCartao — indicadores", () => {
  it("aPagar soma total e a minha parte, em centavos", () => {
    const { indicadores } = organizar();
    expect(indicadores.aPagar).toEqual({ totalCent: 216670, meuCent: 168470, qtd: 2, qtdAtrasadas: 1 });
  });

  it("próximo vencimento é o menor vencimento ainda por vir entre as a pagar", () => {
    const { indicadores } = organizar();
    expect(indicadores.proximoVencimento?.data).toBe("2026-11-10");
    expect(indicadores.proximoVencimento?.fatura.competencia).toBe("2026-10");
  });

  it("sem fatura a pagar por vir, o próximo vencimento é o da atual", () => {
    const { indicadores } = organizar({ statements: [ago, nov] });
    expect(indicadores.aPagar).toEqual({ totalCent: 0, meuCent: 0, qtd: 0, qtdAtrasadas: 0 });
    expect(indicadores.proximoVencimento?.data).toBe("2026-12-10");
  });

  it("sem a fatura real de nov, a atual é prevista e sem valor", () => {
    const { indicadores, grupos } = organizar({ statements: [ago, set, out] });
    expect(indicadores.atual?.valores).toBeNull();
    expect(indicadores.atual?.estado).toBe("prevista");
    expect(grupos.emAberto[0].chave).toBe("prevista|2026-11");
  });

  it("atual real com total zero é zero MEDIDO, não ausência", () => {
    const zero = { ...nov, total_atual: 0 };
    const { indicadores } = organizar({ statements: [zero] });
    expect(indicadores.atual?.estado).toBe("aberta");
    expect(indicadores.atual?.valores).toEqual({ totalCent: 0, meuCent: 0, terceirosCent: 0, perdoadoCent: 0 });
    expect(indicadores.atual?.acao).toBeNull();
  });

  it("cartão sem nenhuma fatura real: a pagar é zero medido; atual e próxima previstas", () => {
    const { indicadores, grupos } = organizar({ statements: [], receivables: [] });
    expect(indicadores.aPagar.totalCent).toBe(0);
    expect(indicadores.aPagar.qtd).toBe(0);
    expect(indicadores.atual?.valores).toBeNull();
    expect(grupos.emAberto).toHaveLength(1);
    expect(grupos.proximas).toHaveLength(1);
    expect(grupos.proximas[0].estado).toBe("prevista");
    expect(grupos.pagar).toEqual([]);
    expect(grupos.anteriores).toEqual([]);
  });
});

describe("organizarFaturasDoCartao — dia exato do fechamento e do vencimento", () => {
  it("no dia do fechamento a fatura que fecha hoje está em 'pagar' (fechada) e o ciclo atual é o seguinte", () => {
    const { grupos } = organizar({ hoje: "2026-10-27" });
    const f = grupos.pagar.find((x) => x.competencia === "2026-10");
    expect(f?.estado).toBe("fechada");
    expect(f?.acao).toBe("pagar");
    expect(grupos.emAberto[0].competencia).toBe("2026-11");
    expect(grupos.emAberto.some((x) => x.competencia === "2026-10")).toBe(false);
  });

  it("no dia do vencimento a fatura ainda é 'fechada'; no dia seguinte, 'atrasada'", () => {
    const noDia = organizar({ hoje: "2026-11-10" }).grupos.pagar.find((x) => x.competencia === "2026-10");
    expect(noDia?.estado).toBe("fechada");
    const depois = organizar({ hoje: "2026-11-11" }).grupos.pagar.find((x) => x.competencia === "2026-10");
    expect(depois?.estado).toBe("atrasada");
  });
});

describe("organizarFaturasDoCartao — zero, crédito e paga antes de fechar", () => {
  it("vencida e não paga com total 0: fica em 'anteriores', selo atrasada, sem ação", () => {
    const zero = { ...set, total_atual: 0 };
    const { grupos } = organizar({ statements: [zero, nov] });
    expect(grupos.pagar).toEqual([]);
    expect(comps(grupos.anteriores)).toEqual(["2026-09"]);
    expect(grupos.anteriores[0].estado).toBe("atrasada");
    expect(grupos.anteriores[0].acao).toBeNull();
  });

  it("vencida com crédito (-35): credito true, sem ação, fora de 'pagar'", () => {
    const cred = { ...set, total_atual: -35 };
    const { grupos, indicadores } = organizar({ statements: [cred, nov] });
    expect(grupos.pagar).toEqual([]);
    expect(grupos.anteriores[0].credito).toBe(true);
    expect(grupos.anteriores[0].valores?.totalCent).toBe(-3500);
    expect(grupos.anteriores[0].acao).toBeNull();
    expect(indicadores.aPagar.totalCent).toBe(0);
  });

  it("nov paga antes de fechar fica em 'emAberto', tabela abertas, com 'desfazer'", () => {
    const paga = { ...nov, pago_em: "2026-11-01T15:00:00Z" };
    const { grupos } = organizar({ statements: [paga] });
    const f = grupos.emAberto[0];
    expect(f.competencia).toBe("2026-11");
    expect(f.estado).toBe("paga");
    expect(f.tabela).toBe("abertas");
    expect(f.acao).toBe("desfazer");
    expect(f.pagoEm).toBe("2026-11-01T15:00:00Z");
  });

  it("atual paga antes de fechar, sem nada a pagar: não há 'próximo vencimento' (não é dívida)", () => {
    const paga = { ...nov, pago_em: "2026-11-01T15:00:00Z" };
    const { indicadores } = organizar({ statements: [paga] });
    expect(indicadores.proximoVencimento).toBeNull();
  });

  it("paga depois de fechar vai para 'anteriores' com 'desfazer'", () => {
    const f = organizar().grupos.anteriores[0];
    expect(f.estado).toBe("paga");
    expect(f.tabela).toBe("fechadas");
    expect(f.acao).toBe("desfazer");
  });
});

describe("organizarFaturasDoCartao — futuras e virada de ano", () => {
  it("fatura real futura (só parcelas) fica em 'proximas' depois da prevista, com 'pagar-antes'", () => {
    const jan = fatura({ id: "s-jan", competencia: "2027-01-01", data_fechamento: "2027-01-27", data_vencimento: "2027-02-10", total_atual: 200 });
    const { grupos } = organizar({ statements: [...STATEMENTS, jan] });
    expect(comps(grupos.proximas)).toEqual(["2026-12", "2027-01"]);
    expect(grupos.proximas[0].estado).toBe("prevista");
    expect(grupos.proximas[1].acao).toBe("pagar-antes");
    expect(grupos.proximas[1].marca).toBeNull();
  });

  it("real futura paga fica em 'proximas' com 'desfazer'", () => {
    const jan = fatura({ id: "s-jan", competencia: "2027-01-01", data_fechamento: "2027-01-27", data_vencimento: "2027-02-10", total_atual: 200, pago_em: "2026-11-01T12:00:00Z" });
    const { grupos } = organizar({ statements: [nov, jan] });
    const f = grupos.proximas.find((x) => x.competencia === "2027-01");
    expect(f?.acao).toBe("desfazer");
  });

  it("a real do ciclo seguinte recebe a marca 'proxima'", () => {
    const dez = fatura({ id: "s-dez", competencia: "2026-12-01", data_fechamento: "2026-12-27", data_vencimento: "2027-01-10", total_atual: 90 });
    const { grupos } = organizar({ statements: [nov, dez] });
    expect(grupos.proximas).toHaveLength(1);
    expect(grupos.proximas[0].statementId).toBe("s-dez");
    expect(grupos.proximas[0].marca).toBe("proxima");
    expect(grupos.proximas[0].acao).toBe("pagar-antes");
  });

  it("virada de ano: ciclo atual jan/2027, próximo fev/2027", () => {
    const { grupos } = organizar({ hoje: "2026-12-28" });
    expect(grupos.emAberto[0].competencia).toBe("2027-01");
    expect(grupos.proximas[0].competencia).toBe("2027-02");
  });

  it("virada de ano: ciclo atual dez, próximo jan, na ordem", () => {
    const { grupos } = organizar({ hoje: "2026-11-28", statements: [], receivables: [] });
    expect(grupos.emAberto[0].competencia).toBe("2026-12");
    expect(comps(grupos.proximas)).toEqual(["2027-01"]);
    expect(grupos.proximas[0].dataFechamento).toBe("2027-01-27");
  });

  it("competência vinda do banco como 'yyyy-MM-dd' é normalizada para 'yyyy-MM'", () => {
    const f = organizar().grupos.emAberto[0];
    expect(f.competencia).toBe("2026-11");
  });

  it("cartão reconfigurado: real do ciclo já fechada segue o próprio estado e o ciclo atual vira prevista", () => {
    // Real de 2026-11 que fechou em 01/11 (dia de fechamento antigo): hoje >= fechamento.
    const antiga = fatura({ id: "s-nov-antiga", competencia: "2026-11-01", data_fechamento: "2026-11-01", data_vencimento: "2026-11-08", total_atual: 300 });
    const { grupos } = organizar({ statements: [antiga], receivables: [] });
    expect(grupos.pagar.map((f) => f.statementId)).toEqual(["s-nov-antiga"]);
    expect(grupos.emAberto).toHaveLength(1);
    expect(grupos.emAberto[0].chave).toBe("prevista|2026-11");
    expect(grupos.emAberto[0].valores).toBeNull();
    // A mesma fatura não aparece duas vezes.
    const todas = [...grupos.pagar, ...grupos.emAberto, ...grupos.proximas, ...grupos.anteriores];
    expect(todas.filter((f) => f.statementId === "s-nov-antiga")).toHaveLength(1);
  });
});

describe("organizarFaturasDoCartao — filtros", () => {
  it("month apontando para a prevista a encontra (não 'nenhuma fatura')", () => {
    const { grupos, vazio } = organizar({ month: "2026-12" });
    expect(grupos.pagar).toEqual([]);
    expect(grupos.emAberto).toEqual([]);
    expect(grupos.anteriores).toEqual([]);
    expect(grupos.proximas).toHaveLength(1);
    expect(grupos.proximas[0].estado).toBe("prevista");
    expect(vazio).toBe(false);
  });

  it("month + status incompatível ⇒ vazio", () => {
    const r = organizar({ month: "2026-12", status: "paga" });
    expect(r.vazio).toBe(true);
    expect(r.grupos.proximas).toEqual([]);
  });

  it("status=atrasada ⇒ só set", () => {
    const { grupos } = organizar({ status: "atrasada" });
    expect(comps(grupos.pagar)).toEqual(["2026-09"]);
    expect(grupos.emAberto).toEqual([]);
    expect(grupos.proximas).toEqual([]);
    expect(grupos.anteriores).toEqual([]);
  });

  it("status=aberta ⇒ nov e a prevista de dez", () => {
    const { grupos } = organizar({ status: "aberta" });
    expect(grupos.pagar).toEqual([]);
    expect(comps(grupos.emAberto)).toEqual(["2026-11"]);
    expect(comps(grupos.proximas)).toEqual(["2026-12"]);
    expect(grupos.anteriores).toEqual([]);
  });

  it("status=paga ⇒ só ago", () => {
    const { grupos } = organizar({ status: "paga" });
    expect(comps(grupos.anteriores)).toEqual(["2026-08"]);
    expect(grupos.proximas).toEqual([]);
  });

  it("a prevista não passa por status diferente de 'aberta'", () => {
    expect(organizar({ status: "fechada" }).grupos.proximas).toEqual([]);
    expect(organizar({ status: "prevista" }).grupos.proximas).toEqual([]);
  });

  it("indicadores ignoram os filtros (o filtro encolhe a lista, não muda o que se deve)", () => {
    const sem = organizar();
    for (const filtro of [{ status: "atrasada" }, { month: "2026-12" }, { month: "2026-12", status: "paga" }]) {
      expect(organizar(filtro).indicadores).toEqual(sem.indicadores);
    }
  });
});

describe("organizarFaturasDoCartao — terceiros", () => {
  it("recebível 'ignorado' com recebido parcial concilia com as regras únicas, e meu = total − terceiros", () => {
    const receivables = [
      recebivel({ id: "r-a", statementId: out.id, personId: "p-ana", valor: 482 }),
      recebivel({ id: "r-b", statementId: out.id, personId: "p-bru", valor: 300, status: "ignorado", recebimentos: [100] }),
      recebivel({ id: "r-c", statementId: set.id, personId: "p-bru", valor: 120.5, status: "parcial", recebimentos: [20] }),
    ];
    const { grupos } = organizar({ receivables });

    const doOut = receivables.filter((r) => r.statement_id === out.id).map((r) => resumirRecebivel(r));
    const esperadoParte = doOut.reduce((s, r) => s + parteDoTerceiroCentavos(r), 0);
    const esperadoPerdoado = doOut.reduce((s, r) => s + perdoadoCentavos(r), 0);
    // 482 inteiro + o que o 'ignorado' pagou (100); o saldo perdoado é 200.
    expect(esperadoParte).toBe(58200);
    expect(esperadoPerdoado).toBe(20000);

    const fOut = grupos.pagar.find((f) => f.statementId === out.id)!;
    expect(fOut.valores!.terceirosCent).toBe(esperadoParte);
    expect(fOut.valores!.perdoadoCent).toBe(esperadoPerdoado);
    expect(fOut.valores!.meuCent).toBe(fOut.valores!.totalCent - esperadoParte);

    // Parcial conta o VALOR (D3), não o saldo.
    const fSet = grupos.pagar.find((f) => f.statementId === set.id)!;
    expect(fSet.valores!.terceirosCent).toBe(12050);
    expect(fSet.valores!.meuCent).toBe(41230 - 12050);
  });

  it("recebível de outra fatura ou sem fatura não entra", () => {
    const solto = { ...recebivel({ id: "r-x", statementId: out.id, valor: 999 }), statement_id: null } as ReceivableWithPerson;
    const { grupos } = organizar({ receivables: [solto, recebivel({ id: "r-y", statementId: "s-outra", valor: 50 })] });
    const f = grupos.pagar.find((x) => x.statementId === out.id)!;
    expect(f.valores!.terceirosCent).toBe(0);
    expect(f.valores!.meuCent).toBe(175440);
  });
});
