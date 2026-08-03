-- Fase 16-B — Dieta e Alimentação · Metas por período (histórico datado)
--
-- A REGRA QUE ESTA TABELA EXISTE PARA GARANTIR: alterar a meta hoje NÃO pode mudar o
-- relatório do mês passado. A meta de um dia é a que estava vigente NAQUELE DIA.
--
-- Por isso a meta não é uma coluna em `settings` nem uma linha única sobrescrita: é um
-- período com `starts_on`/`ends_on`. Mudar de objetivo (cutting → manutenção) fecha o
-- período anterior e abre outro; o passado continua respondendo pelos números que valiam.
--
-- `ends_on` NULO = período em aberto ("vale de starts_on em diante"). É o caso normal do
-- período atual.
--
-- SOBREPOSIÇÃO: não é proibida no banco (uma exclusion constraint exigiria btree_gist e
-- tornaria a edição pelo app hostil). A resolução é DETERMINÍSTICA e testada na função pura
-- `goalPeriodForDate` (src/lib/nutrition/goals.ts): vence o período que contém a data com o
-- `starts_on` mais recente; empate desempata pelo `created_at` mais recente. A tela avisa
-- quando detecta sobreposição, em vez de escolher em silêncio.
--
-- SEM PRESCRIÇÃO: nenhum período é criado automaticamente pelo sistema. Todo valor aqui foi
-- digitado ou confirmado pelo usuário.

create table if not exists public.nutrition_goal_periods (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,

  name        text,
  -- Por que esta meta existe ("preparação para prova", "recomendação da nutricionista").
  -- Texto livre: o sistema registra o motivo, não o interpreta.
  reason      text,

  starts_on   date not null,
  ends_on     date,

  -- Como a meta varia dentro do período:
  --   fixa            → um conjunto de valores para todos os dias
  --   por_dia_semana  → valores diferentes por dia da semana
  --   treino_descanso → valores diferentes para dia de treino e de descanso
  --   periodo         → valores do período inteiro (ex.: média semanal), sem variação diária
  goal_type   text not null default 'fixa'
                check (goal_type in ('fixa','por_dia_semana','treino_descanso','periodo')),

  notes       text,
  is_active   boolean not null default true,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint nutrition_goal_periods_range
    check (ends_on is null or ends_on >= starts_on)
);

alter table public.nutrition_goal_periods enable row level security;
alter table public.nutrition_goal_periods force row level security;

drop policy if exists "own rows" on public.nutrition_goal_periods;
create policy "own rows" on public.nutrition_goal_periods
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists nutrition_goal_periods_user_idx
  on public.nutrition_goal_periods (user_id);
create index if not exists nutrition_goal_periods_user_range_idx
  on public.nutrition_goal_periods (user_id, starts_on desc, ends_on);

drop trigger if exists set_nutrition_goal_periods_updated_at on public.nutrition_goal_periods;
create trigger set_nutrition_goal_periods_updated_at
  before update on public.nutrition_goal_periods
  for each row execute function public.set_updated_at();

comment on table public.nutrition_goal_periods is
  'Meta vigente por período. Alterar a meta de hoje não altera período anterior — o passado responde pela meta que valia nele.';
comment on column public.nutrition_goal_periods.ends_on is
  'NULO = período em aberto (vale de starts_on em diante). Data pura: não representa instante.';
