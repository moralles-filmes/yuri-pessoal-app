-- Fase 11 — Estudos
-- Tabela `study_lessons` (aula de um módulo). `course_id` é DESNORMALIZADO (preenchido
-- no servidor, sempre consistente com o módulo) para consulta direta por curso.
-- Marcar `is_done` alimenta o progresso do curso (derivado). RLS por user_id = auth.uid().
-- Excluir o módulo/curso remove as aulas (on delete cascade). Idempotente.

create table if not exists public.study_lessons (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  module_id        uuid not null references public.study_modules(id) on delete cascade,
  course_id        uuid not null references public.study_courses(id) on delete cascade,
  title            text not null,
  url              text,
  duration_minutes integer not null default 0 check (duration_minutes >= 0),
  is_done          boolean not null default false,
  completed_at     timestamptz,
  position         integer not null default 0,
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table public.study_lessons enable row level security;
alter table public.study_lessons force row level security;

drop policy if exists "own rows" on public.study_lessons;
create policy "own rows" on public.study_lessons
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists study_lessons_user_id_idx
  on public.study_lessons (user_id);
create index if not exists study_lessons_user_course_idx
  on public.study_lessons (user_id, course_id);
create index if not exists study_lessons_user_module_idx
  on public.study_lessons (user_id, module_id);
create index if not exists study_lessons_user_done_idx
  on public.study_lessons (user_id, is_done);

drop trigger if exists set_study_lessons_updated_at on public.study_lessons;
create trigger set_study_lessons_updated_at
  before update on public.study_lessons
  for each row execute function public.set_updated_at();
