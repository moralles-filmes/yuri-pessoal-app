-- Fase 17-C — Treinos · Anilhas e barras disponíveis por local
--
-- A calculadora de anilhas (`src/lib/training/plates.ts`) só é útil se souber o que EXISTE
-- naquele lugar. Sem isso ela viraria uma tabela genérica que sugere combinações impossíveis.
--
-- `quantity` é o número de anilhas DAQUELE peso no local (unidades, não pares). A conta usa
-- pares — a função pura divide por dois e arredonda para baixo, porque barra é simétrica e
-- meia anilha de um lado só não é uma carga que alguém levanta de propósito.
--
-- `kind`:
--   anilha → entra na conta de "por lado"
--   barra  → peso base da barra (a calculadora oferece escolher qual)
--   halter → peso fechado, usado como referência de incremento disponível

create table if not exists public.training_location_plates (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  location_id  uuid not null references public.training_locations(id) on delete cascade,

  kind         text not null default 'anilha'
                 check (kind in ('anilha','barra','halter')),

  weight_kg    numeric(7,3) not null check (weight_kg > 0 and weight_kg <= 1000),
  quantity     smallint not null default 2 check (quantity >= 0 and quantity <= 200),

  notes        text,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.training_location_plates enable row level security;
alter table public.training_location_plates force row level security;

drop policy if exists "own rows" on public.training_location_plates;
create policy "own rows" on public.training_location_plates
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists training_location_plates_user_idx
  on public.training_location_plates (user_id);
create index if not exists training_location_plates_location_idx
  on public.training_location_plates (location_id, kind, weight_kg);

-- O mesmo peso não pode aparecer duas vezes no mesmo local e tipo: seriam duas verdades sobre
-- quantas anilhas de 20 kg existem.
create unique index if not exists training_location_plates_unique_idx
  on public.training_location_plates (location_id, kind, weight_kg);

drop trigger if exists set_training_location_plates_updated_at on public.training_location_plates;
create trigger set_training_location_plates_updated_at
  before update on public.training_location_plates
  for each row execute function public.set_updated_at();

comment on table public.training_location_plates is
  'Anilhas, barras e halteres disponíveis em um local. Entrada da calculadora de anilhas (src/lib/training/plates.ts).';
comment on column public.training_location_plates.quantity is
  'Unidades daquele peso no local (não pares). A calculadora divide por dois: barra é simétrica.';
