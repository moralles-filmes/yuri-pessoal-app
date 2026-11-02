# REDESIGN-05-B — Faturas e pagamentos

**Data:** 2026-11-02 · **Branch:** `feat/redesign-05b-faturas` (de `feat/redesign-00-auditoria`,
`3a1c943`) · **Worktree:** `C:/tmp/05b-faturas`
**Fontes:** `docs/redesign/PLANO.md` (REDESIGN-05), `STATUS.md` (05-A, 04-A, D67), desenho da 05-A
(`2026-11-02-05a-central-de-cartoes-design.md`, §6.5 e §12), `METRICAS-FINANCEIRAS.md` §7,
`AUDITORIA.md` P1-2, P1-8 e R4, `REFERENCIA-VISUAL.md` §2.

## 1. Intenção

Quem abre `/faturas` quer saber **o que precisa pagar agora**, e pagar sem medo de pagar duas
vezes. Hoje a tela lista as faturas do cartão por competência, da mais nova para a mais velha:
a atrasada fica no meio da lista. Além disso, o card do topo diz "Fatura atual R$ 0,00" quando o
ciclo ainda nem tem fatura (P1-2), o que afirma um valor que não existe. A 05-B reordena a tela
pelo que exige ação, corrige a P1-2 com o classificador da 05-A e usa as peças comuns da 04-A,
sem mudar regra de negócio.

## 2. Metas, não-metas e anti-metas

**Metas**
- Seção "Faturas" da central passa a se chamar **"Faturas e pagamentos"** (rótulo da navegação
  interna, título e `metadata` da página). A rota continua `/faturas`.
- Faturas do cartão selecionado em **quatro grupos**, nesta ordem (prévia aprovada):
  1. **Precisam de pagamento**: atrasadas primeiro, depois fechadas, por vencimento crescente.
  2. **Em aberto — acumulando compras**: o ciclo atual.
  3. **Próximas**: ciclos futuros (previstos ou reais com parcela futura), por competência crescente.
  4. **Pagas e anteriores**: competência decrescente.
- Detalhamento (lançamentos à vista, parcelas, "Quem paga esta fatura", mover lançamento)
  **dentro** da fatura, sem mudar de página. O conteúdo é o de hoje.
- Três **Indicadores** (04-A) no topo: *A pagar neste cartão*, *Fatura atual · {mês}*,
  *Próximo vencimento*. Os grupos usam o **Bloco** (04-A).
- P1-2 corrigida: o ciclo sem fatura mostra **"sem lançamentos conhecidos"**, nunca R$ 0,00, no
  indicador e na lista.
- Pagamento pelo fluxo da 03-F (`markStatementPaid` → RPC `pagar_fatura`), num diálogo que
  entra por `next/dynamic` + `useLazyDialog`, com tratamento de reenvio (§7).

**Não-metas**
- 05-C: Próximos meses (matriz cartão × mês), Parcelamentos, Relatórios de cartão.
- Visão de todos os cartões em `/faturas`: a tela continua sendo **de um cartão por vez**
  (`?card=`). A visão transversal é a Visão geral (`/cartoes`).
- O olho dos valores: fica fora (a tela não tem o invólucro do olho, e o valor do pagamento
  precisa estar visível no diálogo). Registrado como pendência.
- Mudar o desfazer: continua o diálogo de confirmação da 03-F, sem alteração.
- Limite disponível do cartão.

**Anti-metas (falharia mesmo funcionando)**
- Projeção exibida como `R$ 0,00` em qualquer lugar da tela.
- Clique na fatura, no card ou no indicador disparar pagamento ou qualquer escrita.
- Clique duplo ou duas abas gerando dois pagamentos, ou a tela dizendo "erro" quando a fatura
  foi paga (por outra aba) e nada foi debitado de novo.
- Qualquer `/faturas?card=X&month=Y[&status=Z]` deixar de responder ou mudar de significado.
- Um segundo classificador de estado de fatura, ou `meu = total − terceiros` reimplementado.
- Horizonte desonesto ("6 faturas" para 6×N) em qualquer texto tocado.

## 3. Restrições

- **Sem migration.** Se surgir a necessidade, parar e perguntar.
- D67: sem push, sem PR, sem merge. Não editar `STATUS.md`, `CLAUDE.md`, `AGENTS.md`.
- Regras de layout do `CLAUDE.md` (`min-w-0` com irmão `shrink-0`, `sm:max-w-*` no diálogo,
  `Button` é `whitespace-nowrap`, nada de rolagem horizontal da página).
- Orçamento: `perf:bundle` verde, `/(app)/configuracoes` < 285 KB gz.
- Os testes de varredura de fonte que apontam para `statements-client.tsx`
  (`faturas-tela.test.ts`, `faturas-terceiros.test.ts`) continuam verdes. **O arquivo mantém o
  nome**; se uma responsabilidade sair dele, o teste é estendido para o arquivo novo, sem perder
  a afirmação.
- `src/lib/finance/invoice.ts`, `recebimentos.ts`, `central-cartoes.ts` e as RPCs não mudam de
  comportamento.

## 4. Decidido com o dono

1. **Prévia aprovada em 2026-11-02** (`.superpowers/preview/previa-05b.html`, 8 prints em
   390/768/1280/1440, claro e escuro; fora do git), **com as quatro escolhas do agente**:
   tela de um cartão por vez; projeção e "sem lançamentos conhecidos" são o mesmo estado (como na
   Visão geral); a fatura em aberto com valor mantém um botão secundário **"Pagar antes de
   fechar"** (o pagamento antecipado já existe hoje); fatura com total ≤ 0 nunca entra em
   "Precisam de pagamento" e não tem botão de pagar.
2. Os cinco estados distintos, com as palavras e cores da Visão geral:

| Estado | Como aparece em `/faturas` |
| --- | --- |
| fatura existente (aberta/fechada) | valores normais, selo "Aberta" (âmbar) / "Fechada" (neutro) |
| atrasada (existente vencida) | faixa vermelha à esquerda + selo "Atrasada" |
| paga | selo verde "Paga em dd/mm" (ou "Paga antes de fechar"), total riscado, botão "Desfazer" |
| zero medido | `R$ 0,00` normal, frase "nada a pagar", sem botão de pagar |
| projeção / sem lançamentos conhecidos | card tracejado, selo tracejado "Prevista", "sem lançamentos conhecidos", **nenhum R$**, sem botão |

## 5. Leituras

A página continua com as leituras de hoje (`getCreditCards`, `getAccounts`, `getStatements`,
`getTransactions` com `AvisoDeTeto`, `getStatementInstallmentItems`,
`getReceivablesByStatements`). **Nenhuma leitura nova é prevista.** Se faltar alguma, ela nasce
em `src/lib/finance/queries.ts`.

## 6. Lógica pura — `src/lib/finance/faturas-do-cartao.ts` (nome é do construtor)

`organizarFaturasDoCartao({ hoje, card, statements, receivables, month, status })`, puro e com
`hoje` injetado, devolve:

```
{
  grupos: { pagar, emAberto, proximas, anteriores }: FaturaDaTela[],
  indicadores: { aPagar, atual, proximoVencimento },
}
```

- **Ciclo atual = a regra da Visão geral** (`central-cartoes.ts`, bloco "Em aberto"):
  `resolverFatura(hoje)` e, enquanto `hoje >= dataFechamento`, avança para o ciclo seguinte. No
  dia do fechamento, a fatura que fecha hoje já é `fechada` (vai para `pagar`) e o ciclo atual é
  o seguinte. Se a fatura real da competência do ciclo já fechou pelas próprias datas (cartão
  reconfigurado), ela fica no grupo que o estado dela manda e o ciclo atual é `prevista`. A
  regra é **extraída** para uma função pura compartilhada (ex.: `cicloEmAberto(hoje, card)`),
  usada pela Visão geral e por esta tela, sem mudar o comportamento da Visão geral (os testes
  dela continuam verdes). **Escolha do agente, decidida pelo revisor:** o cliente de hoje usava
  `resolverFatura(hoje)` sem avançar, o que punha a mesma fatura em dois grupos no dia do
  fechamento.
- **Linhas.** As faturas reais do cartão + o ciclo atual e o próximo quando não existem: essas
  são `prevista` (`statementId: null`, `valores: null`).
- **Estado.** `statusEfetivo` para as reais, `prevista` para as virtuais, e o selo sai de
  `rotuloDoEstado` de `components/cartoes/estado-da-fatura.ts` — **o mesmo** da Visão geral. A
  assinatura dele passa a aceitar `Pick<LinhaDaCentral, "credito" | "estado" | "pagoEm">`
  (estrutural; a Visão geral não muda). Nenhum classificador novo.
- **Dinheiro em centavos.** `totalCent` de `total_atual`; terceiros pela regra única
  (`somaDaParteDosTerceiros` / `parteDoTerceiroCentavos` de `recebimentos.ts`); `meu = total −
  terceiros`, como hoje. `credito = totalCent < 0`.
- **Grupos (por datas, como na 05-A §6.5):**
  - `pagar`: real, `estado ∈ {atrasada, fechada}`, `totalCent > 0`. Ordem: atrasadas antes, depois
    `dataVencimento` asc, desempate por competência.
  - `emAberto`: a linha do **ciclo atual** (real ou prevista), mais a paga antes de fechar desse
    ciclo (`hoje < dataFechamento`, selo "Paga antes de fechar", tabela `"abertas"`).
  - `proximas`: competência > a do ciclo atual (prevista do próximo ciclo e faturas reais futuras
    com parcelas), competência asc. Real futura não paga com total > 0 mantém o botão secundário
    **"Pagar antes de fechar"** (hoje toda real não paga com valor tem "Pagar"; não se tira
    capacidade). Real futura paga fica em `proximas`, com selo "Paga antes de fechar" e
    "Desfazer". **Escolha do agente.**
  - `anteriores`: o resto (pagas com `hoje ≥ dataFechamento`, e fechada/atrasada com total ≤ 0),
    competência desc.
- **O selo é idêntico ao da Visão geral, sem exceção** (decidido pelo dono em 2026-11-02).
  Uma fatura real vencida e não paga de total zero continua com o selo "Atrasada" (o crédito já
  vence os outros estados em `rotuloDoEstado`); ela só fica fora de `pagar` e sem botão de pagar,
  com a frase "nada a pagar". Assim `?status=atrasada` e o selo dizem a mesma coisa.
- **Filtros.** `month` e `status` filtram as linhas **depois** de incluir as previstas (hoje o
  cliente só as inclui sem `month`). Assim o link da linha prevista da Visão geral
  (`/faturas?card=X&month=<competência prevista>`) encontra a fatura prevista em vez de "Nenhuma
  fatura encontrada". `status` compara com o estado efetivo; `prevista` só passa sem filtro de
  status ou com `status=aberta` (é o comportamento de hoje: a virtual é "aberta").
- **Indicadores:**
  - `aPagar`: Σ `totalCent` e Σ `meuCent` de `pagar`, `qtd`, `qtdAtrasadas`. Lista vazia ⇒
    `{ totalCent: 0 }` (zero medido: "nenhuma fatura fechada a pagar").
  - `atual`: a linha do ciclo atual. Prevista ⇒ `null` ⇒ "sem lançamentos conhecidos".
  - `proximoVencimento`: o menor `dataVencimento` de `pagar`; sem `pagar`, o da linha atual.
  - Com filtro de mês/status, os indicadores continuam sobre **todas** as linhas do cartão (o
    filtro encolhe a lista, não muda o que se deve). **Escolha do agente.**
- Testes obrigatórios: atrasada + fechada no mesmo cartão (ordem); fatura atual prevista (nunca
  número); atual real com zero; zero vencido fora de `pagar` com selo "Atrasada" e sem botão; crédito vencido com selo "Crédito"; paga antes de
  fechar em `emAberto`; dia exato do fechamento e do vencimento; virada de ano (dez → jan);
  `month` apontando para a prevista; `status=paga`/`atrasada`/`aberta`; parcela futura real em
  `proximas`; indicadores com filtro ativo; terceiros com perdoado (`ignorado`) conciliando com
  `parteDoTerceiroCentavos`.

## 7. Pagamento e reenvio

- O diálogo sai de `statements-client.tsx` para `pagar-fatura-dialog.tsx` (default export,
  controlado: `fatura | null`), carregado com `next/dynamic` (objeto literal) + `useLazyDialog`,
  igual ao `DesfazerPagamentoDialog`. A linha só tem o **botão** "Pagar" (ou "Pagar antes de
  fechar"), que abre o diálogo; não há escrita fora do botão de confirmação dele.
- O diálogo mostra (prévia): título "Pagar fatura de {mês} — {cartão}", total, minha parte ·
  terceiros, vencimento, conta, data (com `max=hoje`, a recusa da data fica sob o campo, como hoje).
- **Clique duplo:** uma `ref` impede um segundo envio enquanto o primeiro não respondeu (o
  `disabled` por estado chega um render atrasado).
- **Desfecho da resposta**, por função pura `desfechoDoPagamento(res)` em
  `src/lib/finance/statement-payment.ts`, comparando com as constantes que já moram lá:
  - `ok` → toast de sucesso, fecha, `router.refresh()`.
  - `error === MSG_FATURA_JA_PAGA` → **não é erro**: o diálogo mostra "Esta fatura já estava paga
    (talvez em outra aba). Nada foi debitado de novo.", botão "Entendi", `router.refresh()`.
    Para isso, o caminho rápido de `markStatementPaid` passa a usar a constante
    `MSG_FATURA_JA_PAGA` em vez do literal igual (mesmo texto; nenhuma mudança de
    comportamento). **Desvio da prévia, escolha do agente:** a prévia dizia "paga em 02/11"; a
    resposta da action não traz a data, e mudar `ActionResult` não se justifica — a lista
    atualizada mostra o selo com a data.
  - `error === MSG_PAGAMENTO_INCERTO`, ou exceção na chamada → aviso "Não deu para confirmar o
    pagamento… Tentar de novo é seguro — o sistema não paga a mesma fatura duas vezes.", com
    "Fechar" e "Tentar de novo", e `router.refresh()`. Repetir cai no caminho rápido ou na RPC e
    converge para "já estava paga".
  - recusa de data (`fieldErrors.dataPagamento`) → sob o campo, como hoje.
  - qualquer outra recusa → toast de erro com a mensagem, diálogo aberto.
- O desfazer não muda (03-F: lê, confirma, botão destrutivo).

## 8. Tela

- `page.tsx`: título "Faturas e pagamentos", descrição "Primeiro o que precisa ser pago; depois o
  que ainda está acumulando.", linha de base "Valores por fatura do cartão. Minha parte = total −
  parte dos terceiros.". `AvisoDeTeto` continua.
- Filtros (cartão, mês, status) como hoje, com os mesmos parâmetros de URL.
- Indicadores: `Indicador` da 04-A (tons `saida`, `terceiros`, `saldo`). **Variante nova na
  peça**: `valor` aceita `{ ausente: string }`, que desenha a frase em itálico, discreta, no
  lugar do número (nem erro, nem zero). Nasce em `src/components/shared/painel/indicador.tsx`
  com teste em `painel.test.ts`; os usos da 04-A/04-A2 não mudam.
- Grupos em `Bloco` (04-A). "Precisam de pagamento" aparece sempre; vazio ⇒ estado `vazio` com
  "Nenhuma fatura fechada a pagar.". Os outros grupos só aparecem com linhas. Lista totalmente
  vazia (filtros) ⇒ o `EmptyState` de hoje.
- Cada fatura: competência por extenso com a inicial maiúscula ("Outubro de 2026"), selo do
  estado, selo "Atual"/"Próxima" quando cabe, "fechou/fecha dd/mm · vence/venceu dd/mm · N
  lançamentos", linha "meu · terceiros" (e o perdoado com `fraseDoPerdoado`), total à direita,
  botões (Pagar / Pagar antes de fechar / Desfazer) e o botão de expandir. Atrasada com faixa
  vermelha à esquerda; prevista tracejada sem fundo; paga com total riscado.
- O detalhamento é o de hoje (lançamentos, parcelas, mover, quem paga), movido sem mudança de
  regra.
- Celular: o lado do total desce para baixo do texto (como na prévia); nada rola na horizontal.

## 9. Navegação e deep-links

- `cartoes-nav.ts`: `title: "Faturas e pagamentos"`. Testes que citam o rótulo são atualizados.
- `/faturas?card=&month=&status=` continua aceito com o mesmo significado. `search/queries.ts` e
  `notifications/generate.ts` **não mudam**; `deep-links-inline.test.ts` continua verde.
- `ai/constants.ts` (`"/faturas": "Faturas"`, contexto de página da IA) e `search/types.ts`
  (rótulo de grupo da busca) **não mudam**: são outras superfícies, e a da IA sobe versão de
  prompt. Registrado como pendência.

## 10. Verificação

Os cinco (`test:run`, `lint`, `tsc --noEmit`, `build`, `perf:bundle`), com números reais;
`boundaries.test.ts` com `--testTimeout=30000` se estourar; `approval/schema.test.ts` por CRLF é
de ambiente. Prints da tela real em 390/768/1280/1440, claro e escuro, incluindo uma fatura atual
prevista que **não** aparece como R$ 0,00. `TZ=UTC` sobre os testes novos. Banco só leitura.

## 11. Deixado ao construtor

Nomes de arquivo e de função, a divisão em componentes, o texto exato das frases de vazio, o
ícone dos indicadores, e se a fatura é um componente próprio.

## 12. Pendências para depois

- Olho dos valores em `/faturas`.
- Rótulo "Faturas" na IA (`ai/constants.ts`) e na busca (`search/types.ts`).
- Fatura vencida de total zero aparece como "Atrasada" nas duas telas (Visão geral e
  `/faturas`). Trocar por um selo que diga "nada a pagar" nas duas, se o dono quiser — fora
  desta subfase.
- 05-C: Próximos meses, Parcelamentos, Relatórios.
