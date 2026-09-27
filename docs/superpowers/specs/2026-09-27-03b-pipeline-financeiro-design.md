# Design — REDESIGN-03-B: unificar o pipeline do motor financeiro

> Validado com o dono em **2026-09-27**, antes de qualquer linha de código.
> Segunda subfase da fase 03 do redesign. Depende da **03-A concluída** — os 65 casos de
> caracterização de `src/lib/finance/dashboard-caracterizacao.test.ts` são a rede desta subfase.
> Escopo declarado em `docs/redesign/PLANO.md` (linha 63) e `docs/redesign/STATUS.md`.

---

## 1. O que a 03-B muda de natureza

As quatro funções do núcleo financeiro (`resumoMes`, `gastosPorCategoria`, `proximas6Faturas`,
`totalAReceber`) são puras, testadas e agora caracterizadas. **O problema nunca foi o motor —
é o combustível.** Entre o banco e essas funções existe uma camada de tradução que foi
**copiada quatro vezes**, e cada cópia envelheceu por conta própria.

A 03-B não muda um número. Ela transforma **divergência acidental em divergência declarada**:
onde hoje dois lugares discordam porque alguém esqueceu de atualizar o segundo, amanhã eles
discordam porque um parâmetro diz que devem — ou concordam porque passaram a ler do mesmo
lugar.

Essa é a diferença que importa: um número que difere por esquecimento é um defeito invisível;
um número que difere por parâmetro é uma decisão que alguém pode ler, questionar e mudar.

---

## 2. O estado de hoje, contado

**Quatro arquivos** montam as entradas do motor à mão:

| # | Arquivo | Janela de transações | `owner`? |
| --- | --- | --- | --- |
| A | `src/lib/dashboard/queries.ts` → `getFinanceCardData` | o mês pedido | **sim** |
| A' | `src/lib/dashboard/queries.ts` → `getInvoicesCardData` | — (não lê transações) | não |
| B | `src/lib/reports/queries.ts` → `getFinanceAndCardReport` | 6 atrás → 6 à frente | não |
| C | `src/app/(app)/dashboard/financeiro/page.tsx` | 6 atrás → 6 à frente | não |
| D | `src/lib/notifications/cron.ts` (L287–328) | 3 atrás → **hoje** | service role |

**24 montagens à mão** (contadas no repositório, fora de arquivos de teste):

| Tipo | Cópias | Onde |
| --- | --- | --- |
| `DashTx` | 4 | A, B, C, D |
| `DashStatement` | 5 | A, A', B, C, D |
| `DashReceivable` | 5 | A, A', B, C, D |
| `DashCard` | 3 | A', B, C |
| `DashBill` | 3 | A, B, C |
| `DashInstallmentItem` | 2 | B, C |
| `DashRecurrence` | 2 | B, C |

Mais **3 cópias** de `accounts.reduce((s, a) => s + (a.current_balance ?? 0), 0)` (A, B, C) e
**3 cópias** de `fimDoMes(mes)` (A, B, C) — estas três byte por byte idênticas.

**B e C são a duplicação mais literal do projeto:** ~120 linhas praticamente idênticas, das
leituras aos sete mapeamentos. C acrescenta `gerarAlertas`; B acrescenta `assinaturas`,
`faturasPorMes` e `parcelasComprometidas`. O meio é o mesmo.

### 2.1 As divergências que a cópia produziu

Nenhuma destas é intencional. Nenhuma está documentada em lugar nenhum:

1. **`category_id: null` está escrito à mão no Cron** (`cron.ts:313`). Não é o dado — é a
   ausência dele virando constante. Hoje não quebra nada porque o Cron não chama
   `gastosPorCategoria`; se alguém o chamar, **todo gasto cai em "sem categoria"**, em silêncio.
2. **`ref_month` não é montado em `getInvoicesCardData`** (A'). Hoje não quebra porque ele
   chama `totalAReceber(recs)` **sem** mês; com mês, o total seria **zero** — e a 03-A congelou
   esse comportamento como armadilha (Bloco 10).
3. **`mediaSaidas` tem duas definições diferentes** — §5.
4. **O Cron converte com `Number(...)` campo a campo; A/B/C não convertem.** Mesmo resultado
   hoje, duas disciplinas.
5. **O Cron lê `card_statements_with_total` sem `.gt("itens", 0)`**, que `getStatements` aplica.
   Fatura sem item entra no Cron e não entra nas telas.
6. **O Cron não tem teto de linhas**; `getTransactionsRange` tem `.limit(2000)` e
   `getReceivables` tem `.limit(1000)` — nenhum dos três visível para quem chama.

As de **1 a 4** a 03-B resolve. As de **5 e 6** ela **não** resolve, e §9 explica por quê.

---

## 3. As decisões desta sessão

| # | Decisão |
| --- | --- |
| 1 | **Preservar tudo como parâmetro declarado.** Nenhum número muda em lugar nenhum; divergência acidental vira divergência declarada |
| 2 | **Duas camadas, e o Cron entra só pela pura.** Ele mantém o `Promise.all` de 13 leituras intacto e usa apenas `montarEntradas` |
| 3 | **`mediaSaidas` entra como função pura parametrizada**, ao lado da `gerarAlertas` que a consome |
| 4 | **`getFinanceCardData` e `getInvoicesCardData` mantêm a assinatura** — a IA, os insights e as telas não são tocados |
| 5 | **As janelas viram funções nomeadas**, para que cada janela declarada seja legível num lugar |
| 6 | **A camada pura fica num arquivo sem `server-only`**; a de I/O mora em `finance/queries.ts`, junto das oito leituras que ela orquestra |

### 3.1 Por que o Cron não usa a camada de I/O

Seria tentador: `lerFinanceiro({ janela, escopo, owner })` e pronto. Está errado por três
razões, e a terceira é a que decide.

1. O Cron faz **13 leituras num único `Promise.all`** — três financeiras e dez de outros
   módulos. Trocar as três por uma função que faz o próprio `Promise.all` **serializaria** o
   que hoje é paralelo.
2. As janelas dele são outras, e o `select` dele é mais enxuto de propósito (é service role,
   roda para todo usuário).
3. **Três das oito leituras de `finance/queries.ts` ainda não aceitam `LeituraDoDono`** —
   `getCreditCards`, `getRecurrences` e `getStatementInstallmentItems`. Fazê-las aceitar é
   trabalho real (a invariante 79 é sobre isso), não é escopo da 03-B, e o Cron não precisa
   de nenhuma das três.

Pela camada pura ele ganha o que interessa — o mapeamento único — sem pagar por nada disso.

---

## 4. A forma

```
src/lib/finance/pipeline.ts          ← NOVO · PURO (sem server-only, sem Supabase)
  tipos de linha (estruturais, tolerantes)
  montarEntradas(linhas)  → EntradasDoMotor
  saldoDasContas(contas)  → number
  ultimoDiaDoMes(mes)     → 'yyyy-MM-dd'
  janelaDoMes(mes) · janelaDoRelatorio({mesSel, mesAtual}) · janelaDoCron({mesAtual, ate})
  EscopoFinanceiro + ESCOPO_CARD_FINANCEIRO · ESCOPO_FATURAS · ESCOPO_RELATORIO

src/lib/finance/queries.ts           ← + lerFinanceiro({janela, escopo, owner})
src/lib/finance/dashboard.ts         ← + mediaDeSaidas(pontos, opcoes)
src/lib/finance/pipeline.test.ts     ← NOVO · equivalência + fronteira
```

### 4.1 A camada pura — `montarEntradas`

```ts
export function montarEntradas(linhas: LinhasFinanceiras): EntradasDoMotor;

type EntradasDoMotor = {
  txs: DashTx[];  sts: DashStatement[];  recs: DashReceivable[];
  inst: DashInstallmentItem[];  cards: DashCard[];
  recorrencias: DashRecurrence[];  bills: DashBill[];
};
```

Lista não informada volta `[]`. Cinco regras de forma, e cada uma existe por um dos quatro
chamadores:

1. **Os tipos de entrada são estruturais e TOLERANTES.** Campo que um chamador não traz é
   opcional. É isso que faz a linha crua do Cron — sem `category`, sem `category_id`, sem os
   embeds de `receivables` — caber na mesma função que a linha completa de `getTransactionsRange`.
   ⚠️ **Tolerante não é frouxo:** `amount`, `type`, `status` e `competence_date` continuam
   obrigatórios, porque sem eles `resumoMes` não tem o que somar.

2. **Campo numérico aceita `number | string` e é normalizado.** `num(v)` para o obrigatório,
   `numOuNulo(v)` para o que pode faltar. Para A/B/C, que já passam `number`, é identidade;
   para o Cron, é exatamente o `Number(...)` que ele já escreve. ⚠️ `numOuNulo(undefined)`
   devolve `null`, e não `undefined` — o que preserva o comportamento, porque quem lê
   `valor_pessoal` faz `valor_pessoal ?? amount` e os dois caem no mesmo ramo.

3. **`category_id` sai do DADO, com `?? null`.** Com o `select` de hoje do Cron, `t.category_id`
   é `undefined` e o resultado é `null` — **idêntico** ao valor que está escrito à mão lá.
   O que muda não é o número: é que a mentira deixa de estar no código. No dia em que o Cron
   acrescentar a coluna ao `select`, ela passa a valer sozinha.

4. **`ref_month` é sempre derivado**, dos embeds quando existem:
   `statement?.competencia?.slice(0, 7) ?? transaction?.purchase_date?.slice(0, 7) ?? null`.
   Sem embed, `null` — que é o que o Cron e `getInvoicesCardData` têm hoje. Para o Cron nada
   muda (`resumoMes` não lê `ref_month`); para `getInvoicesCardData`, a armadilha morre.
   ⚠️ `competencia` e `purchase_date` são **datas puras** (`date`), então `.slice(0, 7)` é
   correto aqui — a proibição do CLAUDE.md é sobre `timestamptz`.

5. **`parent` de `DashInstallmentItem` é `{ category: null }`, nunca `null`.** É o que B e C
   montam hoje, e `gastosPorCategoria` depende disso.

### 4.2 A camada de I/O — `lerFinanceiro`

```ts
export async function lerFinanceiro(params: {
  janela: { from: string; to: string };   // 'yyyy-MM-dd' — datas puras
  escopo: EscopoFinanceiro;
  owner?: LeituraDoDono;
}): Promise<{ entradas: EntradasDoMotor; contas: AccountWithBalance[] }>;
```

- Um `Promise.all` com exatamente as leituras que o `escopo` pede — nem uma query a mais, para
  o card do dashboard não passar a pagar pelas duas que só o relatório usa.
- **`getStatementInstallmentItems` continua depois do `Promise.all`**, porque depende dos ids
  das faturas. Preservar a forma das chamadas é parte de preservar o comportamento: uma ida e
  volta em série a mais ou a menos é mudança de tempo de resposta.
- **`contas` volta crua** e quem quer o número chama `saldoDasContas`. Devolver `saldo: number`
  obrigaria a inventar `0` para "não pedi contas" — e neste projeto ausência não é zero.
- ⛔ **`owner` + escopo que peça cartões, recorrências ou parcelas → `throw` com o motivo
  escrito**, porque essas três leituras ainda não aceitam `LeituraDoDono` e silenciosamente
  leriam **sem filtro de usuário** sob service role. Erra para "não roda", nunca para "roda
  lendo o que não devia". Com teste.

**Três escopos nomeados**, um por caso real, e ninguém escreve um objeto literal solto:

| Constante | Lê | Consumidor |
| --- | --- | --- |
| `ESCOPO_CARD_FINANCEIRO` | contas, faturas, recebíveis, contas fixas, transações | `getFinanceCardData` |
| `ESCOPO_FATURAS` | cartões, faturas, recebíveis | `getInvoicesCardData` |
| `ESCOPO_RELATORIO` | tudo, **incluindo parcelas** | `getFinanceAndCardReport` e a página |

### 4.3 As janelas declaradas

```ts
janelaDoMes(mes)                        → { from: `${mes}-01`, to: ultimoDiaDoMes(mes) }
janelaDoRelatorio({ mesSel, mesAtual }) → { from, to, evoMeses, projMeses }
janelaDoCron({ mesAtual, ate })         → { from: `${addMes(mesAtual,-3)}-01`, to: ate }
```

`janelaDoRelatorio` devolve `evoMeses`/`projMeses` junto porque B e C precisam das duas listas
depois, e recalculá-las seria reabrir a mesma cópia por outro caminho.

⚠️ **`ultimoDiaDoMes`, e não `fimDoMes`.** Já existe um `fimDoMes` exportado em
`src/lib/ai/insights/temporal.ts` — com **outra assinatura** (recebe `'yyyy-MM-dd'`, não
`'yyyy-MM'`) e outro mecanismo (`Date.UTC`, não `new Date(y, m, 0)` local). Reusá-lo faria
`finance/` depender do módulo de IA: a seta ao contrário que já mandou `tone/` e `owner.ts`
para módulos neutros (invariantes 69 e 79). Nome diferente para que um autocomplete distraído
não importe o errado.

⚠️ **`janelaDoCron` declara o truncamento em `ate`.** Hoje o Cron lê transações só até
`todayIso`, mas lê **todas** as faturas — então `resumoMes.saidas` do sino é, dentro do mês
corrente, estruturalmente **menor** que o da tela: o à vista conta até hoje, o cartão conta a
fatura inteira. A 03-B **não conserta isso** (seria mudar número). Ela o põe num lugar onde
está escrito.

---

## 5. `mediaSaidas` — a divergência que vira parâmetro

As duas definições de hoje:

```ts
// C · page.tsx:167-171
const anteriores = evolucao.filter((p) => p.mes < mesSel && p.saidas > 0);
const mediaSaidas = anteriores.length > 0
  ? anteriores.reduce((s, p) => s + p.saidas, 0) / anteriores.length : 0;

// D · cron.ts:322-328
const priorMonths = [1, 2, 3].map((k) => addMes(mesAtual, -k));
const mediaSaidas = priorSaidas.reduce((a, b) => a + b, 0) / priorMonths.length;
```

Elas discordam em **três** eixos, não um:

| Eixo | Tela (C) | Sino (D) |
| --- | --- | --- |
| Mês sem saída | **ignorado** | conta como 0 e **divide** |
| Quantos meses | até 5 (janela da evolução) | exatamente 3 |
| Base de cada mês | janela de 6 meses completa | janela truncada em `hoje` |

O mesmo alerta de "gasto alto" sai de duas réguas diferentes. A função pura:

```ts
export function mediaDeSaidas(
  pontos: { mes: string; saidas: number }[],
  opcoes: { ignorarMesesSemSaida: boolean },
): number;
```

- Tela: `mediaDeSaidas(evolucao.filter((p) => p.mes < mesSel), { ignorarMesesSemSaida: true })`
- Cron: `mediaDeSaidas(tresMesesAnteriores, { ignorarMesesSemSaida: false })`

**Os três eixos continuam divergindo, e é de propósito** — a decisão 1 é preservar. O que muda:
o eixo 1 passa a ter nome e a aparecer na chamada; os eixos 2 e 3 passam a estar visíveis no
argumento que cada chamador monta. Unificá-los é decisão do dono, não desta subfase.

⚠️ Duas equivalências a preservar ao pé da letra: o filtro é **`> 0`**, não `!== 0` (saída
negativa — estorno maior que o gasto — hoje é descartada pela tela); e lista vazia devolve
**`0`**, não `NaN`, que é o que o `anteriores.length > 0 ? … : 0` faz hoje.

---

## 6. O que cada chamador passa a fazer

| Chamador | Usa | O que sai do arquivo |
| --- | --- | --- |
| `getFinanceCardData` | `lerFinanceiro(ESCOPO_CARD_FINANCEIRO)` + `janelaDoMes` | 4 mapeamentos, `fimDoMes`, o `reduce` do saldo |
| `getInvoicesCardData` | `lerFinanceiro(ESCOPO_FATURAS)` | 3 mapeamentos |
| `getFinanceAndCardReport` | `lerFinanceiro(ESCOPO_RELATORIO)` + `janelaDoRelatorio` | 7 mapeamentos, `fimDoMes`, o `reduce`, o cálculo da janela |
| `financeiro/page.tsx` | idem — **a mesma chamada, não a mesma cópia** | idem + `mediaSaidas` |
| `cron.ts` | **só `montarEntradas`** + `janelaDoCron` | 3 mapeamentos, o `category_id: null`, `mediaSaidas` |

Assinaturas públicas: **nenhuma muda.** `getFinanceCardData(mes, todayIso, owner?)`,
`getInvoicesCardData(todayIso)`, `getReportsData(mesSel)` e `generateForUser(service, userId,
now)` continuam idênticas, e os quatro consumidores de IA/insights/telas não são tocados.

---

## 7. O que morre de graça

Dois defeitos latentes deixam de ser representáveis, **sem mover um número**:

1. **`category_id` do Cron** passa a sair do dado (§4.1, regra 3).
2. **`ref_month` de `getInvoicesCardData`** passa a ser derivado sempre (§4.1, regra 4).

E as **24 montagens à mão** espalhadas por 4 arquivos viram **7**, todas dentro de
`pipeline.ts` — uma por tipo de entrada do motor.

---

## 8. Como se prova

Quatro camadas, em ordem de força:

1. ⛔ **Os 65 casos da 03-A não mudam UMA LINHA.** Eles caracterizam o motor, não o pipeline;
   se algum ficar vermelho, a unificação mudou sentido financeiro. É exatamente o alarme que a
   03-A existe para dar, e é por isso que ela veio primeiro.
2. **Teste de equivalência do mapeamento** (`pipeline.test.ts`): para a mesma linha de entrada,
   `montarEntradas` devolve o objeto que cada um dos quatro montava à mão. As fixtures do
   **caso do Cron** (linha sem `category`, sem `category_id`, sem embeds) e do **caso completo**
   entram as duas. Escrito **a partir do código de hoje, antes de trocá-lo**.
3. ⛔ **Teste de fronteira — nenhum arquivo fora de `pipeline.ts` monta um `Dash*`.** Varredura
   de `src/**/*.{ts,tsx}`, excluindo `*.test.ts` (fixture é montagem legítima) e o próprio
   `pipeline.ts`, procurando `Dash<Tipo>[] =` e `): Dash<Tipo> =>`. É o que impede um **quinto**
   pipeline de nascer, e é a parte que sobrevive a esta subfase. Idioma do projeto
   (`boundaries.test.ts`, `painel-persistencia.test.ts`), com a mesma disciplina: varrer
   **ignorando comentários**, senão a própria explicação da regra derruba o teste.
4. ⛔ **Mutação, não o verde** — a lição da 03-A (invariante 106). Cada teste novo é confirmado
   por uma mutação que o derrube, com o **NOME** de cada teste que cai registrado, e o desfazer
   conferido por `git diff`, nunca pelo verde. Mínimo obrigatório:

| # | Mutação | Deve derrubar |
| --- | --- | --- |
| N1 | `category_id` volta a ser `null` fixo | equivalência (caso completo) |
| N2 | `ref_month` deixa de usar `purchase_date` | equivalência (recebível de parcela) |
| N3 | `numOuNulo` devolve `0` em vez de `null` | equivalência + algum dos 65 |
| N4 | `parent` volta `null` em vez de `{ category: null }` | equivalência (parcela) |
| N5 | `ignorarMesesSemSaida` é ignorado | `mediaDeSaidas` |
| N6 | o filtro de `mediaDeSaidas` vira `!== 0` | `mediaDeSaidas` (ponto negativo) |
| N7 | uma montagem à mão é reintroduzida em `cron.ts` | fronteira |
| N8 | `lerFinanceiro` aceita `owner` com escopo de cartões | o guard do §4.2 |
| N9 | `ultimoDiaDoMes` devolve o último dia do mês ANTERIOR (`m` → `m - 1`) | `janelaDoMes` / `janelaDoRelatorio` |

5. **Os cinco comandos**, na árvore integrada: `test:run`, `lint`, `tsc --noEmit`, `build`,
   `perf:bundle`. ⚠️ O `perf:bundle` importa nesta subfase: `pipeline.ts` é importado por uma
   **página** (`financeiro/page.tsx`), então ele não pode arrastar nada de runtime. Puro, sem
   `server-only`, sem Supabase — e o número de `/(app)/dashboard/financeiro` é conferido antes
   e depois.

---

## 9. O que a 03-B NÃO faz, e por quê

| Fica de fora | Razão |
| --- | --- |
| **Unificar os três eixos de `mediaSaidas`** | Muda número. Decisão do dono, não desta subfase |
| **Consertar o truncamento da janela do Cron** | Muda número (o alerta de gasto alto do sino) |
| **`.gt("itens", 0)` no Cron** | Muda quais faturas o sino vê. Já registrado para a REDESIGN-05 |
| **Tornar visíveis os tetos de 2000/1000** | É a invariante 29 da 18-C aplicada ao financeiro — subfase própria |
| **`getCreditCards`/`getRecurrences`/`getStatementInstallmentItems` aceitarem `owner`** | Ninguém precisa hoje; §3.1 |
| **Migration** | **A 03-B não precisa de nenhuma.** As três aprovadas seguem sem ser aplicadas, cada uma com autorização separada do dono (D29) |
| **`saldoDasContas` nas telas de conta** | `financeiro/page.tsx:75` e `accounts-client.tsx:22` somam saldo em outro contexto. Podem usar a função depois; não é escopo |

---

## 10. Ordem de execução

Cada passo fecha com `npx vitest run src/lib/finance/` verde e `git diff` revisado.

1. **`pipeline.ts`** — tipos, `montarEntradas`, `saldoDasContas`, `ultimoDiaDoMes`, as três
   janelas, os três escopos. Nada consome ainda.
2. **`pipeline.test.ts`** — equivalência (fixtures do caso completo e do caso do Cron) +
   fronteira. **Rodar a fronteira AGORA**, com as 24 montagens ainda no lugar: ela tem de ficar
   **vermelha listando os 4 arquivos**. Um teste de ausência que nunca foi visto vermelho não
   provou nada.
3. **`mediaDeSaidas`** em `dashboard.ts` + teste, com as duas configurações e o ponto negativo.
4. **`lerFinanceiro`** em `finance/queries.ts`, com o guard do `owner`.
5. **Os quatro chamadores**, um commit cada, nesta ordem: `cron.ts` (só a camada pura, o menor
   risco), `getInvoicesCardData`, `getFinanceCardData`, e por fim `reports/queries.ts` +
   `page.tsx` juntos (são a mesma cópia; separá-los deixaria a fronteira vermelha no meio).
6. **A fronteira fica verde** — e aí as **9** mutações do §8.4 rodam, uma a uma.
7. **Os cinco comandos** na árvore integrada, com os números reais reportados.

---

## 11. Critérios de aceite

1. `npx vitest run src/lib/finance/dashboard-caracterizacao.test.ts` → **65/65 verdes, arquivo
   não modificado** (provado por `git diff --quiet` no arquivo).
2. `npx vitest run src/lib/finance/dashboard.test.ts` → verde, arquivo não modificado.
3. A varredura de fronteira acha **zero** montagens de `Dash*` fora de `pipeline.ts` (excluídos
   os testes), e foi vista **vermelha listando 4 arquivos** antes do passo 5.
4. As **9 mutações** do §8.4 aplicadas uma a uma, cada uma derrubando **pelo menos um** teste,
   com o **nome** de cada teste que cai registrado, e cada restauração conferida por `git diff`.
5. As quatro assinaturas públicas (`getFinanceCardData`, `getInvoicesCardData`,
   `getReportsData`, `generateForUser`) inalteradas — conferido no diff.
6. Nenhuma migration. Nenhum `Date.now()`/`new Date()` sem argumento no código novo.
7. Os cinco comandos verdes na árvore integrada, com número medido (não herdado da branch), e
   `/(app)/dashboard/financeiro` dentro do orçamento de bundle.
8. Zero valor em R$, nome de pessoa ou de categoria real no diff — fixture sintética sempre
   (repositório **público**).

---

## 12. Risco residual

| # | Risco | Mitigação | Sobra |
| --- | --- | --- | --- |
| R1 | **`inst: []` fica fácil de obter.** Quem chamar `gastosPorCategoria` com o escopo do card perde todo gasto de parcelamento, em silêncio — comportamento que a 03-A congelou | Escopos **nomeados** (nenhum literal solto) e o aviso no tipo | **Real.** A trava de verdade é `gastosPorCategoria` recusar `inst` ausente havendo parcela no mês — mudança de comportamento, fica para a REDESIGN-05 |
| R2 | O tipo gerado do Supabase pode não casar com `LinhaTx` no Cron | Um cast **único** na linha (`as LinhaTx[]`), nunca nove casts campo a campo | Um `as`, registrado no diff |
| R3 | A varredura de fronteira é textual: uma montagem escrita de forma diferente escapa | Dois padrões (`Dash*[] =` e `): Dash* =>`), confirmados por mutação (N7) | Uma terceira forma de escrever escaparia |
| R4 | `montarEntradas` tolerante aceita linha incompleta que hoje seria erro de tipo | Os 4 campos que o motor exige seguem obrigatórios | Campo opcional ausente vira `null` em vez de erro de compilação |
| R5 | Os três eixos de `mediaSaidas` continuam divergindo | Agora estão escritos num lugar, com nome | O sino e a tela seguem com réguas diferentes até o dono decidir |

⛔ **Esta subfase não promete "zero bugs".** Ela promete que o mapeamento passa a existir uma
vez, que a prova disso é mutação e não verde, e que tudo o que ela deixou de fora está nesta
lista.
