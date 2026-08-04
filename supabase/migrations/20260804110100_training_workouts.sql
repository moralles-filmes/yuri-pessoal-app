-- Fase 17-B — Treinos · Treino-modelo ("Treino A — Peito e tríceps")
--
-- MODELO É MUTÁVEL; EXECUÇÃO É IMUTÁVEL. Esta tabela é o lado mutável: pode ser renomeada,
-- reordenada e reconfigurada quando o usuário quiser. O que protege o histórico NÃO é esta
-- tabela — é o snapshot que a sessão (17-C) congela ao iniciar. Por isso nenhuma leitura de
-- histórico pode passar por aqui, e por isso não existe coluna apontando para sessão.
--
-- VERSIONAMENTO (`version` + `superseded_by` + `version_group_id`)
--
-- Editar um treino já usado NÃO cria versão automaticamente — isso encheria o banco. Quem
-- decide é o usuário: "salvar alterações" (mesma linha) ou "salvar como nova versão", que
-- cria uma linha com `version = anterior + 1`, marca a antiga com `superseded_by` e mantém as
-- duas no mesmo `version_group_id`. A antiga fica arquivada e legível.
--
-- O versionamento existe para o usuário COMPARAR INTENÇÕES ("meu ABC de janeiro × o de
-- maio"), não para proteger histórico. Quem protege histórico é o snapshot da 17-C.
--
-- `program_id` é apenas "programa de origem" (conveniência de interface) e é `set null` ao
-- excluir o programa. O vínculo real programa↔treino vive em `training_program_workouts`,
-- porque um treino pode ser avulso ou pertencer a mais de um programa.

create table if not exists public.training_workouts (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,

  name              text not null,
  short_name        text,
  description       text,

  goal              text not null default 'personalizado'
                      check (goal in ('hipertrofia','forca','resistencia_muscular','condicionamento',
                                      'manutencao','retorno','personalizado')),
  status            text not null default 'ativo'
                      check (status in ('rascunho','ativo','arquivado')),

  program_id        uuid references public.training_programs(id) on delete set null,

  estimated_minutes smallint check (estimated_minutes is null or (estimated_minutes >= 0 and estimated_minutes <= 600)),
  color             text,
  icon              text,
  notes             text,

  version           integer not null default 1 check (version >= 1),
  version_group_id  uuid not null default gen_random_uuid(),
  superseded_by     uuid references public.training_workouts(id) on delete set null,

  is_favorite       boolean not null default false,
  position          integer not null default 0,
  archived_at       timestamptz,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint training_workouts_superseded_not_self
    check (superseded_by is null or superseded_by <> id)
);

alter table public.training_workouts enable row level security;
alter table public.training_workouts force row level security;

drop policy if exists "own rows" on public.training_workouts;
create policy "own rows" on public.training_workouts
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists training_workouts_user_idx
  on public.training_workouts (user_id);
create index if not exists training_workouts_user_status_idx
  on public.training_workouts (user_id, status);
create index if not exists training_workouts_program_idx
  on public.training_workouts (program_id) where program_id is not null;
create index if not exists training_workouts_version_group_idx
  on public.training_workouts (user_id, version_group_id);
create index if not exists training_workouts_archived_idx
  on public.training_workouts (archived_at) where archived_at is not null;

drop trigger if exists set_training_workouts_updated_at on public.training_workouts;
create trigger set_training_workouts_updated_at
  before update on public.training_workouts
  for each row execute function public.set_updated_at();

comment on table public.training_workouts is
  'Treino-modelo (MUTÁVEL). A execução é imutável e vive no snapshot da sessão (17-C) — nenhuma leitura de histórico passa por aqui.';
comment on column public.training_workouts.version_group_id is
  'Agrupa todas as versões do mesmo treino. Permite comparar intenções sem duplicar identidade.';
comment on column public.training_workouts.superseded_by is
  'Versão que substituiu esta. Só é preenchido por escolha explícita do usuário ("salvar como nova versão").';
comment on column public.training_workouts.program_id is
  'Programa de ORIGEM (conveniência de interface). O vínculo real vive em training_program_workouts.';
