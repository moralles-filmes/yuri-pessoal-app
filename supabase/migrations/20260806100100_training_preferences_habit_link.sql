-- Fase 17-F — Treinos · Vínculo OPT-IN com o hábito "Treinar" (Fase 10)
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════╗
-- ║ "O TREINO ACONTECEU" TEM UMA FONTE SÓ: `training_sessions`.                            ║
-- ║                                                                                       ║
-- ║ O hábito REFLETE a sessão — não é um segundo registro. Sem esta coluna, o usuário      ║
-- ║ que mantém o hábito "Treinar" precisaria marcar o check-in à mão depois de já ter      ║
-- ║ registrado o treino inteiro: a mesma informação em dois lugares, divergindo no         ║
-- ║ primeiro esquecimento.                                                                 ║
-- ╚══════════════════════════════════════════════════════════════════════════════════════╝
--
-- NÃO É UMA TABELA DE VÍNCULO: é uma preferência (um hábito por usuário), e `habit_logs` já
-- é único por (user_id, habit_id, log_date) — o reflexo é um UPSERT nessa linha única, então
-- concluir, reabrir e concluir de novo converge para UM registro no dia, nunca dois.
--
-- `on delete set null`: excluir o hábito não pode derrubar as preferências do módulo Treinos,
-- e um vínculo órfão apontando para hábito inexistente seria pior que nenhum vínculo.
--
-- Idempotente.

alter table public.training_preferences
  add column if not exists habit_id uuid references public.habits(id) on delete set null;

create index if not exists training_preferences_habit_idx
  on public.training_preferences (habit_id) where habit_id is not null;

comment on column public.training_preferences.habit_id is
  'Hábito (Fase 10) que REFLETE as sessões concluídas. NULL = desligado. O check-in é upsert na linha única de habit_logs do dia — a sessão é a fonte de verdade, o hábito é espelho.';