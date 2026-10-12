/**
 * Fase 18-C — IA · Financeiro: a ferramenta repassa, não recalcula.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ O QUE ESTE ARQUIVO PROVA — E O QUE ELE DELIBERADAMENTE NÃO PROVA.                     ║
 * ║                                                                                       ║
 * ║ NÃO prova que `resumoMes` soma certo: isso é de `finance/dashboard.test.ts`, e refazer ║
 * ║ a conta aqui seria o "teste que espelha a implementação" que a 18-B pagou seis vezes.  ║
 * ║                                                                                       ║
 * ║ PROVA que o adapter é casca fina: que ele NÃO converte unidade, NÃO soma partição com  ║
 * ║ total, e que as frases que impedem o modelo de somar o que não se soma estão lá. Os    ║
 * ║ números da fixture são absurdos de propósito (12345.67), justamente para que qualquer  ║
 * ║ aritmética acidental apareça.                                                          ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccountWithBalance } from "@/types/database";
import type { FinanceCardData, InvoicesCardData } from "@/lib/dashboard/types";

const HOJE = "2026-08-07";

let contasFalsas: AccountWithBalance[] = [];
let resumoFalso: FinanceCardData;
let faturasFalsas: InvoicesCardData;
let mesPedido: string | null = null;

vi.mock("@/lib/format", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/format")>()),
  hojeISO: () => HOJE,
}));

vi.mock("@/lib/finance/queries", () => ({
  getAccounts: async () => contasFalsas,
}));

vi.mock("@/lib/dashboard/queries", () => ({
  getFinanceCardData: async (mes: string) => {
    mesPedido = mes;
    return resumoFalso;
  },
  getInvoicesCardData: async () => faturasFalsas,
}));

const { getBalances, getSpending, getInvoice } = await import("./finance");

/* ═══════════════════════════ Fixtures mínimas ═══════════════════════════ */

function conta(
  over: Partial<AccountWithBalance> & { id: string; name: string; current_balance: number },
): AccountWithBalance {
  return {
    user_id: "u1",
    bank: null,
    color: null,
    created_at: "2026-01-01T00:00:00.000Z",
    initial_balance: 0,
    is_active: true,
    notes: null,
    type: "corrente",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...over,
  } as AccountWithBalance;
}

beforeEach(() => {
  mesPedido = null;
  contasFalsas = [
    conta({ id: "c1", name: "Nubank", current_balance: 12345.67 }),
    conta({ id: "c2", name: "Poupança", current_balance: 890.12, type: "poupanca" }),
    conta({ id: "c3", name: "Antiga", current_balance: 999.99, is_active: false }),
  ];
  resumoFalso = {
    completude: { estado: "exato" },
    saldo: 13235.79,
    entradas: 5000,
    entradasMeu: 4200,
    entradasTerceiros: 800,
    saidas: 3200,
    meu: 2700,
    terceiros: 500,
    cartao: 1800,
    aVista: 1400,
    aReceber: 500,
    contasTotal: 750,
    contasCount: 2,
    proximaConta: { nome: "Internet", data: "2026-08-10", valor: 120 },
    mes: "2026-08",
  };
  faturasFalsas = {
    completude: { estado: "exato" },
    abertas: 1,
    fechadas: 1,
    pagas: 2,
    aReceber: 500,
    totalProximas: 1800,
    proximas: [
      {
        cardNome: "Nubank",
        cardCor: null,
        competencia: "2026-08",
        dataVencimento: "2026-08-15",
        total: 1200,
        meu: 900,
        terceiros: 300,
        status: "aberta",
        virtual: false,
      },
      {
        cardNome: "Nubank",
        cardCor: null,
        competencia: "2026-09",
        dataVencimento: "2026-09-15",
        total: 600,
        meu: 600,
        terceiros: 0,
        status: "aberta",
        virtual: true,
      },
    ],
    hasCards: true,
  };
});

/* ═══════════════════════════════ Testes ═══════════════════════════════ */

describe("finance.get_balances", () => {
  /**
   * ⚠️ O VALOR SAI EXATAMENTE COMO ENTROU. Multiplicar ou dividir por 100 aqui faria a IA
   * relatar um número cem vezes maior ou menor que o da tela — e o adapter não tem nenhuma
   * informação que a view `accounts_with_balance` já não tenha aplicado.
   */
  it("não converte a unidade: o número sai idêntico ao da conta", async () => {
    const saida = await getBalances();
    const nubank = saida.itens.find(
      (i) => (i as { conta: string }).conta === "Nubank",
    ) as { saldo: number };
    expect(nubank.saldo).toBe(12345.67);
  });

  /**
   * Decisão do dono na 03-B2, B3: esconder a conta não faz o dinheiro sumir.
   * O total inclui todas as contas; as inativas com saldo aparecem nos itens, marcadas.
   */
  it("soma todas as contas e marca as inativas com saldo nos itens", async () => {
    const saida = await getBalances();
    const itens = saida.itens as { conta: string; saldo: number; inativa: boolean }[];
    // 12345.67 + 890.12 + 999.99 = 14235.78, incluindo a conta inativa.
    expect(saida.agregados).toMatchObject({ contas_ativas: 2, contas_inativas_com_saldo: 1 });
    expect((saida.agregados as { saldo_total: number }).saldo_total).toBeCloseTo(14235.78, 2);
    expect(saida.contagem).toBe(3);
    expect(itens).toEqual([
      { conta: "Nubank", tipo: "corrente", saldo: 12345.67, inativa: false },
      { conta: "Poupança", tipo: "poupanca", saldo: 890.12, inativa: false },
      { conta: "Antiga", tipo: "corrente", saldo: 999.99, inativa: true },
    ]);
    const somaDosItens = itens.reduce((total, item) => total + item.saldo, 0);
    expect(somaDosItens).toBeCloseTo(14235.78, 2);
    expect(somaDosItens).toBeCloseTo(
      (saida.agregados as { saldo_total: number }).saldo_total,
      2,
    );
  });

  /**
   * ⚠️ A frase existe para impedir uma soma específica e frequente: "quanto eu tenho?"
   * respondido com saldo + fatura. Lançamento de cartão não move saldo de conta.
   */
  it("declara que saldo de conta e fatura não se somam", async () => {
    const saida = await getBalances();
    const obs = (saida.agregados as { observacao_do_saldo: string }).observacao_do_saldo;
    expect(obs).toContain("não move saldo de conta");
  });

  it("sem conta ativa, distingue 'nenhuma cadastrada' de 'todas inativas'", async () => {
    contasFalsas = [contasFalsas[2]];
    const comSaldo = await getBalances();
    expect(comSaldo.contagem).toBe(1);
    expect(comSaldo.agregados).toMatchObject({ contas_ativas: 0, contas_inativas_com_saldo: 1 });
    expect((comSaldo.agregados as { saldo_total: number }).saldo_total).toBeCloseTo(999.99, 2);
    expect(comSaldo.itens).toEqual([
      { conta: "Antiga", tipo: "corrente", saldo: 999.99, inativa: true },
    ]);

    contasFalsas = [{ ...contasFalsas[0], current_balance: 0 }];
    const semSaldo = await getBalances();
    expect(semSaldo.contagem).toBe(0);
    expect(semSaldo.itens).toEqual([]);
    expect(semSaldo.observacao).toBe("Não há conta ativa — as 1 existentes estão inativas.");

    contasFalsas = [];
    const semContas = await getBalances();
    expect(semContas.contagem).toBe(0);
    expect(semContas.itens).toEqual([]);
    expect(semContas.observacao).toBe("Ainda não há conta cadastrada.");
  });
});

describe("finance.get_spending", () => {
  it("mantém a leitura exata sem motivo de incompletude", async () => {
    const saida = await getSpending({});
    expect(saida.completude).toBe("exato");
    expect(saida).not.toHaveProperty("motivo_incompleto");
  });

  it("repassa a completude parcial e junta os motivos do card", async () => {
    resumoFalso.completude = {
      estado: "parcial",
      motivos: ["Leitura de lançamentos incompleta.", "Leitura de recebíveis incompleta."],
    };
    const saida = await getSpending({});
    expect(saida.completude).toBe("parcial");
    expect(saida.motivo_incompleto).toBe(
      "Leitura de lançamentos incompleta. Leitura de recebíveis incompleta.",
    );
    expect(saida.agregados).toMatchObject({ entradas: 5000, saidas: 3200 });
  });

  it("usa o mês atual quando nenhum é pedido", async () => {
    const saida = await getSpending({});
    expect(mesPedido).toBe("2026-08");
    expect(saida.periodo?.ate).toBe(HOJE);
  });

  it.each([
    { mes: "2026-09", ate: "2026-09-30" },
    { mes: "2026-02", ate: "2026-02-28" },
    { mes: HOJE.slice(0, 7), ate: HOJE },
  ])("encerra o período de $mes em $ate", async ({ mes, ate }) => {
    const saida = await getSpending({ mes });
    expect(saida.periodo).toEqual({ de: `${mes}-01`, ate });
  });

  it("repassa o mês pedido para a leitura do dashboard", async () => {
    await getSpending({ mes: "2026-03" });
    expect(mesPedido).toBe("2026-03");
  });

  /** REDESIGN-03-C (A5) — a separação da entrada chega à IA já somada pelo motor. */
  it("entradas_meu e entradas_terceiros chegam aos agregados, e a composição diz que particionam entradas", async () => {
    const saida = await getSpending({});
    expect(saida.agregados).toMatchObject({
      entradas: 5000,
      entradas_meu: 4200,
      entradas_terceiros: 800,
    });
    expect(String(saida.agregados?.composicao)).toContain(
      "`entradas_meu` + `entradas_terceiros` = `entradas`",
    );
  });

  /** Os valores chegam idênticos aos do card — nenhum é recalculado nem reagrupado. */
  it("repassa os totais sem tocar em nenhum deles", async () => {
    const saida = await getSpending({});
    expect(saida.agregados).toMatchObject({
      entradas: 5000,
      saidas: 3200,
      gasto_meu: 2700,
      gasto_de_terceiros: 500,
      no_cartao: 1800,
      a_vista: 1400,
      a_receber_de_terceiros: 500,
      moeda: "BRL",
    });
  });

  /**
   * ⚠️ O teste que protege contra a pior resposta possível deste módulo. `meu` + `terceiros`
   * = `saidas`, e `cartao` + `aVista` = `saidas`. Um modelo que somasse as partições ao total
   * diria que o usuário gastou o dobro — por isso a explicação viaja junto do número.
   */
  it("declara que as partições não se somam ao total", async () => {
    const saida = await getSpending({});
    const a = saida.agregados as { composicao: string };
    expect(a.composicao).toContain("`saidas`");
    expect(a.composicao).toContain("Não some");
    // E a fixture de fato particiona: 2700 + 500 = 3200 = 1800 + 1400.
    expect(resumoFalso.meu + resumoFalso.terceiros).toBe(resumoFalso.saidas);
    expect(resumoFalso.cartao + resumoFalso.aVista).toBe(resumoFalso.saidas);
  });

  it("explica a base de cálculo do cartão e da parcela", async () => {
    const saida = await getSpending({});
    const a = saida.agregados as { base_de_calculo: string };
    expect(a.base_de_calculo).toContain("base fatura");
    expect(a.base_de_calculo).toContain("Parcela");
  });
});

describe("finance.get_invoice", () => {
  it("mantém a leitura exata sem motivo de incompletude", async () => {
    const saida = await getInvoice();
    expect(saida.completude).toBe("exato");
    expect(saida).not.toHaveProperty("motivo_incompleto");
  });

  it("repassa a completude parcial e junta os motivos do card", async () => {
    faturasFalsas.completude = {
      estado: "parcial",
      motivos: ["Leitura de recebíveis incompleta.", "Contagem indisponível."],
    };
    const saida = await getInvoice();
    expect(saida.completude).toBe("parcial");
    expect(saida.motivo_incompleto).toBe(
      "Leitura de recebíveis incompleta. Contagem indisponível.",
    );
    expect(saida.agregados).toMatchObject({ total_das_nao_pagas: 1800 });
    expect(saida.contagem).toBe(2);
  });

  it.each([false, true])("preserva completude parcial na saída vazia (hasCards=%s)", async (hasCards) => {
    faturasFalsas = {
      ...faturasFalsas,
      hasCards,
      proximas: [],
      completude: { estado: "parcial", motivos: ["Leitura de recebíveis incompleta."] },
    };
    const saida = await getInvoice();
    expect(saida).toMatchObject({
      completude: "parcial",
      motivo_incompleto: "Leitura de recebíveis incompleta.",
      contagem: 0,
    });
  });

  it("repassa contagens e totais das faturas", async () => {
    const saida = await getInvoice();
    expect(saida.agregados).toMatchObject({
      faturas_abertas: 1,
      faturas_fechadas: 1,
      faturas_pagas: 2,
      total_das_nao_pagas: 1800,
    });
    expect(saida.contagem).toBe(2);
  });

  /** Fatura projetada ainda não existe no banco: relatá-la como fechada afirmaria um valor. */
  it("marca a fatura projetada e explica o que ela é", async () => {
    const saida = await getInvoice();
    const projetada = saida.itens.find(
      (i) => (i as { projetada: boolean }).projetada,
    ) as { competencia: string };
    expect(projetada.competencia).toBe("2026-09");
    expect(
      (saida.agregados as { observacao_virtual: string }).observacao_virtual,
    ).toContain("ainda não existe");
  });

  it("sem cartão cadastrado, diz que não há fatura", async () => {
    faturasFalsas = { ...faturasFalsas, hasCards: false };
    const saida = await getInvoice();
    expect(saida.contagem).toBe(0);
    expect(saida.observacao).toContain("cartão de crédito cadastrado");
  });

  /** Ausência de fatura ≠ fatura de valor zero. */
  it("com cartão e sem fatura, declara ausência de registro", async () => {
    faturasFalsas = { ...faturasFalsas, proximas: [] };
    const saida = await getInvoice();
    expect(saida.observacao).toContain("ausência de fatura registrada");
    expect(saida.observacao).toContain("não uma fatura de valor zero");
  });
});
