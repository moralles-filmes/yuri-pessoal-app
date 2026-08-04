-- Fase 17-C — Treinos · Descanso
--
-- ═════════════════ O CRONÔMETRO NASCE DE TIMESTAMPS, NÃO DE CONTAGEM ═════════════════
--
-- Nada de "restam 87 segundos" guardado em coluna. O que fica gravado é `started_at`,
-- `planned_seconds` e os ajustes (+15s / +30s / −15s). O restante é
-- `planned + adjustments − (agora − started_at)`, recalculado a cada render e RECALCULADO DO
-- ZERO ao voltar para a aba.
--
-- Um `setInterval` para quando a aba perde o foco, quando a tela bloqueia e quando o navegador
-- descarta a página em segundo plano — exatamente as três coisas que acontecem no meio de um
-- treino. Por isso a verdade é o instante em que o descanso começou.
--
-- ═════════════════ NUNCA DOIS DESCANSOS ATIVOS ═════════════════
--
-- Índice único parcial em (session_id) onde `ended_at is null`. Dois descansos correndo ao
-- mesmo tempo dariam dois cronômetros discordantes na mesma tela.
--
-- `actual_seconds` é o tempo REAL descansado, gravado ao encerrar — pode ser maior que o
-- planejado (o usuário demorou) ou menor (pulou). É o número que a 17-D usa; o planejado
-- sozinho contaria uma intenção como se fosse fato.

create table if not exists public.training_session_rests (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  session_id            uuid not null references public.training_sessions(id) on delete cascade,

  -- De onde o descanso nasceu. `set null`: apagar a série não apaga o tempo que já passou.
  session_exercise_id   uuid references public.training_session_exercises(id) on delete set null,
  session_set_id        uuid references public.training_session_sets(id) on delete set null,

  planned_seconds       integer not null default 90
                          check (planned_seconds >= 0 and planned_seconds <= 3600),
  /* Soma dos ajustes feitos DURANTE o descanso (+15, +30, −15). Separado do planejado para a
     interface poder dizer "90s + 30s" em vez de reescrever a intenção original. */
  adjustment_seconds    integer not null default 0
                          check (adjustment_seconds >= -3600 and adjustment_seconds <= 3600),

  started_at            timestamptz not null,
  ended_at              timestamptz,
  actual_seconds        integer check (actual_seconds is null or actual_seconds >= 0),

  end_kind              text check (end_kind is null or end_kind in ('natural','pulado','proxima_serie','cancelado')),

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint training_session_rests_end_after_start
    check (ended_at is null or ended_at >= started_at),
  -- Descanso encerrado tem tempo real e motivo de encerramento; descanso correndo não tem.
  constraint training_session_rests_closed_has_data
    check (ended_at is null or (actual_seconds is not null and end_kind is not null))
);

alter table public.training_session_rests enable row level security;
alter table public.training_session_rests force row level security;

drop policy if exists "own rows" on public.training_session_rests;
create policy "own rows" on public.training_session_rests
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists training_session_rests_user_idx
  on public.training_session_rests (user_id);
create index if not exists training_session_rests_session_idx
  on public.training_session_rests (session_id, started_at);

-- NUNCA DOIS DESCANSOS ATIVOS na mesma sessão.
create unique index if not exists training_session_rests_active_idx
  on public.training_session_rests (session_id)
  where ended_at is null;

drop trigger if exists set_training_session_rests_updated_at on public.training_session_rests;
create trigger set_training_session_rests_updated_at
  before update on public.training_session_rests
  for each row execute function public.set_updated_at();

comment on table public.training_session_rests is
  'Descanso por TIMESTAMPS. O restante é derivado em src/lib/training/timers.ts; nada de contagem guardada.';
comment on column public.training_session_rests.actual_seconds is
  'Tempo REAL descansado, gravado ao encerrar. Pode ser maior ou menor que o planejado.';
