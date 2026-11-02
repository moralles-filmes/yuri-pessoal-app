/**
 * REDESIGN-06 T10 — anatomia dos cards de quadros (TO-DO, Cartões & Faturas, Agenda, Tarefas &
 * Rotinas, Estudos). Varredura do código-fonte, sem comentários (o projeto não tem teste de
 * componente — invariante 25), mais uma chamada real do card de Cartões com a leitura mockada.
 *
 * O que cai aqui: um quadro sair do lugar que o §4.7 da spec lhe deu, uma linha que a spec
 * mandou remover voltar, ou o Cartões voltar a mostrar "R$ 0,00" para uma fatura prevista sem
 * lançamentos (ausência não é zero).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

const ler = (arquivo: string) =>
  readFileSync(join(__dirname, arquivo), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

describe("T10 · todo-card.tsx", () => {
  const codigo = ler("todo-card.tsx");
  it.each([
    "Urgentes (P1)",
    "Concluídas hoje",
    'tom="vermelho"',
    'tom="verde"',
    "Próximas tarefas",
  ])("contém %s", (trecho) => {
    expect(codigo).toContain(trecho);
  });
  it.each(["Conclusão na semana", "projeto(s) ativo(s)"])("não contém %s", (trecho) => {
    expect(codigo).not.toContain(trecho);
  });
});

describe("T10 · invoices-card.tsx", () => {
  const codigo = ler("invoices-card.tsx");
  it.each([
    "A pagar nas faturas",
    "valorDaFatura(",
    "sem lançamentos conhecidos",
  ])("contém %s", (trecho) => {
    expect(codigo).toContain(trecho);
  });
  it("não contém Total pendente como rótulo solto", () => {
    expect(codigo).not.toContain("Total pendente");
  });
});

describe("T10 · agenda-card.tsx", () => {
  const codigo = ler("agenda-card.tsx");
  it.each(["Eventos hoje (", "Adicionar evento", "/agenda"])("contém %s", (trecho) => {
    expect(codigo).toContain(trecho);
  });
});

describe("T10 · tasks-card.tsx", () => {
  const codigo = ler("tasks-card.tsx");
  it("contém Rotinas de hoje", () => {
    expect(codigo).toContain("Rotinas de hoje");
  });
  it("não contém a lista de tarefas abertas", () => {
    expect(codigo).not.toContain("tarefa(s) aberta(s)");
  });
});

describe("T10 · studies-card.tsx", () => {
  const codigo = ler("studies-card.tsx");
  it('contém tom="ambar" e a palavra atrasado', () => {
    expect(codigo).toContain('tom="ambar"');
    expect(codigo).toContain("atrasado");
  });
  it('não contém tom="vermelho" nem sequência', () => {
    expect(codigo).not.toContain('tom="vermelho"');
    expect(codigo).not.toContain("sequência");
  });
});

const leituras = vi.hoisted(() => ({ getInvoicesCardData: vi.fn() }));
vi.mock("@/lib/dashboard/queries", () => leituras);

describe("T10 · InvoicesCard chamado", () => {
  it("fatura prevista de total 0 mostra 'sem lançamentos conhecidos', nunca R$ 0,00", async () => {
    const { InvoicesCard } = await import("./invoices-card");

    leituras.getInvoicesCardData.mockResolvedValueOnce({
      completude: { estado: "exato" },
      abertas: 1,
      fechadas: 0,
      pagas: 0,
      aReceber: 1500,
      totalProximas: 1500,
      hasCards: true,
      proximas: [
        {
          cardNome: "Nubank",
          cardCor: null,
          competencia: "2026-11",
          dataVencimento: "2026-11-25",
          total: 0,
          meu: 0,
          terceiros: 0,
          status: "aberta",
          virtual: true,
        },
      ],
    });

    const elemento = await InvoicesCard({ todayIso: "2026-11-18" });
    const texto = JSON.stringify(elemento);
    expect(texto).toContain("sem lançamentos conhecidos");
    expect(texto).not.toMatch(/R\$\s?0,00/);
  });
});

describe("T11 · nutrition-card.tsx", () => {
  const codigo = ler("nutrition-card.tsx");
  it.each(["Configurar dieta", "registradas"])("contém %s", (trecho) => {
    expect(codigo).toContain(trecho);
  });
  it.each(["Aderência de hoje", "Lista de compras", "Água (Hábitos)"])(
    "não contém %s",
    (trecho) => {
      expect(codigo).not.toContain(trecho);
    },
  );
});

describe("T11 · habits-card-body.tsx", () => {
  const codigo = ler("habits-card-body.tsx");
  it.each(["concluídos hoje", "<svg"])("contém %s", (trecho) => {
    expect(codigo).toContain(trecho);
  });
  it("não contém incrementHabit (a água é só leitura)", () => {
    expect(codigo).not.toContain("incrementHabit");
  });
});
