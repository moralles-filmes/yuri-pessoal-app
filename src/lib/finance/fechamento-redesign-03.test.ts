/**
 * REDESIGN-03-G2 · E9 (K5) — O FECHAMENTO: o cenário sintético do §9, as oito exigências.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ O que este arquivo é                                                                  ║
 * ║                                                                                       ║
 * ║ `docs/redesign/METRICAS-FINANCEIRAS.md` §9 lista OITO exigências sobre uma compra de   ║
 * ║ R$ 1.000 no cartão (minha parte R$ 400, terceiro R$ 600, reembolso de R$ 250, fatura  ║
 * ║ paga). Em 2026-09-20 três eram irrepresentáveis e uma era condicional; a 03-C/03-D/    ║
 * ║ 03-E as representaram. Aqui cada uma é um `it`, respondido pela função REAL que a      ║
 * ║ tela usa para aquele número.                                                          ║
 * ║                                                                                       ║
 * ║ ⛔ NENHUMA CONTA É REIMPLEMENTADA. O teste monta a fixture (o bloco FIXTURE-CENARIO-9),   ║
 * ║    chama o motor e compara com o número escrito à mão. Fixture SINTÉTICA — o           ║
 * ║    repositório é público.                                                             ║
 * ║                                                                                       ║
 * ║ ⛔ A MUTAÇÃO Y21 (a minha parte do motor passa a ser bruta: `valor_pessoal ?? amount`   ║
 * ║    → `amount` em `meuCentavos`) derruba [1] (a fatia da categoria sai 1.000, não 400)   ║
 * ║    e [5] (a renda pessoal "sobe" R$ 250).                                              ║
 * ║                                                                                       ║
 * ║ O 8º it (caixa) e o 3º/4º (recebimento) eram ❌ em §9; hoje são respondidos por         ║
 * ║ `recebimentos.ts` e `caixa.ts`. Nenhuma exigência ficou sem resposta: não há `it.fails`. ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */
import { describe, expect, it } from "vitest";
import {
  dataDeCaixa,
  entradasDoCaixa,
  numerosDoCaixa,
  type Periodo,
  type TxDeCaixa,
} from "@/lib/finance/caixa";
import { evolucaoDoCaixa, minhaParteDoCaixa } from "@/lib/finance/caixa-minha-parte";
import {
  faturasPorMes,
  gastosPorCategoria,
  resumoMes,
  totalAReceber,
  type DashReceivable,
  type DashStatement,
  type DashTx,
} from "@/lib/finance/dashboard";
import {
  estadoDoRecebivel,
  pendenteDoPeriodo,
  recebidoCentavos,
  reembolsosRecebidosNoPeriodo,
  resumirRecebivel,
  somaDaParteDosTerceiros,
  type RecebivelComRecebimentos,
} from "@/lib/finance/recebimentos";

// ═══ FIXTURE-CENARIO-9 · INÍCIO ═══════════════════════════════════════════════════════
// SINTÉTICA (o repositório é público) e IDÊNTICA nos dois arquivos de fechamento: o teste da
// conciliação confere, pelo texto, que este bloco é o mesmo do `fechamento-redesign-03.test.ts`.
// Não é um módulo à parte porque as varreduras `quem-le-liquidado-em` e `fronteira-do-motor`
// reprovam arquivo de produção novo que cite a coluna ou monte `Dash*` (D-G2-12).
//
// O cenário: compra de R$ 1.000 no cartão, dividida — minha parte R$ 400 e a de "Pessoa
// Sintética" R$ 600 (recebível na fatura de 2031-03). Ela devolve R$ 250 em 2031-03-20,
// registrados como RECEBIMENTO do recebível (não como receita). A fatura de R$ 1.000 é paga em
// 2031-04-10, gravada como TRANSFERÊNCIA de conta. Valores em REAIS (`numeric(14,2)`, inv. 63).
/** O lançamento nas duas formas em que o motor o lê: competência (`DashTx`) e caixa (`TxDeCaixa`). */
type TxSintetica = DashTx & TxDeCaixa;

const MES_9 = "2031-03";
const MES_DO_PAGAMENTO_9 = "2031-04";
const PESSOA_SINTETICA = "Pessoa Sintética";

const CONTA_9 = "conta-sintetica";
const CARTAO_9 = "cartao-sintetico";
const FATURA_9 = "fatura-sintetica";
const CATEGORIA_9 = { id: "cat-sintetica", name: "Categoria Sintética", color: null } as const;

/** A fatura de 2031-03: R$ 1.000, paga em 2031-04-10 (`pago_em` + `pago_transacao_id`). */
const FATURA: DashStatement = {
  id: FATURA_9,
  card_id: CARTAO_9,
  competencia: "2031-03-01",
  data_fechamento: "2031-03-10",
  data_vencimento: "2031-03-20",
  pago_em: "2031-04-10",
  total_atual: 1000,
};

/**
 * O recebível de "Pessoa Sintética": a responsabilidade ORIGINAL, R$ 600, e o recebimento de
 * R$ 250 em 2031-03-20. `status` fica `pendente`: `parcial` nunca é gravado (deriva da soma).
 */
const RECEBIVEL_COM_RECEBIMENTOS: RecebivelComRecebimentos & {
  id: string;
  statement_id: string;
  installment_id: null;
  transaction_id: null;
  ref_month: string;
  pessoa: string;
} = {
  id: "recebivel-sintetico",
  pessoa: PESSOA_SINTETICA,
  statement_id: FATURA_9,
  installment_id: null,
  transaction_id: null,
  ref_month: MES_9,
  valor: 600,
  status: "pendente",
  pago_em: null,
  recebimentos: [{ valor: 250, recebido_em: "2031-03-20" }],
};

/** O mesmo recebível na forma que o motor recebe: `recebido` JÁ SOMADO por `resumirRecebivel`. */
function recebivelDoMotor(
  r: RecebivelComRecebimentos & {
    statement_id: string;
    installment_id: null;
    transaction_id: null;
    ref_month: string;
  } = RECEBIVEL_COM_RECEBIMENTOS,
): DashReceivable {
  return {
    statement_id: r.statement_id,
    installment_id: r.installment_id,
    transaction_id: r.transaction_id,
    ref_month: r.ref_month,
    ...resumirRecebivel(r),
    valor: Number(r.valor),
  };
}

const base: Omit<TxSintetica, "id" | "type" | "amount" | "competence_date" | "status"> = {
  valor_pessoal: null,
  payment_method: null,
  card_id: null,
  statement_id: null,
  parcelado: false,
  category_id: null,
  category: null,
  liquidado_em: null,
  account_id: null,
  transfer_account_id: null,
};

/** A compra no cartão: R$ 1.000 bruto, `valor_pessoal` R$ 400 (gravado no ato da divisão). */
const COMPRA: TxSintetica = {
  ...base,
  id: "tx-compra-sintetica",
  type: "despesa",
  amount: 1000,
  valor_pessoal: 400,
  status: "pago",
  competence_date: "2031-03-05",
  payment_method: "cartao_credito",
  card_id: CARTAO_9,
  statement_id: FATURA_9,
  category_id: CATEGORIA_9.id,
  category: CATEGORIA_9,
};

/**
 * O pagamento da fatura, como `payloadPagamentoFatura` o grava: TRANSFERÊNCIA, `statement_id` e
 * `card_id` nulos, data de caixa exata (`liquidado_em`).
 */
const PAGAMENTO_DA_FATURA: TxSintetica = {
  ...base,
  id: "tx-pagamento-sintetico",
  type: "transferencia",
  amount: 1000,
  status: "pago",
  payment_method: "transferencia",
  account_id: CONTA_9,
  competence_date: "2031-04-10",
  liquidado_em: "2031-04-10",
};

/** `card_statements.pago_transacao_id` — quem diz ao caixa que a transferência é o pagamento. */
const PAGAMENTOS_DE_FATURA = new Map<string, string>([[PAGAMENTO_DA_FATURA.id, FATURA_9]]);

/** Uma renda pessoal genuína do mês, para a exigência [5] ter contra o que subir. */
const RENDA_PESSOAL: TxSintetica = {
  ...base,
  id: "tx-renda-sintetica",
  type: "receita",
  amount: 3000,
  status: "recebido",
  payment_method: "pix",
  account_id: CONTA_9,
  competence_date: "2031-03-05",
  liquidado_em: "2031-03-05",
};

/**
 * A variante da exigência [5]: o dono lançou o reembolso como RECEITA e a classificou como
 * dinheiro de terceiro (`valor_pessoal` 0, gravado no ato — E2/E3 da 03-C).
 */
const REEMBOLSO_LANCADO_COMO_RECEITA_DE_TERCEIRO: TxSintetica = {
  ...base,
  id: "tx-reembolso-sintetico",
  type: "receita",
  amount: 250,
  valor_pessoal: 0,
  status: "recebido",
  payment_method: "pix",
  account_id: CONTA_9,
  competence_date: "2031-03-20",
  liquidado_em: "2031-03-20",
};

/** O cenário do §9 como o banco o teria em 2031-03 / 2031-04. */
function cenario9(): {
  transacoes: TxSintetica[];
  faturas: DashStatement[];
  recebiveis: DashReceivable[];
} {
  return {
    transacoes: [COMPRA, PAGAMENTO_DA_FATURA, RENDA_PESSOAL],
    faturas: [FATURA],
    recebiveis: [recebivelDoMotor()],
  };
}
// ═══ FIXTURE-CENARIO-9 · FIM ═════════════════════════════════════════════════════════

const { transacoes, faturas, recebiveis } = cenario9();

const MARCO: Periodo = { de: "2031-03-01", ate: "2031-03-31" };
const ABRIL: Periodo = { de: "2031-04-01", ate: "2031-04-30" };
const PAGOU = new Set(PAGAMENTOS_DE_FATURA.keys());

/** O mesmo recebível SEM o recebimento de R$ 250 — o "antes" de o terceiro devolver. */
const recebivelSemRecebimento = () =>
  recebivelDoMotor({ ...RECEBIVEL_COM_RECEBIMENTOS, recebimentos: [] });

const resumo = (mes: string, trs: readonly TxSintetica[] = transacoes, recs = recebiveis) =>
  resumoMes({ mes, transactions: [...trs], statements: faturas, receivables: recs });

const caixa = (periodo: Periodo, trs: readonly TxSintetica[] = transacoes) =>
  numerosDoCaixa({
    periodo,
    transactions: trs,
    pagamentosDeFatura: PAGOU,
    recebiveis: [RECEBIVEL_COM_RECEBIMENTOS],
  });

const motor = () => ({
  statements: faturas,
  receivables: recebiveis,
  transactions: transacoes,
  installmentItems: [],
});

describe("03-G2 E9 · §9 — o cenário sintético obrigatório (matriz de fechamento da 03-G2)", () => {
  it("[1] minha despesa continua R$ 400 — no resumo, na categoria e na base caixa", () => {
    // `resumoMes`: total_atual − Σ parte do terceiro (o VALOR, D3) = 1000 − 600. Com o
    // terceiro JÁ tendo devolvido R$ 250, a minha despesa não se mexe.
    const r = resumo(MES_9);
    expect(r.cartaoMeu).toBe(400);
    expect(r.meu).toBe(400);

    // A fatia da categoria (o gráfico "Meus gastos por categoria") sai de `valor_pessoal`:
    // é onde a Y21 aparece.
    const fatias = gastosPorCategoria({
      mes: MES_9,
      transactions: [...transacoes],
      statements: faturas,
      installmentItems: [],
      receivables: recebiveis,
    });
    expect(fatias).toHaveLength(1);
    expect(fatias[0].movimentado).toBe(1000);
    expect(fatias[0].meu).toBe(400);

    // Base caixa: a fatura de R$ 1.000 paga em abril é, para mim, R$ 400.
    const c = minhaParteDoCaixa({
      periodo: ABRIL,
      transactions: transacoes,
      pagamentos: PAGAMENTOS_DE_FATURA,
      motor: motor(),
    });
    expect(c.saidasBrutas).toBe(1000);
    expect(c.saidas).toBe(400);
    expect(c.terceirosNasSaidas).toBe(600);
  });

  it("[2] responsabilidade original do terceiro = R$ 600", () => {
    // O VALOR, nunca o saldo (D3): continua 600 depois do recebimento de 250.
    expect(resumo(MES_9).terceiros).toBe(600);
    expect(somaDaParteDosTerceiros([RECEBIVEL_COM_RECEBIMENTOS])).toBe(600);
    // E é o mesmo número antes de ele devolver qualquer coisa.
    expect(resumo(MES_9, transacoes, [recebivelSemRecebimento()]).terceiros).toBe(600);
  });

  it("[3] reembolso recebido = R$ 250", () => {
    expect(recebidoCentavos(recebivelDoMotor())).toBe(25000);
    expect(reembolsosRecebidosNoPeriodo([RECEBIVEL_COM_RECEBIMENTOS], MARCO)).toBe(250);
    // O mesmo número, pelo caixa (que CHAMA a função acima — não a recalcula).
    expect(caixa(MARCO).reembolsosRecebidos).toBe(250);
  });

  it("[4] recebível restante = R$ 350", () => {
    expect(pendenteDoPeriodo([recebivelDoMotor()], MES_9)).toBe(350);
    // O "A receber" do card do dashboard (`totalAReceber(recs, mesSel)`).
    expect(totalAReceber(recebiveis, MES_9)).toBe(350);
    // `parcial` nunca é gravado: o estado deriva da soma.
    expect(estadoDoRecebivel(recebivelDoMotor())).toBe("parcial");
    expect(RECEBIVEL_COM_RECEBIMENTOS.status).toBe("pendente");
  });

  it("[5] minha renda pessoal não sobe R$ 250", () => {
    // Reembolso registrado como RECEBIMENTO do recebível: não há receita nenhuma. A renda
    // pessoal do mês é a de sempre (R$ 3.000 sintéticos), no resumo e no caixa.
    const r = resumo(MES_9);
    expect(r.entradas).toBe(3000);
    expect(r.entradasMeu).toBe(3000);
    expect(caixa(MARCO).rendaPessoalRecebida).toBe(3000);
    // O reembolso aparece em OUTRA linha do caixa, nunca somado à renda.
    expect(caixa(MARCO).reembolsosRecebidos).toBe(250);

    // E se o dono lançar o reembolso como receita DE TERCEIRO (`valor_pessoal` 0, D10): o
    // bruto sobe, a minha parte não — no resumo e no caixa. Esta é a asserção da Y21.
    const comReceita = [...transacoes, REEMBOLSO_LANCADO_COMO_RECEITA_DE_TERCEIRO];
    const rr = resumo(MES_9, comReceita);
    expect(rr.entradas).toBe(3250);
    expect(rr.entradasMeu).toBe(3000);
    expect(rr.entradasTerceiros).toBe(250);
    const cc = caixa(MARCO, comReceita);
    expect(cc.rendaPessoalRecebida).toBe(3000);
    expect(cc.outrasEntradasDeTerceiros).toBe(250);
  });

  it("[6] reembolso não reduz a fatura devida ao banco", () => {
    // `receivables` e `card_statements` são tabelas independentes: a fatura é R$ 1.000 com
    // e sem o recebimento de R$ 250.
    const sem = resumo(MES_9, transacoes, [recebivelSemRecebimento()]);
    const com = resumo(MES_9);
    expect(sem.cartao).toBe(1000);
    expect(com.cartao).toBe(1000);
    expect(com.cartao).toBe(sem.cartao);
    // O valor cheio da fatura que o gráfico "Faturas dos próximos meses" plota.
    const [cheia] = faturasPorMes({
      statements: faturas,
      receivables: recebiveis,
      meses: [MES_9],
      agrupar: "vencimento",
    });
    expect(cheia.total).toBe(1000);
    expect(FATURA.total_atual).toBe(1000);
  });

  it("[7] pagar R$ 1.000 ao banco não cria despesa nova", () => {
    // O pagamento é `transferencia`: fora de entradas e de saídas, em qualquer mês.
    const semPagamento = transacoes.filter((t) => t.id !== PAGAMENTO_DA_FATURA.id);
    expect(resumo(MES_9)).toEqual(resumo(MES_9, semPagamento));
    expect(resumo(MES_9).saidas).toBe(1000); // a compra, UMA vez — não 2.000
    expect(resumo(MES_DO_PAGAMENTO_9)).toEqual(resumo(MES_DO_PAGAMENTO_9, semPagamento));
    expect(resumo(MES_DO_PAGAMENTO_9).saidas).toBe(0);
    expect(resumo(MES_DO_PAGAMENTO_9).aVista).toBe(0);
    // No caixa ele é a SAÍDA (as compras que o compõem não entram de novo).
    const abril = caixa(ABRIL);
    expect(abril.saidasDeCaixa).toBe(1000);
    expect(abril.pagamentosDeFatura).toBe(1000);
    expect(abril.transferenciasEntreContas).toBe(0);
    expect(caixa(MARCO).saidasDeCaixa).toBe(0); // a compra no cartão não tirou dinheiro de conta
  });

  it("[8] caixa mostra pagamento e reembolso nas datas efetivas", () => {
    // O reembolso entra em 2031-03-20 — e só nesse dia.
    expect(caixa({ de: "2031-03-20", ate: "2031-03-20" }).reembolsosRecebidos).toBe(250);
    expect(caixa({ de: "2031-03-19", ate: "2031-03-19" }).reembolsosRecebidos).toBe(0);
    expect(caixa({ de: "2031-03-21", ate: "2031-03-31" }).reembolsosRecebidos).toBe(0);
    // O pagamento sai em 2031-04-10 (data exata, não aproximada) — e não em março.
    expect(dataDeCaixa(PAGAMENTO_DA_FATURA)).toEqual({ data: "2031-04-10", aproximada: false });
    expect(caixa({ de: "2031-04-10", ate: "2031-04-10" }).pagamentosDeFatura).toBe(1000);
    expect(caixa(MARCO).pagamentosDeFatura).toBe(0);
    // A soma das entradas de março inclui o reembolso (renda 3.000 + reembolso 250); abril não.
    expect(entradasDoCaixa(caixa(MARCO))).toBe(3250);
    expect(entradasDoCaixa(caixa(ABRIL))).toBe(0);
    // E a evolução "minha" por mês (o gráfico): a saída de abril é a MINHA parte do pagamento.
    expect(
      evolucaoDoCaixa({
        meses: [MES_9, MES_DO_PAGAMENTO_9],
        transactions: transacoes,
        pagamentos: PAGAMENTOS_DE_FATURA,
        motor: motor(),
      }),
    ).toEqual([
      { mes: "2031-03", entradas: 3000, saidas: 0, saldo: 3000 },
      { mes: "2031-04", entradas: 0, saidas: 400, saldo: -400 },
    ]);
  });
});
