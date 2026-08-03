-- Fase 16-B — Dieta e Alimentação · Valores da meta, por nutriente
--
-- Uma linha = "quanto de X eu quero, neste escopo". O ESCOPO é a combinação de três eixos,
-- todos opcionais, e é isso que permite metas diferentes por dia da semana, por tipo de dia
-- (treino/descanso) e por refeição, sem uma coluna por caso:
--
--   weekday      NULL = vale para qualquer dia da semana   | 0..6 = domingo..sábado
--   day_kind     NULL = vale para treino e descanso        | 'treino' | 'descanso'
--   meal_type_id NULL = meta do DIA INTEIRO                | meta daquela refeição
--
-- A resolução ("qual linha vale para 2026-08-05, dia de treino, no almoço?") é DERIVADA na
-- leitura pela função pura `resolveGoal` (src/lib/nutrition/goals.ts), que prefere sempre a
-- linha mais específica. Nada disso é materializado.
--
-- POR REFEIÇÃO: aceita valor absoluto (`target_amount`) OU percentual da meta do dia
-- (`target_percent`). Percentual só faz sentido dentro de uma refeição — a CHECK garante.
--
-- Como o `goal_type` do período pode mudar (fixa → por_dia_semana e de volta), as linhas de
-- escopos não usados NÃO são apagadas: ficam guardadas e a leitura ignora conforme o tipo.
-- Trocar o tipo da meta e voltar não custa redigitar tudo.

create table if not exists public.nutrition_goal_items (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,

  period_id      uuid not null references public.nutrition_goal_periods(id) on delete cascade,
  nutrient_code  text not null references public.nutrition_nutrients(code) on delete restrict,

  weekday        smallint check (weekday is null or weekday between 0 and 6),
  day_kind       text check (day_kind is null or day_kind in ('treino','descanso')),
  meal_type_id   uuid references public.nutrition_meal_types(id) on delete cascade,

  -- Alvo em valor absoluto, na unidade do nutriente (`nutrition_nutrients.unit`).
  target_amount  numeric(14,4) check (target_amount is null or target_amount >= 0),
  -- Alvo como percentual da meta do dia. Só dentro de uma refeição.
  target_percent numeric(6,3) check (target_percent is null or (target_percent >= 0 and target_percent <= 100)),
  -- Faixa aceitável (opcional). Serve para "entre 120 g e 160 g de proteína".
  min_amount     numeric(14,4) check (min_amount is null or min_amount >= 0),
  max_amount     numeric(14,4) check (max_amount is null or max_amount >= 0),

  notes          text,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  -- Percentual é sempre "percentual da meta do dia": sem refeição não há do que ser parte.
  constraint nutrition_goal_items_percent_needs_meal
    check (target_percent is null or meal_type_id is not null),
  -- Linha sem nenhum número não configura nada — seria só ruído no relatório.
  constraint nutrition_goal_items_has_value
    check (target_amount is not null or target_percent is not null
        or min_amount is not null or max_amount is not null),
  constraint nutrition_goal_items_range
    check (min_amount is null or max_amount is null or max_amount >= min_amount)
);

alter table public.nutrition_goal_items enable row level security;
alter table public.nutrition_goal_items force row level security;

drop policy if exists "own rows" on public.nutrition_goal_items;
create policy "own rows" on public.nutrition_goal_items
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Um valor por (período, nutriente, escopo). O `coalesce` é o que permite tratar NULL como
-- "curinga" num índice único — sem isso o Postgres consideraria duas linhas NULL distintas
-- e o mesmo escopo poderia ser cadastrado duas vezes.
create unique index if not exists nutrition_goal_items_scope_idx
  on public.nutrition_goal_items (
    period_id,
    nutrient_code,
    coalesce(weekday, -1),
    coalesce(day_kind, ''),
    coalesce(meal_type_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

create index if not exists nutrition_goal_items_user_idx
  on public.nutrition_goal_items (user_id);
create index if not exists nutrition_goal_items_period_idx
  on public.nutrition_goal_items (period_id);
create index if not exists nutrition_goal_items_meal_idx
  on public.nutrition_goal_items (meal_type_id) where meal_type_id is not null;

drop trigger if exists set_nutrition_goal_items_updated_at on public.nutrition_goal_items;
create trigger set_nutrition_goal_items_updated_at
  before update on public.nutrition_goal_items
  for each row execute function public.set_updated_at();

comment on table public.nutrition_goal_items is
  'Valor da meta por nutriente e escopo (dia da semana / treino-descanso / refeição). A linha vigente é derivada na leitura, nunca materializada.';
comment on column public.nutrition_goal_items.target_percent is
  'Percentual da meta do DIA. Só válido quando meal_type_id não é nulo (CHECK garante).';
