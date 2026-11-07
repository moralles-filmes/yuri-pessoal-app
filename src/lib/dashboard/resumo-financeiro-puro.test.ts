/**
 * REDESIGN-06 (T2) — `montarResumoDoDashboard`, a conta pura da faixa do Resumo financeiro e do
 * card Financeiro. Fixtures sintéticas, valores escritos à mão; o teste de equivalência compara a
 * função com `getFinanceCardData` (o card que já existia) sobre as MESMAS linhas.
 */
import { describe, expect, it, vi } from "vitest";
import { completudeDe } from "@/lib/finance/pipeline";
import type { DashReceivable, DashStatement, DashTx } from "@/lib/finance/dashboard";
import type { AccountWithBalance } from "@/types/database";
import {
  montarResumoDoDashboard,
  type ResumoDoDashboard,
} from "@/lib/dashboard/resumo-financeiro-puro";

const leitura = vi.hoisted(() => ({ lerFinanceiro: vi.fn() }));
vi.mock("@/lib/finance/queries", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/finance/queries")>()),
  lerFinanceiro: leitura.lerFinanceiro,
}));

const { getFinanceCardData } = await import("@/lib/dashboard/queries");

const EXATO = completudeDe([]);

function tx(p: Partial<DashTx> & Pick<DashTx, "id" | "type" | "amount" | "competence_date">): DashTx {
  return {
    valor_pessoal: null,
    payment_method: "pix",
    status: "pago",
    card_id: null,
    statement_id: null,
    parcelado: false,
    category_id: null,
    ...p,
  };
}

const FATURA_DE_NOVEMBRO: DashStatement = {
  id: "fatura-nov",
  card_id: "cartao-1",
  competencia: "2026-11-01",
  data_fechamento: "2026-11-10",
  data_vencimento: "2026-11-20",
  pago_em: null,
  total_atual: 800,
};

const RECEBIVEL_DA_FATURA: DashReceivable = {
  statement_id: "fatura-nov",
  installment_id: null,
  valor: 100,
  status: "pendente",
  ref_month: "2026-11",
};

const CONTAS = [
  { id: "c1", current_balance: 1000 },
  { id: "c2", current_balance: 234.5 },
] as unknown as AccountWithBalance[];

const BILLS = [
  { name: "Aluguel", amount: 1500, due_day: 25, is_active: true },
  { name: "Internet", amount: 100, due_day: 28, is_active: true },
];

/** O mês de novembro de 2026: duas receitas (uma de terceiro), uma despesa à vista e uma fatura. */
function novembro() {
  return {
    txs: [
      tx({ id: "t-nov-1", type: "receita", amount: 3000, competence_date: "2026-11-05" }),
      tx({ id: "t-nov-2", type: "receita", amount: 500, valor_pessoal: 0, competence_date: "2026-11-06" }),
      tx({ id: "t-nov-3", type: "despesa", amount: 200, valor_pessoal: 150, competence_date: "2026-11-10" }),
    ],
    sts: [FATURA_DE_NOVEMBRO],
    recs: [RECEBIVEL_DA_FATURA],
    bills: BILLS,
  };
}

type Parametros = Parameters<typeof montarResumoDoDashboard>[0];

function montar(over: Partial<Parametros> = {}): ResumoDoDashboard {
  return montarResumoDoDashboard({
    mes: "2026-11",
    hoje: "2026-11-18",
    doMes: novembro(),
    contas: CONTAS,
    historicoTxs: [],
    saldoAte: 1200,
    completudeDoMes: EXATO,
    completudeDoHistorico: EXATO,
    ...over,
  });
}

describe("06 · montarResumoDoDashboard", () => {
  it("numeros = os campos de getFinanceCardData para as mesmas linhas", async () => {
    const doMes = novembro();
    leitura.lerFinanceiro.mockResolvedValueOnce({
      entradas: doMes,
      contas: CONTAS,
      completude: EXATO,
    });
    const card = await getFinanceCardData("2026-11", "2026-11-18");
    const esperado: Partial<typeof card> = { ...card };
    delete esperado.completude;
    delete esperado.mes;

    const r = montar({ doMes });

    expect(r.numeros).toEqual(esperado);
    // Sanidade à mão: o saldo é a soma das contas, a parte de terceiros das entradas é 500.
    expect(r.numeros.saldo).toBe(1234.5);
    expect(r.numeros.entradas).toBe(3500);
    expect(r.numeros.entradasMeu).toBe(3000);
    expect(r.numeros.entradasTerceiros).toBe(500);
    expect(r.numeros.contasCount).toBe(2);
  });

  it("o histórico entra nas barras e nunca nos números do mês", () => {
    const outubro = tx({ id: "t-out-1", type: "despesa", amount: 400, competence_date: "2026-10-12" });

    const sem = montar();
    const com = montar({ historicoTxs: [outubro] });

    expect(com.numeros).toEqual(sem.numeros);
    expect(sem.barras.find((b) => b.mes === "2026-10")?.saidas).toBe(0);
    expect(com.barras.find((b) => b.mes === "2026-10")?.saidas).toBe(400);
  });

  it("nenhum lançamento entra duas vezes", () => {
    const repetido = tx({ id: "t-nov-1", type: "receita", amount: 3000, competence_date: "2026-10-30" });

    expect(() => montar({ historicoTxs: [repetido] })).toThrow(
      "lançamento repetido entre o mês e o histórico",
    );
  });

  it("mês em andamento: compara até o dia e a saída fica sem cor", () => {
    const outubro = tx({ id: "t-out-1", type: "despesa", amount: 100, competence_date: "2026-10-05" });

    const r = montar({ historicoTxs: [outubro] });

    expect(r.comparacao.saidas.sentido).toBe("neutro");
    expect(r.comparacao.saidas.texto).toContain("até o dia 18");
    // 150 (minha parte da despesa à vista) contra 100 de outubro até o dia 18.
    expect(r.comparacao.saidas.pct).toBeCloseTo(50, 10);
  });

  it("mês passado: compara o mês inteiro (Review Focus 1)", () => {
    const setembro = tx({ id: "t-set-1", type: "receita", amount: 800, competence_date: "2026-09-10" });
    const outubro = {
      txs: [tx({ id: "t-out-1", type: "receita", amount: 1000, competence_date: "2026-10-10" })],
      sts: [],
      recs: [],
      bills: [],
    };

    const r = montar({ mes: "2026-10", doMes: outubro, historicoTxs: [setembro] });

    expect(r.comparacao.entradas.texto).toBe("vs. mês anterior");
    expect(r.comparacao.entradas.pct).toBeCloseTo(25, 10);
    expect(r.saldoCom.rotulo).toBe("Saldo das contas · em 18/11");
  });

  it("sem histórico: sem base (Review Focus 2)", () => {
    const r = montar({ historicoTxs: [] });

    expect(r.comparacao.entradas.pct).toBeNull();
    expect(r.comparacao.entradas.texto).toBe("sem base de comparação");
    expect(r.comparacao.saidas.pct).toBeNull();
    expect(r.comparacao.saidas.texto).toBe("sem base de comparação");
  });

  it("saldo não lido vira null, nunca zero", () => {
    const r = montar({ saldoAte: null });

    expect(r.saldoCom.valor).toBeNull();
    expect(r.saldoCom.diferenca).toBeNull();
  });

  it("barras: 6 meses e o mês de hoje parcial", () => {
    const r = montar();

    expect(r.barras.map((b) => b.mes)).toEqual([
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
      "2026-10",
      "2026-11",
    ]);
    expect(r.barras.map((b) => b.parcial)).toEqual([false, false, false, false, false, true]);
  });
});
