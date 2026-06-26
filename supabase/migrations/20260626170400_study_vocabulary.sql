-- Fase 11 — Estudos (Idiomas)
-- Tabela `study_vocabulary` (vocabulário de um curso de idioma). `mastery` é o nível de
-- domínio; `next_review_date` é uma data simples de revisão (SRS completo fora de escopo).
-- RLS por user_id = auth.uid(). Excluir o curso remove o vocabulário. Idempotente.

create table if not exists public.study_vocabulary (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  course_id        uuid not null references public.study_courses(id) on delete cascade,
  term             text not null,
  translation      text,
  example          text,
  mastery          text not null default 'novo'
                     check (mastery in ('novo','aprendendo','dominado')),
  next_review_date date,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table public.study_vocabulary enable row level security;
alter table public.study_vocabulary force row level security;

drop policy if exists "own rows" on public.study_vocabulary;
create policy "own rows" on public.study_vocabulary
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists study_vocabulary_user_id_idx
  on public.study_vocabulary (user_id);
create index if not exists study_vocabulary_user_course_idx
  on public.study_vocabulary (user_id, course_id);
create index if not exists study_vocabulary_user_mastery_idx
  on public.study_vocabulary (user_id, mastery);

drop trigger if exists set_study_vocabulary_updated_at on public.study_vocabulary;
create trigger set_study_vocabulary_updated_at
  before update on public.study_vocabulary
  for each row execute function public.set_updated_at();
