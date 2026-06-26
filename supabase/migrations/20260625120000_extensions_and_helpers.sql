-- Fase 02 — Financeiro Base
-- Extensões e função de trigger compartilhada (updated_at).
-- Idempotente: pode ser reaplicada com segurança.

create extension if not exists pgcrypto;

-- Mantém `updated_at` sempre atualizado em qualquer tabela que use este trigger.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
