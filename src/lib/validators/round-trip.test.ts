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
