# REDESIGN-09-F — varredura dos módulos em vidro (plano)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Todos os módulos passam a usar os materiais de vidro já existentes, o círculo de concluir entra nos controles do TO-DO e dos hábitos, e todas as rotas são conferidas no navegador.

**Architecture:** Nenhuma primitiva muda. As superfícies feitas à mão trocam `bg-card` pelas constantes de `src/components/ui/materiais.ts`; os campos nativos ganham uma `@utility`; o círculo é um componente novo em `shared/`. Cada lote fecha com uma varredura de fonte que encolhe uma lista de exceções até sobrarem só as justificadas.

**Tech Stack:** Next.js 16, Tailwind v4, Radix (`radix-ui`, já instalado), Vitest em ambiente node.

**Spec:** `docs/superpowers/specs/2026-11-07-redesign-09-vidro-design.md` (§6.2, §6.5, §6.6, §6.7, §6.12 e a linha da 09-F no §7).

## Global Constraints

- Sem migration, sem dependência nova, sem regra de negócio, sem número novo, sem biblioteca de animação.
- Não editar `CLAUDE.md`, `AGENTS.md`, `docs/redesign/STATUS.md`. Primitivas de `src/components/ui/` e gráficos ficam como estão.
- Worktree `C:/tmp/09-vidro`, branch `feat/redesign-09-vidro`. Sem push, PR, merge ou deploy.
- Antes de cada commit: `sed -i 's/\r$//'` nos arquivos alterados, `git checkout -- AGENTS.md`, `git status` (o ai-router pode mexer no `CLAUDE.md`) e diff revisado atrás de segredo.
- Repositório público: nenhum valor em R$, nome de pessoa, banco ou categoria em teste ou documento.
- `cn()` é `twMerge`: não combine `vidro-*`/`ladrilho`/`campo-nativo` com `bg-*`, `border-*` ou `shadow-*` na mesma peça. Peça com borda de estado usa a constante `MATERIAL_*`, que o twMerge entende.
- Cartão e ladrilho nunca desfocam. `transition-[...]` precisa listar `scale`/`translate`. `motion-reduce` desliga transição e animação.
- Vazio, zero medido e falha continuam distintos. Situação nunca só por cor. `tabular-nums` em coluna de dinheiro.
- Texto 4,5:1; limite que transmite estado 3:1, medidos em `src/lib/theme/contraste-dos-tokens.test.ts`. Falhou: baixe primeiro o alfa do tingimento. Se apagaria a névoa, pare e pergunte ao dono.
- Nenhuma rota sobe mais de 1 KB gz. Teste de ausência precisa ter sido visto vermelho.
- Na conferência: não concluir, não excluir e não alterar dado do dono.

## Review Focus

1. Toque na borda do círculo não pode cair no título, na alça ou no menu: a área de 44 px é espaço reservado, nunca sobreposta (Task 2, medição por `elementFromPoint` na Task 8).
2. Título de duas linhas com círculo alinhado à primeira linha, sem saltar a altura da linha (Task 2, conferência).
3. Cartão que trocava `bg-card` por um tingimento a 5% ficava quase transparente sobre a névoa, com texto secundário reprovando (Task 3 a 5, exceções proibidas na varredura).
4. `<select>` nativo aberto no tema escuro precisa continuar legível com o fundo translúcido (Task 1, conferência).
5. Anel de hoje com `ring-offset-background` pinta a cor da névoa em volta da célula sobre o vidro (Task 6).

## Inventário (2026-11-08, HEAD 5f5d8a4)

O §7 citava 84, 63 e 15. Hoje: **`<Card` 206 ocorrências em 88 arquivos; `bg-card` 66 em 44 arquivos (54 de produção, o resto é teste e `materiais.ts`); `shadow-*` 63 em 35 arquivos.**

| Grupo | Qtde | Classificação |
| --- | --- | --- |
| `<Card>` sem sobrescrever raio, fundo ou sombra | 189 | **herda, já certo** |
| `<Card>` com `bg-primary/5`, `bg-amber-500/5`, `bg-muted/30`, `bg-primary/[0.03]` (compras, diário ×1, metas, receitas, refeições, despensa, insights, hábito) | 8 | **muda:** sai o fundo, fica a borda |
| `<Card>` só com `border-primary*`, `hover:border-*`, `border-amber`, `border-l-4`, `rounded-[28px]` do `Bloco` | 6 | **herda, já certo** |
| `<Card>` com `ring-1 ring-primary/*` (painel financeiro, programas) | 2 | **muda:** vira `border-primary/40` |
| `<Card>` `border-0 bg-transparent bg-none shadow-none` (terceiros) | 1 | **exceção:** invólucro invisível de propósito |
| `bg-card/40` e `/60`: painéis internos | 22 | **muda:** `MATERIAL_LADRILHO` |
| `bg-card` sólido em linha, barra ou cartão feito à mão | 31 | **muda:** `MATERIAL_CARTAO` sobre a névoa, `MATERIAL_LADRILHO` dentro de Card, Dialog ou Sheet |
| `bg-card` em célula de grade `gap-px` (`task-calendar.tsx:192`) | 1 | **exceção:** brilho por célula seria errado |
| `shadow-xs` com `border-input bg-transparent` em campo nativo | 41 campos (29 com `shadow-xs`) | **muda:** `@utility campo-nativo` |
| `shadow-none` em células vazias e em `quick-task-input:197`; `shadow-lg` no arrasto do calendário; `shadow-[inset...]` da aba do TO-DO; `nav-links`, `search-command`, `logo` | 8 | **exceção:** casca (09-C), estado de arrasto, vazio |
| `ring-1 ring-primary/15` em quadradinho de ícone | 7 | **muda:** sai o anel, como no `Indicador` |
| `ring-primary` em seleção de cor, hoje, destaque por link, alvo de soltar, select ligado | 14 | **exceção**, exceto o `ring-offset` (Task 6) |

Controles de concluir: `task-row.tsx:135`, `task-board.tsx:345`, `habit-card.tsx:90`, `habits-card-body.tsx:111`. O calendário do TO-DO e o bloco de TO-DO do dashboard **não têm** esse controle.

Regra de raio: linha de lista e barra de ferramentas `rounded-[16px]`; painel interno `rounded-[14px]`; superfície que contém uma grade `rounded-[24px]`.

---

### Task 1: Campos nativos em ladrilho

**Files:**
- Modify: `src/app/globals.css` (junto de `@utility ladrilho`)
- Modify: os 41 usos de `border-input bg-transparent` fora de `src/components/ui/`
- Test: `src/lib/theme/modulos-vidro.test.ts` (novo)

**Interfaces:**
- Produces: `@utility campo-nativo`; helper `fonteSemComentarios(caminho)` e `todosOsTsx()` no teste, reusados pelas Tasks 3 a 7.

- [ ] **Step 1: Teste** `"nenhum campo nativo usa border-input bg-transparent"` varre todo `.tsx` de `src/` fora de `components/ui/`, sem comentários, e exige lista vazia; `"a varredura leu código de verdade"` exige mais de 500 arquivos; `"campo-nativo usa --field-border e --tile"` lê o bloco da `@utility` no `globals.css`.
- [ ] **Step 2:** `npx vitest run src/lib/theme/modulos-vidro.test.ts`. Esperado: FALHA com 41 ocorrências.
- [ ] **Step 3: `@utility campo-nativo`**: `background: var(--tile)`, `border: 1px solid var(--field-border)`, `border-radius: 10px`, `box-shadow: inset 0 1px 2px rgba(16,24,40,.06)`; transparência reduzida usa `--tile-solid`; cores forçadas usam `CanvasText`. Nos 41 usos, troque `rounded-md border border-input bg-transparent` por `campo-nativo` e remova ` shadow-xs`. Altura, largura, padding e foco não mudam.
- [ ] **Step 4:** teste do arquivo e `npx tsc --noEmit`. Esperado: PASS.
- [ ] **Step 5:** commit `feat(redesign): 09-F T1 - campos nativos em ladrilho`.

### Task 2: Círculo de concluir

**Files:**
- Create: `src/components/shared/circulo-de-concluir.tsx`
- Modify: `src/components/todo/task-row.tsx`, `src/components/todo/task-board.tsx`, `src/components/habits/habit-card.tsx`, `src/components/dashboard/general/habits-card-body.tsx`, `src/lib/theme/contraste-dos-tokens.test.ts`
- Test: `src/lib/theme/modulos-vidro.test.ts`

**Interfaces:**
- Produces: `CirculoDeConcluir(props: { checked: boolean; onCheckedChange: (v: boolean) => void; disabled?: boolean; "aria-label": string; className?: string })`.

- [ ] **Step 1: Testes** amarrados ao elemento: o `Checkbox.Root` do arquivo novo tem `size-11` e `shrink-0`, e **não** tem `after:` nem `-inset` (a área é espaço reservado); o círculo visível tem `size-[22px]` e `rounded-full`; os quatro chamadores usam `CirculoDeConcluir` no elemento cujo `aria-label` começa com `Concluir`/`Reabrir`; a caixa `Selecionar` de `task-row.tsx` continua `Checkbox`; a transição do círculo lista `scale` e há `motion-reduce:`. Contraste: `foreground/52` do círculo vazio sobre cartão e ladrilho ≥ 3:1; `primary-fill-foreground` sobre `primary-fill` ≥ 4,5:1.
- [ ] **Step 2:** rode. Esperado: FALHA por arquivo inexistente.
- [ ] **Step 3: Componente.** `Checkbox.Root` de `radix-ui` é o botão de 44 px, transparente, com `group`. Dentro, `span aria-hidden` de 22 px com a aparência: vazio em `border-foreground/52`; marcado em `bg-primary-fill text-primary-fill-foreground`, visto com `ease-estalo` (`Indicator`, como no `Checkbox`). Foco: `group-focus-visible:outline-2 outline-offset-2 outline-ring` no círculo. Pressão: `group-active:scale-[.9]`.
- [ ] **Step 4: Chamadores.** Só troca de componente, mesmos handlers. Encaixe sem sobrepor: o gap do lado do círculo cai para 0 e o círculo usa `-my-2` dentro do `py-2` da linha, consumindo o padding que já existe (linha de uma só linha fica com 44 px). Em `habits-card-body`, o `<label>` continua envolvendo o título.
- [ ] **Step 5:** testes do arquivo e de contraste, `npx tsc --noEmit`. Esperado: PASS.
- [ ] **Step 6:** commit `feat(redesign): 09-F T2 - circulo de concluir com 44 px de toque`.

### Tasks 3 a 5: Superfícies por módulo

Regra comum a `bg-card` feito à mão:

| Onde está | Vira |
| --- | --- |
| `bg-card/NN` | `MATERIAL_LADRILHO`, `rounded-[14px]`; tire `border`/`border-border` |
| `bg-card` com ancestral Card, Dialog ou Sheet | `MATERIAL_LADRILHO`, raio da regra |
| `bg-card` direto na névoa | `MATERIAL_CARTAO`, raio da regra |
| borda tracejada de vazio (`EmptyState`, `pantry-panel:105`) | `bg-tile` + mantém `border border-dashed border-border`, sem constante |
| seletor `inline-flex ... rounded-lg border bg-card` (cartões) | `MATERIAL_PILULA`, `rounded-full` |

Estados (`border-destructive/30`, `hover:border-primary/40`, `opacity-60`) ficam depois da constante no `cn()`. Confira o ancestral lendo o JSX de quem renderiza. `<Card>` com `bg-primary/5`, `bg-amber-500/5`, `bg-muted/30` ou `bg-primary/[0.03]` perde só o fundo; se a situação só era dita pelo fundo, pare e registre.

Em `modulos-vidro.test.ts`, a Task 3 cria `"bg-card só nas exceções"` com `PENDENTES_DA_09F`, os caminhos das Tasks 4 e 5; cada task remove os seus. A Task 5 termina com `EXCECOES = ["src/components/todo/task-calendar.tsx", materiais.ts]`. O teste `"nenhum Card troca o próprio fundo"` proíbe `bg-(primary|amber-500|muted)/` na prop `className` de `<Card`. Contrastes novos: `foreground` e `muted-foreground` sobre `--tile` composto direto em `fog-1/2/3`, nos dois temas, ≥ 4,5:1.

- [ ] **Task 3 (22 ocorrências, 14 arquivos):** finanças, faturas, cartões, importação, relatórios, configurações, busca, notificações, `EmptyState`, `quick-add`, `reembolso-da-receita`, `invoices-card`. Teste vermelho, troca, verde, commit `09-F T3`.
- [ ] **Task 4 (13 ocorrências mais a célula de exceção, 12 arquivos):** TO-DO (menos a célula), agenda, estudos, hábitos, IA (`action-history`, `chat-client:714`, `conversation-list`, insights). Remova de `PENDENTES`, vermelho, troca, verde, commit `09-F T4`.
- [ ] **Task 5 (18 ocorrências, 13 arquivos):** Treinos e Dieta, incluindo `calendar-client:128` (estado do dia: `MATERIAL_LADRILHO`) e `session/*`. Remova de `PENDENTES`, vermelho, troca, verde, commit `09-F T5`.

### Task 6: Anéis e peças de estilo próprio

**Files:**
- Modify: `financial-dashboard-client.tsx:790`, `programs-client.tsx:509`, `exercises-client.tsx:358`, `workouts-client.tsx:418`, `module-shell.tsx:109`, os 7 quadradinhos de ícone, `consistency-calendar.tsx`, `habit-heatmap.tsx`, os formulários de cor (`course-form`, `habit-form`, `routine-form`, `project-form`), `deep-link-highlight.tsx`, `gaveta-de-registros-impl.tsx:289`
- Test: `modulos-vidro.test.ts`, `contraste-dos-tokens.test.ts`

- [ ] **Step 1: Testes:** nenhum `ring-offset-background` em `src/`; `<Card` sem `ring-`; `module-shell` ativo com `bg-pill-strong` sem `ring-1`; gaveta sem `rounded-t-2xl`. Contraste: `primary` (anel de hoje) e o preenchimento `treinado` sobre o cartão ≥ 3:1; `foreground` sobre `primary/45` e sobre `violet-500/25` compostos no cartão ≥ 4,5:1.
- [ ] **Step 2:** rode. Esperado: FALHA.
- [ ] **Step 3:** Card: `border-primary/40` no lugar do anel. Linha selecionada: `border-primary/50`. Item ativo do `module-shell`: `bg-pill-strong`, texto `foreground`. Quadradinhos: sem `ring-1 ring-primary/15`. `ring-2 ring-primary ring-offset-*` vira `outline-2 outline-offset-1 outline-primary`, que deixa o vão transparente. Gaveta: tire o `data-[side=bottom]:rounded-t-2xl` e deixe o raio da `SheetContent`.
- [ ] **Step 4:** testes e `tsc`. Esperado: PASS.
- [ ] **Step 5:** commit `09-F T6`.

### Task 7: Hierarquia de títulos

**Files:**
- Modify: `src/components/shared/painel/bloco.tsx`, chamadores em páginas sem `<h2>` (faturas, parcelamentos, `proximos-meses`, `relatorio-de-cartao`, relatórios), `empty-state.tsx`, `task-board.tsx`, `kanban-board.tsx`, `ai-preferences-form.tsx`
- Test: `src/components/shared/painel/painel.test.ts`, `modulos-vidro.test.ts`

**Interfaces:** Produces: `Bloco` com prop `nivel?: 2 | 3`, padrão `3`.

- [ ] **Step 1: Testes:** o título do `Bloco` é a tag dinâmica vinda de `nivel`; cada chamador da lista passa `nivel={2}`; `empty-state`, colunas e `ai-preferences-form` usam `<h2>`.
- [ ] **Step 2:** rode. Esperado: FALHA.
- [ ] **Step 3:** implemente; classes visuais idênticas.
- [ ] **Step 4:** testes e `tsc`. Esperado: PASS.
- [ ] **Step 5:** commit `09-F T7`.

### Task 8: Conferência no navegador e dívida na névoa (agente principal)

- [ ] **Step 1:** build de produção, next anterior encerrado pelo PID, `npm run start -- -H 0.0.0.0 -p 3209`. Pedir ao dono a janela à frente e o login.
- [ ] **Step 2: Varredura DOM** em cada rota, a 1280 px, nos dois temas: lista texto sem ancestral de vidro, ladrilho ou sobreposição cuja cor não seja `foreground` ou `muted-on-fog`; títulos que saltam nível; `h1` diferente de 1; rolagem horizontal.
- [ ] **Step 3: Corrigir** cada texto colorido: entra num vidro ou passa a `foreground`/`muted-on-fog`, mantendo ícone e palavra. Cada correção com teste amarrado; commit `09-F T8`. Ao zerar, o comentário de `DIVIDA_NA_NEVOA` passa a dizer que são pares proibidos, sem uso em página.
- [ ] **Step 4: Prints** das rotas de módulo em 390, 768, 1280 e 1440 px, claro e escuro. Anotar as que só mostraram vazio.
- [ ] **Step 5: Estados:** hover, foco, diálogo, gaveta, menu, select nativo aberto, círculo. Círculo: `getBoundingClientRect` = 44×44 e `elementFromPoint` em grade de pontos prova que nenhum ponto cai em outro controle, sem clicar.
- [ ] **Step 6:** amostrador em `/dashboard`, `/dashboard/financeiro` e `/todo` (a rota mais pesada), 3 rodadas × 2 temas, com `document.hasFocus()`. Aceite: nenhum quadro acima de 50 ms. Restaurar `yuri:sidebar-collapsed` e `yuri:sidebar-hidden` para `false`.
- [ ] **Step 7:** entregar ao dono o endereço de rede e o roteiro do iPhone (rolagem nos dois temas, círculo, toque na dica e na rosca, desfoque da dica).

### Task 9: Fechamento (agente principal)

- [ ] **Step 1:** os cinco comandos e o comparativo das 71 rotas com `bundle-base-09f.txt`, em três casas.
- [ ] **Step 2:** seção 09-F em `docs/redesign/VIDRO-MEDICOES.md`; `TOKENS.md` §6-B com `campo-nativo`, `CirculoDeConcluir` e a regra de raio; commit `docs(redesign): 09-F medicoes`.
- [ ] **Step 3:** revisão final da branch desde o commit do plano; relatório; parar.
