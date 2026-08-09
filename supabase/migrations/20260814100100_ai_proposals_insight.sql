-- Fase 18-E · Bloco 3 — `ai_action_proposals.origem` ganha a QUARTA forma: `insight`.
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════╗
-- ║ QUARTA FORMA DECLARADA, NÃO AFROUXAMENTO — o mesmo padrão da segunda e da terceira.   ║
-- ║                                                                                       ║
-- ║ O CHECK `ai_action_proposals_origem_coerente` exige cada forma POR INTEIRO. Uma       ║
-- ║ proposta de insight NÃO tem conversa, NÃO tem run, NÃO tem tool call, NÃO desfaz nada ║
-- ║ e NÃO vem de documento — ela tem `insight_id`, e só. "Proposta de ferramenta sempre    ║
-- ║ nasce de uma tool call" continua provado pelo banco.                                  ║
-- ║                                                                                       ║
-- ║ ⚠️ `insight_id` NÃO ENTRA NO HASH, pela mesma razão de `undoes_execution_id` e de      ║
-- ║ `document_extraction_id`: o hash cobre o EFEITO, e o payload já carrega o que vai ser ║
-- ║ criado. O vínculo é escrituração, e quem o protege é a FK COMPOSTA.                    ║
-- ╚══════════════════════════════════════════════════════════════════════════════════════╝
--
-- Idempotente.

alter table public.ai_action_proposals
  add column if not exists insight_id uuid;

alter table public.ai_action_proposals
  drop constraint if exists ai_action_proposals_insight_fk;
alter table public.ai_action_proposals
  add constraint ai_action_proposals_insight_fk
  foreign key (insight_id, user_id)
  references public.ai_insights (id, user_id)
  on delete cascade;

alter table public.ai_action_proposals
  drop constraint if exists ai_action_proposals_origem_check;
alter table public.ai_action_proposals
  add constraint ai_action_proposals_origem_check
  check (origem in ('ferramenta', 'desfazer', 'documento', 'insight'));

alter table public.ai_action_proposals
  drop constraint if exists ai_action_proposals_origem_coerente;
alter table public.ai_action_proposals
  add constraint ai_action_proposals_origem_coerente
  check (
    (origem = 'ferramenta'
      and conversation_id is not null
      and run_id is not null
      and tool_call_id is not null
      and undoes_execution_id is null
      and document_extraction_id is null
      and insight_id is null)
    or
    (origem = 'desfazer'
      and conversation_id is null
      and run_id is null
      and tool_call_id is null
      and undoes_execution_id is not null
      and document_extraction_id is null
      and insight_id is null)
    or
    (origem = 'documento'
      and conversation_id is null
      and run_id is null
      and tool_call_id is null
      and undoes_execution_id is null
      and document_extraction_id is not null
      and insight_id is null)
    or
    (origem = 'insight'
      and conversation_id is null
      and run_id is null
      and tool_call_id is null
      and undoes_execution_id is null
      and document_extraction_id is null
      and insight_id is not null)
  );

create index if not exists ai_action_proposals_insight_idx
  on public.ai_action_proposals (insight_id)
  where insight_id is not null;

comment on column public.ai_action_proposals.insight_id is
  'Fase 18-E. O insight que originou esta proposta. Obrigatório quando origem = insight, e '
  'proibido nas outras três formas — o CHECK exige cada forma por inteiro. NÃO entra no hash '
  'do efeito: o payload já carrega o que vai ser criado.';
