-- Fase 17-C — Treinos · Local de treino (academia, casa, hotel…)
--
-- Serve a duas coisas concretas da sessão ao vivo:
--   1. Registrar ONDE o treino aconteceu (dado do usuário, nunca inferido).
--   2. Alimentar a CALCULADORA DE ANILHAS com o que existe naquele lugar
--      (`training_location_plates`) — sugerir 62,5 kg numa academia sem anilha de 1,25 kg é
--      sugerir o impossível.
--
-- `is_default` tem índice único parcial: mais de um "local padrão" faria a preparação da
-- sessão escolher um deles sem critério. Trocar o padrão é uma ação explícita que desmarca o
-- anterior.

create table if not exists public.training_locations (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,

  name         text not null check (length(btrim(name)) between 1 and 120),
  notes        text,

  is_default   boolean not null default false,

  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.training_locations enable row level security;
alter table public.training_locations force row level security;

drop policy if exists "own rows" on public.training_locations;
create policy "own rows" on public.training_locations
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists training_locations_user_idx
  on public.training_locations (user_id);

-- Um local padrão por usuário. O índice é parcial: locais não-padrão não competem entre si.
create unique index if not exists training_locations_default_idx
  on public.training_locations (user_id)
  where is_default;

-- Nome único por usuário (ignorando maiúsculas): "Academia" duas vezes é erro de digitação.
create unique index if not exists training_locations_user_name_idx
  on public.training_locations (user_id, lower(btrim(name)));

drop trigger if exists set_training_locations_updated_at on public.training_locations;
create trigger set_training_locations_updated_at
  before update on public.training_locations
  for each row execute function public.set_updated_at();

comment on table public.training_locations is
  'Local de treino do usuário. Alimenta o registro da sessão e a calculadora de anilhas (17-C).';
comment on column public.training_locations.is_default is
  'Local sugerido na preparação da sessão. Índice único parcial garante no máximo um por usuário.';
