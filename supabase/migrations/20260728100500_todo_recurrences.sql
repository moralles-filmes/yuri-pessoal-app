-- Fase 15 — Módulo TO-DO · Recorrências
-- Regra de repetição 1:1 com a tarefa. Colunas TIPADAS (consultáveis/indexáveis) +
-- `rule_json` para evoluir a regra sem migration. RLS + FORCE RLS. Idempotente.
--
-- MODOS (o usuário escolhe):
--  • 'fixo'           — próxima data ancorada no CALENDÁRIO original (ex.: toda segunda
--                       continua na segunda, mesmo concluindo na terça).
--  • 'apos_conclusao' — próxima data contada A PARTIR DA CONCLUSÃO (ex.: "a cada 7 dias
--                       após concluir": concluiu dia 10 → vence dia 17).
--
-- REGRAS DE DIA ÚTIL (business_day_rule), aplicadas sobre a data candidata:
--  • 'primeiro_dia_util' / 'ultimo_dia_util' — do mês da candidata.
--  • 'apenas_dias_uteis'                     — empurra sáb/dom para a próxima segunda.
--  Feriados NÃO são considerados (não há calendário de feriados no sistema).

create table if not exists public.todo_recurrences (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  task_id            uuid not null references public.todo_tasks(id) on delete cascade,

  frequency          text not null
                       check (frequency in ('diaria','semanal','mensal','anual')),
  -- A cada N unidades da frequência (>= 1).
  interval_count     integer not null default 1
                       check (interval_count >= 1),

  -- 0=domingo … 6=sábado. Usado em 'semanal' (dias específicos da semana) e, junto de
  -- week_of_month, no padrão "primeira segunda-feira do mês".
  days_of_week       smallint[],
  -- 1..31 para 'mensal'; -1 = último dia do mês.
  day_of_month       smallint,
  -- 1..12 para 'anual'.
  month_of_year      smallint check (month_of_year is null or month_of_year between 1 and 12),
  -- 1..4 = 1ª..4ª ocorrência do dia da semana no mês; -1 = última.
  week_of_month      smallint,
  business_day_rule  text check (business_day_rule in
                       ('primeiro_dia_util','ultimo_dia_util','apenas_dias_uteis')),

  recurrence_mode    text not null default 'fixo'
                       check (recurrence_mode in ('fixo','apos_conclusao')),

  starts_on          date,
  ends_on            date,
  max_occurrences    integer check (max_occurrences is null or max_occurrences > 0),
  occurrences_created integer not null default 0,

  timezone           text not null default 'America/Sao_Paulo',
  is_paused          boolean not null default false,
  -- Espaço de evolução: campos novos de regra entram aqui antes de virarem coluna.
  rule_json          jsonb,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table public.todo_recurrences enable row level security;
alter table public.todo_recurrences force row level security;

drop policy if exists "own rows" on public.todo_recurrences;
create policy "own rows" on public.todo_recurrences
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- 1:1 com a tarefa.
create unique index if not exists todo_recurrences_task_uidx
  on public.todo_recurrences (task_id);
create index if not exists todo_recurrences_user_idx
  on public.todo_recurrences (user_id);
-- Recorrências ativas (usado pelo Cron/geração).
create index if not exists todo_recurrences_user_active_idx
  on public.todo_recurrences (user_id, is_paused)
  where is_paused = false;

drop trigger if exists set_todo_recurrences_updated_at on public.todo_recurrences;
create trigger set_todo_recurrences_updated_at
  before update on public.todo_recurrences
  for each row execute function public.set_updated_at();
