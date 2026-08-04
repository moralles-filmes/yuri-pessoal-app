-- Fase 16-D — Dieta e Alimentação · Despensa
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════╗
-- ║ ISTO NÃO É UM ERP DE ESTOQUE (risco explícito da subfase).                            ║
-- ║ Seis campos e ponto final: item, quantidade disponível, unidade, validade, estoque    ║
-- ║ mínimo e observação. NÃO existe movimentação, entrada, saída, lote, custo médio nem   ║
-- ║ histórico de consumo. Marcar um item como comprado NÃO dá baixa em nada — quem        ║
-- ║ atualiza a despensa é a pessoa, quando quiser.                                        ║
-- ╚══════════════════════════════════════════════════════════════════════════════════════╝
--
-- Se um dia isso virar controle de estoque, ele deixa de ser usado em duas semanas: manter
-- estoque atualizado é trabalho, e o trabalho tem de ser menor que o benefício de não comprar
-- açúcar duas vezes.
--
-- ══ QUANTIDADE NULA ≠ ZERO (regra 1 do módulo, aplicada aqui) ══
-- • `quantity = 0`  → "acabou", um fato medido. Desconta zero, e o item vai inteiro para a lista.
-- • `quantity NULL` → "tenho, mas não sei quanto". O desconto NÃO acontece, e a tela diz por quê.
--   Chutar uma quantidade aqui faria a lista deixar de comprar algo que talvez esteja acabando.
--
-- O desconto é OPT-IN e mostrado antes de aplicar (regra 3): `previewPantryDiscount` devolve o
-- que sairia da lista, e só depois da confirmação a action grava.

create table if not exists public.nutrition_pantry_items (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,

  -- Referência informativa ao catálogo; o que sustenta a linha é `label`, congelado no ato.
  food_id      uuid references public.nutrition_foods(id) on delete set null,
  label        text not null check (length(btrim(label)) > 0),

  -- Os 6 campos do escopo travado:
  quantity     numeric(12,3) check (quantity is null or quantity >= 0),
  unit         text not null default 'un' check (length(btrim(unit)) > 0),
  expires_on   date,
  min_quantity numeric(12,3) check (min_quantity is null or min_quantity >= 0),
  note         text,

  -- Corredor onde o item costuma ser comprado, para o que falta já nascer agrupado.
  category_id  uuid references public.nutrition_market_categories(id) on delete set null,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.nutrition_pantry_items enable row level security;
alter table public.nutrition_pantry_items force row level security;

drop policy if exists "own rows" on public.nutrition_pantry_items;
create policy "own rows" on public.nutrition_pantry_items
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists nutrition_pantry_items_user_idx
  on public.nutrition_pantry_items (user_id);
create index if not exists nutrition_pantry_items_user_label_idx
  on public.nutrition_pantry_items (user_id, label);
create index if not exists nutrition_pantry_items_food_idx
  on public.nutrition_pantry_items (food_id) where food_id is not null;
create index if not exists nutrition_pantry_items_expires_idx
  on public.nutrition_pantry_items (user_id, expires_on) where expires_on is not null;

drop trigger if exists set_nutrition_pantry_items_updated_at on public.nutrition_pantry_items;
create trigger set_nutrition_pantry_items_updated_at
  before update on public.nutrition_pantry_items
  for each row execute function public.set_updated_at();

comment on table public.nutrition_pantry_items is
  'Despensa: o que já se tem em casa. Escopo travado em 6 campos — sem movimentação, entrada, saída ou histórico. Não é ERP de estoque.';
comment on column public.nutrition_pantry_items.quantity is
  'NULO = "tenho mas não sei quanto" (não desconta, e a tela explica). ZERO = "acabou", fato medido. São coisas diferentes.';
