/**
 * Fase 14 — Exportação/backup dos dados do usuário (JSON). Rota PRIVADA: o proxy.ts
 * exige sessão e a própria rota revalida `auth.getUser()`. Cada SELECT roda sob a sessão
 * do usuário, então a RLS garante que NUNCA vaza dados de outro usuário.
 *
 * Segurança: `google_integrations` (tokens OAuth) é DELIBERADAMENTE omitido do backup —
 * nada sensível de credencial sai daqui.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TableName = keyof Database["public"]["Tables"];

/** Tabelas de dados do usuário incluídas no backup (sem tokens/segredos). */
const EXPORT_TABLES: TableName[] = [
  "settings",
  "accounts",
  "categories",
  "subcategories",
  "credit_cards",
  "card_statements",
  "transactions",
  "transaction_installments",
  "bills",
  "recurring_transactions",
  "people",
  "shared_expenses",
  "receivables",
  "import_batches",
  "import_rows",
  "calendar_events",
  "projects",
  "tasks",
  "task_checklist_items",
  "task_attachments",
  "routines",
  "routine_items",
  "routine_logs",
  "habits",
  "habit_logs",
  "study_courses",
  "study_modules",
  "study_lessons",
  "study_sessions",
  "study_vocabulary",
  "study_language_practice",
  "notifications",
  "attachments",
  // Fase 15 — módulo TO-DO.
  "todo_projects",
  "todo_sections",
  "todo_labels",
  "todo_tasks",
  "todo_task_labels",
  "todo_recurrences",
  "todo_completions",
  "todo_comments",
  "todo_reminders",
  "todo_saved_filters",
  "todo_activity",
  "todo_preferences",
  "todo_calendar_sync",
];

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = new Date().toISOString();
  const result: Record<string, unknown> = {
    exported_at: today,
    app: "Sistema Pessoal Yuri",
    user: { id: user.id, email: user.email },
  };

  const entries = await Promise.all(
    EXPORT_TABLES.map(async (table) => {
      const { data, error } = await supabase.from(table).select("*").limit(100000);
      return [table, error ? [] : (data ?? [])] as const;
    }),
  );
  for (const [table, rows] of entries) result[table] = rows;

  const body = JSON.stringify(result, null, 2);
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="backup-yuri-${today.slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
