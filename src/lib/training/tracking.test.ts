import { describe, expect, it } from "vitest";
import {
  EFFECTIVE_LOAD_MESSAGES,
  effectiveLoadKg,
  fieldsForTracking,
  missingRequiredFields,
  resolveIncrementKg,
  resolveRestSeconds,
  snapToIncrement,
  trackingSpec,
  usesField,
} from "./tracking";
import { TRACKING_TYPES } from "./constants";

describe("trackingSpec — a matriz de medição", () => {
  it("cobre todos os tipos declarados no enum (nenhum tipo sem contrato)", () => {
    for (const type of TRACKING_TYPES) {
      expect(trackingSpec(type)).toBeDefined();
    }
  });

  it("peso e repetições exige as duas coisas", () => {
    const { required } = fieldsForTracking("peso_reps");
    expect(required).toEqual(["weight", "reps"]);
  });

  it("peso corporal não pede peso digitado", () => {
    expect(usesField("peso_corporal_reps", "weight")).toBe(false);
    expect(usesField("peso_corporal_reps", "reps")).toBe(true);
  });

  it("assistido exige a assistência — sem ela não dá para saber o quanto aliviou", () => {
    const { required } = fieldsForTracking("peso_corporal_assistido");
    expect(required).toContain("assistanceWeight");
    expect(trackingSpec("peso_corporal_assistido").loadSign).toBe(-1);
  });

  it("carga adicional soma (sinal positivo) e assistência subtrai (sinal negativo)", () => {
    expect(trackingSpec("peso_corporal_adicional").loadSign).toBe(1);
    expect(trackingSpec("peso_corporal_assistido").loadSign).toBe(-1);
  });

  it("duração não usa carga e acumula em segundos", () => {
    const spec = trackingSpec("duracao");
    expect(spec.usesLoad).toBe(false);
    expect(spec.volumeUnit).toBe("segundos");
  });

  it("distância e duração aceita inclinação e resistência como opcionais", () => {
    const { required, optional } = fieldsForTracking("distancia_duracao");
    expect(required).toEqual(["distance", "duration"]);
    expect(optional).toContain("incline");
    expect(optional).toContain("resistance");
  });

  it("calorias acumula na própria unidade — nunca vira quilo nem repetição", () => {
    expect(trackingSpec("calorias").volumeUnit).toBe("calorias");
  });

  it("repetições sem carga não somam volume em kg", () => {
    expect(trackingSpec("reps_sem_carga").volumeUnit).toBe("reps");
  });

  it("lado a lado exige os dois lados", () => {
    expect(fieldsForTracking("lado_a_lado").required).toContain("sides");
  });

  it("exercício unilateral ganha o registro por lado como OPÇÃO", () => {
    const bilateral = fieldsForTracking("peso_reps", "bilateral");
    const unilateral = fieldsForTracking("peso_reps", "unilateral_alternado");
    expect(bilateral.optional).not.toContain("sides");
    expect(unilateral.optional).toContain("sides");
    // Continua opcional: não obriga o usuário a preencher dois campos toda série.
    expect(unilateral.required).not.toContain("sides");
  });
});

describe("missingRequiredFields", () => {
  it("acusa o que falta", () => {
    expect(missingRequiredFields("peso_reps", { weight: 80 })).toEqual(["reps"]);
  });

  it("aceita a série completa", () => {
    expect(missingRequiredFields("peso_reps", { weight: 80, reps: 8 })).toEqual([]);
  });

  it("zero é um valor válido — não conta como ausente", () => {
    expect(missingRequiredFields("peso_reps", { weight: 0, reps: 12 })).toEqual([]);
  });

  it("null e NaN contam como ausentes", () => {
    expect(missingRequiredFields("peso_reps", { weight: null, reps: Number.NaN })).toEqual([
      "weight",
      "reps",
    ]);
  });
});

describe("effectiveLoadKg — quantos quilos a série moveu", () => {
  it("peso e repetições devolve o peso digitado", () => {
    expect(effectiveLoadKg({ trackingType: "peso_reps", weightKg: 80 })).toEqual({
      ok: true,
      kg: 80,
    });
  });

  it("peso corporal usa o peso do dia", () => {
    expect(
      effectiveLoadKg({ trackingType: "peso_corporal_reps", bodyWeightKg: 78.4 }),
    ).toEqual({ ok: true, kg: 78.4 });
  });

  it("carga adicional SOMA ao peso corporal", () => {
    expect(
      effectiveLoadKg({
        trackingType: "peso_corporal_adicional",
        bodyWeightKg: 80,
        additionalWeightKg: 20,
      }),
    ).toEqual({ ok: true, kg: 100 });
  });

  it("assistência SUBTRAI do peso corporal — o erro clássico é somar", () => {
    expect(
      effectiveLoadKg({
        trackingType: "peso_corporal_assistido",
        bodyWeightKg: 80,
        assistanceWeightKg: 30,
      }),
    ).toEqual({ ok: true, kg: 50 });
  });

  it("assistência maior que o peso corporal não gera carga negativa", () => {
    expect(
      effectiveLoadKg({
        trackingType: "peso_corporal_assistido",
        bodyWeightKg: 60,
        assistanceWeightKg: 90,
      }),
    ).toEqual({ ok: true, kg: 0 });
  });

  it("sem peso corporal registrado devolve INDISPONÍVEL, nunca zero", () => {
    const result = effectiveLoadKg({ trackingType: "peso_corporal_reps", bodyWeightKg: null });
    expect(result).toEqual({ ok: false, reason: "sem_peso_corporal" });
    expect(EFFECTIVE_LOAD_MESSAGES.sem_peso_corporal).toContain("peso corporal");
  });

  it("exercício de duração não tem carga", () => {
    expect(effectiveLoadKg({ trackingType: "duracao", weightKg: 10 })).toEqual({
      ok: false,
      reason: "nao_usa_carga",
    });
  });

  it("prancha e esteira não somam carga nenhuma", () => {
    expect(effectiveLoadKg({ trackingType: "distancia_duracao" }).ok).toBe(false);
    expect(effectiveLoadKg({ trackingType: "calorias" }).ok).toBe(false);
    expect(effectiveLoadKg({ trackingType: "reps_sem_carga" }).ok).toBe(false);
  });

  it("carga não informada é um estado próprio, distinto de 'não usa carga'", () => {
    expect(effectiveLoadKg({ trackingType: "peso_reps", weightKg: null })).toEqual({
      ok: false,
      reason: "carga_nao_informada",
    });
  });

  it("peso zero é carga válida (barra vazia continua sendo uma medida)", () => {
    expect(effectiveLoadKg({ trackingType: "peso_reps", weightKg: 0 })).toEqual({
      ok: true,
      kg: 0,
    });
  });
});

describe("resolução de incremento e descanso", () => {
  it("a preferência do usuário sobre o exercício ganha de tudo", () => {
    expect(
      resolveIncrementKg({
        prefIncrementKg: 1,
        exerciseIncrementKg: 2.5,
        equipmentIncrementKg: 5,
        defaultIncrementKg: 2.5,
      }),
    ).toBe(1);
  });

  it("sem preferência, vale o do exercício; sem ele, o do equipamento", () => {
    expect(
      resolveIncrementKg({
        exerciseIncrementKg: 2.5,
        equipmentIncrementKg: 5,
        defaultIncrementKg: 10,
      }),
    ).toBe(2.5);
    expect(resolveIncrementKg({ equipmentIncrementKg: 5, defaultIncrementKg: 10 })).toBe(5);
  });

  it("sem nada, cai no padrão do módulo", () => {
    expect(resolveIncrementKg({ defaultIncrementKg: 2.5 })).toBe(2.5);
    expect(resolveRestSeconds({ defaultRestSeconds: 90 })).toBe(90);
  });

  it("descanso zero é uma escolha válida e não cai no padrão", () => {
    expect(resolveRestSeconds({ prefRestSeconds: 0, defaultRestSeconds: 90 })).toBe(0);
  });
});

describe("snapToIncrement", () => {
  it("arredonda para o múltiplo mais próximo do incremento", () => {
    expect(snapToIncrement(61.3, 2.5)).toBe(62.5);
    expect(snapToIncrement(61.2, 2.5)).toBe(60);
  });

  it("não devolve lixo de ponto flutuante", () => {
    expect(snapToIncrement(62.4999, 2.5)).toBe(62.5);
  });

  it("incremento inválido devolve o peso original em vez de dividir por zero", () => {
    expect(snapToIncrement(80, 0)).toBe(80);
    expect(snapToIncrement(80, Number.NaN)).toBe(80);
  });
});
