/**
 * Fase 18-C — IA · O que a ferramenta de Hábitos relata bate com o que a tela mostra.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ O CASO QUE ESTE ARQUIVO EXISTE PARA FIXAR: TAXA SEM DENOMINADOR NÃO É 0%.             ║
 * ║                                                                                       ║
 * ║ `computeConsistency` devolve `rate: 0` quando `scheduled === 0` — dentro do módulo é   ║
 * ║ inofensivo, mas relatado ao modelo vira "sua consistência é 0%" para um hábito que    ║
 * ║ nem estava agendado. O adapter devolve `null` com o motivo, e os dois números          ║
 * ║ medidos continuam indo. É a regra "ausência não é zero, e não se divide por zero".    ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HabitsDashboard, HabitWithStats } from "@/types/database";

const HOJE = "2026-08-07";

let painelFalso: HabitsDashboard = { habits: [], consistency: vazio() };

function vazio(): HabitsDashboard["consistency"] {
  return {
    completionRate30: 0,
    done30: 0,
    scheduled30: 0,
    weekly: [],
    heatmap: [],
    ranking: [],
  };
}

vi.mock("@/lib/format", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/format")>()),
  hojeISO: () => HOJE,
}));

vi.mock("@/lib/habits/queries", () => ({
  getHabitsDashboard: async () => painelFalso,
}));

const { getToday, getStreaks } = await import("./habits");

/* ═══════════════════════════ Fixtures mínimas ═══════════════════════════ */

function habito(
  over: Partial<HabitWithStats> & { id: string; name: string },
): HabitWithStats {
  return {
    user_id: "u1",
    category: "saude",
    color: null,
    created_at: "2026-01-01T00:00:00.000Z",
    description: null,
    frequency: "diario",
    icon: null,
    is_active: true,
    position: 0,
    reminder_at: null,
    target_value: 1,
    time_of_day: null,
    unit: "vezes",
    updated_at: "2026-01-01T00:00:00.000Z",
    weekdays: [1, 2, 3, 4, 5, 6, 7],
    todayLog: null,
    scheduledToday: true,
    todayValue: 0,
    todayDone: false,
    streak: 0,
    bestStreak: 0,
    consistency7: { scheduled: 7, done: 7, rate: 1 },
    consistency30: { scheduled: 30, done: 15, rate: 0.5 },
    doneDates: [],
    last7: [],
    recentLogs: [],
    ...over,
  } as HabitWithStats;
}

/**
 * FIXTURE — 4 hábitos, "hoje" é 2026-08-07.
 *
 *  H1 "Beber água"   ativo · agendado hoje · JÁ FEITO      · streak 12
 *  H2 "Ler"          ativo · agendado hoje · ainda não     · streak 3
 *  H3 "Corrida"      ativo · NÃO agendado hoje             · streak 5
 *  H4 "Meditar"      DESATIVADO                            · não entra em nada
 *
 *  ativos = 3 · agendados_hoje = 2 · concluidos_hoje = 1 · pendentes_hoje = 1
 *  nao_agendados_hoje = 1 · maior streak = 12 (H1)
 */
const FIXTURE: HabitWithStats[] = [
  habito({
    id: "h1",
    name: "Beber água",
    unit: "ml",
    target_value: 2000,
    todayValue: 2000,
    todayDone: true,
    streak: 12,
    bestStreak: 30,
  }),
  habito({ id: "h2", name: "Ler", streak: 3, bestStreak: 9 }),
  habito({
    id: "h3",
    name: "Corrida",
    frequency: "semanal",
    scheduledToday: false,
    streak: 5,
    bestStreak: 5,
    // Não caiu nenhuma vez na janela de 7 dias: 0 de 0 agendados.
    consistency7: { scheduled: 0, done: 0, rate: 0 },
  }),
  habito({ id: "h4", name: "Meditar", is_active: false, streak: 99, bestStreak: 99 }),
];

beforeEach(() => {
  painelFalso = {
    habits: [...FIXTURE],
    consistency: { ...vazio(), completionRate30: 0.6, done30: 30, scheduled30: 50 },
  };
});

/* ═══════════════════════════════ Testes ═══════════════════════════════ */

describe("habits.get_today", () => {
  it("conta ativos, agendados, concluídos e pendentes com os números da fixture", async () => {
    const saida = await getToday();

    expect(saida.agregados).toMatchObject({
      ativos: 3,
      agendados_hoje: 2,
      concluidos_hoje: 1,
      pendentes_hoje: 1,
      nao_agendados_hoje: 1,
    });
    expect(saida.contagem).toBe(3);
  });

  /**
   * Um hábito semanal que não cai hoje NÃO é pendência. Se ele entrasse em
   * `pendentes_hoje`, a resposta cobraria o usuário por algo que ele nem deveria fazer.
   */
  it("hábito não agendado hoje fica fora de agendados e de pendentes", async () => {
    const saida = await getToday();
    const corrida = saida.itens.find(
      (i) => (i as { habito: string }).habito === "Corrida",
    ) as { agendado_hoje: boolean };

    expect(corrida.agendado_hoje).toBe(false);
    expect(saida.agregados).toMatchObject({ agendados_hoje: 2 });
  });

  it("hábito desativado não entra em nenhum total", async () => {
    const saida = await getToday();
    const nomes = saida.itens.map((i) => (i as { habito: string }).habito);
    expect(nomes).not.toContain("Meditar");
    // H4 tem streak 99: se entrasse, o "maior" de get_streaks também mudaria.
    expect(saida.contagem).toBe(3);
  });

  it("emite UMA ref do painel, não uma por hábito", async () => {
    const saida = await getToday();
    expect(saida.refs).toEqual([
      { tipo: "painel_de_habitos", id: "habitos", rota: "/habitos" },
    ]);
  });

  it("sem hábito ativo, distingue 'nenhum cadastrado' de 'todos desativados'", async () => {
    painelFalso = { habits: [FIXTURE[3]], consistency: vazio() };
    expect((await getToday()).observacao).toContain("desativados");

    painelFalso = { habits: [], consistency: vazio() };
    expect((await getToday()).observacao).toContain("não há hábito cadastrado");
  });
});

describe("habits.get_streaks", () => {
  it("relata a maior sequência entre os ativos, ignorando o desativado", async () => {
    const saida = await getStreaks();
    expect(saida.agregados).toMatchObject({
      maior_sequencia_atual: 12,
      // H4 (desativado) tem 99 — se entrasse, este número seria 99.
      maior_sequencia_ja_alcancada: 30,
    });
  });

  it("converte a taxa geral de 30/50 em 60%", async () => {
    const saida = await getStreaks();
    expect(saida.agregados).toMatchObject({
      consistencia_geral_30_dias: {
        agendados: 50,
        concluidos: 30,
        taxa_percentual: 60,
      },
    });
  });

  /**
   * ⚠️ O TESTE CENTRAL DESTE ARQUIVO. H3 tem `consistency7 = { scheduled: 0, done: 0, rate: 0 }`.
   * Relatar `taxa_percentual: 0` faria o modelo dizer "0% de conclusão na semana" sobre um
   * hábito que não teve um único dia agendado.
   */
  it("taxa sem dia agendado vem NULA, com o motivo — nunca 0%", async () => {
    const saida = await getStreaks();
    const corrida = saida.itens.find(
      (i) => (i as { habito: string }).habito === "Corrida",
    ) as {
      ultimos_7_dias: {
        agendados: number;
        concluidos: number;
        taxa_percentual: number | null;
        taxa_indisponivel_porque?: string;
      };
    };

    expect(corrida.ultimos_7_dias.taxa_percentual).toBeNull();
    expect(corrida.ultimos_7_dias.agendados).toBe(0);
    expect(corrida.ultimos_7_dias.taxa_indisponivel_porque).toContain("não é 0%");
  });

  it("com denominador, a taxa aparece normalmente", async () => {
    const saida = await getStreaks();
    const ler = saida.itens.find(
      (i) => (i as { habito: string }).habito === "Ler",
    ) as { ultimos_7_dias: { taxa_percentual: number | null } };

    expect(ler.ultimos_7_dias.taxa_percentual).toBe(100);
  });
});
