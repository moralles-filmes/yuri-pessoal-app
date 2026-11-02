# REDESIGN-04-A2 — Relatório financeiro: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a aba Financeiro de `/relatorios` com as peças da 04-A, a barra de filtros completa (período, base,
responsabilidade, conta, cartão, pessoa, categoria) e a sequência Resumo → Evolução → Composição → Detalhamento →
Projeções, sem nenhum número que o motor não decomponha.

**Architecture:** o motor (`finance/dashboard.ts`) continua sendo a única conta. Os recortes são puros:
- `finance/recorte.ts` recorta as **entradas** do motor para cartão e conta;
- para categoria, ele devolve só **resultados prontos**;
- para pessoa, recorta só os recebíveis crus.

A responsabilidade e a montagem dos indicadores são puras e **compartilhadas com o painel**. A página do
relatório monta o modelo de vista no servidor (`reports/financeiro.ts`, puro), e o cliente só desenha.

**Tech Stack:** Next.js 16 (App Router, `searchParams` como Promise), React 19, TypeScript, Tailwind v4, shadcn,
recharts por `next/dynamic` (fachada + `-impl`), Vitest (`environment: node`, sem teste de componente: as
verificações de tela são **varredura da fonte**, como no resto do projeto).

**Spec:** `docs/superpowers/specs/2026-11-02-04a2-relatorio-financeiro-design.md`. As decisões L1–L5 e
D-A2-1..24 são citadas pelo código; leia-o antes da primeira tarefa.

## Global Constraints

- Sem push, sem PR, sem merge em `main`, sem deploy (D67). Commits **locais**, um por tarefa.
- Nada fora de `C:/tmp/04a2-relatorio`. O diretório principal só é lido para o `.env.local`, e só com o aval do dono.
- **Sem migration.** O banco é só leitura. O md5 dos saldos tem de ser `15d93bd1c1d3e55a40db6210dff0eb3b` antes e depois.
- A fixture é **sintética**: "Cartão A", "Conta B", "Categoria A", "Pessoa A", valores inventados. O print nunca entra.
- Nenhum `Date.now()` nem `new Date()` sem argumento em código novo. `hoje` é injetado.
- Dinheiro é somado em centavos (`reaisParaCentavos`/`centavosParaReais`) e formatado só por `formatCurrency`.
- **Ausência nunca vira R$ 0,00.** Falha de leitura é texto; recorte que não se aplica é o estado "não segue".
- Nenhum `formatCurrency(x.entradas)` bruto no relatório, em "Meu" (L2).
- Os textos são em pt-BR e passam por `termosProibidosEm` (`src/lib/tone/`) quando são lista fixa.
- Sem prettier. Antes de cada commit:
  - `sed -i 's/\r$//'` nos arquivos tocados;
  - `git checkout -- AGENTS.md`, se o `next dev` rodou;
  - revisar o diff (chave, token, `.env`, `service_role`, nome real).
- Commit: título em pt-BR sem acento, por `git commit -F`, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- `docs/redesign/STATUS.md`, `CLAUDE.md` e `AGENTS.md` **não** são editados.
- Gráfico novo entra por fachada + `*-impl.tsx` com `next/dynamic` (objeto literal), com `YAxis width="auto"`.
- Campo de texto nunca é controlado pela URL. Esta tela não tem campo de texto, e os recortes são `<select>`.
- Os testes de fuso passam com `TZ=UTC`.
- Cada tarefa passa por `ai-router-br:route` antes de executar. Codex só com restrição estreita: ele já escreveu no
  diretório principal deste repo. Na dúvida, o subagente Claude, com o motivo registrado.

## Review Focus

1. **URL com valor estranho:**
   - `?conta=X&cartao=Y` juntos, um uuid que não é do dono, ou um id de cartão em `?conta=`;
   - o esperado: o recorte é ignorado (sem chip, sem filtro fantasma), e com conta e cartão juntos vale o **cartão**.

   Teste na Tarefa 2.
2. **Categoria sem nenhum gasto no mês:**
   - a fatia não existe;
   - "Minhas saídas" mostra R$ 0,00 como **zero medido**, porque a leitura veio completa e não há item. Não vira "não segue".

   Teste na Tarefa 2.
3. **Mês futuro selecionado com "Meu" e sem recorte:**
   - as setas seguem a regra `futuro` da 04-A, sem cor;
   - as barras do mês futuro saem hachuradas.

   Teste na Tarefa 4.
4. **Leitura parcial com recorte ligado:**
   - a faixa "parcial" continua visível;
   - o recorte não a esconde.

   Teste na Tarefa 7.
5. **Saldo que falha com o recorte de conta:**
   - aparece "Não foi possível ler o saldo", nunca R$ 0,00;
   - nenhuma linha de diferença.

   Teste na Tarefa 7.

---

### Task 1: o motor passa a carregar a conta do lançamento (D-A2-13)

**Files:**
- Modify: `src/lib/finance/pipeline.ts`:
  - `LinhaTx` ganha `account_id: string | null`, obrigatório;
  - `montarEntradas` copia o campo para `DashTx`.
- Modify: `src/lib/finance/dashboard.ts`: `DashTx` ganha `account_id?: string | null`, opcional, como `id`.
- Modify: todo arquivo que monta `LinhaTx` à mão. Descubra com `npx tsc --noEmit`: cada erro é uma fixture que ganha
  `account_id: null`.
- Test: `src/lib/finance/pipeline.test.ts`.

**Interfaces:**
- Produces: `DashTx.account_id?: string | null`, preenchido por `montarEntradas` a partir de `LinhaTx.account_id`.

- [ ] **Step 1: teste vermelho.** Em `pipeline.test.ts`:
  - `it("montarEntradas leva account_id da linha ao motor")`: uma `LinhaTx` com `account_id: "conta-b"` gera
    `txs[0].account_id === "conta-b"`;
  - com `null`, gera `null`.
- [ ] **Step 2:** `npx vitest run src/lib/finance/pipeline.test.ts -t account_id`. Esperado: FAIL.
- [ ] **Step 3:** acrescentar o campo nos três lugares. Corrigir as fixtures que o `tsc` apontar com `account_id: null`.
  Não mudar nenhuma fixture de `DashTx` (o campo é opcional).
- [ ] **Step 4:** `npx tsc --noEmit` e `npx vitest run src/lib/finance`. Esperado: verde.
- [ ] **Step 5: mutação.** Remover a cópia em `montarEntradas` deixa o teste do Step 1 vermelho. Restaurar e
  conferir com `git diff`.
- [ ] **Step 6: commit.** `feat(redesign): 04-A2 T1 - o motor carrega a conta do lancamento`.

### Task 2: recortes puros e a matriz "segue × não segue" (L1, L4, L5, D-A2-1/2/9–14/23/24)

**Files:**
- Create: `src/lib/finance/recorte.ts`
- Test: `src/lib/finance/recorte.test.ts`

**Interfaces:**
- Consumes: `EntradasDoEscopo<typeof ESCOPO_PAINEL>` (txs, sts, recs, inst, cards, recorrencias, bills), `DashTx.account_id` (T1).
- Produces:

```ts
export type TipoDeRecorte = "conta" | "cartao" | "pessoa" | "categoria";
export type Recorte = { conta: string | null; cartao: string | null; pessoa: string | null; categoria: string | null };
export const SEM_RECORTE: Recorte;
export function recorteDaUrl(
  sp: Record<string, string | string[] | undefined>,
  conhecidos: { contas: readonly string[]; cartoes: readonly string[]; pessoas: readonly string[]; categorias: readonly string[] },
): Recorte; // id fora da lista → null; conta + cartão juntos → fica o cartão (Review Focus 1)
export function recortesAtivos(r: Recorte): TipoDeRecorte[];

// Cartão/conta: entradas do motor recortadas (alcance "motor"). Sem recorte de cartão/conta → as mesmas entradas.
export function recortarEntradas<E extends EntradasDoMotorDoRelatorio>(entradas: E, r: Pick<Recorte, "conta" | "cartao">): E;

// Categoria: SÓ resultados prontos — nenhuma lista do motor no retorno (D-A2-14).
export function recortarPorCategoria(p: {
  mes: string; categoriaId: string;
  entradas: Pick<EntradasDoMotorDoRelatorio, "txs" | "sts" | "recs" | "inst">;
}): {
  fatia: CategoriaSlice | null;        // de gastosPorCategoria, a da categoria
  formas: FormaSlice[];                // gastosPorForma sobre txs+inst da categoria e TODAS as faturas
  entradas: Pick<ResumoMes, "entradas" | "entradasMeu" | "entradasTerceiros">; // resumoMes com statements: []
};

// Pessoa e cartão sobre a lista crua de recebíveis (pendente).
export function recortarRecebiveisCrus<R extends { person_id: string | null; card_id: string | null }>(
  recs: readonly R[], r: Pick<Recorte, "pessoa" | "cartao">,
): R[];

export type BlocoDoRelatorio =
  | "saldo" | "entradas" | "saidas" | "terceiros" | "pendente" | "setas" | "barras" | "mesAMes"
  | "rosca" | "formas" | "ancora" | "maiores" | "assinaturas" | "projecao" | "faturasFuturas";
export const SEGUE_O_RECORTE: Record<BlocoDoRelatorio, Record<TipoDeRecorte, true | { motivo: string }>>;
export function naoSegue(bloco: BlocoDoRelatorio, r: Recorte, base: BaseFinanceira): { tipo: TipoDeRecorte; motivo: string } | null;
```

`EntradasDoMotorDoRelatorio` = `EntradasDoEscopo<typeof ESCOPO_PAINEL>`, reexportado com esse nome.

A matriz é a **§5 do desenho**, célula a célula. Os motivos de ✗ são os da prévia (§5). Na base caixa, `naoSegue`
devolve o primeiro recorte ativo com o motivo "a base caixa não se recorta nesta versão" (D-A2-6).

`recortarEntradas`:
- **cartão:**
  - `txs` com `card_id === id`;
  - `sts` com `card_id === id`;
  - `inst` cujo `statement_id` está nas faturas que ficaram;
  - `recs` cujo `statement_id` está nas faturas que ficaram, ou cujo `transaction_id` está nos lançamentos que ficaram;
  - `cards` só o cartão;
  - recorrências e contas fixas sem mudança. Os blocos de projeção não seguem, então elas não importam.
- **conta:**
  - `txs` com `account_id === id`;
  - `sts` e `inst` vazios;
  - `recs` pelo `transaction_id` dos lançamentos que ficaram.

- [ ] **Step 1: testes vermelhos** (`recorte.test.ts`, com fixture sintética que inclui um estorno de cartão, uma
  compra parcelada, um à vista com recebível e uma receita de conta):
  - `recorteDaUrl`:
    - ids válidos passam;
    - id fora de `conhecidos` vira `null`;
    - `cartao` e `conta` juntos dão `{conta: null, cartao}`;
    - `string[]` (parâmetro repetido) vira `null`.
  - `recortarEntradas` por cartão:
    - `resumoMes` sobre o recorte dá `saidas === Σ total_atual das faturas do Cartão A no mês`;
    - `aVista === 0`;
    - `entradas === 0`.
  - A soma de `resumoMes(...).saidas` sobre o recorte de **cada** cartão, mais `aVista` sem recorte, é igual a
    `resumoMes(...).saidas` sem recorte, em centavos.
  - `recortarEntradas` por conta:
    - só lançamentos daquela conta;
    - `sts` vazio;
    - `resumoMes(...).saidas === aVista daquela conta`.
  - `recortarPorCategoria`:
    - `fatia` igual (`toEqual`) à fatia da mesma categoria em `gastosPorCategoria` sem recorte;
    - `Object.keys(retorno)` é exatamente `["fatia","formas","entradas"]`;
    - categoria sem item no mês dá `fatia: null` (Review Focus 2).
  - Cartão + categoria (D-A2-24): `recortarPorCategoria` sobre `recortarEntradas(cartão)` dá a fatia só com itens
    daquele cartão.
  - `recortarRecebiveisCrus`: filtra por `person_id` e por `card_id`, e `aReceberPorPessoa` sobre o resultado da
    pessoa é igual à linha dela sem recorte.
  - `SEGUE_O_RECORTE`:
    - as 15 × 4 células existem;
    - todo `{motivo}` é não vazio e passa em `termosProibidosEm`;
    - spot-checks da §5: `rosca.categoria`, `pendente.conta` e `saidas.pessoa` são ✗; `faturasFuturas.cartao` e
      `formas.categoria` são `true`.
  - `naoSegue`:
    - na base caixa, qualquer recorte ativo é ✗;
    - sem recorte, `null`.
- [ ] **Step 2:** `npx vitest run src/lib/finance/recorte.test.ts`. Esperado: FAIL, porque o módulo não existe.
- [ ] **Step 3:** implementar `recorte.ts`. **Nenhuma soma** no arquivo: só filtros e chamadas a `gastosPorCategoria`,
  `gastosPorForma` e `resumoMes`.
- [ ] **Step 4:** a mesma linha de comando. Esperado: PASS. Depois `TZ=UTC npx vitest run src/lib/finance/recorte.test.ts`.
- [ ] **Step 5: mutações**, cada uma derrubando um teste nomeado:
  - (a) no recorte de cartão, não filtrar `sts`;
  - (b) `recorteDaUrl` aceitar id desconhecido;
  - (c) `recortarPorCategoria` devolver também `txs`;
  - (d) trocar uma célula ✗ da §5 por `true`.

  Restaurar e conferir com `git diff`.
- [ ] **Step 6: commit.** `feat(redesign): 04-A2 T2 - recortes puros e a matriz segue x nao segue`.

### Task 3: responsabilidade pura (L2, D-A2-16, D-A2-17, D-A2-21)

**Files:**
- Create: `src/lib/finance/responsabilidade.ts`
- Test: `src/lib/finance/responsabilidade.test.ts`

**Interfaces:**
- Produces:

```ts
export type Responsabilidade = "meu" | "terceiros" | "consolidado";
export const ROTULO_DA_RESPONSABILIDADE: Record<Responsabilidade, string>; // "Meu" · "Terceiros" · "Consolidado"
export function responsabilidadeDaUrl(v: string | string[] | undefined): Responsabilidade; // ausente/inválido → "meu"
export function evolucaoDaResponsabilidade(p: {
  meses: string[]; resp: Responsabilidade;
  transactions: DashTx[]; statements: DashStatement[]; receivables: DashReceivable[];
}): EvolucaoPonto[]; // meu → evolucaoMensal; terceiros → (entradasTerceiros, terceiros); consolidado → (entradas, saidas)
export function fatiasDaResponsabilidade<F extends { movimentado: number; meu: number }>(
  fatias: readonly F[], resp: Responsabilidade,
): (F & { valor: number })[]; // meu → meu; consolidado → movimentado; terceiros → movimentado − meu (centavos)
```

`evolucaoDaResponsabilidade` só **escolhe o campo** de `resumoMes` mês a mês. O `saldo` do ponto em
terceiros/consolidado é `entradas − saidas` do mesmo par, em centavos. Nenhuma outra conta.

- [ ] **Step 1: testes vermelhos:**
  - `responsabilidadeDaUrl`: `"terceiros"` e `"consolidado"` passam; `undefined`, `"meu"`, `"x"` e `["terceiros"]`
    dão `"meu"`.
  - Para cada mês da fixture: `meu.entradas + terceiros.entradas === consolidado.entradas` e o mesmo para
    `saidas`, em centavos.
  - `evolucaoDaResponsabilidade("meu")` é igual (`toEqual`) a `evolucaoMensal` com as mesmas entradas.
  - `fatiasDaResponsabilidade`: os três valores de uma fatia `{movimentado: 100.10, meu: 60.05}` são
    `60.05`, `40.05` e `100.10`.
  - `ROTULO_DA_RESPONSABILIDADE` passa em `termosProibidosEm`, e nenhum valor contém "meu gasto".
- [ ] **Step 2:** `npx vitest run src/lib/finance/responsabilidade.test.ts`. Esperado: FAIL.
- [ ] **Step 3:** implementar.
- [ ] **Step 4:** PASS, também com `TZ=UTC`.
- [ ] **Step 5: mutação.** Terceiros devolvendo `saidas` em vez de `terceiros` derruba o teste de soma. Restaurar.
- [ ] **Step 6: commit.** `feat(redesign): 04-A2 T3 - responsabilidade pura`.

### Task 4: os indicadores saem do cliente do painel para uma função compartilhada (D-A2-15, D-A2-20, D-A2-22)

**Files:**
- Modify: `src/lib/finance/painel.ts`: nova `indicadoresDoResumo`.
- Modify: `src/app/(app)/dashboard/financeiro/financial-dashboard-client.tsx`: os três indicadores passam a vir dela.
  O JSX não muda.
- Create: `src/lib/finance/conciliacao-relatorio-painel.test.ts`.
- Modify: `src/lib/finance/painel.test.ts`.

**Interfaces:**
- Consumes: `Responsabilidade` (T3), `indicadorMinhasEntradas`, `indicadoresDoCaixa`, `comparacaoDosIndicadores`.
- Produces:

```ts
export type IndicadorPronto = {
  rotulo: string; dica: string;
  valor: string | { erro: string } | { naoSegue: string };
  linhaDeBase: string; detalheComValor: string | null;
  comparacao: ComparacaoDoIndicador | null;
};
export function indicadoresDoResumo(p: {
  resp: Responsabilidade; base: BaseFinanceira;
  resumo: Pick<ResumoMes, "entradas" | "entradasMeu" | "entradasTerceiros" | "saidas" | "meu" | "terceiros">;
  caixa: EstadoDoCaixa | null;
  comparacao: { entradas: ComparacaoDoIndicador; saidas: ComparacaoDoIndicador } | null; // null = sem setas
  pendente: { ate: number; rotuloAte: string; referenteAoMes: number } ;  // terceiros e consolidado
  rotuloDoRecorte: string | null; // " · Cartão A" na linha de base
}): { entradas: IndicadorPronto; saidas: IndicadorPronto; quarto: IndicadorPronto };
```

Os textos de "meu" em competência e em caixa são **exatamente** os que o painel tem hoje: rótulo, dica, linha de
base e `detalheComValor` (copiar do cliente para a função, e apagar no cliente).

Terceiros e Consolidado usam os textos da prévia (§4 do desenho):
- **Terceiros:** "Entradas de terceiros", "Saídas de terceiros" e "Pendente de terceiros até DD/MM".
- **Consolidado:** "Entradas (bruto)" e "Saídas (bruto)", com `detalheComValor` "minha R$ X · de terceiros R$ Y", e
  "Pendente de terceiros até DD/MM".

Na base caixa, aplica-se a D-A2-21: um valor que o caixa não traz é `{naoSegue: "não segue a responsabilidade na
base caixa"}`.

`comparacao` só é preenchida em "meu" (D-A2-22). Fora de "meu", o texto vem com `pct: null` e "sem comparação neste
recorte".

- [ ] **Step 1: testes vermelhos.**
  - `painel.test.ts`:
    - `indicadoresDoResumo({resp:"meu", base:"competencia", …})` devolve `valor` igual a
      `formatCurrency(resumo.entradasMeu)`, `formatCurrency(resumo.meu)` e `formatCurrency(resumo.terceiros)`, e
      as linhas de base atuais do painel;
    - em "consolidado", nenhum `rotulo` nem `linhaDeBase` contém "Minhas" nem "meu gasto";
    - em caixa + "terceiros", `entradas.valor` é `{naoSegue}`;
    - fora de "meu", `comparacao` tem `pct: null`.
  - `conciliacao-relatorio-painel.test.ts`, com fixture sintética que inclui um estorno de cartão, um pendente e um
    perdoado:
    - o caminho do painel e o do relatório sem recorte, em "meu", nas duas bases (a base caixa com um
      `EstadoDoCaixa` sintético `ok`), dão os mesmos três `IndicadorPronto.valor`;
    - a barra do mês igual a `resumo.meu`;
    - `Σ fatias(meu) − estornos + soma de foraDaRosca === resumo.meu`, centavo a centavo.

    O caminho do painel é `resumoMes` + `indicadoresDoResumo`. O do relatório é `montarRelatorioFinanceiro` (T7):
    escreva o teste agora com `it.todo` para a metade do relatório e preencha na T7.
  - Review Focus 3: `comparacaoDosIndicadores({futuro: true})` passado a `indicadoresDoResumo` mantém o sentido
    `"neutro"`.
- [ ] **Step 2:** `npx vitest run src/lib/finance/painel.test.ts`. Esperado: FAIL.
- [ ] **Step 3:** implementar `indicadoresDoResumo` e trocar, no cliente do painel, os blocos `entradasIndView`,
  `saidasInd` e `terceirosInd` pela chamada (`resp: "meu"`).
- [ ] **Step 4:** testes verdes. **Sem editar** `painel-inventario.test.ts`, `painel-links.test.ts`,
  `painel-conciliacao.test.ts` nem `leituras-do-painel.test.ts`, que têm de continuar verdes como estão. Se algum
  exigir edição, pare e registre no §13.4 do desenho com o motivo.
- [ ] **Step 5: mutação.** Trocar `entradasMeu` por `entradas` em "meu" derruba a conciliação e o
  `entradas-do-card.test.ts` (K1). Restaurar.
- [ ] **Step 6: commit.** `refactor(redesign): 04-A2 T4 - indicadores do resumo compartilhados com o painel`.

### Task 5: as peças da 04-A (L3) e o estado "não segue"

**Files:**
- Modify: `src/components/shared/painel/indicador.tsx`:
  - a dica vira `<details>`/`<summary>`;
  - o "valor oculto" fica acessível;
  - `valor` aceita `{naoSegue: string}`.
- Modify: `src/lib/painel/bloco.ts`: `EstadoDoBloco` ganha `"nao-segue"`.
- Modify: `src/components/shared/painel/bloco.tsx`: o desenho do `nao-segue`, com o motivo e um link "Ver sem o
  filtro" (`naoSegue?: { frase: string; hrefSemFiltro: string }`).
- Modify: `src/components/dashboard/barras-entradas-saidas-chart.tsx` e `-impl.tsx`:
  - a legenda "parcial" só aparece com dado;
  - nova prop `series?: "ambas" | "saidas"`.
- Test: `src/components/shared/painel/painel.test.ts` e `src/components/dashboard/graficos-do-painel.test.ts`, que
  já existem e varrem a fonte.

**Interfaces:**
- Produces: `Indicador` com `valor: string | {erro} | {naoSegue}`; `Bloco` com `estado: "conteudo"|"vazio"|"falha"|"nao-segue"` e `naoSegue`; `BarrasEntradasSaidasChart` com `series`.

- [ ] **Step 1: testes vermelhos.** Varreduras da fonte, sem comentários, como em `painel.test.ts`:
  - `indicador.tsx`:
    - contém `<details` e `<summary`;
    - não usa `title={dica}`;
    - continua **sem** `"use client"`;
    - contém o texto `valor oculto`, fora de `aria-hidden`, dentro do ramo `group-data-[ocultar=true]/olho`;
    - trata `naoSegue`.
  - `bloco.ts`: `EstadoDoBloco` tem os quatro valores.
  - `bloco.tsx`: o ramo `nao-segue` não reusa o ícone `Inbox` (vazio) nem o `AlertTriangle` (falha), porque são
    três desenhos distintos.
  - Na fachada das barras, a condição da legenda exige dado e parcial (`dados.length > 0 &&`, ou a verificação de
    vazio que o `-impl` usa).
  - `-impl`: com `series="saidas"`, a `<Bar` de entradas não é renderizada.
- [ ] **Step 2:** `npx vitest run src/components`. Esperado: FAIL.
- [ ] **Step 3:** implementar.
  - O `<details>` da dica é posicionado com `relative` no rótulo, como na prévia.
  - O "R$ ••••" continua `aria-hidden`, com um `<span class="sr-only">valor oculto</span>` irmão, visível só com o olho fechado.
  - Nenhum `"use client"` novo.
- [ ] **Step 4:** testes verdes, `npx tsc --noEmit` (o `switch` de `EstadoDoBloco` que não for exaustivo aparece aqui).
- [ ] **Step 5: mutação.** Voltar a dica para `title` derruba a varredura. Restaurar.
- [ ] **Step 6: commit.** `feat(redesign): 04-A2 T5 - pecas da 04-A acessiveis e o estado nao segue`.

### Task 6: RR-C2-10 — o botão "marcadas" de Lançamentos (D-A2-5)

**Files:**
- Modify: `src/app/(app)/financeiro/lancamentos/transaction-filters.tsx:~150`.
- Test: `src/app/(app)/financeiro/lancamentos/page.test.ts`, que já existe, ou o teste mais próximo que varre esse arquivo.

- [ ] **Step 1: teste vermelho.** A fonte não contém `"secondary" : "outline"` no botão "marcadas". O ligado usa
  `variant="default"` e renderiza o ✓ (o mesmo traço SVG da `MarcaDeAtiva` do seletor, **importado**: exporte
  `MarcaDeAtiva` de `seletor-de-visao.tsx` em vez de copiar). `aria-pressed` continua.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** implementar.
- [ ] **Step 4:** PASS, e `npx vitest run src/components/shared` (o seletor continua verde).
- [ ] **Step 5: commit.** `fix(redesign): 04-A2 T6 - RR-C2-10 filtro ligado distinguivel no escuro`.

### Task 7: a leitura e o modelo de vista do relatório (D-A2-12, D-A2-19, D-A2-23)

**Files:**
- Modify: `src/lib/finance/queries.ts`: `lerSaldoAte(dataExclusiva: string, contaId?: string | null)`. O padrão
  `null` mantém o comportamento.
- Create: `src/lib/reports/financeiro.ts`: o modelo de vista **puro** da aba.
- Modify: `src/lib/reports/queries.ts`:
  - `getFinanceAndCardReport` passa a ler com `ESCOPO_PAINEL`;
  - lê `lerSaldoAte` e as listas dos `<select>`;
  - recebe `{ resp, sp }`;
  - chama `montarRelatorioFinanceiro`.

  `CardReport` (a aba Cartões) não muda.
- Modify: `src/lib/finance/leituras-que-engolem-erro.test.ts`, se o inventário exigir declarar a leitura reusada.
- Test: `src/lib/reports/financeiro.test.ts`, e completar o `it.todo` da T4.

**Interfaces:**
- Consumes: T2 (`recorteDaUrl`, `recortarEntradas`, `recortarPorCategoria`, `recortarRecebiveisCrus`, `naoSegue`),
  T3, T4 (`indicadoresDoResumo`), `aReceberPorPessoa`, `totalPendenteAte`, `saldoComData`, `foraDaRosca`,
  `estornosDoCartaoNoMes`, `dadosDasBarras`.
- Produces:

```ts
export type OpcoesDoFiltro = { id: string; nome: string }[];
export type RelatorioFinanceiro = {
  completude: CompletudeFinanceira;
  filtros: { mes: string; base: BaseFinanceira; resp: Responsabilidade; recorte: Recorte;
             opcoes: { contas: OpcoesDoFiltro; cartoes: OpcoesDoFiltro; pessoas: OpcoesDoFiltro; categorias: OpcoesDoFiltro } };
  saldo: IndicadorPronto & { href: string };
  indicadores: { entradas: IndicadorPronto; saidas: IndicadorPronto; quarto: IndicadorPronto };
  blocos: Record<Exclude<BlocoDoRelatorio, "saldo" | "entradas" | "saidas" | "terceiros" | "pendente" | "setas">,
    { naoSegue: { tipo: TipoDeRecorte; motivo: string } | null }>;
  barras: (EvolucaoPonto & { parcial: boolean })[]; seriesDasBarras: "ambas" | "saidas";
  mesAMes: MesAMesDados;
  rosca: { categorias: CategoriaSlice[]; estornos: number };   // já na responsabilidade (fatiasDaResponsabilidade)
  formas: FormaSlice[];
  ancora: { meu: number; bruto: number; terceiros: number; perdoado: number; pendenteDoMes: number } | null;
  maiores: CategoriaSlice[]; assinaturas: { nome: string; valor: number; frequency: Frequency }[];
  projecao: ProjecaoPonto[]; faturasFuturas: FaturaDoMes[];
  caixa: EstadoDoCaixa | null;
};
export function montarRelatorioFinanceiro(p: {
  mes: string; hoje: string; base: BaseFinanceira; resp: Responsabilidade; recorte: Recorte;
  entradas: EntradasDoMotorDoRelatorio; recebiveisCrus: readonly (RecebivelComRecebimentos & { person_id: string | null; card_id: string | null; person: { id: string; nome: string } | null })[];
  contas: AccountWithBalance[]; recorrenciasCruas: LeituraFinanceira<typeof ESCOPO_PAINEL>["recorrencias"]; // as cruas de hoje (description, category) saldoAte: number | null;
  caixa: EstadoDoCaixa | null; janela: { evoMeses: string[]; projMeses: string[] };
  opcoes: RelatorioFinanceiro["filtros"]["opcoes"];
}): RelatorioFinanceiro;
```

Regras da montagem, todas pela §5 e pelas D-A2:
- O saldo usa `saldoComData`.
  - Com o recorte de conta, `saldoDaView` = o `balance` daquela conta, e `saldoAte` vem de `lerSaldoAte(…, contaId)`.
  - Com cartão, pessoa ou categoria, o valor é `{naoSegue}`.
- Os indicadores vêm de `indicadoresDoResumo`.
  - Para categoria, o `resumo` é montado com a fatia (`meu`, `movimentado`, `movimentado − meu`) e as `entradas` de
    `recortarPorCategoria`.
  - O bruto ganha `detalheComValor` "estornos não têm categoria e ficam fora".
  - Para pessoa, entradas e saídas são `{naoSegue}`. O quarto indicador é o pendente dela.
- As setas só aparecem em "meu" e sem recorte.
- O pendente usa `totalPendenteAte` e `aReceberPorPessoa` sobre `recortarRecebiveisCrus`, e `rotuloTotalPendenteAte(hoje)`.
- Na base caixa, todo bloco de caixa com recorte é ✗ (D-A2-6).

- [ ] **Step 1: testes vermelhos** (`financeiro.test.ts`, com a fixture da T2):
  - sem recorte, em "meu":
    - os valores iguais aos do painel (completar a conciliação da T4 trocando `it.todo` por `it`);
    - `barras` igual a `dadosDasBarras(evolucaoMensal(...), mesAtual)`.
  - Com o recorte de cartão:
    - `indicadores.entradas.valor` tem `naoSegue`;
    - `seriesDasBarras === "saidas"`;
    - `blocos.projecao.naoSegue !== null`;
    - `faturasFuturas` só do Cartão A.
  - Com o recorte de categoria:
    - `saidas.valor === formatCurrency(fatia.meu)`;
    - `blocos.barras.naoSegue`, `blocos.mesAMes.naoSegue` e `blocos.ancora.naoSegue` não nulos (L4);
    - `ancora === null`.
  - Com o recorte de pessoa:
    - o quarto indicador é igual ao `pendente` da linha dela em `aReceberPorPessoa` sem recorte;
    - `entradas` e `saidas` são `naoSegue` (L5).
  - Com o recorte de conta e `saldoAte: null`: `saldo.valor` é `{erro: "Não foi possível ler o saldo"}` e
    `detalheComValor === null` (Review Focus 5).
  - `completude` parcial com qualquer recorte: chega intacta ao modelo (Review Focus 4).
  - Em "consolidado": `rosca.categorias[i].valor === movimentado`. Em "terceiros": `formas` em `movimentado − meu`.
  - Nenhuma chave do modelo contém um número onde o bloco é ✗: varrer `blocos` e conferir, para cada ✗, que o dado
    correspondente é `null` ou vazio.
- [ ] **Step 2:** `npx vitest run src/lib/reports/financeiro.test.ts src/lib/finance/conciliacao-relatorio-painel.test.ts`.
  Esperado: FAIL.
- [ ] **Step 3:** implementar `montarRelatorioFinanceiro` e ligar `getFinanceAndCardReport`.
  - Opções: contas e cartões do próprio `lerFinanceiro` (`contas`, `cards`), pessoas de `getPeopleForSelect()`,
    categorias de `getCategories()` (só `type === "despesa"` ou `"receita"`, as duas; o nome vem da linha).
  - `recorteDaUrl` recebe os ids dessas listas.
  - A assinatura de `getReportsData(mesSel, base)` passa a ser `getReportsData(mesSel, base, filtros: { resp: Responsabilidade; sp: Record<string, string | string[] | undefined> })`.
- [ ] **Step 4:** testes verdes. Depois `npx vitest run src/lib/finance src/lib/reports` e `TZ=UTC` nos mesmos.
- [ ] **Step 5: mutações:**
  - (a) com o recorte de categoria, usar `resumoMes(...).meu` sobre as entradas inteiras derruba o teste da fatia;
  - (b) com o recorte de pessoa, mostrar `resumo.terceiros` derruba o teste L5;
  - (c) `lerSaldoAte` ignorar `contaId` derruba o teste de conta.

  Restaurar.
- [ ] **Step 6: commit.** `feat(redesign): 04-A2 T7 - leitura e modelo de vista do relatorio financeiro`.

### Task 8: a barra de filtros (D-A2-1..4)

**Files:**
- Create: `src/lib/reports/url-do-relatorio.ts`, puro.
- Create: `src/components/reports/barra-de-filtros.tsx` (`"use client"`).
- Test: `src/lib/reports/url-do-relatorio.test.ts`.

**Interfaces:**
- Produces:

```ts
export function urlDoRelatorio(p: { mes: string; base: BaseFinanceira; resp: Responsabilidade; recorte: Recorte }): string;
// omite o padrão: base competência, resp "meu", recortes nulos; ordem fixa mes, base, resp, conta, cartao, pessoa, categoria
export function comRecorte(atual: Recorte, tipo: TipoDeRecorte, id: string | null): Recorte; // conta ↔ cartão se excluem
export function semFiltros(mes: string): string; // "/relatorios?mes=…"
```

`BarraDeFiltros({ filtros }: { filtros: RelatorioFinanceiro["filtros"] })`:
- o período (`<input type="month">`, como hoje);
- dois `SeletorDeVisao` (base e responsabilidade);
- os quatro `<select>` nativos, com `id`/`htmlFor`. O ligado tem borda primária;
- os chips com × e "Limpar filtros";
- no celular, os recortes ficam em `<details>` "Mais filtros (n)". Do `sm` para cima ficam sempre abertos: usar
  `sm:` para mostrar o conteúdo e esconder o `summary`, e iniciar `open` no servidor quando `n > 0`;
- a navegação usa `router.replace(urlDoRelatorio(...))`, e o período usa `router.push`, como hoje.

- [ ] **Step 1: testes vermelhos:**
  - `urlDoRelatorio`: o padrão dá `/relatorios?mes=2026-11`; a ordem dos parâmetros é a fixa; nenhum `resp=meu` nem
    `base=competencia`.
  - `comRecorte`: escolher a conta zera o cartão e vice-versa; os outros dois ficam.
  - `semFiltros` mantém só o `mes`.
  - Varredura de `barra-de-filtros.tsx`:
    - não usa `value={` ligado a parâmetro de texto (não há campo de texto);
    - usa `SeletorDeVisao` duas vezes;
    - tem os quatro `htmlFor`.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** implementar.
- [ ] **Step 4:** PASS.
- [ ] **Step 5: commit.** `feat(redesign): 04-A2 T8 - barra de filtros do relatorio`.

### Task 9: a aba Financeiro na sequência do desenho (§4) e o inventário

**Files:**
- Modify: `src/app/(app)/relatorios/page.tsx`:
  - lê `resp` e os recortes;
  - lê o cookie do olho (`COOKIE_DO_OLHO`, `valoresOcultos`);
  - passa `RelatorioFinanceiro` ao cliente.
- Modify: `src/app/(app)/relatorios/relatorios-client.tsx`: a aba Financeiro reescrita. As abas Cartões, Hábitos,
  Estudos e Tarefas **intactas**.
- Create: `src/app/(app)/relatorios/relatorio-inventario.test.ts`.
- Modify: `src/lib/finance/entradas-do-card.test.ts` (L2, §7 do desenho).

A aba, nesta ordem:
- `BarraDeFiltros`;
- a faixa "parcial" (a mesma do painel: extraia-a para `src/components/financeiro/aviso-parcial.tsx` e use-a nos
  dois lugares; o painel passa a importá-la);
- **Resumo**: `OlhoDosValores` + quatro `Indicador`, com `BotaoDoOlho` no saldo, e `BlocoDoCaixa` na base caixa;
- **Evolução**: `Bloco` com `BarrasEntradasSaidasChart` (`series`) e `Bloco` com `MesAMesChart`;
- **Composição**: `Bloco` com `RoscaCategoriasChart` e `Bloco` com `FormaPagamentoChart`;
- **Detalhamento**: `Bloco` meu × bruto × terceiros (`fraseDoPerdoado`, `rotuloPendenteDoMes`), "Maiores gastos por
  categoria" (a lista de hoje + `ExportBar` CSV) e "Assinaturas e recorrências" (a lista de hoje);
- **Projeções**: `ProjecaoChart` e `FaturasChart`.

Cada bloco com recorte ativo:
- quando segue, ganha o selo "filtrado: <nome>" no `acao`;
- quando não segue, recebe `estado="nao-segue"` com o motivo e `hrefSemFiltro = urlDoRelatorio({...filtros, recorte: SEM_RECORTE})`.

Os títulos de seção (Resumo · Evolução · Composição · Detalhamento · Projeções) são `<h2>`.

- [ ] **Step 1: testes vermelhos.**
  - `relatorio-inventario.test.ts`, varrendo a fonte sem comentários:
    - os 15 itens do §2 do desenho, ou o substituto declarado na tabela "antes → depois";
    - as cinco seções na ordem (o índice de cada `<h2>` é crescente);
    - os imports `@/components/shared/painel/indicador`, `bloco` e `olho-dos-valores`, e
      `barras-entradas-saidas-chart` e `rosca-categorias-chart` (reuso, nunca cópia: nenhum arquivo novo em
      `src/components/` que defina `function Indicador` ou `function Bloco`);
    - nenhum `BannerDeBoasVindas`;
    - nenhum `StatCard` na aba Financeiro;
    - as abas `cartoes`, `habitos`, `estudos` e `tarefas` continuam (os quatro `TabsTrigger`).
  - `entradas-do-card.test.ts`:
    - o `it.each` passa a ter só `src/components/dashboard/general/finance-card.tsx`;
    - um `it` novo afirma que `relatorios-client.tsx` **não** contém `apresentarEntradas(` e que
      `src/lib/reports/financeiro.ts` contém `indicadoresDoResumo(`;
    - o teste K1 aceita `indicadorMinhasEntradas(` em `page.tsx` **ou** em `painel.ts` (dentro de
      `indicadoresDoResumo`), conforme a T4 deixou.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** implementar.
- [ ] **Step 4:** a suíte inteira, `npm run test:run`. Esperado: verde. Também `npm run lint` e `npx tsc --noEmit`.
- [ ] **Step 5:** `npm run build && npm run perf:bundle`. Esperado: `/relatorios` dentro do teto e nenhuma rota
  estourada. Registre o número de `/relatorios` antes (da linha de base) e depois.
- [ ] **Step 6: commit.** `feat(redesign): 04-A2 T9 - aba Financeiro do relatorio com as pecas da 04-A`.

### Task 10: conferência, revisão final e §13

- [ ] **Step 1: banco.** Rodar a mesma consulta de md5 dos saldos da 04-A (via MCP `execute_sql`, só leitura).
  Esperado: `15d93bd1c1d3e55a40db6210dff0eb3b`.
- [ ] **Step 2: conferência visual.**
  - **Pedir ao dono** o aval para copiar o `.env.local` do diretório principal para a worktree (ignorado pelo git).
  - Com o aval: `npm run dev` e abrir no Chrome do dono `/relatorios` a 390, 768, 1280 e 1440 px, claro e escuro.
  - Se aparecer a tela de login: **parar e pedir ao dono que entre**.
  - Conferir:
    - sem recorte;
    - cada um dos quatro recortes;
    - Terceiros e Consolidado;
    - a base caixa;
    - o olho fechado;
    - a dica (i) por toque e por teclado;
    - nenhuma rolagem horizontal e nenhum valor cortado.
  - Conferir também o painel (`/dashboard/financeiro`), por causa de L3 e T4, e o botão "marcadas" em Lançamentos
    no escuro.
  - Depois: `git checkout -- AGENTS.md`.
- [ ] **Step 3: revisão final da branch inteira** (`git diff 9342fbb..HEAD`), por um revisor independente no modelo
  mais capaz, que recebe o código e o desenho, **não** as conclusões. Para cada achado: um teste vermelho antes, o
  conserto e um commit `fix(redesign): 04-A2 R<n> - …`.
- [ ] **Step 4:** os cinco comandos e `TZ=UTC npx vitest run src/lib/finance src/lib/reports`.
- [ ] **Step 5:** preencher o §13 do desenho:
  - 13.1, commits;
  - 13.2, os cinco comandos;
  - 13.3, o aceite do §9 um a um;
  - 13.4, as decisões tomadas na execução, com o custo se estiverem erradas;
  - 13.5, os achados não consertados;
  - 13.6, as pendências.

  Sem "zero bugs".
- [ ] **Step 6: commit.** `docs(redesign): 04-A2 resultado da execucao (secao 13)`. **Parar**: a integração em
  `feat/redesign-00-auditoria` é a pedido do dono.
