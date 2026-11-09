# REDESIGN-09-B — Vidro: primitivas de `src/components/ui/` · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vestir as primitivas de `src/components/ui/` com os materiais da 09-A (cartão, ladrilho, pílula e sobreposição), com pressão em mola, sem mudar a altura de nenhum controle e sem que nenhum chamador perca a sobrescrita que já faz.

**Architecture:** Os materiais das primitivas que **têm** chamadores sobrescrevendo fundo, borda, raio ou sombra (`Card`, `Button`, `Input`, `SelectTrigger`, `Badge`) são escritos com classes que o `twMerge` conhece, reunidas em constantes puras de `src/components/ui/materiais.ts`. As `@utility` da 09-A (`vidro-*`, `ladrilho`) são desconhecidas do `twMerge` (a classe do chamador não as remove, e a ordem no CSS decide); por isso só entram onde a varredura prova que nenhum chamador sobrescreve: `DialogContent`, `SheetContent`, `PopoverContent`, `DropdownMenuContent`, `SelectContent`, `TooltipContent`. A prova é por teste: `cn(MATERIAL, "<sobrescrita>")` remove a classe do material.

**Tech Stack:** Next.js 16, Tailwind v4 (`@theme inline`, `@utility`), `tailwind-merge` 3, `class-variance-authority`, Radix (`radix-ui`), `sonner`, Vitest (ambiente `node`, prova por varredura de fonte e por chamada direta de `cva`/`cn`).

**Spec:** `docs/superpowers/specs/2026-11-07-redesign-09-vidro-design.md` — §6.2 (materiais), §6.5 (forma), §6.6 (movimento), §6.7 (primitivas), §6.11 (desempenho), §6.12 (acessibilidade), §7 (linha da 09-B). Prévia, **fora do git**: `C:/Users/Yuri/Documents/Desenvolvedor/yuri.app.pessoal/docs/redesign/referencias/previa-vidro/Componentes.dc.html` (valores de botão, seletor, interruptor, campo e etiqueta). Tokens e utilitárias: plano da 09-A, Tasks 2 e 3.

## Global Constraints

- Worktree `C:/tmp/09-vidro`, branch `feat/redesign-09-vidro`. Nunca checkout no diretório principal.
- **D67:** sem push, sem PR, sem merge em `main`, sem deploy. Commits só locais.
- Nenhuma migration, nenhuma dependência nova, nenhuma regra de negócio, nenhuma Server Action.
- Não editar `CLAUDE.md`, `AGENTS.md`, `docs/redesign/STATUS.md`.
- Antes de cada commit: `sed -i 's/\r$//' <arquivos alterados>`, `git checkout -- AGENTS.md`, `git diff --stat` + revisão atrás de segredo.
- Commits em pt-BR, prefixo `feat(redesign): 09-B Tn -`, rodapé `Co-Authored-By:` com o modelo que de fato escreveu o commit (regra do ledger da 09-A).
- Repositório público: nenhum valor em R$, nome de pessoa, banco ou categoria em teste, doc ou print versionado. Prints só no scratchpad.
- **Alturas não mudam** em `Button`, `Input`, `SelectTrigger`, `Badge` (spec §6.7; 222 arquivos usam `Button`). `Switch` e `TabsList` mudam de tamanho porque o spec pede.
- `DIVIDA_NA_NEVOA` (15 itens, dona: 09-C) **não muda**. Nenhum uso novo de `text-primary`, `text-destructive` ou `text-*-ink` direto sobre a névoa.
- Se um par de contraste falhar: primeiro baixe o alfa do **tingimento** (ex.: `bg-destructive/10` → `/8`) ou da névoa; nunca escureça o texto. Se for preciso apagar a névoa, **parar e perguntar ao dono**.
- Primitiva entra em todas as rotas: nenhum import novo além de `@/lib/utils` e do que o arquivo já importa. `materiais.ts` tem **zero imports**.
- Orçamento: nenhuma rota sobe mais de **1 KB gz** em relação a `bundle-antes-09b.txt` (scratchpad) sem aprovação do dono.
- `prefers-reduced-motion: reduce` desliga escala de pressão, estiramento do interruptor e o estalo do visto (`motion-reduce:`).
- Fora do escopo: casca (09-C), painel e `PageHeader` (09-D), gráficos (09-E), módulos (09-F), barra inferior (09-G). Achado fora do escopo vai para `VIDRO-MEDICOES.md`, não é corrigido.

## Review Focus

1. **Chamador que sobrescreve o material** (`<Card className="border-primary/30 bg-primary/5">`, `<Input className="border-0 bg-transparent shadow-none ring-0">`): a sobrescrita continua vencendo. → `materiais.test.ts`, Task 2, e as varreduras das Tasks 3–5.
2. **Texto dentro de campo, pílula ou aba sobre um cartão no centro de uma mancha** (o pior ponto): `foreground`, `muted-foreground` e o texto da variante passam 4,5:1 nos dois temas. → `contraste-dos-tokens.test.ts`, Task 1.
3. **Menu ou diálogo aberto sobre conteúdo escuro no tema claro** (ou o contrário): o `--glass-strong` translúcido continua legível sobre qualquer fundo. → mesmo teste, superfícies extremas `#000000`/`#ffffff`, Task 1.
4. **Reduzir transparência ligado**: campo, pílula, rodapé de gaveta e sobreposição ficam sólidos e **ainda distinguíveis do cartão**. → Task 1 (tokens) e Task 6 (rodapés).
5. **Botão que abre menu** (`aria-haspopup`) e **reduzir movimento**: não afunda. → `primitivas.test.ts`, Task 3.

---

### Task 0: Portão e linha de base (feita antes do plano)

- [x] `git merge-base --is-ancestor 690cfaa HEAD` → `ok`; árvore limpa; `git merge --no-ff origin/main` sem conflito (PR #66).
- [x] `npm ci` + os cinco verdes: **8.347 testes / 371 arquivos**, lint e `tsc` limpos, build ok, mediana **203,0 KB**, 71 rotas.
- [x] Lista completa das 71 rotas em `<scratchpad>/bundle-antes-09b.txt` (cópia do `bundle-budget.mjs` sem o `slice(0, 10)`, apagada depois).

---

### Task 1: Tokens sólidos e contraste das superfícies das primitivas

**Files:**
- Modify: `src/app/globals.css` (`:root`, `.dark`, `@theme inline`, bloco `prefers-reduced-transparency` dos tokens, `@utility ladrilho`)
- Modify: `src/lib/theme/tokens.test.ts`, `src/lib/theme/contraste-dos-tokens.test.ts`, `src/lib/theme/vidro.test.ts`

**Interfaces:**
- Produces (tokens em `:root` e `.dark`): `--tile-solid` = `compor(--tile, --glass-solid)` (claro `#fafbfc`, escuro `#1e2128` — o executor confere o valor que `compor` devolve e grava esse); `--popover-solid` = `compor(--glass-strong, --fog-base)` (claro ≈ `#fefeff`, escuro ≈ `#252933`, idem).
- Produces (`@theme inline`): `--color-tile-solid`, `--color-popover-solid`, `--shadow-vidro: inset 0 1px 0 var(--glass-hi), inset 0 -1px 0 var(--glass-lo), var(--glass-shadow)`.
- Produces (reduzir transparência, no bloco de tokens já existente): `--tile: var(--tile-solid)`, `--pill: var(--glass-solid)`, `--popover-solid: var(--glass-solid)`. `@utility ladrilho` passa a usar `var(--tile-solid)` (não `--glass-solid`): **decisão do item "sólido do ladrilho"** — o campo continua 1 degrau mais claro que o cartão em que está.

- [ ] **Step 1: Testes que falham**
  - `tokens.test.ts`: `--tile-solid` e `--popover-solid` existem nos dois temas; `compor(tile, glass-solid) === tile-solid` e `compor(glass-strong, fog-base) === popover-solid` nos dois temas; o bloco `prefers-reduced-transparency` dos tokens redefine `--tile`, `--pill` e `--popover-solid`; `--shadow-vidro` registrado.
  - `vidro.test.ts`: o `@media (prefers-reduced-transparency)` de `ladrilho` usa `var(--tile-solid)`; `tile-solid !== glass-solid` nos dois temas.
  - `contraste-dos-tokens.test.ts`, por tema, com `vidros` = as superfícies de vidro que o teste já monta (sólido + `compor(glass, compor(fog-k, fog-base))`):
    - **ladrilho**: `compor(tile, v)` para cada `v` de `vidros` → `foreground`, `muted-foreground` ≥ 4,5;
    - **pílula**: `compor(pill, v)` e `compor(pill-strong, v)` → `foreground` ≥ 4,5;
    - **trilho do seletor**: `compor(track, v)` → `muted-foreground` ≥ 4,5 (aba inativa); `compor(pill-strong, compor(track, v))` → `foreground` ≥ 4,5 (aba ativa);
    - **perigo tingido**: `compor("rgba(<destructive>, 0.10)", v)` → `destructive` ≥ 4,5 (botão `destructive`);
    - **sobreposição**: `compor(glass-strong, s)` para `s` ∈ `vidros` ∪ `{ "#000000", "#ffffff" }` → `foreground`, `muted-foreground`, `primary`, `destructive`, `accent-foreground` sobre `accent` ≥ 4,5;
    - mensagem: `"<tema> · <texto> sobre <material> em <superfície>: X:1 < 4,5:1 — baixe o alfa do tingimento ou da névoa antes de escurecer o texto"`.
- [ ] **Step 2:** `npx vitest run src/lib/theme` → FAIL.
- [ ] **Step 3:** Implementar. Se um par de sobreposição falhar sobre `#000000`/`#ffffff`, subir o alfa de `--glass-strong` (até 0,96) e anotar aqui.
- [ ] **Step 4:** `npx vitest run src/lib/theme` → PASS; `npx vitest run` inteiro → verde.
- [ ] **Step 5:** Commit `feat(redesign): 09-B T1 - tokens solidos e contraste das superficies das primitivas`.

---

### Task 2: Os materiais das primitivas como classes que o `twMerge` conhece

**Files:**
- Create: `src/components/ui/materiais.ts`
- Test: `src/components/ui/materiais.test.ts`

**Interfaces:**
- Consumes: `--shadow-vidro`, `--color-tile`, `--color-tile-border`, `--color-pill`, `--color-pill-strong`, `--color-glass-border` (Task 1 e 09-A).
- Produces (strings, **zero imports**):
  - `MATERIAL_CARTAO` — `bg-card` + brilho superior como imagem de fundo (`bg-[linear-gradient(180deg,var(--glass-sheen),transparent_42%)]`) + `border border-glass-border` + sombra `--shadow-vidro` (na forma que o `twMerge` classifica como sombra).
  - `MATERIAL_LADRILHO` — `bg-tile border border-tile-border shadow-[inset_0_1px_2px_rgba(16,24,40,0.06)]`.
  - `MATERIAL_PILULA` — `bg-pill border border-glass-border` + sombra `inset 0 1px 0 var(--glass-hi), 0 4px 12px -6px rgba(16,24,40,.25)`. Sem `backdrop-filter` (decisão: botão dentro de diálogo seria vidro desfocado sobre vidro desfocado, antiobjetivo §5).
  - `PRESSAO` — `transition-[transform,background-color,box-shadow,filter] duration-500 ease-mola active:scale-[.96] active:duration-120 motion-reduce:transition-none motion-reduce:active:scale-100`.

- [ ] **Step 1: Testes que falham** (`cn` de `@/lib/utils`):
  - `cn(MATERIAL_CARTAO, "bg-transparent bg-none")` não contém `bg-card` nem `linear-gradient`;
  - `cn(MATERIAL_CARTAO, "border-primary/30")` não contém `border-glass-border`;
  - `cn(MATERIAL_CARTAO, "shadow-none")` não contém a sombra do material;
  - `cn(MATERIAL_LADRILHO, "border-0 bg-transparent shadow-none")` contém só as três sobrescritas;
  - `cn(MATERIAL_PILULA, "bg-primary-fill")` não contém `bg-pill`;
  - nenhuma das quatro constantes contém `vidro-`, `ladrilho` (a utilitária), `backdrop-` ou `rounded`;
  - o arquivo não tem `import`.
- [ ] **Step 2:** `npx vitest run src/components/ui/materiais.test.ts` → FAIL.
- [ ] **Step 3:** Implementar. Se o `twMerge` não classificar a sombra pelo nome do token, usar a forma arbitrária `shadow-[...]` com o valor escrito.
- [ ] **Step 4:** Rodar → PASS. Conferir com `npx @tailwindcss/cli` (ou `@tailwindcss/node`) que as quatro geram CSS (classe arbitrária com `var()` dentro de `linear-gradient` compila).
- [ ] **Step 5:** Commit `feat(redesign): 09-B T2 - materiais das primitivas como classes mesclaveis`.

---

### Task 3: `Button` em pílula com mola

**Files:**
- Modify: `src/components/ui/button.tsx`
- Modify: `src/components/shared/seletor-de-visao.tsx:69` (`bg-primary` → `bg-primary-fill text-primary-fill-foreground`)
- Test: `src/components/ui/primitivas.test.ts` (novo; chama `buttonVariants` direto — `cva` roda em `node`)

**Interfaces:**
- Consumes: `MATERIAL_PILULA`, `PRESSAO` (Task 2).
- Produces (`buttonVariants`, mesmas variantes e tamanhos, mesmas alturas):
  - base: `rounded-full`; `PRESSAO` só em `not-aria-[haspopup]:` (o `active:` atual já tem esse filtro); `active:translate-y-px` **sai**; foco = `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring` no lugar de `ring-3 ring-ring/50`; os `rounded-[min(var(--radius-md),…)]` de `xs`/`sm`/`icon-xs`/`icon-sm` **saem** (todo tamanho é pílula).
  - `default`: `bg-primary-fill text-primary-fill-foreground` + brilho (`bg-[linear-gradient(180deg,rgba(255,255,255,.24),transparent_55%)]`) + `shadow-[inset_0_1px_0_rgba(255,255,255,.35),0_8px_18px_-8px_color-mix(in_oklch,var(--primary-fill)_70%,transparent)]` + `hover:brightness-110`.
  - `outline` e `secondary`: `MATERIAL_PILULA text-foreground hover:bg-pill-strong`.
  - `ghost`: texto **inalterado** (é o botão de ícone do app inteiro; pintar de azul mudaria centenas de telas), `hover:bg-primary/10 hover:text-foreground`.
  - `destructive`: `bg-destructive/10 text-destructive hover:bg-destructive/15` (o alfa é o que a Task 1 validou).
  - `link`: igual.

- [ ] **Step 1: Testes que falham** em `primitivas.test.ts`:
  - `buttonVariants()` contém `rounded-full`, `bg-primary-fill`, `text-primary-fill-foreground`, `ease-mola`, `motion-reduce:`; não contém `translate-y-px`, `bg-primary ` nem `bg-primary/`;
  - a classe de escala está sob `aria-[haspopup]` negado (regex `not-aria-\[haspopup\]:active:scale`);
  - para cada `size`, `buttonVariants({ size })` contém a mesma altura de hoje (`h-8`, `h-6`, `h-7`, `h-9`, `size-8`, `size-6`, `size-7`, `size-9`) e não contém `rounded-[`;
  - `buttonVariants({ variant: "outline" })` e `"secondary"` contêm `bg-pill`.
- [ ] **Step 2:** Rodar → FAIL. **Step 3:** Implementar. **Step 4:** Rodar → PASS.
- [ ] **Step 5: Varredura de chamadores:** `rg -n "<Button[^>]*className=\"[^\"]*(rounded-|bg-|shadow-)" src --include=*.tsx` e as formas com `cn(`. Hoje: `user-menu.tsx:45` (`rounded-full`, mantém) e `seletor-de-visao.tsx:69` (troca). Todo `bg-primary` sobre `Button` vira `bg-primary-fill text-primary-fill-foreground`.
- [ ] **Step 6:** Commit `feat(redesign): 09-B T3 - botao em pilula com mola`.

---

### Task 4: `Card` em vidro de cartão

**Files:**
- Modify: `src/components/ui/card.tsx`
- Modify (só os que a varredura acusar): `src/app/(app)/faturas/statements-client.tsx:434`, `src/app/(app)/terceiros/terceiros-client.tsx:353`
- Test: `src/components/ui/primitivas.test.ts`

**Interfaces:**
- Consumes: `MATERIAL_CARTAO`.
- Produces: `Card` = `MATERIAL_CARTAO` + `rounded-[24px]` (`data-[size=sm]:rounded-[20px]`); sai `ring-1 ring-foreground/10` (a borda de luz substitui). `CardHeader`, `CardFooter` e as imagens usam `rounded-t-[inherit]`/`rounded-b-[inherit]` (concêntrico sem número repetido). `CardFooter`: `bg-muted/50` → `bg-tile`, `border-t` → `border-t border-glass-border`.

- [ ] **Step 1: Testes que falham** (varredura de `card.tsx` sem comentários): o `cn(` de `Card` contém `MATERIAL_CARTAO` e `rounded-[24px]`; não contém `ring-1`, `rounded-xl` nem `vidro-`; `CardHeader`/`CardFooter` não contêm `rounded-t-xl`/`rounded-b-xl`.
- [ ] **Step 2:** Teste de chamadores (em `primitivas.test.ts`): nenhum `<Card` em `src/**/*.tsx` com `bg-transparent` sem `bg-none` (senão o brilho do material aparece num cartão que quer ser invisível). Esperado: FAIL listando os 2 arquivos acima.
- [ ] **Step 3:** Rodar → FAIL. **Step 4:** Implementar e acrescentar `bg-none` nos 2 chamadores. **Step 5:** Rodar → PASS.
- [ ] **Step 6:** Commit `feat(redesign): 09-B T4 - cartao em vidro com borda de luz`.

---

### Task 5: Campos em ladrilho (`Input`, `Textarea`, `SelectTrigger`)

**Files:**
- Modify: `src/components/ui/input.tsx`, `src/components/ui/textarea.tsx`, `src/components/ui/select.tsx` (só `SelectTrigger`)
- Test: `src/components/ui/primitivas.test.ts`

**Interfaces:**
- Consumes: `MATERIAL_LADRILHO`.
- Produces:
  - Raio por **proporção da prévia**, não pelo número absoluto: a prévia tem campo de 44 px com raio 14 (0,32 da altura). Mantida a altura de 32 px, `Input` e `SelectTrigger` (`h-8`) ficam com `rounded-[10px]`; `SelectTrigger` `size=sm` (`h-7`) com `rounded-[9px]`; `Textarea` com `rounded-[14px]`. (Decisão do plano; o spec pede 14–16 px, que numa caixa de 32 px é quase pílula — exatamente o defeito anotado na 09-A.)
  - Fundo/borda: `MATERIAL_LADRILHO` no lugar de `border-input bg-transparent` e de `dark:bg-input/30` (e o `dark:hover:bg-input/50` do gatilho vira `hover:bg-pill`).
  - Foco: `focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/20` (anel de 1 px da borda + halo de 4 px; spec §6.7). `aria-invalid` mantém a cor destrutiva.
- [ ] **Step 1: Testes que falham:** os três contêm `MATERIAL_LADRILHO` (por import ou string), o raio acima e `ring-4`; não contêm `rounded-lg`, `bg-transparent` nem `dark:bg-input`. As alturas `h-8`/`min-h-16`/`data-[size=default]:h-8`/`data-[size=sm]:h-7` continuam.
- [ ] **Step 2:** Rodar → FAIL. **Step 3:** Implementar. **Step 4:** Rodar → PASS.
- [ ] **Step 5: Chamadores:** `quick-task-input.tsx:188` (`border-0 bg-transparent shadow-none ring-0`) e `import-review.tsx:1121` (`rounded-full border-0 ring-1 ring-border`) continuam vencendo — provado pela Task 2; conferir no harness da Task 9.
- [ ] **Step 6:** Commit `feat(redesign): 09-B T5 - campos em ladrilho`.

---

### Task 6: Sobreposições em vidro e rodapés de gaveta

**Files:**
- Modify: `src/components/ui/dialog.tsx`, `sheet.tsx`, `popover.tsx`, `dropdown-menu.tsx`, `select.tsx` (`SelectContent`, `SelectItem`, botões de rolagem), `tooltip.tsx`, `sonner.tsx`
- Modify: `src/components/todo/task-detail-sheet.tsx:493`, `src/components/training/workout-exercise-sheet.tsx:801`, `src/components/ai/chat-client.tsx:861`
- Test: `src/components/ui/primitivas.test.ts`, `src/components/ui/sheet-largura.test.ts` (só se a largura mudar — não deve)

**Interfaces:**
- Produces:
  - Conteúdo de `Dialog`, `Sheet`, `Popover`, `DropdownMenu` (e `SubContent`), `SelectContent`, `Tooltip`: `vidro-sobreposicao`, sem `bg-popover`, sem `ring-1 ring-foreground/10`, sem `shadow-md`/`shadow-lg` (a utilitária traz borda e sombra).
  - Raios: `DialogContent` `rounded-[28px]` (e `DialogFooter` `rounded-b-[inherit] bg-tile`); `Sheet` arredondada só na borda exposta (`data-[side=right]:rounded-l-[28px]`, `left:rounded-r-`, `bottom:rounded-t-`, `top:rounded-b-`); menus e `SelectContent` `rounded-[18px]` com `p-1.5`, itens `rounded-[12px]` (18 − 6, concêntrico); `Tooltip` `rounded-[10px]`, texto `text-popover-foreground` (deixa de ser invertido), seta com `bg-popover-solid fill-popover-solid`.
  - Véu de `Dialog` e `Sheet`: `bg-black/20 dark:bg-black/45`, **sem** `backdrop-blur-xs` (decisão: o véu desfocado atrás de um painel que também desfoca é vidro sobre vidro, §5, e é o desfoque mais caro da tela).
  - `sonner`: `--normal-bg: var(--popover)`, `--normal-border: var(--glass-border)`, `--border-radius: 20px`; `toastOptions.classNames.toast` ganha `backdrop-blur-[24px] backdrop-saturate-160 shadow-(--shadow-vidro)` (o `sonner` não define `backdrop-filter`, então não há conflito).
  - Rodapés `sticky bottom-0 … bg-background` nas 3 gavetas → `bg-popover-solid` (opaco, da cor efetiva da gaveta; em reduzir transparência vira `--glass-solid`, igual à gaveta).
- [ ] **Step 1: Testes que falham:**
  - cada conteúdo listado contém `vidro-sobreposicao` e não contém `bg-popover` nem `ring-foreground/10`;
  - nenhum arquivo de `src/components/ui/` contém `backdrop-blur-xs`;
  - `tooltip.tsx` não contém `bg-foreground`;
  - varredura de `src/**/*.tsx`: nenhuma `className` com `sticky` e `bottom-0` contém `bg-background` (hoje: os 3 acima);
  - nenhum chamador passa `className` com `bg-`/`rounded-`/`shadow-`/`ring-` para os conteúdos com `vidro-sobreposicao` **exceto** `gaveta-de-registros-impl.tsx` (`rounded-t-2xl`, da 09-D) — lista fixa no teste: chamador novo com sobrescrita reprova, porque o `twMerge` não o protegeria.
- [ ] **Step 2:** Rodar → FAIL. **Step 3:** Implementar. **Step 4:** Rodar → PASS.
- [ ] **Step 5:** Conferir no CSS do build que `.vidro-sobreposicao` sai com `-webkit-backdrop-filter` **e** `backdrop-filter` (regra da 09-A) e que o `toast` do `sonner` também.
- [ ] **Step 6:** Commit `feat(redesign): 09-B T6 - sobreposicoes em vidro e rodapes opacos nas gavetas`.

---

### Task 7: Controles (`Switch`, `Checkbox`, `Tabs`, `Badge`, `Skeleton`, `Separator`)

**Files:**
- Modify: `src/components/ui/switch.tsx`, `checkbox.tsx`, `tabs.tsx`, `badge.tsx`, `skeleton.tsx`, `separator.tsx`
- Test: `src/components/ui/primitivas.test.ts`

**Interfaces:**
- Produces:
  - `Switch`: trilho `h-8 w-[52px] p-0.5 rounded-full`, desligado `bg-[color-mix(in_oklch,var(--foreground)_16%,transparent)]`, ligado `bg-primary-fill`; botão `size-7 bg-white shadow-[0_2px_6px_rgba(0,0,0,.25)]`, `data-[state=checked]:translate-x-5`, estica ao pressionar (`group-active:w-[34px]`, e ligado `group-active:translate-x-[14px]`), `transition-[transform,width] duration-450 ease-mola`, `motion-reduce:transition-none`. Foco: o mesmo `outline` do `Button`.
  - `Checkbox`: continua quadrada, `rounded-[6px]`; desligada `bg-tile`; ligada `bg-primary-fill border-primary-fill text-primary-fill-foreground`; o visto entra com `data-[state=checked]:animate-in zoom-in-50 duration-300 ease-estalo` e `motion-reduce:animate-none`.
  - `TabsList` (`default`): `h-9 rounded-full bg-track border border-tile-border p-[3px]`; `TabsTrigger`: `rounded-full text-muted-foreground`, ativo `bg-pill-strong text-foreground shadow-[0_1px_3px_rgba(16,24,40,.14),inset_0_1px_0_var(--glass-hi)]`, pressão `active:scale-[.96]` com `ease-mola` e `motion-reduce:`. Variante `line` sem mudança além de tirar `rounded-md`.
  - `Badge`: `rounded-full` (era `rounded-4xl`, que com `--radius: 1rem` virou 41 px); `default` → `bg-primary-fill text-primary-fill-foreground`; altura `h-5` mantida. "Ícone **e** palavra" é dos chamadores (09-F), não da primitiva.
  - `Skeleton`: `bg-track rounded-[10px] animate-pulse motion-reduce:animate-none` (o `bg-muted` opaco destoava do vidro; `--track` é o tom do ladrilho sobre vidro). Os 152 chamadores com `rounded-*` ficam como estão (09-F).
  - `Separator`: `bg-grid`.
- [ ] **Step 1: Testes que falham** com as classes acima (presença e ausência: `bg-primary` sem `-fill` em nenhum dos seis, `rounded-4xl` fora de `badge.tsx`, `bg-muted` fora de `skeleton.tsx`, `bg-border` fora de `separator.tsx`, `h-5 w-9` fora de `switch.tsx`).
- [ ] **Step 2:** Rodar → FAIL. **Step 3:** Implementar. **Step 4:** Rodar → PASS.
- [ ] **Step 5:** Commit `feat(redesign): 09-B T7 - interruptor, caixa, abas, etiqueta e esqueleto`.

---

### Task 8: Fonte no `global-error` e documentos

**Files:**
- Create: `src/app/fonts.ts` (exporta `inter`, a mesma chamada `Inter({ subsets: ["latin"], display: "swap", preload: false, variable: "--font-inter" })`)
- Modify: `src/app/layout.tsx` (importa de `./fonts`), `src/app/global-error.tsx` (`<html lang="pt-BR" className={inter.variable}>`)
- Modify: `src/lib/theme/tokens.test.ts` (o teste da fonte da 09-A passa a ler `fonts.ts`; novo: `global-error.tsx` importa `inter` e o põe na `className` do `<html>`; e o minor da 09-A: `layout.tsx` põe `inter.variable` na `className` do `<html>`)
- Modify: `docs/redesign/TOKENS.md` §2 (superfícies: `--card` é vidro, `--glass-solid` é a medida), §5 (bloco CSS com os `-ink` da 09-A, não os da 01-B), §6 (materiais e primitivas: tabela da 09-B)

- [ ] **Step 1:** Testes que falham. **Step 2:** FAIL. **Step 3:** Implementar. **Step 4:** PASS.
- [ ] **Step 5:** `npm run build` e conferir que `/_global-error` continua sem JS novo relevante (≤ +1 KB) e que nenhum HTML ganhou `<link rel="preload" … font>`.
- [ ] **Step 6:** Commit `feat(redesign): 09-B T8 - inter no global-error e tokens documentados`.

---

### Task 9: Conferência visual, medição e registro

**Files:**
- Modify: `docs/redesign/VIDRO-MEDICOES.md` (seção "09-B")

- [ ] **Step 1:** Os cinco verdes (`npm run test:run -- --testTimeout=30000`, `npm run lint`, `npx tsc --noEmit`, `npm run build`, `npm run perf:bundle`). Anotar a contagem de testes.
- [ ] **Step 2:** Lista completa das 71 rotas (mesmo método da Task 0) comparada linha a linha com `bundle-antes-09b.txt`. Aceite: nenhuma rota sobe mais de 1 KB gz.
- [ ] **Step 3:** `npm run start -- -H 0.0.0.0` (produção; nunca `next dev`). **Pedir ao dono para trazer a janela do Chrome à frente.** Harness de iframes em 390/768/1280/1440 px × claro/escuro (tema forçado pela classe do `<html>` do iframe): `/dashboard`, `/financeiro/lancamentos` com "Novo lançamento" aberto, `/todo`, `/configuracoes` (interruptores, abas, campos), gaveta de detalhe de tarefa do TO-DO (rodapé opaco rolando), um menu e um `Select` abertos, um aviso do `sonner`. Conferir também: reduzir transparência e reduzir movimento emulados (DevTools/CDP) numa largura.
- [ ] **Step 4:** `/login` em Chrome headless sem sessão (campos e botão novos; o resto do login é da 09-C).
- [ ] **Step 5:** Amostrador de quadros da 09-A em `/dashboard` e `/dashboard/financeiro`, 3 rodadas × 2 temas. Aceite: nenhum quadro acima de 50 ms (padrão por repetição, como na 09-A).
- [ ] **Step 6:** `VIDRO-MEDICOES.md`: seção 09-B com bundle antes/depois (só as rotas que mudaram + mediana), a tabela do amostrador, o que a conferência mostrou e a lista do que ficou para 09-C+ (sem valor em R$, sem print). Commit `docs(redesign): 09-B T9 - medicoes e conferencia das primitivas`.
- [ ] **Step 7:** Relatório ao dono: o que mudou por primitiva, números antes/depois, o que ficou para a 09-C em diante, o que não deu para verificar, decisões tomadas. **Parar** (o plano da 09-C vem a pedido do dono).
