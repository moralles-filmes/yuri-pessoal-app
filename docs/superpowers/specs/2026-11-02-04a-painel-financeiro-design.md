# REDESIGN-04-A — Painel financeiro no visual do print 1 (desenho)

**Data:** 2026-11-02 · **Branch:** `feat/redesign-04a-painel` (worktree `C:/tmp/04a-painel`, criada de
`feat/redesign-00-auditoria` em `2ed5657`; portão `a70c541` ancestral ✅) · **Tela:** `/dashboard/financeiro`

**Fontes:** `docs/redesign/REFERENCIA-VISUAL.md` (D65, inteiro), `PLANO.md` §04, `TOKENS.md`,
`METRICAS-FINANCEIRAS.md`, §12/§13 de `2026-10-25-03g2-escritas-design.md`. O print 1 fica **fora do
git** (`C:/Users/Yuri/Documents/Desenvolvedor/yuri.app.pessoal/docs/redesign/referencias/print-1-financeiro.png`)
e **não** é copiado para o repositório.

**Prévia aprovada pelo dono em 2026-11-02** ("Aprovado"): Artifact privado
`https://claude.ai/artifact/PmcrXDKKDonsTX3pXy3UWW`, só com dado sintético (hoje fictício 18/11/2026,
"Cartão A/B/C", "Pessoa A/B", "Categoria A…F"). Ela é a referência de layout deste documento.

**Publicação (D67):** sem push, sem PR, sem merge em `main`, sem deploy. Commits locais, um por passo.

---

## 1. Intenção

O painel financeiro passa a ter a cara do print 1 — banner, quatro indicadores grandes, gráficos lado a
lado, cartões na cor de cada um — **sem que nenhum número mude de significado fora do que o dono aprovou
aqui** (K1–K5). O print decide layout, hierarquia, densidade e forma; o significado de cada número sai do
`METRICAS-FINANCEIRAS.md` e das decisões abaixo. Integridade do dado vence estética (regra 1 do README).

As peças comuns (banner, indicador, bloco, olho) nascem aqui e são pensadas para a 04-A2 (`/relatorios`)
e a 06 (`/dashboard`) reusarem sem cópia.

**Não-objetivos:** barra de filtros completa (é da 04-A2); abertura completa dos registros por trás de
cada número (04-B); ficha por pessoa (04-C); formulário de lançamento (RR-C2-6, fora — K5); sidebar e
barra de abas do celular (ficam como estão, D65).

**Anti-objetivos (reprova mesmo "funcionando"):** um bloco que o painel tem hoje sumir; card, lista e
gráfico discordarem no mesmo filtro; ausência virar R$ 0,00; projeção com o mesmo traço do realizado;
gasto que sobe pintado de verde; valor, nome ou print real em arquivo versionado.

## 2. Linha de base

### 2.1 Banco — só leitura, 2026-11-02

| Medida | Valor |
| --- | --- |
| md5 de `id:current_balance` de `accounts_with_balance` (ordenado por id) | `15d93bd1c1d3e55a40db6210dff0eb3b` (5 contas) |
| lançamentos `pago`/`recebido` com `coalesce(liquidado_em, competence_date)` > hoje BRT, com conta | **0** |
| `Σ accounts_with_balance.current_balance = account_balance_before(null, hoje + 1)` | **verdadeiro** |

O md5 é medido de novo no fim (§13). Nenhuma escrita no banco nesta subfase.

### 2.2 Os cinco comandos

Medidos no passo 0 do plano, **antes** de tocar em código: `test:run`, `lint`, `tsc --noEmit`, `build`,
`perf:bundle` (anotar `/dashboard/financeiro`, `/dashboard`, `/relatorios` e a mediana). O registro vai
para o §13.

### 2.3 Inventário do painel hoje (`page.tsx` + `financial-dashboard-client.tsx`)

1. Filtro de mês (`<input type=month>`) + seletor de base (Competência × Caixa realizado)
2. Alertas (`gerarAlertas`: gasto alto, limite do cartão, vencimento)
3. StatCard "Saldo atual" (`saldoDasContas`)
4. StatCard "Entradas do mês" / "Entradas de caixa" (`apresentarEntradas`, bruto)
5. StatCard "Saídas do mês" / "Saídas de caixa" (bruto)
6. StatCard "Pendente referente a <mês>" (`totalAReceber`)
7. Bloco do caixa (só na base caixa, `BlocoDoCaixa`)
8. Card-âncora "Minhas saídas · <mês> · <base>" com bruto e terceiros (+ frase do perdoado)
9. StatCard "Gasto no cartão" (à vista na dica)
10. StatCard "Faturas (aberta/fechada)"
11. StatCard "Próximas contas a pagar"
12. StatCard "Cartão realmente meu"
13. Gráfico "Meus gastos por categoria" (`CategoriaChart`)
14. Gráfico "Meus gastos por forma de pagamento" (`FormaPagamentoChart`)
15. Gráfico "Minhas entradas e saídas mês a mês" (`EvolucaoChart`, linhas, 6 meses)
16. Gráfico "Meu mês a mês" (`MesAMesChart`)
17. Gráfico "Minha projeção dos próximos meses" (`ProjecaoChart`)
18. Gráfico "Faturas dos próximos meses — valor cheio" (`FaturasChart`)
19. Lista "Próximas 6 faturas" por cartão

Estados que também existem e continuam: caixa com erro de leitura (`CaixaNaoLido`), rodapé de faturas sem
total (`RodapeDasFaturasSemTotal`), corte "até o dia D" das setas.

## 3. Decisões

### 3.1 Do dono (2026-11-02, uma de cada vez)

| | Decisão | O que muda |
| --- | --- | --- |
| **K1** | **"Minhas entradas" mostra a renda pessoal (`entradasMeu`) como número principal**, por uma função de apresentação **nova**, só do indicador. `apresentarEntradas` **não muda**: relatório e dashboard geral seguem como estão até adotarem o par "meu × meu" na 04-A2/06. Linha de base: "renda pessoal · competência", e "+ R$ X de terceiros" quando `entradasTerceiros` ≠ 0 em centavos | o número principal de Entradas **no painel** (RR4) |
| **K2** | **"Saldo das contas · em DD/MM"** calculado por `account_balance_before(null, hoje + 1)` (corte no fim do dia de hoje em Brasília; mesmo contrato do saldo diário do extrato; **sem migration**). Se diferir de `saldoDasContas(contas)` em ≥ 1 centavo, uma linha: "não inclui lançamentos pagos com data futura (diferença de R$ X)" com link para os lançamentos. Falha de leitura: "Não foi possível ler o saldo", nunca R$ 0,00 | o saldo do painel exclui pago com data futura (RR-E-6). Hoje: efeito zero (§2.1) |
| **K3** | **A régua única do gasto alto passa a comparar "até o dia D, sem o cartão"** no mês em andamento: saídas **à vista** (bruto, como a régua sempre foi) do dia 1 até hoje × a média do dia 1 até o mesmo dia nos até 5 meses anteriores com saída. Mês fechado: inalterado. **Vale para o painel e para o sino** (a régua é a mesma desde a 03-B2). O texto do alerta diz que o cartão fica fora | o alerta de gasto alto no painel **e** no sino (RR-E-7) |
| **K4** | Entram na 04-A, só na tela: "inclui o que ainda está pendente" em Minhas saídas; "Pendente ao banco" no total de Próximas faturas; fatura prevista sem lançamento = "sem lançamentos conhecidos" (não R$ 0,00); hachura + traço na projeção e no mês parcial; nota da rosca com o que ficou de fora; "N ciclos de cada cartão"; aviso "parcial" (`completude` de `lerFinanceiro`) | só texto e forma; motor intocado |
| **K5** | RR-C2-6 (seletor de categoria do formulário) **fica fora**: o painel não tem formulário. Destino: subfase de formulário | nada |
| — | **Prévia aprovada** como base do desenho ("Aprovado") | — |
| **K6** | *(decidida por mim, por delegação do dono: "pode seguir como achar melhor")* **"Minhas" nas duas bases.** Em caixa, os três indicadores mostram os números de caixa que **já existem** e já estão nos gráficos de caixa: renda pessoal recebida, `graficosCaixa.minha.saidas` e `graficosCaixa.minha.terceirosNasSaidas`. O bruto continua visível no Bloco do caixa, como hoje. Nenhum cálculo novo | o número principal dos indicadores **na base caixa** passa de bruto para "minha parte" |
| **K7** | *(idem)* **Setas de comparação.** **Minhas entradas:** mês em andamento → `entradasMeu` até o dia D × mês anterior até o dia D (`comparativoDoGraficoAteODia`, que já existe); mês fechado → `entradasMeu` × `entradasMeu` do anterior; cor pelo significado. **Minhas saídas:** a mesma fonte com `meu`; no mês em andamento a seta fica **neutra**, como hoje, com o texto "só o à vista, até o dia D", porque o valor é o mês inteiro com cartão; no mês fechado (mês inteiro × mês inteiro, mesma base) ganha a cor (subir = ruim). **De terceiros:** sem seta. **Base caixa:** usa a comparação "minha" que o caixa já calcula, e sem ela fica sem seta ("sem comparação nesta base"); nenhuma conta nova | as setas passam de bruto para "minha parte"; a saída do mês fechado ganha cor |

### 3.2 Do desenho (decisões minhas, para o dono conferir na leitura)

| | Decisão | Por quê |
| --- | --- | --- |
| D-A-1 | **RR5 já estava resolvido** em `4c5f117` (a evolução é "minha" dos dois lados; `rotulosDosGraficos.evolucao`). Não há conserto a fazer; a 04-A só confere com teste existente | evitar consertar o que não está quebrado |
| D-A-2 | As barras "Minhas entradas × saídas" do topo **são** `evolucaoMensal` (mesmos dados), redesenhadas de linhas para barras agrupadas. Elas **substituem** o `EvolucaoChart` de linhas no painel (o mesmo dado não aparece duas vezes). O `EvolucaoChart` continua existindo para `/relatorios` | "nenhum bloco some" = nenhum dado some |
| D-A-3 | **"De terceiros"** = `resumo.terceiros` (parte de terceiros nas despesas do mês), com a base visível. O "Pendente referente ao mês" sai do topo e entra no bloco "A receber de terceiros" | D65 §3 item 4 |
| D-A-4 | Cada indicador tem um link "Ver …" para os registros: contas (`/financeiro/contas`), entradas e saídas do mês (`/financeiro/lancamentos` com tipo e mês, nos parâmetros que a tela já aceita), terceiros (`/terceiros`). Rota conferida no disco por teste | aceite "no mínimo o link certo" |
| D-A-5 | Texto sobre a cor de cada cartão: branco ou quase-preto, escolhido por função pura que mede o contraste WCAG com `credit_cards.cor`; cor fora do formato hex cai no estilo neutro (D-A-16) | a cor é do usuário; o texto não pode ficar ilegível |
| D-A-6 | "Ver relatório ›" no rodapé das barras em vez do seletor "Últimos 9 meses": a janela continua 6 meses | seletor sem leitura nova seria botão que não liga nada |
| D-A-7 | O "olho" é uma ilha cliente pequena: cookie `fin_ocultar_valores` neste aparelho, lido pelo servidor com `await cookies()`; esconde os **quatro** indicadores ("R$ ••••"). Dica: "discrição na tela, não sigilo". Sem migration | D65 §2.6 |
| D-A-8 | O banner é Server Component **sem `"use client"`** e sem import de cliente; o primeiro nome vem de `getDisplayName()` (a mesma do menu do usuário) — sem nome, a saudação fica sem vírgula ("Boa tarde!") | D65 §2.1 |
| D-A-9 | Frases do banner: lista fixa de ~10, escolhida por índice determinístico de `hojeISO()`, e varrida por `termosProibidosEm` (`src/lib/tone/`) num teste | D65 §2.1 |

### 3.3 Da revisão do construtor (2026-11-02 — decisões minhas, para conferir)

Um revisor independente leu este documento contra o código. O que ele apontou e que um construtor
sensato resolveria sem mudar o que se constrói ficou decidido aqui:

| | Decisão | Por quê |
| --- | --- | --- |
| D-A-10 | **Barra do mês em andamento = mês inteiro** (`resumoMes.meu`, com pendentes e cartão), com hachura e legenda **"mês em andamento · parcial"** — não "até o dia D" | cortar a barra mudaria o número e quebraria a conciliação; a legenda "até o dia D" seria falsa |
| D-A-11 | **Estorno de cartão na rosca:** `gastosPorCategoria` só soma despesas, e `resumoMes.meu` desconta estornos. A nota da rosca (K4, "o que ficou de fora") passa a incluir "estornos do cartão: −R$ X", calculado de dado que `lerFinanceiro` já tem, sem tocar no motor. A conciliação vira **Σ fatias − estornos (parte minha) + não-positivos = Minhas saídas**, e a fixture do teste **tem** estorno | sem isso a igualdade só valeria por sorte da fixture |
| D-A-12 | **Últimas transações:** função nova `getUltimasTransacoes(5)` em `finance/queries.ts` (o `getTransactions` não aceita `limit`): só `competence_date ≤ hoje`, sem transferências (o pagamento de fatura entra por aí), ordem `competence_date` desc e depois `created_at` desc. Valor = o do lançamento (cheio, como na lista de lançamentos, para onde o "Ver todas" leva); compra parcelada aparece com o total e "em N×" | "última" não pode ser algo que ainda não aconteceu; a lista é de registros, não de "minha parte" |
| D-A-13 | **Cartões e Próximas faturas em valor cheio** (o que se deve ao banco, como a lista e o gráfico de faturas já são hoje), com "minha parte" em linha menor. "Fatura atual" de cada cartão = o ciclo aberto de hoje (`resolverFatura(hoje)`); fechada não paga aparece na lista com o selo | "Pendente ao banco" é cheio; misturar as duas bases no mesmo bloco faria a soma não fechar |
| D-A-14 | **`aReceberPorPessoa`** agrupa e chama **o próprio `totalPendenteAte`** em cada grupo (mesmo corte de data), então Σ por pessoa = total **por construção**. A pessoa vem dos recebíveis que `lerFinanceiro` já lê (ela passa a devolvê-los com o embed de `RECEIVABLE_SELECT`) — **sem ler `lerRecebiveis()` duas vezes** | reusar `saldoCentavos`/`emAberto` sem corte divergiria do total |
| D-A-15 | **K3 sem import circular:** o corte até o dia D sai de `caixa.ts` para um núcleo puro novo (ex.: `finance/ate-o-dia.ts`) que `caixa.ts` e `dashboard.ts` importam; nada é duplicado | `caixa.ts` já importa de `dashboard.ts` |
| D-A-16 | `credit_cards.cor` é `not null` (padrão dourado), mas o validador aceita texto livre: `textoSobreACor` trata **cor fora do formato hex** (cai no estilo neutro), não "cor ausente" | o caso real é o texto inválido |
| D-A-17 | Ler `completude` na página é **trabalho novo** (hoje ela só desestrutura `entradas` e `contas`) | corrige a afirmação "como hoje" |

## 4. A tela, de cima para baixo (≥ 1280 px)

Ordem do PLANO: Resumo → Evolução → Composição → Cartões e faturas → Detalhamento → Projeções.

1. **Cabeçalho**: título + descrição de hoje; à direita, o filtro de mês e o seletor de base de hoje (os
   mesmos componentes, só reposicionados).
2. **Banner** (§5.1).
3. **Aviso "parcial"** (só se `completude` ≠ completa) e **alertas** (faixa compacta, só quando há).
4. **Quatro indicadores** (§5.2): Saldo das contas · em DD/MM (com o olho) · Minhas entradas ·
   Minhas saídas · De terceiros. Na base caixa e nas setas de comparação: **K6 e K7** (§3.1). Os textos de erro atuais do caixa continuam.
5. **Bloco do caixa** (só na base caixa), como hoje.
6. **Minhas entradas × saídas** (barras, ~⅔) e **Meus gastos por categoria** (rosca, ~⅓).
7. **Cartões de crédito** (~⅗: um bloco por cartão na sua cor + "Adicionar cartão" → `/cartoes`) e
   **Próximas faturas** (~⅖: "Pendente ao banco", lista com marcador da cor, valor, vencimento e selo
   Prevista · Aberta · Fechada · Paga).
8. **Últimas transações** (~⅗: 5 linhas, Data · Descrição · Categoria · Valor · Tipo; no celular vira
   lista) e **A receber de terceiros** (~⅖: total pendente até DD/MM, por pessoa, e o pendente referente
   ao mês).
9. **Detalhamento**: card-âncora meu × bruto × terceiros (+ perdoado), Gasto no cartão, Cartão realmente
   meu, Faturas aberta/fechada, Próximas contas a pagar, forma de pagamento, Meu mês a mês.
10. **Projeções**: Minha projeção (hachura), Faturas dos próximos meses (valor cheio).

**Antes → depois (todo bloco do §2.3 tem destino):** 1→1 · 2→3 · 3→4 (K2) · 4→4 (K1) · 5→4 (minha
parte; o bruto continua em 9) · 6→8 · 7→5 · 8→9 · 9–12→9 · 13→6 (rosca) · 14→9 · 15→6 (barras, D-A-2)
· 16→9 · 17→10 · 18→10 · 19→7. **Novos:** De terceiros (4), Cartões de crédito (7), Últimas transações
(8), A receber por pessoa (8). Um teste de varredura na fonte do painel confere a presença dos 19
títulos/componentes (ou do seu substituto declarado) — a lista acima é o gabarito dele.

**Celular (390 px):** banner baixo, sem a frase, montanha reduzida; Saldo grande; os outros três
indicadores menores em linha (`min-w-0`, `truncate`, base e comparação ocultas — a dica (i) continua);
blocos empilhados; tabela vira lista. Sem barra de abas.

## 5. As peças comuns

Moram em `src/components/shared/painel/` (nome final a critério do plano) e não dependem de finanças —
recebem texto e número prontos.

### 5.1 `BannerDeBoasVindas`
- Props: `saudacao` (texto pronto), `nome` (opcional), `linha`, `frase` (opcional). A saudação e a frase
  são calculadas no servidor por funções puras: `saudacaoPara(horaBrasilia)` (5–11 Bom dia, 12–17 Boa
  tarde, resto Boa noite) a partir de `timeInSaoPaulo`, e `fraseDoDia(hojeISO, lista)`.
- Degradê com tons de `--primary` só nesta superfície (exceção declarada ao `TOKENS.md` §8). Montanha em
  SVG inline nosso. Emoji `aria-hidden`.
- ⛔ Sem `"use client"`. Contraste do texto branco **medido** sobre o ponto mais claro do degradê, nos dois
  temas, ≥ 4,5:1; os números vão para o §13. Ponto mais claro no claro = `--primary` (5,39:1 já medido em
  `globals.css`); no escuro o degradê usa tokens próprios (`--banner-from`/`--banner-to`) definidos em
  `globals.css`, porque o `--primary` escuro é claro demais para texto branco.

### 5.2 `Indicador` (variante nova — o `StatCard` padrão não muda)
- Props: ícone + tom (`saldo|entrada|saida|terceiros`), rótulo, dica (i), valor (texto pronto ou estado
  `{erro: texto}`), linha de base (texto, **sempre visível**), comparação opcional
  `{pct: number|null, sentido: "bom"|"ruim"|"neutro", texto}` → seta + palavra + cor pelo significado
  ("sem base de comparação" quando `pct` é `null`), link opcional, e um slot para o olho.
- `@container` para densidade; `min-w-0`/`truncate` no lado do texto.
- A cor do sentido é decidida por função pura (`sentidoDaVariacao(tipo, pct)`): entrada que sobe = bom;
  saída que sobe = ruim; terceiros = neutro. Teste com mutação.

### 5.3 `Bloco`
- Título, subtítulo opcional (base/período), "Ver todas ›" opcional (rota existente — teste de `href` no
  disco como o da 02-D), slot de ação, e três estados distintos: **vazio** (ícone, frase, ação), **zero
  medido** (o número) e **falha de leitura** (texto + "tentar de novo" quando houver). Nunca o mesmo
  desenho para vazio e falha.

### 5.4 `OlhoDosValores`
- Ilha cliente. Estado inicial vem do servidor (cookie). Ao alternar, grava o cookie (`path=/`,
  `SameSite=Lax`, 1 ano) e troca os valores dos quatro indicadores por "R$ ••••" sem recarregar. Os
  valores reais já estão no payload — é discrição, e a dica diz isso.

### 5.5 Gráficos
- **Barras agrupadas** (novo, `*-impl.tsx` + fachada com `next/dynamic`, `YAxis width="auto"`): Entradas
  `--chart-1`, Saídas neutro; o mês em andamento com hachura e borda tracejada, legenda "mês em andamento
  · parcial" (D-A-10). Dados: `evolucaoMensal` (competência) ou `graficosCaixa.evolucao` (caixa), como o `EvolucaoChart`.
- **Rosca** (novo, idem): paleta de 8 slots por identidade da categoria (não tons de azul); total no
  centro; legenda com valor e %; só fatias positivas; nota do que ficou de fora por função pura
  `foraDaRosca(...)` (quantos itens negativos/zero e a soma deles). ⛔ Dobrar fatias em "Outros" fica para
  a 06 (D15): aqui todas as categorias aparecem.
- **Projeção**: o `ProjecaoChart` ganha hachura + borda tracejada + legenda "projetado". Como o
  componente é usado também pelo relatório, a mudança visual vale nos dois — é a regra "série futura
  visualmente distinta", não uma mudança de número.

## 6. Leituras

Tudo no servidor, em `page.tsx`, numa rodada `Promise.all` com a leitura de hoje (`lerFinanceiro`):

| Leitura | Para quê | Onde |
| --- | --- | --- |
| `lerFinanceiro` (a página passa a ler também `completude` — D-A-17 — e os recebíveis com a pessoa — D-A-14) | tudo o que já existe + aviso parcial + por pessoa | contrato ampliado, nenhuma leitura a mais |
| `lerSaldoAte(dataExclusiva)` → `rpc("account_balance_before", {p_account_id: null, p_date})` | K2 | nova, `finance/queries.ts`; respeita a fronteira de `saldo-das-contas.test.ts` |
| `getUltimasTransacoes(5)` (D-A-12), com `classificacao`, categoria e data | Últimas transações | nova, `finance/queries.ts` |
| `getDisplayName()` | banner | existente |

`dataExclusiva` = dia seguinte a `hojeISO()`, por aritmética de texto/`Date.UTC` (sem `new Date()` sem
argumento). Nenhuma consulta nova ao banco é montada fora de `queries.ts`.

**Agregações novas, todas puras e testadas** (em `src/lib/finance/`):

| Função | Regra | Teste que cai com a mutação |
| --- | --- | --- |
| `indicadorMinhasEntradas(resumo)` | K1: valor = `entradasMeu`; linha "+ R$ X de terceiros" só com `entradasTerceiros` ≠ 0 em centavos | trocar `entradasMeu` por `entradas` |
| `saldoComData({saldoAte, saldoDaView, hoje})` | K2: rótulo "em DD/MM", diferença em centavos, linha só se ≠ 0 | remover o corte (usar a view) / inverter a condição |
| `reguaDoGastoAlto` com `hoje` | K3: mês em andamento → à vista até o dia D × média até o dia D; fechado → inalterado; devolve também `ateODia` e `cartaoFora` | voltar ao mês inteiro |
| `aReceberPorPessoa(recebiveis, corte)` | agrupa por pessoa e chama `totalPendenteAte` em cada grupo (D-A-14); Σ pessoas = total | somar `valor` em vez do pendente / ignorar o corte |
| `foraDaRosca(fatias, estornos)` | contagem e soma do que não é positivo + estornos do cartão (D-A-11) | contar zero como fatia / esquecer o estorno |
| `sentidoDaVariacao(tipo, pct)` | cor pelo significado | saída que sobe = bom |
| `textoSobreACor(hex)` | branco × escuro por razão WCAG | escolher sempre branco |
| `saudacaoPara(hora)` / `fraseDoDia(hoje, lista)` | limites de horário; mesmo dia = mesma frase | — (limites com teste de borda) |

**Conciliação (aceite, com teste):** na mesma fixture sintética e no mesmo filtro (mês, competência,
meu, fixture **com estorno de cartão**): indicador Minhas saídas = barra do mês nas barras =
`resumoMes.meu` = Σ fatias − estornos (minha parte) + não-positivos (D-A-11); Minhas saídas + De
terceiros = saídas brutas do card-âncora; Σ A receber por pessoa = "Total pendente até DD/MM"; "Pendente
ao banco" = soma das faturas reais não pagas da lista. Repetido na base caixa onde o número existe.

## 7. A régua do gasto alto (K3) em detalhe

- `reguaDoGastoAlto({mes, hoje, transactions, statements, receivables})`:
  - `dia = diaDeCorte(mes, hoje)`; se `null` (mês fechado) → exatamente o comportamento de hoje.
  - senão: `saidas` = à vista do mês até o dia D (`resumoAteODia` — hoje privada em `caixa.ts`; vai para
    o núcleo puro comum de D-A-15, **sem duplicar a conta** e sem import circular); `mediaSaidas` = `mediaDeSaidas` dos até 5 meses
    anteriores, cada um cortado em `periodoAteODia(m, dia)` (D = 31 em fevereiro vira o último dia).
  - devolve `{ saidas, mediaSaidas, ateODia: dia | null, cartaoFora: dia !== null }`.
- `gerarAlertas` passa a usar `regua.saidas` (e não `resumoAtual.saidas`) e escreve o texto do corte
  quando `ateODia` não é nulo. O sino (`cron.ts` → `generate.ts`) recebe `ateODia` e escreve o mesmo
  texto; `dedupe_key` não muda (`high_spending:<mes>`).
- ⚠️ **Testes existentes que mudam por esta decisão (exceção declarada, como na 03-G2 §12.8):**
  `cron.test.ts` "B2 — régua única (cenário A)" e "(cenário B)" se houver, e os `it` de
  `dashboard.test.ts`/`media-saidas.test.ts`/`limiares-de-alerta.test.ts` que afirmem o mês inteiro no mês
  em andamento. Regra: **reescritos no lugar**, nunca apagados, com o nome dizendo "K3 (04-A)", cada um
  com o valor novo calculado à mão no comentário; mês fechado mantém os valores antigos. O plano lista
  cada `it` antes de tocar, e o §13 registra commit a commit.

## 8. Restrições

- Sem migration (nenhuma exigida). Banco só leitura; md5 dos saldos antes e depois.
- Sem `Date.now()`/`new Date()` sem argumento em código novo; datas como texto; instantes por
  `dateInSaoPaulo`/`timeInSaoPaulo`.
- Gráfico por `next/dynamic` (fachada + `-impl`); `YAxis width="auto"`; `min-w-0` em flex; densidade por
  `@container`; dark/light e 390/768/1280/1440 px em tudo.
- Fixture sintética sempre; nenhum nome real de pessoa, banco, cartão ou categoria; nenhum valor do print.
- `docs/redesign/STATUS.md`, `CLAUDE.md` e `AGENTS.md` não são editados (`git checkout -- AGENTS.md`
  depois de `next dev`). Sem prettier; CRLF normalizado com `sed -i 's/\r$//'`.
- Mudança em `ProjecaoChart` e nos textos do alerta alcança `/relatorios` e o sino — declarado acima, sem
  mudança de número.
- Cada tarefa substancial passa por `ai-router-br:route`; saída de worker é testada e revisada.

## 9. Aceite

1. Todo indicador aponta para os registros que o explicam (link, rota existente, teste no disco).
2. Totais conciliam (§6), com teste, na mesma base e no mesmo filtro.
3. Rosca sem negativo e com a nota do que ficou de fora; série futura e mês parcial visualmente distintos.
4. Prévia aprovada ✅; conferência em 390/768/1280/1440 px, claro e escuro; contraste do banner medido
   nos dois temas; banner sem JS de cliente (sem `"use client"` na árvore dele — teste de fronteira).
5. Nenhum bloco do §2.3 sumiu (teste de varredura com o gabarito do §4).
6. Nenhum número muda de significado fora de K1–K4, K6 e K7. Testes existentes só mudam onde o §7 declara.
7. Cada regra nova cai com a mutação da tabela do §6, restaurada e conferida por `git diff --quiet`.
8. Os cinco comandos verdes no fim, `perf:bundle` com as rotas tocadas antes → depois; `TZ=UTC` em
   `src/lib/finance` e `src/lib/dashboard` (e `src/lib/notifications`, por K3).
9. md5 dos saldos igual ao do §2.1.

## 10. Ordem de execução (o plano detalha; um commit por passo)

0. Linha de base dos cinco comandos.
1. Núcleo puro (K1, K2, K4, por pessoa, rosca, sentido, cor, saudação/frase) + testes + mutações.
2. Régua K3 + painel + sino + testes declarados no §7 + mutação.
3. Leituras novas (`lerSaldoAte`, últimas transações) + testes.
4. Peças comuns (banner, indicador, bloco, olho) + tokens do banner em `globals.css`.
5. Gráficos novos (barras, rosca) + hachura da projeção.
6. Painel montado na ordem do §4 + teste de inventário + conciliação.
7. Conferência visual (dev server; se pedir login, parar e pedir ao dono) + contraste medido.
8. Os cinco comandos, `TZ=UTC`, md5, revisão final da branch, §13.

## 11. Fora daqui, com destino

| Item | Destino |
| --- | --- |
| Ficha por pessoa | 04-C |
| Não-soma dos reembolsos pendentes (teste do motor) | REDESIGN-05 |
| Estado "zero medido" × "sem lançamentos" no motor (`virtuais ficam zero`) | REDESIGN-05 |
| Reembolso sem classificar na competência (D10) | REDESIGN-05 |
| RR-C2-6 | subfase de formulário (K5) |
| Barra de filtros, "meu × meu" no relatório | 04-A2 |
| "meu × meu" no dashboard geral | 06 |

## 12. Riscos

- **K3 cala o alerta para quem gasta quase tudo no cartão** durante o mês — aceito pelo dono; o cartão
  segue coberto pelo alerta de limite e pelos avisos de vencimento.
- **No dia 1–3 do mês** a régua compara poucos dias; a média dos anteriores no mesmo corte mantém a
  comparação justa, mas o percentual oscila mais. Registrado, sem mitigação nesta subfase.
- **A rosca com muitas categorias** fica densa até a 06 decidir o "Outros" (D15).
- **Cookie do olho** é por aparelho; outro navegador mostra os valores.

## 13. Resultado da execução

*(preenchido no fim: commits, critérios um a um, decisões, achados não consertados, pendências)*
