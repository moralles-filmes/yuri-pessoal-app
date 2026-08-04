-- Fase 16-D — Dieta e Alimentação · Categorias de mercado (corredores)
--
-- Agrupar a lista por corredor é o que faz a compra ser feita numa volta só, em vez de ir e
-- voltar no hortifruti três vezes. A categoria aqui NÃO é a categoria nutricional do alimento
-- (`nutrition_food_categories`, que carrega a taxonomia da TACO): é a topologia do mercado
-- onde ESTA pessoa compra. "Suplementos" e "congelados" não são grupos alimentares.
--
-- POR QUE É DADO DO USUÁRIO (e não uma tabela global com `user_id is null`, como os alimentos):
-- o layout de mercado é pessoal e mutável — quem compra em feira não tem "congelados", quem
-- compra em atacado tem "a granel". As dez categorias do enunciado da subfase entram como
-- SEMENTE na primeira leitura do módulo (`ensureMarketCategories`, idempotente pelo unique
-- (user_id, slug)), exatamente como os tipos de refeição da 16-B — e daí em diante o usuário
-- renomeia, reordena, cria e apaga.
--
-- O `slug` existe só para a semente ser idempotente. O que a tela mostra é `name`, que o
-- usuário pode reescrever sem que a semente volte a criar a linha original.

create table if not exists public.nutrition_market_categories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,

  slug       text,
  name       text not null check (length(btrim(name)) > 0),
  icon       text,
  color      text,
  position   integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.nutrition_market_categories enable row level security;
alter table public.nutrition_market_categories force row level security;

drop policy if exists "own rows" on public.nutrition_market_categories;
create policy "own rows" on public.nutrition_market_categories
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists nutrition_market_categories_user_idx
  on public.nutrition_market_categories (user_id, position);

-- Idempotência da semente. Parcial porque categoria criada pelo usuário não tem slug.
create unique index if not exists nutrition_market_categories_slug_uidx
  on public.nutrition_market_categories (user_id, slug)
  where slug is not null;

-- Nome único por usuário, sem depender de caixa: "Padaria" e "padaria" são a mesma coisa.
create unique index if not exists nutrition_market_categories_name_uidx
  on public.nutrition_market_categories (user_id, lower(btrim(name)));

drop trigger if exists set_nutrition_market_categories_updated_at on public.nutrition_market_categories;
create trigger set_nutrition_market_categories_updated_at
  before update on public.nutrition_market_categories
  for each row execute function public.set_updated_at();

comment on table public.nutrition_market_categories is
  'Corredores do mercado, por usuário. Semeada na primeira leitura (ensureMarketCategories), idempotente pelo unique (user_id, slug). Não é taxonomia nutricional.';
comment on column public.nutrition_market_categories.slug is
  'Só para a semente ser idempotente. Nulo nas categorias criadas pelo usuário.';
