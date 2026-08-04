-- Fase 16-D — Dieta e Alimentação · Itens da lista de compras
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════╗
-- ║ ⛔ O PONTO MAIS IMPORTANTE DA SUBFASE                                                 ║
-- ║ A CONSOLIDAÇÃO NÃO SOMA UNIDADES INCOMPATÍVEIS. 200 g de arroz + 1 xícara de arroz   ║
-- ║ só viram UMA linha quando existe conversão real cadastrada (a medida caseira daquele ║
-- ║ alimento, com gramas). Sem ela, viram DUAS linhas, com o motivo escrito em            ║
-- ║ `separate_reason`. Massa converte com massa, volume com volume; g ↔ ml exige          ║
-- ║ densidade, e densidade presumida é dado inventado.                                    ║
-- ╚══════════════════════════════════════════════════════════════════════════════════════╝
--
-- Quem decide o que soma com o que é `src/lib/nutrition/shopping.ts` (puro, testado), reusando
-- `toBaseUnitValue`/`convertToBase` de `units.ts`. O banco guarda o RESULTADO e o porquê.
--
-- ══ RASTREABILIDADE DA ORIGEM (regra 2) ══
-- `origins` é um jsonb com a procedência CONGELADA de cada parcela que formou a linha: de qual
-- refeição planejada, de qual data, de qual receita, quanto cada uma pediu. É snapshot de
-- propósito — a refeição planejada pode ser editada ou apagada depois, e a lista impressa que
-- foi ao mercado continua explicando de onde veio cada número.
--
-- ══ O AJUSTE MANUAL SOBREVIVE À REGERAÇÃO (regra 2) ══
-- Mexer na quantidade marca `quantity_overridden`. Regerar a lista atualiza origem e categoria,
-- mas NÃO reescreve a quantidade de um item marcado — quem comprou 2 kg porque o pacote é de
-- 2 kg não quer ver 1,4 kg de volta toda vez que o planejamento é recalculado.
--
-- ⚠️ O índice único de consolidação é PARCIAL: não serve para `ON CONFLICT` (42P10). A action
-- faz select-then-insert/update, como manda a armadilha documentada desde a 16-B.
--
-- `label` é CONGELADO no ato: `food_id` e `recipe_id` são `on delete set null`, e um item
-- continua legível ("Arroz, integral, cru") mesmo depois de o alimento sair do catálogo.

create table if not exists public.nutrition_shopping_list_items (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  list_id               uuid not null references public.nutrition_shopping_lists(id) on delete cascade,

  category_id           uuid references public.nutrition_market_categories(id) on delete set null,

  -- Referências INFORMATIVAS. O que sustenta a linha é `label`.
  food_id               uuid references public.nutrition_foods(id) on delete set null,
  recipe_id             uuid references public.nutrition_recipes(id) on delete set null,

  label                 text not null check (length(btrim(label)) > 0),
  brand                 text,

  -- NULO = "sem quantidade definida" (item livre, "sal a gosto"). NUNCA zero: comprar zero de
  -- alguma coisa não significa nada, e a UI precisa distinguir os dois casos.
  quantity              numeric(12,3) check (quantity is null or quantity > 0),
  -- 'g' | 'kg' | 'mg' | 'ml' | 'l' | 'un' | rótulo de medida caseira ("colher de sopa").
  unit                  text not null default 'un' check (length(btrim(unit)) > 0),

  -- Identidade de consolidação: alimento (ou rótulo normalizado) + família de unidade. É o que
  -- permite regerar sem duplicar e sem perder o ajuste manual. NULO em item criado à mão.
  consolidation_key     text,
  quantity_overridden   boolean not null default false,

  -- Procedência congelada. Ver o bloco acima.
  origins               jsonb not null default '[]'::jsonb,
  -- Por que esta linha ficou separada de outra do mesmo item. NULO = não houve separação.
  separate_reason       text,

  -- Item digitado pelo usuário nunca é tocado por regeração: são as palavras dele.
  is_manual             boolean not null default true,

  status                text not null default 'pendente'
                          check (status in ('pendente', 'no_carrinho', 'comprado', 'indisponivel', 'removido')),
  priority              text not null default 'normal'
                          check (priority in ('baixa', 'normal', 'alta')),

  -- Dinheiro em CENTAVOS (integer), como todo o financeiro do projeto. Nulo = não informado,
  -- que é diferente de "custou zero".
  estimated_price_cents integer check (estimated_price_cents is null or estimated_price_cents >= 0),
  actual_price_cents    integer check (actual_price_cents is null or actual_price_cents >= 0),

  store                 text,
  note                  text,
  position              integer not null default 0,
  purchased_at          timestamptz,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  -- Um item é de um alimento OU de uma receita OU livre — nunca dos dois ao mesmo tempo.
  constraint nutrition_shopping_list_items_single_subject
    check (food_id is null or recipe_id is null)
);

alter table public.nutrition_shopping_list_items enable row level security;
alter table public.nutrition_shopping_list_items force row level security;

drop policy if exists "own rows" on public.nutrition_shopping_list_items;
create policy "own rows" on public.nutrition_shopping_list_items
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists nutrition_shopping_list_items_user_idx
  on public.nutrition_shopping_list_items (user_id);
create index if not exists nutrition_shopping_list_items_list_idx
  on public.nutrition_shopping_list_items (list_id, position);
create index if not exists nutrition_shopping_list_items_status_idx
  on public.nutrition_shopping_list_items (list_id, status);
create index if not exists nutrition_shopping_list_items_category_idx
  on public.nutrition_shopping_list_items (category_id) where category_id is not null;
create index if not exists nutrition_shopping_list_items_food_idx
  on public.nutrition_shopping_list_items (food_id) where food_id is not null;

-- ⚠️ PARCIAL: use select-then-insert/update, nunca ON CONFLICT (ver o cabeçalho).
create unique index if not exists nutrition_shopping_list_items_key_uidx
  on public.nutrition_shopping_list_items (list_id, consolidation_key)
  where consolidation_key is not null;

drop trigger if exists set_nutrition_shopping_list_items_updated_at on public.nutrition_shopping_list_items;
create trigger set_nutrition_shopping_list_items_updated_at
  before update on public.nutrition_shopping_list_items
  for each row execute function public.set_updated_at();

comment on table public.nutrition_shopping_list_items is
  'Itens da lista. A consolidação (shopping.ts) nunca soma unidades incompatíveis: sem conversão real, linhas separadas com separate_reason.';
comment on column public.nutrition_shopping_list_items.quantity is
  'NULO = sem quantidade definida ("a gosto"). NUNCA zero — ausência de dado não é zero.';
comment on column public.nutrition_shopping_list_items.origins is
  'Procedência CONGELADA (refeições, datas e receitas que pediram o item). Snapshot: o planejamento pode mudar depois.';
comment on column public.nutrition_shopping_list_items.quantity_overridden is
  'Ajuste manual da quantidade. Regerar a lista NÃO sobrescreve um item marcado (regra 2).';
comment on column public.nutrition_shopping_list_items.consolidation_key is
  'Identidade de consolidação (item + família de unidade). Índice único PARCIAL: nunca ON CONFLICT.';
