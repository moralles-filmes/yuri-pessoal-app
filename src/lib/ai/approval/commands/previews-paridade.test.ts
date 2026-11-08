import { describe, expect, it, vi } from "vitest";
import type { CommandContext } from "../contracts";
import { AI_TOOL_REGISTRY } from "@/lib/ai/tools/registry";
import { PROPOSTAS_POR_FERRAMENTA } from "./previews";
const ID = "11111111-1111-4111-8111-111111111111";
vi.mock("@/lib/format", async original => ({ ...await original<typeof import("@/lib/format")>(), hojeISO: () => "2026-11-08" }));
vi.mock("@/lib/todo/queries", () => ({
  getTodoProjects: async () => [{ id: ID, name: "Casa" }],
  getTodoTasks: async () => [{ id: ID, title: "Trocar lâmpada", status: "pendente", scheduledDate: "2026-11-08", scheduledTime: null, deadlineAt: null, recurrence: null, subtaskCount: 0, subtaskDoneCount: 0 }],
}));
vi.mock("@/lib/habits/queries", () => ({ getHabitsDashboard: async () => ({ habits: [{ id: ID, name: "Água", is_active: true, unit: "vezes", target_value: 8, todayValue: 0, todayLog: null, scheduledToday: true }] }), getHabitLogForDate: async () => null }));
vi.mock("@/lib/calendar/queries", () => ({ getCalendarEvents: async () => [], getGoogleConnectionStatus: async () => ({ status: { connected: true, email: "teste@example.com" } }) }));
vi.mock("@/lib/finance/queries", () => ({ getAccounts: async () => [{ id: ID, name: "Conta teste" }], getCreditCards: async () => [{ id: ID, nome: "Cartão teste" }], getCategories: async () => [{ id: ID, name: "Compras", kind: "despesa" }], getCardBillingDays: async () => ({ dia_fechamento: 3, dia_vencimento: 10 }), getStatementByCompetencia: async () => null }));
vi.mock("@/lib/ai/memory/queries", () => ({ getMemorias: async () => [] }));
vi.mock("@/lib/nutrition/diary-queries", () => ({
  searchFoodsByTerm: async () => [{ id: ID, name: "Arroz", baseUnit: "g", brand: null }],
  getMealTypes: async () => [{ id: ID, name: "Almoço", isActive: true }],
  getMeasuresForFoods: async () => new Map([[ID, [{ id: ID, label: "Colher" }]]]),
  montarSnapshotDoConsumo: async () => ({ ok: true, snapshot: { gramsEquivalent: 30, energyKcal: 40, proteinG: 1, carbG: 8, fatG: 0, sourceNameSnapshot: "Teste" } }),
}));
// Tabela independente do registry: campo/ferramenta novo exige decidir o que o dono lê.
const CAMPOS_VISIVEIS: Record<string, Record<string, string>> = {
  criarTarefaTodo: { titulo: "Título", data: "Data programada", horario: "Horário", prazo: "Prazo final", prioridade: "Prioridade", projeto: "Projeto" },
  concluirTarefaTodo: { tarefa_id: "Tarefa" },
  reagendarTarefaTodo: { tarefa_id: "Tarefa", data: "Nova data" },
  registrarHabito: { habito: "Hábito", valor: "Valor registrado", data: "Data" },
  criarEvento: { titulo: "Título", data: "Data", hora_inicio: "Horário", hora_fim: "Horário", dia_inteiro: "Horário", local: "Local", descricao: "Descrição", tipo: "Tipo" },
  registrarConsumo: { alimento: "Alimento", quantidade: "Quantidade", medida: "Quantidade", refeicao: "Refeição", data: "Data" },
  lancarTransacao: { tipo: "Tipo", valor: "Valor", descricao: "Descrição", data: "Data", conta: "Conta", cartao: "Cartão", categoria: "Categoria" },
  lembrarPreferencia: { conteudo: "Preferência", modulo: "Vale para", expira_em: "Prazo" },
};
const FIXTURES: Record<string, Record<string, unknown>[]> = {
  criarTarefaTodo: [{ titulo: "Trocar lâmpada", data: "2026-11-08", horario: "14:20", prazo: "2026-11-10", prioridade: 2, projeto: "Casa" }],
  concluirTarefaTodo: [{ tarefa_id: ID }], reagendarTarefaTodo: [{ tarefa_id: ID, data: "2026-11-09" }],
  registrarHabito: [{ habito: "Água", valor: 6, data: "2026-11-08" }],
  criarEvento: [{ titulo: "Dentista", data: "2026-11-09", hora_inicio: "14:20", hora_fim: "15:40", dia_inteiro: false, local: "Sala 2", descricao: "Levar exames e confirmar o orçamento", tipo: "pessoal" }, { titulo: "Férias", data: "2026-11-09", dia_inteiro: true }],
  registrarConsumo: [{ alimento: "Arroz", quantidade: 2, medida: "Colher", refeicao: "Almoço", data: "2026-11-08" }],
  lancarTransacao: [{ tipo: "despesa", valor: 37.42, descricao: "Compra de lâmpada", data: "2026-11-08", conta: "Conta teste", categoria: "Compras" }, { tipo: "despesa", valor: 52.31, descricao: "Compra de tomada", data: "2026-11-08", cartao: "Cartão teste", categoria: "Compras" }],
  lembrarPreferencia: [{ conteudo: "Prefiro respostas curtas", modulo: "todo", expira_em: "2026-12-10" }],
};
const ferramentas = AI_TOOL_REGISTRY.filter(t => t.kind === "escrita");
const ctx = { userId: "dono" } as CommandContext;
describe("Task 25 — paridade entre ferramenta e cartão", () => {
  it("a tabela cobre exatamente os commands de escrita alcançáveis", () => {
    expect(ferramentas.length).toBeGreaterThan(0);
    expect(Object.keys(CAMPOS_VISIVEIS).sort()).toEqual(ferramentas.map(t => t.command).sort());
  });
  for (const t of ferramentas) {
    it(t.command + " cobre todo campo da entrada e mostra cada campo preenchido", async () => {
      const mapa = CAMPOS_VISIVEIS[t.command!]; expect(mapa).toBeDefined();
      const propriedades = (t.inputSchema as { properties: Record<string, unknown> }).properties;
      expect(Object.keys(mapa).sort()).toEqual(Object.keys(propriedades).sort());
      expect(FIXTURES[t.command!]?.length).toBeGreaterThan(0);
      const vistos = new Set<string>();
      for (const fixture of FIXTURES[t.command!]) {
        const caminho = PROPOSTAS_POR_FERRAMENTA[t.name]; const parsed = caminho.parse(fixture);
        expect(parsed.ok).toBe(true); if (!parsed.ok) throw Error("Fixture inválida");
        const efeito = await caminho.prever(ctx, parsed.valor); expect(efeito.command).toBe(t.command);
        for (const [campo, valor] of Object.entries(fixture)) {
          if (valor === null || valor === undefined) continue;
          vistos.add(campo); const rotulo = mapa[campo];
          if (rotulo === "resumo") expect(efeito.previsao.resumo).toContain(String(valor));
          else expect(efeito.previsao.linhas.some(l => l.rotulo === rotulo && l.valor.trim() !== ""), campo).toBe(true);
        }
      }
      expect([...vistos].sort()).toEqual(Object.keys(propriedades).sort());
    });
  }
  it("descrição longa aparece inteira, e ausente não inventa linha", async () => {
    const p = PROPOSTAS_POR_FERRAMENTA["calendar.criar_evento"]; const base = FIXTURES.criarEvento[0];
    const descricao = "x".repeat(2000);
    expect((await p.prever(ctx, { ...base, descricao })).previsao.linhas).toContainEqual({ rotulo: "Descrição", valor: descricao });
    expect((await p.prever(ctx, { ...base, descricao: null })).previsao.linhas.some(l => l.rotulo === "Descrição")).toBe(false);
  });
});
