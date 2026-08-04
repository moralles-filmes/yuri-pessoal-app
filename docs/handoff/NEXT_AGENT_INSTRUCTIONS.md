# NEXT_AGENT_INSTRUCTIONS — Instruções para o próximo agente

## 📌 Estado atual — Fase 16 (Dieta e Alimentação) em andamento

As 14 fases do roadmap original e a Fase 15 (TO-DO) estão concluídas. Em **2026-08-03** o
usuário abriu a **Fase 16 — Módulo Dieta e Alimentação**, dividida em **6 subfases (A–F)**.

**As Subfases 16-A, 16-B, 16-C e 16-D estão concluídas e aplicadas no banco.** Crie um branch novo.

> ⚠️ **Há outra frente em paralelo.** Em 2026-08-03 também foi aberta a **Fase 17 — Módulo
> Treinos** (`/treinos`, tabelas `training_*`, `docs/phases/PHASE_17_*`), com a **17-A, a 17-B, a
> 17-C e a 17-D concluídas**. As duas fases convivem no mesmo repositório e no mesmo banco. Antes de mexer em
> `docs/project/PROJECT_ROADMAP.md`, `CURRENT_STATUS.md` ou `src/types/supabase.ts`, **leia o
> arquivo primeiro e edite de forma pontual** — sobrescrever levaria embora o trabalho da
> outra frente. Ponto de contato entre elas: **medidas corporais são `body_*`**, um módulo
> central compartilhado; quem chegar primeiro (16-E ou 17-E) cria, o outro consome. **Nunca
> existem duas tabelas de peso corporal.**

## ▶️ Duas tarefas possíveis — confirme com o usuário qual frente ele quer

| Frente | Próxima subfase | Arquivo |
| --- | --- | --- |
| **Dieta e Alimentação** | **16-E** — Medidas, fotos de evolução e relatórios | `docs/phases/PHASE_16_E_NUTRITION_MEASUREMENTS_REPORTS.md` |
| **Treinos** | **17-E** — Metas, medidas corporais compartilhadas e dashboards | `docs/phases/PHASE_17_E_TRAINING_GOALS_DASHBOARDS.md` |

⚠️ **AS DUAS FRENTES SE ENCONTRAM NA PRÓXIMA SUBFASE DE CADA UMA.** Tanto a 16-E quanto a 17-E
precisam das **medidas corporais compartilhadas (`body_*`)**. Quem chegar primeiro **cria** as
tabelas; o outro **consome**. **Nunca duas tabelas de peso corporal** — antes de criar, confira
no banco se a outra frente já criou. Faça **uma** subfase por vez.

---

## ▶️ Frente Dieta: Subfase 16-E — Medidas, fotos de evolução e relatórios

**Arquivo da fase (leia inteiro antes de codar):**
`docs/phases/PHASE_16_E_NUTRITION_MEASUREMENTS_REPORTS.md`

**Leitura obrigatória, nesta ordem:**
1. `docs/project/PROJECT_BRIEFING.md` (Módulo 17 — Dieta e Alimentação)
2. `docs/project/PROJECT_RULES.md`
3. `docs/project/PROJECT_ARCHITECTURE.md` (seção "Módulo Dieta e Alimentação")
4. `docs/project/PROJECT_ROADMAP.md` (Fase 16, tabela das subfases)
5. `docs/project/CURRENT_STATUS.md`
6. `docs/handoff/LAST_PHASE_SUMMARY.md`
7. `docs/phases/PHASE_16_A_…` até `PHASE_16_D_NUTRITION_SHOPPING_LIST.md` (o que já existe)
8. `docs/phases/PHASE_16_E_NUTRITION_MEASUREMENTS_REPORTS.md` (o que você vai fazer)

**Código que você precisa entender antes de escrever qualquer linha:**
`src/lib/nutrition/calc.ts`, `snapshot.ts`, `diary.ts`, `goals.ts`, `calendar.ts`,
**`shopping.ts`**, `constants.ts`, `types.ts`, `queries.ts`, `diary-queries.ts`,
`recipe-queries.ts`, `shopping-queries.ts` e as actions
`nutrition-{foods,diary,goals,plans,recipes,meal-templates,substitutions,shopping}.ts`.
Para as fotos: `src/lib/actions/attachments.ts` e o bucket privado `attachments` (Fase 14).

### ⛔ Os dois pontos mais delicados da 16-E

**1. AS FOTOS DE EVOLUÇÃO SÃO O DADO MAIS SENSÍVEL DO MÓDULO INTEIRO.**
Bucket **privado**, **URL assinada de vida curta**, policy por pasta `{user_id}/…`, validação
de tipo e de tamanho no servidor. **Nunca URL pública**, nunca link compartilhável, nunca nome
de arquivo previsível. Reuse a tabela `attachments` + o bucket privado `attachments` (Fase 14),
que a foto de receita (16-C) já usa — não crie um segundo mecanismo de upload.

**2. MEDIDAS CORPORAIS SÃO `body_*`, MÓDULO COMPARTILHADO COM A FASE 17.**
Não crie `nutrition_body_*`. Quem chegar primeiro (16-E ou 17-E) **cria** as tabelas `body_*`;
o outro **consome**. **Nunca existem duas tabelas de peso corporal** — antes de criar, confira
no banco se a outra frente já criou. `nutrition_profiles.weight_kg` (16-A) é o peso do PERFIL,
insumo do estimador de gasto energético: não é histórico de medida e não substitui `body_*`.

### 📌 O que a 16-D deixou pronto para você

- `src/lib/nutrition/shopping.ts` — `summarizeShoppingList` já soma preços **em centavos** e
  conta quantos itens estão **sem preço**. O relatório de gasto com mercado deve REUSAR isso,
  não recontar: ausência de preço não é zero.
- `nutrition_shopping_list_items.actual_price_cents` — o preço realmente pago, item a item. É a
  matéria-prima do "gasto com mercado × financeiro". Virar lançamento financeiro é **decisão
  explícita do usuário**, nunca automático.
- `nutrition_market_categories` — corredores por usuário, já semeados na primeira leitura.
- Pendências que caem na 16-E: relatório de micronutrientes por período, "substituições mais
  realizadas", exportação do catálogo em CSV e a **visão de mês do diário** (`?visao=mes` hoje
  cai na semana).

---

## ▶️ Frente Treinos: Subfase 17-E — Metas, medidas corporais e dashboards

**Arquivo da fase (leia inteiro antes de codar):**
`docs/phases/PHASE_17_E_TRAINING_GOALS_DASHBOARDS.md`

**Leitura obrigatória, nesta ordem:**
1. `docs/project/PROJECT_RULES.md`
2. `docs/project/PROJECT_ARCHITECTURE.md` (seção "Módulo Treinos", em especial
   "Histórico, volume e recordes (17-D)")
3. `docs/project/PROJECT_ROADMAP.md` (Fase 17, tabela das subfases)
4. `docs/project/CURRENT_STATUS.md`
5. `docs/handoff/LAST_PHASE_SUMMARY.md`
6. `docs/phases/PHASE_17_A_…` até `PHASE_17_D_TRAINING_HISTORY_PROGRESS.md`
7. `docs/phases/PHASE_17_E_TRAINING_GOALS_DASHBOARDS.md` (o que você vai fazer)

**Código que você precisa entender antes de escrever qualquer linha:**
**`src/lib/training/metrics.ts`** (a fonte única dos agregados), `one-rm.ts`, `records.ts`,
`progression.ts`, `history.ts`, `tracking.ts`, `workout.ts`, `schedule.ts`,
**`history-queries.ts`**, `records-sync.ts`, `session-queries.ts` e as actions
`src/lib/actions/training-{sessions,history,workouts,schedule}.ts`.

### ⛔ As duas regras que você NÃO pode quebrar

**1. OS DASHBOARDS CONSOMEM `metrics.ts` — NUNCA RECALCULAM.**
Volume, séries, repetições, tempo, frequência, distribuição por grupo muscular e recordes já
saem de lá, com a regra do usuário aplicada (aquecimento dentro/fora, contagem do unilateral) e
com a **qualidade** (`exato | parcial`) junto do número. Um dashboard que refizer a conta vai
discordar do histórico na primeira diferença de arredondamento — e o usuário vai ver dois
números diferentes para a mesma semana. Se faltar um agregado, **acrescente em `metrics.ts`**.

**2. MEDIDAS CORPORAIS SÃO `body_*`, MÓDULO COMPARTILHADO COM A FASE 16.**
Não crie `training_body_*`. **Confira no banco se a 16-E já criou** — se criou, consuma. O peso
corporal da sessão (`training_sessions.body_weight_kg`, 17-C) é o valor USADO naquele treino,
congelado: ele **não** é histórico de medida e não substitui `body_*`. Quando `body_*` existir, a
preparação da sessão passa a pré-preencher dali.

### 📌 O que a 17-D deixou pronto para você

| Já existe | Onde |
| --- | --- |
| Todo agregado (volume, séries, reps, tempo, distância, por grupo/semana/mês/programa) | `metrics.ts` |
| Qualidade `exato | parcial` + motivo por extenso | `metrics.ts` (`partialExplanation`) |
| Frequência: dias treinados, semanas, sequência atual e maior sequência | `metrics.ts` (`frequencyMetrics`) |
| 1RM estimado nas 4 fórmulas, com faixa de validade | `one-rm.ts` |
| Recordes consolidados + marca anterior + recálculo | `records.ts` · `records-sync.ts` |
| Sugestão de progressão com motivo, aceitar/ignorar | `progression.ts` · `training-history.ts` |
| Filtro/agrupamento/comparação entre sessões | `history.ts` |
| Leitura ampla do histórico (uma consulta por entidade) | `history-queries.ts` (`getSessionHistory`) |
| Gráficos com tabela equivalente (acessibilidade) | `src/components/training/training-charts.tsx` |
| Cards de resumo com aviso de parcial e regra vigente | `src/components/training/metrics-summary.tsx` |

### 🧭 Três avisos concretos da 17-D para a 17-E

1. **`syncPersonalRecords` devolve `highlights`** — os recordes novos e superados daquela
   execução. É exatamente o gancho da notificação de recorde (17-F): a detecção já existe, falta
   só notificar **uma vez**.
2. **O índice de deduplicação das sugestões é PARCIAL.** `ON CONFLICT` não o infere e falha só em
   runtime (42P10). Toda gravação ali é select-then-insert.
3. **A relação entre treino e dieta é de LEITURA.** Se a 17-E cruzar treino com alimentação,
   leia o módulo Dieta pelas funções dele (`calc.ts`) — não recalcule nutriente aqui, do mesmo
   jeito que a Dieta não deve recalcular volume.

### ⛔ Invariantes do módulo Treinos que NÃO podem ser quebradas

1. **`tracking.ts` É A ÚNICA MATRIZ DE MEDIÇÃO.** Reimplementá-la faz o módulo somar quilos com
   segundos.
2. **`metrics.ts` É A ÚNICA FONTE DE AGREGADO** (17-D). Histórico, gráfico, recorde, dashboard e
   relatório precisam concordar entre si.
3. **ASSISTÊNCIA SUBTRAI CARGA, CARGA ADICIONAL SOMA.** Já testado; não inverta o sinal.
4. **SEM PESO CORPORAL, A CARGA EFETIVA É INDISPONÍVEL — NUNCA ZERO.** Agregado incompleto é
   marcado como **parcial**, com o motivo.
5. **A BASE DO SISTEMA É IMUTÁVEL** (`user_id is null`, policies separadas por comando).
6. **MODELO É MUTÁVEL; EXECUÇÃO É IMUTÁVEL.** `session-queries.ts` e `history-queries.ts` **não
   leem `training_workouts`** — mantenha assim. Se um gráfico mudar porque o usuário renomeou um
   exercício, a 17-C/17-D foi violada.
7. **STATUS DERIVADO NA LEITURA.** `atrasado`/`hoje` do planejamento e `parcial`/`concluido` do
   exercício da sessão são derivados, nunca gravados.
8. **NENHUMA EXCLUSÃO SILENCIOSA.** Excluir sessão exige confirmação **e recalcula os recordes**;
   excluir programa/treino pergunta o destino do que dependia dele.
9. **NENHUM ASSET DE TERCEIROS.**
10. **SEM PRESCRIÇÃO.** Nada de sugerir carga máxima, diagnosticar dor ou prometer resultado.
    **Dor registrada bloqueia qualquer sugestão de aumento**, e o bloqueio não é configurável.
11. **1RM É ESTIMATIVA**, com a fórmula visível; fora da faixa de validade a UI avisa e o valor
    **não vira recorde**.
12. **DATA PURA `'yyyy-MM-dd'`** para o dia; instante é `timestamptz` e se lê com
    `dateInSaoPaulo`/`timeInSaoPaulo`. Aritmética em `Date.UTC`, `hojeISO()` no servidor.
    **Nunca `toISOString().slice(0,10)`.**

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

## 📋 Pendências registradas da 16-A a 16-D (escopo consciente, não bugs)

| Item | Onde resolve |
| --- | --- |
| Medidas caseiras oficiais em massa (a TACO não publica) | Segunda fonte pelo mesmo pipeline; nada foi inventado |
| Leitura de código de barras pela câmera | 16-F (campo, busca e cadastro manual já existem) |
| Cards no dashboard geral, busca global, lançamento rápido, notificações | 16-F |
| Exportação do catálogo em CSV | 16-E |
| **Visão de mês do diário** (calendário com indicadores) — `?visao=mes` hoje cai na semana | 16-E |
| ~~Montar os dias de um modelo pela interface~~ | ✅ **fechada na 16-C** |
| ~~`updatePlannedMealInScope` sem escopo na UI de edição~~ | ✅ **fechada na 16-C** |
| Relatório de micronutrientes por período (a **meta** de micro já funciona) | 16-E |
| Relatório de "substituições mais realizadas" (o histórico já é gravado) | 16-E |
| **Upload** da foto de receita pela interface — a tabela `attachments` e o bucket já são LIDOS pela receita; falta o gatilho de envio | 16-F |
| `reorderRecipeIngredients` existe e é testada pelo tipo, mas nenhuma tela a chama (arrastar ingrediente) | 16-F |
| Busca global e lançamento rápido de receita/refeição-modelo | 16-F |
| Relatório de gasto com mercado × financeiro (`actual_price_cents` já é gravado item a item) | 16-E |
| Notificação de item da despensa vencendo (a data já é gravada e exibida) | 16-F |
| Gerenciar corredores de mercado pela interface — `saveMarketCategory`, `deleteMarketCategory` e `reorderMarketCategories` existem, mas nenhuma tela os chama (a semente cobre o uso normal) | 16-F |
| Escolher a quantidade de cada receita ao gerar a lista por "receitas" (hoje entra 1 porção e o usuário ajusta no item) | 16-F |

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

Os testes existentes devem continuar passando (**1.297** ao fim da 17-C; as duas frentes
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
