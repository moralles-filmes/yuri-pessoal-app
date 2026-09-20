# STATUS

**Atualizado:** 2026-09-20
**Fase atual:** REDESIGN-00 ✅ · D6–D11 ✅ · REDESIGN-01 ✅ · **visual e dicionário APROVADOS
por você em 2026-09-20** · **REDESIGN-02-A ✅ · REDESIGN-02-B ✅ · REDESIGN-02-C ✅ ·
REDESIGN-02-D ✅ · REDESIGN-02-E ✅** — **a REDESIGN-02 está fechada** · **`R4` FECHADO**
(trabalho de outro chat, revisado e integrado aqui em `1b5aa28`) · **REDESIGN-03-A ✅**
(`02aa54b`, integrada por merge `--no-ff`); 03-B liberada

⛔ **As três migrations continuam sem ser aplicadas.** "Aprovado tudo" foi lido como aval do
**visual** e do **dicionário**. Cada migration escreve no banco de produção e segue precisando
de um "aplique a M1" (ou M2, ou M3) seu, separado. Serão pedidas uma a uma, no momento em que
a subfase precisar delas.

⚠️ **CORREÇÃO (D29): a M3 NÃO é da 03-B.** Este documento afirmava, em dois lugares, que a
`categories.classificacao_padrao` seria pedida na 03-B. Não bate com as outras duas fontes:
o `PLANO.md` descreve a 03-B como *"unificar o pipeline triplicado … **sem mudar número
nenhum**"*, e `MIGRATIONS.md:16` liga a M3 à **D8**, que é a **03-C2**. **A 03-B não precisa
de migration nenhuma.** A primeira a precisar é a 03-C2.

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
| D26 | **`deep-links-inline.test.ts` mora em `src/test/`, quebrando a co-locação de propósito.** O sujeito dele não é `search/` nem `notifications/`: é o CONJUNTO dos arquivos que cunham rota inline, e hoje ele atravessa os dois. Pendurá-lo num deles deixaria o outro invisível para quem abre o outro — que é como nasce a terceira cópia de uma regra. Ele fica ao lado de `rotas.ts`, que é a resolução que ele consome |
| D27 | **Minhas duas contagens do `R4` estavam erradas, e a segunda foi publicada como correção da primeira.** "11 rotas em 2 arquivos" → "21 pontos em 3 arquivos" → **29 pontos**. As duas vieram de `grep` meu, que não pegava ramo de ternário nem link com query string. O que sobreviveu às três contagens foi o número de rotas **distintas** (15). ⛔ **Contar com a ferramenta errada duas vezes seguidas é o motivo de a varredura ser derivada do código e não de uma lista minha** |
| D28 | **Uma das minhas mutações no `R4` saiu verde, e o verde está CERTO.** A MB troca a parada da leitura da expressão de `,` para `;`, e o extrator acha os mesmos 29 pontos — porque há uma segunda parada (`}` no nível zero) que a mutação não toca. Fui medir as duas listas antes de opinar. **Mutação que não muda comportamento não prova nada em nenhuma das duas direções** — é a D21 pelo outro lado |
| D29 | **A M3 não é da 03-B — este documento estava errado, em dois lugares.** Ele dizia que `categories.classificacao_padrao` seria pedida na 03-B; o `PLANO.md` descreve a 03-B como "sem mudar número nenhum" e `MIGRATIONS.md:16` liga a M3 à D8, que é a **03-C2**. **A 03-B não precisa de migration nenhuma.** Corrigido no cabeçalho e no próximo passo |
| D30 | **O §9 tem 4 exigências certas + 1 CONDICIONAL, não 5.** O `METRICAS-FINANCEIRAS.md` conta cinco como funcionando. A quinta ("minha renda pessoal não sobe R$ 250") vale **só enquanto o reembolso não for lançado como receita** — e o teste prova que, lançado, o resumo dele é idêntico ao de uma renda genuína. Contei 4+1 em vez de 5 porque o número honesto é o que sobrevive ao teste |
| D31 | **Uma mutação da 03-A achou fraqueza de quem escreveu o teste, e ela foi corrigida antes do commit.** Uma asserção testava a FORMA do código (`toContain("iso.slice(0, 7)")`) e quebrava ao trocar `slice` por `substring`, que é semanticamente idêntico. **Teste que fica vermelho em refatoração inofensiva ensina a afrouxar o arquivo** — e este arquivo é a linha de base da fase inteira. Virou asserção comportamental sobre as duas bordas do mês |
| D32 | **Os "18 casos financeiros mínimos do briefing §13" não existem em `docs/`.** O aceite da REDESIGN-03 os cita; o repositório não os tem, e a §13 do `METRICAS-FINANCEIRAS.md` é o dicionário TO-BE. Decidido **seguir sem** e registrar como pendência de fechamento, em vez de derivar uma lista que divergiria do texto original. Volta na **03-G** |
| D33 | **Um teste flaky preexistente foi consertado dentro da 03-A, fora do escopo dela e a pedido do dono.** `catalog.test.ts` (Fase 18-F). O fix é de RAIZ — o `await import` saiu de dentro do `it` — e não curativo: subir o `testTimeout` deixaria a corrida de pé, mais longe. **1.604 ms → 2 ms** |
| D34 | **A contagem de commits deste documento estava errada pela terceira vez, e agora é MEDIDA.** Dizia 11; `a4bed98` já era **12** — e esse commit se chama "corrige a contagem de commits locais (11, nao 10)", ou seja, foi corrigido uma vez e continuou errado. O número passa a sair de `git rev-list --count main..HEAD`. ⛔ **É o mesmo mecanismo da D27** (contar com a ferramenta errada, publicar, recontar): número que alguém conta à mão neste projeto erra, e a saída é derivá-lo da ferramenta que sabe a resposta |

## Bloqueios

Nenhum.

## Riscos abertos

~~`R1` cor de entidade "Dourado" ligada a `bg-primary`~~ **FECHADO na 02-A**, com teste e
mutação · `R2` **3,1 KB** de folga de bundle na casca (eram 3,3; o link de pular custou 0,2) ·
`R3` ids de card do dashboard · ~~`R4` deep-link para rota inexistente~~ **FECHADO**
(02-D → 02-E → merge `1b5aa28`), com mutação nas três etapas · **`R5` mudar número sem
perceber — MITIGADO nas quatro funções do núcleo pela 03-A, CONTINUA ABERTO no resto** (ver
abaixo) · `R6` estado vivo (sessão de treino, chat) · `R7` salvar layout sequestra o período.
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

## Próximo passo — REDESIGN-03-B

**A 03-A está fechada e integrada.** O que vem é unificar o **pipeline triplicado** (P1-9)
num módulo só, com uma janela de leitura declarada — **sem mudar número nenhum**.

⛔ **A 03-B NÃO precisa de migration** (ver D29). A primeira a precisar é a **03-C2**, com a
**M3** (`categories.classificacao_padrao`), e migration em produção continua exigindo um
"aplique a M3" seu, separado.

**A 03-A entregou a linha de base que ela consome.** As três divergências entre os chamadores
estão medidas e o bloco 10 já prova que unificar a janela **não move** o `resumoMes` do mês —
que é justamente a afirmação que a 03-B precisa fazer. As três coisas a encarar de frente:

1. **O `ref_month` ausente em `getInvoicesCardData`** é a armadilha concreta: se o caminho
   unificado passar a mandar o mês por ali, o card responde **R$ 0,00** sem nada quebrar.
2. **A janela estreita do dashboard** responde zero para qualquer mês fora dela. Unificar para
   a janela larga muda o custo de leitura, não o número do mês.
3. **`installmentItems` vazio** faz a parcela sumir do total, sem exceção e sem sinal.

✅ **O `R4` voltou do outro chat, foi revisado com mutação independente e integrado** em
`1b5aa28`. Não há nada pendente de outra frente.

⛔ **Nada foi empurrado.** A branch `feat/redesign-00-auditoria` está **16 commits à frente da
`main`** e segue **sem upstream**. `feat/redesign-r4-deeplinks` e
`feat/redesign-03a-caracterizacao` já estão contidas nela e podem ser apagadas quando você
quiser.

⚠️ **O 16 foi MEDIDO, não contado** (D34) — `git rev-list --count main..HEAD`. O número que
estava aqui antes do merge (**11**) estava errado: `a4bed98` já era **12**. E esse `a4bed98`
se chama literalmente *"corrige a contagem de commits locais (11, não 10)"* — ou seja, a
contagem foi corrigida uma vez e **continuou errada**. É a terceira vez que um número contado
à mão erra nesta branch (as outras duas estão na D27).
