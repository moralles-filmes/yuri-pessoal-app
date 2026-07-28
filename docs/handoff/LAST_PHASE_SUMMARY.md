# LAST_PHASE_SUMMARY — Resumo da última fase concluída

## Iteração — Fecha as 3 pendências do TO-DO (2026-07-28) ✅

Feita logo após a Fase 15, a pedido do usuário ("vamos resolver isso tudo"). Fecha os três
itens que a fase havia deixado em aberto. **Testes: 529 → 582** (+53 puros novos).

### 1. Entrada em linguagem natural — implementada
`src/lib/todo/parse.ts` (puro, `hoje` injetado, **37 testes**) + chips de confirmação no
`QuickTaskInput`. Reconhece data (`hoje`, `amanhã`, `sexta`, `dia 15`, `15/09`,
`10 de setembro`, `em 3 dias`), hora (`às 10h`, `14h30`, `14:05`, `meio-dia`), prazo
(`até…`, `vence…`, `prazo…`), prioridade (`p1`–`p4`), `#projeto`, `@etiqueta` e recorrência
(`toda segunda`, `todo dia 10`, `a cada 2 semanas`, `de 3 em 3 dias`, `dias úteis`,
`último dia útil do mês`, `após concluir`).

Contrato da tela: **o texto digitado nunca é reescrito**; tudo que foi entendido aparece em
chip **antes** de salvar; há o botão "Usar o texto como está" para desligar; padrão ambíguo
(`31/02`) é ignorado e fica no título. Efeito colateral necessário: `todoQuickTaskSchema`
ganhou `deadline_at` (+ o mesmo `superRefine` da edição completa) — sem isso o chip
"Prazo final" prometeria algo que não seria salvo.

### 2. Sincronização com Google Agenda — implementada (opt-in)
**A premissa anterior estava errada:** o projeto sempre teve escopo de escrita
(`calendar.events`), e a Fase 08 já criava/atualizava/excluía eventos. Nada de novo foi
pedido ao Google — reaproveitamos tokens e cliente HTTP existentes.

- `src/lib/todo/google-event.ts` — mapeamento **puro** tarefa → evento (**16 testes**).
- `src/lib/todo/calendar-sync.ts` — I/O, `server-only`, best-effort.
- Migration `20260728120000_todo_google_sync.sql` — `google_integrations.todo_sync_enabled`
  (default `false`) + `comment on table/column` corrigindo a documentação do schema.
- Interruptor + "Enviar tarefas agora" no card do Google em `/agenda`.

Decisões que valem como contrato: **opt-in**; **sentido único** (tarefa → evento, sem
reimportar); **recorrente não vira RRULE** (só a ocorrência atual, movida a cada conclusão —
publicar RRULE dessincronizaria assim que o usuário concluísse fora da data); excluir tarefa
chama `removeTaskFromGoogle` **antes** do delete (a ponte é `on delete cascade`); concluir
tarefa não recorrente não mexe no evento; cancelar/arquivar removem, restaurar recria.

### 3. Actions sem gatilho — todas expostas
- **Arraste na navegação** (`SortableList`, o mesmo de hábitos/rotinas) para **projetos,
  etiquetas e filtros salvos**, com UI otimista e reversão no erro.
- **Seções:** menu da coluna no Kanban → "Mover para a esquerda/direita" (acessível por
  teclado, ao contrário de arrastar coluna).
- **`mergeTodoLabels`:** bloco "Mesclar com outra etiqueta" no `LabelDialog`, dizendo quantas
  tarefas migram e que nenhuma é apagada.
- **`updateTodoSavedFilter` / `deleteTodoSavedFilter`:** `SaveFilterDialog` ganhou modo de
  edição e exclusão. A definição guardada é **preservada por padrão**; substituir pelos
  filtros da tela exige marcar um switch.
- **Bônus:** editar/excluir **etiqueta** era impossível pela interface (as actions existiam,
  mas nada as chamava) — agora há um lápis em cada linha da navegação. E nasceu
  `reorderTodoSavedFilters`, que não existia.

`NavButton` foi reestruturado: a alça de arraste e o botão de editar são **irmãos** do botão
de navegação, nunca aninhados (botão dentro de botão é HTML inválido e quebra teclado e
leitor de tela). O lápis é **sempre visível** — telas de toque não têm hover.

### Verificação
`npm run test:run` **582 passando (43 arquivos)** · `npx tsc --noEmit` limpo ·
`npm run lint` 0 erros/0 avisos · `npm run build` compila · `get_advisors(security)` só o
aviso externo pré-existente de Auth.

---

## Fase 15 — Módulo TO-DO completo (2026-07-28) ✅

> Fase **fora do roadmap original** (as 14 fases originais já estavam fechadas), aberta a
> pedido do usuário. Arquivo da fase: `docs/phases/PHASE_15_TODO_COMPLETE.md`.

### Resumo
Entregue o **TO-DO** (`/todo`): gerenciador de tarefas completo com projetos, seções,
subtarefas, etiquetas, prioridades P1–P4, **data programada separada do prazo final**,
horário e duração, recorrência avançada, lembretes, comentários, anexos, histórico de
atividades, filtros combináveis e salvos, ações em massa, e visões **lista / Kanban /
calendário**. Inspirado na *experiência* de ferramentas como o Todoist — **sem copiar nome,
logo, textos, ícones, código, assets ou identidade visual**. Usa integralmente o design
system existente (preto/branco/dourado, dark+light, Arial, shadcn/ui).

### Decisão técnica mais importante
**13 tabelas `todo_*` novas, em vez de evoluir `tasks`/`projects` (Fase 09).** `tasks` está
acoplado a cinco pontos já entregues — `calendar_events.task_id`, `notifications/generate.ts`,
`search/queries.ts`, `dashboard/queries.ts` e o kanban-por-status. Remodelá-la exigiria mexer
nos cinco ao mesmo tempo (risco alto numa base com 414 testes verdes). **Consequência
assumida:** dois módulos de tarefas coexistem — `/todo` é o principal de execução; `/tarefas`
+ `/rotinas` seguem por causa das rotinas e do vínculo com a agenda.

### Arquivos criados
**Migrations (`supabase/migrations/`, idempotentes):** `20260728100000_todo_projects.sql`,
`…100100_todo_sections`, `…100200_todo_labels`, `…100300_todo_tasks`,
`…100400_todo_task_labels`, `…100500_todo_recurrences`, `…100600_todo_completions`,
`…100700_todo_comments`, `…100800_todo_reminders`, `…100900_todo_saved_filters`,
`…101000_todo_activity`, `…101100_todo_preferences`, `…101200_todo_calendar_sync`.

**Lógica pura + testes:** `src/lib/todo/constants.ts`, `types.ts`,
`recurrence.ts` + `recurrence.test.ts` (53), `status.ts` + `status.test.ts` (26),
`filters.ts` + `filters.test.ts` (36), `queries.ts`, `activity.ts`.

**Validação/mutação:** `src/lib/validators/todo.ts`; `src/lib/actions/todo.ts` (tarefas),
`todo-projects.ts` (projetos/seções/etiquetas), `todo-extras.ts` (comentários/anexos/
lembretes/filtros/preferências).

**UI:** `src/app/(app)/todo/{page,loading,todo-client}.tsx`; `src/components/todo/`
(`badges`, `task-row`, `task-board`, `task-calendar`, `task-detail-sheet`,
`quick-task-input`, `recurrence-editor`, `todo-nav`, `todo-dialogs`);
`src/components/dashboard/general/todo-card.tsx`.

### Arquivos alterados
`src/config/nav.ts` (item TO-DO) · `src/types/supabase.ts` (regenerado) ·
`src/lib/search/{types,queries}.ts` + `src/components/search/search-meta.tsx` (busca cobre
tarefas/projetos/etiquetas do TO-DO, com `?task=` abrindo o painel) ·
`src/lib/actions/quick-add.ts` + `src/components/quick-add/quick-add.tsx` (tipo "Nova
tarefa"; o antigo virou "Tarefa (lista antiga)") · `src/lib/notifications/{constants,generate,
cron}.ts` + `src/components/notifications/notification-meta.tsx` (4 tipos novos + fecho dos
lembretes) · `src/lib/dashboard/cards.ts` + `src/components/dashboard/general/card-meta.ts` +
`src/app/(app)/dashboard/page.tsx` (card TO-DO) · `src/app/api/export/route.ts` (13 tabelas) ·
docs (`PROJECT_BRIEFING`, `PROJECT_ARCHITECTURE`, `PROJECT_ROADMAP`, `CURRENT_STATUS`,
`NEXT_AGENT_INSTRUCTIONS`, `CLAUDE.md`).

### Migrations e RLS
13 migrations aplicadas em `yjvnlbjvippefvzgrxxw`. **Todas as 13 tabelas** com `user_id` NOT
NULL → `auth.users(id) ON DELETE CASCADE`, **RLS + FORCE RLS**, policy
`for all using (user_id = auth.uid()) with check (user_id = auth.uid())`, índice em `user_id`,
índices de consulta e trigger `set_updated_at`. Conferido no banco: **13/13** com
`relrowsecurity` e `relforcerowsecurity` verdadeiros e 1 policy cada. **`get_advisors`
(security): 0 lints de schema** (resta só o aviso externo pré-existente de "leaked password
protection"). Total do projeto: **47 tabelas**.

Índices únicos que sustentam regra de negócio:
`todo_completions (user_id, task_id, scheduled_for)` (não-duplicação de ocorrência) ·
`todo_recurrences (task_id)` (1:1) · `todo_labels (user_id, lower(name))` ·
`todo_preferences (user_id, scope)` · `todo_calendar_sync (task_id, provider)` e
`(user_id, provider, external_event_id)`.

### Invariantes implementadas
1. **`atrasada` nunca é gravado** — derivado na leitura (`effectiveStatus`).
2. **Conclusão idempotente** por `(user_id, task_id, scheduled_for)`.
3. **Tarefa recorrente avança a própria linha** (preserva projeto/seção/prioridade/etiquetas/
   lembretes sem copiar nada); histórico em `todo_completions`. **Reabrir remove a última
   conclusão e volta a data** — não cria ocorrência extra.
4. **Nenhuma exclusão silenciosa**: projeto/seção exigem escolher o destino das tarefas
   (com confirmação digitando "EXCLUIR" no caso destrutivo); etiqueta remove só a associação;
   série recorrente pergunta o escopo; concluir tarefa-mãe com subtarefas pendentes pergunta.
5. **Datas puras 'yyyy-MM-dd' + `time` separado**; toda a aritmética de recorrência em
   `Date.UTC` interno; nenhuma função pura chama `Date.now()`.

### Testes realizados
`npm run test:run` → **529 testes passando** em 41 arquivos (eram **414**). Os 115 novos são
**puros, com datas injetadas, sem tocar no banco**.

Cobrem: recorrência diária/semanal/mensal/anual; intervalo de N unidades; dias específicos da
semana com ciclo de N semanas; dia do mês com clamp; **último dia do mês**; **primeiro/último
dia útil**; **n-ésimo dia da semana do mês**; "somente dias úteis"; `ends_on`;
`max_occurrences`; pausa; **ano bissexto** (2024/2026/1900/2000); **virada de ano**; 29/02 em
ano não bissexto; **modo fixo vs. após conclusão** (inclusive concluindo atrasado);
materialização preservando a folga entre data programada e prazo; status derivado; prazo
próximo; progresso de subtarefas; horário final com virada de meia-noite; filtros combinados;
ordenação com nulos por último; agrupamento; árvore de subtarefas com proteção contra ciclo.

**Qualidade:** `npx tsc --noEmit` ✅ · `npm run lint` ✅ (0 erros, 0 avisos) · `npm run build` ✅
(rota `/todo` registrada).

**Smoke test no banco real** (dados criados e removidos por completo ao final):

| Verificação | Resultado |
| --- | --- |
| 2ª conclusão da mesma ocorrência rejeitada pelo unique | ✅ bloqueada |
| Conclusões após tentar duplicar | 1 |
| Excluir etiqueta **não** apaga a tarefa | ✅ |
| Associação tarefa↔etiqueta removida | ✅ |
| Excluir projeto apaga as seções (cascade) | ✅ |
| Excluir projeto **não** apaga a tarefa (vai p/ Caixa de entrada) | ✅ |
| Excluir tarefa apaga recorrência e conclusões (cascade) | ✅ |
| Limpeza dos dados de teste | ✅ 0 restantes |

### Problemas encontrados e resolvidos
1. **Embed 1:1 do PostgREST** (`recurrence:todo_recurrences(*)`) colapsava para `never` na
   tipagem. Resolvido com um tipo explícito `RawRecurrenceRow` no ponto de leitura, sem
   espalhar `any`.
2. **`Record<string, unknown>` não é atribuível a `Json`** nas colunas jsonb do histórico.
   Criado `ActivityPayload` (`{ [k: string]: Json | undefined }`), o que também deixa
   explícito que só valor serializável entra na auditoria.
3. **Sincronizar prop→estado sem `useEffect`** (o lint de React 19 do projeto proíbe): usado o
   padrão já adotado no repo — ajuste no render guardado por um "id visto" — no painel de
   detalhes, nos diálogos e no `?task=`.

### Pendências conhecidas (estado no fechamento da Fase 15)

> ⚠️ As pendências **1, 2 e 6** foram **resolvidas na iteração de 2026-07-28**, descrita no
> topo deste arquivo. O texto abaixo fica como registro do que a fase entregou e do que
> ficou para depois — não use como lista de trabalho.

1. ~~**Entrada em linguagem natural**~~ → **implementada** (`src/lib/todo/parse.ts`).
2. ~~**Sincronização com Google Agenda**~~ → **implementada e opt-in**. A justificativa
   registrada aqui (falta de escopo OAuth de escrita) **estava errada**: a Fase 08 sempre
   pediu `calendar.events`, que é leitura e escrita.
3. **Canais de lembrete `email`/`push`** existem no CHECK mas **não são oferecidos na UI** —
   só o canal interno (sino) tem infraestrutura real. **Continua em aberto.**
4. **Dois módulos de tarefas coexistem.** Aposentar `/tarefas` exige antes migrar
   `calendar_events.task_id`, `generate.ts`, `search/queries.ts` e `dashboard/queries.ts`.
   **Continua em aberto (proposital).**
5. **Reordenação de tarefas** persiste com um `update` por item (`Promise.all`), igual a
   `reorderHabits`/`reorderRoutines`. Suficiente para single-user.
6. ~~**Actions sem gatilho na interface**~~ → **todas expostas**; ver o topo do arquivo.

### Recomendação
Usar o módulo alguns dias no fluxo real antes de expandir.

---

# Histórico anterior (fases e iterações anteriores)


## Iteração mais recente (manutenção) — 2026-06-27: Recorrência em cartão de crédito
Recorrências (Financeiro → Recorrências) só sabiam lidar com **conta**: o dropdown já listava
"Cartão de crédito" (enum compartilhado), mas **não havia seletor de cartão**, ainda pedia conta, e
salvar quebraria — `recurring_transactions` não tinha `card_id` nem aceitava `cartao_credito` no CHECK.
Agora, ao escolher cartão o form **troca "Conta" por "Cartão"**, força **tipo = despesa**, e cada
ocorrência gerada vira despesa no cartão **resolvida para a fatura da data** (reaproveita
`resolveOrCreateStatement`/`resolverFatura`), **sem abater conta** (`account_id` null). Migration
`20260627000000_recurring_card_support` (idempotente: `card_id` FK on delete set null + CHECK + índice;
`supabase.ts` ajustado). Decisões: cartão = sempre despesa, `card_id` obrigatório (Zod `superRefine`);
cartão excluído deixa recorrência **órfã** (`card_id` null) → a geração **pula** sem travar as demais.
Lógica pura nova `buildGeneratedRow`/`isCardRecurrence` em `generation.ts` (5 testes). Arquivos: migration,
`validators/recurring.ts`, `actions/recurring.ts`, `finance/generation.ts`, `finance/queries.ts`
(join `card`), `recorrencias/{page,recurring-client,recurring-form}.tsx`. Suíte **407** (lint/tsc/build ok).

## Iteração anterior (manutenção) — 2026-06-27: Embed ambíguo no `getTransactions` esvaziava as listas
Regressão de **runtime** da feature de pagamento: a migration `20260627140000` adicionou
`card_statements.pago_transacao_id → transactions.id` (um **2º FK** entre as tabelas) e o `TX_SELECT`
passou a embutir `statement:card_statements(id,pago_em)` **sem dizer qual FK**. Com 2 caminhos, o
PostgREST 14.5 devolve **`PGRST201` (HTTP 300)** e `getTransactions` cai em `data ?? []` → **lista
vazia**. Em `/faturas`, o detalhe mostrava só as **parcelas** (query separada) e sumiam **à vista +
estornos**; também quebrava **Lançamentos** e o **Dashboard**. Passou em build/tsc/lint/testes (erro só
em runtime). **Fix (1 linha em `src/lib/finance/queries.ts`):** desambiguar igual ao `accounts` →
`statement:card_statements!transactions_statement_id_fkey(id,pago_em)`. Verificado no REST real (antes
HTTP 300/PGRST201 → depois HTTP 200). Sem migration, suíte **401**. **Lição:** novo FK que cria um 2º
caminho entre tabelas usadas em embeds → revisar todos os `*_SELECT` do `queries.ts` e pôr `!nome_fk`.

## Iteração anterior (manutenção) — 2026-06-27: Pagar fatura debita uma conta (+ resolve o "seletor de conta")
O botão **Pagar** da fatura abre um diálogo que **sempre pede a conta** e cria **um lançamento tipo
`transferencia`** (debita a conta, status `pago`, `amount` = total da fatura, sem `statement_id`/`card_id`).
Por ser transferência fica **fora** de despesas/relatórios (o `dashboard` exclui) e **fora** do
`total_atual` da fatura (a view só soma despesa/receita) → **zero duplicação**; e **abate o saldo** da
conta. **Desfazer** deleta o lançamento (estorna o saldo) e limpa os campos. A fatura ganhou
`pago_conta_id`/`pago_transacao_id` (migration `20260627140000`, idempotente; `supabase.ts` regenerado).
Em **Lançamentos**, item de cartão mostra **pago/em aberto DERIVADO** da `pago_em` da fatura
(`getTransactions` embute `statement(id,pago_em)`). **Resolve a pendência** anterior (`markStatementPaid(id)`
sem `contaId`) → assinatura agora `(id, contaId)`, `build`/`tsc` verdes. Lógica pura `montarPagamentoFatura`
(4 testes). Bloqueios: fatura já paga e total ≤ 0. Suíte **401** (lint/tsc/build ok). Detalhes em
`docs/project/CURRENT_STATUS.md` → *Iterações (modo manutenção)*.

## Iteração anterior (manutenção) — 2026-06-27: Importar fatura parcelada + divisão "por valor" dividia o recebível do terceiro por `qtd`
Numa fatura de terceiro, dividir uma linha **parcelada** **por VALOR** deixava o recebível **dividido
pelo nº de parcelas** (ex.: SUZY R$147,50/parcela aparecia como **R$73,75**). Causa-raiz (confirmada no
banco): o diálogo de divisão da revisão prevê a parte contra **uma parcela** (o valor da linha), mas
`createInstallmentPurchase`/`applySplitParcelado` dividem a parte pelo **total da compra** (parcela ×
`qtd`) e a espalham nas parcelas → a parte por valor saía dividida por `qtd` (percentual não sofre).
Correção: função pura **`escalarPartesParcelado`** (`src/lib/import/parcelamento.ts`) multiplica as
partes **por valor** por `qtd` em centavos antes do motor; `commitImport` aplica só no ramo do
parcelamento. Sem migration. Suíte **401** (lint ok, `tsc` só com erro **pré-existente** abaixo).
**Dados:** corrigidas via SQL as 2 compras afetadas (Suzy/**Bruna Biju 2** e Nicole/**Cea Bau**),
recebíveis e `valor_pessoal` recompostos — total da SUZY em jun/2026 voltou aos **R$773,53** exatos.
**⚠ Pendência separada (pré-existente):** `build`/`tsc` quebram em `faturas/statements-client.tsx:260`
(`markStatementPaid(id)` sem o 2º arg `contaId` — "marcar fatura como paga" meio-ligado no `b8696b5`);
precisa de seletor de conta. Detalhes em `docs/project/CURRENT_STATUS.md` → *Iterações*.

## Iteração anterior (manutenção) — 2026-06-27: Estorno de cartão não infla "Entradas"
O estorno (receita vinculada à fatura, sem conta) era somado em `resumoMes.entradas` **e** já reduzia
o `total_atual` da fatura → contado em dobro, inflando as Entradas no Painel/Relatórios (que reusam
`resumoMes`). O **saldo das contas nunca foi afetado** (`account_balance` só soma transações com
`account_id`). Correção: receita com `card_id` não entra em `entradas`. UI: `EstornoBadge` ("Estorno de
cartão") substitui "Receita + Recebido" na lista de lançamentos. Suíte **391** (lint/tsc/build ok), sem
migration. Detalhes em `docs/project/CURRENT_STATUS.md` → *Iterações (modo manutenção)*.

## Iteração anterior (manutenção) — 2026-06-27: Importação de fatura — parcelas em meses passados + total errado
Numa fatura de cartão, a linha "k/N" e a última parcela "N/N" trazem a **data da compra original**
(meses atrás), não a data desta fatura. O `commitImport` ancorava a fatura de destino nessa data
antiga, então a parcela `k` caía na fatura da compra original e espalhava `k…N` por **meses passados**
— criando faturas "Atrasada" fantasma **e** drenando o total da fatura atual (mesma causa dos dois
sintomas). Correção: **toda linha do arquivo pertence à fatura sendo importada**. Detecta-se a
**competência** da fatura pelas compras à vista (pura `detectarCompetenciaFatura`), **confirmável na
revisão** ("Fatura de destino") e gravada em `import_batches.competencia_fatura` (migration). O
`commitImport` ancora todas as linhas de cartão nela: parcela `k` na fatura importada e `k+1…` nos
meses seguintes (`planejarParcelamento`/`distribuirFaturas` + `competenciaBase`), última parcela/à
vista via `statement_competencia` + `getOrCreateStatementForCompetencia`. Suíte **390** (lint/tsc/build
ok), `supabase.ts` regenerado. **Dados:** o lote `fatura-azul-julho` foi desfeito e **reimportado** —
junho fechou nos R$ 4.262,45 exatos. **Faturas vazias** (0 lançamentos, criadas pelo get-or-create)
deixaram de listar: `getStatements` agora filtra `itens > 0`; as vazias do cartão foram apagadas.
Detalhes em `docs/project/CURRENT_STATUS.md` → *Iterações (modo manutenção)*.

## Iteração anterior (manutenção) — 2026-06-27: Importar fatura "como parcelado" (valor da parcela + só as restantes)
Numa fatura de cartão, a linha "k/N" traz o valor de **uma parcela**, não o total da compra. O
"Importar parcelado?" dividia o valor da linha por `N` e gerava `N` parcelas do zero — "5/12 R$105"
virava 12× R$8,75. Agora, nova lógica pura **`planejarImportParcelado`** (`src/lib/import/parcelamento.ts`):
cada parcela = valor da linha e gera **só as restantes** (`N − k + 1`), preservando a numeração
original → "5/12 R$105" vira **8× R$105 numeradas 5/12…12/12**. `planejarParcelamento` ganhou
`numeroInicial` (offset; default 1 mantém o fluxo manual), o schema ganhou `numero_inicial`/
`parcelas_total_label` opcionais e `commitImport` calcula o plano pela função pura. UI: o botão some
na **última parcela** (k = N). **Sem migration.** Suíte **382** (lint/tsc/build ok). Detalhes em
`docs/project/CURRENT_STATUS.md` → *Iterações (modo manutenção)*.

## Iteração anterior (manutenção) — 2026-06-27: Divisão com terceiros na edição e na importação
A divisão de gastos (Fase 05) deixou de ser exclusiva da criação. **Na edição:** `updateTransaction`
re-aplica a divisão de uma despesa simples (reusa `applySplit`), só quando ela muda de fato, e
**bloqueia** se houver recebível `cobrado`/`pago`; o form pré-preenche as partes via
`getTransactionSplit`/`sharedExpensesToFormParts`. **Na importação:** migration
`20260627120000_import_rows_split` (+`classificacao`/`split_parts` em `import_rows`), botão "Dividir"
por linha (`ImportRowSplitDialog`), `setImportRowSplit` grava e `commitImport` repassa para
`createTransaction`/`createInstallmentPurchase`. **Correção:** `splitSchema` passou a aceitar valor BR
com vírgula (`normalizeBRMoney`). Suíte **362** (lint/tsc/build ok); `src/types/supabase.ts`
regenerado. Detalhes em `docs/project/CURRENT_STATUS.md` → *Iterações (modo manutenção)*.

## Iteração anterior (manutenção) — 2026-06-27: Importação — cabeçalho fora da 1ª linha
Faturas/extratos reais (ex.: export do Itaú/cartão Azul) trazem **título/resumo antes da tabela**,
então o cabeçalho real não está na 1ª linha. Os parsers (`parseCsv`/`parseXlsx`) assumiam "1ª linha
= cabeçalho", pegavam o título (`Nome;Yuri…`) e **toda** linha caía em *"Mapeie as colunas de data e
valor."*. Correção: nova função pura **`detectHeaderRow()`** em `src/lib/import/mapping.ts` (acha a 1ª
linha cujo `autoDetectMapping` resolve **data E valor**; fallback linha 0 → sem regressão). `csv.ts` e
`xlsx.ts` passam a fatiar a partir dela. Bônus: **`parseParcela`** entende `"Parcela X de N"` (Itaú),
além de `"k/N"`. Testes novos (`csv.test.ts`, `detectHeaderRow`, parcela "de") → suíte **356**
(lint/tsc/build ok). Detalhes em `docs/project/CURRENT_STATUS.md` → *Iterações (modo manutenção)*.

## Iteração anterior (manutenção) — 2026-06-26: Conta/Segurança em Configurações
Adicionado `SecurityCard` em `/configuracoes` (após o `ProfileCard`) com **trocar e-mail** e
**trocar senha**, refletindo direto no **Supabase Auth** (`auth.users`) — **sem migration**.
Senha: reautentica com a atual (`signInWithPassword`) e aplica `updateUser({ password })`.
E-mail: `updateUser({ email })` com confirmação dupla (padrão Supabase), reusando o `/auth/callback`.
Convenção de auth do repo (client do navegador, `react-hook-form`+`zod`). Schemas/teste em
`src/lib/validators/auth.ts(.test.ts)`. **Passo manual**: liberar `…/auth/callback` na *Redirect URLs*
allow-list do projeto `yjvnlbjvippefvzgrxxw` (Authentication → URL Configuration). Detalhes em
`docs/project/CURRENT_STATUS.md` → *Iterações (modo manutenção)*.

## Fase concluída: **Fase 14 — Segurança, Responsividade & Polimento Final** (2026-06-26) — **ÚLTIMA FASE / PROJETO CONCLUÍDO** 🎉

### Resumo da implementação
A fase de **fechamento** do sistema (sem novos domínios): entregou os **relatórios consolidados**
(`/relatorios`), finalizou as **configurações** (`/configuracoes`), consolidou a **store de
preferências** (`settings` estendida), criou a infraestrutura de **anexos genéricos**
(`attachments` + bucket), entregou **exportação/backup** (`/api/export`), e fez a **auditoria de
segurança** (RLS em todas as tabelas, Zod no servidor, nenhum `service_role` no client). Tudo por
**reuso** das Fases 02–13 — nenhuma regra de negócio nova. Com isso, **as 14 fases do roadmap estão
concluídas** e o projeto entra em **modo manutenção** (não há Fase 15).

### Decisões de modelagem (importante)
- **`settings` estendida, não recriada:** migration **idempotente** que só **adiciona** colunas à
  store da Fase 12 (`display_name`, `avatar_url`, `theme`, `currency`, `date_format`,
  `notification_prefs jsonb`). RLS + FORCE RLS já existiam. Optou-se por **estender `settings`** em
  vez de criar `profiles` (uma linha por usuário, `unique(user_id)`).
- **`attachments` genérica** (1 tabela nova): `entity_type`/`entity_id` **sem FK** (referência a
  qualquer módulo), `storage_path`/`file_name`/`mime_type`/`size_bytes`, **RLS + FORCE RLS**,
  índices `user_id` e `(user_id, entity_type, entity_id)`, único `(bucket_id, storage_path)`,
  trigger `updated_at`. Bucket privado `attachments` com policy por pasta `{user_id}/…` — mesmo
  padrão de `task_attachments` (Fase 09).
- **Reuso total nos relatórios:** `reports/queries.ts` apenas **lê e agrega** via `finance/dashboard.ts`
  (Fase 07), `getHabitsDashboard` (Fase 10), `getStudyDashboard` (Fase 11) e o agregador **puro**
  `reports/tasks.ts` (sobre `tasks/status.ts` da Fase 09).

### Decisões técnicas (importante)
- **Upsert parcial de preferências:** `patchSettings` faz `upsert({ user_id, ...patch })` — o
  PostgREST só atualiza as colunas presentes, então salvar perfil **não** apaga prefs de
  notificação (e vice-versa). `user_id` sempre de `auth.uid()`.
- **Tema:** continua via `next-themes` (sem flash) como fonte de verdade; a coluna `settings.theme`
  é sincronizada **best-effort** pelo `AppearanceCard` (não bloqueia a UI) — store consolidada.
- **Exportação/backup respeita RLS:** `/api/export` roda cada `select` sob a sessão do usuário
  (nunca varre outro usuário) e **omite deliberadamente `google_integrations`** (tokens OAuth nunca
  saem). Rota privada (proxy) + `auth.getUser()` na própria rota (defesa em profundidade).
- **CSV/JSON no client, sem round-trip:** os relatórios exportam a partir dos dados já carregados
  (`reports/csv.ts` puro + `reports/download.ts` com BOM p/ Excel). Separador `;` (Excel pt-BR).
- **`formatDateWith`** aplica a preferência de formato de data onde é lida; o padrão global do app
  segue `formatDate` (dd/MM/yyyy, BR) para não arriscar quebra em telas das fases anteriores.
- **Gráficos reaproveitados** (Fase 07) + `ReportBarChart` genérico novo — **zero dependência nova**.

### Arquivos criados (principais)
- **Migrations:** `supabase/migrations/20260626200000_settings_profile.sql`,
  `20260626200100_attachments.sql`, `20260626200200_attachments_storage.sql`.
- **Preferências (store):** `src/lib/settings/constants.ts`, `src/lib/settings/queries.ts`
  (`getUserSettings`/`getDisplayName`).
- **Relatórios:** `src/lib/reports/queries.ts`, `src/lib/reports/tasks.ts` + `tasks.test.ts`
  (**4 testes**), `src/lib/reports/csv.ts` + `csv.test.ts` (**4 testes**), `src/lib/reports/download.ts`,
  `src/components/reports/report-bar-chart.tsx`; `src/app/(app)/relatorios/` (`page.tsx`,
  `relatorios-client.tsx`, `loading.tsx`).
- **Configurações:** `src/components/settings/profile-card.tsx`, `regional-card.tsx`,
  `notifications-card.tsx`, `dashboard-prefs-card.tsx`.
- **Backup:** `src/app/api/export/route.ts`.

### Arquivos alterados
- `src/types/supabase.ts` — regenerado (inclui `attachments` + colunas novas de `settings`).
- `src/lib/validators/settings.ts` — `profileSchema`/`preferencesSchema`/`themeSchema`/`notificationPrefsSchema`.
- `src/lib/actions/settings.ts` — `saveProfile`/`savePreferences`/`saveThemePreference`/`saveNotificationPrefs` (+ `patchSettings`).
- `src/lib/format.ts` — `formatDateWith` (+ helper `toLocalDate`).
- `src/components/settings/appearance-card.tsx` — claro/escuro/**sistema** + persiste tema best-effort.
- `src/app/(app)/configuracoes/page.tsx` — página completa (perfil/aparência/regional/notificações/Google/dashboard/backup/atalhos).
- `src/config/nav.ts` — item **Relatórios** (`/relatorios`).
- `src/app/(app)/layout.tsx` + `src/components/layout/{app-shell,header,user-menu}.tsx` — propagam o **nome de exibição** ao menu do usuário.

### Migrations aplicadas
- 3 migrations aplicadas no projeto `yjvnlbjvippefvzgrxxw` via Supabase MCP. **0 lints de schema**
  no `get_advisors`. Tipos regenerados. RLS confirmada em **todas as 34 tabelas** (`list_tables`).

### Funcionalidades entregues
- **Relatórios** (5 abas: financeiro, cartões, hábitos, estudos, tarefas) com gráficos úteis,
  filtro de período e **exportação** (CSV por aba + JSON do relatório).
- **Configurações finais** completas (perfil, tema/sistema, BRL, formato de data, notificações,
  Google, exportação/backup, preferências do dashboard, atalhos categorias/cartões).
- **`attachments`** + bucket privado (infra de anexos genéricos, RLS).
- **Backup** (`/api/export`) com **todos** os dados do usuário (sem tokens), respeitando RLS.
- **Auditoria de segurança** concluída: RLS em todas as tabelas, Zod no servidor, sem `service_role` no client.

### Testes
- `npm run test:run` ✅ **342 testes** (334 anteriores + **8 da Fase 14**): `reports/tasks` (4) e `reports/csv` (4).
- `npm run lint` ✅ (0/0); `tsc --noEmit` ✅; `npm run build` ✅. Smoke: `/login` 200;
  `/relatorios`, `/configuracoes`, `/api/export` → 307 `/login`; `/api/cron/notifications` → 401.

### Checklist de aceite do briefing (revisado item a item)
- ✅ Cadastrar cartões com fechamento/vencimento · lançar compra → fatura correta · parcelada →
  parcelas distribuídas · **provisão das próximas 6 faturas** (Fases 03–04, com testes).
- ✅ Importar Excel/CSV/OFX; importados têm as **mesmas opções** dos manuais (Fase 06).
- ✅ Separar pessoal × terceiros; ver quem precisa pagar/quanto/de qual fatura (Fase 05).
- ✅ Ver fatura de qualquer mês; contas/receitas/despesas à vista (Fases 03/02).
- ✅ Dashboard financeiro completo (Fase 07) · Google Agenda (Fase 08) · tarefas/rotinas/hábitos
  (água/leitura/exercícios)/estudos (Fases 09–11) · busca global + lançamento rápido + notificações
  (Fase 13) · **relatórios** (Fase 14).
- ✅ Dark/light; sistema premium preto/branco/dourado, responsivo. Segurança: **RLS em todas as
  tabelas**, validação no servidor, sem dados sensíveis no client, **backup/exportação** disponível.

### Problemas/pendências
- **Verificação visual logada pendente** (dark/light + mobile) de ponta a ponta — já há usuário em
  `auth.users`. Dá para exercitar perfil, tema, relatórios, exportação e backup.
- **Anexos na UI:** infra (`attachments` + bucket) pronta; ligar o upload em telas além de tarefas é
  melhoria de manutenção (precedente em tarefas, Fase 09).
- **Cron/notificações** ainda exige `SUPABASE_SERVICE_ROLE_KEY` + `CRON_SECRET` no ambiente; Google
  Agenda exige `GOOGLE_CLIENT_ID/SECRET` (degrada com elegância sem eles).

### Recomendação para o próximo agente
**O projeto está concluído (modo manutenção) — não inicie uma "Fase 15".** Para melhorias/correções
futuras, siga `docs/handoff/NEXT_AGENT_INSTRUCTIONS.md`: leia briefing/regras, trate como tarefa
pontual e preserve os invariantes (RLS `using`+`with check`, Zod no servidor, sem `service_role` no
client, pt-BR/BRL, dark/light + responsividade, testes verdes). Rode sempre
`npm run lint && npx tsc --noEmit && npm run test:run && npm run build` antes de fechar.
