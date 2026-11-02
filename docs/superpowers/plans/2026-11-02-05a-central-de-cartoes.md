# REDESIGN-05-A — Central de cartões: casca, Visão geral e Meus cartões — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar a `/cartoes`, `/faturas` e `/parcelamentos` uma navegação interna comum e entregar a Visão geral (fechadas × em aberto, minha parte × cada terceiro) e Meus cartões, sem mover página e sem reescrever regra.

**Architecture:** Uma função pura (`montarVisaoGeral`) monta tudo a partir de leituras que já existem (`getCreditCards`, `getStatements`, `getReceivablesByStatements`) e das regras que já existem (`statusEfetivo`, `resolverFatura`, `parteDoTerceiroCentavos`). Uma casca (`CartoesShell` = `ModuleShell` + `NAV_DA_CENTRAL_DE_CARTOES`) é montada por três `layout.tsx` curtos. A tela é Server Component, e o único client é o que o `ModuleShell` já é.

**Tech Stack:** Next.js 16 (App Router, `searchParams` async), React 19, Tailwind v4, shadcn/ui, Vitest (`environment: node`).

**Spec:** `docs/superpowers/specs/2026-11-02-05a-central-de-cartoes-design.md` (ler inteiro antes da Task 1).

## Global Constraints

- Worktree `C:/tmp/05a-cartoes`, branch `feat/redesign-05a-cartoes`. Nunca tocar o diretório principal, `C:/tmp/04a-painel` nem `C:/tmp/04c-reembolso`.
- D67: sem push, sem PR, sem merge. Sem editar `docs/redesign/STATUS.md`, `CLAUDE.md` e `AGENTS.md`.
- **Nenhuma migration.**
- Nenhum `page.tsx` existente muda de lugar; nenhum grupo de rotas novo.
- `/faturas?card=X&month=Y` e `/parcelamentos?card=&category=&status=` continuam respondendo; `search/queries.ts`, `notifications/generate.ts` e `ai/approval/commands/finance*.ts` **não são editados**.
- Dinheiro na lógica nova em **centavos inteiros** (`cent`/`reais` de `dashboard.ts` ou `centavosParaReais`); formatação só na tela com `formatCurrency(reais)`.
- Datas puras como texto `yyyy-MM-dd`; `pago_em` é instante → `dateInSaoPaulo`, nunca `.slice(0,10)`. `hoje` vem de `hojeISO()` no servidor e é injetado.
- Ausência não é zero: linha prevista e total sem fatura real são `null`, e a tela escreve "sem lançamentos conhecidos".
- Rótulos exatos: "A pagar (fechadas)", "Minha parte a pagar", "Em aberto (acumulando)", "Minha parte em aberto", "Fechadas — a pagar", "Em aberto — acumulando compras", "Fecha → vence", "sem lançamentos conhecidos", "Prevista", "Aberta", "Fechada", "Atrasada", "Paga em dd/mm", "Paga antes de fechar", "Crédito", "cartão desativado". Base visível: "Valores por fatura do cartão. Minha parte = total − parte dos terceiros."
- Layout: `min-w-0` no lado texto de flex, tabela com `overflow-x-auto` no bloco, tabela a partir de `md`, lista abaixo. Nada `sticky` novo.
- Bundle: `perf:bundle` verde e `/(app)/configuracoes` < 285 KB gz. A casca não importa nada novo além de `lucide-react` e `module-shell`.
- Antes de cada commit: `git checkout -- AGENTS.md`, `sed -i 's/\r$//'` nos arquivos tocados, `git diff --stat` e revisão do diff atrás de segredo.
- Mensagens de commit terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Dia exato do fechamento e da virada de mês**: com `hoje === data_fechamento`, a fatura é fechada e vai para "Fechadas"; o aberto é o ciclo seguinte. O teste fica na Task 1 (`fechamento hoje`).
2. **Cartão com duas faturas não pagas** (atrasada + fechada): duas linhas, as duas na soma, e "1 atrasada" na linha de apoio. O teste fica na Task 1.
3. **Recebível `ignorado` e recebimento parcial**: a coluna da pessoa usa `parteDoTerceiroCentavos` (o valor, ou o recebido no `ignorado`), e Σ pessoas = `parteDosTerceirosPorFatura`. O teste fica na Task 1.
4. **Pessoa sem nome (`person` nulo) ou pessoa com parte só numa tabela**: a coluna aparece só na tabela em que há parte; sem `person`, o nome é "Pessoa sem nome", com o id como chave. O teste fica na Task 1.
5. **`/cartoes/meus` e as rotas antigas acendem um item só na sidebar e o item certo na coluna**: os testes ficam na Task 2 (`nav.test.ts`, `active.test.ts` e `module-shell.test.ts`).

---

### Task 1: Lógica pura da Visão geral

**Files:**
- Create: `src/lib/finance/central-cartoes.ts`
- Test: `src/lib/finance/central-cartoes.test.ts`

**Interfaces:**
- Consumes: `statusEfetivo` e `resolverFatura` (`invoice.ts`); `DashStatement`, `DashReceivable` e `parteDosTerceirosPorFatura` (`dashboard.ts`); `parteDoTerceiroCentavos` e `resumirRecebivel` (`recebimentos.ts`); `ReceivableWithPerson` e `CreditCardRow` (`@/types/database`). Para o próximo ciclo, use o mesmo passo que `proximas6Faturas` usa (`resolverFatura(nextDayISO(ciclo.dataFechamento), …)`). Se `nextDayISO` não for exportado, exporte-o de onde mora, sem mudar comportamento.
- Produces:
```ts
export type CartaoDaCentral = Pick<CreditCardRow, "id" | "nome" | "cor" | "ativo" | "dia_fechamento" | "dia_vencimento">;
export type PessoaDaCentral = { id: string; nome: string };
export type EstadoDaLinha = "aberta" | "fechada" | "atrasada" | "paga" | "prevista";
export type LinhaDaCentral = {
  chave: string;                 // statementId ou `${cardId}|${competencia}` na prevista
  statementId: string | null;
  card: { id: string; nome: string; cor: string | null; ativo: boolean };
  competencia: string;           // 'yyyy-MM'
  dataFechamento: string;        // 'yyyy-MM-dd'
  dataVencimento: string;
  estado: EstadoDaLinha;
  credito: boolean;              // total < 0
  pagoEm: string | null;         // instante cru; a tela formata
  valores: { totalCent: number; meuCent: number; porPessoaCent: Record<string, number> } | null; // null ⇔ prevista
  entraNaSoma: boolean;
};
export type TotalDaCentral = { totalCent: number; meuCent: number } | null; // null = nenhuma linha somável
export type VisaoGeralDosCartoes = {
  fechadas: LinhaDaCentral[];   // por dataVencimento asc
  abertas: LinhaDaCentral[];    // por dataFechamento asc
  pessoasFechadas: PessoaDaCentral[]; // por nome, pt-BR
  pessoasAbertas: PessoaDaCentral[];
  aPagar: TotalDaCentral;
  emAberto: TotalDaCentral;
  qtdAPagar: number;
  qtdAtrasadas: number;
  proximoVencimento: string | null; // menor dataVencimento >= hoje entre as somáveis de "fechadas"
  temCartaoAtivo: boolean;
};
export function parteDosTerceirosPorPessoa(receivables: readonly ReceivableWithPerson[]): Map<string, Map<string, number>>; // statementId → personId → centavos
export function montarVisaoGeral(p: { hoje: string; cards: readonly CartaoDaCentral[]; statements: readonly DashStatement[]; receivables: readonly ReceivableWithPerson[] }): VisaoGeralDosCartoes;
```

**Regras (do spec §6, sem repetir aqui o que está lá):**
- `meuCent = cent(total_atual) − parteDosTerceirosPorFatura(...)` (converta `ReceivableWithPerson` → `DashReceivable` com `recebido: resumirRecebivel(r).recebido`). **Não** reescreva a subtração a partir das pessoas.
- Fechadas: faturas reais com `hoje >= data_fechamento` e (`estado ∈ {fechada, atrasada}` de **qualquer** cartão, ou `estado = paga` de cartão ativo com `data_vencimento >= hoje`). `entraNaSoma = estado ∈ {fechada, atrasada} && !credito`.
- Abertas: só cartão ativo, uma linha por cartão. Ciclo = primeiro de `resolverFatura(hoje)`, avançando enquanto `hoje >= dataFechamento`. Casamento com fatura real por `card_id` + mês da `competencia`. Fatura real → `estado = statusEfetivo` (pode ser `paga`, que vira "Paga antes de fechar"); sem fatura real → `prevista`, `valores: null`. `entraNaSoma = estado === "aberta" && !credito`.
- Colunas de pessoa: só pessoas com parte ≠ 0 em alguma linha daquela tabela. Numa linha real, pessoa sem parte = `0`.

- [ ] **Step 1: Escrever os testes que falham**, com `hoje = "2026-11-02"` e fixture de **4 cartões**, que reproduz a prévia aprovada:
  - Roxinho: ativo, fecha 27, vence 10.
  - Laranjinha: ativo, fecha 28, vence 5.
  - Verdinho: ativo, fecha 1, vence 8.
  - Azulzinho: **inativo**, fecha 21, vence 28.

  Casos `it(...)`:
  - `"fechadas: atrasada de desativado entra e soma"`: Azulzinho out, 640,00, sem `pago_em` → linha `atrasada`, `card.ativo === false`, `entraNaSoma === true`.
  - `"fechadas: paga fica até o vencimento, fora da soma"`: Roxinho out, pago 2026-11-01T13:00:00Z, vence 2026-11-10 → `paga`, `entraNaSoma === false`. Com `hoje = "2026-11-11"`, a linha some.
  - `"fechadas: crédito fora da soma"`: Verdinho out, total −35 → `credito === true`, `entraNaSoma === false`.
  - `"totais da prévia"`: `aPagar = { totalCent: 239440, meuCent: 191240 }`, `qtdAPagar === 2`, `qtdAtrasadas === 1`, `proximoVencimento === "2026-11-05"`.
  - `"abertas: prevista sem valor e fora da soma"`: Laranjinha sem fatura de nov → `estado "prevista"`, `valores === null`. Se só houver previstas, `emAberto === null`.
  - `"abertas: desativado não tem linha"`.
  - `"zero medido é zero, não prevista"`: Verdinho nov real com `total_atual` 0 → `valores.totalCent === 0` e `estado "aberta"`.
  - `"fechamento hoje vai para fechadas"`: `hoje = "2026-11-27"` → Roxinho nov em `fechadas` como `fechada`; a aberta do Roxinho é a competência dez.
  - `"paga antes de fechar fica em abertas"`: Roxinho nov com `pago_em` e `hoje < 27/11` → em `abertas`, `estado "paga"`, `entraNaSoma === false`.
  - `"duas não pagas do mesmo cartão = duas linhas"`.
  - `"por pessoa fecha com parteDosTerceirosPorFatura"`: para toda linha real, Σ `porPessoaCent` === `totalCent − meuCent`, com um recebível `ignorado` (`recebimentos` com 100) e um parcial.
  - `"colunas de pessoa por tabela"`: Ana só em fechadas e Bruno só em abertas → cada um só na sua lista. Pessoa com `person: null` → nome "Pessoa sem nome".
  - `"virada de ano"`: `hoje = "2026-12-29"`, cartão que fecha dia 28 → aberta com competência `2027-01`.
  - `"inativo sem dívida não aparece e temCartaoAtivo reflete os ativos"`.

- [ ] **Step 2: Rodar e ver falhar.** `npx vitest run src/lib/finance/central-cartoes.test.ts`. Esperado: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar `parteDosTerceirosPorPessoa` e `montarVisaoGeral`** em `central-cartoes.ts`. Funções puras, sem I/O, sem `Date.now()`, com o cabeçalho do arquivo citando o spec.

- [ ] **Step 4: Rodar e ver passar.** Mesmo comando. Esperado: PASS em todos. Depois, `TZ=UTC npx vitest run src/lib/finance/central-cartoes.test.ts`, também PASS.

- [ ] **Step 5: Commit** `feat(cartoes): montarVisaoGeral — fechadas × em aberto, minha parte × cada terceiro (05-A)`.

---

### Task 2: Casca da central + sidebar

**Files:**
- Create: `src/components/cartoes/cartoes-nav.ts` (exporta `NAV_DA_CENTRAL_DE_CARTOES: NavegacaoDeModulo`)
- Create: `src/components/cartoes/cartoes-shell.tsx` (`"use client"`, `CartoesShell({children})` → `<ModuleShell nav={NAV_DA_CENTRAL_DE_CARTOES}>`, no molde de `ai-shell.tsx`)
- Create: `src/app/(app)/cartoes/layout.tsx`, `src/app/(app)/faturas/layout.tsx`, `src/app/(app)/parcelamentos/layout.tsx` (cada um: `export default function …Layout({children}) { return <CartoesShell>{children}</CartoesShell>; }`, sem `metadata`, porque cada página já tem a sua)
- Modify: `src/config/nav.ts:55-57` (edição pontual)
- Modify: `src/components/shared/module-shell.test.ts` (acrescentar a central)
- Modify: `src/config/nav.test.ts` (caso novo)

**Interfaces:**
- Produces: `NAV_DA_CENTRAL_DE_CARTOES = { nome: "Cartões e faturas", grupos: [{ itens: [ {href:"/cartoes", title:"Visão geral", icon: LayoutGrid}, {href:"/cartoes/meus", title:"Meus cartões", icon: CreditCard}, {href:"/faturas", title:"Faturas", icon: ReceiptText}, {href:"/parcelamentos", title:"Parcelamentos", icon: Layers} ] }] }`.
- `nav.ts`: os três itens viram `{ title: "Cartões e faturas", href: "/cartoes", tambem: ["/faturas", "/parcelamentos"], icon: CreditCard, phase: "Fase 03" }`. Remova `ReceiptText`/`Layers` do import se ficarem sem uso.

- [ ] **Step 1: Testes que falham.**
  - Em `module-shell.test.ts`, acrescentar `"cartoes/cartoes-nav.ts"` e `"cartoes/cartoes-shell.tsx"` a `ARQUIVOS_DE_MODULO`, e `{ nome: "Cartões", nav: NAV_DA_CENTRAL_DE_CARTOES }` a `NAVS`.
    - O piso de `TODOS` sobe para `37`.
    - Novo `it("a central de cartões tem exatamente as quatro seções da 05-A")`, com os hrefs `["/cartoes","/cartoes/meus","/faturas","/parcelamentos"]`.
    - Se o teste de "seis arquivos ... > 300 caracteres" reprovar o `cartoes-nav.ts`, dê ao arquivo o cabeçalho explicativo que os outros têm. Não baixe o limite.
  - Em `nav.test.ts`, novo `it("Cartões e faturas representa /faturas e /parcelamentos")`, que espera `href "/cartoes"` e `tambem ["/faturas","/parcelamentos"]`, e que nenhum item se chame "Faturas" ou "Parcelamentos".
  - Em `src/lib/nav/active.test.ts`, um caso: `findNavItem("/faturas")?.title`, `findNavItem("/parcelamentos")?.title` e `findNavItem("/cartoes/meus")?.title` valem todos `"Cartões e faturas"`. Siga o estilo do arquivo; se a função testada lá for outra, use a mesma.
- [ ] **Step 2: Rodar e ver falhar.** `npx vitest run src/components/shared/module-shell.test.ts src/config/nav.test.ts src/lib/nav/active.test.ts`. Esperado: FAIL (nav inexistente e `/cartoes/meus` sem `page.tsx`). O `temPagina("/cartoes/meus")` só passa depois da Task 3: crie já, nesta task, um `src/app/(app)/cartoes/meus/page.tsx` mínimo, que a Task 3 preenche, para manter a árvore verde a cada commit.
- [ ] **Step 3: Implementar** os arquivos acima.
- [ ] **Step 4: Rodar e ver passar.** Mesmo comando + `npx tsc --noEmit`. Esperado: PASS e 0 erros.
- [ ] **Step 5: Commit** `feat(cartoes): casca da central e item único na sidebar (05-A)`.

---

### Task 3: Meus cartões em `/cartoes/meus`

**Files:**
- Modify: `src/app/(app)/cartoes/meus/page.tsx`: o conteúdo **atual** de `src/app/(app)/cartoes/page.tsx`, com `title: "Meus cartões"` na metadata e no `PageHeader`, importando `CardsClient` de `../cards-client`. A descrição continua a mesma.
- Create: `src/app/(app)/cartoes/meus/loading.tsx` (skeleton no padrão de outro `loading.tsx` do Financeiro).
- Modify: `src/app/(app)/faturas/statements-client.tsx:382` → `href="/cartoes/meus"`.
- Modify: `src/app/(app)/configuracoes/page.tsx:41` → `"/cartoes/meus"` (o atalho é de cadastro).
- Modify: `src/lib/actions/credit-cards.ts:15`: acrescentar `revalidatePath("/cartoes/meus")` ao lado do existente.

- [ ] **Step 1:** Implementar. A página `/cartoes` continua com o conteúdo antigo até a Task 4. É aceitável que as duas rotas mostrem a lista por um commit.
- [ ] **Step 2:** `npx tsc --noEmit` e `npx vitest run src/test/deep-links-inline.test.ts src/config/nav.test.ts`. Esperado: 0 erros e PASS.
- [ ] **Step 3: Commit** `feat(cartoes): Meus cartões em /cartoes/meus, conteúdo inalterado (05-A)`.

---

### Task 4: Tela Visão geral em `/cartoes`

**Files:**
- Modify (reescrever): `src/app/(app)/cartoes/page.tsx`: Server Component, `dynamic = "force-dynamic"`, `metadata.title = "Cartões e faturas"`.
- Create: `src/components/cartoes/visao-geral.tsx`: componente **de servidor** (sem `"use client"`) que recebe `VisaoGeralDosCartoes` + `hoje` e renderiza os quatro `StatCard`, os dois blocos e o vazio.
- Create: `src/components/cartoes/estado-da-fatura.ts`: `rotuloDoEstado(linha: LinhaDaCentral, tabela: "fechadas" | "abertas"): { texto: string; tom: "atrasada" | "paga" | "credito" | "prevista" | "aberta" | "neutro" }`, pura, com o texto exato das Global Constraints. "Paga em dd/mm" usa `dateInSaoPaulo(pagoEm)`. Na tabela `abertas`, `paga` vira "Paga antes de fechar". `credito` vence os outros.
- Test: `src/components/cartoes/estado-da-fatura.test.ts`.
- Create: `src/app/(app)/cartoes/loading.tsx`.

**Interfaces:**
- Consumes: `montarVisaoGeral` e os tipos da Task 1; `getCreditCards`, `getStatements` e `getReceivablesByStatements` (`@/lib/finance/queries`); `hojeISO`, `formatCurrency` e `dateInSaoPaulo` (`@/lib/format`).
- Fluxo da página: `const [cards, statements] = await Promise.all([getCreditCards(), getStatements()])` → `getReceivablesByStatements(statements.map(s => s.id))` → `montarVisaoGeral({ hoje: hojeISO(), cards, statements, receivables })`. Mapear `CardStatementWithTotal` para `DashStatement` explicitamente se o tipo não for atribuível.

- [ ] **Step 1: Teste que falha** para `rotuloDoEstado`, com um `it` por linha da tabela do spec §6.5: atrasada, fechada, paga em 01/11 (de `"2026-11-01T13:00:00Z"` → `"Paga em 01/11"`; e `"2026-11-02T01:30:00Z"` → `"Paga em 01/11"` também, porque em Brasília ainda é dia 1), paga antes de fechar, crédito, prevista e aberta.
- [ ] **Step 2: Ver falhar.** `npx vitest run src/components/cartoes/estado-da-fatura.test.ts`.
- [ ] **Step 3: Implementar** `estado-da-fatura.ts`, `visao-geral.tsx`, `page.tsx` e `loading.tsx`, reproduzindo a prévia aprovada (`.superpowers/preview/previa-05a.html`):
  - `PageHeader` com o título "Cartões e faturas" e a descrição "O que está fechado para pagar e o que ainda está acumulando, por cartão.", mais a linha de base.
  - Os quatro `StatCard` em `grid gap-4 sm:grid-cols-2 xl:grid-cols-4`. `TotalDaCentral === null` → valor "sem lançamentos conhecidos". Hint do primeiro: `"{n} faturas · {k} atrasada(s) · próxima vence dd/mm"`. Hint de minha parte: `"terceiros: R$ …"`.
  - Os blocos são `Card`. O cabeçalho tem título + frase curta, e o rodapé tem a nota da prévia.
  - Tabela `hidden md:block overflow-x-auto`; lista `md:hidden`.
  - **Cada linha é um `<Link href={`/faturas?card=${card.id}&month=${competencia}`}>`.** Na tabela, use o link na primeira célula com um overlay `after:absolute after:inset-0` sobre `tr relative`, ou outra técnica sem JS. Nenhum `onClick` e nenhum botão de ação.
  - Selo: o `Badge` existente com classes de tom pelos tokens (`text-destructive`, `text-success-ink`, `text-info-ink`, `text-warning-ink`, `border-dashed text-muted-foreground`), sempre com a palavra.
  - Linha prevista: `text-muted-foreground italic`, e uma célula `colSpan` com "sem lançamentos conhecidos", sem R$. Linha paga: valores com `line-through text-muted-foreground`. Cartão desativado: `Badge variant="outline"` "cartão desativado".
  - Marcador: `span` com `style={{ backgroundColor: card.cor ?? "#A98438" }}`, o mesmo fallback de `cards-client.tsx`.
  - Vazio: `!temCartaoAtivo && fechadas.length === 0` → `EmptyState` com link para `/cartoes/meus`. Tabela sem linhas → a frase dentro do bloco ("Nenhuma fatura fechada a pagar." / "Nenhum cartão ativo.").
  - Falha de leitura: nada a fazer. As leituras lançam, e `src/app/(app)/error.tsx` mostra o erro.
- [ ] **Step 4: Ver passar.** O teste da Step 1, depois `npx tsc --noEmit` e `npm run lint`. Esperado: PASS, 0 erros e 0 erros de lint.
- [ ] **Step 5: Conferir na tela.** `npm run dev` (depois, `git checkout -- AGENTS.md`). Abrir `/cartoes`, `/cartoes/meus`, `/faturas?card=<id>&month=<yyyy-MM>` e `/parcelamentos?card=<id>` com uma sessão real, se houver `.env.local` na worktree.
  - Se não houver credencial, registrar a limitação e conferir com o `next build` + os testes.
  - Prints em 390, 768, 1280 e 1440, nos temas claro e escuro (Chrome headless; em 390, iframe de 390 px, como na prévia), em `C:/tmp/05a-cartoes/.superpowers/evidencias/` (fora do git).
- [ ] **Step 6: Commit** `feat(cartoes): Visão geral da central — fechadas × em aberto, por pessoa (05-A)`.

---

### Task 5: Verificação final

- [ ] **Step 1:** `npm run test:run` (se `boundaries.test.ts` estourar 5 s, repetir com `--testTimeout=30000`; a falha de `approval/schema.test.ts` por CRLF é de ambiente e deve ser citada). Anotar os números reais.
- [ ] **Step 2:** `npm run lint`, `npx tsc --noEmit`, `npm run build` e `npm run perf:bundle`. Anotar os KB de `/(app)/cartoes`, `/(app)/cartoes/meus`, `/(app)/faturas` e `/(app)/configuracoes` (< 285 KB gz).
- [ ] **Step 3:** `git status` limpo, exceto o que está fora do git (`.superpowers/`). `git log --oneline feat/redesign-00-auditoria..HEAD` lista os commits da 05-A e o commit do spec e do plano.
- [ ] **Step 4:** Relatório ao dono: o que mudou · os arquivos · os testes, com números · as evidências · as limitações · os riscos residuais · o que fica para a 05-B (spec §12). **Parar.**
