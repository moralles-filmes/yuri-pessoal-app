import { describe, expect, it } from "vitest";
import {
  efeitoNoSaldo,
  saldosPorDia,
  type MovimentoDeSaldo,
} from "@/lib/finance/daily-balance";

const CONTA_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const CONTA_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

function mov(over: Partial<MovimentoDeSaldo> = {}): MovimentoDeSaldo {
  return {
    competence_date: "2026-07-10",
    type: "despesa",
    status: "pago",
    amount: 100,
    account_id: CONTA_A,
    transfer_account_id: null,
    ...over,
  };
}

describe("efeitoNoSaldo — tabela de sinais", () => {
  it("receita soma e despesa subtrai", () => {
    expect(efeitoNoSaldo(mov({ type: "receita", amount: 250 }), null)).toBe(250);
    expect(efeitoNoSaldo(mov({ type: "despesa", amount: 250 }), null)).toBe(
      -250,
    );
  });

  it("ajuste soma (amount é sempre >= 0 no banco)", () => {
    expect(efeitoNoSaldo(mov({ type: "ajuste", amount: 30 }), null)).toBe(30);
  });

  it("transferência sai da origem e entra no destino", () => {
    const t = mov({
      type: "transferencia",
      amount: 400,
      account_id: CONTA_A,
      transfer_account_id: CONTA_B,
    });
    expect(efeitoNoSaldo(t, CONTA_A)).toBe(-400);
    expect(efeitoNoSaldo(t, CONTA_B)).toBe(400);
  });

  it("transferência entre contas próprias se anula no saldo de todas as contas", () => {
    const t = mov({
      type: "transferencia",
      amount: 400,
      account_id: CONTA_A,
      transfer_account_id: CONTA_B,
    });
    expect(efeitoNoSaldo(t, null)).toBe(0);
  });

  it("pagamento de fatura (transferência sem destino) subtrai do total", () => {
    // O pagamento de fatura é gravado como `transferencia` com transfer_account_id nulo:
    // o dinheiro sai da conta e não entra em nenhuma outra conta do usuário.
    const pagamento = mov({
      type: "transferencia",
      amount: 5205.75,
      account_id: CONTA_A,
      transfer_account_id: null,
    });
    expect(efeitoNoSaldo(pagamento, null)).toBe(-5205.75);
    expect(efeitoNoSaldo(pagamento, CONTA_A)).toBe(-5205.75);
  });

  it("só pago/recebido entram — pendente e cancelado valem zero", () => {
    expect(efeitoNoSaldo(mov({ status: "pendente" }), null)).toBe(0);
    expect(efeitoNoSaldo(mov({ status: "cancelado" }), null)).toBe(0);
    expect(efeitoNoSaldo(mov({ status: "recebido", type: "receita" }), null)).toBe(
      100,
    );
  });

  it("lançamento de cartão (sem conta) não mexe em saldo nenhum", () => {
    // Compra no cartão não move dinheiro — quem move é o pagamento da fatura.
    const compraNoCartao = mov({ account_id: null, amount: 320 });
    expect(efeitoNoSaldo(compraNoCartao, null)).toBe(0);
    expect(efeitoNoSaldo(compraNoCartao, CONTA_A)).toBe(0);
  });

  it("lançamento de outra conta não entra no saldo da conta filtrada", () => {
    expect(efeitoNoSaldo(mov({ account_id: CONTA_B }), CONTA_A)).toBe(0);
  });
});

describe("saldosPorDia", () => {
  it("acumula a partir da abertura, do dia mais antigo para o mais novo", () => {
    const saldos = saldosPorDia({
      abertura: 3200,
      escopo: CONTA_A,
      dias: ["2026-07-28", "2026-07-23"],
      movimentos: [
        mov({
          competence_date: "2026-07-23",
          type: "transferencia",
          amount: 400,
          account_id: CONTA_A,
          transfer_account_id: CONTA_B,
        }),
        mov({ competence_date: "2026-07-28", type: "receita", amount: 8000 }),
        mov({
          competence_date: "2026-07-28",
          type: "transferencia",
          amount: 5205.75,
          transfer_account_id: null,
        }),
      ],
    });

    expect(saldos.get("2026-07-23")).toBe(2800);
    expect(saldos.get("2026-07-28")).toBe(5594.25);
  });

  it("devolve um saldo para cada dia pedido, mesmo sem movimento no dia", () => {
    // Dia que só tem compra de cartão na lista: o saldo da conta não mudou, mas existe.
    const saldos = saldosPorDia({
      abertura: 1000,
      escopo: null,
      dias: ["2026-07-05", "2026-07-10"],
      movimentos: [mov({ competence_date: "2026-07-05", amount: 250 })],
    });

    expect(saldos.get("2026-07-05")).toBe(750);
    expect(saldos.get("2026-07-10")).toBe(750);
  });

  it("é o saldo do FIM do dia: todos os lançamentos do dia já entraram", () => {
    const saldos = saldosPorDia({
      abertura: 0,
      escopo: CONTA_A,
      dias: ["2026-07-10"],
      movimentos: [
        mov({ competence_date: "2026-07-10", amount: 10 }),
        mov({ competence_date: "2026-07-10", amount: 15 }),
      ],
    });
    expect(saldos.get("2026-07-10")).toBe(-25);
  });

  it("movimento anterior ao primeiro dia pedido entra na abertura", () => {
    const saldos = saldosPorDia({
      abertura: 500,
      escopo: CONTA_A,
      dias: ["2026-07-10"],
      movimentos: [mov({ competence_date: "2026-07-01", amount: 200 })],
    });
    expect(saldos.get("2026-07-10")).toBe(300);
  });

  it("movimento posterior ao último dia pedido não vaza para trás", () => {
    const saldos = saldosPorDia({
      abertura: 500,
      escopo: CONTA_A,
      dias: ["2026-07-10"],
      movimentos: [mov({ competence_date: "2026-07-20", amount: 200 })],
    });
    expect(saldos.get("2026-07-10")).toBe(500);
  });

  it("soma em centavos inteiros — centavo não se perde em float", () => {
    // 0.1 + 0.2 !== 0.3 em ponto flutuante. Com 300 lançamentos de R$ 0,10 o erro
    // acumulado apareceria no total exibido.
    const movimentos = Array.from({ length: 300 }, () =>
      mov({ type: "receita", amount: 0.1 }),
    );
    const saldos = saldosPorDia({
      abertura: 0,
      escopo: CONTA_A,
      dias: ["2026-07-10"],
      movimentos,
    });
    expect(saldos.get("2026-07-10")).toBe(30);
  });

  it("sem dias pedidos devolve mapa vazio", () => {
    expect(
      saldosPorDia({ abertura: 10, escopo: null, dias: [], movimentos: [mov()] })
        .size,
    ).toBe(0);
  });

  it("dia repetido na entrada não acumula duas vezes", () => {
    const saldos = saldosPorDia({
      abertura: 100,
      escopo: CONTA_A,
      dias: ["2026-07-10", "2026-07-10"],
      movimentos: [mov({ competence_date: "2026-07-10", amount: 40 })],
    });
    expect(saldos.size).toBe(1);
    expect(saldos.get("2026-07-10")).toBe(60);
  });

  it("não depende da ordem de entrada dos movimentos nem dos dias", () => {
    const movimentos = [
      mov({ competence_date: "2026-07-28", type: "receita", amount: 8000 }),
      mov({ competence_date: "2026-07-05", amount: 250 }),
      mov({ competence_date: "2026-07-23", amount: 400 }),
    ];
    const dias = ["2026-07-23", "2026-07-05", "2026-07-28"];
    const esperado = { "2026-07-05": -250, "2026-07-23": -650, "2026-07-28": 7350 };

    const direto = saldosPorDia({ abertura: 0, escopo: CONTA_A, dias, movimentos });
    const invertido = saldosPorDia({
      abertura: 0,
      escopo: CONTA_A,
      dias: [...dias].reverse(),
      movimentos: [...movimentos].reverse(),
    });

    for (const [dia, valor] of Object.entries(esperado)) {
      expect(direto.get(dia)).toBe(valor);
      expect(invertido.get(dia)).toBe(valor);
    }
  });
});
