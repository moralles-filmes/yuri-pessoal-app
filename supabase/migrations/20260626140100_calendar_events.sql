-- Fase 08 — Agenda & Google Agenda
-- Tabela `calendar_events`: eventos da agenda local, sincronizáveis com o Google Agenda.
-- A agenda local funciona SEM o Google conectado; os campos de sync "ligam" quando há integração.
-- Idempotente: pode ser reaplicada com segurança.

create table if not exists public.calendar_events (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users(id) on delete cascade,
  title                text not null,
  description          text,
  location             text,
  start_at             timestamptz not null,
  end_at               timestamptz not null,
  all_day              boolean not null default false,
  -- Tipo do compromisso → deriva a cor (personalizável via `color`).
  tipo                 text not null default 'pessoal'
                         check (tipo in ('pessoal','trabalho','estudos','exercicios','rotina')),
  color                text,
  -- Recorrência simples (opcional). Expandida na leitura para as visões.
  recurrence_freq      text check (recurrence_freq in ('diaria','semanal','mensal','anual')),
  recurrence_interval  integer not null default 1 check (recurrence_interval >= 1),
  recurrence_until     date,
  -- Lembrete: minutos antes do início (entrega das notificações é da Fase 13).
  reminder_minutes     integer check (reminder_minutes is null or reminder_minutes >= 0),
  -- Vínculo com tarefas (Fase 09): coluna preparada SEM FK (a tabela `tasks` ainda
  -- não existe). Quando a Fase 09 criar `tasks`, adicionar a FK referenciando-a.
  task_id              uuid,
  -- Sincronização com o Google Agenda.
  google_event_id      text,
  google_calendar_id   text,
  etag                 text,
  origin               text not null default 'local' check (origin in ('local','google')),
  synced_at            timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  check (end_at >= start_at)
);

comment on column public.calendar_events.task_id is
  'Fase 09: vínculo evento↔tarefa. Coluna preparada sem FK até a tabela tasks existir.';

alter table public.calendar_events enable row level security;
alter table public.calendar_events force row level security;

drop policy if exists "own rows" on public.calendar_events;
create policy "own rows" on public.calendar_events
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists calendar_events_user_id_idx
  on public.calendar_events (user_id);
create index if not exists calendar_events_user_start_idx
  on public.calendar_events (user_id, start_at);
-- Conciliação de sync: cada evento do Google é único por usuário (evita duplicar).
create unique index if not exists calendar_events_user_google_event_uidx
  on public.calendar_events (user_id, google_event_id)
  where google_event_id is not null;

drop trigger if exists set_calendar_events_updated_at on public.calendar_events;
create trigger set_calendar_events_updated_at
  before update on public.calendar_events
  for each row execute function public.set_updated_at();
