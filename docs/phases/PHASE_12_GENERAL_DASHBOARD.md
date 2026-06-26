# Fase 12 — Dashboard Geral

## Contexto
Com todos os módulos de domínio entregues (financeiro, cartões, faturas, parcelamentos, terceiros, importação, dashboard financeiro, agenda, tarefas/rotinas, hábitos e estudos), chega o momento de **unificar tudo em uma única tela**. O Dashboard Geral é a porta de entrada do sistema (`/dashboard`): uma visão de comando que agrega indicadores de **todos** os módulos em um lugar só. Esta fase **não cria tabelas de domínio** — ela **lê** os dados já existentes e os apresenta de forma bonita, rápida e configurável. A única persistência nova é a **preferência de layout** do usuário (ordem e visibilidade dos cards), guardada em `settings`.

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
Entregar um **dashboard geral premium e personalizável** que mostra, em dados reais, o estado de toda a vida do usuário — finanças, agenda, tarefas, hábitos, estudos e notificações — com **cards reordenáveis e ocultáveis** (preferência persistida), **filtro por período** e **visões dia/semana/mês**.

## Escopo da fase
- **Persistência de preferências (`settings`, Supabase, `supabase/migrations/`):** criar/garantir a tabela `settings` com `user_id uuid not null references auth.users(id) on delete cascade`, **RLS** (`user_id = auth.uid()` em `using` e `with check`), índice em `user_id`, `created_at`/`updated_at` com trigger de `updated_at`. Guardar a config do dashboard em uma coluna `dashboard_layout jsonb` (ou linha chave/valor `key='dashboard_layout'`) com: ordem dos cards, cards ocultos, período padrão e visão padrão (dia/semana/mês). **Sem novas tabelas de domínio** — apenas esta store de preferências (reutilizável pela Fase 14).
- **Agregações por módulo (somente leitura):** funções/queries de agregação que reaproveitam os hooks e selects já criados nas Fases 02–11. Nada de duplicar regra de negócio — consumir o que já existe (ex.: regra de fatura da Fase 03, totais pessoal x terceiros da Fase 05).
- **Cards do dashboard (todos respeitando o filtro de período):**
  - **Financeiro:** saldo consolidado das contas, entradas/saídas do período, gasto no cartão x à vista, **valor pessoal real x valor de terceiros**, próximas contas a pagar e próximos recebimentos.
  - **Cartões/Faturas:** faturas abertas/fechadas, próximos vencimentos, **a receber de terceiros** (resumo).
  - **Agenda:** próximos compromissos (com cor por tipo) e contagem do dia/semana.
  - **Tarefas/Rotinas:** tarefas de hoje, atrasadas, em andamento; rotinas do dia.
  - **Hábitos:** hábitos do dia com check-in rápido, **streak** e meta de água.
  - **Estudos:** cursos em andamento, horas estudadas no período, estudos atrasados.
  - **Notificações:** resumo das não lidas (placeholder de dados até a Fase 13; o card já existe e lê de `notifications` quando a tabela chegar).
- **Personalização (persistida em `settings`):**
  - **Reordenar** cards por drag-and-drop (`@dnd-kit` ou solução leve equivalente; nada de dependência pesada desnecessária).
  - **Ocultar/exibir** cards via menu "Personalizar".
  - Botão **"Restaurar padrão"**.
  - A preferência é **salva no servidor** (Server Action + `settings`) e reidratada no carregamento — sem flash de layout.
- **Filtros e visões:** seletor de **período** (hoje, semana, mês, mês anterior, intervalo custom com `date-fns`/`ptBR`) e alternância de **visão dia/semana/mês**. O período escolhido propaga para todos os cards.
- **UI/UX:** grid responsivo de cards premium (preto/branco/dourado), **skeletons** por card durante o carregamento, **empty states** quando um módulo ainda não tem dados, **toasts** ao salvar preferência. Reutilizar `StatCard`, `PageHeader`, `EmptyState` e os componentes de gráfico (recharts) já existentes.

## Fora do escopo
- Criar qualquer tabela de domínio nova (todas já existem das Fases 02–11).
- Implementar a **busca global**, o **lançamento rápido** e a **geração de notificações** (Fase 13).
- Relatórios consolidados aprofundados e exportação (Fase 14).
- Novas regras financeiras: o dashboard **apenas lê e agrega** o que os módulos já calculam.

## Instruções técnicas
- **Composição:** página `(app)/dashboard/page.tsx` como Server Component que carrega a preferência de layout (`settings`) e dispara as leituras agregadas; cards interativos (drag, check-in, personalizar) como Client Components (`'use client'`).
- **Preferências:** ler/gravar `settings` via **Server Actions** (Next 16) com validação **Zod** do shape do layout no servidor; após salvar, usar `updateTag`/revalidação para read-your-writes. Nunca confiar em `user_id` do client — derivar de `auth.uid()`.
- **Performance:** buscar as agregações em paralelo (`Promise.all`); evitar N+1; preferir agregação no Postgres (counts/sums) a trazer linhas cruas para o client. Cada card tem seu próprio `Suspense`/skeleton para não travar a tela inteira.
- **Datas/moeda:** sempre `lib/format.ts` (BRL via `Intl.NumberFormat('pt-BR')`, datas via `date-fns/ptBR`). Cálculo de janelas de período centralizado (ex.: `startOfWeek`/`endOfMonth` com locale pt-BR).
- **Estado de UI:** o período/visão atuais podem usar **Zustand** (somente UI) e o **default** vem de `settings`. TanStack Query para as leituras client-side, com query keys por card + período.
- Reaproveitar **hooks e queries** das fases anteriores; **não** reescrever lógica de domínio.

## Cuidados
- **Não quebrar** os módulos existentes nem o dashboard financeiro (Fase 07): o dashboard geral **agrega**, não substitui.
- **RLS obrigatória** na tabela `settings`; nenhuma preferência sem policy. O `jsonb` de layout deve ser **validado** (Zod) para não persistir lixo.
- Distinção financeira sagrada: **valor total movimentado x valor realmente meu** (terceiros não distorcem) deve aparecer corretamente nos cards.
- Migration de `settings` **idempotente** e versionada; se a tabela já existir de uma fase anterior, apenas **adicionar** o que falta (sem destrutivo).
- Manter **dark e light** e **responsividade** real (mobile reordena/oculta também) em todos os cards.
- O card de notificações deve degradar com elegância enquanto a tabela `notifications` não existe (não pode quebrar o build nem a tela).

## Critérios de aceite
- [ ] `/dashboard` mostra cards de **todos os módulos** com **dados reais** (notificações pode ser placeholder até a Fase 13).
- [ ] Cards podem ser **reordenados** (drag-and-drop) e **ocultados/exibidos**; há **"Restaurar padrão"**.
- [ ] A personalização é **persistida** em `settings` (com RLS) e **reidrata** ao recarregar, sem flash.
- [ ] **Filtro por período** (hoje/semana/mês/anterior/custom) e **visões dia/semana/mês** propagam para todos os cards.
- [ ] Valores em **BRL** e datas em **formato brasileiro**; financeiro diferencia **total movimentado x valor meu**.
- [ ] Cada card tem **skeleton**, **empty state** e **toast** ao salvar preferência; layout **responsivo** e **dark/light** ok.
- [ ] `npm run build` passa.

## Ao finalizar
O agente deve atualizar:
- `docs/project/CURRENT_STATUS.md` (Fase 12 concluída; próxima = Fase 13).
- `docs/handoff/LAST_PHASE_SUMMARY.md` (resumo, arquivos criados/alterados, migration de `settings`, agregações por módulo, personalização persistida, testes, pendências).
- `docs/handoff/NEXT_AGENT_INSTRUCTIONS.md` (apontando para `docs/phases/PHASE_13_SEARCH_QUICKADD_NOTIFICATIONS.md`).
