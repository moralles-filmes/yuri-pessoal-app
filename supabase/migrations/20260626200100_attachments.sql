-- Fase 14 — Tabela genérica de anexos/comprovantes
-- Metadados de arquivos guardados no Supabase Storage (bucket privado `attachments`,
-- ver migration seguinte). Referência genérica a qualquer entidade do app via
-- (entity_type, entity_id) — SEM FK (a entidade pode ser de qualquer módulo). O arquivo
-- vive no Storage em '{user_id}/{entity_type}/{entity_id}/{arquivo}'. RLS por
-- user_id = auth.uid() + FORCE RLS. Idempotente. Espelha o padrão de `task_attachments`.

create table if not exists public.attachments (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  -- Tipo/instância da entidade dona do anexo (ex.: 'transaction', 'task', 'receivable').
  entity_type  text not null,
  entity_id    uuid,
  bucket_id    text not null default 'attachments',
  -- Caminho no Storage: '{user_id}/{entity_type}/{entity_id}/{arquivo}'.
  storage_path text not null,
  file_name    text not null,
  mime_type    text,
  size_bytes   bigint,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.attachments enable row level security;
alter table public.attachments force row level security;

drop policy if exists "own rows" on public.attachments;
create policy "own rows" on public.attachments
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists attachments_user_idx
  on public.attachments (user_id);
create index if not exists attachments_user_entity_idx
  on public.attachments (user_id, entity_type, entity_id);
create unique index if not exists attachments_path_uidx
  on public.attachments (bucket_id, storage_path);

drop trigger if exists set_attachments_updated_at on public.attachments;
create trigger set_attachments_updated_at
  before update on public.attachments
  for each row execute function public.set_updated_at();
