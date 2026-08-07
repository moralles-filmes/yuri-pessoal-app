# Saldo por dia na lista de lançamentos (extrato) — 2026-08-06

**Pedido:** em `/financeiro/lancamentos`, mostrar o saldo de cada dia, como no extrato do
banco. Filtrando por conta, o saldo daquela conta.

## O contrato do saldo

Saldo do dia `D` = `initial_balance` do escopo **+** soma dos lançamentos **liquidados**
(`pago`/`recebido`) com `competence_date <= D`. É o saldo do **fim** do dia.

Tabela de sinais, espelhando `public.account_balance`
(`supabase/migrations/20260625120600_account_balance.sql`):

| tipo | efeito |
| --- | --- |
| `receita` | `+ amount` |
| `ajuste` | `+ amount` |
| `despesa` | `− amount` |
| `transferencia`, conta = origem (`account_id`) | `− amount` |
| `transferencia`, conta = destino (`transfer_account_id`) | `+ amount` |
| status `pendente` ou `cancelado` | zero |

### Escopo, resolvido pelo filtro da URL

- **filtro `card` ligado → não existe saldo.** O cabeçalho do dia mostra só a data. Compra no
  cartão não tem `account_id` (conferido no banco: das 172 linhas de cartão, nenhuma tem conta)
  e não move dinheiro — quem move é o **pagamento da fatura**, gravado como `transferencia`
  com `transfer_account_id` nulo.
- **filtro `account` ligado** → saldo daquela conta.
- **nenhum dos dois** → saldo somado de **todas** as contas, rotulado "saldo total".
  Transferência entre contas próprias se anula (`−` na origem, `+` no destino); pagamento de
  fatura tem destino nulo, então subtrai.

### O saldo ignora os demais filtros, de propósito

Com `categoria` ou `tipo` ligados a lista encolhe, mas o saldo continua sendo o saldo
**verdadeiro** da(s) conta(s) naquele dia. Decisão explícita do usuário: um saldo que
refletisse só as linhas visíveis não seria saldo. Por isso a janela é buscada em
`getDailyBalances`, e não derivada das linhas que a tela recebeu.

### Pendente não entra

Só `pago`/`recebido`, espelhando `SETTLED_STATUSES` e `account_balance`. Assim o extrato bate
com o saldo de `/financeiro/contas` e com o card "Saldo total". Um lançamento pendente aparece
na lista com seu `StatusBadge` e não move o saldo.

## Arquitetura

```
page.tsx (Server Component, force-dynamic)
  ├─ getTransactions(filters)                       ← lista (já existia)
  └─ getDailyBalances({ accountId, cardId, dias })   ← novo
        ├─ rpc account_balance_before(conta, from)   ← 1 escalar
        └─ movimentos liquidados em [from, to]       ← 1 consulta
              ↓
        saldosPorDia()  ← src/lib/finance/daily-balance.ts (puro, testado)
              ↓
        Record<'yyyy-MM-dd', number>  →  TransactionsClient
```

`from`/`to` saem dos próprios dias visíveis, então funciona com ou sem filtro de mês.

**Por que uma função SQL para a abertura:** custo fixo na rede independente de quantos anos de
histórico existirem. A alternativa (andar para trás a partir do `current_balance` da view
`accounts_with_balance`) dispensaria SQL novo, mas exigiria trazer tudo o que aconteceu do mês
consultado até hoje.

**Preço assumido:** a tabela de sinais passa a existir em dois lugares — `account_balance_before`
(SQL) e `efeitoNoSaldo` (TS). Ambos apontam um para o outro em comentário. O cruzamento das duas
implementações sobre os dados reais de julho/2026 (138 lançamentos, 29 dias) bateu em todos os
dias, incluindo transferência entre contas próprias, pagamento de fatura e dias só de cartão.

**Conta em centavos inteiros.** `amount` é `numeric(14,2)`; somar centenas em ponto flutuante
acumularia erro de centavo. `saldosPorDia` usa `reaisParaCentavos`/`centavosParaReais`.

**`competence_date` é data pura.** O agrupamento compara a string `'yyyy-MM-dd'` crua
(lexicográfico = cronológico). Só o rótulo do cabeçalho constrói uma data de grade local
(`diaExtenso`, em `src/lib/format.ts`) — passar `'yyyy-MM-dd'` para `new Date()` daria o dia
anterior em Brasília.

## Tela

A lista deixa de ser uma pilha plana e passa a ser agrupada por dia. Cada dia é uma `<section>`
com um cabeçalho: data à esquerda, saldo à direita. Como a ordem é decrescente, o saldo aparece
antes dos lançamentos que o produziram — igual ao app do banco.

A data saiu de dentro do card do lançamento (ficaria repetida dentro do próprio bloco do dia).

O card do lançamento virou o componente `TransactionCard`, no mesmo arquivo: com o agrupamento,
o JSX ganharia mais um nível de aninhamento sobre um bloco que já era profundo.

Responsividade: `min-w-0 truncate` no lado da data (o irmão da direita é `shrink-0`), valor com
`tabular-nums`, negativo em `text-destructive`.

## Arquivos

| Arquivo | O que é |
| --- | --- |
| `supabase/migrations/20260809100000_account_balance_before.sql` | função SQL do saldo de abertura |
| `src/lib/finance/daily-balance.ts` | `efeitoNoSaldo` + `saldosPorDia` (puros) |
| `src/lib/finance/daily-balance.test.ts` | 17 testes |
| `src/lib/finance/queries.ts` | `getDailyBalances` |
| `src/lib/format.ts` | `diaExtenso` (data pura → "ter., 28 de julho") |
| `src/app/(app)/financeiro/lancamentos/page.tsx` | busca os saldos |
| `src/app/(app)/financeiro/lancamentos/transactions-client.tsx` | agrupamento + `DiaHeader` + `TransactionCard` |

## Verificação

2397 testes, lint, `tsc` e build passando; a função SQL conferida contra `account_balance`
(5250,80 pelas três vias) e a função pura cruzada com o SQL sobre dados reais.

⚠️ **Não exercitado na aplicação rodando** — a tela está atrás do login e não havia sessão
disponível. Vale abrir `/financeiro/lancamentos` e conferir o visual antes de dar por fechado.
