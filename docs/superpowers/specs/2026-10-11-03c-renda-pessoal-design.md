# Design — REDESIGN-03-C: renda pessoal × movimentação de terceiros (E2/E3)

> Desenhado com o dono em **2026-10-11**, antes de qualquer linha de código. Escopo declarado em
> `docs/redesign/PLANO.md` (linha 65) e em `METRICAS-FINANCEIRAS.md` §10 (E2/E3) e §11 (D7, D8,
> D10).
>
> **Base:** `6c8aeab`, ponta de `feat/redesign-00-auditoria` com a 03-B2 integrada
> (`git merge-base --is-ancestor 3804875 feat/redesign-00-auditoria` = 0). A primeira conferência,
> no início da sessão, deu 1 (a branch ainda estava em `704dc66`); o desenho foi feito sem branch
> e só entrou no repositório depois que a frente principal integrou a 03-B2. A branch
> `feat/redesign-03c-renda-pessoal` parte de `6c8aeab`.
>
> Depois de aprovado, este documento é o contrato: quem discordar de algo aqui para e reporta.

---

## 1. O que a 03-C muda de natureza

Até aqui, "receita" era sinônimo de "renda". O sistema não tinha como dizer que um dinheiro
entrou na conta do dono mas não é dele: `resumoMes` soma `amount` cheio de toda receita, e o
formulário e a edição **forçam** `classificacao = 'pessoal'` fora de despesa
(`finance/services.ts:111-121`, `actions/transactions.ts:155-160`).

A 03-C dá a cada receita uma **responsabilidade gravada no ato** — não deduzida da categoria
(D8), não reescrita depois — e o motor passa a repartir a entrada como já reparte a saída.

⛔ **Nada é reclassificado sozinho (D10).** Com o dado de hoje, todo número continua igual
depois da 03-C. Ele só muda quando o dono reclassificar uma receita, uma a uma, pela tela.

⛔ **Reembolso não é receita de terceiro.** Ligar receita a recebível é da 03-D (E1/E4). A 03-C
só permite que o dono diga "este dinheiro não é meu"; o vínculo com o recebível não existe aqui.

---

## 2. Linha de base

### 2.1 Banco — medido em 2026-10-11, só leitura

Contagem por `count: "exact", head: true` (nenhuma linha trazida, nenhum valor):

| Recorte | Contagem |
| --- | --- |
| Receitas | **48** |
| … `classificacao = 'pessoal'` | 48 |
| … `classificacao = 'terceiro'` | 0 |
| … `classificacao = 'compartilhada'` | 0 |
| … `valor_pessoal` não nulo | **0** |
| … com `card_id` (estorno de cartão, fora de `entradas`) | 3 |

Igual a 2026-09-20. **Consequência:** o efeito numérico de toda a 03-C, inclusive da B1, é
**zero** com o dado de hoje. A contagem é repetida no fim (§10) e tem de dar o mesmo resultado.

### 2.2 Os cinco comandos — medidos em 2026-10-11, na ponta `6c8aeab`, antes de tocar em nada

| Comando | Resultado |
| --- | --- |
| `npm run test:run` | **201 arquivos / 4.099 testes**, 15,6 s |
| `npm run lint` | limpo |
| `npx tsc --noEmit` | limpo |
| `npm run build` | ok |
| `npm run perf:bundle` | mediana **214,2 KB** · 68 rotas · 1 com teto próprio |

As cinco rotas que esta subfase toca (gzip, primeiro carregamento, pelo mesmo medidor fora do
repositório que a 03-B2 usou — `page_client-reference-manifest.js` → chunks → gzip —, porque o
`perf:bundle` só imprime as dez maiores):

| Rota | KB |
| --- | --- |
| `/(app)/financeiro/lancamentos` | 218,7 |
| `/(app)/dashboard/financeiro` | 201,0 |
| `/(app)/dashboard` | 203,8 |
| `/(app)/relatorios` | 204,1 |
| `/(app)/financeiro` | 195,9 |

⚠️ `transaction-form.tsx` **não** é carregado sob demanda (`transactions-client.tsx:20` o importa
direto). Tudo que a A3 acrescentar pesa no primeiro carregamento de `/financeiro/lancamentos`.

---

## 3. As decisões desta sessão

| # | Decisão | Por quê |
| --- | --- | --- |
| **C0** | **Briefing + três refinamentos.** Receita não usa a máquina de divisão (sem pessoa, sem recebível). `pessoal` → `valor_pessoal` nulo; `terceiro` → `0`; `compartilhada` → minha parte informada, `0 < parte < valor`; editar o valor **recusa** se a parte ficar ≥ o novo valor. Refinamentos: **(a)** a receita usa **chaves próprias** no payload (`receita_classificacao`, `receita_minha_parte`); **(b)** "minha parte" só é aceita na compartilhada; **(c)** sair de receita para outro tipo zera as duas colunas | (a) A importação **já manda** `classificacao` em receita sem querer (§5.2, fato F2); (c) sem isso, receita `terceiro` editada para despesa pessoal ficaria com `valor_pessoal = 0` e sumiria do "meu" (fato F3) |
| **B1** | **Espelhar o card de Saídas.** O número principal continua `entradas` bruto, a tendência continua bruto × bruto, e a dica ganha "minha R$ Y · de terceiros R$ X" quando houver entrada de terceiros | Nos três cards, Entradas fica ao lado de Saídas, que mostra **bruto** no número e "meu" na dica. Pôr a renda pessoal no número formaria o par *renda pessoal ↔ despesa bruta*, cuja subtração o §13.3 proíbe |
| **B2** | **Não nesta subfase.** `saldo` de `evolucaoMensal` continua bruto − bruto, declarado | O Resultado do §13.3 usa a minha parte **efetiva**, que depende do perdoado (D11, 03-D). Trocar um lado só misturaria as bases — e com a B1 cards e gráfico continuam todos brutos de manchete |
| **A2(b)** | **Reordenar a edição só quando o alvo é receita:** `reapplySplit` roda **antes** do `update` | Hoje a recusa por recebível cobrado/pago acontece **depois** de o lançamento já ter sido gravado (fato F4). Com a A4, a linha pela metade passaria a ser lida como renda parcial |

### 3.1 Os fatos que o desenho responde

| # | Fato (lido no código em 2026-10-11) | Onde |
| --- | --- | --- |
| F1 | `splitSchema` é lido do **mesmo** payload cru da transação e recusa `terceiro`/`compartilhada` sem pessoa | `validators/split.ts:56-77`, `services.ts:112` |
| F2 | Mudar o tipo de uma linha da importação de despesa para receita **não limpa** `classificacao`/`split_parts`; o commit os repassa a `createTransaction` | `actions/imports.ts:522`, `:733-740`, `:843-855` |
| F3 | Receita `terceiro` → despesa pessoal: sem divisão gravada nem a gravar, `decidirReaplicacao` responde `nada`, e nada zera as colunas | `split.ts:233`, `split-reapply.ts:123` |
| F4 | `updateTransaction` grava o lançamento (linha 121) **antes** de `reapplySplit` (linha 152); um `bloqueado` devolve erro com o tipo já trocado | `actions/transactions.ts:121-164` |
| F5 | O bloco 7 da caracterização (categoria) só tem **despesa** na fixture: ler a categoria para repartir *receita* não o derruba | `dashboard-caracterizacao.test.ts:790-887` |
| F6 | Não existe teste de `criarTransacao`, `updateTransaction` nem `reapplySplit` | busca por nome em `*.test.ts` |
| F7 | O formulário pré-preenche o campo de divisão **da despesa** com a `classificacao` de qualquer linha (`defaults`, linha 122) e chama `getTransactionSplit` para qualquer não-pessoal (linha 172) | `transaction-form.tsx` |
| F8 | O motor já lê `valor_pessoal` de toda linha (`LinhaTx`, `pipeline.ts:71,286`); só o motor e a lista o leem fora do caminho de gravação | busca por `valor_pessoal` |
| F9 | O banco só restringe os **valores** de `classificacao` (CHECK); nada amarra `classificacao` a `valor_pessoal` | `20260625150300_transactions_split_columns.sql` |

---

## 4. O mapa

| Origem | Item | Muda número? |
| --- | --- | --- |
| E2: receita não aceita `classificacao`/`valor_pessoal` | **A1** regra pura · **A2** gravação e edição | não (D10) |
| D10: a tela não oferece reclassificar | **A3** formulário de criar e editar receita | não |
| E3: `ResumoMes` não reparte a entrada | **A4** `entradasMeu` / `entradasTerceiros` | não (campos novos) |
| Retornos e IA não carregam a separação | **A5** | não (campos novos) |
| P0-1: o card de "Entradas" não distingue renda de terceiros | **B1** — a dica, não o número | **sim**, na dica, só com receita reclassificada |
| `saldo = entradas − saidas` | **B2** — recusada | não (divergência declarada) |

---

## 5. Parte A — fecha sem mover número

### 5.1 A1 · A regra pura da responsabilidade da receita

**Onde.** Arquivo novo `src/lib/finance/responsabilidade-da-receita.ts`, ao lado do núcleo da
divisão. **Sem `zod`, sem `server-only`**: a tela importa a mesma função para a prévia
(§5.3) — quem PREVÊ usa o mesmo motor de quem GRAVA. Não toca `decidirReaplicacao` nem
`reapplySplit`: a divisão de despesa continua com um núcleo só.

**A forma.**

```ts
export type ResponsabilidadeDaReceita =
  | { readonly classificacao: "pessoal"; readonly valorPessoalCentavos: null }
  | { readonly classificacao: "terceiro"; readonly valorPessoalCentavos: 0 }
  | { readonly classificacao: "compartilhada"; readonly valorPessoalCentavos: number };

export type DecisaoDaReceita =
  | { readonly ok: true; readonly responsabilidade: ResponsabilidadeDaReceita;
      readonly terceirosCentavos: number }
  | { readonly ok: false; readonly campo: "receita_minha_parte"; readonly mensagem: string };

export function decidirResponsabilidadeDaReceita(args: {
  classificacao: Classificacao;
  minhaParteCentavos: number | null;
  valorCentavos: number;
}): DecisaoDaReceita;

/** O ÚNICO ponto que converte para as colunas (reais). Criar e editar chamam esta. */
export function colunasDaReceita(r: ResponsabilidadeDaReceita): {
  classificacao: Classificacao;
  valor_pessoal: number | null;
};
```

**As regras.**

| Entrada | Saída |
| --- | --- |
| `pessoal`, parte ausente | `{ pessoal, null }`, terceiros = 0 |
| `terceiro`, parte ausente | `{ terceiro, 0 }`, terceiros = valor |
| `compartilhada`, `0 < parte < valor` | `{ compartilhada, parte }`, terceiros = valor − parte |
| `pessoal` ou `terceiro` **com** parte (inclusive 0) | erro: a minha parte só vale para entrada compartilhada |
| `compartilhada` sem parte | erro: informe a sua parte |
| `compartilhada` com parte ≤ 0 | erro: se nada é seu, marque como de terceiro |
| `compartilhada` com parte ≥ valor | erro: se tudo é seu, marque como pessoal |

Toda aritmética em centavos inteiros. O erro sempre nomeia `receita_minha_parte`, o campo que
existe na tela.

**A combinação incoerente é irrepresentável na saída**, e isso é travado de dois jeitos:

- **por tipo:** `@ts-expect-error` no teste para `{ terceiro, null }` e `{ pessoal, 1000 }`;
- **em runtime:** um teste para cada linha da tabela acima.

**O schema.** `receitaResponsabilidadeSchema` em `validators/split.ts`, ao lado do
`splitSchema` (mesmo padrão: segundo schema lido do mesmo objeto cru, e o `optionalMoney` que
ele usa já mora ali):

- `receita_classificacao`: enum, ausente/nulo → `pessoal`;
- `receita_minha_parte`: dinheiro opcional, `""`/ausente/**`null`** → `undefined`.

**Sem refine.** Quem decide a coerência é a A1, num lugar só; o schema só traduz a forma. Entra
em `validators/round-trip.test.ts` (o schema aceita a própria saída).

### 5.2 A2 · O caminho de gravação

**Criar** (`criarTransacao`):

- `type = 'receita'` → `receitaResponsabilidadeSchema` + A1 **antes** do insert. Se a A1
  recusar, devolve `{ fieldErrors: { receita_minha_parte: [mensagem] } }` e nada é gravado. O
  insert leva `colunasDaReceita(...)`.
- `type = 'despesa'`: **byte a byte como hoje** (`splitSchema`, `isShared`, `applySplit`).
- O `splitSchema` continua sendo lido para todo tipo não-transferência, como hoje. Em receita o
  resultado dele continua ignorado — e é isso, somado às chaves próprias, que torna o F2
  inofensivo.

**Editar** (`updateTransaction`), na ordem:

1. `transactionSchema` (como hoje).
2. O `select` do existente ganha `type`.
3. **Alvo receita:** schema + A1 **antes de qualquer escrita** — inclusive antes do passo 4,
   que apaga. Se recusar → `invalid(...)`.
   ⚠️ *Corrigido depois da auditoria do módulo (2026-10-11, achado P2):* a primeira versão
   deste desenho punha a transferência antes da A1. Uma transferência editada para receita
   compartilhada sem parte era apagada e só então recusada; sendo o pagamento de uma fatura, a
   fatura ficava "paga" apontando para o nada.
4. Transferência (era ou vira): remove e recria, como hoje. A receita recriada passa pelo
   `criarTransacao` acima, que decide de novo e chega no mesmo lugar.
5. **Alvo receita, existente não parcelado — A2(b):** `reapplySplit` com `pessoal` e
   `parts: []`, **antes** do `update`. Desfechos: `nada`, `limpar` (a despesa compartilhada que
   vira receita perde divisão e recebíveis, pelo caminho de hoje) ou `bloqueado` → erro, **e
   nada foi gravado**.
6. `update` do lançamento, como hoje, mais:
   - alvo receita: `colunasDaReceita(...)`;
   - existente receita e alvo **não** receita: `classificacao: 'pessoal'`,
     `valor_pessoal: null` (refinamento C0(c), fato F3).
7. **Alvo não receita, existente não parcelado:** `reapplySplit` como hoje, com uma diferença:
   `classificacaoAtual` = `'pessoal'` quando o existente era receita (as colunas acabaram de
   ser zeradas no passo 6).

Despesa → despesa: mesma ordem, mesmos argumentos de hoje.

**Os caminhos que continuam `pessoal`, sem mudar uma linha** — nenhum manda `receita_*`:

| Caminho | Como grava receita |
| --- | --- |
| Ferramenta de escrita da IA (`finance.lancar_transacao` → `lancarTransacao`) | `classificacao: "pessoal"` fixo; equivalência do command continua verde |
| Comprovante da IA (18-D) | pelo mesmo command |
| Registro rápido (`quick-add.tsx`) | `createTransaction` sem campo de responsabilidade |
| Importação | `createTransaction`; pode mandar `classificacao` em receita (F2), que continua ignorada |
| Estorno de cartão (`createCardEstorno`) | insert direto, default do banco |
| Recorrência / contas fixas (`generation.ts`, `bills.ts`) | insert direto, default do banco |

⛔ Nenhum `update` em lote e nenhum SQL de reclassificação (D10).

**Testes — harness novo** (fato F6), com cliente Supabase em memória que registra cada
`insert`/`update`/`delete` e responde `select` de uma fixture. Reaproveita o harness do Cron da
03-B2 se ele couber; senão, nasce em `src/lib/finance/test-utils/`.

- `src/lib/finance/services.test.ts` (`criarTransacao`):
  - receita `pessoal`/`terceiro`/`compartilhada` → colunas certas no insert;
  - recusa da A1 → nenhum insert e `fieldErrors.receita_minha_parte`;
  - **payload da importação** (receita com `classificacao: 'compartilhada'` + `parts`, sem
    `receita_*`) → grava `pessoal`/`null`;
  - despesa compartilhada → `applySplit` chamado como hoje.
- `src/lib/actions/transactions.test.ts` (`updateTransaction`, `authContext` e `next/cache`
  mockados, `reapplySplit` **real**):
  - receita → receita reclassificada;
  - despesa compartilhada → receita: recebíveis e partes apagados (`limpar`);
  - o mesmo com recebível `cobrado` (e `pago`) → erro **e nenhuma escrita em `transactions`**;
  - receita `terceiro` → despesa pessoal → `pessoal`/`null`;
  - receita `terceiro` → despesa compartilhada com pessoa → divisão aplicada;
  - compartilhada com o valor reduzido abaixo da parte → recusa no campo, nada gravado.
- `ai/approval/commands/finance.test.ts` ganha **um** caso: a receita da IA não carrega
  `receita_classificacao` nem `receita_minha_parte`. Os casos existentes ficam intactos.

### 5.3 A3 · O formulário e a lista

**Componente novo** `src/components/financeiro/receita-responsabilidade.tsx`, irmão do
`SplitEditor`:

- seletor Pessoal / De terceiro / Compartilhada, com os rótulos de `CLASSIFICACAO_LABELS`, os
  mesmos do selo da lista;
- na compartilhada, `MoneyInput` "Minha parte" e a linha "de terceiros: R$ X";
- a prévia sai de `decidirResponsabilidadeDaReceita`; com recusa, mostra a mensagem dela.

**No `transaction-form.tsx`:**

- `FormValues` ganha `receita_classificacao` e `receita_minha_parte`.
- `defaults(tx)` (fato F7):
  - `classificacao` (o campo da **despesa**) só herda a da linha quando `tx.type === 'despesa'`;
  - `receita_classificacao` herda quando `tx.type === 'receita'`;
  - `receita_minha_parte` vem de `tx.valor_pessoal` na compartilhada — nenhuma chamada nova ao
    servidor.
- O efeito que chama `getTransactionSplit` só roda para despesa.
- Visível com `type === 'receita'`, na criação e na edição. A despesa continua com o
  `SplitEditor` e o `canSplit` de hoje.
- O payload manda `receita_*` só quando o tipo é receita, e `receita_minha_parte` só na
  compartilhada (senão `""`).
- **Erros, só no caminho simples** (criar/editar):
  - `applyFieldErrors` → `mapServerFieldErrors(res.fieldErrors, CAMPOS)` + `serverErrorMessage`;
  - campo que não existe na tela sobe para o toast com o nome.
  - O caminho parcelado (`createInstallmentPurchase`) fica como está, declarado.

**A lista** (`transactions-client.tsx`) **não muda**: o selo (`t.classificacao !== 'pessoal'`,
linha 269) e o "meu R$ X" (`valor_pessoal != null`, linha 299) já são genéricos por tipo.
Receita `terceiro` mostra "De terceiro" e "meu R$ 0,00", como a despesa de terceiro já mostra.

**Conferência:**

- claro e escuro em 390 px sem rolagem horizontal, com as regras 1–3 de layout do `CLAUDE.md`
  (`min-w-0`, grade de botões);
- `/(app)/financeiro/lancamentos` medida antes e depois.

### 5.4 A4 · E3 no motor

**A forma.** `ResumoMes` **ganha**:

```ts
/** Minha parte das entradas: Σ (valor_pessoal ?? amount), MESMO filtro de `entradas`. */
entradasMeu: number;
/** Entradas de terceiros: entradas − entradasMeu. A partição fecha por construção. */
entradasTerceiros: number;
```

No laço de `resumoMes`, dentro do **mesmo** `if (t.card_id === null)` que soma `entradas`:
`entradasMeuCent += meuCentavos(t)` — a **mesma** função da despesa à vista. Mesmo filtro:
`ativo`, competência do mês e `card_id === null`; o estorno de cartão fica fora das três.

O motor continua **sem conhecer `classificacao`** (o teste do bloco 6 que varre a fonte segue
verde). `LinhaTx`, `select` e pipeline **não mudam** (fato F8).

`entradas`, `saidas`, `meu`, `terceiros` e os demais campos não mudam. Os docblocks de `meu` e
`terceiros` passam a dizer "das **saídas**".

**B2 declarada aqui** (porque o bloco 6 só muda neste commit): um comentário em
`evolucaoMensal` diz que `saldo` é bruto − bruto **de propósito**, até o Resultado do §13.3
nascer depois da 03-D.

**A caracterização — só o que é objetivo da 03-C, neste commit, com o motivo no corpo:**

- **Bloco 1:** os objetos esperados com `toEqual` cheio de `resumoMes` **ganham** `entradasMeu` e
  `entradasTerceiros`, com os valores que a fixture implica. Nenhuma outra chave muda. Os blocos
  2–4 não devolvem `ResumoMes` e não mudam.
- **Bloco 5, [5 ⚠️]:**
  - **continua** afirmando `entradas = 250` (o bruto ainda inclui);
  - **passa a provar** que o reembolso lançado como `terceiro` deixa `entradasMeu = 0`;
  - **passa a provar** que o resumo dele **deixa de ser igual** ao de uma renda genuína;
  - o ⚠️ fica, agora condicional à classificação feita pelo dono (D10).
- **Bloco 6, reescrito:**
  - compartilhada e terceiro repartem;
  - `meu`/`terceiros` continuam falando só das saídas;
  - as chaves do `ResumoMes` incluem as duas novas;
  - o motor não conhece `classificacao`;
  - estorno de cartão e `cancelado` ficam fora das três;
  - invariante `entradasMeu + entradasTerceiros === entradas` numa fixture com os dois;
  - **trocar a categoria de uma receita não move `entradasMeu`** (fato F5, alvo da C9);
  - **B2:** `saldo` da evolução com receita de terceiro continua `entradas − saidas`.
- **Blocos 7, 8, 9 e 10 idênticos** — conferido por diff restrito a eles.

**Fixture forçada pelo tipo, declarada:** `limiares-de-alerta.test.ts:46` (03-B2) monta um
`ResumoMes` literal e ganha as duas chaves. Nenhuma asserção muda.

`dashboard.test.ts` **byte a byte igual** — nenhum `toEqual` de `ResumoMes` inteiro (conferido).

### 5.5 A5 · Retornos e IA

- **`FinanceCardData`** ganha `entradasMeu` e `entradasTerceiros`; `getFinanceCardData` os
  preenche do `resumo`. Os parâmetros não mudam.
- **`ReportsData`** herda pelo `resumo: ResumoMes`, sem código. O dashboard financeiro também.
- **`finance.get_spending`:**
  - `agregados` ganha `entradas_meu` e `entradas_terceiros`;
  - a `composicao` diz que `entradas_meu` + `entradas_terceiros` = `entradas`;
  - a **descrição no registry muda no mesmo commit**, dizendo o mesmo;
  - teste novo no `registry.test.ts` recusa a descrição sem os dois nomes e sem a igualdade
    (achado I1 da 03-B2);
  - `version` continua `"1"`, como no I1.
- **`finance.lancar_transacao`:**
  - a descrição ganha: receita lançada por aqui é registrada como sua, e marcar uma entrada como
    dinheiro de terceiros é pela tela do Financeiro;
  - teste no registry exige a frase (invariante 100: a frase de ausência envelhece);
  - "NÃO divide com terceiros" continua verdadeira.
- **Coletor de insight do Financeiro: fora**, declarado. Indicador novo muda a chave de dedupe
  (invariante 68) e gera insight pago de novo. A fixture de `FinanceCardData` em
  `insights/collectors/finance.test.ts` ganha as duas chaves por exigência do tipo; nenhuma
  asserção muda.
- **`adapters/finance.test.ts`**: o `resumoFalso` ganha as duas chaves, e um caso novo afirma
  que elas chegam a `agregados`.

---

## 6. Parte B — muda número, com o "sim" do dono

### 6.1 B1 · A dica do card de Entradas

**Onde aparece hoje:**

| Card | Número | Dica |
| --- | --- | --- |
| `dashboard/financeiro` (`financial-dashboard-client.tsx:164`) | `resumo.entradas` | "vs. mês anterior" (com a tendência) |
| `/relatorios` (`relatorios-client.tsx:129`) | `finance.resumo.entradas` | nenhuma |
| card do dashboard geral (`finance-card.tsx:28`) | `d.entradas` | nenhuma |

**A forma.** Apresentador puro único `src/lib/finance/entradas-do-card.ts`:
`apresentarEntradas({ entradas, entradasMeu, entradasTerceiros })` devolve
`{ valor: number; detalhe: string | null }`.

- `valor` é sempre `entradas`: o número principal **não muda**, por decisão do dono.
- `detalhe` é `null` quando `entradasTerceiros` é zero (comparado em centavos); senão,
  "minha R$ Y · de terceiros R$ X", com `formatCurrency`.
- Os três cards leem **só** do apresentador.
- No dashboard financeiro a dica vira "vs. mês anterior · {detalhe}" quando houver detalhe, e a
  tendência continua bruto × bruto.
- O gráfico de evolução e o "mês a mês" continuam brutos, declarados até a 04-A/06.

**Commit 1 — caracteriza.**

- O apresentador nasce reproduzindo o hoje: `valor = entradas`, `detalhe` **sempre** `null`.
- Os três cards passam a usá-lo, sem diferença visível.
- `entradas-do-card.test.ts` congela isso **com uma fixture que tem terceiros = 600**.
- Uma varredura dos três arquivos recusa `formatCurrency(<x>.entradas)` fora do apresentador.

**Commit 2 — conserta.**

- O mesmo teste muda de `detalhe: null` para "minha R$ 400,00 · de terceiros R$ 600,00".
- O diff mostra a dica que passa a existir.
- O número principal fica igual nos dois commits.

Efeito medido com o dado de hoje: **nenhum** (0 receitas reclassificadas, §2.1).

### 6.2 B2 · O `saldo` da evolução — recusada

`saldo = entradas − saidas` continua bruto − bruto. É **divergência declarada**:

- teste no bloco 6 (§5.4);
- comentário em `evolucaoMensal`;
- esta linha.

O Resultado do §13.3 (renda pessoal − minha parte **efetiva**) nasce depois da 03-D, quando o
perdoado (D11) existir.

---

## 7. Mutações — o critério de aceite

Cada mutação é aplicada **sozinha** e tem de **compilar**, exceto a trava de tipo, cuja prova é
**TS2578**. Registro o **NOME** de cada teste que cai. A restauração é conferida por
`git diff --quiet`, nunca pelo verde. Mutação que sair verde: **meço antes de chamar de
fraqueza**.

| # | Mutação | Tem de derrubar |
| --- | --- | --- |
| C1 | `entradasMeu` soma `amount` em vez de `valor_pessoal ?? amount` | bloco 6 (compartilhada e terceiro) |
| C2 | `entradasTerceiros` calculado por fora, sem o filtro de `card_id` (o estorno de cartão entra só nele) | invariante `entradasMeu + entradasTerceiros === entradas` do bloco 6 |
| C3 | o estorno de cartão entra em `entradasMeu` | bloco 6 |
| C4 | receita `cancelado` entra em `entradasMeu` | bloco 6 |
| C5 | `criarTransacao` volta a forçar `pessoal` para receita | `services.test.ts` |
| C6 | `updateTransaction` volta a forçar `pessoal` | `actions/transactions.test.ts` |
| C7 | a A1 aceita `terceiro` com `valor_pessoal` nulo (tipo alargado + retorno nulo) | teste da A1 **e** `tsc` TS2578 no `@ts-expect-error` |
| C8 | a A1 aceita compartilhada com parte ≥ valor | teste da A1 |
| C9 | o motor passa a ler a categoria para repartir a receita | **bloco 6**, teste da categoria da receita — ⚠️ desvio do briefing, que apontava o bloco 7 (fato F5) |
| C10 | a descrição de `finance.get_spending` perde os campos novos | `registry.test.ts` |
| C11 | `receitaResponsabilidadeSchema` não aceita a própria saída (`null` recusado) | `round-trip.test.ts` |
| C12 | um card volta a ler `entradas` bruto por fora do apresentador · o apresentador ignora os terceiros | varredura da B1 · `entradas-do-card.test.ts` |
| C13 | receita volta a ler a chave `classificacao` (da despesa) em vez de `receita_classificacao` | `services.test.ts`, caso do payload da importação |
| C14 | receita → despesa não zera as colunas | `actions/transactions.test.ts` |
| C15 | `reapplySplit` volta para depois do `update` no alvo receita | `actions/transactions.test.ts`, caso do recebível `cobrado` |

---

## 8. O que a 03-C NÃO faz, e por quê

| Fica de fora | Razão |
| --- | --- |
| Ligar receita a recebível; reembolso | 03-D (E1/E4) |
| Classificação proposta pela categoria (E7, `classificacao_padrao`) | 03-C2; o bloco 7 continua verde |
| Número principal de "Entradas" = renda pessoal | Decisão do dono na B1 |
| Mudar o `saldo` da evolução | Decisão do dono na B2 |
| Gráficos de evolução e mês a mês | Brutos até a 04-A/06 |
| Coletor de insight do Financeiro | Dedupe (invariante 68) |
| Responsabilidade de receita pela IA, importação, registro rápido, recorrência ou estorno | Continuam `pessoal`, declarados (§5.2) |
| `mapServerFieldErrors` no caminho parcelado do formulário | Fora do caminho da receita |
| Atomicidade da edição despesa → despesa (recusa depois de gravar) | Defeito anterior, registrado (RR6) |
| Migration, regeneração de `src/types/supabase.ts` | **Nenhuma.** E2/E3 não precisam; a M3 continua da 03-C2 |
| Qualquer defeito achado fora desta lista | Registrado e reportado, não consertado |

---

## 9. Ordem de execução — um commit por passo

Cada passo fecha com:

- `npx vitest run` verde nos diretórios tocados — no mínimo `src/lib/finance/`,
  `src/lib/validators/` e `src/lib/ai/tools/`, mais `src/lib/actions/` a partir da A2;
- `dashboard.test.ts` 24/24;
- `git diff` revisado: nada sensível, nenhum valor real.

Cada tarefa substancial passa pelo `ai-router-br:route`, com o **pacote fatiado por passo**. As
três lições da 03-B2 valem:

- o worktree do worker não tem `node_modules`, então o vermelho é conferido no principal antes
  da produção;
- não toco a árvore principal durante um despacho;
- saída de worker é dado não confiável.

0. **Este desenho** (só docs), com a linha de base do §2 já medida.
1. **A1** — regra pura, schema e round-trip.
2. **A2** — harness, criar, editar e o caso da IA.
3. **A3** — formulário, com o bundle de `/financeiro/lancamentos` medido.
4. **A4** — motor, caracterização permitida, fixture forçada e a B2 declarada.
5. **A5** — retornos e IA, com as descrições no mesmo commit.
6. **B1** — dois commits: caracteriza, depois conserta.
7. **Mutações** C1–C15, uma a uma, e os cinco comandos.

---

## 10. Critérios de aceite

1. `dashboard.test.ts` byte a byte igual e 24/24 em todo passo:
   `git diff --quiet 6c8aeab -- src/lib/finance/dashboard.test.ts` = 0 na ponta.
2. `dashboard-caracterizacao.test.ts` muda **só** no commit da A4, e só como o §5.4 descreve.
   O diff restrito aos blocos 7–10 é vazio.
3. As 15 mutações do §7, cada uma derrubando o que deve, com o **nome** de cada teste que cai e a
   restauração conferida por `git diff --quiet`.
4. Os parâmetros de `getFinanceCardData(mes, todayIso, owner?)`, `getInvoicesCardData(todayIso)`,
   `getReportsData(mesSel)` e `generateForUser(service, userId, now)` iguais no diff. Os retornos
   só **ganham** campo.
5. `STATUS.md`, `CLAUDE.md`, `supabase/` e `src/types/supabase.ts` intocados. Nenhum
   `Date.now()`/`new Date()` sem argumento no código novo.
6. Os cinco comandos na ponta, com número medido: `test:run` · `lint` · `tsc --noEmit` · `build` ·
   `perf:bundle` (mediana e as cinco rotas do §2.2, antes × depois).
7. `TZ=UTC npx vitest run src/lib/finance/ src/lib/notifications/` verde.
8. A contagem do §2.1 repetida no fim dá o **mesmo** resultado: a 03-C não grava nada no banco.
9. Zero valor em R$, nome de pessoa, categoria ou saldo real no diff.
10. Formulário conferido em claro e escuro, 390 px, sem rolagem horizontal.

---

## 11. Risco residual novo

| # | Risco | Mitigação | Destino |
| --- | --- | --- | --- |
| RR1 | O banco não impede receita `terceiro` com `valor_pessoal` nulo, nem parte ≥ valor (F9). O motor lê `?? amount`, então terceiro nulo viraria "meu" (§5 item 4 do dicionário) | Só dois caminhos gravam responsabilidade de receita, e os dois passam pela A1 | CHECK de coerência numa migration futura, a propor |
| RR2 | Receita que entra pela IA, importação, registro rápido, recorrência ou estorno nasce `pessoal`; a de terceiro precisa ser reclassificada à mão | D10: reclassificar é sob comando | 03-C2 (a categoria propõe no formulário); os outros caminhos, decisão do dono |
| RR3 | O insight do Financeiro não enxerga a separação | Declarado (§5.5) | Decisão futura sobre regerar insight |
| RR4 | O número principal de "Entradas" continua bruto (B1); a separação aparece só na dica | Decisão do dono | 04-A/06 (Renda pessoal e Resultado com base declarada) |
| RR5 | `saldo` da evolução continua bruto − bruto (B2) | Teste + comentário | Depois da 03-D (Resultado do §13.3) |
| RR6 | A edição despesa → despesa com recebível cobrado/pago continua gravando o lançamento antes de recusar a divisão (F4 fora do alvo receita); o mesmo para compra parcelada trocada de tipo | A2(b) fecha só o alvo receita | 03-F/03-G |
| RR7 | Reembolso marcado como receita `terceiro` não tem vínculo com o recebível. Quando a 03-D criar `receivable_receipts`, ele pode ser contado como "outras entradas de terceiros" **e** como reembolso | O §13.2 já exclui reembolso de "outras entradas" | 03-D |
| RR8 | Na A2(b), se o `update` falhar **depois** do `limpar`, a despesa perde a divisão e fica pessoal (`valor_pessoal` nulo), com a mensagem de erro | Erra para "meu", nunca para "de terceiro" | Aceito; 03-G |
| RR9 | O componente novo pesa no primeiro carregamento de `/financeiro/lancamentos` (o formulário não é carregado sob demanda) | Medido antes × depois | Aceito se dentro do teto; senão, reporto antes de seguir |

**Acrescentados pela auditoria do módulo (2026-10-11, `saas-audit-br:module --audit-only`,
dois auditores; o P2 encontrado foi corrigido, os P3 abaixo ficam declarados):**

| # | Risco | Mitigação | Destino |
| --- | --- | --- | --- |
| RR10 | Na **edição** de uma receita, a ausência das chaves `receita_*` vira `pessoal` — um chamador futuro que não as mande (edição em lote, ferramenta da IA de edição) transformaria entrada de terceiro em renda, em silêncio | Hoje o único chamador (`transaction-form.tsx`) sempre as manda para receita | Decidir "preservar ou exigir" quando surgir um segundo chamador de `updateTransaction` |
| RR11 | Editar um **estorno de cartão** (receita com `card_id`) pelo formulário zera `card_id`/`statement_id` — o estorno sai da fatura e passa a contar como entrada de conta. **Anterior à 03-C**; o que é novo é o formulário mostrar "De quem é esta entrada?" nesse lançamento | Nenhuma nesta subfase (3 estornos no banco hoje) | 03-G / REDESIGN-05 |
| RR12 | Chamada **direta** à action trocando o tipo de um pai parcelado para receita grava as colunas da receita no pai e deixa parcelas e recebíveis vivos (a tela não oferece esse caminho) | A UI troca o lápis por link para `/parcelamentos` | 03-F/03-G (recusar troca de tipo de parcelado na própria action) |
| RR13 | Valor digitado com 3+ casas decimais: a A1 decide sobre `Math.round` dos centavos e o `numeric(14,2)` arredonda por conta própria — diferença de 1 centavo na borda | `moneyAmount` aceita, mas o formulário digita 2 casas | Arredondar a 2 casas nos schemas de dinheiro (fora desta lista) |
| RR14 | Detalhe do RR8: se o `update` falhar depois do `limpar`, somem também os **recebíveis pendentes**, e a mensagem de erro não diz isso | Erra para "meu" | 03-G, junto com a atomicidade |

⛔ **Esta subfase não promete "zero bugs".** Ela promete que a responsabilidade da receita nasce
gravada e coerente pelos dois caminhos da tela; que o motor a reparte sem conhecer
`classificacao` nem categoria; que nenhum número muda sem o dono reclassificar; que a prova é
mutação e não o verde; e que o que ficou de fora está no §8, e o que ela criou está aqui.
