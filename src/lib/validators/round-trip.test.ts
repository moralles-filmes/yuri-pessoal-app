/**
 * ⛔ **O schema tem de aceitar a própria saída.**
 *
 * Este arquivo existe por causa de um bug real em produção: "Novo treino" mostrava
 * "Verifique os campos destacados." e não salvava NUNCA, mesmo com todos os campos
 * preenchidos, e sem destacar campo algum.
 *
 * A causa é estrutural, não um descuido de um formulário só:
 *
 *   1. O `zodResolver` valida os valores do formulário e o react-hook-form entrega ao
 *      `onSubmit` a saída **já transformada** — não o que o usuário digitou.
 *   2. O formulário manda essa saída para a Server Action.
 *   3. A action valida de novo, com o **mesmo** schema.
 *
 * Logo, `schema.parse(schema.parse(x))` precisa funcionar. `optionalText` transformava
 * `""`/ausente em `null` mas só aceitava `string | undefined` na entrada — recusava a
 * própria saída. Como `icon` é opcional e nem aparece no formulário, ele chegava `null` na
 * segunda passada e derrubava o salvamento **sempre**, para qualquer preenchimento.
 *
 * O teste abaixo é uma **propriedade**, não um caso: vale para todo schema que atravesse
 * esse caminho. Quem criar um formulário novo com `zodResolver` deve acrescentar o schema
 * aqui — é mais barato que descobrir pelo usuário.
 */
import { describe, expect, it } from "vitest";
import { optionalText } from "@/lib/validators/shared";
import {
  aiPreferencesSchema,
  aiProviderConfigSchema,
} from "@/lib/validators/ai";
import { TOOL_PERMISSIONS, TOOL_WRITE_PERMISSIONS } from "@/lib/ai/tools/contracts";
import {
  programSchema,
  programUpdateSchema,
  workoutSchema,
  workoutUpdateSchema,
} from "@/lib/validators/training-routines";
import {
  trainingExerciseSchema,
  trainingExerciseUpdateSchema,
} from "@/lib/validators/training";
import {
  deleteSessionSchema,
  progressionRuleSchema,
  progressionRuleUpdateSchema,
  suggestionDecisionSchema,
} from "@/lib/validators/training-history";
import {
  goalProgressEntrySchema,
  trainingGoalDeleteSchema,
  trainingGoalSchema,
  trainingGoalStatusSchema,
  trainingGoalUpdateSchema,
} from "@/lib/validators/training-goals";

const UUID = "11111111-2222-4333-8444-555555555555";

/**
 * Faz a viagem inteira: valida como o resolver faria, manda a SAÍDA para a action e valida
 * de novo. Devolve a segunda validação para o teste inspecionar.
 */
function roundTrip<T>(schema: { safeParse: (v: unknown) => { success: boolean; data?: T; error?: unknown } }, formValues: unknown) {
  const noCliente = schema.safeParse(formValues);
  expect(noCliente.success, "o formulário deveria passar na validação do client").toBe(true);
  const noServidor = schema.safeParse(noCliente.data);
  return { noCliente, noServidor };
}

/** Erros por campo, em formato legível quando o teste quebra (avaliado mesmo quando passa). */
function fieldErrors(error: unknown) {
  if (!error) return "sem erros";
  const flat = (error as { flatten: () => { fieldErrors: Record<string, string[]> } }).flatten();
  return JSON.stringify(flat.fieldErrors);
}

describe("optionalText aceita a própria saída", () => {
  const schema = optionalText(100);

  it("transforma vazio, ausente e null em null", () => {
    expect(schema.parse("")).toBeNull();
    expect(schema.parse(undefined)).toBeNull();
    expect(schema.parse(null)).toBeNull();
  });

  it("aceita o null que ele mesmo produz (idempotência)", () => {
    const primeira = schema.parse("");
    expect(() => schema.parse(primeira)).not.toThrow();
    expect(schema.parse(primeira)).toBeNull();
  });

  it("continua aparando espaços e recusando texto longo demais", () => {
    expect(schema.parse("  peito  ")).toBe("peito");
    expect(schema.safeParse("x".repeat(101)).success).toBe(false);
  });
});

describe("treino-modelo: o formulário de 'Novo treino' salva", () => {
  /** Exatamente o que a tela tem: nenhum campo para `icon` ou `color`. */
  const doFormulario = {
    name: "Treino A",
    short_name: "A",
    description: "",
    goal: "hipertrofia",
    program_id: "",
    estimated_minutes: "60",
    notes: "",
  };

  it("passa no servidor com os opcionais em branco", () => {
    const { noServidor } = roundTrip(workoutSchema, doFormulario);
    expect(noServidor.success, fieldErrors(noServidor.error)).toBe(true);
  });

  it("passa no servidor com tudo preenchido", () => {
    const { noServidor } = roundTrip(workoutSchema, {
      ...doFormulario,
      description: "Peito e tríceps",
      notes: "Aquecer os ombros antes",
      program_id: UUID,
    });
    expect(noServidor.success, fieldErrors(noServidor.error)).toBe(true);
  });

  it("preserva os valores na segunda passada", () => {
    const { noCliente, noServidor } = roundTrip(workoutSchema, doFormulario);
    expect(noServidor.data).toEqual(noCliente.data);
  });

  it("vale também para a edição", () => {
    const { noServidor } = roundTrip(workoutUpdateSchema, { ...doFormulario, id: UUID });
    expect(noServidor.success, fieldErrors(noServidor.error)).toBe(true);
  });

  it("continua recusando o que é de fato inválido", () => {
    expect(workoutSchema.safeParse({ ...doFormulario, name: "" }).success).toBe(false);
    expect(workoutSchema.safeParse({ ...doFormulario, goal: "inventado" }).success).toBe(false);
  });
});

describe("programa: o formulário de 'Novo programa' salva", () => {
  const doFormulario = {
    name: "Programa base",
    description: "",
    goal: "hipertrofia",
    level: "intermediario",
    starts_on: "",
    ends_on: "",
    duration_weeks: "",
    weekly_frequency: "",
    notes: "",
  };

  it("passa no servidor com os opcionais em branco", () => {
    const { noServidor } = roundTrip(programSchema, doFormulario);
    expect(noServidor.success, fieldErrors(noServidor.error)).toBe(true);
  });

  it("vale também para a edição", () => {
    const { noServidor } = roundTrip(programUpdateSchema, { ...doFormulario, id: UUID });
    expect(noServidor.success, fieldErrors(noServidor.error)).toBe(true);
  });

  it("continua recusando período invertido", () => {
    const invertido = { ...doFormulario, starts_on: "2026-08-10", ends_on: "2026-08-01" };
    expect(programSchema.safeParse(invertido).success).toBe(false);
  });
});

describe("exercício: o formulário de 'Novo exercício' salva", () => {
  const doFormulario = {
    name: "Supino reto",
    alternative_name: "",
    description: "",
    primary_muscle_group_id: UUID,
    equipment_id: null,
    movement_pattern: "empurrar_horizontal",
    exercise_type: "forca",
    tracking_type: "peso_reps",
    laterality: "bilateral",
    instructions: "",
    tips: "",
    common_mistakes: "",
    notes: "",
    video_url: "",
    default_rest_seconds: "",
    default_increment_kg: "",
    secondary_muscles: [],
  };

  it("passa no servidor com os opcionais em branco", () => {
    const { noServidor } = roundTrip(trainingExerciseSchema, doFormulario);
    expect(noServidor.success, fieldErrors(noServidor.error)).toBe(true);
  });

  it("vale também para a edição", () => {
    const { noServidor } = roundTrip(trainingExerciseUpdateSchema, { ...doFormulario, id: UUID });
    expect(noServidor.success, fieldErrors(noServidor.error)).toBe(true);
  });

  it("continua exigindo o grupo muscular principal", () => {
    const semGrupo = { ...doFormulario, primary_muscle_group_id: "" };
    expect(trainingExerciseSchema.safeParse(semGrupo).success).toBe(false);
  });
});

/* ───────────────────────── Fase 17-D — regra de progressão ───────────────────────── */

describe("regra de progressão (17-D)", () => {
  const doFormulario = {
    name: "Progressão do supino",
    scope: "exercicio",
    exercise_id: UUID,
    muscle_group_id: "",
    min_sessions: 2,
    require_top_of_range: true,
    require_all_working_sets: true,
    require_no_failure: true,
    max_rir: "",
    max_rpe: "",
    max_difficulty: "adequada",
    increment_mode: "incremento_minimo",
    increment_kg: "",
    increment_percent: "",
    is_active: true,
    notes: "",
  };

  it("passa no servidor com os opcionais em branco", () => {
    const { noServidor } = roundTrip(progressionRuleSchema, doFormulario);
    expect(noServidor.success, fieldErrors(noServidor.error)).toBe(true);
  });

  it("vale também para a edição", () => {
    const { noServidor } = roundTrip(progressionRuleUpdateSchema, { ...doFormulario, id: UUID });
    expect(noServidor.success, fieldErrors(noServidor.error)).toBe(true);
  });

  it("escopo de exercício sem exercício escolhido destaca o campo certo", () => {
    const parsed = progressionRuleSchema.safeParse({ ...doFormulario, exercise_id: "" });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.flatten().fieldErrors.exercise_id).toBeTruthy();
    }
  });

  it("incremento fixo sem valor destaca o campo do incremento", () => {
    const parsed = progressionRuleSchema.safeParse({
      ...doFormulario,
      increment_mode: "fixo",
      increment_kg: "",
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.flatten().fieldErrors.increment_kg).toBeTruthy();
    }
  });

  it("menos de 2 sessões é recusado — uma série isolada nunca gera sugestão", () => {
    expect(progressionRuleSchema.safeParse({ ...doFormulario, min_sessions: 1 }).success).toBe(false);
  });

  it("a decisão sobre uma sugestão não tem valor padrão", () => {
    expect(suggestionDecisionSchema.safeParse({ id: UUID }).success).toBe(false);
    expect(suggestionDecisionSchema.safeParse({ id: UUID, decision: "aceitar" }).success).toBe(true);
  });

  it("excluir uma sessão exige confirmação explícita", () => {
    expect(deleteSessionSchema.safeParse({ id: UUID }).success).toBe(false);
    expect(deleteSessionSchema.safeParse({ id: UUID, confirm: false }).success).toBe(false);
    expect(deleteSessionSchema.safeParse({ id: UUID, confirm: true }).success).toBe(true);
  });
});

/* ═══════════════════════════ Fase 17-E — Metas de treino ═══════════════════════════ */

describe("metas de treino (17-E)", () => {
  const doFormulario = {
    name: "4 treinos por semana",
    description: "",
    goal_kind: "frequencia",
    metric: "treinos_por_semana",
    exercise_id: "",
    muscle_group_id: "",
    program_id: "",
    body_measurement_type_id: "",
    direction: "aumentar",
    period: "semanal",
    starts_on: "2026-08-01",
    ends_on: "",
    start_value: "",
    target_value: "4",
    unit: "treinos",
    milestones: [],
    status: "ativa",
    notes: "",
  };

  it("passa no servidor com os opcionais em branco", () => {
    const { noServidor } = roundTrip(trainingGoalSchema, doFormulario);
    expect(noServidor.success, fieldErrors(noServidor.error)).toBe(true);
  });

  it("vale também para a edição", () => {
    const { noServidor } = roundTrip(trainingGoalUpdateSchema, { ...doFormulario, id: UUID });
    expect(noServidor.success, fieldErrors(noServidor.error)).toBe(true);
  });

  it("os marcos sobrevivem à ida e volta", () => {
    const { noCliente, noServidor } = roundTrip(trainingGoalSchema, {
      ...doFormulario,
      milestones: [
        { value: "2", label: "", due_on: "" },
        { value: "3", label: "quase lá", due_on: "2026-09-30" },
      ],
    });
    expect(noServidor.success, fieldErrors(noServidor.error)).toBe(true);
    const saida = noCliente.data as { milestones: { value: number; label: string | null; due_on: string | null }[] };
    expect(saida.milestones).toEqual([
      { value: 2, label: null, due_on: null },
      { value: 3, label: "quase lá", due_on: "2026-09-30" },
    ]);
  });

  it("valor inicial em branco vira NULL, nunca 0", () => {
    const parsed = trainingGoalSchema.safeParse(doFormulario);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.start_value).toBeNull();
  });

  it("aceita valor digitado no padrão BR", () => {
    const parsed = trainingGoalSchema.safeParse({
      ...doFormulario,
      goal_kind: "desempenho",
      metric: "peso_exercicio",
      exercise_id: UUID,
      unit: "kg",
      target_value: "102,5",
      start_value: "1.000,25",
    });
    expect(parsed.success, parsed.success ? "" : fieldErrors(parsed.error)).toBe(true);
    if (parsed.success) {
      expect(parsed.data.target_value).toBe(102.5);
      expect(parsed.data.start_value).toBe(1000.25);
    }
  });

  it("métrica fora da família escolhida destaca o campo da métrica", () => {
    const parsed = trainingGoalSchema.safeParse({
      ...doFormulario,
      goal_kind: "frequencia",
      metric: "peso_exercicio",
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.flatten().fieldErrors.metric).toBeTruthy();
  });

  it("meta de exercício sem exercício destaca o campo certo", () => {
    const parsed = trainingGoalSchema.safeParse({
      ...doFormulario,
      goal_kind: "desempenho",
      metric: "peso_exercicio",
      unit: "kg",
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.flatten().fieldErrors.exercise_id).toBeTruthy();
  });

  it("meta corporal sem tipo de medida destaca o campo da medida", () => {
    const parsed = trainingGoalSchema.safeParse({
      ...doFormulario,
      goal_kind: "corporal",
      metric: "medida_corporal",
      direction: "reduzir",
      unit: "kg",
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.flatten().fieldErrors.body_measurement_type_id).toBeTruthy();
    }
  });

  it("período personalizado sem data final destaca o prazo", () => {
    const parsed = trainingGoalSchema.safeParse({ ...doFormulario, period: "personalizado" });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.flatten().fieldErrors.ends_on).toBeTruthy();
  });

  it("prazo antes do início destaca o prazo", () => {
    const parsed = trainingGoalSchema.safeParse({
      ...doFormulario,
      starts_on: "2026-08-10",
      ends_on: "2026-08-01",
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.flatten().fieldErrors.ends_on).toBeTruthy();
  });

  it("unidade em branco destaca o campo da unidade", () => {
    const parsed = trainingGoalSchema.safeParse({ ...doFormulario, unit: "" });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.flatten().fieldErrors.unit).toBeTruthy();
  });

  it("STATUS DERIVADO não é gravável", () => {
    for (const derivado of ["atingida", "expirada", "em_atraso"]) {
      expect(trainingGoalSchema.safeParse({ ...doFormulario, status: derivado }).success).toBe(false);
      expect(
        trainingGoalStatusSchema.safeParse({ id: UUID, status: derivado }).success,
      ).toBe(false);
    }
  });

  it("mudar a situação exige uma escolha explícita", () => {
    expect(trainingGoalStatusSchema.safeParse({ id: UUID }).success).toBe(false);
    expect(trainingGoalStatusSchema.safeParse({ id: UUID, status: "pausada" }).success).toBe(true);
  });

  it("excluir uma meta exige confirmação explícita", () => {
    expect(trainingGoalDeleteSchema.safeParse({ id: UUID }).success).toBe(false);
    expect(trainingGoalDeleteSchema.safeParse({ id: UUID, confirm: false }).success).toBe(false);
    expect(trainingGoalDeleteSchema.safeParse({ id: UUID, confirm: true }).success).toBe(true);
  });

  it("registro manual de progresso também faz a ida e volta", () => {
    const { noServidor } = roundTrip(goalProgressEntrySchema, {
      goal_id: UUID,
      recorded_on: "2026-08-05",
      value: "12,5",
      note: "",
    });
    expect(noServidor.success, fieldErrors(noServidor.error)).toBe(true);
  });
});

/**
 * ─────────────────────────── Fase 18-A · Inteligência Artificial ───────────────────────────
 *
 * Os formulários de IA usam estado local + Server Action, e NÃO `zodResolver`. Mesmo assim a
 * propriedade vale, e os testes de ida e volta estão em `src/lib/validators/ai.test.ts` — a
 * action valida a saída do formulário com o MESMO schema, então `parse(parse(x))` precisa
 * funcionar de qualquer jeito. Um `optional*` que só aceitasse `""`/ausente quebraria na
 * segunda passada, exatamente como quebrou em "Novo treino".
 *
 * O teste abaixo é a amarra: se algum desses schemas passar a ser usado com resolver, ele
 * já está coberto aqui também.
 */
describe("Fase 18-A — schemas de IA aceitam a própria saída", () => {
  it("aiProviderConfigSchema e aiPreferencesSchema fazem a ida e volta", () => {
    const config = roundTrip(aiProviderConfigSchema, {
      provider: "openai",
      enabled: false,
      displayName: "",
      defaultModel: "",
      economyModel: "",
      advancedModel: "",
      visionModel: "",
      timeoutMs: 60000,
      maxRetries: 1,
      fallbackAllowed: false,
    });
    expect(config.noServidor.success, fieldErrors(config.noServidor.error)).toBe(true);

    const prefs = roundTrip(aiPreferencesSchema, {
      // Derivado de `TOOL_PERMISSIONS` de propósito: uma permissão nova entra no schema e
      // entra AQUI no mesmo instante. Um objeto literal ficaria para trás e o teste passaria
      // a provar a ida e volta de um formulário que não existe mais.
      permissions: Object.fromEntries(TOOL_PERMISSIONS.map((p) => [p, false])),
      // Mesma derivação, mesmo motivo (18-C · Bloco 4).
      writePermissions: Object.fromEntries(TOOL_WRITE_PERMISSIONS.map((p) => [p, false])),
      defaultModel: "",
      confirmationMode: "seguro",
      allowFallback: false,
      budgetBlockOnLimit: true,
      reservationMargin: 1.15,
      rateLimitPerMinute: 10,
      rateLimitPerHour: 120,
    });
    expect(prefs.noServidor.success, fieldErrors(prefs.noServidor.error)).toBe(true);
  });
});
