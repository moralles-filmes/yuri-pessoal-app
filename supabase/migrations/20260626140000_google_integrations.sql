-- Fase 08 — Agenda & Google Agenda
-- Tabela `google_integrations`: armazenamento SEGURO dos tokens OAuth do Google.
-- APENAS servidor — nunca exposto ao client. RLS + FORCE RLS por user_id.
-- Single-user: uma integração por usuário (unique user_id).
-- Idempotente: pode ser reaplicada com segurança.

create table if not exists public.google_integrations (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  google_email    text,
  access_token    text not null,
  refresh_token   text,
  token_expiry    timestamptz,
  scope           text,
  calendar_id     text not null default 'primary',
  sync_token      text,
  last_synced_at  timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id)
);

comment on table public.google_integrations is
  'Tokens OAuth do Google Agenda (Fase 08). Sensível: lido apenas no servidor sob RLS; nunca enviado ao frontend nem logado.';

alter table public.google_integrations enable row level security;
alter table public.google_integrations force row level security;

drop policy if exists "own rows" on public.google_integrations;
create policy "own rows" on public.google_integrations
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists google_integrations_user_id_idx
  on public.google_integrations (user_id);

drop trigger if exists set_google_integrations_updated_at on public.google_integrations;
create trigger set_google_integrations_updated_at
  before update on public.google_integrations
  for each row execute function public.set_updated_at();
