-- Fase 15 — Módulo TO-DO · Preferências de visualização
-- Ordenação/agrupamento/visão salvos POR ESCOPO: 'global' (visões gerais) ou
-- 'project:<uuid>' (preferência específica daquele projeto), conforme o pedido de
-- "salvar a preferência por usuário e, quando aplicável, por projeto".
-- RLS + FORCE RLS. Idempotente.

create table if not exists public.todo_preferences (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  -- 'global' | 'project:<uuid>' | 'view:<slug>'
  scope      text not null default 'global',
  view       text not null default 'lista'
               check (view in ('lista','quadro','calendario')),
  sort_by    text not null default 'manual'
               check (sort_by in ('manual','data','horario','prazo','prioridade','nome','criacao','conclusao')),
  sort_dir   text not null default 'asc'
               check (sort_dir in ('asc','desc')),
  group_by   text not null default 'nenhum'
               check (group_by in ('nenhum','projeto','secao','prioridade','etiqueta','data','status')),
  show_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.todo_preferences enable row level security;
alter table public.todo_preferences force row level security;

drop policy if exists "own rows" on public.todo_preferences;
create policy "own rows" on public.todo_preferences
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Uma preferência por escopo (permite upsert direto).
create unique index if not exists todo_preferences_user_scope_uidx
  on public.todo_preferences (user_id, scope);

drop trigger if exists set_todo_preferences_updated_at on public.todo_preferences;
create trigger set_todo_preferences_updated_at
  before update on public.todo_preferences
  for each row execute function public.set_updated_at();
