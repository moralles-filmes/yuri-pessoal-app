# Design — REDESIGN-03-B2: fechar os riscos residuais da 03-B

> Desenhado com o dono em **2026-09-27**, antes de qualquer linha de código. Depende da **03-B
> integrada** (`2968b3c` é ancestral de `feat/redesign-00-auditoria`; a branch
> `feat/redesign-03b2-riscos` parte de `704dc66`). Escopo declarado em `docs/redesign/PLANO.md`
> (linha 64, decisão D40). Os riscos que esta subfase fecha estão no §12 do desenho da 03-B
> (`2026-09-27-03b-pipeline-financeiro-design.md`).
>
> Depois de aprovado, este documento é o contrato: quem discordar de algo aqui para e reporta.

---

## 1. O que a 03-B2 muda de natureza

A 03-B transformou divergência **acidental** em divergência **declarada**. A 03-B2 dá a todo
risco declarado uma de duas saídas:

1. ele fica **irrepresentável** — o tipo não compila, ou a fronteira acha qualquer forma de
   escrevê-lo; ou
2. vira **decisão do dono aplicada**, com o número que muda congelado em teste **antes** do
   conserto — visível no diff, nunca em silêncio.

Nada fica "residual" sem uma dessas duas saídas, ou sem um "não" do dono registrado. O que
sobra depois dela é risco **novo**, listado no §11 com destino.

---

## 2. Linha de base — medida em 2026-09-27, na ponta `704dc66`

| Comando | Resultado |
| --- | --- |
| `npm run test:run` | **195 arquivos / 4.033 testes**, 15,5 s |
| `npm run lint` | limpo |
| `npx tsc --noEmit` | limpo |
| `npm run build` | ok |
| `npm run perf:bundle` | mediana **214,2 KB** · 68 rotas · 1 com teto próprio |

As quatro rotas que esta subfase toca (gzip, primeiro carregamento, mesma conta do script):

| Rota | KB |
| --- | --- |
| `/(app)/dashboard/financeiro` | 200,9 |
| `/(app)/financeiro` | 195,9 |
| `/(app)/financeiro/contas` | 214,0 |
| `/(app)/relatorios` | 204,1 |

⚠️ O `perf:bundle` só imprime as dez maiores rotas. O número das quatro acima sai de um medidor
fora do repositório que repete a conta do script (`page_client-reference-manifest.js` → chunks →
gzip). Ele é refeito no fim, do mesmo jeito.

---

## 3. As decisões desta sessão

| # | Decisão | Por quê |
| --- | --- | --- |
| **B1** | **Sim.** O Cron **e a busca global** passam a ler faturas com `.gt("itens", 0)` | É o §13.5 ("sem lançamentos conhecidos" não é R$ 0,00) aplicado ao sino e à busca. Notificações já gravadas não são apagadas |
| **B2** | **Sim.** O sino adota a régua da tela, numa **função única** chamada pelos dois | Uma régua por construção, não por convenção. O §13.6 ("até a mesma altura") continua da 03-E |
| **B3** | **Sim.** "Saldo das contas" é **todas as contas**, via `saldoDasContas`, também na IA | Esconder a conta não faz o dinheiro sumir. Medido: **nenhuma conta inativa hoje**, então nenhum número muda agora |
| **A2** | **Estreitar e declarar** | Fato que contradiz a premissa do prompt: ver §5.2 |
| **A5** | **`count: "exact"`**, não "teto + 1" | Fato que contradiz a premissa do prompt: ver §5.5 |

---

## 4. O mapa

| Risco (origem) | Item | Muda número? |
| --- | --- | --- |
| R1 — `inst: []` com o escopo do card faz `gastosPorCategoria`/`gastosPorForma` perderem parcelamento | A1 | não |
| Janela passada e ignorada em `getInvoicesCardData` | A1 | não |
| R2 — dois casts no Cron (`as LinhaTx[]`, `as LinhaRecebivel[]`) | A2 | não |
| R4 — linha tolerante: campo ausente vira `null` sem erro de tipo | A2 | não |
| R3 — fronteira textual: `Array<DashTx> =`, `satisfies`, literal inline escapam | A3 | não |
| `getCreditCards`/`getRecurrences`/`getStatementInstallmentItems` sem `LeituraDoDono` (e o guard que lança) | A4 | não |
| Tetos 2000 (tx) / 1000 (recebíveis) invisíveis; a IA diz `completude: "exato"` fixo | A5 | não |
| `saldoDasContas` fora das telas de conta | A6 | não |
| R5, parte sem número — limiares do alerta (1.2 · 0.8 · 5 dias) escritos duas vezes | A7 | não |
| `getSpending` da IA declara `periodo.ate = ${mes}-31` (setembro tem 30) | A8 | não (data de rótulo) |
| Cron lê faturas sem `.gt("itens", 0)` — e a busca também | **B1** | **sim** — notificações e resultados de busca |
| R5, parte com número — régua do gasto alto (3 eixos) + janela do Cron truncada em hoje | **B2** | **sim** — alerta do sino |
| A IA soma saldo **só de contas ativas**; as telas somam todas | **B3** | **latente** — nenhuma inativa hoje |

---

## 5. Parte A — fecha sem mover número

### 5.1 A1 · R1 vira erro de compilação (e a janela inútil some)

**A forma.** O tipo das entradas passa a **depender do que foi lido**. Campo que não foi lido
fica **ausente** do tipo — não `never` (que é atribuível a tudo e deixaria a trava compilar
vazia), e não `[]` (que é a ausência virando valor).

```ts
// pipeline.ts
/** Qual campo de `EntradasDoMotor` cada leitura produz. */
type SaidaDaLeitura = {
  transacoes: "txs"; faturas: "sts"; recebiveis: "recs"; parcelas: "inst";
  cartoes: "cards"; recorrencias: "recorrencias"; contasFixas: "bills";
};

/** As listas informadas de verdade: chave opcional (ou que aceite `undefined`) não conta. */
type ChavesInformadas<L> = { [K in keyof L]-?: undefined extends L[K] ? never : K }[keyof L];

export type EntradasDasLinhas<L extends LinhasFinanceiras> =
  Pick<EntradasDoMotor, SaidaDaLeitura[ChavesInformadas<L> & keyof SaidaDaLeitura]>;

export type EntradasDoEscopo<E extends EscopoFinanceiro> = Pick<
  EntradasDoMotor,
  { [K in keyof SaidaDaLeitura]: E[K] extends true ? SaidaDaLeitura[K] : never }[keyof SaidaDaLeitura]
>;

export function montarEntradas<L extends LinhasFinanceiras>(linhas: L): EntradasDasLinhas<L>;
```

- **`montarEntradas` fica genérica pelas chaves que recebe.** Em runtime ela só escreve a chave de
  saída cuja lista de entrada é `!== undefined`. O Cron passa `transacoes`, `faturas` e
  `recebiveis` e recebe `{ txs, sts, recs }` — `.inst` nele não compila. É o outro chamador de
  runtime além de `lerFinanceiro`; sem isso, R1 continuaria obtível por lá.
- **`lerFinanceiro` fica genérica pelo escopo**, e o que o escopo não lê some do retorno — inclusive
  `contas` e `recorrencias` cruas, pela mesma regra (hoje elas voltam `[]` quando não lidas, e
  `saldoDasContas([])` é `0`: a ausência de leitura virando saldo zero).

```ts
type ParametrosDaLeitura<E extends EscopoFinanceiro> =
  { escopo: E; owner?: LeituraDoDono } &
  (E["transacoes"] extends true ? { janela: JanelaFinanceira } : { janela?: never });

export type LeituraFinanceira<E extends EscopoFinanceiro> =
  { entradas: EntradasDoEscopo<E>; completude: CompletudeFinanceira } &
  (E["contas"] extends true ? { contas: AccountWithBalance[] } : unknown) &
  (E["recorrencias"] extends true ? { recorrencias: RecorrenciaCrua[] } : unknown);

export async function lerFinanceiro<E extends EscopoFinanceiro>(
  params: ParametrosDaLeitura<E>,
): Promise<LeituraFinanceira<E>>;
```

- O campo `completude` do retorno nasce no passo da **A5** (§5.5); no passo da A1 o retorno ainda
  não o tem.
- **A janela só é exigida quando o escopo lê transações**, e **não pode ser passada** quando não
  lê. `getInvoicesCardData` perde o `janelaDoMes(mesDe(todayIso))` inútil.
- ⚠️ **O único `as` do caminho.** Dentro de `lerFinanceiro`, as linhas são montadas por leitura
  pedida e o resultado de `montarEntradas` é projetado para `EntradasDoEscopo<E>` com **um** `as`
  documentado — o TS não relaciona um objeto montado condicionalmente com um tipo condicional.
  O gêmeo de runtime desse `as` é um teste: nos três escopos, `Object.keys(r.entradas)` (e as
  chaves de topo do retorno) é **exatamente** a lista que o tipo declara.

**Prova.** `@ts-expect-error` (idioma do E1 da 03-B), num teste que roda sob o `tsc --noEmit`:

1. `gastosPorCategoria({ …, installmentItems: entradasDoCard.inst, … })` — não compila;
2. `montarEntradas({ transacoes, faturas, recebiveis }).inst` — não compila;
3. `lerFinanceiro({ escopo: ESCOPO_CARD_FINANCEIRO })` sem janela — não compila;
4. `lerFinanceiro({ escopo: ESCOPO_FATURAS, janela })` — não compila;
5. `saldoDasContas(leituraDeFaturas.contas)` — não compila.

E uma **varredura** (ignorando comentários, fora de `*.test.ts`) que recusa `installmentItems: []`
e `parcelas: []` literais. O que sobra possível — passar uma lista vazia de propósito — fica
**escrito** no código.

**O que isso aposenta.** A "trava de runtime" que o §12 da 03-B empurrava para a REDESIGN-05
(`gastosPorCategoria` recusar `inst` ausente havendo parcela) **deixa de ser necessária**: `inst`
ausente passou a ser erro de compilação, e `inst` vazio só existe escrito à mão.

**Testes da 03-B que mudam por isso** (o objetivo do item, com o motivo no commit):
`pipeline.test.ts` — "lista não informada volta vazia" passa a afirmar que a chave **não existe**;
"listas que o Cron não passa voltam vazias", idem. `ler-financeiro.test.ts` — "card do dashboard:
sem parcelas, `inst` volta []" e "card de faturas: contas não lidas voltam []" passam a afirmar
ausência, com o `@ts-expect-error` ao lado.

### 5.2 A2 · R2 + R4 — linhas estritas, zero `as Linha*`

**O fato que muda a premissa.** O `as LinhaRecebivel[]` existe porque o embed `statement` do
`select` do Cron só tem `data_vencimento`, sem chave em comum com a linha — acrescentar
`competencia` o resolve. O `as LinhaTx[]` **não** some só com colunas a mais: o client gerado
tipa `type`, `status` e `payment_method` como `string` (colunas `text` com CHECK), e `LinhaTx`
exige as uniões do motor. As telas não sentem isso porque `getTransactionsRange` já estreita com
`as unknown as TransactionWithRelations[]`.

Conferido: os arrays de `finance/constants.ts` (`TRANSACTION_TYPES`, `TRANSACTION_STATUSES`,
`PAYMENT_METHODS`) batem **exatamente** com os CHECKs vigentes em `transactions`. Todo valor que
o banco consegue guardar é conhecido pelo TS.

**A forma.**

1. **Campo opcional vira obrigatório anulável** em todas as linhas: `campo?: T` → `campo: T | null`.
   Chave ausente passa a ser erro de compilação, não `null` silencioso. Os quatro campos de
   `resumoMes` continuam obrigatórios e não anuláveis.
2. **Embed não mente sobre a forma.** `type Embutido<T> = T | readonly T[] | null` para
   `category`, `statement`, `transaction` e `parent`, normalizado por um `primeiro()` interno — o
   `one()` do Cron (`cron.ts:190`) existe por isso.
3. **`LinhaTx` aceita `string` em `type`, `status` e `payment_method`** — o que o banco entrega —,
   e `montarEntradas` **estreita** pelos arrays de `constants.ts`. Decisão do dono: **estreitar e
   declarar**. Lançamento com valor fora do domínio **não entra na soma** e é contado por
   `lancamentosForaDoDominio(transacoes)`, que usa o **mesmo** predicado (as duas nascem no passo
   da A2); no passo da A5, `lerFinanceiro` o transforma em `completude: parcial` com motivo
   (§5.5). Nunca lança: um lançamento estranho não
   pode calar o sino inteiro de um usuário (o `catch` do Cron é por usuário, e levaria a fatura
   atrasada junto). No Cron, que não tem onde mostrar completude, a exclusão fica **declarada no
   código**. Para dado real, o número é idêntico: o CHECK garante o domínio.
4. **O `select` do Cron traz o que as linhas pedem:** `category_id, category:categories(id,name,color)`
   nas transações; `statement:card_statements(data_vencimento, competencia)` e
   `transaction:transactions!receivables_transaction_id_fkey(purchase_date)` nos recebíveis —
   **com a FK explícita**, porque `receivables` alcança `transactions` por dois caminhos e a
   ambiguidade do PostgREST só estoura em runtime.
5. **As listas de transações e recebíveis entram em `montarEntradas` como o client as inferiu**,
   sem cast nenhum. ⚠️ Se a inferência do client não fechar com as linhas, **paro e reporto** —
   não troco um cast por outro.
6. A §3.1 da 03-B continua valendo: o Cron **não** usa `lerFinanceiro`.

⚠️ **Faturas ficam de fora, declarado.** `card_statements_with_total` é VIEW, e o tipo gerado de
view tem **toda** coluna anulável (`id: string | null`). O `as Array<{…}>` local do Cron nas
faturas é anterior à 03-B, é o mesmo estreitamento que `getStatements` faz com
`as unknown as CardStatementWithTotal[]`, e não é `as Linha*`. Tirá-lo exigiria decidir o que é
uma fatura sem `id` — fora do escopo.

**Prova.** `@ts-expect-error` numa `LinhaTx` sem `category_id` (M3). Varredura (ignorando
comentários, fora de teste): nenhum `as Linha…` nem `<Linha…>` (M4). Testes do estreitamento:
tipo, status e forma de pagamento desconhecidos ficam fora de `txs` e contam 1 cada;
`payment_method: null` continua válido.

**Testes da 03-B que mudam por isso.** As "diferenças declaradas" do caso D (`category: null`,
`ref_month: null`) **deixam de existir**: a fixture do Cron passa a trazer `category_id`,
`category` e os embeds, e o teste afirma que os campos que o motor soma são idênticos à
referência e que `category_id`/`ref_month` agora saem do dado. "O resumo do Cron sai igual"
continua igual. O teste "dinheiro em texto vira número…" ganha os campos que passaram a ser
obrigatórios.

### 5.3 A3 · R3 — a fronteira que pega qualquer forma

**A forma.** Um teste novo, `src/lib/finance/fronteira-do-motor.test.ts`, com o **compiler API
do TypeScript com checker**, apontado para os arquivos não-teste que importam
`@/lib/finance/dashboard` ou `@/lib/finance/pipeline` (menos `pipeline.ts`). Três regras:

| Regra | Pega |
| --- | --- |
| **(a)** literal de objeto cujo **tipo contextual** é um dos 7 `Dash*` de entrada (ou união que o contenha) | `Array<DashTx> = [{…}]`, `{…} satisfies DashTx`, `resumoMes({ transactions: [{…}] })`, `.map((t): DashTx => ({…}))` |
| **(b)** chamada cujo tipo contextual é `Dash*[]` e cujo callback devolve um literal de objeto | `const x: DashStatement[] = linhas.map((s) => ({…}))` — a N7a |
| **(c)** asserção de tipo (`as`, `<T>`) que nomeia um `Dash*` | `linhas as unknown as DashTx[]` — montar sem mapear |

A regra (b) existe porque **o spike mostrou que (a) sozinha não pega a N7a**: dentro de um `map`
genérico, o tipo contextual do literal é o parâmetro `U`, não `DashStatement`.

**Não fica mais fraca que a da 03-B — complementa.** A regex da 03-B (`Dash*[] =` e
`): Dash* =>`) **continua**, porque ela varre **todos** os arquivos de `src/`, inclusive os que
chegam ao motor por reexportação; a nova só enxerga quem importa o motor, mas enxerga qualquer
forma de escrever. As duas juntas: M5a/b/c e M6 (a N7 reaplicada, nas duas formas) têm de cair.

**Controles, como os da 03-B:** o conjunto varrido tem os arquivos esperados (`cron.ts`,
`finance/queries.ts`, `dashboard/queries.ts`, `reports/queries.ts`, `dashboard/financeiro/page.tsx`);
e `pipeline.ts`, se entrasse, daria **pelo menos sete** achados — prova de que as regras enxergam
as montagens legítimas. O teste lista cada achado como `arquivo:linha`.

**Custo, medido num spike descartável** (fora do repositório): **3,3–3,7 s** no total — 2,1 s para
montar o programa (1.195 arquivos alcançados pelos imports) e 1,5 s de varredura em 12 arquivos.
Na implementação meço de novo o efeito no **tempo de parede da suíte**; se ele crescer mais de
**5 s**, paro e mostro as alternativas — a primeira é um `CompilerHost` restrito (só `src/lib`,
os arquivos varridos e as libs do TS; import fora disso vira `any`, o que não afeta o alias
`Dash*`).

É o **último** passo da Parte A, sobre o estado final.

### 5.4 A4 · `LeituraDoDono` nas três leituras (e o guard sai)

`getCreditCards(owner?)`, `getRecurrences(owner?)` e `getStatementInstallmentItems(ids, owner?)`
ganham `owner` **opcional**, no idioma de `getAccounts`/`getBills`
(`owner?.client ?? createClient()` + `.eq("user_id", owner.userId)` só com owner). Os chamadores
de hoje (cartões, faturas, terceiros, importar, recorrências, parcelamentos, lançamentos,
`ia/comprovantes`, `finance-preview.ts`) **não mudam**.

`getStatementInstallmentItems` filtra `user_id` com owner **mesmo recebendo ids já filtrados**
(invariante 84: sob service role, quem garante o dono é o `.eq` da própria consulta, não a origem
dos ids). `transaction_installments.user_id` existe e é `not null`.

**O guard que lança em `lerFinanceiro` perde a razão de existir e sai.** No lugar: teste provando
que, **com owner, em cada um dos três escopos, cada leitura** sai pelo client do dono e filtra
`user_id` — as parcelas também, além do `in statement_id`.

**Obsoletos, declarados:** a **N8** da 03-B (o guard não existe mais) e os dois testes do guard
em `ler-financeiro.test.ts`, substituídos pelo de cima.

⚠️ Nenhum chamador passa `owner` com os escopos de faturas ou de relatório hoje
(`getInvoicesCardData(todayIso)` não tem o parâmetro, e a assinatura não muda). É capacidade sem
consumidor — coberta por teste, para que o primeiro consumidor não reabra o risco.

### 5.5 A5 · Tetos visíveis (invariante 29)

**O fato que muda a premissa.** O PostgREST do Supabase corta toda resposta no `max_rows` do
projeto. Ele não aparece em `pg_roles` (conferido) — fica na configuração da API, fora do
alcance do SQL — e o padrão da plataforma é **1000**. Se estiver no padrão, `limit(2001)` devolve
1000 linhas e "teto + 1" **nunca** detecta saturação de transações: a leitura sairia "exato" sem
ser, o erro exato que a invariante 29 proíbe. E o "teto 2000" de hoje seria, na prática, 1000.

**Decisão do dono: `count: "exact"`.** As duas leituras com teto pedem a contagem junto
(`.select(SELECT, { count: "exact" })`), e **saturou = contagem > linhas recebidas**; contagem
`null` (falha) conta como "não dá para afirmar que veio completo". Isso vale para qualquer
`max_rows` e qualquer `limit`.

- ⛔ **O `limit` de hoje não muda**, então as linhas somadas são as mesmas — o número é idêntico
  **por construção**, e não existe linha extra para vazar na soma.
- `getTransactionsRange` (só `lerFinanceiro` a chama) passa a devolver
  `{ linhas, saturou }`. `getReceivables` é pública (a tela de terceiros a usa) e **mantém o
  retorno**: a consulta vai para um `lerRecebiveis(owner?)` interno com `{ linhas, saturou }`, e
  `getReceivables` devolve `.linhas` — **uma** consulta, dois retornos.
- O custo é **um COUNT a mais** em cada uma das duas leituras.

**A completude.**

```ts
// pipeline.ts
export type CompletudeFinanceira =
  | { readonly estado: "exato" }
  | { readonly estado: "parcial"; readonly motivos: readonly [string, ...string[]] };
```

União, não `estado` + `motivo?` — "parcial sem motivo" deixa de ser representável (invariante 49).
Os motivos, em pt-BR e sem número de dinheiro: saturação de lançamentos, saturação de recebíveis,
contagem que falhou, e lançamento fora do domínio (§5.2).

- `lerFinanceiro` devolve `completude`.
- **Ganham o campo (aditivo, parâmetros intactos):** `FinanceCardData`, `InvoicesCardData`, e
  `FinanceReport` + `CardReport` dentro de `ReportsData` — os dois com o **mesmo** valor, porque
  saem da mesma leitura. Os testes congelados não montam nenhum desses tipos (conferido: só os
  citam em comentário).
- **A IA passa a usá-lo:** `getSpending` e `getInvoice` (`adapters/finance.ts:115` e `:162`, hoje
  `"exato"` fixo) repassam `completude` + `motivo_incompleto` (os motivos juntos).
  `getBalances` continua `"exato"` — `getAccounts` não tem teto.
- **O coletor de insight do Financeiro tem onde propagar:** `Indicador.qualidade` e
  `SerieTemporal.pontos[].qualidade` aceitam `"parcial"` com `motivo_incompleto`
  (`insights/contracts.ts`). Cada mês leva a qualidade do card daquele mês; `temporal.ts` já
  recusa agregar ponto parcial.
- **O Cron não tem `.limit` e continua sem** — declarado no código. Pôr teto agora truncaria, ou
  seja, mudaria número. ⚠️ O `max_rows` vale para ele também (§11, RR2).
- **Mostrar "parcial" nas telas fica fora** — é da REDESIGN-04/06. A página do dashboard
  financeiro recebe `completude` e não a exibe.

**Prova.** Com o client falso de `ler-financeiro.test.ts` passando a emular `count` e `limit`:
transações saturadas → parcial com o motivo (M8a); recebíveis saturados → idem; contagem nula →
parcial; contagem igual ao recebido → exato. E a **equivalência do número**: com mais linhas que o
teto, as linhas montadas são as `teto` primeiras em ordem de competência — as mesmas de antes
(M8b).

### 5.6 A6 · `saldoDasContas` nas telas de conta

`saldoDasContas` vai para `src/lib/finance/saldo-das-contas.ts`, um módulo **sem import nenhum**,
e `pipeline.ts` o **reexporta** (ninguém quebra). `app/(app)/financeiro/page.tsx:74-77` e
`financeiro/contas/accounts-client.tsx:22` passam a chamá-lo — a mesma fórmula, byte por byte.

⚠️ `accounts-client.tsx` é `"use client"`: importar `pipeline.ts` arrastaria `dashboard.ts` para o
bundle do cliente. Por isso o módulo próprio, e um teste que o reprova se ganhar um `import`.

**Prova.** Varredura (ignorando comentários, fora de teste): nenhum `.reduce(` que alcance
`current_balance` fora do módulo (M9). Até a B3, a IA é a **única exceção declarada**, e a
exceção sai no commit de conserto da B3. Bundle de `/(app)/financeiro` e `/(app)/financeiro/contas`
medido antes (§2) e depois.

### 5.7 A7 · Os limiares do alerta num lugar só

`src/lib/finance/limiares-de-alerta.ts`, sem import:

```ts
export const LIMIARES_DE_ALERTA = {
  gastoAlto: 1.2,
  usoDoLimite: 0.8,
  diasDeAvisoDeVencimento: 5,
} as const;
```

Os defaults de `gerarAlertas` (`dashboard.ts:733-735`) e o `DEFAULTS` do sino (`generate.ts:204-212`)
passam a lê-la. **A assinatura de `gerarAlertas` não muda** — `dashboard.test.ts` (congelado) a
chama com esses parâmetros. ⚠️ No sino, `diasVencimento` governa também o aviso de **conta fixa**;
o valor é o mesmo, e a constante diz isso no comentário.

**Prova.** Um teste de borda que roda **os dois** caminhos com a mesma entrada: saídas a 1,22× a
média (entre 1,2 e 1,25), uso de limite a 0,81, vencimento em 5 e em 6 dias. Tela e sino têm de
concordar em cada caso (M10: o sino volta a ter o próprio 1,25).

⚠️ **Registrado, não consertado:** `usadoPorCartao` soma em **centavos** na tela
(`dashboard.ts:769`) e em **float** no sino (`generate.ts:268`). Na borda do limiar, o % pode
arredondar diferente. Destino no §11.

### 5.8 A8 · O período da IA

`adapters/finance.ts:111` troca `` `${mes}-31` `` por `ultimoDiaDoMes(mes)`. Teste: setembro
termina em **30**, fevereiro de 2026 em **28** (M11). O mês corrente continua terminando em `hoje`.

---

## 6. Parte B — muda número, com o "sim" do dono

Regra para cada item — **dois commits**:

1. **caracteriza o hoje** — teste verde que congela o comportamento atual;
2. **o conserto** — o **mesmo** teste atualizado, e o diff dele **mostra** o número que muda,
   explicado no corpo do commit, com a decisão registrada como do dono.

### 6.0 O harness do Cron

B1 e B2 precisam ver o **efeito no sino**, e hoje não existe teste de `generateForUser`. Nasce
`src/lib/notifications/cron.test.ts`, com um client de service role **falso** que:

- registra tabela e filtros e **aplica** `eq`, `gt`, `gte`, `lte`, `in` e `limit` sobre linhas
  sintéticas — é isso que torna visível o efeito de `.gt("itens", 0)` e da janela nova;
- ignora `or` (agenda), devolve `null` em `maybeSingle` (preferências) e `[]` para o que não tiver
  fixture — Dieta, Treinos e IA já estão isolados por `.catch(() => null)`;
- registra o `insert` em `notifications`, que é o que o teste lê.

Fixture sintética, `now` injetado. Nenhuma chamada de rede.

### 6.1 B1 · Fatura vazia fora do sino e da busca

**Fato.** Na última versão da view (`20260627130000`), `total_atual` e `itens` saem dos mesmos
três `coalesce`. `itens = 0` ⇒ `total_atual = 0`, então o filtro **não** move o gasto alto nem o
alerta de limite. O que muda: deixam de nascer `invoice_overdue` (**urgent**) e `invoice_due` de
fatura vazia — hoje o sino manda "Fatura atrasada — <cartão>" com "R$ 0,00" (`generate.ts:270-296`)
—, e a busca global deixa de achar fatura vazia.

**Commit 1 — caracteriza.**
- Harness: uma fatura vazia (`itens: 0`, vencida, não paga) ao lado de uma real → hoje nascem **dois**
  `invoice_overdue`.
- Varredura da view (compiler API, **sem** checker): toda cadeia que parte de
  `.from("card_statements_with_total")` fora de teste é classificada. Hoje, as leituras **de lista**
  sem `.gt("itens", 0)` são exatamente `notifications/cron.ts` e `search/queries.ts`.

**Commit 2 — conserta.** `.gt("itens", 0)` no Cron (`cron.ts:79`) e na busca (`search/queries.ts:249`).
O harness passa a ver **um** `invoice_overdue` (só o da fatura real). A varredura passa a exigir
**zero** leituras de lista sem o filtro, e a exceção é **estrutural**: cadeia com `.eq("id", …)` é
leitura por id — hoje só `actions/statements.ts:55`, e o teste afirma essa lista para que ela
fique visível. Notificações já gravadas **não** são apagadas.

### 6.2 B2 · Uma régua só para o gasto alto

**Fato — as três réguas de hoje:**

| Eixo | Tela | Sino |
| --- | --- | --- |
| Mês sem saída | ignora | conta como 0 e divide |
| Meses na média | até 5 | exatamente 3 |
| Base do mês corrente | cheio, com pendente | à vista cortado em hoje (cartão pela fatura inteira) |

Nos meses anteriores o corte em hoje não pesa (eles terminam antes); ele só encolhe o mês corrente.

**A forma.** Em `dashboard.ts`, ao lado de `mediaDeSaidas`:

```ts
export function reguaDoGastoAlto(params: {
  mes: string; transactions: DashTx[]; statements: DashStatement[]; receivables: DashReceivable[];
}): { saidas: number; mediaSaidas: number };
```

`saidas` = `resumoMes(mes).saidas`; `mediaSaidas` = `mediaDeSaidas` dos **5 meses anteriores** a
`mes` (`ultimosMeses(mes, 6)` sem o último), ignorando mês com saída `<= 0`.

- A **página** chama `reguaDoGastoAlto({ mes: mesSel, … })` no lugar da conta de hoje. É a mesma
  conta (`evolucao` já é `ultimosMeses(mesSel, 6)`), e um teste de equivalência prova que **o
  número da tela não muda**. `gerarAlertas` continua recebendo `mediaSaidas` — assinatura intacta.
- O **Cron** chama `reguaDoGastoAlto({ mes: mesAtual, … })` e passa `{ saidas, mediaSaidas }` para
  `spending`.
- **`janelaDoCron` vira `janelaDoGastoAlto(mes)`** = do 1º dia de `mes − 5` até
  `ultimoDiaDoMes(mes)` — o que a régua lê, nada a mais. Teste: `janelaDoRelatorio({ mesSel: m,
  mesAtual: m })` **contém** `janelaDoGastoAlto(m)` — a tela lê pelo menos o que a régua pede.
- **`mediaDeSaidas` perde o parâmetro** `ignorarMesesSemSaida`: com uma régua só, a configuração
  do sino não existe mais. A **N5** da 03-B deixa de existir (declarado); a **N6** (`> 0`, não
  `!== 0`) continua valendo.
- O §13.6 ("até a mesma altura do mês anterior") **continua da 03-E**, que passa a refinar **uma**
  régua em vez de duas.

**Efeito, nos dois sentidos:** o sino passa a contar à vista pendente ou com data futura do mês
(dispara **mais cedo**) e deixa de dividir por mês zerado (dispara **menos**). A janela de
transações do Cron passa de ~4 para 6 meses, ainda sem `.limit` (§11, RR2).

**Commit 1 — caracteriza.** Harness com meses anteriores em que um é **zero**, e o mês corrente com
um lançamento pago antes de hoje e um pendente depois de hoje. O teste congela, no sino de hoje,
se `high_spending` nasce e o % da descrição.

**Commit 2 — conserta.** O mesmo teste, com o resultado da régua única — o diff mostra o
"dispara/não dispara" e o % que mudam. `media-saidas.test.ts` perde o bloco da configuração do
sino (a configuração não existe mais) e ganha "a régua única ignora o mês zerado". Os testes de
`janelaDoCron` em `pipeline.test.ts` viram os de `janelaDoGastoAlto`.

### 6.3 B3 · O que é "saldo das contas"

**Fato.** `adapters/finance.ts:65,83` soma só `is_active` e afirma, no comentário, ser "a MESMA
soma do card do dashboard" — o card, o relatório, a página e as duas telas de conta somam todas.
**Nenhuma conta inativa hoje** (contagem, sem valores, em 2026-09-27): a divergência é latente.

**A forma.** `saldo_total = saldoDasContas(contas)` — todas. A lista mostra as ativas **e** as
inativas com saldo diferente de zero, cada item com `inativa: boolean`, e a soma dos itens fecha
com o total (as omitidas têm saldo zero). `contas_inativas_com_saldo` entra nos agregados.
"Ainda não há conta cadastrada" continua o estado vazio; "todas inativas **e** sem saldo" também
(a frase de hoje); "todas inativas **com** saldo" deixa de ser vazio.

**Commit 1 — caracteriza.** `adapters/finance.test.ts` já congela a soma só das ativas; o commit
acrescenta a lista de itens (a inativa com saldo **não** aparece) e a soma dos itens.

**Commit 2 — conserta.** O mesmo teste: o total passa a incluir a inativa, ela aparece marcada, e a
soma dos itens fecha. A exceção declarada da varredura da A6 sai.

---

## 7. Mutações — o critério de aceite

Cada mutação aplicada **sozinha**, na árvore de trabalho. Ela tem de **compilar** — exceto as de
trava de tipo, cuja prova é o `tsc` reprovar com **TS2578** ("Unused '@ts-expect-error'
directive"), como o E1 da 03-B. Registro o **NOME** de cada teste que cai. Restauração conferida
por `git diff --quiet`, nunca pelo verde. Mutação que sair verde: **meço antes de chamar de
fraqueza**.

| # | Mutação | Tem de derrubar |
| --- | --- | --- |
| M1 | `EntradasDoEscopo` volta a expor `inst` no escopo do card (a) · `montarEntradas` volta a devolver `EntradasDoMotor` (b) | `tsc` — TS2578 nos `@ts-expect-error` da A1 |
| M2 | `installmentItems: []` literal num arquivo de runtime | varredura da A1 |
| M3 | `category_id` volta a ser `?:` em `LinhaTx` | `tsc` — TS2578 |
| M4 | `as LinhaTx[]` volta ao Cron | varredura da A2 |
| M5a/b/c | montagem com `Array<DashTx> =` · com `satisfies DashTx` · literal inline em `resumoMes({ transactions: [{…}] })`, cada uma num arquivo de runtime | fronteira da A3, nomeando arquivo e linha |
| M6 | a N7 da 03-B reaplicada, nas duas formas | fronteira da A3 **e** a regex da 03-B |
| M7 | uma das três leituras perde o `.eq("user_id")` com owner | teste de owner da A4 |
| M8a | detecção de saturação desligada (`saturou` sempre falso) | teste de completude |
| M8b | o teto da leitura muda (`limit` + 1) e a linha a mais entra | equivalência do número |
| M9 | `accounts-client` volta a fazer o próprio `reduce` | varredura da A6 |
| M10 | o sino volta a ter o próprio limiar (1,25) | teste de borda da A7 |
| M11 | `periodo.ate` volta a `-31` | teste da A8 |
| M12 | o Cron perde o `.gt("itens", 0)` | harness do Cron **e** varredura da view |
| M13 | o sino volta a dividir por 3 contando mês zerado | harness do Cron (régua única) |
| M14 | a IA volta a somar só as ativas | teste do saldo da IA |

**As mutações da 03-B que mudam de destino, declaradas:** N5 some (a configuração do sino não
existe); N8 some (o guard não existe); N7 vira M6; N1–N4, N6 e N9 continuam valendo e **não** são
reexecutadas como critério desta subfase.

---

## 8. O que a 03-B2 NÃO faz, e por quê

| Fica de fora | Razão |
| --- | --- |
| Mostrar "parcial" nas telas | É da REDESIGN-04/06; a 03-B2 entrega o campo, não o pixel |
| Pôr teto nas leituras do Cron | Truncaria = mudaria número |
| Tirar o cast local das faturas no Cron | Tipo gerado de view tem toda coluna anulável — decidir o que é fatura sem `id` é outra conversa (§5.2) |
| Consertar `usadoPorCartao` centavos × float | Registrado (§5.7); pode mover o % na borda |
| "Até a mesma altura do mês anterior" (§13.6) | Da 03-E, sobre a régua única |
| Apagar notificações de fatura vazia já gravadas | Decisão do dono na B1 |
| Migration | **Nenhuma.** As três aprovadas (`receivable_receipts`, `transactions.liquidado_em`, `categories.classificacao_padrao`) seguem sem ser aplicadas. Nenhuma regeneração de `src/types/supabase.ts` |
| Qualquer defeito achado fora desta lista | Registrado e reportado, não consertado |

---

## 9. Ordem de execução — um commit por passo

Cada passo fecha com `npx vitest run` verde nos diretórios que tocou (no mínimo
`src/lib/finance/` e `src/lib/notifications/`), os 65 + 24 congelados verdes, e `git diff` revisado
(nada sensível, nenhum valor real). Cada tarefa substancial passa pelo `ai-router-br:route` com o
**pacote fatiado por passo**; decisão do dono e desenho ficam no principal.

0. **Este desenho** (só docs).
1. **A4** — owner nas três leituras; o guard sai.
2. **A2** — linhas estritas, estreitamento, `select` do Cron, zero `as Linha*`.
3. **A1** — tipo por escopo e por linhas (R1 + janela).
4. **A5** — `count: "exact"`, completude, IA e coletor de insight.
5. **A6** — `saldoDasContas` nas telas, com bundle medido.
6. **A7 + A8.**
7. **A3** — a fronteira com checker, por último na Parte A, com o tempo da suíte medido.
8. **B1**, **B2**, **B3** — cada um em dois commits (caracteriza → conserta), com o harness do
   Cron nascendo no primeiro commit da B1.
9. **Mutações**, uma a uma, e os cinco comandos.

---

## 10. Critérios de aceite

1. `dashboard-caracterizacao.test.ts` (65) e `dashboard.test.ts` (24) verdes em **todo** passo, e
   `git diff --quiet 704dc66 -- <os dois>` = 0 na ponta.
2. As 14 mutações do §7, cada uma derrubando o que deve, com o **nome** de cada teste que cai e a
   restauração conferida por `git diff --quiet`.
3. Parâmetros de `getFinanceCardData(mes, todayIso, owner?)`, `getInvoicesCardData(todayIso)`,
   `getReportsData(mesSel)` e `generateForUser(service, userId, now)` iguais no diff; os retornos
   só **ganham** campo.
4. `STATUS.md` e `supabase/` intocados. Nenhum `Date.now()`/`new Date()` sem argumento no código novo.
5. Os cinco comandos na ponta, com número medido: `test:run` · `lint` · `tsc --noEmit` · `build` ·
   `perf:bundle` (mediana e as quatro rotas do §2, antes × depois).
6. `TZ=UTC npx vitest run src/lib/finance/ src/lib/notifications/` verde.
7. Zero valor em R$, nome de pessoa, categoria ou saldo real no diff.

---

## 11. Risco residual novo

| # | Risco | Mitigação | Destino |
| --- | --- | --- | --- |
| RR1 | A fronteira com checker só enxerga arquivos que importam o motor; montagem por reexportação, ou por objeto construído sem literal (variável inferida empurrada numa lista), escapa dela | A regex da 03-B continua varrendo todos os arquivos | Aceito, declarado no teste |
| RR2 | **`max_rows` do PostgREST** (padrão 1000, não verificável por SQL) corta em silêncio as leituras **sem** `.limit` — contas, faturas, contas fixas, cartões, recorrências, parcelas — e **todas** as do Cron, cuja janela de transações cresce na B2 | Nenhuma nesta subfase | **03-G** ("leituras que param de engolir falha") — registrar lá |
| RR3 | Um CHECK alargado numa migration sem atualizar `constants.ts` faz o lançamento novo sair da soma | Tela e IA dizem "parcial" com motivo; o Cron exclui em silêncio | Aceito (impossível hoje); um teste que compare os CHECKs das migrations com os arrays fica como sugestão |
| RR4 | `usadoPorCartao` centavos (tela) × float (sino) pode divergir na borda do limiar | Registrado no código (§5.7) | REDESIGN-05 |
| RR5 | `completude` chega à IA e aos insights, mas **não** às telas | O campo existe nos retornos | REDESIGN-04/06 |
| RR6 | `lerFinanceiro` tem **um** `as` para projetar o tipo por escopo | Teste de runtime comparando as chaves nos três escopos | Aceito, declarado no código |
| RR7 | `count: "exact"` custa um COUNT por leitura com teto; o coletor de insight chama o card até 12× em série | Índices de `user_id` + data; single-user | Aceito; medir se a geração de insight ficar lenta |
| RR8 | A régua única compara o mês corrente **cheio, com pendentes** contra meses fechados | É a régua que a tela já usava | 03-E (§13.6) |
| RR9 | Notificações de fatura vazia gravadas antes da B1 continuam no sino até o dono resolver | Decisão do dono | Aceito |
| RR10 | As três leituras aceitam `owner`, mas nenhum chamador com owner usa os escopos de faturas ou relatório | Teste cobre os três escopos com owner | Aceito |

⛔ **Esta subfase não promete "zero bugs".** Ela promete que cada risco da 03-B saiu por uma das
duas portas do §1, que a prova é mutação e não o verde, e que o que ela deixou de fora está no §8
e o que ela criou está aqui.
