# Fase 01 — Foundation, Arquitetura & Design System

## Contexto
Primeira fase do projeto. Estabelece a **base** sobre a qual todos os módulos serão construídos: scaffold, design system premium (preto/branco/dourado), tema dark/light, app shell (sidebar + header), rotas de todos os módulos (placeholders) e a base de autenticação. Sem essa base sólida, as fases financeiras (a prioridade do projeto) não têm onde se apoiar.

## Antes de começar
O agente deve ler:
- `docs/project/PROJECT_BRIEFING.md`
- `docs/project/PROJECT_RULES.md`
- `docs/project/PROJECT_ARCHITECTURE.md`
- `docs/project/PROJECT_ROADMAP.md`
- `docs/project/CURRENT_STATUS.md`
- `docs/handoff/LAST_PHASE_SUMMARY.md`
- Este arquivo.

## Objetivo da fase
Entregar um app Next.js rodando, bonito e premium, com identidade visual preto/branco/dourado, tema dark/light sem flash, layout responsivo (sidebar recolhível + header completo), rotas placeholder de todos os módulos e a base de autenticação Supabase pronta.

## Escopo da fase
- **Scaffold:** Next.js 16 (App Router, TS, Tailwind v4, src-dir, alias `@/`).
- **Dependências:** `@supabase/ssr`, `@supabase/supabase-js`, `next-themes`, `@tanstack/react-query`, `react-hook-form`, `zod`, `lucide-react`, `sonner`, `recharts`, `date-fns`, `zustand`, `@tanstack/react-table`, e shadcn/ui.
- **Design system:** tokens CSS (dark/light) com paleta preto/branco/dourado; fonte Arial/system; raios/sombras/espaçamentos premium; `globals.css` (Tailwind v4 `@theme inline`).
- **Tema:** `next-themes` (classe), `ThemeProvider`, `ThemeToggle` com persistência e sem flash.
- **App shell:** `Sidebar` recolhível (drawer no mobile), `Header` (busca global UI, botão Lançamento Rápido, sino de notificações, toggle de tema, menu do usuário). Item ativo em dourado.
- **Route groups:** `(app)` (autenticado, com shell) e `(auth)` (login/cadastro).
- **Rotas placeholder:** `/dashboard`, `/financeiro`, `/cartoes`, `/faturas`, `/parcelamentos`, `/terceiros`, `/importar`, `/agenda`, `/tarefas`, `/habitos`, `/estudos`, `/configuracoes` — cada uma com `PageHeader` + `EmptyState`.
- **Componentes base:** shadcn (button, card, input, label, dialog, sheet, dropdown-menu, badge, avatar, skeleton, table, tabs, tooltip, select, separator, sonner) + custom (`Logo`, `Sidebar`, `Header`, `ThemeToggle`, `UserMenu`, `PageHeader`, `EmptyState`, `StatCard`).
- **Auth base:** `lib/supabase/client.ts`, `lib/supabase/server.ts`, `src/proxy.ts` (sessão + proteção de `(app)`), páginas `/login` e `/cadastro` (email/senha + Google), `auth/callback/route.ts`, `.env.local.example`.

## Fora do escopo
- Schema/migrations de negócio (começa na Fase 02).
- Qualquer CRUD financeiro, lógica de fatura, parcelas, terceiros, importação, dashboards com dados reais.
- Integração real do Google Agenda, busca funcional, notificações reais (apenas UI/placeholder no header).

## Instruções técnicas
- Usar **Tailwind v4** (sem `tailwind.config.js` clássico): tokens em `globals.css` com `:root` (light) e `.dark` (dark), mapeados em `@theme inline`.
- **Cor primária = dourado.** Garantir contraste AA em ambos os temas.
- **Next 16:** usar `src/proxy.ts` (não `middleware.ts`), função `proxy`; `cookies()` é **async** no `server.ts` (use `await`).
- shadcn/ui: inicializar com `npx shadcn@latest init` (base color neutra; depois sobrescrever tokens com a paleta). Adicionar componentes via CLI.
- Navegação centralizada em `src/config/nav.ts` (label, href, ícone) e consumida pela Sidebar.
- Providers no root layout: `ThemeProvider` (next-themes) e `QueryProvider` (TanStack Query) + `<Toaster />` (sonner).
- `metadata` do app: título "Sistema Pessoal" / pt-BR; `<html lang="pt-BR">`.

## Cuidados
- Não introduzir fontes extravagantes (manter Arial/system).
- Garantir **sem flash** de tema (usar `suppressHydrationWarning` no `<html>` e estratégia do next-themes).
- A autenticação depende das chaves do Supabase no `.env.local`. Sem chaves, o restante deve continuar funcionando; o login "liga" quando as chaves forem fornecidas. **Não commitar** `.env.local`.
- Não criar tabelas no Supabase do usuário nesta fase (apenas auth nativo).
- Manter responsividade real (testar mobile).

## Critérios de aceite
- [ ] `npm run build` passa (typecheck + lint) e `npm run dev` sobe sem erros.
- [ ] Tema dark/light alterna e **persiste**, sem flash.
- [ ] Sidebar recolhe no desktop e vira drawer no mobile; item ativo em dourado.
- [ ] Header tem busca (UI), lançamento rápido (UI), sino (UI), toggle de tema, menu do usuário.
- [ ] Todas as rotas de módulo abrem dentro do shell com empty state.
- [ ] `/login` e `/cadastro` renderizam com visual premium; com credenciais válidas, login/cadastro funcionam e rotas `(app)` redirecionam para `/login` quando deslogado.

## Ao finalizar
O agente deve atualizar:
- `docs/project/CURRENT_STATUS.md`
- `docs/handoff/LAST_PHASE_SUMMARY.md`
- `docs/handoff/NEXT_AGENT_INSTRUCTIONS.md` (apontando para `docs/phases/PHASE_02_FINANCIAL_CORE.md`)
