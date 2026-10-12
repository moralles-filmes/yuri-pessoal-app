/**
 * REDESIGN-03-D · A1 — as regras puras do recebimento parcial. Fixture sintética.
 */
import { describe, expect, it } from "vitest";
import {
  anexarRecebimentos,
  emAberto,
  entradasDoRecebivel,
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
  type EstadoDoRecebivel,
  type RecebivelComRecebimentos,
} from "@/lib/finance/recebimentos";

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

describe("apoios", () => {
  it("anexarRecebimentos junta por receivable_id e dá [] a quem não tem", () => {
    const juntos = anexarRecebimentos(
      [{ id: "a" }, { id: "b" }],
      [{ receivable_id: "a", valor: 1, recebido_em: "2026-06-01" }],
    );
    expect(juntos.map((r) => r.recebimentos.length)).toEqual([1, 0]);
  });

  it("ultimoRecebimento: data mais recente; empate desempata por created_at", () => {
    const x = [
      { id: "r1", recebido_em: "2026-06-20", created_at: "2026-06-20T10:00:00Z" },
      { id: "r2", recebido_em: "2026-06-20", created_at: "2026-06-20T11:00:00Z" },
      { id: "r3", recebido_em: "2026-06-05", created_at: "2026-06-30T09:00:00Z" },
    ];
    expect(ultimoRecebimento(x)?.id).toBe("r2");
    expect(ultimoRecebimento([])).toBeNull();
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
