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

## Módulo Dieta e Alimentação (Fase 16 — Subfases A e B concluídas)

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

> ⚠️ **`ON CONFLICT` não funciona com os índices únicos parciais e de expressão deste
> módulo.** O Postgres não infere índice parcial sem repetir o predicado, e o PostgREST não
> permite repetir — o `upsert` falha **só em runtime** (`42P10`). Use
> *select-then-insert/update* nos pontos idempotentes
> (`nutrition_diary_entries.planned_item_id`, materialização de modelo) e delete-do-escopo +
> insert em `nutrition_goal_items` (índice com `coalesce`). No PostgREST,
> `.eq(coluna, null)` não casa com NULL — use `.is(coluna, null)`.

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
| Leitura (server-only) | `src/lib/nutrition/queries.ts` · `diary-queries.ts` |
| Validação Zod | `src/lib/validators/nutrition.ts` · `nutrition-diary.ts` |
| Server Actions | `src/lib/actions/nutrition-{foods,diary,goals,plans}.ts` |
| Rotas | `src/app/(app)/nutricao/` |
| Componentes | `src/components/nutrition/` |
| Pipeline da base | `scripts/nutrition/` · dados em `data/nutrition/taco-4/` |

**Todo total do módulo sai de `calc.ts`.** As subfases B–F devem reusar, nunca reimplementar
a conta — é o que garante que diário, receita e relatório concordem entre si.

---

## Módulo Treinos (Fase 17 — Subfase A concluída)

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
4. **Modelo é mutável; execução é imutável.** A sessão (17-C) grava **snapshot** do treino ao
   iniciar. Nenhuma leitura de histórico pode passar pelo modelo atual.
5. **Nenhum asset de terceiros.** A base de exercícios é autoral; sem imagem, vídeo, texto de
   instrução ou banco de dados copiado de apps de treino. Procedência em
   `data/training/exercise-base/ATTRIBUTION.md`.
6. **Medidas corporais são `body_*`** — módulo central compartilhado com a Dieta. Quem chegar
   primeiro (16-E ou 17-E) cria; o outro consome. **Nunca duas tabelas de peso corporal.**
7. **Ferramenta de organização e registro.** Sem diagnóstico, sem prescrição, sem garantia de
   resultado, sem sugestão de carga máxima e sem incentivo a treinar com dor.

### Schema (7 tabelas na 17-A)
`training_muscle_groups`, `training_equipment`, `training_exercises`,
`training_exercise_muscles` (secundários, com trigger que impede repetir o principal),
`training_exercise_alternatives` (relação dirigida, do usuário), `training_exercise_prefs`
e `training_preferences` (uma linha por usuário).

### Mapa de arquivos
| Camada | Caminho |
| --- | --- |
| Enums, rótulos, seções da navegação | `src/lib/training/constants.ts` |
| Tipos de domínio | `src/lib/training/types.ts` |
| **Contrato de medição (puro)** | `src/lib/training/tracking.ts` + `tracking.test.ts` |
| **Filtro/ordenação/URL (puro)** | `src/lib/training/filters.ts` + `filters.test.ts` |
| Leitura (server-only) | `src/lib/training/queries.ts` |
| Validação Zod | `src/lib/validators/training.ts` |
| Server Actions | `src/lib/actions/training-{exercises,preferences}.ts` |
| Rotas | `src/app/(app)/treinos/` |
| Componentes | `src/components/training/` |
| Pipeline da base | `scripts/training/` · dados em `data/training/exercise-base/` |

**Todo número agregado do módulo vai sair de `src/lib/training/metrics.ts` (17-D)** — do mesmo
jeito que todo total da Dieta sai de `calc.ts`. Histórico, gráfico, recorde, dashboard e
relatório precisam concordar entre si.
