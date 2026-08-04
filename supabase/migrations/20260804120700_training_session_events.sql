-- Fase 17-C — Treinos · Linha do tempo da sessão (APPEND-ONLY)
--
-- Registro do que aconteceu, na ordem em que aconteceu: iniciou, concluiu série, descansou,
-- reordenou, pulou, substituiu, pausou, retomou, finalizou.
--
-- Serve a duas coisas:
--   1. A sessão poder ser RECONSTITUÍDA depois — "por que este exercício está no fim?".
--   2. A 17-D poder explicar o histórico sem adivinhar a partir do estado final.
--
-- APPEND-ONLY POR DESENHO: não há `updated_at` nem trigger de atualização. Evento reescrito
-- deixa de ser evento e vira opinião sobre o passado. Excluir a sessão leva os eventos junto
-- (cascade) — fora isso, nada os altera.
--
-- `payload` guarda o detalhe específico do tipo (posições antes/depois, segundos ajustados,
-- id do substituto). Manter uma coluna por tipo de evento criaria uma tabela larga e vazia.

create table if not exists public.training_session_events (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  session_id            uuid not null references public.training_sessions(id) on delete cascade,

  kind                  text not null
                          check (kind in ('sessao_iniciada','sessao_pausada','sessao_retomada',
                                          'sessao_concluida','sessao_abandonada','sessao_cancelada',
                                          'sessao_reaberta',
                                          'serie_registrada','serie_desfeita','serie_pulada','serie_adicionada',
                                          'descanso_iniciado','descanso_encerrado','descanso_ajustado',
                                          'exercicio_iniciado','exercicio_reordenado','exercicio_pulado',
                                          'exercicio_retomado','exercicio_substituido','exercicio_adicionado',
                                          'observacao')),

  occurred_at           timestamptz not null default now(),

  session_exercise_id   uuid references public.training_session_exercises(id) on delete set null,
  session_set_id        uuid references public.training_session_sets(id) on delete set null,

  /* Texto curto em pt-BR já pronto para a interface — o payload guarda o detalhe estruturado. */
  description           text,
  payload               jsonb not null default '{}'::jsonb,

  created_at            timestamptz not null default now()
);

alter table public.training_session_events enable row level security;
alter table public.training_session_events force row level security;

drop policy if exists "own rows" on public.training_session_events;
create policy "own rows" on public.training_session_events
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists training_session_events_user_idx
  on public.training_session_events (user_id);
create index if not exists training_session_events_session_idx
  on public.training_session_events (session_id, occurred_at);

comment on table public.training_session_events is
  'Linha do tempo APPEND-ONLY da sessão. Sem updated_at de propósito: evento reescrito deixa de ser evento.';
