-- Fase 16-E — Módulo central de medidas corporais · O REGISTRO
--
-- Uma linha por medição: tipo, data, valor. É a fonte de verdade ÚNICA de peso corporal do
-- sistema inteiro — Dieta lê daqui, Treinos lê daqui.
--
-- ══ TRÊS DECISÕES QUE PARECEM DETALHE E NÃO SÃO ══
--
-- 1. `unit` É COPIADA DO TIPO NO ATO DO REGISTRO. Se o usuário medir a cintura em cm por um
--    ano e depois trocar o tipo para polegadas, as medidas antigas continuam em cm. É a mesma
--    disciplina do `nutrients_snapshot` da 16-B, no menor formato possível: o histórico não
--    se reescreve sozinho.
--
-- 2. `measured_on` É DATA PURA (`date`), não timestamptz. "Pesei no dia 5" não é um instante,
--    e um `.slice(0,10)` num timestamptz devolveria o dia em UTC — o bug de fuso que este
--    projeto persegue desde a Fase 08. A hora, quando informada, vai em coluna `time`.
--
-- 3. `type_id` É `on delete restrict`. Excluir um tipo que tem histórico apagaria medições em
--    silêncio; a action pergunta o que fazer (invariante "nenhuma exclusão silenciosa").
--
-- NÃO HÁ unique por (tipo, dia): medir de manhã e à noite no mesmo dia é legítimo, e o
-- gráfico sabe lidar com isso.
--
-- Idempotente. RLS + FORCE RLS, índice em user_id e trigger de updated_at.

create table if not exists public.body_measurements (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  type_id      uuid not null references public.body_measurement_types(id) on delete restrict,
  -- DATA PURA. Toda a aritmética acontece em Date.UTC (src/lib/nutrition/calendar.ts).
  measured_on  date not null,
  measured_at  time,
  value        numeric(10,3) not null check (value >= 0),
  -- Congelada do tipo na gravação. Ver decisão 1 no cabeçalho.
  unit         text not null,
  -- Condição da medição: comparar jejum com pós-treino sem saber disso produz "evolução"
  -- que é só variação de contexto.
  condition    text check (condition in ('jejum', 'manha', 'noite', 'pre_treino', 'pos_treino', 'outro')),
  note         text,
  -- 'integracao' fica previsto para balança/wearable, que NÃO está planejado (ver 16-E).
  source       text not null default 'manual' check (source in ('manual', 'integracao')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.body_measurements is
  'Medicoes corporais. FONTE DE VERDADE UNICA de peso corporal do sistema (Dieta 16-E + Treinos 17-E). Registro, nunca avaliacao: sem IMC classificatorio, sem peso ideal.';
comment on column public.body_measurements.unit is
  'Copiada do tipo NA GRAVACAO. Trocar a unidade do tipo depois nao reescreve o historico.';

alter table public.body_measurements enable row level security;
alter table public.body_measurements force row level security;

drop policy if exists "own rows" on public.body_measurements;
create policy "own rows" on public.body_measurements
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists body_measurements_user_idx
  on public.body_measurements (user_id);
-- A leitura dominante é "a série deste tipo, da mais recente para a mais antiga".
create index if not exists body_measurements_user_type_date_idx
  on public.body_measurements (user_id, type_id, measured_on desc);
-- E a secundária é "tudo que foi medido neste período" (relatório e comparação de datas).
create index if not exists body_measurements_user_date_idx
  on public.body_measurements (user_id, measured_on desc);

drop trigger if exists set_body_measurements_updated_at on public.body_measurements;
create trigger set_body_measurements_updated_at
  before update on public.body_measurements
  for each row execute function public.set_updated_at();