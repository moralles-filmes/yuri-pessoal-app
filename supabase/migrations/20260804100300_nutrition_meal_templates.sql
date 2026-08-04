-- Fase 16-C — Dieta e Alimentação · Refeições-modelo
--
-- Um conjunto reutilizável de itens ("meu café da manhã de sempre") que pode ser jogado no
-- diário ou no planejamento com um clique. Reúne ALIMENTOS e RECEITAS — por isso os itens
-- vivem em tabela própria, com discriminador estável.
--
-- MODELO É MUTÁVEL, EXECUÇÃO É IMUTÁVEL — a mesma regra dos treinos-modelo (Fase 17) e do
-- planejamento (16-B). Adicionar o modelo ao diário NÃO cria vínculo vivo: o consumo grava
-- snapshot próprio, e editar o modelo amanhã não reescreve o que foi comido ontem. A coluna
-- `meal_template_id` do diário é apenas PROCEDÊNCIA ("isto veio do modelo X"), com
-- `on delete set null`.
--
-- Não há refeição-modelo global: nenhum cardápio é sugerido pelo sistema. O módulo não
-- prescreve (regra 12).

create table if not exists public.nutrition_meal_templates (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,

  name               text not null check (length(btrim(name)) > 0),
  description        text,

  -- Tipo de refeição sugerido (café, almoço…). `set null`: excluir o tipo não apaga o modelo.
  meal_type_id       uuid references public.nutrition_meal_types(id) on delete set null,
  category_id        uuid references public.nutrition_recipe_categories(id) on delete set null,
  -- Horário sugerido. Data pura + hora separada é o padrão do módulo (regra 12 da subfase).
  suggested_time     time,

  tags               text[] not null default '{}'::text[],
  notes              text,

  is_favorite        boolean not null default false,
  archived_at        timestamptz,

  origin_template_id uuid references public.nutrition_meal_templates(id) on delete set null,
  is_copy            boolean not null default false,

  use_count          integer not null default 0,
  last_used_at       timestamptz,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint nutrition_meal_templates_origin_not_self
    check (origin_template_id is null or origin_template_id <> id)
);

alter table public.nutrition_meal_templates enable row level security;
alter table public.nutrition_meal_templates force row level security;

drop policy if exists "own rows" on public.nutrition_meal_templates;
create policy "own rows" on public.nutrition_meal_templates
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists nutrition_meal_templates_user_idx
  on public.nutrition_meal_templates (user_id);
create index if not exists nutrition_meal_templates_user_name_idx
  on public.nutrition_meal_templates (user_id, name);
create index if not exists nutrition_meal_templates_meal_type_idx
  on public.nutrition_meal_templates (meal_type_id) where meal_type_id is not null;
create index if not exists nutrition_meal_templates_category_idx
  on public.nutrition_meal_templates (category_id) where category_id is not null;
create index if not exists nutrition_meal_templates_archived_idx
  on public.nutrition_meal_templates (archived_at) where archived_at is not null;
create index if not exists nutrition_meal_templates_origin_idx
  on public.nutrition_meal_templates (origin_template_id) where origin_template_id is not null;

drop trigger if exists set_nutrition_meal_templates_updated_at on public.nutrition_meal_templates;
create trigger set_nutrition_meal_templates_updated_at
  before update on public.nutrition_meal_templates
  for each row execute function public.set_updated_at();

comment on table public.nutrition_meal_templates is
  'Refeições-modelo reutilizáveis (alimentos + receitas). Modelo mutável; o consumo grava snapshot próprio e não muda quando o modelo muda.';
