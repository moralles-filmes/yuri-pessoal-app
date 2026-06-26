-- Fase 11 — Estudos
-- Tabela `study_modules` (módulo/seção de um curso). RLS por user_id = auth.uid().
-- Excluir o curso remove seus módulos (on delete cascade). Idempotente.

create table if not exists public.study_modules (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  course_id  uuid not null references public.study_courses(id) on delete cascade,
  title      text not null,
  position   integer not null default 0,
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.study_modules enable row level security;
alter table public.study_modules force row level security;

drop policy if exists "own rows" on public.study_modules;
create policy "own rows" on public.study_modules
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists study_modules_user_id_idx
  on public.study_modules (user_id);
create index if not exists study_modules_user_course_idx
  on public.study_modules (user_id, course_id);

drop trigger if exists set_study_modules_updated_at on public.study_modules;
create trigger set_study_modules_updated_at
  before update on public.study_modules
  for each row execute function public.set_updated_at();
