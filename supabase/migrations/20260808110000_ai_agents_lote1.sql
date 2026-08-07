-- ╔══════════════════════════════════════════════════════════════════════════════════════╗
-- ║ Fase 18-C · Lote 1 — os três agentes novos entram na allowlist do RPC.                ║
-- ║                                                                                       ║
-- ║ A lista de agentes é duplicada de propósito (TypeScript + SQL): `ai_begin_chat_run`    ║
-- ║ pode ser chamada DIRETO por um usuário autenticado, sem passar pelo Route Handler,     ║
-- ║ então a admissão não pode depender da aplicação. A 18-B extraiu a lista para esta      ║
-- ║ função exatamente para que uma subfase nova não precise reescrever a função inteira.   ║
-- ║                                                                                       ║
-- ║ ⚠️ A duplicação é guardada por teste: `agents/registry.test.ts` → "todo agente do      ║
-- ║ registry é aceito pelo RPC" LÊ ESTE ARQUIVO do disco e confere contra                  ║
-- ║ `AI_AGENT_REGISTRY`. Foi ele que pegou a divergência que originou esta migration —     ║
-- ║ sem ele, os três agentes novos falhariam só em runtime, na admissão, e a mensagem do   ║
-- ║ usuário morreria com `AI_AGENT_NOT_ALLOWED` sem explicação na tela.                    ║
-- ╚══════════════════════════════════════════════════════════════════════════════════════╝
--
-- Idempotente: `create or replace` reescreve o corpo sem tocar em GRANT/REVOKE, que são
-- reafirmados abaixo de qualquer forma (também idempotentes).
--
-- Nada mais muda: `ai_begin_chat_run` continua exatamente como a 18-B a deixou, porque ela
-- só CHAMA esta função. Nenhuma tabela, nenhuma policy, nenhum índice.

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
    'estudos'
  );
$$;

revoke all on function public.ai_agent_is_allowed(text) from public;
revoke all on function public.ai_agent_is_allowed(text) from anon;
grant execute on function public.ai_agent_is_allowed(text) to authenticated;

comment on function public.ai_agent_is_allowed(text) is
  'Agentes aceitos pelo RPC de admissão. Espelha src/lib/ai/agents/registry.ts DE PROPÓSITO: o RPC pode ser chamado direto, sem o Route Handler. Há teste conferindo que as duas listas concordam.';
