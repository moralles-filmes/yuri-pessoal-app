# REDESIGN-05-A — Central de cartões e faturas: casca, Visão geral e Meus cartões

**Data:** 2026-11-02 · **Branch:** `feat/redesign-05a-cartoes` (de `feat/redesign-00-auditoria`,
`2ed5657`) · **Worktree:** `C:/tmp/05a-cartoes`
**Fontes:** `docs/redesign/PLANO.md` (REDESIGN-05), `NAVEGACAO.md` §4, `METRICAS-FINANCEIRAS.md`
§7, §8 e §13.5, `AUDITORIA.md` P1-2, R4 e §3, `REFERENCIA-VISUAL.md` §2.

## 1. Intenção

Quando o dono abre cartões, ele quer saber **quanto deve agora**, separado em **fatura fechada
(com vencimento)** e **fatura em aberto (ainda acumulando)**, e, em cada uma, **quanto é dele e
quanto é de cada terceiro, com o nome da pessoa**. Hoje isso exige abrir `/faturas` cartão a
cartão. A 05-A dá à central um lugar para isso, sem mudar nenhuma regra e sem mover página.

## 2. Metas, não-metas e anti-metas

**Metas**
- Navegação interna da central em `/cartoes`, `/faturas` e `/parcelamentos`.
- Sidebar: três itens viram um ("Cartões e faturas").
- Tela **Visão geral** (`/cartoes`) e tela **Meus cartões** (`/cartoes/meus`).

**Não-metas (ficam para depois)**
- 05-B: faturas e pagamentos (o conteúdo de `/faturas` não muda nesta subfase).
- 05-C: matriz de próximos meses, tela de Parcelamentos e relatórios de cartão.
- Limite disponível e percentual comprometido (achado 🟡 da §7): fora.
- Peças comuns da REFERENCIA-VISUAL §2 (banner, indicador novo, bloco, olho): são da 04-A/06.
  A 05-A usa o que já existe (`StatCard`, `Card`, `Badge`, `PageHeader`, `EmptyState`) e registra
  a pendência de trocar pelas peças comuns na 05-B/05-C.

**Anti-metas (falharia mesmo funcionando)**
- Projeção mostrada como `R$ 0,00`.
- Somar fechada com aberta num número só, ou somar "de terceiros" com "reembolsos pendentes".
- Clique numa linha disparar pagamento ou qualquer escrita.
- Qualquer `/faturas?card=X&month=Y`, `/parcelamentos?...` ou `/cartoes` deixar de responder.
- Qualquer reimplementação de `meu = total − terceiros` fora de `parteDosTerceirosPorFatura`.

## 3. Restrições

- **Sem migration.** Se surgir a necessidade, parar e perguntar.
- Nenhum arquivo `page.tsx` existente muda de lugar (NAVEGACAO regra 2). Por isso **não** se usa
  grupo de rotas para um `layout.tsx` único.
- D67: sem push, sem PR, sem merge. Sem editar `STATUS.md`, `CLAUDE.md` e `AGENTS.md`.
- Orçamento de bundle: `perf:bundle` verde, `/(app)/configuracoes` < 285 KB gz. Diálogo de
  formulário e gráfico entram por `next/dynamic` (não há gráfico nesta subfase).
- `nav.ts` é ponto de contato com outras frentes (a 04-A pode estar mexendo): **edição pontual**.
- Regras de layout responsivo do `CLAUDE.md` (`min-w-0`, `top-18`, `sm:max-w-*`).

## 4. Decidido com o dono

1. **Visão geral = layout "B"**: números no topo + tabela, **uma coluna por pessoa**.
2. **Fechada e aberta separadas**, em duas tabelas, cada uma com os seus números no topo.
3. **Meus cartões fica como está hoje** (o `CardsClient` atual, sem mudança de conteúdo).
4. Esboço aprovado: `visao-geral-v2.html` (companion, dado sintético).
5. Desativar não quita: fatura fechada/atrasada de cartão desativado continua em "A pagar".
6. **Prévia aprovada em 2026-11-02** (`.superpowers/preview/previa-05a.html`, 16 prints em
   390/768/1280/1440, claro e escuro; fora do git). Na tabela "Em aberto", fechamento e
   vencimento são **uma coluna** ("Fecha → vence"), para caber em 768 px.

## 5. Navegação e rotas

| Rota | Conteúdo | Arquivo |
| --- | --- | --- |
| `/cartoes` | **Visão geral** (nova) | `cartoes/page.tsx` (reescrito) |
| `/cartoes/meus` | **Meus cartões** — o conteúdo atual de `/cartoes` | `cartoes/meus/page.tsx` (novo; `cards-client.tsx` e `credit-card-form.tsx` ficam onde estão e são importados de lá) |
| `/faturas` | inalterado | + `faturas/layout.tsx` |
| `/parcelamentos` | inalterado | + `parcelamentos/layout.tsx` |

- Os três `layout.tsx` (`cartoes/`, `faturas/`, `parcelamentos/`) têm 3–5 linhas e montam o
  **mesmo** `CartoesShell` (`src/components/cartoes/cartoes-shell.tsx`), que é um
  `ModuleShell` com `NAV_DA_CENTRAL_DE_CARTOES`. Nenhuma sexta navegação.
- Seções (`ModuleShell`, um grupo sem título, nome "Cartões e faturas"):
  **Visão geral** `/cartoes` · **Meus cartões** `/cartoes/meus` · **Faturas** `/faturas` ·
  **Parcelamentos** `/parcelamentos`. `hrefAtivo` já garante que `/cartoes` só acende quando
  `/cartoes/meus` não casa.
- Sidebar (`nav.ts`): remover "Faturas" e "Parcelamentos"; "Cartões" vira
  `{ title: "Cartões e faturas", href: "/cartoes", tambem: ["/faturas", "/parcelamentos"] }`.
  Os ícones `ReceiptText`/`Layers` saem dos imports de `nav.ts` se ficarem sem uso.
- **Efeito declarado (aceito):** a busca (`search/queries.ts`, resultado "cartão"), o aviso
  `card_limit` (`notifications/generate.ts`) e a previsão da IA apontam para `/cartoes`. A URL não
  muda, mas eles passam a cair na Visão geral, que tem link para Meus cartões. Nenhum desses
  arquivos é editado.
- A ação "Ir para Cartões" de `/faturas` (`statements-client.tsx:382`) e o atalho de
  `/configuracoes` apontam para `/cartoes`. **Escolha minha:** trocar só o de `/faturas` para
  `/cartoes/meus` (o texto é sobre cadastrar cartão). O de `/configuracoes` também é sobre cadastro,
  então também vai para `/cartoes/meus`.
- `revalidatePath("/cartoes")` nas actions: as páginas são `force-dynamic`, então `/cartoes/meus`
  não depende disso. Acrescentar `revalidatePath("/cartoes/meus")` em `actions/credit-cards.ts`
  por clareza.
- Testes: o teste de `href` no disco (`nav.test.ts`, 02-D) passa a cobrir `/cartoes/meus`
  automaticamente; acrescentar um teste para a lista da central (cada `href` tem `page.tsx`) e um
  teste de que `/faturas` e `/parcelamentos` acendem **um** item da sidebar ("Cartões e faturas").

## 6. Visão geral — o que a tela mostra

Título da página: "Cartões e faturas"; descrição curta.

### 6.1 Números do topo (quatro, `StatCard`)

| Rótulo | Fórmula |
| --- | --- |
| **A pagar (fechadas)** | Σ total das faturas da tabela 6.2 com estado `fechada` ou `atrasada` |
| **Minha parte a pagar** | Σ `meu` dessas mesmas faturas |
| **Em aberto (acumulando)** | Σ total das faturas **reais** da tabela 6.3 |
| **Minha parte em aberto** | Σ `meu` dessas mesmas faturas |

Linha de apoio: nº de faturas e a próxima data de vencimento ("2 faturas · próxima vence 05/11");
no aberto, "ainda pode crescer". Linhas "Prevista" **não entram** em soma nenhuma; se só houver
previstas, o número diz "sem lançamentos conhecidos" em vez de R$ 0,00. **Paga não entra** em
"A pagar". **Não há** número de "reembolsos pendentes" nesta tela.

### 6.2 Tabela "Fechadas — a pagar"

Uma linha **por fatura** (um cartão pode ter duas, ex.: atrasada de set + fechada de out),
ordenada por vencimento ascendente. Entram:
- de **qualquer** cartão (ativo **ou desativado** — decisão do dono, 2026-11-02: desativar não
  quita a dívida), toda fatura real com estado `atrasada` ou `fechada`. Cartão desativado leva
  a marca "cartão desativado" ao lado do nome e **entra** nas somas do topo;
- de cartão **ativo**, a fatura real `paga` cujo `data_vencimento >= hoje` (fica visível até o
  vencimento, fora da soma; selo "Paga em dd/mm", data de `pago_em` lida em Brasília).

Colunas: Cartão (marcador na cor `credit_cards.cor` + nome + mês da competência) · Vence ·
Total · Minha parte · uma coluna por pessoa · Estado (selo com palavra).

### 6.3 Tabela "Em aberto — acumulando compras"

Uma linha **por cartão ativo** (desativado não tem linha aqui): o ciclo corrente, isto é, o
primeiro ciclo de `resolverFatura` a partir de hoje com `hoje < data_fechamento` (no dia do
fechamento o ciclo de hoje já é `fechada` e vai para 6.2; o aberto passa a ser o seguinte). Se a fatura real existe: valores e
selo "Aberta". Se não existe: linha **"Prevista · sem lançamentos conhecidos"**, sem valor, em
itálico/muted e selo tracejado.

Colunas: Cartão · Fecha · Vence · Total até agora · Minha parte · pessoas · Estado.

### 6.4 Colunas de pessoa

- Uma coluna por pessoa que tem parte em **alguma** fatura daquela tabela (cada tabela tem as
  suas colunas), ordenadas por nome.
- Valor = Σ `parteDoTerceiroCentavos` dos recebíveis da fatura daquela pessoa — a **mesma regra**
  de `parteDosTerceirosPorFatura` (D3: o valor, não o saldo; `ignorado` conta o que ele pagou).
  Pessoa sem parte numa fatura **existente**: `R$ 0,00` (zero medido). Linha prevista: vazia.
- Soma das colunas de pessoa = coluna "de terceiros" implícita = `total − meu`. Isso é invariante
  testado.
- Muitas pessoas: a tabela rola na horizontal **dentro do card** (`overflow-x-auto`), a página não.

### 6.5 Os cinco estados, distintos

| Estado | Como aparece |
| --- | --- |
| fatura existente (aberta/fechada) | valores normais, selo "Aberta"/"Fechada" |
| atrasada | selo vermelho "Atrasada" (cor + palavra) |
| paga | selo verde "Paga em dd/mm", fora das somas |
| zero medido | `R$ 0,00` normal (fatura real com total 0) |
| projeção / sem lançamentos conhecidos | linha muted, "sem lançamentos conhecidos", selo tracejado "Prevista", **nenhum R$** |

Observação: `getStatements` filtra `itens > 0`; zero medido só aparece quando os itens somam 0
(ex.: estorno). Não mudar o filtro.

**Casos de borda (escolhas minhas, marcadas para o dono conferir):**
- **Paga antes de fechar.** `pagar_fatura` não recusa pagamento antes de `data_fechamento`, e
  `statusEfetivo` devolve `paga` sempre que há `pago_em`. A seleção da 6.2/6.3 **não** usa só o
  estado: usa as datas. Uma fatura com `hoje < data_fechamento` é do ciclo **em aberto** (6.3),
  mesmo paga, com selo "Paga antes de fechar" e **fora** das somas do topo (compra nova ainda
  pode cair nela, por isso fica na tabela do que acumula). A 6.2 só recebe fatura com
  `hoje >= data_fechamento`. Teste dedicado.
- **Total negativo (crédito).** Fatura real com `total_atual < 0` aparece com o valor negativo e
  selo "Crédito", e fica **fora** de "A pagar" e de "Minha parte a pagar" (crédito num cartão não
  reduz a dívida de outro). Teste dedicado.

### 6.6 Interação

- A linha inteira é um `Link` para `/faturas?card=<id>&month=<yyyy-MM da competência>` (também a
  linha prevista). Nenhum botão de pagar na Visão geral.
- Celular (< `md`): cada tabela vira lista de cartões empilhados (cartão + estado no alto, total,
  minha parte, depois as pessoas em linhas `nome … valor`).
- Vazio: nenhum cartão ativo **e** nenhuma fatura fechada/atrasada de cartão desativado →
  `EmptyState` com link para `/cartoes/meus`. Sem cartão ativo mas com dívida de desativado: a
  tabela 6.2 aparece e a 6.3 diz "Nenhum cartão ativo.". Tabela sem linhas
  (ex.: nenhuma fechada a pagar) → frase "Nenhuma fatura fechada a pagar." dentro do bloco.
- Falha de leitura: as leituras lançam (`listaCompleta`/`exigirCompleta`), e o `error.tsx` do
  segmento mostra o estado de erro com "tentar de novo". **Nunca** R$ 0,00. Criar
  `cartoes/error.tsx` se não houver um herdado adequado. Criar `cartoes/loading.tsx` e
  `cartoes/meus/loading.tsx` (skeleton).

### 6.7 Base

A tela é por **fatura** (competência do ciclo do cartão). Escrever isso em texto visível sob o
título: "Valores por fatura do cartão. Minha parte = total − parte dos terceiros."

## 7. Leituras e lógica pura

- I/O (Server Component da página): `getCreditCards()`, `getStatements()` (sem filtro de
  cartão), `getReceivablesByStatements(ids)` — todas já existem e já recusam lista cortada.
- **Lógica nova, pura e testada**, em `src/lib/finance/central-cartoes.ts` (ou nome equivalente):
  - `parteDosTerceirosPorPessoa(receivables)` → por `statement_id`, por `person_id`, em centavos,
    usando `parteDoTerceiroCentavos`. Teste: a soma por pessoa de cada fatura **é igual** a
    `parteDosTerceirosPorFatura` (rodar as duas sobre a mesma fixture).
  - `montarVisaoGeral({ hoje, cards, statements, receivables })` → `{ fechadas, abertas, totais,
    pessoasFechadas, pessoasAbertas }`. Usa `statusEfetivo`, `resolverFatura`,
    `parteDosTerceirosPorFatura`; o filtro `ativo` vale só para a 6.3 e para a paga visível da
    6.2. `hoje` injetado.
  - Testes obrigatórios: fixture com **2+ cartões** (a lição da §7: fixture de 1 cartão escondeu
    o 6×N); cartão com atrasada + fechada; paga antes e depois do vencimento; paga antes de
    fechar; dia exato do fechamento; prevista não somada; **desativado com atrasada dentro de
    "A pagar" e sem linha em aberto**; total negativo; zero medido; `ignorado`; virada de ano.
- Se `getReceivablesByStatements` não trouxer `person_id` com nome suficiente, ele já traz
  `person:people(id,nome)` — usar isso. Nenhuma leitura nova é prevista; se faltar, ela nasce em
  `queries.ts` com teste puro.
- Nada reimplementa `meu = total − terceiros`: `meu` sai de `total − parteDosTerceirosPorFatura`
  em centavos, como em `proximas6Faturas`. **Escolha minha:** extrair o trecho comum, se ficar
  limpo, em vez de copiar; não mudar o comportamento de `proximas6Faturas`.

## 8. Meus cartões

`/cartoes/meus/page.tsx` = o `page.tsx` atual de `/cartoes` (StatCards de ativos e limite total +
`CardsClient`), com título "Meus cartões". Nenhuma mudança de conteúdo.

## 9. Prévia (primeiro entregável, antes de código de produção)

HTML estático com **dado sintético marcado como tal**, nos tokens reais de
`src/app/globals.css` (claro e escuro), mostrando a casca + Visão geral + Meus cartões, com
screenshots em **390 / 768 / 1280 / 1440 px**, claro e escuro. O esboço do §4.4 aprovou a
**estrutura**; esta prévia aprova o **visual nas quatro larguras** e é feita **antes** do plano.
O plano só começa com o aval do dono sobre ela; ele não contém um ponto de parada para a prévia.

## 10. Verificação

Os cinco (`test:run`, `lint`, `tsc --noEmit`, `build`, `perf:bundle`), com números reais; prints
da tela real nas 4 larguras, claro e escuro. `boundaries.test.ts` com `--testTimeout=30000` em
checkout novo; falha de `approval/schema.test.ts` por CRLF é de ambiente.

## 11. Deixado ao construtor

Nomes de arquivo e de função, a divisão em componentes, o skeleton, o texto exato das frases
de vazio, e se a tabela/lista móvel é um componente com dois layouts ou dois componentes.

## 12. Pendências para a 05-B/05-C

- Trocar `StatCard`/selos pelas peças comuns da REFERENCIA-VISUAL §2 quando a 04-A/06 as criar.
- Abas "Próximos meses" e "Relatórios" (05-C); renomear "Faturas" para "Faturas e pagamentos"
  quando a 05-B entregar.
- Cartão inativo projetando em `proximas6Faturas` (dashboard) continua como está; a Visão geral
  já filtra.
