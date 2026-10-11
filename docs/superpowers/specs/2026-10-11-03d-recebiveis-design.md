# Design — REDESIGN-03-D: reembolsos e recebíveis — recebimento parcial, `ignorado` visível e os três números (E1/D6/D11)

> Desenhado com o dono em **2026-10-11**, antes de qualquer linha de código. Escopo declarado em
> `docs/redesign/PLANO.md` (03-D), `METRICAS-FINANCEIRAS.md` §5, §6, §9, §12 e §13.4, e
> `MIGRATIONS.md` (M1).
>
> **Base:** `17a93e9`, ponta de `feat/redesign-00-auditoria` com a 03-C2 integrada
> (`git merge-base --is-ancestor 8f01d63 feat/redesign-00-auditoria` = 0). A branch
> `feat/redesign-03d-recebiveis` nasceu dali, sem upstream.
>
> Depois de aprovado, este documento é o contrato: quem discordar de algo aqui para e reporta.
>
> ⛔ O "aprovado" deste desenho **não** é o "aplique a M1". São duas autorizações separadas.

---

## 1. O que a 03-D muda de natureza

Até aqui um recebível era **um** fato com um status: devido ou recebido, por inteiro. A 03-D separa
**o que foi devido** (`receivables.valor`, a responsabilidade original, que não muda) **do que já
voltou** (uma linha por recebimento em `receivable_receipts`, com data):

- o saldo do recebível é `valor − Σ recebimentos`;
- `parcial` é **derivado na leitura** e nunca gravado (o CHECK não o aceita, e não vai aceitar);
- ⛔ **o recebimento nunca entra em "minha parte" nem em "terceiros"** (D3). Ele reduz o
  recebível. Não reduz minha despesa, não reduz a fatura devida ao banco e **nunca é renda
  pessoal** (§13.4). A única exceção é declarada e decidida (K3): num recebível que **eu perdoei**
  (`ignorado`), o que o terceiro chegou a pagar continua sendo dele, e só o resto vira meu;
- ⛔ **o recebimento nunca apaga o recebível**, e nenhum caminho de exclusão apaga um recebível que
  já recebeu alguma coisa sem ninguém ver. O cascade da M1 levaria junto o registro de dinheiro que
  entrou;
- ⛔ **nada é marcado sozinho:** os 72 pendentes continuam pendentes; ninguém vira `ignorado`,
  `pago` ou `parcial` por migration, por job ou por leitura.

E uma regra nova, que é a K1 escrita como invariante:

> ⛔ **A coluna `status` nunca afirma `pago` sem a soma fechar.** Quem manda é a soma; a coluna
> acompanha só quando o saldo zera. Por isso "Receber" grava o recebimento **antes** da coluna, e
> "Desfazer" reabre a coluna **antes** de apagar o recebimento: a falha no meio deixa sempre
> "coluna em aberto, soma fechada" — que conta zero em todo total e se conserta com um clique —,
> nunca "coluna `pago`, soma aberta".

---

## 2. Linha de base

### 2.1 Banco — medido em 2026-10-11, só leitura

Contagens por `count(*)`; nenhum nome, nenhum valor.

| Recorte | Contagem |
| --- | --- |
| Recebíveis | **241** |
| … `pendente` / `cobrado` / `pago` / `ignorado` | **72 / 0 / 169 / 0** |
| … `pago` com `pago_em` | 169 (100%) |
| … fora de `pago` com `pago_em` | 0 |
| … `pago_em` no futuro (Brasília) | **0** |
| … em fatura (`statement_id`) / fora | 240 / **1** |
| … o de fora de fatura | compra à vista **em conta** (`card_id` nulo) |
| … com parcela (`installment_id`) | 93 |
| … `valor = 0` | 0 |
| Lançamentos com recebível | **170** |
| Pessoas com recebível | 6 |
| `receivable_receipts` | **não existe** |
| `receivables_id_user_uk` | **não existe** (a M1 cria) |
| `accounts_id_user_uk` | existe |
| `unique (id, user_id)` em `transactions` | **não existe** |
| Tabelas no `public` | **132** |
| Receitas / `pessoal` | 48 / 48 |

Igual às referências do briefing. **Consequência:** com 0 `ignorado` e 0 recebimento, o efeito
numérico da Parte B no dado de hoje é **zero**, item a item. A contagem é repetida no fim (§11).

### 2.2 Os cinco comandos — medidos em 2026-10-11, na ponta `17a93e9`, antes de tocar em nada

| Comando | Resultado |
| --- | --- |
| `npm run test:run` | **214 arquivos / 4.229 testes**, 17,1 s |
| `npm run lint` | limpo |
| `npx tsc --noEmit` | limpo |
| `npm run build` | ok |
| `npm run perf:bundle` | mediana **214,2 KB** · 68 rotas · 1 com teto próprio · todas dentro |

As rotas que esta subfase toca ou vigia (gzip, primeiro carregamento, pelo medidor do `perf:bundle`
reproduzido fora do repositório — `page_client-reference-manifest.js` → chunks → gzip):

| Rota | KB |
| --- | --- |
| `/(app)/terceiros` | **219,3** |
| `/(app)/faturas` | 202,3 |
| `/(app)/parcelamentos` | 203,4 |
| `/(app)/dashboard` | 203,8 |
| `/(app)/dashboard/financeiro` | 201,1 |
| `/(app)/relatorios` | 204,2 |

### 2.3 MCP do Supabase

**Disponível nesta sessão** (`execute_sql`, `apply_migration`, `generate_typescript_types`,
`list_migrations`). As contagens do §2.1 saíram dele. Ele é o único caminho para aplicar a M1 e
regenerar os tipos.

---

## 3. As decisões desta sessão

### 3.1 Do dono (2026-10-11, uma de cada vez)

| # | Decisão | Por quê |
| --- | --- | --- |
| **K0** | **Sem backfill; o legado é DERIVADO num ponto só.** `entradasDoRecebivel` é a única função que conhece o legado: recebível `pago` **sem nenhum** recebimento conta como uma entrada do valor inteiro em `pago_em`; recebível **com** recebimento conta **só** pelos recebimentos. `pago` legado com `pago_em` nulo (0 hoje) zera o saldo e não entra em período nenhum. O **serviço** recusa recebimento em recebível quitado | Sem tratar o legado, "Reembolsos recebidos" daria zero em todo mês passado. E o trigger da M1 só soma `receivable_receipts`: um `pago` legado tem zero linhas, e o banco aceitaria receber de novo o valor cheio. A recusa do serviço cobre o que o trigger não vê |
| **K1** | **A soma manda; a coluna acompanha só quando o saldo zera.** Tabela da §5.3. `parcial` nunca é gravado; "Desfazer" remove **só o último** recebimento; "Ignorar" deixa de alcançar `pago` (só se perdoa o que ainda se deve) e "Receber" deixa de alcançar `ignorado`; recebimento em `ignorado` ou quitado é recusado no serviço | Os leitores da coluna (sino, `totalAReceber` até o B4, os pontos de exclusão) seguem certos sem mudar todos de uma vez. E desfazer o último é o inverso da última ação: apagar o histórico inteiro de uma vez seria a ação mais destrutiva da tela a um clique |
| **K2** | **O recebimento só registra** (valor, data, observação). `conta_id` e `transaction_id` ficam **sempre nulos**: o schema da action é `.strict()` e não as aceita, e um teste prova que o serviço nunca as envia. **O SQL da M1 fica como aprovado** | Criar o lançamento e o recebimento são duas escritas sem transação, e a subfase não cria RPC. O vínculo (E4) e o RR7 vão para a 04-C, já com FK composta. A 03-E herda um aviso escrito (§12) |
| **K3** | **Sim aos quatro** — B1 no alcance completo (motor + à vista + `reports/queries.ts` + `/faturas` + `/parcelamentos` + proteção do `ignorado`), B2 estendido a `/dashboard/financeiro` e `/relatorios`, B3 e B4 | Mostrar "não será cobrado" e continuar contando como do terceiro seria a tela contradizendo o número |
| **K3-a** | **Perdoar um recebível parcialmente recebido: perdoado = saldo.** Deve 600, pagou 250, perdoo o resto: perdoado **350**, minha parte efetiva 400 + 350 = **750**, responsabilidade do terceiro **250**. A conta do §13.3 fecha (1.000 = 750 + 250) | É o que de fato custou: saiu 1.000, voltaram 250. Perdoado = valor cheio diria que custou 1.000 com 250 de volta no bolso |
| **(a)** | **No bloco 5 da caracterização, só as linhas do `ignorado` mudam** em [1] (400 → 1.000) e [2] (600 → 0). `pendente`/`cobrado`/`pago` continuam 400 e 600 | Não é "o terceiro paga", é "eu perdoo" — é a D11. A D3 continua intocada |
| **(b)** | **A A4 alcança também `deleteTransaction` e o desfazer da IA (`excluirTransacaoSimples`), só pela trava "tem recebimento"** | Os dois apagam o lançamento e o cascade `shared_expenses`/`transaction_installments` → `receivables` → `receivable_receipts` levaria o registro do dinheiro que entrou. A regra cheia (`cobrado`/`pago`/`ignorado`) neles bloquearia hoje a exclusão de até **170** lançamentos — mudança de comportamento fora da lista. Com "tem recebimento", o efeito hoje é zero |

### 3.2 Do desenho

| # | Decisão | Por quê |
| --- | --- | --- |
| **P1** | **`DashReceivable` ganha `transaction_id?` e `recebido?` OPCIONAIS.** `montarEntradas` sempre os preenche; um teste do pipeline prova isso. No motor, `recebido` ausente é lido pela K0 sobre uma lista vazia (o `pago` sem recebimento informado é legado) | `dashboard.test.ts` monta `DashReceivable` à mão com quatro campos e fica byte a byte igual. Um campo obrigatório quebraria o `tsc` dele |
| **P2** | **O motor recebe só o valor somado, sem data.** `dashboard.ts` não menciona `receivable_receipts` nem `recebido_em` e fica na lista `NUNCA` da varredura (A1) | O motor continua na base competência; a data do recebimento é dos números do §13.4, que moram no módulo puro. O caso [8] do bloco 5 ("o motor não conhece coluna de liquidação nem de recebimento") continua verde e verdadeiro |
| **P3** | **Os recebimentos são lidos numa consulta própria**, todos do dono, com teto visível (`count: "exact"` → `completude`), e juntados aos recebíveis em memória. Nunca por embed | A invariante 21 da 16-E registra FK composta impedindo o embed do PostgREST. Uma leitura só (`recebimentos-leitura.ts`) serve a `lerRecebiveis` (pipeline e `/terceiros`), `/faturas`, `/parcelamentos` e o Cron (que passa `LeituraDoDono`) |
| **P4** | **A data do recebimento é data pura, nunca no futuro** (`hoje` em Brasília, injetado no serviço). Futuro é recusado no campo | É o que mantém "Total pendente até hoje" igual ao número do card, e um recebimento é um fato que já aconteceu |
| **P5** | **Valor acima do saldo: quem trava é o trigger.** O serviço traduz o `23514` em erro **no campo `valor`** ("passa do saldo: restam R$ X"). A pré-checagem de saldo do serviço existe para a mensagem e para o legado (K0), não como trava | A trava mora no banco, não num `if` (invariante 36) |
| **P6** | **"Desfazer" remove o último recebimento**, por `recebido_em` desc e depois `created_at` desc | O inverso da última ação; LIFO é determinístico |
| **P7** | **A tela:** cada recebível mostra o saldo, o selo "Parcial" e o histórico com data; "Registrar recebimento" é diálogo por `next/dynamic` + `useLazyDialog`; `ignorado` ganha **seção própria, "Não será cobrado"**, com o valor perdoado; o filtro de status passa a usar o estado **derivado**; sai a cópia local `OPEN_STATUSES` | D11: o perdoado não some. A seção sai de uma função pura (`secoesDaLista`), testada — o projeto não tem teste de componente (invariante 25) |
| **P8** | **`RECEIVABLE_STATUS_LABELS.ignorado` passa a ser "Não será cobrado".** A ação continua "Ignorar" | O rótulo do estado fala do efeito; o da ação fala do gesto |
| **P9** | **O harness em memória ganha** um gancho `antesDeGravar` (para simular o trigger) e `update().select()` devolvendo as linhas alteradas | Infraestrutura de teste; nenhum arquivo de runtime o importa |
| **P10** | **"Minha parte efetiva" sai de UMA regra por recebível:** `parteDoTerceiroCentavos` (`ignorado` → o recebido; senão → o valor) e `perdoadoCentavos` (`ignorado` → valor − recebido; senão 0). Motor, `reports/queries.ts`, `/faturas` e `/parcelamentos` chamam as duas | A mesma subtração está escrita em cinco lugares (§5 do dicionário). Cinco cópias da regra do perdoado divergiriam na primeira edição |
| **P11** | **O perdoado do mês é uma FUNÇÃO do motor (`perdoadoDoMes`), não uma chave nova de `ResumoMes`** | Uma chave nova mudaria os `toEqual` dos quatro casos do bloco 1 e o caso de chaves do bloco 6, sem que número nenhum mudasse ali. A função usa os mesmos auxiliares de `resumoMes`; um teste prova que `meu − perdoadoDoMes` é a parte acordada |
| **P12** | **A6 · o encanamento vem antes da Parte B, sem mudar número:** `LinhaRecebivel` ganha `id`, `transaction_id` e `recebimentos`; `montarEntradas` preenche `recebido` e `transaction_id`; o motor ainda não os usa | B1 e B4 viram mudanças só de regra, cada uma no seu commit, e a prova de "o encanamento não move número" é a caracterização inteira verde antes delas |

### 3.3 Os fatos que o desenho responde

| # | Fato (lido no código em 2026-10-11) | Onde |
| --- | --- | --- |
| F1 | O trigger da M1 soma só `receivable_receipts`: não conhece `status` nem o legado | `MIGRATIONS.md` §M1 |
| F2 | `markReceivableReceived` grava `pago` + data; `setReceivableStatus` aceita qualquer status e limpa `pago_em` ao sair de `pago`; o lote filtra a origem **no banco** pela coluna (`ORIGENS_DA_ACAO`) | `actions/receivables.ts`, `finance/receivables-bulk.ts` |
| F3 | Hoje "Ignorar" alcança `pago` (menu e lote) e "Receber" do lote alcança `ignorado` | `terceiros-client.tsx:707`, `receivables-bulk.ts:53-55` |
| F4 | Os pontos que apagam recebível: `reapplySplit` (delete direto), `cancelInstallmentFuture` (delete direto), `undoImportBatch` (delete de transações → cascade), `deleteTransaction` e `excluirTransacaoSimples` (delete de transação → cascade por `shared_expenses`/`transaction_installments`). Só os três primeiros protegem `cobrado`/`pago`; os dois últimos não protegem nada | `split-reapply.ts:104-131`, `installments.ts:311-335`, `imports.ts:978-991`, `transactions.ts:263-299`, `services.ts:237-258` |
| F5 | `DashReceivable` não tem `transaction_id`; à vista o motor só lê `valor_pessoal` | `dashboard.ts:68-75` |
| F6 | A soma de terceiros está em: `somaTerceirosDasFaturas`, `buildSpendItems` (por parcela), `proximas6Faturas` (motor), `reports/queries.ts:161-178` (reais com ponto flutuante), `statements-client.tsx:463` e `partesPorItem` (`/faturas`), `installments-client.tsx:151` (`/parcelamentos`) | — |
| F7 | `totalAReceber` é chamado por `getFinanceCardData` (com mês), `getInvoicesCardData` (sem mês), `getReportsData` (com mês) e a página do dashboard financeiro (com mês). A IA lê `aReceber` do primeiro | `dashboard/queries.ts:140,174`, `reports/queries.ts:146`, `dashboard/financeiro/page.tsx:67` |
| F8 | Cinco rótulos "A receber de terceiros": `finance-card.tsx:37`, `invoices-card.tsx:23`, `financial-dashboard-client.tsx:186`, `relatorios-client.tsx:138` e `:262`. Os dois de `/relatorios` são o número do mês | — |
| F9 | `/terceiros` calcula no cliente "Total a receber" (Σ `valor` de `pendente`/`cobrado`), "Recebido no mês" (Σ `valor` dos `pago` com `pago_em` no mês) e "A receber de {pessoa}" | `terceiros-client.tsx:128-148` |
| F10 | O sino avisa recebível `pendente`/`cobrado` com o `valor` | `generate.ts:354-373`, `cron.ts:83-86,182-200` |
| F11 | A descrição de `finance.get_spending` fala de "a receber" | `ai/tools/registry.ts:720` |
| F12 | O bloco 5, caso [8], afirma que `dashboard.ts` não contém `liquidado_em`, `valor_recebido`, `receivable_receipts` nem `recebido_em` | `dashboard-caracterizacao.test.ts:724-738` |
| F13 | `dashboard.test.ts` constrói `DashReceivable` literal com 4 campos; o único `ignorado` dele vai para `totalAReceber` | `dashboard.test.ts:65-68,369-374` |
| F14 | O harness aplica filtros e registra escritas na ordem, mas `update().select()` devolve `null` e não há como simular erro de constraint | `src/test/supabase-em-memoria.ts` |
| F15 | `finance/constants.ts` não importa nada: o módulo puro novo pode depender dele sem arrastar runtime | — |

---

## 4. O mapa

| Origem | Item | Muda número? |
| --- | --- | --- |
| E1/§13.4: não há regra para saldo, status derivado nem para os três números | **A1** regras puras + a varredura de `receivable_receipts` | não |
| E1: a tabela não existe | **A2** a M1 (com o "aplique a M1") + tipos + backup | não (tabela vazia) |
| D6: não dá para registrar recebimento parcial | **A3** registrar, receber, desfazer, decidir — e o lote | não, até alguém registrar |
| "Ninguém apaga dinheiro que entrou" | **A4** proteção única nos cinco pontos de exclusão | não |
| D11/§12: `ignorado` não aparece como "não será cobrado"; `/terceiros` não mostra saldo nem histórico | **A5** a tela de terceiros | não |
| P12: o motor não recebe o que já foi recebido | **A6** o encanamento | não |
| D11, §6, §13.4 | **B1a/B1b, B2, B3, B4** (K3: os quatro) | **sim — efeito hoje: zero** (0 `ignorado`, 0 recebimento) |

---

## 5. Parte A — tudo fecha sem mover número

### 5.1 A1 · As regras puras

**Onde.** `src/lib/finance/recebimentos.ts` — **puro**: sem `zod`, sem `server-only`, sem I/O, sem
`Date.now()`/`new Date()`; só importa de `./constants` (F15) e `@/lib/format` (que não importa
nada — conferido em 2026-10-11; é de onde o motor já tira os dois). Centavos por dentro
(`reaisParaCentavos`/`centavosParaReais`); **reais na borda**, porque `receivables.valor` e
`receivable_receipts.valor` são `numeric(14,2)` em reais (invariante 63).

**O vocabulário.**

```ts
/** Uma linha de `receivable_receipts`, como chega da leitura. */
export type RecebimentoLido = { readonly valor: number; readonly recebido_em: string };

/** K0 — o que conta como "já voltou". */
export type EntradaDoRecebivel = {
  readonly centavos: number;
  readonly data: string | null; // 'yyyy-MM-dd'; null só no legado sem pago_em
  readonly origem: "recebimento" | "legado";
};

/** O recebível com o recebido JÁ SOMADO (é a forma que o motor recebe — P2). */
export type RecebivelResumido = {
  readonly valor: number;
  readonly status: string;
  /** Em reais. Ausente = nenhum recebimento informado → K0 sobre lista vazia. */
  readonly recebido?: number;
};

export type EstadoDoRecebivel =
  | "pendente" | "parcial" | "cobrado" | "pago" | "ignorado" | "desconhecido";
```

**As funções.**

| Função | Regra |
| --- | --- |
| `entradasDoRecebivel(r: {valor, status, pago_em}, recebimentos)` | **K0, e o único lugar que conhece o legado.** Com ≥ 1 recebimento → uma entrada por recebimento (`origem: "recebimento"`). Sem nenhum e `status = "pago"` → **uma** entrada do valor inteiro em `pago_em` (`origem: "legado"`). Senão → `[]` |
| `recebidoCentavos(r: RecebivelResumido)` | `r.recebido` presente → ele; ausente → Σ de `entradasDoRecebivel({...r, pago_em: null}, [])` |
| `saldoCentavos(r)` | `cent(valor) − recebidoCentavos(r)`, **sem** truncar em zero (o CHECK do banco garante `valor ≥ 0` e o trigger garante `Σ ≤ valor`; a caracterização tem fixture negativa e ela tem de continuar dando o mesmo número) |
| `estadoDoRecebivel(r)` | Avaliada **em ordem**: (1) status fora de `RECEIVABLE_STATUSES` → `desconhecido`; (2) `ignorado` → `ignorado`; (3) saldo ≤ 0 **e** (recebido > 0 **ou** status `pago`) → `pago`; (4) recebido > 0 → `parcial`; (5) `cobrado` → `cobrado`; (6) senão → `pendente`. ⚠️ A (6) inclui a coluna `pago` sem nada recebido — inalcançável pelo app (o legado tem recebido = valor pela K0); é o que faz o corte por data (abaixo) tratar um legado pago **depois** do corte como pendente no corte |
| `emAberto(r)` | estado ∈ {`pendente`, `parcial`, `cobrado`} |
| `parteDoTerceiroCentavos(r)` | **P10.** `ignorado` → `recebidoCentavos(r)` (K3-a); qualquer outro estado, inclusive `desconhecido` → `cent(valor)`. ⛔ **Nunca** o saldo: é a D3 |
| `perdoadoCentavos(r)` | `ignorado` → `cent(valor) − recebidoCentavos(r)`; senão 0 |
| `pendenteDoPeriodo(recs, mes?)` | Σ `saldoCentavos` dos `emAberto`, com `ref_month === mes` quando há mês. **É o que `totalAReceber` passa a chamar no B4.** Devolve reais |
| `totalPendenteAte(itens, corte)` | `itens: {valor, status, pago_em, recebimentos}[]`. Para cada um, o recebido é Σ das entradas (K0) com `data ≤ corte` (legado sem data conta); o estado é recalculado **com esse recebido**. Σ saldo dos `emAberto`. Devolve reais |
| `anexarRecebimentos(recebiveis, recebimentos)` | junção pura por `receivable_id`, na ordem de entrada; recebível sem recebimento ganha `[]` |
| `reembolsosRecebidosNoPeriodo(itens, {de, ate})` | Σ das entradas com `de ≤ data ≤ ate` (texto `'yyyy-MM-dd'`). Legado sem data fica de fora. ⛔ **Nunca** `ref_month`. Devolve reais |
| `perdoadoNoPeriodo(recs, mes)` | Σ `perdoadoCentavos` com `ref_month === mes`. Devolve reais |
| `secoesDaLista(itens)` | `{ emAberto, naoSeraCobrado, historico }` pela ordem de entrada: `emAberto` ← `pendente`/`parcial`/`cobrado`; `naoSeraCobrado` ← `ignorado`; `historico` ← `pago`/`desconhecido`. Σ dos tamanhos = tamanho da entrada |
| `ESTADO_LABELS` | `pendente` "Pendente" · `parcial` "Parcial" · `cobrado` "Cobrado" · `pago` "Recebido" · `ignorado` "Não será cobrado" · `desconhecido` "Status desconhecido" |
| `rotuloPendenteDoMes(mes)` / `rotuloTotalPendenteAte(dataIso)` | "Pendente referente a junho de 2026" / "Total pendente até 11/10" — mês por tabela estática (não `Intl`, para o teste ser determinístico); `DD/MM` recortado do texto, nunca por `Date` |

**Testes** — `src/lib/finance/recebimentos.test.ts`:

- K0: `pago` sem recebimento → 1 entrada legado em `pago_em`; `pago` com recebimento → só os
  recebimentos; `pendente` sem recebimento → `[]`; legado sem `pago_em` → entrada com `data: null`;
  **nenhum recebível conta pelos dois caminhos** (Y11);
- saldo: 600 − 250 = 350 (Y5); recebido ausente + `pago` → saldo 0; recebido ausente + `pendente`
  → saldo = valor;
- estado: cada uma das seis linhas da tabela, inclusive coluna `pago` com recebimento parcial →
  `parcial` (a soma manda) e coluna `pendente` com soma fechada → `pago`;
- `parteDoTerceiroCentavos`: `pendente`/`cobrado`/`pago`/`desconhecido` com recebimento parcial →
  o **valor** (D3); `ignorado` → o recebido (K3-a);
- `perdoadoCentavos`: `ignorado` sem recebimento → valor; com 250 de 600 → 350; outros → 0;
- `reembolsosRecebidosNoPeriodo`: recebimento de 05/06 entra em junho e não em julho; legado com
  `pago_em` em junho entra em junho; **`ref_month` de outro mês não muda nada** (Y10);
- `totalPendenteAte`: recebimento depois do corte não reduz o saldo (Y12); legado pago depois do
  corte conta como pendente no corte; com o corte = hoje e nenhuma data no futuro, é igual a
  `pendenteDoPeriodo(sem mês)` (equivalência);
- `secoesDaLista`: `ignorado` cai em `naoSeraCobrado` e **nenhum item some** (Y18 parte pura);
- os dois rótulos.

**A varredura** — `src/lib/finance/quem-le-os-recebimentos.test.ts`, no padrão de
`quem-le-a-marcacao.test.ts` (mesmo `semComentarios`, mesmas quatro afirmações: o conjunto é
**exatamente** a allowlist; nenhuma entrada morta; a sonda alcança > 700 arquivos e contém os de
`NUNCA`; e cada `NUNCA` não menciona e não está na allowlist). A string é `receivable_receipts`.

Nasce **vazia** (nenhum arquivo de produção a menciona hoje). A allowlist ao fim da subfase:

| Passo | Arquivo | Motivo |
| --- | --- | --- |
| A2 | `types/supabase.ts` | tipos gerados do banco (M1) |
| A2 | `lib/settings/export-tables.ts` | a tabela entra no backup |
| A3 | `types/database.ts` | o tipo da linha (`RecebimentoRow`) |
| A3 | `lib/finance/recebimentos-leitura.ts` | **a única leitura** (P3), inclusive a de proteção (A4) |
| A3 | `lib/finance/recebimentos-servico.ts` | **a única escrita** |

`NUNCA` (não menciona e não entra na allowlist): `lib/finance/dashboard.ts`, `lib/finance/pipeline.ts`,
`lib/finance/recebimentos.ts`, `lib/finance/split.ts`, `lib/finance/split-persist.ts`,
`lib/finance/split-reapply.ts`, `lib/finance/services.ts`, `lib/finance/queries.ts`,
`lib/actions/receivables.ts`, `lib/actions/transactions.ts`, `lib/actions/installments.ts`,
`lib/actions/imports.ts`, `lib/reports/queries.ts`, `lib/dashboard/queries.ts`,
`lib/ai/tools/adapters/finance.ts`, `lib/ai/tools/registry.ts`,
`lib/ai/insights/collectors/finance.ts`, `lib/notifications/generate.ts`,
`lib/notifications/cron.ts`.

⚠️ É varredura **textual** (RR-D-1). A prova comportamental da D3 é o Y9 (motor) e o
`parteDoTerceiroCentavos` (regra).

### 5.2 A2 · A M1

**O arquivo.** `supabase/migrations/20261011210000_receivable_receipts.sql`, com o SQL de
`MIGRATIONS.md` §M1 **byte a byte** no corpo (só o cabeçalho de comentário diz o nome real do arquivo
e a decisão K2): o `unique (id, user_id)` em `receivables`, a tabela, a FK composta
`receivable_receipts_owner_fk` `on delete cascade`, os três índices, RLS + FORCE RLS, a policy
`"own rows"` com `(select auth.uid())`, o trigger `set_updated_at`, a função
`receivable_receipts_nao_excede` (`security invoker`, `search_path = ''`, `for update`, erro
`check_violation`) e o trigger dela. Idempotente, aditivo, **sem `insert`, `update` nem `delete` de
dado**.

⚠️ **Registrado (K2), SQL intacto:** `conta_id` e `transaction_id` são FK **simples**
(invariante 23) e ficam **sem uso** nesta subfase. Ninguém no app as grava (schema `.strict()`); por
chamada direta à API, um usuário poderia apontar para id de outro dono — a FK passaria, porque o
check de FK não passa pela RLS. Destino: 04-C, com FK composta (`accounts_id_user_uk` já existe;
`transactions` precisa de `unique (id, user_id)` numa migration própria) — RR-D-2.

**O teste do arquivo** — `src/lib/finance/m1-recebimentos.test.ts`, no padrão de
`m3-categorias.test.ts` (achado por **conteúdo**, SQL sem comentários):

- existe exatamente um arquivo que cria `receivable_receipts`;
- `receivables_id_user_uk unique (id, user_id)` em `receivables`, recriado de forma idempotente;
- a FK `(receivable_id, user_id) references public.receivables (id, user_id) on delete cascade`
  (Y2);
- `enable row level security` **e** `force row level security` (Y1);
- a policy usa `(select auth.uid())` no `using` **e** no `with check`;
- o trigger dispara `before insert or update`; a função tem `for update` (Y3), `security invoker`,
  `search_path = ''` e a comparação `v_recebido + new.valor > v_devido` com `errcode =
  'check_violation'`;
- `valor numeric(14,2) not null check (valor > 0)`, `recebido_em date not null`;
- nenhuma escrita de dado: nenhum `insert into`, `update public.`, `delete from` (Y4) — o `update`
  que aparece é só o `before insert or update` do trigger, e o teste distingue.

**Validação.** `saas-shield-br:migration-validator` sobre o arquivo, antes do pedido.

**O pedido.** Commit do arquivo e do teste. Depois, **numa mensagem só para isso**, o pedido de
"aplique a M1", com o SQL e o resultado do validador. Sem o "aplique a M1" literal do dono, nada é
aplicado — uma resposta como "pode aplicar" não é tratada como a autorização.

**A aplicação**, só depois do "aplique a M1":

1. `apply_migration` pelo MCP, no projeto `yjvnlbjvippefvzgrxxw`, com o mesmo SQL do arquivo;
2. `generate_typescript_types` pelo MCP;
3. **leitura do diff** (invariante 94): entram só `receivable_receipts` (`Row`, `Insert`,
   `Update`, `Relationships`) e o que a M1 mudar em `receivables`; o que o gerador trouxer a mais
   (na 03-C2: uma relationship de `import_rows` e a sintaxe nova dos genéricos) fica fora e é
   relatado. Os tipos vão num **commit separado**, que acrescenta `types/supabase.ts` à allowlist;
4. conferência no banco, só leitura: a tabela, RLS e FORCE RLS, a policy, os dois triggers, o
   `unique` em `receivables` e **zero** linhas.

**Backup** (commit próprio, depois dos tipos): `receivable_receipts` entra em
`settings/export-tables.ts` **logo depois de `receivables`**, na seção da Fase 05 — sem reescrever
seção de ninguém (invariante 28) —, e `export-tables.test.ts` ganha o caso "inclui
`receivable_receipts`, logo depois de `receivables`" (Y14). `export-tables.ts` entra na allowlist.

**Por que dá para aplicar antes do deploy:** a M1 é aditiva; o app no ar não conhece a tabela e
continua funcionando com ela vazia.

**Sem MCP, ou com "não":** A1 fica; A3–A6 seguem só no que não depende da tabela nos tipos (as
regras puras, a proteção pela coluna, a tela sem histórico) e o que ficou de fora é declarado.
Nunca DDL por outro caminho, nunca tipos à mão.

### 5.3 A3 · Registrar, receber, desfazer, decidir — e o lote

**A tabela da K1** (cada linha é uma função do serviço; o lote reusa a mesma por bloco):

| Ação | Alcança (coluna) | Efeito, na ordem |
| --- | --- | --- |
| **Registrar recebimento** (valor, data, observação) | `pendente`, `cobrado` — com ou sem recebimento | (1) insere o recebimento; (2) **só se o saldo zerou**: coluna `pago` + `pago_em` = a data |
| **Receber** | `pendente`, `cobrado` | (1) insere um recebimento do **saldo restante** (a data escolhida; padrão hoje); (2) coluna `pago` + `pago_em`. Com saldo já zero e coluna em aberto: **só** o (2) — o conserto idempotente |
| **Desfazer** | quem tem recebimento, ou `pago` legado | Com recebimento: (1) se a coluna é `pago` → `pendente` + `pago_em` nulo; (2) apaga **o último** recebimento (P6). Legado: só o (1) |
| **Marcar como cobrado** | `pendente` (inclusive parcial) | só a coluna |
| **Ignorar** | `pendente`, `cobrado` (inclusive parcial) | só a coluna — ⚠️ **não** alcança `pago` (F3) |
| **Voltar para pendente** | `cobrado`, `ignorado` | só a coluna — sair de `pago` é sempre pelo Desfazer |
| Recebimento em `ignorado` ou em quitado | — | **recusado**, com o motivo ("Volte o recebível para pendente antes de registrar um recebimento." / "Este recebível já está quitado.") |
| `parcial` na coluna | — | ⛔ nenhuma função grava (Y6) |

**Onde.**

- `src/lib/finance/recebimentos-leitura.ts` (`server-only`): `lerRecebimentos(owner?)` — todos os
  recebimentos do dono, `count: "exact"`, teto `TETO_DE_RECEBIMENTOS = 5000` → `LeituraComTeto`;
  `recebimentosDe(client, receivableIds)` — por blocos de 200 (`dividirEmBlocos`), para o serviço e
  para a proteção.
- `src/lib/finance/recebimentos-servico.ts` (`server-only`): `registrarRecebimento`,
  `receberSaldo`, `desfazerUltimoRecebimento`, `decidirRecebivel` (cobrado/ignorado/pendente) e
  `aplicarAcaoEmMassa`, todas com `ctx` (o `FinanceServiceContext` de `services.ts`) e `hoje`
  injetado. O `insert` em `receivable_receipts` leva **só** `user_id`, `receivable_id`, `valor`,
  `recebido_em`, `observacoes`.
- `src/lib/validators/receivable.ts`: `registrarRecebimentoSchema` (`.strict()`; `receivable_id`
  uuid, `valor` = `moneyAmount`, `recebido_em` `yyyy-MM-dd`, `observacoes` opcional) e
  `receberSaldoSchema` (`id`, `recebido_em` opcional). **Sem** `conta_id`/`transaction_id` (K2).
  `bulkReceivablesSchema` continua como está.
- `src/lib/actions/receivables.ts`: as actions viram casca (`authContext` → Zod → serviço →
  `revalidateReceivables`). `markReceivableReceived` → `receberSaldo`; `setReceivableStatus` aceita
  só `pendente`/`cobrado`/`ignorado` (`pago` é recusado: "Use Receber"); nova
  `registrarRecebimentoAction` e `desfazerRecebimentoAction`. `updateReceivable` não muda.
- `finance/receivables-bulk.ts`: `ORIGENS_DA_ACAO.receber` → `["pendente", "cobrado"]`;
  `ORIGENS_DA_ACAO.ignorar` → `["pendente", "cobrado"]`; `cobrado` e `desfazer` como estão.
  `patchDaAcao` fica para `cobrado`/`ignorar`; `receber`/`desfazer` passam pelo serviço.
  `receivables-bulk.test.ts` muda nesses dois casos (listados no commit).

**O erro do trigger** (P5): `{ code: "23514" }` vira `fieldErrors: { valor: ["Passa do saldo
deste recebível: restam R$ X."] }`, com X relido depois do erro. A tela usa
`mapServerFieldErrors`.

**Testes** — `recebimentos-servico.test.ts`, com o harness (P9):

- registrar parcial grava **só** o recebimento (nenhum `update` em `receivables`); registrar o
  saldo inteiro grava o recebimento **e depois** `pago` + `pago_em`; **nenhum** `update` grava
  `parcial` (Y6);
- receber: ordem recebimento → coluna (Y22); com saldo zero e coluna em aberto, só a coluna;
- desfazer: ordem coluna → recebimento (Y21); remove **um** só, o último (Y20); legado: só a coluna;
- recusas: recebimento em `ignorado` (Y23), em quitado (legado e por soma), data futura (Y24),
  valor ≤ 0;
- o `23514` simulado pelo gancho vira erro **no campo `valor`** (Y13);
- o `insert` nunca leva `conta_id` nem `transaction_id` (Y28);
- o lote: receber cria um recebimento do saldo por recebível e não alcança `ignorado`; desfazer
  reabre a coluna antes de apagar.

`registrarRecebimentoSchema` e `receberSaldoSchema` entram em `round-trip.test.ts`, e o `.strict()`
recusando `conta_id` vira caso em `validators/receivable.test.ts`.

### 5.4 A4 · Ninguém apaga dinheiro que entrou

**A regra, pura** — `src/lib/finance/protecao-do-recebivel.ts`:

```ts
export type RecebivelParaProteger = { readonly status: string; readonly temRecebimento: boolean };
export type AlcanceDaProtecao = "regra-cheia" | "so-dinheiro-registrado";
export function motivoParaNaoApagar(
  recs: readonly RecebivelParaProteger[],
  alcance: AlcanceDaProtecao,
  acao: "alterar a divisão" | "cancelar as parcelas futuras" | "desfazer a importação" | "excluir o lançamento",
): string | null;
```

- `regra-cheia`: protegido se `temRecebimento` **ou** status ∈ {`cobrado`, `pago`, `ignorado`}
  (`ignorado` entra com o B1, decidido em K3);
- `so-dinheiro-registrado`: protegido só se `temRecebimento` (decisão (b));
- a mensagem diz **por quê** (há recebimento registrado / há recebível cobrado, recebido ou que
  você decidiu não cobrar) e **o que fazer** ("Acerte em A Receber antes de {acao}.").

**A leitura** — `protecaoDosRecebiveis(client, filtro)` em `recebimentos-leitura.ts`: lê
`receivables (id, status)` pelo filtro (`transaction_id = x` · `installment_id in (…)` ·
`transaction_id in (…)`) e a existência de recebimento por `recebimentosDe`. Devolve
`RecebivelParaProteger[]`.

**Os cinco pontos**, nenhum reimplementando a regra:

| Ponto | Alcance | Antes |
| --- | --- | --- |
| `reapplySplit` | regra cheia → `temRecebivelFechado`; `MOTIVO_RECEBIVEL_FECHADO` passa a citar recebimento e "não será cobrado" | `cobrado`/`pago` |
| `cancelInstallmentFuture` | regra cheia | `cobrado`/`pago` |
| `undoImportBatch` | regra cheia | `cobrado`/`pago` |
| `deleteTransaction` | **só dinheiro registrado** (b) | nada |
| `excluirTransacaoSimples` (desfazer da IA) | **só dinheiro registrado** (b) | nada |

**Testes** — com o harness: em cada um dos cinco, um recebível **com recebimento parcial e coluna
`pendente`** bloqueia a operação, com a mensagem dizendo por quê, e **nada** é apagado (Y7, Y8,
Y25); com B1, um `ignorado` bloqueia os três primeiros; `deleteTransaction` com recebível `pago`
legado e **sem** recebimento continua apagando (efeito zero hoje). E `motivoParaNaoApagar` tem
teste puro por linha da regra.

### 5.5 A5 · A tela de terceiros

`/terceiros` (`page.tsx` + `terceiros-client.tsx`):

- `getReceivables` passa a devolver cada recebível com `recebimentos: RecebimentoRow[]` (P3);
- cada cartão mostra: o **saldo** (quando há recebimento), o selo do **estado derivado**
  (`ESTADO_LABELS`), o selo "Cobrado" junto de "Parcial" quando a coluna é `cobrado`, e o
  **histórico** de recebimentos com data e valor (recolhível), com "Desfazer o último" no último;
- "Registrar recebimento" (novo, no cartão e no menu): diálogo com valor (padrão = saldo), data
  (padrão = hoje, gerada no handler) e observação — `next/dynamic` + `useLazyDialog`, arquivo
  próprio `registrar-recebimento-dialog.tsx`;
- as seções saem de `secoesDaLista`: **Em aberto** · **Não será cobrado** (com o valor perdoado e a
  frase "Você decidiu não cobrar. O valor conta como despesa sua.") · **Histórico**;
- o filtro "Status" lista os estados derivados e filtra por `estadoDoRecebivel`;
- os botões seguem a K1 (§5.3): "Receber" só em aberto; "Desfazer" onde há o que desfazer;
  "Ignorar" some de quitado; "Voltar para pendente" só em `cobrado`/`ignorado`;
- a cópia local `OPEN_STATUSES` sai; o que precisar de "em aberto" usa `emAberto`;
- os KPIs **não mudam de número aqui** (o B3 e o B4 os mudam).

Claro e escuro, 390 px sem rolagem horizontal (regras 1–5 do layout responsivo). Bundle de
`/(app)/terceiros` medido antes e depois.

**Testes:** `secoesDaLista` (A1) cobre Y18 na regra; uma varredura do fonte de
`terceiros-client.tsx` (sem comentários) prova que ele **não** declara `OPEN_STATUSES` local e que
as seções saem de `secoesDaLista` (fiação por varredura, como a 03-C2 — RR-C2-11).

### 5.6 A6 · O encanamento

- `pipeline.ts`: `LinhaRecebivel` ganha `id: string`, `transaction_id: string | null`,
  `pago_em: string | null` e `recebimentos: readonly RecebimentoLido[]` (estritos, como as linhas da
  03-B2). `montarEntradas` preenche `DashReceivable.transaction_id` e `DashReceivable.recebido`
  (reais, Σ de `entradasDoRecebivel` — K0).
- `dashboard.ts`: `DashReceivable` ganha `transaction_id?: string | null` e `recebido?: number`
  (P1). **Nenhuma função do motor os lê ainda.**
- `lerFinanceiro`: `lerRecebiveis` já devolve cada recebível com os recebimentos desde a A5
  (a leitura `lerRecebimentos(owner)` entra no **mesmo** `Promise.all` de lá, e a junção é pura —
  `anexarRecebimentos`, em `recebimentos.ts`); aqui o teto saturado dos recebimentos vira motivo de
  `completude`.
- O Cron (`notifications/cron.ts`) lê os recebimentos por `lerRecebimentos({ client: service,
  userId })` e junta antes de `montarEntradas` — sem mencionar a tabela.
- `/faturas` (`getReceivablesByStatements`) e `/parcelamentos` (`getInstallmentPurchases`) recebem
  a mesma junção.

**Prova de que não move número:** `dashboard.test.ts` e `dashboard-caracterizacao.test.ts` byte a
byte iguais neste commit; `pipeline.test.ts` ganha o caso "todo `DashReceivable` montado tem
`recebido` e `transaction_id` definidos" e os mapeamentos de referência do Cron ganham os dois
campos (sem mudar número); `ler-financeiro.test.ts` confere que a leitura nova só acontece com
recebíveis no escopo.

---

## 6. Parte B — aprovada item a item (K3)

Cada item no seu commit, com o número antes × depois **no dado sintético** e a prova de efeito zero
no dado de hoje: 0 `ignorado` e 0 recebimento (§2.1), e a equivalência "sem `ignorado` e sem
recebimento, a função nova devolve o mesmo que a antiga" escrita como teste em cada item.

### 6.1 B1a · D11 no motor, nos relatórios e nos cards

- `somaTerceirosDasFaturas`, o mapa por parcela de `buildSpendItems` e o mapa por fatura de
  `proximas6Faturas` somam `parteDoTerceiroCentavos` em vez de `cent(valor)`;
- **à vista** (`resumoMes` com `card_id` nulo, e os itens à vista e à-vista-do-cartão de
  `buildSpendItems`): `meu += perdoadoCentavos` dos recebíveis com `transaction_id = t.id` e
  `installment_id` nulo — por isso `DashReceivable` precisava de `transaction_id`;
- `perdoadoDoMes({ mes, transactions, statements, receivables })` (P11): Σ do perdoado dos
  recebíveis das faturas do mês **e** dos à vista do mês, pelos mesmos auxiliares;
- `reports/queries.ts:161-178`: `+ r.valor` → `+ centavosParaReais(parteDoTerceiroCentavos(r))`,
  **mantendo** a acumulação em ponto flutuante de hoje (consertá-la mudaria centavos — fora da
  lista; registrado);
- a linha **"inclui R$ X que você decidiu não cobrar"**, só quando `perdoadoDoMes > 0`: no card
  Financeiro do `/dashboard` (sob "Realmente meu"), no card de "meu" do `/dashboard/financeiro` e
  na dica "meu" das saídas em `/relatorios`. `getFinanceCardData` e `getReportsData` ganham o campo
  `perdoado` no retorno (os parâmetros não mudam).

**Sintético** (compra no cartão de R$ 1.000, terceiro R$ 600):

| Cenário | Antes | Depois |
| --- | --- | --- |
| `ignorado`, sem recebimento | `cartaoMeu` 400 · `terceiros` 600 | **1.000 · 0** · perdoado 600 |
| `ignorado`, 250 recebidos (K3-a) | 400 · 600 | **750 · 250** · perdoado 350 |
| `pendente`/`cobrado`/`pago`, com ou sem recebimento | 400 · 600 | **400 · 600** (D3) |
| à vista em conta, `valor_pessoal` 400, recebível 600 `ignorado` | `aVistaMeu` 400 | **1.000** |

**Testes:** `dashboard-recebimentos.test.ts` (novo) — os quatro cenários; o fechamento do §13.3
(`saidas = meu + terceiros` com perdoado); `meu − perdoadoDoMes` = parte acordada; Y17 é o caso do
bloco 8 que vira (§7).

### 6.2 B1b · D11 em `/faturas` e `/parcelamentos`

- `/faturas`: o total de terceiros por fatura e `partesPorItem` usam `parteDoTerceiroCentavos`; uma
  pessoa com parte perdoada aparece com "não será cobrado" e o valor, em vez de sumir; o "meu" da
  fatura ganha a linha "inclui R$ X…";
- `/parcelamentos`: `porPessoa`, `terceirosTotal` e `meu` idem;
- os cálculos saem para funções puras **exportadas** dos dois clientes (ou para `recebimentos.ts`,
  se forem genéricas) e ganham teste — o projeto importa `.tsx` em teste sem problema (F12 da
  03-C2).

Bundle de `/(app)/faturas` e `/(app)/parcelamentos` medido antes e depois.

### 6.3 B2 · Os rótulos distintos

| Onde | Antes | Depois |
| --- | --- | --- |
| `/dashboard`, card Financeiro (`totalAReceber(recs, mes)`) | "A receber de terceiros" | `rotuloPendenteDoMes(mes)` — "Pendente referente a {mês}" |
| `/dashboard`, card Cartões & Faturas (`totalAReceber(recs)`) | "A receber de terceiros" | `rotuloTotalPendenteAte(hoje)` — "Total pendente até DD/MM" |
| `/dashboard/financeiro` (`totalAReceber(recs, mesSel)`) | "A receber de terceiros" | "Pendente referente a {mês}" |
| `/relatorios`, abas Financeiro e Cartão (`totalAReceber(recs, mesSel)`) | "A receber de terceiros" ×2 | "Pendente referente a {mês}" ×2 |

O número não muda. Fica de fora, registrado: o rótulo do indicador da IA em
`insights/collectors/finance.ts` (RR-D-6).

### 6.4 B3 · "Recebido no mês" pelos recebimentos

`/terceiros`: o KPI passa a ser `reembolsosRecebidosNoPeriodo` do mês corrente (recebimentos +
legado da K0), com o rótulo "Reembolsos recebidos em {mês}".

**Sintético:** recebível A de 600 com recebimentos de 250 (05/06) e 350 (20/07, coluna `pago`,
`pago_em` 20/07); recebível B legado de 100 pago em 10/06.

| Mês | Antes (`pago_em` + `valor`) | Depois |
| --- | --- | --- |
| junho | 100 | **350** (100 legado + 250) |
| julho | 600 | **350** |

Hoje (0 recebimento, todo `pago` legado com `pago_em`), os dois dão o mesmo número: o teste de
equivalência monta só legados e compara as duas contas.

### 6.5 B4 · "A receber" é o saldo

- `totalAReceber(recs, mes?)` passa a ser `pendenteDoPeriodo(recs, mes)` — estado derivado e
  saldo, pela regra da A1;
- o sino: o Cron entrega a `generateForUser` só os recebíveis `emAberto`, com `valor` = **saldo**
  (`generate.ts` não muda);
- `/terceiros`: "Total a receber" → `totalPendenteAte(hoje)` com o rótulo "Total pendente até
  DD/MM"; "A receber de {pessoa}" → Σ saldo dos em aberto dela, rótulo "Pendente de {pessoa}"; o
  lote mostra Σ saldo no "Receber";
- a IA: `aReceber` vira saldo pela mesma `getFinanceCardData`; a descrição de
  `finance.get_spending` passa a dizer "a receber (o que ainda falta receber de terceiros: o
  devido menos o que já foi recebido)", com teste em `registry.test.ts` que recusa a descrição sem
  essa frase (invariante 100).

**Sintético** (o §9): recebível 600 `pendente`, 250 recebidos.

| Número | Antes | Depois |
| --- | --- | --- |
| `totalAReceber` | 600 | **350** |
| `cartaoMeu` | 400 | **400** (D3 — Y9) |
| `entradas` / `entradasMeu` | 0 / 0 | **0 / 0** (reembolso não é renda — Y16) |
| sino | "R$ 600,00" | "R$ 350,00" |

**Testes:** `dashboard-recebimentos.test.ts` — Y9 repete o caso [1] do bloco 5 **com** recebimento
parcial; Y16; Y19; e a equivalência de `totalAReceber` antigo × novo sem recebimento.

---

## 7. A caracterização — o que muda, asserção por asserção

⛔ `dashboard.test.ts` fica **byte a byte igual**. Em `dashboard-caracterizacao.test.ts`, **só** o
que está abaixo, e cada mudança cai no commit do item que a provoca. Os blocos 4, 6, 7, 9 e 10
ficam **idênticos**. O caso [8] do bloco 5 fica idêntico (P2).

| # | Bloco · caso | Antes → depois | Commit |
| --- | --- | --- | --- |
| C1 | 1 · "congela o objeto completo…" | `meu` 280.55 → **300.55** · `terceiros` 140.05 → **120.05** · `cartaoMeu` 200.3 → **220.3** (o `ignorado` de 20.2 na fatura de junho) | B1a |
| C2 | 1 · "soma responsabilidade original de terceiros sem filtrar status ou ref_month" | `terceiros` 100 → **60** · `meu` 0 → **40** · `cartaoMeu` 0 → **40**; nome → "…sem filtrar status (exceto `ignorado`, D11) nem ref_month" | B1a |
| C3 | 1 · "preserva meu negativo quando recebiveis superam o total da fatura" | o status da fixture `"ignorado"` → **`"pendente"`**; asserções **idênticas** (o caso continua provando `meu` negativo; o `ignorado` passa a ser do bloco 8) | B1a |
| C4 | 2 · "agrega a vista por competencia e cartao/parcela…" | Viagem `meu` 220 → **230** (o `ignorado` de 10 na parcela) | B1a |
| C5 | 3 · "congela uma fatura real e uma virtual…" | real: `meu` 50 → **80.15** · `terceiros` 50.25 → **20.1** | B1a |
| C6 | 5 · [1] | só a linha `resumo9("ignorado").cartaoMeu`: 400 → **1000**, com o comentário da D11; as outras três **idênticas** | B1a |
| C7 | 5 · [2] | o laço passa a `["pendente", "cobrado", "pago"]` (600) e ganha a linha `resumo9("ignorado").terceiros` → **0**; nome → "…é R$ 600 enquanto ele deve; perdoado, é zero (D11)" | B1a |
| C8 | 5 · [3+4] | só o **nome**: "…são IRREPRESENTÁVEIS…" → "[3+4] reescrever o `valor` NÃO é o jeito de dizer 'restam R$ 350' — o preço continua medido (a 03-D os representa por recebimento)"; asserções idênticas | B4 |
| C9 | 8 · `it.each` de `resumoMes` | `"ignorado"` sai da lista (fica `"status-inventado"`) | B1a |
| C10 | 8 · `it.each` de `proximas6Faturas` | `"ignorado"` sai da lista | B1a |
| C11 | 8 · `it.each` de `gastosPorCategoria` | `"ignorado"` sai da lista | B1a |
| C12 | 8 · "⚠️ `ignorado` conta como terceiro hoje…" | vira "D11 — `ignorado` vira despesa minha: 400 → 500"; `toBe(400)` → **`toBe(500)`** e `not.toBe(400)` (Y17) | B1a |

O comportamental do `ignorado` nas três funções (C9–C11) passa a ser afirmado em
`dashboard-recebimentos.test.ts`, que é novo. Se a execução precisar mexer em qualquer outra linha
deste arquivo, **para**.

---

## 8. Mutações — o critério de aceite

Cada mutação é aplicada **sozinha** e tem de **compilar**. Registro o **NOME** de cada teste que cai.
A restauração é conferida por `git diff --quiet`, nunca pelo verde. Mutação que sair verde: **meço
antes de chamar de fraqueza**.

| # | Mutação | Tem de derrubar |
| --- | --- | --- |
| Y1 | a M1 perde o `force row level security` | `m1-recebimentos.test.ts` |
| Y2 | a FK de `receivable_id` vira simples (sem `user_id`) | `m1-recebimentos.test.ts` |
| Y3 | o trigger perde o `for update` | `m1-recebimentos.test.ts` |
| Y4 | a M1 ganha um `insert` (backfill) | `m1-recebimentos.test.ts` |
| Y5 | o saldo ignora os recebimentos | `recebimentos.test.ts` |
| Y6 | o serviço grava `parcial` na coluna | `recebimentos-servico.test.ts` |
| Y7 | `reapplySplit` apaga recebível com recebimento parcial | teste da A4 (`split-reapply`) |
| Y8 | `cancelInstallmentFuture` idem | teste da A4 (`installments`) |
| Y9 | o motor usa o saldo, e não o valor, na soma de terceiros (fere a D3) | `dashboard-recebimentos.test.ts`, o [1] com recebimento parcial |
| Y10 | "recebidos no período" usa `ref_month` em vez de `recebido_em` | `recebimentos.test.ts` |
| Y11 | um `pago` legado conta duas vezes, ou some (K0) | `recebimentos.test.ts` |
| Y12 | "total pendente até DD/MM" ignora a data de corte | `recebimentos.test.ts` |
| Y13 | o serviço deixa de traduzir o erro do trigger em erro de campo | `recebimentos-servico.test.ts` |
| Y14 | `receivable_receipts` fica fora do backup | `export-tables.test.ts` |
| Y15 | um arquivo da lista `NUNCA` passa a ler `receivable_receipts` | `quem-le-os-recebimentos.test.ts` |
| Y16 | os recebimentos entram em `entradas`/`entradasMeu` | `dashboard-recebimentos.test.ts` |
| Y17 | `ignorado` continua na soma de terceiros | o caso C12 do bloco 8 |
| Y18 | `ignorado` some da lista de `/terceiros` | `recebimentos.test.ts` (`secoesDaLista`) |
| Y19 | `totalAReceber` volta a somar o valor cheio com recebimento parcial | `dashboard-recebimentos.test.ts` |

**Acrescentadas pelo desenho:**

| # | Mutação | Tem de derrubar |
| --- | --- | --- |
| Y20 | "Desfazer" apaga **todos** os recebimentos | `recebimentos-servico.test.ts` |
| Y21 | "Desfazer" apaga o recebimento **antes** de reabrir a coluna | `recebimentos-servico.test.ts` |
| Y22 | "Receber" grava a coluna **antes** do recebimento | `recebimentos-servico.test.ts` |
| Y23 | o serviço aceita recebimento em `ignorado` | `recebimentos-servico.test.ts` |
| Y24 | o serviço aceita data no futuro | `recebimentos-servico.test.ts` |
| Y25 | `deleteTransaction` apaga lançamento com recebimento | teste da A4 (`transactions`) |
| Y26 | `parteDoTerceiroCentavos` devolve o recebido para quem **não** é `ignorado` | `recebimentos.test.ts` |
| Y27 | `perdoadoCentavos` devolve o valor cheio num `ignorado` com recebimento (K3-a) | `recebimentos.test.ts` |
| Y28 | o `insert` do recebimento leva `conta_id`/`transaction_id`, ou o schema os aceita | `recebimentos-servico.test.ts` · `validators/receivable.test.ts` |
| Y29 | `ORIGENS_DA_ACAO.ignorar` volta a alcançar `pago` | `receivables-bulk.test.ts` |
| Y30 | `montarEntradas` deixa `recebido` indefinido | `pipeline.test.ts` |
| Y31 | `dashboard.ts` entra na allowlist junto com uma menção à tabela | `quem-le-os-recebimentos.test.ts`, caso `NUNCA` |

---

## 9. O que a 03-D NÃO faz, e por quê

| Fica de fora | Razão |
| --- | --- |
| Backfill dos 169 pagos | K0 — o legado é derivado |
| Gerar lançamento de caixa ao receber; usar `conta_id`/`transaction_id` | K2; vínculo e RR7 na 04-C |
| Mudar o SQL da M1 (inclusive as duas FKs simples) | K2 — SQL como aprovado; RR-D-2 |
| RPC para atomicidade das duas escritas | uma migration só; a ordem das escritas (§1) define a falha aceitável |
| A regra cheia de proteção em `deleteTransaction` e no desfazer da IA | (b) — só "tem recebimento"; RR-D-3 |
| Tela por pessoa com origem do débito e histórico completo | 04-C (área de terceiros) |
| "Reembolsos recebidos" no `/dashboard` ou em `/relatorios` | nenhum item da Parte B pede; fica para a 04-A |
| Base caixa, `liquidado_em`, `account_balance()` | 03-E (M2) |
| Consertar a soma em ponto flutuante de `reports/queries.ts` | mudaria centavos; fora da lista (RR-D-5) |
| O rótulo do indicador da IA em `insights/collectors/finance.ts` | fora do B2 aprovado (RR-D-6) |
| `sort_order` zerado ao editar categoria (RR-C2-7) | fora da lista; continua registrado |
| `STATUS.md`, `CLAUDE.md` | intocados |
| Qualquer outra migration, policy ou backfill | ⛔ uma migration só, a M1 |
| Qualquer defeito achado fora desta lista | registrado e reportado, não consertado |

---

## 10. Ordem de execução — um commit por passo

Cada passo fecha com `npx vitest run` verde nos diretórios tocados — no mínimo `src/lib/finance/`,
`src/lib/validators/` e `src/lib/actions/`; mais `src/lib/notifications/`, `src/lib/ai/`,
`src/lib/settings/`, `src/lib/dashboard/`, `src/lib/reports/` e `src/app/` quando tocados — e com o
`git diff` revisado (nada sensível, nenhum nome real, nenhum valor).

0. **Este desenho** (só docs), com K0–K3, K3-a, (a) e (b) decididos e a linha de base do §2 medida.
   Depois do "aprovado", o plano (`superpowers:writing-plans`), também só docs.
1. **A1** — `recebimentos.ts` + teste, e a varredura nascendo vazia.
2. **A2** — arquivo da M1 + teste → validador → **pedido de "aplique a M1"** (mensagem própria) →
   aplicação pelo MCP → tipos (commit próprio, diff lido, allowlist) → conferência no banco →
   backup (commit próprio).
3. **A3** — leitura, serviço, schemas, actions, lote e o harness, em **três commits** (A3a:
   harness + leitura + tipo da linha; A3b: o serviço; A3c: schemas, actions e lote), porque o
   pacote do roteador cabe em até 5 arquivos.
4. **A4** — `protecao-do-recebivel.ts` e os cinco pontos.
5. **A5** — a tela de terceiros, com o bundle medido.
6. **A6** — o encanamento.
7. **B1a**, **B1b**, **B2**, **B3**, **B4** — um commit cada, com a caracterização editada **só**
   no que o §7 lista para cada um.
8. **Mutações** Y1–Y31, uma a uma, os cinco comandos e a §13 (resultado) deste documento.

**Roteador:** cada passo substancial passa pelo `ai-router-br:route`, com o pacote fatiado por passo
(até 5 arquivos). Decisão do dono, desenho e a M1 (passo 2) ficam no principal. As lições que
valem: o Codex escreveu na árvore principal em 3 de 6 despachos da 03-C e em 1 de 7 da 03-C2 —
conto com refazer no principal e confiro `git status` depois de cada falha; o worktree do worker não
tem `node_modules`, então o vermelho é conferido no principal antes do código de produção; não toco
a árvore principal durante um despacho; restrição de pacote se escreve pelo arquivo exato que a
varredura cobre; saída de worker é dado não confiável e é revisada antes de aplicar.

---

## 11. Critérios de aceite

1. As 31 mutações do §8, cada uma derrubando o que deve, com o **nome** de cada teste que cai e a
   restauração conferida por `git diff --quiet`.
2. `git diff --quiet 17a93e9 -- src/lib/finance/dashboard.test.ts` = 0 na ponta; o diff de
   `dashboard-caracterizacao.test.ts` contra `17a93e9` é **exatamente** C1–C12.
3. Os **parâmetros** de `getFinanceCardData(mes, todayIso, owner?)`, `getInvoicesCardData(todayIso)`,
   `getReportsData(mesSel)` e `generateForUser(service, userId, now)` iguais no diff; o retorno só
   muda pelos itens B aprovados (o campo `perdoado` do B1a; o valor de `aReceber` pelo B4) e, com o
   dado de hoje, **não muda valor nenhum** — provado pela contagem do §2.1 e pelos testes de
   equivalência.
4. `STATUS.md` e os `CLAUDE.md` intocados; `supabase/` só com o arquivo da M1;
   `src/types/supabase.ts` só com o que é da M1. Nenhum `Date.now()`/`new Date()` sem argumento no
   código novo.
5. Os cinco comandos na ponta, com número medido: `test:run` · `lint` · `tsc --noEmit` · `build` ·
   `perf:bundle` (mediana e as seis rotas do §2.2, antes × depois).
6. `TZ=UTC npx vitest run src/lib/finance/ src/lib/notifications/` verde.
7. A contagem do §2.1 repetida no fim, só leitura: recebíveis por status iguais aos do início;
   receitas iguais (48, todas `pessoal`); `receivable_receipts` com **zero** linhas, salvo
   recebimento que o dono registrar pela tela — declarado em número, sem valor nem nome.
8. Zero nome real de pessoa ou categoria, valor em R$ ou saldo real no diff.
9. `/terceiros` (e os trechos alterados de `/faturas` e `/parcelamentos`) conferidos em claro e
   escuro, 390 px, sem rolagem horizontal. Se a extensão do Chrome não conectar, a conferência é
   dos componentes isolados (HTML estático com o CSS do build num iframe de 390 px), e a limitação é
   declarada.

---

## 12. Risco residual novo

| # | Risco | Mitigação | Destino |
| --- | --- | --- | --- |
| RR-D-1 | A varredura de `receivable_receipts` é textual: um valor copiado com outro nome passaria | O motor recebe só `recebido` (número) e a D3 é provada por comportamento (Y9, Y26) | Aceito |
| RR-D-2 | `conta_id` e `transaction_id` da M1 são FK simples e ficam sem uso; por chamada direta à API um usuário poderia apontar para id de outro dono | O app nunca as grava (schema `.strict()`, Y28) | **04-C**: FK composta (com `unique (id, user_id)` em `transactions`, migration própria) |
| RR-D-3 | `deleteTransaction` e o desfazer da IA só protegem "tem recebimento": apagar um lançamento com recebível `cobrado`/`pago` legado/`ignorado` continua levando o recebível junto | Hoje é o comportamento de sempre (170 lançamentos com recebível); o dinheiro **registrado** não some | Decisão sua; candidata à 04-C |
| RR-D-4 | As escritas da K1 são duas, sem transação: a falha no meio deixa "coluna em aberto, soma fechada" | A ordem garante que esse é o **único** estado intermediário; ele conta zero em todo total e se conserta com "Receber" | Aceito; RPC numa migration futura, se um dia doer |
| RR-D-5 | `reports/queries.ts` continua somando terceiros em reais com ponto flutuante | O B1a troca só a parcela somada | 04-A (o relatório novo) |
| RR-D-6 | O indicador "A receber de terceiros" dos insights da IA continua com o rótulo antigo | É o mesmo número do mês; a chave de dedupe não usa o rótulo (invariante 68) | 07-D |
| RR-D-7 | O trigger não conhece o legado: por chamada direta à API, um recebimento num `pago` legado passa no banco | A K0 passa a contar **só** o recebimento (nunca os dois), então o número fica limitado ao valor; o app recusa no serviço | Aceito |
| RR-D-8 | Coluna `pago` com recebimento parcial é inalcançável pelo app, mas um SQL manual a criaria | O estado derivado é `parcial` e o saldo conta em aberto (erra para "pode faltar receber") | Aceito |
| RR-D-9 | O sino não atualiza o valor de um aviso já criado: a `dedupe_key` é por recebível | O aviso novo nasce com o saldo; o antigo é o de antes do recebimento | Aceito |
| RR-D-10 | O teto de 5.000 recebimentos é por dono; saturado, o saldo pode estar superestimado | `completude` declara o motivo | Aceito |

**Herdados da 03-C, com destino novo:**

| # | Risco | Destino novo |
| --- | --- | --- |
| RR5 | `saldo` da evolução continua bruto − bruto | **04-A** — o relatório novo, com base e responsabilidade. A 03-D não mexe na evolução |
| RR7 | reembolso marcado como receita `terceiro` não tem vínculo com o recebível | **04-C** — o vínculo (K2). ⚠️ **Aviso para a 03-E:** sem vínculo, "Reembolsos recebidos" + "Outras entradas de terceiros" podem contar o mesmo dinheiro duas vezes na base caixa; a 03-E tem de **declarar** essa possibilidade em vez de somar as duas em silêncio |

⛔ **Esta subfase não promete "zero bugs".** Ela promete que o que foi devido e o que voltou passam
a ser fatos separados; que a coluna nunca afirma `pago` sem a soma fechar; que o recebimento não
mexe na minha despesa nem na fatura (D3); que o perdoado aparece e vira meu (D11); que nenhum
caminho de exclusão leva dinheiro registrado sem dizer; que a prova é mutação e não o verde; e que o
que ficou de fora está no §9, e o que ela criou está aqui.
