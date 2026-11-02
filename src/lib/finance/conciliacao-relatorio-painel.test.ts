import { describe, expect, it } from "vitest";
import {
  type CategoriaSlice,
  type DashInstallmentItem,
  type DashReceivable,
  type DashStatement,
  type DashTx,
  evolucaoMensal,
  gastosPorCategoria,
  perdoadoDoMes,
  resumoMes,
} from "@/lib/finance/dashboard";
import type { EstadoDoCaixa } from "@/lib/finance/caixa-leitura";
import {
  dadosDaRosca,
  estornosDoCartaoNoMes,
  foraDaRosca,
  indicadoresDoResumo,
} from "@/lib/finance/painel";
import { rotuloTotalPendenteAte, totalPendenteAte } from "@/lib/finance/recebimentos";
import { janelaDoRelatorio } from "@/lib/finance/pipeline";
import { SEM_RECORTE } from "@/lib/finance/recorte";
import { saldoComData } from "@/lib/finance/painel";
import { saldoDasContas } from "@/lib/finance/saldo-das-contas";
import { formatCurrency, reaisParaCentavos } from "@/lib/format";
import { montarRelatorioFinanceiro } from "@/lib/reports/financeiro";

/**
 * 04-A2, Tarefa 4 (D-A2-20) — A CONCILIAÇÃO painel × relatório: o painel e o relatório sem recorte,
 * em "meu" e na mesma base, leem os mesmos números porque montam os indicadores pela MESMA função
 * (`indicadoresDoResumo`).
 *
 * Fixture SINTÉTICA ("Cartão A/B", "Pessoa A/B", "Categoria A…E", valores inventados), com os três
 * casos que costumam quebrar a conta: um ESTORNO de cartão (receita ligada à fatura do mês), um
 * recebível PENDENTE (a fatia da Pessoa B voltou só em parte) e um PERDOADO.
 *
 * ⛔ Se uma igualdade não fechar, NÃO se ajusta a fórmula nem a fixture para passar: o teste fica
 * vermelho e os números vão para quem decide.
 *
 * Este arquivo traz os DOIS caminhos: o do PAINEL (`resumoMes` + `indicadoresDoResumo`) e o do
 * RELATÓRIO (`montarRelatorioFinanceiro`, T7), sem recorte, em "meu", nas duas bases.
 */

const HOJE = "2026-11-05";
const MES = "2026-11";

const cat = (id: string, nome: string) => ({ id, name: nome, color: null });
const CAT_A = cat("cat-a", "Categoria A");
const CAT_B = cat("cat-b", "Categoria B");
const CAT_C = cat("cat-c", "Categoria C");
const CAT_D = cat("cat-d", "Categoria D");
const CAT_E = cat("cat-e", "Categoria E");

const FATURAS: DashStatement[] = [
  { id: "f-a-nov", card_id: "cartao-a", competencia: "2026-11-01", data_fechamento: "2026-11-10", data_vencimento: "2026-11-18", pago_em: null, total_atual: 220 },
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
  { ...base, id: "t3", type: "receita", amount: 3000, competence_date: "2026-11-01", category_id: CAT_E.id, category: CAT_E },
  // Entrada de terceiro: grava minha parte 0.
  { ...base, id: "t12", type: "receita", amount: 500, valor_pessoal: 0, competence_date: "2026-11-02", category_id: CAT_E.id, category: CAT_E },
  { ...base, id: "t1", type: "despesa", amount: 100, valor_pessoal: 60, competence_date: "2026-11-02", category_id: CAT_A.id, category: CAT_A },
  // Pendente, à vista, com data futura no mês: continua sendo saída do mês.
  { ...base, id: "t2", type: "despesa", amount: 80, status: "pendente", competence_date: "2026-11-25", category_id: CAT_B.id, category: CAT_B },
  // Paga inteira por terceiro e depois PERDOADA (ver recebível).
  { ...base, id: "t7", type: "despesa", amount: 40, valor_pessoal: 0, competence_date: "2026-11-03", category_id: CAT_D.id, category: CAT_D },
  { ...base, id: "t4", type: "despesa", amount: 200, valor_pessoal: 120, competence_date: "2026-11-03", category_id: CAT_A.id, category: CAT_A, payment_method: "cartao_credito", card_id: "cartao-a", statement_id: "f-a-nov" },
  { ...base, id: "t5", type: "despesa", amount: 150, parcelado: true, competence_date: "2026-11-03", category_id: CAT_C.id, category: CAT_C, payment_method: "cartao_credito", card_id: "cartao-a" },
  // ESTORNO de cartão: reduz a fatura e não é entrada.
  { ...base, id: "t6", type: "receita", amount: 30, competence_date: "2026-11-04", category_id: CAT_A.id, category: CAT_A, payment_method: "cartao_credito", card_id: "cartao-a", statement_id: "f-a-nov" },
  { ...base, id: "t11", type: "despesa", amount: 70, competence_date: "2026-11-02", category_id: CAT_B.id, category: CAT_B, payment_method: "cartao_credito", card_id: "cartao-b", statement_id: "f-b-nov" },
];

const PARCELAS: DashInstallmentItem[] = [
  { id: "i1", statement_id: "f-a-nov", valor: 50, status: "ativa", parent: { category: CAT_C } },
];

const RECEBIVEIS: DashReceivable[] = [
  { transaction_id: "t1", statement_id: null, installment_id: null, valor: 40, status: "pendente", recebido: 0, ref_month: MES },
  // PENDENTE com recebimento parcial: devia 80, voltaram 30.
  { transaction_id: "t4", statement_id: "f-a-nov", installment_id: null, valor: 80, status: "pendente", recebido: 30, ref_month: MES },
  { transaction_id: null, statement_id: "f-a-nov", installment_id: "i1", valor: 20, status: "pendente", recebido: 0, ref_month: MES },
  // PERDOADO: o dono decidiu não cobrar (no motor, o estado é "ignorado": o saldo vira despesa minha, D11).
  { transaction_id: "t7", statement_id: null, installment_id: null, valor: 40, status: "ignorado", recebido: 0, ref_month: MES },
];

const cent = reaisParaCentavos;
const somaCent = (xs: readonly number[]) => xs.reduce((s, x) => s + cent(x), 0);

const resumo = resumoMes({ mes: MES, transactions: TRANSACOES, statements: FATURAS, receivables: RECEBIVEIS });
const categorias: CategoriaSlice[] = gastosPorCategoria({
  mes: MES,
  transactions: TRANSACOES,
  statements: FATURAS,
  installmentItems: PARCELAS,
  receivables: RECEBIVEIS,
});
const estornos = estornosDoCartaoNoMes({
  mes: MES,
  transactions: TRANSACOES,
  statements: FATURAS,
  installmentItems: PARCELAS,
  receivables: RECEBIVEIS,
});

/** Um `EstadoDoCaixa` sintético `ok`: só `graficos.minha` é lido pelos indicadores. */
const CAIXA_OK = {
  estado: "ok",
  graficos: {
    minha: {
      entradas: 2900,
      saidas: 1100.5,
      saidasBrutas: 1400.75,
      terceirosNasSaidas: 300.25,
      resultado: 1799.5,
      faturasSemTotal: 0,
    },
    // Os gráficos da base caixa: o relatório os lê (os indicadores do painel só leem `minha`).
    evolucao: [{ mes: MES, entradas: 2900, saidas: 1100.5, saldo: 1799.5 }],
    mesAMes: { ateODia: null, dados: { anterior: { entradas: 1, saidas: 2 }, atual: { entradas: 3, saidas: 4 } } },
    categorias: [],
    formas: [],
    semTotal: { evolucao: [], mesAMes: [] },
  },
} as unknown as EstadoDoCaixa;

const pendente = {
  ate: totalPendenteAte(
    RECEBIVEIS.map((r) => ({
      valor: r.valor,
      status: r.status,
      recebimentos: r.recebido ? [{ valor: r.recebido, recebido_em: "2026-11-03" }] : [],
    })),
    HOJE,
  ),
  rotuloAte: rotuloTotalPendenteAte(HOJE),
  referenteAoMes: 0,
};

/** O caminho do PAINEL: `resumoMes` + `indicadoresDoResumo`, "meu", sem recorte. */
function caminhoDoPainel(baseDaLeitura: "competencia" | "caixa") {
  return indicadoresDoResumo({
    resp: "meu",
    base: baseDaLeitura,
    resumo,
    caixa: baseDaLeitura === "caixa" ? CAIXA_OK : null,
    comparacao: null,
    pendente,
    rotuloDoRecorte: null,
  });
}

describe("a fixture tem o que precisa (estorno, pendente e perdoado)", () => {
  it("tem estorno de cartão, perdoado no mês e pendente em aberto", () => {
    expect(estornos).toBe(30);
    expect(
      perdoadoDoMes({ mes: MES, transactions: TRANSACOES, statements: FATURAS, receivables: RECEBIVEIS }),
    ).toBeGreaterThan(0);
    expect(pendente.ate).toBeGreaterThan(0);
  });
});

describe("conciliação painel × relatório (04-A2, D-A2-20)", () => {
  it("em competência, os três indicadores são o resumo do motor, em reais formatados", () => {
    const r = caminhoDoPainel("competencia");
    expect(r.entradas.valor).toBe(formatCurrency(resumo.entradasMeu));
    expect(r.saidas.valor).toBe(formatCurrency(resumo.meu));
    expect(r.quarto.valor).toBe(formatCurrency(resumo.terceiros));
  });

  it("na base caixa, os três indicadores são os de graficos.minha", () => {
    const r = caminhoDoPainel("caixa");
    expect(r.entradas.valor).toBe(formatCurrency(2900));
    expect(r.saidas.valor).toBe(formatCurrency(1100.5));
    expect(r.quarto.valor).toBe(formatCurrency(300.25));
  });

  it("Minhas entradas não é o bruto: a fixture tem entrada de terceiro", () => {
    expect(cent(resumo.entradas)).not.toBe(cent(resumo.entradasMeu));
    expect(caminhoDoPainel("competencia").entradas.valor).not.toBe(formatCurrency(resumo.entradas));
  });

  it("a barra do mês é Minhas saídas (resumo.meu), centavo a centavo", () => {
    const barra = evolucaoMensal({
      meses: [MES],
      transactions: TRANSACOES,
      statements: FATURAS,
      receivables: RECEBIVEIS,
    })[0];
    expect(cent(barra.saidas)).toBe(cent(resumo.meu));
    expect(caminhoDoPainel("competencia").saidas.valor).toBe(formatCurrency(barra.saidas));
  });

  it("Σ fatias(meu) − estornos + Σ fora da rosca === Minhas saídas, centavo a centavo", () => {
    const fatias = dadosDaRosca(categorias);
    const fora = foraDaRosca(categorias, estornos);
    expect(somaCent(fatias.map((f) => f.meu)) - cent(estornos) + cent(fora.soma)).toBe(cent(resumo.meu));
  });

  it("Minhas saídas + De terceiros === as saídas brutas (centavos)", () => {
    expect(cent(resumo.meu) + cent(resumo.terceiros)).toBe(cent(resumo.saidas));
  });

});

/* ───────────────────────────── A metade do relatório (T7) ───────────────────────────── */

const JANELA = janelaDoRelatorio({ mesSel: MES, mesAtual: MES });
const CONTAS_DO_PAINEL = [{ id: "conta-x", current_balance: 1500.25 }];
const SALDO_ATE = 1400;

/** O caminho do RELATÓRIO: o modelo de vista, sem recorte, em "meu". */
function caminhoDoRelatorio(baseDaLeitura: "competencia" | "caixa") {
  return montarRelatorioFinanceiro({
    mes: MES,
    hoje: HOJE,
    base: baseDaLeitura,
    resp: "meu",
    recorte: SEM_RECORTE,
    entradas: {
      txs: TRANSACOES,
      sts: FATURAS,
      recs: RECEBIVEIS,
      inst: PARCELAS,
      cards: [],
      recorrencias: [],
      bills: [],
    },
    recebiveisCrus: [],
    contas: CONTAS_DO_PAINEL,
    recorrenciasCruas: [],
    saldoAte: SALDO_ATE,
    caixa: baseDaLeitura === "caixa" ? CAIXA_OK : null,
    completude: { estado: "exato" },
    janela: { evoMeses: JANELA.evoMeses, projMeses: JANELA.projMeses },
    opcoes: { contas: [], cartoes: [], pessoas: [], categorias: [] },
  });
}

describe("conciliação painel × relatório: o modelo de vista do relatório (T7)", () => {
  it.each(["competencia", "caixa"] as const)(
    "%s: os três indicadores do relatório são os do painel, campo a campo",
    (baseDaLeitura) => {
      const painel = caminhoDoPainel(baseDaLeitura);
      const relatorio = caminhoDoRelatorio(baseDaLeitura).indicadores;
      for (const chave of ["entradas", "saidas", "quarto"] as const) {
        // A seta (`comparacao`) é do mês a mês e o teste do painel passa `null`: o resto é igual.
        expect({ ...relatorio[chave], comparacao: null }, chave).toEqual({
          ...painel[chave],
          comparacao: null,
        });
      }
    },
  );

  it("o saldo do relatório é o `saldoComData` do painel", () => {
    const esperado = saldoComData({
      saldoAte: SALDO_ATE,
      saldoDaView: saldoDasContas(CONTAS_DO_PAINEL),
      hoje: HOJE,
    });
    const saldo = caminhoDoRelatorio("competencia").saldo;
    expect(saldo.rotulo).toBe(esperado.rotulo);
    expect(saldo.valor).toBe(formatCurrency(SALDO_ATE));
    expect(saldo.detalheComValor).toBe(esperado.diferenca);
  });

  it("a barra do mês do relatório é a do painel: Minhas saídas, centavo a centavo", () => {
    const r = caminhoDoRelatorio("competencia");
    const barra = r.barras.find((b) => b.mes === MES);
    expect(barra).toBeDefined();
    expect(cent(barra?.saidas ?? Number.NaN)).toBe(cent(resumo.meu));
    expect(cent(barra?.entradas ?? Number.NaN)).toBe(cent(resumo.entradasMeu));
    expect(r.indicadores.saidas.valor).toBe(formatCurrency(barra?.saidas ?? Number.NaN));
  });

  it("a rosca do relatório é a do painel: as mesmas fatias, os mesmos estornos, a conta fecha", () => {
    const r = caminhoDoRelatorio("competencia");
    expect(r.rosca).not.toBeNull();
    const fatias = r.rosca?.categorias ?? [];
    expect(fatias.map((f) => f.valor)).toEqual(categorias.map((f) => f.meu));
    expect(r.rosca?.estornos).toBe(estornos);
    const fora = foraDaRosca(categorias, estornos);
    expect(somaCent(dadosDaRosca(categorias).map((f) => f.meu)) - cent(estornos) + cent(fora.soma)).toBe(
      cent(resumo.meu),
    );
  });
});
