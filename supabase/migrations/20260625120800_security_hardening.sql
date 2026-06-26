-- Fase 02 — Financeiro Base
-- Endurecimento de segurança (resolve avisos do Supabase advisor):
--  1) set_updated_at com search_path fixo (evita function_search_path_mutable).
--  2) seed_default_categories vira SECURITY INVOKER e SEM parâmetro: usa auth.uid()
--     internamente, então só consegue semear para o próprio usuário autenticado.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Remove a versão antiga (SECURITY DEFINER, recebia p_user_id).
drop function if exists public.seed_default_categories(uuid);

create or replace function public.seed_default_categories()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  inserted integer := 0;
begin
  if auth.uid() is null then
    return 0;
  end if;

  insert into public.categories (user_id, name, kind, color, icon, is_default, sort_order)
  select auth.uid(), d.name, d.kind, d.color, d.icon, true, d.ord
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
    where c.user_id = auth.uid() and c.name = d.name and c.is_default
  );

  get diagnostics inserted = row_count;
  return inserted;
end;
$$;