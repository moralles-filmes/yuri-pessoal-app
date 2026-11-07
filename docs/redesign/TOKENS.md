# Tokens visuais — REDESIGN-01-B (revistos pela 09-A, vidro)

Direção original (01-B): SaaS moderno, limpo, profissional, confortável para uso diário.
Claro: azul de destaque, branco e cinzas **frios**. Escuro: grafite frio, texto claro, azul.

⚠️ **Desde 2026-11-07 a 09-A reescreveu a superfície**: a casca virou **vidro** sobre uma
**névoa** de fundo, a fonte e o raio mudaram, e os textos foram remedidos sobre as superfícies
novas. Os §1, §3, §4, §7 e a regra 7 do §8 abaixo já refletem isso. Desenho:
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
  --pill: rgba(255, 255, 255, 0.82);       --pill-strong: #ffffff;
  --track: rgba(22, 24, 29, 0.07);         --grid: rgba(22, 24, 29, 0.07);

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

Não tocados pela 09-A (seguem como na 02-B): `--secondary`, `--muted`, `--border`, `--input`,
`--success`/`--warning`/`--info` de preenchimento e os `--sidebar-*` restantes.

## 4. Tokens — tema ESCURO ✅ **reescritos na 09-A (vidro)**

Mesma estrutura do claro. A base é quase preta (`--fog-base`) e as manchas são azul, violeta e
verde-azulado profundos; o vidro é grafite translúcido.

```css
.dark {
  --fog-base: #0a0c11;
  --fog-1: rgba(34, 78, 170, 0.6);
  --fog-2: rgba(88, 56, 150, 0.6);
  --fog-3: rgba(16, 96, 92, 0.6);

  --glass: rgba(28, 31, 40, 0.58);
  --glass-solid: #14171e;                  /* a superfície da validação */
  --glass-strong: rgba(38, 42, 52, 0.95);
  --glass-border: rgba(255, 255, 255, 0.1);
  --glass-hi: rgba(255, 255, 255, 0.14);
  --glass-lo: rgba(255, 255, 255, 0.04);
  --glass-sheen: rgba(255, 255, 255, 0.07);
  --glass-shadow: 0 1px 2px rgba(0, 0, 0, 0.3), 0 26px 60px -24px rgba(0, 0, 0, 0.7);
  --tile: rgba(255, 255, 255, 0.05);       --tile-border: rgba(255, 255, 255, 0.07);
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

Direto sobre a névoa aberta: `--foreground` **10,73:1** · `--muted-on-fog` **4,95:1**.
Preenchimentos: `--primary-fill-foreground` sobre `--primary-fill` **4,70:1**;
`--primary-foreground` sobre `--primary` **5,95:1**; `--accent-foreground` sobre `--accent`
**9,94:1**.

⚠️ **Folga pequena no escuro:** `--muted-on-fog` (4,95:1) e `--primary-fill` (4,70:1). Subir o
alfa de `--fog-3` no escuro quebra o teste.

---

## 5. Tokens SEMÂNTICOS — novos

Hoje só existe `--destructive`. A ausência de `success`/`warning`/`info` é o que produziu
**212 ocorrências** de `text-emerald`/`text-red-` em 105 arquivos e ~120 de `amber` em ~60.

⚠️ **Os valores de `-ink` abaixo são os da 01-B.** Desde a 09-A os três `-ink` são hex medidos
sobre o vidro (claro `#006303` · `#8a5a01` · `#0062d6`; escuro `#3fcf7f` · `#fab21c` ·
`#6ea7ec`) — a tabela de contrastes está nas §3 e §4. O princípio e o motivo do `-ink`
separado seguem valendo.

```css
:root {
  --success: oklch(0.621 0.207 143);        /* #0ca30c — 3,35:1 no branco */
  --success-foreground: oklch(1 0 0);
  --success-ink: oklch(0.433 0.147 143);    /* #006300 — 7,54:1. TEXTO usa este */

  --warning: oklch(0.811 0.164 78);         /* #fab219 */
  --warning-foreground: oklch(0.250 0.050 78);
  --warning-ink: oklch(0.508 0.108 73);     /* #8a5a00 — 5,93:1. TEXTO usa este */

  --info: oklch(0.575 0.163 256);           /* #2a78d6 */
  --info-foreground: oklch(1 0 0);
  --info-ink: oklch(0.527 0.150 256);
}
.dark {
  --success: oklch(0.621 0.207 143);  --success-ink: oklch(0.621 0.207 143);  /* 5,19:1 */
  --warning: oklch(0.811 0.164 78);   --warning-ink: oklch(0.811 0.164 78);   /* 9,50:1 */
  --info: oklch(0.717 0.118 254);     --info-ink: oklch(0.717 0.118 254);     /* 6,96:1 */
}
```

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
