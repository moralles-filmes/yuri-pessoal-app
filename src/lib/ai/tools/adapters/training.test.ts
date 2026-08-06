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
import { DEFAULT_TRAINING_PREFERENCES, type TrainingPreferences } from "@/lib/training/types";
import { diffDaysIso } from "@/lib/training/schedule";
import { SECURITY_PROMPT } from "@/lib/ai/agents/security-prompt";

let historicoFalso: MetricSession[] = [];
let recordesFalsos: PersonalRecord[] = [];
let ultimaFaixa: {
  from?: string | null;
  to?: string | null;
  days?: number;
  limit?: number;
} | null = null;
let prefsFalsas: TrainingPreferences = DEFAULT_TRAINING_PREFERENCES;

vi.mock("@/lib/training/history-queries", () => ({
  getSessionHistory: async (
    range: { from?: string; to?: string; days?: number; limit?: number } = {},
  ) => {
    ultimaFaixa = range;
    return range.limit ? historicoFalso.slice(0, range.limit) : historicoFalso;
  },
  getPersonalRecords: async () => recordesFalsos,
}));

vi.mock("@/lib/training/queries", () => ({
  getTrainingPreferences: async () => prefsFalsas,
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

/**
 * SESSÃO D — 05/08, peso corporal 80 kg. Existe para SEPARAR as duas preferências, uma de
 * cada vez. Os padrões do banco coincidem com os do código — é por isso que o defeito de
 * ignorar `MetricOptions` passou por toda a suíte anterior sem falhar nenhuma vez.
 *
 *   Rosca unilateral (peso_reps, unilateral_alternado, Bíceps): 1 × 10 reps × 30 kg
 *     · soma_dos_lados (padrão): 1 série · 20 reps · 30×10×2 = 600 kg
 *     · serie_completa:          1 série · 10 reps · 30×10×1 = 300 kg
 *   Supino reto (peso_reps, bilateral, Peito): aquecimento 10 × 20 kg + trabalho 10 × 60 kg
 *     · aquecimento fora (padrão): 1 série · 10 reps ·             600 kg
 *     · aquecimento incluído:      2 séries · 20 reps · 200 + 600 = 800 kg
 *
 *   PADRÃO:                1200 kg · 2 séries · 30 reps
 *   serie_completa:         900 kg · 2 séries · 20 reps
 *   aquecimento incluído:  1400 kg · 3 séries · 40 reps
 */
const SESSAO_D: MetricSession = {
  id: "s4",
  sessionDate: "2026-08-05",
  status: "concluida",
  workoutId: null,
  workoutName: "Treino D",
  programId: null,
  programName: null,
  bodyWeightKg: 80,
  totalSeconds: 2400,
  activeSeconds: 2000,
  exercises: [
    {
      id: "s4-e1",
      exerciseId: null,
      exerciseName: "Rosca unilateral",
      trackingType: "peso_reps",
      laterality: "unilateral_alternado",
      muscleGroup: "Bíceps",
      countsInVolume: true,
      sets: [serie(1, 10, 30)],
    },
    {
      id: "s4-e2",
      exerciseId: null,
      exerciseName: "Supino reto",
      trackingType: "peso_reps",
      laterality: "bilateral",
      muscleGroup: "Peito",
      countsInVolume: true,
      sets: [
        { ...serie(1, 10, 20), setType: "aquecimento", isWarmup: true },
        serie(2, 10, 60),
      ],
    },
  ],
};

/**
 * SESSÃO E — 06/08, treino de esteira. NENHUMA série acumula em kg.
 *   Corrida (distancia_duracao): 5000 m em 1800 s
 *   Bike (calorias): 250 kcal
 * Volume em kg: NÃO SE APLICA — não é zero. É a invariante 21 da 17-E no agregado.
 */
const SESSAO_E: MetricSession = {
  id: "s5",
  sessionDate: "2026-08-06",
  status: "concluida",
  workoutId: null,
  workoutName: "Cardio",
  programId: null,
  programName: null,
  bodyWeightKg: 80,
  totalSeconds: 2000,
  activeSeconds: 1900,
  exercises: [
    {
      id: "s5-e1",
      exerciseId: null,
      exerciseName: "Corrida na esteira",
      trackingType: "distancia_duracao",
      laterality: "bilateral",
      muscleGroup: "Pernas",
      countsInVolume: true,
      sets: [
        {
          ...serie(1, 0, null),
          reps: null,
          distanceM: 5000,
          durationSeconds: 1800,
        },
      ],
    },
    {
      id: "s5-e2",
      exerciseId: null,
      exerciseName: "Bicicleta ergométrica",
      trackingType: "calorias",
      laterality: "bilateral",
      muscleGroup: "Pernas",
      countsInVolume: true,
      sets: [{ ...serie(1, 0, null), reps: null, calories: 250 }],
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
  prefsFalsas = DEFAULT_TRAINING_PREFERENCES;
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

  // O nome do exercício vem do catálogo COM acento; o modelo repete o que o usuário digitou,
  // e usuário digita sem acento. Sem normalizar, a ferramenta afirmaria que não há recorde de
  // tríceps para quem tem — pior que não responder.
  it("o filtro ignora acento: 'triceps' encontra 'Tríceps testa'", async () => {
    recordesFalsos = [recorde({ id: "r4", exerciseName: "Tríceps testa" })];

    const saida = await getRecords({ exercicio: "triceps" });

    expect(saida.contagem).toBe(1);
    expect(saida.itens[0]).toMatchObject({ exercicio: "Tríceps testa" });
  });
});

/* ═══════════════════════════ As preferências do usuário ═══════════════════════════
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ O NÚMERO DA IA TEM DE ACOMPANHAR A PREFERÊNCIA, COMO O DA TELA ACOMPANHA.             ║
 * ║                                                                                       ║
 * ║ Estes testes exercitam preferência NÃO PADRÃO. Com os padrões, um adapter que ignora  ║
 * ║ `MetricOptions` dá exatamente o mesmo resultado de um que as respeita — e foi assim    ║
 * ║ que o defeito atravessou a suíte inteira. Os totais continuam literais calculados à    ║
 * ║ mão no comentário da SESSÃO D.                                                        ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */

const COM_SERIE_COMPLETA: TrainingPreferences = {
  ...DEFAULT_TRAINING_PREFERENCES,
  unilateralVolumeRule: "serie_completa",
};

const COM_AQUECIMENTO: TrainingPreferences = {
  ...DEFAULT_TRAINING_PREFERENCES,
  countWarmupInVolume: true,
};

describe("as ferramentas usam as MESMAS opções de métrica que a tela", () => {
  it("padrão do sistema: 1200 kg, 2 séries, 30 repetições", async () => {
    historicoFalso = [SESSAO_D];

    const saida = await getLastWorkout();

    expect(saida.agregados.volume_kg).toBe(1200);
    expect(saida.agregados.series).toBe(2);
    expect(saida.agregados.repeticoes).toBe(30);
  });

  it("regra unilateral 'serie_completa' derruba o volume para 900 kg — não são 1200", async () => {
    historicoFalso = [SESSAO_D];
    prefsFalsas = COM_SERIE_COMPLETA;

    const saida = await getLastWorkout();

    expect(saida.agregados.volume_kg).toBe(900);
    expect(saida.agregados.repeticoes).toBe(20);
    expect(saida.agregados.series).toBe(2);
  });

  it("contar aquecimento no volume sobe para 1400 kg e para 3 séries", async () => {
    historicoFalso = [SESSAO_D];
    prefsFalsas = COM_AQUECIMENTO;

    const saida = await getLastWorkout();

    expect(saida.agregados.volume_kg).toBe(1400);
    expect(saida.agregados.series).toBe(3);
    expect(saida.agregados.series_de_aquecimento).toBe(1);
    expect(saida.agregados.repeticoes).toBe(40);
  });

  it("o período agregado obedece à preferência tanto quanto o treino isolado", async () => {
    historicoFalso = [SESSAO_D];
    prefsFalsas = COM_SERIE_COMPLETA;

    const saida = await getVolume({ dias: 7 });

    expect(saida.agregados.volume_kg).toBe(900);
    expect(saida.agregados.volume_por_grupo_muscular).toEqual({ Bíceps: 300, Peito: 600 });
  });

  // Invariante 12 da Fase 17: a regra de contagem aparece AO LADO do número. Sem ela, 900 e
  // 1200 são o mesmo treino e nenhum dos dois é verificável.
  it("a REGRA DE CONTAGEM viaja junto do número, e muda com a preferência", async () => {
    historicoFalso = [SESSAO_D];

    const padrao = await getLastWorkout();
    expect(padrao.agregados.regra_de_contagem).toBe(
      "Somar os dois lados numa série · aquecimento fora do volume",
    );

    prefsFalsas = COM_SERIE_COMPLETA;
    const completa = await getLastWorkout();
    expect(completa.agregados.regra_de_contagem).toBe(
      "Contar a série completa uma vez · aquecimento fora do volume",
    );

    prefsFalsas = COM_AQUECIMENTO;
    const comAquecimento = await getVolume({ dias: 7 });
    expect(comAquecimento.agregados.regra_de_contagem).toBe(
      "Somar os dois lados numa série · aquecimento incluído do volume",
    );
  });
});

/* ═══════════════════════ Ausência de dado não é zero (no agregado) ═══════════════════════ */

describe("nenhum total é apresentado como zero quando a unidade não se aplica", () => {
  it("treino só de cardio NÃO relata volume_kg — relata distância e calorias", async () => {
    historicoFalso = [SESSAO_E];

    const saida = await getLastWorkout();

    expect(saida.agregados.volume_kg).toBeUndefined();
    expect(saida.agregados.distancia_m).toBe(5000);
    expect(saida.agregados.calorias).toBe(250);
    expect(saida.agregados.segundos_sob_tensao).toBe(1800);
    expect(saida.agregados.unidades).toEqual(
      expect.arrayContaining(["distancia", "calorias"]),
    );
  });

  it("período só de cardio também não inventa volume zero", async () => {
    historicoFalso = [SESSAO_E];

    const saida = await getVolume({ dias: 7 });

    expect(saida.agregados.volume_kg).toBeUndefined();
    expect(saida.agregados.distancia_m).toBe(5000);
  });

  // A frase do "parcial" é a MESMA da tela (`partialExplanation`, 17-D). Um texto próprio
  // aqui faria a IA explicar o parcial com outras palavras — divergência da mesma família
  // que a das opções de métrica.
  it("a ressalva do parcial é a frase do módulo, não um texto do adapter", async () => {
    historicoFalso = [SESSAO_C];

    const saida = await getLastWorkout();

    expect(saida.completude).toBe("parcial");
    expect(saida.motivo_incompleto).toContain("1 série");
    expect(saida.motivo_incompleto).toContain("Registre o peso corporal");
  });

  /**
   * ╔══════════════════════════════════════════════════════════════════════════════════════╗
   * ║ O CASO LIMITE DA INVARIANTE 3, FIXADO DE PROPÓSITO: O ZERO PASSA — COM O TRIO JUNTO. ║
   * ║                                                                                       ║
   * ║ Um treino só de barra fixa SEM peso corporal do dia tem `units: ["kg"]` (houve série  ║
   * ║ elegível de unidade kg) e `volumeKg: 0` (nenhuma pôde contribuir). Este é o único     ║
   * ║ ponto do adapter em que um zero atravessa, e ele atravessa porque a TELA mostra o     ║
   * ║ mesmo: `metrics-summary.tsx` decide o card de Volume por `totals.units.includes("kg")`║
   * ║ e escreve "0 kg" com o selo "Parcial — veja o motivo abaixo".                          ║
   * ║                                                                                       ║
   * ║ "Sem peso corporal do dia, a carga efetiva é INDISPONÍVEL, nunca zero" é honrada pelo ║
   * ║ que VIAJA JUNTO do número, não por esconder o campo. Este teste falha nas duas        ║
   * ║ direções: se alguém remover o zero (a IA passaria a divergir da tela) OU se alguém    ║
   * ║ remover qualquer peça da ressalva (o zero viraria afirmação de volume zero).           ║
   * ╚══════════════════════════════════════════════════════════════════════════════════════╝
   */
  it("sem peso corporal, o zero passa — mas nunca sozinho", async () => {
    historicoFalso = [SESSAO_C];

    const saida = await getLastWorkout();

    // Paridade com a tela: o campo existe e vale 0, como o card "0 kg".
    expect(saida.agregados.volume_kg).toBe(0);
    expect(saida.agregados.unidades).toEqual(["kg"]);
    // E as TRÊS peças da ressalva, que são o que impede o 0 de ser lido como fato medido.
    expect(saida.completude).toBe("parcial");
    expect(saida.motivo_incompleto).toBeTruthy();
    expect(saida.agregados.lacunas).toEqual([{ reason: "sem_peso_corporal", sets: 1 }]);
  });

  // O contraste que separa "medido zero" de "não se aplica": no cardio a unidade kg nunca
  // aparece em `units`, e aí o campo NÃO existe — não é 0.
  it("o zero de barra fixa e a ausência do cardio são coisas diferentes", async () => {
    historicoFalso = [SESSAO_C];
    const semPeso = await getLastWorkout();

    historicoFalso = [SESSAO_E];
    const cardio = await getLastWorkout();

    expect(Object.hasOwn(semPeso.agregados, "volume_kg")).toBe(true);
    expect(Object.hasOwn(cardio.agregados, "volume_kg")).toBe(false);
  });
});

/* ═══════════════════════ A janela do "último treino" ═══════════════════════ */

describe("training.get_last_workout — a janela consultada", () => {
  // `limit: 1` corta o RESULTADO, não a janela. Com os 365 dias padrão de
  // `getSessionHistory`, quem parou de treinar há mais de um ano recebia "não há treino
  // registrado" — afirmação falsa sobre o próprio registro.
  it("procura MUITO além de um ano — 365 dias não é 'o histórico'", async () => {
    historicoFalso = [SESSAO_A];

    await getLastWorkout();

    expect(ultimaFaixa?.limit).toBe(1);
    expect(ultimaFaixa?.days ?? 0).toBeGreaterThanOrEqual(3650);
  });

  it("o caso vazio DECLARA a janela consultada, em vez de afirmar que nunca houve treino", async () => {
    historicoFalso = [];

    const saida = await getLastWorkout();

    expect(saida.contagem).toBe(0);
    expect(saida.observacao).toContain("janela consultada");
    expect(saida.observacao).toContain("10 anos");
  });
});

/* ═════════ O prompt-base só pode prometer o que os agregados REALMENTE trazem ═════════ */

/**
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ O item 8-A dizia "somas, médias, contagens e comparações já vêm prontas em            ║
 * ║ `agregados`". As três ferramentas não calculam UMA média nem UMA comparação — e o     ║
 * ║ mesmo item PROÍBE combinar resultados entre si. "Minha média de volume por sessão?"   ║
 * ║ ficava sem saída: o número prometido não chega e a conta está vedada, então o modelo  ║
 * ║ improvisa.                                                                            ║
 * ║                                                                                       ║
 * ║ Conferir só que os NOMES citados existem não pega isto: "agregados" existe. Este      ║
 * ║ teste lê a promessa do prompt, lista o que ela promete, e exige que CADA categoria    ║
 * ║ prometida tenha uma chave real correspondente na saída das ferramentas. É o texto      ║
 * ║ amarrado ao conteúdo, não ao vocabulário.                                              ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */
describe("o item 8-A promete exatamente o que as ferramentas calculam", () => {
  /** Toda chave de `agregados` que as três ferramentas produzem sobre as fixtures. */
  async function chavesReais(): Promise<string[]> {
    historicoFalso = [SESSAO_A, SESSAO_B, SESSAO_C, SESSAO_D, SESSAO_E];
    recordesFalsos = [recorde({})];

    const saidas = [await getLastWorkout(), await getVolume({ dias: 30 }), await getRecords({})];
    return [...new Set(saidas.flatMap((s) => Object.keys(s.agregados)))].sort();
  }

  /**
   * Cada categoria que o prompt pode prometer, e como se prova que ela existe de verdade.
   * As listas são LITERAIS de propósito: derivá-las da saída faria o teste concordar com
   * qualquer coisa que a ferramenta devolvesse.
   */
  const SOMAS = new Set([
    "volume_kg",
    "repeticoes",
    "segundos_sob_tensao",
    "distancia_m",
    "calorias",
    "duracao_total_segundos",
    "duracao_ativa_segundos",
  ]);
  const CONTAGENS = new Set([
    "series",
    "series_de_trabalho",
    "series_de_aquecimento",
    "sessoes",
    "dias_com_treino",
    "total_de_recordes",
  ]);
  const MEDIA = /m[ée]dia/;
  const COMPARACAO = /(compara|varia|delta|diferen|percentual|evolu|tendenc)/;

  const CATEGORIAS: Record<string, (chaves: string[]) => boolean> = {
    somas: (chaves) => chaves.some((c) => SOMAS.has(c)),
    contagens: (chaves) => chaves.some((c) => CONTAGENS.has(c)),
    médias: (chaves) => chaves.some((c) => MEDIA.test(c)),
    comparações: (chaves) => chaves.some((c) => COMPARACAO.test(c)),
    variações: (chaves) => chaves.some((c) => COMPARACAO.test(c)),
    percentuais: (chaves) => chaves.some((c) => COMPARACAO.test(c)),
  };

  it("tudo que 8-A promete tem chave correspondente na saída real", async () => {
    const promessa = SECURITY_PROMPT.match(
      /O sistema calcula ([^.]+?) e as entrega prontas no campo "agregados"/,
    );
    // Se a frase for reescrita, este teste tem de ser reescrito junto — silêncio aqui
    // significaria promessa nenhuma verificada.
    expect(promessa, "a frase da promessa do 8-A não foi encontrada no prompt-base").not.toBeNull();

    const prometidas = (promessa as RegExpMatchArray)[1]
      .split(/,| e /)
      .map((t) => t.trim())
      .filter(Boolean);
    expect(prometidas.length).toBeGreaterThan(0);

    const chaves = await chavesReais();

    for (const categoria of prometidas) {
      const prova = CATEGORIAS[categoria];
      expect(
        prova,
        `8-A promete "${categoria}", que este teste não sabe verificar — descreva a categoria aqui`,
      ).toBeDefined();
      expect(
        prova(chaves),
        `8-A promete "${categoria}", mas nenhuma ferramenta devolve um agregado desses`,
      ).toBe(true);
    }
  });

  it("e 8-D só pode negar médias e comparações enquanto elas não existirem", async () => {
    const chaves = await chavesReais();

    // Se um adapter passar a calcular média ou comparação, o 8-D vira mentira e precisa ser
    // reescrito — este teste é o aviso.
    expect(chaves.filter((c) => MEDIA.test(c))).toEqual([]);
    expect(chaves.filter((c) => COMPARACAO.test(c))).toEqual([]);
    expect(SECURITY_PROMPT).toContain(
      "Médias, comparações entre dois períodos, variações e percentuais de evolução não são calculados por nenhuma ferramenta",
    );
  });

  it("a diferença entre duas marcas de um recorde NÃO vem pronta", async () => {
    // "Quanto eu melhorei no supino?" é a pergunta que expõe o buraco: `valor` e
    // `marca_anterior` chegam, o delta não. Sem o ramo negativo do 8-D, o modelo subtrai.
    recordesFalsos = [recorde({})];

    const saida = await getRecords({});

    expect(saida.itens[0]).toMatchObject({ valor: 100, marca_anterior: 95 });
    expect(Object.keys(saida.agregados)).toEqual(["total_de_recordes"]);
  });
});
