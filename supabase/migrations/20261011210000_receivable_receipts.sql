-- supabase/migrations/20261011210000_receivable_receipts.sql
-- REDESIGN-03-D (M1). D6: recebimento parcial de recebível. `receivables.valor` passa a ser a
-- RESPONSABILIDADE ORIGINAL; o saldo é `valor - soma dos recebimentos`.
-- K0: SEM backfill — os recebíveis pagos antes desta migration são lidos como legado no código.
-- K2: `conta_id` e `transaction_id` ficam sem uso nesta subfase (o vínculo com o lançamento é da
--     04-C, que os tornará FK compostas). O SQL abaixo é o aprovado, sem mudança.

-- (1) Habilita a FK COMPOSTA (invariante 23 da 17-F): a RLS confere o user_id da
--     PRÓPRIA linha e não alcança a linha apontada.
alter table public.receivables
  drop constraint if exists receivables_id_user_uk;
alter table public.receivables
  add constraint receivables_id_user_uk unique (id, user_id);

create table if not exists public.receivable_receipts (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  receivable_id  uuid not null,
  valor          numeric(14,2) not null check (valor > 0),
  -- Data pura: é o dia em que o dinheiro entrou, não um instante.
  recebido_em    date not null,
  -- Opcionais: a conta que recebeu e o lançamento de caixa correspondente (E4).
  conta_id       uuid references public.accounts(id) on delete set null,
  transaction_id uuid references public.transactions(id) on delete set null,
  observacoes    text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.receivable_receipts
  drop constraint if exists receivable_receipts_owner_fk;
alter table public.receivable_receipts
  add constraint receivable_receipts_owner_fk
  foreign key (receivable_id, user_id)
  references public.receivables (id, user_id)
  on delete cascade;

comment on constraint receivable_receipts_owner_fk on public.receivable_receipts is
  'FK COMPOSTA: o recebimento só aponta para recebível DO MESMO usuário. A RLS confere a própria linha e não alcança a linha apontada.';

create index if not exists receivable_receipts_user_idx
  on public.receivable_receipts (user_id);
create index if not exists receivable_receipts_receivable_idx
  on public.receivable_receipts (receivable_id);
-- A visão de caixa filtra por data; o índice existe para ela.
create index if not exists receivable_receipts_user_data_idx
  on public.receivable_receipts (user_id, recebido_em);

alter table public.receivable_receipts enable row level security;
alter table public.receivable_receipts force row level security;

drop policy if exists "own rows" on public.receivable_receipts;
create policy "own rows" on public.receivable_receipts for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop trigger if exists set_updated_at on public.receivable_receipts;
create trigger set_updated_at before update on public.receivable_receipts
  for each row execute function public.set_updated_at();

create or replace function public.receivable_receipts_nao_excede()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_devido  numeric(14,2);
  v_recebido numeric(14,2);
begin
  -- FOR UPDATE serializa dois recebimentos concorrentes do MESMO recebível:
  -- sem o lock, os dois leem o mesmo saldo e ambos passam.
  select r.valor into v_devido
    from public.receivables r
   where r.id = new.receivable_id
     for update;

  if v_devido is null then
    raise exception 'Recebível % não encontrado.', new.receivable_id;
  end if;

  select coalesce(sum(rr.valor), 0) into v_recebido
    from public.receivable_receipts rr
   where rr.receivable_id = new.receivable_id
     and rr.id is distinct from new.id;

  if v_recebido + new.valor > v_devido then
    raise exception
      'A soma dos recebimentos (%) passaria do valor devido (%).',
      v_recebido + new.valor, v_devido
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists receivable_receipts_nao_excede on public.receivable_receipts;
create trigger receivable_receipts_nao_excede
  before insert or update on public.receivable_receipts
  for each row execute function public.receivable_receipts_nao_excede();
