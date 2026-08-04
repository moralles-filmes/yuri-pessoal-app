/**
 * Fase 14 (extraído na 16-F) — a lista de tabelas que entram no backup do usuário.
 *
 * Mora num módulo PURO para poder ser testada. O que ela precisa garantir não é uma questão
 * de estilo:
 *
 *  • NENHUMA TABELA DE CREDENCIAL ENTRA. `google_integrations` guarda tokens OAuth e está
 *    fora de propósito — um backup que vaza é ruim; um backup que vaza tokens é pior.
 *  • NENHUMA TABELA DE DADO DO USUÁRIO FICA DE FORA em silêncio. Um módulo novo que esquece
 *    de se registrar aqui só é descoberto quando alguém precisa restaurar o backup.
 *  • `nutrition_nutrients` e as VIEWS ficam fora com motivo: são vocabulário global do
 *    sistema (sem `user_id`), recriados por migration — não são dado do usuário.
 *
 * ⚠️ A frente de TREINOS (Fase 17) acrescenta as tabelas `training_*` a esta lista na 17-E.
 * Este arquivo é ponto de contato entre as duas frentes: ao mexer, ACRESCENTE a sua seção
 * sem reescrever a do outro.
 */
import type { Database } from "@/types/supabase";

export type ExportTableName = keyof Database["public"]["Tables"];

/** Tabelas de dados do usuário incluídas no backup (sem tokens/segredos). */
export const EXPORT_TABLES: ExportTableName[] = [
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
  // Subfase 16-D — lista de compras e despensa. Os corredores de mercado são semeados na
  // primeira leitura, mas o usuário renomeia e cria os dele: sem eles no backup, as listas
  // restauradas voltariam todas em "Sem corredor". A despensa e o histórico de preço pago
  // não são recriáveis por nada.
  "nutrition_market_categories",
  "nutrition_shopping_lists",
  "nutrition_shopping_list_items",
  "nutrition_pantry_items",
  // Subfase 16-E — MÓDULO CENTRAL de medidas corporais (`body_*`), compartilhado com a Fase
  // 17 (Treinos). Não é dado de Dieta: entra aqui porque o backup é do usuário inteiro.
  //
  // ⚠️ `body_progress_photos` leva o METADADO da foto (data, ângulo, peso, observação), NUNCA
  // o binário — os arquivos vivem no bucket privado `attachments` e não cabem num JSON. A
  // tela de exportação diz isso explicitamente, em vez de deixar o usuário supor que as
  // fotos estão salvas aqui.
  "body_measurement_types",
  "body_measurements",
  "body_measurement_goals",
  "body_progress_photos",
];


/**
 * Tabelas DELIBERADAMENTE fora do backup, com o motivo.
 * Declaradas em código (e não só em comentário) para o teste conseguir afirmar a ausência.
 */
export const EXPORT_EXCLUDED: Record<string, string> = {
  google_integrations:
    "Guarda tokens OAuth do Google. Credencial nunca sai num arquivo de backup.",
  nutrition_nutrients:
    "Vocabulário global do sistema (sem user_id), recriado por migration — não é dado do usuário.",
};
