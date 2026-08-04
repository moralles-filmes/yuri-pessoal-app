-- Fase 18-A — Inteligência Artificial · M1: a estrutura de dados inteira da subfase.
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════╗
-- ║ ESTA MIGRATION NÃO ALTERA NENHUMA TABELA EXISTENTE.                                   ║
-- ║ Nenhuma FK aponta de fora para dentro do conjunto `ai_*`. O rollback lógico é          ║
-- ║ `DROP TABLE` das 7, na ordem inversa — perde-se apenas o histórico de IA.              ║
-- ╚══════════════════════════════════════════════════════════════════════════════════════╝
--
-- ═══════════════════════ AS QUATRO DECISÕES QUE ESTA MIGRATION FIXA ═══════════════════════
--
-- 1. FK COMPOSTA `(x_id, user_id)` sempre que uma tabela apontar para outra dentro do mesmo
--    usuário. A RLS confere o `user_id` da PRÓPRIA linha e nada sabe sobre a linha APONTADA.
--    Sem a FK composta, um intruso ocupa uma chave única e impede o dono de usar o recurso —
--    exatamente o defeito achado na 16-E (fotos) e na 17-F (ponte da agenda).
--
-- 2. AUSÊNCIA NUNCA É ZERO. `estimated_cost`, `input_tokens` e `output_tokens` são NULOS
--    quando o provedor não informa. `usage_availability` registra o que faltou. Em nenhum
--    caminho um NULL vira 0 — a mesma disciplina do `value_state` da Dieta (16-A).
--
-- 3. MOEDA CANÔNICA USD, sem câmbio nesta subfase. Os quatro provedores publicam em USD;
--    converter exigiria fonte de taxa, snapshot e versão — uma segunda fonte de verdade
--    inteira para um número que NÃO é cobrança oficial. O BRL do projeto continua sendo do
--    módulo financeiro: custo de IA não é transação do usuário.
--
-- 4. SEM TIPO ENUM. `text` + `CHECK`, como no resto do projeto: evolui sem `ALTER TYPE`.
--
-- ═══════════════════════ APPEND-ONLY DE `ai_usage_events`, COM PRECISÃO ═══════════════════
--
-- A tentativa nasce `started` ANTES da chamada ao provedor e fecha em
-- `completed|failed|cancelled`. Ou seja: ela PRECISA de UPDATE — o que não pode existir é
-- reescrita de linha TERMINAL (retificação de uso tardio é proibida na 18-A, pela mesma
-- disciplina do snapshot da 16-B e da sessão da 17-C).
--
-- Por isso a policy de UPDATE existe, mas com `using (... and status = 'started')`: o banco
-- recusa qualquer escrita numa tentativa já encerrada. Não existe policy de DELETE.
--
-- Idempotente.

-- ══════════════════════════════════════════════════════════════════════════════════════
-- 1. ai_provider_configs — configuração por usuário × provedor
-- ══════════════════════════════════════════════════════════════════════════════════════
--
-- SEM `base_url`. Endpoint oficial fica no adapter. Permitir URL arbitrária abriria SSRF,
-- envio da chave para domínio malicioso, vazamento de prompt e redirect inesperado.

create table if not exists public.ai_provider_configs (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,

  provider           text not null check (provider in ('openai','gemini','anthropic','xai')),
  enabled            boolean not null default false,
  display_name       text,

  -- Preferências de modelo. Todas são PREFERÊNCIA: o servidor valida contra o catálogo
  -- estático antes de qualquer chamada, e o valor final é o que ele validou.
  default_model      text,
  economy_model      text,
  advanced_model     text,
  vision_model       text,

  timeout_ms         integer not null default 60000
                       check (timeout_ms between 1000 and 300000),
  max_retries        integer not null default 1 check (max_retries between 0 and 3),

  -- Limites em USD. NULO = "sem limite próprio deste provedor" (o limite do usuário,
  -- em ai_user_preferences, continua valendo). NULO nunca é lido como zero.
  daily_limit        numeric(12,6) check (daily_limit is null or daily_limit >= 0),
  monthly_limit      numeric(12,6) check (monthly_limit is null or monthly_limit >= 0),

  -- Fallback nasce DESLIGADO: gastar dinheiro em outro provedor é decisão do usuário.
  fallback_allowed   boolean not null default false,
  fallback_order     text[] not null default '{}'::text[],

  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create unique index if not exists ai_provider_configs_user_provider_uidx
  on public.ai_provider_configs (user_id, provider);
create index if not exists ai_provider_configs_user_idx
  on public.ai_provider_configs (user_id);

alter table public.ai_provider_configs enable row level security;
alter table public.ai_provider_configs force row level security;

drop policy if exists "ai_provider_configs_select" on public.ai_provider_configs;
create policy "ai_provider_configs_select" on public.ai_provider_configs
  for select using (user_id = auth.uid());
drop policy if exists "ai_provider_configs_insert" on public.ai_provider_configs;
create policy "ai_provider_configs_insert" on public.ai_provider_configs
  for insert with check (user_id = auth.uid());
drop policy if exists "ai_provider_configs_update" on public.ai_provider_configs;
create policy "ai_provider_configs_update" on public.ai_provider_configs
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "ai_provider_configs_delete" on public.ai_provider_configs;
create policy "ai_provider_configs_delete" on public.ai_provider_configs
  for delete using (user_id = auth.uid());

drop trigger if exists set_ai_provider_configs_updated_at on public.ai_provider_configs;
create trigger set_ai_provider_configs_updated_at
  before update on public.ai_provider_configs
  for each row execute function public.set_updated_at();

comment on table public.ai_provider_configs is
  'Configuração de IA por usuário × provedor (18-A). SEM base_url: endpoint arbitrário abriria SSRF e exfiltração de chave.';
comment on column public.ai_provider_configs.fallback_allowed is
  'Nasce FALSE. Fallback gasta dinheiro em outro provedor — é escolha explícita, nunca padrão.';

-- ══════════════════════════════════════════════════════════════════════════════════════
-- 2. ai_provider_credentials — SÓ material criptográfico
-- ══════════════════════════════════════════════════════════════════════════════════════
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════╗
-- ║ RLS NÃO SUBSTITUI CRIPTOGRAFIA. A chave de API do usuário nunca é gravada em claro:   ║
-- ║ envelope AES-256-GCM (DEK por credencial, embrulhada pela master key do ambiente).    ║
-- ║ A master key NÃO está aqui e nunca estará — ela vive só em variável de ambiente.      ║
-- ║ Quem consegue ler esta tabela inteira NÃO consegue decifrar nada.                     ║
-- ╚══════════════════════════════════════════════════════════════════════════════════════╝
--
-- `id` é gerado NO SERVIDOR antes de cifrar, porque entra no AAD junto com dono, provedor e
-- versão da chave. É isso que faz um ciphertext movido para outra linha, outro provedor ou
-- outro dono FALHAR na verificação, em vez de decifrar em silêncio.

create table if not exists public.ai_provider_credentials (
  id                 uuid primary key,
  user_id            uuid not null references auth.users(id) on delete cascade,
  provider           text not null check (provider in ('openai','gemini','anthropic','xai')),

  -- Camada 1 do envelope: o segredo cifrado pela DEK.
  ciphertext         text not null,
  iv                 text not null,
  auth_tag           text not null,

  -- Camada 2: a DEK cifrada pela master key da versão `key_version`.
  wrapped_dek        text not null,
  dek_iv             text not null,
  dek_auth_tag       text not null,

  key_version        integer not null check (key_version >= 1),
  algorithm_version  integer not null default 1 check (algorithm_version >= 1),

  -- Só para a tela reconhecer a chave. Nunca é suficiente para usá-la.
  last_four          text check (last_four is null or char_length(last_four) <= 8),

  status             text not null default 'nao_validada'
                       check (status in ('nao_validada','valida','invalida')),
  last_validated_at  timestamptz,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- Contador do rate limit do TESTE DE CONEXÃO (6/h por provedor). Fica aqui, e não em
-- `ai_runs`/`ai_usage_events`, porque testar credencial NÃO é conversa: não cria run, não
-- gera evento de uso e não entra no orçamento. Ainda assim precisa de limite — bater no
-- endpoint do provedor em laço é abuso mesmo custando zero token. Um contador em memória
-- não serviria: em serverless ele reinicia a cada processo.
alter table public.ai_provider_credentials
  add column if not exists test_window_started_at timestamptz;
alter table public.ai_provider_credentials
  add column if not exists test_count integer not null default 0;

create unique index if not exists ai_provider_credentials_user_provider_uidx
  on public.ai_provider_credentials (user_id, provider);
create index if not exists ai_provider_credentials_user_idx
  on public.ai_provider_credentials (user_id);

-- FK COMPOSTA: a credencial só existe para uma configuração DO MESMO usuário.
alter table public.ai_provider_credentials
  drop constraint if exists ai_provider_credentials_config_fk;
alter table public.ai_provider_credentials
  add constraint ai_provider_credentials_config_fk
  foreign key (user_id, provider)
  references public.ai_provider_configs (user_id, provider)
  on delete cascade;

alter table public.ai_provider_credentials enable row level security;
alter table public.ai_provider_credentials force row level security;

drop policy if exists "ai_provider_credentials_select" on public.ai_provider_credentials;
create policy "ai_provider_credentials_select" on public.ai_provider_credentials
  for select using (user_id = auth.uid());
drop policy if exists "ai_provider_credentials_insert" on public.ai_provider_credentials;
create policy "ai_provider_credentials_insert" on public.ai_provider_credentials
  for insert with check (user_id = auth.uid());
drop policy if exists "ai_provider_credentials_update" on public.ai_provider_credentials;
create policy "ai_provider_credentials_update" on public.ai_provider_credentials
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "ai_provider_credentials_delete" on public.ai_provider_credentials;
create policy "ai_provider_credentials_delete" on public.ai_provider_credentials
  for delete using (user_id = auth.uid());

drop trigger if exists set_ai_provider_credentials_updated_at on public.ai_provider_credentials;
create trigger set_ai_provider_credentials_updated_at
  before update on public.ai_provider_credentials
  for each row execute function public.set_updated_at();

comment on table public.ai_provider_credentials is
  'Só material criptográfico (18-A). A master key vive no ambiente do servidor, NUNCA no banco. Ler esta tabela inteira não decifra nada.';
comment on column public.ai_provider_credentials.id is
  'Gerado no servidor ANTES de cifrar: entra no AAD (id|dono|provedor|key_version). Ciphertext movido de linha falha na verificação.';
comment on column public.ai_provider_credentials.last_four is
  'Últimos caracteres, só para a tela reconhecer a chave. Nunca é suficiente para usá-la.';

-- ══════════════════════════════════════════════════════════════════════════════════════
-- 3. ai_user_preferences — uma linha por usuário
-- ══════════════════════════════════════════════════════════════════════════════════════
--
-- As chaves de NOTIFICAÇÃO não ficam aqui: vão para `settings.notification_prefs`, porque
-- `filterByPrefs` é o ÚNICO ponto do sistema onde preferência de notificação decide
-- (invariante 24 da 16-F). Nada disso é usado na 18-A — o sino só entra na 18-F.

create table if not exists public.ai_user_preferences (
  id                          uuid primary key default gen_random_uuid(),
  user_id                     uuid not null references auth.users(id) on delete cascade,

  default_provider            text check (default_provider is null
                                or default_provider in ('openai','gemini','anthropic','xai')),
  default_model               text,

  -- GRAVADO agora para a tela de Configurações existir completa; NENHUM código o consome
  -- na 18-A (não há escrita). A Approval Engine é 18-C.
  confirmation_mode           text not null default 'seguro'
                                check (confirmation_mode in ('seguro','equilibrado','rapido')),

  -- Permissões por módulo. TODAS nascem desligadas: a 18-A não lê nenhum dado do usuário,
  -- e a 18-B só passa a ler o que estiver explicitamente liberado aqui.
  allow_finance               boolean not null default false,
  allow_nutrition             boolean not null default false,
  allow_training              boolean not null default false,
  allow_body                  boolean not null default false,
  allow_cross_module          boolean not null default false,
  allow_memory                boolean not null default false,
  allow_files                 boolean not null default false,
  allow_fallback              boolean not null default false,
  allow_external_search       boolean not null default false,

  -- Orçamento em USD. NULO = sem limite definido (não é zero).
  daily_budget                numeric(12,6) check (daily_budget is null or daily_budget >= 0),
  monthly_budget              numeric(12,6) check (monthly_budget is null or monthly_budget >= 0),
  budget_block_on_limit       boolean not null default true,

  -- Evita repetir o mesmo aviso visual. 0 = nenhum nível atingido no período corrente.
  budget_alert_level_reached  integer not null default 0
                                check (budget_alert_level_reached in (0,70,80,90,100)),

  -- Margem de segurança da reserva (anexo D da 18-A). Documentada e ajustável, nunca
  -- silenciosa: a tela mostra o valor e explica o que ele faz.
  reservation_margin          numeric(4,2) not null default 1.15
                                check (reservation_margin between 1.00 and 3.00),

  -- Rate limit LIDO PELO BANCO. Não existe caminho para o cliente informar limite ou
  -- contagem de janela — se existisse, o limite não seria limite.
  rate_limit_per_minute       integer not null default 10
                                check (rate_limit_per_minute between 1 and 120),
  rate_limit_per_hour         integer not null default 120
                                check (rate_limit_per_hour between 1 and 2000),

  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create unique index if not exists ai_user_preferences_user_uidx
  on public.ai_user_preferences (user_id);

alter table public.ai_user_preferences enable row level security;
alter table public.ai_user_preferences force row level security;

drop policy if exists "ai_user_preferences_select" on public.ai_user_preferences;
create policy "ai_user_preferences_select" on public.ai_user_preferences
  for select using (user_id = auth.uid());
drop policy if exists "ai_user_preferences_insert" on public.ai_user_preferences;
create policy "ai_user_preferences_insert" on public.ai_user_preferences
  for insert with check (user_id = auth.uid());
drop policy if exists "ai_user_preferences_update" on public.ai_user_preferences;
create policy "ai_user_preferences_update" on public.ai_user_preferences
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "ai_user_preferences_delete" on public.ai_user_preferences;
create policy "ai_user_preferences_delete" on public.ai_user_preferences
  for delete using (user_id = auth.uid());

drop trigger if exists set_ai_user_preferences_updated_at on public.ai_user_preferences;
create trigger set_ai_user_preferences_updated_at
  before update on public.ai_user_preferences
  for each row execute function public.set_updated_at();

comment on table public.ai_user_preferences is
  'Preferências de IA do usuário (18-A). Permissões por módulo nascem TODAS desligadas; a 18-A não lê dado nenhum.';
comment on column public.ai_user_preferences.rate_limit_per_minute is
  'Limite LIDO PELO BANCO em ai_begin_chat_run. O cliente nunca informa limite nem contagem de janela.';

-- ══════════════════════════════════════════════════════════════════════════════════════
-- 4. ai_conversations
-- ══════════════════════════════════════════════════════════════════════════════════════

create table if not exists public.ai_conversations (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,

  -- Texto vindo do registry ESTÁTICO de agentes. Na 18-A só existe 'assistente-pessoal'.
  agent_id         text not null default 'assistente-pessoal',

  title            text,
  status           text not null default 'ativa' check (status in ('ativa','arquivada')),
  is_favorite      boolean not null default false,
  last_message_at  timestamptz,

  summary          text,
  summary_version  integer,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  archived_at      timestamptz
);

-- Alvo das FKs compostas.
create unique index if not exists ai_conversations_id_user_uidx
  on public.ai_conversations (id, user_id);
create index if not exists ai_conversations_user_idx
  on public.ai_conversations (user_id);
create index if not exists ai_conversations_user_recent_idx
  on public.ai_conversations (user_id, last_message_at desc);

alter table public.ai_conversations enable row level security;
alter table public.ai_conversations force row level security;

drop policy if exists "ai_conversations_select" on public.ai_conversations;
create policy "ai_conversations_select" on public.ai_conversations
  for select using (user_id = auth.uid());
drop policy if exists "ai_conversations_insert" on public.ai_conversations;
create policy "ai_conversations_insert" on public.ai_conversations
  for insert with check (user_id = auth.uid());
drop policy if exists "ai_conversations_update" on public.ai_conversations;
create policy "ai_conversations_update" on public.ai_conversations
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "ai_conversations_delete" on public.ai_conversations;
create policy "ai_conversations_delete" on public.ai_conversations
  for delete using (user_id = auth.uid());

drop trigger if exists set_ai_conversations_updated_at on public.ai_conversations;
create trigger set_ai_conversations_updated_at
  before update on public.ai_conversations
  for each row execute function public.set_updated_at();

comment on table public.ai_conversations is
  'Conversas do módulo de IA (18-A). agent_id vem do registry estático de agentes, nunca do cliente.';

-- ══════════════════════════════════════════════════════════════════════════════════════
-- 5. ai_messages
-- ══════════════════════════════════════════════════════════════════════════════════════
--
-- NÃO guarda tokens, custo, latência, provedor nem modelo. Esses números têm UMA fonte:
-- `ai_usage_events`. Duplicar aqui criaria dois totais que divergem no primeiro retry.

create table if not exists public.ai_messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null,
  user_id          uuid not null references auth.users(id) on delete cascade,

  -- Nulo em mensagem do usuário. A FK para ai_runs é acrescentada no fim desta migration
  -- (as duas tabelas se referenciam; a ordem de inserção resolve isso — ver M2).
  run_id           uuid,

  role             text not null check (role in ('user','assistant','system')),
  content          text not null default '',
  content_type     text not null default 'text' check (content_type in ('text','markdown')),
  status           text not null default 'complete'
                     check (status in ('complete','streaming','cancelled','failed')),

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create unique index if not exists ai_messages_id_user_uidx
  on public.ai_messages (id, user_id);
create index if not exists ai_messages_user_idx
  on public.ai_messages (user_id);
create index if not exists ai_messages_conversation_idx
  on public.ai_messages (conversation_id, created_at);

alter table public.ai_messages
  drop constraint if exists ai_messages_conversation_owner_fk;
alter table public.ai_messages
  add constraint ai_messages_conversation_owner_fk
  foreign key (conversation_id, user_id)
  references public.ai_conversations (id, user_id)
  on delete cascade;

alter table public.ai_messages enable row level security;
alter table public.ai_messages force row level security;

drop policy if exists "ai_messages_select" on public.ai_messages;
create policy "ai_messages_select" on public.ai_messages
  for select using (user_id = auth.uid());
drop policy if exists "ai_messages_insert" on public.ai_messages;
create policy "ai_messages_insert" on public.ai_messages
  for insert with check (user_id = auth.uid());
drop policy if exists "ai_messages_update" on public.ai_messages;
create policy "ai_messages_update" on public.ai_messages
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "ai_messages_delete" on public.ai_messages;
create policy "ai_messages_delete" on public.ai_messages
  for delete using (user_id = auth.uid());

drop trigger if exists set_ai_messages_updated_at on public.ai_messages;
create trigger set_ai_messages_updated_at
  before update on public.ai_messages
  for each row execute function public.set_updated_at();

comment on table public.ai_messages is
  'Mensagens da conversa (18-A). NÃO guarda tokens, custo, latência, provedor nem modelo — a fonte única desses números é ai_usage_events.';

-- ══════════════════════════════════════════════════════════════════════════════════════
-- 6. ai_runs — execução lógica de uma mensagem
-- ══════════════════════════════════════════════════════════════════════════════════════
--
-- ═══════════════════════ CINCO ESTADOS, NÃO OITO ═══════════════════════
--
-- reserved · streaming · completed · cancelled · failed
--
-- `pending` seria ambíguo (pendente de quê?); `starting` não tem diferença OBSERVÁVEL de
-- `reserved` — o que distingue "commitei" de "já chamei o provedor" é a EXISTÊNCIA da linha
-- de tentativa, não um estado do run; e `abandoned` é MOTIVO, não estado: vira
-- `failed` + error_code='ABANDONED', pela mesma disciplina de status derivado do projeto.
--
--   run reserved SEM tentativa         → caiu depois do commit e ANTES de chamar o provedor
--   run reserved COM tentativa started → caiu DEPOIS de chamar (pode ter havido consumo)
--
-- Transições permitidas, e só estas:
--   reserved  → streaming | completed | cancelled | failed
--   streaming → completed | cancelled | failed
--   terminais → nenhuma  (imutáveis: por isso `finally` e reconciliador nunca se contradizem)
--
-- ═══════════════════════ O RUN É UMA RESERVA FINANCEIRA ═══════════════════════
--
-- Verificar orçamento só contra gasto CONFIRMADO deixa passar duas chamadas concorrentes
-- que ainda não geraram evento de uso. Por isso o run carrega `reserved_cost`:
--
--   consumo = Σ custo real dos runs TERMINAIS + Σ reserva dos NÃO-TERMINAIS não expirados
--
-- Todo run pertence a EXATAMENTE UM dos dois somatórios — nunca aos dois.

create table if not exists public.ai_runs (
  id                        uuid primary key default gen_random_uuid(),
  user_id                   uuid not null references auth.users(id) on delete cascade,
  conversation_id           uuid not null,
  user_message_id           uuid,
  assistant_message_id      uuid,

  agent_id                  text not null,
  prompt_version            text not null,
  correlation_id            uuid not null default gen_random_uuid(),

  -- Escolhidos no início, pelo SERVIDOR. A preferência do cliente nunca chega aqui sem
  -- passar pela validação contra o registry e o catálogo.
  selected_provider         text not null
                              check (selected_provider in ('openai','gemini','anthropic','xai')),
  selected_model            text not null,
  -- Os que efetivamente concluíram (podem diferir dos escolhidos, por retry ou fallback).
  completed_provider        text,
  completed_model           text,

  status                    text not null default 'reserved'
                              check (status in ('reserved','streaming','completed','cancelled','failed')),

  attempt_count             integer not null default 0 check (attempt_count >= 0),
  fallback_count            integer not null default 0 check (fallback_count >= 0),

  started_at                timestamptz not null default now(),
  completed_at              timestamptz,
  total_latency_ms          integer check (total_latency_ms is null or total_latency_ms >= 0),

  -- A lease começa na ADMISSÃO, não no primeiro delta: um run que morre entre o commit e a
  -- chamada ficaria sem lease e prenderia orçamento para sempre.
  last_heartbeat_at         timestamptz not null default now(),
  lease_expires_at          timestamptz not null default (now() + interval '5 minutes'),

  reserved_cost             numeric(12,6) not null check (reserved_cost >= 0),
  reservation_currency      text not null default 'USD' check (reservation_currency = 'USD'),
  reservation_rate_version  text not null,
  reservation_expires_at    timestamptz not null,

  error_code                text,
  error_message_sanitized   text,
  cancel_reason             text,

  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),

  -- Um run terminal tem de dizer QUANDO terminou. Sem isso, o somatório por período não
  -- consegue decidir a que período o custo pertence.
  constraint ai_runs_terminal_has_completed_at
    check (status in ('reserved','streaming') or completed_at is not null)
);

create unique index if not exists ai_runs_id_user_uidx
  on public.ai_runs (id, user_id);
create index if not exists ai_runs_user_idx
  on public.ai_runs (user_id);
-- Recuperação: `user_id` é a PRIMEIRA coluna de propósito — a reconciliação preguiçosa
-- olha só os runs do usuário da sessão, nunca varre o sistema inteiro.
create index if not exists ai_runs_open_idx
  on public.ai_runs (user_id, status, last_heartbeat_at)
  where status in ('reserved','streaming');
create index if not exists ai_runs_user_created_idx
  on public.ai_runs (user_id, created_at);
create index if not exists ai_runs_conversation_idx
  on public.ai_runs (conversation_id, created_at);

alter table public.ai_runs drop constraint if exists ai_runs_conversation_owner_fk;
alter table public.ai_runs
  add constraint ai_runs_conversation_owner_fk
  foreign key (conversation_id, user_id)
  references public.ai_conversations (id, user_id)
  on delete cascade;

alter table public.ai_runs drop constraint if exists ai_runs_user_message_owner_fk;
alter table public.ai_runs
  add constraint ai_runs_user_message_owner_fk
  foreign key (user_message_id, user_id)
  references public.ai_messages (id, user_id)
  on delete set null;

alter table public.ai_runs drop constraint if exists ai_runs_assistant_message_owner_fk;
alter table public.ai_runs
  add constraint ai_runs_assistant_message_owner_fk
  foreign key (assistant_message_id, user_id)
  references public.ai_messages (id, user_id)
  on delete set null;

alter table public.ai_runs enable row level security;
alter table public.ai_runs force row level security;

drop policy if exists "ai_runs_select" on public.ai_runs;
create policy "ai_runs_select" on public.ai_runs
  for select using (user_id = auth.uid());
drop policy if exists "ai_runs_insert" on public.ai_runs;
create policy "ai_runs_insert" on public.ai_runs
  for insert with check (user_id = auth.uid());
drop policy if exists "ai_runs_update" on public.ai_runs;
create policy "ai_runs_update" on public.ai_runs
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "ai_runs_delete" on public.ai_runs;
create policy "ai_runs_delete" on public.ai_runs
  for delete using (user_id = auth.uid());

drop trigger if exists set_ai_runs_updated_at on public.ai_runs;
create trigger set_ai_runs_updated_at
  before update on public.ai_runs
  for each row execute function public.set_updated_at();

comment on table public.ai_runs is
  'Execução lógica de uma mensagem (18-A). NÃO é fonte de custo individual — o custo mora em ai_usage_events, por tentativa.';
comment on column public.ai_runs.reserved_cost is
  'RESERVA financeira em USD. Enquanto o run é não-terminal, o orçamento conta a reserva; ao terminalizar, passa a contar o custo real. Nunca os dois.';
comment on column public.ai_runs.last_heartbeat_at is
  'Gravado já no INSERT. A lease começa na admissão — senão um run morto entre o commit e a chamada ficaria sem lease.';
comment on column public.ai_runs.status is
  'reserved|streaming|completed|cancelled|failed. abandoned NÃO é estado: é failed + error_code=ABANDONED.';

-- Agora que ai_runs existe, a ponta solta de ai_messages fecha.
alter table public.ai_messages drop constraint if exists ai_messages_run_owner_fk;
alter table public.ai_messages
  add constraint ai_messages_run_owner_fk
  foreign key (run_id, user_id)
  references public.ai_runs (id, user_id)
  on delete set null;

-- ══════════════════════════════════════════════════════════════════════════════════════
-- 7. ai_usage_events — UMA LINHA POR TENTATIVA
-- ══════════════════════════════════════════════════════════════════════════════════════
--
-- Um run faz mais de uma chamada quando há retry, fallback de provedor, fallback de modelo,
-- falha após consumo parcial, ou timeout depois de o provedor já ter processado parte. Uma
-- linha por RUN obrigaria a sobrescrever custo, perder a primeira tentativa, misturar tarifas
-- ou enfiar um array na linha — nenhuma dessas é aceitável.
--
-- CHAVE ÚNICA `(run_id, attempt_index)`: `run_id` é UUID e chave primária de `ai_runs`, logo
-- já é globalmente único E já determina o usuário. Pôr `user_id` na constraint não
-- acrescentaria unicidade alguma. A proteção que ele PARECIA dar — impedir tentativa com
-- dono divergente do run — vem de verdade da FK COMPOSTA `(run_id, user_id)`.

create table if not exists public.ai_usage_events (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users(id) on delete cascade,
  run_id               uuid not null,
  conversation_id      uuid,
  agent_id             text,

  attempt_index        integer not null check (attempt_index >= 1),
  attempt_type         text not null check (attempt_type in ('PRIMARY','RETRY','FALLBACK')),

  provider             text not null check (provider in ('openai','gemini','anthropic','xai')),
  model_id             text not null,
  status               text not null default 'started'
                         check (status in ('started','completed','failed','cancelled')),
  provider_request_id  text,

  started_at           timestamptz not null default now(),
  completed_at         timestamptz,
  latency_ms           integer check (latency_ms is null or latency_ms >= 0),

  -- NULO = o provedor não informou. NUNCA zero. `usage_availability` diz o que faltou.
  input_tokens         integer check (input_tokens is null or input_tokens >= 0),
  output_tokens        integer check (output_tokens is null or output_tokens >= 0),
  cached_input_tokens  integer check (cached_input_tokens is null or cached_input_tokens >= 0),
  usage_availability   jsonb not null default '{}'::jsonb,

  -- Tarifa CONGELADA no ato. Alterar o preço depois não muda custo histórico — mesma
  -- disciplina do snapshot nutricional (16-B) e da sessão de treino (17-C).
  rate_snapshot        jsonb not null,
  pricing_version      text not null,
  currency             text not null default 'USD' check (currency = 'USD'),
  estimated_cost       numeric(12,6) check (estimated_cost is null or estimated_cost >= 0),

  was_fallback         boolean not null default false,
  error_code           text,

  created_at           timestamptz not null default now(),

  constraint ai_usage_events_first_is_primary
    check (attempt_index <> 1 or attempt_type = 'PRIMARY'),
  constraint ai_usage_events_fallback_flag_matches_type
    check (was_fallback = (attempt_type = 'FALLBACK')),
  constraint ai_usage_events_availability_is_object
    check (jsonb_typeof(usage_availability) = 'object')
);

create unique index if not exists ai_usage_events_run_attempt_uidx
  on public.ai_usage_events (run_id, attempt_index);
-- Uma tentativa ATIVA por run. O chat-runner é o único escritor daquele run, então a
-- alocação sequencial já basta por desenho — este índice é a rede de segurança.
create unique index if not exists ai_usage_events_one_active_uidx
  on public.ai_usage_events (run_id) where status = 'started';
create index if not exists ai_usage_events_user_idx
  on public.ai_usage_events (user_id);
-- Orçamento por período.
create index if not exists ai_usage_events_user_created_idx
  on public.ai_usage_events (user_id, created_at);
create index if not exists ai_usage_events_run_idx
  on public.ai_usage_events (run_id);

alter table public.ai_usage_events drop constraint if exists ai_usage_events_run_owner_fk;
alter table public.ai_usage_events
  add constraint ai_usage_events_run_owner_fk
  foreign key (run_id, user_id)
  references public.ai_runs (id, user_id)
  on delete cascade;

alter table public.ai_usage_events enable row level security;
alter table public.ai_usage_events force row level security;

drop policy if exists "ai_usage_events_select" on public.ai_usage_events;
create policy "ai_usage_events_select" on public.ai_usage_events
  for select using (user_id = auth.uid());
drop policy if exists "ai_usage_events_insert" on public.ai_usage_events;
create policy "ai_usage_events_insert" on public.ai_usage_events
  for insert with check (user_id = auth.uid());

-- ⚠️ APPEND-ONLY COM PRECISÃO: a tentativa nasce `started` e precisa fechar em
-- `completed|failed|cancelled` — isso É um UPDATE. O que não pode existir é reescrita de
-- linha TERMINAL. Por isso o `using` exige `status = 'started'`: o banco recusa qualquer
-- escrita numa tentativa já encerrada, tornando a retificação de uso tardio impossível.
drop policy if exists "ai_usage_events_close_attempt" on public.ai_usage_events;
create policy "ai_usage_events_close_attempt" on public.ai_usage_events
  for update
  using (user_id = auth.uid() and status = 'started')
  with check (user_id = auth.uid());

-- Sem policy de DELETE, de propósito: histórico de custo não se apaga.

comment on table public.ai_usage_events is
  'UMA LINHA POR TENTATIVA (18-A). Retry e fallback criam linhas novas; nenhuma tentativa terminal é reescrita. Sem policy de DELETE.';
comment on column public.ai_usage_events.estimated_cost is
  'NULO quando o provedor não informou consumo. NUNCA zero — ausência de dado não é custo zero.';
comment on column public.ai_usage_events.rate_snapshot is
  'Tarifa congelada NO ATO, por tentativa (fallback pode trocar provedor, modelo e tarifa). Alterar o preço depois não muda custo histórico.';
comment on constraint ai_usage_events_run_owner_fk on public.ai_usage_events is
  'FK COMPOSTA: a tentativa só pode pertencer a um run DO MESMO usuário. É ela — e não user_id na chave única — que impede linha de dono divergente.';
