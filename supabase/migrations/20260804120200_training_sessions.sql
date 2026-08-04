-- Fase 17-C — Treinos · A SESSÃO (execução)
--
-- ═══════════════════════ A REGRA INEGOCIÁVEL DESTA SUBFASE ═══════════════════════
--
-- Ao INICIAR, a sessão CONGELA o treino-modelo em `workout_snapshot` (jsonb) + nas linhas de
-- `training_session_exercises` / `training_session_sets`. **Nenhuma leitura de sessão passada
-- volta ao modelo.** Renomear um exercício, mudar a carga planejada, arquivar o treino ou
-- excluí-lo NÃO altera nada do que já aconteceu.
--
-- `workout_id`, `program_id` e `scheduled_workout_id` são `on delete set null` e existem como
-- REFERÊNCIA INFORMATIVA ("veio deste modelo"), jamais como fonte de leitura. É o mesmo desenho
-- de `nutrition_diary_entries.food_id` (16-B): a referência pode virar nula; o snapshot não.
--
-- ═══════════════════════ ESTADO ═══════════════════════
--
--   rascunho → pronta → ativa ⇄ descansando ⇄ pausada → concluida
--                                                     ↘ abandonada / cancelada
--
-- Aqui o status é FATO (é o que a máquina de estados decidiu), diferente de "atrasado" no
-- planejamento, que é derivado. As transições válidas moram em
-- `src/lib/training/session-machine.ts` — o banco garante o vocabulário, a função pura garante
-- o caminho.
--
-- ═══════════════════════ NUNCA DUAS SESSÕES ATIVAS ═══════════════════════
--
-- Índice único parcial em (user_id) onde o status é de execução. Duas abas abertas, dois
-- aparelhos ou um clique duplo em "Iniciar" convergem para uma sessão só; a action confere
-- antes e devolve mensagem em pt-BR oferecendo continuar, finalizar ou descartar a anterior.
--
-- ═══════════════════════ TEMPO ═══════════════════════
--
-- Os cronômetros da tela ao vivo NÃO são lidos daqui: nascem de `started_at` + das linhas de
-- `training_session_pauses` / `training_session_rests`, em `src/lib/training/timers.ts`, com
-- `agora` injetado. As colunas `*_seconds` são o resultado congelado NA FINALIZAÇÃO — fato
-- histórico para a 17-D, não estado vivo.
--
-- `session_date` é DATA PURA: uma sessão que começa 23h30 e termina 00h40 continua sendo o
-- treino do dia em que começou. `.slice(0,10)` de um timestamptz devolveria o dia em UTC e
-- moveria todo treino noturno para o dia seguinte.

create table if not exists public.training_sessions (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references auth.users(id) on delete cascade,

  -- Referências INFORMATIVAS. Nunca fonte de leitura para renderizar a sessão.
  workout_id              uuid references public.training_workouts(id) on delete set null,
  program_id              uuid references public.training_programs(id) on delete set null,
  scheduled_workout_id    uuid references public.training_scheduled_workouts(id) on delete set null,
  location_id             uuid references public.training_locations(id) on delete set null,

  status                  text not null default 'rascunho'
                            check (status in ('rascunho','pronta','ativa','descansando','pausada',
                                              'concluida','abandonada','cancelada')),

  origin_kind             text not null default 'avulso'
                            check (origin_kind in ('planejado','modelo','recente','favorito','vazio',
                                                   'repetir','duplicar','avulso')),

  -- Data pura do treino (Brasília, injetada pelo servidor via hojeISO()).
  session_date            date not null,

  started_at              timestamptz,
  ended_at                timestamptz,

  -- ═══════════ O SNAPSHOT ═══════════
  workout_name_snapshot   text not null,
  workout_short_name_snapshot text,
  workout_version         smallint,
  program_name_snapshot   text,
  /* Cópia completa do modelo no formato de `session-snapshot.ts`: exercícios, ordem,
     séries (saídas de expandPlannedSets), cargas, descansos, tracking_type e nomes.
     As linhas filhas são a forma consultável do mesmo congelamento. */
  workout_snapshot        jsonb not null default '{}'::jsonb,

  -- ═══════════ Configuração escolhida na preparação ═══════════
  default_rest_seconds    integer not null default 90
                            check (default_rest_seconds >= 0 and default_rest_seconds <= 3600),
  auto_advance            text not null default 'avisar'
                            check (auto_advance in ('automatico','avisar','nunca')),
  sound_enabled           boolean not null default true,
  vibration_enabled       boolean not null default true,
  keep_screen_awake       boolean not null default true,
  weight_unit             text not null default 'kg' check (weight_unit in ('kg','lb')),

  -- ═══════════ Antes do treino (tudo informado, nada inferido) ═══════════
  /* Peso corporal do dia. Sem ele, a carga efetiva de exercício de peso corporal fica
     INDISPONÍVEL — nunca zero (`effectiveLoadKg`, tracking.ts). Quando a 17-E criar o módulo
     central `body_*`, a preparação passa a pré-preencher daqui; o valor USADO continua
     congelado na sessão. Não é uma segunda tabela de peso corporal. */
  body_weight_kg          numeric(6,3) check (body_weight_kg is null or (body_weight_kg > 0 and body_weight_kg <= 500)),
  energy_level            smallint check (energy_level is null or energy_level between 1 and 5),
  mood_level              smallint check (mood_level is null or mood_level between 1 and 5),
  sleep_quality           smallint check (sleep_quality is null or sleep_quality between 1 and 5),
  soreness_level          smallint check (soreness_level is null or soreness_level between 1 and 5),
  pre_notes               text,

  -- ═══════════ Depois do treino ═══════════
  rating                  smallint check (rating is null or rating between 1 and 5),
  perceived_effort        smallint check (perceived_effort is null or perceived_effort between 1 and 10),
  notes                   text,
  /* Dor registrada NÃO gera diagnóstico. A interface mostra aviso neutro, preserva o registro
     e não sugere aumento de carga. Nenhuma leitura deste campo produz recomendação clínica. */
  felt_pain               boolean not null default false,
  pain_notes              text,

  -- ═══════════ Tempos CONGELADOS na finalização (fato histórico para a 17-D) ═══════════
  total_seconds           integer check (total_seconds is null or total_seconds >= 0),
  active_seconds          integer check (active_seconds is null or active_seconds >= 0),
  rest_total_seconds      integer check (rest_total_seconds is null or rest_total_seconds >= 0),
  pause_total_seconds     integer check (pause_total_seconds is null or pause_total_seconds >= 0),

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  -- Uma sessão em execução ou concluída obrigatoriamente começou.
  constraint training_sessions_started_when_running
    check (status in ('rascunho','pronta','cancelada') or started_at is not null),
  -- Encerrada tem fim; em andamento não tem.
  constraint training_sessions_ended_when_closed
    check (status not in ('concluida','abandonada') or ended_at is not null),
  constraint training_sessions_end_after_start
    check (ended_at is null or started_at is null or ended_at >= started_at)
);

alter table public.training_sessions enable row level security;
alter table public.training_sessions force row level security;

drop policy if exists "own rows" on public.training_sessions;
create policy "own rows" on public.training_sessions
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists training_sessions_user_idx
  on public.training_sessions (user_id);
create index if not exists training_sessions_user_started_idx
  on public.training_sessions (user_id, started_at desc);
create index if not exists training_sessions_user_date_idx
  on public.training_sessions (user_id, session_date desc);
create index if not exists training_sessions_user_status_idx
  on public.training_sessions (user_id, status);
create index if not exists training_sessions_workout_idx
  on public.training_sessions (workout_id) where workout_id is not null;
create index if not exists training_sessions_scheduled_idx
  on public.training_sessions (scheduled_workout_id) where scheduled_workout_id is not null;

-- NUNCA DUAS SESSÕES EM EXECUÇÃO. Rascunho e "pronta" ficam de fora de propósito: preparar um
-- treino não pode ser bloqueado por outro rascunho esquecido.
create unique index if not exists training_sessions_one_active_idx
  on public.training_sessions (user_id)
  where status in ('ativa','descansando','pausada');

drop trigger if exists set_training_sessions_updated_at on public.training_sessions;
create trigger set_training_sessions_updated_at
  before update on public.training_sessions
  for each row execute function public.set_updated_at();

comment on table public.training_sessions is
  'A EXECUÇÃO de um treino. Congela o modelo em workout_snapshot ao iniciar; nenhuma leitura de sessão passada volta ao modelo.';
comment on column public.training_sessions.workout_snapshot is
  'Cópia congelada do treino-modelo no ato do início (session-snapshot.ts). Editar o modelo depois NÃO muda a sessão.';
comment on column public.training_sessions.workout_id is
  'Referência INFORMATIVA (set null). Jamais fonte de leitura para renderizar a sessão.';
comment on column public.training_sessions.session_date is
  'Data PURA do treino. Sessão que atravessa a meia-noite continua no dia em que começou.';
comment on column public.training_sessions.body_weight_kg is
  'Peso corporal informado para ESTA sessão. Sem ele a carga efetiva de peso corporal é INDISPONÍVEL, nunca zero.';
comment on column public.training_sessions.total_seconds is
  'Congelado na finalização por src/lib/training/timers.ts. A tela ao vivo deriva de timestamps, nunca lê daqui.';
