-- ═══════════════════════════════════════════════════════════════════════════════════════
-- Fase 18-C · Bloco 4 — `todo_completions.completion_source` passa a aceitar 'ia'.
--
-- POR QUE ESTA MIGRATION EXISTE
-- ─────────────────────────────
-- O command `concluirTarefaTodo` grava a conclusão pelo MESMO serviço que o formulário usa
-- (`concluirTarefaNoTodo`), e passa `source: 'ia'`. O CHECK da Fase 15 aceitava só
-- ('manual','rapido','massa','notificacao','cron'): a gravação falharia com 23514 — e
-- falharia **só em runtime**, depois de o dono confirmar a ação na tela. É exatamente o tipo
-- de defeito que um duplo de teste que não modela a restrição do banco esconderia.
--
-- POR QUE 'ia' EM VEZ DE REUSAR 'manual'
-- ──────────────────────────────────────
-- A execução já fica registrada em `ai_action_executions` — mas essa tabela é do módulo de
-- IA, e o histórico do TO-DO é lido pelo módulo do TO-DO. Marcar uma conclusão da IA como
-- 'manual' faria o histórico do próprio módulo afirmar que o dono clicou. O valor novo é a
-- diferença entre "sei quem concluiu" e "suponho".
--
-- SEGURANÇA DA MUDANÇA
-- ────────────────────
-- É um ALARGAMENTO de CHECK: nenhuma linha existente viola o predicado novo, nenhuma coluna
-- muda de tipo, nenhum default muda. Idempotente por `if exists` no drop.
-- ═══════════════════════════════════════════════════════════════════════════════════════

alter table public.todo_completions
  drop constraint if exists todo_completions_completion_source_check;

alter table public.todo_completions
  add constraint todo_completions_completion_source_check
  check (completion_source in ('manual', 'rapido', 'massa', 'notificacao', 'cron', 'ia'));

comment on column public.todo_completions.completion_source is
  'De onde veio a conclusão. ''ia'' = executada pelo Approval Engine (18-C) depois de o dono confirmar na tela; a linha correspondente está em ai_action_executions.';
