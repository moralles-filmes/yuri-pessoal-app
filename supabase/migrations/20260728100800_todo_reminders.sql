-- Fase 15 — Módulo TO-DO · Lembretes
-- Uma tarefa pode ter VÁRIOS lembretes (no horário, 15 min antes, 1 dia antes…).
-- O disparo é feito pelo Vercel Cron já existente (/api/cron/notifications), que cria
-- uma linha em `notifications` com dedupe_key determinístico — por isso `status`/
-- `sent_at`/`attempts` ficam aqui, e não uma fila paralela.
--
-- CANAL: só 'interno' (o sino de notificações) está implementado. 'email'/'push' existem
-- no CHECK para evolução futura, mas a aplicação NÃO oferece esses canais enquanto não
-- houver infraestrutura real — a regra do projeto proíbe simular canal inexistente.
-- RLS + FORCE RLS. Idempotente.

create table if not exists public.todo_reminders (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  task_id    uuid not null references public.todo_tasks(id) on delete cascade,
  -- Instante absoluto do disparo (calculado a partir de data+hora da tarefa e do offset).
  remind_at  timestamptz not null,
  -- Minutos antes do horário da tarefa (0 = no horário). NULL = lembrete absoluto.
  offset_minutes integer,
  channel    text not null default 'interno'
               check (channel in ('interno','email','push')),
  status     text not null default 'pendente'
               check (status in ('pendente','enviado','falhou','cancelado')),
  sent_at    timestamptz,
  attempts   integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.todo_reminders enable row level security;
alter table public.todo_reminders force row level security;

drop policy if exists "own rows" on public.todo_reminders;
create policy "own rows" on public.todo_reminders
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists todo_reminders_user_idx
  on public.todo_reminders (user_id);
create index if not exists todo_reminders_task_idx
  on public.todo_reminders (task_id);
-- Índice parcial: o Cron só varre lembretes PENDENTES.
create index if not exists todo_reminders_pending_idx
  on public.todo_reminders (user_id, remind_at)
  where status = 'pendente';

drop trigger if exists set_todo_reminders_updated_at on public.todo_reminders;
create trigger set_todo_reminders_updated_at
  before update on public.todo_reminders
  for each row execute function public.set_updated_at();
