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
