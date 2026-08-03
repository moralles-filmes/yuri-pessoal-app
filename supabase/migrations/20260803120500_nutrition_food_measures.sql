-- Fase 16-A — Dieta e Alimentação · Medidas caseiras
--
-- A CONVERSÃO É POR ALIMENTO, NUNCA GENÉRICA. Uma colher de sopa de arroz e uma colher de
-- sopa de azeite não pesam o mesmo; uma banana média e uma maçã média não pesam o mesmo.
-- Por isso a conversão mora aqui, ligada ao alimento, e não numa tabela global de unidades.
--
-- `grams` e `milliliters` podem coexistir (líquido com densidade conhecida). Pelo menos um
-- precisa existir — medida sem conversão não serve para calcular nada, e a constraint
-- impede que ela seja criada. Conversão impossível é ERRO EXPLÍCITO no cálculo, nunca
-- estimativa silenciosa.
--
-- IMPORTANTE (registrado, não silenciado): a TACO 4 NÃO publica medida caseira por alimento.
-- Nenhuma foi inventada no seed. O usuário cadastra as suas e o pipeline pode importar uma
-- segunda fonte oficial depois.

create table if not exists public.nutrition_food_measures (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users(id) on delete cascade,

  food_id      uuid not null references public.nutrition_foods(id) on delete cascade,

  label        text not null,
  unit_type    text not null default 'peso'
                 check (unit_type in ('peso','volume','unidade')),
  -- Conversão real para a base do alimento.
  grams        numeric(12,4) check (grams is null or grams > 0),
  milliliters  numeric(12,4) check (milliliters is null or milliliters > 0),

  is_default   boolean not null default false,
  position     integer not null default 0,
  source_note  text,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint nutrition_food_measures_has_conversion
    check (grams is not null or milliliters is not null)
);

alter table public.nutrition_food_measures enable row level security;
alter table public.nutrition_food_measures force row level security;

drop policy if exists "select own or global" on public.nutrition_food_measures;
create policy "select own or global" on public.nutrition_food_measures
  for select using (user_id = auth.uid() or user_id is null);

drop policy if exists "insert own" on public.nutrition_food_measures;
create policy "insert own" on public.nutrition_food_measures
  for insert with check (user_id = auth.uid());

drop policy if exists "update own" on public.nutrition_food_measures;
create policy "update own" on public.nutrition_food_measures
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "delete own" on public.nutrition_food_measures;
create policy "delete own" on public.nutrition_food_measures
  for delete using (user_id = auth.uid());

create index if not exists nutrition_food_measures_food_idx
  on public.nutrition_food_measures (food_id, position);
create index if not exists nutrition_food_measures_user_idx
  on public.nutrition_food_measures (user_id);
-- No máximo uma medida padrão por alimento e por dono.
create unique index if not exists nutrition_food_measures_default_idx
  on public.nutrition_food_measures (food_id, coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where is_default;

drop trigger if exists set_nutrition_food_measures_updated_at on public.nutrition_food_measures;
create trigger set_nutrition_food_measures_updated_at
  before update on public.nutrition_food_measures
  for each row execute function public.set_updated_at();

comment on table public.nutrition_food_measures is
  'Medida caseira COM conversão real, por alimento. Sem conversão genérica compartilhada.';
