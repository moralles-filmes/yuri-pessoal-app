-- Task 23: uma nova proposta pode desfazer uma execução cujo inverso falhou.
-- Compatível com a main: mesmas tabelas, colunas, nome do índice, RLS e grants.
-- Executando, sucesso e parcial continuam disputando a mesma vaga por alvo e dono.
-- Reversão: restaurar o predicado anterior somente após conferir e resolver duplicatas
-- históricas de falhas por (undoes_execution_id, user_id); não apagar auditoria.
drop index if exists public.ai_action_executions_undoes_user_uidx;
create unique index ai_action_executions_undoes_user_uidx
  on public.ai_action_executions (undoes_execution_id, user_id)
  where undoes_execution_id is not null and status <> 'falhou';
