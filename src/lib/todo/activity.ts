/**
 * Fase 15 — Módulo TO-DO · Registro do histórico de atividades.
 *
 * Helper usado pelas Server Actions (não é um módulo "use server"). Grava em
 * `todo_activity` de forma **best-effort**: se a auditoria falhar, a operação de
 * negócio NÃO é revertida nem quebra — histórico é acessório, não crítico.
 *
 * PRIVACIDADE: só o recorte relevante do evento entra em `previous_data`/`new_data`.
 * Nunca a linha inteira, nunca token/segredo, nunca dado financeiro — a função
 * `pick` abaixo existe justamente para forçar esse recorte no chamador.
 */
import type { AuthContext } from "@/lib/actions/helpers";
import type { Json } from "@/types/supabase";

/** Mesmo client tipado que as actions usam (importado só como TIPO). */
type AnyClient = AuthContext["supabase"];

/** Recorte serializável gravado nas colunas jsonb do histórico. */
export type ActivityPayload = { [key: string]: Json | undefined };

export type TodoActivityEvent =
  | "criada"
  | "titulo_alterado"
  | "descricao_alterada"
  | "projeto_alterado"
  | "secao_alterada"
  | "data_alterada"
  | "prazo_alterado"
  | "prioridade_alterada"
  | "etiqueta_adicionada"
  | "etiqueta_removida"
  | "comentario_criado"
  | "anexo_adicionado"
  | "anexo_removido"
  | "concluida"
  | "reaberta"
  | "cancelada"
  | "recorrencia_alterada"
  | "lembrete_criado"
  | "lembrete_removido"
  | "arquivada"
  | "restaurada"
  | "movida"
  | "duplicada"
  | "promovida"
  | "rebaixada";

/** Recorta só as chaves informadas — evita jogar a linha inteira no histórico. */
export function pick<T extends Record<string, unknown>>(
  source: T | null | undefined,
  keys: (keyof T)[],
): ActivityPayload | null {
  if (!source) return null;
  const out: ActivityPayload = {};
  for (const key of keys) {
    if (source[key] !== undefined) out[String(key)] = source[key] as Json;
  }
  return Object.keys(out).length ? out : null;
}

/**
 * Registra um evento. Não lança: qualquer erro é engolido de propósito (ver acima).
 */
export async function logActivity(
  supabase: AnyClient,
  userId: string,
  taskId: string,
  eventType: TodoActivityEvent,
  previousData: ActivityPayload | null = null,
  newData: ActivityPayload | null = null,
  metadata: ActivityPayload | null = null,
): Promise<void> {
  try {
    await supabase.from("todo_activity").insert({
      user_id: userId,
      task_id: taskId,
      event_type: eventType,
      previous_data: previousData,
      new_data: newData,
      metadata,
    });
  } catch {
    // Silencioso por design — ver comentário do topo.
  }
}

/** Versão em lote (ações em massa: um evento por tarefa, num insert só). */
export async function logActivityBulk(
  supabase: AnyClient,
  userId: string,
  taskIds: string[],
  eventType: TodoActivityEvent,
  newData: ActivityPayload | null = null,
): Promise<void> {
  if (taskIds.length === 0) return;
  try {
    await supabase.from("todo_activity").insert(
      taskIds.map((taskId) => ({
        user_id: userId,
        task_id: taskId,
        event_type: eventType,
        previous_data: null,
        new_data: newData,
        metadata: { bulk: true },
      })),
    );
  } catch {
    // Silencioso por design.
  }
}

/**
 * Compara o antes/depois de uma tarefa e devolve os eventos que devem ser registrados.
 * Puro e testável — não toca o banco.
 */
export function diffTaskEvents(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Array<{
  event: TodoActivityEvent;
  previous: ActivityPayload | null;
  next: ActivityPayload | null;
}> {
  const events: Array<{
    event: TodoActivityEvent;
    previous: ActivityPayload | null;
    next: ActivityPayload | null;
  }> = [];

  const track = (field: string, event: TodoActivityEvent) => {
    if (before[field] !== after[field]) {
      events.push({
        event,
        previous: { [field]: (before[field] ?? null) as Json },
        next: { [field]: (after[field] ?? null) as Json },
      });
    }
  };

  track("title", "titulo_alterado");
  track("description", "descricao_alterada");
  track("project_id", "projeto_alterado");
  track("section_id", "secao_alterada");
  track("scheduled_date", "data_alterada");
  track("deadline_at", "prazo_alterado");
  track("priority", "prioridade_alterada");

  return events;
}
