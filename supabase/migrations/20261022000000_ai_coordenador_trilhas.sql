-- ============================================================================================
-- Chat livre com coordenador e especialistas — as TRILHAS de um run.
--
-- Até aqui um run tinha UMA tentativa aberta por vez: `ai_usage_events_one_active_uidx` era
-- `UNIQUE (run_id) WHERE status = 'started'`. Com o coordenador acionando especialistas em
-- paralelo dentro do mesmo run, a segunda chamada simultânea daria `23505` em runtime — e nenhum
-- teste de unidade pega isso, porque a trava é do banco. A trava passa a ser por TRILHA:
--   0      = o coordenador (decisão e síntese);
--   1..6   = um especialista, na ordem do acionamento. Definida pelo SERVIDOR, nunca pelo modelo.
--
-- `attempt_index` continua `UNIQUE (run_id, attempt_index)`, alocado por um contador do run
-- (como o `step_index`, invariante 18), e `attempt_index 1 ⇒ PRIMARY` continua valendo: a
-- primeira chamada do run é sempre a decisão do coordenador.
--
-- COMPATÍVEL COM A MAIN: a coluna nasce `default 0`, e o código atual nunca a envia — toda linha
-- dele cai na trilha 0, onde a trava nova é exatamente a antiga. As duas colunas nulas novas não
-- são lidas por ninguém hoje, e o tipo ESPECIALISTA só alarga o CHECK.
--
-- Nada de dado é escrito: linha antiga fica com trilha 0 (verdade: era o único caminho) e com
-- `prompt_version`/`agent_id` NULOS — nulo não é preenchido com chute.
--
-- ROLLBACK: reverter o CÓDIGO e deixar esta migration como está. Colunas, índice e CHECKs novos
-- são inofensivos para o código antigo. Recriar o índice antigo `(run_id) WHERE started` ou o
-- CHECK antigo de `attempt_type` falharia assim que existisse linha com trilha > 0 ou
-- ESPECIALISTA — não tente.
-- ============================================================================================

-- 1. A trilha da tentativa.
alter table public.ai_usage_events add column if not exists trilha smallint not null default 0;

alter table public.ai_usage_events drop constraint if exists ai_usage_events_trilha_check;
alter table public.ai_usage_events
  add constraint ai_usage_events_trilha_check check (trilha between 0 and 6);

comment on column public.ai_usage_events.trilha is
  '0 = coordenador; 1..6 = especialista na ordem do acionamento; definida pelo servidor. '
  'Uma tentativa aberta (started) por (run_id, trilha).';

-- 2. Uma tentativa aberta por TRILHA, não mais por run.
drop index if exists public.ai_usage_events_one_active_uidx;
create unique index if not exists ai_usage_events_one_active_per_trilha_uidx
  on public.ai_usage_events (run_id, trilha)
  where status = 'started';

-- 3. O tipo da primeira chamada de um especialista.
alter table public.ai_usage_events drop constraint if exists ai_usage_events_attempt_type_check;
alter table public.ai_usage_events
  add constraint ai_usage_events_attempt_type_check
  check (attempt_type in ('PRIMARY', 'RETRY', 'FALLBACK', 'TOOL_STEP', 'ESPECIALISTA'));

-- 3b. O tipo é COERENTE com a trilha, no banco e não só no servidor: PRIMARY é a primeira chamada
--     do coordenador (decisão ou síntese), então mora na trilha 0; ESPECIALISTA é a primeira de um
--     especialista, então nunca mora nela. RETRY/FALLBACK/TOOL_STEP existem nas duas.
alter table public.ai_usage_events drop constraint if exists ai_usage_events_tipo_coerente_com_trilha;
alter table public.ai_usage_events
  add constraint ai_usage_events_tipo_coerente_com_trilha
  check ((attempt_type <> 'PRIMARY' or trilha = 0) and (attempt_type <> 'ESPECIALISTA' or trilha > 0));

-- 4. A versão de prompt POR TENTATIVA. `ai_runs.prompt_version` passa a contar só o coordenador;
--    sem esta coluna nada registraria qual versão do especialista leu ou propôs (invariante 105).
alter table public.ai_usage_events add column if not exists prompt_version text;

alter table public.ai_usage_events drop constraint if exists ai_usage_events_prompt_version_check;
alter table public.ai_usage_events
  add constraint ai_usage_events_prompt_version_check
  check (prompt_version is null or char_length(prompt_version) between 1 and 200);

comment on column public.ai_usage_events.prompt_version is
  'Versão do prompt do agente que fez esta chamada (coordenador ou especialista). Nula em linhas '
  'anteriores ao coordenador.';

-- 5. QUAL agente pediu a ferramenta. `body.*` é compartilhada por Treinos e Dieta; sem isto não
--    dá para dizer qual especialista leu o quê. Linha antiga fica nula.
alter table public.ai_tool_calls add column if not exists agent_id text;

alter table public.ai_tool_calls drop constraint if exists ai_tool_calls_agent_id_check;
alter table public.ai_tool_calls
  add constraint ai_tool_calls_agent_id_check
  check (agent_id is null or char_length(agent_id) between 1 and 60);

comment on column public.ai_tool_calls.agent_id is
  'Agente que pediu a chamada (especialista, ou o coordenador no acionamento). Nula em linhas '
  'anteriores ao coordenador — nunca preenchida por dedução.';
