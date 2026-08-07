# A divisão com terceiros fica visível na importação e na fatura — desenho

**Data:** 2026-08-07 · **Fase:** avulsa (Financeiro, Fases 05–06) · **Estado:** aprovado

## O problema

A divisão com terceiros já é **configurável** na revisão da importação (Fase 06) e já é
**editável** depois de criada (iteração de 2026-08-07). O que ela não é, ainda, é **visível
enquanto o número importa**:

1. **Importação.** O resumo do lote mostra "Total a importar R$ 3.003,26" — um número só.
   Numa fatura em que mais da metade é de terceiro, esse número não responde a pergunta que
   se faz na hora de conferir: *quanto disso é meu?*. Cada linha dividida mostra a badge
   *Compartilhada* / *De terceiro*, mas **sem valor nenhum** — a divisão foi digitada e
   sumiu de vista.
2. **Faturas.** Os lançamentos passaram a mostrar "meu R$ X · Fulano R$ Y" item a item, mas
   **não dizem que tipo de divisão é**. Uma compra 100% de terceiro aparece como
   "meu R$ 0,00 · Fulano R$ 70,03", e quem lê tem que deduzir do zero.

## Decisões tomadas

1. **Na importação, resumo E linha.** O card do topo quebra o total em *meu* + uma entrada
   por pessoa; cada linha dividida mostra a sua própria divisão. Vale nos dois estados da
   tela — revisando e depois de importado — porque são o mesmo card e a mesma tabela.
2. **Na fatura, badge + valores, sem `meu R$ 0,00`.** Quando a compra é 100% de terceiro a
   badge já disse tudo; o zero só ocuparia espaço.
3. **A classificação é lida, não deduzida.** Nada de inferir *De terceiro* de `meu === 0`.
4. **Divisão que não fecha não vira zero.** Fica fora do somatório e o lote se declara
   parcial.

## Arquitetura

### `src/lib/import/split-totals.ts` — o núcleo, puro

`totals.ts` responde *"quanto o commit vai criar"* somando por status, e continua como está.
A pergunta nova é outra — *"de quem é isso"* — e ganha módulo próprio:

```
divisaoDaLinha(row)            → { ok: true, meuCentavos, partes[] } | { ok: false, motivo }
divisaoPorStatus(rows, status) → { meu, terceiros, porPessoa[], parcial, naoResolvidas }
```

Regras que ele fixa:

- **Não reimplementa a divisão.** Chama `dividirDespesa` (`src/lib/finance/split.ts`), o mesmo
  motor que o `commitImport` usa ao gravar. Uma segunda aritmética faria a revisão discordar
  do que entra na fatura — exatamente o erro que a invariante "todo total sai de um lugar só"
  existe para impedir.
- **Aritmética em centavos**, como `totals.ts`. O percentual já cai com `Math.floor` dentro de
  `dividirDespesa` e o resto de centavo fica comigo.
- **Estorno (receita) nunca é dividido** e **subtrai do meu** — é crédito na minha fatura.
  Assim `meu + Σ terceiros === liquido` continua fechando na tela.
- **Divisão que não fecha é declarada, não chutada.** `setImportRowSplit` não valida as partes
  contra o valor da linha (ele não conhece o valor), então uma linha pode ter partes somando
  mais que o total. Nesse caso `dividirDespesa` lança, a linha sai **não resolvida**, fica
  **fora** dos somatórios e o lote vira `parcial`. Mesma disciplina do `value_state` da Dieta
  e do `completude` da IA: ausência não é zero, e o número incompleto se identifica.
- **Pessoa repetida em linhas diferentes soma numa entrada só**, ordenada por valor
  decrescente.

**Linha marcada "Como parcelamento":** o valor é o de **uma** parcela e a divisão foi digitada
contra ela — que é exatamente o que entra nesta fatura. O commit escala as partes por `qtd`
(`escalarPartesParcelado`) porque `createInstallmentPurchase` divide sobre o total da compra;
a tela, não. É a mesma convenção que o "Total a importar" já usa hoje.

### Telas

**`src/app/(app)/importar/import-review.tsx`**

- *Resumo:* sob o "Total a importar" / "Total importado", a linha
  `meu R$ 1.662,38 · Nicole Telles R$ 1.340,88`. Só aparece havendo terceiro. Havendo linha
  não resolvida, o card escreve quantas ficaram de fora do cálculo.
- *Linha:* os valores entram **ao lado da badge que já existe**, na coluna Descrição — não na
  coluna Valor. A coluna Valor é estreita e alinhada à direita; nome de pessoa ali empurra a
  tabela na horizontal (regra 3 de responsividade). Em *De terceiro*, só o nome e o valor.

**`src/app/(app)/faturas/statements-client.tsx`** — `PartesDoItem` passa a receber
`classificacao` e renderiza badge + valores, omitindo o *meu* quando é zero.

**Dados novos:** `getStatementInstallmentItems` acrescenta `classificacao` ao embed
`parent:transactions(...)`, e `StatementInstallmentItem` ao tipo. O lançamento à vista já tem
`classificacao` (o `TX_SELECT` seleciona `*`).

## Testes

`src/lib/import/split-totals.test.ts`, puros: pessoal; por valor; por percentual com resto de
centavo; 100% de terceiro; estorno; partes maiores que o valor → parcial com o resto ainda
somando; duas linhas da mesma pessoa numa entrada só; status filtrando ignoradas e duplicadas.

Verificação: `npm run test:run` + `npm run lint` + `npx tsc --noEmit` + `npm run build`.

## Fora do escopo (declarado)

- O histórico de lotes em `/importar`.
- Editar a divisão a partir da fatura.
- A quebra *meu × terceiros* no aviso de "linhas pendentes" de um lote já importado.
- `/financeiro/lancamentos`, que já ganhou a linha de valores na iteração anterior.
- Nenhuma migration: `import_rows.classificacao`/`split_parts` e `transactions.classificacao`
  já existem.
