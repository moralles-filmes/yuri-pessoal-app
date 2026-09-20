# Tokens visuais — REDESIGN-01-B

Direção: SaaS moderno, limpo, profissional, confortável para uso diário.
Claro: azul de destaque, branco e cinzas **frios**. Escuro: grafite frio, texto claro, azul.

Nenhum valor aqui foi escolhido no olho: os de contraste foram medidos e a paleta de gráficos
passou pelo validador, com os comandos registrados na §7 para você refazer.

---

## 1. O que NÃO muda

| Item | Valor | Por quê |
| --- | --- | --- |
| **Tipografia** | `--font-sans: Arial, "Helvetica Neue", Helvetica, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` | Exigência sua. **Copiar literalmente.** Não há `next/font` no projeto e não vai haver |
| `--font-mono`, `--font-heading` | como estão | `--font-heading` é alias de `--font-sans` |
| **Cores de entidade** | todos os hex em `lib/*/constants.ts`, `calendar/colors.ts`, o default `'#A98438'` de `categories`, cores de cartão/conta | São **suas escolhas**, não identidade do app |
| **Semântica de alerta** | os ~120 usos de `amber-*` | Significam atenção, não marca |
| **Escala de raio** | `--radius: 0.7rem` e os derivados | Já é discreta. Arredondamento excessivo está fora da direção |

---

## 2. ⛔ A trava que precisa cair ANTES dos tokens

`src/lib/todo/constants.ts:141,153`:
```ts
TODO_COLOR_DOT.gold  = "bg-primary"
TODO_COLOR_CHIP.gold = "bg-primary/15 text-primary"
```

`"Dourado"` é uma cor que **você escolhe** para projetos e etiquetas — e está implementada com
o token de **marca**. Trocar `--primary` para azul faz todo item marcado como "Dourado" virar
azul em silêncio, **indistinguível do item `"azul"` da mesma paleta** (`bg-sky-500`, linha 145).

**Correção (REDESIGN-02-A, antes de qualquer token):** apontar `gold` para um literal.
`bg-amber-500` / `bg-amber-500/15 text-amber-600` preserva o que o usuário vê hoje e o
desacopla da marca para sempre.

---

## 3. Tokens — tema CLARO

```css
:root {
  /* Neutros FRIOS (hue ~258). Os atuais são hue 70–95: dourado dessaturado,
     que brigaria com um primário azul. */
  --background: oklch(0.985 0.003 255);   /* #f9fafc */
  --foreground: oklch(0.180 0.010 260);   /* #0f1216 */

  --card: oklch(1 0 0);                   /* #ffffff — superfície VALIDADA, ver §7 */
  --card-foreground: oklch(0.180 0.010 260);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.180 0.010 260);

  /* Azul de destaque. Branco em cima mede 5,39:1 — passa AA para texto normal. */
  --primary: oklch(0.527 0.150 256);      /* #256abf */
  --primary-foreground: oklch(1 0 0);     /* ⚠️ BRANCO. O dourado usava texto ESCURO */

  --secondary: oklch(0.966 0.005 255);    /* #f1f4f7 */
  --secondary-foreground: oklch(0.240 0.010 260);

  --muted: oklch(0.966 0.005 255);
  --muted-foreground: oklch(0.505 0.014 258);  /* #60656d — 5,9:1 sobre o card */

  --accent: oklch(0.955 0.020 255);
  --accent-foreground: oklch(0.380 0.090 256);

  --border: oklch(0.905 0.007 258);       /* #dde0e4 */
  --input: oklch(0.905 0.007 258);
  --ring: oklch(0.527 0.150 256);

  --destructive: oklch(0.575 0.186 25);   /* #d03b3b — 4,80:1 sobre branco */
}
```

## 4. Tokens — tema ESCURO

```css
.dark {
  --background: oklch(0.177 0.009 264);   /* #0f1115 — grafite frio, não preto puro */
  --foreground: oklch(0.968 0.004 260);

  --card: oklch(0.217 0.013 264);         /* #171a20 — superfície VALIDADA, ver §7 */
  --card-foreground: oklch(0.968 0.004 260);
  --popover: oklch(0.217 0.013 264);
  --popover-foreground: oklch(0.968 0.004 260);

  /* Azul mais claro + texto escuro, como o dourado já fazia no escuro. 5,94:1. */
  --primary: oklch(0.717 0.118 254);      /* #6da7ec — 6,96:1 como texto no card */
  --primary-foreground: oklch(0.274 0.066 254);  /* #0d2847 */

  --secondary: oklch(0.265 0.012 262);
  --secondary-foreground: oklch(0.968 0.004 260);

  --muted: oklch(0.265 0.012 262);
  --muted-foreground: oklch(0.715 0.015 260);

  --accent: oklch(0.305 0.035 256);
  --accent-foreground: oklch(0.900 0.045 256);

  --border: oklch(1 0 0 / 10%);
  --input: oklch(1 0 0 / 15%);
  --ring: oklch(0.717 0.118 254);

  --destructive: oklch(0.704 0.191 22);   /* mantido do tema atual, já calibrado */
}
```

---

## 5. Tokens SEMÂNTICOS — novos

Hoje só existe `--destructive`. A ausência de `success`/`warning`/`info` é o que produziu
**212 ocorrências** de `text-emerald`/`text-red-` em 105 arquivos e ~120 de `amber` em ~60.

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

**Resultado real do validador nas SUAS superfícies:**

```
claro (#ffffff) — TODAS PASSAM
  banda de luminosidade  8/8 · piso de croma 8/8
  separação CVD          pior adjacente #eda100↔#1baf7a ΔE 9,1 (protan)
  visão normal           pior adjacente #e87ba4↔#eda100 ΔE 19,6
  contraste              WARN: #1baf7a 2,82 · #eda100 2,17 · #e87ba4 2,69

escuro (#171a20) — TODAS PASSAM
  separação CVD          pior adjacente #c98500↔#199e70 ΔE 8,4
  visão normal           pior adjacente #d55181↔#c98500 ΔE 19,3
  contraste              8/8 acima de 3:1
```

⚠️ **O WARN do claro não é dispensável: ele obriga relevo.** Os três slots abaixo de 3:1
exigem **rótulo direto visível ou tabela de dados**. Na prática já está resolvido — a
referência visual mostra a legenda com valor ao lado do donut, e essa legenda passa a ser
obrigatória, não decorativa.

**Para refazer a validação** (obrigatório se qualquer superfície ou hex mudar):
```bash
node scripts/validate_palette.js "#2a78d6,#eb6834,#1baf7a,#eda100,#e87ba4,#008300,#4a3aa7,#e34948" \
  --mode light --surface "#ffffff"
node scripts/validate_palette.js "#3987e5,#d95926,#199e70,#c98500,#d55181,#008300,#9085e9,#e66767" \
  --mode dark  --surface "#171a20"
```

⛔ **`--card` é a superfície validada.** Mudar `--card` sem revalidar invalida a tabela acima.

### O que isso corrige

`--chart-1..5` hoje são **dourado + neutros** (`chart-2` e `chart-4` são cinza). Para uma
série categórica — gastos por categoria — isso é a pior escolha possível: duas fatias
literalmente cinza, indistinguíveis. A paleta nova é categórica de verdade.

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
7. **Sem neon, sem gradiente forte, sem sombra pesada.**
8. **`cn()` é `twMerge`:** a classe de fora **remove** a da primitiva. Em `DialogContent`,
   `max-w-*` sem prefixo não tem efeito de `sm` para cima — use `sm:max-w-lg`.
