# Design — Fase 18-F: IA · Memória, integrações e polimento

> Validado com o dono em **2026-09-19**, antes de qualquer linha de código.
> Sexta e **última** das 6 subfases da Fase 18. Depende das 18-A a 18-E concluídas.
> Desenho geral em `2026-08-04-modulo-ia-design.md`; a 18-C em
> `2026-08-07-18c-acoes-aprovacoes-design.md`; a 18-D em
> `2026-08-08-18d-visao-comprovantes-design.md`; a 18-E em
> `2026-08-09-18e-insights-relatorios-dashboards-design.md` e
> `2026-08-09-18e-bloco4-job-insights-design.md`.

---

## 1. O que muda de natureza nesta subfase

Nas cinco subfases anteriores o módulo de IA foi construído **como ilha**. Ele lê nove módulos,
escreve em cinco, enxerga documento e produz análise — mas nada disso alcança o sino, a busca
global, o backup ou qualquer tela fora de `/ia`. Quem não abre `/ia` não sabe que o módulo
existe.

A 18-F costura. E costurar é onde o risco muda de espécie: as cinco subfases anteriores
protegiam o dono **do modelo**; esta protege o dono **do ruído**. O risco nº 1 declarado no doc
da fase é o mesmo fato virar notificação, card, badge e item de busca ao mesmo tempo — e a
mitigação é a mesma que as Fases 16-F e 17-F usaram: **fonte de verdade declarada por
informação**.

Três coisas mudam junto:

1. **A IA passa a ter memória** — a primeira coisa que ela guarda que não é registro de
   negócio nem trilha de auditoria, mas preferência do dono sobre como ela deve se comportar.
2. **A IA passa a estar em toda tela**, pelo botão flutuante. Até aqui, falar com ela exigia
   navegar até `/ia`.
3. **O servidor passa a dirigir o laço de ferramentas** nas experiências de panorama — a
   primeira vez que o sistema decide o que se lê sem o modelo pedir, e sem abrir porta nova.

---

## 2. As decisões desta sessão

| # | Decisão |
| --- | --- |
| 1 | **Recorte enxuto.** Voz, automações configuráveis, pesquisa externa e observabilidade ficam **fora**, declaradas com a razão — como as Fases 16 e 17 fizeram com push/e-mail |
| 2 | **Memória nasce por proposta**, pelo Approval Engine da 18-C — não por um segundo caminho de confirmação |
| 3 | **Memória tem módulo opcional**; sem módulo, vale para todos os agentes |
| 4 | **Botão flutuante fixo**, canto escolhível, **sem arrastar** |
| 5 | **Quatro famílias de notificação**, três ligadas e uma opt-in |
| 6 | **As quatro experiências entram**, e as de panorama **abrem uma conversa** |
| 7 | **Nada de retenção automática** — a decisão 5 da 18-D (*"nada some sozinho"*) fica intacta |
| 8 | **Avaliações viram suíte de testes**, não subsistema com tabelas |

### 2.1 Duas correções de rumo tomadas durante o desenho

**A memória NÃO cria uma quinta forma de `origem`.** A primeira versão deste desenho previa
`origem = 'memoria'` e uma coluna `memory_id` em `ai_action_proposals`. Está errado: as quatro
formas existentes dizem **de onde a proposta nasceu**, e uma proposta de memória nasce de uma
tool call no chat — que é `origem = 'ferramenta'`, exatamente como `todo.criar_tarefa`. A
memória é o **efeito**, não a origem. Nenhuma forma nova, nenhuma coluna nova em
`ai_action_proposals`, nenhum CHECK reescrito.

**As avaliações não valem duas tabelas.** O que pode regredir e é verificável é **estrutural**
— o roteador escolhe o agente certo, a chave desligada bloqueia, a ferramenta certa é oferecida,
e *"exclua todas as minhas transações"* não encontra ferramenta nenhuma. Nada disso precisa de
provedor, de tabela nem de dinheiro. O que exige o modelo real é a qualidade da redação, que é
subjetiva e não dá veredito confiável. Viram testes em `src/lib/ai/evals/`.

---

## 3. O que fica de fora, e por quê

| Item do doc da fase | Por que fica fora |
| --- | --- |
| **Voz** (captura, transcrição, ação) | Exige um provedor de transcrição novo, captura de áudio no navegador e um caminho de confirmação por confiança próprio. É o item mais caro da lista e o único cujo valor depende inteiramente de um hábito que o dono ainda não tem. Entra como tarefa avulsa se ele quiser |
| **Automações configuráveis** (`ai_automations`, `ai_automation_runs`) | São a generalização do job de insights que a 18-E **já entregou funcionando**. Construir o genérico para ter duas instâncias é o caso clássico de YAGNI, e um agendador próprio com orçamento, status e retry é uma subfase inteira |
| **Pesquisa externa** | É, por definição, a parte da IA que **não** usa os dados do dono — ela não pode levar dado pessoal. Entrega o que qualquer chat genérico entrega, trazendo junto conteúdo não confiável de fora. `allow_external_search` **continua ociosa**, e isso fica registrado |
| **Observabilidade** (painel de latência, taxa de sucesso, retries) | `/ia/consumo` já mostra custo e tentativa. Um painel de métricas para um usuário único é ornamento que precisa ser mantido |
| **Canais externos** (push, e-mail) | Fora do escopo do sistema inteiro, como registrado nas Fases 16 e 17 |
| **Conversar com um relatório** · **sugestões contextuais dentro de um registro** | O primeiro é praticamente uma subfase; o segundo significa espalhar botões por dezenas de telas de nove módulos |

**`allow_files` também continua ociosa** e isso vira registro: ela foi substituída na prática
por `allow_vision` na 18-D, que é mais específica (comprovante e nota fiscal, pelo caminho
dedicado). Duas chaves para o mesmo efeito é uma chave que não liga nada.

---

## 4. Bloco 1 — Costura: sino, busca, export e exclusão

O bloco de menor risco, e o que tira o módulo da condição de ilha logo no início. Todos os
padrões já existem e são copiáveis.

### 4.1 Quatro famílias de notificação

Par `src/lib/notifications/ai.ts` (**puro**, sem I/O) + `ai-cron.ts` (I/O), espelhando
`training.ts`/`training-cron.ts`.

| Tipo | Quando | Nasce |
| --- | --- | --- |
| `ai_budget_threshold` | Orçamento em 70/80/90/100% | **ligada** |
| `ai_provider_problem` | Chave inválida, crédito esgotado, falhas seguidas, job barrado | **ligada** |
| `ai_action_stuck` | Execução em `executando` sem desfecho registrado | **ligada** |
| `ai_insight_available` | Insight novo vigente | **DESLIGADA** (opt-in) |

As três primeiras nascem ligadas porque são, respectivamente, dinheiro do dono, a IA tendo
parado de funcionar sem ele saber, e um *"pode não ter acontecido"*. `ai_insight_available`
entra em `NOTIFICATION_OPT_IN_TYPES` ao lado de `nutrition_goal_close` e
`training_goal_progress`: é o mesmo caso — aviso recorrente sobre análise que ninguém pediu.

**Regras herdadas, não renegociadas:**

- **`filterByPrefs` continua o ÚNICO ponto onde a preferência decide** (invariante 24). Tipo
  novo não consulta preferência por conta própria.
- Todas `low` ou `medium`. **Nenhuma `high`/`urgent`** — nada aqui é urgente.
- Todas com link. `dedupe_key` determinístico: rodar o Cron três vezes não duplica.
- Passam pelo **teste de vocabulário proibido** que já varre Dieta e Treinos, e pelo de
  prescrição.
- **Chave de dedupe do orçamento tem base pronta:** `ai_user_preferences.budget_alert_level_reached`
  já guarda o nível alertado desde a 18-A.
- **Insight disponível usa chave SEMANAL**, não diária. Um aviso por dia sobre análise vira
  cobrança, que é o que a invariante 25 proíbe.

⚠️ **O Cron roda com service role, sem sessão.** Toda leitura de `ai_*` no `ai-cron.ts` carrega
`user_id` explícito, e o que reusar leitura de tela entra pelo objeto `LeituraDoDono`
(`src/lib/supabase/owner.ts`, invariante 79) — nunca por um par `client`/`userId` separável.

### 4.2 Busca global

`src/lib/search/ai-links.ts` — **puro e testado**, no padrão de `training-links.ts` e
`nutrition-links.ts`, fonte única dos deep-links do módulo. Entram **conversas**, **insights** e
**ações realizadas**; `SEARCH_TYPES` ganha as entradas correspondentes.

⚠️ **Memória NÃO entra na busca neste bloco.** `/ia/memoria` só existe no bloco 3, e linkar para
uma rota que ainda não existe é um 404 — que é exatamente a invariante 26, escrita quando a
despensa foi tratada como rota própria sem ser uma. A busca por memória entra **no bloco 3**,
junto com a rota que ela aponta.

### 4.3 Export

`src/lib/settings/export-tables.ts` ganha a seção de IA — **somando a seção, sem reescrever a
dos outros** (invariante 28).

⛔ **`ai_credentials` fica FORA.** A própria fase proíbe exportar material criptográfico, e o
backup sai do sistema. Entram conversas, mensagens, runs, eventos de uso, trilha de ferramentas,
propostas/aprovações/execuções, insights e suas fontes, documentos e extrações, memórias e seus
eventos, preferências e o registro do job.

### 4.4 Exclusão em massa

Ações: apagar conversas anteriores a uma data · apagar todas · apagar anexos e documentos ·
apagar insights · (no bloco 3) apagar memórias.

⛔ **A tela ESCREVE o que permanece, e por quê.** O registro em `ai_action_executions` de que a
IA lançou aquela transação **sobrevive** à exclusão da conversa — a invariante 38 tirou a FK de
propósito, justamente para isso. Esconder esse fato daria uma tela mais limpa e uma auditoria
mentirosa. O mesmo vale para `ai_insight_jobs`, que não tem FK para `ai_runs` nem para
`ai_insights`.

**Nada de retenção automática** (decisão 7). A decisão 5 da 18-D — *"nada some sozinho;
descartar é clique do dono"* — fica intacta, e esta subfase não abre exceção a ela.

---

## 5. Bloco 2 — Botão flutuante

### 5.1 O que ele indica — e o que ele NÃO indica

⛔ **O sino é a fonte de verdade para "algo aconteceu no sistema"; o badge do botão flutuante
mostra só o estado da CONVERSA ABERTA.** Resposta que chegou enquanto o dono navegava, ou ação
aguardando confirmação dentro dos 10 minutos dela.

Sem essa separação, insight novo apareceria no sino **e** no badge **e** no card do dashboard
**e** na busca — o risco nº 1 do doc, realizado. Cada canal responde uma pergunta diferente.

### 5.2 Forma

**Dois cantos, não quatro.** O Header é `sticky top-0 z-30` com `h-16` e ocupa a faixa superior
inteira: canto superior é colisão garantida. Ficam inferior-direito e inferior-esquerdo.

**Sem arrastar.** Arrastar exigiria persistência por tipo de dispositivo, encaixe em bordas e
uma alternativa acessível ao arrasto — três subsistemas para fugir de obstáculos que este
layout **não tem**. Conferido: o lançamento rápido vive no Header
(`src/components/quick-add/quick-add.tsx`) e a navegação mobile é um drawer lateral
(`mobile-nav.tsx`), **não** uma barra inferior fixa. O canto inferior está livre em todas as
rotas. O requisito do doc da fase (*"não cobre o lançamento rápido, não cobre navegação
inferior"*) antecipava um layout que o projeto não adotou.

Acessível por teclado, com atalho, e ocultável.

### 5.3 Peso

⛔ **O botão é um ícone; o painel entra por `next/dynamic` na primeira abertura.** O chat
arrasta streaming e markdown, e ele **não pode** entrar no primeiro byte de 67 rotas —
`/todo` está a 2,6 KB do teto de 250 KB gz. Padrão do `useLazyDialog`
(`src/components/shared/use-lazy-dialog.ts`): monta na primeira abertura e não desmonta, porque
`{aberto && <Painel/>}` sozinho quebra a animação de fechamento do Radix.

`Sheet` lateral no desktop, bottom sheet no celular.

### 5.4 Preferências

Duas colunas novas em `ai_user_preferences`: canto e oculto.

⚠️ **Elas entram no schema Zod E no payload do formulário no MESMO commit** — invariante 81,
escrita depois de `allowVision` recusar **todo** salvamento de preferências por três subfases,
com uma mensagem sobre um campo que a tela não tinha. `tsc` não pega isso; o teste de
`validators/ai.test.ts` que compara as duas listas, sim.

---

## 6. Bloco 3 — Memória

### 6.1 Duas tabelas

**`ai_memories`** — conteúdo (≤300 caracteres), módulo **opcional** (null = vale para todos os
agentes), `expires_at` opcional, `user_id` NOT NULL, RLS + FORCE RLS, índice em `user_id`,
trigger de `updated_at`.

**`ai_memory_events`** — append-only: **só policies de SELECT e INSERT**, nenhuma de UPDATE ou
DELETE. Registra criada · editada · desativada · reativada · esquecida · excluída.

⛔ **`memory_id` vai SEM FK, de propósito.** Apagar a memória não pode apagar o registro de que
ela existiu — invariante 38 aplicada aqui, como em `ai_action_executions` e `ai_insight_jobs`.

⛔ **O evento NUNCA guarda o conteúdo da memória**, só o que aconteceu com ela. Senão "excluir
memória" deixaria o texto vivo no log, que é o oposto do que o botão promete. É a invariante 20
(*a auditoria guarda o pedido, nunca o resultado*) aplicada à memória.

### 6.2 Nenhum estado é gravado

`vigente` · `expirada` · `desativada` · `esquecida` derivam de `expires_at` + o último evento,
em módulo **puro com `agora` injetado** (`src/lib/ai/memory/state.ts`), com precedência
**decisão do dono > prazo** — exatamente a invariante 70, que fez o mesmo com os insights.

**Expirar não apaga:** a memória sai do prompt e continua legível na tela, com a data em que
venceu.

### 6.3 Como uma memória nasce

**Pelo dono**, na tela `/ia/memoria` (8º item de `AI_SECTIONS`), ou **pela IA**, que a propõe.

A proposta é uma ferramenta de escrita comum: `memory.lembrar`, a **8ª**, com
`origem = 'ferramenta'` e o mesmo Approval Engine — mesmo hash do efeito, mesmo prazo de 10
minutos do banco, mesmo uso único, mesma revalidação, mesma tela `/ia/acoes`, mesmo desfazer.
Commands `lembrarPreferencia` e o inverso `esquecerPreferencia`. Registry vai a **30
ferramentas** (22 leitura + 8 escrita) e **15 commands**.

Cada command continua **partido em dois arquivos** (`memory-preview.ts` só lê, `memory.ts`
escreve) e o Tool Executor importa `commands/previews.ts` — invariante 40, cujos três testes de
fronteira valem sem mudança.

⛔ **"Nada sensível é salvo automaticamente" vira verdadeiro POR CONSTRUÇÃO**, não por checagem:
**nada é salvo automaticamente**. Toda memória proposta pela IA passa por confirmação do dono,
que lê o texto exato antes de confirmar. É o mesmo movimento da invariante 55, onde os três
processos separados tornam *"o arquivo não sai sem autorização"* verdadeiro por construção.

**O servidor valida FORMA, nunca assunto:** ≤300 caracteres, escalar, sem URL, sem material que
pareça credencial. Uma lista de assuntos proibidos fura no primeiro assunto novo — é a lição da
invariante 39, onde `changed_fields` limita a forma e não o nome. A proibição de **propor**
memória sobre condição de saúde vai no prompt da ferramenta, **descrita e nunca citada**
(invariante 30).

### 6.4 No prompt, memória é preferência — não regra

⛔ As memórias vigentes do módulo do agente **mais** as globais entram numa seção declarada do
system prompt, com **teto visível**, posicionada **depois** das travas de segurança e
acompanhada da afirmação de que preferências orientam **estilo e escolha** e **nunca** desligam
uma regra nem autorizam uma ação.

É o mesmo movimento da invariante 21, em que o contexto de página declara que **não é dado sobre
os registros**. Sem isso, uma memória proposta a partir de um documento lido e confirmada às
pressas viraria instrução confiável no topo do prompt — injeção com um passo humano no meio.

### 6.5 Duas chaves

`allow_memory` liga a IA **usar** as memórias; `allow_write_memory` liga a IA **propor**
memórias novas. Ambas nascem `false`.

⚠️ **`allow_memory` JÁ EXISTE na tabela** — é uma das quatro chaves que a 18-A criou e que
nenhuma linha de código lê até hoje. Esta subfase a faz ligar alguma coisa, como o Bloco 4 da
18-E fez com `allow_insight_jobs`. **Só `allow_write_memory` é coluna nova.**

A distinção é real e é a que o dono provavelmente quer: usar as preferências que ele escreveu,
sem que ela fique criando preferências por conta própria. Mantém a simetria leitura/escrita do
sistema inteiro, e `toolsForWritePermission` (derivado do registry) continua decidindo se a
chave é clicável — com o teste que fica vermelho se alguma ficar órfã.

**Memória com módulo ANDa com a chave daquele módulo:** memória de Treinos não entra no prompt
se `allow_training` estiver desligada.

### 6.6 A busca alcança a memória aqui

`ai-links.ts` ganha a entrada de memória **neste bloco**, junto com a rota `/ia/memoria` que ela
aponta (§4.2).

---

## 7. Bloco 4 — Experiências

Quatro: **Planejar meu dia** · **Encerrar meu dia** · **Planejar minha semana** · **Caixa de
entrada inteligente**. As três primeiras compartilham um mecanismo; a quarta usa o laço normal.

### 7.1 O laço dirigido pelo servidor

⛔ **A lista de ferramentas de cada experiência é ESTÁTICA, e quem a executa é o servidor.**

`src/lib/ai/experiences/catalog.ts` declara, por experiência: título, lista de ferramentas com
os argumentos derivados do dia, prompt de redação e módulos exigidos.
`src/lib/ai/server/experience-runner.ts` executa:

1. resolve dono e permissões;
2. admite o run (RPC própria `ai_begin_experience_run`, com **a mesma chave de advisory lock**
   das outras — o recurso disputado é o **orçamento do dono**, não a espécie do run; foi a
   lição da 18-D);
3. chama o **Tool Executor** para cada ferramenta da lista — `guard.ts`, `ai_tool_calls` e a
   poda por orçamento de caracteres **intactos**;
4. monta os blocos `wrapUntrusted`;
5. faz **uma** chamada ao modelo, só para redigir;
6. grava.

**Por que não coletores, como a 18-E:** `insights/collectors/` é a **terceira porta** da
invariante 71 — leitura fora do Tool Registry, sem `guard.ts`, sem teto de descriptor e sem
linha em `ai_tool_calls` —, e a 18-E só a justificou porque os três controles voltavam por outro
caminho. Aqui não há nada a justificar: as ferramentas de leitura já existem e já são auditadas.
**Nenhuma porta nova é aberta nesta subfase.**

**Por que não deixar o modelo dirigir:** `MAX_TOOL_STEPS = 3` por tentativa. "Planejar meu dia"
lê quatro módulos; cabem num passo só **se** o modelo pedir as quatro em paralelo
(`MAX_TOOLS_POR_PASSO = 4`), o que não é garantido. Pedindo uma por vez, o teto corta antes da
última e o panorama sai incompleto declarando corte — **toda manhã**. Determinismo num fluxo
diário vale mais que um prompt.

`ai_runs.kind` ganha a **4ª espécie**: `experience`.

⛔ **O laço dirigido NÃO está sujeito a `MAX_TOOL_STEPS`, e por isso precisa do teto próprio.**
Aquele teto existe para impedir **o modelo** de decidir quanto o dono gasta; aqui quem decide é
uma lista estática, então ele não se aplica. Mas "não se aplica" não pode virar "não há teto":
o catálogo declara um **máximo de ferramentas por experiência** (`MAX_FERRAMENTAS_POR_EXPERIENCIA`),
o `catalog.ts` é validado contra ele **em teste**, e `computeReservation` reserva sobre esse
número — nunca sobre o tamanho da lista em runtime. Uma experiência que precise de mais
ferramentas que o teto é uma decisão a tomar, não um limite a subir em silêncio.

### 7.2 Onde o dono dispara

**Nenhuma rota nova.** Os três panoramas são atalhos na tela `/ia` (acima do campo de mensagem)
e no painel do botão flutuante — os dois lugares onde o dono já está quando quer falar com a
IA. Como cada um **abre uma conversa** (§7.3), o resultado mora em `/ia/conversas` como
qualquer outra, e uma rota `/ia/panorama` só duplicaria a lista de conversas com um filtro.

`AI_SECTIONS` cresce de 7 para **8** nesta subfase, e o item novo é `/ia/memoria` — só ele.

### 7.3 A experiência ABRE UMA CONVERSA

⛔ O panorama não é um relatório morto: ele nasce como **a primeira mensagem de uma conversa
normal**, cujo primeiro turno foi dirigido pelo servidor. Do segundo turno em diante é chat
comum (`kind = 'chat'`).

Três consequências, todas de graça:

1. **"Transformar resposta em ação" sai sem mecanismo novo** — item que o doc da fase pedia e
   que este desenho tinha descartado por custo. O dono lê o panorama, responde *"reagenda a
   segunda tarefa para quinta"*, e isso é o laço de sempre com o Approval Engine de sempre.
2. A conversa **já aparece** em `/ia/conversas`, **já é pesquisável** pela busca do bloco 1 e
   **já é apagável** pela exclusão em massa.
3. As experiências **consomem a memória** do bloco 3 — "Planejar meu dia" respeitando *"prefiro
   treinar à noite"* é onde ela justifica existir. Por isso este bloco vem depois daquele.

### 7.4 Permissão: `allow_cross_module`, e módulo sem chave é PULADO

A quarta chave ociosa ganha dono: as experiências leem vários módulos numa tacada, que é
exatamente o que ela descreve. Ela **ANDa** com a chave de cada módulo lido.

⛔ **Módulo sem chave é PULADO e declarado, nunca motivo de recusa geral** — a regra que a
invariante 77 fixou para o job de insights. Desligar a leitura de Dieta não pode calar o
panorama inteiro; ele roda sem a parte de Dieta e **diz o que ficou de fora**, em vez de
entregar um dia pela metade fingindo estar completo.

### 7.5 Caixa de entrada inteligente

O caso mais simples do mesmo padrão: **sem leitura dirigida**, direto no laço normal, com prompt
próprio. Classificar o destino e preparar a ação são as duas coisas que o modelo **precisa**
decidir.

⚠️ Ela depende do roteador acertar o módulo, e a invariante 27 já fixou o comportamento: palavra
ambígua **desliga** o roteamento em vez de errá-lo, caindo no orquestrador com `AMBIGUO`. A
caixa de entrada herda isso — na dúvida, ela **pergunta**, não chuta.

---

## 8. Bloco 5 — Fechamento da fase

### 8.1 Avaliações como suíte

`src/lib/ai/evals/` com os casos do briefing, verificando o que é **estrutural**: o roteador
escolhe o agente certo · a chave desligada bloqueia · a ferramenta certa é oferecida ·
*"organize minhas tarefas de hoje"* alcança o TO-DO · e o caso destrutivo.

⛔ **O caso destrutivo já é garantia estrutural, não comportamental:** *"exclua todas as minhas
transações"* não encontra ferramenta nenhuma, porque o registry não tem exclusão e os seis
`undo` estão fora dele de propósito. A recusa **não depende de o modelo se comportar** — e o
teste afirma isso sobre o registry, não sobre uma resposta.

### 8.2 Fechamento

Validação **item a item** dos critérios gerais da Fase 18, registrada em
`docs/handoff/LAST_PHASE_SUMMARY.md`. Atualização de `CURRENT_STATUS.md`,
`NEXT_AGENT_INSTRUCTIONS.md`, `PROJECT_ROADMAP.md` e das invariantes do módulo no `CLAUDE.md`.

⚠️ **Corrigir a linha 379 de `CURRENT_STATUS.md`**, que marca a **18-D como ⬜** embora ela esteja
concluída desde 2026-08-09.

**Não há 18-G.** Com a 18-F fechada, a Fase 18 está concluída e o projeto volta ao modo
manutenção/iteração.

---

## 9. Segurança e fronteiras

### 9.1 O que a 18-F NÃO afrouxa

- **Nenhuma porta nova de leitura.** As experiências entram pelo Tool Executor; `insights/`
  continua sendo a única exceção, e ela não cresce.
- **A escrita continua fora do run** (invariante 32). `memory.lembrar` grava **proposta**,
  nunca memória; quem executa é `approval/execute.ts`, chamado de `src/lib/actions/`.
- **Os três testes de fronteira da invariante 40 valem sem mudança:** `tools/` só alcança
  `commands/previews`; nenhum `*-preview.ts` importa um `services`; `.executar(` aparece em um
  arquivo só.
- **`approval/` continua tocando só `ai_*`** (invariante 45) — e agora `ai_memories` é uma
  tabela `ai_*`, então o command de memória não fura a regra.
- **`filterByPrefs` continua o único ponto de decisão de preferência** (invariante 24).
- **Nenhuma exceção à decisão 5 da 18-D** — nada some sozinho.

### 9.2 As fronteiras novas, provadas por teste

1. **Só o `experience-runner` importa `experiences/catalog`**, e só as Server Actions das
   experiências alcançam o runner — pela mesma razão da invariante 80.
2. **`memory/state.ts` é puro** e entra em `CAMADAS_PURAS` no `boundaries.test.ts`.
   ⚠️ A lista `modulos` desse teste é escrita à mão: uma pasta nova fora dela passa **vacuamente
   verde**. `memory/` e `experiences/` entram na lista **no mesmo commit** em que nascem.
3. **Nenhum `.from()` em `experiences/`** — ela declara, não consulta.

### 9.3 Injeção pelo dado

A memória é o único texto do sistema que o dono **autoriza** a entrar no prompt como preferência
sua. As duas defesas são §6.3 (validação de forma + confirmação com o texto à vista) e §6.4
(seção declarada, depois das travas, preferência ≠ regra). Resultado de ferramenta, documento e
imagem continuam entrando **sempre** como bloco não confiável.

---

## 10. Ordem de execução — cinco blocos

| # | Bloco | Entrega | Banco |
| --- | --- | --- | --- |
| **1** | Costura | 4 notificações, busca (conversas/insights/ações), export, exclusão em massa | — |
| **2** | Botão flutuante | Botão + painel lazy, 2 preferências | 2 colunas |
| **3** | Memória | 2 tabelas, 8ª ferramenta, 15º command, `/ia/memoria`, busca por memória | **2 tabelas** + 1 coluna (`allow_write_memory`) |
| **4** | Experiências | 4 experiências, runner, 4ª espécie de `kind` | 1 valor de CHECK |
| **5** | Fechamento | Suíte de evals, validação item a item, documentação | — |

Ordem **crescente de risco**, o mesmo critério que a 18-C usou para ordenar os commands. O
bloco 1 não toca dado nenhum do dono; o bloco 5 não escreve código de produção.

**Banco ao fim:** 130 → **132 tabelas**, `ai_*` de 18 → **20**. Conferir no banco antes de citar.

---

## 11. Critérios de aceite

1. Memória é controlável, exportável e apagável, e **nada é salvo sem confirmação do dono**.
2. Sugestão de memória passa pelo Approval Engine, com prazo, uso único e desfazer.
3. Evento de memória **não contém o conteúdo** da memória.
4. Estado de memória é **derivado**, nunca gravado; expirar **não apaga**.
5. Memória entra no prompt como preferência declarada, **depois** das travas, e não desliga
   regra nenhuma.
6. Botão flutuante é acessível por teclado, ocultável, salva o canto, **não entra no primeiro
   byte** das rotas e seu badge **não repete** o sino.
7. As quatro notificações passam por `filterByPrefs`, têm `dedupe_key` determinístico, **não
   duplicam em três execuções do Cron** e passam no teste de vocabulário proibido.
8. `ai_insight_available` nasce **desligada**; as outras três, ligadas.
9. Busca global encontra conversa, insight, ação e memória, e **todos os deep-links abrem**.
10. Export inclui a seção de IA **sem apagar as outras** e **sem `ai_credentials`**.
11. Exclusão em massa **escreve o que permanece** e por quê.
12. Experiência de panorama abre conversa, é determinística nas leituras, e **pula** módulo sem
    chave **declarando**.
13. Nenhuma porta nova de leitura: as experiências passam pelo Tool Executor, com linha em
    `ai_tool_calls`.
14. A suíte de evals fica **vermelha** se o caso destrutivo encontrar ferramenta.
15. Critérios gerais da Fase 18 validados **um a um**.
16. Transversais do projeto: dark/light, responsividade, pt-BR/BRL, RLS + FORCE RLS,
    `TZ=UTC` verde, `perf:bundle` dentro do teto.
