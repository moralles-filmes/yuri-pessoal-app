-- Fase 16-C — Dieta e Alimentação · Receitas (preparações)
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════╗
-- ║ REGRA 1 DA SUBFASE: o total da receita é a SOMA DOS INGREDIENTES; a concentração     ║
-- ║ "por 100 g" usa o PESO FINAL INFORMADO. Sem peso final, não existe "por 100 g".      ║
-- ╚══════════════════════════════════════════════════════════════════════════════════════╝
--
-- `total_weight_g` é INFORMADO pelo usuário (ele pesa a panela cheia), NUNCA deduzido da soma
-- dos ingredientes crus. Um refogado perde água, um bolo perde água e ganha volume, um feijão
-- ganha água: a variação depende do preparo, do fogo e do tempo, e estimá-la seria inventar
-- dado — o mesmo pecado que tratar "não analisado" como zero. Quando a coluna é nula, a UI
-- diz que "por 100 g" está indisponível e explica por quê.
--
-- Nenhum valor nutricional é materializado aqui. O total sai de `src/lib/nutrition/recipe.ts`,
-- que reusa `convertToBase` + `scaleNutrients` + `sumNutrients` de `calc.ts`. Guardar o total
-- numa coluna criaria uma segunda verdade que envelheceria no primeiro ingrediente editado
-- (regra 5 do módulo: nunca materialize nutriente).
--
-- A RECEITA É MUTÁVEL — é um modelo, como o treino-modelo da Fase 17. O que é imutável é o
-- CONSUMO: ao registrar a receita no diário, `nutrition_diary_entries` congela um snapshot dos
-- nutrientes da receita naquele instante. Editar ou excluir a receita depois não muda o
-- passado, exatamente como acontece com o alimento.

create table if not exists public.nutrition_recipes (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,

  name             text not null check (length(btrim(name)) > 0),
  description      text,
  category_id      uuid references public.nutrition_recipe_categories(id) on delete set null,

  -- Modo de preparo em texto livre. É conteúdo do usuário; nada é importado de terceiros.
  instructions     text,
  prep_minutes     integer check (prep_minutes is null or prep_minutes >= 0),
  cook_minutes     integer check (cook_minutes is null or cook_minutes >= 0),

  -- RENDIMENTO: em quantas porções a receita inteira se divide. Aceita fração (meia receita).
  servings         numeric(10,3) not null default 1 check (servings > 0),
  -- Como a porção se chama para esta receita ("fatia", "concha", "unidade").
  serving_label    text,
  -- Descrição livre do rendimento ("1 forma de 20 cm", "4 marmitas").
  yield_note       text,

  -- PESO FINAL PREPARADO, informado pelo usuário. NULO = não informado; a UI então não
  -- oferece "por 100 g" nem registro em gramas, e diz o motivo. Jamais estimado.
  total_weight_g   numeric(12,3) check (total_weight_g is null or total_weight_g > 0),

  source           text,
  tags             text[] not null default '{}'::text[],
  notes            text,

  is_favorite      boolean not null default false,
  archived_at      timestamptz,

  -- Duplicação: a cópia nasce apontando para a origem e marcada como cópia (regra 6).
  origin_recipe_id uuid references public.nutrition_recipes(id) on delete set null,
  is_copy          boolean not null default false,

  use_count        integer not null default 0,
  last_used_at     timestamptz,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint nutrition_recipes_origin_not_self
    check (origin_recipe_id is null or origin_recipe_id <> id)
);

alter table public.nutrition_recipes enable row level security;
alter table public.nutrition_recipes force row level security;

drop policy if exists "own rows" on public.nutrition_recipes;
create policy "own rows" on public.nutrition_recipes
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists nutrition_recipes_user_idx
  on public.nutrition_recipes (user_id);
create index if not exists nutrition_recipes_user_name_idx
  on public.nutrition_recipes (user_id, name);
create index if not exists nutrition_recipes_category_idx
  on public.nutrition_recipes (category_id) where category_id is not null;
create index if not exists nutrition_recipes_favorite_idx
  on public.nutrition_recipes (user_id) where is_favorite;
create index if not exists nutrition_recipes_archived_idx
  on public.nutrition_recipes (archived_at) where archived_at is not null;
create index if not exists nutrition_recipes_origin_idx
  on public.nutrition_recipes (origin_recipe_id) where origin_recipe_id is not null;

drop trigger if exists set_nutrition_recipes_updated_at on public.nutrition_recipes;
create trigger set_nutrition_recipes_updated_at
  before update on public.nutrition_recipes
  for each row execute function public.set_updated_at();

comment on table public.nutrition_recipes is
  'Receitas. Total = soma dos ingredientes (calculado em recipe.ts, nunca materializado). Modelo mutável; o consumo é congelado no diário.';
comment on column public.nutrition_recipes.total_weight_g is
  'Peso final preparado, INFORMADO pelo usuário. NULO = sem "por 100 g" e sem registro em gramas. Nunca estimado a partir dos ingredientes.';
comment on column public.nutrition_recipes.servings is
  'Rendimento em porções. Alterar recalcula o valor POR PORÇÃO sem alterar o total da receita.';
