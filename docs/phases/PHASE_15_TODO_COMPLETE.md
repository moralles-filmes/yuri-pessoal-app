# Fase 15 — Módulo TO-DO completo

> **Fase pós-roadmap.** As 14 fases originais estão concluídas. Esta é a primeira fase
> *nova* aberta no modo manutenção/iteração, a pedido do usuário. Ela **não substitui**
> nem apaga nada das fases anteriores.

## Contexto

O sistema já tem um módulo de **Tarefas & Rotinas** (Fase 09, rota `/tarefas`): tarefas
simples com projeto/lista, prioridade, status, datas, tags, checklist, anexos, recorrência
básica e lembrete; mais rotinas com check-in diário. Ele resolve bem o dia a dia, mas **não
suporta organização de trabalho complexa**: não tem seções dentro do projeto, subtarefas,
comentários, etiquetas reutilizáveis, filtros salvos, prazo separado da data programada,
duração, histórico de atividades, múltiplos lembretes nem recorrência avançada (dia útil,
último dia do mês, "após conclusão", limite de ocorrências, edição de série).

Esta fase entrega o **TO-DO**: um gerenciador de tarefas completo, na identidade visual e
nos padrões técnicos do sistema, inspirado na *experiência* (organização, velocidade,
facilidade) de ferramentas como o Todoist — **sem copiar nome, logo, textos, ícones, código,
assets ou identidade visual de terceiros**.

## Objetivo

Permitir organizar, num único módulo rápido e bonito: tarefas pessoais, demandas
profissionais, projetos, rotinas, compromissos, estudos, pendências financeiras, tarefas
recorrentes, subtarefas, comentários, anexos, lembretes, prioridades, etiquetas e filtros
personalizados — com criação em poucos segundos e persistência real no banco.

## Decisão arquitetural central — por que tabelas `todo_*` novas

**Decisão: criar um conjunto novo de tabelas `todo_*` e NÃO evoluir `tasks`/`projects`.**

Motivos (avaliados antes de decidir, conforme o pedido de "avalie antes de duplicar"):

1. `tasks` está **acoplado a cinco módulos já entregues**: `calendar_events.task_id` (FK
   recíproca da Fase 08), `generate.ts` (notificações `task_overdue`/`task_today`),
   `search/queries.ts` (busca global), `dashboard/queries.ts` (card "Tarefas & Rotinas") e
   o kanban por `status` da Fase 09. Remodelar `tasks` para suportar seções, subtarefas,
   `scheduled_date` + `deadline_at`, recorrência avançada e séries exigiria mexer em todos
   eles ao mesmo tempo — risco alto de regressão numa base com 414 testes verdes.
2. O modelo do TO-DO é **conceitualmente diferente**: status de execução
   (`pendente/em_andamento/concluida/cancelada/arquivada`) em vez de status derivado por
   data; ordem manual por seção; hierarquia pai/filho; série recorrente com histórico de
   conclusões. Forçar isso em `tasks` deixaria as duas semânticas misturadas.
3. As tabelas `todo_*` são um **superset**: nada que a Fase 09 faz deixa de ser possível.

**Consequência assumida e documentada:** o sistema passa a ter **dois módulos de tarefas
coexistindo**. A separação de responsabilidades fica assim:

| Módulo | Rota | Responsabilidade |
| --- | --- | --- |
| **TO-DO** (Fase 15) | `/todo` | Execução e pendências: o gerenciador principal de tarefas |
| Tarefas & Rotinas (Fase 09) | `/tarefas`, `/rotinas` | Legado funcional + rotinas com check-in diário |
| Agenda (Fase 08) | `/agenda` | Compromissos e blocos de tempo |
| Hábitos (Fase 10) | `/habitos` | Consistência/streak |
| Estudos (Fase 11) | `/estudos` | Conteúdo e progresso |
| Financeiro (Fases 02–07) | `/financeiro` | Transações e vencimentos |

O módulo Fase 09 **não é removido nesta fase** (removê-lo quebraria dashboard, busca,
notificações e o vínculo com a agenda). A migração/aposentadoria dele é uma decisão futura
registrada em "Cuidados para o próximo agente".

**Reaproveitamento explícito (não duplicar):**

- Anexos → tabela genérica **`attachments`** + bucket privado **`attachments`** (Fase 14),
  usando `entity_type = 'todo_task' | 'todo_comment'`. **Não** criar tabela/bucket novos.
- Notificações → tabela **`notifications`** + `dedupe_key` + Vercel Cron já existentes.
- Drag-and-drop → **`SortableList`** (`src/components/shared/sortable-list.tsx`, @dnd-kit).
- UI → `PageHeader`, `EmptyState`, `StatCard`, `src/components/ui/*` (shadcn).
- Datas → `hojeISO()` / `dateInSaoPaulo()` / `formatDate` de `src/lib/format.ts`.
- Busca global e lançamento rápido → estender os existentes, não criar novos.

## Escopo

### Dados
13 tabelas novas, todas com `user_id uuid not null references auth.users(id) on delete
cascade`, **RLS + FORCE RLS**, policy `using (user_id = auth.uid()) with check (...)`,
índice em `user_id`, trigger `set_updated_at` e migration idempotente:

`todo_projects`, `todo_sections`, `todo_labels`, `todo_tasks`, `todo_task_labels`,
`todo_recurrences`, `todo_completions`, `todo_comments`, `todo_reminders`,
`todo_saved_filters`, `todo_activity`, `todo_preferences`, `todo_calendar_sync`.

### Funcionalidades
- **Visões:** Caixa de entrada, Hoje, Próximos (lista por dia / semana / calendário mensal),
  Todas as tarefas, Concluídas, Etiquetas, Filtros salvos, Projetos, Projetos arquivados.
- **Tarefa:** título, descrição, projeto, seção, tarefa-pai, data programada, horário,
  duração, prazo final, prioridade P1–P4, etiquetas, recorrência, lembretes, status,
  comentários, anexos, histórico, ordem manual, origem/integração.
- **Projetos:** cor, ícone, favorito, ordem, projeto-pai, visão padrão, arquivar/restaurar,
  exclusão com tratamento seguro das tarefas.
- **Seções:** por projeto, ordem, exclusão com tratamento seguro.
- **Subtarefas:** hierarquia, progresso, promover/rebaixar, conclusão em cascata opcional.
- **Etiquetas:** CRUD, cor, múltiplas por tarefa, exclusão só remove associação.
- **Recorrência:** modos **fixo** (calendário) e **após conclusão**; diária, semanal,
  mensal, anual, dias úteis, dia específico do mês, último dia do mês, primeiro/último dia
  útil, n-ésimo dia da semana do mês; `until`, `max_occurrences`, pausa.
- **Views:** lista (por seção, drag), Kanban (colunas = seções), calendário.
- **Filtros:** combináveis; construtor visual; filtros salvos com `filter_definition` jsonb.
- **Ações em massa** e **menu de contexto** por tarefa.
- **Integrações:** sidebar, lançamento rápido global, busca global, dashboard, notificações.

## Fora do escopo (registrado, não silenciado)

> **Atualização de 2026-07-28 (iteração pós-fase):** os dois primeiros itens **saíram do
> "fora do escopo" e foram implementados**. Ver `docs/handoff/LAST_PHASE_SUMMARY.md` (topo)
> e `docs/handoff/NEXT_AGENT_INSTRUCTIONS.md`. O texto original fica abaixo, riscado, para
> preservar o registro da decisão tomada durante a fase.

- ~~**Entrada inteligente (linguagem natural pt-BR)** — a arquitetura é preparada
  (`src/lib/todo/parse.ts` isolado e puro), mas a UI usa **seletores convencionais
  confiáveis** primeiro, conforme a própria instrução do pedido.~~
  → **Implementada.** `src/lib/todo/parse.ts` é puro (`hoje` injetado) e tem 37 testes; os
  seletores continuam existindo e o usuário pode desligar a interpretação.
- ~~**Sincronização bidirecional com Google Agenda** — … escrever eventos a partir de
  tarefas exige escopo OAuth de escrita e é decisão futura.~~
  → **Implementada como envio opt-in (tarefa → evento).** ⚠️ **A justificativa acima estava
  factualmente errada:** a Fase 08 sempre pediu o escopo
  `https://www.googleapis.com/auth/calendar.events`, que é de leitura **e escrita**, e já
  criava/atualizava/excluía eventos de `calendar_events`. Nenhum escopo novo foi necessário.
  O que **permanece fora do escopo** é o sentido inverso (evento do Google virar tarefa do
  TO-DO), que duplicaria com a importação da própria Fase 08.
- Colaboração multiusuário (o sistema é single-user; o schema de comentários já suporta).
- Aposentar o módulo `/tarefas` da Fase 09.

## Modelagem de dados

Ver as migrations em `supabase/migrations/2026072800*_todo_*.sql` para o SQL exato.
Resumo das decisões de modelagem:

- **Dinheiro/datas:** datas programadas em `date` puro (`scheduled_date`) + `scheduled_time`
  em `time` separado — evita drift de UTC. `deadline_at` é `date`. Timestamps de controle em
  `timestamptz`.
- **Status derivado:** `atrasada` **nunca é gravado**. É derivado na leitura
  (`scheduled_date < hoje` ou `deadline_at < hoje`, e não concluída/cancelada) —
  mesma regra das Fases 03/09.
- **Hierarquia:** `todo_tasks.parent_task_id` self-FK `on delete cascade` (excluir a mãe
  leva as subtarefas — a UI confirma antes). `todo_projects.parent_project_id` self-FK
  `on delete set null` (não perde projeto filho silenciosamente).
- **Recorrência:** tabela separada `todo_recurrences` 1:1 com a tarefa-modelo, com colunas
  tipadas (frequency, interval, weekdays, day_of_month, week_of_month, business_day_rule,
  recurrence_mode, until, max_occurrences, occurrences_created, is_paused) **e** `rule_json`
  para evolução futura sem migration.
- **Série:** `todo_tasks.series_id` agrupa as ocorrências de uma mesma série. Editar "esta e
  as próximas" cria uma série nova a partir da data de corte, preservando o histórico.
- **Conclusões:** `todo_completions` guarda cada conclusão (`scheduled_for`, `completed_at`,
  `completion_source`) com **unique `(user_id, task_id, scheduled_for)`** — é a chave de
  idempotência que impede duplicar ocorrência ao concluir/reabrir/concluir de novo.
- **Anexos:** sem tabela nova — `attachments` com `entity_type IN ('todo_task','todo_comment')`.
- **Preferências:** `todo_preferences` guarda ordenação/agrupamento por escopo
  (`global` ou `project:<id>`), unique `(user_id, scope)`.

## Regras de negócio

1. **`user_id` sempre de `auth.getUser()`**, nunca do client (proteção contra mass assignment).
2. **Status `atrasada` derivado na leitura**, nunca persistido.
3. **Concluir tarefa recorrente:** registra em `todo_completions` (idempotente por
   `scheduled_for`), preserva a configuração de recorrência, calcula a próxima data pelo
   modo (`fixo` = a partir da data programada; `apos_conclusao` = a partir da data de
   conclusão), **avança a mesma linha** da tarefa em vez de criar uma nova (evita explosão
   de linhas e duplicação), incrementa `occurrences_created` e encerra a série quando bate
   `until`/`max_occurrences`.
4. **Reabrir tarefa recorrente:** remove a conclusão daquele `scheduled_for` e **volta** a
   data programada para o `scheduled_for` reaberto — nunca gera ocorrência extra.
5. **Concluir tarefa-mãe com subtarefas pendentes:** a UI pergunta. Opções: concluir tudo em
   cascata, concluir só a mãe (subtarefas seguem pendentes) ou cancelar.
6. **Excluir projeto:** nunca apaga tarefas silenciosamente. Opções: mover para a Caixa de
   entrada, mover para outro projeto, ou excluir projeto **e** tarefas com confirmação
   reforçada.
7. **Excluir seção:** mover tarefas para outra seção, manter no projeto sem seção, ou
   excluir tarefas com confirmação explícita.
8. **Excluir etiqueta:** remove só a associação (`todo_task_labels`), nunca a tarefa.
9. **Editar/excluir série recorrente:** sempre pergunta o escopo (só esta ocorrência /
   esta e as próximas / toda a série). **Nenhuma exclusão silenciosa de série.**
10. **Lembretes e notificações são idempotentes** por `dedupe_key`.
11. **Anexos:** bucket privado, caminho `{user_id}/todo_task/{task_id}/{arquivo}`,
    validação de tipo e tamanho no cliente **e** no servidor.

## Plano de implementação (subfases)

| Subfase | Arquivo | Conteúdo |
| --- | --- | --- |
| **15A** | `PHASE_15_A_TODO_CORE.md` | Schema completo + lógica pura + testes + actions core + lista/inbox/projetos/seções/subtarefas/etiquetas |
| **15B** | `PHASE_15_B_TODO_RECURRENCE.md` | Recorrência avançada, conclusões, edição de série |
| **15C** | `PHASE_15_C_TODO_VIEWS.md` | Hoje, Próximos, Kanban, Calendário, filtros e filtros salvos |
| **15D** | `PHASE_15_D_TODO_INTEGRATIONS.md` | Comentários, anexos, lembretes, histórico, dashboard, busca, quick-add, notificações |
| **15E** | `PHASE_15_E_TODO_POLISH.md` | Acessibilidade, performance, entrada inteligente, Google Agenda |

## Critérios de aceite

Os 40 critérios do pedido original. O estado real de cada um é registrado em
`docs/handoff/LAST_PHASE_SUMMARY.md` ao fim de cada subfase — sem marcar como pronto o que
não estiver funcionando de ponta a ponta com persistência real.

## Testes necessários

- **Puros (Vitest, ambiente node, sem banco):** cálculo de próxima ocorrência para todas as
  frequências; dias úteis; último dia do mês; n-ésimo dia da semana; ano bissexto; virada de
  ano; `until`; `max_occurrences`; modo fixo vs. após conclusão; não-duplicação de ocorrência;
  status derivado (atrasada/hoje/futura); filtros combinados; ordenação e agrupamento;
  progresso de subtarefas; idempotência de conclusão.
- **Não testar via banco** — a regra do projeto é lógica pura com datas injetadas.

## Integrações com outros módulos

- **Sidebar** (`src/config/nav.ts`): item "TO-DO" em Organização, rota `/todo`.
- **Lançamento rápido** (`quick-add.tsx`): tipo "Tarefa (TO-DO)".
- **Busca global** (`src/lib/search/`): tipos `todo_tarefa`, `todo_projeto`, `todo_etiqueta`.
- **Dashboard geral** (`src/lib/dashboard/cards.ts`): card `todo` (reconciliação de layout já
  absorve cards novos sem quebrar layouts salvos — ver `normalizeLayout`).
- **Notificações** (`src/lib/notifications/generate.ts`): tipos `todo_overdue`, `todo_today`,
  `todo_deadline`, `todo_reminder`, com `dedupe_key` determinístico.

## Cuidados para o próximo agente

- **Não** remover o módulo `/tarefas` (Fase 09) sem antes migrar dashboard, busca,
  notificações e o vínculo `calendar_events.task_id`.
- **Não** persistir o status `atrasada`.
- **Nunca** gerar a próxima ocorrência sem checar `todo_completions` — é a proteção contra
  duplicação.
- Ao adicionar FK que crie um 2º caminho entre tabelas já usadas em embed PostgREST,
  desambiguar com `!nome_do_fk` em **todos** os `select` (aprendizado registrado em
  `CURRENT_STATUS.md`, incidente de 2026-06-27).
- Regenerar `src/types/supabase.ts` após qualquer migration.
