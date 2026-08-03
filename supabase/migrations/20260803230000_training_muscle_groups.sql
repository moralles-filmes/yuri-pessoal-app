-- Fase 17-A — Treinos · Grupos musculares
--
-- MESMA REGRA DE PROPRIEDADE DO CATÁLOGO DE ALIMENTOS (Fase 16-A):
--   `user_id` nulo = linha da BASE DO SISTEMA, somente leitura. As policies são separadas
--   por comando — SELECT alcança o global, escrita não. É o que permite ler o vocabulário
--   oficial do módulo sem nunca poder reescrevê-lo.
--
-- HIERARQUIA RASA E OPCIONAL: "Deltoide lateral" tem `parent_id` = "Ombros"; "Dorsais" e
-- "Trapézio" têm `parent_id` = "Costas". Isso permite filtrar por "Ombros" e alcançar as
-- três porções sem duplicar o exercício em três grupos — que é a duplicidade inconsistente
-- que o briefing pede para evitar.

create table if not exists public.training_muscle_groups (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade,

  slug        text not null,
  name        text not null,
  region      text not null default 'outro'
                check (region in ('superior','inferior','tronco','corpo_inteiro','cardio','outro')),
  parent_id   uuid references public.training_muscle_groups(id) on delete set null,
  color       text,
  position    integer not null default 0,

  is_system   boolean not null default false,
  archived_at timestamptz,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- Linha global é sempre do sistema, e vice-versa: evita grupo global editável.
  constraint training_muscle_groups_global_is_system
    check ((user_id is null) = is_system),
  constraint training_muscle_groups_parent_not_self
    check (parent_id is null or parent_id <> id)
);

alter table public.training_muscle_groups enable row level security;
alter table public.training_muscle_groups force row level security;

drop policy if exists "select own or global" on public.training_muscle_groups;
create policy "select own or global" on public.training_muscle_groups
  for select using (user_id = auth.uid() or user_id is null);

drop policy if exists "insert own" on public.training_muscle_groups;
create policy "insert own" on public.training_muscle_groups
  for insert with check (user_id = auth.uid());

drop policy if exists "update own" on public.training_muscle_groups;
create policy "update own" on public.training_muscle_groups
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "delete own" on public.training_muscle_groups;
create policy "delete own" on public.training_muscle_groups
  for delete using (user_id = auth.uid());

-- Dois índices parciais em vez de um único composto: `unique (user_id, slug)` não impediria
-- dois grupos globais com o mesmo slug, porque NULL nunca é igual a NULL.
create unique index if not exists training_muscle_groups_global_slug_idx
  on public.training_muscle_groups (slug) where user_id is null;
create unique index if not exists training_muscle_groups_user_slug_idx
  on public.training_muscle_groups (user_id, slug) where user_id is not null;

create index if not exists training_muscle_groups_user_idx
  on public.training_muscle_groups (user_id);
create index if not exists training_muscle_groups_parent_idx
  on public.training_muscle_groups (parent_id) where parent_id is not null;
create index if not exists training_muscle_groups_region_idx
  on public.training_muscle_groups (region);

drop trigger if exists set_training_muscle_groups_updated_at on public.training_muscle_groups;
create trigger set_training_muscle_groups_updated_at
  before update on public.training_muscle_groups
  for each row execute function public.set_updated_at();

comment on table public.training_muscle_groups is
  'Grupos musculares. user_id nulo = base do sistema (somente leitura, is_system = true).';
comment on column public.training_muscle_groups.parent_id is
  'Agrupamento raso e opcional (Deltoide lateral -> Ombros). Evita repetir o exercício em vários grupos.';
