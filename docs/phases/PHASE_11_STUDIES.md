# Fase 11 — Estudos

## Contexto
Última fase de **conteúdo de produtividade** antes da unificação. Com tarefas/rotinas (Fase 09) e hábitos (Fase 10) prontos, esta fase entrega o módulo de **Estudos**, focado em **cursos online, marketing, idiomas e desenvolvimento pessoal** — explicitamente **não** faculdade/escola. Organiza cursos → módulos → aulas, registra **sessões de estudo** (tempo, o que aprendi, próxima ação), cobre **idiomas** (vocabulário e as quatro habilidades) e entrega um **dashboard de estudos** com horas, progresso por curso e sequência de dias. Fecha o conjunto de módulos que o Dashboard Geral (Fase 12) vai consolidar.

## Antes de começar
O agente deve ler:
- `docs/project/PROJECT_BRIEFING.md`
- `docs/project/PROJECT_RULES.md`
- `docs/project/PROJECT_ARCHITECTURE.md`
- `docs/project/PROJECT_ROADMAP.md`
- `docs/project/CURRENT_STATUS.md`
- `docs/handoff/LAST_PHASE_SUMMARY.md`
- `docs/handoff/NEXT_AGENT_INSTRUCTIONS.md`
- Este arquivo.

## Objetivo da fase
Permitir cadastrar e acompanhar cursos online (com módulos e aulas), registrar progresso (%), carga horária e tempo estudado, metas e materiais; registrar sessões de estudo com aprendizado e próxima ação; controlar estudo de idiomas (vocabulário, listening/speaking/reading/writing, meta semanal); e visualizar um dashboard de estudos (horas na semana/mês, progresso por curso, próximas aulas, sequência de dias estudando) — tudo com RLS, em pt-BR e formato brasileiro.

## Escopo da fase
- **Schema + migrations (Supabase, `supabase/migrations/`):** todas com `user_id uuid not null references auth.users(id) on delete cascade`, **RLS habilitada** (`user_id = auth.uid()` em `using` e `with check`), índices em `user_id` e nas colunas de filtro, trigger `updated_at`.
  - **`study_courses`** (curso): `title`, `platform` (ex.: Udemy, Hotmart, YouTube, Alura...), `url`, `category` (ex.: `marketing | trafego_pago | ingles | idiomas | negocios | tecnologia | design | vendas | desenvolvimento_pessoal | outro`), `status` (enum `nao_iniciado | em_andamento | pausado | concluido`), `priority` (enum `baixa | media | alta`), `progress` (numeric 0–100, derivado das aulas concluídas; ver Instruções técnicas), `workload_minutes` (carga horária total estimada), `studied_minutes` (tempo estudado acumulado), `start_date`, `target_date` (meta de conclusão), `notes`, `materials` (jsonb/array de `{label, url}`), `is_language` (bool), `cover_color`, `icon`. Índices em `(user_id, status)`, `(user_id, category)`.
  - **`study_modules`** (módulo do curso): `course_id` (fk → `study_courses` on delete cascade), `title`, `position`, `notes`. Índice em `(user_id, course_id)`.
  - **`study_lessons`** (aula): `module_id` (fk → `study_modules` on delete cascade), `course_id` (fk → `study_courses`, desnormalizado para consulta), `title`, `url`, `duration_minutes`, `is_done`, `completed_at`, `position`, `notes`. Índices em `(user_id, course_id)`, `(user_id, module_id)`, `(user_id, is_done)`.
  - **`study_sessions`** (sessão de estudo): `course_id` (fk → `study_courses`), `lesson_id` (fk → `study_lessons`, nullable), `session_date` (date), `duration_minutes`, `what_i_learned` (texto), `next_action` (texto), `difficulty` (enum `facil | media | dificil`), `task_id` (fk → `tasks`, nullable — tarefa relacionada, Fase 09). Índices em `(user_id, session_date)`, `(user_id, course_id)`.
  - **(Idiomas) `study_vocabulary`** (vocabulário, quando `is_language`): `course_id` (fk → `study_courses`), `term`, `translation`, `example`, `mastery` (enum `novo | aprendendo | dominado`), `next_review_date` (nullable). Índices em `(user_id, course_id)`, `(user_id, mastery)`.
  - **(Idiomas) `study_language_practice`** (prática por habilidade): `course_id` (fk → `study_courses`), `practice_date` (date), `skill` (enum `listening | speaking | reading | writing`), `duration_minutes`, `notes`. Índices em `(user_id, course_id)`, `(user_id, practice_date)`. **Meta semanal** por idioma pode ficar em coluna no `study_courses` (`weekly_goal_minutes`) ou tabela própria — documentar a escolha.
- **Cursos / módulos / aulas:** CRUD completo; ordenar módulos e aulas (`position`); marcar aula concluída (atualiza progresso do curso e `studied_minutes`); status/categoria/prioridade; metas (data-alvo, carga horária); materiais/links; notas; próxima aula (primeira não concluída).
- **Sessões de estudo:** registrar sessão (curso, aula/módulo, tempo, o que aprendi, próxima ação, dificuldade); marcar aula concluída a partir da sessão; vincular a uma tarefa (Fase 09) quando fizer sentido; histórico de sessões por curso e geral.
- **Idiomas:** quando o curso é idioma — vocabulário (cadastro, nível de domínio, lista filtrável); prática por habilidade (listening/speaking/reading/writing) com tempo; **meta semanal** e progresso da semana; histórico.
- **Dashboard de estudos:** cursos em andamento; **horas estudadas na semana/mês**; **progresso por curso**; **próximas aulas**; estudos atrasados (curso em andamento sem sessão recente / passou da `target_date`); **sequência de dias estudando** (streak de dias com ao menos uma sessão); gráfico de evolução (recharts).
- **UI:** cards de curso com progresso e capa colorida, árvore módulos/aulas, modal de sessão de estudo, listas/tabela de vocabulário e prática, gráficos, badges de status/dificuldade, empty states, skeletons, toasts, confirmação ao excluir. Reusar componentes das Fases 01–02.

## Fora do escopo
- Conteúdo de **faculdade/escola** (provas, disciplinas acadêmicas, notas escolares) — fora do foco do produto.
- **Dashboard Geral** (Fase 12) — o dashboard desta fase é **apenas de estudos**; a consolidação multi-módulo vem depois.
- **Busca global / lançamento rápido / notificações** (Fase 13) — apenas deixar dados/consultas prontos (ex.: "sessão de estudo" no lançamento rápido será ligada lá).
- Player de vídeo embutido / hospedagem de conteúdo (apenas links externos em `url`/`materials`).
- Algoritmo avançado de revisão espaçada para vocabulário (manter `mastery` + `next_review_date` simples; SRS completo é fora de escopo).

## Instruções técnicas
- **Progresso do curso:** preferir **derivar** `progress` da razão de aulas concluídas (`study_lessons.is_done`) sobre o total, e `studied_minutes` da soma de `study_sessions.duration_minutes` (ou da duração das aulas concluídas — escolher **uma** fonte e documentar). Centralizar esses cálculos em `src/lib/studies/progress.ts` (puro), com **testes unitários** (curso sem aulas, todas concluídas, cálculo de horas semana/mês, "próxima aula").
- **Sequência de dias estudando (streak):** dias consecutivos com ≥1 `study_session`; reutilizar o padrão de streak da Fase 10 (`lib/habits/streak.ts`) se aplicável, ou um helper análogo em `lib/studies` — manter consistente e testado (fuso local pt-BR, "hoje ainda conta").
- Helpers de query (TanStack Query) por entidade em `src/hooks` (`useCourses`, `useLessons`, `useStudySessions`, `useVocabulary`, `useStudyDashboard`), com invalidação seletiva após registrar sessão / concluir aula (progresso e dashboard atualizam na hora).
- Mutations via **Server Actions** (Next 16) com Zod no servidor; nunca confiar em `user_id` do client (`auth.uid()`). Registrar sessão e (opcional) concluir aula em uma operação consistente.
- Materiais/links e vocabulário: validar URLs e sanitizar entradas de texto livre (`what_i_learned`, `notes`).
- Gráficos com **recharts**; horas exibidas em formato amigável (ex.: "3h 20min"); cores no padrão preto/branco/dourado, legíveis em dark e light.
- Datas locais (pt-BR) para `session_date`/`practice_date` (não "virar o dia" por UTC).
- Seguir estrutura de pastas e padrões de `PROJECT_ARCHITECTURE.md`; rota `/estudos`, código em inglês.

## Cuidados
- **RLS obrigatória** em **todas** as novas tabelas (`study_courses`, `study_modules`, `study_lessons`, `study_sessions`, `study_vocabulary`, `study_language_practice`) — nenhuma sem policy `user_id = auth.uid()`.
- `course_id` desnormalizado em `study_lessons`/`study_sessions` deve permanecer **consistente** com a hierarquia (preencher no servidor, não confiar no client).
- Evitar **dupla contagem** de tempo estudado: definir se `studied_minutes` vem das sessões **ou** das aulas concluídas — não somar as duas.
- Manter o foco do produto: nada de recursos de faculdade/escola.
- Não quebrar as Fases 01–10 (layout, tema, rotas, auth, financeiro, agenda, tarefas/rotinas, hábitos). O vínculo `task_id` deve ser **opcional**.
- Migrations **idempotentes** e versionadas; `on delete cascade` coerente (excluir curso remove seus módulos/aulas/sessões com confirmação na UI).
- Manter estados de UI obrigatórios (loading/empty/erro/sucesso), dark/light, responsividade e confirmação ao excluir.

## Critérios de aceite
- [ ] CRUD de cursos, módulos e aulas funcionando com RLS; ordenação e marcação de aula concluída.
- [ ] Progresso (%) e tempo estudado derivados corretamente (fonte única), com testes em `lib/studies/progress.ts` passando.
- [ ] Sessões de estudo (tempo, o que aprendi, próxima ação, dificuldade) registradas; vínculo opcional com tarefa (Fase 09).
- [ ] Idiomas: vocabulário (com nível de domínio), prática por habilidade (listening/speaking/reading/writing) e meta semanal funcionando.
- [ ] Dashboard de estudos: horas semana/mês, progresso por curso, próximas aulas, estudos atrasados e sequência de dias estudando.
- [ ] Estados de UI, dark/light e responsividade; confirmação ao excluir.
- [ ] `npm run build` passa.

## Ao finalizar
O agente deve atualizar:
- `docs/project/CURRENT_STATUS.md`
- `docs/handoff/LAST_PHASE_SUMMARY.md`
- `docs/handoff/NEXT_AGENT_INSTRUCTIONS.md` (apontando para `docs/phases/PHASE_12_GENERAL_DASHBOARD.md`)
