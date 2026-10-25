/**
 * REDESIGN-03-B2 — o Cron (`generateForUser`) visto de fora, com um client de service role FALSO.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ O QUE ESTE ARQUIVO PROVA.                                                             ║
 * ║                                                                                       ║
 * ║ O efeito NO SINO das decisões da Parte B da 03-B2 — o que nasce em `notifications`.    ║
 * ║ Os testes puros de `generate.ts` provam o gerador; este prova o que o Cron LÊ e        ║
 * ║ entrega a ele, que é onde a B1 (fatura vazia) e a B2 (régua do gasto alto) moram.      ║
 * ║                                                                                       ║
 * ║ O client falso APLICA `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `in`, `is`, `not` e       ║
 * ║ `limit` sobre as linhas sintéticas — é isso que torna visível um `.gt("itens", 0)` a   ║
 * ║ mais ou uma janela de leitura diferente. `or` e `order` são ignorados. Tabela sem      ║
 * ║ fixture devolve []. 03-G: `estado.falhar` injeta erro de leitura e `estado.cortar`     ║
 * ║ simula o max_rows; Dieta, Treinos e IA rodam de verdade (um builder que lança vira     ║
 * ║ "família não lida", e o teste "sem falha" pega isso). Nenhuma rede.                    ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * Fixture SINTÉTICA: o repositório é público.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { formatCurrency } from "@/lib/format";
import { generateForUser } from "@/lib/notifications/cron";

type Linha = Record<string, unknown>;
type Servico = Parameters<typeof generateForUser>[0];

const USUARIO = "user-1";
/** 12h em Brasília: `todayIso` = 2026-09-10. */
const AGORA = new Date("2026-09-10T15:00:00.000Z");

const estado = {
  tabelas: {} as Record<string, Linha[]>,
  inseridas: {} as Record<string, Linha[]>,
  /** 03-G — tabela → `code` do erro que a LEITURA dela devolve. */
  falhar: {} as Record<string, string>,
  /** 03-G — tabela → quantas linhas chegam (o max_rows); o `count` continua sendo o total. */
  cortar: {} as Record<string, number>,
};

/** Ordem de string ou de número; nulo nunca passa num filtro de comparação. */
function comparar(a: unknown, b: unknown): number {
  if (a == null || b == null) return Number.NaN;
  if (typeof a === "number" && typeof b === "number") return a - b;
  const x = String(a);
  const y = String(b);
  return x < y ? -1 : x > y ? 1 : 0;
}

function servicoFalso(): Servico {
  return {
    from(tabela: string) {
      const predicados: Array<(l: Linha) => boolean> = [];
      let limite: number | undefined;
      const builder: Record<string, unknown> = {};
      const resultado = () => {
        const codigo = estado.falhar[tabela];
        if (codigo) {
          return { data: null, error: { code: codigo, message: "erro simulado" }, count: null };
        }
        const todas = (estado.tabelas[tabela] ?? []).filter((l) => predicados.every((p) => p(l)));
        const chegam = tabela in estado.cortar ? todas.slice(0, estado.cortar[tabela]) : todas;
        return {
          data: limite === undefined ? chegam : chegam.slice(0, limite),
          error: null,
          count: todas.length,
        };
      };
      const filtro =
        (teste: (valor: unknown, alvo: unknown) => boolean) => (coluna: string, alvo: unknown) => {
          predicados.push((l) => teste(l[coluna], alvo));
          return builder;
        };
      builder.select = () => builder;
      builder.order = () => builder;
      builder.or = () => builder;
      builder.eq = filtro((v, a) => v === a);
      builder.neq = filtro((v, a) => v !== a);
      builder.gt = filtro((v, a) => comparar(v, a) > 0);
      builder.gte = filtro((v, a) => comparar(v, a) >= 0);
      builder.lte = filtro((v, a) => comparar(v, a) <= 0);
      builder.in = filtro((v, a) => (a as unknown[]).includes(v));
      // 03-G — `is`/`lt`/`not` existem para Dieta e Treinos rodarem de verdade no falso: com o
      // Cron por família, um builder que lança vira "família não lida" (antes sumia calado).
      builder.is = filtro((v, a) => (a === null ? v == null : v === a));
      builder.lt = filtro((v, a) => comparar(v, a) < 0);
      builder.not = (coluna: string, op: string, alvo: unknown) => {
        predicados.push((l) => (op === "is" && alvo === null ? l[coluna] != null : l[coluna] !== alvo));
        return builder;
      };
      builder.limit = (n: number) => {
        limite = n;
        return builder;
      };
      builder.maybeSingle = async () => {
        const r = resultado();
        return r.error ? { data: null, error: r.error } : { data: r.data?.[0] ?? null, error: null };
      };
      builder.single = builder.maybeSingle;
      builder.insert = async (linhas: Linha | Linha[]) => {
        (estado.inseridas[tabela] ??= []).push(...(Array.isArray(linhas) ? linhas : [linhas]));
        return { error: null };
      };
      builder.update = () => builder;
      builder.then = (
        resolve: (v: ReturnType<typeof resultado>) => unknown,
        reject: (e: unknown) => unknown,
      ) => Promise.resolve(resultado()).then(resolve, reject);
      return builder;
    },
  } as unknown as Servico;
}

/** As notificações que o Cron inseriu, do tipo pedido (prefixo). */
function inseridas(prefixoDoTipo: string): Linha[] {
  return (estado.inseridas.notifications ?? []).filter((n) =>
    String(n.type).startsWith(prefixoDoTipo),
  );
}

function faturaSintetica(sobre: Linha): Linha {
  return {
    user_id: USUARIO,
    card_id: "card-1",
    pago_em: null,
    ...sobre,
  };
}

function fixtureBase(): Record<string, Linha[]> {
  return {
    credit_cards: [{ id: "card-1", nome: "Cartao 1", limite_total: 5000, user_id: USUARIO }],
    card_statements_with_total: [
      // Fatura REAL: tem lançamento, venceu e não foi paga.
      faturaSintetica({
        id: "st-real",
        competencia: "2026-08-01",
        data_fechamento: "2026-08-05",
        data_vencimento: "2026-08-15",
        total_atual: 300,
        itens: 2,
      }),
      // Fatura VAZIA: nasceu do get-or-create e ficou sem item — não é fatura real (§13.5).
      faturaSintetica({
        id: "st-vazia",
        competencia: "2026-07-01",
        data_fechamento: "2026-07-05",
        data_vencimento: "2026-07-15",
        total_atual: 0,
        itens: 0,
      }),
    ],
  };
}

async function rodarOCron(): Promise<void> {
  await generateForUser(servicoFalso(), USUARIO, AGORA);
}

beforeEach(() => {
  estado.tabelas = fixtureBase();
  estado.inseridas = {};
  estado.falhar = {};
  estado.cortar = {};
});

describe("03-B2 B1 — as faturas que o sino vê", () => {
  /**
   * B1 — conserto aprovado pelo dono em 2026-09-27: o Cron filtra `.gt("itens", 0)`.
   * A fatura real vencida gera alerta; a vazia deixa de gerar novas notificações.
   */
  it("B1 — o sino avisa somente a fatura real vencida", async () => {
    await rodarOCron();
    const faturas = inseridas("invoice_");
    expect(faturas.map((n) => n.dedupe_key).sort()).toEqual([
      "invoice_overdue:st-real",
    ]);
  });
});

/* ═══════════════════════════ B2 — a régua do gasto alto ═══════════════════════════ */

/** Despesa à vista (pix, sem cartão, sem parcelamento): entra direto em `resumoMes.saidas`. */
function despesaAVista(data: string, valor: number, status: "pago" | "pendente" = "pago"): Linha {
  return {
    user_id: USUARIO,
    amount: valor,
    valor_pessoal: null,
    type: "despesa",
    payment_method: "pix",
    status,
    competence_date: data,
    card_id: null,
    statement_id: null,
    parcelado: false,
    category_id: null,
    category: null,
  };
}

/** Só lançamentos: sem cartão nem fatura, para o gasto alto ser a única conta em jogo. */
function soLancamentos(...linhas: Linha[]): void {
  estado.tabelas = { transactions: linhas };
}

describe("03-B2 B2 — a régua do gasto alto no sino", () => {
  /**
   * B2 — conserto aprovado pelo dono em 2026-09-27: o sino ADOTOU a régua da tela
   * (`reguaDoGastoAlto`, a mesma função que a página do dashboard financeiro chama). Até 5 meses
   * anteriores, mês sem saída IGNORADO, e o mês corrente CHEIO — com pendente, na base
   * competência (§13.3). Antes: 3 meses exatos, mês zerado dividindo, e o mês corrente cortado
   * em hoje.
   *
   * Cenário A — um mês zerado (junho) e uma despesa PENDENTE com data futura no mês corrente.
   * Agora: setembro cheio = 700 + 600 = 1300; média de abr/mai/jul/ago (junho, zerado, fica fora)
   * = 950; 1300 passa de 950 × 1,2 = 1140 → DISPARA, 37%. (Antes: 700 contra 600 → não
   * disparava.)
   */
  it("B2 — régua única (cenário A): mês zerado + pendente futuro — o sino passa a disparar 37%", async () => {
    soLancamentos(
      despesaAVista("2026-04-15", 1000),
      despesaAVista("2026-05-15", 1000),
      despesaAVista("2026-07-15", 900),
      despesaAVista("2026-08-15", 900),
      despesaAVista("2026-09-05", 700),
      despesaAVista("2026-09-25", 600, "pendente"),
    );
    await rodarOCron();
    expect(inseridas("high_spending").map((n) => n.description)).toEqual([
      `As saídas do mês superam a média recente em 37% (${formatCurrency(1300)}).`,
    ]);
  });

  /**
   * Cenário B — o mês zerado puxava a média para baixo.
   * Agora: média de jul/ago = 500 (junho zerado e abr/mai sem saída ficam fora); setembro = 500
   * não passa de 600 → NÃO dispara. (Antes: (0 + 500 + 500) / 3 ≈ 333,33 → disparava 50%.)
   */
  it("B2 — régua única (cenário B): o mês zerado deixa de puxar a média — o sino não dispara", async () => {
    soLancamentos(
      despesaAVista("2026-07-15", 500),
      despesaAVista("2026-08-15", 500),
      despesaAVista("2026-09-05", 500),
    );
    await rodarOCron();
    expect(inseridas("high_spending").map((n) => n.description)).toEqual([]);
  });
});

/** Prova a saída do sino do §6.5: só recebíveis em aberto, pelo saldo. */
describe("03-D B4 — o sino com o saldo", () => {
  function recebivelSintetico(sobre: Linha): Linha {
    return {
      user_id: USUARIO,
      installment_id: null,
      statement_id: null,
      transaction_id: null,
      pago_em: null,
      data_prevista: "2026-09-12",
      person: { nome: "Pessoa A" },
      statement: null,
      transaction: null,
      ...sobre,
    };
  }

  function recebimento(id: string, receivableId: string, valor: number, recebidoEm: string): Linha {
    return {
      id,
      receivable_id: receivableId,
      valor,
      recebido_em: recebidoEm,
      user_id: USUARIO,
      observacoes: null,
      created_at: `${recebidoEm}T12:00:00.000Z`,
    };
  }

  it("B4 — o sino avisa o saldo: 600 com 250 recebidos vira R$ 350,00", async () => {
    estado.tabelas = {
      ...fixtureBase(),
      receivables: [recebivelSintetico({ id: "rec-a", valor: 600, status: "pendente" })],
      receivable_receipts: [recebimento("receipt-a", "rec-a", 250, "2026-09-05")],
    };
    await rodarOCron();
    const avisos = inseridas("receivable_pending");
    expect(avisos).toHaveLength(1);
    expect(avisos[0].dedupe_key).toBe("receivable_pending:rec-a");
    expect(avisos[0].description).toContain(formatCurrency(350));
    expect(avisos[0].description).not.toContain(formatCurrency(600));
  });

  it("B4 — `pago` legado sem recebimento não vira aviso", async () => {
    estado.tabelas = {
      ...fixtureBase(),
      receivables: [
        recebivelSintetico({ id: "rec-b", valor: 100, status: "pago", pago_em: "2026-09-01" }),
      ],
      receivable_receipts: [],
    };
    await rodarOCron();
    expect(inseridas("receivable_pending")).toEqual([]);
  });

  it("B4 — coluna `pago` com a soma aberta (RR-D-7) entra como pendente, com o saldo", async () => {
    estado.tabelas = {
      ...fixtureBase(),
      receivables: [
        recebivelSintetico({ id: "rec-c", valor: 600, status: "pago", pago_em: "2026-09-05" }),
      ],
      receivable_receipts: [recebimento("receipt-c", "rec-c", 250, "2026-09-05")],
    };
    await rodarOCron();
    const avisos = inseridas("receivable_pending");
    expect(avisos).toHaveLength(1);
    expect(avisos[0].dedupe_key).toBe("receivable_pending:rec-c");
    expect(avisos[0].description).toContain(formatCurrency(350));
  });
});

/* ═══════════════════════════ 03-G L7 — o Cron por família ═══════════════════════════ */

describe("03-G L7 — a leitura que falha tira só a sua família (K1b)", () => {
  /** Uma tarefa atrasada: a família que deve SOBREVIVER à falha das faturas. */
  function comTarefaAtrasada(): void {
    estado.tabelas.tasks = [
      { id: "task-1", user_id: USUARIO, title: "Tarefa sintetica", status: "pendente", due_date: "2026-09-01", priority: "media" },
    ];
  }

  it("Z7 — faturas sem leitura: nenhum aviso de fatura, a tarefa segue, e o sino diz o que faltou", async () => {
    comTarefaAtrasada();
    estado.falhar.card_statements_with_total = "XX000";
    const r = await generateForUser(servicoFalso(), USUARIO, AGORA);

    expect(inseridas("invoice_")).toEqual([]);
    expect(inseridas("task_overdue")).toHaveLength(1);
    expect(r.familiasNaoLidas).toEqual(["faturas", "limiteDoCartao", "gastoAlto"]);
    expect(inseridas("sistema_verificacao_incompleta")).toEqual([
      expect.objectContaining({
        priority: "low",
        link: "/notificacoes",
        // AGORA = 12h em Brasília.
        description:
          "Na verificação de hoje às 12h não foi possível ler: faturas, limite do cartão, gasto alto. Os avisos delas podem estar faltando.",
        dedupe_key: "sistema_verificacao_incompleta:2026-09-10:manha",
      }),
    ]);
  });

  it("K2 — lançamentos cortados pelo max_rows contam como não lidos: o gasto alto sai com a soma parcial", async () => {
    estado.tabelas.transactions = [
      { id: "tx-1", user_id: USUARIO, competence_date: "2026-09-01" },
      { id: "tx-2", user_id: USUARIO, competence_date: "2026-09-02" },
    ];
    estado.cortar.transactions = 1;
    const r = await generateForUser(servicoFalso(), USUARIO, AGORA);
    expect(r.familiasNaoLidas).toEqual(["gastoAlto"]);
    expect(inseridas("high_spending")).toEqual([]);
  });

  it("sem falha, nenhum aviso de sistema e a lista vem vazia", async () => {
    const r = await generateForUser(servicoFalso(), USUARIO, AGORA);
    expect(r.familiasNaoLidas).toEqual([]);
    expect(inseridas("sistema_")).toEqual([]);
  });

  it("Z9 — preferências com erro: nada é entregue, nem o aviso de sistema", async () => {
    estado.falhar.settings = "XX000";
    estado.falhar.card_statements_with_total = "XX000";
    const r = await generateForUser(servicoFalso(), USUARIO, AGORA);
    expect(r).toMatchObject({ inserted: 0, naoEntregue: "preferencias" });
    expect(estado.inseridas.notifications ?? []).toEqual([]);
  });

  it("Z8 — dedupe com erro: nada é inserido (inserir sem saber o que existe duplicaria)", async () => {
    estado.falhar.notifications = "XX000";
    const r = await generateForUser(servicoFalso(), USUARIO, AGORA);
    expect(r).toMatchObject({ inserted: 0, naoEntregue: "dedupe" });
    expect(estado.inseridas.notifications ?? []).toEqual([]);
  });
});
