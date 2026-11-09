# REDESIGN-09-A — Vidro: tokens, névoa, materiais, raio e fonte · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Assentar a base do visual em vidro: tokens de cor medidos, a névoa de fundo, os quatro materiais como utilitárias, o raio maior e a fonte nova. Ao fim desta subfase, o app inteiro já roda sobre a névoa, sem mudar nenhuma primitiva além do que os tokens alcançam.

**Architecture:** Tudo nasce em `src/app/globals.css` (tokens em `:root`/`.dark`, registro em `@theme inline`, utilitárias com `@utility`) e em `src/app/layout.tsx` (Inter por `next/font`). O contraste deixa de ser medido à mão: uma função pura (`src/lib/theme/contraste.ts`) compõe as cores translúcidas sobre a névoa, e um teste lê os tokens do CSS e reprova qualquer par de texto abaixo de 4,5:1, inclusive no centro de cada mancha.

**Tech Stack:** Next.js 16, Tailwind v4 (CSS-first, `@utility`, `@theme inline`), `next/font/google`, Vitest (ambiente `node`, prova por varredura de fonte).

**Spec:** `docs/superpowers/specs/2026-11-07-redesign-09-vidro-design.md` (aprovado pelo dono em 2026-11-07). Leia-o inteiro antes da Task 0. Prévia visual, **fora do git**:
`C:/Users/Yuri/Documents/Desenvolvedor/yuri.app.pessoal/docs/redesign/referencias/previa-vidro/` (`Main.dc.html`, `Celular.dc.html`, `Componentes.dc.html`).

## Roteiro da REDESIGN-09 (cada subfase ganha plano próprio ao começar)

| Subfase | Plano | Depende de |
| --- | --- | --- |
| **09-A** tokens, névoa, materiais, raio, fonte | **este arquivo** | integração das correções da 08 |
| 09-B primitivas de `src/components/ui/` | escrito no início da 09-B | 09-A (nomes de token e de utilitária abaixo) |
| 09-C casca (sidebar, header, menu do celular, assistente, login) + `themeColor` sincronizado com o tema escolhido (o app usa `enableSystem={false}`, então `media` não serve) | idem | 09-B |
| 09-D peças do painel e `PageHeader` | idem | 09-B |
| 09-E gráficos | idem | 09-A |
| 09-F varredura dos módulos + conferência de todas as rotas | idem | 09-B a 09-E |
| 09-G barra de ações do celular | idem | 09-C |
| depois: regressão e entrega da 08 | o desenho da 08 | 09-G |

Os planos seguintes consomem o bloco **Interfaces** das Tasks 1, 2 e 3. Os nomes não mudam depois desta subfase.

## Global Constraints

- Worktree `C:/tmp/09-vidro`, branch `feat/redesign-09-vidro`. Nunca fazer checkout no diretório principal.
- **D67:** sem push, sem PR, sem merge em `main`, sem deploy. Commits locais.
- **Nenhuma migration**, nenhuma regra de negócio, nenhuma Server Action, nenhuma consulta.
- **Nenhuma dependência nova** no `package.json`. `next/font` já vem com o `next`.
- Antes de cada commit: `sed -i 's/\r$//' <arquivos alterados>`, `git checkout -- AGENTS.md`, `git diff --stat` e revisão do diff atrás de segredo (`.env`, chave, `service_role`).
- Mensagens de commit em pt-BR, prefixo `feat(redesign): 09-A Tn -`, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Não editar `CLAUDE.md`, `AGENTS.md` nem `docs/redesign/STATUS.md` (o STATUS é da integração).
- Repositório público: nenhum valor em R$, nome de pessoa, banco ou categoria em teste, doc ou print versionado. A prévia nunca entra no git.
- Todo token de **texto** e de **superfície medida** fica em `#rrggbb` ou `rgba(r, g, b, a)`. Nada de `oklch` nesses tokens: é nesse formato que o teste de contraste mede.
- Os oito hexes da paleta de gráficos (`--chart-1…8`) **não mudam**.
- Os tokens `--banner-from`/`--banner-to` **continuam** nesta subfase (o `painel.test.ts` os exige; saem na 09-D).
- `ThemeProvider` mantém `disableTransitionOnChange`. A transição de cor na troca de tema (spec §6.6) **fica de fora**: sem essa opção, todo elemento com `transition-all` animaria na troca. Decisão do plano.

## Review Focus

1. **Texto no centro de uma mancha da névoa** (o pior ponto, não a média): todo par de texto passa de 4,5:1 ali, nos dois temas. Os alfas da prévia **reprovavam** (link azul a 4,02:1 e cinza a 4,48:1 sobre o vidro, no centro da mancha azul clara; verde escuro a 4,38:1). Os valores da Task 2 já passam. → `contraste-dos-tokens.test.ts`, Task 2.
2. **Barra fixa com fundo translúcido sobre conteúdo que rola** (barras de filtro de Dieta e Treinos, colunas fixas das tabelas de Cartões): sem desfoque, o conteúdo de baixo aparece através dela. → varredura, Task 5.
3. **Rosca com contorno da cor do cartão**: com o cartão translúcido, o vão entre as fatias vira uma linha tingida. → varredura, Task 5.
4. **Usuário com "reduzir transparência" ligado** no iPhone ou no macOS: todo vidro vira sólido e nenhum desfoque roda. → teste das utilitárias, Task 3.
5. **Aparelho da Apple baixando a Inter sem usar**: `preload: false` e a fonte do sistema vindo antes na pilha. → teste da fonte, Task 7.

---

### Task 0: Portão, integração e linha de base

**Files:**
- Create: `docs/redesign/VIDRO-MEDICOES.md`

- [ ] **Step 1: Portão.** O dono avisa que as correções da 08 foram integradas. Conferir:
  `git merge-base --is-ancestor feat/redesign-08-entrega feat/redesign-00-auditoria && echo ok`
  → `ok`. Sem `ok`, **parar** e avisar o dono.
- [ ] **Step 2:** `git merge --no-ff feat/redesign-00-auditoria -m "merge: 00-auditoria (com as correcoes da 08) na 09"`, depois `npm ci`.
- [ ] **Step 3: Base verde.** Rodar os cinco: `npm run test:run -- --testTimeout=30000`, `npm run lint`, `npx tsc --noEmit`, `npm run build`, `npm run perf:bundle`. Anotar a contagem de testes e a tabela de KB por rota.
- [ ] **Step 4: Medição "antes" no desktop.** `npm run start -- -H 0.0.0.0` (servidor de produção local, não o `dev`). No Chrome do dono (extensão Claude in Chrome), em `/dashboard` e em `/financeiro`, rodar pelo `javascript_tool` um amostrador que rola a página por 5 s com `requestAnimationFrame` e grava o intervalo de cada quadro. Anotar: quadros, média de fps, p95 do intervalo e o maior quadro. Cada tela, 3 vezes, nos dois temas.
- [ ] **Step 5: Medição "antes" no iPhone (é o dono quem faz).** Liberar a porta 3000 no firewall do Windows para a rede privada e passar ao dono o endereço `http://<IP-do-PC>:3000`. Ele abre no **Safari** do iPhone, na mesma Wi-Fi, rola `/dashboard` e `/financeiro` nos dois temas e diz se travou. Anotar a resposta, com as palavras dele.
- [ ] **Step 6:** Escrever `docs/redesign/VIDRO-MEDICOES.md` com: data, commit, o código do amostrador, as tabelas do Step 4, a resposta do Step 5, a contagem de testes e a tabela do `perf:bundle`. Sem valor em R$ nem print.
- [ ] **Step 7:** Commit `feat(redesign): 09-A T0 - linha de base das medicoes`.

---

### Task 1: Composição e contraste, puros

**Files:**
- Create: `src/lib/theme/contraste.ts`
- Test: `src/lib/theme/contraste.test.ts`

**Interfaces:**
- Produces:
  - `type Rgb = readonly [number, number, number]` (0–255)
  - `lerCor(css: string): { rgb: Rgb; alfa: number }` — aceita `#rrggbb` e `rgba(r, g, b, a)` (com ou sem espaços, alfa `.5` ou `0.5`); qualquer outra forma lança `Error` com a cor na mensagem.
  - `compor(cima: string, baixo: string): string` — mistura alfa de `cima` sobre `baixo` (`baixo` precisa ser opaco; se não for, lança). Devolve `#rrggbb` minúsculo, canal arredondado.
  - `contraste(texto: string, fundo: string): number` — razão WCAG 2.x entre duas cores **opacas** (lança se alguma tiver alfa < 1).

- [ ] **Step 1: Testes que falham**

```ts
it("branco sobre preto é 21:1", () => {
  expect(contraste("#ffffff", "#000000")).toBeCloseTo(21, 5);
});
it("bate com a medição do desenho", () => {
  expect(contraste("#596070", "#f3f5f9")).toBeCloseTo(5.77, 2);
  expect(contraste("#ffffff", "#1f6fe5")).toBeCloseTo(4.70, 2);
});
it("compõe vidro sobre a névoa", () => {
  expect(compor("rgba(255,255,255,.56)", "#e8ecf3")).toBe("#f5f7fa");
  expect(compor("rgba(28, 31, 40, 0.58)", "#0a0c11")).toBe("#14171e");
  expect(compor("#123456", "#ffffff")).toBe("#123456");
});
it("recusa o que não sabe medir", () => {
  expect(() => lerCor("oklch(0.5 0.1 250)")).toThrow(/oklch/);
  expect(() => contraste("rgba(0,0,0,.5)", "#ffffff")).toThrow();
  expect(() => compor("#000000", "rgba(255,255,255,.5)")).toThrow();
});
```

- [ ] **Step 2:** `npx vitest run src/lib/theme/contraste.test.ts` → FAIL (módulo inexistente).
- [ ] **Step 3:** Implementar. Luminância relativa sRGB padrão (limiar `0.03928`). Arquivo puro, sem import.
- [ ] **Step 4:** Rodar de novo → PASS.
- [ ] **Step 5:** Commit `feat(redesign): 09-A T1 - composicao e contraste puros`.

---

### Task 2: Tokens de vidro e névoa, com contrato medido

**Files:**
- Modify: `src/app/globals.css` (`@theme inline`, `:root`, `.dark`, e os comentários do cabeçalho que dizem "Arial / exigência do dono" e "não há next/font")
- Modify: `src/lib/theme/tokens.test.ts`
- Create: `src/lib/theme/contraste-dos-tokens.test.ts`

**Interfaces:**
- Consumes: `lerCor`, `compor`, `contraste` (Task 1); os helpers `semComentarios`/`bloco`/`tokens` de `tokens.test.ts` (copiar para o teste novo ou extrair para `src/lib/theme/ler-tokens.ts`, que os dois importam).
- Produces (tokens em `:root` **e** `.dark`): `--fog-base`, `--fog-1`, `--fog-2`, `--fog-3`, `--glass`, `--glass-solid`, `--glass-strong`, `--glass-border`, `--glass-hi`, `--glass-lo`, `--glass-sheen`, `--glass-shadow`, `--tile`, `--tile-border`, `--pill`, `--pill-strong`, `--track`, `--grid`, `--primary-fill`, `--primary-fill-foreground`, `--muted-on-fog`.
- Produces (utilitárias registradas em `@theme inline`): `--color-glass`, `--color-glass-solid`, `--color-glass-strong`, `--color-glass-border`, `--color-tile`, `--color-tile-border`, `--color-pill`, `--color-pill-strong`, `--color-track`, `--color-grid`, `--color-primary-fill`, `--color-primary-fill-foreground`, `--color-muted-on-fog`, `--ease-mola: cubic-bezier(.22,1.45,.36,1)`, `--ease-estalo: cubic-bezier(.22,1.6,.36,1)`.

**Valores** (ponto de partida do Apêndice A do spec, **corrigidos pela medição**: os alfas da névoa baixaram e quatro tons de texto mudaram):

| Token | `:root` (claro) | `.dark` (escuro) |
| --- | --- | --- |
| `--fog-base` | `#e8ecf3` | `#0a0c11` |
| `--fog-1` | `rgba(120, 160, 235, 0.45)` | `rgba(34, 78, 170, 0.6)` |
| `--fog-2` | `rgba(196, 186, 240, 0.6)` | `rgba(88, 56, 150, 0.6)` |
| `--fog-3` | `rgba(244, 214, 178, 0.7)` | `rgba(16, 96, 92, 0.6)` |
| `--glass` | `rgba(255, 255, 255, 0.56)` | `rgba(28, 31, 40, 0.58)` |
| `--glass-solid` | `#f5f7fa` | `#14171e` |
| `--glass-strong` | `rgba(255, 255, 255, 0.94)` | `rgba(38, 42, 52, 0.95)` |
| `--glass-border` · `--glass-hi` · `--glass-lo` · `--glass-sheen` | `rgba(255,255,255,.78)` · `.95` · `.35` · `.55` | `rgba(255,255,255,.10)` · `.14` · `.04` · `.07` |
| `--glass-shadow` | `0 1px 2px rgba(16,24,40,.04), 0 20px 50px -22px rgba(30,45,90,.28)` | `0 1px 2px rgba(0,0,0,.3), 0 26px 60px -24px rgba(0,0,0,.7)` |
| `--tile` · `--tile-border` | `rgba(255,255,255,.55)` · `.7` | `rgba(255,255,255,.05)` · `.07` |
| `--pill` · `--pill-strong` | `rgba(255,255,255,.82)` · `#ffffff` | `rgba(255,255,255,.10)` · `rgba(255,255,255,.16)` |
| `--track` · `--grid` | `rgba(22,24,29,.07)` · `rgba(22,24,29,.07)` | `rgba(255,255,255,.09)` · `rgba(255,255,255,.07)` |
| `--background` | `var(--fog-base)` | `var(--fog-base)` |
| `--card` · `--popover` | `var(--glass)` · `var(--glass-strong)` | idem |
| `--sidebar` | `var(--glass)` | `var(--glass)` |
| `--foreground` (e `--card-`/`--popover-foreground`) | `#16181d` | `#f2f4f8` |
| `--muted-foreground` | `#596070` | `#a1a8b6` |
| `--muted-on-fog` | `#454b5a` | `#a1a8b6` |
| `--primary` (texto) · `--primary-foreground` | `#0062d6` · `#ffffff` | `#6ea7ec` · `#0d2847` |
| `--primary-fill` · `--primary-fill-foreground` | `#0062d6` · `#ffffff` | `#1f6fe5` · `#ffffff` |
| `--accent` · `--accent-foreground` | `#e7f1fe` · `#1f4371` | `#233041` · `#cbe0fc` |
| `--destructive` | `#c2262e` | `#ff6468` |
| `--success-ink` | `#006303` | `#3fcf7f` |
| `--warning-ink` | `#8a5a01` | `#fab21c` |
| `--info-ink` | `#0062d6` | `#6ea7ec` |
| `--ring` | `#0062d6` | `#6ea7ec` |

Os outros tokens (`--secondary`, `--muted`, `--border`, `--input`, `--success`, `--warning`, `--info` de preenchimento, os `--sidebar-*` restantes, `--chart-*`) ficam como estão.

- [ ] **Step 1: Testes que falham em `tokens.test.ts`**
  - Trocar o caso "`--card` continua sendo a superfície…" por "`--glass-solid` é a superfície em que a paleta foi validada": claro `#f5f7fa`, escuro `#14171e`, com a mensagem `REVALIDAR`.
  - Novo: "a casca aponta para o vidro" → em `claro` e `escuro`: `card` = `var(--glass)`, `popover` = `var(--glass-strong)`, `background` = `var(--fog-base)`.
  - Novo: "os tokens de vidro existem nos dois temas" → os 21 nomes do bloco Produces, todos presentes em `claro` e em `escuro`.
- [ ] **Step 2: Testes que falham em `contraste-dos-tokens.test.ts`**, para cada tema (`claro`, `escuro`):
  - `superficies` = `glass-solid` + `compor(glass, compor(fog-k, fog-base))` para k = 1, 2, 3. Cada uma tem rótulo próprio na mensagem.
  - Texto sobre vidro: `foreground`, `muted-foreground`, `primary`, `destructive`, `success-ink`, `warning-ink`, `info-ink` → `contraste(token, superficie) >= 4.5` em **todas** as superfícies.
  - Texto sobre a névoa (abertura): `foreground` e `muted-on-fog` → `>= 4.5` sobre `fog-base` e sobre `compor(fog-k, fog-base)`.
  - Preenchimento: `contraste(primary-fill-foreground, primary-fill) >= 4.5`; `contraste(primary-foreground, primary) >= 4.5`; `contraste(accent-foreground, accent) >= 4.5`.
  - Coerência: `compor(glass, fog-base) === glass-solid`.
  - Mensagem de falha: `"<tema> · <texto> sobre <superfície>: X:1 < 4,5:1 — baixe o alfa da névoa antes de escurecer o texto"`.
- [ ] **Step 3:** `npx vitest run src/lib/theme` → FAIL.
- [ ] **Step 4:** Implementar a tabela acima em `globals.css` e registrar as utilitárias em `@theme inline`. Atualizar o comentário do cabeçalho: tipografia (spec §6.4), a superfície validada passa a ser `--glass-solid`, e "alfa da névoa é a primeira coisa a baixar se o contraste cair".
- [ ] **Step 5:** `npx vitest run src/lib/theme` → PASS. Se um par falhar, corrigir **primeiro o alfa da névoa** e anotar o novo valor nesta tabela do plano (no commit).
- [ ] **Step 6:** `npx vitest run` inteiro → verde (o `painel.test.ts` dos tokens de banner continua passando).
- [ ] **Step 7:** Commit `feat(redesign): 09-A T2 - tokens de vidro e nevoa com contraste medido`.

---

### Task 3: Os quatro materiais como utilitárias

**Files:**
- Modify: `src/app/globals.css` (depois de `@layer base`)
- Create: `src/lib/theme/vidro.test.ts`

**Interfaces:**
- Consumes: tokens da Task 2.
- Produces (utilitárias Tailwind v4, usadas pelas 09-B a 09-G):
  - `vidro-casca`: `background: linear-gradient(180deg, var(--glass-sheen), transparent 42%), var(--glass)`; borda `1px solid var(--glass-border)`; `box-shadow: inset 0 1px 0 var(--glass-hi), inset 0 -1px 0 var(--glass-lo), var(--glass-shadow)`; `backdrop-filter` e `-webkit-backdrop-filter: blur(30px) saturate(175%)`.
  - `vidro-cartao`: o mesmo **sem** `backdrop-filter`.
  - `vidro-sobreposicao`: fundo `var(--glass-strong)`, a mesma borda e sombra, `backdrop-filter: blur(24px) saturate(160%)`.
  - `ladrilho`: fundo `var(--tile)`, borda `1px solid var(--tile-border)`, sem sombra e sem `backdrop-filter`.
  - Em **cada uma**: `@media (prefers-reduced-transparency: reduce)` → `background: var(--glass-solid)`, `backdrop-filter: none`, `-webkit-backdrop-filter: none`; e `@media (forced-colors: active)` → `border-color: CanvasText`.
  - Nenhuma define `border-radius`: o raio é do componente.

- [ ] **Step 1: Testes que falham** (varredura de `globals.css` sem comentários, recortando cada `@utility <nome>` pelo helper `bloco`):
  - as quatro utilitárias existem;
  - `backdrop-filter` aparece em `vidro-casca` e `vidro-sobreposicao` e **não** aparece em `vidro-cartao` nem em `ladrilho`;
  - as quatro contêm `prefers-reduced-transparency` e `forced-colors`;
  - nenhuma contém `border-radius`;
  - o arquivo inteiro não contém `background-attachment: fixed` (em nenhuma forma).
- [ ] **Step 2:** `npx vitest run src/lib/theme/vidro.test.ts` → FAIL.
- [ ] **Step 3:** Implementar as quatro com `@utility` (aninhar os `@media` dentro de cada uma).
- [ ] **Step 4:** Rodar → PASS. `npm run build` compila sem aviso do Tailwind.
- [ ] **Step 5:** Commit `feat(redesign): 09-A T3 - os quatro materiais como utilitarias`.

---

### Task 4: A névoa no fundo

**Files:**
- Modify: `src/app/globals.css` (`@layer base`, regra de `body`)
- Modify: `src/components/layout/app-shell.tsx:63` (a `div` raiz perde `bg-background`)
- Modify: `src/app/(auth)/layout.tsx` (a coluna do formulário perde `bg-background`; o painel de marca escuro fica até a 09-C)
- Test: `src/lib/theme/vidro.test.ts`

**Interfaces:**
- Produces: `body::before` fixo atrás de tudo (`content: ""; position: fixed; inset: 0; z-index: -1; pointer-events: none`), com o fundo em camadas:
  `radial-gradient(closest-side, var(--fog-1), transparent)` em ~`68vw 56vw` a `-8vw -18vw`;
  `radial-gradient(closest-side, var(--fog-2), transparent)` em ~`62vw 58vw` a `right -18vw top 8vw`;
  `radial-gradient(closest-side, var(--fog-3), transparent)` em ~`70vw 54vw` a `22vw 60vw`.
  O `body` mantém `bg-background` (= `--fog-base`) e ganha `isolation: isolate`.
  As posições exatas ficam com o executor, conferidas no harness: as manchas no alto e nos cantos, como na prévia.

- [ ] **Step 1: Testes que falham** (em `vidro.test.ts`):
  - `globals.css` tem `body::before` com `position: fixed` e as três `var(--fog-1|2|3)`;
  - a `className` da `div` raiz retornada por `AppShell` (o primeiro `className=` depois de `return (` em `app-shell.tsx`) não contém `bg-background`;
  - nenhum `bg-background` na coluna do formulário de `(auth)/layout.tsx` (a `div` que embrulha `{children}`).
- [ ] **Step 2:** Rodar → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Rodar → PASS. Conferir no harness (4 larguras × 2 temas) `/dashboard` e `/login`: a névoa aparece e o conteúdo não fica atrás dela. Ela também não "anda" ao rolar no Chrome com emulação de iPhone.
- [ ] **Step 5:** Commit `feat(redesign): 09-A T4 - nevoa no fundo do app e do login`.

---

### Task 5: Superfícies que cobrem conteúdo rolando

**Files:**
- Modify: `src/app/(app)/nutricao/alimentos/foods-client.tsx:311`, `src/app/(app)/treinos/exercicios/exercises-client.tsx:276`, `src/app/(app)/treinos/treinos/workouts-client.tsx:343` (barras de filtro `sticky`: `bg-card…` → `vidro-casca`)
- Modify: `src/components/cartoes/proximos-meses.tsx:124`, `src/components/cartoes/visao-geral.tsx:112` (colunas fixas: `bg-card` → `bg-glass-solid`)
- Modify: `src/components/dashboard/categoria-chart-impl.tsx:70`, `src/components/dashboard/rosca-categorias-chart-impl.tsx:44` (`stroke="var(--card)"` → `stroke="var(--glass-solid)"`)
- Test: `src/lib/theme/vidro.test.ts`

- [ ] **Step 1: Testes que falham** (varredura de todo `src/**/*.tsx`, sem comentários):
  - nenhuma `className` (string ou constante) que contenha `sticky` ou `fixed` contém também `bg-card` (com ou sem `/NN`). A mensagem lista arquivo e linha e diz: "fundo translúcido sobre conteúdo que rola: use `vidro-casca` (barra) ou `bg-glass-solid` (coluna de tabela)";
  - nenhum `var(--card)` em atributo `stroke` ou `fill` de gráfico.
- [ ] **Step 2:** Rodar → FAIL, listando exatamente os 7 pontos acima. Se aparecer outro, ele entra nesta task.
- [ ] **Step 3:** Trocar. Nas barras de filtro, remover também `backdrop-blur*`/`supports-[backdrop-filter]:*` que conflitem com a utilitária.
- [ ] **Step 4:** Rodar → PASS. Conferir no harness as três barras rolando sobre a lista, e as duas tabelas de Cartões rolando na horizontal a 390 px.
- [ ] **Step 5:** Commit `feat(redesign): 09-A T5 - superficies fixas opacas ou desfocadas`.

---

### Task 6: Raio maior

**Files:**
- Modify: `src/app/globals.css` (`--radius`)
- Test: `src/lib/theme/tokens.test.ts`

- [ ] **Step 1: Teste que falha:** `claro.get("radius") === "1rem"`, com a mensagem "raio da 09-A (spec §6.5); a escala derivada acompanha".
- [ ] **Step 2:** Rodar → FAIL. **Step 3:** `--radius: 1rem`. **Step 4:** Rodar → PASS.
- [ ] **Step 5:** No harness, percorrer `/dashboard`, `/financeiro`, `/todo`, `/treinos`, `/configuracoes` e um diálogo de formulário, a 390 e a 1440 px. Anotar em `VIDRO-MEDICOES.md` **sem corrigir** os pontos onde o raio ficou exagerado (selo pequeno, caixa de seleção, célula de tabela). A correção é da 09-B (primitiva) ou da 09-F (módulo).
- [ ] **Step 6:** Commit `feat(redesign): 09-A T6 - raio base de 1rem`.

---

### Task 7: Fonte

**Files:**
- Modify: `src/app/layout.tsx`
- Modify: `src/app/globals.css` (`--font-sans` em `:root`)
- Test: `src/lib/theme/tokens.test.ts`

**Interfaces:**
- Produces: `const inter = Inter({ subsets: ["latin"], display: "swap", preload: false, variable: "--font-inter" })` em `layout.tsx`, com `inter.variable` somado à `className` do `<html>`; e
  `--font-sans: -apple-system, BlinkMacSystemFont, var(--font-inter), "Segoe UI", system-ui, sans-serif;`

- [ ] **Step 1: Testes que falham:**
  - `claro.get("font-sans")` começa com `-apple-system, BlinkMacSystemFont, var(--font-inter)` e não contém `Arial`;
  - `layout.tsx` importa `Inter` de `next/font/google` e contém `preload: false`, `variable: "--font-inter"` e `subsets: ["latin"]`.
- [ ] **Step 2:** Rodar → FAIL. **Step 3:** Implementar. **Step 4:** Rodar → PASS.
- [ ] **Step 5:** `npm run build`: a fonte é baixada no build e auto-hospedada. Conferir no HTML de `/login` que **não** há `<link rel="preload" … font>`.
- [ ] **Step 6:** Commit `feat(redesign): 09-A T7 - fonte do sistema Apple com Inter de reserva`.

---

### Task 8: Laudo da paleta e documentos

**Files:**
- Modify: `docs/redesign/TOKENS.md` (§1, §3, §4, §7, §8 regra 7)
- Modify: `docs/redesign/PLANO.md` (a seção REDESIGN-09, se o integrador ainda não a tiver)

- [ ] **Step 1:** Rodar o validador da skill `dataviz` nos oito slots sobre as superfícies novas:
  `node "$V" "#2a78d6,#eb6834,#1baf7a,#eda100,#e87ba4,#008300,#4a3aa7,#e34948" --mode light --surface "#f5f7fa"` e
  `node "$V" "#3987e5,#d95926,#199e70,#c98500,#d55181,#008300,#9085e9,#e66767" --mode dark --surface "#14171e"`.
  Esperado (medido no desenho): claro com todas passando e **WARN de relevo em 4 slots** (`#eb6834` 2,98 · `#1baf7a` 2,62 · `#eda100` 2,02 · `#e87ba4` 2,51); escuro 8/8 acima de 3:1.
- [ ] **Step 2:** Reescrever o §7 com o laudo novo e os comandos. Escrever que o laranja **entrou** na lista dos que exigem rótulo direto ou tabela.
- [ ] **Step 3:** §1: a tipografia passa a ser a da §6.4 do spec, e "Arial, copiar literalmente" cai, com a data e a referência à prévia aprovada. O raio sobe para `1rem`. §3/§4: a tabela da Task 2 deste plano, com os contrastes do teste. §8 regra 7: *"Sem néon, sem sombra pesada. Gradiente só na névoa de fundo e no brilho do material; nunca em botão, cartão ou gráfico como decoração."*
- [ ] **Step 4:** Commit `docs(redesign): 09-A T8 - laudo da paleta e tokens do vidro`.

---

### Task 9: Medição "depois" e verificação

**Files:**
- Modify: `docs/redesign/VIDRO-MEDICOES.md`

- [ ] **Step 1:** Os cinco comandos verdes. A contagem de testes sobe (Tasks 1–7), e nenhum teste antigo foi apagado (só o caso do `--card`, trocado na Task 2).
- [ ] **Step 2:** `perf:bundle`: nenhuma rota sobe mais de 1 KB gz em relação à Task 0. A fonte não entra no JS.
- [ ] **Step 3:** O mesmo amostrador da Task 0, nas mesmas telas e temas. **Aceite:** nenhum quadro acima de 50 ms, e o p95 do intervalo no máximo 10% pior que o "antes".
- [ ] **Step 4:** O dono repete o teste do iPhone (Task 0, Step 5) e responde se travou.
- [ ] **Step 5:** Harness: `/dashboard`, `/financeiro`, `/todo`, `/login` em 390/768/1280/1440 px × claro/escuro. Anotar o que ficou estranho por falta das primitivas (é esperado: cartões sem a borda de luz, botões ainda retos). Isso **não** se corrige aqui.
- [ ] **Step 6:** Atualizar `VIDRO-MEDICOES.md` com o "depois" lado a lado com o "antes". Commit `docs(redesign): 09-A T9 - medicoes depois da base do vidro`.
- [ ] **Step 7:** Relatório final ao dono, com os números, o que ficou para a 09-B e o comando do portão da 09-B (`git merge-base --is-ancestor feat/redesign-09-vidro feat/redesign-00-auditoria`, depois da integração).
