# Design — REDESIGN-07-A: Organização (TO-DO, Agenda, Rotinas e tarefas)

> Desenhado com o dono em **2026-09-27**, antes de qualquer linha de código. D1–D6 respondidas
> uma a uma (§3). Branch `feat/redesign-07a-organizacao`, worktree
> `yuri.app.pessoal-07a`, criada de `704dc66`. Roda **em paralelo** com a REDESIGN-03-B2, que
> ocupa a pasta principal — os arquivos dela estão listados no §9 e não são editados aqui.
> Primeiro lote da fase 07 (`docs/redesign/PLANO.md`, "REDESIGN-07 — Demais módulos").

---

## 1. O que a 07-A muda de natureza

**Nenhum dado muda.** Nenhuma migration, nenhuma regra de `src/lib/todo/**`,
`src/lib/tasks/**` ou `src/lib/calendar/**` muda de comportamento. A 07-A muda a
**aparência e a navegação** de quatro telas — e cada correção que alguém pudesse desfazer sem
perceber sai com um teste que a impede, confirmado por mutação.

⛔ **TO-DO e Tarefas continuam separados.** Agrupar visualmente não é fundir dados: `todo_*` e
`tasks` seguem distintas, nada é migrado, e nenhum componente de um módulo passa a ler dado do
outro. Hoje isso já é verdade (nenhum import cruzado nos dois sentidos, conferido); a 07-A
transforma o "é verdade hoje" em **teste** (M10).

---

## 2. Linha de base medida (antes de tocar em qualquer coisa)

Medida no worktree depois de `npm ci`, em 2026-09-27.

| Comando | Resultado |
| --- | --- |
| `npm run test:run` | **195 arquivos / 4.033 testes — 4.032 ✅, 1 ❌** (ver abaixo) |
| `npm run lint` | exit 0 |
| `npx tsc --noEmit` | exit 0 |
| `npm run build` | exit 0 — **sem** `.env.local` (não foi copiado; não foi preciso) |
| `npm run perf:bundle` | exit 0 · mediana **214,0 KB** · 68 rotas · `/(app)/configuracoes` **281,7/285** |

| Rota | KB gz |
| --- | --- |
| `/(app)/todo` | **237,6** |
| `/(app)/agenda` | 222,8 |
| `/(app)/tarefas` | 226,6 |
| `/(app)/rotinas` | 232,3 |
| `/(app)/habitos` | 238,7 |
| `/(app)/estudos` | 218,3 |
| `/(app)/financeiro` | 195,7 |

⚠️ **A falha da linha de base é de AMBIENTE, não de código.** O teste é
`src/lib/ai/approval/schema.test.ts › as travas que o código não pode contornar › a FK da
aprovação carrega o hash, amarrando-o ao effect_hash da proposta`. O worktree foi criado com
`core.autocrlf=true`: **175/175** migrations e **1001/1001** `.ts/.tsx` saíram em CRLF, e o teste
procura `"\n  on public…"` literal. Na pasta principal as migrations que ele lê estão em LF
(168/175 com CR lá — as dele não). Nada foi alterado para "consertar" isso; a entrega confere
que a **mesma** falha, com o **mesmo nome**, é a única no fim.

A mediana (214,0) e `configuracoes` (281,7) saíram **0,2 abaixo** do que o briefing herdou da
03-B (214,2 / 281,9). Vale o medido.

---

## 3. Decisões do dono (2026-09-27)

| # | Decisão | Resposta |
| --- | --- | --- |
| **D1** | Agrupar "Rotinas e tarefas" na sidebar? | **Sim.** De 20 para 19 itens, sem perder nada |
| **D2** | Como `/tarefas` acende "Rotinas e tarefas"? | **`NavItem.tambem` + `hrefAtivo` aceita itens.** Uma decisão só, no máximo um vencedor. Autoriza **uma linha** em `nav-links.tsx` (casca) como exceção declarada, com bundle medido |
| **D3** | Seletor de visão: quantas telas? | **As 4 num commit.** Hábitos e Estudos são invasão consciente da 07-B — **só o bloco do seletor** muda nelas |
| **D4** | Extrair abas por rota? | **Sim, com as três melhorias**: `aria-label` no landmark, foco visível e aba ativa em negrito — mudança visível no Financeiro, declarada |
| **D5** | Dourado cravado `#C99A2E` | **Manter.** Nenhum hex muda (§8) |
| **D6** | Unificar `components/tasks/` × `components/todo/` | **Não.** Registrado como dívida consciente; a separação vira teste (M10) |

---

## 4. Achados fora do mapa do briefing

Registrados aqui; **nenhum consertado fora do escopo**, salvo onde a decisão já o põe dentro.

| # | Achado | Destino |
| --- | --- | --- |
| **F1** | **O link de fonte da IA para uma tarefa não abre a tarefa.** `src/lib/ai/tools/adapters/tasks.ts:58` monta `/tarefas?task=${id}`; `/tarefas` lê só `view` e `date`. É o defeito da V4 — mas em território da 03-B2 e com a chave `rota:`, que o extrator do R4 não varre | **Registrado.** Para quem tocar `lib/ai` |
| **F2** | **O R4 não enxergava `const link = …`**. O extrator casa `link:`; `generate.ts:266` (`/faturas?card=…&month=`) e `:484-486` (as duas pontas de `/todo`) usam `const link =` + `link,`. As rotas existem — não há 404 —, mas a cobertura publicada (29 pontos) não os incluía | **Dentro da V4**: o extrator compartilhado passa a ler as duas formas (§5.3) |
| **F3** | **Quinta cópia do seletor de visão**: `src/components/dashboard/general/period-toolbar.tsx:126` (Dia/Semana/Mês do Dashboard), só cor, sem `aria-pressed` | **Registrado** para a REDESIGN-06. A varredura da V1 o declara como exceção nomeada — ela sabe que ele existe |
| **F4** | **A 390 px a visão ativa de Tarefas fica fora da tela.** A trilha rola (7 visões) e "Atrasadas" — a que a notificação abre — nasce escondida à direita | **Dentro da V1**: o componente leva a opção ativa para dentro da trilha |
| **F5** | **As gavetas laterais ignoram a largura pedida pelo chamador** (a regra 1 do layout — `cn()` é `twMerge` — num lugar que ela ainda não tinha alcançado). A primitiva usa `data-[side=right]:w-3/4` e `data-[side=right]:sm:max-w-sm`; o chamador passa `w-full … sm:max-w-xl`. Variante diferente não conflita no `twMerge`, e o seletor de atributo pesa mais na cascata. **Medido** com o `cn()` real e o CSS real no Chrome a 1280 px: painel de detalhe do TO-DO **384 px** (queria 576); gaveta "Projetos" de Tarefas **384 px** (queria 448); com o prefixo certo, **576**. No celular, a gaveta fica com 3/4 da tela em vez da largura toda | **Dentro da V7** para as telas da 07-A. **Registrado** para 07-B/07-C: `nutricao/planejamento/planning-client.tsx:1492`, `nutricao/refeicoes/meal-templates-client.tsx:415`, `components/nutrition/food-detail-sheet.tsx:102`, `components/nutrition/recipe-detail-sheet.tsx:149`, `components/training/exercise-detail-sheet.tsx:61`, `components/training/workout-exercise-sheet.tsx:112`. E as de `side="left"` fora do lote (`mobile-nav`, `module-shell`) ficam com 384 px no tablet em vez de ~272–288 — a do `todo-nav` entra na T3 |
| **F6** | O `card-meta` citado no briefing não está em `src/lib/dashboard/`: é `src/components/dashboard/general/card-meta.ts:42`, e aponta para `/tarefas`, que continua existindo | Nada a fazer |
| **F7** | `aria-label={\`Cor ${c}\`}` nas amostras de cor (`project-form.tsx:157`, `routine-form.tsx:293`) lê o **hex em voz alta** ("Cor #C99A2E"). A paleta não tem nomes em `lib/tasks/constants.ts` | **Registrado.** Dar nome exige dado novo em `lib/tasks` |
| **F8** | O texto do modelo da IA para o módulo diz "Tarefas e Rotinas (Fase 09)" (`ai/tools/adapters/tasks.ts:114`, `registry.ts:604`) — vocabulário interno que pode chegar à tela pela resposta do assistente | **Registrado** (território da 03-B2) |
| **F9** | Na prioridade das tarefas, o cartão não compacto (`components/tasks/task-card.tsx:91`) só a mostra pela cor da borda | **Registrado**: pôr a palavra em todo cartão muda a densidade da lista, e é decisão de desenho que não está nesta subfase |

---

## 5. A forma de cada item

### 5.1 V6 — `GoogleConnectCard` sai da rota da Agenda

- `git mv src/app/(app)/agenda/google-connect-card.tsx src/components/calendar/google-connect-card.tsx`,
  **conteúdo idêntico**. `agenda-client.tsx` e `configuracoes/page.tsx` passam a importar de
  `@/components/calendar/google-connect-card`.
- **Teste:** `src/test/imports-entre-rotas.test.ts`. Anda `src/app/(app)/**/*.{ts,tsx}`, extrai
  todo especificador de import (estático e `import()`), resolve alias `@/app/(app)/…` **e**
  caminho relativo, e reprova quando o **primeiro segmento sob `(app)`** do alvo difere do do
  arquivo. `estudos/[id]/course-detail-client.tsx → ../course-form` continua permitido (mesma
  rota de topo) — é o controle positivo, escrito no teste. Guarda anti-tautologia (lê >100
  arquivos) e autoteste do resolvedor sobre texto conhecido.
- **Bundle:** mover arquivo não muda chunk. `/(app)/configuracoes` medido antes × depois; **não
  pode crescer**.

### 5.2 V5 — `"Tarefas (Fase 09)"` vira `"Tarefas"`

- `src/lib/search/types.ts:54`. Só o valor; a chave `tarefa` fica.
- **Teste:** `src/test/rotulos-visiveis.test.ts`. **Importa** `SEARCH_TYPE_LABELS` e `allNavItems`
  (valores de runtime, não texto — comentário não conta) e reprova `/\bFase\s*\d+/i` em qualquer
  rótulo da busca e em qualquer `title` do menu. O campo `phase` de `nav.ts` não é exibido e
  **fica como está**.
- Nota: na busca, "Tarefas" convive com "TO-DO · Tarefas". O prefixo distingue o TO-DO; o rótulo
  sem prefixo é o do outro módulo.

### 5.3 V4 — o contrato da query string dos deep-links

O R4 prova que a rota existe; a V4 prova que **o parâmetro é aceito**. Renomear uma visão hoje
quebra busca e notificação sem nada ficar vermelho.

**Um extrator, não dois.** As funções de `deep-links-inline.test.ts` (`semComentarios`,
`fimDoLiteral`, `fimDaInterpolacao`, `expressaoDoLink`, `rotasDaExpressao`, `pontosDeLink`)
**saem** para `src/test/links-inline.ts` e os dois testes importam dali. Nenhuma afirmação do R4
muda; a contagem de casos dele fica igual (medida antes × depois).

**O extrator passa a ler as duas formas** (F2): `link:` e `link =` (não `==`, não `=>`), e a
leitura da expressão ganha `;` como parada no nível zero — propriedade de objeto nunca tem `;`
no nível zero, então o caso `link:` não muda (é a MB do R4 pelo outro lado: lá a troca não
mudava nada porque o `}` já parava; aqui o `;` é o que para a atribuição). O fixture do extrator
ganha as linhas da forma nova (achada) e de `link ===` / `(link) =>` (não achadas). O piso de
`generate.ts` sobe de 13 para o que a varredura medir (≥16) — **subir piso aperta**, não afrouxa.

**`resolveRoute` sai do `page.tsx` do TO-DO** para `src/app/(app)/todo/resolve-route.ts`, sem
mudar uma linha do corpo: `page.tsx` não pode exportar função arbitrária (o Next reprova export
que não seja de página), e o contrato precisa **chamá-la** — ler o texto dela seria testar a
forma, não o comportamento (D31).

**O teste:** `src/test/deep-links-query-string.test.ts`, sobre os pontos de
`lib/search/queries.ts` e `lib/notifications/generate.ts` (só **lidos**) cuja rota é `/tarefas`,
`/agenda`, `/todo` ou `/rotinas`:

1. **Os nomes de parâmetro** de cada link pertencem ao que a página lê — e o que a página lê é
   **derivado do `page.tsx`** (`sp.<nome>`), não escrito à mão. Hoje: `/tarefas` lê `view`,
   `date`; `/agenda` lê `view`, `date`, `google`; `/todo` lê `v`, `id`, `view`, `m`, `task`;
   `/rotinas` não lê nada.
2. **`/tarefas?view=`** ∈ `TASK_VIEWS`; **`/agenda?view=`** ∈ `CALENDAR_VIEWS` (importados das
   constantes, que são a mesma lista que a página usa).
3. **`/todo?v=`**: `resolveRoute(v, id)` tem de **refletir** o `v` pedido (`kind === v`, ou
   `kind === "view"` com `value === v`) — senão a página cai em "Hoje" em silêncio. E se
   `resolveRoute(v, undefined)` difere de `resolveRoute(v, "abc123")`, o link **tem de** levar
   `id`.
4. **`date` literal** tem de ser `yyyy-MM-dd`. Interpolado (`${dia}`, `${e.startIso}`) não é
   verificável por leitura — **risco residual declarado** (§11). Conferido à mão hoje: os dois
   são `yyyy-MM-dd` (`search/queries.ts:434` usa `dateInSaoPaulo`; `notifications/cron.ts:226`
   usa `spDateIso`).
5. **Piso por rota** (anti-tautologia): `/todo` ≥ 8 pontos, `/tarefas` ≥ 3, `/agenda` ≥ 2,
   `/rotinas` ≥ 1.

Toda falha nomeia **arquivo, linha e o literal**. Ele **nasce verde**; só a mutação prova algo.

### 5.4 V1 — um seletor de visão, com estado anunciado

**`src/components/shared/seletor-de-visao.tsx`**, `"use client"`. Imports de runtime: **só**
`react`, `@/lib/utils` (`cn`) e `@/components/ui/button`. Nada de `lucide-react`, `zod` ou
`validators` — a marca de ativo é um `<svg>` inline de um traço.

```ts
type Props<V extends string> = {
  rotulo: string;                 // nome do grupo: "Visão das tarefas"
  visoes: readonly V[];           // TASK_VIEWS, CALENDAR_VIEWS, HABIT_VIEWS, STUDY_VIEWS
  rotulos: Record<V, string>;     // os *_VIEW_LABELS
  atual: V;
  aoEscolher: (visao: V) => void; // cada tela mantém o seu navigate()
  className?: string;
};
```

**Semântica: `role="group"` + `aria-label` + botões com `aria-pressed`.** Escolhido contra
`role="radiogroup"`/`aria-checked` e contra `tablist`:

- `radiogroup` promete ao leitor de tela **uma parada de Tab e setas** (padrão APG). Sem
  implementar o foco itinerante, o leitor anuncia "botão de opção" com um teclado que não se
  comporta como tal — pior que não anunciar. Implementar custa código e risco numa peça que
  deveria ser pequena.
- `tablist` promete um `tabpanel` associado; aqui a troca é de URL e re-render do servidor, não
  de painel.
- `aria-pressed` é nativo de `<button>`: zero código de teclado, anunciado como "botão de
  alternância, pressionado". Custo: cada visão é uma parada de Tab (7 em Tarefas). Aceito.

**Visual (prévia, §10):** trilha `inline-flex max-w-full gap-0.5 overflow-x-auto rounded-lg
border bg-muted/40 p-1` — o `p-1` (4 px) é o que deixa o anel de foco (`ring-3`) caber dentro da
trilha, que rola e por isso recorta sombra. Opção: primitiva `Button` (`variant="ghost"`) — foco
visível **padrão do sistema**, que os quatro blocos de hoje não têm. Ativa: `bg-primary
text-primary-foreground font-semibold` **+ marca ✓** (forma e peso, não só cor), com o hover
travado no primário. Inativa: `text-muted-foreground`.

**F4 — a ativa entra na trilha.** Num efeito dependente de `atual`, se a opção ativa estiver fora
da área visível da trilha, a trilha rola **horizontalmente** até ela (`scrollLeft`, nunca
`scrollIntoView` — que rolaria a página). Sem estado, sem `setState` no efeito.

**As quatro telas** trocam o bloco pelo componente, cada uma com o seu `navigate` e rótulo:
`agenda-client.tsx:181-197`, `tasks-client.tsx:227-245`, `habits-client.tsx:131-147`,
`studies-client.tsx:122-138`. ⚠️ **Hábitos e Estudos: invasão consciente da 07-B**, restrita a
este bloco.

**Teste:** `src/components/shared/seletor-de-visao.test.ts` (varredura de fonte, ignorando
comentários — invariante 25):
- o componente declara `role="group"`, `aria-label` e `aria-pressed`, e renderiza a marca **só**
  no ramo ativo, com `font-semibold`;
- o componente não importa nada além dos três permitidos;
- as quatro telas importam o componente;
- **nenhum `.tsx` de `src/app` ou `src/components` monta `X_VIEWS[.filter(…)].map(` cujo corpo
  tenha `<button`/`<Button`**, salvo as **exceções declaradas**:
  `components/dashboard/general/period-toolbar.tsx` (F3 — defeito vivo, é da REDESIGN-06) e
  `app/(app)/todo/todo-client.tsx` (alternador **só-ícone**, já com `aria-pressed` e
  `aria-label` — outra forma; recebe marca de forma na V7). O teste também afirma que **cada
  exceção ainda casa** — exceção que deixou de ser necessária fica vermelha, para a lista não
  apodrecer.

### 5.5 V2 + V3 + D4 — "Rotinas e tarefas"

**`nav.ts`** — seção Organização:

| Antes | Depois |
| --- | --- |
| TO-DO · Agenda · Tarefas `/tarefas` · Rotinas `/rotinas` · Hábitos · Estudos | TO-DO · Agenda · **Rotinas e tarefas** `/rotinas` (`tambem: ["/tarefas"]`, ícone `Repeat`) · Hábitos · Estudos |

```ts
export type NavItem = {
  title: string;
  href: string;
  /** Outras rotas que este item representa (acendem ele). Sem query, sem barra final. */
  tambem?: readonly string[];
  icon: LucideIcon;
  phase?: string;
};
```

**`hrefAtivo` (`src/lib/nav/active.ts`, continua sem imports):**

```ts
export type AlvoDeNavegacao = string | { readonly href: string; readonly tambem?: readonly string[] };
export function hrefAtivo(pathname: string, alvos: readonly AlvoDeNavegacao[]): string | null;
```

Cada rota declarada de cada alvo (`href` e cada `tambem`) disputa; vence a mais funda; devolve o
**`href` do alvo dono**. A comparação por comprimento continua **exata** (toda rota que casa é
ancestral-ou-igual do mesmo `pathname`). Quem passa strings — `module-shell`, as abas, o
Financeiro — tem comportamento **idêntico**. A 05 reusa igual: `/cartoes` com
`tambem: ["/faturas", "/parcelamentos"]`.

**Casca:** `nav-links.tsx` passa `allNavItems` em vez de `navHrefs` — **uma linha, exceção
declarada (D2)**; `findNavItem` idem. `/(app)/configuracoes` medido antes × depois.

**Nenhuma URL muda. Nenhuma pasta move.** Sem redirect, sem route group. `/tarefas` continua
respondendo com `view` e `date`.

**D4 — `src/components/shared/abas-de-rota.tsx`** (`"use client"`), extraído de
`finance-tabs-nav.tsx`:

```ts
export function AbasDeRota(props: {
  rotulo: string;                                        // nome do landmark
  abas: readonly { href: string; rotulo: string }[];
}): React.ReactElement;
```

Item ativo por `hrefAtivo` (a mesma decisão). Ativo: sublinhado `border-primary` + **`font-semibold`**
+ `aria-current="page"`; foco `focus-visible:ring-2 ring-inset ring-ring` (inset, porque a fita
rola). `finance-tabs-nav.tsx` vira dados + `<AbasDeRota rotulo="Seções de Financeiro" …>` —
**mudança visível: a aba ativa do Financeiro fica em negrito** (D4). `financeiro/layout.tsx`
não muda.

**As duas telas** (`routines-client.tsx`, `tasks-client.tsx`) passam a ter o mesmo título
**"Rotinas e tarefas"** no `PageHeader` (cada uma com a sua descrição e as suas ações) e, logo
abaixo, `RotinasETarefasAbas` (`src/components/tasks/rotinas-e-tarefas-abas.tsx`, Rotinas |
Tarefas). O título "Tarefas & Rotinas" de hoje some. O `<title>` da aba do navegador
(`metadata`) continua "Rotinas" e "Tarefas" — é ele que distingue as duas no histórico. O
`<a href="/rotinas">` cru de `tasks-client.tsx:570` vira `Link`.

**Testes (mudam só para afirmar o contrato novo; nenhuma asserção afrouxa):**

- `active.test.ts`:
  - `/tarefas` acende "Rotinas e tarefas" — **caso explícito**;
  - `hrefAtivo` com alvos: o `tambem` mais fundo vence um `href` mais raso de outro item, a ordem
    da lista não decide, e string pura continua como antes;
  - "nenhuma rota real acende mais de um item" passa a contar **itens**;
  - **novo:** nenhuma rota real é **reivindicada por dois itens na mesma profundidade**. É o que
    pega "dois acesos" mesmo quando o desempate esconderia um;
  - "toda rota acende um item, salvo `/busca`" — inalterado, agora sobre os itens;
  - "o item aceso é ancestral-ou-igual" vira "**a rota declarada que venceu** é ancestral-ou-igual
    da rota aberta". Com `tambem`, `/rotinas` não é ancestral de `/tarefas`, e a afirmação
    antiga seria falsa, não mais fraca.
- `nav.test.ts`:
  - toda rota de `tambem` também tem `page.tsx` e a mesma forma (absoluta, sem query, sem barra
    final);
  - **nenhuma rota é declarada por dois itens** (href ou `tambem`), estendendo "nenhum href se
    repete";
  - as abas de Rotinas e tarefas são **exatamente** `[item.href, ...item.tambem]` do item do
    menu — as abas e a sidebar não podem divergir.
- `src/components/shared/abas-de-rota.test.ts`: o landmark tem nome, o ativo tem `aria-current`
  e peso, o foco é visível; `finance-tabs-nav.tsx` e `rotinas-e-tarefas-abas.tsx` importam o
  componente e **não** montam `<Link` por conta própria (a cópia não volta por dentro deles).

### 5.6 V7 — alinhamento visual, uma tela por commit

Critério para estado vazio: **lista ou seção inteira vazia → `EmptyState`**; célula de grade,
coluna de quadro e dica dentro de painel continuam dica em linha (um `EmptyState` de 56 px por
dia da semana seria pior). Critério para estado: **ícone e/ou palavra além da cor**, e o
atributo ARIA que o anuncia. `useUrlText` continua onde está (nenhum campo destas telas lê texto
da URL hoje, conferido). Diálogos continuam como estão — os lazy seguem lazy, com a exceção
conhecida do `TodoLinkDialog`.

**Agenda**
- A1 · `aria-current="date"` no dia de hoje (`components/calendar/month-view.tsx:55`,
  `time-grid.tsx:55`).
- A2 · Regra 2: rótulo do período (`agenda-client.tsx:200`) e local do evento
  (`event-details.tsx:84-86`) ganham `min-w-0` + `truncate`/`break-words`.

**Rotinas e tarefas**
- R1 · Seção vazia vira `EmptyState` compacto: "Rotinas de hoje" (`routines-client.tsx:141`) e
  "Rotinas" na visão Hoje (`tasks-client.tsx:569`).
- R2 · Estado anunciado: chips de projeto (`tasks-client.tsx:415`) ganham `aria-pressed` + peso;
  dias da semana dos formulários (`task-form.tsx:381`, `routine-form.tsx:245`) e amostras de cor
  (`project-form.tsx:141,154`, `routine-form.tsx:277,290`) ganham `aria-pressed`.
- R3 · Atrasada no cartão compacto (`components/tasks/task-card.tsx:126`): ícone + a palavra
  (`sr-only` no compacto), como o TO-DO já faz com `TriangleAlert`.
- R4 · `aria-current="date"` no hoje (`tasks-client.tsx:632`, `components/tasks/task-calendar.tsx:105`).
- R5 · Regra 2: `tasks-client.tsx:594`, `task-details.tsx:119-128, 272`, `routine-form.tsx:373`.
- R6 · F5: gaveta "Projetos" (`tasks-client.tsx:697`) com `data-[side=right]:w-full
  data-[side=right]:sm:max-w-md` (384 → 448 px no desktop, largura toda no celular).

**TO-DO** (monólito de 1.759 linhas — **quebrá-lo não é objetivo**; mudanças cirúrgicas)
- T1 · Regra 5: a coluna de navegação (`todo-nav.tsx:407`) sai de `sticky top-4` para
  `sticky top-18` com teto `max-h-[calc(100vh-5.5rem)]`. Com `top-4`, os primeiros 48 px da
  coluna escorregam para trás do Header (`sticky top-0 h-16`) ao rolar.
- T2 · Regra 2: o `PageHeader` com `flex-1` ao lado do botão `shrink-0` (`todo-client.tsx:677`)
  ganha `min-w-0`.
- T3 · F5: painel de detalhe (`components/todo/task-detail-sheet.tsx:233`) com
  `data-[side=right]:w-full data-[side=right]:sm:max-w-xl` (384 → 576 px no desktop, largura toda
  no celular). **Mudança visível**: é a largura que o autor pediu e nunca teve. A gaveta de
  navegação do TO-DO (`todo-nav.tsx:425`, `side="left"`) passa a `data-[side=left]:w-[17rem]`
  (hoje sai com 3/4 da tela no celular e 384 px no tablet).
- T4 · `aria-current="date"` no hoje (`components/todo/task-calendar.tsx:201`); a tarefa atrasada
  no calendário (`:250`) ganha `TriangleAlert`.
- T5 · Prioridade na linha (`task-row.tsx:164`): a bandeira ganha a palavra curta **P1/P2/P3** ao
  lado; P4, a padrão, não ganha nada. **Mudança visível** na lista principal.
- T6 · Prazo próximo (`todo/badges.tsx:191`): "Prazo próximo · 30/09" em vez de só o âmbar.
- T7 · Contagem de "Hoje" com atrasadas (`todo-nav.tsx:114,226`): `TriangleAlert` + rótulo
  acessível "N, com atrasadas".
- T8 · Alternador só-ícone (`todo-client.tsx:806`): a ativa ganha uma barra de 2 px sob o ícone
  (forma, não matiz). Já tem `aria-pressed` e `aria-label`.

**Testes da V7:**
- `src/test/separacao-todo-tarefas.test.ts` (**M10**): nada em `components/tasks/`,
  `app/(app)/tarefas/`, `app/(app)/rotinas/` importa `@/lib/todo`, `@/components/todo` ou
  `@/lib/actions/todo*`; e nada em `components/todo/`, `app/(app)/todo/` importa `@/lib/tasks`,
  `@/components/tasks` ou `@/lib/actions/{tasks,routines,projects}`. Com guarda de que cada lado
  lê arquivos de verdade.
- `src/components/ui/sheet-largura.test.ts`: nenhum `<SheetContent>` lateral passa largura
  **sem** o prefixo `data-[side=…]:` (a largura sem prefixo é código morto — F5). Exceções
  **declaradas** com dono: os seis arquivos de Dieta/Treinos do F5 (07-B/07-C),
  `layout/mobile-nav.tsx` (casca — proibida nesta subfase) e `shared/module-shell.tsx`
  (compartilhado por Dieta, Treinos e IA — 07-B/C/D). O teste também afirma que cada exceção
  ainda casa. Lado padrão da primitiva conferido antes de varrer (um `<SheetContent>` sem `side`
  é lateral).
- `src/test/organizacao-contratos.test.ts`: uma tabela (arquivo × padrão exigido × por quê)
  para os itens da V7 que alguém desfaria sem perceber — `aria-current="date"` nos quatro
  calendários, `sticky top-18` no `todo-nav`, `aria-pressed` nos chips/dias/amostras. Varredura
  sem comentários.

---

## 6. Mutações — o critério de aceite

Aplicadas **uma a uma**, cada uma **compilando**. Registra-se o **nome** de cada teste que cai.
Restauração conferida por `git diff --quiet`, **nunca** pelo verde. Mutação que sair verde é
**medida** antes de ser chamada de fraqueza (D28). ⛔ Nenhuma mutação toca arquivo da 03-B2.

| # | Mutação | Tem de derrubar |
| --- | --- | --- |
| M1 | o seletor compartilhado perde `aria-pressed` | `seletor-de-visao.test.ts` (estado anunciado) |
| M2 | `agenda-client.tsx` volta a montar `CALENDAR_VIEWS.map(… <button …)` | `seletor-de-visao.test.ts` (nenhuma tela monta o próprio bloco) |
| M3 | `"atrasadas"` sai de `TASK_VIEWS` | `deep-links-query-string.test.ts`, nomeando `generate.ts:380` |
| M4 | `resolveRoute` deixa de aceitar `v=projeto` | `deep-links-query-string.test.ts` |
| M5 | `hrefAtivo` ignora `tambem` | `active.test.ts` (`/tarefas` não acende nada) |
| M6 | um segundo item (Agenda) passa a declarar `tambem: ["/tarefas"]` | `active.test.ts` (reivindicada por dois) e `nav.test.ts` |
| M7 | "Rotinas e tarefas" aponta para `/rotina` | `nav.test.ts` |
| M8 | `configuracoes/page.tsx` volta a importar de `@/app/(app)/agenda/…` | `imports-entre-rotas.test.ts` |
| M9 | `"Fase 09"` volta ao rótulo da busca | `rotulos-visiveis.test.ts` |
| M10 | `components/tasks/task-card.tsx` importa de `@/lib/todo/constants` | `separacao-todo-tarefas.test.ts` |
| M11 | o extrator volta a casar só `link:` | `deep-links-inline.test.ts` (fixture da forma nova) e o piso de `generate.ts` |
| M12 | `AbasDeRota` perde o `aria-label` | `abas-de-rota.test.ts` |
| M13 | o `tambem` aponta para `/tarefa` | `nav.test.ts` |
| M14 | o painel de detalhe do TO-DO volta a `sm:max-w-xl` sem prefixo | `sheet-largura.test.ts` |
| M15 | `todo-nav.tsx` volta a `sticky top-4` | `organizacao-contratos.test.ts` |
| M16 | o seletor perde a marca ✓ do ativo | `seletor-de-visao.test.ts` (mais que cor) |

---

## 7. Orçamento de bundle

| Rota | Antes | Teto | Expectativa |
| --- | --- | --- | --- |
| `/(app)/todo` | 237,6 | **250** | ~0 (classes e três ícones já importados no módulo) |
| `/(app)/configuracoes` | 281,7 | **285, sem subir** | ~0 (V6 só move arquivo; D2 é uma linha na casca) |
| `/(app)/habitos` | 238,7 | 250 | ~0 (troca bloco por componente de ~1 KB) |
| demais | — | 250 | nenhuma fora |

Medido depois de **cada** passo que toca runtime, não só no fim.

---

## 8. D5 — o dourado cravado fica

| Onde | Papel | Decisão |
| --- | --- | --- |
| `lib/calendar/colors.ts:12` | default do tipo "pessoal" | **mantido** |
| `lib/tasks/constants.ts:135` | default da prioridade "alta" | **mantido** |
| `lib/tasks/constants.ts:141` | default da rotina "manhã" | **mantido** |
| `app/(app)/agenda/event-form.tsx:95` | fallback do formulário | **mantido** |
| `lib/tasks/constants.ts:151` | opção da **paleta** (dado gravado) | **nunca muda** |

Por quê: TOKENS §1 (aprovado) diz que cor de entidade não muda, e trocar por azul recriaria a
colisão da 02-A — `#2F6FED` já é a prioridade "média", o tipo "trabalho" e a opção "Azul". O preço
declarado: um tom dourado órfão num app azul.

---

## 9. O que NÃO muda

- ⛔ **Nenhuma migration.** `calendar_events.task_id` sem interface e
  `todo_calendar_sync.local_event_id` sem uso: **registrados, não tocados**.
- ⛔ `src/lib/todo/**`, `src/lib/tasks/**`, `src/lib/calendar/**` sem mudança de comportamento
  (as invariantes do TO-DO ficam intocadas).
- ⛔ **Arquivos da 03-B2, só lidos:** `src/lib/finance/**`, `src/lib/notifications/**`,
  `src/lib/search/queries.ts`, `src/lib/ai/**`, `src/lib/dashboard/**`, `src/lib/reports/**`,
  `src/app/(app)/dashboard/**`, `src/app/(app)/financeiro/page.tsx`,
  `src/app/(app)/financeiro/contas/**`.
- ⛔ `floating-assistant*.tsx`, os 11 ids de `DASH_CARD_IDS`, a casca além de `nav.ts` **e da
  linha autorizada em `nav-links.tsx` (D2)**.
- ⛔ Nenhuma rota morre, nenhum parâmetro deixa de ser aceito: `/tarefas?view=&date=`,
  `/agenda?view=&date=`, `/todo?v=&id=&view=&m=&task=`.
- ⛔ `docs/redesign/STATUS.md` não é editado.
- Sem push, sem merge, sem deploy, sem upstream.

---

## 10. A prévia

Dados **sintéticos**, marcados na própria imagem. Gerada fora do repositório (scratchpad da
sessão): HTML estático com as classes **exatas** dos componentes atuais e propostos (ícones pelo
`lucide-react` do worktree), pintado pelo `src/app/globals.css` real compilado com
`npx @tailwindcss/cli@4.3.1`, fotografado no Chrome headless em claro/escuro × 1280/390.

⚠️ **O Chrome headless não desce abaixo de 500 px de layout** (medido: `innerWidth=500` com
`--window-size=390`). A primeira captura "390" estava errada por isso; a 390 foi refeita dentro
de um `iframe` de 390 px, cujo viewport é a largura dele. Quem refizer precisa saber disso.

Mostra: a seção Organização hoje × proposta com `/tarefas` aberta; as abas nas duas telas e no
Financeiro (mesmo componente); o seletor hoje × proposto nas quatro telas; o **foco de teclado
visível**; e a gaveta do celular. As imagens não foram commitadas (repositório público; nenhuma
fase anterior commitou PNG).

---

## 11. Risco residual

| Risco | Por que fica |
| --- | --- |
| `date` interpolado nos deep-links | Não é verificável lendo o código. Conferido à mão hoje (§5.3.4); uma troca de `dateInSaoPaulo` por `.slice(0,10)` num dos dois não fica vermelha aqui |
| A varredura de deep-links cobre só `search/queries.ts` e `notifications/generate.ts` | O link da IA (`rota:`, F1) e qualquer quarto arquivo ficam de fora — como no R4 |
| O recentrar da opção ativa (F4) | É comportamento de DOM; sem teste de componente no projeto, fica na conferência manual. A varredura prova o anúncio (`aria-pressed`), não a rolagem |
| `aria-pressed` = uma parada de Tab por visão | Escolha consciente (§5.4); `radiogroup` sem foco itinerante seria pior |
| F5 continua vivo em Dieta, Treinos e nas gavetas `side="left"` | Fora do lote; exceções nomeadas no teste, com dono |
| F3 continua vivo no Dashboard | Fora do lote; exceção nomeada no teste, com dono (REDESIGN-06) |
| Prioridade do cartão de Tarefas só por cor da borda (F9) | Decisão de densidade, fora desta subfase |
| Falha de ambiente CRLF na suíte do worktree | Não é código; confere-se que é a única e é a mesma |

---

## 12. Ordem (um commit por passo)

Cada passo fecha com `npx vitest run` verde nos diretórios tocados (salvo a falha de ambiente
declarada) e `git diff` revisado — nada de `.env`, chave, token ou `service_role`.

0. Este desenho (só docs).
1. **V6** — mover `GoogleConnectCard` + `imports-entre-rotas.test.ts`.
2. **V5** — rótulo + `rotulos-visiveis.test.ts`.
3. **V4** — extrator compartilhado (com a forma `link =`), `resolve-route.ts`,
   `deep-links-query-string.test.ts`. Nasce verde; só a mutação prova.
4. **V1** — `SeletorDeVisao` nas quatro telas + teste.
5. **V2 + V3 + D4** — `tambem`, `hrefAtivo`, `nav-links` (1 linha), `AbasDeRota`, Financeiro,
   Rotinas e tarefas + testes.
6. **V7** — Agenda · Rotinas e tarefas · TO-DO, um commit cada, com os testes da V7.
7. Mutações M1–M16, uma a uma, e os cinco comandos.

**Roteador:** cada passo substancial passa pelo `ai-router-br:route`, com o TASK PACKAGE
**fatiado por passo** (a 03-B mostrou que ~10 arquivos estouram o Codex). Desenho, decisões e
acessibilidade ficam no principal.

---

## 13. O que o dono confere à mão (logado no `npm run dev` do worktree)

- Cada troca de visão nas quatro telas (Agenda, Tarefas, Hábitos, Estudos), com mouse **e**
  teclado (Tab + Espaço), e o anel de foco visível.
- `/tarefas?view=atrasadas` aberto como numa notificação — **a 390 px**, "Atrasadas" aparece
  selecionada sem rolar a trilha à mão.
- `/todo?v=projeto&id=<um projeto>&task=<uma tarefa>` abrindo o painel da tarefa — agora com
  576 px no desktop e a largura toda no celular.
- O cartão do Google em Configurações e na Agenda.
- A sidebar no celular: "Rotinas e tarefas" acesa em `/rotinas` **e** em `/tarefas`; as abas
  levando de uma à outra.
- As abas do Financeiro (a ativa em negrito).
