# Fase 18-A — IA · Fundação, provedores e chat

> Primeira das **6 subfases** da Fase 18. **Nenhuma depende dela ainda; ela depende do
> sistema inteiro estar estável** (Fases 01–17 concluídas).
> Desenho completo em `docs/superpowers/specs/2026-08-04-modulo-ia-design.md`.

## Contexto

O sistema tem 17 fases concluídas e está em manutenção. A Fase 18 acrescenta um módulo central
em `/ia` que transforma a IA em assistente pessoal integrada — mas **integração é a última
coisa a ser construída, não a primeira.**

Esta subfase constrói a fundação e para antes de encostar nos dados. É proposital: a camada de
segurança precisa existir, estar testada e ser difícil de furar **antes** de existir a primeira
leitura do seu financeiro, da sua dieta ou dos seus treinos. Um módulo de IA que nasce com
acesso aos dados e ganha segurança depois nunca fica seguro.

O risco desta subfase não é a IA responder mal. É **vazar chave de API**, **estourar
orçamento** e **deixar registro inconsistente** — três coisas que não se corrigem com um
prompt melhor.

## Objetivo

1. **Contratos internos** de IA independentes de qualquer fornecedor.
2. **Quatro adapters** (OpenAI, Gemini, Anthropic, xAI) atrás de uma única interface.
3. **Catálogos** de modelos, capacidades e preços, versionados e testáveis.
4. **Credenciais cifradas** com envelope encryption, AAD e keyring rotacionável.
5. **Chat com streaming**, cancelamento, persistência incremental e recuperação.
6. **Medição de uso por tentativa**, custo e orçamento com reserva.
7. **Fundação de segurança testada** — fronteiras, injection, schemas, rate limit.

## Dependências

Fase 01 (design system, app shell, `proxy.ts`), Fase 13 (Cron da Vercel já existente,
reaproveitado como rede de recuperação), Fase 14 (`settings`, padrões de segurança).

**Nenhuma tabela existente é alterada. Nenhuma regra de negócio existente é tocada.**

### Novas dependências npm (6)

`ai`, `@ai-sdk/openai`, `@ai-sdk/google`, `@ai-sdk/anthropic`, `@ai-sdk/xai`, `server-only`.

### Novas variáveis de ambiente (2)

```txt
AI_MASTER_KEYS        = "1:<base64 de 32 bytes>,2:<base64 de 32 bytes>"
AI_MASTER_KEY_CURRENT = 2
```

Sem elas o módulo degrada com elegância (ver "Fail-closed só para IA").

## Escopo

### Entrega

- Fundação arquitetural (`src/lib/ai/` completo, com `tools/` vazio).
- Provider adapters dos quatro provedores.
- Catálogo de modelos, de capacidades e de preços versionado.
- Configuração dos quatro provedores em **Configurações** (seção "Inteligência Artificial").
- Criptografia das credenciais + teste de conexão.
- Conversas, mensagens, streaming SSE, cancelamento.
- Persistência incremental e recuperação de estados abandonados.
- Medição de uso por tentativa, cálculo de custo, controle de orçamento, rate limit.
- Fallback controlado entre provedores compatíveis.
- Agente **Assistente Pessoal** — sem acesso a nenhum módulo.
- Módulo `/ia` com chat, conversas, configurações rápidas e consumo.
- Item "Inteligência Artificial" na sidebar.

### Fora do escopo (bloqueado até as subfases indicadas)

| Bloqueado | Libera em |
| --- | --- |
| Leituras dos módulos, ferramentas de leitura, Context Engine, fontes, agentes especializados, contexto da página | 18-B |
| Ferramentas de escrita, propostas, confirmações, idempotência de ação, desfazer, tela de ações | 18-C |
| Imagens, comprovantes, documentos, PDF/CSV/OFX/XLSX, **upload de qualquer tipo** | 18-D |
| Insights, relatórios de IA, cards no dashboard geral, resumo do dia, revisão semanal | 18-E |
| Memória, voz, automações, botão flutuante global, **notificações no sino**, busca global, retenção, pesquisa externa | 18-F |
| SQL livre, execução de código, ferramenta dinâmica, `fetch` irrestrito, `base_url` arbitrária | **nunca** |

**`/api/ia/chat` não aceita anexo na 18-A.** `attachments`, `image`, `file` e `document` são
rejeitados pelo Zod `.strict()` como campo adicional. Não há limite de quantidade de anexos,
limite de tamanho de anexo nem teste de upload nesta subfase — tudo isso é 18-D.

## Modelagem — 7 tabelas

Todas com `user_id NOT NULL`, RLS + FORCE RLS, índice em `user_id`, trigger `updated_at`,
CHECKs de status/role/provider e FK composta `(x_id, user_id)` quando apontarem entre si.

### `ai_provider_configs`

Configuração por usuário × provedor. Unique `(user_id, provider)`.

```txt
id · user_id · provider (openai|gemini|anthropic|xai)
enabled · display_name
default_model · economy_model · advanced_model · vision_model
timeout_ms · max_retries
daily_limit · monthly_limit (numeric)
fallback_allowed · fallback_order
notes · created_at · updated_at
```

**Sem `base_url`.** Endpoint oficial fica no adapter. Permitir URL arbitrária abriria SSRF,
envio da chave para domínio malicioso, vazamento de prompt e de dado pessoal, e redirect
inesperado. Endpoint alternativo, se algum dia for necessário, exige allowlist estática,
HTTPS obrigatório, host exato, bloqueio de IP privado/local, bloqueio de redirect para outro
domínio e testes de SSRF — e **não** entra nesta fase.

### `ai_provider_credentials`

Só material criptográfico. Unique `(user_id, provider)`.

```txt
id (UUID gerado no servidor ANTES de cifrar — entra no AAD)
user_id · provider
ciphertext · iv · auth_tag
wrapped_dek · dek_iv · dek_auth_tag
key_version · algorithm_version
last_four · status · last_validated_at
created_at · updated_at
```

### `ai_user_preferences`

Uma linha por usuário.

```txt
id · user_id
default_provider · default_model
confirmation_mode (seguro|equilibrado|rapido)   ← gravado agora, consumido na 18-C
allow_finance · allow_nutrition · allow_training · allow_body · allow_cross_module
allow_memory · allow_files · allow_fallback · allow_external_search
daily_budget · monthly_budget (numeric) · budget_block_on_limit
budget_alert_level_reached (int)   ← evita repetir o mesmo aviso visual
created_at · updated_at
```

As chaves de **notificação** NÃO ficam aqui: vão para `settings.notification_prefs`, porque
`filterByPrefs` (`src/lib/notifications/generate.ts`) é o único ponto do sistema onde
preferência de notificação decide (invariante 24 da 16-F). Nada disso é usado na 18-A —
o sino só entra na 18-F.

### `ai_conversations`

```txt
id · user_id · agent_id (texto, do registry estático)
title · status (ativa|arquivada) · is_favorite
last_message_at · summary · summary_version
created_at · updated_at · archived_at
```

### `ai_messages`

FK composta `(conversation_id, user_id)`.

```txt
id · conversation_id · user_id · run_id (nulo em mensagem do usuário)
role (user|assistant|system) · content · content_type
status (complete|streaming|cancelled|failed)
created_at · updated_at
```

**Não guarda** tokens, custo, latência, provedor nem modelo — a tela junta por `run_id`.

### `ai_runs`

Execução lógica da mensagem. FK composta com conversa e mensagens.

```txt
id · user_id · conversation_id · user_message_id · assistant_message_id
agent_id · prompt_version · correlation_id
selected_provider · selected_model          ← escolhidos no início
completed_provider · completed_model        ← os que efetivamente concluíram
status (reserved|streaming|completed|cancelled|failed)   ← 5 estados; ver anexo F
attempt_count · fallback_count
started_at · completed_at · total_latency_ms
last_heartbeat_at · lease_expires_at
reserved_cost (numeric) · reservation_currency · reservation_rate_version
reservation_expires_at
error_code · error_message_sanitized · cancel_reason
created_at · updated_at
```

**Não é fonte de custo individual.**

### `ai_usage_events` — uma linha por TENTATIVA

Unique **`(run_id, attempt_index)`** + FK composta `(run_id, user_id)` → `ai_runs (id, user_id)`.
Justificativa da chave no **anexo G** (`user_id` na constraint seria redundante: `run_id` já é
globalmente único e determina o usuário; quem protege contra linha de dono divergente é a FK
composta).

```txt
id · user_id · run_id · conversation_id · agent_id
attempt_index (1,2,3…) · attempt_type (PRIMARY|RETRY|FALLBACK)
provider · model_id · status · provider_request_id
started_at · completed_at · latency_ms
input_tokens · output_tokens · cached_input_tokens
usage_availability (jsonb — quais métricas o provedor realmente informou)
rate_snapshot (jsonb) · pricing_version · currency · estimated_cost (numeric)
was_fallback · error_code
created_at
```

Um run faz mais de uma chamada quando há retry, fallback de provedor, fallback de modelo,
falha após consumo parcial, tentativa que cobra antes de falhar, ou timeout depois do
provedor já ter processado parte. Uma linha por run obrigaria a sobrescrever custo, perder a
primeira tentativa, misturar tarifas ou enfiar um array na linha — nenhuma é aceitável.

**Idempotência:** insert primeiro; em `23505`, consulta e devolve a tentativa existente;
nunca recalcula, nunca soma de novo, nunca cria segundo evento. `upsert` só depois de
comprovar no banco que a constraint do `ON CONFLICT` existe — o projeto já se queimou com
`42P10` em índice parcial (aqui a constraint é total, mas a conferência continua obrigatória).

Custo do run = soma das tentativas válidas. Custo mensal = soma de todos os eventos.
`rate_snapshot` é **por tentativa**, porque fallback pode trocar provedor, modelo, moeda e
tarifa.

### Não criar nesta subfase

`ai_tool_calls`, `ai_run_steps`, `ai_action_proposals`, `ai_action_approvals`,
`ai_action_executions`, `ai_insights`, `ai_memories`, `ai_cost_rates`, `ai_budget_periods`,
`ai_provider_health_checks`. Motivo de cada uma na seção 11 do spec.

## Arquitetura

Árvore completa de `src/lib/ai/` na seção 4 do spec. Os pontos que a implementação não pode
negociar:

1. **`core/` não importa pacote de fornecedor.** Nem `ai`, nem `@ai-sdk/*`. Idem `agents/`,
   `tools/`, `context/`, `approval/`, `usage/`, `security/`.
2. **Só `providers/` importa o AI SDK.** As respostas dos quatro são normalizadas antes de
   sair dessa camada.
3. **`server/` tem `server-only` no topo de todos os arquivos.**
4. **Nada fora da allowlist importa `credential-crypto`.**
5. **Trocar o AI SDK no futuro não pode exigir mexer em agents, tools, context ou approval.**

Garantido por ESLint 9 flat config (`no-restricted-imports` por zona, que pega alias),
`server-only` (quebra o build) e um teste de rede que varre import **estático e dinâmico**
(`no-restricted-imports` não cobre `await import()`).

### A interface interna normaliza

Streaming · texto · tool calls · saídas estruturadas · imagens · arquivos · tokens ·
finish reason · erros · latência · identificação do modelo · cancelamento · metadados de custo.

Imagens, arquivos e tool calls fazem parte do **contrato** desde já, mas não têm caminho de
execução na 18-A.

### Fluxo de uma mensagem

Detalhado na seção 6 do spec. Resumo dos pontos travados:

- O Route Handler é **transporte apenas**.
- Provedor e modelo pedidos pelo cliente são **preferência**, nunca ordem. O backend confirma
  que o provedor está no registry, ativo para o usuário, com credencial existente e válida;
  que o modelo está no catálogo, habilitado e com as capacidades exigidas.
- O início é **atômico** (ver abaixo).
- Dado recuperado nunca entra como mensagem de sistema.
- A credencial é decifrada **só no instante da chamada**, em memória, para uma chamada.
- Toda chamada tem **limite explícito de saída**.

### `ai_begin_chat_run` — início atômico

Uma transação, tudo ou nada. Verificar limite e inserir `ai_runs` deixando as mensagens para
inserts independentes produziria run sem mensagem, mensagem do usuário sem run, mensagem do
assistente não criada, conversa criada pela metade e reserva financeira presa.

```txt
1. auth.uid()  → rejeita NULL
2. advisory lock por usuário: hashtextextended('ai-run:' || auth.uid()::text, 0)
3. reconcilia reservas vencidas do próprio usuário
4. valida rate limit (janela lida pelo banco)
5. valida orçamento: confirmado + reservas ativas não expiradas + nova reserva ≤ limite
6. valida ou cria a conversa (precisa ser do usuário)
7. insere a mensagem do usuário
8. insere o ai_run com a reserva financeira
9. insere a mensagem do assistente em `streaming`
10. devolve conversation_id, user_message_id, run_id, assistant_message_id
```

Endurecimento obrigatório:

```txt
SECURITY INVOKER · VOLATILE · SET search_path = ''
schema explícito em toda tabela, função e tipo
REVOKE ALL FROM PUBLIC · REVOKE ALL FROM anon · GRANT EXECUTE TO authenticated
```

**Não aceita do cliente:** `user_id`, `owner_id`, limite mensal, consumo acumulado, contagem
da janela. Tudo lido pelo banco.

**A segurança não depende do Route Handler.** Um usuário autenticado pode chamar o RPC
direto, então a função valida sozinha: tamanho da mensagem, conversa pertencente ao usuário,
status permitido, provedor válido, campos obrigatórios, reserva não negativa, datas válidas.

O advisory lock é por usuário, transacional, não sobrevive a commit/rollback e não colide
intencionalmente com outros módulos. A possibilidade de colisão do hash deve ser considerada e
documentada no comentário da função.

### Reserva de orçamento

O advisory lock resolve a corrida na *quantidade* de runs, não na de orçamento: duas
requisições podem ver o mesmo consumo confirmado e ambas passarem enquanto a primeira ainda
não gerou evento de uso.

A reserva é calculada no servidor **antes** da função, a partir do modelo selecionado, da
tarifa atual, do tamanho estimado da entrada, do limite máximo de saída definido para a chamada
e de margem conservadora documentada. Na 18-A só há texto — não se reserva custo de imagem ou
arquivo.

Ao concluir: a reserva deixa de contar e vale o custo real; os dois nunca somam juntos.
Ao falhar ou cancelar: registra o consumo informado e libera o saldo não utilizado; se o
provedor não informar consumo, registra **indisponibilidade explícita** e aplica a política
conservadora documentada — nunca vira zero silencioso. Fallback **não** ganha orçamento novo.

### Recuperação — SLA declarado

| Parâmetro | Valor |
| --- | --- |
| Cadência real do Cron (`vercel.json`, verificado) | `0 12 * * *` e `0 0 * * *` — **2×/dia, 09h e 21h BRT, 12 h de intervalo** |
| `last_heartbeat_at` | no máximo a cada 10 s durante o streaming; nunca por token |
| Abandonado | heartbeat vencido há mais de 5 min |
| Reconciliação **preguiçosa** (primária) | ao abrir `/ia`, ao listar conversas e **antes de reservar novo run** |
| Reconciliação em lote (rede) | carona no Cron de notificações; pior caso **12 h** |
| Lote máximo | 200 runs por execução |
| Concorrência | `UPDATE ... WHERE status IN ('reserved','streaming') AND last_heartbeat_at < limite` |

A varredura **não** pode fechar uma resposta legítima que esteja demorando — só fecha com
heartbeat realmente vencido, sem sinal recente de atividade, e por update condicional ao
estado anterior. `finally` e reconciliador nunca produzem estados contraditórios porque ambos
são condicionais: quem chegar primeiro vence, o outro é no-op.

**Risco assumido:** 12 h é o pior caso do Cron. Por isso a preguiçosa é primária — em
especial a que roda antes de reservar novo run, que impede um run travado de bloquear a
próxima conversa ou prender orçamento. `vercel.json` **não é alterado** nesta subfase.

### Fail-closed só para IA

| Situação | Comportamento |
| --- | --- |
| `AI_MASTER_KEYS` ausente | O resto do sistema funciona normalmente. `/ia` mostra "Inteligência Artificial não configurada. Configure `AI_MASTER_KEYS` e `AI_MASTER_KEY_CURRENT` no ambiente do servidor." Ações de credencial desabilitadas. `/api/ia/chat` → `503 AI_CRYPTO_NOT_CONFIGURED` |
| Presente mas inválido | Módulo de IA indisponível; nenhuma credencial salva ou decifrada; erro operacional sanitizado registrado; a tela informa configuração inválida sem revelar detalhe sensível; resto do sistema intacto |

**Nunca:** completar chave curta com padding, derivar chave de senha humana, ignorar versão
ausente, escolher outra versão em silêncio, ou derrubar build/import de módulos não
relacionados. A validação roda em serviço de readiness **server-side**, nunca parsing em
código client.

## Ferramentas autorizadas

**Nenhuma.** O Tool Registry nasce vazio.

- Nenhuma definição de ferramenta é enviada ao provedor.
- Nenhum executor está habilitado.
- Se mesmo assim o provedor devolver evento estruturado de tool call: **não executar, não
  interpretar como ferramenta válida, não deixar o run seguir como se nada tivesse
  acontecido.** O run encerra de forma segura como `failed`, com
  `error_code = 'UNEXPECTED_TOOL_CALL'` e detalhe sanitizado em `ai_runs`.
- **Não** antecipar `ai_tool_calls` só para registrar isso.

## Regras de confirmação

Não se aplicam à 18-A: não há escrita. `ai_user_preferences.confirmation_mode` é **gravado**
para a UI de Configurações existir completa, mas **nenhum código o consome** nesta subfase.
A Approval Engine é 18-C.

## Regras de segurança

### Route Handler `/api/ia/chat`

Autenticação obrigatória · verificação de Origin/`Sec-Fetch-Site` (Route Handler **não** herda
a proteção CSRF que o Next dá a Server Action) · rate limit por usuário · limite do corpo HTTP
· limite da mensagem textual · limite do histórico enviado ao provedor · timeout ·
`AbortSignal` · Zod `.strict()` · erros normalizados · correlation ID · nenhum segredo em
resposta ou log · nenhum `user_id` aceito do cliente · nenhum provedor ou modelo arbitrário
sem validação contra o registry.

Payload aceito — **e nada além disto**:

```txt
conversationId? · text · agentId? · providerPreference? · modelPreference?
```

### Credenciais

`server-only` · AAD `credential_id | owner_id | provider | key_version` nas duas camadas do
envelope · `credential_id` gerado no servidor **antes** de cifrar · IV aleatório e exclusivo
por operação · authentication tag verificada · keyring com N versões · decifra pela
`key_version` da linha, cifra sempre pela corrente · rotação re-embrulha só as DEKs · chave
decifrada vive em memória para uma chamada e não vai para variável de módulo, cache, log,
resposta ou telemetria · queries da UI com colunas explícitas, **nunca `select('*')`**.

### Dados não confiáveis

Separação por papel de mensagem · estrutura JSON quando possível · limite de tamanho ·
sanitização · origem explícita · campos desnecessários removidos · **nenhum dado recuperado
entra como mensagem de sistema** · resultado de ferramenta entra como resultado de ferramenta
· documento e imagem marcados como não confiáveis · instrução encontrada dentro de registro,
documento ou imagem **não altera as regras do agente** · tool calls continuam limitados pelo
backend independentemente do texto produzido pelo modelo.

### Fallback classificado

As 10 classes de erro: autenticação inválida · modelo indisponível · rate limit · timeout ·
erro temporário · conteúdo rejeitado · contexto excedido · erro de schema · erro permanente ·
cancelamento pelo usuário.

| Classe | Fallback |
| --- | --- |
| Chave inválida | **Nunca** — não adianta tentar outro modelo com a mesma credencial |
| Cancelamento pelo usuário | **Nunca** |
| Conteúdo rejeitado | **Nunca** — não se contorna política tentando provedores em sequência |
| Erro de schema | Corrigir ou falhar com segurança |
| Rate limit · timeout · erro temporário | Só se `fallback_allowed` estiver ligado |
| Modelo indisponível · contexto excedido | Só para destino **compatível** em capacidade e orçamento |

Todo fallback é registrado e o provedor que respondeu aparece na tela. Fallback **não** ganha
orçamento novo. Fallback **não** repete escrita — irrelevante na 18-A (não há escrita), mas o
contrato já reserva o campo de idempotência para a 18-C.

## Trava de honestidade

O prompt-base declara que nesta versão o assistente **não tem acesso aos registros do
usuário**. Perguntado sobre gasto, tarefa, refeição ou treino, ele responde que ainda não
consegue consultar e aponta o módulo correspondente — **nunca inventa número**. É critério de
aceite, não boa vontade esperada do modelo.

## Plano de implementação

1. **Dependências e ambiente** — 6 pacotes npm, `.env.local.example`, zonas do ESLint.
2. **Migrations (2)** — `..._ai_foundation.sql` (7 tabelas) e `..._ai_begin_chat_run.sql`
   (função). `get_advisors` com **0 lints** e `src/types/supabase.ts` regenerado.
3. **`core/`** — contratos, capacidades, catálogo de modelos, preços, router, fallback,
   errors, result. **Consultar a documentação oficial vigente de cada provedor** e gravar
   `verified_at` por entrada.
4. **`providers/`** — registry, factory, os 4 adapters, mapa de erros.
5. **`server/crypto-readiness` + `credential-crypto` + `credential-store`.**
6. **`usage/`** — meter, reservation, budget. **`security/`** — untrusted, redact, rate-limit.
7. **`server/run-store` + `reconcile` + `chat-runner`.**
8. **`/api/ia/chat`** — o transporte.
9. **Actions e validators** — conversas, provedores, preferências.
10. **UI** — `/ia` (chat, conversas, configurações rápidas, consumo), cards em Configurações,
    item na sidebar.
11. **Testes** — na ordem da seção seguinte.
12. **Documentação** — `CURRENT_STATUS`, `LAST_PHASE_SUMMARY`, `NEXT_AGENT_INSTRUCTIONS`,
    `PROJECT_ARCHITECTURE`, `CLAUDE.md`.

## Critérios de aceite

> A cobertura é o que importa, não o número. Acrescente critério se a implementação revelar
> caso não previsto; **não remova** para fechar a lista.

### Fundação e fronteira

1. `core/` não importa nenhum pacote de fornecedor — provado por ESLint **e** por teste.
2. Só `providers/` importa o AI SDK.
3. `agents/`, `tools/`, `usage/` e `security/` não importam SDK de fornecedor.
4. Nenhum arquivo client alcança `server/` (o build quebra se tentar).
5. Nenhum arquivo fora da allowlist importa `credential-crypto`.
6. A regra estática pega alias de path e o teste pega import dinâmico.

### Provedores

7. Os quatro respondem pela mesma interface interna.
8. Erro dos quatro cai nas 10 classes normalizadas, já sanitizado.
9. Capacidade respeitada: modelo sem visão não recebe imagem; sem tool calling não recebe
   ferramenta.
10. Modelo fora do catálogo é recusado antes de qualquer chamada.
11. Provedor fora do registry é recusado.
12. Provedor sem credencial válida é recusado com erro tipado.

### Catálogos

13. Modelos e preços conferidos na **documentação oficial vigente de cada provedor durante a
    implementação**, com `verified_at` gravado por entrada.
14. Preço não aparece em nenhum outro lugar do código.
15. Cada tentativa guarda `rate_snapshot`; alterar o preço depois **não** muda custo histórico.
16. Custo em `numeric`, com moeda e versão de tarifa registradas.
17. Modelo desativado permanece no histórico.

### Credenciais

18. Ciclo cifrar/decifrar íntegro.
19. IV distinto a cada operação sobre o mesmo segredo.
20. Authentication tag adulterada falha.
21. AAD inválido falha.
22. Ciphertext movido para outro provedor, outra credencial ou outro dono falha.
23. `key_version` desconhecida devolve erro tipado (não "chave inválida" genérico).
24. Chave errada falha.
25. Keyring resolve duas versões durante rotação controlada.
26. A query da tela devolve só `provider`, `status`, `last_four`, `last_validated_at`,
    `updated_at` — e **não** contém `ciphertext`, `wrapped_dek`, `iv` nem `auth_tag`.
27. A chave completa não aparece em resposta de API, log ou telemetria.
28. "Testar conexão" grava `last_validated_at` sem revelar nada.

### Master key

29. Ausência do keyring desativa **somente** a IA; o resto da aplicação continua funcional.
30. Configuração inválida desativa **somente** a IA.
31. Nenhuma credencial pode ser salva sem keyring válido.
32. Chave curta não é completada com padding; senha humana não vira master key; versão
    ausente não é ignorada nem substituída em silêncio.

### Chat

33. Sem sessão → 401.
34. Origin inválida → 403.
35. Corpo HTTP, mensagem textual ou histórico acima do limite → 413.
36. Campo extra (`user_id`, `owner_id`, `attachments`, `image`, `file`, `document`) → 400.
37. Streaming completo persiste as linhas na ordem certa e fecha todos os estados.
38. Cancelar deixa `cancelled` com motivo e o texto parcial conforme a política declarada.
39. Erro deixa `failed` com mensagem sanitizada.
40. Queda do cliente equivale a cancelamento.
41. Recarregar a página no meio do streaming não perde a conversa.

### Início atômico

42. Falha ao inserir qualquer linha causa **rollback total**.
43. Não existe run sem mensagens.
44. Não existe mensagem de assistente sem run.
45. Não existe reserva sem run válido.
46. Conversa de outro usuário é rejeitada.
47. A função rejeita `auth.uid() IS NULL` e não aceita `user_id`, limite, consumo ou contagem
    de janela vindos do cliente.

### Uso por tentativa

48. Retry cria **segundo** evento de uso.
49. Fallback cria **segundo** evento de uso.
50. Os custos das duas tentativas são preservados.
51. Tarifas diferentes não são misturadas.
52. Reexecução da mesma tentativa gera `23505` e devolve o evento existente.
53. O total do run é a soma correta das tentativas.
54. Métrica não devolvida pelo provedor é **"indisponível", nunca 0**.

### Reserva e orçamento

55. Duas chamadas concorrentes perto do limite **não** ultrapassam a reserva disponível.
56. Run em streaming conta no orçamento pela reserva.
57. Run concluído deixa de contar pela reserva e passa a contar pelo custo real — nunca os
    dois ao mesmo tempo.
58. Run cancelado libera o saldo não utilizado.
59. Run expirado não bloqueia chamadas futuras.
60. Fallback não ganha orçamento novo sem validar o restante.
61. Toda chamada tem limite explícito de saída.
62. Alertas visuais em 70%, 80%, 90% e 100%, sem repetir o mesmo nível.
63. Bloqueio em 100% acontece **antes** de chamar o provedor.
64. Nenhuma notificação no sino nesta subfase.

### Recuperação

65. Heartbeat recente **impede** encerramento pelo reconciliador.
66. Lease vencido permite encerramento.
67. `finally` e reconciliador concorrentes não produzem estados contraditórios.
68. O reconciliador é idempotente.
69. Reservas vencidas deixam de contar no orçamento.
70. A reconciliação preguiçosa roda antes de reservar novo run.

### Rate limit

71. Duas requisições concorrentes na borda do limite não ultrapassam (advisory lock).
72. O limite é lido pelo banco, nunca informado pelo cliente.

### Segurança e ferramentas

73. Texto de prompt injection em qualquer entrada não altera comportamento nem provoca tool
    call.
74. Nenhuma definição de ferramenta é enviada ao provedor.
75. Tool call inesperada encerra o run como `failed` com `UNEXPECTED_TOOL_CALL` sanitizado, sem
    executar nada e sem seguir como se nada tivesse ocorrido.
76. Tentativa de fazer o modelo produzir SQL não gera execução alguma.
77. Nenhuma query de módulo (`finance/`, `todo/`, `nutrition/`, `training/`, …) é importada
    por `src/lib/ai/`.

### Trava de honestidade

78. Perguntado sobre dado de módulo, o assistente diz que ainda não consegue consultar e
    aponta o módulo — não inventa número.

### Transversais do projeto

79. pt-BR em toda a UI; BRL e datas no formato brasileiro.
80. Dark e light funcionando; responsividade real em desktop, tablet e celular.
81. RLS + FORCE RLS nas 7 tabelas, testada pela role `authenticated` (não pelo SQL editor como
    `postgres`, que ignora RLS).
82. `npm run lint && npx tsc --noEmit && npm run test:run && npm run build` verdes.
83. Suíte verde também em `TZ=UTC`.
84. Rotas privadas → 307 `/login`; `/api/cron/*` → 401 sem segredo.

## Testes

**Puros (Vitest, sem banco):** `router`, `fallback`, `capabilities`, `pricing`, `meter`,
`reservation`, `budget`, `rate-limit`, `untrusted`, `redact`, `errors`, keyring e
`credential-crypto` (os 8 casos de 18 a 25), fronteira de imports (estático e dinâmico),
transições de estado do run cobrindo os quatro finais, cálculo de custo por tentativa e soma
do run.

**Contratuais dos 4 adapters** com provedor **mockado** — nenhuma chamada paga em CI. Cobrem:
configurado, chave inválida, timeout, limite, modelo inexistente, modelo sem visão, modelo sem
tool calling, fallback compatível, fallback incompatível, streaming, cancelamento.

**De segurança:** `user_id`/`owner_id` extra rejeitado; provedor fora do registry rejeitado;
modelo fora do catálogo rejeitado; tool call na 18-A rejeitada; tentativa de SQL rejeitada;
prompt injection não altera comportamento (incluindo o caso "descrição de tarefa que manda
ignorar as regras e chamar `finance.delete_all_transactions`" — o texto é tratado como
conteúdo, a resposta pode mencionar que encontrou, mas não obedece).

**De banco (com rollback, role `authenticated`):** RLS das 7 tabelas; a função rejeitando
`auth.uid()` nulo e conversa alheia; unicidade `(run_id, attempt_index)`; atomicidade
do `ai_begin_chat_run`; update condicional das transições.

## Riscos

| Risco | Mitigação |
| --- | --- |
| Catálogo de modelos envelhece | `verified_at` por entrada + aviso na tela quando a verificação estiver velha; atualizar é editar arquivo puro |
| `maxDuration` da Vercel corta um streaming longo | Timeout do servidor **menor** que o da plataforma, para o encerramento ser nosso e o estado ficar consistente |
| **Pior caso de 12 h na varredura do Cron** | Cadência real verificada em `vercel.json`. Recuperação preguiçosa é a primária, em especial antes de reservar novo run. Se um dia for preciso reduzir, avaliar o limite do plano da Vercel — `vercel.json` não é alterado aqui |
| AI SDK muda de API | `providers/` é a única camada exposta |
| Custo real acima do esperado | Orçamento verificado **antes** da chamada, na mesma transação que reserva o run; limite explícito de saída em toda chamada |
| Reserva conservadora demais bloqueia uso legítimo | Margem documentada e ajustável nas preferências; reserva encerra assim que o custo real chega |
| Rotação de chave feita errado tira o acesso | Keyring com N versões, rotação documentada, re-embrulho explícito e reversível |
| Módulo grande vira "chat que mente" | Trava de honestidade é critério de aceite (78) |
| Colisão do hash do advisory lock | Namespace `'ai-run:'` exclusivo do módulo, considerada e documentada no comentário da função |

## Instruções para o agente seguinte

**Leia antes de tocar em código:** `docs/superpowers/specs/2026-08-04-modulo-ia-design.md`
(desenho completo), `docs/project/PROJECT_RULES.md`, `docs/project/PROJECT_ARCHITECTURE.md`,
`CLAUDE.md` (em especial "Layout responsivo — 5 regras que vieram de bugs reais") e este
arquivo inteiro.

**Não faça:** deploy · migration em produção sem seguir o padrão do projeto · exposição de
qualquer chave · segredo no repositório · implementação de mais de uma subfase por vez ·
redução silenciosa de requisito.

**Ao terminar:** valide os critérios **um a um**, atualize `CURRENT_STATUS.md`,
`LAST_PHASE_SUMMARY.md` e `NEXT_AGENT_INSTRUCTIONS.md`, e aponte a **18-B** como próxima com o
caminho exato do arquivo.

**A 18-B só começa com a 18-A fechada e verificada.**

---

# Anexos técnicos

> Fechamento documental exigido antes da autorização de implementação (revisão de 2026-08-04).
> Onde um anexo contradisser o corpo do arquivo, **o anexo vence** — ele é posterior.

## A. Advisory lock e duração da transação

| Item | Decisão |
| --- | --- |
| Função | **`pg_advisory_xact_lock`** — transacional. **Nunca** `pg_advisory_lock` (de sessão): num pool de conexões, lock de sessão sobrevive à requisição e vaza para a próxima que pegar aquela conexão |
| Chave | `pg_advisory_xact_lock(hashtextextended('ai:begin_run:' \|\| auth.uid()::text, 0))` — determinística, derivada só do usuário autenticado, com namespace `ai:begin_run:` exclusivo do módulo |
| Recurso serializado | A **decisão de admissão** de um usuário: janela de rate limit + orçamento + reserva + criação do run. Nada além disso |
| Colisão de hash | 64 bits. Uma colisão faria dois usuários diferentes serializarem a admissão entre si — **perda de paralelismo, nunca de correção**, porque o lock é mutex e não carrega dado. Em sistema single-user o efeito prático é nulo. Registrado no comentário da função |
| Dois chats simultâneos do mesmo usuário | **Podem, sim.** Eles serializam apenas na admissão (milissegundos); depois do commit os dois streams correm em paralelo. O lock não limita conversas concorrentes — limita decisões de admissão concorrentes |

### O lock cobre exatamente isto, e nada mais

```txt
BEGIN
  pg_advisory_xact_lock(...)          ← entra aqui
  reconciliar reservas vencidas do usuário
  validar rate limit
  validar orçamento
  calcular/gravar reserva
  criar conversa (se nova) + mensagem do usuário + run + mensagem do assistente
COMMIT                                ← sai aqui, automaticamente
──────────────────────────────────────────────────────────────
(fora de qualquer transação e de qualquer lock)
  decifrar credencial → chamar o provedor → streaming → heartbeat → gravar tentativa
```

**Confirmação explícita:** nenhum lock e nenhuma transação permanecem abertos durante a
decifragem da credencial, a chamada ao provedor, o streaming ou qualquer espera por rede. O
commit acontece **antes** de a primeira chamada externa ser emitida. Manter transação aberta
durante streaming prenderia conexão do pool por minutos e é o modo mais fácil de derrubar o
banco inteiro — está proibido.

### Timeout e rollback

- `SET LOCAL lock_timeout = '3s'` e `SET LOCAL statement_timeout = '5s'` dentro da função.
- Timeout do lock → erro → **rollback total**: nenhuma mensagem, nenhum run, nenhuma reserva.
- O Route Handler traduz para erro tipado (`ADMISSION_BUSY`) e devolve **429** com
  `Retry-After`. Não é 500: não houve falha, houve concorrência.
- O rollback libera o advisory lock automaticamente, por ele ser transacional.

## B. Moeda canônica — USD, sem câmbio na 18-A

Os quatro provedores publicam preço em **USD**. Implementar BRL exigiria fonte de câmbio,
snapshot da taxa, versão, timestamp e política de taxa ausente — uma segunda fonte de verdade
inteira, para um número que **não é cobrança oficial**.

| Campo | Moeda na 18-A |
| --- | --- |
| `ai_usage_events.currency` | `'USD'`, com `CHECK (currency = 'USD')` |
| `ai_usage_events.estimated_cost` | USD, `numeric(12,6)` |
| `ai_runs.reserved_cost` · `reservation_currency` | USD |
| `ai_user_preferences.daily_budget` · `monthly_budget` | USD |

A UI exibe em USD e escreve, no próprio card, que é **estimativa do sistema, não cobrança do
provedor, e que não há conversão para BRL**. O BRL do projeto continua sendo do módulo
financeiro — custo de IA não é transação do usuário e **não entra** nos relatórios de finanças.

**Câmbio fica para a 18-F**, se desejado, com tabela própria (fonte, valor, timestamp, versão)
e snapshot por evento, pelo mesmo princípio do `rate_snapshot`.

### Ausência nunca é custo zero

| Falta | Comportamento |
| --- | --- |
| Tarifa do modelo não cadastrada | **O modelo não é selecionável.** O router recusa antes de qualquer chamada — não existe caminho para uso sem preço |
| Provedor não informa tokens | `input_tokens`/`output_tokens` = `NULL`, `usage_availability` marca `unavailable`, `estimated_cost` = **`NULL`** |
| Provedor informa só parte | Os campos informados são gravados; os demais `NULL`; `estimated_cost` = **`NULL`** (não se estima parcialmente) |
| Custo `NULL` no orçamento | O run continua contabilizado pela **reserva** até ser reconciliado; a reserva não é liberada para custo desconhecido dentro do período corrente (política conservadora, cenário 15) |

Em nenhum caminho `NULL` vira `0`.

## C. Ciclo da reserva — matriz de cenários

### O invariante, escrito de forma verificável

```txt
TERMINAIS     = {completed, cancelled, failed}
NÃO-TERMINAIS = {reserved, streaming}

consumo_do_periodo(user, período) =
      Σ  estimated_cost  das tentativas de runs em estado TERMINAL no período
    + Σ  reserved_cost   dos runs em estado NÃO-TERMINAL com reserva não expirada

INVARIANTE: todo run pertence a EXATAMENTE UM dos dois somatórios.
```

Enquanto o run é não-terminal, **só a reserva conta** — mesmo que a tentativa 1 já tenha custo
gravado. Isso é seguro porque a reserva cobre o pior caso permitido (anexo D). Ao virar
terminal, a reserva deixa de contar e valem os custos reais das tentativas.

**Teste que prova o invariante:** para todo run do período, `(run é terminal) XOR (run é
contado como reserva)` é verdadeiro, e nenhum run contribui com os dois. Um segundo teste soma
o orçamento por duas vias independentes e exige igualdade.

### Matriz

| # | Cenário | `ai_runs.status` | Tentativa | Reservado | Custo confirmado | Reserva liberada quando | Nova tentativa? | Operação transacional |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Reserva criada | `reserved` | nenhuma | R | — | — | — | `ai_begin_chat_run` (commit) |
| 2 | Chamada ainda não iniciada | `reserved` | nenhuma | R | — | — | — | nenhuma (estado de repouso) |
| 3 | Chamada iniciada | `reserved` | 1 `started` | R | — | — | — | insert da tentativa |
| 4 | Primeiro delta recebido | `streaming` | 1 `started` | R | — | — | — | update condicional do run |
| 5 | Sucesso | `completed` | 1 `completed` | 0 | Σ tentativas | **no commit do fechamento** | não | update run + tentativa, mesma transação |
| 6 | Cancelamento **antes** do provedor | `cancelled` | nenhuma | 0 | 0 (nada foi chamado) | no fechamento | não | update condicional do run |
| 7 | Cancelamento **durante** o streaming | `cancelled` | 1 `cancelled` | 0 | uso informado até ali | no fechamento | não | update run + tentativa |
| 8 | Erro sem uso | `failed` | 1 `failed`, custo `NULL` | 0 | `NULL` (indisponível) | no fechamento | conforme fallback | update run + tentativa |
| 9 | Erro com uso parcial | `failed`, ou segue p/ 10 | 1 `failed`, custo gravado | R (se seguir) | parcial | só ao terminalizar | conforme fallback | update tentativa |
| 10 | Retry (mesmo modelo) | `streaming` | 2 `RETRY started` | R (**a mesma**) | — | — | sim | insert da tentativa 2 |
| 11 | Fallback (outro modelo/provedor) | `streaming` | 2 `FALLBACK started` | R (**a mesma**) | — | — | sim | insert da tentativa 2 |
| 12 | Timeout | `failed`, ou segue p/ 10/11 | tentativa `failed` com `TIMEOUT` | R (se seguir) | uso informado, se houver | ao terminalizar | conforme fallback | update tentativa |
| 13 | Queda do processo | `reserved`/`streaming` **preso** | última tentativa presa em `started` | R | desconhecido | **só na reconciliação** | não | nenhuma — ninguém fechou |
| 14 | Run abandonado (lease vencido) | idem, ainda não reconciliado | idem | R | desconhecido | ainda não | não | nenhuma |
| 15 | Reconciliação | `failed` + `error_code='ABANDONED'` | tentativa presa → `failed`, custo `NULL` | 0 | **`NULL`, marcado indisponível** | no update da reconciliação | não | `UPDATE ... WHERE status IN ('reserved','streaming') AND last_heartbeat_at < limite` |
| 16 | Uso informado tardiamente | terminal, **imutável** | — | 0 | inalterado | — | não | **nenhuma — retificação proibida** (anexo G) |

**O cenário 15 é o caso conservador.** O run vira terminal com custo `NULL`: sai do somatório
das reservas e entra no dos terminais valendo `NULL` — ou seja, some do orçamento. É uma
subestimação consciente e declarada na UI ("custo indisponível em N execuções do período"),
preferível a inventar valor. A reserva já protegeu o orçamento **durante** o período em que o
resultado era desconhecido, que é quando a proteção importa.

## D. Fórmula da reserva

```txt
reserved_cost = arredonda_para_cima(
      ( tokens_entrada_estimados × tarifa_entrada_do_pior_modelo
      + limite_maximo_de_saida   × tarifa_saida_do_pior_modelo   )
    × multiplicador_de_tentativas
    × margem_de_seguranca
)

tokens_entrada_estimados     heurística documentada sobre o prompt JÁ MONTADO
                             (conservadora; nunca sobre o texto cru do usuário)
limite_maximo_de_saida       o teto explícito enviado ao provedor — sempre existe
pior_modelo                  o MAIS CARO do conjunto permitido = modelo selecionado
                             + toda a cadeia de fallback autorizada para esta chamada
multiplicador_de_tentativas  1 + max_retries + max_fallbacks (limitado pela config)
margem_de_seguranca          1,15 — documentada e ajustável nas preferências
```

**Por que a tarifa do pior modelo:** o fallback **não recebe segunda reserva**. Reservando pela
tarifa mais cara da cadeia autorizada, qualquer fallback permitido já está coberto no momento
da admissão. Como segunda barreira, o executor **recusa** um fallback cujo custo projetado
ultrapasse a reserva restante — os dois mecanismos convivem.

| Caso de borda | Regra |
| --- | --- |
| Modelo sem preço cadastrado | **Não é selecionável** — nem como principal, nem como destino de fallback |
| Modelo que não permite limitar a saída | **Não é utilizável na 18-A** — toda chamada exige teto explícito |
| Métrica não suportada pelo provedor | Não afeta a reserva (ela é a priori); afeta a medição (anexo B) |
| Reserva maior que o orçamento restante | Admissão **recusada** antes de qualquer chamada |

### Exemplos numéricos

> ⚠️ **Tarifas ilustrativas**, escolhidas para demonstrar a aritmética. As reais entram em
> `core/pricing.ts` durante a implementação, conferidas na documentação oficial vigente de
> cada provedor, com `verified_at` gravado.
>
> Modelo **A** (selecionado): US$ 1,00 por milhão de entrada · US$ 5,00 por milhão de saída
> Modelo **B** (fallback autorizado, mais caro): US$ 3,00 por milhão · US$ 15,00 por milhão
> Entrada estimada: 4.000 tokens · Teto de saída: 2.000 tokens
> `max_retries` = 1 · `max_fallbacks` = 1 → multiplicador = 3 · margem = 1,15

```txt
Reserva (pior modelo = B), a mesma nos quatro casos:
  base = 4.000/1e6 × 3,00 + 2.000/1e6 × 15,00 = 0,012000 + 0,030000 = 0,042000
  reserved_cost = 0,042000 × 3 × 1,15 = 0,144900 USD
```

**1 — Sucesso sem retry**

```txt
tentativa 1 PRIMARY, modelo A: 4.100 entrada / 900 saída
  0,004100 + 0,004500 = 0,008600 USD
run → completed · reserva 0,144900 liberada · confirmado 0,008600
```

**2 — Retry no mesmo modelo**

```txt
tentativa 1 PRIMARY A: 4.100 / 300   → 0,004100 + 0,001500 = 0,005600  (falhou)
tentativa 2 RETRY   A: 4.100 / 950   → 0,004100 + 0,004750 = 0,008850  (ok)
run → completed · confirmado 0,014450 · nenhuma segunda reserva foi criada
```

**3 — Fallback para modelo mais caro**

```txt
tentativa 1 PRIMARY  A: 4.100 / 0     → 0,004100 + 0,000000 = 0,004100  (timeout)
tentativa 2 FALLBACK B: 4.100 / 1.800 → 0,012300 + 0,027000 = 0,039300  (ok)
run → completed · confirmado 0,043400 · abaixo de 0,144900 ✓
```

**4 — Cancelamento com uso parcial**

```txt
tentativa 1 PRIMARY A: 4.100 / 620 → 0,004100 + 0,003100 = 0,007200
usuário cancela · run → cancelled · tentativa → cancelled
reserva liberada no fechamento · confirmado 0,007200
```

## E. Validações internas de `ai_begin_chat_run`

Executadas **pela função**, independentemente do Route Handler — porque um usuário autenticado
pode chamar o RPC direto:

1. `auth.uid()` não nulo — senão erro imediato.
2. Conversa, quando informada, **existe e é do usuário**.
3. Conversa em estado permitido (não arquivada).
4. `agent_id` dentro do conjunto permitido na 18-A (só o Assistente Pessoal).
5. Provedor existe, está **ativo**, e a linha de configuração é **do usuário**.
6. Credencial existe para aquele provedor e está em estado utilizável.
7. Modelo pertence ao provedor e tem as capacidades exigidas pela requisição.
8. Preferência de provedor/modelo do cliente tratada **só como preferência** — o valor final é
   o que a função validou, e é ele que vai para `selected_provider`/`selected_model`.
9. Rate limit: contagem da janela lida **pelo banco**, nunca recebida.
10. Orçamento: limite e consumo lidos **pelo banco**, nunca recebidos.
11. `reserved_cost` não negativo, moeda `USD`, expiração no futuro.
12. Tamanho da mensagem dentro do limite.
13. **Ownership de todos os IDs recebidos** — nenhum ID entra sem checagem.
14. Datas válidas e coerentes.
15. **Anti-enumeração:** "não existe" e "não é seu" devolvem **o mesmo código genérico**
    (`CONVERSATION_NOT_AVAILABLE`). Códigos distintos transformariam a função em oráculo de
    existência de IDs.

### Como as camadas se somam (nenhuma basta sozinha)

| Camada | Cobre | **Não** cobre |
| --- | --- | --- |
| `GRANT`/`REVOKE` | Impede `anon` e `PUBLIC` de executar | Nada sobre *quais linhas* um `authenticated` alcança |
| RLS | Filtra as linhas que os comandos **da própria função** enxergam | Precondição de negócio, coerência entre linhas, e **não diferencia "não existe" de "não é seu"** |
| FORCE RLS | Garante que nem o dono da tabela escapa | Idem |
| `SECURITY INVOKER` | Faz a função rodar **como o chamador**, então a RLS se aplica de verdade. Com `SECURITY DEFINER` ela seria contornada e o `user_id` viraria parâmetro confiável — exatamente o que não queremos | Não valida nada por si |
| `SET search_path = ''` | Impede sequestro de resolução de nome por schema plantado no path | Nada de autorização |
| FK composta `(x_id, user_id)` | Impede uma linha apontar para linha de **outro** usuário — a RLS confere a linha própria e **não alcança a apontada** | Precondições de negócio |
| Validações explícitas | Precondições, limites, capacidades, coerência, anti-enumeração | — |

## F. Estados entre a reserva e a chamada externa

### Conjunto recomendado: 5 estados de run

`reserved` · `streaming` · `completed` · `cancelled` · `failed`

Descartados, e por quê:

| Descartado | Motivo |
| --- | --- |
| `pending` | Ambíguo — pendente de quê? `reserved` diz o que de fato aconteceu: a admissão passou e o orçamento está reservado |
| `starting` | Não há diferença **observável** entre "commitei" e "vou chamar". O que distingue é a **existência da linha de tentativa**, não um estado do run |
| `abandoned` | É **motivo**, não estado. Vira `failed` + `error_code = 'ABANDONED'` — mesma disciplina do projeto, que deriva status em vez de gravar |

**A granularidade fina mora na tentativa, não no run.** A linha de `ai_usage_events` é criada
**antes** de emitir a chamada, com `status = 'started'`. Logo:

```txt
run reserved SEM tentativa          → caiu depois do commit e ANTES de chamar o provedor
                                      (nenhum token pode ter sido consumido)
run reserved COM tentativa started  → caiu DEPOIS de chamar e antes do primeiro delta
                                      (pode ter havido consumo; fica registrado como indisponível)
```

Isso responde os dois casos da revisão **sem** inventar dois estados de run.

### Máquina de estados

```txt
                    ai_begin_chat_run (commit)
                              │
                              ▼
                        ┌───────────┐
                        │ reserved  │  heartbeat = now() já no INSERT
                        └─────┬─────┘
           primeiro delta     │      cancelamento / erro / lease vencido
                ┌─────────────┼───────────────┬──────────────┐
                ▼             │               ▼              ▼
          ┌───────────┐       │         ┌───────────┐  ┌──────────┐
          │ streaming │       │         │ cancelled │  │  failed  │
          └─────┬─────┘       │         └───────────┘  └──────────┘
                │             │               ▲              ▲
                ├─────────────┴───────────────┘              │
                │            cancelamento                    │
                ├────────────────────────────────────────────┘
                │            erro / lease vencido
                ▼
          ┌───────────┐
          │ completed │
          └───────────┘

Transições permitidas, e só estas:
  reserved  → streaming | completed | cancelled | failed
  streaming → completed | cancelled | failed
  terminais → (nenhuma)   ← imutáveis
```

Toda transição é `UPDATE ... WHERE id = $1 AND status IN (<origens permitidas>)`. Terminal não
tem origem permitida, então uma segunda tentativa de fechar é **no-op silencioso** — é assim
que `finally` e reconciliador nunca se contradizem.

### `ai_messages` acompanha

| Run | Mensagem do assistente |
| --- | --- |
| `reserved` / `streaming` | `streaming` |
| `completed` | `complete` |
| `cancelled` | `cancelled`, com o texto parcial recebido |
| `failed` | `failed` |

### Heartbeat

- **Primeiro:** gravado por `ai_begin_chat_run` no próprio INSERT (`last_heartbeat_at = now()`).
  A lease começa na admissão, não no primeiro delta — senão um run que morre entre o commit e a
  chamada ficaria sem lease.
- **Durante:** no máximo a cada **10 s**, disparado pelo chat-runner, nunca por token.
- **Lease:** 5 min, ou **30×** o intervalo de heartbeat.

### O que impede a reconciliação de matar um run legítimo

1. Só fecha com `last_heartbeat_at` mais velho que a lease.
2. A margem é de 30 intervalos — uma resposta lenta que continue viva renova muito antes.
3. O `UPDATE` é condicional a status **e** heartbeat: se o run bateu heartbeat entre a leitura
   e a escrita do reconciliador, o `WHERE` não casa e nada acontece.
4. Um run legítimo que perdeu a lease por pausa longa do provedor **será** fechado, e isso é
   aceito conscientemente: é melhor que prender orçamento indefinidamente. Como o timeout do
   servidor é menor que a lease, na prática o `finally` chega primeiro.

## G. Modelo de tentativas

| Item | Decisão |
| --- | --- |
| `attempt_index` começa em | **1**. Zero convida a erro de deslocamento na UI ("tentativa 0 de 3") e não traz vantagem |
| Alocação | Sequencial, pelo **chat-runner**, que é o único escritor daquele run. Não há alocação concorrente por desenho; a constraint única é a rede de segurança |
| Tentativa ativa | **Uma por run** — índice único parcial em `(run_id) WHERE status = 'started'` |
| Estados | `started` → `completed` \| `failed` \| `cancelled`. Terminais imutáveis |
| `PRIMARY` | `attempt_index = 1` |
| `RETRY` | Mesmo provedor **e** mesmo modelo da tentativa anterior |
| `FALLBACK` | Provedor **ou** modelo diferente |
| `provider_request_id` ausente | `NULL` + `usage_availability` registra a ausência. Não bloqueia nada |
| Uso indisponível | Tokens `NULL`, `estimated_cost` `NULL`, `usage_availability` detalha (anexo B) |
| Uso parcial | Grava o que veio; o resto `NULL`; `estimated_cost` `NULL` |
| Uso tardio | **Retificação proibida na 18-A.** Tentativa terminal é imutável, pela mesma disciplina do snapshot da 16-B e da sessão da 17-C. Se algum provedor passar a reportar uso depois, entra numa subfase posterior como **linha compensatória**, nunca reescrevendo a original |
| Custo total do run | `Σ estimated_cost` das tentativas não nulas. Se **alguma** for `NULL`, o total é exibido como "parcial — N tentativas sem custo informado", nunca como se estivesse completo |
| Idempotência | `INSERT` primeiro; em `23505`, `SELECT` da linha existente e devolve. Nunca recalcula, nunca soma de novo |

### Justificativa da chave única — decisão revisada

Proposta anterior: `UNIQUE (user_id, run_id, attempt_index)`.

`run_id` é UUID e chave primária de `ai_runs`: **globalmente único e já determinante do
usuário**. Portanto `user_id` não acrescenta unicidade alguma. A proteção que ele parecia dar —
impedir uma linha de tentativa com `user_id` divergente do run — é obtida de verdade pela **FK
composta `(run_id, user_id)` → `ai_runs (id, user_id)`**, padrão que o projeto já adota desde a
16-E (fotos de evolução) e a 17-F (ponte da agenda).

**Decisão: `UNIQUE (run_id, attempt_index)` + FK composta `(run_id, user_id)`.** Com a FK no
lugar, manter `user_id` na constraint única só alargaria o índice sem cobrir risco novo.
`user_id` **permanece como coluna** — RLS e consultas por período dependem dela.

## H. Recuperação — do usuário e global

### H.1 Recuperação do próprio usuário (primária)

**Gatilhos:** abrir `/ia` · listar conversas · **antes de reservar novo run** (dentro da própria
transação de `ai_begin_chat_run`, sob o advisory lock).

| Regra | Valor |
| --- | --- |
| Escopo | **Apenas runs do usuário autenticado.** Roda sob RLS, sem privilégio |
| Limite | **20 runs** por execução |
| Índice | `(user_id, status, last_heartbeat_at)`, parcial `WHERE status IN ('reserved','streaming')` |
| Operação | `UPDATE ... SET status='failed', error_code='ABANDONED' WHERE user_id = auth.uid() AND status IN ('reserved','streaming') AND last_heartbeat_at < now() - interval '5 minutes'` |
| Idempotência | O `WHERE` deixa de casar depois do primeiro fechamento — reexecutar é no-op |
| Impacto de latência | Um `UPDATE` por índice parcial sobre um conjunto que na prática tem 0 ou 1 linha. **Não há varredura global** — `user_id` é a primeira coluna do índice |

**Por que a listagem não varre globalmente:** ela não olha o sistema inteiro, olha os runs **do
usuário da sessão** — e a RLS impediria qualquer outra coisa mesmo que o SQL tentasse.

### H.2 Recuperação global (rede de segurança)

Executada **apenas** pelo Cron server-side já existente, com service role, nunca acessível ao
usuário comum — não há action, rota ou botão que a dispare.

| Regra | Valor |
| --- | --- |
| Lote | **200 runs** por execução |
| Ordenação | `last_heartbeat_at ASC` — os mais antigos primeiro |
| Dois reconciliadores no mesmo run | Impossível por construção: o `UPDATE ... WHERE status IN ('reserved','streaming') AND last_heartbeat_at < limite RETURNING id` **reivindica** as linhas atomicamente. O segundo não casa o `WHERE` e recebe zero linhas |
| Falha repetida | Não existe: a transição é **terminal**. Um run fechado como `failed` sai do conjunto para sempre — não há poison queue a administrar |
| Cron atual, 2×/dia | Suficiente **porque não é o mecanismo primário**. O que realmente protege é o gatilho "antes de reservar novo run": um run travado não consegue bloquear a próxima conversa nem prender orçamento, porque é reconciliado na mesma transação que admitiria a nova. O Cron cobre só o usuário que nunca mais abre o módulo |

## I. Teste de conexão dos provedores

| Item | Decisão |
| --- | --- |
| Chamada real? | **Sim, mas ao endpoint de listagem de modelos do provedor**, não ao de geração |
| Custo | **Zero tokens.** É exatamente o motivo da escolha: valida a chave sem consumir nada |
| Limite de tokens | Não se aplica |
| Timeout | 10 s |
| Rate limit próprio | **6 testes por hora, por provedor**, separado do rate limit do chat |
| Cria `ai_run`? | **Não** — não é conversa |
| Cria `ai_usage_event`? | **Não** — não há consumo a medir |
| Entra no orçamento? | **Não** |
| Contingência | Se algum dos quatro não oferecer listagem de modelos, aquele provedor usa uma geração de **1 token de saída** e então **passa a criar** run e evento de uso do tipo `connection_test`. Verificar qual endpoint cada provedor oferece é tarefa da implementação, com o resultado registrado no `LAST_PHASE_SUMMARY` |

### Ordem entre cifrar, persistir e validar

**Primeira credencial do provedor (não existe nenhuma):**

```txt
gerar credential_id → cifrar → persistir com status = 'nao_validada' → o usuário testa quando quiser
```

**Substituindo uma credencial existente:**

```txt
cifrar em memória → TESTAR → só grava se o teste passar
```

A credencial antiga **não é sobrescrita por uma que não funciona**. Trocar uma chave válida por
uma inválida e ficar sem acesso seria o pior resultado possível, e é justamente o momento em que
o usuário está mexendo em algo que funcionava. Se o teste falhar, nada é gravado e a UI mostra o
código sanitizado.

### Códigos devolvidos à interface

`INVALID_KEY` · `NETWORK` · `TIMEOUT` · `RATE_LIMITED` · `PROVIDER_ERROR` · `NOT_CONFIGURED`

**Proibido devolver ou registrar:** corpo bruto da resposta do provedor, headers, qualquer eco
da chave, stack trace, URL com credencial. `security/redact.ts` é o único caminho de saída de
erro do módulo.

## J. Dependências npm pretendidas

> **`package.json` não foi alterado.** Esta é a especificação; a instalação acontece na
> implementação, com as versões fixadas e registradas.

| Pacote | Tipo | Quem pode importar | Motivo | Alternativa no projeto |
| --- | --- | --- | --- | --- |
| `ai` | runtime | `src/lib/ai/providers/ai-sdk/**` | Núcleo que normaliza streaming, tool calling, saída estruturada com Zod, uso de tokens, finishReason e abort nos quatro | **Nenhuma** — o projeto não tem dependência de IA |
| `@ai-sdk/openai` | runtime | `src/lib/ai/providers/ai-sdk/openai.ts` | Adapter OpenAI | Nenhuma |
| `@ai-sdk/google` | runtime | `src/lib/ai/providers/ai-sdk/gemini.ts` | Adapter Gemini | Nenhuma |
| `@ai-sdk/anthropic` | runtime | `src/lib/ai/providers/ai-sdk/anthropic.ts` | Adapter Anthropic | Nenhuma |
| `@ai-sdk/xai` | runtime | `src/lib/ai/providers/ai-sdk/xai.ts` | Adapter xAI | Nenhuma |
| `server-only` | runtime | `src/lib/ai/server/**` | Faz o **build quebrar** se um módulo client alcançar a camada de cripto e credenciais. É guarda de compilação, não biblioteca | Nenhuma; hoje o projeto não tem essa proteção |

**Versões:** a faixa é fixada na implementação, **depois** de conferir compatibilidade com Next
**16.2.9**, React **19.2.4**, Zod **4.4.3** e runtime Node. Nenhuma versão é afirmada aqui — o
SDK evolui rápido, e chutar faixa neste documento seria informação falsa. A versão efetivamente
instalada é registrada no `LAST_PHASE_SUMMARY`.

**Impacto no bundle do cliente: zero.** Os cinco pacotes de IA são importados apenas dentro de
`src/lib/ai/providers/`, alcançada só por `src/lib/ai/server/` e pelo Route Handler — código
exclusivamente de servidor. Garantido por três mecanismos independentes: zona do ESLint,
`server-only` e teste de fronteira que varre import estático e dinâmico.

**Confirmação explícita:** nenhum componente `'use client'` importa, direta ou indiretamente,
qualquer pacote de provedor.

## K. Plano das duas migrations

> **Nada foi criado em `supabase/`.** Este é o plano; os arquivos nascem na implementação.

### M1 — `<timestamp>_ai_foundation.sql`

| | |
| --- | --- |
| **Responsabilidade** | A estrutura de dados inteira da 18-A |
| **Tabelas** | `ai_provider_configs` · `ai_provider_credentials` · `ai_user_preferences` · `ai_conversations` · `ai_messages` · `ai_runs` · `ai_usage_events` |
| **Enums** | **Nenhum tipo enum.** O projeto usa `text` + `CHECK`, que evolui sem `ALTER TYPE` |
| **Checks** | `provider IN ('openai','gemini','anthropic','xai')` · `ai_runs.status IN ('reserved','streaming','completed','cancelled','failed')` · `ai_messages.role IN ('user','assistant','system')` · `ai_messages.status IN ('complete','streaming','cancelled','failed')` · `ai_usage_events.status IN ('started','completed','failed','cancelled')` · `attempt_type IN ('PRIMARY','RETRY','FALLBACK')` · `currency = 'USD'` · `reserved_cost >= 0` · `attempt_index >= 1` · `confirmation_mode IN ('seguro','equilibrado','rapido')` |
| **Unique** | `(user_id, provider)` em configs e em credentials · `(user_id)` em preferences · `(run_id, attempt_index)` em usage_events · parcial `(run_id) WHERE status='started'` em usage_events |
| **FKs compostas** | `ai_messages (conversation_id, user_id)` → `ai_conversations (id, user_id)` · `ai_runs (conversation_id, user_id)` → idem · `ai_usage_events (run_id, user_id)` → `ai_runs (id, user_id)` · `ai_provider_credentials (user_id, provider)` → `ai_provider_configs (user_id, provider)` |
| **Índices** | `user_id` em todas · `(user_id, status, last_heartbeat_at)` parcial em `ai_runs WHERE status IN ('reserved','streaming')` — recuperação · `(user_id, created_at)` em `ai_usage_events` — orçamento por período · `(conversation_id, created_at)` em `ai_messages` · `(user_id, last_message_at desc)` em `ai_conversations` |
| **Triggers** | `updated_at` nas 6 tabelas que têm a coluna. `ai_usage_events` é append-only e não tem |
| **RLS** | Ligada + **FORCE** nas 7 |
| **Policies** | Separadas **por comando**, `using (user_id = auth.uid())` e `with check (user_id = auth.uid())`. `ai_usage_events` **sem policy de UPDATE e DELETE** — append-only por política, além do CHECK |
| **Grants** | Padrão do projeto para `authenticated`; nada para `anon` |
| **Dependências** | Nenhuma tabela existente é alterada |

### M2 — `<timestamp>_ai_begin_chat_run.sql`

| | |
| --- | --- |
| **Responsabilidade** | Só a função de admissão atômica |
| **Função** | `ai_begin_chat_run(...)` — `SECURITY INVOKER`, `VOLATILE`, `SET search_path = ''`, schema explícito em toda referência, `SET LOCAL lock_timeout='3s'`, `SET LOCAL statement_timeout='5s'` |
| **Grants** | `REVOKE ALL ... FROM PUBLIC` · `REVOKE ALL ... FROM anon` · `GRANT EXECUTE ... TO authenticated` |
| **Dependências** | **Exige M1 aplicada** — referencia as 7 tabelas |
| **Ordem** | Estritamente **M1 → M2** |

### Estado entre M1 e M2

Com só a M1 aplicada existem 7 tabelas vazias com RLS, e **nenhum código as alcança** — a 18-A
não está em produção nesse intervalo, e nenhum módulo existente depende delas. O estado
intermediário é **inerte**, não degradado.

### Rollback lógico

`DROP FUNCTION` (M2) e `DROP TABLE` das 7 (M1), na ordem inversa. Seguro porque nenhuma tabela
pré-existente é alterada e nenhuma FK aponta de fora para dentro do conjunto `ai_*`. Perde-se
apenas o histórico de IA.

### Testes de banco associados

RLS das 7 pela role `authenticated`, em transação com rollback · FORCE RLS efetiva · policies
por comando · `ai_usage_events` recusa UPDATE e DELETE · unicidade `(run_id, attempt_index)` ·
índice único parcial de tentativa ativa · FKs compostas recusando linha de outro usuário ·
`ai_begin_chat_run` rejeitando `auth.uid()` nulo, conversa alheia, reserva negativa e orçamento
estourado · atomicidade (falha no meio ⇒ nada persistido) · transições condicionais.

## L. Matriz de invariantes × evidência

Os 84 critérios continuam valendo item a item. Esta matriz é a leitura **por risco** — é ela
que decide se a subfase pode fechar.

| # | Invariante | Risco coberto | Tipo de teste | Ambiente | Evidência esperada | Bloqueia? |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Fronteiras arquiteturais | Casamento com o SDK; código de fornecedor vazando para o cliente | ESLint + teste de varredura (estático **e** dinâmico) | Node, sem banco | Lint limpo + teste verde listando as zonas | **Sim** |
| 2 | Criptografia e rotação | Vazamento de chave; perda de acesso na rotação | Unitário puro | Node | Ciclo íntegro; IV distinto; tag e AAD adulterados falham; 2 versões coexistem | **Sim** |
| 3 | Segredo e redaction | Chave em log, resposta ou telemetria | Unitário + inspeção de retorno | Node | Nenhuma saída contém `ciphertext`, `wrapped_dek`, `iv`, `auth_tag` ou a chave | **Sim** |
| 4 | Ownership, RLS, FORCE RLS, grants | Acesso cruzado; enumeração de IDs | Banco, role `authenticated`, com rollback | Supabase | Linha alheia inacessível; erro genérico único para "não existe"/"não é seu" | **Sim** |
| 5 | Concorrência da admissão | Dupla admissão; run sem mensagem | Banco, transações concorrentes | Supabase | Advisory lock serializa; rollback total na falha | **Sim** |
| 6 | Rate limit | Estouro por corrida | Banco, concorrente | Supabase | Duas requisições na borda não ultrapassam | **Sim** |
| 7 | Orçamento e reserva | Estouro de custo; soma dupla | Unitário (fórmula) + banco (concorrência) | Ambos | Invariante XOR verdadeiro; duas vias de soma iguais | **Sim** |
| 8 | Medição por tentativa | Custo perdido ou somado duas vezes | Unitário + banco | Ambos | Retry e fallback geram 2ª linha; `23505` devolve a existente | **Sim** |
| 9 | Streaming | Mensagem fantasma; perda ao recarregar | Integração com provedor mockado | Node | Linhas na ordem certa; recarregar não perde | **Sim** |
| 10 | Cancelamento | Estado inconsistente; cobrança fantasma | Integração + banco | Ambos | `cancelled` com motivo; parcial preservado; reserva liberada | **Sim** |
| 11 | Recuperação | Run preso; orçamento preso; run legítimo morto | Banco, com relógio injetado | Supabase | Heartbeat recente impede; lease vencido fecha; idempotente | **Sim** |
| 12 | Fallback classificado | Contornar política; gasto extra | Unitário puro | Node | Chave inválida, cancelamento e conteúdo recusado **nunca** caem em fallback | **Sim** |
| 13 | Falhas de provedor | Erro não normalizado; vazamento no erro | Contratual com mock | Node | Os 4 caem nas 10 classes, sanitizados | **Sim** |
| 14 | Tool Registry vazio | Execução indevida | Unitário + integração | Node | Nenhuma definição enviada ao provedor | **Sim** |
| 15 | Tool call inesperada | Run seguindo como se nada fosse | Integração com mock que força tool call | Node | Run `failed` com `UNEXPECTED_TOOL_CALL`; nada executado | **Sim** |
| 16 | Trava de honestidade | Assistente inventando dado | Avaliação com mock + revisão do prompt | Node | Responde "não consigo consultar" e aponta o módulo | **Sim** |
| 17 | Documentação | Handoff quebrado | Revisão | — | `CURRENT_STATUS`, `LAST_PHASE_SUMMARY`, `NEXT_AGENT_INSTRUCTIONS` atualizados | **Sim** |
| 18 | Ausência de regressão | Quebrar as 17 fases anteriores | Suíte completa | Node + `TZ=UTC` | `lint` + `tsc` + `test:run` + `build` verdes; suíte também em `TZ=UTC`; smoke de rotas | **Sim** |

Nenhum grupo é opcional. **Quantidade de critérios não substitui cobertura de invariante:** se
os 84 passarem e um grupo desta matriz ficar sem evidência, a subfase **não fecha**.
