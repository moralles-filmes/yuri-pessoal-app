-- Fase 16-B — Dieta e Alimentação · Tipos de refeição
--
-- Café da manhã, lanche, almoço… são DADO DO USUÁRIO, não enum do sistema: ele cria, edita,
-- reordena e desativa. Por isso `user_id` é NOT NULL aqui (diferente de `nutrition_foods`,
-- onde a base do sistema é global e imutável) — não existe "tipo de refeição oficial".
--
-- COMO O SEED ACONTECE (decisão registrada): não há INSERT de dado de usuário em migration.
-- Os 8 tipos padrão são criados na PRIMEIRA leitura do módulo, por `ensureMealTypes()`
-- (src/lib/nutrition/diary-queries.ts), de forma idempotente graças ao unique (user_id, slug).
-- Assim um usuário novo recebe os padrões sem que a migration precise adivinhar quem existe.
--
-- DESATIVAR ≠ EXCLUIR. `is_active = false` some da UI de lançamento mas preserva todo o
-- histórico que aponta para o tipo. Excluir só é permitido quando não há uso — a FK das
-- refeições é `on delete restrict`, e a action confere antes para dar mensagem em pt-BR.

create table if not exists public.nutrition_meal_types (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,

  name         text not null,
  -- Identidade estável do tipo padrão. É o que torna o seed reexecutável sem duplicar;
  -- tipos criados pelo usuário recebem um slug derivado do nome.
  slug         text not null,

  icon         text,
  color        text,
  -- Horário sugerido — vira `planned_time` quando o usuário monta o dia. Só sugestão.
  default_time time,

  position     integer not null default 0,
  is_active    boolean not null default true,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.nutrition_meal_types enable row level security;
alter table public.nutrition_meal_types force row level security;

drop policy if exists "own rows" on public.nutrition_meal_types;
create policy "own rows" on public.nutrition_meal_types
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create unique index if not exists nutrition_meal_types_user_slug_idx
  on public.nutrition_meal_types (user_id, slug);
-- Dois "Almoço" confundiriam o lançamento rápido; a comparação é sem caixa.
create unique index if not exists nutrition_meal_types_user_name_idx
  on public.nutrition_meal_types (user_id, lower(name));
create index if not exists nutrition_meal_types_user_position_idx
  on public.nutrition_meal_types (user_id, position);

drop trigger if exists set_nutrition_meal_types_updated_at on public.nutrition_meal_types;
create trigger set_nutrition_meal_types_updated_at
  before update on public.nutrition_meal_types
  for each row execute function public.set_updated_at();

comment on table public.nutrition_meal_types is
  'Tipos de refeição do usuário (criáveis, editáveis, reordenáveis, desativáveis). Seed idempotente feito na primeira leitura via ensureMealTypes(), não em migration.';
