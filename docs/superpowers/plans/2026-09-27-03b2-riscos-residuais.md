# REDESIGN-03-B2 — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar os riscos residuais da 03-B — oito itens sem mover número (A1–A8) e três com número, aprovados pelo dono (B1–B3).

**Architecture:** O pipeline de `src/lib/finance/pipeline.ts` (puro) + `lerFinanceiro` (I/O, `finance/queries.ts`) ganham tipos que dependem do que foi lido, linhas estritas com estreitamento declarado e completude; o Cron continua entrando só pela camada pura. As fronteiras passam a ser provadas com o compiler API do TypeScript além da regex da 03-B.

**Tech Stack:** Next.js 16, TypeScript 5, Vitest (ambiente `node`), supabase-js 2.108, compiler API do `typescript`.

**Spec:** `docs/superpowers/specs/2026-09-27-03b2-riscos-residuais-design.md` — o contrato. Executor lê os dois.

## Global Constraints

- Nenhuma migration; nenhuma regeneração de `src/types/supabase.ts`; `supabase/` intocado.
- `docs/redesign/STATUS.md` intocado.
- Sem push, sem merge, sem deploy, sem upstream.
- Parâmetros de `getFinanceCardData(mes, todayIso, owner?)`, `getInvoicesCardData(todayIso)`, `getReportsData(mesSel)`, `generateForUser(service, userId, now)` e `gerarAlertas(params)` não mudam. Retornos só ganham campo.
- `src/lib/finance/dashboard-caracterizacao.test.ts` (65) e `src/lib/finance/dashboard.test.ts` (24) não são editados e ficam verdes em todo passo.
- Testes da 03-B mudam só onde a mudança é o objetivo do item, com o motivo no commit.
- Fixture sintética; nenhum valor em R$, nome de pessoa, categoria ou saldo real.
- Nenhum `Date.now()`/`new Date()` sem argumento no código novo.
- Commits: título pt-BR sem acento `refactor(redesign): 03-B2 <item> — ...`; corpo com o fechado, o que mudou de natureza, o que não mudou, mutações; termina com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Cada passo: `npx vitest run src/lib/finance/ src/lib/notifications/` (+ diretórios tocados) verde, `npx tsc --noEmit` limpo, `git diff` revisado.

## Review Focus

1. **Escopo passado como variável do tipo união `EscopoFinanceiro`** — o tipo condicional tem de errar para "menos campos", nunca expor campo não lido. Teste de tipo na Task 3.
2. **Embed vindo como array** (PostgREST pode tipar relação como lista) — `primeiro()` normaliza; teste com `statement: [{…}]` na Task 2.
3. **Contagem nula (falha de leitura)** — completude tem de sair "parcial", nunca "exato". Teste na Task 4.
4. **Mês corrente sem nenhum mês anterior com saída** — a régua única devolve média 0 e o alerta não dispara (sem `NaN`). Teste na Task 9.
5. **Todas as contas inativas e com saldo zero** — a IA continua devolvendo o estado vazio de hoje. Teste na Task 10.

---

## Mapa de arquivos

| Arquivo | Papel | Tasks |
| --- | --- | --- |
| `src/lib/finance/pipeline.ts` | linhas estritas, estreitamento, tipos por escopo, completude, janelas | 2, 3, 4, 5, 9 |
| `src/lib/finance/queries.ts` | três leituras com owner, `lerFinanceiro` genérica, `count: "exact"` | 1, 3, 4 |
| `src/lib/finance/saldo-das-contas.ts` (novo) | `saldoDasContas`, sem import | 5 |
| `src/lib/finance/limiares-de-alerta.ts` (novo) | `LIMIARES_DE_ALERTA`, sem import | 6 |
| `src/lib/finance/dashboard.ts` | defaults de `gerarAlertas`; `reguaDoGastoAlto`; `mediaDeSaidas` sem parâmetro | 6, 9 |
| `src/lib/notifications/cron.ts` | `select` estrito, zero `as Linha*`, `.gt`, régua única | 2, 8, 9 |
| `src/lib/notifications/generate.ts` | `DEFAULTS` lê a constante | 6 |
| `src/lib/search/queries.ts` | `.gt("itens", 0)` | 8 |
| `src/lib/dashboard/queries.ts`, `src/lib/dashboard/types.ts` | sem janela inútil; `completude` | 3, 4 |
| `src/lib/reports/queries.ts` | `completude` em `FinanceReport`/`CardReport` | 4 |
| `src/app/(app)/dashboard/financeiro/page.tsx` | régua única | 9 |
| `src/app/(app)/financeiro/page.tsx`, `.../contas/accounts-client.tsx` | `saldoDasContas` | 5 |
| `src/lib/ai/tools/adapters/finance.ts` | completude, `ultimoDiaDoMes`, saldo de todas | 4, 6, 10 |
| `src/lib/ai/insights/collectors/finance.ts` | qualidade por mês | 4 |
| `src/lib/finance/fronteira-do-motor.test.ts` (novo) | fronteira com checker | 7 |
| `src/lib/finance/leituras-da-view-de-faturas.test.ts` (novo) | varredura da view | 8 |
| `src/lib/notifications/cron.test.ts` (novo) | harness do Cron | 8, 9 |
| `src/lib/finance/limiares-de-alerta.test.ts` (novo) | borda tela × sino | 6 |
| `src/lib/finance/saldo-das-contas.test.ts` (novo) | módulo sem import + varredura do `reduce` | 5 |

---

### Task 1: A4 — `LeituraDoDono` nas três leituras; o guard sai

**Files:**
- Modify: `src/lib/finance/queries.ts` (`getCreditCards` ~L259, `getStatementInstallmentItems` ~L457, `getRecurrences` ~L495, `lerFinanceiro` ~L586-666)
- Test: `src/lib/finance/ler-financeiro.test.ts`

**Interfaces:**
- Produces: `getCreditCards(owner?: LeituraDoDono)`, `getRecurrences(owner?: LeituraDoDono)`, `getStatementInstallmentItems(statementIds: string[], owner?: LeituraDoDono)`; `lerFinanceiro` sem o `throw`.

- [ ] **Step 1: Trocar os dois testes do guard por um teste de owner nos três escopos** (em `ler-financeiro.test.ts`, describe "03-B2 A4 — com owner, cada leitura do escopo filtra user_id"):

```ts
it.each([
  ["card do dashboard", ESCOPO_CARD_FINANCEIRO, 5],
  ["card de faturas", ESCOPO_FATURAS, 3],
  ["relatório", ESCOPO_RELATORIO, 8],
] as const)("%s: toda leitura sai pelo client do dono e filtra user_id", async (_, escopo, n) => {
  await lerFinanceiro({ janela: JANELA, escopo, owner: DONO });
  expect(estado.leituras).toHaveLength(n);
  expect(estado.clientsDaSessao).toBe(0);
  for (const leitura of estado.leituras) {
    expect(leitura.origem).toBe("dono");
    expect(leitura.filtros).toContainEqual(["eq", "user_id", "user-1"]);
  }
});
```
E no relatório, a leitura de parcelas também carrega `["in", "statement_id", ["st-1"]]`.

- [ ] **Step 2:** `npx vitest run src/lib/finance/ler-financeiro.test.ts` → FALHA (o guard lança).
- [ ] **Step 3: Implementar** no idioma de `getAccounts`:

```ts
export async function getCreditCards(owner?: LeituraDoDono): Promise<CreditCardRow[]> {
  const supabase = owner?.client ?? (await createClient());
  const base = supabase.from("credit_cards").select("*");
  const { data } = await (owner ? base.eq("user_id", owner.userId) : base)
    .order("ativo", { ascending: false })
    .order("nome", { ascending: true });
  return (data ?? []) as CreditCardRow[];
}
```
`getRecurrences` idem. `getStatementInstallmentItems`: `.in("statement_id", ids)` e, com owner, `.eq("user_id", owner.userId)` — **mesmo com ids já filtrados** (invariante 84). Em `lerFinanceiro`, apagar o bloco `if (owner) { … throw … }` e passar `owner` às três; atualizar o docblock (o ⛔ do guard vira a explicação de que as oito leituras aceitam owner).
- [ ] **Step 4:** testes verdes; `npx tsc --noEmit` limpo.
- [ ] **Step 5: Commit** `refactor(redesign): 03-B2 A4 — LeituraDoDono nas tres leituras, e o guard sai` (declarar N8 obsoleta).

---

### Task 2: A2 — linhas estritas, estreitamento declarado, zero `as Linha*`

**Files:**
- Modify: `src/lib/finance/pipeline.ts` (tipos de linha, `montarEntradas`), `src/lib/notifications/cron.ts` (`select` de transações e recebíveis; chamada de `montarEntradas`)
- Test: `src/lib/finance/pipeline.test.ts`

**Interfaces:**
- Produces: `type Embutido<T> = T | readonly T[] | null`; `LinhaTx` com `type: string; status: string; payment_method: string | null` e todos os campos obrigatórios; `export function lancamentosForaDoDominio(transacoes: readonly LinhaTx[]): number`.

- [ ] **Step 1: Testes novos** em `pipeline.test.ts`:

```ts
describe("03-B2 A2 — linhas estritas e estreitamento declarado", () => {
  const base: LinhaTx = {
    amount: 10, type: "despesa", status: "pago", competence_date: "2026-05-01",
    valor_pessoal: null, payment_method: null, card_id: null, statement_id: null,
    parcelado: false, category_id: null, category: null,
  };
  it("linha sem category_id não compila (conferido pelo tsc --noEmit)", () => {
    const { category_id: _fora, ...semCategoria } = base;
    // @ts-expect-error — chave ausente é erro de compilação, não `null` silencioso (M3).
    const linha: LinhaTx = semCategoria;
    expect(linha).toBeDefined();
  });
  it.each([
    ["tipo", { type: "desconhecido" }],
    ["status", { status: "desconhecido" }],
    ["forma de pagamento", { payment_method: "desconhecida" }],
  ])("%s fora do domínio não entra na soma e é contado", (_, desvio) => {
    const linhas = [base, { ...base, ...desvio }];
    expect(montarEntradas({ transacoes: linhas }).txs).toHaveLength(1);
    expect(lancamentosForaDoDominio(linhas)).toBe(1);
  });
  it("payment_method nulo continua válido", () => {
    expect(lancamentosForaDoDominio([base])).toBe(0);
  });
  it("embed em lista é normalizado para o primeiro elemento", () => {
    const r = montarEntradas({ recebiveis: [{ statement_id: null, installment_id: null, valor: 1,
      status: "pendente", statement: [{ competencia: "2026-05-01" }], transaction: null }] });
    expect(r.recs[0].ref_month).toBe("2026-05");
  });
});
```
Mais a varredura (M4), junto da fronteira da 03-B:

```ts
it("nenhum `as Linha…` nem `<Linha…>` fora de teste (M4)", () => {
  const CAST = /\bas\s+(?:readonly\s+)?Linha[A-Z]\w*|<Linha[A-Z]\w*(?:\[\])?>/;
  expect(varridos.filter((f) => CAST.test(semComentarios(fs.readFileSync(f, "utf8"))))
    .map((f) => path.relative(SRC, f).split(path.sep).join("/"))).toEqual([]);
});
```
- [ ] **Step 2:** rodar → FALHA (tipos tolerantes; `lancamentosForaDoDominio` não existe; `as LinhaTx[]` no Cron).
- [ ] **Step 3: Implementar.** Em `pipeline.ts`: importar `PAYMENT_METHODS`, `TRANSACTION_STATUSES`, `TRANSACTION_TYPES` de `@/lib/finance/constants` (módulo sem imports). Todos os `?:` das linhas viram `: T | null`; `Embutido<T>` nos quatro embeds; `primeiro()`:

```ts
function primeiro<T>(v: Embutido<T>): T | null {
  if (v == null) return null;
  return isReadonlyArray(v) ? (v[0] ?? null) : v;
}
function isReadonlyArray<T>(v: T | readonly T[]): v is readonly T[] { return Array.isArray(v); }

function doConjunto<T extends string>(conjunto: readonly T[], v: string): v is T {
  return (conjunto as readonly string[]).includes(v);
}
/** O ÚNICO predicado de domínio. `montarEntradas` e `lancamentosForaDoDominio` usam este. */
function dominioDoLancamento(t: LinhaTx): Pick<DashTx, "type" | "status" | "payment_method"> | null {
  const { type, status, payment_method } = t;
  if (!doConjunto(TRANSACTION_TYPES, type) || !doConjunto(TRANSACTION_STATUSES, status)) return null;
  if (payment_method !== null && !doConjunto(PAYMENT_METHODS, payment_method)) return null;
  return { type, status, payment_method };
}
export function lancamentosForaDoDominio(transacoes: readonly LinhaTx[]): number {
  return transacoes.filter((t) => dominioDoLancamento(t) === null).length;
}
```
`txs` passa a ser `flatMap` que descarta `null`. No Cron: `select` de transações ganha `category_id, category:categories(id,name,color)`; o de recebíveis passa a `statement:card_statements(data_vencimento, competencia), transaction:transactions!receivables_transaction_id_fkey(purchase_date)`; `montarEntradas({ transacoes: txRes.data ?? [], faturas: statements, recebiveis: receivablesRes.data ?? [] })` — sem cast. Comentário no Cron declarando a exclusão fora do domínio e o cast local das faturas (view). Se a inferência do client não fechar com as linhas: **parar e reportar**.
- [ ] **Step 4: Ajustar os testes da 03-B que mudam por objetivo**: fixtures do Cron ganham `category_id`/`category`/embeds; caso D deixa de ter "diferença declarada" (os campos que o motor soma iguais à referência; `category_id` e `ref_month` do dado); o teste "dinheiro em texto…" ganha os campos obrigatórios. Rodar finance + notifications + tsc.
- [ ] **Step 5: Commit** `refactor(redesign): 03-B2 A2 — linhas estritas, estreitamento declarado, zero cast de linha no Cron`.

---

### Task 3: A1 — o tipo depende do que foi lido

**Files:**
- Modify: `src/lib/finance/pipeline.ts`, `src/lib/finance/queries.ts` (`lerFinanceiro`), `src/lib/dashboard/queries.ts` (`getInvoicesCardData` sem janela)
- Test: `src/lib/finance/pipeline.test.ts`, `src/lib/finance/ler-financeiro.test.ts`

**Interfaces:**
- Produces: `EntradasDasLinhas<L>`, `EntradasDoEscopo<E>`, `LeituraFinanceira<E>`, `ParametrosDaLeitura<E>` (tipos do §5.1 do spec); `montarEntradas<L extends LinhasFinanceiras>(linhas: L): EntradasDasLinhas<L>`; `lerFinanceiro<E extends EscopoFinanceiro>(p: ParametrosDaLeitura<E>): Promise<LeituraFinanceira<E>>`.

- [ ] **Step 1: Testes de tipo** (ler-financeiro.test.ts), rodando sob `tsc --noEmit`:

```ts
describe("03-B2 A1 — o escopo decide o tipo (conferido pelo tsc --noEmit)", () => {
  it("o que o escopo não lê não existe — nem no tipo, nem em runtime", async () => {
    const card = await lerFinanceiro({ janela: JANELA, escopo: ESCOPO_CARD_FINANCEIRO });
    // @ts-expect-error — o card não lê parcelas: `inst` não existe (M1a).
    gastosPorCategoria({ mes: "2026-05", transactions: card.entradas.txs, statements: card.entradas.sts, installmentItems: card.entradas.inst, receivables: card.entradas.recs });
    expect(Object.keys(card.entradas).sort()).toEqual(["bills", "recs", "sts", "txs"]);
    const faturas = await lerFinanceiro({ escopo: ESCOPO_FATURAS });
    // @ts-expect-error — faturas não lê contas: não há saldo a somar.
    saldoDasContas(faturas.contas);
    expect(Object.keys(faturas).sort()).toEqual(["entradas"]);
    expect(Object.keys(faturas.entradas).sort()).toEqual(["cards", "recs", "sts"]);
  });
  it("a janela é exigida só quando o escopo lê transações", () => {
    const naoRoda = () => {
      // @ts-expect-error — o card lê transações: sem janela não compila.
      void lerFinanceiro({ escopo: ESCOPO_CARD_FINANCEIRO });
      // @ts-expect-error — faturas não lê transações: a janela não se passa.
      void lerFinanceiro({ escopo: ESCOPO_FATURAS, janela: JANELA });
    };
    expect(naoRoda).toBeTypeOf("function");
  });
  it("escopo como união erra para MENOS campos", () => {
    type DaUniao = EntradasDoEscopo<EscopoFinanceiro>;
    // @ts-expect-error — com um escopo solto, `inst` não aparece: o tipo nunca promete o que talvez não tenha sido lido.
    const inst: DaUniao["inst"] = [];
    expect(inst).toEqual([]);
  });
});
```
E em `pipeline.test.ts`: `montarEntradas({})` → `toEqual({})`; Cron → só `txs/sts/recs`; `// @ts-expect-error` em `montarEntradas({ transacoes: [] }).inst` (M1b); a varredura M2:

```ts
it("nenhum `installmentItems: []` nem `parcelas: []` literal fora de teste (M2)", () => {
  const VAZIO = /\b(?:installmentItems|parcelas)\s*:\s*\[\s*\]/;
  expect(varridos.filter((f) => VAZIO.test(semComentarios(fs.readFileSync(f, "utf8"))))
    .map(rel)).toEqual([]);
});
```
- [ ] **Step 2:** rodar → FALHA.
- [ ] **Step 3: Implementar** os tipos do §5.1. `montarEntradas` só escreve a chave cuja lista é `!== undefined` (uma função auxiliar por chave; o retorno é montado num `Partial<EntradasDoMotor>` e devolvido `as EntradasDasLinhas<L>` — ⚠️ **este** `as` fica dentro do pipeline, documentado, com o teste de chaves como gêmeo de runtime). `lerFinanceiro`: sem `nada()`; monta `linhas: LinhasFinanceiras` só com as leituras pedidas; `contas`/`recorrencias` só entram no retorno se lidas; o `as LeituraFinanceira<E>` documentado. `getInvoicesCardData` perde a janela (e o import de `janelaDoMes`/`mesDe` se ficarem órfãos).
- [ ] **Step 4:** ajustar os testes da 03-B que afirmavam `[]` (passam a afirmar ausência); rodar finance + tsc.
- [ ] **Step 5: Commit** `refactor(redesign): 03-B2 A1 — o tipo depende do que foi lido, e R1 vira erro de compilacao`.

---

### Task 4: A5 — tetos visíveis por `count: "exact"`, completude na IA e nos insights

**Files:**
- Modify: `src/lib/finance/pipeline.ts` (`CompletudeFinanceira`, `completudeDe`), `src/lib/finance/queries.ts` (`getTransactionsRange`, `lerRecebiveis`, `getReceivables`, `lerFinanceiro`), `src/lib/dashboard/types.ts`, `src/lib/dashboard/queries.ts`, `src/lib/reports/queries.ts`, `src/lib/ai/tools/adapters/finance.ts`, `src/lib/ai/insights/collectors/finance.ts`
- Test: `src/lib/finance/ler-financeiro.test.ts`, `src/lib/ai/tools/adapters/finance.test.ts`

**Interfaces:**
- Produces:
```ts
export type CompletudeFinanceira =
  | { readonly estado: "exato" }
  | { readonly estado: "parcial"; readonly motivos: readonly [string, ...string[]] };
export function completudeDe(motivos: readonly string[]): CompletudeFinanceira;
export const TETO_DE_LANCAMENTOS = 2000;   // queries.ts
export const TETO_DE_RECEBIVEIS = 1000;    // queries.ts
type LeituraComTeto<T> = { linhas: T[]; saturou: boolean };
```
`FinanceCardData.completude`, `InvoicesCardData.completude`, `FinanceReport.completude`, `CardReport.completude`: `CompletudeFinanceira`.

- [ ] **Step 1: Testes.** O client falso passa a aceitar `select(cols, opts)` e a resolver com `count: estado.contagens[tabela] ?? dados.length`, e a aplicar `limit(n)`. Casos: transações saturadas (contagem 2001, 2000 linhas) → parcial citando lançamentos (M8a); recebíveis saturados → parcial; contagem `null` → parcial; contagem igual → exato; equivalência (M8b): com 2001 linhas sintéticas o `limit` corta em 2000 e `entradas.txs` tem as 2000 primeiras. Na IA: `getSpending`/`getInvoice` repassam `completude: "parcial"` + `motivo_incompleto`; fixtures ganham `completude: { estado: "exato" }`.
- [ ] **Step 2:** rodar → FALHA.
- [ ] **Step 3: Implementar**: `.select(TX_SELECT, { count: "exact" })`; `saturou = count === null || count > linhas.length`; `getReceivables = async (owner?) => (await lerRecebiveis(owner)).linhas`; `lerFinanceiro` junta motivos (lançamentos saturados, recebíveis saturados, `lancamentosForaDoDominio(transacoes) > 0`) e devolve `completude`. Os três leitores copiam `completude` para o retorno. IA: `completude: d.completude.estado` e, se parcial, `motivo_incompleto: d.completude.motivos.join(" ")`. Coletor: `emReais` e os pontos das séries recebem a qualidade/motivo do card do mês. Comentário no Cron: sem `.limit`, e o `max_rows` da plataforma (RR2).
- [ ] **Step 4:** finance + ai + tsc verdes.
- [ ] **Step 5: Commit** `refactor(redesign): 03-B2 A5 — tetos visiveis por contagem exata, e a completude chega a IA`.

---

### Task 5: A6 — `saldoDasContas` num módulo sem import, nas telas de conta

**Files:**
- Create: `src/lib/finance/saldo-das-contas.ts`, `src/lib/finance/saldo-das-contas.test.ts`
- Modify: `src/lib/finance/pipeline.ts` (reexporta), `src/app/(app)/financeiro/page.tsx:74-77`, `src/app/(app)/financeiro/contas/accounts-client.tsx:22`

- [ ] **Step 1: Teste**:

```ts
it("o módulo não importa nada — ele entra no bundle do cliente", () => {
  expect(semComentarios(fs.readFileSync(MODULO, "utf8"))).not.toMatch(/\bimport\b|\brequire\(/);
});
it("ninguém mais faz `reduce` sobre `current_balance` (M9)", () => {
  const REDUCE = /\.reduce\([\s\S]{0,200}?current_balance/;
  expect(achados(REDUCE)).toEqual(["lib/ai/tools/adapters/finance.ts"]); // exceção declarada até a B3
});
```
- [ ] **Step 2:** FALHA (as duas telas ainda somam).
- [ ] **Step 3:** mover a função (texto idêntico), `export { saldoDasContas } from "@/lib/finance/saldo-das-contas";` no pipeline; as duas telas chamam.
- [ ] **Step 4:** testes verdes; `npm run build` + medidor das rotas `/(app)/financeiro` e `/(app)/financeiro/contas`.
- [ ] **Step 5: Commit** `refactor(redesign): 03-B2 A6 — saldoDasContas nas telas de conta, num modulo sem import`.

---

### Task 6: A7 + A8 — limiares num lugar só; o fim do mês da IA

**Files:**
- Create: `src/lib/finance/limiares-de-alerta.ts`, `src/lib/finance/limiares-de-alerta.test.ts`
- Modify: `src/lib/finance/dashboard.ts:733-735`, `src/lib/notifications/generate.ts:204-212`, `src/lib/ai/tools/adapters/finance.ts:111`
- Test: `src/lib/ai/tools/adapters/finance.test.ts`

- [ ] **Step 1: Testes.** Borda: saídas 1,22× a média → `gerarAlertas` tem `gasto_alto` **e** `generateNotifications` tem `high_spending`; uso 0,81 → os dois avisam limite; vencimento em 5 dias → os dois avisam; em 6 → nenhum (M10). IA: `getSpending({ mes: "2026-09" })` → `periodo.ate === "2026-09-30"`; `"2026-02"` → `"2026-02-28"` (M11).
- [ ] **Step 2:** o de borda já passa (valores iguais) — **confirmar por mutação** (1,25 no sino derruba); o da IA falha.
- [ ] **Step 3:** constante sem import; `gerarAlertas` defaults = `LIMIARES_DE_ALERTA.*`; `DEFAULTS` do sino idem (comentário: vale para conta fixa também); IA com `ultimoDiaDoMes(mes)`. Comentário registrando `usadoPorCartao` centavos × float.
- [ ] **Step 4:** finance + notifications + ai verdes.
- [ ] **Step 5: Commit** `refactor(redesign): 03-B2 A7 e A8 — limiares do alerta num lugar so, e o fim do mes da IA`.

---

### Task 7: A3 — a fronteira que pega qualquer forma

**Files:**
- Create: `src/lib/finance/fronteira-do-motor.test.ts`

- [ ] **Step 1: Escrever o teste** com as três regras do §5.3 do spec (literal com tipo contextual `Dash*`; chamada com tipo contextual `Dash*[]` cujo callback devolve literal; asserção de tipo que nomeia `Dash*`), os controles (conjunto varrido contém os cinco arquivos; `pipeline.ts` daria ≥ 7 achados) e a saída `arquivo:linha`. `ts.createProgram` com as opções do `tsconfig.json` e `skipLibCheck`; timeout do teste 60 s.
- [ ] **Step 2:** rodar → verde no estado atual; **ver vermelho** com M5a/b/c e M6 num arquivo de runtime (mutação temporária).
- [ ] **Step 3:** medir `npm run test:run` (parede) antes × depois; se crescer > 5 s, parar e mostrar alternativas.
- [ ] **Step 4: Commit** `test(redesign): 03-B2 A3 — a fronteira do motor com checker, ao lado da regex da 03-B`.

---

### Task 8: B1 — fatura vazia fora do sino e da busca (2 commits)

**Files:**
- Create: `src/lib/notifications/cron.test.ts` (harness), `src/lib/finance/leituras-da-view-de-faturas.test.ts`
- Modify (commit 2): `src/lib/notifications/cron.ts:79`, `src/lib/search/queries.ts:249`

- [ ] **Step 1 (commit 1 — caracteriza):** harness do §6.0 do spec; fixture com uma fatura real vencida e uma vazia vencida → hoje nascem **dois** `invoice_overdue`. Varredura da view (compiler API sem checker): leituras de lista sem `.gt("itens", 0)` = `["lib/notifications/cron.ts", "lib/search/queries.ts"]`; por id = `["lib/actions/statements.ts"]`. Verde. Commit `test(redesign): 03-B2 B1 (1/2) — caracteriza a fatura vazia no sino e na busca`.
- [ ] **Step 2 (commit 2 — conserta):** `.gt("itens", 0)` nas duas; harness: **um** `invoice_overdue`; varredura: lista sem filtro `[]`. Commit `fix(redesign): 03-B2 B1 (2/2) — fatura vazia sai do sino e da busca, por decisao do dono`.

---

### Task 9: B2 — uma régua só para o gasto alto (2 commits)

**Files:**
- Modify: `src/lib/finance/dashboard.ts` (`reguaDoGastoAlto`, `mediaDeSaidas`), `src/lib/finance/pipeline.ts` (`janelaDoGastoAlto` no lugar de `janelaDoCron`), `src/lib/notifications/cron.ts`, `src/app/(app)/dashboard/financeiro/page.tsx`
- Test: `src/lib/notifications/cron.test.ts`, `src/lib/finance/media-saidas.test.ts`, `src/lib/finance/pipeline.test.ts`

**Interfaces:**
- Produces: `reguaDoGastoAlto(p: { mes; transactions; statements; receivables }): { saidas: number; mediaSaidas: number }`; `mediaDeSaidas(pontos)`; `janelaDoGastoAlto(mes: string): JanelaFinanceira`.

- [ ] **Step 1 (commit 1 — caracteriza):** harness com 5 meses anteriores (um zerado) e mês corrente com um pago antes de hoje e um pendente depois; congela se `high_spending` nasce e o % da descrição. Commit `test(redesign): 03-B2 B2 (1/2) — caracteriza a regua do gasto alto no sino`.
- [ ] **Step 2 (commit 2 — conserta):** `reguaDoGastoAlto` + teste de equivalência com a fórmula antiga da tela (número da tela não muda) + "sem mês anterior com saída → média 0, sem alerta"; `janelaDoGastoAlto` + teste de contenção em `janelaDoRelatorio`; `mediaDeSaidas` sem parâmetro (bloco do sino sai de `media-saidas.test.ts`, entra "a régua única ignora o mês zerado"); página e Cron chamam a régua; harness atualizado. Commit `fix(redesign): 03-B2 B2 (2/2) — uma regua so para o gasto alto, por decisao do dono`.

---

### Task 10: B3 — saldo de todas as contas na IA (2 commits)

**Files:**
- Modify: `src/lib/ai/tools/adapters/finance.ts` (`getBalances`), `src/lib/finance/saldo-das-contas.test.ts` (exceção sai)
- Test: `src/lib/ai/tools/adapters/finance.test.ts`

- [ ] **Step 1 (commit 1 — caracteriza):** acrescentar ao teste de hoje a lista de itens (a inativa com saldo não aparece) e que a soma dos itens = total. Commit `test(redesign): 03-B2 B3 (1/2) — caracteriza o saldo da IA`.
- [ ] **Step 2 (commit 2 — conserta):** `saldo_total: saldoDasContas(contas)`; itens = ativas + inativas com saldo ≠ 0, com `inativa`; `contas_inativas_com_saldo`; vazio só sem conta ou com todas inativas **e** sem saldo; exceção da varredura A6 sai. Commit `fix(redesign): 03-B2 B3 (2/2) — saldo das contas e todas as contas tambem na IA, por decisao do dono`.

---

### Task 11: Mutações e os cinco comandos

- [ ] M1–M14 do §7 do spec, uma a uma: mutar → `npx tsc --noEmit` → `npx vitest run --reporter=json` → nomes dos testes que caem → `git checkout -- <arquivo>` → `git diff --quiet`.
- [ ] `npm run test:run` · `npm run lint` · `npx tsc --noEmit` · `npm run build` · `npm run perf:bundle` + medidor das quatro rotas; `TZ=UTC npx vitest run src/lib/finance/ src/lib/notifications/`; `git diff --quiet 704dc66 -- src/lib/finance/dashboard-caracterizacao.test.ts src/lib/finance/dashboard.test.ts`.
- [ ] Commit final de registro (se houver algo a registrar nos docs do projeto) — sem tocar `STATUS.md`.
