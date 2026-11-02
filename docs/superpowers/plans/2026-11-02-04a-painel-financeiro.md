# REDESIGN-04-A — Painel financeiro — Plano de execução

> **Para quem executa:** SUB-SKILL OBRIGATÓRIA: superpowers:subagent-driven-development (recomendada) ou
> superpowers:executing-plans, tarefa por tarefa. Os passos usam caixas (`- [ ]`). Antes de cada tarefa
> substancial, `ai-router-br:route` decide o executor; saída de worker é testada e revisada antes de entrar.

**Objetivo:** pôr `/dashboard/financeiro` no visual do print 1 (banner, 4 indicadores, barras × rosca,
cartões × faturas, últimas transações × a receber), sem que número algum mude de significado fora de
K1–K4, K6 e K7.

**Arquitetura:** regras novas são funções puras em `src/lib/finance/painel.ts` (finanças) e
`src/lib/painel/` (genéricas: cor, saudação, olho); duas leituras novas em `finance/queries.ts`; peças
visuais em `src/components/shared/painel/`; a régua K3 vai para `finance/regua-do-gasto-alto.ts`. A página
continua Server Component `force-dynamic`, e o banner chega ao cliente como `ReactNode` (zero JS).

**Stack:** Next.js 16, React, Tailwind v4, recharts 3.9 por `next/dynamic`, Supabase (só leitura), Vitest.

**Spec:** `docs/superpowers/specs/2026-11-02-04a-painel-financeiro-design.md` (aprovado em 2026-11-02).
Prévia aprovada: `https://claude.ai/artifact/PmcrXDKKDonsTX3pXy3UWW`.

## Restrições globais

- Worktree `C:/tmp/04a-painel`, branch `feat/redesign-04a-painel`. ⛔ Nunca o diretório principal; ⛔ nunca `C:/tmp/04c-reembolso`.
- D67: sem push, sem PR, sem merge em `main`, sem deploy. Commits locais, **um por tarefa**.
- Commit: mensagem em arquivo, `git commit -F`, título pt-BR sem acento, última linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Antes de cada commit: `git checkout -- AGENTS.md` (se `next dev` rodou), `sed -i 's/\r$//'` nos arquivos tocados, e `git diff --cached` revisado (nada de chave, token, `.env`, `service_role`, nome/valor real).
- ⛔ Não editar `docs/redesign/STATUS.md`, nenhum `CLAUDE.md`, nem `AGENTS.md`. Sem prettier.
- Banco: só leitura. Sem migration. md5 dos saldos no fim = `15d93bd1c1d3e55a40db6210dff0eb3b`.
- Sem `Date.now()`/`new Date()` sem argumento em código novo. **Única exceção declarada:** `horaDeBrasiliaAgora()` em `src/lib/format.ts`, ao lado de `hojeISO()` e no mesmo molde.
- Fixture sintética: "Cartão A/B/C", "Pessoa A/B", "Categoria A…F", valores inventados; nada do print.
- Gráfico: fachada + `*-impl.tsx` com `next/dynamic` (objeto literal), `YAxis width="auto"`; `min-w-0` em flex com irmão `shrink-0`; densidade por `@container`; claro/escuro; 390/768/1280/1440 px.
- Regra nova ⇒ teste que cai com a mutação; mutação desfeita e conferida por `git diff --quiet -- <arquivo>`.
- Testes existentes só mudam onde a Tarefa 2 lista (exceção declarada do spec §7).

## Foco de revisão

1. **Leitura do caixa falha** (`caixa.estado === "erro"`): os três indicadores de caixa mostram o texto de erro de hoje, nunca R$ 0,00 — teste na Tarefa 6.
2. **`lerSaldoAte` falha** (rpc com erro): "Não foi possível ler o saldo", sem número e sem a linha de diferença — teste na Tarefa 1 (`saldoComData` com `saldoAte: null`).
3. **Usuário sem cartão, sem lançamento e sem recebível:** cada bloco mostra o estado **vazio** (não "falha", não R$ 0,00) — teste de `estadoDoBloco` na Tarefa 4.
4. **Mês fora do andamento selecionado** (`?mes=` passado ou futuro): a régua é a de hoje (mês inteiro), nenhuma barra é "parcial", e a seta de saídas ganha cor — testes na Tarefa 1 (`dadosDasBarras`, `sentidoDaVariacao`) e na Tarefa 2.
5. **Cookie do olho com valor inesperado** (`"true"`, `"0"`, vazio): valores **visíveis** — só `"1"` oculta; teste na Tarefa 1 (`valoresOcultos`).

---

### Tarefa 0: Linha de base

**Arquivos:** nenhum versionado. Registro em
`C:\Users\Yuri\AppData\Local\Temp\claude\c--Users-Yuri-Documents-Desenvolvedor-yuri-app-pessoal\46a7247d-60db-455b-b956-4fb93374eaf6\scratchpad\04a-linha-de-base.md`.

- [ ] **Passo 1:** `npm ci` na worktree.
- [ ] **Passo 2:** rodar `npm run test:run`, `npm run lint`, `npx tsc --noEmit`, `npm run build`, `npm run perf:bundle`; anotar contagem de testes/arquivos, avisos do lint e KB gz de `/(app)/dashboard/financeiro`, `/(app)/dashboard`, `/(app)/relatorios` e a mediana.
- [ ] **Passo 3:** `TZ=UTC npx vitest run src/lib/finance src/lib/dashboard src/lib/notifications` → anotar.
- [ ] **Passo 4:** se algum dos cinco estiver vermelho **antes** de tocar em código, parar e relatar ao dono (não consertar aqui).

Sem commit.

---

### Tarefa 1: Núcleo puro do painel

**Arquivos:**
- Criar: `src/lib/finance/painel.ts`, `src/lib/finance/painel.test.ts`
- Criar: `src/lib/painel/cor.ts`, `src/lib/painel/saudacao.ts`, `src/lib/painel/olho.ts` e um `.test.ts` para cada
- Modificar: `src/lib/format.ts` (só `horaDeBrasiliaAgora`)

**Interfaces (produz):**
```ts
// src/lib/finance/painel.ts
export type Sentido = "bom" | "ruim" | "neutro";
export type ComparacaoDoIndicador = { pct: number | null; sentido: Sentido; texto: string };
export function indicadorMinhasEntradas(r: Pick<ResumoMes, "entradasMeu" | "entradasTerceiros">): { valor: number; linhaDeTerceiros: string | null };
export function saldoComData(p: { saldoAte: number | null; saldoDaView: number; hoje: string }): { rotulo: string; valor: number | null; diferenca: string | null };
export function sentidoDaVariacao(tipo: "entrada" | "saida", pct: number | null, emAndamento: boolean): Sentido;
export function comparacaoDosIndicadores(p: { dados: MesAMesDados; ateODia: number | null; base: BaseFinanceira }): { entradas: ComparacaoDoIndicador; saidas: ComparacaoDoIndicador };
export function aReceberPorPessoa(recs: readonly (RecebivelComRecebimentos & { person: { id: string; nome: string } | null })[], corte: string): { pessoaId: string | null; nome: string; pendente: number }[];
export function estornosDoCartaoNoMes(p: { mes: string; transactions: DashTx[]; statements: DashStatement[]; installmentItems: DashInstallmentItem[]; receivables: DashReceivable[] }): number; // minha parte, positiva
export function dadosDaRosca(fatias: readonly CategoriaSlice[]): CategoriaSlice[];
export function foraDaRosca(fatias: readonly CategoriaSlice[], estornos: number): { quantidade: number; soma: number; estornos: number; frase: string | null };
export function dadosDasBarras(evolucao: readonly EvolucaoPonto[], mesEmAndamento: string | null): (EvolucaoPonto & { parcial: boolean })[];
export function valorDaFatura(f: FaturaProvisao): number | null; // null = "sem lançamentos conhecidos"
export function faturaAtualDoCartao(faturas: readonly FaturaProvisao[], cardId: string): FaturaProvisao | null;
export function pendenteAoBanco(faturas: readonly FaturaProvisao[]): number;
// src/lib/painel/cor.ts
export function textoSobreACor(cor: string | null): "branco" | "escuro" | null;
// src/lib/painel/saudacao.ts
export function saudacaoPara(horaHHmm: string): "Bom dia" | "Boa tarde" | "Boa noite";
export const FRASES_DO_BANNER: readonly string[];
export function fraseDoDia(hoje: string, lista: readonly string[]): string;
// src/lib/painel/olho.ts
export const COOKIE_DO_OLHO = "fin_ocultar_valores";
export function valoresOcultos(valor: string | undefined): boolean;
// src/lib/format.ts
export function horaDeBrasiliaAgora(): string; // 'HH:mm', = timeInSaoPaulo(new Date())
```

`src/lib/painel/` **não importa nada de `@/lib/finance`** (as peças comuns servem à 04-A2 e à 06).

- [ ] **Passo 1: Escrever os testes** (todos com valores sintéticos, em centavos convertidos por `reaisParaCentavos` onde houver soma):
  - `indicadorMinhasEntradas`: `{entradasMeu: 1000, entradasTerceiros: 250}` → `{valor: 1000, linhaDeTerceiros: "+ R$ 250,00 de terceiros"}`; `entradasTerceiros: 0.004` → `linhaDeTerceiros: null` (zero em centavos).
  - `saldoComData`: `hoje "2026-11-18"`, `saldoAte 900, saldoDaView 1000` → `rotulo "Saldo das contas · em 18/11"`, `valor 900`, `diferenca "não inclui lançamentos pagos com data futura (diferença de R$ 100,00)"`; `saldoAte === saldoDaView` → `diferenca null`; `saldoAte null` → `valor null, diferenca null`.
  - `sentidoDaVariacao`: entrada `+10` → bom, `-10` → ruim; saída fechada `+10` → ruim, `-10` → bom; saída em andamento `+10` → neutro; `null` e `0` → neutro.
  - `comparacaoDosIndicadores`: `ateODia 18`, competência → saídas `{sentido: "neutro", texto: "só o à vista, até o dia 18, vs. mês anterior"}`, entradas `texto "até o dia 18 vs. mês anterior"`; caixa em andamento → saídas neutro, `texto "até o dia 18 vs. mês anterior"`; `ateODia null` → ambos `texto "vs. mês anterior"`, saída com cor. `pct` = `variacaoPct(atual, anterior)`; anterior 0 → `pct null`, `texto "sem base de comparação"`.
  - `aReceberPorPessoa`: duas pessoas, um recebível com recebimento **depois** do corte → ele conta como pendente; Σ dos `pendente` === `totalPendenteAte(recs, corte)`; pessoa nula → `nome "Sem pessoa"`; quem tem 0 não aparece; ordem por `pendente` desc.
  - `estornosDoCartaoNoMes` + `foraDaRosca`: fixture com uma fatura do mês com compra 300 e estorno de 50 (receita com `statement_id`) → `estornosDoCartaoNoMes === 50`; `foraDaRosca([Categoria A meu 0, Categoria B meu -20, Categoria C meu 100], 50)` → `{quantidade: 2, soma: -20, estornos: 50}` e frase mencionando "estornos do cartão"; tudo positivo e sem estorno → `frase null`. `dadosDaRosca` devolve só `meu > 0`.
  - `dadosDasBarras`: `mesEmAndamento "2026-11"` marca só novembro `parcial: true`; `null` não marca nenhum; valores idênticos aos de entrada.
  - `valorDaFatura`: `virtual && total === 0` → `null`; virtual com total 310 → 310; real com total 0 → 0.
  - `faturaAtualDoCartao`: primeira `status "aberta"` do cartão por `competencia`; sem aberta → a primeira `virtual`; sem nenhuma → `null`.
  - `pendenteAoBanco`: soma `total` das não virtuais com `status !== "paga"`.
  - `textoSobreACor`: `"#FFFFFF"` → escuro; `"#000"` → branco; `"#A98438"` → o de maior razão WCAG (calcular à mão no comentário); `"azul"`, `""`, `null` → `null`.
  - `saudacaoPara`: `"04:59"` noite, `"05:00"` dia, `"11:59"` dia, `"12:00"` tarde, `"17:59"` tarde, `"18:00"` noite.
  - `fraseDoDia`: mesmo `hoje` → mesma frase; dias consecutivos percorrem a lista; `FRASES_DO_BANNER.length >= 8` e `termosProibidosEm(f)` vazio para cada frase.
  - `valoresOcultos`: `"1"` → true; `undefined`, `""`, `"0"`, `"true"` → false.
- [ ] **Passo 2:** `npx vitest run src/lib/finance/painel.test.ts src/lib/painel` → FALHA (módulos não existem).
- [ ] **Passo 3: Implementar.** Notas que o teste não decide:
  - Dinheiro sempre em centavos (`reaisParaCentavos`/`centavosParaReais`), texto por `formatCurrency`.
  - `aReceberPorPessoa` agrupa e **chama `totalPendenteAte` em cada grupo** (D-A-14); não reimplementa o saldo.
  - `estornosDoCartaoNoMes` = −Σ `meuCent` dos itens **negativos** de `itensDasFaturas(...)` cujas faturas têm `mesDe(competencia) === mes`. Sem conta nova de estorno.
  - `fraseDoDia`: índice = dias desde 1970-01-01 por `Date.UTC(ano, mes-1, dia) / 86400000`, módulo do tamanho.
  - `textoSobreACor`: aceita `#RGB`/`#RRGGBB`; luminância relativa WCAG 2.1; compara com `#FFFFFF` e com o quase-preto do tema (`#111827`); devolve o de maior razão.
  - Frases: curtas, sem prescrição, sem cobrança (ex.: "Um passo de cada vez."), varridas pelo teste.
- [ ] **Passo 4:** os mesmos testes → PASSAM.
- [ ] **Passo 5: Mutações** (cada uma derruba ao menos um teste; desfazer e `git diff --quiet`): `indicadorMinhasEntradas` usando `entradas`; `saldoComData` com `!==` invertido; saída que sobe = bom; `aReceberPorPessoa` somando `valor`; `foraDaRosca` contando zero como fatia; `estornosDoCartaoNoMes` devolvendo 0; `textoSobreACor` sempre branco; `valoresOcultos` aceitando qualquer valor não vazio.
- [ ] **Passo 6: Commit** `feat(painel): nucleo puro do painel financeiro (04-A)`.

---

### Tarefa 2: A régua do gasto alto até o dia D (K3) — painel e sino

**Arquivos:**
- Criar: `src/lib/finance/regua-do-gasto-alto.ts`, `src/lib/finance/regua-do-gasto-alto.test.ts`
- Modificar: `src/lib/finance/caixa.ts` (exportar `resumoAteODia`), `src/lib/finance/dashboard.ts` (remover `reguaDoGastoAlto`; `gerarAlertas` recebe a régua), `src/lib/notifications/cron.ts`, `src/lib/notifications/generate.ts`, `src/app/(app)/dashboard/financeiro/page.tsx` (só a chamada da régua e de `gerarAlertas`)
- Testes existentes tocados (exceção declarada): `src/lib/finance/media-saidas.test.ts`, `src/lib/notifications/cron.test.ts` ("B2 — régua única (cenário A)" e "(cenário B)"), e toda chamada de `gerarAlertas`/`reguaDoGastoAlto` em `src/lib/finance/*.test.ts` e `src/lib/notifications/*.test.ts` (listar com `grep -rn "gerarAlertas\|reguaDoGastoAlto" src --include=*.test.ts` **antes** de tocar, e colar a lista na mensagem do commit).

**Interfaces:**
```ts
// regua-do-gasto-alto.ts
export type ReguaDoGastoAlto = { saidas: number; mediaSaidas: number; ateODia: number | null; cartaoFora: boolean };
export function reguaDoGastoAlto(p: { mes: string; hoje: string; transactions: DashTx[]; statements: DashStatement[]; receivables: DashReceivable[] }): ReguaDoGastoAlto;
// dashboard.ts — gerarAlertas: o parâmetro `mediaSaidas: number` é SUBSTITUÍDO por `regua: ReguaDoGastoAlto`
// generate.ts — `spending` ganha `ateODia: number | null` (opcional no tipo: ausente = null)
```

Regra (spec §7): `dia = diaDeCorte(mes, hoje)`. `null` → exatamente a conta de hoje (mês inteiro, `resumoMes().saidas`, média dos até 5 anteriores com saída). Senão → `saidas = resumoAteODia(mes, dia, …).saidas` e a média dos até 5 anteriores com `resumoAteODia(m, dia, …).saidas` (o próprio `periodoAteODia` trata D = 31 em fevereiro). `mediaDeSaidas` continua em `dashboard.ts`.

Textos (copy fixa):
- Painel, mês em andamento: `As saídas à vista até o dia ${D} superam a média dos meses anteriores até o mesmo dia em ${pct}%. O cartão fica de fora desta conta.`
- Sino, com `ateODia`: `As saídas à vista do mês até o dia ${D} superam a média recente até o mesmo dia em ${pct}% (${formatCurrency(saidas)}). O cartão fica de fora desta conta.`
- Mês fechado / sem `ateODia`: os textos de hoje, sem mudança. `dedupe_key` continua `high_spending:<mes>`.

- [ ] **Passo 1:** antes de tudo, `grep -rn "from \"@/lib/finance/caixa\"" src` e os testes de fronteira que citam `caixa.ts` (`grep -rln "caixa" src --include=*.test.ts | xargs grep -ln "import\|readFileSync"`): confirmar que `regua-do-gasto-alto.ts` e `cron.ts` podem importar `caixa.ts`. Se uma fronteira proibir, **parar** e relatar.
- [ ] **Passo 2: Testes novos** em `regua-do-gasto-alto.test.ts`: (a) `hoje` em 18/11, compra à vista dia 10 (100) e pendente à vista dia 25 (900), cartão de 5000 na fatura do mês, três meses anteriores com à vista até o dia 18 de 100/100/100 e depois do 18 de 1000 → `saidas 100`, `mediaSaidas 100`, `ateODia 18`, `cartaoFora true`; (b) a mesma fixture com `hoje` em dezembro (mês fechado) → os números de hoje (calcular à mão no comentário); (c) mês anterior sem saída até o dia D é ignorado na média; (d) `mes` de fevereiro com `hoje` no dia 31 de outro mês não acontece — em vez disso: `hoje "2026-03-31"`, mês anterior fevereiro cortado no dia 28.
- [ ] **Passo 3:** rodar → FALHA.
- [ ] **Passo 4:** implementar; mover `reguaDoGastoAlto`; `gerarAlertas` usa `regua.saidas` e escreve o texto do corte quando `regua.ateODia !== null`; `cron.ts` chama a régua nova com o `hoje` que já tem e passa `ateODia` em `spending`; `generate.ts` escolhe o texto por `ateODia`.
- [ ] **Passo 5: Testes existentes (exceção declarada).** Para cada `it` listado no passo 0 da tarefa: se ele só precisa da assinatura nova, passar `hoje` **posterior** ao mês do teste (mês fechado ⇒ valores antigos intactos) ou `regua: { saidas: <resumo.saidas>, mediaSaidas: <o valor antigo>, ateODia: null, cartaoFora: false }`. Se ele afirma o mês inteiro **no mês em andamento** (o caso de `cron.test.ts` B2 A/B), reescrever **no lugar**: nome passa a começar com `K3 (04-A) —`, valor novo calculado à mão no comentário a partir da fixture, nenhum `it` apagado.
- [ ] **Passo 6:** `npx vitest run src/lib/finance src/lib/notifications` e `TZ=UTC` do mesmo → PASSA.
- [ ] **Passo 7: Mutações:** régua usando `resumoMes().saidas` no mês em andamento → cai (a); média sem corte → cai (a); `ateODia` sempre `null` → caem o teste do texto do painel e o do sino. Desfazer + `git diff --quiet`.
- [ ] **Passo 8: Commit** `feat(financeiro): regua do gasto alto ate o dia D no painel e no sino (K3)` — com a lista de testes tocados no corpo.

---

### Tarefa 3: Leituras novas

**Arquivos:**
- Modificar: `src/lib/finance/queries.ts`, `src/lib/finance/pipeline.ts` (só `ESCOPO_PAINEL` e o tipo do escopo)
- Criar: `src/lib/finance/leituras-do-painel.test.ts`

**Interfaces (produz):**
```ts
export const ESCOPO_PAINEL = { ...ESCOPO_RELATORIO, nome: "painel", recebiveisCrus: true } as const; // em pipeline.ts, somado à união EscopoFinanceiro
// LeituraFinanceira<E> ganha `& (E extends { recebiveisCrus: true } ? { recebiveis: ReceivableWithRelations[] } : unknown)`
export async function lerSaldoAte(dataExclusiva: string): Promise<number | null>;       // rpc account_balance_before(null, data); erro → null
export async function getUltimasTransacoes(hoje: string, n?: number): Promise<TransactionWithRelations[]>; // n = 5; erro LANÇA (03-G)
```
`getUltimasTransacoes`: `select(TX_SELECT + TX_SHARED_EMBED)`, `.lte("competence_date", hoje)`, `.neq("type", "transferencia")`, ordem `competence_date` desc e `created_at` desc, `.limit(n)`.

- [ ] **Passo 1: Testes**, com o mesmo cliente simulado de `ler-financeiro.test.ts`: (a) `lerFinanceiro({escopo: ESCOPO_PAINEL, janela})` devolve `Object.keys` = `["completude","contas","entradas","recebiveis","recorrencias"]` e `recebiveis` traz `person`; (b) as chaves de `ESCOPO_RELATORIO` continuam as de hoje (o teste existente já cobre — não tocar); (c) `getUltimasTransacoes("2026-11-18")` chama `lte("competence_date","2026-11-18")`, `neq("type","transferencia")`, `limit(5)`; (d) `lerSaldoAte` chama a rpc com `{p_account_id: null, p_date}` e devolve `null` quando a rpc devolve erro. (e) `saldo-das-contas.test.ts` continua verde sem edição.
- [ ] **Passo 2:** rodar → FALHA.
- [ ] **Passo 3:** implementar. `recebiveis` sai do mesmo `lerRecebiveis` já chamado no `Promise.all` — **nenhuma** leitura a mais.
- [ ] **Passo 4:** rodar → PASSA; `npx tsc --noEmit`.
- [ ] **Passo 5: Mutação:** tirar o `.neq("type","transferencia")` → cai (c). Desfazer + `git diff --quiet`.
- [ ] **Passo 6: Commit** `feat(financeiro): leituras do painel (saldo ate hoje, ultimas transacoes, recebiveis com pessoa)`.

---

### Tarefa 4: Peças comuns e tokens do banner

**Arquivos:**
- Criar: `src/components/shared/painel/banner-de-boas-vindas.tsx`, `indicador.tsx`, `bloco.tsx`, `olho-dos-valores.tsx`, `montanha.tsx` (SVG nosso)
- Criar: `src/components/shared/painel/painel.test.ts`, `src/lib/painel/bloco.ts` (+ teste no mesmo `painel.test.ts` ou próprio)
- Modificar: `src/app/globals.css` (tokens `--banner-from`, `--banner-to` em `:root` e `.dark`)

**Interfaces:**
```ts
BannerDeBoasVindas(props: { saudacao: string; nome: string | null; linha: string; frase?: string }) // SEM "use client"
Indicador(props: { tom: "saldo"|"entrada"|"saida"|"terceiros"; rotulo: string; dica: string; valor: string | { erro: string }; linhaDeBase: string; comparacao?: ComparacaoDoIndicador; href?: string; acessorio?: React.ReactNode })
Bloco(props: { titulo: string; subtitulo?: string; verTodos?: { href: string; rotulo?: string }; acao?: React.ReactNode; estado: EstadoDoBloco; vazio?: { frase: string; acao?: React.ReactNode }; falha?: { frase: string }; children?: React.ReactNode })
OlhoDosValores(props: { ocultoInicial: boolean; children: React.ReactNode }) // "use client"
// src/lib/painel/bloco.ts
export type EstadoDoBloco = "conteudo" | "vazio" | "falha";
export function estadoDoBloco<T>(leitura: { ok: true; itens: readonly T[] } | { ok: false }): EstadoDoBloco;
```
- Saudação: `nome ? \`${saudacao}, ${primeiroNome(nome)}!\` : \`${saudacao}!\`` (primeiro nome = até o primeiro espaço).
- Olho: o cliente alterna `data-ocultar` no invólucro e grava `document.cookie = \`${COOKIE_DO_OLHO}=${v ? "1" : "0"}; path=/; max-age=31536000; samesite=lax\``. O `Indicador` renderiza o valor real e "R$ ••••" lado a lado e o CSS mostra um ou outro por `group-data-[ocultar=true]` — os indicadores continuam renderizados no servidor. Dica do botão: "Esconde os valores nesta tela, neste aparelho. É discrição, não sigilo."
- Comparação: seta + palavra ("subiu"/"caiu"/"estável") + cor pelo `sentido` (`bom` = token de sucesso, `ruim` = destrutivo, `neutro` = `muted-foreground`); `pct null` → só o `texto`.
- Banner: degradê `--primary` → `--banner-to` no claro; `--banner-from` → `--banner-to` no escuro. Texto branco. Escolher os valores escuros para que o branco tenha **≥ 4,5:1** sobre o ponto mais claro (medido na Tarefa 7). Celular: sem a frase, montanha menor.

- [ ] **Passo 1: Testes** (`painel.test.ts`, por varredura de fonte, no molde de `src/lib/ai/chat-events.test.ts`): (a) `banner-de-boas-vindas.tsx` e `montanha.tsx` não contêm `"use client"` e só importam de `react`/`@/lib/painel/*`/`@/lib/utils`; (b) `olho-dos-valores.tsx` contém `"use client"` e usa `COOKIE_DO_OLHO`; (c) `indicador.tsx` tem `min-w-0` e `@container`; (d) `estadoDoBloco`: `{ok:false}` → falha, `{ok:true, itens:[]}` → vazio, com itens → conteudo; (e) `src/components/shared/painel/*` não importa `@/lib/finance`.
- [ ] **Passo 2:** rodar → FALHA. **Passo 3:** implementar. **Passo 4:** rodar → PASSA; `npm run lint`.
- [ ] **Passo 5: Mutações:** pôr `"use client"` no banner → cai (a); `estadoDoBloco` devolvendo `vazio` na falha → cai (d).
- [ ] **Passo 6: Commit** `feat(painel): pecas comuns (banner, indicador, bloco, olho) e tokens do banner`.

---

### Tarefa 5: Gráficos

**Arquivos:**
- Criar: `src/components/dashboard/barras-entradas-saidas-chart.tsx` + `-impl.tsx`; `src/components/dashboard/rosca-categorias-chart.tsx` + `-impl.tsx`
- Modificar: `src/components/dashboard/projecao-chart-impl.tsx` (hachura + tracejado + legenda "projetado")
- Teste: `src/components/dashboard/chart-theme.test.ts` já varre `YAxis width="auto"` nos `*-impl.tsx` — não editar; acrescentar `src/components/dashboard/graficos-do-painel.test.ts`

**Interfaces:**
```ts
BarrasEntradasSaidasChart(props: { dados: (EvolucaoPonto & { parcial: boolean })[]; rotulos: RotulosDosGraficos["evolucao"] }) // altura 280
RoscaCategoriasChart(props: { fatias: CategoriaSlice[]; total: number; fora: ReturnType<typeof foraDaRosca> })       // altura 280
```
- Barras: entradas `--chart-1`, saídas neutro (`--muted-foreground` a 60%); barra `parcial` com `<pattern>` de hachura e `strokeDasharray`; legenda "mês em andamento · parcial" quando há barra parcial.
- Rosca: cor por **identidade** da categoria (`categoryId` → slot estável `--chart-1..8` por hash do id; `color` da categoria quando existir), total no centro, legenda com valor e %; a nota de `fora.frase` abaixo. A legenda (lista com valores) fica na **fachada**, fora do `-impl` (regra do "o que não usa recharts fica na fachada").
- Projeção: série futura com hachura + borda tracejada e legenda "projetado" — vale também em `/relatorios` (declarado no spec).

- [ ] **Passo 1: Testes:** (a) `graficos-do-painel.test.ts` varre as duas fachadas: `next/dynamic` com objeto literal, `ssr: false`, `chartSkeletonHeightVar(280)`; (b) a fachada da rosca não importa `recharts`; (c) `projecao-chart-impl.tsx` contém `strokeDasharray` e o `<pattern`.
- [ ] **Passo 2:** FALHA. **Passo 3:** implementar. **Passo 4:** PASSA + `chart-theme.test.ts` verde.
- [ ] **Passo 5: Mutação:** trocar o objeto literal do `dynamic` por constante → cai (a). Desfazer.
- [ ] **Passo 6: Commit** `feat(painel): graficos de barras e rosca, hachura na projecao`.

---

### Tarefa 6: Painel montado, inventário e conciliação

**Arquivos:**
- Modificar: `src/app/(app)/dashboard/financeiro/page.tsx`, `financial-dashboard-client.tsx`
- Criar: `src/app/(app)/dashboard/financeiro/painel-inventario.test.ts`, `src/lib/finance/painel-conciliacao.test.ts`, `src/app/(app)/dashboard/financeiro/painel-links.test.ts`

**Consome:** tudo das Tarefas 1–5.

Montagem (spec §4, na ordem): cabeçalho com mês e base à direita → banner (passado como `ReactNode` à prop `banner` do cliente) → aviso parcial (`completude.estado === "parcial"`, com os motivos) + alertas compactos → `OlhoDosValores` envolvendo os quatro `Indicador` → Bloco do caixa (só caixa) → barras (~⅔) + rosca (~⅓) → Cartões (~⅗) + Próximas faturas (~⅖) → Últimas transações (~⅗) + A receber de terceiros (~⅖) → Detalhamento → Projeções.

Valores dos indicadores:
| | Competência | Caixa (`caixa.estado === "ok"`) | Caixa com erro |
| --- | --- | --- | --- |
| Saldo | `saldoComData` (igual nas duas) | idem | idem |
| Minhas entradas | `indicadorMinhasEntradas(resumo)` | `caixa.graficos.minha.entradas` | texto de erro de hoje |
| Minhas saídas | `resumo.meu`, base "inclui o que ainda está pendente" | `caixa.graficos.minha.saidas` | texto de erro de hoje |
| De terceiros | `resumo.terceiros` | `caixa.graficos.minha.terceirosNasSaidas` | texto de erro de hoje |
| Comparação | `comparacaoDosIndicadores({dados: mesAMesCompetencia, ateODia: graficoAteODia?.ateODia ?? null, base})` | `{dados: caixa.graficos.mesAMes.dados, ateODia: caixa.graficos.mesAMes.ateODia, base}` | — |
De terceiros não tem comparação.

Links (D-A-4): Saldo → `/financeiro/contas`; entradas → `/financeiro/lancamentos?type=receita&month=<mesSel>`; saídas → `/financeiro/lancamentos?type=despesa&month=<mesSel>`; terceiros e "A receber" → `/terceiros`; Cartões → `/cartoes`; Próximas faturas → `/faturas`; Últimas transações → `/financeiro/lancamentos`.

Últimas transações e saldo: a página chama `getUltimasTransacoes` e `lerSaldoAte(nextDayISO(hoje))` no mesmo `Promise.all` de `lerFinanceiro({escopo: ESCOPO_PAINEL})`, com `.catch` que vira `{ok: false}` / `null` — falha vira o estado de falha do bloco, nunca a página inteira.

Banner: `saudacaoPara(horaDeBrasiliaAgora())`, `nome = await getDisplayName()` (no mesmo `Promise.all`),
`linha = "Aqui está o resumo de <mês por extenso>."`, `frase = fraseDoDia(hoje, FRASES_DO_BANNER)`.

Barras: rodapé "Ver relatório ›" → `/relatorios` (D-A-6), janela de 6 meses como hoje; `mesEmAndamento =
mesAtual` só quando `mesSel === mesAtual`.

Cartões: um bloco por `DashCard`, fundo `card.cor` quando `textoSobreACor(card.cor) !== null` (senão o
estilo neutro), texto branco/escuro conforme a função; "Fatura atual" = `valorDaFatura(faturaAtualDoCartao(
faturas, card.id))` (cheio; `null` → "sem lançamentos conhecidos"), "minha parte" em linha menor, "fecha em
DD/MM" da mesma fatura; o bloco leva a `/cartoes`; último item "Adicionar cartão" → `/cartoes`. Sem
bandeira (não está em `DashCard`; desvio do print, vai para o §6 da REFERENCIA-VISUAL no §13).

Próximas faturas: subtítulo "<N> ciclos de cada cartão · pelo vencimento", com N = o maior número de
linhas de um mesmo cartão na lista; topo "Pendente ao banco" = `pendenteAoBanco(faturas)`; cada linha com
marcador da cor, "<cartão> · <mês>", "vence DD/MM", `valorDaFatura` e o selo de `status`.

A receber: `aReceberPorPessoa(recebiveis, hoje)`, o total `totalPendenteAte(recebiveis, hoje)` com rótulo `rotuloTotalPendenteAte(hoje)` e, abaixo, o "Pendente referente a <mês>" de hoje (`totalAReceber(recs, mesSel)` com `rotuloPendenteDoMes`).

- [ ] **Passo 1: Testes.**
  - `painel-inventario.test.ts` (varredura de `page.tsx` + `financial-dashboard-client.tsx`): os 19 blocos do spec §2.3 com o marcador de cada um — `type="month"`, seletor de base, `alertas`, "Saldo das contas", "Minhas entradas", "Minhas saídas", "A receber de terceiros" (o pendente do mês), `BlocoDoCaixa`, card-âncora "Minhas saídas ·", "Gasto no cartão", "Faturas", "Próximas contas a pagar", "Cartão realmente meu", `RoscaCategoriasChart` (substitui `CategoriaChart`), `FormaPagamentoChart`, `BarrasEntradasSaidasChart` (substitui `EvolucaoChart`), `MesAMesChart`, `ProjecaoChart`, `FaturasChart`, "Próximas faturas" — mais `CaixaNaoLido` e `RodapeDasFaturasSemTotal`; e `BannerDeBoasVindas` aparece só em `page.tsx`.
  - `painel-conciliacao.test.ts`, uma fixture sintética (2 meses, Cartão A e B, Pessoa A e B, compra dividida, compra parcelada, **estorno de cartão**, pendente à vista futuro, recebível com recebimento parcial): Minhas saídas (`resumo.meu`) === barra do mês (`evolucaoMensal` do mês) === Σ `dadosDaRosca(...).meu` − `estornosDoCartaoNoMes` + `foraDaRosca(...).soma`; `resumo.meu + resumo.terceiros === resumo.saidas`; Σ `aReceberPorPessoa` === `totalPendenteAte`; `pendenteAoBanco(faturas)` === Σ dos valores das linhas reais não pagas da lista. Se a primeira igualdade **não** fechar com o estorno, parar e relatar ao dono — não ajustar a fórmula para passar.
  - `painel-links.test.ts`: cada `href` estático dos indicadores e blocos tem `page.tsx` no disco (mesmo molde de `src/lib/search/ai-links.test.ts`).
  - Foco de revisão 1: um teste de varredura que garante que, com `caixa.estado === "erro"`, os indicadores de caixa recebem `{erro: …}` (função pura `indicadoresDoCaixa(caixa)` em `src/lib/finance/painel.ts`, com teste em `painel.test.ts`: erro → os três com `{erro}`; ok → os três números de `graficos.minha`).
- [ ] **Passo 2:** FALHA. **Passo 3:** montar. **Passo 4:** PASSA; `npx tsc --noEmit`; `npm run lint`.
- [ ] **Passo 5: Mutações:** remover o `FormaPagamentoChart` do cliente → cai o inventário; trocar `resumo.meu` por `resumo.saidas` no indicador → cai a conciliação (via função usada pelo cliente); `indicadoresDoCaixa` devolvendo 0 no erro → cai.
- [ ] **Passo 6: Commit** `feat(painel): painel financeiro no visual do print 1 (04-A)`.

---

### Tarefa 7: Conferência visual e contraste

- [ ] **Passo 1:** `npm run dev` na worktree. Se pedir login: **parar e pedir ao dono para entrar** — não digitar senha.
- [ ] **Passo 2:** `/dashboard/financeiro` em 390, 768, 1280 e 1440 px, claro e escuro, competência e caixa: sem rolagem horizontal, nada cortado, olho funcionando, estados vazios distintos de falha. Capturas ficam no scratchpad, **não** no repositório.
- [ ] **Passo 3:** medir a razão de contraste do branco sobre o ponto mais claro do degradê nos dois temas (cor computada no navegador → fórmula WCAG); ≥ 4,5:1. Anotar os dois números para o §13. Abaixo disso: ajustar `--banner-from`/`--banner-to`, repetir e fazer commit `fix(painel): contraste do banner`.
- [ ] **Passo 4:** confirmar no DevTools que o banner não traz chunk de cliente próprio.
- [ ] **Passo 5:** `git checkout -- AGENTS.md`; parar o dev server.

---

### Tarefa 8: Fechamento

- [ ] **Passo 1:** os cinco comandos; `perf:bundle` comparado com a Tarefa 0 (as três rotas e a mediana); `/dashboard/financeiro` ≤ 250 KB gz.
- [ ] **Passo 2:** `TZ=UTC npx vitest run src/lib/finance src/lib/dashboard src/lib/notifications`.
- [ ] **Passo 3:** md5 de `id:current_balance` de `accounts_with_balance` (ordenado por id) === `15d93bd1c1d3e55a40db6210dff0eb3b`.
- [ ] **Passo 4:** revisão da branch inteira por um revisor novo (`superpowers:requesting-code-review`); achado aceito vira commit; recusado vai para o §13 com o motivo.
- [ ] **Passo 5:** preencher o §13 do spec: commits, os 9 critérios do §9 um a um com evidência, decisões tomadas na execução, achados não consertados, pendências (integração local em `feat/redesign-00-auditoria` só com o aval do dono, D67). Sem "zero bugs".
- [ ] **Passo 6: Commit** `docs(redesign): 04-A resultado da execucao (secao 13)`. Parar.
