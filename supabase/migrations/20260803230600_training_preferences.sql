-- Fase 17-A — Treinos · Preferências do módulo (uma linha por usuário)
--
-- Tabela própria em vez de novas colunas em `settings`: aqui há ~15 chaves específicas de
-- treino, com defaults que só fazem sentido neste domínio. `settings` continua sendo a store
-- geral do sistema (tema, formato de data, etc.).
--
-- ALGUMAS COLUNAS SÓ PASSAM A TER EFEITO EM SUBFASES SEGUINTES (avanço automático, som e
-- vibração do cronômetro, manter tela ativa → 17-C; regra de volume unilateral, aquecimento
-- no volume, fórmula de 1RM, progressão → 17-D). Elas nascem aqui porque são preferências do
-- módulo, e a tela de Configurações marca explicitamente a partir de quando valem — em vez
-- de oferecer um interruptor que finge funcionar.

create table if not exists public.training_preferences (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references auth.users(id) on delete cascade,

  -- Vale desde a 17-A
  weight_unit             text not null default 'kg' check (weight_unit in ('kg','lb')),
  difficulty_scale        text not null default 'simples' check (difficulty_scale in ('simples','rir','rpe')),
  default_rest_seconds    integer not null default 90 check (default_rest_seconds >= 0 and default_rest_seconds <= 3600),
  default_increment_kg    numeric(6,3) not null default 2.5 check (default_increment_kg > 0),
  week_starts_on          smallint not null default 1 check (week_starts_on between 0 and 6),
  weekly_workout_goal     smallint check (weekly_workout_goal is null or (weekly_workout_goal >= 0 and weekly_workout_goal <= 14)),

  -- Passa a valer na 17-C (sessão ao vivo)
  auto_advance            text not null default 'avisar' check (auto_advance in ('automatico','avisar','nunca')),
  rest_sound_enabled      boolean not null default true,
  rest_vibration_enabled  boolean not null default true,
  keep_screen_awake       boolean not null default true,

  -- Passa a valer na 17-D (volume, 1RM e progressão)
  unilateral_volume_rule  text not null default 'soma_dos_lados'
                            check (unilateral_volume_rule in ('por_lado','soma_dos_lados','serie_completa')),
  count_warmup_in_volume  boolean not null default false,
  one_rm_formula          text not null default 'epley' check (one_rm_formula in ('epley','brzycki','lombardi','lander')),
  progression_enabled     boolean not null default true,

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

alter table public.training_preferences enable row level security;
alter table public.training_preferences force row level security;

drop policy if exists "own rows" on public.training_preferences;
create policy "own rows" on public.training_preferences
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create unique index if not exists training_preferences_user_idx
  on public.training_preferences (user_id);

drop trigger if exists set_training_preferences_updated_at on public.training_preferences;
create trigger set_training_preferences_updated_at
  before update on public.training_preferences
  for each row execute function public.set_updated_at();

comment on table public.training_preferences is
  'Preferências do módulo Treinos. Uma linha por usuário, criada sob demanda na primeira leitura.';
comment on column public.training_preferences.unilateral_volume_rule is
  'Como contar volume de exercício unilateral. A regra vigente é sempre exibida junto do número (17-D).';
