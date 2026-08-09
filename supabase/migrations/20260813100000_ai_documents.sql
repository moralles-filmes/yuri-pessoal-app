-- Fase 18-D · Bloco 2 — O ARQUIVO DO DONO, e a chave que o deixa sair daqui.
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════╗
-- ║ `allow_vision` É A DÉCIMA CHAVE, E ELA NÃO É "MAIS UM MÓDULO".                        ║
-- ║                                                                                       ║
-- ║ As nove `allow_*` autorizam a IA a LER um módulo; as cinco `allow_write_*` autorizam  ║
-- ║ ALTERAR. Nenhuma das quatorze diz nada sobre o fato novo desta subfase: **um arquivo  ║
-- ║ do dono sai deste sistema para uma empresa fora dele, e não volta**.                   ║
-- ║                                                                                       ║
-- ║ Sem esta chave, o estado "a IA pode lançar minhas compras, mas nenhum arquivo meu     ║
-- ║ sai daqui" não seria representável — desligar o envio exigiria desligar o Financeiro  ║
-- ║ inteiro. Ela é ANDada no servidor com `allow_finance` e `allow_write_finance`.        ║
-- ╚══════════════════════════════════════════════════════════════════════════════════════╝
--
-- Idempotente. RLS + FORCE RLS, índice em user_id, trigger updated_at, FK COMPOSTA.

-- ─────────────────────────── A chave ───────────────────────────

alter table public.ai_user_preferences
  add column if not exists allow_vision boolean not null default false;

comment on column public.ai_user_preferences.allow_vision is
  'Fase 18-D. Autoriza o CONTEÚDO de um arquivo do dono a ser enviado ao provedor de IA. '
  'Nasce false. É verificada JUNTO com allow_finance e allow_write_finance, no servidor — '
  'nunca sozinha, e nunca só na tela. Desligá-la não apaga nada: impede novos envios.';

-- ─────────────────────────── O arquivo ───────────────────────────

create table if not exists public.ai_documents (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,

  -- ⛔ FK COMPOSTA. A RLS confere o user_id da PRÓPRIA linha e não alcança a linha
  -- apontada: sem os dois campos, um intruso poderia reivindicar o anexo de outro dono.
  -- Mesma correção da 16-E (fotos de evolução) e da 17-F (ponte da agenda).
  -- `attachments_id_user_uk` foi criada pela 20260805100400 e é o alvo desta FK.
  attachment_id  uuid not null,

  -- ⛔ O MIME REAL, decidido por `sniffMime` sobre os BYTES — nunca o `File.type`, que é
  -- declarado pelo cliente. O CHECK repete a allowlist de `vision/limits.ts` de propósito:
  -- o banco é a última linha, e um caminho novo que esqueça de validar esbarra aqui.
  mime_detectado text not null
                   check (mime_detectado in ('image/jpeg','image/png','image/webp','application/pdf')),

  -- Hash do conteúdo real, para a detecção de duplicidade. NÃO é único: reenviar um
  -- comprovante depois de descartá-lo é legítimo, e um índice único transformaria uma
  -- informação ("você já mandou este arquivo") numa recusa.
  content_sha256 text not null check (char_length(content_sha256) = 64),

  size_bytes     bigint not null check (size_bytes > 0),

  -- NULL = não medido. Nunca zero: `estimarTokensDoArquivo` trata NULL como "reserve o
  -- teto", e um zero aqui viraria uma reserva de custo zero para um arquivo real.
  largura_px     integer check (largura_px is null or largura_px > 0),
  altura_px      integer check (altura_px is null or altura_px > 0),
  paginas        integer check (paginas is null or paginas > 0),

  -- O que o dono escreveu ao enviar ("foi no PIX", "metade é do João"). Entra na extração
  -- como DADO NÃO CONFIÁVEL, exatamente como o conteúdo do arquivo — é texto de humano,
  -- não instrução de sistema.
  observacao     text check (observacao is null or char_length(observacao) <= 500),

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint ai_documents_attachment_fk
    foreign key (attachment_id, user_id)
    references public.attachments (id, user_id)
    on delete cascade
);

-- Um anexo é UM documento. Sem isto, dois envios poderiam apontar para o mesmo arquivo e
-- descartar um apagaria o arquivo do outro.
create unique index if not exists ai_documents_attachment_uidx
  on public.ai_documents (attachment_id);

create index if not exists ai_documents_user_idx
  on public.ai_documents (user_id);

-- A consulta da duplicidade por hash: "eu já mandei este arquivo?"
create index if not exists ai_documents_user_hash_idx
  on public.ai_documents (user_id, content_sha256);

-- A listagem da tela, do mais recente para o mais antigo.
create index if not exists ai_documents_user_created_idx
  on public.ai_documents (user_id, created_at desc);

alter table public.ai_documents enable row level security;
alter table public.ai_documents force row level security;

drop policy if exists "own rows" on public.ai_documents;
create policy "own rows" on public.ai_documents
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop trigger if exists set_ai_documents_updated_at on public.ai_documents;
create trigger set_ai_documents_updated_at
  before update on public.ai_documents
  for each row execute function public.set_updated_at();

comment on table public.ai_documents is
  'Fase 18-D. Um arquivo enviado pelo dono para leitura por IA. O ARQUIVO em si vive no '
  'bucket privado `attachments`, em {user_id}/ia_documento/..., e o caminho NÃO SAI DO '
  'SERVIDOR. Esta tabela guarda só o que a tela e a estimativa de custo precisam. '
  'Nada aqui é apagado por rotina: descartar é decisão do dono (18-D, decisão 5).';

comment on column public.ai_documents.content_sha256 is
  'SHA-256 do conteúdo REAL. Índice comum, nunca único: reenviar depois de descartar é '
  'legítimo. Duplicidade é informação para o dono decidir, não recusa.';
