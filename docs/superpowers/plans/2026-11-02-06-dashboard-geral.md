# REDESIGN-06 — Dashboard geral (print 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Levar `/dashboard` ao visual do print 2 — barra, banner, faixa do Resumo financeiro e grade dos 11 cards — sem mudar o que um número significa.

**Architecture:** A faixa e o card Financeiro leem uma função nova `lerResumoDoDashboard(mes, hoje)` embrulhada em `cache` do React (mês inteiro + 5 meses de histórico só de lançamentos + saldo até hoje), que delega a uma função pura `montarResumoDoDashboard`. As peças comuns da 04-A (`shared/painel/`) são reusadas; a grade continua a do `GeneralDashboard` (client) com cada card em `Suspense` + um limite de erro novo (`LimiteDoBloco`).

**Tech Stack:** Next.js 16 (App Router, RSC), React 19 (`cache`), TypeScript, Tailwind v4, Vitest (ambiente `node`, sem teste de componente — prova por varredura de fonte e por chamada de Server Component).

**Spec:** `docs/superpowers/specs/2026-11-02-06-dashboard-geral-design.md` (aprovado). Leia-o inteiro antes da primeira tarefa; cada tarefa cita a seção.

## Global Constraints

- Worktree `C:/tmp/06-dashboard`, branch `feat/redesign-06-dashboard`. Nunca tocar outra árvore.
- **D67:** sem push, sem PR, sem merge, sem deploy. Commits locais.
- **Nenhuma migration.** Se parecer necessária: parar e perguntar ao dono.
- Antes de cada commit: `sed -i 's/\r$//' <arquivos alterados>`, `git checkout -- AGENTS.md`, `git diff --stat` e revisão do diff atrás de segredo (`.env`, chave, `service_role`).
- Mensagens de commit terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Não editar `CLAUDE.md`, `AGENTS.md`, `docs/redesign/STATUS.md`.
- Peças de `src/components/shared/painel/` reusadas, nunca copiadas. Única mudança permitida ali: exportar `INDICADOR_PEQUENO_NO_CELULAR` de `indicador.tsx` (Task 7).
- pt-BR em todo texto de tela; "hoje" e datas por `hojeISO()` como texto; hora do banner por `horaDeBrasiliaAgora()`; nunca `.slice(0,10)` em instante.
- Ausência nunca vira zero; erro nunca vira zero; cor nunca sozinha (palavra junto).
- Clicar num card, quadro ou linha nunca dispara escrita (o único controle de escrita é o check-in de Hábitos, que já existe).
- Gráfico só por fachada + `-impl` com `next/dynamic` (objeto literal). Nada importa `recharts` fora de `*-impl.tsx`.
- Nada em `src/lib/dashboard`, `src/components/dashboard`, `src/app/(app)/dashboard` importa `ai/server/insight-runner`, `actions/ai-insights`, `ai/server/insight-job`.
- `DASH_CARD_IDS`, `DASH_CARD_TITLES`, `normalizeLayout` e o formato salvo não mudam.
- Layout: `min-w-0` no lado texto de flex com irmão `shrink-0`; `@container` para densidade de card; dinheiro nunca truncado.

## Review Focus

1. **Período que não é o mês corrente** (`?periodo=anterior` ou personalizado): a faixa mostra o mês da janela, a comparação vira "vs. mês anterior" sem corte do dia, e o saldo continua "em DD/MM" de hoje. → teste em Task 2.
2. **Dono sem histórico** (meses anteriores sem lançamento): seta com "sem base de comparação", nunca `+∞%`/`NaN`. → teste em Task 2.
3. **Layout salvo antigo com `period: "hoje"`**: o seletor "Período padrão" abre em "Hoje", e salvar a ordem mantém "hoje" (não grava o período da URL). → teste em Task 4.
4. **Semana do Treinos começando no domingo** (`weekStartsOn` = 0): as barras começam em "Dom". → teste em Task 12.
5. **Rosca com exatamente 8 categorias**: não dobra; com 9, vira 7 + "Outros (2 categorias)". → teste em Task 5.

---

### Task 1: Janela e escopo do histórico do dashboard

**Files:**
- Modify: `src/lib/finance/pipeline.ts` (junto de `janelaDoGastoAlto` ~l. 455 e dos escopos ~l. 468–524)
- Test: `src/lib/finance/pipeline.test.ts`

**Interfaces:**
- Produces: `janelaDoHistoricoDoDashboard(mes: string): JanelaFinanceira`; `ESCOPO_HISTORICO_DO_DASHBOARD` (`nome: "historico-do-dashboard"`, `transacoes: true`, os outros oito `false`), incluído na união `EscopoFinanceiro`.

- [ ] **Step 1: Testes que falham**

```ts
it("06 · janela do histórico: os 5 meses ANTERIORES, sem o mês", () => {
  expect(janelaDoHistoricoDoDashboard("2026-11")).toEqual({ from: "2026-06-01", to: "2026-10-31" });
  expect(janelaDoHistoricoDoDashboard("2026-03")).toEqual({ from: "2025-10-01", to: "2026-02-28" });
});
it("06 · escopo do histórico lê só lançamentos", () => {
  expect(flags(ESCOPO_HISTORICO_DO_DASHBOARD)).toEqual({ ...todosFalsos, transacoes: true });
});
```
(`flags` já existe no arquivo, ~l. 1346; `todosFalsos` = as nove chaves de leitura em `false`, montado no teste.)

- [ ] **Step 2:** `npx vitest run src/lib/finance/pipeline.test.ts` → FAIL (não definido).
- [ ] **Step 3:** Implementar com `addMes` (de `dashboard.ts`) e `ultimoDiaDoMes`. Se algum teste existente afirmar "quatro escopos", atualizá-lo para cinco.
- [ ] **Step 4:** Rodar de novo → PASS; `npx tsc --noEmit` sem erro novo (a união nova não pode quebrar `montarEntradas`/`EntradasDoEscopo`).
- [ ] **Step 5:** Commit `feat(redesign): 06 T1 - janela e escopo do historico do dashboard`.

---

### Task 2: `montarResumoDoDashboard` (puro)

**Files:**
- Create: `src/lib/dashboard/resumo-financeiro-puro.ts`
- Test: `src/lib/dashboard/resumo-financeiro-puro.test.ts`

**Interfaces:**
- Consumes: `resumoMes`, `perdoadoDoMes`, `totalAReceber`, `proximasContasPagar`, `evolucaoMensal`, `comparativoMesAMes`, `paresDoMesAMes`, `ultimosMeses`, `mesDe` (`@/lib/finance/dashboard`); `comparativoDoGraficoAteODia` (`@/lib/finance/caixa`); `saldoDasContas`, `CompletudeFinanceira`, `EntradasDoEscopo` + `ESCOPO_CARD_FINANCEIRO` (`@/lib/finance/pipeline`); `saldoComData`, `indicadorMinhasEntradas`, `comparacaoDosIndicadores`, `dadosDasBarras` (`@/lib/finance/painel`); `FinanceCardData` (`@/lib/dashboard/types`).
- Produces:

```ts
export type ResumoDoDashboard = {
  mes: string;
  completudeDoMes: CompletudeFinanceira;
  completudeDoHistorico: CompletudeFinanceira;
  /** Os mesmos números de `getFinanceCardData` para o mês (equivalência testada). */
  numeros: Omit<FinanceCardData, "completude" | "mes">;
  saldoCom: { rotulo: string; valor: number | null; diferenca: string | null };
  entradasInd: { valor: number; linhaDeTerceiros: string | null };
  comparacao: { entradas: ComparacaoDoIndicador; saidas: ComparacaoDoIndicador };
  barras: (EvolucaoPonto & { parcial: boolean })[];
};
export function montarResumoDoDashboard(p: {
  mes: string;
  hoje: string;
  doMes: EntradasDoEscopo<typeof ESCOPO_CARD_FINANCEIRO>;
  contas: AccountWithBalance[];
  historicoTxs: DashTx[];
  saldoAte: number | null;
  completudeDoMes: CompletudeFinanceira;
  completudeDoHistorico: CompletudeFinanceira;
}): ResumoDoDashboard;
```

Regras (spec §4.3–§4.4): os números do mês usam **só** `doMes`. Barras e comparação usam `doMes.txs` ∪ `historicoTxs` (concatenados; faturas/recebíveis só de `doMes`). `barras = dadosDasBarras(evolucaoMensal({ meses: ultimosMeses(mes, 6), ... }), mesDe(hoje))`. `comparacao` = o caminho da 04-A: `grafico = comparativoDoGraficoAteODia({ mes, hoje, transactions, receivables })`; `comparacaoDosIndicadores({ dados: paresDoMesAMes(grafico ? grafico.comparativo : comparativoMesAMes(...)), ateODia: grafico?.ateODia ?? null, base: "competencia", futuro: mes > mesDe(hoje) })`. `saldoCom = saldoComData({ saldoAte, saldoDaView: saldoDasContas(contas), hoje })`.

- [ ] **Step 1: Testes que falham** (fixtures sintéticas com `DashTx`/`DashStatement`/`DashReceivable`, valores à mão):
  - `"numeros = os campos de getFinanceCardData para as mesmas linhas"` — mocka `@/lib/finance/queries` (`lerFinanceiro` devolve a fixture do mês) e `getAccounts` se preciso; chama `getFinanceCardData(mes, hoje)` e `montarResumoDoDashboard(...)`; `expect(r.numeros).toEqual(omit(card, ["completude", "mes"]))`.
  - `"o histórico entra nas barras e nunca nos números do mês"` — um lançamento de outubro em `historicoTxs` muda `barras` (out) e **não** muda `numeros`.
  - `"nenhum lançamento entra duas vezes"` — com um `id` de `doMes.txs` repetido em `historicoTxs`, a função lança `Error("lançamento repetido entre o mês e o histórico")` (as janelas são disjuntas; repetição é defeito de quem chamou).
  - `"mês em andamento: compara até o dia e a saída fica sem cor"` — `mes="2026-11"`, `hoje="2026-11-18"`: `comparacao.saidas.sentido === "neutro"` e `texto` contém `"até o dia 18"`.
  - **Review Focus 1:** `"mês passado: compara o mês inteiro"` — `mes="2026-10"`, `hoje="2026-11-18"`: `texto` de entradas `=== "vs. mês anterior"`; `saldoCom.rotulo === "Saldo das contas · em 18/11"`.
  - **Review Focus 2:** `"sem histórico: sem base"` — `historicoTxs=[]` e outubro vazio: `comparacao.entradas.pct === null` e `texto === "sem base de comparação"`.
  - `"saldo não lido vira null, nunca zero"` — `saldoAte: null` ⇒ `saldoCom.valor === null`.
  - `"barras: 6 meses e o mês de hoje parcial"` — `barras.map(b => b.mes)` = `["2026-06",…,"2026-11"]`, só o último `parcial: true`.
- [ ] **Step 2:** `npx vitest run src/lib/dashboard/resumo-financeiro-puro.test.ts` → FAIL.
- [ ] **Step 3:** Implementar. Nenhuma soma escrita à mão: só as funções citadas.
- [ ] **Step 4:** Rodar → PASS; `TZ=UTC npx vitest run src/lib/dashboard/resumo-financeiro-puro.test.ts` → PASS.
- [ ] **Step 5:** Commit `feat(redesign): 06 T2 - montarResumoDoDashboard puro`.

---

### Task 3: `lerResumoDoDashboard` (I/O com `cache`)

**Files:**
- Create: `src/lib/dashboard/resumo-financeiro.ts` (`import "server-only"`)
- Test: `src/lib/dashboard/resumo-financeiro.test.ts`

**Interfaces:**
- Consumes: Task 1, Task 2; `lerFinanceiro`, `lerSaldoAte` (`@/lib/finance/queries`); `janelaDoMes`, `ESCOPO_CARD_FINANCEIRO` (`@/lib/finance/pipeline`); `nextDayISO`.
- Produces: `export const lerResumoDoDashboard: (mes: string, hoje: string) => Promise<ResumoDoDashboard>` = `cache(async (mes, hoje) => …)` com `cache` de `react`. Faz as três leituras em **um** `Promise.all` e não captura erro (quem captura são os consumidores).

- [ ] **Step 1: Testes que falham**
  - `"duas chamadas com os mesmos argumentos leem o banco uma vez só"` — `vi.mock("react", async (orig) => ({ ...(await orig()), cache: memoizarPorArgumentos }))` (memoizador simples por `JSON.stringify(args)` no próprio teste), `lerFinanceiro` e `lerSaldoAte` mockados; `await lerResumoDoDashboard("2026-11","2026-11-18")` duas vezes ⇒ `lerFinanceiro` chamado **2** vezes (mês + histórico), `lerSaldoAte` 1 vez, com `{ janela: { from: "2026-11-01", to: "2026-11-30" }, escopo: ESCOPO_CARD_FINANCEIRO }` e `{ janela: { from: "2026-06-01", to: "2026-10-31" }, escopo: ESCOPO_HISTORICO_DO_DASHBOARD }`.
  - `"está embrulhada em cache("` — varredura da fonte (sem comentários): contém `cache(async`.
  - `"ErroDeLeitura sobe"` — `lerFinanceiro` rejeita `new ErroDeLeitura("os lançamentos")` ⇒ a promessa rejeita com ele.
- [ ] **Step 2:** Rodar → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Rodar → PASS.
- [ ] **Step 5:** Commit `feat(redesign): 06 T3 - lerResumoDoDashboard com cache`.

---

### Task 4: Textos e regras puras da página (hoje, período padrão)

**Files:**
- Create: `src/lib/dashboard/rotulos.ts` + `src/lib/dashboard/rotulos.test.ts`
- Modify: `src/lib/dashboard/period.ts` (+ `period.test.ts`)

**Interfaces:**
- Produces:
  - `rotuloDeHoje(hojeIso: string): string` → `"hoje, qua 18/11"` (dia da semana abreviado minúsculo sem ponto: dom seg ter qua qui sex sáb; calculado com `Date.UTC` sobre o texto, nunca o fuso do processo).
  - `rotuloDoDia(hojeIso: string): string` → `"18/11"`.
  - `visaoDoPeriodo(p: DashPeriod): DashView` em `period.ts` → `semana`→`"semana"`, `hoje`→`"dia"`, demais→`"mes"` (a regra que hoje está inline em `selectPeriod` de `period-toolbar.tsx`).
  - `payloadDoSalvar(p: { order: DashCardId[]; hidden: DashCardId[]; periodoPadrao: DashPeriod }): DashboardLayoutInput` → `{ order, hidden, period: periodoPadrao, view: visaoDoPeriodo(periodoPadrao) }` em `period.ts` (importa o tipo de `@/lib/validators/settings` só como `import type`).

- [ ] **Step 1: Testes que falham**
  - `rotuloDeHoje("2026-11-18") === "hoje, qua 18/11"`; `rotuloDeHoje("2026-11-22") === "hoje, dom 22/11"`; `rotuloDeHoje("2026-11-21") === "hoje, sáb 21/11"`.
  - `visaoDoPeriodo("hoje") === "dia"`, `("semana") === "semana"`, `("mes") === "mes"`, `("anterior") === "mes"`, `("custom") === "mes"`.
  - **Review Focus 3:** `payloadDoSalvar({ order, hidden, periodoPadrao: "hoje" })` ⇒ `{ order, hidden, period: "hoje", view: "dia" }` (o período da URL não é parâmetro: não há como vazar).
- [ ] **Step 2:** Rodar `npx vitest run src/lib/dashboard/rotulos.test.ts src/lib/dashboard/period.test.ts` → FAIL.
- [ ] **Step 3:** Implementar; `period-toolbar.tsx` passa a usar `visaoDoPeriodo` (sem mudar comportamento).
- [ ] **Step 4:** Rodar → PASS; `TZ=UTC` também.
- [ ] **Step 5:** Commit `feat(redesign): 06 T4 - rotulos de hoje e payload do salvar (R7)`.

---

### Task 5: D15 — "Outros" na rosca

**Files:**
- Create: `src/lib/painel/rosca.ts` + `src/lib/painel/rosca.test.ts`
- Modify: `src/components/dashboard/rosca-categorias-chart.tsx` (fachada; ~l. 39–80)

**Interfaces:**
- Consumes: `CategoriaSlice` (`@/lib/finance/dashboard`), `reaisParaCentavos`/`centavosParaReais` (`@/lib/format`).
- Produces: `export type FatiaDaRosca = CategoriaSlice & { dobradas?: string[] }`; `export function dobrarEmOutros(fatias: readonly CategoriaSlice[], maximo = 8): FatiaDaRosca[]`. Entrada já filtrada por `dadosDaRosca`; saída ordenada por `meu` desc, empate pelo `name` (`localeCompare("pt-BR")`). Acima de `maximo`: as `maximo − 1` maiores + `{ categoryId: null, name: "Outros (N categorias)", meu: Σ em centavos, dobradas: [nomes] , ...demais campos numéricos somados em centavos }`.

- [ ] **Step 1: Testes que falham**
  - **Review Focus 5:** 8 fatias ⇒ devolve 8, nenhuma com `dobradas`; 9 fatias ⇒ 8, a última `name === "Outros (2 categorias)"`, `dobradas` com os 2 nomes menores.
  - Σ `reaisParaCentavos(meu)` da saída === Σ da entrada (fixture com centavos quebrados, ex.: 10,01 + 0,02 + …).
  - Empate na fronteira: duas fatias de mesmo `meu` ⇒ fica a de nome alfabeticamente menor, nos dois sentidos da ordem de entrada.
  - Varredura: a fachada chama `dobrarEmOutros(` depois de `dadosDaRosca(` e `foraDaRosca(` continua recebendo `categorias` (não as fatias dobradas).
- [ ] **Step 2:** Rodar `npx vitest run src/lib/painel/rosca.test.ts` → FAIL.
- [ ] **Step 3:** Implementar; na fachada, `const fatias = dobrarEmOutros(dadosDaRosca(categorias))`; na legenda, sob a linha de uma fatia com `dobradas`, um `<p className="text-xs text-muted-foreground">` com os nomes separados por vírgula. A cor por posição já dá o slot 8 a "Outros".
- [ ] **Step 4:** Rodar → PASS; `npx vitest run src/components/dashboard` (testes de gráfico existentes) → PASS.
- [ ] **Step 5:** Commit `feat(redesign): 06 T5 - D15 dobra em Outros acima de 8 categorias`.

---

### Task 6: Falha isolada — `LimiteDoBloco` e o desenho de falha

**Files:**
- Create: `src/components/dashboard/general/limite-do-bloco.tsx` (`"use client"`), `src/lib/dashboard/limite.ts` + `limite.test.ts`
- Modify: `src/components/shared/card-sem-leitura.tsx`
- Test: `src/components/dashboard/general/cards-sem-leitura.test.ts` (bloco `CardSemLeitura` ~l. 43–50)

**Interfaces:**
- Produces:
  - `estadoDoLimite(s: { erro: unknown | null }): "conteudo" | "falha"` (puro, em `limite.ts`) — só para a decisão ser testável.
  - `<LimiteDoBloco nome="os dados de Estudos">{children}</LimiteDoBloco>` — classe com `getDerivedStateFromError`; fallback = componente de função `FalhaDoBloco({ oQue, onReset })` com o desenho do §6.1 e o botão "Tentar de novo" que chama `onReset()` (zera o erro) e `useRouter().refresh()`. `componentDidCatch` faz `console.error("[dashboard] bloco sem leitura:", nome)`.
  - `CardSemLeitura` com `role="alert"`, fundo `bg-destructive/10 ring-1 ring-destructive/20`, `AlertTriangle` `text-destructive`; texto idêntico.

- [ ] **Step 1: Testes que falham**
  - `estadoDoLimite({ erro: null }) === "conteudo"`; `({ erro: new Error("x") }) === "falha"`.
  - Em `cards-sem-leitura.test.ts`: o `CardSemLeitura` contém `role="alert"` e `AlertTriangle`; o texto antigo continua (asserções existentes).
  - Varredura de `limite-do-bloco.tsx`: contém `getDerivedStateFromError`, `router.refresh()` e o texto "O card fica sem valores para não mostrar um número errado."; **não** contém `href="/dashboard"`.
- [ ] **Step 2:** Rodar → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Rodar `npx vitest run src/lib/dashboard/limite.test.ts src/components/dashboard/general` → PASS.
- [ ] **Step 5:** Commit `feat(redesign): 06 T6 - limite de erro por bloco e desenho da falha`.

---

### Task 7: A faixa do Resumo financeiro

**Files:**
- Create: `src/components/dashboard/general/resumo-financeiro.tsx` (Server Component)
- Modify: `src/components/shared/painel/indicador.tsx` (exportar `INDICADOR_PEQUENO_NO_CELULAR`), `src/app/(app)/dashboard/financeiro/financial-dashboard-client.tsx` (~l. 105: importar em vez de declarar)
- Test: `src/components/dashboard/general/cards-sem-leitura.test.ts`, `cards-sem-leitura-comportamento.test.ts`

**Interfaces:**
- Consumes: `lerResumoDoDashboard` (Task 3), `CardSemLeitura` (Task 6), `Indicador`, `OlhoDosValores`, `BotaoDoOlho`.
- Produces: `export async function ResumoFinanceiro({ mes, hoje, ocultos }: { mes: string; hoje: string; ocultos: boolean })`.

Conteúdo: exatamente a tabela do spec §4.3 (rótulos, linhas de base, links, `dica` da 04-A para os três equivalentes e a nova do cartão), cabeçalho "Resumo financeiro" + "<mês por extenso> · base: competência", selo "parcial" quando `completudeDoMes.estado === "parcial"` com o texto "parcial · a leitura atingiu o teto de lançamentos; pode faltar coisa". Mesmo padrão de captura do `finance-card.tsx`: `try { d = await lerResumoDoDashboard(mes, hoje) } catch (e) { if (!ehErroDeLeitura(e)) throw e; falha = e; registrarFalhaDeLeitura(e) }`, JSX fora do `try`, falha ⇒ `<CardSemLeitura oQue={falha?.oQue ?? "o resumo financeiro"} href="/dashboard" />`. `OlhoDosValores` envolve **só** a grade dos 4. Grade: `grid grid-cols-3 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4`, saldo `col-span-3 sm:col-span-1`, os outros com `INDICADOR_PEQUENO_NO_CELULAR`.

- [ ] **Step 1: Testes que falham**
  - Em `cards-sem-leitura.test.ts`, acrescentar `["resumo-financeiro.tsx", "lerResumoDoDashboard"]` ao `describe.each`.
  - Em `cards-sem-leitura-comportamento.test.ts`, mockar `@/lib/dashboard/resumo-financeiro` (`lerResumoDoDashboard: vi.fn()`) e acrescentar `["ResumoFinanceiro", "lerResumoDoDashboard", () => ResumoFinanceiro({ mes: "2026-09", hoje: "2026-09-10", ocultos: false })]`.
  - Varredura de `resumo-financeiro.tsx`: contém `"Minhas entradas"`, `"Minhas saídas"`, `"Total em cartões"`, `entradasInd` e `<BotaoDoOlho`; não contém `getFinanceCardData`, `lerFinanceiro` nem `lerSaldoAte`.
  - `financial-dashboard-client.tsx` não declara mais `const INDICADOR_PEQUENO_NO_CELULAR`.
- [ ] **Step 2:** Rodar → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Rodar `npx vitest run src/components/dashboard src/components/shared "src/app/(app)/dashboard"` → PASS.
- [ ] **Step 5:** Commit `feat(redesign): 06 T7 - faixa do Resumo financeiro`.

---

### Task 8: Card Financeiro novo

**Files:**
- Modify: `src/components/dashboard/general/finance-card.tsx`
- Test: `cards-sem-leitura.test.ts`, `cards-sem-leitura-comportamento.test.ts`, `src/lib/finance/entradas-do-card.test.ts` (~l. 33–44)

**Interfaces:**
- Consumes: `lerResumoDoDashboard`, `BarrasEntradasSaidasChart` (sem mudança; props: `dados` = `resumo.barras`), `fraseDoPerdoado`, `rotuloPendenteDoMes`.
- Produces: `FinanceCard({ window, todayIso })` com a mesma assinatura de hoje.

Conteúdo (spec §4.7 linha Financeiro): "Realmente meu" grande (`numeros.meu`), "de R$ X movimentados" (`numeros.saidas`) + `fraseDoPerdoado(numeros.perdoado)`, barras, "Ver relatório ›" → `/relatorios`, linhas De terceiros · `rotuloPendenteDoMes(mes)` · Próximas contas a pagar + a frase da 1ª conta. Nota de parcial do mês (mesmo texto da faixa) e, se `completudeDoHistorico.estado === "parcial"`, "o histórico das barras pode estar incompleto".

- [ ] **Step 1: Testes que falham / reescritos**
  - `cards-sem-leitura.test.ts`: a linha do `finance-card.tsx` passa a `"lerResumoDoDashboard"`.
  - `cards-sem-leitura-comportamento.test.ts`: o caso FinanceCard usa o mock de `lerResumoDoDashboard`.
  - `entradas-do-card.test.ts`: tirar `finance-card.tsx` da lista do `apresentarEntradas(`; novo caso: `finance-card.tsx` **não** contém `formatCurrency(` aplicado a `.entradas` e `resumo-financeiro.tsx` lê `entradasInd` (o RR4 mudou de lugar). Comentário no teste citando D-06-2.
- [ ] **Step 2:** Rodar os três → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Rodar os três → PASS.
- [ ] **Step 5:** Commit `feat(redesign): 06 T8 - card Financeiro (Realmente meu + barras)`.

---

### Task 9: Página, moldura dos cards e barra

**Files:**
- Modify: `src/app/(app)/dashboard/page.tsx`, `general-dashboard-client.tsx`, `src/components/dashboard/general/card-shell.tsx`, `card-meta.ts`, `period-toolbar.tsx`, `primitives.tsx`
- Create: `src/app/(app)/dashboard/pagina-do-dashboard.test.ts`

**Interfaces:**
- Consumes: Tasks 4, 6, 7; `BannerDeBoasVindas`, `saudacaoPara`, `fraseDoDia`, `FRASES_DO_BANNER`, `horaDeBrasiliaAgora`, `getDisplayName`, `valoresOcultos`, `COOKIE_DO_OLHO`.
- Produces:
  - `Quadro({ valor, rotulo, tom = "neutro" }: { valor: string; rotulo: string; tom?: "neutro" | "vermelho" | "verde" | "ambar" })` em `primitives.tsx`.
  - `CardShell` ganha `subtitulo?: string`; ícone em quadrado `size-8 rounded-[10px] bg-primary/10 text-primary`; link "Ver mais ›".
  - `GeneralDashboard` ganha `subtituloById: Partial<Record<DashCardId, string>>` e `faixa: React.ReactNode` (renderizada entre o banner — que vem por `banner: React.ReactNode` — e a grade); grade `grid gap-4 md:grid-cols-2 xl:grid-cols-3`.

Página: banner (spec §4.2, `linha="Aqui está um resumo da sua vida em um só lugar."`), faixa em `<LimiteDoBloco nome="o resumo financeiro"><Suspense fallback={<CardBodySkeleton lines={3} />}><ResumoFinanceiro …/></Suspense></LimiteDoBloco>`, cada um dos 11 conteúdos envolvido por `LimiteDoBloco` por fora do `Suspense`. `subtituloById`: `todo`, `dieta`, `tarefas`, `habitos` = `rotuloDeHoje(todayIso)`; `financeiro` = "<mês> · competência". `DASH_CARD_HREF.notificacoes = "/notificacoes"`. Barra: F3 (`aria-pressed` em cada botão da visão, `role="group" aria-label="Visão"`); modo Personalizar com `<Select>` "Período padrão" (estado inicial `layout.period`) e `save()` chamando `saveDashboardLayout(payloadDoSalvar({ order, hidden, periodoPadrao }))`.

- [ ] **Step 1: Testes que falham** (`pagina-do-dashboard.test.ts`, varredura sem comentários):
  - cada id de `DASH_CARD_IDS` aparece como chave de `contentById` dentro de um `<LimiteDoBloco`; `<ResumoFinanceiro` está dentro de `<LimiteDoBloco`.
  - a página contém `"Aqui está um resumo da sua vida em um só lugar."` e `<BannerDeBoasVindas`.
  - `general-dashboard-client.tsx` contém `payloadDoSalvar(` e **não** contém `saveDashboardLayout({ order, hidden, period, view })`.
  - `period-toolbar.tsx` contém `aria-pressed=` dentro do `map` de `DASH_VIEWS`.
  - `DASH_CARD_HREF.notificacoes === "/notificacoes"` (teste em `cards.test.ts` ou no novo arquivo); o teste de `href` no disco da 02-D continua verde.
- [ ] **Step 2:** Rodar → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** `npx vitest run "src/app/(app)/dashboard" src/components/dashboard src/lib/dashboard` → PASS; `npx tsc --noEmit` → limpo.
- [ ] **Step 5:** Commit `feat(redesign): 06 T9 - pagina, moldura dos cards, F3 e R7`.

---

### Task 10: Cards de quadros — TO-DO, Cartões & Faturas, Agenda, Tarefas & Rotinas, Estudos

**Files:**
- Modify: `todo-card.tsx`, `invoices-card.tsx`, `agenda-card.tsx`, `tasks-card.tsx`, `studies-card.tsx` (todos em `src/components/dashboard/general/`)
- Create: `src/components/dashboard/general/anatomia-dos-cards.test.ts`

**Interfaces:**
- Consumes: `Quadro` (Task 9), `rotuloDoDia` (Task 4), `valorDaFatura` (`@/lib/finance/painel`). Nenhuma leitura muda.

Conteúdo: spec §4.7, linha a linha. TO-DO: `Quadro` Hoje · Atrasadas · Urgentes (P1, `vermelho`) · Concluídas hoje (`verde`) + Próximas tarefas (sem "Conclusão na semana", sem pendentes totais, sem projetos). Cartões: Abertas · Fechadas · Pagas · "A pagar nas faturas" (`formatCurrency(d.totalProximas)`) + vencimentos (valor por `valorDaFatura`; `null` ⇒ "sem lançamentos conhecidos") + linha `rotuloTotalPendenteAte(todayIso)` + nota de parcial se `d.completude.estado === "parcial"`. Agenda: "Eventos hoje (DD/MM)" + `Eventos ${periodWord}` + próximos + vazio com botão "Adicionar evento" → `/agenda`. Tarefas: Hoje · Atrasadas · Em andamento + Rotinas de hoje (sem a lista de tarefas). Estudos: Em andamento · `Horas ${periodWord}` · Atrasados (`ambar`) + cursos com selo "atrasado" em palavra (sem o trio).

- [ ] **Step 1: Testes que falham** (varredura sem comentários):
  - `todo-card.tsx` contém `"Urgentes (P1)"`, `"Concluídas hoje"`, `tom="vermelho"`, `tom="verde"`; não contém `"Conclusão na semana"`.
  - `invoices-card.tsx` contém `"A pagar nas faturas"` e `valorDaFatura(`; não contém `"Total pendente"`.
  - `agenda-card.tsx` contém `"Eventos hoje ("` e `"Adicionar evento"`.
  - `tasks-card.tsx` não contém `"tarefa(s) aberta(s)"`.
  - `studies-card.tsx` contém `tom="ambar"` e não contém `tom="vermelho"`.
  - `InvoicesCard` chamado com fatura prevista vazia (mock de `getInvoicesCardData`) não renderiza `"R$ 0,00"` (procurar no `JSON.stringify` do elemento).
- [ ] **Step 2:** Rodar → FAIL. **Step 3:** Implementar. **Step 4:** Rodar `npx vitest run src/components/dashboard/general` → PASS.
- [ ] **Step 5:** Commit `feat(redesign): 06 T10 - anatomia dos cards de quadros`.

---

### Task 11: Dieta, Hábitos e Notificações

**Files:**
- Modify: `nutrition-card.tsx`, `habits-card-body.tsx`, `notifications-card.tsx`, `src/lib/dashboard/queries.ts` (`getNotificationsCardData` ~l. 398), `src/lib/dashboard/types.ts` (`NotificationsCardData`)
- Test: `anatomia-dos-cards.test.ts`, `src/lib/dashboard/notificacoes-card.test.ts` (novo)

**Interfaces:**
- Produces: `getNotificationsCardData()` lança `ErroDeLeitura("as notificações")` em erro de leitura (via o núcleo de `@/lib/supabase/leitura`), e devolve `{ available: true, unread }` no sucesso. Se o código do erro for "tabela inexistente" (`42P01`), continua `{ available: false, unread: 0 }` (o "Em breve" legítimo). `NotificationsCard` passa a capturar `ErroDeLeitura` no padrão 03-G e mostrar `CardSemLeitura oQue="as notificações"`.

Conteúdo: Dieta — `Quadro` Energia · Proteína (`nutrientText`), nota de parcial existente, "Refeições: X de Y registradas", Próxima refeição; sem módulo ⇒ vazio com botão "Configurar dieta" → `/nutricao`; saem aderência, água, compras, peso. Hábitos — anel SVG `X/Y` "concluídos hoje" (`stroke-dasharray` proporcional; `scheduledToday === 0` ⇒ "sem hábitos para hoje", nunca `0/0`), quadro Sequência, lista com o check-in existente, água como linha de leitura (sem o botão "+copo"). Notificações — como hoje + a falha.

- [ ] **Step 1: Testes que falham**
  - `notificacoes-card.test.ts`: com o client mockado devolvendo `{ error: { code: "XX000" } }` ⇒ rejeita com `ErroDeLeitura`; com `{ error: { code: "42P01" } }` ⇒ `{ available: false, unread: 0 }`; com `{ count: 3, error: null }` ⇒ `{ available: true, unread: 3 }`.
  - `cards-sem-leitura.test.ts`: acrescentar `["notifications-card.tsx", "getNotificationsCardData"]`.
  - Varredura: `nutrition-card.tsx` contém `"Configurar dieta"` e não contém `"Aderência de hoje"`; `habits-card-body.tsx` não contém `incrementHabit` e contém `"concluídos hoje"`.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar. **Step 4:** `npx vitest run src/components/dashboard/general src/lib/dashboard` → PASS.
- [ ] **Step 5:** Commit `feat(redesign): 06 T11 - Dieta, Habitos e Notificacoes`.

---

### Task 12: Treinos — barras da semana

**Files:**
- Create: `src/lib/dashboard/treinos-semana.ts` + `treinos-semana.test.ts`
- Modify: `src/lib/dashboard/queries.ts` (`getTrainingCardData` ~l. 532–600), `src/lib/dashboard/types.ts` (`TrainingCardData`), `src/components/dashboard/general/training-card.tsx`

**Interfaces:**
- Consumes: `consistencyCalendar`, `dashboardRange`, `sessionsInRange`, `ConsistencyDay` (`@/lib/training/dashboards`).
- Produces:
  - `export type EstadoDoDiaNaSemana = "treinou" | "planejado" | "descanso" | "livre" | "a_seguir"`
  - `export function semanaDoCard(dias: readonly ConsistencyDay[]): { data: string; rotulo: string; estado: EstadoDoDiaNaSemana }[]` — mapeamento exato da tabela do spec §4.7 (`treinado`/`parcial`→`treinou`; `planejado_sem_execucao` com `isToday`→`planejado`, sem→`livre`; `descanso`→`descanso`; `livre`→`livre`; `futuro`→`a_seguir`); `rotulo` = Seg Ter Qua Qui Sex Sáb Dom pela data (com `Date.UTC`).
  - `TrainingCardData` ganha `semana: ReturnType<typeof semanaDoCard>` e `semanaDe: { de: string; ate: string }`.

Card: sessão em andamento (como hoje) · "semana de DD/MM a DD/MM" no corpo · `Quadro` treinos na semana · `Quadro` volume (`"sem treino"` quando nulo) · `partialReason` · barras (7 colunas; `treinou` cheia `bg-primary`; `planejado` `border-dashed border-primary`; `descanso`/`livre` baixa `bg-muted border`; `a_seguir` `border-dotted border-border` sem preenchimento) · legenda só dos estados presentes, com palavra · linha "Hoje". Saem último treino, meta e peso.

- [ ] **Step 1: Testes que falham**
  - `semanaDoCard` com um dia de cada estado de `ConsistencyState` ⇒ os estados mapeados acima; `planejado_sem_execucao` com `isToday: false` ⇒ `"livre"`.
  - **Review Focus 4:** 7 dias começando em `2026-11-15` (domingo) ⇒ `rotulo` do primeiro `"Dom"`, do último `"Sáb"`.
  - Varredura de `training-card.tsx`: contém `data.semana.map(`; não contém `destructive`, `red-`, `"falta"`, `"Último treino"`, `"Meta ·"`.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar; em `getTrainingCardData`, `consistencyCalendar(sessionsInRange(history, weekRange), scheduled.map(e => ({ scheduledDate: e.scheduledDate, entryKind: e.entryKind, status: e.status })), weekRange, todayIso, metricOptions)` (o planejamento já lido; nenhuma leitura nova).
- [ ] **Step 4:** `npx vitest run src/lib/dashboard src/components/dashboard/general` e `TZ=UTC npx vitest run src/lib/dashboard/treinos-semana.test.ts` → PASS.
- [ ] **Step 5:** Commit `feat(redesign): 06 T12 - Treinos com barras da semana sem vermelho`.

---

### Task 13: Verificação, desvios e conferência visual

**Files:**
- Modify: `docs/redesign/REFERENCIA-VISUAL.md` (§6: as linhas "(06)" da tabela do spec §8)

- [ ] **Step 1:** `npm run test:run` → 0 falhas (anotar o número real de testes e arquivos).
- [ ] **Step 2:** `npm run lint` → 0 erros; `npx tsc --noEmit` → limpo.
- [ ] **Step 3:** `TZ=UTC npx vitest run src/lib/dashboard src/lib/painel src/lib/finance/pipeline.test.ts` → PASS.
- [ ] **Step 4:** `npm run build` e depois `npm run perf:bundle` → verde; `/(app)/dashboard` sem salto anômalo e `/(app)/configuracoes` < 285 KB gz (anotar os dois números).
- [ ] **Step 5:** `npx vitest run src/lib/ai/boundaries.test.ts` → PASS (aceite 8).
- [ ] **Step 6:** Acrescentar as linhas "(06)" ao §6 de `REFERENCIA-VISUAL.md`; commit `docs(redesign): 06 desvios do print no paragrafo 6`.
- [ ] **Step 7:** Conferência visual com a sessão do dono (o agente principal faz, não um subagente): copiar `.env.local` do diretório principal para a worktree, pedir ao dono para trazer o Chrome à frente, `npm run dev`, painel de iframes 390/768/1280/1440 com `Promise.race` de 38 s em 1280×609, claro e escuro, mostrando a faixa, a grade e um card com erro isolado; medir o contraste do texto branco do banner sobre `--banner-from` nos dois temas; conferir que não há rolagem horizontal. Para a prova do erro isolado, um `throw new ErroDeLeitura("os dados de Estudos")` **temporário e não commitado** no início de `StudiesCard`, capturado e revertido com `git checkout -- src/components/dashboard/general/studies-card.tsx` (conferir `git status` limpo depois). Apagar o `.env.local` no fim e `git checkout -- AGENTS.md`.
