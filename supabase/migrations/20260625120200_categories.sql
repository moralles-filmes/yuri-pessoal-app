-- Fase 02 — Financeiro Base
-- Tabelas `categories` e `subcategories`. RLS por user_id = auth.uid().

create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  kind        text not null default 'despesa'
                check (kind in ('despesa','receita','ambos')),
  color       text not null default '#A98438',
  icon        text not null default 'tag',
  is_default  boolean not null default false,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.subcategories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  name        text not null,
  is_active   boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.categories enable row level security;
alter table public.categories force row level security;
alter table public.subcategories enable row level security;
alter table public.subcategories force row level security;

drop policy if exists "own rows" on public.categories;
create policy "own rows" on public.categories
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "own rows" on public.subcategories;
create policy "own rows" on public.subcategories
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists categories_user_id_idx on public.categories (user_id);
create index if not exists categories_user_kind_idx on public.categories (user_id, kind);
create index if not exists subcategories_user_id_idx on public.subcategories (user_id);
create index if not exists subcategories_category_idx on public.subcategories (category_id);

-- Evita semear a mesma categoria padrão duas vezes para o mesmo usuário.
create unique index if not exists categories_user_default_name_uniq
  on public.categories (user_id, name) where is_default;

drop trigger if exists set_categories_updated_at on public.categories;
create trigger set_categories_updated_at
  before update on public.categories
  for each row execute function public.set_updated_at();

drop trigger if exists set_subcategories_updated_at on public.subcategories;
create trigger set_subcategories_updated_at
  before update on public.subcategories
  for each row execute function public.set_updated_at();
