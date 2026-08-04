# Design — Fase 18: Módulo Inteligência Artificial

> Spec validado em 2026-08-04. Produto de brainstorming com o usuário, com quatro rodadas de
> revisão e correção. **Este documento é a fonte de verdade do desenho.** Os seis arquivos
> `docs/phases/PHASE_18_*.md` detalham a execução de cada subfase.

## 1. O que é

Um módulo central em `/ia` ("Inteligência Artificial") que transforma a IA em assistente
pessoal integrada ao sistema inteiro: conversa sobre os dados reais dos módulos, analisa
histórico, gera relatórios, encontra padrões, propõe e executa ações por ferramentas seguras,
interpreta imagens e documentos, usa agentes especializados por módulo, funciona com quatro
provedores e registra tudo que consultou ou modificou.

**Provedores:** OpenAI (exibido "ChatGPT/OpenAI"), Google Gemini, Anthropic Claude, xAI Grok.

**O que este módulo NÃO é:** um chatbot genérico com acesso ao banco. A IA nunca toca o banco
diretamente.

## 2. Decisões de nomenclatura

| Decisão | Valor | Motivo |
| --- | --- | --- |
| Rota | `/ia` | Convenção do projeto: rota em pt-BR (`/nutricao`, `/treinos`, `/financeiro`) |
| Prefixo de tabela | `ai_*` | Convenção do projeto: schema em inglês (`nutrition_*`, `training_*`, `todo_*`) |
| Endpoint de streaming | `/api/ia/chat` | Único endpoint novo da 18-A |
| Fase | 18 | Próxima disponível (16 e 17 concluídas em 2026-08-04) |

## 3. A regra principal de arquitetura

A IA **nunca** tem acesso irrestrito ao banco. Ela não executa SQL, não monta consulta, não
recebe credencial de banco, não usa `service_role`, não altera registro fora dos serviços de
domínio, não chama rota interna sem validação, não ignora RLS, não executa código arbitrário,
não cria ferramenta em runtime e não trata resposta textual como autorização para agir.

Toda leitura e toda alteração passam por uma camada controlada de ferramentas com nome
explícito, descrição, schema de entrada, schema de saída, permissões, escopo de módulo,
classificação de risco, validação no backend, verificação de propriedade, idempotência,
auditoria e confirmação quando necessária.

**O modelo decide qual ferramenta pedir. Quem valida e executa é o backend.**

### As quatro travas que sustentam o resto

1. **O modelo nunca vê nem fornece `user_id`.** Toda ferramenta executa sob `authContext()`,
   exatamente como um formulário. `user_id`/`owner_id` não existem nos schemas de entrada; se
   aparecerem, o Zod `.strict()` rejeita.
2. **O Tool Registry é estático em código.** Nome fora do registry, ou dentro do registry mas
   fora da allowlist do agente, é rejeitado antes de executar, e a rejeição vira auditoria.
   Não existe caminho para criar ferramenta em runtime — logo o "Nível 4 (bloquear)" não é uma
   checagem, é ausência de código.
3. **Dado é dado, nunca instrução.** Resultado de ferramenta, linha do banco, texto de
   documento e imagem entram por estrutura (papel de mensagem, bloco tipado, origem declarada,
   tamanho limitado, campos podados) — **nunca** como mensagem de sistema, e nunca confiando
   apenas em delimitador textual. O prompt-base de segurança é sempre o primeiro e nenhum
   perfil de agente o substitui.
4. **A chave de provedor nunca esteve no banco.** `AI_MASTER_KEYS` só no ambiente do servidor.
   A tabela guarda ciphertext, DEK embrulhada, IVs, tags, versões e os quatro últimos
   caracteres. Nenhuma query devolve material criptográfico ao client.

## 4. Arquitetura de camadas

```txt
src/lib/ai/
├── core/                     ← ZERO import de pacote de fornecedor. Puro e testável.
│   ├── contracts.ts          ← AiRequest, AiStreamEvent, AiResult, AiUsage, AiError, AiCancel
│   ├── capabilities.ts       ← matriz texto/visão/arquivo/tool/estruturado/stream/áudio/busca
│   ├── models.ts             ← catálogo provider→model→capacidade→janela→status→verified_at
│   ├── pricing.ts            ← tarifas versionadas, decimal em string, effective_from/until
│   ├── router.ts             ← agente + necessidade + orçamento → (provider, model). Puro.
│   ├── fallback.ts           ← classe de erro → fallback permitido? destino compatível?
│   ├── errors.ts             ← as 10 classes normalizadas
│   └── result.ts             ← Result<T>; nenhuma exceção de fornecedor cruza a fronteira
│
├── providers/                ← ÚNICA camada autorizada a importar `ai` e `@ai-sdk/*`
│   ├── registry.ts           ← os 4 provedores, metadados estáticos, endpoints oficiais
│   ├── provider-factory.ts   ← (provider, model, credencial) → objeto que implementa contracts
│   └── ai-sdk/
│       ├── adapter.ts        ← tradução bidirecional contrato ↔ AI SDK
│       ├── openai.ts · gemini.ts · anthropic.ts · xai.ts
│       └── error-map.ts      ← erro do SDK/HTTP → core/errors, já sanitizado
│
├── agents/
│   ├── registry.ts           ← perfis estáticos (18-A: só o Assistente Pessoal)
│   ├── prompts/              ← um arquivo por versão; a versão vai para ai_runs.prompt_version
│   └── security-prompt.ts    ← prompt-base; sempre primeiro; nenhum perfil o substitui
│
├── tools/                    ← contratos existem na 18-A; registry NASCE VAZIO
│   ├── contracts.ts
│   └── registry.ts
│
├── context/                  ← 18-B
├── approval/                 ← 18-C
│
├── usage/
│   ├── meter.ts              ← puro: usage bruto + tarifa → custo, com "indisponível" ≠ 0
│   ├── reservation.ts        ← puro: estimativa conservadora de custo antes da chamada
│   └── budget.ts             ← puro: confirmado + reservas ativas + nova → permitido?
│
├── security/
│   ├── untrusted.ts          ← empacota dado externo como conteúdo não confiável
│   ├── redact.ts             ← saneia erro e log; nunca chave, token ou payload cru
│   └── rate-limit.ts         ← puro: janela + contagem → permitido?
│
├── server/                   ← 'server-only' no topo de TODOS estes arquivos
│   ├── crypto-readiness.ts   ← valida o keyring; nunca derruba o resto do sistema
│   ├── credential-crypto.ts  ← AES-256-GCM, envelope, AAD, keyring versionado
│   ├── credential-store.ts   ← grava e resolve credencial; ciphertext não sai daqui
│   ├── chat-runner.ts        ← orquestra o run inteiro
│   ├── run-store.ts          ← transições condicionais de ai_runs / ai_messages
│   └── reconcile.ts          ← recuperação preguiçosa e em lote de runs abandonados
│
├── queries.ts                ← leituras server-only das telas (colunas explícitas)
└── types.ts
```

Fora de `src/lib/ai/`: `src/lib/actions/ai-{conversations,providers,preferences}.ts`,
`src/lib/validators/ai.ts`, `src/app/api/ia/chat/route.ts`, `src/app/(app)/ia/*`,
`src/components/ai/*`, cards em `src/components/settings/*`.

### A fronteira é regra estática, não convenção

- **ESLint 9 flat config** com `no-restricted-imports` por zona (pega alias de path):
  `core/`, `agents/`, `tools/`, `context/`, `approval/`, `usage/` e `security/` não importam
  `ai` nem `@ai-sdk/*`; nada fora da allowlist importa `credential-crypto`.
- **`server-only`** no topo de todo arquivo de `server/` — quebra o build se um módulo client
  alcançar.
- **Teste de rede** varrendo import estático **e dinâmico** (`await import(...)`), porque
  `no-restricted-imports` não cobre import dinâmico.

## 5. Reutilização das regras de negócio

As ferramentas são **cascas finas sobre os serviços que já existem**. Nenhuma regra é
reescrita — é isso que impede a segunda forma de lançar transação, e o que faz a regra de
fechamento de fatura continuar saindo de `invoice.ts`.

### Levantamento factual das 44 actions (2026-08-04)

| Sinal de acoplamento | Resultado |
| --- | --- |
| `redirect()` | **0 de 44** |
| `FormData` | **3 de 44** — `body-measurements`, `imports`, `nutrition-recipes` (upload) |
| `(input: unknown)` + Zod dentro + `authContext()` | padrão universal |
| Toast / componente | 0 — o toast é do client, sobre o `ActionResult` |
| `revalidatePath` | **41 de 44** |

### Decisão: extração sob demanda na 18-C

`revalidatePath` sozinho **não** classifica uma action como Caso B. Uma action é **Caso A
adaptável** quando recebe input estruturado, usa Zod, usa `authContext()`, não recebe
`FormData`, não executa `redirect()`, não depende de componentes, não mistura regra com
interface, e o único acoplamento restante é `revalidatePath`.

As três actions com `FormData` são **Caso B**.

```txt
Formulário → Server Action → Command compartilhado → Serviço de domínio → revalidatePath (na casca)
Tool Executor → Adapter da ferramenta → MESMO Command → MESMO serviço de domínio
```

`revalidatePath` fica **exclusivamente na casca da Server Action**, nunca dentro da regra
central. **Não se refatora action que a IA não vai usar.** A 18-C abre com uma matriz
obrigatória (Action · Módulo · Ferramenta futura · Leitura/Escrita · Caso A/B · Command a
extrair · Serviço reutilizado · Risco · Confirmação · Idempotência · Efeito de cache ·
Testes) antes de qualquer linha de código.

Continuam fonte única, sem cópia: `invoice.ts` (fechamento de fatura), parcelamentos,
gastos de terceiros, `addDiaryEntry` (snapshot nutricional), recorrência do TO-DO, conflitos
de agenda, `session-machine.ts` (sessão e séries de treino).

**A ferramenta nunca chama rota HTTP interna simulando o preenchimento de um formulário.**

## 6. Fluxo de uma mensagem

```txt
BROWSER → POST /api/ia/chat { conversationId?, text, agentId?, providerPreference?, modelPreference? }

ROUTE HANDLER (runtime nodejs — TRANSPORTE apenas)
 1. authContext()                → sem sessão: 401. user_id SÓ daqui.
 2. Origin / Sec-Fetch-Site      → Route Handler não herda a proteção CSRF que o Next dá
                                   a Server Action. Checagem explícita.
 3. Limite do corpo HTTP, da mensagem textual e do histórico enviado ao provedor → 413
 4. Zod .strict()                → campo a mais (user_id, owner_id, attachments) = 400
 5. crypto-readiness             → keyring ausente/inválido: 503 AI_CRYPTO_NOT_CONFIGURED
 6. Resolução SERVIDOR do modelo → preferência do cliente NUNCA é ordem:
      provedor no registry? ativo para este usuário? credencial existe e está válida?
      modelo no catálogo? habilitado? tem as capacidades exigidas?
 7. Estimativa conservadora de custo (usage/reservation) com limite de saída EXPLÍCITO

INÍCIO ATÔMICO — função ai_begin_chat_run (uma transação, tudo ou nada)
 8. auth.uid() (rejeita NULL) → advisory lock por usuário → reconcilia reservas vencidas
    → rate limit → orçamento (confirmado + reservas ativas + nova reserva)
    → valida/cria conversa → insere mensagem do usuário → insere ai_run com a reserva
    → insere mensagem do assistente em `streaming`
    → devolve conversation_id, user_message_id, run_id, assistant_message_id

MONTAGEM DO PROMPT (security/untrusted.ts)
 9. [system] prompt-base de segurança + prompt do agente ← única fonte de instrução
    [user]/[assistant] histórico (ou resumo)
    dado recuperado entra como bloco tipado marcado como não confiável, com origem
    declarada, tamanho limitado e campos podados — NUNCA como system

CHAMADA
10. provider-factory → credencial decifrada só neste instante, em memória, para uma chamada
11. streaming; ai_runs.status = streaming; last_heartbeat_at atualizado no máximo a cada 10 s
12. deltas por SSE; request.signal propagado ao provedor

FINAL
13. usage do provedor → usage/meter (métrica ausente = "indisponível", nunca 0)
    ai_usage_events: UMA LINHA POR TENTATIVA, com rate_snapshot próprio
    ai_messages(assistant) → complete
    ai_runs → completed; reserva encerrada; orçamento passa a contar o custo real
```

### Os três encerramentos anômalos

| Evento | `ai_runs` | `ai_messages` (assistant) | Uso e reserva |
| --- | --- | --- | --- |
| Usuário cancela | `cancelled` + `cancel_reason` | `cancelled`, texto parcial preservado (política declarada na UI) | registra o consumo informado; libera o saldo não utilizado |
| Erro | `failed` + `error_code` + `error_message_sanitized` | `failed` | idem |
| Cliente cai | idêntico ao cancelamento (`request.signal`) | `cancelled` | idem |

Se o provedor não informar consumo, isso é registrado como **indisponível explícito** —
nunca vira zero silencioso. A política de orçamento para esse caso é conservadora e
documentada na 18-A.

**Todas** as transições finais são condicionais ao estado anterior
(`WHERE status IN ('reserved','streaming')`): quem chegar primeiro vence, o outro é no-op, e
`finally` e reconciliador não podem se contradizer.

## 7. Uso, custo e orçamento

### `ai_usage_events` é por TENTATIVA, não por run

Um run pode fazer mais de uma chamada ao provedor — retry no mesmo provedor, fallback para
outro provedor ou modelo, falha após consumo parcial, tentativa que cobra tokens antes de
falhar, timeout depois do provedor já ter processado parte. Uma linha por run obrigaria a
sobrescrever custo, perder a primeira tentativa, misturar tarifas ou enfiar um array na linha.
Nenhuma dessas é aceitável.

```txt
attempt_index (1, 2, 3…)   attempt_type (PRIMARY | RETRY | FALLBACK)
provider · model_id · status · started_at · completed_at · provider_request_id
tokens · rate_snapshot · pricing_version · currency · estimated_cost (numeric)
usage_availability          ← quais métricas o provedor realmente informou
UNIQUE (run_id, attempt_index)
FOREIGN KEY (run_id, user_id) REFERENCES ai_runs (id, user_id)
```

> **Decisão revisada (não é estética).** A versão anterior deste spec propunha
> `UNIQUE (user_id, run_id, attempt_index)`. `run_id` é UUID e chave primária de `ai_runs`,
> logo é globalmente único e **já determina o usuário** — `user_id` na chave não acrescenta
> unicidade nenhuma. A proteção que ele aparentava dar (impedir linha com `user_id` divergente
> do run) é obtida de verdade pela **FK composta `(run_id, user_id)` → `ai_runs (id, user_id)`**,
> que é o padrão que o projeto já adota desde a 16-E e a 17-F. Com a FK composta no lugar,
> `user_id` na constraint única só aumentaria a largura do índice. **Fica
> `UNIQUE (run_id, attempt_index)` + FK composta.**

Fluxo idempotente: **insert primeiro**; em `23505`, consulta e devolve a tentativa existente.
Nunca soma de novo. Nunca `upsert` sem conferir que a constraint do `ON CONFLICT` existe
mesmo no banco (o projeto já se queimou com `42P10` em índice parcial — aqui a constraint é
total, então não há inferência a fazer, mas a conferência continua obrigatória).

- Custo do run = soma das tentativas válidas.
- Custo mensal = soma de todos os eventos de uso.
- `rate_snapshot` existe **por tentativa**, porque um fallback pode usar outro provedor,
  modelo ou tarifa.

### Moeda canônica: USD, sem câmbio na 18-A

Os quatro provedores publicam preço em **USD**. Converter para BRL exigiria fonte de câmbio,
snapshot da taxa, versão, timestamp e política para taxa ausente — uma segunda fonte de verdade
inteira, para um número que **não é cobrança oficial** e sim estimativa.

| Campo | Moeda |
| --- | --- |
| `ai_usage_events.currency` | **`USD`**, com CHECK fixando o valor na 18-A |
| `ai_usage_events.estimated_cost` | USD, `numeric` |
| `ai_runs.reserved_cost` / `reservation_currency` | **USD** |
| Orçamento diário e mensal do usuário | **USD** |

A interface exibe em USD e diz, no próprio card, que é **estimativa do sistema, não cobrança
do provedor, e que não há conversão para BRL**. O BRL do projeto continua sendo a moeda do
módulo financeiro — custo de IA não é transação financeira do usuário e não entra nos
relatórios de finanças.

**Câmbio fica para a 18-F**, se for desejado, com tabela própria de taxas (fonte, valor,
timestamp, versão) e snapshot por evento — pelo mesmo princípio do `rate_snapshot`.

**Ausência nunca é zero.** Se tarifa, unidade de uso ou métrica do provedor faltarem:
`estimated_cost` fica **`NULL`**, `usage_availability` registra exatamente o que faltou, a UI
mostra "custo indisponível" e o orçamento aplica a política conservadora da matriz de reserva —
nunca soma zero.

### Fontes de verdade

```txt
ai_runs           → execução lógica, estado, latência total, resultado final,
                    provedor/modelo selecionados e os que concluíram, nº de tentativas e fallbacks
ai_usage_events   → tentativas reais, uso, custo, tarifa, retries e fallbacks
ai_messages       → conteúdo e estado da mensagem
```

`ai_messages` **não** guarda tokens, custo, latência, provedor nem modelo. A tela junta por
`run_id`. `ai_runs` **não** é fonte de custo individual.

### O run é reserva financeira temporária

O advisory lock resolve a corrida na *quantidade* de runs, mas não na de orçamento: duas
requisições podem ver o mesmo consumo confirmado e ambas passarem enquanto a primeira ainda
não gerou evento de uso.

```txt
ai_runs.reserved_cost · reservation_currency · reservation_rate_version · reservation_expires_at

aceita se:  consumo confirmado
          + reservas de runs ativos e não expirados
          + reserva conservadora da nova solicitação
          ≤ limite configurado
```

A reserva é calculada no servidor **antes** da função, a partir do modelo selecionado, da
tarifa atual, do tamanho estimado da entrada, do **limite máximo de saída definido para a
chamada** e de margem conservadora documentada. Na 18-A só existe texto — não se reserva
custo de imagem ou arquivo. **Nenhuma chamada é feita sem limite explícito de saída.**

Ao concluir, a reserva deixa de contar e o orçamento passa a considerar o custo real; os dois
nunca são somados ao mesmo tempo. Ao falhar ou cancelar, registra-se o consumo informado e
libera-se o saldo não utilizado. Fallback **não** ganha orçamento novo: valida o restante.

### Alertas de orçamento — divisão declarada

| 18-A | 18-F |
| --- | --- |
| Indicador visual em `/ia`, barra de consumo, aviso na tela, estado "próximo do limite", **bloqueio em 100%**, persistência do nível já atingido para não repetir aviso | Integração com `notifications`, `filterByPrefs`, `dedupe_key`, sino, preferências, canais adicionais |

A 18-A **não** toca o sino. Se isso mudar, vira exceção declarada e sai da lista da 18-F.

## 8. Criptografia das credenciais

```txt
1. Servidor gera credential_id (UUID) ANTES de cifrar — ele entra no AAD
2. owner_id vem de authContext()
3. provider resolvido pelo registry
4. DEK aleatória de 256 bits, exclusiva desta credencial
5. secret ─AES-256-GCM(DEK, iv₁, AAD)→ ciphertext + auth_tag
6. DEK    ─AES-256-GCM(MK,  iv₂, AAD)→ wrapped_dek + dek_auth_tag
7. insert usando o UUID previamente gerado

AAD (idêntico nas duas camadas): credential_id | owner_id | provider | key_version
```

O AAD faz mover um ciphertext de linha, de provedor ou de dono **falhar na verificação da
tag** em vez de decifrar em silêncio.

**Uso:** `credential-store.resolve(provider)` lê a linha do próprio usuário, desembrulha a
DEK, decifra e devolve a chave **como valor em memória, para uma única chamada**. Não vai para
variável de módulo, cache, log, resposta ou telemetria.

**Keyring e rotação** — girar a master key re-embrulha só as DEKs, sem tocar no ciphertext do
segredo:

```txt
AI_MASTER_KEYS       = "1:<base64 de 32 bytes>,2:<base64 de 32 bytes>"
AI_MASTER_KEY_CURRENT = 2

decifrar → usa a key_version gravada NA LINHA
cifrar   → sempre a corrente
rotação  → publica a nova como corrente mantendo a antiga no keyring; ação explícita de
           re-embrulho reescreve as linhas; depois a antiga sai do keyring
```

O formato aceita N versões desde o início. `key_version` desconhecida devolve erro tipado —
nunca "chave inválida" genérico, que mandaria trocar a chave do provedor sem necessidade.

**Validação do keyring (fail-closed só para IA):** falha explícita se ausente, base64
inválido, ≠ 32 bytes, versão corrente não declarada ou ausente do keyring, ou ids duplicados.
Sem padding em chave curta, sem derivar de senha humana, sem escolher outra versão em
silêncio.

**A ausência ou invalidez do keyring desativa SOMENTE a IA.** O resto do sistema continua
funcionando; `/ia` explica o que configurar; ações de credencial ficam desabilitadas;
`/api/ia/chat` devolve `503 AI_CRYPTO_NOT_CONFIGURED`. A validação roda em serviço de
readiness server-side — nunca parsing em código client, nunca derrubando build ou páginas não
relacionadas.

**A UI nunca vê material criptográfico.** As queries selecionam colunas nominais
(`provider, status, last_four, last_validated_at, updated_at`). Nenhum `select('*')` em
credencial.

## 9. Endurecimento da função SQL

```txt
SECURITY INVOKER · VOLATILE · SET search_path = ''
schema explícito em toda tabela, função e tipo
REVOKE ALL FROM PUBLIC · REVOKE ALL FROM anon · GRANT EXECUTE TO authenticated
rejeita quando auth.uid() IS NULL
```

**Não aceita do cliente:** `user_id`, `owner_id`, limite mensal, consumo acumulado, contagem
atual da janela. Tudo isso é lido pelo banco.

**Advisory lock:** chave derivada com namespace exclusivo do módulo
(conceitualmente `hashtextextended('ai-run:' || auth.uid()::text, 0)`). É por usuário,
transacional, não sobrevive a commit/rollback, não colide intencionalmente com outros
módulos, e a possibilidade de colisão do hash está considerada e documentada.

**A segurança não depende do Route Handler.** Um usuário autenticado pode chamar o RPC
direto, então a função valida por conta própria: tamanho da mensagem, conversa pertencente ao
usuário, status permitido, provedor válido, campos obrigatórios, reserva não negativa e datas
válidas.

## 10. Recuperação de runs abandonados — SLA declarado

A afirmação "nenhum run fica em `reserved`/`streaming`" **não** é literalmente garantida no
instante de uma queda completa do processo. O critério correto é: **todo run abandonado é
detectado e reconciliado dentro do SLA**.

| Parâmetro | Valor |
| --- | --- |
| Cadência real do Cron existente (`vercel.json`) | `0 12 * * *` e `0 0 * * *` — **2×/dia, 09h e 21h BRT, intervalo de 12 h** |
| `last_heartbeat_at` | atualizado no máximo a cada 10 s durante o streaming (nunca por token) |
| Run considerado abandonado | heartbeat vencido há mais de 5 min |
| Reconciliação **preguiçosa** (primária) | ao abrir `/ia`, ao listar conversas e **antes de reservar um novo run** |
| Reconciliação **em lote** (rede de segurança) | pega carona no Cron de notificações; pior caso 12 h |
| Lote máximo | 200 runs por execução |
| Concorrência | `UPDATE` condicional ao estado anterior + heartbeat; idempotente por natureza |

**Consequência assumida e registrada como risco:** o Cron sozinho tem pior caso de 12 h.
Por isso a recuperação preguiçosa é a primária — em especial a que roda **antes de reservar
um novo run**, que garante que um run travado nunca bloqueie a próxima conversa do usuário
nem prenda orçamento. O Cron existe só para o caso de o usuário não voltar ao módulo.

Nenhuma alteração em `vercel.json` foi feita. Se no futuro for preciso reduzir o pior caso, a
decisão (e o limite do plano da Vercel) fica registrada na 18-A.

## 11. Modelagem — as 7 tabelas da 18-A

| Tabela | Papel |
| --- | --- |
| `ai_provider_configs` | config por usuário×provedor: ativo, modelos padrão/econômico/avançado/visão, timeout, retries, limites diário e mensal, fallback permitido e ordem, observações. **Sem `base_url`** |
| `ai_provider_credentials` | só material criptográfico + `last_four` + `status` + `last_validated_at` |
| `ai_user_preferences` | provedor/modelo padrão, modo de confirmação, privacidade por domínio, orçamento, preferências do módulo |
| `ai_conversations` | conversa, agente, título, favorito, arquivamento, resumo e versão do resumo |
| `ai_messages` | conteúdo e estado. **Sem** tokens, custo, latência, provedor, modelo |
| `ai_runs` | execução lógica, estado, latência total, heartbeat/lease, reserva financeira, provedor/modelo selecionados e concluintes, contagem de tentativas e fallbacks |
| `ai_usage_events` | **uma linha por tentativa** de chamada ao provedor |

Todas com `user_id NOT NULL`, RLS + FORCE RLS, índice em `user_id`, trigger `updated_at`,
CHECKs de status/role/provider, FK composta `(x_id, user_id)` sempre que uma apontar para
outra dentro do mesmo usuário, `numeric` para dinheiro e índices pelas consultas reais.

### Não criadas na 18-A, com motivo

| Tabela | Onde entra | Motivo |
| --- | --- | --- |
| `ai_cost_rates` | 18-F, **se** houver necessidade | Tarifa vive em `core/pricing.ts`, versionada no git, e cada tentativa guarda `rate_snapshot` — mudar preço já não reescreve histórico |
| `ai_budget_periods` | — | Gasto é derivado de `ai_usage_events`; limite mora nas preferências. Padrão "status derivado na leitura" do projeto |
| `ai_provider_health_checks` | — | `status` + `last_validated_at` cobrem "testar conexão" e "último teste" |
| `ai_run_steps`, `ai_tool_calls` | 18-B | Só quando existir passo para registrar. `ai_runs.id` já é a âncora de correlação |
| `ai_action_proposals/approvals/executions` | 18-C | |
| `ai_insights` e satélites | 18-E | |
| `ai_memories` e satélites | 18-F | |

## 11.1 Fechamento técnico

Advisory lock e duração da transação · moeda canônica · ciclo da reserva com matriz de 15
cenários · fórmula da reserva com exemplos numéricos · validações internas de
`ai_begin_chat_run` · máquina de estados do run · modelo de tentativas · recuperação por
usuário × global · teste de conexão · dependências npm · plano das duas migrations · matriz de
invariantes:

➡ **"Anexos técnicos" em `docs/phases/PHASE_18_A_AI_FOUNDATION_PROVIDERS_CHAT.md`.**

## 12. As seis subfases

| Sub | Tema | Arquivo |
| --- | --- | --- |
| 18-A | Fundação, provedores e chat | `PHASE_18_A_AI_FOUNDATION_PROVIDERS_CHAT.md` |
| 18-B | Contexto, ferramentas de leitura e agentes | `PHASE_18_B_AI_CONTEXT_READ_TOOLS_AGENTS.md` |
| 18-C | Ações, aprovações e auditoria | `PHASE_18_C_AI_ACTIONS_APPROVALS_AUDIT.md` |
| 18-D | Visão, documentos e comprovantes | `PHASE_18_D_AI_VISION_DOCUMENTS_RECEIPTS.md` |
| 18-E | Insights, relatórios e dashboards | `PHASE_18_E_AI_INSIGHTS_REPORTS_DASHBOARDS.md` |
| 18-F | Memória, voz, integrações e polimento | `PHASE_18_F_AI_MEMORY_VOICE_INTEGRATIONS_POLISH.md` |

Ordem obrigatória. Cada uma fecha com verificação completa e documentação atualizada.

## 13. A exceção arquitetural do streaming

O padrão dominante do projeto é **Server Component (lê) → Server Action (muta) →
`revalidatePath`**. O chat abre a segunda exceção estrutural (a primeira foi o auth):

- Server Actions não servem para o streaming SSE contínuo que o chat exige.
- O Route Handler `/api/ia/chat` existe **somente como transporte**.
- Regras de negócio continuam em serviços internos.
- Autenticação e autorização continuam obrigatórias — e o Route Handler **não** herda a
  proteção CSRF que o Next dá a Server Action, por isso checa Origin explicitamente.
- Ferramentas não executam dentro da camada de transporte sem passar pelo Tool Executor.
- **Esta exceção não autoriza criar outros endpoints arbitrários.**

## 14. Trava de honestidade da 18-A

O prompt-base declara que nesta versão o assistente **não tem acesso aos registros do
usuário**. Perguntado sobre gasto, tarefa, refeição ou treino, ele diz que ainda não consegue
consultar e aponta o módulo — **nunca inventa número**. Isso é critério de aceite, não boa
vontade esperada do modelo.

## 15. O que é proibido em qualquer subfase

`execute_sql`, `run_code`, `call_any_endpoint`, `update_any_table`, `delete_any_record`,
`fetch_url_unrestricted`, ferramenta criada em runtime, `base_url` arbitrária, endpoint
genérico "compatível com OpenAI", `service_role` no caminho da requisição, `user_id` vindo do
cliente, e qualquer ferramenta que represente operação de banco em vez de ação de domínio.

## 16. Dependências novas

**npm (6):** `ai`, `@ai-sdk/openai`, `@ai-sdk/google`, `@ai-sdk/anthropic`, `@ai-sdk/xai`,
`server-only`.

**Ambiente (2):** `AI_MASTER_KEYS`, `AI_MASTER_KEY_CURRENT`.

Sem eles o módulo degrada com elegância, no mesmo espírito do Google Agenda e do Cron.
