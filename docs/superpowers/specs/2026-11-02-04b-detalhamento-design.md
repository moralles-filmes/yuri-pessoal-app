# REDESIGN-04-B — Detalhamento: cada número abre os registros que o explicam (desenho)

**Data:** 2026-11-02 · **Branch:** `feat/redesign-04b-detalhamento` (worktree `C:/tmp/04b-detalhamento`, criada de
`feat/redesign-00-auditoria` em `0f1358f`; portão `a428f1b` (04-A2), `1d5fefa` (05-B) e `851ed79` (05-C) ancestrais ✅) ·
**Telas:** `/dashboard/financeiro` e `/relatorios` (aba Financeiro)

**Fontes:** `PLANO.md` §REDESIGN-04 (o aceite "todo indicador abre os registros que o explicam · totais conciliam");
`STATUS.md` (04-A, 04-A2, "Próximo passo"); `METRICAS-FINANCEIRAS.md`; `REFERENCIA-VISUAL.md` §2, §4, §6 e §7; os
desenhos da 04-A (§13) e da 04-A2 (L1–L5, D-A2-*, §11, §13 e a leitura R6 do §13.4). Código lido: `dashboard.ts`,
`painel.ts`, `recorte.ts`, `caixa.ts`, `caixa-minha-parte.ts`, `caixa-leitura.ts`, `recebimentos.ts`, `pipeline.ts`,
`reports/financeiro.ts`, `reports/url-do-relatorio.ts`, as peças de `src/components/shared/painel/` e a página de
Lançamentos.

**Prévia aprovada pelo dono em 2026-11-02** ("Aprovado!"): Artifact privado `https://claude.ai/artifact/7M32NegMSqV64CwshzWDnp`, só com dado sintético.

**Quem decidiu:** o dono delegou o desenho ("faz como ficar melhor na sua sugestão", 2026-11-02). Toda decisão
abaixo é **minha**, com o custo se estiver errada, para o dono conferir na leitura. A **prévia** com dado sintético
é aprovada por ele antes de qualquer código.

**Publicação (D67):** sem push, sem PR, sem merge em `main`, sem deploy. Commits locais, um por passo.

---

## 1. Intenção

Hoje os indicadores do painel apontam para `/financeiro/lancamentos?type=despesa&month=…`. **Essa lista não explica
o número.** Ela filtra pela competência do *lançamento*, enquanto o motor soma o cartão pelo mês da *fatura*. Ela não
traz parcelas, porque a parcela não está em `transactions`. E ela não tem "minha parte". Somar o que ela mostra dá
outro valor, e o dono não tem como saber qual dos dois está certo.

A 04-B entrega o caminho de volta: **cada número abre os registros que o compõem, separados do mesmo jeito que o
motor os separou, e a soma deles fecha com o número**. Quando não fecha, a tela diz quanto falta. Ela nunca esconde a
diferença.

**Objetivos**
- Cada indicador e cada bloco numérico do Painel e da aba Financeiro do Relatório abre os seus registros.
- Os registros vêm dos mesmos mês, base, responsabilidade e recortes da tela, e da **mesma leitura**.
- Σ dos registros, na coluna que o indicador usa, é igual ao número exibido. Isso é provado por um teste que **não
  passa por construção**.
- Cada registro mostra o bruto e a minha parte quando divergem.
- Vazio, falha, parcial e "não segue" são quatro coisas distintas.

**Não-objetivos**
- Exportação e seleção múltipla de recortes (é da 04-D).
- Ficha por pessoa e `/terceiros` (é da 04-C).
- Dashboard geral (é da 06).
- Recortes na base caixa (D-B-7).
- Editar um lançamento de dentro da gaveta.

**Anti-objetivos (reprova mesmo "funcionando")**
- Um segundo cálculo do total na tela: o total da gaveta é o número do motor, nunca a soma da lista.
- Σ ≠ número sem aviso.
- Lista vazia mostrando "R$ 0,00".
- Falha de leitura mostrando lista vazia.
- Projetado misturado com realizado, ou sem marca.
- O bruto rotulado como "meu".
- Detalhamento oferecido num bloco em "não segue".
- Valor à mostra com o olho fechado.
- Nome real, valor real ou print em arquivo versionado.
- Qualquer número do painel ou do relatório mudando.

## 2. Linha de base

A conferir em `0f1358f`, na worktree, antes do primeiro commit de código (vai para o §13): os cinco comandos, mais
`perf:bundle` de `/dashboard/financeiro` e `/relatorios`.

**Banco:** só leitura. O md5 dos saldos (`15d93bd1c1d3e55a40db6210dff0eb3b`) é conferido no início e no fim. **Esta
subfase não prevê migration.**

## 3. Decisões (minhas, para conferir)

| | Decisão | Por quê / custo se estiver errada |
| --- | --- | --- |
| **D-B-1** | **Onde abrir: uma gaveta lateral sob demanda, aberta pela URL.** `?detalhe=<chave>` (mais `&alvo=<id>` quando o número é de uma fatura, categoria, pessoa ou forma) é acrescentado à URL da própria tela, com todos os filtros que ela já tem. A **página (Server Component)** monta o detalhe só quando o parâmetro existe, a partir das **mesmas entradas** que montaram o número, e o entrega à tela. A gaveta (`Sheet`) entra por `next/dynamic` + `useLazyDialog`. Fechar tira `detalhe`/`alvo` da URL (`router.replace`, sem rolar). O link é compartilhável, e voltar fecha a gaveta | Recusadas: **rota própria** (perde a tela de fundo, repete o parse dos filtros e a leitura, e "voltar" perde a posição); **lista de Lançamentos com filtros** (não concilia: competência × fatura, sem parcelas, sem "meu", teto de 500). Custo: abrir é uma ida ao servidor (um RSC, como trocar um filtro), e o painel relê os dados a cada abertura. Medir no `perf:bundle`: a gaveta não pode entrar no manifest da rota |
| **D-B-2** | **O modelo é puro e único: `detalheDoNumero`** em `src/lib/finance/detalhe.ts` (sem I/O, sem relógio, sem `server-only`). Recebe a chave, o alvo, mês, `hoje`, base, responsabilidade, as entradas **já recortadas**, o caixa lido e a completude. Devolve `Detalhe`: título, o **total do motor**, a coluna que concilia, grupos de registros, a conciliação e o estado. O painel e o relatório chamam a mesma função | Uma montagem só. Custo: o painel passa a ter um modelo de vista para o detalhe, o que ele não tinha |
| **D-B-3** | **Os registros saem dos classificadores que o motor já usa, nunca de um filtro novo.** Competência: as saídas vêm de `buildSpendItems` (o mesmo de `gastosPorCategoria`/`itensDasFaturas`), exportado como `itensDeGasto`, mais os estornos de `itensDasFaturas`. As entradas usam o predicado de receita de `resumoMes`, **extraído** para uma função (`ehEntradaDeConta`) que `resumoMes` passa a chamar (sem mudar número; `dashboard.test.ts` intocado). Caixa: os registros vêm de `movimentos` (`caixa-minha-parte.ts`, exportado), e a minha parte do pagamento de fatura vem de `meuDoPagamento`. Os reembolsos recebidos vêm de `entradasDoRecebivel`, recebimento a recebimento. Pendente: `totalPendenteAte`, recebível a recebível | Regra nova seria um segundo juiz do mesmo dinheiro. Custo: três funções internas do motor passam a ser exportadas (estão declaradas em `fronteira-do-motor.test.ts`) |
| **D-B-4** | **O total da gaveta é o número do motor.** A soma da lista é calculada no modelo só para a **conciliação**: `{ soma, total, diferenca }`. Com `diferenca ≠ 0`, a gaveta escreve **"Diferença não explicada pelos registros: R$ X"** com o motivo provável (fatura com total da view ≠ soma dos itens lidos; compra fora da janela de leitura). Nunca ajusta, nunca esconde | O cartão soma `total_atual` da **view**, não os itens. Em dado real eles podem divergir (item fora da janela lida). Custo: uma linha de aviso que pode aparecer em dado real e assustar; ela é verdadeira |
| **D-B-5** | **Coluna que concilia.** Cada registro tem `bruto`, `meu` e `terceiros` (centavos). A gaveta mostra o bruto sempre, e "minha parte" e "de terceiros" só quando divergem do bruto. A coluna somada vem do indicador: Minhas entradas/saídas → `meu`; De terceiros → `terceiros`; Consolidado e "bruto" → `bruto`; pendente → `pendente`. Ela vem destacada, e o rodapé diz "soma da minha parte" (ou da coluna certa) | Custo: três números por linha no desktop. No celular a coluna que concilia fica em destaque e as outras descem para uma segunda linha |
| **D-B-6** | **Cartão por fatura, à vista por lançamento.** Os registros de saída da competência são agrupados em "À vista" (lançamento a lançamento) e "Cartão X · fatura com vencimento em DD/MM" (compras, parcelas `k/N` e estornos com valor negativo e a marca "estorno"). O cabeçalho do grupo da fatura traz o `total_atual` e, se divergir da soma dos itens, a diferença daquela fatura (D-B-4) | É o jeito como o motor soma: a fatura é a unidade. Custo: a gaveta das saídas fica longa num mês com muitas compras (teto de exibição, D-B-10) |
| **D-B-7** | **D-A2-6 decidido: a 04-B abre os registros por trás do caixa, SEM recorte.** Na base caixa, sem recorte, todo número abre: renda pessoal, reembolsos (por recebimento), outras entradas de terceiros, saídas (despesas com conta, pagamentos de fatura, transferências sem destino) e entre contas (informativa). Com recorte, o bloco segue "não segue" (D-A2-6) e **não oferece detalhamento**. Recortar o caixa continua sendo uma subfase própria | Recortar o caixa exigiria um segundo caminho de filtro (D-A2-6). Abrir sem recorte é só listar o que `movimentos` já classifica. Custo: quem quiser "o caixa do cartão X" continua sem |
| **D-B-8** | **Caixa: data aproximada declarada.** Registro com `liquidado_em` nulo (cai na competência) leva a marca **"data aproximada"**, e o topo da gaveta diz "N registros com data aproximada (competência)". O número sai de `numerosDoCaixa().aproximados`, e o teste confere que é a contagem da lista. Pagamento de fatura sem total na view leva "contado cheio" (`faturasSemTotal`) | A 03-E já declara isso no bloco; a gaveta mostra **quais** são |
| **D-B-9** | **Previsto × realizado × projetado.** Na competência, o registro ainda não acontecido leva a marca **"previsto"**: status fora de `SETTLED_STATUSES` (ex.: pendente com data futura no mês), ou item de fatura ainda não paga. A **projeção** é uma gaveta própria (`detalhe=projecao`): faturas pelo vencimento (minha parte), ocorrências de recorrências e contas fixas, todas com a marca **"projetado"** e o desenho hachurado. Ela nunca é misturada com a gaveta de um número realizado | O aceite da 04 ("série futura visualmente distinta"), agora na lista. Custo: `ocorrenciasNoMes` passa a ser exportada do motor |
| **D-B-10** | **Estados da gaveta (quatro, distintos), mais o aviso de parcial.** **Vazio:** "Nenhum registro neste mês", sem total em R$. **Falha:** caixa não lido, ou leitura do saldo/pendente com erro; desenho de falha do `Bloco`, nunca lista vazia. **Não segue:** o bloco ✗ não tem link, e um `?detalhe=` digitado à mão para ele devolve o estado "não segue" com o motivo e "Ver sem o filtro", sem lista. **Parcial** (aviso sobre a lista, não um quinto estado): a leitura é parcial (`completude`, teto de 2000 lançamentos, teto de 5000 do caixa); os motivos aparecem e a conciliação diz "pode faltar registro". **Teto de exibição:** 300 registros por gaveta, conferidos com **TETO + 1** (regra 29): passando, "mostrando 300 de N; o total continua o do motor" | Regra 29 e 03-G. Custo: num mês com mais de 300 itens o dono não vê todos na gaveta. A lista inteira chega pela exportação (04-D) |
| **D-B-11** | **Recortes (relatório).** O detalhe recebe as entradas de `recortarEntradas` (cartão e conta) e as mesmas listas cruas recortadas (pessoa e cartão no pendente). Com o recorte de **categoria**, a lista é a dos itens daquela categoria (o mesmo filtro da fatia, D-A2-10), e a gaveta diz "antes dos estornos do cartão", como o indicador. Quem decide se um número abre é `naoSegue` (a matriz da 04-A2), e nenhuma célula nova é inventada | Mesma janela e mesmo filtro do número, por construção |
| **D-B-12** | **Saldo das contas abre "saldo por conta".** Saldo não tem "registros" num mês: é a história inteira. A gaveta lista cada conta com o saldo até hoje (`lerSaldoAte(conta)`, que já aceita a conta desde a D-A2-12). São N chamadas da **mesma** RPC, só quando a gaveta abre; a soma é comparada com o indicador (D-B-4). A falha de uma conta vira "não foi possível ler o saldo desta conta" e a conciliação diz "parcial" | Custo: N idas ao banco ao abrir (N ≈ número de contas). Nenhuma RPC nova, nenhuma migration |
| **D-B-13** | **O olho chega à gaveta pelo contexto, não pelo DOM.** A gaveta é renderizada num *portal*, fora do invólucro `group/olho`, e o seletor CSS não a alcança. O portal preserva o **contexto React**: `olho-dos-valores.tsx` passa a exportar `useOlhoDosValores()`, e a gaveta põe `data-ocultar` + `group/olho` no próprio invólucro. Os valores usam `ValorComOlho` ("valor oculto" para leitor de tela) | Armadilha real: sem isso, abrir a gaveta com o olho fechado mostraria todos os valores. Teste de fonte e conferência visual. Custo: um export a mais numa peça comum (D-B-15) |
| **D-B-14** | **Os links de entrada.** `Indicador` **já tem** `href`/`hrefRotulo` ("Ver registros" por padrão): a 04-B só troca o destino de `/financeiro/lancamentos?…` para `?detalhe=…`. Nos blocos, a entrada vai no slot `acao` que o `Bloco` já tem (um link "Ver registros"). Nas listas (cartões, próximas faturas, pendente por pessoa, legenda da rosca), cada linha ganha o link para o seu alvo. Os links são `<Link scroll={false}>`, sem JS novo nas peças | Nenhuma assinatura de peça muda (pedido do prompt, por causa da 06). Custo: o atalho direto para Lançamentos sai dos indicadores; ele continua no rodapé da gaveta ("Abrir em Lançamentos", com o aviso de que lá a soma é outra) |
| **D-B-15** | **Peças comuns: o que muda em `src/components/shared/painel/`** (declarado para a 06). **Nova:** `gaveta-de-registros.tsx` (fachada com `next/dynamic`) + `gaveta-de-registros-impl.tsx`. **Estendida sem mudar assinatura:** `olho-dos-valores.tsx` ganha o export `useOlhoDosValores`. **Nada** em `indicador.tsx` nem em `bloco.tsx` | A 06 pode reusar a gaveta. Conflito provável só no `olho-dos-valores.tsx`, e é um export acrescentado |
| **D-B-16** | **Pendência herdada consertada aqui:** `?mes=2026-13` passa na regex nas duas páginas, e um mês além da janela mostrava R$ 0,00. Na gaveta isso viraria "Nenhum registro", **um vazio falso**. As duas páginas passam a validar o mês (`01`–`12`) por uma função pura comum. As outras pendências do §13.5 da 04-A2 e da 04-A **não** tocam as peças desta fase e ficam onde estão (§11) | Barato, e impede o vazio falso. Custo: nenhum |
| **D-B-17** | **Gráficos não abrem.** Barras de 6 meses, "Meu mês a mês" e evolução **não** abrem gaveta. Cada barra é o indicador do seu mês, e "abrir aquele mês" é trocar `?mes=`. O bloco ganha a frase "para ver os registros de um mês, escolha o mês no topo" | Abrir por barra exigiria clique em SVG (JS no gráfico, acessibilidade ruim no recharts). Custo: um passo a mais para olhar um mês antigo |

## 4. O que abre (inventário, testado)

| Tela · número | `detalhe` | `alvo` | Coluna que concilia | Fonte do total (o "outro lado" do teste) |
| --- | --- | --- | --- | --- |
| Saldo das contas · em DD/MM | `saldo` | — | saldo | `lerSaldoAte(null)` × Σ `lerSaldoAte(conta)` (D-B-12) |
| Minhas entradas | `entradas` | — | meu | `resumoMes().entradasMeu` |
| Entradas (Terceiros / Consolidado, relatório) | `entradas` | — | terceiros / bruto | `entradasTerceiros` / `entradas` |
| Minhas saídas | `saidas` | — | meu | `resumoMes().meu` |
| De terceiros (nas saídas) | `saidas` | — | terceiros | `resumoMes().terceiros` |
| Saídas (bruto, Consolidado; card meu × bruto × terceiros) | `saidas` | — | bruto | `resumoMes().saidas` |
| Gasto no cartão · Cartão realmente meu (painel) | `cartao` | — | bruto / meu | `resumoMes().cartao` / `cartaoMeu` |
| Pendente de terceiros (até hoje; por pessoa) | `pendente` | pessoa | pendente | `totalPendenteAte` (por pessoa: `aReceberPorPessoa`) |
| Pendente referente ao mês | `pendente-do-mes` | — | pendente | `totalAReceber(recs, mes)` |
| Rosca de categorias · Maiores gastos (uma fatia) | `categorias` | categoria | conforme a responsabilidade | `gastosPorCategoria()` (a fatia) |
| Forma de pagamento (uma fatia) | `formas` | forma | conforme a responsabilidade | `gastosPorForma()` (a fatia) |
| Cartões de crédito (fatura atual) · Próximas faturas · Faturas dos próximos meses | `fatura` | fatura | bruto | `total_atual` da fatura |
| Minha projeção | `projecao` | mês | projetado | `projecaoProximosMeses().total` do mês |
| Próximas contas a pagar (painel) | `contas` | — | projetado | `proximasContasPagar().total` |
| Base caixa: renda, reembolsos, outras entradas, saídas, pagamentos de fatura, sem destino, entre contas | `caixa` | linha | conforme a linha | `numerosDoCaixa()` e `minhaParteDoCaixa()` |
| Base caixa: Minhas entradas / Minhas saídas / De terceiros | `entradas` / `saidas` | — | meu / terceiros | `minhaParteDoCaixa()` |

**Não abrem, e o inventário confere a ausência:** barras, mês a mês, evolução (D-B-17); "Faturas (aberta/fechada)",
que é contagem; "Últimas transações", que já é lista; Assinaturas, que já é lista e é regra, não registro; e todo
bloco em "não segue".

## 5. A gaveta (prévia)

- **Topo:** título ("Minhas saídas · novembro de 2026"), a linha de base ("competência · minha parte" ou "caixa ·
  minha parte"), os chips dos recortes ativos e o **total do motor** em destaque.
- **Avisos**, quando houver: parcial (com motivos), N com data aproximada, teto de exibição.
- **Grupos:** "À vista" e uma seção por fatura ("Cartão A · vence 18/11 · R$ 220,00"). No caixa: "Despesas pagas",
  "Pagamentos de fatura", "Transferências sem destino".
- **Linha:** data, descrição, origem (conta, cartão ou pessoa), categoria, a coluna que concilia em destaque e o bruto
  (e a outra parte) quando diverge. Marcas: `estorno`, `parcela 3/10`, `previsto`, `projetado`, `data aproximada`,
  `contado cheio`.
- **Rodapé:** "Soma da minha parte: R$ X = total" ✓, ou "Diferença não explicada pelos registros: R$ Y" com o motivo.
  Mais o link "Abrir em Lançamentos", com a frase "lá os lançamentos são filtrados pela competência, sem parcelas, e a
  soma não é esta".
- **Celular (390 px):** a gaveta ocupa a largura toda, de baixo para cima. A linha vira dois andares (descrição em
  cima; data, origem e marcas embaixo; valor à direita), sem rolagem horizontal.
- **Teclado e leitor de tela:** foco preso no `Sheet` (Radix), `Esc` fecha. O título é o `SheetTitle`. Cada valor
  oculto anuncia "valor oculto".

## 6. Testes que este desenho exige (TDD, com mutação confirmada)

1. **Conciliação (o teste central).** Fixture **sintética nova**: "Conta A/B", "Cartão A/B", "Pessoa A/B",
   "Categoria A…E", valores inventados. Ela tem estorno de cartão, compra parcelada (parcela `k/N` na fatura do
   mês), divisão com terceiro à vista e no cartão, um recebível com recebimento parcial, uma despesa pendente com
   data futura no mês, um lançamento com `liquidado_em` nulo, um pagamento de fatura e uma transferência sem
   destino. Para **cada chave do §4**:
   - Σ dos registros **somada no próprio teste**, em centavos, na coluna da chave;
   - = o número do motor pela **função agregadora existente** (`resumoMes`, `gastosPorCategoria`,
     `minhaParteDoCaixa`, `numerosDoCaixa`, `totalPendenteAte`, `projecaoProximosMeses`…);
   - = um **literal escrito à mão** no comentário do teste, a partir da fixture.

   ⛔ **Por que não passa por construção:** o terceiro lado (o literal) não vem de função nenhuma. Os agregadores do
   motor têm laço próprio (`resumoMes` não usa `buildSpendItems`; o cartão soma `total_atual`, não itens). **Mutação
   obrigatória:** mudar o classificador (ex.: tirar o estorno, ou contar a compra-pai do parcelamento) derruba o
   teste pelo literal, e mudar `resumoMes` derruba pelo agregador. As duas ficam registradas no §13.
2. **Diferença declarada.** Uma fatura com `total_atual` ≠ Σ itens (item fora da janela) produz
   `diferenca ≠ 0` e a frase do D-B-4. Nunca um total ajustado.
3. **Estados.** Lista vazia não tem "R$" no texto; caixa com erro → `falha`; chave ✗ por `naoSegue` → `nao-segue`
   sem registros; completude parcial → aviso; 301 registros → teto declarado (TETO + 1).
4. **Marcas.** `liquidado_em` nulo → "data aproximada", e a contagem = `numerosDoCaixa().aproximados`; status não
   liquidado → "previsto"; toda linha de `projecao` → "projetado"; estorno negativo → "estorno".
5. **Recortes.** Cartão, conta e categoria: os registros são só os do recorte, e Σ = o número do relatório com o
   mesmo recorte (`montarRelatorioFinanceiro`). Pessoa: só `pendente` abre.
6. **URL.** `urlDoDetalhe` preserva todos os parâmetros da tela; fechar tira só `detalhe`/`alvo`; `alvo`
   desconhecido → estado vazio com "registro não encontrado", nunca outro alvo; chave desconhecida → sem gaveta.
7. **Inventário.** Todo número do §4 tem link na fonte das duas telas, e os que "não abrem" não têm link.
8. **Olho (D-B-13).** Varredura da fonte: a gaveta usa `useOlhoDosValores` e `ValorComOlho`, e nenhum
   `formatCurrency` cru é renderizado na lista. Conferido também no navegador.
9. **Carregamento sob demanda.** A gaveta só entra por `next/dynamic` com objeto literal (varredura da fonte). O
   `perf:bundle` mostra as duas rotas dentro do teto e registra o antes e o depois.
10. **Mês inválido (D-B-16).** `?mes=2026-13` cai no mês atual nas duas páginas.
11. `TZ=UTC npx vitest run src/lib/finance src/lib/reports` verde.

## 7. Testes existentes que vão mudar (declarado)

- `painel-links.test.ts` / `painel-inventario.test.ts`: os `href` dos indicadores mudam de
  `/financeiro/lancamentos?…` para `?detalhe=…` (D-B-14). A afirmação muda; nenhum teste é apagado.
- `fronteira-do-motor.test.ts`: os novos exports do motor (`itensDeGasto`, `ehEntradaDeConta`,
  `ocorrenciasNoMes`, `movimentos`/`meuDoPagamento`) entram na lista declarada.
- `relatorio-inventario.test.ts`: ganha os links do detalhe; os 15 itens continuam.

## 8. Restrições (valem até o fim)

- O diretório principal não é tocado (outra sessão está nele). As outras worktrees também não. O `.env.local` só é
  lido com o aval do dono.
- O print nunca entra no repositório.
- Banco só leitura, com o md5 dos saldos antes e depois. Migration, nenhuma prevista; se surgir, só depois de um
  "aplique" literal.
- Fixture sintética sempre. O diff é revisado antes de cada commit.
- Nenhum `Date.now()` nem `new Date()` sem argumento em código novo.
- Sem prettier. CRLF normalizado com `sed`. `git checkout -- AGENTS.md` depois de `next dev`.
- `STATUS.md`, `CLAUDE.md` e `AGENTS.md` não são editados.
- Commits em pt-BR sem acento, por `git commit -F`, com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## 9. Aceite

1. Todo número do §4 abre a gaveta nas duas telas, com os filtros da tela, e o link é compartilhável.
2. Σ registros = número exibido, por teste em três lados (registros × agregador × literal), com mutações registradas.
3. Diferença, quando existe, é declarada com valor e motivo.
4. Vazio, falha, "não segue" e parcial são distintos; nenhum vazio mostra R$ 0,00.
5. Data aproximada, previsto e projetado marcados; projeção nunca na gaveta do realizado.
6. Olho fechado → nenhum valor visível na gaveta.
7. Nenhum número do painel ou do relatório mudou: os testes de conciliação e de inventário da 04-A e da 04-A2
   continuam verdes sem edição de valor.
8. Os cinco comandos verdes, `perf:bundle` com o antes e o depois das duas rotas, e `TZ=UTC` verde.
9. Conferência visual em 390/768/1280/1440 px, claro e escuro, no Painel e no Relatório, com a sessão do dono (se
   pedir login, parar). Se a janela não redimensionar, o harness de iframes, declarando o que foi medido só pelo DOM.
10. Banco: md5 dos saldos igual ao da linha de base.
11. Revisão final da branch inteira no modelo mais capaz, e o §13 preenchido.

## 10. Ordem de execução (o plano detalha; um commit por passo)

1. **Motor:** os exports (D-B-3, D-B-9), `ehEntradaDeConta` extraída de `resumoMes` sem mudar número, e os campos de
   exibição opcionais (descrição, data, `numero/total_parcelas`), copiados da linha que **já é lida** (`TX_SELECT` é
   `*`; a parcela já traz `parent.description`; o caixa ganha `description` no `select` que já existe).
2. **`detalhe.ts`:** `detalheDoNumero` + a fixture + o teste de conciliação em três lados, os estados e as marcas.
3. **URL:** `urlDoDetalhe`, a leitura de `detalhe`/`alvo` e a validação de mês (D-B-16).
4. **Peças:** a gaveta (fachada + impl), `useOlhoDosValores`.
5. **Painel:** a página monta o detalhe; os links dos indicadores e dos blocos; o inventário.
6. **Relatório:** o mesmo, com os recortes e `naoSegue`.
7. **Saldo por conta** (D-B-12).
8. Conferência visual, revisão final da branch inteira e o §13.

## 11. Fora daqui, com destino

| Item | Destino |
| --- | --- |
| Recortes na base caixa (D-A2-6) | subfase própria (D-B-7) |
| Exportação da lista e seleção múltipla | 04-D |
| Ficha por pessoa | 04-C |
| Abrir os registros por barra de gráfico | sem destino (D-B-17) |
| Editar o lançamento de dentro da gaveta | sem destino; registrado |
| O olho não esconde os gráficos; falha de opções derruba `/relatorios`; pessoa inativa sem filtro; o JSON exportado mudou | continuam no §13.5 da 04-A2 |
| Achados da 04-A fora das peças tocadas (6 ciclos, "em N×", log de falha, `resumoAtual`, seta do caixa) | continuam no §13.5 da 04-A |

## 12. Riscos

- **A diferença do D-B-4 pode aparecer em dado real.** É o objetivo: hoje ela existe e ninguém vê. Se aparecer na
  conferência, ela vai para o §13 como achado, **sem conserto de número** nesta fase.
- **D-B-3 mexe em `resumoMes`** (extração do predicado). A garantia é `dashboard.test.ts`,
  `dashboard-caracterizacao.test.ts` e os testes de conciliação da 04-A/04-A2 verdes **sem edição**.
- **Conflito com a 06** em `olho-dos-valores.tsx` e, se a 06 também mexer nos `href` dos indicadores, nos clientes.
- **A página do painel relê tudo ao abrir a gaveta** (force-dynamic). É o mesmo custo de trocar o mês.

## 13. Resultado da execução

*(preenchido ao fim)*
