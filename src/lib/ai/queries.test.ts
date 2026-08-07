/**
 * Fase 18-B — IA · As flags `allow_*` que autorizam leitura.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ A PERGUNTA QUE ESTE ARQUIVO RESPONDE: O QUE ACONTECE QUANDO NÃO SE SABE?              ║
 * ║                                                                                       ║
 * ║ Usuário sem linha em `ai_user_preferences`, coluna que não veio na consulta, valor     ║
 * ║ nulo — em todos esses casos a resposta tem de ser DESLIGADO. "Não sei" que vira        ║
 * ║ `undefined` é perigoso aqui: o guard testa `!== true`, então até funcionaria hoje, mas ║
 * ║ qualquer consumidor futuro que escrevesse `!== false` abriria a leitura de todo mundo. ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { TOOL_PERMISSIONS } from "./tools/contracts";

let linha: Record<string, unknown> | null = null;
let colunasPedidas = "";

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => ({
      select: (colunas: string) => {
        colunasPedidas = colunas;
        return {
          eq: () => ({ maybeSingle: async () => ({ data: linha, error: null }) }),
        };
      },
    }),
  }),
}));

const { getAiPreferences } = await import("./queries");

const LINHA_BASE = {
  default_provider: null,
  default_model: null,
  confirmation_mode: "seguro",
  allow_fallback: false,
  daily_budget: null,
  monthly_budget: null,
  budget_block_on_limit: true,
  budget_alert_level_reached: 0,
  reservation_margin: 1.15,
  rate_limit_per_minute: 10,
  rate_limit_per_hour: 120,
};

beforeEach(() => {
  linha = null;
  colunasPedidas = "";
});

describe("getAiPreferences — permissões de leitura", () => {
  it("usuário SEM linha: todas as flags vêm false, nenhuma undefined", async () => {
    const prefs = await getAiPreferences("user-1");

    for (const flag of TOOL_PERMISSIONS) {
      expect(prefs.permissions[flag], flag).toBe(false);
    }
    expect(Object.keys(prefs.permissions).sort()).toEqual([...TOOL_PERMISSIONS].sort());
  });

  it("a consulta pede TODAS as flags que o registry pode exigir", async () => {
    await getAiPreferences("user-1");
    for (const flag of TOOL_PERMISSIONS) {
      expect(colunasPedidas, flag).toContain(flag);
    }
  });

  it("flag ligada no banco chega ligada — e só ela", async () => {
    linha = { ...LINHA_BASE, allow_training: true };

    const prefs = await getAiPreferences("user-1");

    expect(prefs.permissions.allow_training).toBe(true);
    expect(prefs.permissions.allow_finance).toBe(false);
    expect(prefs.permissions.allow_nutrition).toBe(false);
  });

  it("valor nulo ou ausente NÃO autoriza — nem por coerção", async () => {
    linha = { ...LINHA_BASE, allow_training: null, allow_finance: undefined };

    const prefs = await getAiPreferences("user-1");

    expect(prefs.permissions.allow_training).toBe(false);
    expect(prefs.permissions.allow_finance).toBe(false);
  });

  it("valor não booleano vindo do banco também não autoriza", async () => {
    linha = { ...LINHA_BASE, allow_training: "true", allow_body: 1 };

    const prefs = await getAiPreferences("user-1");

    expect(prefs.permissions.allow_training).toBe(false);
    expect(prefs.permissions.allow_body).toBe(false);
  });
});
