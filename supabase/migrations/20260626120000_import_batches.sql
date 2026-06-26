-- Fase 06 — Importação de Faturas & Extratos (Excel/CSV/OFX)
-- Tabela `import_batches`: um lote por arquivo importado. Guarda o alvo (cartão x conta),
-- o status do fluxo (pendente→mapeando→revisando→importado/cancelado), os totais
-- (linhas detectadas/importadas/ignoradas/duplicadas) e o mapeamento de colunas (jsonb)
-- para reuso/auditoria. RLS + FORCE RLS (padrão Fases 02–05). Idempotente.

create table if not exists public.import_batches (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  file_name          text not null,
  formato            text not null check (formato in ('excel', 'csv', 'ofx')),
  origem             text not null check (origem in ('cartao', 'conta')),
  -- Alvo do lote: cartão (origem='cartao') ou conta (origem='conta'). on delete set null
  -- preserva o lote/histórico mesmo se o cartão/conta for excluído depois.
  credit_card_id     uuid references public.credit_cards(id) on delete set null,
  account_id         uuid references public.accounts(id) on delete set null,
  -- 'negativo_e_despesa': como interpretar o sinal do valor no extrato de conta.
  sinal_negativo_despesa boolean not null default true,
  status             text not null default 'revisando'
                       check (status in ('pendente', 'mapeando', 'revisando', 'importado', 'cancelado')),
  total_linhas       integer not null default 0 check (total_linhas >= 0),
  total_importadas   integer not null default 0 check (total_importadas >= 0),
  total_ignoradas    integer not null default 0 check (total_ignoradas >= 0),
  total_duplicadas   integer not null default 0 check (total_duplicadas >= 0),
  column_mapping     jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table public.import_batches enable row level security;
alter table public.import_batches force row level security;

drop policy if exists "own rows" on public.import_batches;
create policy "own rows" on public.import_batches
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists import_batches_user_idx
  on public.import_batches (user_id);
create index if not exists import_batches_user_status_idx
  on public.import_batches (user_id, status);
create index if not exists import_batches_user_created_idx
  on public.import_batches (user_id, created_at desc);

drop trigger if exists set_import_batches_updated_at on public.import_batches;
create trigger set_import_batches_updated_at
  before update on public.import_batches
  for each row execute function public.set_updated_at();
