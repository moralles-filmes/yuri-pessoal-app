/**
 * REDESIGN-03-D · A1 — as regras puras do recebimento parcial. Fixture sintética.
 */
import { describe, expect, it } from "vitest";
import {
  anexarRecebimentos,
  emAberto,
  entradasDoRecebivel,
  entradasManuaisDoRecebivel,
  estadoDoRecebivel,
  fraseDoPerdoado,
  parteDoTerceiroCentavos,
  pendenteDoPeriodo,
  perdoadoCentavos,
  perdoadoNoPeriodo,
  recebidoCentavos,
  reembolsosRecebidosNoPeriodo,
  resumirRecebivel,
  rotuloPendenteDoMes,
  rotuloTotalPendenteAte,
  saldoCentavos,
  secoesDaLista,
  somaDaParteDosTerceiros,
  somaDoPerdoado,
  totalPendenteAte,
  ultimoRecebimento,
  dataDoUltimoRecebimento,
  montarEstadoDoReembolso,
  partesDasReceitasVinculadas,
  recebidoDaPessoaNoPeriodo,
  recebimentoDesfazivel,
  resumoDaPessoa,
  type EstadoDoRecebivel,
  type LinhaDeReceitaVinculada,
  type RecebivelComRecebimentos,
} from "@/lib/finance/recebimentos";
import { aReceberPorPessoa } from "@/lib/finance/painel";
import { reaisParaCentavos } from "@/lib/format";

const rec = (
  sobre: Partial<RecebivelComRecebimentos> = {},
): RecebivelComRecebimentos & { ref_month?: string | null } => ({
  valor: 600,
  status: "pendente",
  pago_em: null,
  recebimentos: [],
  ...sobre,
});

describe("K0 — entradasDoRecebivel é o único lugar que conhece o legado", () => {
  it("pago SEM recebimento conta como UMA entrada do valor inteiro em pago_em", () => {
    expect(entradasDoRecebivel(rec({ status: "pago", pago_em: "2026-06-10" }), [])).toEqual([
      { centavos: 60000, data: "2026-06-10", origem: "legado" },
    ]);
  });

  it("pago COM recebimento conta SÓ pelos recebimentos — nunca pelos dois caminhos", () => {
    const r = rec({ status: "pago", pago_em: "2026-06-20" });
    const entradas = entradasDoRecebivel(r, [
      { valor: 250, recebido_em: "2026-06-05" },
      { valor: 350, recebido_em: "2026-06-20" },
    ]);
    expect(entradas).toEqual([
      { centavos: 25000, data: "2026-06-05", origem: "recebimento" },
      { centavos: 35000, data: "2026-06-20", origem: "recebimento" },
    ]);
    expect(entradas.some((e) => e.origem === "legado")).toBe(false);
  });

  it("pendente sem recebimento não tem entrada", () => {
    expect(entradasDoRecebivel(rec(), [])).toEqual([]);
  });

  it("legado sem pago_em zera o saldo mas não tem data", () => {
    expect(entradasDoRecebivel(rec({ status: "pago", pago_em: null }), [])).toEqual([
      { centavos: 60000, data: null, origem: "legado" },
    ]);
  });
});

describe("saldo e recebido", () => {
  it("600 − 250 = 350", () => {
    const r = resumirRecebivel(rec({ recebimentos: [{ valor: 250, recebido_em: "2026-06-05" }] }));
    expect(r.recebido).toBe(250);
    expect(saldoCentavos(r)).toBe(35000);
  });

  it("recebido AUSENTE com status pago é legado: saldo zero (K0 sobre lista vazia)", () => {
    expect(recebidoCentavos({ valor: 30.3, status: "pago" })).toBe(3030);
    expect(saldoCentavos({ valor: 30.3, status: "pago" })).toBe(0);
  });

  it("recebido AUSENTE com status pendente: saldo é o valor", () => {
    expect(saldoCentavos({ valor: 600, status: "pendente" })).toBe(60000);
  });

  it("não trunca em zero (a caracterização tem fixture negativa)", () => {
    expect(saldoCentavos({ valor: -10, status: "pendente" })).toBe(-1000);
  });
});

describe("estadoDoRecebivel — a soma manda (K1)", () => {
  const casos: Array<[string, Parameters<typeof estadoDoRecebivel>[0], EstadoDoRecebivel]> = [
    ["status fora da lista", { valor: 100, status: "parcial" }, "desconhecido"],
    ["ignorado", { valor: 100, status: "ignorado", recebido: 40 }, "ignorado"],
    ["soma fechada com coluna pendente", { valor: 100, status: "pendente", recebido: 100 }, "pago"],
    ["legado pago", { valor: 100, status: "pago" }, "pago"],
    ["pago de valor zero", { valor: 0, status: "pago" }, "pago"],
    ["coluna pago com recebimento parcial", { valor: 100, status: "pago", recebido: 40 }, "parcial"],
    ["pendente com recebimento parcial", { valor: 100, status: "pendente", recebido: 40 }, "parcial"],
    ["cobrado sem recebimento", { valor: 100, status: "cobrado" }, "cobrado"],
    ["pendente sem recebimento", { valor: 100, status: "pendente" }, "pendente"],
    ["coluna pago sem NADA recebido até o corte", { valor: 100, status: "pago", recebido: 0 }, "pendente"],
    ["valor zero pendente", { valor: 0, status: "pendente" }, "pendente"],
  ];
  it.each(casos)("%s", (_nome, r, esperado) => {
    expect(estadoDoRecebivel(r)).toBe(esperado);
  });

  it("em aberto = pendente, parcial ou cobrado", () => {
    expect(emAberto({ valor: 100, status: "pendente", recebido: 40 })).toBe(true);
    expect(emAberto({ valor: 100, status: "cobrado" })).toBe(true);
    expect(emAberto({ valor: 100, status: "pago" })).toBe(false);
    expect(emAberto({ valor: 100, status: "ignorado" })).toBe(false);
    expect(emAberto({ valor: 100, status: "inventado" })).toBe(false);
  });
});

describe("D3 e K3-a — parte do terceiro e perdoado", () => {
  it("somas por lista: parte dos terceiros e perdoado (B1b)", () => {
    const lista = [
      rec({ valor: 600, status: "ignorado", recebimentos: [{ valor: 250, recebido_em: "2026-06-05" }] }),
      rec({ valor: 100, status: "pago", pago_em: "2026-06-01" }),
    ];
    expect(somaDaParteDosTerceiros(lista)).toBe(350);
    expect(somaDoPerdoado(lista)).toBe(350);
  });

  it.each(["pendente", "cobrado", "pago", "inventado"])(
    "%s com recebimento parcial: a parte do terceiro é o VALOR, nunca o saldo (D3)",
    (status) => {
      expect(parteDoTerceiroCentavos({ valor: 600, status, recebido: 250 })).toBe(60000);
    },
  );

  it("ignorado: a parte do terceiro é o que ele chegou a pagar (K3-a)", () => {
    expect(parteDoTerceiroCentavos({ valor: 600, status: "ignorado", recebido: 250 })).toBe(25000);
    expect(parteDoTerceiroCentavos({ valor: 600, status: "ignorado" })).toBe(0);
  });

  it("perdoado = saldo do ignorado; 0 nos outros", () => {
    expect(perdoadoCentavos({ valor: 600, status: "ignorado", recebido: 250 })).toBe(35000);
    expect(perdoadoCentavos({ valor: 600, status: "ignorado" })).toBe(60000);
    expect(perdoadoCentavos({ valor: 600, status: "pendente", recebido: 250 })).toBe(0);
  });

  it("parte do terceiro + perdoado = valor, sempre", () => {
    for (const status of ["pendente", "cobrado", "pago", "ignorado"]) {
      const r = { valor: 600, status, recebido: 250 };
      expect(parteDoTerceiroCentavos(r) + perdoadoCentavos(r)).toBe(60000);
    }
  });
});

describe("os três números do §13.4 + Perdoado", () => {
  it("pendente do período: saldo dos em aberto do mês, por ref_month", () => {
    const recs = [
      { valor: 600, status: "pendente", recebido: 250, ref_month: "2026-06" },
      { valor: 100, status: "cobrado", ref_month: "2026-06" },
      { valor: 999, status: "pago", ref_month: "2026-06" },
      { valor: 999, status: "ignorado", ref_month: "2026-06" },
      { valor: 70, status: "pendente", ref_month: "2026-07" },
    ];
    expect(pendenteDoPeriodo(recs, "2026-06")).toBe(450);
    expect(pendenteDoPeriodo(recs)).toBe(520);
  });

  it("reembolsos recebidos: pela DATA do recebimento, nunca por ref_month", () => {
    const itens = [
      { ...rec({ recebimentos: [{ valor: 250, recebido_em: "2026-06-05" }, { valor: 350, recebido_em: "2026-07-20" }] }), ref_month: "2026-05" },
      { ...rec({ valor: 100, status: "pago", pago_em: "2026-06-10" }), ref_month: "2026-01" },
    ];
    expect(reembolsosRecebidosNoPeriodo(itens, { de: "2026-06-01", ate: "2026-06-31" })).toBe(350);
    expect(reembolsosRecebidosNoPeriodo(itens, { de: "2026-07-01", ate: "2026-07-31" })).toBe(350);
    expect(reembolsosRecebidosNoPeriodo(itens, { de: "2026-05-01", ate: "2026-05-31" })).toBe(0);
  });

  it("total pendente até o corte: recebimento DEPOIS do corte não reduz o saldo", () => {
    const itens = [
      rec({ recebimentos: [{ valor: 250, recebido_em: "2026-06-05" }, { valor: 350, recebido_em: "2026-07-20" }] }),
    ];
    expect(totalPendenteAte(itens, "2026-06-30")).toBe(350);
    expect(totalPendenteAte(itens, "2026-07-20")).toBe(0);
    expect(totalPendenteAte(itens, "2026-06-01")).toBe(600);
  });

  it("legado pago DEPOIS do corte conta como pendente no corte", () => {
    const itens = [rec({ valor: 100, status: "pago", pago_em: "2026-06-10" })];
    expect(totalPendenteAte(itens, "2026-06-09")).toBe(100);
    expect(totalPendenteAte(itens, "2026-06-10")).toBe(0);
  });

  it("com o corte = hoje e nenhuma data no futuro, é igual ao pendente sem mês (equivalência)", () => {
    const itens = [
      rec({ recebimentos: [{ valor: 250, recebido_em: "2026-06-05" }] }),
      rec({ valor: 100, status: "cobrado" }),
      rec({ valor: 80, status: "pago", pago_em: "2026-06-01" }),
      rec({ valor: 40, status: "ignorado" }),
    ];
    expect(totalPendenteAte(itens, "2026-06-30")).toBe(pendenteDoPeriodo(itens.map(resumirRecebivel)));
  });

  it("perdoado no período: saldo dos ignorados do mês", () => {
    const recs = [
      { valor: 600, status: "ignorado", recebido: 250, ref_month: "2026-06" },
      { valor: 100, status: "ignorado", ref_month: "2026-07" },
      { valor: 999, status: "pendente", ref_month: "2026-06" },
    ];
    expect(perdoadoNoPeriodo(recs, "2026-06")).toBe(350);
  });
});

describe("B3 — reembolsos recebidos no mês (§6.4)", () => {
  it("soma recebimentos pela data e o legado K0: junho 350 e julho 350", () => {
    const itens = [
      rec({
        valor: 600,
        status: "pago",
        pago_em: "2026-07-20",
        recebimentos: [
          { valor: 250, recebido_em: "2026-06-05" },
          { valor: 350, recebido_em: "2026-07-20" },
        ],
      }),
      rec({ valor: 100, status: "pago", pago_em: "2026-06-10", recebimentos: [] }),
    ];
    expect(reembolsosRecebidosNoPeriodo(itens, { de: "2026-06-01", ate: "2026-06-31" })).toBe(350);
    expect(reembolsosRecebidosNoPeriodo(itens, { de: "2026-07-01", ate: "2026-07-31" })).toBe(350);
  });

  it("só legados preservam a conta antiga em cada mês", () => {
    const itens = [
      rec({ valor: 100, status: "pago", pago_em: "2026-05-31", recebimentos: [] }),
      rec({ valor: 200, status: "pago", pago_em: "2026-06-01", recebimentos: [] }),
      rec({ valor: 50, status: "pago", pago_em: "2026-06-30", recebimentos: [] }),
      rec({ valor: 350, status: "pago", pago_em: "2026-07-20", recebimentos: [] }),
      rec({ valor: 80, status: "pendente", recebimentos: [] }),
      rec({ valor: 90, status: "ignorado", recebimentos: [] }),
    ];
    for (const mes of ["2026-05", "2026-06", "2026-07", "2026-08"]) {
      const contaAntiga = itens
        .filter((r) => r.status === "pago" && r.pago_em?.slice(0, 7) === mes)
        .reduce((s, r) => s + Number(r.valor), 0);
      expect(reembolsosRecebidosNoPeriodo(itens, { de: `${mes}-01`, ate: `${mes}-31` })).toBe(contaAntiga);
    }
  });
});

describe("04-C — reembolsosRecebidosNoPeriodo { somenteManuais }", () => {
  const JUNHO = { de: "2026-06-01", ate: "2026-06-30" };

  it("sem a opção, as alocações automáticas contam como sempre (comportamento idêntico)", () => {
    const itens = [
      rec({
        valor: 500,
        status: "pago",
        pago_em: "2026-06-10",
        recebimentos: [{ valor: 500, recebido_em: "2026-06-10", transaction_id: "t-rec" }],
      }),
    ];
    expect(reembolsosRecebidosNoPeriodo(itens, JUNHO)).toBe(500);
    expect(reembolsosRecebidosNoPeriodo(itens, JUNHO, {})).toBe(500);
  });

  it("com somenteManuais, a alocação automática é ignorada e a manual conta", () => {
    const itens = [
      rec({
        valor: 600,
        status: "pago",
        pago_em: "2026-06-10",
        recebimentos: [
          { valor: 100, recebido_em: "2026-06-05" },
          { valor: 500, recebido_em: "2026-06-10", transaction_id: "t-rec" },
        ],
      }),
    ];
    expect(reembolsosRecebidosNoPeriodo(itens, JUNHO, { somenteManuais: true })).toBe(100);
  });

  it("recebível só com alocação automática e status pago NÃO vira legado K0", () => {
    const itens = [
      rec({
        valor: 500,
        status: "pago",
        pago_em: "2026-06-10",
        recebimentos: [{ valor: 500, recebido_em: "2026-06-10", transaction_id: "t-rec" }],
      }),
    ];
    expect(reembolsosRecebidosNoPeriodo(itens, JUNHO, { somenteManuais: true })).toBe(0);
  });

  it("o legado K0 (pago sem nenhum recebimento) continua contando", () => {
    const itens = [rec({ valor: 100, status: "pago", pago_em: "2026-06-10", recebimentos: [] })];
    expect(reembolsosRecebidosNoPeriodo(itens, JUNHO, { somenteManuais: true })).toBe(100);
  });

  it("entradasManuaisDoRecebivel: só as manuais; vazio quando só há automáticas", () => {
    const soAuto = rec({
      valor: 500,
      status: "pago",
      pago_em: "2026-06-10",
      recebimentos: [{ valor: 500, recebido_em: "2026-06-10", transaction_id: "t-rec" }],
    });
    expect(entradasManuaisDoRecebivel(soAuto)).toEqual([]);
    const mista = rec({
      recebimentos: [
        { valor: 100, recebido_em: "2026-06-05" },
        { valor: 50, recebido_em: "2026-06-06", transaction_id: "t-rec" },
      ],
    });
    expect(entradasManuaisDoRecebivel(mista)).toEqual([
      { centavos: 10000, data: "2026-06-05", origem: "recebimento" },
    ]);
  });
});

describe("apoios", () => {
  it("anexarRecebimentos junta por receivable_id e dá [] a quem não tem", () => {
    const juntos = anexarRecebimentos(
      [{ id: "a" }, { id: "b" }],
      [{ receivable_id: "a", valor: 1, recebido_em: "2026-06-01" }],
    );
    expect(juntos.map((r) => r.recebimentos.length)).toEqual([1, 0]);
  });

  it("ultimoRecebimento: o último REGISTRADO, mesmo com data retroativa (RR-D-19); empate cai para a data", () => {
    const x = [
      { id: "r1", recebido_em: "2026-06-20", created_at: "2026-06-20T10:00:00Z" },
      { id: "r2", recebido_em: "2026-06-05", created_at: "2026-06-30T09:00:00Z" },
    ];
    expect(ultimoRecebimento(x)?.id).toBe("r2");
    const empate = [
      { id: "r3", recebido_em: "2026-06-20", created_at: "2026-06-30T09:00:00Z" },
      { id: "r4", recebido_em: "2026-06-05", created_at: "2026-06-30T09:00:00Z" },
    ];
    expect(ultimoRecebimento(empate)?.id).toBe("r3");
    expect(ultimoRecebimento([{ id: "r5", recebido_em: "2026-06-01" }, { id: "r6", recebido_em: "2026-06-09" }])?.id).toBe("r6");
    expect(ultimoRecebimento([])).toBeNull();
  });

  it("dataDoUltimoRecebimento: a data mais recente, não a do último registrado", () => {
    expect(dataDoUltimoRecebimento([{ recebido_em: "2026-06-20" }, { recebido_em: "2026-06-05" }])).toBe("2026-06-20");
    expect(dataDoUltimoRecebimento([])).toBeNull();
  });

  it("secoesDaLista: ignorado vai para 'Não será cobrado' e NENHUM item some", () => {
    const estados: EstadoDoRecebivel[] = ["pendente", "ignorado", "pago", "parcial", "cobrado", "desconhecido"];
    const s = secoesDaLista(estados, (e) => e);
    expect(s.emAberto).toEqual(["pendente", "parcial", "cobrado"]);
    expect(s.naoSeraCobrado).toEqual(["ignorado"]);
    expect(s.historico).toEqual(["pago", "desconhecido"]);
    expect(s.emAberto.length + s.naoSeraCobrado.length + s.historico.length).toBe(estados.length);
  });

  it("rótulos", () => {
    expect(rotuloPendenteDoMes("2026-06")).toBe("Pendente referente a junho de 2026");
    expect(rotuloTotalPendenteAte("2026-10-11")).toBe("Total pendente até 11/10");
  });

  it("frase do perdoado só existe quando há perdoado", () => {
    expect(fraseDoPerdoado(0)).toBeNull();
    expect(fraseDoPerdoado(-1)).toBeNull();
    expect(fraseDoPerdoado(600)).toContain("600,00");
    expect(fraseDoPerdoado(600)).toContain("que você decidiu não cobrar");
  });
});

// ───────────────────────────── 04-C · T8 — Terceiros por pessoa ─────────────────────────────

describe("04-C T8 — resumoDaPessoa (caso 2 do desenho §6)", () => {
  // Quatro linhas de 500; a pessoa pagou 700: a mais antiga fica coberta por inteiro (500) e a
  // segunda fica coberta em 200. A coluna `status` NÃO muda (o motor nunca a grava).
  const linhas = [
    rec({ valor: 500, recebimentos: [{ valor: 500, recebido_em: "2026-11-01", transaction_id: "t-pag" }] }),
    rec({ valor: 500, recebimentos: [{ valor: 200, recebido_em: "2026-11-01", transaction_id: "t-pag" }] }),
    rec({ valor: 500 }),
    rec({ valor: 500, status: "cobrado" }),
  ];

  it("devido = Σ dos saldos em aberto (1.300), 3 em aberto, 1 pago", () => {
    expect(resumoDaPessoa(linhas, 0)).toEqual({
      devidoCentavos: 130000,
      saldoAFavorCentavos: 0,
      emAberto: 3,
      pagos: 1,
    });
  });

  it("'Não será cobrado' não entra no devido nem nos pagos", () => {
    const r = resumoDaPessoa([...linhas, rec({ valor: 900, status: "ignorado" })], 0);
    expect(r.devidoCentavos).toBe(130000);
    expect(r.emAberto).toBe(3);
    expect(r.pagos).toBe(1);
  });

  it("o legado K0 (pago sem recebimento) conta como pago e não deve nada", () => {
    const r = resumoDaPessoa([rec({ valor: 300, status: "pago", pago_em: "2026-05-02" })], 0);
    expect(r).toEqual({ devidoCentavos: 0, saldoAFavorCentavos: 0, emAberto: 0, pagos: 1 });
  });

  it("o saldo a favor só aparece sem dívida (nunca coexistem)", () => {
    expect(resumoDaPessoa(linhas, 50000).saldoAFavorCentavos).toBe(0);
    expect(resumoDaPessoa([], 50000)).toEqual({
      devidoCentavos: 0,
      saldoAFavorCentavos: 50000,
      emAberto: 0,
      pagos: 0,
    });
  });

  it("o devido usa o SALDO e não o valor (a segunda linha, coberta em 200, entra com 300)", () => {
    expect(resumoDaPessoa(linhas.slice(1, 2), 0).devidoCentavos).toBe(30000);
  });

  it("pessoa sem nada: tudo zero", () => {
    expect(resumoDaPessoa([], 0)).toEqual({ devidoCentavos: 0, saldoAFavorCentavos: 0, emAberto: 0, pagos: 0 });
  });
});

describe("04-C T8 — recebidoDaPessoaNoPeriodo", () => {
  const NOVEMBRO = { de: "2026-11-01", ate: "2026-11-30" };

  it("conta o pagamento INTEIRO da receita vinculada, inclusive os 500 que viraram saldo a favor", () => {
    expect(
      recebidoDaPessoaNoPeriodo({
        entradasManuais: [],
        partesDasReceitasVinculadas: [{ centavos: 250000, data: "2026-11-10" }],
        periodo: NOVEMBRO,
      }),
    ).toBe(250000);
  });

  it("soma manuais e vinculadas, só dentro do período (limites inclusivos) e ignora data nula", () => {
    expect(
      recebidoDaPessoaNoPeriodo({
        entradasManuais: [
          { centavos: 10000, data: "2026-11-01" },
          { centavos: 20000, data: "2026-11-30" },
          { centavos: 40000, data: "2026-10-31" },
          { centavos: 80000, data: null },
        ],
        partesDasReceitasVinculadas: [
          { centavos: 1000, data: "2026-12-01" },
          { centavos: 3000, data: "2026-11-15" },
        ],
        periodo: NOVEMBRO,
      }),
    ).toBe(33000);
  });

  it("sem nada, zero", () => {
    expect(
      recebidoDaPessoaNoPeriodo({ entradasManuais: [], partesDasReceitasVinculadas: [], periodo: NOVEMBRO }),
    ).toBe(0);
  });
});

describe("04-C T8 — partesDasReceitasVinculadas", () => {
  const receita = (extra: Partial<LinhaDeReceitaVinculada> = {}): LinhaDeReceitaVinculada => ({
    id: "t-1",
    type: "receita",
    status: "recebido",
    amount: 700,
    valor_pessoal: null,
    account_id: "conta-1",
    liquidado_em: "2026-11-03",
    competence_date: "2026-11-01",
    created_at: "2026-11-03T12:00:00Z",
    ...extra,
  });

  it("a parte é amount − valor_pessoal, na data de liquidação (ou competência)", () => {
    expect(partesDasReceitasVinculadas([receita({ amount: 700, valor_pessoal: 200 })])).toEqual([
      { transactionId: "t-1", centavos: 50000, data: "2026-11-03", contaId: "conta-1" },
    ]);
    expect(partesDasReceitasVinculadas([receita({ liquidado_em: null })])[0].data).toBe("2026-11-01");
  });

  it("pendente, outro tipo e parte zero ficam de fora", () => {
    expect(
      partesDasReceitasVinculadas([
        receita({ id: "a", status: "pendente" }),
        receita({ id: "b", type: "despesa" }),
        receita({ id: "c", amount: 300, valor_pessoal: 300 }),
      ]),
    ).toEqual([]);
  });

  it("é a MESMA conta de montarEstadoDoReembolso (pagamentos)", () => {
    const receitas = [receita({ id: "a", amount: 700, valor_pessoal: 100 }), receita({ id: "b", amount: 90 })];
    const estado = montarEstadoDoReembolso({ receitas, recebiveis: [], recebimentos: [] });
    expect(partesDasReceitasVinculadas(receitas)).toEqual(
      estado.pagamentos.map((p) => ({
        transactionId: p.transactionId,
        centavos: p.parteCentavos,
        data: p.recebidoEm,
        contaId: p.contaId,
      })),
    );
  });
});

describe("04-C T8 — recebimentoDesfazivel (Desfazer só no manual ou no legado)", () => {
  it("manual: sim", () => {
    expect(recebimentoDesfazivel(rec({ recebimentos: [{ valor: 100, recebido_em: "2026-06-05" }] }))).toBe(true);
  });
  it("mista (manual + automática): sim", () => {
    expect(
      recebimentoDesfazivel(
        rec({
          recebimentos: [
            { valor: 100, recebido_em: "2026-06-05" },
            { valor: 50, recebido_em: "2026-06-06", transaction_id: "t-1" },
          ],
        }),
      ),
    ).toBe(true);
  });
  it("só automática: não (se desfaz editando ou apagando a receita)", () => {
    expect(
      recebimentoDesfazivel(
        rec({ status: "pago", recebimentos: [{ valor: 600, recebido_em: "2026-06-06", transaction_id: "t-1" }] }),
      ),
    ).toBe(false);
  });
  it("legado K0 (pago sem recebimento): sim; pendente sem nada: não", () => {
    expect(recebimentoDesfazivel(rec({ status: "pago", pago_em: "2026-06-01" }))).toBe(true);
    expect(recebimentoDesfazivel(rec())).toBe(false);
  });
});

describe("04-C T8 — RR-D-21: a soma por pessoa da tela é a do Painel", () => {
  const HOJE = "2026-11-06";
  const ana = { id: "p-a", nome: "Pessoa A" };
  const beto = { id: "p-b", nome: "Pessoa B" };
  const com = (person: typeof ana, extra: Partial<RecebivelComRecebimentos>) => ({
    ...rec(extra),
    person,
  });

  const recs = [
    // A: 4 linhas de 500 (a última é parcela futura), pagou 700 por uma receita vinculada.
    com(ana, { valor: 500, recebimentos: [{ valor: 500, recebido_em: "2026-11-01", transaction_id: "t-1" }] }),
    com(ana, { valor: 500, recebimentos: [{ valor: 200, recebido_em: "2026-11-01", transaction_id: "t-1" }] }),
    com(ana, { valor: 500 }),
    com(ana, { valor: 500, status: "cobrado" }),
    // A: perdoado e legado não pesam.
    com(ana, { valor: 70, status: "ignorado" }),
    com(ana, { valor: 80, status: "pago", pago_em: "2026-05-02" }),
    // B: um recebimento manual parcial, uma linha cheia e uma quitada.
    com(beto, { valor: 300, recebimentos: [{ valor: 120.5, recebido_em: "2026-10-20" }] }),
    com(beto, { valor: 99.99 }),
    com(beto, { valor: 40, recebimentos: [{ valor: 40, recebido_em: "2026-11-02" }] }),
  ];

  it("resumoDaPessoa(recsDaPessoa).devidoCentavos === aReceberPorPessoa(...).pendente, pessoa a pessoa", () => {
    const painel = aReceberPorPessoa(recs, HOJE);
    expect(painel.length).toBe(2);
    for (const linhaDoPainel of painel) {
      const dela = recs.filter((r) => r.person.id === linhaDoPainel.pessoaId);
      expect(resumoDaPessoa(dela, 0).devidoCentavos).toBe(reaisParaCentavos(linhaDoPainel.pendente));
    }
    expect(painel.find((p) => p.pessoaId === ana.id)?.pendente).toBe(1300);
    expect(painel.find((p) => p.pessoaId === beto.id)?.pendente).toBe(279.49);
  });

  it("a soma das fichas é o total pendente do topo da tela", () => {
    const somaDasFichas = [ana, beto]
      .map((p) =>
        resumoDaPessoa(
          recs.filter((r) => r.person.id === p.id),
          0,
        ).devidoCentavos,
      )
      .reduce((a, b) => a + b, 0);
    expect(somaDasFichas).toBe(reaisParaCentavos(totalPendenteAte(recs, HOJE)));
  });
});
