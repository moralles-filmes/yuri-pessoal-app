# REDESIGN-05-C — Próximos meses, Parcelamentos e Relatórios de cartão

**Data:** 2026-11-02 · **Branch:** `feat/redesign-05c-proximos-meses` (de `feat/redesign-00-auditoria`,
`7171b89`) · **Worktree:** `C:/tmp/05c-cartoes`
**Fontes:** `docs/redesign/PLANO.md` (REDESIGN-05 e o aceite da fase), `STATUS.md` (05-B, 05-A, 04-A,
D67), desenhos da 05-A e da 05-B (§4, §6, §12), `NAVEGACAO.md` §4, `METRICAS-FINANCEIRAS.md` §7,
`AUDITORIA.md` R4, `REFERENCIA-VISUAL.md` §2.

## 1. Intenção

A central de cartões já responde "quanto devo agora" (Visão geral) e "o que preciso pagar"
(Faturas e pagamentos). Faltam três perguntas:

- **Como ficam os próximos meses?** Quanto já está comprometido em cada cartão e o que ainda não
  se sabe. Hoje o sistema responde com "Próximas 6 faturas", que são 6 × nº de cartões, e com
  projeção que parece R$ 0,00.
- **O que falta pagar dos meus parcelamentos?** A tela existe; ela entra nas peças comuns.
- **Quanto passou pelos cartões, quanto foi meu e quanto foi de terceiros?** Hoje está na aba
  Cartões de `/relatorios`, com o mesmo rótulo de horizonte errado.

A 05-C entrega as três sem mudar regra de negócio, fecha as pendências da 05-B que o dono aceitou
e fecha a fase 05.

## 2. Metas, não-metas e anti-metas

**Metas**
- `/cartoes/proximos-meses`: grade **mês × cartão** (§5).
- `/parcelamentos`: as mesmas informações, nas peças comuns da 04-A (§6).
- `/cartoes/relatorios`: relatório próprio de cartão (§7), e a aba Cartões de `/relatorios` deixa
  de dizer "6 faturas" (§7.5).
- Navegação interna na ordem do NAVEGACAO §4 (§4).
- Pendências da 05-B, aprovadas pelo dono (§8): prevista de qualquer mês futuro em `/faturas`,
  desativado sem prevista, olho dos valores em `/faturas`.

**Não-metas**
- Limite disponível e percentual comprometido.
- `proximas6Faturas` (dashboard) continua como está, inclusive com cartão inativo projetando. Só
  o rótulo da aba de `/relatorios` muda (§7.5); `dashboard.ts` não muda.
- O rótulo "Faturas" na IA (`ai/constants.ts`) e na busca (`search/types.ts`).
- O selo "Atrasada" da fatura vencida de total zero (D70: fica idêntico).
- Mexer em regras de parcelamento (`installments.ts`, `split*.ts`, cancelar parcela).

**Anti-metas (falharia mesmo funcionando)**
- Projeção aparecendo como `R$ 0,00`, ou "6 faturas" quando são 6 × N.
- Mês sem fatura virando uma barra ou um total de zero no relatório.
- Clique em célula, linha, card ou indicador disparando ação financeira.
- Qualquer `/faturas?card=&month=&status=` ou `/parcelamentos?card=&category=&status=` deixando de
  responder ou mudando de significado (exceto o efeito declarado no §8.1).
- Um segundo cálculo de total, meu ou terceiros, ou um segundo classificador de estado.

## 3. Restrições

- **Sem migration.** Se surgir a necessidade, parar e perguntar.
- D67: sem push, sem PR, sem merge. Não editar `STATUS.md`, `CLAUDE.md`, `AGENTS.md`.
- Nenhuma página existente muda de lugar. As rotas novas nascem sob `/cartoes` e herdam
  `cartoes/layout.tsx`, com `loading.tsx` próprio.
- As 6 regras de layout responsivo do `CLAUDE.md`. Nada de rolagem horizontal da página; tabela
  larga rola **dentro** do card.
- Gráfico só por fachada + `*-impl.tsx` com `next/dynamic`. `perf:bundle` verde e
  `/(app)/configuracoes` < 285 KB gz.
- Lógica nova é pura, com `hoje` injetado, e testada com fixture de **2+ cartões**. Leitura nova,
  se houver, nasce em `src/lib/finance/queries.ts`.
- `relatorios-client.tsx` também é editado pela 04-A2: a edição da 05-C é **pontual** (§7.5),
  para o conflito na integração ser pequeno.

## 4. Decidido com o dono (2026-11-02)

1. **Prévia aprovada** (`.superpowers/preview/previa-05c.html`, 24 prints, fora do git), com a
   grade **transposta**: meses nas linhas, cartões nas colunas, mais "Total conhecido". Com os
   cartões nas linhas, ela não cabia em 1280 px. Abaixo de 768 px, a grade vira um bloco por mês.
2. **Relatórios:** tela própria `/cartoes/relatorios`, e a aba Cartões de `/relatorios` é
   corrigida (rótulo honesto + link para a tela nova).
3. **Navegação:** Visão geral · Faturas e pagamentos · Próximos meses · Parcelamentos ·
   Relatórios · Meus cartões.
4. **Pendências da 05-B que entram:** (a) prevista de qualquer mês futuro em `/faturas`;
   (b) `/faturas` não cria prevista para cartão desativado; (c) olho dos valores em `/faturas`.

## 5. Próximos meses — `/cartoes/proximos-meses`

### 5.1 Horizonte e base

- `?meses=3|6|12`, padrão **6**; qualquer outro valor vale 6. Os meses são
  `proximosMeses(mesDe(hoje), N)`, por **competência** (o mês em que a fatura fecha, que é o
  `month` de `/faturas`).
- Texto visível: "Por competência — o mês em que a fatura fecha. Clique numa fatura para abri-la em
  Faturas e pagamentos; nada é pago daqui." Linha de horizonte: "{mês inicial} a {mês final} ·
  {n} cartões". O título nunca conta faturas.
- O seletor é um grupo de três links (`?meses=`), não um formulário.

### 5.2 Colunas (cartões)

- Todo cartão **ativo**.
- Cartão **desativado** só entra se tiver fatura real em algum mês do horizonte, e leva a marca
  "desativado · não projeta".
- Ordem: ativos antes, depois por nome (pt-BR).

### 5.3 Células — um estado por célula

Para cada (cartão, mês):

| Estado | Quando | Como aparece | Link |
| --- | --- | --- | --- |
| **real** (aberta/fechada/atrasada/crédito) | existe fatura real com essa competência | total, "meu R$ X", selo de `rotuloDoEstado`; fechada/atrasada com total > 0 ganha a faixa vermelha à esquerda | `/faturas?card=X&month=Y` |
| **paga** | real com `pago_em` | total riscado, selo "Paga em dd/mm" (ou "Paga antes de fechar") | idem |
| **zero medido** | real com total 0 | "R$ 0,00 · nada a pagar" | idem |
| **prevista** | sem fatura real, cartão ativo, e o ciclo dessa competência ainda não fechou (`hoje < dataFechamento`) | borda tracejada, "sem lançamentos conhecidos", selo "Prevista", **nenhum R$** | idem |
| **fechou sem lançamentos** | sem fatura real, cartão ativo, e o ciclo já fechou | texto discreto "fechou sem lançamentos", sem selo e sem R$ | nenhum |
| **não projeta** | sem fatura real e cartão desativado | "— não projeta" | nenhum |

- O selo sai **só** de `rotuloDoEstado` (2º argumento: `"abertas"` se `hoje < dataFechamento`,
  senão `"fechadas"`). Nenhum classificador novo.
- Valores: `totalCent` de `total_atual`; `meuCent = totalCent − parteDosTerceirosPorFatura` (via
  `montarEntradas`, como `montarVisaoGeral`). Centavos inteiros.
- As datas do ciclo previsto saem de `resolverFatura`, avançando a partir de `cicloEmAberto`
  (nunca recalculadas à mão).

### 5.4 Total do mês ("Total conhecido")

- Total e meu saem de `faturasPorMes({ statements: <as reais das colunas>, receivables, meses,
  agrupar: "competencia" })`. Paga entra (é fatura do mês), com a nota "inclui N já paga(s)".
- Mês **sem nenhuma** fatura real: `null`, escrito "sem lançamentos conhecidos". Nunca o zero que
  `faturasPorMes` devolve para mês vazio.
- Mês com fatura real e alguma célula **prevista**: o total aparece com "parcial: N cartão(ões) sem
  lançamentos". Só a prevista torna o total parcial: "fechou sem lançamentos" e "não projeta" são
  fatos, não desconhecimento. **Escolha do agente.**
- Teste: Σ das células reais de um mês = o total de `faturasPorMes` daquele mês, convertido de
  reais para centavos (`reaisParaCentavos`).

### 5.5 Atrasadas fora do horizonte

Se existir fatura real atrasada com total > 0 e competência anterior ao primeiro mês, uma faixa
acima da grade diz "{n} fatura(s) atrasada(s) fica(m) antes deste horizonte: {cartão · mês}…",
com link para a Visão geral (`/cartoes`), que lista todas as atrasadas. A faixa só aparece quando
há atrasada.

### 5.6 Tela

- Desktop (≥ 768 px): tabela com uma coluna de mês, uma coluna por cartão e a coluna "Total
  conhecido". Com muitos cartões ela rola **dentro** do card.
- < 768 px: um bloco por mês ("Novembro de 2026 · atual", total conhecido à direita), com uma
  linha por cartão (nome, valor ou frase, selo). Linha de célula sem link não é link.
- Legenda dos estados no pé do bloco.
- Indicadores no topo: não há. O topo é a frase de base, o seletor e a faixa (§5.5). Valores
  dentro do olho (§9).
- Vazio: nenhum cartão ativo e nenhum desativado com fatura no horizonte → `EmptyState` com link
  para `/cartoes/meus`.
- Falha de leitura: as leituras lançam e o `src/app/(app)/error.tsx` (herdado; `/cartoes` não tem
  um próprio) responde. Nunca R$ 0,00.
- **Zero medido vencido e não pago** (escolha do agente, coerente com a D70): a célula mostra
  "R$ 0,00 · nada a pagar" **com** o selo "Atrasada", idêntico a `/faturas`, sem a faixa vermelha
  (ela marca só total > 0), e não entra na faixa do §5.5.

### 5.7 Lógica pura

`src/lib/finance/proximos-meses.ts` (o nome é do construtor):
`montarProximosMeses({ hoje, n, cards, statements, receivables })` →
`{ meses, cartoes, celulas[mes][cardId], totais[mes], atrasadasAntes }`.

Testes obrigatórios (2+ cartões): os seis estados de célula; cartão desativado com e sem fatura no
horizonte; atrasada antes do horizonte; dia exato do fechamento (a célula do mês que fecha hoje é
real fechada ou "fechou sem lançamentos", nunca prevista); virada de ano; total = `faturasPorMes`;
mês só com previstas ⇒ `null`; parcial; `n` inválido ⇒ 6; `TZ=UTC`.

### 5.8 Leituras

`getCreditCards()`, `getStatements()` e `getReceivablesByStatements(<ids das reais do horizonte>)`.
Todas já existem e já recusam lista cortada. Nenhuma leitura nova.

## 6. Parcelamentos — `/parcelamentos`

- Rota, `page.tsx`, leituras e parâmetros (`card`, `category`, `status`) **iguais**.
- Os três `StatCard` viram `Indicador` (04-A): *Parcelamentos ativos* (tom `saldo`), *Valor a
  pagar* (`saida`), *Já pago* (`terceiros`), **com os mesmos números** e uma linha de base cada.
  Linha de base da página: "Valores das parcelas ainda ativas. Parcela cancelada sai da conta e leva
  a cobrança do terceiro junto."
- A lista entra em dois `Bloco`: **Em andamento** (status `ativo`) e **Finalizados e cancelados**.
  Bloco sem itens não aparece; com `?status=` ligado, aparece só o bloco daquele status. Lista
  vazia continua com o `EmptyState` de hoje.
- Ordem dentro de "Em andamento": a que termina antes primeiro (última parcela asc). Dentro de
  "Finalizados e cancelados": a que terminou por último primeiro. **Escolha do agente.**
- O conteúdo de cada compra (parcelas, divisão, cancelar futuras, excluir, expandir) é o de hoje,
  movido sem mudança de regra. `derive` continua sendo a única derivação.
- Valores dentro do olho (§9).
- Testes de fonte: a tela importa `Indicador` e `Bloco`, não importa mais `StatCard`, e continua
  chamando `cancelInstallmentFuture`/`deleteInstallmentPurchase` pelos mesmos caminhos.

## 7. Relatórios de cartão — `/cartoes/relatorios`

### 7.1 Parâmetros e base

- `?base=competencia|vencimento` (padrão `competencia`), `?meses=6|12` (padrão 12) e `?cartao=<id>`
  (um cartão da lista do dono; id desconhecido é ignorado, sem filtro fantasma).
- A base fica **escrita** sob o título: "Por competência — o mês em que a fatura fecha." ou "Por
  vencimento — o mês em que a fatura vence (quando o dinheiro sai)." e "Total = minha parte + parte
  dos terceiros, fatura a fatura."
- Período: `ultimosMeses(mesDe(hoje), N)`. Na base vencimento, o mês corrente pode ter fatura ainda
  aberta; por competência, o mês corrente é o ciclo que ainda acumula. Os dois casos levam a nota
  "o mês atual ainda pode crescer".

### 7.2 Números — nenhum segundo cálculo

- Por mês: `faturasPorMes({ statements, receivables, meses, agrupar: base })`, com statements de
  todos os cartões ou só do `cartao` escolhido.
- **Mês sem fatura:** contar as faturas reais daquele mês pela mesma chave de agrupamento. Com zero
  faturas, o mês é `null` ("sem fatura neste mês"), não zero. Não há barra no gráfico.
- Indicadores (três `Indicador`): *Total das faturas*, *Minha parte*, *Parte dos terceiros* =
  Σ dos meses não nulos (em centavos). Linha de base com o período e o nº de faturas. Terceiros:
  "o valor combinado, não o que já voltou". Sem nenhuma fatura no período: `{ ausente: "sem
  faturas neste período" }`.
- **Por cartão:** `faturasPorMes` sobre as faturas de cada cartão, somado nos meses; colunas
  Faturas · Total · Minha parte · Terceiros. Cartão desativado aparece com a marca. Cartão sem fatura
  no período não aparece. Teste: Σ das linhas por cartão = indicadores.
- **Mês a mês:** tabela mês, faturas, total, meu, terceiros (mês sem fatura escrito), do mais novo
  ao mais antigo, com "Exportar CSV" (`toCsv`/`downloadCsv` que já existem; colunas `mes, faturas,
  total, meu, terceiros`, mês sem fatura com células vazias).

### 7.3 Gráfico

`FaturasChart` (fachada + impl, já existe, meu + terceiros empilhados) com os meses do período.
Hoje ele decide o vazio por `total !== 0` e tem o texto de vazio fixo ("próximos meses… pelo
vencimento"). Ele ganha duas props **opcionais**: o texto do vazio e a aceitação de mês `null`
(sem barra). Sem elas, os dois usos atuais (dashboard financeiro, `/relatorios`) renderizam
igual, e há teste disso. Mês nulo nunca vira 0.

### 7.4 Lógica pura

`src/lib/finance/relatorio-de-cartao.ts` (o nome é do construtor):
`montarRelatorioDeCartao({ hoje, base, n, cardId, cards, statements, receivables })`. Testes com 2+
cartões: as duas bases dão agrupamentos diferentes para uma fatura que fecha num mês e vence no
outro; mês sem fatura ⇒ `null`; por cartão soma os indicadores; o filtro de cartão restringe tudo;
crédito (total < 0) entra com sinal; id de cartão desconhecido ignorado; `TZ=UTC`.

Leituras: `getCreditCards()`, `getStatements()` e `getReceivablesByStatements(<ids do período>)`.

### 7.5 A aba Cartões de `/relatorios` (edição pontual)

Em `relatorios-client.tsx`, só:
- o `StatCard` "Próximas faturas" com dica "Provisão de 6 ciclos" e o card "Próximas 6 faturas"
  passam a dizer **"Próximos 6 ciclos de cada cartão"**, com "{n} cartões" na descrição. `n` sai
  dos `cardId` distintos de `card.faturas` (a mesma lista que `proximas6Faturas` usou, ativos e
  inativos), para o rótulo nunca discordar da lista;
- a aba ganha o link "Ver o relatório de cartões ›" para `/cartoes/relatorios`.

Nenhum número da aba muda. Nada mais em `relatorios-client.tsx` ou `reports/queries.ts` é tocado.
Teste de fonte, só sobre `relatorios-client.tsx` (o `painel-inventario.test.ts` cita a string de
propósito): "Próximas 6 faturas" e "Provisão de 6 ciclos" não aparecem mais nele.

## 8. Pendências da 05-B em `/faturas`

### 8.1 Prevista de qualquer mês futuro

Em `organizarFaturasDoCartao`: com `month` posterior à competência do próximo ciclo, sem fatura real
dessa competência e cartão ativo, a lista ganha a prevista **daquele** mês (datas por
`resolverFatura`, avançando a partir do ciclo seguinte, até no máximo 24 ciclos). Sem `month`, nada
muda (continuam só a atual e a próxima). A prevista extra vai para "Próximas". **Efeito
declarado:** `/faturas?card=X&month=<futuro>` deixa de dizer "Nenhuma fatura encontrada" e mostra a
fatura prevista — é o destino de cada célula prevista da grade.

### 8.2 Desativado sem prevista

`organizarFaturasDoCartao` recebe `ativo` no `card`. Desativado ⇒ nenhuma prevista (nem a atual,
nem a próxima, nem a do §8.1). As faturas reais continuam todas, inclusive as futuras com
parcela. O indicador "Fatura atual" de um cartão desativado mostra a fatura **real** do ciclo
atual, se existir (uma parcela pode tê-la criado). Só sem ela diz
`{ ausente: "cartão desativado — não acumula compras" }`. **Escolha do agente.**

### 8.3 Olho dos valores

`/faturas` passa a ler o cookie do olho (`COOKIE_DO_OLHO`, `valoresOcultos`) como o painel, e
envolve indicadores e lista em `OlhoDosValores`, com `BotaoDoOlho` no `acessorio` do primeiro
indicador. Os valores da lista usam as classes `group-data-[ocultar=true]/olho`. **O diálogo de
pagamento continua mostrando o valor** (ele abre em portal, fora do invólucro, e é o que o dono
confirma). É discrição, não sigilo.

Testes: os testes da 05-B continuam verdes; novos casos para §8.1 (mês futuro distante, mês
passado sem fatura continua vazio, `status` junto), §8.2 (desativado sem nenhuma prevista; com
fatura real atrasada, ela continua em "Precisam de pagamento").

## 9. Olho nas telas novas

**Escolha do agente:** Próximos meses, Parcelamentos e Relatórios de cartão também envolvem os
valores em `OlhoDosValores` (mesmo cookie). Assim o olho vale em toda a central, exceto a Visão
geral e Meus cartões (pendência registrada).

## 10. Navegação e rotas

| Rota | Arquivos |
| --- | --- |
| `/cartoes/proximos-meses` | `page.tsx`, `loading.tsx` (novos) |
| `/cartoes/relatorios` | `page.tsx`, `loading.tsx` (novos); a ilha cliente do CSV |

- `cartoes-nav.ts`: seis itens na ordem do §4.3, com ícones do lucide.
- `module-shell.test.ts`: a lista exata da central passa a ser a nova; o piso da varredura de rota
  no disco sobe de 37 para 39. As duas rotas novas entram no teste de `href` com `page.tsx`.
- `hrefAtivo` (`src/lib/nav/active.ts`, casa pela rota mais longa): `/cartoes/proximos-meses` e
  `/cartoes/relatorios` acendem só o próprio item, não a Visão geral. Isso já funciona; o plano só
  acrescenta o teste.
- Nenhum link existente muda.

## 11. Verificação

Os cinco (`test:run`, `lint`, `tsc --noEmit`, `build`, `perf:bundle`), com números reais;
`boundaries.test.ts` com `--testTimeout=30000` se estourar; `approval/schema.test.ts` por CRLF é de
ambiente. `TZ=UTC` sobre os testes novos. Prints da tela real das três telas em 390/768/1280/1440,
claro e escuro, incluindo uma prevista que **não** aparece como R$ 0,00 e o rótulo de horizonte.
Banco só leitura.

## 12. Deixado ao construtor

Nomes de arquivo, de função e de componente; o texto exato de frases de vazio; ícones; a divisão
em componentes; se a lista móvel da grade é o mesmo componente da tabela.

## 13. Pendências para depois

- Olho na Visão geral e em Meus cartões.
- `proximas6Faturas` com cartão inativo projetando (dashboard e aba de `/relatorios`).
- Rótulo "Faturas" na IA e na busca.
