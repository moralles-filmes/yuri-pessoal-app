# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

# Sistema Pessoal Yuri

Sistema pessoal **single-user** (finanças, cartões/faturas, parcelamentos, gastos de terceiros, importação, agenda + Google Agenda, tarefas/rotinas, hábitos, estudos, dashboards, busca global, notificações). Next.js 16 + Supabase + Tailwind v4 + shadcn/ui. Locale **pt-BR**, moeda **BRL**, datas no formato brasileiro.

## Estado do projeto

As **14 fases do roadmap estão concluídas** (ver `docs/project/CURRENT_STATUS.md`) — o projeto está em **modo manutenção/iteração**. **Não existe uma "próxima fase" nem `PHASE_15`**. Mudanças novas são melhorias pontuais; a documentação de fases serve como histórico e fonte das decisões já tomadas.

## Leitura obrigatória antes de mexer no código

Projeto **documentação-primeiro**. Antes de implementar, leia nesta ordem:

1. `docs/project/PROJECT_BRIEFING.md` — fonte de verdade (o que é o sistema)
2. `docs/project/PROJECT_RULES.md` — regras obrigatórias de trabalho
3. `docs/project/PROJECT_ARCHITECTURE.md` — stack, padrões e schema
4. `docs/project/CURRENT_STATUS.md` — o que cada fase entregou + decisões técnicas
5. `docs/handoff/LAST_PHASE_SUMMARY.md` e `docs/handoff/NEXT_AGENT_INSTRUCTIONS.md`
6. O arquivo da fase relevante em `docs/phases/PHASE_XX_*.md` (a feature que você for tocar)

Regras-chave que não estão no código: não quebrar o existente; manter dark/light + responsividade em tudo; RLS por `user_id` em **todas** as tabelas; pt-BR/BRL; **nunca** expor `service_role` no client.

## Regras de trabalho (obrigatórias)

1. **Sempre responda em português (pt-BR).**
2. **Antes de subir qualquer coisa para o Git, revise se não há nada sensível** — segredos, chaves, tokens, API keys, `.env`, `service_role`. **Nunca** suba o que não pode ser público. Confira o diff/arquivos antes de qualquer commit ou push.
3. **Ao final da tarefa, atualize este CLAUDE.md sem perguntar — mas só se for realmente necessário.** Mantenha apenas o que é essencial; não adicione informação supérflua nem "encha" o arquivo. Se nada estrutural mudou, deixe como está.

## Comandos

```bash
npm run dev            # next dev (Turbopack) — http://localhost:3000
npm run build          # build de produção (Turbopack; NÃO roda lint)
npm run lint           # eslint (next lint foi removido no Next 16)
npm run test           # vitest em watch
npm run test:run       # vitest run (suíte completa, ~340 testes)
npx vitest run src/lib/finance/invoice.test.ts   # um arquivo de teste
npx vitest run -t "fatura"                        # por nome do teste
npx tsc --noEmit       # checagem de tipos
```

Verificação de mudança "pronta": `npm run test:run` + `npm run lint` + `npx tsc --noEmit` + `npm run build`. Migrations de schema são aplicadas no Supabase via MCP (`apply_migration`) no projeto `yjvnlbjvippefvzgrxxw`.

## Next.js 16 — o que difere do que você "sabe"

Esta versão tem breaking changes (ver `AGENTS.md`; guias em `node_modules/next/dist/docs/`):

- **`middleware.ts` → `src/proxy.ts`** (função `proxy`, runtime nodejs). Faz refresh de sessão Supabase + proteção de rotas.
- **APIs de request são async:** `await cookies()`, `await headers()`, e `params`/`searchParams` em pages/layouts são Promises.
- **Turbopack por padrão**; `next lint` removido (use `npm run lint`); `next build` não roda lint.
- **Tailwind v4 CSS-first:** sem `tailwind.config.js`. Tokens via `@theme inline` + variáveis CSS em `src/app/globals.css` (`:root` light, `.dark` dark; cor de destaque dourada).

## Arquitetura (o "big picture")

### Camadas e fluxo de dados
O padrão dominante em todo o app é **Server Component (lê) → Server Action (muta) → `revalidatePath`/`router.refresh`**. As decisões de fase mencionam TanStack Query/Zustand, mas a implementação real padronizou Server Actions para consistência — `@tanstack/react-query` está instalado mas o app não o usa para o fluxo principal. Siga o padrão Server Action ao adicionar features.

- **Páginas de módulo** em `src/app/(app)/<rota-ptbr>/page.tsx` são Server Components `force-dynamic` que chamam uma leitura agregada e renderizam um `*-client.tsx` (`'use client'`) para interatividade. Estado de filtro/visão vive na **URL** (`?view=&periodo=&date=`), não em estado global. Cada rota tem `loading.tsx` (skeleton).
- **Leituras** (server-only) ficam em `src/lib/<domínio>/queries.ts`. Costumam fazer **uma** consulta ampla e derivar tudo em memória (evitar N+1).
- **Mutações** ficam em `src/lib/actions/<domínio>.ts` (arquivos `"use server"`).

### Contrato das Server Actions (siga à risca)
Toda action segue o molde em `src/lib/actions/accounts.ts` + `src/lib/actions/helpers.ts`:
1. `const ctx = await authContext(); if (!ctx) return notAuthed;` — pega `{ supabase, userId }`. **`user_id` SEMPRE vem de `auth.getUser()`, nunca do client.**
2. Valida o input com Zod (`safeParse`); em erro → `invalid(parsed.error.flatten().fieldErrors)`.
3. Faz a query Supabase incluindo `user_id: ctx.userId` em inserts; em erro de DB → `dbError(...)`.
4. `revalidatePath(...)` das rotas afetadas e retorna `ActionResult<T>` (`{ ok: true, data } | { ok: false, error, fieldErrors? }`).

O client trata `ActionResult` com toast (sonner) — mensagens de erro em pt-BR.

### Lógica pura + testes (regra forte do projeto)
Regras de negócio críticas são **funções puras com datas/`now` injetados (sem `Date.now()`)** em `src/lib/<domínio>/*.ts`, cobertas por Vitest co-localizado (`*.test.ts`, ambiente `node`). O I/O (Supabase) fica separado em `queries.ts`/`actions`. Exemplos canônicos: `src/lib/finance/invoice.ts` (regra de fatura cartão), `installments.ts`, `src/lib/notifications/generate.ts` (idempotência por `dedupe_key`), streaks de hábitos/estudos, recorrência de tarefas/agenda. **Ao mexer numa regra, ajuste/adicione testes puros — não teste via banco.**

Padrões recorrentes que valem entender lendo o código:
- **"Status derivado na leitura, nunca gravado":** fatura, `tasks.status='atrasada'`, cursos atrasados — todos calculados na leitura a partir de datas. Não persista esses estados.
- **Dinheiro em centavos (integer)** no financeiro; formatação centralizada em `src/lib/format.ts` (`Intl.NumberFormat('pt-BR')`, `date-fns` com `ptBR`).
- **Datas locais pt-BR** (`'yyyy-MM-dd'` puro) em logs/streaks/heatmaps para evitar drift de UTC ("virar o dia").

### Clientes Supabase (3, não confunda)
- `src/lib/supabase/client.ts` — `createBrowserClient` (componentes client).
- `src/lib/supabase/server.ts` — `createServerClient` com `await cookies()` (Server Components/Actions/Route Handlers). `getCurrentUser()` é seguro mesmo sem Supabase configurado.
- `src/lib/supabase/service.ts` — **service role, SERVER-ONLY**. Usado **só** pelo Vercel Cron (`/api/cron/notifications`), que não tem sessão. Ignora RLS → **toda** query carrega `user_id` explícito. Nunca importar em código client.

### Segurança / multi-tenant (single-user na prática)
- **RLS + FORCE RLS em todas as 34 tabelas**, policies `using (user_id = auth.uid()) with check (...)`. Auth nativo do Supabase (`auth.users`).
- **Proteção de rotas** em `src/lib/supabase/proxy-session.ts`: tudo exige sessão exceto `PUBLIC_PATHS` (`/login`, `/cadastro`, `/auth`, `/recuperar-senha`, `/api/cron`). `/api/cron/*` é público para o proxy mas protegido por `CRON_SECRET` (Bearer) na própria rota.
- O app **degrada com elegância sem chaves**: sem credenciais Supabase o proxy só segue adiante; integrações Google e Cron só "ligam" quando suas env vars existem (ver `src/config/env.ts` e `.env.local.example`).

### Mapa de pastas
- `src/app/(auth)/` login/cadastro · `src/app/(app)/` shell autenticado (Sidebar+Header) com as rotas de módulo em pt-BR · `src/app/api/` route handlers (cron, export, google oauth).
- `src/components/ui/` shadcn · `layout/` · `shared/` (PageHeader, EmptyState, StatCard) · `providers/` (Theme, Query) · demais pastas por domínio.
- `src/lib/<domínio>/` (finance, calendar, tasks, habits, studies, dashboard, reports, search, notifications, import, google, settings) com `queries.ts` + lógica pura; `src/lib/actions/` (mutações); `src/lib/validators/` (schemas Zod).
- `src/config/nav.ts` (navegação) · `src/config/env.ts` · `src/types/supabase.ts` (gerado — **regenerar após migration**, via MCP `generate_typescript_types`).
- `supabase/migrations/` SQL versionado e idempotente (timestamp `YYYYMMDDHHMMSS`); cada tabela nova: `user_id` NOT NULL + RLS + FORCE RLS + índice em `user_id` + trigger `updated_at`.

## Ao concluir uma mudança relevante
Mantenha o handoff vivo (regra do projeto): atualize `docs/project/CURRENT_STATUS.md` e `docs/handoff/*` com o que mudou e decisões tomadas, e rode a verificação (testes/lint/tsc/build) antes de declarar pronto.
