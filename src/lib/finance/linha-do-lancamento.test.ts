import { describe, expect, it } from "vitest";
import {
  COLUNAS_DA_COMPRA_PAI,
  COLUNAS_DA_LINHA,
  montarCompraPai,
  montarLinhaDoLancamento,
} from "@/lib/finance/linha-do-lancamento";
import type { InstallmentPurchaseInput } from "@/lib/validators/installment";
import type { TransactionInput } from "@/lib/validators/transaction";

// Fixtures sintéticas: ids fictícios, nenhum nome real.
const CONTA_A = "00000000-0000-4000-8000-0000000000a1";
const CONTA_B = "00000000-0000-4000-8000-0000000000a2";
const CARTAO = "00000000-0000-4000-8000-0000000000c1";
const FATURA = "00000000-0000-4000-8000-0000000000f1";
const CATEGORIA = "00000000-0000-4000-8000-0000000000d1";
const SUBCATEGORIA = "00000000-0000-4000-8000-0000000000d2";
const GRUPO = "00000000-0000-4000-8000-0000000000e1";

function entrada(sobre: Partial<TransactionInput> = {}): TransactionInput {
  return {
    type: "despesa",
    payment_method: "pix",
    account_id: CONTA_A,
    transfer_account_id: null,
    card_id: null,
    category_id: CATEGORIA,
    subcategory_id: SUBCATEGORIA,
    amount: 120.5,
    purchase_date: "2026-10-10",
    competence_date: "2026-10-01",
    description: "Item de teste",
    notes: null,
    tags: ["a"],
    status: "pago",
    liquidado_em: "2026-10-11",
    ...sobre,
  } as TransactionInput;
}

const SEM_VINCULO = { cardId: null, statementId: null, transferGroupId: null };

describe("montarLinhaDoLancamento", () => {
  it("transferência força payment_method transferencia e categoria/cartão/fatura nulos (D-G2-15)", () => {
    const linha = montarLinhaDoLancamento(
      entrada({
        type: "transferencia",
        payment_method: "pix",
        transfer_account_id: CONTA_B,
        card_id: CARTAO,
      }),
      { cardId: CARTAO, statementId: FATURA, transferGroupId: GRUPO },
    );
    expect(linha.payment_method).toBe("transferencia");
    expect(linha.account_id).toBe(CONTA_A);
    expect(linha.transfer_account_id).toBe(CONTA_B);
    expect(linha.transfer_group_id).toBe(GRUPO);
    expect(linha.card_id).toBeNull();
    expect(linha.statement_id).toBeNull();
    expect(linha.category_id).toBeNull();
    expect(linha.subcategory_id).toBeNull();
  });

  it("estorno: payment_method e account_id nulos, cartão e fatura preservados (D-G2-1)", () => {
    const linha = montarLinhaDoLancamento(
      entrada({ type: "receita", status: "recebido" }),
      { cardId: CARTAO, statementId: FATURA, transferGroupId: null, estorno: true },
    );
    expect(linha.payment_method).toBeNull();
    expect(linha.account_id).toBeNull();
    expect(linha.card_id).toBe(CARTAO);
    expect(linha.statement_id).toBe(FATURA);
    expect(linha.transfer_account_id).toBeNull();
    expect(linha.transfer_group_id).toBeNull();
    expect(linha.category_id).toBe(CATEGORIA);
  });

  it("despesa comum: meio, conta, categoria e vínculo vêm da entrada e das opções", () => {
    const linha = montarLinhaDoLancamento(entrada(), {
      cardId: null,
      statementId: null,
      transferGroupId: null,
    });
    expect(linha.payment_method).toBe("pix");
    expect(linha.account_id).toBe(CONTA_A);
    expect(linha.transfer_account_id).toBeNull();
    expect(linha.transfer_group_id).toBeNull();
    expect(linha.category_id).toBe(CATEGORIA);
    expect(linha.subcategory_id).toBe(SUBCATEGORIA);
    expect(linha.tags).toEqual(["a"]);
  });

  it.each([
    ["despesa", entrada(), SEM_VINCULO],
    [
      "transferência",
      entrada({ type: "transferencia", transfer_account_id: CONTA_B }),
      { ...SEM_VINCULO, transferGroupId: GRUPO },
    ],
    [
      "estorno",
      entrada({ type: "receita" }),
      { cardId: CARTAO, statementId: FATURA, transferGroupId: null, estorno: true },
    ],
  ])("%s: type/amount/purchase_date/competence_date/status sempre presentes (D-G2-20)", (_n, d, o) => {
    const linha = montarLinhaDoLancamento(d, o);
    expect(linha.type).toBe(d.type);
    expect(linha.amount).toBe(120.5);
    expect(linha.purchase_date).toBe("2026-10-10");
    expect(linha.competence_date).toBe("2026-10-01");
    expect(linha.status).toBe("pago");
  });

  it("despesa de cartão: liquidado_em nulo mesmo com status pago", () => {
    const linha = montarLinhaDoLancamento(
      entrada({ payment_method: "cartao_credito", card_id: CARTAO, account_id: null }),
      { cardId: CARTAO, statementId: FATURA, transferGroupId: null },
    );
    expect(linha.status).toBe("pago");
    expect(linha.liquidado_em).toBeNull();
  });

  it("liquidado_em segue dataDeLiquidacaoAGravar: pago grava a data, pendente zera", () => {
    expect(montarLinhaDoLancamento(entrada(), SEM_VINCULO).liquidado_em).toBe("2026-10-11");
    expect(
      montarLinhaDoLancamento(entrada({ status: "pendente" }), SEM_VINCULO).liquidado_em,
    ).toBeNull();
  });

  it("receita: classificacao e valor_pessoal vêm de `colunas`", () => {
    const linha = montarLinhaDoLancamento(entrada({ type: "receita", status: "recebido" }), {
      ...SEM_VINCULO,
      colunas: { classificacao: "terceiro", valor_pessoal: 40 },
    });
    expect(linha.classificacao).toBe("terceiro");
    expect(linha.valor_pessoal).toBe(40);
  });

  it("sem `colunas`, as duas chaves NÃO existem no objeto (nem como undefined)", () => {
    const linha = montarLinhaDoLancamento(entrada(), SEM_VINCULO);
    expect("classificacao" in linha).toBe(false);
    expect("valor_pessoal" in linha).toBe(false);
  });

  it("nunca tem user_id, parcelado, qtd_parcelas nem valor_total", () => {
    const linha = montarLinhaDoLancamento(entrada(), {
      ...SEM_VINCULO,
      colunas: { classificacao: "pessoal", valor_pessoal: null },
    });
    for (const chave of ["user_id", "parcelado", "qtd_parcelas", "valor_total", "id"]) {
      expect(chave in linha).toBe(false);
    }
  });

  it("as chaves possíveis são um subconjunto de COLUNAS_DA_LINHA, e COLUNAS_DA_LINHA tem 19", () => {
    expect(COLUNAS_DA_LINHA).toHaveLength(19);
    const completa = montarLinhaDoLancamento(entrada(), {
      ...SEM_VINCULO,
      colunas: { classificacao: "pessoal", valor_pessoal: null },
    });
    for (const chave of Object.keys(completa)) {
      expect(COLUNAS_DA_LINHA).toContain(chave);
    }
    // E o inverso: com `colunas`, nenhuma das 19 fica de fora.
    expect(Object.keys(completa).sort()).toEqual([...COLUNAS_DA_LINHA].sort());
  });
});

describe("montarCompraPai", () => {
  const compra: InstallmentPurchaseInput = {
    card_id: CARTAO,
    qtd_parcelas: 3,
    valor_total: 900,
    purchase_date: "2026-10-10",
    competence_date: "2026-10-01",
    category_id: CATEGORIA,
    subcategory_id: null,
    description: "Compra de teste",
    notes: null,
  } as InstallmentPurchaseInput;

  it("tem exatamente COLUNAS_DA_COMPRA_PAI", () => {
    const pai = montarCompraPai(compra, { classificacao: "pessoal", valor_pessoal: null });
    expect(Object.keys(pai).sort()).toEqual([...COLUNAS_DA_COMPRA_PAI].sort());
  });

  it("espelha o insert de installments.ts: despesa de cartão, amount = valor_total, status pago", () => {
    const pai = montarCompraPai(compra, { classificacao: "compartilhada", valor_pessoal: 450 });
    expect(pai.type).toBe("despesa");
    expect(pai.payment_method).toBe("cartao_credito");
    expect(pai.card_id).toBe(CARTAO);
    expect(pai.amount).toBe(900);
    expect(pai.valor_total).toBe(900);
    expect(pai.qtd_parcelas).toBe(3);
    expect(pai.status).toBe("pago");
    expect(pai.classificacao).toBe("compartilhada");
    expect(pai.valor_pessoal).toBe(450);
  });

  it("type/amount/purchase_date/competence_date/status sempre presentes", () => {
    const pai = montarCompraPai(compra, { classificacao: "pessoal", valor_pessoal: null });
    expect(pai.purchase_date).toBe("2026-10-10");
    expect(pai.competence_date).toBe("2026-10-01");
    expect("user_id" in pai).toBe(false);
  });
});
