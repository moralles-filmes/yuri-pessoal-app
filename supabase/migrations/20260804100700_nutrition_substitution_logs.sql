-- Fase 16-C — Dieta e Alimentação · Histórico de substituições
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════╗
-- ║ REGRA 4: SUBSTITUIR EXIGE CONFIRMAÇÃO E GRAVA HISTÓRICO. Nada troca sozinho.         ║
-- ╚══════════════════════════════════════════════════════════════════════════════════════╝
--
-- Uma linha aqui é a prova de que a troca aconteceu: o que era, o que virou, quanto de cada
-- um, qual foi a diferença nutricional NAQUELE MOMENTO, em que dia e por quê.
--
-- ══ POR QUE OS RÓTULOS SÃO SNAPSHOT E AS FKs SÃO OPCIONAIS ══
-- `original_label` e `replacement_label` são `not null` e congelados; todas as FKs são
-- `on delete set null`. Excluir depois o alimento, a receita, o grupo ou a própria linha do
-- diário faz o link sumir — jamais o registro. É a mesma disciplina do snapshot do diário
-- (16-B): histórico não se corrige, e um histórico que depende de linha viva não é histórico.
--
-- `diff_snapshot` congela a comparação exibida na confirmação, com a QUALIDADE de cada
-- nutriente (exato/aproximado/parcial). Recalcular a diferença depois, a partir do catálogo
-- atual, mudaria o passado — exatamente o que o módulo proíbe.

create table if not exists public.nutrition_substitution_logs (
  id                            uuid primary key default gen_random_uuid(),
  user_id                       uuid not null references auth.users(id) on delete cascade,

  -- De onde veio a alternativa. Nulo quando a troca foi avulsa (sem grupo cadastrado).
  group_id                      uuid references public.nutrition_substitution_groups(id) on delete set null,
  option_id                     uuid references public.nutrition_substitution_options(id) on delete set null,

  substitution_level            text not null default 'alimento'
                                  check (substitution_level in ('alimento','refeicao')),

  -- Data pura: o dia em que a troca valeu. Nunca um timestamptz fatiado (isso daria o dia UTC).
  applied_on                    date not null,
  diary_meal_id                 uuid references public.nutrition_diary_meals(id) on delete set null,
  diary_entry_id                uuid references public.nutrition_diary_entries(id) on delete set null,

  /* ───────── ORIGINAL (congelado) ───────── */
  original_label                text not null check (length(btrim(original_label)) > 0),
  original_food_id              uuid references public.nutrition_foods(id) on delete set null,
  original_recipe_id            uuid references public.nutrition_recipes(id) on delete set null,
  original_meal_template_id     uuid references public.nutrition_meal_templates(id) on delete set null,
  original_quantity             numeric(12,4),
  original_measure_label        text,

  /* ───────── SUBSTITUTO (congelado) ───────── */
  replacement_label             text not null check (length(btrim(replacement_label)) > 0),
  replacement_food_id           uuid references public.nutrition_foods(id) on delete set null,
  replacement_recipe_id         uuid references public.nutrition_recipes(id) on delete set null,
  replacement_meal_template_id  uuid references public.nutrition_meal_templates(id) on delete set null,
  replacement_quantity          numeric(12,4),
  replacement_measure_label     text,

  -- { "proteina": { "original": 12.3, "replacement": 9.1, "diff": -3.2, "quality": "exato" }, … }
  diff_snapshot                 jsonb not null default '{}'::jsonb,

  -- Derivadas do jsonb na gravação, para listar e relatar rápido (16-E).
  -- NULO = não foi possível comparar aquele macro, jamais "diferença zero".
  delta_energy_kcal             numeric(12,4),
  delta_protein_g               numeric(12,4),
  delta_carb_g                  numeric(12,4),
  delta_fat_g                   numeric(12,4),
  delta_fiber_g                 numeric(12,4),

  reason                        text,

  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now(),

  constraint nutrition_substitution_logs_diff_is_object
    check (jsonb_typeof(diff_snapshot) = 'object')
);

alter table public.nutrition_substitution_logs enable row level security;
alter table public.nutrition_substitution_logs force row level security;

drop policy if exists "own rows" on public.nutrition_substitution_logs;
create policy "own rows" on public.nutrition_substitution_logs
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists nutrition_substitution_logs_user_idx
  on public.nutrition_substitution_logs (user_id);
create index if not exists nutrition_substitution_logs_date_idx
  on public.nutrition_substitution_logs (user_id, applied_on desc);
create index if not exists nutrition_substitution_logs_group_idx
  on public.nutrition_substitution_logs (group_id) where group_id is not null;
create index if not exists nutrition_substitution_logs_meal_idx
  on public.nutrition_substitution_logs (diary_meal_id) where diary_meal_id is not null;

drop trigger if exists set_nutrition_substitution_logs_updated_at on public.nutrition_substitution_logs;
create trigger set_nutrition_substitution_logs_updated_at
  before update on public.nutrition_substitution_logs
  for each row execute function public.set_updated_at();

comment on table public.nutrition_substitution_logs is
  'Histórico de trocas confirmadas. Rótulos e diferença são congelados; todas as FKs são set null para o registro sobreviver à exclusão da origem.';
comment on column public.nutrition_substitution_logs.diff_snapshot is
  'Comparação exibida na confirmação, congelada: código → {original, replacement, diff, quality}. Nunca recalculada depois.';
comment on column public.nutrition_substitution_logs.delta_energy_kcal is
  'Derivada do jsonb na gravação. NULO = não foi possível comparar, jamais "sem diferença".';
