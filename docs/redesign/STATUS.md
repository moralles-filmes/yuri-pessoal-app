# STATUS

**Atualizado:** 2026-09-20
**Fase atual:** REDESIGN-00 ✅ · D6–D11 ✅ · REDESIGN-01 ✅ · **visual e dicionário APROVADOS
por você em 2026-09-20** · **REDESIGN-02-A ✅ · REDESIGN-02-B ✅ · REDESIGN-02-C ✅ ·
REDESIGN-02-D ✅ · REDESIGN-02-E ✅** — **a REDESIGN-02 está fechada**; 03-A liberada

⛔ **As três migrations continuam sem ser aplicadas.** "Aprovado tudo" foi lido como aval do
**visual** e do **dicionário**. Cada migration escreve no banco de produção e segue precisando
de um "aplique a M1" (ou M2, ou M3) seu, separado. Serão pedidas uma a uma, no momento em que
a subfase precisar delas — a M3 é a primeira, na 03-B.

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

1. `receivable_receipts` (E1)
2. `transactions.liquidado_em` (E6)
3. `categories.classificacao_padrao` (E7)

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

## Bloqueios

Nenhum.

## Riscos abertos

~~`R1` cor de entidade "Dourado" ligada a `bg-primary`~~ **FECHADO na 02-A**, com teste e
mutação · `R2` **3,1 KB** de folga de bundle na casca (eram 3,3; o link de pular custou 0,2) ·
`R3` ids de card do dashboard · **`R4` REDUZIDO na 02-D, não fechado** · `R5` mudar número sem
perceber · `R6` estado vivo (sessão de treino, chat) · `R7` salvar layout sequestra o período.
Detalhe em `AUDITORIA.md` §4.

**O que falta do `R4`, recontado em 2026-09-20 na abertura da 02-E.** A 02-D cobriu o menu
(20 hrefs) e os três módulos de deep-link (Dieta 8, Treinos 11, IA 9); a 02-E acrescentou as
**25 seções** dos navs de módulo. Continuam **sem teste de disco** as rotas montadas **à mão,
inline**:

- `src/lib/search/queries.ts` — **13 pontos** (linhas 176, 195, 222, 241, 285, 304, 324, 349,
  368, 388, 412, 440, 808)
- `src/lib/notifications/generate.ts` — **7 pontos** (309, 328, 342, 365, 413, 469, 561)
- `src/lib/notifications/nutrition.ts` — **1 ponto** (255)

⚠️ **A primeira contagem, publicada na 02-D, estava errada: eu disse "11 rotas em 2
arquivos".** São **21 pontos de link e 15 rotas distintas, em 3 arquivos** — o terceiro
apareceu só quando fui escrever o prompt da tarefa. O `nutrition.ts:255` monta
`/nutricao/planejamento?data=` inline, passando ao largo do `nutrition-links.ts` que a
**invariante 26** declara fonte única (o `planLink` que existe lá abre outra coisa).

São justamente as rotas dos módulos que a **REDESIGN-04 e a 07** vão mover. Fechar isso é uma
varredura de fonte sobre `temPagina`, que já existe. **Despachado para outro chat em
2026-09-20**, em branch própria a partir de `fce701f`, com instrução explícita de **não tocar
este arquivo** — o `R4` só sai daqui como fechado quando aquele trabalho voltar e for revisto.

## Testes executados

| Comando | REDESIGN-00/01 | 02-A | 02-B | 02-C | 02-D | 02-E |
| --- | --- | --- | --- | --- | --- | --- |
| `npm run test:run` | ✅ 185 / 3.738 | ✅ 186 / 3.745 | ✅ 187 / 3.757 | ✅ 188 / 3.770, 13,59 s | ✅ 189 / 3.818, 13,35 s | ✅ **190 / 3.880**, 15,62 s |
| `npm run lint` | ✅ exit 0 | ✅ exit 0 | ✅ exit 0 | ✅ exit 0 | ✅ exit 0 | ✅ exit 0 |
| `npx tsc --noEmit` | ✅ exit 0 | ✅ exit 0 | ✅ exit 0 | ✅ exit 0 | ✅ exit 0 | ✅ exit 0 |
| `npm run build` | ✅ exit 0 | ✅ exit 0 | ✅ exit 0 | ✅ exit 0 | ✅ exit 0 | ✅ exit 0 |
| `npm run perf:bundle` | ✅ mediana 213,9 · config. 281,6/285 | ✅ 213,9 · 281,7/285 | ✅ 213,9 · 281,7/285 | ✅ mediana 214,2 · config. 281,9/285 | ✅ **idêntico à 02-C** — 214,2 · 281,9/285 · 68 rotas | ✅ **idêntico à 02-D** — 214,2 · 281,9/285 · 68 rotas |

Em cada subfase o delta de testes é **exatamente** o que foi acrescentado (02-A: +1 arq./+7
casos; 02-B: +1 arq./+12; 02-C: +1 arq./+13; 02-D: +1 arq./+48 — 27 do `nav.test.ts`, 9 da
Dieta, 12 de Treinos; 02-E: **+1 arq./+62**, todos de `module-shell.test.ts`). **Nenhum teste
existente foi afrouxado para passar.**

⚠️ **Ressalva de honestidade da 02-D:** ela é a primeira subfase que **editou arquivos de
teste existentes** — `active.test.ts` e `ai-links.test.ts` tiveram a resolução de rota trocada
pela compartilhada. Nenhuma afirmação mudou e a contagem dos dois ficou igual (13 e 11), mas
"não mexeu em teste existente" deixou de ser verdade a partir daqui.

E o `perf:bundle` da 02-D ser idêntico ao da 02-C **é o resultado esperado, não uma
coincidência**: a subfase não altera um arquivo de runtime sequer. Ele foi rodado justamente
para confirmar isso em vez de eu afirmar.

## Próximo passo — REDESIGN-03-A

**A REDESIGN-02 está fechada** (A, B, C, D, E). O que vem é o contrato financeiro, que é o
item nº 1 da ordem de prioridade do briefing: *integridade dos dados* antes de tudo.

A **03-A** são **testes de caracterização** de `resumoMes`, `gastosPorCategoria`,
`proximas6Faturas` e `totalAReceber`: fixar o que essas quatro consultas respondem HOJE,
**antes** de qualquer mudança, para que a 03-B tenha como provar que não mudou sentido
financeiro nenhum. Ela **não depende de migration** e não altera runtime.

⛔ A **03-B** é a primeira que precisa da **M3** (`categories.classificacao_padrao`) — e
migration em produção continua exigindo um "aplique a M3" seu, separado.

⏳ **Em outro chat:** o fechamento do `R4` (as 21 rotas inline de `search/queries.ts`,
`notifications/generate.ts` e `notifications/nutrition.ts`). Volta como branch própria para
revisão; nada foi empurrado por lá nem por aqui.
