-- Fase 17-E — Treinos · Histórico de uma meta
--
-- ═══════════════════════ A REGRA QUE ESTA TABELA EXISTE PARA GARANTIR ═══════════════════════
--
-- **ALTERAR UMA META NÃO REESCREVE O PASSADO.** Subir o alvo de 100 kg para 110 kg hoje não
-- pode apagar que em março a marca era 100 kg e que ela foi atingida. Toda alteração vira uma
-- LINHA aqui, com valor anterior, valor novo, data e origem — é a mesma disciplina do
-- `nutrition_goal_periods` (16-B, "a meta de um dia é a que valia nele") e do
-- `previous_value` do recorde (17-D).
--
-- ═══════════════════════ QUATRO COISAS DIFERENTES, UM SÓ HISTÓRICO ═══════════════════════
--
--   registro         → uma leitura do valor atual (automática, do metrics.ts/body, ou manual)
--   alteracao_meta   → o usuário mudou alvo, prazo, direção, partida…
--   mudanca_status   → pausou, retomou, concluiu, cancelou
--   marco_atingido   → um marco intermediário foi alcançado
--
-- `entry_kind` é o discriminador ESTÁVEL da linha — não a presença de `value` ou de `field`,
-- que podem ser nulos legitimamente (mesma escolha de `entry_kind` no diário, 16-B).
--
-- ═══════════════════════ NADA AQUI É REESCRITO PELO APP ═══════════════════════
--
-- A tabela é usada como log: o código só insere. `updated_at` existe para seguir o padrão de
-- schema do projeto (toda tabela nova tem o gatilho), não porque alguma action atualize linha.
-- Excluir a meta leva o histórico dela junto (`on delete cascade`) — é histórico DA meta, não
-- do treino; o treino continua inteiro no histórico de sessões.

create table if not exists public.training_goal_progress (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  goal_id        uuid not null references public.training_goals(id) on delete cascade,

  entry_kind     text not null check (entry_kind in (
                   'registro',
                   'alteracao_meta',
                   'mudanca_status',
                   'marco_atingido'
                 )),

  -- Data PURA do fato. Sessão que vira a meia-noite já foi resolvida lá atrás (17-C).
  recorded_on    date not null,

  /* Valor observado da meta no momento (só em `registro` e `marco_atingido`). NULO significa
     "não havia valor" — o usuário não tinha medição, não que o valor era zero. */
  value          numeric(12,3),

  /* O par anterior → novo de uma alteração. Em `mudanca_status` os dois carregam o status em
     texto; em `alteracao_meta`, o valor do campo indicado em `field`. */
  field          text,
  previous_text  text,
  new_text       text,
  previous_value numeric(12,3),
  new_value      numeric(12,3),

  source         text not null default 'automatico'
                   check (source in ('automatico','manual','sistema')),
  note           text,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  -- Uma alteração sem dizer QUAL campo mudou é um registro que ninguém consegue auditar.
  constraint training_goal_progress_change_needs_field
    check (entry_kind <> 'alteracao_meta' or field is not null)
);

alter table public.training_goal_progress enable row level security;
alter table public.training_goal_progress force row level security;

drop policy if exists "own rows" on public.training_goal_progress;
create policy "own rows" on public.training_goal_progress
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists training_goal_progress_user_idx
  on public.training_goal_progress (user_id);
create index if not exists training_goal_progress_goal_idx
  on public.training_goal_progress (goal_id, recorded_on desc);
create index if not exists training_goal_progress_user_date_idx
  on public.training_goal_progress (user_id, recorded_on desc);

drop trigger if exists set_training_goal_progress_updated_at on public.training_goal_progress;
create trigger set_training_goal_progress_updated_at
  before update on public.training_goal_progress
  for each row execute function public.set_updated_at();

comment on table public.training_goal_progress is
  'Histórico de uma meta (17-E): leituras de progresso e TODA alteração de alvo/prazo/status. Alterar a meta não reescreve o passado.';
comment on column public.training_goal_progress.entry_kind is
  'Discriminador ESTÁVEL da linha — não deduza o tipo pela presença de value/field.';
comment on column public.training_goal_progress.value is
  'NULO = não havia valor observado. Não é zero.';
