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
import { hojeISO } from "@/lib/format";
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
  // Fase 16 — módulo Dieta e Alimentação. `nutrition_nutrients` fica de fora de propósito:
  // é vocabulário global do sistema (sem `user_id`), recriado por migration, não dado do
  // usuário. Os 597 alimentos da TACO também não entram — ver o `.eq("user_id", …)` abaixo.
  "nutrition_food_sources",
  "nutrition_food_categories",
  "nutrition_foods",
  "nutrition_food_nutrients",
  "nutrition_food_measures",
  "nutrition_food_prefs",
  "nutrition_food_tags",
  "nutrition_food_tag_links",
  "nutrition_import_batches",
  "nutrition_profiles",
  "nutrition_meal_types",
  "nutrition_goal_periods",
  "nutrition_goal_items",
  "nutrition_plans",
  "nutrition_plan_days",
  "nutrition_planned_meals",
  "nutrition_planned_meal_items",
  "nutrition_diary_meals",
  "nutrition_diary_entries",
  // Subfase 16-C — receitas, refeições-modelo e substituições. Tudo aqui é conteúdo autoral
  // do usuário (as receitas dele, os modelos dele, as trocas que ele fez): nada é recriado
  // por migration, então ficar de fora do backup significaria perder para sempre.
  "nutrition_recipe_categories",
  "nutrition_recipes",
  "nutrition_recipe_ingredients",
  "nutrition_meal_templates",
  "nutrition_meal_template_items",
  "nutrition_substitution_groups",
  "nutrition_substitution_options",
  "nutrition_substitution_logs",
];

/**
 * Lê uma tabela inteira do usuário.
 *
 * DOIS DETALHES QUE PARECEM DE ESTILO E NÃO SÃO:
 *
 * 1. `.eq("user_id", …)` é REDUNDANTE para a maioria das tabelas (a RLS já filtra), mas é
 *    ESSENCIAL para as do módulo Dieta que aceitam `user_id` nulo: nelas a policy de SELECT
 *    alcança também as linhas globais, e sem o filtro o backup viria com os 597 alimentos da
 *    TACO e seus 21.147 valores — dado que não é do usuário e que a migration recria.
 *
 * 2. O cast localizado existe por causa do TS2589. O `from()` do supabase-js resolve o tipo
 *    da tabela a partir do LITERAL da string; com a união de todas as tabelas do projeto (67
 *    desde a Fase 16-B) o compilador estoura o limite de instanciação. Aqui a tabela é
 *    dinâmica e as linhas vão direto para o JSON do backup — nenhum tipo de linha é usado —
 *    então um cast único e explicado resolve sem espalhar `any` pelo arquivo.
 */
async function dumpTable(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: TableName,
  userId: string,
): Promise<unknown[]> {
  const dynamicClient = supabase as unknown as {
    from: (t: string) => {
      select: (columns: string) => {
        eq: (
          column: string,
          value: string,
        ) => {
          limit: (n: number) => Promise<{ data: unknown[] | null; error: unknown }>;
        };
      };
    };
  };
  const { data, error } = await dynamicClient
    .from(table)
    .select("*")
    .eq("user_id", userId)
    .limit(100000);
  return error ? [] : (data ?? []);
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // `exported_at` é instante (ISO/UTC, correto); o nome do arquivo usa o dia em Brasília,
  // senão um backup baixado às 22h sai nomeado com a data de amanhã.
  const result: Record<string, unknown> = {
    exported_at: new Date().toISOString(),
    app: "Sistema Pessoal Yuri",
    user: { id: user.id, email: user.email },
  };

  const entries = await Promise.all(
    EXPORT_TABLES.map(async (table) => {
      return [table, await dumpTable(supabase, table, user.id)] as const;
    }),
  );
  for (const [table, rows] of entries) result[table] = rows;

  const body = JSON.stringify(result, null, 2);
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="backup-yuri-${hojeISO()}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
