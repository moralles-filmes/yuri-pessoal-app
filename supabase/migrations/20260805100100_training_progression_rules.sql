-- Fase 17-D — Treinos · Regras de progressão do usuário
--
-- ═══════════════════════ ISTO NÃO É PRESCRIÇÃO ═══════════════════════
--
-- A regra é escrita PELO USUÁRIO e diz quando ELE quer ser lembrado de subir a carga. O sistema
-- não recomenda treino, não diagnostica e não sugere carga máxima: ele confere a condição que a
-- pessoa mesma definiu, mostra o motivo por extenso e espera a decisão dela.
--
-- Três travas que moram no domínio, não na tela:
--
--  1. **A avaliação é sobre as ÚLTIMAS N SESSÕES**, nunca sobre uma série isolada
--     (`min_sessions >= 2` por default). Uma série boa num dia bom não é tendência.
--  2. **Dor registrada bloqueia a sugestão** (`training_sessions.felt_pain`). Não há
--     interruptor para desligar esse bloqueio — é regra do módulo, não preferência.
--  3. **Desligar a progressão desliga o recurso por completo**
--     (`training_preferences.progression_enabled`, 17-A).
--
-- ═══════════════════════ ESCOPO ═══════════════════════
--
-- Uma regra vale para um exercício, para um grupo muscular ou para tudo. A resolução vai do
-- mais específico para o mais geral (progression.ts) — o mesmo desenho do escopo de metas da
-- Dieta (16-B) e da resolução de descanso/incremento da 17-A.
--
-- `exercise_id`/`muscle_group_id` são `on delete cascade`: uma regra que existe SÓ para um
-- exercício apagado não tem o que avaliar. Não há perda de histórico — as sugestões já geradas
-- ficam (a FK delas é `set null`).

create table if not exists public.training_progression_rules (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references auth.users(id) on delete cascade,

  name                    text not null check (char_length(trim(name)) between 1 and 120),

  scope                   text not null default 'global' check (scope in ('global','grupo','exercicio')),
  exercise_id             uuid references public.training_exercises(id) on delete cascade,
  muscle_group_id         uuid references public.training_muscle_groups(id) on delete cascade,

  -- ═══════════ Condição ═══════════
  /* Quantas sessões seguidas precisam satisfazer a condição. Mínimo 2 de propósito: com 1, a
     regra viraria "uma série boa = suba a carga", que é exatamente o que a fase proíbe. */
  min_sessions            smallint not null default 2 check (min_sessions between 2 and 10),
  /* Atingir o TOPO da faixa de repetições (o `targetRepsMax` planejado). */
  require_top_of_range    boolean not null default true,
  /* Em TODAS as séries de trabalho, não só na melhor. */
  require_all_working_sets boolean not null default true,
  /* Sem série marcada como falha. */
  require_no_failure      boolean not null default true,
  /* Tetos de dificuldade. `null` = não avalia esse eixo. */
  max_rir                 smallint check (max_rir is null or max_rir between 0 and 10),
  max_rpe                 numeric(3,1) check (max_rpe is null or (max_rpe >= 1 and max_rpe <= 10)),
  max_difficulty          text check (max_difficulty is null or max_difficulty in
                            ('facil','adequada','dificil','muito_dificil','falha')),

  -- ═══════════ Incremento sugerido ═══════════
  /* `incremento_minimo` usa o menor salto REALIZÁVEL do exercício (preferência > exercício >
     equipamento > padrão do módulo — `resolveIncrementKg`, 17-A). Sugerir +1 kg numa máquina de
     placas de 5 em 5 seria sugerir o impossível. */
  increment_mode          text not null default 'incremento_minimo'
                            check (increment_mode in ('incremento_minimo','fixo','percentual')),
  increment_kg            numeric(6,3) check (increment_kg is null or increment_kg > 0),
  increment_percent       numeric(5,2) check (increment_percent is null or (increment_percent > 0 and increment_percent <= 25)),

  is_active               boolean not null default true,
  position                smallint not null default 0,
  notes                   text,

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  constraint training_progression_rules_scope_target
    check ((scope = 'global'    and exercise_id is null and muscle_group_id is null)
        or (scope = 'grupo'     and muscle_group_id is not null and exercise_id is null)
        or (scope = 'exercicio' and exercise_id is not null and muscle_group_id is null)),
  constraint training_progression_rules_increment_value
    check ((increment_mode = 'incremento_minimo')
        or (increment_mode = 'fixo'       and increment_kg is not null)
        or (increment_mode = 'percentual' and increment_percent is not null))
);

alter table public.training_progression_rules enable row level security;
alter table public.training_progression_rules force row level security;

drop policy if exists "own rows" on public.training_progression_rules;
create policy "own rows" on public.training_progression_rules
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists training_progression_rules_user_idx
  on public.training_progression_rules (user_id);
create index if not exists training_progression_rules_user_active_idx
  on public.training_progression_rules (user_id, is_active);
create index if not exists training_progression_rules_exercise_idx
  on public.training_progression_rules (exercise_id) where exercise_id is not null;

-- No máximo UMA regra por exercício e UMA por grupo: duas regras concorrentes no mesmo alvo
-- gerariam duas sugestões contraditórias para a mesma carga.
create unique index if not exists training_progression_rules_exercise_unique_idx
  on public.training_progression_rules (user_id, exercise_id) where exercise_id is not null;
create unique index if not exists training_progression_rules_group_unique_idx
  on public.training_progression_rules (user_id, muscle_group_id) where muscle_group_id is not null;
create unique index if not exists training_progression_rules_global_unique_idx
  on public.training_progression_rules (user_id) where scope = 'global';

drop trigger if exists set_training_progression_rules_updated_at on public.training_progression_rules;
create trigger set_training_progression_rules_updated_at
  before update on public.training_progression_rules
  for each row execute function public.set_updated_at();

comment on table public.training_progression_rules is
  'Regra de progressão ESCRITA PELO USUÁRIO (17-D). Avaliada sobre as últimas N sessões; dor registrada bloqueia sempre.';
comment on column public.training_progression_rules.min_sessions is
  'Mínimo 2: uma série isolada nunca gera sugestão.';
comment on column public.training_progression_rules.increment_mode is
  'incremento_minimo usa o menor salto realizável do exercício (resolveIncrementKg).';
