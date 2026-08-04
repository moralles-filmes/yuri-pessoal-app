-- Fase 17-B — Treinos · Planejamento (qual treino em qual dia)
--
-- DATA PURA. `scheduled_date` é `date` e `planned_time` é `time`: um dia planejado não é um
-- instante, e converter para timestamptz faria "quinta-feira" virar quarta às 21h em UTC.
-- A aritmética de recorrência roda em `Date.UTC` nas funções puras de
-- `src/lib/training/schedule.ts` — nunca `Date.now()`.
--
-- STATUS GRAVA APENAS FATO: 'planejado', 'concluido', 'nao_realizado' (decisão explícita do
-- usuário, com justificativa), 'reagendado' e 'cancelado'.
--
--   • "ATRASADO" NÃO EXISTE AQUI. Deriva de `scheduled_date` + agora, na leitura — exatamente
--     como `atrasada` no TO-DO e como o status da fatura de cartão.
--   • "EM ANDAMENTO" também não: virá da sessão ativa na 17-C.
--
-- Persistir qualquer um dos dois criaria uma segunda verdade que envelhece sozinha.
--
-- O PLANEJAMENTO ORIGINAL É PRESERVADO. Reagendar grava `original_date` e o motivo — a linha
-- NÃO é reescrita como se sempre tivesse sido naquele dia. É o que permite o usuário olhar
-- para trás e ver que aquele treino foi movido, e por quê.
--
-- NENHUM VÍNCULO VIVO COM SESSÃO. Não há coluna apontando para sessão aqui: a 17-C acrescenta
-- a referência do lado dela, com snapshot próprio. Modelo é mutável; execução é imutável.
--
-- `workout_id` é `on delete set null` (e NÃO cascade): excluir um treino-modelo não pode
-- apagar dias planejados em silêncio. A action pergunta o destino, e uma linha órfã continua
-- legível como "treino removido" em vez de desaparecer.

create table if not exists public.training_scheduled_workouts (
  id                        uuid primary key default gen_random_uuid(),
  user_id                   uuid not null references auth.users(id) on delete cascade,

  scheduled_date            date not null,
  planned_time              time,
  planned_duration_minutes  smallint check (planned_duration_minutes is null or (planned_duration_minutes >= 0 and planned_duration_minutes <= 600)),

  entry_kind                text not null default 'treino'
                              check (entry_kind in ('treino','descanso')),

  workout_id                uuid references public.training_workouts(id) on delete set null,
  program_id                uuid references public.training_programs(id) on delete set null,

  -- Rótulo livre: nome do dia de descanso ("Descanso ativo") ou de um treino já removido.
  title                     text,

  status                    text not null default 'planejado'
                              check (status in ('planejado','concluido','nao_realizado','reagendado','cancelado')),

  position                  smallint not null default 0,

  -- Preservação do planejamento original.
  original_date             date,
  reschedule_reason         text,
  skip_reason               text,

  notes                     text,

  source                    text not null default 'manual'
                              check (source in ('manual','recorrencia','duplicacao','programa')),

  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),

  -- Dia de descanso não aponta para treino nenhum.
  constraint training_scheduled_workouts_rest_has_no_workout
    check (entry_kind <> 'descanso' or workout_id is null)
);

alter table public.training_scheduled_workouts enable row level security;
alter table public.training_scheduled_workouts force row level security;

drop policy if exists "own rows" on public.training_scheduled_workouts;
create policy "own rows" on public.training_scheduled_workouts
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists training_scheduled_workouts_user_idx
  on public.training_scheduled_workouts (user_id);
create index if not exists training_scheduled_workouts_user_date_idx
  on public.training_scheduled_workouts (user_id, scheduled_date);
create index if not exists training_scheduled_workouts_workout_idx
  on public.training_scheduled_workouts (workout_id) where workout_id is not null;
create index if not exists training_scheduled_workouts_program_idx
  on public.training_scheduled_workouts (program_id) where program_id is not null;
create index if not exists training_scheduled_workouts_status_idx
  on public.training_scheduled_workouts (user_id, status);

-- No máximo UM marcador de descanso por dia. Repetir "descanso" no mesmo dia não significa
-- nada, e dois marcadores fariam a semana parecer mais vazia do que é.
create unique index if not exists training_scheduled_workouts_rest_day_idx
  on public.training_scheduled_workouts (user_id, scheduled_date)
  where entry_kind = 'descanso';

drop trigger if exists set_training_scheduled_workouts_updated_at on public.training_scheduled_workouts;
create trigger set_training_scheduled_workouts_updated_at
  before update on public.training_scheduled_workouts
  for each row execute function public.set_updated_at();

comment on table public.training_scheduled_workouts is
  'Planejamento com DATA PURA. status grava só fato; "atrasado" e "em andamento" são derivados na leitura, nunca gravados.';
comment on column public.training_scheduled_workouts.original_date is
  'Data em que o treino foi planejado ANTES do reagendamento. A linha não é reescrita como se sempre tivesse sido no novo dia.';
comment on column public.training_scheduled_workouts.workout_id is
  'set null (não cascade): excluir um treino-modelo não apaga dias planejados em silêncio — a action pergunta o destino.';
