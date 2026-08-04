/**
 * Fase 13 — Geração agendada de notificações (Vercel Cron).
 *
 * Protegida por segredo: o Vercel Cron envia `Authorization: Bearer ${CRON_SECRET}`.
 * Sem o segredo configurado (ou header inválido) → 401. Sem service role → no-op 200
 * (degrada com elegância, como a integração Google). Runtime nodejs.
 *
 * Idempotente: a lógica (src/lib/notifications/cron.ts → generate.ts) só insere as
 * notificações que faltam por `dedupe_key`, então rodar N vezes não duplica.
 */
import { NextResponse } from "next/server";
import { createServiceClient, isServiceConfigured } from "@/lib/supabase/service";
import { runNotificationGeneration } from "@/lib/notifications/cron";
import { reconcileAllAbandonedRuns } from "@/lib/ai/server/reconcile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isServiceConfigured) {
    return NextResponse.json({ ok: true, skipped: "service_role_not_configured" });
  }

  try {
    const service = createServiceClient();
    const result = await runNotificationGeneration(service, new Date());

    /*
     * Fase 18-A — carona da RECUPERAÇÃO GLOBAL de runs de IA abandonados.
     *
     * ⚠️ Isto é REDE DE SEGURANÇA, não o mecanismo principal. `vercel.json` roda este Cron
     * 2×/dia (09h e 21h BRT), então o pior caso aqui é 12 h. O que realmente protege é a
     * reconciliação preguiçosa — em especial a que roda dentro de `ai_begin_chat_run`,
     * antes de reservar um novo run: um run travado não consegue bloquear a próxima
     * conversa nem prender orçamento. Esta varredura cobre só o usuário que nunca mais
     * abre o módulo. `vercel.json` NÃO foi alterado.
     *
     * Falhar aqui não pode derrubar a geração de notificações, que é o trabalho principal
     * desta rota.
     */
    const ia = await reconcileAllAbandonedRuns().catch(() => ({
      runs: 0,
      tentativas: 0,
      mensagens: 0,
    }));

    return NextResponse.json({
      ok: true,
      users: result.users,
      inserted: result.inserted,
      aiRunsReconciled: ia.runs,
    });
  } catch {
    return NextResponse.json({ error: "generation_failed" }, { status: 500 });
  }
}
