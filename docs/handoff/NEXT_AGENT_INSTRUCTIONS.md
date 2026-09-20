# NEXT_AGENT_INSTRUCTIONS — Instruções para o próximo agente

> Atualizado em **2026-09-20**, ao fechar o **Bloco 5 da 18-F** — que fecha a **Fase 18**.

## ✅ NÃO HÁ PRÓXIMA FASE. O PROJETO ESTÁ EM MANUTENÇÃO/ITERAÇÃO.

As **14 fases do roadmap original**, a **15 (TO-DO)**, a **16 (Dieta)**, a **17 (Treinos)** e a
**18 (IA)** estão concluídas. **Não há 18-G e não há Fase 19.**

**Melhoria entra como TAREFA AVULSA**, não como subfase: branch própria e o fluxo normal do
projeto — brainstorming quando houver decisão de design em aberto, depois plano, depois
execução. ⛔ **Não invente uma "Fase 19" para organizar trabalho novo**; o roadmap é histórico
de construção, e reabri-lo por um ajuste faz a documentação mentir de novo.

A leitura obrigatória continua a mesma (`PROJECT_BRIEFING` → `PROJECT_RULES` →
`PROJECT_ARCHITECTURE` → `PROJECT_ROADMAP` → `CURRENT_STATUS` → este arquivo), e o `CLAUDE.md`
da raiz continua sendo o resumo vivo das invariantes de cada módulo. **Leia as invariantes do
módulo que você for tocar antes de tocá-lo** — quase todas nasceram de um bug real.

### O que a Fase 18 entregou, em uma linha

Um assistente que lê os nove módulos, prepara alterações que **só o dono aplica**, lê
comprovantes por visão, produz insights sobre grandezas derivadas, conhece as preferências que
o dono escreve e monta panoramas de um clique — tudo atrás de **16 chaves que nascem
desligadas**, sem nunca tocar o banco direto. Placar item a item:
`docs/phases/PHASE_18_CRITERIOS_VALIDADOS.md` (163 critérios: 142 validados, 17 pendentes de
conferência à mão, 4 retirados no desenho).

---

## ⛔ AS PENDÊNCIAS QUE SOBREVIVEM À FASE

Nenhuma delas bloqueia nada hoje. Todas são conhecidas, e é por isso que estão escritas.

### 1. A conferência à mão nunca foi feita — e ela é UMA lista, não duas

O código está verde nas cinco verificações e em `TZ=UTC`, mas **17 critérios de aceite da Fase
18 dependem de um navegador com sessão** e continuam por conferir. A lista está em
`docs/phases/PHASE_18_CRITERIOS_VALIDADOS.md`, seção "O que NÃO foi validado", e ela **inclui**
a tabela de 10 itens que o Bloco 4 deixou pendente
(`docs/superpowers/plans/2026-09-20-18f-bloco4-experiencias.md`, Task 8, Passo 4). Os que mais
importam:

1. **Salvar em `/ia/configuracoes` e RECARREGAR.** Foi exatamente esse caminho que `allowVision`
   deixou quebrado por três subfases, e ele continua sem teste que o percorra ponta a ponta.
   O que existe hoje são as duas listas comparadas (`validators/ai.test.ts` + `round-trip`).
2. Panorama com um módulo desligado: o texto tem de TERMINAR dizendo o que ficou de fora.
3. Responder ao panorama pedindo uma alteração → cartão de proposta normal, com prazo.
4. Painel flutuante: disparar um atalho e **fechar o painel** no meio — a resposta continua
   (invariante 95).
5. Caixa de entrada com "meta" (palavra ambígua) → tem de **perguntar**, não chutar.
6. 320 px: os três atalhos quebram linha, sem rolagem horizontal.
7. Botão flutuante por **teclado**: `Ctrl/⌘ + I` abre · `Tab` alcança · `Esc` fecha · o foco
   volta · e com `floating_hidden` ligada o atalho **continua abrindo**.
8. Dark/light e 320 px nas oito seções de `/ia`, mais a leitura dos deep-links da busca global.

⚠️ **Conferiu?** Marque na tabela de `PHASE_18_CRITERIOS_VALIDADOS.md` com a data e **o que foi
visto** — "conferido" sem o que foi visto não é evidência, é promessa.

### 2. Duas chaves de permissão continuam ociosas

`allow_external_search` e `allow_files` existem no banco desde a 18-A e **não ligam nada**.
`allow_files` foi substituída na prática por `allow_vision` (18-D); `allow_external_search` fica
de pé caso a pesquisa externa volte como tarefa avulsa. ⛔ **Não escreva migration para
apagá-las**: remover coluna pelo ganho de arrumação é a pior relação risco/benefício do projeto.

### 3. O backlog de performance do banco

Medido em 2026-09-20 pelo advisor do Supabase, e **conscientemente não consertado**:
**179** `auth_rls_initplan`, 150 `unused_index`, 117 `unindexed_foreign_keys`. A razão está no
`CLAUDE.md` (seção "Medição de query"): `(select auth.uid())` já foi aplicado nas 8 policies das
duas tabelas grandes o bastante para a diferença ser medível; as outras seguem em backlog porque
o ganho não foi demonstrado. ⛔ **Se for mexer, meça antes** — com `EXPLAIN (analyze, timing
off)` e na role `authenticated`, senão a RLS some da conta.

### 4. Um advisor de segurança aberto, que não é código

`auth_leaked_password_protection` (proteção contra senha vazada, checagem no HaveIBeenPwned) é
um **botão do painel de Auth** do Supabase. Sem migration, sem código. Registrado desde
2026-08-07. **Zero lints de schema.**

### 5. Decisões de escopo que podem voltar como tarefa avulsa

Voz · automações configuráveis · pesquisa externa · observabilidade · conversar com um relatório
· sugestões contextuais dentro de um registro. Todas saíram **com motivo escrito** (spec §3 da
18-F) e com o dono de acordo — ver `LAST_PHASE_SUMMARY.md`. Se alguma voltar, ela é tarefa
avulsa com desenho próprio, não uma subfase 18-G.

---

## Histórico dos blocos da 18-F

### ✅ Bloco 5 — o fechamento da fase (2026-09-20)

Suíte de evals em `src/lib/ai/evals/` com os oito casos do briefing, afirmando o **estrutural**
(roteador · chave desligada · ferramenta oferecida), o caso destrutivo afirmado **sobre o
registry**, e a validação item a item dos 163 critérios. **Nenhuma migration.** Suíte foi de
3.701/183 para **3.738 testes / 185 arquivos**. Plano executado:
`docs/superpowers/plans/2026-09-22-18f-bloco5-fechamento.md`.

**O que este bloco deixou escrito para quem vier:**

- ⛔ **O CASO DESTRUTIVO É AUSÊNCIA DE CÓDIGO, NÃO RECUSA.** *"Exclua todas as minhas
  transações"* não é barrado por prompt nem por confirmação reforçada — as duas dependeriam de
  o modelo obedecer. O registry não tem ferramenta que apague, e os **sete** `undo` moram fora
  dele. `evals/destrutivo.test.ts` deriva as **duas** listas (commands alcançáveis por
  ferramenta × inversos declarados pelos commands) e exige interseção vazia — **nunca** uma
  lista de nomes proibidos escrita à mão, que furaria no primeiro command novo. Confirmado por
  mutação.
- ⚠️ **O VOCABULÁRIO DO ROTEADOR PRECISA DE CADA FORMA, UMA POR ENTRADA.** O casamento é por
  fronteira de palavra e **não há stemming**, de propósito (stemming faria palavras não
  relacionadas colidirem, e palavra ambígua **desliga** o roteamento — invariante 27).
  `"proteina"` não casa em `"proteínas"`, e foi assim que uma das oito frases do briefing deixou
  de alcançar a Dieta. ⛔ **Não acrescente palavra "por via das dúvidas"**: cada palavra nova
  pode empatar dois módulos e desligar o roteamento onde ele funcionava — "meta", "gordura" e
  "tarefa" estão fora **de propósito**.
- ⛔ **PASTA NOVA EM `src/lib/ai/` ENTRA EM `CAMADAS_PURAS` NO MESMO COMMIT EM QUE NASCE.**
  Aquela lista, em `boundaries.test.ts`, é escrita à mão: pasta fora dela passa **vacuamente
  verde**. `memory/` (Bloco 3), `experiences/` (Bloco 4) e `evals/` (Bloco 5) pagaram as três
  primeiras vezes. Não pague a quarta.
- ⚠️ **AO CONTAR CRITÉRIO EM PROSA SEPARADA POR `·`, CONTE O ÚLTIMO TRECHO TAMBÉM.** A
  estimativa de 158 saiu de não contar `transversais do projeto` no fim de cada lista. A regra
  do projeto — "conte antes de citar" — vale também para o que parece rodapé.
- ⚠️ **`agents/routing.ts` REEXPORTA OS OITO IDS DE ESPECIALISTA, MAS NÃO `ASSISTENTE_PESSOAL_ID`.**
  Ele vem de `agents/registry`. O plano do bloco errava esse import.

### ✅ Bloco 4 — as experiências (2026-09-22)

Três panoramas de um clique com leitura **dirigida pelo servidor**, e um **modo** Caixa de
entrada. **Duas migrations, e NENHUMA cria tabela:** um valor no CHECK de `ai_runs.kind` e a RPC
`ai_begin_experience_run`; depois, a janela de dedupe do clique duplo, por `create or replace`
da mesma função. Banco continua em **132 tabelas**, **20 `ai_*`**. Registry (30),
commands (15) e agentes (9) **inalterados**. Suíte em **3.701 testes / 183 arquivos**. Plano
executado: `docs/superpowers/plans/2026-09-20-18f-bloco4-experiencias.md`. As oito decisões e
os números do orçamento estão em `docs/project/CURRENT_STATUS.md`.

**O que o próximo bloco precisa saber:**

- ⛔ **`ai_runs` TEM DOIS CHECKS SOBRE `kind`.** Além de `ai_runs_kind_check` (valores), existe
  `ai_runs_kind_coerente`, que exige cada forma por inteiro: `chat` e `experience` **têm**
  conversa, `extracao` e `insight` **não**. Uma quinta espécie que mexa só no primeiro falha no
  `insert`, **dentro da transação de admissão**, e o erro chega à tela como `AI_UNKNOWN`.
- ⛔ **`MAX_TOOL_STEPS` não se aplica ao laço dirigido — e isso não é "não há teto".**
  `MAX_FERRAMENTAS_POR_EXPERIENCIA = 5`, validado contra o catálogo em teste, e
  `computeReservation` reserva sobre **esse** número, nunca sobre `leituras.length`.
- ⛔ **Só ferramenta de LEITURA entra num catálogo, e a recusa é EM RUNTIME.** `decidirLeituras`
  confere `descriptor.kind` além do teste sobre o registry real — a auditoria do bloco mostrou
  por quê: o laço dirigido chama `executeTool` **sem `modo`**, e o executor fixa `"proposta"`
  por dentro, então uma ferramenta de escrita no catálogo criaria proposta em
  `ai_action_proposals` **a cada clique no atalho**, sem o dono nem o modelo terem pedido. Teste
  só protege quem roda a suíte.
- ⛔ **SÃO DUAS FRASES NOSSAS NO TEXTO GRAVADO, NÃO UMA:** módulo pulado por preferência
  (`selection.ts`, manda o dono a `/ia/configuracoes`) e leitura que **falhou**
  (`experiences/falhas.ts`, **não** manda — a chave já está ligada). A segunda nasceu da
  auditoria: o bloco de erro pedia ao modelo "diga que não conseguiu obter o dado", e isso é
  instrução, não garantia. `rejeitada` conta como falha junto com `falhou`/`timeout` — a chave
  pode cair **entre** a seleção e a execução, e esse pulo o plano não conhece.
- ⛔ **O CLIQUE DUPLO É DEDUPLICADO NO BANCO, POR UMA JANELA — E AS DUAS CONDIÇÕES IMPORTAM.**
  O passo 5b de `ai_begin_experience_run` recusa (`AI_EXPERIENCE_JUST_STARTED`) quando já há
  run de experiência **do mesmo `agent_id`**, ainda **aberto** (`reserved`/`streaming`) **e**
  criado **há menos de 15 s**. Só a primeira condição travaria o dono por 5 minutos (a lease
  da reconciliação) depois de ele fechar a aba; só a segunda recusaria o retry de um panorama
  que acabou de falhar. A checagem vem **depois** do advisory lock, senão ela mesma tem
  corrida. O estado `enviando` do cliente **não** substitui isso: ele não atravessa duas
  requisições HTTP nem duas telas (a página e o painel têm estados independentes).
- ⚠️ **SÃO DUAS MIGRATIONS neste bloco, não uma** — `20260922100000` (a 4ª espécie + a RPC) e
  `20260922110000` (`create or replace` da mesma função, com o passo 5b). Nenhuma das duas cria
  tabela, coluna ou índice. A aplicada **não se edita**: correção vira arquivo novo.
- ⛔ **Três fronteiras novas, todas confirmadas por mutação:** só `experience-runner` importa
  `experiences/catalog`; só `app/api/ia/chat/route.ts` alcança `server/experience-runner`; o
  `chat-runner` não importa nem o catálogo nem a seleção. **Nenhum `.from()` em `experiences/`**,
  e a pasta entrou em `CAMADAS_PURAS` no mesmo commit em que nasceu.
- ⚠️ **QUALQUER RUNNER QUE MONTE `system` CARREGA A MEMÓRIA JUNTO, E ELA É A ÚLTIMA.** O plano
  deste bloco esboçava o panorama sem ela; corrigido. A concatenação é UMA
  (`perfil.systemBase + blocoDeMemorias`, em `chat-runner.ts`), e `memory/prompt.test.ts` varre
  a ordem sobre a fonte, incluindo o bloco da caixa de entrada que entra **antes** dela.
  ⚠️ Um panorama não tem "o módulo do agente": a seleção roda uma vez por módulo do plano mais
  uma com `null`, e a união é deduplicada por id — o filtro do Bloco 3 fica intacto.
- ⚠️ **UNIÃO DE SCHEMAS ENGOLE AS MENSAGENS DOS RAMOS.** O Zod reporta `invalid_union` no topo
  e as frases em pt-BR de dentro de cada forma deixam de subir — "Página de contexto não
  reconhecida." virou genérica e o 413 do texto longo virou 400. `route.test.ts` pegou.
  `problemasDoRamo` (em `route.ts`) escolhe o ramo **só para a mensagem e o status**; quem
  ACEITA continua sendo a união.
- ⚠️ **`allow_cross_module` é campo SOLTO, nunca uma `ToolPermission`.** Há teste em
  `validators/ai.test.ts` usando exatamente essa chave como o exemplo do que
  `aiPermissionsSchema` recusa — o nome engana. Ela **não é ANDada** com chave nenhuma:
  desligada, nada roda; ligada, o módulo sem `allow_*` é PULADO e declarado, e **todos** pulados
  é recusa antes de gastar.
- ⚠️ **O desfazer de uma mutação pode falhar EM SILÊNCIO por CRLF** (armadilha 5 da 18-B, que
  reencontrei aqui). Depois de mutar para validar um teste, **confira o estado real do arquivo**
  — `git diff` —, não só o verde da suíte.

### ✅ Bloco 3 — a memória (2026-09-20)

O assistente passou a conhecer as preferências que o dono escreveu, e a poder **propor**
preferências novas pelo Approval Engine da 18-C. **Uma migration: 2 tabelas + 1 coluna.** Banco
em **132 tabelas**, **20 `ai_*`**. Registry em **30 ferramentas** (22 leitura + 8 escrita) e
**15 commands**. Plano executado:
`docs/superpowers/plans/2026-09-20-18f-bloco3-memoria.md`. As sete decisões e os números do
orçamento estão em `docs/project/CURRENT_STATUS.md`.

**O que o próximo bloco precisa saber:**

- ⛔ **A MEMÓRIA É O ÚNICO TEXTO DO DONO QUE ENTRA NO PROMPT SEM SER BLOCO NÃO CONFIÁVEL, E
  ELA ENTRA POR ÚLTIMO.** `chat-runner` concatena SEGURANÇA + perfil + roteamento + memória, e
  a ordem é varrida por teste sobre a fonte (`memory/prompt.test.ts`). **Qualquer runner novo
  que monte system prompt — inclusive o `experience-runner` — carrega essa ordem junto**, ou o
  panorama nasce sem as preferências que ele existe para respeitar.
- ⛔ **NENHUM ESTADO DE MEMÓRIA É GRAVADO**, e **expirar não apaga**. `ai_memories` não tem
  `active` nem `status`. Decisão do dono > prazo, nos dois sentidos.
- ⛔ **O evento não guarda o conteúdo**, `memory_id` vai sem FK, e `content` fica FORA de
  `camposAuditaveis` — `changed_fields` é permanente e não some com a conversa.
- ⚠️ **`allow_memory` é a DÉCIMA `ToolPermission`, e não é um módulo de registros do dono.**
  Consequência prática: `permissaoDoModulo("memory")` passa a existir, e o roteador **não** o
  alcança (sem vocabulário, sem agente). `allow_write_memory` é a sexta de escrita, ANDada com
  `allow_memory` na action.
- ⛔ **O orquestrador continua com `allowedTools: []`** (invariante 74). Se o Bloco 4 quiser
  dar uma ferramenta a ele, o preço está escrito: reescrever a frase "não consegue criar,
  editar nem excluir nada", subir `assistente-pessoal-v2` para `v3` e trocar aquela
  invariante. **É decisão do dono.**
- ⚠️ **FRASE DE AUSÊNCIA NA DESCRIÇÃO DE AGENTE AGORA TEM TESTE.** "Só lê" caiu em Treinos,
  Estudos e Tarefas quando `memory.lembrar` entrou nas oito allowlists — a quarta vez que isso
  acontece neste módulo. `agents/registry.test.ts` passou a derivar do registry quais agentes
  escrevem. Publicar ferramenta de escrita num agente novo exige a descrição no mesmo commit.
- ⚠️ **`memory/` está em `CAMADAS_PURAS` e mistura puro com I/O.** `queries.ts` e
  `services.ts` declaram `server-only`; `contracts`, `forma`, `state` e `prompt` não podem
  declarar (a TELA os lê). Há teste cobrindo as duas listas — e ele **reprova arquivo novo**
  que não esteja em nenhuma delas.
- ⚠️ **AO MEXER NO ORÇAMENTO, MEÇA ANTES DE ESCREVER A CAUSA.** `/(app)/configuracoes` foi de
  281,4 para 281,6 KB neste bloco; a hipótese óbvia (`@/lib/ai/constants`) estava errada — o
  custo veio da casca, pelo ícone novo da busca global. Teto **não** subido: 285, folga 3,4 KB.

### ✅ Bloco 2 — o botão flutuante (2026-09-20)

O assistente ao alcance de qualquer tela: botão fixo num canto inferior que abre um painel com
o **mesmo** `ChatClient` da 18-A. **Uma migration, duas colunas** (`floating_corner`,
`floating_hidden`), nenhuma tabela, **nenhuma chave de permissão nova**. Plano executado:
`docs/superpowers/plans/2026-09-19-18f-bloco2-botao-flutuante.md`. As seis decisões e os
números do orçamento estão em `docs/project/CURRENT_STATUS.md`.

**O que o próximo bloco precisa saber:**

- ⛔ **TUDO QUE A CASCA IMPORTA ENTRA NAS 67 ROTAS.** `floating-assistant.tsx` tem orçamento
  medido e uma lista escrita do que **não** pode importar (`@/lib/ai/constants`,
  `@/lib/validators/*`, `chat-client`, `ui/sheet`, `ui/dropdown-menu`). Depois do Bloco 2,
  `/(app)/configuracoes` está em **281,4 KB gz de um teto de 285 — 3,6 KB de folga**. Se
  estourar, **não suba o teto**: tire import da casca.
- ⛔ **`src/lib/ai/painel.ts` não tem um único import, e há teste varrendo o arquivo.** É a
  fronteira "o selo não repete o sino" — sem import, ele não tem de onde ler insight,
  notificação nem ação travada. ⚠️ Ele mora na RAIZ de `src/lib/ai/`, e `CAMADAS_PURAS` itera
  sobre **pastas** — então o `boundaries.test.ts` não o cobre. Quem cobre é o teste próprio.
- ⛔ **O ESTADO DA CONVERSA DO PAINEL VIVE FORA DA GAVETA — e isso custou um bug.** O dono
  relatou em 2026-09-20 que mandar uma pergunta e fechar o painel fazia a pergunta sumir.
  `SheetContent` é embrulhado em `<Presence present={forceMount || context.open}>`: fechar
  **desmonta a subárvore inteira**, e o `ChatClient` levava junto as bolhas, o
  `conversationId` e o cleanup do `AbortController` — que **cancelava a resposta em
  andamento**. `useLazyDialog` mantém montado o **invólucro**, não os filhos da gaveta; o
  plano do bloco afirmava o contrário e eu o implementei sem conferir. `forceMount` não é
  saída (`RemoveScroll`/`hideOthers`/`FocusScope` moram no mesmo `Presence`). Hoje
  `chat-client.tsx` exporta **`useConversaDaIa`** (motor) e **`ChatView`** (vista), o painel
  chama o hook **acima do `<Sheet>`**, e `ChatClient` continua juntando as duas para `/ia`.
  Guardado por `src/lib/ai/painel-persistencia.test.ts`. **Vale para qualquer diálogo cujo
  conteúdo precise sobreviver ao fechamento.**
- ⚠️ **`estadoDoPainelDaIa` RECONCILIA** (`reconcileOwnRuns`). Abrir `/ia` era o gatilho
  primário da reconciliação preguiçosa; com o painel, ele deixou de ser o caminho mais curto.
  Qualquer porta nova para o chat precisa dessa linha, ou a reserva fica presa no orçamento
  sem nada na tela explicando. ⚠️ E o efeito que a chama **depende de `aberto`**: preso à
  montagem, o painel (que nunca desmonta) reconciliaria 1× por carregamento de página, e quem
  ligasse um provedor sem recarregar veria "configure um provedor" para sempre.
- ⚠️ **A frase de bloqueio do chat sai de `prontidaoDoChat`** (`server/chat-readiness.ts`),
  consumida pela página `/ia` **e** pelo painel. Não escreva a segunda cópia.
- ⛔ **CAMPO OBRIGATÓRIO NUM SCHEMA DE FORMULÁRIO MEXE EM DUAS FIXTURES, NÃO UMA.** A lista
  `OBRIGATORIOS` de `validators/ai.test.ts` **e** a fixture de `aiPreferencesSchema` em
  `validators/round-trip.test.ts`. A segunda ficou vermelha sozinha neste bloco — a lista não
  a cobre.
- ⚠️ **O gerador de tipos do Supabase traz mais que a sua migration.** Neste bloco ele trouxe
  também uma relationship de `import_rows` → `accounts_with_balance` e a sintaxe nova dos
  genéricos auxiliares; só as seis linhas das colunas entraram. **Leia o diff antes de aceitar.**
- ⚠️ **`compacto` do `ChatClient` esconde o aviso de honestidade LONGO.** Quem o passa assume
  a obrigação de afirmar a REGRA no próprio cabeçalho — o painel cumpre com
  `RESUMO_DO_ASSISTENTE`. A trava de honestidade é critério de aceite da fase.

---

## ⚡ LEIA ISTO ANTES DE ESCREVER QUALQUER TELA (auditoria de performance, 2026-09-19)

Quatro regras novas, todas medidas. Detalhe em `docs/project/CURRENT_STATUS.md` e no
relatório completo em `.turbo/REPORT.md` (local, fora do git).

1. **Gráfico e diálogo de formulário entram por `next/dynamic`.** `recharts` custa 109 KB gz e
   `zod` + `react-hook-form` uns 62 KB. Os padrões já existem: par fachada/`*-impl.tsx` com
   `ChartSkeleton` para gráfico, e `useLazyDialog`
   (`src/components/shared/use-lazy-dialog.ts`) para diálogo.
   ⚠️ **`{aberto && <Dialog/>}` sozinho quebra a animação de fechamento** — use o hook.
2. **O que NÃO usa `recharts` fica na FACHADA, não no `-impl`.** `MeasurementTable` é a leitura
   textual exigida pela regra 6 da 16-E; atrás do carregamento sob demanda ela sairia do HTML
   do servidor.
3. **Constante lida pela tela não mora em `src/lib/validators/`** — esse módulo começa com
   `import { z } from "zod"`. Ponha em módulo puro (ex.: `@/lib/ai/constants`) e reexporte pelo
   validator, para não quebrar import existente.
4. **`npm run perf:bundle` reprova rota acima de 250 KB gz**, e roda no CI novo
   (`.github/workflows/ci.yml`). ⚠️ **Conte antes de citar: o número muda a cada bloco.** Em
   2026-09-20, depois do Bloco 2 da 18-F, a rota apertada é `/(app)/configuracoes` (281,4 KB
   de um **teto próprio** de 285 — 3,6 KB de folga); a maior sem teto próprio é
   `/(app)/nutricao/compras`, a 7,8 KB dos 250.

⚠️ **Se for medir plano de query: `EXPLAIN (analyze, timing off)` e papel `authenticated`.**
Com `timing on` a view de alimentos acusou 150 ms onde o real eram 3 ms; como service role, a
RLS some da conta e o custo real da policy fica invisível.

---

## ▶️ EM ANDAMENTO: **18-F — IA · memória, integrações e polimento**

Branch `feat/18-f-memoria-integracoes`. Desenho em
`docs/superpowers/specs/2026-09-19-18f-memoria-integracoes-design.md`.
Não há nada quebrado nem pela metade.

### ✅ Bloco 1 — a costura (2026-09-19)

A IA deixou de ser uma ilha: entra no sino (4 famílias), na busca global (conversas, análises,
ações), no backup (17 tabelas `ai_*`) e ganhou exclusão em massa em `/ia/configuracoes`.
**Nenhuma migration** — o bloco não criou tabela nem coluna. Plano executado:
`docs/superpowers/plans/2026-09-19-18f-bloco1-costura.md`. As dez decisões e as duas
armadilhas de fuso corrigidas estão em `docs/project/CURRENT_STATUS.md`.

**O que o próximo bloco precisa saber:**

- ⛔ **Não linke para `/ia/memoria`.** Ela só nasce no **Bloco 3**. Quando nascer, o link entra
  em `src/lib/search/ai-links.ts` — fonte única das rotas de `/ia`, com teste que confere no
  DISCO se cada rota citada tem `page.tsx`.
- ⛔ **Tipo novo de notificação NÃO consulta preferência por conta própria.** Entra por
  `generateNotifications` → `filterByPrefs` (invariante 24). E `Record<Union, T>` vai deixar o
  `tsc` vermelho em `components/notifications/notification-meta.tsx` e
  `components/search/search-meta.tsx` até você dar um ícone ao membro novo — é a armadilha
  funcionando.
- **`ai_user_preferences.allow_memory` JÁ EXISTE no banco** e não é lida por ninguém ainda.
  Ela é do Bloco 3; o Bloco 1 não a tocou de propósito.
- ⛔ **Apagar conversa apaga a medição de custo dela.** `ai_conversations` → `ai_runs` →
  `ai_usage_events` é cascade. A tela declara isso antes de confirmar
  (`src/lib/ai/retention.ts`, `oQueTambemSai`). Se algum bloco futuro fizer migration, essa é
  a FK a reconsiderar — seria o único jeito de preservar o histórico de gasto.
- **Não há retenção automática, e é decisão.** Não escreva um job que apague conversa velha.
- **`getUsageSummary` aceita `LeituraDoDono`** (invariante 79), para o Cron service-role usar
  a mesma leitura de `/ia/consumo`. Não some consumo num segundo lugar.

**O arquivo a abrir primeiro no que vier depois:** `src/lib/ai/server/insight-job.ts` — é o
único ponto do sistema que roda um run de IA com o dono vindo de FORA da sessão, e o cabeçalho
dele explica por que os três cuidados (escopo explícito, uma tentativa por módulo, isolamento
por módulo) não são estilo.

---

## ✅ 18-E BLOCO 4 CONCLUÍDO (2026-08-09) — o job automático

`allow_insight_jobs` existe, nasce `false`, **e liga alguma coisa**. Com ela desligada, insight
continua existindo só sob demanda — sem nenhuma linha gravada.

### ⛔ O que o Bloco 4 fixou e NÃO pode ser afrouxado

1. **A SESSÃO SEMPRE VENCE, e a trava é a RLS — não o `coalesce`.**
   `ai_begin_insight_run` ganhou `p_user_id`, honrado só quando `auth.uid()` é nulo. Mesmo que
   alguém invertesse a ordem do `coalesce`, a função continua `security invoker`: um
   autenticado apontando para outro dono não lê as preferências, não lê a credencial e não
   consegue o `insert` em `ai_runs`.
2. **`ai_runs.automatic` é DERIVADO de `auth.uid() is null`, nunca recebido.** Um
   `p_automatic boolean` daria ao chamador o poder de escolher contra qual teto ele gasta.
3. **Os DOIS tetos valem.** O job passa pelo próprio (`job_monthly_budget`, **NOT NULL** — teto
   opcional sobre gasto invisível é teto que não existe) e depois pelo diário/mensal global.
   Qualquer um dos dois barra.
4. **`allow_insight_jobs` NÃO é ANDada com as chaves de módulo — ela as precede.** Diferente de
   `allow_vision`, cujas três chaves servem ao mesmo efeito. Aqui os três módulos são efeitos
   independentes: desligada, nada roda; ligada, o módulo sem chave é **PULADO** e os outros
   seguem. A regra é pura, em `insights/job.ts`.
5. **`ai_insight_jobs` registra uma linha por MÓDULO por EXECUÇÃO — inclusive `pulado`.**
   Quando o job é barrado não existe linha em `ai_runs`; sem esta tabela o "registra o motivo
   sanitizado" ficaria só no log da Vercel. Append-only: **só policy de SELECT**, e quem
   escreve é a service role. `run_id`/`insight_id` **sem FK, de propósito** (invariante 38).
6. **Só `/api/cron/insights` importa `server/insight-job`** — teste de fronteira. Uma Server
   Action que o alcançasse daria a um autenticado o poder de disparar a varredura de outro.
7. **A dedupe não é reimplementada no job.** Ele entra por `runInsight`, que resolve a chave
   **antes** da admissão. Chave repetida ⇒ `reaproveitado`, sem run e sem custo.

### O par `client`/`userId` virou UM objeto — e por quê

`LeituraDoDono` (`src/lib/supabase/owner.ts`), último parâmetro opcional. `getSessionHistory`
(17-F) recebe os dois como campos separáveis, e por isso precisa do guard
`if (range.client && !owner) return []`. Com um objeto único, **"client sem userId" deixa de
ser representável** e o guard vira desnecessário. `getSessionHistory` **não** foi reescrita —
ela funciona, tem testes e não estava no caminho.

Mora em `src/lib/supabase/`, não em `src/lib/ai/`: o contrário faria finance/nutrition/training
dependerem do módulo de IA — a seta ao contrário que mandou `tone` para fora de `ai/`.

**Foram NOVE funções, não oito.** A nona é `getMealTypes`, chamada por dentro de
`getDiaryMeals`: sem ela, o coletor de Dieta rodaria sob service role com a lista de tipos de
refeição vazia — e refeição sem tipo não entra no total do dia. A lista do handoff anterior
tinha sido medida antes e essa transitiva escapou. **Confira as transitivas.**

⚠️ Duas das nove leem **views** (`accounts_with_balance`, `card_statements_with_total`). Sob
service role a RLS da view não filtra nada; as duas expõem `user_id`, e é nele que o `.eq`
pega — conferido.

### ⚠️ Um defeito PRÉ-EXISTENTE que o Bloco 4 encontrou e corrigiu

**`allowVision` (18-D) entrou em `aiPreferencesSchema` como `z.boolean()` obrigatório, mas
nunca foi acrescentada ao payload de `ai-preferences-form.tsx` — nem havia interruptor para
ela na tela.** Resultado: `saveAiPreferences` vinha recusando **todo** salvamento de
preferências com "Autorização de envio de arquivo inválida", e a tela não tinha como destacar
o campo, porque ele não existia nela.

`tsc` não pega isso — a action recebe `unknown`. O que pega é comparar as duas listas, e é o
que o teste novo em `validators/ai.test.ts` faz (varredura do código-fonte, como
`chat-events.test.ts`, porque o projeto não tem infraestrutura de teste de componente).
**Ao acrescentar campo obrigatório a um schema usado por formulário, acrescente ao payload no
mesmo commit.**

### Números reconferidos (2026-08-09, depois do Bloco 4)

**130 tabelas** no `public`, **18 `ai_*`**; **3.385 testes / 166 arquivos**; **2** rotas de
Cron; **4** desfechos de `ai_insight_jobs`. Ferramentas (**29**), commands (**13**) e agentes
(**9**) **inalterados** — o Bloco 4 não acrescentou nenhum dos três.

### O que ficou de fora do Bloco 4, declarado

Nenhuma notificação sobre o job · nenhuma ferramenta e nenhum command · o job não escreve nos
módulos do dono (só gera insight) · sem retry entre execuções · o segundo slot do Cron (21h
BRT) segue só com as notificações · `getSessionHistory` não foi migrada para a forma nova ·
as outras **17** tabelas `ai_*` continuam com a policy na forma antiga (40 lints
`auth_rls_init_plan`); só a tabela desta subfase usa `(select auth.uid())`.

---

## ✅ 18-E BLOCOS 1–3 CONCLUÍDOS (2026-08-09) — branch `feat/18-e-insights`

**Desenho validado com o dono antes de qualquer linha de código**, como nas quatro subfases
anteriores: `docs/superpowers/specs/2026-08-09-18e-insights-relatorios-dashboards-design.md`.

### ⛔ O que a 18-E fixou e NÃO pode ser afrouxado

1. **`ai_insights.explicacao` guarda os TOKENS `{{ind:<id>}}`, nunca o número resolvido.**
   Enquanto o texto guardar tokens, é IMPOSSÍVEL o banco conter um insight que cite um número
   fora de `ai_insight_sources` — a garantia deixa de depender de o validador ter rodado.
2. **`confianca` não existe no schema de saída do modelo.** Irrepresentável vence recusado.
   `insights/confidence.ts` declara `rebaixar`, e **`promover` não existe**.
3. **`insights/temporal.ts` não importa `resumoMes`, `metrics.ts` nem `calc.ts`.** Cinco
   recusas: janela incompleta, sem período anterior, base zero (nunca `Infinity`/`NaN`), ponto
   parcial contaminando o agregado, e **unidades diferentes não se comparam**.
4. **A checagem de vocabulário roda EM PRODUÇÃO** (`insights/validate.ts`), não só na suíte —
   o texto vem do modelo em runtime e não há função pura para varrer.
5. **`insights/collectors/` é a TERCEIRA porta**, e é mais larga que as duas primeiras. Os três
   controles que o Tool Registry dava voltam por outro caminho: chave na action **e** no RPC,
   teto declarado por coletor (TETO + 1), e `ai_insight_sources` como auditoria. **Nenhum
   `.from()` em `insights/`.**
6. **Nada em `dashboard/` alcança `server/insight-runner` nem `actions/ai-insights`** — teste
   de import. Gerar é em `/ia/insights`, por clique.

### ⚠️ Quatro coisas que a 18-E descobriu e você vai reencontrar

1. **Um teste de fronteira pode ser vacuamente verde.** A lista `modulos` do
   `boundaries.test.ts` é escrita à mão: uma pasta nova fora dela passa sem provar nada. Foi
   por isso que `insights/` ficou dentro de `src/lib/ai/` e que `tone` entrou na lista.
2. **Um teste escrito como aviso de fato dispara.** O `"8-D só pode negar médias enquanto elas
   não existirem"` (18-B) ficou vermelho sozinho. Foi reescrito com o escopo certo — do
   SISTEMA para a FERRAMENTA —, mantendo as duas linhas que provam que os adapters continuam
   sem média.
3. **Teste amarrado ao ÚLTIMO item de uma lista quebra na próxima adição.** O
   `"anexa 'treinos' no fim"` quebrou quando `insights` entrou em `DASH_CARD_IDS`. Foi
   reescrito para afirmar a REGRA, não o estado da época.
4. **Varredura por substring num JSON inteiro dá falso positivo** — `"acao"` casa dentro de
   `"afirmacao"`. Varra os NOMES dos campos.

### Números reconferidos (2026-08-09)

**129 tabelas** no `public`, **17 `ai_*`**; **3.347 testes / 164 arquivos**; **7** itens em
`AI_SECTIONS`; **11** cards em `DASH_CARD_IDS`; **4** formas de `origem`; **3** espécies de
`ai_runs.kind`. Ferramentas (29), commands (13) e agentes (9) **inalterados**.

---

## ✅ 18-D CONCLUÍDA (2026-08-09) — branch `feat/18-d-runner-e-tela`

Os **cinco blocos** fecharam. O pipeline anda de ponta a ponta: **enviar → ler → revisar →
propor → confirmar**, e nenhum lançamento definitivo nasce das quatro primeiras etapas.

**O arquivo que o próximo agente deve abrir se for mexer nisto:**
`src/lib/ai/server/extraction-runner.ts` — é o único arquivo do sistema que manda um documento
do dono para fora, e o cabeçalho dele explica por que a ordem dos dez passos não é estilo.

### ⛔ O que a 18-D fixou e NÃO pode ser afrouxado

1. **`tokensDeArquivos` entra em `computeReservation`.** `core/text.ts` devolve `""` para
   imagem de propósito; sem essa linha o orçamento deixa passar em silêncio a chamada cara.
   Há teste com número escrito à mão, e a mutação que remove a linha o derruba.
2. **A saída da extração é Zod `.strict()`, e é ela a defesa contra injeção** — não o aviso do
   bloco não confiável. Não existe campo que signifique "execute".
3. **O bloqueio por confiança roda no servidor** (`revisar()`), não só como botão escondido.
4. **Anexo continua fora de `changed_fields`** (§3.6). A anexação é uma segunda action, fora do
   Approval Engine.
5. **`vision/` está em `CAMADAS_PURAS`** no teste de fronteira: ela decide o que é o arquivo,
   quanto custa e se merece confiança **sem ver um byte**.
6. **O detector de magic bytes é UM (`@/lib/files/magic-bytes`); a política é de cada tela.**
   As fotos de 16-C/16-E aceitam HEIC (só guardam o arquivo); a IA o recusa (os provedores não
   o aceitam). Uma allowlist única faria uma das duas errar.

### ⚠️ Três coisas que a 18-D descobriu e você vai reencontrar

1. **`transactions.amount` é `numeric(14,2)` EM REAIS**, não inteiro em centavos. O `CLAUDE.md`
   dizia "dinheiro em centavos (integer) no financeiro" de forma genérica, e isso é falso para
   `transactions`. Confira o tipo da coluna antes de comparar valores.
2. **`vitest` não checa tipo — de novo.** Três erros de tipo em arquivos de teste passaram
   verdes nesta subfase (`AiError` sem `retryable`, helper tipado por inferência do literal).
   `npx tsc --noEmit` sempre.
3. **Um `Record` sobre uma união é a melhor trava para "código novo sem frase em pt-BR".**
   `MENSAGEM_ADMISSAO` mudou de casa (do `chat-runner` para o `run-store`) justamente para os
   dois runners compartilharem-no: um segundo mapa teria deixado o primeiro incompleto em
   silêncio.

---

## 📌 Registro: como a 18-D chegou aqui — branch anterior `feat/18-d-visao-comprovantes`

> **A 18-D TEM DESENHO VALIDADO AGORA.** Ele foi escrito com o dono em **2026-08-08**, antes
> de qualquer linha de código, e está em
> **`docs/superpowers/specs/2026-08-08-18d-visao-comprovantes-design.md`**. **Leia-o antes de
> continuar** — as cinco decisões dele já estão no código, e mudá-las é reabrir o que foi
> aprovado.

### As cinco decisões do dono (2026-08-08)

| # | Decisão |
| --- | --- |
| 1 | **Caminho dedicado** — o arquivo **nunca** entra no histórico do chat |
| 2 | **Comprovante e nota fiscal, só** — rótulo nutricional, CSV/OFX/Excel e conversa sobre documento ficam FORA, declarados |
| 3 | **Rota própria `/ia/comprovantes`** |
| 4 | **Chave `allow_vision`** — décima chave, nasce `false`, ANDada no servidor |
| 5 | **Nada some sozinho** — descartar é clique do dono |

### ✅ O QUE JÁ ESTÁ PRONTO E VERDE (6 commits)

| Commit | O quê |
| --- | --- |
| `c50b2bf` | **Bloco 1** — `AiContentPart` ganha `image`/`file` (sem `url`, sem `storagePath` — o caminho não é representável); `AiProviderClient.generateObject`; catálogo com `visao` verificada; `usage/vision-tokens.ts` entrando na reserva |
| `523469c` | **Bloco 2** — `sniffMime` (magic bytes), `probe` (dimensões/páginas), tabela `ai_documents`, chave `allow_vision`, `document-store.ts`, action de envio |
| `bad5793` | **Bloco 3a** — `vision/contracts.ts`, `schema.ts` (Zod `.strict()` em todo nível + JSON Schema), `confidence.ts` (rebaixamento, `podePropor`) |
| `535028e` | **Bloco 4** — `duplicates.ts` e `receipt-items.ts` |
| `863487e` | **Bloco 3b (banco)** — `ai_runs.kind`, `ai_document_extractions`, `origem = 'documento'`, RPC `ai_begin_extraction_run` |
| `9b998ab` | Fronteira: **par declarado**, não terceira porta |

**Estado medido em 2026-08-08:** **126 tabelas** no `public`, **14 `ai_*`**; **3.163 testes /
154 arquivos**, `lint` e `tsc` limpos. Migrations aplicadas via MCP, `get_advisors` **sem lint
novo**, `src/types/supabase.ts` regenerado.

### ✅ O QUE FALTAVA — ENTREGUE EM 2026-08-09

~~**1. Bloco 3c — o runner da extração (Processo 2).**~~ ✅ `src/lib/ai/server/extraction-runner.ts`,
`src/lib/ai/vision/prompt.ts` e `extrairComprovante` em `src/lib/actions/ai-documents.ts`.

~~**2. Bloco 5 — a tela e a ponte com a 18-C.**~~ ✅ `src/app/(app)/ia/comprovantes/`,
`approval/document.ts` (`origem = 'documento'`), `server/document-queries.ts` e os três
componentes em `src/components/ai/receipt-*.tsx`.

⚠️ **Duas correções de rumo em relação ao que este arquivo previa**, ambas registradas no
`LAST_PHASE_SUMMARY.md`:

- O 6º item da navegação entrou em **`src/lib/ai/constants.ts`** (`AI_SECTIONS`), que é a
  navegação INTERNA do módulo — não em `src/config/nav.ts`, que é a Sidebar do sistema e já
  tinha a entrada "Inteligência Artificial" apontando para `/ia`.
- A ponte usa **`criarPropostaDeDocumento`**, uma função nova ao lado de
  `criarPropostaDeDesfazer` — e não `criarProposta`, que grava `origem: "ferramenta"` fixo e
  exige conversa, run e tool call (o CHECK do banco recusaria).

### ⚠️ Três coisas que esta subfase descobriu e você vai reencontrar

1. **FK composta exige `unique` composta no ALVO.** `(document_id, user_id)` → `ai_documents
   (id, user_id)` falhou com `42830` porque `ai_documents` só tinha a PK. Foi o mesmo tropeço
   da 16-E (`20260805100400`). O rollback foi total — DDL no Postgres é transacional.
2. **A chave do advisory lock de `ai_begin_extraction_run` é IDÊNTICA à do chat.** Não é
   preguiça: o recurso disputado é o **orçamento do usuário**, não a espécie do run. Com
   namespace próprio, uma extração e uma mensagem simultâneas passariam as duas.
3. ~~**`photoFileSchema` (16-E) confere `file.type`, que é DECLARADO PELO CLIENTE.**~~
   ✅ **RETROPORTADO EM 2026-08-09.** As fotos de evolução (16-E) e de receita (16-C) passaram
   a conferir os BYTES por `@/lib/files/photo-guard`, que compartilha o detector com o
   `sniffMime` da IA. ⚠️ **O detector é um; a política é de cada tela** — elas aceitam HEIC (só
   guardam o arquivo), a IA o recusa (os provedores não o aceitam). Nas três telas, o MIME
   gravado em `attachments.mime_type` passou a ser o **detectado**, nunca o declarado.

---

## 📎 Referência da fase (o arquivo original)

**Desenho da fase (leia ANTES):** `docs/superpowers/specs/2026-08-04-modulo-ia-design.md`
**O arquivo a abrir:** `docs/phases/PHASE_18_D_AI_VISION_DOCUMENTS_RECEIPTS.md`
**O que já existe:** `docs/handoff/LAST_PHASE_SUMMARY.md` → seções **18-A**, **18-B** e **18-C**

> ~~⚠️ **A 18-D não tem desenho validado ainda.**~~ ✅ **Ela ganhou um em 2026-08-08**
> (`docs/superpowers/specs/2026-08-08-18d-visao-comprovantes-design.md`), e as cinco decisões
> do dono estão no código. O bloco abaixo fica como REGISTRO do que a subfase herdou — e a
> regra que ele afirma continua valendo para a 18-E: **brainstorm primeiro, spec depois, código
> por último**.

### ⛔ O QUE A 18-D HERDA E NÃO PODE AFROUXAR

1. **Anexo, foto e URL assinada NÃO entram em `changed_fields` de auditoria** (§3.6). A trava é
   de FORMA (escalar de até 200 caracteres), não de nome — não a troque por lista de proibidos.
2. **As fotos de evolução e a de receita são o dado mais sensível do sistema** (invariantes
   21/22 e 29 da Dieta): bucket privado, nome aleatório, pasta `{user_id}/…`, **URL assinada de
   5 min gerada a cada leitura**, validação do arquivo real no servidor, FK composta. Um arquivo
   que a IA leia sai desse regime — e mandá-lo a um provedor externo é decisão do dono, não sua.
3. **As três actions com `FormData`** (`body-measurements.ts`, `imports.ts`,
   `nutrition-recipes.ts`) foram deixadas de fora da 18-C **de propósito**: são Caso B e
   envolvem upload. Elas são o ponto de partida do levantamento da 18-D.
4. **Dado é dado, nunca instrução.** Imagem e documento entram por `security/untrusted.ts`,
   como resultado de ferramenta — jamais como mensagem de sistema.

### ✅ A 18-C ESTÁ CONCLUÍDA (2026-08-08) — os seis blocos

> ## ✅ O BLOCO 5 FECHOU (2026-08-08) — A TELA DE AÇÕES E O DESFAZER
>
> **`/ia/acoes`** é o 5º item da navegação do módulo. Ela une as três fontes de verdade
> (`ai_action_proposals`, `ai_action_approvals`, `ai_action_executions`), **deriva** o estado de
> cada linha em `approval/history.ts` (puro, `agora` injetado) e oferece o desfazer quando o
> command declara inverso.
>
> **O botão não desfaz — ele PROPÕE.** `prepararDesfazerDaIa` grava uma proposta com
> `origem = 'desfazer'`, e quem executa é `confirmarAcaoDaIa`, a mesma porta de qualquer outra
> alteração: mesmo hash, mesmo prazo de 10 min, mesmo uso único, mesma revalidação.
>
> **Três coisas que não podem ser afrouxadas:**
> 1. `executando` **não é sucesso nem falha** — a linha reservou a vaga e não voltou. Rótulo
>    *"sem desfecho registrado"*, filtro "Precisam de atenção", desfazer recusado com o motivo.
> 2. **Execução cuja conversa foi apagada APARECE**, marcada como *sem trilha*. Se a tela
>    listasse só propostas, a decisão de não pôr FK em `ai_action_executions` viraria letra morta.
> 3. **Sem inverso, a tela EXPLICA** — e o motivo é obrigatório por tipo (`ComoDesfazer`), não
>    por convenção.
>
> **A migration do bloco** (`20260812100000_ai_action_proposals_desfazer.sql`) afrouxou
> `conversation_id`/`run_id`/`tool_call_id` **na coluna** e as manteve obrigatórias **no CHECK**
> `ai_action_proposals_origem_coerente`. A proposta de desfazer não nasce de tool call, e não
> pode depender de a conversa existir.
>
> ⚠️ **A regra que sai daqui para toda ação futura com desfazer:** o inverso recebe o que a
> EXECUÇÃO registrou (`target_id` + `changed_fields`), nunca o payload original — que some com
> a conversa. Campo que o inverso precise **tem de estar na allowlist §3.6** do command
> original (é o caso de `log_date` em `registrarHabito`), e há teste que fica vermelho se sair.

> ## ✅ O BLOCO 4 FECHOU (2026-08-07) — A IA ESCREVE
>
> **7 ferramentas de escrita, 13 commands, 5 chaves — todas desligadas de fábrica.**
> `todo.criar_tarefa` · `todo.concluir_tarefa` · `todo.reagendar_tarefa` · `habits.registrar` ·
> `calendar.criar_evento` · `nutrition.registrar_consumo` · `finance.lancar_transacao`.
>
> As duas decisões que o texto abaixo antecipava **foram tomadas como previsto**: a segunda
> porta declarada (`approval/commands/`) foi aberta no teste de fronteira, e o teste do registry
> vazio virou uma **lista nomeada** — acrescentar um command continua exigindo editá-lo.
>
> **E uma terceira, que o Bloco 3 não previu e quase se perdeu:** importar o objeto `Command`
> inteiro no Tool Executor daria ao laço um `executar` na mão. Por isso **cada command é
> partido em dois arquivos** (`<modulo>-preview.ts` só lê, `<modulo>.ts` escreve) e o executor
> importa `commands/previews.ts`, um registry sem `executar` em entrada nenhuma. A garantia
> *"a escrita não acontece dentro do run"* voltou a ser **transitiva de import**, e não uma
> convenção de "não chamar".
>
> **O que continua fora, e por decisão:** as ações de risco 4 (pagar fatura, parcelar, dividir
> com terceiros, transferir entre contas, editar/excluir registro existente). Os seis `undo`
> existem como command e **não têm ferramenta** — só o botão da tela os alcança.
>
> Detalhe completo em `docs/phases/PHASE_18_C_MATRIZ_DE_FERRAMENTAS.md` → *"O que o Bloco 4
> entregou de fato"*, e nas invariantes **40 a 47** do `CLAUDE.md`.
>
> ~~**O que falta na 18-C:** os blocos 5 e 6~~ — ✅ **fechados em 2026-08-08**, ver o bloco
> acima.

**Blocos 1, 2 e 3 concluídos** (2026-08-07):

- **1–2 · leitura.** Os **nove módulos** têm ferramentas de LEITURA (22 no registry, 9
  agentes), cada um atrás da sua flag `allow_*`, todas nascendo desligadas.
- **3 · Approval Engine.** O dono autorizou a escrita, e o motor está pronto: 3 tabelas
  (`ai_action_proposals`, `ai_action_approvals`, `ai_action_executions`) + a migration das
  chaves `allow_write_*`, hash canônico do EFEITO, prazo de 10 min **do banco**, uso único
  por índice, revalidação por recálculo, e as travas de fronteira testadas.

⛔ **NO FIM DO BLOCO 3 NENHUMA ESCRITA ERA POSSÍVEL — de propósito.** Eram três travas
independentes: nenhum descriptor `kind: "escrita"` no registry, as cinco chaves `allow_write_*`
nascendo `false`, e o **registry de commands VAZIO**. *O Bloco 4 desfez a primeira e a
terceira, na ordem da matriz; **a segunda continua de pé** — as cinco chaves seguem `false` no
banco, e são elas que decidem se a IA pode preparar qualquer alteração.*

**O Bloco 4 foi o primeiro em que a IA passou a alterar dado real.** Ordem crescente de risco,
um command por vez, com teste de equivalência contra o formulário — a ordem foi cumprida:
`criarTarefaTodo` → `concluirTarefaTodo` → `registrarHabito` → `reagendarTarefaTodo` →
`criarEvento` → `registrarConsumo` → **`lancarTransacao` por último**.

⚠️ **Duas coisas que o Bloco 4 teve de decidir, e que o Bloco 3 deixou marcadas no código
(ambas resolvidas — ficam aqui como registro):**

1. `boundaries.test.ts` proíbe `src/lib/ai/` de importar serviço de módulo fora de
   `tools/adapters/`. Os commands vão precisar disso — a regra "nenhuma regra de negócio é
   reescrita" exige. Abrir uma **segunda porta declarada** (`approval/commands/`) é a
   decisão certa; **apagar o teste não é a mesma coisa**, e é o atalho que vai parecer fácil.
2. O teste `"nasce VAZIO na 18-C · Bloco 3"` fica vermelho no primeiro command. Editá-lo é
   parte do trabalho, e é assim que se pretende: acrescentar um command não deve ser algo que
   se faz sem notar.

⚠️ **Leia a §3 do spec da 18-C.** As seis decisões que estão lá (a escrita fora do run, o hash
do efeito, a idempotência derivada da aprovação, o snapshot restrito, o desfazer por command,
o desempate do roteador) foram validadas com o dono e mudam o desenho em relação ao que
`PHASE_18_C_*.md` sugeria.

### O que o Bloco 3 deixou pronto (reuse, não reescreva)

| Precisa de… | Use |
| --- | --- |
| Gravar a intenção de uma escrita, DENTRO do run | `approval/proposals.ts` → `criarProposta` |
| Calcular o hash do efeito | `approval/proposals.ts` → `hashDe` (**nunca** monte o efeito por fora) |
| Decidir prazo, uso único, hash e command | `approval/state.ts` → `admitirExecucao` (puro, `agora` injetado) |
| Detectar que o mundo mudou | `approval/state.ts` → `revalidarEfeito` |
| Derivar o estado para a tela | `approval/state.ts` → `derivarEstadoDaProposta` |
| Registrar a decisão do dono | `approval/execute.ts` → `registrarDecisao` |
| Executar, FORA do run | `approval/execute.ts` → `executarAcaoAprovada` (só a partir de `src/lib/actions/`) |
| Filtrar o que vai para a auditoria | `approval/contracts.ts` → `filtrarCamposTocados` |

### O que a 18-B deixou pronto (reuse, não reescreva)

| Precisa de… | Use |
| --- | --- |
| Declarar uma ferramenta nova | `tools/registry.ts` (estático) + `tools/contracts.ts` |
| Ler dado sem reescrever regra | `tools/adapters/training.ts` — o molde: chama o serviço que a tela já usa |
| Validar quem pode chamar o quê | `tools/guard.ts` (ordem de checagem fixa) |
| Executar e podar a saída | `tools/executor.ts` |
| O laço de passos | `server/tool-loop.ts` — **teto por TENTATIVA**, não por run |
| Escolher o agente | `agents/routing.ts` — a flag `allow_*` vence sempre |
| Gravar a trilha | `tools/audit.ts` → `ai_tool_calls` (o PEDIDO, nunca o resultado) |
| Montar a trilha para a tela | `tools/sources.ts` + `components/ai/source-chips.tsx` |

**Ferramenta nova exige, no mesmo commit:** rótulo em `ROTULO_DA_FERRAMENTA`
(`lib/ai/constants.ts` — há teste sobre o registry real), frase da permissão em
`ROTULO_DA_PERMISSAO`, e `refs` com rota interna que passe por `rotaInternaAceita`.

### O que a 18-A deixou pronto para você usar (não reescreva nada disto)

| Precisa de… | Use |
| --- | --- |
| Contratos de IA independentes de fornecedor | `src/lib/ai/core/contracts.ts` |
| Escolher provedor e modelo | `core/router.ts` — **nunca** aceite provedor/modelo do cliente sem passar por ele |
| Classificar erro e decidir fallback | `core/errors.ts` + `core/fallback.ts` |
| Custo e orçamento | `usage/meter.ts` · `usage/reservation.ts` · `usage/budget.ts` |
| Empacotar dado recuperado | **`security/untrusted.ts`** — é o ponto de entrada da 18-B |
| Sanear erro e log | `security/redact.ts` (único caminho de saída de erro do módulo) |
| Falar com o provedor | `providers/provider-factory.ts` |
| Rodar um chat inteiro | `server/chat-runner.ts` |
| Ler as telas | `src/lib/ai/queries.ts` (colunas explícitas, nunca `select('*')`) |

### As dez coisas que a 18-A fixou e a 18-B NÃO pode afrouxar

1. **A IA nunca acessa o banco.** Camada controlada de ferramentas; sem SQL livre, sem
   `service_role` no caminho da requisição, sem ferramenta criada em runtime.
2. **`user_id` só de `authContext()`** — não existe nos schemas de entrada. Zod `.strict()`.
3. **`core/` não importa pacote de fornecedor.** Só `providers/` importa `ai` e `@ai-sdk/*`.
   Garantido por ESLint, `server-only` e teste que pega import dinâmico.
4. **Tool Registry nasce VAZIO na 18-A.** Nenhuma definição vai ao provedor. Tool call
   inesperada encerra o run como `failed` com `UNEXPECTED_TOOL_CALL` sanitizado.
5. **A master key nunca entra no banco.** Envelope AES-256-GCM, AAD
   `credential_id | owner_id | provider | key_version`, keyring versionado. `credential_id` é
   gerado **antes** de cifrar. Query da UI com colunas explícitas — nunca `select('*')`.
6. **`ai_usage_events` é por TENTATIVA**, com `UNIQUE (run_id, attempt_index)` + FK composta
   `(run_id, user_id)`. Insert primeiro, `23505` lê o existente. **`select-then-insert` não é
   garantia de idempotência.** Moeda canônica **USD**, sem câmbio na 18-A.
7. **O run é reserva financeira** e seu início é **atômico** (`SECURITY INVOKER`,
   `SET search_path = ''`, advisory lock por usuário, `auth.uid()` lido dentro da função).
8. **Recuperação preguiçosa é a primária.** O Cron roda `0 12` e `0 0` — **2×/dia, pior caso
   de 12 h**. Rodar a reconciliação **antes de reservar novo run** é o que impede um run
   travado de bloquear a próxima conversa e prender orçamento.
9. **Sem master key, só a IA para** — o resto do sistema continua funcionando.
10. ~~**Trava de honestidade:** o assistente da 18-A **não tem acesso aos dados** e deve dizer
    isso, não inventar número.~~ ⚠️ **REESCRITA NA 18-B** (prompt-base `seguranca-v2`): a
    versão acima virou MENTIRA no instante em que a IA passou a ler Treinos. A trava continua
    sendo critério de aceite, mas o que ela afirma mudou — o assistente **só sabe o que as
    ferramentas devolveram naquela conversa**, aponta o módulo quando não devolveram, e nunca
    inventa, estima nem infere número. **Lição para a 18-C: todo texto que descreve o que a IA
    não faz é datado.** Ao acrescentar ferramenta, releia `agents/security-prompt.ts`,
    `AVISO_SEM_ACESSO` e `RESUMO_DO_ASSISTENTE` (`lib/ai/constants.ts`) — os três afirmam a
    REGRA, não o estado, exatamente para não vencerem de novo.

### O que continua bloqueado — atualizado em 2026-08-09

~~Escrita, propostas e confirmações (18-C)~~ ✅ · ~~imagens e documentos, **inclusive qualquer
upload** (18-D)~~ ✅ — mas **só comprovante e nota fiscal**, e só pelo caminho dedicado de
`/ia/comprovantes`: o arquivo **nunca** entra no histórico do chat, então "o que tem nessa
foto?" continua sendo 18-F.

**Continua bloqueado:** insights, relatórios e dashboards (18-E) · memória, voz, automações,
botão flutuante, **sino/notificações**, busca global e **conversar sobre um documento** (18-F).
Rótulo nutricional por foto e CSV/OFX/Excel seguem fora — o segundo é da **Fase 06**, e não se
cria um segundo caminho de importação.

### As armadilhas que a 18-C acrescentou à lista

1. **Proibição em prompt é DESCRITA, nunca CITADA.** O teste de vocabulário proibido varre o
   texto inteiro do perfil e não distingue uso negado (só o prompt-base tem essa folga). E ele
   está certo: a frase literal no contexto a torna mais provável de sair, não menos.
2. **Teste que lê arquivo do disco precisa achar a versão VIGENTE, não um nome fixo.** O teste
   do RPC lia `20260808100000_ai_tool_audit.sql` pelo nome; com a definição da função numa
   migration nova, ele ficaria vermelho para sempre **com o banco correto** — e um teste que
   reprova o estado certo é abandonado.
3. **`cd` no shell persiste entre chamadas.** Um `cd src/app/(app)` deixou `tsc` e `vitest`
   "passando" sem rodar arquivo nenhum. **Confira o `pwd` antes de acreditar num verde.**
4. **`as unknown as` em fixture de teste desliga o `tsc` justamente onde ele ajudaria.** Duas
   fixtures desta subfase tinham campo inexistente (`"cinza"` como cor, `amount` no lugar de
   `targetAmount`) e só a asserção pegou.
5. **Ao acrescentar módulo ao roteador, procure a colisão ANTES.** "meta" existe em três
   módulos, "gordura" casaria dentro de "gordura corporal", "tarefa" é do TO-DO e não da Fase
   09. Palavra ambígua no vocabulário não erra o roteamento: ela o **desliga**, jogando tudo no
   orquestrador.

### As armadilhas que a 18-B encontrou — todas custaram uma rodada de revisão

1. **Teste que espelha a implementação não prova nada.** Seis ocorrências numa subfase só. Um
   `satisfies Record<…>` já garante coerência entre duas listas: um teste que só reconfere isso
   **não tem como falhar sem o `tsc` falhar antes**. Prefira valor escrito à mão, com a
   aritmética no comentário. E toda lista estática que aponta para o mundo real (rota, arquivo)
   precisa de um teste que **confira no disco** — o compilador nunca vê isso.
2. **Duplo de teste que não modela restrição do banco esconde defeito.** Foi a causa raiz do
   único CRITICAL da subfase: com os duplos cegos ao `UNIQUE`, o bug de índice ficava invisível
   na consequência (a IA parava de ler) e só as asserções explícitas de sequência mordiam.
3. **`vitest` não checa tipo — rode `npx tsc --noEmit` sempre.** Helper de teste tipado por
   inferência do literal (`Partial<typeof ENTRADA>`) aceita menos campos que a função real:
   testes verdes com o `tsc` vermelho. Amarre no contrato.
4. **Cobrir as duas pontas não cobre o elo entre elas.** O runner podia parar de repassar a
   rota ao prompt e a suíte inteira continuava verde — um teste provava o bloco, outro provava
   a borda, nenhum provava o meio.
5. **Mutação: confira por md5 que ela ENTROU no arquivo antes de acreditar num verde.** O
   working tree é todo CRLF (`core.autocrlf=true`) e substituição multi-linha falha em silêncio.
   Isso aconteceu duas vezes, e nas duas o "verde" era falso.
6. **Toda trava de segurança escrita como lista de proibidos vai ser furada.** `parseRefs`
   recusava `//` e deixava passar `/\`, que o parser de URL resolve idêntico. Escreva a
   allowlist — e, quando a garantia depende de um parser, **pergunte ao parser no teste** em
   vez de confiar na sua leitura da especificação.

### As três armadilhas que a 18-A encontrou e você vai reencontrar

1. **`no-restricted-imports` usa semântica de .gitignore**, não de caminho: um grupo sem barra
   casa com qualquer componente. Ao acrescentar zonas no `eslint.config.mjs`, prefira `paths`
   (casamento exato) para pacotes, e leia o comentário que já está lá.
2. **`server-only` lança fora do bundle do Next**, então qualquer arquivo novo em
   `src/lib/ai/server/` fica intestável sem o alias do Vitest (`src/test/server-only-stub.ts`).
   O alias vale **só** no test runner — não afrouxe o build.
3. **FK composta impede o embed do PostgREST.** `ai_messages` ↔ `ai_runs` já são lidos em duas
   consultas de propósito (mesma consequência que a 16-E documentou nas fotos de evolução).
   Ao ligar uma tabela nova a outra do mesmo usuário, use FK composta e leia em duas consultas.

### A pergunta que a 18-B tem de responder ANTES de escrever código

`security/untrusted.ts` existe, está testado e **nunca foi usado** — porque a 18-A não recupera
nada. A 18-B é a primeira a passar dado do usuário para um modelo. Antes da primeira ferramenta
de leitura, deixe explícito: **quais campos** vão, **quantos registros**, **qual limite de
tamanho**, e **como o usuário liga e desliga cada módulo** (as flags `allow_*` de
`ai_user_preferences` já existem e nascem **todas desligadas** — nenhuma delas é lida ainda).

---

## 📌 Estado das fases anteriores — AS DUAS FRENTES ESTÃO CONCLUÍDAS

As 14 fases do roadmap original, a **Fase 15 (TO-DO)**, a **Fase 16 (Dieta e Alimentação)** e a
**Fase 17 (Treinos)** estão concluídas.

| Fase | Módulo | Situação |
| --- | --- | --- |
| **16** | Dieta e Alimentação (`/nutricao`) | ✅ **CONCLUÍDA** (16-A a 16-F) — **40 de 40** critérios |
| **17** | Treinos (`/treinos`) | ✅ **CONCLUÍDA** (17-A a 17-F, 2026-08-04) — **55 de 55** critérios |

Não existe 16-G nem 17-G. Os dois módulos estão em **modo manutenção/iteração**: melhoria
neles entra como **tarefa avulsa**, com branch própria, verificação completa e documentação
atualizada — não como subfase.

O veredito item a item dos 55 critérios da Fase 17 e dos 40 da Fase 16 está em
`docs/handoff/LAST_PHASE_SUMMARY.md`.

## ▶️ Se você foi chamado para uma tarefa avulsa

**Leitura obrigatória antes de tocar em código:**

1. `docs/project/PROJECT_RULES.md`
2. `docs/project/PROJECT_ARCHITECTURE.md` (a seção do módulo que você vai mexer)
3. `docs/project/CURRENT_STATUS.md`
4. `CLAUDE.md` da raiz — em especial **"Layout responsivo — 5 regras que vieram de bugs reais"**
   e a regra **"campo de TEXTO nunca é controlado pelo valor da URL"** (em "Camadas e fluxo de
   dados"): as duas saíram de defeitos que chegaram a produção e não aparecem no desktop de
   quem escreveu a tela
5. O arquivo da fase que criou a área (`docs/phases/PHASE_*`)
6. As invariantes dos dois módulos, listadas abaixo — elas continuam valendo integralmente

**Antes de fechar:** `npm run lint && npx tsc --noEmit && npm run test:run && npm run build`,
suíte verde também em `TZ=UTC`, smoke (rotas privadas → 307 `/login`; `/api/cron/*` → 401) e,
se mexer em RLS, teste pela role `authenticated` em transação com **rollback**.

### ⛔ A divisão com terceiros tem UM núcleo (2026-08-07) — não escreva o segundo

`decidirReaplicacao` (puro, `src/lib/finance/split.ts`) decide **se** a divisão mudou, **se**
pode ser mexida e **para onde** vai; `reapplySplit` (`src/lib/finance/split-reapply.ts`) faz o
I/O e só troca o modo de distribuir (`applySplit` à vista × `applySplitParcelado` parcelado).
`updateTransaction` e `updateInstallmentSplit` chamam os dois. Antes disso a regra estava
escrita duas vezes, e a compra parcelada simplesmente não podia ser redividida.

Três coisas que parecem detalhe e não são:

1. **A base do parcelado é a soma das parcelas ATIVAS, nunca `valor_total`.** Com parcela
   cancelada os dois divergem, e distribuir sobre o total contratado quebra a invariante de
   `distribuirTerceirosPorParcela` (Σ terceiros ≤ Σ parcelas).
2. **Cancelar parcela cancela a COBRANÇA dela.** `cancelInstallmentFuture` apaga os
   `receivables` `pendente` das parcelas canceladas e recalcula `valor_pessoal`; recebível
   `cobrado`/`pago` recusa a ação inteira. Sem isso o terceiro devia por parcela inexistente.
3. **Alterar divisão alcança fatura fechada/paga de propósito** — quem importou a fatura e só
   depois viu que a compra era de terceiro precisa corrigir o passado. O que protege o
   histórico é a recusa por recebível `cobrado`/`pago`, não a data da fatura.

Os embeds de `shared_expenses`/`receivables` em `queries.ts` levam **FK explícita**:
`receivables` alcança `transactions` por mais de um caminho, e ambiguidade de embedding do
PostgREST só estoura em runtime.

---

## ✅ O que a 17-F entregou (e você vai encontrar ligado)

| Integração | Onde |
| --- | --- |
| Card "Treinos" no dashboard geral (com **Continuar treino**) | `src/components/dashboard/general/training-card.tsx` |
| Busca global — exercício, treino, programa, sessão, meta, recorde | `src/lib/search/queries.ts` + **`training-links.ts`** (deep-links puros e testados) |
| Lançamento rápido — iniciar treino | `src/lib/actions/training-quick-add.ts` (delega para `createSession`/`startSession`) |
| 9 famílias de notificação | `src/lib/notifications/training.ts` (puro) + `training-cron.ts` (I/O) |
| Espelho do planejamento na agenda (opt-in) | `src/lib/training/{google-event,calendar-sync}.ts` + `training_calendar_sync` |
| Pontes com o TO-DO (treino e meta) | `src/lib/actions/training-integrations.ts` + `components/training/todo-link-dialog.tsx` |
| Hábito "Treinar" refletindo a sessão | `src/lib/training/{habit-reflection,habit-sync}.ts` + `training_preferences.habit_id` |
| Tipo de dia (treino/descanso) para a Dieta | `src/lib/training/day-kind.ts` + `day-kind-queries.ts` |

### ⛔ Quatro coisas que a 17-F travou e não devem ser afrouxadas

1. **A tabela de fonte de verdade.** O treino aconteceu → `training_sessions` (o hábito só
   reflete). Está planejado → `training_scheduled_workouts` (agenda e TO-DO são espelhos).
   Peso e medidas → `body_*`. Dia de treino/descanso → Treinos responde, a Dieta consome.
2. **`filterByPrefs` continua sendo o ÚNICO ponto onde a preferência decide.** Um tipo novo de
   notificação não deve checar preferência por conta própria.
3. **O teste de "sem linguagem de culpa" varre todo texto gerado** — em Dieta e em Treinos.
   Família nova passa pelo mesmo teste. Isso é proposital.
4. **FK COMPOSTA sempre que uma tabela apontar para outra dentro do mesmo usuário.** A RLS
   confere a própria linha e **não alcança a linha apontada** — foi assim nas fotos de evolução
   (16-E) e na ponte da agenda (17-F, onde permitia negação de serviço na chave única).

---

## ⛔ Invariantes do módulo Treinos que NÃO podem ser quebradas

1. **`tracking.ts` É A ÚNICA MATRIZ DE MEDIÇÃO.** Reimplementá-la faz o módulo somar quilos com
   segundos.
2. **`metrics.ts` É A ÚNICA FONTE DE AGREGADO** (17-D). Histórico, gráfico, recorde, **meta,
   dashboard e relatório** (17-E) precisam concordar entre si. Faltou um agregado? Acrescente
   **em `metrics.ts`** — nunca no consumidor.
3. **ASSISTÊNCIA SUBTRAI CARGA, CARGA ADICIONAL SOMA.** Já testado; não inverta o sinal.
4. **SEM PESO CORPORAL, A CARGA EFETIVA É INDISPONÍVEL — NUNCA ZERO.** Agregado incompleto é
   marcado como **parcial**, com o motivo.
5. **A BASE DO SISTEMA É IMUTÁVEL** (`user_id is null`, policies separadas por comando).
6. **MODELO É MUTÁVEL; EXECUÇÃO É IMUTÁVEL.** `session-queries.ts` e `history-queries.ts` **não
   leem `training_workouts`** — mantenha assim.
7. **STATUS DERIVADO NA LEITURA.** `atrasado`/`hoje` do planejamento, `parcial`/`concluido` do
   exercício e, desde a 17-E, **`atingida`/`expirada`/`em_atraso` da meta**. O CHECK do banco
   recusa os três da meta; a decisão do usuário (pausada, concluída, cancelada) vence sempre.
8. **NENHUMA EXCLUSÃO SILENCIOSA.** Excluir sessão exige confirmação **e recalcula os
   recordes**; excluir programa/treino pergunta o destino do que dependia dele; excluir meta
   exige `confirm: true` e avisa que o histórico dela vai junto.
9. **NENHUM ASSET DE TERCEIROS.**
10. **SEM PRESCRIÇÃO.** Nada de sugerir carga máxima, alvo de meta, prazo, diagnosticar dor ou
    prometer resultado. **Dor registrada bloqueia qualquer sugestão de aumento**, e o bloqueio
    não é configurável. Séries por grupo muscular é **registro**, nunca "o ideal é X".
11. **1RM É ESTIMATIVA**, com a fórmula visível; fora da faixa de validade a UI avisa e o valor
    **não vira recorde nem valor de meta**.
12. **DATA PURA `'yyyy-MM-dd'`** para o dia; instante é `timestamptz` e se lê com
    `dateInSaoPaulo`/`timeInSaoPaulo`. Aritmética em `Date.UTC` (`schedule.ts`, que desde a
    17-E também tem `addMonthsIso`), `hojeISO()` no servidor. **Nunca `toISOString().slice(0,10)`.**
13. **MEDIDA CORPORAL É `body_*`, MÓDULO CENTRAL** (16-E). A 17-E consome por `src/lib/body/`.
    `training_sessions.body_weight_kg` é o peso USADO naquele treino, congelado — **não** é
    histórico de medida. Nunca duas tabelas de peso corporal.
14. **AUSÊNCIA DE DADO NÃO É ZERO, E NÃO SE DIVIDE POR ZERO** (17-E). Meta sem medição devolve
    `null` com motivo; período sem treino devolve `null` na comparação e a tela diz "sem base".
    Nunca `NaN`, nunca `Infinity`, nunca "0%" no lugar de "não sei".
15. **SEM LINGUAGEM DE CULPA** (17-E). O calendário de consistência mostra dia livre como dia
    livre. Sem alarme, sem "faltas", sem "você falhou".

---

## ⛔ Invariantes do módulo Dieta que NÃO podem ser quebradas

1. **AUSÊNCIA DE DADO NÃO É ZERO.** `value_state` distingue `disponivel | traco |
   nao_disponivel | nao_aplicavel | em_revisao`, com CHECK no banco. Toda soma propaga
   `exato | aproximado | parcial` e a interface **tem de mostrar**. Nunca `amount ?? 0` fora
   de `calc.ts`.
2. **TODO TOTAL SAI DE `calc.ts`** — reuse `convertToBase` + `scaleNutrients` +
   `sumNutrients` + `mergeTotals`.
3. **SNAPSHOT HISTÓRICO IMUTÁVEL.** O total do consumo sai do `nutrients_snapshot`, nunca do
   catálogo. `food_id` é `on delete set null`, e o discriminador estável é `entry_kind`.
4. **PLANEJADO ≠ CONSUMIDO.** Tabelas separadas; consumo nunca escreve no planejamento.
5. **STATUS DERIVADO NA LEITURA.** `pendente` não existe no CHECK do banco.
6. **META VIGENTE POR DATA.** Alterar a meta de hoje não muda relatório anterior.
7. **A BASE DO SISTEMA É IMUTÁVEL** (`user_id is null`, policies separadas por comando).
8. **CONVERSÃO IMPOSSÍVEL É ERRO TIPADO**, nunca estimativa.
9. **NÃO INVENTE DADO NUTRICIONAL.** Fonte nova entra pelo pipeline de `scripts/nutrition/`.
10. **ARREDONDE SÓ NA APRESENTAÇÃO** (`roundForDisplay`).
11. **DATA PURA `'yyyy-MM-dd'`** para o dia + hora em coluna `time`. Use `src/lib/nutrition/
    calendar.ts` (aritmética em `Date.UTC`), nunca `new Date()` no fuso local.
12. **ÁGUA NÃO SE DUPLICA** — fonte de verdade é o módulo Hábitos (Fase 10).
13. **SEM PRESCRIÇÃO.** Estimador é opcional, mostra a fórmula, se identifica como estimativa
    e exige confirmação.
14. **A LISTA DE COMPRAS NÃO SOMA UNIDADES INCOMPATÍVEIS** (16-D). Mesma regra do módulo,
    aplicada a compras: 200 g + 1 xícara só viram uma linha com conversão real cadastrada;
    sem ela, linhas separadas com `separate_reason`. Massa com massa, volume com volume —
    **g ↔ ml exige densidade**, e "un" é contagem, não massa. Tudo em
    `src/lib/nutrition/shopping.ts`; não reimplemente a conta em outro lugar.
15. **O AJUSTE MANUAL DA QUANTIDADE SOBREVIVE À REGERAÇÃO** (16-D). `quantity_overridden` +
    `planRegeneration`. Item digitado à mão nunca é tocado por regeração, e o que o
    planejamento não pede mais vira **obsoleto para confirmar**, nunca exclusão silenciosa.
16. **O DESCONTO DA DESPENSA É OPT-IN E MOSTRADO ANTES** (16-D). Cobertura total **não zera** a
    quantidade — o item vira `removido` ("não vou comprar") e volta com um toque. Na despensa,
    `quantity` nula é "não sei quanto" (não desconta) e zero é "acabou": coisas diferentes.
17. **A DESPENSA NÃO É ERP DE ESTOQUE** (16-D). Seis campos, sem movimentação/entrada/saída, e
    marcar um item como comprado **não** dá baixa nela.
18. **A LISTA NÃO TEM LINK PÚBLICO** (16-D) — ela conta o que a pessoa come e quanto gasta.
    Exportar e imprimir sim; publicar, nunca.
19. **MEDIDAS CORPORAIS SÃO `body_*`, MÓDULO CENTRAL** (16-E). Criadas pela 16-E, consumidas
    por Dieta **e** Treinos por `src/lib/body/`. **Nunca** `nutrition_measurement_*` nem
    `training_measurement_*`, e nunca duas tabelas de peso corporal.
    `nutrition_profiles.weight_kg` (16-A) é outra coisa: o peso do PERFIL, insumo do estimador.
20. **DIA SEM REGISTRO NÃO É ZERO** (16-E). É a regra 1 do módulo aplicada ao TEMPO: série,
    calendário e relatório devolvem `null`, o gráfico **interrompe** a linha
    (`connectNulls={false}`) e a UI escreve "sem registro". Um dia com meta e **sem registro**
    não entra na aderência média — "esqueci de anotar" não é "falhei na meta".
21. **MÉDIA MÓVEL SÓ COM A JANELA CHEIA** (16-E). Sem dados suficientes a UI **omite** a linha
    e explica, em vez de suavizar dois pontos e chamar de tendência.
22. **AS FOTOS DE EVOLUÇÃO SÃO O DADO MAIS SENSÍVEL DO SISTEMA** (16-E). Bucket privado, nome
    aleatório, pasta `{user_id}/…`, **URL assinada de 5 min gerada a cada leitura**, tipo e
    tamanho validados **no servidor** sobre o arquivo real, e FK composta
    `(attachment_id, user_id)` impedindo reivindicar anexo alheio. `storage_path` **não sai do
    servidor**. Nunca URL pública, nunca link compartilhável.
23. **SEM PRESCRIÇÃO TAMBÉM NAS MEDIDAS** (16-E). Sem "peso ideal", sem IMC classificatório,
    sem alvo sugerido: a direção da meta é escolha do usuário. Consumo e corpo aparecem lado a
    lado, **sem afirmar causalidade**.
24. **RELATÓRIO DE PERÍODO PASSADO SAI DO SNAPSHOT, COM A META DA ÉPOCA** (16-E). `reports.ts`
    entra por `dayTotals` e resolve `goalPeriodForDate` **dia a dia**. Editar um alimento ou a
    meta hoje não pode mexer no relatório do mês passado.

## ⚠️ Armadilha do banco que passou por build, tsc e lint (não repita)

Os índices únicos que sustentam a idempotência da 16-B são **parciais**:

```sql
… on nutrition_diary_entries (user_id, diary_meal_id, planned_item_id)
  where planned_item_id is not null;
… on nutrition_planned_meals (plan_day_id, planned_date, meal_type_id)
  where plan_day_id is not null and planned_date is not null;
```

A 16-D acrescentou mais dois, pelo mesmo motivo:

```sql
… on nutrition_shopping_lists (user_id, recurrence_key) where recurrence_key is not null;
… on nutrition_shopping_list_items (list_id, consolidation_key)
  where consolidation_key is not null;
```

O Postgres **não infere índice parcial num `ON CONFLICT`** sem repetir o predicado, e o
PostgREST não permite repetir — o `upsert` falha **só em runtime** (`42P10`). Use
*select-then-insert/update* nesses casos. O mesmo vale para índices de **expressão**
(`coalesce(...)`), como o de escopo de `nutrition_goal_items`. E no PostgREST,
`.eq(coluna, null)` **não** casa com NULL: use `.is(coluna, null)`.

## 📋 Pendências da Fase 16 — TODAS as de 16-F foram fechadas

| Item | Situação |
| --- | --- |
| ~~Leitura de código de barras pela câmera~~ | ✅ **fechada na 16-F** (`barcode-scanner-dialog.tsx`, `BarcodeDetector` nativa) |
| ~~Cards no dashboard geral~~ | ✅ **fechada na 16-F** (`nutrition-card.tsx`) |
| ~~Busca global e lançamento rápido~~ | ✅ **fechada na 16-F** (5 tipos de busca + 4 de lançamento) |
| ~~Notificações (refeição, planejamento, compras, despensa, medida)~~ | ✅ **fechada na 16-F** (8 famílias) |
| ~~**Upload** da foto de receita pela interface~~ | ✅ **fechada na 16-F** (copiando `uploadProgressPhoto`) |
| ~~`reorderRecipeIngredients` sem gatilho (arrastar ingrediente)~~ | ✅ **fechada na 16-F** (arrasto + setas ↑↓) |
| ~~Gerenciar corredores de mercado pela interface~~ | ✅ **fechada na 16-F** |
| ~~Gerenciar tipos de medida pela interface~~ | ✅ **fechada na 16-F** |
| ~~Escolher a quantidade de cada receita ao gerar a lista~~ | ✅ **fechada na 16-F** (campo de porções) |
| ~~XLSX nos relatórios~~ | ✅ **fechada na 16-F** (uma aba por seção, import dinâmico) |
| ~~Exportação do catálogo em CSV~~ · ~~visão de mês~~ · ~~micronutrientes~~ · ~~substituições~~ · ~~gasto com mercado~~ | ✅ fechadas na 16-E |
| ~~Montar os dias de um modelo~~ · ~~escopo na edição de refeição planejada~~ | ✅ fechadas na 16-C |

### Pendências que permanecem (escopo consciente, não bugs)

| Item | Por quê |
| --- | --- |
| Medidas caseiras oficiais em massa | A TACO não publica. Entra por segunda fonte, pelo mesmo pipeline — nada foi inventado |
| Base externa de código de barras (consultar produto pelo EAN) | **Decisão de produto**: dado nutricional de fonte não verificada não entra. O scanner identifica o código; os valores continuam sendo do usuário ou da base |
| Canais externos de notificação (push/e-mail) | Fora do escopo do sistema inteiro; só com infraestrutura real de envio |
| Integração com balança | Não planejado (`body_measurements.source` já prevê o campo) |
| Prescrição/diagnóstico nutricional; comparação com outros usuários | **Nunca** — decisão de produto |
| `src/lib/nutrition/calendar.ts` é consumido por `src/lib/body/` — se o acoplamento incomodar, **promova** a util central, nunca copie | Quando incomodar |

## 🔁 Como aplicar migrations neste projeto

Padrão: **Supabase MCP `apply_migration`** no projeto `yjvnlbjvippefvzgrxxw`, com o arquivo
versionado em `supabase/migrations/` (idempotente, timestamp `YYYYMMDDHHMMSS`).

⚠️ O `apply_migration` grava no ledger a **hora em que rodou**, não o timestamp do nome do
arquivo — então `supabase migration list` mostra versões diferentes dos nomes locais em todo o
histórico do projeto. É esperado e não é drift; o que importa é o **nome** bater com o arquivo.

Para cargas grandes de dados (como o seed da TACO, 488 KB), o conteúdo não cabe
confortavelmente numa chamada MCP. Nesse caso os arquivos foram aplicados **direto do disco**
pela Management API, usando o token da CLI do Supabase já autenticada nesta máquina:

```bash
RAW="$(security find-generic-password -s "Supabase CLI" -w)"      # macOS keychain
TOKEN="$(printf '%s' "${RAW#go-keyring-base64:}" | base64 -d)"    # go-keyring
curl -X POST "https://api.supabase.com/v1/projects/yjvnlbjvippefvzgrxxw/database/query" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  --data "$(jq -Rs '{query: .}' < supabase/migrations/ARQUIVO.sql)"
```

Registre o arquivo em `supabase_migrations.schema_migrations` depois, para o ledger bater com
o repositório. **Nunca imprima o token.**

Depois de qualquer migration: rode `get_advisors` e **regenere `src/types/supabase.ts`**
(MCP `generate_typescript_types`).

⚠️ **O critério NÃO é "saída vazia".** A redação anterior — "`get_advisors` com 0 lints de
schema" — se lê como se a ferramenta devesse devolver nada, e ela nunca devolve: em
2026-08-07 há **1 lint de segurança**, `auth_leaked_password_protection`, que é um **botão do
painel de Auth** (proteção contra senha vazada, checagem no HaveIBeenPwned) e **não tem
migration que o resolva**. Um critério inatingível é pior que nenhum, porque ensina a ignorar
a saída inteira. O critério real é: **nenhum lint NOVO cujo alvo seja uma tabela ou função sua**
— RLS faltando, `search_path` mutável, policy permissiva demais. Compare com a execução
anterior em vez de esperar zero.

## ⛔ Invariantes gerais do projeto (bloqueantes)

- **RLS + FORCE RLS em TODAS as tabelas** (conte no banco antes de citar um número: as duas
  frentes criam tabelas em paralelo). Teste pelo client SDK autenticado ou trocando de role no
  SQL — o SQL editor como `postgres` ignora RLS e o teste passaria sem provar nada.
- **Zod no servidor** em toda Server Action; `user_id` sempre de `auth.getUser()`.
- **Nenhum `service_role` no client** — só `src/lib/supabase/service.ts` e o Cron.
- **pt-BR / BRL**, datas BR, **dark/light** e responsividade reais em tudo.
- **React Compiler ativo:** use `useWatch`/`Controller`, nunca `form.watch()` nem `setState`
  em `useEffect` (ajuste de estado durante o render é o padrão adotado).
- **Campo de TEXTO nunca é controlado pelo valor da URL.** Filtro na URL vale para clique, não
  para digitação: as páginas são `force-dynamic`, então gravar a cada tecla faz o campo esperar
  o servidor e digitar rápido perde caractere. Use `useUrlText` (correção de 2026-08-04, 5 telas).

## ✅ Verificação obrigatória antes de fechar qualquer mudança

```bash
npm run lint && npx tsc --noEmit && npm run test:run && npm run build
```

Os testes existentes devem continuar passando (**1.846** com a Fase 16 inteira e a 17-E integradas; as duas frentes
acrescentam testes em paralelo, então **rode antes de citar um número**) — e acrescente testes
para toda lógica pura nova.
A suíte precisa passar em qualquer fuso — confira com `TZ=UTC npx vitest run`.
Smoke test: rotas privadas → 307 `/login`; `/api/cron/*` → 401 sem segredo.

## 🗺️ Mapa rápido do que existe (reaproveitar, não reescrever)

- **Dieta:** `src/lib/nutrition/*` (puro + queries; destaque para `snapshot.ts`, `calc.ts`,
  `goals.ts`, `diary.ts`, `plan-recurrence.ts`, `calendar.ts`, **`shopping.ts`**),
  `src/lib/actions/nutrition-{foods,diary,goals,plans,shopping}.ts`,
  `src/components/nutrition/*`, `src/app/(app)/nutricao/*`, `scripts/nutrition/*`,
  `data/nutrition/taco-4/*`.
- **Treinos:** `src/lib/training/*` (puro + queries; destaque para `tracking.ts`, `workout.ts`,
  `schedule.ts`, `session-machine.ts`, `session-flow.ts`, `timers.ts`, `previous.ts`,
  `plates.ts`, `session-snapshot.ts`), `src/lib/actions/training-*.ts`,
  `src/components/training/*` (+ `session/`), `src/app/(app)/treinos/*`.
- **Medidas corporais (CENTRAL, 16-E):** `src/lib/body/*` (`constants.ts`, `types.ts`,
  `measurements.ts` puro, `queries.ts`), `src/lib/actions/body-measurements.ts`,
  `src/lib/validators/body.ts`, `src/components/body/*`. **Consumido por Dieta e Treinos.**
- **TO-DO:** `src/lib/todo/*` — referência de recorrência pura em `Date.UTC`.
- **Financeiro/relatórios:** `src/lib/finance/*`, `src/lib/reports/*`.
- **Preferências:** store `settings` (uma linha/usuário) — **estenda com chaves novas**,
  nunca recrie.
- **Anexos genéricos:** tabela `attachments` + bucket privado `attachments`
  (`{user_id}/…`) — é o que a foto de receita (16-C) e a de evolução (16-E) devem usar.
- **Notificações:** `src/lib/notifications/*` com `dedupe_key` + Cron da Vercel.
- **Campo de busca que alimenta a URL:** `useUrlText` (`src/lib/forms/use-url-text.ts`), com as
  decisões puras em `url-text-sync.ts`. **Já está nas 5 telas que tinham o problema** — use ao
  criar qualquer busca nova, não reescreva o debounce.
- **Escolher UM exercício digitando:** `src/components/training/exercise-search-picker.tsx`
  (reusa `matchesSearch` da 17-A). Um `Select` cru com o catálogo inteiro dentro não serve.

## 🧩 Os dois módulos de tarefas continuam coexistindo (proposital)

| Módulo | Rota | Papel |
| --- | --- | --- |
| **TO-DO** (Fase 15) | `/todo` | Gerenciador principal de execução |
| Tarefas & Rotinas (Fase 09) | `/tarefas`, `/rotinas` | Legado + rotinas com check-in diário |

**Não remova `/tarefas`** sem antes migrar os quatro pontos que dependem de `tasks`:
`calendar_events.task_id`, `src/lib/notifications/generate.ts`, `src/lib/search/queries.ts` e
`src/lib/dashboard/queries.ts`.

## 🔧 Pendências gerais do projeto (anteriores à Fase 16)

- Ligar upload de anexos (`attachments`) em telas além de tarefas.
- Propagar a preferência `date_format` a mais telas.
- Canais externos de notificação (push/e-mail) — fora do escopo atual.
- Produção: definir `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `GOOGLE_CLIENT_ID/SECRET`.
  Sem eles os recursos degradam com elegância.
