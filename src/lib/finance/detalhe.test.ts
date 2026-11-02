import { describe, expect, it } from "vitest";
import {
  TETO_DA_GAVETA,
  detalheDoNumero,
  type Detalhe,
  type ParametrosDoDetalhe,
  type RegistroDoDetalhe,
} from "@/lib/finance/detalhe";
import {
  gastosPorCategoria,
  gastosPorForma,
  projecaoProximosMeses,
  faturasPorMes,
  proximasContasPagar,
  resumoMes,
  totalAReceber,
} from "@/lib/finance/dashboard";
import { numerosDoCaixa, type TxDeCaixa } from "@/lib/finance/caixa";
import { minhaParteDoCaixa, type MotorDoCaixa } from "@/lib/finance/caixa-minha-parte";
import { aReceberPorPessoa } from "@/lib/finance/painel";
import {
  montarEntradas,
  type LinhaFatura,
  type LinhaParcela,
  type LinhaRecebivel,
  type LinhaTx,
  janelaDoRelatorio,
} from "@/lib/finance/pipeline";
import { totalPendenteAte, type RecebivelComRecebimentos } from "@/lib/finance/recebimentos";
import { reaisParaCentavos } from "@/lib/format";

/**
 * 04-B, Task 2 — A CONCILIAÇÃO EM TRÊS LADOS: o que a gaveta lista, o que o motor soma e o que
 * foi escrito à mão a partir da fixture.
 *
 * ┌──────────────────────────────────────────────────────────────────────────────────────────┐
 * │ Para cada chave × parte do §4 do desenho, quatro igualdades, todas em CENTAVOS:           │
 * │   Σ registros (laço DESTE teste) = detalhe.totalCent = agregador do motor = LITERAL.      │
 * │ O literal não vem de função nenhuma: é a conta abaixo. Por isso o teste não passa "por    │
 * │ construção" — mexer no classificador derruba o literal; mexer no agregador derruba o      │
 * │ segundo lado; e o laço do teste não é o `somaCent` do modelo.                             │
 * └──────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Fixture SINTÉTICA (o repositório é público): "Conta A/B", "Cartão A/B", "Pessoa A/B",
 * "Categoria A–E", valores inventados. Novembro de 2026, hoje = 2026-11-18.
 *
 * ── Contas à mão, em REAIS (os literais abaixo são os mesmos, em centavos) ────────────────────
 *
 * À vista (competência de novembro):
 *   Mercado   100,00  meu 60,00   (Pessoa A 40,00)        Categoria A · pix
 *   Presente   40,00  meu  0,00   (Pessoa B 40,00)        Categoria B · pix
 *   Farmácia   45,90  meu 45,90                           sem categoria · débito
 *   Escola     80,00  meu 80,00   PENDENTE, vence 25/11   Categoria D · boleto
 *   ⇒ à vista bruto 265,90 · meu 185,90
 *
 * Cartão A, fatura de novembro (total_atual 220,00, aberta, vence 18/11):
 *   Loja             200,00  meu 120,00 (Pessoa B 80,00; ela já devolveu 30,00)   Categoria A
 *   Notebook 3/10     50,00  meu  30,00 (Pessoa A 20,00)                          Categoria E
 *   Estorno da Loja  −30,00  (receita ligada à fatura)
 *   ⇒ 200 + 50 − 30 = 220,00 · terceiros 80 + 20 = 100,00 · meu 120,00
 *   (a compra-pai do Notebook, 500,00, é `parcelado`: nunca entra)
 * Cartão B, fatura de novembro (total_atual 70,00, paga em 03/11):
 *   Restaurante 70,00  meu 70,00                          Categoria B
 * Fatura de dezembro do Cartão A (40,00): a parcela 4/12 do Curso — FORA de novembro.
 *
 * ⇒ SAÍDAS DE NOVEMBRO
 *    bruto     265,90 + 220,00 + 70,00 = 555,90   →  55590
 *    meu       185,90 + 120,00 + 70,00 = 375,90   →  37590
 *    terceiros 555,90 − 375,90         = 180,00   →  18000   (40 + 40 à vista + 100 no cartão)
 *    cartão    220,00 + 70,00 = 290,00 (bruto) · meu 120,00 + 70,00 = 190,00 · terceiros 100,00
 * ⇒ ENTRADAS DE NOVEMBRO
 *    Salário 5.000,00 (meu) + Pix de Pessoa A 40,00 (meu 0)
 *    bruto 5.040,00 → 504000 · meu 5.000,00 → 500000 · terceiros 40,00 → 4000
 *    (o estorno de 30,00 é receita de CARTÃO: não é entrada de conta)
 * ⇒ POR CATEGORIA (sem o estorno, como a fatia da rosca)
 *    A: 100 + 200 = 300 (meu 180) · B: 40 + 70 = 110 (meu 70) · D: 80 · E: 50 (meu 30)
 *    sem categoria: 45,90        ⇒ Σ 585,90 = 555,90 + 30 (o estorno)
 * ⇒ POR FORMA
 *    pix: 100 + 40 = 140 (meu 60) · cartão de crédito: 200 + 50 + 70 = 320 (meu 220)
 *    boleto: 80 · débito: 45,90
 * ⇒ FATURA A: bruto 220,00 → 22000 · meu 120,00 → 12000 · terceiros 100,00 → 10000
 * ⇒ PENDENTE DE TERCEIROS até 18/11 (o que ainda não voltou):
 *    Mercado/Pessoa A 40,00 + Loja/Pessoa B (80 − 30) 50,00 + Notebook/Pessoa A 20,00
 *    + um resto de OUTUBRO da Pessoa A 25,00   (o Presente/Pessoa B já foi pago: 0)
 *    = 135,00 → 13500   (Pessoa A 85,00 · Pessoa B 50,00)
 *    O que é "referente a novembro": 40 + 50 + 20 = 110,00 → 11000 (o resto de outubro fica fora)
 * ⇒ PROJEÇÃO DE DEZEMBRO (pelo vencimento): fatura A de dezembro 40,00 + recorrência de
 *    despesa 50,00 + contas fixas ativas 100 + 300 = 490,00 → 49000
 *    PROJEÇÃO DE NOVEMBRO: faturas (meu) 120 + 70 + recorrência 50 + contas 400 = 640,00 → 64000
 * ⇒ PRÓXIMAS CONTAS (31 dias a partir de 18/11): Internet 100 (20/11) + Condomínio 300 (05/12)
 *    = 400,00 → 40000   (o Seguro está inativo)
 *
 * ── Base caixa (data de caixa dentro de novembro) ──────────────────────────────────────────────
 *   despesas com conta:  Mercado 100 (meu 60) · Presente 40 (meu 0) · Farmácia 45,90 (SEM
 *                        liquidado_em: data aproximada)
 *   pagamento da fatura do Cartão B: 70,00 (a fatura não tem terceiro: meu 70,00)
 *   transferência sem destino: 150,00 · transferência entre contas: 200,00 (informativa)
 *   Escola (pendente) e a compra no cartão ficam fora
 *   renda: Salário 5.000,00 · Pix de Pessoa A 40,00 (meu 0) · reembolsos: 30 (03/11) + 40 (10/11)
 *   ⇒ saídas bruto  100 + 40 + 45,90 + 70 + 150 = 405,90 → 40590
 *     saídas meu     60 +  0 + 45,90 + 70 + 150 = 325,90 → 32590
 *     de terceiros  405,90 − 325,90             =  80,00 →  8000
 *     pagamentos de fatura 7000 · sem destino 15000 · entre contas 20000
 *     renda pessoal 500000 · outras entradas de terceiros 4000 · reembolsos 7000
 *
 * ⛔ Se uma igualdade não fechar, NÃO se ajusta a fórmula do motor, nem o literal para "passar":
 *    ajusta-se a FIXTURE para reproduzir a conta acima, ou o número vai para quem decide.
 */

const HOJE = "2026-11-18";
const MES = "2026-11";

const cent = reaisParaCentavos;

/* ───────────────────────────── Fixture de competência (pelo pipeline) ───────────────────────────── */

const cat = (id: string, name: string) => ({ id, name, color: null });
const CAT_A = cat("cat-a", "Categoria A");
const CAT_B = cat("cat-b", "Categoria B");
const CAT_C = cat("cat-c", "Categoria C");
const CAT_D = cat("cat-d", "Categoria D");
const CAT_E = cat("cat-e", "Categoria E");
const CAT_ENTRADA = cat("cat-entrada", "Categoria de entrada");

function lancamento(p: Partial<LinhaTx> & Pick<LinhaTx, "id" | "amount" | "type" | "competence_date">): LinhaTx {
  return {
    status: "pago",
    valor_pessoal: null,
    payment_method: "pix",
    card_id: null,
    statement_id: null,
    parcelado: false,
    category_id: null,
    category: null,
    account_id: null,
    description: null,
    purchase_date: null,
    ...p,
  };
}

const TRANSACOES: LinhaTx[] = [
  // ── À vista ──
  lancamento({ id: "t-mercado", description: "Mercado", amount: 100, valor_pessoal: 60, type: "despesa", competence_date: "2026-11-02", purchase_date: "2026-11-02", category_id: "cat-a", category: CAT_A, account_id: "conta-a" }),
  lancamento({ id: "t-presente", description: "Presente", amount: 40, valor_pessoal: 0, type: "despesa", competence_date: "2026-11-03", purchase_date: "2026-11-03", category_id: "cat-b", category: CAT_B, account_id: "conta-a" }),
  lancamento({ id: "t-farmacia", description: "Farmácia", amount: 45.9, type: "despesa", competence_date: "2026-11-06", purchase_date: "2026-11-06", payment_method: "debito", account_id: "conta-b" }),
  lancamento({ id: "t-escola", description: "Escola", amount: 80, type: "despesa", status: "pendente", competence_date: "2026-11-25", purchase_date: "2026-11-25", payment_method: "boleto", category_id: "cat-d", category: CAT_D, account_id: "conta-a" }),
  // ── Cartão A (fatura de novembro) ──
  lancamento({ id: "t-loja", description: "Loja", amount: 200, valor_pessoal: 120, type: "despesa", competence_date: "2026-11-03", purchase_date: "2026-11-03", payment_method: "cartao_credito", card_id: "cartao-a", statement_id: "f-a-nov", category_id: "cat-a", category: CAT_A }),
  // A compra-pai do parcelamento: `parcelado`. No dado real o `statement_id` é nulo; aqui carrega a
  // fatura de PROPÓSITO, porque o filtro `parcelado` de `itensDeGasto` é o que a barra — e a
  // mutação que o remove precisa ter o que quebrar.
  lancamento({ id: "t-notebook-pai", description: "Notebook (compra)", amount: 500, type: "despesa", competence_date: "2026-11-03", purchase_date: "2026-11-03", payment_method: "cartao_credito", card_id: "cartao-a", statement_id: "f-a-nov", parcelado: true, category_id: "cat-e", category: CAT_E }),
  lancamento({ id: "t-estorno", description: "Estorno da Loja", amount: 30, type: "receita", status: "recebido", competence_date: "2026-11-04", purchase_date: "2026-11-04", payment_method: "cartao_credito", card_id: "cartao-a", statement_id: "f-a-nov", category_id: "cat-a", category: CAT_A }),
  // ── Cartão B (fatura paga) ──
  lancamento({ id: "t-restaurante", description: "Restaurante", amount: 70, type: "despesa", competence_date: "2026-11-02", purchase_date: "2026-11-02", payment_method: "cartao_credito", card_id: "cartao-b", statement_id: "f-b-nov", category_id: "cat-b", category: CAT_B }),
  // ── Entradas ──
  lancamento({ id: "t-salario", description: "Salário", amount: 5000, type: "receita", status: "recebido", competence_date: "2026-11-05", purchase_date: "2026-11-05", category_id: "cat-entrada", category: CAT_ENTRADA, account_id: "conta-a" }),
  lancamento({ id: "t-pix", description: "Pix de Pessoa A", amount: 40, valor_pessoal: 0, type: "receita", status: "recebido", competence_date: "2026-11-07", purchase_date: "2026-11-07", category_id: "cat-entrada", category: CAT_ENTRADA, account_id: "conta-a" }),
  // ── Outubro: ruído que a gaveta de novembro não pode listar ──
  lancamento({ id: "t-out-mercado", description: "Mercado de outubro", amount: 33, valor_pessoal: 8, type: "despesa", competence_date: "2026-10-20", purchase_date: "2026-10-20", category_id: "cat-a", category: CAT_A, account_id: "conta-a" }),
  lancamento({ id: "t-out-cartao", description: "Compra de outubro", amount: 100, type: "despesa", competence_date: "2026-10-08", purchase_date: "2026-10-08", payment_method: "cartao_credito", card_id: "cartao-a", statement_id: "f-a-out", category_id: "cat-b", category: CAT_B }),
];

function faturas(totalDaFaturaA: number): LinhaFatura[] {
  return [
    { id: "f-a-out", card_id: "cartao-a", competencia: "2026-10-01", data_fechamento: "2026-10-10", data_vencimento: "2026-10-18", pago_em: "2026-10-18", total_atual: 100 },
    { id: "f-a-nov", card_id: "cartao-a", competencia: "2026-11-01", data_fechamento: "2026-11-10", data_vencimento: "2026-11-18", pago_em: null, total_atual: totalDaFaturaA },
    { id: "f-a-dez", card_id: "cartao-a", competencia: "2026-12-01", data_fechamento: "2026-12-10", data_vencimento: "2026-12-18", pago_em: null, total_atual: 40 },
    { id: "f-b-nov", card_id: "cartao-b", competencia: "2026-11-01", data_fechamento: "2026-11-15", data_vencimento: "2026-11-25", pago_em: "2026-11-03", total_atual: 70 },
  ];
}

const PARCELAS: LinhaParcela[] = [
  { id: "i-notebook-3", statement_id: "f-a-nov", valor: 50, status: "ativa", numero: 3, total_parcelas: 10, parent: { description: "Notebook", category: CAT_E } },
  { id: "i-curso-4", statement_id: "f-a-dez", valor: 40, status: "ativa", numero: 4, total_parcelas: 12, parent: { description: "Curso", category: CAT_C } },
];

type RecebivelDaFixture = {
  id: string;
  pessoa: { id: string; nome: string };
  transaction_id: string | null;
  statement_id: string | null;
  installment_id: string | null;
  valor: number;
  status: string;
  pago_em: string | null;
  recebimentos: { valor: number; recebido_em: string }[];
  /** De onde sai o `ref_month`: a competência da fatura ou a data da compra. */
  statementCompetencia: string | null;
  compraEm: string | null;
};

const PESSOA_A = { id: "pessoa-a", nome: "Pessoa A" };
const PESSOA_B = { id: "pessoa-b", nome: "Pessoa B" };

const RECEBIVEIS: RecebivelDaFixture[] = [
  { id: "r-mercado", pessoa: PESSOA_A, transaction_id: "t-mercado", statement_id: null, installment_id: null, valor: 40, status: "pendente", pago_em: null, recebimentos: [], statementCompetencia: null, compraEm: "2026-11-02" },
  // Recebimento PARCIAL: devia 80, voltaram 30 em 03/11.
  { id: "r-loja", pessoa: PESSOA_B, transaction_id: "t-loja", statement_id: "f-a-nov", installment_id: null, valor: 80, status: "pendente", pago_em: null, recebimentos: [{ valor: 30, recebido_em: "2026-11-03" }], statementCompetencia: "2026-11-01", compraEm: null },
  { id: "r-notebook", pessoa: PESSOA_A, transaction_id: null, statement_id: "f-a-nov", installment_id: "i-notebook-3", valor: 20, status: "pendente", pago_em: null, recebimentos: [], statementCompetencia: "2026-11-01", compraEm: null },
  // Já devolvido por inteiro: não é pendente.
  { id: "r-presente", pessoa: PESSOA_B, transaction_id: "t-presente", statement_id: null, installment_id: null, valor: 40, status: "pago", pago_em: "2026-11-10", recebimentos: [{ valor: 40, recebido_em: "2026-11-10" }], statementCompetencia: null, compraEm: "2026-11-03" },
  // O resto de OUTUBRO: pendente até hoje, mas NÃO é "referente a novembro".
  { id: "r-out", pessoa: PESSOA_A, transaction_id: "t-out-mercado", statement_id: null, installment_id: null, valor: 25, status: "pendente", pago_em: null, recebimentos: [], statementCompetencia: null, compraEm: "2026-10-20" },
];

const LINHAS_DE_RECEBIVEL: LinhaRecebivel[] = RECEBIVEIS.map((r) => ({
  id: r.id,
  transaction_id: r.transaction_id,
  pago_em: r.pago_em,
  recebimentos: r.recebimentos,
  statement_id: r.statement_id,
  installment_id: r.installment_id,
  valor: r.valor,
  status: r.status,
  statement: r.statementCompetencia ? { competencia: r.statementCompetencia } : null,
  transaction: r.compraEm ? { purchase_date: r.compraEm } : null,
}));

/**
 * Os recebíveis crus (com a pessoa) — a lista que o painel usa para o pendente. Como a leitura REAL
 * (`ESCOPO_PAINEL`), eles NÃO trazem `ref_month`: só as relações de onde o pipeline o deriva. A
 * primeira versão desta fixture punha `ref_month` à mão, e o "pendente referente ao mês" do painel
 * abria vazio com dado real sem nenhum teste acusar (revisão da T6).
 */
const CRUS = LINHAS_DE_RECEBIVEL.map((linha, i) => ({
  ...linha,
  valor: RECEBIVEIS[i].valor,
  person: RECEBIVEIS[i].pessoa,
}));

function entradasDaFixture(totalDaFaturaA = 220) {
  return montarEntradas({
    transacoes: TRANSACOES,
    faturas: faturas(totalDaFaturaA),
    recebiveis: LINHAS_DE_RECEBIVEL,
    parcelas: PARCELAS,
    cartoes: [
      { id: "cartao-a", nome: "Cartão A", cor: null, limite_total: 5000, dia_fechamento: 10, dia_vencimento: 18 },
      { id: "cartao-b", nome: "Cartão B", cor: null, limite_total: 3000, dia_fechamento: 15, dia_vencimento: 25 },
    ],
    recorrencias: [
      { amount: 50, type: "despesa", frequency: "mensal", interval_count: 1, anchor_date: "2026-01-10", next_due_date: "2026-12-10", end_date: null, is_active: true },
      { amount: 100, type: "receita", frequency: "mensal", interval_count: 1, anchor_date: "2026-01-05", next_due_date: "2026-12-05", end_date: null, is_active: true },
      { amount: 70, type: "despesa", frequency: "mensal", interval_count: 1, anchor_date: "2026-01-12", next_due_date: "2026-12-12", end_date: null, is_active: false },
    ],
    contasFixas: [
      { name: "Internet", amount: 100, due_day: 20, is_active: true },
      { name: "Condomínio", amount: 300, due_day: 5, is_active: true },
      { name: "Seguro", amount: 200, due_day: 25, is_active: false },
    ],
  });
}

const E = entradasDaFixture();

const NOMES = {
  contas: new Map([
    ["conta-a", "Conta A"],
    ["conta-b", "Conta B"],
  ]),
  cartoes: new Map([
    ["cartao-a", "Cartão A"],
    ["cartao-b", "Cartão B"],
  ]),
};

/* ───────────────────────────── Fixture do caixa ───────────────────────────── */

function caixaTx(p: Partial<TxDeCaixa> & Pick<TxDeCaixa, "id" | "amount" | "type" | "competence_date">): TxDeCaixa {
  return {
    status: "pago",
    valor_pessoal: null,
    liquidado_em: p.competence_date,
    account_id: "conta-a",
    transfer_account_id: null,
    card_id: null,
    payment_method: "pix",
    category: null,
    description: null,
    ...p,
  };
}

const CAIXA_TXS: TxDeCaixa[] = [
  caixaTx({ id: "c-mercado", description: "Mercado", amount: 100, valor_pessoal: 60, type: "despesa", competence_date: "2026-11-02" }),
  caixaTx({ id: "c-presente", description: "Presente", amount: 40, valor_pessoal: 0, type: "despesa", competence_date: "2026-11-03" }),
  // SEM `liquidado_em`: cai na competência e a data é APROXIMADA.
  caixaTx({ id: "c-farmacia", description: "Farmácia", amount: 45.9, type: "despesa", competence_date: "2026-11-06", liquidado_em: null, account_id: "conta-b" }),
  // Pendente: não é caixa.
  caixaTx({ id: "c-escola", description: "Escola", amount: 80, type: "despesa", status: "pendente", competence_date: "2026-11-25", liquidado_em: null }),
  caixaTx({ id: "c-pag-fatura-b", description: "Pagamento da fatura do Cartão B", amount: 70, type: "transferencia", competence_date: "2026-11-03" }),
  caixaTx({ id: "c-sem-destino", description: "Transferência sem destino", amount: 150, type: "transferencia", competence_date: "2026-11-10" }),
  caixaTx({ id: "c-entre-contas", description: "Entre contas", amount: 200, type: "transferencia", competence_date: "2026-11-12", transfer_account_id: "conta-b" }),
  caixaTx({ id: "c-salario", description: "Salário", amount: 5000, type: "receita", status: "recebido", competence_date: "2026-11-05" }),
  caixaTx({ id: "c-pix", description: "Pix de Pessoa A", amount: 40, valor_pessoal: 0, type: "receita", status: "recebido", competence_date: "2026-11-07" }),
  // Compra no cartão: quem sai da conta é o pagamento da fatura. Fora de todos os números.
  caixaTx({ id: "c-loja", description: "Loja", amount: 200, type: "despesa", competence_date: "2026-11-03", liquidado_em: null, account_id: null, card_id: "cartao-a", payment_method: "cartao_credito" }),
  // Outubro: fora do período.
  caixaTx({ id: "c-out", description: "Mercado de outubro", amount: 33, type: "despesa", competence_date: "2026-10-20" }),
];

const MOTOR_DO_CAIXA: MotorDoCaixa = {
  statements: E.sts,
  receivables: E.recs,
  transactions: E.txs,
  installmentItems: E.inst,
};

function leituraDoCaixa(txs: TxDeCaixa[] = CAIXA_TXS) {
  return {
    ok: true as const,
    transactions: txs,
    pagamentosDeFatura: new Set(["c-pag-fatura-b"]),
    pagamentos: new Map([["c-pag-fatura-b", "f-b-nov"]]),
    comprasDasFaturasPagas: [],
    recebiveis: CRUS as RecebivelComRecebimentos[],
    parcial: false,
    periodoLido: { de: "2026-10-01", ate: "2026-11-30" },
  };
}

const CAIXA = { leitura: leituraDoCaixa(), motor: MOTOR_DO_CAIXA };
const PERIODO_DO_CAIXA = { de: "2026-11-01", ate: "2026-11-30" };

/* ───────────────────────────── Helpers do teste (deliberadamente independentes do modelo) ───────────────────────────── */

type Coluna = "brutoCent" | "meuCent" | "terceirosCent";
type DetalheOk = Extract<Detalhe, { estado: "ok" }>;

function pedir(
  chave: ParametrosDoDetalhe["pedido"]["chave"],
  parte: ParametrosDoDetalhe["pedido"]["parte"],
  alvo: string | null = null,
  sobre: Partial<ParametrosDoDetalhe> = {},
): Detalhe {
  return detalheDoNumero({
    pedido: { chave, parte, alvo },
    mes: MES,
    hoje: HOJE,
    base: "competencia",
    entradas: E,
    recebiveisCrus: CRUS,
    caixa: null,
    saldos: null,
    completude: { estado: "exato" },
    naoSegue: null,
    categoriaDoRecorte: null,
    nomes: NOMES,
    ...sobre,
  });
}

function ok(d: Detalhe): DetalheOk {
  if (d.estado !== "ok") throw new Error(`esperava estado ok, veio ${d.estado}`);
  return d;
}

function registrosDe(d: DetalheOk): RegistroDoDetalhe[] {
  return d.grupos.flatMap((g) => g.registros);
}

/** O laço do TESTE: a soma da lista exibida, sem passar pelo `somaCent` do modelo. */
function somaDoTeste(d: DetalheOk, coluna: Coluna): number {
  let total = 0;
  for (const grupo of d.grupos) {
    for (const registro of grupo.registros) total += registro[coluna];
  }
  return total;
}

/**
 * As três igualdades: lista do teste = total do modelo = agregador do motor = literal escrito à
 * mão. `agregadorEmReais` é o retorno CRU da função agregadora existente.
 */
function conciliar(d: Detalhe, coluna: Coluna, agregadorEmReais: number, literalEmCentavos: number): DetalheOk {
  const det = ok(d);
  expect(somaDoTeste(det, coluna)).toBe(literalEmCentavos);
  expect(det.totalCent).toBe(literalEmCentavos);
  expect(cent(agregadorEmReais)).toBe(literalEmCentavos);
  expect(det.somaCent).toBe(literalEmCentavos);
  expect(det.diferencaCent).toBe(0);
  return det;
}

const resumo = resumoMes({ mes: MES, transactions: E.txs, statements: E.sts, receivables: E.recs });
const categorias = gastosPorCategoria({ mes: MES, transactions: E.txs, statements: E.sts, installmentItems: E.inst, receivables: E.recs });
const formas = gastosPorForma({ mes: MES, transactions: E.txs, statements: E.sts, installmentItems: E.inst, receivables: E.recs });
/** A regra única de "meu × terceiros" da fatura (`faturasPorMes`), aplicada a UMA fatura por vez. */
function faturaDoMotor(id: string, mes: string) {
  return faturasPorMes({
    statements: E.sts.filter((s) => s.id === id),
    receivables: E.recs,
    meses: [mes],
    agrupar: "competencia",
  })[0];
}
const faturaA = faturaDoMotor("f-a-nov", MES);

/* ───────────────────────────── Os literais batem com o motor (a fixture é a prévia) ───────────────────────────── */

describe("a fixture reproduz a prévia aprovada (as contas à mão)", () => {
  it("saídas, entradas e cartão do mês", () => {
    expect(cent(resumo.saidas)).toBe(55590);
    expect(cent(resumo.meu)).toBe(37590);
    expect(cent(resumo.terceiros)).toBe(18000);
    expect(cent(resumo.entradasMeu)).toBe(500000);
    expect(cent(resumo.cartao)).toBe(29000);
    expect(cent(resumo.cartaoMeu)).toBe(19000);
  });

  it("a fatura A e o pendente", () => {
    expect(faturaA && cent(faturaA.total)).toBe(22000);
    expect(cent(totalPendenteAte(CRUS, HOJE))).toBe(13500);
    expect(cent(totalAReceber(E.recs, MES))).toBe(11000);
  });

  it("o caixa", () => {
    const minha = minhaParteDoCaixa({ periodo: PERIODO_DO_CAIXA, transactions: CAIXA_TXS, pagamentos: CAIXA.leitura.pagamentos, motor: MOTOR_DO_CAIXA });
    expect(cent(minha.saidas)).toBe(32590);
    expect(cent(minha.saidasBrutas)).toBe(40590);
    expect(cent(minha.terceirosNasSaidas)).toBe(8000);
  });
});

/* ───────────────────────────── Competência: entradas e saídas ───────────────────────────── */

describe("entradas (competência)", () => {
  it("minhas entradas: Σ meu = resumoMes.entradasMeu = 500000", () => {
    const d = conciliar(pedir("entradas", "meu"), "meuCent", resumo.entradasMeu, 500000);
    expect(d.parte).toBe("meu");
    // A entrada de terceiro (Pix da Pessoa A) está na lista, com minha parte zero.
    const pix = registrosDe(d).find((r) => r.descricao === "Pix de Pessoa A");
    expect(pix).toMatchObject({ brutoCent: 4000, meuCent: 0, terceirosCent: 4000 });
  });

  it("entradas de terceiros: Σ terceiros = resumoMes.entradasTerceiros = 4000", () => {
    conciliar(pedir("entradas", "terceiros"), "terceirosCent", resumo.entradasTerceiros, 4000);
  });

  it("consolidado: Σ bruto = resumoMes.entradas = 504000, e o estorno do cartão NÃO é entrada", () => {
    const d = conciliar(pedir("entradas", "bruto"), "brutoCent", resumo.entradas, 504000);
    expect(registrosDe(d).map((r) => r.id).sort()).toEqual(["t-pix", "t-salario"]);
  });
});

describe("saídas (competência)", () => {
  it("minhas saídas: Σ meu = resumoMes.meu = 37590", () => {
    const d = conciliar(pedir("saidas", "meu"), "meuCent", resumo.meu, 37590);
    expect(d.parte).toBe("meu");
  });

  it("de terceiros: Σ terceiros = resumoMes.terceiros = 18000", () => {
    conciliar(pedir("saidas", "terceiros"), "terceirosCent", resumo.terceiros, 18000);
  });

  it("bruto: Σ bruto = resumoMes.saidas = 55590", () => {
    conciliar(pedir("saidas", "bruto"), "brutoCent", resumo.saidas, 55590);
  });

  it("agrupa em À vista e uma seção por fatura do mês, com o total da view no cabeçalho", () => {
    const d = ok(pedir("saidas", "meu"));
    expect(d.grupos.map((g) => g.rotulo)).toEqual(["À vista", "Cartão A · vence 18/11", "Cartão B · vence 25/11"]);
    const [aVista, a, b] = d.grupos;
    expect(aVista.fatura).toBeNull();
    expect(a.fatura).toEqual({ totalCent: 22000, meuCent: 12000, diferencaCent: 0 });
    expect(b.fatura).toEqual({ totalCent: 7000, meuCent: 7000, diferencaCent: 0 });
  });

  it("a fatura A lista a compra, a parcela 3/10 e o estorno (negativo); a compra-pai nunca aparece", () => {
    const d = ok(pedir("saidas", "bruto"));
    const a = d.grupos.find((g) => g.rotulo.startsWith("Cartão A"));
    expect(a?.registros.map((r) => r.id).sort()).toEqual(["i-notebook-3", "t-estorno", "t-loja"]);
    expect(registrosDe(d).some((r) => r.id === "t-notebook-pai")).toBe(false);

    const estorno = registrosDe(d).find((r) => r.id === "t-estorno");
    expect(estorno?.brutoCent).toBe(-3000);
    expect(estorno?.meuCent).toBe(-3000);
    expect(estorno?.marcas).toContain("estorno");

    const parcela = registrosDe(d).find((r) => r.id === "i-notebook-3");
    expect(parcela?.marcas).toContainEqual({ parcela: { numero: 3, total: 10 } });
    expect(parcela).toMatchObject({ brutoCent: 5000, meuCent: 3000, terceirosCent: 2000 });
  });

  it("fatura de dezembro NÃO entra em saídas de novembro (Review Focus 1)", () => {
    const d = ok(pedir("saidas", "meu"));
    const ids = registrosDe(d).map((r) => r.id);
    expect(ids).not.toContain("i-curso-4");
    expect(d.grupos.some((g) => g.rotulo.includes("18/12"))).toBe(false);
    // …e dezembro tem a SUA gaveta, com a SUA fatura, conciliando com o motor de dezembro.
    const dez = resumoMes({ mes: "2026-12", transactions: E.txs, statements: E.sts, receivables: E.recs });
    const ddez = conciliar(pedir("saidas", "bruto", null, { mes: "2026-12" }), "brutoCent", dez.saidas, 4000);
    expect(registrosDe(ddez).map((r) => r.id)).toEqual(["i-curso-4"]);
  });

  it("outubro não aparece em novembro (competência × fatura)", () => {
    const ids = registrosDe(ok(pedir("saidas", "bruto"))).map((r) => r.id);
    expect(ids).not.toContain("t-out-mercado");
    expect(ids).not.toContain("t-out-cartao");
  });

  it("Σ por grupo concilia com a seção: à vista 26590 (bruto) e as duas faturas", () => {
    const d = ok(pedir("saidas", "bruto"));
    const porGrupo = d.grupos.map((g) => g.registros.reduce((s, r) => s + r.brutoCent, 0));
    expect(porGrupo).toEqual([26590, 22000, 7000]);
  });
});

describe("cartão (competência)", () => {
  it("gasto no cartão: Σ bruto das faturas = resumoMes.cartao = 29000", () => {
    const d = conciliar(pedir("cartao", "bruto"), "brutoCent", resumo.cartao, 29000);
    expect(d.grupos.every((g) => g.fatura !== null)).toBe(true);
  });

  it("cartão realmente meu: Σ meu = resumoMes.cartaoMeu = 19000", () => {
    conciliar(pedir("cartao", "meu"), "meuCent", resumo.cartaoMeu, 19000);
  });

  it("cartão de terceiros: cartão − cartaoMeu = 10000 (em centavos)", () => {
    conciliar(pedir("cartao", "terceiros"), "terceirosCent", resumo.cartao - resumo.cartaoMeu, 10000);
  });
});

/* ───────────────────────────── Categoria e forma ───────────────────────────── */

describe("categoria", () => {
  const fatia = (id: string | null) => categorias.find((c) => c.categoryId === id);

  it("Categoria A: bruto 30000 · meu 18000 · terceiros 12000", () => {
    const a = fatia("cat-a");
    conciliar(pedir("categoria", "bruto", "cat-a"), "brutoCent", a?.movimentado ?? Number.NaN, 30000);
    conciliar(pedir("categoria", "meu", "cat-a"), "meuCent", a?.meu ?? Number.NaN, 18000);
    conciliar(
      pedir("categoria", "terceiros", "cat-a"),
      "terceirosCent",
      (a?.movimentado ?? Number.NaN) - (a?.meu ?? Number.NaN),
      12000,
    );
  });

  it("o estorno NÃO entra na categoria (como na fatia da rosca)", () => {
    const d = ok(pedir("categoria", "bruto", "cat-a"));
    expect(registrosDe(d).map((r) => r.id).sort()).toEqual(["t-loja", "t-mercado"]);
  });

  it("Categoria E é a da parcela: 5000 (meu 3000), e a compra-pai não conta", () => {
    const e = fatia("cat-e");
    const d = conciliar(pedir("categoria", "bruto", "cat-e"), "brutoCent", e?.movimentado ?? Number.NaN, 5000);
    expect(registrosDe(d).map((r) => r.id)).toEqual(["i-notebook-3"]);
    conciliar(pedir("categoria", "meu", "cat-e"), "meuCent", e?.meu ?? Number.NaN, 3000);
  });

  it("'sem-categoria' é o alvo da Farmácia: 4590", () => {
    conciliar(pedir("categoria", "bruto", "sem-categoria"), "brutoCent", fatia(null)?.movimentado ?? Number.NaN, 4590);
  });

  it("categoria conhecida e sem item no mês → vazio; id que não existe → 'Registro não encontrado.'", () => {
    const semItem = pedir("categoria", "bruto", "cat-c");
    expect(semItem).toMatchObject({ estado: "vazio", frase: "Nenhum registro neste mês." });
    const fantasma = pedir("categoria", "bruto", "cat-zzz");
    expect(fantasma).toMatchObject({ estado: "vazio", frase: "Registro não encontrado." });
  });
});

describe("forma de pagamento", () => {
  const fatia = (forma: string) => formas.find((f) => f.paymentMethod === forma);

  it("cartão de crédito: bruto 32000 · meu 22000", () => {
    const f = fatia("cartao_credito");
    conciliar(pedir("forma", "bruto", "cartao_credito"), "brutoCent", f?.movimentado ?? Number.NaN, 32000);
    conciliar(pedir("forma", "meu", "cartao_credito"), "meuCent", f?.meu ?? Number.NaN, 22000);
  });

  it("pix: bruto 14000 · meu 6000 · terceiros 8000", () => {
    const f = fatia("pix");
    conciliar(pedir("forma", "bruto", "pix"), "brutoCent", f?.movimentado ?? Number.NaN, 14000);
    conciliar(pedir("forma", "meu", "pix"), "meuCent", f?.meu ?? Number.NaN, 6000);
    conciliar(pedir("forma", "terceiros", "pix"), "terceirosCent", (f?.movimentado ?? Number.NaN) - (f?.meu ?? Number.NaN), 8000);
  });

  it("boleto 8000 (a Escola, pendente, é competência) e débito 4590", () => {
    conciliar(pedir("forma", "bruto", "boleto"), "brutoCent", fatia("boleto")?.movimentado ?? Number.NaN, 8000);
    conciliar(pedir("forma", "bruto", "debito"), "brutoCent", fatia("debito")?.movimentado ?? Number.NaN, 4590);
  });

  it("forma desconhecida → 'Registro não encontrado.'", () => {
    expect(pedir("forma", "bruto", "cheque")).toMatchObject({ estado: "vazio", frase: "Registro não encontrado." });
  });
});

/* ───────────────────────────── Fatura ───────────────────────────── */

describe("fatura", () => {
  it("fatura A: bruto 22000 · meu 12000 · terceiros 10000", () => {
    const d = conciliar(pedir("fatura", "bruto", "f-a-nov"), "brutoCent", faturaA?.total ?? Number.NaN, 22000);
    expect(d.grupos).toHaveLength(1);
    conciliar(pedir("fatura", "meu", "f-a-nov"), "meuCent", faturaA?.meu ?? Number.NaN, 12000);
    conciliar(pedir("fatura", "terceiros", "f-a-nov"), "terceirosCent", faturaA?.terceiros ?? Number.NaN, 10000);
  });

  it("fatura de dezembro (projetada) abre pelo próprio id: 4000", () => {
    conciliar(pedir("fatura", "bruto", "f-a-dez"), "brutoCent", faturaDoMotor("f-a-dez", "2026-12")?.total ?? Number.NaN, 4000);
  });

  it("alvo inexistente ou de outro tipo → 'Registro não encontrado.' (nunca outro alvo, nunca a lista inteira)", () => {
    expect(pedir("fatura", "bruto", "cat-a")).toMatchObject({ estado: "vazio", frase: "Registro não encontrado." });
    expect(pedir("fatura", "bruto", "f-zzz")).toMatchObject({ estado: "vazio", frase: "Registro não encontrado." });
    expect(pedir("fatura", "bruto", null)).toMatchObject({ estado: "vazio", frase: "Registro não encontrado." });
  });

  it("total_atual 250,00 na fatura A: a diferença de 30,00 é DECLARADA, e o total continua o do motor", () => {
    const e250 = entradasDaFixture(250);
    const r250 = resumoMes({ mes: MES, transactions: e250.txs, statements: e250.sts, receivables: e250.recs });
    const d = ok(pedir("saidas", "bruto", null, { entradas: e250 }));
    // O total é o do motor (585,90), nunca ajustado; a lista soma 555,90.
    expect(d.totalCent).toBe(cent(r250.saidas));
    expect(d.totalCent).toBe(58590);
    expect(somaDoTeste(d, "brutoCent")).toBe(55590);
    expect(d.diferencaCent).toBe(3000);
    const a = d.grupos.find((g) => g.rotulo.startsWith("Cartão A"));
    expect(a?.fatura).toEqual({ totalCent: 25000, meuCent: 15000, diferencaCent: 3000 });
    // As outras seções fecham.
    expect(d.grupos.filter((g) => g !== a).every((g) => (g.fatura?.diferencaCent ?? 0) === 0)).toBe(true);

    const dMeu = ok(pedir("saidas", "meu", null, { entradas: e250 }));
    expect(dMeu.totalCent).toBe(cent(r250.meu));
    expect(dMeu.diferencaCent).toBe(3000);
  });
});

/* ───────────────────────────── Pendente ───────────────────────────── */

describe("pendente de terceiros", () => {
  it("até hoje: Σ = totalPendenteAte = 13500 (inclui o resto de outubro)", () => {
    const d = conciliar(pedir("pendente", "bruto"), "brutoCent", totalPendenteAte(CRUS, HOJE), 13500);
    expect(d.parte).toBe("pendente");
    // O Presente já foi devolvido por inteiro: não é pendente.
    expect(registrosDe(d).map((r) => r.id).sort()).toEqual(["r-loja", "r-mercado", "r-notebook", "r-out"]);
    // A Loja devia 80 e já voltaram 30.
    expect(registrosDe(d).find((r) => r.id === "r-loja")?.brutoCent).toBe(5000);
  });

  it("por pessoa: A 8500 · B 5000 (aReceberPorPessoa)", () => {
    const porPessoa = aReceberPorPessoa(CRUS, HOJE);
    const a = porPessoa.find((p) => p.pessoaId === "pessoa-a");
    const b = porPessoa.find((p) => p.pessoaId === "pessoa-b");
    conciliar(pedir("pendente", "bruto", "pessoa-a"), "brutoCent", a?.pendente ?? Number.NaN, 8500);
    conciliar(pedir("pendente", "bruto", "pessoa-b"), "brutoCent", b?.pendente ?? Number.NaN, 5000);
  });

  it("pessoa que não existe → 'Registro não encontrado.'", () => {
    expect(pedir("pendente", "bruto", "pessoa-zzz")).toMatchObject({ estado: "vazio", frase: "Registro não encontrado." });
  });

  it("referente ao mês: Σ = totalAReceber(recs, mês) = 11000 — o resto de outubro fica de fora", () => {
    const d = conciliar(pedir("pendente-do-mes", "bruto"), "brutoCent", totalAReceber(E.recs, MES), 11000);
    expect(registrosDe(d).map((r) => r.id).sort()).toEqual(["r-loja", "r-mercado", "r-notebook"]);
  });
});

/* ───────────────────────────── Projeção, contas e saldo ───────────────────────────── */

describe("projeção", () => {
  const projetar = (mes: string) =>
    projecaoProximosMeses({
      hoje: HOJE,
      meses: [mes],
      statements: E.sts,
      receivables: E.recs,
      recorrencias: E.recorrencias,
      bills: E.bills,
    })[0];

  it("dezembro: faturas (meu) + recorrência + contas fixas = 49000, tudo 'projetado'", () => {
    const d = conciliar(pedir("projecao", "meu", "2026-12"), "meuCent", projetar("2026-12").total, 49000);
    expect(d.parte).toBe("projetado");
    const todos = registrosDe(d);
    expect(todos.length).toBe(4);
    expect(todos.every((r) => r.marcas.includes("projetado"))).toBe(true);
  });

  it("novembro (mês corrente): 64000 — as duas faturas pelo VENCIMENTO, minha parte de cada", () => {
    conciliar(pedir("projecao", "meu", "2026-11"), "meuCent", projetar("2026-11").total, 64000);
  });

  it("mês inválido ou ausente → 'Registro não encontrado.'", () => {
    expect(pedir("projecao", "meu", "2026-13")).toMatchObject({ estado: "vazio", frase: "Registro não encontrado." });
    expect(pedir("projecao", "meu", null)).toMatchObject({ estado: "vazio", frase: "Registro não encontrado." });
  });
});

describe("próximas contas a pagar", () => {
  it("Σ = proximasContasPagar().total = 40000, tudo 'projetado'", () => {
    const proximas = proximasContasPagar({ hoje: HOJE, bills: E.bills });
    const d = conciliar(pedir("contas", "meu"), "meuCent", proximas.total, 40000);
    expect(registrosDe(d).map((r) => r.descricao)).toEqual(["Internet", "Condomínio"]);
    expect(registrosDe(d).every((r) => r.marcas.includes("projetado"))).toBe(true);
  });
});

describe("saldo das contas", () => {
  const saldos = {
    totalCent: 123456,
    porConta: [
      { id: "conta-a", nome: "Conta A", saldoCent: 100000 },
      { id: "conta-b", nome: "Conta B", saldoCent: 23456 },
    ],
  };

  it("Σ por conta = o saldo do indicador = 123456", () => {
    const d = ok(pedir("saldo", "bruto", null, { saldos }));
    expect(d.parte).toBe("saldo");
    expect(somaDoTeste(d, "brutoCent")).toBe(123456);
    expect(d.totalCent).toBe(123456);
    expect(d.diferencaCent).toBe(0);
  });

  it("uma conta que não leu: a soma diverge e o aviso diz qual", () => {
    const parcial = { totalCent: 123456, porConta: [saldos.porConta[0], { id: "conta-b", nome: "Conta B", saldoCent: null }] };
    const d = ok(pedir("saldo", "bruto", null, { saldos: parcial }));
    expect(d.totalCent).toBe(123456);
    expect(d.diferencaCent).toBe(23456);
    expect(d.avisos.some((a) => a.includes("Conta B"))).toBe(true);
  });

  it("o saldo total que não leu é FALHA, nunca lista vazia", () => {
    expect(pedir("saldo", "bruto", null, { saldos: { totalCent: null, porConta: [] } })).toMatchObject({
      estado: "falha",
      frase: "Não foi possível ler o saldo.",
    });
  });
});

/* ───────────────────────────── Base caixa ───────────────────────────── */

describe("caixa (base caixa)", () => {
  const sobre = { base: "caixa" as const, caixa: CAIXA };
  const numeros = numerosDoCaixa({
    periodo: PERIODO_DO_CAIXA,
    transactions: CAIXA_TXS,
    pagamentosDeFatura: CAIXA.leitura.pagamentosDeFatura,
    recebiveis: CAIXA.leitura.recebiveis,
  });
  const minha = minhaParteDoCaixa({ periodo: PERIODO_DO_CAIXA, transactions: CAIXA_TXS, pagamentos: CAIXA.leitura.pagamentos, motor: MOTOR_DO_CAIXA });

  it("minhas saídas: Σ meu = minhaParteDoCaixa.saidas = 32590", () => {
    const d = conciliar(pedir("saidas", "meu", null, sobre), "meuCent", minha.saidas, 32590);
    expect(d.grupos.map((g) => g.rotulo)).toEqual(["Despesas pagas", "Pagamentos de fatura", "Transferências sem destino"]);
  });

  it("de terceiros nas saídas: 8000 · bruto: 40590 (= saidasDeCaixa)", () => {
    conciliar(pedir("saidas", "terceiros", null, sobre), "terceirosCent", minha.terceirosNasSaidas, 8000);
    conciliar(pedir("saidas", "bruto", null, sobre), "brutoCent", minha.saidasBrutas, 40590);
    expect(cent(numeros.saidasDeCaixa)).toBe(40590);
  });

  it("minhas entradas: Σ meu = minhaParteDoCaixa.entradas = 500000", () => {
    conciliar(pedir("entradas", "meu", null, sobre), "meuCent", minha.entradas, 500000);
  });

  it("cada linha do caixa abre o seu número (numerosDoCaixa)", () => {
    const casos: [string, Coluna, number, number][] = [
      ["renda", "meuCent", numeros.rendaPessoalRecebida, 500000],
      ["outras", "terceirosCent", numeros.outrasEntradasDeTerceiros, 4000],
      ["reembolsos", "brutoCent", numeros.reembolsosRecebidos, 7000],
      ["saidas", "brutoCent", numeros.saidasDeCaixa, 40590],
      ["pagamentos", "brutoCent", numeros.pagamentosDeFatura, 7000],
      ["sem-destino", "brutoCent", numeros.transferenciasSemVinculo.total, 15000],
      ["entre-contas", "brutoCent", numeros.transferenciasEntreContas, 20000],
    ];
    for (const [alvo, coluna, agregador, literal] of casos) {
      conciliar(pedir("caixa", "bruto", alvo, sobre), coluna, agregador, literal);
    }
  });

  it("os reembolsos listam um registro por recebimento (30 e 40), pela data do recebimento", () => {
    const d = ok(pedir("caixa", "bruto", "reembolsos", sobre));
    expect(registrosDe(d).map((r) => [r.data, r.brutoCent])).toEqual([
      ["2026-11-03", 3000],
      ["2026-11-10", 4000],
    ]);
  });

  it("alvo desconhecido do caixa → 'Registro não encontrado.'", () => {
    expect(pedir("caixa", "bruto", "tudo", sobre)).toMatchObject({ estado: "vazio", frase: "Registro não encontrado." });
    expect(pedir("caixa", "bruto", null, sobre)).toMatchObject({ estado: "vazio", frase: "Registro não encontrado." });
  });

  it("Farmácia (sem liquidado_em) leva 'data-aproximada', e a contagem é a de numerosDoCaixa().aproximados", () => {
    const d = ok(pedir("saidas", "meu", null, sobre));
    const farmacia = registrosDe(d).find((r) => r.descricao === "Farmácia");
    expect(farmacia?.marcas).toContain("data-aproximada");
    expect(registrosDe(d).filter((r) => r.marcas.includes("data-aproximada"))).toHaveLength(1);
    expect(numeros.aproximados).toBe(1);
    expect(d.aproximados).toBe(numeros.aproximados);
    expect(d.avisos).toContain("1 registro com data aproximada (competência)");
  });

  it("pagamento de fatura SEM total na view conta cheio e leva 'contado-cheio'", () => {
    const semFatura: MotorDoCaixa = { ...MOTOR_DO_CAIXA, statements: [] };
    const semTotal = minhaParteDoCaixa({ periodo: PERIODO_DO_CAIXA, transactions: CAIXA_TXS, pagamentos: CAIXA.leitura.pagamentos, motor: semFatura });
    expect(semTotal.faturasSemTotal).toBe(1);
    const d = conciliar(pedir("saidas", "meu", null, { ...sobre, caixa: { leitura: CAIXA.leitura, motor: semFatura } }), "meuCent", semTotal.saidas, 32590);
    const pagamento = registrosDe(d).find((r) => r.id === "c-pag-fatura-b");
    expect(pagamento?.marcas).toContain("contado-cheio");
    expect(pagamento).toMatchObject({ brutoCent: 7000, meuCent: 7000 });
  });

  it("quando a fatura paga TEM total, não há 'contado-cheio'", () => {
    const d = ok(pedir("saidas", "meu", null, sobre));
    expect(registrosDe(d).find((r) => r.id === "c-pag-fatura-b")?.marcas).not.toContain("contado-cheio");
  });

  it("a compra no cartão e o pendente não aparecem no caixa", () => {
    const ids = registrosDe(ok(pedir("saidas", "bruto", null, sobre))).map((r) => r.id);
    expect(ids).not.toContain("c-loja");
    expect(ids).not.toContain("c-escola");
    expect(ids).not.toContain("c-out");
  });

  it("categoria, forma, cartão na base caixa: o número não segue (não há lista inventada)", () => {
    expect(pedir("categoria", "meu", "cat-a", sobre).estado).toBe("nao-segue");
    expect(pedir("forma", "meu", "pix", sobre).estado).toBe("nao-segue");
    expect(pedir("cartao", "meu", null, sobre).estado).toBe("nao-segue");
  });
});

/* ───────────────────────────── Estados ───────────────────────────── */

describe("estados", () => {
  it("mês sem lançamento → vazio, e o texto não tem 'R$'", () => {
    const d = pedir("saidas", "meu", null, { mes: "2026-08" });
    expect(d).toMatchObject({ estado: "vazio", frase: "Nenhum registro neste mês." });
    expect(JSON.stringify(d)).not.toContain("R$");
  });

  it("caixa 'erro' → falha (nunca lista vazia)", () => {
    const d = pedir("saidas", "meu", null, { base: "caixa", caixa: "erro" });
    expect(d).toMatchObject({ estado: "falha", frase: "Não foi possível ler o caixa agora." });
    expect(pedir("caixa", "bruto", "saidas", { base: "caixa", caixa: "erro" }).estado).toBe("falha");
  });

  it("base caixa sem a leitura (null) também é falha: não leu", () => {
    expect(pedir("saidas", "meu", null, { base: "caixa", caixa: null }).estado).toBe("falha");
  });

  it("naoSegue → nao-segue, com o motivo e o caminho, e SEM grupos", () => {
    const d = pedir("saidas", "meu", null, {
      naoSegue: { frase: "Este bloco não segue o recorte de pessoa.", hrefSemFiltro: "/relatorios?aba=financeiro" },
    });
    expect(d).toMatchObject({
      estado: "nao-segue",
      frase: "Este bloco não segue o recorte de pessoa.",
      hrefSemFiltro: "/relatorios?aba=financeiro",
    });
    expect("grupos" in d).toBe(false);
  });

  it("naoSegue vence a falha do caixa (a ordem dos estados)", () => {
    const d = pedir("saidas", "meu", null, {
      base: "caixa",
      caixa: "erro",
      naoSegue: { frase: "Este bloco não segue o recorte.", hrefSemFiltro: null },
    });
    expect(d.estado).toBe("nao-segue");
  });

  it("completude parcial → aviso com o motivo, e a lista continua", () => {
    const d = ok(
      pedir("saidas", "meu", null, {
        completude: { estado: "parcial", motivos: ["lançamentos cortados em 2000"] },
      }),
    );
    expect(d.avisos.some((a) => a.includes("lançamentos cortados em 2000"))).toBe(true);
    expect(d.totalCent).toBe(37590);
  });

  it("leitura do caixa cortada pelo teto → aviso de que pode faltar registro", () => {
    const parcial = { leitura: { ...CAIXA.leitura, parcial: true }, motor: MOTOR_DO_CAIXA };
    const d = ok(pedir("saidas", "meu", null, { base: "caixa", caixa: parcial }));
    expect(d.avisos.some((a) => a.includes("pode faltar registro"))).toBe(true);
  });

  it("recorte de categoria: filtra os itens, total = a fatia, e avisa 'antes dos estornos do cartão'", () => {
    const d = ok(pedir("saidas", "meu", null, { categoriaDoRecorte: "cat-a" }));
    const a = categorias.find((c) => c.categoryId === "cat-a");
    expect(d.totalCent).toBe(cent(a?.meu ?? Number.NaN));
    expect(d.totalCent).toBe(18000);
    expect(somaDoTeste(d, "meuCent")).toBe(18000);
    expect(d.diferencaCent).toBe(0);
    expect(registrosDe(d).map((r) => r.id).sort()).toEqual(["t-loja", "t-mercado"]);
    expect(d.avisos.some((x) => x.includes("antes dos estornos do cartão"))).toBe(true);
  });
});

/* ───────────────────────────── Teto de exibição ───────────────────────────── */

describe("teto de exibição (TETO + 1)", () => {
  it("301 registros → exibidos 300, existentes 301, aviso, e a soma é sobre os 301", () => {
    const linhas = Array.from({ length: TETO_DA_GAVETA + 1 }, (_, i) =>
      lancamento({
        id: `lote-${String(i).padStart(3, "0")}`,
        description: `Entrada ${i}`,
        amount: 1,
        type: "receita",
        status: "recebido",
        competence_date: "2026-09-10",
        account_id: "conta-a",
      }),
    );
    const { txs } = montarEntradas({ transacoes: linhas });
    const d = ok(pedir("entradas", "bruto", null, { mes: "2026-09", entradas: { ...E, txs } }));

    expect(TETO_DA_GAVETA).toBe(300);
    expect(d.existentes).toBe(301);
    expect(d.exibidos).toBe(300);
    expect(registrosDe(d)).toHaveLength(300);
    expect(d.avisos).toContain("Mostrando 300 de 301; o total continua o do motor.");
    // O total é o do motor (301,00) e a soma de conferência cobre os 301 — não só os exibidos.
    expect(d.totalCent).toBe(30100);
    expect(d.somaCent).toBe(30100);
    expect(d.diferencaCent).toBe(0);
  });

  it("exatamente 300 → sem aviso de teto", () => {
    const linhas = Array.from({ length: TETO_DA_GAVETA }, (_, i) =>
      lancamento({ id: `lote-${i}`, amount: 1, type: "receita", status: "recebido", competence_date: "2026-09-10", account_id: "conta-a" }),
    );
    const { txs } = montarEntradas({ transacoes: linhas });
    const d = ok(pedir("entradas", "bruto", null, { mes: "2026-09", entradas: { ...E, txs } }));
    expect(d.existentes).toBe(300);
    expect(d.exibidos).toBe(300);
    expect(d.avisos.some((a) => a.startsWith("Mostrando"))).toBe(false);
  });
});

/* ───────────────────────────── Marcas ───────────────────────────── */

describe("marcas", () => {
  it("'previsto': a Escola (pendente) e os itens da fatura A, não os da fatura B nem os pagos", () => {
    const d = ok(pedir("saidas", "bruto"));
    const marcas = (id: string) => registrosDe(d).find((r) => r.id === id)?.marcas ?? [];
    expect(marcas("t-escola")).toContain("previsto");
    expect(marcas("t-mercado")).not.toContain("previsto");
    // Fatura A (aberta): tudo previsto — compra, parcela e estorno.
    for (const id of ["t-loja", "i-notebook-3", "t-estorno"]) expect(marcas(id)).toContain("previsto");
    // Fatura B (paga): nada previsto.
    expect(marcas("t-restaurante")).not.toContain("previsto");
  });

  it("'projetado' em TODA linha de projeção (faturas, recorrências e contas fixas)", () => {
    for (const mes of ["2026-11", "2026-12"]) {
      const d = ok(pedir("projecao", "meu", mes));
      expect(registrosDe(d).length).toBeGreaterThan(0);
      expect(registrosDe(d).every((r) => r.marcas.includes("projetado"))).toBe(true);
    }
  });

  it("registro realizado nunca é 'projetado'", () => {
    const d = ok(pedir("saidas", "bruto"));
    expect(registrosDe(d).some((r) => r.marcas.includes("projetado"))).toBe(false);
  });
});

/* ───────────────────────────── O modelo não monta Dash* nem lê relógio ───────────────────────────── */

describe("disciplina do arquivo", () => {
  it("é puro: sem server-only, sem Supabase, sem relógio, e o caixa só por import type", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const fonte = readFileSync(resolve(__dirname, "detalhe.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/\/\/[^\n]*/g, " ");
    expect(fonte).not.toMatch(/server-only/);
    expect(fonte).not.toMatch(/supabase/i);
    expect(fonte).not.toMatch(/Date\.now\(/);
    expect(fonte).not.toMatch(/new Date\(\s*\)/);
    expect(fonte).not.toMatch(/^import\s+(?!type)[^;]*caixa-leitura/m);
    expect(fonte).toMatch(/import type \{[^}]*\} from "@\/lib\/finance\/caixa-leitura"/);
  });
});

describe("mês além da janela lida (revisão final, achado 2)", () => {
  // As duas telas leem `janelaDoRelatorio`: até o fim de (mês atual + 5). Hoje é 18/11/2026,
  // então abril de 2027 é o último mês com lançamentos lidos.
  const casos: [ParametrosDoDetalhe["pedido"]["chave"], string | null][] = [
    ["entradas", null],
    ["saidas", null],
    ["cartao", null],
    ["categoria", "sem-categoria"],
    ["forma", "pix"],
    ["pendente-do-mes", null],
  ];

  it.each(casos)("%s em maio de 2027 é falha declarada, nunca 'nenhum registro'", (chave, alvo) => {
    const d = pedir(chave, "meu", alvo, { mes: "2027-05" });
    expect(d.estado).toBe("falha");
    if (d.estado === "falha") expect(d.frase).toBe(
      "Este mês fica além do período que a tela lê (até 04/2027): os registros dele não foram lidos.",
    );
  });

  it("o limite é o fim da janela que as telas leem", () => {
    expect(janelaDoRelatorio({ mesSel: "2026-11", mesAtual: "2026-11" }).to).toBe("2027-04-30");
  });

  it("abril de 2027 ainda é lido (não é falha)", () => {
    for (const [chave, alvo] of casos) expect(pedir(chave, "meu", alvo, { mes: "2027-04" }).estado).not.toBe("falha");
  });
});

describe("parcela cuja compra-pai não tem descrição (conferência visual, dado real)", () => {
  it("escreve 'Compra parcelada', como a tela de Faturas, e não '(sem descrição)'", () => {
    const inst = (E.inst ?? []).map((i) => (i.id === "i-notebook-3" ? { ...i, descricao: null } : i));
    const d = ok(pedir("saidas", "meu", null, { entradas: { ...E, inst } }));
    const r = registrosDe(d).find((x) => x.id === "i-notebook-3");
    expect(r?.descricao).toBe("Compra parcelada");
  });
});
