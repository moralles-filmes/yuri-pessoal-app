-- Fase 17-A — Treinos · Exercícios (tabela central do catálogo)
--
-- REGRAS DE MODELAGEM (ver docs/phases/PHASE_17_A_TRAINING_FOUNDATION_EXERCISES.md):
--
--  • PROPRIEDADE: `user_id` nulo = exercício da BASE DO SISTEMA, somente leitura. Policies
--    separadas por comando (SELECT alcança o global; escrita não). Duplicar cria cópia
--    pessoal com `origin_exercise_id`. Favoritar/arquivar/apelidar um exercício global grava
--    em `training_exercise_prefs` — nunca no exercício.
--
--  • `tracking_type` É O CONTRATO DE MEDIÇÃO, e é por isso que é NOT NULL. Ele diz o que
--    aquele exercício mede: peso × repetições, só repetições, segundos, distância, calorias
--    do painel do aparelho... Sem ele, a Subfase 17-D não teria como somar volume sem
--    misturar quilos com segundos. Repare que `peso_corporal_assistido` existe justamente
--    porque assistência SUBTRAI carga — tratá-la como peso adicional inverteria o sinal.
--
--  • `is_system_exercise` ⇔ `source = 'sistema'` ⇔ `user_id is null`. As três constraints
--    juntas impedem que um exercício digitado à mão se apresente como parte da base.
--
--  • `system_code` é o que torna o SEED REEXECUTÁVEL: reimportar a base atualiza em vez de
--    duplicar. Só existe em linha global.

create table if not exists public.training_exercises (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid references auth.users(id) on delete cascade,

  name                    text not null,
  alternative_name        text,
  description             text,

  primary_muscle_group_id uuid not null references public.training_muscle_groups(id) on delete restrict,
  equipment_id            uuid references public.training_equipment(id) on delete set null,

  movement_pattern        text not null default 'outros'
                            check (movement_pattern in (
                              'empurrar_horizontal','empurrar_vertical','puxar_horizontal','puxar_vertical',
                              'agachamento','dobradica_quadril','extensao_joelho','flexao_joelho',
                              'abducao','aducao','flexao_cotovelo','extensao_cotovelo',
                              'elevacao','rotacao','anti_rotacao','estabilizacao','locomocao','outros')),

  exercise_type           text not null default 'forca'
                            check (exercise_type in ('forca','cardio','mobilidade','alongamento','pliometrico','isometrico','outro')),

  tracking_type           text not null default 'peso_reps'
                            check (tracking_type in (
                              'peso_reps','peso_corporal_reps','peso_corporal_adicional','peso_corporal_assistido',
                              'duracao','distancia_duracao','calorias','reps_sem_carga','isometria',
                              'lado_a_lado','personalizado')),

  laterality              text not null default 'bilateral'
                            check (laterality in ('bilateral','unilateral_alternado','unilateral_simultaneo')),

  instructions            text,
  tips                    text,
  common_mistakes         text,
  notes                   text,

  -- Mídia: apenas asset próprio ou link externo informado pelo usuário. A base do sistema
  -- não traz imagem nem vídeo — nenhum asset de terceiro entra neste projeto.
  image_url               text,
  video_url               text,

  default_rest_seconds    integer check (default_rest_seconds is null or (default_rest_seconds >= 0 and default_rest_seconds <= 3600)),
  default_increment_kg    numeric(6,3) check (default_increment_kg is null or default_increment_kg > 0),

  is_system_exercise      boolean not null default false,
  is_verified             boolean not null default false,
  system_code             text,
  source                  text not null default 'usuario'
                            check (source in ('sistema','usuario','duplicado','importado')),
  origin_exercise_id      uuid references public.training_exercises(id) on delete set null,

  archived_at             timestamptz,

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  constraint training_exercises_global_is_system
    check ((user_id is null) = is_system_exercise),
  constraint training_exercises_system_source
    check (is_system_exercise = (source = 'sistema')),
  constraint training_exercises_system_code_only_global
    check (system_code is null or user_id is null),
  constraint training_exercises_origin_not_self
    check (origin_exercise_id is null or origin_exercise_id <> id)
);

alter table public.training_exercises enable row level security;
alter table public.training_exercises force row level security;

drop policy if exists "select own or global" on public.training_exercises;
create policy "select own or global" on public.training_exercises
  for select using (user_id = auth.uid() or user_id is null);

drop policy if exists "insert own" on public.training_exercises;
create policy "insert own" on public.training_exercises
  for insert with check (user_id = auth.uid());

drop policy if exists "update own" on public.training_exercises;
create policy "update own" on public.training_exercises
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "delete own" on public.training_exercises;
create policy "delete own" on public.training_exercises
  for delete using (user_id = auth.uid());

-- Idempotência do seed da base.
create unique index if not exists training_exercises_system_code_idx
  on public.training_exercises (system_code) where user_id is null and system_code is not null;

create index if not exists training_exercises_user_idx
  on public.training_exercises (user_id);
create index if not exists training_exercises_user_name_idx
  on public.training_exercises (user_id, name);
create index if not exists training_exercises_primary_muscle_idx
  on public.training_exercises (primary_muscle_group_id);
create index if not exists training_exercises_equipment_idx
  on public.training_exercises (equipment_id);
create index if not exists training_exercises_movement_idx
  on public.training_exercises (movement_pattern);
create index if not exists training_exercises_tracking_idx
  on public.training_exercises (tracking_type);
create index if not exists training_exercises_archived_idx
  on public.training_exercises (archived_at) where archived_at is not null;
create index if not exists training_exercises_origin_idx
  on public.training_exercises (origin_exercise_id) where origin_exercise_id is not null;

-- Busca por nome sem depender de acento/caixa (mesmo padrão de nutrition_foods).
create index if not exists training_exercises_name_search_idx
  on public.training_exercises using gin (
    to_tsvector('portuguese', coalesce(name,'') || ' ' || coalesce(alternative_name,''))
  );

drop trigger if exists set_training_exercises_updated_at on public.training_exercises;
create trigger set_training_exercises_updated_at
  before update on public.training_exercises
  for each row execute function public.set_updated_at();

comment on table public.training_exercises is
  'Exercícios. user_id nulo = base do sistema (somente leitura, is_system_exercise = true, source = sistema).';
comment on column public.training_exercises.tracking_type is
  'Contrato de medição do exercício. Única fonte de "quais campos esse exercício usa" — ver src/lib/training/tracking.ts.';
comment on column public.training_exercises.system_code is
  'Código estável da base do sistema. Torna o seed reexecutável (atualiza em vez de duplicar). Só existe em linha global.';
