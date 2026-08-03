-- Fase 16-A — Dieta e Alimentação · Auditoria de carga da base nutricional
--
-- Registra CADA importação de base (oficial ou do usuário): qual fonte, qual versão, qual
-- arquivo, qual checksum e o que aconteceu com cada linha. É o que permite responder
-- "quando essa base entrou e o arquivo era o mesmo publicado?" meses depois.
--
-- O lote da base do sistema tem `user_id` nulo (mesmo modelo das demais tabelas globais).

create table if not exists public.nutrition_import_batches (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references auth.users(id) on delete cascade,

  source_id      uuid references public.nutrition_food_sources(id) on delete set null,
  source_version text,
  file_name      text,
  -- SHA-256 do arquivo de origem. Se a fonte republicar, o checksum denuncia.
  file_checksum  text,

  rows_total     integer not null default 0 check (rows_total >= 0),
  rows_imported  integer not null default 0 check (rows_imported >= 0),
  rows_skipped   integer not null default 0 check (rows_skipped >= 0),
  rows_failed    integer not null default 0 check (rows_failed >= 0),

  status         text not null default 'concluido'
                   check (status in ('pendente','processando','concluido','falhou')),
  -- Contagens por categoria, avisos e amostras de erro.
  report         jsonb not null default '{}'::jsonb,

  started_at     timestamptz not null default now(),
  finished_at    timestamptz,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.nutrition_import_batches enable row level security;
alter table public.nutrition_import_batches force row level security;

drop policy if exists "select own or global" on public.nutrition_import_batches;
create policy "select own or global" on public.nutrition_import_batches
  for select using (user_id = auth.uid() or user_id is null);

drop policy if exists "insert own" on public.nutrition_import_batches;
create policy "insert own" on public.nutrition_import_batches
  for insert with check (user_id = auth.uid());

drop policy if exists "update own" on public.nutrition_import_batches;
create policy "update own" on public.nutrition_import_batches
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "delete own" on public.nutrition_import_batches;
create policy "delete own" on public.nutrition_import_batches
  for delete using (user_id = auth.uid());

create index if not exists nutrition_import_batches_user_idx
  on public.nutrition_import_batches (user_id);
create index if not exists nutrition_import_batches_source_idx
  on public.nutrition_import_batches (source_id, started_at desc);

drop trigger if exists set_nutrition_import_batches_updated_at on public.nutrition_import_batches;
create trigger set_nutrition_import_batches_updated_at
  before update on public.nutrition_import_batches
  for each row execute function public.set_updated_at();
