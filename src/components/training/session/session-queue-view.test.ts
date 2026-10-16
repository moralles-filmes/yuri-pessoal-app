/**
 * REDESIGN-07-C · D1 — as regras que a tela da sessão consome.
 *
 * S3: o status nasce do tamanho da fila e a camada otimista é refeita dela; S1: a revisão não
 * finaliza com a fila pendente; S4/(e'): descanso já vencido ao montar não bipa de novo.
 * Dados sintéticos.
 */
import { describe, expect, it } from "vitest";
import type { QueuedMutation } from "./use-session-queue";
import {
  avisosDoFimDoDescanso,
  estadoExibido,
  optimisticFromQueue,
  optimisticPatch,
  pendentesTexto,
  podeEncerrar,
  registrosNoAparelhoTexto,
} from "./session-queue-view";

const valores = {
  reps: 8,
  weight_kg: 60,
  additional_weight_kg: null,
  assistance_weight_kg: null,
  duration_seconds: null,
  distance_m: null,
  calories: null,
  incline_percent: null,
  resistance_level: null,
  reps_left: null,
  reps_right: null,
  rir: 2,
  rpe: null,
  difficulty: null,
  notes: null,
};

const serie = (id: string, setId: string, status: string, extra: Record<string, unknown> = {}): QueuedMutation => ({
  id,
  kind: "registrar_serie",
  payload: { session_set_id: setId, status, ...valores, start_rest: true, rest_seconds: 90, ...extra },
  createdAt: 0,
});

describe("S3 — o status nasce do tamanho da fila", () => {
  it("'salvo' com registro pendente vira 'salvo no dispositivo'", () => {
    expect(estadoExibido("salvo", 2)).toBe("salvo_no_dispositivo");
    expect(estadoExibido("salvo", 1)).toBe("salvo_no_dispositivo");
  });

  it("fila vazia e os demais estados passam como vieram", () => {
    expect(estadoExibido("salvo", 0)).toBe("salvo");
    expect(estadoExibido("salvando", 3)).toBe("salvando");
    expect(estadoExibido("aguardando_conexao", 3)).toBe("aguardando_conexao");
    expect(estadoExibido("erro", 3)).toBe("erro");
  });

  it("a contagem diz o quê", () => {
    expect(pendentesTexto(1)).toBe("1 a enviar");
    expect(pendentesTexto(3)).toBe("3 a enviar");
  });

  it("o diálogo de finalizar diz quantos registros estão só no aparelho, no plural certo", () => {
    expect(registrosNoAparelhoTexto(1)).toBe("1 registro ainda está só neste aparelho");
    expect(registrosNoAparelhoTexto(3)).toBe("3 registros ainda estão só neste aparelho");
  });
});

describe("S3 — a camada otimista é refeita da fila", () => {
  it("cada série registrada na fila volta a aparecer feita, com os valores digitados", () => {
    expect(optimisticFromQueue([serie("m1", "set-1", "concluida")])).toEqual({
      "set-1": optimisticPatch("concluida", valores),
    });
  });

  it("a última mutação de cada série vence (desfazer depois de concluir)", () => {
    const fila = [serie("m1", "set-1", "concluida"), serie("m2", "set-1", "pendente", { reps: null })];
    expect(optimisticFromQueue(fila)["set-1"]).toEqual(optimisticPatch("pendente", { ...valores, reps: null }));
  });

  it("só 'registrar_serie' entra; payload sem série ou com status estranho é ignorado", () => {
    const fila: QueuedMutation[] = [
      { id: "d", kind: "iniciar_descanso", payload: {}, createdAt: 0 },
      { id: "x", kind: "registrar_serie", payload: { status: "concluida" }, createdAt: 0 },
      { id: "y", kind: "registrar_serie", payload: { session_set_id: "set-9", status: "explodiu" }, createdAt: 0 },
    ];
    expect(optimisticFromQueue(fila)).toEqual({});
  });

  it("a conversão é a que registerSet sempre fez", () => {
    expect(optimisticPatch("concluida", valores)).toEqual({
      status: "concluida",
      values: {
        reps: 8,
        weightKg: 60,
        additionalWeightKg: null,
        assistanceWeightKg: null,
        durationSeconds: null,
        distanceM: null,
        rir: 2,
        rpe: null,
        difficulty: null,
      },
    });
  });
});

describe("S1 — a revisão só encerra com a fila do aparelho vazia", () => {
  it("fila vazia: pode", () => {
    expect(podeEncerrar({ pending: 0 })).toEqual({ ok: true });
  });

  it("fila pendente: recusa dizendo quantos faltam", () => {
    expect(podeEncerrar({ pending: 1 })).toEqual({
      ok: false,
      motivo: "1 registro deste aparelho ainda não chegou ao servidor.",
    });
    expect(podeEncerrar({ pending: 2 })).toEqual({
      ok: false,
      motivo: "2 registros deste aparelho ainda não chegaram ao servidor.",
    });
  });
});

describe("(e') o fim do descanso avisa uma vez, e não ao remontar um descanso já vencido", () => {
  const base = {
    isOver: true,
    isRunning: true,
    jaAvisou: false,
    jaAvancou: false,
    vencidoNaMontagem: false,
    deveAvancar: false,
  };

  it("descanso que acaba com o painel aberto toca", () => {
    expect(avisosDoFimDoDescanso(base)).toEqual({ tocar: true, avancar: false });
  });

  it("descanso que já tinha acabado quando o painel montou NÃO toca de novo", () => {
    expect(avisosDoFimDoDescanso({ ...base, vencidoNaMontagem: true })).toEqual({
      tocar: false,
      avancar: false,
    });
  });

  it("…mas o avanço automático continua acontecendo, uma vez", () => {
    expect(avisosDoFimDoDescanso({ ...base, vencidoNaMontagem: true, deveAvancar: true })).toEqual({
      tocar: false,
      avancar: true,
    });
    expect(
      avisosDoFimDoDescanso({ ...base, vencidoNaMontagem: true, deveAvancar: true, jaAvancou: true }),
    ).toEqual({ tocar: false, avancar: false });
  });

  it("depois de avisar, não repete a cada tique", () => {
    expect(avisosDoFimDoDescanso({ ...base, jaAvisou: true, jaAvancou: true, deveAvancar: true })).toEqual({
      tocar: false,
      avancar: false,
    });
  });

  it("antes do fim, ou parado, nada acontece", () => {
    expect(avisosDoFimDoDescanso({ ...base, isOver: false, deveAvancar: true })).toEqual({
      tocar: false,
      avancar: false,
    });
    expect(avisosDoFimDoDescanso({ ...base, isRunning: false, deveAvancar: true })).toEqual({
      tocar: false,
      avancar: false,
    });
  });
});
