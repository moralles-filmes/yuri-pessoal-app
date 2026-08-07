# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

# Sistema Pessoal Yuri

Sistema pessoal **single-user** (finanças, cartões/faturas, parcelamentos, gastos de terceiros, importação, agenda + Google Agenda, **TO-DO**, tarefas/rotinas, hábitos, estudos, **dieta e alimentação**, **treinos**, dashboards, busca global, notificações). Next.js 16 + Supabase + Tailwind v4 + shadcn/ui. Locale **pt-BR**, moeda **BRL**, datas no formato brasileiro.

## Estado do projeto

As **14 fases do roadmap original**, a **Fase 15 — Módulo TO-DO**, a **Fase 16 — Dieta e Alimentação** e a **Fase 17 — Treinos** estão **concluídas**. As duas frentes grandes (16 e 17), abertas em **2026-08-03** e divididas em 6 subfases cada (A–F), fecharam em **2026-08-04**: **40 de 40** e **55 de 55** critérios de aceite validados. **Não há 16-G nem 17-G** — o projeto está em manutenção/iteração e melhoria entra como tarefa avulsa.

| Fase | Módulo | Situação |
| --- | --- | --- |
| **16** | Dieta e Alimentação (`/nutricao`) | ✅ **CONCLUÍDA** (16-A a 16-F, 2026-08-04) — em manutenção/iteração |
| **17** | Treinos (`/treinos`) | ✅ **CONCLUÍDA** (17-A a 17-F, 2026-08-04) — em manutenção/iteração |
| **18** | Inteligência Artificial (`/ia`) | 🟡 **EM ANDAMENTO** — 18-A ✅ (2026-08-04), 18-B ✅ (2026-08-07). **18-C é a próxima** |

Ver `docs/project/CURRENT_STATUS.md` e `docs/handoff/NEXT_AGENT_INSTRUCTIONS.md`. Conferido no banco em 2026-08-04, depois da 18-A: **119 tabelas** no `public` — **32 `nutrition_*`** + **29 `training_*`** + **13 `todo_*`** + **7 `ai_*`** + **4 centrais `body_*`** (16-E, compartilhadas com Treinos). A 18-B somou **2 `ai_*`** (`ai_run_steps`, `ai_tool_calls`), então são **9** — mas o total do `public` **não foi reconferido no banco**. O número muda a cada subfase: **conte antes de citar**.

> As duas frentes compartilham repositório e banco. Ao editar `PROJECT_ROADMAP.md`, `CURRENT_STATUS.md`, `NEXT_AGENT_INSTRUCTIONS.md`, `src/types/supabase.ts` e `src/config/nav.ts`, **leia antes e edite de forma pontual** — sobrescrever leva embora o trabalho da outra frente.

## Dois módulos de tarefas coexistem (proposital)

| Módulo | Rota | Papel |
| --- | --- | --- |
| **TO-DO** (Fase 15) | `/todo` | Gerenciador **principal** de execução e pendências |
| Tarefas & Rotinas (Fase 09) | `/tarefas`, `/rotinas` | Legado + **rotinas** com check-in diário |

O TO-DO usa tabelas `todo_*` próprias em vez de evoluir `tasks`/`projects`, porque `tasks` está acoplado a `calendar_events.task_id`, `notifications/generate.ts`, `search/queries.ts` e `dashboard/queries.ts`. **Não remova `/tarefas`** sem migrar esses quatro pontos antes. Justificativa completa em `docs/phases/PHASE_15_TODO_COMPLETE.md`.

**Invariantes do TO-DO:** `atrasada` nunca é gravado (derivado na leitura); conclusão é idempotente pelo unique `todo_completions (user_id, task_id, scheduled_for)`; tarefa recorrente **avança a própria linha** (histórico em `todo_completions`) e reabrir volta a data sem criar ocorrência extra; nenhuma exclusão de projeto/seção/série acontece sem escolha explícita do destino das tarefas; recorrência é pura, com aritmética em `Date.UTC` (`src/lib/todo/recurrence.ts`).

**Entrada em linguagem natural** (`src/lib/todo/parse.ts`, puro, `hoje` injetado): nunca reescreve o texto digitado — devolve `title` derivado + `tokens` que a UI mostra como chips **antes** de salvar; padrão ambíguo é ignorado; a normalização tira acentos **preservando o comprimento** (senão os índices das regex desalinham).

**Envio ao Google Agenda** (`src/lib/todo/calendar-sync.ts` + `google-event.ts`): opt-in por `google_integrations.todo_sync_enabled`; sentido único (tarefa → evento); tarefa recorrente **não vira RRULE** — só a ocorrência atual, movida a cada conclusão; excluir tarefa chama `removeTaskFromGoogle` **antes** do delete (a ponte `todo_calendar_sync` é `on delete cascade`); falha do Google nunca derruba a ação.

## Módulo Dieta e Alimentação (Fase 16, CONCLUÍDA)

Rota `/nutricao`, tabelas `nutrition_*`, navegação interna própria com 12 submódulos. A **16-A** entregou schema, base nutricional, núcleo de cálculo e catálogo de alimentos; a **16-B** entregou metas com histórico datado, diário alimentar com snapshot imutável e planejamento com modelos de semana; a **16-C** entregou receitas (com rendimento e peso final informado), refeições-modelo e substituições com comparação explícita; a **16-D** entregou lista de compras (gerada do planejamento, consolidada por família de unidade) e despensa; a **16-E** entregou o **módulo central de medidas corporais `body_*`** (que ela CRIOU e a 17-E consome), fotos privadas de evolução, relatórios por período e a visão de mês do diário. Integrações e polimento vêm na 16-F (`docs/phases/PHASE_16_*`).

**Invariantes do módulo:**
1. **Ausência de dado NÃO é zero.** `value_state` (`disponivel|traco|nao_disponivel|nao_aplicavel|em_revisao`) distingue "medido zero" de "não medido"; uma CHECK garante no banco. Toda soma propaga `exato|aproximado|parcial` e a UI mostra isso. Nunca `amount ?? 0` fora de `calc.ts`.
2. **Todo total sai de `src/lib/nutrition/calc.ts`** — reuse `convertToBase` + `scaleNutrients` + `sumNutrients` + `mergeTotals`. Reimplementar a conta faz diário, receita e relatório discordarem.
3. **`user_id is null` = base do sistema, imutável.** Policies **separadas por comando** (SELECT alcança o global; escrita não). Favoritar/arquivar/recategorizar grava em `nutrition_food_prefs`; duplicar cria cópia com `origin_food_id`.
4. **Conversão impossível é erro tipado, nunca estimativa** (g→ml exige densidade). Sem conversão genérica entre alimentos.
5. **Nunca materialize nutriente** em coluna de `nutrition_foods` — o pivô é a view `nutrition_foods_view` (derivação, não segunda verdade).
6. **Nenhum valor nutricional é inventado.** Base = TACO 4ª ed. (NEPA/UNICAMP), do XLSX oficial, com licença de reprodução mediante citação. Pipeline em `scripts/nutrition/`, atribuição em `data/nutrition/taco-4/ATTRIBUTION.md`. Fonte nova entra pelo mesmo pipeline, com licença registrada.
7. **Arredondar só na apresentação** (`roundForDisplay`, precisão por nutriente).
8. **A água continua sendo do módulo Hábitos** — Dieta lê e linka, não duplica.
9. **O histórico do consumo é imutável** (16-B). `nutrition_diary_entries` congela nutrientes, quantidade, conversão e procedência **no ato do registro** (`nutrients_snapshot jsonb`); o total do dia soma esse jsonb e nunca o catálogo. `food_id` é `on delete set null`; o discriminador estável é `entry_kind`. Reuse `buildDiaryEntrySnapshot` — receita e refeição-modelo (16-C) entram pelo **mesmo** caminho de gravação.
10. **Planejado ≠ consumido**; **`pendente` não existe no CHECK** (deriva de `planned_time` + agora); **a meta de um dia é a que valia nele** (`nutrition_goal_periods`); **nenhum escopo de edição do planejamento alcança o passado**.
11. **`ON CONFLICT` não serve para os índices únicos parciais/de expressão deste módulo** — o Postgres não os infere e o `upsert` do PostgREST quebra **só em runtime** (`42P10`). Use select-then-insert/update. E `.eq(coluna, null)` não casa com NULL no PostgREST: use `.is(coluna, null)`.
12. **Sem prescrição.** O estimador de gasto energético é opcional, mostra a fórmula, se identifica como estimativa e **nunca grava meta**.
13. **O peso de uma comida pronta é INFORMADO, nunca deduzido** (16-C). `nutrition_recipes.total_weight_g` vem da balança do usuário; sem ele o "por 100 g" fica **indisponível com explicação**, em vez de cair para a soma dos ingredientes crus. Alterar o rendimento recalcula a porção **sem** mexer no total.
14. **Receita e refeição-modelo entram no diário pelo MESMO caminho** (16-C): `buildRecipeEntrySnapshot` **chama** `buildDiaryEntrySnapshot`, e `entry_kind` aceita `receita`/`modelo`. Sem peso final, a receita só é registrada em porções — e `grams_equivalent`/`base_quantity`/`base_unit` ficam **nulos**, nunca zero.
15. **A qualidade agregada viaja com o número** (16-C): `SnapshotNutrient`/`ComputedNutrient` têm `quality` opcional (só em valor somado) e `sumNutrient` o respeita — senão uma receita parcial entraria no dia como exata.
16. **Substituir exige confirmação e grava histórico** (16-C). A tela mostra original × alternativa, diferença por macro, impacto no dia e o que resta da meta; o servidor **recalcula** antes de gravar. Nenhuma equivalência é afirmada; a ordem das alternativas é a prioridade **do usuário**. Adicionar o mesmo modelo duas vezes **não duplica** o consumo.
17. **A lista de compras NÃO soma unidades incompatíveis** (16-D). 200 g de arroz + 1 xícara de arroz só viram uma linha com conversão real cadastrada; sem ela, linhas separadas com o motivo em `separate_reason`. Massa com massa, volume com volume — **g ↔ ml exige densidade**; `un` é contagem, não massa. Tudo em `src/lib/nutrition/shopping.ts` (reusa `toBaseUnitValue`); não reimplemente a decisão em outro lugar.
18. **Origem congelada, ajuste manual preservado, nada some sozinho** (16-D). `origins` (jsonb) guarda de qual refeição/data/receita veio cada parcela; `quantity_overridden` sobrevive à regeração; item digitado à mão nunca é tocado; o que o planejamento não pede mais vira **obsoleto para confirmar**, não exclusão. Ação em massa não alcança registro fora do filtro atual (`selectionInScope`).
19. **Medidas corporais são `body_*`, MÓDULO CENTRAL** (16-E) — a 16-E **criou**, a 17-E **consome**, código em `src/lib/body/`. Nunca `nutrition_measurement_*`, nunca duas tabelas de peso corporal. `nutrition_profiles.weight_kg` é o peso do PERFIL, não histórico.
20. **Dia sem registro NÃO é zero** (16-E) — a regra 1 aplicada ao tempo. Série, calendário e relatório devolvem `null`; o gráfico interrompe a linha (`connectNulls={false}`) e a UI escreve "sem registro". Dia com meta e sem registro **não entra** na aderência média. Média móvel só com a janela cheia.
21. **As fotos de evolução são o dado mais sensível do sistema** (16-E). Bucket privado reusado da Fase 14, nome aleatório, pasta `{user_id}/…`, **URL assinada de 5 min gerada a cada leitura**, tipo e tamanho validados **no servidor** sobre o arquivo real, e FK composta `(attachment_id, user_id)` impedindo reivindicar anexo alheio. `storage_path` não sai do servidor. Essa FK composta **impede o embed do PostgREST** — `getProgressPhotos` faz duas consultas de propósito.
22. **Relatório de período passado sai do SNAPSHOT, com a meta da época** (16-E). `reports.ts` entra por `dayTotals` e resolve `goalPeriodForDate` dia a dia. Sem prescrição também nas medidas: sem "peso ideal", sem IMC classificatório, e consumo × corpo lado a lado **sem afirmar causalidade**.
23. **A despensa é opt-in e não é ERP de estoque** (16-D). Seis campos, sem movimentação; marcar comprado não dá baixa. O desconto é mostrado **antes** de aplicar e recalculado no servidor; cobertura total **não zera** a quantidade (o item vira `removido`). `quantity` nula = "não sei quanto" (não desconta); zero = "acabou". **A lista não tem link público** — exportar e imprimir sim.

**Invariantes acrescentadas pela 16-F (integrações):**
24. **`filterByPrefs` é o ÚNICO ponto onde a preferência de notificação decide** (`src/lib/notifications/generate.ts`, chamado pelo Cron). Até a 16-F, `settings.notification_prefs` era salvo e **nunca lido**. Filtrar num lugar só é o que impede um tipo novo de escapar da preferência por esquecimento de quem o escreveu. `notificationEnabled` tem semântica de **opt-in** para os tipos em `NOTIFICATION_OPT_IN_TYPES` (ausente = DESLIGADO).
25. **Notificação de Dieta informa, nunca repreende.** Um teste varre um vocabulário proibido em todo título e descrição gerados por `src/lib/notifications/nutrition.ts`; nenhuma é `high`/`urgent`, e todas oferecem um caminho. Chaves de dedupe **semanais** onde um aviso diário viraria cobrança. Passar da meta **não** gera aviso.
26. **`src/lib/search/nutrition-links.ts` é a fonte única dos deep-links do módulo** (busca global e notificações). A **despensa não é rota própria** — é `?aba=despensa` de `/nutricao/compras`; um link direto vira 404.
27. **O registro rápido entra pelo caminho oficial.** `quickAddDiaryEntry` só resolve a refeição do dia e delega para `addDiaryEntry`/`addMealTemplateToDiary`: o snapshot nasce idêntico ao do registro normal. Nunca monte snapshot fora de `snapshot.ts`.
28. **`src/lib/settings/export-tables.ts` é ponto de contato entre as duas frentes.** A lista do backup saiu da rota e virou módulo puro testado (nenhum token, nenhuma view). Ao acrescentar tabelas, **some a sua seção**, não reescreva a do outro.
29. **Foto de receita segue a disciplina das fotos de evolução** (16-E): bucket privado, validação do arquivo real no servidor, nome aleatório, pasta `{user_id}/…` e **URL assinada de 5 min gerada a cada leitura**. `storage_path` **não sai do servidor**.

## Módulo Treinos (Fase 17, em andamento)

Rota `/treinos`, tabelas `training_*` (28), navegação interna própria com 13 submódulos. A **17-A** entregou o vocabulário do domínio, o catálogo de exercícios (base autoral de 106 movimentos) e as preferências do módulo; a **17-B** entregou programas, treinos-modelo com construtor, séries configuráveis, supersets, versionamento e planejamento semanal; a **17-C** entregou a sessão ao vivo — preparação, snapshot congelado, cronômetro por timestamp, fila local e finalização com revisão; a **17-D** entregou histórico navegável, volume transparente, recordes consolidados, 1RM estimado e sugestão de progressão; a **17-E** entregou metas (com status derivado e histórico de alterações), dashboards de semana/mês/ano, relatórios com exportação CSV, o calendário de consistência e a evolução corporal **consumindo o módulo central `body_*`**. Integrações e polimento vêm na 17-F (`docs/phases/PHASE_17_*`).

**Invariantes do módulo:**
1. **`tracking_type` é um contrato de medição, não um rótulo.** Ele diz o que o exercício mede (peso×reps, reps, segundos, distância, calorias). `src/lib/training/tracking.ts` é a **única** matriz — formulário, treino-modelo, sessão, volume e relatório leem dali. É o que impede o módulo de somar quilos com segundos.
2. **Assistência SUBTRAI carga; carga adicional soma.** Inverter o sinal mostraria progresso na regressão. Por isso a carga planejada tem **três colunas separadas** (`planned_weight_kg`, `planned_additional_weight_kg`, `planned_assistance_weight_kg`) — num campo só, alguma tela erraria o sinal.
3. **Sem peso corporal do dia, a carga efetiva é INDISPONÍVEL, nunca zero.** Agregado incompleto é marcado como **parcial**, com o motivo — mesma disciplina do `value_state` da Dieta.
4. **`user_id is null` = base do sistema, imutável.** Policies **separadas por comando** + três constraints amarrando `user_id is null` ⇔ `is_system_exercise` ⇔ `source='sistema'`. Favoritar/arquivar/apelidar grava em `training_exercise_prefs`; duplicar cria cópia com `origin_exercise_id`.
5. **Modelo é mutável; execução é imutável** (17-C, cumprida). `startSession` congela o treino em `training_sessions.workout_snapshot` **e** nas linhas de `training_session_exercises`/`training_session_sets`; `src/lib/training/session-queries.ts` **não tem uma única referência a `training_workouts`**. `workout_id`/`exercise_id` são `on delete set null` — referência informativa, nunca fonte de leitura. Editar ou excluir o modelo não muda a sessão registrada (verificado no banco). O versionamento de treino (`version` + `superseded_by` + `version_group_id`) serve para **comparar intenções**, não para proteger histórico.
6. **`expandPlannedSets` (`src/lib/training/workout.ts`) é o formato ÚNICO de série planejada**, resolvendo tanto o caso uniforme (`default_sets`) quanto o configurado série a série (`training_workout_sets`). A 17-C consome só esse formato. Existindo linha configurada, ela é a verdade; `null` na série herda do exercício.
7. **Status do planejamento é derivado na leitura.** `training_scheduled_workouts.status` grava só fato; **`atrasado` e `hoje` saem de `derivePlannedStatus(entry, hoje)`** com `hoje` injetado pelo servidor. **`concluido` não é gravável pela 17-B** — quem conclui um treino é a sessão (17-C).
8. **Nenhuma exclusão silenciosa.** Excluir programa pergunta o destino dos treinos; excluir treino pergunta o destino do planejamento **futuro** (o passado nunca é alterado). Os schemas dessas ações **não têm valor padrão** para a escolha. No banco: `exercise_id` do treino é `on delete restrict`; `workout_id` do planejamento é `on delete set null`.
9. **Nenhum asset de terceiros.** Base de exercícios autoral, sem imagem/vídeo/texto/dados copiados de apps de treino. Procedência em `data/training/exercise-base/ATTRIBUTION.md`; pipeline em `scripts/training/`.
10. **Medidas corporais são `body_*`**, módulo central compartilhado com a Dieta. A 16-E CRIOU as 4 tabelas e a **17-E CONSOMIU** por `src/lib/body/queries.ts` e `src/lib/actions/body-measurements.ts` — sem criar nada (conferido no banco). `getLatestWeight()` pré-preenche o peso na preparação da sessão; `training_sessions.body_weight_kg` continua sendo o peso USADO naquele treino, congelado, **não** histórico de medida. **Nunca duas tabelas de peso corporal.**
11. **Sem prescrição, sem diagnóstico**, sem garantia de resultado, sem sugestão de carga máxima e sem incentivo a treinar com dor. Objetivo e nível de programa são organizacionais.
12. **Todo agregado sai de `src/lib/training/metrics.ts`** (17-D) — como todo total da Dieta sai de `calc.ts`. Cada `tracking_type` acumula na SUA unidade; a **regra de contagem** (aquecimento dentro/fora, unilateral em `por_lado`/`soma_dos_lados`/`serie_completa`) aparece na tela ao lado do número, e agregado incompleto é **parcial** com o motivo. Drop set soma os blocos e conta como **uma** série. Metas, dashboards e relatórios (17-E) **consomem** por `dashboards.ts`/`reports.ts` e nunca recalculam — há teste comparando o dashboard com `aggregateSessions`.

20. **Status da meta é derivado na leitura** (17-E): `atingida`, `expirada` e `em_atraso` saem de valor × alvo × prazo com `hoje` injetado, e o CHECK do banco **recusa** os três. Decisão do usuário (pausada, concluída, cancelada) vence sempre. **Alterar uma meta não reescreve o passado**: cada campo alterado vira linha em `training_goal_progress`.

21. **Período sem treino não vira zero nem `NaN`** (17-E). Meta sem medição devolve `null` com motivo; comparação sem base anterior devolve `null` e a tela escreve "sem base". Já um período de frequência sem nenhum treino vale 0 — aí o zero é fato medido.

22. **O calendário de consistência não cobra ninguém** (17-E). Dia livre é dia livre: sem vermelho de alarme, sem "faltas", sem "você falhou". A distribuição por grupo muscular é **"seu registro de treinamento"**, nunca "o ideal é X séries".
13. **O fluxo da sessão sai de `session-flow.ts`** (17-C): concluir a 3ª de 4 séries leva para a **4ª série**, não para outro exercício; superset alterna A1→B1→A2→B2. E o estado sai de `session-machine.ts` — nenhuma action grava `status` direto.
14. **Cronômetro nasce de timestamp, nunca de contagem local** (`timers.ts`, `agora` injetado). Tempo ativo = total − **união** de pausas e descansos. Só um descanso ativo e só uma sessão em execução — índices únicos parciais garantem no banco.
15. **Toda gravação de série carrega `client_mutation_id`** (uuid do dispositivo, unique por sessão), e a action confere se já foi aplicada **antes** de aplicar: clique duplo, retry da fila e duas abas convergem para uma linha.
16. **Recorde é consolidado, não marcador** (17-D). `training_session_sets.is_personal_record` é só candidato; a verdade é `training_personal_records`, consolidada por `record_key` com a marca anterior preservada. **Empate não gera recorde novo**, e excluir uma sessão **recalcula** (o segundo melhor assume, com a data dele).
17. **1RM é estimativa**, com a fórmula visível e escolhível; 1 repetição devolve o próprio peso, e acima de 12 repetições a UI avisa e o valor **não vira recorde**. Nada no módulo sugere carga máxima.
18. **Progressão nunca é aplicada sozinha** (17-D): a regra é do usuário, avaliada sobre as últimas N sessões (N ≥ 2), com motivo em pt-BR; aceitar é a única escrita da 17-D no treino-modelo. **Dor registrada bloqueia sempre**, e o bloqueio não é configurável.
19. **Não prometemos offline.** Não há service worker; o que existe é fila local + reenvio em ordem + status de sincronização sempre visível. A sessão em execução vive no servidor, então fechar a aba e reabrir recupera tudo.

**Invariantes acrescentadas pela 17-F (integrações):**
20. **A FONTE DE VERDADE É DECLARADA E ÚNICA.** *O treino aconteceu* → `training_sessions` (o hábito "Treinar" **reflete** por `habit-sync.ts`, upsert na linha única de `habit_logs` do dia — nunca um segundo registro). *Está planejado para o dia* → `training_scheduled_workouts` (agenda e TO-DO são **espelhos opcionais**, com vínculo). *Peso e medidas* → `body_*`. *Dia é de treino ou descanso* → Treinos responde (`day-kind.ts`), **a Dieta consome** — e dia sem informação **não** vira "descanso".
21. **Nenhuma integração é automática.** Agenda (`google_integrations.training_sync_enabled`), TO-DO (por clique) e o vínculo do hábito (`training_preferences.habit_id`) nascem **desligados**. Falha do Google nunca derruba a ação: fica em `training_calendar_sync.last_error`, **sem token e sem corpo de resposta**. Excluir dia planejado remove o evento **antes** do delete (a ponte é `on delete cascade`).
22. **Notificação de Treinos informa, nunca cobra.** 9 famílias, todas `low`/`medium`, todas com link, `dedupe_key` determinístico (rodar o Cron 3× não duplica) e um teste que varre vocabulário proibido **e** vocabulário de prescrição. `training_goal_progress` nasce **desligado** (opt-in). **Não existe tipo `training_measurement_due`**: a medição corporal já é avisada por `nutrition_measurement_due`, porque a tabela é a mesma (`body_*`) — dois tipos dariam dois avisos para o mesmo fato.
23. **FK COMPOSTA sempre que uma tabela apontar para outra dentro do mesmo usuário.** A RLS confere o `user_id` da **própria linha** e não alcança a linha apontada. Sem isso, um intruso ocupava a chave única `(scheduled_workout_id, provider)` da ponte da agenda e **impedia o dono de sincronizar** aquele dia. Mesma correção da 16-E nas fotos de evolução.
24. **`getSessionHistory` aceita `client`/`userId`** para o Cron (service role, sem sessão) usar **a mesma leitura da tela**. Um segundo caminho de montagem do histórico faria o número da notificação divergir do número da tela.

## Módulo Inteligência Artificial (Fase 18 — 18-A e 18-B implementadas)

Rota `/ia`, tabelas `ai_*` (9), 6 subfases (A–F). A **18-A** (2026-08-04) entregou contratos
internos, 4 adapters, catálogo de modelos e tarifas versionado, credenciais cifradas, chat com
streaming, medição por tentativa e orçamento com reserva — **sem ler um único registro**. A
**18-B** (2026-08-07) abriu a primeira leitura: 3 ferramentas de Treinos, laço de ferramentas
próprio, roteamento por agente, contexto de página, auditoria por chamada e rastreabilidade
na tela. Desenho em `docs/superpowers/specs/2026-08-04-modulo-ia-design.md`; camadas em
`PROJECT_ARCHITECTURE.md`.

⚠️ **A IA lê Treinos, e SÓ se `allow_training` estiver ligada** (nasce `false` no banco;
a chave está em `/ia/configuracoes` desde a 18-B). Os outros 8 módulos não têm ferramenta
nenhuma — a chave deles aparece **desabilitada**, com o motivo, e se habilita sozinha quando
a 18-C publicar a primeira leitura. Nenhuma ferramenta de ESCRITA existe.

**As regras arquiteturais que valem daqui em diante:**

1. **A IA nunca acessa o banco direto.** Sem SQL livre, sem consulta montada pelo modelo, sem
   `service_role` no caminho da requisição, sem ferramenta criada em runtime. Toda leitura e
   escrita passa pelo Tool Registry **estático**, com allowlist por agente — o modelo pede, o
   backend valida e executa.
2. **`user_id` sempre de `authContext()`**, nunca do modelo: não existe nos schemas de entrada
   das ferramentas, e Zod `.strict()` rejeita campo a mais.
3. **Nenhuma regra de negócio é reescrita.** As ferramentas reusam os serviços que os
   formulários já usam; commands são extraídos **sob demanda na 18-C**, e `revalidatePath` fica
   na casca da Server Action.
4. **O SDK de IA vive só em `src/lib/ai/providers/`.** `core/` e o resto dependem de contratos
   internos — garantido por ESLint, `server-only` e teste.
5. **Dado é dado, nunca instrução.** Registro, resultado de ferramenta, documento e imagem
   entram como bloco não confiável, jamais como mensagem de sistema.
6. **⚠️ Exceção do streaming (a segunda do projeto, depois do auth):** o chat usa Route Handler
   `POST /api/ia/chat` porque Server Action não serve para SSE contínuo. Ele é **transporte
   apenas** — sem regra de negócio, com auth e Origin checados explicitamente (Route Handler
   **não** herda a proteção CSRF que o Next dá a Server Action), e ferramenta nenhuma executa
   nele sem passar pelo Tool Executor. **Isso não autoriza criar outros endpoints.**

**Invariantes que a 18-A fixou no código e no banco:**

7. **A chave de API nunca é gravada em claro.** Envelope AES-256-GCM: DEK por credencial,
   embrulhada pela master key de `AI_MASTER_KEYS` — que vive **só no ambiente do servidor**.
   O AAD `credential_id | owner_id | provider | key_version` amarra o ciphertext à linha: movê-lo
   para outro dono ou provedor **falha**. Sem a master key, **só a IA para**; o resto do sistema
   funciona normalmente. Chave curta não ganha padding, senha humana não vira master key.
8. **A admissão de um chat é ATÔMICA e o commit vem ANTES da chamada externa.**
   `ai_begin_chat_run` (`SECURITY INVOKER`, `search_path = ''`, `pg_advisory_xact_lock`
   **transacional** por usuário) valida rate limit + orçamento e cria conversa + mensagem + run
   + mensagem do assistente numa transação. **Nenhum lock ou transação sobrevive ao streaming.**
   Timeout do lock é **429**, não 500.
9. **O run é reserva financeira.** `consumo = Σ custo dos terminais + Σ reserva dos
   não-terminais não vencidos`, e todo run está em **exatamente um** dos somatórios. A reserva
   usa a tarifa do modelo **mais caro da cadeia de fallback autorizada** — fallback não ganha
   reserva nova.
10. **`ai_usage_events` é por TENTATIVA**, `UNIQUE (run_id, attempt_index)` + FK composta.
    Idempotência é `INSERT` + `23505` (nunca select-then-insert). A policy de UPDATE exige
    `status = 'started'`: **tentativa terminal é imutável no banco**, e não há policy de DELETE.
11. **Ausência nunca é zero.** Provedor que não informa tokens → `estimated_cost` nulo +
    `usage_availability`; total com alguma tentativa sem custo é exibido como **parcial**.
12. **Moeda canônica USD, sem câmbio.** Custo de IA é estimativa, não é transação do usuário e
    **não entra** nos relatórios de finanças.
13. **Preço mora só em `core/pricing.ts`**, com `effective_from`/`effective_until` e
    `verified_at` por entrada. **Modelo sem tarifa não é selecionável** — sem preço não há
    reserva, e sem reserva o orçamento não protege nada.
14. **Tool Registry NASCE VAZIO na 18-A**: nenhuma definição vai ao provedor, e tool call
    inesperada encerra o run como `failed` com `UNEXPECTED_TOOL_CALL`, sem executar nada.
15. **Trava de honestidade** — **reescrita na 18-B** (prompt-base `seguranca-v2`): a v1 mandava
    o prompt afirmar que o assistente não consulta registro nenhum, e isso virou mentira quando
    a IA passou a ler Treinos. Agora o assistente **só sabe o que as ferramentas devolveram
    naquela conversa**, aponta o módulo quando não devolveram e **nunca inventa, estima nem
    infere número**. É critério de aceite, com teste.
16. ⚠️ **`no-restricted-imports` usa semântica de .gitignore**, não de caminho: padrão sem
    barra casa com qualquer componente (o grupo `"ai"` bloqueava `@/lib/ai/**` inteiro). Pacote
    vai em `paths`, não em `patterns`.

**Invariantes acrescentadas pela 18-B (primeira leitura de dado real):**

17. **O LAÇO DE FERRAMENTAS É NOSSO.** As ferramentas vão ao provedor **sem `execute`**: o SDK
    emite o `tool-call` e para. Quem valida e executa é o Tool Executor, em
    `src/lib/ai/server/tool-loop.ts`. Teto de **3 passos por TENTATIVA** (não por run — o run
    inteiro custa `(1 + maxRetries + maxFallbacks) × (1 + MAX_TOOL_STEPS)`, e `computeReservation`
    reserva nessa mesma base). Estourado o teto, a resposta **declara o corte** — número
    apresentado como completo depois de laço interrompido é a mentira que a subfase combate.
18. **`step_index` é DO RUN, nunca do laço.** `ai_run_steps` tem `UNIQUE (run_id, step_index,
    kind)` e o `run_id` é o mesmo em toda a cadeia de retry/fallback. Reiniciar a contagem por
    tentativa dava `23505` → `startStep` devolve `null` → **"sem trilha, sem leitura"** bloqueia
    a execução, e depois de qualquer retry a IA parava de ler e respondia com a mensagem de
    falha de auditoria, com o run fechando como `completed`. `TOOL_STEP` é o 4º tipo de tentativa.
19. **A flag `allow_*` VENCE o roteador.** `routeAgent` resolve o agente por texto ou contexto
    de página, mas `autorizado()` exige a permissão do módulo; sem ela a pergunta cai no
    orquestrador com `SEM_PERMISSAO`. O `agentId` do cliente é **preferência, nunca autorização**.
20. **A auditoria guarda o PEDIDO, nunca o RESULTADO.** `ai_tool_calls` grava ferramenta,
    `arguments_sanitized`, `records_read`, `refs` e desfecho — jamais o conteúdo devolvido, que
    seria uma segunda cópia dos dados pessoais dentro do módulo de IA. Consequência que a tela
    respeita: `completude` (do adapter) e `itens_truncados` (do executor) **não existem** lá, e
    a trilha não afirma nem que o dado estava completo nem que estava incompleto.
    ⚠️ **`records_read` é `ToolOutput.contagem` — quantos EXISTEM, não quantos chegaram ao
    modelo.** Com a poda por orçamento de caracteres os dois divergem de propósito; por isso o
    rótulo da tela é "registros encontrados".
21. **O contexto da página é SÓ a rota, de uma lista estática, e o módulo é resolvido no
    servidor.** A tela não manda conteúdo — nem HTML, nem título, nem estado, nem texto de
    registro. Aceitar `modulo` do cliente seria deixá-lo escolher a allowlist de ferramentas.
    A descrição de cada rota que entra no prompt é **allowlist por igualdade exata de chave**
    (com `Object.hasOwn`), nunca interpolação — e o bloco declara que a tela aberta **não é
    dado sobre os registros**, senão "ele está nos recordes" viraria "ele tem recordes".
22. **`refs` é o único campo da IA que vira `href`**, e a coluna é `jsonb` livre numa tabela
    imutável. `rotaInternaAceita` (`tools/sources.ts`) é **allowlist, não lista de proibidos**:
    recusar só `//` deixava passar `/\`, que o parser de URL resolve idêntico
    (`new URL("/\\evil.com", base).origin` sai do domínio), e `/<tab>/evil.com` atravessava
    qualquer checagem de prefixo porque o parser descarta tab/CR/LF antes de resolver.
23. **Tentativa nova começa com o TEXTO ZERADO, nos dois lados** — servidor no evento `switch`
    e cliente ao recebê-lo. `TOOL_STEP` é exceção declarada (é a mesma resposta continuando).
    Corrigir só um dos lados reintroduz o defeito ao contrário: o `router.refresh()` apagaria
    da tela um texto que o usuário já tinha visto.
24. **`toolsForPermission` decide se a chave `allow_*` é clicável.** Derivado do registry, não
    de uma lista escrita à mão de "módulos prontos" — que ficaria para trás nos dois sentidos
    (botão que não liga nada, ou ferramenta pronta sem chave para ligá-la).
25. ⚠️ **O projeto não tem infraestrutura de teste de componente** (`environment: "node"`, zero
    `.test.tsx`). Enquanto for assim, o contrato entre runner e tela é verificado por varredura
    do código-fonte (`src/lib/ai/chat-events.test.ts`): **evento SSE novo exige `case` na tela,
    ou a suíte fica vermelha**. Foi assim que o evento `tool` deixou de ser ignorado em silêncio.

## Leitura obrigatória antes de mexer no código

Projeto **documentação-primeiro**. Antes de implementar, leia nesta ordem:

1. `docs/project/PROJECT_BRIEFING.md` — fonte de verdade (o que é o sistema)
2. `docs/project/PROJECT_RULES.md` — regras obrigatórias de trabalho
3. `docs/project/PROJECT_ARCHITECTURE.md` — stack, padrões e schema
4. `docs/project/CURRENT_STATUS.md` — o que cada fase entregou + decisões técnicas
5. `docs/handoff/LAST_PHASE_SUMMARY.md` e `docs/handoff/NEXT_AGENT_INSTRUCTIONS.md`
6. O arquivo da fase relevante em `docs/phases/PHASE_XX_*.md` (a feature que você for tocar)

Regras-chave que não estão no código: não quebrar o existente; manter dark/light + responsividade em tudo; RLS por `user_id` em **todas** as tabelas; pt-BR/BRL; **nunca** expor `service_role` no client.

## Regras de trabalho (obrigatórias)

1. **Sempre responda em português (pt-BR).**
2. **Antes de subir qualquer coisa para o Git, revise se não há nada sensível** — segredos, chaves, tokens, API keys, `.env`, `service_role`. **Nunca** suba o que não pode ser público. Confira o diff/arquivos antes de qualquer commit ou push.
3. **Ao final da tarefa, atualize este CLAUDE.md sem perguntar — mas só se for realmente necessário.** Mantenha apenas o que é essencial; não adicione informação supérflua nem "encha" o arquivo. Se nada estrutural mudou, deixe como está.

## Comandos

```bash
npm run dev            # next dev (Turbopack) — http://localhost:3000
npm run build          # build de produção (Turbopack; NÃO roda lint)
npm run lint           # eslint (next lint foi removido no Next 16)
npm run test           # vitest em watch
npm run test:run       # vitest run (suíte completa; 2.512 testes em 2026-08-07 — conte antes de citar)
npx vitest run src/lib/finance/invoice.test.ts   # um arquivo de teste
npx vitest run -t "fatura"                        # por nome do teste
npx tsc --noEmit       # checagem de tipos
```

Verificação de mudança "pronta": `npm run test:run` + `npm run lint` + `npx tsc --noEmit` + `npm run build`. Migrations de schema são aplicadas no Supabase via MCP (`apply_migration`) no projeto `yjvnlbjvippefvzgrxxw`.

## Next.js 16 — o que difere do que você "sabe"

Esta versão tem breaking changes (ver `AGENTS.md`; guias em `node_modules/next/dist/docs/`):

- **`middleware.ts` → `src/proxy.ts`** (função `proxy`, runtime nodejs). Faz refresh de sessão Supabase + proteção de rotas.
- **APIs de request são async:** `await cookies()`, `await headers()`, e `params`/`searchParams` em pages/layouts são Promises.
- **Turbopack por padrão**; `next lint` removido (use `npm run lint`); `next build` não roda lint.
- **Tailwind v4 CSS-first:** sem `tailwind.config.js`. Tokens via `@theme inline` + variáveis CSS em `src/app/globals.css` (`:root` light, `.dark` dark; cor de destaque dourada).

## Arquitetura (o "big picture")

### Camadas e fluxo de dados
O padrão dominante em todo o app é **Server Component (lê) → Server Action (muta) → `revalidatePath`/`router.refresh`**. As decisões de fase mencionam TanStack Query/Zustand, mas a implementação real padronizou Server Actions para consistência — `@tanstack/react-query` está instalado mas o app não o usa para o fluxo principal. Siga o padrão Server Action ao adicionar features.

**Exceção — operações de auth:** login, cadastro, logout e **trocar e-mail/senha** usam o **client do navegador** direto (`auth.signInWithPassword`/`signUp`/`updateUser`), não Server Actions — precisam da sessão do client e do `window.location.origin` para o `emailRedirectTo` (não há `NEXT_PUBLIC_SITE_URL`). Ver `src/components/auth/auth-form.tsx`, `src/components/layout/user-menu.tsx` e `src/components/settings/security-card.tsx`. Trocar e-mail/senha reflete direto em `auth.users` (sem migration); a confirmação de e-mail volta pelo `/auth/callback`.

- **Páginas de módulo** em `src/app/(app)/<rota-ptbr>/page.tsx` são Server Components `force-dynamic` que chamam uma leitura agregada e renderizam um `*-client.tsx` (`'use client'`) para interatividade. Estado de filtro/visão vive na **URL** (`?view=&periodo=&date=`), não em estado global. Cada rota tem `loading.tsx` (skeleton).
- **Leituras** (server-only) ficam em `src/lib/<domínio>/queries.ts`. Costumam fazer **uma** consulta ampla e derivar tudo em memória (evitar N+1).
- **Mutações** ficam em `src/lib/actions/<domínio>.ts` (arquivos `"use server"`).

**⛔ Regra que veio de um bug real: campo de TEXTO nunca é controlado pelo valor da URL.**
Estado de filtro vive na URL — mas isso vale para clique (select, toggle, aba), não para
digitação. Como as páginas de módulo são `force-dynamic`, gravar a cada tecla faz o Next
buscar o RSC no servidor, e o `value` do input só atualiza quando a resposta volta: a letra
atrasa, o cursor pula e digitar rápido **perde caractere**. Use `useUrlText`
(`src/lib/forms/use-url-text.ts`): o texto responde local e alcança a URL depois da pausa,
preservando link, voltar e recarregar. As decisões de sincronia são puras em `url-text-sync.ts`
— inclusive a que distingue mudança **externa** (limpar filtros, voltar) do **eco atrasado da
própria digitação**, que era o que devolvia texto velho ao campo.

### Contrato das Server Actions (siga à risca)
Toda action segue o molde em `src/lib/actions/accounts.ts` + `src/lib/actions/helpers.ts`:
1. `const ctx = await authContext(); if (!ctx) return notAuthed;` — pega `{ supabase, userId }`. **`user_id` SEMPRE vem de `auth.getUser()`, nunca do client.**
2. Valida o input com Zod (`safeParse`); em erro → `invalid(parsed.error.flatten().fieldErrors)`.
3. Faz a query Supabase incluindo `user_id: ctx.userId` em inserts; em erro de DB → `dbError(...)`.
4. `revalidatePath(...)` das rotas afetadas e retorna `ActionResult<T>` (`{ ok: true, data } | { ok: false, error, fieldErrors? }`).

O client trata `ActionResult` com toast (sonner) — mensagens de erro em pt-BR.

**⛔ Duas regras que vieram de um bug real (formulário que nunca salvava, sem destacar campo):**

1. **O schema tem de aceitar a própria saída.** Com `zodResolver`, o react-hook-form entrega ao `onSubmit` a saída **já transformada**, o formulário manda isso para a action e a action valida de novo com o **mesmo** schema. Logo `parse(parse(x))` precisa funcionar — todo helper `optional*` aceita `null` na entrada, não só `""`/ausente. Fixado em `src/lib/validators/round-trip.test.ts`; acrescente ali todo schema novo usado com resolver.
2. **"Verifique os campos destacados" só vale se algum campo for destacado.** Use `mapServerFieldErrors` (`src/lib/forms/server-errors.ts`): erro de campo que existe na tela vira `setError`; erro de campo que a tela **não tem** sobe para o toast com o nome do campo. Descartar `fieldErrors` deixa o usuário sem saída.

### Layout responsivo — 5 regras que vieram de bugs reais

Todas saíram de defeitos que chegaram a **produção** e não aparecem no desktop de quem
escreveu a tela. Detalhe e medições em `docs/fixes/RESPONSIVIDADE_MOBILE.md`.

1. **`cn()` é `twMerge` — a classe do chamador REMOVE a da primitiva.** Não é soma: caem no
   mesmo grupo de conflito e a de fora vence. Consequências que já morderam:
   - Em `DialogContent`, **`max-w-*` sem prefixo não tem efeito de `sm` para cima** (o
     `sm:max-w-sm` da base vence). Para o diálogo crescer no desktop use **`sm:max-w-lg`**.
     O limite do celular já vem da primitiva — não repita.
   - Limite que a primitiva **não pode** deixar ser sobrescrito vai com prefixo de variante
     (`max-sm:max-w-[...]`): variante entra em outro grupo do twMerge e, no CSS gerado, sai
     depois das utilitárias sem prefixo.
2. **`min-w-0` em todo lado "texto" de flex que tenha irmão `shrink-0`** (ícone, badge,
   botão). Item de flex tem `min-width: auto` e não encolhe abaixo do conteúdo: o texto
   empurra o irmão para fora e, com `overflow-hidden` no card, ele é **cortado pela metade**.
   `truncate` também resolve (traz `overflow-hidden`, que zera o mínimo automático).
3. **Item de grid tem o mesmo `min-width: auto`, e `Button` é `whitespace-nowrap`.** Rótulo
   longo em grade apertada não quebra e **empurra a página inteira na horizontal**. Em grade
   de botões: menos colunas no celular (`grid-cols-3 sm:grid-cols-5`) ou `min-w-0` + `truncate`.
4. **Densidade de card se decide pela largura DO CARD, não da viewport** — `@container` +
   `@[13rem]:...`. Um card numa grade de 4 colunas tem ~115px num monitor de 1920; media
   query não enxerga isso. Elemento decorativo (ícone) some, conteúdo fica.
5. **O Header é `sticky top-0 z-30` com `h-16`.** Barra `sticky` dentro do conteúdo usa
   **`top-16`** (ou `top-18` se quiser folga) — nunca `top-0`/`top-2`, senão ela escorrega
   para trás do Header e o controle some ao rolar.

**Como conferir sem depender de sessão:** gere o CSS com `npx @tailwindcss/cli` sobre um HTML
de teste e tire screenshot com `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
--headless --screenshot --window-size=W,H`. Para dúvida de cascata, **procure a regra no CSS
do bundle** e compare as posições — o minificador reescreve (`width >= 40rem` vira
`min-width:40rem`), então grep por texto exato engana.

### Lógica pura + testes (regra forte do projeto)
Regras de negócio críticas são **funções puras com datas/`now` injetados (sem `Date.now()`)** em `src/lib/<domínio>/*.ts`, cobertas por Vitest co-localizado (`*.test.ts`, ambiente `node`). O I/O (Supabase) fica separado em `queries.ts`/`actions`. Exemplos canônicos: `src/lib/finance/invoice.ts` (regra de fatura cartão), `installments.ts`, `src/lib/notifications/generate.ts` (idempotência por `dedupe_key`), streaks de hábitos/estudos, recorrência de tarefas/agenda. **Ao mexer numa regra, ajuste/adicione testes puros — não teste via banco.**

Padrões recorrentes que valem entender lendo o código:
- **"Status derivado na leitura, nunca gravado":** fatura, `tasks.status='atrasada'`, cursos atrasados — todos calculados na leitura a partir de datas. Não persista esses estados.
- **Na importação, o identificador do arquivo (FITID) manda nos DOIS sentidos** (bug real, 2026-08-06): FITIDs **diferentes** ⇒ não é duplicata, mesmo com data+valor+descrição idênticos (duas compras iguais no mesmo dia existem); FITID **igual** só acusa duplicata se a chave composta também bater (o Nubank reusa o FITID entre o crédito de parcelamento e a 1ª parcela). E **trava de edição é por LINHA, não por lote** — senão marcar "não é duplicidade" depois do commit não tem como chegar à fatura; `commitImport` pode rodar de novo, pois só processa `para_importar`.
- **Parcela lançada NÃO está em `transactions`** (bug real, 2026-08-06): compra parcelada guarda só a **compra-pai** ali (o TOTAL, sem fatura); quem ocupa a fatura de cada mês é `transaction_installments`. Por isso `existingKeysFor` não via a linha "6/12" da fatura seguinte e o valor entrava em dobro — junto com o recebível do terceiro. `marcarParcelasJaLancadas` (`src/lib/import/parcelas-lancadas.ts`) roda **depois** da dedup, só sobre `para_importar`, casando por numeração+descrição-base, numeração+valor, ou valor+descrição-base na competência do lote. Descrição-base tira o "k/N" **antes** de normalizar (senão "5/12" vira "5 12" e os meses nunca casam). Só parcela **`ativa`** bloqueia; a conferência **não** roda no commit, para não apagar o "importar mesmo assim" do usuário.
- **Sinal de arquivo importado é DADO, não convenção** (bug real, 2026-08-06): OFX de cartão traz **compra negativa** (`TRNAMT < 0`, `TRNTYPE=DEBIT`); planilha/CSV de fatura traz compra **positiva**. Assumir uma delas fazia a fatura inteira entrar como **estorno** (total negativo) e a linha perder parcelamento e divisão. A convenção é detectada do arquivo (`detectarSinalNegativoDespesa`, por contagem de linhas e **sem** a linha de pagamento), gravada no lote e **corrigível na revisão** — junto com o sentido de cada linha. Detalhe em `docs/fixes/IMPORTACAO_SINAL_FATURA.md`.
- **O saldo diário do extrato sai de `src/lib/finance/daily-balance.ts`** e espelha `public.account_balance`: só `pago`/`recebido` entram, o sinal vem do `type`, e **lançamento de cartão não move saldo de conta** (não tem `account_id`; quem move é o pagamento da fatura, gravado como `transferencia` com destino nulo). Com filtro de cartão **não há saldo** — ausência, nunca zero. O saldo **ignora** os filtros de categoria/tipo/status: a lista encolhe, o saldo continua verdadeiro, por isso `getDailyBalances` busca a própria janela. A tabela de sinais vive em dois lugares (`account_balance_before` no SQL e `efeitoNoSaldo` no TS) — mexeu num, mexa no outro.
- **Dinheiro em centavos (integer)** no financeiro; formatação centralizada em `src/lib/format.ts` (`Intl.NumberFormat('pt-BR')`, `date-fns` com `ptBR`).
- **Datas locais pt-BR** (`'yyyy-MM-dd'` puro) em logs/streaks/heatmaps para evitar drift de UTC ("virar o dia").

### Fuso: o sistema inteiro é `America/Sao_Paulo`, nunca UTC
O processo roda com **`TZ=America/Sao_Paulo`** (`src/instrumentation.ts` + scripts do `package.json`) — sem isso a Vercel roda em UTC e tudo que lê o fuso "local" (`date-fns`, getters de `Date`, `Intl` sem `timeZone`) erra o dia entre 21h e 00h BRT. **Mas o `TZ` é rede de segurança, não a defesa principal:** o código não pode depender dele.

Distinga sempre os dois tipos de valor — é daí que vem todo bug de fuso deste projeto:
- **Data pura** (`'yyyy-MM-dd'`, coluna `date`): não tem fuso. Manipule como **texto**; nunca converta para `Date` só para formatar.
- **Instante** (`timestamptz`, `Date`, ISO com hora): grave em UTC (`toISOString()`) e **leia sempre em Brasília** com `dateInSaoPaulo` / `timeInSaoPaulo` / `formatDate`. **Nunca** `.slice(0, 10)` num timestamptz — isso devolve o dia em UTC.

Helpers em `src/lib/format.ts`: `hojeISO()` ("hoje" no servidor), `dateInSaoPaulo`/`timeInSaoPaulo` (instante → data/hora BRT), `saoPauloWallClockToInstant(data, hora)` (hora digitada → instante; o input do usuário é hora de **Brasília**, não do fuso do aparelho dele), `toDateTimeLocalInSaoPaulo`. `toDateInputValue` é só para ler de volta um `Date` construído componente-a-componente (ex.: `new Date(y, m, 0)`) — **nunca** para um instante.

Em `src/lib/calendar/format.ts`, `monthYearLabel`/`weekdayShort` recebem **data de grade** (meia-noite construída localmente) e não convertem; para rótulo de instante use `emBrasilia(ev.start)` antes de `longDateLabel`/`fullDayLabel`.

**Crons da Vercel são sempre UTC:** `vercel.json` usa `0 12` e `0 0` para rodar às **09h e 21h de Brasília**.

Testes de fuso não podem depender do `TZ` da máquina: use instantes absolutos (com `Z`) e valores esperados em BRT. A suíte deve passar em qualquer fuso — verifique com `TZ=UTC npx vitest run`.

### Clientes Supabase (3, não confunda)
- `src/lib/supabase/client.ts` — `createBrowserClient` (componentes client).
- `src/lib/supabase/server.ts` — `createServerClient` com `await cookies()` (Server Components/Actions/Route Handlers). `getCurrentUser()` é seguro mesmo sem Supabase configurado.
- `src/lib/supabase/service.ts` — **service role, SERVER-ONLY**. Usado **só** pelo Vercel Cron (`/api/cron/notifications`), que não tem sessão. Ignora RLS → **toda** query carrega `user_id` explícito. Nunca importar em código client.

### Segurança / multi-tenant (single-user na prática)
- **RLS + FORCE RLS em todas as tabelas** (34 até a Fase 14, 13 do TO-DO, 32 da Fase 16, 26 da Fase 17 — **conte antes de citar um número**), policies `using (user_id = auth.uid()) with check (...)`. Auth nativo do Supabase (`auth.users`).
- **Proteção de rotas** em `src/lib/supabase/proxy-session.ts`: tudo exige sessão exceto `PUBLIC_PATHS` (`/login`, `/cadastro`, `/auth`, `/recuperar-senha`, `/api/cron`). `/api/cron/*` é público para o proxy mas protegido por `CRON_SECRET` (Bearer) na própria rota.
- O app **degrada com elegância sem chaves**: sem credenciais Supabase o proxy só segue adiante; integrações Google e Cron só "ligam" quando suas env vars existem (ver `src/config/env.ts` e `.env.local.example`).

### Mapa de pastas
- `src/app/(auth)/` login/cadastro · `src/app/(app)/` shell autenticado (Sidebar+Header) com as rotas de módulo em pt-BR · `src/app/api/` route handlers (cron, export, google oauth).
- `src/components/ui/` shadcn · `layout/` · `shared/` (PageHeader, EmptyState, StatCard) · `providers/` (Theme, Query) · demais pastas por domínio.
- `src/lib/<domínio>/` (finance, calendar, tasks, habits, studies, dashboard, reports, search, notifications, import, google, settings) com `queries.ts` + lógica pura; `src/lib/actions/` (mutações); `src/lib/validators/` (schemas Zod).
- `src/config/nav.ts` (navegação) · `src/config/env.ts` · `src/types/supabase.ts` (gerado — **regenerar após migration**, via MCP `generate_typescript_types`).
- `supabase/migrations/` SQL versionado e idempotente (timestamp `YYYYMMDDHHMMSS`); cada tabela nova: `user_id` NOT NULL + RLS + FORCE RLS + índice em `user_id` + trigger `updated_at`.

## Ao concluir uma mudança relevante
Mantenha o handoff vivo (regra do projeto): atualize `docs/project/CURRENT_STATUS.md` e `docs/handoff/*` com o que mudou e decisões tomadas, e rode a verificação (testes/lint/tsc/build) antes de declarar pronto.
