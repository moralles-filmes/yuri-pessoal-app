-- Fase 16-A — Dieta e Alimentação · Valores nutricionais por alimento
--
-- É A ÚNICA FONTE DE VERDADE de nutriente no sistema. A view nutrition_foods_view pivota
-- daqui para permitir ordenar/filtrar, mas NÃO materializa: nada de duas verdades.
--
-- O PONTO MAIS IMPORTANTE DESTA TABELA — zero e ausência são coisas diferentes:
--
--   amount = 0,    value_state = 'disponivel'      → a fonte mediu e deu zero
--   amount = NULL, value_state = 'traco'           → abaixo do limite de quantificação
--   amount = NULL, value_state = 'nao_disponivel'  → a fonte não analisou
--   amount = NULL, value_state = 'nao_aplicavel'   → não faz sentido para este alimento
--   amount = NULL, value_state = 'em_revisao'      → a fonte está reavaliando as análises
--
-- Somar tratando ausência como zero é o erro clássico de app de nutrição: inventa precisão
-- que o dado não tem. Aqui o cálculo propaga o estado e a interface diz que o total é
-- parcial ou aproximado (ver src/lib/nutrition/calc.ts).
--
-- A CONSTRAINT abaixo garante isso no banco, não só no código: estado diferente de
-- 'disponivel' NÃO pode carregar valor, e 'disponivel' NÃO pode ser nulo.

create table if not exists public.nutrition_food_nutrients (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete cascade,

  food_id       uuid not null references public.nutrition_foods(id) on delete cascade,
  nutrient_code text not null references public.nutrition_nutrients(code) on delete restrict,

  -- Quantidade do nutriente por `nutrition_foods.base_quantity` do alimento.
  -- numeric (não float) porque aminoácido e microgramas exigem precisão exata.
  amount        numeric(16,6),
  value_state   text not null default 'disponivel'
                  check (value_state in ('disponivel','traco','nao_disponivel','nao_aplicavel','em_revisao')),
  method        text not null default 'desconhecido'
                  check (method in ('analitico','calculado','estimado','rotulo','desconhecido')),
  source_note   text,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint nutrition_food_nutrients_state_matches_amount
    check ((value_state = 'disponivel' and amount is not null)
        or (value_state <> 'disponivel' and amount is null))
);

alter table public.nutrition_food_nutrients enable row level security;
alter table public.nutrition_food_nutrients force row level security;

drop policy if exists "select own or global" on public.nutrition_food_nutrients;
create policy "select own or global" on public.nutrition_food_nutrients
  for select using (user_id = auth.uid() or user_id is null);

drop policy if exists "insert own" on public.nutrition_food_nutrients;
create policy "insert own" on public.nutrition_food_nutrients
  for insert with check (user_id = auth.uid());

drop policy if exists "update own" on public.nutrition_food_nutrients;
create policy "update own" on public.nutrition_food_nutrients
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "delete own" on public.nutrition_food_nutrients;
create policy "delete own" on public.nutrition_food_nutrients
  for delete using (user_id = auth.uid());

create unique index if not exists nutrition_food_nutrients_food_nutrient_idx
  on public.nutrition_food_nutrients (food_id, nutrient_code);
create index if not exists nutrition_food_nutrients_user_idx
  on public.nutrition_food_nutrients (user_id);
create index if not exists nutrition_food_nutrients_nutrient_idx
  on public.nutrition_food_nutrients (nutrient_code);

drop trigger if exists set_nutrition_food_nutrients_updated_at on public.nutrition_food_nutrients;
create trigger set_nutrition_food_nutrients_updated_at
  before update on public.nutrition_food_nutrients
  for each row execute function public.set_updated_at();

comment on table public.nutrition_food_nutrients is
  'Única fonte de verdade de nutriente. Ausência de linha = não disponível. Zero só existe quando a fonte publica zero.';
