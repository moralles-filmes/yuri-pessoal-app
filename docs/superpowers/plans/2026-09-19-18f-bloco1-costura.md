# Fase 18-F · Bloco 1 — Costura: sino, busca, export e exclusão

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tirar o módulo de IA da condição de ilha — ele passa a avisar pelo sino, a aparecer na busca global, a entrar no backup e a poder ser apagado em massa.

**Architecture:** Nenhum mecanismo novo. Quatro famílias de notificação no par puro/I-O que Dieta e Treinos já usam (`ai.ts` + `ai-cron.ts`, decidindo em `filterByPrefs`); deep-links num módulo puro no padrão de `training-links.ts`; a seção de IA somada a `export-tables.ts`; e a exclusão em massa declarando o que permanece por causa da invariante 38.

**Tech Stack:** Next.js 16 (Turbopack), TypeScript, Supabase (Postgres + RLS), Vitest (ambiente `node`), Tailwind v4, shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-09-19-18f-memoria-integracoes-design.md` — leia §3 (o que fica fora), §4 (este bloco) e §9 (fronteiras) antes de começar.

## Global Constraints

- **Idioma:** todo texto de interface, mensagem de erro e comentário em **pt-BR**. Moeda BRL, datas no formato brasileiro.
- **Branch:** `feat/18-f-memoria-integracoes` (já existe, com a spec commitada).
- **Nenhuma migration neste bloco.** Ele não cria tabela nem coluna.
- **`filterByPrefs` é o ÚNICO ponto onde a preferência de notificação decide.** Nenhum tipo novo consulta preferência por conta própria.
- **Toda notificação deste bloco é `low` ou `medium`.** Nenhuma `high`/`urgent`.
- **Lógica pura com `agora`/`hoje` INJETADOS.** Nunca `Date.now()` nem `new Date()` dentro de função pura. Nunca `toISOString().slice(0,10)`.
- **Datas puras (`'yyyy-MM-dd'`) são texto.** Aritmética em `Date.UTC`.
- **O Cron roda com service role e IGNORA a RLS:** toda consulta carrega `user_id` explicitamente.
- **Verificação obrigatória antes de declarar qualquer task pronta:** `npm run lint && npx tsc --noEmit && npm run test:run`. Ao fim do bloco, também `npm run build && npm run perf:bundle`.
- **`vitest` NÃO checa tipo.** Rodar `npx tsc --noEmit` sempre, mesmo com a suíte verde.
- **O working tree é CRLF** (`core.autocrlf=true`). Ao editar por script, confira que a mudança entrou no arquivo antes de acreditar num verde.

---

## File Structure

| Arquivo | Responsabilidade |
| --- | --- |
| `src/lib/search/ai-links.ts` **(criar)** | Fonte única dos deep-links do módulo de IA. Puro. Consumido pela busca **e** pelas notificações |
| `src/lib/search/ai-links.test.ts` **(criar)** | Confere que cada rota tem página no disco |
| `src/lib/notifications/ai.ts` **(criar)** | As 4 famílias. **Puro**, sem I/O. Decide "isto é verdade sobre os dados" |
| `src/lib/notifications/ai.test.ts` **(criar)** | Disparo de cada família, dedupe, e o teste de vocabulário proibido |
| `src/lib/notifications/ai-cron.ts` **(criar)** | I/O: monta `AiGenInput` sob service role. Nenhuma decisão |
| `src/lib/notifications/constants.ts` **(modificar)** | +4 tipos, +4 rótulos, +1 opt-in |
| `src/lib/notifications/generate.ts` **(modificar)** | `GenerateInput.ai` + despacho |
| `src/lib/notifications/cron.ts` **(modificar)** | Chama `buildAiGenInput`, isolado em `.catch(() => null)` |
| `src/lib/ai/queries.ts` **(modificar)** | `getUsageSummary` aceita `LeituraDoDono` — o Cron usa a MESMA leitura da tela |
| `src/lib/search/types.ts` **(modificar)** | +3 `SEARCH_TYPES` + rótulos |
| `src/lib/search/queries.ts` **(modificar)** | Busca em conversas, insights e ações |
| `src/lib/settings/export-tables.ts` **(modificar)** | Seção de IA; `ai_provider_credentials` em `EXPORT_EXCLUDED` |
| `src/lib/ai/retention.ts` **(criar)** | **Puro:** o que uma exclusão apaga e o que PERMANECE |
| `src/lib/ai/retention.test.ts` **(criar)** | |
| `src/lib/actions/ai-retention.ts` **(criar)** | Server Actions da exclusão em massa |
| `src/components/ai/retention-card.tsx` **(criar)** | Tela, dentro de `/ia/configuracoes` |

---

## Task 1: Deep-links do módulo de IA

Vem primeiro porque as notificações (Task 2) e a busca (Task 5) **consomem** estes links. Escrever o link inline nos dois lugares é como a despensa virou um 404 na 16-F.

**Files:**
- Create: `src/lib/search/ai-links.ts`
- Test: `src/lib/search/ai-links.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `AI_LINK_BASE`, `conversationLink(id: string): string`, `conversationsLink(): string`, `insightsLink(): string`, `actionsLink(): string`, `stuckActionsLink(): string`, `usageLink(): string`, `settingsLink(): string`, `receiptsLink(): string`.

- [ ] **Step 1: Escreva o teste que falha**

Crie `src/lib/search/ai-links.test.ts`:

```ts
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  actionsLink,
  conversationLink,
  conversationsLink,
  insightsLink,
  receiptsLink,
  settingsLink,
  stuckActionsLink,
  usageLink,
} from "./ai-links";

/** Converte a rota em caminho de página no disco, ignorando a query string. */
function paginaDe(rota: string): string {
  const semQuery = rota.split("?")[0];
  const partes = semQuery.split("/").filter(Boolean).slice(1); // tira "ia"
  return join(process.cwd(), "src", "app", "(app)", "ia", ...partes, "page.tsx");
}

describe("ai-links", () => {
  it("monta o link da conversa com o id", () => {
    expect(conversationLink("abc-123")).toBe("/ia/conversas/abc-123");
  });

  it("aponta o filtro de problemas que a tela de ações realmente aceita", () => {
    // `FILTROS_DO_HISTORICO` = todas | aplicadas | aguardando | problemas.
    expect(stuckActionsLink()).toBe("/ia/acoes?filtro=problemas");
  });

  // ⚠️ Este é o teste que importa: o requisito não é "a busca encontra",
  // é "o link ABRE a tela". Só o disco prova isso.
  it.each([
    ["conversas", conversationsLink()],
    ["insights", insightsLink()],
    ["ações", actionsLink()],
    ["ações · problemas", stuckActionsLink()],
    ["consumo", usageLink()],
    ["configurações", settingsLink()],
    ["comprovantes", receiptsLink()],
  ])("a rota de %s tem página no disco", (_nome, rota) => {
    expect(existsSync(paginaDe(rota))).toBe(true);
  });

  it("a rota dinâmica da conversa tem página no disco", () => {
    const pagina = join(
      process.cwd(),
      "src", "app", "(app)", "ia", "conversas", "[id]", "page.tsx",
    );
    expect(existsSync(pagina)).toBe(true);
  });
});
```

- [ ] **Step 2: Rode e confirme que falha**

Run: `npx vitest run src/lib/search/ai-links.test.ts`
Expected: FAIL — `Failed to resolve import "./ai-links"`.

- [ ] **Step 3: Implemente**

Crie `src/lib/search/ai-links.ts`:

```ts
/**
 * Fase 18-F · Bloco 1 — deep-links do módulo de IA (PURO).
 *
 * Fonte ÚNICA das rotas de `/ia`, consumida pela busca global E pelas notificações. Mora
 * separado de `queries.ts` (server-only) pelo mesmo motivo de `training-links.ts` e
 * `nutrition-links.ts`: o requisito não é "a busca encontra", é "o link ABRE a tela" — e com
 * os links num módulo puro isso vira teste de contrato em vez de fé.
 *
 * ⚠️ Armadilha registrada, no espírito do `?aba=despensa` da Dieta: a tela de ações filtra por
 * `?filtro=`, e o valor de "precisam de atenção" é **`problemas`** (`FILTROS_DO_HISTORICO` em
 * `lib/ai/approval/history.ts`). Um valor fora dessa lista não dá 404 — é pior: a página
 * ignora em silêncio e mostra TODAS as ações, e o aviso do sino leva a lugar nenhum.
 *
 * ⚠️ NÃO existe rota de memória ainda. `/ia/memoria` nasce no Bloco 3, e o link dela entra
 * JUNTO com a rota — nunca antes.
 */

export const AI_LINK_BASE = "/ia";

/** Uma conversa específica (rota dinâmica). */
export const conversationLink = (id: string) => `${AI_LINK_BASE}/conversas/${id}`;

/** Lista de conversas. */
export const conversationsLink = () => `${AI_LINK_BASE}/conversas`;

/** Análises geradas pelo Insight Engine (18-E). */
export const insightsLink = () => `${AI_LINK_BASE}/insights`;

/** O que a IA preparou, o que foi decidido e o que foi aplicado (18-C · Bloco 5). */
export const actionsLink = () => `${AI_LINK_BASE}/acoes`;

/**
 * As ações que precisam de atenção — inclui `executando` sem desfecho, que NÃO é sucesso nem
 * falha (invariante 52). É para cá que o aviso `ai_action_stuck` aponta.
 */
export const stuckActionsLink = () => `${AI_LINK_BASE}/acoes?filtro=problemas`;

/** Custo por período, modelo e tentativa (18-A). */
export const usageLink = () => `${AI_LINK_BASE}/consumo`;

/** Chaves, provedores, orçamento e as permissões por módulo. */
export const settingsLink = () => `${AI_LINK_BASE}/configuracoes`;

/** Envio e revisão de comprovante (18-D). */
export const receiptsLink = () => `${AI_LINK_BASE}/comprovantes`;
```

- [ ] **Step 4: Rode e confirme que passa**

Run: `npx vitest run src/lib/search/ai-links.test.ts`
Expected: PASS — 10 testes.

- [ ] **Step 5: Commit**

```bash
git add src/lib/search/ai-links.ts src/lib/search/ai-links.test.ts
git commit -m "feat(18-f): deep-links do modulo de IA, conferidos no disco"
```

---

## Task 2: As quatro famílias de notificação (puro)

**Files:**
- Create: `src/lib/notifications/ai.ts`
- Test: `src/lib/notifications/ai.test.ts`
- Modify: `src/lib/notifications/constants.ts`

**Interfaces:**
- Consumes: `NotificationPriority`/`NotificationType` de `./constants`; os links da Task 1; `NivelDeAlerta` de `@/lib/ai/usage/budget`.
- Produces: `AiGenInput`, `GenAiBudget`, `GenAiProviderProblem`, `GenAiStuckAction`, `GenAiInsight`, `segundaDaSemana(iso: string): string`, `generateAiNotifications(input: AiGenInput): Candidate[]`.

- [ ] **Step 1: Acrescente os quatro tipos**

Em `src/lib/notifications/constants.ts`, ao **fim** do array `NOTIFICATION_TYPES` (depois do bloco `// Fase 17-F`), acrescente:

```ts
  // Fase 18-F — módulo Inteligência Artificial.
  "ai_budget_threshold",
  "ai_provider_problem",
  "ai_action_stuck",
  "ai_insight_available",
```

Em `NOTIFICATION_TYPE_LABELS`, acrescente as quatro entradas (o `Record` sobre a união deixa o `tsc` vermelho até isso existir — é a trava, não um obstáculo):

```ts
  ai_budget_threshold: "IA · Orçamento",
  ai_provider_problem: "IA · Provedor",
  ai_action_stuck: "IA · Ação sem desfecho",
  ai_insight_available: "IA · Análise disponível",
```

Em `NOTIFICATION_OPT_IN_TYPES`, acrescente **apenas** a análise:

```ts
  // Fase 18-F — as outras três famílias de IA nascem LIGADAS (dinheiro do dono, a IA tendo
  // parado sem ele saber, e um "pode não ter acontecido"). Esta é a única recorrente sobre
  // algo que ninguém pediu: mesmo caso de `nutrition_goal_close`.
  "ai_insight_available",
```

- [ ] **Step 2: Escreva o teste que falha**

Crie `src/lib/notifications/ai.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { VOCABULARIO_DE_COBRANCA, VOCABULARIO_DE_PRESCRICAO, termosProibidosEm } from "@/lib/tone/vocabulary";
import { isOptInNotification } from "./constants";
import { generateAiNotifications, segundaDaSemana, type AiGenInput } from "./ai";

const VAZIO: AiGenInput = {
  hoje: "2026-09-19",
  budgets: [],
  providerProblems: [],
  stuckActions: [],
  insights: [],
};

describe("segundaDaSemana", () => {
  it("devolve a segunda da semana de uma sexta", () => {
    expect(segundaDaSemana("2026-09-19")).toBe("2026-09-14");
  });

  it("devolve a própria data quando já é segunda", () => {
    expect(segundaDaSemana("2026-09-14")).toBe("2026-09-14");
  });

  it("atravessa a virada de mês", () => {
    expect(segundaDaSemana("2026-10-01")).toBe("2026-09-28");
  });

  it("trata domingo como fim da semana que começou na segunda anterior", () => {
    expect(segundaDaSemana("2026-09-20")).toBe("2026-09-14");
  });
});

describe("orçamento", () => {
  const base: AiGenInput = {
    ...VAZIO,
    budgets: [
      { escopo: "mensal", competencia: "2026-09", totalUsd: 9.1, limiteUsd: 10, nivelJaAvisado: 0 },
    ],
  };

  it("avisa quando o nível sobe", () => {
    const [c] = generateAiNotifications(base);
    expect(c.type).toBe("ai_budget_threshold");
    expect(c.title).toContain("90%");
    expect(c.link).toBe("/ia/consumo");
  });

  it("NÃO avisa de novo o nível já avisado", () => {
    const input = {
      ...base,
      budgets: [{ ...base.budgets[0], nivelJaAvisado: 90 }],
    };
    expect(generateAiNotifications(input)).toHaveLength(0);
  });

  it("não avisa sem limite configurado", () => {
    const input = {
      ...base,
      budgets: [{ ...base.budgets[0], limiteUsd: null }],
    };
    expect(generateAiNotifications(input)).toHaveLength(0);
  });

  it("só o 100% é medium; os demais são low", () => {
    const cem = generateAiNotifications({
      ...base,
      budgets: [{ ...base.budgets[0], totalUsd: 10 }],
    });
    expect(cem[0].priority).toBe("medium");
    expect(generateAiNotifications(base)[0].priority).toBe("low");
  });

  it("a chave inclui o nível, para 70 e 90 não colidirem", () => {
    const noventa = generateAiNotifications(base)[0].dedupe_key;
    const cem = generateAiNotifications({
      ...base,
      budgets: [{ ...base.budgets[0], totalUsd: 10 }],
    })[0].dedupe_key;
    expect(noventa).not.toBe(cem);
  });
});

describe("ação sem desfecho", () => {
  const input: AiGenInput = {
    ...VAZIO,
    stuckActions: [
      { executionId: "exec-1", command: "lancarTransacao", iniciadaEm: "2026-09-18T14:00:00.000Z" },
    ],
  };

  it("aponta para o filtro de problemas", () => {
    const [c] = generateAiNotifications(input);
    expect(c.type).toBe("ai_action_stuck");
    expect(c.link).toBe("/ia/acoes?filtro=problemas");
    expect(c.entity_id).toBe("exec-1");
  });

  // Invariante 52: `executando` erra para "pode não ter acontecido", NUNCA para "aconteceu".
  it("não afirma que a ação aconteceu nem que falhou", () => {
    const [c] = generateAiNotifications(input);
    const texto = `${c.title} ${c.description ?? ""}`.toLocaleLowerCase("pt-BR");
    expect(texto).not.toContain("falhou");
    expect(texto).not.toContain("foi aplicada");
    expect(texto).not.toContain("concluída");
  });
});

describe("provedor", () => {
  it("gera um aviso por provedor com problema", () => {
    const [c] = generateAiNotifications({
      ...VAZIO,
      providerProblems: [{ provider: "anthropic", motivo: "credencial", desde: "2026-09-19" }],
    });
    expect(c.type).toBe("ai_provider_problem");
    expect(c.link).toBe("/ia/configuracoes");
  });
});

describe("insight disponível", () => {
  const input: AiGenInput = {
    ...VAZIO,
    insights: [
      { insightId: "i-1", titulo: "Gasto com mercado", geradoEm: "2026-09-19" },
      { insightId: "i-2", titulo: "Volume de treino", geradoEm: "2026-09-19" },
    ],
  };

  // A chave é SEMANAL de propósito: um aviso por dia sobre análise vira cobrança.
  it("gera UM aviso por semana, mesmo com vários insights", () => {
    const saida = generateAiNotifications(input);
    expect(saida).toHaveLength(1);
    expect(saida[0].dedupe_key).toBe("ai-insight-semana:2026-09-14");
  });

  it("nasce desligada", () => {
    expect(isOptInNotification("ai_insight_available")).toBe(true);
  });

  it("as outras três nascem ligadas", () => {
    expect(isOptInNotification("ai_budget_threshold")).toBe(false);
    expect(isOptInNotification("ai_provider_problem")).toBe(false);
    expect(isOptInNotification("ai_action_stuck")).toBe(false);
  });
});

describe("tom e forma", () => {
  const cheio: AiGenInput = {
    hoje: "2026-09-19",
    budgets: [
      { escopo: "mensal", competencia: "2026-09", totalUsd: 9.1, limiteUsd: 10, nivelJaAvisado: 0 },
      { escopo: "diario", competencia: "2026-09-19", totalUsd: 0.8, limiteUsd: 1, nivelJaAvisado: 0 },
    ],
    providerProblems: [{ provider: "openai", motivo: "indisponivel", desde: "2026-09-19" }],
    stuckActions: [
      { executionId: "exec-1", command: "criarTarefaTodo", iniciadaEm: "2026-09-18T14:00:00.000Z" },
    ],
    insights: [{ insightId: "i-1", titulo: "Proteína na semana", geradoEm: "2026-09-19" }],
  };

  it("nenhuma é high nem urgent", () => {
    for (const c of generateAiNotifications(cheio)) {
      expect(["low", "medium"]).toContain(c.priority);
    }
  });

  it("toda notificação tem link", () => {
    for (const c of generateAiNotifications(cheio)) {
      expect(c.link).toBeTruthy();
    }
  });

  it("as chaves de dedupe são únicas no lote", () => {
    const chaves = generateAiNotifications(cheio).map((c) => c.dedupe_key);
    expect(new Set(chaves).size).toBe(chaves.length);
  });

  it("rodar três vezes produz exatamente as mesmas chaves", () => {
    const uma = generateAiNotifications(cheio).map((c) => c.dedupe_key).sort();
    const duas = generateAiNotifications(cheio).map((c) => c.dedupe_key).sort();
    const tres = generateAiNotifications(cheio).map((c) => c.dedupe_key).sort();
    expect(duas).toEqual(uma);
    expect(tres).toEqual(uma);
  });

  it("sem linguagem de cobrança nem de prescrição", () => {
    for (const c of generateAiNotifications(cheio)) {
      const texto = `${c.title} ${c.description ?? ""}`;
      expect(termosProibidosEm(texto, VOCABULARIO_DE_COBRANCA)).toEqual([]);
      expect(termosProibidosEm(texto, VOCABULARIO_DE_PRESCRICAO)).toEqual([]);
    }
  });

  it("entrada vazia não gera nada", () => {
    expect(generateAiNotifications(VAZIO)).toEqual([]);
  });
});
```

- [ ] **Step 3: Rode e confirme que falha**

Run: `npx vitest run src/lib/notifications/ai.test.ts`
Expected: FAIL — `Failed to resolve import "./ai"`.

- [ ] **Step 4: Implemente**

Crie `src/lib/notifications/ai.ts`:

```ts
/**
 * Fase 18-F · Bloco 1 — as notificações do módulo de IA. PURO, sem I/O.
 *
 * Mesma divisão de Dieta (16-F) e Treinos (17-F): aqui se decide "isto é verdade sobre os
 * dados"; o I/O mora em `./ai-cron.ts` e a decisão de ENTREGAR é de `filterByPrefs`, num
 * lugar só (invariante 24).
 *
 * ═══════════════════════ POR QUE ESTAS QUATRO, E NÃO AS DEZ DO DOC ═══════════════════════
 *
 * O doc da fase listava dez tipos. Quatro caíram com as automações (que ficaram fora do
 * recorte) e dois avisariam sobre algo que acontece na frente do dono, com ele olhando a tela
 * ("análise de imagem concluída", "relatório concluído").
 *
 * ⛔ E "ação aguardando confirmação" é IMPOSSÍVEL de notificar de forma útil: a proposta
 * expira em 10 minutos e o Cron roda 2×/dia. O aviso chegaria para uma proposta morta. O que
 * sobrevive e merece atenção é o OPOSTO — a execução que ficou em `executando` sem desfecho,
 * que não expira e bloqueia nova tentativa (invariante 52).
 */

import { formatDate } from "@/lib/format";
import { NIVEIS_DE_ALERTA, type NivelDeAlerta } from "@/lib/ai/usage/budget";
import {
  insightsLink,
  settingsLink,
  stuckActionsLink,
  usageLink,
} from "@/lib/search/ai-links";
import type { NotificationPriority, NotificationType } from "./constants";

/** Mesmo shape de `NotificationCandidate` em generate.ts (evita import circular). */
type Candidate = {
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  description: string | null;
  link: string | null;
  entity_type: string | null;
  entity_id: string | null;
  dedupe_key: string;
};

const DIA_MS = 86_400_000;

/**
 * A segunda-feira da semana de uma data pura. Aritmética em `Date.UTC` porque data pura não
 * tem fuso — convertê-la para `Date` local faria a semana virar no fuso errado.
 */
export function segundaDaSemana(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const ms = Date.UTC(y, m - 1, d);
  // getUTCDay(): 0 = domingo. Domingo pertence à semana que começou 6 dias antes.
  const diaDaSemana = new Date(ms).getUTCDay();
  const recuo = diaDaSemana === 0 ? 6 : diaDaSemana - 1;
  return new Date(ms - recuo * DIA_MS).toISOString().slice(0, 10);
}

export type GenAiBudget = {
  readonly escopo: "diario" | "mensal";
  /** 'yyyy-MM-dd' no diário, 'yyyy-MM' no mensal. Entra na chave de dedupe. */
  readonly competencia: string;
  readonly totalUsd: number;
  /** `null` = sem teto configurado. Sem teto não há percentual, então não há aviso. */
  readonly limiteUsd: number | null;
  /** `ai_user_preferences.budget_alert_level_reached` — o nível já avisado. */
  readonly nivelJaAvisado: number;
};

export type GenAiProviderProblem = {
  readonly provider: string;
  readonly motivo: "credencial" | "indisponivel" | "job_barrado";
  readonly desde: string;
};

export type GenAiStuckAction = {
  readonly executionId: string;
  readonly command: string;
  /** Instante ISO em que a vaga foi reservada. */
  readonly iniciadaEm: string;
};

export type GenAiInsight = {
  readonly insightId: string;
  readonly titulo: string;
  readonly geradoEm: string;
};

export type AiGenInput = {
  readonly hoje: string;
  readonly budgets: readonly GenAiBudget[];
  readonly providerProblems: readonly GenAiProviderProblem[];
  readonly stuckActions: readonly GenAiStuckAction[];
  readonly insights: readonly GenAiInsight[];
};

const ESCOPO_LABEL: Record<GenAiBudget["escopo"], string> = {
  diario: "do dia",
  mensal: "do mês",
};

const MOTIVO_TEXTO: Record<GenAiProviderProblem["motivo"], string> = {
  credencial: "a chave não está sendo aceita",
  indisponivel: "as últimas chamadas não completaram",
  job_barrado: "a análise automática não rodou",
};

/** O nível atingido, considerando só os que estão ACIMA do já avisado. */
function nivelNovo(pct: number, jaAvisado: number): NivelDeAlerta | null {
  let atingido: NivelDeAlerta | null = null;
  for (const nivel of NIVEIS_DE_ALERTA) {
    if (pct >= nivel && nivel > jaAvisado) atingido = nivel;
  }
  return atingido;
}

export function generateAiNotifications(input: AiGenInput): Candidate[] {
  const out: Candidate[] = [];

  // ─────────────── Orçamento ───────────────
  for (const b of input.budgets) {
    if (b.limiteUsd === null || b.limiteUsd <= 0) continue;
    const pct = (b.totalUsd / b.limiteUsd) * 100;
    const nivel = nivelNovo(pct, b.nivelJaAvisado);
    if (nivel === null) continue;

    out.push({
      type: "ai_budget_threshold",
      // Só o teto cheio é `medium`: nele a IA para de aceitar pedido novo.
      priority: nivel === 100 ? "medium" : "low",
      title: `IA: ${nivel}% do orçamento ${ESCOPO_LABEL[b.escopo]}`,
      description:
        nivel === 100
          ? "O teto foi alcançado. Você pode ajustá-lo nas configurações da IA."
          : "Dá para acompanhar o detalhe por modelo e por tentativa em Consumo.",
      link: usageLink(),
      entity_type: "ai_budget",
      entity_id: null,
      dedupe_key: `ai-orcamento:${b.escopo}:${b.competencia}:${nivel}`,
    });
  }

  // ─────────────── Provedor ───────────────
  for (const p of input.providerProblems) {
    out.push({
      type: "ai_provider_problem",
      priority: "medium",
      title: `IA: ${p.provider} precisa de atenção`,
      description: `Desde ${formatDate(p.desde)}, ${MOTIVO_TEXTO[p.motivo]}.`,
      link: settingsLink(),
      entity_type: "ai_provider",
      entity_id: null,
      dedupe_key: `ai-provedor:${p.provider}:${p.motivo}:${p.desde}`,
    });
  }

  // ─────────────── Ação sem desfecho ───────────────
  for (const a of input.stuckActions) {
    out.push({
      type: "ai_action_stuck",
      priority: "medium",
      title: "IA: uma ação ficou sem desfecho registrado",
      // ⛔ Não afirma que aconteceu nem que falhou — é exatamente o que não se sabe.
      description:
        "A ação reservou a vaga e não registrou o resultado. Vale conferir no módulo de destino antes de repetir.",
      link: stuckActionsLink(),
      entity_type: "ai_action_execution",
      entity_id: a.executionId,
      dedupe_key: `ai-sem-desfecho:${a.executionId}`,
    });
  }

  // ─────────────── Insight disponível ───────────────
  // ⚠️ UM aviso por SEMANA, não por insight e não por dia. A chave sai da semana justamente
  // para que cinco análises numa terça não virem cinco avisos.
  if (input.insights.length > 0) {
    const semana = segundaDaSemana(input.hoje);
    const quantos = input.insights.length;
    out.push({
      type: "ai_insight_available",
      priority: "low",
      title: quantos === 1 ? "IA: uma análise nova" : `IA: ${quantos} análises novas`,
      description: "Elas ficam disponíveis enquanto valerem, e você decide o que fazer com cada uma.",
      link: insightsLink(),
      entity_type: "ai_insight",
      entity_id: quantos === 1 ? input.insights[0].insightId : null,
      dedupe_key: `ai-insight-semana:${semana}`,
    });
  }

  return out;
}
```

- [ ] **Step 5: Rode e confirme que passa**

Run: `npx vitest run src/lib/notifications/ai.test.ts`
Expected: PASS — 22 testes.

Se o teste de vocabulário reprovar, **o texto é que muda, não o teste**: ele varre `VOCABULARIO_DE_COBRANCA` e `VOCABULARIO_DE_PRESCRICAO` de `src/lib/tone/vocabulary.ts`, e reprovar significa que a frase cobra ou prescreve.

- [ ] **Step 6: Confira o tipo e comite**

```bash
npx tsc --noEmit
git add src/lib/notifications/ai.ts src/lib/notifications/ai.test.ts src/lib/notifications/constants.ts
git commit -m "feat(18-f): quatro familias de notificacao de IA, puras e testadas"
```

---

## Task 3: Ligar o gerador ao pipeline

**Files:**
- Modify: `src/lib/notifications/generate.ts`
- Test: `src/lib/notifications/generate.test.ts`

**Interfaces:**
- Consumes: `AiGenInput` e `generateAiNotifications` da Task 2.
- Produces: `GenerateInput.ai?: AiGenInput | null`.

- [ ] **Step 1: Escreva o teste que falha**

Acrescente ao fim de `src/lib/notifications/generate.test.ts`:

```ts
describe("Fase 18-F — IA entra pelo mesmo gerador", () => {
  it("as notificações de IA saem de generateNotifications", () => {
    const saida = generateNotifications({
      ...ENTRADA_VAZIA, // o helper já existente no arquivo
      ai: {
        hoje: "2026-09-19",
        budgets: [
          { escopo: "mensal", competencia: "2026-09", totalUsd: 10, limiteUsd: 10, nivelJaAvisado: 0 },
        ],
        providerProblems: [],
        stuckActions: [],
        insights: [],
      },
    });
    expect(saida.some((c) => c.type === "ai_budget_threshold")).toBe(true);
  });

  it("ai ausente não gera nada e não quebra", () => {
    expect(() => generateNotifications(ENTRADA_VAZIA)).not.toThrow();
  });
});
```

⚠️ Abra o arquivo e use o nome real do helper de entrada vazia que já existe nele. Se não houver um, construa o objeto literal com todos os campos de `GenerateInput` vazios — **não** invente um helper novo.

- [ ] **Step 2: Rode e confirme que falha**

Run: `npx vitest run src/lib/notifications/generate.test.ts -t "18-F"`
Expected: FAIL — `ai` não existe em `GenerateInput`.

- [ ] **Step 3: Implemente**

Em `src/lib/notifications/generate.ts`:

1. No bloco de imports, junto dos de `./nutrition` e `./training`:

```ts
import { generateAiNotifications, type AiGenInput } from "./ai";
```

2. Em `GenerateInput`, depois do campo `training`:

```ts
  /**
   * Fase 18-F — módulo de IA. Mesmo isolamento de Dieta e Treinos: entra pelo MESMO gerador,
   * então herda `dedupe_key`, `selectNewCandidates` e `filterByPrefs` sem nada novo.
   */
  ai?: AiGenInput | null;
```

3. Em `generateNotifications`, logo **depois** do bloco `if (input.training) { … }`:

```ts
  if (input.ai) {
    out.push(...generateAiNotifications(input.ai));
  }
```

- [ ] **Step 4: Rode e confirme que passa**

Run: `npx vitest run src/lib/notifications/generate.test.ts`
Expected: PASS — inclusive os testes que já existiam.

- [ ] **Step 5: Commit**

```bash
npx tsc --noEmit
git add src/lib/notifications/generate.ts src/lib/notifications/generate.test.ts
git commit -m "feat(18-f): IA entra pelo gerador unico de notificacoes"
```

---

## Task 4: O Cron lê o módulo de IA

O I/O. **Nenhuma decisão mora aqui** — ele só monta `AiGenInput`.

**Files:**
- Create: `src/lib/notifications/ai-cron.ts`
- Modify: `src/lib/ai/queries.ts` (`getUsageSummary` passa a aceitar `LeituraDoDono`)
- Modify: `src/lib/notifications/cron.ts`

**Interfaces:**
- Consumes: `AiGenInput` (Task 2); `LeituraDoDono` de `@/lib/supabase/owner`.
- Produces: `buildAiGenInput(service: SupabaseClient<Database>, userId: string, todayIso: string, agora: Date): Promise<AiGenInput>`.

- [ ] **Step 1: `getUsageSummary` passa a aceitar o dono**

⛔ **Por que não escrever uma consulta nova no cron:** se o sino apurasse o orçamento por conta própria, ele e `/ia/consumo` divergiriam no primeiro arredondamento, e o dono veria dois números para o mesmo gasto. É a invariante 24 da 17-F (`getSessionHistory` aceita o dono para o Cron usar **a mesma leitura da tela**).

Em `src/lib/ai/queries.ts`, mude a assinatura de `getUsageSummary`:

```ts
export async function getUsageSummary(
  userId: string,
  periodo: "dia" | "mes",
  limiteUsd: number | null,
  agora: Date,
  /**
   * Fase 18-F. Ausente = leitura com sessão (as telas). Presente = service role, e então o
   * escopo do usuário deixa de vir da RLS e passa a ser NOSSO — por isso o objeto carrega o
   * `userId` junto e "client sem userId" não é representável (`lib/supabase/owner.ts`).
   */
  dono?: LeituraDoDono,
): Promise<UsagePeriodSummary> {
  const supabase = dono?.client ?? (await createClient());
```

Acrescente o import:

```ts
import type { LeituraDoDono } from "@/lib/supabase/owner";
```

O resto do corpo **não muda**: os dois `.eq("user_id", userId)` que já existem continuam sendo o escopo, e é isso que torna a leitura correta sob service role.

- [ ] **Step 2: Escreva o cron**

Crie `src/lib/notifications/ai-cron.ts`:

```ts
/**
 * Fase 18-F · Bloco 1 — leitura do módulo de IA para o Cron de notificações (SERVER-ONLY).
 *
 * Sem sessão: usa a **service role**, que IGNORA a RLS. Toda query carrega `user_id`
 * explicitamente. Aqui só há I/O — quem decide o que vira notificação é `./ai.ts`, puro.
 *
 * ⛔ O ORÇAMENTO NÃO É RECALCULADO AQUI. Ele sai de `getUsageSummary`, a MESMA função de
 * `/ia/consumo`, agora recebendo `LeituraDoDono`. Um segundo somatório faria o número do sino
 * divergir do número da tela — a lição da invariante 24 da 17-F.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { getUsageSummary } from "@/lib/ai/queries";
import type {
  AiGenInput,
  GenAiBudget,
  GenAiInsight,
  GenAiProviderProblem,
  GenAiStuckAction,
} from "./ai";

type Service = SupabaseClient<Database>;

/** Teto de linhas lidas por consulta. Declarado porque teto invisível é teto que mente. */
const TETO = 50;

export async function buildAiGenInput(
  service: Service,
  userId: string,
  todayIso: string,
  agora: Date,
): Promise<AiGenInput> {
  const dono = { client: service, userId } as const;

  // ── Preferências: tetos e o nível já avisado ──
  const { data: prefs } = await service
    .from("ai_user_preferences")
    .select("daily_budget, monthly_budget, budget_alert_level_reached")
    .eq("user_id", userId)
    .maybeSingle();

  const budgets: GenAiBudget[] = [];
  if (prefs) {
    const jaAvisado = prefs.budget_alert_level_reached ?? 0;

    const mensal = await getUsageSummary(userId, "mes", prefs.monthly_budget, agora, dono);
    budgets.push({
      escopo: "mensal",
      competencia: todayIso.slice(0, 7),
      totalUsd: mensal.totalUsd,
      limiteUsd: mensal.limiteUsd,
      nivelJaAvisado: jaAvisado,
    });

    const diario = await getUsageSummary(userId, "dia", prefs.daily_budget, agora, dono);
    budgets.push({
      escopo: "diario",
      competencia: todayIso,
      totalUsd: diario.totalUsd,
      limiteUsd: diario.limiteUsd,
      nivelJaAvisado: jaAvisado,
    });
  }

  // ── Execuções sem desfecho (invariante 52: nem sucesso nem falha) ──
  const { data: paradas } = await service
    .from("ai_action_executions")
    .select("id, command, created_at")
    .eq("user_id", userId)
    .eq("status", "executando")
    .order("created_at", { ascending: false })
    .limit(TETO);

  const stuckActions: GenAiStuckAction[] = (paradas ?? []).map((e) => ({
    executionId: e.id,
    command: e.command,
    iniciadaEm: e.created_at,
  }));

  // ── Insights vigentes gerados hoje ──
  // `expires_at` no futuro = ainda vale a pena olhar. Insight expirado não vira aviso.
  const { data: insightRows } = await service
    .from("ai_insights")
    .select("id, titulo, created_at, expires_at")
    .eq("user_id", userId)
    .gte("expires_at", agora.toISOString())
    .gte("created_at", `${todayIso}T00:00:00.000Z`)
    .limit(TETO);

  const insights: GenAiInsight[] = (insightRows ?? []).map((i) => ({
    insightId: i.id,
    titulo: i.titulo,
    geradoEm: i.created_at.slice(0, 10),
  }));

  // ── Provedor com problema ──
  // Job barrado é o caso que ninguém descobre sozinho: ele roda sem o dono olhando.
  const { data: jobs } = await service
    .from("ai_insight_jobs")
    .select("desfecho, motivo, created_at")
    .eq("user_id", userId)
    .eq("desfecho", "pulado")
    .gte("created_at", `${todayIso}T00:00:00.000Z`)
    .limit(TETO);

  const providerProblems: GenAiProviderProblem[] = [];
  if ((jobs ?? []).length > 0) {
    providerProblems.push({
      provider: "análise automática",
      motivo: "job_barrado",
      desde: todayIso,
    });
  }

  return { hoje: todayIso, budgets, providerProblems, stuckActions, insights };
}
```

⚠️ **Antes de rodar:** confirme no `src/types/supabase.ts` os nomes reais das colunas de `ai_action_executions` (`status`, `command`), `ai_insights` (`titulo`, `expires_at`) e `ai_insight_jobs` (`desfecho`, `motivo`). Se algum diferir, **corrija o código — não invente a coluna**. `npx tsc --noEmit` pega isso.

- [ ] **Step 3: Ligue no orquestrador**

Em `src/lib/notifications/cron.ts`:

1. Import, junto dos outros dois:

```ts
import { buildAiGenInput } from "@/lib/notifications/ai-cron";
```

2. No objeto `input`, logo depois do campo `training`:

```ts
    // Fase 18-F — IA. Mesmo isolamento de Dieta e Treinos: uma falha de leitura do módulo
    // não pode impedir o alerta de fatura atrasada de existir.
    ai: await buildAiGenInput(service, userId, todayIso, now).catch(() => null),
```

⚠️ Confirme o nome da variável de "agora" nessa função (o trecho lido usava `now` e `nowMs`). Use a que existe.

- [ ] **Step 4: Verifique**

```bash
npx tsc --noEmit
npm run test:run
```
Expected: tudo verde. Nenhum teste existente deve quebrar — `ai` é opcional em `GenerateInput`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/notifications/ai-cron.ts src/lib/notifications/cron.ts src/lib/ai/queries.ts
git commit -m "feat(18-f): Cron le o modulo de IA pela mesma leitura da tela"
```

---

## Task 5: Busca global

**Files:**
- Modify: `src/lib/search/types.ts`
- Modify: `src/lib/search/queries.ts`

**Interfaces:**
- Consumes: os links da Task 1.
- Produces: os tipos de busca `ia_conversa`, `ia_insight`, `ia_acao`.

- [ ] **Step 1: Acrescente os tipos**

Em `src/lib/search/types.ts`, **antes** de `"notificacao"` no array `SEARCH_TYPES`:

```ts
  // Fase 18-F — módulo de IA. ⚠️ Memória NÃO entra aqui: `/ia/memoria` só existe no Bloco 3,
  // e link para rota inexistente é 404 (a lição do `?aba=despensa` da 16-F).
  "ia_conversa",
  "ia_insight",
  "ia_acao",
```

E em `SEARCH_TYPE_LABELS`:

```ts
  ia_conversa: "IA · Conversas",
  ia_insight: "IA · Análises",
  ia_acao: "IA · Ações",
```

- [ ] **Step 2: Implemente a busca**

⚠️ **`searchAll` NÃO recebe `userId` e não filtra por ele.** Ela usa o client **com sessão** e deixa a **RLS** fazer o escopo — está escrito no cabeçalho do arquivo. Acrescentar `.eq("user_id", …)` aqui nem compila, porque a variável não existe nessa função. É o oposto do `ai-cron.ts` da Task 4, que roda sob service role e por isso **precisa** do filtro explícito. Os dois estão certos, cada um no seu contexto.

Em `src/lib/search/queries.ts`:

1. Import, junto dos outros de link:

```ts
import { actionsLink, conversationLink, insightsLink } from "./ai-links";
```

2. Em `byType`, acrescente as três chaves (o `Record<SearchType, SearchResult[]>` deixa o `tsc` vermelho até existirem):

```ts
    ia_conversa: [],
    ia_insight: [],
    ia_acao: [],
```

3. No array de promessas, ao fim (seguindo o formato `safe(...).then(...)` que todos os outros usam):

```ts
    // Fase 18-F — IA · Conversas. O link abre a conversa, não a lista.
    safe(
      supabase
        .from("ai_conversations")
        .select("id, title, updated_at")
        .ilike("title", like)
        .order("updated_at", { ascending: false })
        .limit(limitPerType)
        .then((r) => r.data ?? []),
    ).then((rows) => {
      byType.ia_conversa = (rows as Array<{
        id: string;
        title: string | null;
        updated_at: string;
      }>).map((c) => ({
        type: "ia_conversa",
        id: c.id,
        title: c.title ?? "Conversa sem título",
        subtitle: formatDate(dateInSaoPaulo(new Date(c.updated_at))),
        link: conversationLink(c.id),
      }));
    }),

    // Fase 18-F — IA · Análises (18-E).
    safe(
      supabase
        .from("ai_insights")
        .select("id, titulo, created_at")
        .ilike("titulo", like)
        .order("created_at", { ascending: false })
        .limit(limitPerType)
        .then((r) => r.data ?? []),
    ).then((rows) => {
      byType.ia_insight = (rows as Array<{
        id: string;
        titulo: string;
        created_at: string;
      }>).map((i) => ({
        type: "ia_insight",
        id: i.id,
        title: i.titulo,
        subtitle: formatDate(dateInSaoPaulo(new Date(i.created_at))),
        // A lista de insights não abre um registro por id: o link é a tela.
        link: insightsLink(),
      }));
    }),

    // Fase 18-F — IA · Ações aplicadas (18-C).
    safe(
      supabase
        .from("ai_action_executions")
        .select("id, command, created_at")
        .ilike("command", like)
        .order("created_at", { ascending: false })
        .limit(limitPerType)
        .then((r) => r.data ?? []),
    ).then((rows) => {
      byType.ia_acao = (rows as Array<{
        id: string;
        command: string;
        created_at: string;
      }>).map((a) => ({
        type: "ia_acao",
        id: a.id,
        title: a.command,
        subtitle: formatDate(dateInSaoPaulo(new Date(a.created_at))),
        link: actionsLink(),
      }));
    }),
```

⛔ **`created_at`/`updated_at` são `timestamptz`, e `.slice(0, 10)` neles devolve o dia em UTC** — entre 21h e 00h BRT isso mostra a data de amanhã. Por isso o código acima passa por `dateInSaoPaulo(new Date(...))`, que devolve a data pura em Brasília, e só então por `formatDate`. Importe os dois de `@/lib/format` (`formatDate` provavelmente já está no arquivo).

- [ ] **Step 3: Verifique**

```bash
npx tsc --noEmit
npm run test:run
```

O `Record<SearchType, string>` de `SEARCH_TYPE_LABELS` deixa o `tsc` vermelho enquanto faltar um rótulo — é a trava funcionando.

- [ ] **Step 4: Teste manual**

Run: `npm run dev`, abra `/busca`, procure por um termo que exista no título de uma conversa sua. Confirme que o resultado aparece no grupo "IA · Conversas" e que **clicar abre a conversa**.

- [ ] **Step 5: Commit**

```bash
git add src/lib/search/types.ts src/lib/search/queries.ts
git commit -m "feat(18-f): busca global alcanca conversas, analises e acoes da IA"
```

---

## Task 6: Export

**Files:**
- Modify: `src/lib/settings/export-tables.ts`
- Test: `src/lib/settings/export-tables.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `EXPORT_TABLES` com as 17 tabelas de IA; `EXPORT_EXCLUDED.ai_provider_credentials`.

- [ ] **Step 1: Escreva o teste que falha**

Acrescente a `src/lib/settings/export-tables.test.ts`:

```ts
describe("Fase 18-F — seção de IA", () => {
  it("inclui as tabelas de IA que são dado do usuário", () => {
    for (const t of [
      "ai_conversations",
      "ai_messages",
      "ai_runs",
      "ai_usage_events",
      "ai_insights",
      "ai_action_executions",
      "ai_user_preferences",
    ] as const) {
      expect(EXPORT_TABLES).toContain(t);
    }
  });

  // ⛔ A própria fase proíbe exportar material criptográfico, e o backup SAI do sistema.
  it("NÃO inclui a tabela de credenciais, e diz por quê", () => {
    expect(EXPORT_TABLES).not.toContain("ai_provider_credentials");
    expect(EXPORT_EXCLUDED.ai_provider_credentials).toBeTruthy();
  });

  it("a configuração de provedor entra — ela não guarda segredo", () => {
    expect(EXPORT_TABLES).toContain("ai_provider_configs");
  });

  it("não perdeu as seções das outras frentes", () => {
    expect(EXPORT_TABLES).toContain("training_sessions");
    expect(EXPORT_TABLES).toContain("nutrition_diary_entries");
    expect(EXPORT_TABLES).toContain("todo_tasks");
  });
});
```

⚠️ Confirme que `EXPORT_EXCLUDED` está entre os imports do arquivo de teste.

- [ ] **Step 2: Rode e confirme que falha**

Run: `npx vitest run src/lib/settings/export-tables.test.ts -t "18-F"`
Expected: FAIL.

- [ ] **Step 3: Implemente**

Ao **fim** do array `EXPORT_TABLES` (depois de `"training_calendar_sync"`), acrescente — **somando a seção, sem tocar nas outras** (invariante 28):

```ts
  // Fase 18 — módulo de Inteligência Artificial.
  //
  // ⛔ `ai_provider_credentials` fica FORA: guarda o ciphertext da chave de API e a DEK
  // embrulhada. Mesmo motivo de `google_integrations` — um backup que vaza é ruim; um que
  // vaza credencial é pior. `ai_provider_configs` entra: só tem modelo, teto e timeout.
  //
  // ⚠️ `ai_documents` leva o METADADO do comprovante (nome, tipo, tamanho), nunca o binário:
  // os arquivos vivem no bucket privado e não cabem num JSON — como `body_progress_photos`.
  "ai_provider_configs",
  "ai_user_preferences",
  "ai_conversations",
  "ai_messages",
  "ai_runs",
  "ai_run_steps",
  "ai_usage_events",
  "ai_tool_calls",
  "ai_action_proposals",
  "ai_action_approvals",
  "ai_action_executions",
  "ai_documents",
  "ai_document_extractions",
  "ai_insights",
  "ai_insight_sources",
  "ai_insight_feedback",
  "ai_insight_jobs",
```

E em `EXPORT_EXCLUDED`:

```ts
  ai_provider_credentials:
    "Guarda o ciphertext da chave de API e a DEK embrulhada. Credencial nunca sai num arquivo de backup.",
```

- [ ] **Step 4: Rode e confirme que passa**

Run: `npx vitest run src/lib/settings/export-tables.test.ts`
Expected: PASS.

⚠️ Se o arquivo tiver um teste que afirma o TOTAL de tabelas, ele vai quebrar — **atualize o número**, que é o comportamento pretendido: acrescentar tabela ao backup não deve ser algo que se faz sem notar.

- [ ] **Step 5: Commit**

```bash
npx tsc --noEmit
git add src/lib/settings/export-tables.ts src/lib/settings/export-tables.test.ts
git commit -m "feat(18-f): backup inclui a secao de IA, sem credencial"
```

---

## Task 7: Exclusão em massa — a regra pura

**Files:**
- Create: `src/lib/ai/retention.ts`
- Test: `src/lib/ai/retention.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `ESCOPOS_DE_EXCLUSAO`, `EscopoDeExclusao`, `ehEscopoDeExclusao(v: unknown): v is EscopoDeExclusao`, `oQuePermanece(escopo: EscopoDeExclusao): readonly string[]`, `resumoDaExclusao(escopo, quantidade): string`.

- [ ] **Step 1: Escreva o teste que falha**

Crie `src/lib/ai/retention.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  ESCOPOS_DE_EXCLUSAO,
  ehEscopoDeExclusao,
  oQuePermanece,
  resumoDaExclusao,
} from "./retention";

describe("escopos", () => {
  it("reconhece os escopos válidos e recusa o resto", () => {
    expect(ehEscopoDeExclusao("conversas")).toBe(true);
    expect(ehEscopoDeExclusao("tudo")).toBe(false);
    expect(ehEscopoDeExclusao(null)).toBe(false);
  });
});

describe("o que permanece", () => {
  // ⛔ A invariante 38 tirou a FK de `ai_action_executions` de propósito: apagar a conversa
  // não pode apagar o registro de que a IA lançou uma transação. A tela DIZ isso.
  it("apagar conversas preserva o registro das ações aplicadas", () => {
    const permanece = oQuePermanece("conversas");
    expect(permanece.length).toBeGreaterThan(0);
    expect(permanece.join(" ")).toContain("ações");
  });

  it("TODO escopo explica o que permanece — nenhum devolve lista vazia", () => {
    for (const escopo of ESCOPOS_DE_EXCLUSAO) {
      expect(oQuePermanece(escopo).length).toBeGreaterThan(0);
    }
  });
});

describe("resumo", () => {
  it("usa singular e plural corretamente", () => {
    expect(resumoDaExclusao("conversas", 1)).toContain("1 conversa");
    expect(resumoDaExclusao("conversas", 3)).toContain("3 conversas");
  });

  it("diz que não há nada a apagar quando a contagem é zero", () => {
    expect(resumoDaExclusao("conversas", 0)).toContain("Nada");
  });
});
```

- [ ] **Step 2: Rode e confirme que falha**

Run: `npx vitest run src/lib/ai/retention.test.ts`
Expected: FAIL — `Failed to resolve import "./retention"`.

- [ ] **Step 3: Implemente**

Crie `src/lib/ai/retention.ts`:

```ts
/**
 * Fase 18-F · Bloco 1 — a exclusão em massa do módulo de IA. PURO, sem I/O.
 *
 * ⛔ NÃO HÁ RETENÇÃO AUTOMÁTICA, e isso é decisão, não omissão. A decisão 5 da 18-D é "nada
 * some sozinho — descartar é clique do dono", e um job que apaga conversa velha seria a
 * exceção que esvazia a regra. O que existe aqui é exclusão em massa PEDIDA.
 *
 * ⛔ E TODA exclusão declara o que PERMANECE. `ai_action_executions` não tem FK para proposta
 * nem para aprovação (invariante 38), justamente para que apagar a conversa não apague o
 * registro de que a IA lançou uma transação. Esconder isso daria uma tela mais limpa e uma
 * auditoria mentirosa.
 */

export const ESCOPOS_DE_EXCLUSAO = [
  "conversas",
  "conversas_antigas",
  "documentos",
  "insights",
] as const;

export type EscopoDeExclusao = (typeof ESCOPOS_DE_EXCLUSAO)[number];

export function ehEscopoDeExclusao(valor: unknown): valor is EscopoDeExclusao {
  return (
    typeof valor === "string" && (ESCOPOS_DE_EXCLUSAO as readonly string[]).includes(valor)
  );
}

const RASTRO_DE_ACOES =
  "O registro das ações que a IA aplicou nos seus módulos — o que foi feito, quando e em qual registro.";

const PERMANECE: Record<EscopoDeExclusao, readonly string[]> = {
  conversas: [
    RASTRO_DE_ACOES,
    "As análises geradas, que não dependem da conversa.",
  ],
  conversas_antigas: [
    RASTRO_DE_ACOES,
    "As conversas dentro do período que você escolheu manter.",
  ],
  documentos: [
    RASTRO_DE_ACOES,
    "Os lançamentos que já foram criados a partir dos comprovantes.",
  ],
  insights: [
    RASTRO_DE_ACOES,
    "O registro de que a análise automática rodou, e com qual desfecho.",
  ],
};

/** O que sobrevive a cada exclusão. Nunca devolve lista vazia — há sempre o que explicar. */
export function oQuePermanece(escopo: EscopoDeExclusao): readonly string[] {
  return PERMANECE[escopo];
}

const SUBSTANTIVO: Record<EscopoDeExclusao, readonly [string, string]> = {
  conversas: ["conversa", "conversas"],
  conversas_antigas: ["conversa", "conversas"],
  documentos: ["comprovante", "comprovantes"],
  insights: ["análise", "análises"],
};

export function resumoDaExclusao(escopo: EscopoDeExclusao, quantidade: number): string {
  const [um, varios] = SUBSTANTIVO[escopo];
  if (quantidade === 0) return `Nada a apagar: nenhuma ${um} neste filtro.`;
  const palavra = quantidade === 1 ? um : varios;
  return `${quantidade} ${palavra} ${quantidade === 1 ? "será apagada" : "serão apagadas"}.`;
}
```

- [ ] **Step 4: Rode e confirme que passa**

Run: `npx vitest run src/lib/ai/retention.test.ts`
Expected: PASS — 6 testes.

- [ ] **Step 5: Commit**

```bash
npx tsc --noEmit
git add src/lib/ai/retention.ts src/lib/ai/retention.test.ts
git commit -m "feat(18-f): regra pura da exclusao em massa, declarando o que permanece"
```

---

## Task 8: Exclusão em massa — action e tela

**Files:**
- Create: `src/lib/actions/ai-retention.ts`
- Create: `src/components/ai/retention-card.tsx`
- Modify: `src/app/(app)/ia/configuracoes/page.tsx`

**Interfaces:**
- Consumes: `EscopoDeExclusao`, `ehEscopoDeExclusao`, `oQuePermanece`, `resumoDaExclusao` (Task 7).
- Produces: `apagarDadosDaIa(input: unknown): Promise<ActionResult<{ apagados: number }>>`.

- [ ] **Step 1: Escreva a action**

Siga **à risca** o molde de `src/lib/actions/accounts.ts` + `helpers.ts`. Crie `src/lib/actions/ai-retention.ts`:

```ts
"use server";

/**
 * Fase 18-F · Bloco 1 — exclusão em massa dos dados de IA.
 *
 * A decisão do que some e do que fica é PURA (`lib/ai/retention.ts`). Aqui há só auth, Zod,
 * o delete e o `revalidatePath` — a casca de sempre.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authContext, dbError, invalid, notAuthed, type ActionResult } from "./helpers";
import { ESCOPOS_DE_EXCLUSAO, type EscopoDeExclusao } from "@/lib/ai/retention";

const schema = z
  .object({
    escopo: z.enum(ESCOPOS_DE_EXCLUSAO),
    /** Só para `conversas_antigas`: data pura 'yyyy-MM-dd'. Apaga o que é ANTERIOR a ela. */
    anteriorA: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.")
      .nullable()
      .optional(),
    /** Confirmação explícita: nada some sozinho, e nada some por engano. */
    confirmar: z.literal(true, { error: "Confirme a exclusão." }),
  })
  .strict();

export async function apagarDadosDaIa(
  input: unknown,
): Promise<ActionResult<{ apagados: number }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = schema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);

  const { escopo, anteriorA } = parsed.data;

  // `conversas_antigas` sem data não é "apagar tudo" — é entrada incompleta.
  if (escopo === "conversas_antigas" && !anteriorA) {
    return invalid({ anteriorA: ["Escolha a data de corte."] });
  }

  const tabela: Record<EscopoDeExclusao, "ai_conversations" | "ai_documents" | "ai_insights"> = {
    conversas: "ai_conversations",
    conversas_antigas: "ai_conversations",
    documentos: "ai_documents",
    insights: "ai_insights",
  };

  let query = ctx.supabase
    .from(tabela[escopo])
    .delete({ count: "exact" })
    .eq("user_id", ctx.userId);

  if (escopo === "conversas_antigas" && anteriorA) {
    query = query.lt("created_at", `${anteriorA}T00:00:00.000Z`);
  }

  const { error, count } = await query;
  if (error) return dbError(error);

  revalidatePath("/ia");
  revalidatePath("/ia/conversas");
  revalidatePath("/ia/insights");
  revalidatePath("/ia/comprovantes");
  revalidatePath("/ia/configuracoes");

  return { ok: true, data: { apagados: count ?? 0 } };
}
```

⚠️ Confirme em `src/lib/actions/helpers.ts` os nomes reais de `authContext`, `notAuthed`, `invalid`, `dbError` e `ActionResult` antes de importar.

- [ ] **Step 2: Escreva a tela**

Crie `src/components/ai/retention-card.tsx`. Esqueleto com as decisões que **não** são estilo — o acabamento visual segue os outros cards de `/ia/configuracoes`:

```tsx
"use client";

import * as React from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useLazyDialog } from "@/components/shared/use-lazy-dialog";
import { apagarDadosDaIa } from "@/lib/actions/ai-retention";
import {
  ESCOPOS_DE_EXCLUSAO, oQuePermanece, resumoDaExclusao, type EscopoDeExclusao,
} from "@/lib/ai/retention";

const ROTULO: Record<EscopoDeExclusao, string> = {
  conversas: "Todas as conversas",
  conversas_antigas: "Conversas anteriores a uma data",
  documentos: "Comprovantes enviados",
  insights: "Análises geradas",
};

export function RetentionCard({ contagens }: { contagens: Record<EscopoDeExclusao, number> }) {
  const router = useRouter();
  const [escopo, setEscopo] = React.useState<EscopoDeExclusao>("conversas_antigas");
  const [anteriorA, setAnteriorA] = React.useState("");
  const [aberto, setAberto] = React.useState(false);
  const [enviando, setEnviando] = React.useState(false);

  // `useLazyDialog`: monta na primeira abertura e não desmonta. `{aberto && <Dialog/>}`
  // sozinho quebraria a animação de fechamento do Radix.
  const montado = useLazyDialog(aberto);

  async function confirmar() {
    setEnviando(true);
    const r = await apagarDadosDaIa({
      escopo,
      anteriorA: escopo === "conversas_antigas" ? anteriorA || null : null,
      confirmar: true,
    });
    setEnviando(false);
    setAberto(false);

    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    toast.success(
      r.data.apagados === 0
        ? "Nada foi apagado: não havia registro neste filtro."
        : `${r.data.apagados} registro(s) apagado(s).`,
    );
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Apagar dados da IA</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="escopo-exclusao">O que apagar</Label>
          <Select value={escopo} onValueChange={(v) => setEscopo(v as EscopoDeExclusao)}>
            <SelectTrigger id="escopo-exclusao">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ESCOPOS_DE_EXCLUSAO.map((e) => (
                <SelectItem key={e} value={e}>
                  {ROTULO[e]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {escopo === "conversas_antigas" && (
          <div className="space-y-2">
            <Label htmlFor="anterior-a">Apagar o que for anterior a</Label>
            <Input
              id="anterior-a"
              type="date"
              value={anteriorA}
              onChange={(e) => setAnteriorA(e.target.value)}
            />
          </div>
        )}

        {/*
          ⛔ O que PERMANECE aparece ANTES de confirmar, e não atrás de um "saiba mais".
          `ai_action_executions` não tem FK para conversa (invariante 38) justamente para
          sobreviver a esta exclusão — esconder isso seria uma tela mais limpa e uma
          auditoria mentirosa.
        */}
        <div className="rounded-lg border bg-muted/30 p-3 text-sm">
          <p className="font-medium">O que permanece</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
            {oQuePermanece(escopo).map((linha) => (
              <li key={linha} className="min-w-0">
                {linha}
              </li>
            ))}
          </ul>
        </div>

        <Button
          variant="destructive"
          onClick={() => setAberto(true)}
          disabled={escopo === "conversas_antigas" && !anteriorA}
        >
          Apagar…
        </Button>

        {montado && (
          <AlertDialog open={aberto} onOpenChange={setAberto}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{ROTULO[escopo]}</AlertDialogTitle>
                <AlertDialogDescription>
                  {resumoDaExclusao(escopo, contagens[escopo])} Esta ação não pode ser desfeita.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={enviando}>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={confirmar} disabled={enviando}>
                  {enviando ? "Apagando…" : "Apagar"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </CardContent>
    </Card>
  );
}
```

⚠️ `contagens` vem do Server Component (Step 3): quatro `select` com `{ count: "exact", head: true }` sobre `ai_conversations`, `ai_documents` e `ai_insights`. Sem elas, `resumoDaExclusao` não teria número para mostrar e o diálogo perguntaria "quer apagar?" sem dizer quanto.

- [ ] **Step 3: Monte na página**

Em `src/app/(app)/ia/configuracoes/page.tsx`, acrescente o card ao fim da página. Siga o padrão dos cards que já estão lá.

- [ ] **Step 4: Verifique**

```bash
npm run lint
npx tsc --noEmit
npm run test:run
npm run build
npm run perf:bundle
```

⚠️ **`perf:bundle` reprova rota acima de 250 KB gz e `/ia/configuracoes` já está em 277,5 KB** (teto próprio documentado). Confirme que o número **não subiu** com esta task. Se subiu, é porque algo entrou estático que devia ser lazy.

- [ ] **Step 5: Teste manual**

`npm run dev` → `/ia/configuracoes`. Confirme: a lista do que permanece aparece **antes** de confirmar; o diálogo pede confirmação; apagar funciona; a contagem volta no toast; e a tela responde bem em 375px de largura, em dark e light.

- [ ] **Step 6: Commit**

```bash
git add src/lib/actions/ai-retention.ts src/components/ai/retention-card.tsx "src/app/(app)/ia/configuracoes/page.tsx"
git commit -m "feat(18-f): exclusao em massa dos dados de IA, dizendo o que permanece"
```

---

## Fechamento do Bloco 1

- [ ] **Verificação completa**

```bash
npm run lint && npx tsc --noEmit && npm run test:run && npm run build && npm run perf:bundle
TZ=UTC npx vitest run
```

Os cinco primeiros rodam no CI. O `TZ=UTC` é exigência do projeto: a suíte tem de passar em qualquer fuso.

- [ ] **Smoke do Cron**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/cron/notifications
```
Expected: `401` (sem o Bearer do `CRON_SECRET`).

- [ ] **Confirme a idempotência de verdade**

Com `CRON_SECRET` no ambiente, chame `/api/cron/notifications` **três vezes** e confirme no banco que a contagem de `notifications` do tipo `ai_*` **não aumentou** depois da primeira. É o critério de aceite 7 da spec, e é o tipo de coisa que só a execução real prova.

- [ ] **Atualize o handoff**

`docs/project/CURRENT_STATUS.md` e `docs/handoff/NEXT_AGENT_INSTRUCTIONS.md`: o que o bloco entregou e as decisões tomadas. **Edite de forma pontual** — os dois arquivos são ponto de contato entre frentes.

- [ ] **Commit final**

```bash
git add docs/
git commit -m "docs(18-f): registrar o que o Bloco 1 entregou"
```
