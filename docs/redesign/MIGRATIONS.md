# Migrations do redesign — desenho

⛔ **A M3 foi aplicada em 2026-10-11** (REDESIGN-03-C2, versão remota `20261011190803`), depois
do "aplique a M3" literal do dono. **A M1 e a M2 NÃO foram aplicadas.** Estão escritas para você
ler e autorizar **uma a uma**. Aplicar exige `apply_migration` no projeto
`yjvnlbjvippefvzgrxxw`, e só com o seu "aplique a M1" (ou M2) explícito.

As três são **aditivas**: nenhuma apaga tabela, apaga coluna, renomeia, muda tipo ou
reinterpreta dado existente. Todas seguem as convenções do projeto conferidas no disco —
`user_id` NOT NULL, RLS + FORCE RLS, índice em `user_id`, trigger `public.set_updated_at()`,
FK composta com `*_id_user_uk`, idempotência (`if not exists` / `drop constraint if exists`).

| # | Migration | Decisão | Risco |
| --- | --- | --- | --- |
| **M1** | `receivable_receipts` | D6 — recebimento parcial | Baixo. Tabela nova, ninguém depende dela ainda |
| **M2** | `transactions.liquidado_em` | D9 — caixa exato | Baixo. Coluna nula em 377 linhas; nada lê ainda |
| **M3** | `categories.classificacao_padrao` | D8 — marcação de terceiros | Baixo. Coluna nula em 26 linhas — ✅ **aplicada em 2026-10-11** |

---

## M1 — `receivable_receipts` (recebimento parcial)

**Por quê:** `receivables` tem `valor` e `status`, não tem `valor_recebido`. Deve R$ 600,
pagou R$ 250 → R$ 350 restantes é **irrepresentável** hoje. É a única mudança que torna os
critérios de aceite do briefing §13 atingíveis.

**Decisão de modelagem:** uma linha por recebimento, nunca um campo `valor_recebido` na
`receivables`. Um campo só guardaria o total e perderia **quando** cada parcela entrou — e a
data é exatamente o que a visão de caixa precisa. Mesma razão de `ai_usage_events` ser por
tentativa, e de `todo_completions` guardar histórico em vez de um contador.

```sql
-- supabase/migrations/<timestamp>_receivable_receipts.sql
-- D6: recebimento parcial de recebível. `receivables.valor` passa a ser a
-- RESPONSABILIDADE ORIGINAL; o saldo é `valor - soma dos recebimentos`.

-- (1) Habilita a FK COMPOSTA (invariante 23 da 17-F): a RLS confere o user_id da
--     PRÓPRIA linha e não alcança a linha apontada.
alter table public.receivables
  drop constraint if exists receivables_id_user_uk;
alter table public.receivables
  add constraint receivables_id_user_uk unique (id, user_id);

create table if not exists public.receivable_receipts (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  receivable_id  uuid not null,
  valor          numeric(14,2) not null check (valor > 0),
  -- Data pura: é o dia em que o dinheiro entrou, não um instante.
  recebido_em    date not null,
  -- Opcionais: a conta que recebeu e o lançamento de caixa correspondente (E4).
  conta_id       uuid references public.accounts(id) on delete set null,
  transaction_id uuid references public.transactions(id) on delete set null,
  observacoes    text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.receivable_receipts
  drop constraint if exists receivable_receipts_owner_fk;
alter table public.receivable_receipts
  add constraint receivable_receipts_owner_fk
  foreign key (receivable_id, user_id)
  references public.receivables (id, user_id)
  on delete cascade;

comment on constraint receivable_receipts_owner_fk on public.receivable_receipts is
  'FK COMPOSTA: o recebimento só aponta para recebível DO MESMO usuário. A RLS confere a própria linha e não alcança a linha apontada.';

create index if not exists receivable_receipts_user_idx
  on public.receivable_receipts (user_id);
create index if not exists receivable_receipts_receivable_idx
  on public.receivable_receipts (receivable_id);
-- A visão de caixa filtra por data; o índice existe para ela.
create index if not exists receivable_receipts_user_data_idx
  on public.receivable_receipts (user_id, recebido_em);

alter table public.receivable_receipts enable row level security;
alter table public.receivable_receipts force row level security;

drop policy if exists "own rows" on public.receivable_receipts;
create policy "own rows" on public.receivable_receipts for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop trigger if exists set_updated_at on public.receivable_receipts;
create trigger set_updated_at before update on public.receivable_receipts
  for each row execute function public.set_updated_at();
```

### A trava que impede receber mais do que se deve

Um `CHECK` não alcança outra tabela, então a regra vira trigger — **no banco, não num `if`**,
pela mesma razão que o uso único da aprovação da IA virou `unique` e o prazo virou `default`.

```sql
create or replace function public.receivable_receipts_nao_excede()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_devido  numeric(14,2);
  v_recebido numeric(14,2);
begin
  -- FOR UPDATE serializa dois recebimentos concorrentes do MESMO recebível:
  -- sem o lock, os dois leem o mesmo saldo e ambos passam.
  select r.valor into v_devido
    from public.receivables r
   where r.id = new.receivable_id
     for update;

  if v_devido is null then
    raise exception 'Recebível % não encontrado.', new.receivable_id;
  end if;

  select coalesce(sum(rr.valor), 0) into v_recebido
    from public.receivable_receipts rr
   where rr.receivable_id = new.receivable_id
     and rr.id is distinct from new.id;

  if v_recebido + new.valor > v_devido then
    raise exception
      'A soma dos recebimentos (%) passaria do valor devido (%).',
      v_recebido + new.valor, v_devido
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists receivable_receipts_nao_excede on public.receivable_receipts;
create trigger receivable_receipts_nao_excede
  before insert or update on public.receivable_receipts
  for each row execute function public.receivable_receipts_nao_excede();
```

### O que NÃO muda

- `receivables.status` e `receivables.pago_em` **continuam existindo e válidos.** Os 169
  recebíveis já pagos seguem legíveis sem nenhum backfill.
- **Nenhum dado é migrado.** Se um dia quisermos, a linha equivalente é derivável
  (`valor` integral em `pago_em`) — mas é decisão sua, não desta migration.
- `status` passa a ser **derivado na leitura** a partir da soma dos recebimentos
  (`pendente` / `parcial` / `pago`), mantendo `cobrado` e `ignorado` como decisão sua.
  A coluna continua no banco; quem manda passa a ser a soma. Isso é código, não schema.

---

## M2 — `transactions.liquidado_em` (caixa exato)

**Por quê:** `transactions` tem `purchase_date` e `competence_date`, **nenhuma data de
liquidação**. Hoje o saldo usa `competence_date` como aproximação. D9 pediu caixa exato.

```sql
-- supabase/migrations/<timestamp>_transactions_liquidado_em.sql
-- D9: data em que o dinheiro efetivamente entrou ou saiu da conta.
-- NULA em todas as 377 linhas existentes: a leitura cai para `competence_date`
-- e a tela DECLARA a aproximação. Nada é inventado e nada é reescrito.

alter table public.transactions
  add column if not exists liquidado_em date;

comment on column public.transactions.liquidado_em is
  'Dia em que o dinheiro entrou/saiu da conta. NULO = desconhecido; a leitura de caixa cai para competence_date e a tela declara a aproximação. Nunca preencher por dedução.';

-- Só faz sentido num lançamento liquidado. As 377 linhas atuais têm a coluna nula,
-- então o CHECK entra sem validar nada retroativamente.
alter table public.transactions
  drop constraint if exists transactions_liquidado_em_coerente;
alter table public.transactions
  add constraint transactions_liquidado_em_coerente
  check (liquidado_em is null or status in ('pago', 'recebido'));

-- A visão de caixa filtra por esta data.
create index if not exists transactions_user_liquidado_idx
  on public.transactions (user_id, liquidado_em)
  where liquidado_em is not null;
```

⚠️ **A função `public.account_balance()` NÃO é tocada nesta migration.** Ela hoje soma por
`competence_date`. Trocá-la muda o saldo de todas as telas de uma vez — é mudança de regra,
entra na REDESIGN-03-E, com teste de caracterização escrito antes e com o saldo conferido
número a número. Com `liquidado_em` nula em tudo, o resultado seria idêntico; mas "seria
idêntico" é exatamente o tipo de afirmação que se prova, não se assume.

---

## M3 — `categories.classificacao_padrao` (marcação de terceiros)

**Por quê:** D8. Hoje `categories.kind` distingue receita de despesa (e o formulário já tem o
seletor), mas não existe marcação de "isto costuma ser de terceiros".

⛔ **É atalho de preenchimento e filtro. NÃO é fonte de verdade.** A categoria propõe, o
lançamento registra. O motivo está em `METRICAS-FINANCEIRAS.md` §11 — e a REDESIGN-03-C2 tem
um teste que prova que nenhum relatório lê esta coluna para decidir de quem é o dinheiro.

```sql
-- supabase/migrations/<timestamp>_categories_classificacao_padrao.sql
-- D8: sugestão de classificação ao lançar nesta categoria. NUNCA lida por relatório.

alter table public.categories
  add column if not exists classificacao_padrao text;

alter table public.categories
  drop constraint if exists categories_classificacao_padrao_check;
alter table public.categories
  add constraint categories_classificacao_padrao_check
  check (classificacao_padrao is null
         or classificacao_padrao in ('pessoal', 'terceiro'));

comment on column public.categories.classificacao_padrao is
  'ATALHO: preenche o formulário de lançamento e serve de filtro. A verdade de quem é o dinheiro mora em transactions.classificacao + valor_pessoal, gravada no ato. Relatório NUNCA lê esta coluna. NULO = perguntar sempre.';
```

**`compartilhada` fica de fora de propósito.** Uma despesa compartilhada precisa das partes
por pessoa, que só existem no lançamento. Uma categoria não tem como carregá-las, e oferecer
a opção prometeria algo que o atalho não entrega.

---

## O que entra SEM migration

| Mudança | Como |
| --- | --- |
| **Renda pessoal × terceiros** (E2/E3) | `transactions.classificacao` e `valor_pessoal` **já existem** e o CHECK já aceita — só nunca foram preenchidos em receita. É formulário + `resumoMes` |
| **Rótulo de base** (E5) | Texto |
| **Minha parte efetiva** (D11) | Derivada na leitura: acordada + Σ recebíveis `ignorado` |
| **Três números de terceiros** | Derivados de `receivable_receipts` (M1) e `receivables` |

---

## Ordem de aplicação sugerida

**M3 → M2 → M1**, da menor consequência para a maior. Cada uma isolada, com a suíte rodando
entre elas e `src/types/supabase.ts` regenerado (⚠️ invariante 94: **leia o diff antes de
aceitar** — o gerador traz mais que a sua migration).

Nenhuma é aplicada sem você mandar.
