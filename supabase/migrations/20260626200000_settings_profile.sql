-- Fase 14 — Segurança, Responsividade & Polimento Final
-- Finaliza a store de preferências `settings` (criada na Fase 12). Apenas ADICIONA
-- colunas (idempotente): perfil (nome/avatar), tema, moeda (BRL), formato de data e
-- preferências de notificações. RLS por user_id = auth.uid() já está ativa na Fase 12
-- (uma linha por usuário, unique user_id). Nenhuma tabela de domínio nova.

alter table public.settings
  add column if not exists display_name      text,
  add column if not exists avatar_url        text,
  add column if not exists theme             text not null default 'system',
  add column if not exists currency          text not null default 'BRL',
  add column if not exists date_format       text not null default 'dd/MM/yyyy',
  -- { [notification_type]: boolean } — canais in-app por tipo (default: tudo ligado).
  add column if not exists notification_prefs jsonb not null default '{}'::jsonb;
