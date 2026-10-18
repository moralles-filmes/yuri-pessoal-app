# Gráficos financeiros: só o que é meu, seguindo a base — desenho

**Data:** 2026-10-18 · **Tarefa avulsa** (o projeto está em manutenção; não é subfase do redesign)
**Telas:** `/dashboard/financeiro` e `/relatorios` (aba financeira) — as duas usam os mesmos gráficos.

## 1. Por que

O dono olha o dashboard para saber **quanto ele ganha e gasta**. Hoje os gráficos misturam o
dinheiro de terceiros (o que ele pagou por outra pessoa e vai receber de volta) com o dele, e o
título não diz isso. Em outubro de 2026 o card mostra "Valor realmente meu R$ 8.904,27", mas o
gráfico "Evolução mensal" desenha as saídas brutas (R$ 9.030,97) — e o card nem diz se o valor
é de entrada ou de saída.

Além disso, o seletor **Base (Competência · Caixa realizado)** só troca os cards do topo: os
gráficos são sempre de competência, e trocar a base deixa a tela dizendo duas coisas ao mesmo
tempo.

E o eixo dos gráficos corta o rótulo ("R$ 10,0 / mil" quebra em duas linhas e encosta na borda).

## 2. O que o dono pediu (decidido por ele)

1. Os gráficos do financeiro mostram **só a parte dele** — sem terceiros — e o **título/descrição
   dizem que são entradas/gastos dele**.
2. O card "Valor realmente meu" passa a dizer **se é entrada ou saída**.
3. **Checkup de TODOS os gráficos do sistema** para o rótulo do eixo não cortar.
4. **Gráfico novo**: faturas dos próximos meses com o **valor cheio** (parte dele + de
   terceiros), e a descrição dizendo que **inclui gastos meus e de terceiros**.
5. **Tudo isso nas duas bases**, e **a troca de base muda os gráficos também**.
6. Em **caixa**, a fatura paga entra **só com a parte dele** (pagou R$ 253,41, sendo R$ 126,70 de
   terceiro ⇒ as saídas dele contam R$ 126,71).
7. Em **caixa**, "Gastos por categoria" e "Por forma de pagamento" **abrem a fatura paga pelas
   compras dela**: as compras aparecem no mês em que a fatura foi **paga**, cada uma na sua
   categoria, só a parte dele; forma de pagamento = "Cartão de crédito". Fatura paga em parte ⇒
   **a mesma proporção** de cada compra.
8. As **duas projeções** (a existente e a nova de faturas) ficam **iguais nas duas bases** — olham
   para o futuro, pelo vencimento.
9. O esboço visual (títulos e descrições abaixo) foi **aprovado como está**.

## 3. Objetivos, não-objetivos, anti-objetivos

**Objetivos**
- Todo gráfico financeiro declara no título/descrição **de quem** é o número (meu × meu+terceiros)
  e **em qual base** está.
- Trocar a base muda cards **e** gráficos, sem nenhum gráfico ficar preso em competência.
- Nenhum rótulo de eixo cortado, em nenhum gráfico do sistema, do celular (≈360 px) ao desktop.

**Não-objetivos**
- Não muda `/faturas`, `/terceiros`, `/transacoes` nem os cards do topo além do card-âncora.
- Não cria tabela, coluna nem migration. Tudo é derivado do que já existe.
- Não muda o que a IA lê (`resumoMes` e os adapters de `src/lib/ai/` ficam como estão).
- Não cria o seletor "Responsabilidade (Meu · Terceiros · Consolidado)" do §13.1 — os gráficos
  passam a ser "Meu" fixo, e o gráfico novo é o único "consolidado".

**Anti-objetivos (seria fracasso mesmo funcionando)**
- Um número de gráfico divergir do card que diz a mesma coisa (ex.: "minhas saídas" do gráfico de
  outubro ≠ "Minhas saídas" do card). Os dois saem da **mesma função**.
- Título dizendo "meu" sobre um número que tem terceiros dentro.
- Um gráfico de caixa calculado por uma segunda regra de caixa — a base caixa é `caixa.ts`.
- Mês sem dado virar zero onde a regra do projeto manda "ausência ≠ zero" (falha de leitura do
  caixa já é `{ estado: 'erro' }` — o gráfico tem de dizer que não leu, nunca desenhar zero).
- Corrigir o eixo subindo `width` até "caber no meu monitor" e quebrar no celular.

## 4. Definições — o que é "meu" em cada base

### 4.1 Competência (§13.3 de `docs/redesign/METRICAS-FINANCEIRAS.md`)
- **Minhas entradas** = `resumoMes().entradasMeu` (renda pessoal; já existe).
- **Minhas saídas** = `resumoMes().meu` (minha parte das despesas, já **efetiva**: inclui o
  perdoado, D11/03-D).
- **Meu resultado** = minhas entradas − minhas saídas. É o "Resultado do período" do §13.3.

⚠️ Isto **revoga** a divergência declarada em `evolucaoMensal` (`dashboard.ts:526`, "saldo continua
bruto − bruto por decisão do dono", congelada no bloco 6 de `dashboard-caracterizacao.test.ts`).
Aquela decisão esperava o perdoado (03-D), que já existe; o dono agora pediu "só o que é meu".
O teste do bloco 6 é **atualizado**, não apagado, e o comentário do código passa a citar este desenho.

### 4.2 Caixa realizado (§13.2)
Data de caixa = `dataDeCaixa` (`liquidado_em ?? competence_date`), só `pago`/`recebido`, como hoje.
- **Minhas entradas de caixa** = `rendaPessoalRecebida` (já existe). **Reembolsos e outras
  entradas de terceiros NÃO entram** — o dinheiro é do terceiro.
- **Minhas saídas de caixa** = Σ, entre as saídas de caixa que `numerosDoCaixa` já reconhece:
  - despesa com conta → `meuCentavos(t)` (`valor_pessoal ?? amount`) **+ o perdoado dela**
    (recebíveis `ignorado` com `transaction_id` = t), exatamente como `resumoMes` faz em
    competência (`aVistaMeu += meuCentavos + perdoadoAVista`) — o §12 manda "nas duas bases";
  - **pagamento de fatura** → `amount × (meu da fatura ÷ total_atual da fatura)`, onde
    "meu da fatura" = `total_atual − Σ parteDoTerceiroCentavos(recebíveis da fatura)` — a MESMA
    regra de `proximas6Faturas`/`resumoMes` (perdoado conta como meu);
  - transferência sem vínculo → valor cheio (não se sabe para onde foi; já é declarada à parte).
- **Meu resultado de caixa** = minhas entradas de caixa − minhas saídas de caixa.
- Fatura com `total_atual` 0/nulo e pagamento > 0: proporção indefinida ⇒ conta o pagamento cheio
  como meu **e declara** (contador no rodapé do gráfico, como os "aproximados"). Nunca `NaN`.
- Arredondamento: proporção calculada em centavos, `Math.round` por pagamento.

Ligação pagamento → fatura: hoje `lerCaixaDoMes` só lê o **conjunto** de `pago_transacao_id`. Passa a
ler, para cada fatura com pagamento: `id, pago_transacao_id, total_atual, competencia` — sem filtro
de data (P10 continua valendo: o pagamento de uma fatura antiga pode cair no período).

### 4.3 Categoria e forma de pagamento em caixa (pedido 7)
- À vista (despesa com conta): entra no mês da data de caixa, na categoria/forma dela, com
  `meuCentavos`.
- Fatura paga: cada compra que compõe a fatura (os mesmos itens que `buildSpendItems` atribui
  àquela fatura — lançamentos com `statement_id` e parcelas `transaction_installments`) entra no
  **mês do pagamento**, com **`meu do item × (amount do pagamento ÷ total_atual)`**, na categoria
  do item; forma = `cartao_credito`.
- **Estorno de cartão** da fatura (receita com `statement_id`, que reduz `total_atual`) entra
  como contribuição **negativa** na categoria dele, com a mesma proporção. *(decisão do Claude)*
- O que ainda sobrar entre Σ (meu dos itens × proporção) e (meu da fatura × proporção) — ex.:
  `valor_pessoal` do item e recebíveis da fatura não batendo — vai para uma fatia **"Diferença da
  fatura"**, visível, nunca escondida nem redistribuída. *(decisão do Claude)*
- A soma das fatias de um mês **tem de fechar** com "Minhas saídas de caixa" do mês menos as
  transferências sem vínculo (que não têm categoria — entram numa fatia "Sem categoria" ou ficam
  fora **declaradas**; decisão do construtor, desde que a conta feche e a tela diga).
- **`movimentado` em caixa** (o campo bruto de `CategoriaSlice`/`FormaSlice`) = valor cheio do
  item × proporção, sem tirar terceiros. Os gráficos passam a desenhar **`meu`** nas duas bases.
  A lista "Maiores gastos por categoria" e o CSV/JSON de `/relatorios` **seguem a base** e mostram
  as duas colunas (meu e movimentado), rotuladas. *(decisão do Claude)*
- Isso exige ler, para as faturas pagas na janela, os itens delas — inclusive de faturas de
  competência anterior à janela. É leitura nova; respeitar teto visível (`leituraComTeto`).

## 5. A tela (aprovada no esboço)

Títulos e descrições. `{base}` = "Competência" ou "Caixa realizado"; `{mês}` = "outubro de 2026".

| Hoje | Passa a ser | Descrição |
| --- | --- | --- |
| Card "Valor realmente meu · {mês} · Competência" | **"Minhas saídas · {mês} · {base}"** | caixas internas: **"Saídas totais (bruto)"** e **"Saídas de terceiros"** (caixa: "Saiu das contas (bruto)" e "Parte de terceiros no que saiu") |
| Gastos por categoria | **Meus gastos por categoria** | "Só a sua parte. {base}." + em caixa: "compras do cartão no mês em que a fatura foi paga" |
| Por forma de pagamento | **Meus gastos por forma de pagamento** | idem |
| Evolução mensal | **Minhas entradas e saídas mês a mês** | "Só a sua parte — terceiros fora. Últimos 6 meses. {base}. Resultado = minhas entradas − minhas saídas." Legenda: Minhas entradas · Minhas saídas · Meu resultado |
| Mês a mês (· até o dia D) | **Meu mês a mês** (· até o dia D) | Barras = **minhas** entradas e **minhas** saídas (competência: `entradasMeu`/`meu`; no corte até o dia D, `entradasMeu`/`aVistaMeu`, "o cartão não entra"). Caixa: "o cartão entra como pagamento de fatura (sua parte)" — **trabalho novo**: hoje não existe série de caixa para este gráfico (só `comparativoAteODia`, dos cards, que soma entradas brutas) |
| Projeção dos próximos meses | **Minha projeção dos próximos meses** | "Minha parte das faturas, recorrências e contas fixas. Pelo vencimento. Terceiros fora." — **igual nas duas bases** |
| — | **Faturas dos próximos meses — valor cheio** (novo) | "Total real das faturas de cartão, com todos os gastos: **inclui gastos meus e de terceiros**. Pelo vencimento." Barras empilhadas Minha parte + Parte de terceiros; a pilha é o total. **Igual nas duas bases** |

A palavra "Competência" fixa que hoje aparece nas descrições dos gráficos é substituída pela base
ativa. Em `/relatorios`, os mesmos títulos.

⚠️ **Divergência declarada:** em caixa, "Minhas entradas" do gráfico (só renda pessoal) é menor que
o card do topo "Entradas de caixa" (renda + reembolsos + outras, bruto). Os dois dizem coisas
diferentes e os rótulos já mostram isso; o card-âncora "Minhas saídas" é que tem de bater com o
ponto do mês no gráfico.

### 5.1 Projeções
- **Agrupamento pelo VENCIMENTO.** A descrição de hoje diz "Pelo vencimento", mas o código agrupa
  por `mesDe(competencia)` (mês do fechamento); quando o vencimento cai no mês seguinte ao
  fechamento, a fatura aparece um mês antes do que o rótulo promete. As duas projeções passam a
  agrupar faturas por **`mesDe(data_vencimento)`**, para o número bater com o que está escrito
  (é o mês em que o dinheiro sai). *(decisão do Claude — muda as barras da projeção atual)*
- **Minha projeção**: a série "Faturas" passa a ser **minha parte** (`total_atual − Σ
  parteDoTerceiro` por fatura, agrupado pelo mês de vencimento). Recorrências e contas fixas não têm
  parte de terceiro no schema (`recurring_transactions`/`bills` sem `valor_pessoal`) ⇒ entram
  cheias, como hoje.
- **Gráfico novo**: **mesmos meses** da projeção (`projMeses`), faturas reais (`card_statements`)
  agrupadas pelo mês de vencimento; sem fatura no mês = barra vazia (não inventa fatura virtual);
  `meu` + `terceiros` = `total_atual`. Fica **ao lado da "Minha projeção"** no dashboard e na aba
  Financeiro de `/relatorios`. "Faturas por mês" da aba Cartões (histórico) **fica como está**.
- A regra meu/terceiros por fatura hoje existe em **duas** cópias (`proximas6Faturas` em
  `dashboard.ts` e `reports/queries.ts:170-188`). O construtor extrai **uma** função pura e faz as
  duas — mais a projeção e o gráfico novo — usarem ela. Nenhuma cópia nova.

## 6. Checkup dos eixos — todos os gráficos do sistema

Causa vista: `brlCompact` produz "R$ 10,0 mil" e o `YAxis` tem `width={78}`; o rótulo quebra e
encosta na borda do card. Alvos conhecidos (`grep "<YAxis" src`):
`dashboard/{evolucao,mes-a-mes,projecao,forma-pagamento}-chart-impl.tsx`,
`reports/report-bar-chart-impl.tsx`, `studies/evolution-chart-impl.tsx`,
`training/training-charts-impl.tsx` (3), `habits/consistency-chart-impl.tsx`,
`body/measurement-chart-impl.tsx`, mais o gráfico novo. Conferir também os gráficos sem `YAxis`
(pizza/rosca, barras horizontais) por corte de legenda/rótulo.

Critério: em 360 px, 768 px e 1280 px de largura, nenhum tick quebra de linha nem é cortado, em
claro e escuro. Preferência do dono: corrigir na **origem** (formato compacto que cabe — ex.
"R$ 10 mil" sem casa decimal quando inteiro — e largura derivada do maior rótulo) em vez de um
número mágico por gráfico. Mudança de formato é **só de apresentação** (o tooltip continua com o
valor exato via `formatCurrency`).

## 7. Restrições do projeto que valem aqui

- Regras puras com `hoje` injetado, testadas em Vitest co-localizado; I/O em `*-leitura.ts`/
  `queries.ts`. `dashboard.ts` **não importa** `caixa.ts` (P3 da 03-E) — a regra nova de caixa mora
  em `caixa.ts` (ou arquivo irmão) e importa do motor, nunca o contrário.
- Dinheiro em centavos por dentro (`transactions.amount` é `numeric(14,2)` em reais).
- Falha de leitura do caixa ⇒ o gráfico declara que não leu (não desenha zero).
- Teto visível nas leituras novas (`leituraComTeto`, `parcial` na tela).
- Gráfico entra por `next/dynamic` (par fachada + `-impl`, esqueleto com `--chart-skeleton-h`);
  o gráfico novo segue o mesmo padrão. Orçamento `npm run perf:bundle` não pode estourar.
- Responsivo + dark/light; regras de layout do CLAUDE.md (min-w-0, `cn()` = twMerge).
- Verificação final: `test:run` + `lint` + `tsc` + `build` + `perf:bundle`; e
  `TZ=UTC npx vitest run` nos testes de data.

## 8. Testes que provam

- Competência: para um mês com terceiros, a série do gráfico = `entradasMeu`/`meu` do mesmo
  `resumoMes` do card (mesma fonte); resultado = entradasMeu − meu.
- Caixa: fatura R$ 253,41 com R$ 126,70 de terceiro, paga inteira ⇒ minhas saídas de caixa
  contam R$ 126,71; paga em R$ 100 ⇒ conta `round(100 × 126,71/253,41)`; fatura com total 0 ⇒
  pagamento cheio + contador; reembolso recebido não entra nas minhas entradas.
- Caixa categorias: Σ fatias do mês = minhas saídas de caixa (menos o que for declarado fora).
- Card "Minhas saídas" de caixa = ponto do mês no gráfico de caixa.
- Projeção: faturas = minha parte; gráfico novo: meu + terceiros = total_atual por mês.
- Bloco 6 de `dashboard-caracterizacao.test.ts` atualizado para o saldo "meu".
- Mutação confirmada nas regras novas (padrão do projeto).

## 9. Fica com o construtor

- Nomes de funções/tipos, onde exatamente cada uma mora (respeitando P3), e se `evolucaoMensal`
  muda de semântica ou ganha irmã — **desde que** nenhum outro consumidor de `EvolucaoPonto`
  (`grep` em `src/`, incluindo exportação/CSV de relatórios) passe a mostrar "meu" sem saber.
- Como alargar a leitura de caixa para 6 meses (a Evolução precisa de 6) sem quebrar o teto.
- Cores do gráfico novo (tokens `--chart-*` existentes).
- Ordem dos blocos de trabalho e se o checkup de eixos vai num commit separado.

## 10. Decisões minhas (do Claude), para o dono conferir

- `/relatorios` recebe exatamente as mesmas mudanças (usa os mesmos gráficos).
- Em caixa, **minhas entradas = só renda pessoal** (reembolso fica fora, coerente com "só o meu").
- Transferência sem vínculo conta cheia como minha saída (não há como saber de quem era).
- Recorrências e contas fixas entram cheias na projeção (o schema não guarda parte de terceiro).
- O card-âncora também segue a base (era só competência).
- **As projeções passam a agrupar faturas pelo mês de VENCIMENTO**, como o rótulo já promete, e
  não pela competência. Isso muda as barras da projeção atual (§5.1).
- Em caixa, estorno de cartão vira valor negativo na categoria dele, e a diferença que restar
  vira a fatia visível "Diferença da fatura" (§4.3).
- A lista "Maiores gastos por categoria" e o CSV de `/relatorios` seguem a base e mostram as
  colunas meu e movimentado (§4.3).
- O gráfico novo fica ao lado da projeção, com os mesmos meses; "Faturas por mês" da aba Cartões
  fica (§5.1).
- Branch própria **`feat/graficos-meus-e-base`**, criada a partir de `feat/redesign-03e-caixa`
  (depende do código de caixa da 03-E, que ainda não está em `main`); o PR vai para `main`
  depois da 03-E.
