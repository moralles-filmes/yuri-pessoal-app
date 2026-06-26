-- Fase 03 — Cartões de Crédito & Faturas
-- Tabela `credit_cards`: cartões do usuário (limite, fechamento, vencimento, bandeira).
-- Idempotente. RLS + FORCE RLS (padrão Fase 02): cada usuário só vê os próprios cartões.

create table if not exists public.credit_cards (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  nome            text not null,
  banco           text not null,
  bandeira        text not null
                    check (bandeira in ('visa','mastercard','elo','amex','outro')),
  limite_total    numeric(14,2) not null default 0,
  dia_fechamento  smallint not null check (dia_fechamento between 1 and 31),
  dia_vencimento  smallint not null check (dia_vencimento between 1 and 31),
  cor             text not null default '#A98438',
  ativo           boolean not null default true,
  observacoes     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.credit_cards enable row level security;
alter table public.credit_cards force row level security;

drop policy if exists "own rows" on public.credit_cards;
create policy "own rows" on public.credit_cards
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists credit_cards_user_id_idx on public.credit_cards (user_id);
create index if not exists credit_cards_user_active_idx on public.credit_cards (user_id, ativo);

drop trigger if exists set_credit_cards_updated_at on public.credit_cards;
create trigger set_credit_cards_updated_at
  before update on public.credit_cards
  for each row execute function public.set_updated_at();
