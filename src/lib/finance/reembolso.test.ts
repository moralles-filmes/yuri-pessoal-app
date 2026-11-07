import { describe, expect, it } from "vitest";
import { CASOS_DO_REEMBOLSO } from "@/lib/finance/reembolso-casos";
import {
  aplicarRealocacao,
  decidirReembolso,
  entradaDaPrevia,
  frasesDoReembolso,
  MSG_DIVIDA_MUDOU,
  MSG_ESCOLHA_A_SOBRA,
  MSG_REEMBOLSO_SO_DE_TERCEIRO,
  ordenarDividas,
  previaDoLote,
  previaDoReembolso,
  realocar,
  situacaoDaPessoa,
  type AlocacaoAutomatica,
  type DividaDaPessoa,
  type EstadoDoReembolso,
  type PagamentoDoReembolso,
} from "@/lib/finance/reembolso";

function divida(receivableId: string, valorCentavos: number, dataDaDivida: string, extra: Partial<DividaDaPessoa> = {}): DividaDaPessoa {
  return {
    receivableId,
    valorCentavos,
    status: "pendente",
    recebidoManualCentavos: 0,
    dataDaDivida,
    criadoEm: "2026-06-01T12:00:00Z",
    ...extra,
  };
}

function pagamento(transactionId: string, parteCentavos: number, extra: Partial<PagamentoDoReembolso> = {}): PagamentoDoReembolso {
  return {
    transactionId,
    contaId: "conta-1",
    parteCentavos,
    recebidoEm: "2026-11-01",
    criadoEm: "2026-11-01T10:00:00Z",
    ...extra,
  };
}

/** Soma o alocado a cada dívida depois de aplicar a regra. */
function alocadoPorDivida(estado: EstadoDoReembolso): Record<string, number> {
  const final = aplicarRealocacao(estado, realocar(estado));
  const soma: Record<string, number> = {};
  for (const a of final) soma[a.receivableId] = (soma[a.receivableId] ?? 0) + a.valorCentavos;
  return soma;
}

describe("casos dourados do reembolso", () => {
  it.each(CASOS_DO_REEMBOLSO)("$nome", ({ estado, esperado }) => {
    expect(situacaoDaPessoa(estado)).toEqual({
      devidoCentavos: esperado.devidoCentavos,
      saldoAFavorCentavos: esperado.saldoAFavorCentavos,
    });
    const soma = alocadoPorDivida(estado);
    for (const d of estado.dividas) {
      expect({ [d.receivableId]: soma[d.receivableId] ?? 0 }).toEqual({
        [d.receivableId]: esperado.alocadoPorDivida[d.receivableId] ?? 0,
      });
    }
  });

  it.each(CASOS_DO_REEMBOLSO)("realocar é idempotente · $nome", ({ estado }) => {
    const aplicado: EstadoDoReembolso = { ...estado, alocacoes: aplicarRealocacao(estado, realocar(estado)) };
    expect(realocar(aplicado)).toEqual({ remover: [], reduzir: [], inserir: [] });
  });

  it.each(CASOS_DO_REEMBOLSO)("devido e saldo a favor nunca coexistem · $nome", ({ estado }) => {
    const { devidoCentavos, saldoAFavorCentavos } = situacaoDaPessoa(estado);
    expect(devidoCentavos > 0 && saldoAFavorCentavos > 0).toBe(false);
  });

  it("nenhum caso aloca mais do que a parte de um pagamento nem mais do que o saldo de uma dívida", () => {
    for (const { estado } of CASOS_DO_REEMBOLSO) {
      const final = aplicarRealocacao(estado, realocar(estado));
      for (const p of estado.pagamentos) {
        const alocado = final.filter((a) => a.transactionId === p.transactionId).reduce((s, a) => s + a.valorCentavos, 0);
        expect(alocado).toBeLessThanOrEqual(p.parteCentavos);
      }
      for (const d of estado.dividas) {
        const alocado = final.filter((a) => a.receivableId === d.receivableId).reduce((s, a) => s + a.valorCentavos, 0);
        expect(alocado).toBeLessThanOrEqual(d.valorCentavos - d.recebidoManualCentavos);
      }
    }
  });
});

describe("realocar", () => {
  it("ignorado, legado pago e desconhecido nunca recebem", () => {
    const estado: EstadoDoReembolso = {
      pagamentos: [pagamento("p1", 100000)],
      dividas: [
        divida("a", 50000, "2026-07-10", { status: "ignorado" }),
        divida("b", 50000, "2026-07-11", { status: "pago", recebidoManualCentavos: 50000 }),
        // `pago` sem recebimento (estado incoerente): a COLUNA status basta para ficar de fora.
        divida("c", 50000, "2026-07-12", { status: "pago" }),
        divida("d", 50000, "2026-07-13", { status: "desconhecido" }),
        divida("e", 50000, "2026-08-10"),
      ],
      alocacoes: [],
    };
    expect(realocar(estado).inserir.map((n) => n.receivableId)).toEqual(["e"]);
    expect(situacaoDaPessoa(estado)).toEqual({ devidoCentavos: 0, saldoAFavorCentavos: 50000 });
  });

  it("cobrado recebe", () => {
    const estado: EstadoDoReembolso = {
      pagamentos: [pagamento("p1", 30000)],
      dividas: [divida("a", 50000, "2026-07-10", { status: "cobrado" })],
      alocacoes: [],
    };
    expect(realocar(estado).inserir).toEqual([
      { receivableId: "a", transactionId: "p1", valorCentavos: 30000, recebidoEm: "2026-11-01", contaId: "conta-1" },
    ]);
  });

  it("aparar começa pela alocação mais nova (caso 7)", () => {
    const caso = CASOS_DO_REEMBOLSO.find((c) => c.nome.startsWith("7 "));
    expect(caso).toBeDefined();
    const r = realocar(caso!.estado);
    // 70000 → 40000: 30000 a desfazer. A de `b` (20000, mais nova) some inteira; a de `a` perde 10000.
    expect(r.remover).toEqual(["al2"]);
    expect(r.reduzir).toEqual([{ id: "al1", valorCentavos: 40000 }]);
    expect(r.inserir).toEqual([]);
  });

  it("aparar desempata alocações do mesmo instante pelo id maior primeiro", () => {
    const estado: EstadoDoReembolso = {
      pagamentos: [pagamento("p1", 30000)],
      dividas: [divida("a", 50000, "2026-07-10"), divida("b", 50000, "2026-08-10")],
      alocacoes: [
        { id: "x1", receivableId: "a", transactionId: "p1", valorCentavos: 20000, recebidoEm: "2026-11-01", criadoEm: "2026-11-01T10:00:00Z" },
        { id: "x2", receivableId: "b", transactionId: "p1", valorCentavos: 20000, recebidoEm: "2026-11-01", criadoEm: "2026-11-01T10:00:00Z" },
      ],
    };
    const r = realocar(estado);
    expect(r.reduzir).toEqual([{ id: "x2", valorCentavos: 10000 }]);
    expect(r.remover).toEqual([]);
  });

  it("alocação de pagamento que não existe mais é removida (passo 1)", () => {
    const estado: EstadoDoReembolso = {
      pagamentos: [],
      dividas: [divida("a", 50000, "2026-07-10")],
      alocacoes: [{ id: "x1", receivableId: "a", transactionId: "p-sumiu", valorCentavos: 50000, recebidoEm: "2026-11-01", criadoEm: "2026-11-01T10:00:00Z" }],
    };
    expect(realocar(estado)).toEqual({ remover: ["x1"], reduzir: [], inserir: [] });
  });

  it("alocação num recebível que não é mais desta pessoa é removida, e o dinheiro volta a correr (passo 1, igual ao SQL)", () => {
    const estado: EstadoDoReembolso = {
      pagamentos: [pagamento("p1", 50000)],
      dividas: [divida("a", 50000, "2026-07-10")],
      alocacoes: [{ id: "x1", receivableId: "outra", transactionId: "p1", valorCentavos: 30000, recebidoEm: "2026-11-01", criadoEm: "2026-11-01T10:00:00Z" }],
    };
    const r = realocar(estado);
    expect(r.remover).toEqual(["x1"]);
    expect(r.inserir.map((n) => [n.receivableId, n.valorCentavos])).toEqual([["a", 50000]]);
  });

  it("a alocação leva a data e a conta do PAGAMENTO, não a de hoje (caso 5)", () => {
    const caso = CASOS_DO_REEMBOLSO.find((c) => c.nome.startsWith("5 "));
    const r = realocar(caso!.estado);
    expect(r.inserir).toEqual([
      { receivableId: "a", transactionId: "p1", valorCentavos: 30000, recebidoEm: "2026-10-20", contaId: "conta-1" },
    ]);
  });

  it("pagamentos correm em ordem de recebidoEm, criadoEm e transactionId", () => {
    const estado: EstadoDoReembolso = {
      pagamentos: [
        pagamento("p3", 10000, { recebidoEm: "2026-11-02" }),
        pagamento("p2", 10000, { recebidoEm: "2026-11-01", criadoEm: "2026-11-01T11:00:00Z" }),
        pagamento("p1", 10000, { recebidoEm: "2026-11-01", criadoEm: "2026-11-01T10:00:00Z" }),
        pagamento("p0", 10000, { recebidoEm: "2026-11-01", criadoEm: "2026-11-01T10:00:00Z" }),
      ],
      dividas: [divida("a", 25000, "2026-07-10"), divida("b", 25000, "2026-08-10")],
      alocacoes: [],
    };
    expect(realocar(estado).inserir.map((n) => [n.transactionId, n.receivableId, n.valorCentavos])).toEqual([
      ["p0", "a", 10000],
      ["p1", "a", 10000],
      ["p2", "a", 5000],
      ["p2", "b", 5000],
      ["p3", "b", 10000],
    ]);
  });

  it("alocação existente nunca é movida para abrir espaço a dívida mais antiga (passo 6)", () => {
    const caso = CASOS_DO_REEMBOLSO.find((c) => c.nome.startsWith("16 "));
    expect(realocar(caso!.estado)).toEqual({ remover: [], reduzir: [], inserir: [] });
  });

  it("o que o recebimento manual já abateu sai do saldo da dívida", () => {
    const estado: EstadoDoReembolso = {
      pagamentos: [pagamento("p1", 100000)],
      dividas: [divida("a", 50000, "2026-07-10", { recebidoManualCentavos: 50000 })],
      alocacoes: [],
    };
    expect(realocar(estado).inserir).toEqual([]);
    expect(situacaoDaPessoa(estado)).toEqual({ devidoCentavos: 0, saldoAFavorCentavos: 100000 });
  });
});

describe("ordenarDividas", () => {
  it("ordena por dataDaDivida, depois criadoEm, depois receivableId, sem mexer na entrada", () => {
    const entrada = [
      divida("z", 1, "2026-08-10"),
      divida("b", 1, "2026-07-10", { criadoEm: "2026-06-02T12:00:00Z" }),
      divida("c", 1, "2026-07-10", { criadoEm: "2026-06-01T12:00:00Z" }),
      divida("a", 1, "2026-07-10", { criadoEm: "2026-06-01T12:00:00Z" }),
    ];
    const copia = [...entrada];
    expect(ordenarDividas(entrada).map((d) => d.receivableId)).toEqual(["a", "c", "b", "z"]);
    expect(entrada).toEqual(copia);
  });
});

describe("aplicarRealocacao", () => {
  it("as inseridas ganham id determinístico e ficam como as mais novas", () => {
    const estado: EstadoDoReembolso = {
      pagamentos: [pagamento("p1", 70000)],
      dividas: [divida("a", 50000, "2026-07-10"), divida("b", 50000, "2026-08-10")],
      alocacoes: [],
    };
    const final = aplicarRealocacao(estado, realocar(estado));
    expect(final.map((a) => a.id)).toEqual(["nova:0", "nova:1"]);
    const [n0, n1] = final as [AlocacaoAutomatica, AlocacaoAutomatica];
    expect(n0.criadoEm < n1.criadoEm).toBe(true);
    expect(n0.criadoEm > "2026-12-31T23:59:59Z").toBe(true);
  });
});

describe("previaDoReembolso", () => {
  const criacao = { parteAtualDestaCentavos: 0, alocadoDestaCentavos: 0 };

  it("deve 2.000, lança 500 → passa a dever 1.500, sem sobra", () => {
    expect(previaDoReembolso({ devidoCentavos: 200000, saldoAFavorCentavos: 0, ...criacao, valorCentavos: 50000 })).toEqual({
      devidoAntesCentavos: 200000,
      devidoDepoisCentavos: 150000,
      sobraCentavos: 0,
    });
  });

  it("deve 2.000, lança 2.500 → sobra de 500", () => {
    expect(previaDoReembolso({ devidoCentavos: 200000, saldoAFavorCentavos: 0, ...criacao, valorCentavos: 250000 })).toEqual({
      devidoAntesCentavos: 200000,
      devidoDepoisCentavos: 0,
      sobraCentavos: 50000,
    });
  });

  it("edição: receita de 700 totalmente alocada, agora 400 → os 700 voltam à dívida antes de recalcular", () => {
    // Antes da edição a pessoa devia 1.300 (2.000 − 700). Sem esta receita, devia 2.000.
    expect(
      previaDoReembolso({
        devidoCentavos: 130000,
        saldoAFavorCentavos: 0,
        parteAtualDestaCentavos: 70000,
        alocadoDestaCentavos: 70000,
        valorCentavos: 40000,
      }),
    ).toEqual({ devidoAntesCentavos: 200000, devidoDepoisCentavos: 160000, sobraCentavos: 0 });
  });

  it("edição: a parte desta receita que estava como saldo a favor deixa de ser crédito", () => {
    // Pagamento de 800, 500 alocados e 300 de crédito; sem ele a pessoa devia 0 e não tinha crédito.
    expect(
      previaDoReembolso({
        devidoCentavos: 0,
        saldoAFavorCentavos: 30000,
        parteAtualDestaCentavos: 80000,
        alocadoDestaCentavos: 50000,
        valorCentavos: 20000,
      }),
    ).toEqual({ devidoAntesCentavos: 50000, devidoDepoisCentavos: 30000, sobraCentavos: 0 });
  });

  it("saldo a favor abate o que a pessoa deve antes da sobra", () => {
    expect(previaDoReembolso({ devidoCentavos: 0, saldoAFavorCentavos: 20000, ...criacao, valorCentavos: 10000 })).toEqual({
      devidoAntesCentavos: 0,
      devidoDepoisCentavos: 0,
      sobraCentavos: 10000,
    });
  });
});

describe("previaDoLote", () => {
  it("devido 1.000 e dois lançamentos de 600 → a 2ª tem sobra de 200", () => {
    expect(previaDoLote({ devidoCentavos: 100000, saldoAFavorCentavos: 0 }, [60000, 60000])).toEqual([
      { devidoAntesCentavos: 100000, devidoDepoisCentavos: 40000, sobraCentavos: 0 },
      { devidoAntesCentavos: 40000, devidoDepoisCentavos: 0, sobraCentavos: 20000 },
    ]);
  });

  it("lote vazio devolve lista vazia", () => {
    expect(previaDoLote({ devidoCentavos: 100000, saldoAFavorCentavos: 0 }, [])).toEqual([]);
  });
});

describe("decidirReembolso", () => {
  const semSobra = { devidoAntesCentavos: 50000, devidoDepoisCentavos: 0, sobraCentavos: 0 };
  const comSobra = (sobra: number) => ({ devidoAntesCentavos: 0, devidoDepoisCentavos: 0, sobraCentavos: sobra });

  it("(a) receita pessoal não aceita reembolso de pessoa", () => {
    expect(
      decidirReembolso({
        classificacaoPedida: "pessoal",
        previa: semSobra,
        valorCentavos: 10000,
        escolha: null,
        devidoVistoCentavos: null,
      }),
    ).toEqual({ ok: false, campo: "reembolso_pessoa_id", mensagem: MSG_REEMBOLSO_SO_DE_TERCEIRO });
  });

  it("(b) dívida que mudou desde a prévia recusa, mesmo com sobra e sem escolha (a recusa vem antes)", () => {
    expect(
      decidirReembolso({
        classificacaoPedida: "terceiro",
        previa: { devidoAntesCentavos: 50000, devidoDepoisCentavos: 0, sobraCentavos: 20000 },
        valorCentavos: 70000,
        escolha: null,
        devidoVistoCentavos: 40000,
      }),
    ).toEqual({ ok: false, campo: "reembolso_sobra", mensagem: MSG_DIVIDA_MUDOU });
  });

  it("(c) sem sobra: vira terceiro, sem parte própria, e vincula, sem precisar de escolha", () => {
    expect(
      decidirReembolso({
        classificacaoPedida: "terceiro",
        previa: semSobra,
        valorCentavos: 30000,
        escolha: null,
        devidoVistoCentavos: 50000,
      }),
    ).toEqual({ ok: true, receita_classificacao: "terceiro", minhaParteCentavos: null, vincula: true });
  });

  it("(d) com sobra e sem escolha recusa, pedindo a escolha no campo reembolso_sobra", () => {
    expect(
      decidirReembolso({
        classificacaoPedida: "terceiro",
        previa: comSobra(20000),
        valorCentavos: 70000,
        escolha: null,
        devidoVistoCentavos: null,
      }),
    ).toEqual({ ok: false, campo: "reembolso_sobra", mensagem: MSG_ESCOLHA_A_SOBRA });
  });

  it("(e) escolha 'saldo' vira terceiro, sem parte própria, e vincula", () => {
    expect(
      decidirReembolso({
        classificacaoPedida: "terceiro",
        previa: comSobra(20000),
        valorCentavos: 70000,
        escolha: "saldo",
        devidoVistoCentavos: null,
      }),
    ).toEqual({ ok: true, receita_classificacao: "terceiro", minhaParteCentavos: null, vincula: true });
  });

  it("(f) escolha 'receita' com sobra menor que o valor vira compartilhada, com a sobra como parte própria, e vincula", () => {
    expect(
      decidirReembolso({
        classificacaoPedida: "terceiro",
        previa: comSobra(20000),
        valorCentavos: 70000,
        escolha: "receita",
        devidoVistoCentavos: null,
      }),
    ).toEqual({ ok: true, receita_classificacao: "compartilhada", minhaParteCentavos: 20000, vincula: true });
  });

  it("(g) escolha 'receita' com sobra igual ao valor vira pessoal e NÃO vincula", () => {
    expect(
      decidirReembolso({
        classificacaoPedida: "terceiro",
        previa: comSobra(70000),
        valorCentavos: 70000,
        escolha: "receita",
        devidoVistoCentavos: null,
      }),
    ).toEqual({ ok: true, receita_classificacao: "pessoal", minhaParteCentavos: null, vincula: false });
  });

  it("compartilhada pedida pelo dono com pessoa é tratada pela sobra, não mantida como pedida", () => {
    // Sem sobra: vira terceiro, mesmo tendo sido pedida compartilhada.
    expect(
      decidirReembolso({
        classificacaoPedida: "compartilhada",
        previa: semSobra,
        valorCentavos: 30000,
        escolha: null,
        devidoVistoCentavos: null,
      }),
    ).toEqual({ ok: true, receita_classificacao: "terceiro", minhaParteCentavos: null, vincula: true });
    // Com sobra e escolha 'receita' parcial: vira compartilhada pela sobra.
    expect(
      decidirReembolso({
        classificacaoPedida: "compartilhada",
        previa: comSobra(20000),
        valorCentavos: 70000,
        escolha: "receita",
        devidoVistoCentavos: null,
      }),
    ).toEqual({ ok: true, receita_classificacao: "compartilhada", minhaParteCentavos: 20000, vincula: true });
  });

  it("devidoVisto null não confere a dívida (caminho da importação)", () => {
    expect(
      decidirReembolso({
        classificacaoPedida: "terceiro",
        previa: { devidoAntesCentavos: 50000, devidoDepoisCentavos: 0, sobraCentavos: 20000 },
        valorCentavos: 70000,
        escolha: "saldo",
        devidoVistoCentavos: null,
      }),
    ).toEqual({ ok: true, receita_classificacao: "terceiro", minhaParteCentavos: null, vincula: true });
  });
});

describe("entradaDaPrevia (T6)", () => {
  const estado: EstadoDoReembolso = {
    pagamentos: [pagamento("rec-1", 50000)],
    dividas: [divida("d1", 200000, "2026-05-01")],
    alocacoes: [
      {
        id: "a1",
        receivableId: "d1",
        transactionId: "rec-1",
        valorCentavos: 50000,
        recebidoEm: "2026-11-01",
        criadoEm: "2026-11-01T10:00:00Z",
      },
    ],
  };

  it("na criação não há contribuição desta receita", () => {
    expect(entradaDaPrevia(estado, null)).toEqual({
      devidoCentavos: 150000,
      saldoAFavorCentavos: 0,
      parteAtualDestaCentavos: 0,
      alocadoDestaCentavos: 0,
    });
  });

  it("na edição devolve a parte e o alocado da receita em edição", () => {
    expect(entradaDaPrevia(estado, "rec-1")).toEqual({
      devidoCentavos: 150000,
      saldoAFavorCentavos: 0,
      parteAtualDestaCentavos: 50000,
      alocadoDestaCentavos: 50000,
    });
  });

  it("receita que não está no pagamento (pendente) contribui com 0", () => {
    expect(entradaDaPrevia(estado, "outra")).toMatchObject({ parteAtualDestaCentavos: 0, alocadoDestaCentavos: 0 });
  });

  it("alimenta previaDoReembolso: editar sem mudar o valor devolve a mesma dívida de antes", () => {
    const e = entradaDaPrevia(estado, "rec-1");
    expect(previaDoReembolso({ ...e, valorCentavos: 50000 })).toEqual({
      devidoAntesCentavos: 200000,
      devidoDepoisCentavos: 150000,
      sobraCentavos: 0,
    });
  });
});

describe("frasesDoReembolso (T6)", () => {
  const sem = { devidoAntesCentavos: 200000, devidoDepoisCentavos: 150000, sobraCentavos: 0 };

  it("sem sobra: deve → passa a dever, e fica fora da renda", () => {
    const f = frasesDoReembolso({ nome: "Ana", previa: sem, valorCentavos: 50000, pendente: false });
    expect(f.resumo).toMatch(/^Ana deve R\$\s2\.000,00 → passa a dever R\$\s1\.500,00$/);
    expect(f.foraDaRenda).toBe("Fica fora da sua renda.");
    expect(f.sobra).toBeNull();
    expect(f.opcaoReceita).toBeNull();
    expect(f.opcaoSaldo).toBeNull();
  });

  it("pendente não abate e não promete 'fora da renda'", () => {
    const f = frasesDoReembolso({ nome: "Ana", previa: sem, valorCentavos: 50000, pendente: true });
    expect(f.resumo).toMatch(/^Ana deve R\$\s2\.000,00\. Receita pendente não abate; ao marcar como recebida, abate\.$/);
    expect(f.foraDaRenda).toBeNull();
  });

  it("com sobra parcial: pergunta a sobra e explica as duas opções", () => {
    const f = frasesDoReembolso({
      nome: "Ana",
      previa: { devidoAntesCentavos: 200000, devidoDepoisCentavos: 0, sobraCentavos: 50000 },
      valorCentavos: 250000,
      pendente: false,
    });
    expect(f.sobra).toMatch(/^Passa R\$\s500,00 do que Ana deve\.$/);
    expect(f.opcaoReceita).toMatch(/^R\$\s500,00 entra na sua renda; R\$\s2\.000,00 abate o que Ana deve\.$/);
    expect(f.opcaoSaldo).toMatch(/^Os R\$\s500,00 abatem sozinhos as próximas compras divididas com Ana\.$/);
    expect(f.foraDaRenda).toBeNull();
  });

  it("pessoa que não deve nada: a entrada inteira vira receita, sem abater", () => {
    const f = frasesDoReembolso({
      nome: "Ana",
      previa: { devidoAntesCentavos: 0, devidoDepoisCentavos: 0, sobraCentavos: 50000 },
      valorCentavos: 50000,
      pendente: false,
    });
    expect(f.resumo).toBe("Ana não deve nada agora.");
    expect(f.opcaoReceita).toBe("A entrada inteira vira receita sua e não abate nada.");
  });
});
