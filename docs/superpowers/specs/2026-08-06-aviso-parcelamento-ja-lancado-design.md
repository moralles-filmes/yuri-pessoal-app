# Aviso de parcelamento já lançado na importação de fatura — Design

**Data:** 2026-08-06
**Status:** ✅ Implementado (2026-08-06)
**Origem:** relato do usuário — "importa a fatura de julho, marca a compra como parcelamento;
ao importar a fatura de agosto o sistema não avisa que aquela compra já está lançada, e o valor
entra duplicado".

## Problema

Uma compra parcelada importada de uma fatura **cria as parcelas futuras de uma vez**. Quando a
fatura do mês seguinte é importada, a linha daquela mesma compra vem no arquivo de novo — e a
deduplicação atual **não a reconhece**, porque ela procura no lugar errado.

Exemplo real do usuário:

1. Fatura de **julho**: linha `NETSHOES 5/12 — R$ 105,00`, importada como **parcelamento**.
   Nascem 8 parcelas (5..12) de R$ 105,00, cada uma ancorada na fatura do seu mês.
2. Fatura de **agosto**: o arquivo traz `NETSHOES 6/12 — R$ 105,00`.
3. A dedup deixa passar, a linha entra como despesa avulsa **na mesma fatura** onde a parcela 6
   já estava. A fatura de agosto conta R$ 210,00 pela mesma compra.

Quando a compra é **de terceiros**, o estrago dobra: a parcela 6 já tinha o `receivable` da
pessoa, e a linha importada cria um segundo. O "A Receber" da Nicole passa a cobrar duas vezes.

### Por que a dedup atual não pega

`existingKeysFor` ([`src/lib/actions/imports.ts:103-126`](../../../src/lib/actions/imports.ts))
monta as chaves de duplicidade lendo **só a tabela `transactions`**:

```
purchase_date | amount | descrição normalizada | targetId
```

Mas uma compra parcelada é modelada assim
([`src/lib/finance/installments.ts:1-21`](../../../src/lib/finance/installments.ts)):

- **1** linha em `transactions` (a compra-pai) com o **total** (R$ 840,00), `purchase_date` de
  **julho**, `statement_id` NULL — ela não entra em fatura nenhuma;
- **8** linhas em `transaction_installments` (as parcelas), cada uma com seu `valor`,
  `numero` e `statement_id`.

A linha de agosto (R$ 105,00, agosto) não bate com a compra-pai (R$ 840,00, julho) por nenhum
dos três campos, e **as parcelas não estão em `transactions`**. Não é um caso de heurística
frouxa: é um lugar que a dedup nunca olhou.

O mesmo vale para a **última parcela** (`k === N`), que o commit importa como despesa avulsa
(`imports.ts`, ramo `else if (batch.origem === "cartao")`), e para parcelamentos criados **à
mão** em `/parcelamentos` — a origem não muda nada, o que conta é existir parcela ativa.

## Contexto do código (fonte da verdade)

- **Pipeline puro da importação:** `applyMapping` → `detectarDuplicados` → grava `import_rows`.
  Chamado em dois lugares: `parseImportBatch` (`imports.ts:236-250`) e `remapImportBatch`
  (`imports.ts:334-346`).
- **`detectarDuplicados`** ([`src/lib/import/dedup.ts`](../../../src/lib/import/dedup.ts))
  compara contra `existingKeys` (o que já existe) e contra o próprio lote, com o **FITID
  mandando nos dois sentidos** (regra de 2026-08-06). Nada disso muda aqui.
- **`parseParcela`** ([`src/lib/import/normalize.ts:153-165`](../../../src/lib/import/normalize.ts))
  já extrai `k/N` e `k de N`, exigindo `N > 1` e `1 <= k <= N` — é o que impede `POSTO 24/7`
  de virar parcela.
- **`normalizarDescricao`** remove acentos e pontuação: `"NETSHOES 5/12"` vira
  `"netshoes 5 12"`. **O número da parcela sobrevive à normalização** — por isso julho e agosto
  nunca casariam por descrição sem um tratamento explícito.
- **Status de linha** (`src/lib/import/constants.ts:45-62`): `pendente`, `para_importar`,
  `duplicada`, `ignorada`, `importada`, `erro`. Linha `duplicada` **não entra** no commit
  (`commitImport` só lê `status = 'para_importar'`) e a revisão já oferece o botão **Importar**
  para destravá-la ([`import-review.tsx:1018-1028`](../../../src/app/(app)/importar/import-review.tsx)).
- **Competência do lote** (`import_batches.competencia_fatura`): a fatura à qual todas as linhas
  pertencem. Detectada no parse/remap por `detectarCompetenciaLote` e confirmável na revisão.
- **Parcela cancelada:** `cancelInstallmentFuture` marca `status = 'cancelada'` e a view de
  fatura passa a ignorá-la. Parcela cancelada **não ocupa** mais a fatura.

## Decisões (confirmadas com o usuário)

1. **Bloquear como `duplicada`**, não apenas avisar. Reusa o botão "Importar" e a trava por
   linha que já existem; se só avisasse, a duplicata voltaria a acontecer por desatenção.
2. **Conferir linhas com e sem "k/N"**. Com marcação: casa por número + total + descrição-base,
   ou por número + total + valor. Sem marcação: casa por valor + descrição-base contra as
   parcelas que caem na fatura sendo importada.
3. **Escopo é só daqui pra frente.** Duplicatas já lançadas em faturas passadas ficam de fora —
   sem conferidor retroativo, sem tela nova.

## Solução

### 1. Helper novo em `src/lib/import/normalize.ts`

```ts
/** Remove a marcação "k/N" ou "k de N" da descrição, só quando parseParcela a aceita. */
export function removerMarcaParcela(s: string | null | undefined): string

/** Descrição comparável entre meses: sem a marcação de parcela, depois normalizada. */
export function descricaoBaseParcela(s: string | null | undefined): string
```

`removerMarcaParcela` usa **a mesma regex e as mesmas guardas** de `parseParcela` (só remove
quando o par é parcela válida) e apaga o trecho casado. `descricaoBaseParcela` é
`normalizarDescricao(removerMarcaParcela(s))`.

Assim `"NETSHOES 5/12"` e `"NETSHOES 6/12"` colapsam para `"netshoes"`, e `"POSTO 24/7"`
permanece `"posto 24 7"`.

### 2. Módulo puro novo — `src/lib/import/parcelas-lancadas.ts`

Mesmo molde de [`cobertura.ts`](../../../src/lib/import/cobertura.ts): sem I/O, testado em
Vitest, com o cabeçalho explicando o bug que originou a regra.

```ts
/** Uma parcela ATIVA já lançada no cartão de destino. */
export type ParcelaLancada = {
  numero: number;
  totalParcelas: number;
  valorCentavos: number;
  /** 'yyyy-MM-01' da fatura onde a parcela cai (data_competencia). */
  competencia: string | null;
  /** Descrição da compra-pai, já em descricaoBaseParcela. */
  descricaoBase: string;
  /** Descrição original da compra-pai, para a mensagem ao usuário. */
  descricaoOriginal: string;
};

export function marcarParcelasJaLancadas(
  rows: NormalizedRow[],
  parcelas: ParcelaLancada[],
  competenciaLote: string | null,
): NormalizedRow[];
```

**Só toca linhas com `status === 'para_importar'`.** Linha em `erro`, `ignorada` ou já
`duplicada` passa intacta — a dedup existente continua com a palavra final no que é dela.

#### As três regras, em três passes

Os passes rodam **em ordem**, cada um sobre as linhas que sobraram. Uma parcela casada é
**consumida** e não casa de novo, para duas linhas iguais no arquivo não apontarem para a mesma
parcela.

| Passe | Aplica a | Casa quando |
|---|---|---|
| **1** | linha com `parcela` e `parcelasTotal` | `numero = parcela` **e** `totalParcelas = parcelasTotal` **e** `descricaoBase` igual |
| **2** | linha com `parcela` e `parcelasTotal` que sobrou do passe 1 | `numero = parcela` **e** `totalParcelas = parcelasTotal` **e** `valorCentavos` igual |
| **3** | linha **sem** marcação de parcela | `valorCentavos` igual **e** `descricaoBase` igual **e** `competencia` da parcela = `competenciaLote` |

A ordem dá prioridade à evidência mais forte: descrição+numeração antes de valor+numeração, e o
casamento frouxo do passe 3 só alcança o que ninguém reivindicou.

O passe 3 **não roda** quando `competenciaLote` é `null` — sem saber de que fatura é o arquivo,
o filtro que segura o falso positivo desaparece, e um aviso sem base é pior que nenhum (mesma
disciplina do `cobertura.ts`).

#### A mensagem

A linha casada sai com `status: 'duplicada'` e `motivo`:

```
Já lançada como parcela 6/12 de «NETSHOES 5/12», na fatura de ago/2026.
```

Sem competência na parcela, a mensagem termina antes da vírgula. O texto do mês sai de um
helper local puro (a competência é **data pura**, então é formatada como texto — nunca
convertida para `Date`, conforme a regra de fuso do projeto).

### 3. Leitura no servidor — `parcelasLancadasFor` em `src/lib/actions/imports.ts`

Irmã de `existingKeysFor`, ao lado dela:

```ts
async function parcelasLancadasFor(
  ctx: AuthContext,
  cardId: string,
): Promise<ParcelaLancada[]>
```

```ts
await ctx.supabase
  .from("transaction_installments")
  .select(
    "numero, total_parcelas, valor, data_competencia, " +
    "parent:transactions!transaction_installments_parent_transaction_id_fkey(description)",
  )
  .eq("card_id", cardId)
  .eq("status", "ativa")
  .limit(5000);
```

- O nome explícito da constraint no embed é o mesmo já usado em
  [`finance/queries.ts:247`](../../../src/lib/finance/queries.ts) — copiado de propósito, não
  reinventado.
- **`status = 'ativa'`** (não `neq('cancelada')`): parcela cancelada não ocupa a fatura, logo
  não pode bloquear a importação da linha.
- `.limit(5000)` acompanha o limite já praticado em `existingKeysFor`.
- RLS cobre a leitura; nenhuma tabela, coluna ou migration nova.

### 4. Integração nos dois pontos de entrada

Em `parseImportBatch` e `remapImportBatch`, **a detecção de competência sobe** para antes da
dedup, e o passe novo entra depois dela:

```ts
const competenciaFatura =
  origem === "cartao" && cardId
    ? await detectarCompetenciaLote(ctx, cardId, normalized)
    : null;

const deduped = detectarDuplicados(normalized, existingKeys, targetId);

const final =
  origem === "cartao" && cardId
    ? marcarParcelasJaLancadas(
        deduped,
        await parcelasLancadasFor(ctx, cardId),
        competenciaFatura,
      )
    : deduped;
```

Passar `normalized` (em vez de `deduped`) para `detectarCompetenciaLote` **não muda resultado**:
`detectarCompetenciaFatura` lê apenas `dataNorm` e `parcelasTotal`, que a dedup não altera — ela
só mexe em `status` e `motivo`.

`total_duplicadas` do lote e o insert de `import_rows` passam a usar `final`, para o contador do
resumo incluir as linhas bloqueadas pelo passe novo.

Origem `conta` não executa nada disso — parcelamento é coisa de cartão.

### 5. O que o usuário vê

Nada de componente novo. A linha aparece na revisão com o badge **Duplicada**, o `motivo` logo
abaixo da descrição (`import-review.tsx:932`) e o botão **Importar** para destravar. O chip
**Duplicadas** do resumo já conta essas linhas, e o "Total a importar" já as exclui.

## Testes

`src/lib/import/parcelas-lancadas.test.ts` (puro, ambiente node):

1. **O caso do relato:** linha `NETSHOES 6/12` de agosto com parcela 6/12 ativa → `duplicada`,
   com o motivo citando a parcela e a fatura.
2. **Descrição muda entre os meses** (`NETSHOES` → `NETSHOES*LOJA`): passe 1 falha, passe 2 casa
   por número + total + valor.
3. **Linha sem "k/N"**, valor e descrição-base iguais, parcela na competência do lote → casa
   pelo passe 3.
4. **Passe 3 não roda sem competência do lote** → linha segue `para_importar`.
5. **Parcela cancelada não bloqueia** (não entra na lista de entrada) → linha segue
   `para_importar`.
6. **Última parcela** (`k = N`) também é pega.
7. **Duas compras de mesmo valor no mesmo mês**, descrições diferentes → nenhuma é bloqueada.
8. **Consumo único:** duas linhas `para_importar` que casariam com a mesma parcela ativa (caso
   que chega aqui quando o FITID diferente fez a dedup deixar as duas passar) → só a primeira é
   marcada; a segunda permanece `para_importar`.
9. **Linha `ignorada`/`erro`/`duplicada` não é tocada.**
10. **Número de parcela diferente** (arquivo traz 7/12, existe só a 6/12 ativa) → não casa.

`src/lib/import/normalize.test.ts` ganha:

11. `removerMarcaParcela` tira `5/12`, `PARC 03/12` e `Parcela 1 de 4`.
12. `removerMarcaParcela` **não** mexe em `POSTO 24/7` nem em texto sem marcação.
13. `descricaoBaseParcela` faz `"NETSHOES 5/12"` e `"NETSHOES 6/12"` colapsarem no mesmo texto.

## Limites conhecidos (registrados de propósito)

1. **A conferência roda no parse e no remap, não no commit.** Criar um parcelamento *entre*
   revisar e finalizar o lote deixa aquela linha sem reavaliação. Marcar de novo no commit
   apagaria a decisão explícita de "importar mesmo assim" — a linha destravada volta a
   `para_importar` e fica indistinguível de uma normal, e distinguir exigiria coluna nova. Saída
   quando acontecer: **Reaplicar mapeamento** refaz a conferência.
2. **Mês anterior importado como despesa avulsa não gera aviso.** Sem parcela em
   `transaction_installments` não há o que casar — é o cenário do limite 3 abaixo.
3. **Sem conferidor retroativo.** As duplicatas já lançadas em faturas passadas continuam lá e
   são resolvidas à mão em `/faturas` e `/financeiro/lancamentos`.
4. **Sem casamento por semelhança de texto.** Descrição-base é comparada por igualdade exata
   depois de normalizada. Banco que reescreve o nome da loja por completo entre os meses cai no
   passe 2 (valor + numeração) ou não é pego.

## Critérios de aceite

1. Importar a fatura do mês seguinte de uma compra parcelada já lançada marca a linha como
   **duplicada**, com motivo nomeando o parcelamento, a parcela e a fatura.
2. A linha bloqueada **não entra** no `commitImport`, e o "Total a importar" não a soma.
3. O botão **Importar** na revisão continua liberando a linha, e o commit a aceita depois disso.
4. Parcela **cancelada** não bloqueia a importação da linha correspondente.
5. Duas compras diferentes de mesmo valor na mesma fatura **não** são bloqueadas.
6. Importação de **extrato de conta** segue com o comportamento de hoje, sem consulta extra.
7. `npm run test:run`, `npm run lint`, `npx tsc --noEmit` e `npm run build` passam.
