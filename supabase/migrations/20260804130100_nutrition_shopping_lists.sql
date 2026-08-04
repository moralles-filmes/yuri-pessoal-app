-- Fase 16-D — Dieta e Alimentação · Listas de compras
--
-- Uma lista é um documento fechado no tempo: ela nasce de um período do planejamento (ou de
-- receitas escolhidas, ou do nada) e passa a viver por conta própria. Regenerar atualiza os
-- itens gerados; NÃO reescreve o que o usuário ajustou à mão.
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════╗
-- ║ REGRA 6 DA SUBFASE — LISTA RECORRENTE NÃO GERA DUPLICATA                             ║
-- ║ `recurrence_key` é DETERMINÍSTICA por período ("semanal:2026-08-03", "mensal:2026-08")║
-- ║ e vem de `shoppingRecurrenceKey` (puro, testado, aritmética em Date.UTC). Abrir a     ║
-- ║ tela cinco vezes na mesma semana encontra a MESMA lista, em vez de criar cinco.       ║
-- ╚══════════════════════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ O índice único que sustenta isso é PARCIAL (`where recurrence_key is not null`). O
-- Postgres não infere índice parcial num `ON CONFLICT` sem repetir o predicado, e o PostgREST
-- não permite repetir — o `upsert` falharia SÓ EM RUNTIME (42P10), como aconteceu na 16-B.
-- Por isso a action usa *select-then-insert*, nunca `upsert`.
--
-- O total gasto NÃO é materializado aqui: sai da soma dos itens na leitura. Materializar
-- criaria uma segunda verdade que envelheceria no primeiro preço corrigido (regra 5 do módulo).

create table if not exists public.nutrition_shopping_lists (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,

  name            text not null check (length(btrim(name)) > 0),
  notes           text,

  -- Status do documento. "concluida" é FATO declarado pelo usuário ("terminei a compra"),
  -- não derivação de "todos os itens comprados": ele pode fechar a lista com item faltando.
  status          text not null default 'ativa'
                    check (status in ('ativa', 'concluida', 'arquivada')),

  -- De onde a lista veio. Procedência, não vínculo vivo: apagar o planejamento não apaga a
  -- lista, e mudar o planejamento não muda a lista sem o usuário mandar regerar.
  source_kind     text not null default 'manual'
                    check (source_kind in ('manual', 'dia', 'semana', 'periodo', 'receitas')),
  source_from     date,
  source_to       date,

  -- Loja padrão da lista. O item pode ter a sua (comprar o hortifruti numa e o resto noutra).
  store           text,

  recurrence      text not null default 'nenhuma'
                    check (recurrence in ('nenhuma', 'semanal', 'quinzenal', 'mensal')),
  -- Chave determinística do período. Ver o bloco acima.
  recurrence_key  text,

  -- Quando o desconto da despensa foi aplicado. NULO = nunca aplicado (regra 3: é opt-in).
  pantry_applied_at timestamptz,

  archived_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint nutrition_shopping_lists_period_order
    check (source_from is null or source_to is null or source_to >= source_from),

  -- Recorrência sem chave não seria recorrência nenhuma: não haveria como reencontrar a lista
  -- do período e a duplicação voltaria pela porta dos fundos.
  constraint nutrition_shopping_lists_recurrence_key
    check (
      (recurrence = 'nenhuma' and recurrence_key is null)
      or (recurrence <> 'nenhuma' and recurrence_key is not null)
    )
);

alter table public.nutrition_shopping_lists enable row level security;
alter table public.nutrition_shopping_lists force row level security;

drop policy if exists "own rows" on public.nutrition_shopping_lists;
create policy "own rows" on public.nutrition_shopping_lists
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists nutrition_shopping_lists_user_idx
  on public.nutrition_shopping_lists (user_id);
create index if not exists nutrition_shopping_lists_user_created_idx
  on public.nutrition_shopping_lists (user_id, created_at desc);
create index if not exists nutrition_shopping_lists_status_idx
  on public.nutrition_shopping_lists (user_id, status);
create index if not exists nutrition_shopping_lists_archived_idx
  on public.nutrition_shopping_lists (archived_at) where archived_at is not null;

-- ⚠️ PARCIAL: não serve para ON CONFLICT (ver o cabeçalho). Existe para o banco garantir a
-- unicidade mesmo se duas abas tentarem criar a lista da mesma semana ao mesmo tempo.
create unique index if not exists nutrition_shopping_lists_recurrence_uidx
  on public.nutrition_shopping_lists (user_id, recurrence_key)
  where recurrence_key is not null;

drop trigger if exists set_nutrition_shopping_lists_updated_at on public.nutrition_shopping_lists;
create trigger set_nutrition_shopping_lists_updated_at
  before update on public.nutrition_shopping_lists
  for each row execute function public.set_updated_at();

comment on table public.nutrition_shopping_lists is
  'Listas de compras. Total gasto é derivado dos itens, nunca materializado. Lista recorrente é reencontrada por recurrence_key (determinística por período).';
comment on column public.nutrition_shopping_lists.recurrence_key is
  'Chave determinística do período (shoppingRecurrenceKey). Índice único PARCIAL: use select-then-insert, nunca ON CONFLICT (42P10).';
comment on column public.nutrition_shopping_lists.pantry_applied_at is
  'Quando o desconto da despensa foi aplicado. NULO = nunca. O desconto é opt-in e mostrado antes de aplicar (regra 3).';
