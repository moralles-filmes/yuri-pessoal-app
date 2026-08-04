-- Fase 17-F — impede REIVINDICAR registro alheio na ponte da agenda e no vínculo de hábito.
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════╗
-- ║ ACHADO NO TESTE PELA ROLE `authenticated` — não no código.                             ║
-- ║                                                                                       ║
-- ║ A RLS confere o `user_id` da PRÓPRIA linha e nada sabe sobre a linha APONTADA. Um      ║
-- ║ intruso conseguia inserir                                                              ║
-- ║   training_calendar_sync(user_id = ele, scheduled_workout_id = <dia planejado de A>)   ║
-- ║ e o banco aceitava.                                                                    ║
-- ║                                                                                       ║
-- ║ Não vazava dado (a leitura junta o planejamento, cuja RLS bloqueia), mas OCUPAVA a     ║
-- ║ chave única `(scheduled_workout_id, provider)` — o dono deixaria de conseguir          ║
-- ║ sincronizar aquele dia, sem nenhuma mensagem que explicasse por quê.                   ║
-- ╚══════════════════════════════════════════════════════════════════════════════════════╝
--
-- A correção é a MESMA da 16-E nas fotos de evolução: FK COMPOSTA, para o banco garantir o
-- que a RLS não alcança — em vez de depender do comportamento de um JOIN.
--
-- ⚠️ Consequência conhecida (16-E documentou a mesma): FK composta impede o embed do
-- PostgREST. Nenhuma leitura desta fase usa embed nessas colunas.
--
-- Idempotente.

-- O alvo de uma FK composta precisa de unicidade em (id, user_id).
create unique index if not exists training_scheduled_workouts_id_user_uidx
  on public.training_scheduled_workouts (id, user_id);
create unique index if not exists habits_id_user_uidx
  on public.habits (id, user_id);

alter table public.training_calendar_sync
  drop constraint if exists training_calendar_sync_owner_fk;
alter table public.training_calendar_sync
  add constraint training_calendar_sync_owner_fk
  foreign key (scheduled_workout_id, user_id)
  references public.training_scheduled_workouts (id, user_id)
  on delete cascade;

alter table public.training_preferences
  drop constraint if exists training_preferences_habit_owner_fk;
alter table public.training_preferences
  add constraint training_preferences_habit_owner_fk
  foreign key (habit_id, user_id)
  references public.habits (id, user_id)
  on delete set null;

comment on constraint training_calendar_sync_owner_fk on public.training_calendar_sync is
  'FK COMPOSTA: a ponte só pode apontar para um dia planejado DO MESMO usuário. A RLS confere a própria linha e não alcança a linha apontada.';
comment on constraint training_preferences_habit_owner_fk on public.training_preferences is
  'FK COMPOSTA: o hábito vinculado tem de ser do mesmo usuário.';
