-- Fase 17-C — Treinos · Pausas da sessão
--
-- Uma pausa é um intervalo (início/fim). O TEMPO ATIVO da sessão é
-- `total − pausas − descansos` (união dos intervalos, para um descanso dentro de uma pausa não
-- ser subtraído duas vezes) — a conta mora em `src/lib/training/timers.ts`, com `agora`
-- injetado.
--
-- Guardar "minutos pausados" acumulados numa coluna faria o número envelhecer errado assim que
-- o usuário fechasse a aba no meio da pausa. Intervalos com timestamp sobrevivem a isso.
--
-- Índice único parcial garante NO MÁXIMO UMA pausa aberta por sessão.

create table if not exists public.training_session_pauses (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  session_id    uuid not null references public.training_sessions(id) on delete cascade,

  started_at    timestamptz not null,
  ended_at      timestamptz,
  reason        text,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint training_session_pauses_end_after_start
    check (ended_at is null or ended_at >= started_at)
);

alter table public.training_session_pauses enable row level security;
alter table public.training_session_pauses force row level security;

drop policy if exists "own rows" on public.training_session_pauses;
create policy "own rows" on public.training_session_pauses
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists training_session_pauses_user_idx
  on public.training_session_pauses (user_id);
create index if not exists training_session_pauses_session_idx
  on public.training_session_pauses (session_id, started_at);

create unique index if not exists training_session_pauses_active_idx
  on public.training_session_pauses (session_id)
  where ended_at is null;

drop trigger if exists set_training_session_pauses_updated_at on public.training_session_pauses;
create trigger set_training_session_pauses_updated_at
  before update on public.training_session_pauses
  for each row execute function public.set_updated_at();

comment on table public.training_session_pauses is
  'Intervalos de pausa. O tempo ativo (total − pausas − descansos) é derivado em timers.ts, nunca acumulado em coluna.';
