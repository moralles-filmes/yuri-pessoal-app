-- Iteração (manutenção) — Divisão de terceiros direto na revisão da importação (Fase 05 + 06).
-- Permite marcar uma linha do arquivo como compartilhada/de terceiro ANTES de importar: ao
-- confirmar (commitImport), a transação criada já nasce dividida (reusa applySplit/applySplitParcelado).
-- `classificacao` espelha o CHECK de transactions; `split_parts` guarda as partes do form (jsonb,
-- no formato de splitSchema). Idempotente. RLS já vem da policy "own rows" da tabela.

alter table public.import_rows
  add column if not exists classificacao text not null default 'pessoal'
    check (classificacao in ('pessoal', 'terceiro', 'compartilhada'));

alter table public.import_rows
  add column if not exists split_parts jsonb not null default '[]'::jsonb;
