-- Fase 16-A — Dieta e Alimentação · Alimentos (tabela central do catálogo)
--
-- REGRAS DE MODELAGEM (ver docs/phases/PHASE_16_A_NUTRITION_FOUNDATION_FOODS.md):
--
--  • PROPRIEDADE: `user_id` nulo = alimento da BASE DO SISTEMA, somente leitura. As policies
--    são separadas por comando: SELECT alcança o global, escrita não. Duplicar um alimento
--    global cria uma cópia pessoal com `origin_food_id` apontando para a origem.
--
--  • "Arroz cru" e "arroz cozido" NÃO são o mesmo registro. `preparation_state` faz parte da
--    identidade do alimento e a interface sempre mostra o estado junto do nome.
--
--  • BASE DE CÁLCULO EXPLÍCITA: `base_quantity` + `base_unit` dizem a que quantidade os
--    nutrientes se referem (100 g ou 100 ml). Nada é assumido: o cálculo lê daqui.
--
--  • RASTREABILIDADE: `source_id`, `source_food_code`, `source_version`, `data_quality` e
--    `last_verified_at` permitem responder "de onde veio esse número?" para qualquer valor.
--
--  • O índice único parcial (source_id, source_food_code) para linhas globais é o que torna o
--    seed da base REEXECUTÁVEL: reimportar a TACO atualiza em vez de duplicar.

create table if not exists public.nutrition_foods (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid references auth.users(id) on delete cascade,

  name                   text not null,
  alternative_name       text,
  brand                  text,
  barcode                text,

  category_id            uuid references public.nutrition_food_categories(id) on delete set null,
  food_type              text not null default 'alimento'
                           check (food_type in ('alimento','industrializado','suplemento','bebida','ingrediente','preparacao')),
  preparation_state      text not null default 'nao_informado'
                           check (preparation_state in ('nao_informado','cru','cozido','assado','grelhado','frito','refogado','drenado','pronto','congelado','desidratado','enlatado','defumado')),

  -- Quantidade e unidade a que os nutrientes se referem. Default 100 g (padrão das tabelas).
  base_quantity          numeric(10,3) not null default 100 check (base_quantity > 0),
  base_unit              text not null default 'g' check (base_unit in ('g','ml')),
  -- Percentual de parte comestível quando a fonte publica. NULO quando não publica —
  -- não presumimos 100%.
  edible_portion_percent numeric(6,3) check (edible_portion_percent is null or (edible_portion_percent > 0 and edible_portion_percent <= 100)),

  source_id              uuid references public.nutrition_food_sources(id) on delete set null,
  source_food_code       text,
  source_version         text,
  -- Natureza predominante do dado. Cada nutriente ainda carrega o seu próprio método.
  data_quality           text not null default 'desconhecido'
                           check (data_quality in ('analitico','calculado','estimado','rotulo','desconhecido')),
  is_system_food         boolean not null default false,
  is_verified            boolean not null default false,
  last_verified_at       date,

  -- Cópia pessoal criada a partir de outro alimento (normalmente um global).
  origin_food_id         uuid references public.nutrition_foods(id) on delete set null,

  notes                  text,
  archived_at            timestamptz,

  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  -- Alimento global é sempre da base do sistema, e vice-versa: evita linha global editável.
  constraint nutrition_foods_global_is_system
    check ((user_id is null) = is_system_food),
  constraint nutrition_foods_origin_not_self
    check (origin_food_id is null or origin_food_id <> id)
);

alter table public.nutrition_foods enable row level security;
alter table public.nutrition_foods force row level security;

drop policy if exists "select own or global" on public.nutrition_foods;
create policy "select own or global" on public.nutrition_foods
  for select using (user_id = auth.uid() or user_id is null);

drop policy if exists "insert own" on public.nutrition_foods;
create policy "insert own" on public.nutrition_foods
  for insert with check (user_id = auth.uid());

drop policy if exists "update own" on public.nutrition_foods;
create policy "update own" on public.nutrition_foods
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "delete own" on public.nutrition_foods;
create policy "delete own" on public.nutrition_foods
  for delete using (user_id = auth.uid());

-- Idempotência do seed da base oficial.
create unique index if not exists nutrition_foods_global_source_code_idx
  on public.nutrition_foods (source_id, source_food_code)
  where user_id is null and source_food_code is not null;

create index if not exists nutrition_foods_user_idx
  on public.nutrition_foods (user_id);
create index if not exists nutrition_foods_user_name_idx
  on public.nutrition_foods (user_id, name);
create index if not exists nutrition_foods_category_idx
  on public.nutrition_foods (category_id);
create index if not exists nutrition_foods_barcode_idx
  on public.nutrition_foods (barcode) where barcode is not null;
create index if not exists nutrition_foods_brand_idx
  on public.nutrition_foods (brand) where brand is not null;
create index if not exists nutrition_foods_source_idx
  on public.nutrition_foods (source_id, source_food_code);
create index if not exists nutrition_foods_type_idx
  on public.nutrition_foods (food_type);
create index if not exists nutrition_foods_archived_idx
  on public.nutrition_foods (archived_at) where archived_at is not null;
create index if not exists nutrition_foods_origin_idx
  on public.nutrition_foods (origin_food_id) where origin_food_id is not null;

-- Busca por nome sem depender de acento/caixa: unaccent + lower já são usados no projeto.
create index if not exists nutrition_foods_name_search_idx
  on public.nutrition_foods using gin (to_tsvector('portuguese', coalesce(name,'') || ' ' || coalesce(alternative_name,'') || ' ' || coalesce(brand,'')));

drop trigger if exists set_nutrition_foods_updated_at on public.nutrition_foods;
create trigger set_nutrition_foods_updated_at
  before update on public.nutrition_foods
  for each row execute function public.set_updated_at();

comment on table public.nutrition_foods is
  'Alimentos. user_id nulo = base do sistema (somente leitura, is_system_food = true).';
comment on column public.nutrition_foods.base_quantity is
  'Quantidade a que os nutrientes se referem (com base_unit). O cálculo lê daqui; nada é assumido.';
comment on column public.nutrition_foods.edible_portion_percent is
  'Parte comestível. NULO quando a fonte não publica — não presumir 100%.';
