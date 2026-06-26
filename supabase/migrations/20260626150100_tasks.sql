-- Fase 09 — Demandas, Tarefas & Rotinas
-- Tabela `tasks` (tarefas/demandas). RLS por user_id = auth.uid().
-- Idempotente: pode ser reaplicada com segurança.
--
-- Notas de modelagem:
--  • `status` 'atrasada' existe no CHECK por compatibilidade, mas NÃO é gravado:
--    é DERIVADO na leitura (due_date < hoje e não concluída) — ver src/lib/tasks/status.ts.
--  • `recurrence` jsonb versionável: { freq, interval, weekdays?, until? } (null = sem recorrência)
--    — ver src/lib/tasks/recurrence.ts.
--  • `calendar_event_id` vincula (opcional) a tarefa a um evento da agenda (Fase 08).
--    O vínculo recíproco `calendar_events.task_id` ganha a FK numa migration seguinte.

create table if not exists public.tasks (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  project_id        uuid references public.projects(id) on delete set null,
  title             text not null,
  notes             text,
  priority          text not null default 'media'
                      check (priority in ('baixa','media','alta','urgente')),
  status            text not null default 'pendente'
                      check (status in ('pendente','em_andamento','concluida','atrasada','cancelada')),
  start_date        date,
  due_date          date,
  completed_at      timestamptz,
  tags              text[] not null default '{}',
  recurrence        jsonb,
  reminder_at       timestamptz,
  calendar_event_id uuid references public.calendar_events(id) on delete set null,
  -- Ordem no kanban/lista (dentro do status).
  position          integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table public.tasks enable row level security;
alter table public.tasks force row level security;

drop policy if exists "own rows" on public.tasks;
create policy "own rows" on public.tasks
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists tasks_user_id_idx on public.tasks (user_id);
create index if not exists tasks_user_status_idx on public.tasks (user_id, status);
create index if not exists tasks_user_due_idx on public.tasks (user_id, due_date);
create index if not exists tasks_user_project_idx on public.tasks (user_id, project_id);

drop trigger if exists set_tasks_updated_at on public.tasks;
create trigger set_tasks_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();
