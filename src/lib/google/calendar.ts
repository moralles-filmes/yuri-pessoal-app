/**
 * Cliente da Google Calendar API v3 (Fase 08) — APENAS servidor, via `fetch`.
 * Recebe o access_token já válido (renovado em `tokens.ts`). NUNCA loga tokens.
 * Erros viram `GoogleApiError` com status para o chamador decidir (reconectar etc.).
 */
import type { GoogleEventResource } from "@/lib/calendar/mapping";

const API_BASE = "https://www.googleapis.com/calendar/v3";

export class GoogleApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "GoogleApiError";
    this.status = status;
  }
}

function calBase(calendarId: string): string {
  return `${API_BASE}/calendars/${encodeURIComponent(calendarId)}/events`;
}

async function gfetch(
  url: string,
  accessToken: string,
  init: RequestInit = {},
): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  return res;
}

/**
 * Lista eventos numa janela [timeMin, timeMax] (ISO). Pagina até `maxPages`.
 * `singleEvents=false`: traz eventos "mestre" com recorrência (RRULE) — nossa
 * expansão de recorrência é local, evitando explodir instâncias e duplicar.
 */
export async function listEvents(
  accessToken: string,
  calendarId: string,
  params: { timeMin: string; timeMax: string; maxPages?: number },
): Promise<GoogleEventResource[]> {
  const maxPages = params.maxPages ?? 5;
  const items: GoogleEventResource[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < maxPages; page++) {
    const url = new URL(calBase(calendarId));
    url.searchParams.set("timeMin", params.timeMin);
    url.searchParams.set("timeMax", params.timeMax);
    url.searchParams.set("singleEvents", "false");
    url.searchParams.set("showDeleted", "false");
    url.searchParams.set("maxResults", "250");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await gfetch(url.toString(), accessToken);
    if (!res.ok) {
      throw new GoogleApiError(`Falha ao listar eventos (HTTP ${res.status}).`, res.status);
    }
    const json = (await res.json()) as {
      items?: GoogleEventResource[];
      nextPageToken?: string;
    };
    if (json.items) items.push(...json.items);
    if (!json.nextPageToken) break;
    pageToken = json.nextPageToken;
  }
  return items;
}

/** Cria um evento no Google. Retorna o recurso criado (id + etag). */
export async function insertEvent(
  accessToken: string,
  calendarId: string,
  resource: GoogleEventResource,
): Promise<GoogleEventResource> {
  const res = await gfetch(calBase(calendarId), accessToken, {
    method: "POST",
    body: JSON.stringify(resource),
  });
  if (!res.ok) {
    throw new GoogleApiError(`Falha ao criar evento (HTTP ${res.status}).`, res.status);
  }
  return (await res.json()) as GoogleEventResource;
}

/** Atualiza (PATCH) um evento existente no Google. Retorna o recurso (novo etag). */
export async function patchEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
  resource: GoogleEventResource,
): Promise<GoogleEventResource> {
  const url = `${calBase(calendarId)}/${encodeURIComponent(eventId)}`;
  const res = await gfetch(url, accessToken, {
    method: "PATCH",
    body: JSON.stringify(resource),
  });
  if (!res.ok) {
    throw new GoogleApiError(`Falha ao atualizar evento (HTTP ${res.status}).`, res.status);
  }
  return (await res.json()) as GoogleEventResource;
}

/** Exclui um evento no Google. 404/410 são tratados como "já não existe" (ok). */
export async function deleteEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
): Promise<void> {
  const url = `${calBase(calendarId)}/${encodeURIComponent(eventId)}`;
  const res = await gfetch(url, accessToken, { method: "DELETE" });
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    throw new GoogleApiError(`Falha ao excluir evento (HTTP ${res.status}).`, res.status);
  }
}
