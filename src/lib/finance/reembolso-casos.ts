/**
 * REDESIGN-04-C · T1 — CASOS DOURADOS DA DISTRIBUIÇÃO DO REEMBOLSO (desenho §6).
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ Os MESMOS casos alimentam duas provas: o teste Vitest da regra pura (`reembolso.ts`)   ║
 * ║ e o script SQL da Tarefa 3, que os replica contra `realocar_reembolsos_da_pessoa`.    ║
 * ║ Por isso este arquivo NÃO importa `vitest` e só carrega dados.                        ║
 * ║                                                                                       ║
 * ║ Valores em CENTAVOS. `alocadoPorDivida` é o total alocado automaticamente a cada       ║
 * ║ dívida DEPOIS de aplicar `realocar` (alocação que já existia + a inserida); dívida     ║
 * ║ ausente do mapa vale 0.                                                               ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */
import type {
  AlocacaoAutomatica,
  DividaDaPessoa,
  EstadoDoReembolso,
  PagamentoDoReembolso,
} from "@/lib/finance/reembolso";

export type CasoDoReembolso = {
  readonly nome: string;
  readonly estado: EstadoDoReembolso;
  readonly esperado: {
    readonly devidoCentavos: number;
    readonly saldoAFavorCentavos: number;
    readonly alocadoPorDivida: Record<string, number>;
  };
};

/** Dívida aberta de uma pessoa; `criadoEm` fixo para o desempate não depender do caso. */
function divida(
  receivableId: string,
  valorCentavos: number,
  dataDaDivida: string,
  extra: Partial<DividaDaPessoa> = {},
): DividaDaPessoa {
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

/** Pagamento = a parte da pessoa numa receita `recebido`. */
function pagamento(
  transactionId: string,
  parteCentavos: number,
  recebidoEm = "2026-11-01",
  criadoEm = "2026-11-01T10:00:00Z",
): PagamentoDoReembolso {
  return { transactionId, contaId: "conta-1", parteCentavos, recebidoEm, criadoEm };
}

/** Alocação que já existe no banco (de um `realocar` anterior). */
function alocacao(
  id: string,
  receivableId: string,
  transactionId: string,
  valorCentavos: number,
  criadoEm: string,
  recebidoEm = "2026-11-01",
): AlocacaoAutomatica {
  return { id, receivableId, transactionId, valorCentavos, recebidoEm, criadoEm };
}

/** Quatro dívidas de 500,00, uma por mês (as `a`–`d` do desenho). */
function quatroDividas(): DividaDaPessoa[] {
  return [
    divida("a", 50000, "2026-07-10"),
    divida("b", 50000, "2026-08-10"),
    divida("c", 50000, "2026-09-10"),
    divida("d", 50000, "2026-10-10"),
  ];
}

/** Dez parcelas de 200,00, uma por mês (caso 3). */
function dezParcelas(): DividaDaPessoa[] {
  const meses = ["2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03", "2027-04"];
  return meses.map((mes, i) => divida(`c${String(i + 1).padStart(2, "0")}`, 20000, `${mes}-10`));
}

export const CASOS_DO_REEMBOLSO: readonly CasoDoReembolso[] = [
  {
    nome: "1 · deve 2.000 em 4 linhas de 500; paga 500 → a mais antiga sai, total 1.500",
    estado: { pagamentos: [pagamento("p1", 50000)], dividas: quatroDividas(), alocacoes: [] },
    esperado: { devidoCentavos: 150000, saldoAFavorCentavos: 0, alocadoPorDivida: { a: 50000 } },
  },
  {
    nome: "2 · paga 700 → uma linha sai, a segunda fica coberta em 200, total 1.300",
    estado: { pagamentos: [pagamento("p1", 70000)], dividas: quatroDividas(), alocacoes: [] },
    esperado: { devidoCentavos: 130000, saldoAFavorCentavos: 0, alocadoPorDivida: { a: 50000, b: 20000 } },
  },
  {
    nome: "3 · compra 10× R$ 200; paga 600 → cobre as três mais antigas (futuras incluídas), total 1.400",
    estado: { pagamentos: [pagamento("p1", 60000)], dividas: dezParcelas(), alocacoes: [] },
    esperado: {
      devidoCentavos: 140000,
      saldoAFavorCentavos: 0,
      alocadoPorDivida: { c01: 20000, c02: 20000, c03: 20000 },
    },
  },
  {
    nome: "5 · com 500 de saldo a favor entra compra nova de 300 → coberta sozinha, crédito 200",
    estado: {
      pagamentos: [pagamento("p1", 50000, "2026-10-20", "2026-10-20T10:00:00Z")],
      dividas: [divida("a", 30000, "2026-11-05")],
      alocacoes: [],
    },
    esperado: { devidoCentavos: 0, saldoAFavorCentavos: 20000, alocadoPorDivida: { a: 30000 } },
  },
  {
    nome: "6 · apaga a receita do caso 2 → as alocações somem e as duas linhas voltam a dever (2.000)",
    estado: {
      pagamentos: [],
      dividas: quatroDividas(),
      alocacoes: [
        alocacao("al1", "a", "p1", 50000, "2026-11-01T10:00:00Z"),
        alocacao("al2", "b", "p1", 20000, "2026-11-01T10:00:01Z"),
      ],
    },
    esperado: { devidoCentavos: 200000, saldoAFavorCentavos: 0, alocadoPorDivida: {} },
  },
  {
    nome: "7 · edita a receita de 700 para 400 → desfaz primeiro a alocação mais nova (b), total 1.600",
    estado: {
      pagamentos: [pagamento("p1", 40000)],
      dividas: quatroDividas(),
      alocacoes: [
        alocacao("al1", "a", "p1", 50000, "2026-11-01T10:00:00Z"),
        alocacao("al2", "b", "p1", 20000, "2026-11-01T10:00:01Z"),
      ],
    },
    esperado: { devidoCentavos: 160000, saldoAFavorCentavos: 0, alocadoPorDivida: { a: 40000 } },
  },
  {
    nome: "8 · exclui a compra `a`, já coberta → o valor vira saldo a favor e corre para as outras dívidas",
    estado: {
      pagamentos: [pagamento("p1", 70000)],
      dividas: [
        divida("b", 50000, "2026-08-10"),
        divida("c", 50000, "2026-09-10"),
        divida("d", 50000, "2026-10-10"),
      ],
      // A alocação de `a` caiu junto com o recebível (cascade); sobrou só a de `b`.
      alocacoes: [alocacao("al2", "b", "p1", 20000, "2026-11-01T10:00:01Z")],
    },
    esperado: { devidoCentavos: 80000, saldoAFavorCentavos: 0, alocadoPorDivida: { b: 50000, c: 20000 } },
  },
  {
    nome: "9 · dívida já abatida à mão (recebimento manual) só recebe o saldo",
    estado: {
      pagamentos: [pagamento("p1", 60000)],
      dividas: [
        divida("a", 50000, "2026-07-10", { recebidoManualCentavos: 30000 }),
        divida("b", 50000, "2026-08-10"),
      ],
      alocacoes: [],
    },
    esperado: { devidoCentavos: 10000, saldoAFavorCentavos: 0, alocadoPorDivida: { a: 20000, b: 40000 } },
  },
  {
    nome: "10a · linha `ignorado` nunca recebe: o dinheiro vai para a próxima e o resto fica a favor",
    estado: {
      pagamentos: [pagamento("p1", 80000)],
      dividas: [
        divida("a", 50000, "2026-07-10", { status: "ignorado" }),
        divida("b", 50000, "2026-08-10"),
      ],
      alocacoes: [],
    },
    esperado: { devidoCentavos: 0, saldoAFavorCentavos: 30000, alocadoPorDivida: { b: 50000 } },
  },
  {
    nome: "10b · `ignorado` volta a `pendente` → passa a receber do crédito",
    estado: {
      pagamentos: [pagamento("p1", 80000)],
      dividas: [divida("a", 50000, "2026-07-10"), divida("b", 50000, "2026-08-10")],
      alocacoes: [alocacao("al1", "b", "p1", 50000, "2026-11-01T10:00:00Z")],
    },
    esperado: { devidoCentavos: 20000, saldoAFavorCentavos: 0, alocadoPorDivida: { a: 30000, b: 50000 } },
  },
  {
    nome: "11 · recebível legado `pago` (K0, sem recebimento por transação) não recebe alocação",
    estado: {
      pagamentos: [pagamento("p1", 50000)],
      dividas: [
        divida("a", 50000, "2026-07-10", { status: "pago", recebidoManualCentavos: 50000 }),
        divida("b", 50000, "2026-08-10"),
      ],
      alocacoes: [],
    },
    esperado: { devidoCentavos: 0, saldoAFavorCentavos: 0, alocadoPorDivida: { b: 50000 } },
  },
  {
    nome: "16 · dívida mais antiga aparece depois de tudo alocado → nada é redistribuído",
    estado: {
      pagamentos: [pagamento("p1", 100000)],
      dividas: [
        divida("a", 50000, "2026-07-10"),
        divida("b", 50000, "2026-08-10"),
        divida("c", 50000, "2026-09-10"),
      ],
      alocacoes: [
        alocacao("al1", "b", "p1", 50000, "2026-10-01T10:00:00Z"),
        alocacao("al2", "c", "p1", 50000, "2026-10-01T10:00:01Z"),
      ],
    },
    esperado: { devidoCentavos: 50000, saldoAFavorCentavos: 0, alocadoPorDivida: { b: 50000, c: 50000 } },
  },
  {
    nome: "17 · estado já realocado → rodar de novo não muda nada",
    estado: {
      pagamentos: [pagamento("p1", 70000)],
      dividas: [divida("a", 50000, "2026-07-10"), divida("b", 50000, "2026-08-10")],
      alocacoes: [
        alocacao("al1", "a", "p1", 50000, "2026-11-01T10:00:00Z"),
        alocacao("al2", "b", "p1", 20000, "2026-11-01T10:00:01Z"),
      ],
    },
    esperado: { devidoCentavos: 30000, saldoAFavorCentavos: 0, alocadoPorDivida: { a: 50000, b: 20000 } },
  },
];
