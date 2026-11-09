# Tokens visuais — REDESIGN-01-B (revistos pela 09-A, vidro)

Direção original (01-B): SaaS moderno, limpo, profissional, confortável para uso diário.
Claro: azul de destaque, branco e cinzas **frios**. Escuro: grafite frio, texto claro, azul.

⚠️ **Desde 2026-11-07 a 09-A reescreveu a superfície**: a casca virou **vidro** sobre uma
**névoa** de fundo, a fonte e o raio mudaram, e os textos foram remedidos sobre as superfícies
novas. Os §1, §2, §3, §4, §5, §7 e a regra 7 do §8 abaixo já refletem isso, e a **09-B**
acrescentou o §6-B (materiais e primitivas). Desenho:
`docs/superpowers/specs/2026-11-07-redesign-09-vidro-design.md`.

Nenhum valor aqui foi escolhido no olho: os de contraste foram medidos e a paleta de gráficos
passou pelo validador, com os comandos registrados na §7 para você refazer.

---

## 1. O que NÃO muda

| Item | Valor | Por quê |
| --- | --- | --- |
| `--font-mono`, `--font-heading` | como estão | `--font-heading` é alias de `--font-sans` |
| **Cores de entidade** | todos os hex em `lib/*/constants.ts`, `calendar/colors.ts`, o default `'#A98438'` de `categories`, cores de cartão/conta | São **suas escolhas**, não identidade do app |
| **Semântica de alerta** | os ~120 usos de `amber-*` | Significam atenção, não marca |

### O que a 09-A MUDOU nesta seção (2026-11-07)

| Item | Antes (01-B) | Agora (09-A) | Por quê |
| --- | --- | --- | --- |
| **Tipografia** | `Arial, "Helvetica Neue", Helvetica, …` — "exigência sua, copiar literalmente, não há `next/font` e não vai haver" | `--font-sans: -apple-system, BlinkMacSystemFont, var(--font-inter), "Segoe UI", system-ui, sans-serif` | Decisão sua, aprovada na prévia que você viu em 2026-11-07 (a prévia declarava a troca por escrito). Spec §6.4 |
| **Fonte de reserva** | — | **Inter** por `next/font/google`: auto-hospedada, só `latin`, `display: swap`, **`preload: false`** | No iPhone e no Mac sai a fonte do sistema, sem baixar nada; no Windows e no Android sai a Inter. Sem `preload: false`, o aparelho Apple baixaria uma fonte que nunca usa. "Não há `next/font`" **caiu** |
| **Escala de raio** | `--radius: 0.7rem`; "arredondamento excessivo está fora da direção" | `--radius: 1rem`; a escala derivada (`--radius-sm` … `--radius-4xl`) sobe junto | Substitui a frase da 01-B (spec §6.5). Raio por hierarquia e **concêntrico**: blocos 28 px, indicadores 24 px, ladrilhos e campos 14–16 px, botões e etiquetas em pílula |

⚠️ O `--radius` novo é só o ponto de partida: o construtor confere os usos de `rounded-*` que
ficarem exagerados, em vez de trocá-los um por um por padrão.

---

## 2. ✅ A trava que caiu ANTES dos tokens — REDESIGN-02-A

`"Dourado"` é uma cor que **você escolhe** para projetos e etiquetas, e estava implementada
com o token de **marca** (`bg-primary`). Trocar `--primary` para azul faria todo item marcado
como "Dourado" virar azul em silêncio, **indistinguível do item `"azul"` da mesma paleta**.

**A varredura achou mais três casos do mesmo mecanismo**, que o plano não previa — todos
invisíveis hoje porque a marca ainda é dourada, e todos quebrando no instante em que ela vira
azul:

| Onde | Era | Virou | Com quem colidia |
| --- | --- | --- | --- |
| `todo/constants.ts` `TODO_COLOR_DOT.gold` | `bg-primary` | `bg-yellow-600` | `azul` (`bg-sky-500`) |
| `todo/constants.ts` `TODO_COLOR_CHIP.gold` | `bg-primary/15 text-primary` | `bg-yellow-500/15 text-yellow-700 dark:text-yellow-400` | `azul` |
| `todo/constants.ts` prioridade **P2** | `text-primary` | `text-warning-ink` | **P3** (`text-sky-600`) |
| `tasks/badges.tsx` prioridade **alta** | `bg-primary/10 text-primary` | `bg-warning/10 text-warning-ink` | **media** (`sky`) |
| `training/consistency-calendar.tsx` **descanso** | `bg-sky-500/20` | `bg-violet-500/25` | **parcial** (`bg-primary/45`) |

⚠️ **Por que `yellow` e não `amber`.** A 01-B propunha `bg-amber-500`. Amber-500 (`#f59e0b`) é
vizinho de `orange-500` (`#f97316`), que já é o item **`laranja`** da mesma paleta — a correção
trocaria uma colisão por outra. `yellow-600` (`#ca8a04`) é o que mais se aproxima do dourado
real (`#C99A2E`) e se separa bem do laranja.

⛔ **`treinado: "bg-primary"` continua certo e NÃO é violação.** Ali o destaque *é* a marca,
não uma escolha sua. A regra proíbe a marca ocupar o lugar de um **dado**.

**Prova:** `src/lib/theme/entity-colors.test.ts` (7 casos), **confirmado por 5 mutações** —
cada uma das cinco linhas acima, revertida uma a uma, deixa a suíte vermelha.

⚠️ **Nota da 09 (vidro): a superfície mudou, a trava não.** Nas tabelas acima "`bg-primary`" e
"o branco puro" são do tempo das superfícies opacas. Hoje `--card` **é o vidro**
(`var(--glass)`, translúcido sobre a névoa) e a superfície em que tudo é **medido** é
`--glass-solid` — o vidro composto sobre `--fog-base`, opaco (`#f5f7fa` no claro, `#14171e` no
escuro). Os substitutos de cor de entidade desta seção (`yellow-600`, `violet-500/25`,
`text-warning-ink`…) não dependem da superfície e continuam valendo; o que mudou foi o fundo
contra o qual os contrastes são conferidos (§3 e §4).

---

## 3. Tokens — tema CLARO ✅ **reescritos na 09-A (vidro)**

A 01-B/02-B definiu um claro de superfícies **opacas** (`--card` branco). A 09-A trocou a
superfície por **vidro translúcido sobre uma névoa**: o fundo é `--fog-base` com três manchas
(`--fog-1..3`) desenhadas por cima, e o vidro (`--glass`) é composto por cima delas.

⛔ **O que foi medido.** Cada texto é medido contra **quatro superfícies**: `--glass-solid`
(o vidro sobre a base, opaco) **e** o vidro composto sobre o **centro de cada uma das três
manchas** — o pior caso de verdade. Texto direto sobre a névoa aberta (`--foreground` e
`--muted-on-fog`) é medido sobre a base e sobre cada mancha. O teste
`src/lib/theme/contraste-dos-tokens.test.ts` exige **≥ 4,5:1** em todas e falha dizendo para
*baixar o alfa da névoa antes de escurecer o texto*.

```css
:root {
  --font-sans: -apple-system, BlinkMacSystemFont, var(--font-inter), "Segoe UI", system-ui, sans-serif;
  --radius: 1rem;

  /* NÉVOA: base opaca + três manchas translúcidas. Alfas já baixados pela medição. */
  --fog-base: #e8ecf3;
  --fog-1: rgba(120, 160, 235, 0.45);
  --fog-2: rgba(196, 186, 240, 0.6);
  --fog-3: rgba(244, 214, 178, 0.7);

  /* VIDRO. --glass-solid É a superfície da validação (vidro sobre a base). */
  --glass: rgba(255, 255, 255, 0.56);
  --glass-solid: #f5f7fa;
  --glass-strong: rgba(255, 255, 255, 0.94);
  --glass-border: rgba(255, 255, 255, 0.78);
  --glass-hi: rgba(255, 255, 255, 0.95);
  --glass-lo: rgba(255, 255, 255, 0.35);
  --glass-sheen: rgba(255, 255, 255, 0.55);
  --glass-shadow: 0 1px 2px rgba(16, 24, 40, 0.04), 0 20px 50px -22px rgba(30, 45, 90, 0.28);
  --tile: rgba(255, 255, 255, 0.55);       --tile-border: rgba(255, 255, 255, 0.7);
  --tile-solid: #fbfbfd;                   /* 09-B: tile sobre --glass-solid */
  --popover-solid: #fefefe;                /* 09-B: --glass-strong sobre --fog-base */
  --pill: rgba(255, 255, 255, 0.82);       --pill-strong: #ffffff;
  --track: rgba(22, 24, 29, 0.06);         --grid: rgba(22, 24, 29, 0.07);   /* --track era .07 */

  /* A casca aponta para o vidro */
  --background: var(--fog-base);
  --card: var(--glass);      --popover: var(--glass-strong);      --sidebar: var(--glass);

  --foreground: #16181d;                   /* + --card-foreground, --popover-foreground */
  --muted-foreground: #596070;
  --muted-on-fog: #454b5a;                 /* secundário direto sobre a névoa aberta */

  --primary: #0062d6;                      /* azul como TEXTO/link */
  --primary-foreground: #ffffff;
  --primary-fill: #0062d6;                 /* azul como PREENCHIMENTO (botão), texto branco */
  --primary-fill-foreground: #ffffff;

  --accent: #e7f1fe;   --accent-foreground: #1f4371;
  --destructive: #c2262e;
  --success-ink: #006303;   --warning-ink: #8a5a01;   --info-ink: #0062d6;
  --ring: #0062d6;
}
```

**Contrastes medidos** (o **menor** entre as quatro superfícies de vidro; a mancha que dá o
mínimo entre parênteses — `g` = vidro, `fog-k` = mancha k):

| Texto | Mínimo no claro |
| --- | --- |
| `--foreground` | **14,41:1** (g/fog-1) |
| `--muted-foreground` | **5,11:1** (g/fog-1) |
| `--primary` | **4,58:1** (g/fog-1) |
| `--destructive` | **4,72:1** (g/fog-1) |
| `--success-ink` | **6,11:1** |
| `--warning-ink` | **4,81:1** |
| `--info-ink` | **4,58:1** |

Direto sobre a névoa aberta: `--foreground` **10,73:1** · `--muted-on-fog` **5,27:1**.
Preenchimentos: `--primary-fill-foreground` sobre `--primary-fill` **5,65:1**;
`--primary-foreground` sobre `--primary` **5,65:1**; `--accent-foreground` sobre `--accent`
**8,77:1**.

⚠️ **Folga pequena.** Os pares mais apertados são `--primary`/`--info-ink` (4,58:1). Subir o
alfa de `--fog-1` no claro quebra o teste — e é para baixar o alfa, não escurecer o texto.

⚠️ **Um segundo `--primary` mora aqui de propósito.** `--primary` continua sendo a cor de
**texto** (182 usos de `text-primary` não mudam); o **preenchimento** com texto branco é
`--primary-fill`. No claro os dois valem `#0062d6`.

⚠️ **Ajustado pela 09-B ao medir as primitivas** (a execução corrigiu o que o plano previa):
`--track` caiu de `.07` para **`.06`** no claro — com `.07` a aba inativa (`--muted-foreground`
sobre `--track` sobre o vidro, na mancha azul) media 4,45:1, abaixo de 4,5. Baixou-se o alfa do
trilho, não se escureceu o texto. `--tile-solid` e `--popover-solid` são **sólidos compostos**
(`compor()` do teste de contraste, não aproximação): é o que `--tile` e `--glass-strong`
resolvem quando não há névoa atrás (transparência reduzida, ver §6-B).

Não tocados pela 09-A (seguem como na 02-B): `--secondary`, `--muted`, `--border`, `--input`,
`--success`/`--warning`/`--info` de preenchimento e os `--sidebar-*` restantes.

## 4. Tokens — tema ESCURO ✅ **reescritos na 09-A (vidro)**

Mesma estrutura do claro. A base é quase preta (`--fog-base`) e as manchas são azul, violeta e
verde-azulado profundos; o vidro é grafite translúcido.

```css
.dark {
  --fog-base: #0a0c11;
  --fog-1: rgba(34, 78, 170, 0.55);
  --fog-2: rgba(88, 56, 150, 0.6);
  --fog-3: rgba(16, 96, 92, 0.54);

  --glass: rgba(28, 31, 40, 0.58);
  --glass-solid: #14171e;                  /* a superfície da validação */
  --glass-strong: rgba(38, 42, 52, 0.97);  /* 09-B: era .95 */
  --glass-border: rgba(255, 255, 255, 0.1);
  --glass-hi: rgba(255, 255, 255, 0.14);
  --glass-lo: rgba(255, 255, 255, 0.04);
  --glass-sheen: rgba(255, 255, 255, 0.07);
  --glass-shadow: 0 1px 2px rgba(0, 0, 0, 0.3), 0 26px 60px -24px rgba(0, 0, 0, 0.7);
  --tile: rgba(255, 255, 255, 0.05);       --tile-border: rgba(255, 255, 255, 0.07);
  --tile-solid: #202329;                   /* 09-B: tile sobre --glass-solid */
  --popover-solid: #252933;                /* 09-B: --glass-strong sobre --fog-base */
  --pill: rgba(255, 255, 255, 0.1);        --pill-strong: rgba(255, 255, 255, 0.16);
  --track: rgba(255, 255, 255, 0.09);      --grid: rgba(255, 255, 255, 0.07);

  --background: var(--fog-base);
  --card: var(--glass);      --popover: var(--glass-strong);      --sidebar: var(--glass);

  --foreground: #f2f4f8;
  --muted-foreground: #a1a8b6;   --muted-on-fog: #a1a8b6;

  /* No escuro o azul de TEXTO é claro; o de PREENCHIMENTO é mais fundo, com texto branco. */
  --primary: #6ea7ec;            --primary-foreground: #0d2847;
  --primary-fill: #1f6fe5;       --primary-fill-foreground: #ffffff;

  --accent: #233041;   --accent-foreground: #cbe0fc;
  --destructive: #ff6468;
  --success-ink: #3fcf7f;   --warning-ink: #fab21c;   --info-ink: #6ea7ec;
  --ring: #6ea7ec;
}
```

**Contrastes medidos** (menor entre as quatro superfícies de vidro; no escuro o pior caso é
sempre `fog-3`):

| Texto | Mínimo no escuro |
| --- | --- |
| `--foreground` | **13,26:1** (g/fog-3) |
| `--muted-foreground` | **6,11:1** (g/fog-3) |
| `--primary` | **5,84:1** (g/fog-3) |
| `--destructive` | **5,06:1** (g/fog-3) |
| `--success-ink` | **7,26:1** |
| `--warning-ink` | **7,96:1** |
| `--info-ink` | **5,84:1** |

> **09-F:** `--fog-1` e `--fog-3` do escuro baixaram para .55 e .54; as razões desta tabela são as da 09-A e ficaram um pouco maiores. A verdade viva é `contraste-dos-tokens.test.ts`.

Direto sobre a névoa aberta: `--foreground` **10,73:1** · `--muted-on-fog` **4,95:1**.
⚠️ **09-F T3:** o ladrilho direto na névoa (`EmptyState`) reprovou no escuro com `--muted-foreground` (4,36:1 em `fog-1`, 4,26:1 em `fog-3`). Baixou-se o alfa da névoa, não o texto: `--fog-1` 0,60 → **0,55** (4,63:1) e `--fog-3` 0,60 → **0,54** (4,56:1). `--fog-2` ficou.
Preenchimentos: `--primary-fill-foreground` sobre `--primary-fill` **4,70:1**;
`--primary-foreground` sobre `--primary` **5,95:1**; `--accent-foreground` sobre `--accent`
**9,94:1**.

⚠️ **Folga pequena no escuro:** `--muted-on-fog` (4,95:1) e `--primary-fill` (4,70:1). Subir o
alfa de `--fog-3` no escuro quebra o teste.

⚠️ **Ajustado pela 09-B:** `--glass-strong` subiu de `.95` para **`.97`** no escuro — com `.95` o
`--destructive` sobre o popover, com um `#fff` atrás, caía a 4,26:1. Alfa mais alto, texto
intocado. O sólido equivalente (`--popover-solid` `#252933`) e o do ladrilho (`--tile-solid`
`#202329`) existem nos dois temas.

---

## 5. Tokens SEMÂNTICOS — novos

Hoje só existe `--destructive`. A ausência de `success`/`warning`/`info` é o que produziu
**212 ocorrências** de `text-emerald`/`text-red-` em 105 arquivos e ~120 de `amber` em ~60.

✅ **Valores da 09-A** (os `oklch` de `-ink` da 01-B foram trocados por hex medidos sobre o
vidro; a tabela de contrastes está nas §3 e §4). O princípio e o motivo do `-ink` separado
seguem valendo. Os preenchimentos (`--success`, `--warning`, `--info`) não mudaram.

```css
:root {
  --success: oklch(0.621 0.207 143);        /* preenchimento, ponto, ícone, borda */
  --success-foreground: oklch(1 0 0);
  --success-ink: #006303;                   /* TEXTO usa este — 6,11:1 */

  --warning: oklch(0.811 0.164 78);
  --warning-foreground: oklch(0.25 0.05 78);
  --warning-ink: #8a5a01;                   /* 4,81:1 */

  --info: oklch(0.575 0.163 256);
  --info-foreground: oklch(1 0 0);
  --info-ink: #0062d6;                      /* 4,58:1 */
}
.dark {
  --success: oklch(0.621 0.207 143);  --success-ink: #3fcf7f;   /* 7,26:1 */
  --warning: oklch(0.811 0.164 78);   --warning-ink: #fab21c;   /* 7,96:1 */
  --info: oklch(0.717 0.118 254);     --info-ink: #6ea7ec;      /* 5,84:1 */
}
```

⚠️ Os contrastes acima são o **mínimo entre as quatro superfícies de vidro** (a mancha que dá o
mínimo está nas §3 e §4), não mais "sobre o branco" como na 01-B.

⛔ **Por que existe `-ink` separado.** `#0ca30c` sobre branco dá **3,35:1** — bom para um
ponto, um ícone ou uma borda; **reprovado para texto**. Um token só levaria alguém a escrever
`text-success` num rótulo e produzir texto ilegível que passa despercebido em revisão. `-ink`
é a versão legível; o outro é para preenchimento.

⛔ **Cor nunca sozinha.** Todo estado carrega ícone **e** palavra. Vale para claro, escuro,
daltonismo e impressão.

---

## 6. `--gold` e `text-gradient-gold`

`--gold`/`--gold-foreground` existem e têm **exatamente o mesmo valor** de `--primary` nos dois
temas — duplicação pura. `text-gradient-gold` tem **um único consumidor**
(`src/app/(auth)/layout.tsx:36`).

**Decisão:** `--gold` vira **alias de `--primary`** na 02-B (some como conceito, sem quebrar
nada que o use), e o utilitário é renomeado para `text-gradient-brand`, ajustando o único
consumidor. `::selection` passa a usar `--primary`.

✅ **Feito na 02-B.** A varredura confirmou o que a 01-B supunha: **`--gold` não tem um único
consumidor em `src/`** — as utilitárias `bg-gold`/`text-gold` estavam registradas e nunca
foram usadas. Sobraram os dois decorativos deste arquivo.

⚠️ **O apelido é declarado nos DOIS temas, de propósito.** Uma custom property resolve o
`var()` no elemento em que é declarada. Se a classe `.dark` não caísse no mesmo elemento que
`:root`, uma declaração só faria o valor do tema **claro** vazar para o escuro. Duas linhas
removem a dependência de onde o `.dark` é pendurado — e a mutação que devolve um literal ao
escuro deixa `tokens.test.ts` vermelho.

⚠️ **Renomear classe Tailwind não quebra build.** `text-gradient-gold` num arquivo esquecido
compilaria, passaria no lint e no `tsc`, e simplesmente **não pintaria nada**. Por isso há um
caso varrendo `src/` inteiro pelo nome antigo.

✅ **A 02-A é o que torna isso seguro.** Enquanto `"Dourado"` do TO-DO dependesse do token de
marca, transformar `--gold` em alias de `--primary` propagaria a mudança para um dado seu.
Depois da 02-A, **nenhuma cor de entidade passa por `--gold` nem por `--primary`** — sobraram
só `::selection` e o gradiente da tela de login, os dois decorativos.

---

## 6-B. Materiais e primitivas em vidro — REDESIGN-09-B

Dois sólidos e uma sombra entraram no `@theme inline` para as primitivas: `--color-tile-solid`
e `--color-popover-solid` (as utilitárias `bg-tile-solid` e `bg-popover-solid`) e
`--shadow-vidro` = `inset 0 1px 0 var(--glass-hi), inset 0 -1px 0 var(--glass-lo),
var(--glass-shadow)` (a utilitária `shadow-(--shadow-vidro)`).

### Os quatro materiais (`@utility` em `globals.css`)

Nenhum define `border-radius` — o raio é do componente. Só `vidro-casca` e `vidro-sobreposicao`
desfocam o que está atrás (o desfoque é o recurso caro).

| Material | Quem usa | Desfoque |
| --- | --- | --- |
| `vidro-casca` | sidebar, cabeçalho (09-C) | 30 px, saturação 175% |
| `vidro-cartao` | superfícies que se repetem | nenhum |
| `vidro-sobreposicao` | diálogo, gaveta, popover, menu, seleção aberta, dica | 24 px, saturação 160% |
| `ladrilho` | campo e superfície interna | nenhum |

Em todos, **transparência reduzida** troca o vidro pelo sólido validado (`--glass-solid`; o
ladrilho vai para `--tile-solid`) e tira o filtro; **cores forçadas** devolvem a borda ao sistema
(`CanvasText`). O mesmo vale no nível dos tokens: o `@media (prefers-reduced-transparency:
reduce)` de topo redefine `--card`, `--popover`, `--sidebar`, `--tile` (para `--tile-solid`),
`--pill` (para `--glass-solid`) e `--popover-solid` (para `--glass-solid`).
Vidro sobre vidro não desfoca de novo: select, popover, menu, dica e aviso abertos **dentro** de
diálogo ou gaveta perdem só o filtro (a regra `body:has(...)` de `globals.css`).

### Os materiais como constantes (`src/components/ui/materiais.ts`, zero imports)

| Constante | Conteúdo | Quem |
| --- | --- | --- |
| `MATERIAL_CARTAO` | `bg-card` + brilho em gradiente (`--glass-sheen`) + `border-glass-border` + `shadow-(--shadow-vidro)` | `Card` |
| `MATERIAL_LADRILHO` | `bg-tile border-tile-border` + sombra interna `inset 0 1px 2px` | `Input`, `Textarea`, `SelectTrigger`, `Checkbox` |
| `MATERIAL_PILULA` | `bg-pill border-glass-border` + realce interno + sombra curta | `Button` `outline` e `secondary` |
| `PRESSAO` | transição de `transform/scale/cor/fundo/borda/sombra/filtro`, 500 ms, `ease-mola`; `active:scale-[.96]` em 120 ms; **desligada** em `motion-reduce` | `TabsTrigger` (o `Button` repete as classes com `motion-safe:` e o filtro `not-aria-[haspopup]`: o Tailwind só gera CSS para texto literal) |

`ease-mola` = `cubic-bezier(.22,1.45,.36,1)`; `ease-estalo` = `cubic-bezier(.22,1.6,.36,1)`.

### As primitivas (como ficaram no código)

⚠️ **Alturas não mudam** em `Button`, `Input`, `SelectTrigger` e `Badge`. `Switch` e `TabsList`
mudam porque o desenho pede.

| Primitiva | Material e forma |
| --- | --- |
| `Card` | `MATERIAL_CARTAO`; raio 24 px (`size="sm"`: 20 px); rodapé em `bg-tile` com `border-glass-border` |
| `Button` `default` | `bg-primary-fill`/`text-primary-fill-foreground`, brilho em gradiente e sombra tingida do próprio azul; pílula; brilho até 28% da altura, acima da letra; `hover:brightness-95` |
| `Button` `outline`, `secondary` | `MATERIAL_PILULA`; `hover` e `aria-expanded` em `bg-pill-strong` |
| `Button` `ghost` | transparente; `hover` e `aria-expanded` em `bg-primary/10` |
| `Button` `destructive` | `bg-destructive/3`, `text-destructive`, borda `destructive/25`; `hover` `border-destructive/50` (alfa baixado pela medição, não o texto escurecido) |
| `Button` `link` | `text-primary`, sublinhado no hover |
| `Input` | `MATERIAL_LADRILHO` com borda `--field-border` (foreground a 52%, escuro 42%, para 3:1); raio 10 px; `h-8` |
| `Textarea` | `MATERIAL_LADRILHO` com a mesma borda; raio 14 px; `min-h-16` |
| `SelectTrigger` | `MATERIAL_LADRILHO` com a mesma borda; raio 10 px (`sm`: 9 px); `hover:bg-pill`; `h-8` (`sm`: `h-7`) |
| `SelectContent`, `PopoverContent`, `DropdownMenuContent`, `DropdownMenuSubContent` | `vidro-sobreposicao`; raio 18 px; setas de rolagem do select em `bg-popover-solid` |
| `DialogContent`, `SheetContent` | `vidro-sobreposicao`; raio 28 px (gaveta: só os cantos livres); rodapés em `bg-tile` |
| `TooltipContent` | `vidro-sobreposicao`; raio 10 px; seta em `bg-popover-solid`/`fill-popover-solid` |
| aviso (sonner) | regra de `globals.css` sem camada, `background: var(--popover)` + sombra de vidro + desfoque 24 px; o tipo vai no **ícone** (sem `richColors`); anel de foco devolvido por `:focus-visible` |
| `Badge` `default` | `bg-primary-fill`/`text-primary-fill-foreground`; pílula; `h-5` |
| `Badge` `secondary`, `destructive`, `outline`, `ghost`, `link` | tingimentos e bordas como na 02-B; `destructive` em `bg-destructive/10` (escuro `/20`) |
| `Checkbox` | `MATERIAL_LADRILHO`; `size-4.5`, raio 6 px; marcada em `primary-fill`; o visto entra com `ease-estalo` (desligado em `motion-reduce`) |
| `Switch` | trilho `h-8 w-[52px]`, pílula; ligado em `primary-fill`; botão `size-7` branco que **estica** (`w-[34px]`) enquanto pressionado, com `ease-mola` (desligado em `motion-reduce`) |
| `TabsList` `default` | pílula `h-9` em `bg-track` com `border-tile-border`; a variante `line` segue sem fundo |
| `TabsTrigger` | `PRESSAO`; ativa em `bg-pill-strong` + `text-foreground` + sombra curta |
| `Skeleton` | `bg-track`, raio 10 px, `animate-pulse` (desligado em `motion-reduce`) |

**Contraste dos controles desligados (WCAG 1.4.11, ≥ 3:1 nos dois temas, provado em teste).**
O vidro faz uma borda clara sumir sobre a névoa clara, então o desligado ganhou aro próprio:
`Checkbox` com `border-foreground/52`; trilho do `Switch` com
`data-[state=unchecked]:ring-1 ring-foreground/50 ring-inset`; **botão** do `Switch` (o círculo)
com `data-[state=unchecked]:ring-1 ring-foreground/60`. Como em toda a 09-B: contraste que
falha baixa o alfa do tingimento ou da névoa; **o texto não é escurecido**.

⚠️ **`cn()` é `twMerge`.** As `@utility` `vidro-*` e `ladrilho` são **desconhecidas** do
twMerge: o chamador não as remove com uma classe de fundo. Já `bg-card`, `bg-tile`, `bg-pill`,
`border-*`, `rounded-*` e `shadow-*` das constantes **são** removidas por quem passa a mesma
classe no `className`.

⚠️ **Toda primitiva entra em todas as rotas.** Nenhum import novo em `src/components/ui/*` além
de `@/lib/utils`, `./materiais` e o que o arquivo já importava; é o que mantém o orçamento de JS
(a mediana por rota não sobe por causa de material).

### A fonte de reserva (09-B, T8)

`next/font` exige a chamada literal em módulo, então a Inter mora em `src/app/fonts.ts` e o
`layout.tsx` e o `global-error.tsx` a **importam** — este último substitui o layout raiz quando
ele cai e põe `inter.variable` no próprio `<html>`. `preload: false` continua (§1).

---

### Casca (REDESIGN-09-C)

| Peça | Material e tokens |
| --- | --- |
| Sidebar | coluna transparente de 256 / 76 / 0 px; painel `vidro-casca` com raio 28 px e 12 px de afastamento |
| Item ativo do menu | `bg-pill-strong` + `text-nav-ativo-ink` |
| Header | `vidro-casca`, `sticky top-0 z-30 h-16` |
| Busca (gatilho desktop) | pílula em `bg-tile` com `border-(--field-border)`; o hover muda só a borda |
| Assistente | botão nativo `vidro-casca`, redondo, 48 px |
| Login e cadastro | um cartão `vidro-cartao`, raio 28 px; a marca fica direto na névoa, só em `foreground` e `muted-on-fog` |

`--nav-ativo-ink` é `#0062d6` no claro e `#9cc4ff` no escuro: no escuro o `primary` sobre a pílula dá
3,42:1, e este token dá 4,78:1. `data-casca` marca a casca que perde o desfoque sob diálogo ou gaveta
(sidebar e assistente). O header fica de fora de propósito, porque tem conteúdo passando atrás.

### Peças do painel (REDESIGN-09-D)

Nenhum token ou material novo. Saíram `--banner-from` e `--banner-to`.

| Peça | Forma e tipografia |
| --- | --- |
| Abertura | sem caixa; data 15 px; `<h1>` 54 px (38 px no celular) / 700 / −0,04em; linha 19 px (17 px no celular); só `foreground` e `muted-on-fog` |
| `Indicador` | `Card` (raio 24); ícone `size-10`, raio 12, tingimento a 10%, sem anel; número 24 px, 28 px com o cartão a partir de 16rem de conteúdo |
| `Bloco` e `CardShell` | raio 28; título 17 px / 600 / −0,018em; "Ver tudo" em `text-sm` e `text-primary` |
| `StatCard` | `Card` (raio 24); `p-[15px] sm:p-[19px]` (desconto da borda); ícone como o do `Indicador`; número 24 px |
| `PageHeader` | `<h1>` 32 px (26 px no celular) / 700 / −0,03em |

---

### 09-F · módulos

- **`campo-nativo`** (`@utility`): `<select>` e `<input>` nativos fora das primitivas. O twMerge não a conhece: não combine com `bg-*`, `border-*`, `shadow-*` ou `rounded-*` no mesmo elemento.
- **`CirculoDeConcluir`** (`src/components/shared/circulo-de-concluir.tsx`): círculo de 22 px dentro de área de toque de 44 px. Usado no TO-DO e em hábitos; rotinas, `/tarefas`, aulas e subtarefas continuam quadrados.
- **Raio:** linha de lista e barra de ferramentas 16 px; painel interno 14 px; superfície que contém uma grade 24 px.
- **Onde o texto pousa:** direto na névoa, só `foreground` e `muted-on-fog`. `muted-foreground` e os coloridos ficam dentro de vidro ou ladrilho.
- **Borda de estado nova:** `border-primary/75`, medida a 3:1 sobre o cartão composto.
- **Seleção sobre vidro:** `outline`, nunca `ring-offset-*`, cujo vão é opaco.

## 7. Paleta de gráficos — **validada, não escolhida no olho**

Ordem fixa, atribuída por identidade, **nunca ciclada**. Slot 1 é o azul da marca.

| Slot | Hue | Claro | Escuro |
| --- | --- | --- | --- |
| 1 | azul | `#2a78d6` | `#3987e5` |
| 2 | laranja | `#eb6834` | `#d95926` |
| 3 | água | `#1baf7a` | `#199e70` |
| 4 | amarelo | `#eda100` | `#c98500` |
| 5 | magenta | `#e87ba4` | `#d55181` |
| 6 | verde | `#008300` | `#008300` |
| 7 | violeta | `#4a3aa7` | `#9085e9` |
| 8 | vermelho | `#e34948` | `#e66767` |

**Resultado real do validador nas SUAS superfícies** (09-A — a superfície é `--glass-solid`,
não mais `--card`):

```
claro (#f5f7fa) — TODAS PASSAM
  banda de luminosidade  8/8 · piso de croma 8/8
  separação CVD          pior adjacente #eda100↔#1baf7a ΔE 9,1 (protan) · tritan 5,8
  visão normal           pior adjacente #e87ba4↔#eda100 ΔE 19,6
  contraste              WARN: #eb6834 2,98 · #1baf7a 2,62 · #eda100 2,02 · #e87ba4 2,51

escuro (#14171e) — TODAS PASSAM
  banda de luminosidade  8/8 · piso de croma 8/8
  separação CVD          pior adjacente #c98500↔#199e70 ΔE 8,4 (protan) · tritan 8,7
  visão normal           pior adjacente #d55181↔#c98500 ΔE 19,3
  contraste              8/8 acima de 3:1
```

⚠️ **O WARN do claro não é dispensável: ele obriga relevo.** Os **quatro** slots abaixo de 3:1
exigem **rótulo direto visível ou tabela de dados**. **O laranja `#eb6834` entrou nessa lista
na 09-A**: sobre o branco puro da 02-B ele passava de 3:1, e sobre `--glass-solid` (`#f5f7fa`)
mede 2,98 — por um fio. Na prática já está resolvido — a referência visual mostra a legenda com
valor ao lado do donut, e essa legenda passa a ser obrigatória, não decorativa. A margem
estreita da separação CVD (ΔE 5,8 no tritan) é mais um motivo para nunca depender só da cor.

**Para refazer a validação** (obrigatório se qualquer superfície ou hex mudar):

⛔ **O validador NÃO está no repositório.** `scripts/` tem só `nutrition/`, `perf/` e
`training/`. Ele vem com a skill `dataviz`, e é de lá que se chama:

```bash
V="$CLAUDE_SKILLS/dataviz/scripts/validate_palette.js"   # ajuste o caminho da skill
node "$V" "#2a78d6,#eb6834,#1baf7a,#eda100,#e87ba4,#008300,#4a3aa7,#e34948"   --mode light --surface "#f5f7fa"
node "$V" "#3987e5,#d95926,#199e70,#c98500,#d55181,#008300,#9085e9,#e66767"   --mode dark  --surface "#14171e"
```

✅ **Re-executado na 09-A**, depois de os tokens de vidro entrarem: os dois modos reproduzem o
laudo acima linha por linha.

✅ **Re-executado na 09-E** (2026-11-08), sobre as mesmas superfícies: os dois modos reproduzem o
laudo de novo. Os pares novos dos gráficos ficam em `contraste-dos-tokens.test.ts`, bloco 09-E:

| Par | Mínimo | Resultado |
| --- | --- | --- |
| Texto da dica (`foreground`, `muted-foreground`) sobre `glass-strong` composto, inclusive sobre `#000` e `#fff` | 4,5:1 | passa |
| Aro da amostra de cor (`foreground/50`) sobre `glass-strong` composto | 3:1 | passa |
| Contorno tracejado do mês em andamento (`chart-1`, `muted-foreground`) sobre as quatro superfícies | 3:1 | passa |
| Progresso do anel (`primary`) sobre `track` composto | 3:1 | passa (pior caso 4,69:1 no claro, 5,60:1 no escuro) |
| Barra esmaecida a 30% sobre a superfície | sem mínimo | claro 1,16 a 1,69:1 · escuro 1,26 a 1,80:1 |

⚠️ **O esmaecimento não alcança 3:1 e isso é decisão do dono (2026-11-08).** Ele é reforço: quem
informa o grupo em foco é a dica, com o título do grupo. A 30%, nenhum slot passa de 3:1 sobre o
vidro. `ProgressRing` aceita `color` por hábito: a medida do anel vale para o `--primary`.

⚠️ **Quem não roda o validador ainda é pego.** `src/lib/theme/tokens.test.ts` guarda os
**oito hexes** e as **duas superfícies `--glass-solid`**: mexer em qualquer um deixa a suíte
vermelha, com a instrução de revalidar no lugar da mensagem de erro. Sem isso, este laudo
poderia continuar afirmando "todas passam" sobre cores que não existem mais.

⛔ **`--glass-solid` é a superfície validada.** Mudar `--glass-solid` (ou o `--fog-base` de que
ele deriva) sem revalidar invalida a tabela acima. `contraste-dos-tokens.test.ts` confere que o
vidro composto sobre a base é exatamente `--glass-solid`.

### O que isso corrige — e era mais grave do que "feio"

`--chart-1..5` eram **dourado + neutros** (`chart-2` e `chart-4`, cinza). Para uma série
categórica — gastos por categoria — é a pior escolha possível: duas fatias literalmente cinza,
indistinguíveis. Mas a 02-B achou um segundo defeito, **que estava em produção**:

⛔ **Com 5 slots, os gráficos repetiam cor DENTRO DO MESMO GRÁFICO.** Quem pinta indexa com
`i % CHART_COLORS.length`, e os dois consumidores passam de 5:

| Gráfico | Fatias/barras possíveis | Com 5 slots | Com 8 |
| --- | --- | --- | --- |
| Donut de categorias (`categoria-chart-impl`) | **7** (as 6 maiores + "Outros") | a 6ª repetia a cor da 1ª, e "Outros" a da 2ª | cabe |
| Formas de pagamento (`forma-pagamento-chart-impl`) | **8** (7 formas + "outro") | **três** barras repetiam | cabe |

Duas fatias da mesma cor no mesmo donut não são um problema estético: são duas categorias
diferentes afirmando ser a mesma. Os dois limites agora são **derivados da fonte** em
`tokens.test.ts` — acrescentar uma 8ª forma de pagamento, ou subir o corte do donut, deixa a
suíte vermelha antes de a colisão chegar à tela.

⚠️ **Oito slots não autorizam uma 9ª série.** Cor categórica é atribuída por identidade e
**nunca ciclada**; série que não cabe vira "Outros" ou vários gráficos pequenos.

⚠️ `categoria-chart-impl.tsx:66` usa `d.color ?? CHART_COLORS[...]` — **a cor da categoria
escolhida por você continua vencendo**. A paleta é só o fallback.

---

## 8. Regras de uso

1. **Uma linha de comando decide cor de gráfico**, não gosto. Paleta nova ⇒ validador.
2. **Texto usa token de texto**, nunca a cor da série.
3. **Sem dual-axis.** Duas medidas de escalas diferentes ⇒ dois gráficos.
4. **Pizza nunca com negativo**, e nunca para comparar mais de ~6 fatias.
5. **Série futura é visualmente projeção** (hachura/tracejado), com legenda dizendo.
6. **Dinheiro em `tabular-nums`** em coluna de tabela. Número grande solto pode usar figuras
   proporcionais.
7. **Sem néon, sem sombra pesada. Gradiente só na névoa de fundo e no brilho do material;
   nunca em botão, cartão ou gráfico como decoração.**
8. **`cn()` é `twMerge`:** a classe de fora **remove** a da primitiva. Em `DialogContent`,
   `max-w-*` sem prefixo não tem efeito de `sm` para cima — use `sm:max-w-lg`.
