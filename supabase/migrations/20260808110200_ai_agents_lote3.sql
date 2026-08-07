-- ╔══════════════════════════════════════════════════════════════════════════════════════╗
-- ║ Fase 18-C · Lote 3 — Financeiro e Dieta fecham a allowlist de agentes do RPC.         ║
-- ║                                                                                       ║
-- ║ Com estes dois, os NOVE módulos do sistema têm leitura pela IA. A lista é duplicada    ║
-- ║ de propósito (TypeScript + SQL), porque `ai_begin_chat_run` pode ser chamada DIRETO    ║
-- ║ por um usuário autenticado, sem passar pelo Route Handler.                             ║
-- ║                                                                                       ║
-- ║ ⚠️ Continuam sem agente próprio, e isso é definitivo enquanto forem o que são:          ║
-- ║   • `body` — módulo CENTRAL sem tela própria; suas ferramentas ficam na allowlist dos  ║
-- ║     agentes de Treinos E de Dieta, exigindo `allow_body`.                               ║
-- ║   • `assistente-pessoal` — o orquestrador, que não lê módulo nenhum.                    ║
-- ╚══════════════════════════════════════════════════════════════════════════════════════╝
--
-- Idempotente: `create or replace` reescreve o corpo; GRANT/REVOKE são reafirmados abaixo.
-- Nenhuma tabela, nenhuma policy, nenhum índice, nenhum dado.

create or replace function public.ai_agent_is_allowed(p_agent_id text)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select p_agent_id in (
    'assistente-pessoal',
    'treinos',
    -- 18-C · Lote 1
    'todo',
    'habitos',
    'estudos',
    -- 18-C · Lote 2
    'agenda',
    'tarefas',
    -- 18-C · Lote 3
    'financeiro',
    'dieta'
  );
$$;

revoke all on function public.ai_agent_is_allowed(text) from public;
revoke all on function public.ai_agent_is_allowed(text) from anon;
grant execute on function public.ai_agent_is_allowed(text) to authenticated;

comment on function public.ai_agent_is_allowed(text) is
  'Agentes aceitos pelo RPC de admissão. Espelha src/lib/ai/agents/registry.ts DE PROPÓSITO: o RPC pode ser chamado direto, sem o Route Handler. Há teste conferindo que as duas listas concordam.';
