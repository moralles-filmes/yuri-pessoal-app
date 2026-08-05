import "server-only";

/**
 * Fase 18-B — IA · Auditoria de leitura. I/O fino; a DECISÃO mora em `guard.ts`.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ÚNICO ARQUIVO DE `tools/` AUTORIZADO A FALAR COM O BANCO — e o que ele grava é a      ║
 * ║ auditoria do PRÓPRIO módulo de IA, nunca um registro de módulo do usuário.            ║
 * ║                                                                                       ║
 * ║ Grava o que foi PEDIDO, nunca o que foi devolvido: registrar o resultado seria uma    ║
 * ║ segunda cópia dos dados pessoais do usuário dentro do módulo de IA, com prazo         ║
 * ║ indefinido. As `refs` são a exceção deliberada — tipo, id e rota interna, o mínimo    ║
 * ║ para o "Ver dados usados" apontar para o registro original.                            ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * `user_id` vem de quem chama (que o pegou de `authContext()`), e o cliente é o de SESSÃO:
 * a RLS continua valendo. Nada aqui usa service role.
 */

import { createClient } from "@/lib/supabase/server";
import { sanitizedJson } from "@/lib/ai/security/redact";
import type { ToolRef } from "./contracts";
import type { ToolRejectionReason } from "./guard";

export type ToolCallStatus = "executada" | "rejeitada" | "falhou" | "timeout";

export async function startStep(input: {
  runId: string;
  userId: string;
  stepIndex: number;
  kind: "modelo" | "ferramentas";
}): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("ai_run_steps")
    .insert({
      run_id: input.runId,
      user_id: input.userId,
      step_index: input.stepIndex,
      kind: input.kind,
      status: "started",
    })
    .select("id")
    .single();
  return data?.id ?? null;
}

export async function closeStep(input: {
  stepId: string;
  userId: string;
  status: "completed" | "failed" | "cancelled";
  durationMs: number;
}): Promise<void> {
  const supabase = await createClient();
  // `.eq("status", "started")` não é redundante com a policy: é o que torna o fechamento
  // idempotente — reexecutar não reescreve um passo que já terminou.
  await supabase
    .from("ai_run_steps")
    .update({
      status: input.status,
      completed_at: new Date().toISOString(),
      duration_ms: Math.max(0, input.durationMs),
    })
    .eq("id", input.stepId)
    .eq("user_id", input.userId)
    .eq("status", "started");
}

export async function recordToolCall(input: {
  runId: string;
  userId: string;
  stepId: string;
  toolName: string;
  toolVersion: string;
  providerCallId: string | null;
  argumentos: unknown;
  status: ToolCallStatus;
  rejectionReason: ToolRejectionReason | null;
  recordsRead: number | null;
  durationMs: number;
  refs: readonly ToolRef[];
}): Promise<void> {
  const supabase = await createClient();
  await supabase.from("ai_tool_calls").insert({
    run_id: input.runId,
    user_id: input.userId,
    step_id: input.stepId,
    tool_name: input.toolName,
    tool_version: input.toolVersion,
    provider_call_id: input.providerCallId,
    // O argumento veio do MODELO: passa pelo saneamento antes de virar linha.
    arguments_sanitized: sanitizedJson(input.argumentos),
    status: input.status,
    rejection_reason: input.rejectionReason,
    records_read: input.recordsRead,
    duration_ms: Math.max(0, input.durationMs),
    refs: [...input.refs],
  });
}
