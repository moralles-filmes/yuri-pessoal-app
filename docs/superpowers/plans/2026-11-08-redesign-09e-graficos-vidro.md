# REDESIGN-09-E — Gráficos em vidro — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Levar os 13 gráficos `*-impl.tsx`, a dica, a rosca e o anel ao desenho de vidro do §6.10, sem nenhum número novo.

**Architecture:** As regras de cálculo ficam em funções puras de `chart-theme.ts`. Uma peça única (`DicaDoGrafico` + `LegendaDoGrafico`) e um gancho único (`useFocoDoGrafico`) servem a todos os gráficos, e só os `-impl` os importam, então entram no chunk sob demanda. O crescimento das barras é CSS (`@keyframes`) e toda animação JS do recharts é desligada: um `Cell` que muda de opacidade no hover trocaria a referência que `useAnimationId` observa e a barra cresceria de novo.

**Tech Stack:** Next.js 16, recharts 3.9.0, Tailwind v4, Vitest (ambiente node, sem teste de componente).

**Spec:** `docs/superpowers/specs/2026-11-07-redesign-09-vidro-design.md` (§6.2, §6.6, §6.10, §6.12).

## Global Constraints

- Nenhuma migration, dependência nova, regra de negócio, número novo ou mudança no que um número significa. A linha "Sobrou" da prévia não entra.
- Barras: até 22 px; 13 px com mais de 6 grupos; raio 4 só na ponta; 2 px de vão entre barras vizinhas; sem linha de eixo; grade só horizontal.
- Esmaecimento dos outros grupos: 30%. Mês em andamento: contorno tracejado + preenchimento 35% + entrada própria na legenda ("ainda em andamento").
- Linhas 2 px, mira vertical no hover. Rosca: vão de 2 a 3 px, total no centro, legenda com valor e percentual. Anel: um só.
- `YAxis width="auto"`, fachada + `next/dynamic` com objeto literal, paleta de 8 slots em ordem fixa, sem eixo duplo, texto em token de texto, rótulos de `rotulos-dos-graficos.ts`.
- Nenhuma rota sobe mais de 1 KB gz. O que não usa `recharts` continua na fachada; a fachada não importa `dica-do-grafico.tsx`.
- `prefers-reduced-motion` desliga crescimento e transições. Não combinar `vidro-*` com `bg-*`, `border-*` ou `shadow-*` na mesma peça.
- Repositório público: nenhum valor em R$, nome de pessoa, banco ou categoria real em teste ou documento.
- Antes de cada commit: `sed -i 's/\r$//'` nos arquivos alterados, `git checkout -- AGENTS.md`, `git status` (reverter CLAUDE.md se mexido), revisão do diff. Sem push.
- Commits com `Co-Authored-By` do modelo que de fato escreveu.

## Review Focus

1. Toque único: a dica abre, e tocar fora ou rolar a fecha; nem dica nem esmaecimento ficam presos (Task 2).
2. Olho fechado: nenhum valor aparece na dica, no título da dica de faturas, no centro da rosca, na legenda ou no eixo (Tasks 2, 3, 6).
3. Barra crescendo de novo ao passar o mouse: proibido; prova por varredura de `isAnimationActive={false}` em cada série (Task 3 a 6).
4. Mês sem fatura (`null`) continua "sem fatura", nunca R$ 0; zero medido continua zero (Task 2, função pura).
5. Ao sair da fatia, o centro volta ao total, e rosca de fatia única não ganha vão (Task 6).

---

### Task 1: Regras puras e CSS dos gráficos

**Files:**
- Modify: `src/components/dashboard/chart-theme.ts`, `src/components/dashboard/chart-theme.test.ts`, `src/app/globals.css`

**Interfaces — Produces:**
- `LARGURA_BARRA_LARGA = 22`, `LARGURA_BARRA_ESTREITA = 13`, `VAO_ENTRE_BARRAS = 2`, `RAIO_DA_PONTA = 4`, `OPACIDADE_ESMAECIDA = 0.3`, `OPACIDADE_EM_ANDAMENTO = 0.35`
- `larguraDaBarra(grupos: number): number`
- `raioDaPonta(layout: "vertical" | "horizontal"): [number, number, number, number]`: `horizontal` é a barra em pé (`[4,4,0,0]`); `vertical` é a deitada (`[0,4,4,0]`)
- `opacidadeDoGrupo(indice: number, foco: number | null): number`
- `anguloDoVao(fatias: number, raioMedio: number, vaoPx?: number): number`, `vaoPx` padrão 2.5, 0 com uma fatia ou menos
- `MIRA_DA_LINHA = { stroke: "var(--muted-foreground)", strokeWidth: 1 }`
- Classes CSS `grafico-barras` e `grafico-barras-deitadas` em `globals.css`

- [ ] **Step 1: Testes que falham** em `chart-theme.test.ts`: `larguraDaBarra(6) === 22`, `larguraDaBarra(7) === 13`; `raioDaPonta("horizontal")` igual a `[4,4,0,0]`; `opacidadeDoGrupo(2,null) === 1`, `(2,2) === 1`, `(1,2) === 0.3`; `anguloDoVao(1,79) === 0`; `anguloDoVao(5,79)` entre 1,4 e 2,2 graus; o CSS sem comentários contém `.grafico-barras` com `transform-origin: bottom`, `.grafico-barras-deitadas` com `transform-origin: left`, e dentro de `prefers-reduced-motion: reduce` `animation: none` e `transition: none` para os dois seletores.
- [ ] **Step 2:** `npx vitest run src/components/dashboard/chart-theme.test.ts` → FAIL.
- [ ] **Step 3: Implementar.** `anguloDoVao` = `(vaoPx / (2π·raioMedio)) · 360`. Em `globals.css`, regras sem camada para `.grafico-barras .recharts-bar-rectangle path`: `transform-box: fill-box; transform-origin: bottom; animation: crescer-y .9s cubic-bezier(.2,.8,.2,1) both; transition: opacity .2s ease`. Equivalente com `crescer-x` e `origin: left` para `-deitadas`.
- [ ] **Step 4:** Mesmo comando → PASS.
- [ ] **Step 5: Commit** `feat(redesign): 09-E T1 - regras puras e crescimento em CSS`.

### Task 2: Dica, legenda, foco e contraste

**Files:**
- Create: `src/components/dashboard/dica-do-grafico.tsx`, `src/components/dashboard/linhas-da-dica.ts`, `src/components/dashboard/use-foco-do-grafico.ts`, `src/components/dashboard/graficos-vidro.test.ts`
- Modify: `src/app/globals.css`, `src/lib/theme/contraste-dos-tokens.test.ts`

**Interfaces — Produces:**
- `linhas-da-dica.ts` (puro, só `import type`): `type LinhaDaDica = { chave: string; nome: string; cor: string; valor: string; dinheiro: boolean }`; `linhasDaDica(payload: readonly EntradaDaDica[], formatar: (e: EntradaDaDica) => { nome?: string; valor: string; dinheiro: boolean } | null): LinhaDaDica[]`, que descarta `null`.
- `DicaDoGrafico({ titulo, situacao?, total?, linhas })`: raiz com `data-slot="chart-tooltip"` e `vidro-sobreposicao`, raio 14 px, devolve `null` sem linhas; `total?: string` e todo valor com `dinheiro: true` passam por `ValorComOlho`; `situacao` é texto ("ainda em andamento").
- `AmostraDeCor({ cor, emAndamento? })`: 10 px, raio 3, com aro `ring-1 ring-foreground/NN`.
- `LegendaDoGrafico`, para `<Legend content>`: amostra + nome em `text-muted-foreground`.
- `useFocoDoGrafico(): { ref, foco, aoMudar, dicaAtiva }`: `foco: number | null`, `dicaAtiva: false | undefined`.
- `ObservadorDeFoco({ dados, aoMudar })`: filho do gráfico; lê `useActiveTooltipDataPoints()` e chama `aoMudar(dados.indexOf(ponto))` num efeito, só quando muda. Hover, toque e teclado saem do mesmo estado da dica.

- [ ] **Step 1: Testes que falham** em `graficos-vidro.test.ts`, com varredura sem comentários (`semComentarios`): raiz da dica liga `data-slot="chart-tooltip"` a `vidro-sobreposicao` no MESMO elemento e sem `bg-*/border-*/shadow-*`; `total` e valor em dinheiro passam por `ValorComOlho`; `linhasDaDica` descarta `null` e mantém zero (`"R$ 0,00"`); nenhum arquivo de gráfico contém "Sobrou"; a regra `body:has(...)` de `globals.css` cita `[data-slot="chart-tooltip"]`; `use-foco` registra `pointerdown` fora do `ref` e `scroll` e remove os dois no cleanup. Em `contraste-dos-tokens.test.ts`, bloco `09-E`: `foreground` e `muted-foreground` sobre `glass-strong` nas oito composições de `fortes` + vidro + `#000`/`#fff` ≥ 4,5:1; aro da amostra (alfa LIDO da classe) ≥ 3:1 sobre `glass-strong` composto; contorno do mês em andamento (`chart-1` e `muted-foreground`) ≥ 3:1 nas quatro superfícies; e o laudo do esmaecimento conforme a decisão 1.
- [ ] **Step 2:** `npx vitest run src/components/dashboard/graficos-vidro.test.ts src/lib/theme/contraste-dos-tokens.test.ts` → FAIL.
- [ ] **Step 3: Implementar.** `dicaAtiva` vale `false` depois de `pointerdown` fora do `ref` ou `scroll` da janela; `pointerdown`/`pointermove` dentro do `ref` volta a `undefined`. `foco` é `null` enquanto `dicaAtiva === false`. Listeners passivos. A dica não usa transição.
- [ ] **Step 4:** Mesmo comando → PASS. Se contraste falhar, baixar alfa antes de escurecer texto.
- [ ] **Step 5: Commit** `feat(redesign): 09-E T2 - dica em vidro, legenda e foco`.

### Task 3: Barras financeiras

**Files:**
- Modify: `barras-entradas-saidas-chart-impl.tsx`, `barras-entradas-saidas-chart.tsx`, `mes-a-mes-chart-impl.tsx`, `faturas-chart-impl.tsx`, `projecao-chart-impl.tsx`, `forma-pagamento-chart-impl.tsx` (todos em `src/components/dashboard/`), `graficos-vidro.test.ts`

**Interfaces — Consumes:** Tasks 1 e 2.

- [ ] **Step 1: Testes que falham**, varrendo cada `<Bar ...>` extraído: `isAnimationActive={false}` e `maxBarSize={larguraDaBarra(`; todo `<BarChart` tem `barGap={VAO_ENTRE_BARRAS}`; todo `<Tooltip` tem `content=`, `active={foco.dicaAtiva}`, `isAnimationActive={false}`, e `cursor={false}` nos de barra; invólucro com `grafico-barras` (ou `-deitadas` em formas); `barras-entradas-saidas` sem `Hachura`/`url(#hachura`, com `OPACIDADE_EM_ANDAMENTO` e `strokeDasharray` no ramo parcial; fachada escreve "ainda em andamento"; faturas passa o total por `total=`, não dentro de `titulo`.
- [ ] **Step 2:** `npx vitest run src/components/dashboard/graficos-vidro.test.ts` → FAIL.
- [ ] **Step 3: Implementar.** Em cada gráfico: `useFocoDoGrafico`, invólucro com `ref`, `<ObservadorDeFoco>`, `<Cell opacity={opacidadeDoGrupo(i, foco.foco)}>`, `DicaDoGrafico` com os mesmos textos de hoje. Na pilha, o `Cell` do segmento mais alto com valor recebe a ponta arredondada (faturas com terceiros zero, projeção). Projeção mantém hachura e "(projetado)" (decisão 4). Mês parcial: `fillOpacity` 0,35 e tracejado; a dica leva `situacao="ainda em andamento"`.
- [ ] **Step 4:** Mesmo comando → PASS; `npx tsc --noEmit` → sem erros.
- [ ] **Step 5: Commit** `feat(redesign): 09-E T3 - barras financeiras em vidro`.

### Task 4: Barras dos módulos

**Files:**
- Modify: `src/components/habits/consistency-chart-impl.tsx`, `src/components/reports/report-bar-chart-impl.tsx`, `src/components/training/training-charts-impl.tsx` (`PeriodBarChart`), `graficos-vidro.test.ts`

- [ ] **Step 1: Testes que falham:** a varredura da Task 3 passa a incluir estes três; `report-bar` e `training` usam `raioDaPonta(` em vez de `[6, 6, 0, 0]`; o valor de `report-bar` só usa `dinheiro: true` se `formatValue` for BRL, com prop nova `dinheiro?: boolean`, padrão `false`, ligada pelos chamadores financeiros de `/relatorios`.
- [ ] **Step 2:** Rodar o arquivo → FAIL.
- [ ] **Step 3: Implementar** no molde da Task 3, mantendo `Semana de ...` e `(feitos/agendados)` exatamente como hoje.
- [ ] **Step 4:** Rodar o arquivo → PASS.
- [ ] **Step 5: Commit** `feat(redesign): 09-E T4 - barras dos modulos em vidro`.

### Task 5: Linhas e áreas

**Files:**
- Modify: `src/components/dashboard/evolucao-chart-impl.tsx`, `src/components/body/measurement-chart-impl.tsx`, `src/components/studies/evolution-chart-impl.tsx`, `src/components/training/training-charts-impl.tsx` (linha e área), `graficos-vidro.test.ts`

- [ ] **Step 1: Testes que falham:** cada `<Line`/`<Area` com `strokeWidth={2}` e `isAnimationActive={false}`; cada `<Tooltip` de linha com `cursor={MIRA_DA_LINHA}`, `content=`; nenhum `linearGradient` nestes arquivos (regra 7 do §8); `connectNulls={false}` continua em `dataKey="value"` de medidas.
- [ ] **Step 2:** Rodar o arquivo → FAIL.
- [ ] **Step 3: Implementar.** Área com preenchimento plano `fill="var(--chart-1)"` `fillOpacity={0.14}`. Medidas e estudos não usam `ValorComOlho` (não é dinheiro); `evolucao` usa.
- [ ] **Step 4:** Rodar o arquivo → PASS.
- [ ] **Step 5: Commit** `feat(redesign): 09-E T5 - linhas e areas em vidro`.

### Task 6: Rosca e olho

**Files:**
- Modify: `src/components/dashboard/rosca-categorias-chart-impl.tsx`, `rosca-categorias-chart.tsx`, `categoria-chart-impl.tsx`, `graficos-vidro.test.ts`; conforme a decisão 2, `src/app/globals.css`

- [ ] **Step 1: Testes que falham:** `<Pie` com `paddingAngle={anguloDoVao(`, `stroke="none"` nos `Cell`, `isAnimationActive={false}`; `opacity={opacidadeDoGrupo(` no `Cell`; centro renderiza `ValorComOlho` nos dois ramos; legenda da fachada usa `ValorComOlho` no valor; teste puro `centroDaRosca({fatias,total,rotulo},null)` devolve o total e, com índice, nome + valor + percentual de `percentualDaFatia`.
- [ ] **Step 2:** Rodar o arquivo → FAIL.
- [ ] **Step 3: Implementar.** `centroDaRosca` em `cores-da-rosca.ts`. `Pie` com `onMouseEnter`, `onMouseLeave` e `onClick` (toque) gravam o índice no estado; `useFocoDoGrafico` cobre tocar fora e rolar. Tooltip com `content={() => null}` (decisão 5). `CategoriaChart` recebe só o vão e a animação (decisão 3).
- [ ] **Step 4:** Rodar o arquivo → PASS.
- [ ] **Step 5: Commit** `feat(redesign): 09-E T6 - rosca com centro em foco`.

### Task 7: Anel de progresso

**Files:**
- Modify: `src/components/habits/progress-ring.tsx`, `src/components/dashboard/general/habits-card-body.tsx`, `graficos-vidro.test.ts`, `src/lib/theme/contraste-dos-tokens.test.ts`

- [ ] **Step 1: Testes que falham:** cada arquivo tem exatamente 2 `<circle` (trilho + progresso); trilho em `var(--track)`; `progress-ring` com `transition-[stroke-dashoffset]` e `motion-reduce:transition-none`, sem `transition-all`; `primary` sobre `track` composto ≥ 3:1 nas quatro superfícies.
- [ ] **Step 2:** Rodar os dois arquivos → FAIL.
- [ ] **Step 3: Implementar** a troca de token e de classe.
- [ ] **Step 4:** Rodar os dois arquivos → PASS.
- [ ] **Step 5: Commit** `feat(redesign): 09-E T7 - anel de progresso em vidro`.

### Task 8: Laudo da paleta e fechamento (sessão principal)

**Files:** `docs/redesign/TOKENS.md` (§7 e §6-B), `docs/redesign/VIDRO-MEDICOES.md` (seção 09-E)

- [ ] **Step 1:** Rodar o validador da skill `dataviz` nos dois temas com `--surface` em `--glass-solid`, comparar com o laudo do §7 e gravar a reexecução, mais os pares novos da Task 2. A regra 7 do §8 já está reescrita: só conferir.
- [ ] **Step 2:** Comparar as 71 rotas em três casas com `bundle-base-09e.txt`.
- [ ] **Step 3:** Conferência no Chrome conforme o pedido, com a janela confirmada pelo dono: 7 telas, 4 larguras, 2 temas, hover e toque, amostrador 3 × 2.
- [ ] **Step 4:** Revisão final da branch desde o commit do plano; os cinco comandos; commit dos documentos.
