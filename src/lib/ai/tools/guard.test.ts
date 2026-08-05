import { describe, expect, it } from "vitest";
import type { ToolDescriptor, ToolPermission } from "./contracts";
import { guardToolCall, REJECTION_MESSAGE } from "./guard";

const TREINOS: ToolDescriptor = {
  name: "training.get_records",
  version: "1",
  module: "training",
  kind: "leitura",
  risk: 1,
  description: "Recordes pessoais.",
  inputSchema: {},
  outputSchema: {},
  allowedAgents: ["treinos", "assistente-pessoal"],
  requiredPermission: "allow_training",
  timeoutMs: 8000,
  maxRecords: 50,
  requiresConfirmation: false,
  idempotent: true,
};

const ESCRITA: ToolDescriptor = {
  ...TREINOS,
  name: "training.create_session",
  kind: "escrita",
  risk: 3,
  requiresConfirmation: true,
  idempotent: false,
};

const TUDO_LIGADO = Object.fromEntries(
  ["allow_training", "allow_finance"].map((k) => [k, true]),
) as Record<ToolPermission, boolean>;

const base = {
  registry: [TREINOS, ESCRITA],
  agent: { id: "treinos", allowedTools: ["training.get_records"] },
  permissions: TUDO_LIGADO,
};

describe("guardToolCall", () => {
  it("admite a ferramenta certa, no agente certo, com a flag ligada", () => {
    const r = guardToolCall({ ...base, toolName: "training.get_records" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.tool.name).toBe("training.get_records");
  });

  it("rejeita nome fora do registry", () => {
    const r = guardToolCall({ ...base, toolName: "finance.drop_database" });
    expect(r).toMatchObject({ ok: false, reason: "TOOL_UNKNOWN" });
  });

  it("rejeita ferramenta que existe mas está fora da allowlist do agente", () => {
    const r = guardToolCall({ ...base, toolName: "training.create_session" });
    expect(r).toMatchObject({ ok: false, reason: "TOOL_NOT_ALLOWED_FOR_AGENT" });
  });

  // A ORDEM importa: allowlist ANTES de permissão e de kind. Uma ferramenta que o agente
  // nem pode ver não deve vazar, pela mensagem de erro, se ela é de escrita ou se a flag
  // do usuário está ligada.
  it("prioriza a allowlist sobre o kind", () => {
    const r = guardToolCall({
      ...base,
      agent: { id: "treinos", allowedTools: [] },
      toolName: "training.create_session",
    });
    expect(r).toMatchObject({ ok: false, reason: "TOOL_NOT_ALLOWED_FOR_AGENT" });
  });

  it("rejeita quando a flag do módulo está desligada", () => {
    const r = guardToolCall({
      ...base,
      permissions: { ...TUDO_LIGADO, allow_training: false },
      toolName: "training.get_records",
    });
    expect(r).toMatchObject({ ok: false, reason: "TOOL_PERMISSION_DENIED" });
  });

  // Uma flag AUSENTE não é uma flag ligada. `allow_training` que nunca foi gravado chega
  // como `undefined`, e `undefined` tem de negar tanto quanto `false` — senão o padrão de
  // um usuário que nunca abriu as preferências seria "tudo autorizado".
  it("rejeita quando a chave da permissão nem existe no objeto", () => {
    const semTreinos = { allow_finance: true } as unknown as Record<ToolPermission, boolean>;
    const r = guardToolCall({
      ...base,
      permissions: semTreinos,
      toolName: "training.get_records",
    });
    expect(r).toMatchObject({ ok: false, reason: "TOOL_PERMISSION_DENIED" });
  });

  // "Truthy" não basta: só o booleano `true` autoriza. Um `"true"` vindo de coluna de texto
  // ou um `1` vindo de jsonb passariam por `if (permissao)`.
  it("valor apenas truthy não autoriza — a permissão é o booleano true", () => {
    const quaseLigado = {
      ...TUDO_LIGADO,
      allow_training: "true",
    } as unknown as Record<ToolPermission, boolean>;
    const r = guardToolCall({
      ...base,
      permissions: quaseLigado,
      toolName: "training.get_records",
    });
    expect(r).toMatchObject({ ok: false, reason: "TOOL_PERMISSION_DENIED" });
  });

  it("rejeita ESCRITA mesmo com tudo ligado — a 18-B é só leitura", () => {
    const r = guardToolCall({
      ...base,
      agent: { id: "treinos", allowedTools: ["training.create_session"] },
      toolName: "training.create_session",
    });
    expect(r).toMatchObject({ ok: false, reason: "TOOL_WRITE_DISABLED" });
  });

  it("rejeita descriptor incoerente antes de executar", () => {
    const r = guardToolCall({
      ...base,
      registry: [{ ...TREINOS, maxRecords: 0 }],
      toolName: "training.get_records",
    });
    expect(r).toMatchObject({ ok: false, reason: "TOOL_INCOHERENT" });
  });

  it("toda rejeição tem mensagem em pt-BR e nenhuma vaza detalhe interno", () => {
    for (const [motivo, texto] of Object.entries(REJECTION_MESSAGE)) {
      expect(texto.length).toBeGreaterThan(10);
      expect(texto).not.toMatch(/user_id|sql|select|undefined|stack/i);
      expect(motivo).toMatch(/^TOOL_/);
    }
  });
});
