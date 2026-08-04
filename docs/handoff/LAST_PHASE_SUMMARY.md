# LAST_PHASE_SUMMARY — Resumo da última fase concluída

> ⚠️ **Duas frentes correm em paralelo desde 2026-08-03**: a **Fase 16 — Dieta e Alimentação**
> (16-A a **16-E** concluídas) e a **Fase 17 — Módulo Treinos** (17-A, 17-B e 17-C concluídas).
> Este arquivo tem o resumo das duas, na ordem em que foram concluídas — a mais recente
> primeiro.

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
