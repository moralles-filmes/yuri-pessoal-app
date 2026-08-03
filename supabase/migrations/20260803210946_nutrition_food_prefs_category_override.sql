-- Fase 16-A — Recategorização pelo usuário sem tocar na base do sistema.
--
-- Esta migration foi aplicada separadamente durante a Subfase 16-A e a coluna já consta na
-- definição de 20260803120600_nutrition_food_prefs.sql. O arquivo é mantido para que o
-- ledger (supabase_migrations.schema_migrations) tenha um arquivo correspondente no repo e
-- para que o COMMENT da coluna seja reproduzido num replay do zero. É idempotente: num banco
-- novo o ALTER vira no-op e só o comentário é aplicado.

alter table public.nutrition_food_prefs
  add column if not exists category_override_id uuid
    references public.nutrition_food_categories(id) on delete set null;

comment on column public.nutrition_food_prefs.category_override_id is
  'Recategoriza um alimento na visão do usuário sem reescrever a fonte oficial.';
