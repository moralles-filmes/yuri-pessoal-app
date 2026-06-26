# PROJECT_ARCHITECTURE — Arquitetura do Sistema Pessoal Yuri

> Arquitetura **proposta e adotada** para o projeto (era greenfield). Decisões confirmadas com o usuário.

## 1. Stack

| Camada | Tecnologia |
| --- | --- |
| Framework | **Next.js 16** (App Router) + React 19.2 + TypeScript |
| Estilo | **Tailwind CSS v4** (CSS-first, `@theme inline` em `globals.css`) |
| Componentes | **shadcn/ui** (Radix UI) |
| Tema | **next-themes** (dark/light via classe, sem flash) |
| Ícones | **lucide-react** |
| Toasts | **sonner** |
| Dados/servidor | **Supabase** (Postgres + Auth + Storage) via **@supabase/ssr** |
| Estado de servidor (client) | **@tanstack/react-query** (v5) |
| Estado global de UI | **Zustand** (somente onde necessário) |
| Forms | **react-hook-form** + **zod** |
| Tabelas | **@tanstack/react-table** |
| Gráficos | **recharts** |
| Datas | **date-fns** (crítico para regra de fatura) |
| Deploy | **Vercel** (Vercel Cron para notificações/lembretes em fases futuras) |

**Locale:** pt-BR. **Moeda:** BRL. **Formato de data:** brasileiro.

## 2. Decisões importantes (Next.js 16 — breaking changes)

> O scaffold gera `AGENTS.md` avisando que esta versão tem breaking changes. Pontos que afetam o projeto:

- **`middleware.ts` foi renomeado para `proxy.ts`.** Vai em `src/proxy.ts` (mesmo nível de `app/`). Função exportada chamada `proxy`. Runtime é **nodejs** (não edge) e não é configurável. Usado para refresh de sessão Supabase + proteção de rotas.
- **APIs de request são assíncronas:** `cookies()`, `headers()`, `draftMode()`, e `params`/`searchParams` em pages/layouts são **Promises** → sempre `await`. Isso afeta o client Supabase de servidor.
- **Turbopack por padrão** em `next dev` e `next build` (sem flag).
- **`next lint` removido** — usar ESLint direto (`npm run lint` = `eslint`). `next build` não roda lint.
- `revalidateTag` agora exige 2º argumento (perfil de cacheLife); preferir `updateTag` em Server Actions para read-your-writes.
- Tailwind v4: tema via `@theme inline` + variáveis CSS em `globals.css` (não há `tailwind.config.js` clássico).

## 3. Modelo de dados (single-user + RLS)

Sistema de **usuário único**. A autenticação usa o `auth.users` nativo do Supabase. **Todas** as tabelas de negócio têm coluna `user_id uuid not null references auth.users(id)` e **RLS habilitada** com policies do tipo:

```sql
alter table public.<tabela> enable row level security;
create policy "own rows" on public.<tabela>
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
```

Padrões de schema:
- `id uuid primary key default gen_random_uuid()`
- `user_id uuid not null references auth.users(id) on delete cascade`
- `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()` (trigger de updated_at)
- Índice em `user_id` em todas as tabelas; índices adicionais por colunas de filtro (datas, status, fk de cartão/conta).
- Valores monetários: armazenar em **centavos (integer)** ou `numeric(14,2)` — **padronizar e documentar na Fase 02** (recomendação: `numeric(14,2)` para legibilidade, com utilitários de formatação).

**Entidades (Módulo 16):** `accounts, credit_cards, card_statements, transactions, transaction_installments, categories, subcategories, people, shared_expenses, receivables, bills, recurring_transactions, tasks, projects, routines, habits, habit_logs, study_courses, study_modules, study_lessons, study_sessions, calendar_events, notifications, attachments, import_batches, import_rows, settings` (+ opcional `profiles`).

> O schema é entregue **incrementalmente por fase** (não tudo de uma vez). Migrations em `supabase/migrations/` (criadas a partir da Fase 02).

### Regra de fatura (resumo para implementação na Fase 03)
Dado `data_compra`, `dia_fechamento`, `dia_vencimento`:
1. Determinar o fechamento de referência: se `dia(data_compra) <= dia_fechamento`, a fatura fecha no `dia_fechamento` do **mês corrente**; senão, no **mês seguinte**.
2. O vencimento é o `dia_vencimento` do mês do fechamento (ou do mês seguinte se `dia_vencimento < dia_fechamento`).
3. Tratar meses com menos dias (clamp para o último dia do mês) e virada de ano. Centralizar em `src/lib/finance/invoice.ts` com **testes unitários** de borda.

## 4. Estrutura de pastas

```
src/
  app/
    (auth)/                  # grupo público (login, cadastro)
      login/page.tsx
      cadastro/page.tsx
      layout.tsx
    (app)/                   # grupo autenticado (protegido pelo proxy)
      layout.tsx             # app shell: Sidebar + Header
      dashboard/page.tsx
      financeiro/page.tsx
      cartoes/page.tsx
      faturas/page.tsx
      parcelamentos/page.tsx
      terceiros/page.tsx
      importar/page.tsx
      agenda/page.tsx
      tarefas/page.tsx
      habitos/page.tsx
      estudos/page.tsx
      configuracoes/page.tsx
    auth/callback/route.ts   # callback OAuth (Supabase)
    layout.tsx               # root layout (html/body, providers, fonte)
    globals.css              # Tailwind v4 + design tokens (dark/light)
  components/
    ui/                      # shadcn/ui (button, card, input, dialog, ...)
    layout/                  # Sidebar, Header, ThemeToggle, UserMenu, MobileNav
    shared/                  # PageHeader, EmptyState, StatCard, Logo, ...
    providers/               # ThemeProvider, QueryProvider
  lib/
    supabase/                # client.ts (browser), server.ts, proxy-session.ts
    utils.ts                 # cn() e helpers
    format.ts                # moeda/data pt-BR (Fase 02+)
    finance/                 # invoice.ts, installments.ts (Fase 03/04)
  hooks/                     # hooks reutilizáveis (TanStack Query, etc.)
  config/                    # navegação (nav.ts), constantes, env
  types/                     # tipos TS e (futuro) tipos gerados do Supabase
  proxy.ts                   # sessão Supabase + proteção de rotas
supabase/
  migrations/                # SQL versionado (a partir da Fase 02)
docs/                        # documentação do projeto (este diretório)
```

## 5. Padrões

- **Componentes:** Server Components por padrão; `'use client'` apenas para interatividade (forms, toggles, menus). UI base via shadcn em `components/ui`.
- **Rotas:** App Router com route groups `(auth)` e `(app)`. Páginas de módulo em pt-BR.
- **Forms:** `react-hook-form` + `zod` (schemas em colocação com o form ou em `lib`); mensagens de erro em pt-BR; estados de loading/erro com toast (sonner).
- **Dados:** leitura em Server Components quando possível; mutações via Server Actions ou rotas; no client, `@tanstack/react-query` com query keys por entidade. Sempre respeitando RLS (o usuário só vê o que é dele).
- **Supabase:** `lib/supabase/client.ts` (`createBrowserClient`), `lib/supabase/server.ts` (`createServerClient` com `await cookies()`), `proxy.ts` para refresh de sessão. Variáveis em `.env.local`.
- **Tema:** `next-themes` com `attribute="class"`; tokens em `globals.css` (`:root` light, `.dark` dark). Cor de destaque = dourado (`--primary`).
- **Formatação:** utilitários centralizados (`Intl.NumberFormat('pt-BR', {style:'currency', currency:'BRL'})`, `date-fns` com `ptBR`).

## 6. Variáveis de ambiente

`.env.local` (ver `.env.local.example`):

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...        # somente servidor; nunca expor
# (futuro) GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET para Google Agenda (Fase 08)
```

O usuário **já possui** um projeto Supabase; as chaves são fornecidas por ele.

## 7. Como rodar

```bash
npm install
# preencher .env.local com as chaves do Supabase
npm run dev      # http://localhost:3000 (Turbopack)
npm run build    # build de produção (Turbopack)
npm run start    # servir build
npm run lint     # ESLint
```

## 8. Como testar

- **Regras críticas (financeiro):** testes unitários para `invoice.ts` (fatura correta) e `installments.ts` (distribuição de parcelas) — adicionar runner de teste (Vitest) na Fase 02/03.
- **RLS:** testar pelo client SDK autenticado (não pelo SQL editor, que ignora RLS).
- **Manual:** dark/light, responsividade (desktop/tablet/mobile), navegação entre módulos, fluxo de login.

## 9. Observações técnicas

- OneDrive + caminho com espaços: funciona, mas evitar ferramentas que não lidam bem com espaços; usar caminhos relativos.
- Git foi inicializado pelo `create-next-app`.
- `AGENTS.md`/`CLAUDE.md` na raiz apontam para as regras do Next 16 e para esta documentação — leia antes de codar.
