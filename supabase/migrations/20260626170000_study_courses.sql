-- Fase 11 — Estudos
-- Tabela `study_courses` (curso online: marketing, idiomas, tecnologia, etc. — NÃO
-- faculdade/escola). RLS por user_id = auth.uid(). Idempotente.
-- `progress`/`studied_minutes` são DERIVADOS (aulas concluídas / soma das sessões) e
-- recalculados+persistidos pelas Server Actions — fonte única, sem dupla contagem.
-- `weekly_goal_minutes` guarda a meta semanal do idioma (decisão: coluna no curso,
-- não tabela própria, pois é 1:1 com o curso de idioma).

create table if not exists public.study_courses (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  title              text not null,
  platform           text,            -- Udemy, Hotmart, YouTube, Alura, …
  url                text,
  category           text not null default 'outro'
                       check (category in (
                         'marketing','trafego_pago','ingles','idiomas','negocios',
                         'tecnologia','design','vendas','desenvolvimento_pessoal','outro'
                       )),
  status             text not null default 'nao_iniciado'
                       check (status in (
                         'nao_iniciado','em_andamento','pausado','concluido'
                       )),
  priority           text not null default 'media'
                       check (priority in ('baixa','media','alta')),
  -- 0–100 (derivado da razão de aulas concluídas; default 0 enquanto não há aulas).
  progress           numeric(5,2) not null default 0
                       check (progress >= 0 and progress <= 100),
  -- Carga horária total estimada (minutos) e tempo estudado acumulado (minutos).
  -- studied_minutes = SOMA de study_sessions.duration_minutes (nunca soma as aulas).
  workload_minutes   integer not null default 0 check (workload_minutes >= 0),
  studied_minutes    integer not null default 0 check (studied_minutes >= 0),
  -- Meta semanal (minutos) — usada quando is_language = true.
  weekly_goal_minutes integer check (weekly_goal_minutes is null or weekly_goal_minutes >= 0),
  start_date         date,
  target_date        date,            -- meta de conclusão
  notes              text,
  -- Lista de materiais/links: [{ "label": "...", "url": "..." }, ...].
  materials          jsonb not null default '[]'::jsonb,
  is_language        boolean not null default false,
  cover_color        text,
  icon               text,
  position           integer not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table public.study_courses enable row level security;
alter table public.study_courses force row level security;

drop policy if exists "own rows" on public.study_courses;
create policy "own rows" on public.study_courses
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists study_courses_user_id_idx
  on public.study_courses (user_id);
create index if not exists study_courses_user_status_idx
  on public.study_courses (user_id, status);
create index if not exists study_courses_user_category_idx
  on public.study_courses (user_id, category);

drop trigger if exists set_study_courses_updated_at on public.study_courses;
create trigger set_study_courses_updated_at
  before update on public.study_courses
  for each row execute function public.set_updated_at();
