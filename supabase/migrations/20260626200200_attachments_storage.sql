-- Fase 14 — Bucket de Storage PRIVADO para anexos genéricos + policies por usuário.
-- Cada usuário só acessa a própria pasta: o caminho é '{user_id}/...', então a 1ª
-- pasta do objeto precisa ser igual ao auth.uid(). Idempotente. Mesmo padrão de
-- `task-attachments` (Fase 09).

insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do nothing;

-- RLS de storage.objects (já habilitada por padrão no Supabase).
drop policy if exists "attachments own folder" on storage.objects;
create policy "attachments own folder" on storage.objects
  for all
  to authenticated
  using (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  )
  with check (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );
