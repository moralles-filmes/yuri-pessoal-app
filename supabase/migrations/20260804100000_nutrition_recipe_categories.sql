-- Fase 16-C — Dieta e Alimentação · Categorias de receita e de refeição-modelo
--
-- Categoria é dado do usuário: ele cria, renomeia e reordena. NÃO existe categoria global
-- aqui (diferente de `nutrition_food_categories`, que carrega a taxonomia da TACO): inventar
-- uma taxonomia de receitas seria opinião nossa sobre a cozinha de outra pessoa.
--
-- A mesma tabela serve às receitas E às refeições-modelo. São duas entidades irmãs, o usuário
-- pensa nelas com o mesmo vocabulário ("café da manhã", "marmita", "doce"), e duas tabelas
-- gêmeas obrigariam a cadastrar "sobremesa" duas vezes.

create table if not exists public.nutrition_recipe_categories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,

  name       text not null check (length(btrim(name)) > 0),
  icon       text,
  color      text,
  position   integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.nutrition_recipe_categories enable row level security;
alter table public.nutrition_recipe_categories force row level security;

drop policy if exists "own rows" on public.nutrition_recipe_categories;
create policy "own rows" on public.nutrition_recipe_categories
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists nutrition_recipe_categories_user_idx
  on public.nutrition_recipe_categories (user_id, position);

-- Nome único por usuário, sem depender de caixa: "Doces" e "doces" são a mesma categoria.
create unique index if not exists nutrition_recipe_categories_name_uidx
  on public.nutrition_recipe_categories (user_id, lower(btrim(name)));

drop trigger if exists set_nutrition_recipe_categories_updated_at on public.nutrition_recipe_categories;
create trigger set_nutrition_recipe_categories_updated_at
  before update on public.nutrition_recipe_categories
  for each row execute function public.set_updated_at();

comment on table public.nutrition_recipe_categories is
  'Categorias de receitas e refeições-modelo. Sempre do usuário: não há taxonomia global de receita.';
