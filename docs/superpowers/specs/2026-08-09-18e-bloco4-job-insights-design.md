# 18-E · Bloco 4 — o job automático de insights

**Data:** 2026-08-09
**Branch:** `feat/18-e-insights`
**Antecede:** `docs/superpowers/specs/2026-08-09-18e-insights-relatorios-dashboards-design.md` (§7 e §12)

---

## 1. O que este bloco muda de natureza

Até aqui, **todo** run de IA do projeto nasceu de um clique do dono, dentro de uma sessão
autenticada. O chat, a extração de comprovante e o insight sob demanda têm em comum uma coisa
que nunca precisou ser dita: `auth.uid()` existe.

O Bloco 4 quebra isso. O Cron da Vercel roda com **service role e sem sessão** — e é o primeiro
gasto de dinheiro do sistema que acontece **sem o dono estar olhando**. Duas consequências
mandam no desenho inteiro:

1. Quem é o dono deixa de vir da sessão e passa a ser **nosso**, explicitamente, em cada
   consulta. A RLS não erra sem `auth.uid()` — ela devolve vazio em silêncio, que é o pior
   modo de falha possível.
2. O orçamento precisa de um **segundo teto**, próprio do job. Ligar a varredura não pode
   passar a comer o orçamento das conversas do dono sem ele ter mexido nisso.

---

## 2. As quatro decisões desta sessão

| # | Decisão | Alternativa recusada, e por quê |
| --- | --- | --- |
| **2.1** | A admissão ganha `p_user_id`, honrado só quando `auth.uid()` é nulo | RPC gêmea `security definer` duplicaria ~150 linhas de admissão — dois juízes do mesmo orçamento, que é a divergência que a invariante 8 existe para impedir. E o JWT do dono assinado pelo servidor introduziria um primitivo de impersonação no repositório, mais um segredo legado que o Supabase está aposentando. |
| **2.2** | O job **pula** o módulo cuja chave de leitura está desligada | ANDar (como `allow_vision` faz com `allow_finance` + `allow_write_finance`) faria desligar Dieta calar Financeiro junto. Lá as três chaves servem ao **mesmo** efeito; aqui os três módulos são efeitos independentes. |
| **2.3** | Teto próprio em **dinheiro**, com marcador `automatic` em `ai_runs` | Teto por contagem de runs não limita custo — um prompt grande custa várias vezes um pequeno, e o critério 13 fala em orçamento esgotado. Sem teto próprio, a §7 (*"os dois valem"*) vira mentira. |
| **2.4** | Tabela `ai_insight_jobs`, uma linha por módulo por execução | Só o log da Vercel registra onde o dono não olha; notificação por job barrado viraria ruído diário e fica na fronteira do *"informa, nunca cobra"* das 16-F/17-F. |

**Cadência:** 1×/dia, no slot `0 12` UTC (09h BRT). O insight expira em dias, não em horas —
gerar de novo às 21h produziria o mesmo texto (a dedupe barra) ou um segundo gasto pelo mesmo
dia. O slot `0 0` fica só com as notificações.

---

## 3. A forma geral

```
Vercel Cron  0 12 * * *  (09h BRT)
  └→ GET /api/cron/insights          Bearer CRON_SECRET → 401 sem ele
       └→ service role (sem sessão)
            └→ decidirVarredura(prefs, hoje)          ← função PURA, testada
                 └→ por módulo: runInsight({ …, owner })
                      └→ ai_begin_insight_run(…, p_user_id)
                 └→ 1 linha em ai_insight_jobs por módulo, SEMPRE
```

`/api/cron/notifications` **não é tocada**. Rota separada porque um job de insight que falha não
pode derrubar as notificações — e a recíproca também vale.

---

## 4. O par viaja como UM objeto

### 4.1 O tipo

```ts
// src/lib/supabase/owner.ts
export type LeituraDoDono = {
  readonly client: SupabaseClient<Database>;
  readonly userId: string;
};
```

Último parâmetro, opcional. **Ausente** ⇒ caminho com sessão, idêntico ao de hoje. **Presente**
⇒ `.eq("user_id", owner.userId)` explícito em cada consulta, porque a service role ignora a RLS
e o escopo do usuário deixa de vir dela.

### 4.2 Por que um objeto, e não dois campos como em `getSessionHistory`

`getSessionHistory` (17-F) precisa do guard `if (range.client && !owner) return []` justamente
porque `client` e `userId` são campos separáveis: dá para mandar um sem o outro, e o resultado
seria uma leitura sem escopo sob service role — vazamento entre usuários num sistema que só não
tem dois usuários por acidente.

Com um objeto único, **"client sem userId" deixa de ser representável**. O guard vira
desnecessário porque o estado que ele protegia não existe. É a mesma escolha do campo
`confianca` que não existe no schema de saída do modelo (invariante 67): irrepresentável vence
recusado, porque uma recusa é um `if` que alguém remove e um tipo é uma mudança que ninguém faz
sem perceber.

`getSessionHistory` **não é reescrita** — ela funciona, tem testes e não está no caminho deste
bloco. A forma nova vale para as assinaturas novas.

### 4.3 Onde o tipo mora, e por que não em `ai/`

`src/lib/supabase/` — junto dos três clientes. Pôr o tipo em `src/lib/ai/` faria `finance/`,
`nutrition/` e `training/` passarem a importar do módulo de IA: a seta ao contrário, exatamente
o que mandou o vocabulário proibido para `src/lib/tone/` na 18-E Bloco 1.

### 4.4 As nove funções

| Arquivo | Função | Nota |
| --- | --- | --- |
| `src/lib/dashboard/queries.ts` | `getFinanceCardData` | chama as cinco abaixo |
| `src/lib/finance/queries.ts` | `getAccounts` | lê a **view** `accounts_with_balance` |
| | `getStatements` | lê a **view** `card_statements_with_total` |
| | `getReceivables` | |
| | `getBills` | |
| | `getTransactionsRange` | |
| `src/lib/nutrition/diary-queries.ts` | `getDiaryMeals` | |
| | **`getMealTypes`** | ⚠️ transitiva — `getDiaryMeals` a chama por dentro |
| `src/lib/training/queries.ts` | `getTrainingPreferences` | |

A nona não estava na lista do handoff: ela foi medida antes, e `getMealTypes()` escapou por ser
chamada de dentro de `getDiaryMeals`. Sem ela, o coletor de Dieta rodaria sob service role com a
lista de tipos de refeição vazia — e refeição sem tipo não entra no total do dia.

⚠️ **As duas views:** sob service role a RLS da view não filtra nada. A implementação confirma
que `accounts_with_balance` e `card_statements_with_total` expõem `user_id` para o `.eq` ter onde
pegar. Se não expuserem, é achado a reportar, não conserto silencioso.

Além das nove, repassam o dono sem lógica própria: os três coletores
(`insights/collectors/*.ts`) e `runInsight` (`server/insight-runner.ts`), mais o que ele chama em
`run-store.ts`, `credential-store.ts`, `queries.ts` (IA) e `insight-store.ts` — este último **já**
aceitava `client?` desde o Bloco 2.

---

## 5. A admissão

### 5.1 A mudança

`create or replace` **não** substitui a função ao acrescentar um parâmetro com default: cria uma
*sobrecarga*, e as duas passam a existir. Por isso a migration faz `drop function if exists` da
assinatura antiga (7 parâmetros) antes de criar a nova (8), e refaz `revoke`/`grant`.

```sql
v_user      := coalesce(auth.uid(), p_user_id);   -- a sessão SEMPRE vence
v_automatic := (auth.uid() is null);              -- ninguém de fora informa isto
if v_user is null then
  raise exception 'AI_NOT_AUTHENTICATED' using errcode = 'P0001';
end if;
```

### 5.2 A trava é a RLS, não o `coalesce`

A ordem do `coalesce` faz o caminho com sessão ser inalcançável de fora: um autenticado que
passe `p_user_id` de outra pessoa é simplesmente ignorado. Mas **a garantia não depende dessa
linha**. Como a função continua `security invoker`:

- ele não leria `ai_user_preferences` do outro (RLS) → `AI_MODULE_NOT_ALLOWED`;
- não leria `ai_provider_configs` nem `ai_provider_credentials` → `AI_PROVIDER_NOT_AVAILABLE`;
- não conseguiria o `insert` em `ai_runs` (`with check (user_id = auth.uid())`).

Invertendo o `coalesce`, a trava continua de pé. É a diferença entre uma trava que o banco
garante e um `if` que alguém remove — a mesma escolha do uso único num `unique` e do prazo num
`default` (invariante 36).

`anon` continua com `revoke all` sobre a função. `authenticated` mantém o `grant`.

### 5.3 Efeito colateral declarado

`ai_reconcile_abandoned_runs(20)`, chamada dentro da admissão, é `security invoker` — sob service
role ela varre **global** em vez de só o usuário. Mantido: é a mesma varredura que
`/api/cron/notifications` já faz com service role desde a 18-A
(`reconcileAllAbandonedRuns`), e num sistema single-user o conjunto é o mesmo.

---

## 6. O segundo teto

```sql
-- ai_user_preferences
allow_insight_jobs  boolean       not null default false
job_monthly_budget  numeric(10,4) not null default 1.0000

-- ai_runs
automatic boolean not null default false
```

`job_monthly_budget` é **NOT NULL de propósito**, ao contrário de `daily_budget` e
`monthly_budget` (que são nulos = sem teto). O job é o único gasto que acontece sem o dono
olhando; um segundo teto opcional seria um teto que a configuração padrão não tem.

No ramo `v_automatic`, **antes** do diário/mensal global:

```
Σ custo(runs automatic terminais, mês de Brasília)
  + Σ reserva(runs automatic não-terminais não vencidos)
  + p_reserved_cost
  > job_monthly_budget   →  AI_JOB_BUDGET_EXCEEDED
```

Mesma aritmética do orçamento global (invariante 9: todo run está em exatamente um dos
somatórios), restrita a `automatic`. **Os dois tetos valem, nesta ordem** — o job passa pelo
próprio e depois pelo global, e qualquer um dos dois barra. É o critério 13.

`automatic` é gravado pelo RPC a partir de `auth.uid() is null`, **nunca recebido por
parâmetro**: quem chama não tem como se declarar automático nem deixar de ser.

---

## 7. `ai_insight_jobs`

Quarta tabela da 18-E. Total no `public`: **129 → 130**; `ai_*`: **17 → 18**.

```sql
create table public.ai_insight_jobs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  executed_at timestamptz not null default now(),
  modulo      text not null check (modulo in ('financeiro','treinos','dieta')),
  desfecho    text not null check (desfecho in ('gerado','reaproveitado','pulado','falhou')),
  motivo      text,        -- SANITIZADO; só em 'pulado' e 'falhou'
  run_id      uuid,        -- nulo quando nem chegou a abrir run
  insight_id  uuid,
  created_at  timestamptz not null default now()
);
```

Uma linha **por módulo, por execução, sempre** — inclusive `pulado`. É o que torna o critério 13
verificável pelo dono, e não só pela retenção de log da Vercel.

**RLS + FORCE RLS.** Policy de `select` para o dono e **nenhuma** de insert, update ou delete: só
a service role escreve (ela tem `bypassrls`), e a tabela é append-only como
`ai_insight_feedback`. Índice em `(user_id, executed_at desc)`.

`run_id` e `insight_id` ficam **sem FK, de propósito** — invariante 38 aplicada aqui. O registro
de que a varredura rodou é auditoria e tem de sobreviver ao que acontecer com o insight. Sem FK,
não é preciso `unique (id, user_id)` nos alvos, e não há chave única ocupável por terceiro
(17-F, invariante 23).

**Para a tabela não ser um registro que ninguém lê,** `/ia/insights` ganha um rodapé de uma linha:

> Última varredura automática: hoje 09h04 — Financeiro reaproveitado · Treinos gerado · Dieta
> pulada: a leitura está desligada.

---

## 8. Onde cada regra mora

| Arquivo | Papel |
| --- | --- |
| `src/lib/ai/insights/job.ts` | **PURO.** `decidirVarredura(prefs, hoje)` → quais módulos tentar, e o motivo de cada pulo. Fica em `CAMADAS_PURAS`; zero `.from()`. |
| `src/lib/ai/server/insight-job.ts` | O I/O: monta o `LeituraDoDono`, chama `runInsight` por módulo, grava `ai_insight_jobs`. |
| `src/app/api/cron/insights/route.ts` | Transporte: `CRON_SECRET`, service role, resposta JSON. Sem regra de negócio. |

A decisão 2.2 vive em `job.ts`: `allow_insight_jobs` desligada ⇒ **lista vazia**;
`allow_<modulo>` desligada ⇒ **só aquele módulo sai**, os outros seguem.

**Não repete escrita:** cada módulo é tentado **uma vez** por execução, sem laço de retry; um
módulo que falha não interrompe os outros. Erro sempre por `sanitizedForStorage`
(`security/redact.ts`), que continua sendo o único caminho de saída de erro do módulo.

**A dedupe continua antes da chamada:** o job entra por `runInsight`, que já resolve a chave e
consulta `buscarInsightPorChave` **antes** da admissão (Bloco 2). Chave repetida ⇒ desfecho
`reaproveitado`, sem run e sem custo.

---

## 9. Testes

- **`job.ts`**: tabela de decisão — as chaves × os três módulos, com `hoje` injetado.
- **Fronteiras** (`boundaries.test.ts`): pares novos declarados —
  `supabase/owner` alcançável por finance/nutrition/training/dashboard;
  `server/insight-job` alcançável só pela rota do Cron; `insights/job` em `CAMADAS_PURAS`.
- **Migration**: varredura de `p_user_id`, do `coalesce`, de `automatic`, do teto próprio e das
  policies da tabela nova.
- **Round-trip Zod** do campo novo de preferência.
- Os testes atuais de finance/nutrition/training/dashboard são **a rede do caminho com sessão**:
  qualquer vermelho neles significa que a assinatura nova mexeu no que não devia.

⚠️ **Antes de acreditar em qualquer verde, a regra é mutada e a mutação confirmada por md5** — o
working tree é CRLF e substituição multi-linha falha em silêncio.

---

## 10. O que fica de fora, declarado

- **Nenhuma notificação sobre o job.** "A dedupe reaproveitou o de ontem" é ruído diário, e um
  aviso de "não rodou" fica na fronteira do *informa, nunca cobra* das 16-F/17-F.
- **Nenhuma ferramenta, nenhum command.** O job não é algo que o modelo possa pedir.
- **O job não escreve nos módulos do dono.** Ele gera insight; transformar insight em tarefa
  continua sendo clique do dono, pelo Approval Engine.
- **Sem retry entre execuções.** Um módulo que falhou hoje é tentado de novo amanhã, não daqui a
  cinco minutos.
- **`getSessionHistory` não é reescrita** para a forma nova (§4.2).
- **Segundo slot do Cron (21h BRT) não recebe insights** (§2).

---

## 11. Critérios de aceite

1. `allow_insight_jobs` nasce `false`; com ela desligada, `decidirVarredura` devolve lista vazia
   e nenhum run é aberto.
2. Módulo com `allow_<modulo>` desligada é **pulado com motivo**; os outros dois rodam.
3. Job com orçamento **próprio** esgotado não roda, e a linha de `ai_insight_jobs` registra o
   motivo sanitizado.
4. Job com orçamento **mensal global** esgotado não roda, idem.
5. Um autenticado que chame `ai_begin_insight_run` com `p_user_id` de outro é barrado pela RLS,
   não por um `if`.
6. `automatic` é `true` só no caminho sem sessão, e não vem por parâmetro.
7. Chave de dedupe repetida ⇒ desfecho `reaproveitado`, **sem chamada externa**.
8. `/api/cron/insights` responde **401** sem o secret e com secret errado.
9. Um módulo que falha não impede os outros dois.
10. Nenhuma consulta do caminho **com sessão** muda de comportamento.
11. Transversais: `lint` · `tsc --noEmit` · `test:run` · `build` · suíte verde em `TZ=UTC` ·
    rota privada → 307 `/login` · `get_advisors` sem lint novo sobre `ai_insight_jobs` ·
    `src/types/supabase.ts` regenerado.

---

## 12. O que NÃO é afrouxado

A escrita continua não acontecendo dentro do run · `approval/` continua tocando só `ai_*` ·
`tools/` continua alcançando só `commands/previews` · `.executar(` continua aparecendo em **um**
arquivo · `vision/` e `insights/` continuam em `CAMADAS_PURAS` · **nenhum `.from()` em
`insights/`** · `user_id` sempre de `authContext()` no caminho com sessão · Zod `.strict()` nos
dois lados · pt-BR em tudo.
