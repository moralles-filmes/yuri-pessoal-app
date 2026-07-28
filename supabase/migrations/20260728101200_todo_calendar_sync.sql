-- Fase 15 — Módulo TO-DO · Ponte de sincronização com calendário
-- MODELAGEM PREPARADA, SINCRONIZAÇÃO NÃO IMPLEMENTADA (ver "Fora do escopo" no doc da
-- fase). A integração Google da Fase 08 é de LEITURA/importação de eventos; escrever
-- eventos a partir de tarefas exige escopo OAuth de escrita, que não está configurado.
-- Esta tabela existe para que a integração futura tenha idempotência desde o primeiro
-- dia (unique por tarefa+provedor e por id externo) — e NUNCA para simular sync.
--
-- `local_event_id` aponta para o evento da agenda interna (calendar_events, Fase 08).
-- `external_event_id` é o id do evento no provedor (ex.: Google Agenda).
-- RLS + FORCE RLS. Idempotente.

create table if not exists public.todo_calendar_sync (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  task_id           uuid not null references public.todo_tasks(id) on delete cascade,
  provider          text not null default 'interno'
                      check (provider in ('interno','google')),
  local_event_id    uuid references public.calendar_events(id) on delete set null,
  external_event_id text,
  external_calendar_id text,
  sync_status       text not null default 'pendente'
                      check (sync_status in ('pendente','sincronizado','erro','desativado')),
  last_synced_at    timestamptz,
  last_error        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table public.todo_calendar_sync enable row level security;
alter table public.todo_calendar_sync force row level security;

drop policy if exists "own rows" on public.todo_calendar_sync;
create policy "own rows" on public.todo_calendar_sync
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Idempotência: uma ponte por tarefa+provedor…
create unique index if not exists todo_calendar_sync_task_provider_uidx
  on public.todo_calendar_sync (task_id, provider);
-- …e um evento externo não pode ser reivindicado por duas tarefas (evita duplicar evento).
create unique index if not exists todo_calendar_sync_external_uidx
  on public.todo_calendar_sync (user_id, provider, external_event_id)
  where external_event_id is not null;
create index if not exists todo_calendar_sync_user_idx
  on public.todo_calendar_sync (user_id);

drop trigger if exists set_todo_calendar_sync_updated_at on public.todo_calendar_sync;
create trigger set_todo_calendar_sync_updated_at
  before update on public.todo_calendar_sync
  for each row execute function public.set_updated_at();
