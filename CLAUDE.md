# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

# Sistema Pessoal Yuri

Sistema pessoal **single-user** (finanças, cartões/faturas, parcelamentos, gastos de terceiros, importação, agenda + Google Agenda, **TO-DO**, tarefas/rotinas, hábitos, estudos, **dieta e alimentação**, **treinos**, dashboards, busca global, notificações). Next.js 16 + Supabase + Tailwind v4 + shadcn/ui. Locale **pt-BR**, moeda **BRL**, datas no formato brasileiro.

## Estado do projeto

As **14 fases do roadmap original** e a **Fase 15 — Módulo TO-DO** estão concluídas. Desde **2026-08-03** correm **duas frentes de módulo grande, em paralelo**, cada uma dividida em 6 subfases (A–F):

| Fase | Módulo | Situação |
| --- | --- | --- |
| **16** | Dieta e Alimentação (`/nutricao`) | **16-A a 16-E concluídas**; 16-F é a próxima (fecha a fase) |
| **17** | Treinos (`/treinos`) | **17-A a 17-E concluídas**; 17-F é a próxima (fecha a fase) |

Ver `docs/project/CURRENT_STATUS.md` e `docs/handoff/NEXT_AGENT_INSTRUCTIONS.md`. Fora dessas fases, o projeto segue em modo manutenção/iteração. **33 tabelas `nutrition_*`** + **28 `training_*`** + **4 tabelas centrais `body_*`** (16-E, compartilhadas com Treinos); o total do banco muda a cada subfase das duas frentes — **conte antes de citar um número**.

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

## Módulo Dieta e Alimentação (Fase 16, em andamento)

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
npm run test:run       # vitest run (suíte completa; 1.630 testes em 2026-08-04 — conte antes de citar)
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

### Lógica pura + testes (regra forte do projeto)
Regras de negócio críticas são **funções puras com datas/`now` injetados (sem `Date.now()`)** em `src/lib/<domínio>/*.ts`, cobertas por Vitest co-localizado (`*.test.ts`, ambiente `node`). O I/O (Supabase) fica separado em `queries.ts`/`actions`. Exemplos canônicos: `src/lib/finance/invoice.ts` (regra de fatura cartão), `installments.ts`, `src/lib/notifications/generate.ts` (idempotência por `dedupe_key`), streaks de hábitos/estudos, recorrência de tarefas/agenda. **Ao mexer numa regra, ajuste/adicione testes puros — não teste via banco.**

Padrões recorrentes que valem entender lendo o código:
- **"Status derivado na leitura, nunca gravado":** fatura, `tasks.status='atrasada'`, cursos atrasados — todos calculados na leitura a partir de datas. Não persista esses estados.
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
