# Fase 14 — Segurança, Responsividade & Polimento Final

## Contexto
**Última fase do projeto.** Todos os módulos e funcionalidades transversais já existem (Fases 02–13). Esta fase **não adiciona novos domínios** — ela **fecha o sistema** para uso real: entrega os **relatórios/análises consolidados**, finaliza as **configurações** (perfil, tema, moeda, data, notificações, Google, exportação), faz uma **revisão de segurança completa** (RLS em todas as tabelas, validação Zod no backend, sanitização, nada sensível no client), ajusta **responsividade fina** e **performance**, revisa **empty states e skeletons**, roda os **testes gerais** e percorre o **checklist de aceite do briefing**. Ao final, o projeto é marcado como **concluído** e entra em **modo manutenção/iteração**.

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
Deixar o sistema **pronto para uso real**: relatórios consolidados úteis, configurações finais completas, **segurança revisada de ponta a ponta**, responsividade e performance refinadas, estados de UI polidos e o **checklist de aceite do briefing satisfeito** — encerrando o projeto e entrando em modo manutenção.

## Escopo da fase
- **Finalização de schema (Supabase, `supabase/migrations/`):**
  - **`settings`/`profiles`:** consolidar/finalizar a store de preferências iniciada na Fase 12 — perfil do usuário (nome, avatar), tema, **moeda (BRL)**, formato de data, preferências de notificações, integração Google e flags de exportação. `user_id uuid not null references auth.users(id) on delete cascade`, **RLS** (`user_id = auth.uid()`), índice em `user_id`, trigger de `updated_at`. Migration **idempotente** (apenas adicionar o que faltar).
  - **`attachments`:** tabela de anexos/comprovantes (`user_id`, `entity_type`, `entity_id`, `storage_path`, `file_name`, `mime_type`, `size`, `created_at`/`updated_at`) com **RLS** (`user_id = auth.uid()`) e índices em `user_id`/`entity`. Configurar **bucket de Storage** privado com policies por `user_id`. Ligar anexos onde o briefing pede (lançamentos/tarefas).
- **Relatórios e análises consolidados (`/relatorios`):**
  - **Financeiro:** gastos por mês/categoria/cartão, **pessoais x terceiros**, receitas x despesas, evolução mensal, projeção, maiores gastos, assinaturas/recorrências.
  - **Cartão:** faturas por mês, **próximas 6 faturas**, parcelamentos ativos, compras por cartão, valores de terceiros por fatura.
  - **Hábitos:** consistência semanal/mensal, mais/menos realizados.
  - **Estudos:** horas estudadas, cursos em andamento, progresso por curso, evolução.
  - **Tarefas:** concluídas, atrasadas, produtividade semanal, projetos ativos.
  - Gráficos **úteis** (recharts), filtros por período, e **exportação** dos relatórios.
- **Configurações finais (`/configuracoes`):** perfil; tema (dark/light); **moeda BRL**; formato de data brasileiro; configurações de notificações; configurações de cartões/categorias; **integração Google Agenda** (estado da conexão); **exportação de dados** (backup) e preferências do dashboard.
- **Revisão de segurança (auditoria + correções):**
  - **RLS habilitada e correta em TODAS as tabelas** (`accounts, credit_cards, card_statements, transactions, transaction_installments, categories, subcategories, people, shared_expenses, receivables, bills, recurring_transactions, tasks, projects, routines, habits, habit_logs, study_courses, study_modules, study_lessons, study_sessions, calendar_events, notifications, attachments, import_batches, import_rows, settings`) — `using` **e** `with check` por `user_id = auth.uid()`.
  - **Validação no backend (Zod)** em todas as Server Actions/rotas, além do client; **sanitização** de inputs.
  - **Nada sensível no frontend**; **sem `service_role` no client** nem em código de browser; segredos só no servidor.
  - Rotas privadas protegidas pelo **`proxy.ts`**; tokens do Google e do Cron seguros; **logs sem dados financeiros sensíveis**.
  - **Backup/exportação** de dados disponível e testado.
- **Responsividade fina:** revisar **todas** as telas em desktop/tablet/mobile (sidebar drawer, tabelas que viram cards, modais, command palette, calendário, kanban); corrigir overflow/quebra.
- **Performance:** revisar queries (índices, agregação no Postgres, sem N+1), `Suspense`/streaming por bloco, lazy-load de gráficos pesados, bundle enxuto.
- **Polimento de UI:** **empty states** e **skeletons** revisados em todo o sistema; consistência de espaçamento/tipografia/cores (preto/branco/dourado); feedback (toasts/confirmações) uniforme; contraste **WCAG AA** em dark e light.
- **Testes gerais:** rodar a suíte (Vitest), reforçar testes das **regras críticas** (fatura, parcelas, terceiros, idempotência de notificações) e validar manualmente os fluxos principais.
- **Checklist de aceite do briefing:** percorrer item a item os "Critérios gerais de aceite" do `PROJECT_BRIEFING.md` e confirmar cada um.

## Fora do escopo
- Novos módulos ou novas funcionalidades de domínio (o projeto está fechado em escopo).
- Push/e-mail/web-push externos e novas integrações além do que o briefing pede (ficam para iteração futura em manutenção).
- Reescrever regras das fases anteriores — aqui o foco é **auditar, refinar e fechar**, não recriar.

## Instruções técnicas
- **Auditoria de RLS:** revisar cada migration e, se possível, gerar tipos/inspecionar o banco; conferir que toda tabela tem `enable row level security` + policy `using`/`with check`. Testar RLS **pelo client SDK autenticado** (o SQL editor ignora RLS).
- **Storage:** bucket privado; policies de Storage por `user_id`; URLs assinadas para exibir anexos; nunca expor caminho/credencial.
- **Server Actions/rotas:** garantir Zod no servidor em **todas**; derivar `user_id` de `auth.uid()` (nunca do client); `updateTag`/revalidação para read-your-writes.
- **Exportação/backup:** gerar export dos dados do usuário (ex.: JSON/CSV por entidade) respeitando RLS, acionável em `/configuracoes`.
- **Datas/moeda:** `lib/format.ts` (BRL, `date-fns/ptBR`) em todos os relatórios e telas.
- **Performance:** medir e ajustar; preferir agregação no Postgres; `Promise.all` para leituras paralelas; code-splitting de telas/gráficos.
- Reutilizar ao máximo `components/ui`, `components/shared`, `components/layout` e `lib`; **não** introduzir dependências novas sem necessidade.

## Cuidados
- **Não quebrar** nada das Fases 01–13: esta fase é de **fechamento**, não de reescrita.
- Segurança é **bloqueante**: nenhuma tabela sem RLS, nenhuma Server Action sem validação no servidor, **nenhum** `service_role` no client. Se achar uma brecha, **corrigir** antes de fechar.
- Migrations **idempotentes** e versionadas; mudanças destrutivas só com necessidade real e registradas.
- Manter **dark/light** e **responsividade** real em **todas** as telas revisadas.
- Não logar dados financeiros sensíveis; export/backup não pode vazar dados de outro usuário (RLS).
- Confirmar os critérios financeiros do briefing: **fatura correta**, **parcelas distribuídas**, **terceiros não distorcem o valor pessoal**, **total movimentado x valor realmente meu**.

## Critérios de aceite
- [ ] **Relatórios consolidados** (financeiro, cartão, hábitos, estudos, tarefas) com gráficos úteis, filtros e exportação.
- [ ] **Configurações finais** completas (perfil, tema, **BRL**, formato de data, notificações, Google, exportação, preferências do dashboard).
- [ ] **RLS habilitada em TODAS as tabelas** (`using`/`with check` por `user_id`); RLS testada via client autenticado.
- [ ] **Validação Zod no backend** em todas as Server Actions/rotas; inputs sanitizados; **sem `service_role` no client**; nada sensível no frontend.
- [ ] Rotas privadas protegidas pelo `proxy.ts`; **backup/exportação** funcionando; logs sem dados financeiros sensíveis.
- [ ] **Responsividade fina** em desktop/tablet/mobile; **performance** revisada (sem N+1, índices, lazy-load).
- [ ] **Empty states** e **skeletons** revisados em todo o sistema; UI consistente (preto/branco/dourado) com contraste **WCAG AA** em dark e light.
- [ ] **Testes gerais** passam (Vitest), incluindo regras críticas (fatura/parcelas/terceiros/notificações).
- [ ] **Checklist de aceite do briefing** satisfeito (item a item).
- [ ] `npm run build` passa.

## Ao finalizar
Esta é a **última fase** — não há próxima fase. O agente deve:
- Atualizar `docs/project/CURRENT_STATUS.md` marcando o **projeto como CONCLUÍDO** (todas as fases 01–14 concluídas) e registrando que o sistema entra em **modo manutenção/iteração** (não há próxima fase; futuras mudanças são melhorias pontuais).
- Atualizar `docs/handoff/LAST_PHASE_SUMMARY.md` (resumo final, migrations de `settings`/`profiles` e `attachments`, relatórios, configurações, achados e correções da auditoria de segurança, resultados dos testes e do checklist do briefing).
- Atualizar `docs/handoff/NEXT_AGENT_INSTRUCTIONS.md` para refletir que **não há próxima fase**: o projeto está concluído e em **modo manutenção**; descrever como tratar melhorias/correções futuras (ler o briefing/regras, abrir tarefa pontual, manter RLS/testes/responsividade) em vez de apontar para uma `PHASE_15`.
