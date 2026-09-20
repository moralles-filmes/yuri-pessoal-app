-- Fase 18-F · Bloco 3 — A MEMÓRIA: o primeiro texto que o dono autoriza a entrar no prompt.
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════╗
-- ║ DUAS TABELAS, E A SEGUNDA NÃO É DETALHE.                                              ║
-- ║                                                                                       ║
-- ║ `ai_memories`      → o que vale AGORA (e nada sobre o estado dele)                     ║
-- ║ `ai_memory_events` → o que ACONTECEU, append-only, SEM o conteúdo                      ║
-- ║                                                                                       ║
-- ║ ⛔ `memory_id` VAI SEM FK, DE PROPÓSITO — invariante 38, como em `ai_action_executions` ║
-- ║ e `ai_insight_jobs`. Apagar a memória não pode apagar o registro de que ela existiu.   ║
-- ║                                                                                       ║
-- ║ ⛔ E O EVENTO NUNCA GUARDA O TEXTO. Invariante 20 (a auditoria guarda o pedido, nunca  ║
-- ║ o resultado) aplicada aqui: se o log guardasse o conteúdo, "excluir memória" deixaria  ║
-- ║ o texto vivo — o oposto exato do que o botão promete ao dono.                          ║
-- ╚══════════════════════════════════════════════════════════════════════════════════════╝
--
-- Idempotente. RLS + FORCE RLS, índice em user_id, trigger updated_at.

-- ══════════════════════════════════════════════════════════════════════════════════════
-- 1. `allow_write_memory` — a ÚNICA chave nova
-- ══════════════════════════════════════════════════════════════════════════════════════
--
-- ⚠️ `allow_memory` JÁ EXISTE desde a 18-A e nenhuma linha de código a leu até hoje. Esta
-- subfase a faz ligar alguma coisa — o mesmo movimento que o Bloco 4 da 18-E fez com
-- `allow_insight_jobs`.

alter table public.ai_user_preferences
  add column if not exists allow_write_memory boolean not null default false;

comment on column public.ai_user_preferences.allow_memory is
  'Fase 18-A, LIGADA NA 18-F Bloco 3. Autoriza o assistente a LER as memórias do dono e '
  'colocá-las no prompt como preferência. Nasce false. Memória amarrada a um módulo exige '
  'TAMBÉM a allow_<modulo> daquele módulo.';

comment on column public.ai_user_preferences.allow_write_memory is
  'Fase 18-F Bloco 3. Autoriza a IA a PROPOR memória nova (ferramenta memory.lembrar). '
  'Nasce false e é ANDada com allow_memory na action: propor uma preferência começa por ler '
  'as que já existem, para não repetir.';

-- ══════════════════════════════════════════════════════════════════════════════════════
-- 2. `ai_memories` — o que vale agora
-- ══════════════════════════════════════════════════════════════════════════════════════
--
-- ⛔ SEM COLUNA DE ESTADO. Nem `active`, nem `status`, nem `forgotten_at`. `vigente`,
-- `expirada`, `desativada` e `esquecida` saem de `expires_at` + o último evento, em
-- `src/lib/ai/memory/state.ts` — invariante 35 da 18-C e invariante 70 da 18-E.

create table if not exists public.ai_memories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,

  -- A frase, na voz do dono. O limite é o MESMO de `MAX_MEMORIA` e do `maxLength` do schema
  -- da ferramenta: três lugares, um número, e um teste compara este com aquele.
  content     text not null,

  -- NULL = vale para todos os agentes. Preenchido = só entra no prompt do agente daquele
  -- módulo, e só com a chave `allow_<modulo>` ligada.
  modulo      text,

  -- Opcional. `timestamptz`, não `date`: "esta preferência vale até a viagem acabar" é um
  -- instante, e quem o formata para o dono é `dateInSaoPaulo`.
  expires_at  timestamptz,

  -- Declarada por quem escreve, nunca deduzida. `ia` só existe depois de o dono confirmar
  -- a proposta na tela — nenhuma memória nasce sem decisão dele.
  origem      text not null,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.ai_memories
  drop constraint if exists ai_memories_content_tamanho;
alter table public.ai_memories
  add constraint ai_memories_content_tamanho
  check (char_length(content) between 1 and 300);

-- Uma frase só. A mesma regra de `formaDaMemoria`, aqui como trava final: o texto pode
-- chegar por um POST montado à mão, que não passa pela função pura.
alter table public.ai_memories
  drop constraint if exists ai_memories_content_uma_linha;
alter table public.ai_memories
  add constraint ai_memories_content_uma_linha
  check (content !~ '[\n\r]');

alter table public.ai_memories
  drop constraint if exists ai_memories_modulo_check;
alter table public.ai_memories
  add constraint ai_memories_modulo_check
  check (
    modulo is null
    or modulo in ('finance','nutrition','training','body','todo','calendar','tasks','habits','studies')
  );

alter table public.ai_memories
  drop constraint if exists ai_memories_origem_check;
alter table public.ai_memories
  add constraint ai_memories_origem_check
  check (origem in ('dono', 'ia'));

create index if not exists ai_memories_user_idx
  on public.ai_memories (user_id);

create index if not exists ai_memories_user_modulo_idx
  on public.ai_memories (user_id, modulo);

alter table public.ai_memories enable row level security;
alter table public.ai_memories force row level security;

drop policy if exists "ai_memories_select_own" on public.ai_memories;
create policy "ai_memories_select_own"
  on public.ai_memories for select
  using (user_id = (select auth.uid()));

drop policy if exists "ai_memories_insert_own" on public.ai_memories;
create policy "ai_memories_insert_own"
  on public.ai_memories for insert
  with check (user_id = (select auth.uid()));

drop policy if exists "ai_memories_update_own" on public.ai_memories;
create policy "ai_memories_update_own"
  on public.ai_memories for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ⛔ ESTA TABELA TEM POLICY DE DELETE, ao contrário das de auditoria. É o oposto da decisão
-- tomada em `ai_action_executions`: aquela guarda o que a IA FEZ nos módulos do dono e não
-- pode sumir; esta guarda o que ele escreveu sobre si, e apagar é um direito dele. O que
-- sobrevive ao delete é o EVENTO, que não tem o texto.
drop policy if exists "ai_memories_delete_own" on public.ai_memories;
create policy "ai_memories_delete_own"
  on public.ai_memories for delete
  using (user_id = (select auth.uid()));

drop trigger if exists set_ai_memories_updated_at on public.ai_memories;
create trigger set_ai_memories_updated_at
  before update on public.ai_memories
  for each row execute function public.set_updated_at();

comment on table public.ai_memories is
  'Fase 18-F Bloco 3. As preferências que o dono escreveu ou confirmou, e que entram no prompt '
  'como PREFERÊNCIA (nunca como regra). Sem coluna de estado: vigente/expirada/desativada/'
  'esquecida derivam de expires_at + o último evento (memory/state.ts). modulo NULL = vale '
  'para todos os agentes.';

-- ══════════════════════════════════════════════════════════════════════════════════════
-- 3. `ai_memory_events` — o que aconteceu, SEM o que estava escrito
-- ══════════════════════════════════════════════════════════════════════════════════════

create table if not exists public.ai_memory_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,

  -- ⛔ SEM FK, DE PROPÓSITO. Ver o cabeçalho.
  memory_id  uuid not null,

  evento     text not null,
  origem     text not null,
  created_at timestamptz not null default now()
);

alter table public.ai_memory_events
  drop constraint if exists ai_memory_events_evento_check;
alter table public.ai_memory_events
  add constraint ai_memory_events_evento_check
  check (evento in ('criada','editada','desativada','reativada','esquecida','excluida'));

alter table public.ai_memory_events
  drop constraint if exists ai_memory_events_origem_check;
alter table public.ai_memory_events
  add constraint ai_memory_events_origem_check
  check (origem in ('dono', 'ia'));

create index if not exists ai_memory_events_user_idx
  on public.ai_memory_events (user_id);

create index if not exists ai_memory_events_memory_idx
  on public.ai_memory_events (user_id, memory_id, created_at desc);

alter table public.ai_memory_events enable row level security;
alter table public.ai_memory_events force row level security;

-- ⛔ SÓ SELECT E INSERT. Nenhuma policy de UPDATE nem de DELETE: o histórico da memória é
-- append-only, como `ai_insight_feedback` e `ai_usage_events`. Um evento corrigível depois
-- não registra nada.
drop policy if exists "ai_memory_events_select_own" on public.ai_memory_events;
create policy "ai_memory_events_select_own"
  on public.ai_memory_events for select
  using (user_id = (select auth.uid()));

drop policy if exists "ai_memory_events_insert_own" on public.ai_memory_events;
create policy "ai_memory_events_insert_own"
  on public.ai_memory_events for insert
  with check (user_id = (select auth.uid()));

comment on table public.ai_memory_events is
  'Fase 18-F Bloco 3. Append-only: só policies de SELECT e INSERT. Uma linha por acontecimento '
  '(criada/editada/desativada/reativada/esquecida/excluida). NUNCA guarda o CONTEÚDO da '
  'memória — invariante 20 da 18-B aplicada aqui: com o texto no log, "excluir memória" o '
  'deixaria vivo. memory_id SEM FK de propósito (invariante 38): apagar a memória não apaga o '
  'registro de que ela existiu.';
