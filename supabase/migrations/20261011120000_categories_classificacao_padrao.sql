-- supabase/migrations/20261011120000_categories_classificacao_padrao.sql
-- D8: sugestão de classificação ao lançar nesta categoria. NUNCA lida por relatório.

alter table public.categories
  add column if not exists classificacao_padrao text;

alter table public.categories
  drop constraint if exists categories_classificacao_padrao_check;
alter table public.categories
  add constraint categories_classificacao_padrao_check
  check (classificacao_padrao is null
         or classificacao_padrao in ('pessoal', 'terceiro'));

comment on column public.categories.classificacao_padrao is
  'ATALHO: preenche o formulário de lançamento e serve de filtro. A verdade de quem é o dinheiro mora em transactions.classificacao + valor_pessoal, gravada no ato. Relatório NUNCA lê esta coluna. NULO = perguntar sempre.';
