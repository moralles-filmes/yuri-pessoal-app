/**
 * Fase 17-D — Testes de `records.ts`.
 *
 * O que estes testes protegem: **empate não gera recorde novo**, aquecimento e série pulada não
 * viram marca pessoal, a marca anterior é preservada e excluir uma sessão recalcula o recorde
 * (o segundo melhor assume, com a data dele).
 */
import { describe, expect, it } from "vitest";
import type { MetricExercise, MetricSession, MetricSet } from "./metrics";
import {
  consolidateRecords,
  dedupeCandidates,
  detectRecords,
  diffRebuild,
  formatRecordValue,
  previousMarkLabel,
  rebuildRecords,
  recordKey,
  recordTypesForTracking,
  staleRecordKeys,
  type RecordCandidate,
  type StoredRecord,
} from "./records";

function makeSet(overrides: Partial<MetricSet> = {}): MetricSet {
  return {
    id: "set-1",
    setNumber: 1,
    status: "concluida",
    setType: "trabalho",
    isWarmup: false,
    countsInVolume: true,
    reps: 8,
    weightKg: 100,
    additionalWeightKg: null,
    assistanceWeightKg: null,
    durationSeconds: null,
    distanceM: null,
    calories: null,
    ...overrides,
  };
}

function makeExercise(overrides: Partial<MetricExercise> = {}): MetricExercise {
  return {
    id: "sx-1",
    exerciseId: "cat-supino",
    exerciseName: "Supino reto com barra",
    trackingType: "peso_reps",
    laterality: "bilateral",
    muscleGroup: "Peitoral",
    countsInVolume: true,
    sets: [makeSet()],
    ...overrides,
  };
}

function makeSession(overrides: Partial<MetricSession> = {}): MetricSession {
  return {
    id: "s-1",
    sessionDate: "2026-08-03",
    status: "concluida",
    workoutId: "w-1",
    workoutName: "Treino A",
    programId: null,
    programName: null,
    bodyWeightKg: 80,
    totalSeconds: 3600,
    activeSeconds: 3000,
    exercises: [makeExercise()],
    ...overrides,
  };
}

const byType = (candidates: RecordCandidate[], type: string) =>
  candidates.filter((candidate) => candidate.recordType === type);

/* ═══════════════════════════ Detecção ═══════════════════════════ */

describe("detecção de candidatos", () => {
  it("uma série de 100 kg × 8 gera carga, repetições-no-peso, volume de série, volume de sessão e 1RM", () => {
    const candidates = detectRecords([makeSession()]);
    const types = new Set(candidates.map((candidate) => candidate.recordType));
    expect(types).toContain("maior_peso");
    expect(types).toContain("maior_reps_no_peso");
    expect(types).toContain("melhor_volume_serie");
    expect(types).toContain("melhor_volume_sessao");
    expect(types).toContain("melhor_1rm_estimado");

    expect(byType(candidates, "maior_peso")[0].value).toBe(100);
    expect(byType(candidates, "melhor_volume_serie")[0].value).toBe(800);
  });

  it("série de AQUECIMENTO não gera recorde", () => {
    const candidates = detectRecords([
      makeSession({
        exercises: [makeExercise({ sets: [makeSet({ isWarmup: true, weightKg: 200, reps: 5 })] })],
      }),
    ]);
    expect(byType(candidates, "maior_peso")).toHaveLength(0);
  });

  it.each(["pulada", "cancelada", "pendente"] as const)("série %s não gera recorde", (status) => {
    const candidates = detectRecords([
      makeSession({ exercises: [makeExercise({ sets: [makeSet({ status, weightKg: 300 })] })] }),
    ]);
    expect(byType(candidates, "maior_peso")).toHaveLength(0);
  });

  it("sessão cancelada não gera recorde", () => {
    const candidates = detectRecords([makeSession({ status: "cancelada" })]);
    expect(byType(candidates, "maior_peso")).toHaveLength(0);
  });

  it("cada carga tem seu próprio recorde de repetições", () => {
    const candidates = detectRecords([
      makeSession({
        exercises: [
          makeExercise({
            sets: [
              makeSet({ id: "a", setNumber: 1, weightKg: 100, reps: 5 }),
              makeSet({ id: "b", setNumber: 2, weightKg: 80, reps: 12 }),
            ],
          }),
        ],
      }),
    ]);
    const reps = dedupeCandidates(byType(candidates, "maior_reps_no_peso"));
    expect(reps).toHaveLength(2);
    expect(
      reps.map((candidate) => candidate.referenceWeightKg).sort((a, b) => (a ?? 0) - (b ?? 0)),
    ).toEqual([80, 100]);
  });

  it("exercício de duração gera recorde de tempo, nunca de carga", () => {
    const candidates = detectRecords([
      makeSession({
        exercises: [
          makeExercise({
            exerciseName: "Prancha",
            trackingType: "duracao",
            sets: [makeSet({ weightKg: null, reps: null, durationSeconds: 90 })],
          }),
        ],
      }),
    ]);
    expect(byType(candidates, "maior_duracao")[0].value).toBe(90);
    expect(byType(candidates, "maior_peso")).toHaveLength(0);
  });

  it("exercício de distância gera recorde de distância", () => {
    const candidates = detectRecords([
      makeSession({
        exercises: [
          makeExercise({
            exerciseName: "Esteira",
            trackingType: "distancia_duracao",
            sets: [makeSet({ weightKg: null, reps: null, distanceM: 5000, durationSeconds: 1800 })],
          }),
        ],
      }),
    ]);
    expect(byType(candidates, "maior_distancia")[0].value).toBe(5000);
  });

  it("peso corporal sem o peso do dia não gera recorde de carga (não vira zero)", () => {
    const candidates = detectRecords([
      makeSession({
        bodyWeightKg: null,
        exercises: [
          makeExercise({
            exerciseName: "Barra fixa",
            trackingType: "peso_corporal_reps",
            sets: [makeSet({ weightKg: null, reps: 10 })],
          }),
        ],
      }),
    ]);
    expect(byType(candidates, "maior_peso")).toHaveLength(0);
    expect(byType(candidates, "melhor_volume_serie")).toHaveLength(0);
  });

  it("1RM fora da faixa de validade não vira recorde", () => {
    const candidates = detectRecords([
      makeSession({ exercises: [makeExercise({ sets: [makeSet({ weightKg: 60, reps: 20 })] })] }),
    ]);
    expect(byType(candidates, "melhor_1rm_estimado")).toHaveLength(0);
    // Mas a carga e as repetições continuam sendo recorde legítimo.
    expect(byType(candidates, "maior_peso")).toHaveLength(1);
  });

  it("drop set conta como UMA série no volume de série", () => {
    const candidates = detectRecords([
      makeSession({
        exercises: [
          makeExercise({
            sets: [
              makeSet({ id: "a", setNumber: 1, setType: "drop_set", weightKg: 100, reps: 8 }),
              makeSet({ id: "b", setNumber: 2, setType: "drop_set", weightKg: 70, reps: 8 }),
            ],
          }),
        ],
      }),
    ]);
    const volume = dedupeCandidates(byType(candidates, "melhor_volume_serie"));
    expect(volume).toHaveLength(1);
    expect(volume[0].value).toBe(800 + 560);
  });
});

/* ═══════════════════════════ Recordes gerais ═══════════════════════════ */

describe("recordes de constância", () => {
  const onDates = (dates: string[]) =>
    dates.map((date, index) => makeSession({ id: `s${index}`, sessionDate: date }));

  it("maior sequência de semanas consecutivas", () => {
    const candidates = detectRecords(onDates(["2026-08-03", "2026-08-10", "2026-08-17", "2026-09-07"]));
    const streak = byType(candidates, "maior_sequencia_semanas")[0];
    expect(streak.value).toBe(3);
    expect(streak.scope).toBe("geral");
    expect(streak.exerciseId).toBeNull();
  });

  it("mês com mais treinos conta DIAS distintos", () => {
    const candidates = detectRecords(
      onDates(["2026-08-03", "2026-08-03", "2026-08-05", "2026-09-01"]),
    );
    const month = byType(candidates, "mais_sessoes_mes")[0];
    expect(month.value).toBe(2);
    expect(month.achievedOn).toBe("2026-08-01");
  });
});

/* ═══════════════════════════ Chave e desduplicação ═══════════════════════════ */

describe("chave de consolidação", () => {
  it("usa o id do exercício quando ele existe", () => {
    expect(recordKey({ recordType: "maior_peso", exerciseId: "abc", exerciseName: "Supino" })).toBe(
      "id:abc|maior_peso",
    );
  });

  it("cai para o NOME congelado quando o exercício foi excluído do catálogo", () => {
    expect(
      recordKey({ recordType: "maior_peso", exerciseId: null, exerciseName: "Supino Reto" }),
    ).toBe("nome:supino reto|maior_peso");
  });

  it("a carga de referência entra na chave de 'mais repetições com o mesmo peso'", () => {
    const a = recordKey({ recordType: "maior_reps_no_peso", exerciseId: "x", referenceWeightKg: 80 });
    const b = recordKey({ recordType: "maior_reps_no_peso", exerciseId: "x", referenceWeightKg: 100 });
    expect(a).not.toBe(b);
  });

  it("recorde geral não depende de exercício", () => {
    expect(recordKey({ recordType: "mais_sessoes_mes" })).toBe("geral|mais_sessoes_mes");
  });

  it("desduplicação mantém o melhor; empate mantém a data ORIGINAL", () => {
    const base = {
      key: "id:x|maior_peso",
      scope: "exercicio" as const,
      recordType: "maior_peso" as const,
      exerciseId: "x",
      exerciseName: "Supino",
      unit: "kg" as const,
      referenceWeightKg: null,
      reps: 5,
      weightKg: 100,
      oneRmFormula: null,
      sessionId: "s",
      sessionSetId: "set",
    };

    const deduped = dedupeCandidates([
      { ...base, value: 100, achievedOn: "2026-02-02" },
      { ...base, value: 100, achievedOn: "2026-05-05" },
      { ...base, value: 95, achievedOn: "2026-06-06" },
    ]);

    expect(deduped).toHaveLength(1);
    expect(deduped[0].value).toBe(100);
    expect(deduped[0].achievedOn).toBe("2026-02-02");
  });
});

/* ═══════════════════════════ Consolidação ═══════════════════════════ */

describe("consolidação com o que já estava gravado", () => {
  const candidate = (value: number, achievedOn: string): RecordCandidate => ({
    key: "id:x|maior_peso",
    scope: "exercicio",
    recordType: "maior_peso",
    exerciseId: "x",
    exerciseName: "Supino",
    value,
    unit: "kg",
    referenceWeightKg: null,
    reps: 5,
    weightKg: value,
    oneRmFormula: null,
    achievedOn,
    sessionId: "s",
    sessionSetId: "set",
  });

  const stored = (value: number, achievedOn: string): StoredRecord => ({
    id: "rec-1",
    key: "id:x|maior_peso",
    recordType: "maior_peso",
    value,
    achievedOn,
    previousValue: null,
    previousAchievedOn: null,
  });

  it("primeiro recorde é inserção", () => {
    const result = consolidateRecords([candidate(100, "2026-08-03")], []);
    expect(result.inserts).toHaveLength(1);
    expect(result.updates).toHaveLength(0);
  });

  it("superar vira atualização preservando a marca anterior", () => {
    const result = consolidateRecords(
      [candidate(105, "2026-08-10")],
      [stored(100, "2026-08-03")],
    );
    expect(result.updates).toHaveLength(1);
    expect(result.updates[0].previous.value).toBe(100);
    expect(result.updates[0].previous.achievedOn).toBe("2026-08-03");
  });

  it("EMPATE não gera recorde novo", () => {
    const result = consolidateRecords(
      [candidate(100, "2026-08-10")],
      [stored(100, "2026-08-03")],
    );
    expect(result.inserts).toHaveLength(0);
    expect(result.updates).toHaveLength(0);
    expect(result.unchanged).toHaveLength(1);
  });

  it("marca inferior não substitui a atual", () => {
    const result = consolidateRecords([candidate(90, "2026-08-10")], [stored(100, "2026-08-03")]);
    expect(result.updates).toHaveLength(0);
    expect(result.unchanged).toHaveLength(1);
  });
});

/* ═══════════════════════════ Recálculo após exclusão ═══════════════════════════ */

describe("recálculo depois de excluir uma sessão", () => {
  const heavy = makeSession({
    id: "s-heavy",
    sessionDate: "2026-08-10",
    exercises: [makeExercise({ sets: [makeSet({ weightKg: 120, reps: 5 })] })],
  });
  const light = makeSession({
    id: "s-light",
    sessionDate: "2026-08-03",
    exercises: [makeExercise({ sets: [makeSet({ weightKg: 100, reps: 8 })] })],
  });

  it("com as duas sessões, o recorde é o da mais pesada", () => {
    const rebuilt = rebuildRecords([heavy, light]);
    const record = rebuilt.find((candidate) => candidate.recordType === "maior_peso");
    expect(record?.value).toBe(120);
    expect(record?.achievedOn).toBe("2026-08-10");
  });

  it("excluída a sessão que sustentava a marca, o segundo melhor assume com a data DELE", () => {
    const rebuilt = rebuildRecords([light]);
    const record = rebuilt.find((candidate) => candidate.recordType === "maior_peso");
    expect(record?.value).toBe(100);
    expect(record?.achievedOn).toBe("2026-08-03");
  });

  it("diffRebuild aponta o que muda para MENOS e o que deixou de existir", () => {
    const before = rebuildRecords([heavy, light]);
    const existing: StoredRecord[] = before.map((candidate) => ({
      key: candidate.key,
      recordType: candidate.recordType,
      value: candidate.value,
      achievedOn: candidate.achievedOn,
      previousValue: null,
      previousAchievedOn: null,
    }));

    const after = rebuildRecords([light]);
    const diff = diffRebuild(after, existing);

    const carga = diff.updates.find((update) => update.candidate.recordType === "maior_peso");
    expect(carga?.candidate.value).toBe(100);
    expect(carga?.previous.value).toBe(120);
    // A chave de "12 repetições com 120 kg" não existe mais no histórico.
    expect(diff.removals.some((key) => key.includes("maior_reps_no_peso"))).toBe(true);
  });

  it("sem nenhuma sessão, todos os recordes viram remoção", () => {
    const existing: StoredRecord[] = [
      {
        key: "id:x|maior_peso",
        recordType: "maior_peso",
        value: 100,
        achievedOn: "2026-08-03",
        previousValue: null,
        previousAchievedOn: null,
      },
    ];
    expect(staleRecordKeys([], existing)).toEqual(["id:x|maior_peso"]);
  });
});

/* ═══════════════════════════ Apresentação ═══════════════════════════ */

describe("apresentação", () => {
  it("formata cada unidade do jeito pt-BR", () => {
    expect(formatRecordValue(102.5, "kg")).toBe("102,5 kg");
    expect(formatRecordValue(1, "reps")).toBe("1 repetição");
    expect(formatRecordValue(12, "reps")).toBe("12 repetições");
    expect(formatRecordValue(90, "segundos")).toBe("1 min 30 s");
    expect(formatRecordValue(5000, "metros")).toBe("5 km");
    expect(formatRecordValue(3, "semanas")).toBe("3 semanas");
  });

  it("a marca anterior aparece com a data brasileira", () => {
    expect(previousMarkLabel(95, "2026-02-02", "kg")).toBe("Superou 95 kg de 02/02/2026");
    expect(previousMarkLabel(null, null, "kg")).toBeNull();
  });

  it("os tipos de recorde possíveis dependem do contrato de medição", () => {
    expect(recordTypesForTracking("peso_reps")).toContain("melhor_1rm_estimado");
    expect(recordTypesForTracking("duracao")).toEqual(["maior_duracao"]);
    expect(recordTypesForTracking("distancia_duracao")).toEqual(["maior_distancia"]);
    expect(recordTypesForTracking("calorias")).toEqual([]);
  });
});
