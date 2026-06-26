-- Fase 02 — Financeiro Base
-- Função que semeia as 16 categorias padrão (briefing) para um usuário.
-- Chamada pela Server Action ensureDefaultCategories() com p_user_id = auth.uid().
-- Idempotente: o NOT EXISTS evita duplicar. Com FORCE RLS, o WITH CHECK da policy
-- ainda é avaliado; como p_user_id = auth.uid() na sessão chamadora, a inserção passa.

create or replace function public.seed_default_categories(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted integer := 0;
begin
  insert into public.categories (user_id, name, kind, color, icon, is_default, sort_order)
  select p_user_id, d.name, d.kind, d.color, d.icon, true, d.ord
  from (values
    ('Alimentação',  'despesa', '#E0A33E', 'utensils',      1),
    ('Mercado',      'despesa', '#7CB342', 'shopping-cart', 2),
    ('Delivery',     'despesa', '#FB8C00', 'bike',          3),
    ('Transporte',   'despesa', '#42A5F5', 'bus',           4),
    ('Combustível',  'despesa', '#EF5350', 'fuel',          5),
    ('Moradia',      'despesa', '#8D6E63', 'house',         6),
    ('Contas fixas', 'despesa', '#26A69A', 'receipt-text',  7),
    ('Assinaturas',  'despesa', '#AB47BC', 'repeat',        8),
    ('Saúde',        'despesa', '#EC407A', 'heart-pulse',   9),
    ('Lazer',        'despesa', '#FFCA28', 'party-popper', 10),
    ('Educação',     'despesa', '#5C6BC0', 'graduation-cap', 11),
    ('Trabalho',     'receita', '#66BB6A', 'briefcase',    12),
    ('Marketing',    'despesa', '#26C6DA', 'megaphone',    13),
    ('Equipamentos', 'despesa', '#78909C', 'monitor',      14),
    ('Viagens',      'despesa', '#FF7043', 'plane',        15),
    ('Outros',       'ambos',   '#A98438', 'tag',          16)
  ) as d(name, kind, color, icon, ord)
  where not exists (
    select 1 from public.categories c
    where c.user_id = p_user_id and c.name = d.name and c.is_default
  );

  get diagnostics inserted = row_count;
  return inserted;
end;
$$;
