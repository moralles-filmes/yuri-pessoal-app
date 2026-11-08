# REDESIGN-05-C — Próximos meses, Parcelamentos e Relatórios de cartão · Plano

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar a fase 05 com três telas da central de cartões (Próximos meses, Parcelamentos nas
peças comuns e Relatórios de cartão), a correção do rótulo 6×N em `/relatorios` e as três
pendências da 05-B em `/faturas`.

**Architecture:** Duas funções puras novas (`proximos-meses.ts`, `relatorio-de-cartao.ts`), que
reusam `statusEfetivo`, `montarFatura`, `cicloEmAberto`, `parteDosTerceirosPorFatura` e
`faturasPorMes`, alimentam dois Server Components novos sob `/cartoes`. As telas existentes
(`/parcelamentos`, `/faturas`, a aba Cartões de `/relatorios`) mudam só a apresentação, mais duas
regras pequenas em `organizarFaturasDoCartao`.

**Tech Stack:** Next.js 16 (App Router, `searchParams` async), React 19, Tailwind v4, Vitest
(`environment: node`, teste de tela por varredura de fonte), recharts por fachada + `-impl`.

**Spec:** `docs/superpowers/specs/2026-11-02-05c-proximos-meses-design.md`

## Global Constraints

- Sem migration. D67: sem push, sem PR, sem merge. Não editar `STATUS.md`, `CLAUDE.md`, `AGENTS.md`
  (`git checkout -- AGENTS.md` antes de cada commit se `next dev` tiver rodado).
- Write/Edit gravam CRLF: `sed -i 's/\r$//'` nos arquivos tocados e `git diff --stat` antes de cada
  commit. Revisar o diff atrás de segredo.
- Dinheiro em centavos inteiros na lógica (`reaisParaCentavos`); `faturasPorMes` devolve **reais**.
- Ausência nunca é zero: prevista e mês sem fatura são `null`/frase, nunca `R$ 0,00`.
- O selo sai **só** de `rotuloDoEstado` (`src/components/cartoes/estado-da-fatura.ts`).
- `hoje` injetado; nada de `Date.now()`. Testes com fixture de 2+ cartões e rodados também com
  `TZ=UTC`.
- Clique em célula, linha, card ou indicador nunca escreve nada. Só `Link`.
- Regras de layout do `CLAUDE.md`: `min-w-0` com irmão `shrink-0`, `Button` é `whitespace-nowrap`,
  `YAxis width="auto"`, tabela larga rola dentro do card.
- Gráfico só via fachada `faturas-chart.tsx` (`next/dynamic`). `/(app)/configuracoes` < 285 KB gz.
- Copy exata: "sem lançamentos conhecidos", "fechou sem lançamentos", "— não projeta",
  "Total conhecido", "parcial: N cartão(ões) sem lançamentos", "sem fatura neste mês",
  "Próximos 6 ciclos de cada cartão", "cartão desativado — não acumula compras".

## Review Focus

1. **Cartão com `dia_fechamento` 31 em fevereiro / mês curto**: o ciclo da célula vem de
   `montarFatura` (clampa o dia); a célula não pode cair no mês errado. → teste na Task 1.
2. **Fatura real cuja competência não casa com o ciclo calculado** (cartão reconfigurado): ela
   aparece na coluna da própria competência e o ciclo calculado não cria prevista duplicada. →
   teste na Task 1.
3. **`?meses=`/`?base=`/`?cartao=` lixo** (`?meses=99`, `?base=caixa`, id de outro dono): cai no
   padrão, sem filtro fantasma nem erro. → testes nas Tasks 1 e 3.
4. **Muitos cartões (6+)** na grade e na tabela "Por cartão": rolam dentro do card, a página não. →
   conferência visual na Task 10 com fixture de 6 cartões na prévia real (ou dado do dono).
5. **Crédito (total < 0) num mês**: entra com sinal no total conhecido e no relatório, e o selo é
   "Crédito"; nunca é contado como "a pagar". → testes nas Tasks 1 e 3.

---

## Execução

Para cada task substancial, `ai-router-br:route` decide o executor; o que ficar com o Claude segue
`superpowers:subagent-driven-development`. Depois do primeiro dry-run do router, `git status` e
`git checkout -- CLAUDE.md` se ele tiver mexido. Saída de worker externo é revisada, não
reimplementada; se escrever na árvore principal, refazer na worktree.

Arquivos de teste de fonte usam o mesmo helper de `src/lib/finance/faturas-tela.test.ts`
(`fonteSemComentarios`, local ao arquivo).

---

### Task 1: `montarProximosMeses` (puro)

**Files:**
- Create: `src/lib/finance/proximos-meses.ts`
- Test: `src/lib/finance/proximos-meses.test.ts`

**Interfaces:**
- Consumes: `statusEfetivo`, `montarFatura` (`invoice.ts`); `mesDe`, `proximosMeses`,
  `faturasPorMes`, `parteDosTerceirosPorFatura`, `type DashStatement` (`dashboard.ts`);
  `montarEntradas` (`pipeline.ts`, como em `central-cartoes.ts:150`); `type EstadoDaLinha`,
  `type CartaoDaCentral` (`central-cartoes.ts`); `reaisParaCentavos` (`format.ts`).
- Produces:

```ts
export const HORIZONTES = [3, 6, 12] as const;
export type Horizonte = (typeof HORIZONTES)[number];
export function horizonteDeMeses(bruto: string | undefined): Horizonte; // inválido ⇒ 6

export type CelulaDoMes =
  | { tipo: "real"; statementId: string; estado: EstadoDaLinha; credito: boolean;
      pagoEm: string | null; tabela: "abertas" | "fechadas"; aPagar: boolean;
      totalCent: number; meuCent: number; dataFechamento: string; dataVencimento: string;
      href: string }
  | { tipo: "prevista"; dataFechamento: string; dataVencimento: string; href: string }
  | { tipo: "fechou-sem-lancamentos" }
  | { tipo: "nao-projeta" };

export type TotalDoMes = { totalCent: number; meuCent: number; qtdPagas: number; qtdPrevistas: number } | null;

export type ProximosMeses = {
  meses: string[];                                       // 'yyyy-MM', do mais antigo ao mais novo
  cartoes: (CartaoDaCentral)[];                          // ativos antes, depois nome pt-BR
  celulas: Record<string, Record<string, CelulaDoMes>>;  // [cardId][mes]
  totais: Record<string, TotalDoMes>;                    // [mes]
  atrasadasAntes: { cardId: string; cardNome: string; competencia: string }[];
  vazio: boolean;                                        // nenhum cartão na grade
};

export function montarProximosMeses(p: {
  hoje: string; n: Horizonte; cards: readonly CartaoDaCentral[];
  statements: readonly DashStatement[];
  receivables: readonly ReceivableWithPerson[];
}): ProximosMeses;
```

Regras (do desenho §5): `tabela = hoje < dataFechamento ? "abertas" : "fechadas"`;
`aPagar = (estado === "fechada" || estado === "atrasada") && totalCent > 0`; sem real e cartão
ativo: ciclo = `montarFatura(ano, mês−1, dia_fechamento, dia_vencimento)` — `prevista` se
`hoje < ciclo.dataFechamento`, senão `fechou-sem-lancamentos`; sem real e desativado:
`nao-projeta`. `href = /faturas?card=<id>&month=<mes>`. Totais: `faturasPorMes` sobre as reais das
colunas com `meses` e `agrupar: "competencia"`, convertido para centavos; mês sem nenhuma real ⇒
`null`. `atrasadasAntes`: reais de qualquer cartão com `competencia < meses[0]`,
`statusEfetivo === "atrasada"` e total > 0.

- [ ] **Step 1: Write the failing tests** em `proximos-meses.test.ts`, com `hoje = "2026-11-02"`,
  cartão A (fecha 27, vence 10, ativo), B (fecha 1, vence 8, ativo), C (fecha 15, vence 25,
  desativado):
  - `horizonteDeMeses`: `"3"→3`, `"12"→12`, `undefined→6`, `"99"→6`, `"6abc"→6`.
  - `meses` com n=6 = `["2026-11",…,"2027-04"]`; com n=3 em dez/2026 cruza o ano (`hoje="2026-12-10"`
    ⇒ `["2026-12","2027-01","2027-02"]`).
  - A/nov real 3480,00 aberta ⇒ `tipo:"real"`, `estado:"aberta"`, `tabela:"abertas"`,
    `aPagar:false`, `totalCent:348000`, `meuCent = 348000 − parte dos terceiros`.
  - B/nov real paga ⇒ `estado:"paga"`, `aPagar:false`; o total do mês inclui o valor e
    `qtdPagas:1`.
  - B/jan real total 0 ⇒ `totalCent:0`, `tipo:"real"` (zero medido), `aPagar:false`.
  - B/jan real total 0 **vencida** (`hoje` depois do vencimento) ⇒ `estado:"atrasada"`, `aPagar:false`.
  - A/mar sem real ⇒ `tipo:"prevista"` com `dataFechamento:"2027-03-27"`, `href` certo.
  - B/nov sem real e `hoje="2026-11-02"` (fechou em 01/11) ⇒ `tipo:"fechou-sem-lancamentos"`.
  - Dia exato: `hoje="2026-11-27"`, A/nov sem real ⇒ `fechou-sem-lancamentos` (nunca prevista).
  - C sem nenhuma real no horizonte ⇒ C **não** está em `cartoes`; C com real fechada em nov ⇒ está,
    com `nao-projeta` nos outros meses e `aPagar:true` em nov.
  - Ordem de `cartoes`: ativos (A, B por nome) antes de C.
  - Fevereiro com dia_fechamento 31: cartão D (fecha 31, vence 10) em fev/2027 ⇒ prevista com
    `dataFechamento:"2027-02-28"`.
  - Fatura real de A com competência `2026-12` mas `data_fechamento` reconfigurada ⇒ aparece em
    `celulas[A]["2026-12"]` como real; nenhuma prevista extra para dez.
  - Totais: Σ `totalCent` das reais do mês = `reaisParaCentavos(faturasPorMes(...)[mes].total)`;
    mês só com previstas ⇒ `null`; mês com real + prevista ⇒ `qtdPrevistas:1`.
  - Crédito: real com total −50,00 ⇒ `credito:true`, `aPagar:false`, entra no total com sinal.
  - `atrasadasAntes`: real de A em set/2026 vencida não paga, total > 0 ⇒ `[{ cardId: A,
    competencia: "2026-09" }]`; total 0 vencida ⇒ não entra.
  - `vazio:true` sem cartões ativos e sem real de desativado no horizonte.
- [ ] **Step 2: Run** `npx vitest run src/lib/finance/proximos-meses.test.ts` — FAIL (módulo não existe).
- [ ] **Step 3: Implement** em `proximos-meses.ts`, cabeçalho no estilo de `central-cartoes.ts`.
- [ ] **Step 4: Run** o arquivo e `TZ=UTC npx vitest run src/lib/finance/proximos-meses.test.ts` — PASS.
- [ ] **Step 5: Commit** `feat(redesign): 05-C T1 - grade dos proximos meses (pura)`.

### Task 2: Tela `/cartoes/proximos-meses` + navegação

**Files:**
- Create: `src/app/(app)/cartoes/proximos-meses/page.tsx`, `.../proximos-meses/loading.tsx`,
  `src/components/cartoes/proximos-meses.tsx` (Server Component da grade + lista móvel)
- Modify: `src/components/cartoes/cartoes-nav.ts`, `src/components/shared/module-shell.test.ts`
- Test: `src/components/cartoes/proximos-meses-tela.test.ts` (varredura de fonte)

**Interfaces:**
- Consumes: `montarProximosMeses`, `horizonteDeMeses`, `HORIZONTES` (Task 1); `rotuloDoEstado`,
  `CLASSE_DO_TOM`; `Bloco`; `OlhoDosValores`, `BotaoDoOlho`; `COOKIE_DO_OLHO`, `valoresOcultos`;
  `getCreditCards`, `getStatements`, `getReceivablesByStatements`.
- Produces: rota `/cartoes/proximos-meses?meses=3|6|12`; item de nav
  `{ href: "/cartoes/proximos-meses", title: "Próximos meses", icon: CalendarRange }`.

- [ ] **Step 1: Failing tests.**
  - `module-shell.test.ts`: a lista exata da central passa a ser `["/cartoes", "/faturas",
    "/cartoes/proximos-meses", "/parcelamentos", "/cartoes/meus"]` (o Relatórios entra na Task 5);
    o piso da varredura sobe para 38; `hrefAtivo("/cartoes/proximos-meses", itens)` ⇒
    `"/cartoes/proximos-meses"`.
  - `proximos-meses-tela.test.ts`: a página chama `montarProximosMeses` e `horizonteDeMeses`; o
    componente importa `rotuloDoEstado` e não importa `statusEfetivo`, `resolverFatura` nem
    `faturasPorMes`; contém as strings "sem lançamentos conhecidos", "fechou sem lançamentos",
    "— não projeta", "Total conhecido", "Por competência"; não contém `onClick` nem import de
    `@/lib/actions`; o texto do título/descrição não contém "6 faturas".
- [ ] **Step 2: Run** os dois arquivos — FAIL.
- [ ] **Step 3: Implement.**
  - `page.tsx`: `force-dynamic`, `metadata.title = "Próximos meses"`, lê `searchParams.meses`,
    cookie do olho; recebíveis só das reais com competência dentro do horizonte
    (`getReceivablesByStatements(ids)`); `PageHeader` + linha de base (texto do §5.1) + linha de
    horizonte "{mês por extenso} a {mês por extenso} · N cartões".
  - Seletor: três `Link` com `aria-current` no ativo.
  - Faixa de atrasadas (§5.5) com link `/cartoes`, só se `atrasadasAntes.length > 0`.
  - `proximos-meses.tsx`: `md:` tabela (mês × cartão + "Total conhecido"), abaixo de `md` um bloco
    por mês; estilos por tipo de célula iguais à prévia aprovada (`previa-05c.html`): prevista
    `border-dashed` sem fundo; paga com total `line-through`; `aPagar` com `border-l-4
    border-l-destructive`; zero medido "R$ 0,00 · nada a pagar". Valores com as classes do olho
    (`group-data-[ocultar=true]/olho:hidden` + "R$ ••••"). Legenda no pé.
  - Vazio ⇒ `EmptyState` com link `/cartoes/meus`.
  - `loading.tsx`: skeleton no molde de `cartoes/loading.tsx`.
  - `cartoes-nav.ts`: ordem do §4.3 (sem Relatórios ainda); atualizar o comentário do topo.
- [ ] **Step 4: Run** os dois testes + `npx tsc --noEmit` — PASS.
- [ ] **Step 5: Commit** `feat(redesign): 05-C T2 - tela Proximos meses e navegacao`.

### Task 3: `montarRelatorioDeCartao` (puro)

**Files:**
- Create: `src/lib/finance/relatorio-de-cartao.ts`
- Test: `src/lib/finance/relatorio-de-cartao.test.ts`

**Interfaces:**
- Consumes: `faturasPorMes`, `ultimosMeses`, `mesDe`, `parteDosTerceirosPorFatura`,
  `type DashStatement`; `montarEntradas`; `type CartaoDaCentral`; `reaisParaCentavos`.
- Produces:

```ts
export type BaseDoRelatorio = "competencia" | "vencimento";
export function baseDoRelatorio(bruto: string | undefined): BaseDoRelatorio;     // padrão competencia
export function periodoDoRelatorio(bruto: string | undefined): 6 | 12;          // padrão 12

export type ValoresDoMes = { totalCent: number; meuCent: number; terceirosCent: number; faturas: number };
export type RelatorioDeCartao = {
  base: BaseDoRelatorio; n: 6 | 12; meses: string[];
  cardId: string | null;                                  // null = todos (id desconhecido ⇒ null)
  porMes: { mes: string; valores: ValoresDoMes | null }[]; // null = sem fatura neste mês
  totais: ValoresDoMes | null;                             // null = nenhuma fatura no período
  porCartao: { card: CartaoDaCentral; valores: ValoresDoMes }[]; // só quem teve fatura; ativos antes, nome
};
export function montarRelatorioDeCartao(p: {
  hoje: string; base: BaseDoRelatorio; n: 6 | 12; cardId: string | undefined;
  cards: readonly CartaoDaCentral[]; statements: readonly DashStatement[];
  receivables: readonly ReceivableWithPerson[];
}): RelatorioDeCartao;
```

Valores de cada mês = `faturasPorMes({ statements: <filtradas>, receivables, meses, agrupar: base })`
convertido para centavos; `faturas` = nº de reais cuja chave (`mesDe(competencia)` ou
`mesDe(data_vencimento)`) é o mês; `faturas === 0` ⇒ `valores: null`. `porCartao` = o mesmo,
uma chamada de `faturasPorMes` por cartão, somada nos meses.

- [ ] **Step 1: Failing tests** (2+ cartões, `hoje="2026-11-02"`):
  - `baseDoRelatorio("vencimento")→"vencimento"`, `("caixa")→"competencia"`;
    `periodoDoRelatorio("6")→6`, `("24")→12`.
  - Fatura de A competência `2026-10` com vencimento `2026-11-10`: em `competencia` cai em out, em
    `vencimento` cai em nov.
  - Mês sem fatura ⇒ `valores: null` (nunca `{ totalCent: 0 }`); período sem nenhuma ⇒ `totais: null`.
  - Σ `porCartao` = `totais` (total, meu, terceiros, faturas).
  - `cardId` de A ⇒ só faturas de A em `porMes`/`totais` e `porCartao` só com A; `cardId`
    desconhecido ⇒ `cardId: null` e todos.
  - Crédito (−50,00) entra com sinal; terceiros com `ignorado` conciliam com
    `parteDosTerceirosPorFatura`.
  - `meses` = `ultimosMeses("2026-11", 12)`.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** + `TZ=UTC` — PASS.
- [ ] **Step 5: Commit** `feat(redesign): 05-C T3 - relatorio de cartao (puro)`.

### Task 4: `FaturasChart` aceita mês sem fatura e texto de vazio

**Files:**
- Modify: `src/components/dashboard/faturas-chart-impl.tsx`, `src/components/dashboard/faturas-chart.tsx`
- Test: `src/components/dashboard/graficos-do-painel.test.ts` (acrescentar casos de fonte) ou novo
  `faturas-chart.test.ts`

**Interfaces:**
- Produces: `FaturasChart({ data, vazio? }: { data: (FaturaDoMes | { mes: string; total: null; meu: null; terceiros: null })[]; vazio?: { titulo: string; descricao: string } })`.
  Sem `vazio`, o texto de hoje. O vazio passa a ser "nenhum mês com `total !== null && total !== 0`".
  Mês nulo vai para o recharts como `null` (sem barra).

- [ ] **Step 1: Failing test** de fonte: o `-impl` aceita a prop `vazio`, mantém o texto atual
  "Sem faturas nos próximos meses" como padrão, e não converte `null` em 0 (`?? 0` ausente para
  `meu`/`terceiros`); a fachada continua com `dynamic(` + `ssr: false`.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4:** teste + `npx tsc --noEmit` (os dois
  usos atuais compilam sem mudança) — PASS.
- [ ] **Step 5: Commit** `feat(redesign): 05-C T4 - FaturasChart com mes sem fatura`.

### Task 5: Tela `/cartoes/relatorios` + navegação completa

**Files:**
- Create: `src/app/(app)/cartoes/relatorios/page.tsx`, `.../relatorios/loading.tsx`,
  `src/components/cartoes/relatorio-de-cartao.tsx` (Server), `src/components/cartoes/exportar-relatorio-de-cartao.tsx` (`"use client"`, só o botão do CSV)
- Modify: `cartoes-nav.ts`, `module-shell.test.ts`
- Test: `src/components/cartoes/relatorio-de-cartao-tela.test.ts`

**Interfaces:**
- Consumes: Task 3; `FaturasChart` (Task 4); `Indicador`, `Bloco`, olho; `toCsv`
  (`@/lib/reports/csv`), `downloadCsv` (`@/lib/reports/download`).
- Produces: `/cartoes/relatorios?base=&meses=&cartao=`; item de nav
  `{ href: "/cartoes/relatorios", title: "Relatórios", icon: ChartColumn }`.

- [ ] **Step 1: Failing tests.**
  - `module-shell.test.ts`: lista exata final `["/cartoes", "/faturas", "/cartoes/proximos-meses",
    "/parcelamentos", "/cartoes/relatorios", "/cartoes/meus"]`; piso 39; `hrefAtivo` de
    `/cartoes/relatorios` ⇒ o próprio item.
  - Tela: chama `montarRelatorioDeCartao`, `baseDoRelatorio`, `periodoDoRelatorio`; importa
    `FaturasChart` da **fachada** (`faturas-chart"`, nunca `-impl`); importa `Indicador` e `Bloco`;
    contém "Por competência", "Por vencimento", "sem fatura neste mês", "o valor combinado, não o
    que já voltou"; não importa `@/lib/actions`; o botão do CSV é o único `"use client"` novo e as
    colunas do CSV são `["mes", "faturas", "total", "meu", "terceiros"]`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** conforme §7: dois grupos de links (base, período), `<select>` de
  cartão como formulário GET (sem campo de texto), três `Indicador` (`{ ausente: "sem faturas neste
  período" }` quando `totais === null`), gráfico com `vazio={{ titulo: "Sem faturas neste período",
  descricao: "As faturas aparecem aqui pela base escolhida." }}`, tabela "Por cartão", tabela "Mês a
  mês" (mais novo primeiro) com o botão do CSV, nota "o mês atual ainda pode crescer". Valores no
  olho. `metadata.title = "Relatórios de cartão"`.
- [ ] **Step 4: Run** testes + `tsc` — PASS.
- [ ] **Step 5: Commit** `feat(redesign): 05-C T5 - relatorios de cartao`.

### Task 6: Aba Cartões de `/relatorios` sem "6 faturas" (pontual)

**Files:**
- Modify: `src/app/(app)/relatorios/relatorios-client.tsx` (só linhas 408 e 420–424 e um link)
- Test: `src/app/(app)/relatorios/aba-cartoes.test.ts` (novo, fonte)

- [ ] **Step 1: Failing test:** `relatorios-client.tsx` não contém "Próximas 6 faturas" nem
  "Provisão de 6 ciclos"; contém "Próximos 6 ciclos de cada cartão" e `href="/cartoes/relatorios"`;
  o `n` vem de `new Set(card.faturas.map((f) => f.cardId)).size`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement:** `StatCard` → `label="Próximas faturas"` mantido, `hint={\`Próximos 6
  ciclos de cada cartão · ${n} cartões\`}`; `CardTitle` → "Próximos 6 ciclos de cada cartão",
  `CardDescription` acrescenta "{n} cartões ·"; link "Ver o relatório de cartões ›" no topo da aba.
  Nenhum número muda; nenhuma outra linha do arquivo é tocada (`git diff` confere).
- [ ] **Step 4: Run** — PASS. **Step 5: Commit** `fix(redesign): 05-C T6 - aba Cartoes sem 6 faturas`.

### Task 7: `/faturas` — prevista de qualquer mês futuro e desativado sem prevista

**Files:**
- Modify: `src/lib/finance/faturas-do-cartao.ts`, `src/app/(app)/faturas/statements-client.tsx`
  (o indicador "Fatura atual")
- Test: `src/lib/finance/faturas-do-cartao.test.ts`

**Interfaces:**
- `organizarFaturasDoCartao` passa a aceitar `card: { dia_fechamento: number; dia_vencimento: number; ativo?: boolean }`
  (`ativo` ausente = `true`, para os testes atuais e a Visão geral não mudarem).

- [ ] **Step 1: Failing tests:**
  - `month="2027-04"` (além do próximo ciclo), sem real, ativo ⇒ uma prevista `competencia:"2027-04"`
    em `grupos.proximas`, com datas de `montarFatura`; com `status="paga"` ⇒ nada.
  - `month` passado sem fatura ⇒ `vazio:true` (não cria prevista no passado).
  - `month` futuro **com** fatura real ⇒ só a real.
  - Sem `month` ⇒ exatamente as previstas de hoje (atual + próxima).
  - `ativo:false` ⇒ nenhuma prevista em nenhum grupo; `indicadores.atual` = a real do ciclo atual
    se existir, senão `null`; a atrasada real continua em `grupos.pagar`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.** A prevista extra usa `montarFatura(ano, mês−1, ...)` e só nasce se
  `month > compSeguinte`. Na tela: `atual === null && !selectedCard.ativo` ⇒
  `{ ausente: "cartão desativado — não acumula compras" }`, linha de base "cartão desativado".
- [ ] **Step 4: Run** `faturas-do-cartao.test.ts`, `faturas-tela.test.ts`, `faturas-terceiros.test.ts`,
  `central-cartoes.test.ts` — PASS.
- [ ] **Step 5: Commit** `feat(redesign): 05-C T7 - faturas: prevista futura e desativado sem prevista`.

### Task 8: Olho dos valores em `/faturas`

**Files:**
- Modify: `src/app/(app)/faturas/page.tsx`, `src/app/(app)/faturas/statements-client.tsx`
- Test: `src/lib/finance/faturas-tela.test.ts` (novo `describe("05-C · olho")`)

- [ ] **Step 1: Failing test:** a página lê `COOKIE_DO_OLHO` com `valoresOcultos` e passa
  `ocultoInicial`; a tela importa `OlhoDosValores` e `BotaoDoOlho`, usa
  `group-data-[ocultar=true]/olho:hidden` na lista; `pagar-fatura-dialog.tsx` **não** contém
  `ocultar=true` (o diálogo mostra o valor).
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement:** invólucro em volta de indicadores + grupos; `BotaoDoOlho` como
  `acessorio` do primeiro indicador; total, meu e terceiros de cada fatura (e o detalhamento) com o
  par valor/"R$ ••••".
- [ ] **Step 4: Run** — PASS. **Step 5: Commit** `feat(redesign): 05-C T8 - olho dos valores em faturas`.

### Task 9: Parcelamentos nas peças comuns

**Files:**
- Modify: `src/app/(app)/parcelamentos/page.tsx`, `src/app/(app)/parcelamentos/installments-client.tsx`
- Create: `src/lib/finance/parcelamentos-blocos.ts` (+ `.test.ts`) — agrupamento puro
- Test: `src/app/(app)/parcelamentos/parcelamentos-tela.test.ts` (fonte)

**Interfaces:**
- Produces: `agruparParcelamentos<T extends { status: InstallmentPurchaseStatus; ultima: string | null }>(itens: T[], status: string | null): { emAndamento: T[]; encerrados: T[] }`
  — `emAndamento` = `ativo`, por `ultima` asc; `encerrados` = `finalizado`/`cancelado`, por `ultima`
  desc; com `status` ligado, só o grupo dele tem itens.

- [ ] **Step 1: Failing tests:** puro: ordens dos dois grupos, `status="ativo"` ⇒ `encerrados: []`,
  `status="cancelado"` ⇒ `emAndamento: []`, `ultima: null` vai para o fim. Fonte: a tela importa
  `Indicador` e `Bloco`, não importa `StatCard`, continua chamando `cancelInstallmentFuture` e
  `deleteInstallmentPurchase`, continua montando a URL com `card`, `category` e `status`; a página
  passa `ocultoInicial`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement:** três `Indicador` com os mesmos números de `totais` (tons `saldo`,
  `saida`, `terceiros`; dicas e linhas de base do §6), linha de base da página, blocos "Em
  andamento" / "Finalizados e cancelados" (bloco sem item não aparece), olho. `derive` não muda.
- [ ] **Step 4: Run** — PASS. **Step 5: Commit** `feat(redesign): 05-C T9 - parcelamentos nas pecas comuns`.

### Task 10: Verificação e conferência visual

- [ ] **Step 1:** `npm run test:run` (se `boundaries.test.ts` estourar, `npx vitest run
  src/lib/ai/boundaries.test.ts --testTimeout=30000`), `npm run lint`, `npx tsc --noEmit`,
  `npm run build`, `npm run perf:bundle` — anotar números reais; `/(app)/configuracoes` < 285 KB.
- [ ] **Step 2:** `TZ=UTC npx vitest run src/lib/finance/proximos-meses.test.ts
  src/lib/finance/relatorio-de-cartao.test.ts src/lib/finance/faturas-do-cartao.test.ts
  src/lib/finance/parcelamentos-blocos.test.ts`.
- [ ] **Step 3:** copiar `.env.local` do diretório principal, `npx next dev -p <porta livre>`,
  prints de `/cartoes/proximos-meses`, `/parcelamentos` e `/cartoes/relatorios` em
  390/768/1280/1440, claro e escuro (larguras menores por iframe da mesma origem), incluindo uma
  prevista sem R$ 0,00 e a linha de horizonte; conferir `/faturas?card=X&month=<futuro>` e o olho.
  Sem rolagem horizontal da página. Nenhum pagamento confirmado.
- [ ] **Step 4:** apagar `.env.local`; `git checkout -- AGENTS.md`; `git status` limpo.
- [ ] **Step 5:** relatório final (o que mudou, arquivos, testes, evidências, limitações, riscos,
  aceite da fase 05 item a item) e **parar**.
