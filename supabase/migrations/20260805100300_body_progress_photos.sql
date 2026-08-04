-- Fase 16-E — Módulo central de medidas corporais · FOTOS DE EVOLUÇÃO
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════╗
-- ║ ⛔ ESTE É O DADO MAIS SENSÍVEL DO SISTEMA INTEIRO.                                     ║
-- ║ Uma foto de evolução corporal vazada não tem desfazer. Não existe URL pública, não    ║
-- ║ existe link compartilhável e não existe nome de arquivo previsível.                   ║
-- ╚══════════════════════════════════════════════════════════════════════════════════════╝
--
-- ══ NENHUM SEGUNDO MECANISMO DE UPLOAD ══
-- O binário NÃO mora aqui. Ele vive no bucket PRIVADO `attachments` (Fase 14), no caminho
-- '{user_id}/body_progress_photo/{id}/{nome-aleatório}', e o metadado do arquivo fica na
-- tabela genérica `attachments` — a mesma que a foto de receita (16-C) já usa. Esta tabela
-- guarda só o que é específico de evolução corporal: quando, de que ângulo, com que peso.
--
-- A policy de `storage.objects` que protege o arquivo já existe desde a Fase 14
-- (20260626200200_attachments_storage.sql): a 1ª pasta do objeto precisa ser igual ao
-- `auth.uid()`. Um usuário não alcança a pasta do outro nem sabendo o caminho.
--
-- ══ COMO A FOTO É LIDA ══
-- Só por URL ASSINADA DE VIDA CURTA, gerada no servidor a cada leitura
-- (`createSignedUrl`, 5 min — mais curto que os 10 min dos anexos de tarefa, porque aqui o
-- dano de um link que escapa é maior). Nenhuma URL é persistida em lugar nenhum, e a
-- comparação "antes × depois" assina as duas na hora.
--
-- ══ NO BACKUP JSON ══
-- Sai o METADADO, nunca o binário — e a tela diz isso ao usuário em vez de fingir que o
-- backup é completo.
--
-- Idempotente. RLS + FORCE RLS, índice em user_id e trigger de updated_at.

create table if not exists public.body_progress_photos (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  -- Cascade: apagar o anexo apaga o registro da foto. O caminho inverso (apagar a foto
  -- remove o arquivo do Storage) fica com a action, que não tem como ser um trigger.
  attachment_id  uuid not null references public.attachments(id) on delete cascade,
  -- DATA PURA do dia retratado — pode ser anterior ao dia do upload.
  taken_on       date not null,
  angle          text not null default 'frontal'
                   check (angle in ('frontal', 'lateral_esquerda', 'lateral_direita', 'traseira', 'outro')),
  -- Peso do dia, opcional. Referência de contexto da foto; o histórico continua sendo
  -- body_measurements (jamais duas fontes de peso).
  weight_kg      numeric(10,3) check (weight_kg is null or weight_kg >= 0),
  note           text,
  position       integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table public.body_progress_photos is
  'Fotos privadas de evolucao. O binario vive no bucket PRIVADO attachments ({user_id}/...), lido so por URL assinada de vida curta. Nunca URL publica, nunca link compartilhavel.';
comment on column public.body_progress_photos.weight_kg is
  'Peso do dia como CONTEXTO da foto. O historico de peso continua sendo body_measurements.';

alter table public.body_progress_photos enable row level security;
alter table public.body_progress_photos force row level security;

drop policy if exists "own rows" on public.body_progress_photos;
create policy "own rows" on public.body_progress_photos
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists body_progress_photos_user_idx
  on public.body_progress_photos (user_id);
create index if not exists body_progress_photos_user_date_idx
  on public.body_progress_photos (user_id, taken_on desc);

-- Um anexo pertence a uma foto só: sem isto, dois registros poderiam reivindicar o mesmo
-- arquivo e excluir um deixaria o outro apontando para o vazio.
create unique index if not exists body_progress_photos_attachment_uidx
  on public.body_progress_photos (attachment_id);

drop trigger if exists set_body_progress_photos_updated_at on public.body_progress_photos;
create trigger set_body_progress_photos_updated_at
  before update on public.body_progress_photos
  for each row execute function public.set_updated_at();
