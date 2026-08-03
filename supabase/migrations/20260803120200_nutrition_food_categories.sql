-- Fase 16-A — Dieta e Alimentação · Categorias de alimento
--
-- Mesmo modelo de propriedade das fontes: `user_id` nulo = categoria da base do sistema
-- (as 15 seções da TACO), somente leitura; `user_id` preenchido = categoria do usuário.
-- `parent_id` permite subcategoria sem tabela nova (espelha categories/subcategories da
-- Fase 02, mas em uma tabela só porque aqui a hierarquia é rasa e opcional).

create table if not exists public.nutrition_food_categories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users(id) on delete cascade,

  name       text not null,
  slug       text not null,
  parent_id  uuid references public.nutrition_food_categories(id) on delete set null,
  position   integer not null default 0,
  color      text,
  icon       text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint nutrition_food_categories_parent_not_self
    check (parent_id is null or parent_id <> id)
);

alter table public.nutrition_food_categories enable row level security;
alter table public.nutrition_food_categories force row level security;

drop policy if exists "select own or global" on public.nutrition_food_categories;
create policy "select own or global" on public.nutrition_food_categories
  for select using (user_id = auth.uid() or user_id is null);

drop policy if exists "insert own" on public.nutrition_food_categories;
create policy "insert own" on public.nutrition_food_categories
  for insert with check (user_id = auth.uid());

drop policy if exists "update own" on public.nutrition_food_categories;
create policy "update own" on public.nutrition_food_categories
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "delete own" on public.nutrition_food_categories;
create policy "delete own" on public.nutrition_food_categories
  for delete using (user_id = auth.uid());

create unique index if not exists nutrition_food_categories_global_slug_idx
  on public.nutrition_food_categories (slug) where user_id is null;
create unique index if not exists nutrition_food_categories_user_slug_idx
  on public.nutrition_food_categories (user_id, slug) where user_id is not null;
create index if not exists nutrition_food_categories_user_idx
  on public.nutrition_food_categories (user_id);
create index if not exists nutrition_food_categories_parent_idx
  on public.nutrition_food_categories (parent_id);

drop trigger if exists set_nutrition_food_categories_updated_at on public.nutrition_food_categories;
create trigger set_nutrition_food_categories_updated_at
  before update on public.nutrition_food_categories
  for each row execute function public.set_updated_at();
