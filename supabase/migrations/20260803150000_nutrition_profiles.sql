-- Fase 16-B — Dieta e Alimentação · Perfil nutricional do usuário
--
-- SEM PRESCRIÇÃO (regra 8 da subfase, e a mais importante desta tabela em particular).
-- Tudo aqui é INFORMADO PELO USUÁRIO e serve para dois fins apenas:
--   1. contextualizar as telas (mostrar peso ao lado da meta de proteína, por exemplo);
--   2. alimentar um ESTIMADOR OPCIONAL de gasto energético que:
--      • mostra a fórmula usada (Mifflin-St Jeor + fator de atividade),
--      • se identifica como estimativa em todo lugar que aparece,
--      • exige confirmação explícita — jamais grava meta sozinho.
--
-- O sistema NÃO diagnostica, NÃO prescreve dieta clínica e NÃO define meta médica
-- automaticamente. Nenhuma coluna aqui é obrigatória, e nenhuma tela trava por falta delas.
--
-- UMA LINHA POR USUÁRIO (mesmo padrão de `settings`, Fase 14) — daí o unique em user_id.
-- Peso e altura ficam aqui como REFERÊNCIA declarada; o histórico de medidas corporais é
-- outro assunto e chega na Subfase 16-E, em tabela própria.

create table if not exists public.nutrition_profiles (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,

  birth_date        date,
  -- 'nao_informado' é o default de propósito: o campo existe para a fórmula do estimador,
  -- e ficar sem resposta é uma resposta legítima.
  sex               text not null default 'nao_informado'
                      check (sex in ('feminino','masculino','nao_informado')),
  height_cm         numeric(6,2) check (height_cm is null or (height_cm > 0 and height_cm <= 300)),
  weight_kg         numeric(7,3) check (weight_kg is null or (weight_kg > 0 and weight_kg <= 500)),

  activity_level    text not null default 'nao_informado'
                      check (activity_level in ('nao_informado','sedentario','leve','moderado','intenso','muito_intenso')),
  -- Direção declarada pelo usuário. Não muda cálculo nenhum sozinha: só rotula a tela.
  goal_direction    text not null default 'nao_informado'
                      check (goal_direction in ('nao_informado','perder','manter','ganhar')),

  -- Restrições/preferências alimentares em texto livre ("sem lactose", "vegetariano").
  -- Texto livre porque uma lista fechada erraria com qualquer usuário real.
  restrictions      text[] not null default '{}',
  notes             text,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table public.nutrition_profiles enable row level security;
alter table public.nutrition_profiles force row level security;

drop policy if exists "own rows" on public.nutrition_profiles;
create policy "own rows" on public.nutrition_profiles
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create unique index if not exists nutrition_profiles_user_idx
  on public.nutrition_profiles (user_id);

drop trigger if exists set_nutrition_profiles_updated_at on public.nutrition_profiles;
create trigger set_nutrition_profiles_updated_at
  before update on public.nutrition_profiles
  for each row execute function public.set_updated_at();

comment on table public.nutrition_profiles is
  'Perfil nutricional INFORMADO pelo usuário. Uma linha por usuário. Não prescreve nada: alimenta um estimador opcional que exige confirmação explícita.';
comment on column public.nutrition_profiles.weight_kg is
  'Peso de referência declarado. O HISTÓRICO de medidas corporais é da Subfase 16-E, em tabela própria.';
