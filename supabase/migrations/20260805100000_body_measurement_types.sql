-- Fase 16-E — MÓDULO CENTRAL DE MEDIDAS CORPORAIS · Tipos de medida
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════╗
-- ║ ⛔ ESTE PREFIXO NÃO É DE DIETA NEM DE TREINOS. É CENTRAL, E COMPARTILHADO PELOS DOIS.  ║
-- ╚══════════════════════════════════════════════════════════════════════════════════════╝
--
-- Peso, percentual de gordura, massa muscular e circunferências interessam à Fase 16 (Dieta)
-- e à Fase 17 (Treinos) ao mesmo tempo. Duas tabelas para o mesmo dado significam dois
-- gráficos que discordam sobre quanto o usuário pesa — por isso a estrutura nasce como
-- `body_*`, com código em `src/lib/body/`, e NUNCA como `nutrition_*` ou `training_*`.
--
-- Levantamento em 2026-08-04 (MCP list_tables): a estrutura não existia. A Subfase 16-E
-- CRIA; a 17-E CONSOME (decisão registrada em PHASE_17_E_TRAINING_GOALS_DASHBOARDS.md).
-- `nutrition_profiles.weight_kg` (16-A) continua sendo outra coisa: é o peso do PERFIL,
-- insumo do estimador de gasto energético, não histórico de medida.
--
-- ══ POR QUE OS TIPOS SÃO DO USUÁRIO, E NÃO BASE GLOBAL DO SISTEMA ══
-- O usuário renomeia ("Abdômen" → "Barriga"), reordena, desativa o que não mede e cria os
-- dele. Isso é dado, não vocabulário — então `user_id` é NOT NULL e a RLS é a simples do
-- projeto, sem policies separadas por comando. Mesmo padrão de `nutrition_meal_types` (16-B)
-- e `nutrition_market_categories` (16-D): a semente roda na primeira leitura, não aqui.
--
-- ⚠️ `slug` é NOT NULL de propósito: com ele o unique (user_id, slug) é um índice TOTAL, e o
-- seed pode usar `upsert`/`ON CONFLICT` sem cair no 42P10 dos índices PARCIAIS que a 16-B e a
-- 16-D documentaram. O slug de tipo criado pelo usuário é derivado do nome no servidor.
--
-- Idempotente. RLS + FORCE RLS, índice em user_id e trigger de updated_at.

create table if not exists public.body_measurement_types (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  -- Identificador estável do tipo dentro do usuário. Os 16 padrão têm slug conhecido, o que
  -- permite a Dieta e os Treinos falarem do "peso" sem depender do nome exibido.
  slug        text not null,
  name        text not null,
  -- Unidade de MEDIÇÃO ('kg', 'cm', '%', 'mm'). A medida congela a sua própria cópia: trocar
  -- a unidade do tipo depois não pode reescrever o histórico.
  unit        text not null,
  category    text not null default 'circunferencia'
                check (category in ('peso', 'composicao', 'circunferencia', 'outro')),
  -- Lateralidade, quando faz sentido (braço direito × esquerdo). Nula = não se aplica.
  side        text check (side in ('esquerdo', 'direito')),
  -- Casas decimais NA APRESENTAÇÃO. O cálculo não arredonda (mesma regra do calc.ts).
  decimals    smallint not null default 1 check (decimals between 0 and 3),
  position    integer not null default 0,
  is_active   boolean not null default true,
  -- Veio da semente dos 16 tipos padrão? Só informativo — o usuário edita todos igualmente.
  is_default  boolean not null default false,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.body_measurement_types is
  'Tipos de medida corporal do usuario. MODULO CENTRAL (body_*), compartilhado por Dieta (16-E) e Treinos (17-E). Nunca duas tabelas de peso corporal.';
comment on column public.body_measurement_types.unit is
  'Unidade do tipo. A medida guarda a propria copia: trocar aqui nao reescreve o historico.';

alter table public.body_measurement_types enable row level security;
alter table public.body_measurement_types force row level security;

drop policy if exists "own rows" on public.body_measurement_types;
create policy "own rows" on public.body_measurement_types
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists body_measurement_types_user_idx
  on public.body_measurement_types (user_id);
create index if not exists body_measurement_types_user_position_idx
  on public.body_measurement_types (user_id, position);

-- Índice TOTAL (sem predicado): o seed pode usar ON CONFLICT com segurança.
create unique index if not exists body_measurement_types_user_slug_uidx
  on public.body_measurement_types (user_id, slug);

drop trigger if exists set_body_measurement_types_updated_at on public.body_measurement_types;
create trigger set_body_measurement_types_updated_at
  before update on public.body_measurement_types
  for each row execute function public.set_updated_at();
