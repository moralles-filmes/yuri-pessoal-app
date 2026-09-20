# Dicionário de métricas financeiras

Estado: **preliminar — REDESIGN-00**. Fecha na REDESIGN-01, com sua aprovação.
Tudo aqui foi conferido no código e no banco em 2026-09-20, não na documentação.

---

## 1. O achado que justifica o projeto

**46,6% do que o sistema hoje chama de "Receita total" / "Entradas do mês" é dinheiro de
terceiros.**

A conta que produz esse número (`src/lib/finance/dashboard.ts:216-220`):

```ts
if (t.type === "receita") {
  if (t.card_id === null) entradasCent += cent(t.amount);   // ← amount CHEIO
  continue;
}
```

Ela soma `amount`, nunca `valor_pessoal`. E não poderia somar: conferido no banco, **nenhuma
receita tem `valor_pessoal` preenchido e nenhuma tem `classificacao <> 'pessoal'`** (48
receitas, 0 e 0). O modelo de dados **não tem o conceito de reembolso**.

Você contornou isso à mão: existe **uma categoria de receita cujo próprio nome declara que o
dinheiro é de terceiros**, com **20 lançamentos** — a maior categoria de receita do sistema em
quantidade, e 46,6% do valor das entradas. O sistema não sabe ler esse nome; para ele, é salário.

> **Este repositório é público.** Nomes reais de categorias e valores em R$ ficam de fora destes
> documentos de propósito — só entram proporções e contagens. A identificação exata das
> categorias está na sua tela, em `/financeiro/categorias`.

**Consequência em cadeia:** `entradas` está inflada → `saldo = entradas − saidas`
(`dashboard.ts:464`) está inflado → o gráfico "Evolução mensal" está inflado → o card
"Entradas do mês" em `/relatorios` e em `/dashboard/financeiro` está inflado. Nenhuma tela
avisa.

> A referência visual aprovada mostra "Receita total → Meu 64% / Terceiros 36%". **Essa
> separação não existe no motor hoje.** `ResumoMes` tem `meu` e `terceiros`, mas os dois se
> referem **só às saídas** (`dashboard.ts:176-179`). Construir esse card é trabalho novo, não
> reorganização de layout.

---

## 2. Vocabulário — os sete conceitos, e o que existe hoje

| # | Conceito | Definição | Existe hoje? |
| --- | --- | --- | --- |
| 1 | **Renda pessoal** | Valor economicamente meu | ❌ Não separado. `entradas` = tudo |
| 2 | **Despesa pessoal** | Minha parte do gasto | ✅ `transactions.valor_pessoal` (coluna gravada) |
| 3 | **Movimentação de terceiros** | Passou pela minha conta/cartão, é responsabilidade de outro | ✅ Nas despesas. ❌ Nas receitas |
| 4 | **Reembolso** | Recebimento vinculado a um gasto de terceiro. Move caixa, **não** é renda | ❌ Não existe como conceito |
| 5 | **Recebível** | Ainda devido por terceiro | ✅ `receivables` (status `pendente`/`cobrado` = em aberto) |
| 6 | **Saldo das contas** | Posição de dinheiro numa data | ✅ `account_balance()` / view `accounts_with_balance` |
| 7 | **Resultado do período** | Receitas − despesas na **mesma base** | ⚠️ Existe, mas mistura bases e infla receitas |

### Nomes a abandonar

- ❌ **"Realmente meu"** (`finance-card.tsx:19-35`) — ambíguo, e hoje fala só de despesa.
- ❌ **"Saldo"** usado para duas coisas na mesma tela: card "Saldo atual" (dinheiro em conta) e
  série "Saldo" do gráfico de evolução (`entradas − saidas`, que não é saldo de conta nenhum).
- ✅ Usar: **"Minha parte das despesas"**, **"Renda pessoal recebida"**, **"Minha parte da
  fatura"**, **"Saldo das contas em DD/MM"**, **"Resultado do período (competência)"**.

---

## 3. Onde cada número nasce hoje

| Camada | Arquivo | Papel |
| --- | --- | --- |
| Motor puro | `src/lib/finance/dashboard.ts` (801 linhas) | **Toda** a aritmética. Centavos inteiros, `hoje`/`mes` injetados |
| Regra de fatura | `src/lib/finance/invoice.ts` | `resolverFatura`, `montarFatura`, `statusEfetivo` |
| Divisão | `src/lib/finance/split.ts` | `dividirDespesa`, `decidirReaplicacao` |
| Saldo diário | `src/lib/finance/daily-balance.ts` | Espelha a função SQL `account_balance` |
| Total da fatura | view `card_statements_with_total` | `Σ despesas − Σ estornos + Σ parcelas não canceladas` |
| Saldo de conta | função SQL `account_balance()` | Só `pago`/`recebido`; cartão não move conta |

**`src/lib/reports/` não tem uma linha de aritmética financeira** — é cola que busca linhas e
chama `dashboard.ts`. Isso é bom e deve ser preservado.

⚠️ **Mas o pipeline de leitura está triplicado.** `src/lib/reports/queries.ts:138-253`,
`src/app/(app)/dashboard/financeiro/page.tsx:56-164` e `src/lib/dashboard/queries.ts:140-183`
são quase byte a byte o mesmo código — **com janelas de leitura diferentes** (12 meses nas duas
primeiras, só o mês na terceira). Três telas com os mesmos rótulos podem divergir por isso.

---

## 4. Dicionário AS-IS — o que cada número significa hoje

Legenda da coluna **Base**: `C` = competência da transação · `F` = competência da fatura ·
`$` = caixa (saldo liquidado) · `∅` = atemporal.

| Métrica na tela | Fórmula real | Data usada | Base | Status incluídos | Veredito |
| --- | --- | --- | --- | --- | --- |
| **Entradas do mês** | `Σ amount` de `type='receita'` e `card_id is null` | `competence_date` | C | todos menos `cancelado` | 🔴 **Inclui terceiros** (46,6%). Inclui `pendente` como se fosse recebido |
| **Saídas do mês** | `aVista + cartao` | `competence_date` **e** `competencia` da fatura | C+F | à vista: menos `cancelado`; cartão: **nenhum filtro** | 🟠 Mistura duas bases num número, sem rótulo |
| **Realmente meu** (saídas) | `aVistaMeu + cartaoMeu` | idem | C+F | idem | 🟠 Nome ambíguo; duas regras (ver §5) |
| **De terceiros** (saídas) | `saidas − meu` | idem | C+F | idem | ✅ Coerente com o "meu" |
| **No cartão** | `Σ total_atual` das faturas do mês | `competencia` | F | **nenhum** (view não filtra status) | 🟡 `cancelado` de cartão entraria (hoje: 0 casos) |
| **À vista** | `Σ amount` de despesa, `card_id is null`, `!parcelado` | `competence_date` | C | menos `cancelado` | ✅ |
| **Saldo atual** | `Σ accounts.current_balance` | **nenhuma** | $ | só `pago`/`recebido` | 🟠 Sem corte de data: soma até lançamento liquidado com data futura |
| **A receber de terceiros** | `Σ receivables.valor` com status em `(pendente, cobrado)` | `ref_month` | ∅/F | em aberto | ⚠️ **Dois valores na mesma tela** (ver §6) |
| **Saldo do mês** (gráfico) | `entradas − saidas` | — | C+F | — | 🔴 Herda a inflação das entradas |
| **vs. mês anterior** | `(atual−ant)/ant`, `null` se `ant=0` | — | — | — | 🟡 Base zero tratada. **Mês parcial × mês cheio, não** |
| **Próximas 6 faturas** | 6 ciclos **por cartão** | `hoje` | F | — | 🔴 Com 3 cartões são 18 (ver §7) |
| **Comprometido em parcelas** | `Σ parcelas` de faturas não pagas | — | F | não `cancelada` | 🟡 Sobrepõe "Total próximas faturas"; somar os dois é erro |

---

## 5. "Minha parte": duas regras, e por que a diferença importa

**À vista** (`dashboard.ts:159-161`) — lida de coluna, congelada na gravação:
```ts
meuCentavos = cent(t.valor_pessoal ?? t.amount)
```

**Cartão** (`dashboard.ts:188-198, 233-234`) — derivada ao vivo:
```ts
terceiros = Σ receivables.valor da fatura     // sem filtro de status
meu       = total_atual − terceiros
```

### O que está CERTO e não deve ser "corrigido"

A soma de terceiros **não filtra status de propósito, e isso está correto.** Seu briefing
determina: *"Parte original de terceiros não é igual ao saldo ainda a receber"* e *"O reembolso
reduz o recebível, não altera retroativamente minha despesa."* Um recebível já quitado
**deve** continuar contando como responsabilidade original do terceiro. Trocar isso por
"só os em aberto" faria minha despesa **crescer** toda vez que alguém me pagasse — exatamente o
defeito que o briefing proíbe.

> Registro para não se perder: uma das varreduras classificou isso como defeito P0. Reli o
> código contra o briefing e **discordo**. Fica como está.

### O que está ERRADO

1. **Assimetria de congelamento.** À vista congela (`valor_pessoal`); cartão recalcula a cada
   leitura. Apagar um recebível muda retroativamente a minha despesa de cartão de um mês
   fechado — e não muda a de um gasto à vista equivalente.
2. **`ignorado` conta como terceiro.** Se você decidiu não cobrar, a despesa virou sua. Hoje
   ela continua sendo contada como dele. **Decisão sua** — ver §11, questão Q3.
3. **A mesma subtração está escrita em 5 lugares**: `statements-client.tsx:464`,
   `dashboard.ts:524`, `dashboard.ts:233`, `reports/queries.ts:274`,
   `installments-client.tsx:180`. Um deles (`reports/queries.ts:271-275`) soma em **reais com
   ponto flutuante**, fora da disciplina de centavos do resto do módulo.
4. **Despesa 100% de terceiro com `valor_pessoal` nulo** devolveria o `amount` cheio como "meu".
   Hoje não ocorre (conferido: 0 casos), mas nada no banco impede.

---

## 6. "A receber de terceiros": mesmo rótulo, dois valores, mesma tela

No `/dashboard`, lado a lado:

| Card | Fonte | Escopo |
| --- | --- | --- |
| Financeiro | `lib/dashboard/queries.ts:193` → `totalAReceber(recs, mes)` | **só o mês selecionado** |
| Cartões & Faturas | `lib/dashboard/queries.ts:248` → `totalAReceber(recs)` | **todos os meses** |

O briefing já prescreve a solução: **três números distintos, com rótulos distintos** —
"Reembolsos recebidos neste período", "Pendente referente a este período", "Total pendente até
a data de referência". Hoje existem 2 dos 3; o primeiro **não existe**.

Boa notícia: o dado existe. `receivables.pago_em` é uma `date` e está preenchida em 100% dos
recebíveis pagos (169 de 169). "Reembolsos recebidos no período" é derivável **sem migration**.

---

## 7. Cartões e faturas

| Achado | Evidência |
| --- | --- |
| 🔴 **"Próximas 6 faturas" são 6 × nº de cartões** | `dashboard.ts:508-510`: laço externo por cartão, interno `i < 6`. O título literal está em `financial-dashboard-client.tsx:311`. O teste não pega: a fixture tem **1 cartão** (`dashboard.test.ts:285`) |
| 🔴 **Projeção é indistinguível de fatura real em `/faturas`** | O campo `virtual` existe e vira badge "Prevista" no dashboard (`invoices-card.tsx:54-60`) e `projetada` na IA — **mas não em `/faturas`**. Lá a projeção aparece como `R$ 0,00`, afirmando um valor em vez de admitir desconhecimento |
| 🟠 **Três horizontes diferentes** | `/faturas`: **2 ciclos** · dashboard geral: **4 registros** · painel financeiro e relatórios: **6 × N**. A tela dedicada a faturas é a mais curta do sistema |
| 🔴 **Pagamento de fatura não é idempotente** | `actions/statements.ts:54-60` lê `pago_em`, `:96-104` grava — duas idas ao banco, sem constraint. Duas requisições concorrentes inserem **duas** transações debitando a conta; a primeira fica órfã. O botão só se protege no mesmo diálogo |
| 🔴 **"Desfazer pagamento" não pede confirmação** | `statements-client.tsx:516-523` — único movimento de dinheiro do sistema a um clique, ao lado do chevron de expandir |
| 🟡 **`card_statements.status` é coluna write-only** | Gravada em `statements.ts:99,141`; **nenhuma leitura no sistema a usa**. Uma fatura vencida tem `'aberta'` no banco e `'atrasada'` na tela |
| 🟡 **Cartão inativo continua projetando** | `dashboard.ts:508` não filtra `ativo`. Gera 6 faturas futuras, alertas de limite e notificações |
| 🟡 **Não existe limite disponível** | Só `limite_total`. O percentual comprometido só aparece como alerta acima de 80%, nunca como número consultável |

### O que está sólido e não deve ser mexido

✅ **Pagamento de fatura não vira despesa.** É gravado como `type:'transferencia'` com
`statement_id: null` e `card_id: null` (`statement-payment.ts:43-69`), então sai de
`resumoMes` (`dashboard.ts:223`), de `buildSpendItems` (`:291`) e da view. Move só o saldo da
conta. **Não há contagem dupla.**

✅ **Compra-pai de parcelamento não é somada.** `statement_id: null` + `parcelado: true`,
barrada em três camadas (view, `dashboard.ts:225`, `:291`). As parcelas ocupam as faturas.

✅ **Aritmética em centavos inteiros** com soma que sempre fecha (`split.ts`,
`installments.ts`), e `variacaoPct` devolve `null` em base zero em vez de `Infinity`.

---

## 8. As duas bases — o que dá para entregar e o que não dá

### Base COMPETÊNCIA — ✅ existe, precisa de rótulo

É o que o sistema já faz: à vista por `competence_date`, cartão pelo ciclo da fatura. É uma
base coerente. O problema é **não estar escrito em lugar nenhum**. A palavra "competência"
aparece **uma vez** em toda a tela de relatórios, e num gráfico secundário
(`relatorios-client.tsx:265`).

### Base CAIXA REALIZADO — ⚠️ não é construtível com fidelidade hoje

| Evento | Data de caixa existe? |
| --- | --- |
| Pagamento de fatura | ✅ `card_statements.pago_em` + `pago_transacao_id` (9 de 9 preenchidos) |
| Lançamento à vista | ❌ **`transactions` não tem coluna de liquidação.** Só `purchase_date`, `competence_date` e `status` |
| Reembolso recebido | ⚠️ `receivables.pago_em` existe, **mas nenhuma transação é criada** — o dinheiro entra e o saldo não sabe |

`markReceivableReceived` (`actions/receivables.ts:25-45`) só faz
`update receivables set status='pago', pago_em=...`. Não toca `transactions`.

**Conforme seu briefing manda, não vou inventar datas nem vínculos.** A limitação e a menor
evolução necessária estão na §10.

Atenuante medido: hoje **0 lançamentos `pendente`, 0 `cancelado` e 1 com
`competence_date ≠ purchase_date`**. Na prática, competência ≈ caixa para o que já existe. Isso
permite entregar um modo caixa **honestamente rotulado como aproximado** na v1, sem migration.

---

## 9. O cenário sintético obrigatório, resolvido

Compra no cartão R$ 1.000 · minha parte R$ 400 · terceiro R$ 600 · terceiro reembolsa R$ 250.

| Exigência do briefing | Hoje | Depois |
| --- | --- | --- |
| Minha despesa continua R$ 400 | ✅ `total_atual − Σ receivables` = 1000 − 600 | ✅ mantém |
| Responsabilidade original do terceiro = R$ 600 | ✅ não filtra status | ✅ mantém |
| Reembolso recebido = R$ 250 | ❌ **irrepresentável** | 🔧 exige evolução |
| Recebível restante = R$ 350 | ❌ **irrepresentável** | 🔧 exige evolução |
| Minha renda pessoal não sobe R$ 250 | ⚠️ sobe, se você lançar como receita | 🔧 exige evolução |
| Reembolso não reduz a fatura devida ao banco | ✅ são tabelas separadas | ✅ mantém |
| Pagar R$ 1.000 ao banco não cria despesa nova | ✅ é `transferencia` | ✅ mantém |
| Caixa mostra pagamento e reembolso nas datas efetivas | ❌ reembolso não tem transação | 🔧 exige evolução |

**Três das oito exigências são irrepresentáveis no schema atual.** `receivables` tem `valor`
(um número) e `status` (quatro valores) — não tem `valor_recebido`. Marcar `pago` afirma que os
R$ 600 entraram; deixar `pendente` afirma que R$ 0 entraram. **R$ 350 não existe.**

---

## 10. A menor evolução necessária (proposta, exige sua aprovação)

Ordenada por necessidade. Nada disso será executado sem seu "sim" explícito.

| # | Mudança | Por quê | Custo |
| --- | --- | --- | --- |
| **E1** | Tabela `receivable_receipts` (`receivable_id`, `valor`, `recebido_em`, `conta_id?`, `transaction_id?`) | Único jeito de representar recebimento parcial e o saldo restante. Aditiva: `receivables.pago_em` continua valendo, e a migração de dados é derivável dos 169 já pagos | 1 migration aditiva, **zero perda** |
| **E2** | `transactions.classificacao` + `valor_pessoal` passam a valer para `type='receita'` | Separa renda pessoal de dinheiro de terceiros **sem tabela nova** — as colunas já existem e o CHECK já aceita. Hoje simplesmente nunca são preenchidas em receita | Zero migration. Só formulário + `resumoMes` |
| **E3** | `resumoMes` ganha `entradasMeu` / `entradasTerceiros` | É o card da sua referência visual. Depende de E2 | Zero migration |
| **E4** | Reembolso recebido **opcionalmente** gera transação de caixa vinculada | Fecha o buraco do saldo. Opcional para não reescrever o histórico | Depende de E1 |
| **E5** | Rótulo de base em toda tela financeira | Exigência direta do briefing §6 | Zero migration |
| **E6** | `transactions.liquidado_em` (date, nullable) | Só se você quiser caixa **exato** em vez de aproximado. Com 0 pendentes hoje, o ganho é futuro | 1 migration aditiva |

**E5 é a única que entra sem aprovação de schema** — é rótulo, não regra.

---

## 11. Perguntas que só você pode responder

- **Q1** — Recebimento parcial: entra (E1) ou seguimos sem, aceitando que a tela não represente
  R$ 350? *Isto decide se os critérios de aceite §13 do seu briefing são atingíveis.*
- **Q2** — Além da categoria de terceiros, há **outras duas categorias de receita** (6 e 4
  lançamentos) cujo nome sugere origem específica e que podem não ser renda sua. Eu as
  identifico para você na conversa, fora deste documento. São renda sua ou dinheiro de
  terceiros? A reclassificação é sua, não minha — e nada será reclassificado sozinho.
- **Q3** — Recebível `ignorado` (você decidiu não cobrar): continua contando como
  responsabilidade do terceiro, ou vira sua despesa? Hoje conta como dele. Há **0 casos**, então
  a decisão não reescreve nada.
- **Q4** — Caixa **aproximado** pela competência (sem migration, rotulado como aproximação) ou
  caixa **exato** com `liquidado_em` (E6)?
- **Q5** — Histórico: as 20 receitas da categoria de terceiros devem ser reclassificadas
  retroativamente, ou a separação vale só daqui pra frente? **Recomendo daqui pra frente**, com
  a tela oferecendo a reclassificação uma a uma, sob seu comando.
