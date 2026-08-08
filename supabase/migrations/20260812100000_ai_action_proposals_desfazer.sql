-- ══════════════════════════════════════════════════════════════════════════════════════
-- Fase 18-C · Bloco 5 — IA · A PROPOSTA DE DESFAZER, e por que ela não nasce de uma tool call.
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════╗
-- ║ O DESFAZER É UMA AÇÃO (§3.7): tem proposta, hash, confirmação e execução próprias.    ║
-- ║ O que ele NÃO tem é origem no chat — quem o pede é o botão da tela "Ações realizadas   ║
-- ║ pela IA", sobre uma execução que a própria IA fez.                                     ║
-- ║                                                                                       ║
-- ║ ⛔ E ELE NÃO PODE DEPENDER DA CONVERSA CONTINUAR EXISTINDO.                            ║
-- ║                                                                                       ║
-- ║ `ai_action_executions` foi deixada SEM FK para proposta e aprovação exatamente para    ║
-- ║ sobreviver à exclusão da conversa (ver o cabeçalho de `20260810100200`). Se a proposta ║
-- ║ de desfazer exigisse `conversation_id`/`run_id`/`tool_call_id`, o dono que apagasse a  ║
-- ║ conversa continuaria vendo a execução na tela — e o botão de desfazer dela pararia de  ║
-- ║ funcionar, sem que nada no desenho explicasse por quê. A execução sobreviveria e a     ║
-- ║ capacidade de revertê-la, não.                                                         ║
-- ╚══════════════════════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ A COLUNA `origem` NÃO É UM RÓTULO: ela é o discriminante de um CHECK que torna cada uma
--    das duas formas obrigatória por inteiro. "Proposta de ferramenta sempre nasce de uma tool
--    call" continua provado pelo banco — o que mudou é que agora existe uma segunda forma,
--    declarada, em vez de três colunas silenciosamente opcionais.
--
-- ⚠️ `undoes_execution_id` NÃO ENTRA NO HASH DO EFEITO, e isso é deliberado. O hash cobre o
--    EFEITO — o command inverso e o payload dele (que já carrega o id do registro a reverter).
--    O vínculo com a execução original é escrituração, e quem o protege é a FK composta abaixo
--    mais o `ai_action_executions_undoes_user_uidx` (uma execução é desfeita uma vez só).
--
-- ⚠️ NÃO HÁ índice único aqui sobre `undoes_execution_id`. Recusar uma proposta de desfazer
--    não pode impedir o dono de pedir o desfazer de novo; quem garante "uma vez só" é o índice
--    da tabela de EXECUÇÕES, que é onde o fato acontece.
--
-- Idempotente.
-- ══════════════════════════════════════════════════════════════════════════════════════

alter table public.ai_action_proposals
  add column if not exists origem text not null default 'ferramenta';

alter table public.ai_action_proposals
  drop constraint if exists ai_action_proposals_origem_check;
alter table public.ai_action_proposals
  add constraint ai_action_proposals_origem_check
  check (origem in ('ferramenta', 'desfazer'));

alter table public.ai_action_proposals
  add column if not exists undoes_execution_id uuid;

-- As três colunas do chat passam a ser opcionais NA COLUNA e obrigatórias NO CHECK abaixo,
-- conforme a origem. Sem o CHECK isto seria um afrouxamento; com ele, é uma segunda forma.
alter table public.ai_action_proposals alter column conversation_id drop not null;
alter table public.ai_action_proposals alter column run_id drop not null;
alter table public.ai_action_proposals alter column tool_call_id drop not null;

alter table public.ai_action_proposals
  drop constraint if exists ai_action_proposals_origem_coerente;
alter table public.ai_action_proposals
  add constraint ai_action_proposals_origem_coerente
  check (
    (origem = 'ferramenta'
      and conversation_id is not null
      and run_id is not null
      and tool_call_id is not null
      and undoes_execution_id is null)
    or
    (origem = 'desfazer'
      and conversation_id is null
      and run_id is null
      and tool_call_id is null
      and undoes_execution_id is not null)
  );

-- FK COMPOSTA, como em toda referência dentro do mesmo usuário (16-E nas fotos, 17-F na ponte
-- da agenda): a RLS confere o `user_id` da PRÓPRIA linha e não alcança a linha apontada. Sem o
-- par, um intruso proporia o desfazer de uma execução alheia.
alter table public.ai_action_proposals
  drop constraint if exists ai_action_proposals_undoes_owner_fk;
alter table public.ai_action_proposals
  add constraint ai_action_proposals_undoes_owner_fk
  foreign key (undoes_execution_id, user_id)
  references public.ai_action_executions (id, user_id)
  on delete cascade;

create index if not exists ai_action_proposals_undoes_idx
  on public.ai_action_proposals (undoes_execution_id)
  where undoes_execution_id is not null;

comment on column public.ai_action_proposals.origem is
  'De onde veio a proposta: "ferramenta" (dentro do run, com conversa/run/tool call obrigatórios) ou "desfazer" (botão da tela, sem trilha de chat e com undoes_execution_id obrigatório). O CHECK ai_action_proposals_origem_coerente torna cada forma obrigatória por inteiro.';
comment on column public.ai_action_proposals.undoes_execution_id is
  'A execução que ESTA proposta reverte. Não entra no hash do efeito (o payload do command inverso já carrega o alvo); o que a protege é a FK composta com user_id e o índice único de ai_action_executions.undoes_execution_id.';
