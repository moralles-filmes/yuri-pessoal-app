import { describe, expect, it } from "vitest";
import {
  addMes,
  comparativoMesAMes,
  evolucaoMensal,
  gastosPorCategoria,
  gastosPorForma,
  gerarAlertas,
  mesAnterior,
  mesDe,
  projecaoProximosMeses,
  proximas6Faturas,
  proximasContasPagar,
  proximosMeses,
  resumoMes,
  totalAReceber,
  ultimosMeses,
  variacaoPct,
  type DashBill,
  type DashCard,
  type DashInstallmentItem,
  type DashReceivable,
  type DashRecurrence,
  type DashStatement,
  type DashTx,
} from "@/lib/finance/dashboard";

/* ───────────────────────────── Fixtures ───────────────────────────── */

const tx = (over: Partial<DashTx>): DashTx => ({
  amount: 0,
  valor_pessoal: null,
  type: "despesa",
  payment_method: null,
  status: "pago",
  competence_date: "2026-06-10",
  card_id: null,
  statement_id: null,
  parcelado: false,
  category_id: null,
  category: null,
  ...over,
});

const st1: DashStatement = {
  id: "st1",
  card_id: "c1",
  competencia: "2026-06-01",
  data_fechamento: "2026-06-10",
  data_vencimento: "2026-06-20",
  pago_em: null,
  total_atual: 200,
};
const st2: DashStatement = {
  id: "st2",
  card_id: "c1",
  competencia: "2026-07-01",
  data_fechamento: "2026-07-10",
  data_vencimento: "2026-07-20",
  pago_em: null,
  total_atual: 100,
};
const statements = [st1, st2];

const receivables: DashReceivable[] = [
  { statement_id: "st1", installment_id: null, valor: 50, status: "pendente" },
  { statement_id: "st2", installment_id: "it1", valor: 30, status: "pendente" },
];

const installmentItems: DashInstallmentItem[] = [
  {
    id: "it1",
    statement_id: "st2",
    valor: 100,
    status: "ativa",
    parent: { category: { id: "C", name: "Eletrônicos", color: null } },
  },
];

const transactions: DashTx[] = [
  // Cash à vista (categoria Mercado, pix) — 100% meu.
  tx({
    amount: 100,
    payment_method: "pix",
    competence_date: "2026-06-10",
    category_id: "A",
    category: { id: "A", name: "Mercado", color: null },
  }),
  // À-vista no cartão (categoria Restaurante) — meu 150, terceiros 50.
  tx({
    amount: 200,
    valor_pessoal: 150,
    payment_method: "cartao_credito",
    competence_date: "2026-06-05",
    card_id: "c1",
    statement_id: "st1",
    category_id: "B",
    category: { id: "B", name: "Restaurante", color: null },
  }),
  // Receita — entra em entradas, não em saídas.
  tx({ amount: 500, type: "receita", status: "recebido", competence_date: "2026-06-01" }),
  // Cancelado — deve ser ignorado em tudo.
  tx({ amount: 999, status: "cancelado", competence_date: "2026-06-12" }),
  // Transferência — fora de entradas/saídas.
  tx({ amount: 999, type: "transferencia", competence_date: "2026-06-12" }),
  // Compra parcelada (PAI) — statement_id NULL, parcelado true: NUNCA somar.
  tx({
    amount: 100,
    parcelado: true,
    card_id: "c1",
    competence_date: "2026-07-02",
    category_id: "C",
  }),
];

const cards: DashCard[] = [
  { id: "c1", nome: "Nubank", cor: "#820ad1", limite_total: 300, dia_fechamento: 10, dia_vencimento: 20 },
];

/* ───────────────────────────── Helpers de mês ───────────────────────────── */

describe("helpers de mês", () => {
  it("mesDe / addMes / mesAnterior", () => {
    expect(mesDe("2026-06-15")).toBe("2026-06");
    expect(addMes("2026-12", 1)).toBe("2027-01");
    expect(addMes("2026-01", -1)).toBe("2025-12");
    expect(mesAnterior("2026-03")).toBe("2026-02");
  });

  it("proximosMeses e ultimosMeses são contíguos", () => {
    expect(proximosMeses("2026-06", 3)).toEqual(["2026-06", "2026-07", "2026-08"]);
    expect(ultimosMeses("2026-06", 3)).toEqual(["2026-04", "2026-05", "2026-06"]);
  });

  it("variacaoPct retorna null quando o denominador é 0", () => {
    expect(variacaoPct(300, 0)).toBeNull();
    expect(variacaoPct(150, 100)).toBeCloseTo(50);
  });
});

/* ───────────────────────────── resumoMes ───────────────────────────── */

describe("resumoMes — separação meu × terceiros", () => {
  const r = resumoMes({ mes: "2026-06", transactions, statements, receivables });

  it("entradas só de receita; transferência/ajuste/cancelado fora", () => {
    expect(r.entradas).toBe(500);
  });

  it("saídas = à vista + cartão (sem o parcelado PAI)", () => {
    expect(r.aVista).toBe(100);
    expect(r.cartao).toBe(200);
    expect(r.saidas).toBe(300);
  });

  it("meu + terceiros === saídas (movimentado)", () => {
    expect(r.meu).toBe(250); // 100 (à vista) + 150 (cartão meu)
    expect(r.terceiros).toBe(50);
    expect(r.meu + r.terceiros).toBe(r.saidas);
  });

  it("cartão meu usa total_atual − recebíveis da fatura", () => {
    expect(r.cartaoMeu).toBe(150);
    expect(r.aVistaMeu).toBe(100);
  });

  it("valor_pessoal null ⇒ meu = amount", () => {
    const only = resumoMes({
      mes: "2026-06",
      transactions: [tx({ amount: 80, competence_date: "2026-06-09" })],
      statements: [],
      receivables: [],
    });
    expect(only.aVista).toBe(80);
    expect(only.aVistaMeu).toBe(80);
  });

  it("mês vazio ⇒ tudo zero e finito (sem NaN)", () => {
    const z = resumoMes({ mes: "2026-01", transactions, statements, receivables });
    for (const v of Object.values(z)) {
      expect(Number.isFinite(v)).toBe(true);
    }
    expect(z.saidas).toBe(0);
    expect(z.entradas).toBe(0);
    expect(z.meu).toBe(0);
  });

  it("estorno de cartão (receita vinculada à fatura) NÃO entra em entradas", () => {
    // Estorno = receita com card_id/statement_id. Já está embutido no total_atual da fatura
    // (reduz as saídas); contá-lo também como entrada seria contagem dupla.
    const comEstorno = [
      ...transactions,
      tx({
        amount: 40,
        type: "receita",
        status: "recebido",
        competence_date: "2026-06-03",
        card_id: "c1",
        statement_id: "st1",
      }),
    ];
    const r2 = resumoMes({ mes: "2026-06", transactions: comEstorno, statements, receivables });
    // Entradas seguem 500 (só a receita de conta) — o estorno de 40 não soma.
    expect(r2.entradas).toBe(500);
    // Saídas inalteradas aqui (vêm do total_atual da fatura, que já considera o estorno).
    expect(r2.saidas).toBe(300);
  });
});

/* ───────────────────────────── categoria & forma ───────────────────────────── */

describe("gastosPorCategoria / gastosPorForma", () => {
  const params = { mes: "2026-06", transactions, statements, installmentItems, receivables };

  it("categoria reconcilia com resumoMes.saidas e ordena desc", () => {
    const cats = gastosPorCategoria(params);
    const soma = cats.reduce((s, c) => s + c.movimentado, 0);
    expect(soma).toBe(300);
    expect(cats[0].name).toBe("Restaurante"); // 200 vem primeiro
    expect(cats[0].movimentado).toBe(200);
  });

  it("forma de pagamento reconcilia com saídas", () => {
    const formas = gastosPorForma(params);
    const soma = formas.reduce((s, f) => s + f.movimentado, 0);
    expect(soma).toBe(300);
    const cartao = formas.find((f) => f.paymentMethod === "cartao_credito");
    expect(cartao?.movimentado).toBe(200);
  });

  it("categoria nula vira 'Sem categoria'", () => {
    const cats = gastosPorCategoria({
      ...params,
      transactions: [tx({ amount: 40, competence_date: "2026-06-03" })],
      statements: [],
      installmentItems: [],
      receivables: [],
    });
    expect(cats[0].name).toBe("Sem categoria");
  });

  it("parcela reconcilia no mês da fatura (julho), meu = valor − recebível", () => {
    const cats = gastosPorCategoria({ ...params, mes: "2026-07" });
    expect(cats).toHaveLength(1);
    expect(cats[0].name).toBe("Eletrônicos");
    expect(cats[0].movimentado).toBe(100);
    expect(cats[0].meu).toBe(70); // 100 − 30 (recebível da parcela)
  });
});

/* ───────────────────────────── comparativo & evolução ───────────────────────────── */

describe("comparativoMesAMes / evolucaoMensal", () => {
  it("pct null quando o mês anterior é 0", () => {
    const c = comparativoMesAMes({ mes: "2026-06", transactions, statements, receivables });
    expect(c.atual.saidas).toBe(300);
    expect(c.anterior.saidas).toBe(0);
    expect(c.deltaSaidasPct).toBeNull();
    expect(c.deltaSaidas).toBe(300);
  });

  it("evolução devolve um ponto por mês, finito", () => {
    const ev = evolucaoMensal({
      meses: ultimosMeses("2026-07", 3),
      transactions,
      statements,
      receivables,
    });
    expect(ev).toHaveLength(3);
    expect(ev.map((p) => p.mes)).toEqual(["2026-05", "2026-06", "2026-07"]);
    const junho = ev.find((p) => p.mes === "2026-06");
    expect(junho?.saidas).toBe(300);
    expect(junho?.saldo).toBe(200); // 500 − 300
    for (const p of ev) {
      expect(Number.isFinite(p.saldo)).toBe(true);
    }
  });
});

/* ───────────────────────────── próximas 6 faturas ───────────────────────────── */

describe("proximas6Faturas", () => {
  const provis = proximas6Faturas({ hoje: "2026-06-15", cards, statements, receivables });

  it("gera exatamente 6 competências contíguas por cartão", () => {
    expect(provis).toHaveLength(6);
    const comps = provis.map((f) => f.competencia);
    for (let i = 1; i < comps.length; i++) {
      expect(comps[i]).toBe(addMes(comps[i - 1], 1));
    }
  });

  it("fatura real (julho) bate total/meu/terceiros; virtuais ficam zero", () => {
    const julho = provis.find((f) => f.competencia === "2026-07");
    expect(julho?.total).toBe(100);
    expect(julho?.terceiros).toBe(30);
    expect(julho?.meu).toBe(70);
    expect(julho?.virtual).toBe(false);

    const virtuais = provis.filter((f) => f.virtual);
    expect(virtuais.length).toBeGreaterThan(0);
    for (const v of virtuais) {
      expect(v.total).toBe(0);
      expect(v.status).toBe("aberta");
    }
  });
});

/* ───────────────────────────── projeção ───────────────────────────── */

describe("projecaoProximosMeses", () => {
  const recorrencias: DashRecurrence[] = [
    {
      amount: 50,
      type: "despesa",
      frequency: "mensal",
      interval_count: 1,
      anchor_date: "2026-06-05",
      next_due_date: "2026-06-05",
      end_date: null,
      is_active: true,
    },
    // Inativa — não entra.
    {
      amount: 999,
      type: "despesa",
      frequency: "mensal",
      interval_count: 1,
      anchor_date: "2026-06-05",
      next_due_date: "2026-06-05",
      end_date: null,
      is_active: false,
    },
  ];
  const bills: DashBill[] = [{ name: "Internet", amount: 80, due_day: 10, is_active: true }];

  it("soma faturas (sem dupla contagem) + recorrência mensal + conta fixa", () => {
    const proj = projecaoProximosMeses({
      hoje: "2026-06-15",
      meses: proximosMeses("2026-06", 3),
      statements,
      recorrencias,
      bills,
    });
    expect(proj.map((p) => p.mes)).toEqual(["2026-06", "2026-07", "2026-08"]);

    const jun = proj[0];
    expect(jun.faturas).toBe(200);
    expect(jun.recorrencias).toBe(50);
    expect(jun.contasFixas).toBe(80);
    expect(jun.total).toBe(330);

    const jul = proj[1];
    expect(jul.faturas).toBe(100);
    expect(jul.total).toBe(230);

    const ago = proj[2];
    expect(ago.faturas).toBe(0);
    expect(ago.total).toBe(130);
    for (const p of proj) expect(Number.isFinite(p.total)).toBe(true);
  });
});

/* ───────────────────────────── a receber & contas ───────────────────────────── */

describe("totalAReceber / proximasContasPagar", () => {
  it("a receber soma só status pendente/cobrado", () => {
    expect(totalAReceber(receivables)).toBe(80);
    const comPago: DashReceivable[] = [
      ...receivables,
      { statement_id: "st1", installment_id: null, valor: 999, status: "pago" },
      { statement_id: "st1", installment_id: null, valor: 999, status: "ignorado" },
    ];
    expect(totalAReceber(comPago)).toBe(80);
  });

  it("a receber filtra pelo mês de referência quando informado", () => {
    const recs: DashReceivable[] = [
      { statement_id: "st1", installment_id: null, valor: 50, status: "pendente", ref_month: "2026-06" },
      { statement_id: "st2", installment_id: null, valor: 30, status: "cobrado", ref_month: "2026-06" },
      { statement_id: "st3", installment_id: null, valor: 70, status: "pendente", ref_month: "2026-07" },
      { statement_id: null, installment_id: null, valor: 999, status: "pago", ref_month: "2026-06" },
    ];
    expect(totalAReceber(recs, "2026-06")).toBe(80);
    expect(totalAReceber(recs, "2026-07")).toBe(70);
    expect(totalAReceber(recs, "2026-08")).toBe(0);
    // Sem mês: soma todos os em aberto (comportamento legado).
    expect(totalAReceber(recs)).toBe(150);
  });

  it("próximas contas a pagar dentro da janela", () => {
    const bills: DashBill[] = [
      { name: "Internet", amount: 80, due_day: 20, is_active: true },
      { name: "Inativa", amount: 500, due_day: 20, is_active: false },
    ];
    const pc = proximasContasPagar({ hoje: "2026-06-15", bills, dias: 31 });
    expect(pc.count).toBe(1);
    expect(pc.total).toBe(80);
    expect(pc.proxima?.nome).toBe("Internet");
  });
});

/* ───────────────────────────── alertas ───────────────────────────── */

describe("gerarAlertas", () => {
  const resumoAtual = resumoMes({ mes: "2026-06", transactions, statements, receivables });

  it("gasto alto, limite do cartão e vencimento", () => {
    const alertas = gerarAlertas({
      hoje: "2026-06-15",
      resumoAtual,
      mediaSaidas: 100, // 300 > 100 * 1.2 ⇒ gasto alto
      cards,
      statements,
      receivables,
    });
    const kinds = alertas.map((a) => a.kind);
    expect(kinds).toContain("gasto_alto");
    expect(kinds).toContain("limite_cartao");
    expect(kinds).toContain("vencimento");

    const limite = alertas.find((a) => a.kind === "limite_cartao");
    expect(limite?.severity).toBe("danger"); // usado 300 = 100% do limite 300
  });

  it("sem alarme falso de gasto alto abaixo do limiar", () => {
    const alertas = gerarAlertas({
      hoje: "2026-06-15",
      resumoAtual,
      mediaSaidas: 1000, // 300 < 1000 * 1.2
      cards: [],
      statements: [],
      receivables: [],
    });
    expect(alertas.find((a) => a.kind === "gasto_alto")).toBeUndefined();
  });
});
