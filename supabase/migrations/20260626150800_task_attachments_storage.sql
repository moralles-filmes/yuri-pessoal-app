-- Fase 09 — Demandas, Tarefas & Rotinas
-- Bucket de Storage PRIVADO para anexos de tarefas + policies por usuário.
-- Cada usuário só acessa a própria pasta: o caminho é '{user_id}/...', então a
-- 1ª pasta do objeto precisa ser igual ao auth.uid(). Idempotente.

insert into storage.buckets (id, name, public)
values ('task-attachments', 'task-attachments', false)
on conflict (id) do nothing;

-- RLS de storage.objects (já habilitada por padrão no Supabase).
drop policy if exists "task attachments own folder" on storage.objects;
create policy "task attachments own folder" on storage.objects
  for all
  to authenticated
  using (
    bucket_id = 'task-attachments'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  )
  with check (
    bucket_id = 'task-attachments'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );
