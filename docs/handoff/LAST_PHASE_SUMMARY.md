# LAST_PHASE_SUMMARY — Resumo da última fase concluída

> 🟡 **ÚLTIMA SUBFASE CONCLUÍDA: 18-B — IA · Contexto, ferramentas de leitura e agentes
> (2026-08-07).** Antes dela, a 18-A (2026-08-04) e as duas frentes grandes: **Fase 16 — Dieta
> e Alimentação** (16-A a 16-F, 40 de 40 critérios) e **Fase 17 — Módulo Treinos** (17-A a
> 17-F, 55 de 55). Este arquivo tem os resumos na ordem inversa de conclusão — o mais recente
> primeiro.

---

## Fase 18-B — IA · Contexto, ferramentas de leitura e agentes (2026-08-07) ✅ **IMPLEMENTADA E VERIFICADA**

**É a subfase em que a IA passou a ler dado real.** Três ferramentas, todas de Treinos, todas
de leitura. Nenhuma ferramenta de escrita existe — o guard recusa por `TOOL_WRITE_DISABLED`.

### O que foi entregue

| # | Entrega | Onde |
| --- | --- | --- |
| 1 | 3 ferramentas de Treinos (último treino, totais, recordes) | `lib/ai/tools/adapters/training.ts` |
| 2 | Tool Registry estático + guard com ordem de checagem fixa | `tools/registry.ts` · `tools/guard.ts` |
| 3 | Executor com poda por orçamento de caracteres | `tools/executor.ts` |
| 4 | Laço de ferramentas próprio, teto de 3 passos por tentativa | `server/tool-loop.ts` |
| 5 | Roteamento determinístico por agente | `agents/routing.ts` |
| 6 | Contexto de página (só a rota; módulo no servidor) | `validators/ai.ts` · `api/ia/chat/route.ts` |
| 7 | Auditoria por chamada e por passo | `ai_tool_calls` · `ai_run_steps` |
| 8 | Rastreabilidade na tela, com "Ver dados usados" | `components/ai/source-chips.tsx` |
| 9 | 9 chaves de autorização por módulo, todas desligadas | `/ia/configuracoes` |

### Os defeitos que a revisão pegou — e o que cada um ensinou

| Severidade | Defeito | Lição |
| --- | --- | --- |
| **CRITICAL** | `step_index` reiniciava por tentativa com `run_id` igual → `23505` → "sem trilha, sem leitura" bloqueava tudo. **Depois de qualquer retry, a IA parava de ler** e respondia com a mensagem de falha de auditoria, com o run fechando como `completed` | Duplo de teste que não modela restrição do banco esconde o defeito **na consequência** |
| IMPORTANT | O número da IA divergia do da tela: os adapters não liam as preferências de contagem de volume | Default do banco coincidir com default do código faz o teste passar e a tela discordar |
| IMPORTANT | A regra de contagem não viajava junto com o número (invariante 12 da Fase 17) | Agregado sem a regra ao lado é número sem significado |
| IMPORTANT | Passo de modelo ficava `started` para sempre quando o provedor errava | `.return()` de gerador suspende antes do `closeStep`; precisa de `try/finally` |
| IMPORTANT | Erro de validação chegava **em inglês** direto no toast | O `error` do Zod é texto de usuário quando o cliente o exibe cru |
| IMPORTANT | O aviso da tela ainda dizia que o assistente não vê treinos | **Todo texto que descreve o que a IA não faz é datado** |
| IMPORTANT | `parseRefs` recusava `//` e deixava passar `/\` — o parser de URL resolve os dois igual | Trava escrita como lista de proibidos vai ser furada; escreva a allowlist |

**O padrão que dominou a subfase:** testes que espelham a implementação. Seis ocorrências. As
contramedidas adotadas — e que valem para a 18-C — estão em `NEXT_AGENT_INSTRUCTIONS.md`,
seção "As armadilhas que a 18-B encontrou".

### Verificação

`npm run lint` ✅ · `npx tsc --noEmit` ✅ · `npm run test:run` **2.512 testes / 121 arquivos** ✅ ·
**`TZ=UTC`** ✅ · `npm run build` ✅. Smoke: rotas privadas → 307 `/login`; `/api/cron/*` sem
segredo → 401.

⚠️ **Limites da verificação, declarados:** o chat **não foi exercitado com credencial real de
provedor** (exige chave e `AI_MASTER_KEYS`); e o projeto **não tem infraestrutura de teste de
componente** (`environment: "node"`, zero `.test.tsx`), então o contrato entre runner e tela é
verificado por varredura do código-fonte (`lib/ai/chat-events.test.ts`), não por DOM.

### Pendências conscientes

- O **contexto de página não é persistido** — o selo some ao recarregar. Persistir exige coluna.
- Chamadas que excedem `MAX_TOOLS_POR_PASSO` voltam ao modelo como erro pareado mas **não viram
  linha em `ai_tool_calls`** (não há `rejection_reason` para "limite por passo" no CHECK).
- `attemptCount` passou a contar os `TOOL_STEP`: significa "chamadas ao modelo", não "tentativas
  de recuperação".

---

## Correção avulsa (2026-08-04) — busca travando ao digitar · **não é subfase**

Tarefa de manutenção, em paralelo à 18-A. Três defeitos relatados no módulo Treinos; a varredura
mostrou que o primeiro era um **padrão em 5 telas**, inclusive fora de Treinos.

| Defeito | Causa-raiz | Correção |
| --- | --- | --- |
| Digitar na busca travava e atrasava | Input controlado pelo **valor da URL**: cada tecla chamava `router.replace` e, em página `force-dynamic`, o campo só atualizava após a ida ao servidor | `useUrlText` — texto local, URL depois de 300 ms |
| Grupo muscular trazia secundários ao adicionar exercício ao treino | O picker espalhava `EMPTY_EXERCISE_FILTERS` (`includeSecondary: true`) e **não tem o toggle** que o catálogo tem | `exercisePickerFilters`, função nomeada e testada |
| Escolher alternativa/substituto sem poder digitar | Dois `Select` crus com o catálogo inteiro (um com até 200 itens) | `ExerciseSearchPicker`, reusando `matchesSearch` da 17-A |

Telas do primeiro: `treinos/exercicios`, `treinos/treinos`, `treinos/programas`,
`treinos/historico` e `nutricao/alimentos`.

**O que quase passou:** a primeira versão da correção tinha o mesmo defeito que combatia — se o
usuário seguisse digitando enquanto a gravação anterior estava em voo, o eco atrasado da URL
devolvia o texto antigo ao campo. Um teste puro pegou antes do deploy; a decisão passou a
comparar também com o último valor gravado, distinguindo **eco próprio** de **mudança externa**
(limpar filtros, voltar).

**Para reaproveitar:** `src/lib/forms/use-url-text.ts` + `url-text-sync.ts` (puro, testado) e
`src/components/training/exercise-search-picker.tsx`. Regra registrada no `CLAUDE.md`.

⚠️ **Limite da verificação:** testes, lint, tsc, build e smoke de rota — **as três telas não
foram exercitadas na aplicação rodando** (atrás do login, sem sessão disponível).

---

## Fase 18-A — IA · Fundação, provedores e chat (2026-08-04) ✅ **IMPLEMENTADA E VERIFICADA**

**A 18-A para antes de encostar nos dados, de propósito.** O risco desta subfase nunca foi a IA
responder mal: foi **vazar chave de API**, **estourar orçamento** e **deixar registro
inconsistente**. Um módulo de IA que nasce com acesso aos dados e ganha segurança depois nunca
fica seguro.

### O que foi entregue

| Camada | Arquivos |
| --- | --- |
| Banco | 2 migrations · 7 tabelas `ai_*` · 2 funções (`ai_begin_chat_run`, `ai_reconcile_abandoned_runs`) |
| `core/` (puro) | `contracts` · `capabilities` · `models` · `pricing` · `router` · `fallback` · `errors` · `result` |
| `providers/` | `registry` · `provider-factory` · `ai-sdk/{adapter,openai,gemini,anthropic,xai,error-map}` |
| `agents/` · `tools/` | registry estático (1 agente) · prompt de segurança + prompt do agente · **Tool Registry VAZIO** |
| `usage/` · `security/` | `meter` · `reservation` · `budget` · `untrusted` · `redact` · `rate-limit` |
| `server/` | `keyring` · `crypto-readiness` · `credential-crypto` · `credential-store` · `run-store` · `reconcile` · `chat-runner` |
| Transporte | `POST /api/ia/chat` (SSE, runtime nodejs) |
| Actions | `ai-providers` · `ai-preferences` · `ai-conversations` + `validators/ai.ts` |
| UI | `/ia` (chat · conversas · consumo · configurações) · card em **Configurações** · item na sidebar |

### As sete decisões que a implementação fixou

1. **A chave de API nunca é gravada em claro.** Envelope AES-256-GCM (DEK por credencial,
   embrulhada pela master key do ambiente). A master key **não está no banco**: quem lê
   `ai_provider_credentials` inteira não decifra nada. O AAD
   (`credential_id | owner_id | provider | key_version`) amarra o ciphertext à linha — movê-lo
   para outro dono ou outro provedor **falha**, em vez de decifrar em silêncio.
2. **A admissão é atômica e o commit acontece ANTES de qualquer chamada externa.** Advisory
   lock **transacional** por usuário (nunca de sessão: num pool, lock de sessão vaza para a
   próxima requisição). Timeout do lock vira **429**, não 500 — não houve falha, houve
   concorrência.
3. **O run é uma reserva financeira**, com o invariante XOR testado nas duas vias de soma.
4. **`ai_usage_events` é por tentativa**, com `UNIQUE (run_id, attempt_index)` + FK composta, e
   a policy de UPDATE exige `status = 'started'` — **retificação de uso tardio é impossível no
   banco**, não só no código.
5. **Ausência nunca é zero** — custo `null` + `usage_availability`, e total exibido como
   *parcial* quando alguma tentativa ficou sem custo.
6. **Moeda canônica USD, sem câmbio.** Custo de IA não é transação do usuário e não entra nos
   relatórios de finanças.
7. **Fail-closed só para a IA** — sem `AI_MASTER_KEYS`, o resto do sistema funciona normalmente.

### O que a implementação DESCOBRIU (e não estava no spec)

1. **`no-restricted-imports` usa semântica de .gitignore, não de caminho.** O grupo `"ai"`
   bloqueava `@/lib/ai/**` inteiro — o próprio módulo. O pacote `ai` passou para `paths`
   (casamento exato). Registrado no comentário do `eslint.config.mjs`.
2. **O anexo K dizia "`ai_usage_events` sem policy de UPDATE", e isso contradizia o anexo G.**
   A tentativa nasce `started` e fecha em `completed|failed|cancelled` — isso **é** um UPDATE.
   Implementado como policy de UPDATE com `using (... and status = 'started')`: mais forte que
   a intenção original, porque torna a linha terminal imutável **no banco**.
3. **`server-only` lança fora do bundle do Next**, o que impediria os testes unitários exigidos
   pelos critérios 18–25. Resolvido com alias **só no Vitest** (`src/test/server-only-stub.ts`);
   o `next build` continua usando o pacote real, e há teste conferindo que todo arquivo de
   `server/` importa a guarda.
4. **Endpoint de listagem de modelos existe nos quatro provedores** — o teste de conexão custa
   **zero tokens** e a contingência de "1 token de saída" do anexo I não foi necessária.
5. **`ceil6` com `toFixed(3)` zerava tarifas minúsculas**, e reserva zero não protege nada.
   Trocado por `toPrecision(12)` (precisão relativa).
6. **Contador de teste de conexão precisou de duas colunas novas** em
   `ai_provider_credentials` (`test_window_started_at`, `test_count`): em serverless um
   contador em memória reinicia a cada processo. Fica ali, e não em `ai_runs`, porque testar
   credencial **não é conversa** — não cria run, não gera evento e não entra no orçamento.

### Versões instaladas (registradas, como o anexo J pediu)

`ai@^7.0.51` · `@ai-sdk/openai@^4.0.29` · `@ai-sdk/google@^4.0.33` ·
`@ai-sdk/anthropic@^4.0.29` · `@ai-sdk/xai@^4.0.27` · `server-only@^0.0.1`.
Compatíveis com Next 16.2.9, React 19.2.4 e Zod 4.4.3 (build e suíte verdes).

### Catálogo e tarifas — conferidos na documentação oficial em 2026-08-04

11 modelos ativos e 12 linhas de tarifa, cada uma com `verified_at` e a URL da fonte.
O **Claude Sonnet 5 tem DUAS tarifas** (promocional até 31/08/2026, padrão a partir de
01/09/2026) — é o caso real que justifica `effective_from`/`effective_until`. A **xAI cobra por
faixa** acima de 200k tokens de entrada: a medição usa a faixa efetiva, a reserva usa sempre a
cara. `contextWindow` fica **`null` onde a documentação não afirmava** — não verificado nunca
vira "ilimitado".

### Verificação

`lint` ✅ · `tsc --noEmit` ✅ · `test:run` **2.129 testes** ✅ (eram 1.694) · **`TZ=UTC`** ✅ ·
`build` ✅. Bundle do cliente sem vestígio de AI SDK ou de material criptográfico.
28 asserções de banco pela role `authenticated`, em transação com rollback: RLS, atomicidade,
anti-enumeração, unicidade da tentativa, imutabilidade terminal, FK composta, transições
condicionais, recuperação (heartbeat recente impede / lease vencida fecha / reexecução no-op) e
rate limit.

### Veredito dos 84 critérios de aceite — item a item

**Legenda da evidência:** 🧪 teste automatizado · 🗄️ testado no banco pela role
`authenticated` (transação com rollback) · 🔎 verificado por execução ou inspeção (build,
bundle, grep, revisão do código).

**Fundação e fronteira (1–6) — 6/6**
1 🧪🔎 ESLint + `boundaries.test.ts` · 2 🧪🔎 · 3 🧪 · 4 🔎 build verde + bundle do cliente sem
vestígio · 5 🧪 · 6 🧪 o teste varre `import()` dinâmico, que o ESLint não vê.

**Provedores (7–12) — 6/6**
7 🧪 os quatro pelo mesmo contrato · 8 🧪 17 casos nas 10 classes, sanitizados · 9 🧪
`CAPABILITY_MISSING` (e nenhuma ferramenta é enviada, porque o registry é vazio) · 10 🧪
`MODEL_NOT_IN_CATALOG` · 11 🧪 Zod enum + router · 12 🧪🗄️ `AI_CREDENTIAL_NOT_AVAILABLE`.

**Catálogos (13–17) — 5/5**
13 🔎 os quatro conferidos na documentação oficial em 2026-08-04, com `verified_at` e URL por
entrada 🧪 · 14 🔎 grep: nenhum preço fora de `core/pricing.ts`; a aritmética vive só em
`usage/` · 15 🧪 `rate_snapshot` por tentativa · 16 🧪 `numeric` + USD + versão · 17 🧪
`MODEL_DISABLED` sai da seleção mas continua resolvível pelo histórico.

**Credenciais (18–28) — 11/11** — todos 🧪, mais 26 🔎 (`COLUNAS_PUBLICAS`) e 28 🔎.
Ciclo íntegro · IV distinto · tag adulterada falha · AAD inválido falha · ciphertext movido de
dono/provedor falha · versão desconhecida é erro **tipado** · chave errada falha · rotação com
duas versões · query da tela sem material criptográfico · chave nunca sai em resposta/log ·
teste de conexão grava `last_validated_at` sem revelar nada.

**Master key (29–32) — 4/4** — 29/30 🔎 (`getCryptoReadiness` não lança e não afeta outros
módulos; build verde sem as variáveis) · 31 🔎 `saveCredential` recusa sem keyring · 32 🧪
sem padding, sem senha humana, sem versão silenciosa.

**Chat (33–41) — 9/9**
33 🔎 · 34 🔎 `Sec-Fetch-Site`/`Origin` · 35 🧪🔎 corpo e mensagem (o histórico não vem do
cliente: é lido do banco e cortado por quantidade **e** caracteres) · 36 🧪 nove campos
proibidos, incluindo `user_id` e `attachments` · 37 🧪🗄️ persistência periódica + transições
condicionais · 38 🔎🗄️ · 39 🧪🔎 mensagem sanitizada · 40 🔎 `cancel()` do stream chama
`return()` do runner · 41 🗄️ a mensagem do assistente nasce na admissão.

**Início atômico (42–47) — 6/6** — todos 🗄️. Rollback total nas recusas · não existe run sem
mensagem · nem mensagem de assistente sem run · nem reserva sem run · conversa alheia recusada ·
`auth.uid()` nulo rejeitado e nenhum limite aceito do cliente.

**Uso por tentativa (48–54) — 7/7**
48/49 🔎 o runner abre uma linha por tentativa (`startAttempt` por iteração) · 50/51 🧪 tarifas
não se misturam · 52 🗄️ `23505` na reexecução · 53 🧪 soma correta · 54 🧪 indisponível ≠ 0.

**Reserva e orçamento (55–64) — 10/10**
55 🧪 · 56 🧪 · 57 🧪 XOR provado por duas vias de soma · 58 🔎 · 59 🧪 · 60 🧪 · 61 🧪 teto
explícito em toda chamada · 62 🧪 · 63 🗄️ `AI_BUDGET_EXCEEDED_DAILY` **antes** da chamada ·
64 🔎 grep: nenhuma notificação de IA existe.

**Recuperação (65–70) — 6/6** — 65/66/68 🗄️ · 67 🗄️ segundo fechamento é no-op · 69 🧪
reserva vencida sai do somatório · 70 🔎🗄️ a função chama a reconciliação **antes** de reservar.

**Rate limit (71–72) — 2/2** — 72 🗄️ limite lido pelo banco · 71 🗄️ o limite é aplicado dentro
da transação sob advisory lock. ⚠️ **A corrida real (duas transações simultâneas) não foi
simulada** — o que foi verificado é que o lock existe, é transacional e que o limite recusa.

**Segurança e ferramentas (73–77) — 5/5**
73 🧪 texto de injection vira conteúdo de bloco tipado, com aviso · 74 🧪 nenhuma definição é
enviada, mesmo com allowlist preenchida · 75 🧪 evento repassado, nada executado · 76 🧪🔎 ·
77 🧪 nenhum import de query de módulo em `src/lib/ai/`.

**Trava de honestidade (78) — 1/1** — 🧪 8 asserções sobre o prompt, incluindo as duas formas
disfarçadas de inventar ("provavelmente uns R$ 300", "assumindo que você gastou X").

**Transversais (79–84) — 6/6**
79 🔎 pt-BR em toda a UI · 80 🔎 dark/light por tokens e as 5 regras de responsividade
aplicadas (`min-w-0`, `sm:max-w-lg` no diálogo, `top-18` na barra fixa, tabela com
`overflow-x-auto`) — **conferido por revisão, não por screenshot** · 81 🗄️ RLS + FORCE nas 7
tabelas · 82 🔎 lint + tsc + 2.129 testes + build, todos verdes · 83 🔎 suíte verde em `TZ=UTC` ·
84 🔎 `/ia` e `/api/ia` fora de `PUBLIC_PATHS`; `/api/cron` segue protegido por `CRON_SECRET`.

**84 de 84 atendidos.** As duas ressalvas honestas estão marcadas acima (71 e 80) — em ambas o
mecanismo está implementado e verificado; o que não houve foi simulação de concorrência real e
inspeção visual automatizada.

### ⚠️ Pendências conscientes da 18-A

- **`vercel.json` não foi alterado.** O Cron continua 2×/dia (pior caso 12 h para a varredura
  global). Aceito porque a reconciliação preguiçosa é a primária — em especial a que roda
  **dentro** de `ai_begin_chat_run`, antes de reservar novo run.
- **`revalidatePath` em Route Handler não foi exercitado** (o chat não invalida cache; a tela
  chama `router.refresh()`). A verificação empírica continua sendo tarefa da 18-C.
- **Capacidades `visao`/`tool_calling` não foram marcadas em nenhum modelo**, porque a
  documentação consultada não afirmava por modelo. Não limita a 18-A (que usa só texto +
  streaming); a 18-D precisará conferir modelo a modelo antes de habilitar imagem.

---

## Fase 18 — Inteligência Artificial (2026-08-04) 📝 **A ETAPA DE DESIGN**

O registro da etapa de **design** que precedeu a implementação, aprovada pelo usuário em quatro
rodadas de revisão.

### O que foi produzido

| Arquivo | O quê |
| --- | --- |
| `docs/superpowers/specs/2026-08-04-modulo-ia-design.md` | **Spec de referência** — desenho completo e validado |
| `docs/phases/PHASE_18_A_AI_FOUNDATION_PROVIDERS_CHAT.md` | 18-A, detalhada (84 critérios de aceite) |
| `docs/phases/PHASE_18_B_AI_CONTEXT_READ_TOOLS_AGENTS.md` | 18-B |
| `docs/phases/PHASE_18_C_AI_ACTIONS_APPROVALS_AUDIT.md` | 18-C |
| `docs/phases/PHASE_18_D_AI_VISION_DOCUMENTS_RECEIPTS.md` | 18-D |
| `docs/phases/PHASE_18_E_AI_INSIGHTS_REPORTS_DASHBOARDS.md` | 18-E |
| `docs/phases/PHASE_18_F_AI_MEMORY_VOICE_INTEGRATIONS_POLISH.md` | 18-F, fecha a fase |

Atualizados: `PROJECT_BRIEFING.md`, `PROJECT_ROADMAP.md`, `PROJECT_ARCHITECTURE.md`,
`CURRENT_STATUS.md`, `NEXT_AGENT_INSTRUCTIONS.md`, `CLAUDE.md`.

### O que NÃO foi feito **nesta etapa** (proposital)

Nenhum arquivo em `src/` foi criado ou alterado · nenhuma dependência instalada · nenhuma
migration criada ou aplicada · `vercel.json` intacto · nenhum deploy.

> ✅ A implementação veio depois, com autorização explícita — ver a seção da **18-A** acima.
> `vercel.json` continua intacto.

### As decisões que custaram debate (e por que ficaram assim)

1. **`ai_usage_events` é por TENTATIVA, não por run.** Um run pode ter retry, fallback de
   provedor e fallback de modelo — cada um com provedor, modelo, moeda e tarifa próprios. Uma
   linha por run obrigaria a sobrescrever custo, perder a primeira tentativa ou misturar
   tarifas. Chave **revisada na última rodada** para `(run_id, attempt_index)` + FK composta
   `(run_id, user_id)`: `run_id` já é globalmente único e determina o dono, então `user_id` na
   constraint não acrescentava unicidade — quem protege de verdade é a FK composta.
2. **`select-then-insert` não garante idempotência.** Duas execuções concorrentes fazem o
   select, não acham nada e inserem as duas. A garantia é a constraint: insert primeiro, e em
   `23505` lê a linha existente. O `42P10` que mordeu o projeto na 16-B é outro problema
   (índice **parcial** que o Postgres não infere) e se resolve conferindo a constraint, não
   abrindo mão de atomicidade.
3. **Contar runs e depois inserir tem corrida.** Duas requisições veem 9 de 10 e ambas passam.
   Por isso o início do run é uma função com `pg_advisory_xact_lock` por usuário.
4. **O advisory lock não resolve a corrida de orçamento.** Duas requisições veem o mesmo
   consumo confirmado enquanto a primeira ainda não gerou evento de uso. Por isso o run também
   é **reserva financeira temporária** (`reserved_cost`, `reservation_expires_at`).
5. **"Nenhum run fica preso" não é verdade num crash.** O correto é um **SLA declarado**:
   heartbeat a cada 10 s, abandono após 5 min, recuperação **preguiçosa** ao abrir `/ia`,
   listar conversas e **antes de reservar novo run**, com o Cron como rede.
   ⚠️ **O Cron real roda `0 12` e `0 0` — 2×/dia, 09h e 21h BRT, pior caso de 12 h.**
   Registrado como risco; `vercel.json` **não** foi alterado.
6. **`base_url` editável foi removida.** URL arbitrária abriria SSRF, envio da chave para
   domínio malicioso e vazamento de prompt. Endpoint oficial fica no adapter.
7. **`revalidatePath` sozinho não torna uma action acoplada à interface.** Levantamento das 44
   actions: 0 com `redirect()`, 3 com `FormData`, 41 com `revalidatePath`. Classificar as 41
   como Caso B viraria um refactor da camada de mutação inteira. Commands são extraídos **sob
   demanda na 18-C**, só para o que a IA usar.
8. **Falta de master key desativa só a IA.** O resto do sistema continua funcionando;
   `/api/ia/chat` responde `503 AI_CRYPTO_NOT_CONFIGURED`. Sem padding em chave curta, sem
   derivar de senha, sem escolher outra versão em silêncio.

### Divergências encontradas no repositório (não corrigidas)

- **`PROJECT_BRIEFING.md` tem numeração de módulo colidindo:** "Módulo 16" aparece como TO-DO
  e como "Banco de dados"; "Módulo 17" como Dieta e como "Segurança e privacidade". O módulo
  **Treinos não está no briefing**. Por isso a seção de IA entrou como "Módulo IA", sem número.
  Renumerar é tarefa avulsa própria.
- **A doc local do Next 16 (`09-revalidating.md:158`) declara escopo para `revalidateTag`**
  ("Server Actions and Route Handlers") mas **não declara para `revalidatePath`**. A 18-C deve
  confirmar empiricamente antes de depender disso.

---

## Subfase 17-F — Treinos · Integrações, notificações e resiliência (2026-08-04) ✅ **FECHA A FASE 17**

Sexta e última subfase da **Fase 17**. As anteriores entregaram um módulo completo e **isolado**;
a 17-F o liga à busca global, ao lançamento rápido, às notificações, ao dashboard, à agenda, ao
TO-DO, à Dieta e aos Hábitos — e valida os **55 critérios de aceite gerais**.
**3 migrations (1 tabela nova + 2 colunas + 2 FKs compostas), +70 testes puros.** Suíte:
1.846 → **1.916**.

### ⛔ A regra que a subfase existe para garantir

**NENHUMA DUPLICIDADE DE VERDADE.** O mesmo treino podia virar tarefa no TO-DO, evento na
agenda, dia planejado no calendário e check-in de hábito. A tabela de fonte de verdade está
implementada:

- **o treino aconteceu** → `training_sessions`. O hábito "Treinar" **reflete** (upsert na linha
  única de `habit_logs` do dia); nunca há segundo registro, e excluir a sessão devolve o dia;
- **está planejado** → `training_scheduled_workouts`. Agenda e TO-DO são espelhos **opcionais**;
- **peso e medidas** → `body_*` (16-E), o mesmo serviço da Dieta;
- **dia de treino/descanso** → Treinos responde, **a Dieta consome** (`day-kind.ts`).

### Arquivos criados

**Migrations (3):** `20260806100000_training_calendar_sync.sql`,
`…100100_training_preferences_habit_link.sql`, `…100200_training_cross_owner_fks.sql`.

**Lógica pura (5 arquivos + 5 de teste, +70):** `src/lib/search/training-links.ts` (+7),
`src/lib/training/day-kind.ts` (+10), `google-event.ts` (+12), `habit-reflection.ts` (+9),
`src/lib/notifications/training.ts` (+28). `dashboard/cards.test.ts` e
`settings/export-tables.test.ts` ganharam os casos da 17-F.

**Servidor:** `src/lib/notifications/training-cron.ts`, `src/lib/training/calendar-sync.ts`,
`habit-sync.ts`, `day-kind-queries.ts`, `src/lib/actions/training-integrations.ts`,
`src/lib/actions/training-quick-add.ts`.

**Interface:** `src/components/dashboard/general/training-card.tsx`,
`src/components/training/{integrations-card,todo-link-dialog}.tsx`,
`src/components/shared/deep-link-highlight.tsx`.

**Alterados:** `notifications/{constants,generate,cron}.ts` · `settings/constants.ts` ·
`settings/export-tables.ts` · `search/{types,queries}.ts` · `dashboard/{cards,types,queries}.ts` ·
`training/{queries,types,history-queries}.ts` · `actions/{training-schedule,training-sessions,training-history}.ts` ·
`google/tokens.ts` · `calendar/queries.ts` · `types/database.ts` · `nutrition/report-queries.ts` ·
`components/{quick-add,search,notifications,dashboard}/*` · `agenda/google-connect-card.tsx` ·
as páginas de `/treinos/{hoje,metas,recordes,programas,configuracoes}` e `/nutricao/diario`.

### ⚠️ A armadilha que só o teste no banco revelou

Pela role `authenticated`, o intruso conseguia inserir
`training_calendar_sync(user_id = ele, scheduled_workout_id = <dia de outro>)` — a RLS confere o
`user_id` da **própria linha** e nada sabe sobre a linha apontada. Não vazava dado, mas ocupava
a chave única `(scheduled_workout_id, provider)`: **negação de serviço silenciosa** contra o
dono. Corrigido com **FK composta**, a mesma solução da 16-E nas fotos de evolução. Reconferido:
**23503** para o intruso, **OK** para o dono.

### Segurança verificada no banco (role `authenticated`)

**11 verificações.** Intruso lê/edita/exclui **0 linhas** em `training_calendar_sync`,
`training_preferences`, `training_scheduled_workouts`, `habits` e `habit_logs` alheios; não
forja ponte com `user_id` de terceiro (42501); **não reivindica** dia planejado nem hábito
alheios (23503, depois da FK composta); duas pontes para o mesmo dia+provedor são recusadas
(23505); `sync_status` fora do CHECK é recusado (23514); o dono cria a própria ponte
normalmente. **0 resíduo** (tudo em transação com rollback); catálogo intacto (106 exercícios).

### Verificação

`npm run lint` limpo · `npx tsc --noEmit` limpo · `npm run test:run` **1.916** (de 1.846) ·
`npm run build` verde. Suíte passa em `TZ=UTC`. Smoke: `/dashboard`, `/treinos`,
`/treinos/{metas,recordes,programas,configuracoes}`, `/nutricao/diario`, `/agenda` e
`/api/export` → **307 `/login`**; `/login` → 200; `/api/cron/notifications` → **401**.
`get_advisors`: **0 lints de schema**. **112 tabelas, 0 sem RLS.**

---

## ✅ Os 55 critérios de aceite da Fase 17 — veredito item a item

**55 de 55 atendidos.** Cada item foi conferido no código, no banco ou na suíte.

| # | Critério | Veredito | Onde |
| --- | --- | --- | --- |
| 1 | Aba central Treinos na sidebar | ✅ | `src/config/nav.ts` → `/treinos` |
| 2 | Os 13 submódulos organizados dentro dela | ✅ | `TRAINING_SECTIONS`: **13 seções, todas `pronto`** |
| 3 | Cadastro exercícios | ✅ | `/treinos/exercicios` (17-A) |
| 4 | Base inicial útil | ✅ | **106 exercícios** autorais (reconferido no banco) |
| 5 | Filtro exercícios | ✅ | `filters.ts` (busca sem acento + 9 filtros combináveis) |
| 6 | Duplico exercícios pessoais | ✅ | `duplicateExercise` + `origin_exercise_id` |
| 7 | Exclusões em massa | ✅ | `bulkExerciseAction` (17-A) |
| 8 | Cadastro programas | ✅ | `/treinos/programas` (17-B) |
| 9 | Cadastro treinos | ✅ | `/treinos/treinos` + construtor |
| 10 | Exercícios, ordem, séries, repetições e descanso | ✅ | `expandPlannedSets` (`workout.ts`) |
| 11 | Escolho o treino ao iniciar | ✅ | `/treinos/sessao/preparar` + lançamento rápido (17-F) |
| 12 | Reviso e altero antes de iniciar | ✅ | `prepare-review-client` (17-C) |
| 13 | Sistema sugere dados do último treino | ✅ | `previous.ts` (17-C) |
| 14 | Edito os valores sugeridos | ✅ | `applyPreparation` (ajuste explícito) |
| 15 | Um exercício por vez | ✅ | `session-live-client` (17-C) |
| 16 | Peso e repetições por série | ✅ | `recordSet` + `set-editor` |
| 17 | Dificuldade, RIR ou RPE | ✅ | `difficulty_scale` nas preferências |
| 18 | O descanso funciona | ✅ | `timers.ts` (timestamp, não contagem local) |
| 19 | **3ª de 4 séries → 4ª SÉRIE** | ✅ | `session-flow.test.ts` (teste com esse nome) |
| 20 | Última série → próximo exercício | ✅ | idem, `nextStep` |
| 21 | Mudo a ordem durante a sessão | ✅ | `applyExecutedOrder`/`moveExercise` |
| 22 | Pulo e volto a um exercício | ✅ | `setSessionExerciseStatus` |
| 23 | Substituo um exercício | ✅ | `substituteSessionExercise` + motivo obrigatório |
| 24 | Séries não se perdem ao reordenar | ✅ | séries pertencem ao exercício, não à posição (17-C) |
| 25 | Tempo total registrado | ✅ | `finalizeTimes` |
| 26 | Tempo ativo registrado | ✅ | `timers.ts` — união de pausas e descansos |
| 27 | Descansos registrados | ✅ | `training_session_rests` |
| 28 | Pauso e retomo | ✅ | `pauseSession`/`resumeSession` |
| 29 | Sessão interrompida pode ser recuperada | ✅ | a sessão vive no servidor (`getRunningSession`) |
| 30 | Tolera conexão instável | ✅ | fila local + `client_mutation_id` + status visível (17-C) |
| 31 | Finalizo e reviso | ✅ | `/treinos/sessao/revisar` |
| 32 | Abro qualquer treino passado | ✅ | `/treinos/historico/[id]` |
| 33 | Vejo pesos, séries, repetições e descansos | ✅ | detalhe da sessão (do SNAPSHOT) |
| 34 | Histórico de um exercício | ✅ | `/treinos/exercicios/[id]` |
| 35 | Gráficos de evolução por exercício | ✅ | `training-charts` + tabela equivalente |
| 36 | Volume por sessão/semana/mês/grupo, com a regra explicada | ✅ | `metrics.ts` + `volumeRuleLabel` ao lado do número |
| 37 | Recordes sem duplicidade | ✅ | `record_key` único; empate não gera marca |
| 38 | 1RM identificado como estimativa, com a fórmula | ✅ | `one-rm.ts`; fora da faixa não vira recorde |
| 39 | Progressão transparente, ignorável e desativável | ✅ | `progression.ts`; **dor bloqueia sempre** |
| 40 | Metas de frequência, desempenho, corporais e personalizadas | ✅ | `/treinos/metas` (17-E) |
| 41 | Peso e medidas na estrutura compartilhada | ✅ | `body_*` — **4 tabelas, nenhuma em `training_*`** |
| 42 | Dashboards semanal/mensal/anual + calendário de consistência | ✅ | `dashboards.ts` (consome `metrics.ts`) |
| 43 | Relatórios e exportação | ✅ | `/treinos/relatorios` + `/api/export` (**27 tabelas `training_*`**) |
| 44 | Busca global encontra as 6 entidades | ✅ | `search/queries.ts` + `training-links.ts` (**teste de contrato**) |
| 45 | Inicio treino e registro peso pelo lançamento rápido | ✅ | `training-quick-add.ts` (caminho oficial) + tipo "Peso e medidas" |
| 46 | Notificações configuráveis, sem duplicidade e sem culpa | ✅ | 9 famílias; **teste de vocabulário proibido** + rodar 3× não duplica |
| 47 | Agenda e TO-DO **por escolha minha** | ✅ | `training_sync_enabled` (opt-in) + `TodoLinkDialog` (por clique) |
| 48 | Hábito "Treinar" reflete a sessão, sem registro duplicado | ✅ | `habit-sync.ts` — upsert na linha única do dia |
| 49 | Treino de hoje, meta, último treino, evolução e sessão ativa no dashboard | ✅ | `training-card.tsx` (+ botão **Continuar treino**) |
| 50 | Uso confortável no celular, com uma mão | ✅ | alvos `h-11`/`h-12`, grades responsivas, `min-w-0`+`truncate` |
| 51 | Dark/light, desktop/tablet/celular, pt-BR | ✅ | só tokens do design system; nenhuma cor fixa nova |
| 52 | Teclado, foco visível, rótulos e contraste | ✅ | `Label`+`id` em todo campo novo; `aria-current`; `prefers-reduced-motion` |
| 53 | RLS + FORCE RLS em todas as tabelas do módulo | ✅ | **112 tabelas, 0 sem RLS**; 11 verificações pela role `authenticated` |
| 54 | Nenhum segredo no client, nenhuma foto pública, nada sensível em log | ✅ | `service_role` só no Cron; `last_error` sem token nem corpo |
| 55 | Nenhuma fase anterior quebrada; lint, tsc, testes e build passam | ✅ | **1.916 testes** verdes (também em `TZ=UTC`) |

### Pendências conscientes da Fase 17 (escopo, não bugs)

| Item | Por quê |
| --- | --- |
| PWA / service worker / offline real | **Não implementado, e a interface não promete.** O que existe é fila local + reenvio em ordem + status de sincronização sempre visível (17-C) |
| Canais externos de notificação (push/e-mail) | Fora do escopo do sistema inteiro; só com infraestrutura real de envio |
| Integração com balança, relógio ou wearable | Não planejado. `body_measurements.source` já prevê o campo |
| Vídeo/imagem de terceiros por exercício | **Nunca.** Só asset próprio, com licença registrada |
| Sugestão de treino por IA; comparação com outras pessoas | **Nunca** — sistema single-user, sem prescrição |
| "Registrar treino passado" pelo lançamento rápido | O caminho existe na preparação da sessão (com data); o modal rápido cobre iniciar treino e peso, que são os do critério 45 |

---

## Subfase 16-F — Dieta · Integrações, notificações e polimento (2026-08-04) ✅ **FECHA A FASE 16**

Sexta e última subfase da **Fase 16**. As anteriores entregaram um módulo completo e **isolado**;
a 16-F o liga ao dashboard, à busca global, ao lançamento rápido, às notificações, ao TO-DO e à
agenda — e valida os **40 critérios de aceite gerais**.
**Nenhuma tabela nova; +65 testes puros.** Medido isolado sobre o `main` de então: 1.630 → 1.694. **Depois do merge com a 17-E (que entrou primeiro), a suíte marca 1.846** — conte antes de citar um número.

### ⛔ A regra que a subfase existe para garantir

**INTEGRAR, NÃO REIMPLEMENTAR.** Um card de dashboard que refizesse a soma do dia discordaria do
diário na primeira diferença de arredondamento, e o usuário veria **dois números para a mesma
refeição**. Toda tela nova aqui é casca sobre lógica já testada:

- o card consome `buildDailyReports` (16-E) e `summarizeType` (16-E) — não soma nutriente;
- o lançamento rápido chama `addDiaryEntry`/`addMealTemplateToDiary` — não monta snapshot;
- as notificações usam `effectiveMealStatus` (16-B) — não derivam status próprio;
- a foto de receita copia o caminho de `uploadProgressPhoto` (16-E) — sem segundo mecanismo.

`quickAddDiaryEntry` **só resolve a refeição do dia** e delega. É o que garante que o registro
rápido nasça com a mesma procedência do registro normal.

### Arquivos criados

**Lógica pura + testes:** `src/lib/notifications/nutrition.ts` (+37),
`src/lib/search/nutrition-links.ts` (+6), `src/lib/reports/xlsx.ts` (+5),
`src/lib/settings/export-tables.ts` (+8), `src/lib/dashboard/cards.test.ts` (+8).

**Servidor:** `src/lib/notifications/nutrition-cron.ts` (leitura do módulo para o Cron),
`src/lib/actions/nutrition-quick-add.ts`, `src/lib/actions/nutrition-integrations.ts`.

**Interface:** `src/components/dashboard/general/nutrition-card.tsx`,
`src/components/nutrition/{barcode-scanner-dialog,market-categories-dialog,schedule-meal-dialog}.tsx`,
`src/components/body/measurement-types-dialog.tsx`.

### Arquivos alterados

`src/lib/notifications/{constants,generate,cron}.ts` · `src/lib/settings/constants.ts` ·
`src/lib/dashboard/{cards,types,queries}.ts` · `src/lib/search/{types,queries}.ts` ·
`src/lib/nutrition/{constants,types,diary,recipe-queries}.ts` ·
`src/lib/actions/nutrition-recipes.ts` · `src/lib/validators/nutrition-recipes.ts` ·
`src/app/api/export/route.ts` · `src/components/quick-add/quick-add.tsx` ·
`src/components/{search,notifications,dashboard}/*-meta.*` ·
`src/components/nutrition/{food-filters,food-form-dialog,recipe-detail-sheet,shopping-generate-dialog}.tsx` ·
as páginas e clients de `/nutricao/{alimentos,receitas,refeicoes,planejamento,compras,medidas,relatorios}`.

### Decisões técnicas registradas

1. **A lacuna da Fase 13 que só apareceu agora:** `settings.notification_prefs` era **salvo e
   nunca lido** — o Cron gerava tudo. `filterByPrefs` (puro, testado) roda entre a geração e a
   gravação e vale para **todos** os tipos, inclusive os das fases anteriores. Filtrar num lugar
   só impede um tipo novo de escapar da preferência por esquecimento.
2. **Semântica de OPT-IN** (`NOTIFICATION_OPT_IN_TYPES`): ausente = ligado, salvo nos tipos que
   nascem desligados. `nutrition_goal_close` é o único: avisar sem ser pedido sobre o quanto a
   pessoa ainda "pode" comer é lido como cobrança.
3. **Sem linguagem de culpa, travado por TESTE.** Um vocabulário proibido é varrido em todo
   título e descrição gerados. Nenhuma notificação da Dieta é `high` ou `urgent` — nada aqui é
   emergência — e toda uma oferece um caminho (link), em vez de só constatar.
4. **Chaves semanais onde um aviso diário viraria cobrança.** Lista de compras aberta há um mês
   gera 1 aviso por semana, não 30. **Passar da meta não gera aviso nenhum.**
5. **Minutos "agora" saem de `timeInSaoPaulo`, não de `getHours()`.** Na Vercel (UTC) o almoço
   "atrasaria" às 9h da manhã.
6. **O card nasce no FIM de `DASH_CARD_IDS`** — é o que faz `normalizeLayout` anexá-lo sem
   empurrar nada que o usuário já tinha posicionado. Provado por teste sobre um layout salvo
   pré-16-F, com ordem personalizada e card oculto.
7. **A foto da receita passou a ser lida por URL assinada de 5 min.** Até a 16-E ela expunha
   `storage_path` no payload do cliente — inconsistente com a disciplina das fotos de evolução.
   Agora `storagePath` **não existe** no tipo que desce para o navegador.
8. **Reordenar tem DUAS formas: arrasto e setas ↑↓.** Uma lista reordenável só por arrasto é
   inacessível — e reordenar é justamente o valor do recurso (corredor de mercado é a ordem em
   que a pessoa anda pelo mercado).
9. **`xlsx` por import dinâmico**, dentro do handler do clique: a biblioteca inteira no bundle
   de quem nunca exporta faria todo mundo pagar por um botão. O CSV continua sendo o padrão.
10. **`EXPORT_TABLES` virou módulo puro** para o backup poder ser testado: nenhum token, 31
    tabelas `nutrition_*` + 4 `body_*`, nenhuma view, nenhuma duplicata.

### ⚠️ Duas armadilhas registradas (não repita)

**1. Um `insert … select` bloqueado pela RLS insere zero linhas SEM LANÇAR ERRO.** No teste de
segurança isso passa por "não bloqueado" e produz um falso positivo tranquilizador. Refaça com
`values()` explícito e um id real — é o que exercita o `WITH CHECK` de verdade.

**2. A despensa NÃO é rota própria.** É `?aba=despensa` de `/nutricao/compras`. Um link para
`/nutricao/despensa` manda a notificação de validade para um 404. Por isso os deep-links vivem
num módulo puro (`src/lib/search/nutrition-links.ts`) com teste de contrato.

### ⚠️ Incidente de processo (registrado para o próximo agente)

**A frente de Treinos trocou a branch no meio do trabalho.** O diretório saiu de
`feat/nutricao-16f-integracoes` para `feat/treinos-fase-17e`, com dois commits da 17-E aplicados.
O trabalho da 16-F estava **não commitado** e sobreviveu, mas o `src/app/api/export/route.ts` já
reconstruído havia capturado as 31 tabelas `training_*` da 17-E. Resolução: `git stash` → voltar
para a branch certa → **reconstruir `export-tables.ts` a partir do `main`**, sem nenhuma tabela
`training_*`. Confirmado: a branch da 16-F tem **1.694** testes (1.630 do `main` + 64) e **zero**
arquivo de Treinos. **Confirme `git branch --show-current` antes de cada commit.**

`src/lib/settings/export-tables.ts` é agora um **ponto de contato entre as duas frentes** — a
17-E acrescenta as `training_*` ali. Ao mexer, ACRESCENTE a sua seção sem reescrever a do outro.

### Segurança verificada no banco (role `authenticated`)

**24 tentativas indevidas, 24 bloqueadas.** Intruso lê **0 linhas** em receita alheia
(deep-link `?receita=`), anexo de foto de receita, alimento próprio alheio (busca global),
medidas, fotos de evolução, listas, despensa, notificações e `settings`; **enxerga** os 597
alimentos da base (comportamento desejado) mas **não edita nem exclui** nenhum; não forja anexo
(42501) nem notificação (42501) em nome de terceiro; não cria refeição com `user_id` alheio
(42501) nem usa `meal_type_id` de terceiro (23503); não adiciona item na lista de A (23502);
ação em massa alcança **0** linhas alheias; `storage.objects` devolve 0. **0 resíduo** de teste;
catálogo reconferido (597 alimentos, 21.147 valores). `get_advisors`: **0 lints de schema**.

### Verificação
`npm run lint` limpo · `npx tsc --noEmit` limpo · `npm run test:run` **1.694** isolado (de
1.630) e **1.846** já integrado com a 17-E ·
`npm run build` verde com as 12 rotas de `/nutricao`. Suíte passa em `TZ=UTC`.
Smoke: rotas privadas → **307 `/login`**, `/login` → 200, `/api/cron/notifications` → **401**.
**111 tabelas** no projeto, **0 sem RLS**. Nenhuma migration (a 16-F não criou tabela).

---

## ✅ Os 40 critérios de aceite da Fase 16 — veredito item a item

**40 de 40 atendidos.** Nenhum aceite silencioso: cada item foi conferido no código, no banco ou
na suíte, e a evidência está na coluna à direita.

| # | Critério | Veredito | Onde |
| --- | --- | --- | --- |
| 1 | Existe uma aba central "Dieta e Alimentação" | ✅ | `src/config/nav.ts` → `/nutricao` |
| 2 | Os submódulos estão organizados dentro dela | ✅ | `NUTRITION_SECTIONS`: **12 seções, todas `pronto`** — ver a correção registrada abaixo |
| 3 | Consigo configurar metas | ✅ | `/nutricao/metas` (16-B), meta vigente por data |
| 4 | Consigo visualizar calorias e nutrientes do dia | ✅ | `/nutricao/diario` + card do dashboard (16-F) |
| 5 | Consigo visualizar refeições do dia e da semana | ✅ | `/nutricao/diario` (dia/semana/**mês**, 16-E) |
| 6 | Consigo planejar refeições | ✅ | `/nutricao/planejamento` (16-B/16-C) |
| 7 | Consigo registrar o que realmente consumi | ✅ | `addDiaryEntry` + lançamento rápido (16-F) |
| 8 | Consigo editar quantidades | ✅ | `updateDiaryEntryQuantity` (16-B) |
| 9 | Consigo marcar refeição como não consumida | ✅ | `setDiaryMealStatus` (16-B) |
| 10 | Consigo substituir uma refeição | ✅ | `/nutricao/substituicoes` (16-C) |
| 11 | Consigo substituir um alimento | ✅ | idem, nível `alimento` |
| 12 | Consigo comparar nutricionalmente uma substituição | ✅ | `substitution-compare-dialog`; servidor **recalcula** |
| 13 | Consigo cadastrar alimentos | ✅ | `food-form-dialog` + scanner de código (16-F) |
| 14 | Existe uma base brasileira útil e verificável | ✅ | TACO 4ª ed. — **597 alimentos, 21.147 valores** (reconferido) |
| 15 | Os alimentos possuem fonte registrada | ✅ | `nutrition_food_sources` + `ATTRIBUTION.md` |
| 16 | Consigo usar medidas caseiras | ✅ | `nutrition_food_measures` + seletor no lançamento rápido |
| 17 | Consigo cadastrar receitas | ✅ | `/nutricao/receitas` (16-C) + **foto** (16-F) |
| 18 | Os nutrientes da receita são calculados | ✅ | `getRecipesWithTotals` → `calc.ts`, no servidor |
| 19 | Consigo criar refeições-modelo | ✅ | `/nutricao/refeicoes` (16-C) |
| 20 | Consigo duplicar refeições, receitas e planejamentos | ✅ | `duplicateRecipe`, `duplicateMealTemplate`, `duplicatePlannedWeek` |
| 21 | Consigo excluir em massa onde aplicável | ✅ | `bulkRecipeAction`, `bulkShoppingItems`, `deleteMeasurements` — e a auditoria provou que a ação em massa **respeita o dono** |
| 22 | Consigo filtrar todos os submódulos | ✅ | `filters.ts` (alimentos), busca/filtro em receitas, modelos, compras, medidas e relatórios |
| 23 | Consigo gerar lista de compras | ✅ | 16-D + **quantidade por receita** (16-F) |
| 24 | A lista consolida itens corretamente | ✅ | `shopping.ts`: **não soma unidades incompatíveis**; `separate_reason` |
| 25 | Consigo registrar medidas | ✅ | `/nutricao/medidas` + lançamento rápido (16-F) |
| 26 | Consigo acompanhar evolução | ✅ | gráfico com `connectNulls={false}` + **tabela equivalente** |
| 27 | Fotos de evolução são privadas | ✅ | bucket privado, URL assinada de 5 min, FK composta; auditoria: intruso lê **0** |
| 28 | O histórico não muda quando um alimento é editado | ✅ | `nutrients_snapshot`; provado no banco na 16-B e reconferido |
| 29 | O dashboard principal recebe os cards do módulo | ✅ | card `dieta` + **8 testes** de `normalizeLayout` |
| 30 | O buscador global encontra os registros | ✅ | 5 tipos novos + **teste de contrato dos deep-links** |
| 31 | O lançamento rápido permite registrar alimentação | ✅ | 4 tipos; grava pelo **caminho oficial** |
| 32 | As notificações funcionam sem duplicidade | ✅ | 8 famílias; rodar 2× e 3× **não duplica** (testado) |
| 33 | O módulo funciona em modo dark e light | ✅ | só tokens do design system; nenhuma cor fixa nova |
| 34 | O módulo funciona no celular | ✅ | scanner mobile-first, alvos de toque `h-11`, grids responsivos |
| 35 | As políticas RLS estão funcionando | ✅ | **24/24 bloqueios** pela role `authenticated`; **0 tabelas sem RLS** |
| 36 | Os cálculos possuem testes | ✅ | **1.694** testes, verdes também em `TZ=UTC` |
| 37 | Nenhuma funcionalidade anterior foi quebrada | ✅ | os 1.630 do `main` continuam passando; lint/tsc/build verdes |
| 38 | A documentação foi atualizada | ✅ | este arquivo + `CURRENT_STATUS.md` + `PROJECT_ROADMAP.md` + `CLAUDE.md` |
| 39 | O handoff foi preenchido | ✅ | `NEXT_AGENT_INSTRUCTIONS.md` + `PROMPT_PROXIMA_FASE.md` |
| 40 | O próximo agente recebeu o caminho exato da próxima subfase | ✅ | **não há 16-G**: a frente Dieta entra em manutenção. O caminho entregue é o da frente Treinos: `docs/phases/PHASE_17_E_TRAINING_GOALS_DASHBOARDS.md` |

### ⚠️ Correção pós-entrega: o critério 2 foi marcado ✅ cedo demais

Na primeira validação, `/nutricao/configuracoes` ainda era um **placeholder** com o texto
"Esta seção ainda não foi construída" e `status: "planejada"`, `phase: "Subfase 16-F"` — ou
seja, era escopo desta subfase e não tinha sido entregue. O critério 2 foi dado como atendido
com base num comando de verificação **defeituoso**: um `grep … | paste - - | grep -v pronto`
que pareava as linhas erradas e devolvia vazio, o que foi lido como "nenhuma seção pendente".

**Como foi corrigido:** a tela foi construída (`configuracoes/{page,settings-client}.tsx`) e o
status virou `pronto`. A conferência passou a extrair `slug` + `status` com uma regex que casa
os dois no mesmo registro, e a imprimir seção a seção — um vazio agora significa vazio.

**Lição registrada:** uma verificação que devolve vazio precisa provar que rodou. Contar as
linhas encontradas (12 de 12) é diferente de não encontrar nada.

**O que a tela entrega** (fecha três gestões que existiam sem interface nenhuma):
- **Tipos de refeição** (16-B) — criar, renomear, reordenar, ativar/desativar e excluir.
  Excluir é RECUSADO pelo servidor quando já houve uso, com a contagem e a alternativa.
- **Categorias de receita** (16-C) e **etiquetas de alimento** (16-A) — `on delete set null`:
  a tela diz o que acontece antes de confirmar.
- **Fontes nutricionais** com a **citação da TACO por extenso** — é exigência da licença, e
  deixá-la só num arquivo do repositório não cumpre a exigência para quem usa o sistema.
- Resumo do catálogo e atalhos para corredores, tipos de medida, metas e notificações.

### Pendências conscientes da Fase 16 inteira (escopo, não bugs)

| Item | Por quê |
| --- | --- |
| Medidas caseiras oficiais em massa | A TACO não publica. Entra por segunda fonte, pelo mesmo pipeline — nada foi inventado |
| Base externa de código de barras (consultar produto pelo EAN) | **Fora de escopo por decisão de produto**: dado nutricional de fonte não verificada não entra. O scanner identifica o código; os valores continuam sendo do usuário ou da base |
| Canais externos de notificação (push/e-mail) | Fora do escopo do sistema inteiro; só com infraestrutura real de envio |
| Integração com balança | Não planejado (`body_measurements.source` já prevê o campo) |
| Prescrição/diagnóstico nutricional | **Nunca** — decisão de produto |
| Comparar com outros usuários ou normas populacionais | **Nunca** — o sistema é single-user |
## Subfase 17-E — Treinos · Metas, medidas corporais compartilhadas e dashboards (2026-08-04) ✅

Quinta das 6 subfases da **Fase 17**. A 17-D transformou o acúmulo de sessões em leitura; a
17-E acrescenta **direção** (metas) e **síntese** (dashboards e relatórios), e liga o módulo à
evolução corporal. **2 tabelas novas, +147 testes puros** (suíte: 1634 → 1781).

### ⛔ A decisão mais delicada da fase, e ela não era sobre treino

**A 17-E NÃO CRIOU TABELA DE MEDIDA CORPORAL.** Conferido no banco antes da primeira linha de
código: as 4 tabelas `body_*` da 16-E já existiam. A 17-E **consome** — `src/lib/body/queries.ts`,
`src/lib/actions/body-measurements.ts`, `src/lib/body/measurements.ts` e os componentes
`measurement-chart` / `progress-photos`, os mesmos que a Dieta usa. Um peso registrado em
`/treinos/evolucao` aparece em `/nutricao/medidas`, e vice-versa.

**Verificado no banco depois de pronta:** 4 tabelas `body_*`, e a única coluna de peso corporal
fora delas é `training_sessions.body_weight_kg` — o peso USADO naquele treino, congelado
(17-C), que não é histórico de medida. Critério de aceite cumprido.

`training_goals.body_measurement_type_id` é `on delete set null` de propósito: excluir um tipo
de medida é um fluxo da 16-E com escolha explícita do destino do histórico, e um `restrict`
aqui faria aquele fluxo estourar com um erro que a Dieta não sabe explicar. Com `set null` a
meta sobrevive e a leitura a marca como **"medida removida"** — indisponível, nunca zero.

### ⛔ A segunda regra: o dashboard CONSOME, não recalcula

Volume, séries, repetições, tempo, frequência e distribuição por grupo saem de `metrics.ts`
(17-D) através de `dashboards.ts`. Há um teste que compara os totais do dashboard com
`aggregateSessions` chamado diretamente e exige igualdade — se alguém refizer a conta aqui, ele
quebra. `topExercises` usa `exerciseMetrics`, a mesma função do histórico.

### Arquivos criados

**Migrations (2):** `20260805110000_training_goals.sql`,
`20260805110100_training_goal_progress.sql`.

**Lógica pura (3 arquivos + 3 de teste):** `src/lib/training/goals.ts` (+69),
`dashboards.ts` (+44), `reports.ts` (+19). `schedule.ts` ganhou `addMonthsIso` (+4 testes) e
`round-trip.test.ts` ganhou os schemas das metas (+15).

**Servidor:** `src/lib/training/goal-queries.ts`, `src/lib/validators/training-goals.ts`,
`src/lib/actions/training-goals.ts`.

**Interface:** `src/app/(app)/treinos/metas/{page,goals-client,loading}.tsx`,
`relatorios/{page,reports-client,loading}.tsx`,
`src/components/training/{goal-form-dialog,body-evolution,consistency-calendar}.tsx`.

**Alterados:** `src/lib/training/constants.ts` (metas e relatórios viraram "pronto"),
`treinos/page.tsx` (visão geral completa), `treinos/evolucao/{page,evolution-client}.tsx`
(aba Corpo), `treinos/calendario/{page,calendar-client}.tsx` (visão consistência),
`treinos/sessao/preparar/page.tsx` + `session/prepare-review-client.tsx` (peso pré-preenchido),
`src/app/api/export/route.ts` (as 28 tabelas `training_*`) e `src/types/supabase.ts`
(regenerado — **só adição**, nada da Dieta foi tocado: 169 inserções, 0 remoções).

### Decisões técnicas registradas

1. **Status derivado não é gravável.** O CHECK da migration não aceita `atingida`, `expirada`
   nem `em_atraso` — verificado no banco, as três inserções são bloqueadas. Decisão do usuário
   vence sempre: meta pausada não vira "atingida" porque o número passou pelo alvo.
2. **Alterar a meta não reescreve o passado.** Cada campo que muda o SIGNIFICADO vira linha em
   `training_goal_progress`. Renomear não polui o histórico; mudar o alvo, sim.
3. **Os marcos são configuração** (jsonb na própria meta), porque um marco não tem história
   própria. O que tem história vive na tabela de progresso. `parseMilestones` descarta lixo do
   jsonb sem quebrar — um marco sem número não é marco.
4. **O valor atual não vem do cliente.** É derivado de `metrics.ts` e das medidas. A única
   exceção é a meta `personalizada`, e a action **confere o tipo** antes de gravar: numa meta
   de volume, o valor digitado é recusado com explicação.
5. **Períodos:** `semanal`/`mensal` acompanham o calendário; `trimestral`/`semestral`/`anual`
   são blocos contados de `starts_on`. Sempre presos a `[starts_on, ends_on]`.
6. **Nenhuma divisão por zero.** Período sem treino é normal; toda razão devolve `null` e a
   tela diz "sem base". Um teste serializa o dashboard de um período vazio e proíbe `NaN` e
   `Infinity` no JSON.
7. **Aderência só olha o passado**, descanso planejado não entra no denominador de treino, e
   dia cancelado/reagendado sai dele. Nada planejado = `null`, não 0%.
8. **1RM só vira valor de meta dentro da faixa de validade**, e sempre marcado como estimativa.
9. **O CSV reusa `toCsv` (Fase 14)** — nenhuma segunda implementação de RFC 4180. Célula vazia
   ≠ zero, e período/regra/qualidade viajam no cabeçalho do arquivo.
10. **Nenhuma foto entra em exportação** — nem binário, nem URL assinada (que expira em
    minutos e não faz sentido dentro de um arquivo salvo).

### Segurança verificada no banco (role `authenticated`)

**17 verificações, todas OK.** RLS: o dono lê o que é dele; o intruso lê **0 linhas** nas duas
tabelas, não edita, não exclui e não consegue forjar meta em nome do dono. CHECKs: os três
status derivados são recusados, período personalizado sem prazo é recusado, prazo antes do
início é recusado, meta corporal com métrica de outra família é recusada, `milestones` que não
é array é recusado, `metric` fora do vocabulário é recusado e alteração sem dizer qual campo
mudou é recusada. **0 resíduo** (tudo em transação com rollback); catálogo intacto (106
exercícios da base).

### Verificação

`npm run lint`, `npx tsc --noEmit`, `npm run test:run` (**1781 testes**, de 1634) e
`npm run build` passam. Suíte verde também em `TZ=UTC`. Smoke: `/treinos`, `/treinos/metas`,
`/treinos/relatorios`, `/treinos/evolucao`, `/treinos/calendario?visao=consistencia`,
`/treinos/sessao/preparar` e `/api/export` → **307 `/login`**; `/login` → 200;
`/api/cron/notifications` sem segredo → **401**. `get_advisors`: **0 lints de schema e 0 de
performance**. **111 tabelas** no projeto (28 `training_*`, 4 `body_*`).

> ⚠️ **A verificação rodou numa árvore isolada** (`git worktree`), porque a frente da Dieta
> estava com a 16-F em andamento no mesmo diretório — inclusive trocando a branch do
> working tree no meio do trabalho. Os dois commits da 17-E estão em
> `feat/treinos-fase-17e`; nenhum arquivo da Dieta foi tocado.

### ⚠️ Ponto de merge a conferir na integração

A 16-F **extraiu** `EXPORT_TABLES` de `src/app/api/export/route.ts` para
`src/lib/settings/export-tables.ts`, e o arquivo novo dela **já contém** as 31 entradas
`training_*` que a 17-E acrescentou (ela refatorou a partir da árvore que já tinha a mudança).
Na hora de integrar as duas branches, o conflito em `route.ts` deve ser resolvido **ficando com
a versão extraída da 16-F** — o conteúdo da 17-E está preservado lá dentro. Confira se as 28
tabelas `training_*` + as 2 da 17-E continuam na lista.

### Pendências registradas (escopo consciente, não bugs)

| Item | Onde resolve |
| --- | --- |
| Notificação de meta atingida e de medição pendente | **17-F** (a detecção do status derivado já existe) |
| Card de treino no dashboard geral do sistema, busca global e lançamento rápido | **17-F** |
| Reordenar metas arrastando (`reorderTrainingGoals` existe e nenhuma tela a chama) | **17-F** |
| XLSX nos relatórios (o pacote `xlsx` já está no projeto; a 17-E entregou CSV, o padrão) | **17-F** |
| Integração com balança ou wearable | **Não planejado.** `body_measurements.source` já prevê o campo |
| Recomendação de meta pelo sistema | **Nunca.** Meta é decisão do usuário |

---

## Subfase 17-D — Treinos · Histórico, volume, recordes e progressão (2026-08-04) ✅

Quarta das 6 subfases da **Fase 17**. A 17-C fez o sistema **acumular** sessões; a 17-D
transforma esse acúmulo em **leitura útil**. **3 tabelas novas, +158 testes puros** (suíte:
1321 → 1479).

### ⛔ A regra que a subfase existe para garantir

**NÃO SOMAR O QUE NÃO SE SOMA.** Um minuto de prancha, 12 repetições de flexão e 100 kg × 8 no
supino não têm denominador comum. Um app que joga tudo num "volume" único produz um gráfico
bonito e sem significado.

`src/lib/training/metrics.ts` é para os Treinos o que `calc.ts` é para a Dieta: **todo** número
agregado sai dali, e cada `tracking_type` acumula na SUA unidade, declarada em `tracking.ts`
(kg · repetições · segundos · distância · calorias). Histórico, gráfico, recorde, visão geral e —
na 17-E — dashboards e relatórios usam a mesma função.

### Arquivos criados

**Migrations (3):** `20260805100000_training_personal_records.sql`,
`…100100_training_progression_rules.sql`, `…100200_training_progression_suggestions.sql`.

**Lógica pura (5 arquivos + 5 de teste):** `src/lib/training/metrics.ts` (+44),
`one-rm.ts` (+24), `records.ts` (+30), `progression.ts` (+26), `history.ts` (+27).

**Servidor:** `src/lib/training/history-queries.ts` (leitura ampla do histórico, recordes,
regras e sugestões), `src/lib/training/records-sync.ts` (I/O da consolidação),
`src/lib/validators/training-history.ts`, `src/lib/actions/training-history.ts`.

**Interface:** `src/app/(app)/treinos/historico/{page,history-client,loading}.tsx`,
`historico/[id]/{page,session-detail-client}.tsx`,
`exercicios/[id]/{page,exercise-history-client}.tsx`,
`recordes/records-client.tsx`, `evolucao/evolution-client.tsx` e
`src/components/training/{metrics-summary,training-charts,progression-rule-dialog}.tsx`.

**Alterados:** `src/lib/training/constants.ts` (histórico, recordes e evolução viraram
"pronto"), `src/lib/actions/training-sessions.ts` (`finishSession` consolida recordes e avalia
progressão), `src/components/training/exercise-detail-sheet.tsx` (link para o histórico do
exercício), `src/app/(app)/treinos/page.tsx` (últimos 30 dias, reais),
`treinos/configuracoes/preferences-client.tsx` (as preferências de volume passaram a valer),
`src/lib/validators/round-trip.test.ts` (+6) e `src/types/supabase.ts` (regenerado — **só
adição**, nada da Dieta foi tocado).

### Decisões técnicas registradas

1. **Ausência de dado não é zero.** Sem peso corporal na sessão, a série de peso corporal fica de
   fora do volume e o total do período é marcado **parcial**, com o motivo por extenso. Mesma
   disciplina do `value_state` da Dieta.
2. **A regra de contagem viaja com o número.** Toda tela que mostra volume mostra também
   aquecimento dentro/fora e a regra do unilateral (`volumeRuleLabel`).
3. **Unilateral em três regras**, e a diferença é o que o número REGISTRADO significa:
   `por_lado` (2 séries, valores dobrados), `soma_dos_lados` (1 série, dobrados) e
   `serie_completa` (1 série, o valor já é a série inteira). Com os lados gravados separadamente,
   o trabalho executado soma nas três — muda só a contagem de séries.
4. **Drop set soma os blocos e conta como UMA série.**
5. **1RM é estimativa**, com fórmula visível e escolhível. 1 repetição devolve o próprio peso (é
   medida); acima de 12 repetições vem **com aviso** e **não vira recorde**. Nada sugere carga
   máxima.
6. **Empate não gera recorde novo**; a marca anterior fica em `previous_value`.
7. **Excluir sessão recalcula pelo MESMO caminho da finalização** (`rebuildRecords`): o segundo
   melhor assume com a data dele. Valor que cai limpa `previous_value` — afirmar uma marca que o
   histórico não sustenta seria inventar.
8. **Progressão nunca é aplicada sozinha e dor bloqueia sempre** (bloqueio não configurável).
   Aceitar é a única escrita da 17-D no treino-modelo.
9. **Gráfico nunca é a única leitura do dado**: todo gráfico tem tabela equivalente dobrável.
10. **Nenhuma métrica materializada** — volume, tonelagem e 1RM continuam derivados na leitura.

### Armadilha do banco (a mesma da Dieta, em outro domínio)
O índice de deduplicação das sugestões é **PARCIAL** (`where status in ('pendente','ignorada')`).
`ON CONFLICT` não infere índice parcial e falharia **só em runtime** (42P10) — por isso a
gravação é *select-then-insert*. Verificado no banco: a mesma proposta é recusada enquanto
pendente e **pode voltar** depois de aceita (a carga subiu e desceu de novo é caso legítimo).

### Segurança verificada no banco (role `authenticated`)
**10 tentativas indevidas bloqueadas**: forjar recorde com `user_id` alheio, recorde geral com
`exercise_id`, `previous_value` maior que `value`, `record_key` duplicada, regra com 1 sessão,
incremento fixo sem valor, regra de exercício sem alvo, segunda regra global, sugestão decidida
sem `decided_at` e `dedupe_key` repetida com sugestão pendente. Intruso lê/edita/exclui **0
linhas** nas três tabelas; o dono lê e escreve o que é dele. **0 resíduo** de teste; catálogo
intacto (106 exercícios).

### Verificação
`npm run lint`, `npx tsc --noEmit`, `npm run test:run` (**1479 testes**, de 1321) e
`npm run build` passam. Suíte verde também em `TZ=UTC`. Smoke: `/treinos/historico`,
`/treinos/recordes`, `/treinos/evolucao` e `/treinos/exercicios/[id]` → **307 `/login`**;
`/login` → 200; `/api/cron/*` → **401**. `get_advisors`: 0 lints de schema. **109 tabelas** no
projeto (26 `training_*`).

### Pendências registradas (escopo consciente, não bugs)
| Item | Onde resolve |
| --- | --- |
| Metas, medidas corporais `body_*`, dashboards e relatórios por período | 17-E |
| Exportação dos relatórios | 17-E |
| **Notificação de novo recorde** (a detecção já acontece; `syncPersonalRecords` devolve `highlights`) | 17-F |
| Busca global, lançamento rápido e card no dashboard geral | 17-F |
| Comparar com outros usuários ou normas populacionais | **Nunca** — o sistema é single-user e não faz comparação normativa |

---

## Subfase 17-C — Treinos · Preparação, sessão ao vivo, cronômetro e recuperação (2026-08-04) ✅

Terceira das 6 subfases da **Fase 17**, e a mais importante do módulo: a tela que o usuário abre
suado, com uma mão, no celular, com Wi-Fi ruim, no meio da academia. **9 tabelas novas, +165
testes puros.**

### ⛔ A regra que a subfase existe para garantir

**AO INICIAR, O TREINO É CONGELADO — E NENHUMA LEITURA DE SESSÃO VOLTA AO MODELO.**

`startSession` copia o treino-modelo para `training_sessions.workout_snapshot` (jsonb) **e** para
as linhas de `training_session_exercises` / `training_session_sets`. Daí em diante,
`src/lib/training/session-queries.ts` **não tem uma única referência a `training_workouts`**.
`workout_id`, `exercise_id` e `scheduled_workout_id` são `on delete set null`: referência
informativa, jamais fonte de leitura.

**Provado no banco, não só no código.** O teste executado: criar modelo → congelar sessão →
renomear o modelo, trocar a carga planejada para 999, subir para 10 séries → e por fim **excluir
o treino inteiro**. Resultado: a sessão continua com o nome original, 60 kg planejados, 1 série e
o nome do exercício congelado; `workout_id` vira `NULL` e a série executada (62,5 kg × 10)
permanece. Mesmo princípio do `nutrients_snapshot` da 16-B, em outro domínio.

### Arquivos criados

**Migrations (9):** `20260804120000_training_locations.sql`,
`…120100_training_location_plates.sql`, `…120200_training_sessions.sql`,
`…120300_training_session_exercises.sql`, `…120400_training_session_sets.sql`,
`…120500_training_session_rests.sql`, `…120600_training_session_pauses.sql`,
`…120700_training_session_events.sql`, `…120800_training_session_substitutions.sql`.

**Lógica pura (6 arquivos + 6 de teste):** `src/lib/training/session-machine.ts`,
`session-flow.ts`, `timers.ts`, `previous.ts`, `plates.ts`, `session-snapshot.ts`.

**Servidor:** `src/lib/training/session-queries.ts`,
`src/lib/validators/training-session.ts`, `src/lib/actions/training-sessions.ts`,
`src/lib/actions/training-locations.ts`.

**Interface:** `src/app/(app)/treinos/sessao/{page,loading}.tsx`,
`sessao/preparar/{page,loading}.tsx`, `sessao/revisar/{page,loading}.tsx` e
`src/components/training/session/` (use-now, use-session-queue, sync-status, rest-panel,
set-editor, plate-calculator, exercise-list-sheet, substitute-sheet, add-exercise-sheet,
prepare-choose-client, prepare-review-client, session-live-client, session-review-client,
locations-client).

**Alterados:** `src/lib/training/constants.ts` (enums da sessão + `sessao` virou `pronto` na
navegação), `types.ts`, `src/types/supabase.ts` (regenerado — **só adição**, nada da Dieta foi
tocado), `src/app/(app)/treinos/hoje/page.tsx` (ganhou **Iniciar treino**),
`treinos/configuracoes/page.tsx` (locais e anilhas).

### Decisões técnicas registradas

1. **`session-snapshot.ts` CHAMA `expandPlannedSets`** (17-B) em vez de reimplementar a expansão
   de séries — como `buildRecipeEntrySnapshot` chama `buildDiaryEntrySnapshot` na Dieta. É o que
   mantém construtor, pré-visualização e sessão concordando sobre quantas séries o treino tem.
2. **A regra literal do fluxo:** concluir a 3ª de 4 séries leva para a **4ª SÉRIE**, não para
   outro exercício. `nextStep` (`session-flow.ts`) tem teste isolado com esse nome.
3. **Superset alterna antes de repetir a rodada** (A1 → B1 → A2 → B2) por uma regra só: dentro do
   bloco, vai quem tem a menor série pendente; empate resolve pela ordem **depois do atual**.
   Circuito de três sai da mesma regra, sem caso especial.
4. **`parcial`/`concluido` do exercício não são graváveis** — nascem de `deriveExerciseStatus` na
   leitura. Só decisão do usuário entra na coluna (`pendente`, `ativo`, `pulado`, `substituido`).
5. **Tempo ativo usa UNIÃO de pausas e descansos.** Somar os dois separadamente descontaria duas
   vezes um descanso que caiu dentro de uma pausa — e o total poderia ficar negativo.
6. **Reduzir o descanso abaixo do já decorrido ENCERRA** o descanso, em vez de criar um alvo no
   passado.
7. **`training_session_events` é append-only**: sem `updated_at`, sem trigger de atualização.
8. **Idempotência confere ANTES de aplicar.** As actions perguntam se aquele
   `client_mutation_id` já foi usado na sessão; se sim, devolvem sucesso sem tocar em nada. É o
   que impede um retry atrasado da fila de desfazer uma correção posterior (last-write-wins seria
   pior que duplicar).
9. **A preparação não aceita snapshot pronto do cliente.** O cliente manda ajustes numéricos e de
   ordem; nome, `tracking_type` e lateralidade são resolvidos no servidor contra o catálogo.
10. **`?treino=` e `?planejado=` destacam a escolha em vez de iniciar sozinho.** Criar sessão por
    efeito deixaria rascunhos órfãos a cada "voltar".
11. **Peso corporal na sessão, não em tabela nova.** É o valor USADO naquele treino, congelado.
    A 17-E cria `body_*` e a preparação passa a pré-preencher dali — **continua não existindo
    duas tabelas de peso corporal**.

### O que NÃO foi prometido
**O app não funciona offline** — não há service worker e recarregar sem rede não abre a tela. O
que existe e é testado: mutação aplicada localmente → persistida no dispositivo → enfileirada →
reenviada **em ordem** quando a conexão volta, sem duplicar. O estado da sincronização fica
visível o tempo todo. A recuperação de sessão interrompida não depende do dispositivo: a sessão
em execução vive no servidor.

### Segurança verificada no banco (role `authenticated`)
8 verificações de isolamento (ler/editar/excluir sessão, exercício e série de terceiro → 0
linhas; inserir com `user_id` alheio → bloqueado) e 9 de invariante (duas sessões em execução,
dois descansos ativos, duas pausas abertas, duas séries com o mesmo número,
`client_mutation_id` repetido, concluir sem `ended_at`, encerrar descanso sem tempo real, dois
locais padrão, anilha repetida) — **todas bloqueadas**. 0 resíduo de teste no banco.

### Verificação
`npm run lint`, `npx tsc --noEmit`, `npm run test:run` (**1297 testes**, de 1132) e
`npm run build` passam. Suíte verde também em `TZ=UTC`. Smoke test: rotas da sessão → 307
`/login`; `/api/cron/*` → 401. `get_advisors`: 0 lints de schema. **102 tabelas** no projeto.

### Pendências registradas (escopo consciente, não bugs)
| Item | Onde resolve |
| --- | --- |
| Histórico navegável, detalhe de sessão passada, gráficos | 17-D |
| Volume agregado, 1RM, recordes consolidados (a sessão só **marca** o candidato em `is_personal_record`) | 17-D |
| Sugestão de progressão de carga | 17-D |
| Metas, medidas corporais `body_*`, dashboards | 17-E |
| Notificação, agenda, TO-DO, hábitos, PWA/service worker | 17-F |
| Reordenar exercício **arrastando** na sessão (as setas ↑ ↓, "fazer agora" e "para o fim" já funcionam) | 17-F |

---

## Subfase 16-E — Dieta · Medidas corporais, fotos de evolução e relatórios (2026-08-04) ✅

Quinta das 6 subfases da **Fase 16**. É a subfase que carrega a decisão arquitetural que as
duas frentes esperavam. **4 tabelas novas (+1 migration de constraint), +151 testes puros.**

### ⛔ A 16-E CRIOU `body_*`. A 17-E CONSOME.

Conferido no banco em 2026-08-04 (MCP `list_tables`): a estrutura **não existia**. A 16-E
chegou primeiro e criou o **módulo central de medidas corporais**, com prefixo `body_*` e
código em `src/lib/body/` — **não** `nutrition_measurement_*`:

`body_measurement_types` (16 tipos semeados na 1ª leitura), `body_measurements`,
`body_measurement_goals`, `body_progress_photos`.

**A 17-E não deve criar tabela nenhuma.** Deve chamar `src/lib/body/queries.ts` e
`src/lib/actions/body-measurements.ts`. Já pronto para ela: **`getLatestWeight(upTo?)`**, para
a preparação da sessão pré-preencher o peso corporal (hoje digitado na hora) — devolvendo
`null` quando não há registro, porque **sem peso a carga efetiva é indisponível, nunca zero**.

### ⛔ As fotos: cinco travas, e a que só o teste revelou

Reuso da tabela `attachments` + bucket **privado** `attachments` (Fase 14) — nenhum segundo
mecanismo de upload.

1. O **binário passa pelo servidor** (Server Action com `FormData`), para tipo e tamanho serem
   validados **de verdade** no servidor, sobre o `File` real.
2. **Nome aleatório** (`crypto.randomUUID`); o nome do cliente é descartado.
3. Pasta **sempre** `{auth.getUser().id}/…`.
4. Falha ao gravar o metadado **remove o arquivo** — nada de órfão anônimo no bucket.
5. **FK COMPOSTA `(attachment_id, user_id) → attachments(id, user_id)`.**

A quinta apareceu no teste pela role `authenticated`: a RLS sozinha aceitava
`body_progress_photos(user_id = B, attachment_id = <anexo de A>)`, porque a policy confere o
`user_id` da **própria linha** e nada sabe sobre o anexo apontado. Não vazava — a leitura junta
`attachments`, cuja RLS bloqueia B — mas **depender de um JOIN para não vazar foto de corpo é
fino demais**. Agora é 23503 no banco.

Leitura só por **URL assinada de 5 min**, gerada a cada acesso. `storage_path` **não sai do
servidor**: `SignedProgressPhoto` nem tem o campo.

> ⚠️ **A FK composta obrigou a abandonar o embed do PostgREST.** `getProgressPhotos` faz duas
> consultas e junta em memória: embed sobre FK composta dependeria de inferência do PostgREST e
> quebraria **só em runtime** — a família do 42P10 que a 16-B documentou.

### A regra que atravessa a subfase: **buraco não é zero**

`value_state` (16-A) aplicado ao **tempo**. Série devolve `null` no dia sem medição, o gráfico
usa `connectNulls={false}` (a linha interrompe), o calendário mostra "—" e a média móvel só
aparece com a janela cheia. O eixo não começa em zero.

Um caso que os testes pegaram: dia **com meta e sem registro** entrava na aderência média como
**0%** — "esqueci de anotar" virava "falhei na meta". Corrigido **no código**, com teste.

### Relatórios: snapshot e meta da época

`buildDailyReports` entra por `dayTotals` (16-B), que soma `nutrients_snapshot` — nenhum
parâmetro de `reports.ts` aceita alimento do catálogo para somar consumo. E cada dia resolve a
**própria** meta com `goalPeriodForDate`: 1.800 kcal dá 100% em janeiro (meta 1.800) e 72% em
março (meta 2.500), no mesmo relatório.

### Pendências fechadas
Micronutrientes por período (com a coluna "dias incompletos"), "substituições mais realizadas",
gasto com mercado (**reusando `summarizeShoppingList`**, nunca recontando), exportação em CSV e
a **visão de mês do diário** (`?visao=mes` caía na semana).

### Verificação
`lint` + `tsc` + `test:run` (**1.472 testes**, de 1.321) + `build` verdes, e a suíte passa em
`TZ=UTC`. RLS testada pela role **`authenticated`**: B lê 0 linhas nas 4 tabelas, em
`attachments` e em `storage.objects`; todas as escritas em nome alheio são bloqueadas. Dados de
teste removidos. `get_advisors`: 0 lints de schema.

### Pendências conscientes
Gerenciar tipos de medida pela interface (as actions existem), notificação de medição pendente,
cards de evolução no dashboard e XLSX → **16-F**. Integração com balança → **não planejado**
(`source` já prevê o campo).

---

## Subfase 16-D — Dieta e Alimentação · Lista de compras e despensa (2026-08-04) ✅

Quarta das 6 subfases da **Fase 16**. A 16-B/16-C fizeram o sistema saber o que a pessoa **vai
comer**; a 16-D transforma isso no que ela **precisa comprar**. É a tela mais **mobile-first**
do módulo — usada em pé, no mercado, com uma mão. **4 tabelas novas, +59 testes puros.**

### ⛔ A regra que a subfase existe para garantir
**A CONSOLIDAÇÃO NÃO SOMA UNIDADES INCOMPATÍVEIS.** 200 g de arroz + 1 xícara de arroz só viram
**uma linha** quando existe conversão real cadastrada (a medida caseira daquele alimento, com o
peso). Sem ela: **duas linhas**, com o motivo escrito na tela. Massa converte com massa, volume
com volume; **g ↔ ml exigiria densidade**, e densidade presumida é dado inventado. "2 unidades"
nunca soma com "300 g".

É a mesma disciplina de `calc.ts` ("não analisado" não vira zero) aplicada a compras. Quem
decide é `src/lib/nutrition/shopping.ts` (puro): cada parcela cai num **balde** (`base:g`,
`base:ml`, `un`, `medida:<rótulo>`, `sem_quantidade`) e só soma dentro do balde. Item que gerou
mais de um balde recebe `separate_reason` em **todas** as linhas.

### Tabelas
`nutrition_market_categories` (corredores do mercado, semeados na primeira leitura — não é
taxonomia nutricional), `nutrition_shopping_lists`, `nutrition_shopping_list_items`,
`nutrition_pantry_items`. Todas com RLS + FORCE RLS, índice em `user_id` e trigger
`updated_at`. **32 tabelas `nutrition_*`** no total.

### Decisões de contrato
1. **A origem viaja congelada** (`origins` jsonb): de qual refeição, de qual data e de qual
   receita veio cada parcela. O planejamento pode mudar depois; a lista impressa continua
   explicando os números.
2. **O ajuste manual sobrevive à regeração.** `quantity_overridden` + `planRegeneration` →
   origem e corredor são atualizados, a quantidade **não**.
3. **Nada some sozinho.** O que o planejamento não pede mais vira lista de **obsoletos** na
   prévia; só é apagado com escolha explícita.
4. **Cobertura total da despensa não zera a quantidade** — o item vira `removido` ("não vou
   comprar") e volta com um toque. Zerar afirmaria "preciso de 0 g de arroz".
5. **`quantity` nula na despensa ≠ zero.** Nula é "tenho mas não sei quanto" (não desconta);
   zero é "acabou", fato medido.
6. **Despensa travada em 6 campos** — não é ERP de estoque; marcar comprado não dá baixa.
7. **Ausência de preço não é zero**: o resumo conta quantos itens estão sem preço.
8. **Sem link público** (dado pessoal). Exportar `.txt` agrupado por corredor e imprimir.

### Lista recorrente não duplica
`shoppingRecurrenceKey` é determinística por período (`semanal:<início da semana>`,
`mensal:<AAAA-MM>`, `quinzenal:<âncora fixa no calendário>`), com aritmética em `Date.UTC`.

> ⚠️ Os índices únicos de `recurrence_key` e `consolidation_key` são **PARCIAIS**: `ON CONFLICT`
> falha só em runtime (42P10). Todo caminho usa *select-then-insert/update*. Confirmado no banco.

### Verificação
`lint` + `tsc` + `test:run` (**1.132 testes**) + `build` verdes, e a suíte passa com `TZ=UTC`.
RLS testada pela role **`authenticated`**: outro usuário lê 0 linhas nas quatro tabelas, o dono
lê as dele, e o `WITH CHECK` recusa gravar em nome de terceiro. Dados de teste removidos.

### Pendências conscientes
Gasto com mercado × financeiro → **16-E**. Notificação de validade da despensa, gerenciar
corredores pela interface (as actions existem) e escolher a quantidade de cada receita ao gerar
→ **16-F**.

---

## Subfase 16-C — Dieta e Alimentação · Receitas, refeições-modelo e substituições (2026-08-04) ✅

Terceira das 6 subfases da **Fase 16**. A 16-B fez o sistema saber o que foi comido item a
item; a 16-C entrega o que torna o uso diário rápido — **receita**, **refeição-modelo** e
**substituição** — sem abrir um segundo caminho de gravação. **+79 testes puros.**

### A regra que a subfase existe para garantir
**O peso de uma comida pronta não se deduz somando os ingredientes crus.** Um refogado perde
água, um bolo perde água e ganha volume, um feijão ganha água — a variação depende do fogo, do
tempo e da panela. Por isso `total_weight_g` é **informado**, e sem ele o **"por 100 g" fica
indisponível com explicação**, em vez de cair para a soma dos crus: daria um número plausível
e errado, e ninguém perceberia.

### ⛔ O ponto mais importante: um caminho só de gravação
`buildRecipeEntrySnapshot` **chama** `buildDiaryEntrySnapshot` (16-B). Nenhuma tabela
paralela, nenhuma segunda fórmula. Por construção: o total do dia soma o `nutrients_snapshot`,
editar/excluir a receita **não muda o passado**, e a qualidade do cálculo viaja com o número.
`entry_kind` ganhou `'receita'` e `'modelo'` (o CHECK da 16-B já previa); os itens planejados
ganharam `item_kind` + `recipe_id` + `portion_unit`.

**Provado no banco real** (role `authenticated`): editada a receita (nome, rendimento e peso) e
depois **excluída**, o consumo continuou com o nome de origem, 276,75 kcal e a qualidade
"parcial" congelada — `recipe_id` nulo, `entry_kind` intacto.

### Decisões de contrato
1. **Sem peso final, só porções** — e `grams_equivalent`/`base_quantity`/`base_unit` ficam
   **NULOS**. "Não sei quanto pesa" ≠ "pesa zero".
2. **A qualidade agregada passou a viajar com o número.** `SnapshotNutrient` e
   `ComputedNutrient` ganharam `quality` **opcional**, e `sumNutrient` o respeita. Sem isso,
   uma receita parcial entraria no dia como exata. Mudança aditiva: nada da 16-B mudou.
3. **Modelo aponta para a receita**, não copia ingredientes: melhorar a receita melhora o
   modelo.
4. **Adicionar o mesmo modelo duas vezes não duplica.** A idempotência é de leitura
   (`templateItemsToRegister`), e não um índice único — um modelo vira VÁRIAS linhas no diário,
   e o índice impediria o caso normal. Repetir de propósito exige interruptor explícito.
5. **Substituir é sempre confirmado**, e a diferença é **recalculada no servidor** antes de
   gravar: o que a tela mostrou é conferido, nunca copiado.
6. **Nenhuma equivalência é afirmada.** A ordem das alternativas é a prioridade do usuário; a
   tolerância é preferência dele; "fora da tolerância" é aviso, não impedimento.
7. **Diferença desconhecida não é zero** — vira "não dá para comparar", e o impacto no dia fica
   parcial.
8. **Duplicar não herda passado**: uso, favorito, arquivamento, consumo e logs ficam com o
   original.

### Schema — 8 tabelas + 2 alterações (0 lints de schema)
`20260804100000_nutrition_recipe_categories` · `…100100_nutrition_recipes` ·
`…100200_nutrition_recipe_ingredients` · `…100300_nutrition_meal_templates` ·
`…100400_nutrition_meal_template_items` · `…100500_nutrition_substitution_groups` ·
`…100600_nutrition_substitution_options` · `…100700_nutrition_substitution_logs` ·
`…100800_nutrition_diary_entries_recipe_template` ·
`…100900_nutrition_planned_meal_items_recipe`.
**A foto da receita reusa `attachments` + o bucket privado `attachments`** — sem bucket novo.

### Arquivos criados
**Lógica pura + testes:** `src/lib/nutrition/recipe.ts` (+36), `substitution.ts` (+26),
`meal-template.ts` (+17), `entry-columns.ts`.
**Leitura/validação/mutação:** `src/lib/nutrition/recipe-queries.ts` ·
`src/lib/validators/nutrition-recipes.ts` · `src/lib/actions/nutrition-recipes.ts`,
`nutrition-meal-templates.ts`, `nutrition-substitutions.ts`.
**UI:** `src/components/nutrition/{recipe-picker-dialog,recipe-form-dialog,recipe-detail-sheet,substitution-compare-dialog}.tsx` ·
`src/app/(app)/nutricao/receitas/{page,recipes-client,loading}.tsx` ·
`refeicoes/{page,meal-templates-client,loading}.tsx` ·
`substituicoes/{page,substitutions-client,loading}.tsx`.

### Arquivos alterados
`src/lib/nutrition/{calc,constants,types,snapshot,diary-queries}.ts` (extensões aditivas) ·
`src/lib/actions/nutrition-diary.ts` (usa o `snapshotColumns` compartilhado) ·
`src/app/(app)/nutricao/{page,diario/*,planejamento/*}.tsx` · **`src/app/api/export/route.ts`**
· `src/types/supabase.ts` (regenerado) · docs.

### Pendências da 16-B fechadas aqui
- **Montar os dias de um modelo de semana pela interface.**
- **Escopo na EDIÇÃO de refeição planejada** (`updatePlannedMealInScope` já existia e era
  testada; só a UI faltava).

### Verificação
`npm run test:run` **1.073** · `npm run lint` limpo · `npx tsc --noEmit` limpo ·
`npm run build` verde com as 12 rotas de `/nutricao`. Suíte passa em `TZ=UTC` e
`TZ=Asia/Tokyo`. Smoke: rotas privadas → **307 `/login`**, `/login` → 200,
`/api/cron/notifications` → **401**. No banco, pela role `authenticated`: intruso não lê, não
edita e não apaga nas 8 tabelas; forja bloqueada; 8 CHECKs conferidos; imutabilidade e
sobrevivência do histórico provadas. Dados de teste removidos; catálogo reconferido (597
alimentos, 21.147 valores).

### Pendências conscientes (registradas, não silenciadas)
| Item | Onde entra |
| --- | --- |
| Lista de compras a partir das receitas | **16-D** — a consolidação **não pode somar unidades incompatíveis** |
| Relatório de "substituições mais realizadas" | **16-E** |
| Busca global e lançamento rápido de receita | **16-F** |
| **Upload** da foto da receita pela interface (tabela e bucket já são lidos) | **16-F**, junto do upload de anexos |
| Reordenar ingredientes arrastando (a action existe e não tem gatilho) | **16-F** |
| Sugestão automática por IA ou heurística nova | **Nunca** |

### Próxima subfase
**16-D — Lista de compras** · `docs/phases/PHASE_16_D_NUTRITION_SHOPPING_LIST.md`

---

## Subfase 17-B — Treinos · Programas, treinos-modelo e planejamento semanal (2026-08-03) ✅

Segunda das 6 subfases da **Fase 17**. A 17-A entregou o vocabulário e o catálogo; a 17-B
entrega a camada que transforma exercícios soltos em **rotina**. **Testes de Treinos: 66 → 171**
(+105); suíte total: **1073**.

### A regra que a subfase existe para garantir
**Modelo é intenção e muda quando o usuário quiser; execução é fato consumado e nunca muda.**

A 17-B constrói só o lado **mutável** — mas constrói **sabendo** que a 17-C vai congelar um
snapshot dele. Por isso **nenhuma tabela desta subfase tem coluna apontando para sessão**, e
nenhuma leitura de histórico pode passar por elas. O versionamento (`version` +
`superseded_by` + `version_group_id`) **não** é o que protege o histórico: ele existe para o
usuário **comparar intenções** ("meu ABC de janeiro × o de maio"), e só é criado por escolha
explícita ("salvar como nova versão") — versionar a cada edição encheria o banco.

### `expandPlannedSets` — o que a 17-C recebe pronto
Dois jeitos de configurar séries (uniforme por `default_sets` × série a série em
`training_workout_sets`) resolvidos num **formato único**, `PlannedSet[]`. Existindo ao menos
uma linha configurada, ela é a verdade; `null` numa série herda do exercício; a numeração é
reescrita 1..N; e os campos que o `tracking_type` não usa viram `null` **pela matriz de
`tracking.ts`** — nenhuma segunda matriz de medição foi criada.

### O que foi entregue
- **7 tabelas** `training_*` (RLS + FORCE RLS + índices + trigger `updated_at`). Total do
  projeto: **81 tabelas**. Security advisor: **0 lints de schema**.
- **`src/lib/training/workout.ts`** (+47 testes) — `expandPlannedSets`, contagem de séries,
  séries por grupo muscular com **principal e secundário separados**, duração estimada
  (execução + descanso, sem o descanso da última série, marcada como **parcial** quando falta
  alvo), validação de superset (contíguo × furado × sozinho) e reordenação que nunca perde item.
- **`src/lib/training/schedule.ts`** (+58 testes) — data pura em `Date.UTC` (virada de mês, de
  ano, bissexto), semana com primeiro dia configurável, **status derivado**, rodízio A/B/C que
  avança **por dia de treino**, ciclo de N semanas com âncora, duplicação de semana,
  reagendamento preservando a **primeira** data original e aderência que **só conta o passado**.
- **Quatro telas reais**: `/treinos/programas`, `/treinos/treinos` + construtor em
  `/treinos/treinos/[id]`, `/treinos/calendario` (semana, mês, lista, arrastar para reagendar)
  e `/treinos/hoje`. A visão geral passou a mostrar a semana planejada.
- **Nenhuma exclusão silenciosa**: excluir programa pergunta o destino dos treinos; excluir
  treino pergunta o destino do planejamento futuro. Os schemas dessas ações **não têm valor
  padrão** para a escolha.

### Decisões de schema registradas
| Decisão | Motivo |
| --- | --- |
| Junção `training_program_workouts`, e não FK direta | Treino pode ser avulso ou compor vários programas |
| Três colunas de carga planejada (peso / adicional / assistência) | Num campo só, alguma tela erraria o sinal e mostraria progresso na regressão |
| `exercise_id` `on delete restrict` | Excluir exercício em uso não pode removê-lo do treino em silêncio |
| `workout_id` do planejamento `on delete set null` | Excluir treino não apaga dia planejado; a linha vira "treino removido" |
| `is_active` **sem** índice único | Mais de um programa em uso gera **aviso**, não erro de banco |
| Índice único parcial por dia | No máximo **um** marcador de descanso por data |

### O que ficou de fora (escopo consciente, registrado na 17-C)
Iniciar/executar sessão, cronômetro, registro de série, snapshot histórico e sugestão de carga
— tudo **17-C**. `/treinos/hoje` diz isso na tela em vez de mostrar um botão que não faz nada.
Marcar um dia como **concluído** também é da 17-C: fazê-lo à mão aqui criaria histórico sem
execução.

### Verificação
`npm run test:run` **1073** · `npm run lint` 0 erros · `npx tsc --noEmit` 0 erros nos arquivos
da 17-B · `npm run build` OK (verificado numa árvore isolada, porque a frente da Dieta estava
com trabalho em andamento no mesmo diretório) · smoke test: rotas privadas → 307 `/login`,
`/api/cron/*` → 401 sem segredo · **13 verificações de RLS e de invariantes executadas no banco
pela role `authenticated`**, com limpeza total depois (106 exercícios, 1 usuário, 0 resíduos).

---

## Subfase 17-A — Treinos · Fundação, vocabulário e catálogo de exercícios (2026-08-03) ✅

Primeira das 6 subfases da **Fase 17**, aberta a pedido do usuário. Módulo novo em
`/treinos`, com navegação interna própria para 13 submódulos. **Testes: 823 → 889** (+66).

### A regra que a subfase existe para garantir
**Um exercício não é um nome, é um contrato de medição.** `tracking_type` é `not null` e diz o
que o movimento mede: peso × repetições, só repetições, segundos, distância ou calorias do
painel do aparelho. Sem esse campo, a Subfase 17-D somaria 100 kg × 8 do supino com 60
segundos de prancha e 3 km de esteira num "volume" único — número bonito e sem significado.

`src/lib/training/tracking.ts` é a **única** fonte dessa matriz. Duas consequências testadas:
- **Assistência subtrai carga** (barra fixa assistida). Somar inverteria o sinal e mostraria
  progresso justamente na regressão.
- **Sem peso corporal do dia, a carga efetiva é INDISPONÍVEL, nunca zero.** Mesma disciplina
  do `value_state` da Dieta.

### O que foi entregue
- **7 tabelas** `training_*` (RLS + FORCE RLS + índices + trigger `updated_at`). Total do
  projeto: **74 tabelas**. Security advisor: 0 lints de schema.
- **Base de 106 exercícios + 132 vínculos de músculo secundário**, 22 grupos musculares e 20
  equipamentos. **Conteúdo autoral**: nenhuma imagem, vídeo, texto de instrução ou base de
  dados de terceiro. Pipeline reexecutável (`data/training/exercise-base/` +
  `scripts/training/`), procedência em `ATTRIBUTION.md`.
- **Catálogo completo** em `/treinos/exercicios`: 11 filtros combináveis, busca sem acento,
  ordenação, detalhe em 3 abas, duplicar, favoritar, arquivar, personalizar, ações em massa
  que **relatam o que foi ignorado**, exercício da base somente leitura.
- **Preferências do módulo** em `/treinos/configuracoes`, com aviso explícito de quais opções
  só passam a valer nas subfases 17-C e 17-D.
- **Visão geral honesta**: mostra o estado real do catálogo e **não inventa** "0 treinos esta
  semana" — não existe sessão registrada antes da 17-C.

### Decisões registradas
1. **Rota `/treinos`** (padrão pt-BR do projeto), tabelas `training_*`.
2. **Base global (`user_id is null`) somente leitura**, policies separadas por comando; três
   constraints amarram `user_id is null` ⇔ `is_system_exercise` ⇔ `source = 'sistema'`.
   Preferência do usuário vai para `training_exercise_prefs`. Mesmo desenho de `nutrition_foods`.
3. **Modelo é mutável; execução é imutável** — a sessão (17-C) vai gravar snapshot.
4. **Medidas corporais serão `body_*`**, módulo central compartilhado com a Dieta. Registrado
   na 17-E e anotado na 16-E. **Nunca duas tabelas de peso corporal.**
5. **Sem prescrição, sem diagnóstico**, sem sugestão de carga máxima, sem incentivo a treinar
   com dor — em todas as subfases.

### Verificação
`npm run test:run` **889** · `npm run lint` limpo · `npx tsc --noEmit` limpo · `npm run build`
com as 13 rotas de `/treinos`. **13 verificações de RLS** rodadas pela role `authenticated`
(base global inalterável, forja bloqueada, favoritar permitido), com a integridade
reconferida depois: 106 exercícios / 132 vínculos / 0 resíduos.

### Fora do escopo (registrado, não silenciado)
Programas e treinos-modelo (17-B), sessão ao vivo e cronômetro (17-C), histórico/volume/
recordes (17-D), metas/medidas/dashboards (17-E), busca global, lançamento rápido,
notificações, agenda, TO-DO, hábitos e upload de mídia (17-F).

---

## Subfase 16-B — Dieta e Alimentação · Metas, diário alimentar e planejamento (2026-08-03) ✅

Segunda das 6 subfases da **Fase 16**. A 16-A entregou o catálogo; a 16-B faz o sistema saber
**o que o usuário comeu**. **Testes: 671 → 823** (+152 puros; a suíte total marca **889**
contando os 66 da Subfase 17-A, que corre em paralelo).

### A regra que a subfase existe para garantir
**Editar ou excluir um alimento não pode mudar o passado.** O erro clássico de app de
nutrição é guardar `food_id` + `quantity` e recalcular o histórico a partir do catálogo
atual — aí corrigir a proteína de um alimento hoje reescreve, em silêncio, o que a pessoa
comeu no ano passado.

`nutrition_diary_entries` congela **no ato do registro**: identidade, preparo, marca,
quantidade, medida, conversão para a unidade-base, procedência (fonte/versão/código) e os
nutrientes já ajustados à porção (`nutrients_snapshot jsonb`). O total do dia soma **esse
jsonb** — não existe caminho de leitura do total que passe pelo catálogo. `food_id` é
`on delete set null`: excluir o alimento perde o link, nunca o histórico.

**Provado no banco real** (role `authenticated`): editado o alimento (nome + energia
128 → 999) e depois excluído, o registro de 192 kcal continuou 192 kcal, com o nome de origem
e `food_id` nulo.

### Decisões de contrato
1. **Planejado ≠ consumido.** Tabelas separadas; nenhuma action de consumo escreve no
   planejamento. O cruzamento é derivado por `planned_item_id` + `change_kind`. `removido`
   registra a *decisão* de pular (≠ "não registrei") e não entra nas somas.
2. **`pendente` não existe no CHECK** — sai de `planned_time` + agora, como 'atrasada' no
   TO-DO. Tolerância de atraso: **45 min**, em constante nomeada. Refeição de hoje **sem
   horário nunca vira atrasada**: não há como saber.
3. **Meta vigente por data.** `nutrition_goal_periods` com `starts_on`/`ends_on`; a tela
   separa "editar este período" de "começar novo período" porque um muda o passado e o outro
   o preserva. Três eixos de escopo (dia da semana · treino/descanso · refeição) resolvidos
   do mais específico para o mais geral; trocar o tipo da meta não apaga o eixo desligado.
4. **Aderência é proximidade, não razão.** Comer o dobro não dá 200%. 100% dentro da meta ou
   da faixa; fora, cai com o desvio relativo. A fórmula é exibida na tela.
5. **Aplicar modelo materializa** refeições com data, sem vínculo vivo. Editar em série
   sempre pergunta o escopo, e **nenhum dos três escopos alcança o passado**.
6. **Água não se duplica** — lida de `habits`/`habit_logs` (Fase 10), com link para
   `/habitos`. Sem hábito, a tela diz isso em vez de mostrar "0 de 0".
7. **Sem prescrição.** O estimador (Mifflin-St Jeor) é opcional, mostra a fórmula por
   extenso, avisa que não é recomendação e **nunca grava meta**.

### Schema — 10 tabelas (projeto: 67 tabelas, 0 lints de schema)
`20260803150000_nutrition_profiles` · `…150100_nutrition_meal_types` ·
`…150200_nutrition_goal_periods` · `…150300_nutrition_goal_items` · `…150400_nutrition_plans` ·
`…150500_nutrition_plan_days` · `…150600_nutrition_planned_meals` ·
`…150700_nutrition_planned_meal_items` · `…150800_nutrition_diary_meals` ·
`…150900_nutrition_diary_entries`. Todas com RLS + FORCE RLS, índice em `user_id` e trigger
`set_updated_at`.

> Os tipos de refeição **não são seedados por migration**: são dado do usuário (renomeável,
> reordenável, desativável), criados na primeira leitura por `ensureMealTypes()`, idempotente
> pelo unique `(user_id, slug)`.

### ⚠️ Armadilha que passaria por build, tsc e lint
Os índices únicos que sustentam a idempotência são **parciais**
(`where planned_item_id is not null`; `where plan_day_id is not null and planned_date is not null`),
e o Postgres **não infere índice parcial num `ON CONFLICT`** sem repetir o predicado. O
`upsert` do PostgREST falharia **só em runtime**. Confirmado no banco (erro `42P10`) e
resolvido com *select-then-insert/update* em `skipPlannedItem` e na materialização de modelo.
A mesma regra vale para o índice de escopo de `nutrition_goal_items`, que usa `coalesce(...)`
— por isso `saveGoalItem`/`saveGoalItems` fazem delete-do-escopo + insert, e o filtro usa
`.is(coluna, null)` (um `.eq(coluna, null)` no PostgREST não casa com NULL).

### Arquivos criados
**Migrations:** as 10 acima.
**Lógica pura + testes:** `src/lib/nutrition/calendar.ts` (+26), `snapshot.ts` (+18),
`goals.ts` (+44), `diary.ts` (+36), `plan-recurrence.ts` (+28).
**Leitura/validação/mutação:** `src/lib/nutrition/diary-queries.ts`,
`src/lib/validators/nutrition-diary.ts`, `src/lib/actions/nutrition-diary.ts`,
`nutrition-goals.ts`, `nutrition-plans.ts`.
**UI:** `src/components/nutrition/{goal-progress-bar,food-picker-dialog}.tsx` ·
`src/app/(app)/nutricao/diario/{page,diary-client,loading}.tsx` ·
`metas/{page,goals-client,loading}.tsx` · `planejamento/{page,planning-client,loading}.tsx`.

### Arquivos alterados
`src/lib/nutrition/{constants,types}.ts` (enums, rótulos e tipos da 16-B; as 3 seções da
navegação passaram a "pronto") · `src/types/supabase.ts` (regenerado) ·
`src/app/(app)/nutricao/page.tsx` (visão geral real) · **`src/app/api/export/route.ts`** ·
docs.

### Correção de efeito colateral: o backup não incluía o módulo Dieta
`/api/export` não tinha nenhuma tabela `nutrition_*` (pendência não registrada da 16-A) — o
diário alimentar inteiro ficaria fora do backup. Agora inclui as 19 tabelas do usuário, com
`.eq("user_id", …)` explícito: sem ele, as tabelas que aceitam `user_id` nulo trariam os 597
alimentos e os 21.147 valores da TACO para o backup — dado que não é do usuário e que a
migration recria. O mesmo `.eq` resolveu um **TS2589** ("type instantiation is excessively
deep") que a união de 67 tabelas provocou no `from()` dinâmico da rota.

### Verificação
`npm run test:run` **889** (53 arquivos — 823 da Dieta e anteriores + 66 da 17-A) · `npm run lint` 0/0 · `npx tsc --noEmit` limpo ·
`npm run build` verde com as 4 rotas registradas. Suíte passa em `TZ=UTC` e `TZ=Asia/Tokyo`.
Smoke: `/nutricao`, `/nutricao/diario`, `/nutricao/metas`, `/nutricao/planejamento` → **307
`/login`**; `/login` → 200; `/api/cron/notifications` → **401**.

**30 verificações no banco pela role `authenticated`** (o SQL editor como `postgres` ignora
RLS): 20 de RLS/CHECK — intruso não lê, não edita, não apaga e não forja linha em nenhuma das
10 tabelas; `pendente`, snapshot incompleto, percentual sem refeição, período invertido e
refeição sem âncora são rejeitados pelos CHECKs — e 10 de imutabilidade/idempotência —
snapshot sobrevive a edição e exclusão do alimento, confirmar o mesmo item planejado 2× é
bloqueado pelo unique parcial, excluir o planejamento preserva o consumido, e tipo de refeição
em uso não pode ser excluído (FK `restrict`). **Todos os dados de teste foram removidos** e o
catálogo da 16-A foi reconferido: 597 alimentos, 21.147 valores.

### Pendências conscientes (registradas, não silenciadas)
| Item | Onde entra |
| --- | --- |
| Receita e refeição-modelo como item do diário | **16-C** — devem reusar `buildDiaryEntrySnapshot`, não criar um segundo caminho de gravação |
| Substituição de refeição/alimento com comparação | **16-C** |
| Visão de **mês** do diário (calendário com indicadores) | **16-E**, junto dos relatórios de período — hoje `?visao=mes` cai na visão de semana |
| Editar os **dias do modelo** pela interface (hoje o modelo é criado e aplicado; montar os dias exige a 16-C) | **16-C** |
| `updatePlannedMealInScope` existe e é testada, mas a UI só expõe o escopo na **exclusão** | **16-C**, junto da edição de refeição planejada |
| Micronutrientes com meta já funcionam; **relatório** de micro por período | **16-E** |
| Notificação de refeição pendente, busca global, lançamento rápido, card no dashboard | **16-F** |

### Próxima subfase
**16-C — Receitas, refeições-modelo e substituições** ·
`docs/phases/PHASE_16_C_NUTRITION_MEALS_RECIPES_SUBSTITUTIONS.md`

---


## Subfase 16-A — Dieta e Alimentação · Fundação, núcleo de cálculo e catálogo (2026-08-03) ✅

Primeira das 6 subfases da **Fase 16**, aberta pelo usuário fora do roadmap original.
Entrega a fundação do módulo: rota, navegação, schema, base nutricional brasileira real,
núcleo de cálculo testado e catálogo de alimentos completo. **Testes: 589 → 671** (+82).

### A decisão que define o módulo inteiro
**Ausência de dado não é zero.** Todo valor nutricional carrega um estado
(`disponivel | traco | nao_disponivel | nao_aplicavel | em_revisao`); só `disponivel` tem
número, e uma **CHECK constraint** garante isso no banco. Toda soma propaga uma qualidade
(`exato | aproximado | parcial`) que a interface é obrigada a mostrar. Somar tratando "não
analisado" como 0 inventa precisão que o dado não tem.

Isso apareceu no dado real logo no primeiro teste: **"Sal, grosso" tem energia marcada como
`NA` (não aplicável) na TACO** — o app mostra "n/a", não "0 kcal".

### Base nutricional: TACO 4ª edição, real e verificável
597 alimentos e **21.147 valores nutricionais**, do **XLSX oficial do NEPA/UNICAMP**. Sem
scraping, sem cópia de terceiros, sem nenhum número gerado por IA. A obra declara *"É
permitida a reprodução parcial ou total desta obra, desde que citada a fonte"* — a citação
aparece na visão geral e no detalhe de cada alimento.

Pipeline determinístico, reexecutável, com SHA-256 da origem no manifesto:
`build-taco-dataset.mjs` (XLSX → dataset validado) → `generate-taco-migration.mjs`
(dataset → 8 migrations idempotentes). Documentado em `data/nutrition/taco-4/ATTRIBUTION.md`.

**Fidelidade à fonte, item por item:**
- Os quatro marcadores viraram estados distintos: branco = "análises não solicitadas",
  `Tr` = traço, `NA` = não aplicável, `*` = "as análises estão sendo reavaliadas"
  (21 alimentos ficaram `is_verified = false` por causa disso).
- **Carboidrato levemente negativo** em 4 pescados/carnes magras — resultado real do cálculo
  por diferença da própria TACO — foi **preservado como publicado**, não zerado.
- Energia, carboidrato e vitamina A são marcados como `calculado`, não `analitico`: a própria
  TACO os obtém por cálculo.
- **Nenhuma medida caseira foi inventada** — a TACO não publica medida por alimento. A
  estrutura, a UI e o cálculo estão prontos; o usuário cadastra as suas.

### Schema — 10 tabelas + 1 view (projeto: 57 tabelas, 0 lints de schema)
`nutrition_nutrients` (catálogo global **sem policy de escrita**), `nutrition_food_sources`,
`nutrition_food_categories`, `nutrition_foods`, `nutrition_food_nutrients` (**única fonte de
verdade**), `nutrition_food_measures`, `nutrition_food_prefs`, `nutrition_food_tags`,
`nutrition_food_tag_links`, `nutrition_import_batches` + `nutrition_foods_view`
(`security_invoker`).

Novidade de modelagem em relação ao resto do projeto: **`user_id` nulo = linha global,
imutável**, com policies **separadas por comando** (SELECT alcança o global, escrita não).
Preferências do usuário sobre alimentos globais (favorito, arquivado, **recategorização**)
moram em `nutrition_food_prefs`.

> A recategorização nasceu de um caso real: a TACO lista "Biscoito, polvilho doce" em
> *Verduras e hortaliças* (a tabela é alfabética dentro da seção). Corrigir na base seria
> reescrever a fonte; o override resolve para o usuário sem mentir sobre o que foi publicado.

### Núcleo puro (+82 testes)
`units.ts` (conversão; **conversão impossível é erro tipado, nunca estimativa** — g→ml exige
densidade), `calc.ts` (fórmula única com a base lida do alimento, propagação de qualidade,
Atwater separado do declarado, arredondamento só na apresentação) e `filters.ts` (busca sem
acento, 13 filtros combináveis, URL ↔ filtros testada como ida e volta). A suíte passa em
`TZ=UTC`, `America/Sao_Paulo` e `Asia/Tokyo`.

### Interface
Item **"Dieta e Alimentação"** na sidebar (grupo Saúde). Visão geral com o estado real do
catálogo e a procedência da base. Catálogo com busca instantânea, 13 filtros, ações em massa
com confirmação e relatório do que foi ignorado, e painel de detalhe com 4 abas —
**calculadora de porção** (exercita o núcleo de ponta a ponta), nutrientes agrupados com
estado do valor, medidas caseiras (CRUD) e procedência. No formulário, **campo vazio =
"não informado"**, nunca zero. As 10 rotas restantes existem e dizem em qual subfase chegam.

### Segurança — 10 verificações de RLS pela role `authenticated`
Editar/excluir alimento global: **0 linhas**. Alterar nutriente da base: **0 linhas**.
`user_id` de terceiro, forjar alimento "oficial", escrever no catálogo de nutrientes, gravar
valor com estado incoerente e medida sem conversão: **todos bloqueados**. Favoritar alimento
da base: **permitido** (é preferência). Resíduos removidos e integridade reconferida.

### Arquivos principais criados
`scripts/nutrition/{build-taco-dataset,generate-taco-migration,uuid}.mjs` ·
`data/nutrition/taco-4/{foods.json,manifest.json,ATTRIBUTION.md}` ·
`supabase/migrations/2026080312*.sql` (10 de schema + seed de referência),
`2026080313*.sql` (8 de seed da TACO), `20260803140000_nutrition_taco4_batch.sql` ·
`src/lib/nutrition/{constants,types,units,calc,filters,queries}.ts` (+ 3 de teste) ·
`src/lib/validators/nutrition.ts` · `src/lib/actions/nutrition-foods.ts` ·
`src/components/nutrition/{nutrition-nav,nutrition-shell,nutrient-value,food-filters,food-detail-sheet,food-form-dialog,measure-dialog}.tsx` ·
`src/app/(app)/nutricao/` (layout, visão geral, catálogo + 10 rotas de submódulo).

### Arquivos alterados
`src/config/nav.ts` (grupo Saúde) · `src/types/supabase.ts` (regenerado) ·
`docs/project/{PROJECT_BRIEFING,PROJECT_ROADMAP,PROJECT_ARCHITECTURE,CURRENT_STATUS}.md` ·
`docs/handoff/{LAST_PHASE_SUMMARY,NEXT_AGENT_INSTRUCTIONS}.md` · `CLAUDE.md`.

### Verificação
`npm run test:run` (**671**), `npm run lint`, `npx tsc --noEmit`, `npm run build` — todos
passam. Rotas privadas: **307 → /login**. Nenhuma fase anterior foi tocada.

### Pendências conscientes (registradas, não silenciadas)
Medidas caseiras oficiais em massa (a TACO não publica — importar segunda fonte pelo mesmo
pipeline); scanner de código de barras pela câmera (16-F); dashboard geral, busca global,
lançamento rápido e notificações (16-F); exportação do catálogo em CSV (16-E).

### Próxima subfase
**16-B — Metas, diário alimentar e planejamento** ·
`docs/phases/PHASE_16_B_NUTRITION_DIARY_PLANNING.md`

---


## Iteração — Fecha as 3 pendências do TO-DO (2026-07-28) ✅

Feita logo após a Fase 15, a pedido do usuário ("vamos resolver isso tudo"). Fecha os três
itens que a fase havia deixado em aberto. **Testes: 529 → 589** (+53 puros desta iteração;
os outros 7 vieram da reforma de fuso que entrou no `main` em paralelo).

### 1. Entrada em linguagem natural — implementada
`src/lib/todo/parse.ts` (puro, `hoje` injetado, **37 testes**) + chips de confirmação no
`QuickTaskInput`. Reconhece data (`hoje`, `amanhã`, `sexta`, `dia 15`, `15/09`,
`10 de setembro`, `em 3 dias`), hora (`às 10h`, `14h30`, `14:05`, `meio-dia`), prazo
(`até…`, `vence…`, `prazo…`), prioridade (`p1`–`p4`), `#projeto`, `@etiqueta` e recorrência
(`toda segunda`, `todo dia 10`, `a cada 2 semanas`, `de 3 em 3 dias`, `dias úteis`,
`último dia útil do mês`, `após concluir`).

Contrato da tela: **o texto digitado nunca é reescrito**; tudo que foi entendido aparece em
chip **antes** de salvar; há o botão "Usar o texto como está" para desligar; padrão ambíguo
(`31/02`) é ignorado e fica no título. Efeito colateral necessário: `todoQuickTaskSchema`
ganhou `deadline_at` (+ o mesmo `superRefine` da edição completa) — sem isso o chip
"Prazo final" prometeria algo que não seria salvo.

### 2. Sincronização com Google Agenda — implementada (opt-in)
**A premissa anterior estava errada:** o projeto sempre teve escopo de escrita
(`calendar.events`), e a Fase 08 já criava/atualizava/excluía eventos. Nada de novo foi
pedido ao Google — reaproveitamos tokens e cliente HTTP existentes.

- `src/lib/todo/google-event.ts` — mapeamento **puro** tarefa → evento (**16 testes**).
- `src/lib/todo/calendar-sync.ts` — I/O, `server-only`, best-effort.
- Migration `20260728120000_todo_google_sync.sql` — `google_integrations.todo_sync_enabled`
  (default `false`) + `comment on table/column` corrigindo a documentação do schema.
- Interruptor + "Enviar tarefas agora" no card do Google em `/agenda`.

Decisões que valem como contrato: **opt-in**; **sentido único** (tarefa → evento, sem
reimportar); **recorrente não vira RRULE** (só a ocorrência atual, movida a cada conclusão —
publicar RRULE dessincronizaria assim que o usuário concluísse fora da data); excluir tarefa
chama `removeTaskFromGoogle` **antes** do delete (a ponte é `on delete cascade`); concluir
tarefa não recorrente não mexe no evento; cancelar/arquivar removem, restaurar recria.

### 3. Actions sem gatilho — todas expostas
- **Arraste na navegação** (`SortableList`, o mesmo de hábitos/rotinas) para **projetos,
  etiquetas e filtros salvos**, com UI otimista e reversão no erro.
- **Seções:** menu da coluna no Kanban → "Mover para a esquerda/direita" (acessível por
  teclado, ao contrário de arrastar coluna).
- **`mergeTodoLabels`:** bloco "Mesclar com outra etiqueta" no `LabelDialog`, dizendo quantas
  tarefas migram e que nenhuma é apagada.
- **`updateTodoSavedFilter` / `deleteTodoSavedFilter`:** `SaveFilterDialog` ganhou modo de
  edição e exclusão. A definição guardada é **preservada por padrão**; substituir pelos
  filtros da tela exige marcar um switch.
- **Bônus:** editar/excluir **etiqueta** era impossível pela interface (as actions existiam,
  mas nada as chamava) — agora há um lápis em cada linha da navegação. E nasceu
  `reorderTodoSavedFilters`, que não existia.

`NavButton` foi reestruturado: a alça de arraste e o botão de editar são **irmãos** do botão
de navegação, nunca aninhados (botão dentro de botão é HTML inválido e quebra teclado e
leitor de tela). O lápis é **sempre visível** — telas de toque não têm hover.

### Verificação
**589 passando (43 arquivos)** · `npx tsc --noEmit` limpo · `npm run lint` 0 erros/0 avisos ·
build compila · `get_advisors(security)` só o aviso externo pré-existente de Auth.

⚠️ **No Windows, `npm run test:run`, `npm run build` e `npm run dev` falham** desde a reforma
de fuso: os scripts usam o prefixo POSIX `TZ=America/Sao_Paulo`, e o npm no Windows executa
via `cmd`, que não reconhece essa sintaxe. Não afeta a Vercel (Linux). Contorno local:
`$env:TZ='America/Sao_Paulo'; npx vitest run` (idem `npx next build` / `npx next dev`).
Correção definitiva sugerida: `cross-env` ou mover o `TZ` para a config do Vitest/Next.

---

## Fase 15 — Módulo TO-DO completo (2026-07-28) ✅

> Fase **fora do roadmap original** (as 14 fases originais já estavam fechadas), aberta a
> pedido do usuário. Arquivo da fase: `docs/phases/PHASE_15_TODO_COMPLETE.md`.

### Resumo
Entregue o **TO-DO** (`/todo`): gerenciador de tarefas completo com projetos, seções,
subtarefas, etiquetas, prioridades P1–P4, **data programada separada do prazo final**,
horário e duração, recorrência avançada, lembretes, comentários, anexos, histórico de
atividades, filtros combináveis e salvos, ações em massa, e visões **lista / Kanban /
calendário**. Inspirado na *experiência* de ferramentas como o Todoist — **sem copiar nome,
logo, textos, ícones, código, assets ou identidade visual**. Usa integralmente o design
system existente (preto/branco/dourado, dark+light, Arial, shadcn/ui).

### Decisão técnica mais importante
**13 tabelas `todo_*` novas, em vez de evoluir `tasks`/`projects` (Fase 09).** `tasks` está
acoplado a cinco pontos já entregues — `calendar_events.task_id`, `notifications/generate.ts`,
`search/queries.ts`, `dashboard/queries.ts` e o kanban-por-status. Remodelá-la exigiria mexer
nos cinco ao mesmo tempo (risco alto numa base com 414 testes verdes). **Consequência
assumida:** dois módulos de tarefas coexistem — `/todo` é o principal de execução; `/tarefas`
+ `/rotinas` seguem por causa das rotinas e do vínculo com a agenda.

### Arquivos criados
**Migrations (`supabase/migrations/`, idempotentes):** `20260728100000_todo_projects.sql`,
`…100100_todo_sections`, `…100200_todo_labels`, `…100300_todo_tasks`,
`…100400_todo_task_labels`, `…100500_todo_recurrences`, `…100600_todo_completions`,
`…100700_todo_comments`, `…100800_todo_reminders`, `…100900_todo_saved_filters`,
`…101000_todo_activity`, `…101100_todo_preferences`, `…101200_todo_calendar_sync`.

**Lógica pura + testes:** `src/lib/todo/constants.ts`, `types.ts`,
`recurrence.ts` + `recurrence.test.ts` (53), `status.ts` + `status.test.ts` (26),
`filters.ts` + `filters.test.ts` (36), `queries.ts`, `activity.ts`.

**Validação/mutação:** `src/lib/validators/todo.ts`; `src/lib/actions/todo.ts` (tarefas),
`todo-projects.ts` (projetos/seções/etiquetas), `todo-extras.ts` (comentários/anexos/
lembretes/filtros/preferências).

**UI:** `src/app/(app)/todo/{page,loading,todo-client}.tsx`; `src/components/todo/`
(`badges`, `task-row`, `task-board`, `task-calendar`, `task-detail-sheet`,
`quick-task-input`, `recurrence-editor`, `todo-nav`, `todo-dialogs`);
`src/components/dashboard/general/todo-card.tsx`.

### Arquivos alterados
`src/config/nav.ts` (item TO-DO) · `src/types/supabase.ts` (regenerado) ·
`src/lib/search/{types,queries}.ts` + `src/components/search/search-meta.tsx` (busca cobre
tarefas/projetos/etiquetas do TO-DO, com `?task=` abrindo o painel) ·
`src/lib/actions/quick-add.ts` + `src/components/quick-add/quick-add.tsx` (tipo "Nova
tarefa"; o antigo virou "Tarefa (lista antiga)") · `src/lib/notifications/{constants,generate,
cron}.ts` + `src/components/notifications/notification-meta.tsx` (4 tipos novos + fecho dos
lembretes) · `src/lib/dashboard/cards.ts` + `src/components/dashboard/general/card-meta.ts` +
`src/app/(app)/dashboard/page.tsx` (card TO-DO) · `src/app/api/export/route.ts` (13 tabelas) ·
docs (`PROJECT_BRIEFING`, `PROJECT_ARCHITECTURE`, `PROJECT_ROADMAP`, `CURRENT_STATUS`,
`NEXT_AGENT_INSTRUCTIONS`, `CLAUDE.md`).

### Migrations e RLS
13 migrations aplicadas em `yjvnlbjvippefvzgrxxw`. **Todas as 13 tabelas** com `user_id` NOT
NULL → `auth.users(id) ON DELETE CASCADE`, **RLS + FORCE RLS**, policy
`for all using (user_id = auth.uid()) with check (user_id = auth.uid())`, índice em `user_id`,
índices de consulta e trigger `set_updated_at`. Conferido no banco: **13/13** com
`relrowsecurity` e `relforcerowsecurity` verdadeiros e 1 policy cada. **`get_advisors`
(security): 0 lints de schema** (resta só o aviso externo pré-existente de "leaked password
protection"). Total do projeto: **47 tabelas**.

Índices únicos que sustentam regra de negócio:
`todo_completions (user_id, task_id, scheduled_for)` (não-duplicação de ocorrência) ·
`todo_recurrences (task_id)` (1:1) · `todo_labels (user_id, lower(name))` ·
`todo_preferences (user_id, scope)` · `todo_calendar_sync (task_id, provider)` e
`(user_id, provider, external_event_id)`.

### Invariantes implementadas
1. **`atrasada` nunca é gravado** — derivado na leitura (`effectiveStatus`).
2. **Conclusão idempotente** por `(user_id, task_id, scheduled_for)`.
3. **Tarefa recorrente avança a própria linha** (preserva projeto/seção/prioridade/etiquetas/
   lembretes sem copiar nada); histórico em `todo_completions`. **Reabrir remove a última
   conclusão e volta a data** — não cria ocorrência extra.
4. **Nenhuma exclusão silenciosa**: projeto/seção exigem escolher o destino das tarefas
   (com confirmação digitando "EXCLUIR" no caso destrutivo); etiqueta remove só a associação;
   série recorrente pergunta o escopo; concluir tarefa-mãe com subtarefas pendentes pergunta.
5. **Datas puras 'yyyy-MM-dd' + `time` separado**; toda a aritmética de recorrência em
   `Date.UTC` interno; nenhuma função pura chama `Date.now()`.

### Testes realizados
`npm run test:run` → **529 testes passando** em 41 arquivos (eram **414**). Os 115 novos são
**puros, com datas injetadas, sem tocar no banco**.

Cobrem: recorrência diária/semanal/mensal/anual; intervalo de N unidades; dias específicos da
semana com ciclo de N semanas; dia do mês com clamp; **último dia do mês**; **primeiro/último
dia útil**; **n-ésimo dia da semana do mês**; "somente dias úteis"; `ends_on`;
`max_occurrences`; pausa; **ano bissexto** (2024/2026/1900/2000); **virada de ano**; 29/02 em
ano não bissexto; **modo fixo vs. após conclusão** (inclusive concluindo atrasado);
materialização preservando a folga entre data programada e prazo; status derivado; prazo
próximo; progresso de subtarefas; horário final com virada de meia-noite; filtros combinados;
ordenação com nulos por último; agrupamento; árvore de subtarefas com proteção contra ciclo.

**Qualidade:** `npx tsc --noEmit` ✅ · `npm run lint` ✅ (0 erros, 0 avisos) · `npm run build` ✅
(rota `/todo` registrada).

**Smoke test no banco real** (dados criados e removidos por completo ao final):

| Verificação | Resultado |
| --- | --- |
| 2ª conclusão da mesma ocorrência rejeitada pelo unique | ✅ bloqueada |
| Conclusões após tentar duplicar | 1 |
| Excluir etiqueta **não** apaga a tarefa | ✅ |
| Associação tarefa↔etiqueta removida | ✅ |
| Excluir projeto apaga as seções (cascade) | ✅ |
| Excluir projeto **não** apaga a tarefa (vai p/ Caixa de entrada) | ✅ |
| Excluir tarefa apaga recorrência e conclusões (cascade) | ✅ |
| Limpeza dos dados de teste | ✅ 0 restantes |

### Problemas encontrados e resolvidos
1. **Embed 1:1 do PostgREST** (`recurrence:todo_recurrences(*)`) colapsava para `never` na
   tipagem. Resolvido com um tipo explícito `RawRecurrenceRow` no ponto de leitura, sem
   espalhar `any`.
2. **`Record<string, unknown>` não é atribuível a `Json`** nas colunas jsonb do histórico.
   Criado `ActivityPayload` (`{ [k: string]: Json | undefined }`), o que também deixa
   explícito que só valor serializável entra na auditoria.
3. **Sincronizar prop→estado sem `useEffect`** (o lint de React 19 do projeto proíbe): usado o
   padrão já adotado no repo — ajuste no render guardado por um "id visto" — no painel de
   detalhes, nos diálogos e no `?task=`.

### Pendências conhecidas (estado no fechamento da Fase 15)

> ⚠️ As pendências **1, 2 e 6** foram **resolvidas na iteração de 2026-07-28**, descrita no
> topo deste arquivo. O texto abaixo fica como registro do que a fase entregou e do que
> ficou para depois — não use como lista de trabalho.

1. ~~**Entrada em linguagem natural**~~ → **implementada** (`src/lib/todo/parse.ts`).
2. ~~**Sincronização com Google Agenda**~~ → **implementada e opt-in**. A justificativa
   registrada aqui (falta de escopo OAuth de escrita) **estava errada**: a Fase 08 sempre
   pediu `calendar.events`, que é leitura e escrita.
3. **Canais de lembrete `email`/`push`** existem no CHECK mas **não são oferecidos na UI** —
   só o canal interno (sino) tem infraestrutura real. **Continua em aberto.**
4. **Dois módulos de tarefas coexistem.** Aposentar `/tarefas` exige antes migrar
   `calendar_events.task_id`, `generate.ts`, `search/queries.ts` e `dashboard/queries.ts`.
   **Continua em aberto (proposital).**
5. **Reordenação de tarefas** persiste com um `update` por item (`Promise.all`), igual a
   `reorderHabits`/`reorderRoutines`. Suficiente para single-user.
6. ~~**Actions sem gatilho na interface**~~ → **todas expostas**; ver o topo do arquivo.

### Recomendação
Usar o módulo alguns dias no fluxo real antes de expandir.

---

# Histórico anterior (fases e iterações anteriores)


## Iteração anterior (manutenção) — 2026-07-20: Sistema inteiro em America/Sao_Paulo
Auditoria completa de fuso (financeiro, agenda/tarefas/notificações, hábitos/estudos/busca/export):
~25 pontos vazavam UTC. Raiz: na Vercel o Node roda em **UTC**, então `date-fns`
(`startOfDay`/`isSameDay`/`format`), os getters de `Date` e `Intl` **sem** `timeZone` respondiam
em UTC no servidor — **entre 21h e 00h (BRT) o dia virava**.

Correção em três camadas, nesta ordem de importância:
1. **`TZ=America/Sao_Paulo` no processo** — novo `src/instrumentation.ts` (roda antes do app em
   todo boot/cold start) + scripts do `package.json`, para dev/build/test baterem com produção.
   É **rede de segurança**, não a defesa principal.
2. **Formatadores explícitos** (valem mesmo onde o fuso ambiente não se aplica — o browser):
   `formatDate`/`formatDateWith` agora separam **data pura** (`'yyyy-MM-dd'` reordenada como
   TEXTO, imune a fuso) de **instante** (lido em Brasília). Novos:
   `timeInSaoPaulo`, **`saoPauloWallClockToInstant`** (a hora que o usuário digita é hora de
   Brasília, não do fuso do aparelho), `toDateTimeLocalInSaoPaulo`, `TIMEZONE`,
   `SAO_PAULO_UTC_OFFSET` (offset fixo — sem horário de verão desde 2019).
3. **Pontos onde a data vinha de um instante** — o `TZ` **não** conserta `.slice(0,10)` de um
   `timestamptz`, que é sempre UTC. Bugs de dado: `bills.ts` lançava a conta fixa na competência
   errada **e duplicava** na virada do mês; `dashboard/queries.ts` montava a janela do card Agenda
   em UTC (deslocada 3h todo dia); `search/queries.ts` gerava link quebrado; `reports/tasks.ts`
   jogava tarefa de domingo à noite na semana seguinte. Mais `financeiro/page.tsx`,
   `agenda-card.tsx`, `export/route.ts`, `period.ts`, `regional-card.tsx`.

Na Agenda, `calendar/format.ts` passou a distinguir **instante** (novo `emBrasilia`, aplicado em
`agenda-card`/`upcoming-events`/`event-details`) de **data de grade** — esta NÃO converte, pois
já é consistente com o fuso ambiente por construção e converter deslocaria um dia.
**Cron da Vercel é sempre UTC:** `vercel.json` virou `0 12`/`0 0` para rodar às 09h/21h BRT
(antes disparava 06h/18h). Sem migration.

**Como isto é verificado:** os testes de fuso usam instantes absolutos (`Z`) e esperam valores em
BRT, então não dependem do `TZ` da máquina — a suíte passa em `TZ=UTC`, `America/Sao_Paulo` e
`Asia/Tokyo`. Suíte **421** (lint/tsc/build ok).

**Resíduo conhecido:** o agrupamento por dia da grade da Agenda (`calendar/events.ts`, `grid.ts`,
`upcoming.ts`, `recurrence.ts`) usa `date-fns` no fuso ambiente. Correto no servidor (fixado) e em
aparelho brasileiro; num aparelho configurado em outro fuso ainda seguiria o dispositivo. Fechar
isso exigiria uma lib tz-aware (`@date-fns/tz`) na camada de grade.

## Iteração anterior (manutenção) — 2026-07-19: Data do pagamento da fatura é escolhida
O diálogo **Pagar** de `/faturas` só pedia a conta e carimbava **hoje** (`hojeISO()` no lançamento e
`new Date()` em `pago_em`), então quem lançava a fatura dias depois de pagar ficava com a data errada e
o extrato do banco não batia. Agora o diálogo tem **"Data do pagamento"** (`<input type="date">`,
default hoje, aceita retroativa/futura) e o valor desce até o lançamento:
`markStatementPaid(id, contaId, dataPagamento?)` → `montarPagamentoFatura` (o parâmetro `hoje` virou
**`dataPagamento`** — mesma injeção pura, sem `Date.now()`) → `purchase_date`/`competence_date`.
`card_statements.pago_em` (timestamptz) também reflete a data escolhida via helper **`pagoEmTimestamp`**,
que grava **meio-dia UTC** (09h em São Paulo) para a data cair no **mesmo dia do calendário** lida no
fuso BR — meia-noite UTC voltaria um dia. `pagamentoFaturaSchema` ganhou `dataPagamento` opcional
(ausente → servidor usa `hojeISO()`, então a chamada antiga de 2 args continua válida). Sem migration.
Nada muda em status/relatórios: `statusEfetivo` só testa a *presença* de `pago_em` e o pagamento segue
`transferencia` (fora de entradas/saídas e do total da fatura). Suíte **415** (lint/tsc/build ok).

## Iteração anterior (manutenção) — 2026-07-19: Apagar o pagamento reabre a fatura
O pagamento de fatura é um lançamento `transferencia` comum e aparece em Lançamentos com
Editar/Excluir. **Excluir por ali** estornava o saldo mas deixava a fatura **marcada como paga**:
o FK `card_statements.pago_transacao_id` é `on delete set null`, então zerava o ponteiro sem limpar
`pago_em`/`status`/`pago_conta_id` — fatura "paga" apontando para o nada. Agora `deleteTransaction`
usa o helper novo **`statementPaidBy`** para detectar que o lançamento quita uma fatura e a **reabre**
(`status='aberta'` + campos de pagamento nulos), igual ao `markStatementUnpaid`. O mesmo helper cobre
a **edição**: editar transferência apaga e recria a linha, então o pagamento recriado teria **outro
`id`** e a fatura perderia o vínculo — `updateTransaction` religa `pago_transacao_id` ao lançamento
recriado (**editar o pagamento não desfaz o pagamento**). Sem migration; sem teste de unidade novo
(I/O puro, como `markStatementUnpaid`). Suíte **414** (lint/tsc/build ok).

## Iteração anterior (manutenção) — 2026-07-19: Transferência não mexia no saldo das contas
Registrar transferência entre contas **não alterava saldo nenhum** (Cofre travado no `initial_balance`
mesmo com 3 transferências recebidas). Contradição entre schema e cálculo: `20260625120300_transactions`
definiu transferência como **DUAS linhas espelhadas** (A→B e B→A, mesmo `transfer_group_id`) e
`createTransaction` gravava as duas — mas `public.account_balance` (`20260625120600`) já deriva **os dois
lados de UMA linha** (`-amount` em `account_id`, `+amount` em `transfer_account_id`). Cada conta recebia
`-amount` de uma perna e `+amount` da outra → **soma sempre zero**. O par também era **simétrico e sem
marcador de direção**, então a origem/destino exibida na lista saía do desempate arbitrário do `ORDER BY`
(as duas linhas têm `competence_date`/`created_at` idênticos). Agora: **uma linha por transferência**
(origem em `account_id`, destino em `transfer_account_id`); `transfer_group_id` fica como marcador de
"isto é transferência" — update/delete/status já operavam por grupo e seguem iguais. Migration
`20260720030000_transferencia_uma_linha` (idempotente): apaga a perna espelhada mantendo a de **origem**
(menor `ctid`, a que o app já exibia) + índice único parcial `transactions_transfer_group_unique` para o
par não voltar. A dedup por grupo em `transactions-client.tsx` saiu (virou desnecessária). Dados: 3
transferências Mercado Pago → Cofre corrigidas (Cofre 756,18 → **1.891,04**; MP 6.222,70 → **5.087,84**).
Relatórios/dashboard não mudam (`transferencia` já ficava fora de entradas/saídas). Suíte **414**
(lint/tsc/build ok). **Aprendizado:** quando o cálculo de saldo vive numa função SQL, o formato gravado
pelo action precisa casar com o que a função assume — aqui as duas convenções coexistiram e se anularam.

## Iteração anterior (manutenção) — 2026-06-27: Recorrência em cartão de crédito
Recorrências (Financeiro → Recorrências) só sabiam lidar com **conta**: o dropdown já listava
"Cartão de crédito" (enum compartilhado), mas **não havia seletor de cartão**, ainda pedia conta, e
salvar quebraria — `recurring_transactions` não tinha `card_id` nem aceitava `cartao_credito` no CHECK.
Agora, ao escolher cartão o form **troca "Conta" por "Cartão"**, força **tipo = despesa**, e cada
ocorrência gerada vira despesa no cartão **resolvida para a fatura da data** (reaproveita
`resolveOrCreateStatement`/`resolverFatura`), **sem abater conta** (`account_id` null). Migration
`20260627000000_recurring_card_support` (idempotente: `card_id` FK on delete set null + CHECK + índice;
`supabase.ts` ajustado). Decisões: cartão = sempre despesa, `card_id` obrigatório (Zod `superRefine`);
cartão excluído deixa recorrência **órfã** (`card_id` null) → a geração **pula** sem travar as demais.
Lógica pura nova `buildGeneratedRow`/`isCardRecurrence` em `generation.ts` (5 testes). Arquivos: migration,
`validators/recurring.ts`, `actions/recurring.ts`, `finance/generation.ts`, `finance/queries.ts`
(join `card`), `recorrencias/{page,recurring-client,recurring-form}.tsx`. Suíte **407** (lint/tsc/build ok).

## Iteração (manutenção) — 2026-06-27: Embed ambíguo no `getTransactions` esvaziava as listas
Regressão de **runtime** da feature de pagamento: a migration `20260627140000` adicionou
`card_statements.pago_transacao_id → transactions.id` (um **2º FK** entre as tabelas) e o `TX_SELECT`
passou a embutir `statement:card_statements(id,pago_em)` **sem dizer qual FK**. Com 2 caminhos, o
PostgREST 14.5 devolve **`PGRST201` (HTTP 300)** e `getTransactions` cai em `data ?? []` → **lista
vazia**. Em `/faturas`, o detalhe mostrava só as **parcelas** (query separada) e sumiam **à vista +
estornos**; também quebrava **Lançamentos** e o **Dashboard**. Passou em build/tsc/lint/testes (erro só
em runtime). **Fix (1 linha em `src/lib/finance/queries.ts`):** desambiguar igual ao `accounts` →
`statement:card_statements!transactions_statement_id_fkey(id,pago_em)`. Verificado no REST real (antes
HTTP 300/PGRST201 → depois HTTP 200). Sem migration, suíte **401**. **Lição:** novo FK que cria um 2º
caminho entre tabelas usadas em embeds → revisar todos os `*_SELECT` do `queries.ts` e pôr `!nome_fk`.

## Iteração anterior (manutenção) — 2026-06-27: Pagar fatura debita uma conta (+ resolve o "seletor de conta")
O botão **Pagar** da fatura abre um diálogo que **sempre pede a conta** e cria **um lançamento tipo
`transferencia`** (debita a conta, status `pago`, `amount` = total da fatura, sem `statement_id`/`card_id`).
Por ser transferência fica **fora** de despesas/relatórios (o `dashboard` exclui) e **fora** do
`total_atual` da fatura (a view só soma despesa/receita) → **zero duplicação**; e **abate o saldo** da
conta. **Desfazer** deleta o lançamento (estorna o saldo) e limpa os campos. A fatura ganhou
`pago_conta_id`/`pago_transacao_id` (migration `20260627140000`, idempotente; `supabase.ts` regenerado).
Em **Lançamentos**, item de cartão mostra **pago/em aberto DERIVADO** da `pago_em` da fatura
(`getTransactions` embute `statement(id,pago_em)`). **Resolve a pendência** anterior (`markStatementPaid(id)`
sem `contaId`) → assinatura agora `(id, contaId)`, `build`/`tsc` verdes. Lógica pura `montarPagamentoFatura`
(4 testes). Bloqueios: fatura já paga e total ≤ 0. Suíte **401** (lint/tsc/build ok). Detalhes em
`docs/project/CURRENT_STATUS.md` → *Iterações (modo manutenção)*.

## Iteração anterior (manutenção) — 2026-06-27: Importar fatura parcelada + divisão "por valor" dividia o recebível do terceiro por `qtd`
Numa fatura de terceiro, dividir uma linha **parcelada** **por VALOR** deixava o recebível **dividido
pelo nº de parcelas** (ex.: SUZY R$147,50/parcela aparecia como **R$73,75**). Causa-raiz (confirmada no
banco): o diálogo de divisão da revisão prevê a parte contra **uma parcela** (o valor da linha), mas
`createInstallmentPurchase`/`applySplitParcelado` dividem a parte pelo **total da compra** (parcela ×
`qtd`) e a espalham nas parcelas → a parte por valor saía dividida por `qtd` (percentual não sofre).
Correção: função pura **`escalarPartesParcelado`** (`src/lib/import/parcelamento.ts`) multiplica as
partes **por valor** por `qtd` em centavos antes do motor; `commitImport` aplica só no ramo do
parcelamento. Sem migration. Suíte **401** (lint ok, `tsc` só com erro **pré-existente** abaixo).
**Dados:** corrigidas via SQL as 2 compras afetadas (Suzy/**Bruna Biju 2** e Nicole/**Cea Bau**),
recebíveis e `valor_pessoal` recompostos — total da SUZY em jun/2026 voltou aos **R$773,53** exatos.
**⚠ Pendência separada (pré-existente):** `build`/`tsc` quebram em `faturas/statements-client.tsx:260`
(`markStatementPaid(id)` sem o 2º arg `contaId` — "marcar fatura como paga" meio-ligado no `b8696b5`);
precisa de seletor de conta. Detalhes em `docs/project/CURRENT_STATUS.md` → *Iterações*.

## Iteração anterior (manutenção) — 2026-06-27: Estorno de cartão não infla "Entradas"
O estorno (receita vinculada à fatura, sem conta) era somado em `resumoMes.entradas` **e** já reduzia
o `total_atual` da fatura → contado em dobro, inflando as Entradas no Painel/Relatórios (que reusam
`resumoMes`). O **saldo das contas nunca foi afetado** (`account_balance` só soma transações com
`account_id`). Correção: receita com `card_id` não entra em `entradas`. UI: `EstornoBadge` ("Estorno de
cartão") substitui "Receita + Recebido" na lista de lançamentos. Suíte **391** (lint/tsc/build ok), sem
migration. Detalhes em `docs/project/CURRENT_STATUS.md` → *Iterações (modo manutenção)*.

## Iteração anterior (manutenção) — 2026-06-27: Importação de fatura — parcelas em meses passados + total errado
Numa fatura de cartão, a linha "k/N" e a última parcela "N/N" trazem a **data da compra original**
(meses atrás), não a data desta fatura. O `commitImport` ancorava a fatura de destino nessa data
antiga, então a parcela `k` caía na fatura da compra original e espalhava `k…N` por **meses passados**
— criando faturas "Atrasada" fantasma **e** drenando o total da fatura atual (mesma causa dos dois
sintomas). Correção: **toda linha do arquivo pertence à fatura sendo importada**. Detecta-se a
**competência** da fatura pelas compras à vista (pura `detectarCompetenciaFatura`), **confirmável na
revisão** ("Fatura de destino") e gravada em `import_batches.competencia_fatura` (migration). O
`commitImport` ancora todas as linhas de cartão nela: parcela `k` na fatura importada e `k+1…` nos
meses seguintes (`planejarParcelamento`/`distribuirFaturas` + `competenciaBase`), última parcela/à
vista via `statement_competencia` + `getOrCreateStatementForCompetencia`. Suíte **390** (lint/tsc/build
ok), `supabase.ts` regenerado. **Dados:** o lote `fatura-azul-julho` foi desfeito e **reimportado** —
junho fechou nos R$ 4.262,45 exatos. **Faturas vazias** (0 lançamentos, criadas pelo get-or-create)
deixaram de listar: `getStatements` agora filtra `itens > 0`; as vazias do cartão foram apagadas.
Detalhes em `docs/project/CURRENT_STATUS.md` → *Iterações (modo manutenção)*.

## Iteração anterior (manutenção) — 2026-06-27: Importar fatura "como parcelado" (valor da parcela + só as restantes)
Numa fatura de cartão, a linha "k/N" traz o valor de **uma parcela**, não o total da compra. O
"Importar parcelado?" dividia o valor da linha por `N` e gerava `N` parcelas do zero — "5/12 R$105"
virava 12× R$8,75. Agora, nova lógica pura **`planejarImportParcelado`** (`src/lib/import/parcelamento.ts`):
cada parcela = valor da linha e gera **só as restantes** (`N − k + 1`), preservando a numeração
original → "5/12 R$105" vira **8× R$105 numeradas 5/12…12/12**. `planejarParcelamento` ganhou
`numeroInicial` (offset; default 1 mantém o fluxo manual), o schema ganhou `numero_inicial`/
`parcelas_total_label` opcionais e `commitImport` calcula o plano pela função pura. UI: o botão some
na **última parcela** (k = N). **Sem migration.** Suíte **382** (lint/tsc/build ok). Detalhes em
`docs/project/CURRENT_STATUS.md` → *Iterações (modo manutenção)*.

## Iteração anterior (manutenção) — 2026-06-27: Divisão com terceiros na edição e na importação
A divisão de gastos (Fase 05) deixou de ser exclusiva da criação. **Na edição:** `updateTransaction`
re-aplica a divisão de uma despesa simples (reusa `applySplit`), só quando ela muda de fato, e
**bloqueia** se houver recebível `cobrado`/`pago`; o form pré-preenche as partes via
`getTransactionSplit`/`sharedExpensesToFormParts`. **Na importação:** migration
`20260627120000_import_rows_split` (+`classificacao`/`split_parts` em `import_rows`), botão "Dividir"
por linha (`ImportRowSplitDialog`), `setImportRowSplit` grava e `commitImport` repassa para
`createTransaction`/`createInstallmentPurchase`. **Correção:** `splitSchema` passou a aceitar valor BR
com vírgula (`normalizeBRMoney`). Suíte **362** (lint/tsc/build ok); `src/types/supabase.ts`
regenerado. Detalhes em `docs/project/CURRENT_STATUS.md` → *Iterações (modo manutenção)*.

## Iteração anterior (manutenção) — 2026-06-27: Importação — cabeçalho fora da 1ª linha
Faturas/extratos reais (ex.: export do Itaú/cartão Azul) trazem **título/resumo antes da tabela**,
então o cabeçalho real não está na 1ª linha. Os parsers (`parseCsv`/`parseXlsx`) assumiam "1ª linha
= cabeçalho", pegavam o título (`Nome;Yuri…`) e **toda** linha caía em *"Mapeie as colunas de data e
valor."*. Correção: nova função pura **`detectHeaderRow()`** em `src/lib/import/mapping.ts` (acha a 1ª
linha cujo `autoDetectMapping` resolve **data E valor**; fallback linha 0 → sem regressão). `csv.ts` e
`xlsx.ts` passam a fatiar a partir dela. Bônus: **`parseParcela`** entende `"Parcela X de N"` (Itaú),
além de `"k/N"`. Testes novos (`csv.test.ts`, `detectHeaderRow`, parcela "de") → suíte **356**
(lint/tsc/build ok). Detalhes em `docs/project/CURRENT_STATUS.md` → *Iterações (modo manutenção)*.

## Iteração anterior (manutenção) — 2026-06-26: Conta/Segurança em Configurações
Adicionado `SecurityCard` em `/configuracoes` (após o `ProfileCard`) com **trocar e-mail** e
**trocar senha**, refletindo direto no **Supabase Auth** (`auth.users`) — **sem migration**.
Senha: reautentica com a atual (`signInWithPassword`) e aplica `updateUser({ password })`.
E-mail: `updateUser({ email })` com confirmação dupla (padrão Supabase), reusando o `/auth/callback`.
Convenção de auth do repo (client do navegador, `react-hook-form`+`zod`). Schemas/teste em
`src/lib/validators/auth.ts(.test.ts)`. **Passo manual**: liberar `…/auth/callback` na *Redirect URLs*
allow-list do projeto `yjvnlbjvippefvzgrxxw` (Authentication → URL Configuration). Detalhes em
`docs/project/CURRENT_STATUS.md` → *Iterações (modo manutenção)*.

## Fase concluída: **Fase 14 — Segurança, Responsividade & Polimento Final** (2026-06-26) — **ÚLTIMA FASE / PROJETO CONCLUÍDO** 🎉

### Resumo da implementação
A fase de **fechamento** do sistema (sem novos domínios): entregou os **relatórios consolidados**
(`/relatorios`), finalizou as **configurações** (`/configuracoes`), consolidou a **store de
preferências** (`settings` estendida), criou a infraestrutura de **anexos genéricos**
(`attachments` + bucket), entregou **exportação/backup** (`/api/export`), e fez a **auditoria de
segurança** (RLS em todas as tabelas, Zod no servidor, nenhum `service_role` no client). Tudo por
**reuso** das Fases 02–13 — nenhuma regra de negócio nova. Com isso, **as 14 fases do roadmap estão
concluídas** e o projeto entra em **modo manutenção** (não há Fase 15).

### Decisões de modelagem (importante)
- **`settings` estendida, não recriada:** migration **idempotente** que só **adiciona** colunas à
  store da Fase 12 (`display_name`, `avatar_url`, `theme`, `currency`, `date_format`,
  `notification_prefs jsonb`). RLS + FORCE RLS já existiam. Optou-se por **estender `settings`** em
  vez de criar `profiles` (uma linha por usuário, `unique(user_id)`).
- **`attachments` genérica** (1 tabela nova): `entity_type`/`entity_id` **sem FK** (referência a
  qualquer módulo), `storage_path`/`file_name`/`mime_type`/`size_bytes`, **RLS + FORCE RLS**,
  índices `user_id` e `(user_id, entity_type, entity_id)`, único `(bucket_id, storage_path)`,
  trigger `updated_at`. Bucket privado `attachments` com policy por pasta `{user_id}/…` — mesmo
  padrão de `task_attachments` (Fase 09).
- **Reuso total nos relatórios:** `reports/queries.ts` apenas **lê e agrega** via `finance/dashboard.ts`
  (Fase 07), `getHabitsDashboard` (Fase 10), `getStudyDashboard` (Fase 11) e o agregador **puro**
  `reports/tasks.ts` (sobre `tasks/status.ts` da Fase 09).

### Decisões técnicas (importante)
- **Upsert parcial de preferências:** `patchSettings` faz `upsert({ user_id, ...patch })` — o
  PostgREST só atualiza as colunas presentes, então salvar perfil **não** apaga prefs de
  notificação (e vice-versa). `user_id` sempre de `auth.uid()`.
- **Tema:** continua via `next-themes` (sem flash) como fonte de verdade; a coluna `settings.theme`
  é sincronizada **best-effort** pelo `AppearanceCard` (não bloqueia a UI) — store consolidada.
- **Exportação/backup respeita RLS:** `/api/export` roda cada `select` sob a sessão do usuário
  (nunca varre outro usuário) e **omite deliberadamente `google_integrations`** (tokens OAuth nunca
  saem). Rota privada (proxy) + `auth.getUser()` na própria rota (defesa em profundidade).
- **CSV/JSON no client, sem round-trip:** os relatórios exportam a partir dos dados já carregados
  (`reports/csv.ts` puro + `reports/download.ts` com BOM p/ Excel). Separador `;` (Excel pt-BR).
- **`formatDateWith`** aplica a preferência de formato de data onde é lida; o padrão global do app
  segue `formatDate` (dd/MM/yyyy, BR) para não arriscar quebra em telas das fases anteriores.
- **Gráficos reaproveitados** (Fase 07) + `ReportBarChart` genérico novo — **zero dependência nova**.

### Arquivos criados (principais)
- **Migrations:** `supabase/migrations/20260626200000_settings_profile.sql`,
  `20260626200100_attachments.sql`, `20260626200200_attachments_storage.sql`.
- **Preferências (store):** `src/lib/settings/constants.ts`, `src/lib/settings/queries.ts`
  (`getUserSettings`/`getDisplayName`).
- **Relatórios:** `src/lib/reports/queries.ts`, `src/lib/reports/tasks.ts` + `tasks.test.ts`
  (**4 testes**), `src/lib/reports/csv.ts` + `csv.test.ts` (**4 testes**), `src/lib/reports/download.ts`,
  `src/components/reports/report-bar-chart.tsx`; `src/app/(app)/relatorios/` (`page.tsx`,
  `relatorios-client.tsx`, `loading.tsx`).
- **Configurações:** `src/components/settings/profile-card.tsx`, `regional-card.tsx`,
  `notifications-card.tsx`, `dashboard-prefs-card.tsx`.
- **Backup:** `src/app/api/export/route.ts`.

### Arquivos alterados
- `src/types/supabase.ts` — regenerado (inclui `attachments` + colunas novas de `settings`).
- `src/lib/validators/settings.ts` — `profileSchema`/`preferencesSchema`/`themeSchema`/`notificationPrefsSchema`.
- `src/lib/actions/settings.ts` — `saveProfile`/`savePreferences`/`saveThemePreference`/`saveNotificationPrefs` (+ `patchSettings`).
- `src/lib/format.ts` — `formatDateWith` (+ helper `toLocalDate`).
- `src/components/settings/appearance-card.tsx` — claro/escuro/**sistema** + persiste tema best-effort.
- `src/app/(app)/configuracoes/page.tsx` — página completa (perfil/aparência/regional/notificações/Google/dashboard/backup/atalhos).
- `src/config/nav.ts` — item **Relatórios** (`/relatorios`).
- `src/app/(app)/layout.tsx` + `src/components/layout/{app-shell,header,user-menu}.tsx` — propagam o **nome de exibição** ao menu do usuário.

### Migrations aplicadas
- 3 migrations aplicadas no projeto `yjvnlbjvippefvzgrxxw` via Supabase MCP. **0 lints de schema**
  no `get_advisors`. Tipos regenerados. RLS confirmada em **todas as 34 tabelas** (`list_tables`).

### Funcionalidades entregues
- **Relatórios** (5 abas: financeiro, cartões, hábitos, estudos, tarefas) com gráficos úteis,
  filtro de período e **exportação** (CSV por aba + JSON do relatório).
- **Configurações finais** completas (perfil, tema/sistema, BRL, formato de data, notificações,
  Google, exportação/backup, preferências do dashboard, atalhos categorias/cartões).
- **`attachments`** + bucket privado (infra de anexos genéricos, RLS).
- **Backup** (`/api/export`) com **todos** os dados do usuário (sem tokens), respeitando RLS.
- **Auditoria de segurança** concluída: RLS em todas as tabelas, Zod no servidor, sem `service_role` no client.

### Testes
- `npm run test:run` ✅ **342 testes** (334 anteriores + **8 da Fase 14**): `reports/tasks` (4) e `reports/csv` (4).
- `npm run lint` ✅ (0/0); `tsc --noEmit` ✅; `npm run build` ✅. Smoke: `/login` 200;
  `/relatorios`, `/configuracoes`, `/api/export` → 307 `/login`; `/api/cron/notifications` → 401.

### Checklist de aceite do briefing (revisado item a item)
- ✅ Cadastrar cartões com fechamento/vencimento · lançar compra → fatura correta · parcelada →
  parcelas distribuídas · **provisão das próximas 6 faturas** (Fases 03–04, com testes).
- ✅ Importar Excel/CSV/OFX; importados têm as **mesmas opções** dos manuais (Fase 06).
- ✅ Separar pessoal × terceiros; ver quem precisa pagar/quanto/de qual fatura (Fase 05).
- ✅ Ver fatura de qualquer mês; contas/receitas/despesas à vista (Fases 03/02).
- ✅ Dashboard financeiro completo (Fase 07) · Google Agenda (Fase 08) · tarefas/rotinas/hábitos
  (água/leitura/exercícios)/estudos (Fases 09–11) · busca global + lançamento rápido + notificações
  (Fase 13) · **relatórios** (Fase 14).
- ✅ Dark/light; sistema premium preto/branco/dourado, responsivo. Segurança: **RLS em todas as
  tabelas**, validação no servidor, sem dados sensíveis no client, **backup/exportação** disponível.

### Problemas/pendências
- **Verificação visual logada pendente** (dark/light + mobile) de ponta a ponta — já há usuário em
  `auth.users`. Dá para exercitar perfil, tema, relatórios, exportação e backup.
- **Anexos na UI:** infra (`attachments` + bucket) pronta; ligar o upload em telas além de tarefas é
  melhoria de manutenção (precedente em tarefas, Fase 09).
- **Cron/notificações** ainda exige `SUPABASE_SERVICE_ROLE_KEY` + `CRON_SECRET` no ambiente; Google
  Agenda exige `GOOGLE_CLIENT_ID/SECRET` (degrada com elegância sem eles).

### Recomendação para o próximo agente
**O projeto está concluído (modo manutenção) — não inicie uma "Fase 15".** Para melhorias/correções
futuras, siga `docs/handoff/NEXT_AGENT_INSTRUCTIONS.md`: leia briefing/regras, trate como tarefa
pontual e preserve os invariantes (RLS `using`+`with check`, Zod no servidor, sem `service_role` no
client, pt-BR/BRL, dark/light + responsividade, testes verdes). Rode sempre
`npm run lint && npx tsc --noEmit && npm run test:run && npm run build` antes de fechar.
