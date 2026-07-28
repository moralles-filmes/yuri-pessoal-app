-- Fase 15 (iteração) — Liga a sincronização TO-DO → Google Agenda.
--
-- CORREÇÃO DE PREMISSA: o cabeçalho de `20260728101200_todo_calendar_sync.sql` afirma
-- que faltava escopo OAuth de escrita. Isso está ERRADO — a Fase 08 já pede
-- `https://www.googleapis.com/auth/calendar.events` (leitura E escrita) e já cria,
-- atualiza e exclui eventos a partir de `calendar_events`. A tabela de ponte deixa de
-- ser "só modelagem" e passa a ser usada de verdade. Os comentários abaixo passam a ser
-- a documentação corrente do schema.
--
-- A sincronização é OPT-IN: só acontece se `google_integrations.todo_sync_enabled`
-- estiver ligada. Sem isso, nada é enviado — nenhuma tarefa vaza para o calendário
-- sem o usuário pedir.
--
-- Idempotente.

alter table public.google_integrations
  add column if not exists todo_sync_enabled boolean not null default false;

comment on column public.google_integrations.todo_sync_enabled is
  'Quando true, tarefas do TO-DO com data programada viram eventos no Google Agenda.';

comment on table public.todo_calendar_sync is
  'Ponte de idempotência entre uma tarefa do TO-DO e o evento correspondente no provedor. Uma linha por (task_id, provider); external_event_id é único por usuário+provedor para que duas tarefas nunca reivindiquem o mesmo evento.';

comment on column public.todo_calendar_sync.external_event_id is
  'Id do evento no provedor (Google). NULL enquanto o evento ainda não foi criado.';

comment on column public.todo_calendar_sync.sync_status is
  'pendente | sincronizado | erro | desativado. "erro" guarda a causa em last_error (sem tokens nem dados sensíveis).';
