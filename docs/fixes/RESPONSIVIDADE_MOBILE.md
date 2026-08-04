# Correção — Responsividade em telas pequenas

Branch `fix/responsividade-mobile`, a partir de `main`. Toca só camada de apresentação:
nenhuma regra de negócio, nenhuma query, nenhuma migration, nenhum teste alterado.

Arquivo separado dos handoffs de propósito: as frentes 16-F e 17-F estavam ativas em
`CURRENT_STATUS.md` / `NEXT_AGENT_INSTRUCTIONS.md` e sobrescrever aqueles arquivos levaria
o trabalho delas embora.

---

## 1. A regra que precisa sobreviver: `cn()` usa `twMerge`

`src/lib/utils.ts` é `twMerge(clsx(inputs))`. Isso significa que **uma classe passada pelo
chamador não "soma" com a da primitiva — ela REMOVE a da primitiva** quando as duas caem no
mesmo grupo de conflito do tailwind-merge.

Era exatamente o que quebrava os diálogos:

```tsx
// base do DialogContent:  "... w-full max-w-[calc(100%-2rem)] ... sm:max-w-sm ..."
<DialogContent className="max-w-md">
```

`max-w-md` e `max-w-[calc(100%-2rem)]` estão no mesmo grupo → o twMerge **apagava o limite
da base**. Resultado: diálogo de 448px numa tela de 375px. E como `DialogContent` é
`fixed top-1/2 left-1/2 -translate-x-1/2`, ele vaza pelos **dois** lados ao mesmo tempo,
sem scroll que alcance o que ficou cortado — os botões de confirmar sumiam da tela.

### A correção e por que tem esse formato

A base virou `max-sm:max-w-[calc(100%-2rem)]`. O prefixo faz duas coisas:

1. **Sobrevive ao twMerge** — classe com modificador entra em outro grupo, então o
   `max-w-*` do chamador não a remove mais.
2. **Vence na cascata abaixo de 40rem** — no CSS gerado, as regras com variante saem
   depois das utilitárias sem prefixo. Medido no bundle de produção:

   | regra | posição no CSS |
   | --- | --- |
   | `.max-w-md{` | 20.568 |
   | `@media not all and (min-width:40rem){.max-sm\:max-w-\[calc\(100\%-2rem\)\]{…}}` | 83.768 |
   | `@media (min-width:40rem){…sm\:max-w-sm…}` | 83.880 |

   Mesma especificidade, então quem sai depois vence: no celular manda o clamp; a partir
   de `sm` a regra nem se aplica e quem governa é `sm:max-w-*`.

> **Consequência prática, para quem for mexer:** num `DialogContent`, `max-w-*` **sem
> prefixo não tem efeito nenhum a partir de `sm`** (o `sm:max-w-sm` da base vence). Para o
> diálogo crescer no desktop use **`sm:max-w-lg`**, nunca `max-w-lg`. O limite do celular
> já vem da primitiva e não precisa ser repetido.

Isso também consertou dois diálogos que estavam **grandes demais no código e pequenos
demais na tela**: `food-form-dialog` pedia 48rem e renderizava 384px; `measure-dialog`
pedia 28rem e renderizava 384px. Os dois passavam largura em `w-[min(...)]`, que o
`sm:max-w-sm` da base cortava.

---

## 2. `Button` é `whitespace-nowrap` — e item de grid tem `min-width: auto`

Combinação que empurra a **página inteira** na horizontal: o botão não quebra a linha, e a
coluna do grid não encolhe abaixo do conteúdo. O grid fica mais largo que o container e
arrasta o layout junto.

Onde doía de verdade era a tela que se usa de pé, no celular, na academia:

- `set-editor.tsx` — 5 colunas de dificuldade; "Muito difícil" não cabia numa célula de
  ~57px (tela de 375px). Virou `grid-cols-3 sm:grid-cols-5`.
- `rest-panel.tsx` — "Pular descanso" em `text-base` mede ~150px numa célula de ~151px.
  Ganhou `min-w-0` + `truncate` + `text-sm sm:text-base`.

Ao acrescentar botão de texto em grid apertado, vale conferir os dois: `min-w-0` no item e
uma saída para o rótulo (truncate ou menos colunas no mobile).

---

## 3. Barras `sticky` escorregando para trás do Header

O Header do app é `sticky top-0 z-30` com `h-16`. Qualquer barra `sticky` dentro do
conteúdo precisa descontar isso — senão ela some atrás do Header ao rolar.

| arquivo | antes | depois |
| --- | --- | --- |
| `session/session-live-client.tsx` | `top-0 z-10` | `top-16 z-20` |
| `treinos/exercicios/exercises-client.tsx` | `top-2` | `top-18` |
| `treinos/treinos/workouts-client.tsx` | `top-2` | `top-18` |

`top-18` (4.5rem) = 64px do Header + 8px de folga, preservando o respiro que o `top-2`
queria. `nutricao/alimentos/foods-client.tsx` já usava `top-16` — era a única que acertava.

No caso da sessão ao vivo o sintoma era o pior possível: cronômetro e contagem de séries
desapareciam justamente durante o treino.

---

## 4. Primitivas e `PageHeader`

- **`ui/tabs.tsx`** — `TabsList` ganhou `max-w-full overflow-x-auto`. Os gatilhos são
  `whitespace-nowrap`, então rótulos longos ("Grupos musculares", "Comparar datas")
  alargavam a lista além da tela e empurravam a página. Agora o excesso rola dentro da
  própria lista. A variante `line` não é usada em lugar nenhum, então o `after:` do
  sublinhado não corre risco de ser aparado pelo overflow.
- **`shared/page-header.tsx`** — `min-w-0` + `break-words` no bloco do título (nome
  cadastrado pelo usuário, sem espaço, alargava a linha) e `flex-wrap` nas ações (com três
  botões a linha estourava no celular).

---

## Verificação

`npm run test:run` (83 arquivos, 1.846 testes) · `npm run lint` · `npx tsc --noEmit` ·
`npm run build` — todos limpos. A ordem das regras foi conferida no CSS **do bundle de
produção**, não só em teoria.

Não verificado em navegador real: as rotas exigem sessão Supabase, então a checagem foi
estática + medição do CSS gerado. Vale uma passada no aparelho nas telas tocadas —
sobretudo sessão ao vivo e medidas corporais.
