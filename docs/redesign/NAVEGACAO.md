# Navegação — estado atual e proposta

Conferido no código em 2026-09-20.

---

## 1. A boa notícia: reorganizar é barato

`src/config/nav.ts` exporta quatro coisas. **Apenas uma é usada:**

| Export | Consumidores |
| --- | --- |
| `navSections` | **1** — `src/components/layout/nav-links.tsx:5,29` |
| `allNavItems` (`nav.ts:96`) | **0 — código morto** |
| `findNavItem` (`nav.ts:99`) | **0 — código morto** |
| tipos `NavItem` / `NavSection` | 0 fora do próprio arquivo |

E `NavLinks` é usado por exatamente dois lugares — `sidebar.tsx:50` (desktop) e
`mobile-nav.tsx:41` (drawer) —, **com a mesma fonte e sem nenhum filtro**. Desktop e mobile são
literalmente a mesma lista.

Consequência: **não há breadcrumb, título de página derivado do nav, nem busca sobre rotas**
para quebrar. A reorganização da sidebar toca 2 arquivos, não 20.

⚠️ **O preço disso:** não existe **nenhum teste** sobre `nav.ts`. Os 20 `href` da navegação
principal não são conferidos contra o disco — enquanto as 14 rotas de contexto da IA e os 9
deep-links de `/ia` **são** (`validators/ai.test.ts:425`, `search/ai-links.test.ts:33`). Um
`href` renomeado vira 404 silencioso e a suíte continua verde.

---

## 2. Estrutura atual — 5 seções, 20 itens, zero subitens

O tipo `NavItem` não tem campo `children`. A sidebar é estritamente plana.

| Seção | Itens |
| --- | --- |
| **Geral** | Dashboard `/dashboard` · Relatórios `/relatorios` · Notificações `/notificacoes` |
| **Financeiro** | Painel financeiro `/dashboard/financeiro` · Financeiro `/financeiro` · Cartões `/cartoes` · Faturas `/faturas` · Parcelamentos `/parcelamentos` · A Receber `/terceiros` · Importar `/importar` |
| **Organização** | TO-DO `/todo` · Agenda `/agenda` · Tarefas `/tarefas` · Rotinas `/rotinas` · Hábitos `/habitos` · Estudos `/estudos` |
| **Saúde** | Dieta e Alimentação `/nutricao` · Treinos `/treinos` |
| **Sistema** | Inteligência Artificial `/ia` · Configurações `/configuracoes` |

---

## 3. Defeitos confirmados

### 🔴 D1 — `/dashboard/financeiro` acende DOIS itens

`nav-links.tsx:36-38`:
```tsx
const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
```

| Item | href | Casa? |
| --- | --- | --- |
| Dashboard (Geral) | `/dashboard` | `"/dashboard/financeiro".startsWith("/dashboard/")` → **true** |
| Painel financeiro (Financeiro) | `/dashboard/financeiro` | igualdade → **true** |

Os dois recebem `bg-primary/10`, a barrinha lateral **e `aria-current="page"`** — dois
`aria-current="page"` no mesmo documento é erro de acessibilidade.

É o **único** par colidente entre os 20 hrefs. E a ironia: `findNavItem` (`nav.ts:99-103`) já
resolve exatamente isso com `.sort((a,b) => b.href.length - a.href.length)[0]` — escrita,
correta e nunca importada.

> Os módulos internos **acertaram**: `training-nav.tsx:63`, `ai-nav.tsx:40` e
> `finance-tabs-nav.tsx` blindam a raiz com igualdade exata. Só a sidebar global não.

### 🟠 D2 — `/busca` é órfã

`src/app/(app)/busca/page.tsx` existe, funciona (busca server-side, resultados agrupados, URL
compartilhável por `?q=`) e **é inalcançável pela interface**. Não está em `nav.ts` e não recebe
link de lugar nenhum — as duas únicas menções a `/busca` no `src/` inteiro são
auto-referências. O `Ctrl/⌘+K` navega direto para o resultado e não oferece "ver todos".

### 🟠 D3 — Cinco navegações internas independentes

| Módulo | Padrão | Largura | Fonte |
| --- | --- | --- | --- |
| Nutrição (12) | coluna lateral | `w-56` | `nutrition/constants.ts` |
| Treinos (13) | coluna lateral | `w-56` | `training/constants.ts` |
| IA (8) | coluna lateral, `sticky top-18` | `w-72` drawer | `ai/constants.ts` |
| Financeiro (6) | **abas horizontais** | — | array inline no componente |
| TO-DO | **botões de query string** | `w-60` | estado, não rota |

`isActive` está copiada literalmente em `nutrition-nav.tsx:59` e `training-nav.tsx:63`.
`NutritionShell`, `TrainingShell` e `AiShell` são o mesmo componente com três nomes. Só o da IA
tem `sticky top-18` (o valor correto, dado que o Header é `sticky top-0 h-16`).

**Cartões, Faturas e Parcelamentos não têm navegação interna nenhuma** — são três telas soltas
na sidebar.

### 🟡 D4 — Outros

- `/recuperar-senha` está em `PUBLIC_PATHS` (`proxy-session.ts:14`) e **não existe** como rota.
- `?next=` é gravado no redirect de login e aparentemente ignorado (`auth-form.tsx` empurra
  para `/dashboard` fixo).
- `Logo` é um `<div>`, não link — não há volta ao Dashboard pela marca.
- "Sessão ativa" fica aceso em `/treinos/sessao/revisar`, que é uma sessão já encerrada.
- `!isSupabaseConfigured` desliga a proteção de rotas inteira (`proxy-session.ts:34`).
  Intencional para desenvolvimento, mas é risco se um deploy subir sem env vars.

---

## 4. Proposta

### Sidebar

| Seção | Item | Rota | Vem de |
| --- | --- | --- | --- |
| **GERAL** | Dashboard | `/dashboard` | = |
| | Relatórios | `/relatorios` | = |
| | Notificações | `/notificacoes` | = |
| **FINANCEIRO** | Visão financeira | `/dashboard/financeiro` | "Painel financeiro" |
| | Movimentações | `/financeiro` | "Financeiro" |
| | Cartões e faturas | `/cartoes` | **funde** Cartões + Faturas + Parcelamentos |
| | Terceiros e reembolsos | `/terceiros` | "A Receber" |
| | Importações | `/importar` | "Importar" |
| **ORGANIZAÇÃO** | TO-DO | `/todo` | = |
| | Agenda | `/agenda` | = |
| | Rotinas e tarefas | `/rotinas` | **agrupa** Rotinas + Tarefas |
| | Hábitos | `/habitos` | = |
| | Estudos | `/estudos` | = |
| **SAÚDE E BEM-ESTAR** | Dieta e alimentação | `/nutricao` | = |
| | Treinos | `/treinos` | = |
| **ASSISTENTE** | Inteligência Artificial | `/ia` | = |
| **RODAPÉ** | Busca | `/busca` | **resolve D2** |
| | Configurações | `/configuracoes` | = |
| | Recolher/expandir | — | já existe |

De 20 para 17 itens na lista principal, **sem remover uma única funcionalidade**.

### Regras inegociáveis

1. **Nenhuma rota morre.** `/faturas`, `/parcelamentos` e `/tarefas` continuam existindo e
   respondendo, com todos os parâmetros. Isso não é opcional: `/faturas?card=X&month=Y` é
   gerado pela busca global (`search/queries.ts:285`) e por notificações
   (`notifications/generate.ts:309`), e `/tarefas?view=atrasadas` também (`:380`).
2. **Layout compartilhado antes de mover a árvore.** `/cartoes`, `/faturas` e `/parcelamentos`
   ganham um `layout.tsx` comum com a navegação interna da central. Nenhum arquivo de página
   muda de lugar na REDESIGN-05.
3. **TO-DO e Tarefas continuam separados.** Agrupar visualmente ≠ fundir dados. As tabelas
   `todo_*` e `tasks` permanecem distintas, e nada é migrado.
4. **Item ativo pela rota mais específica.** Adotar `findNavItem` (que já existe) ou sua
   lógica, com **teste** que fixe: `/dashboard/financeiro` acende **um** item.
5. **Teste de rota no disco.** Todo `href` de `nav.ts` precisa ter `page.tsx`, conferido por
   teste — como `ai-links.test.ts` já faz para `/ia`.

### Central "Cartões e faturas" — navegação interna

`Visão geral` · `Faturas e pagamentos` · `Próximos meses` · `Parcelamentos` · `Relatórios` ·
`Meus cartões`

O detalhamento de lançamentos fica **dentro** da fatura, não como aba.

### Navegação interna: um componente, cinco consumidores

Extrair `ModuleNav` + `ModuleShell` a partir dos três shells idênticos (Nutrição, Treinos, IA),
com `sticky top-18` (o valor certo) e uma largura só. Financeiro e a nova central passam a usar
o mesmo. TO-DO fica de fora — é navegação por estado, não por rota, e isso é correto.

---

## 5. O que auditar antes de mexer

- [ ] Menu mobile: é o mesmo componente, então herda tudo — confirmar após a mudança.
- [ ] `card-meta.ts:37-48` (destino de cada card do dashboard) aponta para `/faturas`,
      `/tarefas`, `/configuracoes` — revisar junto.
- [ ] `notificacoes` no dashboard linka para `/configuracoes` no `card-meta.ts:45` mas para
      `/notificacoes` no corpo do card. Inconsistência a resolver.
- [ ] `training-links.test.ts` e `nutrition-links.test.ts` **prometem** no cabeçalho que as
      rotas existem e não conferem o disco. Alinhar com `ai-links.test.ts`.
