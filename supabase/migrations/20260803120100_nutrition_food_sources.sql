-- Fase 16-A — Dieta e Alimentação · Fontes nutricionais
--
-- Toda informação nutricional do sistema aponta para uma fonte. É a exigência que separa
-- "base confiável" de "números soltos": o usuário precisa saber de onde veio o valor, qual
-- versão da tabela, qual o código original do alimento naquela fonte e quando foi conferido.
--
-- PROPRIEDADE (padrão de todo o módulo):
--   user_id IS NULL  → linha GLOBAL, da base do sistema, SOMENTE LEITURA
--   user_id = auth.uid() → linha do usuário, editável
-- As policies são separadas por comando (não `for all`) justamente para que o SELECT
-- alcance o global e a escrita não.

create table if not exists public.nutrition_food_sources (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete cascade,

  code          text not null,
  name          text not null,
  publisher     text,
  edition       text,
  version       text,
  reference_url text,
  -- Termos que permitem o uso do dado. Preencher SEMPRE em fonte oficial.
  license_note  text,
  -- Como citar a obra (aparece na interface).
  citation      text,
  obtained_at   date,
  is_official   boolean not null default false,
  notes         text,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.nutrition_food_sources enable row level security;
alter table public.nutrition_food_sources force row level security;

drop policy if exists "select own or global" on public.nutrition_food_sources;
create policy "select own or global" on public.nutrition_food_sources
  for select using (user_id = auth.uid() or user_id is null);

drop policy if exists "insert own" on public.nutrition_food_sources;
create policy "insert own" on public.nutrition_food_sources
  for insert with check (user_id = auth.uid());

drop policy if exists "update own" on public.nutrition_food_sources;
create policy "update own" on public.nutrition_food_sources
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "delete own" on public.nutrition_food_sources;
create policy "delete own" on public.nutrition_food_sources
  for delete using (user_id = auth.uid());

-- Um código por escopo: 'taco-4' global é único; o usuário tem o seu próprio espaço.
create unique index if not exists nutrition_food_sources_global_code_idx
  on public.nutrition_food_sources (code) where user_id is null;
create unique index if not exists nutrition_food_sources_user_code_idx
  on public.nutrition_food_sources (user_id, code) where user_id is not null;
create index if not exists nutrition_food_sources_user_idx
  on public.nutrition_food_sources (user_id);

drop trigger if exists set_nutrition_food_sources_updated_at on public.nutrition_food_sources;
create trigger set_nutrition_food_sources_updated_at
  before update on public.nutrition_food_sources
  for each row execute function public.set_updated_at();

comment on column public.nutrition_food_sources.license_note is
  'Termos que autorizam o uso do dado. Sem isso, a fonte não deve ser importada em massa.';
