-- Fase 17-F — Treinos · Ponte de sincronização com o Google Agenda (espelho OPT-IN)
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════╗
-- ║ A FONTE DE VERDADE DE "O TREINO ESTÁ PLANEJADO PARA TAL DIA" É                        ║
-- ║ `training_scheduled_workouts`. O evento no Google é ESPELHO — criado por escolha       ║
-- ║ explícita do usuário e sempre com vínculo, para que os dois registros nunca virem      ║
-- ║ duas verdades sobre a mesma coisa.                                                     ║
-- ╚══════════════════════════════════════════════════════════════════════════════════════╝
--
-- Mesmo contrato de `todo_calendar_sync` (Fase 15), de propósito — o sistema tem UM jeito de
-- espelhar um registro interno num calendário externo, não dois:
--
--   • opt-in por `google_integrations.training_sync_enabled` (nasce desligado);
--   • sentido ÚNICO (planejamento → evento). Evento não vira treino: isso duplicaria com a
--     importação da agenda (Fase 08);
--   • idempotência por unique (scheduled_workout_id, provider) — repetir o envio ATUALIZA o
--     mesmo evento em vez de criar outro;
--   • `external_event_id` único por (user_id, provider) — dois dias planejados não podem
--     reivindicar o mesmo evento;
--   • falha do Google nunca derruba a ação: fica em `last_error`, SEM token e SEM corpo de
--     resposta.
--
-- `scheduled_workout_id` é `on delete cascade` (como no TO-DO), e por isso a action remove o
-- evento ANTES do delete — depois, a ponte já não existe e o evento ficaria órfão lá.
--
-- Idempotente.

create table if not exists public.training_calendar_sync (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  scheduled_workout_id  uuid not null references public.training_scheduled_workouts(id) on delete cascade,
  provider              text not null default 'google'
                          check (provider in ('interno','google')),
  local_event_id        uuid references public.calendar_events(id) on delete set null,
  external_event_id     text,
  external_calendar_id  text,
  sync_status           text not null default 'pendente'
                          check (sync_status in ('pendente','sincronizado','erro','desativado')),
  last_synced_at        timestamptz,
  last_error            text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

alter table public.training_calendar_sync enable row level security;
alter table public.training_calendar_sync force row level security;

drop policy if exists "own rows" on public.training_calendar_sync;
create policy "own rows" on public.training_calendar_sync
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create unique index if not exists training_calendar_sync_entry_provider_uidx
  on public.training_calendar_sync (scheduled_workout_id, provider);
create unique index if not exists training_calendar_sync_external_uidx
  on public.training_calendar_sync (user_id, provider, external_event_id)
  where external_event_id is not null;
create index if not exists training_calendar_sync_user_idx
  on public.training_calendar_sync (user_id);

drop trigger if exists set_training_calendar_sync_updated_at on public.training_calendar_sync;
create trigger set_training_calendar_sync_updated_at
  before update on public.training_calendar_sync
  for each row execute function public.set_updated_at();

-- Opt-in do módulo. Nasce FALSE: nenhum treino planejado sai para o calendário sem o usuário
-- pedir. É a mesma coluna-irmã de `todo_sync_enabled` (Fase 15).
alter table public.google_integrations
  add column if not exists training_sync_enabled boolean not null default false;

comment on column public.google_integrations.training_sync_enabled is
  'Quando true, treinos planejados viram eventos no Google Agenda (espelho de sentido único).';
comment on table public.training_calendar_sync is
  'Ponte de idempotência entre um dia planejado de treino e o evento correspondente no provedor. Uma linha por (scheduled_workout_id, provider); external_event_id é único por usuário+provedor.';
comment on column public.training_calendar_sync.last_error is
  'Mensagem curta da última falha. NUNCA guarda token nem corpo de resposta do provedor.';