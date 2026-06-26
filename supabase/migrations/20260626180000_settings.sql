-- Fase 12 — Dashboard Geral
-- Tabela `settings` (preferências do usuário). Nesta fase guarda o layout do
-- dashboard geral (ordem/visibilidade dos cards + período/visão padrão) na coluna
-- `dashboard_layout jsonb`. UMA linha por usuário (unique user_id → base do upsert).
-- RLS por user_id = auth.uid(). Idempotente — store reutilizável pela Fase 14.
-- Sem novas tabelas de DOMÍNIO: o dashboard só lê/agrega o que já existe.

create table if not exists public.settings (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  -- { order: string[]; hidden: string[]; period: string; view: string }
  dashboard_layout jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Uma linha de preferências por usuário (e índice em user_id via unicidade).
create unique index if not exists settings_user_id_key on public.settings (user_id);

alter table public.settings enable row level security;
alter table public.settings force row level security;

drop policy if exists "own rows" on public.settings;
create policy "own rows" on public.settings
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop trigger if exists set_settings_updated_at on public.settings;
create trigger set_settings_updated_at
  before update on public.settings
  for each row execute function public.set_updated_at();
