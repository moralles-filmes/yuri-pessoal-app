-- Fase 13 — Busca Global, Lançamento Rápido & Notificações
-- Tabela `notifications`: central de alertas in-app (sino + página /notificacoes).
-- Os alertas são gerados pelo Vercel Cron (rota /api/cron/notifications) que faz
-- "insert apenas dos que faltam" por `dedupe_key` — idempotente (rodar N vezes não
-- duplica). RLS por user_id = auth.uid(). Idempotente.

create table if not exists public.notifications (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  title        text not null,
  description  text,
  -- type: invoice_due | invoice_overdue | bill_due | bill_overdue |
  --       receivable_pending | task_overdue | task_today | event_upcoming |
  --       habit_pending | water_goal | study_overdue | card_limit | high_spending | ...
  type         text not null,
  priority     text not null default 'medium'
                 check (priority in ('low', 'medium', 'high', 'urgent')),
  link         text,
  -- Referência genérica à origem (sem FK — a origem pode ser de qualquer módulo).
  entity_type  text,
  entity_id    uuid,
  is_read      boolean not null default false,
  is_resolved  boolean not null default false,
  resolved_at  timestamptz,
  notify_at    timestamptz not null default now(),
  -- Chave determinística por origem (ex.: 'invoice_overdue:<statement_id>'). O Cron
  -- usa-a para NÃO recriar a mesma notificação. NULL é permitido (notificação manual).
  dedupe_key   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists notifications_user_id_idx
  on public.notifications (user_id);
create index if not exists notifications_user_read_idx
  on public.notifications (user_id, is_read);
create index if not exists notifications_user_type_idx
  on public.notifications (user_id, type);
create index if not exists notifications_user_notify_at_idx
  on public.notifications (user_id, notify_at desc);

-- dedupe único por usuário (parcial: ignora NULL). Garante que o Cron não duplique.
create unique index if not exists notifications_user_dedupe_uniq
  on public.notifications (user_id, dedupe_key)
  where dedupe_key is not null;

alter table public.notifications enable row level security;
alter table public.notifications force row level security;

drop policy if exists "own rows" on public.notifications;
create policy "own rows" on public.notifications
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop trigger if exists set_notifications_updated_at on public.notifications;
create trigger set_notifications_updated_at
  before update on public.notifications
  for each row execute function public.set_updated_at();
