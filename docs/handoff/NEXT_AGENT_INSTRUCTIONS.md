# NEXT_AGENT_INSTRUCTIONS — Instruções para o próximo agente

## ✅ Resolvido — "Marcar fatura como paga" (build voltou a passar)
A pendência que travava o build foi **concluída** (branch `feat/pagamento-fatura-conta`, commits
`818739c`..`c806bc6`): `markStatementPaid(id, contaId)` agora é chamado por um diálogo `PayStatementDialog`
em `statements-client.tsx` (seletor de conta usando a prop `accounts`; botão Pagar oculto quando total ≤ 0).
O pagamento cria um lançamento `transferencia` que debita a conta sem inflar relatórios/fatura; "Desfazer"
estorna o saldo. Itens de cartão em Lançamentos exibem pago/em-aberto derivado da `pago_em` da fatura.
`build`/`tsc`/`lint`/`test:run` (401) verdes. Detalhes em `docs/project/CURRENT_STATUS.md` → *Iterações*.

## ✅ Projeto concluído — modo manutenção (NÃO há próxima fase)
**As 14 fases do roadmap estão concluídas.** Não existe (e não deve ser criada) uma `PHASE_15`.
O sistema está fechado em escopo e entra em **manutenção/iteração**: mudanças futuras são
**melhorias pontuais**, não novas fases. Se alguém pedir "a próxima fase", explique que o roadmap
terminou e trate o pedido como uma tarefa pontual de manutenção.

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
  as tabelas (hoje **34**). Nenhuma tabela de dados do usuário sem RLS. Teste RLS **pelo client SDK
  autenticado** (o SQL editor ignora RLS).
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
Os **342 testes** devem continuar passando (acrescente testes para qualquer lógica pura nova).
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
