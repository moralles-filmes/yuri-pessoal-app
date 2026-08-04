-- Fase 16-C — Dieta e Alimentação · Ingredientes de uma receita
--
-- Cada linha é "quanto de qual alimento entra na receita". Sem snapshot, de propósito: a
-- receita é um MODELO mutável e deve refletir o alimento como ele está hoje. O congelamento
-- acontece só no consumo (`nutrition_diary_entries`), como manda a regra 3 do módulo.
--
-- INGREDIENTE SEM ALIMENTO É PERMITIDO ("tempero a gosto", "um fio de azeite"). Ele não
-- contribui com nutriente nenhum e, por isso, marca o total da receita como PARCIAL — nunca
-- some silenciosamente nem vale zero. É a mesma disciplina de `nutrition_planned_meal_items`.
--
-- `grams_equivalent` é a conversão JÁ RESOLVIDA no momento de salvar (via `convertToBase`).
-- Não é uma segunda verdade nutricional: é a quantidade em unidade-base, guardada para a lista
-- de compras (16-D) e para a soma dos ingredientes crus não precisar reconverter tudo a cada
-- leitura. Quando a conversão é impossível a coluna fica NULA — e o cálculo trata como
-- ausência, não como zero.

create table if not exists public.nutrition_recipe_ingredients (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,

  recipe_id        uuid not null references public.nutrition_recipes(id) on delete cascade,

  -- `set null`: excluir o alimento do catálogo não pode apagar a linha da receita. O
  -- ingrediente sobrevive com o rótulo e passa a não contribuir com o cálculo.
  food_id          uuid references public.nutrition_foods(id) on delete set null,
  -- Rótulo livre. Obrigatório quando não há alimento; opcional como apelido quando há.
  custom_label     text,

  quantity         numeric(12,4) check (quantity is null or quantity > 0),
  measure_id       uuid references public.nutrition_food_measures(id) on delete set null,
  -- Cópia do rótulo da medida, para o item continuar legível se a medida for excluída.
  measure_label    text,
  -- Quantidade na UNIDADE-BASE do alimento (ver a base do próprio alimento). NULA quando não
  -- há conversão possível — g→ml exige densidade, e densidade presumida é dado inventado.
  grams_equivalent numeric(14,4) check (grams_equivalent is null or grams_equivalent > 0),

  is_optional      boolean not null default false,
  note             text,
  position         integer not null default 0,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  -- O ingrediente precisa dizer o que é: ou aponta para um alimento, ou tem rótulo próprio.
  constraint nutrition_recipe_ingredients_has_subject
    check (food_id is not null or (custom_label is not null and length(btrim(custom_label)) > 0)),
  -- Com alimento, quantidade é obrigatória — sem ela não há o que calcular.
  constraint nutrition_recipe_ingredients_food_needs_quantity
    check (food_id is null or quantity is not null)
);

alter table public.nutrition_recipe_ingredients enable row level security;
alter table public.nutrition_recipe_ingredients force row level security;

drop policy if exists "own rows" on public.nutrition_recipe_ingredients;
create policy "own rows" on public.nutrition_recipe_ingredients
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists nutrition_recipe_ingredients_user_idx
  on public.nutrition_recipe_ingredients (user_id);
create index if not exists nutrition_recipe_ingredients_recipe_idx
  on public.nutrition_recipe_ingredients (recipe_id, position);
create index if not exists nutrition_recipe_ingredients_food_idx
  on public.nutrition_recipe_ingredients (food_id) where food_id is not null;

drop trigger if exists set_nutrition_recipe_ingredients_updated_at on public.nutrition_recipe_ingredients;
create trigger set_nutrition_recipe_ingredients_updated_at
  before update on public.nutrition_recipe_ingredients
  for each row execute function public.set_updated_at();

comment on table public.nutrition_recipe_ingredients is
  'Ingredientes. Sem snapshot: a receita é modelo mutável. Ingrediente sem alimento deixa o total PARCIAL, nunca zero.';
comment on column public.nutrition_recipe_ingredients.grams_equivalent is
  'Quantidade na unidade-base do alimento, resolvida por convertToBase ao salvar. NULA quando a conversão é impossível.';
