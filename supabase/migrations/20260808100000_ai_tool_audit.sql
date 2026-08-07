-- ══════════════════════════════════════════════════════════════════════════════════════
-- Fase 18-B — IA · Auditoria de leitura: passos do laço e chamadas de ferramenta.
--
-- POR QUE DUAS TABELAS, E NÃO UMA
--   Um PASSO é uma volta do laço (uma chamada ao modelo). Uma CHAMADA DE FERRAMENTA é uma
--   execução dentro de um passo, e um passo pode ter várias. Numa tabela só, cada linha
--   repetiria os dados do passo — e a contagem de passos viraria um `distinct`.
--
-- O QUE ESTAS TABELAS NÃO GUARDAM
--   O RESULTADO da ferramenta. Guardar o que foi devolvido seria uma segunda cópia dos dados
--   pessoais do usuário, dentro do módulo de IA, com prazo indefinido. Registramos o que foi
--   PEDIDO (argumentos sanitizados) e QUANTO voltou (`records_read`).
--
-- FK COMPOSTA em tudo que aponta para dentro do mesmo usuário (invariante 23 da 17-F): a RLS
-- confere o `user_id` da PRÓPRIA linha e não alcança a linha apontada.
--
-- Idempotente.
-- ══════════════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────── 1. ai_run_steps ───────────────────────────

create table if not exists public.ai_run_steps (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  run_id        uuid not null,

  -- Base 1, igual a `ai_usage_events.attempt_index` — não há razão para o passo ser 0-based
  -- enquanto a tentativa é 1-based; alinhar evita off-by-one em quem correlacionar "passo 2"
  -- com "tentativa 2" na tela de auditoria.
  step_index    integer not null check (step_index >= 1),
  kind          text not null check (kind in ('modelo','ferramentas')),
  status        text not null default 'started'
                  check (status in ('started','completed','failed','cancelled')),

  started_at    timestamptz not null default now(),
  completed_at  timestamptz,
  duration_ms   integer check (duration_ms is null or duration_ms >= 0),

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint ai_run_steps_terminal_has_completed_at
    check (status = 'started' or completed_at is not null)
);

create unique index if not exists ai_run_steps_id_user_uidx
  on public.ai_run_steps (id, user_id);
-- Alvo da FK composta de `ai_tool_calls`, que amarra step_id E run_id ao MESMO passo —
-- ver o comentário junto de `ai_tool_calls_step_owner_fk` mais abaixo.
create unique index if not exists ai_run_steps_id_run_user_uidx
  on public.ai_run_steps (id, run_id, user_id);
create unique index if not exists ai_run_steps_run_index_uidx
  on public.ai_run_steps (run_id, step_index, kind);
create index if not exists ai_run_steps_user_idx
  on public.ai_run_steps (user_id);
create index if not exists ai_run_steps_run_idx
  on public.ai_run_steps (run_id, step_index);

alter table public.ai_run_steps drop constraint if exists ai_run_steps_run_owner_fk;
alter table public.ai_run_steps
  add constraint ai_run_steps_run_owner_fk
  foreign key (run_id, user_id) references public.ai_runs (id, user_id)
  on delete cascade;

alter table public.ai_run_steps enable row level security;
alter table public.ai_run_steps force row level security;

drop policy if exists "ai_run_steps_select" on public.ai_run_steps;
create policy "ai_run_steps_select" on public.ai_run_steps
  for select using (user_id = auth.uid());
drop policy if exists "ai_run_steps_insert" on public.ai_run_steps;
create policy "ai_run_steps_insert" on public.ai_run_steps
  for insert with check (user_id = auth.uid());
-- Nome no espírito de `ai_usage_events_close_attempt` (18-A): a policy só existe para FECHAR
-- um passo `started`, nunca para reabrir ou reescrever um terminal.
drop policy if exists "ai_run_steps_close_step" on public.ai_run_steps;
create policy "ai_run_steps_close_step" on public.ai_run_steps
  for update using (user_id = auth.uid() and status = 'started')
  with check (user_id = auth.uid());

-- Sem policy de DELETE: passo registrado é histórico. Some junto com o run, por cascade.

drop trigger if exists set_ai_run_steps_updated_at on public.ai_run_steps;
create trigger set_ai_run_steps_updated_at
  before update on public.ai_run_steps
  for each row execute function public.set_updated_at();

comment on table public.ai_run_steps is
  'Fase 18-B. Uma volta do laço de ferramentas. Passo terminal é imutável (a policy de UPDATE exige status started).';

-- ─────────────────────────── 2. ai_tool_calls ───────────────────────────

create table if not exists public.ai_tool_calls (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users(id) on delete cascade,
  run_id               uuid not null,
  step_id              uuid not null,

  tool_name            text not null,
  tool_version         text not null,
  provider_call_id     text,

  -- Já passou por `security/redact.ts`. NUNCA o resultado — só o que foi PEDIDO.
  arguments_sanitized  jsonb not null default '{}'::jsonb,

  status               text not null
                         check (status in ('executada','rejeitada','falhou','timeout')),
  -- Preenchido só quando status <> 'executada'. Vocabulário EXATO de
  -- `ToolRejectionReason` em `src/lib/ai/tools/guard.ts` — as duas listas têm de concordar.
  rejection_reason     text
                         check (rejection_reason is null or rejection_reason in (
                           'TOOL_UNKNOWN','TOOL_NOT_ALLOWED_FOR_AGENT','TOOL_INCOHERENT',
                           'TOOL_WRITE_DISABLED','TOOL_PERMISSION_DENIED','TOOL_INVALID_INPUT',
                           'TOOL_TIMEOUT','TOOL_FAILED')),

  records_read         integer check (records_read is null or records_read >= 0),
  duration_ms          integer check (duration_ms is null or duration_ms >= 0),
  -- Referências aos registros lidos, para o "Ver dados usados". Só tipo, id e rota interna.
  refs                 jsonb not null default '[]'::jsonb,

  created_at           timestamptz not null default now(),

  constraint ai_tool_calls_rejection_requires_reason
    check (status = 'executada' or rejection_reason is not null),
  constraint ai_tool_calls_executed_has_no_reason
    check (status <> 'executada' or rejection_reason is null),
  -- Mesma disciplina de `ai_usage_events_availability_is_object` (18-A): o shape do jsonb
  -- é parte do contrato, não confiança na disciplina de quem grava.
  constraint ai_tool_calls_arguments_is_object
    check (jsonb_typeof(arguments_sanitized) = 'object'),
  constraint ai_tool_calls_refs_is_array
    check (jsonb_typeof(refs) = 'array')
);

create unique index if not exists ai_tool_calls_id_user_uidx
  on public.ai_tool_calls (id, user_id);
create index if not exists ai_tool_calls_user_idx
  on public.ai_tool_calls (user_id);
create index if not exists ai_tool_calls_run_idx
  on public.ai_tool_calls (run_id, created_at);
create index if not exists ai_tool_calls_step_idx
  on public.ai_tool_calls (step_id);
-- Para a tela de auditoria: "o que foi rejeitado, e por quê".
create index if not exists ai_tool_calls_rejected_idx
  on public.ai_tool_calls (user_id, created_at desc)
  where status <> 'executada';

alter table public.ai_tool_calls drop constraint if exists ai_tool_calls_run_owner_fk;
alter table public.ai_tool_calls
  add constraint ai_tool_calls_run_owner_fk
  foreign key (run_id, user_id) references public.ai_runs (id, user_id)
  on delete cascade;

-- ⚠️ NÃO É SÓ "(step_id, user_id)". Duas FKs compostas independentes — uma para `run_id`,
-- outra para `step_id` — não impedem que a linha grave um `run_id` e um `step_id` de PASSOS
-- DIFERENTES (ex.: run A com o step de um run B do mesmo usuário). Como a tabela é imutável
-- e de auditoria, essa divergência não tem correção depois de gravada. A FK carrega também
-- `run_id`, contra o índice único `(id, run_id, user_id)` de `ai_run_steps`: o banco só aceita
-- a linha se o passo referenciado pertencer AO MESMO run — e a leitura por `run_id` continua
-- direta, sem join extra.
alter table public.ai_tool_calls drop constraint if exists ai_tool_calls_step_owner_fk;
alter table public.ai_tool_calls
  add constraint ai_tool_calls_step_owner_fk
  foreign key (step_id, run_id, user_id) references public.ai_run_steps (id, run_id, user_id)
  on delete cascade;

alter table public.ai_tool_calls enable row level security;
alter table public.ai_tool_calls force row level security;

drop policy if exists "ai_tool_calls_select" on public.ai_tool_calls;
create policy "ai_tool_calls_select" on public.ai_tool_calls
  for select using (user_id = auth.uid());
drop policy if exists "ai_tool_calls_insert" on public.ai_tool_calls;
create policy "ai_tool_calls_insert" on public.ai_tool_calls
  for insert with check (user_id = auth.uid());

-- Sem UPDATE e sem DELETE: a linha nasce completa e é imutável. Auditoria que se reescreve
-- não é auditoria.

comment on table public.ai_tool_calls is
  'Fase 18-B. Uma execução (ou rejeição) de ferramenta. Guarda o que foi PEDIDO, nunca o que foi devolvido. Imutável: sem policy de UPDATE nem de DELETE.';
comment on column public.ai_tool_calls.refs is
  'Referências [{tipo,id,rota}] aos registros lidos, para o "Ver dados usados". Rota interna, nunca URL externa.';

-- ─────────────────────────── 3. attempt_type += TOOL_STEP ───────────────────────────
--
-- Um passo do laço é uma NOVA chamada paga ao provedor, e não é PRIMARY, nem RETRY, nem
-- FALLBACK. Sem este valor, ou se grava mentira (e o painel de consumo passa a relatar
-- retries que nunca houve), ou o INSERT estoura SÓ EM RUNTIME.
--
-- ⚠️ HABILITAR TOOL_STEP NÃO RELAXA `ai_usage_events_one_active_uidx` (18-A):
--     UNIQUE (run_id) WHERE status = 'started'
-- Continua havendo, por desenho, NO MÁXIMO uma tentativa `started` por run a qualquer
-- momento. Quem escrever o laço de ferramentas TEM de fechar a tentativa do passo N
-- (`completed`/`failed`/`cancelled`) ANTES de inserir a tentativa TOOL_STEP do passo N+1 —
-- inserir a próxima com a anterior ainda `started` estoura `23505` só em runtime, no meio
-- de uma conversa em produção.

alter table public.ai_usage_events
  drop constraint if exists ai_usage_events_attempt_type_check;
alter table public.ai_usage_events
  add constraint ai_usage_events_attempt_type_check
  check (attempt_type in ('PRIMARY','RETRY','FALLBACK','TOOL_STEP'));

comment on column public.ai_usage_events.attempt_type is
  'PRIMARY|RETRY|FALLBACK|TOOL_STEP. TOOL_STEP (18-B) é a chamada ao modelo que continua o laço depois de uma ferramenta.';

-- ─────────────────────────── 4. As cinco flags que faltavam ───────────────────────────
--
-- A 18-A criou allow_finance, allow_nutrition, allow_training, allow_body e
-- allow_cross_module. Faltam os cinco módulos restantes. Todas nascem DESLIGADAS.

alter table public.ai_user_preferences
  add column if not exists allow_todo     boolean not null default false,
  add column if not exists allow_calendar boolean not null default false,
  add column if not exists allow_tasks    boolean not null default false,
  add column if not exists allow_habits   boolean not null default false,
  add column if not exists allow_studies  boolean not null default false;

comment on column public.ai_user_preferences.allow_tasks is
  'Rotinas e tarefas legadas (/tarefas, /rotinas). O TO-DO tem a sua própria: allow_todo.';

-- ─────────────────────────── 5. A lista de agentes aceitos pelo RPC ───────────────────
--
-- ⚠️ ACHADO QUE BLOQUEIA A SUBFASE INTEIRA.
--
-- `ai_begin_chat_run` (18-A, linha 242) tem a checagem:
--     if p_agent_id is distinct from 'assistente-pessoal' then raise 'AI_AGENT_NOT_ALLOWED'
--
-- Ou seja: sem esta alteração, TODA mensagem roteada para o agente de Treinos morre na
-- ADMISSÃO — e o erro só aparece em runtime, depois de todo o código de ferramenta pronto.
--
-- A duplicação da lista (aqui e em `agents/registry.ts`) é PROPOSITAL, e é da 18-A: o RPC
-- pode ser chamado direto por um usuário autenticado, sem passar pelo Route Handler, então
-- ele valida por conta própria. O que fazemos aqui é tirar a lista de dentro do corpo da
-- função e pôr numa função própria — assim cada subfase nova altera 4 linhas, em vez de
-- reescrever `ai_begin_chat_run` inteira. Um teste confere que as duas listas concordam.

create or replace function public.ai_agent_is_allowed(p_agent_id text)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select p_agent_id in ('assistente-pessoal', 'treinos');
$$;

revoke all on function public.ai_agent_is_allowed(text) from public;
revoke all on function public.ai_agent_is_allowed(text) from anon;
grant execute on function public.ai_agent_is_allowed(text) to authenticated;

comment on function public.ai_agent_is_allowed(text) is
  'Agentes aceitos pelo RPC de admissão. Espelha src/lib/ai/agents/registry.ts DE PROPÓSITO: o RPC pode ser chamado direto, sem o Route Handler. Há teste conferindo que as duas listas concordam.';
