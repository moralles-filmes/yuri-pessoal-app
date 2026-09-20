# CURRENT_STATUS — Estado atual do projeto

> Atualizado ao final de **cada** fase. Última atualização: **2026-09-20**
> (18-F Bloco 5 · fechamento da FASE 18; antes: 18-F Bloco 4 · experiências, 18-F Bloco 3 ·
> memória, 18-F Bloco 2 · botão flutuante, 18-F Bloco 1 + auditoria de performance + iteração:
> transferência na importação de extrato).

## ✅ 18-F · Bloco 5 — o fechamento da Fase 18 (2026-09-20)

Plano em `docs/superpowers/plans/2026-09-22-18f-bloco5-fechamento.md` (§8 da spec).
Branch `feat/18-f-memoria-integracoes`. **Nenhuma migration, nenhuma tabela, nenhuma coluna,
nenhuma rota, nenhum endpoint, nenhuma ferramenta e nenhum command.** O banco foi tocado **só
para ler**. Suíte em **3.738 testes / 185 arquivos** (eram 3.701 / 183). Registry (**30**
ferramentas — 22 leitura + 8 escrita), commands (**15**, dos quais **7** são inversos sem
ferramenta) e agentes (**9**) inalterados.

**Com este bloco a Fase 18 está CONCLUÍDA. Não há 18-G**, e o projeto volta ao modo
manutenção/iteração.

> ⚠️ **Divergência de data, registrada e não corrigida:** as seções do Bloco 4 abaixo estão
> datadas **2026-09-22**, mas os commits dele são todos de **2026-09-20**
> (`git log --date=short`). As datas do Bloco 5 seguem os **commits**. Não reescrevi as do
> Bloco 4 porque são texto de outra entrega — mas quem for citá-las deve conferir no `git log`,
> não no cabeçalho.

### A suíte de evals — e o defeito que ela encontrou antes de ficar verde

`src/lib/ai/evals/` traz os **oito casos do briefing** como dado (`casos.ts`) e afirma sobre
eles o que é **estrutural**: o roteador escolhe o agente certo · a chave desligada bloqueia (e o
teste liga **todas as outras** ao desligar uma, o que é mais forte que `{}`) · a ferramenta certa
é oferecida · e ela **não** é oferecida com a chave desligada.

⛔ **Nenhum teste chama provedor.** O doc da fase pedia `ai_eval_cases`/`ai_eval_runs` — duas
tabelas, uma tela e um custo por execução. O desenho recusou: o que pode regredir nestes casos é
estrutural, e uma suíte que às vezes fica vermelha sem defeito é uma suíte que se aprende a
ignorar.

⚠️ **A suíte pagou por si na primeira execução.** Uma das oito frases canônicas — *"Como estão
minhas proteínas nesta semana?"* — **não alcançava a Dieta**: o vocabulário de `nutrition`
listava `"proteina"` e `"carboidrato"` no singular, e o casamento é por **fronteira de palavra,
sem stemming** (de propósito — stemming faria palavras não relacionadas colidirem, e palavra
ambígua **desliga** o roteamento em vez de errá-lo, invariante 27). A correção foram **duas
palavras** em `agents/routing.ts`, num commit separado do teste — e a separação é o que prova que
ela era necessária. **É a única mudança de código de produção do bloco.**

### O caso destrutivo é ausência de código, não recusa

*"Exclua todas as minhas transações"* **chega** ao Financeiro — e o que protege o dono não é o
roteamento nem um prompt: é não existir ferramenta que apague. `evals/destrutivo.test.ts` afirma
isso **sobre o registry**, derivando as **duas** listas — {commands que as ferramentas apontam}
∩ {inversos que os commands declaram} — em vez de uma lista de nomes proibidos escrita à mão,
que furaria no primeiro command novo. Medido: 30 ferramentas, 15 commands, **7 inversos**,
**interseção vazia**, risco máximo **3**.

⛔ **Confirmado por MUTAÇÃO**, não só pelo verde: uma ferramenta `finance.excluir_transacao`
apontando para `excluirTransacao` foi acrescentada ao registry, o teste ficou **vermelho**
nomeando o inverso alcançável, e a mutação foi desfeita — conferida por `git diff`, não pelo
verde (a armadilha de CRLF do Bloco 4).

⚠️ **"Lance esta nota no PIX" cair no orquestrador NÃO é defeito** — é o desenho. O comprovante
não é frase de chat: a porta é `/ia/comprovantes` e ela é a única (invariante 55). O
orquestrador tem `allowedTools: []`, então a frase não faz nada por acidente — e o teste afirma
junto que `chatRequestSchema` **recusa** um corpo com arquivo.

### A validação item a item — e a contagem que mudou

`docs/phases/PHASE_18_CRITERIOS_VALIDADOS.md`: **163 critérios**, um por linha, cada um com
evidência (teste com nome · arquivo/migration · conferência à mão com data · retirado pelo
desenho). **Nenhuma linha diz "ok", "passa" ou "feito".**

| | |
| --- | --- |
| Critérios extraídos | **163** (84 + 16 + 17 + 17 + 14 + 15) |
| Validados | **142** |
| Dependem de conferência à mão | **17** |
| **RETIRADOS** no desenho (spec §3/§5.2) | **4** (+1 parcial) — não contam no denominador |

⚠️ **A estimativa do plano era 158, e estava errada por método:** ela não contava o trecho final
`transversais do projeto` das cinco listas em prosa, embora contasse os equivalentes numerados da
18-A (itens 79–84). A regra do projeto é contar antes de citar, e o número certo é o medido.

⚠️ **Três critérios ficaram registrados como "deixaram de valer", e não como falsos** — o padrão
que o arquivo usa para tudo que o tempo tornou estranho: A-64 ("nenhuma notificação no sino
nesta subfase", derrubado pela 18-F Bloco 1), A-74 ("nenhuma definição de ferramenta é enviada",
derrubado pela 18-B), B-15 ("nenhuma escrita acontece", derrubado pela 18-C) e B-3 ("consulta
cruzada pelo orquestrador", **substituída** pela experiência com `allow_cross_module`, porque o
orquestrador não tem ferramenta nenhuma).

### O que a conferência no banco mostrou (2026-09-20, só leitura)

| Conferência | Resultado |
| --- | --- |
| Tabelas em `public` | **132**, das quais **20** `ai_*` — a documentação estava certa |
| RLS + FORCE RLS | A consulta por tabelas sem uma das duas voltou **VAZIA** — critério bloqueante, passa |
| `ai_runs_kind_check` | Os **quatro** valores: `chat`, `extracao`, `insight`, `experience` |
| `ai_runs_kind_coerente` | Exige a forma por inteiro: conversa para `chat` **e** `experience`, ausência dela para `extracao` e `insight` |
| Advisor de **segurança** | **1 lint**, `auth_leaked_password_protection` — **pré-existente** (registrado desde 2026-08-07), botão do painel de Auth, sem migration. **Zero lints de schema** |
| Advisor de **performance** | Backlog conhecido, **não** tocado aqui: **179** `auth_rls_initplan` (bate com o número do `CLAUDE.md`), 150 `unused_index`, 117 `unindexed_foreign_keys`, 1 `auth_db_connections_absolute` |

### O achado de documentação: `PROJECT_ROADMAP.md` mentia desde a Fase 02

A spec mandava corrigir uma linha do `CURRENT_STATUS.md` que marcava a **18-D como ⬜** — ela
**já não existia**. O problema real estava no roadmap, que ninguém olhava: **quinze linhas
erradas**, incluindo `02 | Financeiro Base | ⬜ Próxima` e `18-E | ⬜ Próxima — sem desenho
validado` (concluída em 2026-08-09). Ele é o **item 4 da leitura obrigatória** de todo agente
novo, **antes** do `CURRENT_STATUS.md`. Corrigido.

### As duas chaves que continuam ociosas — registro, não migration

`allow_external_search` e `allow_files` existem desde a 18-A e **não ligam nada**, o que contraria
a disciplina das invariantes 24 e 47. A decisão foi **registrar em vez de remover**: `allow_files`
foi substituída na prática por `allow_vision` (18-D), mais específica; `allow_external_search`
fica de pé caso a pesquisa externa volte como tarefa avulsa. ⛔ **Não escreva migration para
apagá-las** — remover coluna no fechamento de fase é a mudança de schema mais arriscada possível
pelo menor ganho possível.

### Verificação (Bloco 5)

`npm run lint` ✅ · `npx tsc --noEmit` ✅ · `npm run test:run` ✅ **3.738 testes / 185 arquivos** ·
`npm run build` ✅ · `npm run perf:bundle` ✅ **68 rotas, mediana 213,9 KB gz**,
`/(app)/configuracoes` em **281,6 KB de um teto próprio de 285** — **idêntico** à linha de base,
como tinha de ser (o bloco mudou duas strings) · `TZ=UTC npx vitest run` ✅.

⛔ **O que este bloco NÃO conseguiu validar:** os 17 critérios que dependem de navegador com
sessão, mais a tabela de 10 itens do Bloco 4. As duas listas são a mesma pendência e estão em
`PHASE_18_CRITERIOS_VALIDADOS.md` ("O que NÃO foi validado") e em
`docs/handoff/NEXT_AGENT_INSTRUCTIONS.md`.

---

## 🟡 18-F · Bloco 4 — três panoramas de um clique (2026-09-22)

Plano em `docs/superpowers/plans/2026-09-20-18f-bloco4-experiencias.md` (§7 da spec).
Branch `feat/18-f-memoria-integracoes`. **Duas migrations, e NENHUMA cria tabela:** um valor no
CHECK de `ai_runs.kind` e uma RPC de admissão; depois, a janela de dedupe do clique duplo, por
`create or replace` da mesma função. Banco continua em **132 tabelas** no `public`,
**20 `ai_*`** (reconferido no banco em 2026-09-22). Suíte em **3.701 testes / 183 arquivos**.
Registry, commands e agentes **inalterados** — este bloco não acrescentou nenhum dos três.

*Planejar meu dia* · *Encerrar meu dia* · *Planejar minha semana*: o servidor decide o que ler,
executa a lista pelo Tool Executor de sempre e o modelo **só redige**. Mais um **modo** Caixa
de entrada, que classifica um item solto e prepara a ação pelo Approval Engine de sempre.

⚠️ **`allow_cross_module` já existia desde a 18-A e nunca tinha sido lida por uma linha de
código.** Este bloco a faz ligar alguma coisa — o mesmo movimento que o Bloco 3 fez com
`allow_memory` e o Bloco 4 da 18-E com `allow_insight_jobs`. **Nenhuma coluna nova.**

| O que entrou | Onde |
| --- | --- |
| Catálogo, atalhos, seleção e os prompts de redação (puros) | `src/lib/ai/experiences/` |
| A 4ª espécie de `kind` + `ai_begin_experience_run` | `supabase/migrations/20260922100000_ai_experiencias.sql` |
| O plano, e quem o monta | `experiences/contracts.ts` + `server/experience-runner.ts` |
| O passo dirigido, a admissão própria e o aviso no texto | `server/chat-runner.ts` |
| A união de duas formas `.strict()` no único endpoint | `validators/ai.ts` + `app/api/ia/chat/route.ts` |
| Os três atalhos e o interruptor da caixa de entrada | `components/ai/chat-client.tsx` (dentro de `ChatView`) |
| A trilha de `allow_cross_module` | `ai/types.ts`, `ai/queries.ts`, `validators/ai.ts`, `actions/ai-preferences.ts`, `components/ai/ai-preferences-form.tsx` |

### As decisões deste bloco

1. **A lista de leituras é ESTÁTICA, e quem a executa é o servidor.** `MAX_TOOL_STEPS = 3` por
   tentativa existe para impedir **o modelo** de decidir quanto o dono gasta; num roteiro
   escrito por nós ele não se aplica. Mas "não se aplica" não virou "não há teto":
   `MAX_FERRAMENTAS_POR_EXPERIENCIA = 5`, o catálogo é validado contra ele em teste, e
   `computeReservation` reserva sobre **esse** número. Deixar o modelo pedir uma ferramenta por
   vez faria o teto cortar antes da última **toda manhã**.
2. **Nenhuma porta nova de leitura.** As experiências entram pelo Tool Executor, com `guard.ts`,
   Zod do adapter, timeout do descriptor, poda e linha em `ai_tool_calls`.
   `insights/collectors/` (invariante 71) continua sendo a única exceção, e **não cresceu**.
3. **O panorama ABRE UMA CONVERSA**, e daí vêm de graça o "transformar resposta em ação" pelo
   Approval Engine, a busca, o histórico e a exclusão em massa. Ele é a **segunda** espécie de
   run com `conversation_id` — e essa foi a armadilha do bloco: `ai_runs` tem **dois** checks
   sobre `kind`, e mexer só no de valores faria todo panorama falhar no `insert`, dentro da
   transação de admissão, chegando à tela como `AI_UNKNOWN`.
4. **Não há um terceiro laço de tentativas.** `experience-runner.ts` monta um PLANO e delega a
   `runChat` — retry, fallback, medição por chamada, heartbeat e a regra "só uma tentativa
   aberta por run" (`ai_usage_events_one_active_uidx`, que o próprio arquivo declara que nenhum
   teste de unidade pega) ficam num lugar só. **Divergência declarada em relação à spec**, que
   dizia que o runner executaria os seis passos.
5. **Módulo sem chave é PULADO e DECLARADO; todos pulados é RECUSA antes de gastar.** A
   assimetria é deliberada: desligar a Agenda não pode calar o panorama inteiro (invariante
   77), mas chamar o modelo para escrever sobre nada faria o dono pagar por uma resposta que o
   sistema já sabia que seria vazia (a lição do `NO_INDICATORS` da 18-E).
6. **A frase do que ficou de fora é NOSSA**, entra no texto gravado e vai no **fim**, no ramo de
   sucesso: tentativa nova zera o texto (invariante 23), e um aviso escrito antes sumiria no
   primeiro retry. Pedi-la ao modelo seria obediência "quase sempre" — e num panorama diário
   isso é uma omissão por mês.
7. **A Caixa de entrada usa o LAÇO NORMAL, e não é preguiça.** Pelo runner dirigido ela exigiria
   um agente com as ferramentas dos cinco módulos de escrita ao mesmo tempo — o "agente de
   tudo" que a allowlist por agente existe para impedir. No laço normal, `routeAgent` entrega ao
   especialista certo; palavra ambígua **desliga** o roteamento (invariante 27) e cai no
   orquestrador, que não tem ferramenta e portanto **pergunta**.
8. **Duas formas `.strict()` no lugar de um schema com campos opcionais.** A do panorama não
   aceita `text`, nem `conversationId`, nem `caixaDeEntrada` — irrepresentável vence recusado
   (invariantes 67 e 79). **Nenhum endpoint novo**, nenhuma rota nova, nenhuma tabela nova.

### O que corrigi em relação ao plano, e por quê

1. ⛔ **O `system` do panorama que o plano esboçava não tinha MEMÓRIA.** "Planejar meu dia"
   respeitando uma preferência salva é onde a memória do Bloco 3 justifica existir, e o handoff
   daquele bloco já avisava que **qualquer runner novo carrega essa ordem junto**. A
   concatenação continua sendo UMA (`perfil.systemBase + blocoDeMemorias`), e o panorama passa
   por ela. Como ele lê VÁRIOS módulos e `memoriasParaOPrompt` decide para UM, a seleção roda
   uma vez por módulo do plano mais uma com `null` (as globais) e a união é deduplicada por id —
   o filtro do Bloco 3 fica **intacto**, então cada memória de módulo continua exigindo a
   `allow_*` dela (invariante 26). Daí o campo `modulos` no plano.
2. ⚠️ **A união quebrou as mensagens em pt-BR do endpoint, e `route.test.ts` pegou.** O Zod
   reporta `invalid_union` no TOPO quando nenhuma forma casa, e as mensagens de dentro de cada
   ramo deixavam de subir: "Página de contexto não reconhecida." virava uma frase genérica, e
   texto longo demais virava 400 em vez de 413. `problemasDoRamo` restaura as duas coisas **sem
   afrouxar a união** — quem ACEITA continua sendo ela, e a escolha do ramo decide só a mensagem
   e o status.

### Orçamento de JS (medido depois do build, 2026-09-22)

| Rota | Bloco 3 | Bloco 4 | Teto |
| --- | --- | --- | --- |
| `/(app)/configuracoes` | 281,6 KB | **281,6 KB** | 285 (próprio) |
| mediana de 68 rotas | 213,9 KB | **213,9 KB** | 250 |

Sem variação: o bloco não cria rota, não toca a casca e o `Switch` novo já era importado
naquela tela. Os atalhos entram por `experiences/atalhos.ts`, que **não tem um único import**
(há teste varrendo o arquivo) — o catálogo, que carrega os prompts e o Tool Registry, fica no
servidor.

### O que ficou de fora do Bloco 4, declarado

Nenhuma rota `/ia/panorama` · nenhuma tabela · nenhum endpoint · nenhuma ferramenta e nenhum
command novos · o botão da casca (`floating-assistant.tsx`) **não foi tocado** · panorama **não
entra no Cron** (é clique do dono; não há retenção nem geração automática — decisão 5 da 18-D,
invariante 87) · `insight-runner.ts` segue com a própria cópia do laço de tentativas, dívida
conhecida que este bloco **não piorou**.

⚠️ **Falta a conferência manual do dono** (tabela de 10 itens no Passo 4 da Task 8 do plano):
nenhum teste do repositório percorre o salvamento de `/ia/configuracoes` nem o desenho em 320 px.

### Auditoria do bloco (2026-09-22) — os 3 P2 corrigidos

Três auditorias read-only (RLS da migration, IA/automação, processo e integridade): **zero
P0/P1**. A migration passou limpa nos dez controles (invoker, `search_path`, `auth.uid()` sem
parâmetro de dono, GRANT batendo com a assinatura, `with check` de cada `insert`, lock
transacional). Os três P2 viraram código. Os dois primeiros são a mesma família — **uma
garantia que dependia de alguém obedecer**:

1. **Só leitura entra, agora em runtime.** `decidirLeituras` recusa `kind !== "leitura"`. O
   catálogo já era varrido por teste, mas teste só protege quem roda a suíte — e o laço
   dirigido chama `executeTool` sem `modo` (o executor fixa `"proposta"` por dentro), então uma
   ferramenta de escrita no catálogo criaria proposta **a cada clique no atalho**.
2. **Leitura que falhou tem frase nossa** (`experiences/falhas.ts`). Até aqui a garantia era o
   bloco de erro pedindo ao modelo "diga que não conseguiu obter o dado" — instrução, não
   garantia. É a mesma decisão que já tinha sido tomada para o módulo pulado, aplicada ao caso
   que faltava.

3. **Clique duplo do atalho deduplicado no banco** — `20260922110000`, a **segunda** migration
   do bloco. O atalho **sempre gasta**, diferente de uma proposta do Approval Engine (que
   expira sem efeito), e o único freio era o estado `enviando` do cliente — que não atravessa
   duas requisições HTTP nem duas telas (a página e o painel têm estados independentes). O
   advisory lock **serializa** duas chamadas do mesmo dono mas **não as deduplica**: a segunda
   espera, lê a reserva da primeira e cria um segundo run pago pelo mesmo conteúdo.

   ⛔ **A correção não é a que a auditoria sugeriu.** "Recusar enquanto houver run aberto"
   travaria o dono por **até 5 minutos** (a lease da reconciliação) depois de ele fechar a aba
   no meio de um panorama. O passo 5b usa **duas** condições, e cada uma desarma o defeito da
   outra: run ainda aberto **e** aberto há menos de 15 s. O segundo clique do gesto morre; um
   run que fechou — por falha, cancelamento ou sucesso — devolve o botão na hora. É a
   invariante 68 aplicada aqui: **deduplicar antes de gastar**.

   Detalhes que a checagem precisa acertar: **depois** do advisory lock (senão ela mesma tem
   corrida); `agent_id` no filtro (um panorama não bloqueia outro); `created_at`, a coluna que
   as outras janelas da função já usam; e **409, não 429** — não é excesso de pedidos, é este
   pedido chegando duas vezes, e a frase não repreende ninguém.

Banco reconferido **depois** das duas migrations: **132 tabelas**, **20 `ai_*`**,
`security_definer: false`, assinatura de 8 argumentos intacta, grants sem `public`/`anon`,
nenhum lint novo em `get_advisors`. Tipos **não regerados** de propósito: assinatura, nomes de
argumento e tabela de retorno idênticos, então a entrada em `Functions` não muda.

## 🟡 18-F · Bloco 3 — o assistente conhece as preferências do dono (2026-09-20)

Plano em `docs/superpowers/plans/2026-09-20-18f-bloco3-memoria.md` (§6 da spec).
Branch `feat/18-f-memoria-integracoes`. **Uma migration: 2 tabelas + 1 coluna.**
Banco em **132 tabelas** no `public`, **20 `ai_*`** (conferido no banco em 2026-09-20).
Suíte em **3.609 testes / 178 arquivos**. Registry em **30 ferramentas** (22 leitura + 8
escrita) e **15 commands**.

O dono escreve preferências numa tela; o assistente as leva para as conversas **como
preferência, nunca como regra**. E a IA passa a poder PROPOR preferências novas — pelo mesmo
Approval Engine da 18-C, sem mecanismo novo de confirmação.

⚠️ **`allow_memory` já existia desde a 18-A e nunca tinha sido lida por uma linha de código.**
Este bloco a faz ligar alguma coisa — o mesmo movimento que o Bloco 4 da 18-E fez com
`allow_insight_jobs`. **Só `allow_write_memory` é coluna nova**, e nasce `false`.

| O que entrou | Onde |
| --- | --- |
| Vocabulário, validação de FORMA e o estado derivado (puros) | `src/lib/ai/memory/{contracts,forma,state}.ts` |
| Duas tabelas + a chave de escrita | `supabase/migrations/20260921100000_ai_memoria.sql` |
| Leitura e as cinco escritas, cada uma com o seu evento | `src/lib/ai/memory/{queries,services}.ts` |
| A seção do prompt, e a ordem em que ela entra | `src/lib/ai/memory/prompt.ts` + `server/chat-runner.ts` |
| A 8ª ferramenta e os dois commands, partidos em dois | `tools/registry.ts` + `approval/commands/memory{,-preview}.ts` |
| A tela, o formulário sob demanda e as 4 actions | `app/(app)/ia/memoria/` + `components/ai/memory-*` + `actions/ai-memory.ts` |
| O deep-link e o backup | `search/ai-links.ts`, `search/queries.ts`, `settings/export-tables.ts` |

### As decisões deste bloco

1. **Duas tabelas, e a segunda não é detalhe.** `ai_memories` guarda o que vale agora;
   `ai_memory_events` guarda o que aconteceu, **append-only** (só SELECT e INSERT) e **sem o
   conteúdo**. É a invariante 20 aplicada aqui: com a frase no log, "excluir memória" a
   deixaria viva num lugar que o dono não sabe que existe. `memory_id` vai **sem FK**
   (invariante 38) — apagar a memória não apaga o registro de que ela existiu.
2. **Nenhum estado é gravado.** Sem `active`, sem `status`, sem `forgotten_at`.
   `vigente`/`expirada`/`desativada`/`esquecida` saem de `expires_at` + o último evento, puro,
   com `agora` injetado. **Decisão do dono > prazo, nos dois sentidos**, e `reativada` devolve
   a palavra ao prazo em vez de ignorá-lo. ⛔ **Expirar não apaga**: a memória sai do prompt e
   continua legível, com a data em que venceu.
3. **O servidor valida FORMA, nunca assunto** (invariante 39): uma linha, ≤300 **pontos de
   código** (como o `char_length` do Postgres conta — `.length` é UTF-16 e discordaria dele nas
   frases com emoji), sem endereço e sem bloco que misture letra e dígito em 20+ caracteres.
   Uma lista de assuntos proibidos fura no primeiro assunto novo. A proibição de ASSUNTO existe
   e mora no prompt da ferramenta, **descrita pelo lado positivo** — dizer o que PODE ser
   proposto é mais estreito e não planta palavra nenhuma no prompt (invariante 30).
4. **A memória entra no prompt POR ÚLTIMO.** `chat-runner` concatena SEGURANÇA + perfil +
   contexto de roteamento + memória, e a ordem é varrida por teste sobre a fonte. A seção
   declara em paralelo que uma preferência **não desliga** regra, **não autoriza** leitura,
   **não autoriza** alteração e **não é dado sobre os registros**. Teto **visível** (20).
5. **Memória de módulo ANDa com a chave daquele módulo**, resolvida pelo MÓDULO da memória e
   não pelo agente que atende — invariante 26. Há teste com `body`, que não tem agente próprio:
   numa conversa de Treinos ela exige `allow_body`, não `allow_training`.
6. **O inverso de `lembrarPreferencia` é `esquecerPreferencia`, não uma exclusão**
   (invariante 48). Esquecer tira do prompt e deixa legível; apagar de vez continua sendo botão
   do dono, na tela dele. E `content` fica **fora** de `camposAuditaveis`: `changed_fields` é
   auditoria permanente e não some com a conversa.
7. **O orquestrador continua com `allowedTools: []`.** `memory.lembrar` foi para os OITO
   especialistas. O prompt dele afirma que não cria, edita nem exclui nada; incluí-lo custaria
   reescrever aquela frase, subir `assistente-pessoal-v2` para `v3` e trocar a invariante 74.
   A tela cobre o buraco: preferência geral o dono escreve lá, e o texto diz isso.

### Três descrições de agente viraram mentira — e agora há teste

"Só lê — não altera nada" caiu em **Treinos, Estudos e Tarefas** quando `memory.lembrar` entrou
nas oito allowlists. É a **quarta vez** que uma frase de ausência envelhece neste módulo
(`AVISO_SEM_ACESSO` quatro vezes, o prompt-base três), e a primeira em que há guarda:
`agents/registry.test.ts` deriva do REGISTRY quais agentes escrevem e recusa "só lê" na
descrição deles — nunca de uma lista escrita à mão, que é justamente a que ficaria para trás.

### O que a execução encontrou e o plano não previa

- **O teste de migration tinha duas asserções vácuas.** A regex de policy proibida exigia
  quebra de linha onde o SQL escreve `on public.ai_memory_events for select` na mesma linha —
  ela não casaria nem com o que existe, e passaria verde para sempre, inclusive depois de
  alguém acrescentar o UPDATE que ela deveria barrar. E `indexOf` pelo nome da constraint
  pegava o `drop constraint if exists`, devolvendo lista vazia. Corrigidos, com **asserção
  positiva** provando que a primeira regex sabe encontrar presença.
- **`round-trip.test.ts` pegou um defeito real antes do usuário:** `.regex()` roda ANTES do
  `.transform()`, então o padrão de data recusava a string vazia que um `<input type="date">`
  em branco manda — o formulário nunca salvaria, com "Use uma data válida" num campo deixado
  vazio de propósito. É exatamente o bug que deu origem àquele arquivo.
- **A regex do teste de fronteira do lado preview só pegava um nível de pasta.**
  `@/lib/[a-z-]+/services$` deixaria `@/lib/ai/memory/services` passar, e a partição dos
  commands viraria decoração — arquivos dois, grafo de imports um. Agora é `/services$`.
- **`guard.test.ts` tinha duas fixtures escritas à mão** sobre uma lista que cresce. Viraram
  derivadas de `TOOL_WRITE_PERMISSIONS`: ali, "tudo ligado" com uma chave faltando testaria o
  guard contra um estado que nunca existe.
- **`memory/` mistura puro com I/O, e nada no projeto guardava essa linha.**
  `boundaries.test.ts` exige `server-only` só em `ai/server/` e `approval/commands/`. O teste
  novo cobre as duas metades — e reprova arquivo novo que escape das duas listas (foi ele que
  exigiu `prompt.ts` na lista assim que o arquivo nasceu).

### Orçamento de JS, medido em 2026-09-20 depois do bloco

| Rota | Bloco 2 | Bloco 3 | Teto |
| --- | --- | --- | --- |
| `/(app)/configuracoes` | 281,4 KB | **281,6 KB** | 285 (próprio) |
| `/(app)/ia/memoria` | — | **203,0 KB** | 250 |
| mediana | 213,8 KB (67 rotas) | **213,9 KB (68 rotas)** | 250 |

⚠️ **A medição desmentiu a hipótese do plano.** Ele dizia que, se `/(app)/configuracoes`
subisse, o culpado seria `@/lib/ai/constants`. Movi os dois rótulos novos dali para
`memory/contracts.ts` e **o número ficou igual**: o custo vem da CASCA — a busca global vive no
Header de todas as rotas, e `search-meta.tsx` ganhou o ícone e `search/types.ts` o tipo
`ia_memoria`. O teto **não** foi subido; o movimento continua certo pelo argumento de não
viajar com quem não usa, mas não é o que explica o número. **Ao mexer no orçamento, meça antes
de escrever a causa.**

## 🟡 18-F · Bloco 2 — o assistente ao alcance de qualquer tela (2026-09-20)

Plano em `docs/superpowers/plans/2026-09-19-18f-bloco2-botao-flutuante.md` (§5 da spec).
Branch `feat/18-f-memoria-integracoes`. **Uma migration, duas colunas, nenhuma tabela.**
Suíte em **3.513 testes / 172 arquivos**.

Um botão fixo no canto inferior abre um painel com o **mesmo** `ChatClient` da 18-A, apontando
para o **mesmo** `/api/ia/chat`. Nenhuma chave de permissão nova, nenhuma porta nova de
leitura, nenhuma regra reescrita — o chat atrás do botão continua exigindo exatamente as
mesmas `allow_*` e `allow_write_*`, e todas continuam desligadas de fábrica.

| O que entrou | Onde |
| --- | --- |
| A regra do selo, pura e **sem um único import** | `src/lib/ai/painel.ts` + `painel.test.ts` |
| Duas colunas + CHECK do canto | `supabase/migrations/20260920100000_ai_botao_flutuante.sql` |
| O botão (leve, mora na casca) | `src/components/ai/floating-assistant.tsx` |
| O painel (pesado, atrás de `next/dynamic`) | `src/components/ai/floating-assistant-panel.tsx` |
| A frase de bloqueio, num lugar só | `src/lib/ai/server/chat-readiness.ts` |
| Abrir o painel (lê + **reconcilia**) e mover/ocultar o botão | `src/lib/actions/ai-panel.ts` |
| Os dois controles, e o caminho de volta | `src/components/ai/ai-preferences-form.tsx` |

### As seis decisões deste bloco

1. **Dois cantos, não quatro.** O Header é `sticky top-0 z-30` com `h-16` e ocupa a faixa
   superior inteira em toda rota `(app)`: canto de cima é colisão garantida. Ficam
   inferior-direito e inferior-esquerdo.
2. **Sem arrastar.** Arrastar exigiria persistência por tipo de aparelho, encaixe em bordas e
   uma alternativa acessível ao gesto — três subsistemas para fugir de obstáculos que este
   layout **não tem**: o lançamento rápido mora no Header e a navegação do celular é um drawer
   lateral, não uma barra inferior.
3. **Banco, não cookie.** A sidebar usa cookie porque o estado dela é por aparelho. Quem
   escondeu o botão escondeu-o de propósito, e reencontrá-lo aparecendo no celular seria a
   preferência não valendo. Em banco ele ainda entra no backup e some na exclusão em massa.
4. **O botão nasce VISÍVEL,** e isso não fere "toda chave nasce desligada": aquela regra vale
   para AUTORIZAÇÃO, e esta não autoriza nada. Um botão que nasce escondido é uma entrega que
   ninguém encontra.
5. **O painel abre conversa NOVA** (`conversationId={null}`). Nada é criado no banco até a
   primeira mensagem, e o histórico continua em `/ia/conversas`, alcançável pelo "Abrir em
   tela cheia" e pela busca global. Semear com "a última conversa" exigiria lê-la a cada
   abertura e decidir o que é "a última" — decisão de produto que este bloco não tem.
6. **`floating_hidden` esconde o BOTÃO, não o assistente.** O atalho `Ctrl/⌘ + I` continua
   abrindo o painel, e as duas telas que oferecem ocultar dizem isso com essas palavras.

### ⛔ O conserto de 2026-09-20 — a conversa não sobrevivia ao fechamento

O dono conferiu à mão e achou o que o automatizado não pegava: **mandar uma pergunta e fechar
o painel fazia a pergunta sumir.**

`SheetContent` é embrulhado em `<Presence present={forceMount || context.open}>`, então fechar
**desmonta tudo que está dentro da gaveta**. O `ChatClient` morava ali e levava junto o
`useState` das bolhas, o `conversationId` e — o pior — o cleanup do `AbortController`, que
**cancelava a resposta em andamento**. O critério de aceite 6 estava quebrado inteiro: o selo
nunca chegaria a aparecer. O plano do bloco afirmava que `useLazyDialog` fazia o streaming
sobreviver; ele mantém montado o **componente do painel**, não os filhos da gaveta.

`forceMount` não era saída: `RemoveScroll`, `hideOthers` e `FocusScope` moram no mesmo
`Presence`, e o app ficaria com rolagem travada e `aria-hidden` permanentes.

**O conserto é o que o React manda — o estado sobe.** `chat-client.tsx` passou a exportar as
duas metades: `useConversaDaIa` (estado, envio, streaming, cancelamento) e `ChatView` (só JSX).
`ChatClient` continua juntando as duas, então `/ia` não mudou uma linha; o painel chama o hook
**acima do `<Sheet>`** e renderiza a vista dentro. Como o painel sobrevive ao fechamento **e** à
navegação, perguntar-fechar-navegar passou a funcionar. **Não há segundo chat.**

E o que persiste envelhece: o efeito que lê `estadoDoPainelDaIa` passou a depender de `aberto`.
Preso à montagem, quem ligasse um provedor sem recarregar veria "configure um provedor" para
sempre, e o gatilho de reconciliação (invariante 92) dispararia 1× por carregamento em vez de a
cada abertura.

Guardado por `src/lib/ai/painel-persistencia.test.ts` — varredura de código-fonte **que ignora
comentários**, porque a primeira versão do teste casou com o `<Sheet>` citado na própria
explicação da regra. Orçamento inalterado: **281,4 KB gz**, 15 chunks, e das marcas do painel e
do chat nenhuma aparece nos chunks contados para a rota.

### O orçamento de JS, que foi o juiz do bloco

O botão mora na casca, então tudo que ele importa entra nas **67 rotas**. Medido antes e
depois, com `npm run perf:bundle`:

| Rota | Bloco 1 | Bloco 2 | Teto |
| --- | --- | --- | --- |
| `/(app)/configuracoes` | 279,2 KB | **281,4 KB** | 285 (próprio) |
| `/(app)/nutricao/compras` | 240,0 KB | 242,2 KB | 250 |
| `/(app)/todo` | 236,2 KB | 237,3 KB | 250 |
| mediana de 67 rotas | 211,7 KB | 213,9 KB | — |

⛔ **A folga da rota mais apertada caiu de 5,8 para 3,6 KB, e o teto NÃO subiu.** O comentário
da exceção em `scripts/perf/bundle-budget.mjs` afirmava "folga de ~6 KB" e virou falso — foi
corrigido junto, com o número novo.

**A separação foi PROVADA no build, não assumida.** Dos 15 chunks contados para
`/(app)/configuracoes`, só as marcas do BOTÃO aparecem; "Preparando o assistente", "Abrir em
tela cheia" e "Nenhuma mensagem ainda" (painel e chat) estão todas fora. O que segura isso:
`painel.ts` sem import, a lista escrita do que `floating-assistant.tsx` não pode importar, e o
`next/dynamic` com **objeto literal** — trocá-lo por constante faz o painel voltar ao manifest.

### Duas coisas que o plano não previa

1. **`round-trip.test.ts` tinha a SEGUNDA fixture de `aiPreferencesSchema`** e ficou vermelha
   sozinha. A lista `OBRIGATORIOS` de `validators/ai.test.ts` não a cobre — é o mecanismo da
   invariante 81 disparando num lugar a mais. Campo obrigatório novo mexe em **duas** fixtures.
2. **O gerador de tipos do Supabase traz mais do que a migration.** Além das duas colunas, ele
   trouxe uma relationship de `import_rows` → `accounts_with_balance` e a sintaxe nova dos
   genéricos auxiliares. Só as **seis linhas** das colunas entraram em `src/types/supabase.ts`;
   as outras duas ficaram de fora de propósito, porque não são deste bloco. **Leia o diff dos
   tipos antes de aceitá-lo** — o arquivo é ponto de contato entre frentes.

### Verificação

`npm run lint` · `npx tsc --noEmit` · `npm run test:run` (3.513/3.513) · `npm run build` ·
`npm run perf:bundle` (67 rotas dentro do teto) · `TZ=UTC npx vitest run` (3.513/3.513) ·
`get_advisors` sem lint novo.

⚠️ **E a conferência à mão do dono achou o que tudo isso deixou passar** — a conversa não
sobrevivia ao fechamento do painel. Ver "O conserto de 2026-09-20" acima. A suíte não tem como
pegar sozinha um defeito de ciclo de vida de componente enquanto o projeto rodar em ambiente
`node` sem um único `.test.tsx` (invariante 25); o que ficou no lugar é uma varredura de
código-fonte, e ela só existe porque o defeito apareceu.

## 🟡 18-F · Bloco 1 — IA deixa de ser uma ilha (2026-09-19)

**Desenho validado com o dono:**
`docs/superpowers/specs/2026-09-19-18f-memoria-integracoes-design.md`.
Plano em `docs/superpowers/plans/2026-09-19-18f-bloco1-costura.md`.
Branch `feat/18-f-memoria-integracoes`. **Nenhuma migration: o bloco não cria tabela nem
coluna.** Suíte em 3.482 testes / 170 arquivos.

O módulo de IA funcionava inteiro e **não aparecia em lugar nenhum do sistema**: não
notificava, não era encontrado pela busca global, não entrava no backup e não tinha como ser
apagado em massa. O Bloco 1 costura os quatro pontos.

| O que entrou | Onde |
| --- | --- |
| 4 famílias de notificação (orçamento, provedor, ação sem desfecho, análise disponível) | `src/lib/notifications/ai.ts` (pura) + `ai-cron.ts` (I/O) |
| Busca global alcança conversas, análises e ações | `src/lib/search/queries.ts` + `types.ts` |
| Backup ganha 17 tabelas `ai_*`, **sem a de credenciais** | `src/lib/settings/export-tables.ts` |
| Exclusão em massa que declara o que permanece | `src/lib/ai/retention.ts` + `actions/ai-retention.ts` + `components/ai/retention-card.tsx` |
| Fonte única dos deep-links de `/ia` | `src/lib/search/ai-links.ts` (rotas conferidas no DISCO por teste) |

### As decisões que este bloco tomou

1. **Nenhum tipo novo consulta preferência por conta própria.** As quatro famílias entram por
   `generateNotifications` → `filterByPrefs`, o único ponto de decisão (invariante 24). Só
   `ai_insight_available` é opt-in; as outras três são avisos de que algo está errado ou
   custando dinheiro.
2. **O orçamento do sino NÃO é recalculado.** Ele sai de `getUsageSummary` — a mesma função
   de `/ia/consumo` —, que passou a aceitar `LeituraDoDono` (invariante 79) para o Cron
   service-role usar **a mesma leitura da tela**. Um segundo somatório faria o número do sino
   divergir do da tela, que é a invariante 24 da 17-F aplicada aqui.
3. **`nivelAtingido` + `deveAvisar` foram REUSADOS, não reescritos.** `ai/usage/budget.ts` já
   os exportava (o comentário deles dizia "nenhuma notificação no sino nesta subfase (é
   18-F)"); o plano trazia uma terceira cópia da regra de limiar, que foi descartada.
4. **A assimetria de RLS é declarada nos dois arquivos.** `ai-cron.ts` roda com service role,
   ignora RLS e carrega `user_id` em **toda** query; `searchAll` usa o client COM SESSÃO e
   **não** filtra por `user_id`, porque a RLS o faz. Trocar um pelo outro é vazar dado ou
   devolver vazio em silêncio.
5. **`ai_provider_credentials` fica fora do backup**, com o motivo escrito em
   `EXPORT_EXCLUDED` (não só em comentário): ela guarda o ciphertext da chave de API e a DEK
   embrulhada. Mesmo motivo de `google_integrations`.
6. **Não há retenção automática, e isso é decisão.** Nenhum job apaga conversa velha — a
   decisão 5 da 18-D é "nada some sozinho, descartar é clique do dono". O que existe é
   exclusão em massa PEDIDA, em `/ia/configuracoes`.
7. ⛔ **A exclusão declara o que PERMANECE e o que SAI JUNTO, antes de confirmar.**
   `ai_action_executions` não tem FK para proposta nem aprovação (invariante 38) justamente
   para sobreviver a apagar a conversa; a tela diz isso. E diz também o que não está no nome
   do escopo: `ai_conversations` → `ai_runs` → `ai_usage_events` é **cascade**, então apagar
   conversas apaga a **medição de custo** delas — o gasto sai de `/ia/consumo` e deixa de
   contar no teto do mês. Mudar essa FK exigiria migration, que este bloco não faz; declarar
   é a saída, e é melhor do que descobrir depois.
8. **Contar e apagar saem do MESMO seletor** (`alvosDoEscopo`, em `actions/ai-retention.ts`).
   A tela pede a contagem ao servidor ao abrir o diálogo, pelo mesmo filtro que a exclusão
   usará — dois filtros separados fariam a tela prometer um número e o banco executar outro
   (invariante 43).
9. **Comprovante não é `delete from ai_documents`.** A exclusão em massa chama
   `descartarDocumento` (18-D) um a um: ele apaga o ARQUIVO do bucket privado antes do
   metadado e **recusa** o comprovante que já virou anexo de um lançamento. Um delete direto
   deixaria o binário do documento pessoal órfão no bucket com a tela dizendo que apagou.
10. ⛔ **Nada linka para `/ia/memoria`** — essa rota só nasce no Bloco 3, e link para rota
    inexistente é 404 (a lição do `?aba=despensa` da 16-F). `ai-links.ts` tem um teste que
    confere no DISCO que cada rota citada tem `page.tsx`.

### Duas armadilhas de fuso que o plano trazia e foram corrigidas

- **`.slice(0, 10)` num `timestamptz`** (`ai_insights.created_at`) devolve o dia em **UTC** e
  erra a data entre 21h e 00h BRT. Trocado por `dateInSaoPaulo(new Date(...))`.
- **Cortar o dia em `${todayIso}T00:00:00.000Z`** é meia-noite UTC = 21h BRT da véspera: três
  horas da noite anterior entrariam como "hoje". Há um `inicioDoDiaEmSaoPaulo()` usando
  `saoPauloWallClockToInstant`, e o mesmo corte vale para a data de exclusão de conversas
  antigas.

### `Record<Union, T>` pegou dois arquivos que o plano não listava

Acrescentar membro à união deixou `tsc` vermelho até cada mapa ter a entrada:
`src/components/notifications/notification-meta.tsx` (ícone por `NotificationType`) e
`src/components/search/search-meta.tsx` (ícone por `SearchType`). É a armadilha funcionando
como projetada — sem ela, os tipos novos apareceriam sem ícone, em silêncio.

### Verificação

`lint` + `tsc --noEmit` + `test:run` (3.482 ✓) + `build` + `perf:bundle` verdes, e a suíte
também passa com `TZ=UTC`. `/ia/configuracoes` ficou em **214,1 KB gz** (orçamento 250).
⚠️ `/(app)/configuracoes` subiu de 276,8 para **279,2 KB** — os 7 ícones novos do `lucide`
entram pelo sino e pela busca, que vivem no Header e portanto em **toda** rota `(app)`. Segue
abaixo do teto próprio de 285 KB; a medição registrada em `scripts/perf/bundle-budget.mjs`
foi atualizada.

Cron conferido de verdade: `/api/cron/notifications` sem Bearer devolve **401**; com o
`CRON_SECRET`, três execuções seguidas **não criaram nenhuma notificação nova** (o Cron das
09h já havia rodado). O caminho de IA foi exercitado com sonda temporária e devolveu
orçamento real (US$ 0,005442 contra teto de US$ 20) — ou seja, zero notificação de IA é
"não há o que avisar", não um erro engolido pelo `.catch`.

## Iteração 2026-09-19 — transferência na importação de EXTRATO DE CONTA

**O que já existia:** a importação de extrato (`/importar` → origem "Extrato de conta") está
pronta desde a Fase 06 e funcionava para despesa e receita — parse, mapeamento, dedup por
FITID, revisão editável, commit e desfazer já tratavam `origem = 'conta'`. Conferido no banco:
os 6 lotes importados até aqui eram **todos de cartão**, então esse caminho nunca tinha sido
exercitado de verdade.

**O que faltava:** o dinheiro que só **muda de lugar**. Um extrato traz pagamento de fatura de
cartão, aplicação, resgate e transferência entre contas próprias; tudo isso entrava como
despesa ou receita. A pior consequência era o **pagamento da fatura contar o cartão duas
vezes** — uma pela fatura importada, outra como despesa da conta.

**Decisões que valem daqui em diante:**

1. **A conta de destino é o que faz a linha ser transferência; `tipo` guarda o SENTIDO.** Não
   existe `tipo = 'transferencia'` em `import_rows`. `despesa` = saiu da conta do extrato,
   `receita` = entrou nela — e é isso que decide qual das duas contas é a ORIGEM do lançamento
   (`pernasDaTransferencia`, puro e testado). Sobrescrever `tipo` faria aplicação e resgate
   ficarem indistinguíveis, com o saldo das duas contas invertido e nada na tela denunciando.
   Ganho de graça: *"transferência sem destino"* deixa de ser **representável**.
2. **Vocabulário é allowlist de EXPRESSÃO.** `src/lib/import/transferencia.ts` reconhece
   "pagamento de fatura", "aplicacao", "resgate", "entre contas". **"pix", "ted", "doc" e
   "transferencia" sozinhos ficam de fora** — "PIX ENVIADO - PADARIA" é despesa real. Palavra
   ambígua **desliga** a regra em vez de errá-la (mesma disciplina do roteador da 18-C).
3. **Pagamento de fatura é auto-ignorado**, como a fatura de cartão já faz com a própria linha
   de pagamento. Quem paga fatura é **Faturas → pagar**, que também marca `pago_em` e
   `pago_transacao_id`; importá-lo como transferência solta criaria um pagamento que não deixa
   fatura nenhuma paga — uma segunda verdade sobre o mesmo fato.
4. **Roda DEPOIS da dedup**, como `marcarParcelasJaLancadas`: a dedup limpa o `motivo` ao
   promover a linha, e rodar antes apagaria o aviso justo nas linhas que ele marca.
5. **Transferência fica fora do líquido** (`totaisPorStatus` tem soma própria) e fora da quebra
   "meu × de cada pessoa" (`split-totals.ts`), e **não é divisível** — as duas contas precisam
   descrever o mesmo conjunto de linhas.

**Banco:** 1 migration (`20260919120000_import_rows_transferencia.sql`) — `import_rows.
transfer_account_id`, `unique (id, user_id)` em `accounts` e a **FK composta**
`(transfer_account_id, user_id)` com `on delete set null (transfer_account_id)` (lista de
colunas, PG 15+; sem ela o Postgres zeraria `user_id`, que é NOT NULL). Nenhuma tabela nova.

**Verificação:** `npm run test:run` ✅ (**3.428 testes / 167 arquivos**; +43 novos),
`npm run lint` ✅, `npx tsc --noEmit` ✅, `npm run build` ✅.

## ⚡ Auditoria de performance (2026-09-19) — CONCLUÍDA

Fora do roadmap: uma passada de performance ponta a ponta, disparada por "trocar de tela
demora · o primeiro carregamento é pesado". Relatório completo em `.turbo/REPORT.md` (local,
fora do git por `.git/info/exclude`).

| Métrica | Antes | Depois |
| --- | --- | --- |
| Região de compute (Vercel) | `iad1` (Washington) | **`gru1` (São Paulo)**, co-locado com o banco |
| JS por rota — mediana | 214,9 KB gz | **210,7 KB gz** |
| JS por rota — pior | 434,1 KB (`/treinos/evolucao`) | **277,5 KB (`/configuracoes`)** |
| Rotas acima de 250 KB gz | 20 de 67 | **1 de 67** (teto próprio documentado) |
| `nutrition_foods_view` sob RLS | 49,2 ms | **14,9 ms** |
| Build limpo | 34,6 s | **27,2 s** |

### As quatro coisas que mudaram no código, e que valem para quem escrever tela nova

1. **⛔ `"regions": ["gru1"]` no `vercel.json` não é preferência — é onde está o banco.**
   O Supabase roda em `sa-east-1`. Sem essa chave o compute cai em `iad1` e **toda** query
   atravessa o continente. Se um dia o banco mudar de região, mude essa linha junto.
2. **Gráfico entra por `next/dynamic`.** `recharts` custa 109 KB gz e entrava no primeiro byte
   de 5 rotas. Cada arquivo de gráfico virou um par fachada/`*-impl.tsx`: a fachada tem a API
   pública e o `dynamic`, o `-impl` tem o `recharts`. ⚠️ **O que NÃO usa `recharts` fica na
   fachada** — `DistributionBars`, `MeasurementTable` —, senão importá-los arrasta os 109 KB
   junto. `MeasurementTable` em especial é a regra 6 da 16-E (a leitura textual do dado) e não
   pode depender de o gráfico ter baixado.
3. **Diálogo de formulário entra por `next/dynamic` + `useLazyDialog`**
   (`src/components/shared/use-lazy-dialog.ts`). Eles arrastam `zod` + `react-hook-form`
   (~62 KB gz). ⚠️ **`{aberto && <Dialog/>}` sozinho quebra a animação de fechamento** — o hook
   monta na primeira abertura e não desmonta mais.
   ⛔ **O que ele NÃO faz: preservar o estado de DENTRO do diálogo.** `DialogContent`/
   `SheetContent` são embrulhados em `<Presence present={forceMount || context.open}>`, então
   fechar desmonta a subárvore inteira. O hook protege o invólucro (download sob demanda +
   animação), não o `useState` dos filhos. Formulário pode resetar; o que precisa sobreviver
   ao fechamento tem de ter o estado **fora** do diálogo. `forceMount` não resolve —
   `RemoveScroll`, `hideOthers` e `FocusScope` moram no mesmo `Presence`. Custou um bug real
   em 2026-09-20 (o painel da IA perdia a pergunta ao fechar).
4. **⚠️ Constante lida pela TELA não mora em `src/lib/validators/`.** As telas de `/ia`
   baixavam 62,7 KB gz de `zod` para ler quatro constantes (`MAX_CHAT_TEXT`,
   `ROTAS_COM_CONTEXTO`, `MAX_OBSERVACAO_DOCUMENTO`, `MODULOS_COM_CONTEXTO`), porque elas
   moravam num módulo cuja primeira linha é `import { z } from "zod"`. Passaram para
   `@/lib/ai/constants` (módulo puro, sem um único import de runtime) e são **reexportadas**
   pelos validators, então nenhum import existente quebrou.

### Guarda-corpo instalado

`npm run perf:bundle` (depois de `npm run build`) reprova com código 1 qualquer rota acima de
**250 KB gz** — o `next build` do Next 16 não imprime mais esse número, então sem o script o
bundle regride em silêncio. Ele roda no CI novo (`.github/workflows/ci.yml`, que também roda os
quatro portões do projeto e **não precisa de segredo nenhum**).

⚠️ **`/todo` está a 247,6 KB, a 2,6 KB do teto.** É a próxima a estourar; ela ainda tem
diálogos de cadastro entrando estáticos.

### Duas armadilhas de MEDIÇÃO que custaram tempo nesta auditoria

- **`EXPLAIN` sempre com `timing off`.** Com `timing on`, a view de alimentos acusou 150 ms
  onde o real eram 3 ms — overhead da instrumentação.
- **RLS só aparece no papel `authenticated`.** Como service role a `nutrition_foods_view` roda
  em 14,4 ms e a policy some da conta. Foi assim que o custo real do `auth.uid()` por linha
  (34,8 ms, não os 6,9 ms estimados) passou despercebido no levantamento inicial.

## ✅ 18-E — IA · Insights (CONCLUÍDA, blocos 1 a 4)

**Desenho validado com o dono em 2026-08-09:**
`docs/superpowers/specs/2026-08-09-18e-insights-relatorios-dashboards-design.md`.
Plano em `docs/superpowers/plans/2026-08-09-18e-insights-relatorios-dashboards.md`.

**O que mudou de natureza.** Até a 18-D a IA **relatou** números que outro alguém calculou:
`resumoMes` soma, `metrics.ts` agrega, `calc.ts` totaliza, e o adapter repassa. A 18-E cria a
primeira grandeza **derivada** do projeto — média de janela, comparação entre períodos,
variação percentual —, escreve um texto em cima dela e o mostra numa tela que a IA não
controla (o dashboard geral, da Fase 12).

Daí as três regras que governam a subfase inteira:

| Regra | Como ela é garantida |
| --- | --- |
| **O número é medido e vem pronto** | `insights/temporal.ts` agrega sobre o que os coletores devolvem; ele não importa `resumoMes`, `metrics.ts` nem `calc.ts` — invariante 31 escrita como grafo de imports |
| **O texto não contém dígito** | Todo número entra por token `{{ind:<id>}}`, e `ai_insights.explicacao` guarda os TOKENS. Enquanto o texto guardar tokens, é **impossível** o banco conter um insight que cite um número fora das fontes |
| **O dashboard nunca chama a IA** | Geração (`/ia/insights` + runner + action) e leitura (`insight-queries` + card) moram em arquivos que o dashboard não alcança — teste de import, não promessa |

### As oito decisões do dono

As três primeiras vieram do fechamento da 18-D; as cinco seguintes, do brainstorm de
2026-08-09.

| # | Decisão |
| --- | --- |
| 1 | O módulo de agregação temporal **É criado**, e o 8-D é reescrito com versão NOVA de prompt |
| 2 | O job automático **nasce desligado**, com chave própria e orçamento separado |
| 3 | "Conversar com um relatório" fica **fora**, declarado → 18-F |
| 4 | **Fatia vertical fina**, quatro blocos, e o que não couber é declarado fora |
| 5 | **`/ia/insights` GERA; o card do dashboard só EXIBE** |
| 6 | **O texto gerado não contém dígito** — número por token |
| 7 | **Financeiro + Treinos + Dieta** na primeira fatia (três FORMAS diferentes de número) |
| 8 | **"Transformar em ação" entra, restrito a `todo.criar_tarefa`** |

### O que cada bloco entregou

**Bloco 1 — a fundação, sem uma chamada de IA.** `src/lib/tone/vocabulary.ts` (a lista de
vocabulário proibido existia **duas vezes**, dentro de dois arquivos de teste, sem export e
com conteúdos **diferentes**); `insights/contracts.ts`; `insights/temporal.ts` com **cinco**
recusas — a quinta (unidades diferentes não se comparam) nasceu do código, não do desenho;
`seguranca-v3`; e as fronteiras novas.

⚠️ **O teste do adapter de Treinos disparou sozinho.** O `"8-D só pode negar médias enquanto
elas não existirem"` foi escrito na 18-B exatamente para este momento, e o aviso chegou.

**Bloco 2 — três tabelas, o Engine e os coletores.** `ai_insights`, `ai_insight_sources`
(o SNAPSHOT — exceção **declarada** à invariante 20, pelo mesmo motivo de
`nutrients_snapshot`), `ai_insight_feedback` (append-only por policy: SELECT e INSERT, sem
UPDATE e sem DELETE), `ai_runs.kind = 'insight'` como terceira espécie, e o RPC
`ai_begin_insight_run` com o **mesmo advisory lock** do chat. Os seis módulos puros e os três
coletores, pela **terceira porta declarada**.

⚠️ **Desvio declarado do desenho, e mais forte que ele:** a `unique (user_id, dedupe_key)`
alcança o insight **expirado**. O desenho dizia "devolva o existente se não estiver expirado",
o que bateria em `23505` ao regenerar depois do vencimento. A leitura prévia devolve o
existente **seja qual for o estado dele** — se a chave repete, os dados não mudaram, e um
segundo texto sobre os mesmos números não é informação nova, é gasto.

**Bloco 3 — a tela, o card e a quarta forma.** `/ia/insights` como 7º item de `AI_SECTIONS`;
`insights` no **fim** de `DASH_CARD_IDS`; `ai_action_proposals.origem` ganha `'insight'`, com
o CHECK exigindo a forma por inteiro e FK composta `(insight_id, user_id)`; e "transformar em
tarefa", que **propõe** e não cria.

### ✅ O Bloco 4 — o job automático (2026-08-09)

Ele **estava** declarado fora, e fechou no mesmo dia, depois de o dono decidir o ponto difícil.
Desenho: `docs/superpowers/specs/2026-08-09-18e-bloco4-job-insights-design.md`.

**O ponto difícil era a admissão**, não as assinaturas: `ai_begin_insight_run` é
`security invoker` e lê `auth.uid()`, que o Cron não tem. Das três saídas, a escolhida foi
`p_user_id` honrado **só** quando a sessão é nula — ⛔ **e a trava é a RLS, não o `coalesce`**:
a função continua `security invoker`, então um autenticado apontando para outro dono não lê as
preferências, não lê a credencial e não consegue o `insert` em `ai_runs`. As duas recusadas:
uma RPC gêmea `security definer` duplicaria ~150 linhas de admissão (dois juízes do mesmo
orçamento, a divergência que a invariante 8 impede), e minerar um JWT do dono introduziria um
primitivo de impersonação no repositório.

**Eram NOVE assinaturas, não oito.** A nona é `getMealTypes`, chamada por dentro de
`getDiaryMeals` — a lista anterior fora medida antes e essa transitiva escapou. Todas recebem
`LeituraDoDono` (`src/lib/supabase/owner.ts`): um objeto único, em que **"client sem userId"
não é representável** (o guard de `getSessionHistory` vira desnecessário porque o estado que
ele protegia deixa de existir).

**O orçamento ganhou um segundo teto.** `job_monthly_budget` é **NOT NULL** — ao contrário de
`daily_budget`/`monthly_budget`, que aceitam nulo — porque o job é o único gasto sem o dono
olhando, e um teto opcional sobre isso é um teto que a configuração padrão não tem. O job passa
pelo próprio **e** pelo global; qualquer um dos dois barra. O marcador `ai_runs.automatic` é
**derivado** de `auth.uid() is null`, nunca recebido por parâmetro.

**`allow_insight_jobs` não é ANDada com as chaves de módulo** — diferente de `allow_vision`,
cujas três chaves servem ao mesmo efeito. Aqui os três módulos são independentes: desligada,
nada roda; ligada, o módulo sem chave é **PULADO** e os outros seguem (`insights/job.ts`, puro).

**`ai_insight_jobs`** grava uma linha por módulo por execução — inclusive `pulado`, com o motivo
sanitizado. Sem ela, "job barrado registra o motivo" ficaria só no log da Vercel, que o dono não
lê. Append-only (só policy de SELECT); `run_id`/`insight_id` **sem FK**, invariante 38.

**Cadência 1×/dia**, slot `0 12` UTC (09h BRT), em `/api/cron/insights` — rota **separada** de
`/api/cron/notifications`, porque um job de insight que falha não pode derrubar as notificações.

⚠️ **Defeito pré-existente encontrado e corrigido:** `allowVision` (18-D) era obrigatória no
`aiPreferencesSchema` mas nunca foi acrescentada ao payload do formulário — nem tinha
interruptor na tela. **Toda** gravação de preferências vinha sendo recusada desde a 18-D. Há
teste novo comparando as duas listas.

### Invariantes que a 18-E fixou

64. ⛔ **O TEXTO GRAVADO NÃO TEM NÚMERO.** `ai_insights.explicacao` guarda `{{ind:<id>}}`, e
    `render.ts` resolve a cada leitura a partir de `ai_insight_sources`. Isso muda a natureza
    da garantia: ela deixa de depender de o validador ter rodado e vira **propriedade do
    dado** — o mesmo movimento que pôs uso único num `unique` e prazo num `default`.
65. ⛔ **AUSÊNCIA CARREGA MOTIVO, DO CONTRATO À COLUNA.** `Indicador.valor: number | null` com
    `indisponivel_porque` obrigatório; um CHECK no banco exige a mesma coerência; e a tela
    escreve **"não medido" com o motivo**, nunca "—" e nunca "0". É a invariante 1 da Dieta
    subida ao nível do contrato e descida até o pixel.
66. **`temporal.ts` AGREGA, NUNCA RECALCULA** — ele não importa `resumoMes`, `metrics.ts` nem
    `calc.ts`. Cinco recusas, cada uma herdada de uma invariante já paga: janela incompleta
    (Dieta 21), sem período anterior (Treinos 21), base zero (**nunca `Infinity`, nunca
    `NaN`**), ponto parcial contaminando o agregado, e **unidades diferentes não se comparam**
    (Treinos 1 aplicada ao tempo).
67. ⛔ **A CONFIANÇA É DO SERVIDOR, E O CAMPO NÃO EXISTE NO SCHEMA DE SAÍDA DO MODELO.**
    Irrepresentável vence recusado: uma recusa é um `if` que alguém remove, um campo ausente é
    uma mudança de schema que ninguém faz sem perceber. `confidence.ts` declara `rebaixar` e
    **`promover` não existe**. Invariante 57 da 18-D, aplicada a outro objeto.
68. ⛔ **A DEDUPLICAÇÃO ACONTECE ANTES DA CHAMADA.** Deduplicar depois cumpriria a letra do
    critério e faria o dono pagar por respostas que o sistema jogaria fora. A chave sai dos
    INDICADORES; `tipo` **não entra nela**, porque é escolha do modelo e só existe depois.
69. **O VOCABULÁRIO PROIBIDO É DECLARADO UMA VEZ, EM MÓDULO NEUTRO** (`src/lib/tone/`), e a
    checagem **roda em produção**. Nas 16-F/17-F o texto sai de função pura e um teste basta;
    aqui ele vem do modelo em runtime, e a suíte deixa de ser a última linha de defesa.
70. **NENHUM ESTADO DE INSIGHT É GRAVADO** (invariante 35 aplicada aqui). `vigente`,
    `expirado`, `dispensado`, `adiado` e `oculto` saem de `expires_at` +
    `ai_insight_feedback`, com precedência **decisão do dono > prazo** — nos dois sentidos.
71. ⛔ **EXPIRAR NÃO APAGA.** O insight sai da lista de vigentes e do card, e continua legível
    com os números que ele tinha — eles são snapshot.
72. **A QUARTA FORMA DE `origem` É `insight`**, e `insight_id` **não entra no hash**: quem o
    protege é a FK composta. Restrito a `criarTarefaTodo`, e a trava é a **ausência** de campo
    `command` no schema da action.

### Números reconferidos no banco e na suíte (2026-08-09)

| Medida | Antes | Depois |
| --- | --- | --- |
| Tabelas no `public` | 126 | **129** |
| Tabelas `ai_*` | 14 | **17** |
| Testes / arquivos | 3.219 / 159 | **3.347 / 164** |
| Itens em `AI_SECTIONS` | 6 | **7** |
| Cards em `DASH_CARD_IDS` | 10 | **11** |
| Formas de `ai_action_proposals.origem` | 3 | **4** |
| Espécies de `ai_runs.kind` | 2 | **3** |
| Ferramentas · commands · agentes | 29 · 13 · 9 | **inalterados** |

Verificação: `lint` · `tsc --noEmit` · `test:run` · `build` · `TZ=UTC vitest run` — verdes.
Smoke: `/ia/insights` → **307** para `/login`; `/api/cron/notifications` → **401** sem o
secret. `get_advisors` sem lint novo sobre as tabelas desta subfase.

---

## ✅ 18-D CONCLUÍDA (2026-08-09) — IA · Visão, documentos e comprovantes

**Desenho validado com o dono em 2026-08-08:**
`docs/superpowers/specs/2026-08-08-18d-visao-comprovantes-design.md`. Os **cinco blocos**
fecharam, e o pipeline anda de ponta a ponta: **enviar → ler → revisar → propor → confirmar**.

O que a subfase mudou de natureza: até a 18-C o pior caso de um defeito era a IA alterar um
registro do dono — reversível. Aqui ele passou a ser **um documento dele saindo deste sistema
para uma empresa fora dele, e não voltando**. Nenhum `undo`, nenhum Approval Engine e nenhuma
FK composta alcançam um arquivo já transmitido. Por isso a decisão de enviar é do dono,
explícita, e vive numa chave própria (`allow_vision`, ANDada com `allow_finance` e
`allow_write_finance` — na tela, na Server Action **e** dentro do RPC).

**Os três processos, separados de propósito** — é o que torna dois critérios verdadeiros *por
construção*, em vez de checagens que alguém esquece de escrever:

| Processo | O quê | O que ele NÃO pode fazer |
| --- | --- | --- |
| 1 · Envio | `sniffMime` sobre os bytes, bucket privado, `ai_documents` | **Nenhuma chamada externa acontece** — ele não tem para onde mandar nada |
| 2 · Extração | `extraction-runner.ts`, run próprio sem conversa, `generateObject`, Zod `.strict()`, rebaixamento | **Não alcança módulo do dono** — não importa `approval/`, não conhece serviço nenhum |
| 3 · Revisão e ação | tela + Approval Engine da 18-C | Mesmo hash, mesmos 10 min, mesmo uso único, mesma revalidação. **Sem atalho** |

**Medido em 2026-08-09:** **126 tabelas** no `public`, **14 `ai_*`**; **3.219 testes / 159
arquivos**; **29 ferramentas** (22 leitura + 7 escrita), **13 commands**, **9 agentes** — a
18-D **não acrescentou ferramenta nem command**, de propósito: o comprovante não é uma
ferramenta que o modelo possa pedir, é uma tela que o dono opera. `lint`, `tsc`, `build` e
`TZ=UTC` limpos; smoke conferido (rota privada → 307 `/login`, `/api/cron/*` → 401).

**Nenhuma migration foi criada nesta etapa** — as duas da 18-D (`20260813100000_ai_documents`
e `20260813100100_ai_document_extractions`) já estavam aplicadas. `get_advisors` continua com
**um único lint**, o `auth_leaked_password_protection` (botão do painel de Auth, sem migration
que o resolva) — nenhum lint novo sobre tabela do projeto.

## Estado
As 14 fases do roadmap original e a **Fase 15 (Módulo TO-DO)** estão concluídas. Em
**2026-08-03** o usuário abriu **duas frentes de módulo grande, que convivem**:

| Fase | Módulo | Subfases | Situação |
| --- | --- | --- | --- |
| **16** | Dieta e Alimentação (`/nutricao`) | A–F | ✅ **FASE CONCLUÍDA** (16-A a 16-F). Em manutenção/iteração |
| **17** | Treinos (`/treinos`) | A–F | ✅ **FASE CONCLUÍDA** (17-A a 17-F). Em manutenção/iteração |

Em **2026-08-04**, com as duas fechadas, o usuário abriu a **Fase 18 — Inteligência Artificial**:

| Fase | Módulo | Subfases | Situação |
| --- | --- | --- | --- |
| **18** | Inteligência Artificial (`/ia`) | A–F | ✅ **CONCLUÍDA (2026-09-20).** 18-A ✅, 18-B ✅, 18-C ✅, 18-D ✅ e **18-E ✅ COMPLETA (2026-08-09, quatro blocos)** — leitura dos 9 módulos, Approval Engine, 7 ferramentas de escrita, 13 commands, tela de ações com desfazer, comprovantes por visão, **insights sobre grandezas derivadas** (texto sem dígito, número por token) e o **job automático** que os gera 1×/dia. Tudo atrás de chaves que nascem desligadas. **18-F ✅ COMPLETA (blocos 1 a 5): Bloco 1 ✅ (2026-09-19)** — a IA entra no sino, na busca global, no backup e ganha exclusão em massa, sem migration; **Bloco 2 ✅ (2026-09-20)** — botão flutuante na casca com painel sob demanda, 2 colunas; **Bloco 3 ✅ (2026-09-20)** — memória: 2 tabelas, a 8ª ferramenta de escrita, o 15º command, `/ia/memoria`, e `allow_memory` finalmente ligando alguma coisa; **Bloco 4 ✅ (2026-09-22)** — três panoramas de um clique com leitura DIRIGIDA pelo servidor, a 4ª espécie de `ai_runs.kind`, o modo Caixa de entrada e `allow_cross_module` ligando alguma coisa — **sem tabela, sem rota e sem endpoint novos**; **Bloco 5 ✅ (2026-09-20)** — suíte de evals estrutural com os oito casos do briefing (que encontrou e consertou um defeito real no roteamento), o caso destrutivo afirmado sobre o registry e a **validação item a item dos 163 critérios** da fase em `docs/phases/PHASE_18_CRITERIOS_VALIDADOS.md`. **FECHA A FASE 18 — não há 18-G** |

> ⚠️ As duas fases compartilham repositório e banco. Ao editar `PROJECT_ROADMAP.md`,
> `CURRENT_STATUS.md`, `NEXT_AGENT_INSTRUCTIONS.md`, `src/types/supabase.ts` e `src/config/nav.ts`,
> **leia antes e edite de forma pontual** — sobrescrever leva embora o trabalho da outra frente.
>
> ✅ **PONTO DE CONTATO CUMPRIDO (2026-08-04):** as medidas corporais `body_*` foram
> **CRIADAS pela 16-E** e a **17-E CONSOME** — lê e escreve por `src/lib/body/queries.ts` e
> `src/lib/actions/body-measurements.ts`, e **não criou tabela nenhuma**. Conferido no banco
> depois da 17-E: **4 tabelas `body_*`**, e a única coluna de peso corporal fora delas é
> `training_sessions.body_weight_kg` — o peso USADO naquele treino, congelado (17-C), que não
> é histórico de medida. Nunca duas tabelas de peso corporal.

## Fases atuais
- **Fase 17-F — Treinos · Integrações, notificações, resiliência e polimento → CONCLUÍDA ✅**
  Arquivo: `docs/phases/PHASE_17_F_TRAINING_INTEGRATIONS_POLISH.md`
  **Ela FECHA a Fase 17:** os 55 critérios de aceite gerais foram validados um a um —
  **55 de 55 atendidos** (veredito item a item em `docs/handoff/LAST_PHASE_SUMMARY.md`).
  Com a Fase 16 também fechada, **o projeto inteiro volta ao modo manutenção/iteração**.
- **Fase 16-F — Dieta e Alimentação · Integrações, notificações e polimento → CONCLUÍDA ✅**
  Arquivo: `docs/phases/PHASE_16_F_NUTRITION_INTEGRATIONS_POLISH.md`
  **Ela FECHA a Fase 16:** os 40 critérios de aceite gerais foram validados um a um —
  **40 de 40 atendidos** (o veredito item a item está em `docs/handoff/LAST_PHASE_SUMMARY.md`).
- **Fase 17-E — Treinos · Metas, medidas corporais compartilhadas e dashboards → CONCLUÍDA ✅**
  Arquivo: `docs/phases/PHASE_17_E_TRAINING_GOALS_DASHBOARDS.md`

## Próximas fases

**Fase 18-C — IA · Ações, aprovações, idempotência e auditoria.**
Desenho validado: `docs/superpowers/specs/2026-08-04-modulo-ia-design.md`

A **18-A** (2026-08-04) entregou a fundação inteira — contratos internos, quatro adapters,
catálogos versionados, credenciais cifradas, chat com streaming, medição por tentativa e
orçamento com reserva — **sem que a IA leia um único registro**. Essa ordem foi proposital: a
camada de segurança precisava existir, estar testada e ser difícil de furar **antes** da
primeira leitura. A **18-B** (2026-08-07) fez essa primeira leitura, com três ferramentas de
Treinos e nada mais.

A **18-C é a primeira subfase de ESCRITA**, e muda a natureza do risco: até aqui o pior caso
de um defeito era a IA dizer um número errado; a partir dela, é a IA **alterar um registro**.
A primeira entrega dela, porém, não era a escrita — era a **matriz de ferramentas de LEITURA**
dos 7 módulos restantes, replicando o molde de Treinos. **Essa parte está concluída**
(2026-08-07): os Blocos 1–2 levaram o registry a **22 ferramentas de leitura** e **9 agentes**,
e os nove módulos do sistema são consultáveis, cada um atrás da sua flag `allow_*`. *Com as
escritas do Bloco 4, o registry passou a ter **29 ferramentas — 22 de leitura e 7 de escrita**
(contado em 2026-08-08).*

✅ **O gate da escrita foi autorizado pelo dono em 2026-08-07, e o Bloco 3 (Approval Engine)
está concluído** — mas **nenhuma escrita é possível ainda**, e isso é o desenho, não uma
pendência. O motor inteiro existe: 3 tabelas novas (`ai_action_proposals`,
`ai_action_approvals`, `ai_action_executions`), hash canônico do EFEITO, prazo de 10 minutos
vindo do banco, uso único por índice, revalidação por recálculo, e as cinco chaves
`allow_write_*`. O que impede a escrita são **três travas independentes**: nenhum descriptor
`kind: "escrita"` no registry, as cinco chaves nascendo `false`, e o **registry de commands
VAZIO** em `src/lib/ai/approval/execute.ts` — exatamente como o Tool Registry nasceu vazio na
18-A. Uma proposta íntegra, confirmada e no prazo para em `COMMAND_DESCONHECIDO`, sem sequer
reservar vaga de execução.

✅ **A 18-C ESTÁ CONCLUÍDA (2026-08-08).** Os seis blocos fecharam: leitura dos nove módulos
(1–2), Approval Engine (3), commands e escrita (4), **tela "Ações realizadas pela IA" com
desfazer (5)** e documentação + verificação final (6). Decisões em
`docs/superpowers/specs/2026-08-07-18c-acoes-aprovacoes-design.md`; matriz em
`docs/phases/PHASE_18_C_MATRIZ_DE_FERRAMENTAS.md`.

| Subfase | Tema | Status |
| --- | --- | --- |
| 18-A | Fundação, provedores e chat | ✅ **CONCLUÍDA** (2026-08-04) |
| 18-B | Contexto, ferramentas de leitura e agentes | ✅ **CONCLUÍDA** (2026-08-07) |
| 18-C | Ações, aprovações, idempotência e auditoria | ✅ **CONCLUÍDA** (2026-08-08) — blocos 1 a 6 |
| 18-D | Visão, documentos e comprovantes | ✅ **CONCLUÍDA** (2026-08-09) — blocos 1 a 5 |
| 18-E | Insights, relatórios e dashboards | ✅ **CONCLUÍDA** (2026-08-09) — blocos 1 a 4 |
| 18-F | Memória, integrações e polimento | ✅ **CONCLUÍDA (2026-09-20) — blocos 1 a 5.** Bloco 1 (costura: sino, busca, backup, exclusão em massa) · Bloco 2 (botão flutuante) · Bloco 3 (memória) · Bloco 4 (experiências) · Bloco 5 (suíte de evals + validação item a item dos 163 critérios). **FECHA A FASE 18 — não há 18-G** |

As frentes 16 (Dieta) e 17 (Treinos) continuam **concluídas e em manutenção/iteração**:
melhoria nelas entra como tarefa avulsa, com branch própria, e não como subfase. As pendências
conscientes de cada uma estão em `docs/handoff/NEXT_AGENT_INSTRUCTIONS.md`.

### Decisões técnicas registradas da Fase 18 (antes de implementar)

1. **Rota `/ia`, tabelas `ai_*`** — convenção do projeto (rota pt-BR, schema em inglês).
2. **A IA nunca acessa o banco diretamente.** Camada controlada de ferramentas; o modelo pede,
   o backend valida e executa. Sem SQL livre, sem `service_role`, sem ferramenta em runtime.
3. **`user_id` sempre de `authContext()`** — não existe nos schemas de entrada das ferramentas.
4. **Vercel AI SDK isolado em `src/lib/ai/providers/`**; `core/` e o resto dependem só de
   contratos internos. Fronteira garantida por ESLint, `server-only` e teste.
5. **Envelope encryption AES-256-GCM** com AAD e keyring versionado (`AI_MASTER_KEYS`); a
   master key nunca entra no banco.
6. **Streaming por Route Handler `/api/ia/chat`** — segunda exceção estrutural ao padrão Server
   Action (a primeira foi o auth). Transporte apenas; não autoriza outros endpoints.
7. **`ai_usage_events` é por tentativa**, não por run — retry e fallback têm tarifas próprias.
8. **O run é reserva financeira temporária**, e seu início é atômico numa função
   `SECURITY INVOKER` com advisory lock por usuário.
9. **Commands extraídos sob demanda na 18-C**, só para as actions que a IA usar. Nenhuma regra
   de negócio é reescrita; `revalidatePath` fica na casca da Server Action.
10. **Recuperação de run abandonado é preguiçosa (primária) + carona no Cron (rede).** O Cron
    existente roda `0 12` e `0 0` (09h e 21h BRT): **pior caso de 12 h**, registrado como risco.

---

## Melhoria 2026-08-06 — saldo por dia na lista de lançamentos (extrato)

`/financeiro/lancamentos` deixou de ser uma pilha plana: agora é **agrupada por dia**, com o
saldo do fim de cada dia no cabeçalho — como o extrato do banco. Desenho completo em
`docs/superpowers/specs/2026-08-06-saldo-diario-lancamentos-design.md`.

**As quatro decisões que valem lembrar:**

1. **O saldo é de CONTA. Cartão não entra.** Compra de cartão não tem `account_id` e não move
   dinheiro; quem move é o pagamento da fatura (`transferencia` com destino nulo). Com filtro de
   cartão ligado o cabeçalho mostra só a data — **ausência de saldo, não saldo zero**.
2. **O saldo ignora os filtros de categoria/tipo/status, de propósito.** A lista encolhe, o saldo
   continua verdadeiro. Por isso `getDailyBalances` busca a própria janela em vez de somar as
   linhas que a tela recebeu.
3. **Mesma regra de `account_balance`:** só `pago`/`recebido` entram, então o extrato bate com o
   saldo de `/financeiro/contas` e com o card "Saldo total". A tabela de sinais existe em dois
   lugares (`account_balance_before` no SQL, `efeitoNoSaldo` no TS) — os dois se citam em
   comentário, e o cruzamento das duas sobre julho/2026 (138 lançamentos, 29 dias) bateu em todos.
4. **Sem `Date` em data pura.** O agrupamento compara `'yyyy-MM-dd'` como texto; só o rótulo do
   cabeçalho (`diaExtenso`) constrói data de grade local.

**Verificação:** 2397 testes, lint, tsc e build. ⚠️ **A tela não foi aberta na aplicação
rodando** (atrás do login, sem sessão disponível) — vale um clique antes de dar por fechado.

---

## Correção 2026-08-04 — a busca travava ao digitar, e o padrão estava em 5 telas

**Sintoma relatado (Treinos):** digitar na busca "fica travando tudo e não sai o que digito,
fica com delay". Junto vieram outros dois: filtrar por grupo muscular ao **adicionar exercício
ao treino** trazia também os secundários, e escolher **alternativa/substituto** não tinha como
digitar — só rolar o catálogo inteiro.

**Causa do travamento, estrutural e não de uma tela só:** o campo era um input controlado cujo
`value` vinha da **URL**. Cada tecla chamava `router.replace` e, como as páginas de módulo são
`force-dynamic`, o Next buscava o RSC no servidor; o `searchParams` — e portanto o valor do
campo — só voltava quando a resposta chegava. Digitando rápido, caractere se perdia.

Estado de filtro na URL é o padrão do projeto e continua certo — mas vale para **clique**
(select, toggle, aba), **não para digitação**.

Atingia **5 telas**, em dois módulos: `treinos/exercicios`, `treinos/treinos`,
`treinos/programas`, `treinos/historico` e `nutricao/alimentos`.

**Correção:**
- `src/lib/forms/use-url-text.ts` (`useUrlText`): o texto responde local e alcança a URL depois
  de 300 ms de pausa, preservando link, botão voltar e recarregar.
- `src/lib/forms/url-text-sync.ts` (puro, testado): decide quando o campo adota o valor da URL.
  **Um furo pego pelo teste antes de ir para produção** — se o usuário seguisse digitando
  enquanto a gravação anterior estava em voo, o eco atrasado devolvia o texto antigo ao campo,
  exatamente o bug que a correção existe para eliminar. Por isso a decisão compara também com o
  último valor que nós mandamos gravar, distinguindo **eco próprio** de **mudança externa**
  (limpar filtros, voltar).
- `exercisePickerFilters` (`src/lib/training/filters.ts`): o picker do treino filtra pelo grupo
  **PRINCIPAL**. Ele espalhava `EMPTY_EXERCISE_FILTERS`, cujo padrão é `includeSecondary: true`,
  e não tem o toggle que o catálogo tem — não havia como desligar. A decisão virou função
  nomeada e testada em vez de um flag solto dentro do JSX.
- `src/components/training/exercise-search-picker.tsx`: escolher alternativa/substituto passa a
  ter busca, reusando `matchesSearch` da 17-A (nome, apelido, grupo, equipamento, termos em
  qualquer ordem) — a mesma busca do catálogo, não um segundo mecanismo.

A regra está registrada no `CLAUDE.md` ("campo de TEXTO nunca é controlado pelo valor da URL").

**Verificação:** testes, lint, tsc, build e smoke test de rota em produção. ⚠️ **As três telas
não foram exercitadas na aplicação rodando** — estão atrás do login e não havia sessão
disponível; vale um clique antes de considerar 100% fechado.

---

## O que foi implementado nos Blocos 5 e 6 da 18-C (a tela de ações e o desfazer) — 2026-08-08

**A 18-C fecha aqui.** O Bloco 4 deu à IA o poder de preparar alterações; o Bloco 5 deu ao dono
o lugar onde ver o que foi feito com os dados dele — e desfazer, quando existe inverso.

| Entrega | O que é |
| --- | --- |
| Tela `/ia/acoes` | 5º item da navegação do módulo, **antes** de "Consumo": o que a IA fez importa mais que quanto custou |
| `approval/history.ts` (puro) | Une as três fontes, deriva o estado de cada linha com `agora` injetado e decide a disponibilidade do desfazer |
| `approval/queries.ts` | Três consultas, só em `ai_*`, com teto **declarado na tela** (100) |
| `approval/undo.ts` + `prepararDesfazerDaIa` | Prepara a proposta do inverso. **Não desfaz nada** |
| 1 migration | `ai_action_proposals` ganhou `origem` + `undoes_execution_id`. **Nenhuma tabela nova** |
| Contrato `ComoDesfazer` | Substituiu `undo: string \| null` no descriptor do command |

### ⛔ A decisão central do bloco: o desfazer PASSA PELO MESMO MOTOR

O botão não desfaz — ele **propõe**. Clicar em "Desfazer" grava uma linha em
`ai_action_proposals`, mostra a previsão do inverso e espera a confirmação; quem executa é
`confirmarAcaoDaIa`, a mesma porta de qualquer outra alteração, com o mesmo hash, o mesmo prazo
de 10 minutos, o mesmo uso único e a mesma revalidação. Um desfazer de um clique só seria a
única escrita do sistema sem o dono ler o que vai acontecer — e o inverso não é inofensivo: ele
exclui tarefa, apaga registro de diário e cancela compromisso que já foi para o Google.

### A migration, e por que ela afrouxa três colunas sem afrouxar a garantia

`ai_action_proposals` exigia `conversation_id`, `run_id` e `tool_call_id` — porque toda proposta
nascia de uma tool call. A proposta de desfazer não nasce: ela vem do botão. E ela **não pode**
depender da conversa continuar existindo, porque `ai_action_executions` foi deixada sem FK
justamente para sobreviver à exclusão dela (invariante 38): o dono veria a execução na tela e o
botão de desfazer dela pararia de funcionar, sem nada no desenho explicando por quê.

As três colunas passaram a ser opcionais **na coluna** e obrigatórias **no CHECK**:
`ai_action_proposals_origem_coerente` exige cada uma das duas formas por inteiro
(`origem='ferramenta'` ⇒ as três presentes e `undoes_execution_id` nulo; `origem='desfazer'` ⇒
o contrário). "Proposta de ferramenta sempre nasce de uma tool call" continua provado pelo banco.

### `ComoDesfazer`: uma união, e não dois campos opcionais

O descriptor dizia `undo: string | null`. Com a explicação do "por que não há" num campo ao
lado, o estado *"sem desfazer e sem explicação"* seria representável — e a tela esconderia o
botão em silêncio, que é exatamente o que a §3.7 proíbe. Agora:

```txt
{ kind: "command", command, payload: (fatos) => ValorCanonico | null }   ou
{ kind: "nao-ha", porque: string }
```

`isCommandCoherent` recusa inverso inexistente, inverso apontando para si mesmo e "não há" sem
motivo. E `payload` é PURO: ele monta a entrada do inverso a partir de `target_id` +
`changed_fields` — nunca do payload original, que some com a conversa.

> ⚠️ **O acoplamento que ninguém veria:** `desfazerHabito` precisa do DIA, e o dia só chega até
> ele porque `log_date` está na allowlist §3.6 de `registrarHabito`. Tirá-lo de lá "por ser
> detalhe de auditoria" quebraria o botão — em runtime, e só no clique. Há teste sobre isso.

### O que a tela se recusa a fazer

- **Não chama de sucesso nem de falha uma execução `executando`.** Ela reservou a vaga e não
  registrou o desfecho (claim-first do Bloco 3): o rótulo é *"sem desfecho registrado"*, a linha
  fica em "Precisam de atenção" — **nunca** em "Aplicadas" — e o desfazer é recusado com o
  motivo escrito.
- **Não esconde execução cuja conversa foi apagada.** Ela aparece marcada como *sem trilha*.
  Omiti-la desfaria, na prática, a decisão de não pôr FK em `ai_action_executions`.
- **Não esconde o botão sem dizer por quê** — a explicação vem do descriptor do command.
- **Não vai buscar o registro atual no módulo** para "enriquecer" a linha: mostra-se o que a
  ação FEZ, não o estado de agora. `approval/` continua tocando só `ai_*`.
- **Não apresenta a janela como "tudo":** com 100 linhas, declara o teto.

### O texto datado que envelheceu pela terceira vez (Bloco 6)

`AVISO_SEM_ACESSO` dizia que a chave de escrita *"hoje existe só para o TO-DO"*. Isso já nasceu
falso: o mesmo commit do Bloco 4 publicou escrita em cinco módulos. O teste que existia cobria
só a metade de LEITURA da frase. Agora a enumeração da ESCRITA também é derivada do registry
(`toolsForWritePermission` + `Intl.ListFormat` em pt-BR): publicar a primeira escrita de outro
módulo deixa a suíte vermelha até o aviso citá-lo.

### Verificação (Blocos 5 e 6)

`npm run lint` ✅ · `npx tsc --noEmit` ✅ · `npm run test:run` ✅ **145 arquivos / 3.019 testes** ·
`TZ=UTC npx vitest run` ✅ · `npm run build` ✅ · smoke (rotas privadas → 307 `/login`,
`/api/cron/*` → 401) ✅ · `get_advisors` sem lint novo (só o `auth_leaked_password_protection`
pré-existente, que é botão de painel). **Duas mutações confirmadas por md5**: inverter a
precedência de `derivarEstadoDaProposta` (9 testes vermelhos, incluindo a execução órfã virando
"expirada") e tirar `data` da montagem do desfazer do hábito (o Zod do inverso recusou).

**O total de tabelas no `public` continua 124** — a migration só acrescentou colunas.

---

## O que foi implementado no Bloco 4 da 18-C (a IA passa a ESCREVER) — 2026-08-07

**É a primeira vez que a IA altera dado real do usuário.** Sete ações, na ordem crescente de
risco que a matriz fixou, cada uma com teste de equivalência contra o formulário.

| Entrega | O que é |
| --- | --- |
| 7 ferramentas de escrita | TO-DO (3), Hábitos, Agenda, Dieta, Financeiro — todas `requiresConfirmation` |
| 13 commands | 7 de ação + 6 de **desfazer**, estes últimos **sem ferramenta** |
| 5 `services.ts` extraídos | `todo`, `habits`, `calendar`, `nutrition`, `finance` — a action virou casca |
| 1 migration | `todo_completions.completion_source` passou a aceitar `'ia'` (nenhuma tabela nova) |
| Cartão de proposta na tela | previsão campo a campo, prazo, confirmar/recusar e desfazer |
| 5 chaves `allow_write_*` | todas `false` no banco, e cada uma **ANDada com a chave de leitura** |

### ⛔ A decisão central do bloco: O RUN NÃO ALCANÇA UMA FUNÇÃO QUE ESCREVE

O Bloco 3 garantiu isso provando que nada em `src/lib/ai/` importa `approval/execute.ts`.
O Bloco 4 quase derrubou a garantia: propor exige `parse` e `prever`, que moram no command —
e importar o objeto `Command` inteiro no Tool Executor faria o laço **segurar** `executar`.
A garantia teria caído de *"não alcança"* para *"não chama"*, que é uma convenção.

**Cada command é partido em dois arquivos.** `<modulo>-preview.ts` só lê; `<modulo>.ts`
escreve. O executor importa `commands/previews.ts`, um registry deliberadamente mutilado em
que nenhuma entrada tem `executar`. Três testes de fronteira, todos com mutação confirmada:

1. a partir de `tools/`, o único arquivo de `commands/` alcançável é `previews.ts`;
2. nenhum `*-preview.ts` importa um módulo `services` (onde a escrita vive);
3. `.executar(` aparece em **um** arquivo do repositório: `approval/execute.ts`.

### As decisões que a implementação obrigou a tomar

| Decisão | Por quê |
| --- | --- |
| **Extrair a função INTEIRA**, não o pedaço que a IA usa | `criarTransacao` sabe fazer transferência, cartão e divisão; quem restringe é o **schema da ferramenta**. Uma versão simplificada seria a segunda implementação do insert, e divergiria no primeiro campo novo. |
| **Resolver o efeito DE NOVO na execução, a partir dos nomes** | O payload guarda o que o dono disse ("arroz", "Nubank"), não ids. É o que dá sentido à revalidação por hash: se o nome passou a casar com outro registro, o hash diverge e nada é gravado. |
| **Nome ambíguo RECUSA** | "arroz" casa com o branco e o integral, que têm nutrientes diferentes. Escolher o primeiro registraria em histórico imutável uma comida que o dono não citou. |
| **A previsão é o cálculo REAL** | Em Dieta, o snapshot mostrado sai da mesma função que grava — e nutriente ausente aparece como *"não informado na fonte"*, nunca zero. Em Financeiro, a fatura sai de `resolverFatura`. |
| **`externo`, a 4ª sensibilidade** | As três primeiras dizem o que o efeito toca; nenhuma dizia **onde ele para**. Com o Google conectado, o compromisso sai do sistema — e é o único efeito que não se desfaz mexendo só no nosso banco. |
| **Fatura já PAGA recusa o lançamento** | A única restrição que o formulário não tem. Lá o dono está olhando a tela da fatura; aqui o pedido veio em linguagem natural sobre uma fatura que ele nem citou. |
| **O evento `switch` limpa as propostas da tela** | Fallback de provedor reinicia o laço e cria uma **segunda** proposta. Dois cartões, e confirmar os dois criaria duas tarefas — o uso único não impede, porque são propostas distintas. |

### Dois defeitos que teriam aparecido só em produção

- **`completion_source` não aceitava `'ia'`.** O CHECK da Fase 15 tinha cinco valores;
  `concluirTarefaTodo` grava com `source: 'ia'` e falharia com `23514` **depois** de o dono
  confirmar. Migration aditiva aplicada e conferida no banco.
- **`approval/` abriu client e consultou tabela de módulo.** A primeira versão de
  `finance-preview.ts` fazia `select` em `credit_cards`, `card_statements` e `transactions`.
  O teste de fronteira pegou; as três leituras nasceram em `finance/queries.ts`.

### Verificação (Bloco 4)

`npx tsc --noEmit` ✅ · `npm run lint` ✅ · `npx vitest run` ✅ **143 arquivos / 2.952 testes** ·
`TZ=UTC` ✅ · `npm run build` ✅. **12 mutações confirmadas por md5 antes de acreditar no
vermelho**; duas delas ficaram **verdes** e revelaram lacuna real de teste (a recusa por nome
ambíguo e a recusa por fatura paga) — as duas regras foram extraídas para função pura e
cobertas, e a mutação repetida ficou vermelha.

---

## O que foi implementado na Subfase 18-B (contexto, leitura e agentes) — 2026-08-07

**A 18-B é a subfase em que a IA passou a ler dado real do usuário** — três ferramentas, todas
de Treinos, todas de leitura. Nenhuma escrita existe, e o guard recusa por
`TOOL_WRITE_DISABLED`.

| Entrega | O que é |
| --- | --- |
| 3 ferramentas de Treinos | último treino, totais do período, recordes — reusando os serviços que as telas já usam |
| Laço de ferramentas próprio | as definições vão ao provedor **sem `execute`**; quem valida e executa é o Tool Executor |
| Roteamento por agente | `routeAgent` escolhe por texto ou contexto de página; a flag `allow_*` vence sempre |
| Contexto de página | só a ROTA, de lista estática; o módulo é resolvido no servidor |
| Auditoria por chamada | `ai_tool_calls` + `ai_run_steps` (2 tabelas novas) |
| Rastreabilidade na tela | chips por resposta, com "Ver dados usados" abrindo os registros |
| 9 chaves de autorização | `/ia/configuracoes`; todas nascem desligadas |

### As decisões que valem para as próximas subfases

**A IA nunca decide o que pode ler.** O modelo pede; o backend valida contra um registry
estático, com allowlist por agente, e só então executa. `user_id` vem sempre de
`authContext()` — não existe nos schemas de entrada, e `.strict()` recusa campo a mais.

**A auditoria guarda o PEDIDO, nunca o RESULTADO.** Gravar o conteúdo devolvido seria uma
segunda cópia dos dados pessoais dentro do módulo de IA. Consequência que a tela respeita: ela
**não afirma** nem que o dado estava completo nem que estava incompleto, porque não tem como
saber — e diz isso em vez de fingir.

**Todo texto que descreve o que a IA não faz é datado.** O prompt-base da 18-A mandava o
assistente afirmar que não consultava registro nenhum; isso virou mentira no instante em que
as leituras de Treinos entraram no registry. Corrigido em `seguranca-v2`, e o aviso da tela
junto. Os textos de agora afirmam a **regra** (nada é lido sem autorização por módulo, e não
há escrita), não o estado — para não vencerem de novo.

**O contexto da página é só o endereço.** A tela não manda conteúdo: nem HTML, nem título, nem
estado, nem texto de registro. Se pudesse, o que está na sua tela viraria entrada do modelo sem
passar pelo bloco de dado não confiável, que é a defesa central da subfase.

### Verificação

`npm run lint` ✅ · `npx tsc --noEmit` ✅ · `npm run test:run` **2.512 testes / 121 arquivos** ✅ ·
suíte verde também em **`TZ=UTC`** ✅ · `npm run build` ✅.
Smoke: rotas privadas → 307 `/login`; `/api/cron/*` sem segredo → 401.

⚠️ **Limite da verificação:** o chat **não foi exercitado com credencial real de provedor** —
exige chave e `AI_MASTER_KEYS`. E o projeto **não tem infraestrutura de teste de componente**
(`environment: "node"`, zero `.test.tsx`), então a fiação da tela é verificada por varredura do
código-fonte, não por DOM.

---

## O que foi implementado na Subfase 18-A (fundação, provedores e chat) — 2026-08-04

A 18-A **para antes de encostar nos dados**, de propósito. O risco desta subfase nunca foi a
IA responder mal: foi **vazar chave de API**, **estourar orçamento** e **deixar registro
inconsistente** — três coisas que nenhum prompt melhor conserta. Um módulo de IA que nasce com
acesso aos dados e ganha segurança depois nunca fica seguro.

### Banco — 7 tabelas `ai_*`, 2 funções, 0 tabelas existentes alteradas

`ai_provider_configs` · `ai_provider_credentials` · `ai_user_preferences` ·
`ai_conversations` · `ai_messages` · `ai_runs` · `ai_usage_events`.
Migrations `20260807100000_ai_foundation.sql` (estrutura) e `20260807100100_ai_begin_chat_run.sql`
(admissão atômica + reconciliação). `get_advisors` → **nenhum lint novo**.

### As sete decisões que a implementação fixou

1. **A chave de API nunca é gravada em claro.** Envelope AES-256-GCM: uma DEK por credencial,
   embrulhada pela master key do ambiente. A master key **não está no banco e nunca estará** —
   quem lê `ai_provider_credentials` inteira não decifra nada. O AAD
   (`credential_id | owner_id | provider | key_version`) amarra o ciphertext à linha: movê-lo
   para outro dono, outro provedor ou outra credencial **falha**, em vez de decifrar em
   silêncio. Rotação re-embrulha só a DEK; duas versões coexistem durante ela.
2. **A admissão é ATÔMICA e o commit acontece ANTES de qualquer chamada externa.**
   `ai_begin_chat_run` (`SECURITY INVOKER`, `SET search_path = ''`,
   `pg_advisory_xact_lock` por usuário, `lock_timeout 3s`) reconcilia reservas vencidas, valida
   rate limit e orçamento, cria conversa + mensagem do usuário + run + mensagem do assistente —
   tudo ou nada. **Nenhum lock e nenhuma transação ficam abertos durante o streaming.** Timeout
   do lock vira **429**, não 500: não houve falha, houve concorrência.
3. **O run é uma RESERVA FINANCEIRA.** `consumo = Σ custo dos terminais + Σ reserva dos
   não-terminais não vencidos`, e todo run pertence a **exatamente um** dos dois somatórios.
   Sem isso, duas mensagens quase simultâneas leriam o mesmo gasto confirmado e as duas
   passariam no limite. A reserva usa a tarifa do **modelo mais caro da cadeia de fallback
   autorizada**, porque o fallback não ganha segunda reserva.
4. **`ai_usage_events` é por TENTATIVA.** Retry e fallback criam linhas novas, cada uma com o
   seu `rate_snapshot`. Idempotência por `INSERT` + `23505` (não `select-then-insert`, que tem
   corrida). Tentativa terminal é **imutável** — a policy de UPDATE exige `status = 'started'`,
   então retificação de uso tardio é impossível no banco, não só no código.
5. **Ausência nunca é zero.** Provedor que não informa tokens produz `estimated_cost` **nulo**
   e `usage_availability` marcando o que faltou. O total de um run com alguma tentativa sem
   custo é exibido como **parcial**, nunca como se estivesse completo.
6. **Moeda canônica USD, sem câmbio.** Os quatro provedores publicam em USD; converter exigiria
   fonte de taxa, snapshot e versão — uma segunda fonte de verdade inteira para um número que
   **não é a cobrança oficial**. Custo de IA não é transação do usuário e **não entra** nos
   relatórios de finanças. Câmbio, se desejado, é 18-F.
7. **Fail-closed só para a IA.** Sem `AI_MASTER_KEYS` o resto do sistema funciona normalmente;
   apenas `/ia` fica indisponível, com a explicação na tela, e `/api/ia/chat` responde
   **503**. Chave curta **não** é completada com padding, senha humana **não** vira master key
   e versão ausente **não** é substituída em silêncio.

### Fronteiras arquiteturais — três mecanismos independentes

`core/`, `agents/`, `tools/`, `usage/` e `security/` não importam pacote de fornecedor; só
`providers/` importa `ai` e `@ai-sdk/*`. Garantido por **(1)** ESLint por zona, **(2)**
`server-only` (quebra o build) e **(3)** um teste de rede que varre import **estático e
dinâmico** — `no-restricted-imports` não enxerga `await import()`. Conferido também no bundle:
**nenhum vestígio de AI SDK ou de material criptográfico no JavaScript do cliente**.

⚠️ Achado durante a implementação: `patterns.group` do `no-restricted-imports` usa semântica de
**.gitignore**, não de caminho — o grupo `"ai"` bloqueava `@/lib/ai/**` inteiro. O pacote `ai`
passou para `paths` (casamento exato). Registrado no comentário do `eslint.config.mjs`.

### Trava de honestidade — critério de aceite, não boa vontade do modelo

> ⚠️ **O parágrafo abaixo descreve a 18-A e FOI SUPERADO PELA 18-B.** Ele fica aqui como
> registro histórico. O prompt-base foi reescrito (`seguranca-v2`) porque afirmar "não consulto
> registro nenhum" virou mentira quando a IA passou a ler Treinos — ver a seção da 18-B.

O assistente da 18-A **não consulta nenhum registro** e o prompt diz isso com todas as letras,
aponta o módulo onde o dado está e proíbe explicitamente inventar número (inclusive as duas
formas disfarçadas: "provavelmente uns R$ 300" e "assumindo que você gastou X"). A garantia
real, porém, é estrutural: **o Tool Registry nasce vazio**, nenhuma definição vai ao provedor,
e uma tool call inesperada encerra o run como `failed` com `UNEXPECTED_TOOL_CALL` — sem
executar nada.

### Verificação

`npm run lint` ✅ · `npx tsc --noEmit` ✅ · `npm run test:run` **2.129 testes** ✅ ·
suíte verde também em **`TZ=UTC`** ✅ · `npm run build` ✅.
RLS, atomicidade, anti-enumeração, unicidade `(run_id, attempt_index)`, imutabilidade da
tentativa terminal, FK composta, transições condicionais, recuperação e rate limit **testados
no banco pela role `authenticated`**, em transação com rollback — 28 asserções, todas verdes.

---

## O que foi implementado na Subfase 17-F (integrações, notificações e resiliência) — FECHA A FASE 17

As subfases 17-A a 17-E entregaram um módulo completo e **isolado**. A 17-F o costura ao resto
do sistema — busca global, lançamento rápido, notificações, dashboard geral, agenda, TO-DO,
Dieta e Hábitos — e fecha a Fase 17.

### ⛔ A decisão central da subfase: FONTE DE VERDADE DECLARADA

O risco da 17-F nunca foi técnico, foi de **duplicidade**: o mesmo treino podia virar tarefa no
TO-DO, evento na agenda, dia planejado no calendário e check-in de hábito — quatro registros da
mesma coisa, divergindo no primeiro esquecimento. A tabela abaixo é a resposta, e está
implementada, não só escrita:

| Informação | Fonte de verdade | Os outros módulos |
| --- | --- | --- |
| O treino aconteceu | `training_sessions` | O hábito "Treinar" **reflete** (`habit-sync.ts`); nunca há segundo registro |
| Está planejado para o dia | `training_scheduled_workouts` | Agenda e TO-DO são **espelhos opcionais**, com vínculo |
| Peso e medidas | `body_*` (16-E) | Dieta e Treinos leem/escrevem pelo MESMO serviço |
| Dia é de treino ou descanso | `training_scheduled_workouts` + sessões | A **Dieta consome** (`day-kind.ts`), não deduz sozinha |

### O que foi entregue

| Integração | Onde | Consome (nunca recalcula) |
| --- | --- | --- |
| Busca global — 6 entidades | `lib/search/queries.ts` + **`training-links.ts`** (puro, testado) | RLS por sessão; sessão vem do **nome congelado** |
| Lançamento rápido — iniciar treino | `lib/actions/training-quick-add.ts` | `createSession` + `startSession` (17-C) |
| Card no dashboard geral | `components/dashboard/general/training-card.tsx` | `metrics.ts` (17-D) via `dashboards.ts`/`goals.ts` (17-E) |
| 9 famílias de notificação | `lib/notifications/training.ts` (puro) + `training-cron.ts` (I/O) | `derivePlannedStatus`, `deriveGoalStatus`, `resolveGoals` |
| Espelho na agenda (opt-in) | `lib/training/{google-event,calendar-sync}.ts` + `training_calendar_sync` | contrato idêntico ao `todo_calendar_sync` (F15) |
| Pontes com o TO-DO | `lib/actions/training-integrations.ts` | `createTodoTask` (F15) |
| Hábito "Treinar" | `lib/training/{habit-reflection,habit-sync}.ts` + `training_preferences.habit_id` | as sessões concluídas do dia |
| Tipo de dia para a Dieta | `lib/training/day-kind.ts` + `day-kind-queries.ts` | consumido por `report-queries.ts` e pelo diário |

### Decisões técnicas registradas

1. **Nenhum tipo novo de "medição pendente".** A medida corporal é o módulo central `body_*`,
   e `nutrition_measurement_due` (16-F) já avisa sobre ela. Criar um irmão `training_*` daria
   **duas notificações para o mesmo peso não medido** — o oposto do que a subfase existe para
   evitar. O rótulo e a explicação foram ajustados para dizer que vale para as duas frentes.
2. **`training_goal_progress` nasce DESLIGADO** (`NOTIFICATION_OPT_IN_TYPES`). Avisar sem ser
   pedido sobre o quanto falta para a meta da semana é lido como cobrança — mesma decisão da
   `nutrition_goal_close` na Dieta, pelo mesmo motivo.
3. **O recorde é notificado a partir da MARCA, não do evento.** A chave é
   `training_record:{record_key}:{achieved_on}`: consolidar de novo o mesmo recorde não gera um
   segundo aviso, e uma marca nova no dia seguinte gera.
4. **`getSessionHistory` ganhou `client`/`userId` opcionais** em vez de o Cron reimplementar a
   leitura. Um segundo caminho para montar o histórico discordaria deste no primeiro campo novo
   — e o número da notificação deixaria de bater com o da tela.
5. **Ausência de dado continua não sendo zero.** Semana sem treino devolve volume `null` ("sem
   treino"), meta sem base devolve `null` ("sem base ainda"), e um dia sem planejamento e sem
   sessão **não** vira "descanso" para a Dieta.
6. **Deep-link que abre o registro**, não a lista: `?meta=`, `?programa=` e `?recorde=`
   destacam o item com âncora, anel e `aria-current` (e respeitam `prefers-reduced-motion`).

### ⚠️ A armadilha que só o teste no banco revelou (e a correção)

Pela role `authenticated`, um intruso conseguia inserir
`training_calendar_sync(user_id = ele, scheduled_workout_id = <dia planejado de outro>)`: a RLS
confere o `user_id` da **própria linha** e nada sabe sobre a linha apontada. Não vazava dado (a
leitura junta o planejamento, cuja RLS bloqueia), mas **ocupava a chave única
`(scheduled_workout_id, provider)`** — e o dono deixaria de conseguir sincronizar aquele dia,
sem nenhuma mensagem que explicasse por quê.

Correção: **FK COMPOSTA** `(scheduled_workout_id, user_id)` → `training_scheduled_workouts
(id, user_id)`, e a mesma disciplina no vínculo do hábito (`habit_id, user_id`). É exatamente a
correção que a 16-E aplicou às fotos de evolução — a família de problema se repete sempre que
uma tabela aponta para outra dentro do mesmo usuário. Reconferido: **23503** para o intruso,
**OK** para o dono.

### Verificação (17-F)

`npm run lint`, `npx tsc --noEmit`, `npm run test:run` (**1.916 testes**, de 1.846) e
`npm run build` passam; a suíte também passa em `TZ=UTC`. Smoke: rotas privadas → **307
`/login`**, `/login` → 200, `/api/cron/notifications` sem segredo → **401**.
`get_advisors`: **0 lints de schema**. Banco: **112 tabelas, 0 sem RLS** (29 `training_*`,
4 `body_*`, 32 `nutrition_*`), base de exercícios intacta (**106**), **0 resíduo** de teste.

---

## O que foi implementado na Subfase 16-F (integrações, notificações e polimento) — FECHA A FASE 16

A 16-A a 16-E entregaram um módulo que funciona de ponta a ponta, mas **isolado**. A 16-F o
liga ao resto do sistema e faz a passada final de acessibilidade, performance e segurança.

### ⛔ A regra que a subfase existe para garantir: INTEGRAR, NÃO REIMPLEMENTAR

Toda tela nova aqui é **casca** sobre coisa que já existe e já é testada. Um card de dashboard
que refizesse a soma do dia discordaria do diário na primeira diferença de arredondamento — e o
usuário veria dois números para a mesma refeição. Por construção:

| Onde | Consome | Nunca faz |
| --- | --- | --- |
| Card do dashboard | `reports.ts` (`buildDailyReports`), `diary.ts`, `body/measurements.ts` | Somar nutriente |
| Lançamento rápido | `addDiaryEntry`, `addMealTemplateToDiary`, `saveMeasurement`, `saveShoppingItem` | Montar snapshot |
| Notificações | `effectiveMealStatus`, `calendar.ts` | Derivar status próprio |
| Foto de receita | O caminho de `uploadProgressPhoto` (16-E) | Um segundo mecanismo de upload |

`quickAddDiaryEntry` **só resolve a refeição do dia** (acha ou cria a linha de diário) e delega:
o snapshot do registro rápido nasce idêntico ao do registro normal, com a mesma procedência.

### As 8 famílias de notificação (+37 testes)

`src/lib/notifications/nutrition.ts` — PURO, com `hoje` e `minutosAgora` injetados. Entram pelo
mesmo gerador (`generateNotifications`), então `dedupe_key` e Cron continuam sendo um caminho só.

| Família | Dispara quando | Chave |
| --- | --- | --- |
| `nutrition_meal_upcoming` | Faltam ≤ 60 min para uma refeição planejada de hoje | por refeição + data |
| `nutrition_meal_missing` | Passou da tolerância de 45 min (16-B) e não há item | por refeição + data |
| `nutrition_plan_week` | A semana que vem começa em ≤ 2 dias e está vazia | por semana |
| `nutrition_shopping_pending` | Lista ativa com itens a pegar | **por semana** |
| `nutrition_pantry_expiring` | Validade em ≤ 5 dias (ou vencida) | por item + validade |
| `nutrition_measurement_due` | ≥ 7 dias sem medir um tipo acompanhado | **por semana** |
| `nutrition_goal_close` | Consumo entre 85% e 100% da meta — **OPT-IN** | por nutriente + dia |
| `nutrition_food_review` | Alimento do usuário sem fonte ou em revisão | por alimento + motivo + mês |

**Três decisões que são regra, não ajuste:**

1. **Sem linguagem de culpa, travado por TESTE.** Um vocabulário proibido ("falhou", "de novo",
   "você não", "esqueceu", "exagerou"…) é varrido em todo título e descrição gerados. Este
   módulo trata de comida e de corpo: o custo de errar o tom é alto.
2. **Chaves SEMANAIS onde um aviso diário viraria cobrança.** Lista de compras aberta há um mês
   gera **1** aviso por semana, não 30.
3. **Passar da meta NÃO gera aviso.** A família só existe na aproximação; repreender depois não
   é papel do sistema.

### A lacuna da Fase 13 que a 16-F fechou

`settings.notification_prefs` era **salvo e nunca lido**: o Cron gerava tudo, independentemente
da preferência. Agora `filterByPrefs` (puro, testado) roda entre a geração e a gravação — e vale
para **todos** os tipos, inclusive os das fases anteriores. Filtrar num lugar só é o que impede
um tipo novo de escapar da preferência por esquecimento de quem o escreveu.

`notificationEnabled` ganhou semântica de **opt-in** (`NOTIFICATION_OPT_IN_TYPES`): ausente
significa ligado, salvo nos tipos que nascem desligados.

### Pendências acumuladas de A a E, fechadas

| Item | Como |
| --- | --- |
| Código de barras pela **câmera** | `BarcodeDetector` NATIVA — nenhum asset de terceiros, nenhuma base externa consultada. Permissão negada, câmera ocupada e navegador sem suporte viram **estado de erro escrito**; a entrada manual nunca some. O código lido só preenche o campo: quem confirma os dados é o usuário |
| **Upload** da foto de receita | Cópia exata do caminho de `uploadProgressPhoto` (16-E), com as 5 travas. A leitura passou a devolver **URL assinada de 5 min** — `storage_path` não sai mais do servidor |
| **Arrastar** ingrediente | `reorderRecipeIngredients` ganhou gatilho: arrasto (mouse) **+ setas ↑↓** (teclado e leitor de tela) |
| Corredores de mercado | Diálogo com criar, renomear, reordenar e excluir (excluir agrupa em "Sem corredor", não apaga item) |
| Tipos de medida | Diálogo com criar, reordenar e excluir — a exclusão **pergunta o destino do histórico**, sem opção pré-selecionada |
| Quantidade por receita na lista | Campo de **porções** por receita; antes toda receita entrava com 1, o que subestimava a compra de uma receita de 4 porções |
| XLSX | Uma aba por seção, `xlsx` por **import dinâmico** (a biblioteca não entra no bundle de quem não exporta). O CSV continua sendo o padrão |

### Tela de Configurações do módulo (entregue na correção pós-16-F)

`/nutricao/configuracoes` era o 12º submódulo e continuava **placeholder** na primeira
entrega da 16-F — foi construída em seguida. Ela fecha as três gestões que existiam com action
pronta e **nenhuma tela chamando**: tipos de refeição (16-B), categorias de receita (16-C) e
etiquetas de alimento (16-A) — o mesmo padrão dos corredores de mercado e dos tipos de medida.

Excluir tipo de refeição já usado é **recusado pelo servidor**, com a contagem de usos e a
alternativa (desativar): o histórico do diário nunca é apagado por tabela. E a **citação da
TACO aparece por extenso** na tela — é exigência da licença, e deixá-la só num arquivo do
repositório não cumpre a exigência para quem usa o sistema.

### Segurança verificada no banco (role `authenticated`)

**24 tentativas indevidas, 24 bloqueadas.** O intruso lê **0 linhas** em receita, anexo de foto,
alimento próprio alheio, medidas, fotos de evolução, listas, despensa, notificações e `settings`;
não edita nem exclui a base do sistema (597 alimentos intactos); não forja anexo nem notificação
em nome de terceiro (42501); não cria refeição com `user_id` alheio (42501) nem usa
`meal_type_id` de terceiro (23503); ação em massa alcança **0** linhas alheias; `storage.objects`
devolve 0. **0 resíduo** de teste; catálogo reconferido (597 alimentos, 21.147 valores).

> ⚠️ Uma armadilha de TESTE, registrada: um `insert … select` cujo `select` é bloqueado pela RLS
> insere **zero linhas sem lançar erro** — e passa por "não bloqueado". O teste foi refeito com
> `values()` explícito e um id real, que é o que exercita o `WITH CHECK` de verdade.

### Verificação
`npm run lint`, `npx tsc --noEmit`, `npm run test:run` (**1.694 testes**, de 1.630 — e
**1.846** depois de integrar a 17-E, que entrou no `main` primeiro) e `npm run build` passam. Suíte verde também em `TZ=UTC`. Smoke: `/dashboard`, `/nutricao`,
`/nutricao/relatorios`, `/nutricao/medidas`, `/nutricao/compras` → **307 `/login`**;
`/login` → 200; `/api/cron/notifications` → **401**. `get_advisors`: **0 lints de schema**.
**111 tabelas** no projeto, **0 sem RLS**. **Nenhuma migration** — a 16-F não criou tabela.

---
---

## O que foi implementado na Subfase 17-E (metas, dashboards, relatórios e corpo)

A 17-D transformou o acúmulo de sessões em **leitura**. A 17-E acrescenta a camada de
**direção** (metas) e a de **síntese** (dashboards e relatórios) — e liga o módulo à evolução
corporal, que é o que dá sentido ao resto.

### ⛔ A 17-E CONSUMIU `body_*`. Não criou tabela de medida nenhuma.

Conferido no banco antes de escrever a primeira linha (MCP `list_tables`): as 4 tabelas
`body_*` da 16-E já existiam. A 17-E **lê e escreve por `src/lib/body/`** — as mesmas queries,
as mesmas actions e os mesmos componentes (`measurement-chart`, `progress-photos`) que a Dieta
usa. Um peso registrado em `/treinos/evolucao` aparece em `/nutricao/medidas`, e vice-versa.

`training_goals.body_measurement_type_id` aponta para `body_measurement_types` com
`on delete set null` **de propósito**: excluir um tipo de medida é um fluxo da 16-E, com
escolha explícita do destino do histórico. Um `restrict` faria aquele fluxo estourar com um
erro que o módulo Dieta não saberia explicar; com `set null`, a meta sobrevive e a leitura a
marca como **"medida removida"** — indisponível, nunca zero.

### As duas tabelas novas (projeto: 111 tabelas · 28 `training_*`)

| Tabela | Papel |
| --- | --- |
| `training_goals` | A meta: família, o que mede, alvo, direção, período, prazo, marcos (jsonb) e situação |
| `training_goal_progress` | O histórico DELA: cada leitura de progresso e **toda** alteração de alvo, prazo ou situação |

### As regras que a subfase existe para garantir

1. **O dashboard não recalcula nada.** Volume, séries, repetições, tempo, frequência e
   distribuição por grupo saem de `metrics.ts` (17-D) através de `dashboards.ts`. Um teste
   compara os totais do dashboard com `aggregateSessions` diretamente: têm de ser idênticos.
   Se faltar um agregado, ele é acrescentado **em `metrics.ts`**.
2. **`atingida`, `expirada` e `em_atraso` são DERIVADOS na leitura**, de valor × alvo × prazo,
   com `hoje` injetado pelo servidor. O CHECK da migration **não aceita** esses três valores —
   verificado no banco. Só decisão do usuário (`planejada`, `ativa`, `pausada`, `concluida`,
   `cancelada`) é gravada, e ela **vence sempre**: uma meta pausada não vira "atingida"
   sozinha porque o número passou pelo alvo.
3. **Alterar a meta não reescreve o passado.** Cada campo que muda o significado (alvo,
   partida, prazo, direção, período, unidade, medição, situação) vira uma linha em
   `training_goal_progress` com anterior, novo, data e origem. Renomear a meta não polui o
   histórico; mudar o alvo, sim.
4. **Ausência de dado é `null` com motivo, nunca zero.** Meta corporal sem medição, exercício
   nunca executado e aderência sem planejamento devolvem `null`, e a tela escreve o porquê em
   vez de desenhar uma barra em 0% que pareceria fracasso. Já um período de frequência **sem
   nenhum treino vale 0** — aí o zero é fato medido, não buraco.
5. **Nenhuma divisão por zero.** Período vazio é caso normal (férias, lesão, semana corrida):
   toda razão devolve `null` e a tela diz "sem base de comparação". Um teste serializa o
   dashboard inteiro de um período vazio e exige que não apareça `NaN` nem `Infinity`.
6. **Sem prescrição.** O sistema não sugere alvo, prazo, direção nem carga; a distribuição por
   grupo muscular é apresentada como **"seu registro de treinamento"**, nunca como "o ideal é
   X séries".
7. **Sem linguagem de culpa.** O calendário de consistência mostra treinado, parcial, descanso
   planejado, planejado sem execução e **dia livre** — sem vermelho de alarme e sem "faltas".
   Um teste varre os rótulos procurando palavras de cobrança.
8. **Nenhuma afirmação de causalidade.** Treino e corpo aparecem lado a lado com o aviso
   explícito de que correlação não é causa.

### O valor de uma meta, e de onde ele vem

`goalCurrentValue` **não calcula**: recebe `PeriodMetrics`/`FrequencyMetrics` prontos e escolhe
o número que responde àquela meta. As melhores marcas de um exercício saem das séries
concluídas e não-aquecimento (a mesma regra de `records.ts`), e o **1RM só entra dentro da
faixa de validade** — acima dela vem com aviso e não vira marca, como na 17-D. Toda meta que
usa 1RM carrega a qualidade `parcial` com a frase "é uma ESTIMATIVA, não uma carga testada".

### Períodos: calendário para o que é semanal/mensal, bloco para o resto

`semanal` e `mensal` acompanham o CALENDÁRIO (é o que as palavras significam para quem lê);
`trimestral`, `semestral` e `anual` são blocos contados a partir de `starts_on` — uma meta que
começou em março fecha o trimestre no fim de maio, não porque o trimestre do calendário
terminou. Em todos os casos a janela é **presa** a `[starts_on, ends_on]`. A aritmética de mês
ganhou `addMonthsIso` em `schedule.ts` (prende ao último dia: 31/01 + 1 mês = 28/02), com teste.

### Telas

- **`/treinos/metas`** — criar, acompanhar, pausar, retomar, concluir, cancelar e excluir;
  marcos intermediários marcados na barra; histórico de alterações dobrável em cada card;
  registro manual só na meta personalizada.
- **`/treinos/relatorios`** — período (semana/mês/ano/personalizado), agrupamento (dia/semana/
  mês), comparação com o período anterior, aderência, grupos musculares, exercícios, recordes,
  medidas e **exportação CSV** com período, regra de contagem e qualidade no cabeçalho.
- **`/treinos/evolucao`** — ganhou a aba **Corpo**: gráfico com linha interrompida no dia sem
  medição, tabela equivalente, registro de medida e fotos privadas, tudo pelo módulo central.
  A aba Corpo funciona **mesmo sem treino registrado**.
- **`/treinos/calendario?visao=consistencia`** — mapa de 6 meses, com legenda contada e
  `aria-label` por dia.
- **`/treinos`** — visão geral completa: hoje, semana com comparação e aderência, metas em
  andamento, evolução recente (peso + séries por grupo) e ações rápidas.
- **Preparação da sessão** pré-preenche o peso corporal com `getLatestWeight()`. O valor da
  sessão vence sempre; o do histórico é só sugestão editável, e o que ficar gravado continua
  sendo o peso **daquele** treino.
- **`/api/export`** passou a incluir as 28 tabelas `training_*`. A base global de exercícios
  fica de fora pelo mesmo motivo da TACO: não é dado do usuário e a migration a recria.

## O que foi implementado na Subfase 16-E (medidas corporais, fotos e relatórios)

A 16-A a 16-D fizeram o sistema saber **o que entra**. A 16-E fecha o ciclo com **o que muda** —
e carrega a decisão arquitetural que as duas frentes esperavam.

### ⛔ A 16-E CRIOU o módulo central `body_*` — a 17-E CONSOME

Levantamento no banco em **2026-08-04** (MCP `list_tables`): a estrutura **não existia**. A 16-E
chegou primeiro e criou as **4 tabelas centrais**, com código em `src/lib/body/`:

| Tabela | Papel |
| --- | --- |
| `body_measurement_types` | Os 16 tipos (peso, %GC, massa muscular, cintura, abdômen, quadril, peitoral, pescoço, braço/antebraço/coxa/panturrilha D e E) + personalizados |
| `body_measurements` | O registro: data pura, hora, valor, unidade **congelada**, condição, `source` |
| `body_measurement_goals` | Meta por tipo, com direção, partida, alvo e prazo |
| `body_progress_photos` | Metadado da foto privada (o binário fica no bucket) |

**O prefixo não é de Dieta.** Peso interessa aos dois módulos, e duas tabelas seriam dois
gráficos discordando sobre quanto o usuário pesa. A **17-E não deve criar nada** — deve chamar
`src/lib/body/queries.ts` e `src/lib/actions/body-measurements.ts`. `getLatestWeight(upTo?)` já
existe para a preparação da sessão pré-preencher o peso (hoje digitado na hora).

### ⛔ As fotos de evolução — o dado mais sensível do sistema

Reuso total do mecanismo da Fase 14: tabela `attachments` + bucket **privado** `attachments`,
o mesmo que a foto de receita (16-C) usa. **Nenhum segundo mecanismo de upload.**

Cinco travas, e nenhuma delas é redundante:

1. **O binário passa pelo SERVIDOR.** A Server Action recebe `FormData` com o `File` real —
   deixar o navegador subir direto seria mais rápido, mas "validar tipo e tamanho no servidor"
   viraria uma frase sem implementação.
2. **MIME e bytes conferidos no servidor** (`photoFileSchema`), sobre o arquivo, não sobre a
   extensão do nome. Arquivo vazio é recusado à parte.
3. **Nome aleatório** (`crypto.randomUUID`) — o nome enviado pelo cliente é descartado. Bucket
   privado com nome previsível ainda é um convite.
4. **Pasta sempre `{auth.getUser().id}/…`**, nunca um caminho vindo do formulário.
5. **FK COMPOSTA `(attachment_id, user_id) → attachments(id, user_id)`.** Descoberta durante o
   teste pela role `authenticated`: a RLS sozinha permitia a linha
   `body_progress_photos(user_id = B, attachment_id = <anexo de A>)`, porque a policy confere o
   `user_id` da própria linha e nada sabe sobre o anexo apontado. Não vazava (a leitura junta
   `attachments`, cuja RLS bloqueia B) — mas depender do comportamento de um JOIN para não vazar
   foto de corpo é fino demais. Agora é impossível, não improvável.

**Leitura só por URL assinada de 5 minutos**, gerada no servidor a cada acesso (mais curta que
os 10 min dos anexos de tarefa, de propósito). `storage_path` **não sai do servidor** — o tipo
`SignedProgressPhoto` sequer tem o campo. Sem link público, sem link compartilhável.

> ⚠️ **A FK composta obrigou a abandonar o embed do PostgREST.** `getProgressPhotos` faz duas
> consultas e junta em memória, em vez de `select("...,attachments(...)")`: um embed sobre FK
> composta dependeria de inferência do PostgREST e quebraria **só em runtime** — a mesma família
> de armadilha do `ON CONFLICT` com índice parcial (42P10) que a 16-B documentou.

### Lógica pura (+151 testes) — suíte total: 1.321 → **1.472**

| Arquivo | Responsabilidade |
| --- | --- |
| `src/lib/body/measurements.ts` (69 testes) | Diferença absoluta e percentual, comparação entre datas, série temporal, média móvel, progresso e status de meta |
| `src/lib/nutrition/reports.ts` (54 testes) | Agregação por período do SNAPSHOT, micronutrientes, rankings, gasto com mercado, planejado × consumido |
| `src/lib/nutrition/diary-month.ts` (28 testes) | Visão de mês do diário |

### A regra que atravessa a subfase inteira: **buraco não é zero**

Um gráfico que despenca para zero na semana em que a pessoa não se pesou afirma que ela pesou
zero. É o `value_state` da 16-A aplicado ao **tempo**:

- `buildSeries` devolve `value: null` no dia sem medição, e o gráfico usa `connectNulls={false}`
  — a linha **interrompe** em vez de passar por cima do buraco;
- o calendário do mês mostra "—", nunca "0 kcal";
- a **média móvel só aparece com a janela cheia**; abaixo disso a UI omite a linha e explica,
  em vez de suavizar 2 pontos e chamar de tendência;
- o eixo do gráfico **não começa em zero** (2 kg num eixo de 0–80 vira linha reta).

Um caso que os testes pegaram: um dia **com meta e sem registro** estava entrando na aderência
média como **0%** — ou seja, "esqueci de anotar" virava "falhei na meta". Corrigido no código
(não no teste), com teste dedicado.

### Relatórios — as duas regras que já valiam, agora aplicadas ao período

1. **O relatório de um período passado sai do SNAPSHOT.** `buildDailyReports` entra por
   `dayTotals` (16-B), que soma `nutrients_snapshot`. Não existe um parâmetro sequer em
   `reports.ts` que aceite alimento do catálogo para somar consumo.
2. **A meta de um dia é a que valia NELE.** Cada dia resolve o próprio período com
   `goalPeriodForDate`. Teste dedicado: o mesmo consumo de 1.800 kcal dá 100% em janeiro
   (meta 1.800) e 72% em março (meta 2.500).

A qualidade viaja com o número: dia parcial torna o período parcial, e **dividir não melhora o
dado** — a média de um período parcial continua parcial.

**Duas médias, rotuladas:** por dia de calendário e por dia registrado. Elas respondem
perguntas diferentes, e oferecer só uma sem dizer qual esconderia a diferença entre "não comi"
e "não anotei".

### Pendências fechadas nesta subfase

| Item | Como ficou |
| --- | --- |
| Relatório de micronutrientes por período | Aba própria, com a coluna **"dias incompletos"** que impede a leitura ingênua do total |
| "Substituições mais realizadas" | Ranking do histórico da 16-C, com rótulos congelados e sem afirmar equivalência |
| Gasto com mercado × financeiro | **Reusa `summarizeShoppingList`** (16-D), não reconta. Virar lançamento é **decisão explícita** do usuário — a tela só aponta para `/transacoes` |
| Exportação do catálogo em CSV | `csv-export.ts` reusa `toCsv`/`downloadCsv` (Fase 14). **Célula vazia ≠ zero**, e a citação da TACO viaja com o arquivo |
| **Visão de mês do diário** | `?visao=mes` deixou de cair na semana: calendário com energia, meta do dia, pendências e tabela textual equivalente |

### Sem prescrição, sem diagnóstico, sem causalidade

Não há "peso ideal", faixa de IMC com juízo de valor nem alvo sugerido. A direção da meta
(`reduzir`/`aumentar`/`manter`) é **escolha do usuário**. Consumo e corpo aparecem **lado a
lado**, com o aviso de que correlação não é causa — nenhum cálculo de correlação é feito.
A comparação entre datas **avisa quando as condições diferem** (jejum × pós-treino), porque
parte da diferença pode ser contexto, não corpo.

### Acessibilidade

**Gráfico nunca é a única forma de ler o dado:** toda série tem tabela textual equivalente,
cada célula do calendário tem `aria-label` com a leitura completa, e a barra de progresso da
meta tem `role="progressbar"` com os valores.

### Segurança — verificado no banco pela role `authenticated`

Dois usuários de teste. Como B: **0 linhas** nas 4 tabelas, em `attachments` e em
`storage.objects` — inclusive consultando o caminho exato do arquivo de A. Bloqueados (42501):
gravar medição/tipo em nome de A, e enviar arquivo para a pasta de A. Bloqueado (23503, FK
composta): reivindicar anexo de A. `UPDATE`/`DELETE` nas linhas de A alcançam **0 linhas**.
**0 resíduo de teste no banco.** `get_advisors`: 0 lints de schema.

### Verificação

`npm run lint`, `npx tsc --noEmit`, `npm run test:run` (**1.472 testes**, de 1.321) e
`npm run build` passam. Suíte verde também em `TZ=UTC`. Smoke test: `/nutricao/medidas`,
`/nutricao/relatorios`, `/nutricao/diario?visao=mes` e `/api/export` → **307** `/login`;
`/api/cron/*` → **401**.

### Pendências registradas (escopo consciente, não bugs)

| Item | Onde resolve |
| --- | --- |
| Gerenciar tipos de medida pela interface (`saveMeasurementType`, `reorderMeasurementTypes`, `deleteMeasurementType` existem e são testados pelo tipo; a semente dos 16 cobre o uso normal) | **16-F** |
| Notificação de medição semanal pendente | **16-F** |
| Cards de evolução no dashboard geral | **16-F** |
| XLSX nos relatórios (o `xlsx` já está no projeto; a 16-E entregou CSV, que é o padrão) | **16-F** |
| `src/lib/nutrition/calendar.ts` é consumido por `src/lib/body/` — se o acoplamento incomodar, **promover** a util central, nunca copiar | Quando incomodar |
| Integração com balança/wearable | **Não planejado.** `body_measurements.source` já prevê o campo |

---

## Correção 2026-08-04 — o schema recusava a própria saída (bug de produção)

**Sintoma:** "Novo treino" mostrava `Verifique os campos destacados.` e **não salvava nunca**,
mesmo com todos os campos preenchidos, sem destacar campo algum.

**Causa, estrutural e não de um formulário só:** o `zodResolver` entrega ao `onSubmit` a saída
**já transformada**; o formulário manda isso para a Server Action; a action valida de novo com o
**mesmo** schema. `optionalText` transformava `""`/ausente em `null` mas só aceitava
`string | undefined` — recusava o que ele mesmo produzia. Como `icon` é opcional e **nem aparece
no formulário**, chegava `null` na segunda passada e derrubava o salvamento **sempre**.

Atingia três telas em produção: **Novo treino** e **Novo programa** (17-B) e **Novo exercício**
(17-A). A Dieta não era afetada — `food-form-dialog` monta o payload a partir de
`form.getValues()` (valores crus), não da saída do resolver.

**Correção:**
- `optionalText` passa a aceitar `null` (`.nullish()`), ficando idempotente — vale para os 23
  arquivos de validador que o usam.
- `src/lib/validators/round-trip.test.ts` fixa a propriedade `parse(parse(x))`. Sem a correção,
  10 dos 14 testes falham. **Todo schema novo usado com `zodResolver` deve entrar ali.**
- `src/lib/forms/server-errors.ts` (puro, testado): erro de campo que existe na tela vira
  `setError` e fica visível; erro de campo que a tela não tem sobe para o toast **com o nome do
  campo**. A mensagem "campos destacados" tinha virado mentira — foi isso que tornou o bug
  indiagnosticável. Os 26 campos dos três formulários passaram a exibir o próprio erro.

Provado no banco (role `authenticated`): insert de treino com o payload exato do schema
corrigido, lido de volta pelo próprio usuário, em transação revertida — 0 resíduo.

---

## O que foi implementado na Subfase 17-D (Treinos — histórico, volume, recordes e progressão)

A subfase que transforma o acúmulo de sessões em **leitura útil**. **3 tabelas novas** e
**+158 testes puros** (suíte: 1321 → 1479).

### ⛔ A regra que a subfase existe para garantir: NÃO SOMAR O QUE NÃO SE SOMA

Um minuto de prancha, 12 repetições de flexão e 100 kg × 8 no supino não têm denominador comum.
Um app que joga tudo num número único de "volume" produz um gráfico bonito e sem significado.

`src/lib/training/metrics.ts` é para os Treinos o que `calc.ts` é para a Dieta: **todo** número
agregado do módulo sai dali, e cada `tracking_type` acumula na SUA unidade, declarada em
`tracking.ts` (kg · repetições · segundos · distância · calorias). Histórico, gráfico, recorde,
visão geral e — na 17-E — dashboards e relatórios usam a mesma função, que é o que garante que
concordem entre si.

### As decisões de contrato

1. **Ausência de dado não é zero.** Sem peso corporal registrado na sessão, a carga efetiva de um
   exercício de peso corporal é INDISPONÍVEL: a série fica de fora e o total do período é marcado
   como **parcial**, com o motivo por extenso. `partialExplanation` monta a frase e a UI é
   obrigada a exibir. Mesma disciplina do `value_state` da Dieta.
2. **A regra de contagem viaja com o número.** Toda tela que mostra volume mostra também
   `volumeRuleLabel(...)`: aquecimento dentro ou fora, e como o unilateral está sendo contado.
3. **Unilateral tem três regras, e a diferença é o que o número REGISTRADO significa.**
   `por_lado` (2 séries, valores dobrados), `soma_dos_lados` (1 série, valores dobrados) e
   `serie_completa` (1 série, o valor registrado já é a série inteira). Com os lados gravados
   separadamente, o trabalho executado soma nas três — o que muda é só a contagem de séries.
4. **Drop set soma os blocos e conta como UMA série.** Contar cada queda como série inflaria a
   série semanal por grupo muscular.
5. **1RM é estimativa**, com a fórmula visível e escolhível (Epley, Brzycki, Lombardi, Lander).
   Série de 1 repetição devolve o próprio peso — é medida, não estimativa. Acima de 12 repetições
   o número vem **com aviso**, e nunca vira recorde. **O sistema não sugere carga máxima.**
6. **Empate não gera recorde novo.** A consolidação é por `record_key` (id do exercício ou, na
   falta dele, o NOME congelado) e preserva a marca anterior em `previous_value`.
7. **Excluir uma sessão recalcula os recordes.** O caminho é o mesmo da finalização —
   `rebuildRecords` reconstrói do histórico e o segundo melhor assume, com a data dele. Quando o
   valor CAI, `previous_value` é limpo: afirmar uma marca que o histórico já não sustenta seria
   inventar.
8. **Progressão nunca é aplicada sozinha, e dor bloqueia sempre.** A regra é escrita pelo
   usuário, avaliada sobre as últimas N sessões (N ≥ 2, com CHECK no banco), gera um motivo em
   pt-BR e nasce `pendente`. Aceitar grava a nova carga no treino-modelo (a única escrita no
   modelo em toda a 17-D) preservando o valor anterior na sugestão; ignorar impede que a mesma
   proposta reapareça. `progression_enabled` desliga o recurso inteiro.
9. **Gráfico nunca é a única leitura do dado.** Todo gráfico tem tabela equivalente dobrável.

### Schema — 3 tabelas (projeto: 109 tabelas, 26 `training_*`, 0 lints de schema)
`training_personal_records` (recorde consolidado + marca anterior),
`training_progression_rules` (a regra do usuário) e `training_progression_suggestions`
(a sugestão, com `basis` congelado e `dedupe_key`).

> **Nenhuma métrica é materializada.** Volume, tonelagem e 1RM continuam derivados na leitura —
> materializar criaria a segunda verdade que a view `nutrition_foods_view` evita na Dieta. O
> recorde é diferente: guarda um FATO datado e a marca que ele superou.

> ⚠️ O índice de deduplicação das sugestões é **PARCIAL**
> (`where status in ('pendente','ignorada')`): `ON CONFLICT` não infere índice parcial e falharia
> só em runtime (42P10). A gravação é *select-then-insert*, como nos pontos idempotentes da Dieta.

### Telas
`/treinos/historico` (lista · semana · mês · calendário · linha do tempo, 14 filtros combináveis,
agrupamento e ação em massa que **não alcança nada fora do filtro atual**),
`/treinos/historico/[id]` (detalhe com ordem planejada × executada, substituições, linha do tempo
e comparação com a sessão anterior / a melhor / a média das últimas quatro),
`/treinos/exercicios/[id]` (resumo, melhores marcas, evolução e todas as séries),
`/treinos/recordes` e `/treinos/evolucao` (desempenho + progressão). A visão geral do módulo
passou a mostrar os últimos 30 dias — e diz quando não há treino no período, em vez de exibir
"0 kg" com cara de resultado.

### Verificação
`npm run lint`, `npx tsc --noEmit`, `npm run test:run` (**1479 testes**, de 1321) e
`npm run build` passam; a suíte também passa em `TZ=UTC`. Smoke: rotas da 17-D → **307 `/login`**,
`/login` → 200, `/api/cron/notifications` → **401**. No banco, pela role `authenticated`:
**10 tentativas indevidas bloqueadas** (forja de `user_id`, escopo incoerente, marca anterior
maior que a atual, `record_key` duplicada, regra com 1 sessão, incremento fixo sem valor, regra
de exercício sem alvo, segunda regra global, sugestão decidida sem data e `dedupe_key` repetida
com sugestão pendente) e o dono lendo/escrevendo o que é dele. Dados de teste removidos: 0
resíduos, catálogo intacto (106 exercícios).

---

## O que foi implementado na Subfase 17-C (Treinos — sessão ao vivo)

A subfase mais importante do módulo: a tela que o usuário abre suado, com uma mão, no celular,
com Wi-Fi ruim, no meio da academia. **9 tabelas novas** e **+165 testes puros**.

### ⛔ A regra inegociável: o treino é CONGELADO ao iniciar

`startSession` copia o modelo para `training_sessions.workout_snapshot` (jsonb) **e** para as
linhas de `training_session_exercises` / `training_session_sets`. A partir daí **nenhuma leitura
de sessão passa pelo treino-modelo** — `session-queries.ts` não tem uma única referência a
`training_workouts`. `workout_id`, `exercise_id` e `scheduled_workout_id` são `on delete set
null`: referência informativa, nunca fonte de leitura.

**Verificado no banco, não só no código:** renomear o modelo, trocar a carga planejada para 999,
subir para 10 séries e por fim **excluir o treino inteiro** — a sessão registrada continua com
"TESTE MODELO 17C", 60 kg planejados, 1 série e o nome do exercício congelado; `workout_id` vira
`NULL` e nada mais muda. Mesmo princípio do `nutrients_snapshot` da 16-B, em outro domínio.

### O congelamento passa por `expandPlannedSets`, não por uma segunda expansão

`session-snapshot.ts` **chama** `expandPlannedSets` (17-B) em vez de reimplementar a expansão de
séries — como `buildRecipeEntrySnapshot` chama `buildDiaryEntrySnapshot` na Dieta. Construtor,
pré-visualização e sessão nunca discordam sobre quantas séries o treino tem, e a máscara por
`tracking_type` continua vindo de `tracking.ts`, a única matriz de medição do módulo.

### Schema — 9 tabelas (RLS + FORCE RLS em todas)
`training_locations`, `training_location_plates`, `training_sessions`,
`training_session_exercises`, `training_session_sets`, `training_session_rests`,
`training_session_pauses`, `training_session_events`, `training_session_substitutions`.
**Total do projeto: 102 tabelas.** Security advisor: **0 lints de schema**.

Decisões registradas:
- **Ordem planejada × ordem executada.** `planned_position` nunca muda; `executed_position` é
  reescrita ao reordenar. As séries pertencem ao EXERCÍCIO, não à posição — por isso reordenar,
  pular, voltar depois, mandar para o fim e substituir não perdem nada.
- **`parcial` e `concluido` não são graváveis** em `training_session_exercises.status`: só
  decisão do usuário entra (`pendente`, `ativo`, `pulado`, `substituido`), e os outros dois saem
  de `deriveExerciseStatus` na leitura. Mesma disciplina de `atrasada` no TO-DO.
- **`training_session_events` é append-only**: sem `updated_at`, sem trigger. Evento reescrito
  deixa de ser evento.
- **Índices únicos parciais** garantem no banco: uma sessão em execução por usuário, um descanso
  ativo por sessão, uma pausa aberta por sessão, um local padrão por usuário.
- **Idempotência por `client_mutation_id`** com unique por sessão — clique duplo, retry da fila e
  duas abas convergem para uma linha. As linhas planejadas nascem com um uuid do servidor; os do
  dispositivo entram ao registrar ou acrescentar série.
- **Peso corporal fica na sessão**, não numa tabela nova: é o valor USADO naquele treino,
  congelado. Quando a 17-E criar o módulo `body_*`, a preparação passa a pré-preencher dali.
  **Continua não existindo duas tabelas de peso corporal.**

### Lógica pura (+165 testes) — suíte de Treinos: 171 → **336**
- `session-machine.ts` — transições de sessão, exercício e série. O teste mais importante é o
  das transições **inválidas**: uma mutação atrasada da fila que chega depois do fim é recusada
  com motivo, não aplicada por cima. Concluída só volta a ativa com confirmação explícita;
  cancelada é definitiva.
- `session-flow.ts` — `nextStep`. **Concluir a 3ª de 4 séries leva para a 4ª SÉRIE**, não para
  outro exercício (critério de aceite literal, com teste isolado e nome explícito). Superset
  alterna A1 → B1 → A2 → B2 pela regra "menor série pendente do bloco, empate resolve pela ordem
  depois do atual"; circuito de três sai da mesma regra, sem caso especial.
- `timers.ts` — tudo derivado de timestamps com `agora` injetado. Tempo ativo = total − **união**
  de pausas e descansos (um descanso dentro de uma pausa não é descontado duas vezes). Reduzir o
  descanso abaixo do já decorrido ENCERRA em vez de criar alvo no passado.
- `previous.ts` — última execução por fonte escolhida pelo usuário; melhor marca ignora séries
  sem carga calculável e marca o agregado como **parcial**; assistência subtrai, adicional soma.
- `plates.ts` — calculadora com o estoque real do local, em pares (barra é simétrica), que
  **nunca passa do alvo** e declara a diferença quando não dá para fechar.
- `session-snapshot.ts` — o congelamento, com os testes de "editar o modelo depois".

### Resiliência: o que é prometido é o que é entregue
**Não afirmamos "funciona offline"** — não há service worker e recarregar sem rede não abre a
tela. O que existe: cada mutação é aplicada no estado local, persistida no dispositivo e
enfileirada; a fila reenvia **em ordem, uma por vez** ao voltar a conexão; o
`client_mutation_id` impede duplicata. A UI mostra o tempo todo `Salvo` · `Salvando` · `Salvo no
dispositivo` · `Aguardando conexão` · `Erro ao sincronizar`, com botão de tentar de novo.

Recuperação de sessão interrompida não depende do dispositivo: a sessão em execução vive no
servidor, então fechar a aba e reabrir cai na tela com tudo no lugar — inclusive o descanso,
recalculado a partir do `started_at`.

### Interface
- **`/treinos/sessao/preparar`** — etapa 1 (programado · cadastrado · recente · favorito · vazio
  · repetir o último · duplicar sessão) e etapa 2 (revisar ordem, séries, reps, cargas,
  descansos, RIR/RPE, superset + local, som, vibração, avanço automático, tela ativa, peso
  corporal, energia, disposição, sono e dor). Os valores da última vez são **sugestão**: o
  usuário escolhe a fonte e aplica com um toque — nada muda sozinho.
- **`/treinos/sessao`** — um exercício por vez, alvos de toque de 48 px, teclado numérico,
  cronômetro de descanso em componente isolado (o tique não re-renderiza a tela toda),
  reordenação com alternativa por teclado, substituição com motivo obrigatório e calculadora de
  anilhas.
- **`/treinos/sessao/revisar`** — resumo, tempos, tonelagem **marcada como parcial** quando
  alguma série não tinha carga calculável, substituições, linha do tempo e avaliação. Descartar
  exige digitar `DESCARTAR`; a alternativa oferecida é encerrar guardando o que foi feito.
- **`/treinos/hoje`** — ganhou **Iniciar treino**; sessão em andamento tem precedência.
- **`/treinos/configuracoes`** — locais de treino e estoque de anilhas de cada um.

### Sem prescrição, sem diagnóstico
Dor registrada gera aviso neutro, preserva o registro, oferece adaptar ou encerrar e sugere
orientação profissional — sem diagnóstico e **sem nenhuma sugestão de aumento de carga**.
Calorias de equipamento são sempre rotuladas como estimativa. Substituir é registro, e a tela diz
explicitamente que o sistema **não afirma equivalência** entre os exercícios.

### Segurança — verificado no banco pela role `authenticated`
Ler, editar e excluir sessão, exercício e série de terceiro: **0 linhas** em todos os casos.
Inserir com `user_id` alheio nas duas tabelas: **bloqueado**. Duas sessões em execução, dois
descansos ativos, duas pausas abertas, duas séries com o mesmo número, `client_mutation_id`
repetido, concluir sem `ended_at`, encerrar descanso sem tempo real, dois locais padrão e anilha
repetida: **todos bloqueados**. Integridade reconferida: 106 exercícios, 0 resíduo de teste.

### Verificação
`npm run lint` (0 erros), `npx tsc --noEmit` (0 erros), `npm run test:run` (**1297 testes**, de
1132) e `npm run build` passam. Suíte verde também em `TZ=UTC`. Smoke test: `/treinos/sessao`,
`/treinos/sessao/preparar` e `/treinos/sessao/revisar` → 307 `/login`; `/api/cron/*` → 401.
Fora de `training`/`treinos`, nada foi tocado.

---

## O que foi implementado na Subfase 17-B (Treinos — rotina e planejamento)

A 17-A entregou o vocabulário e o catálogo: o sistema sabia o que é "Supino reto com barra".
A 17-B entrega a camada que transforma exercícios soltos em **rotina** — treino-modelo,
programa e planejamento semanal. **7 tabelas novas** e **+105 testes puros**.

### A separação que define a subfase: **modelo é intenção; execução é fato consumado**

Tudo que a 17-B constrói é o lado **mutável**. Nenhuma tabela desta subfase pode ser lida "ao
vivo" por uma sessão passada — é por isso que **não existe coluna apontando para sessão** em
nenhuma delas. A 17-C vai gravar um **snapshot** ao iniciar o treino, e é o snapshot que
protege o histórico. O versionamento (`version` + `superseded_by` + `version_group_id`) existe
para outra coisa: o usuário **comparar intenções** ("meu ABC de janeiro × o de maio").

### `expandPlannedSets` — o contrato que a 17-C consome

Existem dois jeitos de configurar séries: **uniforme** (`default_sets`: "4×8-12, 90s") e
**série a série** (`training_workout_sets`: top set + back-off, pirâmide, drop set planejado).
Se cada tela resolvesse os dois casos por conta própria, construtor, sessão e relatório
discordariam sobre quantas séries o treino tem.

`expandPlannedSets` devolve **sempre o mesmo formato** (`PlannedSet[]`) e é o único caminho.
Regra: existindo ao menos uma linha configurada, ela é a verdade e `default_sets` vira só
exibição; `null` numa série significa "herda do exercício", e a herança mora num lugar só.
A função **usa a matriz de `tracking.ts`** para apagar o que não se aplica — um exercício de
duração não carrega peso planejado, um assistido guarda assistência e não peso na barra.
**Nenhuma segunda matriz de medição foi criada.**

### Schema — 7 tabelas (RLS + FORCE RLS em todas)
`training_programs`, `training_program_workouts`, `training_workouts`,
`training_workout_exercises`, `training_workout_sets`, `training_workout_alternatives`,
`training_scheduled_workouts`. **Total do projeto: 81 tabelas** (74 + 7). Security advisor:
**0 lints de schema**.

Decisões registradas:
- **Junção programa↔treino, e não FK direta.** Um treino pode ser avulso ou compor mais de um
  programa. `training_workouts.program_id` é só "programa de origem" (`set null`).
- **Três colunas de carga planejada**, e isso não é redundância: `planned_weight_kg` (barra),
  `planned_additional_weight_kg` (**soma**) e `planned_assistance_weight_kg` (**subtrai**).
  Num campo só, cada tela teria de reinterpretar o sinal — e uma delas erraria, mostrando
  progresso justamente na regressão.
- **`exercise_id` é `on delete restrict`**: excluir um exercício em uso num treino não pode
  removê-lo do treino em silêncio. A action conta os treinos e devolve a mensagem em pt-BR.
- **`workout_id` do planejamento é `set null`, não cascade**: excluir um treino não apaga dias
  planejados; a linha continua legível como "treino removido".
- **`is_active` sem índice único**: mais de um programa em uso gera **aviso**, não erro de
  banco. Índice único transformaria um aviso numa parede.
- **Índice único parcial** garante no máximo **um marcador de descanso por dia**.

### Status derivado, nunca gravado
`training_scheduled_workouts.status` guarda só FATO (`planejado`, `concluido`,
`nao_realizado`, `reagendado`, `cancelado`). **"Atrasado" e "hoje" nascem em
`derivePlannedStatus(entry, hoje)`**, com `hoje` injetado pelo servidor em Brasília — mesma
disciplina de `atrasada` no TO-DO e do status da fatura. Um desfecho gravado sempre vence a
derivação: um treino marcado como não realizado ontem **não** é "atrasado", já tem resposta.

**"Concluído" não é gravável por esta subfase.** Quem conclui um treino é a sessão ao vivo
(17-C); permitir marcar "feito" à mão criaria histórico sem execução, e a 17-D teria de
reconciliar dois "concluídos" que não significam a mesma coisa.

### Lógica pura (+105 testes) — suíte de Treinos: 66 → **171**
- `workout.ts` — `expandPlannedSets` (os dois formatos, herança, renumeração, máscara por
  `tracking_type`), contagem de séries, séries por grupo muscular (**principal e secundário
  contados à parte**, para uma remada não parecer treinar bíceps tanto quanto costas),
  duração estimada (execução + descanso, **sem contar o descanso da última série**, com marca
  de **parcial** quando falta alvo), validação de superset (contíguo × furado × sozinho),
  ordem canônica e reordenação que nunca perde item.
- `schedule.ts` — aritmética de data pura em `Date.UTC` (virada de mês, de ano e bissexto),
  semana com primeiro dia configurável, status derivado, **rodízio A/B/C que avança por dia de
  treino** (e não por dia de calendário, senão o ciclo quebra numa semana mais curta), ciclo de
  N semanas com âncora, duplicação de semana, reagendamento preservando a **primeira** data
  original, e aderência que **só conta o passado** (dia futuro não é falha; sem nada planejado
  a taxa é `null`, e não 0%).

### Interface
- **`/treinos/programas`** — lista com filtros, criar/editar/duplicar/ativar/pausar/finalizar/
  arquivar, composição do programa por arrastar (com alternativa por teclado), dias sugeridos
  por treino e **exclusão que sempre pergunta o destino** dos treinos.
- **`/treinos/treinos`** — lista com filtros combináveis, seleção múltipla, ações em massa,
  mover de programa; **versões substituídas ficam escondidas por padrão** e voltam por filtro.
- **`/treinos/treinos/[id]`** — construtor: arrastar exercícios, configurar séries (uniformes
  ou uma a uma, com **pré-visualização pela própria `expandPlannedSets`**), agrupar superset,
  definir alternativas do exercício naquele treino, salvar como nova versão.
- **`/treinos/calendario`** — semana, mês e lista; arrastar para reagendar; gerar rotina por
  dias da semana + rodízio; aplicar programa; duplicar semana; marcar descanso; registrar
  justificativa. **Nada é sobrescrito em silêncio**: gerar e duplicar exigem escolher entre
  preservar ou substituir, e "substituir" nunca alcança dia com desfecho gravado.
- **`/treinos/hoje`** — treino do dia com grupos musculares, nº de exercícios, total de séries
  e duração estimada, próximo treino e dias em aberto. **Sem "Iniciar treino"**: a tela diz
  que o botão chega na 17-C, em vez de mostrar um controle que não faz nada.
- **`/treinos`** — visão geral com a semana planejada. Continua **sem** volume, recorde e
  evolução: não há sessão registrada até a 17-C.

### Segurança — verificado no banco pela role `authenticated`
Ver programa/treino/planejado de terceiro: **0 linhas**. Editar e excluir os três de terceiro:
**0 linhas**. Inserir com `user_id` de terceiro nas três tabelas: **bloqueado**. Descanso com
treino: **bloqueado**. Dois descansos no mesmo dia: **bloqueado**. `superset_group` inválido:
**bloqueado**. Série duplicada: **bloqueado**. Excluir exercício em uso: **bloqueado**
(`restrict`). Faixa de repetições invertida: **bloqueado**. Integridade reconferida: 106
exercícios, 1 usuário, 0 resíduos de teste.

### Verificação
`npm run lint` (0 erros), `npx tsc --noEmit` (0 erros nos arquivos da 17-B), `npm run test:run`
(**1073 testes**) e `npm run build` passam. Smoke test: rotas privadas → 307 `/login`;
`/api/cron/*` → 401 sem segredo. Fora de `training`/`treinos`, nada foi tocado.

---

## O que foi implementado na Subfase 17-A (Treinos — fundação e catálogo)

Módulo central novo em **`/treinos`**, com navegação interna própria para **13 submódulos**.
Inspirado na *organização e na facilidade de registro durante o treino* de bons apps de
academia — **sem** copiar código, identidade visual, textos, ícones, telas, vídeos, imagens
ou base de dados de terceiros.

### A decisão que define o módulo: **um exercício é um contrato de medição**

`tracking_type` é `not null` em `training_exercises` e diz o que aquele movimento **mede**:
peso × repetições, só repetições, segundos, distância, calorias do painel do aparelho. Sem
isso, a Subfase 17-D somaria 100 kg × 8 do supino com 60 segundos de prancha e 3 km de
esteira num "volume" único — um gráfico bonito e sem significado.

Duas consequências que parecem detalhe e não são, ambas testadas:
- **Assistência SUBTRAI carga.** Na barra fixa assistida, 30 kg de assistência deixam o
  exercício mais fácil. Somar inverteria o sinal e mostraria "progresso" justamente quando o
  usuário estivesse regredindo.
- **Sem peso corporal registrado, a carga efetiva é INDISPONÍVEL — nunca zero.** Uma flexão
  não é "0 kg × 12". É a mesma disciplina do `value_state` da Dieta: ausência de dado não é
  zero. `src/lib/training/tracking.ts` é a única fonte dessa matriz.

### Base de exercícios própria e declarada
- **106 exercícios**, **132 vínculos de músculo secundário**, 22 grupos musculares e 20
  equipamentos — peitoral, costas, ombros, bíceps, tríceps, quadríceps/glúteos, posteriores,
  panturrilhas, abdômen/core e cardio complementar.
- **Conteúdo autoral**, produzido para o projeto. **Zero imagem, zero vídeo, zero texto de
  instrução e zero base de dados de terceiro.** Os campos `instructions`, `tips` e
  `common_mistakes` nascem vazios — quem escreve é o usuário.
- Pipeline determinístico e reexecutável: `data/training/exercise-base/exercises.json` →
  `scripts/training/generate-exercise-base-migration.mjs` → migration idempotente
  (`on conflict (system_code)` → atualiza, não duplica). Procedência, licença e as escolhas
  discutíveis (ex.: levantamento terra classificado em Costas) em
  `data/training/exercise-base/ATTRIBUTION.md`.

### Schema — 7 tabelas (RLS + FORCE RLS em todas)
`training_muscle_groups`, `training_equipment`, `training_exercises`,
`training_exercise_muscles`, `training_exercise_alternatives`, `training_exercise_prefs`,
`training_preferences`. **Total do projeto: 74 tabelas.** Security advisor: **0 lints de
schema**.

- **`user_id` nulo = base do sistema, imutável** — policies **separadas por comando** (SELECT
  alcança o global; INSERT/UPDATE/DELETE só o próprio), como em `nutrition_foods`. Três
  constraints amarradas (`user_id is null` ⇔ `is_system_exercise` ⇔ `source = 'sistema'`)
  impedem que um exercício digitado à mão se apresente como parte da base.
- **Preferência ≠ exercício.** Favoritar, arquivar, apelidar e ajustar descanso/incremento de
  um exercício global gravam em `training_exercise_prefs`. Duplicar cria cópia editável com
  `origin_exercise_id`.
- **Uma trigger impede o grupo principal de aparecer também como secundário** — a duplicidade
  inconsistente que o briefing do módulo pede para evitar. CHECK não resolveria: a informação
  está em outra tabela.
- `training_preferences` já nasce com as chaves das subfases seguintes (avanço automático,
  som/vibração, regra de volume unilateral, fórmula de 1RM, progressão) e **a tela diz a
  partir de quando cada bloco vale** — interruptor que não faz nada e não avisa é pior do que
  não existir.

### Lógica pura (+66 testes) — suíte: 823 → **889**
- `tracking.ts` — a matriz de medição dos 11 tipos, carga efetiva com assistência/adicional/
  peso corporal, resolução de incremento e descanso por especificidade, `snapToIncrement`.
- `filters.ts` — busca sem acento por múltiplos termos, 11 filtros combináveis, ordenação e
  serialização URL ↔ filtros (testada como ida e volta).
- `constants.ts` / `types.ts` — enums, rótulos pt-BR, seções da navegação e conversores
  seguros do banco para o tipo.

### Interface
- Item **Treinos** na sidebar (grupo **Saúde**, ícone halteres).
- **Visão geral** (`/treinos`) com o estado real do catálogo, distribuição por grupo muscular
  e a procedência da base. **Não exibe "0 treinos esta semana"** — não há de onde tirar esse
  número antes da 17-C, e inventá-lo seria desonesto.
- **Catálogo** (`/treinos/exercicios`): busca instantânea, 11 filtros com contagem, ordenação,
  seleção múltipla e ações em massa (favoritar/desfavoritar/arquivar/restaurar/excluir) que
  **relatam quantos itens foram ignorados** por serem da base, criar/editar/duplicar/excluir,
  lista incremental (60 por vez).
- **Painel de detalhe** com 3 abas: como o exercício é medido (com os campos que cada série
  vai pedir), alternativas (organização do usuário, sem afirmar equivalência biomecânica) e
  personalização (apelido/descanso/incremento próprios).
- **Configurações** (`/treinos/configuracoes`) com as preferências do módulo.
- As outras 10 rotas existem e dizem honestamente em qual subfase chegam.

### Segurança — 13 verificações de RLS executadas pela role `authenticated`
Ler a base (106 exercícios, 22 grupos, 132 vínculos): OK. Editar / excluir exercício global:
**0 linhas**. Editar grupo global: **0 linhas**. Editar equipamento global: **0 linhas**.
Excluir vínculo da base: **0 linhas**. Inserir com `user_id` de terceiro: **bloqueado**.
Forjar exercício "da base": **bloqueado**. Criar grupo global: **bloqueado**. Repetir o grupo
principal como secundário: **bloqueado pela trigger**. Favoritar exercício da base:
**permitido** (é preferência do usuário). Integridade reconferida depois: 106/132/0 — nenhum
resíduo de teste.

### Verificação
`npm run test:run` (**889 testes**), `npm run lint`, `npx tsc --noEmit` e `npm run build`
passam. Nenhuma fase anterior foi tocada — as únicas alterações fora de `training`/`treinos`
são a linha nova em `src/config/nav.ts` e a nota de decisão na 16-E.

---

## O que foi implementado na Subfase 16-D (lista de compras e despensa)

A 16-B/16-C fizeram o sistema saber o que a pessoa **vai comer**. A 16-D transforma isso no que
ela **precisa comprar**. É a tela mais **mobile-first** do módulo: usada em pé, no mercado, com
uma mão. **4 tabelas novas** e **+59 testes puros** (`shopping.test.ts`).

### A regra que a subfase existe para garantir

**A consolidação não soma unidades incompatíveis.** É a mesma disciplina de `calc.ts` ("não
analisado" não vira zero) aplicada a compras: 200 g de arroz + 1 xícara de arroz só viram **uma
linha** quando existe conversão real cadastrada (a medida caseira daquele alimento, com o peso).
Sem ela, viram **duas linhas**, com o motivo escrito na tela. Massa converte com massa, volume
com volume — **g ↔ ml exigiria densidade**, e densidade presumida é dado inventado. "3 unidades
de tomate" só vira gramas se alguém tiver dito quanto pesa aquele tomate.

Quem decide o que soma com o quê é `src/lib/nutrition/shopping.ts` (puro): cada parcela cai num
**balde** (`base:g`, `base:ml`, `un`, `medida:<rótulo>`, `sem_quantidade`) e só soma dentro do
balde. Quando um mesmo item produz mais de um balde, **todas** as linhas recebem
`separate_reason` — o usuário nunca vê duas linhas estranhas sem explicação.

### Tabelas

| Tabela | Papel |
| --- | --- |
| `nutrition_market_categories` | Corredores do mercado. **Dado do usuário**, semeado na primeira leitura (`ensureMarketCategories`, idempotente pelo unique parcial `(user_id, slug)`) com os 10 do enunciado. Não é taxonomia nutricional: "congelados" não é grupo alimentar. |
| `nutrition_shopping_lists` | O documento. `recurrence_key` determinística por período; `pantry_applied_at`; total gasto **nunca materializado** (sai da soma dos itens). |
| `nutrition_shopping_list_items` | O item. `origins` jsonb (procedência congelada), `consolidation_key`, `quantity_overridden`, `separate_reason`, preços em **centavos**. |
| `nutrition_pantry_items` | A despensa, travada em **6 campos**. Sem movimentação, entrada, saída ou histórico. |

Todas com RLS + FORCE RLS por `user_id = auth.uid()`, índice em `user_id` e trigger
`updated_at`. Testadas pela role **`authenticated`** (não como `postgres`): outro usuário lê 0
linhas nas quatro; o dono lê as dele; `WITH CHECK` recusa gravar em nome de terceiro.

### As decisões que sustentam a subfase

1. **A origem viaja congelada.** `origins` guarda de qual refeição, de qual data e de qual
   receita veio cada parcela — snapshot, porque o planejamento pode ser editado depois e a
   lista impressa que foi ao mercado precisa continuar explicando os números.
2. **O ajuste manual sobrevive à regeração.** Mexer na quantidade marca `quantity_overridden`;
   `planRegeneration` devolve `keepQuantity: true` e o recálculo atualiza origem e corredor,
   **não** a quantidade. Quem comprou 2 kg porque o pacote é de 2 kg não quer ver 1,4 kg de
   volta a cada regeração. Item digitado à mão nunca é tocado.
3. **Nada some sozinho.** O que o planejamento não pede mais vira **lista de obsoletos** na
   prévia; só é apagado com `remove_obsolete` explícito. A ação em massa oferecida primeiro é
   marcar, não excluir.
4. **Cobertura total da despensa não zera a quantidade.** O item vira `removido` ("não vou
   comprar"), continua na lista e volta com um toque. Zerar afirmaria "preciso de 0 g de
   arroz" — falso: eu preciso, só já tenho.
5. **`quantity` NULA na despensa ≠ zero.** Nula é "tenho, mas não sei quanto" (não desconta, e
   a tela diz por quê); zero é "acabou", um fato medido.
6. **Ausência de preço não é zero.** O resumo conta `semPrecoEstimado`/`semPrecoReal` para a
   tela dizer "R$ 84,20 em 12 de 19 itens" em vez de deixar o total parecer a compra inteira.
7. **Sem link público**, e não é esquecimento: a lista conta o que a pessoa come e quanto gasta.
   Exportar (.txt agrupado por corredor) e imprimir resolvem o caso real.
8. **Corredor sugerido por observação, nunca inventado.** A sugestão vem do que o próprio
   usuário já fez (a categoria que ele deu ao alimento antes, ou a da despensa). Não existe uma
   tabela nossa dizendo que "iogurte é frios" — isso seria opinião sobre o mercado dele.

### Lista recorrente não duplica (regra 6)

`shoppingRecurrenceKey` é determinística: `semanal:<início da semana>`, `mensal:<AAAA-MM>`,
`quinzenal:<âncora>` (ancorada em 05/01/1970, uma segunda-feira, para a mesma data cair sempre
na mesma quinzena). Abrir a tela cinco vezes na mesma semana reencontra a **mesma** lista.

> ⚠️ **A armadilha da 16-B se repetiria aqui.** Os índices únicos de `recurrence_key` e de
> `consolidation_key` são **PARCIAIS** — o Postgres não os infere num `ON CONFLICT` e o
> PostgREST não deixa repetir o predicado (42P10, **falha só em runtime**). Todo caminho da
> 16-D usa *select-then-insert/update*. Verificado no banco: o `ON CONFLICT (user_id,
> recurrence_key)` é recusado com `invalid_column_reference`, e o índice barra a duplicata.

### Verificação
`npm run lint`, `npx tsc --noEmit`, `npm run test:run` (**1.132 testes**, +59) e `npm run build`
passam; a suíte também passa com `TZ=UTC`. Smoke test: `/nutricao/compras` → 307 `/login`;
`/api/cron/*` → 401 sem segredo. `get_advisors` sem lints de schema. As 4 tabelas entraram em
`src/app/api/export/route.ts`.

### Pendências conscientes da 16-D

| Item | Onde resolve |
| --- | --- |
| Relatório de gasto com mercado × financeiro | **16-E** (virar lançamento é decisão explícita do usuário) |
| Notificação de item da despensa vencendo | **16-F** (a data já é gravada e exibida) |
| Reordenar corredores de mercado pela interface (`reorderMarketCategories` existe e é chamável) | **16-F** |
| Criar/renomear corredor pela interface (`saveMarketCategory`/`deleteMarketCategory` existem) | **16-F** |
| Escolher a quantidade de cada receita ao gerar por "receitas" (hoje entra 1 porção e o usuário ajusta no item) | **16-F** |

---

## O que foi implementado na Subfase 16-C (receitas, refeições-modelo e substituições)

A 16-B fez o sistema saber o que foi comido, item a item. A 16-C entrega as três abstrações
que tornam o uso diário rápido — **receita**, **refeição-modelo** e **substituição** — sem
abrir um segundo caminho de gravação. **Testes: +79 puros** (recipe, substitution e
meal-template).

### A regra que a subfase existe para garantir
**O peso de uma comida pronta não se deduz somando os ingredientes crus.** Um refogado perde
água, um bolo perde água e ganha volume, um feijão ganha água — a variação depende do fogo, do
tempo e da panela. Por isso `nutrition_recipes.total_weight_g` é **informado** pelo usuário, e
quando ele não existe o valor **"por 100 g" fica indisponível com explicação**, em vez de cair
silenciosamente para a soma dos crus (que daria um número plausível e errado).

O total da receita é a **soma dos ingredientes**; "por porção" é esse total dividido pelo
rendimento — então **alterar o rendimento recalcula a porção sem mexer no total**.

### ⛔ Receita e refeição-modelo entram no diário pelo MESMO caminho
`buildRecipeEntrySnapshot` (recipe.ts) **chama** `buildDiaryEntrySnapshot` (16-B). Não existe
segunda tabela, segunda fórmula nem segundo formato de snapshot. Consequências garantidas por
construção: o total do dia soma o `nutrients_snapshot`; editar ou excluir a receita **não muda
o que já foi comido**; e a qualidade do cálculo viaja junto do número.

`nutrition_diary_entries.entry_kind` ganhou `'receita'` e `'modelo'` (o CHECK da 16-B já
previa), e `nutrition_planned_meal_items` ganhou `item_kind` + `recipe_id` + `portion_unit`.
O discriminador estável continua sendo a coluna de tipo, nunca a presença de uma FK — todas
são `on delete set null`.

### A qualidade agregada passou a viajar com o número
Uma receita cujo ingrediente não tem fibra analisada tem total de fibra **parcial**. Antes da
16-C não havia como dizer isso ao entrar no diário: o valor seria gravado como se fosse exato.
Agora `SnapshotNutrient` e `ComputedNutrient` carregam um `quality` **opcional**, e
`sumNutrient` o respeita (um agregado parcial conta como contribuinte **e** degrada o total).
A mudança é aditiva: nenhum snapshot da 16-B tem o campo, e nada no comportamento anterior
mudou.

### Decisões registradas
1. **Sem peso final, a receita só é registrada em PORÇÕES** — e aí `grams_equivalent`,
   `base_quantity` e `base_unit` ficam **NULOS**. "Não sei quanto pesa" ≠ "pesa zero", então o
   tipo `DiaryEntrySnapshot` foi alargado para aceitar nulo nessas três colunas.
2. **Refeição-modelo aponta para a receita**, não copia os ingredientes: melhorar a receita
   melhora o modelo. O congelamento continua acontecendo só no consumo.
3. **Adicionar o mesmo modelo duas vezes não duplica** (`templateItemsToRegister`, puro e
   testado). Repetir de propósito exige um interruptor explícito na tela — a idempotência é de
   leitura, e não um índice único, porque um modelo vira VÁRIAS linhas no diário.
4. **Dois modos de registrar um modelo**: detalhado (uma linha por item, ajustável depois) e
   resumido (uma linha com o total). Os dois passam pelo mesmo snapshot.
5. **Substituir é sempre confirmado.** A tela mostra original × alternativa, a diferença de
   kcal/P/C/G/fibra, o impacto no total do dia e o que resta da meta. A diferença é
   **recalculada no servidor** antes de gravar — o que o navegador exibiu é conferido, não
   copiado.
6. **Nenhuma equivalência é afirmada.** A ordem das alternativas é a **prioridade do usuário**,
   não um ranking nutricional; a tolerância é preferência dele; "fora da tolerância" é aviso,
   nunca impedimento. Nenhuma sugestão nasce de heurística nova.
7. **Diferença desconhecida não é zero.** Se um lado não tem o nutriente medido, a comparação
   fica "não dá para comparar" e o impacto no dia é marcado como **parcial**.
8. **Duplicar não herda passado**: contagem de uso, último uso, favorito, arquivamento,
   consumo registrado e logs de substituição ficam com o original.
9. **No diário, a substituição regrava a MESMA linha** (`change_kind = 'substituido'`),
   preservando o vínculo com o item planejado. No nível refeição, os itens antigos viram
   `'removido'` (deixam de somar, continuam visíveis) e a refeição passa a `'substituida'` —
   status que já existia na 16-B.

### Schema — 8 tabelas novas + 2 alterações (0 lints de schema)
`nutrition_recipe_categories` · `nutrition_recipes` · `nutrition_recipe_ingredients` ·
`nutrition_meal_templates` · `nutrition_meal_template_items` ·
`nutrition_substitution_groups` · `nutrition_substitution_options` ·
`nutrition_substitution_logs`, mais as migrations que estendem `nutrition_diary_entries` e
`nutrition_planned_meal_items`. Todas com RLS + FORCE RLS, índice em `user_id` e trigger
`set_updated_at`. **A foto da receita reusa `attachments` + o bucket privado `attachments`** —
nenhum bucket novo.

### Pendências da 16-B fechadas aqui
- **Montar os dias de um modelo de semana pela interface** (antes só criar e aplicar
  funcionavam).
- **Escopo na EDIÇÃO de refeição planejada** — `updatePlannedMealInScope` já existia e era
  testada, mas a UI só expunha escopo na exclusão.

### Efeito colateral necessário
`/api/export` passou a incluir as **8 tabelas novas**. Tudo ali é conteúdo autoral do usuário
(as receitas dele, os modelos dele, as trocas que ele fez) e **nada é recriado por migration**:
ficar de fora do backup significaria perder para sempre.

### Verificação
`npm run test:run` **1.073** (58 arquivos; 79 novos desta subfase) · `npm run lint` limpo ·
`npx tsc --noEmit` limpo · `npm run build` verde com as 12 rotas de `/nutricao`. Suíte passa em
`TZ=UTC` e `TZ=Asia/Tokyo`. Smoke: rotas privadas → **307 `/login`**, `/login` → 200,
`/api/cron/notifications` → **401**.

**Verificações no banco pela role `authenticated`** (como `postgres` a RLS é ignorada e o teste
não provaria nada): intruso **não lê, não edita e não apaga** em nenhuma das 8 tabelas; forjar
`user_id` de outra pessoa é bloqueado pelo WITH CHECK; **8 CHECKs** rejeitam rendimento zero,
peso final zero, item com alimento e receita ao mesmo tempo, item livre sem rótulo, grupo
incoerente com o nível, tolerância negativa e log sem rótulo; `entry_kind = 'receita'` exige
quantidade mas **aceita peso nulo** (porção sem peso final); `'alimento'` continua exigindo o
snapshot completo. **Imutabilidade provada no banco real:** depois de editar a receita (nome,
rendimento e peso) e **excluí-la**, o consumo registrado continuou com o nome de origem,
276,75 kcal e a qualidade "parcial" congelada, com `recipe_id` nulo e `entry_kind` intacto; o
histórico de substituição sobreviveu à exclusão do grupo. Todos os dados de teste foram
removidos e o catálogo reconferido: **597 alimentos, 21.147 valores**.

### Fora do escopo (registrado, não silenciado)
| Item | Onde entra |
| --- | --- |
| Lista de compras a partir das receitas | **16-D** (a consolidação **não pode somar unidades incompatíveis**) |
| Relatório de "substituições mais realizadas" | **16-E** |
| Busca global e lançamento rápido de receita | **16-F** |
| Upload da foto da receita pela interface (a tabela e o bucket já são lidos) | **16-F**, junto do upload de anexos |
| Reordenar ingredientes arrastando (a action `reorderRecipeIngredients` existe) | **16-F** |
| Sugestão automática de substituição por IA ou heurística nova | **Nunca** — a sugestão só usa o que o usuário cadastrou |

---

## O que foi implementado na Subfase 16-B (metas, diário e planejamento)

A 16-A entregou o catálogo; a 16-B faz o sistema saber **o que o usuário comeu**. Quatro
telas reais (`/nutricao`, `/nutricao/diario`, `/nutricao/metas`, `/nutricao/planejamento`),
10 tabelas novas e **+152 testes puros** (671 → 823; a suíte total marca 889 somando os 66
da Subfase 17-A, que corre em paralelo).

### A decisão que define a subfase: **o histórico não muda quando o alimento muda**

`nutrition_diary_entries` congela, **no ato do registro**, tudo que o cálculo precisa:
identidade do alimento, preparo, marca, quantidade, medida, conversão para a unidade-base,
procedência (fonte/versão/código) e os nutrientes já ajustados à porção
(`nutrients_snapshot jsonb`). O total do dia soma **esse jsonb** — não existe caminho de
leitura do total que passe pelo catálogo.

Consequências deliberadas:
- `food_id` é `on delete set null` (referência informativa). **Excluir um alimento perde o
  link, nunca o histórico.**
- `entry_kind` é o discriminador estável da linha, e não a presença de `food_id` — que pode
  virar nulo.
- As colunas quentes (`energy_kcal`, `protein_g`…) são derivadas **na gravação** e servem só
  para listar/ordenar; `NULL` nelas significa **não disponível**, jamais zero.
- **Verificado no banco real** (role `authenticated`): editar o alimento (nome + energia
  128 → 999) e depois excluí-lo deixou o registro de 192 kcal intacto, com o nome de origem.

### Planejado ≠ consumido
`nutrition_planned_meals`/`_items` e `nutrition_diary_meals`/`_entries` são tabelas
separadas, e **nenhuma action de consumo escreve no planejamento**. O cruzamento é derivado
na leitura por `planned_item_id` + `change_kind`
(`igual | quantidade_ajustada | substituido | removido | extra`), e a tela mostra os dois
lados com a diferença nutricional. `removido` registra a *decisão* de pular um item — é
diferente de "não registrei nada" — e por isso não entra nas somas.

### Status derivado, como fatura (F03), tarefa (F09) e TO-DO (F15)
**`pendente` não existe no CHECK do banco.** Ele e o atraso saem de `planned_time` + hora
atual em `effectiveMealStatus`. Duas decisões de produto ficaram explícitas em constante, em
vez de escondidas numa comparação: a tolerância de atraso é de **45 minutos**, e uma refeição
de hoje **sem horário previsto nunca vira "atrasada"** — não há como saber, e cobrar por
suposição seria inventar.

### Meta vigente por data
A meta não é uma linha sobrescrita: é `nutrition_goal_periods` com `starts_on`/`ends_on`.
Toda leitura pergunta *"qual meta valia nesta data"*. A tela separa **"editar este período"**
de **"começar novo período"** justamente porque um muda o passado e o outro o preserva —
`startNewGoalPeriod` encerra o anterior na véspera e abre o novo.

O valor da meta tem três eixos de escopo opcionais (dia da semana · treino/descanso ·
refeição), resolvidos do mais específico para o mais geral por `resolveTarget`. Trocar o tipo
da meta e voltar **não apaga nada**: as linhas do eixo desligado ficam guardadas e a leitura
as ignora.

### Aderência: proximidade, não razão simples
Comer o dobro da meta de gordura daria "200% de aderência" numa divisão ingênua. Aqui
aderência é **100% quando o consumo fica na meta ou dentro da faixa**, e cai proporcional ao
desvio relativo fora dela. A fórmula é exportada como texto (`ADHERENCE_FORMULA`) e exibida
na tela — número que a pessoa usa para se avaliar não pode ser uma caixa-preta. Toda
aderência carrega a **qualidade** do pior total considerado.

### Recorrência do planejamento
Um modelo de semana com ciclo de 1 a 8 semanas. **Aplicar materializa** refeições com data
concreta em vez de criar vínculo vivo — se o modelo reescrevesse o passado, o histórico
deixaria de ser confiável. `weekIndexForDate` devolve `null` quando o ciclo tem mais de uma
semana e falta a âncora, em vez de chutar a "semana A".

Editar/excluir em série **sempre pergunta o escopo** (somente este dia / este e os próximos /
todo o modelo), e **nenhum dos três alcança datas passadas**.

### Schema — 10 tabelas (projeto: 67 tabelas, 0 lints de schema)
`nutrition_profiles`, `nutrition_meal_types`, `nutrition_goal_periods`,
`nutrition_goal_items`, `nutrition_plans`, `nutrition_plan_days`,
`nutrition_planned_meals`, `nutrition_planned_meal_items`, `nutrition_diary_meals`,
`nutrition_diary_entries`. Todas com RLS + FORCE RLS, índice em `user_id` e trigger
`set_updated_at`.

**Armadilha encontrada e registrada:** os índices únicos que sustentam a idempotência são
**parciais** (`where planned_item_id is not null`, `where plan_day_id is not null and …`), e
o Postgres **não infere índice parcial num `ON CONFLICT`** sem repetir o predicado — o
`upsert` do PostgREST falharia em runtime, passando por build, tsc e lint. Confirmado no
banco (`42P10`) e resolvido com *select-then-insert/update* nos dois pontos afetados
(`confirmPlannedMeal`/`skipPlannedItem` e a materialização de modelo). Mesma armadilha vale
para o índice de escopo de `nutrition_goal_items`, que usa `coalesce(...)`.

### Água não é duplicada (regra 7)
A fonte de verdade continua sendo o módulo Hábitos (Fase 10). O módulo Dieta **lê**
`habits`/`habit_logs` da categoria `agua` e linka para `/habitos`; não existe tabela de água
aqui. Sem hábito cadastrado, a tela diz isso e oferece o link — em vez de mostrar "0 de 0".

### Sem prescrição (regra 12)
O estimador de gasto energético (Mifflin-St Jeor) é **opcional**, devolve a **fórmula por
extenso** junto do número, exibe um aviso de que não é recomendação nutricional nem médica, e
**nunca grava meta**: ele preenche a tela, e quem salva é o usuário. Sem os dados necessários
devolve `null` e diz o que falta, em vez de estimar.

### Correção de efeito colateral: backup
`/api/export` não incluía nenhuma tabela do módulo Dieta (pendência não registrada da 16-A) —
o diário alimentar inteiro ficaria fora do backup. Agora inclui as 19 tabelas `nutrition_*`
do usuário, com `.eq("user_id", …)` explícito: sem esse filtro, as tabelas que aceitam
`user_id` nulo trariam os 597 alimentos e os 21.147 valores da TACO para dentro do backup —
dado que não é do usuário e que a migration recria. O mesmo `.eq` resolveu um `TS2589` ("type
instantiation is excessively deep") que a união de 67 tabelas provocou no `from()` dinâmico.

### Verificação
`npm run test:run` (**889** no total; 823 sem os testes da 17-A, eram 671), `npm run lint`, `npx tsc --noEmit`, `npm run build` —
todos verdes. Suíte passa em `TZ=UTC` e `TZ=Asia/Tokyo`. Rotas privadas → **307 `/login`**;
`/api/cron/*` → **401**. **30 verificações no banco pela role `authenticated`** (20 de
RLS/CHECK + 10 de imutabilidade e idempotência), com todos os dados de teste removidos ao
final e o catálogo da 16-A reconferido (597 alimentos, 21.147 valores).

---

## O que foi implementado na Subfase 16-A (Dieta e Alimentação — fundação)

Módulo central novo em **`/nutricao`** ("Dieta e Alimentação"), com navegação interna própria
para 12 submódulos. Inspirado na *organização e facilidade de registro* de bons apps de
nutrição — **sem** copiar código, identidade visual, textos, telas ou assets de terceiros.

### A decisão que define o módulo: **ausência de dado não é zero**
Todo valor nutricional carrega um **estado**: `disponivel | traco | nao_disponivel |
nao_aplicavel | em_revisao`. Só `disponivel` tem número, e uma **CHECK constraint** garante
isso no banco — não só no código. Toda soma propaga uma **qualidade** (`exato | aproximado |
parcial`) que a interface é obrigada a exibir. Somar tratando "não analisado" como 0 inventa
precisão que o dado não tem, e é o erro clássico de app de nutrição.
*Prova disso no dado real:* "Sal, grosso" tem energia `nao_aplicavel` na TACO, e o app mostra
**"n/a"**, não "0 kcal".

### Base nutricional real e verificável
- **TACO 4ª edição (NEPA/UNICAMP, 2011): 597 alimentos, 21.147 valores nutricionais**,
  17 categorias, 80 definições de nutriente (macros, minerais, vitaminas, 19 ácidos graxos
  individuais e 18 aminoácidos).
- Obtida do **XLSX oficial publicado pelo NEPA** — sem scraping, sem cópia de terceiros, sem
  valor gerado por IA. A obra declara: *"É permitida a reprodução parcial ou total desta
  obra, desde que citada a fonte"*; a citação aparece na interface.
- **Pipeline determinístico e reexecutável**, com SHA-256 do arquivo de origem no manifesto:
  `scripts/nutrition/build-taco-dataset.mjs` (XLSX → dataset + manifesto) e
  `generate-taco-migration.mjs` (dataset → 8 migrations idempotentes). Atribuição, licença e
  decisões de fidelidade em `data/nutrition/taco-4/ATTRIBUTION.md`.
- **Marcadores da fonte preservados um a um:** branco = "análises não solicitadas",
  `Tr` = traço, `NA` = não aplicável, `*` = "as análises estão sendo reavaliadas" (21
  alimentos ficaram `is_verified = false` por isso). Carboidrato levemente **negativo** em
  pescados/carnes magras — resultado real do cálculo por diferença da própria TACO — foi
  **preservado como publicado**, não "corrigido" para zero.
- **Medidas caseiras não foram inventadas:** a TACO não publica medida caseira por alimento.
  A estrutura, a UI e o cálculo estão prontos; o usuário cadastra as suas e o pipeline aceita
  uma segunda fonte oficial depois. Registrado como fora de escopo, não silenciado.

### Schema — 10 tabelas + 1 view (RLS + FORCE RLS em todas)
`nutrition_nutrients` (catálogo global de referência, **somente leitura: nenhuma policy de
escrita**), `nutrition_food_sources`, `nutrition_food_categories`, `nutrition_foods`,
`nutrition_food_nutrients` (**única fonte de verdade** de nutriente),
`nutrition_food_measures`, `nutrition_food_prefs`, `nutrition_food_tags`,
`nutrition_food_tag_links`, `nutrition_import_batches` + view `nutrition_foods_view`
(`security_invoker = true`). **Total do projeto: 57 tabelas.** Security advisor: **0 lints de
schema**.

- **`user_id` nulo = linha global, imutável.** As policies são **separadas por comando**
  (SELECT alcança o global; INSERT/UPDATE/DELETE só o próprio) — é o que permite ler a base
  oficial sem nunca poder reescrevê-la. Uma constraint amarra `user_id is null` a
  `is_system_food`, então não dá para forjar um alimento "oficial".
- **Preferência ≠ alimento.** Favoritar, arquivar e até **recategorizar** um alimento global
  gravam em `nutrition_food_prefs`. (A recategorização nasceu de um caso real: a TACO lista
  "Biscoito, polvilho doce" em *Verduras e hortaliças*, porque a tabela é alfabética dentro
  da seção. Corrigir na base seria reescrever a fonte; o override resolve sem mentir.)
- A **view pivota** os nutrientes quentes para ordenar/filtrar sem N+1 — derivação, nunca
  segunda fonte de verdade.

### Núcleo de cálculo puro (+82 testes) — suíte: 589 → **671**
- `units.ts` — conversão medida → base. **Conversão impossível é erro tipado, nunca
  estimativa**: gramas → mililitros exigiria densidade, e densidade chutada é dado inventado.
  Nenhuma conversão genérica entre alimentos (colher de arroz ≠ colher de azeite).
- `calc.ts` — fórmula única (`nutriente × quantidade ÷ base`, com a base lida do alimento,
  nunca assumida como 100), propagação de qualidade, energia estimada por Atwater **separada**
  da declarada, e arredondamento **só na apresentação**.
- `filters.ts` — busca sem acento por múltiplos termos, 13 filtros combináveis, ordenação e
  serialização URL ↔ filtros (testada como ida e volta).
- A suíte passa em `TZ=UTC`, `America/Sao_Paulo` e `Asia/Tokyo`.

### Interface
- Item **"Dieta e Alimentação"** na sidebar (grupo **Saúde**, ícone maçã).
- **Visão geral** (`/nutricao`) com o estado real do catálogo e a procedência da base.
- **Catálogo** (`/nutricao/alimentos`): busca instantânea, 13 filtros combináveis com
  contagem, ordenação, seleção múltipla e ações em massa (favoritar/arquivar/restaurar/
  excluir, com confirmação e relatório do que foi ignorado), criar/editar/duplicar/excluir,
  lista incremental (60 por vez).
- **Painel de detalhe** com 4 abas: **calculadora de porção** (usa o núcleo de ponta a ponta),
  todos os nutrientes agrupados com estado de valor, **medidas caseiras** (CRUD) e
  **procedência** (fonte, edição, código original, data de verificação e citação).
- **No formulário, campo vazio = "não informado"**, nunca zero — a UX foi desenhada a partir
  da regra de dado.
- 10 rotas de submódulo já existem e dizem honestamente em qual subfase chegam.

### Segurança — 10 verificações de RLS executadas pela role `authenticated`
Ler a base global: OK (597). Editar / excluir alimento global: **0 linhas**. Alterar nutriente
da base: **0 linhas**. Inserir com `user_id` de terceiro: **bloqueado**. Forjar alimento "da
base": **bloqueado**. Escrever no catálogo de nutrientes: **bloqueado**. Gravar valor com
estado `nao_disponivel`: **bloqueado**. Medida sem conversão: **bloqueado**. Favoritar
alimento da base: **permitido** (é preferência do usuário). Resíduos do teste removidos e
integridade reconferida.

### Verificação
`npm run test:run` (**671 testes**), `npm run lint`, `npx tsc --noEmit` e `npm run build`
passam. Rotas privadas respondem **307 → /login**. Nenhuma fase anterior foi tocada.

---

## Iteração 2026-07-28 — as 3 pendências do TO-DO foram fechadas

Logo após a Fase 15, a pedido do usuário. **Testes: 529 → 589.**

1. **Entrada em linguagem natural — implementada.** `src/lib/todo/parse.ts` (função pura com
   `hoje` injetado, **37 testes**) reconhece data, hora, prazo, prioridade, `#projeto`,
   `@etiqueta` e recorrência. O `QuickTaskInput` mostra chips do que foi entendido **antes**
   de salvar e **nunca reescreve o texto digitado**; há botão para desligar a interpretação.
   `todoQuickTaskSchema` ganhou `deadline_at` para o chip "Prazo final" não prometer algo que
   não seria salvo.
2. **Sincronização com Google Agenda — implementada, opt-in.** `google-event.ts` (mapeamento
   puro, **16 testes**) + `calendar-sync.ts` (I/O, `server-only`, best-effort). Nova coluna
   `google_integrations.todo_sync_enabled` (default `false`) e interruptor em `/agenda`.
   **Correção de premissa:** a Fase 15 registrou que faltava escopo OAuth de escrita — estava
   errado; a Fase 08 sempre pediu `calendar.events` (leitura **e** escrita) e já escrevia
   eventos. **Recorrente não vira RRULE**: enviamos só a ocorrência atual e movemos o mesmo
   evento a cada conclusão, coerente com o modelo de "a série avança na própria linha".
3. **Actions sem gatilho — todas expostas.** Arraste na navegação (projetos, etiquetas,
   filtros salvos), mover seção pelo menu da coluna no Kanban, mesclar etiquetas no
   `LabelDialog`, editar/excluir filtro salvo no `SaveFilterDialog`. Descoberto no caminho:
   **editar/excluir etiqueta era impossível pela interface** — agora há um lápis em cada
   linha. Criada a action `reorderTodoSavedFilters`, que não existia.

**Total do projeto após a iteração: 47 tabelas, 589 testes.** Migration nova:
`20260728120000_todo_google_sync.sql`.

## O que foi implementado na Fase 15 (Módulo TO-DO)

Gerenciador de tarefas completo em `/todo`, inspirado na *experiência* de ferramentas como o
Todoist (organização, velocidade, facilidade) — **sem copiar nome, logo, textos, ícones,
código, assets ou identidade visual de terceiros**. Segue integralmente o design system do
sistema (preto/branco/dourado, dark+light, Arial, shadcn/ui).

**Decisão arquitetural central:** o TO-DO usa **13 tabelas `todo_*` novas** em vez de evoluir
`tasks`/`projects` (Fase 09). Motivo: `tasks` está acoplado a `calendar_events.task_id`,
`generate.ts`, busca global, dashboard e ao kanban-por-status; remodelá-la para suportar
seções, subtarefas, `scheduled_date` + `deadline_at` e séries recorrentes exigiria mexer nos
cinco ao mesmo tempo — risco alto de regressão. **Consequência assumida:** o sistema tem
**dois módulos de tarefas coexistindo**; `/todo` é o gerenciador principal de execução e
`/tarefas` (Fase 09) segue vivo por causa das rotinas e do vínculo com a agenda. A separação
de responsabilidades está documentada no arquivo da fase.

- **Schema (13 tabelas, todas com RLS + FORCE RLS + policy `user_id = auth.uid()` + índices
  + trigger `updated_at`):** `todo_projects`, `todo_sections`, `todo_labels`, `todo_tasks`,
  `todo_task_labels`, `todo_recurrences`, `todo_completions`, `todo_comments`,
  `todo_reminders`, `todo_saved_filters`, `todo_activity`, `todo_preferences`,
  `todo_calendar_sync`. Security advisor: **0 lints de schema**. Total do projeto: **47 tabelas**.
- **Reuso, não duplicação:** anexos usam a tabela genérica **`attachments`** + bucket privado
  **`attachments`** (Fase 14) com `entity_type = 'todo_task'`; notificações usam a tabela
  **`notifications`** + `dedupe_key` + o Cron existente; drag-and-drop usa o **`SortableList`**;
  datas usam `hojeISO()`/`dateInSaoPaulo()`.
- **Regras críticas (puras, com datas injetadas, testadas):**
  - **`atrasada` NUNCA é gravado** — derivado na leitura de `scheduled_date`/`deadline_at`
    (`src/lib/todo/status.ts`), mesma regra das Fases 03/09.
  - **Recorrência** (`src/lib/todo/recurrence.ts`): modos **fixo** (calendário) e **após
    conclusão**; diária/semanal/mensal/anual; dias específicos da semana com ciclo de N
    semanas; dia do mês com clamp; **último dia do mês**; **primeiro/último dia útil**;
    **n-ésimo dia da semana do mês** (1ª..4ª e última); "somente dias úteis"; `ends_on`;
    `max_occurrences`; pausa. Toda a aritmética roda em **UTC interno** (`Date.UTC`) para
    eliminar o drift de fuso. Ano bissexto e virada de ano cobertos por teste.
  - **Não-duplicação de ocorrência:** concluir grava em `todo_completions` com unique
    `(user_id, task_id, scheduled_for)`; a tarefa recorrente **avança a própria linha** em vez
    de criar outra (preserva projeto, seção, prioridade, etiquetas e lembretes sem copiar
    nada). Reabrir **remove a última conclusão e volta a data** — não gera ocorrência extra.
    Verificado no banco real: a segunda conclusão da mesma data é rejeitada pelo unique.
  - **Nenhuma exclusão silenciosa:** excluir projeto exige escolher entre mover para a Caixa
    de entrada / mover para outro projeto / excluir tudo (com confirmação digitando
    "EXCLUIR"); excluir seção idem; excluir etiqueta remove **só a associação**; excluir série
    recorrente pergunta o escopo. Verificado no banco: excluir projeto move a tarefa para a
    caixa de entrada; excluir etiqueta mantém a tarefa.
  - **Concluir tarefa-mãe com subtarefas pendentes SEMPRE pergunta** (concluir tudo / só esta
    / cancelar).
- **UI (`/todo`):** navegação interna (Caixa de entrada, Hoje, Próximos, Todas, Concluídas,
  Projetos, Favoritos, Etiquetas, Filtros salvos, Projetos arquivados) — coluna fixa no
  desktop, gaveta no celular. Visões **lista** (agrupável, com subtarefas aninhadas e drag),
  **quadro/Kanban** (colunas = seções, drag entre colunas) e **calendário mensal** (drag
  reagenda). Painel de detalhes em drawer com abas Dados/Subtarefas/Notas/Histórico.
  Criação rápida com atalho **`T`**, `Enter` salva, `Ctrl/Cmd+Enter` salva e continua.
  Ações em massa, menu de contexto por tarefa, filtros combináveis e filtros salvos.
- **Integrações:** item **TO-DO** na sidebar; tipo **"Nova tarefa"** no lançamento rápido
  global; busca global passa a encontrar **tarefas, projetos e etiquetas do TO-DO** (com link
  que abre o painel da tarefa via `?task=`); **card TO-DO no Dashboard Geral**; notificações
  novas `todo_overdue` / `todo_today` / `todo_deadline` / `todo_reminder`, todas com
  `dedupe_key` determinístico (P1 atrasada tem destaque próprio); export de dados inclui as 13
  tabelas.
- **Fora do escopo (registrado, não silenciado):** entrada em linguagem natural (a
  arquitetura está preparada; a UI usa seletores convencionais) e **sincronização com Google
  Agenda** (a modelagem `todo_calendar_sync` existe com idempotência, mas **não há simulação
  de sync** — escrever eventos exige escopo OAuth de escrita que o projeto não tem).
- **Testes:** +115 testes puros novos (recorrência 53, status 26, filtros 36). Suíte total:
  **529** (era 414). `npm run lint`, `npx tsc --noEmit` e `npm run build` passam.

## Iterações (modo manutenção)
- **2026-08-07 — A divisão com terceiros fica visível na importação e na fatura.** A divisão já era **configurável** na revisão da importação e **editável** depois de criada; o que faltava era ela ser **visível na hora em que o número importa**. Na importação o resumo mostrava um número só (*"Total a importar R$ 3.003,26"*), que numa fatura majoritariamente de terceiro não responde a pergunta que se faz ao conferir — *quanto disso é meu?* —, e cada linha dividida trazia a badge *Compartilhada*/*De terceiro* **sem valor nenhum**: o rateio era digitado e sumia de vista. Na fatura, os itens mostravam "meu X · Fulano Y" mas **não diziam o tipo** da divisão, e uma compra 100% de terceiro aparecia como *"meu R$ 0,00 · Fulano R$ 70,03"*. **A conta nova não é uma conta nova:** o módulo puro `src/lib/import/split-totals.ts` (`divisaoDaLinha` + `divisaoPorStatus`) chama `dividirDespesa` — o **mesmo** motor que o `commitImport` usa ao gravar — alimentado pela **mesma** conversão reais→centavos, que para isso saiu de `split-persist.ts` (server-only) e desceu para o núcleo puro `split.ts` como `toPartesDivisao`. Uma segunda aritmética faria a revisão prometer um número e a fatura receber outro. **Três decisões que o módulo fixa:** (1) **estorno não é divisível** e volta **negativo**, para que `meu + Σ terceiros` feche o **líquido** do lote — é o que o `commitImport` já faz mandando crédito por `createCardEstorno`; (2) **divisão que não fecha é declarada, não chutada** — `setImportRowSplit` grava `split_parts` **sem conhecer o valor da linha**, então as partes podem somar mais que o total (ou o valor mudar no remapeamento); a linha sai **fora** dos somatórios, o lote se declara **parcial** e a tela diz quantas ficaram de fora, em vez de inflar a minha parte em silêncio; (3) a mesma pessoa em linhas diferentes vira **uma** entrada, da maior para a menor. **Telas:** o card do lote ganhou a linha `meu R$ X · Fulano R$ Y` sob o total — **nos dois estados**, revisando e depois de importado, porque é o mesmo card e a mesma tabela; e cada linha dividida mostra a sua divisão **ao lado da badge, na coluna Descrição**, nunca na coluna Valor (estreita e alinhada à direita, nome de pessoa ali empurra a tabela na horizontal — regra 3 de responsividade). Em `/faturas`, `PartesDoItem` passou a mostrar **badge + valores**, omitindo o `meu R$ 0,00` quando é 100% de terceiro. **A classificação é LIDA, nunca deduzida de `meu === 0`**: deduzir chamaria de *De terceiro* uma compartilhada cuja minha parte deu zero, e de *Compartilhada* uma de terceiro com resto de centavo — por isso `getStatementInstallmentItems` passou a embutir `classificacao` da **compra-pai** (a parcela herda o rateio, não o declara). **Sem migration.** 15 testes puros novos: suíte **2.829** (137 arquivos), lint/tsc/build ok. Desenho em `docs/superpowers/specs/2026-08-07-divisao-visivel-importacao-fatura-design.md`.
- **2026-08-07 — Terceiro e divisão em parcelamentos, faturas e lançamentos.** Relato do usuário sobre um parcelamento vindo da importação (`Credpag*Fianca Loft`, parcela 8/12): **não havia como ver de quem era a compra nem trocar o terceiro depois de criada**. A compra parcelada podia nascer dividida (`applySplitParcelado`, Fase 05), mas a divisão ficava intocável — `transaction-form.tsx` excluía `parcelado` do editor e `updateInstallmentPurchase` só mexia em descrição/categoria/observações. `/parcelamentos` não mostrava terceiro nenhum, e `/faturas` dizia quem paga a **fatura** sem dizer de quem é **cada compra**. Correção em três camadas. **(1) Um núcleo só:** a regra "a divisão mudou? posso mexer? para onde vai?" virou a função **pura** `decidirReaplicacao` (`src/lib/finance/split.ts`, 4 desfechos: `nada`/`bloqueado`/`limpar`/`reaplicar`) e o I/O virou `reapplySplit` (`src/lib/finance/split-reapply.ts`), parametrizado só pelo **modo** de distribuir — `applySplit` (à vista) × `applySplitParcelado` (parcelado). `reapplySplitOnEdit`, que era a cópia dessa regra dentro de `updateTransaction`, **deixou de existir**: as duas telas agora rodam o mesmo código, então não podem divergir. **(2) `updateInstallmentSplit`** (`src/lib/actions/installments.ts`) alcança as parcelas de faturas já **fechadas ou pagas** de propósito — é o caso de quem importou a fatura e só depois percebeu que a compra era de terceiro; o que protege o histórico é a recusa quando já há recebível `cobrado`/`pago`, **não** a data da fatura. A base divisível é a **soma das parcelas ATIVAS**, não `valor_total`: com parcela cancelada os dois divergem, e distribuir sobre o total contratado quebraria a invariante de `distribuirTerceirosPorParcela` (Σ terceiros ≤ Σ parcelas) — quando diferem, o diálogo **declara** a base. Pré-preencher não custou código novo: a compra parcelada **é** uma `transaction`, então `getTransactionSplit(parentId)` já servia. **(3) Defeito adjacente corrigido junto:** `cancelInstallmentFuture` marcava a parcela como `cancelada` e **não tocava nos `receivables` dela** — num parcelamento dividido, o terceiro ficava devendo por parcelas que não existem mais, e o valor seguia somando em "Quem paga esta fatura" e em `/terceiros`. Agora os recebíveis `pendente` das parcelas canceladas são apagados e o `valor_pessoal` do pai é recalculado; recebível `cobrado`/`pago` **recusa a ação inteira**, em vez de tirar a parcela da fatura e deixar a cobrança órfã. **Telas:** `/parcelamentos` ganhou `ClassificacaoBadge`, a linha "meu × cada pessoa", a parte do terceiro **em cada parcela** e o botão **Dividir**; `/faturas` e `/financeiro/lancamentos` passaram a mostrar o terceiro **item a item** (só leitura). O bloco de divisão, que estava **duplicado** em `transaction-form.tsx` e `import-split-dialog.tsx`, virou o componente controlado `src/components/financeiro/split-editor.tsx` e atende os **três** chamadores. **Nada de agregação mudou**: `dashboard.ts` e `/faturas` já derivavam *meu × terceiros* dos `receivables` por fatura, então gravar os recebíveis certos bastou para o número ficar correto em fatura, dashboard, relatórios e `/terceiros`. Os embeds novos levam **FK explícita** (`shared_expenses!shared_expenses_transaction_id_fkey`, `receivables!receivables_transaction_id_fkey`) porque `receivables` alcança `transactions` por mais de um caminho e ambiguidade de embedding do PostgREST só estoura em **runtime**. `TX_SELECT` base ficou sem o embed: `getTransactionsRange` varre até 2000 linhas para relatório/dashboard, que agregam por valor e não precisam de nome. **Sem migration.** 10 testes puros novos (`decidirReaplicacao` + `mesmaDivisaoCentavos`): suíte **2.843** — 4 falhas pré-existentes em `src/lib/ai/` (Bloco 4 da 18-C, em andamento na outra frente), zero em finanças. Desenho em `docs/superpowers/specs/2026-08-07-terceiro-divisao-parcelamentos-design.md`.
- **2026-08-07 — "A Receber": seleção múltipla e baixa em lote (eram 109 cliques).** Com 109 recebíveis em aberto de uma pessoa, dar baixa exigia clicar **Receber** em cada card — 109 idas ao servidor e 109 `router.refresh()`. Agora cada card tem checkbox, cada seção ("Em aberto", "Histórico") tem o seu "selecionar todos" e uma barra `sticky` oferece **quatro** ações em lote: **Receber** (com **data escolhível**, default hoje), **Cobrado**, **Ignorar** e **Desfazer**. Três decisões moram no módulo puro novo **`src/lib/finance/receivables-bulk.ts`**: (1) **`ORIGENS_DA_ACAO`** — de que status cada ação parte, com o **destino nunca na própria lista** (marcar como pago o que já está pago não é sucesso, é no-op, e contá-lo inflaria o número mostrado); (2) **`alcanceDaAcao`** — recorta a seleção pelo que está **visível** E pelo status alcançado, numa passada, devolvendo os descartes **contados** (`foraDoFiltro`, `naoAlcancados`); é a regra da lista de compras (`selectionInScope`) aplicada aqui: selecionar 109, filtrar para 5 e confirmar altera **5**, e a tela **declara isso antes**; (3) **`dividirEmBlocos`** — o UPDATE vai em blocos de **200 ids**, porque o PostgREST manda `id=in.(...)` na **query string** e 109 uuids já são ~4 KB: em lote grande a requisição estoura no proxy antes de o banco ver qualquer coisa. Na tela, **alcance zero esconde o botão** (desabilitado sem motivo visível só faz clicar e não entender), e o diálogo mostra quantidade + **valor** + o que fica de fora antes de agir. A barra é **`sticky top-18`**, não `top-0`: o Header é `sticky h-16` e uma barra em `top-0` escorregaria para trás dele (regra 5 de responsividade). No servidor, **`bulkSetReceivableStatus`** reaplica o filtro de origem (`.in("status", ORIGENS_DA_ACAO[acao])`) — a conta do client existe para mostrar o número, a garantia é do servidor; efeito colateral bem-vindo: a ação é **idempotente**. O toast usa `afetados` **devolvido pelo banco**, nunca o tamanho da seleção. Falha no meio do lote informa quantos já passaram, em vez de fingir que nada aconteceu. **Sem migration** (nenhuma coluna nova). 15 testes novos em `receivables-bulk.test.ts`. Desenho em `docs/superpowers/specs/2026-08-07-recebiveis-acao-em-massa-design.md`.
- **2026-08-06 — Importação: a fatura do mês seguinte reimportava a parcela já lançada (valor e recebível em dobro).** Relato do usuário: importar a fatura de julho e marcar "NETSHOES 5/12" como **parcelamento** cria de uma vez as parcelas 5..12; ao importar a fatura de **agosto**, a linha "6/12" passava batido e a fatura contava o mesmo gasto **duas vezes** — e, em compra de terceiro, o **recebível da pessoa era cobrado em dobro** (a parcela 6 já trazia o dela). Não era heurística frouxa: `existingKeysFor` monta as chaves lendo **só `transactions`**, mas a compra parcelada guarda ali apenas a **compra-pai** (o TOTAL, com a data de julho, `statement_id` NULL); quem ocupa a fatura de agosto é uma linha de **`transaction_installments`** — um lugar em que a dedup **nunca olhou**. A linha do arquivo (R$ 105, agosto) não bate com a compra-pai (R$ 840, julho) por nenhum campo. Correção: novo módulo puro **`marcarParcelasJaLancadas`** (`src/lib/import/parcelas-lancadas.ts`), que roda **depois** de `detectarDuplicados` (que segue intacta) e só encosta em linha que sobrou como `para_importar`. Três passes, do mais forte ao mais frouxo, cada parcela **consumida uma única vez**: (1) número + total + **descrição-base**; (2) número + total + **valor exato** (banco que reescreve o nome da loja entre os meses); (3) linha **sem** "k/N" → valor + descrição-base entre as parcelas da **competência do lote** — este passe **não roda sem competência**, porque sem ela some o filtro que segura o falso positivo. A **descrição-base** vem dos novos `removerMarcaParcela`/`descricaoBaseParcela` (`normalize.ts`): a marcação sai **antes** da normalização, senão `normalizarDescricao` viraria "5/12" em "5 12" e a mesma compra pareceria diferente a cada fatura; `POSTO 24/7` continua intacto (reusa as guardas de `parseParcela`). No servidor, `parcelasLancadasFor` lê `transaction_installments` com **`status = 'ativa'`** — parcela **cancelada** não ocupa mais a fatura, então não pode bloquear a linha. A linha casada vira **`duplicada`** com motivo nomeando o parcelamento (*"Já lançada como parcela 6/12 de «NETSHOES 5/12», na fatura de ago/2026."*), fica fora do commit e o botão **Importar** já existente destrava. A detecção de competência **subiu para antes da dedup** nos dois pontos de entrada (mesmo resultado: `detectarCompetenciaFatura` só lê data e total de parcelas). **Limite registrado:** a conferência roda no parse e no remap, **não** no commit — remarcar lá apagaria o "importar mesmo assim" do usuário; saída é **Reaplicar mapeamento**. **Sem migration.** 17 testes novos (12 do módulo + 5 dos helpers de descrição): suíte **2.332** (lint/tsc/build ok). Desenho em `docs/superpowers/specs/2026-08-06-aviso-parcelamento-ja-lancado-design.md`.
- **2026-08-06 — Faturas: "Quem paga esta fatura" mostra a MINHA parte.** A caixa listava só os terceiros, e quem paga a maior parte da fatura ficava de fora da própria lista de quem paga. O número já existia (`meu = total_atual − terceiros`) e só aparecia na linha resumida do card. Agora a caixa abre com **"Minha parte"** (termo já usado no `quick-add`) e o valor do título passou a ser o **total da fatura**, então as linhas somam o cabeçalho e a conta fecha na tela; o total de terceiros continua na linha resumida acima. Parte negativa (estorno maior que as compras próprias) é **exibida como está**, sem esconder nem zerar. Aproveitada a regra 2 de responsividade (`min-w-0` no texto, `shrink-0` no valor) — sem ela um nome longo empurra o valor para fora em card estreito. Só apresentação: nenhuma query, action ou migration.
- **2026-08-06 — Importação: a revisão avisa quando o ARQUIVO não cobre a fatura inteira.** Uma fatura importada fechou **R$ 7,96 abaixo** da fatura do banco (3.754,73 × 3.762,69) — e o sistema estava certo em tudo: o parse batia centavo a centavo com o arquivo (soma dos `TRNAMT` crus: compras 3.940,61, créditos 3.556,50), o total da fatura batia com a soma das linhas importadas, e as duas compras suspeitas de duplicidade estavam ambas lá. O que faltava estava **fora do sistema**: o OFX ia até **25/06** e a fatura só fechou em **04/07** — a compra de 03/07 (`Ifd*Ifood Club`, R$ 7,95) nunca esteve no arquivo; o R$ 0,01 restante é arredondamento de parcela. **Nenhuma tela tinha como mostrar isso** — a revisão só consegue conferir o que ESTÁ no arquivo, e o que não está não aparece em lugar nenhum. Nova função pura **`coberturaDaFatura`** (`src/lib/import/cobertura.ts`, `hoje` injetado) compara a última data do arquivo com a data de fechamento da fatura de destino (derivada da competência por `montarFatura`, mesma regra do resto do financeiro) e a revisão mostra o aviso: *"O arquivo vai até 25/06/2026, mas esta fatura só fecha em 04/07/2026 — 9 dia(s) sem cobertura"*. **Não avisa** quando a fatura ainda está **aberta** (arquivo parcial é o esperado; avisar seria ruído em toda importação em andamento), quando o intervalo é menor que `MIN_DIAS_AVISO` = 2 dias (ninguém compra todo dia) ou quando falta competência/dias do cartão/data válida — aviso sem base é pior que nenhum. `IMPORT_BATCH_SELECT` passou a trazer `dia_fechamento`/`dia_vencimento` do cartão, e `page.tsx` injeta `today={hojeISO()}`. **Sem migration.** 8 testes novos (o caso real, fatura aberta, tolerância de 1 e 2 dias, clamp de mês curto, virada de ano, entradas insuficientes): suíte **2.148** (lint/tsc/build ok).
- **2026-08-06 — Importação: o FITID manda na deduplicação, e linha destravada depois do commit chega à fatura.** Dois falsos positivos de duplicidade na primeira fatura importada pelo fluxo já corrigido, ambos por tratar **chave composta** e **identificador** como evidências independentes: (a) duas compras `Vmt*Gil & Par` de R$ 18,95 no mesmo dia, com **FITIDs diferentes** — a 2ª virava `duplicada` porque a chave composta (data+valor+descrição+cartão) é idêntica; (b) `Crédito de parcelamento de compra` (R$ 185,88, crédito) e `Parcelamento de Compra … 1/3` (R$ 67,19, compra) com o **mesmo FITID** — o Nubank reusa o identificador entre o crédito e a 1ª parcela, e o crédito virava `duplicada`. Agora o identificador manda nos **dois sentidos**: FITIDs diferentes ⇒ **não** é duplicata (o arquivo já afirmou que são transações distintas), e FITID igual só acusa duplicata quando a **chave composta também bate**; sem identificador em uma das linhas mantém o aviso, que o usuário resolve na revisão. Contra o que já existe no sistema a chave composta continua sozinha — `transactions` não guarda o identificador do arquivo. Junto: marcar "não é duplicidade" **depois** de importar não tinha para onde ir — `updateImportRow` e `commitImport` recusavam qualquer lote `importado`, e a linha nunca chegava à fatura. A trava passou a ser **por linha** (a que virou lançamento é imutável e aponta para Financeiro/desfazer; as demais seguem editáveis), `commitImport` **roda de novo** num lote importado (só processa `para_importar`, nada é recriado) e a revisão mostra em âmbar **quanto ainda não entrou na fatura** + botão **"Importar pendentes"**. **Sem migration.** 4 testes novos de dedup (os dois casos reais, o caso sem identificador e a duplicata contra o sistema): suíte **2.140** (lint/tsc/build ok).
- **2026-08-06 — Importação de fatura: a convenção de sinal não é universal (fatura inteira entrava como estorno).** Três sintomas relatados pelo usuário — (1) fatura importada e excluída continuava em Lançamentos **como "Estorno de cartão"**, deixando os relatórios negativos; (2) reimportar o mesmo arquivo acusava **tudo como duplicado**; (3) ao forçar a importação de uma duplicada, **sumiam "Importar parcelado" e a divisão com terceiros** — tinham **uma causa só**. `applyMapping` assumia, para origem `cartao`, que **valor negativo é crédito**: verdadeiro na planilha/CSV de fatura (compra positiva, estorno negativo), **falso no OFX** — padrão do Nubank e da maioria dos bancos —, onde a **compra vem negativa** (`TRNAMT < 0`, `TRNTYPE=DEBIT`) e o crédito positivo. Efeito no banco: a fatura Nubank de 07/2026 recebeu **48 compras como `type='receita'`** e ficou com `total_atual = −3.762,68` (o crédito **subtrai** na view). Os outros dois sintomas caem daí: a dedup compara pela **magnitude** do valor, e `deleteImportBatch` **não apaga transações** (por design), então o arquivo casava com os próprios lançamentos errados; e linha `tipo='receita'` não oferece divisão (`podeDividir` exige despesa) nem chega ao ramo de parcelamento do commit — `origem cartao + receita` desvia para `createCardEstorno`, que **não parcela e não divide**. Correção: nova função pura **`detectarSinalNegativoDespesa`** (`src/lib/import/mapping.ts`) decide a convenção **pelo arquivo**, por **contagem de linhas** (a soma não serve: o pagamento da fatura anterior é **uma** linha com magnitude parecida com a soma de todas as compras) e **exclui o pagamento da amostra** (`ehPagamentoFatura`) — é o crédito garantido de toda fatura e envenenaria a contagem num arquivo curto; empate → convenção da planilha. `applyMapping` passou a **respeitar `sinalNegativoDespesa` também em fatura** (o auto-ignore do pagamento acompanha o lado crédito, positivo ou negativo) e `parseImportFile` **detecta e grava** a convenção em `import_batches.sinal_negativo_despesa`. Na revisão: o **switch de sinal agora aparece também para fatura** (detecção errada é corrigível sem reupload) e cada linha mostra o **sentido — `Compra`/`Estorno` — clicável para inverter** (`updateImportRowSchema` já aceitava `tipo`, mas **nenhuma tela expunha**); trocar o sentido reabre parcelamento e divisão, e `podeParcelar` passou a exigir despesa. Nova action **`undoImportBatch`**: apaga os lançamentos que o lote criou e devolve as linhas para revisão, fechando o ciclo "errei → desfaço → reimporto" — bloqueia com **fatura já paga** ou **recebível já cobrado/pago**, e o delete cascateia parcelas, divisão e recebíveis pendentes. **Sem migration.** 7 testes novos (detecção nos dois formatos, empate, e o OFX ponta a ponta com parcela preservada): suíte **2.136** (lint/tsc/build ok). Detalhe completo em `docs/fixes/IMPORTACAO_SINAL_FATURA.md`.
- **2026-07-20 — O sistema inteiro passa a operar em `America/Sao_Paulo`, nunca em UTC.** Auditoria completa (financeiro, agenda/tarefas/notificações, hábitos/estudos/busca/export) achou ~25 pontos onde o fuso vazava. Raiz: na Vercel o Node roda em **UTC**, e tudo que lê o fuso "local" — `date-fns` (`startOfDay`/`isSameDay`/`format`), getters de `Date` e `Intl` **sem** `timeZone` — respondia em UTC no servidor; entre **21h e 00h (BRT) o dia virava**. Correção em três camadas: **(1) `TZ=America/Sao_Paulo`** no processo (novo **`src/instrumentation.ts`**, que roda antes do app em todo boot/cold start, + scripts do `package.json` para dev/build/test baterem com produção); **(2) formatadores explícitos** — `dateFormatter` ganhou `timeZone`, `formatDate`/`formatDateWith` agora separam **data pura** (`'yyyy-MM-dd'` reordenada como TEXTO, imune a qualquer fuso) de **instante** (lido em Brasília), e entraram os helpers `timeInSaoPaulo`, **`saoPauloWallClockToInstant`** (hora digitada = hora de Brasília, não do fuso do aparelho), `toDateTimeLocalInSaoPaulo` e as constantes `TIMEZONE`/`SAO_PAULO_UTC_OFFSET` (offset fixo: sem horário de verão desde 2019); **(3) correção dos pontos onde a data vinha de instante** — o `TZ` não conserta `.slice(0,10)` de um timestamptz, que é sempre UTC. Bugs de dado corrigidos: **`bills.ts`** lançava a conta fixa na **competência errada e duplicava** a despesa na virada do mês (a guarda de duplicata comparava a data deslocada); **`dashboard/queries.ts`** montava a janela do card Agenda em UTC (deslocada 3h **todo dia**) e derivava "hoje" com `format(now)`; **`search/queries.ts`** dava data errada e **link quebrado** para evento das 21h-00h; **`reports/tasks.ts`** jogava tarefa concluída domingo à noite na semana seguinte; mais `financeiro/page.tsx` (mês corrente), `agenda-card.tsx`, `export/route.ts` (nome do backup), `period.ts`, `regional-card.tsx`. Agenda: `calendar/format.ts` distingue **instante** (novo helper **`emBrasilia`**, aplicado em `agenda-card`/`upcoming-events`/`event-details`) de **data de grade** (não converte — converter deslocaria um dia); `notification-meta.tsx` ganhou `timeZone`. Entrada do usuário (`event-form`, `quick-add`, `task-form`) passa a ancorar hora de parede em UTC-3 em vez de usar o fuso do dispositivo. **Crons da Vercel são sempre UTC** → `vercel.json` virou `0 12`/`0 0` para rodar de fato às **09h/21h de Brasília** (antes rodava 06h/18h). **Sem migration.** 6 testes novos de fuso; a suíte roda verde em **`TZ=UTC`, `America/Sao_Paulo` e `Asia/Tokyo`** — prova de que a correção não depende do fuso do ambiente. Suíte **421** (lint/tsc/build ok). **Resíduo conhecido:** o agrupamento por dia da grade da Agenda (`calendar/events.ts`, `grid.ts`, `upcoming.ts`, `recurrence.ts`) usa `date-fns` no fuso ambiente — correto no servidor (fixado) e em aparelho brasileiro, mas ainda seguiria o dispositivo num aparelho configurado em outro fuso.
- **2026-07-19 — Pagar fatura permite escolher a DATA do pagamento (bate com o extrato do banco).** O diálogo **Pagar** de `/faturas` só pedia a conta e carimbava **hoje** (`hojeISO()` no lançamento, `new Date()` em `pago_em`). Quem lança a fatura dias depois de pagar ficava com o lançamento na data errada — o extrato do banco não batia com o app. Agora o diálogo tem o campo **"Data do pagamento"** (`<input type="date">`, **default hoje**, editável para datas retroativas ou futuras) e o valor viaja até o lançamento: `markStatementPaid(id, contaId, dataPagamento?)` → `montarPagamentoFatura` (o parâmetro `hoje` virou **`dataPagamento`**, mesma injeção sem `Date.now()`) → `purchase_date`/`competence_date`. `card_statements.pago_em` (timestamptz) também passa a refletir a data escolhida via helper **`pagoEmTimestamp`**, que grava **meio-dia UTC** (= 09h em São Paulo) para a data cair no **mesmo dia do calendário** em leitura no fuso BR — meia-noite UTC voltaria um dia. `pagamentoFaturaSchema` ganhou `dataPagamento: dateString.optional()` (ausente → servidor usa `hojeISO()`, então chamadas antigas de 2 args seguem válidas). **Sem migration** (a coluna já existia). **Sem impacto em status/relatórios:** `statusEfetivo` só testa a *presença* de `pago_em`, e o pagamento continua `transferencia` (fora de entradas/saídas e do total da fatura). Teste novo de data retroativa em `statement-payment.test.ts`: suíte **415** (lint/tsc/build ok).
- **2026-07-19 — Apagar o pagamento de fatura pela tela de Lançamentos agora reabre a fatura.** O pagamento de fatura é um lançamento `transferencia` comum, então aparece em Lançamentos com Editar/Excluir. Excluir por ali estornava o saldo da conta (o lançamento some) mas deixava a fatura **marcada como paga** — o FK `card_statements.pago_transacao_id` é `on delete set null`, ou seja, zerava o ponteiro sem limpar `pago_em`/`status`/`pago_conta_id`. Resultado: fatura "paga" apontando para o nada, só destravável pelo "Desfazer" em `/faturas`. Agora `deleteTransaction` detecta que o lançamento quita uma fatura (helper **`statementPaidBy`**) e a reabre (`status='aberta'`, campos de pagamento nulos) — mesmo efeito do `markStatementUnpaid`. Junto, o mesmo helper cobre a **edição**: editar uma transferência apaga e recria a linha, então o pagamento recriado voltaria com **outro `id`** e a fatura perderia o vínculo; `updateTransaction` religa `pago_transacao_id` ao lançamento recriado (**editar o pagamento não desfaz o pagamento**). `revalidateTransactions()` já revalida `/faturas` e `/cartoes`. **Sem migration** (só comportamento das actions); nada a testar em unidade (é I/O puro, como `markStatementUnpaid`). Suíte **414** (lint/tsc/build ok).
- **2026-07-19 — Transferência entre contas não mexia no saldo (agora é UMA linha, não duas).** Registrar uma transferência não alterava o saldo de nenhuma das contas (ex.: Cofre travado no `initial_balance` de R$756,18 mesmo com 3 transferências recebidas). Causa-raiz: **contradição entre schema e cálculo**. A migration `20260625120300_transactions` documentou transferência como **DUAS linhas espelhadas** (A→B e B→A, mesmo `transfer_group_id`) e `createTransaction` gravava as duas; mas `public.account_balance` (`20260625120600`) já deriva **os dois lados de UMA linha** (`-amount` em `account_id`, `+amount` em `transfer_account_id`). Com o par, cada conta recebia `-amount` de uma perna e `+amount` da outra → **soma zero**, sempre. Efeito colateral: o par era **simétrico e sem marcador de direção**, então a origem/destino exibida na lista dependia do desempate arbitrário do `ORDER BY` (as duas linhas têm `competence_date` e `created_at` idênticos). Correção: `createTransaction` passa a inserir **uma linha** (origem em `account_id`, destino em `transfer_account_id`; `transfer_group_id` permanece como marcador de "isto é transferência", usado por update/delete/status, que já operavam por grupo). Migration **`20260720030000_transferencia_uma_linha`** (idempotente): apaga a perna espelhada mantendo a de **origem** (a gravada primeiro, menor `ctid` — a que o app já exibia) e cria índice único parcial **`transactions_transfer_group_unique`** em `transfer_group_id` para o par não voltar. A dedup por grupo em `transactions-client.tsx` virou desnecessária e saiu. **Dados:** 3 transferências Mercado Pago → Cofre corrigidas — Cofre 756,18 → **1.891,04**; Mercado Pago 6.222,70 → **5.087,84**. **Sem mudança em relatórios/dashboard** (`transferencia` já ficava fora de entradas/saídas). Suíte **414** (lint/tsc/build ok). **Pendência conhecida (pré-existente, não tocada):** 2 linhas `type='transferencia'` com `transfer_account_id` nulo (R$156,50 Itaú "Pagamento fatura junho" e R$4.262,45 Mercado Pago) — funcionam como saída pura da conta, sem destino; é o formato que o pagamento de fatura usa de propósito.
- **2026-06-27 — Ordenação manual (drag-and-drop) de Hábitos e Rotinas.** Antes a ordem dos cards era fixa (`position` só era gravada na criação, sem como reorganizar). Agora dá para **arrastar e soltar por uma alça (⠿)** em **Hábitos → "Gerenciar"** e em **Rotinas → "Todas as rotinas"** (só os cards de topo; itens internos da rotina ficam fora de escopo). A nova ordem grava na coluna `position` (**já existia** em `habits`/`routines`; as queries já faziam `ORDER BY position`) e passa a valer em todas as telas, inclusive "Hoje" — a visão "Hoje" dos hábitos já respeita a ordem porque o `Array.sort` por `todayDone` é **estável** sobre a lista ordenada por `position` (pendentes/feitos mantêm a ordem manual dentro de cada grupo). **Sem migration/RPC:** as actions novas **`reorderHabits`/`reorderRoutines`** gravam `position = índice` via updates em paralelo (`Promise.all`, filtrando `id`+`user_id`; single-user, poucos itens). Lib **`@dnd-kit`** (core+sortable+utilities) instalada; componente reutilizável **`SortableList`** (`src/components/shared/sortable-list.tsx`) com alça dedicada (só ela arrasta — botões Editar/Ativar/Excluir seguem clicáveis), acessível por teclado e com sensor de toque (delay p/ não brigar com scroll). **Optimistic UI** nas duas telas (reordena na hora; em erro → toast + `router.refresh` reverte; sincroniza a prop do servidor via ajuste de estado no render, sem `useEffect` — exigência do lint do React 19). Lógica pura **`reorderedPositions`/`arrayMoveById`** (`src/lib/shared/reorder.ts`) com testes. Arquivos: a lib, o componente, `actions/habits.ts`, `actions/routines.ts`, `habitos/habits-client.tsx`, `rotinas/routines-client.tsx`. Testes novos (`reorder.test.ts`, 6 casos): suíte **414** (lint/tsc/build ok). Spec em `docs/superpowers/specs/2026-06-27-ordenacao-habitos-rotinas-design.md`.
- **2026-06-27 — Recorrência em cartão de crédito (assinaturas mensais caem na fatura).** Em Financeiro → Recorrências só dava para vincular **conta**: o dropdown de forma de pagamento já listava "Cartão de crédito" (o enum `PAYMENT_METHODS` é compartilhado com lançamentos), mas ao escolher cartão **não aparecia seletor de cartão**, o form ainda pedia **Conta**, e salvar **quebraria** — a tabela `recurring_transactions` não tinha `card_id` nem aceitava `cartao_credito` no CHECK de `payment_method`. Agora: ao escolher cartão, o form **substitui "Conta" por "Cartão"** (cartões ativos + o cartão atual mesmo inativo, p/ edição não perder a seleção), **força tipo = despesa** (só despesa resolve fatura) e **não toca em conta**. Na geração, **cada ocorrência** vira despesa no cartão e é resolvida para a **fatura da sua data** via `resolveOrCreateStatement` (mesma regra pura `resolverFatura` da compra avulsa) — o `account_id` fica **null**. Migration **`20260627000000_recurring_card_support`** (idempotente; espelha a de `transactions`): `card_id` FK `on delete set null` + recria o CHECK com `cartao_credito` + índice `(user_id, card_id)`; `supabase.ts` ajustado. Validação cruzada no Zod (`superRefine`): cartão → `card_id` obrigatório e tipo despesa; sem cartão → `card_id` nulo. **Cartão excluído** deixa a recorrência **órfã** (`card_id` vira null com `payment_method` ainda `cartao_credito`) → a geração **pula** (não insere transação sem fatura, não avança `next_due_date`) sem travar as demais. Lógica pura nova **`buildGeneratedRow`/`isCardRecurrence`** em `src/lib/finance/generation.ts` (extraídas para teste; statement é I/O resolvido por data). Arquivos: a migration, `validators/recurring.ts`, `actions/recurring.ts`, `finance/generation.ts`, `finance/queries.ts` (join `card:credit_cards`), e `financeiro/recorrencias/{page,recurring-client,recurring-form}.tsx`. Testes novos (`generation.test.ts`, 5 casos): suíte **407** (lint/tsc/build ok).
- **2026-06-27 — Embed ambíguo no `getTransactions` esvaziava as listas (à vista somem das faturas; afeta Lançamentos/Dashboard).** Regressão de runtime introduzida pela feature de pagamento de fatura: a migration `20260627140000` adicionou `card_statements.pago_transacao_id → transactions.id`, criando um **2º FK** entre `transactions` e `card_statements`; ao mesmo tempo o `TX_SELECT` passou a embutir `statement:card_statements(id,pago_em)` **sem desambiguar o FK**. Com 2 relacionamentos, o PostgREST 14.5 responde **`PGRST201` (HTTP 300)** e o `getTransactions` cai em `data ?? []` → **lista vazia**. Sintoma visível em `/faturas`: o detalhe da fatura só mostrava as **parcelas** (vêm de `getStatementInstallmentItems`) — sumiam **à vista e estornos** (vêm do `getTransactions`); o mesmo afetava **Lançamentos** e o **Dashboard**. Não pega em build/tsc/lint/testes (erro só de runtime). Correção (1 linha em `src/lib/finance/queries.ts`): desambiguar como o `accounts` já fazia na mesma string → **`statement:card_statements!transactions_statement_id_fkey(id,pago_em)`**. Verificado contra o REST real: antes `HTTP 300/PGRST201`, depois `HTTP 200`. Sem migration, suíte **401** (lint/tsc ok). **Aprendizado:** ao adicionar um FK que cria um 2º caminho entre tabelas já usadas em embeds PostgREST, **todo `select` que embute aquela tabela precisa do hint `!nome_do_fk`** — varrer os `*_SELECT` em `queries.ts`.
- **2026-06-27 — Pagar fatura debita uma conta (sem duplicar relatórios) + resolve a pendência do "seletor de conta".** O botão **Pagar** da fatura abre um diálogo que **sempre pede a conta** a debitar e cria **um lançamento de pagamento tipo `transferencia`** (sai da conta escolhida, status `pago`, `amount` = `total_atual` da fatura, **sem** `statement_id`/`card_id`, sem 2ª perna). Por ser transferência, **não infla** despesas/relatórios (o `dashboard` exclui `transferencia`/`ajuste`) **nem** o `total_atual` da fatura (a view só soma despesa/receita/parcelas) → **zero duplicação**; e **abate o saldo** da conta (a `account_balance` conta `transferencia` no lado `account_id`). **Desfazer** deleta esse lançamento (estorna o saldo) e limpa os campos. A fatura ganhou `pago_conta_id`/`pago_transacao_id` (migration **`20260627140000_card_statements_pagamento`**, idempotente; `supabase.ts` regenerado). Na lista de **Lançamentos**, item de cartão exibe **pago/em aberto DERIVADO** da `pago_em` da fatura (não do status gravado) — `getTransactions` passou a embutir `statement:card_statements(id,pago_em)`. **Resolve a pendência** registrada abaixo (`markStatementPaid(id)` sem `contaId`): assinatura agora **`markStatementPaid(id, contaId)`** e `build`/`tsc` voltam a passar. Lógica pura **`montarPagamentoFatura`** (`src/lib/finance/statement-payment.ts`, 4 testes). Bloqueios: fatura já paga e total ≤ 0 (botão oculto). Suíte **401** (lint/tsc/build ok).
- **2026-06-27 — Importar fatura parcelada + divisão "por valor": recebível do terceiro vinha dividido por `qtd`.** Numa fatura de terceiro, a divisão de uma linha parcelada **por VALOR** ficava com o recebível **dividido pelo nº de parcelas** (ex.: SUZY com R$147,50/parcela aparecia como **R$73,75**). Causa-raiz (confirmada no banco): no diálogo de divisão da revisão o usuário digita/prevê a parte contra **uma parcela** (o valor da linha), mas `createInstallmentPurchase`/`applySplitParcelado` dividem a parte de cada pessoa pelo **total da compra** (`valor_total = parcela × qtd`) e a espalham nas `qtd` parcelas → toda parte **por valor** saía dividida por `qtd` (percentual não, pois P% da parcela = P% do total). Correção: nova função pura **`escalarPartesParcelado`** (`src/lib/import/parcelamento.ts`) multiplica as partes **por valor** por `qtd` (em centavos) antes de chamar o motor; `commitImport` aplica só no ramo do parcelamento. Agora o recebível por parcela bate com o preview. **Sem migration** (lógica do commit). Testes novos (6 casos de `escalarPartesParcelado`): suíte **401**. **Dados:** as 2 compras afetadas (todas "100% do terceiro", parcelas uniformes) foram corrigidas via SQL — **Bruna Biju 2** (Suzy: recebíveis 73,75→**147,50** ×2, `valor_pessoal` 147,50→**0**) e **Cea Bau 383 Ecpc** (Nicole: 30/29,99→**59,99** ×2, `valor_pessoal`→**0**). Total da SUZY em jun/2026 voltou aos **R$773,53** exatos. As compras com divisão **por percentual** (Anuidade, Ren Sushi, outra Cea) já eram autoconsistentes e não foram tocadas. **Pendência separada (pré-existente, não deste fix):** `npm run build`/`tsc` falham em `faturas/statements-client.tsx:260` — `markStatementPaid(id)` foi chamado sem o 2º arg `contaId` (recurso "marcar fatura como paga" meio-ligado no commit `b8696b5`); precisa de seletor de conta.
- **2026-06-27 — Estorno de cartão não infla "Entradas"/Receitas + rótulo na lista.** O estorno (receita vinculada à fatura, `account_id` nulo) aparecia em Lançamentos como **"Receita + Recebido"** e era somado em `entradasCent` no `resumoMes` — mas o estorno **também** já reduz o `total_atual` da fatura, então era **contado em dobro** (inflava as Entradas do mês no Painel/Relatórios/evolução/comparativo, que reusam `resumoMes`). **Saldo das contas NÃO era afetado** (a função `account_balance` só soma transações com `account_id`/`transfer_account_id`; estorno tem ambos nulos). Correção: em `resumoMes`, receita com `card_id` **não** entra em `entradas` (já está no total da fatura) — corrige evolução/comparativo/dashboard por reuso. UI: novo **`EstornoBadge`** ("Estorno de cartão") substitui "Receita + Recebido" na lista de lançamentos (detecção `type='receita' && card_id != null`). Teste novo em `dashboard.test.ts`: suíte **391** (lint/tsc/build ok). Sem migration (lógica de leitura).
- **2026-06-27 — Importação de fatura: parcelas iam para meses passados (faturas "Atrasada") + total da fatura errado.** Numa fatura de cartão, a linha "k/N" e a **última parcela "N/N"** trazem a **data da compra ORIGINAL** (meses atrás), não a data desta fatura. `commitImport` ancorava a fatura de destino nessa data antiga (`resolveOrCreateStatement(data_norm)` / `distribuirFaturas(data_norm)`), então a parcela `k` caía na fatura da compra original e espalhava `k…N` por **meses passados** — gerando faturas-fantasma "Atrasada" **e** drenando o total da fatura atual (as à vista, de data recente, caíam certo; só as parcelas/últimas vazavam). Causa única dos dois sintomas. Correção: **toda linha do arquivo pertence à fatura sendo importada**. Nova competência-âncora por lote: detectada das **compras à vista** (pura `detectarCompetenciaFatura`, `src/lib/import/competencia.ts`) e **confirmável na revisão** (campo "Fatura de destino", input de mês → `setImportBatchCompetencia`); gravada em **`import_batches.competencia_fatura`** (migration `add_competencia_fatura_to_import_batches`). `commitImport` ancora **todas** as linhas de cartão nela: parcela `k` → fatura importada e `k+1…` nos meses seguintes (`planejarParcelamento`/`distribuirFaturas` ganharam `competenciaBase`; `installmentPurchaseSchema.fatura_inicial_competencia`), última parcela e à vista via `transactionSchema.statement_competencia` + novo `getOrCreateStatementForCompetencia`, estorno idem. Fallback quando não há à vista p/ inferir: fatura aberta de hoje. Testes novos (`competencia.test.ts`, `competenciaBase` em `installments.test.ts`): suíte **390** (lint/tsc/build ok). `src/types/supabase.ts` regenerado. **Dados:** o lote `fatura-azul-julho` foi desfeito e **reimportado** corretamente — junho fechou nos **R$ 4.262,45** exatos e nenhuma parcela em mês passado. **Faturas vazias:** o desfazer deixou faturas com **0 lançamentos** (criadas pelo get-or-create) aparecendo como "Atrasada". Correção durável: `getStatements` passou a filtrar **`itens > 0`** (fatura sem lançamento não lista nem conta em faturas/dashboard/relatórios) e as 5 faturas vazias do cartão foram apagadas.
- **2026-06-27 — Importar fatura "como parcelado": valor da parcela + só as restantes.** Numa fatura de cartão, a linha "k/N" traz o valor de **uma parcela** — não o total da compra. O "Importar parcelado?" antes passava `valor_total = valor da linha` e `qtd = N`, então "5/12 R$105" virava 12 parcelas de **R$8,75** (105÷12) começando do zero. Agora: nova lógica pura **`planejarImportParcelado`** (`src/lib/import/parcelamento.ts`) — cada parcela = valor da linha; gera **só as restantes** (`N − k + 1`, da atual `k` até a última `N`); então "5/12 R$105" → **8 parcelas de R$105** numeradas **5/12…12/12** (a 5ª nesta fatura, as 6–12 nas próximas). `commitImport` calcula via essa função e passa `numero_inicial`/`parcelas_total_label` ao motor reusado. `planejarParcelamento` ganhou `numeroInicial` (offset; default 1, fluxo manual intacto) e o schema ganhou `numero_inicial`/`parcelas_total_label` (opcionais). UI: o botão **"Importar parcelado?"** some na **última parcela** (k = N, ex.: 3/3 — não há futuro a gerar); ao marcar, o chip vira **"Como parcelamento ✕"** com um **× para cancelar** (reverte para avulso na própria revisão); `commitImport` também trata `k = N` como despesa avulsa. **Sem migration** (só comportamento do commit). Testes novos (`parcelamento.test.ts` + offset em `installments.test.ts`): suíte **382** (lint/tsc/build ok).
- **2026-06-27 — Importação: total monetário na revisão + estornos de cartão.** Duas mudanças ligadas:
  - **Total na revisão:** o resumo do lote em `ImportReview` mostra **"Total a importar"** — soma das linhas `para_importar` (ignoradas/duplicadas fora), para conferir contra a fatura/extrato antes do commit. Atualiza ao vivo; vira **"Total importado"** quando finalizado. O número-chave é o **líquido** (despesas − créditos); quando há créditos, exibe o detalhamento. Lógica pura **`totaisPorStatus`** (`src/lib/import/totals.ts`, soma em centavos) com testes.
  - **Estornos/créditos de cartão (corrige divergência com a fatura):** o "Total" revelou que a importação de fatura **inflava** o valor — estornos (valores negativos) eram somados como despesa. Raiz dupla: (1) `parseValorCentavos` não detectava o `-` **depois** do prefixo de moeda (`"R$ -5,14"` virava +5,14); (2) fatura de cartão forçava todo valor a `despesa`. Agora: `parseValorCentavos` detecta o sinal antes do 1º dígito; em fatura de cartão **valor negativo vira estorno (`receita`)** e o **pagamento da fatura** (`ehPagamentoFatura`: "pagamento/pagto/pgto") é **auto-ignorado**; `commitImport` cria o estorno como **receita vinculada à fatura** (`createCardEstorno`, insert direto — `createTransaction` só vincula despesa a `statement_id`). Migration **`20260627130000_card_statements_total_estornos`**: a view `card_statements_with_total` passa a **subtrair** as receitas vinculadas (`despesas − estornos + parcelas`) — sem regressão (não havia receita com `statement_id`). A tela `/faturas` destaca estornos (tag + verde). **Importante:** lotes já em revisão precisam **reaplicar o mapeamento** para reclassificar os estornos. Testes novos (sinal pós-moeda, negativo→estorno, auto-ignore de pagamento). Suíte **375** (lint/tsc/build ok).
- **2026-06-27 — Divisão com terceiros na edição e na importação.** Antes a divisão (Fase 05) só podia ser definida na **criação** manual. Agora:
  - **Dividir na edição:** `updateTransaction` passa a (re)aplicar a divisão de uma **despesa simples (não parcelada)** — reusa `applySplit`. Só re-aplica quando a divisão **muda de fato** (classificação, total ou partes), então editar só descrição/categoria/data de um gasto já dividido não mexe nos recebíveis. **Bloqueia** alterar a divisão se já houver recebível `cobrado`/`pago` (protege histórico). O form de lançamento mostra a seção de divisão na edição e **pré-preenche** com as partes gravadas (`getTransactionSplit` + `sharedExpensesToFormParts`). Parcelados seguem em `/parcelamentos`.
  - **Dividir na revisão da importação:** migration `20260627120000_import_rows_split` adiciona `classificacao` + `split_parts (jsonb)` a `import_rows`. Botão **"Dividir"** por linha (despesa) abre o editor (`ImportRowSplitDialog`) com preview; `setImportRowSplit` grava na linha; `commitImport` repassa a divisão para `createTransaction`/`createInstallmentPurchase` (já aceitavam) — então a transação importada **já nasce dividida**, inclusive parceladas.
  - **Correção:** `splitSchema` (validators/split) agora aceita valor no padrão BR (`"44,01"`, `"1.234,56"`) via `normalizeBRMoney` — antes `z.coerce.number` quebrava com vírgula, então "dividir por valor" só funcionava com inteiros.
  - Testes novos (`sharedExpensesToFormParts`, `validators/split`): suíte **362** (lint/tsc/build ok). `src/types/supabase.ts` regenerado após a migration.
- **2026-06-27 — Importação: detecção do cabeçalho fora da 1ª linha.** Faturas/extratos reais (ex.: export do Itaú/cartão Azul) trazem linhas de **título/resumo antes da tabela**, então o cabeçalho real não é a 1ª linha. `parseCsv`/`parseXlsx` pegavam o título (`Nome;Yuri…`) como cabeçalho → `autoDetectMapping` devolvia `{}` → **toda** linha caía em "Mapeie as colunas de data e valor.". Correção: nova função pura **`detectHeaderRow()`** (`src/lib/import/mapping.ts`) acha a 1ª linha (nas ~30 primeiras) cujo `autoDetectMapping` resolve **DATA e VALOR**; `csv.ts`/`xlsx.ts` fatiam a partir dela. **Fallback para a linha 0** → sem regressão em arquivos já tabulares. Também: **`parseParcela`** passou a entender **"Parcela X de N"** (formato Itaú), além de "k/N". Testes novos (`csv.test.ts`, casos de `detectHeaderRow` e parcela "de"): suíte **356 testes** (lint/tsc/build ok). Linhas de rodapé (Subtotal/aviso) saem como `erro` ignorável e nunca são importadas.
- **2026-06-26 — Conta/Segurança em Configurações (trocar e-mail + senha).** Novo card **`SecurityCard`** (`src/components/settings/security-card.tsx`) em `/configuracoes`, logo após o `ProfileCard`, com duas seções (Separator entre elas):
  - **Trocar senha** (estando logado): senha atual + nova + confirmar. Reautentica com `signInWithPassword({ email, current })` e, se ok, `updateUser({ password })` — **reflete na hora** em `auth.users`.
  - **Trocar e-mail**: `updateUser({ email }, { emailRedirectTo: \`${origin}/auth/callback?next=/configuracoes\` })` — fluxo **padrão seguro** do Supabase (confirma no e-mail antigo **e** no novo). Reusa o `/auth/callback` existente (`exchangeCodeForSession`). **Sem migration** (senha/e-mail vivem em `auth.users`).
  - Segue a **convenção de auth do repo** (client do navegador, igual `auth-form.tsx`), `react-hook-form` + `zodResolver`. Schemas puros em `src/lib/validators/auth.ts` (`changePasswordSchema`/`changeEmailSchema`) + testes `auth.test.ts` (6). Suíte: **348 testes** (lint/tsc/build ok).
  - **Config manual no Dashboard Supabase** (`yjvnlbjvippefvzgrxxw` → Authentication → URL Configuration), não exposto por MCP: incluir `http://localhost:3000/auth/callback` e o callback de produção na **Redirect URLs allow-list**; conferir **Site URL** e que **"Secure email change"/"Confirm email"** estão ativos.

## Fases
| # | Fase | Status |
| --- | --- | --- |
| 01 | Foundation, Arquitetura & Design System | ✅ Concluída |
| 02 | Financeiro Base | ✅ Concluída |
| 03 | Cartões de Crédito & Faturas | ✅ Concluída |
| 04 | Parcelamentos | ✅ Concluída |
| 05 | Gastos de Terceiros & Divisão | ✅ Concluída |
| 06 | Importação (Excel/CSV/OFX) | ✅ Concluída |
| 07 | Dashboard Financeiro | ✅ Concluída |
| 08 | Agenda & Google Agenda | ✅ Concluída |
| 09 | Demandas, Tarefas & Rotinas | ✅ Concluída |
| 10 | Hábitos | ✅ Concluída |
| 11 | Estudos | ✅ Concluída |
| 12 | Dashboard Geral | ✅ Concluída |
| 13 | Busca Global, Lançamento Rápido & Notificações | ✅ Concluída |
| 14 | Segurança, Responsividade & Polimento Final | ✅ Concluída |
| 15 | Módulo TO-DO completo (fora do roadmap original) | ✅ Concluída |
| 16-A | Dieta e Alimentação · Fundação, cálculo e catálogo | ✅ Concluída |
| 16-B | Dieta e Alimentação · Metas, diário e planejamento | ✅ Concluída |
| 16-C | Dieta e Alimentação · Receitas, refeições e substituições | ✅ Concluída |
| 16-D | Dieta e Alimentação · Lista de compras e despensa | ✅ Concluída |
| 16-E | Dieta e Alimentação · Medidas, evolução e relatórios | ✅ Concluída |
| 16-F | Dieta e Alimentação · Integrações e polimento | ✅ Concluída |

## O que foi implementado na Fase 14 (Segurança, Responsividade & Polimento Final)
- **Schema finalizado (idempotente)** em `supabase/migrations/`, aplicado no projeto `yjvnlbjvippefvzgrxxw`. Security advisor: **0 lints de schema** (resta só o aviso externo de Auth "leaked password protection"). **34 tabelas** no total (+ `attachments`) e **2 buckets** privados de Storage.
  - **`settings` estendida** (`20260626200000_settings_profile.sql`) — apenas **adiciona** colunas à store da Fase 12 (RLS já ativa): `display_name`, `avatar_url`, `theme` (default `system`), `currency` (default `BRL`), `date_format` (default `dd/MM/yyyy`), `notification_prefs jsonb`. **Nenhuma tabela de domínio nova** aqui.
  - **`attachments`** (`20260626200100_attachments.sql`) — anexos/comprovantes genéricos (`entity_type`/`entity_id` **sem FK**, `storage_path`, `file_name`, `mime_type`, `size_bytes`), **RLS + FORCE RLS** (`user_id = auth.uid()`), índices `user_id` e `(user_id, entity_type, entity_id)`, único `(bucket_id, storage_path)`, trigger `updated_at`. Espelha o padrão de `task_attachments` (Fase 09).
  - **Bucket `attachments`** privado (`20260626200200_attachments_storage.sql`) — policy de `storage.objects` por pasta `{user_id}/…` (mesmo padrão de `task-attachments`).
- **Relatórios consolidados (`/relatorios`)** — Server Component `force-dynamic` + `relatorios-client.tsx` com **5 abas** (Financeiro, Cartões, Hábitos, Estudos, Tarefas), filtro de **período (mês)** na URL e **exportação** (CSV por aba + "Baixar relatório (JSON)"). **REUSO, não reescrita**: `src/lib/reports/queries.ts` monta tudo reaproveitando `finance/dashboard.ts` (Fase 07), `getHabitsDashboard` (Fase 10), `getStudyDashboard` (Fase 11) e o agregador **puro** `src/lib/reports/tasks.ts` (sobre `tasks/status.ts` da Fase 09). Gráficos reaproveitam os componentes da Fase 07 (`CategoriaChart`/`FormaPagamentoChart`/`EvolucaoChart`/`MesAMesChart`/`ProjecaoChart`) + um `ReportBarChart` genérico novo. `loading.tsx` (skeleton).
- **Configurações finais (`/configuracoes`)** — agora completa: **Perfil** (`ProfileCard`: nome + avatar), **Aparência** (`AppearanceCard` com claro/escuro/sistema, persiste o tema na store best-effort), **Regional** (`RegionalCard`: moeda BRL fixa + **formato de data** com pré-visualização ao vivo), **Notificações** (`NotificationsCard`: liga/desliga cada tipo de alerta in-app, agrupado por área), **Integração Google Agenda** (reusa `GoogleConnectCard`), **Dashboard** (`DashboardPrefsCard`: personalizar + restaurar padrão), **Exportação & backup** (link `/api/export`) e atalhos para **Categorias**/**Cartões**.
- **Store de preferências (Fase 12 estendida)** — `src/lib/settings/constants.ts` (enums/labels puros: tema, formato de data, prefs de notificação), `src/lib/settings/queries.ts` (`getUserSettings`/`getDisplayName`), validators Zod (`profileSchema`/`preferencesSchema`/`themeSchema`/`notificationPrefsSchema`) e Server Actions (`saveProfile`/`savePreferences`/`saveThemePreference`/`saveNotificationPrefs`) — **upsert parcial** por `user_id` (não sobrescreve outras prefs), `user_id` sempre de `auth.uid()`, retorno `ActionResult`.
- **Exportação/backup (`/api/export`)** — rota `nodejs` que devolve **JSON** com **todos** os dados do usuário (34 tabelas, **menos `google_integrations`** — tokens nunca saem). Cada `select` roda sob a sessão do usuário → **RLS garante** que não vaza dado de outro usuário. Rota **privada** (proxy exige sessão) **e** revalida `auth.getUser()` na própria rota (defesa em profundidade).
- **Auditoria de segurança** — **RLS habilitada em TODAS as 34 tabelas** (`using`+`with check` por `user_id`); `service_role` aparece **apenas** em `src/lib/supabase/service.ts` (definição server-only) e na rota do Cron (`/api/cron/notifications`) — **nunca** em código de client; segredos só no servidor; todas as Server Actions novas validam com **Zod no servidor**. Backup **não** inclui tokens. Confirmado pelo `get_advisors` (0 lints de schema).
- **Nav + layout** — item **Relatórios** (`/relatorios`) adicionado em `src/config/nav.ts` (grupo Geral). O header/menu do usuário passou a exibir o **nome de exibição** (`settings.display_name`), propagado pelo layout `(app)` → `AppShell` → `Header` → `UserMenu`.
- **Polimento** — novas telas com responsividade (grids `sm:`/`lg:`), **empty states** (`EmptyState`) por aba quando não há dados, **skeleton** de loading, e o helper `formatDateWith` (aplica a preferência de formato de data sem quebrar o padrão BR global).

## O que foi implementado na Fase 13 (Busca Global, Lançamento Rápido & Notificações)
- **Schema + RLS (1 tabela nova)** em `supabase/migrations/20260626190000_notifications.sql`, aplicada no projeto `yjvnlbjvippefvzgrxxw` (**RLS + FORCE RLS**, idempotente). Security advisor: **0 lints de schema**.
  - **`notifications`** — `title`, `description`, `type` (texto livre; o app produz/lê `invoice_due|invoice_overdue|bill_due|bill_overdue|receivable_pending|task_overdue|task_today|event_upcoming|habit_pending|water_goal|study_overdue|card_limit|high_spending`), `priority` (`low|medium|high|urgent`, CHECK), `link`, `entity_type`/`entity_id` (referência genérica, sem FK), `is_read`, `is_resolved`, `resolved_at`, `notify_at`, **`dedupe_key`** (índice **único parcial** em `(user_id, dedupe_key) where dedupe_key is not null` — o Cron não recria a mesma notificação), trigger `updated_at`. Índices em `user_id`, `(user_id,is_read)`, `(user_id,type)`, `(user_id,notify_at)`.
- **Lógica pura de geração de alertas + 28 testes Vitest** em `src/lib/notifications/generate.ts` (datas injetadas, sem `Date.now()`): `generateNotifications(input)` recebe estruturas simples e emite `NotificationCandidate[]` com `dedupe_key` determinístico para **10 famílias de regra** (fatura a vencer/atrasada, conta a vencer/vencida, recebível pendente, tarefa atrasada/do dia, evento próximo, hábito pendente, meta de água, estudo atrasado, limite de cartão, gasto alto); **`selectNewCandidates(cands, existingKeys)`** garante a **idempotência** (rodar 2× não duplica). Reusa `statusEfetivo` (F03), `isOverdue`/`isDueToday` (F09), `courseOverdueReason` (F11). Testes cobrem cada regra disparando quando deve + idempotência + dedupe no lote.
- **Central de notificações:** leitura server-only `src/lib/notifications/queries.ts` (`getUnreadCount`/`getRecentNotifications`/`getNotifications` com filtros) + Server Actions `src/lib/actions/notifications.ts` (`markNotificationRead`/`markAllNotificationsRead`/`resolveNotification`/`reopenNotification`/`deleteNotification`/`fetchRecentNotifications`). **Sino no header** (`src/components/notifications/notification-bell.tsx`) com **badge de não lidas** (semeado pelo layout) + popover (`src/components/ui/popover.tsx`, novo, sobre `radix-ui`) que carrega as últimas ao abrir; **página `/notificacoes`** (server + client) com **filtros** (status/tipo/prioridade na URL), **marcar lida / todas**, **resolver/reabrir**, **excluir** (confirm) e **abrir pelo link**; `loading.tsx`. Item de nav **Notificações** adicionado. O **card placeholder do dashboard** (`getNotificationsCardData`) agora **lê as não lidas reais**.
- **Geração agendada (Vercel Cron):** rota `src/app/api/cron/notifications/route.ts` (runtime nodejs) protegida por **`CRON_SECRET`** (`Authorization: Bearer …` → 401 sem segredo). Usa o **cliente service-role** (`src/lib/supabase/service.ts`, server-only) e o orquestrador `src/lib/notifications/cron.ts` (`runNotificationGeneration` → `generateForUser`): lê os dados de cada usuário **filtrando `user_id` explicitamente**, mapeia para a lógica pura, e **insere só os que faltam** por `dedupe_key`. `vercel.json` agenda 2×/dia (09:00 e 21:00 UTC). Sem service role configurada → **no-op 200** (degrada com elegância). `.env.local.example` documenta `CRON_SECRET` + `SUPABASE_SERVICE_ROLE_KEY`. `/api/cron` virou rota pública no `proxy.ts` (não redireciona p/ login; a proteção é o segredo).
- **Busca global:** `src/lib/search/queries.ts` (`searchAll`, server-only, RLS) consulta **11 entidades em paralelo** com `ilike` (transações, cartões, faturas, pessoas, contas, tarefas, rotinas, hábitos, estudos, eventos, notificações), sanitiza o termo e devolve shape unificado `{type,id,title,subtitle,link}` **agrupado por tipo**. Server Action `globalSearch` (RPC). **Command palette** (`src/components/search/search-command.tsx`) abre com **Ctrl/Cmd+K** e pelos triggers do header (caixa no desktop, ícone no mobile), com **debounce**, navegação por teclado (↑/↓/Enter), skeleton/loading e empty state. **Página `/busca`** (server lê `?q=` + client com busca ao vivo). Resultados abrem o item (deep-link).
- **Lançamento rápido:** `src/components/quick-add/quick-add.tsx` — botão "Lançar" (desktop) / "+" (mobile) no header → modal com seletor de **8 tipos** (despesa à vista, gasto no cartão, receita, transferência, tarefa, evento, check-in de hábito, sessão de estudo). Cada tipo é um **mini-form** que **reusa a Server Action original** (`createTransaction`/`createTask`/`createEvent`/`createSession`/`setHabitValue`) — **nenhuma regra de negócio reimplementada** (fatura correta pela F03, terceiros pela F05, etc.). Opções dos selects carregadas sob demanda (`loadQuickAddOptions`). Toast de sucesso + `router.refresh`.
- **Header religado:** `src/components/layout/header.tsx` agora compõe `SearchCommand` + `QuickAdd` + `NotificationBell` (os placeholders "chega na Fase 13" foram removidos). O layout `(app)` busca `getUnreadCount()` e passa `unreadCount` ao `AppShell` → `Header`.

## O que foi implementado na Fase 12 (Dashboard Geral)
- **Schema + RLS (1 tabela nova de PREFERÊNCIAS)** em `supabase/migrations/20260626180000_settings.sql`, aplicada no projeto `yjvnlbjvippefvzgrxxw` (**RLS + FORCE RLS**, idempotente). **Nenhuma tabela de domínio nova** — o dashboard só **lê e agrega** o que já existe.
  - **`settings`** — `dashboard_layout jsonb` (`{ order, hidden, period, view }`), **`unique(user_id)`** (uma linha por usuário, base do upsert e índice em `user_id`), trigger `updated_at`. Store reutilizável pela Fase 14. Security advisor: **0 lints de schema**.
- **Lógica pura + 18 testes Vitest** em `src/lib/dashboard/` (datas injetadas, fuso local pt-BR):
  - `period.ts` — `resolveWindow` traduz o período (hoje/semana/mês/mês anterior/personalizado) numa janela `{from,to,mes,view}` inclusiva (semana segunda→domingo, `weekStartsOn:1`); trata virada de mês/ano, datas custom trocadas/ inválidas (cai para o mês) e deriva a visão pelo tamanho da janela. `windowLabel`/`periodWord`/`asPeriod`/`asView`/`isIsoDate`.
  - `cards.ts` — registro dos 7 cards (ids/títulos), `DashboardLayout`, `DEFAULT_DASHBOARD_LAYOUT`, **`normalizeLayout`** (reconcilia o jsonb cru: mantém a ordem salva, **anexa cards novos** de fases futuras, descarta lixo, valida period/view — read-your-writes sem flash) e `visibleCards`.
- **Validators Zod** (`src/lib/validators/settings.ts`: `dashboardLayoutSchema`) + **Server Actions** (`src/lib/actions/settings.ts`): `saveDashboardLayout` (parse Zod → `normalizeLayout` → **upsert** por `user_id`) e `resetDashboardLayout`. `user_id` sempre de `auth.uid()`; retorno `ActionResult`; `revalidatePath('/dashboard')`.
- **Leituras agregadas server-only** (`src/lib/dashboard/queries.ts`, uma função por card, cada uma sob seu Suspense): **financeiro** (reusa `resumoMes`/`proximasContasPagar`/`totalAReceber` da Fase 07 — saldo, entradas/saídas, **valor meu × terceiros**, cartão × à vista, a receber, próximas contas), **faturas** (reusa `proximas6Faturas` — abertas/fechadas/pagas, próximos vencimentos, a receber), **agenda** (`getCalendarEvents`/`getUpcomingCalendarEvents` — contagem hoje/no período + próximos compromissos), **tarefas/rotinas** (open/hoje/atrasadas/em andamento via `effectiveTaskStatus` + rotinas do dia), **hábitos** (reusa `getHabitsDashboard` + `computeConsistency` no período — check-in rápido), **estudos** (leitura enxuta de cursos+sessões reusando `minutesInRange`/`studyStreak`/`courseOverdueReason` — em andamento, horas no período, atrasados, sequência), **notificações** (placeholder `available:false` — degrada com elegância até a Fase 13).
- **Tela `/dashboard` (agora o Dashboard GERAL)** — Server Component `force-dynamic` que carrega a preferência (`settings`) e monta **7 cards** (financeiro, cartões/faturas, agenda, tarefas/rotinas, hábitos, estudos, notificações), **cada um com seu `<Suspense>`/skeleton** (stream por card). `general-dashboard-client.tsx`: **filtro de período** (hoje/semana/mês/mês anterior/personalizado com datas) + **visão dia/semana/mês** (estado na URL `?periodo=&visao=&de=&ate=`, propaga para todos os cards), **modo Personalizar** com **reordenar (drag-and-drop HTML5 + ↑/↓)**, **ocultar/mostrar** (olho), **Salvar** e **Restaurar padrão** (persistido em `settings` via Server Action + toast). `loading.tsx` (skeleton do grid).
- **Dashboard financeiro (Fase 07) preservado** — movido para **`/dashboard/financeiro`** (`page.tsx` + `financial-dashboard-client.tsx` + `loading.tsx`), item de navegação **"Painel financeiro"** adicionado em `src/config/nav.ts`. O card "Financeiro" do dashboard geral linka para lá. **Nada da Fase 07 foi removido**, só relocado (o `/dashboard` raiz passou a ser o geral, como pede a fase).

## O que foi implementado na Fase 11 (Estudos)
- **Schema + RLS (6 tabelas novas)** em `supabase/migrations/`, aplicadas no projeto `yjvnlbjvippefvzgrxxw` (todas **RLS + FORCE RLS**, índices, trigger `updated_at`, idempotentes). Security advisor: **0 lints de schema**.
  - **`study_courses`** — `title`, `platform`, `url`, `category` (`marketing|trafego_pago|ingles|idiomas|negocios|tecnologia|design|vendas|desenvolvimento_pessoal|outro`), `status` (`nao_iniciado|em_andamento|pausado|concluido`), `priority` (`baixa|media|alta`), **`progress numeric(5,2)`** e **`studied_minutes int`** (ambos **derivados e persistidos** — ver decisões), `workload_minutes`, **`weekly_goal_minutes`** (meta semanal de idioma — coluna no curso, **não** tabela própria), `start_date`, `target_date`, `notes`, **`materials jsonb`** (`[{label,url}]`), `is_language`, `cover_color`, `icon`, `position`. Índices `(user_id,status)`, `(user_id,category)`.
  - **`study_modules`** — `course_id` (fk `on delete cascade`), `title`, `position`, `notes`.
  - **`study_lessons`** — `module_id` (fk cascade), **`course_id` desnormalizado** (fk cascade, preenchido no servidor), `title`, `url`, `duration_minutes`, `is_done`, `completed_at`, `position`, `notes`. Índices `(user_id,course_id)`, `(user_id,module_id)`, `(user_id,is_done)`.
  - **`study_sessions`** — `course_id` (fk cascade), `lesson_id` (fk `on delete set null`), `session_date`, `duration_minutes`, `what_i_learned`, `next_action`, `difficulty` (`facil|media|dificil`), **`task_id`** (fk→`tasks` `on delete set null`, vínculo **opcional** com a Fase 09). **Não** é único por dia (várias sessões/dia). Índices `(user_id,session_date)`, `(user_id,course_id)`.
  - **(Idiomas) `study_vocabulary`** — `course_id` (fk cascade), `term`, `translation`, `example`, `mastery` (`novo|aprendendo|dominado`), `next_review_date`. Índices `(user_id,course_id)`, `(user_id,mastery)`.
  - **(Idiomas) `study_language_practice`** — `course_id` (fk cascade), `practice_date`, `skill` (`listening|speaking|reading|writing`), `duration_minutes`, `notes`. Índices `(user_id,course_id)`, `(user_id,practice_date)`.
- **Lógica pura + 31 testes Vitest** em `src/lib/studies/` (datas injetadas, fuso local pt-BR):
  - `progress.ts` — `courseProgress` (razão de aulas concluídas; curso sem aulas → 0), `totalMinutes`/`minutesInRange` (horas semana/mês), `sessionDateSet`, `nextLesson` (primeira aula não concluída na ordem módulo→aula), `courseOverdueReason` (`target`=passou da data-alvo / `inactive`=sem sessão há >7 dias). **23 testes**.
  - `streak.ts` — `studyStreak`/`bestStudyStreak` (dias consecutivos com ≥1 sessão; **"hoje ainda conta"** como no streak de hábitos). **8 testes**.
  - `constants.ts` — enums/labels/cores (status/categoria/prioridade/dificuldade/mastery/skill), `formatMinutes` ("3h 20min"), `minutesToHours`, `formatPercent`, visões da tela.
  - `queries.ts` — leitura server-only: `getStudyDashboard` carrega cursos/módulos/aulas/sessões (janela ~1 ano)/prática-da-semana/tarefas **uma vez** e deriva cards + horas semana/mês + streak + evolução (8 sem.) + próximas aulas + atrasados + opções do formulário; `getCourseDetail` monta a árvore módulos/aulas + sessões + vocabulário + prática + progresso semanal de idioma.
- **Validators Zod** (`src/lib/validators/study.ts`: course/module/lesson/session/vocabulary/practice; `materials` valida `{label,url}`) + helpers `optionalUrl`/`minutesInt` em `shared.ts`. **Server Actions** (`src/lib/actions/studies.ts`): CRUD de curso/módulo/aula; `toggleLessonDone`; reordenação (`moveModule`/`moveLesson`); `createSession` (com "marcar aula concluída" na mesma operação + vínculo opcional com tarefa); vocabulário (CRUD + `setVocabMastery`); prática; `setCourseStatus`/`setWeeklyGoal`. **`recomputeCourseStats`** recalcula+persiste `progress`/`studied_minutes` após qualquer mudança de aula/sessão (fonte única, sem dupla contagem). `user_id` sempre de `auth.uid()`; retorno `ActionResult`.
- **Tela `/estudos`** (substitui o placeholder): Server `force-dynamic` + `studies-client.tsx` com **4 visões** (estado em URL `?view=`): **Painel** (StatCards de horas semana/mês, sequência, em andamento; **gráfico de evolução** recharts; próximas aulas; estudos atrasados; progresso por curso), **Cursos** (grid de cards com capa colorida + progresso + CRUD), **Sessões** (histórico global + registrar/editar/excluir) e **Idiomas** (cursos de idioma com meta semanal). `loading.tsx`.
- **Rota `/estudos/[id]`** (detalhe do curso): Server `force-dynamic` + `course-detail-client.tsx` — cabeçalho (status rápido, editar, excluir→redireciona), StatCards, barra de progresso, materiais, notas; abas **Conteúdo** (árvore módulos/aulas: CRUD, reordenar ↑↓, marcar concluída), **Sessões** (do curso) e **Idioma** (vocabulário com filtro/nível + prática por habilidade com meta semanal). `loading.tsx`. Item de navegação **Estudos** já existia em `src/config/nav.ts`.

## O que foi implementado na Fase 10 (Hábitos)
- **Schema + RLS (2 tabelas novas + 1 coluna)** em `supabase/migrations/`, aplicadas no projeto `yjvnlbjvippefvzgrxxw` (ambas **RLS + FORCE RLS**, índices, trigger `updated_at`, idempotentes). Security advisor: **0 lints de schema**.
  - **`habits`** — `name`, `category` (`leitura|exercicios|agua|sono|alimentacao|caminhada|estudos|outro`), `frequency` (`diaria|semanal|dias_especificos`), `weekdays int[]`, **`target_value numeric(12,2)`** (meta, `> 0`), `unit` (`vezes|minutos|horas|litros|ml|paginas|passos|km`), `time_of_day time` (horário ideal), `reminder_at time` (lembrete diário — entrega na Fase 13), `color`, `icon`, `is_active`, `position`, **`description`** (genérica: reaproveitada como "Livro atual"/"Tipo de exercício"). Índice `(user_id, is_active)`.
  - **`habit_logs`** — `habit_id` (fk→habits `on delete cascade`), `log_date date`, **`value numeric(12,2)`** (quanto foi feito), `is_done` (atingiu a meta?), `notes`. **Único** por `(user_id, habit_id, log_date)` (check-in nunca duplica — sempre **upsert**); índices `(user_id, log_date)` e `(user_id, habit_id)`. Molde direto de `routine_logs`.
- **Lógica pura + 27 testes Vitest** em `src/lib/habits/` (datas injetadas, fuso local pt-BR):
  - `streak.ts` — `habitOccursOn`/`scheduledDatesInRange`/`computeConsistency`/`currentStreak`/`bestStreak`/`reachedTarget`. **Diferença-chave vs. rotinas:** o streak **não quebra** quando o hábito de hoje ainda não foi feito (dia em andamento); um dia agendado **passado** sem conclusão, sim, quebra. **21 testes** (consecutivos, lacunas, semanal/dias específicos, virada de mês, "ainda dá tempo hoje", recorde).
  - `constants.ts` — categorias/unidades/cores/labels, passo do "+" por unidade, **conversão de água documentada** (`WATER_GLASS_ML = 250`, `glassesToUnit`), `formatHabitValue`/`formatAmount` (pt-BR), visões da tela. **6 testes** (água + formatação).
  - `queries.ts` — leitura server-only: **uma** consulta de `habit_logs` (janela ~1 ano) alimenta cards do dia (progresso, streak, recorde, consistência 7/30d, últimos 7 dias, histórico) **e** os agregados (`getHabitsDashboard`): taxa de conclusão 30d, **série semanal** (8 sem.), **heatmap** diário (15 sem.) e **ranking** dos mais consistentes.
- **Validators Zod** (`src/lib/validators/habit.ts`: `habitSchema` + `habitLogSchema`; helper `optionalTime` em `shared.ts`) e **Server Actions** (`src/lib/actions/habits.ts`): CRUD; **check-in idempotente** (`setHabitValue`/`incrementHabit`/`setHabitDone`/`logHabit`/`undoHabitCheckIn`) com `is_done` derivado da meta (`reachedTarget`); `setHabitDescription` (editor inline); `seedDefaultHabits` (Água/Leitura/Exercícios/Sono). `user_id` sempre de `auth.uid()`; retorno `ActionResult`.
- **Tela `/habitos`** (substitui o placeholder): Server `force-dynamic` + `habits-client.tsx` com **6 visões** (estado em URL `?view=`): **Hoje** (cards com check-in rápido, progresso feito×meta, streak dourado, destaque de **pendentes de hoje** + base de "esquecidos"), **Água** (anel de progresso, +/−1 copo, valor exato, tira da semana), **Leitura** e **Exercícios** (view reutilizável `SessionView`: editor inline "Livro atual"/"Tipo", registro com observações, histórico de sessões), **Consistência** (taxa 30d, gráfico recharts semanal, **heatmap** estilo contribuições, ranking) e **Gerenciar** (CRUD, ativar/desativar, excluir com confirmação, "Adicionar sugeridos"). `loading.tsx` (skeleton). Componentes em `src/components/habits/`. Item de navegação **Hábitos** já existia em `src/config/nav.ts`.

## O que foi implementado na Fase 09 (Demandas, Tarefas & Rotinas)
- **Schema + RLS (7 tabelas novas + 1 FK)** em `supabase/migrations/`, aplicadas no projeto `yjvnlbjvippefvzgrxxw` (todas **RLS + FORCE RLS**, índices, trigger `updated_at`, idempotentes). Security advisor: **0 lints de schema**.
  - **`projects`** — `name`, `description`, `color`, `icon`, `is_archived`, `position`.
  - **`tasks`** — `project_id` (fk→projects `on delete set null` = "Sem projeto/inbox"), `title`, `notes`, `priority` (`baixa|media|alta|urgente`), `status` (`pendente|em_andamento|concluida|atrasada|cancelada`), `start_date`, `due_date`, `completed_at`, `tags text[]`, **`recurrence jsonb`** (`{freq,interval,weekdays?,until?}`), `reminder_at`, **`calendar_event_id`** (fk→calendar_events `on delete set null`), `position`. Índices `(user_id,status)`, `(user_id,due_date)`, `(user_id,project_id)`.
  - **`task_checklist_items`**, **`task_attachments`** (+ bucket privado `task-attachments` em `storage.buckets` e policy de `storage.objects` por pasta `{user_id}/…`).
  - **`routines`** (`type`, `frequency` `diaria|semanal|dias_especificos`, `weekdays int[]`, `time_of_day`, `is_active`), **`routine_items`**, **`routine_logs`** (**único** por `(user_id,routine_id,log_date)`).
  - **FK preparada na Fase 08 conectada:** `calendar_events.task_id → tasks(id) on delete set null` (a coluna já existia sem FK).
- **Lógica pura + 35 testes Vitest** em `src/lib/tasks/` (mesmo rigor das fases anteriores, datas injetadas):
  - `recurrence.ts` — `nextOccurrence`/`materializeNext`/`normalizeRecurrence` (âncora com clamp de mês curto, weekdays de "semanal", `until` inclusivo). Ao **concluir** tarefa recorrente, materializa a próxima instância (clona campos + checklist).
  - `status.ts` — `effectiveTaskStatus`/`isOverdue`/`isDueToday`/`isOpen`/`compareTasks` (status **`atrasada` derivado na leitura**, nunca gravado — espelha "status na leitura" da fatura).
  - `routines.ts` — `routineOccursOn`/`scheduledDatesInRange`/`computeAdherence`/`currentStreak` (frequência "x de N dias" + streak).
  - `queries.ts` — leitura server-only (tarefas com projeto/checklist/anexos/evento; projetos com contagem; rotinas com log do dia/aderência/streak; opções de eventos).
- **Validators Zod** (`src/lib/validators/{project,task,routine}.ts`) e **Server Actions** (`src/lib/actions/{projects,tasks,routines}.ts`): CRUD completo, `completeTask`/`reopenTask`, **`moveTask` (status+position numa mutação)** para o kanban, checklist, anexos (Storage, URL assinada), check-in de rotina (upsert por dia), e **`seedDefaultRoutines`** (Manhã/Noite/Trabalho/Estudos/Exercícios + passos). `user_id` sempre de `auth.uid()`; retorno `ActionResult`.
- **Tela `/tarefas`** (substitui o placeholder): Server `force-dynamic` + `tasks-client.tsx` com **7 visões** (estado em URL `?view=&date=`): **lista** (busca + filtros prioridade/status), **kanban** (arrastável, HTML5 DnD + menu acessível), **calendário** (mês, reusa `buildMonthGrid`), **hoje** (tarefas do dia + rotinas do dia com check-in), **semana**, **atrasadas**, **concluídas**. Form de tarefa (RHF) com projeto, prioridade, status, datas, tags, recorrência (incl. weekdays), lembrete e vínculo com a agenda; detalhes com **checklist** e **anexos**; gestão de **projetos** (criar/editar/arquivar/excluir) num `Sheet`. `loading.tsx`.
- **Tela `/rotinas`** (nova, no nav): Server `force-dynamic` + `routines-client.tsx` — "Rotinas de hoje" com check-in (rotina e passos), aderência da semana e streak; gestão de rotinas (form com passos, ativar/desativar, excluir); botão "Adicionar sugeridas". `loading.tsx`. Item de navegação **Rotinas** adicionado em `src/config/nav.ts`.

## O que foi implementado na Fase 08 (Agenda & Google Agenda)
- **Schema + RLS (2 tabelas novas)** em `supabase/migrations/`, aplicadas no projeto `yjvnlbjvippefvzgrxxw` (ambas **RLS + FORCE RLS**, índices, trigger `updated_at`, idempotentes):
  - **`calendar_events`** — `title`, `description`, `location`, `start_at`/`end_at` (`timestamptz`), `all_day`, **`tipo`** (`pessoal`/`trabalho`/`estudos`/`exercicios`/`rotina`), `color` (personalizável; senão deriva do tipo), recorrência simples (`recurrence_freq`/`recurrence_interval`/`recurrence_until`), `reminder_minutes`, **`task_id`** (preparado p/ Fase 09, **sem FK** até `tasks` existir — documentado), campos de sync (`google_event_id`, `google_calendar_id`, `etag`, `origin` `local`/`google`, `synced_at`). Índice único parcial `(user_id, google_event_id)` evita duplicar no sync.
  - **`google_integrations`** — tokens OAuth (**server-only**): `access_token`, `refresh_token`, `token_expiry`, `scope`, `google_email`, `calendar_id`, `sync_token`, `last_synced_at`. `unique(user_id)`.
- **Lógica pura + 50 testes Vitest** em `src/lib/calendar/` (mesmo rigor das fases anteriores, datas injetadas):
  - `grid.ts` — `buildMonthGrid`/`buildWeekDays`/`dayHours`/`daySpan`/`layoutDayEvents` (empacotamento de sobreposições em colunas).
  - `recurrence.ts` — `expandOccurrences` (âncora sem drift de fim de mês; `until` inclusivo) + `toRRule`/`fromRRule` (mapeamento básico ↔ RRULE do Google).
  - `sync.ts` — `reconcile` (conciliação bidirecional "última edição vence", idempotente, sem duplicar).
  - `mapping.ts` — `rowToLite`, `eventToGoogleResource`, `googleToEventFields` (incl. dia inteiro ancorado ao meio-dia UTC).
  - `events.ts`/`expand.ts`/`upcoming.ts`/`colors.ts`/`format.ts`/`constants.ts` — filtros por dia, expansão de linhas→ocorrências, próximos compromissos, cores por tipo (legíveis dark/light) e formatação pt-BR.
- **Integração Google (server-only, `fetch` direto — sem dependência nova)** em `src/lib/google/`: `config.ts` (`isGoogleConfigured`, redirect URI), `oauth.ts` (authUrl/exchange/refresh/userinfo/revoke), `tokens.ts` (RLS-scoped; `getValidAccessToken` renova o token; nunca expõe/loga tokens), `calendar.ts` (list/insert/patch/delete na Calendar API v3).
- **OAuth (App Router):** `src/app/api/google/connect/route.ts` (gera `state` anti-CSRF em cookie httpOnly e redireciona ao consentimento) e `src/app/api/google/callback/route.ts` (valida `state`, troca o code, persiste tokens). `GOOGLE_CLIENT_ID`/`SECRET` só no servidor (documentados em `.env.local.example`).
- **Server Actions** (`src/lib/actions/calendar.ts`): `createEvent`/`updateEvent`/`deleteEvent` (push best-effort ao Google quando conectado, sem derrubar a ação local), `syncGoogleCalendar` (pull+push reconciliados numa janela [−30d, +180d]) e `disconnectGoogle` (revoga + remove). Leitura em `src/lib/calendar/queries.ts` (eventos por janela, próximos, estado da conexão **sem tokens**).
- **Tela `/agenda`** (substitui o placeholder): Server Component `force-dynamic` + `agenda-client.tsx`. Visões **dia/semana/mês** (estado em URL `?view=&date=`), navegação de período, **cores por tipo**, criar/editar/excluir com confirmação, detalhes do evento, lembretes e recorrência no form (RHF), card **Conectar/Sincronizar/Desconectar Google** e componente **Próximos compromissos** (`src/components/calendar/upcoming-events.tsx`) **pronto para o dashboard**. `loading.tsx` (skeleton).

## O que foi implementado na Fase 07 (Dashboard Financeiro)
- **Sem novas tabelas/migrations.** Camada de **agregação pura** (`src/lib/finance/dashboard.ts` + 22 testes) sobre as Fases 02–06, dinheiro em centavos. Cards de resumo (meu × total × terceiros), gráficos recharts (categoria/forma/mês-a-mês/evolução/projeção), próximas 6 faturas, alertas. UI em `/dashboard` (`page.tsx`/`loading.tsx`/`dashboard-client.tsx`), filtro de período por URL.

## O que ficou como evolução futura (manutenção — fora do escopo do roadmap)
- **Anexos genéricos ligados na UI:** a tabela `attachments` + bucket existem e estão prontos (RLS + Storage), mas a Fase 14 entregou a **infraestrutura**; ligar o upload em telas específicas além de tarefas (ex.: comprovante de lançamento) é uma melhoria pontual de manutenção (o precedente de upload está em tarefas, Fase 09).
- **Formato de data global:** a preferência `date_format` é persistida e aplicada nas telas que usam `formatDateWith`; o padrão global do app segue `dd/MM/yyyy` (BR) via `formatDate`. Propagar a preferência a 100% das telas é melhoria futura.
- **Canais externos de notificação** (push/e-mail/web-push): in-app apenas (sino + página). Evolução futura.
- A geração de notificações **só roda de fato** quando `SUPABASE_SERVICE_ROLE_KEY` e `CRON_SECRET` estiverem definidos no ambiente (Vercel) — ver Status do Supabase. Localmente dá para chamar `/api/cron/notifications` com o header `Authorization: Bearer $CRON_SECRET`.

## Verificação (Fase 14)
- **3 migrations** aplicadas (idempotentes) no projeto `yjvnlbjvippefvzgrxxw` (`settings_profile`, `attachments`, `attachments_storage`); **0 lints de schema** no `get_advisors` (resta só o aviso externo de Auth). `src/types/supabase.ts` regenerado (inclui `attachments` + colunas novas de `settings`).
- **RLS confirmada em TODAS as 34 tabelas** (`list_tables`: `rls_enabled: true` em todas). `service_role` só em `service.ts` + Cron (grep), **nunca** no client.
- `npm run test:run` ✅ (**342 testes**: 334 anteriores + **8 da Fase 14** — `reports/tasks` (4: contagens, taxa, produtividade semanal, vazio) e `reports/csv` (4: separador `;`, escaping, ordem de colunas, sem linhas)).
- `npm run lint` ✅ (0/0; React Compiler ok). `tsc --noEmit` ✅. `npm run build` ✅ (novas rotas `/relatorios` e `/api/export` geradas; `/configuracoes` agora completa; demais rotas intactas).
- Smoke test (build de produção): `/login` 200; `/relatorios`, `/configuracoes` e `/api/export` → 307 `/login?next=…` (proxy protege); `/api/cron/notifications` → 401 sem segredo.
- **Falta a verificação visual logada** (dark/light + mobile) de ponta a ponta — **já há usuário em `auth.users`**: dá para logar, editar perfil, alternar tema/sistema, salvar prefs de notificação, abrir os relatórios (5 abas), exportar CSV/JSON e baixar o backup. A confiança vem dos **342 testes** + build/lint/tsc + smoke test + auditoria de RLS.

## Status do Supabase (atualizado 2026-06-26)
- ✅ **`.env.local` configurado** (projeto `yjvnlbjvippefvzgrxxw`). Proteção de rotas (`proxy.ts`) ativa — `/dashboard`, `/dashboard/financeiro`, `/tarefas`, `/rotinas`, `/habitos`, `/estudos`, `/estudos/[id]`, `/agenda`, **`/busca`**, **`/notificacoes`** e `/api/google/*` exigem sessão (smoke test: 307 → `/login`; `/login` 200). **`/api/cron/*` é público para o proxy** (não redireciona), protegido por `CRON_SECRET` na própria rota (sem segredo → 401).
- ✅ **34 tabelas** (16 das Fases 02–08 + Fase 09 `projects`, `tasks`, `task_checklist_items`, `task_attachments`, `routines`, `routine_items`, `routine_logs` + Fase 10 `habits`, `habit_logs` + Fase 11 `study_courses`, `study_modules`, `study_lessons`, `study_sessions`, `study_vocabulary`, `study_language_practice` + Fase 12 `settings` + Fase 13 `notifications` + Fase 14 **`attachments`** — anexos genéricos `{user_id}/…`) **todas com RLS + FORCE RLS**, mais **2 buckets privados** de Storage (`task-attachments` da Fase 09 + `attachments` da Fase 14, ambos com policy de `storage.objects` por pasta `{user_id}/…`). A `settings` ganhou na Fase 14 as colunas de perfil/tema/moeda/data/notificações (idempotente). **Supabase security advisor: 0 lints de schema** (resta apenas o aviso pré-existente de Auth "leaked password protection", configuração externa).
- ⚠️ **`SUPABASE_SERVICE_ROLE_KEY` e `CRON_SECRET` ainda não definidos** — necessários **só** para o **Vercel Cron** gerar notificações (a rota roda sem sessão e usa a service role, sempre filtrando `user_id`). Sem eles a rota degrada (401 sem `CRON_SECRET`; no-op 200 sem service role). Busca, sino e lançamento rápido funcionam normalmente (usam a sessão do usuário).
- ⚠️ **`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` ainda não definidos** — a agenda local funciona normalmente; o botão "Conectar Google Agenda" só ativa quando as duas chaves existirem (análogo ao tratamento de auth da Fase 01).
- ⚠️ **`SUPABASE_SERVICE_ROLE_KEY` vazio** — não necessário para o app em si (tudo via `authenticated` + RLS), **apenas** para o Vercel Cron de notificações (Fase 13), que roda sem sessão. Ver o item acima.
- ✅ **Já existe 1 usuário cadastrado** em `auth.users` (criado em 2026-06-26) — login por e-mail/senha funciona. Agora é possível **logar e exercitar RLS / verificação visual logada / check-in / anexos** de ponta a ponta.
- ⚠️ **Provider Google (Supabase Auth) desativado** (login por e-mail/senha; o OAuth do Google Agenda é à parte e ainda depende de `GOOGLE_CLIENT_ID/SECRET`).

## Decisões técnicas tomadas na Fase 13
- **Idempotência por `dedupe_key` sem `ON CONFLICT`:** o Cron **lê as chaves existentes** entre os candidatos e **insere só as que faltam** (`selectNewCandidates`) — robusto, testável sem banco, e o **índice único parcial** `(user_id, dedupe_key) where dedupe_key is not null` é a rede de segurança. Chaves determinísticas por origem: persistentes (`invoice_overdue:<id>`, `task_overdue:<id>`) ou por ciclo/dia (`task_today:<id>:<dia>`, `card_limit:<id>:<mês>`, `bill_due:<id>:<venc>`) — evita spam e ainda re-alerta no próximo período.
- **Lógica de geração 100% PURA + injeção de data** (`generate.ts`, `nowMs`/`todayIso` injetados, sem `Date.now()`) — espelha o rigor das fases anteriores; o Cron (`cron.ts`) só faz I/O e mapeamento. **Reusa** `statusEfetivo`/`isOverdue`/`isDueToday`/`courseOverdueReason`/`resumoMes` — nenhuma regra nova.
- **Cron com service-role, filtrando `user_id` explicitamente:** a rota não tem sessão; a service role **ignora RLS**, então toda leitura/escrita carrega `user_id`. Protegida por `CRON_SECRET` (Bearer). Sem service role → no-op 200 (degrada como a integração Google). Fuso pt-BR resolvido via `Intl` `America/Sao_Paulo` (correto independe do TZ do servidor Vercel/UTC).
- **Lançamento rápido = atalho, não regra nova:** cada mini-form chama a **Server Action original** (fatura correta F03, parcelas F04, pessoal×terceiro F05, status na leitura F09…). Zero reimplementação; o servidor revalida com Zod e devolve erro via toast.
- **Busca server-side com `ilike` em paralelo, respeitando RLS:** cada `select` roda sob a sessão do usuário (nunca varre outro). Termo sanitizado (remove `%_\,()*:` que quebram o filtro PostgREST). Faturas filtradas por nome do cartão/competência em memória (poucos registros). Shape unificado `{type,id,title,subtitle,link}` agrupado por tipo.
- **Command palette sem dependência nova:** popover/command construídos sobre o pacote unificado `radix-ui` (Popover) + `Dialog` já presentes — **nenhuma lib nova** (sem `cmdk`), alinhado à filosofia enxuta do projeto (HTML5 DnD, `fetch` direto). Atalho **Ctrl/Cmd+K** global + navegação por teclado.
- **`vercel.json` (não `vercel.ts`)** para os `crons`, como pede o arquivo da fase — 2 disparos/dia (compatível com limites do plano; ajustável).

## Decisões técnicas tomadas na Fase 12
- **`/dashboard` virou o Dashboard GERAL; o financeiro (Fase 07) foi PRESERVADO em `/dashboard/financeiro`.** A fase pede o geral como porta de entrada em `/dashboard` e que ele **agregue, não substitua** o financeiro. Mover (em vez de apagar) mantém todos os gráficos/regras da Fase 07 intactos, com novo item de nav "Painel financeiro" e link a partir do card "Financeiro". Os redirects pós-login (`/dashboard`) continuam válidos.
- **Card de notificações sem nova tabela de domínio:** a única persistência nova é `settings` (preferências). O card degrada com elegância (`available:false`) até a Fase 13 criar `notifications` — **não quebra build/tela**.
- **`settings` = uma linha por usuário (`unique(user_id)`), `dashboard_layout jsonb`.** Leitura reconciliada por `normalizeLayout` (absorve cards novos de fases futuras, descarta lixo) e gravação validada por Zod no servidor — read-your-writes sem flash. Store **reutilizável pela Fase 14**.
- **Período como fonte única da janela; visão é um atalho.** `resolveWindow` produz `{from,to,mes,view}`; o toggle dia/semana/mês apenas seleciona o preset correspondente. Cards financeiros são **mensais por natureza** (usam `window.mes` e reusam as agregações da Fase 07, sem reescrever regra); os cards de tempo (agenda/tarefas/estudos/hábitos) respeitam a janela `[from,to]`. Estado de período/visão na **URL** (`?periodo=&visao=&de=&ate=`), default vindo de `settings`.
- **Per-card Suspense (stream por card) + grid client para arranjo.** A página (server) cria o nó de cada card sob `<Suspense>` e os passa a um client que apenas **ordena/oculta** (não rebusca dados). Reordenar usa **drag-and-drop HTML5 nativo + ↑/↓** (sem dependência nova, igual ao kanban da Fase 09; funciona no mobile/teclado). Personalização persistida em `settings` via Server Action + toast.
- **Padrão Server Component + Server Action + `revalidatePath`/`router.refresh`** (igual às Fases 02–11), em vez dos hooks TanStack Query / Zustand mencionados no arquivo da fase — mantém a consistência com todo o app. Decisão deliberada e documentada.
- **Reuso, não reescrita:** o dashboard geral consome `src/lib/finance/dashboard.ts` (Fase 07), `getHabitsDashboard` (Fase 10), `effectiveTaskStatus`/`getRoutinesWithToday` (Fase 09), `getCalendarEvents`/`getUpcomingCalendarEvents` (Fase 08) e `minutesInRange`/`studyStreak`/`courseOverdueReason` (Fase 11). Nenhuma regra de negócio nova.

## Decisões técnicas tomadas na Fase 11
- **Fonte única para `progress`/`studied_minutes` (sem dupla contagem):** `progress` (0–100) vem **só** da razão de aulas concluídas (`study_lessons.is_done`); `studied_minutes` vem **só** da soma de `study_sessions.duration_minutes` — **nunca** das durações das aulas. Os dois são **recalculados e persistidos** por `recomputeCourseStats(courseId)` após qualquer mudança de aula/sessão, então as colunas são reais (úteis ao Dashboard Geral) e a leitura não precisa re-somar. Lógica centralizada e testada em `src/lib/studies/progress.ts`.
- **`course_id` desnormalizado em `study_lessons`/`study_sessions`** preenchido **no servidor** (lido do módulo/curso sob RLS), nunca do client — consultas por curso sem JOIN e consistência garantida.
- **Streak de estudos "hoje ainda conta":** `studyStreak` conta dias consecutivos com ≥1 sessão e **não quebra** se hoje ainda não houve sessão (dia em andamento) — mesma regra do streak de hábitos (Fase 10). Datas locais pt-BR (`'yyyy-MM-dd'`), sem drift de UTC.
- **Meta semanal de idioma como coluna** (`study_courses.weekly_goal_minutes`) em vez de tabela própria — é 1:1 com o curso de idioma; o realizado da semana é derivado de `study_language_practice` na leitura.
- **Estudos atrasados derivados na leitura:** `courseOverdueReason` marca curso **em andamento** como `target` (passou da `target_date`) ou `inactive` (sem sessão há >7 dias) — espelha "status na leitura" das fases anteriores; nada é gravado.
- **Modelo genérico de curso + detalhe em rota própria:** `/estudos` (painel/cursos/sessões/idiomas via `?view=`) e **`/estudos/[id]`** para a árvore módulos→aulas (CRUD + reordenar ↑↓ sem DnD, igual a rotinas/hábitos) — mantém cada client enxuto. **Uma leitura agregada** (`getStudyDashboard`) alimenta toda a página, como `getHabitsDashboard` na Fase 10.
- **Padrão Server Component + Server Action + `revalidatePath`/`router.refresh`** (igual às Fases 02–10), em vez dos hooks TanStack Query mencionados no arquivo da fase — mantém consistência com todo o app. Decisão deliberada e documentada.
- **Vínculo opcional com tarefa (Fase 09):** `study_sessions.task_id → tasks(id) on delete set null`; o seletor de tarefa só lista tarefas abertas (`pendente|em_andamento`) e nunca é obrigatório.
- **Forms com `useWatch`/`Controller`** (React Compiler) e **estado reiniciado em render** (editores inline "Livro atual"/meta semanal) — respeita `react-hooks/set-state-in-effect`.

## Verificação (Fase 13)
- **1 migration** aplicada (idempotente) no projeto `yjvnlbjvippefvzgrxxw` (`notifications`); **0 lints de schema** no security advisor; `src/types/supabase.ts` regenerado (inclui `notifications`).
- `npm run test:run` ✅ (**334 testes**: 306 anteriores + **28 da Fase 13** — cada uma das 10 famílias de regra disparando quando deve, casos negativos (paga/concluída/futuro distante/dentro da média), prioridades, e **idempotência** por `dedupe_key` (rodar 2× não traz nada novo) + dedupe dentro do lote).
- `npm run lint` ✅ (0 erros/0 warnings; React Compiler ok). `tsc --noEmit` ✅. `npm run build` ✅ (novas rotas `/busca`, `/notificacoes` e `/api/cron/notifications` geradas; demais rotas intactas).
- Smoke test (build de produção): `/login` 200; `/notificacoes` e `/busca` → 307 `/login?next=…` (proxy protege); **`/api/cron/notifications` → 401 `{"error":"Unauthorized"}`** sem `CRON_SECRET`/Bearer (NÃO redireciona — confirma rota pública ao proxy + protegida pelo segredo).
- **Falta a verificação visual logada** (dark/light + mobile) de ponta a ponta — **já há usuário em `auth.users`**, então o próximo agente pode logar, abrir a busca (Ctrl+K), lançar despesa/tarefa/evento/etc. pelo modal, e (após popular `notifications` ou definir `CRON_SECRET`+service role e chamar a rota) ver o sino/página. A confiança vem dos **28 testes** + build/lint/tsc + smoke test.

## Verificação (Fase 12)
- **1 migration** aplicada (idempotente) no projeto `yjvnlbjvippefvzgrxxw` (`settings`); **0 lints de schema** no security advisor; `src/types/supabase.ts` regenerado (inclui `settings`).
- `npm run test:run` ✅ (**306 testes**: 288 anteriores + **18 da Fase 12** — `resolveWindow` por período/visão incl. semana segunda→domingo, virada de mês/ano, custom trocado/ inválido; `windowLabel`/`asPeriod`/`asView`/`isIsoDate`; `normalizeLayout` (anexa cards novos, descarta lixo, não lança) e `visibleCards`).
- `npm run lint` ✅ (0 erros/0 warnings; React Compiler ok). `tsc --noEmit` ✅. `npm run build` ✅ (`/dashboard` e `/dashboard/financeiro` dinâmicas; demais rotas intactas).
- Smoke test (build de produção): `/login` 200; `/dashboard`, `/dashboard/financeiro`, `/dashboard?periodo=semana&visao=semana` e `/dashboard?periodo=custom&de=…&ate=…` → 307 `/login` (proxy protege; params preservados). Servidor de produção sobe limpo.
- **Falta a verificação visual logada** (dark/light + mobile) de ponta a ponta — **já há usuário em `auth.users`**, então o próximo agente pode logar, alternar período/visão, reordenar/ocultar cards, salvar/restaurar layout e fazer check-in de hábito direto do dashboard. A confiança vem dos **18 testes** + build/lint/tsc + smoke test.

## Verificação (Fase 11)
- **6 migrations** aplicadas (idempotentes) no projeto `yjvnlbjvippefvzgrxxw`; **0 lints de schema** no security advisor; `src/types/supabase.ts` regenerado (inclui as 6 tabelas novas).
- `npm run test:run` ✅ (**279 testes**: 248 anteriores + **31 da Fase 11** — `courseProgress`/`nextLesson`/`minutesInRange`/`courseOverdueReason` (23) e `studyStreak`/`bestStudyStreak` (8), incl. curso sem aulas, todas concluídas, horas semana/mês, "hoje ainda conta", virada de mês).
- `npm run lint` ✅ (0 erros/0 warnings; React Compiler ok — forms usam `useWatch`/`Controller`).
- `tsc --noEmit` ✅; `npm run build` ✅ (`/estudos` e `/estudos/[id]` dinâmicas; demais rotas intactas). Smoke test: `/estudos`, `/estudos?view=cursos` e `/estudos/[id]` → 307 `/login`; `/login` 200.
- **Falta a verificação visual logada** (dark/light + mobile) de ponta a ponta — **já há usuário em `auth.users`**, então o próximo agente pode logar, criar curso/módulos/aulas, registrar sessões, marcar aulas e exercitar idiomas (vocabulário/prática). A confiança vem dos **31 testes** + build/lint/tsc + smoke test.

## Decisões técnicas tomadas na Fase 10
- **Modelo genérico (sem tabelas por categoria):** água/leitura/exercícios são casos de `habits` (`target_value` + `unit`); as telas especializadas são **views** filtrando por `category`. Uma coluna `description` genérica vira "Livro atual" (leitura) e "Tipo de exercício" (exercícios) — **uma** tabela, não três.
- **Check-in idempotente por dia** (`habit_logs` único por `(user_id, habit_id, log_date)`, **upsert**) — molde do `routine_logs`. `value` guarda quanto foi feito; `is_done` é **derivado da meta** (`reachedTarget`: `value >= target`, ou qualquer valor positivo quando a meta é 0). `incrementHabit` soma ao valor do dia (clamp ≥ 0); `undoHabitCheckIn` remove o registro do dia.
- **Streak com "dia em andamento":** diferente das rotinas, `currentStreak` **não quebra** quando o hábito de **hoje** ainda não foi feito (ainda dá tempo); só dias agendados **passados** sem conclusão quebram. Coberto por testes dedicados. `bestStreak` = recorde na janela carregada.
- **Datas locais pt-BR** (`'yyyy-MM-dd'` puro) em todo o `log_date`/streak/heatmap — evita o bug de "virar o dia" por UTC (mesma regra do financeiro/rotinas).
- **Uma leitura alimenta tudo:** `getHabitsDashboard` carrega `habit_logs` de ~1 ano **uma vez** e deriva cards do dia + agregados (taxa 30d, série semanal, heatmap, ranking) em memória — sem N+1.
- **Padrão Server Component + Server Action + `revalidatePath`/`router.refresh`** (igual às Fases 02–09) em vez dos hooks TanStack Query mencionados no arquivo da fase — mantém consistência com todo o app. Decisão deliberada e documentada.
- **`reminder_at` como `time`** (e não `timestamptz`): hábito é recorrente, então o lembrete é um **horário do dia**; a Fase 13 combina `reminder_at` + "hoje" para o disparo. A base de "esquecidos" é a consulta de **pendentes de hoje** (agendado e não concluído), exibida em destaque.
- **Sem reorder por DnD** (igual rotinas): `position` é definido na criação e usado na ordenação; a UI não arrasta — alinhado à filosofia enxuta e ao precedente da Fase 09.
- **Forms com `useWatch`** (React Compiler ativo) e **estado reiniciado em render** (padrão "ajustar estado ao mudar prop") em vez de `setState` dentro de `useEffect` — respeita a regra `react-hooks/set-state-in-effect`.

## Decisões técnicas tomadas na Fase 09
- **`recurrence` em coluna `jsonb`** (`{freq,interval,weekdays?,until?}`, `null` = sem recorrência) — formato simples e versionável, centralizado e testado em `src/lib/tasks/recurrence.ts`. A materialização da próxima tarefa ancora no `due_date` (ou `start_date`) e desloca ambas as datas pelo mesmo delta.
- **Status `atrasada` derivado na leitura** (não gravado) — espelha "status na leitura" da fatura. O banco aceita `atrasada` no CHECK por compatibilidade, mas as actions só gravam `pendente|em_andamento|concluida|cancelada`.
- **Padrão Server Component + Server Action + `revalidatePath`/`router.refresh`** (igual às Fases 02–08) em vez dos hooks TanStack Query sugeridos no arquivo da fase — mantém **consistência** com todo o app (que nunca adotou TanStack para leitura) e evita introduzir um padrão novo só neste módulo. Decisão deliberada e documentada.
- **Kanban com drag-and-drop HTML5 nativo + menu acessível** ("mover para / concluir / cancelar" no card) em vez de `@dnd-kit` — alinha à filosofia enxuta do projeto (parsers próprios, `fetch` em vez de `googleapis`): **zero dependência nova**, funciona no desktop (arrastar) e no mobile/teclado (menu). `moveTask` grava `status`+`position` numa única mutação.
- **Anexos em Storage privado** (`task-attachments`, pasta `{user_id}/…`): upload pelo **client** (RLS de `storage.objects`), metadados gravados por Server Action que revalida o prefixo do caminho; download via **URL assinada** temporária (10 min). Excluir tarefa/anexo remove o objeto do Storage (best-effort).
- **Vínculo tarefa↔agenda opcional e desacoplado:** a tarefa guarda `calendar_event_id` (e a FK preparada `calendar_events.task_id` foi conectada); nenhum dos lados é obrigatório e excluir um não apaga o outro (`on delete set null`).
- **Rotinas:** `frequency` (`diaria|semanal|dias_especificos`) + `weekdays int[]`; check-in diário com **upsert** por `(user_id,routine_id,log_date)` (único — não duplica). `setRoutineItemDone` marca a rotina inteira como feita quando todos os passos são concluídos. Seed das 5 rotinas sugeridas só age quando não há nenhuma rotina.

## Decisões técnicas tomadas na Fase 08
- **Tokens OAuth = prioridade de segurança:** `google_integrations` com RLS + FORCE RLS; lidos **apenas no servidor** (`getValidAccessToken` renova via `refresh_token`); **nunca** enviados ao client nem logados. O client só recebe `{ connected, email, lastSyncedAt }`.
- **`fetch` direto à Google API** (sem `googleapis`) — mantém o bundle enxuto, alinhado à filosofia "parsers próprios" das fases anteriores.
- **Recorrência expandida na leitura** (módulo puro), espelhando "derivar na leitura" do financeiro. Ocorrências geradas recebem id sintético `<id>__<n>` e a edição/exclusão agem sobre o **mestre**.
- **Sync bidirecional básico, idempotente:** `reconcile` casa por `google_event_id`, detecta mudança por `etag`, e resolve conflito por **última edição** (`updated`/`updated_at` vs `synced_at`). `listEvents` usa `singleEvents=false` (mestres com RRULE) para o round-trip dos nossos próprios eventos não duplicar.
- **Dia inteiro ancorado ao meio-dia UTC** para estabilidade de data em fusos −11h…+11h.
- **App funciona sem o Google:** `isGoogleConfigured` desliga o fluxo OAuth; a agenda local é completa.

## Verificação (Fase 10)
- **3 migrations** aplicadas (idempotentes) no projeto `yjvnlbjvippefvzgrxxw` (`habits`, `habit_logs`, `habits_description`); **0 lints de schema** no security advisor; `src/types/supabase.ts` regenerado (inclui as 2 tabelas novas + coluna `description`).
- `npm run test:run` ✅ (**248 testes**: 221 anteriores + **27 da Fase 10** — 21 de streak/consistência incl. "ainda dá tempo hoje", virada de mês, semanal/dias específicos, recorde; 6 de conversão de água/formatação).
- `npm run lint` ✅ (0 erros/0 warnings; React Compiler ok — `useWatch` nos forms, estado reiniciado em render).
- `tsc --noEmit` ✅; `npm run build` ✅ (`/habitos` dinâmica; demais rotas intactas). Smoke test: `/habitos` e `/habitos?view=consistencia` → 307 `/login`; `/login` 200.
- **Falta a verificação visual logada** (dark/light + mobile) de ponta a ponta — **já há usuário em `auth.users`**, então o próximo agente pode logar, semear hábitos, fazer check-ins e validar streaks/heatmap/gráficos visualmente. A confiança vem dos **27 testes** + build/lint/tsc + smoke test.

## Verificação (Fase 09)
- **9 migrations** aplicadas (idempotentes) no projeto `yjvnlbjvippefvzgrxxw`; **0 lints de schema** no security advisor; `src/types/supabase.ts` regenerado (inclui as 7 tabelas novas).
- `npm run test:run` ✅ (**221 testes**: 186 anteriores + **35 da Fase 09** — recorrência de tarefas/materialização, status efetivo/atrasada/ordenação, agendamento/aderência/streak de rotinas).
- `npm run lint` ✅ (0 erros/0 warnings; React Compiler ok — forms usam `useWatch`).
- `tsc --noEmit` ✅; `npm run build` ✅ (`/tarefas` e `/rotinas` dinâmicas; demais rotas intactas). Smoke test: `/tarefas` e `/rotinas` → 307 `/login?next=…`; `/login` 200; `/agenda` e `/dashboard` intactos.
- **Falta a verificação visual logada** (dark/light + mobile), o fluxo de **anexos** (Storage) e a materialização de recorrência exercitados de ponta a ponta — **já há usuário em `auth.users`**, então o próximo agente pode logar e validar tudo manualmente.

## Verificação (Fase 08)
- **2 migrations** aplicadas (idempotentes); **0 lints de schema** no security advisor; `src/types/supabase.ts` regenerado.
- `npm run test:run` ✅ (**186 testes**: 136 anteriores + **50 da agenda** — grid/sobreposição, recorrência/until, RRULE round-trip, reconcile nos dois sentidos + conflito + idempotência, mapeamento Google, próximos compromissos).
- `npm run lint` ✅ (0 erros/0 warnings; React Compiler ok — forms usam `useWatch`).
- `npm run build` ✅ (`/agenda` dinâmica; rotas `/api/google/connect` e `/api/google/callback` geradas; demais rotas intactas). Smoke test: `/agenda` e `/api/google/connect` redirecionam (307) para `/login`; `/login` 200.
- **Falta a verificação visual logada** (dark/light + mobile) e o fluxo OAuth real — exige criar usuário em `auth.users` e definir `GOOGLE_CLIENT_ID`/`SECRET`.

## Como continuar (modo manutenção)
**O roadmap acabou — não há próxima fase.** Para qualquer melhoria/correção futura, abra
`docs/handoff/NEXT_AGENT_INSTRUCTIONS.md` (seção "Modo manutenção"): leia o briefing/regras,
trate a mudança como uma **tarefa pontual** e mantenha os invariantes do projeto — **RLS
(`using`+`with check`) em toda tabela**, **Zod no servidor** em toda Server Action, **nenhum
`service_role` no client**, **pt-BR/BRL**, **dark/light + responsividade** e **testes passando**
(`npm run lint && npx tsc --noEmit && npm run test:run && npm run build`).
