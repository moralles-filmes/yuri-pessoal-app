-- Fase 10 — Hábitos
-- Tabela `habits` (cadastro do hábito: leitura, exercícios, água, sono, etc.).
-- Modelo GENÉRICO: água/leitura/exercícios são casos de (target_value + unit),
-- sem tabelas separadas. RLS por user_id = auth.uid(). Idempotente.

create table if not exists public.habits (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  name         text not null,
  category     text not null default 'outro'
                 check (category in (
                   'leitura','exercicios','agua','sono',
                   'alimentacao','caminhada','estudos','outro'
                 )),
  frequency    text not null default 'diaria'
                 check (frequency in ('diaria','semanal','dias_especificos')),
  -- 0=domingo..6=sábado (usado em 'semanal'/'dias_especificos').
  weekdays     integer[] not null default '{}',
  -- Meta do dia na unidade escolhida (ex.: 8 copos, 30 min, 10 páginas, 2 litros).
  target_value numeric(12,2) not null default 1 check (target_value > 0),
  unit         text not null default 'vezes'
                 check (unit in (
                   'vezes','minutos','horas','litros','ml','paginas','passos','km'
                 )),
  time_of_day  time,            -- horário ideal (base para "esquecido" na Fase 13)
  reminder_at  time,            -- horário do lembrete diário (entrega na Fase 13)
  color        text,
  icon         text,
  is_active    boolean not null default true,
  position     integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.habits enable row level security;
alter table public.habits force row level security;

drop policy if exists "own rows" on public.habits;
create policy "own rows" on public.habits
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists habits_user_id_idx on public.habits (user_id);
create index if not exists habits_user_active_idx on public.habits (user_id, is_active);

drop trigger if exists set_habits_updated_at on public.habits;
create trigger set_habits_updated_at
  before update on public.habits
  for each row execute function public.set_updated_at();
