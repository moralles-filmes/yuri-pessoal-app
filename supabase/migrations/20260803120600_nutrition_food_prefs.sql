-- Fase 16-A — Dieta e Alimentação · Preferências do usuário sobre um alimento
--
-- POR QUE ESTA TABELA EXISTE: o usuário precisa favoritar, arquivar e ver "mais usados"
-- também para alimentos da BASE DO SISTEMA — que ele não pode editar. Gravar `is_favorite`
-- em nutrition_foods exigiria dar escrita na linha global, quebrando a garantia de que a
-- base é imutável. A preferência é dado do usuário e mora separada.
--
-- `use_count` e `last_used_at` alimentam "recentes" e "mais consumidos" (Subfase B em
-- diante) sem varrer o histórico inteiro do diário a cada busca.
--
-- Tabela 100% do usuário: `user_id` NOT NULL e policy única `for all`, como no resto do
-- sistema.

create table if not exists public.nutrition_food_prefs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  food_id      uuid not null references public.nutrition_foods(id) on delete cascade,

  is_favorite  boolean not null default false,
  -- Arquivar um alimento GLOBAL é preferência do usuário (some da lista dele).
  -- Arquivar um alimento PRÓPRIO usa nutrition_foods.archived_at. A leitura considera os dois.
  archived_at  timestamptz,
  use_count    integer not null default 0 check (use_count >= 0),
  last_used_at timestamptz,
  custom_note  text,
  -- Recategorização SEM tocar na base. A TACO tem itens em seções que surpreendem
  -- (ex.: "Biscoito, polvilho doce" fica em "Verduras, hortaliças e derivados", porque a
  -- tabela é alfabética dentro da seção). Corrigir isso no alimento global seria reescrever
  -- a fonte; aqui o usuário só ajusta a própria visão, e o dado publicado fica intacto.
  category_override_id uuid references public.nutrition_food_categories(id) on delete set null,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.nutrition_food_prefs enable row level security;
alter table public.nutrition_food_prefs force row level security;

drop policy if exists "own rows" on public.nutrition_food_prefs;
create policy "own rows" on public.nutrition_food_prefs
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create unique index if not exists nutrition_food_prefs_user_food_idx
  on public.nutrition_food_prefs (user_id, food_id);
create index if not exists nutrition_food_prefs_user_idx
  on public.nutrition_food_prefs (user_id);
create index if not exists nutrition_food_prefs_favorite_idx
  on public.nutrition_food_prefs (user_id, is_favorite) where is_favorite;
create index if not exists nutrition_food_prefs_recent_idx
  on public.nutrition_food_prefs (user_id, last_used_at desc nulls last);

drop trigger if exists set_nutrition_food_prefs_updated_at on public.nutrition_food_prefs;
create trigger set_nutrition_food_prefs_updated_at
  before update on public.nutrition_food_prefs
  for each row execute function public.set_updated_at();
