/** REDESIGN-03-F · A2 — a previsão do desfazer, pura. Fixture sintética. */
import { describe, expect, it } from "vitest";
import {
  mensagemDoErroDoDesfazer,
  previsaoDoDesfazer,
  temFormaDePagamentoDeFatura,
  type LancamentoDoPagamento,
} from "@/lib/finance/desfazer-pagamento";
import { montarPagamentoFatura } from "@/lib/finance/statement-payment";

const LANC = "7a1c2e3f-4b5d-4e6f-8a9b-0c1d2e3f4a5b";

const pagamento = montarPagamentoFatura({
  contaId: "3c9a7e21-5b4d-4f68-8a13-2e1d0c9b8a77",
  total: 250.4,
  cartaoNome: "Cartão Sintético",
  competencia: "2031-01-01",
  dataPagamento: "2031-01-10",
});

const lancamento: LancamentoDoPagamento = {
  id: LANC,
  type: pagamento.type,
  status: pagamento.status,
  amount: pagamento.amount,
  description: pagamento.description,
  transfer_account_id: pagamento.transfer_account_id,
  transfer_group_id: pagamento.transfer_group_id,
  conta: "Conta Sintética",
};

const paga = { pago_em: "2031-01-10T12:00:00Z", pago_transacao_id: LANC };

describe("03-F A2 · temFormaDePagamentoDeFatura — as quatro condições do SQL", () => {
  it("a forma que montarPagamentoFatura cria é de pagamento", () => {
    expect(temFormaDePagamentoDeFatura(pagamento)).toBe(true);
  });

  it("virou despesa: não é mais pagamento", () => {
    expect(temFormaDePagamentoDeFatura({ ...pagamento, type: "despesa" })).toBe(false);
  });

  it("saiu de pago: não é mais pagamento", () => {
    expect(temFormaDePagamentoDeFatura({ ...pagamento, status: "pendente" })).toBe(false);
  });

  it("ganhou conta de destino: não é mais pagamento", () => {
    expect(
      temFormaDePagamentoDeFatura({ ...pagamento, transfer_account_id: "conta-destino" }),
    ).toBe(false);
  });

  it("ganhou grupo de transferência: não é mais pagamento", () => {
    expect(temFormaDePagamentoDeFatura({ ...pagamento, transfer_group_id: "grupo-1" })).toBe(
      false,
    );
  });
});

describe("03-F A2 · previsaoDoDesfazer", () => {
  it("fatura não paga", () => {
    expect(
      previsaoDoDesfazer({ fatura: { pago_em: null, pago_transacao_id: null }, lancamento: null }),
    ).toEqual({ estado: "nao-paga" });
  });

  it("paga sem ponteiro: só reabre", () => {
    expect(
      previsaoDoDesfazer({
        fatura: { pago_em: paga.pago_em, pago_transacao_id: null },
        lancamento: null,
      }),
    ).toEqual({ estado: "sem-lancamento", dataPagamento: "2031-01-10" });
  });

  it("ponteiro para lançamento que não existe mais: sem lançamento", () => {
    expect(previsaoDoDesfazer({ fatura: paga, lancamento: null })).toEqual({
      estado: "sem-lancamento",
      dataPagamento: "2031-01-10",
    });
  });

  it("lançamento editado em Lançamentos: não se desfaz aqui", () => {
    expect(
      previsaoDoDesfazer({ fatura: paga, lancamento: { ...lancamento, type: "despesa" } }),
    ).toEqual({ estado: "pagamento-editado" });
  });

  it("com o lançamento do pagamento: diz qual, de qual conta, quanto e quando", () => {
    expect(previsaoDoDesfazer({ fatura: paga, lancamento })).toEqual({
      estado: "com-lancamento",
      lancamentoId: LANC,
      descricao: pagamento.description,
      conta: "Conta Sintética",
      valor: 250.4,
      dataPagamento: "2031-01-10",
    });
  });

  it("conta excluída: conta nula, não inventada", () => {
    const previsao = previsaoDoDesfazer({ fatura: paga, lancamento: { ...lancamento, conta: null } });
    expect(previsao).toMatchObject({ estado: "com-lancamento", conta: null });
  });

  it("a data é a de Brasília — 01:30 UTC ainda é o dia anterior", () => {
    expect(
      previsaoDoDesfazer({
        fatura: { pago_em: "2026-03-10T01:30:00Z", pago_transacao_id: null },
        lancamento: null,
      }),
    ).toEqual({ estado: "sem-lancamento", dataPagamento: "2026-03-09" });
  });
});

describe("03-F A2 · mensagemDoErroDoDesfazer", () => {
  const desconhecido =
    "Não foi possível confirmar o desfazer. Recarregue a página para ver o estado atual.";

  it.each([
    ["FATURA_NAO_PAGA", "Esta fatura já não está paga."],
    [
      "PAGAMENTO_MUDOU",
      "O pagamento desta fatura mudou desde que você abriu a confirmação. Abra de novo para ver o atual.",
    ],
    [
      "PAGAMENTO_EDITADO",
      "O lançamento deste pagamento foi editado em Lançamentos. Para desfazer, exclua-o por lá — a fatura reabre junto.",
    ],
    ["FATURA_NAO_ENCONTRADA", "Fatura não encontrada."],
    ["FATURA_SEM_SESSAO", "Sessão expirada. Faça login novamente."],
  ])("%s", (codigo, mensagem) => {
    expect(mensagemDoErroDoDesfazer({ message: codigo })).toBe(mensagem);
  });

  it("desconhecido não afirma o que aconteceu", () => {
    expect(mensagemDoErroDoDesfazer({ message: "fetch failed" })).toBe(desconhecido);
  });

  it("não casa por substring", () => {
    expect(mensagemDoErroDoDesfazer({ message: "xPAGAMENTO_MUDOU" })).toBe(desconhecido);
  });

  it("aceita erro nulo", () => {
    expect(mensagemDoErroDoDesfazer(null)).toBe(desconhecido);
  });
});
