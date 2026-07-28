# NEXT_AGENT_INSTRUCTIONS — Instruções para o próximo agente

## ✅ Resolvido — "Marcar fatura como paga" (build voltou a passar)
A pendência que travava o build foi **concluída** (branch `feat/pagamento-fatura-conta`, commits
`818739c`..`c806bc6`): `markStatementPaid(id, contaId)` agora é chamado por um diálogo `PayStatementDialog`
em `statements-client.tsx` (seletor de conta usando a prop `accounts`; botão Pagar oculto quando total ≤ 0).
O pagamento cria um lançamento `transferencia` que debita a conta sem inflar relatórios/fatura; "Desfazer"
estorna o saldo. Itens de cartão em Lançamentos exibem pago/em-aberto derivado da `pago_em` da fatura.
`build`/`tsc`/`lint`/`test:run` (401) verdes. Detalhes em `docs/project/CURRENT_STATUS.md` → *Iterações*.

## 📌 Estado atual — Fase 15 (TO-DO) concluída; sem próxima fase planejada
As 14 fases do roadmap original estão concluídas. Em **2026-07-28** o usuário abriu uma fase
nova fora do roadmap — **Fase 15 — Módulo TO-DO** (`docs/phases/PHASE_15_TODO_COMPLETE.md`) —
que também está **concluída**. **Não há Fase 16 planejada**: o sistema volta ao modo
manutenção/iteração e novas mudanças são melhorias pontuais, salvo pedido explícito do
usuário para abrir outra fase (como foi o caso da 15).

### O que você precisa saber antes de tocar em tarefas
O sistema tem **dois módulos de tarefas coexistindo**, e isso é proposital:

| Módulo | Rota | Papel |
| --- | --- | --- |
| **TO-DO** (Fase 15) | `/todo` | Gerenciador **principal** de execução e pendências |
| Tarefas & Rotinas (Fase 09) | `/tarefas`, `/rotinas` | Legado + **rotinas** com check-in diário |

**Não remova `/tarefas`** sem antes migrar os quatro pontos que dependem da tabela `tasks`:
`calendar_events.task_id` (FK da Fase 08), `src/lib/notifications/generate.ts`,
`src/lib/search/queries.ts` e `src/lib/dashboard/queries.ts`.

### Invariantes do TO-DO que não podem ser quebradas
1. **`atrasada` nunca é gravado** — é derivado na leitura (`src/lib/todo/status.ts`).
2. **Conclusão é idempotente** pelo unique `todo_completions (user_id, task_id,
   scheduled_for)`. Nunca gere a próxima ocorrência sem passar por ali.
3. **Tarefa recorrente avança a própria linha**; o histórico vive em `todo_completions`.
   Reabrir remove a última conclusão e volta a data — não cria ocorrência extra.
4. **Nenhuma exclusão silenciosa**: projeto, seção e série exigem escolha explícita do
   destino das tarefas; excluir etiqueta remove só a associação.
5. Datas puras `'yyyy-MM-dd'` + hora em coluna `time` separada; aritmética de recorrência em
   `Date.UTC` interno; nenhuma função pura chama `Date.now()`.

### ✅ Iteração de 2026-07-28 — as três pendências do TO-DO foram fechadas
Tudo o que estava listado aqui como pendente **já foi implementado**. Não refaça:

| Antes pendente | Estado agora |
| --- | --- |
| `reorderTodoProjects` / `reorderTodoLabels` sem gatilho | Arraste na navegação lateral (`SortableList` em `todo-nav.tsx`). |
| `reorderTodoSections` sem gatilho | Menu da coluna no Kanban → "Mover para a esquerda/direita" (funciona por teclado). |
| `mergeTodoLabels` sem gatilho | Bloco "Mesclar com outra etiqueta" no `LabelDialog`. |
| `updateTodoSavedFilter` / `deleteTodoSavedFilter` sem gatilho | `SaveFilterDialog` ganhou modo de edição + exclusão (lápis em cada filtro da navegação). |
| Editar/excluir **etiqueta** era impossível pela UI | Lápis em cada etiqueta na navegação abre o `LabelDialog`. |
| Entrada em linguagem natural | **Implementada** — `src/lib/todo/parse.ts` (puro, 37 testes) + chips de confirmação no `QuickTaskInput`. |
| Sincronização com Google Agenda | **Implementada** e opt-in — `src/lib/todo/calendar-sync.ts` + `google-event.ts` (16 testes). |

Também nasceu daí a action `reorderTodoSavedFilters` (não existia).

### ❗ Correção de premissa: o Google SEMPRE teve escopo de escrita
A versão anterior deste arquivo (e o cabeçalho de
`supabase/migrations/20260728101200_todo_calendar_sync.sql`) afirmava que faltava escopo
OAuth de escrita. **Isso estava errado.** A Fase 08 pede
`https://www.googleapis.com/auth/calendar.events`, que é leitura **e** escrita, e já
criava/atualizava/excluía eventos a partir de `calendar_events`
(`src/lib/actions/calendar.ts`). A migration `20260728120000_todo_google_sync.sql`
corrige essa documentação via `comment on table/column`.

### Como o sync TO-DO → Google funciona (leia antes de mexer)
- **Opt-in por `google_integrations.todo_sync_enabled`** (default `false`). Desligado,
  `syncTaskToGoogle` sai na primeira consulta e nada é enviado.
- **Sentido único.** Tarefa → evento. Não lemos eventos de volta como tarefa (isso
  duplicaria com a importação da Fase 08).
- **Recorrente não vira RRULE.** Como a série vive numa única linha que avança, publicar
  RRULE dessincronizaria assim que o usuário concluísse adiantado/atrasado. Enviamos só a
  ocorrência atual e movemos o MESMO evento. **Não troque isso sem repensar o modelo.**
- **Excluir tarefa chama `removeTaskFromGoogle` ANTES do delete** —
  `todo_calendar_sync.task_id` é `on delete cascade` e o id do evento sumiria junto.
- **Best-effort:** erro de rede/Google nunca derruba a ação; fica em
  `todo_calendar_sync.last_error` (sem token, sem corpo de resposta).
- Concluir tarefa **não recorrente** não mexe no evento (ela aconteceu). Cancelar e
  arquivar removem o evento; restaurar recria.

### O parser de linguagem natural (`src/lib/todo/parse.ts`)
Puro, com `hoje` injetado. Reconhece data, hora, prazo (`até …`), prioridade (`p1`–`p4`),
`#projeto`, `@etiqueta` e recorrência (`toda segunda`, `a cada 2 semanas`, `todo dia 10`,
`dias úteis`, `após concluir`…). Regras que **não podem** ser quebradas:
- **Nunca reescreve o texto do usuário** — devolve `title` derivado + `tokens` com os
  intervalos; a caixa continua com o texto original.
- **Nada aplicado em silêncio:** todo campo preenchido tem um chip visível antes de salvar,
  e há o botão "Usar o texto como está" para desligar a interpretação.
- **Padrão ambíguo → ignora** (ex.: `31/02` fica no título em vez de virar data).
- A normalização remove acentos **preservando o comprimento** (1 char → 1 char), senão os
  índices das regex desalinham do texto original.

### Melhorias que continuam em aberto
1. **Canais de lembrete `email`/`push`** — existem no CHECK do schema, mas só ligue na UI
   quando houver infraestrutura real de envio.
2. **Sub-modos da visão "Próximos"** (dia/semana) — as constantes `TODO_UPCOMING_MODES`
   existem; hoje a visão é servida pela lista agrupável + calendário mensal.
3. **Aposentar `/tarefas`**, depois de migrar os quatro pontos listados acima.

## Como tratar uma melhoria/correção futura
1. **Leia primeiro** (mesma ordem de sempre): `docs/project/PROJECT_BRIEFING.md` (fonte de verdade),
   `docs/project/PROJECT_RULES.md`, `docs/project/PROJECT_ARCHITECTURE.md`,
   `docs/project/CURRENT_STATUS.md` e `docs/handoff/LAST_PHASE_SUMMARY.md`.
2. **Entenda o impacto antes de mexer** — não quebrar as Fases 01–14. Reaproveite `src/components/ui`,
   `src/components/shared`, `src/components/layout` e os módulos puros em `src/lib`.
3. **Implemente a tarefa pontual** seguindo os padrões existentes (Server Components por padrão;
   mutações via Server Action com **Zod no servidor** e retorno `ActionResult`; `user_id` sempre de
   `auth.uid()`; React Compiler ativo → `useWatch`/`Controller`, nada de `setState` em `useEffect`).
4. **Migrations** (se houver): idempotentes, versionadas em `supabase/migrations/`, aplicadas via
   Supabase MCP, **0 lints de schema** no `get_advisors`, e **regenere `src/types/supabase.ts`**.
5. **Atualize a documentação** que tocar (`CURRENT_STATUS.md` e, se relevante, `LAST_PHASE_SUMMARY.md`)
   — mas **mantendo o estado "projeto concluído / manutenção"**; não reintroduza um roadmap de fases.

## Invariantes que NÃO podem ser violados (bloqueantes)
- **RLS** habilitada e correta (`using` **e** `with check` por `user_id = auth.uid()`) em **TODAS**
  as tabelas (hoje **47**: 34 até a Fase 14 + 13 do TO-DO). Nenhuma tabela de dados do usuário sem
  RLS. Teste RLS **pelo client SDK autenticado** (o SQL editor ignora RLS).
- **Zod no servidor** em **toda** Server Action/rota, além do client. Sanitize entradas.
- **Nenhum `service_role` no client** — ele só existe em `src/lib/supabase/service.ts` (server-only)
  e na rota do Cron (`/api/cron/notifications`). Segredos só no servidor. **Logs sem dados
  financeiros sensíveis.**
- **Exportação/backup** (`/api/export`) respeita RLS e **não** inclui tokens (`google_integrations`).
- **pt-BR / BRL**, datas BR, **dark/light** e **responsividade** reais em tudo que tocar.
- **Regras financeiras críticas** (fatura correta, parcelas distribuídas, terceiros não distorcem o
  valor pessoal, total movimentado × valor realmente meu) — cobertas por testes; **não** reescreva
  sem rodar os testes.

## Verificação obrigatória antes de fechar qualquer mudança
```
npm run lint && npx tsc --noEmit && npm run test:run && npm run build
```
Os **582 testes** devem continuar passando (acrescente testes para qualquer lógica pura nova).
Faça um smoke test das rotas afetadas (rotas privadas → 307 `/login`; `/api/cron/*` → 401 sem segredo).

## Mapa rápido do que existe (para reaproveitar, não reescrever)
- **Financeiro/relatórios:** `src/lib/finance/*` (`invoice.ts`, `installments.ts`, `dashboard.ts`,
  `queries.ts`), `src/lib/reports/*` (`queries.ts`, `tasks.ts`, `csv.ts`, `download.ts`).
- **Preferências:** `src/lib/settings/*` (`constants.ts`, `queries.ts`), `src/lib/validators/settings.ts`,
  `src/lib/actions/settings.ts`. Store `settings` (uma linha/usuário) — **estenda adicionando chaves**,
  nunca recrie.
- **Anexos genéricos:** tabela `attachments` + bucket privado `attachments` (pasta `{user_id}/…`).
  Precedente de upload em tarefas (Fase 09, `task-attachments`).
- **Notificações:** `src/lib/notifications/*` (geração pura `generate.ts`, Cron `cron.ts`), prefs por
  tipo em `settings.notification_prefs`.
- **Telas-chave:** `/dashboard` (geral) + `/dashboard/financeiro`, `/relatorios`, `/configuracoes`,
  `/busca`, `/notificacoes`, módulos financeiros, agenda, tarefas/rotinas/hábitos/estudos.

## Pendências conhecidas (oportunidades de manutenção)
- Ligar **upload de anexos** (`attachments`) em telas além de tarefas (ex.: comprovante de lançamento).
- Propagar a preferência **`date_format`** a mais telas (hoje aplicada via `formatDateWith`; padrão
  global segue `formatDate` BR).
- **Canais externos** de notificação (push/e-mail/web-push) — fora do escopo atual.
- Ambiente de produção: definir `SUPABASE_SERVICE_ROLE_KEY` + `CRON_SECRET` (Cron de notificações) e
  `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` (Google Agenda). Sem eles, os recursos degradam com elegância.
