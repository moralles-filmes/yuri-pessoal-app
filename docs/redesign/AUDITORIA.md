# REDESIGN-00 — Auditoria e baseline

Executada em 2026-09-20 sobre `feat/redesign-00-auditoria` (de `main` em `5de90d6`).
**Nenhum arquivo de código funcional foi alterado. Nenhum dado foi tocado.**
Tudo conferido no código e no banco — não na documentação existente.

---

## 1. Baseline verificado

Os cinco comandos do projeto, executados de verdade:

| Comando | Resultado | Detalhe |
| --- | --- | --- |
| `npm run test:run` | ✅ **exit 0** | **185 arquivos, 3.738 testes, 100% verde**, 13,55 s |
| `npm run lint` | ✅ **exit 0** | Sem aviso |
| `npx tsc --noEmit` | ✅ **exit 0** | Sem erro |
| `npm run build` | ✅ **exit 0** | Turbopack, 68 rotas |
| `npm run perf:bundle` | ✅ **exit 0** | Mediana **213,9 KB gz**, todas dentro do orçamento |

**Não há falha preexistente.** Qualquer vermelho a partir daqui é do redesign.

### Orçamento de JS — o número que limita o redesign

```
  ~   281,6 KB  /(app)/configuracoes   (teto próprio 285 → 3,4 KB de folga)
      242,4 KB  /(app)/nutricao/compras
      238,7 KB  /(app)/habitos
      237,6 KB  /(app)/todo
      ...
      mediana 213,9 KB · 68 rotas · orçamento geral 250 KB
```

⚠️ **Tudo que a casca do app importa entra nas 68 rotas.** O redesign mexe exatamente na casca
(sidebar, header, tokens). Com 3,4 KB de folga em `/(app)/configuracoes`, **qualquer
componente novo na casca precisa ser medido antes de entrar**. Subir o teto não é solução:
uma exceção que cresce a cada bloco é um orçamento que não existe.

### Ambiente real (lido do disco, não do `package.json`)

`npm` (`package-lock.json`) · Node 24.18.1 · Next **16.2.9** · React **19.2.4** ·
Tailwind **4.3.1** (CSS-first, sem `tailwind.config.js`) · TypeScript 5.9.3 · Vitest 3.2.6 ·
Recharts 3.9.0 · Zod 4.4.3 · `@supabase/supabase-js` 2.108.2.

### Banco (conferido em 2026-09-20)

**132 tabelas** no `public` — 20 `ai_*`, 32 `nutrition_*`, 29 `training_*`, 13 `todo_*`,
4 `body_*`, 34 do núcleo. **RLS + FORCE RLS em todas: a consulta por tabela sem uma das duas
voltou zero.** 3 views, **todas com `security_invoker = true`**.

Volume atual: 377 lançamentos · **170 não-pessoais (45%)** · 241 recebíveis (169 já pagos) ·
171 divisões · 31 faturas (9 pagas) · 123 parcelas ativas · 6 pessoas · 48 receitas.

> **45% dos lançamentos envolvem terceiros.** A divisão de despesa não é caso de borda neste
> sistema — é o uso principal. Isso confirma a prioridade nº 1 do briefing.

### Rotas

66 arquivos `page.tsx` (1 raiz + 63 em `(app)` + 2 em `(auth)`); 7 route handlers; o
`perf:bundle` conta **68** entradas. O número varia conforme o que se conta — **conte antes de
citar**.

---

## 2. Achados por severidade

### 🔴 P0 — significado financeiro errado

| # | Achado | Evidência |
| --- | --- | --- |
| **P0-1** | **"Receita total" inclui dinheiro de terceiros: 46,6% do valor.** Existe uma categoria de receita cujo nome declara que o dinheiro é de terceiros, com 20 lançamentos — contorno manual de um conceito que o modelo não tem | `dashboard.ts:216-220` soma `amount`, nunca `valor_pessoal`. No banco: 0 receitas com `classificacao <> 'pessoal'` |
| **P0-2** | **Recebimento parcial é irrepresentável.** `receivables` tem `valor` e `status`, não tem `valor_recebido`. O cenário obrigatório do briefing (deve R$ 600, pagou R$ 250, restam R$ 350) **não tem como ser gravado** | Schema conferido no banco |
| **P0-3** | **Reembolso não move o caixa.** `markReceivableReceived` só grava `status` e `pago_em`; nenhuma transação é criada. O dinheiro entra e o saldo não sabe | `actions/receivables.ts:25-45` |
| **P0-4** | **Pagamento de fatura não é idempotente.** Check-then-act sem constraint: duas requisições concorrentes inserem duas transações debitando a conta, e a primeira fica órfã | `actions/statements.ts:54-60` vs `:96-104` |
| **P0-5** | **Falha de leitura vira R$ 0,00.** As queries não desestruturam `error` e devolvem `[]`. Não há **nenhum** `error.tsx` no repositório inteiro, nem Error Boundary | `finance/queries.ts:47-58`; `grep -c throw` = 0; `find -name error.tsx` = vazio |

### 🟠 P1 — a tela afirma o que não sabe

| # | Achado | Evidência |
| --- | --- | --- |
| **P1-1** | **"Próximas 6 faturas" são 6 × nº de cartões.** Com 3 cartões, 18. O teste não pega: a fixture tem 1 cartão | `dashboard.ts:508-510`; título em `financial-dashboard-client.tsx:311`; `dashboard.test.ts:285` |
| **P1-2** | **`/faturas` não distingue projeção de fatura real.** A badge "Prevista" existe no dashboard e a IA emite `projetada` — a tela dedicada não tem nenhuma das duas. A projeção mostra `R$ 0,00`, **afirmando** um valor | `statements-client.tsx:470-547` vs `invoices-card.tsx:54-60` |
| **P1-3** | **Nenhum rótulo de base.** "Competência" aparece **uma vez** em toda a tela de relatórios, num gráfico secundário. Quatro regimes convivem no mesmo grid de 4 cards | `relatorios-client.tsx:127-137, 265` |
| **P1-4** | **"A receber de terceiros" tem dois valores na mesma tela** — um filtrado por mês, outro all-time, mesmo rótulo | `lib/dashboard/queries.ts:193` vs `:248` |
| **P1-5** | **Mês em andamento compara parcial contra mês cheio**, sem pró-rata e sem aviso | `dashboard.ts:425-447` |
| **P1-6** | **7 dos 11 cards do dashboard ignoram o filtro de período**, e nada na tela diz isso. Com o filtro em "Hoje", o card Financeiro mostra o **mês inteiro** | `period.ts:128,133`; `finance-card.tsx:19-35` |
| **P1-7** | **`/dashboard/financeiro` acende dois itens da sidebar**, com `aria-current="page"` duplicado | `nav-links.tsx:36-38` |
| **P1-8** | **"Desfazer pagamento" não pede confirmação** — único movimento de dinheiro a um clique | `statements-client.tsx:516-523` |
| **P1-9** | **Pipeline financeiro triplicado**, com janelas de leitura divergentes (12 meses × 12 meses × 1 mês) | `reports/queries.ts:138-253` ≈ `dashboard/financeiro/page.tsx:56-164` ≈ `lib/dashboard/queries.ts:140-183` |

### 🟡 P2 — dívida que o redesign deve resolver de passagem

| # | Achado |
| --- | --- |
| **P2-1** | **Não existe token semântico de `success`/`warning`/`info`.** Só `--destructive`. Resultado: **212 ocorrências** de `text-emerald`/`text-destructive`/`text-red-` em 105 arquivos, e ~120 de `amber` em ~60 |
| **P2-2** | ⛔ **`TODO_COLOR_DOT.gold = "bg-primary"`** (`todo/constants.ts:141,153`) — cor **escolhida por você** para projetos/etiquetas implementada com o token de marca. Migrar `--primary` para azul faz todo item marcado como "Dourado" virar azul silenciosamente, indistinguível do item "azul" da mesma paleta |
| **P2-3** | **Hue dourado contamina os neutros**: `--background`, `--foreground`, `--card`, `--border` usam hue 70–95. Com um primário azul, os neutros quentes brigam |
| **P2-4** | **Card montado com classes soltas em 40+ lugares** (o `Card` real usa `ring-1`, não `border`), 4 opacidades de fundo e 3 raios em uso paralelo, **3 helpers concorrentes de estado vazio** |
| **P2-5** | **`card_statements.status` é coluna write-only** — gravada, nunca lida. Fatura vencida tem `'aberta'` no banco e `'atrasada'` na tela |
| **P2-6** | **Cartão inativo continua projetando 6 faturas**, gerando alertas de limite e notificações |
| **P2-7** | **Ocultar card do dashboard não economiza query.** `visibleCards()` existe e só é usada em teste; os 11 cards são sempre montados |
| **P2-8** | **`/busca` é órfã** — funcional e inalcançável pela interface |
| **P2-9** | **Zero testes sobre `nav.ts`.** Os 20 hrefs não são conferidos contra o disco, enquanto as rotas da IA são |
| **P2-10** | **`toggleCreditCardActive`, `allNavItems`, `findNavItem`** — código morto |
| **P2-11** | **`faturasPorMes` soma em reais com ponto flutuante**, fora da disciplina de centavos, e **sem teste** |
| **P2-12** | **Exportação sem metadado de período ou base.** 4 dos 5 CSVs ignoram o filtro; XLSX existe na lib e não é oferecido em `/relatorios` |
| **P2-13** | **Limites fixos de consulta invisíveis**: 500, 2000, 5000, 1000, 100 em `finance/queries.ts`. Hoje nenhum morde (377 lançamentos), mas ao saturar o card fica errado em silêncio |

---

## 3. O que está SÓLIDO e não deve ser tocado

Isto importa tanto quanto a lista de defeitos — é o que o redesign não pode quebrar.

| Área | Garantia |
| --- | --- |
| **Pagamento de fatura** | Gravado como `transferencia` com `statement_id`/`card_id` nulos → fora de entradas/saídas e fora da view. **Não há contagem dupla.** Guardas em 3 camadas |
| **Compra-pai parcelada** | `statement_id: null` + `parcelado: true`, barrada na view, em `dashboard.ts:225` e `:291`. As parcelas ocupam as faturas |
| **Aritmética** | Centavos inteiros em todo o núcleo; a soma da divisão **sempre fecha**; `variacaoPct` devolve `null` em base zero, nunca `Infinity` |
| **Regra de fatura** | `resolverFatura`/`montarFatura` com clamp de mês curto e virada de ano, **17 testes** |
| **Divisão** | `decidirReaplicacao` é o ponto único; recusa alterar divisão com recebível já cobrado/pago |
| **RLS** | 132/132 tabelas com RLS **e** FORCE RLS; 3/3 views com `security_invoker` |
| **IA isolada do dashboard** | `boundaries.test.ts:552-577` **falha** se o dashboard alcançar o runner de insight. Um botão "gerar análise" no card quebra o teste — e é intencional, porque custa dinheiro a cada carregamento |
| **Fuso** | `TZ=America/Sao_Paulo` + helpers; `vercel.json` com `regions:["gru1"]` co-locado com o banco |
| **Gráficos** | 10 pares fachada/`-impl` com `next/dynamic`; recharts (109 KB gz) fora do bundle inicial |
| **Preferências do dashboard** | `normalizeLayout` anexa id desconhecido **no fim, visível**, e descarta id morto sem lançar (`cards.ts:92-110`, com testes) |

---

## 4. Riscos do redesign

| # | Risco | Mitigação |
| --- | --- | --- |
| **R1** | **Migrar `--primary` para azul quebra cor de entidade** (P2-2) | Desacoplar `gold` de `bg-primary` **antes** de tocar o token. Preservar todos os hex `#A98438`/`#C99A2E` das paletas do usuário e o default da migration de `categories` |
| **R2** | **Casca mais pesada estoura `/(app)/configuracoes`** (3,4 KB de folga) | Medir com `perf:bundle` a cada commit da REDESIGN-02. Nada novo na casca sem `next/dynamic` |
| **R3** | **Renomear id de card do dashboard apaga a preferência salva** em silêncio | Os 11 ids de `DASH_CARD_IDS` são **imutáveis**. Id novo só no fim do array |
| **R4** | **Quebrar deep-link de busca ou notificação** | `/faturas?card=&month=`, `/tarefas?view=`, `/habitos?view=` são gerados em `search/queries.ts` e `notifications/generate.ts`. Rotas preservadas + teste de rota no disco |
| **R5** | **Mudar significado de número sem perceber** | Nenhuma alteração em `finance/dashboard.ts` sem teste de caracterização escrito **antes** |
| **R6** | **Quebrar estado vivo** — sessão de treino com cronômetro, streaming do chat da IA | REDESIGN-07 por lotes, com essas telas isoladas e testadas à mão |
| **R7** | **Salvar layout grava o período atual como padrão** (`general-dashboard-client.tsx:77`) — quem salvar a ordem olhando "Hoje" fica com "Hoje" para sempre | Separar o salvamento de ordem do de período |

---

## 5. Módulos não-financeiros — esforço e fragilidade

### Três padrões de navegação interna convivem

A escolha não é por módulo, é por **fase em que foi construído**:

| Padrão | Módulos | Situação |
| --- | --- | --- |
| **A** — coluna lateral + gaveta | Nutrição, Treinos, IA, TO-DO | Maduro, **copiado 4×**. Os três shells são o mesmo componente com nomes diferentes |
| **B** — pílulas inline | Agenda, Hábitos, Estudos, Tarefas | **O mesmo bloco JSX copiado literalmente 4×**, com as mesmas classes |
| **C** — nenhuma | Rotinas, Notificações, Busca, Configurações | — |

Não existe componente compartilhado de abas. O `ui/tabs.tsx` do shadcn existe e **nenhuma
navegação principal de módulo o usa**.

### Nota de esforço

| Módulo | Rotas | Nota | Motivo |
| --- | --- | --- | --- |
| `/busca` | 1 | **1** | Input + lista, tudo compartilhado |
| `/agenda` · `/rotinas` · `/notificacoes` · `/nutricao` | 1·1·1·12 | **2** | Boa adoção dos compartilhados. Nutrição tem 12 telas mas uniformes |
| `/tarefas` · `/habitos` · `/estudos` · `/configuracoes` · `/treinos` | 1·1·2·1·15 | **3** | Visões heterogêneas; Configurações é pilha plana de 7 cards, 2 escritos inline; Treinos carrega a sessão ao vivo |
| `/todo` | 1 | **4** | Monolito de **1.759 linhas** + nav própria de 444 + navegação em duas camadas |
| `/ia` | 9 | **4** | Streaming SSE + painel flutuante + 3,4 KB de folga de bundle |

### ⛔ Três arquivos que não se toca sem ler os comentários primeiro

1. **`floating-assistant-panel.tsx:85-102`** — `useConversaDaIa` nasce **acima** do `<Sheet>`.
   O `SheetContent` do Radix vive dentro de `<Presence>`: fechar a gaveta desmonta tudo que
   está dentro. Mover o hook para dentro **reintroduz um bug real de 2026-09-20** (a pergunta
   sumia e o `AbortController` cancelava a resposta). Guardado por `painel-persistencia.test.ts`.
2. **`floating-assistant.tsx:6-18`** — mora na casca, entra nas 68 rotas. Tem lista **escrita**
   do que não pode importar. Qualquer import novo aqui estoura o orçamento.
3. **`use-session-queue.ts:122-132, 150-179`** — `persist()` é o **único** escritor de
   `queueRef`; a fila drena em **ordem estrita, uma mutação por vez**. Paralelizar produz
   descanso órfão e correção sobrescrita.

Sobre a sessão de treino: o cronômetro **não vem do tique** — `restTimer()` recalcula do
`started_at` do banco, e o `setInterval` só provoca re-render. Recarregar a página não altera a
contagem. Mas o tique precisa continuar **isolado em `RestPanel`**: subi-lo para o client da
sessão re-renderiza a lista inteira 60×/min numa tela usada com a mão suada.

### 🔴 P1-10 — Link de módulo antigo quebra em silêncio

Só **Nutrição, Treinos e IA** têm construtor de link puro e testado (`*-links.ts`). Os outros
oito módulos têm o link como **string literal dentro de `search/queries.ts` e
`notifications/generate.ts`** — 14 pontos, **sem nenhum teste**.

Mudar `/habitos?view=agua` ou `/tarefas?view=atrasadas` no redesign quebra busca e notificação
**sem nada ficar vermelho**. Isso entra na REDESIGN-02 junto com o teste de rota no disco.

### 🟡 P2-14 — Outros achados dos módulos

- **`search/types.ts:54` expõe o número da fase ao usuário final**: o rótulo do resultado de
  busca é literalmente `"Tarefas (Fase 09)"`. É vocabulário interno vazando para a tela.
- **`barcode-scanner-dialog.tsx:170`** — `setInterval(…, 350)` + `getUserMedia`. O `stop()` só
  roda em `handleOpenChange`; uma remontagem que não passe por ele **deixa a câmera ligada**.
- **`calendar_events.task_id` existe e não tem UI de escrita.** O vínculo que a interface
  realmente usa é o recíproco `tasks.calendar_event_id`. Dois campos, um só usado.
- **`todo_calendar_sync.local_event_id` não é usado** — o TO-DO sincroniza direto com o Google
  (`todo/calendar-sync.ts`), não pela tabela local de eventos. A coluna é modelagem preparada.
- **Componentes duplicados** entre `components/tasks/` e `components/todo/` (kanban/board,
  calendar, card/row, badges).
- **Configurações importa `GoogleConnectCard` de `@/app/(app)/agenda/`** — componente de rota
  consumido por outra rota.

---

## 6. Limitações desta auditoria

- **Não abri o app no navegador.** Todo achado visual vem de leitura de código e do orçamento
  de bundle. A conferência em 390/768/1280/1440 px e zoom 200% é da REDESIGN-08 — e não será
  declarada sem ter sido feita.
- **Não há teste de componente no projeto** (`environment: "node"`, zero `.test.tsx`). O
  contrato entre lógica e tela é verificado por varredura de código-fonte. Continua assim.
- **Os números de volume são de hoje.** Limites de consulta que não mordem com 377 lançamentos
  podem morder depois.
- **Um dos seis subagentes classificou como P0** o fato de a soma de terceiros do cartão não
  filtrar status de recebível. **Reli o código contra o briefing e discordo:** somar todos os
  recebíveis é o comportamento correto para "responsabilidade original" — filtrar só os em
  aberto faria minha despesa crescer a cada reembolso recebido, que é justamente o que o
  briefing proíbe. Registrado em `METRICAS-FINANCEIRAS.md` §5.
