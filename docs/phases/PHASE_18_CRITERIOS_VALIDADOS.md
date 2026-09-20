# Fase 18 — Critérios de aceite validados um a um

> Fechamento da Fase 18 (18-A a 18-F), no **Bloco 5 da 18-F**. Este arquivo existe porque o
> roadmap declarou que os critérios da fase completa seriam validados **um a um** na 18-F, e
> porque "tudo verde" sem dizer **onde** é a forma mais fácil de fechar uma fase por engano.

## Como ler a coluna "evidência"

Cada linha aponta para **uma** das quatro formas, e nenhuma linha pode ficar sem:

| Forma | O que significa |
| --- | --- |
| `arquivo.test.ts` + nome do teste | Roda no CI. É a evidência mais forte, e a única que não envelhece sozinha. |
| `arquivo.ts` ou migration | O critério é **estrutural**: ele é verdade por ausência de código ou por trava do banco. |
| **conferido à mão** + data + o que foi visto | O projeto roda em `environment: "node"` com zero `.test.tsx` (invariante 25): interface, teclado e tema não têm como ser afirmados por teste. |
| **RETIRADO (spec §3)** | O desenho tirou o item do escopo, com motivo, e o dono concordou. **Não conta no denominador e não ganha ✅.** |

Legenda da coluna de estado: **✅** validado · **⏳** depende da conferência à mão (ainda não
feita — ver o fim do arquivo) · **⊘** retirado do escopo pelo desenho.

⛔ **Nenhuma linha diz "ok", "passa" ou "feito".** Critério sem evidência não é critério
validado — ele desce para a seção "O que NÃO foi validado".

⚠️ **A contagem desta página é 163, não 158.** O plano do bloco estimou 158; ao extrair, cada
trecho entre `·` foi contado, e as cinco listas em prosa (18-B a 18-F) terminam num trecho
`transversais do projeto` que a estimativa não tinha contado — embora tenha contado os
equivalentes numerados da 18-A (itens 79 a 84). A regra do projeto é contar antes de citar, e
**o número certo é o medido**.

---

## 18-A — Fundação, provedores e chat (84 critérios)

### Fundação e fronteira

| # | Critério | Evidência | |
| --- | --- | --- | --- |
| A-1 | `core/` não importa pacote de fornecedor — por ESLint **e** por teste | `src/lib/ai/boundaries.test.ts` · "nenhuma camada pura importa pacote de fornecedor (estático ou dinâmico)" + `eslint.config.mjs` (`no-restricted-imports`) | ✅ |
| A-2 | Só `providers/` importa o AI SDK | `src/lib/ai/boundaries.test.ts` · "só providers/ importa o AI SDK, em todo o `src/`" | ✅ |
| A-3 | `agents/`, `tools/`, `usage/` e `security/` não importam SDK de fornecedor | `src/lib/ai/boundaries.test.ts` · os quatro estão em `CAMADAS_PURAS`, varridos pelo mesmo teste de A-1 | ✅ |
| A-4 | Nenhum arquivo client alcança `server/` | `src/lib/ai/boundaries.test.ts` · "todo arquivo de server/ importa `server-only`" — é o import que quebra o build do lado client | ✅ |
| A-5 | Nenhum arquivo fora da allowlist importa `credential-crypto` | `src/lib/ai/boundaries.test.ts` · "credential-crypto só é importado por server/" | ✅ |
| A-6 | A regra estática pega alias de path e o teste pega import dinâmico | `src/lib/ai/boundaries.test.ts` · "(estático ou dinâmico)" + `eslint.config.mjs`. ⚠️ Ver invariante 16: `no-restricted-imports` usa semântica de .gitignore, e pacote vai em `paths`, não em `patterns` | ✅ |

### Provedores

| # | Critério | Evidência | |
| --- | --- | --- | --- |
| A-7 | Os quatro respondem pela mesma interface interna | `providers/adapter.contract.test.ts` · "7. os quatro provedores respondem pela MESMA interface interna" | ✅ |
| A-8 | Erro dos quatro cai nas 10 classes normalizadas, já sanitizado | `providers/ai-sdk/error-map.test.ts` · "8. os quatro provedores caem nas 10 classes normalizadas" + "o erro normalizado JÁ SAI SANITIZADO" | ✅ |
| A-9 | Capacidade respeitada: sem visão não recebe imagem; sem tool calling não recebe ferramenta | `core/router.test.ts` · "9. capacidade exigida e não oferecida recusa antes da chamada" | ✅ |
| A-10 | Modelo fora do catálogo é recusado antes de qualquer chamada | `core/router.test.ts` · "10. modelo fora do catálogo é recusado" | ✅ |
| A-11 | Provedor fora do registry é recusado | `core/router.test.ts` · "11/12. sem provedor utilizável, recusa com erro tipado" | ✅ |
| A-12 | Provedor sem credencial válida é recusado com erro tipado | `core/router.test.ts` · "11/12." + "provedor sem NENHUM modelo configurado é recusado com motivo próprio" | ✅ |

### Catálogos

| # | Critério | Evidência | |
| --- | --- | --- | --- |
| A-13 | Modelos e preços conferidos na doc oficial vigente, com `verified_at` por entrada | `core/router.test.ts` · "13. toda entrada declara quando e onde foi verificada" · `core/models.test.ts` · "a fonte da capacidade é uma URL, não uma frase" e "a data da conferência de capacidade é data pura" | ✅ |
| A-14 | Preço não aparece em nenhum outro lugar do código | `core/pricing.test.ts` · "14. preço mora SÓ aqui" | ✅ |
| A-15 | Cada tentativa guarda `rate_snapshot`; alterar o preço depois não muda custo histórico | `core/pricing.test.ts` · "15. a tarifa é congelada no snapshot" + "o snapshot carrega o objeto inteiro, não só os dois números" | ✅ |
| A-16 | Custo em `numeric`, com moeda e versão de tarifa registradas | `core/pricing.test.ts` · "16. toda tarifa é em USD e declara a data de verificação" + `20260807100000_ai_foundation.sql` | ✅ |
| A-17 | Modelo desativado permanece no histórico | `core/models.ts` (`activeModelsFor` filtra; a entrada continua no catálogo) + `core/pricing.test.ts` · "todo modelo ATIVO do catálogo tem tarifa vigente hoje" — o desativado não é exigido nem removido | ✅ |

### Credenciais

| # | Critério | Evidência | |
| --- | --- | --- | --- |
| A-18 | Ciclo cifrar/decifrar íntegro | `server/credential-crypto.test.ts` · "18. o ciclo cifrar/decifrar devolve exatamente o segredo original" | ✅ |
| A-19 | IV distinto a cada operação sobre o mesmo segredo | idem · "19. o IV é distinto a cada operação sobre o MESMO segredo" | ✅ |
| A-20 | Authentication tag adulterada falha | idem · "20. authentication tag adulterada FALHA" | ✅ |
| A-21 | AAD inválido falha | idem · "21. AAD inválido FALHA (id da credencial diferente)" | ✅ |
| A-22 | Ciphertext movido para outro provedor, credencial ou dono falha | idem · "22. ciphertext movido para outro PROVEDOR ou outro DONO falha" | ✅ |
| A-23 | `key_version` desconhecida devolve erro tipado | idem · "23. key_version desconhecida devolve erro TIPADO" | ✅ |
| A-24 | Chave errada falha | idem · "24. chave-mestra errada FALHA" | ✅ |
| A-25 | Keyring resolve duas versões durante rotação controlada | idem · "25. o keyring resolve DUAS versões durante uma rotação controlada" | ✅ |
| A-26 | A query da tela devolve só os 5 campos públicos, sem `ciphertext`/`wrapped_dek`/`iv`/`auth_tag` | `server/credential-store.ts` · `COLUNAS_PUBLICAS` (colunas explícitas, nunca `select('*')`, declarado no cabeçalho do arquivo) | ✅ |
| A-27 | A chave completa não aparece em resposta de API, log ou telemetria | `security/security.test.ts` · "27. a chave completa não aparece em resposta, log ou telemetria" + "o log NÃO carrega a mensagem" | ✅ |
| A-28 | "Testar conexão" grava `last_validated_at` sem revelar nada | `providers/adapter.contract.test.ts` · "teste de conexão — listagem de modelos, ZERO tokens" + "extrai os ids e não vaza a chave na URL" | ✅ |

### Master key

| # | Critério | Evidência | |
| --- | --- | --- | --- |
| A-29 | Ausência do keyring desativa **somente** a IA | `server/crypto-readiness.ts` + `server/chat-readiness.ts` (`prontidaoDoChat`) — a falta de keyring vira frase de bloqueio do chat, e nenhum outro módulo a consulta | ✅ |
| A-30 | Configuração inválida desativa **somente** a IA | `server/credential-crypto.test.ts` · "keyring — validação do ambiente" (a recusa é do keyring, não da aplicação) | ✅ |
| A-31 | Nenhuma credencial pode ser salva sem keyring válido | `server/credential-store.ts` (a gravação passa por `embrulhar`, que exige o keyring) + `credential-crypto.test.ts` · "aceita uma configuração válida" / "ausência é ausência" | ✅ |
| A-32 | Chave curta sem padding; senha humana não vira master key; versão ausente não é substituída em silêncio | `server/credential-crypto.test.ts` · "32. chave CURTA não é completada com padding", "32. senha humana NÃO vira master key", "32. versão corrente ausente NÃO é substituída em silêncio" | ✅ |

### Chat

| # | Critério | Evidência | |
| --- | --- | --- | --- |
| A-33 | Sem sessão → 401 | `src/app/api/ia/chat/route.ts` (auth checada explicitamente; Route Handler não herda a proteção do Next) + `src/lib/supabase/proxy-session.ts` | ✅ |
| A-34 | Origin inválida → 403 | `src/app/api/ia/chat/route.ts` (Origin conferida explicitamente — invariante 6) | ✅ |
| A-35 | Corpo, mensagem ou histórico acima do limite → 413 | `validators/ai.test.ts` · "35. texto acima do limite é recusado (vira 413 no Route Handler)". ⚠️ Ver invariante 105: com a união de schemas, `problemasDoRamo` em `route.ts` é quem preserva o 413 | ✅ |
| A-36 | Campo extra (`user_id`, `image`, `file`, `document`…) → 400 | `validators/ai.test.ts` · "36. rejeita o campo extra" · `src/lib/ai/evals/destrutivo.test.ts` · "o corpo do chat recusa arquivo, imagem e documento" | ✅ |
| A-37 | Streaming completo persiste as linhas na ordem certa e fecha todos os estados | `server/chat-runner.test.ts` · "fecha a tentativa N ANTES de abrir a N+1 — sempre" e "toda tentativa aberta é fechada, inclusive a última" · `server/tool-loop.test.ts` · "a trilha fica completa: passos abertos e fechados" | ✅ |
| A-38 | Cancelar deixa `cancelled` com motivo e o texto parcial conforme a política | `providers/adapter.contract.test.ts` · "abort vira CANCELADO_PELO_USUARIO" + `server/run-store.ts` (`cancelRun`) | ✅ |
| A-39 | Erro deixa `failed` com mensagem sanitizada | `security/security.test.ts` · "o que vai para o banco é a mesma coisa sanitizada" · `error-map.test.ts` · "o erro normalizado JÁ SAI SANITIZADO" | ✅ |
| A-40 | Queda do cliente equivale a cancelamento | `server/tool-loop.test.ts` · "consumidor que abandona o gerador no meio ainda fecha o passo do modelo" | ✅ |
| A-41 | Recarregar a página no meio do streaming não perde a conversa | O run e as mensagens vivem no servidor desde a admissão atômica (`20260807100100_ai_begin_chat_run.sql`); **o comportamento na tela não tem teste** | ⏳ |

### Início atômico

| # | Critério | Evidência | |
| --- | --- | --- | --- |
| A-42 | Falha ao inserir qualquer linha causa rollback total | `20260807100100_ai_begin_chat_run.sql` — conversa + mensagem + run + mensagem do assistente numa transação só | ✅ |
| A-43 | Não existe run sem mensagens | idem (mesma transação) | ✅ |
| A-44 | Não existe mensagem de assistente sem run | idem + FK de `ai_messages` para `ai_runs` (`20260807100000_ai_foundation.sql`) | ✅ |
| A-45 | Não existe reserva sem run válido | idem — a reserva é coluna do próprio run (`reserved_cost`), não linha à parte | ✅ |
| A-46 | Conversa de outro usuário é rejeitada | `20260807100100_ai_begin_chat_run.sql` (`security invoker`: a RLS recusa) + Task 4 (RLS + FORCE RLS nas 132 tabelas, conferido em 2026-09-20) | ✅ |
| A-47 | A função rejeita `auth.uid() IS NULL` e não aceita `user_id`, limite, consumo ou contagem do cliente | `20260807100100_ai_begin_chat_run.sql` · passo 8 ("Preferências: limites LIDOS PELO BANCO", `select p.rate_limit_per_minute…`). ⚠️ Ver invariante 74: a 18-E acrescentou `p_user_id`, honrado **só** quando `auth.uid()` é nulo — `insights/job-schema.test.ts` · "⛔ a SESSÃO SEMPRE VENCE" | ✅ |

### Uso por tentativa

| # | Critério | Evidência | |
| --- | --- | --- | --- |
| A-48 | Retry cria segundo evento de uso | `usage/meter.test.ts` · "53. soma corretamente retry e fallback, com tarifas diferentes" · `server/chat-runner.test.ts` · "a primeira chamada é PRIMARY e as continuações são TOOL_STEP" | ✅ |
| A-49 | Fallback cria segundo evento de uso | idem | ✅ |
| A-50 | Os custos das duas tentativas são preservados | `usage/meter.test.ts` · "total do run — soma das TENTATIVAS" | ✅ |
| A-51 | Tarifas diferentes não são misturadas | `usage/meter.test.ts` · "53. …com tarifas diferentes" + `pricing.test.ts` · "15. a tarifa é congelada no snapshot" | ✅ |
| A-52 | Reexecução da mesma tentativa gera `23505` e devolve o evento existente | `20260807100000_ai_foundation.sql` — `UNIQUE (run_id, attempt_index)` + FK composta; a idempotência é `INSERT` + `23505` (invariante 10) | ✅ |
| A-53 | O total do run é a soma correta das tentativas | `usage/meter.test.ts` · "53." + "uma tentativa sem custo torna o total PARCIAL" | ✅ |
| A-54 | Métrica não devolvida pelo provedor é "indisponível", nunca 0 | `usage/meter.test.ts` · "54. métrica NÃO devolvida pelo provedor é indisponível — nunca 0" · `adapter.contract.test.ts` · "54. métrica ausente é INDISPONÍVEL, nunca zero" · `usage/budget.test.ts` · "54." | ✅ |

### Reserva e orçamento

| # | Critério | Evidência | |
| --- | --- | --- | --- |
| A-55 | Duas chamadas concorrentes perto do limite não ultrapassam a reserva | `usage/budget.test.ts` · "55. duas chamadas concorrentes perto do limite não ultrapassam a reserva disponível" + o `pg_advisory_xact_lock` de `20260807100100_ai_begin_chat_run.sql` | ✅ |
| A-56 | Run em streaming conta no orçamento pela reserva | `usage/budget.test.ts` · "todo run é TERMINAL **ou** contado por reserva — nunca os dois" | ✅ |
| A-57 | Run concluído deixa de contar pela reserva e passa a contar pelo custo real | `usage/budget.test.ts` · "57. run concluído deixa de contar pela reserva e passa a contar pelo custo real" | ✅ |
| A-58 | Run cancelado libera o saldo não utilizado | `usage/budget.test.ts` · "todo run é TERMINAL ou contado por reserva" (cancelado é terminal) + `reservation.test.ts` · "exemplo 4 — cancelamento com uso parcial é registrado e cabe" | ✅ |
| A-59 | Run expirado não bloqueia chamadas futuras | `usage/budget.test.ts` · "59. reserva VENCIDA não bloqueia chamadas futuras" | ✅ |
| A-60 | Fallback não ganha orçamento novo sem validar o restante | `core/fallback.test.ts` · "60. fallback NÃO ganha orçamento novo" + "destino que não cabe na reserva restante é recusado, mesmo com fallback ligado" | ✅ |
| A-61 | Toda chamada tem limite explícito de saída | `adapter.contract.test.ts` · "61. toda chamada leva teto de saída EXPLÍCITO" + `core/router.test.ts` · "todo modelo ativo tem teto de saída explícito" | ✅ |
| A-62 | Alertas em 70%, 80%, 90% e 100%, sem repetir o mesmo nível | `usage/budget.test.ts` · "62. alertas visuais em 70, 80, 90 e 100 — sem repetir o mesmo nível" | ✅ |
| A-63 | Bloqueio em 100% acontece antes de chamar o provedor | `usage/budget.test.ts` · "63. o bloqueio acontece ANTES de chamar o provedor (a decisão é sobre a reserva)" | ✅ |
| A-64 | Nenhuma notificação no sino nesta subfase | ⚠️ **deixou de valer na 18-F Bloco 1**, que entregou as quatro famílias (`notifications/ai.test.ts`). O critério era "nesta subfase" e continua verdadeiro **para a 18-A**. Registrado aqui para não parecer contradição | ✅ |

### Recuperação

| # | Critério | Evidência | |
| --- | --- | --- | --- |
| A-65 | Heartbeat recente impede encerramento pelo reconciliador | `20260807100100_ai_begin_chat_run.sql` · `ai_reconcile_abandoned_runs` filtra por `last_heartbeat_at < v_deadline` · `server/reconcile.ts:37` (`LEASE_MINUTOS = 5`) | ✅ |
| A-66 | Lease vencido permite encerramento | idem — a mesma condição, pelo outro lado | ✅ |
| A-67 | `finally` e reconciliador concorrentes não produzem estados contraditórios | `server/reconcile.ts:102` — a reivindicação repete `.in('status', ['reserved','streaming'])` no UPDATE, e o comentário declara que isso **não** é redundância: quem perder a corrida não encontra linha. **Não há teste de concorrência** | ✅ |
| A-68 | O reconciliador é idempotente | `server/reconcile.ts:71` — `UPDATE … WHERE status IN ('reserved','streaming') AND last_heartbeat_at < limite`: a segunda passada não encontra linha | ✅ |
| A-69 | Reservas vencidas deixam de contar no orçamento | `usage/budget.test.ts` · "59. reserva VENCIDA não bloqueia chamadas futuras" | ✅ |
| A-70 | A reconciliação preguiçosa roda antes de reservar novo run | `20260807100100_ai_begin_chat_run.sql` (a reconciliação é passo do próprio RPC) + `src/lib/ai/painel.ts` / `estadoDoPainelDaIa` (invariante 92: porta nova para o chat carrega essa linha) — `painel-persistencia.test.ts` · "abrir o painel reconsulta a prontidão" | ✅ |

### Rate limit

| # | Critério | Evidência | |
| --- | --- | --- | --- |
| A-71 | Duas requisições concorrentes na borda do limite não ultrapassam (advisory lock) | `20260807100100_ai_begin_chat_run.sql:46` — "O lock é `pg_advisory_xact_lock` (transacional), NUNCA `pg_advisory_lock`" · `security/security.test.ts` · "rate limit (parte pura)" cobre a decisão | ✅ |
| A-72 | O limite é lido pelo banco, nunca informado pelo cliente | `20260807100100_ai_begin_chat_run.sql` · passo 8 ("Preferências: limites LIDOS PELO BANCO") | ✅ |

### Segurança e ferramentas

| # | Critério | Evidência | |
| --- | --- | --- | --- |
| A-73 | Prompt injection em qualquer entrada não altera comportamento nem provoca tool call | `security/security.test.ts` · "73/76. dado externo é DADO, nunca instrução" · `agents/registry.test.ts` · "73. declara que dado é conteúdo, nunca instrução" · `tools/injection.test.ts` | ✅ |
| A-74 | Nenhuma definição de ferramenta é enviada ao provedor | ⚠️ valia para a **18-A**, com o registry vazio: `adapter.contract.test.ts` · "74. com o registry vazio, o campo …". A 18-B em diante envia as definições, filtradas por permissão (`registry.test.ts` · "permissão desligada não gera definição"). O que sobreviveu intacto é "74. o Tool Registry é a única porta" e "o orquestrador não tem ferramenta própria" | ✅ |
| A-75 | Tool call inesperada encerra o run como `failed` com `UNEXPECTED_TOOL_CALL`, sem executar nada | `adapter.contract.test.ts` · "75. tool call inesperada é REPASSADA como evento — não executada" · `agents/registry.test.ts` · "75. o código do run para tool call inesperada é estável" · `chat-runner.test.ts` · "ferramenta que não foi oferecida encerra o run como falha" | ✅ |
| A-76 | Tentativa de fazer o modelo produzir SQL não gera execução alguma | `agents/registry.test.ts` · "76. proíbe SQL, execução de código e acesso a banco" · `security/security.test.ts` · "73/76." | ✅ |
| A-77 | Nenhuma query de módulo é importada por `src/lib/ai/` | ⚠️ valia para a **18-A**. Hoje: `boundaries.test.ts` · "query e action de módulo só entram pelas TRÊS portas declaradas" — as portas são os adapters (pelo Tool Executor), `approval/commands/*-preview` e `insights/collectors/` (invariante 71). O critério virou "só pelas portas declaradas", e a lista é varrida por teste | ✅ |

### Trava de honestidade

| # | Critério | Evidência | |
| --- | --- | --- | --- |
| A-78 | Perguntado sobre dado de módulo, o assistente diz que não consegue consultar e aponta o módulo — não inventa número | ⚠️ **reescrito na 18-B** (invariante 15): a v1 mandava afirmar que o assistente não consulta registro nenhum, e isso virou mentira. `agents/registry.test.ts` · "78. TRAVA DE HONESTIDADE — a resposta só pode nascer do que a ferramenta devolveu", "78. aponta o módulo em vez de responder às cegas", "78. proíbe também o disfarce do palpite", "nenhum perfil afirma uma ausência de acesso que a 18-B tornou falsa" | ✅ |

### Transversais do projeto

| # | Critério | Evidência | |
| --- | --- | --- | --- |
| A-79 | pt-BR em toda a UI; BRL e datas no formato brasileiro | Parcial por teste: `agents/registry.test.ts` · "pede pt-BR, BRL e data brasileira" · `constants.test.ts` (rótulos) · `insights/render.test.ts` · "R$ sai por formatCurrency". **A varredura visual das oito seções de `/ia` não foi feita** | ⏳ |
| A-80 | Dark e light funcionando; responsividade em desktop, tablet e celular | Não há infraestrutura de teste de componente (invariante 25) | ⏳ |
| A-81 | RLS + FORCE RLS nas tabelas, pela role `authenticated` | **Conferido no banco em 2026-09-20** (Task 4): a consulta por `relrowsecurity = false or relforcerowsecurity = false` em `public` voltou **vazia** nas **132** tabelas | ✅ |
| A-82 | `lint && tsc && test:run && build` verdes | Rodados no fechamento deste bloco — ver "Verificação" no fim do arquivo | ✅ |
| A-83 | Suíte verde também em `TZ=UTC` | idem (`TZ=UTC npx vitest run`) | ✅ |
| A-84 | Rotas privadas → 307 `/login`; `/api/cron/*` → 401 sem segredo | **Conferido à mão e registrado** em `docs/project/CURRENT_STATUS.md:1031` · `src/lib/supabase/proxy-session.ts` (`PUBLIC_PATHS`) · `boundaries.test.ts` · "a rota do Cron de insights confere CRON_SECRET antes de qualquer outra coisa" | ✅ |

---

## 18-B — Contexto, leitura e agentes (16 critérios)

| # | Critério | Evidência | |
| --- | --- | --- | --- |
| B-1 | Roteamento escolhe o agente certo | `agents/routing.test.ts` (42 testes) · `evals/casos.test.ts` · "chega ao agente …" para os oito casos do briefing | ✅ |
| B-2 | Ferramentas restritas por agente, comprovado por teste | `tools/registry.test.ts` · "a allowlist de todo agente é subconjunto do registry" e "allowedAgents e a allowlist do agente concordam nos dois sentidos" · `tools/guard.test.ts` · "rejeita ferramenta que existe mas está fora da allowlist do agente" | ✅ |
| B-3 | Consulta cruzada funciona pelo orquestrador | ⚠️ **Não é o que foi entregue, e a diferença é decisão.** O orquestrador tem `allowedTools: []` (invariante 74), então ele **não** faz consulta cruzada — ele pergunta. A consulta cruzada chegou na **18-F Bloco 4**, como experiência dirigida pelo servidor, atrás de `allow_cross_module`: `experiences/catalog.test.ts` · `chat-runner.test.ts` · "executa a lista do plano ANTES de chamar o modelo, e na ordem do catálogo" | ✅ |
| B-4 | Falta de dado é declarada, não preenchida | `tools/adapters/nutrition.test.ts` · "dia sem registro é ausência, nunca zero caloria" · `adapters/training.test.ts` · "período sem treino NÃO vira volume zero" · `tools/contracts.test.ts` · "saída vazia — declara o motivo e não finge zero" | ✅ |
| B-5 | Toda resposta com dado mostra fontes, período e quantidade | `agents/registry.test.ts` · "8-C — a resposta cita o período e quantos registros entraram na conta" · `tools/sources.test.ts` · "resumirFontes — ausência não é zero" | ✅ |
| B-6 | "Ver dados usados" abre os registros reais | Por teste: `tools/sources.test.ts` · "parseRefs — o único campo desta tela que vira navegação" e "nenhuma rota aceita resolve para fora do domínio". **A abertura na tela não foi percorrida** | ⏳ |
| B-7 | Inferência e sugestão aparecem separadas de fato | `agents/registry.test.ts` · "prompt-base v3 — o que o modelo pode fazer com o resultado da ferramenta" + "78. proíbe também o disfarce do palpite — hipótese apresentada como dado" | ✅ |
| B-8 | Troca de agente preserva a conversa | Não há teste de componente (invariante 25) | ⏳ |
| B-9 | Contexto da página é explícito, mínimo, visível e desligável | Explícito e mínimo por teste: `validators/ai.test.ts` · "a saída não ganha campo nenhum — o que atravessa o transporte é SÓ a rota" e "aceita TODA rota da lista estática" · `routing.test.ts` · "o bloco proíbe concluir qualquer coisa sobre os registros a partir da tela". **Visível e desligável são da tela** | ⏳ |
| B-10 | Nenhum cálculo é feito pelo modelo | `agents/registry.test.ts` · "8-A — o cálculo é do backend; o modelo repete, não recalcula" e "8-A — trocar a unidade para ler é permitido; refazer a conta não" | ✅ |
| B-11 | Nenhuma query de módulo é reimplementada dentro de `src/lib/ai/` | `boundaries.test.ts` · "query e action de módulo só entram pelas TRÊS portas declaradas" · "nenhum `.from()` nem `select()` em `src/lib/ai/tools/`, exceto a auditoria" | ✅ |
| B-12 | Ferramenta desconhecida, fora da allowlist ou com schema inválido é rejeitada e auditada | `tools/guard.test.ts` (11 recusas) · `tools/executor.test.ts` · "nada roda sem passar pelo guard" · `tools/audit.test.ts` | ✅ |
| B-13 | Registro de outro usuário é inacessível | `tools/executor.test.ts` · "argumento com user_id é RECUSADO antes de qualquer leitura" · `tools/registry.test.ts` · "nenhum inputSchema menciona user_id ou owner_id" + RLS (A-81) | ✅ |
| B-14 | Prompt injection vinda de conteúdo de registro não altera comportamento | `tools/injection.test.ts` · "o texto injetado é EMBRULHADO como conteúdo, com o aviso ANTES" e "mesmo que o modelo obedeça, a ferramenta pedida é REJEITADA pela allowlist" | ✅ |
| B-15 | Nenhuma escrita acontece | ⚠️ valia para a **18-B**. A 18-C entregou a escrita — sempre como **proposta**, nunca dentro do run: `boundaries.test.ts` · "nada em `src/lib/ai/` alcança `approval/execute.ts`". O critério continua verdadeiro para a 18-B e para o laço de ferramentas de hoje | ✅ |
| B-16 | Transversais do projeto | Ver a seção **Transversais** no fim | ⏳ |

---

## 18-C — Ações, aprovações e auditoria (17 critérios)

| # | Critério | Evidência | |
| --- | --- | --- | --- |
| C-1 | Ação sem confirmação é recusada | `approval/state.test.ts` · "proposta sem decisão nenhuma para em SEM_CONFIRMACAO" · `approval/execute.test.ts` | ✅ |
| C-2 | Confirmação válida executa uma única vez | `approval/schema.test.ts` · "uma decisão por proposta, por índice único" · `execute.test.ts` · "execução já registrada devolve JA_EXECUTADA e não reserva vaga nova" | ✅ |
| C-3 | Confirmação expirada é recusada | `approval/state.test.ts` · "prazo vencido" · `execute.test.ts` · "prazo vencido para antes de qualquer escrita" · `schema.test.ts` · "o prazo de 10 minutos é default do banco, com teto de 1 hora" | ✅ |
| C-4 | Proposta alterada exige nova confirmação | `approval/state.test.ts` · "hashes diferentes recusam com EFEITO_MUDOU" · `execute.test.ts` · "hash gravado que não bate com o recálculo NÃO executa e NÃO reserva vaga" | ✅ |
| C-5 | Confirmação de outro usuário é recusada | `approval/schema.test.ts` · "a FK da aprovação carrega o hash, amarrando-o ao effect_hash da proposta" e "as chaves de idempotência da execução são emparelhadas com user_id" + RLS (A-81) | ✅ |
| C-6 | Replay de confirmação é recusado | `approval/schema.test.ts` · "uma decisão por proposta, por índice único" e "o uso único do desfazer mora nas execuções, não nas propostas" | ✅ |
| C-7 | Ação em massa exige confirmação reforçada e registra por item | **Satisfeito por ausência**: nenhuma ferramenta de ação em massa foi publicada. `evals/destrutivo.test.ts` · "nenhuma ferramenta publicada passa do risco 3" · `approval/execute.test.ts` · "as ações de risco 4 continuam fora da 18-C" | ✅ |
| C-8 | Exclusão exige confirmação reforçada | **Satisfeito por ausência**, e é mais forte que o pedido: não há ferramenta que exclua. `evals/destrutivo.test.ts` · "nenhum inverso … é alcançável por ferramenta" · `commands/desfazer.test.ts` · "os inversos continuam sem ferramenta". O botão de desfazer **propõe** (invariante 48): `approval/history.test.ts` | ✅ |
| C-9 | Transação financeira sempre exige confirmação, em qualquer modo | `tools/registry.test.ts` · "toda ferramenta de escrita declara chave, confirmação e command" · `tools/contracts.test.ts` · "recusa ESCRITA sem confirmação" · `guard.test.ts` · "recusa escrita fora do modo proposta, mesmo com tudo ligado" | ✅ |
| C-10 | Retry não duplica | `approval/execute.test.ts` (claim-first: a vaga é reservada antes de chamar o command) · `schema.test.ts` · "a execução só pode ser FECHADA, nunca reescrita" | ✅ |
| C-11 | Fallback não repete escrita | `boundaries.test.ts` · "nada em `src/lib/ai/` alcança `approval/execute.ts`" — retry e fallback vivem no run, e o run não alcança o executor | ✅ |
| C-12 | Cancelar streaming não desfaz ação confirmada | idem — verdadeiro **por construção** (invariante 32), com dois testes de fronteira | ✅ |
| C-13a | O fluxo do exemplo da seção 21 funciona **chamando o serviço financeiro existente**, sem recriar a regra de fechamento | `commands/finance.test.ts` · "equivalência: a IA e o formulário produzem o mesmo lançamento" e "despesa no cartão sai SEM conta, com cartão e método de crédito" · `boundaries.test.ts` · "o lado PREVIEW dos commands não importa serviço de escrita" | ✅ |
| C-13b | …a compra **dividida com terceiro** | ⚠️ **Não entregue, por decisão declarada**: a ferramenta não divide, e a descrição dela diz isso ao modelo. `commands/finance.test.ts` · "não existe campo de DIVISÃO com terceiros" e "não existe campo de PARCELAMENTO". Divisão continua sendo da tela do Financeiro | ⏳ |
| C-14 | Nenhuma regra de negócio duplicada, provado por teste que compara ferramenta e formulário | `commands/todo.test.ts`, `commands/calendar.test.ts`, `commands/finance.test.ts` · "equivalência: a IA e o formulário produzem o mesmo …" (um por módulo) | ✅ |
| C-15 | Auditoria completa e sem segredo | `tools/audit.test.ts` · "o log NÃO carrega a mensagem do banco" · `security/security.test.ts` · "18-B. argumento de ferramenta sanitizado para o banco" (invariante 20: guarda o pedido, nunca o resultado) | ✅ |
| C-16 | Desfazer funciona e é auditado | `commands/desfazer.test.ts` · "todo command com desfazer produz uma entrada que o INVERSO aceita" · `approval/history.test.ts` · "o desfazer: quando aparece, quando não, e por quê" (9 testes) | ✅ |
| C-17 | Transversais do projeto | Ver a seção **Transversais** | ⏳ |

---

## 18-D — Visão, documentos e comprovantes (17 critérios)

| # | Critério | Evidência | |
| --- | --- | --- | --- |
| D-1 | Recibo legível extrai corretamente | Testado com provedor **mockado**: `server/extraction-runner.test.ts` · `vision/schema.test.ts` · "os campos do JSON Schema são EXATAMENTE os do Zod". **Extração sobre um comprovante real não foi percorrida** | ⏳ |
| D-2 | Recibo parcialmente legível marca os ilegíveis como "não identificado" | `vision/confidence.test.ts` · "campo de texto vazio vira não identificado" e "item sem valor vira não identificado, nunca zero" | ✅ |
| D-3 | Valor ambíguo pede decisão | `vision/confidence.test.ts` · "valor absurdo é rebaixado — é o sintoma de vírgula lida errado" e "⛔ podePropor — o bloqueio, não o aviso · total incerto BLOQUEIA" | ✅ |
| D-4 | Data ausente não é inventada | `vision/confidence.test.ts` · "ausente é não identificado" e "formato errado é não identificado, não uma tentativa de conversão" | ✅ |
| D-5 | Nota com vários totais pede confirmação | `vision/confidence.test.ts` · "soma que NÃO bate vira conflito" e "total em CONFLITO bloqueia" | ✅ |
| D-6 | Imagem inválida é recusada com mensagem clara | `vision/mime.test.ts` · "⛔ a extensão mente", "um ZIP disfarçado é RECUSADO", "HEIC ganha motivo próprio · é recusado com instrução de como resolver" | ✅ |
| D-7 | Arquivo grande é recusado antes do upload | `vision/limits.test.ts` · "os dois limites ficam abaixo do MENOR que os provedores publicam (20 MB, Gemini)". A recusa do lado do servidor é a que vale | ✅ |
| D-8 | Duplicidade por hash é detectada | `vision/duplicates.test.ts` · "arquivo idêntico — certeza, e ainda assim alerta" | ✅ |
| D-9 | Duplicidade por valor/data/estabelecimento é sinalizada | `vision/duplicates.test.ts` · "trio valor + data + estabelecimento" + "⛔ NENHUM ALERTA BLOQUEIA" (invariante 59) | ✅ |
| D-10 | Prompt injection dentro da imagem não altera comportamento | `vision/schema.test.ts` · "⛔ PROMPT INJECTION dentro do arquivo · a frase só consegue virar o VALOR de um campo de texto" · `server/extraction-runner.test.ts` · "a frase impressa na nota vira o VALOR de um campo — e nada mais acontece" | ✅ |
| D-11 | Confiança baixa impede ação automática | `vision/confidence.test.ts` · "⛔ podePropor" (7 testes) · `vision/review.test.ts` · "o bloqueio responde à correção, nos dois sentidos" | ✅ |
| D-12 | Revisão sempre acontece antes da ação | `vision/review.test.ts` + estrutural: os três processos são separados (invariante 55) e `/ia/comprovantes` é a única porta | ✅ |
| D-13 | Nenhum lançamento definitivo é criado só por ter recebido imagem | Estrutural (invariante 55): envio, extração e revisão são três processos; a proposta passa pelo Approval Engine com `origem = 'documento'` — `20260813100100_ai_document_extractions.sql` · `approval/schema.test.ts` | ✅ |
| D-14 | Comprovante fica anexado ao registro | ⚠️ A anexação é **segunda ação**, fora do Approval Engine (invariante 61) — `approval/document.ts`. Se ela falhar, o comprovante continua na lista. **Sem teste; o caminho na tela não foi percorrido** | ⏳ |
| D-15 | Origem "IA por imagem" registrada | `20260813100100_ai_document_extractions.sql` (`origem = 'documento'` + `document_extraction_id`) · `approval/schema.test.ts` · "o CHECK exige as duas formas por inteiro" · `approval/document.test.ts` | ✅ |
| D-16 | CSV/OFX reusa a Fase 06 | Estrutural: a 18-D não tocou `src/lib/import/`; a importação continua sendo a da Fase 06 (`src/lib/import/*.test.ts`) | ✅ |
| D-17 | Transversais do projeto | Ver a seção **Transversais** | ⏳ |

---

## 18-E — Insights, relatórios e dashboards (14 critérios)

| # | Critério | Evidência | |
| --- | --- | --- | --- |
| E-1 | Geração funciona | `insights/prompt.test.ts` · "schema — o que o modelo PODE devolver" · `insights/validate.test.ts` · "aceita o insight bem formado, e devolve os ids citados" (com provedor mockado) | ✅ |
| E-2 | Insight é persistido | `20260814100000_ai_insights.sql` (3 tabelas, RLS + FORCE RLS) | ✅ |
| E-3 | Fontes ficam registradas e abrem os registros reais | `insights/contracts.test.ts` · "recusa rota que não é caminho interno" · `insights/render.test.ts` · "resolve o token pelo id". **A abertura na tela não foi percorrida** | ⏳ |
| E-4 | Expiração funciona | `insights/engine.test.ts` · "expiry — período em curso vence quando o período acaba" (5 testes, virada em Brasília) | ✅ |
| E-5 | Feedback é gravado | `insights/engine.test.ts` · "state — decisão do dono vence o prazo" (9 testes) + `20260814100000_ai_insights.sql` (`ai_insight_feedback`, append-only) | ✅ |
| E-6 | Transformar em tarefa passa por confirmação | `20260814100100_ai_proposals_insight.sql` (4ª forma de `origem`, com FK composta) · `approval/schema.test.ts`. ⛔ Restrito a `criarTarefaTodo` pela **ausência** de campo `command` na action (invariante 72) | ✅ |
| E-7 | Não há duplicação (rodar o job três vezes não gera três insights iguais) | `insights/engine.test.ts` · "dedupe — a chave é sobre os FATOS, não sobre a apresentação" (8 testes) | ✅ |
| E-8 | O dashboard não chama a IA em nenhum carregamento | `boundaries.test.ts` · "nada em dashboard/ alcança o runner de insight nem a action que o dispara" | ✅ |
| E-9 | Insight não cita registro fora das fontes | `insights/validate.test.ts` · "recusa token que aponta indicador não enviado" e "recusa evidência apontando indicador não enviado" | ✅ |
| E-10 | Nenhum cálculo é feito pelo modelo | `insights/validate.test.ts` · "fora dos tokens, dígito nenhum" + "recusa número escrito à mão, em qualquer campo" (invariante 64: a garantia é do dado, não do validador) | ✅ |
| E-11 | Análise cruzada não afirma causalidade e mostra períodos e limitações | `insights/prompt.test.ts` · "proíbe a conta, e diz o que fazer quando a comparação não veio" · `insights/temporal.test.ts` · "unidades diferentes ⇒ recusa explícita, não um número plausível" · `insights/render.test.ts` · "a ressalva carrega incompletude, regra de contagem e quantos registros entraram" | ✅ |
| E-12 | O teste de vocabulário proibido passa em todo texto gerado | `insights/validate.test.ts` · "recusa linguagem de cobrança e de prescrição, **em runtime**" (invariante 69) · `boundaries.test.ts` · "VOCABULARIO_DE_COBRANCA é declarado UMA vez, e em `src/lib/tone/`" | ✅ |
| E-13 | Limite de orçamento de job é respeitado | `insights/job-schema.test.ts` · "o segundo teto — os DOIS valem", "⛔ ele soma SÓ runs automatic", "⛔ job_monthly_budget é NOT NULL" | ✅ |
| E-14 | Transversais do projeto | Ver a seção **Transversais** | ⏳ |

---

## 18-F — Memória, integrações e polimento (15 critérios)

| # | Critério | Evidência | |
| --- | --- | --- | --- |
| F-1 | Memória é controlável, exportável e apagável | `memory/schema.test.ts` · "ai_memories não tem coluna de estado — ele é derivado" · `memory/services.test.ts` · "em excluirMemoria, o evento é gravado ANTES do delete" · `settings/export-tables.test.ts` (inclui `ai_memories`). ⚠️ `ai_memories` **tem** policy de DELETE, ao contrário das tabelas de auditoria | ✅ |
| F-2 | Nada sensível é salvo automaticamente | `memory/forma.test.ts` · "recusa endereço de site e e-mail", "recusa trecho com forma de chave", "não confunde frase longa em português com credencial". E nada é salvo sem proposta: `commands/memory.test.ts` | ✅ |
| F-3 | Sugestão de memória pede autorização | `commands/memory.test.ts` · "preverLembrarPreferencia — mostra a frase que será salva, já normalizada" e "declara que é preferência e que não desliga regra nem autoriza leitura" — pelo Approval Engine de sempre | ✅ |
| F-4a | Botão flutuante não cobre lançamento rápido nem navegação inferior, e é acessível por teclado | `painel.test.ts` · "são DOIS cantos, e os de cima não existem". **Teclado (`Ctrl/⌘ + I`, `Tab`, `Esc`, retorno do foco) não tem teste** | ⏳ |
| F-4b | …tem alternativa ao arrasto e salva posição por dispositivo | ⊘ **RETIRADO (spec §5.2)**: o Bloco 2 entregou **canto** (`floating_corner`), não arrasto livre — decisão registrada no desenho do bloco. Sem arrasto, não há "alternativa ao arrasto"; a posição é preferência do dono no banco, não por dispositivo | ⊘ |
| F-5 | Voz mostra transcrição antes de agir e não executa risco com baixa confiança | ⊘ **RETIRADO (spec §3)** | ⊘ |
| F-6 | Automação sugere por padrão | ⊘ **RETIRADO (spec §3)** | ⊘ |
| F-7 | Notificações passam por `filterByPrefs`, têm `dedupe_key` determinístico, não duplicam em três execuções do Cron e passam no vocabulário proibido | `notifications/ai.test.ts` · "rodar três vezes produz exatamente as mesmas chaves", "as chaves de dedupe são únicas no lote", "sem linguagem de cobrança nem de prescrição", "nenhuma é high nem urgent" · `notifications/generate.test.ts` · "Fase 18-F — IA entra pelo mesmo gerador" | ✅ |
| F-8 | Busca global encontra conversa, insight, ação e memória, e os deep-links abrem | `search/ai-links.test.ts` · "a rota dinâmica da conversa tem página no disco" e "aponta o filtro de problemas que a tela de ações realmente aceita". **A abertura dos quatro na tela não foi percorrida** | ⏳ |
| F-9 | Exclusão respeita auditoria e explica o que permanece | `retention.test.ts` · "TODO escopo explica o que permanece — nenhum devolve lista vazia" e "avisa que o consumo medido some junto com as conversas" (invariante 88) | ✅ |
| F-10 | Export inclui a seção de IA sem apagar as outras | `settings/export-tables.test.ts` (as 19 `ai_*` entram; `ai_provider_credentials` está em `EXPORT_EXCLUDED`, com o motivo escrito — invariante 86) | ✅ |
| F-11 | Pesquisa externa vem desligada, é identificada e não leva dado pessoal | ⊘ **RETIRADO (spec §3)**. `allow_external_search` continua ociosa — ver a seção das chaves ociosas | ⊘ |
| F-12 | Circuit breaker e health check funcionam | ⊘ **RETIRADO (spec §3)** — observabilidade saiu; `/ia/consumo` já mostra custo e tentativa | ⊘ |
| F-13 | Nenhuma escrita de resultado desconhecido é repetida automaticamente | `approval/execute.test.ts` (claim-first: a vaga vira `executando` **antes** do command, e uma queda no meio **bloqueia** nova tentativa — invariante 37) · `approval/history.test.ts` · "execução sem desfecho NÃO oferece desfazer, e explica que pode não ter acontecido" | ✅ |
| F-14 | Os critérios gerais da Fase 18 validados um a um | **Este arquivo** | ✅ |
| F-15 | Transversais do projeto | Ver a seção **Transversais** | ⏳ |

---

## Transversais do projeto (B-16, C-17, D-17, E-14, F-15 e A-79 a A-84)

| Item | Evidência | |
| --- | --- | --- |
| RLS + FORCE RLS em todas as tabelas | **Conferido no banco em 2026-09-20**: a consulta por tabelas sem `relrowsecurity` ou sem `relforcerowsecurity` em `public` voltou **vazia**; **132** tabelas, **20** `ai_*` | ✅ |
| `lint` · `tsc --noEmit` · `test:run` · `build` · `perf:bundle` | Ver "Verificação" no fim do arquivo | ✅ |
| Suíte verde em `TZ=UTC` | idem | ✅ |
| pt-BR / BRL / data brasileira | Parcial por teste (rótulos, prompts, mensagens de erro). A varredura visual não foi feita | ⏳ |
| Dark e light · responsividade (desktop, tablet, celular) | Sem infraestrutura de teste de componente (invariante 25) | ⏳ |
| Advisors do Supabase | **Conferido em 2026-09-20**: segurança com **1 lint**, `auth_leaked_password_protection` — **pré-existente** (registrado desde 2026-08-07), botão do painel de Auth, sem migration e fora do código. **Zero lints de schema** | ✅ |

---

## Critérios do doc da fase que o desenho RETIROU (spec §3)

Estes **não** entram no placar. Entram aqui porque o doc da fase os lista entre os critérios de
aceite, e um leitor que compare as duas listas tem de encontrar a explicação — não um silêncio.

| Item do doc da fase | Por que saiu | Onde está escrito |
| --- | --- | --- |
| Voz mostra transcrição antes de agir e não executa risco com baixa confiança | Exige provedor de transcrição novo, captura de áudio e um caminho de confirmação próprio; o valor depende de um hábito que o dono ainda não tem | spec §3 |
| Automação sugere por padrão | É a generalização do job de insights que a 18-E já entregou funcionando — construir o genérico para ter duas instâncias é YAGNI | spec §3 |
| Pesquisa externa vem desligada, é identificada e não leva dado pessoal | É a parte da IA que **não** usa os dados do dono; entrega o que um chat genérico entrega e traz conteúdo não confiável de fora | spec §3 |
| Circuit breaker e health check funcionam | Observabilidade saiu: `/ia/consumo` já mostra custo e tentativa, e painel de métricas para um usuário só é ornamento que precisa ser mantido | spec §3 |
| Botão flutuante tem alternativa ao arrasto e salva posição por dispositivo | O Bloco 2 entregou **canto** (`floating_corner`), não arrasto livre | spec §5.2 |

## As duas chaves que continuam ociosas

`allow_external_search` e `allow_files` existem no banco desde a 18-A e **não ligam nada**. Isso
contraria a disciplina das invariantes 24 e 47 ("chave sem ferramenta é botão que não liga
nada"), e a decisão foi **registrar em vez de remover**: `allow_files` foi substituída na prática
por `allow_vision` (18-D), mais específica; `allow_external_search` fica de pé caso a pesquisa
externa volte como tarefa avulsa.

⛔ **Não escreva migration para apagá-las.** Remover coluna no fechamento de fase é a mudança de
schema mais arriscada possível pelo menor ganho possível.

---

## Placar

| Subfase | Critérios | ✅ validados | ⏳ pendentes da conferência à mão | ⊘ retirados |
| --- | --- | --- | --- | --- |
| 18-A | 84 | 81 | 3 | — |
| 18-B | 16 | 12 | 4 | — |
| 18-C | 17 | 15 | 2 | — |
| 18-D | 17 | 14 | 3 | — |
| 18-E | 14 | 12 | 2 | — |
| 18-F | 15 (16 linhas) | 8 | 3 | 4 |
| **Fase 18** | **163** | **142** | **17** | **4** (+1 parcial) |

⚠️ **Os 4 retirados não contam no denominador do que foi prometido**; eles saíram do escopo no
desenho, com motivo, e com o dono de acordo. Denominador efetivo: **159**, dos quais **142 estão
validados** e **17 dependem da conferência à mão** (o critério F-4 conta uma vez, como pendente:
a metade entregue — teclado — está por conferir, e a outra, F-4b, foi retirada).

---

## O que NÃO foi validado, e por quê

Nenhum destes é "provavelmente certo". São os itens cuja evidência exigiria um navegador com
sessão, e o projeto roda em `environment: "node"` com zero `.test.tsx` (invariante 25).

| # | Critério | O que falta ver |
| --- | --- | --- |
| A-41 | Recarregar a página no meio do streaming não perde a conversa | Abrir `/ia`, mandar uma pergunta longa, recarregar durante o streaming |
| A-79 | pt-BR / BRL / data brasileira em toda a UI | As oito seções de `/ia` + o painel, lidas |
| A-80 | Dark e light · responsividade | As oito seções em 1440 px e 320 px, nos dois temas |
| B-6 | "Ver dados usados" abre os registros reais | Clicar numa fonte e conferir que o registro abre |
| B-8 | Troca de agente preserva a conversa | Trocar de assistente no meio de uma conversa |
| B-9 | Contexto da página é visível e desligável | O controle na tela do chat |
| B-16 · C-17 · D-17 · E-14 · F-15 | Transversais de cada subfase | Os dois itens visuais acima (os demais transversais estão verdes) |
| C-13b | Compra dividida com terceiro pela IA | **Não é pendência de conferência: é decisão.** A ferramenta declara que não divide |
| D-1 | Recibo legível extrai corretamente | Um comprovante real em `/ia/comprovantes` |
| D-14 | Comprovante fica anexado ao registro | Confirmar uma proposta de documento e ver o anexo no lançamento |
| E-3 | Fontes do insight abrem os registros reais | Clicar numa fonte em `/ia/insights` |
| F-4a | Botão flutuante por teclado | `Ctrl/⌘ + I` abre · `Tab` alcança · `Esc` fecha · o foco volta · com `floating_hidden` o atalho continua abrindo |
| F-8 | Deep-links da busca global abrem | Buscar um trecho de conversa, insight, ação e memória |

⛔ **Some a esta lista a tabela de 10 itens do Bloco 4** (`docs/handoff/NEXT_AGENT_INSTRUCTIONS.md`),
que também espera um navegador com sessão. As duas listas são a mesma pendência.

---

## Verificação

Rodada no fechamento do Bloco 5, em 2026-09-20:

| Comando | Resultado |
| --- | --- |
| `npm run lint` | (ver `CURRENT_STATUS.md`, seção do Bloco 5) |
| `npx tsc --noEmit` | idem |
| `npm run test:run` | idem |
| `npm run build` | idem |
| `npm run perf:bundle` | idem |
| `TZ=UTC npx vitest run` | idem |
