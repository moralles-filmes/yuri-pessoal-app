# Gráficos "meus" seguindo a base — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Os gráficos financeiros de `/dashboard/financeiro` e `/relatorios` mostram só a parte do dono, seguem a base (Competência/Caixa), ganham um gráfico de faturas com valor cheio, e nenhum eixo de gráfico do sistema corta rótulo.

**Architecture:** Regras puras novas em `dashboard.ts` (competência, faturas) e `caixa.ts` (caixa, importa do motor — nunca o contrário, P3). A leitura de caixa (`caixa-leitura.ts`) passa a cobrir 6 meses e a mapear pagamento → fatura; quem monta os gráficos de caixa recebe também as entradas do motor (`lerFinanceiro`). A tela escolhe a fonte de cada gráfico pela base.

**Tech Stack:** Next.js 16, TypeScript, Supabase (PostgREST), recharts via `next/dynamic`, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-18-graficos-meus-e-base-design.md`

## Global Constraints

- Dinheiro em centavos por dentro (`reaisParaCentavos`/`centavosParaReais`); `transactions.amount` é reais.
- Funções puras: sem `Date.now()`, `hoje`/`mes`/`periodo` injetados; datas como texto `yyyy-MM-dd`.
- `dashboard.ts` não importa `caixa.ts`.
- Falha de leitura do caixa ⇒ o gráfico declara que não leu (nunca zero).
- Gráfico novo = par fachada + `-impl` com `next/dynamic` (objeto literal) e esqueleto `--chart-skeleton-h`.
- Sem migration. Sem mudança em `resumoMes` nem nos adapters de IA.
- Pronto = `npm run test:run` + `npm run lint` + `npx tsc --noEmit` + `npm run build` + `npm run perf:bundle`, e `TZ=UTC npx vitest run src/lib/finance`.

## Review Focus

- Fatura paga com `total_atual` 0/nulo → pagamento conta cheio como meu e entra em `faturasSemTotal` (teste na Task 3).
- Pagamento de fatura cuja fatura não está nas faturas lidas → mesma regra de "sem total" (teste na Task 3).
- Mês selecionado no passado (mês fechado) em caixa → "Meu mês a mês" usa o mês cheio × anterior cheio (teste na Task 3).
- Leitura do caixa com erro → gráficos de caixa mostram estado "não foi possível ler", não vazio/zero (Task 5, conferência visual).
- Rótulo de eixo em 360 px de largura (Task 6, conferência visual).

---

### Task 1: Uma regra só de "meu × terceiros por fatura"; projeções pelo vencimento

**Files:**
- Modify: `src/lib/finance/dashboard.ts` (`proximas6Faturas`, `projecaoProximosMeses`, novo export)
- Modify: `src/lib/reports/queries.ts:169-188` (usar a regra única)
- Test: `src/lib/finance/dashboard.test.ts`

**Interfaces — Produces:**
- `parteDosTerceirosPorFatura(receivables: DashReceivable[]): Map<string, number>` — centavos por `statement_id`, via `parteDoTerceiroCentavos`.
- `type FaturaDoMes = { mes: string; total: number; meu: number; terceiros: number }` (reais). `reports/queries.ts` passa a reexportar `FaturaMes = FaturaDoMes`.
- `faturasPorMes(params: { statements: DashStatement[]; receivables: DashReceivable[]; meses?: string[]; agrupar: "competencia" | "vencimento" }): FaturaDoMes[]` — com `meses`, devolve exatamente esses meses (vazios = zeros); sem, só os meses que têm fatura, ordenados.
- `projecaoProximosMeses` ganha `receivables: DashReceivable[]`; `faturas` passa a ser a parte MINHA, agrupada por `mesDe(data_vencimento)`.

- [ ] Testes: `faturasPorMes` agrupa por vencimento (fatura competência 2026-10, vence 2026-11-05 → mês 2026-11); meu + terceiros = total; mês sem fatura → zeros. Projeção: fatura 253,41 com recebível 126,70 → `faturas = 126.71` no mês do vencimento. `proximas6Faturas` inalterado (testes existentes verdes).
- [ ] Rodar `npx vitest run src/lib/finance/dashboard.test.ts` → falha.
- [ ] Implementar; `proximas6Faturas`, `reports/queries.ts` (faturasPorMes da aba Cartões, `agrupar: "competencia"` — mantém o histórico como está) e projeção usam `parteDosTerceirosPorFatura`. Atualizar os chamadores de `projecaoProximosMeses` (page do dashboard, reports/queries) com `receivables: recs`.
- [ ] Rodar a suíte de `src/lib/finance` e `src/lib/reports` → verde.
- [ ] Commit `feat(financeiro): regra unica de meu/terceiros por fatura; projecao pelo vencimento`.

### Task 2: Competência — séries "minhas"

**Files:**
- Modify: `src/lib/finance/dashboard.ts` (`evolucaoMensal`, novo `paresDoMesAMes`)
- Modify: `src/lib/finance/dashboard-caracterizacao.test.ts` (bloco 6)
- Test: `src/lib/finance/dashboard.test.ts`

**Interfaces — Produces:**
- `EvolucaoPonto` mantém a forma `{ mes, entradas, saidas, saldo }`, com semântica MINHA: `entradas = entradasMeu`, `saidas = meu`, `saldo = entradasMeu − meu` (centavos). Comentário de `dashboard.ts:526` reescrito citando o desenho de 2026-10-18.
- `type MesAMesDados = { anterior: { entradas: number; saidas: number }; atual: { entradas: number; saidas: number } }`.
- `paresDoMesAMes(c: Comparativo): MesAMesDados` — `entradasMeu`/`meu` de cada lado (no corte até o dia D, `meu` já é só o à vista, porque o corte usa `statements: []`).

- [ ] Testes: mês com receita de terceiro e despesa compartilhada → ponto da evolução = `resumoMes().entradasMeu/meu` e saldo = diferença; `paresDoMesAMes` idem. Bloco 6 da caracterização passa a afirmar o saldo "meu".
- [ ] Falha → implementar → verde. Conferir outros consumidores de `EvolucaoPonto` (`grep -rn "evolucao" src --include=*.ts*`) — CSV/JSON de relatórios passam a rotular "minhas".
- [ ] Commit `feat(financeiro): evolucao e mes a mes com a parte minha (competencia)`.

### Task 3: Caixa — regras puras da parte minha

**Files:**
- Modify: `src/lib/finance/dashboard.ts` (exportar `perdoadoPorLancamento`; novo `itensDasFaturas`)
- Modify: `src/lib/finance/caixa.ts` (`TxDeCaixa` ganha `category?`, `payment_method?` opcionais; funções novas)
- Test: `src/lib/finance/caixa.test.ts`

**Interfaces — Consumes:** `parteDosTerceirosPorFatura` (Task 1), `MesAMesDados`/`EvolucaoPonto`/`CategoriaSlice`/`FormaSlice` (dashboard.ts).

**Interfaces — Produces (caixa.ts):**
- `type PagamentoDeFatura = ReadonlyMap<string, string>` — id do lançamento de pagamento → id da fatura.
- `type MotorDoCaixa = { statements: DashStatement[]; receivables: DashReceivable[]; transactions: DashTx[]; installmentItems: DashInstallmentItem[] }`.
- `type MinhaParteDoCaixa = { entradas: number; saidas: number; saidasBrutas: number; terceirosNasSaidas: number; resultado: number; faturasSemTotal: number }`.
- `minhaParteDoCaixa(p: { periodo: Periodo; transactions: readonly TxDeCaixa[]; pagamentos: PagamentoDeFatura; motor: MotorDoCaixa }): MinhaParteDoCaixa` — mesmas inclusões de `numerosDoCaixa` (`saidasBrutas === numerosDoCaixa(...).saidasDeCaixa`); `entradas = rendaPessoalRecebida`; despesa com conta = `meuCentavos + perdoado do lançamento`; pagamento = `round(amount × meuFatura / total_atual)`; fatura ausente ou total ≤ 0 ⇒ cheio + `faturasSemTotal++`; transferência sem vínculo cheia.
- `evolucaoDoCaixa(p: { meses: string[]; transactions; pagamentos; motor }): EvolucaoPonto[]` — `minhaParteDoCaixa` por mês cheio.
- `mesAMesDoCaixa(p: { mes: string; hoje: string; transactions; pagamentos; motor }): { ateODia: number | null; dados: MesAMesDados }` — mês em andamento: os dois lados cortados no dia D (`periodoAteODia`); fechado: meses cheios.
- `gastosDeCaixa(p: { periodo; transactions; pagamentos; motor }): { categorias: CategoriaSlice[]; formas: FormaSlice[] }` — à vista na categoria/forma dele; fatura paga aberta pelos itens de `itensDasFaturas` × proporção (estorno negativo); resto → fatia `categoryId: "__diferenca_fatura__"`, nome "Diferença da fatura"; fatura sem itens/total → fatia "Fatura sem detalhe"; sem vínculo → "Transferência sem destino" / forma `outro`. Σ `meu` das categorias = `minhaParteDoCaixa().saidas`.

**dashboard.ts:** `itensDasFaturas(p: { transactions; statements; installmentItems; receivables }): Map<string, { categoryId: string | null; categoryName: string | null; categoryColor: string | null; movCent: number; meuCent: number }[]>` — os mesmos itens de cartão de `buildSpendItems` (refatorar para compartilhar) mais estornos (receita com `statement_id`, valores negativos), agrupados por fatura.

- [ ] Testes (valores do desenho §8): fatura 253,41 c/ terceiro 126,70 paga inteira → `saidas` inclui 126,71; paga em 100,00 → `round(10000 × 12671 / 25341)` centavos; total 0 → cheio + `faturasSemTotal = 1`; fatura não lida → idem; reembolso recebido não entra em `entradas`; despesa à vista com recebível ignorado → perdoado conta; Σ categorias meu = saidas (com estorno e com diferença); mês fechado × em andamento em `mesAMesDoCaixa`; `saidasBrutas` = `numerosDoCaixa().saidasDeCaixa`.
- [ ] Falha → implementar → verde; `TZ=UTC npx vitest run src/lib/finance` verde.
- [ ] Mutação: trocar `meuFatura` por `total` na proporção e ver o teste cair; desfazer e conferir com `git diff`.
- [ ] Commit `feat(financeiro): regras de caixa da parte minha (evolucao, mes a mes, categorias)`.

### Task 4: Caixa — leitura de 6 meses e montagem dos gráficos

**Files:**
- Modify: `src/lib/finance/caixa-leitura.ts`
- Modify: `src/app/(app)/dashboard/financeiro/page.tsx`, `src/app/(app)/relatorios/page.tsx`, `src/lib/reports/queries.ts` (se necessário para passar o motor)
- Test: `src/lib/finance/caixa-leitura.test.ts`

**Interfaces — Produces:**
- `lerCaixaDoMes(mesSel: string, desdeMes?: string)` — janela de `desdeMes-01` (padrão: mês anterior) até o fim de `mesSel`; COLUNAS ganha `payment_method,category:categories(id,name,color)`; faturas lidas com `id,pago_transacao_id` ⇒ `pagamentos: Map<txId, statementId>` além de `pagamentosDeFatura` (Set, mantido).
- `EstadoDoCaixa` (`estado: "ok"`) ganha `graficos: { minha: MinhaParteDoCaixa; evolucao: EvolucaoPonto[]; mesAMes: { ateODia: number | null; dados: MesAMesDados }; categorias: CategoriaSlice[]; formas: FormaSlice[] }`.
- `estadoDoCaixa(mesSel: string, hoje: string, motor: MotorDoCaixa, evoMeses: string[])`.

- [ ] Teste de leitura: o filtro da janela usa o 1º dia de `evoMeses[0]`; `pagamentos` mapeia `pago_transacao_id → id`. Os números do topo (`atual`, `anterior`, `corte`) inalterados.
- [ ] Ligar nos dois `page.tsx` (relatórios: passar o motor pelo caminho que já lê `lerFinanceiro`; se `getReportsData` não expõe as entradas, expor `motor` em `FinanceReport` só no servidor ou chamar `estadoDoCaixa` de dentro de `getFinanceAndCardReport` com a base).
- [ ] `npx tsc --noEmit` + testes verdes. Commit `feat(financeiro): leitura de caixa em 6 meses e graficos de caixa montados no servidor`.

### Task 5: A tela — títulos, base nos gráficos, card "Minhas saídas", gráfico novo

**Files:**
- Create: `src/components/dashboard/faturas-chart.tsx` + `faturas-chart-impl.tsx`
- Modify: `src/components/dashboard/{mes-a-mes,categoria,forma-pagamento,evolucao,projecao}-chart-impl.tsx` (+ fachadas se a prop mudar)
- Modify: `src/app/(app)/dashboard/financeiro/financial-dashboard-client.tsx`, `src/app/(app)/relatorios/relatorios-client.tsx`

**Interfaces — Consumes:** `MesAMesDados`, `FaturaDoMes`, `EstadoDoCaixa.graficos`.

- [ ] `MesAMesChart` recebe `dados: MesAMesDados`; legenda "Minhas entradas"/"Minhas saídas" no eixo X. `EvolucaoChart`: legenda "Minhas entradas · Minhas saídas · Meu resultado". `CategoriaChart`/`FormaPagamentoChart` desenham `meu` (filtro `meu > 0`). `ProjecaoChart`: série "Minha parte das faturas". `FaturasChart`: barras empilhadas `meu` ("Minha parte") + `terceiros` ("Parte de terceiros"), tooltip com total.
- [ ] Títulos/descrições exatamente da tabela §5 do desenho, com `{base}` = "Competência" | "Caixa realizado"; em caixa com `caixa.estado === "erro"`, os gráficos dependentes da base mostram "Não foi possível ler o caixa" (EmptyState) — nunca vazio/zero. Em caixa, rodapé com "N fatura(s) sem total contada(s) cheia(s)" quando `faturasSemTotal > 0`.
- [ ] Card-âncora: "Minhas saídas · {mês} · {base}", caixas "Saídas totais (bruto)"/"Saídas de terceiros" (caixa: "Saiu das contas (bruto)"/"Parte de terceiros no que saiu", de `graficos.minha`).
- [ ] Relatórios: mesmos títulos; "Maiores gastos por categoria" e CSV/JSON seguem a base com colunas meu e movimentado rotuladas.
- [ ] `npx tsc --noEmit`, `npm run lint`. Abrir as duas telas nas duas bases (Chrome) e conferir os números de outubro: card Minhas saídas competência = 8.904,27 = ponto de out/26 da evolução. Commit `feat(financeiro): graficos meus seguindo a base e grafico de faturas com valor cheio`.

### Task 6: Checkup dos eixos em todos os gráficos

**Files:**
- Modify: `src/components/dashboard/chart-theme.ts` (`brlCompact`), os `*-impl.tsx` com `<YAxis` listados no desenho §6
- Test: `src/components/dashboard/chart-theme.test.ts` (criar se não existir)

- [ ] Teste: `brlCompact(10000) === "R$ 10 mil"`, `brlCompact(2500) === "R$ 2,5 mil"`, `brlCompact(600) === "R$ 600"`, `brlCompact(1_200_000) === "R$ 1,2 mi"` (sem casa decimal quando inteiro).
- [ ] `export function larguraDoEixo(rotulos: string[]): number` em `chart-theme.ts` (≈ 7 px por caractere a 12 px + 12 de folga, mínimo 32) e usar nos gráficos de valor; demais gráficos (horas, %, kg, contagem): conferir e ajustar largura.
- [ ] Conferir no navegador cada gráfico do sistema (dashboard financeiro, relatórios, estudos, treinos, hábitos, medidas, nutrição) em 360/768/1280 px, claro e escuro. Commit `fix(graficos): eixos sem rotulo cortado em todo o sistema`.

### Task 7: Fechamento

- [ ] Verificação completa (Global Constraints) — anotar resultados.
- [ ] Atualizar `docs/project/CURRENT_STATUS.md` e `docs/handoff/NEXT_AGENT_INSTRUCTIONS.md` (pontual) com a tarefa avulsa; CLAUDE.md só se algo estrutural mudou.
- [ ] Revisão do branch inteiro por um revisor novo. Commit dos docs.
