# NEXT_AGENT_INSTRUCTIONS — Instruções para o próximo agente

## 📌 Estado atual — Fase 16 (Dieta e Alimentação) em andamento

As 14 fases do roadmap original e a Fase 15 (TO-DO) estão concluídas. Em **2026-08-03** o
usuário abriu a **Fase 16 — Módulo Dieta e Alimentação**, dividida em **6 subfases (A–F)**.

**As Subfases 16-A e 16-B estão concluídas e aplicadas no banco.** Crie um branch novo.

> ⚠️ **Há outra frente em paralelo.** Em 2026-08-03 também foi aberta a **Fase 17 — Módulo
> Treinos** (`/treinos`, tabelas `training_*`, `docs/phases/PHASE_17_*`), com a 17-A
> concluída. As duas fases convivem no mesmo repositório e no mesmo banco. Antes de mexer em
> `docs/project/PROJECT_ROADMAP.md`, `CURRENT_STATUS.md` ou `src/types/supabase.ts`, **leia o
> arquivo primeiro e edite de forma pontual** — sobrescrever levaria embora o trabalho da
> outra frente. Ponto de contato entre elas: **medidas corporais são `body_*`**, um módulo
> central compartilhado; quem chegar primeiro (16-E ou 17-E) cria, o outro consome. **Nunca
> existem duas tabelas de peso corporal.**

## ▶️ Duas tarefas possíveis — confirme com o usuário qual frente ele quer

| Frente | Próxima subfase | Arquivo |
| --- | --- | --- |
| **Dieta e Alimentação** | **16-C** — Receitas, refeições-modelo e substituições | `docs/phases/PHASE_16_C_NUTRITION_MEALS_RECIPES_SUBSTITUTIONS.md` |
| **Treinos** | **17-B** — Programas, treinos-modelo e planejamento semanal | `docs/phases/PHASE_17_B_TRAINING_ROUTINES_PROGRAMS.md` |

As duas são independentes até a Subfase E de cada uma, quando se encontram nas **medidas
corporais compartilhadas (`body_*`)**. Faça **uma** por vez.

---

## ▶️ Frente Dieta: Subfase 16-C — Receitas, refeições-modelo e substituições

**Arquivo da fase (leia inteiro antes de codar):**
`docs/phases/PHASE_16_C_NUTRITION_MEALS_RECIPES_SUBSTITUTIONS.md`

**Leitura obrigatória, nesta ordem:**
1. `docs/project/PROJECT_BRIEFING.md` (Módulo 17 — Dieta e Alimentação)
2. `docs/project/PROJECT_RULES.md`
3. `docs/project/PROJECT_ARCHITECTURE.md` (seção "Módulo Dieta e Alimentação")
4. `docs/project/PROJECT_ROADMAP.md` (Fase 16, tabela das subfases)
5. `docs/project/CURRENT_STATUS.md`
6. `docs/handoff/LAST_PHASE_SUMMARY.md`
7. `docs/phases/PHASE_16_A_NUTRITION_FOUNDATION_FOODS.md` e
   `PHASE_16_B_NUTRITION_DIARY_PLANNING.md` (o que já existe)
8. `docs/phases/PHASE_16_C_NUTRITION_MEALS_RECIPES_SUBSTITUTIONS.md` (o que você vai fazer)

**Código que você precisa entender antes de escrever qualquer linha:**
`src/lib/nutrition/units.ts`, `calc.ts`, **`snapshot.ts`**, `diary.ts`, `goals.ts`,
`plan-recurrence.ts`, `calendar.ts`, `constants.ts`, `types.ts`, `queries.ts`,
`diary-queries.ts` e as actions `nutrition-{foods,diary,goals,plans}.ts`.

### ⛔ O ponto mais importante da 16-C

**Receita e refeição-modelo viram itens do diário REUSANDO `buildDiaryEntrySnapshot`.**
Não crie um segundo caminho de gravação. O contrato já está pronto para isso:

- `nutrition_diary_entries.entry_kind` tem CHECK `in ('alimento','livre')` — **acrescente
  `'receita'` e `'modelo'` a esse CHECK** numa migration, em vez de inventar outra tabela.
- `nutrition_planned_meal_items` hoje só aponta para `food_id`; a 16-C precisa acrescentar a
  origem receita/modelo (coluna + CHECK), como está registrado no comentário da migration.
- O snapshot de uma receita deve congelar os nutrientes **da receita naquele momento**, pelo
  mesmo `scaleNutrients`/`convertToBase`. Editar a receita depois não pode mudar o passado —
  é a mesma regra do alimento, e já existe teste de referência em `snapshot.test.ts`.

---

## ▶️ Frente Treinos: Subfase 17-B — Programas, treinos-modelo e planejamento semanal

**Arquivo da fase (leia inteiro antes de codar):**
`docs/phases/PHASE_17_B_TRAINING_ROUTINES_PROGRAMS.md`

**Leitura obrigatória, nesta ordem:**
1. `docs/project/PROJECT_RULES.md`
2. `docs/project/PROJECT_ARCHITECTURE.md` (seção "Módulo Treinos")
3. `docs/project/PROJECT_ROADMAP.md` (Fase 17, tabela das subfases)
4. `docs/project/CURRENT_STATUS.md`
5. `docs/handoff/LAST_PHASE_SUMMARY.md`
6. `docs/phases/PHASE_17_A_TRAINING_FOUNDATION_EXERCISES.md` (o que já existe)
7. `docs/phases/PHASE_17_B_TRAINING_ROUTINES_PROGRAMS.md` (o que você vai fazer)
8. `docs/phases/PHASE_17_C_TRAINING_LIVE_SESSION.md` — **leia mesmo sem implementar**: a 17-B
   precisa entregar o modelo no formato que a sessão vai congelar.

**Código que você precisa entender antes de escrever qualquer linha:**
`src/lib/training/tracking.ts`, `constants.ts`, `types.ts`, `filters.ts`, `queries.ts` e
`src/lib/actions/training-exercises.ts`.

### ⛔ Invariantes do módulo Treinos que NÃO podem ser quebradas

1. **`tracking.ts` É A ÚNICA MATRIZ DE MEDIÇÃO.** O que cada exercício mede sai dali —
   formulário, treino-modelo, sessão (17-C), volume (17-D) e relatório (17-E). Reimplementar
   a matriz faz o módulo somar quilos com segundos.
2. **ASSISTÊNCIA SUBTRAI CARGA, CARGA ADICIONAL SOMA.** Já testado; não inverta o sinal.
3. **SEM PESO CORPORAL, A CARGA EFETIVA É INDISPONÍVEL — NUNCA ZERO.** Agregado incompleto é
   marcado como parcial, com o motivo.
4. **A BASE DO SISTEMA É IMUTÁVEL.** `user_id is null` = somente leitura, policies separadas
   por comando + três constraints amarradas. Favoritar/arquivar/apelidar grava em
   `training_exercise_prefs`. Duplicar cria cópia com `origin_exercise_id`.
5. **MODELO É MUTÁVEL; EXECUÇÃO É IMUTÁVEL.** A 17-B constrói o modelo sabendo que a 17-C tira
   um **snapshot** ao iniciar a sessão. **Não crie vínculo vivo entre sessão e modelo** —
   senão editar o treino reescreve o passado.
6. **STATUS DERIVADO NA LEITURA.** "Em andamento" e "atrasado" do planejamento saem de data +
   agora, como `atrasada` no TO-DO e o status da fatura. Não persista.
7. **NENHUMA EXCLUSÃO SILENCIOSA.** Excluir programa/treino pergunta o destino do que
   dependia dele.
8. **NENHUM ASSET DE TERCEIROS.** Sem imagem, vídeo, ícone, texto ou base de dados copiados de
   apps de treino. Referência é funcional apenas, e a procedência fica escrita.
9. **SEM PRESCRIÇÃO.** Objetivo e nível são organizacionais. O módulo não recomenda treino,
   não avalia lesão, não promete resultado e nunca sugere tentativa de carga máxima.
10. **DATA PURA `'yyyy-MM-dd'`** para o dia planejado + hora em coluna `time`; aritmética em
    `Date.UTC` nas funções puras, nunca `Date.now()`.

### 🧭 O que a 17-B precisa entregar para a 17-C não sofrer
`expandPlannedSets` — um formato **único** de série planejada, que resolve tanto o caso
uniforme (`default_sets`) quanto o configurado série a série (`training_workout_sets`). A
sessão ao vivo deve consumir só esse formato.

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

## ⚠️ Armadilha do banco que passou por build, tsc e lint (não repita)

Os índices únicos que sustentam a idempotência da 16-B são **parciais**:

```sql
… on nutrition_diary_entries (user_id, diary_meal_id, planned_item_id)
  where planned_item_id is not null;
… on nutrition_planned_meals (plan_day_id, planned_date, meal_type_id)
  where plan_day_id is not null and planned_date is not null;
```

O Postgres **não infere índice parcial num `ON CONFLICT`** sem repetir o predicado, e o
PostgREST não permite repetir — o `upsert` falha **só em runtime** (`42P10`). Use
*select-then-insert/update* nesses casos. O mesmo vale para índices de **expressão**
(`coalesce(...)`), como o de escopo de `nutrition_goal_items`. E no PostgREST,
`.eq(coluna, null)` **não** casa com NULL: use `.is(coluna, null)`.

## 📋 Pendências registradas da 16-A e da 16-B (escopo consciente, não bugs)

| Item | Onde resolve |
| --- | --- |
| Medidas caseiras oficiais em massa (a TACO não publica) | Segunda fonte pelo mesmo pipeline; nada foi inventado |
| Leitura de código de barras pela câmera | 16-F (campo, busca e cadastro manual já existem) |
| Cards no dashboard geral, busca global, lançamento rápido, notificações | 16-F |
| Exportação do catálogo em CSV | 16-E |
| **Visão de mês do diário** (calendário com indicadores) — `?visao=mes` hoje cai na semana | 16-E |
| **Montar os dias de um modelo pela interface** (criar e aplicar já funcionam) | 16-C |
| `updatePlannedMealInScope` existe e é testada; a UI só expõe escopo na **exclusão** | 16-C |
| Relatório de micronutrientes por período (a **meta** de micro já funciona) | 16-E |

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

- **RLS + FORCE RLS em TODAS as tabelas** (hoje **74**: 67 + 7 de `training_*`). Teste pelo client SDK autenticado ou
  trocando de role no SQL — o SQL editor como `postgres` ignora RLS.
- **Zod no servidor** em toda Server Action; `user_id` sempre de `auth.getUser()`.
- **Nenhum `service_role` no client** — só `src/lib/supabase/service.ts` e o Cron.
- **pt-BR / BRL**, datas BR, **dark/light** e responsividade reais em tudo.
- **React Compiler ativo:** use `useWatch`/`Controller`, nunca `form.watch()` nem `setState`
  em `useEffect` (ajuste de estado durante o render é o padrão adotado).

## ✅ Verificação obrigatória antes de fechar qualquer mudança

```bash
npm run lint && npx tsc --noEmit && npm run test:run && npm run build
```

Os **889 testes** (823 de Dieta e anteriores + 66 de Treinos) devem continuar passando —
acrescente testes para toda lógica pura nova.
A suíte precisa passar em qualquer fuso — confira com `TZ=UTC npx vitest run`.
Smoke test: rotas privadas → 307 `/login`; `/api/cron/*` → 401 sem segredo.

## 🗺️ Mapa rápido do que existe (reaproveitar, não reescrever)

- **Dieta:** `src/lib/nutrition/*` (puro + queries; destaque para `snapshot.ts`, `calc.ts`,
  `goals.ts`, `diary.ts`, `plan-recurrence.ts`, `calendar.ts`),
  `src/lib/actions/nutrition-{foods,diary,goals,plans}.ts`,
  `src/components/nutrition/*`, `src/app/(app)/nutricao/*`, `scripts/nutrition/*`,
  `data/nutrition/taco-4/*`.
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
