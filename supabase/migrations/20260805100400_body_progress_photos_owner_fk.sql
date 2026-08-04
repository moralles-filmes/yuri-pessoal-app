-- Fase 16-E — A foto de evolução e o seu anexo TÊM DE SER DO MESMO DONO.
--
-- ══ POR QUE ESTA MIGRATION EXISTE ══
-- Encontrado durante o teste de isolamento pela role `authenticated` (não como `postgres`,
-- que ignoraria a RLS e não provaria nada).
--
-- A RLS sozinha permitia a linha `body_progress_photos(user_id = B, attachment_id = <anexo
-- de A>)`: a policy confere o `user_id` da PRÓPRIA linha e nada sabe sobre o anexo apontado.
--
-- Na prática o vazamento não acontecia — a leitura junta `attachments`, cuja RLS bloqueia B,
-- e `getProgressPhotos` descarta foto sem arquivo. Mas depender do comportamento de um JOIN
-- para não vazar foto de corpo é fino demais para o dado mais sensível do sistema.
--
-- A FK COMPOSTA resolve no banco: o par (attachment_id, user_id) precisa existir em
-- `attachments`. Reivindicar anexo alheio deixa de ser improvável e passa a ser impossível.
--
-- Verificado depois de aplicada, como `authenticated`: a tentativa devolve 23503
-- (foreign_key_violation), inclusive quando o anexo alvo ainda não tem foto associada — caso
-- em que o unique de `attachment_id` não teria barrado nada.
--
-- Idempotente.

alter table public.attachments
  drop constraint if exists attachments_id_user_uk;
alter table public.attachments
  add constraint attachments_id_user_uk unique (id, user_id);

alter table public.body_progress_photos
  drop constraint if exists body_progress_photos_attachment_id_fkey;
alter table public.body_progress_photos
  drop constraint if exists body_progress_photos_attachment_owner_fkey;

alter table public.body_progress_photos
  add constraint body_progress_photos_attachment_owner_fkey
  foreign key (attachment_id, user_id)
  references public.attachments (id, user_id)
  on delete cascade;

comment on constraint body_progress_photos_attachment_owner_fkey on public.body_progress_photos is
  'A foto e o seu anexo sao do MESMO usuario. Impede reivindicar anexo alheio, sem depender do join da leitura.';