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
    return NextResponse.json({
      ok: true,
      users: result.users,
      inserted: result.inserted,
    });
  } catch {
    return NextResponse.json({ error: "generation_failed" }, { status: 500 });
  }
}
