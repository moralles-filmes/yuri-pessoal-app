# REDESIGN-05-B — Faturas e pagamentos — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/faturas` vira "Faturas e pagamentos": faturas do cartão em quatro grupos priorizados, P1-2 corrigida, peças comuns da 04-A e pagamento lazy com reenvio honesto.

**Architecture:** Uma função pura (`organizarFaturasDoCartao`) decide linhas, estados, grupos e indicadores; a tela cliente só formata. O ciclo em aberto passa a sair de uma função compartilhada com a Visão geral. O diálogo de pagamento sai para um arquivo próprio, carregado por `next/dynamic` + `useLazyDialog`, e o desfecho da resposta é uma função pura.

**Tech Stack:** Next.js 16 (App Router, Server Component + client), TypeScript, Vitest (ambiente node, sem teste de componente — contrato de tela por varredura de fonte), Tailwind v4, shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-11-02-05b-faturas-e-pagamentos-design.md`

## Global Constraints

- Sem migration; banco só leitura. Sem push, PR, merge; não editar `STATUS.md`, `CLAUDE.md`, `AGENTS.md`.
- `git checkout -- AGENTS.md` antes de cada commit; `sed -i 's/\r$//'` nos arquivos tocados; conferir `git diff --stat` e o diff atrás de segredo.
- `statusEfetivo`, `resolverFatura`, `recebimentos.ts`, `montarVisaoGeral` e as RPCs não mudam de comportamento.
- Selo de estado sai SÓ de `rotuloDoEstado` (`src/components/cartoes/estado-da-fatura.ts`), sem exceção (decisão do dono).
- Projeção nunca aparece como `R$ 0,00`; o texto é exatamente `sem lançamentos conhecidos`.
- Nenhuma escrita fora do botão de confirmação de um diálogo.
- `/faturas?card=&month=&status=` com o mesmo significado; `search/queries.ts`, `notifications/generate.ts`, `ai/constants.ts`, `search/types.ts` intocados.
- Dinheiro na lógica pura em centavos inteiros; `formatCurrency` recebe reais.
- Datas puras `'yyyy-MM-dd'` como texto; `pago_em` (timestamptz) lido com `dateInSaoPaulo`.
- Diálogo: `sm:max-w-md` (nunca `max-w-*` sem prefixo); `min-w-0` no lado texto de flex com irmão `shrink-0`.
- `next/dynamic` com objeto literal escrito ali mesmo.
- `perf:bundle` verde; `/(app)/configuracoes` < 285 KB gz.

## Review Focus

1. **Dia exato do fechamento e do vencimento** — a fatura que fecha hoje está em `pagar` e não em `emAberto`; a que vence hoje é `fechada`, não `atrasada`. Testes na Task 2.
2. **Link da linha prevista da Visão geral** (`?month=<competência prevista>`) — mostra a prevista, não "Nenhuma fatura encontrada". Teste na Task 2.
3. **Duas abas / clique duplo** — "já estava paga" não é erro e não fecha em silêncio; a `ref` bloqueia o segundo envio. Testes nas Tasks 3 e 5.
4. **Virada de ano** (ciclo atual dez, próximo jan) — ordem de `proximas` e rótulo "Janeiro de 2027". Teste na Task 2.
5. **Cartão sem nenhuma fatura real** — atual e próxima previstas; "A pagar" = R$ 0,00 medido; atual "sem lançamentos conhecidos". Teste na Task 2.

---

### Task 1: Ciclo em aberto compartilhado + `rotuloDoEstado` estrutural

**Files:**
- Modify: `src/lib/finance/central-cartoes.ts` (bloco "Em aberto", ~linhas 188-200)
- Modify: `src/components/cartoes/estado-da-fatura.ts`
- Test: `src/lib/finance/central-cartoes.test.ts` (existente — deve continuar verde), `src/components/cartoes/estado-da-fatura.test.ts`

**Interfaces:**
- Produces: `export function cicloEmAberto(hoje: string, card: { dia_fechamento: number; dia_vencimento: number }): FaturaAlvo` em `central-cartoes.ts` (`FaturaAlvo` de `invoice.ts`: `{ competencia, dataFechamento, dataVencimento }`).
- Produces: `rotuloDoEstado(linha: Pick<LinhaDaCentral, "credito" | "estado" | "pagoEm">, tabela: "fechadas" | "abertas")` — mesmo retorno.

- [ ] **Step 1:** Testes novos em `central-cartoes.test.ts`, bloco `describe("cicloEmAberto")`: cartão fecha 27/vence 10 — `cicloEmAberto("2026-11-02")` → `dataFechamento "2026-11-27"`; `cicloEmAberto("2026-11-27")` → `dataFechamento "2026-12-27"` (dia do fechamento avança); `cicloEmAberto("2026-12-28")` → competência de jan/2027. Em `estado-da-fatura.test.ts`: chamar `rotuloDoEstado({ credito: false, estado: "prevista", pagoEm: null }, "abertas")` → `{ texto: "Prevista", tom: "prevista" }` (só tipa com o `Pick`).
- [ ] **Step 2:** `npx vitest run src/lib/finance/central-cartoes.test.ts src/components/cartoes/estado-da-fatura.test.ts` → FAIL (`cicloEmAberto` não existe / erro de tipo no `tsc`).
- [ ] **Step 3:** Extrair o `resolverFatura` + `while (hoje >= ciclo.dataFechamento)` para `cicloEmAberto` e fazer `montarVisaoGeral` chamá-lo. Trocar o tipo do parâmetro de `rotuloDoEstado` pelo `Pick`.
- [ ] **Step 4:** Mesmo comando → PASS, incluindo todos os testes antigos de `montarVisaoGeral`. `npx tsc --noEmit` limpo.
- [ ] **Step 5:** Commit `refactor(cartoes): cicloEmAberto compartilhado e rotuloDoEstado estrutural (05-B)`.

### Task 2: `organizarFaturasDoCartao` (lógica pura)

**Files:**
- Create: `src/lib/finance/faturas-do-cartao.ts`
- Test: `src/lib/finance/faturas-do-cartao.test.ts`

**Interfaces:**
- Consumes: `cicloEmAberto` (Task 1); `resolverFatura`, `statusEfetivo` (`invoice.ts`); `nextDayISO` (`dashboard.ts`); `parteDoTerceiroCentavos`, `resumirRecebivel`, `perdoadoCentavos` (`recebimentos.ts`); `reaisParaCentavos` (`format.ts`); `EstadoDaLinha` (`central-cartoes.ts`).
- Produces:

```ts
export type FaturaDaTela = {
  chave: string;                 // statementId ou `prevista|${competencia}`
  statementId: string | null;    // null ⇔ prevista
  competencia: string;           // 'yyyy-MM'
  dataFechamento: string; dataVencimento: string;
  estado: EstadoDaLinha;
  credito: boolean;
  pagoEm: string | null;
  itens: number;
  valores: { totalCent: number; meuCent: number; terceirosCent: number; perdoadoCent: number } | null;
  marca: "atual" | "proxima" | null;
  tabela: "fechadas" | "abertas"; // o 2º argumento de rotuloDoEstado
  acao: "pagar" | "pagar-antes" | "desfazer" | null;
};
export type GruposDeFaturas = { pagar: FaturaDaTela[]; emAberto: FaturaDaTela[]; proximas: FaturaDaTela[]; anteriores: FaturaDaTela[] };
export type IndicadoresDeFaturas = {
  aPagar: { totalCent: number; meuCent: number; qtd: number; qtdAtrasadas: number };
  atual: FaturaDaTela | null;      // null só se o cartão não existe
  proximoVencimento: { data: string; fatura: FaturaDaTela } | null;
};
export function organizarFaturasDoCartao(p: {
  hoje: string;
  card: { dia_fechamento: number; dia_vencimento: number };
  statements: readonly { id: string; competencia: string; data_fechamento: string; data_vencimento: string; pago_em: string | null; total_atual: number | null; itens: number | null }[];
  receivables: readonly ReceivableWithPerson[];
  month: string | null;   // 'yyyy-MM'
  status: string | null;
}): { grupos: GruposDeFaturas; indicadores: IndicadoresDeFaturas; vazio: boolean };
```

Regras (do §6 do desenho, sem reinterpretar):
- Previstas: ciclo `cicloEmAberto(hoje)` e o seguinte (`resolverFatura(nextDayISO(atual.dataFechamento))`) quando a competência não tem fatura real. Se a real da competência do ciclo atual tem `hoje >= data_fechamento`, ela segue o próprio estado e o ciclo atual vira prevista (chave `prevista|…`, convivendo com a real da mesma competência).
- `acao`: real não paga com `totalCent > 0` e `estado ∈ {atrasada, fechada}` ⇒ `"pagar"`; real não paga com `totalCent > 0` e `estado = "aberta"` ⇒ `"pagar-antes"`; real paga ⇒ `"desfazer"`; demais ⇒ `null`.
- `tabela`: `"abertas"` se `hoje < dataFechamento`, senão `"fechadas"`.
- Grupos: `pagar` = `acao === "pagar"` (atrasadas antes, depois vencimento asc, competência asc); `emAberto` = a linha do ciclo atual (marca `"atual"`); `proximas` = competência > a do ciclo atual (marca `"proxima"` na prevista/real do ciclo seguinte), asc; `anteriores` = o resto, competência desc.
- Filtros aplicados à lista ANTES de agrupar; indicadores sobre a lista SEM filtro. `status` compara com `estado`; `prevista` passa só com `status` nulo ou `"aberta"`. `vazio` = nenhum grupo com linha depois do filtro.
- `aPagar` soma `pagar` (sem filtro). `proximoVencimento` = menor vencimento >= hoje de `pagar` (a atrasada já está em "A pagar"), senão o da atual; prevista ainda conta (é data, não valor).

- [ ] **Step 1: testes** (fixture com DOIS cartões é desnecessária aqui — a função é por cartão —, mas o teste usa `receivables` de duas faturas e com `ignorado`). Hoje `"2026-11-02"`, cartão fecha 27/vence 10, faturas reais set (atrasada, total 412,30), out (fechada, 1.754,40, terceiros 482,00), nov (aberta, 3.480,00), ago (paga). Casos, um `it` cada, com `toEqual`/`toBe` nos campos:
  - `grupos.pagar.map(f=>f.competencia)` = `["2026-09","2026-10"]`; `emAberto[0].competencia` `"2026-11"`, `marca "atual"`; `proximas[0]` é prevista `"2026-12"` com `valores null`, `marca "proxima"`; `anteriores` = `["2026-08"]`.
  - `indicadores.aPagar` = `{ totalCent: 216670, meuCent: 168470, qtd: 2, qtdAtrasadas: 1 }`; `proximoVencimento.data` `"2026-11-10"`.
  - sem a fatura real de nov: `indicadores.atual.valores === null` e `estado "prevista"`.
  - hoje `"2026-10-27"` (dia do fechamento de out): out em `pagar` com estado `"fechada"`, `emAberto[0].competencia "2026-11"`.
  - hoje `"2026-11-10"` (vencimento de out): out `estado "fechada"`; `"2026-11-11"`: `"atrasada"`.
  - fatura vencida não paga com `total_atual 0`: em `anteriores`, `estado "atrasada"`, `acao null`; com `-35`: `credito true`, `acao null`.
  - nov paga em `"2026-11-01T15:00:00Z"`: em `emAberto`, `tabela "abertas"`, `acao "desfazer"`.
  - fatura real `"2027-01"` (só parcelas): em `proximas` depois da prevista `"2026-12"`, `acao "pagar-antes"`.
  - hoje `"2026-12-28"`: `emAberto[0].competencia "2027-01"`, `proximas[0].competencia "2027-02"`.
  - `month: "2026-12"` ⇒ só a prevista de dez, `vazio false`; `month: "2026-12", status: "paga"` ⇒ `vazio true`.
  - `status: "atrasada"` ⇒ só set; `status: "aberta"` ⇒ nov + prevista dez; indicadores iguais aos sem filtro.
  - cartão sem faturas reais: `aPagar.totalCent 0`, `atual.valores null`, `proximas` com a prevista.
  - terceiros: recebível `ignorado` com recebido parcial ⇒ `terceirosCent` = Σ `parteDoTerceiroCentavos(resumirRecebivel(r))` da mesma fixture, e `meuCent = totalCent − terceirosCent`.
- [ ] **Step 2:** `npx vitest run src/lib/finance/faturas-do-cartao.test.ts` → FAIL (módulo não existe).
- [ ] **Step 3:** Implementar em `faturas-do-cartao.ts`.
- [ ] **Step 4:** Mesmo comando → PASS; `TZ=UTC npx vitest run src/lib/finance/faturas-do-cartao.test.ts` → PASS.
- [ ] **Step 5:** Commit `feat(faturas): organizarFaturasDoCartao, grupos priorizados (05-B)`.

### Task 3: `desfechoDoPagamento` + constante no caminho rápido

**Files:**
- Modify: `src/lib/finance/statement-payment.ts`
- Modify: `src/lib/actions/statements.ts` (linha `if (st.pago_em) return dbError("Esta fatura já está paga.");`)
- Test: `src/lib/finance/statement-payment.test.ts` (existente ou novo)

**Interfaces:**
- Produces: `export type DesfechoDoPagamento = { tipo: "pago" } | { tipo: "ja-paga" } | { tipo: "incerto" } | { tipo: "data"; mensagem: string } | { tipo: "recusado"; mensagem: string };` e `export function desfechoDoPagamento(res: ActionResult | { excecao: true }): DesfechoDoPagamento`.

- [ ] **Step 1:** Testes: `{ok:true,data:undefined}` → `pago`; `{ok:false,error:MSG_FATURA_JA_PAGA}` → `ja-paga`; `{ok:false,error:MSG_PAGAMENTO_INCERTO}` → `incerto`; `{excecao:true}` → `incerto`; `{ok:false,error:"x",fieldErrors:{dataPagamento:["futura"]}}` → `{tipo:"data",mensagem:"futura"}`; `{ok:false,error:"Conta não encontrada."}` → `recusado`. E varredura de fonte: `src/lib/actions/statements.ts` sem comentários contém `MSG_FATURA_JA_PAGA` e não contém o literal `"Esta fatura já está paga."`.
- [ ] **Step 2:** Rodar o arquivo → FAIL.
- [ ] **Step 3:** Implementar; importar `MSG_FATURA_JA_PAGA` na action e usá-la no `dbError`.
- [ ] **Step 4:** Rodar → PASS; `npx vitest run src/lib/actions` verde.
- [ ] **Step 5:** Commit `feat(faturas): desfecho do pagamento, já paga não é erro (05-B)`.

### Task 4: Variante `ausente` do `Indicador`

**Files:**
- Modify: `src/components/shared/painel/indicador.tsx`
- Test: `src/components/shared/painel/painel.test.ts`

**Interfaces:**
- Produces: prop `valor: string | { erro: string } | { ausente: string }`. `ausente` desenha `<p className="… text-sm italic text-muted-foreground">{frase}</p>` no lugar do número (sem `R$ ••••`).

- [ ] **Step 1:** Teste de fonte no `describe("indicador")`: o arquivo contém `"ausente" in valor` (ou equivalente lido do código), a classe `italic`, e o teste existente "nunca escreve R$ 0,00" continua.
- [ ] **Step 2:** Rodar `npx vitest run src/components/shared/painel/painel.test.ts` → FAIL.
- [ ] **Step 3:** Implementar o terceiro ramo; os usos do painel não mudam.
- [ ] **Step 4:** Rodar → PASS; `npx tsc --noEmit` limpo.
- [ ] **Step 5:** Commit `feat(painel): Indicador com valor ausente (05-B)`.

### Task 5: Diálogo de pagamento lazy

**Files:**
- Create: `src/app/(app)/faturas/pagar-fatura-dialog.tsx` (default export, `"use client"`)
- Modify: `src/app/(app)/faturas/statements-client.tsx` (remove `PayStatementDialog`)
- Test: `src/lib/finance/faturas-tela.test.ts` (novo `describe("05-B · pagamento")`)

**Interfaces:**
- Consumes: `markStatementPaid(id, contaId, data)`, `desfechoDoPagamento` (Task 3).
- Produces: `export type FaturaAPagar = { statementId: string; titulo: string; totalReais: number; meuReais: number; terceirosReais: number; vencimento: string };` e `export default function PagarFaturaDialog(p: { fatura: FaturaAPagar | null; accounts: { id: string; name: string }[]; today: string; onOpenChange: (aberto: boolean) => void })`.

Copy (exata): título `Pagar fatura de {mês} — {cartão}`; botão `Pagar {R$}`/`Pagando…`; `ja-paga`: título `Esta fatura já estava paga`, texto `Ela já constava como paga (talvez em outra aba). Nada foi debitado de novo. A lista foi atualizada.`, botão `Entendi`; `incerto`: título `Não deu para confirmar o pagamento`, texto `A resposta não chegou. A lista foi recarregada: se a fatura aparecer como paga, deu certo. Tentar de novo é seguro — o sistema não paga a mesma fatura duas vezes.`, botões `Fechar` e `Tentar de novo`. `ja-paga` e `incerto` chamam `router.refresh()`. Exceção do `await` vira `desfechoDoPagamento({ excecao: true })`.

- [ ] **Step 1:** Testes de fonte: `statements-client.tsx` contém `dynamic(() => import("./pagar-fatura-dialog")` e `useLazyDialog(` duas vezes ou mais, não contém `markStatementPaid`; `pagar-fatura-dialog.tsx` contém `markStatementPaid(` exatamente 1 vez, `desfechoDoPagamento(`, `useRef`, `sm:max-w-md`, `Nada foi debitado de novo`, `Tentar de novo é seguro`.
- [ ] **Step 2:** Rodar `npx vitest run src/lib/finance/faturas-tela.test.ts` → FAIL.
- [ ] **Step 3:** Implementar; a `ref` `enviando` retorna cedo se já `true`, e é zerada no `finally`. Estado reiniciado por troca de `fatura` durante o render (padrão do `desfazer-pagamento-dialog.tsx`).
- [ ] **Step 4:** Rodar → PASS (os testes 03-F do mesmo arquivo continuam).
- [ ] **Step 5:** Commit `feat(faturas): diálogo de pagamento sob demanda com reenvio (05-B)`.

### Task 6: A tela — grupos, indicadores, rótulo

**Files:**
- Modify: `src/app/(app)/faturas/statements-client.tsx`
- Modify: `src/app/(app)/faturas/page.tsx` (título, `metadata`, descrição, linha de base)
- Modify: `src/components/cartoes/cartoes-nav.ts` (`title: "Faturas e pagamentos"`) e os testes que citam o rótulo (`src/components/shared/module-shell.test.ts` se afirmar o título)
- Test: `src/lib/finance/faturas-tela.test.ts` (novo `describe("05-B · tela")`), `src/app/(app)/faturas/faturas-terceiros.test.ts` (continua)

**Interfaces:**
- Consumes: `organizarFaturasDoCartao` (Task 2), `rotuloDoEstado` (Task 1), `Indicador` com `ausente` (Task 4), `Bloco` + `estadoDoBloco` (04-A), `PagarFaturaDialog`/`FaturaAPagar` (Task 5).

Layout pelo §8 do desenho e pela prévia aprovada: filtros → 3 `Indicador` (`saida` "A pagar neste cartão", `terceiros` "Fatura atual · {mês}", `saldo` "Próximo vencimento") → `Bloco` "Precisam de pagamento" (sempre; vazio "Nenhuma fatura fechada a pagar."), "Em aberto — acumulando compras", "Próximas", "Pagas e anteriores" (só com linhas) → `EmptyState` atual se `vazio`. Cada fatura: competência "Outubro de 2026" (inicial maiúscula, sem `capitalize` em CSS), selo de `rotuloDoEstado(f, f.tabela)` com as classes `CLASSE_DO_TOM` da Visão geral (mover o mapa para `estado-da-fatura.ts` e importá-lo nas duas telas), selos "Atual"/"Próxima", datas, meu · terceiros (+ `fraseDoPerdoado`), total (riscado se paga; `sem lançamentos conhecidos` em itálico se prevista; "nada a pagar" se real com total ≤ 0 e sem ação), botões por `acao`, expandir (só real com itens). Atrasada: `border-l-4 border-l-destructive`. Prevista: `border-dashed bg-transparent`. Detalhamento: o JSX atual movido sem mudar regra.

- [ ] **Step 1:** Testes de fonte: `statements-client.tsx` importa `organizarFaturasDoCartao`, `rotuloDoEstado`, `Indicador`, `Bloco`; não importa `StatCard`, `StatementStatusBadge`, `resolverFatura`; contém `sem lançamentos conhecidos`; não contém `capitalize`; `page.tsx` contém `"Faturas e pagamentos"`; `cartoes-nav.ts` contém `title: "Faturas e pagamentos"`. `module-shell.test.ts`/`deep-links-inline.test.ts` verdes.
- [ ] **Step 2:** Rodar `npx vitest run src/lib/finance/faturas-tela.test.ts src/components src/test` → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Rodar → PASS; `npm run lint` e `npx tsc --noEmit` limpos.
- [ ] **Step 5:** Commit `feat(faturas): Faturas e pagamentos priorizadas, P1-2 corrigida (05-B)`.

### Task 7: Verificação e evidência

- [ ] **Step 1:** `npm run test:run` (se `boundaries.test.ts` estourar 5 s, repetir com `--testTimeout=30000`); anotar arquivos/testes reais. Falha de `approval/schema.test.ts` por CRLF é de ambiente e é declarada.
- [ ] **Step 2:** `npm run lint`, `npx tsc --noEmit`, `npm run build`, `npm run perf:bundle` — anotar `/faturas` e `/(app)/configuracoes` (< 285 KB).
- [ ] **Step 3:** `npm run dev`, `/faturas` com a sessão do dono em 390/768/1280/1440, claro e escuro, incluindo uma fatura atual prevista sem R$ 0,00 (ex.: `?card=<cartão sem compra no ciclo>`), e `?card=X&month=Y` de um link da Visão geral. Prints fora do git. `git checkout -- AGENTS.md` depois.
- [ ] **Step 4:** Revisão final da branch inteira (subagente revisor), correções com teste vermelho antes.
