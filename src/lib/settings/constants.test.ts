import { describe, expect, it } from "vitest";
import {
  NOTIFICATION_OPT_IN_TYPES,
  NOTIFICATION_TYPES,
  type NotificationType,
} from "@/lib/notifications/constants";
import {
  NOTIFICATION_PREF_GROUPS,
  NOTIFICATION_TYPE_HINTS,
  NOTIFICATION_TYPES_SEM_INTERRUPTOR,
} from "./constants";

/**
 * REDESIGN-07-D · D5 — toda preferência de notificação tem onde ser escolhida (spec §6.5, M16).
 *
 * O defeito: as quatro famílias de IA (18-F Bloco 1) nunca entraram em
 * `NOTIFICATION_PREF_GROUPS`. As três que nascem ligadas seguiam ligadas (ausente = ligado), mas
 * `ai_insight_available` é OPT-IN — nasce desligada — e não havia interruptor para ligá-la. E
 * salvar o cartão grava só os tipos dos grupos, então nada a ligaria por outro caminho.
 *
 * Derivado das listas, nunca de uma lista à mão: tipo novo sem grupo nem motivo derruba a suíte.
 */
const NOS_GRUPOS = NOTIFICATION_PREF_GROUPS.flatMap((g) => g.types);
const SEM_INTERRUPTOR = Object.keys(NOTIFICATION_TYPES_SEM_INTERRUPTOR) as NotificationType[];

describe("preferências de notificação", () => {
  it("todo tipo opt-in tem interruptor — senão nasce desligado e nunca liga (M16)", () => {
    const orfaos = NOTIFICATION_OPT_IN_TYPES.filter((t) => !NOS_GRUPOS.includes(t));
    expect(orfaos).toEqual([]);
  });

  it("todo tipo está num grupo OU na lista sem interruptor, nunca nos dois nem em nenhum", () => {
    for (const tipo of NOTIFICATION_TYPES) {
      const emGrupo = NOS_GRUPOS.includes(tipo);
      const semInterruptor = SEM_INTERRUPTOR.includes(tipo);
      expect(emGrupo !== semInterruptor, tipo).toBe(true);
    }
  });

  it("nenhum tipo aparece em dois grupos", () => {
    expect(new Set(NOS_GRUPOS).size).toBe(NOS_GRUPOS.length);
  });

  it("tipo sem interruptor diz por quê, e não pode ser opt-in", () => {
    for (const [tipo, porque] of Object.entries(NOTIFICATION_TYPES_SEM_INTERRUPTOR)) {
      expect(porque.length, tipo).toBeGreaterThan(20);
      expect(NOTIFICATION_OPT_IN_TYPES, tipo).not.toContain(tipo);
    }
  });

  // 03-G (D-G12, D-G33) — o quarto: a verificação incompleta do Cron também não se desliga.
  it("os três avisos de IA e a verificação incompleta ficam sem interruptor; o opt-in de IA ganha o seu", () => {
    expect(SEM_INTERRUPTOR.sort()).toEqual(
      [
        "ai_action_stuck",
        "ai_budget_threshold",
        "ai_provider_problem",
        "sistema_verificacao_incompleta",
      ].sort(),
    );
    const grupoDaIa = NOTIFICATION_PREF_GROUPS.find((g) => g.types.includes("ai_insight_available"));
    expect(grupoDaIa?.title).toBe("Inteligência Artificial");
    expect(grupoDaIa?.nota).toMatch(/não têm interruptor/);
  });

  it("todo opt-in diz, na dica, que nasce desligado", () => {
    for (const tipo of NOTIFICATION_OPT_IN_TYPES) {
      expect(NOTIFICATION_TYPE_HINTS[tipo], tipo).toMatch(/^Desligado por padrão\./);
    }
  });
});
