-- Fase 16-C — Dieta e Alimentação · Receita e refeição-modelo entram no diário
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════╗
-- ║ NÃO EXISTE UM SEGUNDO CAMINHO DE GRAVAÇÃO.                                           ║
-- ╚══════════════════════════════════════════════════════════════════════════════════════╝
--
-- Receita e refeição-modelo viram itens do diário na MESMA tabela, com o MESMO snapshot,
-- montado pelo MESMO `buildDiaryEntrySnapshot`. A migration da 16-B já deixou isso escrito no
-- comentário do CHECK ("16-C acrescenta 'receita' e 'modelo'"): criar uma tabela paralela para
-- consumo de receita faria diário, receita e relatório discordarem no primeiro total somado.
--
-- ══ POR QUE `entry_kind` E NÃO A PRESENÇA DE UMA FK ══
-- `recipe_id` e `meal_template_id` são `on delete set null`, como `food_id`: excluir a receita
-- não pode apagar o que a pessoa comeu. Como as três podem virar nulas, o discriminador
-- precisa ser a coluna que não muda.
--
-- ══ POR QUE A RECEITA PODE NÃO TER `grams_equivalent` ══
-- Uma receita sem `total_weight_g` (peso final informado) só pode ser registrada em PORÇÕES —
-- não há como convertê-la em gramas sem estimar, e estimar é proibido (regra 1 da subfase).
-- Nesse caso `grams_equivalent`, `base_quantity` e `base_unit` ficam NULOS, que é a resposta
-- honesta: "não sei o peso", e não "pesa zero". Por isso o CHECK de snapshot completo continua
-- valendo integralmente para 'alimento' e exige de 'receita' apenas a quantidade.

/* ───────────────────────── Colunas de procedência ───────────────────────── */

alter table public.nutrition_diary_entries
  add column if not exists recipe_id uuid references public.nutrition_recipes(id) on delete set null;

alter table public.nutrition_diary_entries
  add column if not exists meal_template_id uuid references public.nutrition_meal_templates(id) on delete set null;

/* ───────────────────────── entry_kind ganha os dois novos tipos ───────────────────────── */

alter table public.nutrition_diary_entries
  drop constraint if exists nutrition_diary_entries_entry_kind_check;

alter table public.nutrition_diary_entries
  add constraint nutrition_diary_entries_entry_kind_check
  check (entry_kind in ('alimento','livre','receita','modelo'));

/* ───────────────────────── Snapshot completo, por tipo ───────────────────────── */

alter table public.nutrition_diary_entries
  drop constraint if exists nutrition_diary_entries_food_snapshot_complete;

alter table public.nutrition_diary_entries
  add constraint nutrition_diary_entries_food_snapshot_complete
  check (
    -- Item do catálogo: snapshot de cálculo COMPLETO, como na 16-B.
    (entry_kind <> 'alimento'
      or (quantity is not null and grams_equivalent is not null
          and base_quantity is not null and base_unit is not null))
    and
    -- Receita: quantidade obrigatória (porções ou gramas do preparo). O peso pode ser
    -- desconhecido, e nesse caso as colunas de conversão ficam nulas — nunca zero.
    (entry_kind <> 'receita' or quantity is not null)
  );

/* ───────────────────────── Índices ───────────────────────── */

create index if not exists nutrition_diary_entries_recipe_idx
  on public.nutrition_diary_entries (recipe_id) where recipe_id is not null;
create index if not exists nutrition_diary_entries_template_idx
  on public.nutrition_diary_entries (meal_template_id) where meal_template_id is not null;

comment on column public.nutrition_diary_entries.entry_kind is
  'Discriminador ESTÁVEL da linha: alimento | livre | receita | modelo. Não use a presença de food_id/recipe_id — elas viram nulas ao excluir a origem.';
comment on column public.nutrition_diary_entries.recipe_id is
  'Procedência informativa (on delete set null). O total do dia sai do nutrients_snapshot, nunca da receita atual.';
comment on column public.nutrition_diary_entries.meal_template_id is
  'Refeição-modelo que originou o item. Procedência, não vínculo vivo: editar o modelo não altera o consumo registrado.';
