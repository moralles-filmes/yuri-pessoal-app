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

---

## Fase 15 — Módulo TO-DO completo
> **Fora do roadmap original.** Aberta em 2026-07-28, a pedido do usuário, já em modo
> manutenção. Não substitui nem invalida nenhuma fase anterior.

**Objetivo:** entregar um gerenciador de tarefas completo (rota `/todo`) para organizar
tarefas pessoais, demandas profissionais, projetos, compromissos, estudos, pendências,
recorrências, subtarefas, comentários, anexos, lembretes, prioridades, etiquetas e filtros —
com a identidade visual, a arquitetura e as regras já existentes no sistema.

**Escopo:** 13 tabelas `todo_*` (RLS + FORCE RLS); recorrência avançada com modos fixo e após
conclusão; status `atrasada` derivado; visões Caixa de entrada/Hoje/Próximos/Todas/Concluídas
+ lista/Kanban/calendário; projetos com seções; subtarefas; etiquetas; filtros salvos;
comentários; anexos (reusando `attachments`); lembretes; histórico de atividades; ações em
massa; integrações com sidebar, lançamento rápido, busca global, dashboard e notificações.

**Dependências:** Fases 08 (agenda), 09 (padrões de tarefa), 13 (busca/quick-add/notificações)
e 14 (`attachments` + bucket privado).

**Entregáveis:** módulo TO-DO funcional com persistência real, 115 testes puros novos e
documentação atualizada.

**Critérios de aceite:** criar/editar/concluir/reabrir/excluir tarefa; projetos e seções;
subtarefas; prioridade, etiquetas, data, horário, duração e prazo; recorrência com próxima
ocorrência correta e sem duplicação; comentários, anexos e lembretes; todas as visões;
filtros e filtros salvos; integração com quick-add, dashboard, busca e notificações; RLS
funcionando; dark/light; desktop e celular; fases anteriores intactas; testes passando.

**Arquivo:** `docs/phases/PHASE_15_TODO_COMPLETE.md`

**Decisão registrada:** o TO-DO **não** substituiu as tabelas `tasks`/`projects` da Fase 09.
Os dois módulos coexistem — `/todo` é o gerenciador principal de execução e `/tarefas` segue
por causa das rotinas e do vínculo com a agenda. A justificativa completa está no arquivo da
fase, em "Decisão arquitetural central".

---

## Fase 16 — Módulo Dieta e Alimentação (6 subfases)
> **Fora do roadmap original.** Aberta em 2026-08-03, a pedido do usuário. Não substitui nem
> invalida nenhuma fase anterior. É a maior fase do projeto até hoje e por isso foi quebrada
> em **6 subfases sequenciais (A–F)**, cada uma com arquivo próprio e critérios de aceite.

**Objetivo:** um módulo central em `/nutricao` ("Dieta e Alimentação") para **planejar,
registrar e acompanhar** alimentação: alimentos, receitas, refeições-modelo, diário alimentar,
planejamento diário/semanal, substituições, lista de compras, despensa, medidas corporais,
metas nutricionais e relatórios — com a identidade visual, a arquitetura e as regras já
existentes no sistema.

**Referência funcional (não visual, não de código):** a *organização*, a *facilidade de
registro* e a *profundidade funcional* de bons apps de nutrição. **Nada de código, identidade
visual, textos, logotipos, telas ou assets de terceiros é copiado.**

| Subfase | Tema | Arquivo | Status |
| --- | --- | --- | --- |
| 16-A | Fundação, núcleo de cálculo e catálogo de alimentos | `PHASE_16_A_NUTRITION_FOUNDATION_FOODS.md` | ✅ Concluída |
| 16-B | Metas, diário alimentar e planejamento | `PHASE_16_B_NUTRITION_DIARY_PLANNING.md` | ✅ Concluída |
| 16-C | Receitas, refeições-modelo e substituições | `PHASE_16_C_NUTRITION_MEALS_RECIPES_SUBSTITUTIONS.md` | ✅ Concluída |
| 16-D | Lista de compras e despensa | `PHASE_16_D_NUTRITION_SHOPPING_LIST.md` | ✅ Concluída |
| 16-E | Medidas corporais, evolução e relatórios | `PHASE_16_E_NUTRITION_MEASUREMENTS_REPORTS.md` | ✅ Concluída |
| 16-F | Integrações, notificações e polimento | `PHASE_16_F_NUTRITION_INTEGRATIONS_POLISH.md` | ✅ Concluída |

> ## ✅ **FASE 16 CONCLUÍDA** (2026-08-04)
> As 6 subfases estão entregues e os **40 critérios de aceite gerais foram validados um a um**
> na 16-F (ver `docs/handoff/LAST_PHASE_SUMMARY.md`). **40 de 40 atendidos.**
> A frente Dieta entra em **manutenção/iteração**; não há 16-G.

**Dependências gerais:** Fases 01 (design system/app shell), 12 (dashboard geral), 13 (busca
global, lançamento rápido, notificações + Cron), 14 (`attachments`, buckets privados,
`settings`, exportação) e 15 (padrões de módulo com navegação interna própria).

**Decisões registradas antes de começar:**
1. **Rota `/nutricao`** (padrão pt-BR do projeto), não `/nutrition`. Prefixo de tabela
   `nutrition_*` (código/schema em inglês, como `todo_*`/`study_*`).
2. **Base nutricional real, nunca inventada.** Fonte primária: **TACO 4ª edição
   (NEPA/UNICAMP, 2011)** — 597 alimentos, arquivo XLSX oficial, cuja obra declara
   *"É permitida a reprodução parcial ou total desta obra, desde que citada a fonte"*.
   Atribuição obrigatória em `data/nutrition/taco-4/ATTRIBUTION.md` e na UI.
3. **Nutrientes em tabela normalizada** (`nutrition_food_nutrients`), com **view de pivô**
   para os nutrientes quentes — derivação, não segunda fonte de verdade.
4. **Snapshot histórico obrigatório** no consumo (Subfase B): editar um alimento nunca
   altera o passado.
5. **A base global tem `user_id` nulo** e é **somente leitura** para o usuário (policy
   separada de SELECT e de escrita). Duplicar cria cópia pessoal editável com referência
   à origem.
6. **Água continua sendo do módulo Hábitos** (Fase 10). Dieta lê e exibe; não duplica.
7. **As medidas corporais NÃO são de Dieta** (decidido em 2026-08-03, aplicado na 16-E em
   2026-08-04). Elas nasceram como **módulo central `body_*`**, com código em `src/lib/body/`,
   porque Treinos precisa exatamente do mesmo dado. **A 16-E CRIOU as 4 tabelas; a 17-E
   CONSOME.** Nunca existem duas tabelas de peso corporal.

**Critérios de aceite da fase completa:** os 40 itens listados na seção "Critérios de aceite
gerais" do arquivo da Subfase F.

---

## Fase 17 — Módulo Treinos (6 subfases)
> **Fora do roadmap original.** Aberta em 2026-08-03, a pedido do usuário, em paralelo à
> Fase 16 (concluída em 2026-08-04). Não substitui nem invalida nenhuma
> fase anterior. Quebrada em **6 subfases sequenciais (A–F)**, cada uma com arquivo próprio.

**Objetivo:** um módulo central em `/treinos` para **planejar, executar e acompanhar**
treino de academia: musculação, hipertrofia, força e condicionamento complementar —
exercícios, treinos-modelo, programas, planejamento semanal, sessão ao vivo, registro de
desempenho, progressão de carga, histórico, recordes, metas, evolução corporal, dashboards e
relatórios — com a identidade visual, a arquitetura e as regras já existentes no sistema.

**Referência funcional (não visual, não de código):** a *organização*, a *facilidade de
registro durante o treino* e a *profundidade funcional* de bons apps de treino. **Nada de
código, identidade visual, textos, ícones, telas, vídeos, imagens ou assets de terceiros é
copiado.** A base de exercícios é de autoria própria.

| Subfase | Tema | Arquivo | Status |
| --- | --- | --- | --- |
| 17-A | Fundação, vocabulário e catálogo de exercícios | `PHASE_17_A_TRAINING_FOUNDATION_EXERCISES.md` | ✅ Concluída |
| 17-B | Programas, treinos-modelo e planejamento semanal | `PHASE_17_B_TRAINING_ROUTINES_PROGRAMS.md` | ✅ Concluída |
| 17-C | Preparação, sessão ao vivo, cronômetro e recuperação | `PHASE_17_C_TRAINING_LIVE_SESSION.md` | ✅ Concluída |
| 17-D | Histórico, volume, recordes e progressão | `PHASE_17_D_TRAINING_HISTORY_PROGRESS.md` | ✅ Concluída |
| 17-E | Metas, medidas corporais compartilhadas e dashboards | `PHASE_17_E_TRAINING_GOALS_DASHBOARDS.md` | ✅ Concluída |
| 17-F | Integrações, notificações, resiliência e polimento | `PHASE_17_F_TRAINING_INTEGRATIONS_POLISH.md` | ✅ Concluída — **FECHA A FASE 17** |

> ✅ **FASE 17 CONCLUÍDA em 2026-08-04** (17-A a 17-F). Os **55 critérios de aceite gerais do
> módulo foram validados um a um na 17-F: 55 de 55 atendidos** — o veredito item a item está em
> `docs/handoff/LAST_PHASE_SUMMARY.md`. Com a Fase 16 também fechada, **o projeto inteiro volta
> ao modo manutenção/iteração**: não há 17-G, e melhoria entra como tarefa avulsa.

**Dependências gerais:** Fases 01 (design system/app shell), 08 (agenda), 10 (hábitos),
12 (dashboard geral), 13 (busca global, lançamento rápido, notificações + Cron),
14 (`attachments`, buckets privados, `settings`, exportação), 15 (padrão de módulo com
navegação interna própria) e 16 (padrão de base global imutável + cópia pessoal).

**Decisões registradas antes de começar:**
1. **Rota `/treinos`** (padrão pt-BR do projeto), não `/training`. Prefixo de tabela
   `training_*` (código/schema em inglês, como `todo_*`/`nutrition_*`).
2. **Base de exercícios de autoria própria**, sem imagem, vídeo, texto ou dado copiado de
   apps de terceiros. Procedência em `data/training/exercise-base/ATTRIBUTION.md`.
3. **`tracking_type` é obrigatório** em todo exercício — é o contrato de medição que impede o
   sistema de somar quilos com segundos na Subfase D.
4. **Base global (`user_id is null`) é somente leitura**, com policies separadas por comando;
   preferências do usuário vão para `training_exercise_prefs`. Mesmo padrão da Fase 16-A.
5. **Modelo é mutável; execução é imutável.** A sessão (17-C) grava **snapshot** do treino;
   editar o modelo nunca reescreve o passado.
6. **Medidas corporais são um módulo central compartilhado (`body_*`)**, não tabelas de
   Treinos nem de Dieta. **A 16-E chegou primeiro e CRIOU** as 4 tabelas em 2026-08-04
   (`body_measurement_types`, `body_measurements`, `body_measurement_goals`,
   `body_progress_photos`), com código em `src/lib/body/`. **A 17-E CONSOME** — lê e escreve
   por `src/lib/body/queries.ts` e `src/lib/actions/body-measurements.ts`, e **não cria tabela
   nenhuma**. `getLatestWeight()` já existe para a preparação da sessão pré-preencher o peso.
   **Nunca existem duas tabelas de peso corporal.**
7. **Ferramenta de organização e registro.** Sem diagnóstico, sem prescrição, sem garantia de
   resultado, sem sugestão de carga máxima e sem incentivo a treinar com dor.

**Critérios de aceite da fase completa:** os **55 itens** listados na seção "Critérios de
aceite gerais do módulo Treinos" do arquivo da Subfase F.
