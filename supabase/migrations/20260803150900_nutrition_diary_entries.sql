-- Fase 16-B — Dieta e Alimentação · Item consumido (SNAPSHOT HISTÓRICO IMUTÁVEL)
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════╗
-- ║ A TABELA MAIS IMPORTANTE DA SUBFASE. Regra 1: editar ou excluir um alimento no       ║
-- ║ catálogo NÃO PODE mudar nenhum registro do passado.                                  ║
-- ╚══════════════════════════════════════════════════════════════════════════════════════╝
--
-- Um app que guarda só `food_id` + `quantity` recalcula o histórico a partir do catálogo
-- ATUAL. Consequência: corrigir o valor de proteína de um alimento hoje reescreve, em
-- silêncio, o que a pessoa comeu no ano passado — e o relatório de janeiro muda sozinho.
--
-- Aqui o consumo grava, NO ATO DO REGISTRO, tudo que o cálculo precisa:
--   • identidade do alimento  → food_name_snapshot, preparation_state_snapshot, brand_snapshot
--   • quantidade e conversão  → quantity, measure_label, grams_equivalent, base_quantity/unit
--   • procedência             → source_*_snapshot (SEM FK: o passado não pode depender de
--                               linha viva; se a fonte sumir, o registro continua auditável)
--   • os nutrientes           → nutrients_snapshot jsonb, código → {amount, state, method}
--
-- `food_id` fica como REFERÊNCIA INFORMATIVA, com `on delete set null`. Excluir o alimento
-- perde o link ("ver no catálogo"), nunca o histórico. Por isso o discriminador da linha é
-- `entry_kind`, que não muda, e não a presença de `food_id`, que pode virar nulo.
--
-- ══ AS COLUNAS QUENTES NÃO SÃO A VERDADE ══
-- energy_kcal/protein_g/carb_g/fat_g/fiber_g são DERIVADAS do jsonb no momento da gravação e
-- servem só para listar e ordenar rápido. O total oficial do dia sai SEMPRE do
-- `nutrients_snapshot`, por `src/lib/nutrition/calc.ts`, porque só o jsonb carrega o
-- `value_state` de cada nutriente — e sem ele "0" e "não medido" viram a mesma coisa.
-- NULO nessas colunas significa NÃO DISPONÍVEL, jamais zero.
--
-- ══ PLANEJADO × CONSUMIDO ══
-- `planned_item_id` + `change_kind` guardam a relação com o item planejado sem tocar nele:
--   igual | quantidade_ajustada | substituido | removido | extra
-- 'removido' registra a DECISÃO de não comer o item planejado (diferente de simplesmente não
-- ter registrado nada) e por isso NÃO entra nas somas — a leitura o descarta.

create table if not exists public.nutrition_diary_entries (
  id                         uuid primary key default gen_random_uuid(),
  user_id                    uuid not null references auth.users(id) on delete cascade,

  diary_meal_id              uuid not null references public.nutrition_diary_meals(id) on delete cascade,

  -- Referência informativa. Vira nulo se o alimento for excluído; o snapshot permanece.
  food_id                    uuid references public.nutrition_foods(id) on delete set null,
  -- Discriminador estável (não depende de food_id, que pode virar nulo).
  -- 16-C acrescenta 'receita' e 'modelo' a este CHECK.
  entry_kind                 text not null default 'alimento'
                               check (entry_kind in ('alimento','livre')),

  planned_item_id            uuid references public.nutrition_planned_meal_items(id) on delete set null,
  change_kind                text not null default 'extra'
                               check (change_kind in ('igual','quantidade_ajustada','substituido','removido','extra')),
  changed_at                 timestamptz,

  /* ───────── SNAPSHOT — nada abaixo desta linha é recalculado depois ───────── */
  food_name_snapshot         text not null check (length(btrim(food_name_snapshot)) > 0),
  preparation_state_snapshot text,
  brand_snapshot             text,

  quantity                   numeric(12,4) check (quantity is null or quantity > 0),
  measure_label              text,
  -- Quantidade convertida para a UNIDADE-BASE do alimento. Quando base_unit = 'ml' o valor
  -- está em mililitros, apesar do nome herdado do contrato da subfase. Nunca há conversão
  -- entre massa e volume: isso exigiria densidade, e densidade presumida é dado inventado.
  grams_equivalent           numeric(14,4) check (grams_equivalent is null or grams_equivalent > 0),
  base_quantity              numeric(10,3) check (base_quantity is null or base_quantity > 0),
  base_unit                  text check (base_unit is null or base_unit in ('g','ml')),

  source_id_snapshot         uuid,
  source_name_snapshot       text,
  source_version_snapshot    text,
  source_food_code_snapshot  text,

  -- { "proteina": { "amount": 12.3, "state": "disponivel", "method": "analitico" }, … }
  -- `amount` é NULO quando `state` não é 'disponivel'. Mesma regra da tabela de nutrientes.
  nutrients_snapshot         jsonb not null default '{}'::jsonb,

  -- Derivadas do jsonb NA GRAVAÇÃO, só para consulta rápida. NULO = não disponível.
  energy_kcal                numeric(12,4),
  protein_g                  numeric(12,4),
  carb_g                     numeric(12,4),
  fat_g                      numeric(12,4),
  fiber_g                    numeric(12,4),
  /* ───────── fim do snapshot ───────── */

  notes                      text,
  position                   integer not null default 0,

  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),

  -- Item vindo do catálogo precisa do snapshot COMPLETO de cálculo. Sem isso o total do dia
  -- dependeria do catálogo atual — exatamente o que esta tabela existe para impedir.
  constraint nutrition_diary_entries_food_snapshot_complete
    check (entry_kind <> 'alimento'
        or (quantity is not null and grams_equivalent is not null
            and base_quantity is not null and base_unit is not null)),
  constraint nutrition_diary_entries_snapshot_is_object
    check (jsonb_typeof(nutrients_snapshot) = 'object')
);

alter table public.nutrition_diary_entries enable row level security;
alter table public.nutrition_diary_entries force row level security;

drop policy if exists "own rows" on public.nutrition_diary_entries;
create policy "own rows" on public.nutrition_diary_entries
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists nutrition_diary_entries_user_idx
  on public.nutrition_diary_entries (user_id);
create index if not exists nutrition_diary_entries_meal_idx
  on public.nutrition_diary_entries (diary_meal_id, position);
create index if not exists nutrition_diary_entries_food_idx
  on public.nutrition_diary_entries (food_id) where food_id is not null;
create index if not exists nutrition_diary_entries_planned_item_idx
  on public.nutrition_diary_entries (planned_item_id) where planned_item_id is not null;

-- Confirmar a mesma refeição planejada duas vezes não pode duplicar o item consumido
-- (risco listado no doc da subfase). Itens extras não têm planned_item_id e ficam livres.
create unique index if not exists nutrition_diary_entries_planned_unique_idx
  on public.nutrition_diary_entries (user_id, diary_meal_id, planned_item_id)
  where planned_item_id is not null;

drop trigger if exists set_nutrition_diary_entries_updated_at on public.nutrition_diary_entries;
create trigger set_nutrition_diary_entries_updated_at
  before update on public.nutrition_diary_entries
  for each row execute function public.set_updated_at();

comment on table public.nutrition_diary_entries is
  'Item consumido com SNAPSHOT IMUTÁVEL. Editar ou excluir o alimento no catálogo não altera nenhum registro passado.';
comment on column public.nutrition_diary_entries.nutrients_snapshot is
  'Fonte de verdade do total do dia: código → {amount, state, method}. amount NULO quando state <> disponivel.';
comment on column public.nutrition_diary_entries.energy_kcal is
  'Derivada do snapshot NA GRAVAÇÃO, só para consulta rápida. NULO = não disponível, nunca zero. O total oficial sai do jsonb via calc.ts.';
comment on column public.nutrition_diary_entries.grams_equivalent is
  'Quantidade na UNIDADE-BASE do alimento (ver base_unit). Quando base_unit = ml, o valor está em mililitros.';
comment on column public.nutrition_diary_entries.change_kind is
  'Relação com o item planejado. "removido" = decisão explícita de não comer; NÃO entra nas somas.';
