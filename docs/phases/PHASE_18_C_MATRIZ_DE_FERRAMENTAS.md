# Fase 18-C — Bloco 0 · A matriz de ferramentas

> **Entregável de abertura da 18-C, obrigatório antes de qualquer linha de código.**
> Levantamento refeito no repositório em **2026-08-07**. Decisões em
> `docs/superpowers/specs/2026-08-07-18c-acoes-aprovacoes-design.md`.
> A escala de risco citada aqui é **sempre a do código** (1–5); a tradução para a escala do
> documento da fase (0–4) está na §3.1 do spec.

---

## Parte 0 — O levantamento anterior estava contando outra coisa

O spec geral e o documento da fase falam em **"as 44 actions"**, com os sinais "0 usam
`redirect()`" e "3 usam `FormData`". Refazendo a contagem no repositório hoje:

| Medida | Valor em 2026-08-07 | Observação |
| --- | --- | --- |
| Arquivos em `src/lib/actions/` (fora `helpers.ts`) | **49** | O "44" do levantamento de 2026-08-04 contava **arquivos**, não funções |
| Funções `export async function` nesses arquivos | **410** | Nunca foram 44 |
| Arquivos com `FormData` | **3** | `body-measurements.ts` · `imports.ts` · `nutrition-recipes.ts` — os mesmos três nomeados no spec ✅ |
| Arquivos com `redirect(` | **0** | Confirmado ✅ |

**Consequência para esta matriz.** Classificar 410 funções uma a uma contraria a própria regra da
fase (*"não se refatora action que a IA não vai usar"*) e produziria um documento que ninguém lê.
A matriz é, portanto, de **duas partes**:

- **Parte 1 — Leitura:** as 19 ferramentas de leitura da 18-C, completas.
- **Parte 2 — Escrita:** só as actions que viram ferramenta, com o command a extrair.
- **Parte 3 — O que NÃO vira ferramenta**, e por quê. O "nível 5 é ausência de código" escrito.

A classificação **Caso A / Caso B** continua valendo por arquivo: com `redirect()` em zero
arquivos e `FormData` em três, **tudo é Caso A adaptável exceto os três**, e nenhum dos três entra
na 18-C (upload é 18-D).

---

## Parte 0.1 — A coluna que este levantamento acrescentou: o teto invisível

A 18-B descobriu, com `getSessionHistory`, que **uma leitura pode cortar linhas sem avisar quem a
chamou** — e que um total somado sobre a parte cortada sairia marcado como `completude: "exato"`.
Varredura de hoje, nas leituras que a 18-C vai consumir:

| Leitura | Teto interno | Visível para quem chama? |
| --- | --- | --- |
| `getTodoTasks` | **5000** | ❌ constante privada |
| `getCalendarEventRows` | **2000** | ❌ literal na query |
| `getTasks` | **2000** | ❌ literal na query |
| `getTransactions` | **500** | ❌ literal na query |
| `getDailyBalances` | 5000 | ❌ |
| `getTransactionsRange` | 2000 | ❌ |
| `getInstallmentPurchases` | 500 | ❌ |
| `getReceivables` | 1000 | ❌ |
| `getFoods` | 5000 | ❌ constante privada |
| `getStudyDashboard` (sessões recentes) | **30** | ❌ literal |
| `getRoutinesWithToday` | 200 | ❌ |

> ⛔ **Regra que sai daqui, e vale para toda ferramenta de leitura da 18-C:**
> quando a ferramenta agrega sobre uma leitura com teto, ela pede **teto + 1** quando a API
> permite, ou **declara a janela consultada no texto** quando não permite. Um total apresentado
> como completo sobre uma lista silenciosamente cortada é exatamente a mentira que a fase existe
> para impedir. Onde o teto não for alcançável, a ferramenta **restringe a janela** (período curto)
> em vez de fingir que cobriu tudo.

---

## Parte 1 — As 19 ferramentas de LEITURA

Todas: `kind: "leitura"` · `risk: 1` · `requiresConfirmation: false` · `idempotent: true` ·
**efeito de cache: nenhum** (leitura não revalida nada) · entrada Zod `.strict()` sem `user_id`.

### Lote 1 — TO-DO · Hábitos · Estudos

| Ferramenta | Permissão / Agente | Serviço reutilizado (o MESMO da tela) | Teto e honestidade | Testes obrigatórios |
| --- | --- | --- | --- | --- |
| `todo.get_agenda` | `allow_todo` / `todo` | `getTodoTasks` + os módulos puros de derivação de status | 5000 invisível → declara a janela; `atrasada` **é derivado**, nunca lido de coluna | derivação de atrasada com `hoje` injetado; dia sem tarefa ≠ zero tarefas |
| `todo.search_tasks` | `allow_todo` / `todo` | `getTodoTasks` + filtro puro | idem | filtro por texto sem acento; nenhum resultado ≠ "não existe projeto" |
| `todo.get_projects` | `allow_todo` / `todo` | `getTodoProjects(hoje)` | contagens já vêm da consulta enxuta | contagem bate com a da tela |
| `habits.get_today` | `allow_habits` / `habitos` | `getHabitsDashboard(hoje)` | janela de 365 dias, fixa na query | hábito sem registro ≠ hábito não feito |
| `habits.get_streaks` | `allow_habits` / `habitos` | `getHabitsDashboard(hoje)` | idem | sequência com `hoje` injetado; dia sem registro interrompe, não zera |
| `studies.get_courses` | `allow_studies` / `estudos` | `getStudyDashboard(hoje)` | 100 cursos / 30 sessões recentes | curso atrasado é **derivado na leitura** |
| `studies.get_study_time` | `allow_studies` / `estudos` | `getStudyDashboard(hoje)` | **teto de 30 sessões recentes** → a ferramenta usa o agregado, nunca a lista | período sem estudo devolve 0 **medido**, com a distinção escrita |

### Lote 2 — Agenda · Tarefas & Rotinas · Medidas corporais

| Ferramenta | Permissão / Agente | Serviço reutilizado | Teto e honestidade | Testes obrigatórios |
| --- | --- | --- | --- | --- |
| `calendar.get_upcoming` | `allow_calendar` / `agenda` | `getUpcomingCalendarEvents` | 2000 na leitura base | instante lido em **Brasília**, nunca `.slice(0,10)` de timestamptz |
| `calendar.get_day` | `allow_calendar` / `agenda` | `getCalendarEvents` | idem | dia sem evento ≠ agenda vazia sem consultar |
| `tasks.get_pending` | `allow_tasks` / `tarefas` | `getTasks` | **2000 invisível** | `atrasada` derivado, nunca gravado |
| `routines.get_today` | `allow_tasks` / `tarefas` | `getRoutinesWithToday` | 200 | rotina sem check-in ≠ rotina falhada |
| `body.get_latest` | `allow_body` / **sem agente próprio** (allowlist de `dieta` **e** `treinos`) | `getLatestWeight` + `getMeasurements` | `limit(1)` explícito | **sem medição devolve `null` com motivo**, nunca zero |
| `body.get_series` | `allow_body` / idem | `getMeasurements({from,to})` | janela pedida | dia sem registro devolve `null`; média móvel só com janela cheia |

> `body_*` é módulo central (invariante 19 da Dieta / 13 dos Treinos). As duas ferramentas ficam na
> allowlist dos **dois** agentes e exigem `allow_body` — o guard checa a permissão da *ferramenta*,
> não a do agente, então isso funciona sem código novo.

### Lote 3 — Financeiro · Dieta *(os dois com agregação própria — os mais fáceis de divergir da tela)*

| Ferramenta | Permissão / Agente | Serviço reutilizado | Teto e honestidade | Testes obrigatórios |
| --- | --- | --- | --- | --- |
| `finance.get_balances` | `allow_finance` / `financeiro` | `getAccounts` (espelha `public.account_balance`) | — | **cartão não move saldo de conta**; filtro de cartão ⇒ **sem saldo**, nunca zero |
| `finance.get_spending` | `allow_finance` / `financeiro` | `getTransactionsRange` + a agregação da tela | **500 / 2000 invisíveis** → janela curta obrigatória + declaração | **parcela lançada NÃO está em `transactions`**; centavos, nunca float |
| `finance.get_invoice` | `allow_finance` / `financeiro` | **`invoice.ts` + `getStatements`** — fonte única do fechamento | 500 em parcelamentos | fatura é **derivada na leitura**; a conta **não é reimplementada** |
| `nutrition.get_day` | `allow_nutrition` / `dieta` | `dayTotals` (que soma o `nutrients_snapshot`) | — | total sai do **snapshot**, nunca do catálogo; `exato/aproximado/parcial` viaja junto |
| `nutrition.get_period` | `allow_nutrition` / `dieta` | `dayTotals` dia a dia + `mergeTotals` de `calc.ts` | janela pedida | **dia sem registro devolve `null`**, não entra na média |
| `nutrition.get_goals` | `allow_nutrition` / `dieta` | `goalPeriodForDate` | — | **a meta de um dia é a que valia nele** |

> ⛔ **`finance.get_invoice` e `nutrition.get_*` não fazem uma única conta própria.** Todo total sai
> de `invoice.ts` e de `calc.ts`, respectivamente — reimplementar faria a IA discordar da tela, que
> é o defeito que a 18-B corrigiu em Treinos (as `MetricOptions` que não eram lidas).

### O que cada ferramenta nova exige no MESMO commit

Descriptor em `tools/registry.ts` · adapter em `tools/adapters/<modulo>.ts` (casca fina, **nenhum
`.from()`/`select()`**) · entrada Zod `.strict()` · entrada em `TOOL_EXECUTORS` · rótulo em
`ROTULO_DA_FERRAMENTA` · `refs` com rota que passa por `rotaInternaAceita` · teste que **não
espelha a implementação**.

---

## Parte 2 — As actions candidatas a ESCRITA

**Nada aqui é implementado sem autorização explícita do dono** (o gate entre os Blocos 2 e 3).
Ordem crescente de risco — é a ordem de execução do Bloco 4.

| # | Ação de domínio | Action atual | Command a extrair | Serviço reutilizado | Risco | Idempotência | `revalidatePath` (na casca) | Desfazer |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Criar tarefa no TO-DO | `createTodoTask` | `criarTarefaTodo` | recorrência pura de `todo/recurrence.ts` | **2** | `ai:{approval_id}` | `/todo` | ✅ `deleteTodoTask` |
| 2 | Concluir tarefa do TO-DO | `completeTodoTask` | `concluirTarefaTodo` | unique de `todo_completions` (**já idempotente**) | **2** | idem + o unique do banco | `/todo` | ✅ `reopenTodoTask` |
| 3 | Registrar check-in de hábito | `logHabit` / `setHabitDone` | `registrarHabito` | linha única de `habit_logs` do dia | **2** | idem | `/habitos` | ✅ `undoHabitCheckIn` |
| 4 | Reagendar tarefa do TO-DO | `rescheduleTodoTask` | `reagendarTarefaTodo` | recorrência pura | **2** | idem | `/todo` | ✅ (grava a data anterior) |
| 5 | Criar evento na agenda | `createCalendarEvent` | `criarEvento` | conflitos de agenda | **3** | idem | `/agenda` | ✅ exclusão do evento criado |
| 6 | Registrar consumo no diário | `addDiaryEntry` | `registrarConsumo` | **`snapshot.ts` — snapshot imutável** | **3** | idem | `/nutricao` | ⚠️ só exclusão da entrada |
| 7 | **Lançar transação** | `createTransaction` | `lancarTransacao` | **`invoice.ts`, parcelamentos, recebíveis** | **3** | idem | `/financeiro`, `/relatorios` | ⛔ **nunca apagar em silêncio** — usa o fluxo de exclusão segura |
| 8 | Excluir qualquer um dos acima | `delete*` | — | — | **4** | idem | conforme o módulo | ⛔ não |

### O que o Bloco 4 entregou de fato (2026-08-07)

As sete linhas estão **implementadas**, na ordem acima. O que mudou em relação ao previsto:

| Previsto | Entregue | Por quê |
| --- | --- | --- |
| 7 commands | **13** | Cada `undo` é um command PRÓPRIO — passa pelo mesmo Approval Engine, com proposta, hash e execução próprios. Um atalho que revertesse sem confirmação seria a única escrita do sistema sem o dono decidindo. |
| 7 ferramentas | **6** | Os `undo` **não têm ferramenta**: o modelo não pode propor exclusão, reabertura, apagamento nem cancelamento. Quem os alcança é o botão de desfazer da tela. |
| Linha 8 (excluir) risco 4, fora | **Continua fora** | O que existe é o desfazer de uma execução que a própria IA acabou de fazer — nunca "apague o lançamento X" dito em linguagem natural. |

**Três decisões que a implementação obrigou a tomar, e que não estavam no plano:**

1. ⚠️ **`calendar.criar_evento` produz efeito FORA do sistema, e isso não é a "sincronização
   com Google Agenda" que a Parte 3 exclui.** A Parte 3 barra as *ações de sincronização*
   (`syncGoogleCalendar`, `setTodoGoogleSync`) — a IA não liga, não desliga e não dispara
   sincronia. O que `criarEvento` faz é o que o **formulário da Agenda já faz desde a Fase
   08**: com a conta conectada, o evento criado é empurrado (best-effort) para o Google. Não é
   capacidade nova; é a capacidade existente do módulo, alcançada pelo mesmo serviço.
   **A previsão declara isso** ao dono, com o e-mail da conta, antes de ele confirmar — e a
   sensibilidade `externo` (palavra NOVA no vocabulário, criada aqui) obriga risco ≥ 3.
   *Se o dono preferir que a IA nunca produza efeito externo, a decisão é dele: basta manter
   `allow_write_calendar` desligada, ou remover o descriptor.*
2. **`finance.lancar_transacao` recusa fatura JÁ PAGA** — a única restrição desta ferramenta
   que o formulário não tem. No formulário o dono está olhando a tela da fatura; aqui o pedido
   veio em linguagem natural sobre uma fatura que ele nem citou.
3. **A extração foi da função INTEIRA, não do pedaço que a IA usa.** `criarTransacao` sabe
   fazer transferência, cartão e divisão — quem restringe é o **schema da ferramenta**, que não
   tem campo para nada disso. Uma "versão simples" para a IA seria uma segunda implementação
   do insert, e ela divergiria no primeiro campo novo.

**Regras que valem para a coluna inteira:**

- **Toda linha exige confirmação**, em qualquer `confirmation_mode` (§3.2 do spec).
- **`revalidatePath` fica exclusivamente na casca da Server Action de confirmação** — nunca dentro
  do command, nunca dentro do Tool Executor.
- **A ferramenta nunca chama rota HTTP interna simulando formulário.**
- **A linha 7 é a última**, e não por acaso: ela atravessa as regras que já produziram bug em
  produção (valor em dobro na fatura seguinte, sinal invertido na importação). O exemplo do
  briefing — *compra de R$ 120 no cartão, dividida com terceiro* — é o critério de aceite dela.
- **Nenhuma das três actions com `FormData`** (`body-measurements`, `imports`,
  `nutrition-recipes`) entra na 18-C. São Caso B e envolvem upload, que é 18-D.

---

## Parte 3 — O que NÃO vira ferramenta (o "nível 5" escrito)

Não existe descriptor para nada abaixo. **Não é uma checagem que alguém possa afrouxar — é ausência
de código**, e é assim que o spec geral define o nível mais alto de risco.

| Categoria | Exemplos no repositório | Por quê |
| --- | --- | --- |
| SQL, código e endpoint arbitrários | — | Nunca existiram e nunca existirão (§15 do spec geral) |
| Credenciais e segurança | `ai-providers.ts` (criar/remover credencial), `settings.ts` (trocar e-mail/senha) | A IA não altera a própria autorização nem a do dono |
| Preferências da própria IA | `ai-preferences.ts` (as flags `allow_*`, orçamento) | **A IA não liga a própria permissão.** É a trava que sustenta todas as outras |
| Importação de extrato/fatura | `imports.ts` (9 ações) | Caso B + a dedup por FITID é a regra mais frágil do sistema |
| Exclusão em massa sem escopo | `bulkTodoTasks`, ações em massa de compras | Só com escopo explícito e confirmação reforçada — não na 18-C |
| Estrutura de catálogo do sistema | `nutrition-foods` e `training-exercises` sobre a base `user_id is null` | A base do sistema é **imutável** (invariante dos dois módulos) |
| Sessão de treino ao vivo | `training-sessions.ts` (19 ações) | `session-machine.ts` é máquina de estado com fila local e `client_mutation_id` de dispositivo — a IA no meio disso duplica série |
| Envio externo | Sincronização com Google Agenda (`syncGoogleCalendar`, `setTodoGoogleSync`, `syncTodoToGoogle`) | Efeito fora do sistema; entra só depois, com confirmação reforçada própria |
| Anexos e fotos | `recordTodoAttachment`, fotos de evolução, foto de receita | Dado mais sensível do sistema (invariante 21/22 da Dieta). 18-D, se algum dia |

---

## Parte 4 — Efeito nas listas estáticas que já existem

Cada lote precisa mexer, no mesmo commit, em:

| Arquivo | O que muda |
| --- | --- |
| `tools/registry.ts` | Os descriptors |
| `tools/executors.ts` | O mapa nome → executor (bijeção garantida por teste) |
| `tools/adapters/<modulo>.ts` | Os adapters, com Zod junto |
| `agents/registry.ts` | Os 7 perfis novos + allowlists |
| `agents/prompts/<modulo>.ts` | Um prompt por agente, com versão |
| `agents/routing.ts` | Vocabulário, `AGENTE_DO_MODULO`, `AGENT_PERMISSION`, **desempate**, `DESCRICAO_DA_PAGINA` |
| `validators/ai.ts` | `ROTAS_COM_CONTEXTO` |
| `lib/ai/constants.ts` | `ROTULO_DA_FERRAMENTA`, `ROTULO_DA_ROTA_DE_CONTEXTO`, **`AVISO_SEM_ACESSO`**, **`RESUMO_DO_ASSISTENTE`** |
| `agents/security-prompt.ts` | Revisão da trava de honestidade |

> ⚠️ **`AVISO_SEM_ACESSO` diz hoje: *"Nesta versão existem apenas leituras de Treinos — ele não vê
> finanças, tarefas, agenda nem dieta"*.** Isso vira **mentira** no primeiro commit do Lote 1.
> Todo texto que descreve o que a IA não faz é datado — a 18-B já pagou por isso uma vez.

---

## Parte 5 — Ordem de execução e verificação

| Bloco | Entrega | Fecha com |
| --- | --- | --- |
| **0** | Este documento | — |
| 1 · Lote 1 | TO-DO, Hábitos, Estudos (7 ferramentas, 3 agentes) | `lint · tsc · test:run · build · TZ=UTC` |
| 1 · Lote 2 | Agenda, Tarefas & Rotinas, Medidas (6 ferramentas, 2 agentes) | idem |
| 1 · Lote 3 | Financeiro, Dieta (6 ferramentas, 2 agentes) | idem |
| 2 | Roteador com desempate + revisão de todos os textos datados | idem |
| — | **🚧 AUTORIZAÇÃO EXPLÍCITA DO DONO PARA A ESCRITA** | **Bloqueante** |
| 3–6 | Approval Engine · commands · tela de ações · docs | idem + smoke |
