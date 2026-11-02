import { describe, expect, it } from "vitest";
import {
  type CategoriaSlice,
  type DashCard,
  type DashInstallmentItem,
  type DashReceivable,
  type DashStatement,
  type DashTx,
  evolucaoMensal,
  gastosPorCategoria,
  proximas6Faturas,
  resumoMes,
} from "@/lib/finance/dashboard";
import {
  aReceberPorPessoa,
  dadosDaRosca,
  estornosDoCartaoNoMes,
  foraDaRosca,
  pendenteAoBanco,
} from "@/lib/finance/painel";
import { type RecebivelComRecebimentos, totalPendenteAte } from "@/lib/finance/recebimentos";
import { reaisParaCentavos } from "@/lib/format";

/**
 * 04-A, Tarefa 6 — A CONCILIAÇÃO: o mesmo número, lido por caminhos diferentes, fecha.
 *
 * Fixture SINTÉTICA ("Cartão A/B", "Pessoa A/B", "Categoria A…D", valores inventados), com os casos
 * que costumam quebrar a conta: compra à vista dividida com terceiro, compra parcelada no cartão,
 * um ESTORNO de cartão (receita ligada à fatura do mês), uma despesa pendente à vista com data
 * futura dentro do mês e um recebível com recebimento parcial.
 *
 * ⛔ Se a igualdade (ii) não fechar, NÃO se ajusta a fórmula nem a fixture para passar: o teste
 * fica vermelho e os números vão para quem decide (D-A-11).
 *
 * Contas à mão (novembro, hoje = 2026-11-05):
 *   à vista:  T1 100 (meu 60, Pessoa A 40) · T2 80 pendente em 25/11 (meu 80) · T7 40 (meu 0, Pessoa B 40)
 *   Cartão A: T4 200 (meu 120, Pessoa B 80, recebeu 30) + parcela I1 50 (meu 30, Pessoa A 20) − estorno 30 = 220
 *   Cartão B: T11 70 (meu 70), fatura paga
 *   ⇒ saídas 220 + 290 = 510 · meu 140 + (220 − 100) + 70 = 330 · terceiros 180
 *   rosca: A 180 · B 150 · C 30 · D 0 ⇒ 360 − 30 (estorno) + 0 = 330
 */

const HOJE = "2026-11-05";
const MES = "2026-11";
const MES_ANTERIOR = "2026-10";

const categoria = (id: string, nome: string, cor: string | null) => ({ id, name: nome, color: cor });
const CAT_A = categoria("cat-a", "Categoria A", "#112233");
const CAT_B = categoria("cat-b", "Categoria B", "#223344");
const CAT_C = categoria("cat-c", "Categoria C", null);
const CAT_D = categoria("cat-d", "Categoria D", null);
const CAT_ENTRADA = categoria("cat-e", "Categoria E", null);

const CARTOES: DashCard[] = [
  { id: "cartao-a", nome: "Cartão A", cor: "#334455", limite_total: 5000, dia_fechamento: 10, dia_vencimento: 18 },
  { id: "cartao-b", nome: "Cartão B", cor: null, limite_total: 3000, dia_fechamento: 15, dia_vencimento: 25 },
];

const FATURAS: DashStatement[] = [
  // Outubro: já paga; fica fora da lista "próximas" (o ciclo de hoje é o de novembro).
  { id: "f-a-out", card_id: "cartao-a", competencia: "2026-10-01", data_fechamento: "2026-10-10", data_vencimento: "2026-10-18", pago_em: "2026-10-18", total_atual: 100 },
  // Novembro do Cartão A: aberta. total = 200 (T4) + 50 (I1) − 30 (estorno).
  { id: "f-a-nov", card_id: "cartao-a", competencia: "2026-11-01", data_fechamento: "2026-11-10", data_vencimento: "2026-11-18", pago_em: null, total_atual: 220 },
  // Dezembro do Cartão A: uma parcela futura.
  { id: "f-a-dez", card_id: "cartao-a", competencia: "2026-12-01", data_fechamento: "2026-12-10", data_vencimento: "2026-12-18", pago_em: null, total_atual: 40 },
  // Novembro do Cartão B: paga (antecipada).
  { id: "f-b-nov", card_id: "cartao-b", competencia: "2026-11-01", data_fechamento: "2026-11-15", data_vencimento: "2026-11-25", pago_em: "2026-11-03", total_atual: 70 },
];

const base = {
  valor_pessoal: null,
  status: "pago" as const,
  parcelado: false,
  card_id: null,
  statement_id: null,
  payment_method: "pix" as const,
};

const TRANSACOES: DashTx[] = [
  // ── Outubro ──
  { ...base, id: "t8", type: "receita", amount: 2800, competence_date: "2026-10-05", category_id: CAT_ENTRADA.id, category: CAT_ENTRADA },
  { ...base, id: "t9", type: "despesa", amount: 90, competence_date: "2026-10-07", category_id: CAT_A.id, category: CAT_A },
  { ...base, id: "t10", type: "despesa", amount: 100, competence_date: "2026-10-08", category_id: CAT_B.id, category: CAT_B, payment_method: "cartao_credito", card_id: "cartao-a", statement_id: "f-a-out" },
  // ── Novembro ──
  { ...base, id: "t3", type: "receita", amount: 3000, competence_date: "2026-11-01", category_id: CAT_ENTRADA.id, category: CAT_ENTRADA },
  // À vista dividida com a Pessoa A: eu fico com 60.
  { ...base, id: "t1", type: "despesa", amount: 100, valor_pessoal: 60, competence_date: "2026-11-02", category_id: CAT_A.id, category: CAT_A },
  // Pendente, à vista, com data FUTURA dentro do mês: continua sendo saída do mês (competência).
  { ...base, id: "t2", type: "despesa", amount: 80, status: "pendente", competence_date: "2026-11-25", category_id: CAT_B.id, category: CAT_B },
  // Paga inteira por terceiro (minha parte 0): cai numa categoria de valor zero.
  { ...base, id: "t7", type: "despesa", amount: 40, valor_pessoal: 0, competence_date: "2026-11-03", category_id: CAT_D.id, category: CAT_D },
  // Compra à vista no Cartão A, dividida com a Pessoa B.
  { ...base, id: "t4", type: "despesa", amount: 200, valor_pessoal: 120, competence_date: "2026-11-03", category_id: CAT_A.id, category: CAT_A, payment_method: "cartao_credito", card_id: "cartao-a", statement_id: "f-a-nov" },
  // Compra parcelada no Cartão A: só a compra-pai está em `transactions` (o total, sem fatura).
  { ...base, id: "t5", type: "despesa", amount: 150, parcelado: true, competence_date: "2026-11-03", category_id: CAT_C.id, category: CAT_C, payment_method: "cartao_credito", card_id: "cartao-a" },
  // ESTORNO de cartão: receita ligada à fatura de novembro. Reduz a fatura e não é entrada de caixa.
  { ...base, id: "t6", type: "receita", amount: 30, competence_date: "2026-11-04", category_id: CAT_A.id, category: CAT_A, payment_method: "cartao_credito", card_id: "cartao-a", statement_id: "f-a-nov" },
  // Cartão B, fatura paga.
  { ...base, id: "t11", type: "despesa", amount: 70, competence_date: "2026-11-02", category_id: CAT_B.id, category: CAT_B, payment_method: "cartao_credito", card_id: "cartao-b", statement_id: "f-b-nov" },
];

const PARCELAS: DashInstallmentItem[] = [
  { id: "i1", statement_id: "f-a-nov", valor: 50, status: "ativa", parent: { category: CAT_C } },
  { id: "i2", statement_id: "f-a-dez", valor: 40, status: "ativa", parent: { category: CAT_C } },
];

const PESSOA_A = { id: "pessoa-a", nome: "Pessoa A" };
const PESSOA_B = { id: "pessoa-b", nome: "Pessoa B" };

/** O recebível cru (com a pessoa e os recebimentos), mais as ligações que o motor usa. */
type RecebivelCru = RecebivelComRecebimentos & {
  person: { id: string; nome: string } | null;
  transaction_id: string | null;
  statement_id: string | null;
  installment_id: string | null;
};

const RECEBIVEIS_CRUS: RecebivelCru[] = [
  { valor: 40, status: "pendente", recebimentos: [], person: PESSOA_A, transaction_id: "t1", statement_id: null, installment_id: null },
  // Recebimento PARCIAL: devia 80, voltaram 30 em 03/11.
  {
    valor: 80,
    status: "pendente",
    recebimentos: [{ valor: 30, recebido_em: "2026-11-03" }],
    person: PESSOA_B,
    transaction_id: "t4",
    statement_id: "f-a-nov",
    installment_id: null,
  },
  { valor: 20, status: "pendente", recebimentos: [], person: PESSOA_A, transaction_id: null, statement_id: "f-a-nov", installment_id: "i1" },
  { valor: 40, status: "pendente", recebimentos: [], person: PESSOA_B, transaction_id: "t7", statement_id: null, installment_id: null },
];

/** Os mesmos recebíveis na forma do motor (`recebido` já somado) — a fonte é uma só. */
const RECEBIVEIS_DO_MOTOR: DashReceivable[] = RECEBIVEIS_CRUS.map((r) => ({
  transaction_id: r.transaction_id,
  statement_id: r.statement_id,
  installment_id: r.installment_id,
  valor: Number(r.valor),
  status: r.status,
  recebido: r.recebimentos.reduce((s, x) => s + Number(x.valor), 0),
  ref_month: MES,
}));

const cent = reaisParaCentavos;
const somaCent = (xs: readonly number[]) => xs.reduce((s, x) => s + cent(x), 0);

const resumo = resumoMes({
  mes: MES,
  transactions: TRANSACOES,
  statements: FATURAS,
  receivables: RECEBIVEIS_DO_MOTOR,
});
const categorias: CategoriaSlice[] = gastosPorCategoria({
  mes: MES,
  transactions: TRANSACOES,
  statements: FATURAS,
  installmentItems: PARCELAS,
  receivables: RECEBIVEIS_DO_MOTOR,
});
const estornos = estornosDoCartaoNoMes({
  mes: MES,
  transactions: TRANSACOES,
  statements: FATURAS,
  installmentItems: PARCELAS,
  receivables: RECEBIVEIS_DO_MOTOR,
});

describe("a fixture tem o que precisa para conciliar (e os números à mão)", () => {
  it("minhas saídas, bruto, terceiros, cartão e o estorno batem com a conta feita à mão", () => {
    expect(resumo.saidas).toBe(510);
    expect(resumo.meu).toBe(330);
    expect(resumo.terceiros).toBe(180);
    expect(resumo.cartao).toBe(290);
    expect(estornos).toBe(30);
  });

  it("a rosca tem uma fatia de valor zero (para a nota do que ficou de fora ter o que contar)", () => {
    expect(categorias.find((c) => c.name === "Categoria D")?.meu).toBe(0);
  });
});

describe("conciliação do painel financeiro (04-A)", () => {
  it("(i) Minhas saídas === a barra do mês nas barras (nos dois meses)", () => {
    const evolucao = evolucaoMensal({
      meses: [MES_ANTERIOR, MES],
      transactions: TRANSACOES,
      statements: FATURAS,
      receivables: RECEBIVEIS_DO_MOTOR,
    });
    expect(evolucao.find((p) => p.mes === MES)?.saidas).toBe(resumo.meu);
    const resumoAnterior = resumoMes({
      mes: MES_ANTERIOR,
      transactions: TRANSACOES,
      statements: FATURAS,
      receivables: RECEBIVEIS_DO_MOTOR,
    });
    expect(evolucao.find((p) => p.mes === MES_ANTERIOR)?.saidas).toBe(resumoAnterior.meu);
    expect(resumoAnterior.meu).toBe(190);
  });

  it("(ii) Minhas saídas === Σ fatias da rosca − estornos do cartão + o que ficou fora (centavos)", () => {
    const fatias = dadosDaRosca(categorias);
    const fora = foraDaRosca(categorias, estornos);
    const somaDasFatias = somaCent(fatias.map((f) => f.meu));
    expect(somaDasFatias - cent(estornos) + cent(fora.soma)).toBe(cent(resumo.meu));
  });

  it("(ii-b) sem o desconto do estorno a conta NÃO fecha — a fixture prova que o estorno pesa", () => {
    const fatias = dadosDaRosca(categorias);
    const fora = foraDaRosca(categorias, estornos);
    expect(somaCent(fatias.map((f) => f.meu)) + cent(fora.soma)).not.toBe(cent(resumo.meu));
  });

  it("(iii) Minhas saídas + De terceiros === as saídas brutas (centavos)", () => {
    expect(cent(resumo.meu) + cent(resumo.terceiros)).toBe(cent(resumo.saidas));
  });

  it("(iv) Σ A receber por pessoa === Total pendente até o corte (em dois cortes)", () => {
    for (const corte of [HOJE, "2026-11-02"]) {
      const porPessoa = aReceberPorPessoa(RECEBIVEIS_CRUS, corte);
      expect(somaCent(porPessoa.map((p) => p.pendente))).toBe(
        cent(totalPendenteAte(RECEBIVEIS_CRUS, corte)),
      );
    }
  });

  it("(iv-b) o recebimento parcial entra pelo saldo, e o corte anterior a ele devolve o valor cheio", () => {
    // Até 05/11: Pessoa A 40 + 20 = 60; Pessoa B (80 − 30) + 40 = 90.
    expect(aReceberPorPessoa(RECEBIVEIS_CRUS, HOJE).map((p) => [p.nome, p.pendente])).toEqual([
      ["Pessoa B", 90],
      ["Pessoa A", 60],
    ]);
    // Até 02/11 os 30 ainda não tinham voltado: Pessoa B 80 + 40 = 120.
    expect(aReceberPorPessoa(RECEBIVEIS_CRUS, "2026-11-02")[0]).toMatchObject({
      nome: "Pessoa B",
      pendente: 120,
    });
  });

  it("(v) Pendente ao banco === Σ total das faturas reais não pagas da lista", () => {
    const lista = proximas6Faturas({
      hoje: HOJE,
      cards: CARTOES,
      statements: FATURAS,
      receivables: RECEBIVEIS_DO_MOTOR,
    });
    // As faturas reais da lista têm de ser as da fixture (nenhuma virou "prevista" por data errada).
    const reais = lista.filter((f) => !f.virtual);
    expect(reais.map((f) => `${f.cardId}|${f.competencia}`).sort()).toEqual([
      "cartao-a|2026-11",
      "cartao-a|2026-12",
      "cartao-b|2026-11",
    ]);

    // Por outro caminho: as faturas da fixture ainda por pagar dentro da janela da lista.
    const naoPagas = FATURAS.filter((s) => s.pago_em === null && s.competencia >= "2026-11-01");
    const esperado = somaCent(naoPagas.map((s) => s.total_atual ?? 0));
    expect(cent(pendenteAoBanco(lista))).toBe(esperado);
    expect(pendenteAoBanco(lista)).toBe(260);

    // E igual à soma dos totais das linhas reais não pagas, olhando a própria lista.
    expect(
      somaCent(lista.filter((f) => !f.virtual && f.status !== "paga").map((f) => f.total)),
    ).toBe(cent(pendenteAoBanco(lista)));
  });
});
