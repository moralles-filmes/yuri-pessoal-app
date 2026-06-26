# PROJECT_ROADMAP — Plano de construção em fases

> Sequência lógica priorizando **base → financeiro (cartões/faturas/parcelas/terceiros/dashboard) → produtividade → unificação → polimento**. Cada fase tem um arquivo detalhado em `docs/phases/`. Não pule fases; não adiante fases futuras.

| # | Fase | Arquivo | Status |
| --- | --- | --- | --- |
| 01 | Foundation, Arquitetura & Design System | `PHASE_01_FOUNDATION.md` | ✅ Concluída |
| 02 | Financeiro Base | `PHASE_02_FINANCIAL_CORE.md` | ⬜ Próxima |
| 03 | Cartões de Crédito & Faturas | `PHASE_03_CREDIT_CARDS_INVOICES.md` | ⬜ |
| 04 | Parcelamentos | `PHASE_04_INSTALLMENTS.md` | ⬜ |
| 05 | Gastos de Terceiros & Divisão | `PHASE_05_SHARED_EXPENSES.md` | ⬜ |
| 06 | Importação (Excel/CSV/OFX) | `PHASE_06_IMPORTS.md` | ⬜ |
| 07 | Dashboard Financeiro | `PHASE_07_FINANCIAL_DASHBOARD.md` | ⬜ |
| 08 | Agenda & Google Agenda | `PHASE_08_CALENDAR.md` | ⬜ |
| 09 | Demandas, Tarefas & Rotinas | `PHASE_09_TASKS_ROUTINES.md` | ⬜ |
| 10 | Hábitos | `PHASE_10_HABITS.md` | ⬜ |
| 11 | Estudos | `PHASE_11_STUDIES.md` | ⬜ |
| 12 | Dashboard Geral | `PHASE_12_GENERAL_DASHBOARD.md` | ⬜ |
| 13 | Busca Global, Lançamento Rápido & Notificações | `PHASE_13_SEARCH_QUICKADD_NOTIFICATIONS.md` | ⬜ |
| 14 | Segurança, Responsividade & Polimento Final | `PHASE_14_POLISH_SECURITY.md` | ⬜ |

---

## Fase 01 — Foundation, Arquitetura & Design System
**Objetivo:** base do projeto pronta para evoluir — scaffold, design system premium e app shell.
**Escopo:** Next.js + Supabase + Tailwind + shadcn; tokens preto/branco/dourado; tema dark/light; sidebar recolhível + header (busca/lançamento rápido/sino/tema/usuário); rotas placeholder de todos os módulos; componentes base; base de autenticação (login/cadastro + `proxy.ts`).
**Não faz parte:** schema de negócio, CRUD financeiro, lógica de fatura.
**Dependências:** nenhuma (greenfield).
**Entregáveis:** app rodando; dark/light; layout responsivo; rotas abrindo; telas de auth; clients Supabase + proxy prontos.
**Critérios de aceite:** `npm run build` passa; toggle de tema persiste; sidebar/header funcionam; todas as rotas abrem; login funciona quando credenciais Supabase estiverem no `.env.local`.
**Arquivo:** `docs/phases/PHASE_01_FOUNDATION.md`

## Fase 02 — Financeiro Base
**Objetivo:** núcleo financeiro manual (sem cartão ainda).
**Escopo:** schema + RLS para `accounts`, `categories`, `subcategories`, `transactions`, `bills`, `recurring_transactions`; CRUD de contas, categorias; lançamentos (despesa/receita/transferência/ajuste) à vista; contas fixas; recorrências; formatação BRL/data; utilitários de formatação; setup de testes (Vitest).
**Não faz parte:** cartões, faturas, parcelas, terceiros, importação, dashboard.
**Dependências:** Fase 01; credenciais Supabase.
**Entregáveis:** lançar/editar/excluir transações à vista; gerenciar contas e categorias; listar com filtros; saldos por conta.
**Critérios de aceite:** CRUD funcionando com RLS; valores em BRL; recorrências geram lançamentos; testes de formatação passam.
**Arquivo:** `docs/phases/PHASE_02_FINANCIAL_CORE.md`

## Fase 03 — Cartões de Crédito & Faturas
**Objetivo:** **parte mais importante** — cartões e cálculo automático da fatura.
**Escopo:** `credit_cards`, `card_statements`; cadastro de cartão (limite, fechamento, vencimento, bandeira, cor); **`lib/finance/invoice.ts`** com a regra de fechamento/vencimento (+ testes de borda: dias 28–31, virada de mês/ano); lançamento no cartão cai na fatura correta; faturas aberta/fechada/paga; visão por mês/cartão; marcar fatura como paga; ajuste manual da fatura vinculada.
**Não faz parte:** parcelamento (Fase 04), terceiros (Fase 05), importação (Fase 06).
**Dependências:** Fase 02.
**Entregáveis:** cadastrar cartão; lançar compra → fatura correta; ver fatura de qualquer mês; estados de fatura.
**Critérios de aceite:** regra de fatura validada por testes; virada de ano correta; UI de faturas por cartão/mês.
**Arquivo:** `docs/phases/PHASE_03_CREDIT_CARDS_INVOICES.md`

## Fase 04 — Parcelamentos
**Objetivo:** compras parceladas distribuídas nas faturas corretas.
**Escopo:** `transaction_installments`; opção "compra parcelada?" (qtd, valor total → valor por parcela, ajuste de centavos na última); criação automática das parcelas vinculadas à compra original; cada parcela na fatura correta; aba de parcelamentos (ativos/finalizados/cancelados); editar/cancelar com segurança.
**Não faz parte:** terceiros, importação, dashboard.
**Dependências:** Fase 03 (regra de fatura).
**Entregáveis:** parcelar compra; ver "1/6, 2/6..."; provisão de parcelas futuras; cancelar parcelas futuras.
**Critérios de aceite:** soma das parcelas = total (com ajuste de centavos); cada parcela na fatura certa; cancelamento não corrompe histórico.
**Arquivo:** `docs/phases/PHASE_04_INSTALLMENTS.md`

## Fase 05 — Gastos de Terceiros & Divisão
**Objetivo:** separar o que é meu do que é de terceiros; controlar a receber.
**Escopo:** `people`, `shared_expenses`, `receivables`; marcar despesa pessoal/terceiro/compartilhada; divisão por valor ou %; status de cobrança; aba "A Receber de Terceiros"; integração na fatura (valor meu x de terceiros, quem paga e quanto).
**Não faz parte:** importação, dashboard.
**Dependências:** Fases 03–04.
**Entregáveis:** dividir despesa; ver a receber por pessoa/fatura; marcar recebido; totais a receber/recebido.
**Critérios de aceite:** valores de terceiros não distorcem gasto pessoal; rastreabilidade compra→fatura→pessoa.
**Arquivo:** `docs/phases/PHASE_05_SHARED_EXPENSES.md`

## Fase 06 — Importação (Excel/CSV/OFX)
**Objetivo:** importar faturas/extratos no **mesmo modelo** dos lançamentos manuais.
**Escopo:** `import_batches`, `import_rows`; upload Excel/CSV/OFX; mapeamento de colunas; pré-visualização; sugestão de categoria; **detecção de duplicados**; revisão e edição antes/depois de importar.
**Não faz parte:** dashboard.
**Dependências:** Fases 02–05.
**Entregáveis:** importar arquivo; revisar; importar sem duplicar; editar importados como manuais.
**Critérios de aceite:** importado = mesmas opções do manual; duplicados detectados; conciliação possível.
**Arquivo:** `docs/phases/PHASE_06_IMPORTS.md`

## Fase 07 — Dashboard Financeiro
**Objetivo:** visão financeira rica e útil.
**Escopo:** cards (saldo, entradas/saídas, cartão x à vista, próximas contas/recebimentos, faturas abertas/fechadas, **valor pessoal x terceiros**, a receber); gráficos (categoria, forma de pagamento, mês x mês, evolução, projeção); **próximas 6 faturas**; alertas (gasto alto, limite, vencimento).
**Não faz parte:** módulos não-financeiros.
**Dependências:** Fases 02–06.
**Entregáveis:** dashboard financeiro completo com gráficos úteis.
**Critérios de aceite:** diferencia total movimentado x valor meu; próximas 6 faturas corretas; gráficos refletem os dados.
**Arquivo:** `docs/phases/PHASE_07_FINANCIAL_DASHBOARD.md`

## Fase 08 — Agenda & Google Agenda
**Objetivo:** agenda integrada ao Google Agenda.
**Escopo:** `calendar_events`; OAuth Google; listar/criar/editar/excluir/sincronizar; visões dia/semana/mês; lembretes; vínculo com tarefas; próximos compromissos no dashboard.
**Não faz parte:** tarefas/rotinas (Fase 09).
**Dependências:** Fase 01 (auth) + chaves Google.
**Entregáveis:** conectar Google; CRUD + sync; calendário bonito com cores por tipo.
**Critérios de aceite:** sync bidirecional básico; visões funcionando; segurança dos tokens.
**Arquivo:** `docs/phases/PHASE_08_CALENDAR.md`

## Fase 09 — Demandas, Tarefas & Rotinas
**Objetivo:** produtividade — tarefas, projetos e rotinas.
**Escopo:** `tasks`, `projects`, `routines`; prioridade/status/datas/tags/checklist/anexos/recorrência/lembretes; visões lista/kanban/calendário/hoje/semana/atrasadas/concluídas; rotinas (manhã/noite/trabalho/estudos/exercícios) com execução diária.
**Dependências:** Fases 01, 08 (relação com agenda).
**Entregáveis:** CRUD de tarefas/projetos; kanban; rotinas com frequência.
**Critérios de aceite:** múltiplas visões; recorrência; vínculo com agenda.
**Arquivo:** `docs/phases/PHASE_09_TASKS_ROUTINES.md`

## Fase 10 — Hábitos
**Objetivo:** hábitos com streaks e consistência.
**Escopo:** `habits`, `habit_logs`; cadastro (frequência/meta/unidade/horário/cor/ícone); hábitos do dia; check-in rápido; água (copos/litros); leitura (páginas/tempo); exercícios; streaks; histórico; gráficos de consistência; alertas.
**Dependências:** Fase 01.
**Entregáveis:** criar hábito; check-in; streak; gráficos.
**Critérios de aceite:** streaks corretos; água/leitura/exercício funcionando; histórico.
**Arquivo:** `docs/phases/PHASE_10_HABITS.md`

## Fase 11 — Estudos
**Objetivo:** controle de cursos online, marketing, idiomas, desenvolvimento pessoal.
**Escopo:** `study_courses`, `study_modules`, `study_lessons`, `study_sessions`; cursos/módulos/aulas; sessões de estudo; idiomas (vocabulário, listening/speaking/reading/writing); progresso; horas estudadas; dashboard de estudos.
**Dependências:** Fases 01, 09 (tarefas relacionadas).
**Entregáveis:** CRUD de cursos; registrar sessão; progresso por curso; dashboard de estudos.
**Critérios de aceite:** progresso/horas corretos; sequência de dias estudando; idiomas.
**Arquivo:** `docs/phases/PHASE_11_STUDIES.md`

## Fase 12 — Dashboard Geral
**Objetivo:** visão unificada de todos os módulos.
**Escopo:** agregar financeiro, agenda, tarefas, hábitos, estudos, notificações; cards personalizáveis (reordenar/ocultar); filtros por período; visões dia/semana/mês.
**Dependências:** Fases 02–11.
**Entregáveis:** dashboard geral configurável.
**Critérios de aceite:** dados reais de todos os módulos; personalização persistida.
**Arquivo:** `docs/phases/PHASE_12_GENERAL_DASHBOARD.md`

## Fase 13 — Busca Global, Lançamento Rápido & Notificações
**Objetivo:** produtividade transversal.
**Escopo:** busca global (todos os módulos, agrupada por tipo, abre item); modal de lançamento rápido (despesa/receita/cartão/à vista/transferência/tarefa/evento/hábito/sessão); `notifications` + sino + geração de alertas (fatura/conta/tarefa/hábito/evento/terceiros/limite); Vercel Cron para checagens agendadas.
**Dependências:** Fases 02–12.
**Entregáveis:** busca rápida; lançamento em segundos; central de notificações.
**Critérios de aceite:** busca cobre os módulos; quick-add cria nos modelos certos; notificações com link e status.
**Arquivo:** `docs/phases/PHASE_13_SEARCH_QUICKADD_NOTIFICATIONS.md`

## Fase 14 — Segurança, Responsividade & Polimento Final
**Objetivo:** deixar pronto para uso real.
**Escopo:** relatórios/análises consolidados; configurações finais; revisão de segurança (RLS, validação, sanitização, exposição de dados); responsividade fina; performance; empty states e skeletons revisados; ajustes visuais; testes gerais; exportação/backup.
**Dependências:** todas anteriores.
**Entregáveis:** sistema polido, seguro, responsivo e performático.
**Critérios de aceite:** checklist de aceite do briefing satisfeito; sem rota desprotegida; UX consistente.
**Arquivo:** `docs/phases/PHASE_14_POLISH_SECURITY.md`
