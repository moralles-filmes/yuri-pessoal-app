-- Fase 16-C — Dieta e Alimentação · Receita como item do PLANEJAMENTO
--
-- A migration da 16-B registrou no comentário: "16-C acrescenta receita e refeição-modelo como
-- origem do item (nova coluna + CHECK)". É o que esta migration faz.
--
-- A refeição-modelo NÃO vira uma coluna aqui: aplicá-la ao planejamento EXPANDE seus itens em
-- linhas desta tabela (cada alimento e cada receita como um item). Guardar "o modelo inteiro"
-- como um item criaria vínculo vivo — editar o modelo em setembro mudaria o que estava
-- planejado em agosto, contra a regra "modelo é mutável, o que já foi planejado não".
--
-- Como no diário e na refeição-modelo, o discriminador é `item_kind`: `food_id` e `recipe_id`
-- são `on delete set null` e podem virar nulos, então não servem para dizer o que a linha é.

/* ───────────────────────── Colunas ───────────────────────── */

alter table public.nutrition_planned_meal_items
  add column if not exists recipe_id uuid references public.nutrition_recipes(id) on delete set null;

alter table public.nutrition_planned_meal_items
  add column if not exists item_kind text not null default 'alimento';

alter table public.nutrition_planned_meal_items
  add column if not exists portion_unit text;

-- Procedência: de qual refeição-modelo este item veio, quando veio de uma.
alter table public.nutrition_planned_meal_items
  add column if not exists meal_template_id uuid references public.nutrition_meal_templates(id) on delete set null;

/* ───────────────────────── Backfill idempotente ─────────────────────────
   Linhas da 16-B nasceram com o default 'alimento'. As que não têm alimento são, por
   definição, itens livres ("salada à vontade"). A condição olha os DADOS, então rodar de novo
   não muda nada. */

update public.nutrition_planned_meal_items
   set item_kind = 'livre'
 where food_id is null
   and recipe_id is null
   and item_kind = 'alimento';

/* ───────────────────────── CHECKs ───────────────────────── */

alter table public.nutrition_planned_meal_items
  drop constraint if exists nutrition_planned_meal_items_item_kind_check;
alter table public.nutrition_planned_meal_items
  add constraint nutrition_planned_meal_items_item_kind_check
  check (item_kind in ('alimento','receita','livre'));

alter table public.nutrition_planned_meal_items
  drop constraint if exists nutrition_planned_meal_items_portion_unit_check;
alter table public.nutrition_planned_meal_items
  add constraint nutrition_planned_meal_items_portion_unit_check
  check (portion_unit is null or portion_unit in ('porcao','peso'));

-- O item precisa dizer o que é: alimento, receita ou rótulo próprio.
alter table public.nutrition_planned_meal_items
  drop constraint if exists nutrition_planned_meal_items_has_subject;
alter table public.nutrition_planned_meal_items
  add constraint nutrition_planned_meal_items_has_subject
  check (food_id is not null or recipe_id is not null
      or (custom_label is not null and length(btrim(custom_label)) > 0));

-- Alimento e receita ao mesmo tempo não é um item: é dois.
alter table public.nutrition_planned_meal_items
  drop constraint if exists nutrition_planned_meal_items_single_subject;
alter table public.nutrition_planned_meal_items
  add constraint nutrition_planned_meal_items_single_subject
  check (food_id is null or recipe_id is null);

-- Com alimento OU receita, quantidade é obrigatória — sem ela não há o que calcular.
alter table public.nutrition_planned_meal_items
  drop constraint if exists nutrition_planned_meal_items_food_needs_quantity;
alter table public.nutrition_planned_meal_items
  add constraint nutrition_planned_meal_items_food_needs_quantity
  check ((food_id is null and recipe_id is null) or quantity is not null);

/* ───────────────────────── Índices ───────────────────────── */

create index if not exists nutrition_planned_meal_items_recipe_idx
  on public.nutrition_planned_meal_items (recipe_id) where recipe_id is not null;
create index if not exists nutrition_planned_meal_items_template_idx
  on public.nutrition_planned_meal_items (meal_template_id) where meal_template_id is not null;

comment on column public.nutrition_planned_meal_items.item_kind is
  'Discriminador ESTÁVEL: alimento | receita | livre. food_id/recipe_id viram nulos ao excluir a origem e não servem para isso.';
comment on column public.nutrition_planned_meal_items.portion_unit is
  'Só para item_kind = receita: porções ou gramas do preparo pronto. Gramas exige total_weight_g na receita.';
comment on column public.nutrition_planned_meal_items.meal_template_id is
  'Refeição-modelo que originou o item. Procedência, não vínculo vivo: aplicar o modelo EXPANDE os itens aqui.';
