-- Fase 15 — Módulo TO-DO · Projetos
-- Projeto do TO-DO (agrupador de tarefas, com seções e visão padrão).
-- NÃO confundir com `public.projects` (Fase 09) — ver PHASE_15_TODO_COMPLETE.md
-- ("Decisão arquitetural central"): o TO-DO é um módulo novo que coexiste.
-- RLS + FORCE RLS por user_id = auth.uid(). Idempotente.

create table if not exists public.todo_projects (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  -- Projeto-pai (hierarquia opcional). ON DELETE SET NULL: excluir o pai NUNCA
  -- apaga os filhos em silêncio — eles sobem para a raiz.
  parent_project_id uuid references public.todo_projects(id) on delete set null,
  name              text not null,
  description       text,
  -- Nome de um ícone lucide-react (validado na aplicação, não no banco).
  icon              text,
  -- Token de cor do design system (ver TODO_COLORS em src/lib/todo/constants.ts).
  color             text not null default 'gold',
  is_favorite       boolean not null default false,
  default_view      text not null default 'lista'
                      check (default_view in ('lista','quadro','calendario')),
  status            text not null default 'ativo'
                      check (status in ('ativo','arquivado')),
  position          integer not null default 0,
  archived_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table public.todo_projects enable row level security;
alter table public.todo_projects force row level security;

drop policy if exists "own rows" on public.todo_projects;
create policy "own rows" on public.todo_projects
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists todo_projects_user_idx
  on public.todo_projects (user_id);
create index if not exists todo_projects_user_status_pos_idx
  on public.todo_projects (user_id, status, position);
create index if not exists todo_projects_parent_idx
  on public.todo_projects (parent_project_id);

drop trigger if exists set_todo_projects_updated_at on public.todo_projects;
create trigger set_todo_projects_updated_at
  before update on public.todo_projects
  for each row execute function public.set_updated_at();
