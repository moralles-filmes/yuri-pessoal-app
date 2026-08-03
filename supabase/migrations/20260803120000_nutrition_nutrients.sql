-- Fase 16-A — Dieta e Alimentação · Definição dos nutrientes (catálogo de referência)
--
-- POR QUE UMA TABELA EM VEZ DE UMA COLUNA POR NUTRIENTE:
-- alimento tem dezenas de nutrientes possíveis e nenhuma fonte publica todos. Uma coluna
-- por nutriente obrigaria a uma migration a cada nutriente novo e transformaria "não
-- analisado" em NULL indistinguível de "zero". Aqui o nutriente é DADO, não schema.
--
-- ESTA TABELA É GLOBAL E SOMENTE LEITURA. Não tem `user_id` porque não guarda dado de
-- usuário: é vocabulário do sistema ("Proteína", unidade g, grupo macro), equivalente a uma
-- lista de moedas ou de unidades de medida. Nada aqui é pessoal e nada aqui é filtrável por
-- dono.
--
-- SEGURANÇA: RLS + FORCE RLS ligadas. Existe UMA policy, de SELECT, e NENHUMA de escrita —
-- nem o usuário nem a aplicação conseguem inserir/alterar/apagar; só migration. O predicado
-- é `auth.uid() is not null` em vez de `true` de propósito: exige sessão de verdade, então
-- mesmo que a role `anon` viesse a receber acesso à tabela por engano, a leitura continuaria
-- negada. É a expressão mais restritiva possível para "todo usuário logado lê o mesmo
-- vocabulário".
--
-- `code` é a chave primária de propósito: torna o seed da base e as consultas legíveis
-- ('proteina' em vez de um uuid) e mantém os dados estáveis entre ambientes.

create table if not exists public.nutrition_nutrients (
  code           text primary key,
  name           text not null,
  short_name     text,
  -- Unidade em que o `amount` de nutrition_food_nutrients é expresso.
  unit           text not null check (unit in ('kcal','kJ','g','mg','mcg')),
  nutrient_group text not null
                   check (nutrient_group in ('energia','macro','carboidrato','lipidio','mineral','vitamina','aminoacido','outro')),
  -- Ordem de exibição dentro do grupo.
  position       integer not null default 0,
  -- Aparece nos resumos (cards do dia, lista de alimentos, metas principais).
  is_core        boolean not null default false,
  -- Casas decimais NA APRESENTAÇÃO. O cálculo nunca arredonda no meio do caminho.
  precision      smallint not null default 1 check (precision between 0 and 4),
  created_at     timestamptz not null default now()
);

alter table public.nutrition_nutrients enable row level security;
alter table public.nutrition_nutrients force row level security;

drop policy if exists "read reference" on public.nutrition_nutrients;
create policy "read reference" on public.nutrition_nutrients
  for select
  to authenticated
  using (auth.uid() is not null);

create index if not exists nutrition_nutrients_group_idx
  on public.nutrition_nutrients (nutrient_group, position);
create index if not exists nutrition_nutrients_core_idx
  on public.nutrition_nutrients (is_core) where is_core;

comment on table public.nutrition_nutrients is
  'Catálogo global e somente leitura de nutrientes. Sem user_id: é vocabulário, não dado do usuário. Nenhuma policy de escrita — só migration altera.';
comment on column public.nutrition_nutrients.precision is
  'Casas decimais na APRESENTAÇÃO. Arredondar valor intermediário é proibido (ver src/lib/nutrition/calc.ts).';
