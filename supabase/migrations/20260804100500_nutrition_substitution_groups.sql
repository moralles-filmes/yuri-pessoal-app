-- Fase 16-C — Dieta e Alimentação · Grupos de substituição
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════╗
-- ║ REGRA 5 DA SUBFASE: NENHUMA EQUIVALÊNCIA CLÍNICA É AFIRMADA.                         ║
-- ╚══════════════════════════════════════════════════════════════════════════════════════╝
--
-- Um grupo é uma LISTA DE ALTERNATIVAS QUE O PRÓPRIO USUÁRIO CADASTROU, com as tolerâncias
-- que ELE escolheu. O sistema compara números e mostra a diferença; não diz que duas coisas
-- "se equivalem nutricionalmente", não recomenda troca, não gera sugestão por heurística nova
-- e nunca troca nada sozinho — a substituição só acontece depois de o usuário ver a
-- comparação e confirmar (regra 4 e o `nutrition_substitution_logs`).
--
-- ══ DOIS NÍVEIS ══
-- 'alimento'  → o original é um alimento (ou um rótulo livre): "arroz branco".
-- 'refeicao'  → o original é uma refeição-modelo ou uma receita: "meu almoço padrão".
-- O CHECK amarra os dois níveis para um grupo de alimento não apontar para uma refeição.
--
-- ══ TOLERÂNCIA É PREFERÊNCIA, NÃO NORMA ══
-- As colunas `tolerance_*_percent` guardam o quanto o usuário aceita variar em cada macro.
-- NULO significa "não defini tolerância para este macro" — e não "tolerância zero". A tela
-- mostra a diferença sempre; a tolerância só colore o resultado.

create table if not exists public.nutrition_substitution_groups (
  id                        uuid primary key default gen_random_uuid(),
  user_id                   uuid not null references auth.users(id) on delete cascade,

  name                      text not null check (length(btrim(name)) > 0),
  group_kind                text not null default 'alimento'
                              check (group_kind in ('alimento','refeicao')),
  description               text,

  /* ───────── O item ORIGINAL ───────── */
  food_id                   uuid references public.nutrition_foods(id) on delete set null,
  recipe_id                 uuid references public.nutrition_recipes(id) on delete set null,
  meal_template_id          uuid references public.nutrition_meal_templates(id) on delete set null,
  custom_label              text,

  -- Quantidade de referência do original (é sobre ela que a comparação é feita).
  base_quantity             numeric(12,4) check (base_quantity is null or base_quantity > 0),
  base_measure_id           uuid references public.nutrition_food_measures(id) on delete set null,
  base_measure_label        text,
  base_portion_unit         text check (base_portion_unit is null or base_portion_unit in ('porcao','peso')),

  /* ───────── Tolerâncias por macro (percentuais). NULO = não definida. ───────── */
  tolerance_energy_percent  numeric(6,2) check (tolerance_energy_percent  is null or tolerance_energy_percent  >= 0),
  tolerance_protein_percent numeric(6,2) check (tolerance_protein_percent is null or tolerance_protein_percent >= 0),
  tolerance_carb_percent    numeric(6,2) check (tolerance_carb_percent    is null or tolerance_carb_percent    >= 0),
  tolerance_fat_percent     numeric(6,2) check (tolerance_fat_percent     is null or tolerance_fat_percent     >= 0),
  tolerance_fiber_percent   numeric(6,2) check (tolerance_fiber_percent   is null or tolerance_fiber_percent   >= 0),

  -- Restrições declaradas pelo usuário ("sem lactose", "sem glúten"). Texto livre: o sistema
  -- não classifica alimento como seguro ou proibido para ninguém.
  restrictions              text[] not null default '{}'::text[],
  notes                     text,

  is_active                 boolean not null default true,
  position                  integer not null default 0,

  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),

  -- O grupo precisa dizer o que está sendo substituído.
  constraint nutrition_substitution_groups_has_subject
    check (food_id is not null or recipe_id is not null or meal_template_id is not null
        or (custom_label is not null and length(btrim(custom_label)) > 0)),
  -- Coerência entre o nível e o tipo do original.
  constraint nutrition_substitution_groups_kind_matches
    check ((group_kind = 'alimento' and meal_template_id is null)
        or (group_kind = 'refeicao' and food_id is null))
);

alter table public.nutrition_substitution_groups enable row level security;
alter table public.nutrition_substitution_groups force row level security;

drop policy if exists "own rows" on public.nutrition_substitution_groups;
create policy "own rows" on public.nutrition_substitution_groups
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists nutrition_substitution_groups_user_idx
  on public.nutrition_substitution_groups (user_id, position);
create index if not exists nutrition_substitution_groups_food_idx
  on public.nutrition_substitution_groups (food_id) where food_id is not null;
create index if not exists nutrition_substitution_groups_recipe_idx
  on public.nutrition_substitution_groups (recipe_id) where recipe_id is not null;
create index if not exists nutrition_substitution_groups_template_idx
  on public.nutrition_substitution_groups (meal_template_id) where meal_template_id is not null;

drop trigger if exists set_nutrition_substitution_groups_updated_at on public.nutrition_substitution_groups;
create trigger set_nutrition_substitution_groups_updated_at
  before update on public.nutrition_substitution_groups
  for each row execute function public.set_updated_at();

comment on table public.nutrition_substitution_groups is
  'Alternativas cadastradas PELO USUÁRIO para um alimento ou uma refeição. O sistema compara números; não afirma equivalência nutricional nem troca nada sozinho.';
comment on column public.nutrition_substitution_groups.tolerance_energy_percent is
  'Variação aceita pelo usuário, em %. NULO = tolerância não definida (≠ tolerância zero).';
