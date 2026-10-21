# Design — REDESIGN-03-F: pagar fatura uma vez só, e desfazer só com confirmação (P0-4, P1-8)

> Desenhado com o dono em **2026-10-21**, antes de qualquer linha de código. Escopo declarado em
> `docs/redesign/PLANO.md` (03-F) e `docs/redesign/AUDITORIA.md` (P0-4, P1-8).
>
> **Base:** `85d9ad1`, ponta de `feat/redesign-00-auditoria` (03-E integrada em `de6ef19` e
> registrada no STATUS em `85d9ad1`). Branch `feat/redesign-03f-pagamento-fatura`, sem upstream.
>
> Depois de aprovado, este documento é o contrato: quem discordar de algo aqui para e reporta.
>
> ⛔ O "aprovado" deste desenho **não** é o "aplique" da migration (§5.1). São duas autorizações
> separadas, em mensagens separadas.

---

## 1. O que a 03-F muda de natureza

- **Pagar uma fatura passa a ser um fato que só acontece uma vez, e a garantia mora no banco.**
  Reservar a fatura, inserir o lançamento de pagamento e gravar o ponteiro acontecem numa
  **única transação** (RPC `pagar_fatura`). Clique duplo, duas abas e retry convergem para **um**
  lançamento: a segunda chamada espera o lock da linha, reavalia `pago_em is null` e é recusada.
- ⛔ **Nenhum caminho do pagamento ou do desfazer deixa uma transferência debitando a conta sem
  fatura apontando para ela.** Não por ordem de requisições (que só escolhe *qual* estado ruim
  sobra numa queda — §3.3, fato 1), mas porque não há duas requisições: ou a transação inteira
  commita, ou nada acontece.
- **Desfazer passa a ser uma decisão lida, não um clique.** O diálogo diz, antes de confirmar,
  qual lançamento sai, de qual conta, com que valor o saldo volta e em que data o pagamento foi
  feito. A confirmação fica **presa ao que foi lido** (`lancamentoId`): se o pagamento mudou
  entre a leitura e o clique, nada é escrito.
- ⛔ **Nada é consertado retroativamente.** Órfão que exista no banco é contado e reportado, nunca
  apagado nem religado. (Em 2026-10-21 há **zero** — §2.1.)

O que **não** muda: `montarPagamentoFatura` continua sendo o único lugar que monta o lançamento
(o SQL só lista os **nomes** das colunas, e um teste de espelho os compara com o TS); o pagamento
continua gravando `liquidado_em` com a data do pagamento (K0.2 da 03-E); o total pago continua
sendo o `total_atual` lido da view no momento do pagamento; a tela de pagar continua igual (além
do `max` da B2).

---

## 2. Linha de base

### 2.1 Banco — medido em 2026-10-21, só leitura

`begin read only; set local role service_role;` (com FORCE RLS, sem o papel tudo dá zero).

| Medida | 2026-10-21 |
| --- | --- |
| faturas (`card_statements`) | 9 |
| faturas com `pago_em` | **0** |
| com `pago_em` e **sem** `pago_transacao_id` | 0 |
| com `pago_transacao_id` e sem `pago_em` | 0 |
| com `pago_transacao_id` apontando para lançamento inexistente | 0 |
| `status = 'paga'` sem `pago_em` / `pago_em` sem `status = 'paga'` | 0 / 0 |
| transferências sem destino (`type='transferencia'`, `transfer_account_id` nulo) | **0** |
| **candidatos a órfão do P0-4** (sem destino e sem fatura apontando) | **0** |
| lançamentos apontados por duas faturas | 0 |
| lançamentos / contas / cartões | 60 / 5 / 5 |

Consequência: o P0-4 **nunca chegou a deixar órfão** neste banco (não há fatura paga). Um índice
único em `pago_transacao_id` não teria violação para recusar — mas ele não entra (§3.2, D-F1).

### 2.2 Os cinco comandos — medidos em 2026-10-21, na ponta `85d9ad1`, antes de tocar em nada

| Comando | Resultado |
| --- | --- |
| `npm run test:run` | 277 arquivos, **6.546** testes, verdes |
| `npm run lint` | limpo |
| `npx tsc --noEmit` | limpo |
| `npm run build` | ok |
| `npm run perf:bundle` | mediana **216,3 KB**, 68 rotas, todas no orçamento |

Rotas (KB gz): `/(app)/faturas` **206,7** · `/(app)/cartoes` **218,2** ·
`/(app)/financeiro/lancamentos` **226,4** · `/(app)/dashboard/financeiro` **207,7** (0,5 acima
do registrado na integração da 03-E; medido, não herdado). O script só imprime as 10 maiores; as
quatro foram lidas com uma cópia dele no scratchpad que troca o `slice(0, 10)` por um filtro —
o repositório não mudou.

### 2.3 MCP do Supabase

`execute_sql` respondeu à leitura. Na 03-E o `apply_migration` funcionou e o `delete` de limpeza
foi recusado (`declined`); se acontecer de novo, **paro e pergunto** (§8).

---

## 3. As decisões desta sessão

### 3.1 Do dono (2026-10-21, uma de cada vez)

| # | Decisão |
| --- | --- |
| **K0** | **RPC atômica** (`security invoker`, `search_path = ''`), em vez do claim-first em TS sem migration. Motivo: com três requisições, a queda entre o `insert` e o religar deixa exatamente o estado proibido no §3 do prompt, e nenhuma ordem fecha essa janela. A RPC recebe o lançamento **montado por `montarPagamentoFatura`** e só ordena e torna atômico. Uma migration, com "aplique" próprio. ("Faz como acha recomendado") |
| **K1** | O diálogo do desfazer **lê ao abrir** (action só de leitura `preverDesfazerPagamento(id)`), diz lançamento, conta, valor que volta e data do pagamento (de `pago_em`, em Brasília), e a confirmação fica **presa** ao lançamento lido: `markStatementUnpaid(id)` → `markStatementUnpaid(id, lancamentoId)`. Cobre a fatura "paga sem lançamento". Diálogo lazy. ("Aprovado") |
| **K2** | RR6 e RR12 (da 03-C) **fora** da 03-F, destino **03-G**. ("Pode manter como recomendou") |
| **K3** | **Sim, como B2:** `dataDePagamentoFutura` na action do pagamento, depois do parse, com mensagem **própria** (a da P8 manda "deixar vazio", e o campo do diálogo não fica vazio), e `max={today}` no campo. ("Sim") |

### 3.2 Do desenho (decisões minhas, para o dono conferir na leitura)

| # | Decisão | Por quê |
| --- | --- | --- |
| D-F1 | **Sem índice único** em `card_statements.pago_transacao_id` | Com a RPC, cada pagamento cria o próprio lançamento; o índice não fecha nada novo, e o caminho que poderia repetir ponteiro (a edição do pagamento) não está nesta subfase |
| D-F2 | **Uma migration com as duas funções** (`pagar_fatura` e `desfazer_pagamento_fatura`) | É um "aplique" só para o mesmo fato (o ciclo de vida do pagamento). O desfazer precisa da mesma atomicidade: soltar a fatura e apagar o lançamento na mesma transação |
| D-F3 | O lançamento vai à RPC como **jsonb** e entra por `jsonb_populate_record(null::public.transactions, …)` com **lista explícita de colunas**; `user_id` vem de `auth.uid()`, nunca do jsonb | Os valores continuam saindo só de `montarPagamentoFatura`; o SQL conhece os nomes, e um teste de espelho compara a lista do SQL com `Object.keys` do payload. Nenhuma constante do lançamento é reescrita em SQL (invariante 41) |
| D-F4 | Os erros da RPC são **códigos** (`raise exception 'FATURA_JA_PAGA' using errcode = 'P0001'`), mapeados para pt-BR num módulo puro | O padrão das RPCs da IA (`AI_NOT_AUTHENTICATED` etc.). Mensagem em pt-BR dentro do SQL acoplaria texto de tela ao banco |
| D-F5 | Falha **desconhecida** da RPC (rede, timeout) devolve *"Não foi possível confirmar o pagamento. Recarregue a página para ver se ele foi registrado."* | A RPC é atômica, mas a resposta pode se perder depois do commit. A mensagem erra para "pode não ter acontecido" **e** não afirma que não aconteceu (invariante 37). Retentar é seguro: a segunda chamada é recusada |
| D-F6 | A action continua conferindo `pago_em` **antes** de chamar a RPC | Caminho rápido para a mensagem de sempre; **não é a trava** (a trava é a RPC, e há teste que prova a recusa vinda dela) |
| D-F7 | O desfazer só apaga um lançamento que **ainda tem a forma exata do pagamento que o sistema criou**: `type = 'transferencia'`, `status = 'pago'`, `transfer_account_id` nulo e `transfer_group_id` nulo. Qualquer outra forma → recusa `PAGAMENTO_EDITADO`, nada escrito | O pagamento pode ser **editado em Lançamentos mantendo o id e o ponteiro**: virar despesa no lugar (e então ser dividido, com recebíveis e recebimentos), ter o status trocado por `setTransactionStatus` (sai de `pago` → não mexe mais no saldo) ou virar transferência entre contas (uma linha só desde `20260720030000`, com o crédito no destino). Apagá-lo pela RPC pularia `protecaoDosRecebiveis` (03-D A4) e o texto "volta ao saldo" mentiria. O caminho que já existe para esses casos é **Lançamentos → excluir** (`deleteTransaction`: confere os recebíveis e reabre a fatura). Reproduzir a proteção em SQL seria a segunda implementação que a invariante 41 proíbe. Hoje: 0 faturas pagas, logo 0 casos. (Achado do revisor do desenho; decisão minha) |
| D-F11 | A mensagem da B2 chega à tela pelo **campo**: o diálogo de pagar lê `fieldErrors.dataPagamento` e a mostra sob a data (destacada) e no toast | `invalid()` sempre devolve "Verifique os campos destacados."; o diálogo só fazia `toast.error(res.error)` e não destacava nada — a regra do projeto ("só vale se algum campo for destacado"). (Achado do revisor do desenho; decisão minha) |
| D-F8 | A conta e o valor do diálogo vêm do **lançamento** (`transactions.account_id`, `amount`), não de `pago_conta_id` nem do `total_atual` | É o lançamento que sai e é na conta dele que o saldo volta. `total_atual` muda com estorno posterior; `pago_conta_id` pode divergir se o pagamento foi editado |
| D-F9 | O harness ganha `rpc()` (registra a chamada como operação e devolve o que o teste configurar) | Para provar que a action monta os argumentos por `montarPagamentoFatura` e mapeia cada erro. **O harness não executa SQL**: o comportamento da RPC é provado por varredura do arquivo e pela prova no banco (§10) |
| D-F10 | `pagoEmTimestamp` sai de `actions/statements.ts` (arquivo `"use server"`, que só pode exportar funções async) para `finance/statement-payment.ts`, puro e testado | O valor vai à RPC; precisa de teste próprio (meio-dia UTC = 09h BRT, mesmo dia) |

### 3.3 Os fatos que o desenho responde (varredura de 2026-10-21)

1. **Sem transação, a ordem só escolhe o estado ruim.** Reservar → inserir → religar em três
   requisições: queda entre reservar e inserir deixa "fatura paga sem lançamento" (lado seguro);
   queda entre inserir e religar — ou falha da compensação — deixa **transferência sem fatura
   apontando** (o proibido). Daí a K0.
2. **A view `card_statements_with_total` não expõe `pago_conta_id` nem `pago_transacao_id`.** Ela
   é `s.*` criada **antes** da migration que acrescentou as colunas
   (`20260627130000` < `20260627140000`), e `*` numa view é expandido na criação. A tela de
   faturas hoje **não sabe** qual lançamento o "Desfazer" apaga. Daí a leitura ao abrir (K1).
3. **Quem escreve `card_statements.pago_*`:** `actions/statements.ts` (pagar e desfazer),
   `actions/transactions.ts:139-142` (a edição do pagamento religa o ponteiro ao lançamento
   recriado) e `actions/transactions.ts:310-321` (`deleteTransaction` reabre a fatura **antes** de
   apagar — já na ordem segura, mas ignora o erro do `update`). Os dois últimos ficam como estão
   (RR-F-1, RR-F-2).
4. **Quem chama as actions:** só `src/app/(app)/faturas/statements-client.tsx` (`:369`, `:835`).
5. **O botão "Pagar" do diálogo já fica desabilitado durante o envio** (`statements-client.tsx:925`).
6. **FKs:** `card_statements.pago_transacao_id → transactions(id) on delete set null`;
   `transactions.account_id → accounts(id) on delete set null`. Apagar o lançamento zera o
   ponteiro; apagar a conta deixa o lançamento sem conta (o diálogo diz isso, §5.3).
7. **O harness não tem `rpc()`**, e o inventário `quem-escreve-transactions.test.ts` varre só
   `src/` (`actions/statements.ts` declarado com **4** escritas).

---

## 4. O mapa

| Origem | Item | Muda número? |
| --- | --- | --- |
| P0-4 | **M-F** a migration: `pagar_fatura` e `desfazer_pagamento_fatura` (K0) | não |
| P0-4 | **A1** a action de pagar passa pela RPC; harness `rpc()`; inventário | não, salvo o lançamento em dobro que deixa de nascer |
| P0-4 (o inverso) | **A2** a previsão e o desfazer pela RPC, preso ao lançamento lido (K1) | não |
| P1-8 | **A3** o diálogo de confirmação na tela (K1) | não |
| RR-E-12 | **B2** data de pagamento futura recusada (K3) | não (a competência já era essa data) |
| RR6 / RR12 | — fora (K2), destino 03-G | — |

---

## 5. Parte A

### 5.1 M-F · A migration (K0)

Arquivo `supabase/migrations/20261021120000_pagamento_fatura_atomico.sql`. Aditiva: duas funções,
**nenhuma** tabela, coluna, policy, índice ou dado. Idempotente (`create or replace`). O SQL abaixo
é o contrato; comentários e redação podem mudar, a lógica não.

```sql
-- REDESIGN-03-F · K0 — pagar e desfazer o pagamento de fatura viram UMA transação cada.
-- O lançamento é montado em TS por montarPagamentoFatura e chega pronto em p_lancamento:
-- aqui só se ORDENA e torna ATÔMICO. As colunas listadas no insert são espelhadas por teste.

create or replace function public.pagar_fatura(
  p_statement_id uuid,
  p_pago_em timestamptz,
  p_lancamento jsonb
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_conta uuid := (p_lancamento ->> 'account_id')::uuid;
  v_lancamento uuid;
begin
  if v_user is null then
    raise exception 'FATURA_SEM_SESSAO' using errcode = 'P0001';
  end if;
  if v_conta is null or p_pago_em is null then
    raise exception 'FATURA_PAGAMENTO_INVALIDO' using errcode = 'P0001';
  end if;

  -- 1. A reserva. Concorrente espera o lock da linha, reavalia pago_em e afeta 0 linhas.
  update public.card_statements
     set status = 'paga', pago_em = p_pago_em, pago_conta_id = v_conta
   where id = p_statement_id
     and pago_em is null;
  if not found then
    if exists (select 1 from public.card_statements where id = p_statement_id) then
      raise exception 'FATURA_JA_PAGA' using errcode = 'P0001';
    end if;
    raise exception 'FATURA_NAO_ENCONTRADA' using errcode = 'P0001';
  end if;

  -- 2. O lançamento: nomes daqui, valores de montarPagamentoFatura; user_id da sessão.
  insert into public.transactions (
    user_id, type, payment_method, status, account_id, transfer_account_id,
    transfer_group_id, card_id, statement_id, category_id, subcategory_id,
    amount, purchase_date, competence_date, liquidado_em, description
  )
  select v_user, r.type, r.payment_method, r.status, r.account_id, r.transfer_account_id,
         r.transfer_group_id, r.card_id, r.statement_id, r.category_id, r.subcategory_id,
         r.amount, r.purchase_date, r.competence_date, r.liquidado_em, r.description
    from jsonb_populate_record(null::public.transactions, p_lancamento) r
  returning id into v_lancamento;

  -- 3. O ponteiro.
  update public.card_statements
     set pago_transacao_id = v_lancamento
   where id = p_statement_id;

  return v_lancamento;
end;
$$;

create or replace function public.desfazer_pagamento_fatura(
  p_statement_id uuid,
  p_lancamento_id uuid
) returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_pago_em timestamptz;
  v_atual uuid;
  v_forma public.transactions%rowtype;
begin
  if auth.uid() is null then
    raise exception 'FATURA_SEM_SESSAO' using errcode = 'P0001';
  end if;

  -- 0. Trava a linha e confere que o pagamento é O MESMO que o dono leu.
  select pago_em, pago_transacao_id into v_pago_em, v_atual
    from public.card_statements
   where id = p_statement_id
     for update;
  if not found then
    raise exception 'FATURA_NAO_ENCONTRADA' using errcode = 'P0001';
  end if;
  if v_pago_em is null then
    raise exception 'FATURA_NAO_PAGA' using errcode = 'P0001';
  end if;
  if v_atual is distinct from p_lancamento_id then
    raise exception 'PAGAMENTO_MUDOU' using errcode = 'P0001';
  end if;
  -- Só apaga o que ainda tem a forma do pagamento que pagar_fatura criou (D-F7).
  if p_lancamento_id is not null then
    select * into v_forma
      from public.transactions where id = p_lancamento_id
       for update;
    if not found
       or v_forma.type <> 'transferencia'
       or v_forma.status <> 'pago'
       or v_forma.transfer_account_id is not null
       or v_forma.transfer_group_id is not null then
      raise exception 'PAGAMENTO_EDITADO' using errcode = 'P0001';
    end if;
  end if;

  -- 1. Solta a fatura. 2. Apaga o lançamento (o saldo da conta volta junto).
  update public.card_statements
     set status = 'aberta', pago_em = null, pago_conta_id = null, pago_transacao_id = null
   where id = p_statement_id;
  if p_lancamento_id is not null then
    delete from public.transactions where id = p_lancamento_id;
  end if;
end;
$$;

revoke all on function public.pagar_fatura(uuid, timestamptz, jsonb) from public;
revoke all on function public.pagar_fatura(uuid, timestamptz, jsonb) from anon;
grant execute on function public.pagar_fatura(uuid, timestamptz, jsonb) to authenticated;
revoke all on function public.desfazer_pagamento_fatura(uuid, uuid) from public;
revoke all on function public.desfazer_pagamento_fatura(uuid, uuid) from anon;
grant execute on function public.desfazer_pagamento_fatura(uuid, uuid) to authenticated;

comment on function public.pagar_fatura(uuid, timestamptz, jsonb) is '…';
comment on function public.desfazer_pagamento_fatura(uuid, uuid) is '…';
```

**Por que `security invoker` basta:** a RLS de `card_statements` e `transactions` vale dentro da
função. Uma fatura de outro dono é invisível → `FATURA_NAO_ENCONTRADA`; o `insert` passa pelo
`with check (user_id = auth.uid())`. Um autenticado que chame a RPC direto com outro payload não
ganha nada que já não tenha: ele pode inserir em `transactions` direto pelo PostgREST (RR-F-4).

**Por que a ordem dentro da função não é a garantia:** dentro de uma transação, um `raise` desfaz
tudo o que veio antes. O que garante "uma vez só" é a **condição** da reserva (`pago_em is null`)
sob o lock da linha; o que garante "nunca transferência sem ponteiro" é a **atomicidade**. A ordem
reserva → insert → ponteiro é mantida por clareza, e as mutações (§7) foram escolhidas sobre o
que é observável — não sobre a ordem.

**Teste do arquivo** (`src/lib/finance/m-f-pagamento-fatura.test.ts`, padrão de
`m2-liquidado-em.test.ts`: achado por conteúdo, SQL sem comentários, normalizado):
- existe exatamente um arquivo que cria `public.pagar_fatura` e um que cria
  `public.desfazer_pagamento_fatura`;
- as duas são `security invoker` com `set search_path = ''`; **nenhuma** `security definer`;
- a reserva tem `where id = p_statement_id and pago_em is null` e é seguida de
  `if not found then` com `raise exception 'fatura_ja_paga'` **antes** do `insert`;
- o `insert` vem de `jsonb_populate_record(null::public.transactions, p_lancamento)` e o
  `user_id` é `v_user` (= `auth.uid()`), nunca lido do jsonb;
- **espelho:** a lista de colunas do `insert` (sem `user_id`) é **igual**, como conjunto, a
  `Object.keys(montarPagamentoFatura(...))` — inclui `liquidado_em`;
- nenhuma das duas tem bloco `exception when` (que engoliria a falha mantendo a reserva);
- o desfazer tem `for update`, as três recusas (`fatura_nao_paga`, `pagamento_mudou` com
  `is distinct from p_lancamento_id`, `pagamento_editado` com as **quatro** condições de forma —
  `type`, `status`, `transfer_account_id`, `transfer_group_id`) **antes** do `update` e do
  `delete`;
- revoke de `public` e `anon`, grant a `authenticated`, para as duas;
- o arquivo **não** tem `create table`, `alter table`, `create policy`, `create index`, nem
  `insert`/`update`/`delete` **fora** dos corpos das funções (nenhum backfill).

**Fluxo (§9, passo 1):** arquivo + teste → `saas-shield-br:migration-validator` → **pedido de
"aplique" numa mensagem só para isso** → `apply_migration` pelo MCP → conferência no banco pelo
objeto (`pg_proc`: as duas funções, `prosecdef = false`, `proconfig` com `search_path=""`, grants)
e não pela versão do histórico → `generate_typescript_types` com o diff lido: **só** as duas
entradas em `Functions` entram (invariante 94).

### 5.2 A1 · A action de pagar passa pela RPC

`src/lib/actions/statements.ts`, `markStatementPaid(id, contaId, dataPagamento?)` — **assinatura
igual**:

1. `authContext` → `pagamentoFaturaSchema.safeParse` → (B2) recusa de data futura.
2. Lê a fatura na view (`pago_em`, `total_atual`, `competencia`, `card_id`). `pago_em` preenchido
   → "Esta fatura já está paga." **sem chamar a RPC** (D-F6). Total ≤ 0 → recusa de sempre.
3. Confere a conta e lê o nome do cartão, como hoje.
4. `payload = montarPagamentoFatura(...)` — inalterado.
5. `supabase.rpc("pagar_fatura", argumentosDoPagamento(...))`, onde `argumentosDoPagamento`
   (puro, em `statement-payment.ts`) devolve `{ p_statement_id, p_pago_em: pagoEmTimestamp(data),
   p_lancamento: payload }`.
6. Erro → `mensagemDoErroDoPagamento(error)` (puro): `FATURA_JA_PAGA` → "Esta fatura já está
   paga."; `FATURA_NAO_ENCONTRADA` → "Fatura não encontrada."; `FATURA_SEM_SESSAO` → a mensagem
   de sessão de `notAuthed`; qualquer outro → a de D-F5.
7. `revalidateStatements()`.

**Harness** (`src/test/supabase-em-memoria.ts`): opção `rpc?: (nome, args) => Resultado`; cada
chamada vira uma `Operacao` (`tipo: "rpc"`, nome e args). Sem a opção, `rpc()` devolve erro —
um teste que esquece de configurar não passa por acaso.

**Testes da A1** (`src/lib/actions/statements.test.ts`, novo):
- a RPC recebe exatamente `montarPagamentoFatura(...)` como `p_lancamento` (com `liquidado_em` =
  data do pagamento) e `p_pago_em = "<data>T12:00:00Z"`;
- `statements.ts` **não escreve** em `transactions` (nenhuma operação de `insert`/`delete` na
  tabela durante o pagamento — a escrita é da RPC);
- fatura já paga na leitura → nenhuma chamada à RPC; RPC recusando `FATURA_JA_PAGA` (a corrida
  que a leitura não viu) → a mesma mensagem, nada escrito em tabela nenhuma;
- erro desconhecido → a mensagem de D-F5;
- `pagoEmTimestamp`, `argumentosDoPagamento` e `mensagemDoErroDoPagamento` com testes puros em
  `statement-payment.test.ts`.

**Inventário** (`quem-escreve-transactions.test.ts`), no mesmo commit:
- `lib/actions/statements.ts`: **4 → 1** (sobra o `update` de `moveTransactionToStatement`, que
  não toca status), motivo reescrito;
- seção nova, **escritas por função SQL**: varre `supabase/migrations/` por
  `insert into public.transactions` / `update public.transactions` / `delete from
  public.transactions` dentro de `create or replace function` e declara, por arquivo, quantas e
  por quê. Hoje: só a M-F, com 2 (o `insert` de `pagar_fatura` — nasce `pago` com
  `liquidado_em`, coerente com o CHECK; o `delete` de `desfazer_pagamento_fatura`). Uma função
  nova que escreva em `transactions` deixa a suíte vermelha.

### 5.3 A2 · A previsão e o desfazer (K1)

**Leitura ao abrir** — `preverDesfazerPagamento(id): Promise<ActionResult<PrevisaoDoDesfazer>>`,
em `actions/statements.ts`, só leitura: `card_statements` (`pago_em`, `pago_transacao_id`) e,
havendo ponteiro, `transactions` (`id, type, status, amount, description, transfer_account_id,
transfer_group_id, account:accounts!transactions_account_id_fkey(name)`). A decisão é pura —
`previsaoDoDesfazer({ fatura, lancamento })`, em `src/lib/finance/desfazer-pagamento.ts`:

```ts
type PrevisaoDoDesfazer =
  | { estado: "com-lancamento"; lancamentoId: string; descricao: string;
      conta: string | null; valor: number; dataPagamento: string /* 'yyyy-MM-dd' BRT */ }
  | { estado: "sem-lancamento"; dataPagamento: string }
  | { estado: "pagamento-editado" }
  | { estado: "nao-paga" };
```

- `pagamento-editado` = o lançamento apontado perdeu a forma do pagamento (D-F7): a regra da
  forma é **uma** função pura, `temFormaDePagamentoDeFatura(lancamento)`, e o teste de espelho da
  M-F confere que o SQL testa as mesmas quatro condições;

- `dataPagamento` = `dateInSaoPaulo(pago_em)` — **nunca** `.slice(0, 10)`;
- `conta: null` = a conta foi excluída (o lançamento ficou sem conta, e nenhum saldo volta);
- ponteiro preenchido mas lançamento não encontrado → `sem-lancamento` (o FK zeraria o ponteiro,
  então é corrida; o texto é o mesmo e a confirmação manda `null`, que a RPC recusa com
  `PAGAMENTO_MUDOU` se o ponteiro ainda existir).

**Confirmação** — `markStatementUnpaid(id: string, lancamentoId: string | null)`. **Mudança de
assinatura (K1):** o segundo parâmetro é **obrigatório**, para nenhum chamador desfazer sem dizer
o que leu. Chama `rpc("desfazer_pagamento_fatura", { p_statement_id, p_lancamento_id })`. Erros:
`FATURA_NAO_PAGA` → "Esta fatura já não está paga."; `PAGAMENTO_MUDOU` → "O pagamento desta
fatura mudou desde que você abriu a confirmação. Abra de novo para ver o atual.";
`PAGAMENTO_EDITADO` → "O lançamento deste pagamento foi editado em Lançamentos. Para desfazer,
exclua-o por lá — a fatura reabre junto."; `FATURA_NAO_ENCONTRADA`, sessão e desconhecido como na A1 (o
desconhecido: "Não foi possível confirmar o desfazer. Recarregue a página para ver o estado
atual.").

**Testes da A2:** `temFormaDePagamentoDeFatura` recusando cada uma das quatro formas editadas
(despesa, `pendente`, com destino, com grupo); a previsão nos quatro estados (incluindo `pago_em` às 01:30Z → dia anterior em
BRT, e conta excluída); a action manda o `lancamentoId` lido; cada código de erro na mensagem
dele; `statements.ts` sem escrita direta em `card_statements` nem em `transactions` no desfazer.

### 5.4 A3 · O diálogo na tela (K1)

- `src/app/(app)/faturas/desfazer-pagamento-dialog.tsx` (`"use client"`), carregado por
  `next/dynamic` (objeto literal) + `useLazyDialog`. O botão "Desfazer" fica em
  `statements-client.tsx` e só abre o diálogo (`setDesfazendo(s.id)`); ele **não** é `trigger` do
  diálogo, então o diálogo pode ser lazy.
- Ao abrir: chama `preverDesfazerPagamento`; enquanto lê, mostra "Lendo o pagamento…" e o botão
  de confirmar desabilitado. Erro de leitura → a mensagem, sem botão de confirmar.
- O texto sai de `textoDoDesfazer(previsao)` (puro, em `desfazer-pagamento.ts`), formatado com
  `formatCurrency`/`formatDate`:
  - **com lançamento:** *"O lançamento «{descrição}» será excluído. {valor} volta ao saldo de
    {conta}. Pagamento feito em {dd/MM/yyyy}. As compras desta fatura voltam a ficar em aberto."*;
    conta excluída: *"…era de uma conta que foi excluída; nenhum saldo volta."*;
  - **sem lançamento:** *"Esta fatura está marcada como paga em {data}, mas sem lançamento de
    pagamento. Desfazer só a reabre; nenhum saldo muda."*;
  - **pagamento editado:** a mensagem de `PAGAMENTO_EDITADO`, com link para
    `/financeiro/lancamentos`, **sem** botão de confirmar;
  - **não paga:** *"Esta fatura já não está paga."*, sem botão de confirmar.
- Botões: "Cancelar" e "Desfazer pagamento" (`variant="destructive"`), desabilitado durante o
  envio ("Desfazendo…"). Sucesso → toast "Pagamento desfeito.", fecha, `router.refresh()`; erro →
  toast com a mensagem e `router.refresh()` (o estado mudou por fora).
- Claro e escuro pelos tokens; a 390 px sem rolagem horizontal (regras 1–3 do layout responsivo:
  `DialogContent` com `sm:max-w-md`, texto com `min-w-0`/quebra).
- Bundle: `/faturas` e `/cartoes` medidos antes (§2.2) e depois.

**Testes da A3** (o projeto não tem teste de componente, invariante 25 → varredura de fonte):
- `statements-client.tsx` **não importa nem chama** `markStatementUnpaid`; só
  `desfazer-pagamento-dialog.tsx` o chama, e só dentro do handler de confirmação;
- o diálogo é importado por `next/dynamic`;
- `textoDoDesfazer` com testes puros: cada estado; conta, valor (formatado) e data **presentes**
  no texto do `com-lancamento`.

---

## 6. Parte B — aprovada item a item

### 6.1 B2 · Data de pagamento futura (K3)

- `caixa.ts`: `MSG_DATA_PAGAMENTO_FATURA_FUTURA = "A data do pagamento não pode ser futura. Pague
  a fatura quando o valor sair da conta."`, ao lado da P8.
- `markStatementPaid`: depois do `safeParse`, `if (dataDePagamentoFutura(parsed.data.dataPagamento,
  hojeISO())) return invalid({ dataPagamento: [MSG_DATA_PAGAMENTO_FATURA_FUTURA] })` — antes de
  qualquer leitura, sem chamar a RPC.
- `PayStatementDialog`: `max={today}` no `<Input type="date">` (UX, não trava) e, em erro, a
  mensagem de `fieldErrors.dataPagamento` sob o campo (`aria-invalid`) e no toast, caindo para
  `res.error` quando não há erro de campo (D-F11).
- Teste: data de amanhã recusada com `fieldErrors.dataPagamento = [MSG_DATA_PAGAMENTO_FATURA_FUTURA]`,
  **nenhuma** operação no harness; hoje e passado aceitos; varredura de fonte: o diálogo lê
  `fieldErrors` (sem isso a mensagem nunca aparece).

---

## 7. Mutações — o critério de aceite

Cada uma aplicada sozinha, **compilando**; o **nome** de cada teste que cai é registrado; a
restauração é conferida por `git diff --quiet`, nunca pelo verde. Com a K0, parte das mutações do
prompt passa a morar no SQL; o mapeamento abaixo diz onde, e por quê.

| # | Mutação | Tem de derrubar |
| --- | --- | --- |
| Y1 | a action volta a inserir em `transactions` direto (sem a RPC) | teste da A1 (nenhuma escrita direta) **e** `quem-escreve-transactions.test.ts` |
| Y2 | a reserva perde `and pago_em is null` | `m-f-pagamento-fatura.test.ts` |
| Y3 | a reserva perde o `if not found … raise 'FATURA_JA_PAGA'` | `m-f-pagamento-fatura.test.ts` |
| Y4 | a função ganha `exception when others then return null` (engole a falha do insert, mantendo a reserva) | `m-f-pagamento-fatura.test.ts` |
| Y5 | o desfazer perde a condição `is distinct from p_lancamento_id` | `m-f-pagamento-fatura.test.ts` |
| Y6a | a action deixa de passar `montarPagamentoFatura(...)` como `p_lancamento` | teste da A1 |
| Y6b | o `insert` do SQL perde `liquidado_em` | espelho em `m-f-pagamento-fatura.test.ts` |
| Y7 | o desfazer perde o `for update` (lê sem travar) | `m-f-pagamento-fatura.test.ts` |
| Y8 | o desfazer perde o `raise 'FATURA_NAO_PAGA'` (desfazer duas vezes apagaria com `null`) | `m-f-pagamento-fatura.test.ts` |
| Y9 | `statements-client.tsx` chama `markStatementUnpaid` direto do botão | teste da A3 |
| Y10 | `textoDoDesfazer` deixa de dizer conta, valor ou data (três variantes) | teste da A3 |
| Y11 | um ponto novo de escrita em `transactions` (em `src/` **ou** numa função SQL) fora do inventário | `quem-escreve-transactions.test.ts` (duas variantes) |
| Y12 | a M-F vira `security definer`, ou perde o revoke de `anon` | `m-f-pagamento-fatura.test.ts` |
| Y13 | data de pagamento futura aceita | teste da B2 |
| Y14 | `previsaoDoDesfazer` usa `pago_em.slice(0, 10)` | teste da A2 (01:30Z → dia anterior) |
| Y15 | `markStatementUnpaid` manda `null` em vez do `lancamentoId` lido | teste da A2 |
| Y16 | o desfazer perde uma das quatro condições de forma (variantes: no SQL e em `temFormaDePagamentoDeFatura`) | `m-f-pagamento-fatura.test.ts` (espelho) e teste da A2 |
| Y17 | o diálogo de pagar deixa de ler `fieldErrors` | teste da B2 |

⚠️ Y2, Y3, Y5, Y7 e Y8 são provadas **por varredura do SQL** — o harness não executa SQL. O
comportamento real (duas chamadas concorrentes → um lançamento; desfazer duas vezes → nada na
segunda) é provado **uma vez**, no banco, com dado sintético (§10). Mutação que sair verde é
**medida** antes de ser chamada de fraqueza.

---

## 8. Restrições (as do prompt, mais as do desenho)

- Migration **só** a M-F, com o "aplique" literal do dono numa mensagem só para isso. Se o MCP
  recusar, **paro e pergunto**. Nenhuma policy, nenhum backfill, nenhum conserto de órfão.
- Sem push, sem merge, sem deploy, sem upstream. `STATUS.md`, `CLAUDE.md` e `AGENTS.md` intocados.
- `markStatementPaid(id, contaId, dataPagamento?)` **igual**; `markStatementUnpaid(id)` →
  `markStatementUnpaid(id, lancamentoId)` (K1, o único desvio de assinatura).
- `dashboard.test.ts` e `dashboard-caracterizacao.test.ts` sem diff; `src/types/supabase.ts` só
  com as duas funções.
- Fixture sintética sempre; nenhum `Date.now()`/`new Date()` sem argumento no código novo.

---

## 9. Ordem de execução — um commit por passo

⚠️ **Desvio da ordem do prompt:** a migration vem **antes** da A1, porque a A1 chama a RPC e os
tipos gerados precisam dela para o `tsc` passar.

0. Este desenho, aprovado (só docs).
1. **M-F** — arquivo + teste → validador → **"aplique"** → aplicação → conferência no banco →
   tipos (commit próprio, só as duas funções).
2. **A1** — `statement-payment.ts` (puros), harness `rpc()`, action, testes, inventário.
3. **A2** — `desfazer-pagamento.ts` (puros), `preverDesfazerPagamento`, `markStatementUnpaid(id,
   lancamentoId)`, testes.
4. **A3** — o diálogo lazy, o botão, testes de varredura, bundle medido.
5. **B2** — a recusa, a mensagem, o `max`, o teste.
6. **Prova com dado sintético** (§10), plano mostrado **antes** de rodar.
7. Mutações Y1–Y15, os cinco comandos, `TZ=UTC`, a contagem da §2.1 repetida e a revisão final da
   branch inteira no modelo mais capaz.

Cada passo fecha com `npx vitest run` verde em `src/lib/finance/`, `src/lib/actions/`,
`src/lib/validators/` (mais `src/app/`/`src/test/` quando tocados), **a suíte inteira antes de
cada commit**, e o `git diff` revisado. Cada tarefa substancial passa pelo `ai-router-br:route`
com pacote de até 5 arquivos; desenho, migration, prova no banco e mutações ficam no principal;
patch de worker é dado não confiável (`tsc` antes de aplicar).

---

## 10. A prova no banco (passo 6) — o plano, a mostrar de novo antes de rodar

1. **Marcar:** uma fatura sintética num cartão existente, competência **2031-01** (sem dado real,
   vencimento longe — nenhuma notificação do Cron), `observacoes = '[03F-SINT]'`; uma conta
   existente. Contagem e **hash do saldo** dessa conta (`account_balance`) antes.
2. **Concorrência:** duas chamadas a `pagar_fatura` **ao mesmo tempo**, cada uma em
   `begin; set local role authenticated; set_config('request.jwt.claims', …, true)`, com a
   primeira segurando a transação por `pg_sleep(5)` antes do commit, e
   `clock_timestamp()` registrado nas duas. Esperado: **um** lançamento `[03F-SINT]`; a segunda
   termina com `FATURA_JA_PAGA` **depois** de ~5 s (prova de que esperou o lock, não de que rodou
   depois). Se as duas chamadas do MCP não sobrepuserem (os tempos dizem), uso `dblink` se a
   extensão existir; senão, declaro a prova como **sequencial** — mais fraca — e digo.
3. **Desfazer duas vezes** (também concorrentes, pela mesma técnica): lançamentos `[03F-SINT]` = 0;
   a segunda com `FATURA_NAO_PAGA`.
4. **Remoção** de tudo pelo marcador, contagem antes e depois; o hash do saldo igual ao de
   partida. Se o MCP recusar o `delete`, paro e peço que o dono rode no SQL Editor.
5. ⚠️ Terminar e limpar **antes das 21h de Brasília** (Cron). Nenhum valor, nome ou saldo vai ao
   repositório: só contagens e "hash igual".

---

## 11. Critérios de aceite

- Os cinco comandos verdes na ponta, com números medidos; mediana e as quatro rotas antes × depois.
- Y1–Y15 cada uma derrubando o teste nomeado.
- `TZ=UTC npx vitest run src/lib/finance/ src/lib/actions/ src/lib/notifications/` verde.
- Banco, só leitura, no fim: as contagens da §2.1 **iguais** (depois de remover o sintético) e o
  saldo de cada conta igual por hash.
- A prova do §10 com o antes × depois.
- Conferência visual do diálogo (claro, escuro, 390 px) — pela extensão do Chrome ou pedida ao
  dono, com o que olhar.

---

## 12. Risco residual novo

| # | Risco | Destino |
| --- | --- | --- |
| RR-F-1 | A **edição** do pagamento em Lançamentos (`updateTransaction`: apaga → recria → religa) não é atômica: falha no recriar deixa a fatura paga sem lançamento (lado seguro, e agora visível no diálogo); falha no religar deixa o lançamento recriado **sem** ponteiro — o estado que a 03-F fecha no pagamento | **03-G** (proposto) |
| RR-F-2 | `deleteTransaction` ignora o erro do `update` que reabre a fatura e apaga o lançamento mesmo assim → fatura paga sem lançamento (lado seguro; o diálogo da A3 a mostra e reabre) | **03-G** (erro é erro) |
| RR-F-3 | O valor pago é o `total_atual` lido **antes** da RPC: uma compra lançada no mesmo instante fica fora do pagamento (como hoje) | aceito |
| RR-F-4 | A RPC aceita o lançamento montado pelo chamador; um autenticado que a chame direto escolhe os campos — sem privilégio novo, porque ele já insere em `transactions` pelo PostgREST com a mesma RLS | aceito, declarado no comentário da função |
| RR-F-5 | O comportamento da RPC é provado por varredura do SQL e por **uma** prova no banco; o harness não executa SQL. Uma edição futura da função que fuja das formas varridas não é pega | aceito; refazer a prova do §10 se a função mudar |
| RR-F-6 | Pagamento **editado** em Lançamentos (virou despesa, mudou de status, ganhou destino) não se desfaz em `/faturas` (D-F7); o caminho é Lançamentos → excluir, que confere os recebíveis mas **não pede confirmação** (o P1-8 fecha só o botão de `/faturas`). Hoje 0 casos | aceito; a confirmação de excluir em Lançamentos fica para quem tratar o RR-F-1 (**03-G**, proposto) |
| RR6 / RR12 | (03-C) "grava antes de recusar" em `updateTransaction` | **03-G** (K2) |
