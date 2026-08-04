-- Fase 17-D — Treinos · Recordes pessoais CONSOLIDADOS
--
-- ═══════════════════════ O QUE ESTA TABELA É (e o que ela NÃO é) ═══════════════════════
--
-- `training_session_sets.is_personal_record` (17-C) é apenas um MARCADOR gravado no calor da
-- sessão: "esta série pareceu um recorde". Ele não sabe do resto do histórico, não desempata,
-- não desduplica e não guarda a marca anterior.
--
-- Esta tabela é a CONSOLIDAÇÃO: uma linha por (usuário, escopo, tipo de recorde), sempre com o
-- MELHOR valor e com a marca anterior preservada em `previous_value`. É derivada do histórico
-- e pode ser reconstruída do zero a qualquer momento (`rebuildRecords`, records.ts) — por isso
-- excluir uma sessão recalcula os recordes afetados em vez de deixar um número órfão.
--
-- ═══════════════════════ POR QUE NÃO É "MÉTRICA MATERIALIZADA" ═══════════════════════
--
-- Volume, tonelagem e 1RM continuam DERIVADOS na leitura (`metrics.ts`) — materializá-los
-- criaria uma segunda verdade que dessincroniza, como a view `nutrition_foods_view` evita na
-- Dieta. O recorde é diferente: ele guarda um FATO datado ("em 12/03 você levantou 100 kg") e
-- a marca que ele superou. Sem a linha, "o recorde anterior" se perderia a cada recálculo.
--
-- ═══════════════════════ IDENTIDADE ESTÁVEL ═══════════════════════
--
-- `exercise_id` é `on delete set null` — referência informativa, como em toda a 17-C. Quem
-- identifica o recorde é `record_key`, montado por `recordKey()` (records.ts) a partir do id do
-- exercício ou, na falta dele, do NOME congelado. Um exercício excluído do catálogo continua
-- com o recorde legível, com o nome que tinha.
--
-- `record_key` é único por usuário e NÃO é índice parcial nem de expressão: dá para usar
-- `ON CONFLICT` aqui sem a armadilha 42P10 do módulo Dieta. Ainda assim a consolidação usa
-- select-then-insert/update, porque precisa comparar com o valor anterior antes de decidir.

create table if not exists public.training_personal_records (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,

  -- Referência INFORMATIVA. A identidade estável é `record_key` + o nome congelado.
  exercise_id           uuid references public.training_exercises(id) on delete set null,
  exercise_name_snapshot text,

  /* 'exercicio' → recorde de um movimento; 'geral' → recorde do usuário (sequência de semanas,
     sessões no mês). O escopo geral não tem exercício, e o CHECK garante a coerência. */
  scope                 text not null default 'exercicio' check (scope in ('exercicio','geral')),

  record_type           text not null check (record_type in (
                          'maior_peso',
                          'maior_reps_no_peso',
                          'melhor_volume_serie',
                          'melhor_volume_sessao',
                          'melhor_1rm_estimado',
                          'maior_duracao',
                          'maior_distancia',
                          'maior_sequencia_semanas',
                          'mais_sessoes_mes'
                        )),

  /* Chave determinística de consolidação: escopo + tipo + referência (ex.: o peso de
     "maior nº de repetições com 80 kg"). Montada em src/lib/training/records.ts. */
  record_key            text not null,

  value                 numeric(12,3) not null,
  unit                  text not null check (unit in ('kg','reps','segundos','metros','sessoes','semanas')),

  /* Contexto do recorde — o que dá sentido ao número. `reference_weight_kg` é a dimensão extra
     de "maior nº de repetições COM ESTE PESO"; sem ela, dois recordes diferentes colidiriam. */
  reference_weight_kg   numeric(8,3),
  reps                  integer check (reps is null or reps >= 0),
  weight_kg             numeric(8,3),
  one_rm_formula        text check (one_rm_formula is null or one_rm_formula in ('epley','brzycki','lombardi','lander')),

  -- Data PURA do dia em que o recorde aconteceu (sessão que vira a meia-noite fica no dia em que começou).
  achieved_on           date not null,

  -- De onde veio. `set null` para o recorde sobreviver a uma exclusão de sessão até o recálculo.
  session_id            uuid references public.training_sessions(id) on delete set null,
  session_set_id        uuid references public.training_session_sets(id) on delete set null,

  -- A MARCA ANTERIOR não é apagada: é o que permite dizer "superou os 95 kg de 02/02".
  previous_value        numeric(12,3),
  previous_achieved_on  date,

  notes                 text,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint training_personal_records_scope_exercise
    check ((scope = 'exercicio' and exercise_name_snapshot is not null)
        or (scope = 'geral'     and exercise_id is null)),
  constraint training_personal_records_progress
    check (previous_value is null or value >= previous_value)
);

alter table public.training_personal_records enable row level security;
alter table public.training_personal_records force row level security;

drop policy if exists "own rows" on public.training_personal_records;
create policy "own rows" on public.training_personal_records
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists training_personal_records_user_idx
  on public.training_personal_records (user_id);
create index if not exists training_personal_records_user_exercise_type_idx
  on public.training_personal_records (user_id, exercise_id, record_type);
create index if not exists training_personal_records_user_date_idx
  on public.training_personal_records (user_id, achieved_on desc);
create index if not exists training_personal_records_session_idx
  on public.training_personal_records (session_id) where session_id is not null;

-- UMA linha por chave de recorde. Sem duplicidade e sem notificação repetida (17-F).
create unique index if not exists training_personal_records_key_idx
  on public.training_personal_records (user_id, record_key);

drop trigger if exists set_training_personal_records_updated_at on public.training_personal_records;
create trigger set_training_personal_records_updated_at
  before update on public.training_personal_records
  for each row execute function public.set_updated_at();

comment on table public.training_personal_records is
  'Recordes CONSOLIDADOS (17-D). Derivados do histórico e reconstruíveis; is_personal_record da série é só um marcador.';
comment on column public.training_personal_records.record_key is
  'Chave determinística de consolidação (records.ts). Empate NÃO gera recorde novo.';
comment on column public.training_personal_records.previous_value is
  'A marca superada. O histórico do recorde não é apagado quando ele é batido.';
comment on column public.training_personal_records.exercise_id is
  'Referência INFORMATIVA (set null). A identidade estável é record_key + exercise_name_snapshot.';
