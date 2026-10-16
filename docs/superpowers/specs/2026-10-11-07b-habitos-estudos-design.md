# Design — REDESIGN-07-B: Hábitos e Estudos

> Desenhado com o dono em **2026-10-10/11**, antes de qualquer linha de código. D1–D6 respondidas
> uma a uma (§3). Branch `feat/redesign-07b-habitos-estudos`, worktree
> `yuri.app.pessoal-07b`, criada de `d190cc5` (ponta da 07-A, ainda não integrada). Roda **em
> paralelo** com a REDESIGN-03-B2, que ocupa a pasta principal — os arquivos dela e os da 07-C
> estão listados no §9 e não são editados aqui. Segundo lote da fase 07
> (`docs/redesign/PLANO.md`, "REDESIGN-07 — Demais módulos").

---

## 1. O que a 07-B muda de natureza

**Nenhum dado muda e nenhuma conta muda.** Nenhuma migration, nenhuma coluna de origem em
`habit_logs`, nenhum caminho novo de escrita. A 07-B muda a **aparência, o anúncio de estado e o
carregamento** de três telas (`/habitos`, `/estudos`, `/estudos/[id]`) — e cada correção que
alguém pudesse desfazer sem perceber sai com um teste que a impede, confirmado por mutação.

O cuidado do PLANO para este lote, e como ele é cumprido:

- ⛔ **Não duplicar registro vindo de módulo especializado.** `habit_logs` continua com **um**
  registro por (usuário, hábito, dia) — o unique é **total** (`20260626160100_habit_logs.sql:18`),
  então duplicar já é impossível. O risco real é o **inverso**: o reflexo dos Treinos
  **sobrescreve** e **apaga** o check-in manual (H1). A 07-B não muda isso — **declara** na tela
  (D1). `habit-sync.ts` é só lido.
- ⛔ **Não alterar a contagem de tempo.** `recomputeCourseStats`, `totalMinutes`,
  `minutesInRange` e os streaks não são tocados. A soma duplicada de minutos (E2) é **registrada**,
  não unificada: unificá-la é mexer na contagem.

---

## 2. Linha de base medida (antes de tocar em qualquer coisa)

Medida no worktree depois de `npm ci`, com o `.env.local` copiado da pasta principal (ignorado
pelo git, `.gitignore:34`), em 2026-10-10.

| Comando | Resultado |
| --- | --- |
| `npm run test:run` | **203 arquivos / 4.183 testes — 4.182 ✅, 1 ❌** (ambiente, ver abaixo) |
| `npm run lint` | exit 0 |
| `npx tsc --noEmit` | exit 0 |
| `npm run build` | exit 0 |
| `npm run perf:bundle` | exit 0 · mediana **214,2 KB** · **68** rotas · `/(app)/configuracoes` **281,9/285** |

| Rota | KB gz | No briefing (07-A) |
| --- | --- | --- |
| `/(app)/habitos` | **239,3** | 239,1 |
| `/(app)/estudos` | **218,9** | 218,7 |
| `/(app)/estudos/[id]` | **223,6** | 223,4 |
| `/(app)/configuracoes` | **281,9** | 281,7 |
| mediana | **214,2** | 214,0 |

⚠️ **A falha é a de AMBIENTE herdada da 07-A**, com o mesmo nome:
`src/lib/ai/approval/schema.test.ts › as travas que o código não pode contornar › a FK da
aprovação carrega o hash, amarrando-o ao effect_hash da proposta` (CRLF do worktree). Tem de ser a
única no fim, com o mesmo nome.

⚠️ Tudo saiu **+0,2 KB** acima do que o briefing herdou da 07-A. A diferença é uniforme e a
explicação provável é o build com `.env.local` (a 07-A buildou sem). **Vale o medido**: os tetos
do §7 são sobre estes números.

⚠️ Na 1ª rodada completa, `boundaries.test.ts › SÓ o experience-runner importa
experiences/catalog` estourou o timeout de 5 s (5.818 ms); isolado passou em 763 ms e a 2ª rodada
completa ficou só com a falha de CRLF. Disco frio — se reaparecer no fim, roda-se de novo antes de
qualquer conclusão.

---

## 3. Decisões do dono (2026-10-10/11)

| # | Decisão | Resposta |
| --- | --- | --- |
| **D1** | O hábito vinculado aos Treinos se identifica em `/habitos`? | **Selo + frase.** Selo "Reflete os treinos" nos cartões (Hoje e visões especializadas) com a frase do que o vínculo faz ao registro manual e o link "Ver o vínculo em Treinos"; em Gerenciar, só o selo. Regra pura testada em `lib/habits`; leitura pela `getTrainingPreferences()` que já existe (+1 consulta por carga). Sem migration, `habit-sync.ts` intocado |
| **D2** | Heatmap e semana sem depender de cor | **O desenho da prévia.** Texto por célula para leitor de tela, legenda com rótulos visíveis, hoje com anel + `aria-current="date"`, contorno tracejado em "sem hábitos" e ✓ na meta batida da água |
| **D3** | Abas do curso | **`SeletorDeVisao` com o estado local de hoje** (`aoEscolher={setTab}`), sem parâmetro novo na URL. A varredura da V1 passa a pegar qualquer `.map` que monte botão de alternância pela assinatura `bg-primary` + `text-primary-foreground` |
| **D4** | Diálogos sob demanda | **Os 8 de formulário**, inclusive `HabitLogDialog`; os 4 definidos dentro de arquivos de visão vão para arquivo próprio. `DeleteConfirmDialog` continua exceção (`trigger`) |
| **D5** | Cor de entidade como cor de texto | **Texto neutro, ponto colorido**, nos 20 selos. Paletas gravadas intocadas. Corrige o rótulo da amostra "—". Amostras ganham `aria-pressed` + contorno de foco |
| **D6** | Erros de formulário | **Molde da 07-A nos 7 formulários com RHF + mensagem sob o campo no `HabitLogDialog`.** Varredura proíbe `applyFieldErrors` nos dois módulos; `form-utils.ts` intocado |

**Três pontos que este spec acrescenta e o "aprovado" do dono cobre** (não foram perguntas
separadas porque decorrem das decisões acima):

1. **Anel de foco do sistema nos botões crus** (dias da semana, filtros do vocabulário):
   `outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50` — o
   mesmo de `Button`/`Checkbox`. Hoje eles dependem do `outline: auto` do navegador, que o Chrome
   headless **não pinta** (medido: `:focus-visible` verdadeiro, `outline auto 1px`,
   `boxShadow none`, nada na foto). Nas amostras de cor o anel do sistema não serve (o
   `ring-2` já é a marca de "escolhida"); elas ganham contorno:
   `outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring`.
   ⚠️ **`focus-visible:outline-solid` é obrigatório no Tailwind v4**: `outline-none` zera
   `--tw-outline-style`, e sem ele o contorno não aparece (foi o defeito da primeira foto).
2. **O rótulo de `module-shell.tsx` em `sheet-largura.test.ts`** diz "07-B/C/D", mas Hábitos e
   Estudos não usam `module-shell` (quem usa: IA, Dieta, Treinos). Corrigido para "07-C/D" no
   mesmo commit de teste do passo 1, junto com os 4 rótulos de Dieta que o briefing manda corrigir.
   **Só rótulo.**
3. **A frase da D1 ficou mais precisa que a primeira versão da prévia.** Lendo `habit-sync.ts`:
   o upsert troca `value`/`is_done` e **preserva `notes`**; a exclusão apaga a linha inteira,
   observação junto. A frase final (§5.7) diz exatamente isso; a prévia foi refotografada com ela.

---

## 4. O mapa, reconfirmado — e o que ele não dizia

Cada linha do mapa do briefing (H1, H2, H3, E1, E2, C1, C2, D1, V, X, R) foi reconferida sobre
`d190cc5`. As linhas batem; as divergências estão abaixo. **Nenhum achado é consertado fora do
escopo**, salvo onde a decisão já o põe dentro.

| # | Achado | Destino |
| --- | --- | --- |
| **G1** | **São 7 formulários com `applyFieldErrors`, não 6.** `course-tree.tsx` tem dois (`ModuleFormDialog` e `LessonFormDialog`): Hábito, Curso, Módulo, Aula, Sessão, Vocabulário, Prática | **Dentro da D6** |
| **G2** | **`HabitLogDialog` não usa react-hook-form** (o C1 do mapa diz que todos usam): é `useState`, e **ignora `fieldErrors` por inteiro** — o toast diz "Verifique os campos destacados." (mensagem padrão de `invalid()`, `actions/helpers.ts:35`) e nada está destacado. É o defeito da regra 2 do CLAUDE.md **sempre** ativo, não às vezes | **Dentro da D6** (mensagem sob o campo) |
| **G3** | **Nenhum formulário dos dois módulos usa `zod`/`zodResolver`** — a validação é só no servidor. O que sai do primeiro carregamento com a D4 é `react-hook-form` + o código dos formulários + primitivas usadas só neles (Select, Switch, Textarea), **bem menos que os ~62 KB** da auditoria de performance | Expectativa do §7 ajustada; medido antes × depois |
| **G4** | **Quatro diálogos moram dentro de arquivos de visão** (`ModuleFormDialog`/`LessonFormDialog` em `course-tree.tsx:355,445`; `VocabFormDialog` em `vocabulary-view.tsx:242`; `PracticeFormDialog` em `practice-view.tsx:230`). `next/dynamic` não separa função do mesmo módulo | **Dentro da D4**: vão para arquivo próprio, conteúdo idêntico |
| **G5** | **Contraste do hex como texto sobre `bg-muted`**, medido (oklch → sRGB, WCAG, mínimo 4,5:1): claro **20/20 reprovam** (pior: `#C99A2E`, 2,34:1); escuro **10/20 reprovam** (sono, alimentação, estudos, outro, não iniciado, pausado, baixa, alta, difícil, novo — 3,17 a 4,30:1) | **Dentro da D5** (§8) |
| **G6** | `HabitLogDialog`: `Number(value.replace(",", ".")) \|\| 0` grava **0** quando o texto digitado não é número — "ausência não é zero" num formulário | **Registrado.** Corrigir muda dado gravado; fora da 07-B |
| **G7** | `habit-sync.ts:42` lê `is_active` do hábito e **não usa**: o reflexo grava check-in em hábito **desativado** | **Registrado** para a 07-C (o arquivo é dela) |
| **G8** | Rótulo "07-B/C/D" de `module-shell.tsx` em `sheet-largura.test.ts` | **Dentro do passo 1** (§3, ponto 2) |
| **G9** | **Não existe nenhum link para `/estudos?view=`** (nem em `generate.ts`, nem em `search/queries.ts`, nem inline). Os de Estudos são `/estudos/${c.id}` (`generate.ts:469`, `search/queries.ts:412`) | **Dentro da V4**: cobre `/estudos/[id]` com piso; a checagem de `STUDY_VIEWS` nasce provada por fixture e `/estudos` fica declarada "sem link hoje" (§5.2) |
| **G10** | `components/dashboard/general/nutrition-card.tsx:135` linka `/habitos?view=agua` pela forma **`href=`**, que o extrator único (`links-inline.ts`) não lê | **Risco residual.** O briefing proíbe um segundo extrator; o arquivo é da 03-B2 |
| **G11** | O heatmap não tem rótulo de dia da semana nas linhas (dom→sáb só pela posição) | **Registrado** — decisão de desenho fora deste lote; o texto por célula (D2) já diz a data |
| **G12** | Os dias da semana e as amostras de `task-form.tsx`/`routine-form.tsx`/`project-form.tsx` (07-A) dependem do `outline: auto` para o foco — o mesmo que o headless não pinta (§3, ponto 1) | **Registrado** para quem tocar a 07-A. Não se reescreve commit dela |
| **G13** | Alternâncias com **outra assinatura visual** (não `bg-primary` + `text-primary-foreground`) e sem anúncio: `nutricao/diario/diary-client.tsx:389`, `nutricao/planejamento/planning-client.tsx:290`, `treinos/calendario/calendar-client.tsx:295`, `components/ai/action-history-client.tsx:430` | **Registrado** (07-C e 07-D/03-B2). A varredura estendida não as vê — risco residual |
| **G14** | `applyFieldErrors` continua em `agenda/event-form.tsx`, `tarefas/task-form.tsx`, `tarefas/project-form.tsx`, `rotinas/routine-form.tsx` (07-A) e nos formulários de Financeiro, Cartões e Terceiros | **Registrado.** A varredura da D6 é escopada aos dois módulos; `form-utils.ts` não é editado |
| **G15** | Amostras de cor leem o **hex** em voz alta (`` `Cor ${c}` `` em `habit-form.tsx` e `course-form.tsx`) — o F7 da 07-A, aqui | **Registrado.** Dar nome à cor exige dado novo em `lib/` |

**R (do briefing), registrados para outros lotes:** "Registrar em Hábitos" da Dieta vai a
`/habitos` sem `?view=agua` (`nutricao/page.tsx:217,227`, `diario/diary-client.tsx:1206,1231`) e o
texto de `components/training/integrations-card.tsx:93-97` não menciona a sobrescrita nem a
exclusão — ambos **07-C**.

---

## 5. A forma de cada item

### 5.1 Passo 1 — rótulos de `sheet-largura.test.ts`

- `src/components/ui/sheet-largura.test.ts:19-22`: as 4 exceções de Dieta passam de `"07-B"` para
  `"07-C"`. `module-shell.tsx` passa de `"… — 07-B/C/D"` para `"… — 07-C/D"`.
- **Só o valor do rótulo.** Nenhuma exceção entra ou sai; a contagem de casos fica igual (medida
  antes × depois). Commit de teste.

### 5.2 V4 — o contrato da query string de `/habitos` e `/estudos`

Estende `src/test/deep-links-query-string.test.ts`, **reusando** `lerLinks`/`VALOR_DE_EXEMPLO` de
`src/test/links-inline.ts`. Nenhum segundo extrator. Os arquivos que linkam (`generate.ts`,
`search/queries.ts`) continuam só **lidos**.

- **Rotas novas cobertas:** `/habitos` e `/estudos/[id]`. O caminho concreto `/estudos/<id>` é
  resolvido para a rota `/estudos/[id]` por uma função de mapeamento (o `[id]` é o único segmento
  dinâmico). `lidosPela("/estudos/[id]")` lê `app/(app)/estudos/[id]/page.tsx` — que não lê `sp.`
  nenhum, então **qualquer** query string nesses links fica vermelha.
- **Piso por rota** (contado pela varredura no commit que a introduz): esperado `/habitos` **3**
  (`generate.ts:429` `?view=agua`, `:440` `?view=hoje`, `search/queries.ts:388`) e
  `/estudos/[id]` **2** (`generate.ts:469`, `search/queries.ts:412`). Se a contagem real divergir,
  vale a contagem — e o desvio é dito no commit.
- **View de Hábitos:** todo ponto para `/habitos` com `view` literal tem de estar em
  `HABIT_VIEWS`, com a mensagem nomeando `arquivo:linha` (é o que faz M1 apontar `generate.ts:429`).
- **`/estudos` sem link hoje (G9):** fica numa lista `SEM_LINK_HOJE` com a afirmação **"exatamente
  0 pontos"** — o primeiro link que aparecer deixa a suíte vermelha e manda movê-la para a lista
  com piso. A checagem de `STUDY_VIEWS` é escrita **agora** como função e provada por fixture
  (`/estudos?view=cursos` aceito, `/estudos?view=inexistente` recusado), para não nascer código
  morto.
- **Cobertura derivada (M2):** toda página em `app/(app)/**/page.tsx` que lê `sp.view` **e** o
  valida contra uma constante `*_VIEWS` tem de estar coberta (`ROTAS` ∪ `SEM_LINK_HOJE`). Hoje são
  5 (`/agenda`, `/estudos`, `/habitos`, `/tarefas`, `/todo`) — derivado do código, não escrito à
  mão; guarda anti-tautologia (≥ 5). Tirar `/habitos` da lista coberta fica vermelho **nomeando
  `habitos/page.tsx`**.
- Nasce **verde**; só a mutação prova.

### 5.3 D4 — os 8 diálogos sob demanda

| Diálogo | Onde é montado hoje | Arquivo |
| --- | --- | --- |
| `HabitFormDialog` | `habits-client.tsx:187` | `app/(app)/habitos/habit-form.tsx` (fica) |
| `HabitLogDialog` | **um por cartão**: `habit-card.tsx:196`, `water-view.tsx:151`, `session-view.tsx:184` | `components/habits/habit-log-dialog.tsx` (fica) |
| `CourseFormDialog` | `studies-client.tsx:145`, `course-detail-client.tsx:323` | `app/(app)/estudos/course-form.tsx` (fica) |
| `SessionFormDialog` | `studies-client.tsx:150`, `course-detail-client.tsx:328` | `components/studies/session-dialog.tsx` (fica) |
| `ModuleFormDialog` | `course-tree.tsx:101` | **sai** para `components/studies/module-form-dialog.tsx` |
| `LessonFormDialog` | **um por módulo**: `course-tree.tsx:223` | **sai** para `components/studies/lesson-form-dialog.tsx` |
| `VocabFormDialog` | `vocabulary-view.tsx:149` | **sai** para `components/studies/vocab-form-dialog.tsx` |
| `PracticeFormDialog` | `practice-view.tsx:154` | **sai** para `components/studies/practice-form-dialog.tsx` |

- **Molde** (o de `treinos/metas/goals-client.tsx`): `const X = dynamic(() => import("…").then((m) => m.X), { ssr: false })`
  com o **objeto literal escrito ali mesmo** (regra 4), mais `const montado = useLazyDialog(aberto)`
  e `{montado && <X … />}`. ⛔ Nunca `{aberto && <X/>}` sozinho: quebra a animação de fechamento
  (regra 2).
- **A extração é movimento, não reescrita:** o corpo de cada diálogo sai idêntico; o que muda é o
  `export` e os imports. O que **só o diálogo** usa vai com ele (os tipos `ModuleValues`,
  `LessonValues`, `VocabValues`, `PracticeValues` e `toValues` de `vocabulary-view.tsx:365`); o
  que a visão usa fica nela (`withProtocol`, de `course-tree.tsx:572`, é só da `LessonRow`).
  Nenhuma segunda cópia.
- **Exceção declarada:** `DeleteConfirmDialog` recebe o próprio botão por `trigger` — lazy, o
  botão sumiria (regra 2).
- **Varredura** (`src/test/habitos-estudos-dialogos.test.ts`, sem comentários):
  1. em `app/(app)/{habitos,estudos}/**` e `components/{habits,studies}/**`, nenhum import
     **estático** de valor de um módulo `*-form`/`*-dialog` de formulário (import de **tipo** é
     permitido; `DeleteConfirmDialog` é exceção nomeada, e a exceção tem de continuar casando);
  2. em cada arquivo, o número de `useLazyDialog(` é **≥** o de `dynamic(` que carregam diálogo —
     trocar o hook por `{aberto && <X/>}` deixa a conta desigual;
  3. fixture provando que a varredura diz sim e não (import estático × `import type` × `dynamic`).
- Os 4 arquivos novos entram no `src/lib/validators/round-trip.test.ts`? **Não** — eles não têm
  schema próprio (G3). A fixture de lá continua verde, sem mudança.

### 5.4 D6 — erros de formulário

- **Os 7 com RHF** (Hábito, Curso, Módulo, Aula, Sessão, Vocabulário, Prática) passam ao molde da
  07-A (`goal-form-dialog.tsx`):
  ```ts
  const mapped = mapServerFieldErrors(res.fieldErrors, FORM_FIELDS);
  for (const { name, message } of mapped.toSet) setError(name as Path<Values>, { message });
  toast.error(serverErrorMessage(res.error, mapped));
  ```
  `FORM_FIELDS` é a lista **dos campos que a tela tem**, escrita em cada formulário. O que não tem
  campo na tela sobe para o toast com o nome do campo — nunca some.
- **`HabitLogDialog`** (G2): o mesmo `mapServerFieldErrors` sobre os seus 3 campos
  (`log_date`, `value`, `notes`). A mensagem aparece **sob o campo**, em estado local
  (`useState<Record<string,string>>`), com `aria-invalid` no input e `aria-describedby` apontando
  para o `<p id>` da mensagem; o toast usa `serverErrorMessage`. Sem trazer o RHF para ele. O
  `|| 0` (G6) **não muda**.
- **Varredura** (`src/test/habitos-estudos-formularios.test.ts`, sem comentários): nenhum arquivo
  em `app/(app)/{habitos,estudos}/**` e `components/{habits,studies}/**` menciona
  `applyFieldErrors`; e todo arquivo desses que lê `.fieldErrors` passa por
  `mapServerFieldErrors`. Guarda anti-tautologia: encontra ≥ 8 arquivos que leem `fieldErrors`.
- `components/financeiro/form-utils.ts` **não é editado** (G14).

### 5.5 Estado anunciado (H3) + D3 + V1 estendida

**Dias da semana** (`habit-form.tsx:243-261`):
- `WEEKDAYS` ganha o nome por extenso (`domingo`, `segunda-feira`, … `sábado`), **no próprio
  arquivo** (não em `lib/`). Cada botão: `aria-pressed={active}`, `aria-label={d.nome}`; o grupo:
  `role="group"` + `aria-labelledby` no rótulo "Nos dias".
- Foco: o anel do sistema (§3, ponto 1). Aparência em repouso **idêntica** (conferida na prévia).

**Amostras de cor** (`habit-form.tsx:338-366`, `course-form.tsx:339-367`): `aria-pressed` na
escolhida (inclusive a "—" do curso) + o contorno de foco (§3, ponto 1). O `aria-label` com hex
fica (G15).

**Filtros do vocabulário** (`vocabulary-view.tsx:96-111`): `aria-pressed={ativo}` + anel do sistema.

**Botão Power** (`habits-client.tsx:358-370`): `aria-label` passa a dizer o que faz **e a quem** —
`` `Desativar ${h.name}` `` / `` `Ativar ${h.name}` ``. Sem `aria-pressed`: é ação, não alternância
de exibição, e o estado já está escrito na linha.

**Abas do curso (D3)** (`course-detail-client.tsx:258-274`):
```tsx
<SeletorDeVisao
  rotulo="Seções do curso"
  visoes={tabs.map((t) => t.key)}
  rotulos={ROTULOS_DAS_ABAS}
  atual={tab}
  aoEscolher={setTab}
/>
```
O `useState<Tab>` fica; "Idioma" continua só em curso de idioma. Nenhum parâmetro na URL.

**V1 estendida** (`src/components/shared/seletor-de-visao.test.ts`):
- `course-detail-client.tsx` entra em `TELAS` (usa o componente).
- **Varredura nova, ao lado da antiga:** nenhum `.map(` em `app/` e `components/` cujo corpo monte
  `<button`/`<Button` com **`bg-primary` e `text-primary-foreground`** (a assinatura do botão de
  alternância montado à mão) pode ficar sem `aria-pressed`, `aria-current` ou `aria-checked`.
  Medido hoje: **10** blocos com a assinatura, **4** sem anúncio — os 3 da 07-B (abas do curso,
  dias da semana, filtros do vocabulário) e o F3 (`period-toolbar.tsx`). Depois da 07-B, só o F3,
  que vira exceção nomeada (com dono: REDESIGN-06) e tem de continuar casando.
- **Fixture:** `{tabs.map((t) => (<button className={t.k === a ? "bg-primary text-primary-foreground" : ""}>…</button>))}`
  é pega; o mesmo com `aria-pressed` não é; um `.map` de `<SelectItem>` não é. É o que prova M6.
- ⚠️ A varredura enxerga **uma** assinatura visual. As alternâncias de G13 usam outra e ficam fora
  (risco residual).

### 5.6 D2 — heatmap e semana sem depender de cor

**Heatmap** (`components/habits/habit-heatmap.tsx`):
- `cellClass` e as faixas (`0`, `≤0,34`, `≤0,67`, `<1`, `1`) **não mudam**.
- A grade vira `<ol aria-label="Consistência diária das últimas 15 semanas">`; cada dia é um
  `<li>`; os dias de enchimento do início viram `<li aria-hidden="true">`.
- Cada célula leva, além do `title` (mantido para o mouse), um `<span className="sr-only">` com
  `dd/mm/aaaa[, hoje] — N de M concluído(s)` ou `dd/mm/aaaa[, hoje] — sem hábitos agendados`.
  A data pura é formatada **como texto** (`formatDate`, o que o `title` já usa).
- **Hoje** = `cell.date === hoje`, com `hoje` (o `todayIso` do servidor) **injetado** por prop —
  nunca "a última célula". Recebe `aria-current="date"` e o anel
  `ring-2 ring-foreground ring-offset-1 ring-offset-card`.
- **"Sem hábitos"** (`scheduled === 0`) ganha `border border-dashed border-muted-foreground/50`
  e perde o preenchimento: ausência ≠ 0%.
- **Legenda** com rótulos visíveis, em `<ul aria-label="Legenda">`: Sem hábitos · 0% · até 34% ·
  até 67% · até 99% · 100% · Hoje.

**Semana da água** (`water-view.tsx`, `WeekStrip`):
- Vira `<ol aria-label="Últimos 7 dias">`. A altura da barra e a cor **não mudam** (a conta
  `value / target_value` fica onde está).
- Meta batida (`d.done`, o campo que já existe — nada é recalculado) ganha **✓** ao lado do dia.
- Hoje (`d.date === hoje`) ganha `aria-current="date"`, o anel na trilha e o rótulo do dia em
  `font-semibold text-foreground`.
- Texto para leitor de tela: `dd/mm/aaaa[, hoje] — <valor> de <meta> <unidade>[, meta batida]`,
  com o **mesmo** `formatAmount` e a mesma unidade que o cartão já mostra — nenhuma conversão nova.
- Legenda: "✓ meta batida · ◯ hoje".

### 5.7 D1 — o hábito que reflete os treinos

- **Regra pura** (acréscimo, não mudança): `src/lib/habits/vinculo-treinos.ts`
  ```ts
  export function refleteOsTreinos(habitId: string, habitoVinculadoId: string | null): boolean
  ```
  com teste co-localizado: igual → `true`; `null` → `false`; outro id → `false`. É o que M10 derruba.
- **Leitura:** `habitos/page.tsx` faz `Promise.all([getHabitsDashboard(todayIso), getTrainingPreferences()])`
  e passa `prefs.habitId` adiante. `getTrainingPreferences` **só lê** (o próprio arquivo declara:
  "NÃO criamos a linha na leitura"). +1 consulta por carga de `/habitos`. `src/lib/training/**` é
  só importado, não editado.
- **Na tela** (`components/habits/vinculo-treinos.tsx`, peça única usada nos três lugares):
  - **Selo:** `Badge variant="outline"` com o ícone de haltere e o texto **"Reflete os treinos"**.
  - **Frase**, nos cartões de Hoje e das visões especializadas (água, sessão):
    > O check-in deste hábito vem dos treinos concluídos. Ao concluir, reabrir, abandonar ou excluir
    > um treino, o dia é recalculado: o valor marcado à mão é substituído, e o registro do dia é
    > apagado (com a observação) se não restar treino concluído.

    seguida do link **"Ver o vínculo em Treinos"** → `/treinos/configuracoes`.
  - **Gerenciar:** só o selo (a linha é densa; a frase está a um clique, no cartão).
- ⛔ Nenhuma escrita nova, nenhuma coluna de origem, `habit-sync.ts` intocado. O vínculo continua
  nascendo desligado (`habit_id` nulo ⇒ nenhum selo).

### 5.8 Alinhamento visual — um commit por tela (Hábitos, Estudos, Curso)

- **`EmptyState` compartilhado nas seções vazias.** Seção solta: `className="py-8"` (o que a 07-A
  usou). Dentro de um `Card`: `className="border-0 bg-transparent py-6"`. Onde:
  `habits-client.tsx:253`, `consistency-view.tsx:80`, `studies-client.tsx:211,247,282`,
  `course-detail-client.tsx:291`, `practice-view.tsx:110`, `vocabulary-view.tsx:131`.
  **Exceção pelo critério da 07-A:** o vazio de módulo em `course-tree.tsx:190` é **dica em linha**
  dentro de uma lista (não uma seção) — fica `<p>`, declarado no teste.
- **Barras de progresso com nome:** `HabitProgressBar` e `StudyProgressBar` ganham `rotulo: string`
  **obrigatório** (o TypeScript força os 8 pontos de uso) → `aria-label={rotulo}`. Ex.:
  `` `Progresso de ${habit.name}` ``, `` `Progresso de ${c.title}` ``.
- **`StreakFlame` com texto:** o número ganha `<span className="sr-only">` com " dia seguido" /
  " dias seguidos" (singular quando `count === 1`). O `title` fica.
- **Checkbox da aula** (`course-tree.tsx:270`): `` aria-label={`Concluir ${lesson.title}`} `` — o
  estado já é anunciado pelo próprio checkbox (`aria-checked`), e o rótulo para de mudar com ele.
- **Regra 2 e linhas que quebram:** `min-w-0` no texto do alerta de esquecidos
  (`habits-client.tsx:239`); `flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5` nas
  linhas de valor de `session-view.tsx:127-135` e `habit-card.tsx:123-131`.
- **Alternativa textual nos dois gráficos, na FACHADA** (regra 1 do carregamento sob demanda: o
  que não usa `recharts` não vai para o `-impl`): `consistency-chart.tsx` e `evolution-chart.tsx`
  ganham uma `<table className="sr-only">` com uma linha por semana — `label` × "N de M (P%)" no de
  hábitos; `label` × `formatMinutes(minutes)` no de estudos (o formatador que o `-impl` já usa).
  Só apresentação: nenhum número é recalculado.
- **Contratos** em `src/test/habitos-estudos-contratos.test.ts`, no molde `CONTRATOS` da 07-A
  (arquivo × padrão exigido × por quê, sem comentários): os itens de 5.5, 5.6, 5.7 e 5.8 que
  alguém desfaria sem perceber — `aria-pressed` dos dias e das amostras, `aria-current="date"`
  nas duas grades, o texto da célula, o `EmptyState` nas seções, o `aria-label={rotulo}` das
  barras, o `sr-only` da chama, o `min-w-0`, a tabela na fachada (e **ausente** do `-impl`).

### 5.9 D5 — cor de entidade, ponto colorido e texto neutro

- `HabitCategoryBadge` (`habits/badges.tsx:21`) e `DotBadge` (`studies/badges.tsx:30`) **perdem o
  `style={{ color }}` do texto**; o ponto (`size-2 rounded-full`, `style={{ backgroundColor }}`)
  fica. O texto herda o `secondary-foreground` do `Badge variant="secondary"` — medido sobre o
  `bg-muted` do selo: **14,91:1** no claro e **13,95:1** no escuro. (Os 14,97/13,96 dos
  comentários do `globals.css`, citados na conversa da D5, são sobre `bg-secondary`; o selo usa
  `bg-muted`.)
- `course-form.tsx:347`: a amostra "—" passa a dizer **"Sem cor própria (usa a cor de destaque)"**
  — que é o que acontece (`course-card.tsx:33`: `cover_color ?? "var(--primary)"`).
- Detalhe das cores no §8.

---

## 6. Mutações — o critério de aceite

Aplicadas **uma a uma**, cada uma **compilando** (`npx tsc --noEmit` antes do vitest). Registra-se
o **nome** de cada teste que cai. Restauração com `git restore` e conferida por
`git diff --quiet`, **nunca** pelo verde. Mutação que sair verde é **medida** antes de ser chamada
de fraqueza (D28). ⛔ Nenhuma mutação toca arquivo da 03-B2 nem da 07-C.

| # | Mutação | Como (compilando) | Tem de derrubar |
| --- | --- | --- | --- |
| M1 | `"agua"` sai de `HABIT_VIEWS` | `([…] as const).filter((v): boolean => v !== "agua")` — tipo intacto (TS 5.5 infere predicado sem o `: boolean`) | `deep-links-query-string.test.ts`, nomeando `generate.ts:429` |
| M2 | o contrato perde `/habitos` da lista coberta | tirar `/habitos` de `ROTAS` (e do `PISO`) | a cobertura derivada da V4, nomeando `habitos/page.tsx` |
| M3 | um diálogo volta a import estático | `course-tree.tsx`: `import { ModuleFormDialog } from "./module-form-dialog"` no lugar do `dynamic` | `habitos-estudos-dialogos.test.ts` |
| M4 | `useLazyDialog` trocado por `{aberto && <Dialog/>}` | `habits-client.tsx`: `{formOpen && <HabitFormDialog …/>}`, sem o hook | `habitos-estudos-dialogos.test.ts` |
| M5 | os dias da semana perdem `aria-pressed` | remover o atributo em `habit-form.tsx` | `habitos-estudos-contratos.test.ts` **e** a V1 estendida |
| M6 | as abas do curso voltam a `tabs.map(<button>)` | restaurar o bloco de `d190cc5` | `seletor-de-visao.test.ts` (V1 estendida e `TELAS`) |
| M7 | a célula do heatmap perde o texto do estado | remover o `sr-only` da célula | `habitos-estudos-contratos.test.ts` |
| M8 | hoje perde `aria-current="date"` | (a) no heatmap; (b) na semana — **duas aplicações** | `habitos-estudos-contratos.test.ts`, uma linha em cada |
| M9 | um formulário volta a `applyFieldErrors` | `session-dialog.tsx` | `habitos-estudos-formularios.test.ts` |
| M10 | a regra do vínculo responde sempre `false` | `return false` em `refleteOsTreinos` | `vinculo-treinos.test.ts` |
| M11 | uma seção vazia volta a `<p>` solto | `studies-client.tsx:211` | `habitos-estudos-contratos.test.ts` |
| M12 | a barra de progresso perde o nome acessível | tirar o `aria-label` de `StudyProgressBar` | `habitos-estudos-contratos.test.ts` |
| M13 | o selo volta a pintar o texto (D5) | `style={{ color }}` de volta no `DotBadge` | `habitos-estudos-contratos.test.ts` |
| M14 | a amostra "—" volta a prometer "Cor padrão da categoria" | o texto antigo em `course-form.tsx` | `habitos-estudos-contratos.test.ts` |

M13 e M14 são acréscimos deste spec (D5 saiu "sim" e precisa de quem a segure). **Nenhuma decisão
saiu "não"**, então nenhuma das 12 do briefing cai.

---

## 7. Orçamento de bundle

| Rota | Antes | Regra | Expectativa |
| --- | --- | --- | --- |
| `/(app)/habitos` | 239,3 | **tem de cair** | cai: `HabitFormDialog` + `HabitLogDialog` saem do primeiro carregamento (RHF + Select/Switch/Textarea + código). Menos que os 62 KB da 07-A (G3) — o número é o medido |
| `/(app)/estudos` | 218,9 | **≤ antes** | cai ou fica: Curso, Sessão, Vocabulário e Prática saem |
| `/(app)/estudos/[id]` | 223,6 | **≤ antes** | cai ou fica: Curso, Sessão, Módulo e Aula saem; `SeletorDeVisao` (~1 KB) entra |
| `/(app)/configuracoes` | 281,9 | **≤ 285, sem subir o teto** | ~0 (nenhum arquivo dela é tocado) |
| demais | — | 250 | nenhuma fora; mediana medida |

Medido **depois de cada passo que toca runtime**, não só no fim, com os números no corpo do commit
(o scratchpad pode sumir). A D1 acrescenta uma consulta **no servidor**: não entra no bundle.

---

## 8. D5 — as cores

| Onde | Papel | Decisão |
| --- | --- | --- |
| `lib/habits/constants.ts:51` (`HABIT_CATEGORY_COLORS.leitura = #C99A2E`) e as demais categorias | default (não gravado) | **mantido** — vira só o ponto do selo |
| `lib/studies/constants.ts:79,116,134` (`#C99A2E` em status/prioridade/dificuldade/domínio) | default (não gravado) | **mantido** — vira só o ponto |
| `lib/habits/constants.ts:183` (`HABIT_COLOR_PALETTE`) | **paleta gravada** (`habits.color`) | **nunca muda** |
| `lib/studies/constants.ts:180` (`STUDY_COVER_PALETTE`) | **paleta gravada** (`cover_color`) | **nunca muda** |
| texto dos 20 selos | cor de texto sobre `bg-muted` | **vai para o token neutro** (G5) |

Por quê: TOKENS §1 diz que cor de entidade não muda — e ela não muda: continua no ponto, no anel
da amostra, na barra e na faixa do cartão. O que muda é o **papel**: hex de entidade deixa de ser
cor de texto, porque como texto ele reprova em 20 de 20 casos no tema claro.

---

## 9. O que NÃO muda

- ⛔ **Nenhuma migration.** Nenhuma coluna de origem em `habit_logs`.
- ⛔ **Escrita e contagem:** `src/lib/training/habit-sync.ts` (só lido); o upsert de
  `src/lib/habits/services.ts:73-83`; `recomputeCourseStats` (`actions/studies.ts:61-79`),
  `totalMinutes`, `minutesInRange` e os streaks. **E2 registrado, não unificado.**
- ⛔ `src/lib/habits/**` e `src/lib/studies/**` sem mudança de comportamento (streaks, contagem,
  conversão de água, progresso). `vinculo-treinos.ts` é **acréscimo**.
- ⛔ **Nenhuma rota morre e nenhum parâmetro deixa de ser aceito:** `/habitos?view=`,
  `/estudos?view=`, `/estudos/[id]`. `HABIT_VIEWS` e `STUDY_VIEWS` ficam como estão.
- ⛔ **Arquivos da 03-B2, só lidos:** `src/lib/finance/**`, `src/lib/notifications/**`,
  `src/lib/search/queries.ts`, `src/lib/ai/**`, `src/lib/dashboard/**`, `src/lib/reports/**`,
  `src/app/(app)/dashboard/**`, `src/app/(app)/financeiro/page.tsx`,
  `src/app/(app)/financeiro/contas/**` (inclui `nutrition-card.tsx`, só lido).
- ⛔ **Arquivos da 07-C, só lidos:** `src/app/(app)/{nutricao,treinos}/**`,
  `src/components/{nutrition,training}/**`, `src/lib/{nutrition,training}/**`.
- ⛔ `floating-assistant*.tsx`, os 11 ids de `DASH_CARD_IDS`, a casca, `nav.ts`.
- ⛔ `components/financeiro/form-utils.ts` (outros módulos o usam).
- ⛔ `docs/redesign/STATUS.md` não é editado. Commits da 07-A não são reescritos.
- Sem push, sem merge, sem deploy, sem upstream.

---

## 10. A prévia

Dados **sintéticos**, marcados na própria imagem ("PRÉVIA REDESIGN-07-B · DADOS SINTÉTICOS — nada
aqui é registro real"). Gerada **fora do repositório** (scratchpad da sessão):

- HTML estático cujas classes de `Button`, `Badge`, `Card`, `Checkbox` e `Label` são **lidas dos
  arquivos reais** do worktree (o `cva(` de `ui/button.tsx`/`ui/badge.tsx` e o primeiro literal do
  `cn(` de cada primitiva) e combinadas pelo `twMerge(clsx())` real; ícones pelo `__iconNode` do
  `lucide-react` do worktree.
- O `src/app/globals.css` real compilado com o `postcss` + `@tailwindcss/postcss` do próprio
  `node_modules` (o `@tailwindcss/cli` não está instalado).
- Chrome headless em claro/escuro × 1280/390. A 390 vai num `iframe` de 390 px (o headless não
  desce de 500 px de layout — medido na 07-A). Foco de teclado por `el.focus()` no load.

Mostra, antes (`d190cc5`) × depois: **1** o heatmap (com a legenda rotulada e hoje anelado);
**2** a semana da água; **3** o cartão do hábito vinculado aos Treinos e a linha de Gerenciar;
**4** os dias da semana e as amostras de cor, com o foco visível (no "Q" de quarta numa foto, numa
amostra em outra); **5** os selos de categoria; e, em Estudos, as abas do curso com o
`SeletorDeVisao` e o foco. Dez fotos; as imagens **não** são commitadas (repositório público;
nenhuma fase anterior commitou PNG).

Conferido nas fotos: a aparência em repouso dos dias da semana é idêntica antes × depois; o anel
de foco do sistema e o contorno das amostras aparecem nos dois temas (recorte 1:1); a frase da D1
cabe no cartão a 390 sem empurrar a página.

⚠️ Antes de fechar o passo 9, o gerador é **reconferido contra o código final** (as classes
propostas aqui viram as classes reais, e a prévia é refotografada a partir delas).

---

## 11. Risco residual

| Risco | Por que fica |
| --- | --- |
| A frase da D1 descreve `habit-sync.ts`, que é da 07-C | Se a 07-C mudar o reflexo (ex.: G7), a frase envelhece. Nenhum teste liga as duas — um teste daqui lendo `lib/training` seria acoplar o lote ao arquivo de outro |
| `getTrainingPreferences` engole erro de leitura e devolve o padrão (`habitId: null`) | Uma falha na leitura **esconde o selo** em silêncio, justamente quando o aviso importaria. A função é da 07-C e não é editada |
| `nutrition-card.tsx:135` (`href=`) fora do extrator (G10) | O briefing proíbe um segundo extrator; o arquivo é da 03-B2. Renomear `agua` quebraria esse link sem a V4 notar — a de `generate.ts:429` nota |
| A V1 estendida vê **uma** assinatura visual | As 4 alternâncias de G13 (e qualquer outra com outra cor) ficam fora; registradas com dono |
| `aria-pressed` = uma parada de Tab por opção | Escolha da 07-A (§5.4 de lá), mantida |
| O recentrar da trilha a 390 px nas abas do curso | Comportamento de DOM; sem teste de componente, fica na conferência manual |
| Animação de abertura/fechamento dos diálogos lazy | A varredura prova o hook, não a animação; fica na conferência manual (1ª e 2ª abertura) |
| `\|\| 0` no `HabitLogDialog` (G6) | Corrigir muda dado gravado; fora da 07-B |
| Os gráficos ganham tabela, não descrição de tendência | A tabela é o dado; "subiu/desceu" seria interpretação, e o projeto não infere |
| Falha de ambiente CRLF na suíte do worktree | Não é código; confere-se que é a única e é a mesma |

---

## 12. Ordem (um commit por passo)

Cada passo fecha com `npx vitest run` verde nos diretórios tocados (salvo a falha de ambiente
declarada), `tsc`, `eslint` nos arquivos tocados e `git diff` revisado — nada de `.env`, chave,
token ou `service_role`. Passo que toca runtime mede build + bundle. ⛔ Nenhum arquivo é editado
durante build ou durante dispatch do roteador.

0. Este desenho (só docs).
1. Rótulos de `sheet-largura.test.ts` (07-B → 07-C; `module-shell` → 07-C/D). Só teste.
2. **V4** — contrato da query string de `/habitos` e `/estudos`. Só teste; nasce verde.
3. **D4** — os 8 diálogos sob demanda + `habitos-estudos-dialogos.test.ts`. Bundle antes × depois.
4. **D6** — erros de formulário + `habitos-estudos-formularios.test.ts`.
5. **H3 + D3 + V1 estendida** — dias, amostras, filtros, Power, abas do curso.
6. **D2** — heatmap e semana.
7. **D1** — `vinculo-treinos.ts` + teste + selo e frase.
8. **Alinhamento visual + D5** — Hábitos · Estudos · Curso, um commit cada, com
   `habitos-estudos-contratos.test.ts` nascendo no primeiro e crescendo nos outros dois.
9. Mutações M1–M14, uma a uma; os cinco comandos; `TZ=UTC npx vitest run` nos testes tocados;
   prévia refotografada a partir do código final.

**Roteador:** cada passo substancial passa pelo `ai-router-br:route`, com o TASK PACKAGE **fatiado
por passo**. Desenho, decisões e acessibilidade ficam no principal. Cada `summary_line` é copiada
literalmente no commit e na entrega, inclusive a de dry-run de passo que ficar com o principal.

---

## 13. O que o dono confere à mão (logado no `npm run dev` do worktree)

Entregue como lista; **não** declarado feito.

- **Hábito vinculado aos Treinos:** o selo e a frase no cartão (Hoje e a visão especializada dele)
  e o selo em Gerenciar; um check-in manual com observação num dia com treino, depois concluir e
  excluir a sessão e ver o dia (valor substituído; registro apagado, observação junto, quando não
  sobra treino concluído).
- **Deep-links:** `/habitos?view=agua` e `/habitos?view=hoje` abertos como numa notificação.
- **Heatmap e semana da água:** estado e hoje legíveis sem depender da cor, claro e escuro; com
  leitor de tela, a célula lê a data e "N de M concluídos".
- **Diálogos:** cada um dos 8 abre e fecha com animação, sem piscar, na 1ª e na 2ª vez — inclusive
  o registro de hábito em dois cartões diferentes e a aula em dois módulos diferentes.
- **Erros:** um erro do servidor em campo que a tela não tem sobe para o toast com o nome do campo;
  no registro de hábito, a mensagem aparece sob o campo.
- **Curso:** as abas de `/estudos/[id]` por teclado (Tab + Espaço), o anel de foco visível e
  "Idioma" só em curso de idioma.
- **Formulário de hábito:** os dias da semana por teclado (Tab + Espaço), com o anel de foco; o
  leitor de tela diz "segunda-feira, pressionado".
- **Contagem de tempo:** registrar uma sessão de estudo dá os mesmos minutos no curso e no painel
  que antes.
- **Celular:** a 390, nenhuma linha empurrando a página na horizontal (cartões de hábito com nome
  longo, linha de valor da sessão, alerta de esquecidos).
