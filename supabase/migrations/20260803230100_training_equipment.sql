-- Fase 17-A — Treinos · Equipamentos
--
-- Mesma regra de propriedade dos grupos musculares: `user_id` nulo = base do sistema,
-- somente leitura, policies separadas por comando.
--
-- `default_increment_kg` é o MENOR SALTO DE CARGA típico daquele equipamento. Barra com
-- anilhas de 1,25 kg de cada lado sobe de 2,5 em 2,5; halteres de academia costumam pular de
-- 2 em 2; máquina de placas, de 5 em 5. Esse número é o que a Subfase 17-D usa para sugerir
-- progressão realizável — sugerir "+1 kg" numa máquina de placas seria sugerir o impossível.
-- NULO = não se aplica (peso corporal, esteira).

create table if not exists public.training_equipment (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid references auth.users(id) on delete cascade,

  slug                 text not null,
  name                 text not null,
  category             text not null default 'outro'
                         check (category in ('livre','maquina','cabo','corporal','acessorio','cardio','outro')),
  default_increment_kg numeric(6,3) check (default_increment_kg is null or default_increment_kg > 0),
  position             integer not null default 0,

  is_system            boolean not null default false,
  archived_at          timestamptz,

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint training_equipment_global_is_system
    check ((user_id is null) = is_system)
);

alter table public.training_equipment enable row level security;
alter table public.training_equipment force row level security;

drop policy if exists "select own or global" on public.training_equipment;
create policy "select own or global" on public.training_equipment
  for select using (user_id = auth.uid() or user_id is null);

drop policy if exists "insert own" on public.training_equipment;
create policy "insert own" on public.training_equipment
  for insert with check (user_id = auth.uid());

drop policy if exists "update own" on public.training_equipment;
create policy "update own" on public.training_equipment
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "delete own" on public.training_equipment;
create policy "delete own" on public.training_equipment
  for delete using (user_id = auth.uid());

create unique index if not exists training_equipment_global_slug_idx
  on public.training_equipment (slug) where user_id is null;
create unique index if not exists training_equipment_user_slug_idx
  on public.training_equipment (user_id, slug) where user_id is not null;

create index if not exists training_equipment_user_idx
  on public.training_equipment (user_id);
create index if not exists training_equipment_category_idx
  on public.training_equipment (category);

drop trigger if exists set_training_equipment_updated_at on public.training_equipment;
create trigger set_training_equipment_updated_at
  before update on public.training_equipment
  for each row execute function public.set_updated_at();

comment on table public.training_equipment is
  'Equipamentos. user_id nulo = base do sistema (somente leitura, is_system = true).';
comment on column public.training_equipment.default_increment_kg is
  'Menor salto de carga realizável no equipamento. NULO = não se aplica. Usado pela sugestão de progressão (17-D).';
