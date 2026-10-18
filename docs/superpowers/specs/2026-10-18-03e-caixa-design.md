# Design — REDESIGN-03-E: caixa exato × competência, com rótulo (E6/D9)

> Desenhado com o dono em **2026-10-18**, antes de qualquer linha de código. Escopo declarado em
> `docs/redesign/PLANO.md` (03-E), `METRICAS-FINANCEIRAS.md` §4, §8, §13.1, §13.2, §13.3, §13.4,
> §13.6 e §13.7, e `MIGRATIONS.md` (M2).
>
> **Base:** `7d37305`, ponta de `origin/main` depois do PR #59 (seletor de categoria com pesquisa,
> que mexe em `quick-add.tsx`, `transaction-form.tsx`, `actions/imports.ts` e nos tipos). O desenho
> foi escrito sobre `ba6e0a4` (ponta de `feat/redesign-00-auditoria`, com a 07 de A a D); como a
> branch `feat/redesign-03e-caixa` ainda não tinha commit, ela avançou por fast-forward até
> `7d37305` antes do primeiro commit, para não nascer em conflito com a #59. Sem upstream.
>
> Depois de aprovado, este documento é o contrato: quem discordar de algo aqui para e reporta.
>
> ⛔ O "aprovado" deste desenho **não** é o "aplique a M2", e o "aplique a M2" não é o "aplique a
> M2b". São três autorizações separadas.

---

## 1. O que a 03-E muda de natureza

Até aqui o sistema tinha **uma** data de período, a competência. A 03-E separa **a que mês o
lançamento pertence** (`competence_date`, que não muda) **de quando o dinheiro mexeu**
(`liquidado_em`, coluna nova, a M2):

- a **data de caixa** de um lançamento é `liquidado_em ?? competence_date`. Quando cai para a
  competência, ela é **aproximada**, e toda tela que a usa diz **quantos** lançamentos estão
  aproximados no período. Nunca em silêncio;
- ⛔ **nada é preenchido por dedução.** As linhas existentes ficam com `liquidado_em` nulo:
  nenhum backfill, nenhum job, nenhuma leitura que grave. Quem grava é só quem **sabe** a data
  (K0, §3.1);
- ⛔ **compra no cartão não é saída de caixa.** Quem tira dinheiro é o pagamento da fatura, e as
  compras que o compõem não entram de novo. E compra no cartão **nunca guarda** `liquidado_em`;
- ⛔ **transferência entre contas próprias não é renda nem despesa;**
- ⛔ **competência continua sendo a base padrão.** Com o padrão, nenhum número de tela muda, com
  uma exceção decidida pelo dono: o comparativo do mês em andamento (B2);
- ⛔ **a data só existe em lançamento liquidado** (o CHECK da M2). Todo caminho que tira um
  lançamento de `pago`/`recebido` limpa `liquidado_em` **na mesma escrita** — senão o banco recusa
  com `23514` em runtime. O harness não tem o CHECK por padrão; as provas o ligam pelo gancho
  `antesDeGravar` (P12).

O que **não** muda: a fórmula da base competência (§13.3); "recebimento não é renda"; "reembolso
não reduz a minha despesa nem a fatura" (D3); o "Saldo atual" sem corte de data (vai à 04-A).

---

## 2. Linha de base

### 2.1 Banco — medido em 2026-10-18, só leitura

⚠️ **As contagens precisam do papel `service_role`.** Com FORCE RLS, o dono da tabela também
passa pelas policies, e sem `auth.uid()` a mesma consulta devolve zero em tudo. As medições abaixo
rodaram em `begin read only; set local role service_role;`.

⚠️ **O dono apagou os dados financeiros de propósito em 2026-10-18** (confirmado por ele nesta
sessão, para reimportar do zero). As estatísticas do Postgres registram 624 exclusões em
`transactions`, 475 em `receivables`, 223 em `transaction_installments`, 556 em `import_rows` e 36
em `card_statements`, com autovacuum no mesmo dia.

| Medida | 2026-09-20 (dicionário §8) | 2026-10-18 |
| --- | --- | --- |
| lançamentos | 377 | **0** |
| `pendente` / `cancelado` | 0 / 0 | 0 / 0 |
| `competence_date ≠ purchase_date` | 1 | 0 |
| tocam conta / de cartão | — | 0 / 0 |
| pagamentos de fatura (`pago_transacao_id`) / faturas com `pago_em` | 9 / 9 | 0 / 0 |
| recebimentos (`receivable_receipts`) | — | 0 |
| contas / cartões / categorias | — | 5 / 5 / 26 |
| coluna `liquidado_em` | não existe | **não existe** |
| tabelas no `public` | 133 | 133 |

**Saldo de referência**, anotado na sessão e **só como hash MD5** (nenhum valor na conversa nem no
repositório): o saldo de cada conta (`accounts_with_balance`), o saldo de abertura de cada conta
em `2026-10-01` e o de todas somadas. Hoje as 5 contas têm saldo igual ao saldo inicial.

**Consequência declarada:** com o banco vazio, "o saldo ficou igual depois do B1" é verdadeiro
por construção e **não prova nada** contra dado real. O dono autorizou inserir **dados sintéticos**
para as comprovações; o plano exato (o que entra, como é marcado, como sai) é mostrado a ele
**antes** de rodar (§10, passo 6), e tudo o que for inserido é apagado no fim.

### 2.2 Os cinco comandos — medidos em 2026-10-18, na ponta `ba6e0a4`, antes de tocar em nada

| Comando | Resultado |
| --- | --- |
| `npm run test:run` | **268 arquivos, 6.368 testes**, todos verdes |
| `npm run lint` | limpo |
| `npx tsc --noEmit` | limpo |
| `npm run build` | ok |
| `npm run perf:bundle` | mediana **214,2 KB**, 68 rotas, todas no orçamento |

**Remedido em `7d37305`** (a ponta nova, com a #59), antes do primeiro commit de código: os cinco
verdes, **269 arquivos, 6.383 testes**, lint, tsc e build limpos, mediana **216,3 KB**, 68 rotas, todas
no orçamento. É esta a linha de base da comparação final.

As seis rotas financeiras (`/dashboard`, `/dashboard/financeiro`, `/relatorios`, `/financeiro`,
`/financeiro/lancamentos`, `/financeiro/contas`) são medidas com o medidor completo, fora do
repositório, **antes da A4** — o `perf:bundle` só imprime as dez maiores, e nenhuma delas está lá.

### 2.3 MCP do Supabase

Disponível nesta sessão (`execute_sql`, `apply_migration`, `generate_typescript_types`). Na 03-D
o `apply_migration` voltou `declined` (D55): se acontecer, **para e pergunta** o caminho.

### 2.4 Errata do `MIGRATIONS.md` (como a D29 fez com a M3)

O aviso da M2 diz que `public.account_balance()` "hoje soma por `competence_date`". **Não soma.**
Conferido no banco em 2026-10-18 (`pg_proc.prosrc`): `account_balance(p_account_id)` **não
filtra data nenhuma** — soma todo `pago`/`recebido`, e é por isso que o "Saldo atual" não tem
corte (o 🟠 do §4). Quem usa data é `account_balance_before` (`t.competence_date < p_date`) e o
espelho dela em TS, `daily-balance.ts` (`competence_date <= D`). A M2b (§6.1) troca a de
`account_balance_before`; `account_balance()` fica intocada.

---

## 3. As decisões desta sessão

### 3.1 Do dono (2026-10-18, uma de cada vez)

| # | Decisão |
| --- | --- |
| **K0** | **Quem grava `liquidado_em`:** (1) o formulário, pelo campo **"Data do pagamento"**, opcional, só com status `pago`/`recebido` e **sem cartão**, **vazio por padrão**; (2) o pagamento de fatura grava a data do pagamento; (3) o extrato de conta importado grava a data da linha; (4) fatura de cartão importada, conta a pagar gerada, recorrência, IA, quick-add e o **botão rápido de status** gravam **nulo** — marcar como pago pelo botão não inventa data; (5) **compra de cartão nunca guarda `liquidado_em`**: se a data chegar, o serviço a descarta; (6) os caminhos que tiram o lançamento de `pago`/`recebido` limpam a data na mesma escrita, provados no harness e congelados por varredura com contagem |
| **K1** | **O saldo por data, sim (B1):** a **M2b** troca o filtro de `account_balance_before` para `coalesce(t.liquidado_em, t.competence_date) < p_date`, com o seu próprio "aplique a M2b"; `daily-balance.ts` e a janela de `getDailyBalances` mudam no **mesmo commit**, com teste de espelho e caracterização escrita antes. **A lista do extrato continua agrupada por competência**; a linha cuja data de pagamento difere ganha a marca **"pago em DD/MM"**. O "Saldo atual" sem corte fica como está e vai à **04-A** |
| **K2** | **Onde a base aparece:** seletor **"Base: Competência · Caixa realizado"** só em `/dashboard/financeiro` e `/relatorios`, pela URL (`?base=caixa` por igualdade exata; qualquer outro valor = competência). Os números que **não** seguem o seletor declaram a **própria** base no card. O card do `/dashboard` ganha o rótulo "Competência", sem seletor. Na base caixa **só o bloco de números do topo** troca pelos do §13.2; gráficos, faturas, projeção e categorias continuam em competência, com rótulo. A base caixa tem **leitura própria** pela data de caixa; pagamento de fatura reconhecido pelo vínculo `pago_transacao_id`; transferência sem destino e sem vínculo entra nas saídas e é contada à parte; `ajuste` fica fora |
| **K3** | **Mês em andamento, sim (B2), numa função nova.** Só quando o mês selecionado é o de hoje (D = dia de hoje). Caixa: entradas e saídas do dia 1 ao D nos dois meses. Competência: entradas e saídas **à vista** cortadas no D; **o cartão fica fora** do comparativo, declarado ("a fatura não se divide por dia"). Mês anterior mais curto que D fecha no último dia dele. Base zero = "sem base de comparação". `pendente` continua em competência. **O RR8 (régua do gasto alto, tela e sino) não muda e vai à 04-A** |
| **K4** | **A sobreposição do RR7:** "Reembolsos recebidos" e "Outras entradas de terceiros" aparecem **separados**, nunca somados num número único; o "Resultado de caixa" sai com a nota *"pode contar duas vezes um reembolso que também foi lançado como receita"* quando os dois são > 0 no período; **sem** casar por valor e data. O RR7 continua com destino na 04-C |
| **K3b** | **Onde o corte aparece** (depois do revisor, que achou que `/relatorios` não tem seta): as **setas** dos cards de entradas e saídas de `/dashboard/financeiro` (o valor do card não muda) **e** o **gráfico "Mês a mês"** das duas páginas, com o título "até o dia D". Mês fechado: tudo como hoje (§6.2) |

O dono também autorizou, ao aprovar a K3, **inserir dados sintéticos** no banco para as
comprovações (§10, passo 6), com o plano mostrado antes.

### 3.2 Do desenho (decisões minhas, para o dono conferir na leitura)

| # | Decisão | Por quê |
| --- | --- | --- |
| **P1** | **Renda pessoal recebida e outras entradas de terceiros usam a partição da 03-C**, não o filtro literal `classificacao = 'pessoal'` do §13.2: renda pessoal = Σ `meuCentavos` (`valor_pessoal ?? amount`) das receitas; outras entradas de terceiros = Σ (`amount − meu`). Reusa `meuCentavos` de `dashboard.ts` | Uma receita `compartilhada` (03-C) sumiria das duas linhas com o filtro literal. A partição fecha por construção, e é a mesma regra das "Entradas" em competência — uma segunda regra faria as duas bases discordarem sobre de quem é o dinheiro |
| **P2** | **Só entra no caixa o lançamento que toca conta** (`account_id` não nulo, ou `transfer_account_id` não nulo na transferência). Receita/despesa sem conta e sem cartão é **contada e declarada** à parte ("N lançamentos sem conta ficaram fora") | "Quanto entrou e saiu das minhas contas" (a pergunta do §13.2). Um lançamento sem conta não moveu conta nenhuma; somá-lo seria inventar de qual conta saiu. Estorno de cartão (`receita` com `card_id`) fica fora pela mesma regra |
| **P3** | **`dashboard.ts` fica na lista `NUNCA`** da varredura de `liquidado_em` | O bloco 5/[8 ❌] da caracterização já afirma que o motor **não** menciona `liquidado_em` nem `recebido_em`. Manter o motor cego à data de caixa é o que deixa a base competência intocada por construção, e é por isso que `dashboard-caracterizacao.test.ts` **não muda** nesta subfase (§7). A base caixa mora num módulo próprio, que **importa** do motor (`meuCentavos`, `resumoMes`) e nunca o contrário |
| **P4** | **No comparativo em competência do mês em andamento, quem soma é o próprio `resumoMes`**, chamado com os lançamentos cortados no dia D e `statements: []` | O cartão fica fora sem que a função nova reimplemente uma linha da regra de entradas ou de à vista (invariante 31 aplicada aqui: nenhum caminho novo recalcula o que o motor já calcula) |
| **P5** | **A data de caixa é texto `yyyy-MM-dd` do começo ao fim.** A coluna é `date`; o formulário manda `yyyy-MM-dd`; a comparação é lexicográfica. Nenhum `Date`, nenhum `.slice(0, 10)` | Seção "Fuso" do `CLAUDE.md`: data pura não tem fuso |
| **P6** | **Na base caixa com mês FECHADO, o "vs. mês anterior" é caixa × caixa, mês cheio** (`numerosDoCaixa` sobre os dois meses inteiros). A leitura de caixa já cobre o mês anterior (o B2 precisa dele), então não há leitura extra | Mostrar a seta em competência dentro de um bloco em caixa misturaria as duas bases no mesmo card — o defeito que o §13.1 existe para impedir |
| **P7** | **O corte "até o dia D" vale também no último dia do mês corrente.** O mês só deixa de estar "em andamento" quando vira; no último dia o rótulo continua "até o dia D" (e em competência o cartão continua fora) | Uma regra que muda de forma num único dia do mês é a mais difícil de entender e de testar. A frase "muda em todo dia que não é o último" do rascunho estava errada e foi corrigida (§6.2) |
| **P8** | **"Data do pagamento" não pode ser futura** (posterior a `hojeISO()`). A recusa roda no **serviço** (o schema não tem `hoje` injetado), com mensagem de campo. Data anterior à compra ou à competência é **aceita** (pagamento antecipado existe) | Data futura num lançamento `pago` é previsão, não caixa — e entraria no "Saldo atual" sem corte (RR-E-6) |
| **P9** | **O botão rápido de status só mexe na data ao entrar ou sair do estado liquidado.** `pendente`/`cancelado` → `pago`/`recebido`: grava `null` (não inventa). `pago`/`recebido` → `pendente`/`cancelado`: grava `null` (coerência com o CHECK). `pago` ↔ `recebido`, ou o mesmo status de novo: **não toca** na coluna (a data que o dono informou fica) | Cumpre a K0 ("marcar como pago pelo botão não inventa data") sem apagar uma data verdadeira num clique que não mudou o fato de o dinheiro ter mexido |
| **P10** | **A leitura de caixa usa as leituras que já existem:** os recebíveis pela mesma `getReceivables()` de `/terceiros` (todos, com o legado `pago` datado por `pago_em`, e o teto visível), e os pagamentos de fatura como o conjunto de **todos** os `card_statements.pago_transacao_id` não nulos do dono, sem filtro de data (quem decide o período é a data de caixa do lançamento) | Filtrar recebível por `ref_month` esconderia reembolso; filtrar fatura pela competência jogaria pagamento para "transferência sem vínculo". E a equivalência com `/terceiros` sai por construção |
| **P11** | **O filtro da janela por data de caixa é provado por função pura, não pelo harness.** O harness ignora `or` (`supabase-em-memoria.ts`). Por isso: (1) a string do `or` sai de uma função pura testada; (2) depois da leitura, as linhas passam de novo por `dataDeCaixa(t).data ∈ período` em memória — a consulta pode trazer a mais, nunca decidir sozinha | Uma janela errada no PostgREST não quebra nenhum teste do harness e some com lançamento em silêncio |
| **P12** | **O CHECK da M2 é simulado no harness** pelo gancho `antesDeGravar` (que recusa a escrita com `23514` quando `liquidado_em` não é nulo e o status não é liquidado). As provas da A3 rodam com ele ligado | O rascunho dizia que o harness não tem o CHECK; ele não tem por padrão, mas o gancho existe e torna a prova de Z11 real |

### 3.3 Os fatos que o desenho responde (varredura de 2026-10-18)

1. **Quem escreve `transactions`: 30 pontos em 8 arquivos**, não 16. A contagem do prompt só via a
   chamada escrita numa linha. A varredura multilinha (`from("transactions")` seguido de
   `.insert|.update|.upsert|.delete(`, comentários fora) dá: `actions/bills.ts` 1, `actions/imports.ts`
   2, `actions/installments.ts` 8, `actions/statements.ts` 4, `actions/transactions.ts` 7,
   `finance/generation.ts` 1, `finance/services.ts` 5, `finance/split-reapply.ts` 2.
2. **Só dois caminhos mudam `status` de um lançamento existente:** `updateTransaction`
   (`actions/transactions.ts`, a edição pelo formulário) e `setTransactionStatus` (o botão rápido da
   lista, que também atualiza o par legado por `transfer_group_id`). Os outros `update` mexem em
   `statement_id`, `valor_pessoal`, `classificacao` ou metadados.
3. **O pagamento de fatura já grava a data real** como `purchase_date` e `competence_date`
   (`montarPagamentoFatura`). Gravar `liquidado_em` com a mesma data não muda número nenhum, só tira o
   lançamento da contagem de aproximados.
4. **A importação não tem caminho próprio para o extrato:** passa por `createTransaction` (a mesma
   Server Action do formulário) com `competence_date = r.data_norm`. A fatura de cartão importada
   também passa por lá, com `status: "pago"`. O estorno de cartão vai por insert direto
   (`createCardEstorno`), e continua sem a data (é cartão).
5. **O quick-add (`components/quick-add/quick-add.tsx`)** é um terceiro chamador de `createTransaction`.
6. **O extrato agrupa as linhas por `competence_date`** (`transactions-client.tsx`) e põe o saldo do fim
   do dia no cabeçalho do grupo; a janela de `getDailyBalances` filtra por `competence_date`.
7. **`recebimentos-leitura.ts` é a única leitura de `receivable_receipts`** (P3 da 03-D); `queries.ts`,
   `dashboard.ts` e `reports/queries.ts` estão na lista `NUNCA` de `quem-le-os-recebimentos.test.ts`.
   A leitura da base caixa **chama** `lerRecebimentos` e não menciona a tabela.
8. **`parametros-lidos.ts` (07-C) deriva do código** os parâmetros que cada rota lê; `?base=` entra
   nele sozinho ao ser lido como `sp.base`.

---

## 4. O mapa

| Origem | Item | Muda número? |
| --- | --- | --- |
| E6/§13.2: não há regra para a base caixa nem para o mês parcial | **A1** regras puras | não |
| E6: a coluna não existe | **A2** a M2 (com o "aplique a M2") + tipos | não (coluna nula) |
| "Quem grava a data" (K0) | **A3** os pontos de escrita e a coerência com `status` | não, até alguém informar uma data |
| §13.1: a base não está escrita em lugar nenhum | **A4** rótulo de base, seletor e a leitura de caixa (K2) | não (padrão = competência) |
| Saldo por data (K1) | **B1** M2b + `daily-balance.ts` pela data de caixa | **sim — efeito hoje: zero** (coluna nula) |
| §13.6, mês em andamento (K3) | **B2** "vs. mês anterior" até o dia D | ⚠️ **sim — efeito NÃO é zero** assim que houver dado |
| RR7 da 03-C/03-D (K4) | **B3** a nota da sobreposição | só nota |

---

## 5. Parte A — tudo fecha sem mover número

### 5.1 A1 · As regras puras

**Arquivo novo `src/lib/finance/caixa.ts`.** Puro: sem I/O, sem `Date.now()`, sem `new Date()`; datas
injetadas; dinheiro em centavos por dentro (`transactions.amount` é `numeric(14,2)` em **reais**,
invariante 63) e reais na saída, por `reaisParaCentavos`/`centavosParaReais`.

```ts
export type TxDeCaixa = {
  id: string;
  type: TransactionType;
  status: TransactionStatus;
  amount: number;                 // reais, sempre >= 0
  valor_pessoal: number | null;
  competence_date: string;        // 'yyyy-MM-dd'
  liquidado_em: string | null;    // 'yyyy-MM-dd' | null
  account_id: string | null;
  transfer_account_id: string | null;
  card_id: string | null;
};

/** A data de caixa e se ela é aproximada. Nunca `purchase_date`. */
export function dataDeCaixa(t: Pick<TxDeCaixa, "liquidado_em" | "competence_date">):
  { data: string; aproximada: boolean };

export type Periodo = { de: string; ate: string };   // inclusivo, 'yyyy-MM-dd'

export type NumerosDoCaixa = {
  rendaPessoalRecebida: number;
  reembolsosRecebidos: number;
  outrasEntradasDeTerceiros: number;
  saidasDeCaixa: number;                 // despesas com conta + pagamentos de fatura + transf. sem vínculo
  pagamentosDeFatura: number;            // parcela de saidasDeCaixa, para a tela abrir
  transferenciasSemVinculo: { quantidade: number; total: number }; // dentro de saidasDeCaixa, declaradas
  transferenciasEntreContas: number;     // informativa: NÃO entra no resultado
  resultadoDeCaixa: number;
  aproximados: number;                   // lançamentos do período na data aproximada
  semConta: number;                      // lançamentos liquidados sem conta e sem cartão, fora da conta (P2)
  avisoDeSobreposicao: boolean;          // K4
};

export function numerosDoCaixa(params: {
  periodo: Periodo;
  transactions: readonly TxDeCaixa[];
  /** ids dos lançamentos que são pagamento de fatura (card_statements.pago_transacao_id). */
  pagamentosDeFatura: ReadonlySet<string>;
  recebiveis: readonly RecebivelComRecebimentos[];
}): NumerosDoCaixa;
```

**As fórmulas, uma por linha, sobre os lançamentos `pago`/`recebido` (`SETTLED_STATUSES`) com data de
caixa no período:**

| Número | Fórmula | Exclusões |
| --- | --- | --- |
| Renda pessoal recebida | Σ `meuCentavos(t)` de `type='receita'`, `card_id` nulo, `account_id` não nulo (P1, P2) | estorno de cartão · `pendente`/`cancelado` · sem conta |
| Reembolsos recebidos | **`reembolsosRecebidosNoPeriodo(recebiveis, periodo)`** — chamada, nunca recalculada (03-D) | — |
| Outras entradas de terceiros | Σ (`amount − meu`) das mesmas receitas | reembolso (já contado acima, e não é lançamento) |
| Saídas de caixa | Σ `amount` de `type='despesa'` com `account_id` não nulo e `card_id` nulo **+** Σ `amount` das transferências cujo id está em `pagamentosDeFatura` **+** Σ das transferências com `account_id` e **sem** destino e **sem** vínculo (declaradas) | ⛔ compra no cartão · `pendente`/`cancelado` |
| Transferências entre contas próprias | Σ `amount` de `type='transferencia'` com `account_id` **e** `transfer_account_id` | ⛔ não entra em renda, saída nem resultado |
| Resultado de caixa | renda pessoal + reembolsos + outras entradas − saídas | — |
| Aproximados | quantos lançamentos contados acima (inclusive transferências) caíram no período **pela competência** | — |
| `ajuste` | **fora** de todos os números | declarado na fórmula |

`avisoDeSobreposicao = reembolsosRecebidos > 0 && outrasEntradasDeTerceiros > 0` (K4).

**Para o B2**, no mesmo arquivo ou em `src/lib/finance/comparacao.ts` (decisão do plano):

```ts
/** O dia D do mês em andamento, ou null quando o mês selecionado não é o de hoje. */
export function diaDeCorte(mesSel: string, hoje: string): number | null;

/** 'yyyy-MM' + D → o período 1..D, fechando no último dia quando o mês é mais curto. */
export function periodoAteODia(mes: string, dia: number): Periodo;

export function comparativoAteODia(params: {
  base: "competencia" | "caixa";
  mes: string; hoje: string;
  /* competência */ transactions?: DashTx[]; receivables?: DashReceivable[];
  /* caixa */      caixa?: { transactions: TxDeCaixa[]; pagamentosDeFatura: ReadonlySet<string>; recebiveis: RecebivelComRecebimentos[] };
}): {
  ateODia: number | null;                 // null = mês fechado: a tela usa o comparativo de sempre
  entradas: { atual: number; anterior: number; pct: number | null };
  saidas: { atual: number; anterior: number; pct: number | null };
  cartaoFora: boolean;                    // true só em competência
};
```

Em competência, cada lado é `resumoMes({ mes, transactions: cortadas, statements: [], receivables })`
(P4): as entradas são `entradas`, e as saídas são `aVista`. Na base caixa, cada lado é
`numerosDoCaixa` sobre o período 1..D: entradas = renda + reembolsos + outras entradas; saídas =
`saidasDeCaixa`. `pct` sai de `variacaoPct` (base zero → `null` → "sem base de comparação").

**A prova antes do primeiro leitor:** `src/lib/finance/quem-le-liquidado-em.test.ts`, no padrão de
`quem-le-os-recebimentos.test.ts`: varre `src/` inteiro (produção, comentários fora) por
`liquidado_em`, exige que todo arquivo que menciona esteja numa **allowlist com motivo**, e que os da
lista `NUNCA` não mencionem. **Nasce com a allowlist vazia** (só a A1 e a própria regra) e cresce a
cada passo, sempre no commit que acrescenta o leitor. `NUNCA` começa com `lib/finance/dashboard.ts`
(P3), `lib/finance/pipeline.ts` e `lib/reports/queries.ts` (o relatório de competência).

### 5.2 A2 · A M2

**O arquivo:** `supabase/migrations/<timestamp>_transactions_liquidado_em.sql`, com o SQL do
`MIGRATIONS.md` **exatamente**: `add column if not exists liquidado_em date`, o `comment on column`,
o CHECK `transactions_liquidado_em_coerente` (`liquidado_em is null or status in ('pago','recebido')`)
com `drop constraint if exists` antes, e o índice parcial `transactions_user_liquidado_idx` em
`(user_id, liquidado_em) where liquidado_em is not null`. Idempotente, aditivo, **sem `insert`,
`update` nem `delete` de dado**. Só o comentário de cabeçalho muda: "NULA em todas as 377 linhas"
vira "NULA em todas as linhas existentes" (eram 0 em 2026-10-18; o número envelheceu).

**O teste do arquivo:** `src/lib/finance/m2-liquidado-em.test.ts`, no padrão de
`m1-recebimentos.test.ts`: a coluna é `date` e nula; o CHECK com o texto exato; o índice parcial; o
comentário com "Nunca preencher por dedução"; nenhum `insert`/`update`/`delete` fora de comentário
(Z2); idempotência (`if not exists` / `drop ... if exists`).

**Validação:** `saas-shield-br:migration-validator` sobre o arquivo antes do pedido.

**O pedido:** commit do arquivo e do teste; depois, **numa mensagem só para isso**, o pedido de
"aplique a M2", com o SQL e o resultado do validador. Sem o "aplique a M2" literal, não aplica.

**A aplicação, só depois do "aplique a M2":** `apply_migration` pelo MCP (se voltar `declined`,
para e pergunta); `generate_typescript_types`; diff lido, ficando **só** a coluna em `Row`/`Insert`/
`Update` de `transactions` (o que mais o gerador trouxer fica de fora e é declarado — invariante 94);
tipos num commit próprio; conferência no banco **pelo objeto** (coluna, CHECK, índice, comentário, 0
linhas com valor), nunca pela versão do histórico (D59).

**Por que dá para aplicar antes do deploy:** a M2 é aditiva, e o app no ar continua funcionando com a
coluna nula.

### 5.3 A3 · Quem grava a data, e a coerência com o status

**O campo:** `liquidado_em` em `transactionSchema` (`validators/transaction.ts`), opcional, `yyyy-MM-dd`
ou vazio → `null`, aceitando `null` na entrada (o schema aceita a própria saída; entra em
`validators/round-trip.test.ts`). As duas fixtures da invariante 94 no mesmo commit.

**A regra, pura e testada** (`dataDeLiquidacaoAGravar` em `caixa.ts` ou no serviço):

```
se status ∉ {pago, recebido}  → null      (coerência com o CHECK)
se card_id não nulo           → null      (K0.5: compra de cartão nunca guarda a data)
senão                         → o que veio, ou null se não veio
```

**Os pontos de escrita (K0):**

| Ponto | Arquivo | Grava |
| --- | --- | --- |
| Formulário — criar | `services.ts` `criarTransacao` (via `createTransaction`) | o campo, pela regra |
| Formulário — editar | `actions/transactions.ts` `updateTransaction` | o campo, pela regra — **inclusive limpar** quando o status sai de liquidado |
| Botão rápido de status | `actions/transactions.ts` `setTransactionStatus` | `liquidado_em: null` junto do `status` **só ao entrar ou sair do estado liquidado**; entre `pago` e `recebido` não toca na coluna (P9) |
| Pagamento de fatura | `statement-payment.ts` `montarPagamentoFatura` | `liquidado_em: dataPagamento` |
| Edição de transferência (inclusive o pagamento de fatura) | `updateTransaction`, ramo "apaga e recria" por `isTransfer` → `createTransaction(input)` | o que o formulário reenviar — o campo vem **pré-preenchido com o valor gravado**, então a data sobrevive à edição; teste no harness |
| Extrato de conta importado (despesa, receita e transferência) | `actions/imports.ts` → `createTransaction` | `liquidado_em: r.data_norm` |
| Fatura de cartão importada, estorno | `actions/imports.ts` | nulo (cartão) |
| Conta a pagar, recorrência | `actions/bills.ts`, `finance/generation.ts` | nulo (nascem `pendente` ou sem data conhecida) |
| IA (`lancarTransacao`) e quick-add | chamam o serviço sem o campo | nulo — a equivalência formulário × IA continua com teste |

⚠️ **O formulário mostra o campo só com status `pago`/`recebido` e sem cartão**, vazio por padrão, com
o texto de ajuda "deixe vazio se não souber — o caixa usa a competência e avisa". O valor
pré-preenchido na edição é o gravado, nunca a data da compra.

**O inventário congelado:** `src/lib/finance/quem-escreve-transactions.test.ts`, no padrão de
`quem-apaga-recebiveis.test.ts`: varre `src/` (produção, comentários fora) por toda escrita em
`transactions` (multilinha), exige que cada uma esteja numa **allowlist com contagem e motivo**, e
marca quais **podem mudar `status`** — essas precisam de prova no harness (Z11) de que limpam
`liquidado_em`. Hoje são 30 escritas, 2 que mudam status (§3.3).

**As provas no harness** (`src/test/supabase-em-memoria.ts`, com o CHECK simulado por
`antesDeGravar` — P12): editar um `pago` com data para `pendente` grava `liquidado_em: null`; o botão
rápido de `pago` para `pendente` grava `null`; o botão de `pendente` para `pago` grava `null` (não
inventa); o botão de `pago` para `recebido` não toca na data (P9); criar sem informar grava `null`
(Z12); criar com cartão e data grava `null`; data futura é recusada com erro de campo (P8); editar uma
transferência com data a mantém; pagar fatura grava a data do pagamento; importar extrato grava a
data da linha.

### 5.4 A4 · A base escrita na tela (K2)

**O parâmetro:** `baseDaUrl(v: unknown): "competencia" | "caixa"` — `"caixa"` só por igualdade exata
com a string `"caixa"`; qualquer outra coisa (inclusive `"Caixa"`, `"caixa "`, array) é
`"competencia"` (Z14). Puro, testado, num módulo sem imports de runtime (a tela lê).

**A leitura de caixa:** `src/lib/finance/caixa-leitura.ts` (server-only), uma função
`lerCaixaDoPeriodo(periodo)` que:

1. lê os lançamentos liquidados cuja **data de caixa** está no período — no PostgREST, um `or` de
   dois `and`: (`liquidado_em` nulo **e** `competence_date` no período) **ou** (`liquidado_em` no
   período), com a string montada por função pura testada e as linhas **refiltradas em memória** por
   `dataDeCaixa` (P11). O período lido vai do dia 1 do **mês anterior** ao último dia do mês
   selecionado, porque o comparativo precisa dos dois (P6, B2). Com teto e **teto + 1** visível
   (invariante 29), declarando parcial se saturar;
2. lê **todos** os ids de pagamento de fatura do dono (`card_statements.pago_transacao_id` não nulo),
   sem filtro de data (P10);
3. lê os recebíveis por `getReceivables()` — a mesma leitura de `/terceiros`, que chama
   `lerRecebimentos` (a única de `receivable_receipts`) e anexa (P10);
4. devolve as linhas para `numerosDoCaixa`. Falha de leitura **não** vira zero: devolve erro, e a
   tela escreve que o número não pôde ser lido (o "erro é erro" completo é da 03-G; aqui só não se
   cria um zero novo).

Os parâmetros de `getFinanceCardData`, `getInvoicesCardData`, `getReportsData` e `generateForUser`
**não mudam**: a página chama `lerCaixaDoPeriodo` ao lado, **só quando `base === "caixa"`**.

**A tela:**

- `/dashboard/financeiro` e `/relatorios`: o seletor "Base: Competência · Caixa realizado" no topo,
  clicável (estado na URL, `router.replace`). Com competência, o bloco do topo é o de hoje, byte a byte
  nos números; com caixa, o bloco do topo vira os números do §13.2, com a linha "N lançamentos com data
  aproximada pela competência" quando N > 0, a linha "N lançamentos sem conta ficaram fora" quando
  N > 0, e as transferências sem vínculo declaradas quando houver;
- os cards que **não** seguem o seletor ganham a própria base no `hint`: "Saldo atual · hoje, todas as
  contas", "A receber · recebíveis em aberto", "Gasto no cartão · pela fatura", "Faturas · pela
  fatura", "Próximas contas a pagar · pelo vencimento"; gráficos e listas abaixo ganham "Competência"
  no subtítulo (o "Faturas por mês" já diz);
- `/dashboard`: o card financeiro (`components/dashboard/general/finance-card.tsx`) ganha o rótulo
  "Competência";
- `/financeiro/lancamentos`: a marca "pago em DD/MM" na linha cujo `liquidado_em` difere da
  `competence_date` (K1). O texto de "DD/MM" sai da data pura, sem `Date`.

Claro e escuro; 390 px sem rolagem horizontal (as 5 regras de layout do `CLAUDE.md`). O seletor é um
grupo de dois botões, não um `<select>`, para caber em 390 px sem truncar. As seis rotas da §2.2
medidas antes e depois; a leitura de caixa é server-only e não entra no bundle.

---

## 6. Parte B — aprovada item a item

Cada item no seu commit, com o número antes × depois **no dado sintético**.

### 6.1 B1 · O saldo pela data de caixa (K1)

**A M2b** — `supabase/migrations/<timestamp>_account_balance_before_data_de_caixa.sql`, com o seu
próprio "aplique a M2b", pedido **depois** da M2 aplicada e numa mensagem só para isso:

```sql
-- REDESIGN-03-E · B1 (K1): o saldo de abertura passa a cortar pela DATA DE CAIXA.
-- Única mudança de regra: `t.competence_date < p_date` vira
-- `coalesce(t.liquidado_em, t.competence_date) < p_date`. Com `liquidado_em` nulo em tudo,
-- o resultado é idêntico — e isso é provado pela comparação do saldo antes e depois.
-- A tabela de sinais é a MESMA de public.account_balance (20260625120600) e de `efeitoNoSaldo`
-- em src/lib/finance/daily-balance.ts. Ao mexer numa, mexa nas outras.

create or replace function public.account_balance_before(
  p_account_id uuid,
  p_date date
)
returns numeric
language sql
stable
security invoker
set search_path = ''
as $$
  select
    coalesce((
      select sum(a.initial_balance)
      from public.accounts a
      where p_account_id is null or a.id = p_account_id
    ), 0)
    + coalesce((
        select sum(
          case
            when t.status not in ('pago','recebido') then 0
            when t.type = 'receita' then t.amount
            when t.type = 'despesa' then -t.amount
            when t.type = 'ajuste'  then t.amount
            when t.type = 'transferencia' and t.account_id = a.id then -t.amount
            when t.type = 'transferencia' and t.transfer_account_id = a.id then t.amount
            else 0
          end)
        from public.transactions t
        join public.accounts a
          on (t.account_id = a.id or t.transfer_account_id = a.id)
         and a.user_id = t.user_id
        where (p_account_id is null or a.id = p_account_id)
          and coalesce(t.liquidado_em, t.competence_date) < p_date
      ), 0);
$$;

comment on function public.account_balance_before(uuid, date) is
  'Saldo de abertura de uma conta (ou de todas, com NULL) imediatamente antes de p_date, pela data de caixa (liquidado_em ?? competence_date). Só lançamentos pago/recebido entram; lançamento de cartão não move saldo de conta.';
```

A assinatura não muda (`create or replace` não troca tipo de retorno nem argumentos), então os grants
existentes ficam.

**O TS, no mesmo commit:** `MovimentoDeSaldo` ganha `liquidado_em: string | null`; `saldosPorDia`
ordena e corta por `dataDeCaixa(m).data`; a janela de `getDailyBalances` vira o `or` de dois `and`
da §5.4 (e o `select` traz `liquidado_em`); `dias` continua vindo das `competence_date` da lista
(o cabeçalho do grupo é o dia da competência, e o saldo dele é o do **fim daquele dia** pela data de
caixa).

**A caracterização antes:** um teste novo em `daily-balance.test.ts` fixa o saldo de hoje (coluna nula)
num cenário com vários dias — escrito e verde **antes** da troca, e verde **igual** depois.

**O teste de espelho:** lê o arquivo da M2b e `daily-balance.ts` e afirma que os dois usam a data de
caixa (`coalesce(t.liquidado_em, t.competence_date)` no SQL; `dataDeCaixa` no TS) — Z15.

**Antes × depois no sintético:** um lançamento de competência 03 pago no dia 05: antes, entra no saldo
do dia 03; depois, entra no do dia 05. **Efeito hoje: zero** (coluna nula), conferido pelos hashes da
§2.1 — com a ressalva declarada de que o banco está vazio, e por isso a comparação é repetida com o
dado sintético (§10, passo 6).

### 6.2 B2 · "vs. mês anterior" até o dia D (K3)

**Onde aparece (K3b, decidida pelo dono depois do revisor):** quando o mês selecionado é o de hoje,
o corte alimenta **dois** lugares, e mais nenhum:

1. **as setas dos cards "Entradas do mês" e "Saídas do mês"** de `/dashboard/financeiro`, nas duas
   bases. O **valor** do card não muda (continua o total do mês até hoje); só a linha da seta muda, com
   texto explícito: "até o dia D: +x% vs. o mesmo período de <mês anterior>";
2. **o gráfico "Mês a mês"** de `/dashboard/financeiro` **e** de `/relatorios`, em competência, com o
   título "até o dia D". O formato do gráfico não muda: ele continua recebendo um `Comparativo`, montado
   com `resumoMes` sobre os lançamentos cortados no dia D e `statements: []` (P4) — por isso as saídas
   do gráfico também são só à vista no mês em andamento, e a legenda diz.

`/relatorios` não tem seta, e não ganha uma. Mês fechado: setas e gráfico exatamente como hoje,
`comparativoMesAMes` intocada.

- **Rótulo:** "até o dia D" sempre que o corte vale. Em competência, o de saídas diz "Saídas à vista até
  o dia D · o cartão não entra (a fatura não se divide por dia)".
- **Mês anterior mais curto** (D = 31 em março × fevereiro): o anterior fecha no último dia dele — teste
  com 2026-03-31 × 2026-02-28 e com ano bissexto (2028-03-30 × 2028-02-29).
- **Base zero:** `variacaoPct` → `null` → "sem base de comparação" (Z17).

- **Último dia do mês:** o corte continua valendo (P7) — no último dia, as entradas e o à vista dos
  dois lados já são os do mês inteiro, mas o cartão continua fora em competência.

⚠️ **O número muda.** Antes × depois no sintético, e o aviso na entrega: com dado real, o "vs. mês
anterior" do mês corrente muda **todo dia** — o de entradas por compararem a mesma altura, e o de
saídas em competência por passar a ser **só à vista**.

### 6.3 B3 · A nota da sobreposição (K4)

O "Resultado de caixa" ganha a nota *"pode contar duas vezes um reembolso que também foi lançado como
receita"* quando `avisoDeSobreposicao` é verdadeiro. Os quatro casos testados (só reembolso > 0, só
outras entradas > 0, os dois, nenhum) — Z18. Sem casar valor e data.

---

## 7. A caracterização — o que muda, asserção por asserção

- `src/lib/finance/dashboard.test.ts`: **byte a byte igual** (`git diff --quiet 7d37305 --
  src/lib/finance/dashboard.test.ts` = 0).
- `src/lib/finance/dashboard-caracterizacao.test.ts`: **não muda** nesta subfase (P3). A asserção
  [8 ❌] do bloco 5 (`FONTE_DASHBOARD` não contém `liquidado_em` nem `recebido_em`) **continua
  verdadeira de propósito**: a base caixa nasce fora do motor. O bloco 9 (a base é competência, e cada
  função usa uma data) também continua verdadeiro, porque fala do motor.
- Se a execução precisar mexer em qualquer asserção desses dois arquivos, **para e reporta**.

---

## 8. Mutações — o critério de aceite

Cada mutação aplicada sozinha, **compilando**; o **nome** de cada teste que cai é registrado; a
restauração é conferida por `git diff --quiet`, nunca pelo verde. Mutação que sair verde é **medida**
antes de ser chamada de fraqueza.

| # | Mutação | Tem de derrubar |
| --- | --- | --- |
| Z1 | a M2 perde o CHECK de coerência | `m2-liquidado-em.test.ts` |
| Z2 | a M2 ganha um `update` (backfill) | `m2-liquidado-em.test.ts` |
| Z3 | `dataDeCaixa` ignora `liquidado_em` preenchido | `caixa.test.ts` |
| Z4 | o fallback cai para `purchase_date` | `caixa.test.ts` (o fixture tem `purchase_date ≠ competence_date`) |
| Z5 | a contagem de aproximados some ou zera | `caixa.test.ts` e o teste da tela (A4) |
| Z6 | compra no cartão entra como saída de caixa | `caixa.test.ts` |
| Z7 | o pagamento de fatura some das saídas, ou as compras dele entram de novo | `caixa.test.ts` (cenário do §9 do dicionário) |
| Z8 | transferência entre contas próprias entra como renda ou saída | `caixa.test.ts` |
| Z9 | `pendente` entra no caixa | `caixa.test.ts` |
| Z10 | "Reembolsos recebidos" recalculado em vez de chamar `reembolsosRecebidosNoPeriodo` | `caixa.test.ts` (equivalência com a função da 03-D, incluindo legado sem data) e varredura de fonte |
| Z11 | um caminho tira o lançamento de `pago` sem limpar `liquidado_em` | testes de harness da A3 |
| Z12 | o formulário ou o serviço preenche `liquidado_em` quando ninguém informou | testes da A3 |
| Z13 | um ponto novo de escrita fora da allowlist | `quem-escreve-transactions.test.ts` |
| Z14 | `?base=` fora da allowlist muda a tela | teste de `baseDaUrl` |
| Z15 | `account_balance_before` e `daily-balance.ts` divergem na data | teste de espelho do B1 |
| Z16 | a comparação usa o mês anterior cheio | teste do B2 |
| Z17 | base zero vira `+∞%`/`+100%` | teste do B2 |
| Z18 | a nota da sobreposição aparece com um dos dois zerado, ou some com os dois > 0 | teste do B3 |
| Z19 | compra de cartão guarda `liquidado_em` (K0.5) | testes da A3 |
| Z20 | o botão rápido de status grava uma data ao ir para `pago` | testes da A3 |

---

## 9. O que a 03-E NÃO faz, e por quê

| Fora | Destino |
| --- | --- |
| Corte de data no "Saldo atual" (`account_balance()`) — o "Saldo das contas em DD/MM" do §13.2 | **04-A** |
| A régua do gasto alto (tela e sino) até a mesma altura — o **RR8** | **04-A** |
| Gráficos, evolução, categorias e projeção na base caixa | **04-A** |
| O seletor de responsabilidade (Meu · Terceiros · Consolidado) | **04-A** |
| O vínculo reembolso × receita de terceiro — o **RR7** | **04-C** (com a nota da 03-E como paliativo) |
| Idempotência do pagamento de fatura | **03-F** |
| "Erro é erro" nas leituras e `error.tsx` | **03-G** |
| RR-D-12 a RR-D-21, RR-C2-7 | o destino que já têm |
| Backfill de `liquidado_em` | **nunca** |

---

## 10. Ordem de execução — um commit por passo

0. Este desenho, aprovado (só docs).
1. **A1** — `caixa.ts` + testes + `quem-le-liquidado-em.test.ts` nascendo vazio.
2. **A2** — arquivo da M2 + teste → validador → pedido de "aplique a M2" → aplicação → tipos (commit
   próprio) → conferência no banco.
3. **A3** — schema, regra, pontos de escrita (K0), harness, `quem-escreve-transactions.test.ts`.
4. **A4** — `baseDaUrl`, `caixa-leitura.ts`, seletor, rótulos, marca "pago em", bundle medido.
5. **B1** — caracterização → M2b (pedido de "aplique a M2b") → `daily-balance.ts` + janela + espelho.
   **B2** e **B3**, um commit cada.
6. **Provas com dado sintético** (autorizadas pelo dono, plano mostrado **antes** de rodar): um
   conjunto pequeno de lançamentos com descrição marcada (prefixo fixo, sem nome real), numa conta
   existente, cobrindo cada caso do §5.1 e do B1; conferência dos números pela tela e pelo SQL;
   remoção de **tudo** o que foi inserido, pelo marcador, com contagem antes e depois; e os hashes
   da §2.1 conferidos de novo no fim. Nenhum valor vai ao repositório.
7. **Mutações** Z1–Z20, os cinco comandos e a revisão final da branch inteira no modelo mais capaz.

**Roteador:** cada tarefa substancial passa pelo `ai-router-br:route`, com o pacote fatiado em até 5
arquivos. Decisão do dono, desenho, as migrations (M2, M2b), as provas no banco e as mutações ficam
no principal.

---

## 11. Critérios de aceite

- Os cinco comandos verdes na ponta, com números medidos; mediana e as seis rotas antes × depois.
- `dashboard.test.ts` e `dashboard-caracterizacao.test.ts` sem diff.
- `STATUS.md`, os `CLAUDE.md` e o `AGENTS.md` intocados; `supabase/` só com a M2 e a M2b;
  `src/types/supabase.ts` só com a coluna da M2.
- `TZ=UTC npx vitest run src/lib/finance/ src/lib/notifications/ src/lib/reports/` verde.
- No banco, só leitura, no fim: contagens iguais às do início (depois de remover o sintético);
  `liquidado_em` preenchido = **0**, salvo lançamento que o dono registrar pela tela (declarado sem
  valor nem nome); hashes do saldo iguais.
- Z1–Z20 cada uma derrubando o teste nomeado.

---

## 12. Risco residual novo

| # | Risco | Destino |
| --- | --- | --- |
| RR-E-1 | Lançamento marcado `pago` pelo botão rápido, por conta a pagar ou por recorrência fica **aproximado para sempre** até alguém editar e informar a data. A contagem de aproximados é o que torna isso visível, não o que o resolve | aceito, por decisão do dono (K0) |
| RR-E-2 | No extrato, o cabeçalho do dia é da competência e o saldo é da data de caixa: um lançamento de competência 03 pago em 05 aparece no grupo 03 e só move o saldo do 05. A marca "pago em DD/MM" declara a diferença; reagrupar o extrato pela data de caixa é mudança de período da lista | aceito (K1); reavaliar na 04-A |
| RR-E-3 | Em competência, o comparativo do mês em andamento **deixa o cartão de fora**, e o "vs. mês anterior" de saídas passa a falar só de à vista | aceito (K3), declarado no rótulo |
| RR-E-4 | A nota da sobreposição diz que **pode** haver dupla contagem, não **quanto** | **04-C** (RR7) |
| RR-E-5 | Transferência sem destino e sem vínculo com fatura é tratada como saída de caixa; se for um par legado de `transfer_group_id`, a outra perna pode estar em outra linha | aceito, contada e declarada na tela; medir quando houver dado |
| RR-E-6 | O "Saldo atual" continua sem corte de data (soma liquidado com data futura) | **04-A** |
| RR-E-7 | O RR8 (régua do gasto alto comparando mês parcial com meses cheios, com pendentes) continua | **04-A** |
| RR-E-8 | A prova do "efeito zero" contra dado real é fraca enquanto o banco estiver vazio; a comparação com dado sintético é o substituto declarado | reconferir quando o dono reimportar |
| RR-E-9 | `getReceivables` não expõe o teto nem o erro: se a leitura dos recebíveis falhar, "Reembolsos recebidos" sai 0 sem aviso | **03-G** |
| RR-E-10 | O `coalesce(liquidado_em, competence_date)` da M2b não usa o índice por data | medir quando o volume justificar |
| RR-E-11 | Transferência com só a conta de destino cai em "sem conta", mas o saldo credita a conta: caixa e saldo divergiriam | aceito: **0** linhas assim no banco em 2026-10-18 (`pernasDaTransferencia` preenche as duas pontas) |
| RR-E-12 | `markStatementPaid` aceita data de pagamento futura, e ela vai para `liquidado_em`; o P8 só cobre o formulário | aceito: nenhum número muda (a competência já é essa data); reavaliar na 04-A |
| RR-E-13 | As telas novas não foram conferidas a 390 px | conferir à mão |

---

## 13. Resultado da execução (2026-10-18)

**Banco.** M2 e M2b aplicadas pelo MCP, cada uma depois do "aplique" literal do dono; tipos
regenerados pelo MCP com só as 3 linhas da coluna aceitas. No fim, só leitura: 60 lançamentos,
**0** com `liquidado_em`, 5 notificações — iguais ao início.

**Provas com dado sintético (§10, passo 6).** 11 lançamentos marcados `[03E-SINT]` em maio, junho e
setembro de 2026 (meses sem dado real, exceto o lado anterior do corte), numa conta e num cartão
existentes. O SQL bateu todos os números previstos: renda pessoal, outras entradas, saídas (com a
transferência sem vínculo), entre contas fora do resultado, 2 aproximados, o caixa de junho e o
corte "até o dia 18". O saldo pela M2b: a despesa de competência 03 paga em 05 fica fora do saldo
de 03 e 04 e entra no de 05 (K1). O dono conferiu pela tela. Removidos pelo marcador (11 → 0); os
hashes do saldo (432 pontos, e o saldo atual de cada conta) voltaram **iguais** aos de partida.
Nenhum valor no repositório. Fora das provas no banco, por exigirem escrever em linhas reais:
reembolso, pagamento de fatura e a nota da sobreposição — cobertos por Z10 e Z18.

**Mutações.** Z1–Z20 (23 variantes: Z5 na regra e na tela, Z11 no botão e na edição, Z15 no TS e
no SQL): todas compilam, derrubam o teste nomeado e são restauradas (`git diff --quiet`). A
Z11-edição saiu verde na primeira rodada — o teste mandava "pendente" **sem** data — e ganhou o caso
do formulário que ainda carrega a data.

**Revisão final da branch (modelo mais capaz).** As 8 restrições do dono conferidas, nenhuma
violada. Dois achados corrigidos: o teto da leitura de caixa não via o corte do `max_rows`
(passou a `count` exato + `leituraComTeto`) e o hint do card "Saídas do mês" em competência no mês
em andamento não dizia que o valor inclui o cartão. Os demais viraram RR-E-9 a RR-E-12.

**Os cinco comandos na ponta:** 277 arquivos / 6.546 testes · lint limpo · `tsc` limpo · build ok
· `perf:bundle` com todas as rotas no orçamento, mediana **216,3 KB** (igual à linha de base).
Seis rotas, antes → depois (KB gz): lancamentos 226,0 → 226,4 · contas 218,3 = · relatorios
208,5 → 210,3 · dashboard/financeiro 205,4 → 207,2 · dashboard 207,0 = · financeiro 199,1 =.
`TZ=UTC` em finance/notifications/reports: 51 arquivos, 835 testes. `dashboard.test.ts` e
`dashboard-caracterizacao.test.ts` sem diff.

**Achado fora do escopo (não corrigido, por regra):** em todos os gráficos de valor em reais, o
rótulo do eixo vertical é cortado ("R$ 10,5 mil" quebra e perde o topo) — `YAxis width={78}` em
`evolucao`, `mes-a-mes` e `projecao-chart-impl.tsx`, anterior a esta branch. Relatado pelo dono
em 2026-10-18; vira tarefa própria.
