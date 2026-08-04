# NEXT_AGENT_INSTRUCTIONS — Instruções para o próximo agente

## 📌 Estado atual — AS DUAS FRENTES ESTÃO CONCLUÍDAS

As 14 fases do roadmap original, a **Fase 15 (TO-DO)**, a **Fase 16 (Dieta e Alimentação)** e a
**Fase 17 (Treinos)** estão concluídas.

| Fase | Módulo | Situação |
| --- | --- | --- |
| **16** | Dieta e Alimentação (`/nutricao`) | ✅ **CONCLUÍDA** (16-A a 16-F) — **40 de 40** critérios |
| **17** | Treinos (`/treinos`) | ✅ **CONCLUÍDA** (17-A a 17-F, 2026-08-04) — **55 de 55** critérios |

**NÃO HÁ PRÓXIMA FASE.** Não existe 16-G nem 17-G. O projeto inteiro está em **modo
manutenção/iteração**: toda melhoria entra como **tarefa avulsa**, com branch própria,
verificação completa e documentação atualizada — não como subfase.

O veredito item a item dos 55 critérios da Fase 17 e dos 40 da Fase 16 está em
`docs/handoff/LAST_PHASE_SUMMARY.md`.

## ▶️ Se você foi chamado para uma tarefa avulsa

**Leitura obrigatória antes de tocar em código:**

1. `docs/project/PROJECT_RULES.md`
2. `docs/project/PROJECT_ARCHITECTURE.md` (a seção do módulo que você vai mexer)
3. `docs/project/CURRENT_STATUS.md`
4. `CLAUDE.md` da raiz — em especial **"Layout responsivo — 5 regras que vieram de bugs reais"**
5. O arquivo da fase que criou a área (`docs/phases/PHASE_*`)
6. As invariantes dos dois módulos, listadas abaixo — elas continuam valendo integralmente

**Antes de fechar:** `npm run lint && npx tsc --noEmit && npm run test:run && npm run build`,
suíte verde também em `TZ=UTC`, smoke (rotas privadas → 307 `/login`; `/api/cron/*` → 401) e,
se mexer em RLS, teste pela role `authenticated` em transação com **rollback**.

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

Depois de qualquer migration: `get_advisors` com **0 lints de schema** e
**regenere `src/types/supabase.ts`** (MCP `generate_typescript_types`).

## ⛔ Invariantes gerais do projeto (bloqueantes)

- **RLS + FORCE RLS em TODAS as tabelas** (conte no banco antes de citar um número: as duas
  frentes criam tabelas em paralelo). Teste pelo client SDK autenticado ou trocando de role no
  SQL — o SQL editor como `postgres` ignora RLS e o teste passaria sem provar nada.
- **Zod no servidor** em toda Server Action; `user_id` sempre de `auth.getUser()`.
- **Nenhum `service_role` no client** — só `src/lib/supabase/service.ts` e o Cron.
- **pt-BR / BRL**, datas BR, **dark/light** e responsividade reais em tudo.
- **React Compiler ativo:** use `useWatch`/`Controller`, nunca `form.watch()` nem `setState`
  em `useEffect` (ajuste de estado durante o render é o padrão adotado).

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
