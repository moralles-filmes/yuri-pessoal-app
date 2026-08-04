# NEXT_AGENT_INSTRUCTIONS — Instruções para o próximo agente

## 📌 Estado atual — duas frentes em andamento (Dieta e Treinos)

As 14 fases do roadmap original e a Fase 15 (TO-DO) estão concluídas. Em **2026-08-03** o
usuário abriu a **Fase 16 — Módulo Dieta e Alimentação**, dividida em **6 subfases (A–F)**.

**As Subfases 16-A a 16-E estão concluídas e aplicadas no banco.** Crie um branch novo.

> ⚠️ **Há outra frente em paralelo.** Em 2026-08-03 também foi aberta a **Fase 17 — Módulo
> Treinos** (`/treinos`, tabelas `training_*`, `docs/phases/PHASE_17_*`), com a **17-A, a 17-B, a
> 17-C e a 17-D concluídas**. As duas fases convivem no mesmo repositório e no mesmo banco. Antes de mexer em
> `docs/project/PROJECT_ROADMAP.md`, `CURRENT_STATUS.md` ou `src/types/supabase.ts`, **leia o
> arquivo primeiro e edite de forma pontual** — sobrescrever levaria embora o trabalho da
> outra frente.
>
> ✅ **O PONTO DE CONTATO ENTRE AS DUAS FRENTES ESTÁ RESOLVIDO (2026-08-04).**
> A **16-E CRIOU** o módulo central `body_*` (4 tabelas + código em `src/lib/body/`).
> A **17-E CONSOME** — ver a seção dedicada mais abaixo. **Nunca duas tabelas de peso corporal.**

## ▶️ Duas tarefas possíveis — confirme com o usuário qual frente ele quer

| Frente | Próxima subfase | Arquivo |
| --- | --- | --- |
| **Dieta e Alimentação** | **16-F** — Integrações, notificações e polimento (**fecha a Fase 16**) | `docs/phases/PHASE_16_F_NUTRITION_INTEGRATIONS_POLISH.md` |
| **Treinos** | **17-E** — Metas, medidas corporais e dashboards | `docs/phases/PHASE_17_E_TRAINING_GOALS_DASHBOARDS.md` |

Faça **uma** subfase por vez.

---

## ⛔ PARA A 17-E: as medidas corporais JÁ EXISTEM. NÃO CRIE NADA.

A 16-E chegou primeiro e criou as **4 tabelas centrais** — `body_measurement_types`,
`body_measurements`, `body_measurement_goals`, `body_progress_photos` — todas com RLS + FORCE
RLS, índice em `user_id` e trigger de `updated_at`.

**A 17-E deve CONSUMIR, não recriar.** O que já está pronto para você:

| Já existe | Onde |
| --- | --- |
| Leitura de tipos, medições, metas e fotos | `src/lib/body/queries.ts` |
| **`getLatestWeight(upTo?)`** — o peso mais recente até uma data | `src/lib/body/queries.ts` |
| Gravação (medição, lote, meta, foto) com Zod e `ActionResult` | `src/lib/actions/body-measurements.ts` |
| Diferença, percentual, comparação entre datas, média móvel, progresso de meta | `src/lib/body/measurements.ts` (puro, 69 testes) |
| Gráfico + tabela textual equivalente | `src/components/body/measurement-chart.tsx` |
| Fotos privadas com upload, comparação e URL assinada | `src/components/body/progress-photos.tsx` |
| Vocabulário, seed dos 16 tipos, avisos de texto | `src/lib/body/constants.ts` |

**`getLatestWeight` existe especificamente para você:** a preparação da sessão (17-C) hoje pede
o peso digitado na hora; com ele, passa a pré-preencher do histórico. Ele devolve `null` quando
não há registro — **sem peso corporal, a carga efetiva é indisponível, NUNCA zero** (invariante
3 do módulo Treinos).

O `revalidatePath("/treinos")` já está em `src/lib/actions/body-measurements.ts`, aguardando as
telas de treino que vão consumir esses dados.

---

---

## ▶️ Frente Dieta: Subfase 16-F — Integrações, notificações e polimento

**Arquivo da fase (leia inteiro antes de codar):**
`docs/phases/PHASE_16_F_NUTRITION_INTEGRATIONS_POLISH.md`

É a subfase que **FECHA a Fase 16** — ela precisa validar os **40 critérios de aceite gerais**
listados no próprio arquivo, não só os seus.

**Leitura obrigatória, nesta ordem:**
1. `docs/project/PROJECT_BRIEFING.md` (Módulo 17 — Dieta e Alimentação)
2. `docs/project/PROJECT_RULES.md`
3. `docs/project/PROJECT_ARCHITECTURE.md` (seção "Módulo Dieta e Alimentação")
4. `docs/project/PROJECT_ROADMAP.md` (Fase 16, tabela das subfases)
5. `docs/project/CURRENT_STATUS.md`
6. `docs/handoff/LAST_PHASE_SUMMARY.md`
7. `docs/phases/PHASE_16_A_…` até `PHASE_16_E_NUTRITION_MEASUREMENTS_REPORTS.md`
8. `docs/phases/PHASE_16_F_NUTRITION_INTEGRATIONS_POLISH.md` (o que você vai fazer)

**Código que você precisa entender antes de escrever qualquer linha:**
`src/lib/nutrition/calc.ts`, `snapshot.ts`, `diary.ts`, `goals.ts`, `calendar.ts`,
`shopping.ts`, **`reports.ts`**, **`diary-month.ts`**, **`csv-export.ts`**, `constants.ts`,
`types.ts`, `queries.ts`, `diary-queries.ts`, `recipe-queries.ts`, `shopping-queries.ts`,
**`report-queries.ts`** e as actions `nutrition-*.ts`. Para medidas e fotos:
**`src/lib/body/*`** e `src/lib/actions/body-measurements.ts`.
Para as integrações: `src/lib/notifications/*` (`dedupe_key` + Cron), `src/lib/search/queries.ts`,
`src/lib/dashboard/queries.ts` e `src/components/quick-add/*`.

### 📋 O que a 16-F precisa fechar (pendências acumuladas de A a E)

| Item | Situação hoje |
| --- | --- |
| **Leitura de código de barras pela câmera** | Campo, busca e cadastro manual já existem (16-A) |
| **Upload da foto de RECEITA pela interface** | A tabela `attachments` e o bucket já são LIDOS pela receita; falta o gatilho de envio. **A 16-E já resolveu esse fluxo para as fotos de evolução — copie o padrão de `uploadProgressPhoto`** |
| **Arrastar ingrediente** (`reorderRecipeIngredients`) | A action existe e é testada pelo tipo; nenhuma tela a chama |
| **Busca global e lançamento rápido** de receita/refeição-modelo | Nada ligado ainda |
| **Cards no dashboard geral** (consumo do dia, evolução recente) | Nada ligado ainda |
| **Notificação de item da despensa vencendo** | A data já é gravada e exibida (16-D) |
| **Gerenciar corredores de mercado pela interface** | `saveMarketCategory`, `deleteMarketCategory` e `reorderMarketCategories` existem; nenhuma tela os chama |
| **Escolher a quantidade de cada receita** ao gerar a lista por "receitas" | Hoje entra 1 porção e o usuário ajusta no item |
| **Gerenciar tipos de medida pela interface** (16-E) | `saveMeasurementType`, `reorderMeasurementTypes` e `deleteMeasurementType` existem; a semente dos 16 tipos cobre o uso normal |
| **Notificação de medição pendente** e **cards de evolução** (16-E) | Nada ligado ainda |
| **XLSX nos relatórios** (16-E) | O pacote `xlsx` já está no projeto; a 16-E entregou CSV, que é o padrão |

### 📌 O que a 16-E deixou pronto para você

- **`src/lib/nutrition/reports.ts`** — toda agregação por período já existe e é testada
  (54 testes): `buildDailyReports`, `summarizePeriod`, `nutrientReport`, `topFoods`,
  `substitutionRanking`, `marketSpendReport`, `diaryFrequency`, `adherenceRanking`. Os cards do
  dashboard geral devem **consumir daqui**, não recalcular.
- **`src/lib/nutrition/csv-export.ts`** — linhas prontas para CSV, reusando `toCsv`/`downloadCsv`
  (Fase 14). **Célula vazia ≠ zero**, e a citação da TACO viaja com o arquivo.
- **`src/lib/body/*`** — o módulo central de medidas, com upload de foto privada resolvido.
- **`uploadProgressPhoto`** (`src/lib/actions/body-measurements.ts`) — o padrão de upload com
  validação real no servidor. **A foto de receita deve seguir exatamente esse caminho.**

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

**2. AS MEDIDAS CORPORAIS JÁ EXISTEM — A 16-E CRIOU, VOCÊ CONSOME.**
Não crie `training_body_*` nem tabela nenhuma de medida: as 4 tabelas `body_*` e o código em
`src/lib/body/` são de 2026-08-04 (ver a seção **"PARA A 17-E"** no topo deste arquivo). O peso
corporal da sessão (`training_sessions.body_weight_kg`, 17-C) é o valor USADO naquele treino,
congelado — **não** é histórico de medida: a preparação passa a pré-preencher a partir de
`getLatestWeight()`, mas o que ficar gravado na sessão continua sendo o daquele dia.

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

## 📋 Pendências registradas da 16-A a 16-E (escopo consciente, não bugs)

| Item | Onde resolve |
| --- | --- |
| Medidas caseiras oficiais em massa (a TACO não publica) | Segunda fonte pelo mesmo pipeline; nada foi inventado |
| Leitura de código de barras pela câmera | 16-F (campo, busca e cadastro manual já existem) |
| Cards no dashboard geral, busca global, lançamento rápido, notificações | 16-F |
| ~~Exportação do catálogo em CSV~~ | ✅ **fechada na 16-E** (`csv-export.ts`) |
| ~~**Visão de mês do diário**~~ | ✅ **fechada na 16-E** (`diary-month.ts`) |
| ~~Montar os dias de um modelo pela interface~~ | ✅ **fechada na 16-C** |
| ~~`updatePlannedMealInScope` sem escopo na UI de edição~~ | ✅ **fechada na 16-C** |
| ~~Relatório de micronutrientes por período~~ | ✅ **fechada na 16-E** (com a coluna "dias incompletos") |
| ~~Relatório de "substituições mais realizadas"~~ | ✅ **fechada na 16-E** |
| **Upload** da foto de receita pela interface — a tabela `attachments` e o bucket já são LIDOS pela receita; falta o gatilho de envio | 16-F |
| `reorderRecipeIngredients` existe e é testada pelo tipo, mas nenhuma tela a chama (arrastar ingrediente) | 16-F |
| Busca global e lançamento rápido de receita/refeição-modelo | 16-F |
| ~~Relatório de gasto com mercado × financeiro~~ | ✅ **fechada na 16-E** (reusa `summarizeShoppingList`; virar lançamento continua sendo decisão do usuário) |
| Notificação de item da despensa vencendo (a data já é gravada e exibida) | 16-F |
| Gerenciar corredores de mercado pela interface — `saveMarketCategory`, `deleteMarketCategory` e `reorderMarketCategories` existem, mas nenhuma tela os chama (a semente cobre o uso normal) | 16-F |
| Escolher a quantidade de cada receita ao gerar a lista por "receitas" (hoje entra 1 porção e o usuário ajusta no item) | 16-F |
| Gerenciar tipos de medida pela interface — `saveMeasurementType`, `reorderMeasurementTypes` e `deleteMeasurementType` existem, mas nenhuma tela os chama (a semente dos 16 tipos cobre o uso normal) | 16-F |
| Notificação de medição pendente e cards de evolução no dashboard geral | 16-F |
| XLSX nos relatórios (o pacote `xlsx` já está no projeto; a 16-E entregou CSV, o padrão) | 16-F |
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

Os testes existentes devem continuar passando (**1.630** com a 16-E e a 17-D integradas; as duas frentes
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
