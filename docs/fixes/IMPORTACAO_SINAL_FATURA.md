# Importação de fatura — a convenção de sinal não é universal (bug real, 2026-08-06)

## Sintoma (como o usuário viu)

1. Importou uma fatura, excluiu o lote, e os lançamentos continuaram em
   **Financeiro → Lançamentos marcados como "Estorno de cartão"**, deixando os relatórios
   negativos.
2. Reimportou o mesmo arquivo e **tudo apareceu como duplicado**.
3. Ao forçar a importação de uma linha duplicada, **sumiram as opções de "Importar parcelado"
   e de dividir com terceiros**.

Os três sintomas tinham **uma causa só**.

## Causa

`applyMapping` assumia, para origem `cartao`, que **valor negativo é crédito**:

```ts
tipo = valorAssinado < 0 ? "receita" : "despesa"; // ← premissa errada
```

Isso vale para a **planilha/CSV de fatura** (Itaú, Nubank), onde a compra vem positiva e o
estorno negativo. Mas **no OFX — padrão do Nubank e da maioria dos bancos — é o contrário**:
a compra é `TRNAMT` negativo com `TRNTYPE=DEBIT`, e crédito/pagamento vem positivo.

Resultado no banco do usuário: a fatura Nubank de 07/2026 recebeu **48 compras como estorno**
(`transactions.type = 'receita'` com `card_id`) e ficou com `total_atual = −3.762,68`.

Daí saem os três sintomas:

| Sintoma | Por quê |
| --- | --- |
| "Fica como estorno e negativo" | crédito **subtrai** de `total_atual`; a fatura inteira virou crédito |
| "Reimportar acusa duplicata" | `deleteImportBatch` **não apaga transações** (por design), e a chave de dedup usa a **magnitude** do valor — as linhas casam com os próprios lançamentos errados |
| "Some parcelado/terceiro" | `podeDividir` exige `tipo === 'despesa'`, e no commit `origem cartao + tipo receita` desvia para `createCardEstorno`, que **não parcela e não divide** |

## Correção

1. **`detectarSinalNegativoDespesa(table, mapping)`** (`src/lib/import/mapping.ts`, pura e
   testada): decide a convenção **pelo arquivo**, por **contagem de linhas** — numa fatura a
   maioria das linhas é compra. A soma não serve: o pagamento da fatura anterior é **uma** linha
   com magnitude parecida com a soma de todas as compras. Pelo mesmo motivo o pagamento
   (`ehPagamentoFatura`) fica **fora da amostra** — é o crédito garantido de toda fatura e
   envenenaria a contagem num arquivo curto. Empate → `false` (convenção da planilha).
2. **`applyMapping` passou a respeitar `sinalNegativoDespesa` também em fatura**; o auto-ignore
   do pagamento da fatura acompanha o lado crédito, seja ele positivo ou negativo.
3. **`parseImportFile` detecta e grava** a convenção em `import_batches.sinal_negativo_despesa`
   quando a origem é cartão (em extrato de conta quem decide continua sendo o usuário).
4. **A revisão mostra o switch de sinal também para fatura** — detecção errada é corrigível sem
   reupload, via "Aplicar mapeamento".
5. **Sentido da linha visível e corrigível** (`Compra`/`Estorno`, `Despesa`/`Receita`):
   `updateImportRowSchema` já aceitava `tipo`, mas nenhuma tela expunha. Trocar o sentido
   reabre parcelamento e divisão.
6. **`undoImportBatch`** (novo): apaga os lançamentos que o lote criou e devolve as linhas para
   revisão, fechando o ciclo "errei → desfaço → reimporto" sem que a dedup acuse os próprios
   lançamentos. Bloqueia com fatura já paga ou recebível já cobrado/pago; o delete cascateia
   parcelas, divisão e recebíveis pendentes.

## Regra que fica

> **Sinal de arquivo importado é DADO, não convenção.** Nenhuma origem tem um sentido fixo de
> sinal: OFX e planilha discordam dentro do mesmo cartão. Detecte do arquivo, grave no lote,
> mostre na tela e deixe corrigir — e nunca derive `tipo` de um sinal presumido.

> **Excluir o registro da importação não desfaz lançamento** — são coisas diferentes, e sem um
> "desfazer" explícito o usuário fica sem saída: a dedup passa a acusar os lançamentos que ele
> queria substituir.

## Segunda rodada (mesmo dia): a duplicidade que não era, e a linha sem saída

Dois falsos positivos de deduplicação apareceram na primeira fatura importada pelo fluxo já
corrigido — os dois vinham de tratar **chave composta** e **identificador (FITID)** como
evidências independentes:

| Caso real (OFX Nubank) | O que acontecia | Por quê |
| --- | --- | --- |
| Duas compras `Vmt*Gil & Par` de R$ 18,95 no mesmo dia, **FITIDs diferentes** | a 2ª virava `duplicada` | a chave composta (data+valor+descrição+cartão) é idêntica, e ninguém olhava o FITID |
| `Crédito de parcelamento de compra` (R$ 185,88, crédito) e `Parcelamento de Compra … 1/3` (R$ 67,19, compra), **mesmo FITID** | o crédito virava `duplicada` | o Nubank **reusa o FITID** entre o crédito e a 1ª parcela |

**O identificador do arquivo manda nos dois sentidos** (`detectarDuplicados`):

- FITIDs **diferentes** ⇒ não é duplicata, mesmo com a chave composta idêntica — o arquivo já
  afirmou que são transações distintas.
- FITID **igual** só acusa duplicata quando a **chave composta também bate** — senão é
  identificador reaproveitado entre lançamentos diferentes.
- Sem identificador em uma das linhas não dá para afirmar nada: mantém o aviso, que o usuário
  resolve na revisão.

Contra o que **já existe no sistema** a chave composta continua sozinha: `transactions` não
guarda o identificador do arquivo de origem.

### E a linha que ficou de fora depois do commit

Marcar "não é duplicidade" **depois** de importar não tinha para onde ir: `updateImportRow` e
`commitImport` recusavam qualquer lote `importado`, então a linha nunca chegava à fatura — que
é exatamente o relato *"se eu coloquei que não é duplicidade, precisa contar no valor da
fatura"*. Agora:

- a trava é **por linha**, não pelo lote: a linha que já virou lançamento é imutável (aponta
  para editar em Financeiro ou desfazer o lote), as demais seguem editáveis;
- `commitImport` **roda de novo** num lote importado — ele só processa `status =
  'para_importar'`, então nada é recriado;
- a revisão mostra um aviso âmbar com **quanto ainda não entrou na fatura** e um botão
  **"Importar pendentes"**.

## Limpeza dos dados afetados

As 48 transações erradas ficaram **órfãs** (o lote que as criou tinha sido excluído, e
`import_rows.transaction_id` é `on delete set null`), então o "Desfazer importação" não as
alcança — precisaram de limpeza direta, seguida de reimportação do OFX pelo fluxo corrigido.
