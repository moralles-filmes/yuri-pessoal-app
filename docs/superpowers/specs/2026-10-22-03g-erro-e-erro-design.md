# Design — REDESIGN-03-G: erro é erro (P0-5) e a parte de leitura da fila de riscos da REDESIGN-03

> Desenhado com o dono em **2026-10-22**, antes de qualquer linha de código. Escopo declarado em
> `docs/redesign/PLANO.md` (03-G) e `docs/redesign/AUDITORIA.md` (P0-5), mais os riscos residuais
> que as subfases 03-B2, 03-C, 03-C2, 03-E e 03-F mandaram para cá.
>
> **Base:** `5bdeb3f`, ponta de `feat/redesign-00-auditoria` (03-F integrada em `84bf87b` e
> registrada no STATUS em `5bdeb3f`). Branch `feat/redesign-03g-erro-e-erro`, sem upstream.
>
> Depois de aprovado, este documento é o contrato: quem discordar de algo aqui para e reporta.
>
> ⛔ **A 03-G foi cortada em duas (K0).** Esta subfase cuida da **leitura** e da **tela de erro**.
> A **escrita** (atomicidade, compensações que ignoram erro, a confirmação de excluir) é a
> **03-G2**, com desenho próprio. A §12 lista o que foi para lá.

---

## 1. O que a 03-G muda de natureza

- **Uma leitura que falhou deixa de ser uma leitura vazia.** Hoje, em 73 das 90 leituras do
  financeiro, o `supabase-js` devolve `{ data: null, error }`, o código lê só `data`, cai no
  `?? []` e a tela soma uma lista vazia: **R$ 0,00 com cara de fato**. Depois da 03-G, toda
  leitura financeira passa por um helper que **lança** `ErroDeLeitura` (ou devolve o erro tipado
  que o chamador já sabia representar). Zero passa a significar "medido zero" — nunca "não li".
- **Uma lista que bateu no teto deixa de se passar por completa.** O `max_rows` do PostgREST
  (padrão 1000, fora do alcance do SQL) corta em silêncio toda leitura sem `limit`. Toda leitura
  de lista do escopo passa a pedir `count: "exact"`. Se ela **alimenta número** e veio cortada,
  é erro (`LeituraIncompleta`); se é **só lista**, a tela diz "Mostrando os N mais recentes de M".
- **O sistema ganha uma tela de erro.** Hoje há **zero** `error.tsx` no repositório: qualquer
  exceção num Server Component derruba a rota inteira na tela genérica do Next. Passa a haver
  quatro limites, com uma tela única que diz "Nada foi alterado" e oferece tentar de novo.
- **Uma leitura que decide uma escrita deixa de decidir com dado inventado.** Hoje
  `getTransactionSplit` com erro devolve "pessoal" — e salvar o formulário **apaga a divisão**;
  `reapplySplit` com erro lê "sem divisão atual" e **pula a proteção dos recebíveis cobrados**;
  `deletePerson` com erro decide entre excluir e inativar sem saber se a pessoa tem histórico.
  Toda leitura dessas passa a recusar **antes** de escrever.
- **O sino deixa de calar o que não conseguiu ler.** O Cron hoje transforma falha de leitura em
  "nada a avisar". Depois da 03-G, a família cuja leitura falhou fica **fora** do gerador, as
  outras seguem, e um aviso novo diz quais ficaram de fora.
- ⛔ **Nada é consertado retroativamente**, e **nenhuma ordem de escrita muda** (K3). Esta subfase
  não toca em `insert`/`update`/`delete` nenhum — só no que se lê antes deles.

O que **não** muda: nenhum número de tela muda quando a leitura dá certo; nenhum teto numérico
muda (500, 1000, 2000, 100); nenhuma tabela, coluna, policy ou RPC nasce (**sem migration**); o
motor (`pipeline.ts`, `montarEntradas`) não muda; `getDailyBalances` continua devolvendo "sem
saldo" no erro; a caixa da 03-E continua devolvendo `{ estado: "erro" }`.

---

## 2. Linha de base

### 2.1 Banco — medido em 2026-10-22, só leitura

`begin read only; set local role service_role;` (com FORCE RLS, sem o papel tudo dá zero).

| Medida | 2026-10-22 |
| --- | --- |
| linhas com `[03F-SINT]` (resto da 03-F) | **0** |
| linhas com `03G-SINT` | 0 |
| faturas / pagas | 9 / 0 |
| lançamentos / transferências sem destino / candidatos a órfão do P0-4 | 60 / 0 / 0 |
| contas / cartões | 5 / 5 |
| categorias / subcategorias | 27 / 4 |
| parcelas (`transaction_installments`) | 20 |
| contas fixas / recorrências | 9 / 0 |
| pessoas / recebíveis / recebimentos / divisões (`shared_expenses`) | 9 / 16 / 0 / 5 |
| linhas de importação (`import_rows`) / maior lote | 212 / 105 |
| notificações | 33 |
| md5 dos saldos (`account_balance` de cada conta, ordenado por id) | medido; guardado **fora** do repositório (é derivado de saldo real) |

Nenhuma tabela do escopo está perto de 1000 linhas; o `max_rows` **não corta nada hoje**. A 03-G
não conserta um corte que esteja acontecendo — torna visível o dia em que ele acontecer.

Config do papel `authenticator`: `statement_timeout=8s`, `lock_timeout=8s`, **sem** `max_rows`
próprio (vale o padrão do PostgREST, 1000).

### 2.2 Os cinco comandos — medidos em 2026-10-22, na ponta `5bdeb3f`, antes de tocar em nada

| Comando | Resultado |
| --- | --- |
| `npm run test:run` | 281 arquivos, **6.631** testes, verdes |
| `npm run lint` | limpo |
| `npx tsc --noEmit` | limpo |
| `npm run build` | ok |
| `npm run perf:bundle` | mediana **216,3 KB**, 68 rotas, todas no orçamento; maior `/(app)/todo` **241,2** |

As 68 rotas foram lidas com uma cópia do script no scratchpad que troca o `slice(0, 10)` por
todas (o repositório não mudou). A lista inteira fica guardada para o antes × depois, porque o
`(app)/error.tsx` entra em **todas** as rotas do app (§5.4).

### 2.3 O inventário — medido, não estimado

**Método.** Um varredor sobre a AST do TypeScript (`typescript` do próprio projeto) visita cada
`.from("…")` e `.rpc("…")` de `src/` (fora testes e `src/test/`), sobe a cadeia fluente,
classifica leitura × escrita (`insert`/`update`/`upsert`/`delete`), registra se há teto
(`limit`/`range`/`single`/`maybeSingle`/`head: true`) e segue o resultado até o `await` —
inclusive builder guardado em variável, ternário e `Promise.all` — para dizer o que acontece com
o `error`: **descartado**, **desestruturado e tratado** (lança / devolve resultado de erro /
devolve objeto tipado / **engole**), passado como argumento ou repassado. O mesmo varredor vira
teste na L8.

**O repositório inteiro.**

| | Total | Descartam o `error` |
| --- | --- | --- |
| Chamadas | 1.296 | — |
| Leituras | 672 | **593** (+ 33 passadas a helpers que também descartam: `safe()` da busca ×29, `scoped()` de Treinos ×4) |
| Escritas | 624 | fora desta subfase (K0) |

Leituras por diretório (total / descartam): `actions` 290/276 · `training` 71/65 · `nutrition`
63/60 · `ai` 55/48 · `notifications` 49/49 · `finance` 42/24 · `search` 29 (todas via `safe()`)
· `todo` 24 · `studies` 14 · `body` 9 · `tasks` 7 · `dashboard` 6/5.

**O escopo financeiro** (`src/lib/finance/*` + as actions financeiras): **90 leituras, 73 sem
tratamento** — mais `catchUpRecurrences`, que confere o erro e o **engole** (`{ generated: 0 }`).

| Arquivo | Leituras | Sem tratamento | Linhas |
| --- | --- | --- | --- |
| `finance/queries.ts` | 27 | **25** | todas as funções exportadas, menos as duas de `getDailyBalances` (que devolve `null`, mantido pela K1); o varredor automático marcou 26 por não seguir o builder de `getDailyBalances` dentro do `Promise.all`, e o revisor do desenho contou 25 à mão |
| `actions/imports.ts` | 20 | **20** | 122, 152, 210, 270, 365, 375, 392, 460, 530, 589, 690, 703, 724, 916, 964, 971, 985, 989, 1004, 1063 |
| `actions/statements.ts` | 9 | 4 | 84, 92 (`markStatementPaid`), 208, 217 (`moveTransactionToStatement`) |
| `actions/installments.ts` | 7 | **7** | 58, 214, 222, 277, 290, 351, 356 |
| `actions/transactions.ts` | 6 | 5 | 254, 259 (`getTransactionSplit`), 284 (`statementPaidBy`), 296 (`deleteTransaction`), 344 (`setTransactionStatus`) |
| `finance/statements.ts` | 4 | **4** | 27, 49, 69, 93 (o "busca ou cria" da fatura) |
| `finance/recebimentos-leitura.ts` | 3 | 1 | 28 (`lerRecebimentos`: erro → `[]` + `sem_contagem`) |
| `actions/bills.ts` | 2 | 1 | 109 |
| `actions/people.ts` | 2 | **2** | 78, 82 (`deletePerson` decide excluir × inativar) |
| `finance/caixa-leitura.ts` | 2 | 0 | (mas `getReceivables()` por baixo: RR-E-9) |
| `finance/recebimentos-servico.ts` | 2 | 0 | — |
| `actions/credit-cards.ts` | 1 | 1 | 101 |
| `actions/categories.ts` | 1 | 0 | — |
| `finance/categorias-marcadas.ts` | 1 | 1 | 18 (RR-C2-3) |
| `finance/generation.ts` | 1 | 0 (engole) | 159 |
| `finance/services.ts` | 1 | 1 | 270 (`excluirTransacaoSimples`) |
| `finance/split-reapply.ts` | 1 | 1 | 94 (a divisão atual) |

**O Cron** (`notifications/cron.ts`): 13 leituras centrais num `Promise.all` + `lerRecebimentos`,
**todas** descartando o erro; a de lançamentos **sem `limit`**; as preferências e o dedupe também
descartam; Dieta, Treinos e IA isolados por `.catch(() => null)` — falha calada.

**Telas.** `error.tsx`: **0** no repositório. 63 páginas em `(app)`. Layouts: raiz, `(auth)`,
`(app)`, `financeiro`, `ia`, `nutricao`, `treinos`.

---

## 3. As decisões desta sessão

### 3.1 Do dono (2026-10-22, uma de cada vez)

| # | Decisão |
| --- | --- |
| **K0** | **O corte.** 03-G = leitura e tela de erro: P0-5 do financeiro (as leituras que alimentam número **e** as que decidem escrita), os `error.tsx`, o RR2 no financeiro e no Cron, RR-C2-3, RR-E-9 e as leituras do Cron. **03-G2** = escrita: RR6/RR12, RR8/RR14, RR11, RR-F-1, RR-F-2 (mais o `delete` que devolve `ok`), RR-F-6 e a K5 no fim. As ~500 leituras não financeiras ficam fora, com destino "subfase de manutenção pós-REDESIGN" (até lá, cobertas só pelo `error.tsx`). As escritas fora da lista do prompt ficam registradas com destino; entram na 03-G2 só se o dono quiser. ("Aprovado") |
| **K1** | **A forma do erro nas telas: a mistura.** (1) Toda leitura financeira lança `ErroDeLeitura` (com `oQue`), por um helper único. (2) Página cujo conteúdo é um todo → `error.tsx` genérico: *"Não foi possível ler os dados desta tela. Nada foi alterado."*, com `unstable_retry` e o `digest`; arquivos `(app)/error.tsx`, `financeiro/error.tsx` e `global-error.tsx`, com um componente compartilhado. (3) Card do dashboard captura `ErroDeLeitura` **no servidor** e diz qual leitura falhou; qualquer outra exceção sobe. (4) Leitura em action/serviço → `dbError("Não foi possível ler X. Nada foi alterado.")` **antes** de qualquer escrita. (5) O que já é tipado continua tipado (caixa da 03-E; `getDailyBalances` → sem saldo). ("Aprovado") |
| **K1b** | **O Cron, por família.** Família cuja leitura falhou fica **ausente** do gerador; as outras seguem; famílias que dependem de duas leituras caem juntas; regra pura num módulo testado. Dedupe com erro ⇒ não insere nada para aquele usuário. Preferências com erro ⇒ não entrega nada. Aviso novo no sino `sistema_verificacao_incompleta`: `low`, com link, dedupe por dia + janela, **não** opt-in, pelo gerador único e pelo `filterByPrefs`. Texto: *"Na verificação de hoje às 09h não foi possível ler: faturas, contas fixas. Os avisos delas podem estar faltando."* O JSON da rota passa a listar as famílias não lidas. O `.catch` de Dieta, Treinos e IA vira "família não lida"; as leituras **internas** desses três ficam fora. ("Aprovado") |
| **K2** | **Tetos.** Teto visível por `count: "exact"` em todas as leituras de lista do escopo; sem paginação; os tetos numéricos não mudam. Saturou e alimenta número → `LeituraIncompleta` (irmã do `ErroDeLeitura`), pelo caminho da K1. Saturou e é só lista → "Mostrando os N mais recentes de M". No Cron, saturar = família não lida. ("Aprovado") |
| **K3** | A atomicidade (K3) e a confirmação de excluir em Lançamentos (K4) vão para o desenho próprio da **03-G2**. A 03-G **não mexe na ordem de nenhuma escrita**. ("Aprovado") |
| **K5** | Sem o texto dos 18 casos, a REDESIGN-03 fecha **no fim da 03-G2** contra uma **matriz de fechamento declarada** — nunca chamada de "os 18 do briefing": as 8 exigências da §9 de `METRICAS-FINANCEIRAS.md` num teste puro único; a §13 (13.2 a 13.6) linha a linha, apontando para o teste ou para o destino 04/05/06; e a conciliação card × tabela × gráfico. A D32 fica registrada como **não resolvida**. ("APROVADO") |

### 3.2 Do desenho (decisões minhas, para o dono conferir na leitura)

⚑ = achado do subagente que leu este desenho como quem vai construí-lo (2026-10-22), conferido no
código antes de entrar; a decisão é minha.

| # | Decisão | Por quê |
| --- | --- | --- |
| D-G1 | O núcleo mora em **`src/lib/supabase/leitura.ts`**, módulo **puro** (sem import de runtime além de tipos): `ErroDeLeitura`, `LeituraIncompleta`, `exigir`, `listaComTeto`, `listaCompleta`. `leituraComTeto` muda para lá e `finance/leitura-com-teto.ts` vira **reexport** (nenhum import existente quebra) | Neutro pelo mesmo motivo de `supabase/owner.ts` (invariante 79) e `tone/` (69): o Cron (`notifications/`) e o financeiro o usam, e dentro de `finance/` o Cron passaria a depender do módulo errado. Puro para os testes o importarem sem mock |
| D-G2 | `ErroDeLeitura.message` é **nossa e sem o texto do banco**: `"Não foi possível ler ${oQue}."`. A causa vai em `cause`; o log grava **só** `oQue` e o `code` do PostgREST | A mensagem do Postgres traz nome de tabela, de coluna e às vezes valor de linha — o mesmo motivo de `registrarFalha` em `approval/execute.ts` guardar só o código. Mutação Z16 |
| D-G3 | `LeituraIncompleta extends ErroDeLeitura` (com `lidas` e `total`), e `ErroDeLeitura` tem `tipo: "falhou" \| "incompleta"` | Quem só quer saber "não deu para ler" captura um tipo só; quem precisa dizer "veio cortado" distingue. Duas classes soltas obrigariam todo `catch` a lembrar das duas |
| D-G4 | `LeituraComTeto` ganha `total: number \| null` (o `count`) | O aviso "N de M" precisa do M. Campo novo, opcional na leitura: nenhum consumidor atual muda |
| D-G5 | **Reclassificações pela regra da K2:** `/parcelamentos` **alimenta número** (tem `StatCard`s somando as compras) → saturar é erro; as **linhas da importação** alimentam número (a revisão soma por `totaisPorStatus`) → erro. **Só lista** de verdade: o extrato de `/financeiro/lancamentos`, os itens de cartão em `/faturas` (o total vem da view, não da lista) e o histórico de lotes (`getImportBatches`) | A pergunta da K2 é "alguém soma isso?", e a resposta foi lida no código de cada tela, não suposta pelo nome |
| D-G6 | **As saturações que o motor já declara ficam como estão:** transações, recebíveis e recebimentos em `lerFinanceiro` continuam virando "parcial com motivo" (03-B2), não erro | Já são visíveis — o card diz "parcial" e o motivo. Trocar por erro esconderia um número que hoje aparece marcado. O que muda nelas é só o **erro**: hoje, erro de leitura vira `[]` + `sem_contagem` ("não foi possível confirmar"); depois, vira `ErroDeLeitura` |
| D-G7 | `getTransactions` passa a devolver `LeituraComTeto` (com `count: "exact"`), e **cada chamador decide**: `/financeiro` (soma Entradas/Saídas) exige completa; `/financeiro/lancamentos` e `/faturas` mostram o aviso de teto | A função é a mesma para três telas com respostas diferentes à K2. Decidir dentro dela exigiria um parâmetro "esta tela soma?" — a pergunta pertence ao chamador |
| D-G8 | `catchUpRecurrences` (roda no render de `/financeiro`) passa a **lançar** no erro de leitura, em vez de `{ generated: 0 }` | Hoje uma falha faz a página dizer "nenhuma recorrência a gerar" e seguir com o mês sem os lançamentos recorrentes — o R$ 0,00 por outro caminho |
| D-G9 | `getReceivables` em `/terceiros`: saturar = **erro** | A tela soma "a receber" por pessoa e por mês |
| D-G10 | `lerCaixaDoMes` (RR-E-9): erro de recebíveis → `{ ok: false }` (o caminho tipado que já existe para lançamentos e faturas); saturação de recebíveis → `parcial` | K1.5: o caixa já sabe dizer erro; só faltava a terceira leitura passar por ele |
| D-G11 | O Cron é tratado **inteiro por família**: as 13 leituras centrais, **inclusive as não financeiras** (tarefas, agenda, hábitos, estudos, TO-DO) | Estão no mesmo `Promise.all` do mesmo arquivo; tratar só as financeiras deixaria o mesmo defeito a uma linha de distância, com a regra pura já pronta para cobri-las |
| D-G12 | `sistema_verificacao_incompleta` **não ganha interruptor**: entra em `NOTIFICATION_TYPES_SEM_INTERRUPTOR`, com o motivo | É o precedente da 07-D (D5): o que avisa que **algo está errado** não se desliga por preferência de rotina. Ele continua passando por `filterByPrefs` (invariante 24) — só não há chave na tela para desligá-lo |
| D-G13 | O aviso tem link para **`/notificacoes`** e dedupe `sistema_verificacao_incompleta:<dia>:<09h\|21h>`, com a janela derivada da **hora de Brasília** de `now` (`timeInSaoPaulo`, nunca o `TZ` do processo) | Duas execuções no mesmo dia são duas verificações distintas; a mesma execução rodada de novo não duplica. Link porque toda notificação tem um (invariantes 22/82) |
| D-G14 | Quatro limites de erro: **`src/app/error.tsx`** (raiz) + `(app)/error.tsx` + `financeiro/error.tsx` + `global-error.tsx`, todos renderizando `src/components/shared/tela-de-erro.tsx` | O `error.tsx` de um segmento **não** envolve o `layout.tsx` do mesmo segmento: uma falha no `(app)/layout.tsx` (que lê o usuário) só é pega pelo da raiz. O de `financeiro` existe para o cabeçalho e as abas do módulo continuarem na tela. O `global-error` cobre a falha do layout raiz |
| D-G15 | `TelaDeErro` é **client** e leve: só `ui/button` e um ícone; **sem** `next/dynamic`, sem `zod`, sem `validators` | O `(app)/error.tsx` entra no JS de **todas** as rotas do app (invariante 91). Teto de **1,5 KB gz** a mais na mediana, medido; estourar não se resolve subindo o orçamento |
| D-G16 | `AvisoDeTeto` (`src/components/shared/aviso-de-teto.tsx`) é **server** e sem estado | Só texto; não paga JS |
| D-G17 | `CardSemLeitura` é **server**, renderizado por `FinanceCard`/`InvoicesCard` quando capturam `ErroDeLeitura`; o JSX fica **fora** do `try` (a leitura vai a uma variável dentro dele) | A regra `react-hooks/error-boundaries` reprova JSX montado dentro de `try`; e é o que permite capturar **só** a leitura, não um erro de render |
| D-G18 | **`gerarInsight`** (a Server Action de `/ia/insights`) captura `ErroDeLeitura` vindo do coletor e devolve `dbError` | Hoje uma falha de leitura vira indicadores zerados e um insight **pago** sobre números falsos. Depois, `coletar` lança antes de qualquer custo (é o passo 1 do runner); o job já tem `try/catch` por módulo; a action não tem nenhum e o erro chegaria à tela como exceção solta |
| D-G19 | Serviço que já devolve uma união de resultado (`reapplySplit` → `ReapplyResult`, `excluirTransacaoSimples`) devolve a falha **por ela**, com mensagem do **próprio escopo** (*"Não foi possível ler a divisão atual. A divisão não foi alterada."*); serviço que devolve valor solto (`finance/statements.ts`, `string \| null`) **lança** `ErroDeLeitura` | "Nada foi alterado" só é verdade quando nenhuma escrita veio antes **na action inteira**. `reapplySplit` roda depois do `update` no caminho despesa → despesa (RR6, 03-G2): lá, a frase verdadeira é sobre a divisão, não sobre o lançamento |
| D-G20 | Nas actions, **a frase depende do momento**: leitura antes de qualquer escrita → *"Não foi possível ler X. Nada foi alterado."*; leitura depois de uma escrita da mesma action → *"Não foi possível ler X. A alteração pode ter sido gravada em parte: recarregue a página para conferir."* Dois construtores puros em `actions/helpers.ts` (`falhaDeLeituraAntes`, `falhaDeLeituraDepois`); a classificação de cada linha é do plano, com a lista da §2.3 como roteiro | Invariante 37 aplicada à mensagem: erra para "pode ter acontecido em parte", nunca afirma o que não sabe. A K3 proíbe mudar a ordem; dizer a verdade sobre ela, não |
| D-G21 | `finance/statements.ts` (o "busca ou cria" da fatura) **lança** no erro de leitura | Hoje, erro na busca → tenta **criar** → o unique recusa → devolve `null` → o lançamento ou a parcela é gravado **sem fatura**. Lançar antes da criação fecha esse caminho; o que já foi escrito antes dele na action é assunto da 03-G2 (e a frase da D-G20 o declara) |
| D-G22 | O harness em memória (`src/test/supabase-em-memoria.ts`) ganha **injeção de erro de leitura** por tabela (`falharLeitura: { tabela: código }`) e passa a responder `count` quando pedido | Os testes de comportamento das actions já usam esse harness; sem a injeção, "com erro de leitura nada é escrito" só seria provável por mock à mão em cada teste |
| D-G23 | A varredura da L8 vira **teste** (`src/lib/finance/leituras-que-engolem-erro.test.ts`), com o varredor em `src/test/inventario-de-leituras.ts` e uma lista **declarada** de exceções, cada uma com motivo e destino | O mesmo padrão de `quem-escreve-transactions.test.ts` (03-F): leitura nova no escopo que descarte o erro derruba a suíte; uma exceção sem motivo também |
| D-G24 | `getCategoriesEnsureSeed`: o `rpc("seed_default_categories")` é **escrita** e fica como está (exceção declarada na varredura, destino 03-G2); as duas leituras de categorias em volta dele lançam | O varredor classifica `rpc` como leitura por padrão; esta não é |
| D-G26 ⚑ | **`ErroDeLeitura` nunca escapa de uma Server Action.** Toda action que chama algo que lança (`finance/statements.ts`, `criarTransacao`, leituras de `queries.ts`) captura **só** `ErroDeLeitura` e devolve `falhaDeLeituraAntes`/`falhaDeLeituraDepois` conforme haja escrita antes **naquela action**; qualquer outra exceção sobe. Os pontos conhecidos: `installments.ts:124` (dentro do laço das parcelas, **depois** de escritas), `imports.ts:649`, `transactions.ts:157`, `recurring.ts:132` e `services.ts:175` (`criarTransacao`). O plano os enumera de novo por `grep` antes de escrever | Exceção solta numa Server Action chega ao cliente só com o `digest` e vira uma promise rejeitada sem `catch`. (Achado do revisor do desenho; decisão minha) |
| D-G27 ⚑ | **`PGRST116` (`.single()` sem linha) é AUSÊNCIA, não erro de leitura.** `exigir` o devolve como `null`, e o chamador mantém a mensagem de "não encontrado" que já tem; qualquer **outro** código é `ErroDeLeitura` | Boa parte das leituras da L6 usa `.single()` (`transactions.ts:300/348`, `statements.ts:76/88/96/212/221`, `finance/statements.ts:73/97`, `installments.ts:62`, `people.ts:25`, `credit-cards.ts:38`…). Tratar o `PGRST116` como falha faria "excluir um lançamento que já sumiu" e "cartão não encontrado" virarem "não foi possível ler". (Achado do revisor; decisão minha) |
| D-G28 ⚑ | `getTransactionsForReceiptMatch` usa **`exigir`**, mantendo o corte em 10 | O teto `TETO_DE_CANDIDATAS_DO_COMPROVANTE` é **regra** (não encher a tela de alertas), não um corte silencioso: com `listaCompleta`, 11 candidatas derrubariam `/ia/comprovantes`. (Achado do revisor — o desenho a classificava errado) |
| D-G29 ⚑ | `lerRecebiveis` passa a ser **exportada** (com `situacao` dos recebíveis e dos recebimentos) e substitui `getReceivables` nos dois chamadores (`/terceiros`, `lerCaixaDoMes`); `getReceivables` sai. **Fora do motor, saturar os recebimentos é erro** — em `/terceiros`, `/parcelamentos` (via `getInstallmentPurchases`) e `/faturas` (via `getReceivablesByStatements`) — porque as três somam saldo. No caixa (D-G10), `parcial`. Dentro de `lerFinanceiro`, como hoje (D-G6) | Sem a situação, a D-G9 e a D-G10 não tinham como decidir; o teto de 5000 de `lerRecebimentos` ficava sem regra nas telas que não passam pelo motor. (Achado do revisor; decisão minha) |
| D-G30 ⚑ | **A janela do aviso mora em `familias.ts`** (`janelaDaVerificacao(now)`, pura): `manha` antes das 15h de Brasília, `noite` a partir delas — e é ela que entra no dedupe. O **texto** diz a hora real de Brasília da execução (*"às 09h"*, ou *"às 14h"* num disparo manual), por `timeInSaoPaulo` | O texto aprovado na K1b ("às 09h") só é verdade no disparo agendado; num disparo manual ou atrasado, a hora real é o que não mente. O dedupe por janela continua impedindo duplicar na mesma verificação. A Z18 derruba o teste de `familias.ts`, não o do gerador. (Achado do revisor; decisão minha) |
| D-G31 ⚑ | `catchUpRecurrences`: a leitura das recorrências (antes de qualquer escrita) **lança** (D-G8); um `ErroDeLeitura` **dentro do laço** de geração (o "busca ou cria" da fatura, depois de lançamentos já gravados) **interrompe** o laço e devolve `{ generated, interrompida: true }`, e `/financeiro` mostra *"Não foi possível gerar todas as recorrências deste mês; algumas podem estar faltando. Recarregue a página para tentar de novo."* | Senão o `financeiro/error.tsx` diria "Nada foi alterado" depois de lançamentos recorrentes gravados. As leituras do mês, que vêm depois, continuam valendo — o número da tela é o que está no banco, e o aviso diz o que pode faltar. (Achado do revisor; decisão minha) |
| D-G32 ⚑ | `getTransactionSplit` **devolve `ActionResult` de erro** (K1.4), não lança; e os **dois** chamadores cliente mudam: `transaction-form.tsx:222` e `parcelamentos/installment-split-dialog.tsx:87` passam a fazer `toast.error(res.error)` **e fechar o diálogo** quando `!res.ok` (hoje fazem `if (!res.ok) return` e deixam o formulário aberto com `parts: []` — salvar apagaria a divisão). Prova: varredura do código-fonte dos dois arquivos (padrão da invariante 25, sem teste de componente) + teste da action | Corrigir só o servidor não fechava o caminho: o formulário continuava aberto com dado falso. (Achado do revisor; decisão minha) |
| D-G33 ⚑ | O registro sem interruptor (D-G12) **edita de propósito** `settings/constants.test.ts:52` (passa a listar os quatro tipos) e a tela de preferências ganha **uma frase fixa** sob os grupos: *"Avisos do sistema (verificação incompleta) não têm interruptor: eles dizem que algum outro aviso pode estar faltando."* | O teste existente fixa exatamente os três de IA, e a única explicação na tela é a `nota` do grupo de IA. (Achado do revisor; decisão minha — ⚠️ é a única mudança em `/configuracoes`, e o dono pode preferir um grupo "Sistema" com interruptor) |
| D-G25 | **Sem migration e sem prova no banco.** Nenhuma tabela, coluna, CHECK, policy ou RPC; nenhuma escrita nova. No fim, só a recontagem da §2.1 | Os tipos de notificação são TS (`notifications/constants.ts`); `notifications.type` não tem CHECK (só `priority`), e o tipo novo cabe sem tocar o banco — conferido na migration da tabela |

### 3.3 Os fatos que o desenho responde (varredura de 2026-10-22)

1. **O `supabase-js` não lança.** `{ data, error }` sempre; o `?? []` em seguida transforma falha
   em vazio. Por isso "Este `catch` NÃO cobre erro de banco" está escrito no executor da IA
   (`ai/tools/executor.ts:302`) — e por isso a IA hoje lê R$ 0,00 como fato quando o banco falha.
2. **`count: "exact"` é a única forma de ver o `max_rows`.** O PostgREST corta e responde 200; o
   `count` traz o total real. `leituraComTeto` (03-B2) já compara os dois — só não é usada fora do
   motor.
3. **Quem vê `R$ 0,00` hoje quando o banco falha:** `/financeiro` (Entradas/Saídas do mês),
   os dois cards financeiros do dashboard, `/dashboard/financeiro`, `/relatorios`, `/terceiros`,
   `/parcelamentos`, a revisão de `/importar`, o adapter financeiro da IA, o coletor de insights
   e o sino (fatura atrasada que não avisa, gasto alto que não dispara).
4. **Quem decide escrita com dado inventado hoje:** `getTransactionSplit` (formulário abre
   "pessoal" → salvar apaga a divisão), `reapplySplit` (divisão atual vazia → proteção dos
   recebíveis pulada), `deletePerson` (exclui × inativa sem saber), `deleteTransaction` (lê
   `existing` e `statementPaidBy` sem conferir), `setTransactionStatus`, o "busca ou cria" da
   fatura (grava sem fatura), `moveTransactionToStatement`, as 20 de `imports.ts` e as 7 de
   `installments.ts`.
5. **O executor da IA e o job de insights já capturam exceção** (`TOOL_FAILED`; `try/catch` por
   módulo), e a revalidação do Approval Engine trata exceção em `prever` como `EFEITO_MUDOU`
   (`approval/execute.ts:233`) — lançar ali é o lado seguro, sem mudança neles.
6. **O gerador aceita família ausente.** Todos os campos de `GenerateInput` são opcionais e
   `generateNotifications` faz `input.x ?? []`. Ausente = "não sei", e o gerador não emite nada
   daquela família. **Mas** `card_limit` soma as faturas em aberto de `input.statements`: com
   faturas ausentes e cartões presentes, o uso seria 0 e o aviso de limite sumiria calado. Daí
   as dependências da §5.7.
7. **Em produção, o erro de Server Component chega ao `error.tsx` sem mensagem**, só com
   `digest`. A tela não consegue dizer qual leitura falhou — por isso o card do dashboard captura
   no **servidor** (K1.3), onde o `oQue` ainda existe.
8. **`error.tsx` no Next 16 recebe `{ error, unstable_retry }`** (`reset` existe e não é usado);
   `global-error.tsx` substitui o layout raiz e precisa de `<html>`/`<body>` próprios.

---

## 4. O mapa

| Item | O quê | Origem | Muda número? |
| --- | --- | --- | --- |
| **L0** | Núcleo `supabase/leitura.ts` + harness com erro injetado e `count` | P0-5 | não |
| **L1** | As 25 leituras de `finance/queries.ts` (+ `lerRecebimentos`, `categorias-marcadas`, `catchUpRecurrences`) | P0-5, RR2, RR-C2-3 | **não**, salvo o R$ 0,00 de leitura falha, que deixa de aparecer |
| **L2** | As telas: aviso de teto nas listas, `LeituraIncompleta` nas que somam | K2, RR2 | não |
| **L3** | Os quatro limites de erro + `TelaDeErro` | P0-5 | não |
| **L4** | Os cards do dashboard capturam no servidor; `gerarInsight` captura | K1.3, D-G18 | não |
| **L5** | `lerCaixaDoMes` com a terceira leitura conferida | RR-E-9 | não |
| **L6** | As leituras que decidem escrita, em actions e serviços | P0-5 | não |
| **L7** | O Cron por família + o aviso `sistema_verificacao_incompleta` + o JSON da rota | K1b, RR2 | não (o aviso é novo) |
| **L8** | A varredura como teste | P0-5 | não |
| — | RR6/RR12, RR8/RR14, RR11, RR-F-1, RR-F-2, RR-F-6, K3, K4, K5 | — | **03-G2** (§12) |

---

## 5. A forma de cada item

### 5.1 L0 · O núcleo

`src/lib/supabase/leitura.ts` (puro; `PostgrestError` só como **tipo**):

```ts
export class ErroDeLeitura extends Error {
  readonly tipo: "falhou" | "incompleta";
  readonly oQue: string;            // rótulo nosso em pt-BR: "os lançamentos", "as faturas"
  readonly codigo: string | null;   // o `code` do PostgREST, para o log — nunca a mensagem
}
export class LeituraIncompleta extends ErroDeLeitura {
  readonly lidas: number;
  readonly total: number;
}
export function exigir<T>(res: { data: T; error: PostgrestError | null }, oQue: string): T;
export function listaComTeto<T>(
  res: { data: T[] | null; error: PostgrestError | null; count: number | null },
  oQue: string,
): LeituraComTeto<T>;                 // lança no erro; situacao + total
export function listaCompleta<T>(res: …, oQue: string): T[];   // lança no erro E na saturação
export function exigirCompleta<T>(l: LeituraComTeto<T>, oQue: string): T[]; // para o chamador da D-G7
export function leituraComTeto<T>(linhas: T[], count: number | null): LeituraComTeto<T>; // movida
```

- `exigir` devolve `data` como veio: `maybeSingle()` sem linha continua `null`, e o `PGRST116`
  de `.single()` sem linha também vira `null` (D-G27) — ausência legítima não é erro.
- `listaCompleta` com `count === null` **lança** `LeituraIncompleta` (quem chamou esqueceu o
  `count`; errar para "pode faltar" — invariante 29).
- `ehErroDeLeitura(e)` por `instanceof`.
- `registrarFalhaDeLeitura(e)`: `console.error("[leitura]", e.oQue, e.codigo)` — só isso (D-G2).
  Quem **captura** um `ErroDeLeitura` (card, `gerarInsight`, Cron) o chama, porque o erro
  capturado não chega ao log do Next sozinho.
- `actions/helpers.ts` ganha `falhaDeLeituraAntes(oQue)` e `falhaDeLeituraDepois(oQue)` (D-G20),
  que devolvem `ActionResult` de erro.

**Harness** (`src/test/supabase-em-memoria.ts`): `falharLeitura?: Record<tabela, código>` faz
`select` naquela tabela devolver `{ data: null, error: { code, message } }` com a **mensagem do
banco preenchida de propósito** (é o que a Z16 procura na saída); `count` responde o total da
tabela filtrada quando a chamada pediu `{ count: "exact" }`; `maxRows` (que já existe) corta
`data` sem cortar `count`.

### 5.2 L1 · As leituras do financeiro

Cada função de `finance/queries.ts` passa por um dos três helpers; **o retorno de sucesso não
muda** (exceto `getTransactions`, D-G7):

| Forma | Funções |
| --- | --- |
| `listaCompleta` (lista sem teto numérico: o `max_rows` é o teto) | `getAccounts`, `getCategories`, `getCategoriesEnsureSeed` (as leituras), `getSubcategories`, `getCreditCards`, `getStatements`, `getStatementInstallmentItems`, `getBills`, `getRecurrences`, `getPeople`, `getPeopleForSelect`, `getReceivablesByStatements`, `getImportRows` |
| `listaComTeto` (teto numérico, cada chamador decide) | `getTransactions` (500), `getTransactionsRange` (2000, já tinha `count`), `lerRecebiveis` (1000, já tinha; agora exportada, D-G29), `getInstallmentPurchases` (500 → **completa exigida** pelo chamador, D-G5), `getImportBatches` (100, só lista) |
| `exigir` (um registro, ou corte que é regra) | `getStatementByCompetencia`, `getCardBillingDays`, `getTransactionById`, `getImportBatch`, `getTransactionsForReceiptMatch` (corte em 10 é regra, D-G28) |
| mantém | `getDailyBalances` → `null` no erro (K1.5); o `rpc` de seed (D-G24) |

Fora de `queries.ts`:
- `lerRecebimentos`: erro → **lança**; saturação → `situacao` como hoje (D-G6).
- `idsDasCategoriasMarcadas` (RR-C2-3): erro → **lança**. Hoje o `[]` faz `getTransactions` com
  `categoriasMarcadas` devolver "nenhum lançamento nas categorias marcadas".
- `catchUpRecurrences`: erro na leitura das recorrências → **lança** (D-G8); erro dentro do laço → interrompe e declara (D-G31).
- `lerFinanceiro`: nada muda nele — as leituras de baixo passam a lançar e ele propaga.
  `sem_contagem` deixa de ser alcançável por erro.

Os rótulos `oQue` são uma **tabela única** em `finance/rotulos-de-leitura.ts` (puro), para a
mensagem do card, da action e do Cron dizer a mesma coisa sobre a mesma leitura.

### 5.3 L2 · As telas e o teto

| Tela | Leitura | Regra |
| --- | --- | --- |
| `/financeiro` | `getTransactions({ month })` | `exigirCompleta` → `LeituraIncompleta` → `financeiro/error.tsx` |
| `/financeiro/lancamentos` | `getTransactions(filtros)` | `AvisoDeTeto` acima da lista quando `saturou` |
| `/faturas` | `getTransactions({ cardId })` | `AvisoDeTeto` (o total da fatura vem da view) |
| `/parcelamentos` | `getInstallmentPurchases` | `exigirCompleta` (D-G5) |
| `/terceiros` | `lerRecebiveis` (D-G29) | `exigirCompleta` nos recebíveis **e** nos recebimentos (D-G9, D-G29) |
| `/importar` (revisão) | `getImportRows` | `listaCompleta` (D-G5) |
| `/importar` (histórico) | `getImportBatches` | `AvisoDeTeto` |

`AvisoDeTeto` (server): *"Mostrando os {N} mais recentes de {M} {oQue}. Use os filtros para ver
os demais."* — números com `toLocaleString("pt-BR")`. Sem `total` (contagem ausente) ele diz
*"Mostrando os {N} mais recentes; pode haver mais."*

### 5.4 L3 · A tela de erro

- `src/components/shared/tela-de-erro.tsx` (`"use client"`): título *"Não foi possível ler os
  dados desta tela."*, linha *"Nada foi alterado."*, botão *"Tentar de novo"* →
  `unstable_retry()`, e *"Código: {digest}"* em texto pequeno quando houver. Nenhuma mensagem
  do `error` é exibida (em produção ela nem chega; em desenvolvimento poderia trazer texto do
  banco).
- `src/app/error.tsx`, `src/app/(app)/error.tsx`, `src/app/(app)/financeiro/error.tsx`:
  `"use client"`, recebem `{ error, unstable_retry }` e renderizam `TelaDeErro`. Um `useEffect`
  faz `console.error(error.digest)` (só o digest).
- `src/app/global-error.tsx`: `<html lang="pt-BR"><body>` próprios, importa `./globals.css`,
  renderiza `TelaDeErro`. Sem o provedor de tema (ele mora no layout raiz que caiu) a tela sai
  no tema claro — RR-G-7.
- Bundle: medido antes × depois em todas as 68 rotas; teto da D-G15.

### 5.5 L4 · Os cards e o insight

`FinanceCard` e `InvoicesCard`:

```tsx
let dados: Awaited<ReturnType<typeof getFinanceCardData>> | null = null;
let falha: ErroDeLeitura | null = null;
try { dados = await getFinanceCardData(window.mes, todayIso); }
catch (e) { if (!ehErroDeLeitura(e)) throw e; falha = e; registrarFalhaDeLeitura(e); }
if (falha) return <CardSemLeitura titulo="Finanças" oQue={falha.oQue} />;
```

`CardSemLeitura` (server): *"Não foi possível ler {oQue}. O card fica sem valores para não
mostrar um número errado."* e um link *"Tentar de novo"* para a própria rota. Os outros cards
do dashboard não mudam (cada um no seu `Suspense`; os não financeiros ficam com o `(app)/error`).

`gerarInsight` (D-G18): `try { await runInsight(…) } catch (e) { if (!ehErroDeLeitura(e)) throw e;
return dbError("Não foi possível ler os dados do módulo. Nenhuma análise foi gerada e nada foi
gasto.") }`.

### 5.6 L5 · O caixa (RR-E-9)

`lerCaixaDoMes`: `getReceivables()` → `lerRecebiveis` (exportada, D-G29), conferido como as outras duas.
Erro → `{ ok: false }` (vira `{ estado: "erro" }` em `estadoDoCaixa`, como hoje para lançamentos e
faturas); saturação → `parcial` com o motivo do motor.

### 5.7 L6 · As leituras que decidem escrita

Regra única: **a leitura confere o `error` e recusa antes da próxima escrita**, com a frase da
D-G20 conforme o momento. Os casos graves, com o comportamento esperado em teste:

| Onde | Hoje, com erro de leitura | Depois |
| --- | --- | --- |
| `getTransactionSplit` | devolve "pessoal" → salvar apaga a divisão | devolve `ActionResult` de erro; os dois chamadores cliente mostram o toast e **fecham o diálogo** (D-G32) |
| `reapplySplit` (`:94`) | divisão atual vazia → proteção dos recebíveis pulada | `{ ok: false, error: "Não foi possível ler a divisão atual. A divisão não foi alterada." }`, sem escrita (D-G19) |
| `deletePerson` (`:78`, `:82`) | decide excluir × inativar sem saber | `falhaDeLeituraAntes("o histórico da pessoa")` |
| `deleteTransaction` (`:296`, e `statementPaidBy` `:284`) | segue com `existing` nulo / ponteiro desconhecido | recusa antes de reabrir a fatura e antes do `delete` |
| `setTransactionStatus` (`:344`) | segue | recusa |
| `markStatementPaid` (`:84`, `:92`) | conta/cartão "não encontrado" | `falhaDeLeituraAntes` (mensagem distinta de "não encontrado") |
| `moveTransactionToStatement` (`:208`, `:217`) | segue | recusa |
| `finance/statements.ts` (4) | tenta criar → `null` → grava sem fatura | lança (D-G21) |
| `imports.ts` (20), `installments.ts` (7), `bills.ts:109`, `credit-cards.ts:101`, `services.ts:270` | seguem | recusam, com a frase do momento |

O teste de cada caso grave injeta o erro (D-G22) e afirma **duas** coisas: a mensagem, e que
**nenhuma escrita** aconteceu depois da leitura (o harness registra as operações).

### 5.8 L7 · O Cron

**Módulo puro novo** `src/lib/notifications/familias.ts`:

```ts
export type Leitura = "cartoes" | "faturas" | "contasFixas" | "recebiveis" | "recebimentos"
  | "tarefas" | "agenda" | "habitos" | "registrosDeHabito" | "cursos" | "sessoesDeEstudo"
  | "lancamentos" | "todo" | "lembretes" | "dieta" | "treinos" | "ia";
export type Familia = "faturas" | "limiteDoCartao" | "contasFixas" | "recebiveis" | "tarefas"
  | "agenda" | "habitos" | "estudos" | "gastoAlto" | "todo" | "lembretes" | "dieta" | "treinos" | "ia";
export const DEPENDE_DE: Record<Familia, readonly Leitura[]>;
export function familiasNaoLidas(falhas: ReadonlySet<Leitura>): Familia[];
export function textoDasFamilias(f: Familia[]): string;   // "faturas, contas fixas"
```

| Família (campo de `GenerateInput`) | Depende de |
| --- | --- |
| faturas (`statements`) | faturas, cartões |
| limite do cartão (`cards`) | cartões, faturas |
| contas fixas (`bills`) | contas fixas |
| recebíveis (`receivables`) | recebíveis, recebimentos |
| tarefas (`tasks`) | tarefas |
| agenda (`events`) | agenda |
| hábitos (`habits`) | hábitos, registros de hábito |
| estudos (`courses`) | cursos, sessões de estudo |
| gasto alto (`spending`) | lançamentos, faturas, recebíveis, recebimentos |
| TO-DO (`todoTasks`) | todo |
| lembretes (`todoReminders`) | lembretes |
| Dieta / Treinos / IA | o builder do módulo (o `.catch` vira "não lida") |

`generateForUser`:
1. Cada leitura do `Promise.all` passa por `tentar(builder, leitura)` → `{ ok: true, data } |
   { ok: false }`; lançamentos, faturas, recebíveis e agenda pedem `count: "exact"` e **saturar
   conta como falha** (K2). `lerRecebimentos` lança → `tentar` o pega.
2. A família ausente **não entra** no `GenerateInput` (campo `undefined`); as outras, como hoje.
3. `GenerateInput` ganha `naoLidas?: { familias: Familia[]; janela: "manha" | "noite"; hora:
   string }` (as duas saídas de `familias.ts`, D-G30), e `generateNotifications` emite **um**
   `sistema_verificacao_incompleta` quando a lista não é vazia (`low`, link `/notificacoes`,
   dedupe `sistema_verificacao_incompleta:<dia>:<janela>`, texto da K1b com a hora real).
4. Preferências com erro → `return { userId, candidates: 0, inserted: 0, naoEntregue:
   "preferencias" }` **sem inserir nada** (nem o aviso — ele também depende da preferência).
5. Dedupe com erro → `naoEntregue: "dedupe"`, sem inserir nada (inserir sem saber o que existe
   duplicaria; não inserir erra para "pode faltar aviso").
6. `UserGenResult` ganha `familiasNaoLidas: Familia[]` e `naoEntregue?`; a rota devolve
   `{ ok, users, inserted, aiRunsReconciled, naoLidas: [{ familias, naoEntregue }] }` — **sem**
   `userId` (o JSON pode ir a log externo).
7. Registro do tipo: `NOTIFICATION_TYPES`, `NOTIFICATION_TYPE_LABELS` ("Sistema · Verificação
   incompleta"), `notification-meta.tsx` (ícone) e `NOTIFICATION_TYPES_SEM_INTERRUPTOR` com o
   motivo (D-G12), a frase fixa na tela de preferências e o teste existente editado (D-G33). O
   teste que exige "todo tipo num grupo ou na lista" cobre o esquecimento.
8. O vocabulário do texto passa pelo teste de tom que já varre os geradores (`low`, sem cobrança).

### 5.9 L8 · A varredura como teste

`src/lib/finance/leituras-que-engolem-erro.test.ts`, usando `src/test/inventario-de-leituras.ts`
(o varredor da §2.3, refeito como módulo de teste). Arquivos varridos: `src/lib/finance/*.ts`,
`src/lib/notifications/cron.ts` e as actions financeiras (`accounts`, `bills`, `categories`,
`credit-cards`, `imports`, `installments`, `people`, `receivables`, `recurring`, `statements`,
`transactions`). Para cada **leitura**:

- passa se o resultado chega a `exigir`/`listaComTeto`/`listaCompleta`/`tentar`, **ou** se o
  `error` é desestruturado e o `if` que o testa **lança ou devolve resultado de erro**;
- reprova se descarta o `error` ou se o `if` o **engole** (`return []`, `return null`,
  `{ generated: 0 }`);
- reprova se a linha estiver na lista de exceções **sem** motivo e destino.

Exceções declaradas: `getDailyBalances` (K1.5), o `rpc` de seed (D-G24), e — dentro de
`cron.ts` — nenhuma: os builders de Dieta/Treinos/IA ficam em outros arquivos, fora da varredura
(K1b). Um teste de sanidade afirma que o varredor **encontra** o número de leituras medido no
passo da L8 (fixado no teste; na §2.3 eram 90 no financeiro, antes de `cron.ts` entrar na
lista), para a ausência de achado não ser um varredor que não leu nada (invariante 106).

---

## 6. Mutações — o critério de aceite

Cada uma aplicada sozinha, **compilando**; o **nome** de cada teste que cai é registrado; a
restauração é conferida por `git diff --quiet`, nunca pelo verde.

| # | Mutação | Tem de derrubar |
| --- | --- | --- |
| Z1 | uma leitura volta a descartar o `error` (três variantes: em `queries.ts`, em `reapplySplit`, no Cron) | a varredura **e** o teste de comportamento daquele ponto |
| Z2 | `exigir` deixa de lançar | testes do núcleo e um de cada consumidor |
| Z3 | `listaCompleta` aceita saturada (ou `count` nulo) | testes do núcleo e de `/parcelamentos`/`/terceiros` |
| Z4 | o card deixa de capturar (variante: captura e mostra 0) | teste do card |
| Z5 | um `error.tsx` some, ou usa `reset` em vez de `unstable_retry` | teste de varredura dos limites |
| Z6 | o `AvisoDeTeto` some de `/financeiro/lancamentos` | teste de varredura da página |
| Z7 | família que falhou é passada ao gerador | teste de `familias.ts` e do Cron |
| Z8 | dedupe com erro insere | teste do Cron |
| Z9 | preferências com erro entregam | teste do Cron |
| Z10 | o aviso some, vira opt-in, ou ganha interruptor | testes do gerador e das constantes |
| Z11 | `idsDasCategoriasMarcadas` volta a devolver `[]` no erro (RR-C2-3) | teste dela |
| Z12 | `lerCaixaDoMes` ignora o erro de recebíveis (RR-E-9) | teste do caixa |
| Z13 | `reapplySplit` com erro de leitura segue e apaga | teste dele (nenhuma escrita) |
| Z14 | `getTransactionSplit` com erro devolve "pessoal" (variante: um dos dois chamadores cliente volta a só fazer `return` sem fechar) | teste da action; varredura dos dois `.tsx` |
| Z15 | `deleteTransaction` com `statementPaidBy` falhando prossegue | teste dele (nenhuma escrita) |
| Z16 | a mensagem do `ErroDeLeitura` passa a incluir o texto do banco | teste do núcleo (o harness injeta uma mensagem e o teste a procura na saída) |
| Z17 | `card_limit` volta a sair com faturas não lidas (a dependência dupla some) | teste de `familias.ts` |
| Z18 | a janela do aviso sai do `getHours()` do processo | teste de `familias.ts` com instantes absolutos (21h BRT = 00h UTC) |
| Z19 | `exigir` trata `PGRST116` como erro (D-G27) | teste do núcleo e o de "excluir lançamento que já sumiu" |
| Z20 | uma action deixa o `ErroDeLeitura` escapar (sem o `catch`) | teste da action correspondente (`installments`, laço das parcelas) |
| Z21 | `catchUpRecurrences` volta a lançar dentro do laço | teste dele (`interrompida: true`) |

Mutação que sair verde é **medida** antes de ser chamada de fraqueza.

---

## 7. Restrições (as do prompt, mais as do desenho)

- **Sem migration** (D-G25). Se o plano descobrir que precisa de uma, **paro** e volta ao dono.
- Sem push, sem merge, sem deploy, sem upstream. `docs/redesign/STATUS.md`, todo `CLAUDE.md` e
  `AGENTS.md` intocados. `dashboard.test.ts` e `dashboard-caracterizacao.test.ts` sem diff.
- **Nenhuma escrita muda de lugar** (K3). Um diff que mova um `insert`/`update`/`delete` é
  recusado na revisão.
- Fixture sintética sempre; nenhum `Date.now()`/`new Date()` sem argumento no código novo;
  `timestamptz` lido com `dateInSaoPaulo`/`timeInSaoPaulo`.
- Nada de conserto retroativo: dado inconsistente que apareça é contado e reportado.
- Defeito achado fora da lista → registrado e reportado, não consertado.

---

## 8. Ordem de execução — um commit por passo

0. Este desenho, aprovado (só docs).
1. **L0** — núcleo, `leitura-com-teto` reexportado, helpers das actions, harness (`falharLeitura`,
   `count`).
2. **L1** — `finance/queries.ts` + `lerRecebimentos` + `categorias-marcadas` + `catchUpRecurrences`
   + rótulos.
3. **L3** — `TelaDeErro` + os quatro limites; bundle medido (antes de L2, para a L2 já ter onde
   cair).
4. **L2** — as telas (aviso de teto e as que exigem completa).
5. **L4** — os cards e `gerarInsight`.
6. **L5** — o caixa.
7. **L6** — as actions e os serviços (pode virar 2–3 commits: `transactions`+`split-reapply`+
   `people`; `statements`+`finance/statements`+`services`; `imports`+`installments`+`bills`+
   `credit-cards`).
8. **L7** — `familias.ts`, o Cron, o tipo novo, a rota.
9. **L8** — a varredura (por último: ela só fica verde quando as anteriores terminam).
10. Mutações Z1–Z21, os cinco comandos, `TZ=UTC`, a recontagem da §2.1, a conferência visual e a
    revisão final da branch inteira no modelo mais capaz.

Cada passo fecha com `npx vitest run` nos diretórios tocados, **a suíte inteira antes de cada
commit** e o `git diff` revisado (nada de chave, token, `.env`, `service_role`; CRLF → LF). Cada
tarefa substancial passa pelo `ai-router-br:route` com pacote de até 5 arquivos; o `summary_line`
vai literal na entrega. Desenho, núcleo, Cron, mutações e revisão ficam no principal; patch de
worker é dado não confiável (`tsc` antes de aplicar).

---

## 9. A prova

**Sem banco** (D-G25): nenhuma escrita nova, nenhuma RPC. O comportamento é provado por teste,
com o erro injetado pelo harness. No fim, só a recontagem da §2.1 (mesmos números, mesmo md5).

**Visual** (claro, escuro, 390 px), sem quebrar o banco e sem digitar senha:
- `TelaDeErro`, `CardSemLeitura`, `AvisoDeTeto` e o aviso no sino. Para ver cada um: em `npm run
  dev`, uma variável **só de desenvolvimento** não entra no código — em vez disso, a forma de
  provocar é descrita ao dono (ex.: trocar temporariamente, na máquina dele, o nome de uma tabela
  numa leitura e recarregar), **ou** a captura sai de uma página de teste local fora do
  repositório, renderizada com o CSS do bundle (o método do `CLAUDE.md`).
- O `global-error` é conferido só no claro (RR-G-7).

---

## 10. Critérios de aceite

- Os cinco comandos verdes na ponta, com números medidos; mediana e as 68 rotas antes × depois,
  dentro da D-G15.
- Z1–Z21 cada uma derrubando o teste nomeado.
- `TZ=UTC npx vitest run src/lib/finance/ src/lib/actions/ src/lib/notifications/` verde.
- A varredura (L8) verde com o número de leituras fixado encontrado e só as exceções declaradas.
- Banco, só leitura, no fim: as contagens e o md5 da §2.1 **iguais**.
- Conferência visual feita (ou pedida ao dono, com o que olhar).

---

## 11. Risco residual novo

| # | Risco | Destino |
| --- | --- | --- |
| RR-G-1 | `getDailyBalances` com erro vira "sem saldo", indistinguível do caso "filtro de cartão" (mantido pela K1.5) | aceito; 05 se a tela do extrato for redesenhada |
| RR-G-2 | O `error.tsx` não diz **qual** leitura falhou em produção (o Next só entrega o `digest`) | aceito (o card do dashboard diz, porque captura no servidor) |
| RR-G-3 | As ~500 leituras não financeiras, e as internas dos builders de Dieta, Treinos e IA no Cron, continuam descartando o erro — cobertas só pelo `error.tsx` e, no Cron, pela família inteira | subfase de manutenção pós-REDESIGN |
| RR-G-4 | As 29 escritas financeiras que ignoram o erro, a atomicidade e o RR-F-6 | **03-G2** |
| RR-G-5 | O próprio aviso do Cron pode falhar ao inserir (fica só no JSON da rota) | aceito |
| RR-G-6 | A varredura cobre só os arquivos declarados; leitura nova num arquivo novo fora da lista não é pega | aceito; a lista mora no teste e o desenho da próxima subfase financeira a confere |
| RR-G-7 | O `global-error` sai sempre no tema claro (o provedor de tema mora no layout que caiu) | aceito |
| RR-G-9 | `getCategoriesEnsureSeed`: se a leitura **depois** do seed falhar, a tela genérica diz "Nada foi alterado" com as categorias padrão possivelmente já criadas (escrita automática do sistema, idempotente, sem dado do dono) | aceito |
| RR-G-8 | Uma leitura **depois** de uma escrita na mesma action (D-G20) recusa com a frase "pode ter sido gravada em parte" — honesta, mas o estado parcial continua possível | **03-G2** (é a atomicidade) |

---

## 12. O que vai para a 03-G2 (registrado aqui para não se perder)

- **K3 — atomicidade** de: `updateTransaction` (RR6/RR12: "grava antes de recusar"; o ramo de
  transferência apaga → recria → religa, RR-F-1), `criarTransacao` (compensações em
  `services.ts:242/245` que ignoram erro), `reapplySplit` (escritas `:134/138/144/170`),
  `deleteTransaction` (reabre a fatura ignorando o erro e **devolve `ok: true` mesmo com o
  `delete` falhando**, RR-F-2), RR8/RR14, RR11.
- **K4 — a confirmação de excluir em Lançamentos** (RR-F-6), com a previsão do que sai.
- As 29 escritas que ignoram o erro (§2.3), cada uma com destino.
- **K5 — a matriz de fechamento** da REDESIGN-03 (§3.1), no fim da 03-G2. D32 registrada como não
  resolvida.

---

## 13. Resultado da execução

*(vazia até a execução)*
