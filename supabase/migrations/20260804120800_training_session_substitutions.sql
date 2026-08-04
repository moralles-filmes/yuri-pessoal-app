-- Fase 17-C — Treinos · Substituição de exercício durante a sessão
--
-- ═════════════════ SUBSTITUIÇÃO É REGISTRO, NÃO EQUIVALÊNCIA ═════════════════
--
-- O sistema NÃO afirma que o substituto trabalha os mesmos músculos, na mesma proporção, com o
-- mesmo estímulo. Ele registra o que o usuário FEZ: original, substituto, motivo e momento. A
-- interface diz isso com todas as letras ao oferecer as alternativas (do treino, do mesmo
-- padrão de movimento, do mesmo grupo, favoritas, busca).
--
-- Os nomes ficam CONGELADOS em `*_name_snapshot`: as FKs são `on delete set null` (referência
-- informativa) e o histórico precisa continuar legível mesmo se um dos exercícios for excluído
-- do catálogo depois.
--
-- O exercício substituído CONTINUA na sessão com status `substituido` e com as séries que já
-- tinham sido feitas. Nada é apagado — "nenhuma série registrada se perde ao substituir".

create table if not exists public.training_session_substitutions (
  id                          uuid primary key default gen_random_uuid(),
  user_id                     uuid not null references auth.users(id) on delete cascade,
  session_id                  uuid not null references public.training_sessions(id) on delete cascade,

  original_session_exercise_id uuid references public.training_session_exercises(id) on delete set null,
  new_session_exercise_id      uuid references public.training_session_exercises(id) on delete set null,

  original_exercise_id        uuid references public.training_exercises(id) on delete set null,
  substitute_exercise_id      uuid references public.training_exercises(id) on delete set null,

  original_name_snapshot      text not null,
  substitute_name_snapshot    text not null,

  reason                      text not null default 'outro'
                                check (reason in ('aparelho_ocupado','equipamento_indisponivel','dor_desconforto',
                                                  'preferencia','tempo','lesao_previa','outro')),
  reason_notes                text,

  occurred_at                 timestamptz not null default now(),
  created_at                  timestamptz not null default now()
);

alter table public.training_session_substitutions enable row level security;
alter table public.training_session_substitutions force row level security;

drop policy if exists "own rows" on public.training_session_substitutions;
create policy "own rows" on public.training_session_substitutions
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists training_session_substitutions_user_idx
  on public.training_session_substitutions (user_id);
create index if not exists training_session_substitutions_session_idx
  on public.training_session_substitutions (session_id, occurred_at);
create index if not exists training_session_substitutions_original_idx
  on public.training_session_substitutions (original_exercise_id) where original_exercise_id is not null;

comment on table public.training_session_substitutions is
  'Substituição feita durante a sessão. REGISTRO, não equivalência: o sistema não afirma que os exercícios são intercambiáveis.';
comment on column public.training_session_substitutions.original_name_snapshot is
  'Nome congelado: as FKs são set null e o histórico precisa continuar legível se o exercício sumir do catálogo.';
