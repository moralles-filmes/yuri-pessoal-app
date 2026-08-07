-- ╔══════════════════════════════════════════════════════════════════════════════════════╗
-- ║ Fase 18-C · Lote 2 — Agenda e Tarefas/Rotinas entram na allowlist do RPC.             ║
-- ║                                                                                       ║
-- ║ Mesma razão da migration do Lote 1: `ai_begin_chat_run` pode ser chamada DIRETO por um ║
-- ║ usuário autenticado, sem passar pelo Route Handler, então a admissão não pode depender ║
-- ║ da aplicação. A lista é duplicada de propósito e guardada por teste, que lê a ÚLTIMA    ║
-- ║ migration a definir a função — este arquivo.                                           ║
-- ║                                                                                       ║
-- ║ ⚠️ Não há agente `body`: `body_*` é módulo CENTRAL, sem tela e sem agente próprios. As  ║
-- ║ ferramentas de medidas ficam na allowlist do agente de Treinos (e do de Dieta, no Lote ║
-- ║ 3) e exigem `allow_body`, que é uma permissão separada.                                ║
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
    'tarefas'
  );
$$;

revoke all on function public.ai_agent_is_allowed(text) from public;
revoke all on function public.ai_agent_is_allowed(text) from anon;
grant execute on function public.ai_agent_is_allowed(text) to authenticated;

comment on function public.ai_agent_is_allowed(text) is
  'Agentes aceitos pelo RPC de admissão. Espelha src/lib/ai/agents/registry.ts DE PROPÓSITO: o RPC pode ser chamado direto, sem o Route Handler. Há teste conferindo que as duas listas concordam.';
