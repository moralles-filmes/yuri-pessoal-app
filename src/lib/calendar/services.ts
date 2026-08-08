import "server-only";

/**
 * Fase 18-C · Bloco 4 — Agenda · O SERVIÇO de evento, extraído da Server Action.
 *
 * Mesmo molde de `todo/services.ts` e `habits/services.ts`: a action vira `auth + Zod +
 * serviço + revalidatePath`, o command vira `prever + serviço`, e criar evento tem UMA
 * implementação.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ⚠️ ESTE É O PRIMEIRO COMMAND CUJO EFEITO SAI DO SISTEMA.                              ║
 * ║                                                                                       ║
 * ║ TO-DO e Hábitos escrevem numa tabela do dono e param aí. Um evento, com o Google       ║
 * ║ conectado, também é criado no calendário DELE lá fora — e chega ao celular, ao         ║
 * ║ notebook e a quem mais compartilhe aquele calendário.                                  ║
 * ║                                                                                       ║
 * ║ Duas consequências, e as duas estão no command:                                        ║
 * ║   • a previsão DIZ que o evento também vai para o Google, quando a conta está          ║
 * ║     conectada — o dono não pode descobrir isso depois;                                 ║
 * ║   • o envio é BEST-EFFORT e nunca derruba a criação local. É a regra da 17-F           ║
 * ║     ("falha do Google nunca derruba a ação"), que já valia aqui e continua valendo.    ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */

import type { AuthContext } from "@/lib/actions/helpers";
import type { CalendarEventInput } from "@/lib/validators/calendar";
import type { CalendarEventRow } from "@/types/database";
import { eventToGoogleResource, type GoogleEventResource } from "@/lib/calendar/mapping";
import { getValidAccessToken } from "@/lib/google/tokens";
import {
  deleteEvent as googleDeleteEvent,
  insertEvent as googleInsertEvent,
  patchEvent as googlePatchEvent,
} from "@/lib/google/calendar";

export type CalendarServiceContext = AuthContext;

/** Campos do evento aceitos pelo mapeador Google (subset do row). */
export type CamposParaOGoogle = {
  title: string;
  description: string | null;
  location: string | null;
  start_at: string;
  end_at: string;
  all_day: boolean;
  recurrence_freq: CalendarEventRow["recurrence_freq"];
  recurrence_interval: number;
  recurrence_until: string | null;
  reminder_minutes: number | null;
};

export function paraRecursoDoGoogle(data: CamposParaOGoogle): GoogleEventResource {
  return eventToGoogleResource(data);
}

/**
 * Empurra (best-effort) um evento recém-criado para o Google. Nunca derruba a ação.
 *
 * ⚠️ Devolve se o evento REALMENTE foi criado lá — não se a conta está conectada. A diferença
 * importa porque este caminho engole o erro de propósito: relatar "foi para o Google" depois
 * de o Google ter recusado é exatamente a afirmação sem lastro que a trava de honestidade
 * (invariante 15) proíbe.
 */
export async function enviarEventoAoGoogle(
  ctx: CalendarServiceContext,
  eventId: string,
  data: CamposParaOGoogle,
): Promise<boolean> {
  try {
    const token = await getValidAccessToken(ctx);
    if (!token) return false;
    const created = await googleInsertEvent(
      token.accessToken,
      token.calendarId,
      paraRecursoDoGoogle(data),
    );
    await ctx.supabase
      .from("calendar_events")
      .update({
        google_event_id: created.id ?? null,
        google_calendar_id: token.calendarId,
        etag: created.etag ?? null,
        synced_at: new Date().toISOString(),
      })
      .eq("id", eventId);
    return true;
  } catch {
    // Sem internet/erro do Google: o evento local fica salvo; "Sincronizar" reconcilia depois.
    return false;
  }
}

/** Empurra (best-effort) a edição de um evento já vinculado ao Google. */
export async function atualizarEventoNoGoogle(
  ctx: CalendarServiceContext,
  eventId: string,
  googleEventId: string,
  data: CamposParaOGoogle,
): Promise<void> {
  try {
    const token = await getValidAccessToken(ctx);
    if (!token) return;
    const updated = await googlePatchEvent(
      token.accessToken,
      token.calendarId,
      googleEventId,
      paraRecursoDoGoogle(data),
    );
    await ctx.supabase
      .from("calendar_events")
      .update({ etag: updated.etag ?? null, synced_at: new Date().toISOString() })
      .eq("id", eventId);
  } catch {
    // Local salvo; reconciliar depois.
  }
}

export type CriarEventoResultado =
  | { readonly ok: true; readonly id: string; readonly enviadoAoGoogle: boolean }
  | { readonly ok: false; readonly erro: string };

/**
 * Cria o evento. `d` é a saída de `calendarEventSchema` — o MESMO objeto que o formulário
 * monta, e é isso que faz o teste de equivalência ter sentido.
 */
export async function criarEventoNaAgenda(
  ctx: CalendarServiceContext,
  d: CalendarEventInput,
): Promise<CriarEventoResultado> {
  const { data, error } = await ctx.supabase
    .from("calendar_events")
    .insert({
      user_id: ctx.userId,
      title: d.title,
      description: d.description,
      location: d.location,
      start_at: d.start_at,
      end_at: d.end_at,
      all_day: d.all_day,
      tipo: d.tipo,
      color: d.color,
      recurrence_freq: d.recurrence_freq,
      recurrence_interval: d.recurrence_interval,
      recurrence_until: d.recurrence_until,
      reminder_minutes: d.reminder_minutes,
      task_id: d.task_id,
      origin: "local",
    })
    .select("id")
    .single();

  if (error || !data) return { ok: false, erro: "Não foi possível salvar o evento." };

  const enviadoAoGoogle = await enviarEventoAoGoogle(ctx, data.id, d);
  return { ok: true, id: data.id, enviadoAoGoogle };
}

/**
 * Exclui o evento — no Google primeiro (best-effort), depois localmente.
 *
 * A ordem importa: apagar a linha local antes tiraria o `google_event_id` da mão, e o evento
 * ficaria órfão no calendário do dono para sempre. É a mesma disciplina de
 * `removeTaskFromGoogle` no TO-DO e da ponte da agenda de Treinos.
 */
export async function excluirEventoDaAgenda(
  ctx: CalendarServiceContext,
  id: string,
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const { data: existing } = await ctx.supabase
    .from("calendar_events")
    .select("google_event_id")
    .eq("id", id)
    .maybeSingle();

  if (existing?.google_event_id) {
    try {
      const token = await getValidAccessToken(ctx);
      if (token) {
        await googleDeleteEvent(token.accessToken, token.calendarId, existing.google_event_id);
      }
    } catch {
      // Segue excluindo localmente. 404/410 no Google já são "excluído".
    }
  }

  const { error } = await ctx.supabase.from("calendar_events").delete().eq("id", id);
  if (error) return { ok: false, erro: "Não foi possível excluir o evento." };
  return { ok: true };
}
