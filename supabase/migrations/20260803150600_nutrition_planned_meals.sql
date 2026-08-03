-- Fase 16-B — Dieta e Alimentação · Refeição planejada
--
-- ══ PLANEJADO ≠ CONSUMIDO (regra 2 da subfase) ══
-- Esta tabela e a `nutrition_diary_meals` são SEPARADAS de propósito. Registrar consumo
-- nunca escreve aqui. O planejamento permanece intacto para sempre, e a diferença entre o
-- que se pretendia e o que se comeu é DERIVADA na leitura. Se o consumo sobrescrevesse o
-- plano, a pergunta "eu segui o planejado?" ficaria impossível de responder no dia seguinte.
--
-- ══ DUAS ÂNCORAS, MUTUAMENTE EXCLUSIVAS ══
--   planned_date NOT NULL → refeição de um DIA CONCRETO (é com esta que o diário compara)
--   planned_date NULL     → refeição de um MODELO, ancorada em plan_day_id (sem data)
-- A CHECK garante que toda linha tem pelo menos uma âncora. Uma refeição materializada a
-- partir de um modelo tem as duas: a data e a origem — é o que permite editar "este dia e os
-- próximos" sabendo de onde cada linha veio.
--
-- ══ ESCOPO DE EDIÇÃO ══
-- `plan_day_id` + `planned_date` sustentam as três escolhas exigidas pela regra 5:
--   somente este dia      → altera a linha com esta data
--   este dia e os próximos→ altera as linhas com o mesmo plan_day_id e data >= a escolhida
--   todo o modelo         → altera a linha do modelo (planned_date null) e rematerializa
-- Nada disso é decidido pelo sistema: a UI SEMPRE pergunta, como no TO-DO (Fase 15).
--
-- DATA PURA (`date`) — nunca timestamptz. Na Vercel o processo roda em UTC e um timestamptz
-- "viraria o dia" entre 21h e 00h BRT.

create table if not exists public.nutrition_planned_meals (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,

  -- De qual modelo a refeição veio (informativo). `set null` porque apagar o modelo não pode
  -- apagar o que já foi planejado para datas concretas.
  plan_id       uuid references public.nutrition_plans(id) on delete set null,
  -- Dia do modelo: âncora (quando planned_date é nulo) ou origem (quando materializada).
  plan_day_id   uuid references public.nutrition_plan_days(id) on delete set null,

  planned_date  date,

  meal_type_id  uuid not null references public.nutrition_meal_types(id) on delete restrict,
  planned_time  time,

  -- Nome livre quando o tipo não basta ("Almoço pós-treino").
  title         text,
  notes         text,
  position      integer not null default 0,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- Sem data e sem dia de modelo a linha não pertence a lugar nenhum.
  constraint nutrition_planned_meals_has_anchor
    check (planned_date is not null or plan_day_id is not null)
);

alter table public.nutrition_planned_meals enable row level security;
alter table public.nutrition_planned_meals force row level security;

drop policy if exists "own rows" on public.nutrition_planned_meals;
create policy "own rows" on public.nutrition_planned_meals
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists nutrition_planned_meals_user_idx
  on public.nutrition_planned_meals (user_id);
create index if not exists nutrition_planned_meals_user_date_idx
  on public.nutrition_planned_meals (user_id, planned_date) where planned_date is not null;
create index if not exists nutrition_planned_meals_plan_day_idx
  on public.nutrition_planned_meals (plan_day_id) where plan_day_id is not null;
create index if not exists nutrition_planned_meals_plan_idx
  on public.nutrition_planned_meals (plan_id) where plan_id is not null;
create index if not exists nutrition_planned_meals_meal_type_idx
  on public.nutrition_planned_meals (meal_type_id);

-- Aplicar o mesmo modelo duas vezes ao mesmo período não pode duplicar refeição: a
-- materialização é um upsert por (dia do modelo, data). Refeições avulsas (sem plan_day_id)
-- ficam de fora do índice e podem se repetir livremente — dois lanches no mesmo dia é normal.
create unique index if not exists nutrition_planned_meals_materialized_idx
  on public.nutrition_planned_meals (plan_day_id, planned_date, meal_type_id)
  where plan_day_id is not null and planned_date is not null;

drop trigger if exists set_nutrition_planned_meals_updated_at on public.nutrition_planned_meals;
create trigger set_nutrition_planned_meals_updated_at
  before update on public.nutrition_planned_meals
  for each row execute function public.set_updated_at();

comment on table public.nutrition_planned_meals is
  'Refeição planejada. NUNCA é sobrescrita pelo registro de consumo — o diário mora em nutrition_diary_meals e a diferença é derivada na leitura.';
comment on column public.nutrition_planned_meals.planned_date is
  'Data pura yyyy-MM-dd. NULO = linha de modelo (ancorada em plan_day_id). Nunca timestamptz: representa o DIA, não um instante.';
