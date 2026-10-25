# Design — REDESIGN-03-G2: as escritas e o fechamento da REDESIGN-03

> Desenhado com o dono em **2026-10-25**, antes de qualquer linha de código. Escopo declarado em
> `docs/redesign/PLANO.md:71` (03-G2) e na §12 do desenho da 03-G
> (`2026-10-22-03g-erro-e-erro-design.md`), mais os riscos residuais que as 03-C, 03-F e 03-G
> mandaram para cá.
>
> **Base:** `af0b547`, ponta de `feat/redesign-00-auditoria`. Branch
> `feat/redesign-03g2-escritas`, sem upstream, numa worktree própria
> (`../yuri.app.pessoal-03g2`) porque a árvore principal está em uso por outra sessão.
> A `main` tem um commit a mais (`4261e03`, o merge do PR #64) com **árvore idêntica** a
> `af0b547` — `git diff af0b547 4261e03` vazio.
>
> Depois de aprovado, este documento é o contrato: quem discordar de algo aqui para e reporta.

---

## 1. O que a 03-G2 muda de natureza

- **Salvar um lançamento deixa de ser uma sequência de requisições.** Hoje, criar uma despesa
  dividida é inserir o lançamento, inserir a divisão, inserir os recebíveis e atualizar
  `valor_pessoal` — quatro idas ao banco, com uma compensação (`delete`) que ignora o próprio
  erro. Editar é pior: a divisão antiga é **apagada antes** da nova ser gravada. Depois da 03-G2,
  o lançamento e a divisão dele são gravados por **uma função do banco** (`salvar_lancamento`),
  numa transação: ou tudo, ou nada. A compra parcelada idem (`criar_compra_parcelada`).
- **A decisão vem antes de qualquer escrita, sempre.** Os valores (linha, divisão, recebíveis,
  minha parte) são calculados em TypeScript pelas funções puras de hoje; a recusa (recebível
  cobrado, valor abaixo da minha parte, tipo de parcelado) acontece **antes** da chamada. A RR6
  (gravar o lançamento e só depois recusar a divisão) deixa de ser representável.
- **Editar uma transferência deixa de ser apagar e recriar.** O lançamento é atualizado no
  lugar, com o mesmo `id` — e por isso a fatura que ele paga continua apontando para ele sem
  precisar ser religada (RR-F-1 deixa de existir em vez de ser protegido).
- **Uma escrita que falha diz o que ficou gravado.** Três formas de frase, de um helper só: nada
  gravado ("Nada foi alterado."), gravado em parte e o sistema sabe o quê, e desfecho
  desconhecido ("pode ter sido lançado — confira antes de tentar de novo").
- **Onde a ordem ainda importa, ela erra para o lado seguro.** Excluir apaga o lançamento
  **antes** de reabrir a fatura; gerar uma recorrência **reserva** a data antes de inserir;
  importar uma linha a **marca** antes de lançar. Claim-first: erra para "pode não ter
  acontecido", nunca para "duas vezes" (invariante 37).
- **Excluir em Lançamentos mostra o que sai junto, antes de confirmar** — lido do servidor pelas
  mesmas funções que a exclusão usa para decidir.
- **A REDESIGN-03 fecha contra uma matriz declarada** (§12), com o cenário do §9 num teste
  único, a conciliação card × lista × gráfico num teste, e cada item do §13.2–13.6 apontando
  para um teste ou para um destino.
- ⛔ **Nada é consertado retroativamente.** Dado inconsistente que já exista é **contado e
  reportado**, nunca apagado nem religado. Não há backfill.

---

## 2. Linha de base

### 2.1 Banco — medido em 2026-10-25, só leitura

`begin read only; set local role service_role;` — só contagens e um hash. Nenhum nome, valor ou
saldo; nada disto é colado no repositório além do que está nesta tabela.

| Medida | Valor |
| --- | --- |
| marcadores sintéticos `[03F-SINT]` / `[03G-SINT]` / `[03G2-SINT]` | 0 / 0 / 0 |
| faturas · pagas | 10 · 0 |
| lançamentos | 160 |
| transferências sem destino · órfãs (sem fatura apontando) | 0 · 0 |
| recebíveis · divisões · parcelas · contas | 111 · 100 · 20 · 5 |
| grupos de transferência com mais de uma linha | 0 |
| estornos de cartão (`receita` com `card_id`) | 0 |
| `md5` dos saldos (`md5(string_agg(id‖':'‖account_balance(id)) order by id)`) | `15d93bd1c1d3e55a40db6210dff0eb3b` |

### 2.2 Os cinco comandos — medidos em 2026-10-25, antes de tocar em nada

| Comando | Resultado |
| --- | --- |
| `npm run test:run` | **6.833** testes, 296 arquivos, todos verdes |
| `npm run lint` | 0 problemas |
| `npx tsc --noEmit` | 0 erros |
| `npm run build` | compila |
| `npm run perf:bundle` | mediana **217,8 KB** gz · 68 rotas · `/financeiro/lancamentos` **228,1 KB** · `/faturas` 208,1 · `/financeiro` 200,8 · `/dashboard/financeiro` 209,9 |

### 2.3 O inventário das escritas — medido, não estimado

Método: o varredor AST da 03-G (`src/test/inventario-de-leituras.ts`) com o filtro invertido
(escritas em vez de leituras), sobre `src/lib/finance/*.ts`, `notifications/cron.ts` e as 11
actions financeiras. Cada achado conferido à mão.

**101 escritas; 36 sem o erro tratado.** Delas, 4 falsos positivos (`generation:140`,
`recebimentos-servico:112` e `:241`, `split-persist:39` — o erro é lido por outro caminho),
1 RPC de leitura (`getDailyBalances`), 1 não financeira (`todo_reminders` no Cron), 1 já
declarada (seed, D-G24) e 1 **deliberada** (`statements.ts:44`, o insert do busca-ou-cria, cujo
erro de corrida é resolvido pela releitura). **Sobram 28 escritas reais que ignoram o erro** —
29 com a deliberada, o número da 03-G (que nunca escreveu a lista; ela está aqui):

| Arquivo | Linhas | Sequência |
| --- | --- | --- |
| `finance/generation.ts` | 154 | S9 |
| `finance/services.ts` | 263, 266 | S4 |
| `finance/split-reapply.ts` | 140, 144, 150, 176 | S5 (e S2/S3 por dentro) |
| `actions/transactions.ts` | 140, 145, 158 · 360, 372, 377 | S1 · S6 |
| `actions/installments.ts` | 147, 171, 197, 200 · 361, 405 | S7 · S8 |
| `actions/imports.ts` | 370, 468, 474, 831, 977, 983, 1010, 1149, 1154 | S10 (977, 983) e S11 (o resto) |

**As sequências não atômicas — o que fica gravado e o que o dono lê:**

| | Sequência | Se cair no meio, fica | O dono lê |
| --- | --- | --- | --- |
| S1 | editar transferência/pagamento: apaga → recria → religa | delete silencioso falho + recriação ⇒ **duas transferências**; recriação falha ⇒ fatura paga apontando para nada | "não foi possível…" ou `ok` |
| S2 | despesa → despesa: update → limpar divisão → gravar divisão → `valor_pessoal` | lançamento novo com a divisão **apagada** (RR8/RR14) ou recusa **depois** do update (RR6) | frase da divisão |
| S3 | alvo receita: limpar divisão → update | divisão apagada e lançamento antigo | erro genérico |
| S4 | criar: insert → divisão → `valor_pessoal`; compensação ignora o erro | despesa sem divisão, ou dividida com `valor_pessoal` nulo (conta como 100 % minha) | erro, e o retry **duplica** |
| S5 | `reapplySplit`: delete recebíveis → delete divisão → insert → update | cada passo do meio ignora o erro | `ok` |
| S6 | excluir: reabre a fatura → delete | fatura reaberta com o pagamento ainda lá ⇒ pagar de novo **debita duas vezes**; e `ok` mesmo com o delete falhando (RR-F-2) | `ok` |
| S7 | compra parcelada: pai → faturas → parcelas → divisão → `valor_pessoal`, três compensações sem conferir | compra-pai `parcelado` sem parcela nenhuma (não entra em fatura, mas fica na lista), ou parcelas sem a divisão | erro |
| S8 | cancelar parcelas futuras: cancela → apaga recebíveis → recalcula | parcela cancelada com o terceiro ainda devendo | `ok` |
| S9 | gerar recorrência: insert → avança `next_due_date` | o avanço falha ⇒ **o próximo render gera de novo** | nada |
| S10 | commit da importação: cria o lançamento → marca a linha `importada` | a marca falha ⇒ a linha continua `para_importar` e o próximo commit **importa de novo** | `ok` |
| S11 | escritas de controle da importação (lote, remapear, desfazer) | estado de lote divergente; nenhum dinheiro | `ok` |

---

## 3. As decisões desta sessão

### 3.1 Do dono (2026-10-25, uma de cada vez)

| | Decisão | Resposta |
| --- | --- | --- |
| **K1** | **Atomicidade, item a item.** S2/S3/S4/S5 por RPC `salvar_lancamento` (insere ou atualiza o lançamento e substitui a divisão numa transação; o SQL recusa apagar recebível protegido; todos os valores calculados em TS; a decisão da divisão antes de qualquer escrita fecha a RR6). S1 atualiza no lugar (0 grupos de duas linhas), o que elimina o religar. S7 por RPC `criar_compra_parcelada`. S6 ordenada: apaga primeiro, reabre depois, as duas conferidas. S8 apaga os recebíveis antes de cancelar. S9 claim-first: avança `next_due_date` antes do insert, devolve se o insert falhar, declara por `interrompida`. S10 claim-first: marca a linha `erro` com o motivo "A importação desta linha foi interrompida e ela pode ter sido lançada. Confira em Lançamentos antes de marcar para importar de novo." e só depois `importada`. S11 confere e para. Uma migration, duas funções, "aplique" separado. | "Aprovado" |
| **K2** | **O que uma escrita com erro diz.** Três formas, de um helper só (`falhaDeEscrita`): nada gravado ("… Nada foi alterado.", sem `revalidatePath`); gravado em parte e conhecido ("O lançamento foi excluído, mas a fatura não foi reaberta. Reabra-a em Faturas.", com `revalidatePath`); desfecho desconhecido ("… pode ter sido lançado. Confira em Lançamentos antes de tentar de novo.", com `revalidatePath`). Ação de um lançamento para na primeira falha. Recorrências: falha na reserva interrompe (`interrompida: true`). Importação: falha ao criar uma linha segue para a próxima, com a frase da action como motivo (RR-G-10); falha na escrita que marca a linha **para o commit**, com frase de lote dizendo quantas foram processadas. S11 confere e para. | "Aprovado" |
| **K3** | **RR-F-6.** A confirmação **já existe** (`DeleteConfirmDialog`, texto genérico); o que falta é a previsão. O diálogo, ao abrir, chama `preverExclusaoDoLancamento(id)` — que usa `statementPaidBy` e `protecaoDosRecebiveis`, as mesmas da exclusão — e mostra em linhas curtas: fatura que será reaberta, recebíveis pendentes que saem junto (com as pessoas), vínculo com importação. Botão travado até a leitura voltar; falha ⇒ "Não foi possível conferir o que sai junto" e botão travado; bloqueio ⇒ o motivo, sem botão. O servidor reconfere tudo. | "Aprovado!" (e: "Não precisa me apresentar o plano.") |
| **K4** | **RR11 aqui ou na 05.** | "Faz como achar melhor" — **decisão minha, D-G2-1** |
| **K5** | **O fechamento.** Teste novo e puro do §9 (fixture 1000/400/600/250, as 8 exigências nas funções reais); teste novo de conciliação card × lista × gráfico com a mesma fixture e o mesmo filtro (divergência é registrada, não consertada); itens sem destino: os que existem ganham teste, os que não existem vão para a REDESIGN-05 declarados abertos; os testes de caracterização alterados entram na matriz commit a commit, com o `it` removido em `d574dc7` lido e descrito — critério "cumprido com exceções declaradas"; a lista se chama "matriz de fechamento da 03-G2", **nunca** "a do briefing"; REDESIGN-03 fecha com pendências declaradas e destino, registro no §13 deste desenho, STATUS intocado. | "Aprovo" |

⚠️ **"Não precisa me apresentar o plano"** foi lido assim: spec e plano são escritos, passam pela
revisão de subagente, entram num commit só de docs e a execução segue **sem** parar por um novo
"aprovado". O **"aplique"** da migration continua sendo pedido numa mensagem só para isso.

### 3.2 Do desenho (decisões minhas, para o dono conferir na leitura)

| | Decisão |
| --- | --- |
| **D-G2-1** | **RR11 entra aqui** (K4 delegada). Editar uma receita com `card_id` que continua receita **preserva** `card_id` **e** `statement_id` e força `account_id`/`payment_method` nulos — o estorno não muda de fatura ao ser editado, nem mesmo mudando a data (re-resolver pela data mandaria para outra fatura um estorno importado com competência forçada). Trocar o estorno de cartão não é oferecido; virar despesa segue o caminho normal. |
| **D-G2-2** | **A fatura é resolvida ANTES da RPC.** `resolveOrCreateStatement`/`getOrCreateStatementByFatura` podem criar uma fatura vazia; se a RPC falhar depois, a fatura vazia fica. Não é dinheiro (nenhum lançamento, nenhum total) e já acontece hoje. Declarado, não tratado. |
| **D-G2-3** | **Uma função escreve divisão.** `criar_compra_parcelada` chama `salvar_lancamento(v_pai, null, p_divisao)` por dentro. O recebível de parcela chega com `parcela_numero` e o SQL resolve o `installment_id` pela parcela do mesmo pai — vale para a criação e para `updateInstallmentSplit`. |
| **D-G2-4** | **A proteção mora nos dois lados.** O TS decide e escreve a frase (`motivoParaNaoApagar`, como hoje); o SQL **reconfere** dentro da transação, com `for update` nos recebíveis, e recusa com `DIVISAO_PROTEGIDA` — fecha a janela entre ler a proteção e apagar. O alcance (`regra-cheia` · `so-dinheiro-registrado`) vem no payload; a lista `cobrado/pago/ignorado` é espelhada por teste contra `STATUS_PROTEGIDOS`. |
| **D-G2-5** | **Atualização parcial por presença de chave.** No update, a RPC só escreve a coluna cuja chave está em `p_lancamento` (`p ? 'col'`). `updateTransaction` manda a linha inteira; `updateInstallmentSplit` manda só `classificacao`/`valor_pessoal`. As colunas de parcelado (`parcelado`, `qtd_parcelas`, `valor_total`) **não estão** na lista de `salvar_lancamento` — só `criar_compra_parcelada` as escreve. |
| **D-G2-6** | **Guarda de forma no SQL (D-F7):** `salvar_lancamento` recusa mudar o `type` de um lançamento `parcelado` (`PARCELADO_NAO_MUDA_DE_TIPO`, RR12 — o TS recusa antes, com frase). (Uma guarda contra transferência de duas linhas foi retirada na revisão: o índice único `transactions_transfer_group_unique`, `20260720030000…sql:29`, já torna esse estado impossível.) `criar_compra_parcelada` exige `despesa` + `cartao_credito` + `card_id` + `statement_id` nulo + ao menos uma parcela. |
| **D-G2-7** | **Toda referência que a FK não confere é conferida pela RLS** (D-F12): conta, conta destino, cartão, fatura, categoria, subcategoria e pessoa precisam ser visíveis ao chamador sob `security invoker`. A função não dá privilégio novo — é o mesmo insert que o PostgREST aceitava —, mas a conferência é barata e fecha o vetor. Erro: `LANCAMENTO_REFERENCIA_INVALIDA`. |
| **D-G2-8** | **A linha do lançamento é montada num lugar só** (`montarLinhaDoLancamento`, puro), usado por `criarTransacao` e por `updateTransaction` — a versão que cada um tinha divergiria no primeiro campo novo. A divisão idem (`montarDivisaoAVista` / `montarDivisaoParcelada`, puros, em `split-persist.ts`, que deixa de persistir). `reapplySplit` vira `planejarReaplicacao`: lê, decide e devolve o payload; não escreve. |
| **D-G2-9** | **S8 fica ordenada e não vai para a RPC** (a ordem é a da K1). Ordem: apaga os recebíveis pendentes das parcelas → cancela as parcelas → recalcula `valor_pessoal`. ⚠️ *(Corrigido na revisão de desenho.)* Cair entre o 1º e o 2º passo **não** "erra para meu": o `valor_pessoal` do pai continua descontando a parte do terceiro, e o terceiro já não deve nada — a parte dele naquelas parcelas fica sem dono até o dono repetir o cancelamento, que conserta (as parcelas continuam ativas e o cancelamento é idempotente). A ordem continua a melhor das duas: a inversa deixaria o terceiro devendo por parcela que não existe, que é cobrança indevida. Cada passo conferido, frase de K2 dizendo onde parou e mandando repetir. |
| **D-G2-10** | **A reserva de S9 é condicional** (`… where id = $1 and next_due_date = $antigo and is_active = true`): duas gerações ao mesmo tempo (duas abas) — a segunda afeta 0 linhas e pula. ⚠️ *(Corrigido na revisão de desenho.)* Na última geração `newNextDueDate` é nulo e só `is_active` muda (`recurrence.ts:165`): por isso `is_active = true` entra na condição, e a **devolução** depois de um insert falho filtra pelo `last_generated_at` que a própria reserva gravou (um instante único por reserva) e restaura `next_due_date`, `is_active = true` e o `last_generated_at` anterior — filtrar por `next_due_date = novo` nunca casaria quando ele é nulo, e as últimas ocorrências sumiriam em silêncio (o catch-up só lê `is_active = true`). O instante é o `new Date().toISOString()` que a linha **já** usa hoje, calculado uma vez por recorrência. |
| **D-G2-11** | **A reserva de S10 é condicional** (`status = 'para_importar'`): dois commits do mesmo lote ao mesmo tempo não importam a mesma linha duas vezes — o segundo vê 0 linhas e pula. |
| **D-G2-12** | **Os testes de INVENTÁRIO são atualizados por desenho** (`quem-escreve-transactions`, `quem-apaga-recebiveis`, `leituras-que-engolem-erro`): eles existem para ficar vermelhos até alguém declarar a mudança. Os testes de **comportamento** que mudarem (porque afirmavam a sequência de requisições que deixa de existir) entram no §13 um a um, com o motivo — mesma régua da K5 (4). |
| **D-G2-14** | *(Revisão de desenho.)* **Sair de receita ou virar transferência zera `classificacao`/`valor_pessoal`.** Hoje o update grava `{pessoal, null}` ao sair de receita (`transactions.ts:231-236`) e a recriação da transferência caía no default. Com o plano da divisão em "nada", as duas chaves ficariam fora do payload e a RPC manteria a receita de terceiro como despesa `terceiro`. Regra: o plano "substituir" manda as colunas dele; senão, alvo transferência **ou** origem receita ⇒ `{ classificacao: "pessoal", valor_pessoal: null }`; senão (despesa → despesa sem mudança de divisão) as duas ficam fora. |
| **D-G2-15** | *(Revisão de desenho.)* **A linha é montada por tipo-alvo.** `montarLinhaDoLancamento` ramifica: **transferência** força `payment_method: "transferencia"`, categoria/subcategoria/cartão/fatura nulos (o que `criarTransacao` força hoje, `services.ts:136-157`) — e `criarTransacao` passa a usá-lo também no ramo de transferência; **estorno de cartão** (D-G2-1) força `payment_method` e `account_id` nulos e preserva cartão/fatura; **despesa/receita** como hoje. |
| **D-G2-16** | *(Revisão de desenho.)* **"Nada foi alterado" só quando o banco respondeu.** Atomicidade não cobre resposta perdida. `traduzirErroDaRpc`: erro com `code` SQLSTATE (5 caracteres — inclui `P0001` e as violações de CHECK/FK, todas com a transação revertida) ⇒ nada gravado; erro sem `code` (fetch falho, timeout) ⇒ `desfechoDesconhecido` ("… pode ter sido salvo. Confira em Lançamentos antes de tentar de novo."). Vale para as duas RPCs. |
| **D-G2-17** | *(Revisão de desenho.)* **A previsão mostra tudo o que a exclusão apaga**, não só o pendente: a exclusão usa o alcance `so-dinheiro-registrado`, então recebíveis `cobrado`/`pago`/`ignorado` sem recebimento também saem por cascade. A previsão agrupa por pessoa **com o status**, e diz quantas **parcelas** saem das faturas quando o lançamento é a compra-pai parcelada (o diálogo aparece para ela hoje). |
| **D-G2-18** | *(Revisão de desenho.)* **`p_id` vai por último, com `default null`**, porque o gerador tipa argumento sem default como obrigatório e não nulo — `rpc(…, { p_id: null })` não compilaria. A assinatura fica `salvar_lancamento(p_lancamento jsonb, p_divisao jsonb, p_id uuid default null)`. |
| **D-G2-19** | *(Revisão de desenho.)* **O formulário, ao editar um estorno, manda o `card_id` do lançamento e não pede conta** — senão o schema exige uma conta (`validators/transaction.ts:58-63`) que o servidor descartaria em silêncio (D-G2-1). Na tela: no lugar de conta e meio de pagamento, "Estorno no cartão — continua na fatura em que foi lançado.". `transaction-form.tsx` entra no E3. |
| **D-G2-20** | *(Revisão de desenho.)* **A compra-pai tem builder próprio** (`montarCompraPai`, em `linha-do-lancamento.ts`), com as colunas de parcelado; `COLUNAS_DA_COMPRA_PAI` é espelhada pelo teste da migration como `COLUNAS_DA_LINHA`. Os dois builders **sempre** mandam as chaves NOT NULL sem default útil (`type`, `amount`, `purchase_date`, `competence_date`, `status`) — há teste. |
| **D-G2-21** | *(Revisão de desenho.)* **O SQL confere também o `person_id` dos recebíveis e exige parcela `ativa`** no `parcela_numero`; e o harness de teste passa a devolver as linhas em `delete().select()` (hoje devolve `null`), porque o "0 linhas ⇒ já sumiu" do E5 depende disso. |
| **D-G2-13** | **O varredor de escritas é uma função nova no mesmo arquivo** (`inventariarEscritas`, em `src/test/inventario-de-leituras.ts`), com as RPCs de escrita numa allowlist (`salvar_lancamento`, `criar_compra_parcelada`, `pagar_fatura`, `desfazer_pagamento_fatura`). O teste novo fixa a contagem e as exceções declaradas (`statements.ts:44` deliberada; o seed D-G24; `todo_reminders`, fora do financeiro). |

---

## 4. O mapa

| Passo | Fecha | Arquivos | Migration |
| --- | --- | --- | --- |
| **E1** núcleo puro | — (prepara D-G2-8) | `finance/linha-do-lancamento.ts` (novo), `finance/split-persist.ts`, `actions/helpers.ts` (`falhaDeEscrita`) | — |
| **E2** a migration | K1 | `supabase/migrations/20261025120000_salvar_lancamento_atomico.sql`, `finance/m-g2-salvar-lancamento.test.ts` | **sim** ("aplique") |
| **E3** salvar | S2, S3, S4, S5, S1, RR6, RR8/RR14, RR12, RR11, RR-F-1 | `finance/services.ts`, `actions/transactions.ts`, `finance/split-reapply.ts`, `actions/installments.ts` (`updateInstallmentSplit`), `components/financeiro/transaction-form.tsx` (D-G2-19) | — |
| **E4** parcelado | S7, S8 | `actions/installments.ts` | — |
| **E5** excluir | S6, RR-F-2, RR-F-6 | `actions/transactions.ts`, `components/financeiro/delete-confirm-dialog.tsx`, `financeiro/lancamentos/transactions-client.tsx`, `finance/previsao-da-exclusao.ts` (novo, puro) | — |
| **E6** recorrências | S9 | `finance/generation.ts` | — |
| **E7** importação | S10, S11, RR-G-8, RR-G-10 | `actions/imports.ts` | — |
| **E8** a varredura | RR-G-4 | `src/test/inventario-de-leituras.ts`, `finance/escritas-que-engolem-erro.test.ts` (novo) | — |
| **E9** o fechamento | K5, D32 | `finance/fechamento-redesign-03.test.ts` (novo), `finance/conciliacao-card-lista-grafico.test.ts` (novo), §12–13 deste desenho | — |

---

## 5. A forma de cada item

### 5.1 E1 · O núcleo puro

- `montarLinhaDoLancamento(d, { cardId, statementId, colunasDaReceita, classificacao, valorPessoal, transferGroupId })`
  devolve o objeto de colunas de `transactions` (as mesmas que `criarTransacao` e o update
  escrevem hoje, incluindo `liquidado_em` por `dataDeLiquidacaoAGravar`). Sem `user_id` (vem da
  sessão, no SQL) e sem as colunas de parcelado.
- `montarDivisaoAVista({ totalCentavos, parts, statementId, cardId, dataPrevista, alcance })` e
  `montarDivisaoParcelada({ totalCentavos, parts, parcelas: [{ numero, statementId, cardId, valorCentavos }], alcance })`
  devolvem `{ ok: true, divisao: { alcance, pessoas[], recebiveis[] }, minhaParteCentavos } | { ok: false, error }`
  — a mesma matemática de `applySplit`/`applySplitParcelado` (`dividirDespesa`,
  `toPartesDivisao`, `distribuirTerceirosPorParcela`, sem recebível de R$ 0), sem I/O.
  `divisaoVazia(alcance)` é o "limpar".
- `falhaDeEscrita` em `actions/helpers.ts`, com as três formas da K2:
  `nadaGravado(oQue)` → `"Não foi possível ${oQue}. Nada foi alterado."`;
  `gravadoEmParte(feito, naoFeito, oQueFazer)`;
  `desfechoDesconhecido(oQue, onde)` → `"… pode ter ${oQue}. Confira em ${onde} antes de tentar de novo."`.
  Devolvem `ActionResult` de erro; quem chama decide o `revalidatePath` pela forma (§3.1 K2).
- `traduzirErroDaRpc(error, oQue)` (D-G2-16): erro com `code` SQLSTATE ⇒ frase do código
  (`DIVISAO_PROTEGIDA`, `PARCELADO_NAO_MUDA_DE_TIPO`, …) terminando em "Nada foi alterado.";
  erro sem `code` ⇒ `desfechoDesconhecido`. A mensagem do banco nunca vai para a tela.

### 5.2 E2 · A migration (SQL no desenho, aplicada só com "aplique")

`supabase/migrations/20261025120000_salvar_lancamento_atomico.sql` — aditiva: duas funções.
Nenhuma tabela, coluna, policy, índice ou dado.

```sql
-- REDESIGN-03-G2 · M-G2 (K1) — salvar um lançamento e a divisão dele vira UMA transação; criar
-- uma compra parcelada também.
--
-- Até aqui, criar uma despesa dividida eram quatro requisições (lançamento, divisão, recebíveis,
-- valor_pessoal) com uma compensação que ignorava o próprio erro; editar apagava a divisão
-- ANTES de gravar a nova (RR8/RR14). Nenhuma ordem de requisições fecha essas janelas — só uma
-- transação fecha.
--
-- Os VALORES chegam prontos de TS (montarLinhaDoLancamento, montarDivisaoAVista,
-- montarDivisaoParcelada): aqui só se confere a forma, se ORDENA e se torna ATÔMICO. As colunas
-- listadas são espelhadas por teste (src/lib/finance/m-g2-salvar-lancamento.test.ts).
--
-- Reversão (primeiro reverter o app, que passa a chamar estas funções; depois):
--   drop function if exists public.criar_compra_parcelada(jsonb, jsonb, jsonb);
--   drop function if exists public.salvar_lancamento(jsonb, jsonb, uuid);

-- p_id por último e com default (D-G2-18): o gerador de tipos o declara opcional, e criar é
-- simplesmente não mandá-lo.
create or replace function public.salvar_lancamento(
  p_lancamento jsonb,
  p_divisao jsonb,
  p_id uuid default null
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_id uuid := p_id;
  v_atual public.transactions%rowtype;
  v_alcance text;
begin
  -- Sem sessão é a primeira recusa: nada do payload é lido antes.
  if v_user is null then
    raise exception 'LANCAMENTO_SEM_SESSAO' using errcode = 'P0001';
  end if;
  if (p_id is null and p_lancamento is null) or (p_lancamento is null and p_divisao is null) then
    raise exception 'LANCAMENTO_INVALIDO' using errcode = 'P0001';
  end if;

  -- D-G2-7: toda referência que a FK não confere precisa ser visível pela RLS do chamador.
  if p_lancamento is not null and (
       ((p_lancamento ->> 'account_id') is not null
         and not exists (select 1 from public.accounts where id = (p_lancamento ->> 'account_id')::uuid))
    or ((p_lancamento ->> 'transfer_account_id') is not null
         and not exists (select 1 from public.accounts where id = (p_lancamento ->> 'transfer_account_id')::uuid))
    or ((p_lancamento ->> 'card_id') is not null
         and not exists (select 1 from public.credit_cards where id = (p_lancamento ->> 'card_id')::uuid))
    or ((p_lancamento ->> 'statement_id') is not null
         and not exists (select 1 from public.card_statements where id = (p_lancamento ->> 'statement_id')::uuid))
    or ((p_lancamento ->> 'category_id') is not null
         and not exists (select 1 from public.categories where id = (p_lancamento ->> 'category_id')::uuid))
    or ((p_lancamento ->> 'subcategory_id') is not null
         and not exists (select 1 from public.subcategories where id = (p_lancamento ->> 'subcategory_id')::uuid))
  ) then
    raise exception 'LANCAMENTO_REFERENCIA_INVALIDA' using errcode = 'P0001';
  end if;

  if p_id is null then
    insert into public.transactions (
      user_id, type, payment_method, account_id, transfer_account_id, transfer_group_id,
      card_id, statement_id, category_id, subcategory_id, amount, purchase_date,
      competence_date, description, notes, tags, status, liquidado_em, classificacao,
      valor_pessoal
    )
    select v_user, r.type, r.payment_method, r.account_id, r.transfer_account_id,
           r.transfer_group_id, r.card_id, r.statement_id, r.category_id, r.subcategory_id,
           r.amount, r.purchase_date, r.competence_date, r.description, r.notes,
           coalesce(r.tags, '{}'), r.status, r.liquidado_em, coalesce(r.classificacao, 'pessoal'),
           r.valor_pessoal
      from jsonb_populate_record(null::public.transactions, p_lancamento) r
    returning id into v_id;
  else
    select * into v_atual from public.transactions where id = p_id for update;
    if not found then
      raise exception 'LANCAMENTO_NAO_ENCONTRADO' using errcode = 'P0001';
    end if;
    -- D-G2-6 (RR12): compra parcelada não muda de tipo por aqui.
    if v_atual.parcelado and p_lancamento ? 'type'
       and (p_lancamento ->> 'type') is distinct from v_atual.type then
      raise exception 'PARCELADO_NAO_MUDA_DE_TIPO' using errcode = 'P0001';
    end if;

    if p_lancamento is not null then
      -- D-G2-5: só a coluna cuja chave veio no payload é escrita.
      update public.transactions t set
        type                = case when p_lancamento ? 'type' then r.type else t.type end,
        payment_method      = case when p_lancamento ? 'payment_method' then r.payment_method else t.payment_method end,
        account_id          = case when p_lancamento ? 'account_id' then r.account_id else t.account_id end,
        transfer_account_id = case when p_lancamento ? 'transfer_account_id' then r.transfer_account_id else t.transfer_account_id end,
        transfer_group_id   = case when p_lancamento ? 'transfer_group_id' then r.transfer_group_id else t.transfer_group_id end,
        card_id             = case when p_lancamento ? 'card_id' then r.card_id else t.card_id end,
        statement_id        = case when p_lancamento ? 'statement_id' then r.statement_id else t.statement_id end,
        category_id         = case when p_lancamento ? 'category_id' then r.category_id else t.category_id end,
        subcategory_id      = case when p_lancamento ? 'subcategory_id' then r.subcategory_id else t.subcategory_id end,
        amount              = case when p_lancamento ? 'amount' then r.amount else t.amount end,
        purchase_date       = case when p_lancamento ? 'purchase_date' then r.purchase_date else t.purchase_date end,
        competence_date     = case when p_lancamento ? 'competence_date' then r.competence_date else t.competence_date end,
        description         = case when p_lancamento ? 'description' then r.description else t.description end,
        notes               = case when p_lancamento ? 'notes' then r.notes else t.notes end,
        tags                = case when p_lancamento ? 'tags' then coalesce(r.tags, '{}') else t.tags end,
        status              = case when p_lancamento ? 'status' then r.status else t.status end,
        liquidado_em        = case when p_lancamento ? 'liquidado_em' then r.liquidado_em else t.liquidado_em end,
        classificacao       = case when p_lancamento ? 'classificacao' then r.classificacao else t.classificacao end,
        valor_pessoal       = case when p_lancamento ? 'valor_pessoal' then r.valor_pessoal else t.valor_pessoal end
        from jsonb_populate_record(null::public.transactions, p_lancamento) r
       where t.id = p_id;
    end if;
  end if;

  if p_divisao is not null then
    v_alcance := p_divisao ->> 'alcance';
    if v_alcance is null or v_alcance not in ('regra-cheia', 'so-dinheiro-registrado') then
      raise exception 'DIVISAO_INVALIDA' using errcode = 'P0001';
    end if;
    if exists (
      select 1 from jsonb_to_recordset(coalesce(p_divisao -> 'pessoas', '[]')) x(person_id uuid)
       where not exists (select 1 from public.people p where p.id = x.person_id)
    ) or exists (
      select 1 from jsonb_to_recordset(coalesce(p_divisao -> 'recebiveis', '[]')) x(person_id uuid, statement_id uuid, card_id uuid)
       where not exists (select 1 from public.people p where p.id = x.person_id)
          or (x.statement_id is not null and not exists (select 1 from public.card_statements s where s.id = x.statement_id))
          or (x.card_id is not null and not exists (select 1 from public.credit_cards c where c.id = x.card_id))
    ) then
      raise exception 'LANCAMENTO_REFERENCIA_INVALIDA' using errcode = 'P0001';
    end if;

    -- D-G2-4: trava os recebíveis da divisão atual e reconfere a proteção DENTRO da transação.
    perform 1 from public.receivables rc
      where rc.transaction_id = v_id
         or rc.shared_expense_id in (select id from public.shared_expenses where transaction_id = v_id)
      for update;
    if exists (
      select 1 from public.receivables rc
       where (rc.transaction_id = v_id
              or rc.shared_expense_id in (select id from public.shared_expenses where transaction_id = v_id))
         and (exists (select 1 from public.receivable_receipts rr where rr.receivable_id = rc.id)
              or (v_alcance = 'regra-cheia' and rc.status in ('cobrado', 'pago', 'ignorado')))
    ) then
      raise exception 'DIVISAO_PROTEGIDA' using errcode = 'P0001';
    end if;

    -- Substitui: recebíveis primeiro (pela FK), depois a divisão.
    delete from public.receivables rc
     where rc.transaction_id = v_id
        or rc.shared_expense_id in (select id from public.shared_expenses where transaction_id = v_id);
    delete from public.shared_expenses where transaction_id = v_id;

    insert into public.shared_expenses (user_id, transaction_id, person_id, tipo_divisao, percentual, valor)
    select v_user, v_id, x.person_id, x.tipo_divisao, x.percentual, x.valor
      from jsonb_to_recordset(coalesce(p_divisao -> 'pessoas', '[]'))
           x(person_id uuid, tipo_divisao text, percentual numeric, valor numeric);

    -- D-G2-3: parcela_numero resolve o installment_id pela parcela ATIVA do MESMO pai.
    if exists (
      select 1 from jsonb_to_recordset(coalesce(p_divisao -> 'recebiveis', '[]')) x(parcela_numero int)
       where x.parcela_numero is not null
         and not exists (select 1 from public.transaction_installments i
                          where i.parent_transaction_id = v_id and i.numero = x.parcela_numero
                            and i.status = 'ativa')
    ) then
      raise exception 'DIVISAO_INVALIDA' using errcode = 'P0001';
    end if;
    insert into public.receivables (
      user_id, person_id, transaction_id, shared_expense_id, installment_id, statement_id,
      card_id, valor, status, data_prevista
    )
    select v_user, x.person_id, v_id,
           (select s.id from public.shared_expenses s where s.transaction_id = v_id and s.person_id = x.person_id),
           (select i.id from public.transaction_installments i
             where i.parent_transaction_id = v_id and i.numero = x.parcela_numero),
           x.statement_id, x.card_id, x.valor, 'pendente', x.data_prevista
      from jsonb_to_recordset(coalesce(p_divisao -> 'recebiveis', '[]'))
           x(person_id uuid, parcela_numero int, statement_id uuid, card_id uuid, valor numeric, data_prevista date);
  end if;

  return v_id;
end;
$$;

create or replace function public.criar_compra_parcelada(
  p_pai jsonb,
  p_parcelas jsonb,
  p_divisao jsonb
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_pai uuid;
begin
  if v_user is null then
    raise exception 'LANCAMENTO_SEM_SESSAO' using errcode = 'P0001';
  end if;
  -- D-G2-6: a forma da compra-pai.
  if (p_pai ->> 'type') is distinct from 'despesa'
     or (p_pai ->> 'payment_method') is distinct from 'cartao_credito'
     or (p_pai ->> 'card_id') is null
     or (p_pai ->> 'statement_id') is not null
     or jsonb_typeof(p_parcelas) is distinct from 'array'
     or jsonb_array_length(p_parcelas) < 1 then
    raise exception 'PARCELADO_INVALIDO' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.credit_cards where id = (p_pai ->> 'card_id')::uuid)
     or ((p_pai ->> 'category_id') is not null
         and not exists (select 1 from public.categories where id = (p_pai ->> 'category_id')::uuid))
     or ((p_pai ->> 'subcategory_id') is not null
         and not exists (select 1 from public.subcategories where id = (p_pai ->> 'subcategory_id')::uuid))
     or exists (
       select 1 from jsonb_to_recordset(p_parcelas) x(statement_id uuid)
        where not exists (select 1 from public.card_statements s where s.id = x.statement_id)
     ) then
    raise exception 'LANCAMENTO_REFERENCIA_INVALIDA' using errcode = 'P0001';
  end if;

  insert into public.transactions (
    user_id, type, payment_method, account_id, transfer_account_id, card_id, statement_id,
    category_id, subcategory_id, amount, purchase_date, competence_date, description, notes,
    status, parcelado, qtd_parcelas, valor_total, classificacao, valor_pessoal
  )
  select v_user, r.type, r.payment_method, null, null, r.card_id, null,
         r.category_id, r.subcategory_id, r.amount, r.purchase_date, r.competence_date,
         r.description, r.notes, r.status, true, r.qtd_parcelas, r.valor_total,
         coalesce(r.classificacao, 'pessoal'), r.valor_pessoal
    from jsonb_populate_record(null::public.transactions, p_pai) r
  returning id into v_pai;

  insert into public.transaction_installments (
    user_id, parent_transaction_id, card_id, statement_id, numero, total_parcelas, valor,
    data_competencia, status
  )
  select v_user, v_pai, (p_pai ->> 'card_id')::uuid, x.statement_id, x.numero, x.total_parcelas,
         x.valor, x.data_competencia, 'ativa'
    from jsonb_to_recordset(p_parcelas)
         x(numero smallint, total_parcelas smallint, valor numeric, statement_id uuid, data_competencia date);

  -- D-G2-3: a divisão entra pela MESMA função que a grava em qualquer outro lugar.
  if p_divisao is not null then
    perform public.salvar_lancamento(null, p_divisao, v_pai);
  end if;

  return v_pai;
end;
$$;

revoke all on function public.salvar_lancamento(jsonb, jsonb, uuid) from public;
revoke all on function public.salvar_lancamento(jsonb, jsonb, uuid) from anon;
grant execute on function public.salvar_lancamento(jsonb, jsonb, uuid) to authenticated;
revoke all on function public.criar_compra_parcelada(jsonb, jsonb, jsonb) from public;
revoke all on function public.criar_compra_parcelada(jsonb, jsonb, jsonb) from anon;
grant execute on function public.criar_compra_parcelada(jsonb, jsonb, jsonb) to authenticated;

comment on function public.salvar_lancamento(jsonb, jsonb, uuid) is
  'REDESIGN-03-G2: cria (p_id ausente) ou atualiza um lançamento e, se p_divisao vier, substitui a divisão (shared_expenses + receivables) na MESMA transação. Valores montados pelo chamador; security invoker, então a RLS é a de um insert direto pelo PostgREST: nenhum privilégio novo. user_id vem de auth.uid(). Erros: LANCAMENTO_SEM_SESSAO, LANCAMENTO_INVALIDO, LANCAMENTO_REFERENCIA_INVALIDA, LANCAMENTO_NAO_ENCONTRADO, PARCELADO_NAO_MUDA_DE_TIPO, DIVISAO_INVALIDA, DIVISAO_PROTEGIDA.';
comment on function public.criar_compra_parcelada(jsonb, jsonb, jsonb) is
  'REDESIGN-03-G2: cria a compra-pai parcelada, as parcelas e (por salvar_lancamento) a divisão numa transação. Erros: LANCAMENTO_SEM_SESSAO, PARCELADO_INVALIDO, LANCAMENTO_REFERENCIA_INVALIDA e os de salvar_lancamento.';
```

O teste da migration (padrão `m-f-pagamento-fatura.test.ts`, varredura do SQL sem comentários):
`security invoker` e `search_path = ''` nas duas; `auth.uid()` antes de qualquer `p_*`; as
listas de colunas do insert/update batem com as chaves de `montarLinhaDoLancamento`; o update
tem um `case when p_lancamento ? '<col>'` para cada coluna da lista; `cobrado/pago/ignorado` no
SQL = `STATUS_PROTEGIDOS`; a ordem "proteção → delete recebíveis → delete divisão → insert"; o
`for update` antes do `exists` da proteção; `revoke … from anon` e `grant … to authenticated`;
nenhum `security definer`, nenhum `create policy`, nenhum `alter table`.

### 5.3 E3 · Salvar (criar, editar, editar a divisão)

**`criarTransacao`** (S4): transferência continua um insert só (atômico por si, agora conferido);
o resto: receita decide → fatura resolvida (D-G2-2) → `splitSchema` → `montarDivisaoAVista` (se
compartilhada) → `montarLinhaDoLancamento` com `classificacao` e `valor_pessoal` já calculados →
**uma** chamada `rpc("salvar_lancamento", { p_lancamento, p_divisao })`. Erro ⇒
`traduzirErroDaRpc` ("Nada foi alterado."). Sem compensação: não há o que compensar.

**`updateTransaction`** — um caminho só, com o ramo de transferência absorvido:
1. data futura (como hoje) → carrega `existing` (`id, type, transfer_group_id, parcelado,
   classificacao, amount, card_id, statement_id, payment_method`);
2. **RR12:** `existing.parcelado` e `d.type !== existing.type` ⇒ `invalid` ("Compra parcelada
   muda em Parcelamentos.") antes de qualquer escrita;
3. receita decide (como hoje);
4. **RR11 (D-G2-1):** `existing.type === "receita" && existing.card_id && d.type === "receita"` ⇒
   `cardId = existing.card_id`, `statementId = existing.statement_id`, `account_id = null`,
   `payment_method = null`; senão, despesa de cartão resolve a fatura (como hoje, D-G2-2);
5. **a divisão é planejada antes de qualquer escrita** (`planejarReaplicacao`, só leitura):
   - alvo **transferência** vindo de não-transferência: `divisaoVazia("so-dinheiro-registrado")`
     com a recusa de `motivoParaNaoApagar(…, "so-dinheiro-registrado", "transformar o lançamento
     em transferência")` (RR-D-17, igual a hoje);
   - alvo **receita** (não parcelado): o "limpar" de hoje, regra cheia;
   - **despesa** (não parcelada): a reaplicação de hoje (`decidirReaplicacao`);
   - parcelado: divisão intocada (`p_divisao = null`), como hoje;
   - `bloqueado` ⇒ `dbError(motivo)` **sem ter escrito nada** (fecha RR6).
6. `montarLinhaDoLancamento`, ramificado por tipo-alvo (D-G2-15; transferência: `transfer_account_id`
   do form e `transfer_group_id` existente ou `randomUUID()` novo; deixando de ser transferência:
   os dois nulos) com `classificacao`/`valor_pessoal` pela regra da D-G2-14;
7. **uma** chamada `rpc("salvar_lancamento", { p_id: id, p_lancamento, p_divisao })`.

Some: o `delete` por grupo/id, a recriação e o religar de `pago_transacao_id` (S1, RR-F-1) — o
`id` é o mesmo, e a fatura continua apontando para ele.

**`planejarReaplicacao`** (era `reapplySplit`): as leituras de hoje (divisão atual, proteção,
ambas tratadas desde a 03-G) e `decidirReaplicacao`; devolve
`{ acao: "nada" } | { acao: "bloqueado", motivo } | { acao: "substituir", divisao, colunas: { classificacao, valor_pessoal } }`.
**Não escreve.** `updateInstallmentSplit` chama o plano e, se "substituir",
`rpc("salvar_lancamento", { p_id: pai, p_lancamento: colunas, p_divisao })`.

### 5.4 E4 · A compra parcelada

**`createInstallmentPurchase`** (S7): cartão lido → `planejarParcelamento` → **as faturas de todas
as parcelas resolvidas antes** (D-G2-2; falha ⇒ "Nada foi alterado.", porque nenhum lançamento
foi gravado) → `montarDivisaoParcelada` (parcelas por `numero`) → **uma** chamada
`rpc("criar_compra_parcelada", { p_pai, p_parcelas, p_divisao })`. As três compensações somem.

**`cancelInstallmentFuture`** (S8, D-G2-9): apaga os recebíveis pendentes das parcelas (conferido;
falha ⇒ "Nada foi alterado.") → cancela as parcelas (conferido; falha ⇒ gravado em parte: "Os
recebíveis destas parcelas foram removidos, mas as parcelas não foram canceladas. Tente cancelar
de novo.") → recalcula `valor_pessoal` (conferido; falha ⇒ gravado em parte: "As parcelas foram
canceladas, mas a minha parte da compra não foi recalculada. Edite a divisão em Parcelamentos
para recalcular."). `revalidatePath` sempre que algo foi gravado.

### 5.5 E5 · Excluir, e o que sai junto

**`deleteTransaction`** (S6, RR-F-2): leituras e proteção como hoje → **delete primeiro**
(`.delete().eq(…).select("id")`, conferido; erro ⇒ "Não foi possível excluir o lançamento. Nada
foi alterado."; 0 linhas ⇒ já sumiu, segue como hoje, D-G27) → **depois** reabre a fatura que ele
pagava (conferido; erro ⇒ gravado em parte: "O lançamento foi excluído, mas a fatura de {MM/AAAA}
continua marcada como paga. Desfaça o pagamento em Faturas." — o desfazer de `/faturas` aceita
`pago_transacao_id` nulo). Ordem segura: cair entre as duas deixa uma fatura "paga" sem pagamento
(visível, nenhum dinheiro em dobro); a ordem de hoje deixava a fatura aberta com o pagamento
ainda debitando — e pagá-la de novo debitava duas vezes.

**`preverExclusaoDoLancamento(id)`** (Server Action de leitura, K3, D-G2-17): `statementPaidBy`
(passa a devolver a competência), `protecaoDosRecebiveis`, **todos** os recebíveis do lançamento
com o nome da pessoa e o status, a contagem de parcelas (compra-pai) e a contagem de
`import_rows` que apontam para o lançamento. Leitura falha ⇒ `falhaDeLeituraAntes`.
Devolve `{ bloqueio: string | null, faturaReaberta: { competencia } | null, recebiveis: { pessoa, status, quantidade }[], parcelas: number, linhasDaImportacao: number, ehTransferencia }`.

**`finance/previsao-da-exclusao.ts`** (puro): `linhasDaPrevisao(p)` → as frases curtas;
`podeConfirmar(estado)` → `true` só com a leitura de volta, sem erro e sem bloqueio.

**`DeleteConfirmDialog`** ganha a prop opcional `carregarPrevisao`. Com ela: ao abrir, chama;
mostra "Conferindo o que sai junto…"; depois as linhas, ou o erro, ou o bloqueio; o botão
**Excluir** fica `disabled={!podeConfirmar(estado)}`. Sem ela, o diálogo é o de hoje (as outras
telas não mudam). Lançamentos passa `carregarPrevisao={() => preverExclusaoDoLancamento(t.id)}`.
Prova por varredura do código-fonte sem comentários (o projeto não tem teste de componente):
o `disabled` do botão de confirmar sai de `podeConfirmar`, a previsão só é chamada no abrir (no
`onOpenChange`, nunca no corpo do componente) e Lançamentos passa `carregarPrevisao`.

### 5.6 E6 · Recorrências (S9)

Por recorrência com datas a gerar: monta as linhas (como hoje) → **reserva**
(`update recurring_transactions set next_due_date = novo, is_active, last_generated_at … where id
and next_due_date = antigo` com `.select("id")`) — erro ⇒ `interrompida: true`; 0 linhas ⇒ outra
geração já reservou, pula → insert → erro ⇒ **devolve** a data (condicional, D-G2-10) e segue para
a próxima; devolução falha ⇒ `interrompida: true`. Sem datas a gerar, a atualização de
`last_generated_at`/`is_active` é conferida; erro ⇒ `interrompida: true`. A frase da tela é a que
já existe (`AVISO_DE_RECORRENCIAS_INTERROMPIDAS`).

### 5.7 E7 · Importação (S10, S11)

**`commitImport`**, por linha (D-G2-11): **reserva** (`update import_rows set status = 'erro',
motivo = MOTIVO_INTERROMPIDA where id and status = 'para_importar'` com `.select("id")`) — erro ⇒
**para o commit** com a frase de lote; 0 linhas ⇒ outra execução já pegou a linha, pula → cria
(`createTransaction`/`createInstallmentPurchase`/`createCardEstorno`, como hoje) → sucesso ⇒
`status = 'importada', transaction_id, motivo = null` (erro ⇒ **para o commit**; a linha fica
`erro` com o motivo "pode ter sido lançada", que é a verdade) → falha ⇒ `motivo = res.error` (a
frase da action, já em pt-BR — RR-G-10; erro dessa escrita ⇒ a linha fica com o motivo da
reserva, que erra para "pode ter sido lançada", e o commit segue). A linha sem data/valor (831)
idem, conferida. Frase de lote ao parar: "A importação parou depois de {n} linha(s). As que
faltam continuam marcadas para importar; confira as marcadas com erro em Lançamentos antes de
importar de novo." — com `revalidatePath`.

O lote (1010) conferido: erro ⇒ gravado em parte ("As linhas foram importadas, mas o lote não foi
marcado como importado. Abra o lote e importe de novo para atualizar os totais." — rodar de novo
é seguro, só processa `para_importar`).

**S11** — `parseImportFile` (370: compensação do lote), `remapImportBatch` (468, 474),
`undoImportBatch` (1149, 1154): cada escrita conferida; a primeira que falha devolve
`falhaDeEscrita` na forma que couber (nada gravado, ou gravado em parte dizendo o quê).

### 5.8 E8 · A varredura como teste

`inventariarEscritas(arquivos, raiz)` — o mesmo AST, filtro invertido, mais `rpc(...)` cujo nome
está em `RPCS_DE_ESCRITA`. Destinos como os da leitura (`tratado`/`repassado`/`descartado`/
`engolido`). `finance/escritas-que-engolem-erro.test.ts`: mesmo escopo de arquivos do teste de
leituras; `ESCRITAS_ESPERADAS` fixada no fim do E7 (medida, comentada); nenhuma `descartado`/
`engolido` fora de `EXCECOES` (cada uma com motivo e destino, e ainda existente no código).

### 5.9 E9 · O fechamento (K5)

- `finance/fechamento-redesign-03.test.ts`: a fixture **sintética** do §9 (compra no cartão
  R$ 1.000, minha parte R$ 400, terceiro R$ 600, reembolso R$ 250, pagamento da fatura R$ 1.000)
  e as **oito** exigências, uma `it` cada, pelas funções reais do motor (`resumoMes`/`dashboard`,
  `recebimentos`, `caixa`) — nenhuma reimplementação da conta.
- `finance/conciliacao-card-lista-grafico.test.ts`: a mesma fixture e o mesmo filtro (mês,
  responsabilidade "meu") pelo card, pela lista (o total das linhas que a leitura de Lançamentos
  devolve, no harness) e pelo gráfico (a série do mês). Os três batem. Divergência ⇒ o `it` é
  marcado e o achado registrado no §13, **não consertado** (fora da lista).
- A **matriz de fechamento da 03-G2** (§12) é preenchida linha a linha no fim do E9, com o teste
  que prova cada item ou o destino dele.

---

## 6. Mutações — o critério de aceite

Cada uma aplicada **sozinha**, compilando, com os testes que caem registrados pelo nome. Arquivo
não rastreado é copiado para o scratchpad antes. Restauração confirmada por `git diff --quiet` **e**
`git status --porcelain` vazio. Mutação que fica verde é **medida** antes de ser chamada de
fraqueza.

| | Mutação | Tem de cair |
| --- | --- | --- |
| Y1 | `criarTransacao` volta a gravar a divisão por fora da RPC (insert direto + `applySplit`) | teste de serviço "uma chamada só" e a varredura E8 |
| Y2 | `updateTransaction` grava o lançamento **antes** de planejar a divisão (RR6) | "recebível cobrado: recusa sem nenhuma escrita" |
| Y3 | no SQL, o `delete` dos recebíveis vem **antes** da conferência da proteção | teste da migration (ordem) |
| Y4 | no SQL, some `'ignorado'` da lista protegida | teste da migration (espelho de `STATUS_PROTEGIDOS`) |
| Y5 | no SQL, uma coluna sai do `update` (ex.: `liquidado_em`) | teste da migration (espelho de colunas) |
| Y6 | `updateTransaction` volta a mandar `p_divisao` vazia no caminho "nada" (apagaria a divisão ao editar a descrição) | "editar só a descrição não toca a divisão" |
| Y7 | RR11: a preservação do cartão do estorno sai | "editar a descrição de um estorno mantém card_id e statement_id" |
| Y8 | RR12: a recusa de troca de tipo do parcelado sai do TS | "parcelado que muda de tipo é recusado sem escrita" |
| Y9 | `deleteTransaction` volta a reabrir a fatura **antes** de apagar | "delete falho: a fatura continua paga" (ordem no log do harness) |
| Y10 | `deleteTransaction` volta a ignorar o erro do delete | "delete com erro: Nada foi alterado, sem reabrir" |
| Y11 | o botão Excluir deixa de depender de `podeConfirmar` | varredura do diálogo |
| Y12 | Lançamentos deixa de passar `carregarPrevisao` | varredura de Lançamentos |
| Y13 | `podeConfirmar` devolve `true` com a leitura falha | teste puro da previsão |
| Y14 | S9: o insert volta a vir antes da reserva | "recorrência: a reserva vem antes do insert" (log) |
| Y15 | S9: a reserva perde a condição `next_due_date = antigo` | "duas gerações: a segunda não insere" |
| Y16 | S10: a marca `importada` volta a ignorar o erro | "marca falha: o commit para" e a varredura E8 |
| Y17 | S10: a reserva perde `status = 'para_importar'` | "dois commits: a linha entra uma vez" |
| Y18 | uma escrita do escopo volta a ignorar o erro (variantes: `installments.ts`, `imports.ts`) | a varredura E8 (`escritas-que-engolem-erro`) |
| Y19 | `createInstallmentPurchase` volta a inserir o pai antes de resolver as faturas | "fatura falha: nenhuma escrita em transactions" |
| Y20 | S8: o cancelamento vem antes de apagar os recebíveis | "cancelar: recebíveis saem antes" (log) |
| Y22 | D-G2-14: sair de receita deixa de zerar `classificacao`/`valor_pessoal` | "receita de terceiro vira despesa pessoal: classificacao pessoal e valor_pessoal nulo no payload" |
| Y23 | D-G2-10: a reserva perde `is_active = true` | "última geração (finished) em duas abas: a segunda não insere" |
| Y24 | D-G2-16: erro sem `code` passa a dizer "Nada foi alterado." | teste puro de `traduzirErroDaRpc` |
| Y21 | o §9: a minha parte do motor passa a ser bruta (`valor_pessoal ?? amount` → `amount`) | `fechamento-redesign-03` |

---

## 7. Restrições (as do prompt, mais as do desenho)

- ⛔ Sem push, sem merge, sem deploy, sem upstream. Commits locais e pare.
- ⛔ Não editar `docs/redesign/STATUS.md`, nenhum `CLAUDE.md`, `AGENTS.md`,
  `src/lib/finance/dashboard.test.ts`, `src/lib/finance/dashboard-caracterizacao.test.ts`. Em
  `supabase/`, só a migration da §5.2.
- ⛔ Nada consertado retroativamente; sem backfill; nenhuma policy mexida.
- ⛔ Nada consertado fora da lista. Defeito achado ⇒ registrado e reportado.
- ⛔ Fixture sintética sempre (repositório público). Diff revisado antes de cada commit.
- Sem `Date.now()`/`new Date()` sem argumento em código novo; `timestamptz` lido por
  `dateInSaoPaulo`, nunca `.slice(0,10)`.
- Sem prettier. CRLF normalizado (`sed -i 's/\r$//'`) a cada edição.

---

## 8. Ordem de execução — um commit por passo

0. **Docs:** este desenho + o plano (`docs/superpowers/plans/2026-10-25-03g2-escritas.md`).
1. **E1** núcleo puro, com testes.
2. **E2** migration + teste do SQL + `saas-shield-br:migration-validator` → **pedir "aplique"** →
   `apply_migration` → conferir por objeto (`pg_proc`: as duas funções, `prosecdef = false`,
   `proconfig` com `search_path=""`; `has_function_privilege('anon', …) = false`) → tipos
   regenerados pelo MCP, diff lido, só o que é meu.
3. **Prova no banco** (plano mostrado antes): marcador `[03G2-SINT]`, competência 2031, só
   contagens e o hash dos saldos; o SQL de limpeza pronto para o dono.
4. **E3** salvar. 5. **E4** parcelado. 6. **E5** excluir (+ conferência visual do diálogo e do formulário do estorno).
7. **E6** recorrências. 8. **E7** importação. 9. **E8** a varredura. 10. **E9** o fechamento.
11. Verificação final, revisão da branch por subagente (modelo mais capaz, só leitura), correções
    confirmadas em `fix(redesign): 03-G2 revisao — …`, §13 preenchido.

---

## 9. A prova

- **Puro:** E1, a previsão, o §9 e a conciliação.
- **Harness** (`src/test/supabase-em-memoria.ts`, com `rpc` e log ordenado): cada sequência —
  quem é chamado, em que ordem, e que nada é escrito antes da recusa.
- **SQL:** varredura do arquivo da migration (§5.2) e a prova sintética no banco (§8 passo 3):
  dentro de `begin … rollback` quando possível; o que precisar persistir leva o marcador e a
  limpeza.
- **Banco no fim:** a recontagem da §2.1 com o mesmo `md5`; contagem que mudar é contada por dia
  de criação.

---

## 10. Critérios de aceite

1. As 28 escritas da §2.3 tratadas ou substituídas; a varredura E8 verde e com as mutações Y18
   vermelhas.
2. Nenhuma sequência S1–S10 deixa dinheiro pela metade; cada uma com o teste da ordem.
3. A migration aplicada só depois do "aplique", conferida por objeto.
4. As 24 mutações da §6 caem, cada uma com o nome do teste.
5. Os cinco comandos verdes; mediana e as rotas tocadas comparadas com a §2.2.
6. A matriz de fechamento da 03-G2 (§12) preenchida linha a linha.
7. Banco recontado com o mesmo `md5`.

---

## 11. Risco residual novo (com destino)

| | Risco | Destino |
| --- | --- | --- |
| RR-G2-1 | Fatura vazia criada antes de uma RPC que falha (D-G2-2) | aceito (não é dinheiro) |
| RR-G2-2 | S8 continua ordenada, não atômica (D-G2-9): cair entre o 1º e o 2º passo deixa a parte do terceiro naquelas parcelas sem dono até o cancelamento ser repetido, com frase mandando repetir | aceito; atomicidade se o dono pedir (REDESIGN-05) |
| RR-G2-3 | Linha de importação reservada que caiu fica `erro` com "pode ter sido lançada" — o dono confere à mão | aceito (é o claim-first) |
| RR-G2-4 | Estorno de cartão editado não muda de fatura nem com a data mudando (D-G2-1) | aceito; mover estorno de fatura é tarefa da REDESIGN-05 |

---

## 12. A matriz de fechamento da 03-G2

> ⚠️ **Não é "a lista do briefing"** (D32: os "18 casos financeiros mínimos do briefing §13"
> citados em `PLANO.md:73` não existem como lista). Esta matriz é declarada aqui, com este nome.

Preenchida no E9, linha a linha: critério → onde está provado → o que falta → destino.
Blocos: §9 (8 linhas) · §13.2 a §13.6 (uma linha por item) · conciliação card × lista × gráfico ·
"nenhum teste existente alterado para passar" (um commit por linha, com o motivo) · "cenário
sintético obrigatório como teste puro".

---

## 13. Resultado da execução

*(vazio — preenchido no fim da execução)*
