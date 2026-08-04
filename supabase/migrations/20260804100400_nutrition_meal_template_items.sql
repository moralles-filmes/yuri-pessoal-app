-- Fase 16-C — Dieta e Alimentação · Itens de uma refeição-modelo
--
-- ══ O DISCRIMINADOR É `item_kind`, NÃO A PRESENÇA DE `food_id` ══
-- `food_id` e `recipe_id` são `on delete set null`: excluir o alimento ou a receita não pode
-- apagar o modelo. Como as duas colunas podem virar nulas, quem diz o que a linha é precisa
-- ser uma coluna que NÃO muda — a mesma lição que `entry_kind` carrega no diário (16-B).
-- Por isso não existe CHECK exigindo `food_id is not null` quando o tipo é 'alimento': ele
-- faria o `set null` do Postgres falhar e, com ele, a exclusão do alimento.
--
-- ══ COMO UMA RECEITA É MEDIDA AQUI ══
-- `portion_unit` diz se a quantidade da receita está em PORÇÕES ou em GRAMAS do preparo
-- pronto. Gramas só é possível quando a receita informa `total_weight_g` — sem peso final não
-- há conversão, e a UI nem oferece a opção (regra 1 da subfase).

create table if not exists public.nutrition_meal_template_items (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,

  template_id   uuid not null references public.nutrition_meal_templates(id) on delete cascade,

  -- Estável: sobrevive à exclusão do alimento/receita apontado.
  item_kind     text not null default 'alimento'
                  check (item_kind in ('alimento','receita','livre')),

  food_id       uuid references public.nutrition_foods(id) on delete set null,
  recipe_id     uuid references public.nutrition_recipes(id) on delete set null,
  custom_label  text,

  quantity      numeric(12,4) check (quantity is null or quantity > 0),
  measure_id    uuid references public.nutrition_food_measures(id) on delete set null,
  measure_label text,
  -- Só se aplica a item_kind = 'receita'.
  portion_unit  text check (portion_unit is null or portion_unit in ('porcao','peso')),

  is_optional   boolean not null default false,
  notes         text,
  position      integer not null default 0,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- Item livre precisa dizer o que é; alimento e receita já têm identidade própria.
  constraint nutrition_meal_template_items_free_needs_label
    check (item_kind <> 'livre'
        or (custom_label is not null and length(btrim(custom_label)) > 0)),
  -- Alimento e receita ao mesmo tempo não é um item: é dois.
  constraint nutrition_meal_template_items_single_subject
    check (food_id is null or recipe_id is null),
  -- Item que entra no cálculo precisa de quantidade.
  constraint nutrition_meal_template_items_needs_quantity
    check (item_kind = 'livre' or quantity is not null)
);

alter table public.nutrition_meal_template_items enable row level security;
alter table public.nutrition_meal_template_items force row level security;

drop policy if exists "own rows" on public.nutrition_meal_template_items;
create policy "own rows" on public.nutrition_meal_template_items
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists nutrition_meal_template_items_user_idx
  on public.nutrition_meal_template_items (user_id);
create index if not exists nutrition_meal_template_items_template_idx
  on public.nutrition_meal_template_items (template_id, position);
create index if not exists nutrition_meal_template_items_food_idx
  on public.nutrition_meal_template_items (food_id) where food_id is not null;
create index if not exists nutrition_meal_template_items_recipe_idx
  on public.nutrition_meal_template_items (recipe_id) where recipe_id is not null;

drop trigger if exists set_nutrition_meal_template_items_updated_at on public.nutrition_meal_template_items;
create trigger set_nutrition_meal_template_items_updated_at
  before update on public.nutrition_meal_template_items
  for each row execute function public.set_updated_at();

comment on table public.nutrition_meal_template_items is
  'Itens de refeição-modelo: alimento, receita ou item livre. O discriminador estável é item_kind (food_id/recipe_id viram nulos ao excluir a origem).';
comment on column public.nutrition_meal_template_items.portion_unit is
  'Só para item_kind = receita: porções ou gramas do preparo pronto. Gramas exige total_weight_g na receita.';
