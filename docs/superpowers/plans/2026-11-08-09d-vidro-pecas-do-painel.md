# REDESIGN-09-D — peças do painel em vidro — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** trocar o banner pela abertura sem caixa e levar `Indicador`, `Bloco`, `StatCard` e `PageHeader` ao vidro, em `/dashboard` e `/dashboard/financeiro` com um único `<h1>`.

**Architecture:** peças em `src/components/shared/` e `painel/` continuam Server Components; o material vem do `Card` (09-B). Só muda classe, hierarquia de título e a posição da abertura. Nenhum dado novo.

**Tech Stack:** Next.js 16, Tailwind v4, `tailwind-merge`, Vitest em ambiente node (prova por varredura de fonte sem comentários).

**Spec:** `docs/superpowers/specs/2026-11-07-redesign-09-vidro-design.md` (§6.2, §6.4, §6.5, §6.9, §6.12). Prévia, só leitura e fora do git: `C:/Users/Yuri/Documents/Desenvolvedor/yuri.app.pessoal/docs/redesign/referencias/previa-vidro/Main.dc.html`.

## Global Constraints

- Worktree `C:/tmp/09-vidro`, branch `feat/redesign-09-vidro`. Sem push, PR, merge ou deploy.
- Nenhuma migration, dependência, regra de negócio, número novo ou mudança de significado de número.
- Não editar `CLAUDE.md`, `AGENTS.md` nem `docs/redesign/STATUS.md`.
- Antes de cada commit: `sed -i 's/\r$//'` nos arquivos alterados, `git checkout -- AGENTS.md`, `git status` (conferir que o `CLAUDE.md` não mudou), revisão do diff atrás de segredo.
- Repositório público: nenhum valor em R$, nome de pessoa, banco ou categoria em teste ou documento.
- `cn()` = twMerge. Não combinar `vidro-*` com `bg-*`, `border-*` ou `shadow-*`. Vidro de cartão não tem `backdrop-filter`.
- Direto na névoa, só `text-foreground` e `text-muted-on-fog`. Textos coloridos ficam dentro do vidro.
- Se contraste falhar, baixar primeiro o alfa do tingimento. Se a névoa precisar sumir, parar e perguntar ao dono.
- Nenhuma rota sobe mais de 1 KB gz. `tabular-nums` em dinheiro. Situação nunca só por cor.
- Commit com `Co-Authored-By` do modelo que de fato escreveu.
- Comando de teste: `npx vitest run <arquivo> --testTimeout=30000`.

## Review Focus

1. Sem nome (`null` ou só espaços): o título vira "Boa noite." sem vírgula solta. Teste na Task 1.
2. Nome longo sem espaço a 390 px: quebra sem rolagem horizontal. Teste de `break-words` na Task 1 e conferência na Task 5.
3. Valor de sete dígitos a 1280 px em quatro colunas: não corta nem estoura o cartão. Teste do degrau por contêiner na Task 2 e medição na Task 5.
4. Olho fechado e os estados `erro`, `ausente`, `naoSegue` do `Indicador`: continuam distintos, sem herdar 28 px. Teste na Task 2.
5. "Personalizar" ligado em `/dashboard`: a barra continua logo abaixo da abertura e o cartão arrastável mantém o raio. Testes nas Tasks 1 e 3.

---

### Task 1: Abertura e único `<h1>`

**Files:**
- Create: `src/components/shared/painel/abertura.tsx`
- Delete: `src/components/shared/painel/banner-de-boas-vindas.tsx`, `src/components/shared/painel/montanha.tsx`
- Modify: `src/lib/painel/saudacao.ts`, `src/lib/painel/saudacao.test.ts`, `src/app/globals.css` (linhas de `--banner-from`/`--banner-to` nos dois temas)
- Modify: `src/app/(app)/dashboard/page.tsx`, `general-dashboard-client.tsx`, `loading.tsx`, `pagina-do-dashboard.test.ts`
- Modify: `src/app/(app)/dashboard/financeiro/page.tsx`, `financial-dashboard-client.tsx`, `loading.tsx`, `painel-inventario.test.ts`
- Modify: `src/app/(app)/relatorios/relatorio-inventario.test.ts`, `src/components/shared/painel/painel.test.ts`

**Interfaces:**
- Produces: `dataDaAbertura(hojeIso: string): string` e `tituloDaAbertura(saudacao: string, nome: string | null): string` em `saudacao.ts`.
- Produces: `Abertura({ data, saudacao, nome, linha, acoes?, className? })`, com `data`, `saudacao` e `linha` strings, `nome: string | null`, `acoes?: React.ReactNode`.
- Produces: prop `abertura: React.ReactNode` nos dois clientes, no lugar de `banner`.

- [ ] **Step 1: Testes que falham.** Em `saudacao.test.ts`, retirar o bloco `fraseDoDia` e o teste de vocabulário das frases, e acrescentar:

```ts
expect(dataDaAbertura("2026-11-06")).toBe("Sexta-feira, 6 de novembro");
expect(dataDaAbertura("2026-03-01")).toBe("Domingo, 1 de março");
expect(tituloDaAbertura("Boa noite", "Maria da Silva")).toBe("Boa noite, Maria.");
expect(tituloDaAbertura("Bom dia", null)).toBe("Bom dia.");
expect(tituloDaAbertura("Bom dia", "   ")).toBe("Bom dia.");
```

Em `painel.test.ts`, substituir o describe "banner e montanha", o describe de tokens e o mínimo de arquivos (`>= 5` vira `>= 4`) por, sobre `semComentarios(ler("abertura.tsx"))`:
  - sem `"use client"`; imports só de `react`, `@/lib/utils`, `@/lib/painel/*`;
  - o `<h1 className="...">` contém `text-[3.375rem]`, `text-[2.375rem]`, `font-bold`, `break-words`, `text-foreground`;
  - todo `<p className="...">` contém `text-muted-on-fog`;
  - o arquivo não contém `bg-`, `text-white`, `text-primary`, `text-destructive`, `-ink`, `👋`, `Montanha`;
  - `montanha.tsx` e `banner-de-boas-vindas.tsx` não existem em disco;
  - `globals.css` não contém `--banner-from` nem `--banner-to`.

Nos testes das páginas (`pagina-do-dashboard`, `painel-inventario`), trocar `BannerDeBoasVindas` por `Abertura`, `banner` por `abertura` e acrescentar, nas duas páginas: `not.toContain("<PageHeader")`, `not.toContain("FRASES_DO_BANNER")`. Nos dois clientes: `{abertura}` aparece antes de `<PeriodToolbar` (geral) e de `id="dash-mes"` (financeiro), e o cliente não contém `<h1`. Em `relatorio-inventario.test.ts`, trocar por `Abertura`.

- [ ] **Step 2: Rodar** `npx vitest run src/lib/painel src/components/shared/painel "src/app/(app)/dashboard" "src/app/(app)/relatorios/relatorio-inventario" --testTimeout=30000`. Esperado: FAIL.

- [ ] **Step 3: Implementar.**
  - `saudacao.ts`: remover `FRASES_DO_BANNER` e `fraseDoDia`; `dataDaAbertura` usa `Date.UTC` sobre o texto e `Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })`, mantém o "-feira" e põe a inicial em maiúscula. `tituloDaAbertura` recebe o `primeiroNomeDe` movido do banner e termina em ponto.
  - `abertura.tsx`, classes literais: `section` com `aria-label="Boas-vindas"` e `flex flex-col gap-4 pt-2 sm:flex-row sm:items-end sm:justify-between sm:gap-6`; bloco de texto `min-w-0`; data `p` `text-[0.9375rem] font-semibold text-muted-on-fog`; `h1` `mt-2.5 text-[2.375rem] leading-[1.04] font-bold tracking-[-0.04em] break-words text-foreground sm:text-[3.375rem]`; linha `p` `mt-3 max-w-[46ch] text-[1.0625rem] leading-[1.45] text-muted-on-fog sm:text-[1.1875rem]`; `acoes` em `flex shrink-0 flex-wrap items-center gap-2.5`.
  - Páginas: tirar o `PageHeader` e o import dele, passar `data={dataDaAbertura(hoje)}`, manter a `linha` atual de cada tela.
  - Clientes: renomear a prop e colocar `{abertura}` como primeiro filho do contêiner.
  - `loading.tsx` das duas rotas: primeiro bloco vira `Skeleton` `h-4 w-44`, `h-14 w-80 max-w-full`, `h-5 w-96 max-w-full`, sem `<h1>`.
  - `globals.css`: apagar os quatro tokens.

- [ ] **Step 4: Rodar o mesmo comando e `npx tsc --noEmit`.** Esperado: PASS e sem erros.

- [ ] **Step 5: Commit** `feat(redesign): 09-D T1 - abertura sem caixa e h1 unico`, com o preparo das Global Constraints.

### Task 2: `Indicador`

**Files:**
- Modify: `src/components/shared/painel/indicador.tsx`
- Test: `src/components/shared/painel/painel.test.ts`, `src/lib/theme/contraste-dos-tokens.test.ts`

**Interfaces:**
- Consumes: `Card` (raio 24 da 09-B). API do `Indicador` inalterada.
- Produces: padrão de quadrado de ícone `size-10 rounded-[12px]` sem `ring`, reusado na Task 4.

- [ ] **Step 1: Testes que falham.** Em `painel.test.ts`, sobre o fonte sem comentários:
  - o `<Card className` do `Indicador` não contém `rounded-` (herda 24 px);
  - o quadrado do ícone contém `size-10` e `rounded-[12px]`, e `CHIP_POR_TOM` não contém `ring-`;
  - os dois `<p>` de número (ramo `string` e ramo `semDinheiro`) contêm `text-2xl`, `@[16.5rem]:text-[1.75rem]`, `tracking-[-0.028em]`, `tabular-nums`, `break-words`;
  - os `<p>` dos ramos `naoSegue`, `ausente` e `erro` não contêm `1.75rem` e continuam `text-sm`;
  - a linha de comparação continua com `COR_POR_SENTIDO` e `variacao.palavra`;
  - `INDICADOR_PEQUENO_NO_CELULAR` continua contendo `[&_.text-2xl]`.

  Em `contraste-dos-tokens.test.ts`, novo describe "09-D · ícone sobre fundo tingido": para os dois temas, cada `superficies(tema)` e os pares `[primary, primary]`, `[success-ink, success]`, `[destructive, destructive]`, `[chart-7, chart-7]`, compor a cor do tingimento a alfa 0,10 sobre a superfície e exigir ≥ 3:1 para o ícone (primeiro `it` anti-tautologia: os quatro tokens existem nos dois temas).

- [ ] **Step 2: Rodar** `npx vitest run src/components/shared/painel/painel.test.ts src/lib/theme/contraste-dos-tokens.test.ts --testTimeout=30000`. Esperado: FAIL nos novos.

- [ ] **Step 3: Implementar.** Quadrado `rounded-[12px]`, sem `ring-1` e sem `ring-*` no mapa. Número: `text-2xl @[16.5rem]:text-[1.75rem] leading-[1.1] font-semibold tracking-[-0.028em]`, nos dois ramos. O seletor do `INDICADOR_PEQUENO_NO_CELULAR` tem especificidade maior e continua vencendo no celular.

- [ ] **Step 4: Rodar de novo.** Esperado: PASS.

- [ ] **Step 5: Commit** `feat(redesign): 09-D T2 - indicador em vidro`.

### Task 3: `Bloco` e `CardShell`

**Files:**
- Modify: `src/components/shared/painel/bloco.tsx`, `src/components/dashboard/general/card-shell.tsx`, `src/app/(app)/dashboard/financeiro/financial-dashboard-client.tsx`
- Test: `src/components/shared/painel/painel.test.ts`

**Interfaces:**
- Produces: `Bloco` ganha `icone?: LucideIcon`. Nada mais muda na API.

- [ ] **Step 1: Testes que falham.** Sobre o fonte sem comentários:
  - `Bloco`: `<Card className` contém `rounded-[28px]`; `<h3 className` contém `text-[1.0625rem]`, `font-semibold`, `tracking-[-0.018em]`, `break-words`; o ícone só renderiza com `icone` e é `aria-hidden`; o `Link` de `verTodos` contém `text-sm`, `font-medium`, `text-primary`; o texto padrão é `"Ver tudo"`;
  - os quatro estados continuam: `Inbox`, `AlertTriangle`, `CircleSlash` e o texto "Ver sem o filtro";
  - `CardShell`: o `cn(` do `Card` contém `rounded-[28px]`, `CardTitle` contém `text-[1.0625rem]` e `tracking-[-0.018em]`, o link diz `Ver tudo` e contém `text-sm`, e `cursor-grab` continua;
  - no financeiro, cada um dos seis `<Bloco` tem `icone={`.

- [ ] **Step 2: Rodar** `npx vitest run src/components/shared/painel/painel.test.ts --testTimeout=30000`. Esperado: FAIL.

- [ ] **Step 3: Implementar.** Ícone de `size-[1.1875rem] shrink-0` à esquerda do título, com o texto em `min-w-0`. No financeiro, escolher pelo destino: `/relatorios` `BarChart3`, `/cartoes` `CreditCard`, `/faturas` `Receipt`, `/financeiro/lancamentos` `ArrowLeftRight`, `/terceiros` `Users`, e `PieChart` no bloco sem `verTodos`. Os `Bloco` de relatórios, cartões, faturas e parcelamentos ficam sem ícone até a 09-F. Trocar `p-5` do `CardContent` da linha ~780 por `p-[19px]` e o quadrado da linha ~801 para `rounded-[12px]` sem `ring-*`. Procurar "Ver mais" nos testes antes de trocar o rótulo.

- [ ] **Step 4: Rodar de novo e `npx tsc --noEmit`.** Esperado: PASS.

- [ ] **Step 5: Commit** `feat(redesign): 09-D T3 - bloco e moldura do dashboard em vidro`.

### Task 4: `StatCard` e `PageHeader`

**Files:**
- Modify: `src/components/shared/stat-card.tsx`, `src/components/shared/page-header.tsx`
- Test: `src/components/shared/painel/painel.test.ts`

**Interfaces:**
- Consumes: padrão de quadrado da Task 2. APIs inalteradas.

- [ ] **Step 1: Testes que falham.** Sobre o fonte sem comentários:
  - `StatCard`: `CardContent` contém `p-[15px]` e `sm:p-[19px]` e não contém `p-4` nem `sm:p-5`; quadrado com `size-10` e `rounded-[12px]`, sem `ring-`; não contém `emerald`; contém `text-success-ink`; número continua `text-2xl` e `tabular-nums`;
  - `PageHeader`: `<h1 className` contém `text-[1.625rem]`, `sm:text-[2rem]`, `font-bold`, `tracking-[-0.03em]`, `break-words`; a descrição continua `text-muted-on-fog`; o bloco de props continua `title`, `description`, `children`, `className`.

- [ ] **Step 2: Rodar** `npx vitest run src/components/shared/painel/painel.test.ts --testTimeout=30000`. Esperado: FAIL.

- [ ] **Step 3: Implementar** as classes acima. Só a seta `up` troca de cor (`text-emerald-500` para `text-success-ink`).

- [ ] **Step 4: Rodar de novo.** Esperado: PASS.

- [ ] **Step 5: Commit** `feat(redesign): 09-D T4 - statcard e pageheader em vidro`.

### Task 5: Verificação, conferência visual e documentos

**Files:**
- Modify: `docs/redesign/VIDRO-MEDICOES.md`, `docs/redesign/REFERENCIA-VISUAL.md` (§2.1 e a linha da montanha ~233), `docs/redesign/TOKENS.md` (saída de `--banner-*`, escala das peças)

- [ ] **Step 1:** rodar os cinco comandos e o script de três casas do scratchpad; comparar as 71 rotas com `bundle-base-09d.txt`. Esperado: nenhuma acima de +1,000 KB.
- [ ] **Step 2:** com o dono trazendo a janela à frente e confirmando o login, servidor de produção e harness em 390, 768, 1280 e 1440 px, claro e escuro: `/dashboard` e `/dashboard/financeiro` inteiros, `/financeiro/lancamentos`, `/treinos`, `/configuracoes`, sidebar normal e recolhida a 1280 px.
- [ ] **Step 3:** medir o degrau de `16.5rem` com o dado real a 1280 e 1440 px: nenhum número quebra no meio. Se quebrar, subir o degrau, registrar, e voltar à Task 2 num commit de correção.
- [ ] **Step 4:** contar `h1` por rota por script no iframe (esperado 1 no dashboard e no financeiro) e conferir Review Focus 2, 3, 4 e 5.
- [ ] **Step 5:** amostrador, 3 rodadas por 2 temas nas duas telas, com `document.hasFocus()` e screenshot antes. Simular reduzir transparência e movimento e dizer que foi simulado. Restaurar os cookies `yuri:sidebar-collapsed` e `yuri:sidebar-hidden` para `false`.
- [ ] **Step 6:** atualizar os três documentos, sem valor em R$ nem nome. Commit `docs(redesign): 09-D medicoes e tokens das pecas`.
