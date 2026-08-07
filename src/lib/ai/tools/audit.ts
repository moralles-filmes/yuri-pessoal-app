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
import { safeLogFields, sanitizedJson } from "@/lib/ai/security/redact";
import { aiError } from "@/lib/ai/core/errors";
import type { ToolCallStatus, ToolRef } from "./contracts";
import type { ToolRejectionReason } from "./guard";

// O tipo mora em `contracts.ts` (puro) porque a tela de rastreabilidade também precisa dele,
// e este arquivo é `server-only`. Reexportado para não quebrar quem já importa daqui.
export type { ToolCallStatus };

/**
 * ⚠️ **`supabase-js` NÃO LANÇA em erro de banco** — ele devolve `{ data: null, error }`.
 *
 * Ignorar o `error` (ou confiar num `try/catch` em volta) faz toda falha de auditoria
 * desaparecer em silêncio: RLS negando a linha, coluna fora do CHECK, FK apontando para run
 * de outro usuário — nada disso apareceria, e a trilha de auditoria ficaria incompleta sem
 * ninguém saber. Auditoria que falha calada é pior que auditoria ausente, porque a tela de
 * "Ver dados usados" continuaria parecendo completa.
 *
 * O log leva SÓ classe, código e correlação (`safeLogFields`): nunca a mensagem do banco,
 * que traz nome de tabela, de coluna e às vezes valor de linha.
 */
function registrarFalha(code: string, correlationId: string, error: { code?: string } | null): void {
  console.error("[ia][auditoria] falha ao gravar", {
    ...safeLogFields(aiError("ERRO_TEMPORARIO", code), correlationId),
    // O `code` do Postgres é um SQLSTATE de 5 caracteres (ex.: `42501`, `23505`). É o que
    // permite distinguir RLS de violação de constraint sem carregar nenhum dado da linha.
    sqlstate: error?.code ?? "desconhecido",
  });
}

export async function startStep(input: {
  runId: string;
  userId: string;
  stepIndex: number;
  kind: "modelo" | "ferramentas";
}): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
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
  if (error) registrarFalha("AUDIT_STEP_INSERT_FAILED", input.runId, error);
  return data?.id ?? null;
}

/**
 * `runId` só existe aqui para o LOG: a correlação das três funções deste arquivo é o run, e
 * era a única que passava `stepId` no campo `correlation_id`. Duas correlações diferentes
 * para a mesma requisição fazem a busca no log operacional perder metade das linhas.
 */
export async function closeStep(input: {
  runId: string;
  stepId: string;
  userId: string;
  status: "completed" | "failed" | "cancelled";
  durationMs: number;
}): Promise<void> {
  const supabase = await createClient();
  // `.eq("status", "started")` É redundante com a policy `ai_run_steps_close_step`, cujo
  // `USING` já traz `status = 'started'` (migration `20260808100000`, linha 78) — e fica
  // assim de propósito. Ele é a defesa que sobrevive a alguém afrouxar a policy, e é o que
  // torna a intenção legível aqui: o fechamento é IDEMPOTENTE, reexecutar não reescreve um
  // passo que já terminou. O que não vale é a versão anterior deste comentário, que afirmava
  // não-redundância — nesta branch, comentário que afirma um fato errado já custou caro.
  const { error } = await supabase
    .from("ai_run_steps")
    .update({
      status: input.status,
      completed_at: new Date().toISOString(),
      duration_ms: Math.max(0, input.durationMs),
    })
    .eq("id", input.stepId)
    .eq("user_id", input.userId)
    .eq("status", "started");
  if (error) registrarFalha("AUDIT_STEP_CLOSE_FAILED", input.runId, error);
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
  const { error } = await supabase.from("ai_tool_calls").insert({
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
  if (error) registrarFalha("AUDIT_TOOL_CALL_INSERT_FAILED", input.runId, error);
}
