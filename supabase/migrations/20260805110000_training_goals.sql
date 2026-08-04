-- Fase 17-E — Treinos · METAS do usuário
--
-- ═══════════════════════ O QUE ESTA TABELA NÃO É ═══════════════════════
--
-- Não é prescrição. O sistema NUNCA sugere uma meta, um alvo, uma carga máxima ou um "peso
-- ideal": nome, direção, valor de partida, alvo, unidade e prazo são todos digitados pelo
-- usuário. Objetivo e nível de programa (17-B) continuam sendo rótulos organizacionais.
--
-- ═══════════════════════ MEDIDA CORPORAL VEM DO MÓDULO CENTRAL ═══════════════════════
--
-- Uma meta corporal aponta para `body_measurement_types` (16-E) — NÃO existe, e não pode
-- existir, uma tabela de peso/medida dentro do prefixo `training_*`. Peso, %GC e
-- circunferências interessam a Treinos E a Dieta ao mesmo tempo; duas tabelas seriam dois
-- gráficos discordando sobre quanto o usuário pesa.
--
-- A FK é `on delete set null` de propósito. A exclusão de um tipo de medida é um fluxo da
-- 16-E, com escolha explícita do destino do histórico; um `restrict` aqui faria aquele fluxo
-- estourar com um erro que o módulo Dieta não sabe explicar. Com `set null`, a meta continua
-- existindo e a leitura a marca como **medida removida** — indisponível, nunca zero.
--
-- ═══════════════════════ STATUS: SÓ DECISÃO É GRAVADA ═══════════════════════
--
-- O CHECK abaixo NÃO tem `atingida`, `expirada` nem `em_atraso`. Esses três nascem de valor
-- atual × alvo × prazo na leitura (`deriveGoalStatus`, src/lib/training/goals.ts), com o
-- `hoje` injetado pelo servidor — mesma disciplina de `atrasada` no TO-DO (F15), do status da
-- fatura (F03) e de `atrasado` no planejamento de treino (17-B). Gravar um estado derivado
-- criaria uma segunda verdade que envelhece sozinha à meia-noite.
--
-- ═══════════════════════ AS METAS INTERMEDIÁRIAS SÃO CONFIGURAÇÃO ═══════════════════════
--
-- `milestones` é jsonb (array de {value, label, due_on}) porque um marco não tem história
-- própria: ele é parte da definição da meta. O que TEM história — alterações de alvo, de
-- prazo e de status, e cada leitura de progresso — vive em `training_goal_progress`.

create table if not exists public.training_goals (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references auth.users(id) on delete cascade,

  name                     text not null,
  description              text,

  /* Cinco famílias de meta. `metric` diz exatamente O QUE é medido dentro da família — e é a
     matriz de `goals.ts` que amarra as duas, do mesmo jeito que `tracking.ts` amarra o que um
     exercício mede. */
  goal_kind                text not null check (goal_kind in (
                             'frequencia',
                             'desempenho',
                             'corporal',
                             'organizacao',
                             'personalizada'
                           )),

  metric                   text not null check (metric in (
                             -- frequência
                             'treinos_por_semana',
                             'treinos_por_mes',
                             'treinos_por_ano',
                             'dias_ativos',
                             'semanas_consecutivas',
                             -- desempenho
                             'peso_exercicio',
                             'reps_exercicio',
                             'um_rm_estimado',
                             'volume_total',
                             'series_por_semana',
                             'tempo_total',
                             -- corporal (lida de body_*)
                             'medida_corporal',
                             -- organização
                             'sessoes_concluidas',
                             'aderencia_planejamento',
                             'series_grupo_muscular',
                             -- livre
                             'personalizada'
                           )),

  /* Alvos opcionais da meta. Todos `set null`: excluir o exercício, o grupo, o programa ou o
     tipo de medida não pode apagar a meta nem o histórico dela. */
  exercise_id              uuid references public.training_exercises(id) on delete set null,
  muscle_group_id          uuid references public.training_muscle_groups(id) on delete set null,
  program_id               uuid references public.training_programs(id) on delete set null,
  body_measurement_type_id uuid references public.body_measurement_types(id) on delete set null,

  /* A direção é ESCOLHA do usuário. O sistema não decide que emagrecer é bom nem que
     engordar é ruim — ele só compara o número com o alvo no sentido que foi pedido. */
  direction                text not null default 'aumentar'
                             check (direction in ('aumentar','reduzir','manter')),

  period                   text not null check (period in (
                             'semanal','mensal','trimestral','semestral','anual','personalizado'
                           )),

  -- Datas PURAS. O dia de uma meta não tem fuso.
  starts_on                date not null,
  ends_on                  date,

  /* NULO = "use o primeiro valor observado a partir de starts_on". Um 0 aqui inventaria um
     ponto de partida e todo percentual de progresso sairia errado — a mesma distinção de
     `body_measurement_goals.start_value` (16-E) e de `quantity` nula na despensa (16-D). */
  start_value              numeric(12,3),
  target_value             numeric(12,3) not null,
  unit                     text not null,

  /* Marcos intermediários: [{"value": 90, "label": "meio do caminho", "due_on": "2026-09-30"}] */
  milestones               jsonb not null default '[]'::jsonb,

  /* Status GRAVADO — só o que o usuário decide. Ver o bloco no topo. */
  status                   text not null default 'planejada'
                             check (status in ('planejada','ativa','pausada','concluida','cancelada')),

  notes                    text,
  position                 integer not null default 0,

  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  -- Período personalizado precisa de fim; os demais derivam do calendário.
  constraint training_goals_custom_period_needs_end
    check (period <> 'personalizado' or ends_on is not null),
  constraint training_goals_period_order
    check (ends_on is null or ends_on >= starts_on),
  -- Meta corporal SEM tipo de medida não teria de onde ler o número.
  constraint training_goals_body_needs_type
    check (goal_kind <> 'corporal' or metric = 'medida_corporal'),
  constraint training_goals_milestones_is_array
    check (jsonb_typeof(milestones) = 'array')
);

alter table public.training_goals enable row level security;
alter table public.training_goals force row level security;

drop policy if exists "own rows" on public.training_goals;
create policy "own rows" on public.training_goals
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists training_goals_user_idx
  on public.training_goals (user_id);
create index if not exists training_goals_user_status_idx
  on public.training_goals (user_id, status);
create index if not exists training_goals_user_period_idx
  on public.training_goals (user_id, starts_on desc);
create index if not exists training_goals_exercise_idx
  on public.training_goals (exercise_id) where exercise_id is not null;
create index if not exists training_goals_body_type_idx
  on public.training_goals (body_measurement_type_id) where body_measurement_type_id is not null;

drop trigger if exists set_training_goals_updated_at on public.training_goals;
create trigger set_training_goals_updated_at
  before update on public.training_goals
  for each row execute function public.set_updated_at();

comment on table public.training_goals is
  'Metas de treino (17-E). Definidas 100% pelo usuário — o sistema nunca sugere alvo, prazo ou carga.';
comment on column public.training_goals.status is
  'Status GRAVADO. atingida/expirada/em_atraso são DERIVADOS na leitura (goals.ts), nunca persistidos.';
comment on column public.training_goals.body_measurement_type_id is
  'Aponta para o MÓDULO CENTRAL body_* (16-E). Não existe tabela de medida corporal em training_*.';
comment on column public.training_goals.start_value is
  'NULO = use o primeiro valor observado a partir de starts_on. Nunca zero.';
comment on column public.training_goals.milestones is
  'Marcos intermediários (configuração). O histórico de alterações vive em training_goal_progress.';
