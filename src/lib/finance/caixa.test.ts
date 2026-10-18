/**
 * REDESIGN-03-E · A1 — as regras puras da base caixa (`caixa.ts`).
 * Fixtures sintéticas: ids curtos, valores redondos, nenhum nome real.
 */
import { describe, expect, it } from "vitest";
import type { DashTx } from "@/lib/finance/dashboard";
import type { RecebivelComRecebimentos } from "@/lib/finance/recebimentos";
import { reembolsosRecebidosNoPeriodo } from "@/lib/finance/recebimentos";
import {
  comparativoAteODia,
  dataDeCaixa,
  entradasDoCaixa,
  dataDePagamentoFutura,
  dataDoExtratoAGravar,
  MSG_DATA_PAGAMENTO_FUTURA,
  dataDeLiquidacaoAGravar,
  diaDeCorte,
  liquidadoNoBotao,
  mesAnteriorDe,
  numerosDoCaixa,
  periodoAteODia,
  type TxDeCaixa,
} from "@/lib/finance/caixa";

let seq = 0;

/** Lançamento de caixa: por padrão, despesa paga numa conta, liquidada em 10/10/2026. */
function tx(over: Partial<TxDeCaixa> & { purchase_date?: string } = {}): TxDeCaixa {
  seq += 1;
  return {
    id: `t${seq}`,
    type: "despesa",
    status: "pago",
    amount: 100,
    valor_pessoal: null,
    competence_date: "2026-10-10",
    liquidado_em: "2026-10-10",
    account_id: "conta-a",
    transfer_account_id: null,
    card_id: null,
    ...over,
  };
}

const OUTUBRO = { de: "2026-10-01", ate: "2026-10-31" };
const SEM_FATURA: ReadonlySet<string> = new Set();

function numeros(
  transactions: TxDeCaixa[],
  extra: {
    periodo?: { de: string; ate: string };
    pagamentosDeFatura?: ReadonlySet<string>;
    recebiveis?: RecebivelComRecebimentos[];
  } = {},
) {
  return numerosDoCaixa({
    periodo: extra.periodo ?? OUTUBRO,
    transactions,
    pagamentosDeFatura: extra.pagamentosDeFatura ?? SEM_FATURA,
    recebiveis: extra.recebiveis ?? [],
  });
}

describe("03-E · dataDeCaixa", () => {
  it("usa liquidado_em quando existe, e não é aproximada", () => {
    expect(dataDeCaixa({ liquidado_em: "2026-10-05", competence_date: "2026-10-20" })).toEqual({
      data: "2026-10-05",
      aproximada: false,
    });
  });

  it("sem liquidado_em cai na competência, e é aproximada", () => {
    expect(dataDeCaixa({ liquidado_em: null, competence_date: "2026-10-20" })).toEqual({
      data: "2026-10-20",
      aproximada: true,
    });
  });

  it("nunca usa purchase_date, nem quando o objeto a traz", () => {
    const t = { liquidado_em: null, competence_date: "2026-11-05", purchase_date: "2026-10-01" };
    expect(dataDeCaixa(t).data).toBe("2026-11-05");
    const com = { liquidado_em: "2026-11-07", competence_date: "2026-11-05", purchase_date: "2026-10-01" };
    expect(dataDeCaixa(com).data).toBe("2026-11-07");
  });

  it("numerosDoCaixa também ignora purchase_date ao decidir o período", () => {
    const t = { ...tx({ liquidado_em: null, competence_date: "2026-11-05" }), purchase_date: "2026-10-01" };
    expect(numeros([t]).saidasDeCaixa).toBe(0);
  });
});

describe("03-E · numerosDoCaixa — entradas", () => {
  it("receita compartilhada com valor_pessoal aparece nas duas linhas (renda e outras)", () => {
    const n = numeros([tx({ type: "receita", status: "recebido", amount: 1000, valor_pessoal: 400 })]);
    expect(n.rendaPessoalRecebida).toBe(400);
    expect(n.outrasEntradasDeTerceiros).toBe(600);
    expect(n.resultadoDeCaixa).toBe(1000);
  });

  it("receita pessoal (valor_pessoal nulo) entra inteira na renda", () => {
    const n = numeros([tx({ type: "receita", status: "recebido", amount: 3000 })]);
    expect(n.rendaPessoalRecebida).toBe(3000);
    expect(n.outrasEntradasDeTerceiros).toBe(0);
  });

  it("receita de terceiro (valor_pessoal 0) vai inteira para outras entradas", () => {
    const n = numeros([tx({ type: "receita", status: "recebido", amount: 500, valor_pessoal: 0 })]);
    expect(n.rendaPessoalRecebida).toBe(0);
    expect(n.outrasEntradasDeTerceiros).toBe(500);
  });

  it("estorno de cartão (receita com card_id) fica fora e não conta em aproximados", () => {
    const n = numeros([
      tx({ type: "receita", status: "recebido", amount: 80, card_id: "cartao-a", account_id: null, liquidado_em: null }),
    ]);
    expect(n.rendaPessoalRecebida).toBe(0);
    expect(n.aproximados).toBe(0);
    expect(n.semConta).toBe(0);
  });

  it("soma em centavos, sem deriva de ponto flutuante", () => {
    const n = numeros([
      tx({ type: "receita", status: "recebido", amount: 0.1 }),
      tx({ type: "receita", status: "recebido", amount: 0.2 }),
    ]);
    expect(n.rendaPessoalRecebida).toBe(0.3);
  });
});

describe("03-E · numerosDoCaixa — reembolsos", () => {
  const recebiveis: RecebivelComRecebimentos[] = [
    // com recebimentos datados (um dentro do período, um fora)
    {
      valor: 300,
      status: "parcial",
      recebimentos: [
        { valor: 100, recebido_em: "2026-10-05" },
        { valor: 50, recebido_em: "2026-09-28" },
      ],
    },
    // legado pago com pago_em
    { valor: 200, status: "pago", pago_em: "2026-10-12", recebimentos: [] },
    // legado pago SEM pago_em: não tem data, não entra
    { valor: 70, status: "pago", pago_em: null, recebimentos: [] },
  ];

  it("é exatamente reembolsosRecebidosNoPeriodo — chamada, nunca recalculada", () => {
    const esperado = reembolsosRecebidosNoPeriodo(recebiveis, OUTUBRO);
    expect(esperado).toBe(300);
    expect(numeros([], { recebiveis }).reembolsosRecebidos).toBe(esperado);
  });

  it("entra no resultado de caixa e não depende de lançamento", () => {
    const n = numeros([tx({ amount: 120 })], { recebiveis });
    expect(n.resultadoDeCaixa).toBe(180);
  });

  it("respeita o período informado", () => {
    const n = numeros([], { recebiveis, periodo: { de: "2026-09-01", ate: "2026-09-30" } });
    expect(n.reembolsosRecebidos).toBe(50);
  });
});

describe("03-E · numerosDoCaixa — saídas", () => {
  it("compras no cartão + pagamento de fatura: só o pagamento sai", () => {
    const compras = [
      tx({ amount: 200, card_id: "cartao-a", account_id: null, liquidado_em: null, competence_date: "2026-10-03" }),
      tx({ amount: 300, card_id: "cartao-a", account_id: null, liquidado_em: null, competence_date: "2026-10-04" }),
    ];
    const pagamento = tx({
      id: "pag-fatura",
      type: "transferencia",
      amount: 500,
      account_id: "conta-a",
      transfer_account_id: null,
      liquidado_em: "2026-10-15",
    });
    const n = numeros([...compras, pagamento], { pagamentosDeFatura: new Set(["pag-fatura"]) });
    expect(n.saidasDeCaixa).toBe(500);
    expect(n.pagamentosDeFatura).toBe(500);
    expect(n.resultadoDeCaixa).toBe(-500);
  });

  it("despesa com conta e sem cartão é saída", () => {
    const n = numeros([tx({ amount: 150 }), tx({ amount: 50 })]);
    expect(n.saidasDeCaixa).toBe(200);
    expect(n.pagamentosDeFatura).toBe(0);
  });

  it("transferência entre contas fica fora de renda, saídas e resultado", () => {
    const n = numeros([tx({ type: "transferencia", amount: 700, transfer_account_id: "conta-b" })]);
    expect(n.transferenciasEntreContas).toBe(700);
    expect(n.rendaPessoalRecebida).toBe(0);
    expect(n.saidasDeCaixa).toBe(0);
    expect(n.resultadoDeCaixa).toBe(0);
  });

  it("transferência sem destino e sem vínculo entra nas saídas e é declarada", () => {
    const n = numeros([
      tx({ type: "transferencia", amount: 90 }),
      tx({ type: "transferencia", amount: 10 }),
    ]);
    expect(n.saidasDeCaixa).toBe(100);
    expect(n.transferenciasSemVinculo).toEqual({ quantidade: 2, total: 100 });
    expect(n.pagamentosDeFatura).toBe(0);
  });

  it("pagamento de fatura com vínculo não é declarado como sem vínculo", () => {
    const pagamento = tx({ id: "pag-1", type: "transferencia", amount: 400 });
    const n = numeros([pagamento], { pagamentosDeFatura: new Set(["pag-1"]) });
    expect(n.transferenciasSemVinculo).toEqual({ quantidade: 0, total: 0 });
    expect(n.pagamentosDeFatura).toBe(400);
  });
});

describe("03-E · numerosDoCaixa — exclusões", () => {
  it("pendente e cancelado ficam fora", () => {
    const n = numeros([
      tx({ status: "pendente", amount: 100 }),
      tx({ status: "cancelado", amount: 100 }),
      tx({ type: "receita", status: "pendente", amount: 100 }),
    ]);
    expect(n.saidasDeCaixa).toBe(0);
    expect(n.rendaPessoalRecebida).toBe(0);
    expect(n.aproximados).toBe(0);
  });

  it("ajuste fica fora de todos os números", () => {
    const n = numeros([tx({ type: "ajuste", amount: 999 })]);
    expect(n).toMatchObject({
      rendaPessoalRecebida: 0,
      outrasEntradasDeTerceiros: 0,
      saidasDeCaixa: 0,
      transferenciasEntreContas: 0,
      resultadoDeCaixa: 0,
      aproximados: 0,
      semConta: 0,
    });
  });

  it("receita/despesa sem conta e sem cartão é contada à parte, fora de tudo", () => {
    const n = numeros([
      tx({ account_id: null, amount: 100 }),
      tx({ type: "receita", status: "recebido", account_id: null, amount: 200 }),
    ]);
    expect(n.semConta).toBe(2);
    expect(n.saidasDeCaixa).toBe(0);
    expect(n.rendaPessoalRecebida).toBe(0);
    expect(n.aproximados).toBe(0);
  });

  it("transferência sem conta de origem (e sem vínculo) também é contada à parte, nunca some calada", () => {
    const n = numeros([tx({ type: "transferencia", account_id: null, transfer_account_id: "conta-b" })]);
    expect(n.semConta).toBe(1);
    expect(n.saidasDeCaixa).toBe(0);
    expect(n.transferenciasEntreContas).toBe(0);
    expect(n.transferenciasSemVinculo.quantidade).toBe(0);
  });

  it("liquidado_em fora do período com competência dentro NÃO entra", () => {
    const n = numeros([tx({ competence_date: "2026-10-20", liquidado_em: "2026-11-02", amount: 80 })]);
    expect(n.saidasDeCaixa).toBe(0);
  });

  it("liquidado_em dentro do período com competência fora ENTRA", () => {
    const n = numeros([tx({ competence_date: "2026-09-25", liquidado_em: "2026-10-03", amount: 80 })]);
    expect(n.saidasDeCaixa).toBe(80);
  });

  it("as pontas do período são inclusivas", () => {
    const n = numeros([
      tx({ liquidado_em: "2026-10-01", amount: 10 }),
      tx({ liquidado_em: "2026-10-31", amount: 20 }),
      tx({ liquidado_em: "2026-11-01", amount: 40 }),
    ]);
    expect(n.saidasDeCaixa).toBe(30);
  });
});

describe("03-E · numerosDoCaixa — aproximados", () => {
  it("conta quem caiu pela competência, inclusive transferências", () => {
    const n = numeros([
      tx({ liquidado_em: null, amount: 10 }), // despesa aproximada
      tx({ liquidado_em: "2026-10-05", amount: 10 }), // exata
      tx({ type: "transferencia", liquidado_em: null, transfer_account_id: "conta-b" }), // entre contas
      tx({ type: "transferencia", liquidado_em: null }), // sem vínculo
      tx({ type: "receita", status: "recebido", liquidado_em: null }), // receita
    ]);
    expect(n.aproximados).toBe(4);
  });

  it("não conta o que ficou fora de todos os números", () => {
    const n = numeros([
      tx({ liquidado_em: null, account_id: null }), // sem conta
      tx({ type: "ajuste", liquidado_em: null }),
      tx({ liquidado_em: null, card_id: "cartao-a", account_id: null }),
    ]);
    expect(n.aproximados).toBe(0);
  });
});

describe("03-E · numerosDoCaixa — aviso de sobreposição (K4)", () => {
  const reembolso: RecebivelComRecebimentos[] = [
    { valor: 100, status: "pago", pago_em: "2026-10-08", recebimentos: [] },
  ];
  const outras = tx({ type: "receita", status: "recebido", amount: 100, valor_pessoal: 0 });

  it("só reembolso > 0: sem aviso", () => {
    expect(numeros([], { recebiveis: reembolso }).avisoDeSobreposicao).toBe(false);
  });

  it("só outras entradas > 0: sem aviso", () => {
    expect(numeros([outras]).avisoDeSobreposicao).toBe(false);
  });

  it("os dois > 0: aviso", () => {
    expect(numeros([outras], { recebiveis: reembolso }).avisoDeSobreposicao).toBe(true);
  });

  it("nenhum dos dois: sem aviso", () => {
    expect(numeros([]).avisoDeSobreposicao).toBe(false);
  });
});

describe("03-E · diaDeCorte", () => {
  it("mês em andamento devolve o dia de hoje", () => {
    expect(diaDeCorte("2026-10", "2026-10-18")).toBe(18);
    expect(diaDeCorte("2026-10", "2026-10-01")).toBe(1);
    expect(diaDeCorte("2026-10", "2026-10-31")).toBe(31);
  });

  it("mês fechado (ou futuro) devolve null", () => {
    expect(diaDeCorte("2026-09", "2026-10-18")).toBeNull();
    expect(diaDeCorte("2026-11", "2026-10-18")).toBeNull();
  });
});

describe("03-E · periodoAteODia", () => {
  it("fecha no dia pedido", () => {
    expect(periodoAteODia("2026-03", 5)).toEqual({ de: "2026-03-01", ate: "2026-03-05" });
  });

  it("D maior que o mês: fecha no último dia dele", () => {
    expect(periodoAteODia("2026-02", 31).ate).toBe("2026-02-28");
    expect(periodoAteODia("2026-04", 31).ate).toBe("2026-04-30");
  });

  it("ano bissexto", () => {
    expect(periodoAteODia("2028-02", 30).ate).toBe("2028-02-29");
  });
});

describe("03-E · mesAnteriorDe", () => {
  it("vira o ano em janeiro", () => {
    expect(mesAnteriorDe("2026-01")).toBe("2025-12");
  });

  it("meses comuns, com zero à esquerda", () => {
    expect(mesAnteriorDe("2026-10")).toBe("2026-09");
    expect(mesAnteriorDe("2026-03")).toBe("2026-02");
  });
});

/* ───────────────────────────── comparativoAteODia ───────────────────────────── */

function dash(over: Partial<DashTx>): DashTx {
  return {
    amount: 100,
    valor_pessoal: null,
    type: "despesa",
    payment_method: null,
    status: "pago",
    competence_date: "2026-10-10",
    card_id: null,
    statement_id: null,
    parcelado: false,
    category_id: null,
    ...over,
  };
}

describe("03-E · comparativoAteODia — competência", () => {
  const hoje = "2026-10-18";

  it("corta os dois lados no dia D: lançamento do anterior depois do dia D não entra", () => {
    const c = comparativoAteODia({
      base: "competencia",
      mes: "2026-10",
      hoje,
      transactions: [
        dash({ competence_date: "2026-10-05", amount: 100 }),
        dash({ competence_date: "2026-10-25", amount: 999 }), // depois do dia 18: fora
        dash({ competence_date: "2026-09-10", amount: 200 }),
        dash({ competence_date: "2026-09-18", amount: 50 }), // exatamente o dia D: entra
        dash({ competence_date: "2026-09-19", amount: 700 }), // depois do dia D: fora
        dash({ type: "receita", competence_date: "2026-10-02", amount: 1000 }),
        dash({ type: "receita", competence_date: "2026-09-02", amount: 800 }),
        dash({ type: "receita", competence_date: "2026-09-29", amount: 5000 }), // depois do D: fora
      ],
    });
    expect(c.ateODia).toBe(18);
    expect(c.saidas).toEqual({ atual: 100, anterior: 250, pct: -60 });
    expect(c.entradas).toEqual({ atual: 1000, anterior: 800, pct: 25 });
  });

  it("compra de cartão fica fora e cartaoFora é true", () => {
    const c = comparativoAteODia({
      base: "competencia",
      mes: "2026-10",
      hoje,
      transactions: [
        dash({ competence_date: "2026-10-05", amount: 100 }),
        dash({ competence_date: "2026-10-06", amount: 400, card_id: "cartao-a", statement_id: "fat-1" }),
      ],
    });
    expect(c.saidas.atual).toBe(100);
    expect(c.cartaoFora).toBe(true);
  });

  it("base zero: pct é null, nunca Infinity nem NaN", () => {
    const c = comparativoAteODia({
      base: "competencia",
      mes: "2026-10",
      hoje,
      transactions: [dash({ competence_date: "2026-10-05", amount: 100 })],
    });
    expect(c.saidas.anterior).toBe(0);
    expect(c.saidas.pct).toBeNull();
    expect(c.entradas.pct).toBeNull();
  });

  it("anterior mais curto: D = 31 em março fecha fevereiro no dia 28", () => {
    const c = comparativoAteODia({
      base: "competencia",
      mes: "2026-03",
      hoje: "2026-03-31",
      transactions: [
        dash({ competence_date: "2026-02-28", amount: 60 }),
        dash({ competence_date: "2026-03-31", amount: 90 }),
      ],
    });
    expect(c.ateODia).toBe(31);
    expect(c.saidas.anterior).toBe(60);
    expect(c.saidas.atual).toBe(90);
  });

  it("mês fechado: ateODia null, números zerados, pct null, cartaoFora false", () => {
    const c = comparativoAteODia({
      base: "competencia",
      mes: "2026-09",
      hoje,
      transactions: [dash({ competence_date: "2026-09-05", amount: 100 })],
    });
    expect(c).toEqual({
      ateODia: null,
      entradas: { atual: 0, anterior: 0, pct: null },
      saidas: { atual: 0, anterior: 0, pct: null },
      cartaoFora: false,
    });
  });

  it("estorno de cartão (receita com cartão) não entra nas entradas", () => {
    const c = comparativoAteODia({
      base: "competencia",
      mes: "2026-10",
      hoje,
      transactions: [dash({ type: "receita", competence_date: "2026-10-05", amount: 80, card_id: "cartao-a" })],
    });
    expect(c.entradas.atual).toBe(0);
  });
});

describe("03-E · comparativoAteODia — caixa", () => {
  const hoje = "2026-10-18";

  it("entradas = renda + reembolsos + outras; saídas = saídas de caixa; cartaoFora false", () => {
    const c = comparativoAteODia({
      base: "caixa",
      mes: "2026-10",
      hoje,
      caixa: {
        pagamentosDeFatura: new Set(["pag-1"]),
        recebiveis: [{ valor: 100, status: "pago", pago_em: "2026-10-09", recebimentos: [] }],
        transactions: [
          tx({ type: "receita", status: "recebido", amount: 1000, valor_pessoal: 600, liquidado_em: "2026-10-05" }),
          tx({ amount: 250, liquidado_em: "2026-10-07" }),
          tx({ id: "pag-1", type: "transferencia", amount: 300, liquidado_em: "2026-10-10" }),
          tx({ amount: 9999, liquidado_em: "2026-10-25" }), // depois do dia 18: fora
          // mês anterior
          tx({ type: "receita", status: "recebido", amount: 800, liquidado_em: "2026-09-05" }),
          tx({ amount: 400, liquidado_em: "2026-09-18" }),
          tx({ amount: 777, liquidado_em: "2026-09-20" }), // depois do dia 18: fora
        ],
      },
    });
    expect(c.ateODia).toBe(18);
    expect(c.entradas).toEqual({ atual: 1100, anterior: 800, pct: 37.5 });
    expect(c.saidas).toEqual({ atual: 550, anterior: 400, pct: 37.5 });
    expect(c.cartaoFora).toBe(false);
  });

  it("base zero → pct null", () => {
    const c = comparativoAteODia({
      base: "caixa",
      mes: "2026-10",
      hoje,
      caixa: { pagamentosDeFatura: new Set(), recebiveis: [], transactions: [tx({ amount: 50 })] },
    });
    expect(c.saidas.anterior).toBe(0);
    expect(c.saidas.pct).toBeNull();
  });

  it("mês fechado → ateODia null", () => {
    const c = comparativoAteODia({
      base: "caixa",
      mes: "2026-08",
      hoje,
      caixa: { pagamentosDeFatura: new Set(), recebiveis: [], transactions: [tx()] },
    });
    expect(c.ateODia).toBeNull();
    expect(c.saidas).toEqual({ atual: 0, anterior: 0, pct: null });
    expect(c.cartaoFora).toBe(false);
  });
});

/* ───────────────────────────── A3 ───────────────────────────── */

describe("03-E · dataDeLiquidacaoAGravar", () => {
  it("status pendente com data → null", () => {
    expect(dataDeLiquidacaoAGravar({ status: "pendente", card_id: null, liquidado_em: "2026-10-10" })).toBeNull();
  });

  it("status cancelado com data → null", () => {
    expect(dataDeLiquidacaoAGravar({ status: "cancelado", card_id: null, liquidado_em: "2026-10-10" })).toBeNull();
  });

  it("cartão com data → null (K0.5)", () => {
    expect(dataDeLiquidacaoAGravar({ status: "pago", card_id: "cartao-a", liquidado_em: "2026-10-10" })).toBeNull();
  });

  it("pago com '' → null", () => {
    expect(dataDeLiquidacaoAGravar({ status: "pago", card_id: null, liquidado_em: "" })).toBeNull();
  });

  it("pago sem o campo ou com null → null", () => {
    expect(dataDeLiquidacaoAGravar({ status: "pago", card_id: null })).toBeNull();
    expect(dataDeLiquidacaoAGravar({ status: "recebido", card_id: null, liquidado_em: null })).toBeNull();
  });

  it("pago/recebido com data e sem cartão → a data", () => {
    expect(dataDeLiquidacaoAGravar({ status: "pago", card_id: null, liquidado_em: "2026-10-10" })).toBe("2026-10-10");
    expect(dataDeLiquidacaoAGravar({ status: "recebido", card_id: null, liquidado_em: "2026-10-11" })).toBe("2026-10-11");
  });
});

describe("03-E · entradasDoCaixa", () => {
  it("soma as três linhas em centavos, sem deriva de ponto flutuante", () => {
    const n = numeros([
      tx({ type: "receita", status: "recebido", amount: 0.1, valor_pessoal: null }),
      tx({ type: "receita", status: "recebido", amount: 0.2, valor_pessoal: 0 }),
    ]);
    expect(entradasDoCaixa(n)).toBe(0.3);
  });

  it("é a soma de renda + reembolsos + outras, nada mais (saídas não entram)", () => {
    const n = numeros([
      tx({ type: "receita", status: "recebido", amount: 300, valor_pessoal: 100 }),
      tx({ type: "despesa", amount: 50 }),
    ]);
    expect(entradasDoCaixa(n)).toBe(300);
  });
});

describe("03-E · dataDePagamentoFutura e dataDoExtratoAGravar (P8, K0.3)", () => {
  const HOJE = "2026-10-18";

  it("só a data posterior a hoje é futura; hoje e antes não são", () => {
    expect(dataDePagamentoFutura("2026-10-19", HOJE)).toBe(true);
    expect(dataDePagamentoFutura("2026-10-18", HOJE)).toBe(false);
    expect(dataDePagamentoFutura("2025-01-01", HOJE)).toBe(false);
  });

  it("sem data não é futura", () => {
    expect(dataDePagamentoFutura(null, HOJE)).toBe(false);
    expect(dataDePagamentoFutura(undefined, HOJE)).toBe(false);
    expect(dataDePagamentoFutura("", HOJE)).toBe(false);
  });

  it("o extrato grava a data da linha, e a linha futura entra sem data (aproximada)", () => {
    expect(dataDoExtratoAGravar("2026-10-05", HOJE)).toBe("2026-10-05");
    expect(dataDoExtratoAGravar("2026-10-18", HOJE)).toBe("2026-10-18");
    expect(dataDoExtratoAGravar("2026-11-02", HOJE)).toBeNull();
  });

  it("a mensagem diz o que fazer", () => {
    expect(MSG_DATA_PAGAMENTO_FUTURA).toMatch(/não pode ser futura/);
  });
});

describe("03-E · liquidadoNoBotao", () => {
  it("pendente → pago: limpar (entra no estado liquidado)", () => {
    expect(liquidadoNoBotao("pendente", "pago")).toBe("limpar");
  });

  it("pago → cancelado: limpar (sai do estado liquidado)", () => {
    expect(liquidadoNoBotao("pago", "cancelado")).toBe("limpar");
  });

  it("recebido → pendente: limpar", () => {
    expect(liquidadoNoBotao("recebido", "pendente")).toBe("limpar");
  });

  it("pago → recebido (e o inverso): manter", () => {
    expect(liquidadoNoBotao("pago", "recebido")).toBe("manter");
    expect(liquidadoNoBotao("recebido", "pago")).toBe("manter");
  });

  it("o mesmo status de novo: manter", () => {
    expect(liquidadoNoBotao("pago", "pago")).toBe("manter");
    expect(liquidadoNoBotao("pendente", "pendente")).toBe("manter");
  });

  it("pendente → cancelado (nenhum liquidado): manter", () => {
    expect(liquidadoNoBotao("pendente", "cancelado")).toBe("manter");
    expect(liquidadoNoBotao("cancelado", "pendente")).toBe("manter");
  });
});
