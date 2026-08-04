-- Fase 17-B — Treinos · Programas (ABC, Push/Pull/Legs, Upper/Lower, os seus)
--
-- O programa é a camada de ORGANIZAÇÃO acima do treino-modelo: agrupa vários treinos, dá a
-- eles uma ordem e um período. Nada aqui é execução — execução é a sessão (17-C), que grava
-- snapshot próprio e nunca lê estas tabelas para renderizar o passado.
--
-- TRÊS DECISÕES REGISTRADAS:
--
--  • `goal` e `level` são ORGANIZACIONAIS, nunca prescrição. O módulo não recomenda programa,
--    não avalia condicionamento e não promete resultado — os campos existem para o usuário
--    achar o que procura, e a interface diz isso.
--
--  • `is_active` NÃO tem índice único. A regra do módulo é "só um programa ativo por vez é o
--    padrão, mas o usuário pode ter mais de um se quiser — o sistema AVISA em vez de
--    bloquear". Um unique aqui transformaria um aviso em erro de banco.
--
--  • `status` guarda FATO ('rascunho','ativo','pausado','finalizado','arquivado'). "Atrasado"
--    e "em andamento" não existem aqui: derivam de data + agora na leitura, como `atrasada`
--    no TO-DO e o status da fatura.

create table if not exists public.training_programs (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,

  name              text not null,
  description       text,

  goal              text not null default 'personalizado'
                      check (goal in ('hipertrofia','forca','resistencia_muscular','condicionamento',
                                      'manutencao','retorno','personalizado')),
  level             text not null default 'nao_informado'
                      check (level in ('iniciante','intermediario','avancado','nao_informado')),
  status            text not null default 'rascunho'
                      check (status in ('rascunho','ativo','pausado','finalizado','arquivado')),

  -- Data PURA: o período do programa é um intervalo de dias no calendário, não um instante.
  starts_on         date,
  ends_on           date,
  duration_weeks    smallint check (duration_weeks is null or (duration_weeks >= 1 and duration_weeks <= 104)),
  weekly_frequency  smallint check (weekly_frequency is null or (weekly_frequency >= 1 and weekly_frequency <= 14)),

  color             text,
  icon              text,
  notes             text,

  position          integer not null default 0,
  is_active         boolean not null default false,
  archived_at       timestamptz,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint training_programs_period_order
    check (starts_on is null or ends_on is null or ends_on >= starts_on)
);

alter table public.training_programs enable row level security;
alter table public.training_programs force row level security;

drop policy if exists "own rows" on public.training_programs;
create policy "own rows" on public.training_programs
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists training_programs_user_idx
  on public.training_programs (user_id);
create index if not exists training_programs_user_status_idx
  on public.training_programs (user_id, status);
create index if not exists training_programs_user_active_idx
  on public.training_programs (user_id) where is_active;
create index if not exists training_programs_archived_idx
  on public.training_programs (archived_at) where archived_at is not null;

drop trigger if exists set_training_programs_updated_at on public.training_programs;
create trigger set_training_programs_updated_at
  before update on public.training_programs
  for each row execute function public.set_updated_at();

comment on table public.training_programs is
  'Programa de treino (agrupa treinos-modelo). Objetivo e nível são organizacionais, nunca prescrição.';
comment on column public.training_programs.is_active is
  'Programa em uso. Sem unique de propósito: ter mais de um ativo gera AVISO na interface, não erro de banco.';
comment on column public.training_programs.status is
  'Fato gravado. "Atrasado"/"em andamento" NÃO existem aqui — derivam de data + agora na leitura.';
