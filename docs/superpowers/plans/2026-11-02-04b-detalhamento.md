# REDESIGN-04-B — Detalhamento — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Neste projeto cada tarefa passa antes por `ai-router-br:route` (CLAUDE.md global, item 3).

**Goal:** Cada número do Painel financeiro e da aba Financeiro do Relatório abre, numa gaveta aberta pela URL, os registros que o compõem, e a soma deles concilia com o número.

**Architecture:** Um modelo PURO (`src/lib/finance/detalhe.ts`) recebe as MESMAS entradas do motor que montaram o número (já recortadas) e devolve `Detalhe` (total do motor, grupos de registros, conciliação, estado). Os registros saem dos classificadores que o motor já usa, exportados (sem regra nova). As páginas (Server Components) montam o detalhe só quando `?detalhe=` existe. Uma gaveta (`Sheet`) carregada por `next/dynamic` + `useLazyDialog` o desenha.

**Tech Stack:** Next.js 16 (App Router, RSC), TypeScript, Vitest (`environment: node`), Tailwind v4, Radix `Sheet` (shadcn).

**Spec:** `docs/superpowers/specs/2026-11-02-04b-detalhamento-design.md` (D-B-1…D-B-17, §4 inventário, §6 testes). Prévia aprovada em 2026-11-02: `https://claude.ai/artifact/7M32NegMSqV64CwshzWDnp`.

## Global Constraints

- Worktree `C:/tmp/04b-detalhamento`, só ela. Diretório principal e outras worktrees: não tocar.
- Banco só leitura; **nenhuma migration**; md5 dos saldos `15d93bd1c1d3e55a40db6210dff0eb3b` no início e no fim.
- Nenhum número do painel ou do relatório muda: `dashboard.test.ts`, `dashboard-caracterizacao.test.ts`, `painel-conciliacao.test.ts`, `conciliacao-relatorio-painel.test.ts`, `caixa*.test.ts` passam **sem edição de valor**.
- Nenhum `Date.now()` / `new Date()` sem argumento em código novo; `hoje` injetado.
- Dinheiro em **centavos** dentro de `detalhe.ts` (`reaisParaCentavos`/`centavosParaReais`); `formatCurrency` recebe reais.
- Fixture sintética: "Conta A/B", "Cartão A/B", "Pessoa A/B", "Categoria A–E", valores inventados; nenhum valor do print.
- Peças comuns: **nenhuma assinatura muda** em `indicador.tsx`/`bloco.tsx`; `olho-dos-valores.tsx` só ganha export.
- Gaveta só por `next/dynamic` com **objeto literal** como segundo argumento.
- Textos em pt-BR; vazio nunca mostra "R$"; falha nunca vira lista vazia.
- Commits: título pt-BR sem acento, `git commit -F`, `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; CRLF normalizado com `sed -i 's/\r$//'`; `git checkout -- AGENTS.md` depois de `next dev`. Sem prettier.
- Suíte: `npx vitest run --testTimeout=30000`.
- Mutação: toda regra nova tem o teste derrubado por uma mutação e restaurado; a restauração conferida por `git diff` (registrar no §13).

## Review Focus

1. **Mês sem nenhum lançamento, mas com fatura de outro mês vencendo nele** — `saidas` deve listar só o que o motor somou no mês (fatura pela competência), e o vazio só quando não há registro nenhum. Teste em T2: "fatura de dezembro não entra em saidas de novembro".
2. **Alvo inexistente ou de outro tipo na URL** (`?detalhe=fatura&alvo=<id de categoria>`) — estado `vazio` com a frase "registro não encontrado", nunca outro alvo nem a lista inteira. Teste em T2.
3. **Olho fechado com a gaveta aberta, e o olho alternado com ela aberta** — nenhum valor visível; a gaveta segue o estado vivo do contexto. Teste de fonte em T4 + conferência visual em T8.
4. **Fechar a gaveta** — a URL perde só `detalhe`/`parte`/`alvo` (mantém `mes`, `base`, `resp`, recortes) e a animação de saída mostra o conteúdo anterior (não pisca vazio). Teste puro de URL em T3; o último detalhe é guardado FORA do `Sheet` (T4).
5. **Base caixa com recorte, ou bloco ✗** — nenhum link para a gaveta e `?detalhe=` digitado devolve `nao-segue` sem registros. Teste em T6.

---

## Estrutura de arquivos

| Arquivo | Papel |
| --- | --- |
| `src/lib/finance/dashboard.ts` (mod.) | exporta `ehEntradaDeConta`, `itensDeGasto`, `ocorrenciasNoMes`, `vencimentosDasContas`; campos opcionais de exibição em `DashTx`/`DashInstallmentItem` |
| `src/lib/finance/pipeline.ts` (mod.) | `LinhaTx` ganha `description`, `purchase_date`; `LinhaParcela` ganha `numero`, `total_parcelas` e `parent.description`; `montarEntradas` os copia |
| `src/lib/finance/caixa.ts` (mod.) | exporta `classeDeCaixa` (o classificador de `numerosDoCaixa`, extraído) |
| `src/lib/finance/caixa-minha-parte.ts` (mod.) | exporta `movimentos`, `meuDoPagamento`, `faturasDoMotor` |
| `src/lib/finance/caixa-leitura.ts` (mod.) | `description` em `COLUNAS`; `lerEstadoDoCaixa` devolve estado **e** leitura; `estadoDoCaixa` vira casca |
| `src/lib/finance/detalhe.ts` (novo) | modelo puro `detalheDoNumero` |
| `src/lib/finance/detalhe.test.ts` (novo) | conciliação em três lados, estados, marcas |
| `src/lib/painel/detalhe-url.ts` (novo) | `pedidoDaUrl`, `urlComDetalhe`, `urlSemDetalhe`, `mesDaUrl` (puro) |
| `src/components/shared/painel/gaveta-de-registros.tsx` (novo) | fachada cliente com `next/dynamic` |
| `src/components/shared/painel/gaveta-de-registros-impl.tsx` (novo) | o `Sheet` com o `Detalhe` |
| `src/components/shared/painel/olho-dos-valores.tsx` (mod.) | `useOlhoDosValores()` |
| `src/app/(app)/dashboard/financeiro/page.tsx` + `financial-dashboard-client.tsx` (mod.) | monta o detalhe, links |
| `src/lib/reports/financeiro.ts`, `reports/queries.ts`, `relatorios/page.tsx`, `relatorios-client.tsx` (mod.) | o mesmo no relatório |

---

### Task 1: O motor expõe os classificadores e carrega os campos de exibição

**Files:**
- Modify: `src/lib/finance/dashboard.ts`, `src/lib/finance/pipeline.ts`, `src/lib/finance/caixa.ts`, `src/lib/finance/caixa-minha-parte.ts`, `src/lib/finance/caixa-leitura.ts`
- Modify (fixtures que montam `LinhaTx`/`LinhaParcela`, apontados pelo `tsc`): ex. `pipeline.test.ts`, `ler-financeiro.test.ts`, a leitura do Cron
- Test: `src/lib/finance/motor-exposto.test.ts` (novo)

**Interfaces:**
- Produces:
  - `DashTx` ganha `descricao?: string | null` e `data_compra?: string | null`; `DashInstallmentItem` ganha `numero?: number`, `total_parcelas?: number`, `descricao?: string | null` (opcionais, como `account_id` da D-A2-13: `dashboard.test.ts` não muda).
  - `LinhaTx` ganha `description: string | null` e `purchase_date: string | null` (**obrigatórios**, regra estrita da 03-B2); `LinhaParcela` ganha `numero: number`, `total_parcelas: number` e `parent: Embutido<{ description: string | null; category: … }>`.
  - `export function ehEntradaDeConta(t: DashTx, mes: string): boolean` — `ativo(t) && mesDe(t.competence_date) === mes && t.type === "receita" && t.card_id === null`; `resumoMes` passa a usá-la.
  - `export type ItemDeGasto = SpendItem & { origem: "avista" | "cartao" | "parcela"; txId: string | null; installmentId: string | null; descricao: string | null; data: string | null; status: string; numero: number | null; totalParcelas: number | null }` e `export function itensDeGasto(params: { transactions; statements; installmentItems; receivables }): ItemDeGasto[]` — é `buildSpendItems` com os campos a mais; `buildSpendItems` passa a ser `itensDeGasto` (as funções internas continuam iguais).
  - `export function ocorrenciasNoMes(rec: DashRecurrence, mes: string): number` (só o `export`).
  - `export type VencimentoDeConta = { nome: string; data: string; valor: number }` e `export function vencimentosDasContas(p: { hoje: string; bills: DashBill[]; dias?: number }): VencimentoDeConta[]`; `proximasContasPagar` passa a chamá-la.
  - `caixa.ts`: `export type ClasseDeCaixa = "renda" | "despesa" | "fatura" | "sem-vinculo" | "entre-contas" | "sem-conta" | "fora"` e `export function classeDeCaixa(t: TxDeCaixa, pagamentosDeFatura: ReadonlySet<string>): ClasseDeCaixa`; `numerosDoCaixa` passa a usá-la (status/janela continuam fora dela). `TxDeCaixa` ganha `description?: string | null`.
  - `caixa-minha-parte.ts`: `export` em `movimentos`, `meuDoPagamento`, `faturasDoMotor` e no tipo `Movimento`; o ramo `renda` passa a carregar `t`.
  - `caixa-leitura.ts`: `COLUNAS` ganha `description`; `export async function lerEstadoDoCaixa(mesSel, hoje, motor, evoMeses): Promise<{ estado: EstadoDoCaixa; leitura: LeituraDoCaixa & { ok: true } | null; motorDoCaixa: MotorDoCaixa | null }>`; `estadoDoCaixa(...)` = `(await lerEstadoDoCaixa(...)).estado` (assinatura igual).

- [ ] **Step 1: Teste que falha** — `motor-exposto.test.ts`:
  - `ehEntradaDeConta`: receita de conta do mês → `true`; receita com `card_id` (estorno) → `false`; `cancelado` → `false`; outro mês → `false`; despesa → `false`.
  - `itensDeGasto` sobre uma fixture com uma compra à vista, uma do cartão e uma parcela `3/10`: três itens, com `origem` `"avista"|"cartao"|"parcela"`, `numero: 3`, `totalParcelas: 10`, `descricao` vinda de `DashInstallmentItem.descricao`; a compra-pai (`parcelado: true`) **não** aparece.
  - `vencimentosDasContas` + `proximasContasPagar` com a mesma entrada: `total` = Σ `valor` dos vencimentos (em centavos).
  - `classeDeCaixa`: uma linha por classe (renda, despesa, fatura, sem-vinculo, entre-contas, sem-conta, fora para `ajuste` e compra de cartão).
  - `montarEntradas` copia `description`→`descricao`, `purchase_date`→`data_compra`, `numero`, `total_parcelas`, `parent.description`→`descricao`.
- [ ] **Step 2:** `npx vitest run src/lib/finance/motor-exposto.test.ts` → FAIL (exports inexistentes).
- [ ] **Step 3:** Implementar as mudanças da seção Interfaces. Os selects que alimentam `LinhaParcela` ganham `parent(…description…)` e `numero,total_parcelas` se ainda não vierem (a leitura de parcelas já é `*` + `parent:…(id,description,…)` — conferir). Corrigir as fixtures que o `tsc` apontar escrevendo `null`/números sintéticos.
- [ ] **Step 4:** `npx vitest run --testTimeout=30000 src/lib/finance src/lib/reports src/lib/notifications` + `npx tsc --noEmit` → verdes; **nenhum** dos testes de conciliação da 04-A/04-A2 nem `dashboard*.test.ts` editado em valor.
- [ ] **Step 5:** Mutação: em `ehEntradaDeConta` remover `t.card_id === null` → `motor-exposto` **e** `dashboard.test.ts` vermelhos; restaurar, conferir `git diff` vazio na linha. Registrar.
- [ ] **Step 6:** Atualizar a lista declarada de `fronteira-do-motor.test.ts`, se ela listar exports. Commit `feat(financas): motor expoe os classificadores para o detalhamento`.

---

### Task 2: O modelo puro `detalheDoNumero` e a conciliação em três lados

**Files:**
- Create: `src/lib/finance/detalhe.ts`, `src/lib/finance/detalhe.test.ts`

**Interfaces:**
- Consumes: Task 1 (todos os exports).
- Produces (`detalhe.ts`, sem `server-only`, sem relógio):

```ts
export type ChaveDoDetalhe =
  | "saldo" | "entradas" | "saidas" | "cartao" | "pendente" | "pendente-do-mes"
  | "categoria" | "forma" | "fatura" | "projecao" | "contas" | "caixa";
export type ParteDoDetalhe = "meu" | "terceiros" | "bruto";
export type PedidoDeDetalhe = { chave: ChaveDoDetalhe; parte: ParteDoDetalhe; alvo: string | null };
export type LinhaDoCaixa = "renda" | "reembolsos" | "outras" | "saidas" | "pagamentos" | "sem-destino" | "entre-contas";
export type MarcaDoRegistro =
  | "previsto" | "projetado" | "estorno" | "data-aproximada" | "contado-cheio"
  | { parcela: { numero: number; total: number } };
export type RegistroDoDetalhe = {
  id: string; data: string | null; descricao: string; origem: string | null; categoria: string | null;
  brutoCent: number; meuCent: number; terceirosCent: number; marcas: MarcaDoRegistro[];
};
export type GrupoDoDetalhe = {
  rotulo: string;
  /** Só na fatura: o total da view e a minha parte pela regra do motor; `diferencaCent` ≠ 0 é declarada. */
  fatura: { totalCent: number; meuCent: number; diferencaCent: number } | null;
  registros: RegistroDoDetalhe[];
};
export const TETO_DA_GAVETA = 300;
export type Detalhe =
  | { estado: "ok"; titulo: string; linhaDeBase: string; parte: ParteDoDetalhe | "pendente" | "saldo" | "projetado";
      totalCent: number; somaCent: number; diferencaCent: number; grupos: GrupoDoDetalhe[];
      aproximados: number; existentes: number; exibidos: number; avisos: string[] }
  | { estado: "vazio"; titulo: string; linhaDeBase: string; frase: string; avisos: string[] }
  | { estado: "falha"; titulo: string; frase: string }
  | { estado: "nao-segue"; titulo: string; frase: string; hrefSemFiltro: string | null };
export function detalheDoNumero(p: {
  pedido: PedidoDeDetalhe;
  mes: string; hoje: string; base: BaseFinanceira;
  /** As entradas do motor JÁ RECORTADAS (as mesmas que montaram o número). */
  entradas: Pick<EntradasDoMotor, "txs" | "sts" | "recs" | "inst" | "cards" | "recorrencias" | "bills">;
  /** Recebíveis crus, já recortados por pessoa/cartão (pendente). */
  recebiveisCrus: readonly (RecebivelComRecebimentos & { id: string; person: { nome: string } | null; ref_month?: string | null })[];
  /** Base caixa: a leitura e o motor do caixa; `null` na competência; `"erro"` = não leu. */
  caixa: { leitura: LeituraDoCaixa & { ok: true }; motor: MotorDoCaixa } | "erro" | null;
  /** D-B-12: só para `saldo`. `saldoCent: null` = aquela conta não leu. */
  saldos: { totalCent: number | null; porConta: { id: string; nome: string; saldoCent: number | null }[] } | null;
  completude: CompletudeFinanceira;
  /** Do relatório: o bloco não segue o recorte (`naoSegue` da 04-A2) → estado `nao-segue`. */
  naoSegue: { frase: string; hrefSemFiltro: string | null } | null;
  /** Só com recorte de categoria (D-B-11): filtra os itens e acrescenta o aviso "antes dos estornos do cartão". */
  categoriaDoRecorte: string | null;
  nomes: { contas: ReadonlyMap<string, string>; cartoes: ReadonlyMap<string, string> };
}): Detalhe;
```

Regras por chave (o **total** sai SEMPRE do agregador existente; os **registros**, do classificador):

| chave | registros | total (agregador) |
| --- | --- | --- |
| `entradas` (competência) | `txs.filter(t => ehEntradaDeConta(t, mes))` | `resumoMes` → `entradasMeu`/`entradasTerceiros`/`entradas` pela parte |
| `saidas` (competência) | à vista: `itensDeGasto` `origem:"avista"` do mês; cartão: `itensDeGasto` com `statementId` de fatura do mês **+** estornos (receita com `statement_id` daquela fatura, valor negativo, marca `estorno`) — agrupados por fatura | `resumoMes` → `meu`/`terceiros`/`saidas` |
| `cartao` | só os grupos de fatura de `saidas` | `resumoMes` → `cartaoMeu`/`cartao` (`terceiros` = `cartao − cartaoMeu` em centavos) |
| `categoria` (alvo = id ou `"sem-categoria"`) | `itensDeGasto` do mês com aquele `categoryId` (sem estornos, como a fatia) | a fatia de `gastosPorCategoria` pela parte (`terceiros` = `mov − meu`) |
| `forma` (alvo = `paymentMethod`) | idem por `paymentMethod ?? "outro"` | a fatia de `gastosPorForma` |
| `fatura` (alvo = `statement.id`) | itens da fatura (`itensDeGasto` + estornos dela) | `total_atual` (bruto) / `total − parteDosTerceirosPorFatura` (meu) |
| `pendente` (alvo = `person_id` opcional) | um registro por recebível com `totalPendenteAte([r], hoje) > 0` | `totalPendenteAte(crus, hoje)` |
| `pendente-do-mes` | um por recebível com `pendenteDoPeriodo([r], mes) > 0` | `totalAReceber(recs, mes)` |
| `projecao` (alvo = mês `yyyy-MM`) | faturas pelo vencimento no mês (minha parte de cada statement, `parteDosTerceirosPorFatura`), recorrências de despesa ativas (`ocorrenciasNoMes × amount`, uma linha por recorrência com ocorrência), contas fixas ativas; **todas** com `projetado` | `projecaoProximosMeses(...).find(mes).total` |
| `contas` | `vencimentosDasContas` (marca `projetado`) | `proximasContasPagar().total` |
| `saldo` | `saldos.porConta` | `saldos.totalCent` |
| `entradas`/`saidas` (caixa) | `movimentos(periodo do mês)`: renda (meu) / despesa, fatura (meu = `meuDoPagamento`; `null` → bruto + `contado-cheio`), sem-vinculo | `minhaParteDoCaixa` → `entradas`/`saidas`/`terceirosNasSaidas`/`saidasBrutas` |
| `caixa` (alvo = `LinhaDoCaixa`) | `classeDeCaixa` por lançamento liquidado no período (renda→`renda`/`outras` pela parte; reembolsos = `entradasDoRecebivel` com data no período, um registro por recebimento) | o campo de `numerosDoCaixa` (`rendaPessoalRecebida`, `reembolsosRecebidos`, `outrasEntradasDeTerceiros`, `saidasDeCaixa`, `pagamentosDeFatura`, `transferenciasSemVinculo.total`, `transferenciasEntreContas`) |

Marcas: `previsto` = competência com `status` fora de `SETTLED_STATUSES` **ou** item de fatura com `pago_em === null`; `data-aproximada` = caixa com `liquidado_em === null` (e `aproximados` = a contagem dessas linhas); `estorno`; `{ parcela }` quando `numero`/`totalParcelas` existem.

Estados, nesta ordem: `naoSegue` → `nao-segue`; `caixa === "erro"` com base caixa → `falha` ("Não foi possível ler o caixa agora."); `saldos.totalCent === null` → `falha` ("Não foi possível ler o saldo."); alvo pedido e inexistente → `vazio` com "Registro não encontrado."; sem registro → `vazio` com "Nenhum registro neste mês."; senão `ok`. `avisos`: completude parcial (os motivos), caixa parcial, `categoriaDoRecorte` → "antes dos estornos do cartão", `aproximados > 0` → "N registro(s) com data aproximada (competência)", teto excedido → "Mostrando 300 de N; o total continua o do motor". `somaCent` soma **todos** os registros (não só os exibidos). `diferencaCent = totalCent − somaCent`. Ordem: por grupo, depois data crescente.

- [ ] **Step 1: A fixture e os literais.** Em `detalhe.test.ts`, montar uma fixture sintética (novembro de 2026, `hoje = "2026-11-18"`) **pelo pipeline** (`montarEntradas` sobre linhas `Linha*` escritas no teste; montar `Dash*` fora do pipeline reprova `fronteira-do-motor`). Os valores são os da prévia aprovada:
  - à vista: Mercado 100,00 (meu 60,00, Pessoa A 40,00), Presente 40,00 (meu 0, Pessoa B), Farmácia 45,90, Escola 80,00 **pendente em 25/11**;
  - Cartão A, fatura de novembro aberta (`total_atual` 220,00): Loja 200,00 (meu 120,00, Pessoa B 80,00 com recebimento parcial de 30,00), parcela 3/10 Notebook 50,00 (Pessoa A 20,00), estorno −30,00;
  - Cartão B, fatura paga (70,00): Restaurante 70,00; a fatura de dezembro do Cartão A (40,00);
  - receitas: Salário 5.000,00; Pix de Pessoa A 40,00 (meu 0);
  - caixa: Farmácia com `liquidado_em` nulo; o pagamento da fatura do Cartão B; uma transferência sem destino de 150,00; uma transferência entre contas.

  Escrever no comentário as contas à mão, uma linha por chave, e declarar os literais: `saidas.meu = 37590`, `saidas.terceiros = 18000`, `saidas.bruto = 55590`, `entradas.meu = 500000`, `pendente = 13500`, `fatura A bruto = 22000`, caixa `saidas.meu = 32590`.
- [ ] **Step 2: Testes que falham** (um `it` por chave × parte relevante): Σ `registros[coluna]` **calculada no teste** (laço próprio, centavos) `=== detalhe.totalCent === agregador(...) === LITERAL`. `diferencaCent === 0` na fixture coerente.
  - Mais: "fatura de dezembro não entra em `saidas` de novembro" (Review Focus 1).
  - "alvo inexistente → `vazio` com 'Registro não encontrado.'" (Review Focus 2).
  - A fixture variante com `total_atual` 250,00 na fatura A → `grupos[i].fatura.diferencaCent === 3000` e `diferencaCent` total ≠ 0, com `totalCent` **igual ao do motor** (nunca ajustado).
  - Estados: mês sem lançamento → `vazio`, e `JSON.stringify` não contém `"R$"`; `caixa: "erro"` → `falha`; `naoSegue` → `nao-segue` com `grupos` ausente; completude parcial → aviso com o motivo.
  - Teto: 301 registros sintéticos → `exibidos === 300`, `existentes === 301`, aviso, e `somaCent` sobre os 301.
  - Marcas: Escola `previsto`; os itens da fatura A `previsto`; os da B não; Farmácia no caixa `data-aproximada` e `aproximados === numerosDoCaixa(...).aproximados`; toda linha de `projecao` com `projetado`; estorno com `estorno` e valor negativo.
- [ ] **Step 3:** `npx vitest run src/lib/finance/detalhe.test.ts` → FAIL.
- [ ] **Step 4:** Implementar `detalheDoNumero` (despacho por chave; um helper por chave; nenhuma soma de dinheiro além de `somaCent` e do `terceiros = bruto − meu` em centavos, ambos declarados no cabeçalho do arquivo).
- [ ] **Step 5:** PASS.
- [ ] **Step 6: Mutações** (registrar cada uma e conferir a restauração por `git diff`):
  1. tirar os estornos do grupo da fatura → o literal `saidas.meu` cai;
  2. incluir a compra-pai do parcelamento em `itensDeGasto` → literal e agregador;
  3. somar só os `exibidos` em `somaCent` → teste do teto;
  4. trocar `totalPendenteAte` por `totalAReceber` no `pendente` → literal.
- [ ] **Step 7:** Commit `feat(financas): modelo do detalhamento e conciliacao em tres lados`.

---

### Task 3: A URL do detalhe e o mês válido

**Files:**
- Create: `src/lib/painel/detalhe-url.ts`, `src/lib/painel/detalhe-url.test.ts`
- Modify: `src/app/(app)/dashboard/financeiro/page.tsx`, `src/app/(app)/relatorios/page.tsx` (só a troca do parse do mês)

**Interfaces:**
- Consumes: `PedidoDeDetalhe`, `ChaveDoDetalhe`, `ParteDoDetalhe` (Task 2; `import type`).
- Produces (puro, só `import type`):
  - `pedidoDaUrl(sp: Record<string, string | string[] | undefined>): PedidoDeDetalhe | null` — chave fora da união → `null`; `parte` ausente/inválida → `"meu"`; `alvo` só se for uma string não vazia de até 64 caracteres em `[A-Za-z0-9_-]`.
  - `urlComDetalhe(caminho: string, sp: URLSearchParams | Record<string, string | string[] | undefined>, pedido: PedidoDeDetalhe): string` — preserva todos os outros parâmetros na ordem em que vieram, troca/acrescenta `detalhe`, `parte` (omitido quando `"meu"`) e `alvo` (omitido quando `null`).
  - `urlSemDetalhe(caminho, sp): string` — remove só `detalhe`, `parte`, `alvo`.
  - `mesDaUrl(v: string | string[] | undefined, mesAtual: string): string` — `^\d{4}-(0[1-9]|1[0-2])$`, senão `mesAtual` (D-B-16).

- [ ] **Step 1: Testes que falham:**
  - `pedidoDaUrl({ detalhe: "saidas", parte: "terceiros" })` → `{ chave: "saidas", parte: "terceiros", alvo: null }`;
  - `{ detalhe: "xyz" }` → `null`; `{ detalhe: ["saidas", "entradas"] }` → `null`;
  - `alvo` com `"/"` ou espaço → `alvo: null`;
  - `urlComDetalhe("/relatorios", { mes: "2026-11", base: "caixa", cartao: "c1" }, …)` → `"/relatorios?mes=2026-11&base=caixa&cartao=c1&detalhe=saidas"`;
  - `urlSemDetalhe` da URL anterior volta a `"/relatorios?mes=2026-11&base=caixa&cartao=c1"` (Review Focus 4);
  - `mesDaUrl("2026-13", "2026-11") === "2026-11"`, `mesDaUrl("2026-12", …) === "2026-12"`.
- [ ] **Step 2:** FAIL → **Step 3:** implementar → **Step 4:** PASS.
- [ ] **Step 5:** As duas páginas trocam o IIFE do mês por `mesDaUrl(sp.mes, mesAtual)`.
- [ ] **Step 6:** Mutação: a regex de `mesDaUrl` volta a `\d{2}` → teste vermelho; restaurar. Commit `feat(painel): url do detalhamento e mes valido nas duas telas`.

---

### Task 4: A gaveta (peça comum) e o olho por contexto

**Files:**
- Create: `src/components/shared/painel/gaveta-de-registros.tsx`, `src/components/shared/painel/gaveta-de-registros-impl.tsx`, `src/components/shared/painel/gaveta.test.ts` (varredura de fonte)
- Modify: `src/components/shared/painel/olho-dos-valores.tsx` (só `export function useOlhoDosValores(): { oculto: boolean } | null`)

**Interfaces:**
- Consumes: `Detalhe` (Task 2), `urlSemDetalhe` (Task 3), `ValorComOlho`.
- Produces: `export function GavetaDeRegistros(p: { detalhe: Detalhe | null; urlAoFechar: string; linkLancamentos: string }): JSX.Element | null` (`"use client"`).

Comportamento:
- **Fachada:** `const Impl = dynamic(() => import("./gaveta-de-registros-impl").then((m) => m.GavetaDeRegistrosImpl), { ssr: false })`, com o objeto literal ali. `aberto` = estado local inicializado e ajustado **durante o render** a partir de `detalhe !== null` (padrão de `useLazyDialog`). O último `detalhe` não nulo é guardado num `useState` **da fachada** (fora do `Sheet`), para a animação de fechar desenhar o conteúdo anterior (Review Focus 4; invariante 95). Montar a impl só com `useLazyDialog(aberto)`.
- **Fechar:** `setAberto(false)` e depois `router.replace(urlAoFechar, { scroll: false })`.
- **Impl:**
  - `Sheet` com `side="bottom"` abaixo de 640 px e `side="right"` acima. A escolha vem de `matchMedia("(min-width: 640px)")`, lido num `useSyncExternalStore`; o servidor assume `"right"`.
  - `SheetContent` com `className="data-[side=right]:sm:max-w-xl data-[side=bottom]:max-h-[88dvh]"`, `SheetTitle` = `detalhe.titulo`, rolagem só no corpo.
  - Invólucro interno com `data-ocultar` vindo de `useOlhoDosValores()?.oculto ?? false` e `className="group/olho"`.
  - Todo dinheiro passa por `ValorComOlho`; os quatro estados seguem o §5 do desenho e a prévia.
  - Rodapé: "Soma … dos registros: R$ X = total ✓" ou "Diferença não explicada pelos registros: R$ Y".
  - Link "Abrir em Lançamentos ›" com a frase do §5.
- **Linha:**
  - grade `minmax(0,1fr) auto`, com `min-w-0` + `break-words` na descrição (regras de layout 2 e 3);
  - data escondida abaixo de `sm`;
  - marcas como `Badge` (`projetado` hachurado; `previsto`/`data aproximada` em tom de aviso);
  - valores com `tabular-nums`.

- [ ] **Step 1: Teste de fonte que falha** (`gaveta.test.ts`, varrendo os dois arquivos sem comentários):
  - a fachada contém `dynamic(` com `{ ssr: false }` literal e **não** importa `@/components/ui/sheet`;
  - a impl usa `useOlhoDosValores` e `ValorComOlho`, e não chama `formatCurrency(` fora de um `ValorComOlho texto=` (regex sobre o JSX);
  - a impl não contém `forceMount`;
  - a fachada não renderiza `<Sheet` (o estado fica fora).
- [ ] **Step 2:** FAIL → **Step 3:** implementar → **Step 4:** PASS + `npx tsc --noEmit` + `npm run lint`.
- [ ] **Step 5:** Mutação: trocar `ValorComOlho` por texto cru numa célula → teste vermelho; restaurar. Commit `feat(painel): gaveta de registros sob demanda`.

---

### Task 5: O Painel abre os registros

**Files:**
- Modify: `src/app/(app)/dashboard/financeiro/page.tsx`, `financial-dashboard-client.tsx`, `painel-links.test.ts`, `painel-inventario.test.ts`
- Create: `src/app/(app)/dashboard/financeiro/painel-detalhe.test.ts`

**Interfaces:**
- Consumes: `detalheDoNumero`, `pedidoDaUrl`, `urlComDetalhe`, `urlSemDetalhe`, `lerEstadoDoCaixa`, `GavetaDeRegistros`, `lerSaldoAte(corte, conta)`.
- Produces: `DashboardClient` ganha as props `detalhe: Detalhe | null`, `hrefs: Record<string, string>` (as URLs prontas do servidor, por chave/alvo) e `urlAoFechar: string`.

**A página:**
- Lê `pedido = pedidoDaUrl(sp)`.
- Na base caixa troca `estadoDoCaixa` por `lerEstadoDoCaixa`. O estado vai ao cliente como hoje; a `leitura` e o `motorDoCaixa` só alimentam o detalhe.
- Com `pedido.chave === "saldo"`, chama `lerSaldoAte(nextDayISO(hoje), conta.id)` para cada conta, em `Promise.all`. Rejeição de uma vira `saldoCent: null`.
- Chama `detalheDoNumero` com **as mesmas** `entradas`, `recebiveis`, `completude` e `mesSel` do resto da página.
- Monta `hrefs` com `urlComDetalhe("/dashboard/financeiro", sp, …)`. O cliente não monta URL.

**Links (§4):**
- os quatro `Indicador` passam `href={hrefs.…}` e `hrefRotulo="Ver registros"`;
- "Cartões de crédito": cada cartão com fatura real (`!virtual`) leva à `fatura` dela. O `statement.id` vem de `sts`, casado por `card_id` + `competencia`; fatura virtual não tem link;
- "Próximas faturas": idem;
- "Pendente de terceiros": no `acao` do bloco, mais uma linha por pessoa (`alvo` = `person_id`);
- legenda da rosca e Forma de pagamento: um link por fatia, pelo slot `acao` ou uma lista abaixo do gráfico, **fora do SVG**;
- card-âncora: os três números (meu, bruto, terceiros → `saidas` com a parte);
- "Gasto no cartão" / "Cartão realmente meu" → `cartao`;
- "Próximas contas a pagar" → `contas`;
- Projeção → `projecao` do primeiro mês, mais um link por mês na lista;
- `BlocoDoCaixa` → `caixa` por linha (via prop opcional nova `hrefs?: Partial<Record<LinhaDoCaixa, string>>`; o bloco é do painel, não peça comum).

Barras, mês a mês e evolução ganham a frase do D-B-17. `<GavetaDeRegistros>` fica dentro de `<OlhoDosValores>`, para herdar o contexto.

- [ ] **Step 1: Testes que falham:**
  - `painel-links.test.ts`: troca as duas afirmações de `/financeiro/lancamentos?type=…&month=` por "os indicadores recebem `hrefs.`" (declarado no §7 do desenho);
  - `painel-detalhe.test.ts` (varredura de fonte): cada chave do §4 que o painel tem aparece em `hrefs`; nenhum link em barras/mês a mês; `GavetaDeRegistros` dentro de `OlhoDosValores`; a página passa a `detalheDoNumero` as **mesmas variáveis** `txs`/`sts`/`recs`/`inst` do `resumoMes` (regex sobre `entradas` desestruturado; o achado do §13.5 da 04-A2).
- [ ] **Step 2:** FAIL → **Step 3:** implementar → **Step 4:** suíte inteira + `tsc` + `lint` verdes; `painel-inventario.test.ts` sem perda de bloco.
- [ ] **Step 5:** Commit `feat(painel): cada numero do painel abre os registros`.

---

### Task 6: O Relatório abre os registros, com os recortes

**Files:**
- Modify: `src/lib/reports/financeiro.ts`, `src/lib/reports/financeiro.test.ts`, `src/lib/reports/queries.ts`, `src/app/(app)/relatorios/page.tsx`, `relatorios-client.tsx`, `relatorio-inventario.test.ts`

**Interfaces:**
- Consumes: Tasks 2–4; `naoSegue`, `SEGUE_O_RECORTE`, `urlDoRelatorio`.
- Produces:
  - `ParametrosDoRelatorio` ganha `pedido: PedidoDeDetalhe | null`, `caixaParaDetalhe` (o mesmo tipo de `detalheDoNumero.caixa`) e `saldos` (D-B-12);
  - `RelatorioFinanceiro` ganha `detalhe: Detalhe | null` e `hrefsDoDetalhe: Record<string, string>`;
  - `getReportsData` passa `pedidoDaUrl(sp)`.

Mapa chave → bloco da matriz (fonte única do "abre ou não"):
- `entradas` → `"entradas"`;
- `saidas` com parte `meu`/`bruto` → `"saidas"`; `saidas` com parte `terceiros` → `"terceiros"`;
- `pendente`/`pendente-do-mes` → `"pendente"`;
- `categoria` → `"maiores"`; `forma` → `"formas"`; `fatura` → `"faturasFuturas"`; `projecao` → `"projecao"`; `saldo` → `"saldo"`;
- `caixa` → `"saidas"` (qualquer recorte é ✗ na base caixa, D-A2-6/D-B-7).

Detalhes do comportamento:
- O detalhe roda sobre `e` (as entradas **já recortadas** em `montarRelatorioFinanceiro`) e sobre `crus`. Com `recorte.categoria`, passa `categoriaDoRecorte`.
- Responsabilidade:
  - "Terceiros" e "Consolidado" mudam a `parte` dos links (`terceiros`/`bruto`) pela tabela do §4;
  - na base caixa, as partes que o caixa não traz (D-A2-21) **não** ganham link.
- `naoSegue(bloco)` ≠ `null` → **sem** `hrefsDoDetalhe` para aquele número, e `detalhe` = estado `nao-segue` se a URL o pedir à mão (Review Focus 5). `hrefSemFiltro` = `urlDoRelatorio` sem o recorte.

- [ ] **Step 1: Testes que falham** (`financeiro.test.ts`, reusando a fixture copiada do arquivo):
  - para cada recorte (cartão, conta, categoria) com a base competência, Σ registros (laço no teste) da chave `saidas` = o valor do indicador "Minhas saídas" de `montarRelatorioFinanceiro` com o mesmo recorte, em centavos;
  - pessoa: só `pendente` tem href;
  - base caixa + recorte de cartão: nenhum href de caixa, e `pedido: saidas` → `nao-segue`;
  - Terceiros: o href de Entradas leva `parte=terceiros`;
  - `relatorio-inventario.test.ts`: os 15 itens continuam, e todo número do §4 presente no relatório tem `hrefsDoDetalhe.`.
- [ ] **Step 2:** FAIL → **Step 3:** implementar (página e cliente como no painel: `<GavetaDeRegistros>` dentro do `OlhoDosValores` da aba) → **Step 4:** suíte inteira + `tsc` + `lint`.
- [ ] **Step 5:** Mutação: forçar `naoSegue → null` no mapa → o teste base caixa + cartão fica vermelho; restaurar. Commit `feat(relatorios): cada numero do relatorio abre os registros com os recortes`.

---

### Task 7: Verificação, conferência visual, revisão e §13

- [ ] **Step 1:** Os cinco comandos: `npx vitest run --testTimeout=30000`, `npm run lint`, `npx tsc --noEmit`, `npm run build`, `npm run perf:bundle`. Registrar `/dashboard/financeiro` e `/relatorios` antes (linha de base, rodada antes do primeiro commit de código) e depois. Rodar também `TZ=UTC npx vitest run src/lib/finance src/lib/reports`.
- [ ] **Step 2:** Banco: o md5 dos saldos via MCP (`execute_sql`, só `select`), conferido contra `15d93bd1…`.
- [ ] **Step 3:** Conferência visual:
  - `npm run dev` na worktree;
  - Chrome em 390/768/1280/1440 px, claro e escuro, no Painel e no Relatório: a gaveta aberta em saídas (competência e caixa), pendente, uma fatura, projeção, vazio (mês antigo), olho fechado e olho alternado com a gaveta aberta, e um recorte;
  - se pedir login, **parar e pedir ao dono**;
  - se a janela não redimensionar, usar o harness de iframes e declarar o que foi medido só pelo DOM;
  - depois, `git checkout -- AGENTS.md`.
- [ ] **Step 4:** Revisão final da branch inteira no modelo mais capaz (Opus), cada achado consertado com teste vermelho antes, um commit por conserto.
- [ ] **Step 5:** Preencher o §13 do desenho: commits, os cinco comandos, o aceite item a item, as mutações, as decisões tomadas na execução com o custo, e os achados não consertados com destino. Commit `docs(redesign): 04-B resultado da execucao (secao 13)`. **PARAR** (sem push, sem merge).
