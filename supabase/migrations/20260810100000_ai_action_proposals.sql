-- ══════════════════════════════════════════════════════════════════════════════════════
-- Fase 18-C · Bloco 3 — IA · `ai_action_proposals`: o que a IA QUER fazer.
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════╗
-- ║ ESTA TABELA NÃO É UMA AÇÃO. É UMA INTENÇÃO.                                           ║
-- ║                                                                                       ║
-- ║ A ferramenta de escrita, DENTRO do run, valida a entrada, resolve as entidades,        ║
-- ║ calcula a previsão do efeito e grava uma linha aqui. Nada é escrito em nenhum módulo   ║
-- ║ do usuário. O modelo recebe de volta "proposta {id} criada, aguardando confirmação".   ║
-- ║                                                                                       ║
-- ║ Quem executa é uma Server Action comum, FORA do run — e é por isso que "cancelar o     ║
-- ║ streaming não desfaz ação confirmada" é verdadeiro por construção, e não uma checagem  ║
-- ║ que alguém pode esquecer de escrever.                                                  ║
-- ╚══════════════════════════════════════════════════════════════════════════════════════╝
--
-- IMUTÁVEL: sem policy de UPDATE e sem policy de DELETE, no espírito de `ai_tool_calls`
-- (18-B). Uma proposta não muda — quem muda é o mundo, e é exatamente disso que a
-- revalidação por recálculo do hash protege.
--
-- ⚠️ NÃO EXISTE COLUNA `status` AQUI, E ISSO É DESENHO.
--    "Pendente", "confirmada", "recusada", "expirada", "executada" são todos DERIVÁVEIS de
--    fatos que já moram em outro lugar (`expires_at`, a linha de `ai_action_approvals`, a
--    linha de `ai_action_executions`). Gravar o estado criaria uma segunda verdade que
--    diverge da primeira no primeiro erro de transição — o mesmo motivo pelo qual
--    `tasks.status='atrasada'`, a fatura de cartão e `training_scheduled_workouts.status`
--    nunca gravam estado derivado neste projeto.
--
-- Idempotente.
-- ══════════════════════════════════════════════════════════════════════════════════════

-- ─────────── Pré-requisito: o alvo da FK que amarra a tool call AO MESMO RUN ───────────
--
-- Mesma correção de `ai_tool_calls_step_owner_fk` (18-B): duas FKs compostas independentes
-- — uma para `run_id`, outra para `tool_call_id` — não impedem a linha de gravar um `run_id`
-- e uma tool call de RUNS DIFERENTES do mesmo usuário. Como a proposta é imutável, essa
-- divergência não teria correção depois de gravada.
create unique index if not exists ai_tool_calls_id_run_user_uidx
  on public.ai_tool_calls (id, run_id, user_id);

-- Idem para a conversa: `ai_runs` já guarda `conversation_id`, e a proposta precisa provar
-- que o run que a originou pertence À CONVERSA que ela declara.
create unique index if not exists ai_runs_id_conversation_user_uidx
  on public.ai_runs (id, conversation_id, user_id);

-- ─────────────────────────── A tabela ───────────────────────────

create table if not exists public.ai_action_proposals (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,

  -- O VÍNCULO (§3.4 do design): usuário · conversa · run · tool call. Uma proposta sempre
  -- nasce de uma chamada de ferramenta, e as FKs abaixo provam isso — não é convenção.
  conversation_id    uuid not null,
  run_id             uuid not null,
  tool_call_id       uuid not null,

  tool_name          text not null,
  tool_version       text not null,
  -- O command que executará. Estático em código; aqui é registro, não despacho por texto:
  -- o Action Executor resolve o command num mapa fechado e recusa nome desconhecido.
  command            text not null,
  module             text not null,
  -- Escala do CÓDIGO (§3.1): 1 = leitura, 5 = não permitida. Proposta é sempre escrita,
  -- então 2..4. O CHECK recusa 1 (leitura não propõe) e 5 (não existe descriptor).
  risk               integer not null check (risk between 2 and 4),

  -- A entrada JÁ VALIDADA e normalizada pelo Zod `.strict()` da ferramenta. Nunca o texto
  -- cru do modelo, nunca campo a mais: o que não está no schema não chegou até aqui.
  payload            jsonb not null default '{}'::jsonb,
  -- [{tipo,id,rota}] das entidades que a ferramenta RESOLVEU (a tarefa que será concluída,
  -- a conta que receberá o lançamento). Entra no hash: resolver para outro registro entre
  -- propor e confirmar é proposta diferente.
  resolved_entities  jsonb not null default '[]'::jsonb,
  -- A PREVISÃO DO EFEITO exibida na tela — o que o dono de fato leu antes de confirmar.
  -- Sem ela não há prova do que foi confirmado. Não é cópia do registro alvo: guarda o
  -- efeito previsto, em pt-BR e nos campos que a ação toca.
  preview            jsonb not null default '{}'::jsonb,

  -- sha256 hex da serialização canônica de {tool, versão, payload, entidades, previsão}.
  -- O formato é conferido no banco: hash truncado ou em maiúsculas nunca entra.
  effect_hash        text not null check (effect_hash ~ '^[0-9a-f]{64}$'),

  -- ⚠️ O PRAZO É DO BANCO, NÃO DO CÓDIGO. O servidor não envia esta coluna — se enviasse,
  -- um erro de aritmética de data (ou de fuso) viraria uma janela de confirmação de dias.
  -- `now()` do Postgres é UTC absoluto; o prazo não depende do `TZ` do processo Node.
  expires_at         timestamptz not null default (now() + interval '10 minutes'),

  created_at         timestamptz not null default now(),

  constraint ai_action_proposals_payload_is_object
    check (jsonb_typeof(payload) = 'object'),
  constraint ai_action_proposals_entities_is_array
    check (jsonb_typeof(resolved_entities) = 'array'),
  constraint ai_action_proposals_preview_is_object
    check (jsonb_typeof(preview) = 'object'),
  -- Teto do prazo, não só piso: mesmo que alguém passe a enviar a coluna, uma janela longa
  -- não entra. Confirmação antiga é replay, e replay de escrita é o risco desta subfase.
  constraint ai_action_proposals_prazo_curto
    check (expires_at > created_at and expires_at <= created_at + interval '1 hour')
);

-- Alvo das FKs de `ai_action_approvals`.
create unique index if not exists ai_action_proposals_id_user_uidx
  on public.ai_action_proposals (id, user_id);

-- ⚠️ O ÍNDICE QUE FAZ O BANCO RECUSAR CONFIRMAÇÃO COM HASH ERRADO.
-- `ai_action_approvals.confirmed_hash` aponta para cá junto com o id: uma confirmação cujo
-- hash não seja EXATAMENTE o da proposta é impossível de gravar, e não porque alguém se
-- lembrou de comparar em código. O Approval Engine compara antes e devolve pt-BR; isto é o
-- que sobra quando essa comparação for removida por engano.
create unique index if not exists ai_action_proposals_id_user_hash_uidx
  on public.ai_action_proposals (id, user_id, effect_hash);

create index if not exists ai_action_proposals_user_idx
  on public.ai_action_proposals (user_id);
create index if not exists ai_action_proposals_run_idx
  on public.ai_action_proposals (run_id, created_at);
create index if not exists ai_action_proposals_conversation_idx
  on public.ai_action_proposals (conversation_id, created_at desc);

alter table public.ai_action_proposals
  drop constraint if exists ai_action_proposals_run_owner_fk;
alter table public.ai_action_proposals
  add constraint ai_action_proposals_run_owner_fk
  foreign key (run_id, conversation_id, user_id)
  references public.ai_runs (id, conversation_id, user_id)
  on delete cascade;

alter table public.ai_action_proposals
  drop constraint if exists ai_action_proposals_tool_call_owner_fk;
alter table public.ai_action_proposals
  add constraint ai_action_proposals_tool_call_owner_fk
  foreign key (tool_call_id, run_id, user_id)
  references public.ai_tool_calls (id, run_id, user_id)
  on delete cascade;

alter table public.ai_action_proposals enable row level security;
alter table public.ai_action_proposals force row level security;

drop policy if exists "ai_action_proposals_select" on public.ai_action_proposals;
create policy "ai_action_proposals_select" on public.ai_action_proposals
  for select using (user_id = auth.uid());
drop policy if exists "ai_action_proposals_insert" on public.ai_action_proposals;
create policy "ai_action_proposals_insert" on public.ai_action_proposals
  for insert with check (user_id = auth.uid());

-- Sem UPDATE e sem DELETE: a linha nasce completa. Estender o prazo de uma proposta seria
-- estender a janela de replay de uma escrita já autorizada pelo modelo.

comment on table public.ai_action_proposals is
  'Fase 18-C. O que a IA QUER fazer. Criada dentro do run pela ferramenta de escrita; nada é escrito em módulo do usuário aqui. Imutável e sem coluna de status: pendente/confirmada/recusada/expirada/executada são todos DERIVADOS (expires_at + ai_action_approvals + ai_action_executions).';
comment on column public.ai_action_proposals.effect_hash is
  'sha256 hex da serialização canônica do EFEITO (tool, versão, payload, entidades resolvidas, previsão) — não dos argumentos do modelo. O Action Executor recalcula na hora de executar e recusa se divergir: entre propor e confirmar, quem muda é o mundo.';
comment on column public.ai_action_proposals.expires_at is
  'Default do BANCO (now() + 10 min). O servidor não envia esta coluna, e o CHECK limita a janela a 1 hora mesmo que passe a enviar.';
comment on column public.ai_action_proposals.preview is
  'A previsão do efeito EXIBIDA NA TELA — o que o dono leu antes de confirmar. Entra no hash. Não é cópia do registro alvo.';
