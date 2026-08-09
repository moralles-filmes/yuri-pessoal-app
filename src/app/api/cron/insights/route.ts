/**
 * Fase 18-E · Bloco 4 — a varredura automática de insights (Vercel Cron).
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ⛔ ROTA SEPARADA DE `/api/cron/notifications`, E ISSO NÃO É ORGANIZAÇÃO.              ║
 * ║                                                                                       ║
 * ║ Um job de insight chama um provedor externo, gasta dinheiro e pode demorar. As        ║
 * ║ notificações são o trabalho que o dono conta todo dia. Na mesma rota, uma análise     ║
 * ║ travada levaria embora o lembrete de conta a pagar — e a recíproca também vale.       ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * ⚠️ **Exceção do transporte, como o `/api/ia/chat` (18-A):** Route Handler porque Cron não
 * tem sessão. **Transporte apenas** — nenhuma regra de negócio aqui. Quem decide o que roda é
 * `insights/job.ts` (puro); quem faz o I/O é `server/insight-job.ts`.
 *
 * Protegida por `CRON_SECRET` (Bearer) NA PRÓPRIA ROTA: o proxy libera `/api/cron/*`, então
 * sem esta checagem a rota seria pública. Sem service role → no-op 200 (degrada com elegância,
 * como a de notificações). Runtime nodejs.
 */
import { NextResponse } from "next/server";

import { createServiceClient, isServiceConfigured } from "@/lib/supabase/service";
import { runInsightJobForAllUsers } from "@/lib/ai/server/insight-job";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  // Sem segredo configurado é 401 também: uma rota que gasta dinheiro nunca fica aberta
  // "porque a variável não foi definida".
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isServiceConfigured) {
    return NextResponse.json({ ok: true, skipped: "service_role_not_configured" });
  }

  try {
    const service = createServiceClient();
    // `agora` nasce AQUI e é injetado: nada abaixo desta linha chama `new Date()`.
    const resultado = await runInsightJobForAllUsers(service, new Date());

    return NextResponse.json({
      ok: true,
      users: resultado.users,
      // Só a contagem por desfecho. O motivo já está em `ai_insight_jobs`, que é do dono —
      // repeti-lo no corpo da resposta o mandaria também para o log da Vercel, que é outro
      // lugar, com outra retenção e outro público.
      modulos: resultado.resultados.flatMap((r) =>
        r.modulos.map((m) => ({ desfecho: m.desfecho })),
      ).length,
    });
  } catch {
    // Sem corpo do erro na resposta: ele já foi sanitizado e gravado onde o dono o lê.
    return NextResponse.json({ error: "insight_job_failed" }, { status: 500 });
  }
}
