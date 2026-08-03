-- Fase 16-A — Dieta e Alimentação · Etiquetas de alimento (do usuário)
--
-- Etiqueta é sempre do usuário — inclusive quando aplicada a um alimento da base do sistema
-- (mesmo motivo de nutrition_food_prefs: a base é imutável). Espelha o modelo de
-- todo_labels/todo_task_labels da Fase 15.

create table if not exists public.nutrition_food_tags (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,

  name       text not null,
  color      text,
  position   integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.nutrition_food_tags enable row level security;
alter table public.nutrition_food_tags force row level security;

drop policy if exists "own rows" on public.nutrition_food_tags;
create policy "own rows" on public.nutrition_food_tags
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create unique index if not exists nutrition_food_tags_user_name_idx
  on public.nutrition_food_tags (user_id, lower(name));
create index if not exists nutrition_food_tags_user_idx
  on public.nutrition_food_tags (user_id, position);

drop trigger if exists set_nutrition_food_tags_updated_at on public.nutrition_food_tags;
create trigger set_nutrition_food_tags_updated_at
  before update on public.nutrition_food_tags
  for each row execute function public.set_updated_at();


-- ─────────────────────────── Associação alimento ↔ etiqueta ───────────────────────────
create table if not exists public.nutrition_food_tag_links (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  food_id    uuid not null references public.nutrition_foods(id) on delete cascade,
  tag_id     uuid not null references public.nutrition_food_tags(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.nutrition_food_tag_links enable row level security;
alter table public.nutrition_food_tag_links force row level security;

drop policy if exists "own rows" on public.nutrition_food_tag_links;
create policy "own rows" on public.nutrition_food_tag_links
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create unique index if not exists nutrition_food_tag_links_unique_idx
  on public.nutrition_food_tag_links (user_id, food_id, tag_id);
create index if not exists nutrition_food_tag_links_food_idx
  on public.nutrition_food_tag_links (food_id);
create index if not exists nutrition_food_tag_links_tag_idx
  on public.nutrition_food_tag_links (tag_id);
