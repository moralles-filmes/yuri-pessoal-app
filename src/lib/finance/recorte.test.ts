import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  type DashCard,
  type DashInstallmentItem,
  type DashReceivable,
  type DashStatement,
  type DashTx,
  gastosPorCategoria,
  resumoMes,
} from "@/lib/finance/dashboard";
import { aReceberPorPessoa } from "@/lib/finance/painel";
import { type RecebivelComRecebimentos } from "@/lib/finance/recebimentos";
import {
  type BlocoDoRelatorio,
  type EntradasDoMotorDoRelatorio,
  type Recorte,
  type TipoDeRecorte,
  SEGUE_O_RECORTE,
  SEM_RECORTE,
  naoSegue,
  recortarEntradas,
  recortarPorCategoria,
  recortarRecebiveisCrus,
  recorteDaUrl,
  recortesAtivos,
} from "@/lib/finance/recorte";
import { reaisParaCentavos } from "@/lib/format";
import { termosProibidosEm } from "@/lib/tone/vocabulary";

/**
 * 04-A2, Tarefa 2 — os recortes puros e a matriz "segue × não segue".
 *
 * Fixture SINTÉTICA ("Cartão A/B", "Conta B/C", "Categoria A…E", "Pessoa A/B", valores inventados),
 * com o que costuma quebrar a conta: um ESTORNO de cartão, uma compra PARCELADA, uma compra à vista
 * com recebível, uma receita de conta e um mês anterior.
 *
 * Contas à mão (novembro de 2026):
 *   à vista:  T1 100 (meu 60, conta B, Categoria A) · T2 80 pendente (conta C, Categoria B)
 *   Cartão A: T4 200 (meu 120, Categoria A) + parcela I1 50 (Categoria C) − estorno 30 = fatura 220
 *   Cartão B: T11 70 (Categoria A) = fatura 70
 *   ⇒ saídas 180 + 290 = 470 · terceiros dos recebíveis das faturas 80 + 20 = 100
 *   Categoria A: T1 + T4 + T11 = 370 (meu 60 + 120 + 70 = 250)
 */

const MES = "2026-11";
const HOJE = "2026-11-05";

const categoria = (id: string, nome: string) => ({ id, name: nome, color: null });
const CAT_A = categoria("cat-a", "Categoria A");
const CAT_B = categoria("cat-b", "Categoria B");
const CAT_C = categoria("cat-c", "Categoria C");
const CAT_E = categoria("cat-e", "Categoria E");

const base = {
  valor_pessoal: null,
  status: "pago" as const,
  parcelado: false,
  card_id: null,
  account_id: null,
  statement_id: null,
  payment_method: "pix" as const,
};

const TXS: DashTx[] = [
  // Outubro (outro mês: nunca entra nas contas de novembro).
  { ...base, id: "t12", type: "despesa", amount: 90, competence_date: "2026-10-07", account_id: "conta-b", category_id: CAT_A.id, category: CAT_A },
  // Receita de conta.
  { ...base, id: "t3", type: "receita", amount: 3000, competence_date: "2026-11-01", account_id: "conta-b", category_id: CAT_E.id, category: CAT_E },
  // À vista, conta B, dividida com a Pessoa A.
  { ...base, id: "t1", type: "despesa", amount: 100, valor_pessoal: 60, competence_date: "2026-11-02", account_id: "conta-b", category_id: CAT_A.id, category: CAT_A },
  // À vista, conta C, pendente.
  { ...base, id: "t2", type: "despesa", amount: 80, status: "pendente", competence_date: "2026-11-25", account_id: "conta-c", category_id: CAT_B.id, category: CAT_B },
  // Cartão A.
  { ...base, id: "t4", type: "despesa", amount: 200, valor_pessoal: 120, competence_date: "2026-11-03", category_id: CAT_A.id, category: CAT_A, payment_method: "cartao_credito", card_id: "cartao-a", statement_id: "f-a-nov" },
  // Compra parcelada do Cartão A: só a compra-pai está em `transactions`.
  { ...base, id: "t5", type: "despesa", amount: 150, parcelado: true, competence_date: "2026-11-03", category_id: CAT_C.id, category: CAT_C, payment_method: "cartao_credito", card_id: "cartao-a" },
  // ESTORNO de cartão: receita ligada à fatura. Não é entrada de caixa.
  { ...base, id: "t6", type: "receita", amount: 30, competence_date: "2026-11-04", category_id: CAT_A.id, category: CAT_A, payment_method: "cartao_credito", card_id: "cartao-a", statement_id: "f-a-nov" },
  // Cartão B.
  { ...base, id: "t11", type: "despesa", amount: 70, competence_date: "2026-11-02", category_id: CAT_A.id, category: CAT_A, payment_method: "cartao_credito", card_id: "cartao-b", statement_id: "f-b-nov" },
];

const STS: DashStatement[] = [
  { id: "f-a-out", card_id: "cartao-a", competencia: "2026-10-01", data_fechamento: "2026-10-10", data_vencimento: "2026-10-18", pago_em: "2026-10-18", total_atual: 100 },
  { id: "f-a-nov", card_id: "cartao-a", competencia: "2026-11-01", data_fechamento: "2026-11-10", data_vencimento: "2026-11-18", pago_em: null, total_atual: 220 },
  { id: "f-a-dez", card_id: "cartao-a", competencia: "2026-12-01", data_fechamento: "2026-12-10", data_vencimento: "2026-12-18", pago_em: null, total_atual: 40 },
  { id: "f-b-nov", card_id: "cartao-b", competencia: "2026-11-01", data_fechamento: "2026-11-15", data_vencimento: "2026-11-25", pago_em: null, total_atual: 70 },
];

const INST: DashInstallmentItem[] = [
  { id: "i1", statement_id: "f-a-nov", valor: 50, status: "ativa", parent: { category: CAT_C } },
  { id: "i2", statement_id: "f-a-dez", valor: 40, status: "ativa", parent: { category: CAT_C } },
];

const RECS: DashReceivable[] = [
  // À vista (T1), Pessoa A.
  { transaction_id: "t1", statement_id: null, installment_id: null, valor: 40, status: "pendente", recebido: 0, ref_month: MES },
  // Compra do Cartão A (T4), Pessoa B, com 30 já recebidos.
  { transaction_id: "t4", statement_id: "f-a-nov", installment_id: null, valor: 80, status: "pendente", recebido: 30, ref_month: MES },
  // Parcela I1 do Cartão A, Pessoa A.
  { transaction_id: null, statement_id: "f-a-nov", installment_id: "i1", valor: 20, status: "pendente", recebido: 0, ref_month: MES },
];

const CARDS: DashCard[] = [
  { id: "cartao-a", nome: "Cartão A", cor: null, limite_total: 5000, dia_fechamento: 10, dia_vencimento: 18 },
  { id: "cartao-b", nome: "Cartão B", cor: null, limite_total: 3000, dia_fechamento: 15, dia_vencimento: 25 },
];

const ENTRADAS: EntradasDoMotorDoRelatorio = {
  txs: TXS,
  sts: STS,
  recs: RECS,
  inst: INST,
  cards: CARDS,
  recorrencias: [],
  bills: [],
};

const CONHECIDOS = {
  contas: ["conta-b", "conta-c"],
  cartoes: ["cartao-a", "cartao-b"],
  pessoas: ["pessoa-a", "pessoa-b"],
  categorias: [CAT_A.id, CAT_B.id, CAT_C.id, CAT_E.id],
};

const cent = reaisParaCentavos;

/** O `resumoMes` de sempre sobre as entradas (recortadas ou não). */
function resumoDe(e: Pick<EntradasDoMotorDoRelatorio, "txs" | "sts" | "recs">) {
  return resumoMes({ mes: MES, transactions: e.txs, statements: e.sts, receivables: e.recs });
}

/* ───────────────────────────── recorteDaUrl ───────────────────────────── */

describe("recorteDaUrl", () => {
  it("ids válidos passam, um por tipo", () => {
    expect(
      recorteDaUrl({ conta: "conta-b", pessoa: "pessoa-a", categoria: CAT_A.id }, CONHECIDOS),
    ).toEqual({ conta: "conta-b", cartao: null, pessoa: "pessoa-a", categoria: CAT_A.id });
    expect(recorteDaUrl({ cartao: "cartao-a" }, CONHECIDOS)).toEqual({
      ...SEM_RECORTE,
      cartao: "cartao-a",
    });
  });

  it("sem parâmetro, nenhum recorte", () => {
    expect(recorteDaUrl({}, CONHECIDOS)).toEqual(SEM_RECORTE);
  });

  it("id fora de `conhecidos` vira null (sem filtro fantasma)", () => {
    expect(
      recorteDaUrl(
        { conta: "conta-x", cartao: "cartao-x", pessoa: "pessoa-x", categoria: "cat-x" },
        CONHECIDOS,
      ),
    ).toEqual(SEM_RECORTE);
  });

  it("um id de cartão em ?conta= é ignorado", () => {
    expect(recorteDaUrl({ conta: "cartao-a" }, CONHECIDOS)).toEqual(SEM_RECORTE);
  });

  it("conta e cartão juntos: fica o cartão (D-A2-1, Review Focus 1)", () => {
    expect(recorteDaUrl({ conta: "conta-b", cartao: "cartao-a" }, CONHECIDOS)).toEqual({
      ...SEM_RECORTE,
      cartao: "cartao-a",
    });
  });

  it("conta válida com cartão inválido: a conta fica", () => {
    expect(recorteDaUrl({ conta: "conta-b", cartao: "cartao-x" }, CONHECIDOS)).toEqual({
      ...SEM_RECORTE,
      conta: "conta-b",
    });
  });

  it("parâmetro repetido (string[]) vira null", () => {
    expect(
      recorteDaUrl({ conta: ["conta-b", "conta-c"], categoria: [CAT_A.id] }, CONHECIDOS),
    ).toEqual(SEM_RECORTE);
  });
});

describe("recortesAtivos", () => {
  it("lista só os recortes ligados", () => {
    expect(recortesAtivos(SEM_RECORTE)).toEqual([]);
    expect(
      recortesAtivos({ conta: null, cartao: "cartao-a", pessoa: "pessoa-a", categoria: CAT_A.id }),
    ).toEqual(["cartao", "categoria", "pessoa"]);
  });
});

/* ───────────────────────────── recortarEntradas ───────────────────────────── */

describe("recortarEntradas por cartão", () => {
  const doCartaoA = recortarEntradas(ENTRADAS, { conta: null, cartao: "cartao-a" });

  it("saídas === Σ total_atual das faturas do Cartão A no mês; aVista e entradas são zero", () => {
    const r = resumoDe(doCartaoA);
    const faturasDoMes = STS.filter((s) => s.card_id === "cartao-a" && s.competencia.startsWith(MES));
    expect(cent(r.saidas)).toBe(faturasDoMes.reduce((s, f) => s + cent(f.total_atual ?? 0), 0));
    expect(r.saidas).toBe(220);
    expect(r.aVista).toBe(0);
    expect(r.entradas).toBe(0);
  });

  it("filtra lançamentos, faturas, parcelas, recebíveis e cartões", () => {
    expect(doCartaoA.txs.every((t) => t.card_id === "cartao-a")).toBe(true);
    expect(doCartaoA.sts.map((s) => s.id).sort()).toEqual(["f-a-dez", "f-a-nov", "f-a-out"]);
    expect(doCartaoA.inst.map((i) => i.id).sort()).toEqual(["i1", "i2"]);
    // O recebível da compra T4 e o da parcela I1; o da compra à vista T1 fica de fora.
    expect(doCartaoA.recs.map((r) => r.transaction_id ?? r.installment_id).sort()).toEqual(["i1", "t4"]);
    expect(doCartaoA.cards.map((c) => c.id)).toEqual(["cartao-a"]);
  });

  it("não mexe nas listas que ele não recorta (recorrências e contas fixas)", () => {
    expect(doCartaoA.recorrencias).toBe(ENTRADAS.recorrencias);
    expect(doCartaoA.bills).toBe(ENTRADAS.bills);
  });

  it("a minha parte e a de terceiros do Cartão A saem do mesmo motor", () => {
    const r = resumoDe(doCartaoA);
    expect(r.meu).toBe(120);
    expect(r.terceiros).toBe(100);
  });

  it("Σ saídas de cada cartão + aVista sem recorte === saídas sem recorte, em centavos", () => {
    const semRecorte = resumoDe(ENTRADAS);
    const cartoes = ["cartao-a", "cartao-b"].map((id) =>
      resumoDe(recortarEntradas(ENTRADAS, { conta: null, cartao: id })),
    );
    const somaCent = cartoes.reduce((s, r) => s + cent(r.saidas), 0) + cent(semRecorte.aVista);
    expect(somaCent).toBe(cent(semRecorte.saidas));
    expect(semRecorte.saidas).toBe(470);
  });
});

describe("recortarEntradas por conta", () => {
  const daContaB = recortarEntradas(ENTRADAS, { conta: "conta-b", cartao: null });

  it("só lançamentos daquela conta, sem faturas e sem parcelas", () => {
    expect(daContaB.txs.map((t) => t.id).sort()).toEqual(["t1", "t12", "t3"]);
    expect(daContaB.sts).toEqual([]);
    expect(daContaB.inst).toEqual([]);
  });

  it("saídas === aVista daquela conta, e as entradas são as dela", () => {
    const r = resumoDe(daContaB);
    expect(r.saidas).toBe(100);
    expect(r.aVista).toBe(100);
    expect(r.saidas).toBe(r.aVista);
    expect(r.cartao).toBe(0);
    expect(r.entradas).toBe(3000);
  });

  it("os recebíveis ficam só os dos lançamentos que ficaram", () => {
    expect(daContaB.recs.map((r) => r.transaction_id)).toEqual(["t1"]);
    expect(resumoDe(daContaB).meu).toBe(60);
  });

  it("outra conta não herda o lançamento da primeira", () => {
    const daContaC = recortarEntradas(ENTRADAS, { conta: "conta-c", cartao: null });
    expect(daContaC.txs.map((t) => t.id)).toEqual(["t2"]);
    expect(resumoDe(daContaC).saidas).toBe(80);
  });
});

describe("recortarEntradas: casos de borda", () => {
  it("sem recorte de cartão nem de conta devolve as MESMAS entradas", () => {
    expect(recortarEntradas(ENTRADAS, { conta: null, cartao: null })).toBe(ENTRADAS);
  });

  it("conta e cartão juntos (não vem da URL, mas o tipo permite): vale o cartão", () => {
    const e = recortarEntradas(ENTRADAS, { conta: "conta-b", cartao: "cartao-b" });
    expect(e.txs.every((t) => t.card_id === "cartao-b")).toBe(true);
    expect(e.sts.map((s) => s.id)).toEqual(["f-b-nov"]);
  });
});

/* ───────────────────────────── recortarPorCategoria ───────────────────────────── */

describe("recortarPorCategoria", () => {
  const entradasDoMotor = { txs: TXS, sts: STS, recs: RECS, inst: INST };
  const porCategoria = (categoriaId: string, entradas = entradasDoMotor) =>
    recortarPorCategoria({ mes: MES, categoriaId, entradas });

  it("a fatia é IGUAL à da mesma categoria em gastosPorCategoria sem recorte", () => {
    const rosca = gastosPorCategoria({
      mes: MES,
      transactions: TXS,
      statements: STS,
      installmentItems: INST,
      receivables: RECS,
    });
    for (const cat of [CAT_A, CAT_B, CAT_C]) {
      expect(porCategoria(cat.id).fatia).toEqual(rosca.find((f) => f.categoryId === cat.id));
    }
    expect(porCategoria(CAT_A.id).fatia).toMatchObject({ movimentado: 370, meu: 250 });
  });

  it("o retorno tem exatamente fatia, formas e entradas — nenhuma lista do motor (D-A2-14)", () => {
    const r = porCategoria(CAT_A.id);
    expect(Object.keys(r)).toEqual(["fatia", "formas", "entradas"]);
    expect(Object.keys(r.entradas).sort()).toEqual(["entradas", "entradasMeu", "entradasTerceiros"]);
    for (const chave of ["txs", "sts", "inst", "recs", "transactions", "statements"]) {
      expect(r).not.toHaveProperty(chave);
    }
  });

  it("formas: lançamentos e parcelas da categoria, com TODAS as faturas", () => {
    expect(porCategoria(CAT_A.id).formas).toEqual([
      { paymentMethod: "cartao_credito", movimentado: 270, meu: 190 },
      { paymentMethod: "pix", movimentado: 100, meu: 60 },
    ]);
    // A parcela de Categoria C entra pela fatura: só existe forma se a fatura veio junto.
    expect(porCategoria(CAT_C.id).formas).toEqual([
      { paymentMethod: "cartao_credito", movimentado: 50, meu: 30 },
    ]);
  });

  it("entradas: as receitas de conta da categoria; estorno de cartão não é entrada", () => {
    expect(porCategoria(CAT_E.id).entradas).toEqual({
      entradas: 3000,
      entradasMeu: 3000,
      entradasTerceiros: 0,
    });
    // O estorno de 30 é da Categoria A, mas tem cartão: não conta.
    expect(porCategoria(CAT_A.id).entradas).toEqual({
      entradas: 0,
      entradasMeu: 0,
      entradasTerceiros: 0,
    });
  });

  it("categoria sem item no mês: fatia null, formas vazias e entradas ZERO medido (Review Focus 2)", () => {
    const r = porCategoria("cat-sem-gasto");
    expect(r.fatia).toBeNull();
    expect(r.formas).toEqual([]);
    expect(r.entradas).toEqual({ entradas: 0, entradasMeu: 0, entradasTerceiros: 0 });
    // Categoria que só tem receita também não tem fatia de gasto.
    expect(porCategoria(CAT_E.id).fatia).toBeNull();
  });

  it("cartão + categoria (D-A2-24): a fatia só tem itens daquele cartão", () => {
    const doCartaoA = recortarEntradas(ENTRADAS, { conta: null, cartao: "cartao-a" });
    const r = recortarPorCategoria({ mes: MES, categoriaId: CAT_A.id, entradas: doCartaoA });
    expect(r.fatia).toMatchObject({ movimentado: 200, meu: 120 });
    expect(r.formas).toEqual([{ paymentMethod: "cartao_credito", movimentado: 200, meu: 120 }]);
  });
});

/* ───────────────────────────── recortarRecebiveisCrus ───────────────────────────── */

type RecebivelCru = RecebivelComRecebimentos & {
  person: { id: string; nome: string } | null;
  person_id: string | null;
  card_id: string | null;
};

const PESSOA_A = { id: "pessoa-a", nome: "Pessoa A" };
const PESSOA_B = { id: "pessoa-b", nome: "Pessoa B" };

const CRUS: RecebivelCru[] = [
  { valor: 40, status: "pendente", recebimentos: [], person: PESSOA_A, person_id: "pessoa-a", card_id: null },
  {
    valor: 80,
    status: "pendente",
    recebimentos: [{ valor: 30, recebido_em: "2026-11-03" }],
    person: PESSOA_B,
    person_id: "pessoa-b",
    card_id: "cartao-a",
  },
  { valor: 20, status: "pendente", recebimentos: [], person: PESSOA_A, person_id: "pessoa-a", card_id: "cartao-a" },
  { valor: 40, status: "pendente", recebimentos: [], person: PESSOA_B, person_id: "pessoa-b", card_id: null },
];

describe("recortarRecebiveisCrus", () => {
  it("filtra por person_id", () => {
    const r = recortarRecebiveisCrus(CRUS, { pessoa: "pessoa-a", cartao: null });
    expect(r.map((x) => x.person_id)).toEqual(["pessoa-a", "pessoa-a"]);
  });

  it("filtra por card_id", () => {
    const r = recortarRecebiveisCrus(CRUS, { pessoa: null, cartao: "cartao-a" });
    expect(r).toHaveLength(2);
    expect(r.every((x) => x.card_id === "cartao-a")).toBe(true);
  });

  it("os dois juntos valem os dois; nenhum devolve a lista inteira", () => {
    expect(recortarRecebiveisCrus(CRUS, { pessoa: "pessoa-b", cartao: "cartao-a" })).toEqual([CRUS[1]]);
    expect(recortarRecebiveisCrus(CRUS, { pessoa: null, cartao: null })).toEqual(CRUS);
  });

  it("aReceberPorPessoa sobre o recorte da pessoa é igual à linha dela sem recorte", () => {
    const todas = aReceberPorPessoa(CRUS, HOJE);
    const daPessoaA = aReceberPorPessoa(
      recortarRecebiveisCrus(CRUS, { pessoa: "pessoa-a", cartao: null }),
      HOJE,
    );
    expect(daPessoaA).toHaveLength(1);
    expect(daPessoaA[0]).toEqual(todas.find((x) => x.pessoaId === "pessoa-a"));
    expect(daPessoaA[0].pendente).toBe(60);
  });
});

/* ───────────────────────────── SEGUE_O_RECORTE ───────────────────────────── */

const BLOCOS: BlocoDoRelatorio[] = [
  "saldo", "entradas", "saidas", "terceiros", "pendente", "setas", "barras", "mesAMes",
  "rosca", "formas", "ancora", "maiores", "assinaturas", "projecao", "faturasFuturas",
];
const TIPOS: TipoDeRecorte[] = ["conta", "cartao", "pessoa", "categoria"];

describe("SEGUE_O_RECORTE", () => {
  it("tem as 15 × 4 células, e nenhuma a mais", () => {
    expect(Object.keys(SEGUE_O_RECORTE).sort()).toEqual([...BLOCOS].sort());
    for (const bloco of BLOCOS) {
      expect(Object.keys(SEGUE_O_RECORTE[bloco]).sort()).toEqual([...TIPOS].sort());
    }
  });

  it("toda célula é `true` ou um motivo não vazio, e o motivo passa no vocabulário proibido", () => {
    for (const bloco of BLOCOS) {
      for (const tipo of TIPOS) {
        const celula = SEGUE_O_RECORTE[bloco][tipo];
        if (celula === true) continue;
        expect(celula.motivo.trim().length, `${bloco}.${tipo}`).toBeGreaterThan(0);
        expect(termosProibidosEm(celula.motivo), `${bloco}.${tipo}`).toEqual([]);
      }
    }
  });

  it("spot-checks da §5: rosca.categoria, pendente.conta e saidas.pessoa são ✗", () => {
    expect(SEGUE_O_RECORTE.rosca.categoria).not.toBe(true);
    expect(SEGUE_O_RECORTE.pendente.conta).not.toBe(true);
    expect(SEGUE_O_RECORTE.saidas.pessoa).not.toBe(true);
  });

  it("spot-checks da §5: faturasFuturas.cartao e formas.categoria são ✓", () => {
    expect(SEGUE_O_RECORTE.faturasFuturas.cartao).toBe(true);
    expect(SEGUE_O_RECORTE.formas.categoria).toBe(true);
  });

  it("a pessoa só alcança o pendente (L5) e a projeção nunca segue (L1)", () => {
    for (const bloco of BLOCOS) {
      expect(SEGUE_O_RECORTE[bloco].pessoa === true, bloco).toBe(bloco === "pendente");
      expect(SEGUE_O_RECORTE[bloco].categoria === true, bloco).toBe(
        ["entradas", "saidas", "terceiros", "formas", "maiores", "assinaturas"].includes(bloco),
      );
    }
    for (const tipo of TIPOS) expect(SEGUE_O_RECORTE.projecao[tipo]).not.toBe(true);
  });
});

/** Os blocos que, na base caixa, vêm da leitura do caixa (`estadoDoCaixa`) — e não se recortam (D-A2-6). */
const BLOCOS_DO_CAIXA = [
  "entradas",
  "saidas",
  "terceiros",
  "setas",
  "barras",
  "mesAMes",
  "rosca",
  "formas",
  "ancora",
  "maiores",
] as const;

describe("naoSegue", () => {
  it("sem recorte, null (nas duas bases)", () => {
    for (const bloco of BLOCOS) {
      expect(naoSegue(bloco, SEM_RECORTE, "competencia")).toBeNull();
      expect(naoSegue(bloco, SEM_RECORTE, "caixa")).toBeNull();
    }
  });

  it("na base caixa, qualquer recorte ativo é ✗ — mesmo onde a competência seguiria", () => {
    expect(SEGUE_O_RECORTE.saidas.cartao).toBe(true);
    const r: Recorte = { ...SEM_RECORTE, cartao: "cartao-a" };
    expect(naoSegue("saidas", r, "competencia")).toBeNull();
    const caixa = naoSegue("saidas", r, "caixa");
    expect(caixa?.tipo).toBe("cartao");
    expect(caixa?.motivo).toContain("caixa");
    for (const bloco of BLOCOS_DO_CAIXA) {
      expect(naoSegue(bloco, { ...SEM_RECORTE, pessoa: "pessoa-a" }, "caixa")).not.toBeNull();
    }
  });

  it("R6: na base caixa só os blocos que vêm da leitura do caixa deixam de seguir", () => {
    const conta: Recorte = { ...SEM_RECORTE, conta: "conta-b" };
    expect(naoSegue("saldo", conta, "caixa")).toBeNull();
    expect(naoSegue("rosca", conta, "caixa")).not.toBeNull();
    expect(naoSegue("rosca", conta, "caixa")?.motivo).toContain("caixa");
    // Os cinco que NÃO vêm do caixa seguem a matriz da competência, bloco a bloco e recorte a recorte.
    for (const bloco of ["saldo", "pendente", "assinaturas", "projecao", "faturasFuturas"] as const) {
      for (const tipo of TIPOS) {
        const r: Recorte = { ...SEM_RECORTE, [tipo]: "x" };
        expect(naoSegue(bloco, r, "caixa"), `${bloco} · ${tipo}`).toEqual(naoSegue(bloco, r, "competencia"));
      }
    }
    // E os que vêm do caixa são ✗ com qualquer recorte, com o motivo da base.
    for (const bloco of BLOCOS_DO_CAIXA) {
      for (const tipo of TIPOS) {
        expect(naoSegue(bloco, { ...SEM_RECORTE, [tipo]: "x" }, "caixa")?.motivo, `${bloco} · ${tipo}`).toContain(
          "caixa",
        );
      }
    }
  });

  it("devolve o tipo e o motivo da célula ✗", () => {
    const r: Recorte = { ...SEM_RECORTE, conta: "conta-b" };
    const celula = SEGUE_O_RECORTE.pendente.conta;
    expect(celula).not.toBe(true);
    expect(naoSegue("pendente", r, "competencia")).toEqual({
      tipo: "conta",
      motivo: celula === true ? "" : celula.motivo,
    });
  });

  it("combinação de recortes: basta UM ✗ entre os ativos (D-A2-2)", () => {
    // Cartão segue as saídas; a pessoa não → "não segue" é o da pessoa.
    expect(
      naoSegue("saidas", { ...SEM_RECORTE, cartao: "cartao-a", pessoa: "pessoa-a" }, "competencia")?.tipo,
    ).toBe("pessoa");
    // Cartão + categoria: as entradas do cartão não existem, e a categoria não as faz voltar.
    expect(
      naoSegue("entradas", { ...SEM_RECORTE, cartao: "cartao-a", categoria: CAT_A.id }, "competencia")?.tipo,
    ).toBe("cartao");
    // Cartão + categoria nas saídas: os dois seguem.
    expect(
      naoSegue("saidas", { ...SEM_RECORTE, cartao: "cartao-a", categoria: CAT_A.id }, "competencia"),
    ).toBeNull();
  });
});

/* ───────────────────────────── O arquivo não soma nada ───────────────────────────── */

describe("recorte.ts não calcula", () => {
  const fonte = readFileSync(path.resolve(__dirname, "recorte.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  it("nenhuma soma, nenhum relógio", () => {
    expect(fonte).not.toMatch(/\.reduce\(/);
    expect(fonte).not.toMatch(/\+=|-=/);
    expect(fonte).not.toMatch(/Date\.now|new Date\(/);
  });
});
