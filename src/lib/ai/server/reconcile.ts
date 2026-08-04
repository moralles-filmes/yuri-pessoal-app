import "server-only";

/**
 * Fase 18-A — IA · Recuperação de runs abandonados.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ SLA DECLARADO — e a parte preguiçosa é a PRIMÁRIA, não a de reserva.                  ║
 * ║                                                                                       ║
 * ║  heartbeat        no máximo a cada 10 s durante o streaming, nunca por token          ║
 * ║  lease            5 min (30× o intervalo)                                             ║
 * ║  abandonado       heartbeat vencido há mais de 5 min                                  ║
 * ║  preguiçosa       ao abrir /ia · ao listar conversas · ANTES de reservar novo run      ║
 * ║  em lote (rede)   carona no Cron de notificações — pior caso 12 h                      ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * ═══════════════════════ POR QUE 12 h DE PIOR CASO É ACEITÁVEL ═══════════════════════
 *
 * `vercel.json` roda o Cron às `0 12` e `0 0` UTC — 09h e 21h de Brasília, 2×/dia, 12 h de
 * intervalo. Isso seria inaceitável se o Cron fosse o mecanismo principal. Ele não é.
 *
 * O que realmente protege é o gatilho "antes de reservar novo run", DENTRO da transação de
 * `ai_begin_chat_run` e sob o advisory lock: um run travado não consegue bloquear a próxima
 * conversa nem prender orçamento, porque é reconciliado na mesma transação que admitiria a
 * nova. O Cron cobre só o caso do usuário que nunca mais abre o módulo — e, nesse caso, 12 h
 * de reserva presa não incomodam ninguém, porque ninguém está tentando usar.
 *
 * `vercel.json` NÃO é alterado nesta subfase.
 */

import { createClient } from "@/lib/supabase/server";
import { createServiceClient, isServiceConfigured } from "@/lib/supabase/service";

/** Lote da varredura do usuário. Na prática o conjunto tem 0 ou 1 linha. */
export const LOTE_USUARIO = 20;
/** Lote da varredura global (Cron). */
export const LOTE_GLOBAL = 200;
export const LEASE_MINUTOS = 5;

/**
 * Recuperação PREGUIÇOSA — escopo do próprio usuário, sob RLS, sem privilégio nenhum.
 *
 * Delega para a função SQL `ai_reconcile_abandoned_runs`, a MESMA que `ai_begin_chat_run`
 * chama por dentro. Duas implementações da mesma reconciliação acabariam divergindo, e a
 * divergência apareceria como orçamento que não bate.
 *
 * Nunca lança: é efeito colateral de abrir uma tela. Se falhar, a tela continua abrindo.
 */
export async function reconcileOwnRuns(): Promise<number> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("ai_reconcile_abandoned_runs", {
      p_limit: LOTE_USUARIO,
    });
    if (error) return 0;
    return typeof data === "number" ? data : 0;
  } catch {
    return 0;
  }
}

/**
 * Recuperação GLOBAL — rede de segurança, executada SÓ pelo Cron server-side.
 *
 * Não existe action, rota ou botão que dispare isto: o `service_role` ignora RLS, então
 * expor um gatilho seria dar a um usuário o poder de fechar runs de outro. Por isso a
 * varredura vive aqui e é chamada exclusivamente de `/api/cron/notifications`, que já é
 * protegida por `CRON_SECRET`.
 *
 * ═══════════════════════ POR QUE NÃO HÁ POISON QUEUE ═══════════════════════
 *
 * O `UPDATE ... WHERE status IN ('reserved','streaming') AND last_heartbeat_at < limite`
 * REIVINDICA as linhas atomicamente: dois reconciliadores concorrentes não conseguem pegar
 * o mesmo run, porque o segundo não casa o `WHERE`. E a transição é TERMINAL — um run
 * fechado como `failed` sai do conjunto para sempre. Não há falha repetida a administrar.
 */
export async function reconcileAllAbandonedRuns(): Promise<{
  runs: number;
  tentativas: number;
  mensagens: number;
}> {
  // Sem service role o Cron degrada para no-op — como o resto da Fase 13 já faz. A
  // recuperação preguiçosa continua funcionando, e ela é a primária.
  if (!isServiceConfigured) return { runs: 0, tentativas: 0, mensagens: 0 };
  const supabase = createServiceClient();

  const limite = new Date(Date.now() - LEASE_MINUTOS * 60_000).toISOString();

  const { data: alvos } = await supabase
    .from("ai_runs")
    .select("id, user_id")
    .in("status", ["reserved", "streaming"])
    .lt("last_heartbeat_at", limite)
    .order("last_heartbeat_at", { ascending: true })
    .limit(LOTE_GLOBAL);

  if (!alvos || alvos.length === 0) {
    return { runs: 0, tentativas: 0, mensagens: 0 };
  }

  const ids = alvos.map((r) => r.id);

  // A reivindicação. O `.in('status', ...)` repetido aqui não é redundância: entre o SELECT
  // acima e este UPDATE, o `finally` do runner pode ter fechado o run — e nesse caso a
  // linha simplesmente não casa.
  const { data: fechados } = await supabase
    .from("ai_runs")
    .update({
      status: "failed",
      error_code: "ABANDONED",
      error_message_sanitized: "Execução encerrada por inatividade (lease vencida).",
      completed_at: new Date().toISOString(),
    })
    .in("id", ids)
    .in("status", ["reserved", "streaming"])
    .lt("last_heartbeat_at", limite)
    .select("id");

  const fechadosIds = (fechados ?? []).map((r) => r.id);
  if (fechadosIds.length === 0) return { runs: 0, tentativas: 0, mensagens: 0 };

  // Tentativa presa: custo NULO e ausência registrada. O provedor pode ter consumido algo,
  // e inventar 0 seria mentira — a mesma disciplina do `value_state` da Dieta.
  const { data: tentativas } = await supabase
    .from("ai_usage_events")
    .update({
      status: "failed",
      error_code: "ABANDONED",
      completed_at: new Date().toISOString(),
      usage_availability: {
        reason: "run_abandonado",
        input_tokens: "unavailable",
        output_tokens: "unavailable",
        cached_input_tokens: "unavailable",
        note: "O processo caiu antes de o provedor informar consumo.",
      },
    })
    .in("run_id", fechadosIds)
    .eq("status", "started")
    .select("id");

  const { data: mensagens } = await supabase
    .from("ai_messages")
    .update({ status: "failed" })
    .in("run_id", fechadosIds)
    .eq("status", "streaming")
    .select("id");

  return {
    runs: fechadosIds.length,
    tentativas: (tentativas ?? []).length,
    mensagens: (mensagens ?? []).length,
  };
}
