# NEXT_AGENT_INSTRUCTIONS — Instruções para o próximo agente

## 🎯 PRÓXIMA: 18-D — IA · Visão, documentos e comprovantes

**Desenho da fase (leia ANTES):** `docs/superpowers/specs/2026-08-04-modulo-ia-design.md`
**O arquivo a abrir:** `docs/phases/PHASE_18_D_AI_VISION_DOCUMENTS_RECEIPTS.md`
**O que já existe:** `docs/handoff/LAST_PHASE_SUMMARY.md` → seções **18-A**, **18-B** e **18-C**

> ⚠️ **A 18-D não tem desenho validado ainda.** As 18-A, 18-B e 18-C tiveram um, escrito com o
> dono **antes** de qualquer linha de código, e as três vezes ele mudou o que o documento da
> fase sugeria. A 18-D toca o assunto mais sensível do sistema depois de dinheiro — **upload de
> arquivo do usuário para um provedor externo** —, então **brainstorm primeiro, spec depois,
> código por último**.

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

### O que continua bloqueado depois da 18-B

Escrita, propostas e confirmações (18-C) · imagens e documentos, **inclusive qualquer upload**
(18-D) · insights e dashboards (18-E) · memória, voz, automações, botão flutuante,
**sino/notificações** e busca global (18-F).

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
