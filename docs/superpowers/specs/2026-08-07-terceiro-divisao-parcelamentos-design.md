# Terceiro e divisão nos parcelamentos, faturas e lançamentos — desenho

**Data:** 2026-08-07 · **Fase:** avulsa (Financeiro, Fases 04–06) · **Estado:** aprovado

## O problema

Uma compra parcelada pode nascer dividida (`applySplitParcelado`, Fase 05), mas **depois de
criada a divisão é intocável**:

- [`transaction-form.tsx`](../../../src/app/(app)/financeiro/lancamentos/transaction-form.tsx)
  exclui `parcelado` do editor (`canSplit`), e o card de Lançamentos só linka para
  `/parcelamentos` quando é parcelado;
- [`updateInstallmentPurchase`](../../../src/lib/actions/installments.ts) só edita descrição,
  categoria e observações;
- `/parcelamentos` **não mostra terceiro nenhum** — nem no card, nem por parcela;
- `/faturas` mostra "Quem paga esta fatura" no rodapé, mas **item a item** não diz de quem é.

O caso concreto: um parcelamento que entrou pela importação (ex.: `Credpag*Fianca Loft`,
parcela 8/12) sem marcar o terceiro. Hoje não há como corrigir sem excluir e refazer.

## Decisões tomadas

1. **Editável em `/parcelamentos`; visível em `/faturas` e `/financeiro/lancamentos`.**
   Faturas e Lançamentos passam a mostrar o terceiro item a item (nome + valor), sem editar.
2. **Refaz a divisão inteira, mas recusa quando alguém já cobrou/pagou.** A correção alcança
   as parcelas de faturas já fechadas ou pagas — é o caso do import. Se qualquer `receivable`
   estiver `cobrado` ou `pago`, a ação é recusada com a frase que o Lançamentos já usa.
3. **O defeito adjacente entra no escopo:** `cancelInstallmentFuture` não tocava nos
   `receivables` das parcelas canceladas.

## Por que a mudança é menor do que parece

[`dashboard.ts`](../../../src/lib/finance/dashboard.ts) e a tela `/faturas` já derivam
*meu × terceiros* de `receivables` agrupados por fatura — **não** de `valor_pessoal`. Basta a
edição gravar os `receivables` certos e fatura, dashboard, relatórios e `/terceiros` ficam
corretos sem tocar em nenhuma agregação. O "refletir em tudo" já está construído; falta a
escrita.

## Arquitetura

### 1. `decidirReaplicacao` — a regra, pura (`src/lib/finance/split.ts`)

```
decidirReaplicacao({
  classificacaoAtual, classificacaoNova,
  totalCentavosAtual, totalCentavosNovo,
  divisaoAtual: Map<personId, centavos>,
  divisaoNova:  Map<personId, centavos>,
  temRecebivelFechado: boolean,
}) → { acao: "nada" } | { acao: "bloqueado", motivo } | { acao: "reaplicar" } | { acao: "limpar" }
```

Sem I/O, testada em `split.test.ts`. É o único lugar que decide se a divisão mudou, se pode
ser mexida e para onde ela vai. `nada` cobre o caso que já valia hoje: editar só a descrição
de um gasto dividido **não** reescreve recebíveis.

### 2. `reapplySplit` — o I/O, único para os dois casos (`src/lib/finance/split-reapply.ts`)

Server-only, no espírito de `split-persist.ts` (não é `"use server"`). Parametrizado pelo modo:

- `{ kind: "avista", statementId, cardId, dataPrevista }` → `applySplit`
- `{ kind: "parcelado", parcelas }` → `applySplitParcelado`

Roteiro: resolver a divisão nova com `dividirDespesa` → ler as `shared_expenses` gravadas →
`decidirReaplicacao` → apagar `receivables` + `shared_expenses` → re-aplicar → gravar
`classificacao` e `valor_pessoal` (ou zerar os dois em "pessoal").

`updateTransaction` passa a chamar isto; `reapplySplitOnEdit` deixa de existir. **É o que
impede a regra do parcelado nascer diferente da do lançamento.**

### 3. `updateInstallmentSplit(parentId, input)` (`src/lib/actions/installments.ts`)

Carrega o pai (`parcelado = true`) e as parcelas **ativas** com `statement_id` e valor, e
delega ao núcleo em modo parcelado.

> **A base da divisão é a soma das parcelas ATIVAS, não `valor_total`.** Com parcelas
> canceladas, `valor_total` é maior do que ainda existe em fatura, e distribuir sobre ele
> quebraria a invariante de `distribuirTerceirosPorParcela` (Σ terceiros ≤ Σ parcelas).
> Quando os dois números diferem, o diálogo declara qual está sendo dividido.

Para pré-preencher o diálogo não há código novo: a compra parcelada **é** uma `transaction`,
então `getTransactionSplit(parentId)` já lê a divisão dela.

### 4. `cancelInstallmentFuture` — o conserto

Passa a apagar os `receivables` `pendente` das parcelas que cancelou e a recalcular o
`valor_pessoal` do pai. Se alguma dessas parcelas tiver recebível `cobrado`/`pago`, **a ação
inteira é recusada** — em vez de cancelar a parcela e deixar a cobrança órfã, ou de cancelar
umas sim e outras não em silêncio.

### 5. `SplitEditor` compartilhado (`src/components/financeiro/split-editor.tsx`)

O bloco "Classificação + partes + preview" está hoje duplicado em `transaction-form.tsx` e
`import-split-dialog.tsx`. Vira um componente **controlado**
(`{ classificacao, parts, onChange, totalReais, people, baseHint }`) usado pelos dois e pelo
diálogo novo de `/parcelamentos`. No formulário de lançamento, o `useFieldArray` dá lugar a um
`Controller` sobre `parts` — a forma do payload não muda.

## Telas

**`/parcelamentos`** — quando `classificacao !== "pessoal"`: `ClassificacaoBadge` no cabeçalho
do card, linha "meu R$ X · Fulano R$ Y" sob o total, e a parte do terceiro **em cada parcela**
na lista expandida. Botão "Dividir" (ícone `Users`) na barra de ações, abrindo o diálogo.

**`/faturas`** — cada item (lançamento à vista e parcela) mostra "Fulano R$ Y" quando há
recebível daquele item naquela fatura. Os `receivables` já chegam à página; basta agrupar por
`transaction_id` e `installment_id`. O bloco "Quem paga esta fatura" fica como está.

**`/financeiro/lancamentos`** — a linha que hoje diz "meu R$ X" passa a dizer
"meu R$ X · Fulano R$ Y".

**Dados novos:** `TX_SELECT` e `INSTALLMENT_PURCHASE_SELECT` passam a embutir
`shared_expenses(person_id, valor, person:people(id,nome))`; o de parcelamento embute também
`receivables(installment_id, person_id, valor, status)` para a parte por parcela.

## Testes

Puros, sem banco: `decidirReaplicacao` (mudou/não mudou, bloqueio por recebível fechado,
limpar, troca de pessoa mantendo o valor, mudança só de classificação). A distribuição por
parcela já é coberta por `split.test.ts`.

Verificação: `npm run test:run` + `npm run lint` + `npx tsc --noEmit` + `npm run build`.

## Fora do escopo (declarado)

- Editar a divisão a partir de `/faturas`.
- Alterar valor, quantidade de parcelas ou fatura de destino.
- Reescrever o passado quando há recebível `cobrado`/`pago` — a ação recusa, não reescreve.
- Nenhuma migration: as tabelas `shared_expenses` e `receivables` já servem.
