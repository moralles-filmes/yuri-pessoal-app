/**
 * Fase 16-F — o backup contém tudo do usuário e NENHUM segredo.
 *
 * É um dos testes obrigatórios da subfase ("export contém só o usuário e nenhum token").
 * O que ele trava:
 *
 *  1. nenhuma tabela de credencial na lista;
 *  2. nenhuma tabela do módulo Dieta ou de medidas corporais esquecida — um módulo que não
 *     se registra aqui só é descoberto quando alguém precisa restaurar o backup;
 *  3. nenhuma view (derivação) sendo exportada como se fosse dado.
 */
import { describe, expect, it } from "vitest";
import { EXPORT_EXCLUDED, EXPORT_TABLES } from "./export-tables";

describe("backup do usuário", () => {
  it("não inclui NENHUMA tabela de credencial", () => {
    // `google_integrations` guarda tokens OAuth. Um backup que vaza é ruim; um backup que
    // vaza tokens é outra ordem de problema.
    for (const forbidden of Object.keys(EXPORT_EXCLUDED)) {
      expect(EXPORT_TABLES as string[], forbidden).not.toContain(forbidden);
    }
  });

  it("nenhum nome de tabela sugere segredo", () => {
    for (const table of EXPORT_TABLES) {
      expect(table).not.toMatch(/token|secret|credential|oauth|password|key$/i);
    }
  });

  /**
   * ⚠️ 31, não 32. O banco tem 32 tabelas `nutrition_*`, mas UMA delas —
   * `nutrition_nutrients` — é vocabulário GLOBAL do sistema (sem `user_id`), recriado por
   * migration. Ela não é dado do usuário e por isso não entra no backup.
   * (`nutrition_foods_view` é view, e views não contam como tabela.)
   */
  it("inclui as 31 tabelas do módulo Dieta que são dado do usuário", () => {
    const nutrition = EXPORT_TABLES.filter((t) => t.startsWith("nutrition_"));
    expect(nutrition).toHaveLength(31);
    // Amostra das que existem em cada subfase — se uma sumir, o backup perde a subfase.
    for (const table of [
      "nutrition_foods", // 16-A
      "nutrition_diary_entries", // 16-B — o histórico imutável
      "nutrition_recipes", // 16-C
      "nutrition_shopping_lists", // 16-D
      "nutrition_pantry_items", // 16-D
    ]) {
      expect(nutrition as string[], table).toContain(table);
    }
  });

  it("inclui as 4 tabelas centrais de medidas corporais (body_*)", () => {
    const body = EXPORT_TABLES.filter((t) => t.startsWith("body_"));
    expect(body).toHaveLength(4);
    expect(body as string[]).toContain("body_measurements");
    expect(body as string[]).toContain("body_progress_photos");
  });

  /**
   * ⚠️ Ponto de contato entre as DUAS FRENTES. A Fase 17 (Treinos) acrescenta as suas tabelas
   * a esta mesma lista. O teste existe para que um merge que descarte a seção do outro seja
   * pego aqui, e não meses depois, quando alguém tentar restaurar o backup.
   */
  it("inclui as 26 tabelas do módulo Treinos (frente paralela)", () => {
    const training = EXPORT_TABLES.filter((t) => t.startsWith("training_"));
    expect(training).toHaveLength(26);
    for (const table of [
      "training_exercises", // 17-A
      "training_workouts", // 17-B
      "training_sessions", // 17-C — o histórico imutável
      "training_personal_records", // 17-D
      "training_goal_progress", // 17-E
    ]) {
      expect(training as string[], table).toContain(table);
    }
  });

  it("`nutrition_nutrients` fica de fora — é vocabulário do sistema, não dado do usuário", () => {
    expect(EXPORT_TABLES as string[]).not.toContain("nutrition_nutrients");
    expect(EXPORT_EXCLUDED.nutrition_nutrients).toBeTruthy();
  });

  it("nenhuma VIEW é exportada como se fosse tabela", () => {
    for (const table of EXPORT_TABLES) {
      expect(table, table).not.toMatch(/_view$/);
      expect(table, table).not.toMatch(/_with_total$/);
    }
  });

  it("não há tabela repetida (linha duplicada no JSON do backup)", () => {
    expect(new Set(EXPORT_TABLES).size).toBe(EXPORT_TABLES.length);
  });

  it("toda exclusão tem um motivo escrito, não só uma ausência", () => {
    for (const [table, reason] of Object.entries(EXPORT_EXCLUDED)) {
      expect(reason.length, table).toBeGreaterThan(20);
    }
  });
});
