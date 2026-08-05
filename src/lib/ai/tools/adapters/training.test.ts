/**
 * Fase 18-B — IA · O número que a ferramenta relata bate com o que a tela mostra.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ OS TOTAIS ESPERADOS SÃO LITERAIS, CALCULADOS À MÃO NO COMENTÁRIO DE CADA FIXTURE.     ║
 * ║                                                                                       ║
 * ║ Chamar `aggregateSessions` dentro do teste e comparar com a saída do adapter não       ║
 * ║ julgaria nada: as duas contas seriam a mesma conta, e um adapter que somasse errado    ║
 * ║ passaria. A fixture é pequena de propósito — se o total não couber na cabeça, ela      ║
 * ║ está grande demais.                                                                    ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MetricSession, MetricSet } from "@/lib/training/metrics";
import type { PersonalRecord } from "@/lib/training/history-queries";
import { diffDaysIso } from "@/lib/training/schedule";

let historicoFalso: MetricSession[] = [];
let recordesFalsos: PersonalRecord[] = [];
let ultimaFaixa: { from?: string | null; to?: string | null; limit?: number } | null = null;

vi.mock("@/lib/training/history-queries", () => ({
  getSessionHistory: async (range: { from?: string; to?: string; limit?: number } = {}) => {
    ultimaFaixa = range;
    return range.limit ? historicoFalso.slice(0, range.limit) : historicoFalso;
  },
  getPersonalRecords: async () => recordesFalsos,
}));

const { getLastWorkout, getVolume, getRecords } = await import("./training");

/* ═══════════════════════════ Fixtures mínimas ═══════════════════════════ */

function serie(setNumber: number, reps: number, weightKg: number | null): MetricSet {
  return {
    setNumber,
    status: "concluida",
    setType: "trabalho",
    isWarmup: false,
    countsInVolume: true,
    reps,
    weightKg,
    additionalWeightKg: null,
    assistanceWeightKg: null,
    durationSeconds: null,
    distanceM: null,
    calories: null,
  };
}

/**
 * SESSÃO A — 03/08, peso corporal 80 kg.
 *   Supino reto (peso_reps, Peito): 10×60 kg = 600 · 8×60 kg = 480  →  1080 kg
 *   Séries: 2 · Repetições: 18
 */
const SESSAO_A: MetricSession = {
  id: "s1",
  sessionDate: "2026-08-03",
  status: "concluida",
  workoutId: null,
  workoutName: "Treino A",
  programId: null,
  programName: null,
  bodyWeightKg: 80,
  totalSeconds: 3600,
  activeSeconds: 3000,
  exercises: [
    {
      id: "s1-e1",
      exerciseId: null,
      exerciseName: "Supino reto",
      trackingType: "peso_reps",
      laterality: "bilateral",
      muscleGroup: "Peito",
      countsInVolume: true,
      sets: [serie(1, 10, 60), serie(2, 8, 60)],
    },
  ],
};

/**
 * SESSÃO B — 02/08, peso corporal 80 kg.
 *   Agachamento (peso_reps, Pernas): 5×100 kg = 500 kg
 *   Séries: 1 · Repetições: 5
 */
const SESSAO_B: MetricSession = {
  id: "s2",
  sessionDate: "2026-08-02",
  status: "concluida",
  workoutId: null,
  workoutName: "Treino B",
  programId: null,
  programName: null,
  bodyWeightKg: 80,
  totalSeconds: 1800,
  activeSeconds: 1500,
  exercises: [
    {
      id: "s2-e1",
      exerciseId: null,
      exerciseName: "Agachamento",
      trackingType: "peso_reps",
      laterality: "bilateral",
      muscleGroup: "Pernas",
      countsInVolume: true,
      sets: [serie(1, 5, 100)],
    },
  ],
};

/**
 * SESSÃO C — 01/08, SEM peso corporal registrado.
 *   Barra fixa (peso_corporal_reps): a carga efetiva é INDISPONÍVEL, não zero.
 *   Volume em kg: 0 (nada entrou) · Repetições: 6 · Séries: 1 · qualidade: parcial
 */
const SESSAO_C: MetricSession = {
  id: "s3",
  sessionDate: "2026-08-01",
  status: "concluida",
  workoutId: null,
  workoutName: "Treino C",
  programId: null,
  programName: null,
  bodyWeightKg: null,
  totalSeconds: 1200,
  activeSeconds: 1000,
  exercises: [
    {
      id: "s3-e1",
      exerciseId: null,
      exerciseName: "Barra fixa",
      trackingType: "peso_corporal_reps",
      laterality: "bilateral",
      muscleGroup: "Costas",
      countsInVolume: true,
      sets: [serie(1, 6, null)],
    },
  ],
};

function recorde(over: Partial<PersonalRecord>): PersonalRecord {
  return {
    id: "r1",
    exerciseId: null,
    exerciseName: "Supino reto",
    scope: "exercicio",
    recordType: "maior_peso",
    recordKey: "supino",
    value: 100,
    unit: "kg",
    referenceWeightKg: null,
    reps: 1,
    weightKg: 100,
    oneRmFormula: null,
    achievedOn: "2026-07-20",
    sessionId: "s1",
    sessionSetId: null,
    previousValue: 95,
    previousAchievedOn: "2026-06-10",
    notes: null,
    updatedAt: "2026-07-20T10:00:00.000Z",
    ...over,
  };
}

beforeEach(() => {
  historicoFalso = [];
  recordesFalsos = [];
  ultimaFaixa = null;
});

/* ═══════════════════════════ Último treino ═══════════════════════════ */

describe("training.get_last_workout", () => {
  it("relata os totais do treino mais recente — 1080 kg, 2 séries, 18 repetições", async () => {
    historicoFalso = [SESSAO_A, SESSAO_B];

    const saida = await getLastWorkout();

    expect(ultimaFaixa?.limit).toBe(1);
    expect(saida.contagem).toBe(1);
    expect(saida.completude).toBe("exato");
    expect(saida.agregados.treino).toBe("Treino A");
    expect(saida.agregados.data).toBe("2026-08-03");
    expect(saida.agregados.volume_kg).toBe(1080);
    expect(saida.agregados.series).toBe(2);
    expect(saida.agregados.repeticoes).toBe(18);
    expect(saida.agregados.duracao_total_segundos).toBe(3600);
    expect(saida.agregados.duracao_ativa_segundos).toBe(3000);
    expect(saida.periodo).toEqual({ de: "2026-08-03", ate: "2026-08-03" });
    expect(saida.refs).toEqual([
      { tipo: "sessao_de_treino", id: "s1", rota: "/treinos/historico/s1" },
    ]);
  });

  it("sem peso corporal, a carga efetiva é INDISPONÍVEL: parcial com motivo, nunca zero", async () => {
    historicoFalso = [SESSAO_C];

    const saida = await getLastWorkout();

    expect(saida.completude).toBe("parcial");
    expect(saida.motivo_incompleto).toBeTruthy();
    expect(saida.agregados.repeticoes).toBe(6);
    expect(saida.agregados.lacunas).toEqual([{ reason: "sem_peso_corporal", sets: 1 }]);
  });

  it("histórico vazio não inventa treino", async () => {
    historicoFalso = [];

    const saida = await getLastWorkout();

    expect(saida.contagem).toBe(0);
    expect(saida.itens).toEqual([]);
    expect(saida.agregados).toEqual({});
    expect(saida.observacao).toContain("não há treino registrado");
  });
});

/* ═══════════════════════════ Volume do período ═══════════════════════════ */

describe("training.get_volume", () => {
  it("soma as duas sessões — 1580 kg, 3 séries, 23 repetições, 2 dias", async () => {
    historicoFalso = [SESSAO_A, SESSAO_B];

    const saida = await getVolume({ dias: 7 });

    expect(saida.contagem).toBe(2);
    expect(saida.completude).toBe("exato");
    expect(saida.agregados.volume_kg).toBe(1580);
    expect(saida.agregados.series).toBe(3);
    expect(saida.agregados.repeticoes).toBe(23);
    expect(saida.agregados.dias_com_treino).toBe(2);
    expect(saida.agregados.series_por_grupo_muscular).toEqual({ Peito: 2, Pernas: 1 });
    expect(saida.agregados.volume_por_grupo_muscular).toEqual({ Peito: 1080, Pernas: 500 });
  });

  it("uma sessão sem peso corporal torna o período PARCIAL, com o motivo junto", async () => {
    historicoFalso = [SESSAO_B, SESSAO_C];

    const saida = await getVolume({ dias: 7 });

    // 500 kg da sessão B; a barra fixa não entra em kg — e isso é dito, não silenciado.
    expect(saida.agregados.volume_kg).toBe(500);
    expect(saida.agregados.repeticoes).toBe(11);
    expect(saida.completude).toBe("parcial");
    expect(saida.motivo_incompleto).toBeTruthy();
    expect(saida.agregados.lacunas).toEqual([{ reason: "sem_peso_corporal", sets: 1 }]);
  });

  it("período sem treino NÃO vira volume zero: vira ausência declarada", async () => {
    historicoFalso = [];

    const saida = await getVolume({ dias: 7 });

    expect(saida.contagem).toBe(0);
    expect(saida.agregados.volume_kg).toBeUndefined();
    expect(saida.observacao).toContain("ausência de registro");
    expect(saida.periodo).not.toBeNull();
  });

  it("a janela pedida é a janela consultada, e ela termina hoje", async () => {
    historicoFalso = [SESSAO_A];

    await getVolume({ dias: 30 });

    // 30 dias TERMINANDO hoje: de hoje-29 até hoje, inclusivo nos dois extremos.
    expect(diffDaysIso(ultimaFaixa?.from ?? "", ultimaFaixa?.to ?? "")).toBe(29);
    expect(ultimaFaixa?.to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("sem `dias`, a janela padrão é de 7 dias", async () => {
    historicoFalso = [SESSAO_A];

    const saida = await getVolume({});

    expect(diffDaysIso(saida.periodo?.de ?? "", saida.periodo?.ate ?? "")).toBe(6);
  });

  it("toda sessão devolvida vira uma referência clicável", async () => {
    historicoFalso = [SESSAO_A, SESSAO_B];

    const saida = await getVolume({ dias: 7 });

    expect(saida.refs).toEqual([
      { tipo: "sessao_de_treino", id: "s1", rota: "/treinos/historico/s1" },
      { tipo: "sessao_de_treino", id: "s2", rota: "/treinos/historico/s2" },
    ]);
  });

  it("a saída NUNCA carrega user_id", async () => {
    historicoFalso = [SESSAO_A, SESSAO_B, SESSAO_C];

    const cru = JSON.stringify(await getVolume({ dias: 7 }));

    expect(cru).not.toContain("user_id");
    expect(cru).not.toContain("userId");
  });
});

/* ═══════════════════════════ Recordes ═══════════════════════════ */

describe("training.get_records", () => {
  it("devolve os recordes com a marca anterior preservada", async () => {
    recordesFalsos = [recorde({})];

    const saida = await getRecords({});

    expect(saida.contagem).toBe(1);
    expect(saida.agregados.total_de_recordes).toBe(1);
    expect(saida.itens).toEqual([
      {
        exercicio: "Supino reto",
        tipo: "maior_peso",
        valor: 100,
        unidade: "kg",
        repeticoes: 1,
        peso_kg: 100,
        formula_1rm: null,
        alcancado_em: "2026-07-20",
        marca_anterior: 95,
        marca_anterior_em: "2026-06-10",
      },
    ]);
    expect(saida.refs).toEqual([
      { tipo: "sessao_de_treino", id: "s1", rota: "/treinos/historico/s1" },
    ]);
  });

  it("1RM viaja com a FÓRMULA — sem ela a resposta não teria como dizer que é estimativa", async () => {
    recordesFalsos = [
      recorde({ id: "r2", recordType: "melhor_1rm_estimado", oneRmFormula: "epley", value: 120 }),
    ];

    const saida = await getRecords({});

    expect(saida.itens[0]).toMatchObject({ tipo: "melhor_1rm_estimado", formula_1rm: "epley" });
  });

  it("filtra por parte do nome do exercício, sem diferenciar maiúsculas", async () => {
    recordesFalsos = [
      recorde({ id: "r1", exerciseName: "Supino reto" }),
      recorde({ id: "r2", exerciseName: "Agachamento livre", sessionId: "s2" }),
    ];

    const saida = await getRecords({ exercicio: "AGACHA" });

    expect(saida.contagem).toBe(1);
    expect(saida.itens[0]).toMatchObject({ exercicio: "Agachamento livre" });
  });

  it("recorde sem nome de exercício não quebra o filtro nem é atribuído a outro", async () => {
    recordesFalsos = [recorde({ id: "r3", exerciseName: null, scope: "geral" })];

    const filtrado = await getRecords({ exercicio: "supino" });
    const tudo = await getRecords({});

    expect(filtrado.contagem).toBe(0);
    expect(tudo.contagem).toBe(1);
    expect(tudo.itens[0]).toMatchObject({ exercicio: null });
  });

  it("filtro sem resultado diz que não há recorde PARA AQUELE exercício", async () => {
    recordesFalsos = [recorde({})];

    const saida = await getRecords({ exercicio: "levantamento terra" });

    expect(saida.contagem).toBe(0);
    expect(saida.itens).toEqual([]);
    expect(saida.observacao).toContain("levantamento terra");
  });

  it("recorde vazio não inventa recorde", async () => {
    recordesFalsos = [];

    const saida = await getRecords({});

    expect(saida.contagem).toBe(0);
    expect(saida.itens).toEqual([]);
    expect(saida.observacao).toContain("Ainda não há recorde");
  });

  it("recorde sem sessão vinculada não produz rota quebrada", async () => {
    recordesFalsos = [recorde({ sessionId: null })];

    const saida = await getRecords({});

    expect(saida.refs).toEqual([]);
  });
});
