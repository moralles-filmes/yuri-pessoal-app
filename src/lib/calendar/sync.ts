/**
 * Conciliação pura entre a agenda local e o Google Agenda (Fase 08).
 * Decide, sem efeitos colaterais, o que sincronizar em cada direção, usando
 * `google_event_id` para casar, `etag`/`updated` para detectar mudança e
 * `synced_at`/`updated_at` para "última edição vence". Idempotente: rodar de novo
 * sem mudanças produz um plano vazio (não duplica eventos).
 *
 * IMPORTANTE: o chamador deve passar apenas eventos locais DENTRO da janela de
 * tempo buscada no Google. Um evento local com `google_event_id` ausente do
 * resultado do Google (dentro da janela) é tratado como excluído no Google.
 */

export interface LocalSyncEvent {
  id: string;
  googleEventId: string | null;
  etag: string | null;
  /** ISO do `updated_at` local. */
  updatedAt: string;
  /** ISO do último sync (ou null se nunca sincronizado). */
  syncedAt: string | null;
  origin: string; // 'local' | 'google'
}

export interface GoogleSyncEvent {
  id: string;
  etag: string;
  /** 'confirmed' | 'tentative' | 'cancelled'. */
  status: string;
  /** ISO RFC3339 do `updated` do Google. */
  updated: string;
}

export interface SyncPlan<L extends LocalSyncEvent, G extends GoogleSyncEvent> {
  /** Eventos do Google a inserir/atualizar localmente (Google venceu / novos). */
  pullUpsert: G[];
  /** Ids de eventos locais a excluir (excluídos/cancelados no Google). */
  pullDeleteLocalIds: string[];
  /** Eventos locais a criar no Google (nunca enviados). */
  pushCreate: L[];
  /** Eventos locais a atualizar no Google (editados localmente; local venceu). */
  pushUpdate: L[];
}

function ts(iso: string | null | undefined): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Reconcilia os dois lados e devolve o plano de ações. Não executa nada.
 * @param local eventos locais (na janela buscada).
 * @param google eventos do Google (na mesma janela), incluindo cancelados.
 */
export function reconcile<L extends LocalSyncEvent, G extends GoogleSyncEvent>(
  local: L[],
  google: G[],
): SyncPlan<L, G> {
  const plan: SyncPlan<L, G> = {
    pullUpsert: [],
    pullDeleteLocalIds: [],
    pushCreate: [],
    pushUpdate: [],
  };

  const googleById = new Map<string, G>();
  for (const g of google) googleById.set(g.id, g);

  const matchedGoogleIds = new Set<string>();

  for (const l of local) {
    if (!l.googleEventId) {
      // Evento puramente local → criar no Google.
      plan.pushCreate.push(l);
      continue;
    }

    const g = googleById.get(l.googleEventId);
    if (!g) {
      // Tinha vínculo mas sumiu do Google (excluído fora/dentro da janela) → remove local.
      plan.pullDeleteLocalIds.push(l.id);
      continue;
    }
    matchedGoogleIds.add(g.id);

    if (g.status === "cancelled") {
      plan.pullDeleteLocalIds.push(l.id);
      continue;
    }

    const localChanged = ts(l.updatedAt) > ts(l.syncedAt);
    const googleChanged = g.etag !== l.etag;

    if (googleChanged && localChanged) {
      // Conflito: última edição vence.
      if (ts(g.updated) >= ts(l.updatedAt)) plan.pullUpsert.push(g);
      else plan.pushUpdate.push(l);
    } else if (googleChanged) {
      plan.pullUpsert.push(g);
    } else if (localChanged) {
      plan.pushUpdate.push(l);
    }
    // senão: em sincronia, nada a fazer.
  }

  // Eventos do Google sem correspondente local → novos para puxar.
  for (const g of google) {
    if (matchedGoogleIds.has(g.id)) continue;
    if (g.status === "cancelled") continue;
    plan.pullUpsert.push(g);
  }

  return plan;
}
