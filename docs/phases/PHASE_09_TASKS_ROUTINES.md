# Fase 09 — Demandas, Tarefas & Rotinas

## Contexto
Com a agenda integrada (Fase 08), começa a camada de **produtividade** do sistema. Esta fase entrega o controle de **demandas, tarefas, projetos e rotinas** — o que precisa ser feito, quando, com que prioridade, e o que se repete no dia a dia (manhã, noite, trabalho, estudos, exercícios). É a base sobre a qual Hábitos (Fase 10) e Estudos (Fase 11) vão se apoiar, e o primeiro módulo que se **relaciona** com a agenda (vincular tarefa a evento) e prepara o terreno para o Dashboard Geral (Fase 12).

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
Permitir criar e organizar tarefas dentro de projetos/listas, com prioridade, status, datas, tags, checklist, anexos, recorrência e lembretes; visualizá-las em múltiplas visões (lista, kanban, calendário, hoje, semana, atrasadas, concluídas); e manter rotinas recorrentes (manhã/noite/trabalho/estudos/exercícios) com execução diária e acompanhamento de frequência — tudo com RLS, em pt-BR e formato de data brasileiro.

## Escopo da fase
- **Schema + migrations (Supabase, `supabase/migrations/`):** todas com `user_id uuid not null references auth.users(id) on delete cascade`, **RLS habilitada** (`user_id = auth.uid()` em `using` e `with check`), índices em `user_id` e nas colunas de filtro, trigger `updated_at`.
  - **`projects`** (projetos/listas de tarefas): `name`, `description`, `color`, `icon`, `is_archived`, `position` (ordenação). Índice por `user_id`.
  - **`tasks`** (tarefas/demandas): `project_id` (fk → `projects`, nullable = "sem projeto/inbox"), `title`, `notes`, `priority` (enum `baixa | media | alta | urgente`), `status` (enum `pendente | em_andamento | concluida | atrasada | cancelada`), `start_date`, `due_date`, `completed_at`, `tags` (text[]), `recurrence` (regra de recorrência — ver Instruções técnicas), `reminder_at`, `calendar_event_id` (fk → `calendar_events`, nullable, vínculo com a agenda), `position` (ordem no kanban/lista). Índices em `(user_id, status)`, `(user_id, due_date)`, `(user_id, project_id)`.
  - **`task_checklist_items`** (itens de checklist de uma tarefa): `task_id` (fk → `tasks` on delete cascade), `label`, `is_done`, `position`. Índice por `(user_id, task_id)`.
  - **`routines`** (rotinas recorrentes): `name`, `type` (enum `manha | noite | trabalho | estudos | exercicios | outro`), `description`, `color`, `icon`, `frequency` (enum `diaria | semanal | dias_especificos`), `weekdays` (int[] 0–6, quando `dias_especificos`/`semanal`), `time_of_day` (horário ideal, nullable), `is_active`, `position`. Índice por `(user_id, is_active)`.
  - **`routine_items`** (passos/itens de uma rotina — ex.: "beber água", "alongar", "revisar agenda"): `routine_id` (fk → `routines` on delete cascade), `label`, `position`. Índice por `(user_id, routine_id)`.
  - **`routine_logs`** (execução diária da rotina): `routine_id` (fk → `routines`), `log_date` (date), `is_done`, `completed_items` (int[] de `routine_items` marcados, opcional), `notes`. **Único** por `(user_id, routine_id, log_date)`; índice em `(user_id, log_date)`.
- **CRUD de projetos:** criar/editar/arquivar/excluir; cor e ícone; reordenar (drag, via `position`); contador de tarefas abertas por projeto.
- **CRUD de tarefas:** criar/editar/concluir/reabrir/excluir; definir prioridade, status, datas (início/vencimento), tags, checklist (adicionar/marcar/remover/reordenar itens), anexos (Supabase Storage — ver Cuidados), recorrência e lembrete; mover entre projetos; vincular a um evento da agenda (`calendar_event_id`).
- **Visões de tarefas:**
  - **Lista:** TanStack Table com filtros (projeto, prioridade, status, tags, intervalo de datas) e ordenação.
  - **Kanban:** colunas por `status` (pendente → em andamento → concluída), arrastar entre colunas atualiza `status` e `position`.
  - **Calendário:** tarefas posicionadas pela `due_date` (visão mês/semana), reaproveitando o calendário da Fase 08.
  - **Hoje:** tarefas com `due_date` = hoje (ou sem data e em andamento) + rotinas do dia.
  - **Semana:** tarefas da semana corrente agrupadas por dia.
  - **Atrasadas:** `due_date < hoje` e `status` não concluída/cancelada.
  - **Concluídas:** `status = concluida`, com `completed_at`, ordenadas por data.
- **Rotinas:** CRUD de rotinas e seus itens; tela "Rotinas de hoje" (rotinas ativas cuja frequência cai no dia atual) com **check-in diário** (marcar rotina e/ou itens como feitos → grava/atualiza `routine_logs`); acompanhamento de **frequência** (ex.: "feita 5 de 7 dias na semana"); histórico por rotina; rotinas pré-sugeridas no seed (Manhã, Noite, Trabalho, Estudos, Exercícios) que o usuário pode editar.
- **Relacionamentos:** vínculo tarefa ↔ evento da agenda (Fase 08); preparar ganchos leves para que Hábitos (Fase 10) e Estudos (Fase 11) possam referenciar tarefas (ex.: "tarefa relacionada a um curso") — sem implementar esses módulos aqui.
- **UI:** listas com filtros, kanban arrastável, forms (RHF + Zod), badges de prioridade/status (cores premium preto/branco/dourado), empty states, skeletons, toasts, confirmação ao excluir. Reusar componentes das Fases 01–02 (`PageHeader`, `EmptyState`, `StatCard`, tabela, tabs, dialog/sheet).

## Fora do escopo
- Módulo de **Hábitos** (Fase 10) e **Estudos** (Fase 11) — apenas deixar os ganchos de relacionamento previstos no schema, sem telas.
- **Dashboard Geral** (Fase 12), **busca global / lançamento rápido / notificações** (Fase 13) — tarefas e rotinas serão agregadas/disparadas lá, não aqui.
- Geração automática de notificações/lembretes push (apenas persistir `reminder_at`/`recurrence`; o disparo agendado é da Fase 13 com Vercel Cron).
- Compartilhamento/colaboração com outras pessoas (sistema é single-user).

## Instruções técnicas
- **Recorrência:** definir um formato simples e versionável para `recurrence` (ex.: objeto JSON `{ freq: 'diaria'|'semanal'|'mensal', interval: number, weekdays?: number[], until?: date }` em coluna `jsonb`, ou string no padrão RRULE). Documentar a escolha. Centralizar a lógica de "próxima ocorrência" e de materialização da próxima tarefa em `src/lib/tasks/recurrence.ts` com **testes unitários** (incluindo virada de mês/semana e dias específicos), seguindo o mesmo rigor das regras financeiras.
- **Status "atrasada":** preferir **derivar** em tempo de leitura (`due_date < hoje` e não concluída) em vez de gravar; se materializar, atualizar via job — manter consistente e documentado.
- Criar helpers de query (TanStack Query) por entidade em `src/hooks` (ex.: `useTasks`, `useProjects`, `useRoutines`, `useRoutineLogs`) com query keys por entidade e invalidação seletiva após mutação.
- Mutations preferencialmente via **Server Actions** (Next 16) com validação Zod no servidor; nunca confiar em `user_id` vindo do client — derivar de `auth.uid()`. Usar `updateTag`/revalidação para read-your-writes após mover tarefa no kanban.
- Anexos em **Supabase Storage** (bucket privado por usuário, caminho `tasks/{user_id}/...`), com policies de Storage por `user_id`; guardar apenas o path/metadados em `tasks`/tabela de anexos.
- Kanban: usar uma lib de drag-and-drop acessível (ex.: `@dnd-kit`) e persistir `status` + `position` em uma única mutação.
- `next-themes`/dark+light e responsividade reais em todas as visões (kanban vira lista/colunas roláveis no mobile).
- Seguir estrutura de pastas e padrões de `PROJECT_ARCHITECTURE.md`; rotas em pt-BR (`/tarefas`), código em inglês.

## Cuidados
- **RLS obrigatória** em **todas** as novas tabelas (`projects`, `tasks`, `task_checklist_items`, `routines`, `routine_items`, `routine_logs`) — nenhuma sem policy `user_id = auth.uid()`.
- Migrations **idempotentes** e versionadas; cuidado com `on delete cascade` (excluir projeto não deve apagar tarefas silenciosamente sem confirmação na UI — preferir mover para "sem projeto" ou confirmar).
- Não quebrar as Fases 01–08 (layout, tema, rotas, auth, financeiro, agenda). O vínculo com `calendar_events` deve ser **opcional** e não acoplar a agenda à tarefa.
- `routine_logs` deve respeitar a unicidade `(user_id, routine_id, log_date)` para o check-in diário não duplicar.
- Recorrência e fuso/horário: usar datas locais pt-BR de forma consistente (evitar bug de "vira o dia" por UTC).
- Manter estados de UI obrigatórios (loading/empty/erro/sucesso) e confirmação antes de excluir tarefa/projeto/rotina.

## Critérios de aceite
- [ ] CRUD de projetos, tarefas (com checklist e anexos) e rotinas funcionando com RLS.
- [ ] Tarefas com prioridade, status, datas, tags, recorrência e lembrete; vínculo opcional com evento da agenda.
- [ ] Visões lista, kanban (arrastável), calendário, hoje, semana, atrasadas e concluídas funcionando.
- [ ] Rotinas (manhã/noite/trabalho/estudos/exercícios) com check-in diário e frequência acompanhada; `routine_logs` único por dia.
- [ ] Recorrência centralizada em `lib/tasks/recurrence.ts` com testes (incluindo casos de borda) passando.
- [ ] Estados de UI (loading/empty/erro/sucesso), dark/light e responsividade em todas as visões; confirmação ao excluir.
- [ ] `npm run build` passa.

## Ao finalizar
O agente deve atualizar:
- `docs/project/CURRENT_STATUS.md`
- `docs/handoff/LAST_PHASE_SUMMARY.md`
- `docs/handoff/NEXT_AGENT_INSTRUCTIONS.md` (apontando para `docs/phases/PHASE_10_HABITS.md`)
