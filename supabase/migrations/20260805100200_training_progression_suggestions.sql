-- Fase 17-D — Treinos · Sugestões de progressão geradas
--
-- ═══════════════════════ NADA É APLICADO SOZINHO ═══════════════════════
--
-- Uma sugestão nasce `pendente` e só sai daí por decisão explícita:
--   • aceitar  → grava o novo valor no TREINO-MODELO (17-B) preservando o anterior AQUI;
--   • ignorar  → fica marcada como ignorada e **não reaparece igual**;
--   • expirar  → o contexto mudou (a carga já subiu por outro caminho).
--
-- A sugestão carrega o MOTIVO por extenso, em pt-BR, e o `basis` congelado com as sessões que
-- a justificaram. Sem isso, "sugerimos 65 kg" seria um número caído do céu — e o módulo inteiro
-- se apoia em explicar de onde vem cada número.
--
-- ═══════════════════════ POR QUE `basis` É CONGELADO ═══════════════════════
--
-- Mesmo princípio do `nutrients_snapshot` (16-B) e do `workout_snapshot` (17-C): a justificativa
-- descreve o que era verdade quando a sugestão foi feita. Recalcular na leitura faria o texto
-- mudar sozinho quando o usuário editasse uma série antiga.
--
-- ⚠️ O índice de deduplicação é PARCIAL (`where status in ('pendente','ignorada')`). O Postgres
-- não infere índice parcial num `ON CONFLICT` sem repetir o predicado, e o PostgREST não permite
-- repetir — o upsert falharia só em runtime (42P10). Toda gravação aqui é
-- select-then-insert/update, como nos pontos idempotentes da Dieta.

create table if not exists public.training_progression_suggestions (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references auth.users(id) on delete cascade,

  -- Referências INFORMATIVAS: a sugestão sobrevive à exclusão da regra e do modelo.
  rule_id                 uuid references public.training_progression_rules(id) on delete set null,
  exercise_id             uuid references public.training_exercises(id) on delete set null,
  exercise_name_snapshot  text not null,
  workout_id              uuid references public.training_workouts(id) on delete set null,
  workout_exercise_id     uuid references public.training_workout_exercises(id) on delete set null,
  workout_name_snapshot   text,

  kind                    text not null default 'carga'
                            check (kind in ('carga','repeticoes','duracao','distancia')),

  previous_value          numeric(10,3),
  suggested_value         numeric(10,3) not null,
  unit                    text not null check (unit in ('kg','reps','segundos','metros')),

  /* O motivo LEGÍVEL, gerado por progression.ts. Ex.: "Nas 2 últimas sessões você fez 12/12/12
     com RIR 2 e sem dor registrada." A tela mostra este texto, não uma fórmula. */
  reason                  text not null,
  /* As sessões e séries consideradas, congeladas. Explica o número mesmo depois de tudo mudar. */
  basis                   jsonb not null default '{}'::jsonb,

  status                  text not null default 'pendente'
                            check (status in ('pendente','aceita','ignorada','expirada')),

  /* Determinística: exercício + tipo + valor anterior + valor sugerido. Enquanto a sugestão
     estiver pendente ou ignorada, a mesma proposta não é recriada. */
  dedupe_key              text not null,

  suggested_on            date not null,
  decided_at              timestamptz,
  decision_notes          text,

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  constraint training_progression_suggestions_decided
    check (status = 'pendente' or decided_at is not null)
);

alter table public.training_progression_suggestions enable row level security;
alter table public.training_progression_suggestions force row level security;

drop policy if exists "own rows" on public.training_progression_suggestions;
create policy "own rows" on public.training_progression_suggestions
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists training_progression_suggestions_user_idx
  on public.training_progression_suggestions (user_id);
create index if not exists training_progression_suggestions_user_status_idx
  on public.training_progression_suggestions (user_id, status);
create index if not exists training_progression_suggestions_exercise_idx
  on public.training_progression_suggestions (exercise_id) where exercise_id is not null;

-- "Sugestão ignorada não reaparece igual": a chave só é única enquanto a proposta está viva.
-- Aceita a mesma proposta pode voltar no futuro (a carga desceu e subiu de novo, por exemplo).
create unique index if not exists training_progression_suggestions_dedupe_idx
  on public.training_progression_suggestions (user_id, dedupe_key)
  where status in ('pendente','ignorada');

drop trigger if exists set_training_progression_suggestions_updated_at on public.training_progression_suggestions;
create trigger set_training_progression_suggestions_updated_at
  before update on public.training_progression_suggestions
  for each row execute function public.set_updated_at();

comment on table public.training_progression_suggestions is
  'Sugestões de progressão (17-D). Nascem pendentes, carregam o motivo por extenso e nunca são aplicadas sozinhas.';
comment on column public.training_progression_suggestions.basis is
  'Sessões/séries que justificaram a sugestão, CONGELADAS. Recalcular na leitura mudaria a justificativa sozinha.';
comment on column public.training_progression_suggestions.dedupe_key is
  'Índice único PARCIAL (pendente/ignorada). ON CONFLICT não infere índice parcial: use select-then-insert.';
