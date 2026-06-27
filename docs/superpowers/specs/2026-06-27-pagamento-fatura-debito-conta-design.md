# Pagamento de fatura com débito em conta — Design

**Data:** 2026-06-27
**Status:** Aprovado (aguardando revisão do spec)
**Origem:** botão "Pagar" da fatura hoje só marca `status='paga'` + `pago_em`; não toca em conta nem em lançamentos.

## Problema

Ao clicar **Pagar** numa fatura, o sistema deve **debitar uma conta bancária** pelo valor da
fatura, **sem duplicar** os gastos nos relatórios. Os lançamentos do cartão já entram nos
relatórios **uma vez, via total da fatura** — então um novo lançamento de *despesa* no
pagamento contaria o mesmo dinheiro duas vezes. Além disso, ao marcar a fatura como paga, os
lançamentos do cartão devem aparecer como **pagos** na sub-aba Lançamentos; ao desfazer, devem
voltar a **em aberto** e o débito na conta deve ser **estornado**.

## Contexto do código (fonte da verdade)

- **Duas bases de cálculo, nunca misturadas** (`src/lib/finance/dashboard.ts`):
  1. **Competência** — transações à vista/não-cartão por `competence_date`.
  2. **Fatura** — gasto no cartão pelo `total_atual` da view `card_statements_with_total`
     (que soma os lançamentos do cartão). Lançamento de cartão **nunca** é contado direto.
  - `transferencia` e `ajuste` ficam **fora** de entradas/saídas; `cancelado` também.
- **Saldo da conta** (`account_balance` / view `accounts_with_balance`): soma transações que
  referenciam a conta com `status IN ('pago','recebido')`; para `transferencia`,
  `account_id = -amount`. Lançamento de cartão tem `account_id = NULL` → **não** afeta saldo.
- **View `card_statements_with_total`**: `total_atual = Σ despesa(statement_id) − Σ receita(statement_id) + Σ parcelas ativas(statement_id)`. **Ignora `transferencia`** → um pagamento tipo transferência **não** infla a fatura.
- **Lista de itens da fatura** filtra por `statement_id` (`getTransactions`, `queries.ts:108`).
- **Dedup de transferência** na lista de lançamentos só ocorre quando há `transfer_group_id`
  (`transactions-client.tsx:83`) → um pagamento **sem grupo** aparece como uma linha única.
- **Status "derivado na leitura, nunca gravado"** é o padrão do projeto (fatura, parcelas,
  tarefas atrasadas).

## Decisões (confirmadas com o usuário)

1. **Débito = linha visível** do tipo **transferência** (não despesa).
2. **Lançamentos do cartão "em aberto até pagar"** — porém **derivado na leitura** a partir de
   `card_statements.pago_em` (não grava status por lançamento). Resultado visível idêntico ao
   pedido, sem migração de dados e com "desfazer" automático.
3. **Valor debitado = total cheio** da fatura (`total_atual` no momento do pagamento). A parte
   de terceiros continua rastreada em "A Receber".
4. **Sempre perguntar a conta** num diálogo ao clicar Pagar (sem padrão pré-selecionado).

## Solução

### 1. Schema (1 migration, idempotente)

Duas colunas anuláveis em `card_statements`:

| Coluna | Tipo | Papel |
|---|---|---|
| `pago_conta_id` | `uuid REFERENCES accounts(id) ON DELETE SET NULL` | conta que pagou (exibir "pago via X") |
| `pago_transacao_id` | `uuid REFERENCES transactions(id) ON DELETE SET NULL` | lançamento de pagamento (desfazer com precisão) |

RLS já vigente na tabela cobre as colunas. Regenerar `src/types/supabase.ts` (MCP
`generate_typescript_types`) após aplicar.

### 2. Lançamento de pagamento

Ao pagar, inserir **1** transação:

- `type = 'transferencia'`, `status = 'pago'`
- `account_id =` conta escolhida; `transfer_account_id = NULL`; `transfer_group_id = NULL`
- `amount =` `total_atual` da fatura no momento do pagamento
- `purchase_date` e `competence_date` = hoje
- `description = "Pagamento fatura {mês/ano} — {nome do cartão}"`
- `card_id = NULL`, `statement_id = NULL` (não vincular: mantém a lista de itens da fatura limpa)

Efeitos:
- **Saldo da conta** cai (transferência conta como `-amount` no lado `account_id`).
- **Relatórios de despesa** não mudam (transferência fica fora).
- **`total_atual` da fatura** não muda (view ignora transferência).
- Aparece na sub-aba **Lançamentos** como uma linha "Pagamento fatura …".

### 3. Exibição "em aberto / pago" dos lançamentos do cartão

Derivado na leitura, sem gravar:

- Em `getTransactions`, adicionar `statement:card_statements(pago_em)` ao `select`.
- Em `transactions-client.tsx`, para itens de cartão (`card_id != null`), o badge mostra
  **"pago"** quando `statement.pago_em != null`, senão **"em aberto"**. Itens não-cartão seguem
  usando o `status` real.

### 4. Action `markStatementPaid(id, contaId)`

Contrato padrão (`authContext` → Zod → Supabase → `revalidatePath`):

1. `authContext`; valida `id` e `contaId` (Zod). Conta deve existir e ser do usuário (RLS).
2. Carrega a fatura da view `card_statements_with_total` (precisa de `total_atual`, `pago_em`,
   `card_id`, `competencia`, nome do cartão).
3. Bloqueios: já paga (`pago_em != null`) → erro; `total_atual <= 0` → erro ("nada a pagar").
4. Insere o lançamento de pagamento (item 2) com `amount = total_atual`; captura o `id`.
5. `update card_statements set status='paga', pago_em=now, pago_conta_id=contaId,
   pago_transacao_id=<id>`.
6. `revalidatePath('/faturas')`, `'/cartoes'`, `'/financeiro/lancamentos'`, `'/financeiro'`.

> Atomicidade: como o cliente Supabase não abre transação multi-statement, ordenar
> insert → update. Se o update falhar após o insert, apagar o lançamento recém-criado
> (compensação) antes de retornar `dbError`.

### 5. Action `markStatementUnpaid(id)`

1. `authContext`; carrega `card_statements` (`pago_transacao_id`).
2. Se houver `pago_transacao_id`, **deleta** essa transação (estorna o saldo da conta).
3. `update card_statements set status='aberta', pago_em=null, pago_conta_id=null,
   pago_transacao_id=null`.
4. Revalida as mesmas rotas.

### 6. UI — diálogo de pagamento

- `statements-client.tsx`: o botão **Pagar** abre um `Dialog` (shadcn) com:
  - total da fatura (formatado BRL), nome do cartão e competência;
  - **seletor de conta** (lista `accounts` ativas; sempre pergunta, sem default);
  - confirmação chama `markStatementPaid(id, contaId)`.
- Sucesso → toast "Fatura paga e debitada de {conta}." + `router.refresh()`.
- **Desfazer** continua um clique (sem diálogo) chamando `markStatementUnpaid(id)`.
- O botão Pagar fica **desabilitado** quando `total_atual <= 0`.
- A página precisa receber as contas ativas (carregar em `faturas/page.tsx` e passar ao client).

### 7. Lógica pura + testes

- Helper puro p.ex. `montarPagamentoFatura({ total, cartaoNome, competencia, contaId, hoje })`
  que devolve o payload do lançamento (type/amount/description/datas). Testado em
  `*.test.ts` (ambiente node): valor = total; descrição com mês/cartão; type `transferencia`.
- Invariante coberta: pagamento não altera `total_atual` (transferência fora da view) — validar
  via o helper/contrato, não via banco.

## Casos de borda

- **Total ≤ 0**: Pagar desabilitado; action também bloqueia.
- **Já paga**: action bloqueia novo pagamento.
- **Valor travado** no pagamento: se a fatura mudar depois (novo estorno/lançamento), desfazer
  e pagar de novo — sem reconciliação automática (YAGNI).
- **Conta excluída** depois: FKs `ON DELETE SET NULL` em `pago_conta_id`/`pago_transacao_id` e
  no `account_id` do lançamento; saldo deixa de considerar o lançamento órfão.
- **Terceiros**: permanecem em "A Receber"; o débito é do total cheio.

## Fora de escopo (YAGNI)

- Pagamento parcial / múltiplas contas numa fatura.
- Reconciliação automática quando a fatura muda após paga.
- Conta de pagamento padrão por cartão (foi descartado: sempre perguntar).

## Arquivos afetados

- `supabase/migrations/<timestamp>_card_statements_pagamento.sql` (novo)
- `src/types/supabase.ts` (regenerar)
- `src/lib/actions/statements.ts` (`markStatementPaid`/`markStatementUnpaid`)
- `src/lib/validators/*` (schema do pagamento)
- `src/lib/finance/queries.ts` (select de `pago_em`; carregar contas p/ a página)
- `src/lib/finance/<helper>.ts` + `*.test.ts` (lógica pura do payload)
- `src/app/(app)/faturas/statements-client.tsx` (diálogo de pagamento)
- `src/app/(app)/faturas/page.tsx` (passar contas ativas)
- `src/app/(app)/financeiro/lancamentos/transactions-client.tsx` (badge derivado)

## Verificação

`npm run test:run` + `npm run lint` + `npx tsc --noEmit` + `npm run build`. Atualizar
`docs/project/CURRENT_STATUS.md` e `docs/handoff/*` ao concluir.
