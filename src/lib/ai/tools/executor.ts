import "server-only";

/**
 * Fase 18-B — IA · O Tool Executor. É AQUI que a ferramenta roda — e em nenhum outro lugar.
 *
 * A decisão de admitir vem de `guard.ts` (puro e testado). Aqui ficam as três coisas que
 * exigem I/O: validar a entrada com o Zod que mora junto do adapter, aplicar o timeout, e
 * auditar. Rejeição NÃO encerra o run: volta ao modelo como `tool-result` de erro, para ele
 * poder dizer que não conseguiu — silêncio faria o modelo preencher a lacuna sozinho, que é
 * exatamente o que a subfase existe para impedir.
 */

import { AI_TOOL_REGISTRY } from "./registry";
import { guardToolCall, REJECTION_MESSAGE, type ToolRejectionReason } from "./guard";
import { TOOL_EXECUTORS } from "./executors";
import { wrapUntrusted, type UntrustedBlock } from "@/lib/ai/security/untrusted";
import type { ToolPermission, ToolOutput } from "./contracts";
import { recordToolCall, type ToolCallStatus } from "./audit";

export type ToolCallRequest = {
  readonly callId: string;
  readonly toolName: string;
  readonly input: unknown;
};

export type ToolExecutionContext = {
  readonly runId: string;
  readonly userId: string;
  readonly stepId: string;
  readonly agent: { readonly id: string; readonly allowedTools: readonly string[] };
  readonly permissions: Readonly<Partial<Record<ToolPermission, boolean>>>;
};

export type ToolExecution = {
  readonly callId: string;
  readonly toolName: string;
  readonly isError: boolean;
  /** O bloco NÃO CONFIÁVEL que volta ao modelo. Nunca o objeto cru. */
  readonly block: UntrustedBlock;
  readonly recordsRead: number;
};

/**
 * O erro que volta ao modelo carrega o CÓDIGO e a nossa mensagem — nunca o texto do erro
 * original. Mensagem de banco traz nome de tabela, de coluna e às vezes valor de linha.
 */
function erro(
  call: ToolCallRequest,
  reason: ToolRejectionReason,
  mensagem: string,
): ToolExecution {
  return {
    callId: call.callId,
    toolName: call.toolName,
    isError: true,
    block: wrapUntrusted("resultado_de_ferramenta", call.toolName, {
      erro: reason,
      mensagem,
    }),
    recordsRead: 0,
  };
}

export async function executeTool(
  ctx: ToolExecutionContext,
  call: ToolCallRequest,
): Promise<ToolExecution> {
  const inicio = Date.now();

  const auditar = (
    status: ToolCallStatus,
    reason: ToolRejectionReason | null,
    saida: ToolOutput | null,
    version: string,
  ) =>
    recordToolCall({
      runId: ctx.runId,
      userId: ctx.userId,
      stepId: ctx.stepId,
      toolName: call.toolName,
      toolVersion: version,
      providerCallId: call.callId,
      argumentos: call.input,
      status,
      rejectionReason: reason,
      recordsRead: saida?.contagem ?? null,
      durationMs: Date.now() - inicio,
      refs: saida?.refs ?? [],
    }).catch(() => {
      // Falha ao AUDITAR não pode derrubar a resposta do usuário — mas também não pode
      // passar em silêncio para sempre. O erro já foi sanitizado pelo cliente Supabase; o
      // que importa aqui é não transformar um problema de escrita em falha do chat.
    });

  const veredito = guardToolCall({
    toolName: call.toolName,
    registry: AI_TOOL_REGISTRY,
    agent: ctx.agent,
    permissions: ctx.permissions as Record<ToolPermission, boolean>,
  });

  if (!veredito.ok) {
    // Sem descriptor não há versão: `-` é o marcador de "a chamada nem chegou a uma
    // ferramenta". A coluna é NOT NULL, e inventar "1" mentiria sobre o que foi rejeitado.
    await auditar("rejeitada", veredito.reason, null, "-");
    return erro(call, veredito.reason, veredito.message);
  }

  const tool = veredito.tool;
  const entrada = TOOL_EXECUTORS[tool.name];
  if (!entrada) {
    // Registry e executores fora de sincronia. Há teste para isso; se chegar aqui em
    // produção, é rejeição, nunca execução às cegas.
    await auditar("rejeitada", "TOOL_UNKNOWN", null, tool.version);
    return erro(call, "TOOL_UNKNOWN", REJECTION_MESSAGE.TOOL_UNKNOWN);
  }

  const parsed = entrada.schema.safeParse(call.input ?? {});
  if (!parsed.success) {
    await auditar("rejeitada", "TOOL_INVALID_INPUT", null, tool.version);
    return erro(call, "TOOL_INVALID_INPUT", REJECTION_MESSAGE.TOOL_INVALID_INPUT);
  }

  let relogio: ReturnType<typeof setTimeout> | undefined;
  try {
    const saida = await Promise.race([
      entrada.run(parsed.data as never),
      new Promise<never>((_, reject) => {
        relogio = setTimeout(() => reject(new Error("TOOL_TIMEOUT")), tool.timeoutMs);
      }),
    ]);

    // Teto de registros aplicado AQUI, depois da query e antes do modelo: o descriptor é a
    // fonte do limite, não o adapter — assim o teto é auditável num lugar só.
    const excedeu = saida.itens.length > tool.maxRecords;
    const podada: ToolOutput = {
      ...saida,
      itens: saida.itens.slice(0, tool.maxRecords),
      refs: saida.refs.slice(0, tool.maxRecords),
      ...(excedeu
        ? {
            completude: "parcial" as const,
            motivo_incompleto: `Mostrando ${tool.maxRecords} de ${saida.itens.length} registros.`,
          }
        : {}),
    };

    await auditar("executada", null, podada, tool.version);

    return {
      callId: call.callId,
      toolName: call.toolName,
      isError: false,
      block: wrapUntrusted("resultado_de_ferramenta", tool.name, podada),
      recordsRead: podada.contagem,
    };
  } catch (e) {
    const timeout = e instanceof Error && e.message === "TOOL_TIMEOUT";
    await auditar(
      timeout ? "timeout" : "falhou",
      timeout ? "TOOL_TIMEOUT" : "TOOL_FAILED",
      null,
      tool.version,
    );
    return timeout
      ? erro(call, "TOOL_TIMEOUT", REJECTION_MESSAGE.TOOL_TIMEOUT)
      : erro(call, "TOOL_FAILED", REJECTION_MESSAGE.TOOL_FAILED);
  } finally {
    // Sem isto, uma ferramenta rápida deixaria o processo com um timer pendurado até o
    // prazo do descriptor — em teste, a suíte fica presa esperando o event loop esvaziar.
    if (relogio) clearTimeout(relogio);
  }
}
