import { describe, expect, it } from "vitest";
import {
  generateNotifications,
  selectNewCandidates,
  type GenerateInput,
  type NotificationCandidate,
} from "./generate";

const TODAY = "2026-06-26";
// 2026-06-26 12:00 local-ish, em ms (usado só para o horizonte de eventos).
const NOW = new Date("2026-06-26T12:00:00").getTime();

/** Base vazia: cada teste liga só o que quer exercitar. */
function base(partial: Partial<GenerateInput> = {}): GenerateInput {
  return { todayIso: TODAY, nowMs: NOW, ...partial };
}

function typesOf(cands: NotificationCandidate[]): string[] {
  return cands.map((c) => c.type);
}

describe("generateNotifications — faturas", () => {
  it("emite invoice_overdue quando a fatura está fechada e venceu", () => {
    const out = generateNotifications(
      base({
        statements: [
          {
            id: "s1",
            cardId: "c1",
            cardNome: "Nubank",
            competencia: "2026-05-01",
            data_fechamento: "2026-05-28",
            data_vencimento: "2026-06-05", // < hoje
            pago_em: null,
            total: 1200,
          },
        ],
      }),
    );
    expect(typesOf(out)).toContain("invoice_overdue");
    const n = out.find((c) => c.type === "invoice_overdue")!;
    expect(n.priority).toBe("urgent");
    expect(n.dedupe_key).toBe("invoice_overdue:s1");
    expect(n.link).toContain("/faturas?card=c1");
  });

  it("emite invoice_due quando fechada e vence em <= 5 dias", () => {
    const out = generateNotifications(
      base({
        statements: [
          {
            id: "s2",
            cardId: "c1",
            cardNome: "Nubank",
            competencia: "2026-06-01",
            data_fechamento: "2026-06-24", // já fechou
            data_vencimento: "2026-06-30", // 4 dias
            pago_em: null,
            total: 800,
          },
        ],
      }),
    );
    expect(typesOf(out)).toContain("invoice_due");
    expect(out.find((c) => c.type === "invoice_due")!.dedupe_key).toBe("invoice_due:s2");
  });

  it("NÃO emite nada para fatura paga", () => {
    const out = generateNotifications(
      base({
        statements: [
          {
            id: "s3",
            cardId: "c1",
            cardNome: "Nubank",
            competencia: "2026-05-01",
            data_fechamento: "2026-05-28",
            data_vencimento: "2026-06-05",
            pago_em: "2026-06-01",
            total: 1200,
          },
        ],
      }),
    );
    expect(out).toHaveLength(0);
  });

  it("emite card_limit quando o uso das faturas em aberto passa de 80%", () => {
    const out = generateNotifications(
      base({
        statements: [
          {
            id: "s4",
            cardId: "c1",
            cardNome: "Nubank",
            competencia: "2026-06-01",
            data_fechamento: "2026-06-24",
            data_vencimento: "2026-07-05",
            pago_em: null,
            total: 900,
          },
        ],
        cards: [{ id: "c1", nome: "Nubank", limite_total: 1000 }],
      }),
    );
    const n = out.find((c) => c.type === "card_limit");
    expect(n).toBeTruthy();
    expect(n!.dedupe_key).toBe("card_limit:c1:2026-06");
  });

  it("card_limit fica urgent quando estoura o limite", () => {
    const out = generateNotifications(
      base({
        statements: [
          {
            id: "s5",
            cardId: "c1",
            cardNome: "Nubank",
            competencia: "2026-06-01",
            data_fechamento: "2026-06-24",
            data_vencimento: "2026-07-05",
            pago_em: null,
            total: 1100,
          },
        ],
        cards: [{ id: "c1", nome: "Nubank", limite_total: 1000 }],
      }),
    );
    expect(out.find((c) => c.type === "card_limit")!.priority).toBe("urgent");
  });
});

describe("generateNotifications — contas fixas", () => {
  it("emite bill_due quando vence em <= 5 dias", () => {
    const out = generateNotifications(
      base({ bills: [{ id: "b1", name: "Internet", amount: 120, due_day: 30, is_active: true }] }),
    );
    const n = out.find((c) => c.type === "bill_due");
    expect(n).toBeTruthy();
    expect(n!.dedupe_key).toBe("bill_due:b1:2026-06-30");
  });

  it("emite bill_overdue quando o vencimento do mês já passou (até 10 dias)", () => {
    const out = generateNotifications(
      base({ bills: [{ id: "b2", name: "Aluguel", amount: 1500, due_day: 20, is_active: true }] }),
    );
    const n = out.find((c) => c.type === "bill_overdue");
    expect(n).toBeTruthy();
    expect(n!.dedupe_key).toBe("bill_overdue:b2:2026-06-20");
  });

  it("ignora conta inativa", () => {
    const out = generateNotifications(
      base({ bills: [{ id: "b3", name: "TV", amount: 80, due_day: 27, is_active: false }] }),
    );
    expect(out).toHaveLength(0);
  });
});

describe("generateNotifications — recebíveis", () => {
  it("emite receivable_pending atrasado (high) com pessoa", () => {
    const out = generateNotifications(
      base({
        receivables: [
          { id: "r1", personNome: "João", valor: 200, status: "pendente", dataVencimento: "2026-06-10" },
        ],
      }),
    );
    const n = out.find((c) => c.type === "receivable_pending");
    expect(n).toBeTruthy();
    expect(n!.priority).toBe("high");
    expect(n!.title).toContain("João");
    expect(n!.dedupe_key).toBe("receivable_pending:r1");
  });

  it("não emite recebível pago", () => {
    const out = generateNotifications(
      base({
        receivables: [
          { id: "r2", personNome: "Ana", valor: 50, status: "pago", dataVencimento: "2026-06-10" },
        ],
      }),
    );
    expect(out).toHaveLength(0);
  });

  it("não emite recebível pendente sem vencimento próximo (futuro distante)", () => {
    const out = generateNotifications(
      base({
        receivables: [
          { id: "r3", personNome: "Ana", valor: 50, status: "pendente", dataVencimento: "2026-12-01" },
        ],
      }),
    );
    expect(out).toHaveLength(0);
  });
});

describe("generateNotifications — tarefas", () => {
  it("emite task_overdue para tarefa vencida", () => {
    const out = generateNotifications(
      base({
        tasks: [{ id: "t1", title: "Pagar boleto", status: "pendente", due_date: "2026-06-20", priority: "alta" }],
      }),
    );
    const n = out.find((c) => c.type === "task_overdue");
    expect(n).toBeTruthy();
    expect(n!.dedupe_key).toBe("task_overdue:t1");
  });

  it("emite task_today (com data no dedupe) para tarefa do dia", () => {
    const out = generateNotifications(
      base({
        tasks: [{ id: "t2", title: "Reunião", status: "pendente", due_date: TODAY, priority: "media" }],
      }),
    );
    const n = out.find((c) => c.type === "task_today");
    expect(n).toBeTruthy();
    expect(n!.dedupe_key).toBe(`task_today:t2:${TODAY}`);
  });

  it("task_overdue urgente herda prioridade urgente da tarefa", () => {
    const out = generateNotifications(
      base({
        tasks: [{ id: "t3", title: "X", status: "em_andamento", due_date: "2026-06-01", priority: "urgente" }],
      }),
    );
    expect(out.find((c) => c.type === "task_overdue")!.priority).toBe("urgent");
  });

  it("não emite para tarefa concluída", () => {
    const out = generateNotifications(
      base({
        tasks: [{ id: "t4", title: "Y", status: "concluida", due_date: "2026-06-01", priority: "alta" }],
      }),
    );
    expect(out).toHaveLength(0);
  });
});

describe("generateNotifications — eventos", () => {
  it("emite event_upcoming dentro de 24h", () => {
    const out = generateNotifications(
      base({
        events: [
          { id: "e1", title: "Dentista", startMs: NOW + 2 * 3_600_000, startIso: TODAY, tipo: "pessoal" },
        ],
      }),
    );
    const n = out.find((c) => c.type === "event_upcoming");
    expect(n).toBeTruthy();
    expect(n!.priority).toBe("high"); // <= 3h
    expect(n!.dedupe_key).toBe(`event_upcoming:e1:${TODAY}`);
  });

  it("não emite evento fora do horizonte (> 24h)", () => {
    const out = generateNotifications(
      base({
        events: [
          { id: "e2", title: "Show", startMs: NOW + 48 * 3_600_000, startIso: "2026-06-28", tipo: "pessoal" },
        ],
      }),
    );
    expect(out).toHaveLength(0);
  });

  it("não emite evento já passado", () => {
    const out = generateNotifications(
      base({
        events: [
          { id: "e3", title: "Antigo", startMs: NOW - 3_600_000, startIso: TODAY, tipo: "pessoal" },
        ],
      }),
    );
    expect(out).toHaveLength(0);
  });
});

describe("generateNotifications — hábitos", () => {
  it("emite water_goal para água pendente", () => {
    const out = generateNotifications(
      base({
        habits: [
          { id: "h1", name: "Água", category: "agua", scheduledToday: true, done: false, value: 1, target: 2, unit: "litros" },
        ],
      }),
    );
    const n = out.find((c) => c.type === "water_goal");
    expect(n).toBeTruthy();
    expect(n!.dedupe_key).toBe(`water_goal:h1:${TODAY}`);
  });

  it("emite habit_pending para hábito comum agendado e não feito", () => {
    const out = generateNotifications(
      base({
        habits: [
          { id: "h2", name: "Leitura", category: "leitura", scheduledToday: true, done: false, value: 0, target: 30, unit: "minutos" },
        ],
      }),
    );
    expect(typesOf(out)).toContain("habit_pending");
  });

  it("não emite hábito já feito ou não agendado hoje", () => {
    const out = generateNotifications(
      base({
        habits: [
          { id: "h3", name: "A", category: "leitura", scheduledToday: true, done: true, value: 30, target: 30, unit: "minutos" },
          { id: "h4", name: "B", category: "leitura", scheduledToday: false, done: false, value: 0, target: 30, unit: "minutos" },
        ],
      }),
    );
    expect(out).toHaveLength(0);
  });
});

describe("generateNotifications — estudos", () => {
  it("emite study_overdue 'target' quando passou da data-alvo", () => {
    const out = generateNotifications(
      base({
        courses: [
          { id: "co1", title: "Inglês", status: "em_andamento", target_date: "2026-06-01", lastSessionIso: TODAY },
        ],
      }),
    );
    const n = out.find((c) => c.type === "study_overdue");
    expect(n).toBeTruthy();
    expect(n!.dedupe_key).toBe("study_overdue:co1:target");
    expect(n!.link).toBe("/estudos/co1");
  });

  it("emite study_overdue 'inactive' quando sem sessão há mais de 7 dias", () => {
    const out = generateNotifications(
      base({
        courses: [
          { id: "co2", title: "Marketing", status: "em_andamento", target_date: null, lastSessionIso: "2026-06-10" },
        ],
      }),
    );
    expect(out.find((c) => c.type === "study_overdue")!.dedupe_key).toBe("study_overdue:co2:inactive");
  });

  it("não emite curso concluído/pausado", () => {
    const out = generateNotifications(
      base({
        courses: [
          { id: "co3", title: "X", status: "concluido", target_date: "2026-01-01", lastSessionIso: null },
        ],
      }),
    );
    expect(out).toHaveLength(0);
  });
});

describe("generateNotifications — gasto alto", () => {
  it("emite high_spending quando saídas passam 20% da média", () => {
    const out = generateNotifications(
      base({ spending: { mes: "2026-06", saidas: 1300, mediaSaidas: 1000 } }),
    );
    const n = out.find((c) => c.type === "high_spending");
    expect(n).toBeTruthy();
    expect(n!.dedupe_key).toBe("high_spending:2026-06");
  });

  it("não emite quando dentro da média", () => {
    const out = generateNotifications(
      base({ spending: { mes: "2026-06", saidas: 1050, mediaSaidas: 1000 } }),
    );
    expect(out).toHaveLength(0);
  });
});

describe("selectNewCandidates — idempotência por dedupe_key", () => {
  it("rodar duas vezes não duplica (segunda vez não traz nada novo)", () => {
    const input = base({
      statements: [
        {
          id: "s1",
          cardId: "c1",
          cardNome: "Nubank",
          competencia: "2026-05-01",
          data_fechamento: "2026-05-28",
          data_vencimento: "2026-06-05",
          pago_em: null,
          total: 1200,
        },
      ],
      tasks: [{ id: "t1", title: "X", status: "pendente", due_date: "2026-06-20", priority: "alta" }],
    });

    const first = generateNotifications(input);
    const fresh1 = selectNewCandidates(first, new Set());
    expect(fresh1.length).toBe(first.length);
    expect(fresh1.length).toBeGreaterThan(0);

    // "Persistimos" as chaves e rodamos de novo: nada novo.
    const existing = new Set(fresh1.map((c) => c.dedupe_key));
    const second = generateNotifications(input);
    const fresh2 = selectNewCandidates(second, existing);
    expect(fresh2).toHaveLength(0);
  });

  it("remove duplicados dentro do mesmo lote", () => {
    const dup: NotificationCandidate = {
      type: "high_spending",
      priority: "medium",
      title: "X",
      description: null,
      link: null,
      entity_type: null,
      entity_id: null,
      dedupe_key: "high_spending:2026-06",
    };
    const fresh = selectNewCandidates([dup, { ...dup }], new Set());
    expect(fresh).toHaveLength(1);
  });
});
