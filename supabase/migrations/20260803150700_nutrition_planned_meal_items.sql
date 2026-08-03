-- Fase 16-B — Dieta e Alimentação · Itens de uma refeição planejada
--
-- O que se pretende comer. Diferente do diário, aqui NÃO há snapshot: o plano é uma intenção
-- e deve refletir o alimento como ele está hoje. Snapshot é do consumo, que é fato histórico.
--
-- ITEM SEM ALIMENTO É PERMITIDO — e é honesto. "Salada à vontade" ou "o que tiver na
-- geladeira" são planejamentos reais. Nesse caso `food_id` é nulo, `custom_label` diz o que
-- é, e o item NÃO contribui com nutriente nenhum: o total do plano fica marcado como
-- PARCIAL, exatamente como acontece com um nutriente não analisado. Inventar um valor para
-- "salada" seria a mesma mentira que tratar ausência como zero.
--
-- 16-C acrescenta receita e refeição-modelo como origem do item (nova coluna + CHECK).
-- Não antecipamos aqui: `food_id` sozinho é o que a 16-B precisa.

create table if not exists public.nutrition_planned_meal_items (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,

  planned_meal_id  uuid not null references public.nutrition_planned_meals(id) on delete cascade,

  -- `set null`: excluir um alimento do catálogo não pode apagar o planejamento. O item
  -- sobrevive com o rótulo e passa a ser um item sem cálculo (e o total, parcial).
  food_id          uuid references public.nutrition_foods(id) on delete set null,
  -- Rótulo livre. Obrigatório quando não há alimento; opcional como apelido quando há.
  custom_label     text,

  -- Quantidade na medida escolhida (ou na unidade-base do alimento, se measure_id é nulo).
  quantity         numeric(12,4) check (quantity is null or quantity > 0),
  measure_id       uuid references public.nutrition_food_measures(id) on delete set null,
  -- Cópia do rótulo da medida, para o item continuar legível se a medida for excluída.
  measure_label    text,

  -- Item que pode ser pulado sem que a refeição conte como não cumprida.
  is_optional      boolean not null default false,
  notes            text,
  position         integer not null default 0,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  -- Item precisa dizer o que é: ou aponta para um alimento, ou tem um rótulo próprio.
  constraint nutrition_planned_meal_items_has_subject
    check (food_id is not null or (custom_label is not null and length(btrim(custom_label)) > 0)),
  -- Com alimento, quantidade é obrigatória — sem ela não há o que calcular.
  constraint nutrition_planned_meal_items_food_needs_quantity
    check (food_id is null or quantity is not null)
);

alter table public.nutrition_planned_meal_items enable row level security;
alter table public.nutrition_planned_meal_items force row level security;

drop policy if exists "own rows" on public.nutrition_planned_meal_items;
create policy "own rows" on public.nutrition_planned_meal_items
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists nutrition_planned_meal_items_user_idx
  on public.nutrition_planned_meal_items (user_id);
create index if not exists nutrition_planned_meal_items_meal_idx
  on public.nutrition_planned_meal_items (planned_meal_id, position);
create index if not exists nutrition_planned_meal_items_food_idx
  on public.nutrition_planned_meal_items (food_id) where food_id is not null;

drop trigger if exists set_nutrition_planned_meal_items_updated_at on public.nutrition_planned_meal_items;
create trigger set_nutrition_planned_meal_items_updated_at
  before update on public.nutrition_planned_meal_items
  for each row execute function public.set_updated_at();

comment on table public.nutrition_planned_meal_items is
  'Itens planejados. Sem snapshot de propósito: o plano é intenção. Item sem alimento é permitido e deixa o total PARCIAL, nunca zero.';
