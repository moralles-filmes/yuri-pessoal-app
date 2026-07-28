-- Fase 15 — Módulo TO-DO · Tarefas (tabela central)
-- RLS + FORCE RLS por user_id = auth.uid(). Idempotente.
--
-- Notas de modelagem (ver docs/phases/PHASE_15_TODO_COMPLETE.md):
--  • 'atrasada' NÃO é um status gravável: é DERIVADO na leitura (data programada ou prazo
--    < hoje, e não concluída/cancelada) — mesma regra das Fases 03/09.
--  • DATA PROGRAMADA (`scheduled_date`, quando pretendo fazer) é conceitualmente diferente
--    do PRAZO FINAL (`deadline_at`, limite máximo). O usuário pode usar uma, outra ou ambas.
--  • Data em `date` puro + hora em `time` SEPARADOS: evita o drift de UTC ("virar o dia")
--    que um timestamptz causaria — o servidor na Vercel roda em UTC.
--  • `parent_task_id` self-FK ON DELETE CASCADE: excluir a tarefa-mãe leva as subtarefas.
--    A UI SEMPRE confirma antes (nunca exclusão silenciosa).
--  • `series_id` agrupa as ocorrências de uma mesma série recorrente. Editar "esta e as
--    próximas" cria uma série nova a partir do corte, preservando o histórico da anterior.
--  • `source`/`external_reference` permitem relacionar a tarefa a outro módulo (agenda,
--    estudos, financeiro) sem criar FK rígida entre domínios.

create table if not exists public.todo_tasks (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  -- NULL = Caixa de entrada (tarefa capturada rápido, ainda sem projeto).
  project_id       uuid references public.todo_projects(id) on delete set null,
  section_id       uuid references public.todo_sections(id) on delete set null,
  parent_task_id   uuid references public.todo_tasks(id) on delete cascade,

  title            text not null,
  description      text,

  status           text not null default 'pendente'
                     check (status in ('pendente','em_andamento','concluida','cancelada','arquivada')),
  -- 1 = urgente (P1) … 4 = normal (P4). Inteiro para ordenar direto no banco.
  priority         smallint not null default 4
                     check (priority between 1 and 4),

  scheduled_date   date,
  scheduled_time   time,
  duration_minutes integer check (duration_minutes is null or duration_minutes > 0),
  deadline_at      date,
  is_all_day       boolean not null default true,
  timezone         text not null default 'America/Sao_Paulo',

  -- Ordem manual dentro do escopo (seção, projeto ou caixa de entrada).
  position         integer not null default 0,

  series_id        uuid,

  completed_at     timestamptz,
  cancelled_at     timestamptz,
  archived_at      timestamptz,

  -- Origem da tarefa: manual, lançamento rápido, recorrência, ou outro módulo.
  source           text not null default 'manual'
                     check (source in ('manual','rapido','recorrencia','agenda','estudos','financeiro','habitos','importacao')),
  -- Referência livre à entidade de origem (id do curso, da fatura, do evento…).
  external_reference text,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  -- Uma tarefa não pode ser a própria mãe.
  constraint todo_tasks_parent_not_self check (parent_task_id is null or parent_task_id <> id)
);

alter table public.todo_tasks enable row level security;
alter table public.todo_tasks force row level security;

drop policy if exists "own rows" on public.todo_tasks;
create policy "own rows" on public.todo_tasks
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Índices das consultas frequentes (ver "BANCO DE DADOS E SUPABASE" no doc da fase).
create index if not exists todo_tasks_user_idx
  on public.todo_tasks (user_id);
create index if not exists todo_tasks_user_status_idx
  on public.todo_tasks (user_id, status);
create index if not exists todo_tasks_user_scheduled_idx
  on public.todo_tasks (user_id, scheduled_date);
create index if not exists todo_tasks_user_deadline_idx
  on public.todo_tasks (user_id, deadline_at);
create index if not exists todo_tasks_user_project_idx
  on public.todo_tasks (user_id, project_id);
create index if not exists todo_tasks_project_section_pos_idx
  on public.todo_tasks (project_id, section_id, position);
create index if not exists todo_tasks_parent_idx
  on public.todo_tasks (parent_task_id);
create index if not exists todo_tasks_user_priority_idx
  on public.todo_tasks (user_id, priority);
create index if not exists todo_tasks_user_completed_idx
  on public.todo_tasks (user_id, completed_at);
create index if not exists todo_tasks_series_idx
  on public.todo_tasks (series_id);

drop trigger if exists set_todo_tasks_updated_at on public.todo_tasks;
create trigger set_todo_tasks_updated_at
  before update on public.todo_tasks
  for each row execute function public.set_updated_at();
