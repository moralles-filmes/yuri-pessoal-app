-- Fase 09 — Demandas, Tarefas & Rotinas
-- Adiciona a FK que a Fase 08 deixou preparada: `calendar_events.task_id` → `tasks(id)`.
-- A coluna já existe (sem FK); aqui a vinculamos com ON DELETE SET NULL (excluir a
-- tarefa não apaga o evento — apenas desfaz o vínculo). Idempotente (via DO block,
-- pois `add constraint if not exists` não existe no Postgres).

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'calendar_events_task_id_fkey'
  ) then
    alter table public.calendar_events
      add constraint calendar_events_task_id_fkey
      foreign key (task_id) references public.tasks(id) on delete set null;
  end if;
end $$;

create index if not exists calendar_events_task_id_idx
  on public.calendar_events (task_id)
  where task_id is not null;
