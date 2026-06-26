-- Fase 10 — Hábitos
-- Coluna `description` genérica em `habits`. Reaproveitada pelas telas especializadas:
-- "Livro atual" (leitura) e "Tipo de exercício" (exercícios), além de observações
-- gerais do hábito. Mantém o modelo de UMA tabela genérica (sem tabelas separadas).
-- Idempotente.

alter table public.habits
  add column if not exists description text;
