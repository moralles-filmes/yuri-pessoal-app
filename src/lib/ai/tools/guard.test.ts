import { describe, expect, it } from "vitest";
import { TOOL_WRITE_PERMISSIONS } from "./contracts";
import type {
  ToolDescriptor,
  ToolPermission,
  ToolWritePermission,
} from "./contracts";
import { guardToolCall, REJECTION_MESSAGE, PUBLIC_REJECTION_CODE } from "./guard";

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
  itemLabel: "registros",
  requiresConfirmation: false,
  idempotent: true,
};

/**
 * ⚠️ ESTE DESCRIPTOR É COERENTE — e é o que faz o teste valer alguma coisa.
 *
 * Até a 18-B, o fixture de escrita não declarava chave de escrita nem command, e passou a
 * ser INCOERENTE quando `isToolDescriptorCoherent` subiu na 18-C. Um fixture incoerente
 * ainda faria o guard rejeitar — só que por `TOOL_INCOHERENT`, e a suíte continuaria verde
 * enquanto a checagem de permissão de escrita, que é a que se quer provar, nunca rodava.
 *
 * Ele não corresponde a nenhuma ferramenta real: nenhuma escrita existe no registry da 18-C.
 */
const ESCRITA: ToolDescriptor = {
  ...TREINOS,
  name: "todo.criar_tarefa",
  module: "todo",
  kind: "escrita",
  risk: 2,
  requiredPermission: "allow_todo",
  requiredWritePermission: "allow_write_todo",
  command: "criarTarefaTodo",
  sensibilidades: [],
  requiresConfirmation: true,
  idempotent: false,
};

const TUDO_LIGADO = Object.fromEntries(
  ["allow_training", "allow_finance", "allow_todo"].map((k) => [k, true]),
) as Record<ToolPermission, boolean>;

/**
 * ⚠️ 18-F Bloco 3 — DERIVADAS de `TOOL_WRITE_PERMISSIONS`, não escritas à mão.
 *
 * As duas eram literais com as cinco chaves, e a sexta (`allow_write_memory`) as deixou
 * vermelhas. Uma fixture escrita à mão sobre uma lista que cresce é a invariante 94 esperando
 * acontecer — e aqui ela é pior que em `validators/`: "tudo ligado" com uma chave faltando
 * testaria o guard contra um estado que nunca existe.
 */
const escrita = (valor: boolean): Record<ToolWritePermission, boolean> =>
  Object.fromEntries(TOOL_WRITE_PERMISSIONS.map((k) => [k, valor])) as Record<
    ToolWritePermission,
    boolean
  >;

const ESCRITA_LIGADA = escrita(true);
const ESCRITA_DESLIGADA = escrita(false);

const base = {
  registry: [TREINOS, ESCRITA],
  agent: { id: "treinos", allowedTools: ["training.get_records"] },
  permissions: TUDO_LIGADO,
  modo: "proposta" as const,
  writePermissions: ESCRITA_DESLIGADA,
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
    const r = guardToolCall({ ...base, toolName: "todo.criar_tarefa" });
    expect(r).toMatchObject({ ok: false, reason: "TOOL_NOT_ALLOWED_FOR_AGENT" });
  });

  // A ORDEM importa: allowlist ANTES de permissão e de kind. Uma ferramenta que o agente
  // nem pode ver não deve vazar, pela mensagem de erro, se ela é de escrita ou se a flag
  // do usuário está ligada.
  it("prioriza a allowlist sobre o kind", () => {
    const r = guardToolCall({
      ...base,
      agent: { id: "treinos", allowedTools: [] },
      toolName: "todo.criar_tarefa",
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

  // ══════════════════════════════════════════════════════════════════════════════════════
  // 18-C — A ESCRITA
  // ══════════════════════════════════════════════════════════════════════════════════════

  const comEscrita = {
    ...base,
    agent: { id: "todo", allowedTools: ["todo.criar_tarefa"] },
    toolName: "todo.criar_tarefa",
  };

  it("rejeita escrita quando a chave allow_write_* está DESLIGADA", () => {
    const r = guardToolCall(comEscrita);
    expect(r).toMatchObject({ ok: false, reason: "TOOL_WRITE_DISABLED" });
  });

  /**
   * ⛔ A CHAVE DE LEITURA VEM PRIMEIRO — e este é o caso que prova que ela não é decorativa.
   *
   * Com a escrita ligada e a leitura desligada, a resposta certa é NEGAR. Um guard que
   * checasse só a chave de escrita deixaria a IA alterar um módulo que o dono não autorizou
   * nem a consultar — e ela precisa consultar para propor.
   */
  it("escrita ligada NÃO supre a leitura desligada", () => {
    const r = guardToolCall({
      ...comEscrita,
      permissions: { ...TUDO_LIGADO, allow_todo: false },
      writePermissions: ESCRITA_LIGADA,
    });
    expect(r).toMatchObject({ ok: false, reason: "TOOL_PERMISSION_DENIED" });
  });

  it("admite escrita só com as DUAS chaves ligadas e em modo proposta", () => {
    const r = guardToolCall({ ...comEscrita, writePermissions: ESCRITA_LIGADA });
    expect(r.ok).toBe(true);
  });

  /**
   * ⛔ O MODO É A TRAVA ARQUITETURAL: escrita só passa no laço da conversa, e ali ela vira
   * PROPOSTA. Qualquer outro ponto que chame o guard declara `somente_leitura` e não
   * consegue admitir escrita nem com todas as chaves ligadas.
   */
  it("recusa escrita fora do modo proposta, mesmo com tudo ligado", () => {
    const r = guardToolCall({
      ...comEscrita,
      modo: "somente_leitura",
      writePermissions: ESCRITA_LIGADA,
    });
    expect(r).toMatchObject({ ok: false, reason: "TOOL_WRITE_OUT_OF_BAND" });
  });

  it("leitura continua passando em modo somente_leitura", () => {
    const r = guardToolCall({
      ...base,
      modo: "somente_leitura",
      toolName: "training.get_records",
    });
    expect(r.ok).toBe(true);
  });

  /**
   * O motivo interno distingue os dois; o código PÚBLICO não. Contar ao modelo que existe
   * "um modo em que essa ferramenta rodaria" é informação que ele não tem como usar bem — e
   * que ele repetiria ao usuário.
   */
  it("o modo errado sai ao modelo como TOOL_INCOHERENT, não como recusa de escrita", () => {
    expect(PUBLIC_REJECTION_CODE.TOOL_WRITE_OUT_OF_BAND).toBe("TOOL_INCOHERENT");
    expect(PUBLIC_REJECTION_CODE.TOOL_WRITE_DISABLED).toBe("TOOL_WRITE_DISABLED");
  });

  /**
   * ⚠️ Escrita SEM chave de escrita declarada no descriptor não pode virar "autorizada pela
   * chave de leitura". Ela cai antes, na coerência.
   */
  it("escrita sem requiredWritePermission é INCOERENTE, nunca admitida", () => {
    const semChave = { ...ESCRITA };
    delete (semChave as { requiredWritePermission?: unknown }).requiredWritePermission;
    const r = guardToolCall({
      ...comEscrita,
      registry: [semChave],
      writePermissions: ESCRITA_LIGADA,
    });
    expect(r).toMatchObject({ ok: false, reason: "TOOL_INCOHERENT" });
  });

  /**
   * A frase antiga ("esta versão do assistente só consulta informações") era verdadeira
   * enquanto NENHUMA escrita existia. Com a escrita ligável por módulo, ela vira mentira —
   * exatamente como a trava de honestidade v1 virou na 18-B. Este teste é o que impede
   * alguém de reintroduzi-la.
   */
  it("a mensagem de escrita desligada NÃO afirma que o assistente não altera nada", () => {
    const texto = REJECTION_MESSAGE.TOOL_WRITE_DISABLED;
    expect(texto).toMatch(/não autorizou/i);
    expect(texto).not.toMatch(/só consulta|apenas consulta|não cria, altera nem apaga/i);
  });
});
