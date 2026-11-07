# STATUS

**Atualizado:** 2026-11-07
**Fase atual:** REDESIGN-00 ✅ · D6–D11 ✅ · REDESIGN-01 ✅ · **visual e dicionário APROVADOS
por você em 2026-09-20** · **REDESIGN-02-A ✅ · REDESIGN-02-B ✅ · REDESIGN-02-C ✅ ·
REDESIGN-02-D ✅ · REDESIGN-02-E ✅** — **a REDESIGN-02 está fechada** · **`R4` FECHADO**
(trabalho de outro chat, revisado e integrado aqui em `1b5aa28`) · **REDESIGN-03-A ✅**
(`02aa54b`, integrada por merge `--no-ff`) · **REDESIGN-03-B ✅** (integrada por merge
`--no-ff` em `ad9f359`) · **REDESIGN-03-B2 ✅** (integrada por merge `--no-ff` em `b06f160`)
· **REDESIGN-03-C ✅** (integrada por merge `--no-ff` em `22ec12f`) · **REDESIGN-03-C2 ✅**
(integrada por merge `--no-ff` em `31bef87`, **com a M3 aplicada**) · **REDESIGN-03-D ✅**
(integrada por merge `--no-ff` em `545acf4`, **com a M1 aplicada**) · **REDESIGN-07 (A–D) ✅**
(integrada por merge `--no-ff` em `598b475`, sem migration) · **REDESIGN-03-E ✅** (integrada
por merge `--no-ff` em `de6ef19`, **com a M2 e a M2b aplicadas**) · **REDESIGN-03-F ✅**
(integrada por merge `--no-ff` em `84bf87b`, **com a M-F aplicada**) · **REDESIGN-03-G ✅**
(integrada por merge `--no-ff` em `6c158e9`, sem migration; `main` trazida em `a8537d6`) ·
**REDESIGN-03-G2 ✅** (integrada por merge `--no-ff` em `a70c541`, **com a migration
`salvar_lancamento_atomico` aplicada por você no SQL editor**) — **a REDESIGN-03 está fechada,
com exceções declaradas** · **REDESIGN-04-A ✅** (integrada por merge `--no-ff` em `a972712`,
sem migration, **sem push** — D67) · **REDESIGN-05-A ✅** (integrada por merge `--no-ff` em
`6cfa3b9`, sem migration, **sem push** — D67) · **REDESIGN-05-B ✅** (integrada por merge
`--no-ff` em `bae44af`, sem migration, **sem push** — D67) · **REDESIGN-05-C ✅** (integrada
por merge `--no-ff` em `30964b8`, sem migration, **sem push** — D67) — **a REDESIGN-05 está
fechada** · **REDESIGN-04-A2 ✅** (integrada por merge `--no-ff` em `d5fb873`, sem
migration, **sem push** — D67) · **REDESIGN-06 ✅** (integrada por merge `--no-ff` em
`9915d99`, sem migration, **sem push** — D67) — **o Dashboard geral está no visual do print 2**
· **REDESIGN-04-B ✅** (integrada por merge `--no-ff` em `e4b8aa8`, sem
migration, **sem push** — D67) — **todo número do Painel e do Relatório abre os registros que o
explicam** · **REDESIGN-04-C ✅** (integrada por merge `--no-ff` em `86d850a`, **com a M1, a M2 e
a M3 aplicadas**, **sem push** — D67) — **a REDESIGN-04 está fechada** · **REDESIGN-08 ✅**
(regressão e entrega, sem migration, **sem push** — D67) — **🟢 O REDESIGN ESTÁ FECHADO** · próximo:
o merge do **PR único #65**, a seu pedido (ou a 09 — vidro — antes dele, como você decidiu em 2026-11-07)

⛔ **A M-F foi aplicada em 2026-10-21** (03-F), pelo MCP, depois do seu "Aplique" literal, numa
mensagem só para isso (D63). Ela **não** estava no `MIGRATIONS.md`: nasceu da K0 da 03-F, com o
SQL aprovado no desenho — duas funções (`pagar_fatura`, `desfazer_pagamento_fatura`), nenhuma
tabela, coluna, policy, índice ou dado.

⛔ **A M2 e a M2b foram aplicadas em 2026-10-18** (03-E), pelo MCP, cada uma depois do seu
"aplique a M2" / "aplique a M2b" literal, em mensagens separadas (D61). A M1 foi aplicada em
2026-10-12 (03-D) **pelo SQL Editor** (D55); a M3 em 2026-10-11 (03-C2), pelo MCP (D50). As
quatro migrations previstas no `MIGRATIONS.md` estão aplicadas; **a M2b não estava lá** — nasceu
da K1 da 03-E, com o SQL aprovado no desenho. Nenhuma migration nova sem um "aplique" seu.

🚀 **De 00 a 03-C2 foi para produção pelo PR #56** (D54, mergeado em 2026-10-12). A regra do
plano mudou por decisão sua em 2026-10-11: as subfases fechadas são publicadas **por partes**,
cada uma por PR, em vez de esperar a 08. **A 03-D vai pelo PR #57** (D60), com o seu aval
para o push e o PR; o merge em `main` é seu. **A REDESIGN-07 (A–D) foi integrada em
`598b475`** e foi a `main` pelo PR #58. **A 03-E vai a `main` por PR próprio, com o seu aval
explícito para push, PR **e** merge** ("Pode subir para o git em uma branch, fazer pr e merge",
D62). **A 03-F vai a `main` por PR só com o seu aval explícito para o push e o PR** — o merge
em `main` é produção. **A 03-G foi a `main` por PR, com o seu aval para PR **e** merge** ("Pode
fazer pr e merge no git", D64). **A 03-G2 vai a `main` por PR, com o seu aval para o push e o
PR** ("faz o pr e tudo mais dessa no git", D66) — **o merge em `main` é seu**.

⛔ **A partir de 2026-11-02 a publicação por partes ACABOU (D67, por custo da Vercel).** As
próximas fases se acumulam em `feat/redesign-00-auditoria` **sem push** e vão a `main` num
**PR único**, com **um merge só**, quando você pedir. O PR #65 (03-G2) fica aberto e é esse PR.

---

## REDESIGN-08 — regressão e entrega ✅ (o redesign fecha)

Branch `feat/redesign-08-entrega`, nascida de `42af6c3` (a ponta com a 04-B e a 04-C), executada em
`C:/tmp/08-entrega`. Desenho `docs/superpowers/specs/2026-11-06-08-regressao-e-entrega-design.md`
(**§13 com o resultado inteiro**) e plano `docs/superpowers/plans/2026-11-06-08-regressao-e-entrega.md`.
Sem funcionalidade nova e **sem migration**.

**Consertos (9, um commit cada, teste vermelho antes, mutação conferida):** C1 fechar a gaveta volta no
histórico · C2 abrir a gaveta não rola a página · C3 "Tentar de novo" do Dashboard preserva o período ·
C4 contagem e data não somem com o olho · K1 mês além da janela diz "fora do período lido", nunca
R$ 0,00 · K2 cartão desativado sem fatura prevista · K7 aba Cartões de `/relatorios` sem prevista como
R$ 0,00 · C5.1 contraste da face do cartão · C5.2 leitura textual dos quatro gráficos (tabela oculta). Mais **R1**, achado médio da revisão final (Opus, nada crítico nem alto): a tabela oculta das barras dizia
R$ 0,00 nos meses além da janela lida; agora diz "fora do período lido" (`a6189a6`).
**A C5.2 criou uma regressão e a própria fase a pegou:** `sr-only` direto num `<table>` alargava o
Painel para 713 px numa janela de 490; corrigida em `737c501` (a tabela vai dentro de um `div`).

**Conferido por leitura e no navegador, com a sua sessão:** 88 gavetas (Painel e Relatório, duas bases)
com 0 diferenças; responsabilidade e recortes sem erro (recortes com cobertura fraca); 14 rotas × 5
larguras sem rolagem horizontal; prints do Painel em claro e escuro; nenhum controle sem nome; contraste
medido (os abaixo de AA são do app original ou da casca, para o backlog). **Os fluxos que gravam NÃO
rodaram no banco real, por decisão sua (opção b, 2026-11-07):** ficam conferidos pela suíte e pela leitura.

**Provado na ponta (`a6189a6`, com o conserto da revisão):** `test:run` **368 / 8.285** · `lint` · `tsc` · `build` ·
`perf:bundle` (mediana **202,8 KB**, 71 rotas, todas ≤ 250, nenhuma com teto próprio; `main` era 201,9) ·
`TZ=UTC npx vitest run` **368 / 8.285** ✅. md5 dos saldos **`15d93bd1c1d3e55a40db6210dff0eb3b`** no
início e no fim. Cresceram ≥ 5 KB desde `main`: `/relatorios` +11,6, `/dashboard/financeiro` +9,5,
`/faturas` +6,8, `/dashboard` +5,2, `/parcelamentos` +5,0 (as peças comuns do painel); `/cartoes` −17,4.

**Entregues para você:** `docs/redesign/PR-65.md` (o texto do PR, **o GitHub não foi editado**) e
`docs/redesign/REVERSAO.md` (revert por PR, Instant Rollback, e o que **não** reverte: as quatro
migrations e os triggers da 04-C). A invariante da 04-C (§13.6) foi copiada para o `CLAUDE.md`, e a
invariante 91 deixou de citar o teto de 285 KB que não existe mais.

**Pendências declaradas** (§13.5 do desenho): contraste fora do PR; K1 só nos três indicadores;
seta de camada invertida em `leitura-dos-graficos.ts`; caracteres de controle em `painel.test.ts:261`;
K3/K4/K5/K6 adiadas; o backlog do §4.3 e as conferências do §4.4, listados no `PR-65.md`.

---

## REDESIGN-04-C — o reembolso abate sozinho o que a pessoa deve ✅ (a 04 fecha)

Branch `feat/redesign-04c-reembolso-impl`, nascida de `a034bb8` (21 commits), integrada por merge
`--no-ff` em **`86d850a`**, **local e sem push** (D67). A branch do desenho e do plano
(`feat/redesign-04c-reembolso`, `264aa8d`) entrou por cherry-pick na de implementação e foi
registrada em seguida com `-s ours` (`6f12137`), só para as duas pontas serem ancestrais. O
desenho é `docs/superpowers/specs/2026-10-25-reembolso-de-terceiros-design.md` (o §11 reconcilia
com o código de 2026-11-02; o **§13 tem o resultado inteiro**, as decisões com custo e a invariante
nova) e o plano é `docs/superpowers/plans/2026-10-25-04c-reembolso-de-terceiros.md` (9 tarefas TDD).

**O que mudou.** Uma receita marcada como de uma pessoa (`transactions.reembolso_pessoa_id`,
status `recebido`) **é** o pagamento dela e abate sozinha o que ela deve, da dívida mais antiga
para a mais nova, parcelas futuras incluídas, com pagamento parcial. Quando passa do que ela deve,
o dono escolhe — sem padrão — se a sobra é **receita dele** ou **saldo a favor** da pessoa (que
abate sozinho as próximas compras divididas). O lançamento ganha "De quem?" e a prévia
("deve R$ X → passa a dever R$ Y"); a importação do extrato ganha o mesmo por linha, com a prévia
em sequência por pessoa. `/terceiros` vira **uma ficha por pessoa**: o total que deve (igual ao
do Painel, por teste — RR-D-21), o saldo a favor, e Em aberto (sem chip de parcial), Pagamentos
(as receitas vinculadas), Pagos e Não será cobrado. **Saem** o Receber, o receber em massa e o
diálogo de registrar recebimento. Na base caixa, o reembolso entra **uma vez** (RR7, K2, RR-E-4).

**Banco.** Três migrations, aplicadas com o seu "aplique": **M1** (o vínculo, FKs compostas,
colunas da revisão da importação) pelo MCP; **M2** (`realocar_reembolsos_da_pessoa` + 6 triggers
de instrução em `transactions` e `receivables`) e **M3** (`salvar_lancamento` com a pausa por
GUC) **por você no SQL Editor** (o MCP recusou). Nenhuma escreve `receivables.status`; o saldo a
favor é derivado. md5 dos saldos **`15d93bd1…` antes e depois de cada migration** e no fim. Os
casos dourados rodaram **nos dois lados**: Vitest (`reembolso-casos.ts`) e o banco
(`scripts/finance/verificar-reembolso.sql`, em `begin … rollback`, rodado por você: "todos os
casos conferem").

**Provado na ponta:** `test:run` **364 / 8.201**, `lint`, `tsc`, `build` e `perf:bundle` verdes
(`/financeiro/lancamentos` 212,9 → **214,9 KB**, `/importar` 203,1 → **206,3**, `/terceiros`
210,5 → **210,6**, `/relatorios` 208,0 → **208,1**, `/dashboard/financeiro` **203,2** igual;
mediana 202,7); `TZ=UTC` em finance, reports e import: 1.824 ✅; conciliações da 04-A, 04-A2 e
04-B verdes sem mudar número. Mutação confirmada em toda regra nova. Conferência visual **com a sua
sessão** (harness de iframes): nenhuma rolagem horizontal nas 4 telas × 4 larguras; ficha por
pessoa, formulário, prévia e caixa vistos em claro e escuro. Ela achou **um defeito, corrigido**
(`5c27911`): trocar o tipo para receita levava o status "Pago" da despesa, e a realocação só conta
`recebido`. Revisão final (Opus): nada crítico nem alto; o P2 (desfazer recebimento manual não
realocava) e três P3 corrigidos com teste (`3293037`).

**Na integração:** sem conflito (a ponta nasceu de `a034bb8`, a ponta desta branch); a árvore
integrada é **idêntica** à da ponta. Os cinco comandos na árvore integrada: `test:run` **364 /
8.201** com **1 falha de ambiente** (`ai/approval/schema.test.ts`, CRLF nas migrations desta
worktree — a mesma das integrações anteriores; o merge não toca `src/lib/ai/`) · `lint` ✅ · `tsc`
✅ · `build` ✅ · `perf:bundle` ✅.

**Pendências declaradas** (não consertadas, com destino no §13.5 do desenho): deadlock plausível
entre duas edições simultâneas de despesas divididas com a mesma pessoa (migration que ordena o
lock em `salvar_lancamento`); alocação parcial numa dívida depois perdoada fica nela (decisão sua);
`registrarRecebimento`/`receberSaldo` e as frases "clique em Receber" sem consumidor (limpeza); "De
quem?" sem a pessoa vinculada inativa; o sino continua por recebível; o diálogo de reembolso da
importação **não foi visto** no navegador (nenhum lote de extrato com receita em revisão). ⚠️ **A
invariante nova está no §13.6 do desenho e NÃO foi copiada para o `CLAUDE.md`** — nesta fase você
proibiu editá-lo; copie quando quiser.

---

## REDESIGN-04-B — cada número abre os registros que o explicam ✅

Branch `feat/redesign-04b-detalhamento`, nascida de `0f1358f` (17 commits), integrada por merge
`--no-ff` em **`e4b8aa8`**, **local e sem push** (D67). O desenho é
`docs/superpowers/specs/2026-11-02-04b-detalhamento-design.md` (o §13 tem o resultado inteiro) e o
plano é `docs/superpowers/plans/2026-11-02-04b-detalhamento.md` (7 tarefas TDD). Prévia aprovada
em 2026-11-02. **Sem migration.**

**O que mudou.** Todo indicador e todo bloco numérico de `/dashboard/financeiro` e da aba
Financeiro de `/relatorios` ganhou "Ver registros ›". Ele abre uma **gaveta sob demanda**
(`?detalhe=<chave>&parte=&alvo=`, link compartilhável; de baixo no celular, à direita do `sm`
para cima) com os registros, **com os mesmos filtros da tela** (mês, base, responsabilidade e
recortes). O total é o número do motor e a lista sai dos **classificadores do próprio motor**
(`detalheDoNumero`, puro, em `finance/detalhe.ts`); o rodapé declara "= total" ou a diferença com
o valor. Cada registro mostra a coluna que concilia e as outras partes só quando dizem algo
(meu × bruto × terceiros); cartão agrupado por fatura; marcas de **previsto**, **data
aproximada** (`liquidado_em` nulo), **estorno**, **parcela k/N** e **projetado** (projeção nunca
na gaveta do realizado). Estados distintos: **vazio** ("nenhum registro", nunca R$ 0,00),
**falha**, **não segue** (sem lista falsa) e **parcial** (teto de 300, com aviso). O olho alcança
a gaveta pelo contexto (`useOlhoDosValores`), porque ela vive num portal. **D-A2-6 decidida:** o
caixa abre sem recorte; com recorte continua "não segue". Gráficos não abrem registros (D-B-17).
Saldo abre por conta (`lerSaldoAte` por conta) e o rodapé dele leva às Contas — o atalho saiu do
indicador, onde espremia o rótulo.

**Provado na ponta:** `test:run` **348 / 7.845**, `lint`, `tsc`, `build` e `perf:bundle` verdes
(`/dashboard/financeiro` 201,8 → **203,0 KB**, `/relatorios` 206,8 → **207,8 KB**; a gaveta fica
fora do manifest); `TZ=UTC` em finance e reports: 1.452 ✅. Conciliação em **três lados**
(registros × agregador × literal à mão), com mutações confirmadas por tarefa. md5 dos saldos igual
à linha de base (`15d93bd1…`) no início e no fim. Conferência visual **com a sua sessão**,
390/768/1280/1440, claro e escuro, Painel e Relatório (harness de iframes): todo número com
registros fechou "= total" com dado real, nenhuma diferença apareceu, e ela achou dois defeitos,
corrigidos com teste (parcela sem descrição → "Compra parcelada", como em Faturas; o rótulo do
saldo espremido). Revisão final (Opus): nada crítico nem alto; cinco de seis achados corrigidos
com teste (pendente do mês com recorte de pessoa, mês além da janela lida, "minha parte R$ 0,00",
foco ao fechar, comentário).

**Na integração:** dois conflitos, em `financial-dashboard-client.tsx` e
`relatorios-client.tsx` — a 06 tinha movido `INDICADOR_PEQUENO_NO_CELULAR` para a peça comum; a
cópia local da 04-B saiu. Os cinco comandos na árvore integrada: `test:run` **359 / 7.968** com
**1 falha de ambiente** (`ai/approval/schema.test.ts`: as migrations desta worktree têm CRLF no
checkout; o merge não toca `supabase/` nem `src/lib/ai/`, e a suíte passa inteira na worktree da
04-B, sem CRLF) · `lint` ✅ · `tsc` ✅ · `build` ✅ · `perf:bundle` ✅; `TZ=UTC` em finance e
reports: 1.456 ✅.

**Pendências declaradas** (não consertadas, com destino no §13 do desenho): num mês além da
janela lida (+5 meses) o **indicador** ainda mostra R$ 0,00 — anterior à 04-B; a gaveta já
declara a falha (decisão sua: limitar o seletor de mês ou ampliar a janela); o `Link` do
`Indicador` sem `scroll={false}` (a peça é usada por outras três telas para mudar de rota);
fechar a gaveta deixa uma entrada repetida no histórico; "Faturas dos próximos meses" do
Relatório sem detalhamento (o modelo agrega por mês, sem id de fatura).

---

## REDESIGN-06 — o Dashboard geral no visual do print 2 ✅

Branch `feat/redesign-06-dashboard`, nascida de `30964b8` (21 commits), integrada por merge
`--no-ff` em **`9915d99`**, **local e sem push** (D67). O desenho é
`docs/superpowers/specs/2026-11-02-06-dashboard-geral-design.md` e o plano é
`docs/superpowers/plans/2026-11-02-06-dashboard-geral.md` (13 tarefas TDD). Prévia aprovada em
2026-11-02. **Sem migration.**

**O que mudou.** `/dashboard` ganhou o banner (saudação, frase do dia), a faixa **Resumo
financeiro** (Saldo das contas em DD/MM com o olho, Minhas entradas, Minhas saídas, Total em
cartões) e a anatomia do print nos 11 cards: ícone em quadrado, subtítulo ("hoje, seg 02/11"
nos cards de hoje), quadros e "Ver mais ›". A faixa e o card Financeiro saem de **uma** leitura
(`lerResumoDoDashboard`, com `cache`): o mês e um histórico de 6 meses só com transações, em
duas leituras, para o teto de 2.000 não cortar o mês corrente (D-06-M4). O card Financeiro mostra
"Realmente meu" e as barras de 6 meses; Treinos ganhou as barras da semana **sem vermelho**
(invariante 22); Hábitos, o anel do dia, e a água deixou de ter "+" (nenhum clique em card
escreve). **Cada bloco tem o seu limite de erro** (`LimiteDoBloco`, `catchError` do Next 16.4,
"Tentar de novo" relê antes de zerar). Fechados: **F3** (alternância de visão com
`aria-pressed`), **R7** (salvar a ordem não grava mais o período da URL; "Período padrão" no
Personalizar), **D15** (a rosca dobra em "Outros (N categorias)" acima de 8) e o card de
Notificações deixou de mostrar "Em breve" quando a leitura falha (D-06-M5). Desvios do print no
§6 de `REFERENCIA-VISUAL.md`, linhas "(06)". Peça comum tocada: só `shared/painel/indicador.tsx`
(passou a exportar `INDICADOR_PEQUENO_NO_CELULAR`).

**Provado na ponta:** `test:run` **342 / 7.511**, `lint`, `tsc`, `build` e `perf:bundle`
verdes (`/dashboard` **198,9 KB**, `/configuracoes` **197,5 KB**); `TZ=UTC` nos arquivos novos:
253 testes. Conferência visual **com a sua sessão**, 390/768/1280/1440, claro e escuro, sem
rolagem horizontal; contraste do banner 5,6:1 (claro) e 8,7:1 (escuro); erro provocado no card de
Estudos ficou isolado nele (revertido sem commit). Ela achou três defeitos — dinheiro quebrado em
4 colunas num terço da grade (`@container` + `@[26rem]`), "Ver mais" fora do cabeçalho
(`CardHeader` é `grid`) e barra "a seguir" invisível no escuro —, todos com teste. Revisão final
(Opus): nada grave; cinco achados corrigidos com teste (histórico parcial também na faixa,
notificações com não lidas e lista vazia, descanso passado no Treinos, layout salvo `custom`,
`PGRST205`).

**Na integração:** um conflito, em `entradas-do-card.test.ts` — a 04-A2 tirou o relatório de
`apresentarEntradas` e a 06 tirou o card; as duas provas ficam, e nenhuma tela usa mais a função.
Depois do merge, `relatorios-client.tsx` passou a importar `INDICADOR_PEQUENO_NO_CELULAR` da peça
comum em vez da cópia que a 04-A2 tinha (`6bac81b`). Os cinco comandos na árvore integrada:
`test:run` **351 / 7.759** ✅ · `lint` ✅ · `tsc` ✅ · `build` ✅ · `perf:bundle` ✅ (71 rotas
dentro); `TZ=UTC` em dashboard, painel, finance e components/dashboard: 1.467 ✅.

**Pendências declaradas** (não consertadas): o "Tentar de novo" do `CardSemLeitura` aponta para
`/dashboard` sem o `?periodo` (padrão herdado da 03-G); uma edição de mês de lançamento
exatamente entre as duas leituras derruba faixa e card juntos no limite de erro (a nova tentativa
resolve); `apresentarEntradas` ficou sem consumidor (limpeza); RF4 do plano (semana começando no
domingo) só é testado na função pura, não em `getTrainingCardData`; uma rodada da suíte teve 1
falha intermitente não identificada, que não se repetiu em três rodadas.

---

## REDESIGN-04-A2 — o Relatório financeiro com as peças da 04-A ✅

Branch `feat/redesign-04a2-relatorio`, nascida de `9342fbb` (21 commits), integrada por merge
`--no-ff` em **`d5fb873`**, **local e sem push** (D67). O contrato, com o resultado no §13, é
`docs/superpowers/specs/2026-11-02-04a2-relatorio-financeiro-design.md`, e o plano é
`docs/superpowers/plans/2026-11-02-04a2-relatorio-financeiro.md`. Prévia aprovada em 2026-11-02.

**O que mudou de natureza.** A aba Financeiro de `/relatorios` foi reescrita com as peças da 04-A
(Indicador, Bloco, olho, gráficos), **reusadas e nunca copiadas** — há teste proibindo outra
`function Indicador`/`function Bloco` em `src/components/`. Sem banner. A sequência é Resumo →
Evolução → Composição → Detalhamento → Projeções. Uma **barra de filtros na URL** (período, base,
responsabilidade, conta, cartão, pessoa, categoria) recorta os números, e o bloco que um recorte
não alcança mostra o quarto estado, **"não segue"**, com "Ver sem o filtro" (nunca R$ 0,00 nem
vazio). A vista é montada por `montarRelatorioFinanceiro` (`reports/financeiro.ts`, puro), e os
indicadores saem de `indicadoresDoResumo`, **a mesma função do painel**: sem filtro, relatório e
painel conciliam. "Meu × meu" no relatório (RR4/RR5), "parcial" na tela (`AvisoParcial`, comum às
duas telas) e RR-C2-10 (filtro ligado distinguível no escuro) fechados. As outras abas não mudaram,
salvo o seletor de mês que voltou à aba Cartões.

**Provado na ponta:** suíte **7.421** testes, `lint`, `tsc`, `build` e `perf:bundle` verdes
(`/relatorios` 196,7 → **206,6 KB**); `TZ=UTC` em finance + reports: 1.196 testes. Mutações em
cada regra nova. Banco só leitura: **md5 dos saldos igual** (`15d93bd1…`). Conferência visual
**com a sua sessão**: 390 e 1280 px com captura, claro e escuro, olho fechado; **768 e 1440 só por
medição do DOM** (a janela do Chrome não redimensionou) — sem rolagem horizontal, sem valor
cortado. Ela achou o título do `Bloco` cortado a 390 px (valia para o painel) e foi corrigido.
Revisão final da branch inteira (Opus): nenhum número errado; sete defeitos de apresentação
corrigidos (R1–R9), cada um com teste vermelho antes.

**Na integração:** dois conflitos, ambos de peças comuns — `indicador.tsx` (a variante
`{ ausente }` da 05-B e a `{ naoSegue }` daqui convivem) e a aba Cartões de `relatorios-client.tsx`
(fica a da 05-C, com o mês da barra). E um conflito **semântico**: o `Bloco` local da Visão geral
(05-A) virou `BlocoDaCentral`, porque o inventário daqui proíbe outra `function Bloco`. Depois do
merge: `lint` ✅ · `tsc` ✅ · `build` ✅ · `perf:bundle` ✅ (mediana **202,0**, 71 rotas dentro) ·
`test:run` **340 / 7.636**, 7.635 ✅ e 1 ❌ — a de ambiente (`approval/schema.test.ts`, CRLF).

**Leitura a conferir (R6, §13.4):** na base caixa, só os blocos lidos do caixa deixam de seguir o
recorte; saldo, pendente, assinaturas, projeção e faturas futuras seguem a matriz da competência.
Se você queria "caixa = nenhum recorte em nada", diga.

**Achados não consertados** (§13.5): o JSON exportado mudou de forma (→ 04-D); falha ao ler as
opções de categoria/pessoa derruba `/relatorios` inteiro; pessoa inativa não é opção de filtro
(→ 04-C); o olho não esconde os gráficos (→ 06 ou subfase do olho); a conciliação passa pela mesma
função nos dois lados. Não é "zero bugs".

---

## REDESIGN-05-C — Próximos meses, Parcelamentos e Relatórios de cartão ✅ (a 05 fecha)

Branch `feat/redesign-05c-proximos-meses`, nascida de `7171b89` (14 commits), integrada por merge
`--no-ff` em **`30964b8`**, **local e sem push** (D67). A árvore integrada é **igual** à da ponta
(`851ed79`). O contrato é `docs/superpowers/specs/2026-11-02-05c-proximos-meses-design.md` e o
plano `docs/superpowers/plans/2026-11-02-05c-proximos-meses.md`. Prévia aprovada em 2026-11-02
(`.superpowers/preview/previa-05c.html`, fora do git), com a grade transposta.

**O que mudou de natureza.** Duas telas novas na central, sem migration:
- **`/cartoes/proximos-meses`**: grade com meses nas linhas e cartões nas colunas, e um bloco
  por mês abaixo de 768 px. O horizonte vem escrito, com 3, 6 ou 12 meses ("novembro de 2026 a
  abril de 2027 · 5 cartões"). Seis estados de célula: real, paga, zero medido, prevista ("sem
  lançamentos conhecidos", sem R$), "fechou sem lançamentos" e "não projeta" (desativado). O
  "Total conhecido" é parcial quando falta algum cartão, e a coluna fica fixa à direita. Há uma
  faixa para as atrasadas que ficam antes do horizonte.
- **`/cartoes/relatorios`**: base (competência × vencimento) e período (6 ou 12 meses) escritos,
  três indicadores, gráfico, "Por cartão", "Mês a mês" e CSV. Tudo sai de `faturasPorMes`. Mês
  sem fatura é `null`, e a tela diz "sem fatura neste mês", não R$ 0,00.

Lógica pura em `finance/proximos-meses.ts`, `relatorio-de-cartao.ts` e `parcelamentos-blocos.ts`.

As telas que já existiam:
- **`/parcelamentos`** passou para as peças comuns (indicadores, blocos, olho). As regras, as
  ações e a URL não mudaram.
- **`/faturas`** mostra a prevista de **qualquer** mês futuro pedido na URL, com teto de 24
  ciclos, e cartão desativado não ganha prevista. Ganhou o olho; o diálogo de pagamento continua
  mostrando o valor.
- **A aba Cartões de `/relatorios`** diz "Próximos 6 ciclos de cada cartão · N cartões", com um
  link para o relatório novo (edição pontual, nenhum número mudou).

A navegação da central segue o `NAVEGACAO.md` §4.

**Efeito declarado:** um link `/faturas?card=X&month=<mês futuro distante>` agora mostra a
prevista, onde antes dizia "Nenhuma fatura encontrada".

**Provado:**
- Suíte **331 / 7.390**, com `lint`, `tsc`, `build` e `perf:bundle` verdes, na ponta e na árvore
  integrada (`822c1bb`). Mediana 202,3 KB, 71 rotas; a mais pesada é `/todo`, com 227,3 KB.
- `TZ=UTC` nos arquivos novos: 97 testes. A T3 e a T7 foram conferidas por mutação, com 5
  vermelhos cada.
- Conferência visual **com a sua sessão**, em 390/768/1280/1440, claro e escuro, sem rolagem
  horizontal. A projeção não aparece como R$ 0,00: 24 células previstas dizem "sem lançamentos
  conhecidos".
- A revisão final da branch achou quatro achados menores, todos corrigidos.

**Limitações:** os seus cartões não têm hoje fatura paga, zero medido, crédito nem cartão
desativado no horizonte. Esses estados estão provados por teste e pela prévia, não por print
real. Os prints de 1280/1440 são reduzidos (iframes numa janela de 1280×609).

**Pendências:**
- Com o olho fechado, a contagem "Parcelamentos ativos" também vira "R$ ••••" (o `Indicador`
  esconde todo valor).
- O olho ainda não está na Visão geral nem em Meus cartões.
- `proximas6Faturas` ainda projeta cartão inativo no painel e na aba de `/relatorios`.
- O rótulo "Faturas" na IA e na busca.
- **A 04-A2 também edita `relatorios-client.tsx`:** quem integrar por último resolve o conflito
  ali e em `src/components/shared/painel/indicador.tsx`. Em 2026-11-02 houve uma tentativa,
  abortada, na worktree de integração.

## REDESIGN-05-B — Faturas e pagamentos ✅

Branch `feat/redesign-05b-faturas`, nascida de `3a1c943` (9 commits), integrada por merge
`--no-ff` em **`bae44af`**, **local e sem push** (D67). A árvore integrada é **igual** à da ponta
(`1d5fefa`). O contrato é `docs/superpowers/specs/2026-11-02-05b-faturas-e-pagamentos-design.md`
e o plano `docs/superpowers/plans/2026-11-02-05b-faturas-e-pagamentos.md`. Prévia aprovada em
2026-11-02 (`.superpowers/preview/previa-05b.html`, fora do git).

**O que mudou de natureza.** `/faturas` virou **"Faturas e pagamentos"** (rótulo da navegação
interna e título; a rota não mudou). As faturas do cartão aparecem em quatro grupos, com a ordem
derivada na leitura (`finance/faturas-do-cartao.ts`, puro): *Precisam de pagamento* (atrasadas
primeiro), *Em aberto*, *Próximas* e *Pagas e anteriores*. Três `Indicador` e quatro `Bloco` da
04-A substituem `StatCard` e o selo antigo; o `Indicador` ganhou a variante `{ ausente }`. **A P1-2
está fechada**: o ciclo sem fatura diz "sem lançamentos conhecidos" no indicador e na lista. O
selo sai de `rotuloDoEstado`, **o mesmo da Visão geral**. A regra do ciclo em aberto virou
`cicloEmAberto` (em `central-cartoes.ts`), usada pelas duas telas. O diálogo de pagamento entra
por `next/dynamic` + `useLazyDialog`, barra o clique duplo por `ref` e traduz a resposta por
`desfechoDoPagamento`: "já estava paga" é aviso ("nada foi debitado de novo"), não erro, e a
resposta perdida diz que tentar de novo é seguro. O desfazer não mudou.

**Efeito declarado:** `/faturas?card=X&month=<competência prevista>` (o link da linha prevista da
Visão geral) agora mostra a prevista. Antes dizia "Nenhuma fatura encontrada".

**Decidido pelo dono (D70, 2026-11-02):** o selo é **idêntico** ao da Visão geral, sem exceção.
A fatura vencida de total zero continua "Atrasada", fora de "Precisam de pagamento" e sem botão.

**Provado:** suíte **323 / 7.265**, `lint`, `tsc`, `build` e `perf:bundle` verdes (mediana
201,3 KB; a rota mais pesada é `/todo`, com 225,9 KB). `TZ=UTC` nos arquivos novos: 101 testes.
Conferência visual **com a sua sessão**, em 390/768/1280/1440, claro e escuro, sem rolagem
horizontal. A fatura atual prevista **não** aparece como R$ 0,00. O deep-link da Visão geral foi
conferido. A revisão final da branch não achou nada crítico; quatro achados menores foram
corrigidos, com teste vermelho antes onde havia regra.

**Limitações:** os seus cartões não têm hoje fatura paga nem zerada. Esses estados estão provados
por teste e pela prévia, não por print real. Nenhum pagamento foi confirmado durante a
conferência.

**Pendências:** o olho dos valores em `/faturas`; o rótulo "Faturas" na IA (`ai/constants.ts`) e na
busca (`search/types.ts`); `/faturas` ainda cria previstas para cartão desativado (a Visão geral
pula); trocar o "Atrasada" da fatura zerada nas duas telas, se você quiser.

## REDESIGN-05-A — a central de cartões: casca, Visão geral e Meus cartões ✅

Branch `feat/redesign-05a-cartoes`, nascida de `2ed5657` (7 commits), integrada por merge
`--no-ff` em **`6cfa3b9`**, **local e sem push** (D67), **sem conflito** com a 04-A, que entrou
antes. O contrato é `docs/superpowers/specs/2026-11-02-05a-central-de-cartoes-design.md` (sem §13
de resultado; o relatório da execução ficou na sessão da fase), e o plano é
`docs/superpowers/plans/2026-11-02-05a-central-de-cartoes.md`.

**O que mudou de natureza.** `/cartoes`, `/faturas` e `/parcelamentos` ganharam um `layout.tsx`
cada, todos montando o **mesmo** `CartoesShell` (um `ModuleShell`, sem sexta navegação). Na
sidebar, os três itens viraram um só, "Cartões e faturas" (`tambem: ["/faturas",
"/parcelamentos"]`). `/cartoes` passou a ser a **Visão geral**, com quatro números no topo e duas
tabelas, "Fechadas — a pagar" e "Em aberto — acumulando". Cada tabela tem uma coluna por
pessoa, e a regra é a de `parteDosTerceirosPorFatura`. O conteúdo antigo de `/cartoes` foi para
`/cartoes/meus` **sem mudança**. **Nenhuma página mudou de lugar**: `/faturas?card=&month=` e
`/parcelamentos` respondem como antes. A Visão geral já separa os cinco estados
(`components/cartoes/estado-da-fatura.ts`), e a linha prevista diz "sem lançamentos conhecidos",
nunca R$ 0,00. Cartão desativado continua em "A pagar" (desativar não quita a dívida), e clicar
numa linha leva a `/faturas`, sem ação financeira. Lógica pura em `finance/central-cartoes.ts`.

**Efeito declarado:** a busca, o aviso `card_limit` e a previsão da IA, que apontam para
`/cartoes`, passam a cair na Visão geral (que tem link para Meus cartões). O "Ir para Cartões" de
`/faturas` e o atalho de `/configuracoes` foram para `/cartoes/meus`.

**Ficou para a 05-B (§12 do desenho):** trocar `StatCard` e selos pelas peças comuns da 04-A,
corrigir a P1-2 em `/faturas` (a projeção ainda aparece como "Fatura atual R$ 0,00") e renomear
a seção "Faturas" para "Faturas e pagamentos". **Para a 05-C:** Próximos meses e Relatórios.

---

## REDESIGN-04-A — o Painel financeiro no visual do print 1 ✅

Branch `feat/redesign-04a-painel`, nascida de `2ed5657` (10 commits), integrada por merge
`--no-ff` em **`a972712`**, **local e sem push** (D67) — a árvore integrada é **igual** à da ponta
(`5fbd9f4`). O contrato, com o resultado no §13, é
`docs/superpowers/specs/2026-11-02-04a-painel-financeiro-design.md`; os desvios do print estão em
`REFERENCIA-VISUAL.md` §6.

**O que mudou de natureza.** O painel passou a abrir pela parte **do dono**: os quatro indicadores
são *Saldo das contas · em DD/MM* (corte no fim de hoje, `account_balance_before`, sem
migration — RR-E-6), *Minhas entradas* (`entradasMeu`, RR4 só no painel — `apresentarEntradas` não
mudou), *Minhas saídas* e *De terceiros*, com setas do mês a mês cortadas no mesmo dia (K7). A
**régua do gasto alto** passou a comparar, no mês em andamento, **até o dia D e sem o cartão**,
no painel **e** no sino (K3, RR-E-7) — mudou o texto do sino e a função mora num arquivo próprio.
As peças comuns (**banner** em Server Component, **indicador**, **bloco**, **olho** por cookie)
nasceram aqui para a 04-A2 e a 06 **reusarem**.

| Item | Entrega | Muda número? |
| --- | --- | --- |
| Núcleo | funções puras do painel (`finance/painel.ts`, `painel/{cor,saudacao,olho,bloco}.ts`) | não |
| K3 | régua do gasto alto até o dia D, sem o cartão (`regua-do-gasto-alto.ts`) | **sim** — o alerta do mês em andamento deixa de comparar mês parcial com meses cheios |
| Leituras | saldo até hoje, últimas transações (sem transferência, sem cancelado) e recebíveis com a pessoa (`ESCOPO_PAINEL`) | não |
| Peças | banner (5,41:1 claro · 8,54:1 escuro, sem JS de cliente), indicador, bloco, olho | não |
| Gráficos | barras de minhas entradas × saídas (mês em andamento hachurado), rosca de categorias (com estornos do cartão e nota do que ficou fora), hachura + "(projetado)" na projeção | não |
| Tela | a ordem do print (§4 do desenho); **os 19 blocos de antes continuam**, conferidos por teste | não |

**Provado:** suíte **320 / 7.175** na ponta (eram 309 / 6.992), `lint`, `tsc`, `build` e
`perf:bundle` verdes (`/dashboard/financeiro` **200,4 KB**, era 194,1; mediana 202,1); `TZ=UTC` em
74 arquivos / 1.193 testes. Mutações em cada regra nova. A conciliação card × gráfico × rosca
incluiu um estorno de cartão e fechou sem ajuste de fórmula. Conferência visual **com a sua
sessão**: 390, 768, 1280 e 2560 px, claro e escuro, competência, caixa e mês futuro — sem rolagem
horizontal, sem valor cortado (1440 px não foi medido à parte). Revisão final da branch inteira:
nenhum crítico; cinco correções, cada uma com teste vermelho antes (mês futuro tratado como
fechado, o olho deixando valores à mostra, cancelado nas últimas transações, indicadores colados
no bloco seguinte, rótulo e valor cortados). Banco só leitura: **md5 dos saldos igual**
(`15d93bd1…`).

⚠️ **Testes antigos reescritos além do previsto no desenho** (sem apagar nenhum): o de Entradas
(`entradas-do-card.test.ts`, que passa a afirmar o indicador do painel) e o do "sem base de
comparação" — os dois afirmavam o layout que a K1 e a K7 substituem.

**Achados não consertados** (§13.5 do desenho, para você decidir): legenda "parcial" sobre as
barras vazias; o olho mudo para leitor de tela e a dica (i) só por `title`; "Próximas faturas" com
até 6 ciclos por cartão; seta de saídas sem cor no caixa em andamento; "em N×" das parceladas;
falha de leitura sem log; `resumoAtual` sem uso em `gerarAlertas`. Não é "zero bugs".

---

## REDESIGN-03-G2 — a escrita que falha deixa de virar "deu certo", e a REDESIGN-03 fecha ✅

Branch `feat/redesign-03g2-escritas`, nascida de `4261e03` (16 commits), integrada por merge
`--no-ff` em **`a70c541`** — a árvore integrada difere da ponta (`dc9e641`) só nos quatro
documentos da D65 (`PLANO`, `README`, `REFERENCIA-VISUAL`, `STATUS`), que estavam nesta branch e
não na de origem. O contrato, com a matriz de fechamento no §12 e o resultado no §13, é
`docs/superpowers/specs/2026-10-25-03g2-escritas-design.md`.

**O que mudou de natureza.** A 03-G fechou a leitura; a 03-G2 fecha a escrita. Salvar um
lançamento (criar, editar, editar a divisão, transferência e pagamento de fatura) e criar uma
compra parcelada viraram **uma transação cada** — as RPCs `salvar_lancamento` e
`criar_compra_parcelada` (`security invoker`, `search_path = ''`). O que não virou RPC ficou
**ordenado para errar para "pode não ter acontecido"**: excluir apaga **antes** de reabrir a
fatura; a recorrência e o commit da importação **reservam antes de inserir** (claim-first, como
o Approval Engine). Erro sem SQLSTATE (queda de rede) **nunca** vira "Nada foi alterado."
(`temSqlstate`, D-G2-25). Excluir em Lançamentos passou a mostrar **o que sai junto** antes de
confirmar (divisão, recebíveis, a fatura que reabre) e recusa o que não pode sair.

| Item | Entrega | Muda número? |
| --- | --- | --- |
| E1 | núcleo puro da linha, da divisão e das três frases de escrita | não |
| E2 | a migration (duas funções, nenhuma tabela, coluna, policy ou dado), aplicada por você no SQL editor depois de um `42601` corrigido | não |
| E3 | lançamento e divisão numa transação (RR6, RR8, RR12, RR11, RR-F-1) | não — salvo o estorno de cartão editado, que deixa de sair da fatura |
| E4 | compra parcelada numa transação; cancelamento de parcelas ordenado | não |
| E5 | excluir apaga antes de reabrir (RR-F-2); a previsão e o diálogo (RR-F-6 / K4) | não |
| E6 | recorrências reservam antes de inserir (S9) — e a revisão final achou e fechou um **lançamento em dobro** depois de queda de rede | não — salvo o dobro, que deixa de acontecer |
| E7 | o commit da importação reserva cada linha; as escritas do lote conferidas (S10, S11, RR-G-8, RR-G-10) | não |
| E8 | varredura das **84** escritas do escopo como teste; 9 exceções, cada uma com contagem `n` | não |
| E9 | o cenário do §9, a conciliação card × lista × gráfico e os itens da matriz sem teste (K5) | não |

**Provado:** as 24 mutações da §6 (Y1–Y24) mais as da migration, do E9b e R1–R5 da revisão
final, cada uma com o nome do teste que cai e a restauração conferida. Revisão final da branch
inteira no modelo mais capaz, sem receber as conclusões do principal: um P0 (o dobro da
recorrência), dois P1/P2 (a exclusão e o cancelamento dizendo "Nada foi alterado." sem SQLSTATE)
e uma regressão (receita com cartão e sem conta), corrigidos em `c46f9fd`. Banco só leitura:
**md5 dos saldos igual** (`15d93bd1…`), nenhuma contagem mudou.

⚠️ **Pendência sua:** a conferência visual do diálogo de exclusão com a previsão e do formulário
do estorno (claro, escuro, 390 px) — o dev server pede login, e a senha não é digitada por mim.

**Fechamento da REDESIGN-03 (K5): cumprida com exceções declaradas.** A matriz do §12 está
preenchida linha a linha; os itens ○ (rótulo do saldo com data, "previsto", ficha por pessoa,
"Pendente ao banco" como rótulo, ausência × zero, hachura da projeção, nota da pizza, entre
outros) ficam **abertos, com destino na REDESIGN-05** — e os que tocam o painel, na 04-A.
Achados novos não consertados: A1–A8 no §13.4 (A1: Lançamentos não soma nem filtra por
responsabilidade → 05). Não é "zero bugs".

---

## REDESIGN-03-G — erro é erro: leitura que falha deixa de virar zero ✅

Branch `feat/redesign-03g-erro-e-erro`, nascida de `5bdeb3f` (18 commits), integrada por merge
`--no-ff` em **`6c158e9`** — a árvore integrada é **idêntica** à da ponta (`dfcc1cd`). Depois,
`origin/main` (PRs #61, gráficos "meus", e #63, dependências) entrou por merge em **`a8537d6`**,
com dois conflitos resolvidos juntando os lados. O contrato, com o resultado da execução no §13,
é `docs/superpowers/specs/2026-10-22-03g-erro-e-erro-design.md`; o plano,
`docs/superpowers/plans/2026-10-25-03g-erro-e-erro.md`.

**O que mudou de natureza.** No financeiro, falha de leitura deixou de ser `[]`/R$ 0,00: toda
leitura passa por um núcleo único (`src/lib/supabase/leitura.ts` — `exigir`, `listaCompleta`,
`listaComTeto`) que **lança `ErroDeLeitura`** com um rótulo nosso (`ROTULOS_DE_LEITURA`), nunca o
texto do banco. Cada consumidor diz o que não leu: a tela por **três limites de erro**
(`(app)/error.tsx`, `financeiro/error.tsx`, `global-error.tsx`); o card do dashboard e o insight
capturando no servidor; a Server Action recusando **antes** de escrever ("…Nada foi alterado.")
ou, depois de já ter escrito, com a frase "pode ter sido gravada em parte"; o Cron **por
família**, com o aviso novo `sistema_verificacao_incompleta`. Lista que alimenta número exige
`count: "exact"` e recusa a saturada (o `max_rows` do PostgREST deixa de cortar em silêncio);
lista que só lista mostra "N de M".

| Item | Entrega | Muda número? |
| --- | --- | --- |
| L0 | núcleo de leitura, as duas frases das actions, harness com `falharLeitura` e `count` | não |
| L1 + L5 | queries do financeiro lançam; `getReceivables` sai (vira `lerRecebiveis`); o caixa devolve `{ ok: false }` também nos recebíveis (RR-E-9) | não — salvo onde o zero era falha |
| L2 | aviso de teto em lançamentos, faturas e importar; `exigirCompleta` em `/financeiro`, `/parcelamentos`, `/terceiros` | não |
| L3 | tela de erro única, **três** limites (sem `src/app/error.tsx` — decisão sua sobre o bundle) | não |
| L4 | cards e insight dizem qual leitura falhou | não |
| L6 | as leituras que decidem escrita em 11 actions e no serviço; o busca-ou-cria da fatura lança antes de criar (D-G21) | não — salvo a conta fixa em dobro e o cartão com histórico excluído, que deixam de acontecer |
| L7 | Cron por família (`familias.ts`), aviso de verificação incompleta, preferência ou dedupe com erro ⇒ nada entregue | não |
| L8 | varredura das **107** leituras do escopo como teste; 5 exceções declaradas | não |

**Provado:** 26 mutações (Z1–Z21 com variantes), cada uma com o nome do teste que cai e a
restauração conferida por `git diff --quiet`; três saíram fracas e duas viraram teste novo (Z4: o
card **chamado**; Z7b: hábito com os registros não lidos). Revisão final da branch no modelo mais
capaz: um achado médio (transferência editada dizia "Nada foi alterado." depois de apagar),
corrigido em `d888c17`. Banco só leitura: **md5 dos saldos igual**; as contagens que mudaram
nasceram todas em 2026-10-22 (§13.4 do contrato).

⚠️ **Pendência sua:** a conferência visual (tela de erro, card sem leitura, aviso de teto) — as
telas exigem sessão, e quebrar o banco para ver o erro está fora. E confirmar que as linhas novas
de 2026-10-22 (100 lançamentos, 95 divisões, 95 recebíveis, 1 fatura) são uso seu.

**Risco residual novo:** RR-G-1 a RR-G-13 no §11/§13.6 do contrato. Com destino na **03-G2**:
RR-G-4 (as 29 escritas que ignoram o erro e a atomicidade), RR-G-8 (estado parcial depois da
frase "pode ter sido gravada em parte") e RR-G-10 (as frases por linha no commit da importação).

---

## REDESIGN-03-F — pagar a fatura acontece uma vez só, e desfazer é uma decisão lida ✅

Branch `feat/redesign-03f-pagamento-fatura`, nascida de `85d9ad1` (9 commits), integrada por merge
`--no-ff` em **`84bf87b`** — a árvore integrada é **idêntica** à da ponta (`5e7e221`). O contrato,
com o resultado da execução no §13, é
`docs/superpowers/specs/2026-10-21-03f-pagamento-fatura-design.md`; o plano,
`docs/superpowers/plans/2026-10-21-03f-pagamento-fatura.md`.

**O que mudou de natureza.** Pagar a fatura deixou de ser três requisições (ler, inserir,
marcar) e passou a ser **uma transação no banco** (RPC `pagar_fatura`, `security invoker`): a
reserva é condicional (`pago_em is null`) sob o lock da linha, e não existe mais a janela entre
inserir a transferência e religá-la à fatura — o estado "transferência debitando a conta sem
fatura apontando" deixou de ser alcançável. O lançamento continua montado **só** por
`montarPagamentoFatura`; o SQL lista os nomes das colunas, espelhados por teste. **Desfazer**
abre um diálogo que lê o pagamento antes (lançamento, conta, valor que volta, data em Brasília),
e a confirmação fica **presa ao lançamento lido** (RPC `desfazer_pagamento_fatura`):
`PAGAMENTO_MUDOU` se ele mudou, `PAGAMENTO_EDITADO` se foi editado em Lançamentos (D-F7).

| Item | Entrega | Muda número? |
| --- | --- | --- |
| M-F | as duas RPCs + tipos (só as duas entradas em `Functions`); D-F12: `pagar_fatura` só cria o que o desfazer aceita apagar, recusa conta que a RLS não mostra e lê o payload só depois da sessão | não |
| A1 | `markStatementPaid` pela RPC (assinatura igual); erro desconhecido diz "recarregue para ver se foi registrado", nunca "falhou"; harness ganha `rpc()`; inventário de escrita ganha a seção das **funções SQL** | não — salvo o lançamento em dobro, que deixou de nascer |
| A2 | `preverDesfazerPagamento` (só leitura) e `markStatementUnpaid(id, lancamentoId)` — **mudança de assinatura (K1)** | não |
| A3 | diálogo lazy de confirmação em `/faturas` (P1-8) | não |
| B2 | data de pagamento futura recusada, mensagem própria no campo, `max={today}` (RR-E-12) | não |

**Provado:** 26 mutações (Y1–Y19 com variantes) derrubando o teste nomeado; prova no banco com
dado sintético (pagar 2× → 1 lançamento e `FATURA_JA_PAGA`; desfazer 2× → 0 e
`FATURA_NAO_PAGA`; as quatro recusas no banco; hash dos saldos igual ao de partida) — ⚠️
**sequencial**, não simultânea: o MCP serializou as chamadas e não há `dblink` (RR-F-8); revisão
final da branch no modelo mais capaz, com quatro achados menores corrigidos (`66de183`).

⚠️ **Pendência sua (D63):** o MCP recusou o `delete` da fatura sintética `[03F-SINT]` (competência
2031-01, aberta, sem itens, sem lançamento, sem efeito em saldo). O SQL de remoção está na entrega
da 03-F; depois dele, a contagem do banco volta a 9 faturas / 0 pagas / 60 lançamentos. E a
**conferência visual** do diálogo (claro, escuro, 390 px) — não havia fatura paga para abri-lo.

**Risco residual novo:** RR-F-1 a RR-F-8 no §12/§13.8 do contrato. Os com destino: **RR-F-1**
(a edição do pagamento em Lançamentos apaga → recria → religa, sem atomicidade), **RR-F-2**
(`deleteTransaction` ignora o erro ao reabrir a fatura) e **RR-F-6** (excluir em Lançamentos não
pede confirmação) → **03-G**.

---

## REDESIGN-03-E — o caixa ganha data, e toda tela diz a base ✅

Branch `feat/redesign-03e-caixa`, nascida de `main` em `7d37305` (19 commits), integrada por merge
`--no-ff` em **`de6ef19`** — a árvore integrada é **idêntica** à da ponta (`319b45f`). O contrato,
com o resultado da execução no §13, é
`docs/superpowers/specs/2026-10-18-03e-caixa-design.md`; o plano,
`docs/superpowers/plans/2026-10-18-03e-caixa.md`.

**O que mudou de natureza.** `transactions.liquidado_em` (M2) separa **quando o dinheiro mexeu**
de **a que mês o lançamento pertence**. A data de caixa é `liquidado_em ?? competence_date`, e a
tela declara quantos estão na data aproximada. **Nada foi preenchido por dedução:** 0 linhas com
a coluna no fim, e o CHECK do banco exige que só lançamento `pago`/`recebido` a tenha.

| Item | Entrega | Muda número? |
| --- | --- | --- |
| A1 | `caixa.ts`: data de caixa, os números do §13.2, aproximados, corte até o dia D | não |
| A2 | M2 + tipos (só as 3 linhas da coluna) | não |
| A3 | quem grava a data (K0): formulário (campo vazio por padrão), pagamento de fatura, extrato importado; o resto nulo. Inventário de escrita congelado por varredura (30 escritas, 8 arquivos) | não |
| A4 | seletor **Caixa realizado × Competência** em `/dashboard/financeiro` e `/relatorios` (`?base=caixa`, competência é o padrão), "Base: competência" no card do `/dashboard`, "pago em DD/MM" no extrato | não |
| B1 | saldo do extrato pela data de caixa: `account_balance_before` (M2b) **e** `daily-balance.ts`, com teste de espelho | efeito hoje: **zero**, provado por hash |
| B2 | setas e "Mês a mês" **até o dia D** no mês em andamento | ⚠️ **sim** — o "vs. mês anterior" de hoje mudou |
| B3 | a nota da sobreposição reembolso × outra entrada de terceiro (RR7) | só nota |

**Provado:** 23 mutações (Z1–Z20) derrubando o teste nomeado; provas com dado sintético no banco
(11 lançamentos marcados, conferidos por SQL e pela tela, removidos, hashes do saldo iguais aos
de partida); revisão final da branch no modelo mais capaz, com dois achados corrigidos.

**Risco residual novo:** RR-E-1 a RR-E-13 no §12 do contrato. Os com destino: RR-E-4
(quanto a sobreposição dobra) → **04-C**; RR-E-6 ("Saldo atual" sem corte de data) e RR-E-7
(régua do gasto alto) → **04-A**; RR-E-9 (`getReceivables` sem teto nem erro visível) → **03-G**.

⚠️ **Achado fora do escopo, não corrigido:** em todos os gráficos de valor em reais o rótulo do
eixo vertical é cortado (`YAxis width={78}` não cabe "R$ 10,5 mil"), anterior à 03-E. Relatado
por você em 2026-10-18; precisa de tarefa própria.

⚠️ **CORREÇÃO (D29): a M3 NÃO é da 03-B.** Este documento afirmava, em dois lugares, que a
`categories.classificacao_padrao` seria pedida na 03-B. Não bate com as outras duas fontes:
o `PLANO.md` descreve a 03-B como *"unificar o pipeline triplicado … **sem mudar número
nenhum**"*, e `MIGRATIONS.md:16` liga a M3 à **D8**, que é a **03-C2**. **A 03-B não precisa
de migration nenhuma.** A primeira a precisar é a 03-C2.

---

## REDESIGN-07 (A–D) — os demais módulos ✅

Os quatro lotes formam uma linha só (07-A ⊂ 07-B ⊂ 07-C ⊂ 07-D), nascida de `704dc66` (03-B),
e entraram juntos por merge `--no-ff` em **`598b475`** (59 commits). O resultado de cada lote
está no contrato dele:

| Lote | Módulos | Contrato |
| --- | --- | --- |
| 07-A | TO-DO, Agenda, Rotinas e tarefas | `docs/superpowers/specs/2026-09-27-07a-organizacao-design.md` |
| 07-B | Hábitos, Estudos | `docs/superpowers/specs/2026-10-11-07b-habitos-estudos-design.md` |
| 07-C | Dieta, Treinos | `docs/superpowers/specs/2026-10-11-07c-dieta-treinos-design.md` |
| 07-D | IA, Configurações, Notificações, Busca | `docs/superpowers/specs/2026-10-11-07d-ia-configuracoes-design.md` |

**Nenhuma migration, nenhuma dependência nova, nenhuma Server Action ou Route Handler novo.** O
merge com a 03-B2, a 03-C, a 03-C2 e a 03-D (82 commits da integração desde a base) não teve
conflito textual.

**Verificado sobre a árvore integrada (`598b475`):** `tsc` ✅ · `lint` ✅ · `test:run` 268
arquivos / 6.368 testes — 6.367 ✅, 1 ❌ (a de ambiente: CRLF em `schema.test.ts`, verde no CI)
· `build` ✅ · `perf:bundle` 68 rotas, mediana 214,2 KB, a maior `/todo` com 239,0, nenhuma acima
de 250 e **nenhuma com teto próprio** (o de `/configuracoes` saiu na 07-D).

⚠️ **O que fica aberto:**
- **RR-D-15** (`finance.get_invoice` da IA também devolve o saldo) foi destinado à 07-D pela
  03-D, mas a 07-D nasceu antes da 03-D e **não o cobriu**. Continua aberto.
- A conferência à mão da 07-D (§13 do contrato) é sua e **não foi feita**; o rodapé "Ver todos
  os resultados" da paleta ficou fora, então aquele item não tem o que conferir.
- A invariante 91 do `CLAUDE.md` ainda cita o teto de 285 de `/configuracoes`, que não existe
  mais. Os demais achados de cada lote estão no contrato dele.

---

## REDESIGN-03-D — o que foi devido e o que voltou passam a ser dois fatos ✅

Branch própria a partir de `17a93e9` (desenho `c1d5c5c`, plano `cde0451` + 33 commits),
integrada por merge `--no-ff` em **`545acf4`**. Contrato:
`docs/superpowers/specs/2026-10-11-03d-recebiveis-design.md` (o §13 é o resultado).
**Segunda subfase com migration: a M1** (`receivable_receipts`), aplicada em 2026-10-12 depois
do seu "aplique a M1" literal — **pelo SQL Editor, não pelo MCP** (D55). Os parâmetros das
quatro assinaturas públicas intactos; o retorno mudou só no aprovado (`perdoado` na B1a, o valor
de `aReceber` na B4).

Até aqui um recebível era `valor` + `status`: "deve R$ 600, pagou R$ 250" era irrepresentável.
A 03-D dá a ele um **histórico de recebimentos** e deriva o estado da **soma** — `parcial`
nunca é gravado (K1), e o `pago` legado sem recebimento é derivado num ponto só, sem backfill
(K0). ⛔ **Nada foi recebido nem reclassificado sozinho:** com o dado de hoje (241 recebíveis,
0 `ignorado`, 0 recebimentos — contado no início e no fim), **nenhum número de tela mudou**.
Muda quando você registrar um recebimento parcial ou decidir não cobrar alguém.

| Item | O que fechou | Muda número? |
| --- | --- | --- |
| A1 | módulo puro `recebimentos.ts` (saldo, estado derivado, legado K0, parte do terceiro, perdoado, os três números) e a varredura por allowlist de quem menciona a tabela | não |
| A2 | a M1 (FK composta com cascade, trigger que trava o excesso com `FOR UPDATE`, RLS + FORCE), tipos com o diff lido — só o bloco da tabela — e a tabela no backup | não (tabela vazia) |
| A3 | uma leitura e uma escrita: registrar, receber o saldo e desfazer **só o último** — recebimento ANTES da coluna ao receber, coluna ANTES do recebimento ao desfazer (K1); o recebimento só registra (K2) | não |
| A4 | proteção única nos cinco pontos de exclusão do F4 — e, depois da revisão final, nos dois que o F4 esqueceu (D57) | não |
| A5/A6 | `/terceiros` com saldo, histórico e o diálogo de registrar; o pipeline entrega `recebido` ao motor | não |
| **B1** | D11: `ignorado` vira despesa sua e aparece como "não será cobrado R$ X"; perdoar um parcial perdoa o saldo (K3-a) | **sim** — efeito hoje: zero |
| **B2** | os dois "A receber" ganham rótulos distintos ("Pendente referente a {mês}" / "Total pendente até DD/MM"), também em `/dashboard/financeiro` e `/relatorios` | só rótulo |
| **B3** | "Reembolsos recebidos" sai dos recebimentos, pela data | **sim** — efeito hoje: zero |
| **B4** | "a receber" vira o **saldo** no motor, no sino e na IA | **sim** — efeito hoje: zero |

**Prova:**
- **`dashboard.test.ts` byte a byte igual** (`git diff --quiet 17a93e9`); a caracterização
  mudou **só** C1–C12, cada um no commit do seu item. ⚠️ O C1 do contrato tinha a aritmética
  errada; o código está certo e o contrato aprovado não foi reescrito.
- **33 mutações do contrato + 6 extras + 9 das correções pós-revisão — todas derrubaram o que
  deviam**, com o nome de cada teste no §13.4 e no §13.9 do contrato e a restauração conferida
  por `git diff --quiet`. ⚠️ Três extras em `perdoadoDoMes` saíram **verdes** na primeira
  rodada — fraqueza real, consertada com teste e refeita.
- **+15 arquivos, +189 casos** (214 / 4.229 → 229 / 4.418).
- Banco no fim (2026-10-12): 241 recebíveis (72 pendente / 0 cobrado / 169 pago / 0 ignorado),
  `receivable_receipts` com 0 linhas, 48 receitas todas `pessoal`, **133 tabelas**, RLS + FORCE
  em todas.
- **Revisão independente da branch inteira**, no modelo mais capaz: "With fixes" — 1 crítico
  (D57) e 4 menores. O crítico e um menor (D58) foram corrigidos com o seu aval, cada um com
  re-revisão restrita (ADDRESSED); os outros três menores viraram risco residual.

⚠️ **Desvios do desenho, declarados (§13.7 do contrato):** a M1 pelo SQL Editor (D55) · a
conferência visual foi dos componentes isolados com o CSS do build, a 390 px, claro e escuro —
**as telas inteiras no app logado não foram conferidas** (a extensão do Chrome não conectou) ·
mais de um commit por passo (pacotes de até 5 arquivos) · três falsos alarmes do gate do
roteador · vários pacotes ficaram no principal (D56).

### Risco residual da 03-D

RR-D-1 a RR-D-10 estão no §12 do contrato; os da execução, no §13.8 e no §13.9.

| # | Risco | Destino |
| --- | --- | --- |
| RR-D-12 | `lerRecebimentos` não olha `error`: numa falha de leitura, `/terceiros`, `/faturas`, `/parcelamentos` e o sino mostram o saldo cheio, sem aviso | **04-C** |
| RR-D-13 | receber numa aba e desfazer noutra pode deixar a coluna `pago` com a soma aberta (conta como em aberto) | aceito |
| RR-D-14 | `RECEIVABLE_OPEN_STATUSES` sem consumidor de produção, com a doc desatualizada | **04-C** |
| RR-D-15 | `finance.get_invoice` da IA também devolve o saldo, e só `get_spending` define o termo | **07-D** |
| RR-D-16 | a barra "N selecionados" de `/terceiros` soma um número híbrido sem rótulo | aceito; **04-C** |
| RR-D-18 | falha da 2ª escrita: o cartão não oferece o "Receber" que a mensagem manda clicar | **04-C** |
| RR-D-20 | `/faturas` e `/parcelamentos` leem todos os recebimentos, com teto e sem aviso | **04-C** |
| RR-D-21 | a soma por pessoa continua dentro das telas, sem teste de comportamento | **04-C** |
| RR5 (03-C) | o `saldo` da evolução continua bruto − bruto | **04-A** |
| RR7 (03-C) | o vínculo do reembolso marcado como receita com o recebível | **04-C** — ⚠️ **aviso para a 03-E:** "Reembolsos recebidos" + "Outras entradas de terceiros" podem contar o mesmo dinheiro duas vezes na base caixa, e a 03-E tem de declarar isso em vez de somar as duas em silêncio |

---

## REDESIGN-03-C2 — a categoria propõe, o lançamento registra ✅

Branch própria a partir de `ade0dd0` (desenho `ae9516d`, plano `70660b5` + 8 commits),
integrada por merge `--no-ff` em **`31bef87`**. Contrato:
`docs/superpowers/specs/2026-10-11-03c2-categorias-design.md` (o §12 é o resultado).
**Primeira subfase com migration: a M3**, aplicada pelo MCP em 2026-10-11 depois do seu
"aplique a M3" literal (D50). Os parâmetros **e os retornos** das quatro assinaturas públicas
intactos; `dashboard.ts`, `pipeline.ts` e o registry da IA sem diff.

A categoria ganhou uma **opinião** (`classificacao_padrao`: nula ou `terceiro`), e a subfase
inteira existe para ela nunca virar fato: ela **preenche** o formulário de uma receita nova e
**peneira** a lista; o lançamento continua registrando no ato (`classificacao` +
`valor_pessoal`, 03-C). ⛔ **Nada foi marcado nem reclassificado sozinho (D10):** a migration
não marca nada, e no fim **zero** categorias estão marcadas — a de terceiros do §1 do
dicionário é você quem marca, pela tela. **Nenhum número de tela nenhuma mudou, com ou sem
marcação.**

| Item | O que fechou | Muda número? |
| --- | --- | --- |
| A1 | a prova da D8 **antes** do primeiro leitor: varredura por **allowlist de arquivos** (nasceu vazia; 9 entradas no fim, cada uma com o motivo) e uma lista `NUNCA` de 17 arquivos — motor, pipeline, serviço, actions de lançamento, importação e registro rápido, relatórios, dashboards, IA e sino | não |
| A2 | regra pura do atalho: só receita (K0), nunca em edição, nunca por cima da escolha do usuário; a sugestão do atalho acompanha a categoria e se desfaz se o tipo virar despesa | não |
| A3 | a M3, com teste do arquivo (CHECK só `pessoal`/`terceiro`, nenhuma escrita), validador, **"aplique a M3"**, MCP e tipos com o diff lido — só as 3 linhas de `categories` | não (coluna nula) |
| A4 | o campo na categoria (só `receita`/`ambos`; virar `despesa` limpa a marcação, com aviso) e a lista **agrupada por tipo**, com selo | não |
| A5 | o atalho no formulário de lançamento, com a dica "Sugerido pela categoria"; **o servidor nunca lê a marcação** (testado no serviço e na action — K2) | não |
| A6 | o filtro "Categorias marcadas como de terceiros" (`?marcadas=1`, só o valor exato), ignorado pelo saldo diário; a lista vazia diz por quê | não |

**Prova:**
- **`dashboard.test.ts` e `dashboard-caracterizacao.test.ts` byte a byte iguais**
  (`git diff --quiet ade0dd0`).
- **16 mutações do desenho + 3 extras — as 19 derrubaram o que deviam**, com o nome de cada
  teste no §12.4 do contrato e a restauração conferida por `git diff --quiet`. A X8 (o motor
  lendo a coluna) caiu no bloco 7 **e** no caso do bloco 6 que recusa `classificacao` no
  motor; a X16 (o motor entrando na allowlist) caiu **só** no caso `NUNCA` — a segunda trava,
  como desenhada.
- **+9 arquivos, +74 casos** (205 / 4.155 → 214 / 4.229).
- Banco no fim igual ao início: 26 categorias (19/6/1), 48 receitas, todas `pessoal`, nenhuma
  com `valor_pessoal`; **0 categorias marcadas**.

⚠️ **Desvios do desenho, declarados (§12.6 do contrato):** a conferência visual foi dos
componentes isolados com o CSS do build, a 390 px, claro e escuro — **as telas inteiras no app
logado não foram conferidas** (a extensão do Chrome não conectou) · o 6a seguiu no principal
depois de o roteador falhar no gate, e dois desvios do 6b foram revertidos (D51) · o vermelho
de `page.test.ts` e da varredura do formulário foi visto pelas mutações, não antes da
implementação.

### Risco residual da 03-C2

| # | Risco | Destino |
| --- | --- | --- |
| RR2 (03-C) | receita que entra pela IA, importação, registro rápido, comprovante, estorno ou recorrência continua nascendo `pessoal` (K2) | **novo destino:** sugestão por linha na revisão da importação, numa subfase futura; os outros caminhos seguem `pessoal`, declarados |
| RR-C2-1 | a varredura é textual: um valor copiado com outro nome passaria | aceito; o bloco 7 e os tipos fechados do motor são a segunda linha |
| RR-C2-2 | `getCategories()` é `select("*")`: a coluna chega em memória ao preview da IA (que só usa id e nome) | aceito |
| RR-C2-3 | erro ao ler as categorias marcadas devolve `[]`, e a frase pode dizer "nenhuma marcada" sem ser verdade | **03-G** |
| RR-C2-4 | numa categoria `ambos` marcada, o filtro traz também as despesas dela | aceito, declarado |
| RR-C2-5 | marcação alterada noutra aba não chega ao formulário aberto | aceito |
| RR-C2-6 | o seletor de categoria oferece todas as categorias para qualquer tipo (anterior) | **04-A** ou subfase de formulário |
| RR-C2-7 | **defeito anterior achado:** toda edição de categoria zera o `sort_order` (D53) | registrado, **não consertado** |
| RR-C2-8 | editar uma receita e trocar para categoria marcada não sugere nada (D10) | aceito, declarado |
| RR-C2-9 | `semComentarios` corta `//` dentro de string | aceito |
| RR-C2-10 | no escuro, o botão do filtro ligado e o desligado diferem pouco (o estado vai em `aria-pressed`) | **04-A** |
| RR-C2-11 | a fiação do atalho no formulário é provada por varredura de texto, não por teste de componente | quando houver teste de componente |

---

## REDESIGN-03-C — a entrada passa a dizer de quem é o dinheiro ✅

Branch própria a partir de `6c8aeab` (desenho `b5d605b` + 9 commits), integrada por merge
`--no-ff` em **`22ec12f`**. Contrato:
`docs/superpowers/specs/2026-10-11-03c-renda-pessoal-design.md`. **Nenhuma migration; os
parâmetros das quatro assinaturas públicas intactos** — o retorno só **ganhou**
`entradasMeu`/`entradasTerceiros`.

Até aqui "receita" era sinônimo de "renda". A 03-C dá a cada receita uma **responsabilidade
gravada no ato** — `pessoal` (`valor_pessoal` nulo), `terceiro` (`0`) ou `compartilhada`
(a minha parte, `0 < parte < valor`) —, sem pessoa e sem recebível, e o motor reparte a
entrada como já repartia a saída. ⛔ **Nada foi reclassificado sozinho (D10):** com o dado de
hoje (48 receitas, todas `pessoal`, nenhuma com `valor_pessoal`, contado no início e no fim),
**nenhum número de tela nenhuma mudou**. Muda quando você reclassificar uma receita, uma a
uma, pela tela.

| Item | O que fechou | Muda número? |
| --- | --- | --- |
| A1 | regra pura `decidirResponsabilidadeDaReceita`: o estado incoerente é **irrepresentável** na saída (união discriminada, travada por `@ts-expect-error`) | não |
| A2 | criar e editar gravam pela A1, com **chaves próprias** no payload (`receita_classificacao`, `receita_minha_parte`) — a `classificacao` do payload continua só da despesa, então importação e IA seguem `pessoal`. Sair de receita zera as duas colunas. A recusa vem **antes** de qualquer escrita, inclusive a por recebível cobrado/pago (A2(b)) | não |
| A3 | o formulário pergunta "de quem é esta entrada?" (componente novo, prévia pela A1) | não |
| A4 | `ResumoMes` ganha `entradasMeu`/`entradasTerceiros` com o mesmo filtro de `entradas`; **a partição fecha** (`entradasMeu + entradasTerceiros === entradas`) e o motor lê só `valor_pessoal` — não conhece `classificacao` nem categoria | não (campos novos) |
| A5 | os retornos e `finance.get_spending` carregam os dois campos; a **descrição no registry mudou no mesmo commit**, com teste | não (campos novos) |
| **B1** | os três cards de Entradas espelham o de Saídas: número **bruto**, e a dica "minha R$ Y · de terceiros R$ X" **só** quando há entrada de terceiros (apresentador único, `entradas-do-card.ts`) | **sim**, por decisão sua — **efeito hoje: zero** |
| B2 | **recusada:** o `saldo` da evolução continua bruto − bruto, congelado em teste e comentado no código | — |

**Prova:**
- **`dashboard.test.ts` não mudou uma linha** (`git diff --quiet 6c8aeab`, 24/24). Na
  caracterização da 03-A, **só** o que foi escrito para virar aqui: os `toEqual` dos blocos
  1–4 ganharam as duas chaves, o bloco 6 foi reescrito e o [5 ⚠️] passou a provar que receita
  `terceiro` não sobe a renda pessoal. Blocos 7–10 idênticos.
- **16 mutações, 16 derrubaram o que deviam**, com o nome de cada teste no §12.2 do contrato e
  a restauração conferida por `git diff --quiet`. A C7 caiu também no `tsc` (TS2578).
- ⚠️ **A C9 (o motor lendo a categoria para repartir a receita) deixou o bloco 7 VERDE** —
  medido: a fixture dele só tem despesa. Quem a pega é um caso novo no bloco 6. O alvo que o
  briefing indicava não pegaria a mutação.
- **+4 arquivos, +56 casos** (201 / 4.099 → 205 / 4.155). Os primeiros testes de
  `criarTransacao` e `updateTransaction` do projeto, sobre um harness Supabase em memória
  (`src/test/supabase-em-memoria.ts`).

⚠️ **Desvios do desenho, declarados:** a A1 passou para **antes** do ramo de transferência
(achado P2 da auditoria, D46) · a conferência visual foi do componente isolado com o CSS do
build, a 390 px, claro e escuro — **o diálogo inteiro no app logado não foi conferido** (a
extensão do Chrome não conectou) · A1, A4 e A5 seguiram no principal depois de o roteador
falhar no gate (D47).

### Risco residual da 03-C

| # | Risco | Destino |
| --- | --- | --- |
| RR1 | o banco não impede receita `terceiro` com `valor_pessoal` nulo — só os dois caminhos da tela guardam isso, pela A1 | CHECK de coerência numa migration futura, a propor |
| RR2 | receita que entra pela IA, importação, registro rápido, comprovante ou recorrência nasce `pessoal` | **03-C2** (a categoria propõe no formulário); os outros caminhos, decisão sua |
| RR3 | o insight do Financeiro não enxerga a separação (indicador novo mudaria a chave de dedupe) | decisão futura |
| RR4 | o número principal de "Entradas" continua bruto; a separação está só na dica | **04-A / 06** |
| RR5 | `saldo` da evolução continua bruto − bruto | depois da **03-D** |
| RR6 | edição despesa → despesa com recebível cobrado/pago ainda grava antes de recusar a divisão | **03-F / 03-G** |
| RR7 | reembolso marcado como receita `terceiro` não tem vínculo com o recebível | **03-D** |
| RR8 / RR14 | se o `update` falhar depois da limpeza, a despesa perde a divisão **e os recebíveis pendentes**, sem a mensagem dizer | **03-G** |
| RR9 | o componente novo pesa no primeiro carregamento de `/financeiro/lancamentos` (+2,2 KB) | aceito, dentro do teto |
| RR10 | na edição, receita sem as chaves `receita_*` vira `pessoal` (latente: o único chamador sempre as manda) | quando surgir um 2º chamador de `updateTransaction` |
| RR11 | editar um estorno de cartão tira ele da fatura — **anterior à 03-C**; o novo é a tela mostrar o seletor nele | **03-G / 05** |
| RR12 | chamada direta à action troca o tipo de uma compra parcelada (a tela não oferece) | **03-F / 03-G** |
| RR13 | valor com 3+ casas decimais: 1 centavo de diferença na borda | fora da lista |

---

## REDESIGN-03-B2 — todo risco da 03-B sai por uma de duas portas ✅

Branch própria a partir de `704dc66` (desenho `eca91e3` + plano `7ceae40` + 16 commits),
integrada por merge `--no-ff` em **`b06f160`**. Contrato:
`docs/superpowers/specs/2026-09-27-03b2-riscos-residuais-design.md`. **Nenhuma migration; os
parâmetros das quatro assinaturas públicas intactos** — o retorno só **ganhou** `completude`.

Cada risco declarado pela 03-B saiu por uma de duas portas: **irrepresentável** (o tipo não
compila, ou uma fronteira pega a forma) ou **decisão sua aplicada**, com o número que muda
congelado em teste **antes** do conserto — dois commits, caracteriza → conserta.

| Item | O que fechou | Muda número? |
| --- | --- | --- |
| A1 | o tipo das entradas depende do escopo lido: `inst` com o escopo do card **não compila** (R1); a janela só é exigida quando o escopo lê transações | não |
| A2 | linhas estritas (`campo: T \| null`), estreitamento de domínio declarado (D41) e **zero cast** de linha no Cron (R2 + R4) | não |
| A3 | fronteira do motor pela API do compilador **com checker**, ao lado da regex da 03-B (R3) | não |
| A4 | `LeituraDoDono` nas três leituras que faltavam; o guard que lançava saiu | não |
| A5 | tetos 2000/1000 **visíveis** por `count: "exact"` (D41) e `completude` real nos retornos, na IA e nos insights | não |
| A6 | `saldoDasContas` num módulo **sem import**, usado pelas telas de conta — bundle das quatro rotas idêntico | não |
| A7 + A8 | limiares do alerta num lugar só (tela e sino leem a mesma constante); o fim do mês da IA sai de `ultimoDiaDoMes` | não |
| **B1** | fatura **vazia** sai do sino e da busca (`.gt("itens", 0)`): **2 → 1** `invoice_overdue` na fixture | **sim**, por decisão sua |
| **B2** | **uma régua só** para o gasto alto — o sino adota a da tela. Cenário A: não disparava → **dispara 37%**; cenário B: disparava 50% → **não dispara**. A tela não mudou (equivalência) | **sim**, por decisão sua |
| **B3** | a IA soma **todas** as contas via `saldoDasContas` e lista as inativas com saldo, marcadas. Fixture: 13.235,79 → 14.235,78. **Dado real: latente** (0 contas inativas) | **sim**, por decisão sua |

**Prova:**
- **Os 65 da 03-A e os 24 do `dashboard.test.ts` não mudaram uma linha** — `git diff --quiet`
  contra `704dc66`, em todo passo.
- **21 mutações, 21 vermelhas**, cada uma registrando o nome do teste que caiu e com a
  restauração conferida por `git diff --quiet`. M1a/M1b/M3 são travas de tipo: a prova é o
  `tsc` (TS2578/TS2344/TS2322), com o vitest verde — está dito.
- **+6 arquivos, +66 casos** (195 / 4.033 → 201 / 4.099).
- **Revisão final da branch inteira** (independente, somente leitura): 0 crítico, 2
  importantes, 4 menores. Uma rodada de correção (`b1e6b88`, `3804875`) e uma re-revisão
  restrita: **7 de 7 resolvidos**, nenhum importante novo (D42).

⚠️ **Desvios do desenho, declarados:** a A5 devolve `situacao` com três estados
(`completa | saturou | sem_contagem`) em vez de `saturou: boolean` — a contagem nula ganha
motivo próprio · `janela?: undefined` em vez de `never` · uma defesa de runtime lança se um
escopo que lê transações vier sem janela (o tipo também a exige desde a correção M2) · a A5
em dois commits · a B2 consertada no principal depois de o roteador falhar no gate (D43) · a
varredura da A2 cobre só os tipos `Linha*` que `pipeline.ts` exporta.

### Risco residual da 03-B2

| # | Risco | Destino |
| --- | --- | --- |
| RR1 | a fronteira com checker só vê quem importa o motor; escapam a reexportação, o objeto montado sem literal e empurrado numa lista, e a cadeia por `reduce` ou função auxiliar | aceito, declarado no teste |
| RR1b | literal de array como **receptor** da cadeia (`[...a.map(…), ...b.map(…)].filter(ok)`) ou lista montada passada a `concat` — apontado na re-revisão, **não medido** | aceito (D42) |
| RR2 | `max_rows` do PostgREST corta em silêncio as leituras **sem** `.limit` e as do Cron (cuja janela cresceu na B2) | **03-G** |
| RR3 | um CHECK alargado sem atualizar `constants.ts` tira o lançamento novo da soma (tela e IA dizem "parcial"; o Cron, não) | aceito; o teste que compara as duas listas fica como sugestão |
| RR4 | `usadoPorCartao` em centavos na tela × float no sino, na borda do limiar | **05** |
| RR5 | `completude` chega à IA e aos insights, **não** às telas | **04 / 06** |
| RR6 | dois `as` projetam o tipo pela forma lida (`lerFinanceiro`, `montarEntradas`), cada um com gêmeo de runtime | aceito, declarado no código |
| RR7 | um COUNT por leitura com teto; o coletor de insight chama o card até 12× em série | aceito; medir se a geração de insight ficar lenta |
| RR8 | a régua única compara o mês corrente **cheio, com pendentes**, contra meses fechados | **03-E** (§13.6) |
| RR9 | notificações de fatura vazia gravadas antes da B1 continuam no sino | aceito |
| RR10 | as três leituras aceitam `owner`; faturas e relatório não têm chamador que o use | aceito |

---

## REDESIGN-03-B — o pipeline do motor financeiro vira UM ✅

Branch própria a partir de `7b850e9` (desenho `b5d74dc` + 9 commits), integrada por merge
`--no-ff` em **`ad9f359`**. Contrato: `docs/superpowers/specs/2026-09-27-03b-pipeline-financeiro-design.md`.
**Nenhum número mudou, nenhuma migration, as quatro assinaturas públicas intactas.**

**O defeito, medido:** entre o banco e o motor havia uma camada de tradução copiada à mão —
**24 montagens** de `Dash*` em **4 arquivos** (card do dashboard, relatório, página do
dashboard financeiro, Cron), mais 3 cópias do saldo e 3 de `fimDoMes`. Cada cópia envelheceu
sozinha: `category_id: null` escrito à mão no Cron, `ref_month` ausente no card de faturas,
`mediaSaidas` com duas definições, duas disciplinas de conversão de `numeric`.

| Camada | Onde | O que faz |
| --- | --- | --- |
| Pura | `src/lib/finance/pipeline.ts` (sem `server-only`) | `montarEntradas` — as 7 montagens, uma por tipo · `saldoDasContas` · `ultimoDiaDoMes` · janelas nomeadas · escopos nomeados `as const` (escopo solto não tipa) |
| I/O | `lerFinanceiro` em `finance/queries.ts` | um `Promise.all`; leitura fora do escopo não roda; **lança** se `owner` vier com escopo cujas leituras ainda não aceitam `LeituraDoDono` |
| Motor | `mediaDeSaidas` em `dashboard.ts` | a régua do gasto alto, com "mês sem saída" como **parâmetro** — tela e sino continuam divergindo, agora declarados |

As 24 montagens viraram **7, todas dentro de `pipeline.ts`**. O Cron entra só pela camada
pura (§3.1 do desenho). Dois defeitos latentes morreram sem mover número: o `category_id` do
Cron sai do dado, e o `ref_month` do card de faturas passa a ser derivado.

**Prova:**
- **Os 65 da 03-A e os 24 do `dashboard.test.ts` não mudaram uma linha** — `git diff --quiet`
  nos dois, contra o ponto de partida e de novo depois do merge.
- **Fronteira** (`pipeline.test.ts`): varredura sem comentários — nenhum arquivo fora de
  `pipeline.ts` monta `Dash*`. Vista **vermelha listando os 4 arquivos** antes de qualquer
  chamador migrar (D37).
- **+3 arquivos, +46 casos:** `pipeline.test.ts` (28), `ler-financeiro.test.ts` (11),
  `media-saidas.test.ts` (7).
- **As 9 mutações do desenho, mais variantes e 1 extra, todas vermelhas**, com o nome de cada
  teste que caiu no corpo de `2968b3c`. A extra (escopo afrouxado) passa no vitest e é
  **reprovada pelo `tsc`** (TS2578) — a trava é de tipo, e isso está dito.

⚠️ **Desvios do desenho, declarados:** `lerFinanceiro` devolve também `recorrencias` **cruas**
(D36) · a N3 **não derruba nenhum dos 65, e não tem como** (D38) · **dois** casts no Cron, não
um · chave ausente vira `null` **declarado em teste** (`ref_month` e `category` no Cron).

### Risco residual — vira a 03-B2

| # | Risco | Estado ao integrar |
| --- | --- | --- |
| R1 | `inst: []` com o escopo do card — `gastosPorCategoria`/`gastosPorForma` perdem parcelamento em silêncio | **Real.** Mitigado por escopo nomeado e aviso no tipo |
| R2 | Dois casts no Cron | No diff, comentados |
| R3 | Fronteira textual: `Array<DashTx> =`, `satisfies` e literal inline escapariam | Aberto |
| R4 | Linha tolerante: campo opcional ausente vira `null` sem erro de tipo | Aberto |
| R5 | Tela e sino com réguas diferentes no gasto alto (3 eixos) | Declarado, não unificado |
| — | Cron sem `.gt("itens", 0)` · janela do Cron truncada em hoje · tetos 2000/1000 invisíveis · 3 leituras sem `LeituraDoDono` | Declarados no código |

**Achados ao preparar a 03-B2 (nenhum consertado):** o sino manda "Fatura atrasada"
**urgente** de fatura **vazia** — a view garante `itens = 0` ⇒ `total_atual = 0` · a IA soma
saldo **só de contas ativas** e afirma ser "a mesma soma do card do dashboard" · a IA declara
`completude: "exato"` fixo sobre leituras com teto · `getSpending` declara
`periodo.ate = ${mes}-31` · os limiares do alerta (1.2 · 0.8 · 5 dias) estão escritos duas
vezes · `usadoPorCartao` soma em centavos na tela e em float no sino · a busca lista fatura
vazia.

---

## REDESIGN-03-A — o núcleo financeiro fica caracterizado antes de a 03 mexer nele ✅

Branch própria a partir de `a4bed98`, dois commits, integrada por merge `--no-ff`. Um arquivo
novo — `src/lib/finance/dashboard-caracterizacao.test.ts`, 1.280 linhas, 52 blocos `it`,
**65 casos**. **Nenhuma linha de runtime, nenhuma migration, nenhum teste existente tocado ou
afrouxado.**

**⚠️ Ela nasce verde, e isso não é elogio.** Um teste de caracterização descreve o que já
acontece; o único critério de aceite honesto é a **mutação**. Foram **19, uma a uma, 19
vermelhas**, cada uma registrando o **nome** do teste que caiu — não a contagem (D25).

**O que ela congela, e para quem:**

| Bloco | Congela | Para |
| --- | --- | --- |
| 1–4 | contrato AS-IS objeto a objeto das quatro funções, com `toEqual` cheio | todos |
| 5 | **o cenário sintético obrigatório do §9** | aceite da 03 |
| 6 | receita **não** é partida entre "minha" e "de terceiros" | 03-C |
| 7 | **nenhuma** das quatro funções lê categoria para decidir de quem é o dinheiro | 03-C2 / D8 |
| 8 | quais status de recebível cada função conta — **um a um** | 03-D |
| 9 | existe **uma base só** (competência), e qual data cada função usa | 03-E |
| 10 | a linha de base do pipeline triplicado, antes de ele virar um | 03-B |

### O §9 resolvido: são **4 provadas + 1 condicional**, não 5 (D30)

Provadas: minha despesa continua R$ 400 **nos quatro status de recebível** · a
responsabilidade original do terceiro é R$ 600 nos quatro · o reembolso não reduz a fatura
devida ao banco · pagar o banco não cria despesa nova.

A quinta — *"minha renda pessoal não sobe R$ 250"* — **vale só enquanto o reembolso não for
lançado como receita**. Lançado, as entradas sobem 250, e o teste prova que o resumo de um
reembolso é **idêntico** ao de uma renda genuína.

⛔ **As três irrepresentáveis ganharam preço em número, não em frase:** o único jeito de o
schema de hoje dizer *"restam R$ 350"* é reescrever `receivables.valor` de 600 para 350 — e
isso faz minha despesa **saltar de 400 para 650**. As exigências [1] e [4] são incompatíveis
no schema atual. É a prova de que a **E1 é necessária**, não preferência de modelagem.

### O que `dashboard.test.ts` deixava passar VERDE

Quatro mutações reais atravessaram intactas os 24 casos que já existiam, e agora ficam
vermelhas:

| Mutação | Existente | 03-A |
| --- | --- | --- |
| a compra-pai parcelada entrando nas saídas à vista | 🟢 0 | 🔴 1 |
| a soma de terceiros do cartão filtrando "só os em aberto" — **o "conserto" que a D3 proíbe** | 🟢 0 | 🔴 9 |
| `proximas6Faturas` devolvendo 6 no total em vez de 6 por cartão | 🟢 0 | 🔴 1 |
| receita passando a ser repartida por `valor_pessoal` | 🟢 0 | 🔴 1 |

**Sete das 19 mutações são autoteste dos testes de AUSÊNCIA** (`classificacao`,
`classificacao_padrao`, `liquidado_em`, `valor_recebido`, `Date.now()`, `new Date()` e a
fronteira de mês). Teste de ausência nunca visto vermelho pode estar afirmando `[] === []`
(invariante 106). Restauração conferida por `git diff --quiet` em **cada** mutação, nunca pelo
verde.

⚠️ **Uma mutação achou fraqueza de quem escreveu, e ela foi corrigida** (D31): uma asserção
testava a **forma** do código (`toContain("iso.slice(0, 7)")`) e ficava vermelha ao trocar
`slice` por `substring`, que é idêntico. Teste que quebra em refatoração inofensiva ensina a
afrouxar o arquivo. Virou asserção comportamental sobre as duas bordas do mês.

### ACHADO — os três chamadores **não** alimentam igual (não consertado; é da 03-B)

| # | Divergência | Efeito, congelado em teste |
| --- | --- | --- |
| 1 | **Janela de transações.** `lib/dashboard/queries.ts` lê só o mês; `lib/reports/queries.ts` e `dashboard/financeiro/page.tsx` leem 6 meses atrás até 6 à frente | Para o `resumoMes` **do mês** é inofensivo — e é isso que a 03-B precisa afirmar **antes** de unificar. Fora do mês, a janela estreita responde **zero** |
| 2 | **`installmentItems`.** O dashboard nem os busca | Lista vazia faz a parcela **sumir** do total, sem exceção e sem campo de completude |
| 3 | **`ref_month`.** `getInvoicesCardData` monta os recebíveis **sem** o campo | Coerente hoje (chama sem mês). Se a unificação passar a mandar o mês por ali, o card responde **R$ 0,00** sem nada quebrar |

### Congelado como está, parecendo errado (nenhum corrigido)

`pendente` entra em entradas **e** saídas como se tivesse acontecido (03-E) · `ignorado` conta
como terceiro, e a D11 já decidiu que vira despesa minha (03-D) · `meu` do cartão fica
**negativo** quando os recebíveis passam do total · `totalAReceber` ignora status desconhecido
em silêncio · `gastosPorCategoria` mantém nome e cor do **primeiro** item com id repetido.

### Defeito preexistente fechado no caminho (`f878b94`)

O teste `catalog.test.ts` → *"os argumentos saem de `hoje` INJETADO…"* (Fase 18-F) falhou **1
vez em 6 rodadas** da suíte completa, com `Test timed out in 5000ms`. Raiz **reproduzida**:
`executors.ts` é `server-only` e arrasta a árvore de I/O das 30 ferramentas — carregá-lo custa
**1.604 ms**, contra 0–2 ms dos outros seis casos do arquivo. Era o **único `await import` do
repositório dentro de um caso de teste**; os outros quinze ficam no topo do módulo, onde o
custo cai no `collect`, que não tem teto. `--testTimeout=1200` reproduz a falha com a forma de
erro idêntica (o `^` na linha do `it`, não num `expect`).

⛔ **O fix é de raiz, não curativo:** o `await import` foi para o topo. **1.604 ms → 2 ms**,
passa com `--testTimeout=50`. Aumentar o `testTimeout` deixaria a corrida de pé, mais longe.

### Limitações declaradas

Os três pipelines são I/O e não têm função pura para chamar — o bloco 10 congela o **efeito**
de cada divergência, não a divergência em si · `getStatements` filtra `.gt("itens", 0)`, então
fatura sem lançamento nunca chega ao motor (reforça o *"sem lançamentos conhecidos ≠ R$ 0,00"*
do §13.5; fica para a **05**) · tudo é fixture sintética e nada afirma sobre o banco real.

⛔ **PENDÊNCIA DE FECHAMENTO DA FASE 03 (D32):** o aceite do `PLANO.md` cita *"os 18 casos
financeiros mínimos do briefing §13"*, e **esse texto não existe em `docs/`**. A §13 do
`METRICAS-FINANCEIRAS.md` é o dicionário TO-BE, não uma lista de 18 casos. Sem ele, ninguém
fecha a fase contra o próprio critério dela. Decidido seguir sem; volta na **03-G**.

---

## `R4` — as rotas montadas à mão ✅ FECHADO

Feito em **outro chat**, em branch própria a partir de `fce701f`
(`feat/redesign-r4-deeplinks`, commit `b1540ae`), revisado e integrado aqui por merge
`--no-ff` em **`1b5aa28`**. Um arquivo só, `src/test/deep-links-inline.test.ts`, **nenhuma
mudança de runtime**.

**O que faltava.** Os três módulos com arquivo de links já estavam cobertos pela 02-D — são
funções puras. Ficou de fora a rota escrita **inline**, dentro de função de I/O que nenhum
teste alcança sem banco: `searchAll` monta `/faturas?card=…` dentro de um `.then()` sobre o
Supabase. Como não dá para **chamar** o código, o teste **lê** o código — o idioma do projeto
para contrato que o `tsc` não pega. E reusa `temPagina`: nenhuma terceira resolução de rota.

**Cobertura: 29 pontos de link, 15 rotas distintas, 3 arquivos** (`search/queries.ts` 15 ·
`notifications/generate.ts` 13 · `notifications/nutrition.ts` 1). Nenhum link quebrado de
verdade — as 15 existem no disco.

⚠️ **As DUAS contagens que publiquei antes estavam erradas** (D27): primeiro "11 rotas em 2
arquivos", depois "21 pontos em 3 arquivos". São **29**. O `grep` que usei nos dois briefings
não pegava os dois ramos dos ternários de `/todo` (`queries.ts:154`, `generate.ts:542`) nem os
quatro links com query string (`/tarefas?view=`, `/habitos?view=`). O número de rotas
**distintas** (15) é o único que sobreviveu às três contagens.

**Mutação — 7 no total: 3 de quem escreveu, 4 independentes na revisão.**

| # | Mutação | Resultado |
| --- | --- | --- |
| deles 1 | o extrator deixa de casar (`link:` → `linkz:`) | 🔴 7 |
| deles 2 | `generate.ts:561` → `/dashboard/financeiros` | 🔴 1, nomeando arquivo, linha e rota |
| deles 3 | `temPagina` responde sim a tudo | 🔴 1 |
| **MA** | um link REAL de `queries.ts` → rota inexistente | 🔴 1, nomeando a linha |
| **MB** | a leitura da expressão para em `;` em vez de `,` | 🟢 **VERDE — e está certo** |
| **MC** | o extrator deixa de enxergar crase (template) | 🔴 7 |
| **MD** | um link some do `nutrition.ts` (piso) | 🔴 1 |

⛔ **A MB verde NÃO é furo, e eu só sei disso porque fui medir** (D28). `expressaoDoLink` tem
uma **segunda parada** — o `}` no nível zero — e nestes arquivos todo `link:` está dentro de
objeto que fecha. Com e sem a mutação o extrator acha os **mesmos 29 pontos, lista idêntica**.
Mutação que não muda comportamento não prova nada — **nem a favor nem contra**. Chamar aquele
verde de fraqueza do teste teria sido tão desonesto quanto chamar de força.

**O risco que segue aberto, declarado pelo próprio arquivo:** a varredura cobre os **3
arquivos listados em `VARRIDOS`**. Um quarto arquivo que passe a montar rota inline não entra
sozinho. E o teste prova que a rota **existe**, não que a query string faz sentido — é o caso
do `nutrition.ts:255`, abaixo.

**Achado que fica:** `notifications/nutrition.ts:255` monta `/nutricao/planejamento?data=`
inline, ao largo do `nutrition-links.ts` que a **invariante 26** declara fonte única. Não é
duplicata (o `planLink` de lá abre outra coisa), é uma rota que escapou. A rota existe, então
não é 404 — mas o `?data=` não é lido por `planLink` nenhum. **Fica para a REDESIGN-07**, que
é quando a Dieta é tocada; mexer nisso agora é mudar runtime fora de fase.

---

## REDESIGN-02-E — a navegação de módulo passa a ser UMA ✅

Ao contrário da 02-D, esta subfase **consertou defeito vivo** — e ele só apareceu porque as
três cópias foram lidas lado a lado. Havia três navs de módulo "quase iguais" e três cascas
**idênticas até o comentário**; "quase" era o problema.

**O que estava diferente entre as cópias:**

| # | Divergência | Gravidade |
| --- | --- | --- |
| 1 | ⛔ **O nav da IA não marcava `aria-current="page"`.** Dieta, Treinos e as abas do Financeiro marcavam | **Defeito de acessibilidade, vivo.** Em `/ia`, quem usa leitor de tela não recebia "você está aqui" — a única pista era a cor |
| 2 | ⛔ **O `<nav>` da IA não tinha `aria-label`.** A página tem dois landmarks de navegação | Um "navigation" sem nome na lista de landmarks, ao lado da sidebar do app |
| 3 | Dois desenhos de item ativo no mesmo produto: Dieta/Treinos com fundo + anel e texto em `foreground`; IA com fundo e texto em `primary` | Inconsistência visível, e a variante da IA é a de **menor contraste** (texto colorido sobre fundo colorido) |
| 4 | Só a IA era `sticky`, e sem teto de altura | Com os 13 itens de Treinos, numa janela baixa os últimos ficariam inalcançáveis |

**O que foi feito.** `src/components/shared/module-shell.tsx` passou a ser a única
implementação de coluna, gaveta, botão "Seções", estado da gaveta e item ativo. Os três
módulos viraram **dados**: quais seções, em que ordem, sob que grupo, com que ícone. As
cascas viraram uma linha cada. O item ativo ficou na variante de maior contraste — **texto em
cor de texto, e a cor da marca marcando a POSIÇÃO** (ícone e anel).

⚠️ **O Financeiro não entrou, e isso é decisão declarada (D23).** A navegação dele é uma fita
de abas horizontal, não uma coluna: não é uma quarta cópia disto, é outra forma.

⚠️ **O badge "Em breve"/"Planejado" não foi trazido (D24).** As **25 seções** dos três módulos
estão todas `pronto` desde que as fases 16, 17 e 18 fecharam — é um ramo que dado nenhum
alcança. Quem avisa se isso deixar de ser verdade é um teste, não a memória de alguém.

**Mutação — 10 aplicadas uma a uma, 10 vermelhas**, cada uma derrubando exatamente o teste
que deveria derrubar:

| # | Mutação | Resultado |
| --- | --- | --- |
| M1 | item ativo deixa de ser anunciado (`aria-current`) | 🔴 1 |
| M2 | landmark perde o nome (`aria-label`) | 🔴 1 |
| M3 | a IA volta a decidir a própria rota atual | 🔴 1 |
| M4 | uma seção de Treinos fica fora da coluna | 🔴 2 |
| M5 | dois itens de Treinos na mesma rota | 🔴 2 |
| M6 | as rotas da IA apontam para módulo inexistente | 🔴 9 |
| M7 | `temPagina` responde sim a tudo | 🔴 3 |
| M8 | uma seção de Treinos deixa de estar pronta | 🔴 1 |
| M9 | a sonda some da casca (**autoteste da varredura**) | 🔴 1 |
| M10 | item ativo passa a olhar só o 1º grupo | 🔴 1 |

⚠️ **A primeira rodada de mutação foi descartada e refeita (D25).** Ela reportava só a
CONTAGEM de vermelhos, e dois números não bateram com a realidade quando fui conferir um a
um. A 2ª rodada registra o **nome** de cada teste que cai e faz o backup byte a byte. Contagem
sem nome é número que se lê errado — e foi o que aconteceu comigo.

**Efeito no bundle: nenhum, e era o esperado.** `/(app)/configuracoes` segue em **281,9 de
285** e a mediana em **214,2** — os navs de módulo não são importados pela casca do app, então
consolidá-los não move o orçamento. Rodado para confirmar, não afirmado.

**Achado que fica para a REDESIGN-07:** `NutritionSectionPlaceholder` e
`TrainingSectionPlaceholder` **não têm chamador nenhum** e os campos `status`/`phase` das
constantes só alimentavam o badge morto. Ficaram de pé — removê-los é limpeza de módulo, não
unificação de navegação.

---

## REDESIGN-02-D — o menu e os deep-links param de apontar para o vazio ✅

**⚠️ Esta subfase NÃO consertou defeito nenhum, e isso está dito de propósito.** Os 20 itens
do menu e os 30 deep-links apontavam todos para rotas que existem. Ela não corrige; ela
impede. Por isso o critério de aceite aqui não é "ficou verde" — verde era o estado inicial —
e sim **a confirmação por mutação**: 10 mutações, todas vermelhas.

**O que estava frouxo, medido:**

| Onde | O que havia | O que faltava |
| --- | --- | --- |
| `config/nav.ts` | 20 hrefs | **nada** conferia que a rota existe. Renomear uma pasta em `src/app/(app)/` dá um item com ícone e rótulo que leva a 404 |
| `search/ai-links.test.ts` | conferia o disco | com resolução **própria**, `"(app)"` e `"ia"` escritos dentro e um `slice(1)`. Se `/ia` mudasse de grupo, ela responderia "não existe" em vez de "não sei procurar" |
| `search/nutrition-links.test.ts` | 8 links | **prometia no cabeçalho** que a rota existe do outro lado; conferia o formato da string contra ela mesma |
| `search/training-links.test.ts` | 11 links | idem — e o cabeçalho afirmava literalmente "se um dos dois mudar sem o outro, `training-links.test.ts` quebra". Era falso |

**A resolução de rota virou uma só** — `src/test/rotas.ts`. Ela varre `src/app/**/page.tsx`,
trata grupo de rota (`(app)`, `(auth)`) e segmento dinâmico, e responde três coisas:
`PADROES_DE_ROTA` (com `[id]` preservado), `ROTAS_DO_APP` (as 63 telas da casca, id concreto)
e `temPagina(link)` (aceita query e âncora). A varredura que a 02-C tinha dentro do
`active.test.ts` **saiu de lá** e passou a vir daqui: a 02-D não podia recriar a duplicação
que a 02-C acabou de remover.

⚠️ **Por que em `src/test/` e não em `src/lib/`:** o módulo importa `node:fs`. Hoje `node:fs`
no `src/` só aparece em arquivos `*.test.ts` — um módulo com `fs` que a tela alcance quebra o
build.

**Mutações — 10 aplicadas uma a uma, 10 vermelhas:**

| # | Mutação | Resultado |
| --- | --- | --- |
| M1 | `temPagina` responde **sim** a tudo | 🔴 4 |
| M2 | `temPagina` responde **não** a tudo | 🔴 50 |
| M3 | deixa de conferir a contagem de segmentos | 🔴 4 |
| M4 | segmento dinâmico passa a casar **literalmente** | 🔴 5 |
| M5 | grupo de rota deixa de ser removido da URL | 🔴 55 |
| M6 | toda tela vira tela da casca autenticada | 🔴 2 |
| M7 | varredura apontada para pasta sem páginas | 🔴 não carrega, **com a mensagem própria** |
| M8 | item do menu aponta para rota inexistente | 🔴 2 |
| M9 | dois itens do menu na **mesma** rota | 🔴 3 |
| M10 | `navHrefs` deixa de refletir o menu | 🔴 3 |

A M4 saiu **verde na primeira tentativa** — e o verde era meu erro, não do teste: a
substituição deixou um ternário sem `else`, o arquivo não compilava e a suíte nem carregava.
Refeita como mudança que compila, ficou vermelha em 5. **Mutação que não compila não prova
nada.** Restauração conferida por `git diff` (`nav.ts` sem diff algum) e por varredura dos
seis marcadores — não pelo verde.

**Dois testes que ninguém pediu e que valem mais que o principal:** *nenhum href se repete*
(dois itens na mesma rota acendem os dois — é a 02-C entrando por outra porta, sem prefixo
nenhum envolvido) e *o href é absoluto, sem query e sem barra final* (`hrefAtivo` compara com
`pathname`; um href com `?` nunca ficaria ativo, e o item ficaria apagado para sempre sem
nada quebrar).

---

## REDESIGN-02-C — a navegação passa a ter UMA decisão ✅

**O defeito, medido:** a decisão "qual item está aceso" estava escrita **seis vezes** no
repositório, cada uma com uma redação. A cópia que a sidebar usava — e a sidebar aparece nas
**63 telas** — perguntava **item a item** (`pathname === href || pathname.startsWith(...)`),
sem guarda nenhuma. Varrendo as 63 rotas reais do disco contra os 20 hrefs do menu, **uma**
rota acendia dois itens: **`/dashboard/financeiro`**, com "Dashboard" e "Painel financeiro"
acesos juntos — fundo, texto e barra lateral, nos dois. Dois itens acesos são duas telas
dizendo ser onde você está.

**O que mudou não é o algoritmo, é a FORMA DA RESPOSTA.** Uma resposta booleana por item
torna *"dois acesos"* **representável**. `hrefAtivo(pathname, hrefs)`
(`src/lib/nav/active.ts`, puro e **sem imports**) pergunta uma vez sobre a lista inteira e
devolve **no máximo um** vencedor. Dois acesos deixa de ser um bug a evitar e passa a ser um
estado que a tela não consegue montar. Comparar por comprimento aqui é **exato, não
heurística**: todo href que casa é ancestral-ou-igual da mesma rota, então dois quaisquer são
prefixos um do outro.

**As seis cópias viraram uma.** `nav-links.tsx` (sidebar + gaveta), `finance-tabs-nav.tsx`,
`ai-nav.tsx`, `nutrition-nav.tsx`, `training-nav.tsx` e `findNavItem`. Os três navs de módulo
tinham um `if (href === "/nutricao") return pathname === "/nutricao"` escrito à mão, e as abas
do Financeiro tinham a mesma exceção escrita **nos dados** (`exact: true`) — é a regra
"mais específico vence", redescoberta um módulo por vez. Com o vencedor decidido sobre a lista
inteira, a rota-índice cai fora **de graça**, e um campo a menos é um campo que ninguém
esquece de pôr numa aba nova.

⚠️ **`findNavItem` já era a versão CORRETA — e tinha zero consumidores.** A resposta certa
estava no repositório, em `config/nav.ts`, enquanto a tela usava a errada. Agora as duas saem
da mesma função, e há teste comparando as duas em todas as 63 rotas.

**Conferido antes de mexer:** as quatro remoções de exceção foram comparadas rota a rota,
regra antiga × regra nova, sobre as **45 rotas reais** dos quatro módulos: **zero mudanças de
comportamento**. A remoção é estrutural, não visual — a única mudança visível do 02-C é
`/dashboard/financeiro`.

**Pular para o conteúdo (a parte do header).** A casca **não tinha** link de pular, e no DOM
a sidebar vem **antes** do Header: quem navega por teclado atravessava os 20 links do menu, o
botão de recolher e os controles do topo antes de chegar ao conteúdo, em toda navegação. O
link é o primeiro elemento focável do documento e o `<main>` ganhou `id` + `tabIndex={-1}` —
sem ele, âncora move a rolagem e **não** move o foco, e o atalho não serviria para nada.
Custo: **+0,2 KB** na casca.

**Prova (`src/lib/nav/active.test.ts`, 13 casos):** guarda anti-tautologia; o href mais fundo
vence **independente da ordem da lista**; fronteira de segmento (`/financeiro` ≠
`/financeiros`); rota fora do menu devolve `null`, nunca um palpite; a rota-índice vence
sozinha; **as rotas são lidas do disco**, não escritas à mão — uma lista à mão fica para trás
no dia em que alguém cria uma pasta, que é exatamente quando o defeito voltaria; nenhuma rota
acende mais de um item; toda rota acende um, salvo `/busca` (**exceção declarada**: chega-se a
ela pelo Ctrl/Cmd+K, não pelo menu); o item aceso é sempre ancestral-ou-igual da rota;
`findNavItem` responde o mesmo que a tela pinta; **nenhum componente escreve a regra de
prefixo por conta própria**; e o link de pular existe, é focável e vem antes da sidebar.

**11 mutações, 10 aplicadas e todas vermelhas** (a 11ª não tinha alvo e foi refeita):
inverter "mais fundo" para "primeiro que casa", tirar a fronteira de segmento, nunca achar
nada, a sidebar e as abas reescrevendo a regra, o nav da IA decidindo sozinho, `findNavItem`
divergindo da tela, sumir com o item que colidia, o alvo do pulo deixar de ser focável e o
link perder a âncora. **Restauração conferida por `git diff` e por varredura das marcas —
não pelo verde.**

**Inspeção visual real** (CSS compilado do `globals.css` de verdade, Chrome headless, claro e
escuro): o antes com dois itens acesos, o depois com um, e o link de pular **com foco de
verdade** — `focus:not-sr-only` pinta, branco sobre o azul novo, com anel.

---

## REDESIGN-02-B — a marca vira azul ✅

**O que mudou:** `--primary` passou de dourado a azul nos dois temas, os neutros foram
re-matizados de hue **quente (70–95)** para **frio (255–264)**, e a paleta de gráficos de 8
slots validada entrou no lugar de "dourado + 2 cinzas". `--gold` virou apelido de `--primary`
e `text-gradient-gold` virou `text-gradient-brand`. **`--font-sans` intocado.**

**Nada aqui foi escolhido no olho.** Antes de instalar:
- Os tokens propostos foram convertidos de OKLCH para sRGB e **os contrastes remedidos um a
  um** — 5,39 (branco no botão) · 4,80 (destrutivo) · 7,54 (`success-ink`) · 5,93
  (`warning-ink`) · 6,97 (azul escuro como texto). Todos batem com a 01-B.
- O **validador da paleta foi re-executado** nos dois modos e reproduz o laudo da §7.
- Os **8 `--sidebar-*`, que a 01-B não especificou**, foram derivados preservando as relações
  do tema antigo e medidos: **14 pares, todos acima de 4,5:1** (o mais apertado é 4,73).

**Dois defeitos reais fechados, além da troca de cor:**

| Defeito | Estava assim | Por que importava |
| --- | --- | --- |
| Paleta de 5 slots com `i % 5` | donut de categorias desenha **7** fatias e formas de pagamento são **8** | a 6ª fatia saía **com a cor da 1ª**, no mesmo gráfico: duas categorias diferentes afirmando ser a mesma. Três barras repetiam em formas de pagamento |
| §7 mandava rodar `scripts/validate_palette.js` | **esse arquivo não existe no repo** | um comando de verificação que não roda é uma verificação que ninguém refaz |

**Evidências:**
- `src/lib/theme/tokens.test.ts` — 12 casos, **confirmados por 11 mutações**, cada uma
  revertida e conferida por `git diff`. Ele guarda: token registrado no `@theme inline` sem
  valor (classe que não pinta nada), token de cor que existe no claro e **falta no escuro**
  (onde o valor claro vaza), os 8 hexes, as 2 superfícies `--card`, e os dois limites de
  fatia **derivados da fonte**.
- **Inspeção visual real:** o `globals.css` **de verdade** compilado pelo Tailwind e
  renderizado no Chrome headless, claro e escuro. Confirmado na imagem: `Dourado` continua
  dourado, `Azul` continua sky, e `parcial` (azul pálido) × `descanso` (violeta) do calendário
  de treinos continuam distintos — que era o risco que a marca azul criava.
- Conferido antes de trocar: **as 24 ocorrências de `text-primary-foreground` estão todas
  coladas em `bg-primary`**, então virar o texto do primário de escuro para branco não deixou
  nenhum órfão.

**Limitação declarada:** o `#C99A2E` cravado em hex (Agenda, Hábitos, Estudos, Tarefas)
continua fora — segue para a **REDESIGN-07**, como na 02-A.

---

## REDESIGN-02-A — cor de entidade × token de marca ✅

**Por que existe:** `"Dourado"` é uma cor que **você escolhe** para projetos e etiquetas, e
estava implementada com o token de **marca**. Trocar `--primary` para azul faria todo item
marcado como "Dourado" virar azul, **indistinguível do item `"Azul"` da mesma paleta** — sem
nada na tela denunciando.

**A varredura achou mais três casos do mesmo mecanismo**, que o plano não previa:

| Onde | Era | Virou | Colidia com |
| --- | --- | --- | --- |
| TO-DO · cor de projeto/etiqueta `gold` | `bg-primary` | `bg-yellow-600` | `azul` |
| TO-DO · prioridade **P2** | `text-primary` | `text-warning-ink` | **P3** (`sky`) |
| Tarefas · prioridade **alta** | `bg-primary/10` | `bg-warning/10` | **media** (`sky`) |
| Treinos · calendário, **descanso** | `bg-sky-500/20` | `bg-violet-500/25` | **parcial** (`bg-primary/45`) |

Também entraram os tokens semânticos `success`/`warning`/`info` (com a variante `-ink`
legível), **aditivos** — nenhum valor existente foi alterado, `--primary` segue dourado.

**Evidências:**
- `src/lib/theme/entity-colors.test.ts` — 7 casos, **confirmados por 5 mutações**: cada uma
  das cinco linhas revertida individualmente deixa a suíte vermelha. Teste de ausência que
  nunca foi visto vermelho não prova nada.
- **Inspeção visual real:** `globals.css` compilado pelo Tailwind e renderizado no Chrome
  headless em 4 combinações (claro/escuro × marca dourada/azul). Confirmado na imagem que,
  com a marca azul, `Dourado` continua dourado e `Azul` continua azul.

**Limitação declarada:** o dourado **cravado em hex** (`#C99A2E`) em Agenda, Hábitos, Estudos
e Tarefas **não foi tocado**. Ele não mente sobre dado nenhum — não depende de `--primary` e
continua dourado —, mas vira um tom órfão num app azul. É ajuste de aparência dos módulos
deles, e fica para a **REDESIGN-07**.

---

## REDESIGN-01 — o que foi entregue

| Subfase | Entrega | Onde |
| --- | --- | --- |
| **01-A** | Dicionário de métricas **fechado**: base caixa, base competência, terceiros, cartões, comparações | `METRICAS-FINANCEIRAS.md` §13 |
| **01-A** | Desenho das 3 migrations aprovadas — **escritas, nenhuma aplicada** | `MIGRATIONS.md` |
| **01-B** | Tokens claro/escuro, semânticos novos, paleta de gráficos **validada por script** | `TOKENS.md` |
| **01-C** | Prévias: Dashboard, Relatório financeiro, Central de cartões, celular 390 px, folha de tokens | Artifact privado (link na conversa) |

**Nenhuma linha de `src/` foi alterada na 01.** Nenhuma migration aplicada.

### O que as prévias provam

A base aparece na tela e nenhum número existe sem ela · renda pessoal separada de dinheiro de
terceiros · resultado do período usa a **sua** parte, nunca o bruto · saldo das contas sai do
bloco de resultado, com a data no rótulo · os três números de terceiros têm rótulos que os
distinguem · horizonte de faturas declarado honestamente (6 ciclos × 3 cartões = 18) ·
**ausência, zero medido e falha de leitura viram três coisas diferentes**.
**Branch:** `feat/redesign-00-auditoria` (de `main` em `5de90d6`)

---

## Concluído

- Branch criada de `main` já com a Fase 18 dentro (PR #55 mergeado às 19:09). Nenhuma branch
  de outro trabalho tocada.
- Baseline dos 5 comandos executado de verdade: **test 185/3.738 ✅ · lint ✅ · tsc ✅ ·
  build ✅ · perf:bundle ✅**. **Não há falha preexistente.**
- Inventário conferido no disco e no banco: 66 `page.tsx`, 7 route handlers, 68 rotas no
  orçamento de bundle, 132 tabelas, 3 views, RLS + FORCE RLS em 132/132.
- Seis varreduras paralelas: navegação/casca, design system, dashboard, relatórios, cartões,
  demais módulos.
- Núcleo financeiro auditado por mim (decisão do briefing §14), com leitura direta do banco.
- Cinco documentos escritos em `docs/redesign/`.

## Decisões tomadas nesta fase

| # | Decisão |
| --- | --- |
| D1 | Branch nasce de `main` (você confirmou que o PR #55 foi mergeado — verificado: merge commit `5de90d6`) |
| D2 | REDESIGN-00 fica com o agente principal. O roteador classificou TIER 2 → DeepSeek; o CLAUDE.md do projeto manda decisões de arquitetura ficarem no principal, e a fase inteira é decisão de arquitetura |
| D3 | **A soma de terceiros do cartão continua sem filtrar status de recebível.** Um subagente classificou como P0; reli contra o briefing e discordo — somar todos é o correto para "responsabilidade original". Filtrar só os em aberto faria minha despesa crescer a cada reembolso. Registrado em `METRICAS-FINANCEIRAS.md` §5 |
| D4 | Rotas antigas (`/faturas`, `/parcelamentos`, `/tarefas`) **não morrem**. Layout compartilhado antes de mover a árvore |
| D5 | Os 11 ids de `DASH_CARD_IDS` são imutáveis — renomear apaga preferência salva em silêncio |

## Decisões do dono — 2026-09-20 (respondidas)

| # | Decisão | Detalhe |
| --- | --- | --- |
| D6 | **Recebimento parcial ENTRA** | Tabela `receivable_receipts`. Torna atingíveis os critérios do briefing §13 |
| D7 | As outras duas categorias de receita são **renda dele** | Só a categoria de terceiros é reclassificada |
| D8 | **Categoria ganha marcação de terceiros** + lista separada por tipo | ⛔ É **atalho e filtro**, nunca fonte de verdade — `METRICAS-FINANCEIRAS.md` §11 |
| D9 | **Caixa EXATO** | `transactions.liquidado_em`; nulo cai para `competence_date` com a aproximação **declarada na tela** |
| D10 | Separação vale **daqui pra frente** | Nenhuma reclassificação automática do histórico |
| D11 | Recebível `ignorado` **vira despesa minha** | Sem sobrescrever `valor_pessoal`: a tela mostra a **parte efetiva** (acordada + perdoado), derivada. `METRICAS-FINANCEIRAS.md` §12. 0 casos hoje |

## Migrations aprovadas (aditivas, nenhuma apaga ou reinterpreta dado)

1. `receivable_receipts` (E1) — **aplicada em 2026-10-12** (03-D, pelo SQL Editor — D55; versão
   `20261011210000` registrada no histórico em 2026-10-15 — D59)
2. `transactions.liquidado_em` (E6)
3. `categories.classificacao_padrao` (E7) — **aplicada em 2026-10-11** (03-C2, versão
   `20261011190803`)
4. `pagar_fatura` e `desfazer_pagamento_fatura` (M-F, da K0 da **03-F** — fora do `MIGRATIONS.md`)
   — **aplicada em 2026-10-21**, pelo MCP (D63); duas funções, nenhuma tabela, coluna ou dado

`transactions.classificacao`/`valor_pessoal` para receita (E2) **não precisa de migration** —
as colunas já existem e o CHECK já aceita.

| D12 | **REDESIGN-02-A fica com o agente principal.** O roteador classificou TIER 1 → Codex; o conteúdo é decisão de design system (qual tom o "Dourado" passa a ter, quais estados colidem) e o CLAUDE.md manda decisão de arquitetura ficar no principal. A execução são ~30 linhas em 4 arquivos |
| D13 | **REDESIGN-02-B idem** (roteador: TIER 1 → Codex). Havia quatro decisões que a 01-B não fechou: os tokens da sidebar, `--gold` como apelido declarado nos dois temas, paleta de gráficos em **hex** e não OKLCH (para o laudo continuar valendo literalmente) e o que o teste de contrato afirma |
| D14 | **Slot 1 da paleta não é `--primary`.** `#2a78d6` ≠ `#256abf`: o azul do gráfico é o que coube na banda de luminosidade junto dos outros sete. Parecido de perto, diferente de propósito |
| D15 | **A colisão de cor dos gráficos foi corrigida subindo para 8 slots, não mexendo em quem pinta.** Dobrar categoria em "Outros" mais cedo muda o que você **vê como dado** — isso é decisão da REDESIGN-06, não de tokens |
| D16 | **REDESIGN-02-C idem** (roteador: TIER 1 → Codex). O que decide aqui é o **contrato** da função que pinta a navegação inteira (o que "mais específico" significa, e que a resposta seja uma só) e a **casca**, onde mora o orçamento de bundle. Aplicar nos 5 pontos é mecânico; o contrato e a prova não são |
| D17 | **A decisão de item ativo foi unificada nos 5 navs, mas a CASCA visual deles fica para a 02-E.** Deixar quatro cópias da mesma decisão obrigaria a 02-E a refazê-la, e as exceções escritas à mão são armadilha latente. Unificar a **decisão** é correção; unificar o **shell** é design |
| D18 | **`/busca` não acende item nenhum, e isso é exceção DECLARADA, não silêncio.** Ela é a tela de resultado do Ctrl/Cmd+K, não um item de menu. Sem a lista, "toda rota acende alguma coisa" seria falso — e um teste que se acomoda a uma rota órfã se acomoda à próxima |
| D19 | **REDESIGN-02-D fica com o agente principal** — desta vez o roteador concordou (TIER 0 → principal). `audit_required: true` veio junto e **não foi honrado**: a política do próprio plugin exclui mudança sem superfície nova, e a 02-D não altera um arquivo de runtime sequer. Nenhuma auditoria externa rodou, e não se afirma que rodou |
| D20 | **A resolução "esta rota existe?" mora em `src/test/rotas.ts`, não em `src/lib/`.** Ela importa `node:fs`; hoje `node:fs` no `src/` só aparece em `*.test.ts`, e um módulo com `fs` alcançável pela tela quebra o build. A varredura saiu de dentro do `active.test.ts` no mesmo passo — 02-D não podia recriar a duplicação que a 02-C removeu |
| D21 | **A 02-D não conserta nada, e o documento diz isso.** Os 20 hrefs e os 30 deep-links já apontavam para rotas existentes. Numa subfase que nasce verde, o único critério de aceite honesto é a mutação — e uma delas (M4) saiu verde por erro meu, não do teste: não compilava. **Mutação que não compila não prova nada** |
| D22 | **REDESIGN-02-E fica com o agente principal por BLOQUEIO do roteador, não por escolha.** Ele classificou TIER 1 → Codex e o `dispatch` voltou `blocked` com `unsafe_test_command`: o pacote declara `npm run`/`npx` como testes, e o gate do plugin não os permite para worker externo. Reescrever os comandos para passar pelo gate seria contorná-lo, e a política do próprio plugin proíbe. Nenhuma auditoria externa rodou, e não se afirma que rodou |
| D23 | **O Financeiro NÃO entrou no `ModuleShell`, contra a letra do `PLANO.md`.** A navegação dele é fita de abas horizontal (`finance-tabs-nav.tsx`), não coluna — não é uma quarta cópia, é outra forma, com um consumidor só. Um componente compartilhado com um chamador é abstração sem segundo caso. O que ele já compartilha é a **decisão** (`hrefAtivo`, 02-C) e a linguagem de token. Virar coluna é **mudar a navegação do módulo**, e isso é assunto da REDESIGN-04, que o redesenha inteiro |
| D24 | **O badge "Em breve"/"Planejado" não foi para a casca compartilhada.** As 25 seções dos três módulos estão `pronto`; um ramo que dado nenhum alcança, copiado para dentro de um componente compartilhado, vira peso que ninguém consegue justificar depois. ⛔ O risco de a regressão ficar muda foi coberto por teste: `module-shell.test.ts` fica vermelho no dia em que uma seção nascer sem estar pronta |
| D25 | **A 1ª rodada de mutação da 02-E foi descartada, não corrigida por cima.** Ela reportava só a contagem de vermelhos, e dois números não sobreviveram à conferência um a um (M1 acusava 4; eram 1). Causa: estado sujo do meu próprio script, mais um backup feito com `cp` do Git Bash que ficou em LF contra um arquivo de trabalho em CRLF. A 2ª rodada faz backup byte a byte e registra o **nome** de cada teste que cai. **Contagem sem nome é número que se lê errado** |
| D26 | **`deep-links-inline.test.ts` mora em `src/test/`, quebrando a co-locação de propósito.** O sujeito dele não é `search/` nem `notifications/`: é o CONJUNTO dos arquivos que cunham rota inline, e hoje ele atravessa os dois. Pendurá-lo num deles deixaria o outro invisível para quem abre o outro — que é como nasce a terceira cópia de uma regra. Ele fica ao lado de `rotas.ts`, que é a resolução que ele consome |
| D27 | **Minhas duas contagens do `R4` estavam erradas, e a segunda foi publicada como correção da primeira.** "11 rotas em 2 arquivos" → "21 pontos em 3 arquivos" → **29 pontos**. As duas vieram de `grep` meu, que não pegava ramo de ternário nem link com query string. O que sobreviveu às três contagens foi o número de rotas **distintas** (15). ⛔ **Contar com a ferramenta errada duas vezes seguidas é o motivo de a varredura ser derivada do código e não de uma lista minha** |
| D28 | **Uma das minhas mutações no `R4` saiu verde, e o verde está CERTO.** A MB troca a parada da leitura da expressão de `,` para `;`, e o extrator acha os mesmos 29 pontos — porque há uma segunda parada (`}` no nível zero) que a mutação não toca. Fui medir as duas listas antes de opinar. **Mutação que não muda comportamento não prova nada em nenhuma das duas direções** — é a D21 pelo outro lado |
| D29 | **A M3 não é da 03-B — este documento estava errado, em dois lugares.** Ele dizia que `categories.classificacao_padrao` seria pedida na 03-B; o `PLANO.md` descreve a 03-B como "sem mudar número nenhum" e `MIGRATIONS.md:16` liga a M3 à D8, que é a **03-C2**. **A 03-B não precisa de migration nenhuma.** Corrigido no cabeçalho e no próximo passo |
| D30 | **O §9 tem 4 exigências certas + 1 CONDICIONAL, não 5.** O `METRICAS-FINANCEIRAS.md` conta cinco como funcionando. A quinta ("minha renda pessoal não sobe R$ 250") vale **só enquanto o reembolso não for lançado como receita** — e o teste prova que, lançado, o resumo dele é idêntico ao de uma renda genuína. Contei 4+1 em vez de 5 porque o número honesto é o que sobrevive ao teste |
| D31 | **Uma mutação da 03-A achou fraqueza de quem escreveu o teste, e ela foi corrigida antes do commit.** Uma asserção testava a FORMA do código (`toContain("iso.slice(0, 7)")`) e quebrava ao trocar `slice` por `substring`, que é semanticamente idêntico. **Teste que fica vermelho em refatoração inofensiva ensina a afrouxar o arquivo** — e este arquivo é a linha de base da fase inteira. Virou asserção comportamental sobre as duas bordas do mês |
| D32 | **Os "18 casos financeiros mínimos do briefing §13" não existem em `docs/`.** O aceite da REDESIGN-03 os cita; o repositório não os tem, e a §13 do `METRICAS-FINANCEIRAS.md` é o dicionário TO-BE. Decidido **seguir sem** e registrar como pendência de fechamento, em vez de derivar uma lista que divergiria do texto original. Volta na **03-G** |
| D33 | **Um teste flaky preexistente foi consertado dentro da 03-A, fora do escopo dela e a pedido do dono.** `catalog.test.ts` (Fase 18-F). O fix é de RAIZ — o `await import` saiu de dentro do `it` — e não curativo: subir o `testTimeout` deixaria a corrida de pé, mais longe. **1.604 ms → 2 ms** |
| D34 | **A contagem de commits deste documento estava errada pela terceira vez, e agora é MEDIDA.** Dizia 11; `a4bed98` já era **12** — e esse commit se chama "corrige a contagem de commits locais (11, nao 10)", ou seja, foi corrigido uma vez e continuou errado. O número passa a sair de `git rev-list --count main..HEAD`. ⛔ **É o mesmo mecanismo da D27** (contar com a ferramenta errada, publicar, recontar): número que alguém conta à mão neste projeto erra, e a saída é derivá-lo da ferramenta que sabe a resposta |
| D35 | **A 03-B ficou com o agente principal por FALHA do roteador, não por escolha.** TIER 1 → Codex estourou o `timeout_ms` de 900 s; o fallback DeepSeek devolveu `invalid_output`. Sem fallback restante, a política do plugin manda seguir no principal. Lição registrada: um pacote de ~10 arquivos estoura o Codex — **fatiar o TASK PACKAGE por passo** |
| D36 | **`lerFinanceiro` devolve `recorrencias` CRUAS** (você, 2026-09-27). O desenho não previa: `assinaturas` do relatório lê `description` e `category.name`, que não existem no tipo de entrada do motor. Recusadas: uma segunda leitura de recorrências e alargar `DashRecurrence` |
| D37 | **"Cada passo fecha verde" × "a fronteira fica vermelha até o passo 5" foi conciliado com uma lista temporária dos NÃO migrados**, comparada nos dois sentidos (arquivo já migrado que continuasse na lista também reprovava). Ela só encolheu, e saiu no passo 6 |
| D38 | **A N3 não derrubar nenhum dos 65 é estrutural, não fraqueza.** O critério do desenho ("equivalência + algum dos 65") era inatingível: os 65 chamam o motor com `Dash*` direto e nunca passam por `montarEntradas`. Medido, não suposto — quem prova a mudança de número são os testes do motor sobre a entrada montada |
| D39 | **A 03-B foi integrada na mesma sessão que a escreveu, com sua autorização** — a primeira integração sem revisão independente com mutação própria (o R4 teve). A árvore integrada tem o **mesmo hash** da ponta da branch e os cinco comandos rodaram depois do merge. ⚠️ **Falta a conferência com dado real**: rodar a branch local (mesmo banco) e comparar card do dashboard, dashboard financeiro e relatórios com o app no ar. É sua — exige a sua sessão |
| D40 | **Os riscos residuais da 03-B viram a 03-B2, ANTES da 03-C** (você, 2026-09-27). Três itens mudam número (B1–B3) e precisam de "sim" um a um; misturados às mudanças de sentido da 03-C, os dois tipos de mudança ficariam indistinguíveis no diff |
| D41 | **As decisões da 03-B2 foram suas, uma de cada vez** (2026-09-27): **B1** — o sino **e** a busca leem faturas com `.gt("itens", 0)`, e as notificações já gravadas ficam · **B2** — o sino adota a régua da tela, e o "até a mesma altura" do §13.6 continua da 03-E · **B3** — o saldo da IA soma todas as contas via `saldoDasContas` · **A2** — estreitar o domínio e declarar o que fica de fora · **A5** — `count: "exact"` para tornar o teto visível |
| D42 | **A revisão final achou uma forma que a fronteira com checker deixava passar, e o escape foi MEDIDO antes do conserto.** `map` encadeado com `filter` sob `Array<DashTx>` e spread de `map`: aplicados num importador direto do motor, `tsc` limpo e suíte verde (4.096/4.096). A regra (b) passou a descer pela cadeia (`filter/slice/sort/toSorted/reverse/toReversed/concat`) e o spread ganhou a regra (d); as duas formas viraram as mutações M5d/M5e, agora vermelhas. A re-revisão apontou mais uma forma combinada (receptor literal, `concat` com lista montada), **não medida** — aceita como RR1b em vez de uma segunda rodada de correção sem revisão. Na mesma rodada: a descrição de `finance.get_balances` ainda dizia "cada conta ativa" depois da B3 — a frase envelhece (invariante 100) e ganhou teste. `version` continua `"1"` porque nenhuma ferramenta do registry sobe versão por descrição |
| D43 | **Roteador da 03-B2:** 13 despachos ao Codex, um com falha — a B2 (2/2) voltou `scope_violation` (`worker_modified_main_repository`) e o resultado **não** foi aproveitado; o conserto foi escrito no principal com TDD. ⚠️ **O worktree do worker não tem `node_modules`**: ele não consegue ver o vermelho, e um dos pacotes da correção voltou só com os testes. O vermelho é conferido no principal antes de aplicar a produção. E **a árvore principal não pode mudar enquanto um dispatch roda** — é o que o gate recusa |
| D44 | **A 03-B2 foi integrada na sessão que a escreveu, com sua autorização** — desta vez **com** revisão independente da branch inteira e re-revisão restrita da correção. A árvore integrada tem o **mesmo hash de tree** da ponta (`3804875`), e os cinco comandos rodaram depois do merge. ⚠️ **A conferência com dado real da D39 vale agora para as duas subfases**: card do dashboard, dashboard financeiro, relatórios **e o sino** (B1 e B2 mudam o que ele avisa) da branch local contra o app no ar. É sua |
| D45 | **As decisões da 03-C foram suas, uma de cada vez** (2026-10-11): **C0** — receita não usa a máquina de divisão (sem pessoa, sem recebível), com três refinamentos: chaves próprias no payload (a importação já mandava `classificacao` numa linha virada receita), "minha parte" só na compartilhada, e sair de receita zera as duas colunas · **B1** — espelhar o card de Saídas (número bruto, a separação na dica) · **B2** — não nesta subfase · **A2(b)** — quando o alvo é receita, a limpeza da divisão roda **antes** de gravar, e a recusa por recebível cobrado/pago não grava nada |
| D46 | **A auditoria do módulo achou um P2 que a própria A2 introduziu, e ele foi corrigido antes da A4.** O roteador marcou `audit_required` na A2; `saas-audit-br:module --audit-only` rodou com dois auditores. Editar uma **transferência** para **receita** apagava o lançamento antes de a A1 poder recusar — e, sendo pagamento de fatura, a fatura ficava "paga" sem lançamento. A A1 passou para antes do ramo de transferência (`95a16e9`, com teste vermelho → verde). Os cinco P3 viraram RR10–RR14, **sem conserto**, por estarem fora da lista |
| D47 | **Roteador da 03-C:** 6 despachos ao Codex, **3 falharam** no gate `worker_modified_main_repository` (A1, A4 e A5) — o worker escreveu na árvore principal em vez da cópia dele; o roteador desfez a escrita e as três seguiram no principal. A3 e as duas metades da B1 vieram do Codex, revisadas e aplicadas no principal. A2 foi TIER 0. ⚠️ É a segunda subfase seguida com esse gate (D43): **conte com refazer no principal** |
| D48 | **A 03-C foi integrada na sessão que a escreveu, com sua autorização** — com a auditoria do módulo (D46) mas **sem** revisão independente da branch inteira, ao contrário da 03-B2 (D44). A árvore integrada tem o **mesmo hash de tree** da ponta (`0dd3619`), e os cinco comandos rodaram depois do merge. ⚠️ **A conferência com dado real da D39/D44 passa a valer também para a 03-C**, e com uma ressalva: com o dado de hoje ela não mostra nada (nenhuma receita reclassificada); a dica da B1 só aparece depois de você reclassificar uma |
| D49 | **As decisões da 03-C2 foram suas, uma de cada vez** (2026-10-11): **K0** — o atalho vale só para receita, e o campo aparece nas categorias `receita` e `ambos` · **K1** — um filtro só, "categoria marcada como de terceiros", ignorado pelo saldo e sem ação em lote · **K2** — o atalho mora só no formulário: o servidor nunca lê a marcação, e IA, importação e registro rápido continuam `pessoal` |
| D50 | **A M3 é a primeira migration do redesign aplicada** (2026-10-11, versão remota `20261011190803`), pelo MCP, depois do seu "aplique a M3" literal. Um "Pode aplicar" anterior **não** foi tratado como a autorização, pela regra que você mesmo deu. Os tipos regenerados trouxeram mais que a M3 (a relationship `import_rows_transfer_account_owner_fkey` e a sintaxe nova dos genéricos) — ficou só o que é de `categories` (invariante 94) |
| D51 | **Roteador da 03-C2:** 7 despachos ao Codex, **1 falhou** no gate `worker_modified_main_repository` (6a) e seguiu no principal. No 6b, dois desvios do worker foram **revertidos ao plano** — os dois vieram de uma restrição minha larga demais ("só `page.tsx` pode conter a string"): o worker ofuscou a chave de uma fixture e trocou um tipo para obedecê-la. ⚠️ **Restrição de pacote se escreve pelo arquivo exato que a varredura cobre.** A M3 (passo 3) ficou no principal por sua instrução; as mutações (passo 7) ficaram no principal **contra** o roteador, declarado: o worktree do worker não tem `node_modules`, e o entregável do passo é o resultado dos testes |
| D52 | **A 03-C2 foi integrada na sessão que a escreveu**, a seu pedido (o prompt da próxima subfase), **sem** revisão independente da branch e **sem** auditoria de módulo. A árvore integrada tem o **mesmo hash de tree** da ponta (`8f01d63`), e os cinco comandos rodaram depois do merge. ⚠️ **A conferência com dado real da D39/D44/D48 vale também para a 03-C2**: marcar uma categoria pela tela, ver o atalho numa receita nova e o filtro — e conferir que nenhum número de dashboard, relatório ou sino mudou |
| D53 | **Um defeito anterior foi achado e NÃO consertado** (RR-C2-7): `categorySchema` transforma `sort_order` ausente em `0` e o formulário não o manda, então **toda edição de categoria zera a ordem dela**. Fora da lista da subfase — registrado para uma subfase futura |
| D54 | **Publicação por partes** (2026-10-11, por pedido seu): as subfases fechadas vão a produção por PR assim que integradas, em vez de esperar a REDESIGN-08. A primeira leva é de 00 a 03-C2, no PR #56. O CI roda os cinco comandos e a Vercel gera uma prévia. **Reversão:** Instant Rollback para `dpl_8WeZ8o36fwziJYqn8k19VsrqDX1k` (`main` em `5de90d6`), sem mexer no banco, porque as migrations são aditivas. ⚠️ **A integração continua em `feat/redesign-00-auditoria`.** O portão de ancestral dos próximos prompts depende dela, e depois do merge ela segue viva, agora com upstream. A 08 continua existindo como regressão final, mas deixa de ser o momento da entrega |
| D55 | **A M1 foi aplicada em 2026-10-12 pelo SQL Editor, não pelo MCP.** A autorização foi o seu "aplique a M1" literal — "Autorizo!" e "Pode aplicarrr…", antes dele, **não** foram tratados como ela. O `apply_migration` do MCP voltou `declined` (a confirmação do próprio MCP recusou; conferido que nada foi aplicado), você pediu o SQL e o aplicou. Conferida no banco depois: RLS + FORCE, policy por dono, os dois triggers, FK composta com cascade, índices, 0 linhas, **133 tabelas**. Tipos regenerados pelo MCP com o diff lido: só o bloco de `receivable_receipts` — de novo ficaram de fora a relationship `import_rows_transfer_account_owner_fkey` e a sintaxe nova dos genéricos (D50, invariante 94) |
| D56 | **Roteador da 03-D:** 23 despachos de A1 a B4 e da correção do sino. **3 falharam** no gate (`scope_violation`, A5 1/2 e 2/2, B4 1/2) por falso alarme — a árvore principal estava intacta, e o diff foi tirado da worktree, revisado e aplicado. Desvios de worker revertidos ao plano (layout do cartão, nome de pessoa em `block`, o comentário da 03-B2 no Cron). A A2 (M1, tipos, backup) e as mutações ficaram no principal por sua instrução. Depois da revisão final, o Codex esteve **indisponível** duas vezes e o DeepSeek devolveu **saída inválida** duas: as correções seguiram no principal, e um patch de worker **não** foi aplicado como veio |
| D57 | **A revisão final da branch achou um crítico que era do DESENHO, não da execução:** o F4 listou cinco pontos de exclusão e esqueceu `deleteInstallmentPurchase` (o botão de excluir de `/parcelamentos`) e a edição que vira transferência — os dois apagavam recebimento registrado por cascade, sem aviso. Foi registrado e reportado, e corrigido só depois do seu "Eu autorizo", com o alcance da decisão (b) (só recebimento registrado bloqueia). E o inventário deixou de ser à mão: `quem-apaga-recebiveis.test.ts` exige que todo `delete` da cadeia esteja numa allowlist, com contagem e motivo |
| D58 | **O P6 mudou (RR-D-19), por decisão sua, delegada** ("Faz como achar mais recomendado"): "Desfazer o último" desfaz o último **registrado** (`created_at`), não o de data mais recente — pela data, um lançamento retroativo fazia o Desfazer apagar outro. O `pago_em` da soma fechada continua sendo a data mais recente |
| D59 | **RR-D-11, decisão delegada:** a versão da M1 foi registrada no histórico remoto por `supabase migration repair --status applied 20261011210000` (só registra, não executa SQL). ⚠️ **Achado:** o histórico local × remoto está desalinhado no projeto **inteiro** — 11 de 347 linhas casam —, porque o MCP grava a hora da aplicação, não a versão do arquivo. `supabase db push` nunca foi utilizável aqui (aborta antes de aplicar qualquer coisa). Alinhar o histórico é decisão sua, fora do redesign |
| D60 | **A 03-D foi integrada na sessão que a escreveu, a seu pedido** ("Pode mergear"), **com** revisão independente da branch inteira (D57) e re-revisão restrita de cada correção, **sem** auditoria de módulo. A branch nasceu antes da D54, então a árvore integrada é a da ponta (`c7798ae`) **mais exatamente** a mudança da D54 no STATUS — conferido por patch-id —, e os cinco comandos rodaram depois do merge. O push e o PR #57 vieram com o seu aval explícito; **o merge em `main` é seu**. ⚠️ **A conferência com dado real da D39/D44/D48/D52 vale também para a 03-D**: registrar um recebimento parcial pela tela, desfazê-lo, e conferir que nenhum número de dashboard, relatório ou sino mudou além do que a B1–B4 prometem |
| D61 | **03-E: K0–K4 decididas por você, uma de cada vez, e o desenho aprovado** ("Aprovado! Nao precisa me apresentar o plano, pode implementar."). A M2 entrou com o seu "aplique a M2" e a **M2b** (o `create or replace` de `account_balance_before` pela data de caixa, que **não** estava no `MIGRATIONS.md`) com o seu "aplique a M2b", separado — as duas pelo MCP, conferidas pelo objeto e não pela versão do histórico (D59). O gerador de tipos trouxe de novo a relationship de `import_rows` e a sintaxe nova dos genéricos; **só as 3 linhas da coluna** entraram. A prova de efeito zero da B1 contra dado real ficou fraca porque você tinha apagado o financeiro para reimportar; a comparação com **dado sintético** (autorizada por você, plano mostrado antes) é o substituto, e o MCP recusou o `delete` final — os 11 marcados saíram pelo SQL Editor, por você |
| D62 | **A 03-E foi integrada na sessão que a escreveu, a seu pedido** ("Pode subir para o git em uma branch, fazer pr e merge"), **com** revisão final da branch no modelo mais capaz e **sem** auditoria de módulo. Pela primeira vez o aval cobriu **também o merge em `main`**. A branch nasceu de `main` (`7d37305`, que já tinha os PRs #58 e #59), então o merge trouxe esses commits para esta branch e a árvore integrada é **igual** à da ponta |
| D64 | **A 03-G foi integrada na sessão que a escreveu, a seu pedido** ("Pode fazer pr e merge no git"), **com** revisão final da branch no modelo mais capaz e **sem** auditoria de módulo. Merge `--no-ff` em `6c158e9`, árvore idêntica à da ponta (`dfcc1cd`). A `main` tinha andado (PRs #61 e #63) e entrou por merge em `a8537d6`: dois conflitos (`queries.ts`, `caixa-leitura.ts`) resolvidos juntando os lados, e a varredura da L8 **achou a leitura nova** das compras das faturas pagas (106 → 107) — ela já tratava o erro. O aval cobriu push, PR **e** merge em `main` |
| D63 | **03-F: K0–K3 decididas por você, uma de cada vez, e o desenho aprovado** ("Aprovado"). A **M-F** (`pagar_fatura` e `desfazer_pagamento_fatura`, que **não** estava no `MIGRATIONS.md`) entrou com o seu "Aplique", numa mensagem só para isso, pelo MCP, conferida pelo objeto (`pg_proc`: invoker, `search_path` vazio, grants) e não pela versão do histórico (D59). **Antes do aplique, o `migration-validator` achou três guardas de lógica (P3) e você as incluiu** ("Incluir as três") — a D-F12 do contrato; o FINDING-005 (referências do payload não conferidas) ficou como risco aceito (RR-F-4). O gerador de tipos trouxe de novo a relationship de `import_rows` e a sintaxe nova dos genéricos; **só as duas funções** entraram. A prova no banco é **sequencial** (o MCP serializa as chamadas, sem `dblink`) e o `delete` da fatura sintética voltou `declined` — a remoção ficou com você. Integrada na sessão que a escreveu, ao você pedir o prompt da próxima fase (memória de 2026-10-11): merge `--no-ff` em `84bf87b`, árvore idêntica à da ponta; **push e PR só com o seu aval** |
| D65 | **Referência visual do Painel financeiro e do Dashboard** (2026-10-25, a seu pedido: *"Vamos seguir o plano que já tem, mas adaptar para a referência visual. Esquece a sidebar."*). O print 1 vira o alvo da **04-A** (`/dashboard/financeiro`), o print 2 o da **06**, e o relatório de `/relatorios` ganha a **04-A2** com as mesmas peças. Os prints **não** entram no repositório (público; o print 2 tem cara de dado real), então são descritos em palavras em `REFERENCIA-VISUAL.md`, com os desvios no §6 (sem metas financeiras, sem logos de banco, sem últimos dígitos, rosca na paleta validada, base sempre visível). A sequência antiga da 06 (Prioridades do dia, Organização, Saúde) foi substituída pela do print. Nenhuma migration, nenhuma regra de negócio mudou |
| D68 | **04-A: K1–K5 decididas por você, uma de cada vez; K6 e K7 por delegação** ("Pode seguir como achar melhor"), e o desenho, a prévia e o plano aprovados. Executada na sessão que a escreveu (inline, um commit por passo), com revisão final da branch inteira e **sem** auditoria de módulo. Integrada **localmente** em `a972712` a seu pedido ("envia o prompt da proxima fase"), **sem push** (D67). O `.env.local` foi copiado para a worktree com a sua autorização (ignorado pelo git). **Custo aceito:** a régua do sino mudou de texto e de critério junto com a do painel (K3) — um alerta de gasto alto que aparecia no meio do mês pode deixar de aparecer, porque a comparação passou a ser justa |
| D73 | **04-B: "onde abrir" e a D-A2-6 delegados a mim** ("faz como ficar melhor na sua sugestão"): gaveta sob demanda por `?detalhe=`, construída no servidor; caixa abre sem recorte e com recorte continua "não segue". A prévia foi aprovada por você ("Aprovado!") antes do código; o aval para copiar o `.env.local` à worktree e para integrar ("pode integrar") também. Integrada local, sem push (D67) |
| D74 | **08: K1–K6 decididas por você** (K1 opção a; K2 consertar aqui; K3, K4 e K6 adiar; K5 não trocar o rótulo) e o desenho e o plano aprovados; **K7 e C5.2 aprovadas** durante a execução ("Sim", "Aprovo"). Os fluxos que gravam ficaram fora do banco real, por escolha sua (opção b: "Pode ser a recomendada!"). O `.env.local` foi copiado para a worktree com o seu aval e apagado no fim. Execução via router (DeepSeek e subagentes Haiku), revisão final no modelo mais capaz. **Custo aceito:** uma regressão de escrita que a suíte não pegue só aparece em produção |
| D72 | **04-A2: decididos por você** o recorte honesto (o bloco que o filtro não alcança diz "não segue", nunca zero), a responsabilidade "meu" como padrão (como o painel), os três controles sem JS novo, o recorte de pessoa só no que é item a item e o pendente só o dela; a prévia, o desenho e o plano aprovados em 2026-11-02. Integrada local, sem push (D67) |
| D71 | **05-C: decididos por você a prévia com a grade transposta (meses nas linhas, cartões nas colunas), Relatórios em tela própria mais a correção da aba Cartões de `/relatorios`, a navegação na ordem do `NAVEGACAO.md` §4 e as três pendências de `/faturas` (prevista de qualquer mês, desativado sem prevista, olho)**. O desenho e o plano foram aprovados. A execução seguiu o ai-router, com subagentes Sonnet e Haiku, porque o Codex e o DeepSeek estavam indisponíveis. Houve revisão final da branch e **nenhuma** auditoria de módulo. Integrada **localmente** em `30964b8` a seu pedido ("Me envia o prompt da proxima fase"), **sem push** (D67). O `.env.local` foi copiado para a worktree para a conferência visual e apagado no fim. A próxima fase é a **06**, por sua escolha |
| D71 | **04-C: o §11 (reconciliação com o código de 2026-11-02) e a tela de Terceiros por pessoa (§11.3) foram aprovados por você** antes de qualquer código. Executada por subagentes Sonnet via router (Codex e DeepSeek indisponíveis), com revisão final no modelo mais capaz e **sem** auditoria de módulo. As três migrations só depois de um "aplique" seu, uma por mensagem; a M2 e a M3 por você no SQL Editor, conferidas pelo objeto (D59). O `.env.local` foi copiado para a worktree para a conferência visual, com o seu aval, e apagado depois. Integrada **localmente** em `86d850a` a seu pedido ("Integre a 04c"), **sem push** (D67). **Custo aceito:** o desfazer de recebimento manual realoca pelo TS (sem trigger de delete), e o `CLAUDE.md` fica sem a invariante até você copiá-la |
| D70 | **05-B: a prévia (com as quatro escolhas do agente: um cartão por vez, projeção = "sem lançamentos conhecidos", "Pagar antes de fechar" mantido, total ≤ 0 fora de "Precisam de pagamento"), o desenho e o plano foram aprovados por você**, e o selo da fatura vencida de total zero ficou **idêntico** ao da Visão geral ("Pode manter identico"). Executada por subagentes Haiku/Sonnet via router (os workers externos estavam indisponíveis), com revisão final da branch inteira e **sem** auditoria de módulo. Integrada **localmente** em `bae44af` a seu pedido ("Me envia o prompt da proxima fase da 5"), **sem push** (D67). O `.env.local` foi copiado para a worktree para a conferência visual e apagado depois (ignorado pelo git) |
| D69 | **05-A: o layout "B" da Visão geral, fechada × aberta em tabelas separadas e Meus cartões inalterado foram decididos por você**, e a prévia foi aprovada em 2026-11-02 (16 prints, fora do git). Integrada **localmente** em `6cfa3b9` a seu pedido ("integre a 05-A"), **sem push** (D67), numa sessão que não a escreveu: os cinco foram rodados de novo sobre a árvore integrada. Merge sem conflito com a 04-A. **Custo aceito:** os links para `/cartoes` (busca, `card_limit`, IA) passam a abrir a Visão geral, e não a lista de cartões |
| D67 | **Fim da publicação por partes** (2026-11-02, a seu pedido: *"juntarmos todas as proximas fases em um unico PR e fazer merge uma vez so, pois o deploy da vercel é muito caro"*). Substitui a D54. Cada fase continua sendo integrada por merge `--no-ff` nesta branch, mas **nenhuma é empurrada**: um push gera um deploy de prévia na Vercel (e, com o PR #65 aberto sobre esta branch, atualiza o PR), e um merge em `main` gera um de produção. O PR #65 (03-G2) fica aberto e vira o PR único; no fim, um push, revisão do título e da descrição, CI verde e **um** merge, com o seu pedido explícito. **Custo aceito:** até o push final, os commits integrados só existem neste disco — e `main` pode andar por outras branches (agenda, IA), então o merge final pode trazer conflitos para resolver uma vez só. O portão de ancestral dos prompts não muda: ele confere esta branch local |
| D66 | **A 03-G2 foi integrada na sessão que a escreveu, a seu pedido** ("Me envia o prompt da proxima fase e já faz o pr e tudo mais dessa no git"), **com** revisão final da branch no modelo mais capaz e **sem** auditoria de módulo. Merge `--no-ff` em `a70c541`; a árvore difere da ponta (`dc9e641`) só nos documentos da D65. O aval cobre o push e o PR; **"tudo mais" não foi lido como merge em `main`** — merge em `main` é produção e fica com você. A migration `salvar_lancamento_atomico` foi aplicada **por você no SQL editor** (o `apply_migration` do MCP foi recusado), conferida pelo objeto e não pela versão do histórico (D59) |

## Bloqueios

Nenhum.

## Riscos abertos

~~`R1` cor de entidade "Dourado" ligada a `bg-primary`~~ **FECHADO na 02-A**, com teste e
mutação · `R2` **3,1 KB** de folga de bundle na casca (eram 3,3; o link de pular custou 0,2) ·
`R3` ids de card do dashboard · ~~`R4` deep-link para rota inexistente~~ **FECHADO**
(02-D → 02-E → merge `1b5aa28`), com mutação nas três etapas · **`R5` mudar número sem
perceber — MITIGADO nas quatro funções do núcleo pela 03-A; o pipeline que as alimenta virou
UM na 03-B, e os riscos dele foram fechados na 03-B2 (tela e sino com uma régua só no gasto
alto); a entrada repartida da 03-C nasceu com a partição testada e 16 mutações; a marcação da
categoria (03-C2) nasceu com uma varredura por allowlist provando que nenhum motor, relatório,
IA ou sino a lê, e 19 mutações; o recebimento parcial (03-D) nasceu com o estado derivado da soma,
uma leitura e uma escrita provadas por varredura, e 48 mutações; CONTINUA
ABERTO no resto** (ver abaixo) · `R6` estado vivo (sessão de treino, chat) · `R7` salvar layout sequestra o período.
Detalhe em `AUDITORIA.md` §4.

**O que a 03-A fechou do `R5`, e o que ela não fechou.** Fechou: `resumoMes`,
`gastosPorCategoria`, `proximas6Faturas` e `totalAReceber` — qualquer mudança de número nas
quatro fica vermelha, e 19 mutações confirmam isso. **Não fechou:** `gastosPorForma`,
`comparativoMesAMes`, `evolucaoMensal`, `projecaoProximosMeses`, `proximasContasPagar` e
`gerarAlertas` seguem só com o que `dashboard.test.ts` já afirmava; e a subtração
`meu = total − terceiros` escrita **em cinco lugares** (§5 do dicionário) continua sem teste
que prove que as cinco concordam. ⛔ **Nada fora de `dashboard.ts` foi caracterizado** —
`invoice.ts`, `split.ts` e `daily-balance.ts` não foram tocados por esta subfase.

**Como o `R4` foi fechado, em três etapas.** A 02-D cobriu o menu (20 hrefs) e os três
módulos com arquivo de links (Dieta 8, Treinos 11, IA 9). A 02-E acrescentou as **25 seções**
dos navs de módulo. O merge `1b5aa28` fechou o que faltava: os **29 pontos de link montados
inline** em `search/queries.ts`, `notifications/generate.ts` e `notifications/nutrition.ts`.

**Todas as três etapas passam pelo mesmo `temPagina`**, de `src/test/rotas.ts` — nenhuma
segunda resolução de rota nasceu no caminho, que era o risco de fechar isso às pressas.

⚠️ **O que continua aberto, e é menor mas não é nada:** a varredura inline cobre os **3
arquivos declarados em `VARRIDOS`**; um quarto arquivo que passe a montar rota à mão precisa
ser acrescentado ali. E nenhuma das três etapas prova que a **query string** faz sentido — só
que a rota existe.

## Testes executados

| Comando | REDESIGN-00/01 | 02-A | 02-B | 02-C | 02-D | 02-E |
| --- | --- | --- | --- | --- | --- | --- |
| `npm run test:run` | ✅ 185 / 3.738 | ✅ 186 / 3.745 | ✅ 187 / 3.757 | ✅ 188 / 3.770, 13,59 s | ✅ 189 / 3.818, 13,35 s | ✅ **190 / 3.880**, 15,62 s |
| `npm run lint` | ✅ exit 0 | ✅ exit 0 | ✅ exit 0 | ✅ exit 0 | ✅ exit 0 | ✅ exit 0 |
| `npx tsc --noEmit` | ✅ exit 0 | ✅ exit 0 | ✅ exit 0 | ✅ exit 0 | ✅ exit 0 | ✅ exit 0 |
| `npm run build` | ✅ exit 0 | ✅ exit 0 | ✅ exit 0 | ✅ exit 0 | ✅ exit 0 | ✅ exit 0 |
| `npm run perf:bundle` | ✅ mediana 213,9 · config. 281,6/285 | ✅ 213,9 · 281,7/285 | ✅ 213,9 · 281,7/285 | ✅ mediana 214,2 · config. 281,9/285 | ✅ **idêntico à 02-C** — 214,2 · 281,9/285 · 68 rotas | ✅ **idêntico à 02-D** — 214,2 · 281,9/285 · 68 rotas |

**Depois do merge do `R4` (`1b5aa28`), na árvore integrada:** `test:run` ✅ **191 / 3.922**
(13,02 s) · `lint` ✅ · `tsc` ✅ · `build` ✅ · `perf:bundle` ✅ mediana **214,2**, 68 rotas
dentro, `/(app)/configuracoes` **281,9/285**. Os cinco foram rodados **depois** do merge, e
não herdados da 02-E.

**REDESIGN-03-A:** `test:run` ✅ **192 / 3.987** · `lint` ✅ · `tsc` ✅ · `build` ✅ ·
`perf:bundle` ✅ mediana **214,2**, 68 rotas, `/(app)/configuracoes` **281,9/285** —
**idêntico à linha de base**, que é o resultado esperado de um arquivo que não toca runtime, e
foi rodado para confirmar em vez de ser afirmado. O delta de **+1 arquivo e +65 casos** foi
**medido removendo e recolocando o arquivo** (sem ele: 191 / 3.922), não deduzido. A suíte
passa em `TZ=UTC` e em `TZ=Pacific/Kiritimati` (UTC+14) com os mesmos 65 verdes.

**REDESIGN-03-B, depois do merge `ad9f359`:** `test:run` ✅ **195 / 4.033** (15,17 s) · `lint` ✅
· `tsc` ✅ · `build` ✅ · `perf:bundle` ✅ mediana **214,2**, 68 rotas, `/(app)/configuracoes`
**281,9/285** · `/(app)/dashboard/financeiro` **200,9** · `/(app)/dashboard` **203,8** ·
`/(app)/relatorios` **204,1** — **idênticos à linha de base**, e aqui isso é afirmação com
alvo: a página do dashboard financeiro passou a importar `pipeline.ts`, e ele não arrastou
nada para o cliente. Delta de **+3 arquivos e +46 casos**, todos da 03-B. A árvore integrada
tem o **mesmo hash** da ponta da branch — e os cinco rodaram de novo mesmo assim.

**REDESIGN-03-B2, depois do merge `b06f160`:** `test:run` ✅ **201 / 4.099** (19,92 s e 15,22 s
na mesma árvore — a variação entre rodadas é maior que o efeito da subfase) · `lint` ✅ · `tsc`
✅ · `build` ✅ · `perf:bundle` ✅ mediana **214,2**, 68 rotas, `/(app)/configuracoes`
**281,9/285** · `/(app)/dashboard` **203,8** · `/(app)/relatorios` **204,1** ·
`/(app)/financeiro` **195,9** · `/(app)/financeiro/contas` **214,0** ·
`/(app)/dashboard/financeiro` **201,0** — o valor exato é 200,951 KB, na fronteira do
arredondamento (era 200,9); o único texto novo que chega ao cliente está num chunk carregado
só por `/(app)/ia/configuracoes`. Delta de **+6 arquivos e +66 casos**, todos da 03-B2. A
árvore integrada tem o **mesmo hash de tree** da ponta da branch, e os cinco rodaram depois do
merge mesmo assim.

**REDESIGN-03-C, depois do merge `22ec12f`:** `test:run` ✅ **205 / 4.155** (16,03 s) · `lint` ✅
· `tsc` ✅ · `build` ✅ · `perf:bundle` ✅ mediana **214,2**, 68 rotas, todas dentro ·
`/(app)/financeiro/lancamentos` **220,9** (era 218,7: +2,2 do componente da A3, o formulário
não é carregado sob demanda — RR9) · `/(app)/dashboard/financeiro` **201,1** ·
`/(app)/relatorios` **204,2** · `/(app)/dashboard` **203,8** · `/(app)/financeiro` **195,9**.
Delta de **+4 arquivos e +56 casos**, todos da 03-C. Na ponta da branch, `TZ=UTC` em
`finance/` + `notifications/`: 25 arquivos / 459 verdes. A árvore integrada tem o **mesmo
hash de tree** da ponta (`59d208f`), e os cinco rodaram depois do merge mesmo assim.

**REDESIGN-03-C2, depois do merge `31bef87`:** `test:run` ✅ **214 / 4.229** (17,70 s) · `lint`
✅ · `tsc` ✅ · `build` ✅ · `perf:bundle` ✅ mediana **214,2**, 68 rotas, todas dentro,
`/(app)/configuracoes` **281,9/285** · `/(app)/financeiro/categorias` **213,1** (era 211,9: +1,2
do campo, do agrupamento e do selo — o formulário recebe o próprio botão por `trigger` e não é
carregado sob demanda) · `/(app)/financeiro/lancamentos` **221,7** (era 220,9: +0,8 do atalho e
do filtro) · `/(app)/dashboard/financeiro` **201,1** · `/(app)/relatorios` **204,2** ·
`/(app)/dashboard` **203,8** · `/(app)/financeiro` **195,9**. Delta de **+9 arquivos e +74
casos**, todos da 03-C2. Na ponta da branch, `TZ=UTC` em `finance/` + `notifications/`: 32
arquivos / 523 verdes. A árvore integrada tem o **mesmo hash de tree** da ponta (`8f01d63`), e
os cinco rodaram depois do merge mesmo assim.

**REDESIGN-03-D, depois do merge `545acf4`** (numa worktree em `C:\tmp`, com o checkout em LF
como o índice e o CI): `lint` ✅ · `tsc` ✅ · `build` ✅ · `perf:bundle` ✅ mediana **214,9**, 68
rotas, todas dentro, `/(app)/configuracoes` **281,7/285** · `/(app)/terceiros` **221,3** (era
219,3: +2,0 do saldo, do histórico e do diálogo) · `/(app)/faturas` **203,3** (era 202,3) ·
`/(app)/parcelamentos` **204,4** (era 203,4) · `/(app)/dashboard/financeiro` **202,1** (era
201,1) · `/(app)/relatorios` **205,2** (era 204,2) · `/(app)/dashboard` **203,7** · `TZ=UTC` em
`finance/` + `notifications/`: **40 / 670** verdes. ⚠️ `test:run`: **4.416 / 4.418** — os dois
que caíram são `boundaries.test.ts` estourando o limite de 5 s (ele lê todo o `src/`, e o disco
do caminho novo estava frio); sozinho ele passa 26/26, e a suíte com `--testTimeout=30000` dá
**229 / 4.418** verdes. Na ponta da branch, no diretório principal, os cinco tinham passado sem
ressalva: **229 / 4.418**, mediana **215,1** (a worktree não tem `.env.local`, daí 0,1–0,2 KB a
menos por rota). Delta de **+15 arquivos e +189 casos**, todos da 03-D. A árvore integrada é a
da ponta mais a D54 (ver D60). ⚠️ Uma primeira tentativa, num caminho longo e com o checkout em
CRLF, quebrou o build (limite de caminho do Windows) e `schema.test.ts` (ele procura texto com
LF numa migration) — ambiente, não código.

⚠️ **A 03-C é a primeira subfase a editar a caracterização da 03-A** — só no que foi escrito
para virar ali (blocos 1–4 ganharam chaves, bloco 6 e [5 ⚠️] reescritos). Fora dela,
`limiares-de-alerta.test.ts` e o teste do coletor de insight ganharam as duas chaves por
exigência do tipo, sem mudar afirmação; `round-trip`, `registry`, o adapter e o command do
Financeiro ganharam casos novos.

Em cada subfase o delta de testes é **exatamente** o que foi acrescentado (02-A: +1 arq./+7
casos; 02-B: +1 arq./+12; 02-C: +1 arq./+13; 02-D: +1 arq./+48 — 27 do `nav.test.ts`, 9 da
Dieta, 12 de Treinos; 02-E: +1 arq./+62, todos de `module-shell.test.ts`; **`R4`: +1 arq./+42**,
todos de `deep-links-inline.test.ts`). **Nenhum teste existente foi afrouxado para passar.**

⚠️ **Ressalva de honestidade da 02-D:** ela é a primeira subfase que **editou arquivos de
teste existentes** — `active.test.ts` e `ai-links.test.ts` tiveram a resolução de rota trocada
pela compartilhada. Nenhuma afirmação mudou e a contagem dos dois ficou igual (13 e 11), mas
"não mexeu em teste existente" deixou de ser verdade a partir daqui.

E o `perf:bundle` da 02-D ser idêntico ao da 02-C **é o resultado esperado, não uma
coincidência**: a subfase não altera um arquivo de runtime sequer. Ele foi rodado justamente
para confirmar isso em vez de eu afirmar.

**Depois do merge da 03-E (`de6ef19`), na árvore integrada** — idêntica à da ponta
`319b45f`: `lint` ✅ · `tsc` ✅ · `build` ✅ · `perf:bundle` ✅ mediana **216,3**, 68 rotas,
todas dentro · `test:run` **277 / 6.546**, 6.545 ✅ e 1 ❌ — de novo a de ambiente
(`schema.test.ts` lendo migration com CRLF na cópia de trabalho desta worktree; 32/32 no
diretório principal). Na ponta, no diretório principal, os cinco tinham passado sem ressalva:
**277 / 6.546**, mediana **216,3**; `TZ=UTC` em finance/notifications/reports **51 / 835**.
Rotas tocadas, antes → depois (KB gz): `/financeiro/lancamentos` 226,0 → 226,4 ·
`/relatorios` 208,5 → 210,3 · `/dashboard/financeiro` 205,4 → 207,2; `/dashboard`,
`/financeiro` e `/financeiro/contas` iguais.

**Depois do merge da 03-F (`84bf87b`), na árvore integrada** — idêntica à da ponta
`5e7e221`: `lint` ✅ · `tsc` ✅ · `build` ✅ · `perf:bundle` ✅ mediana **216,3**, 68 rotas,
todas dentro · `test:run` **281 / 6.631**, 6.630 ✅ e 1 ❌ — a mesma de ambiente
(`approval/schema.test.ts` lendo migration com CRLF na cópia de trabalho desta worktree; 32/32 no
diretório principal). Na ponta, no diretório principal, os cinco tinham passado sem ressalva:
**281 / 6.631**, mediana **216,3**; `TZ=UTC` em finance/actions/notifications **56 / 943**.
Rotas tocadas, antes → depois (KB gz): `/faturas` 206,7 → 206,9 · `/financeiro/lancamentos`
226,4 → 226,3; `/cartoes` e `/dashboard/financeiro` iguais.

**03-G, na ponta (`d888c17`), no diretório principal:** `test:run` ✅ **292 / 6.783** · `lint` ✅ ·
`tsc` ✅ · `build` ✅ · `perf:bundle` ✅ mediana **217,8** (era 216,3; o degrau é o limite de erro do
app em toda rota), 68 rotas dentro; `TZ=UTC` em finance/actions/notifications **63 / 1.063**.
**Depois dos merges (`a8537d6`), na árvore integrada, com `npm ci`:** `lint` ✅ · `tsc` ✅ ·
`build` ✅ · `perf:bundle` ✅ mediana **202,0** (as dependências do #63), 68 rotas dentro ·
`test:run` **296 / 6.833**, 6.832 ✅ e 1 ❌ — a mesma de ambiente (`approval/schema.test.ts` com
CRLF nesta worktree) · finance/actions/notifications **66 / 1.098** em Brasília e em `TZ=UTC`.

**Depois do merge da 03-G2 (`a70c541`), na árvore integrada:** `lint` ✅ · `tsc` ✅ · `test:run` **309 / 6.992**, 6.991 ✅ e 1 ❌ — a mesma de ambiente (`approval/schema.test.ts` lendo migration com CRLF na cópia de trabalho desta worktree; no índice o arquivo é LF).
Na ponta (`c46f9fd`/`dc9e641`), na worktree, os cinco tinham passado: **309 / 6.992** · `lint` ✅
· `tsc` ✅ · `build` ✅ · `perf:bundle` ✅ mediana **202,1**, 68 rotas dentro; `TZ=UTC` em
finance/actions/notifications **1.254** verdes.

**Depois do merge da 04-A (`a972712`), na árvore integrada:** `lint` ✅ · `tsc` ✅ · `build` ✅ ·
`perf:bundle` ✅ mediana **202,1**, 68 rotas dentro · `test:run` **320 / 7.175**, 7.174 ✅ e 1 ❌ —
a mesma de ambiente (`approval/schema.test.ts`, CRLF na cópia de trabalho desta worktree). Na
ponta (`5fbd9f4`), na worktree da fase, os cinco tinham passado com **320 / 7.175**;
`/dashboard/financeiro` **200,4 KB**; `TZ=UTC` em 74 arquivos / 1.193 testes.

**Depois do merge da 05-A (`6cfa3b9`), na árvore integrada:** `lint` ✅ · `tsc` ✅ · `build` ✅ ·
`perf:bundle` ✅ mediana **201,4**, 69 rotas dentro · `test:run` **322 / 7.210**, 7.209 ✅ e 1 ❌ —
a mesma de ambiente (`approval/schema.test.ts`, CRLF na cópia de trabalho).

**Depois do merge da 05-C (`30964b8`):** a árvore integrada é idêntica à da ponta (`822c1bb`).
Os cinco comandos rodaram sobre essa árvore e passaram: `test:run` **331 / 7.390**, `lint`,
`tsc`, `build` e `perf:bundle` (mediana **202,3**, 71 rotas dentro). Na worktree de integração,
uma rodada foi contaminada por um merge alheio, abortado no meio dela (ver Pendências da 05-C).

## Próximo passo — o merge do PR único #65

**O redesign está fechado** (08 ✅). O que falta é seu: o merge de `feat/redesign-08-entrega` em
`feat/redesign-00-auditoria`, o push e o merge do **PR #65** em `main` (D67), com o texto de
`docs/redesign/PR-65.md` e, antes, os dois números do §1 de `docs/redesign/REVERSAO.md`. Se a **09**
(visual em vidro, decidida em 2026-11-07) vier antes, ela nasce desta ponta e o PR espera por ela.

### Histórico — o passo anterior (08)


**A REDESIGN-04 está fechada:** a 04-B (`e4b8aa8`) e a 04-C (`86d850a`) estão integradas. Vem a
**REDESIGN-08** (regressão e entrega — o prompt já foi entregue a você e exige as duas integradas
no portão: `264aa8d` e `4617f34` são ancestrais desta branch) e o merge do **PR único #65**
(D67), quando você pedir. Antes do merge final: copiar a invariante do §13.6 do desenho da 04-C
para o `CLAUDE.md`.

### Histórico — o passo anterior (04-C)

**A 04-B está integrada** (`e4b8aa8`). Falta a **04-C** (`feat/redesign-04c-reembolso`, em
`C:/tmp/04c-reembolso`, em outra sessão — no plano, `264aa8d`). Ela toca peças comuns já mexidas
pela 06 e pela 04-B (`indicador.tsx`, `card-sem-leitura.tsx`, os clientes do Painel e do
Relatório): a integração pode ter conflito ali. Fechada e integrada a 04-C, vem a **REDESIGN-08**
(regressão e entrega: o prompt já foi entregue a você e exige as duas integradas no portão) e o
merge do **PR único #65** (D67), quando você pedir.

### Histórico — o passo anterior (04-B e 04-C)

**A 06 está integrada** (`9915d99`). Falta a **04-B** (todo indicador abre os registros que o
explicam, e os totais conciliam), que anda em `C:/tmp/04b-detalhamento`, e a **04-C**
(`feat/redesign-04c-reembolso`), em outra sessão. As duas tocam peças comuns já mexidas pela 06
(`indicador.tsx`, `card-sem-leitura.tsx`): a integração delas pode ter conflito ali. Fechadas a
04-B e a 04-C, vem a **REDESIGN-08** (regressão e entrega) e o merge do **PR único #65** (D67),
quando você pedir.

### Histórico — o passo anterior (06 e 04-B em paralelo)

**A REDESIGN-05 está fechada** (`30964b8`). A **06** é o Dashboard geral (`/dashboard`) no visual
do **print 2** (D65): barra → banner → Resumo financeiro (4 indicadores) → grade dos 11 cards. O
desenho é o do `PLANO.md` §REDESIGN-06 e do `REFERENCIA-VISUAL.md` §2, §5, §6 e §7. As peças
comuns da 04-A (banner, indicador, bloco, olho) são **reusadas, nunca copiadas**. O print fica em
`C:/Users/Yuri/Documents/Desenvolvedor/yuri.app.pessoal/docs/redesign/referencias/print-2-dashboard.png`,
fora do git. O portão confere `30964b8`.

A **04-A2 está integrada** (`d5fb873`). A **04-B** entrega o aceite que falta à REDESIGN-04:
**todo indicador abre os registros que o explicam, e os totais conciliam** — no Painel e na aba
Financeiro do Relatório, com os mesmos mês, base, responsabilidade e recortes da tela, a soma
vinda do motor (nunca um segundo cálculo) e "parcial", vazio, falha e "não segue" distintos. O
§11 do desenho da 04-A2 manda para ela também "abrir os registros por trás do caixa" (D-A2-6). O
portão confere `a428f1b` (04-A2), `1d5fefa` (05-B) e `851ed79` (05-C). A 06 e a 04-B tocam peças
comuns (`src/components/shared/painel/`): a segunda integração pode ter conflito ali e no STATUS.

A **04-C** (`feat/redesign-04c-reembolso`) anda em outra sessão, não integrada; a 04-B não toca
`/terceiros`.

### Histórico — o passo anterior (04-A2 e 05-B em paralelo)

**A 04-A está integrada** (`a972712`). A 04-A2 é `/relatorios`, aba Financeiro: as peças que a
04-A criou (indicador, bloco, olho, gráficos — **sem banner**), **reusadas e nunca copiadas**, a
barra de filtros completa (período, base, responsabilidade, conta, cartão, pessoa, categoria) e a
sequência Resumo → Evolução → Composição → Detalhamento → Projeções. As outras abas ficam como
estão. Leia `REFERENCIA-VISUAL.md` §2, §4, §6 e §7 e o §11 do desenho da 04-A; o print 1
(`C:/Users/Yuri/Documents/Desenvolvedor/yuri.app.pessoal/docs/redesign/referencias/print-1-financeiro.png`,
fora do git) vale para as peças.

Vão para ela: o "meu × meu" no relatório (RR5 e RR4 no relatório — hoje `relatorios-client.tsx`
lê `apresentarEntradas`), o "parcial" nas telas, RR-C2-10 (filtro ligado × desligado no escuro) e
os achados do §13.5 da 04-A que tocam as peças reusadas (o olho mudo para leitor de tela, a dica
(i) só por `title`, a legenda "parcial" sobre o vazio), se você decidir consertá-los ali.

A **05-B** (Faturas e pagamentos) roda ao lado dela. As vencidas aparecem primeiro, depois a
atual e as a vencer, e o detalhamento fica dentro da fatura. O pagamento reusa a 03-F, com o
reenvio tratado. Também entram a P1-2 em `/faturas`, a troca de `StatCard` e selos pelas peças da
04-A, reusadas e nunca copiadas, e a seção renomeada para "Faturas e pagamentos". O portão
confere `20c17a6` (05-A) e `9342fbb` (04-A). As duas fases tocam peças comuns: se uma precisar de
uma variante nova em `src/components/shared/painel/`, a segunda integração pode ter conflito ali
e no STATUS.

A **04-C** (`feat/redesign-04c-reembolso`) anda em outra sessão, não integrada; nem a 04-A2 nem a
05-B a tocam.

⚠️ **Pendências suas, herdadas:** a conferência dos achados do §13.5 da 04-A; a conferência visual da 03-G e da 03-G2; remover a fatura
sintética `[03F-SINT]` e conferir o diálogo de desfazer (D63); a conferência com dado real da
03-B, da 03-B2, da 03-C, da 03-C2, da 03-D (D39, D44, D48, D52, D60) e a visual a 390 px da 03-E
(RR-E-13).

🚀 **Publicação (D67, substitui a D54):** a integração continua sendo merge `--no-ff` nesta
branch, **mas sem push e sem PR por fase**. Todas as fases seguintes vão a `main` juntas, pelo
PR #65 (aberto, cabeça = esta branch), com **um merge só**, quando você pedir.
⛔ **Todo prompt de fase TEM de dizer isto nas Regras:** *"Publicação (D67): sem push, sem PR,
sem merge em main e sem deploy. A integração em feat/redesign-00-auditoria é local; o push e o
merge do PR único (#65) acontecem uma vez só, no fim, a pedido do dono."* Motivo: cada push numa
branch ligada à Vercel gera um deploy de prévia, e cada merge em `main` gera um de produção.

⚠️ **O NÚMERO DE COMMITS À FRENTE NÃO MORA AQUI — meça** (D34):

```bash
git rev-list --count main..feat/redesign-00-auditoria
```

Número que o próprio ato de registrar invalida não é um fato a documentar, é um comando.
