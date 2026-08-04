-- Fase 16-C — Dieta e Alimentação · Alternativas de um grupo de substituição
--
-- Cada linha é uma alternativa que o USUÁRIO cadastrou, com a quantidade sugerida por ele.
-- `priority` é a ordem de preferência DELE — não um ranking de qualidade nutricional
-- calculado pelo sistema. Nenhuma sugestão nasce de heurística nova: a tela ordena por
-- prioridade e mostra a diferença nutricional; quem decide é sempre a pessoa.
--
-- Como no item de refeição-modelo, `food_id`/`recipe_id`/`meal_template_id` são
-- `on delete set null` e a linha sobrevive à exclusão da origem — por isso `option_kind` é o
-- discriminador estável.

create table if not exists public.nutrition_substitution_options (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,

  group_id         uuid not null references public.nutrition_substitution_groups(id) on delete cascade,

  option_kind      text not null default 'alimento'
                     check (option_kind in ('alimento','receita','modelo','livre')),

  food_id          uuid references public.nutrition_foods(id) on delete set null,
  recipe_id        uuid references public.nutrition_recipes(id) on delete set null,
  meal_template_id uuid references public.nutrition_meal_templates(id) on delete set null,
  custom_label     text,

  -- Quantidade sugerida da alternativa. É o que a comparação usa.
  quantity         numeric(12,4) check (quantity is null or quantity > 0),
  measure_id       uuid references public.nutrition_food_measures(id) on delete set null,
  measure_label    text,
  portion_unit     text check (portion_unit is null or portion_unit in ('porcao','peso')),

  -- Ordem de preferência DO USUÁRIO. Menor = preferida.
  priority         integer not null default 0,
  notes            text,
  is_active        boolean not null default true,
  position         integer not null default 0,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint nutrition_substitution_options_free_needs_label
    check (option_kind <> 'livre'
        or (custom_label is not null and length(btrim(custom_label)) > 0)),
  -- Uma alternativa é UMA coisa: não aponta para alimento e receita ao mesmo tempo.
  constraint nutrition_substitution_options_single_subject
    check (num_nonnulls(food_id, recipe_id, meal_template_id) <= 1),
  constraint nutrition_substitution_options_needs_quantity
    check (option_kind = 'livre' or quantity is not null)
);

alter table public.nutrition_substitution_options enable row level security;
alter table public.nutrition_substitution_options force row level security;

drop policy if exists "own rows" on public.nutrition_substitution_options;
create policy "own rows" on public.nutrition_substitution_options
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists nutrition_substitution_options_user_idx
  on public.nutrition_substitution_options (user_id);
create index if not exists nutrition_substitution_options_group_idx
  on public.nutrition_substitution_options (group_id, priority, position);
create index if not exists nutrition_substitution_options_food_idx
  on public.nutrition_substitution_options (food_id) where food_id is not null;
create index if not exists nutrition_substitution_options_recipe_idx
  on public.nutrition_substitution_options (recipe_id) where recipe_id is not null;
create index if not exists nutrition_substitution_options_template_idx
  on public.nutrition_substitution_options (meal_template_id) where meal_template_id is not null;

drop trigger if exists set_nutrition_substitution_options_updated_at on public.nutrition_substitution_options;
create trigger set_nutrition_substitution_options_updated_at
  before update on public.nutrition_substitution_options
  for each row execute function public.set_updated_at();

comment on table public.nutrition_substitution_options is
  'Alternativas de um grupo. priority é a preferência DO USUÁRIO, não um ranking calculado. Nada é sugerido por heurística nova.';
