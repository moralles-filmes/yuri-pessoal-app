# REDESIGN-04-A2 — Relatório financeiro com as peças da 04-A (desenho)

**Data:** 2026-11-02 · **Branch:** `feat/redesign-04a2-relatorio` (worktree `C:/tmp/04a2-relatorio`, criada de
`feat/redesign-00-auditoria` em `9342fbb`; portão `a972712` (04-A) ancestral ✅) · **Tela:** `/relatorios`, aba
Financeiro

**Fontes:** `docs/redesign/REFERENCIA-VISUAL.md` §2, §4, §6 e §7 (D65); `PLANO.md` §04 (04-A2 e o aceite);
`STATUS.md` (seção da 04-A, D68 e "Próximo passo"); `METRICAS-FINANCEIRAS.md` §13; o desenho da 04-A
(`2026-11-02-04a-painel-financeiro-design.md`, §3, §5, §11 e §13). O print 1 fica **fora do git**
(`C:/Users/Yuri/Documents/Desenvolvedor/yuri.app.pessoal/docs/redesign/referencias/print-1-financeiro.png`) e vale
só para as **peças**: o relatório não tem print próprio.

**Prévia aprovada pelo dono em 2026-11-02** ("Aprovado!"): Artifact privado
`https://claude.ai/artifact/L8eVCGP6PS9XvzTuGd95Rp`, só com dado sintético (hoje fictício 18/11/2026, "Cartão A",
"Conta B", "Categoria A…F", "Pessoa A"). Conferida a 390, 768, 1280 e 1440 px, claro e escuro: largura rolável =
largura visível nas quatro, nenhum valor cortado. (O "R$" do eixo cortado é do SVG desenhado à mão na prévia; o
produto usa `YAxis width="auto"`.) Ela é a referência de layout deste documento.

**Publicação (D67):** sem push, sem PR, sem merge em `main`, sem deploy. Commits locais, um por passo. A integração
em `feat/redesign-00-auditoria` é local e a pedido do dono.

---

## 1. Intenção

A aba Financeiro de `/relatorios` passa a falar a mesma língua do painel da 04-A: os mesmos indicadores, blocos,
olho e gráficos, **reusados, nunca copiados**. A diferença é de propósito: o painel responde "como está o meu
mês"; o relatório é **tela de análise**, então não tem banner e ganha a **barra de filtros completa**, com período,
base, responsabilidade, conta, cartão, pessoa e categoria. A sequência é **Resumo → Evolução → Composição →
Detalhamento → Projeções**.

O relatório fecha também o "meu × meu" (RR4 no relatório; RR5 já estava resolvido, D-A-1), o "parcial" na tela,
o RR-C2-10 (filtro ligado × desligado no escuro) e três achados da 04-A que moram nas peças reusadas.

**Objetivos**
- As peças da 04-A em `/relatorios`, sem segunda cópia.
- A barra de filtros, na URL.
- Sem filtro, os totais do relatório **conciliam** com os do painel no mesmo mês e na mesma base, com teste.
- Com filtro, nenhum número que o motor não decompõe.

**Não-objetivos**
- Abrir os registros por trás de cada número (é da 04-B).
- Ficha por pessoa (é da 04-C).
- Exportação com filtros (é da 04-D: o CSV e o JSON de hoje continuam como estão).
- As abas Cartões, Hábitos, Estudos e Tarefas, que ficam como estão.
- O banner.
- Os blocos de cartões e de últimas transações do painel: o relatório já tem a aba Cartões, e a lista é da 04-B.

**Anti-objetivos (reprova mesmo "funcionando")**
- Um bloco que a aba tem hoje sumir.
- Relatório e painel discordarem sem filtro.
- Um número recortado que o motor não decompõe, por exemplo a fatura dividida por categoria ou a minha parte dividida por
  pessoa.
- Ausência virar R$ 0,00.
- Projeção com o traço do realizado.
- Gasto que sobe pintado de verde.
- O bruto rotulado como "meu".
- Um segundo cálculo de qualquer total.
- Valor, nome ou print real em arquivo versionado.

## 2. Linha de base (2026-11-02, na worktree, em `9342fbb`)

| Comando | Resultado |
| --- | --- |
| `npm run test:run` | ✅ 320 arquivos / 7.175 testes |
| `npm run lint` | ✅ |
| `npx tsc --noEmit` | ✅ |
| `npm run build` | ✅ |
| `npm run perf:bundle` | ✅ mediana 201,9 KB, 68 rotas dentro, nenhuma com teto próprio |

**Banco:** só leitura. A linha de base do md5 dos saldos é `15d93bd1c1d3e55a40db6210dff0eb3b`, e ela é conferida
antes e depois. Esta subfase **não tem migration**.

**Inventário da aba hoje** (`relatorios-client.tsx`, aba Financeiro), para o teste de "nenhum bloco some":
1. mês + seletor de base;
2. Saldo atual;
3. Entradas do mês (bruto, `apresentarEntradas`);
4. Saídas do mês (bruto, com "meu" na dica);
5. Pendente referente ao mês;
6. Bloco do caixa;
7. Gastos por categoria;
8. Forma de pagamento;
9. Evolução (linhas);
10. Meu mês a mês;
11. Projeção;
12. Faturas dos próximos meses;
13. Maiores gastos por categoria;
14. Assinaturas e recorrências;
15. exportar CSV de categorias.

O botão "Baixar relatório (JSON)" é da página e fica.

## 3. Decisões

### 3.1 Do dono (2026-11-02, uma de cada vez)

| | Decisão | O que muda |
| --- | --- | --- |
| **L1** | **Recorte honesto.** Período, base e responsabilidade mudam a tela inteira. Conta, cartão, pessoa e categoria são **recortes**: filtram as **entradas do motor** só onde o número se decompõe. O bloco que não se decompõe com aquele recorte mostra o estado **"Não segue o filtro de X"**, com o motivo e "Ver sem o filtro", **em vez de número**. Projeções nunca seguem recorte. Recalcular por lançamento quando há filtro foi **recusado**, porque seria uma segunda conta que diverge da fatura | o que cada bloco mostra com recorte (§5) |
| **L2** | **Responsabilidade, com "Meu" como padrão, igual ao painel.** **Meu:** os mesmos indicadores e as mesmas funções do painel (Saldo das contas · em DD/MM · Minhas entradas · Minhas saídas · De terceiros), então os números batem por construção. **Terceiros:** entradas de terceiros, saídas de terceiros e o pendente. **Consolidado:** o bruto como número, com "minha" e "de terceiros" em linhas separadas embaixo, **nunca rotulado "meu gasto"** (`METRICAS-FINANCEIRAS.md` §13.1). O relatório **deixa de usar `apresentarEntradas`** (RR4), e `entradas-do-card.test.ts` muda, o que fica **declarado** (§7) | o número principal de Entradas e de Saídas no relatório |
| **L3** | **Os três achados da 04-A nas peças, consertados sem JS novo.** (a) Dica (i): vira `<details>`/`<summary>` nativo, que abre por toque, clique e teclado; `Indicador` continua Server Component. (b) Olho: com os valores ocultos, o leitor de tela ouve **"valor oculto"** (hoje o "R$ ••••" é `aria-hidden` e nada é anunciado). (c) A legenda "mês em andamento · parcial" das barras some quando o gráfico está vazio. **Vale também para o painel** (mesma peça), e cada conserto tem teste vermelho antes | só forma e acessibilidade, nos dois lugares |
| — | **Prévia aprovada** ("Aprovado!") | — |
| **L4** | *(depois da revisão do construtor)* **A categoria só alcança o que se calcula item a item.** Seguem o filtro: Minhas saídas e De terceiros do mês (a fatia da categoria em `gastosPorCategoria`), as entradas da categoria (receitas de conta), a forma de pagamento, os Maiores gastos e as Assinaturas. **Não seguem:** barras de 6 meses, mês a mês, card meu × bruto × terceiros e as setas. A outra opção, as barras pela fatia mês a mês, foi **recusada**: estorno não tem categoria, e a barra não fecharia com o total do mês | §5 (categoria) |
| **L5** | *(idem)* **A pessoa só alcança o pendente dela**: o total até hoje e o referente ao mês, pela `aReceberPorPessoa` da 04-A, já conciliada com o total (D-A-14). Todo o resto, inclusive "saídas de terceiros dela", mostra "não segue o filtro de pessoa". Uma função nova de saídas por pessoa foi **recusada**, porque seria regra nova de dinheiro. O detalhe por pessoa é da 04-C | §5 (pessoa) |

### 3.2 Do desenho (decisões minhas, para o dono conferir na leitura)

| | Decisão | Por quê / custo se estiver errada |
| --- | --- | --- |
| D-A2-1 | **Conta e cartão se excluem.** Escolher um limpa o outro, na URL e na tela | Um lançamento sai de uma conta **ou** de um cartão. Os dois juntos dariam sempre vazio, e a tela pareceria quebrada. Custo: quem quiser "o cartão pago pela conta X" não tem esse recorte (isso é base caixa, D-A2-6) |
| D-A2-2 | **Um recorte de cada tipo, no máximo** (um id por parâmetro), e os quatro podem combinar com período, base e responsabilidade. Combinações entre recortes (ex.: categoria + pessoa) seguem a regra do mais restritivo: o bloco que não segue **algum** dos recortes ativos mostra o estado "não segue" desse recorte | Seleção múltipla é escopo da 04-D (exportação). Custo: uma consulta a mais na URL para comparar dois cartões |
| D-A2-3 | **URL:** `?mes=yyyy-MM&base=caixa&resp=terceiros\|consolidado&conta=<uuid>&cartao=<uuid>&pessoa=<uuid>&categoria=<uuid>`. Sem parâmetro valem competência e "meu". Um id que não está na lista do dono (ou não é uuid) é **ignorado**, e o chip não aparece: nunca há filtro fantasma. Não há campo de texto, então `useUrlText` não se aplica: os quatro são `<select>` | Mesma convenção de `/relatorios` hoje (`mes`, `base`). Os nomes ficam em pt-BR sem acento, como `mes` |
| D-A2-4 | **No celular** (< 600 px), os quatro recortes ficam em "Mais filtros (n)", um `<details>` nativo (sem JS); período, base e responsabilidade ficam à vista. Do tablet para cima os quatro ficam sempre abertos. Os chips "Filtros ativos" com × e "Limpar filtros" aparecem quando há algo além do padrão | Prévia aprovada |
| D-A2-5 | **RR-C2-10** *(corrigida ao planejar: a primeira versão apontava o `SeletorDeVisao`, que já tem fundo primário + ✓ desde a 07-A V1)*. O defeito é o botão **"marcadas"** da barra de filtros de **Lançamentos** (`transaction-filters.tsx`, `variant={ligado ? "secondary" : "outline"}`), em que no escuro só a borda muda (03-C2). Ligado passa a ter o mesmo desenho do seletor: `variant="default"` (fundo primário) + ✓. O estado continua em `aria-pressed`. Na barra do relatório, o `<select>` ligado ganha borda primária, e os chips repetem o estado em texto | Custo: muda a cara de um botão de Lançamentos, fora do relatório (é a correção pedida) |
| D-A2-6 | **Na base caixa, os quatro recortes não se aplicam nesta subfase.** Cada bloco de caixa mostra "Não segue o filtro de X na base caixa". O caixa tem leitura própria (`estadoDoCaixa` → `lerCaixaDoMes`), e recortá-la exigiria um segundo caminho de filtro, fora do motor. Destino: registrado no §11 | Integridade vence alcance. Custo: com base caixa, filtrar um cartão não mostra nada além do estado "não segue" |
| D-A2-7 | **As Projeções mostram sempre a minha parte**, como hoje ("Minha projeção dos próximos meses"). Em Terceiros e Consolidado, o bloco escreve "a projeção é sempre da sua parte". "Faturas dos próximos meses" continua em valor cheio. Nenhuma segue recorte, exceto as faturas futuras com o recorte de cartão (fatura é de cartão; é a mesma função, `faturasPorMes`, sobre as faturas daquele cartão) | `projecaoProximosMeses` não tem versão de terceiros, e criá-la seria regra nova. Custo: em Terceiros não há projeção da parte dos outros |
| D-A2-8 | **O olho do relatório é o mesmo do painel**: o mesmo cookie (`fin_ocultar_valores`) e o mesmo `OlhoDosValores`/`BotaoDoOlho`, no indicador de saldo. Ele esconde os valores **do Resumo**, como no painel | Discrição por aparelho. Custo: fechar o olho no painel fecha também no relatório (é o comportamento esperado) |
| D-A2-9 | **Pessoa (L5):** o recorte filtra **só a lista crua de recebíveis** (`person_id`, que ela já traz) e alimenta `aReceberPorPessoa`/`totalPendenteAte`. O motor não é recortado por pessoa | L5. Custo: o recorte é estreito de propósito |
| D-A2-10 | **Categoria (L4):** "Minhas saídas" = a fatia `meu` da categoria em `gastosPorCategoria` (a conta da rosca, que a 04-A concilia com "Minhas saídas"); "De terceiros" = `movimentado − meu` dessa fatia, em centavos; "Saídas (bruto)" = `movimentado`, com a linha "estornos não têm categoria e ficam fora". Entradas = `resumoMes` sobre as receitas da categoria (só as de conta, porque `resumoMes` já ignora receita de cartão). Forma de pagamento = `gastosPorForma` com os lançamentos e as parcelas da categoria e **todas** as faturas, porque `buildSpendItems` é item a item e usa a fatura só para achar o mês | Sem fórmula nova. Custo: o bruto da categoria não fecha com o bruto do mês, e a tela diz isso |
| D-A2-11 | **Recorte de cartão:** filtra `txs` por `card_id`, `sts` por `card_id`, os recebíveis das faturas e dos lançamentos que ficaram, e as parcelas das faturas que ficaram; o motor roda igual. Entradas: **não segue** (estorno de cartão não é entrada, e `resumoMes` já o exclui: o valor seria sempre R$ 0,00, que mentiria como "zero medido"). Saldo: não segue. Mês a mês: não segue (compara só o à vista) | Fatura é de cartão: o total do cartão é a soma das faturas dele, por construção |
| D-A2-12 | **Recorte de conta:** filtra `txs` por `account_id` (receitas e despesas à vista daquela conta); sem faturas, sem parcelas, e os recebíveis dos lançamentos que ficaram. O saldo passa a ser o **daquela conta**: `lerSaldoAte` ganha um segundo parâmetro opcional, a conta (hoje ela fixa `p_account_id: null`; a função SQL `account_balance_before(uuid, date)` já recebe o id, então **não há migration**), e a diferença da K2 compara com `saldoDasContas` sobre aquela conta só. ⚠️ O relatório **hoje não chama `lerSaldoAte`** (mostra `saldoDasContas` da view): o "Saldo das contas · em DD/MM" da L2 acrescenta essa RPC à página, a mesma do painel, e a falha dela vira "Não foi possível ler o saldo", nunca R$ 0,00. "Minhas saídas" ganha a linha "o cartão não sai de conta: a fatura paga aparece na base caixa". Faturas futuras: não segue | A compra no cartão não tem conta, e quem tira dinheiro dela é o pagamento da fatura (`METRICAS-FINANCEIRAS.md` §13.2) |
| D-A2-13 | **O motor ganha UM campo OPCIONAL**, como o `id` que já tem: `DashTx.account_id?`. `montarEntradas` o preenche a partir da linha, que **já o traz** (`TX_SELECT` é `*`). `LinhaTx` ganha `account_id: string \| null` **obrigatório** (a regra estrita da 03-B2), e os testes que montam a linha recebem `null` escrito. A pessoa **não** entra no motor (L5): o recebível cru já tem `person_id` e `card_id`. **Nenhuma leitura nova e nenhuma migration** | Opcional no motor: `dashboard.test.ts` e as fixtures do motor não mudam. Obrigatório na linha: chave esquecida é erro de compilação |
| D-A2-14 | **O recorte é uma função pura** em `src/lib/finance/recorte.ts`, e **o tipo do retorno diz a que funções ele pode alimentar**. Para cartão e conta, ela devolve `{ alcance: "motor", entradas }`: as entradas filtradas passam por `resumoMes` e pelas outras funções de sempre. Para categoria, `recortarPorCategoria` **não devolve entradas recortadas**: devolve só os resultados prontos — a fatia da categoria (`gastosPorCategoria`), as formas (`gastosPorForma`) e as entradas (`resumoMes` sem faturas). Sem lista recortada nas mãos, quem chama **não tem como** passá-la ao total da fatura: é irrepresentável, não só proibido. (Um tipo de marca foi descartado ao planejar: um array marcado continua sendo `DashTx[]` e entraria em `resumoMes` sem erro.) O "segue × não segue" de cada bloco é **dado**: uma tabela única `SEGUE_O_RECORTE[bloco][tipo]`, com o motivo em pt-BR, lida pela tela e testada (§6). Nenhuma soma mora em `recorte.ts` | Um lugar só decide; o motor continua sendo a única conta. O erro que a revisão achou (categoria nas saídas pela fatura) deixa de compilar |
| D-A2-15 | **A montagem dos indicadores sai do cliente do painel para uma função pura compartilhada** (`indicadoresDoResumo` em `finance/painel.ts`), consumida pelo painel e pelo relatório. Ela recebe resumo, comparações, saldo e responsabilidade, e devolve os textos e números prontos para `Indicador`. O painel passa a chamá-la com "meu", e **o teste de inventário e o de conciliação do painel não mudam** | É o que torna "batem por construção" verdade, e não coincidência de duas montagens |
| D-A2-16 | **Evolução por responsabilidade:** Meu = `evolucaoMensal` (como o painel, RR5); Terceiros e Consolidado = os campos `entradasTerceiros`/`terceiros` e `entradas`/`saidas` de `resumoMes` mês a mês, por uma função pura `evolucaoDaResponsabilidade`, que só **escolhe o campo** (nenhuma conta). Barras pela peça `BarrasEntradasSaidasChart` da 04-A | Mesma fonte do Resumo: a barra de novembro é igual ao indicador |
| D-A2-17 | **Rosca e forma de pagamento por responsabilidade:** Meu = `meu`; Consolidado = `movimentado`; Terceiros = `movimentado − meu` (em centavos), só fatias positivas e "o que ficou de fora" pela `foraDaRosca` da 04-A. A rosca usa a peça `RoscaCategoriasChart` | Mesma regra da 04-A (só positivas, nota do que ficou de fora) |
| D-A2-18 | **"Maiores gastos por categoria" e "Assinaturas" ficam como estão** (o desenho da lista de hoje), dentro de um `Bloco`. Assinaturas: recorrência não guarda conta, cartão nem pessoa → "não segue" esses três; com categoria, filtra pela categoria da recorrência | "Nenhum bloco some" |
| D-A2-19 | **"Parcial":** a mesma faixa do painel (`completude` de `lerFinanceiro`), acima do Resumo, com os motivos. A tela já recebe `finance.completude` e hoje não a lê | K4 da 04-A, agora no relatório |
| D-A2-21 | **Base caixa × responsabilidade:** usa só o que `estadoDoCaixa` já traz. Saídas: a minha parte (`minha.saidas`), o bruto (`saidasBrutas`) e a parte de terceiros (`terceirosNasSaidas`). Entradas: só a minha parte. **Não seguem a responsabilidade na base caixa:** entradas de terceiros (seria `entradasDeCaixa − minha.entradas`, uma conta nova), a evolução de terceiros e a bruta, e a rosca e a forma de pagamento em Terceiros e Consolidado. Esses mostram "não segue a responsabilidade na base caixa", sem subtração | L1 aplicada à responsabilidade. Custo: Terceiros na base caixa fica quase vazio |
| D-A2-22 | **Setas de comparação só em "Meu" e sem recorte**, por `comparacaoDosIndicadores` (K7), como na prévia. Nos outros casos, o indicador escreve "sem comparação neste recorte" | Evita inventar o "sentido" de terceiros subir. Custo: nenhuma seta em Terceiros nem em Consolidado |
| D-A2-23 | **O relatório passa a ler com `ESCOPO_PAINEL`** (os recebíveis crus, com a pessoa, saem da mesma leitura). As listas dos `<select>` vêm de leituras que já existem: contas e cartões de `lerFinanceiro`, categorias de `getCategories`, pessoas de `getPeople` (ou equivalentes já existentes; nenhuma leitura nova de tabela). O recorte de **cartão** também filtra a lista crua de recebíveis por `card_id` (pendente do cartão). O de **conta** não alcança o pendente: o recebível cru não sabe a conta, e o pendente até hoje vai além da janela de lançamentos lida | `ESCOPO_PAINEL` já existe (04-A) |
| D-A2-24 | **Combinação cartão + categoria** (D-A2-2): `aplicarRecorte` aplica os dois, e o alcance fica `"itens"`. Valem as regras da categoria, sobre os itens daquele cartão | O mais restritivo vence, pelo tipo |
| D-A2-20 | **O teste de conciliação** (§6) alimenta com a **mesma fixture sintética** a montagem do painel e a do relatório sem recorte, em "meu" e na mesma base, e compara os quatro indicadores, a barra do mês e a soma da rosca (−estornos +não-positivos), centavo a centavo. Com estorno de cartão e pendente na fixture | O pedido do dono: "totais conciliam" |

## 4. A tela, de cima para baixo (≥ 1280 px)

1. **Cabeçalho**: título, descrição e "Baixar relatório (JSON)", como hoje.
2. **Abas**: Financeiro · Cartões · Hábitos · Estudos · Tarefas, como hoje.
3. **Barra de filtros** (um `Bloco` sem título):
   - **Período**: o `<input type="month">` de hoje.
   - **Base**: `SeletorDeVisao` (D-A2-5).
   - **Responsabilidade**: `SeletorDeVisao` com Meu · Terceiros · Consolidado.
   - Os quatro `<select>`: Conta, Cartão, Pessoa e Categoria. Cada um com "Todas as …" e a lista do dono, e com borda primária quando ligado.
   - A linha de chips "Filtros ativos" com × e "Limpar filtros".
4. **Aviso "parcial"**: só aparece quando a leitura é parcial.
5. **Resumo**: os quatro `Indicador` por responsabilidade (L2), com o olho no Saldo. Na base caixa, o **Bloco do caixa**
   fica logo abaixo, como hoje.
6. **Evolução**: as barras de entradas × saídas por responsabilidade (~⅔) e o "Meu mês a mês" (~⅓).
7. **Composição**: a rosca de categorias e a forma de pagamento (½ cada).
8. **Detalhamento**:
   - o card meu × bruto × terceiros, com o perdoado e o pendente do mês (`fraseDoPerdoado`, `rotuloPendenteDoMes`);
   - os Maiores gastos por categoria, com o CSV;
   - Assinaturas e recorrências.
9. **Projeções**: a minha projeção, com hachura, e as Faturas dos próximos meses, em valor cheio.

Com recorte, cada bloco que segue ganha o selo "filtrado: <nome>" no canto. O bloco que não segue mostra o estado
"Não segue o filtro de <tipo>", com o motivo e "Ver sem o filtro". Esse estado é **um quarto desenho**, distinto do
vazio, do zero medido e da falha de leitura (`Bloco` ganha o estado `nao-segue`, e `Indicador` ganha
`valor: {naoSegue: texto}`).

**Antes → depois** (todo item do §2 tem destino, e o teste de inventário confere):

| Item de hoje | Para onde vai |
| --- | --- |
| 1 | 3 |
| 2 | 5 (Saldo das contas · em DD/MM) |
| 3 | 5 (Minhas entradas; o bruto fica em Consolidado) |
| 4 | 5 (Minhas saídas; o bruto continua em 8) |
| 5 | 5 em Terceiros e Consolidado, e 8 sempre |
| 6 | 5 |
| 7 | 7 (rosca) |
| 8 | 7 |
| 9 | 6 (barras) |
| 10 | 6 |
| 11 e 12 | 9 |
| 13, 14 e 15 | 8 |

**Celular (390 px):**
- o Saldo grande;
- os outros três indicadores pequenos, em linha (como o painel);
- os blocos empilhados;
- os recortes em "Mais filtros (n)".

## 5. Matriz de recorte (L1): o que segue

`✓` = segue: o motor roda sobre as entradas recortadas. `✗` = estado "não segue", com o motivo. A tabela é
`SEGUE_O_RECORTE`; os motivos abaixo são os da prévia.

| Bloco | Cartão | Conta | Categoria | Pessoa |
| --- | --- | --- | --- | --- |
| Saldo | ✗ cartão não tem saldo | ✓ saldo da conta | ✗ | ✗ |
| Entradas (meu, terceiros, bruto) | ✗ estorno não é entrada | ✓ | ✓ (receitas da categoria) | ✗ |
| Saídas — minha parte / bruto | ✓ | ✓ (só à vista) | ✓ (fatia da rosca; o bruto avisa que estornos ficam fora) | ✗ a fatura é um total só |
| Saídas — de terceiros | ✓ | ✓ | ✓ (`movimentado − meu`) | ✗ (L5) |
| Pendente de terceiros | ✓ (recebíveis crus do cartão) | ✗ o recebível não sabe a conta | ✗ | ✓ (L5) |
| Setas de comparação | ✗ (D-A2-22) | ✗ | ✗ | ✗ |
| Barras entradas × saídas | ✓ só as saídas (as entradas não seguem, e isso é dito) | ✓ | ✗ (L4) | ✗ |
| Meu mês a mês | ✗ compara só o à vista | ✓ | ✗ (L4) | ✗ |
| Rosca de categorias | ✓ | ✓ | ✗ uma categoria só | ✗ |
| Forma de pagamento | ✗ é sempre crédito | ✓ | ✓ | ✗ |
| Meu × bruto × terceiros | ✓ | ✓ | ✗ (L4) | ✗ |
| Maiores gastos por categoria | ✓ | ✓ | ✓ (uma linha) | ✗ |
| Assinaturas | ✗ | ✗ | ✓ | ✗ |
| Minha projeção | ✗ | ✗ | ✗ | ✗ |
| Faturas dos próximos meses | ✓ | ✗ | ✗ | ✗ |
| Na base caixa (todo bloco de caixa) | ✗ (D-A2-6) | ✗ | ✗ | ✗ |

Cartão + categoria juntos (D-A2-24): vale a coluna Categoria, sobre os itens daquele cartão. Responsabilidade na base
caixa: D-A2-21.

## 6. Testes que este desenho exige (o plano detalha; TDD, com mutação)

1. **`recorte.test.ts`** — `aplicarRecorte`. Para cada tipo:
   - o que fica e o que sai, com fixture sintética;
   - conta × cartão se excluem;
   - id desconhecido é ignorado;
   - os totais do motor sobre o recorte por cartão somam as faturas daquele cartão;
   - a soma dos recortes de todos os cartões mais o à vista dá o bruto sem recorte;
   - o retorno de `recortarPorCategoria` não tem nenhuma lista do motor (varredura das chaves do objeto, D-A2-14);
   - a fatia da categoria em "Minhas saídas" é igual à fatia da rosca sem recorte, centavo a centavo.
2. **`SEGUE_O_RECORTE`** — toda célula da §5 tem valor e todo ✗ tem motivo não vazio. Varredura do vocabulário
   proibido (`src/lib/tone/`).
3. **Conciliação** (D-A2-20) — painel × relatório sem recorte, "meu", nas duas bases.
4. **Responsabilidade:**
   - em Consolidado, nenhum texto contém "meu gasto" nem rotula o bruto como meu;
   - Terceiros + Meu = Consolidado em centavos, para entradas e saídas;
   - a evolução escolhe o campo certo.
5. **Inventário** — os 15 itens do §2 continuam na fonte de `relatorios-client.tsx`, ou o substituto declarado.
6. **URL:**
   - parse dos sete parâmetros;
   - parâmetro inválido ou desconhecido é ignorado;
   - escolher conta limpa cartão e vice-versa;
   - "Limpar filtros" volta ao padrão e mantém `mes`.
7. **L3:**
   - a dica é `<details>` (varredura da fonte de `indicador.tsx`, sem `title=` como único caminho);
   - com o olho fechado, existe texto "valor oculto" acessível;
   - a legenda "parcial" não aparece com o gráfico vazio.
8. **D-A2-5** — o botão ligado de `SeletorDeVisao` tem a classe de fundo primário e o ✓, e `aria-pressed` continua.
9. **`entradas-do-card.test.ts`** — o relatório sai da lista de `apresentarEntradas` (L2), e `it` afirma
   `indicadoresDoResumo` no relatório. É declarado, não apagado.
10. **`perf:bundle`** — `/relatorios` dentro do teto. Gráfico novo, se houver, entra por fachada + `-impl` com
    `next/dynamic` (objeto literal).

## 7. Testes existentes que vão mudar (declarado)

- `src/lib/finance/entradas-do-card.test.ts`: afirma que `relatorios-client.tsx` lê `apresentarEntradas`, e a L2
  troca isso. O teste passa a afirmar que **só o dashboard geral** (06) ainda usa `apresentarEntradas`.
- O teste de inventário do painel (`painel-inventario.test.ts`): **não deve mudar**. Se mudar por causa da
  D-A2-15, o motivo vai para o §13.
- Os testes de `SeletorDeVisao` (D-A2-5), se afirmarem a classe do ligado.

## 8. Restrições (valem até o fim)

- O diretório principal não é tocado. A única exceção é ler o `.env.local`, e só com o aval do dono.
- As outras worktrees não são tocadas.
- O print nunca entra no repositório.
- Banco só leitura, com md5 dos saldos antes e depois; migration só depois de um "aplique" literal do dono. Esta
  subfase não prevê nenhuma.
- Fixture **sintética** sempre, e o diff revisado antes de cada commit (chave, token, `.env`, `service_role`, nome
  real).
- Nenhum `Date.now()` ou `new Date()` sem argumento em código novo: `hoje` é injetado.
- Sem prettier. CRLF normalizado com `sed` antes de commitar. `git checkout -- AGENTS.md` depois de qualquer
  `next dev`.
- Commits com título em pt-BR sem acento, por `git commit -F`, terminando com `Co-Authored-By: Claude Opus 5.5
  <noreply@anthropic.com>`.
- `docs/redesign/STATUS.md`, `CLAUDE.md` e `AGENTS.md` **não** são editados.

## 9. Aceite

1. A aba usa `Indicador`, `Bloco`, o olho e os gráficos da 04-A, importados, nunca copiados (varredura de fonte).
2. A barra de filtros tem os sete controles, tudo na URL, e nenhum campo de texto controlado pela URL.
3. Sem recorte, os totais conciliam com o painel no mesmo mês e na mesma base (teste, D-A2-20).
4. Com recorte, todo bloco segue a §5; nenhum ✗ mostra número.
5. A rosca não tem negativo; a projeção e o mês em andamento são visualmente distintos do realizado.
6. Nenhum item do §2 some (teste de inventário).
7. "Parcial" visível quando a leitura é parcial.
8. RR-C2-10: o botão ligado e o desligado se distinguem no escuro por forma e cor.
9. L3 nos dois lugares (painel e relatório).
10. Aceite visual de `REFERENCIA-VISUAL.md` §7: prévia aprovada ✅; conferência no navegador a 390, 768, 1280 e
    1440 px, claro e escuro, **com a sessão do dono** (se pedir login, parar e pedir para ele entrar).
11. Os cinco comandos verdes, com `/relatorios` dentro do teto; `TZ=UTC` nos arquivos tocados.
12. Banco: md5 dos saldos igual ao da linha de base.

## 10. Ordem de execução (o plano detalha; um commit por passo)

1. Motor: os dois campos opcionais (D-A2-13), `aplicarRecorte` e `SEGUE_O_RECORTE` (D-A2-14), puros e com teste.
2. Responsabilidade: `indicadoresDoResumo` (D-A2-15), `evolucaoDaResponsabilidade` e as fatias por
   responsabilidade (D-A2-16/17), com o painel migrado para a função compartilhada e o teste de conciliação
   (D-A2-20).
3. Peças: L3 (dica, olho, legenda); o estado "não segue" em `Bloco` e `Indicador`; D-A2-5 em `SeletorDeVisao`.
4. URL e barra de filtros: o parse, a página lendo os sete parâmetros e a lista de contas, cartões, pessoas e
   categorias, e o componente da barra.
5. A aba Financeiro reescrita na sequência do §4, com o inventário.
6. Conferência visual, a revisão final da branch inteira no modelo mais capaz, e o §13 preenchido.

## 11. Fora daqui, com destino

| Item | Destino |
| --- | --- |
| Recortes na base caixa (D-A2-6) | 04-B (abrir os registros por trás do caixa) ou subfase própria |
| Projeção da parte de terceiros (D-A2-7) | sem destino: exigiria regra nova; registrado |
| Seleção múltipla de recortes e exportação com filtros | 04-D |
| Abrir os registros por trás de cada indicador | 04-B |
| Ficha por pessoa | 04-C |
| "meu × meu" no dashboard geral (`apresentarEntradas`) | 06 |
| Achados do §13.5 da 04-A que não estão nas peças reusadas (6 ciclos, "em N×", log de falha, `resumoAtual`, `truncate` em `<td>`, seta do caixa) | continuam no §13.5 da 04-A |

## 12. Riscos

- **O estado "não segue" pode aparecer muito** com o recorte de pessoa: ele é estreito de propósito (D-A2-9).
- **D-A2-5 muda o seletor em todas as telas.** É a correção pedida, mas ela é visível fora do relatório.
- **D-A2-15 mexe no painel já aprovado.** A garantia é o teste de inventário e o de conciliação do painel
  continuarem verdes sem edição.
- **O recorte de conta não conhece transferência**, porque `resumoMes` já a exclui. O saldo da conta sim, e é
  aí que ela aparece.

## 13. Resultado da execução

*(preenchido no fim: commits, os cinco comandos, aceite um a um, decisões tomadas na execução com o custo se
estiverem erradas, e os achados não consertados.)*
