-- Iteração (manutenção) — SUBCATEGORIA na revisão da importação (Fase 06).
--
-- ══ POR QUE ESTA MIGRATION EXISTE ══
-- A revisão da importação só escolhia a categoria; o lançamento gravado (`transactions`) já
-- aceita `subcategory_id` desde a Fase 02, mas a linha de importação não tinha onde guardá-la,
-- e o dono precisava abrir cada lançamento depois para completar.
--
-- ── FK COMPOSTA (invariante da 17-F) — e ela trava DUAS coisas ──
-- `(subcategoria_sugerida_id, categoria_sugerida_id, user_id)` → `subcategories(id, category_id,
-- user_id)`:
--   1. a subcategoria é do MESMO dono da linha (a RLS só confere o user_id da própria linha);
--   2. a subcategoria é DA categoria escolhida. "Delivery" sob "Moradia" deixa de ser
--      representável — o servidor deriva a categoria da subcategoria, mas a garantia não depende
--      disso. Irrepresentável vence recusado.
-- MATCH SIMPLE (padrão): com qualquer coluna nula a FK não é conferida — linha sem subcategoria,
-- ou cuja categoria foi apagada (`categoria_sugerida_id` é `on delete set null`), passa.
--
-- `on update cascade`: `updateSubcategory` aceita trocar `category_id`. Sem o cascade, mover uma
-- subcategoria de categoria seria recusado enquanto alguma linha de importação a usasse; com ele,
-- a linha acompanha (categoria e subcategoria continuam coerentes).
-- `on delete set null (subcategoria_sugerida_id)` (lista de colunas, PG 15+): apagar a
-- subcategoria limpa SÓ ela — sem a lista o Postgres zeraria `user_id` (NOT NULL) e a categoria.
--
-- Idempotente.

alter table public.import_rows
  add column if not exists subcategoria_sugerida_id uuid;

alter table public.subcategories
  drop constraint if exists subcategories_id_category_user_uk;
alter table public.subcategories
  add constraint subcategories_id_category_user_uk unique (id, category_id, user_id);

alter table public.import_rows
  drop constraint if exists import_rows_subcategoria_owner_fkey;
alter table public.import_rows
  add constraint import_rows_subcategoria_owner_fkey
  foreign key (subcategoria_sugerida_id, categoria_sugerida_id, user_id)
  references public.subcategories (id, category_id, user_id)
  on update cascade
  on delete set null (subcategoria_sugerida_id);

create index if not exists import_rows_subcategoria_idx
  on public.import_rows (subcategoria_sugerida_id)
  where subcategoria_sugerida_id is not null;

comment on column public.import_rows.subcategoria_sugerida_id is
  'Subcategoria escolhida na revisao. Nula = sem subcategoria. Sempre da categoria_sugerida_id (FK composta).';

comment on constraint import_rows_subcategoria_owner_fkey on public.import_rows is
  'A subcategoria e do MESMO usuario da linha e pertence a categoria escolhida. A RLS so confere o user_id da propria linha.';
