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
  // Fase 17 — módulo Treinos. O vocabulário global (`training_muscle_groups`,
  // `training_equipment`) e os 106 exercícios da BASE ficam de fora pelo mesmo motivo da TACO:
  // não são dado do usuário e a migration os recria. Os exercícios PRÓPRIOS entram — o
  // `.eq("user_id", …)` abaixo garante que só eles venham, já que `training_exercises` aceita
  // `user_id` nulo para a base do sistema.
  //
  // ⚠️ A ordem importa na hora de restaurar: catálogo → modelos → planejamento → execução →
  // derivados. As sessões (`training_sessions` e filhas) são o HISTÓRICO IMUTÁVEL do módulo —
  // ficar de fora do backup significaria perder tudo o que foi treinado.
  "training_preferences",
  "training_exercises",
  "training_exercise_muscles",
  "training_exercise_alternatives",
  "training_exercise_prefs",
  "training_programs",
  "training_workouts",
  "training_program_workouts",
  "training_workout_exercises",
  "training_workout_sets",
  "training_workout_alternatives",
  "training_scheduled_workouts",
  "training_locations",
  "training_location_plates",
  "training_sessions",
  "training_session_exercises",
  "training_session_sets",
  "training_session_rests",
  "training_session_pauses",
  "training_session_events",
  "training_session_substitutions",
  "training_personal_records",
  "training_progression_rules",
  "training_progression_suggestions",
  // Subfase 17-E — metas e o histórico delas. `training_goal_progress` é o que garante que
  // alterar uma meta não reescreva o passado: sem ele no backup, a restauração perderia
  // exatamente a informação que a tabela existe para preservar.
  "training_goals",
  "training_goal_progress",
  // Subfase 17-F — ponte do espelho na agenda. Não guarda token: só o id do evento no
  // provedor e o estado da última sincronização. Fica no backup pelo mesmo motivo de
  // `todo_calendar_sync`: sem ela, restaurar criaria eventos DUPLICADOS no Google, já que a
  // idempotência mora justamente aqui.
  "training_calendar_sync",
  // Fase 18 — módulo de Inteligência Artificial.
  //
  // ⛔ `ai_provider_credentials` fica FORA: guarda o ciphertext da chave de API e a DEK
  // embrulhada. Mesmo motivo de `google_integrations` — um backup que vaza é ruim; um que
  // vaza credencial é pior. `ai_provider_configs` entra: só tem modelo, teto e timeout.
  //
  // ⚠️ `ai_documents` leva o METADADO do comprovante (nome, tipo, tamanho), nunca o binário:
  // os arquivos vivem no bucket privado e não cabem num JSON — como `body_progress_photos`.
  "ai_provider_configs",
  "ai_user_preferences",
  "ai_conversations",
  "ai_messages",
  "ai_runs",
  "ai_run_steps",
  "ai_usage_events",
  "ai_tool_calls",
  "ai_action_proposals",
  "ai_action_approvals",
  "ai_action_executions",
  "ai_documents",
  "ai_document_extractions",
  "ai_insights",
  "ai_insight_sources",
  "ai_insight_feedback",
  "ai_insight_jobs",
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
  ai_provider_credentials:
    "Guarda o ciphertext da chave de API e a DEK embrulhada. Credencial nunca sai num arquivo de backup.",
};
