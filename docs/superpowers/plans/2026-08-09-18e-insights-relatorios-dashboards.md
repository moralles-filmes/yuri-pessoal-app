# Plano de implementação — Fase 18-E: IA · Insights, relatórios e dashboards

> Executado nesta sessão, task a task, com `test:run` + `lint` + `tsc --noEmit` a cada bloco.
> Desenho validado em `docs/superpowers/specs/2026-08-09-18e-insights-relatorios-dashboards-design.md`.

**Objetivo:** a IA passa a produzir insights sobre números que o SISTEMA calcula (média, comparação,
variação), num texto que não contém dígito — todo número entra por token resolvido no servidor.

**Arquitetura:** geração e leitura são metades separadas em arquivos que não se alcançam. A geração
mora em `src/lib/actions/ai-insights.ts` + `src/lib/ai/server/insight-runner.ts`; a leitura, em
`src/lib/ai/insights/render.ts` + as queries. O dashboard só alcança a segunda — provado por teste
de import, não por promessa.

**Stack:** Next.js 16 · Supabase (RLS + FORCE RLS) · Zod `.strict()` · Vitest (`node`) · pt-BR/BRL.

## Restrições globais

- `user_id` SEMPRE de `authContext()`; nunca do modelo, nunca do cliente.
- Zod `.strict()` nos dois lados (entrada da action e saída do modelo).
- Ausência nunca é zero: `null` + motivo obrigatório. Nunca `NaN`, nunca `Infinity`.
- Toda regra crítica é função pura com `hoje`/`agora` injetados. Sem `Date.now()`.
- Migration idempotente: `user_id` NOT NULL + RLS + FORCE RLS + índice em `user_id` + trigger
  `updated_at` + **FK composta** em toda referência dentro do mesmo usuário (com o `unique
  (id, user_id)` correspondente no alvo, senão `42830`).
- Toda trava de segurança é ALLOWLIST, nunca lista de proibidos.
- **Antes de acreditar num verde: MUTAR a regra e conferir por md5 que a mutação entrou no arquivo.**
  O working tree é CRLF e substituição multi-linha falha em silêncio.
- Verificação de "pronto": `npm run lint` · `npx tsc --noEmit` · `npm run test:run` · `npm run build`
  · `TZ=UTC npx vitest run`.

---

## Bloco 1 — a fundação, sem uma chamada de IA

### Task 1.1 — `src/lib/tone/vocabulary.ts`

**Arquivos:**
- Criar: `src/lib/tone/vocabulary.ts`, `src/lib/tone/vocabulary.test.ts`
- Modificar: `src/lib/notifications/nutrition.test.ts` (lista local → import),
  `src/lib/notifications/training.test.ts` (idem, as duas listas)
- Modificar: `src/lib/ai/boundaries.test.ts` (`tone` na lista `modulos`)

**Produz:**
```ts
export const VOCABULARIO_DE_COBRANCA: readonly string[]
export const VOCABULARIO_DE_PRESCRICAO: readonly string[]
export function termosProibidosEm(texto: string): string[]   // já normaliza para pt-BR minúsculo
```

União das duas listas de hoje (`nutrition.test.ts:465` + `training.test.ts:365`) mais
`PRESCRICAO` (`training.test.ts:417`). Módulo NEUTRO, puro, sem I/O — para
`src/lib/notifications/` não passar a depender de `src/lib/ai/`.

**Passos:** escrever o módulo + teste → apontar os dois testes existentes para ele → rodar os três
→ mutar (remover um termo) e confirmar vermelho → commit.

### Task 1.2 — `insights/contracts.ts`

**Arquivos:** criar `src/lib/ai/insights/contracts.ts` + `.test.ts`.

**Produz:** `Indicador`, `SerieTemporal`, `Comparacao`, `Evidencia`, `InsightGerado`,
`indicadorCoerente(i): boolean` — no molde de `isToolDescriptorCoherent`.

`indicadorCoerente` recusa: `valor: null` sem `indisponivel_porque`; `qualidade: "parcial"` sem
`motivo_incompleto`; `n` negativo; `periodo.de > periodo.ate`; `rota` que não passe por
`rotaInternaAceita`.

### Task 1.3 — `insights/temporal.ts` (o módulo da decisão 1)

**Arquivos:** criar `src/lib/ai/insights/temporal.ts` + `.test.ts`.

**Consome:** `Indicador` da Task 1.2.
**Produz:**
```ts
export function media(serie: SerieTemporal, janela: number): Agregado
export function comparar(atual: Indicador|null, anterior: Indicador|null): Comparacao
export function variacao(de: number|null, para: number|null): Agregado
```

As quatro recusas da §4.2 do design, cada uma com `null` + motivo:
janela incompleta · sem período anterior · base zero · ponto `parcial` propaga `parcial`.
Período sem registro reduz o `n`; o `n` viaja com o número.

Puro, `hoje` injetado, aritmética em `Date.UTC`. Testes com o valor escrito à mão e a conta no
comentário — nunca espelhando a implementação.

### Task 1.4 — `seguranca-v3`

**Arquivos:** modificar `src/lib/ai/agents/security-prompt.ts`; ajustar o teste que amarra a versão.

Reescreve o 8-D: a proibição deixa de ser *"esse número não existe"* e passa a ser
**"esse número não é seu para calcular"**. `SECURITY_PROMPT_VERSION = "seguranca-v3"`.
⛔ NÃO promete comparação ao chat — `temporal.ts` alimenta o Engine, não os adapters.

### Task 1.5 — as fronteiras novas

**Arquivos:** modificar `src/lib/ai/boundaries.test.ts`.

- `"insights"` em `CAMADAS_PURAS`.
- `insights/collectors/` em `naPorta` (terceira porta declarada).
- Par declarado: `[insights/validate.ts, "@/lib/tone/vocabulary"]`.
- Teste novo: **nenhum `.from()` nem `select()` em `insights/`**.
- Teste novo: nenhum arquivo de `src/lib/dashboard/` ou `src/components/dashboard/` alcança
  `server/insight-runner` nem `actions/ai-insights`.
- Teste novo: a lista de vocabulário é declarada UMA vez (molde do teste de `normalizarTexto`).

---

## Bloco 2 — tabelas, coletores e o Engine

### Task 2.1 — migration

Três tabelas (`ai_insights`, `ai_insight_sources`, `ai_insight_feedback`), `ai_runs.kind`
ganhando `'insight'` com o CHECK exigindo a forma inteira, RPC `ai_begin_insight_run`
(`SECURITY INVOKER`, `search_path = ''`, mesmo advisory lock do chat).
`unique (id, user_id)` em `ai_insights` **na mesma migration**.
Depois: `get_advisors` (critério: nenhum lint NOVO sobre estas tabelas) + regenerar
`src/types/supabase.ts`.

### Task 2.2 — `insights/dedupe.ts` · `expiry.ts` · `confidence.ts` · `state.ts`

Puros, testados. `dedupe` reusa a disciplina de `approval/canonical.ts` (prefixo de versão,
chaves ordenadas, NFC, `-0`→`0`, `NaN`/`Date`/`BigInt` recusados). `confidence.ts` declara
`rebaixar` e **não declara `promover`**. `state.ts` deriva `vigente|expirado|dispensado|adiado`
com precedência **decisão do dono > prazo**.

### Task 2.3 — `insights/collectors/` (finance · training · nutrition)

Terceira porta. Cada coletor: chama o serviço do módulo com as MESMAS opções da tela, declara o
próprio teto e pede **TETO + 1**, devolve `Indicador[]`.

### Task 2.4 — `prompt.ts` · `schema.ts` · `validate.ts` · `render.ts`

Schema de saída **sem campo `confianca`** (irrepresentável). `validate.ts` na ordem fixa da §5.5.
`render.ts` resolve `{{ind:x}}`; indicador `null` renderiza "não medido" com o motivo.

### Task 2.5 — `server/insight-runner.ts` + `actions/ai-insights.ts`

Dedupe ANTES da chamada. `generateObject`, sem laço. Falha na validação ⇒ insight NÃO gravado,
run fecha `failed` com código declarado.

---

## Bloco 3 — a tela, o card e a ponte com a 18-C

### Task 3.1 — `/ia/insights`

7º item de `AI_SECTIONS`, entre Comprovantes e Consumo. Gera e lista.

### Task 3.2 — card do dashboard

`"insights"` no FIM de `DASH_CARD_IDS`. Só lê. Sem botão de gerar.

### Task 3.3 — feedback / dispensar / adiar

Grava em `ai_insight_feedback`; o estado é derivado por `state.ts`.

### Task 3.4 — `origem = 'insight'`

Quarta forma declarada, com o CHECK exigindo a forma por inteiro e FK composta
`(insight_id, user_id)`. `criarPropostaDeInsight`, restrito a `todo.criar_tarefa`, exigindo
`allow_todo` E `allow_write_todo`.

---

## Bloco 4 — o job automático

### Task 4.1 — `allow_insight_jobs` + orçamento de jobs

Nasce `false`. O orçamento de jobs é um SEGUNDO teto e os dois valem.

### Task 4.2 — `/api/cron/insights` + `vercel.json`

Rota própria, `CRON_SECRET` (Bearer) na própria rota, separada de `/api/cron/notifications`.

### Task 4.3 — coletores aceitando `client`/`userId`

Como `getSessionHistory` na 17-F. Sem mudar o comportamento do caminho com sessão.

---

## Entrega

Ao fim: `docs/project/CURRENT_STATUS.md`, `docs/handoff/LAST_PHASE_SUMMARY.md`,
`docs/handoff/NEXT_AGENT_INSTRUCTIONS.md` e o `CLAUDE.md` atualizados, com os números
RECONFERIDOS no banco e na suíte — nunca copiados da redação anterior.
