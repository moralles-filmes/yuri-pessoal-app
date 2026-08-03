-- Fase 16-B — Dieta e Alimentação · Refeição do diário (o que aconteceu num dia)
--
-- ══ STATUS DERIVADO NA LEITURA ══
-- Repare no CHECK abaixo: **'pendente' NÃO existe como valor gravável**, assim como
-- 'atrasada' não existe em `todo_tasks` (Fase 15) e o status da fatura não é gravado
-- (Fase 03). "Pendente" e "atrasada" saem de `planned_time` + hora atual, na leitura
-- (`effectiveMealStatus`, src/lib/nutrition/diary.ts). Persistir estado derivado significaria
-- ter de reprocessar o banco toda hora para ele continuar verdadeiro — e ele ficaria errado
-- entre um processamento e outro.
--
-- Os estados que SÃO fato registrado, e por isso gravados:
--   planejada               → existe no plano do dia, ainda sem desfecho
--   consumida               → comi
--   parcialmente_consumida  → comi parte
--   substituida             → comi outra coisa no lugar
--   nao_consumida           → decidi não comer (diferente de "ainda não comi")
--   fora_do_planejamento    → não estava previsto e aconteceu
--
-- ══ DATA PURA + HORA SEPARADA ══
-- `diary_date` é `date` e `planned_time`/`consumed_time` são `time`. Nunca um timestamptz
-- representando "o dia": na Vercel o processo roda em UTC e das 21h à meia-noite o registro
-- cairia no dia seguinte.
--
-- ══ IDEMPOTÊNCIA ══
-- O índice único parcial em `planned_meal_id` impede que confirmar a mesma refeição planejada
-- duas vezes crie duas refeições no diário (risco listado no doc da subfase).

create table if not exists public.nutrition_diary_meals (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,

  diary_date       date not null,
  meal_type_id     uuid not null references public.nutrition_meal_types(id) on delete restrict,

  -- Refeição planejada correspondente. `set null`: apagar o planejamento não pode apagar o
  -- registro do que foi comido — o diário é fato consumado.
  planned_meal_id  uuid references public.nutrition_planned_meals(id) on delete set null,

  planned_time     time,
  consumed_time    time,

  status           text not null default 'planejada'
                     check (status in ('planejada','consumida','parcialmente_consumida',
                                       'substituida','nao_consumida','fora_do_planejamento')),

  title            text,
  notes            text,
  position         integer not null default 0,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table public.nutrition_diary_meals enable row level security;
alter table public.nutrition_diary_meals force row level security;

drop policy if exists "own rows" on public.nutrition_diary_meals;
create policy "own rows" on public.nutrition_diary_meals
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists nutrition_diary_meals_user_idx
  on public.nutrition_diary_meals (user_id);
create index if not exists nutrition_diary_meals_user_date_idx
  on public.nutrition_diary_meals (user_id, diary_date);
create index if not exists nutrition_diary_meals_meal_type_idx
  on public.nutrition_diary_meals (meal_type_id);
create index if not exists nutrition_diary_meals_planned_idx
  on public.nutrition_diary_meals (planned_meal_id) where planned_meal_id is not null;

-- Uma refeição planejada vira NO MÁXIMO uma refeição do diário. É o que torna "confirmar"
-- idempotente mesmo com clique duplo ou com duas abas abertas.
create unique index if not exists nutrition_diary_meals_planned_unique_idx
  on public.nutrition_diary_meals (user_id, planned_meal_id)
  where planned_meal_id is not null;

drop trigger if exists set_nutrition_diary_meals_updated_at on public.nutrition_diary_meals;
create trigger set_nutrition_diary_meals_updated_at
  before update on public.nutrition_diary_meals
  for each row execute function public.set_updated_at();

comment on table public.nutrition_diary_meals is
  'Refeição de um dia. "pendente"/atraso NÃO são gravados: derivam de planned_time + agora na leitura (src/lib/nutrition/diary.ts).';
comment on column public.nutrition_diary_meals.diary_date is
  'Data pura yyyy-MM-dd. Nunca timestamptz: representa o DIA, e o processo na Vercel roda em UTC.';
