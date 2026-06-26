-- Fase 11 — Estudos (Idiomas)
-- Tabela `study_language_practice` (prática por habilidade de um curso de idioma).
-- A meta semanal fica em study_courses.weekly_goal_minutes; aqui registra-se o tempo
-- por habilidade (listening/speaking/reading/writing). RLS por user_id = auth.uid().
-- Excluir o curso remove a prática. Idempotente.

create table if not exists public.study_language_practice (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  course_id        uuid not null references public.study_courses(id) on delete cascade,
  practice_date    date not null,
  skill            text not null
                     check (skill in ('listening','speaking','reading','writing')),
  duration_minutes integer not null default 0 check (duration_minutes >= 0),
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table public.study_language_practice enable row level security;
alter table public.study_language_practice force row level security;

drop policy if exists "own rows" on public.study_language_practice;
create policy "own rows" on public.study_language_practice
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists study_language_practice_user_id_idx
  on public.study_language_practice (user_id);
create index if not exists study_language_practice_user_course_idx
  on public.study_language_practice (user_id, course_id);
create index if not exists study_language_practice_user_date_idx
  on public.study_language_practice (user_id, practice_date);

drop trigger if exists set_study_language_practice_updated_at on public.study_language_practice;
create trigger set_study_language_practice_updated_at
  before update on public.study_language_practice
  for each row execute function public.set_updated_at();
