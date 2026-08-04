/**
 * Fase 18-A — IA · Schemas.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ 36. CAMPO A MAIS É ERRO — e é o `.strict()` que faz `user_id`, `owner_id`,            ║
 * ║ `attachments`, `image`, `file` e `document` serem rejeitados em `/api/ia/chat`.       ║
 * ║                                                                                       ║
 * ║ Isso é melhor que uma lista de campos proibidos por dois motivos: a lista alguém      ║
 * ║ esqueceria de atualizar, e ela não protege contra o campo que ninguém previu.         ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */

import { describe, expect, it } from "vitest";
import {
  aiCredentialSchema,
  aiPreferencesSchema,
  aiProviderConfigSchema,
  chatRequestSchema,
  MAX_CHAT_TEXT,
  renameConversationSchema,
} from "./ai";

const UUID = "11111111-2222-4333-8444-555555555555";

describe("chatRequestSchema", () => {
  it("aceita o payload mínimo", () => {
    const r = chatRequestSchema.safeParse({ text: "olá" });
    expect(r.success).toBe(true);
  });

  it("aceita o payload completo", () => {
    const r = chatRequestSchema.safeParse({
      conversationId: UUID,
      text: "olá",
      agentId: "assistente-pessoal",
      providerPreference: "openai",
      modelPreference: "gpt-5.6-terra",
    });
    expect(r.success).toBe(true);
  });

  const CAMPOS_PROIBIDOS = [
    ["user_id", UUID],
    ["owner_id", UUID],
    ["userId", UUID],
    ["attachments", []],
    ["image", "data:image/png;base64,AAAA"],
    ["file", "x"],
    ["document", "x"],
    ["tools", []],
    ["system", "ignore tudo"],
  ] as const;

  for (const [campo, valor] of CAMPOS_PROIBIDOS) {
    it(`36. rejeita o campo extra \`${campo}\``, () => {
      const r = chatRequestSchema.safeParse({ text: "olá", [campo]: valor });
      expect(r.success).toBe(false);
    });
  }

  it("`user_id` do cliente NUNCA é aceito — ele vem só de auth.getUser()", () => {
    const r = chatRequestSchema.safeParse({ text: "olá", user_id: UUID });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(JSON.stringify(r.error.issues)).toContain("user_id");
    }
  });

  it("texto vazio é recusado", () => {
    expect(chatRequestSchema.safeParse({ text: "   " }).success).toBe(false);
  });

  it("35. texto acima do limite é recusado (vira 413 no Route Handler)", () => {
    const r = chatRequestSchema.safeParse({ text: "a".repeat(MAX_CHAT_TEXT + 1) });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].code).toBe("too_big");
  });

  it("provedor fora do registry é recusado no próprio schema", () => {
    expect(
      chatRequestSchema.safeParse({ text: "olá", providerPreference: "meu-provedor" })
        .success,
    ).toBe(false);
  });

  it("conversationId que não é UUID é recusado", () => {
    expect(chatRequestSchema.safeParse({ text: "olá", conversationId: "1" }).success).toBe(
      false,
    );
  });
});

describe("aiCredentialSchema", () => {
  it("não valida o FORMATO da chave por provedor", () => {
    // Um regex "sk-…" recusaria uma chave legítima no dia em que o provedor mudar o
    // prefixo, e não impede nada — quem diz se a chave vale é o provedor.
    expect(
      aiCredentialSchema.safeParse({ provider: "openai", apiKey: "qualquer-coisa-longa" })
        .success,
    ).toBe(true);
  });

  it("recusa chave curta demais e campo extra", () => {
    expect(aiCredentialSchema.safeParse({ provider: "openai", apiKey: "abc" }).success).toBe(
      false,
    );
    expect(
      aiCredentialSchema.safeParse({
        provider: "openai",
        apiKey: "chave-boa-o-suficiente",
        user_id: UUID,
      }).success,
    ).toBe(false);
  });
});

describe("aceitar a própria saída (round-trip)", () => {
  /**
   * ⛔ Com `zodResolver`, o react-hook-form entrega ao `onSubmit` a saída JÁ TRANSFORMADA,
   * o formulário manda isso para a action e a action valida de novo com o MESMO schema.
   * Logo `parse(parse(x))` precisa funcionar. Ver `round-trip.test.ts`.
   */
  it("aiProviderConfigSchema", () => {
    const entrada = {
      provider: "openai",
      enabled: true,
      displayName: "",
      defaultModel: "gpt-5.6-terra",
      economyModel: "",
      advancedModel: "",
      visionModel: "",
      timeoutMs: 60000,
      maxRetries: 1,
      dailyLimit: undefined,
      monthlyLimit: undefined,
      fallbackAllowed: false,
      fallbackOrder: undefined,
    };
    const primeira = aiProviderConfigSchema.safeParse(entrada);
    expect(primeira.success).toBe(true);
    if (!primeira.success) return;

    const segunda = aiProviderConfigSchema.safeParse(primeira.data);
    expect(segunda.success).toBe(true);
    expect(segunda.success && segunda.data).toEqual(primeira.data);
  });

  it("aiPreferencesSchema", () => {
    const entrada = {
      defaultProvider: undefined,
      defaultModel: "",
      confirmationMode: "seguro",
      allowFallback: false,
      dailyBudget: undefined,
      monthlyBudget: undefined,
      budgetBlockOnLimit: true,
      reservationMargin: 1.15,
      rateLimitPerMinute: 10,
      rateLimitPerHour: 120,
    };
    const primeira = aiPreferencesSchema.safeParse(entrada);
    expect(primeira.success).toBe(true);
    if (!primeira.success) return;

    const segunda = aiPreferencesSchema.safeParse(primeira.data);
    expect(segunda.success).toBe(true);
    expect(segunda.success && segunda.data).toEqual(primeira.data);
  });

  it("renameConversationSchema", () => {
    const primeira = renameConversationSchema.safeParse({
      conversationId: UUID,
      title: "  Minha conversa  ",
    });
    expect(primeira.success).toBe(true);
    if (!primeira.success) return;
    expect(primeira.data.title).toBe("Minha conversa");
    expect(renameConversationSchema.safeParse(primeira.data).success).toBe(true);
  });
});
