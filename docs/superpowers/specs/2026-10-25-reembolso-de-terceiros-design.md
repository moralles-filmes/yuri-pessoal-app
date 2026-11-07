# Reembolso de terceiros: a entrada na conta abate o que a pessoa deve

**Data:** 2026-10-25 · **Situação:** desenho para aprovação do dono · **Lugar no plano:** é o
núcleo da **04-C** do `docs/redesign/PLANO.md` ("Terceiros e reembolsos"), fecha o **RR7** da 03-C
e o **K2** da 03-D (`docs/superpowers/specs/2026-10-11-03d-recebiveis-design.md`).
**Pré-requisito:** a **REDESIGN-03 fechada**, inclusive a **03-G2** (atomicidade de
`criarTransacao`/`updateTransaction`/`deleteTransaction`). Decisão do dono: isto vem **depois**.

---

## 1. Intenção — o porquê

Hoje o dono registra o MESMO dinheiro duas vezes. Quando alguém que comprou no cartão dele manda
um Pix para pagar a parte da fatura, ele:

1. lança uma **receita** na conta, na categoria que criou chamada "Reembolso";
2. vai em **Terceiros → A receber** e clica **Receber** linha por linha até somar o valor do Pix.

Os dois registros não se conhecem (K2 da 03-D: `receivable_receipts.conta_id` e
`transaction_id` ficaram sempre nulos). Consequências:

- se a receita fica `pessoal` (o padrão), o reembolso **conta como renda dele**;
- na base caixa, "Reembolsos recebidos" (dos recebimentos) e "Outras entradas de terceiros" (da
  receita marcada) **contam o mesmo dinheiro duas vezes** — a tela hoje só avisa
  (`bloco-do-caixa.tsx`, K4);
- clicar linha por linha é manual e propenso a erro.

**O que o dono quer:** lançar a entrada uma vez, dizer de quem é, e o sistema fazer o resto.

## 2. O que muda para o dono (decidido por ele)

1. **Ele lança a receita do jeito de sempre** — à mão **ou pela importação do extrato** — e diz
   que ela é **de terceiro: de uma pessoa**.
2. Esse lançamento, sozinho:
   - **move o saldo da conta** (já é assim para receita com conta);
   - **não entra na renda dele** em nenhum relatório (já é assim para `classificacao = terceiro`);
   - **abate o que a pessoa deve** em Terceiros.
3. **Ele NÃO escolhe linha.** O valor abate o **total** da pessoa; o sistema distribui sozinho.
4. **Pagamento parcial é o caso normal.** Deve R$ 2.000, mandou R$ 500 → passa a dever R$ 1.500.
   Nada trava o valor ao total devido nem exige quitar.
5. **O que a pessoa deve inclui as parcelas futuras** já criadas (um recebível por pessoa ×
   parcela, nas faturas dos meses seguintes). Um Pix acima do que está nas faturas atuais **vai
   abatendo as parcelas futuras**, da mais próxima para a mais distante.
6. **Se mandar mais do que o total devido (futuras incluídas)**, o sistema **pergunta na hora de
   salvar** o que fazer com a sobra: **receita minha** ou **saldo a favor da pessoa**. O saldo a
   favor abate sozinho as próximas dívidas dela que aparecerem.
7. **Em Terceiros, por pessoa**, ele vê:
   - **o total que ela deve** (o número que importa);
   - **a lista das linhas** (itens da fatura) ainda **não cobertas por inteiro** — **sem**
     indicar, linha a linha, se foi paga ou quanto falta. Linha coberta em parte continua na lista;
   - as linhas **cobertas por inteiro saem da lista** e vão para uma tela/filtro de **Pagos**.
8. **O botão "Receber" sai** de A receber (o individual e o "marcar recebido" em massa). O que
   já foi registrado por ele continua valendo.
9. Apagar ou editar a receita **desfaz ou refaz** o abatimento junto.
10. O que ele já marcou à mão até hoje **fica como está**.

## 3. Objetivos, não-objetivos, anti-objetivos

**Objetivos**
- Um reembolso é **um fato só**: a receita. Pagamento, abatimento e saldo a favor derivam dela.
- Nenhum número do sistema conta o mesmo dinheiro duas vezes por causa de um reembolso vinculado.
- O total por pessoa em Terceiros, o "meu × terceiros" de cada fatura e os "reembolsos recebidos
  no mês" continuam corretos e conciliando entre si.

**Não-objetivos**
- Categoria de sistema "Reembolso" travada (decisão de quem desenhou, §9).
- Migrar o histórico: receitas antigas da categoria Reembolso e recebimentos marcados à mão **não**
  são religados nem reclassificados.
- A IA (`finance.lancar_transacao`) não ganha o campo de pessoa nesta entrega.
- Redistribuir o que já foi alocado quando aparece uma dívida mais antiga depois (§5.2).

**Anti-objetivos (seria fracasso mesmo funcionando)**
- O dono ter de abrir A receber e mexer em linha depois de lançar o Pix.
- Um reembolso aparecer como renda dele em qualquer gráfico ou relatório.
- A soma por pessoa divergir entre Terceiros, Faturas, Parcelamentos e o sino.
- Apagar a receita deixar a dívida da pessoa abatida (ou o contrário).
- O sistema decidir sozinho o destino da sobra.
- Uma compra antiga da pessoa ficar impossível de editar ou excluir só porque um Pix automático a
  cobriu.

## 4. Restrições do projeto que valem aqui

- `receivables.valor` é a **responsabilidade original**; o que voltou mora em
  `receivable_receipts` (03-D, D6). `parcial` **nunca** é gravado; `status = 'pago'` **nunca**
  afirma quitação sem a soma fechar (K1). O trigger `receivable_receipts_nao_excede` (trava de não
  exceder o devido **por recebível**, com `FOR UPDATE`) continua.
- **Legado (K0)** — `recebimentos.ts:92-94`: recebível com `status = 'pago'` **sem** linha de
  recebimento conta o valor inteiro como recebido em `pago_em`. Isso condiciona §5.3.
- **"Ninguém apaga dinheiro que entrou"** — `protecao-do-recebivel.ts`: hoje recebível com
  recebimento bloqueia sete caminhos (excluir lançamento, excluir parcelamento, alterar divisão,
  cancelar parcelas futuras, desfazer importação, virar transferência, desfazer da IA), com
  inventário congelado em `quem-apaga-recebiveis.test.ts`. Isso muda em §5.6.
- `transactions.amount` e `valor_pessoal` são `numeric(14,2)` **em reais** (invariante 63).
- `classificacao`/`valor_pessoal` da receita saem **só** de `decidirResponsabilidadeDaReceita` +
  `colunasDaReceita` (`responsabilidade-da-receita.ts`).
- A divisão de despesa tem **um núcleo** (`split.ts` + `split-reapply.ts`); não escrever um
  terceiro caminho de criação de recebível. `reapplySplit` **apaga e recria** recebíveis.
- FK **composta** `(x_id, user_id)` sempre que uma tabela apontar para outra do mesmo dono
  (invariante 23 da 17-F). ⚠️ `transactions` e `people` **ainda não têm** `unique (id, user_id)`
  — só `receivables_id_user_uk` e `accounts_id_user_uk` existem; criar antes.
- RLS + FORCE RLS, índice em `user_id`, trigger `updated_at` em tabela nova.
- Lógica pura com datas injetadas, testada em Vitest; I/O separado.
- Escrita atômica num RPC `security invoker`, `search_path = ''`, reusando o que a 03-G2 deixar
  pronto para atomicidade de lançamento.
- Erro é erro (03-G): leitura que falha não vira zero.
- Fuso, BRL, pt-BR, dark/light, responsivo — como no resto do app.

## 5. O modelo

### 5.1 Três fatos, uma derivação *(decisão de quem desenhou)*

- **Pagamento da pessoa** — tabela nova (nome sugerido `person_payments`): `user_id`,
  `person_id`, `transaction_id`, `valor` (a parte da receita que é da pessoa), `recebido_em`.
  **Uma linha por receita vinculada**, FK composta para `transactions` **`on delete cascade`** e
  para `people`.
- **Alocação** — continua sendo `receivable_receipts`, agora com `payment_id` (FK composta para o
  pagamento, `on delete cascade`) e `transaction_id`/`conta_id` preenchidos (colunas da K2 já
  existem; ganham FK composta). Assim os leitores atuais (`entradasDoRecebivel`,
  `estadoDoRecebivel`, `parteDosTerceirosPorFatura`, perdoado D11, `reembolsosRecebidosNoPeriodo`)
  continuam funcionando sem saber que a alocação foi automática.
- **Saldo a favor da pessoa** — **derivado, nunca gravado**: `Σ pagamentos.valor − Σ alocações
  vindas de pagamentos`.

### 5.2 A regra de distribuição (pura)

Uma função pura recebe os recebíveis **em aberto** da pessoa (com o já recebido) e o dinheiro
livre (saldo a favor + pagamento novo) e devolve as alocações:

- **ordem: do mais antigo para o mais novo**, pela data da dívida (vencimento da fatura do
  recebível; sem fatura, a competência do lançamento de origem; desempate `created_at`, `id`).
  **Parcelas futuras entram**, depois das atuais, pela mesma ordem (decisão do dono);
- cada recebível recebe no máximo o seu saldo (`saldoCentavos`);
- **`ignorado` e `desconhecido` nunca recebem alocação**; `pendente` e `cobrado` recebem;
- recebível legado `pago` sem recebimento (K0) tem saldo zero e não recebe;
- centavos inteiros por dentro, sem arredondar;
- **só o dinheiro livre é distribuído**: alocação existente não é desfeita para "abrir espaço" a
  uma dívida mais antiga que aparecer depois (fatura passada importada agora). *(Decisão de quem
  desenhou.)*
- **Consequência:** como o RPC sempre consome o crédito livre, **saldo a favor e dívida em aberto
  nunca coexistem** depois de rodar. A "sobra" de um pagamento novo é simplesmente
  `valor do pagamento − total em aberto da pessoa` (futuras incluídas), quando positiva.

### 5.3 A escrita (atômica)

Um RPC (nome sugerido `aplicar_pagamentos_da_pessoa(p_person_id)`) que, numa transação e com
lock por pessoa: lê pagamentos e alocações da pessoa, calcula o dinheiro livre e aloca nos
recebíveis em aberto pela regra 5.2. **Idempotente.**

⛔ **O RPC NUNCA grava `receivables.status = 'pago'`** *(decisão de quem desenhou)*. O estado
`pago` de uma linha coberta sai da soma (`estadoDoRecebivel` já faz isso: `saldo <= 0` com
recebido > 0). Motivo: se ele gravasse `pago`, o cascade de apagar a receita removeria as
alocações e deixaria uma linha `pago` sem recebimento — que o K0 lê como **quitada pelo valor
inteiro**, sem como distinguir de um legado de verdade. Não gravando, apagar a receita devolve a
linha ao `status` que ela tinha (`pendente` ou `cobrado`), sem passo extra.
⚠️ O construtor deve **inventariar todo leitor que filtra pela COLUNA `status`** (em vez do
estado derivado) e passá-lo ao estado derivado — senão uma linha coberta automaticamente
continuaria aparecendo como em aberto ali.

A regra 5.2 tem de existir **num lugar só** para o que grava. Se ela viver em SQL, a versão TS
pura serve à **prévia** e é provada igual à do banco por teste de equivalência; se o TS calcula e o
RPC só grava, a transação continua única. **Escolha do construtor.**

**Quem chama o RPC** (chamar, nunca reimplementar):
- criar / editar / apagar receita vinculada, e mudar o **status** dela (`setTransactionStatus`);
- commit e desfazer da importação com linha vinculada;
- criar, reaplicar ou cancelar divisão que gere/remova recebível da pessoa (`split-reapply.ts`,
  `cancelInstallmentFuture`, exclusão de lançamento/parcelamento);
- mudar um recebível de/para `ignorado`.

Editar a receita para um valor **menor** do que já foi alocado dela: as alocações mais **novas**
desse pagamento são desfeitas primeiro, e o RPC realoca.

**Só abate quando o dinheiro entrou** *(decisão de quem desenhou)*: receita vinculada com status
**`recebido`** gera pagamento; `pendente` (prevista) não gera, e passar para `recebido` gera.
`recebido_em` = data de caixa (`dataDeCaixa`: `liquidado_em`, ou a competência como aproximada).

**Data da alocação:** toda alocação leva o `recebido_em` **do pagamento de onde saiu** — inclusive
a que sai do saldo a favor meses depois. É o dia em que o dinheiro entrou na conta. *(Decisão de
quem desenhou.)*

### 5.4 A receita vinculada

- Receita com classificação **de terceiro** ganha o campo **"De quem?"** (pessoa, opcional). Com
  pessoa → é reembolso e vincula; sem pessoa → é o que já é hoje ("outras entradas de terceiros").
- **Prévia antes de salvar:** "Fulano deve R$ 2.000,00 → passa a dever R$ 1.500,00", pela mesma
  regra.
- **Sobra** (§5.2): a tela mostra "Passa R$ X do que Fulano deve" e exige escolha, **sem padrão**:
  - **receita minha** → a receita é gravada `compartilhada` com `valor_pessoal = sobra` (via
    `decidirResponsabilidadeDaReceita`), e o pagamento da pessoa é `amount − sobra`;
  - **saldo a favor de Fulano** → fica `terceiro`, `valor_pessoal = 0`, pagamento = `amount`.
  O servidor **recalcula** antes de gravar; se a dívida mudou entre a prévia e o salvar, recusa com
  mensagem e a tela pede a escolha de novo.
- A categoria "Reembolso" do dono, marcada "de terceiros" (03-C2), continua só pré-preenchendo.

### 5.5 Importação do extrato

⚠️ Hoje a importação **não** classifica receita: `imports.ts:666-668` recusa classificação
diferente de `pessoal` fora de despesa, `services.ts:58-63` declara receita importada como
`pessoal`, e `commitImport` (`imports.ts:957-973`) não envia `receita_classificacao` nem
`receita_minha_parte`. Esta entrega:
- abre na revisão, para linha de **receita**, a classificação (pessoal / de terceiro), o "De
  quem?" e a pergunta da sobra, linha a linha — colunas novas em `import_rows`, espelhando o
  formulário;
- faz o `commitImport` gravar a receita com essa responsabilidade pelo caminho de sempre e chamar
  o RPC por pessoa tocada; o desfazer da importação também;
- usa a mesma regra pura na prévia (como `split-totals.ts` usa o motor da divisão);
- duas linhas da mesma pessoa no mesmo lote: a prévia da segunda considera a primeira.

### 5.6 A proteção de recebível muda

*(Decisão de quem desenhou; o dono quer o total, não a linha.)* **Alocação automática (com
`payment_id`) NÃO bloqueia** nenhum dos sete caminhos de `protecao-do-recebivel.ts`. Quando uma
compra coberta é excluída ou tem a divisão alterada, a alocação some com o recebível (cascade) e o
dinheiro **volta a ser saldo a favor da pessoa**; o RPC roda em seguida e o usa nas outras dívidas.
`reapplySplit` apaga e recria: depois dele, o RPC realoca.

Recebimento **manual** (legado, `payment_id` nulo) **continua bloqueando** como hoje. A regra pura
ganha essa distinção, a mensagem continua apontando para A receber (ali o Desfazer manual ainda
existe), e o inventário de `quem-apaga-recebiveis.test.ts` é atualizado, não contornado.

### 5.7 Terceiros (`/terceiros`)

- Por pessoa: **total que deve** (Σ saldos em aberto, parcelas futuras incluídas), **saldo a
  favor** quando houver, e a lista das linhas **não cobertas por inteiro**, sem indicador de
  pago/parcial por linha.
- Tela/filtro **Pagos**: as linhas cobertas por inteiro.
- "Não será cobrado" continua (é perdão). *(Decisão de quem desenhou.)*
- Saem: **Receber**, "marcar recebido" em massa e o diálogo de registrar recebimento à mão.
- **Desfazer** fica **só para recebimento manual** (`payment_id` nulo). Alocação automática se
  desfaz editando ou apagando a receita. *(Decisão de quem desenhou.)*
- A soma por pessoa sai de uma função pura testada (fecha o RR-D-21).

### 5.8 Os números

- **Base caixa:** a receita vinculada **já** entra em "outras entradas de terceiros" pela
  `meuCentavos`; as alocações dela **não podem** entrar de novo em "Reembolsos recebidos". O
  construtor escolhe em qual das duas linhas o reembolso vinculado aparece, mas **cada real
  aparece uma vez**, com teste. O aviso de sobreposição (K4) passa a valer só para o legado.
- **Base competência e "minhas entradas":** nada muda — `valor_pessoal` já faz o trabalho.
- **Faturas / Parcelamentos / sino:** leem `receivable_receipts`; ficam certos sozinhos, desde que
  o inventário de §5.3 (leitores da coluna `status`) seja cumprido.

## 6. Casos que o construtor cobre com teste

1. Deve 2.000 em 4 linhas de 500; paga 500 → a mais antiga sai da lista, total 1.500.
2. Paga 700 → uma linha sai, a segunda fica na lista (coberta em 200), total 1.300.
3. Compra 10× R$ 200, só a 1ª na fatura; paga 600 → cobre a 1ª, a 2ª e a 3ª (futuras), total 1.400.
4. Deve 2.000 (futuras incluídas), paga 2.500 → pergunta a sobra de 500; "receita minha" grava
   compartilhada (valor_pessoal 500); "saldo a favor" deixa 500 de crédito.
5. Com 500 de saldo a favor, entra compra nova de 300 → coberta sozinha, crédito 200, e a
   alocação leva a data do pagamento original.
6. Apaga a receita do caso 2 → as duas linhas voltam a dever (2.000) e voltam ao `status` que
   tinham (`cobrado` continua `cobrado`).
7. Edita a receita de 700 para 400 → desfaz a alocação mais nova, total 1.600.
8. Exclui uma compra já coberta automaticamente → **não bloqueia**; o valor vira saldo a favor e
   é realocado nas outras dívidas.
9. Compra coberta por recebimento **manual** → continua bloqueando como hoje.
10. Linha `ignorado` nunca recebe alocação; voltar para pendente a faz receber do crédito.
11. Recebível legado `pago` sem recebimento (K0) não recebe alocação.
12. Receita vinculada `pendente` não abate; ao virar `recebido`, abate.
13. Receita de terceiro **sem** pessoa: nada muda em relação a hoje.
14. Base caixa: um reembolso vinculado de 500 soma 500 nas entradas, nunca 1.000.
15. Importação: duas linhas da mesma pessoa no mesmo lote alocam em sequência; desfazer a
    importação devolve a dívida.
16. Dívida mais antiga aparece depois de tudo alocado: nada é redistribuído.
17. Idempotência: rodar o RPC duas vezes seguidas não muda nada.

## 7. O que fica para o construtor

Nomes de tabela, coluna, RPC e componentes; se a regra de distribuição mora em SQL ou em TS (com a
restrição de §5.3); o desenho visual da lista e do filtro Pagos; em qual linha do caixa o reembolso
vinculado aparece (com a restrição de §5.8); a ordem das migrations; os textos exatos; como
reaproveitar a atomicidade entregue pela 03-G2.

## 8. Respostas do dono à revisão (2026-10-25)

- **Parcelas futuras contam como dívida**: o Pix a mais vai abatendo das parcelas futuras.
- **Ordem**: depois da REDESIGN-03 (03-G2 incluída).
- **Execução**: o plano vira um prompt para o Codex implementar numa sessão própria.

## 9. Decisões de quem desenhou (o dono confere)

- Ordem de distribuição: do mais antigo para o mais novo; só dinheiro livre é redistribuído.
- Saldo a favor é derivado, não gravado.
- O RPC nunca grava `status = 'pago'`; o estado pago é derivado da soma.
- Só abate receita `recebido`; a alocação leva a data do pagamento.
- Alocação automática não bloqueia exclusão/edição de compra; a manual continua bloqueando.
- Desfazer de A receber só para recebimento manual.
- Não criar categoria de sistema "Reembolso"; "Não será cobrado" continua.
- A alocação continua em `receivable_receipts`, para não mudar os leitores atuais.

## 10. Ajuste do plano (2026-10-25)

O plano (`docs/superpowers/plans/2026-10-25-04c-reembolso-de-terceiros.md`) trocou duas sugestões
do §5, sem mudar comportamento: **não há tabela de pagamentos** — o pagamento é a própria receita
(`transactions.reembolso_pessoa_id`, status `recebido`, parte = `amount − coalesce(valor_pessoal, 0)`)
— e **a realocação é disparada por triggers de instrução** em `transactions` e `receivables`, em vez
de uma lista de chamadores do RPC. Motivo: um fato só, atomicidade por construção e nenhum chamador
para esquecer.

## 11. O que mudou desde 2026-10-25 (reconciliação de 2026-11-02, antes de qualquer código)

O plano parte de `af0b547`. Depois dele foram integradas a 03-G2, a 04-A, a 04-A2, a 05, a 06 e a
04-B. Esta seção diz, tarefa a tarefa, o que continua, o que mudou de lugar e o que é novo. Os
desvios do plano estão numerados (**DV-n**) e valem por cima do plano.

### 11.1 O banco hoje (lido em 2026-11-02, só `select`)

- `receivable_receipts` tem **zero linhas**: nenhuma com `transaction_id`, nenhuma com `conta_id`,
  nenhum recebimento manual.
- Os recebíveis são **111, todos `pendente`**, de 3 pessoas: **nenhum legado `pago` (K0)**,
  nenhum `cobrado`, nenhum `ignorado`.
- **Nenhuma** receita `terceiro`/`compartilhada`. 32 linhas de receita em `import_rows`.
- md5 dos saldos = a linha de base `15d93bd1c1d3e55a40db6210dff0eb3b`.
- Nem `transactions_id_user_uk` nem `people_id_user_uk` existem.

Consequência: as três migrations (M1, M2, M3) **não tocam nenhum dado existente**, e nenhum número real muda no dia em
que entram. O que muda são as regras para o que for lançado dali em diante. O legado (K0, manual)
continua coberto por teste, mas hoje não tem linha nenhuma.

### 11.2 Tarefa a tarefa

**Tarefa 0 — vale.** O portão (03-G2 e 04-B ancestrais de `00-auditoria`) passou.

**Tarefa 1 (regra pura) — vale como está.**

**Tarefa 2 (decisão pura + schema) — vale.** O schema do lançamento mudou de forma na 03-G2:
`reembolsoSchema` entra onde mora hoje o de `receita_classificacao`/`receita_minha_parte`, e o
`round-trip.test.ts` ganha a fixture (regra 1 dos formulários e invariante 94).

**Tarefa 3 (banco) — muda. Três desvios:**
- **DV-1 · `salvar_lancamento` é redefinido.** A 03-G2 pôs criar e editar lançamento num RPC
  (`20261025120000_salvar_lancamento_atomico.sql`) que **lista as colunas à mão** no `insert` e
  no `update` (D-G2-5: só a chave que veio é escrita). Sem acrescentar `reembolso_pessoa_id` ali,
  a coluna nova **nunca seria gravada** pelo formulário — e nada falharia, ela só ficaria nula. A
  M3 (arquivo próprio, porque o teste da 03-G2 exige só função e grants nele) faz `create or replace` da função com a coluna nas duas listas e com a pessoa na conferência
  de referência (`LANCAMENTO_REFERENCIA_INVALIDA`). O teste de varredura da 03-G2
  (`m-g2-salvar-lancamento.test.ts`) passa a ler a versão nova.
- **DV-2 · a proteção que o RPC confere no SQL só conta recebimento manual.** A linha 151 da mesma
  migration (`exists (select 1 from public.receivable_receipts rr where rr.receivable_id = rc.id)`)
  é o espelho SQL de `recebivelProtegido` (D-G2-4). Ela ganha `and rr.transaction_id is null`,
  senão a §5.6 valeria no TS e seria recusada no banco (o caso 8 do §6 falharia só em runtime). É
  o **único** ponto SQL que lê `receivable_receipts` (conferido por `grep` nas migrations).
- **DV-3 · triggers de instrução e o RPC.** `salvar_lancamento` grava o lançamento e depois apaga
  e recria os recebíveis da divisão, em instruções separadas da mesma transação. ⚠️ Escrito aqui
  primeiro como "a realocação roda mais de uma vez e termina no mesmo lugar" — **errado**, e a
  validação estática das migrations mostrou por quê: entre o apagar e o recriar, o trigger manda o
  dinheiro da dívida apagada para a seguinte, e a regra 6 (nunca mover alocação) o prende lá. A
  substituição da divisão **pausa** os triggers (`reembolso.pausa`, local à transação) e realoca
  **uma vez** no fim, para cada pessoa da divisão velha e da nova. Por isso a função de realocação
  vem antes (**M2**) e a redefinição do RPC depois (**M3**). O script SQL prova isso passando pelo
  próprio RPC, com o caso "dívida mais antiga refeita mantém a alocação".

A ordem e o conteúdo do resto (M1 aditiva, M2 com `realocar_reembolsos_da_pessoa` e os seis
triggers, `security invoker`, `search_path = ''`, nenhum `update public.receivables`) valem.

**Tarefa 4 (leitura e proteção) — vale, com o inventário já feito (§11.4) e um ponto novo:**
- **DV-4 · `deletePerson` conta as receitas vinculadas.** Hoje ele conta recebíveis e divisões
  antes de excluir (ou inativar). Com a FK sem cascade de `transactions.reembolso_pessoa_id`, uma
  pessoa com reembolso e sem recebível cairia num `23503` cru. Ela passa a ser **inativada**, como
  a que tem recebível.

**Tarefa 5 (números do caixa) — cresce: a 04-B pôs uma gaveta em cima de cada número.**
Escolha de §5.8 (a do plano): **o reembolso vinculado aparece em "Reembolsos recebidos"**, e as
alocações automáticas **nunca** contam ali. Em `numerosDoCaixa`:
- `reembolsosRecebidos` = recebimentos **manuais** do período (com K0) **+** `reembolsosVinculados`;
- `reembolsosVinculados` (campo novo) = Σ `amount − meu` das receitas com `reembolso_pessoa_id`;
- `outrasEntradasDeTerceiros` = Σ `amount − meu` só das receitas **sem** pessoa;
- `entradasDoCaixa`, `resultadoDeCaixa` e `rendaPessoalRecebida`: a fórmula é a mesma; o número
  só deixa de dobrar;
- `avisoDeSobreposicao` = recebimentos manuais > 0 **e** outras > 0 (só o legado).

Os pontos de leitura que seguem a regra (Review Focus 1), cada um com teste:

| Ponto | Arquivo | O que muda |
| --- | --- | --- |
| Bloco do caixa (Painel e Relatório) | `components/financeiro/bloco-do-caixa.tsx` | nada na tela: lê `numerosDoCaixa` |
| Faixa do Painel / indicadores de caixa | `finance/painel.ts`, `caixa-leitura.ts` | nada: leem `entradasDoCaixa` e `minhaParteDoCaixa` |
| Gaveta · linha "Reembolsos recebidos" | `finance/detalhe.ts` (`linhaDoCaixaDetalhe`, `reembolsos`) | lista os recebimentos **manuais** + as receitas vinculadas (id do lançamento, data de caixa, a parte da pessoa); as alocações automáticas saem |
| Gaveta · linha "Outras entradas" | `detalhe.ts` (`outras`) | filtra as receitas **sem** pessoa |
| Gaveta · "Entradas" do caixa, parte terceiros | `detalhe.ts` (`entradasDoCaixaDetalhe`) | total = `outras + vinculados`: **numericamente igual** ao de antes, porque a parte vinculada só mudou de linha; a lista (os movimentos de renda) continua fechando |
| Relatório "De terceiros" | `reports/financeiro.ts` | nada: é a parte dos terceiros nas **saídas** (D3, o valor), não lê recebimento |
| Pendente (Painel, Relatório, gaveta `pendente`/`pendente-do-mes`) | `totalPendenteAte`, `pendenteDoPeriodo` | nada no código: a alocação automática **é** recebimento, datada no dia do dinheiro, e abate o pendente sozinha, que é o objetivo |
| Competência ("minhas entradas", "entradas de terceiros") | `resumoMes` | nada: `valor_pessoal` já faz o trabalho |

Os testes de conciliação da 04-A, 04-A2 e 04-B **não mudam de número** com as fixtures atuais
(nelas não há receita vinculada). Cada um ganha um caso com receita vinculada provando que o
número conta o reembolso uma vez.

**Tarefa 6 (lançamento) — vale, no formato da 03-G2:** a decisão roda em `criarTransacao`
(`services.ts`) e em `updateTransaction` (`actions/transactions.ts`) **antes** do
`rpc("salvar_lancamento")`, ao lado de `lerResponsabilidadeDaReceita`; o payload ganha
`reembolso_pessoa_id` (DV-1). `setTransactionStatus` não precisa de nada: o trigger vê a troca de
status. A importação cria por `createTransaction` (`imports.ts:1033`), então herda o mesmo
caminho.

**Tarefa 7 (importação) — vale.** As linhas citadas no desenho (`imports.ts:666-668`, `957-973`)
andaram: a recusa da classificação de receita fica hoje em `setImportRowSplit` (`imports.ts:669`)
e o envio, em `commitImport` (`imports.ts:1032-1048`).

**Tarefa 8 (Terceiros) — vale, e ganha a ficha por pessoa que a 04-B mandou para cá** (§13 da
04-B; linha 04-C do `PLANO.md`: "por pessoa, origem do débito, valor atribuído, recebimentos,
saldo, histórico"). Ver §11.3.

**Tarefa 9 (fechamento) — muda.** O plano manda editar `CLAUDE.md`, `CURRENT_STATUS.md` e
`docs/handoff/*`. **DV-5:** nesta fase o dono proibiu editar qualquer `CLAUDE.md`, o `AGENTS.md` e
o `docs/redesign/STATUS.md`. A invariante nova e o handoff ficam escritos no §13 deste desenho, e
quem integra decide onde copiá-los. Push, PR e merge: nenhum (D67).

### 11.3 A tela de Terceiros por pessoa (proposta para aprovação)

- O topo continua com o **total pendente** (`totalPendenteAte(hoje)`, o mesmo do Painel).
- **Uma ficha por pessoa** com dívida, saldo a favor ou histórico:
  - **Deve** (o número grande) = `resumoDaPessoa.devidoCentavos`, parcelas futuras incluídas; por
    teste, **igual** ao `aReceberPorPessoa` do Painel para a mesma pessoa;
  - **Saldo a favor**, só quando > 0 (nunca junto com dívida, §5.2);
  - **Em aberto:** as linhas não cobertas por inteiro, com a **origem** (descrição da compra,
    cartão/fatura ou "parcela k/N") e o **valor atribuído**, **sem** chip de parcial e sem saldo
    por linha (§2.7);
  - **Pagamentos:** as receitas vinculadas da pessoa (data de caixa, conta, valor), cada uma
    linkando para o lançamento. É o "recebimentos/histórico" do `PLANO.md`; desfazer é editar ou
    excluir a receita ali;
  - **Pagos** (filtro): as linhas cobertas por inteiro (`secoesDaLista().historico`);
  - **Não será cobrado** continua como seção própria (D11).
- Saem: **Receber**, "marcar recebido" em massa e `registrar-recebimento-dialog.tsx`.
  **Desfazer** só em linha com recebimento manual (hoje, nenhuma).
- "Reembolsos recebidos em <mês>" = `recebidoDaPessoaNoPeriodo` (manuais + partes vinculadas): o
  dinheiro que virou saldo a favor também conta, porque entrou.

### 11.4 Inventário dos leitores da COLUNA `status` de recebível (§5.3)

| Ponto | Decide por | Ação |
| --- | --- | --- |
| Sino (`notifications/cron.ts:337`) | `emAberto(resumirRecebivel)`: derivado, valor = saldo | nada; o `status` que passa ao `generate.ts` só distingue cobrado/pendente |
| `notifications/generate.ts:363` | o status que o cron já derivou | nada |
| Motor (`pipeline.ts:341`) | `recebido` somado + coluna crua para `ignorado` | nada |
| Proteção (`protecao-do-recebivel.ts`) | coluna (`cobrado`/`pago`/`ignorado`) + `temRecebimento` | `temRecebimento` passa a contar só o manual (Tarefa 4 + DV-2) |
| Terceiros (`terceiros-client.tsx:678, 710, 757, 795, 813`) | coluna, para mostrar botões | reescrito na Tarefa 8 |

O **sino continua por linha** (um aviso por recebível em aberto, com o saldo). Agrupar por pessoa
mudaria a contagem de avisos e as chaves de dedupe; fica fora (backlog), declarado.

### 11.5 O que esta fase herda do STATUS

| Item | Destino aqui |
| --- | --- |
| RR7 (03-C), K2 (03-D), RR-E-4 (03-E) | **fecha**: o vínculo existe e o caixa conta uma vez |
| RR-D-16 (barra "N selecionados" híbrida) | **some**: a seleção em massa de receber sai |
| RR-D-18 (mensagem manda clicar num "Receber" que não está lá) | **fecha**: o texto de `motivoParaNaoApagar` deixa de citar o botão |
| RR-D-21 (soma por pessoa sem teste de comportamento) | **fecha**: `resumoDaPessoa`, conciliado com `aReceberPorPessoa` |
| RR-D-14 (`RECEIVABLE_OPEN_STATUSES` sem consumidor) | conferido na execução; se continuar órfã, sai |
| RR-D-12, RR-D-20 (leitura de recebimentos com falha/teto) | conferidos contra o que a 03-G deixou; o que faltar vai ao §13 com destino |
| Pessoa inativa como opção de filtro (achado da 04-A2) | **proposta:** "De quem?" lista as ativas e, na edição, a pessoa vinculada mesmo inativa; o filtro do Relatório fica fora (backlog) |

### 11.6 Prévia

A prévia com dado sintético (Terceiros por pessoa e o formulário com "De quem?" e a pergunta da
sobra) foi publicada à parte para a aprovação do dono; os números saem dos casos 2, 4 e 5 do §6.

## 13. Resultado da execução (2026-11-06)

Branch `feat/redesign-04c-reembolso-impl` (worktree `C:/tmp/04c-impl`), sobre `a034bb8`. Commits
locais, um por passo; sem push, sem PR, sem merge (D67).

### 13.1 O que foi entregue

| Passo | Commit | O que faz |
| --- | --- | --- |
| T1 | `f0215dd` | regra pura da distribuição (`reembolso.ts`) + casos dourados (`reembolso-casos.ts`) |
| T2 | `06fda17` | `decidirReembolso` + `reembolsoSchema` |
| T3 | `445fa1f`, `a23c6e1` | M1 (vínculo), M2 (`realocar_reembolsos_da_pessoa` + 6 triggers de instrução), M3 (`salvar_lancamento` com pausa) + `scripts/finance/verificar-reembolso.sql` |
| T4 | `d298c11` | `lerEstadoDoReembolso`, `lerSituacoesDoReembolso`; a proteção conta só recebimento manual |
| T5 | `54e1fdf` | base caixa: a receita vinculada entra uma vez; alocação automática fora de "Reembolsos recebidos" |
| tipos | `977f274` | `src/types/supabase.ts` regenerado — só as FKs compostas e a função desta fase |
| T6 | `0a632a4` | lançamento: "De quem?", prévia, sobra sem padrão; o servidor decide antes de gravar |
| T7 | `4439288` | importação do extrato: reembolso por linha, prévia em sequência por pessoa |
| T8 | `043cce1` | Terceiros por pessoa: deve, saldo a favor, Em aberto, Pagamentos, Pagos; sai o Receber |
| revisão | `3293037` | achados da revisão final (ver 13.4) |

Migrations: a M1 aplicada por MCP; a M2 e a M3 aplicadas pelo dono no SQL Editor. Conferido no
banco depois: 6 triggers, 4 funções `security invoker` com `search_path = ''`, `salvar_lancamento`
com uma sobrecarga só, anon sem execute, nenhuma alocação nem receita vinculada pré-existente.
**md5 dos saldos `15d93bd1c1d3e55a40db6210dff0eb3b` antes e depois de cada migration** — nenhuma
mudou saldo.

### 13.2 Verificação

- `npm run test:run`: **8.197 testes / 364 arquivos**, verde (`--testTimeout=30000`).
- `TZ=UTC npx vitest run src/lib/finance src/lib/reports src/lib/import`: 1.824 / 100, verde.
- Conciliação 04-A (`painel-conciliacao`), 04-A2 (`conciliacao-relatorio-painel`) e 04-B
  (`conciliacao-card-lista-grafico`): verdes, sem mudar número.
- `npm run lint`, `npx tsc --noEmit`, `npm run build`: limpos. `npm run perf:bundle`: todas as
  rotas no orçamento; mediana 202,7 KB (igual).

| Rota (KB gz) | antes (`a034bb8`) | depois | Δ |
| --- | --- | --- | --- |
| /financeiro/lancamentos | 212,9 | 214,9 | +2,0 ("De quem?" e a prévia no formulário) |
| /terceiros | 210,5 | 210,6 | +0,1 (sai o diálogo, entram as abas) |
| /relatorios | 208,0 | 208,1 | +0,1 |
| /dashboard/financeiro | 203,2 | 203,2 | 0 |
| /importar | 203,1 | 206,3 | +3,2 (diálogo de reembolso, sem `next/dynamic`, como o de divisão) |

- Toda regra nova teve **mutação confirmada** (quebrar → teste vermelho → restaurar → conferir).
- Casos dourados SQL (`verificar-reembolso.sql`, `begin … rollback`): **PENDENTE** — o MCP recusa o
  script (tem `delete`); entregue ao dono para rodar no SQL Editor.
- Conferência visual (390/768/1280/1440, claro e escuro): **PENDENTE** — exige o `.env.local`,
  que só é copiado com o aval do dono.

### 13.3 Decisões tomadas na execução, com o custo

1. **A prévia do formulário lê UMA pessoa sob demanda** (`lerPreviaDoReembolso`), em vez de
   `lerSituacoesDoReembolso()` na `page.tsx` como o plano dizia. Custo: uma ida ao servidor ao
   escolher a pessoa. Ganho: a página de lançamentos não lê a dívida de todo mundo a cada visita, e
   a edição já vem com a contribuição da própria receita.
2. **`recebidoDaPessoaNoPeriodo` recebe `entradasManuais`** (a saída de
   `entradasManuaisDoRecebivel`, com o legado K0) em vez de `RecebimentoLido[]`. Custo: assinatura
   diferente do plano. Ganho: o legado não some do KPI.
3. **O "Deve" da ficha é sempre o total da pessoa**; os filtros de mês e cartão só recortam as
   listas, e a tela avisa quando há filtro. Custo: o número grande não acompanha o filtro. Ganho:
   ele é sempre o mesmo do Painel (RR-D-21).
4. **A linha em aberto não mostra "parcela k/N"**: `lerRecebiveis` não traz o número. Mostra
   descrição, cartão, fatura e datas, como o card antigo.
5. **A importação não confere a "dívida vista"** (`reembolso_devido_visto` vazio): o servidor
   recalcula linha a linha e o trigger da linha anterior já atualizou o estado. Linha com sobra e
   sem escolha vira `erro` com o motivo; para reimportá-la, o dono escolhe a sobra e a devolve a
   "importar".
6. **O desfazer de recebimento manual chama a realocação pelo TS** (achado P2 da revisão), em vez
   de um trigger de `delete` em `receivable_receipts`. Custo: um ponto a lembrar se surgir outro
   caminho que apague recebimento manual. Ganho: sem migration nova nesta fase. A falha da
   realocação é declarada na tela.
7. **A ação em massa perdeu "receber"** (schema, serviço e tela). A seleção em massa continua para
   cobrar, não cobrar e desfazer — RR-D-16 resolvido pela saída da ação, não da barra.
8. **`RECEIVABLE_OPEN_STATUSES` saiu** — não tinha consumidor de código (RR-D-14).

### 13.4 Revisão final (modelo mais capaz, só leitura, diff `a034bb8..HEAD`)

Nenhum P0/P1. Corrigidos em `3293037`:
- P2 — o desfazer de recebimento manual não realocava a pessoa;
- P3 — o passo 2 da regra TS contava alocação já removida no passo 1 (divergia do SQL);
- P3 — a prévia sem `.catch` travava o Salvar em "carregando";
- P3 — editar uma receita vinculada pedia a escolha da sobra de novo.

### 13.5 Achados NÃO corrigidos, com destino

| Achado | Por que não agora | Destino |
| --- | --- | --- |
| Deadlock plausível entre duas edições concorrentes de despesas divididas com a mesma pessoa (o `for update` da M3 sem `order by`, depois o lock ordenado da M2; idem trigger de UPDATE em `receivables`) | single-user: chance baixa; corrigir exige migration nova | backlog — migration que ordena o lock em `salvar_lancamento` |
| Alocação automática parcial numa dívida que depois vira "não será cobrado" fica nela (o dinheiro não volta a saldo a favor) | coerente com "só o dinheiro livre corre" (§5.2); é decisão de desenho | dono decide; se mudar, regra TS + SQL + caso dourado |
| `registrarRecebimento`, `receberSaldo`, `registrarRecebimentoSchema` e as frases `colunaDepois`/`saldoMudou` ("clique em Receber") ficaram sem consumidor; as funções ainda gravam `pago` | remoção mexe em 5 arquivos de teste e no contador da varredura | limpeza logo após a integração (code-health) |
| "De quem?" lista só pessoas ativas; editar receita vinculada a pessoa inativa mostra o seletor vazio (o vínculo é mantido no envio) | proposta do §11.5 não implementada | backlog — `getPeopleForSelect` com a pessoa vinculada |
| O sino continua por recebível, não por pessoa | muda contagem e chaves de dedupe (§11.4) | backlog |
| Pessoa inativa como filtro do Relatório | fora do escopo (§11.5) | backlog |

### 13.6 Invariante nova (para quem integrar copiar onde couber — DV-5 proíbe editar CLAUDE.md aqui)

> **O reembolso vinculado É a receita.** `transactions.reembolso_pessoa_id` + `status = 'recebido'`
> é o pagamento da pessoa; a parte dela é `amount − coalesce(valor_pessoal, 0)`. As alocações
> automáticas (`receivable_receipts.transaction_id` preenchido) são mantidas SÓ pelo banco
> (`realocar_reembolsos_da_pessoa`, triggers de instrução em `transactions` e `receivables`, pausa
> por GUC dentro de `salvar_lancamento`), e o desfazer de recebimento manual chama a mesma função.
> Nenhum código grava `receivables.status` por causa disso; o saldo a favor é derivado, nunca
> gravado; só recebimento MANUAL protege a divisão e conta em "Reembolsos recebidos" na base caixa.
> A regra existe em TS (`reembolso.ts`) para a prévia e é provada igual à do SQL pelos mesmos casos
> dourados (`reembolso-casos.ts` × `verificar-reembolso.sql`) — mexeu numa, mexa na outra.
