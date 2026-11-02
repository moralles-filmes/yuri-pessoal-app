# REDESIGN-06 — Dashboard geral no visual do print 2 (desenho)

**Data:** 2026-11-02 · **Branch:** `feat/redesign-06-dashboard` (nascida de `e986e13`, ponta de
`feat/redesign-00-auditoria`; portão `30964b8` conferido) · **Worktree:** `C:/tmp/06-dashboard`

**Referência visual (D65):** o print 2, fora do git
(`C:/Users/Yuri/Documents/Desenvolvedor/yuri.app.pessoal/docs/redesign/referencias/print-2-dashboard.png`),
descrito em `docs/redesign/REFERENCIA-VISUAL.md` §2, §5, §6 e §7. ⛔ Nunca copiá-lo para o repositório.

**Prévia aprovada pelo dono em 2026-11-02** ("Aprovado!"): Artifact privado
`https://claude.ai/artifact/P67zPK3mhW1gPqgJ28A2nG`, só com dado sintético (hoje fictício
terça, 18/11/2026; "Nome", "Cartão A/B/C", "Tarefa A…D", "Categoria A…J"). Ela é a referência de
layout deste documento, nas 4 larguras e nos 2 temas, com os estados Personalizar, falha num card,
falha na faixa, leitura parcial e olho fechado.

**Publicação (D67):** sem push, sem PR, sem merge em `main`, sem deploy. Commits locais na branch.
Nenhuma migration. `docs/redesign/STATUS.md` não é editado durante a execução.

---

## 1. Intenção

`/dashboard` é a primeira tela do sistema. Hoje ela é uma grade de 11 cards iguais em forma, todos
com a mesma moldura neutra, e o dinheiro aparece só dentro do card Financeiro, com números que não
batem em rótulo com o painel financeiro que a 04-A acabou de entregar. A 06 dá a ela a linguagem do
print 2, a mesma do painel financeiro: banner, uma faixa de quatro números de dinheiro no topo e uma
grade de cards com ícone em quadrado, quadros de número e "Ver mais ›".

O que não muda é a regra do projeto: **integridade dos dados vence estética**. Ausência não vira
zero, erro não vira zero, cor nunca vem sozinha, toda base fica visível, e nada que existe hoje some
sem desvio escrito.

## 2. Metas, não metas e anti-metas

**Metas**
- Barra → banner → Resumo financeiro (faixa de 4) → grade dos 11 cards, como na prévia aprovada.
- A faixa e o card Financeiro saem de **uma** leitura (`cache` do React), com 6 meses de janela.
- Erro isolado por bloco: cada card **e** a faixa caem sozinhos, sem derrubar a página.
- Os pendentes que o PLANO manda para a 06: F3, R7, D15, RR4 no card Financeiro, "parcial" na
  tela, divergência do `card-meta.ts` em Notificações.

**Não metas**
- Sidebar, cabeçalho e barra inferior do app (decisão do dono, D65).
- Tamanho por card no layout salvo (o formato salvo guarda só `order`, `hidden`, `period`, `view`).
- Seletor de janela nas barras do card Financeiro (D-A-6 da 04-A: seletor sem leitura nova seria
  botão que não liga nada).
- Comparação do **saldo** com o mês anterior (exigiria um segundo `lerSaldoAte`; a 04-A também não
  tem).
- Qualquer número que a leitura atual não traga e que exija regra nova ou migration.

**Anti-metas (falha mesmo que funcione)**
- A faixa ler o financeiro por um caminho e o card por outro (o pipeline triplicado, P1-9).
- Ampliar `getFinanceCardData`: ela também alimenta o coletor de insight da IA (até 12 chamadas
  seguidas por varredura) e a ferramenta `finance` da IA. Aumentar a janela dela encareceria a IA
  em silêncio.
- Um card de "hoje" que não diz que é de hoje.
- Dia sem treino em vermelho (invariante 22 de Treinos).
- Clicar num card, quadro ou linha disparar escrita ou ação financeira.
- Qualquer coisa em `dashboard/` alcançar o runner de insight (`boundaries.test.ts` ~l. 552).

## 3. Decisões do dono nesta conversa

| # | Decisão | Palavras |
| --- | --- | --- |
| D-06-1 | A leitura financeira do dashboard passa de 1 para **6 meses**, para ter as barras e a comparação com o mês anterior | "Aceito os 6 meses" |
| D-06-2 | Na faixa, **Minhas entradas** (renda pessoal, RR4) e **Minhas saídas** (minha parte), como na 04-A — não o bruto do print | "Pode ser como recomendou." |
| D-06-3 | Conteúdo do card Financeiro: "Realmente meu" no topo, barras de 6 meses, "Ver relatório ›", três linhas embaixo | "Faz como ficar melhor" (decisão delegada; a proposta é minha) |
| D-06-4 | D15: com **mais de 8** categorias, as **7 maiores** + "Outros (N categorias)" na 8ª cor, com a lista das dobradas; aplicada **já na 06** à rosca da 04-A, aceitando conflito pequeno com a 04-A2 | "Sim" |
| D-06-5 | Densidade dos cards: **meio-termo** — anatomia do print + a lista ou linha mais útil de cada card; o resto sai com desvio declarado, um por um | "Pode ser" |
| D-06-6 | O resumo do desenho (§4–§8) | "Aprovado!" |
| D-06-7 | A prévia | "Aprovado!" |
| D-06-8 | O teto da leitura (2.000 lançamentos, ordem crescente) não pode cortar o mês da faixa: **duas leituras** dentro da mesma função com `cache` — o mês inteiro para os números, os 6 meses só para barras e comparação | "B" |

Decisões **minhas**, tomadas depois da revisão de quem constrói (o dono pode revê-las ao ler):
D-06-M1 o olho cobre só a faixa · D-06-M2 os estados das barras do Treinos (§4.7) · D-06-M3 o
"Tentar de novo" do limite de erro (§6) · D-06-M4 a prova da leitura única por varredura + `cache`
simulado (§9) · D-06-M5 Notificações passa a mostrar falha em vez de "Em breve" · D-06-M6 "até
DD/MM" fica fora das barras (o gráfico da 04-A não muda) · D-06-M7 a classe do indicador pequeno
vai para `shared/painel/`.

## 4. A página, de cima para baixo

`src/app/(app)/dashboard/page.tsx` continua `force-dynamic`, Server Component. O `PageHeader`
("Dashboard" + descrição) fica.

### 4.1 Barra

- **Seletor de período** (o `Select` atual: hoje / semana / mês / anterior / personalizado), a
  **troca de visão** Dia · Semana · Mês e o rótulo da janela, como hoje — mais compactos.
- **F3:** cada botão da troca de visão ganha `aria-pressed` (o selecionado `true`, os outros
  `false`), e o grupo ganha `role="group"` + `aria-label="Visão"`.
- **Personalizar** à direita, como hoje. No modo Personalizar: Salvar · Restaurar padrão · Cancelar
  (como hoje) e, na faixa de instrução, um **seletor "Período padrão"** explícito.
- **R7 (decisão minha, D-06-6):** `save()` deixa de mandar o período e a visão **da URL**. Manda
  `order`, `hidden` e o **período padrão escolhido no seletor** (que começa em `layout.period`), e a
  visão derivada dele pela mesma regra de `selectPeriod` (`semana`→`semana`, `hoje`→`dia`, o resto
  →`mes`). Quem salvar a ordem olhando "Hoje" continua com o padrão que tinha. "Restaurar padrão"
  continua indo para `DEFAULT_DASHBOARD_LAYOUT`.

### 4.2 Banner

`BannerDeBoasVindas` (peça comum da 04-A), **reusado sem mudança**:
- `saudacao={saudacaoPara(horaDeBrasiliaAgora())}`, `nome={await getDisplayName()}`,
  `linha="Aqui está um resumo da sua vida em um só lugar."`,
  `frase={fraseDoDia(hojeISO(), FRASES_DO_BANNER)}` — as mesmas funções da página da 04-A.
- Zero JS de cliente (já garantido pela peça). O contraste do texto branco sobre `--banner-from`
  já foi medido na 04-A com os mesmos tokens; a 06 **mede de novo** e registra (aceite §7).

### 4.3 Resumo financeiro (a faixa)

Componente novo **`ResumoFinanceiro`** (Server Component, `src/components/dashboard/general/`),
dentro do seu próprio `Suspense` **e** do seu próprio limite de erro (§6). Não é um dos 11 cards e
não entra no Personalizar.

Cabeçalho da faixa: **"Resumo financeiro"** + "<mês por extenso> · base: competência" + selo
**"parcial"** quando a completude da leitura não é total (§4.5).

Quatro `Indicador` (peça comum da 04-A, **reusada sem mudança**) dentro de `OlhoDosValores`
(`ocultoInicial` lido do cookie `COOKIE_DO_OLHO` com `valoresOcultos`, como na 04-A):

| # | Rótulo | Valor | Linha de base | Detalhe | Comparação | Link |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `saldoComData(...).rotulo` ("Saldo das contas · em DD/MM") | `saldoComData(...).valor`; `null` ⇒ `{ erro: "Não foi possível ler o saldo" }` | "todas as contas, até o fim de hoje" | `saldoCom.diferenca` | — | "Ver contas ›" → `/financeiro/contas` · `acessorio={<BotaoDoOlho />}` |
| 2 | Minhas entradas | `indicadorMinhasEntradas(resumo).valor` | "renda pessoal · competência" | `.linhaDeTerceiros` | `comparacao.entradas` | "Ver entradas ›" |
| 3 | Minhas saídas | `resumo.meu` | "minha parte · competência · inclui o que ainda está pendente" | — | `comparacao.saidas` | "Ver saídas ›" |
| 4 | Total em cartões | `resumo.cartao` | "competência" | "À vista: " + `resumo.aVista` | — | "Ver faturas ›" → `/faturas` |

- **O olho (D-06-M1)** cobre **só os quatro indicadores** da faixa (`REFERENCIA-VISUAL.md` §2.6:
  "esconde os valores em R$ dos quatro indicadores da tela"). O card Financeiro e os outros cards
  não mudam com ele; o `OlhoDosValores` envolve só a grade da faixa, como na 04-A.
- A prop obrigatória `dica` de cada `Indicador` reusa os textos da 04-A para os três equivalentes
  (saldo, minhas entradas, minhas saídas); a de "Total em cartões" é nova: "Tudo o que foi
  lançado nos cartões no mês, pela competência. À vista é o que saiu sem cartão."
- Tons: `saldo`, `entrada`, `saida`, `terceiros` (o tom "terceiros" é o azul-claro/violeta que o
  §2.2 reserva para "cartão e terceiros"). Ícones lucide: `Wallet`, `TrendingUp`, `TrendingDown`,
  `CreditCard`.
- Os links de entradas/saídas são os mesmos da 04-A (`/financeiro/lancamentos?type=…&month=<mes>`).
- **Comparação**: exatamente o caminho da 04-A —
  `comparacaoDosIndicadores({ dados: paresDoMesAMes(grafico !== null ? grafico.comparativo : comparativoMesAMes(...)), ateODia: grafico?.ateODia ?? null, base: "competencia", futuro: mes > mesAtual })`,
  com `grafico = comparativoDoGraficoAteODia({ mes, hoje, transactions, receivables })`. Saída em
  andamento fica sem cor (regra da 04-A, `sentidoDaVariacao`). Sem base ⇒ "sem base de comparação".
- Grade: celular `grid-cols-3`, saldo `col-span-3`, os outros três pequenos lado a lado (a mesma
  classe `INDICADOR_PEQUENO_NO_CELULAR` da 04-A — importar, não copiar; se ela é local ao arquivo
  da 04-A, a 06 a move para `shared/painel/` com teste e declara o arquivo tocado); `sm` 2 colunas;
  `xl` 4 colunas. **(D-06-M7)** `INDICADOR_PEQUENO_NO_CELULAR` hoje é constante local de
  `src/app/(app)/dashboard/financeiro/financial-dashboard-client.tsx:105`: ela passa a ser
  exportada de `src/components/shared/painel/indicador.tsx` e o arquivo da 04-A passa a importá-la
  (valor idêntico; os dois arquivos são declarados no relatório).
- Mês: `window.mes` (o mês da janela do dashboard; com período "hoje"/"semana" é o mês de hoje).

### 4.4 A leitura única (K1)

Arquivo novo **`src/lib/dashboard/resumo-financeiro.ts`** (`server-only`):

```ts
export const lerResumoDoDashboard = cache(async (mes: string, hoje: string) => { ... })
```

- `cache` do React, chaveado por **dois primitivos** (`mes`, `hoje`) — objeto como argumento
  quebraria a memoização.
- Faz, em paralelo, **três** leituras (D-06-8):
  1. **o mês** — `lerFinanceiro({ janela: janelaDoMes(mes), escopo: ESCOPO_CARD_FINANCEIRO })`, a
     mesma chamada de `getFinanceCardData`. É a fonte de **todo número do mês** (faixa e card).
  2. **o histórico** — `lerFinanceiro({ janela: janelaDoHistoricoDoDashboard(mes), escopo: ESCOPO_HISTORICO_DO_DASHBOARD })`,
     só os **lançamentos** dos **5 meses anteriores** ao mês (sem o mês). Alimenta só as barras e
     a comparação. `ESCOPO_HISTORICO_DO_DASHBOARD` é um quinto escopo nomeado em
     `src/lib/finance/pipeline.ts` (`transacoes: true`, todo o resto `false`), acrescentado à
     união `EscopoFinanceiro` — escrito ao lado dos outros, nunca à mão no chamador.
  3. `lerSaldoAte(nextDayISO(hoje))`.
- Por que duas leituras financeiras: `getTransactionsRange` ordena por `competence_date`
  **ascendente** com teto de 2.000 (`src/lib/finance/queries.ts` ~l. 339/362); numa janela única de
  6 meses, saturar cortaria **o mês mais recente** — justamente o da faixa. Separadas, o mês nunca
  é cortado pelo histórico.
- Para as barras e a comparação, as linhas do mês (1) e do histórico (2) são **concatenadas** antes
  de `evolucaoMensal`/`comparativoMesAMes`/`comparativoDoGraficoAteODia`. As janelas são disjuntas
  por construção (o histórico termina no último dia do mês anterior), então nada entra duas vezes.
  Conferido em `lerFinanceiro` (`src/lib/finance/queries.ts` ~l. 835–860): **só** os lançamentos
  são recortados pela janela; contas, faturas, recebíveis e contas fixas vêm inteiros e saem **só**
  da leitura do mês. Teste afirma que nenhum lançamento (por `id`) aparece duas vezes no conjunto
  que vai às funções puras.
- **`janelaDoHistoricoDoDashboard(mes)`** é nova, pura, em `src/lib/finance/pipeline.ts`, ao lado
  das outras: `{ from: "<mes − 5>-01", to: ultimoDiaDoMes(<mes − 1>) }`. Nome e dono próprios (não
  reusa `janelaDoGastoAlto`): se a régua do gasto alto mudar, o dashboard não muda junto. Teste
  afirma o valor.
- `completude`: a da leitura do **mês** decide o selo "parcial" dos números do mês; a do
  **histórico**, se não total, acrescenta ao card Financeiro a nota "o histórico das barras pode
  estar incompleto" (as barras e a seta são as únicas coisas que ele alimenta).
- Devolve o resultado de uma função **pura** `montarResumoDoDashboard(...)` (mesmo arquivo de
  lógica pura, separado: `src/lib/dashboard/resumo-financeiro-puro.ts`), que só chama funções que já
  existem: `resumoMes`, `perdoadoDoMes`, `totalAReceber(recs, mes)`, `proximasContasPagar`,
  `saldoDasContas`, `saldoComData`, `indicadorMinhasEntradas`, `evolucaoMensal` (meses =
  `ultimosMeses(mes, 6)`), `dadosDasBarras(evolucao, mesAtual)`, `comparativoMesAMes`,
  `comparativoDoGraficoAteODia`, `paresDoMesAMes`, `comparacaoDosIndicadores`. **Nenhuma conta
  nova.** As duas `completude` viajam junto.
- **Erro:** `lerFinanceiro` lança `ErroDeLeitura`; `lerSaldoAte` devolve `null` (já é o contrato
  dela). A função não captura: quem captura é cada consumidor (§6), para que a faixa e o card falhem
  cada um no seu bloco.
- **Equivalência:** teste afirma que, para o mesmo `mes`, os campos de `montarResumoDoDashboard` que
  também existem em `FinanceCardData` (saldo, entradas, entradasMeu, entradasTerceiros, saidas, meu,
  perdoado, terceiros, cartao, aVista, aReceber, contasTotal, contasCount, proximaConta) são **iguais**
  aos de `getFinanceCardData` sobre as mesmas linhas — e, como a leitura (1) é a mesma chamada, a
  igualdade vale também quando ela satura.
- `getFinanceCardData` **não muda** (continua de 1 mês, para a IA).
- **Testes existentes que mudam de propósito** (o card deixa de chamar `getFinanceCardData` e de
  mostrar Entradas):
  - `src/components/dashboard/general/cards-sem-leitura.test.ts` — a linha do `finance-card.tsx`
    passa a exigir `await lerResumoDoDashboard(` dentro do `try`; o resto do teste (catch só de
    `ErroDeLeitura`, ramo de falha sem número) continua igual, e ganha uma linha para a faixa;
  - `src/components/dashboard/general/cards-sem-leitura-comportamento.test.ts` — o mock do card
    Financeiro passa a ser de `lerResumoDoDashboard`;
  - `src/lib/finance/entradas-do-card.test.ts` (~l. 33–44) — deixa de exigir `apresentarEntradas(`
    em `finance-card.tsx`; passa a exigir `indicadorMinhasEntradas(` no caminho da faixa (o RR4
    mudou de lugar, não sumiu).

### 4.5 "Parcial" na tela

`completude` (03-B2) diz se alguma lista da leitura bateu no teto. Onde ela não é total:
- a faixa mostra o selo **"parcial"** com a frase "a leitura atingiu o teto de lançamentos; pode
  faltar coisa", ao lado do cabeçalho (não em cada indicador);
- o card Financeiro mostra a mesma frase numa nota, porque sai da mesma leitura;
- o card Cartões & Faturas mostra a nota a partir da `completude` de `getInvoicesCardData`.
O critério de "não total" é o que o tipo `CompletudeFinanceira` já expõe (o builder confere o campo;
regra nenhuma nova). A frase é uma só, num ponto só.

### 4.6 Grade dos 11 cards

- `DASH_CARD_IDS`, `DASH_CARD_TITLES`, `normalizeLayout`, o formato salvo e a ordem padrão **não
  mudam**. O layout personalizado existente é lido como hoje.
- Grade: `grid-cols-1`, `md:grid-cols-2`, `xl:grid-cols-3`, `gap-4`. (Hoje é `sm:grid-cols-2`; a
  troca para `md` é do §5 da referência.)
- **Moldura (`CardShell`, client, já existe):** cabeçalho com **ícone num quadrado tingido**
  (`size-8 rounded-[10px] bg-primary/10 text-primary`), título, **subtítulo opcional** e
  **"Ver mais ›"** à direita (hoje é "Ver"). Corpo sem mudança de contrato (`children`). O
  subtítulo chega por prop (`subtitulo?: string`) calculado no servidor pela página, porque
  depende de `hoje`.
- **Cards de "hoje" dizem que são de hoje:** TO-DO, Dieta, Tarefas & Rotinas e Hábitos recebem o
  subtítulo **"hoje, <dia da semana abreviado> DD/MM"** (ex.: "hoje, ter 18/11"), feito de
  `hojeISO()` como texto (data pura, nunca `new Date()` do processo). Agenda diz "Eventos hoje
  (DD/MM)" no quadro. Financeiro diz "<mês> · competência". Treinos diz a semana ("semana de DD/MM
  a DD/MM") **dentro do corpo do card**, não no subtítulo: o início da semana depende de
  `preferences.weekStartsOn`, que só o card lê.
- Primitiva nova **`Quadro`** em `src/components/dashboard/general/primitives.tsx` (onde já moram
  `Metric`, `MetricRow`, `CardEmpty`): número grande + rótulo pequeno, `tom: "neutro" | "vermelho" |
  "verde" | "ambar"`, com `min-w-0` e o número quebrando linha (dinheiro nunca é truncado). Os tons
  usam tokens (`destructive`, `success`/`success-ink`, `warning`/`warning-ink`), cor nunca sozinha
  (o rótulo diz o que é).

### 4.7 Anatomia de cada card (o meio-termo, D-06-5)

| Card | Fica | Sai (desvio no §6 da referência) |
| --- | --- | --- |
| **Financeiro** | "Realmente meu" (grande) + "de R$ X movimentados" (+ a frase do perdoado, se houver) · barras de 6 meses com `BarrasEntradasSaidasChart` **sem mudança** (Minhas entradas × Minhas saídas; o mês em andamento sai como o gráfico já o desenha, "mês em andamento · parcial" — D-06-M6: marcar "até DD/MM" exigiria mudar o gráfico da 04-A) · "Ver relatório ›" → `/relatorios` · linhas: De terceiros · `rotuloPendenteDoMes(mes)` · Próximas contas a pagar (+ "N conta(s) · 1ª: Nome em DD/MM" ou "Nenhuma nos próximos 31 dias") | Saldo, entradas, saídas, no cartão, à vista (foram para a faixa — não saem da tela) |
| **TO-DO** | Quadros Hoje · Atrasadas · Urgentes (P1, vermelho claro) · Concluídas hoje (verde claro) · "Próximas tarefas" (até 5, como hoje) | "Conclusão na semana", "N pendente(s) no total", "N projeto(s) ativo(s) · N nesta semana" |
| **Cartões & Faturas** | Quadros Abertas · Fechadas · Pagas · **"A pagar nas faturas"** (`totalProximas`) · "Próximos vencimentos" (até 4, marcador na cor do cartão, nome, "vence DD/MM", valor, selo de estado; prevista sem lançamento ⇒ "sem lançamentos conhecidos" via `valorDaFatura`) · linha `rotuloTotalPendenteAte(hoje)` (pendente de terceiros) | — |
| **Agenda** | Quadros "Eventos hoje (DD/MM)" · `Eventos <periodWord>` · "Próximos compromissos" (como hoje) · vazio com "Adicionar evento" → `/agenda` | — |
| **Dieta** | Quadros Energia · Proteína (`nutrientText`, "sem registro" nunca "0") · a nota de parcial que já existe · "Refeições: X de Y registradas" + Próxima refeição (com "Sem registro" se atrasada) · sem módulo ⇒ vazio com "Configurar dieta" → `/nutricao` | Aderência de hoje, Água (Hábitos), Lista de compras, Peso |
| **Tarefas & Rotinas** | Quadros Hoje · Atrasadas · Em andamento · "Rotinas de hoje" (como hoje) | Lista de tarefas abertas ("N tarefa(s) aberta(s)") |
| **Hábitos** | Anel "X/Y concluídos hoje" (SVG, sem biblioteca) · quadro Sequência ("N dias 🔥", "P% <período>") · lista de hoje com o **check-in que já existe** (controle explícito, não clique no card) · água como linha só de leitura ("1,2 / 2,0 L") | Botão "+copo" da água |
| **Estudos** | Quadros Em andamento · `Horas <periodWord>` (`minutesPeriod`) · Atrasados (âmbar, não vermelho) · "Cursos em andamento" com selo "atrasado" em palavra | Trio semana / mês / sequência |
| **Treinos** | Sessão em andamento + "Continuar treino" (só quando existe) · Quadros "N de M treinos na semana" (ou "N" + "sem meta semanal definida") · Volume da semana ("sem treino" quando nulo, + regra de contagem) · `partialReason` · **barras Seg→Dom** · linha "Hoje" (planejado / Treinado / "dia livre") | Último treino, Meta em andamento, Peso |
| **Notificações** | Não lidas + até 4 recentes + "Ver todas ›" · "Tudo em dia" como hoje · **(D-06-M5)** a falha de leitura deixa de virar "Em breve": `getNotificationsCardData` (hoje devolve `{ available: false }` no erro, `src/lib/dashboard/queries.ts` ~l. 405) passa a distinguir "tabela ausente" (o "Em breve" legítimo, se ainda existir esse caso) de "erro de leitura", que mostra o `CardSemLeitura` | — |
| **Insights da IA** | Como hoje, só exibe | — |

**Barras Seg→Dom do Treinos:** `TrainingCardData` ganha `semana: { data: string; rotulo: string;
estado: "treinou" | "planejado" | "descanso" | "livre" | "a_seguir" }[]` (7 dias, começando em
`preferences.weekStartsOn`), derivado de
`consistencyCalendar(sessionsInRange(history, weekRange), planejadosDeHoje, weekRange, hoje, metricOptions)`
— sessões e planejamento **já lidos** pela função. **Mapeamento (D-06-M2)** dos estados de
`ConsistencyDay` (`src/lib/training/dashboards.ts` ~l. 422–445):

| `ConsistencyDay` | Barra | Por quê |
| --- | --- | --- |
| `treinado` | **treinou** — cheia, `primary` | — |
| `parcial` | **treinou** — cheia, `primary` | sessão abandonada continua sendo treino; a invariante proíbe chamá-la de "não treinou" |
| `planejado_sem_execucao` (hoje) | **planejado** — borda tracejada `primary` | ainda pode acontecer |
| `planejado_sem_execucao` (dia passado) | **livre** | só o planejamento de hoje é lido; dia passado sem sessão é dia livre, e dia livre não cobra |
| `descanso` | **descanso** — baixa, `muted`, palavra "descanso" na legenda | descanso é decisão, não ausência |
| `livre` | **livre** — baixa, `muted`, borda `border` | — |
| `futuro` | **a seguir** — contorno pontilhado `border`, sem preenchimento | dizer "livre" de um dia que não chegou seria afirmar o futuro |

O campo de contagem do tipo é `sessions` (não `sessionCount`). ⛔ **Nenhum vermelho**, nenhum
"falta". A legenda mostra só os estados presentes na semana, sempre com palavra.

**Notificações (NAVEGACAO §5):** `DASH_CARD_HREF.notificacoes` passa de `/configuracoes` para
`/notificacoes`. O teste de `href` no disco (02-D) cobre a rota.

## 5. D15 — "Outros" na rosca (painel financeiro da 04-A)

- **Onde a mudança mora:** `dadosDaRosca`, `foraDaRosca`, a ordenação e a legenda são chamados na
  **fachada** `src/components/dashboard/rosca-categorias-chart.tsx` (~l. 39–40), não no client da
  04-A (que só passa `categorias` e `estornos`). A dobra entra **ali**, depois de `dadosDaRosca`.
  `CategoriaSlice` (`src/lib/finance/dashboard.ts` ~l. 461) não muda: a fatia "Outros" é um tipo
  próprio, `FatiaDaRosca = CategoriaSlice & { dobradas?: string[] }`, declarado junto da função.
- Função pura nova **`dobrarEmOutros(fatias, maximo = 8)`** em `src/lib/painel/rosca.ts` (neutro,
  ao lado de `cor.ts`, `olho.ts`, `saudacao.ts`), com teste:
  - entrada: as fatias que já passaram por `dadosDaRosca` (só minha parte positiva), ordenadas;
  - até `maximo` fatias ⇒ devolve igual;
  - mais de `maximo` ⇒ as `maximo − 1` maiores + uma fatia `Outros (N categorias)` com a **soma em
    centavos** das demais (sem perder centavo: Σ entrada = Σ saída) e a lista dos nomes dobrados;
  - empate na fronteira: desempate estável pelo nome, para a rosca não trocar de fatia a cada
    recarregar.
- A 8ª cor é o slot 8 da paleta (a cor por posição já é a regra da 04-A).
- A legenda da rosca mostra, abaixo de "Outros (N categorias)", os nomes dobrados em texto pequeno.
- `foraDaRosca` continua vendo as fatias **antes** da dobra (a nota do que ficou fora não muda).
  A rosca também é usada pela 04-A2 em `/relatorios` (não integrada): a regra vale lá quando ela
  chegar, porque mora na fachada.
- ⚠️ Conflito provável com a 04-A2 neste arquivo e/ou na rosca: declarado no relatório.

## 6. Erro isolado por bloco (K-erro)

Hoje só os cards Financeiro e Cartões capturam `ErroDeLeitura`; uma falha em qualquer outro leva a
página inteira para `src/app/(app)/error.tsx`.

- **Limite de erro novo, `LimiteDoBloco`** (client, `src/components/dashboard/general/limite-do-bloco.tsx`):
  um error boundary de classe, mínimo, sem dependência. Envolve **cada** card (por fora do
  `Suspense` dele) e a faixa. No erro, renderiza um **componente de função** de falha (§6.1) cujo
  "Tentar de novo" **(D-06-M3)** chama `reset()` do boundary (zera `hasError`) **e**
  `router.refresh()` (busca o RSC de novo **preservando a URL**, com `?periodo/visao/de/ate`). Um
  `<Link href="/dashboard">` não serve: numa navegação suave o boundary sobrevive com o erro, e o
  link perde os parâmetros. A decisão "devo mostrar a falha?" é pura (`estadoDoLimite`), testável
  sem DOM. Registra no `console.error` só o nome do bloco — a mensagem do erro de produção já vem
  higienizada pelo Next.
- Os cards Financeiro e Cartões **mantêm** o `try/catch` de `ErroDeLeitura` (os testes 03-G L4
  continuam valendo); a faixa faz o mesmo, com `oQue = "o resumo financeiro"`. O limite é a rede de
  segurança para o resto.
- **Teste:** varredura da página (`page.tsx`) afirmando que cada um dos 11 ids e a faixa estão
  dentro de um `LimiteDoBloco`; e o boundary por si (lógica de estado pura, testável sem DOM).

### 6.1 O desenho da falha

`CardSemLeitura` (`src/components/shared/card-sem-leitura.tsx`) ganha o desenho de falha do
`Bloco` da 04-A: fundo `destructive/10`, anel `destructive/20`, ícone `AlertTriangle` em
`text-destructive`. O papel passa de `role="status"` para `role="alert"` (é falha, não andamento).
O **texto não muda** ("Não foi possível ler {oQue}. O card fica sem valores para não mostrar um
número errado." + "Tentar de novo"), então o teste 03-G do texto continua verde. Ele continua
Server Component. Hoje só `finance-card.tsx` e `invoices-card.tsx` o usam; a 06 acrescenta a faixa
e o card de Notificações. O fallback do `LimiteDoBloco` (client) usa o mesmo desenho e o mesmo
texto, com `oQue` = o nome do bloco ("os dados de Estudos"). Vazio (`CardEmpty`), zero medido e
falha continuam três desenhos diferentes.

## 7. Orçamento, fronteiras e regras que seguem valendo

- **Bundle:** as barras do card Financeiro reusam `BarrasEntradasSaidasChart` (fachada +
  `-impl`, `next/dynamic` com objeto literal — já é assim). Nada de `recharts` fora do `-impl`.
  `LimiteDoBloco` e `OlhoDosValores` são as únicas ilhas cliente novas na página. `perf:bundle`
  verde e `/(app)/configuracoes` abaixo de 285 KB.
- **IA:** nada em `src/lib/dashboard`, `src/components/dashboard` ou `src/app/(app)/dashboard`
  importa `ai/server/insight-runner`, `actions/ai-insights` nem `ai/server/insight-job`.
- **Fuso:** "hoje", dia da semana e DD/MM saem de `hojeISO()` como texto; hora do banner de
  `horaDeBrasiliaAgora()`. Testes novos passam com `TZ=UTC`.
- **Escrita:** nenhum card ganha escrita. O único controle de escrita no dashboard continua o
  check-in de Hábitos (que já existe); nenhum link de card leva a ação financeira.
- **Peças comuns** (`src/components/shared/painel/`): **reusadas sem mudança**, salvo a classe do
  indicador pequeno no celular, se for preciso movê-la (§4.3). Cada arquivo tocado ali é declarado
  no relatório.
- **CRLF / AGENTS.md:** normalizar com `sed -i 's/\r$//'` e `git checkout -- AGENTS.md` antes de
  cada commit.

## 8. Desvios a acrescentar ao §6 de `REFERENCIA-VISUAL.md`

O §6 é atualizado **no fim**, junto com o relatório (não durante a execução, para não conflitar com
a outra sessão). Linhas novas, prefixadas "(06)":

| No print | Aqui | Por quê |
| --- | --- | --- |
| Saldo das contas com seta "em relação ao mês anterior" | sem comparação | exigiria um segundo corte de saldo; a 04-A também não compara o saldo |
| "Entradas (mês)" / "Saídas (mês)" | Minhas entradas / Minhas saídas | RR4 e a 04-A (D-06-2) |
| Card Financeiro com o saldo em destaque | "Realmente meu" em destaque | o saldo já está na faixa logo acima (D-06-3) |
| Seletor "Últimos 6 meses" no card Financeiro | "Ver relatório ›", janela fixa de 6 meses | D-A-6 |
| "Total pendente" em Cartões & Faturas | "A pagar nas faturas" | "pendente" sozinho é ambíguo (03-D, B2); o pendente de terceiros tem linha própria |
| "Ver mais" em todo card | igual | — (registrado só para constar que "Ver" virou "Ver mais") |
| TO-DO só com quadros | + Próximas tarefas | D-06-5; saem conclusão na semana e projetos |
| Dieta | sai aderência, água, lista de compras e peso | D-06-5 (a água é do módulo Hábitos; o peso, de `body_*`) |
| Dieta com lista de refeições (prévia) | "X de Y registradas" + próxima refeição | a leitura do card não traz a lista; trazê-la seria leitura nova |
| Tarefas & Rotinas | sai a lista de tarefas abertas | D-06-5 |
| Hábitos | sai o "+copo" da água; a água vira linha de leitura | D-06-5 |
| Estudos | sai o trio semana/mês/sequência; "Atrasados" em âmbar | D-06-5; atraso é aviso, não erro |
| Treinos | saem último treino, meta e peso; barras sem vermelho | D-06-5; invariante 22 de Treinos |
| Grade com 4 cards na última linha | todos do mesmo tamanho | o layout salvo não guarda tamanho |

## 9. Aceite (PLANO §06 + REFERENCIA-VISUAL §7 + o prompt da fase)

1. Os 11 ids de `DASH_CARD_IDS` preservados (teste existente + nenhum diff no array).
2. Layout personalizado existente não é resetado (`normalizeLayout` sem mudança; teste).
3. Carregamento por bloco mantido (um `Suspense` por card e um para a faixa).
4. Erro isolado por bloco, inclusive na faixa (§6; teste de varredura + prova visual).
5. A faixa e o card Financeiro saem da mesma leitura **(D-06-M4)**. O `cache` do React só memoiza
   no build `react-server`, e o Vitest roda em `node`, então a prova é dupla: (a) varredura — a
   faixa e o card importam `lerResumoDoDashboard` e **nenhum** dos dois chama `lerFinanceiro`,
   `getFinanceCardData` ou `lerSaldoAte`; a função está embrulhada em `cache(`; (b) teste com
   `react` `cache` simulado por um memoizador por argumentos, contando as chamadas a
   `lerFinanceiro` quando os dois consumidores pedem o mesmo `(mes, hoje)`: **2** (mês +
   histórico), não 4.
6. Card de "hoje" diz que é de hoje (subtítulo; teste da função que monta o texto).
7. Salvar a ordem não sequestra o período padrão (R7; teste do payload de `save`).
8. A IA continua sem gerar nada no carregamento (`boundaries.test.ts` verde).
9. Treinos: dia sem treino não é vermelho (teste de varredura das classes do componente das barras).
10. Ausência nunca vira zero; erro nunca vira zero (03-G).
11. Prévia aprovada ✅; 390/768/1280/1440, claro e escuro, sem rolagem horizontal; contraste do
    banner medido; banner sem JS de cliente.
12. Nenhum bloco que o dashboard tem hoje sumiu sem desvio declarado (§8).
13. `test:run`, `lint`, `tsc --noEmit`, `build`, `perf:bundle` verdes; `TZ=UTC npx vitest run` nos
    arquivos novos.

## 10. Deixado para quem constrói

- A ordem exata dos commits e o fatiamento das tarefas (o plano decide).
- O nome dos componentes internos novos (exceto os citados aqui, que outros documentos vão citar).
- Pequenos ajustes de espaçamento para bater com a prévia, desde que as regras de layout do
  `CLAUDE.md` (min-w-0, `@container`, `top-16`, `twMerge`) sejam respeitadas.
