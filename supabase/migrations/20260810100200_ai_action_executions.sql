-- ══════════════════════════════════════════════════════════════════════════════════════
-- Fase 18-C · Bloco 3 — IA · `ai_action_executions`: o que FOI feito.
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════╗
-- ║ ESTA É A ÚNICA DAS TRÊS TABELAS QUE REGISTRA UMA ESCRITA REAL NOS DADOS DO USUÁRIO.   ║
-- ║ Ela é tratada de acordo — em dois pontos que a diferenciam das outras duas.           ║
-- ╚══════════════════════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ PONTO 1 — ELA NÃO TEM FK PARA A APROVAÇÃO NEM PARA A PROPOSTA. É DELIBERADO.
--
--    `ai_conversations` TEM policy de DELETE (18-A). Com a cadeia completa de FKs
--    compostas, a corrente ficaria:
--        conversa → run → tool call → proposta → aprovação → EXECUÇÃO
--    e apagar uma conversa apagaria, por cascade, o registro de que a IA lançou uma
--    transação. Uma tela "Ações realizadas pela IA" construída sobre isso mentiria por
--    omissão, e a omissão seria invisível.
--
--    A alternativa (`restrict`/`no action` na corrente) transforma "excluir conversa" em
--    erro de banco — e, pior, colide com o cascade paralelo de `auth.users`, cujo resultado
--    depende da ordem em que o Postgres resolve os dois caminhos.
--
--    Então: proposta e aprovação são artefatos do chat e somem com ele; a EXECUÇÃO
--    sobrevive, com `command`, `target_id`, `target_route`, `changed_fields` e
--    `idempotency_key` — que é o que a auditoria precisa dizer. `approval_id` e
--    `proposal_id` continuam gravados como referência histórica, sem FK.
--
-- ⚠️ PONTO 2 — A VAGA É RESERVADA ANTES DA ESCRITA, NÃO DEPOIS ("claim-first").
--
--    A linha nasce `executando`, e só então o command é chamado. Uma queda no meio deixa
--    `executando` — que a tela lê como "não sabemos se foi aplicada, confira o registro" — e
--    BLOQUEIA nova tentativa pela mesma aprovação.
--
--    Isso erra de propósito para o lado de "pode não ter acontecido", nunca para o lado de
--    "pode ter acontecido duas vezes". Um lançamento que não entrou é visível e o dono o
--    refaz pelo formulário; lançamento em dobro na fatura é o bug que este projeto já teve
--    em produção (2026-08-06), e é o que a subfase inteira existe para não repetir.
--
-- Idempotente.
-- ══════════════════════════════════════════════════════════════════════════════════════

create table if not exists public.ai_action_executions (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,

  -- Referência histórica, SEM FK — ver o Ponto 1 do cabeçalho.
  approval_id           uuid not null,
  proposal_id           uuid not null,

  -- Resolvido num mapa fechado em código. A coluna registra qual foi; ela não despacha nada.
  command               text not null,

  -- ⚠️ DERIVADA NO SERVIDOR: "ai:" + approval_id. Não vem do modelo e não vem do cliente.
  --    `client_mutation_id` (17-C) é do DISPOSITIVO e é estável entre retries; um uuid vindo
  --    do modelo mudaria a cada tentativa e a trava viraria decoração. Por isso ele não
  --    existe nos schemas de entrada das ferramentas, pela mesma razão que `user_id` não.
  idempotency_key       text not null,

  status                text not null default 'executando'
                          check (status in ('executando','sucesso','falhou','parcial')),

  -- Código curto e sanitizado. NUNCA a mensagem do banco (traz nome de tabela, de coluna e
  -- às vezes valor de linha), nunca stack, nunca corpo de resposta de provedor externo.
  error_code            text,

  -- O registro afetado, para o link da tela. Rota INTERNA, conferida por `rotaInternaAceita`
  -- antes de gravar — a mesma allowlist que vale para `refs` desde a 18-B.
  target_id             uuid,
  target_route          text,

  -- §3.6 do design — A EXCEÇÃO DECLARADA À INVARIANTE 20 DA 18-B.
  -- Só os campos que a ação TOCOU, por allowlist estática do command. Nunca o registro
  -- inteiro: isso seria uma segunda cópia do dado pessoal dentro do módulo de IA, com prazo
  -- indefinido. Anexo, foto, texto livre longo e material criptográfico não entram em
  -- allowlist nenhuma.
  changed_fields        jsonb not null default '{}'::jsonb,
  -- O serviço de domínio alterou algo FORA da allowlist do command. Registrar que houve
  -- alteração não detalhada é honesto; gravar o campo seria furar a allowlist por dentro.
  undetailed_change     boolean not null default false,

  -- Ação em massa: sucesso e falha POR ITEM. O conjunto de itens entra no hash da proposta,
  -- então item a mais depois de confirmado é outra proposta, não este registro.
  items                 jsonb not null default '[]'::jsonb,

  -- Preenchida em Bloco 5: desfazer é ele mesmo uma ação, passa pelo mesmo Approval Engine
  -- e vira OUTRA linha desta tabela, que aponta para a que ela desfez.
  undoes_execution_id   uuid,

  started_at            timestamptz not null default now(),
  finished_at           timestamptz,
  duration_ms           integer check (duration_ms is null or duration_ms >= 0),

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint ai_action_executions_terminal_has_finished_at
    check (status = 'executando' or finished_at is not null),
  -- Sucesso não carrega erro. `parcial` carrega, porque algum item falhou.
  constraint ai_action_executions_sucesso_sem_erro
    check (status <> 'sucesso' or error_code is null),
  constraint ai_action_executions_changed_is_object
    check (jsonb_typeof(changed_fields) = 'object'),
  constraint ai_action_executions_items_is_array
    check (jsonb_typeof(items) = 'array'),
  -- Enquanto não terminou, não há o que detalhar nem o que apontar.
  constraint ai_action_executions_executando_e_vazia
    check (status <> 'executando'
           or (error_code is null and changed_fields = '{}'::jsonb and items = '[]'::jsonb))
);

-- ⛔ AS DUAS TRAVAS DE IDEMPOTÊNCIA.
--
-- Emparelhadas com `user_id` DE PROPÓSITO, e aqui pelo motivo oposto ao de
-- `ai_action_approvals`: lá a FK composta impede um intruso de inserir a linha que ocuparia
-- a chave alheia; aqui NÃO HÁ FK (Ponto 1), então a chave global seria ocupável — bastaria
-- inserir uma execução com o `approval_id` de outro usuário para IMPEDIR o dono de executar
-- a aprovação dele. É a mesma classe de defeito da ponte da agenda na 17-F.
--
-- Com o par, a garantia continua exatamente a que se quer: para UM dono, uma aprovação
-- executa uma vez só.
create unique index if not exists ai_action_executions_approval_user_uidx
  on public.ai_action_executions (approval_id, user_id);
create unique index if not exists ai_action_executions_idempotency_user_uidx
  on public.ai_action_executions (idempotency_key, user_id);

-- Uma execução é desfeita no máximo uma vez. Mesmo raciocínio do par acima.
create unique index if not exists ai_action_executions_undoes_user_uidx
  on public.ai_action_executions (undoes_execution_id, user_id)
  where undoes_execution_id is not null;

create unique index if not exists ai_action_executions_id_user_uidx
  on public.ai_action_executions (id, user_id);
create index if not exists ai_action_executions_user_idx
  on public.ai_action_executions (user_id);
-- A tela "Ações realizadas pela IA": as mais recentes primeiro.
create index if not exists ai_action_executions_recentes_idx
  on public.ai_action_executions (user_id, started_at desc);
-- E o caso que precisa de atenção: ficou `executando` e ninguém sabe o desfecho.
create index if not exists ai_action_executions_pendentes_idx
  on public.ai_action_executions (user_id, started_at)
  where status = 'executando';

alter table public.ai_action_executions enable row level security;
alter table public.ai_action_executions force row level security;

drop policy if exists "ai_action_executions_select" on public.ai_action_executions;
create policy "ai_action_executions_select" on public.ai_action_executions
  for select using (user_id = auth.uid());
drop policy if exists "ai_action_executions_insert" on public.ai_action_executions;
create policy "ai_action_executions_insert" on public.ai_action_executions
  for insert with check (user_id = auth.uid());

-- ⚠️ A ÚNICA POLICY DE UPDATE DAS TRÊS TABELAS, e ela só FECHA o que está aberto — mesma
-- disciplina de `ai_usage_events_close_attempt` (18-A) e `ai_run_steps_close_step` (18-B).
-- Execução terminal é IMUTÁVEL no banco: reescrever `falhou` para `sucesso` depois do fato
-- é exatamente o que uma auditoria não pode permitir.
drop policy if exists "ai_action_executions_close" on public.ai_action_executions;
create policy "ai_action_executions_close" on public.ai_action_executions
  for update using (user_id = auth.uid() and status = 'executando')
  with check (user_id = auth.uid());

-- Sem policy de DELETE: registro do que foi feito não se apaga.

drop trigger if exists set_ai_action_executions_updated_at on public.ai_action_executions;
create trigger set_ai_action_executions_updated_at
  before update on public.ai_action_executions
  for each row execute function public.set_updated_at();

comment on table public.ai_action_executions is
  'Fase 18-C. O que FOI feito nos dados do usuário. Sem FK para aprovação/proposta de propósito: sobrevive à exclusão da conversa. Vaga reservada ANTES da escrita (claim-first): queda no meio deixa "executando" e bloqueia nova tentativa — erra para "pode não ter acontecido", nunca para "pode ter acontecido duas vezes".';
comment on column public.ai_action_executions.idempotency_key is
  'Derivada no servidor: "ai:" + approval_id. Nunca vem do modelo nem do cliente.';
comment on column public.ai_action_executions.changed_fields is
  'SÓ os campos que a ação tocou, por allowlist estática do command (§3.6). Nunca o registro inteiro; nunca anexo, foto, texto livre longo ou material criptográfico.';
comment on column public.ai_action_executions.undetailed_change is
  'O domínio alterou algo fora da allowlist do command. Registrar que houve é honesto; gravar o campo furaria a allowlist por dentro.';
