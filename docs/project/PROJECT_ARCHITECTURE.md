# PROJECT_ARCHITECTURE — Arquitetura do Sistema Pessoal Yuri

> Arquitetura **proposta e adotada** para o projeto (era greenfield). Decisões confirmadas com o usuário.

## 1. Stack

| Camada | Tecnologia |
| --- | --- |
| Framework | **Next.js 16** (App Router) + React 19.2 + TypeScript |
| Estilo | **Tailwind CSS v4** (CSS-first, `@theme inline` em `globals.css`) |
| Componentes | **shadcn/ui** (Radix UI) |
| Tema | **next-themes** (dark/light via classe, sem flash) |
| Ícones | **lucide-react** |
| Toasts | **sonner** |
| Dados/servidor | **Supabase** (Postgres + Auth + Storage) via **@supabase/ssr** |
| Estado de servidor (client) | **@tanstack/react-query** (v5) |
| Estado global de UI | **Zustand** (somente onde necessário) |
| Forms | **react-hook-form** + **zod** |
| Tabelas | **@tanstack/react-table** |
| Gráficos | **recharts** |
| Datas | **date-fns** (crítico para regra de fatura) |
| Deploy | **Vercel** (Vercel Cron para notificações/lembretes em fases futuras) |

**Locale:** pt-BR. **Moeda:** BRL. **Formato de data:** brasileiro.

## 2. Decisões importantes (Next.js 16 — breaking changes)

> O scaffold gera `AGENTS.md` avisando que esta versão tem breaking changes. Pontos que afetam o projeto:

- **`middleware.ts` foi renomeado para `proxy.ts`.** Vai em `src/proxy.ts` (mesmo nível de `app/`). Função exportada chamada `proxy`. Runtime é **nodejs** (não edge) e não é configurável. Usado para refresh de sessão Supabase + proteção de rotas.
- **APIs de request são assíncronas:** `cookies()`, `headers()`, `draftMode()`, e `params`/`searchParams` em pages/layouts são **Promises** → sempre `await`. Isso afeta o client Supabase de servidor.
- **Turbopack por padrão** em `next dev` e `next build` (sem flag).
- **`next lint` removido** — usar ESLint direto (`npm run lint` = `eslint`). `next build` não roda lint.
- `revalidateTag` agora exige 2º argumento (perfil de cacheLife); preferir `updateTag` em Server Actions para read-your-writes.
- Tailwind v4: tema via `@theme inline` + variáveis CSS em `globals.css` (não há `tailwind.config.js` clássico).

## 3. Modelo de dados (single-user + RLS)

Sistema de **usuário único**. A autenticação usa o `auth.users` nativo do Supabase. **Todas** as tabelas de negócio têm coluna `user_id uuid not null references auth.users(id)` e **RLS habilitada** com policies do tipo:

```sql
alter table public.<tabela> enable row level security;
create policy "own rows" on public.<tabela>
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
```

Padrões de schema:
- `id uuid primary key default gen_random_uuid()`
- `user_id uuid not null references auth.users(id) on delete cascade`
- `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()` (trigger de updated_at)
- Índice em `user_id` em todas as tabelas; índices adicionais por colunas de filtro (datas, status, fk de cartão/conta).
- Valores monetários: armazenar em **centavos (integer)** ou `numeric(14,2)` — **padronizar e documentar na Fase 02** (recomendação: `numeric(14,2)` para legibilidade, com utilitários de formatação).

**Entidades (Módulo 16):** `accounts, credit_cards, card_statements, transactions, transaction_installments, categories, subcategories, people, shared_expenses, receivables, bills, recurring_transactions, tasks, projects, routines, habits, habit_logs, study_courses, study_modules, study_lessons, study_sessions, calendar_events, notifications, attachments, import_batches, import_rows, settings` (+ opcional `profiles`).

> O schema é entregue **incrementalmente por fase** (não tudo de uma vez). Migrations em `supabase/migrations/` (criadas a partir da Fase 02).

### Regra de fatura (resumo para implementação na Fase 03)
Dado `data_compra`, `dia_fechamento`, `dia_vencimento`:
1. Determinar o fechamento de referência: se `dia(data_compra) <= dia_fechamento`, a fatura fecha no `dia_fechamento` do **mês corrente**; senão, no **mês seguinte**.
2. O vencimento é o `dia_vencimento` do mês do fechamento (ou do mês seguinte se `dia_vencimento < dia_fechamento`).
3. Tratar meses com menos dias (clamp para o último dia do mês) e virada de ano. Centralizar em `src/lib/finance/invoice.ts` com **testes unitários** de borda.

## 4. Estrutura de pastas

```
src/
  app/
    (auth)/                  # grupo público (login, cadastro)
      login/page.tsx
      cadastro/page.tsx
      layout.tsx
    (app)/                   # grupo autenticado (protegido pelo proxy)
      layout.tsx             # app shell: Sidebar + Header
      dashboard/page.tsx
      financeiro/page.tsx
      cartoes/page.tsx
      faturas/page.tsx
      parcelamentos/page.tsx
      terceiros/page.tsx
      importar/page.tsx
      agenda/page.tsx
      tarefas/page.tsx
      habitos/page.tsx
      estudos/page.tsx
      configuracoes/page.tsx
    auth/callback/route.ts   # callback OAuth (Supabase)
    layout.tsx               # root layout (html/body, providers, fonte)
    globals.css              # Tailwind v4 + design tokens (dark/light)
  components/
    ui/                      # shadcn/ui (button, card, input, dialog, ...)
    layout/                  # Sidebar, Header, ThemeToggle, UserMenu, MobileNav
    shared/                  # PageHeader, EmptyState, StatCard, Logo, ...
    providers/               # ThemeProvider, QueryProvider
  lib/
    supabase/                # client.ts (browser), server.ts, proxy-session.ts
    utils.ts                 # cn() e helpers
    format.ts                # moeda/data pt-BR (Fase 02+)
    finance/                 # invoice.ts, installments.ts (Fase 03/04)
  hooks/                     # hooks reutilizáveis (TanStack Query, etc.)
  config/                    # navegação (nav.ts), constantes, env
  types/                     # tipos TS e (futuro) tipos gerados do Supabase
  proxy.ts                   # sessão Supabase + proteção de rotas
supabase/
  migrations/                # SQL versionado (a partir da Fase 02)
docs/                        # documentação do projeto (este diretório)
```

## 5. Padrões

- **Componentes:** Server Components por padrão; `'use client'` apenas para interatividade (forms, toggles, menus). UI base via shadcn em `components/ui`.
- **Rotas:** App Router com route groups `(auth)` e `(app)`. Páginas de módulo em pt-BR.
- **Forms:** `react-hook-form` + `zod` (schemas em colocação com o form ou em `lib`); mensagens de erro em pt-BR; estados de loading/erro com toast (sonner).
- **Dados:** leitura em Server Components quando possível; mutações via Server Actions ou rotas; no client, `@tanstack/react-query` com query keys por entidade. Sempre respeitando RLS (o usuário só vê o que é dele).
- **Supabase:** `lib/supabase/client.ts` (`createBrowserClient`), `lib/supabase/server.ts` (`createServerClient` com `await cookies()`), `proxy.ts` para refresh de sessão. Variáveis em `.env.local`.
- **Tema:** `next-themes` com `attribute="class"`; tokens em `globals.css` (`:root` light, `.dark` dark). Cor de destaque = dourado (`--primary`).
- **Formatação:** utilitários centralizados (`Intl.NumberFormat('pt-BR', {style:'currency', currency:'BRL'})`, `date-fns` com `ptBR`).

## 6. Variáveis de ambiente

`.env.local` (ver `.env.local.example`):

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...        # somente servidor; nunca expor
# (futuro) GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET para Google Agenda (Fase 08)
```

O usuário **já possui** um projeto Supabase; as chaves são fornecidas por ele.

## 7. Como rodar

```bash
npm install
# preencher .env.local com as chaves do Supabase
npm run dev      # http://localhost:3000 (Turbopack)
npm run build    # build de produção (Turbopack)
npm run start    # servir build
npm run lint     # ESLint
```

## 8. Como testar

- **Regras críticas (financeiro):** testes unitários para `invoice.ts` (fatura correta) e `installments.ts` (distribuição de parcelas) — adicionar runner de teste (Vitest) na Fase 02/03.
- **RLS:** testar pelo client SDK autenticado (não pelo SQL editor, que ignora RLS).
- **Manual:** dark/light, responsividade (desktop/tablet/mobile), navegação entre módulos, fluxo de login.

## 9. Observações técnicas

- OneDrive + caminho com espaços: funciona, mas evitar ferramentas que não lidam bem com espaços; usar caminhos relativos.
- Git foi inicializado pelo `create-next-app`.
- `AGENTS.md`/`CLAUDE.md` na raiz apontam para as regras do Next 16 e para esta documentação — leia antes de codar.

---

## Módulo TO-DO (Fase 15)

Gerenciador principal de tarefas, em `/todo`. Segue o mesmo padrão do resto do sistema
(Server Component lê → Server Action muta → `revalidatePath`), com a lógica de negócio
isolada em funções puras testadas.

### Por que tabelas `todo_*` novas
`tasks`/`projects` (Fase 09) estão acoplados a `calendar_events.task_id`, ao gerador de
notificações, à busca global, ao dashboard e ao kanban-por-status. Remodelar essas tabelas
para suportar seções, subtarefas, `scheduled_date` + `deadline_at` e séries recorrentes
exigiria alterar os cinco pontos ao mesmo tempo. As tabelas `todo_*` são um superset e
convivem com as antigas. **Não remover `/tarefas` sem antes migrar aqueles cinco pontos.**

### Mapa de arquivos
| Camada | Caminho |
| --- | --- |
| Enums, rótulos, tokens visuais | `src/lib/todo/constants.ts` |
| Tipos de domínio | `src/lib/todo/types.ts` |
| **Recorrência (puro)** | `src/lib/todo/recurrence.ts` + `recurrence.test.ts` |
| **Status derivado (puro)** | `src/lib/todo/status.ts` + `status.test.ts` |
| **Filtro/ordenação/agrupamento (puro)** | `src/lib/todo/filters.ts` + `filters.test.ts` |
| **Linguagem natural (puro)** | `src/lib/todo/parse.ts` + `parse.test.ts` |
| **Tarefa → evento Google (puro)** | `src/lib/todo/google-event.ts` + `google-event.test.ts` |
| Envio ao Google (I/O, server-only) | `src/lib/todo/calendar-sync.ts` |
| Leitura (server-only) | `src/lib/todo/queries.ts` |
| Histórico de atividades | `src/lib/todo/activity.ts` |
| Validação Zod | `src/lib/validators/todo.ts` |
| Actions de tarefa | `src/lib/actions/todo.ts` |
| Actions de projeto/seção/etiqueta | `src/lib/actions/todo-projects.ts` |
| Actions de comentário/anexo/lembrete/filtro/preferência | `src/lib/actions/todo-extras.ts` |
| Página e cliente | `src/app/(app)/todo/` |
| Componentes | `src/components/todo/` |
| Card do dashboard | `src/components/dashboard/general/todo-card.tsx` |

### Invariantes que não podem ser quebradas
1. **`atrasada` nunca é gravado.** É derivado de `scheduled_date`/`deadline_at` na leitura
   (`effectiveStatus`). Persistir esse estado quebra a consistência com o resto do sistema.
2. **Conclusão é idempotente por `(user_id, task_id, scheduled_for)`** em
   `todo_completions`. É o que impede duplicar ocorrência ao concluir → reabrir → concluir.
3. **Tarefa recorrente avança a própria linha**, não cria linha nova. O histórico vive em
   `todo_completions`.
4. **Nenhuma exclusão silenciosa.** Projeto, seção e série recorrente exigem escolha
   explícita do destino das tarefas. Etiqueta só remove a associação.
5. **Datas puras `'yyyy-MM-dd'` + hora em coluna `time` separada.** Nunca um timestamptz para
   representar "o dia da tarefa" — o servidor roda em UTC na Vercel.
6. **Toda aritmética de data em `recurrence.ts` usa `Date.UTC` internamente**, e nenhuma
   função pura chama `Date.now()`.
7. **Anexos:** tabela genérica `attachments` + bucket privado `attachments`, caminho
   `{user_id}/todo_task/{task_id}/…`. Sem tabela nem bucket novos; sem URL pública.
8. **A interpretação de texto nunca reescreve o que o usuário digitou.** `parse.ts` devolve
   um `title` derivado e os `tokens` com os intervalos; a caixa continua com o texto
   original e os chips mostram o entendimento **antes** de salvar. Padrão ambíguo é
   ignorado. A normalização remove acentos **preservando o comprimento** — se decompuser
   (`String.normalize`), os índices das regex desalinham do texto original.
9. **Envio ao Google é opt-in e de sentido único.** Só com
   `google_integrations.todo_sync_enabled`; tarefa vira evento, evento não vira tarefa
   (isso duplicaria com a importação da Fase 08). **Recorrente não publica RRULE**: como a
   série avança na própria linha (invariante 3), um RRULE sairia do lugar assim que o
   usuário concluísse fora da data — enviamos só a ocorrência atual e movemos o mesmo
   evento. Excluir tarefa remove o evento **antes** do `delete` (a ponte
   `todo_calendar_sync` é `on delete cascade`). Falha do Google nunca derruba a ação: fica
   em `last_error`, sem token nem corpo de resposta.

---

## Módulo Dieta e Alimentação (Fase 16 — Subfases A, B, C e D concluídas)

Módulo central em `/nutricao`, com **navegação interna própria** (12 submódulos) no mesmo
padrão do TO-DO. Segue o fluxo do resto do sistema: Server Component lê → Server Action muta
→ `revalidatePath`, com a lógica de negócio isolada em funções puras testadas.

### As três invariantes que sustentam o módulo

1. **Ausência de dado NÃO é zero.** Cada valor nutricional carrega um `value_state`:
   `disponivel | traco | nao_disponivel | nao_aplicavel | em_revisao`. Só `disponivel` tem
   número — uma CHECK constraint garante isso no banco, não só no código. Toda soma propaga
   uma **qualidade** (`exato | aproximado | parcial`) e a interface é obrigada a exibi-la.
   *Exemplo real:* "Sal, grosso" tem energia `nao_aplicavel` na TACO e o app mostra "n/a",
   não "0 kcal".
2. **A base do sistema é imutável.** `user_id is null` = linha global, somente leitura. As
   policies são **separadas por comando** (SELECT alcança o global; INSERT/UPDATE/DELETE só o
   próprio). Favoritar, arquivar e recategorizar um alimento global grava em
   `nutrition_food_prefs` (dado do usuário), nunca no alimento. Duplicar cria cópia editável
   com `origin_food_id`.
3. **Conversão impossível é erro explícito, nunca estimativa.** Medida em gramas + alimento
   medido em ml exigiria densidade; `convertToBase` devolve um erro tipado e a UI explica.
   Não há conversão genérica entre alimentos (colher de arroz ≠ colher de azeite).
4. **O histórico não muda quando o alimento muda** (16-B). `nutrition_diary_entries` congela
   o consumo no ato do registro — identidade, quantidade, conversão, procedência e os
   nutrientes já ajustados à porção (`nutrients_snapshot jsonb`). O total do dia soma **esse
   jsonb**: não existe caminho de leitura do total que passe pelo catálogo. `food_id` é
   `on delete set null` (referência informativa), e o discriminador estável da linha é
   `entry_kind` — não a presença de `food_id`, que pode virar nulo.
5. **Planejado ≠ consumido** (16-B). Tabelas separadas; registrar consumo nunca escreve no
   planejamento. A diferença é derivada por `planned_item_id` + `change_kind`.
6. **Status derivado na leitura** (16-B). `pendente` **não existe no CHECK** de
   `nutrition_diary_meals`: sai de `planned_time` + hora atual, como 'atrasada' no TO-DO
   (F15) e o status da fatura (F03).
7. **A meta de um dia é a que valia naquele dia** (16-B). `nutrition_goal_periods` tem
   `starts_on`/`ends_on`; mudar de objetivo encerra o período e abre outro, em vez de
   sobrescrever o alvo — senão o relatório do mês passado mudaria sozinho.
8. **A água é do módulo Hábitos** (F10). Dieta lê `habits`/`habit_logs` da categoria `agua` e
   linka; não existe tabela de água aqui.
9. **O peso de uma comida pronta é INFORMADO, nunca deduzido** (16-C).
   `nutrition_recipes.total_weight_g` vem da balança do usuário; sem ele o valor "por 100 g"
   fica **indisponível com explicação**. Cair para a soma dos ingredientes crus daria um
   número plausível e errado — o preparo perde e ganha água de formas que dependem do fogo,
   do tempo e da panela.
10. **Receita e refeição-modelo entram no diário pelo MESMO caminho** (16-C).
    `buildRecipeEntrySnapshot` **chama** `buildDiaryEntrySnapshot`; `entry_kind` ganhou
    `'receita'` e `'modelo'`. Um segundo caminho de gravação faria diário, receita e relatório
    discordarem sobre a mesma comida.
11. **A qualidade agregada viaja com o número** (16-C). `SnapshotNutrient` e
    `ComputedNutrient` têm um `quality` **opcional**, preenchido só em valor somado (receita,
    modelo), e `sumNutrient` o respeita. Sem ele, uma receita parcial entraria no total do dia
    com cara de exata.
12. **Substituir exige confirmação e grava histórico** (16-C). A tela mostra original ×
    alternativa, a diferença por macro, o impacto no dia e o que resta da meta; a diferença é
    **recalculada no servidor** antes de gravar. Nenhuma equivalência é afirmada, e a ordem
    das alternativas é a prioridade **do usuário** — não um ranking calculado.
13. **A lista de compras NÃO soma unidades incompatíveis** (16-D). 200 g de arroz + 1 xícara de
    arroz só viram uma linha com conversão real cadastrada; sem ela, linhas separadas com o
    motivo em `separate_reason`. Massa com massa, volume com volume — **g ↔ ml exige
    densidade**, e `un` é contagem, não massa. Toda a decisão mora em
    `src/lib/nutrition/shopping.ts`, como todo total mora em `calc.ts`.
14. **A origem do item viaja congelada e o ajuste manual sobrevive** (16-D). `origins` (jsonb)
    guarda de qual refeição, data e receita veio cada parcela; `quantity_overridden` faz a
    regeração atualizar origem e corredor **sem** reescrever a quantidade que o usuário
    ajustou. O que o planejamento não pede mais vira **obsoleto para confirmar**, não exclusão.
15. **O desconto da despensa é opt-in, mostrado antes e recalculado no servidor** (16-D).
    Cobertura total **não zera** a quantidade: o item vira `removido` ("não vou comprar") e
    continua na lista. Na despensa, `quantity` nula é "não sei quanto" (não desconta) e zero é
    "acabou" — a mesma distinção do `value_state`. A despensa tem **6 campos** e não é ERP de
    estoque: marcar comprado não dá baixa nela.

### Base nutricional
**TACO 4ª edição (NEPA/UNICAMP, 2011)** — 597 alimentos, 21.147 valores. Obtida do XLSX
**oficial** publicado pelo NEPA (sem scraping). A obra autoriza reprodução mediante citação,
que a interface exibe. Pipeline determinístico e reexecutável:

```bash
node scripts/nutrition/build-taco-dataset.mjs <taco.xlsx>   # XLSX → dataset + manifesto (SHA-256)
node scripts/nutrition/generate-taco-migration.mjs          # dataset → migrations idempotentes
```

Atribuição, licença e decisões de fidelidade em `data/nutrition/taco-4/ATTRIBUTION.md`.

### Schema — 16-A (10 tabelas + 1 view)
`nutrition_nutrients` (catálogo global de referência, **somente leitura, sem policy de
escrita**), `nutrition_food_sources`, `nutrition_food_categories`, `nutrition_foods`,
`nutrition_food_nutrients` (**única fonte de verdade** de nutriente), `nutrition_food_measures`,
`nutrition_food_prefs`, `nutrition_food_tags`, `nutrition_food_tag_links`,
`nutrition_import_batches` + a view `nutrition_foods_view` (`security_invoker = true`).

A view **pivota** os nutrientes quentes para permitir ordenar/filtrar sem N+1. É derivação,
não segunda fonte de verdade — **nunca materialize nutriente em coluna de `nutrition_foods`**.

### Schema — 16-B (10 tabelas)
**Metas:** `nutrition_profiles` (uma linha/usuário, tudo informado por ele),
`nutrition_goal_periods` (meta vigente por data), `nutrition_goal_items` (valor por nutriente
e escopo: dia da semana · treino/descanso · refeição).
**Diário:** `nutrition_meal_types` (dado do usuário — sem seed em migration; criados na
primeira leitura por `ensureMealTypes()`, idempotente pelo unique `(user_id, slug)`),
`nutrition_diary_meals` (dia em `date` puro + horas em `time`), `nutrition_diary_entries`
(**o snapshot**).
**Planejamento:** `nutrition_plans` (modelo de semana, ciclo de 1 a 8 semanas),
`nutrition_plan_days`, `nutrition_planned_meals` (âncora dupla: `planned_date` **ou**
`plan_day_id`), `nutrition_planned_meal_items`.

### Schema — 16-C (8 tabelas + 2 alterações)
**Receitas:** `nutrition_recipe_categories` (serve a receitas E refeições-modelo),
`nutrition_recipes` (rendimento + `total_weight_g` informado), `nutrition_recipe_ingredients`
(sem snapshot: a receita é modelo mutável).
**Refeições-modelo:** `nutrition_meal_templates`, `nutrition_meal_template_items` (alimento,
receita ou item livre — o discriminador estável é `item_kind`).
**Substituições:** `nutrition_substitution_groups` (item original + tolerâncias por macro),
`nutrition_substitution_options` (alternativas, com a prioridade do usuário),
`nutrition_substitution_logs` (histórico congelado; todas as FKs `on delete set null`).
**Alterações:** `nutrition_diary_entries` ganhou `recipe_id`, `meal_template_id` e os valores
`'receita'`/`'modelo'` em `entry_kind`; `nutrition_planned_meal_items` ganhou `item_kind`,
`recipe_id`, `portion_unit` e `meal_template_id`.

### Schema — 16-D (4 tabelas)
`nutrition_market_categories` (corredores do mercado — **dado do usuário**, semeado na primeira
leitura por `ensureMarketCategories()`, idempotente pelo unique parcial `(user_id, slug)`; não
é taxonomia nutricional), `nutrition_shopping_lists` (`recurrence_key` determinística por
período, `pantry_applied_at`), `nutrition_shopping_list_items` (`origins` jsonb,
`consolidation_key`, `quantity_overridden`, `separate_reason`, preços em **centavos**) e
`nutrition_pantry_items` (6 campos, sem movimentação).

> O total gasto da lista **não é materializado**: sai de `summarizeShoppingList` na leitura, que
> também conta quantos itens estão **sem preço** — ausência de preço não é zero.

> Nenhum valor nutricional é materializado em receita ou modelo: o total sai de `recipe.ts` /
> `meal-template.ts` a partir dos ingredientes e do catálogo atual. Materializar criaria uma
> segunda verdade que envelheceria no primeiro ingrediente corrigido.

> A **foto da receita** reusa a tabela `attachments` + o bucket privado `attachments`
> (`{user_id}/…`, Fase 14) — nenhum bucket novo.

> ⚠️ **`ON CONFLICT` não funciona com os índices únicos parciais e de expressão deste
> módulo.** O Postgres não infere índice parcial sem repetir o predicado, e o PostgREST não
> permite repetir — o `upsert` falha **só em runtime** (`42P10`). Use
> *select-then-insert/update* nos pontos idempotentes
> (`nutrition_diary_entries.planned_item_id`, materialização de modelo,
> `nutrition_shopping_lists.recurrence_key` e
> `nutrition_shopping_list_items.consolidation_key`) e delete-do-escopo + insert em
> `nutrition_goal_items` (índice com `coalesce`). No PostgREST, `.eq(coluna, null)` não casa
> com NULL — use `.is(coluna, null)`.

### Mapa de arquivos
| Camada | Caminho |
| --- | --- |
| Enums, rótulos, seções da navegação | `src/lib/nutrition/constants.ts` |
| Tipos de domínio | `src/lib/nutrition/types.ts` |
| **Conversão de medidas (puro)** | `src/lib/nutrition/units.ts` + `units.test.ts` |
| **Cálculo nutricional (puro)** | `src/lib/nutrition/calc.ts` + `calc.test.ts` |
| **Filtro/ordenação/URL (puro)** | `src/lib/nutrition/filters.ts` + `filters.test.ts` |
| **Data pura e horário (puro)** | `src/lib/nutrition/calendar.ts` + `calendar.test.ts` |
| **Snapshot do consumo (puro)** | `src/lib/nutrition/snapshot.ts` + `snapshot.test.ts` |
| **Metas, progresso e aderência (puro)** | `src/lib/nutrition/goals.ts` + `goals.test.ts` |
| **Diário: totais, status, planejado × consumido (puro)** | `src/lib/nutrition/diary.ts` + `diary.test.ts` |
| **Recorrência do planejamento (puro)** | `src/lib/nutrition/plan-recurrence.ts` + `plan-recurrence.test.ts` |
| **Receitas: total, porção, 100 g, rendimento (puro)** | `src/lib/nutrition/recipe.ts` + `recipe.test.ts` |
| **Refeições-modelo e duplicação (puro)** | `src/lib/nutrition/meal-template.ts` + `meal-template.test.ts` |
| **Substituições: diferença, tolerância, impacto (puro)** | `src/lib/nutrition/substitution.ts` + `substitution.test.ts` |
| **Compras: consolidação, despensa, recorrência (puro)** | `src/lib/nutrition/shopping.ts` + `shopping.test.ts` |
| Snapshot → colunas do diário | `src/lib/nutrition/entry-columns.ts` |
| Leitura (server-only) | `src/lib/nutrition/queries.ts` · `diary-queries.ts` · `recipe-queries.ts` · `shopping-queries.ts` |
| Validação Zod | `src/lib/validators/nutrition.ts` · `nutrition-diary.ts` · `nutrition-recipes.ts` · `nutrition-shopping.ts` |
| Server Actions | `src/lib/actions/nutrition-{foods,diary,goals,plans,recipes,meal-templates,substitutions,shopping}.ts` |
| Rotas | `src/app/(app)/nutricao/` |
| Componentes | `src/components/nutrition/` |
| Pipeline da base | `scripts/nutrition/` · dados em `data/nutrition/taco-4/` |

**Todo total do módulo sai de `calc.ts`.** As subfases E–F devem reusar, nunca reimplementar
a conta — é o que garante que diário, receita e relatório concordem entre si. Na 16-C isso
virou estrutura: `recipe.ts` chama `convertToBase` + `scaleNutrients` + `sumNutrients`, e
`buildRecipeEntrySnapshot` chama `buildDiaryEntrySnapshot`. Na 16-D o mesmo princípio ganhou um
irmão em compras: **toda decisão sobre o que soma com o quê sai de `shopping.ts`**, que reusa
`toBaseUnitValue` de `units.ts` — e se recusa a converter o que não tem conversão real.

---

## Módulo Treinos (Fase 17 — Subfases A, B e C concluídas)

Módulo central em `/treinos`, com **navegação interna própria** (13 submódulos) no mesmo
padrão do TO-DO e da Dieta. Segue o fluxo do resto do sistema: Server Component lê → Server
Action muta → `revalidatePath`, com a lógica de negócio isolada em funções puras testadas.

### A invariante que sustenta o módulo: **`tracking_type` é um contrato de medição**

Um exercício não é um nome — é a declaração do que aquele movimento **mede**:

```
peso_reps                → peso + repetições              (supino, agachamento)
peso_corporal_reps       → repetições                     (flexão)
peso_corporal_adicional  → repetições + carga adicional   (paralelas com cinto)
peso_corporal_assistido  → repetições + ASSISTÊNCIA       (barra assistida)
duracao / isometria      → segundos
distancia_duracao        → distância + segundos
calorias                 → estimativa do painel do aparelho
reps_sem_carga           → repetições
lado_a_lado              → valores por lado
personalizado            → campos livres
```

`src/lib/training/tracking.ts` é a **única** fonte dessa matriz — formulário, treino-modelo
(17-B), sessão (17-C), volume (17-D) e relatório (17-E) leem dali. Duas consequências que
parecem detalhe e não são, ambas cobertas por teste:

1. **Assistência SUBTRAI carga**; carga adicional soma. Inverter o sinal faria o app mostrar
   progresso justamente quando o usuário está regredindo.
2. **Sem peso corporal registrado, a carga efetiva é INDISPONÍVEL, nunca zero.** Uma flexão
   não é "0 kg × 12". Mesma disciplina do `value_state` da Dieta: ausência de dado não é zero,
   e o agregado do período fica marcado como **parcial**.

### As outras invariantes

3. **A base do sistema é imutável.** `user_id is null` = linha global, somente leitura, com
   policies **separadas por comando**. Três constraints amarram `user_id is null` ⇔
   `is_system_exercise` ⇔ `source = 'sistema'`, então um exercício digitado à mão não pode se
   apresentar como parte da base. Favoritar, arquivar, apelidar e ajustar descanso/incremento
   vão para `training_exercise_prefs`; duplicar cria cópia com `origin_exercise_id`.
4. **Modelo é mutável; execução é imutável** (17-C, cumprida). `startSession` copia o modelo
   para `training_sessions.workout_snapshot` **e** para as linhas de
   `training_session_exercises` / `training_session_sets`. `session-queries.ts` **não tem uma
   única referência a `training_workouts`** — renomear, editar, arquivar ou excluir o modelo não
   muda nada do que já aconteceu. Verificado no banco, não só no código.
5. **Nenhum asset de terceiros.** A base de exercícios é autoral; sem imagem, vídeo, texto de
   instrução ou banco de dados copiado de apps de treino. Procedência em
   `data/training/exercise-base/ATTRIBUTION.md`.
6. **Medidas corporais são `body_*`** — módulo central compartilhado com a Dieta. Quem chegar
   primeiro (16-E ou 17-E) cria; o outro consome. **Nunca duas tabelas de peso corporal.**
7. **Ferramenta de organização e registro.** Sem diagnóstico, sem prescrição, sem garantia de
   resultado, sem sugestão de carga máxima e sem incentivo a treinar com dor.

### `expandPlannedSets` é o contrato de série planejada (17-B)

Um exercício do treino-modelo pode ter séries **uniformes** (`default_sets`: "4×8-12, 90s") ou
configuradas **uma a uma** (`training_workout_sets`: top set + back-off, pirâmide, drop set).
`src/lib/training/workout.ts` resolve os dois casos num **formato único** — `PlannedSet[]` — e
é o único caminho. Regras que moram só ali:

- existindo ao menos uma linha configurada, **ela é a verdade** e `default_sets` vira exibição;
- `null` numa série significa **"herda do exercício"**, e a herança acontece num lugar só;
- a numeração é reescrita 1..N (buraco na numeração salva não vira buraco na sessão);
- os campos que o `tracking_type` não usa viram `null`, **pela matriz de `tracking.ts`** — não
  há segunda matriz de medição no módulo.

**A sessão ao vivo (17-C) consome só esse formato** e não precisa saber que existem dois
jeitos de configurar séries.

### Carga planejada em três colunas (17-B)
`planned_weight_kg` (barra/máquina), `planned_additional_weight_kg` (**soma**: cinto, colete) e
`planned_assistance_weight_kg` (**subtrai**: barra assistida). Guardar os três num campo só
obrigaria cada tela a reinterpretar o sinal a partir do `tracking_type` — e uma delas erraria,
mostrando "progresso" justamente na regressão. A conta continua saindo de `effectiveLoadKg`.

### Status derivado do planejamento (17-B)
`training_scheduled_workouts.status` grava só FATO (`planejado`, `concluido`, `nao_realizado`,
`reagendado`, `cancelado`). **"Atrasado" e "hoje" nascem em `derivePlannedStatus(entry, hoje)`**
com o `hoje` injetado pelo servidor (`hojeISO()`, Brasília) — nunca são persistidos, como
`atrasada` no TO-DO e o status da fatura. Desfecho gravado sempre vence a derivação.
**"Concluído" não é gravável pela 17-B**: quem conclui um dia planejado é `finishSession`
(17-C), ao finalizar a execução — não existe "concluído manual" sem treino registrado.

### Nenhuma exclusão silenciosa (17-B)
Excluir programa pergunta o destino dos treinos (manter avulsos / mover / excluir junto);
excluir treino-modelo pergunta o destino do planejamento **futuro** (manter como "treino
removido" / trocar por outro / remover). O planejamento **passado nunca é alterado**. Os
schemas Zod dessas ações **não têm valor padrão** para a escolha: esquecer o campo vira erro de
validação, não perda de dado. No banco, `exercise_id` do treino é `on delete restrict` e
`workout_id` do planejamento é `on delete set null`.

### A sessão ao vivo (17-C)

**Estados** (`session-machine.ts`, a única fonte das transições válidas):

```
Sessão    rascunho → pronta → ativa ⇄ descansando ⇄ pausada → concluida
                                                            ↘ abandonada / cancelada
Exercício pendente → ativo → (parcial) → (concluido)     ↘ pulado / substituido
Série     pendente → ativa → concluida                   ↘ pulada / falhou / cancelada
```

`parcial` e `concluido` do exercício **não são graváveis**: nascem de `deriveExerciseStatus` a
partir da contagem das séries — mesma disciplina de `atrasada` no TO-DO. O status da SESSÃO é
gravado, porque é ele que sustenta o índice único de "nunca duas em execução".

**Ordem planejada × ordem executada.** `planned_position` nunca muda; `executed_position` é
reescrita ao reordenar. As séries pertencem ao **exercício**, não à posição — por isso reordenar,
pular, voltar depois, mandar para o fim e substituir nunca perdem uma série registrada.

**Cronômetro por timestamps** (`timers.ts`, `agora` injetado). Nada de contagem local: o descanso
guarda `started_at` + `planned_seconds` + ajustes, e o restante é recalculado do zero a cada
render. Tempo ativo = total − **união** de pausas e descansos (descanso dentro de pausa não é
descontado duas vezes). Um `setInterval` só provoca o re-render.

**Idempotência por `client_mutation_id`** (uuid do dispositivo, unique por sessão): clique duplo,
retry da fila local e duas abas convergem para uma linha. As actions conferem se a mutação já foi
aplicada antes de aplicar — é isso que impede um retry atrasado de desfazer uma correção
posterior.

**Resiliência declarada com honestidade.** Não há service worker e o app **não** funciona
offline. O que existe: mutação aplicada localmente → persistida no dispositivo → enfileirada →
reenviada em ordem quando a conexão volta, com o estado (`Salvo` · `Salvando` · `Salvo no
dispositivo` · `Aguardando conexão` · `Erro ao sincronizar`) sempre visível. A sessão em execução
vive no **servidor**, então fechar a aba e reabrir recupera tudo.

**Substituição é registro, não equivalência.** Original, substituto, motivo (obrigatório, sem
valor padrão) e momento ficam gravados; o exercício substituído permanece na sessão com as séries
que já tinham sido feitas.

**Peso corporal fica na sessão** (`body_weight_kg`), congelado como o valor usado naquele treino.
Não é uma segunda tabela de peso corporal: quando a 17-E criar o módulo `body_*`, a preparação
passa a pré-preencher dali.

### Schema (23 tabelas: 7 na 17-A + 7 na 17-B + 9 na 17-C)
**17-A** — `training_muscle_groups`, `training_equipment`, `training_exercises`,
`training_exercise_muscles` (secundários, com trigger que impede repetir o principal),
`training_exercise_alternatives` (relação dirigida, do usuário), `training_exercise_prefs`
e `training_preferences` (uma linha por usuário).

**17-B** — `training_programs`, `training_program_workouts` (junção, e não FK direta: um treino
pode ser avulso ou compor vários programas), `training_workouts` (com `version` +
`superseded_by` + `version_group_id`), `training_workout_exercises`, `training_workout_sets`,
`training_workout_alternatives` e `training_scheduled_workouts` (data pura + hora em `time`).

**17-C** — `training_locations`, `training_location_plates` (estoque real de anilhas por local),
`training_sessions` (o snapshot + tempos congelados na finalização), `training_session_exercises`
(cópia histórica, com ordem planejada e executada), `training_session_sets` (idempotente por
`client_mutation_id`), `training_session_rests`, `training_session_pauses`,
`training_session_events` (**append-only**, sem `updated_at`) e
`training_session_substitutions`. Índices únicos parciais garantem no banco: **uma** sessão em
execução por usuário, **um** descanso ativo por sessão, **uma** pausa aberta por sessão e **um**
local padrão por usuário.

### Mapa de arquivos
| Camada | Caminho |
| --- | --- |
| Enums, rótulos, seções da navegação | `src/lib/training/constants.ts` |
| Tipos de domínio | `src/lib/training/types.ts` |
| **Contrato de medição (puro)** | `src/lib/training/tracking.ts` + `tracking.test.ts` |
| **Filtro/ordenação/URL (puro)** | `src/lib/training/filters.ts` + `filters.test.ts` |
| **Treino-modelo: `expandPlannedSets`, superset, duração (puro)** | `src/lib/training/workout.ts` + `workout.test.ts` |
| **Planejamento: recorrência, rodízio, status derivado (puro)** | `src/lib/training/schedule.ts` + `schedule.test.ts` |
| **Máquina de estados da sessão (puro)** | `src/lib/training/session-machine.ts` + `.test.ts` |
| **Fluxo: `nextStep`, superset, reordenação (puro)** | `src/lib/training/session-flow.ts` + `.test.ts` |
| **Cronômetros por timestamp (puro)** | `src/lib/training/timers.ts` + `.test.ts` |
| **Valores da última vez (puro)** | `src/lib/training/previous.ts` + `.test.ts` |
| **Calculadora de anilhas (puro)** | `src/lib/training/plates.ts` + `.test.ts` |
| **Congelamento do treino (puro)** | `src/lib/training/session-snapshot.ts` + `.test.ts` |
| Leitura (server-only) | `src/lib/training/queries.ts` · `routine-queries.ts` · `session-queries.ts` |
| Validação Zod | `src/lib/validators/training.ts` · `training-routines.ts` · `training-session.ts` |
| Server Actions | `src/lib/actions/training-{exercises,preferences,programs,workouts,schedule,sessions,locations}.ts` |
| Rotas | `src/app/(app)/treinos/` |
| Componentes | `src/components/training/` · `src/components/training/session/` |
| Pipeline da base | `scripts/training/` · dados em `data/training/exercise-base/` |

**Todo número agregado do módulo vai sair de `src/lib/training/metrics.ts` (17-D)** — do mesmo
jeito que todo total da Dieta sai de `calc.ts`. Histórico, gráfico, recorde, dashboard e
relatório precisam concordar entre si.
