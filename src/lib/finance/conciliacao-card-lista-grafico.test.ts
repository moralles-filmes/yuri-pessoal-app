/**
 * REDESIGN-03-G2 · E9 (K5) — A CONCILIAÇÃO: card × lista × gráfico, a mesma fixture e o mesmo filtro.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ Fixture: o bloco FIXTURE-CENARIO-9 (a MESMA do §9 — sintética; o último it confere).   ║
 * ║ Filtro: mês 2031-03, responsabilidade "meu", base COMPETÊNCIA.                        ║
 * ║                                                                                       ║
 * ║ QUEM É QUEM (todos em base COMPETÊNCIA; nenhum está em caixa)                         ║
 * ║                                                                                       ║
 * ║ • CARD  — `resumoMes(...).meu`: o card "Minhas saídas" do dashboard financeiro e do   ║
 * ║   relatório. Cartão pela competência da FATURA (`total_atual − parte do terceiro`).   ║
 * ║ • LISTA — `getTransactions({ month })` NO HARNESS (a leitura real da tela de          ║
 * ║   Lançamentos), e o "meu R$ X" que a linha escreve: `valor_pessoal`. Cartão pela      ║
 * ║   `competence_date` do LANÇAMENTO.                                                    ║
 * ║ • GRÁFICO — `evolucaoMensal(...)` (o ponto do mês de "Minhas entradas e saídas mês a   ║
 * ║   mês") e `gastosPorCategoria(...)` (o "Meus gastos por categoria"): ambos competência.║
 * ║                                                                                       ║
 * ║ ⚠️ ACHADO (registrado, NÃO consertado — K5): a tela de Lançamentos NÃO soma nada e NÃO   ║
 * ║    tem filtro de responsabilidade. Ela mostra, por linha, o valor BRUTO e o rótulo     ║
 * ║    "meu R$ X". Não existe "o total que Lançamentos mostra para o mês com o filtro      ║
 * ║    meu": o que se concilia é o "meu" da LINHA (a única despesa do mês). Com mais de    ║
 * ║    uma despesa no mês a lista não tem número para conciliar — o varrimento da fonte    ║
 * ║    abaixo fica vermelho no dia em que a tela ganhar um total, e é esse o sinal.        ║
 * ║                                                                                       ║
 * ║ Nenhuma conta é reimplementada: o teste lê campos e chama funções do motor.           ║
 * ║                                                                                       ║
 * ║ ⛔ A MUTAÇÃO Y21 (`valor_pessoal ?? amount` → `amount` em `meuCentavos`) derruba o it   ║
 * ║    da igualdade (a fatia da categoria sai 1.000, não 400) e o da base caixa (a fatia   ║
 * ║    "Diferença da fatura" aparece). O card e a lista seguem em 400: o gráfico é quem cai.║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */
import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { evolucaoMensal, gastosPorCategoria, resumoMes } from "@/lib/finance/dashboard";
import type { DashReceivable, DashStatement, DashTx } from "@/lib/finance/dashboard";
import { evolucaoDoCaixa, gastosDeCaixa, minhaParteDoCaixa } from "@/lib/finance/caixa-minha-parte";
import { periodoAteODia, type TxDeCaixa } from "@/lib/finance/caixa";
import { resumirRecebivel, type RecebivelComRecebimentos } from "@/lib/finance/recebimentos";
import { criarSupabaseEmMemoria } from "@/test/supabase-em-memoria";

/* eslint-disable @typescript-eslint/no-unused-vars -- a fixture é UMA só, copiada igual nos dois arquivos */
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
/* eslint-enable @typescript-eslint/no-unused-vars */

let fake = criarSupabaseEmMemoria({});
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => fake.client }));

const Q = await import("@/lib/finance/queries");

const { transacoes, faturas, recebiveis } = cenario9();

beforeEach(() => {
  // As linhas do banco = a fixture; a compra ganha a classificação que o banco grava nela.
  fake = criarSupabaseEmMemoria({
    transactions: transacoes.map((t) => ({
      ...t,
      ...(t.id === COMPRA.id ? { classificacao: "compartilhada" } : {}),
    })),
  });
});

const entradasDoMotor = () => ({
  transactions: [...transacoes],
  statements: faturas,
  receivables: recebiveis,
});

/** O que a lista de Lançamentos devolve para o mês, e o "meu" que a linha da despesa escreve. */
async function listaDoMes(mes: string) {
  const leitura = await Q.getTransactions({ month: mes });
  const despesas = leitura.linhas.filter((t) => t.type === "despesa");
  return { leitura, despesas };
}

describe("03-G2 E9 · conciliação — card × lista × gráfico (mês 2031-03, meu, competência)", () => {
  it("card, lista e gráfico mostram a mesma minha parte do mês", async () => {
    // CARD: "Minhas saídas".
    const card = resumoMes({ mes: MES_9, ...entradasDoMotor() }).meu;

    // LISTA: a leitura real de Lançamentos; a despesa do mês é UMA, e a linha diz "meu R$ X".
    const { despesas } = await listaDoMes(MES_9);
    expect(despesas).toHaveLength(1);
    const lista = Number(despesas[0].valor_pessoal);

    // GRÁFICO 1: o ponto do mês de "Minhas entradas e saídas mês a mês".
    const [ponto] = evolucaoMensal({ meses: [MES_9], ...entradasDoMotor() });
    // GRÁFICO 2: "Meus gastos por categoria" — uma fatia só, a da compra.
    const fatias = gastosPorCategoria({
      mes: MES_9,
      ...entradasDoMotor(),
      installmentItems: [],
    });
    expect(fatias).toHaveLength(1);

    expect(card).toBe(400);
    expect(lista).toBe(400);
    expect(ponto.saidas).toBe(400);
    expect(fatias[0].meu).toBe(400);
  });

  it("o bruto não é rotulado 'meu': lista e card mostram R$ 1.000 como valor total e R$ 400 como minha parte", async () => {
    const { despesas } = await listaDoMes(MES_9);
    // A linha da lista traz o bruto (é o que o cartão da linha escreve em destaque)…
    expect(Number(despesas[0].amount)).toBe(1000);
    // …e o card traz o mesmo bruto em "Saídas totais (bruto)", separado da minha parte.
    const r = resumoMes({ mes: MES_9, ...entradasDoMotor() });
    expect(r.saidas).toBe(1000);
    expect(r.terceiros).toBe(600);
    expect(r.meu + r.terceiros).toBe(r.saidas);
  });

  it("a lista de Lançamentos NÃO tem total nem filtro de responsabilidade (achado — registrado, não consertado)", () => {
    // Varredura da FONTE: no dia em que a tela somar a coluna ou ganhar o filtro "meu", este it
    // fica vermelho — e a conciliação acima passa a precisar de um quarto número.
    const dir = path.join(process.cwd(), "src", "app", "(app)", "financeiro", "lancamentos");
    const fonte = ["transactions-client.tsx", "page.tsx", "transaction-filters.tsx"]
      .map((f) => fs.readFileSync(path.join(dir, f), "utf8"))
      .join("\n");
    expect(fonte).not.toContain("resumoMes");
    expect(fonte).not.toContain("meuCentavos");
    expect(fonte).not.toContain(".reduce(");
    expect(fonte).not.toContain("responsabilidade");
  });

  it("na base CAIXA (abril, quando a fatura é paga) card e gráfico também batem: minha parte R$ 400", () => {
    // Outra base, outro mês: o dinheiro só sai em 2031-04-10. Não é a mesma conta do it
    // acima (a lista de Lançamentos é por competência e não tem caixa), por isso é um it à
    // parte e não entra na igualdade de três.
    const motor = {
      statements: faturas,
      receivables: recebiveis,
      transactions: transacoes,
      installmentItems: [],
    };
    const comum = { transactions: transacoes, pagamentos: PAGAMENTOS_DE_FATURA, motor };
    const card = minhaParteDoCaixa({ ...comum, periodo: periodoAteODia(MES_DO_PAGAMENTO_9, 31) }).saidas;
    const [ponto] = evolucaoDoCaixa({ ...comum, meses: [MES_DO_PAGAMENTO_9] });
    const { categorias } = gastosDeCaixa({ ...comum, periodo: periodoAteODia(MES_DO_PAGAMENTO_9, 31) });
    expect(categorias).toHaveLength(1);

    expect(card).toBe(400);
    expect(ponto.saidas).toBe(400);
    expect(categorias[0].meu).toBe(400);
  });

  it("a fixture deste arquivo é, letra por letra, a do fechamento do §9 (a MESMA fixture)", () => {
    const bloco = (arquivo: string) => {
      const fonte = fs.readFileSync(path.join(process.cwd(), "src", "lib", "finance", arquivo), "utf8");
      const de = fonte.indexOf("// ═══ FIXTURE-CENARIO-9 · INÍCIO");
      const ate = fonte.indexOf("// ═══ FIXTURE-CENARIO-9 · FIM");
      expect(de, `${arquivo}: sem marca de início`).toBeGreaterThanOrEqual(0);
      expect(ate, `${arquivo}: sem marca de fim`).toBeGreaterThan(de);
      return fonte.slice(de, ate).split("\r\n").join("\n");
    };
    expect(bloco("conciliacao-card-lista-grafico.test.ts")).toBe(bloco("fechamento-redesign-03.test.ts"));
  });
});
