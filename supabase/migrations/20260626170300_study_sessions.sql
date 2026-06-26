-- Fase 11 — Estudos
-- Tabela `study_sessions` (sessão de estudo). Diferente do check-in de hábitos/rotinas,
-- NÃO é única por dia — pode haver várias sessões no mesmo dia (INSERT por sessão).
-- `studied_minutes`/streak do curso derivam destas linhas. `task_id` (Fase 09) é um
-- vínculo OPCIONAL e desacoplado (on delete set null). RLS por user_id = auth.uid().
-- Excluir o curso remove suas sessões; excluir a aula apenas desvincula. Idempotente.

create table if not exists public.study_sessions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  course_id        uuid not null references public.study_courses(id) on delete cascade,
  lesson_id        uuid references public.study_lessons(id) on delete set null,
  session_date     date not null,
  duration_minutes integer not null default 0 check (duration_minutes >= 0),
  what_i_learned   text,
  next_action      text,
  difficulty       text not null default 'media'
                     check (difficulty in ('facil','media','dificil')),
  task_id          uuid references public.tasks(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table public.study_sessions enable row level security;
alter table public.study_sessions force row level security;

drop policy if exists "own rows" on public.study_sessions;
create policy "own rows" on public.study_sessions
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists study_sessions_user_id_idx
  on public.study_sessions (user_id);
create index if not exists study_sessions_user_date_idx
  on public.study_sessions (user_id, session_date);
create index if not exists study_sessions_user_course_idx
  on public.study_sessions (user_id, course_id);

drop trigger if exists set_study_sessions_updated_at on public.study_sessions;
create trigger set_study_sessions_updated_at
  before update on public.study_sessions
  for each row execute function public.set_updated_at();
