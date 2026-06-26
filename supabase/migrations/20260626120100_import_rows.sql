-- Fase 06 — Importação de Faturas & Extratos
-- Tabela `import_rows`: uma linha por registro do arquivo. Guarda os dados CRUS (jsonb, para
-- auditoria e re-mapeamento sem reupload) + os campos NORMALIZADOS (data, descrição, valor em
-- numeric(14,2), tipo despesa/receita, categoria sugerida, parcela/nº de parcelas, identificador
-- do extrato) e o status da linha no fluxo de revisão. Quando importada, aponta para a transação
-- gerada (transaction_id). `import_as` escolhe se a linha vira 1 lançamento (single) ou uma
-- compra parcelada completa (parcelamento — reusa o motor da Fase 04). RLS + FORCE RLS. Idempotente.

create table if not exists public.import_rows (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  import_batch_id       uuid not null references public.import_batches(id) on delete cascade,
  linha_index           integer not null,
  raw                   jsonb not null default '[]'::jsonb,
  data_norm             date,
  descricao             text,
  valor                 numeric(14,2),
  tipo                  text check (tipo in ('despesa', 'receita')),
  categoria_sugerida_id uuid references public.categories(id) on delete set null,
  parcela               integer check (parcela is null or parcela >= 1),
  parcelas_total        integer check (parcelas_total is null or parcelas_total >= 1),
  identificador         text,
  import_as             text not null default 'single'
                          check (import_as in ('single', 'parcelamento')),
  status                text not null default 'pendente'
                          check (status in ('pendente', 'para_importar', 'duplicada', 'ignorada', 'importada', 'erro')),
  transaction_id        uuid references public.transactions(id) on delete set null,
  motivo                text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

alter table public.import_rows enable row level security;
alter table public.import_rows force row level security;

drop policy if exists "own rows" on public.import_rows;
create policy "own rows" on public.import_rows
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists import_rows_user_idx
  on public.import_rows (user_id);
create index if not exists import_rows_batch_idx
  on public.import_rows (import_batch_id, linha_index);
create index if not exists import_rows_user_status_idx
  on public.import_rows (user_id, status);

drop trigger if exists set_import_rows_updated_at on public.import_rows;
create trigger set_import_rows_updated_at
  before update on public.import_rows
  for each row execute function public.set_updated_at();
