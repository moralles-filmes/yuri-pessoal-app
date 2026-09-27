# REDESIGN-07-A — Organização: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Alinhar aparência e navegação de TO-DO, Agenda e Rotinas e tarefas sem mudar dado nenhum, com cada correção travada por teste confirmado por mutação.

**Architecture:** Duas peças compartilhadas novas em `src/components/shared/` (`SeletorDeVisao`, `AbasDeRota`); `hrefAtivo` passa a aceitar itens que representam outras rotas (`NavItem.tambem`); o extrator de deep-links do R4 vira módulo de apoio em `src/test/` e ganha um segundo consumidor (contrato de query string). O resto são edições cirúrgicas de classe/atributo nas telas, cada grupo guardado por uma varredura de código-fonte (o projeto não tem teste de componente — invariante 25).

**Tech Stack:** Next 16 (App Router), React 19, Tailwind v4, shadcn/ui, Vitest (ambiente `node`), TypeScript 5.9.

**Spec:** `docs/superpowers/specs/2026-09-27-07a-organizacao-design.md` (aprovado em 2026-09-27).

## Global Constraints

- Trabalhar **só** no worktree `C:\Users\Yuri\Documents\Desenvolvedor\yuri.app.pessoal-07a`, branch `feat/redesign-07a-organizacao`. Nunca `checkout/switch/stash/reset` na pasta principal.
- ⛔ Não editar: `src/lib/finance/**`, `src/lib/notifications/**`, `src/lib/search/queries.ts`, `src/lib/ai/**`, `src/lib/dashboard/**`, `src/lib/reports/**`, `src/app/(app)/dashboard/**`, `src/app/(app)/financeiro/page.tsx`, `src/app/(app)/financeiro/contas/**`, `docs/redesign/STATUS.md`, `floating-assistant*.tsx`, `DASH_CARD_IDS`. Casca: só `nav.ts` e **uma linha** de `nav-links.tsx`.
- ⛔ Nenhuma migration. `src/lib/todo/**`, `src/lib/tasks/**`, `src/lib/calendar/**` sem mudança de comportamento.
- ⛔ Nenhuma URL muda; `/tarefas?view=&date=`, `/agenda?view=&date=`, `/todo?v=&id=&view=&m=&task=` continuam aceitos.
- Bundle: `/(app)/todo` ≤ 250 KB; `/(app)/configuracoes` ≤ 285 KB **sem subir o teto**; nenhuma rota fora.
- Linha de base: 4.032/4.033 (a falha é `src/lib/ai/approval/schema.test.ts › … › a FK da aprovação carrega o hash…`, CRLF do checkout). Qualquer outra falha é nossa.
- Commits: título pt-BR **sem acento**, corpo com o que mudou / não mudou / mutações / fora; terminar com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Revisar diff (nada de `.env`, chave, token, `service_role`). Sem push.
- Shell POSIX: Git Bash; argumentos que começam com `/` exigem `MSYS_NO_PATHCONV=1`.
- Varreduras de fonte ignoram comentários (`semComentarios`).

## Review Focus

1. `/tarefas?view=atrasadas` aberto **a 390 px** — a opção ativa tem de aparecer sem o dono rolar a trilha (F4). Coberto só por conferência manual; a varredura prova `aria-pressed`, não a rolagem.
2. Teclado: Tab chega a cada visão, Espaço/Enter troca, anel de foco visível **dentro** da trilha que rola (o `p-1` é o que evita o recorte). Conferência manual + prévia.
3. `/tarefas` e `/rotinas` acendem o **mesmo** item e **só** ele; `/todo` continua acendendo TO-DO. Coberto por `active.test.ts`.
4. As gavetas laterais corrigidas não podem estourar no celular: `data-[side=right]:w-full` a 390 px ocupa a tela inteira com o botão de fechar visível. Conferência manual.
5. O `SeletorDeVisao` recebendo `atual` que não está em `visoes` (URL adulterada): a página já normaliza antes (`TASK_VIEWS.includes`), então nenhuma opção fica pressionada só se isso quebrar — nenhum código novo depende disso.

---

## Mapa de arquivos

| Arquivo | Papel | Tarefa |
| --- | --- | --- |
| `src/components/calendar/google-connect-card.tsx` | movido de `app/(app)/agenda/` | 1 |
| `src/test/imports-entre-rotas.test.ts` | nenhuma rota importa de outra | 1 |
| `src/lib/search/types.ts:54` | rótulo | 2 |
| `src/test/rotulos-visiveis.test.ts` | sem "Fase N" visível | 2 |
| `src/test/links-inline.ts` | extrator único de deep-links | 3 |
| `src/test/deep-links-inline.test.ts` | passa a importar o extrator | 3 |
| `src/app/(app)/todo/resolve-route.ts` | `resolveRoute` fora do `page.tsx` | 3 |
| `src/test/deep-links-query-string.test.ts` | contrato da query string | 3 |
| `src/components/shared/seletor-de-visao.tsx` (+ `.test.ts`) | seletor de visão | 4 |
| `src/lib/nav/active.ts` | `hrefAtivo` com alvos | 5 |
| `src/config/nav.ts` | `tambem`, item agrupado | 5 |
| `src/components/layout/nav-links.tsx` | 1 linha | 5 |
| `src/components/shared/abas-de-rota.tsx` (+ `.test.ts`) | abas por rota | 5 |
| `src/components/tasks/rotinas-e-tarefas.ts` / `-abas.tsx` | dados + abas | 5 |
| `src/test/organizacao-contratos.test.ts` | contratos da V7 | 6 |
| `src/test/separacao-todo-tarefas.test.ts` | M10 | 6b |
| `src/components/ui/sheet-largura.test.ts` | F5 | 6c |

---

### Task 1: V6 — `GoogleConnectCard` sai da rota da Agenda

**Files:**
- Move: `src/app/(app)/agenda/google-connect-card.tsx` → `src/components/calendar/google-connect-card.tsx`
- Modify: `src/app/(app)/agenda/agenda-client.tsx:21`, `src/app/(app)/configuracoes/page.tsx:12`
- Test: `src/test/imports-entre-rotas.test.ts`

**Interfaces:** Produces `GoogleConnectCard` em `@/components/calendar/google-connect-card` (mesma assinatura).

- [ ] **Step 1: Escrever o teste** (`src/test/imports-entre-rotas.test.ts`):

```ts
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = path.resolve(__dirname, "..");
const APP = path.join(SRC, "app", "(app)");

function arquivos(dir: string): string[] {
  const achados: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const alvo = path.join(dir, e.name);
    if (e.isDirectory()) achados.push(...arquivos(alvo));
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) achados.push(alvo);
  }
  return achados;
}

/** Primeiro segmento sob `(app)` — a rota de topo. `null` = fora de `(app)`. */
export function rotaDe(absoluto: string): string | null {
  const rel = path.relative(APP, absoluto);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return rel.split(path.sep)[0];
}

/** A rota de topo do alvo de um import, ou `null` (pacote, ou fora de `(app)`). */
export function rotaDoAlvo(arquivo: string, especificador: string): string | null {
  if (especificador.startsWith("@/")) return rotaDe(path.join(SRC, especificador.slice(2)));
  if (especificador.startsWith(".")) return rotaDe(path.resolve(path.dirname(arquivo), especificador));
  return null;
}

/** Especificadores de import estático, re-export e `import()`, com a linha. */
function importsDe(fonte: string): { especificador: string; linha: number }[] {
  const achados: { especificador: string; linha: number }[] = [];
  const padroes = [
    /^\s*(?:import|export)\s[^;]*?\sfrom\s*["']([^"']+)["']/gm,
    /^\s*import\s*["']([^"']+)["']/gm,
    /\bimport\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g,
  ];
  for (const re of padroes) {
    for (const m of fonte.matchAll(re)) {
      achados.push({ especificador: m[1], linha: fonte.slice(0, m.index).split("\n").length });
    }
  }
  return achados;
}

const TODOS = arquivos(APP);

describe("V6 — nenhuma rota de (app) importa de outra rota", () => {
  it("enxerga o disco (guarda anti-tautologia)", () => {
    expect(TODOS.length).toBeGreaterThan(100);
  });

  it("o resolvedor sabe dizer sim e não", () => {
    const config = path.join(APP, "configuracoes", "page.tsx");
    expect(rotaDoAlvo(config, "@/app/(app)/agenda/x")).toBe("agenda");
    expect(rotaDoAlvo(config, "../agenda/x")).toBe("agenda");
    expect(rotaDoAlvo(config, "./cartao")).toBe("configuracoes");
    expect(rotaDoAlvo(config, "@/components/calendar/x")).toBeNull();
    expect(rotaDoAlvo(config, "react")).toBeNull();
    // Controle positivo REAL: estudos/[id] importa ../course-form — mesma rota de topo.
    const detalhe = path.join(APP, "estudos", "[id]", "course-detail-client.tsx");
    expect(rotaDoAlvo(detalhe, "../course-form")).toBe("estudos");
    expect(rotaDe(detalhe)).toBe("estudos");
  });

  it("nenhum arquivo importa de outra rota de topo", () => {
    const cruzados: string[] = [];
    for (const arquivo of TODOS) {
      const dono = rotaDe(arquivo);
      for (const { especificador, linha } of importsDe(fs.readFileSync(arquivo, "utf8"))) {
        const alvo = rotaDoAlvo(arquivo, especificador);
        if (alvo !== null && alvo !== dono) {
          cruzados.push(`${path.relative(SRC, arquivo)}:${linha} → ${especificador}`);
        }
      }
    }
    // Componente usado por duas telas mora em `src/components/`, não na pasta de uma delas.
    expect(cruzados).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/test/imports-entre-rotas.test.ts` → FAIL listando `app/(app)/configuracoes/page.tsx:12 → @/app/(app)/agenda/google-connect-card`.
- [ ] **Step 3: Mover e reapontar**: `git mv "src/app/(app)/agenda/google-connect-card.tsx" src/components/calendar/google-connect-card.tsx`; em `agenda-client.tsx` trocar `import { GoogleConnectCard } from "./google-connect-card";` por `import { GoogleConnectCard } from "@/components/calendar/google-connect-card";`; em `configuracoes/page.tsx` trocar `@/app/(app)/agenda/google-connect-card` por `@/components/calendar/google-connect-card`.
- [ ] **Step 4: Rodar verde** — o mesmo comando → PASS; `npx tsc --noEmit` → exit 0.
- [ ] **Step 5: Build + bundle** — `npm run build && npm run perf:bundle` e medir `/(app)/configuracoes` e `/(app)/agenda` (script de rotas do scratchpad). `configuracoes` ≤ 281,7.
- [ ] **Step 6: Commit** `feat(redesign): 07-A V6 — GoogleConnectCard sai da rota da Agenda`.

---

### Task 2: V5 — sem "Fase N" em rótulo visível

**Files:** Modify `src/lib/search/types.ts:54`; Test `src/test/rotulos-visiveis.test.ts`.

- [ ] **Step 1: Teste:**

```ts
import { describe, expect, it } from "vitest";
import { SEARCH_TYPE_LABELS } from "@/lib/search/types";
import { allNavItems } from "@/config/nav";

/** Número de fase é vocabulário do projeto, não do dono. */
const VOCABULARIO_INTERNO = /\bFase\s*\d+/i;

describe("V5 — rótulo visível não carrega número de fase", () => {
  it("a regra sabe dizer não (guarda anti-tautologia)", () => {
    expect("Tarefas (Fase 09)").toMatch(VOCABULARIO_INTERNO);
    expect("Tarefas").not.toMatch(VOCABULARIO_INTERNO);
    expect(Object.keys(SEARCH_TYPE_LABELS).length).toBeGreaterThan(10);
    expect(allNavItems.length).toBeGreaterThan(15);
  });

  it.each(Object.entries(SEARCH_TYPE_LABELS))("busca · %s → %s", (_tipo, rotulo) => {
    expect(rotulo).not.toMatch(VOCABULARIO_INTERNO);
  });

  it.each(allNavItems.map((i) => [i.href, i.title] as const))("menu · %s → %s", (_href, titulo) => {
    // `phase` existe no item e NÃO é exibido — só o `title` é.
    expect(titulo).not.toMatch(VOCABULARIO_INTERNO);
  });
});
```

- [ ] **Step 2:** `npx vitest run src/test/rotulos-visiveis.test.ts` → FAIL em `busca · tarefa → Tarefas (Fase 09)`.
- [ ] **Step 3:** `src/lib/search/types.ts:54`: `tarefa: "Tarefas (Fase 09)",` → `tarefa: "Tarefas",`.
- [ ] **Step 4:** PASS; `npx vitest run src/lib/search` verde.
- [ ] **Step 5: Commit** `feat(redesign): 07-A V5 — busca deixa de mostrar "Fase 09"`.

---

### Task 3: V4 — contrato da query string (+ F2)

**Files:**
- Create: `src/test/links-inline.ts`, `src/app/(app)/todo/resolve-route.ts`, `src/test/deep-links-query-string.test.ts`
- Modify: `src/test/deep-links-inline.test.ts`, `src/app/(app)/todo/page.tsx`

**Interfaces:**
- Produces (`@/test/links-inline`): `semComentarios(codigo): string`, `pontosDeLink(arquivo, fonte): PontoDeLink[]`, `lerLinks(arquivoRelativoASrc): { arquivo; bruto; fonte; pontos }`, `VALOR_DE_EXEMPLO = "abc123"`, `type PontoDeLink = { arquivo; linha; literal; concreta }`.
- Produces (`@/app/(app)/todo/resolve-route`): `resolveRoute(v: string | undefined, id: string | undefined): TodoRoute`.

- [ ] **Step 1: Contar o R4 antes** — `npx vitest run src/test/deep-links-inline.test.ts` e anotar `Tests N passed` (N antes).
- [ ] **Step 2: Extrair sem mudar comportamento.** Mover para `src/test/links-inline.ts` (com o comentário de cabeçalho explicando que é o extrator ÚNICO) as funções `semComentarios`, `fimDoLiteral`, `fimDaInterpolacao`, `expressaoDoLink`, `rotasDaExpressao`, `pontosDeLink`, o tipo `PontoDeLink` e `VALOR_DE_EXEMPLO`, exportando `semComentarios`, `pontosDeLink`, `PontoDeLink`, `VALOR_DE_EXEMPLO` e um novo

```ts
export function lerLinks(arquivo: string) {
  const bruto = fs.readFileSync(path.join(SRC, arquivo), "utf8");
  const fonte = semComentarios(bruto);
  return { arquivo, bruto, fonte, pontos: pontosDeLink(arquivo, fonte) };
}
```

(`SRC = path.resolve(__dirname, "..")`). Em `deep-links-inline.test.ts`, apagar as funções movidas e importar de `@/test/links-inline`; `LIDOS` vira `VARRIDOS.map((alvo) => ({ ...alvo, ...lerLinks(alvo.arquivo) }))`. Rodar: `Tests N passed` **igual** ao Step 1.
- [ ] **Step 3: F2 — o fixture da forma nova, vermelho.** Em `deep-links-inline.test.ts`, depois do bloco "o extrator, medido contra texto conhecido", acrescentar (sem tocar no `FIXTURE` existente):

```ts
const FIXTURE_ATRIBUICAO = [
  "const link = t.projectId ? `/todo?v=projeto&id=${t.projectId}` : `/todo?v=todas`;",
  "out.push({ link, titulo: \"/nao-e-um-link\" });",
  'if (link === "/comparacao") {}',
  "const f = (link) => link;",
  'const deepLink = "/outra-chave";',
].join("\n");

describe("R4 — o extrator também lê `const link = …` (F2, 07-A)", () => {
  const achadas = pontosDeLink("fixture.ts", FIXTURE_ATRIBUICAO).map((p) => p.literal);

  it("acha as duas pontas de um ternário atribuído", () => {
    // `generate.ts` monta `/faturas?…` e `/todo?…` assim e usa `link,` abreviado — o R4 não via.
    expect(achadas).toEqual(["/todo?v=projeto&id=${t.projectId}", "/todo?v=todas"]);
  });

  it("não confunde comparação, parâmetro de arrow nem outra chave", () => {
    expect(achadas).not.toContain("/comparacao");
    expect(achadas).not.toContain("/outra-chave");
    expect(achadas).not.toContain("/nao-e-um-link");
  });
});
```

Rodar → FAIL (acha `[]`).
- [ ] **Step 4: Estender o extrator** em `links-inline.ts`: em `pontosDeLink`, `fonte.matchAll(/\blink\s*:/g)` → `fonte.matchAll(/\blink\s*(?::|=(?![=>]))/g)`; em `expressaoDoLink`, `} else if (c === "," && profundidade === 0) break;` → `} else if ((c === "," || c === ";") && profundidade === 0) break;` (comentar: `;` é o fim da atribuição; propriedade de objeto nunca tem `;` no nível zero). Subir o piso de `lib/notifications/generate.ts` em `VARRIDOS` de 13 para o total que a varredura medir (esperado 16) e anotar no comentário. Rodar `deep-links-inline.test.ts` → PASS, com os casos novos.
- [ ] **Step 5: `resolveRoute` sai do page.** Criar `src/app/(app)/todo/resolve-route.ts`:

```ts
import { TODO_NAV_VIEWS } from "@/lib/todo/constants";
import type { TodoRoute } from "@/components/todo/todo-nav";

/**
 * Resolve a rota interna do TO-DO a partir da URL (`?v=` + `?id=`).
 *
 * Mora fora do `page.tsx` porque o Next não aceita export arbitrário de página, e o
 * contrato dos deep-links (`src/test/deep-links-query-string.test.ts`) precisa CHAMÁ-LA:
 * ler o texto dela seria testar a forma, não o comportamento.
 */
export function resolveRoute(v: string | undefined, id: string | undefined): TodoRoute {
  if (v === "projeto" && id) return { kind: "projeto", id };
  if (v === "etiqueta" && id) return { kind: "etiqueta", id };
  if (v === "filtro" && id) return { kind: "filtro", id };
  if (v === "arquivados") return { kind: "arquivados" };
  if (v && (TODO_NAV_VIEWS as readonly string[]).includes(v)) {
    return { kind: "view", value: v as (typeof TODO_NAV_VIEWS)[number] };
  }
  return { kind: "view", value: "hoje" };
}
```

Em `todo/page.tsx`: apagar a função local e `import { resolveRoute } from "./resolve-route";`; remover `TODO_NAV_VIEWS` do import de constantes se ficar sem uso (manter `TODO_VIEWS`, `type TodoView`); `import type { TodoRoute }` só se ainda usado.
- [ ] **Step 6: O contrato** (`src/test/deep-links-query-string.test.ts`):

```ts
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { lerLinks, VALOR_DE_EXEMPLO, type PontoDeLink } from "@/test/links-inline";
import { TASK_VIEWS } from "@/lib/tasks/constants";
import { CALENDAR_VIEWS } from "@/lib/calendar/constants";
import { resolveRoute } from "@/app/(app)/todo/resolve-route";

const SRC = path.resolve(__dirname, "..");
/** Só lidos: os dois são da 03-B2. */
const ARQUIVOS = ["lib/search/queries.ts", "lib/notifications/generate.ts"] as const;
const ROTAS = ["/tarefas", "/agenda", "/todo", "/rotinas"] as const;
type Rota = (typeof ROTAS)[number];
/** Contado pela varredura no commit que a introduz. Piso: link novo é bem-vindo. */
const PISO: Record<Rota, number> = { "/todo": 8, "/tarefas": 3, "/agenda": 2, "/rotinas": 1 };

const caminho = (p: PontoDeLink) => p.concreta.split(/[?#]/)[0];
const query = (s: string) => new URLSearchParams(s.split("?")[1]?.split("#")[0] ?? "");
const ehRota = (c: string): c is Rota => (ROTAS as readonly string[]).includes(c);

/** O que a página LÊ, derivado do `page.tsx` (`sp.<nome>`) — nunca escrito à mão. */
function lidosPela(rota: Rota): Set<string> {
  const fonte = fs.readFileSync(path.join(SRC, "app", "(app)", rota.slice(1), "page.tsx"), "utf8");
  return new Set([...fonte.matchAll(/\bsp\.(\w+)/g)].map((m) => m[1]));
}

const PONTOS = ARQUIVOS.flatMap((a) => lerLinks(a).pontos).filter((p) => ehRota(caminho(p)));
const onde = (p: PontoDeLink) => `${p.arquivo}:${p.linha} → \`${p.literal}\``;

describe("V4 — o parâmetro do deep-link é aceito pela página", () => {
  it.each(ROTAS)("%s continua recebendo links (piso)", (rota) => {
    const n = PONTOS.filter((p) => caminho(p) === rota).length;
    expect(n, `${rota}: ${n} link(s), piso ${PISO[rota]}`).toBeGreaterThanOrEqual(PISO[rota]);
  });

  it("a leitura do page.tsx sabe dizer sim e não", () => {
    expect(lidosPela("/tarefas")).toEqual(new Set(["view", "date"]));
    expect(lidosPela("/todo").has("task")).toBe(true);
    expect(lidosPela("/rotinas").size).toBe(0);
    expect(lidosPela("/agenda").has("naoexiste")).toBe(false);
  });

  it.each(PONTOS)("$arquivo:$linha → $literal — todo parâmetro é lido pela página", (p) => {
    const lidos = lidosPela(caminho(p) as Rota);
    for (const chave of query(p.concreta).keys()) {
      expect(lidos.has(chave), `${onde(p)}: a página não lê \`${chave}\``).toBe(true);
    }
  });

  it.each(PONTOS.filter((p) => caminho(p) === "/tarefas"))("$arquivo:$linha → $literal — view de Tarefas", (p) => {
    const view = query(p.literal).get("view");
    if (view === null || view.includes("${")) return;
    expect((TASK_VIEWS as readonly string[]).includes(view), `${onde(p)}: \`${view}\` não está em TASK_VIEWS`).toBe(true);
  });

  it.each(PONTOS.filter((p) => caminho(p) === "/agenda"))("$arquivo:$linha → $literal — view e data da Agenda", (p) => {
    const q = query(p.literal);
    const view = q.get("view");
    if (view !== null && !view.includes("${")) {
      expect((CALENDAR_VIEWS as readonly string[]).includes(view), `${onde(p)}: \`${view}\` não está em CALENDAR_VIEWS`).toBe(true);
    }
    const data = q.get("date");
    // Interpolada, a data não é verificável lendo o código (risco residual do spec §11).
    if (data !== null && !data.includes("${")) {
      expect(data, onde(p)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it.each(PONTOS.filter((p) => caminho(p) === "/todo"))("$arquivo:$linha → $literal — o TO-DO abre o que o link pede", (p) => {
    const q = query(p.concreta);
    const v = q.get("v") ?? undefined;
    const id = q.get("id") ?? undefined;
    const rota = resolveRoute(v, id);
    const reflete = rota.kind === v || (rota.kind === "view" && rota.value === v);
    expect(reflete, `${onde(p)}: \`v=${v}\` cai em ${JSON.stringify(rota)}`).toBe(true);
    const precisaDeId =
      JSON.stringify(resolveRoute(v, undefined)) !== JSON.stringify(resolveRoute(v, VALOR_DE_EXEMPLO));
    if (precisaDeId) expect(id, `${onde(p)}: \`v=${v}\` exige \`id\``).toBeDefined();
  });

  it("a checagem do TO-DO sabe dizer não", () => {
    expect(resolveRoute("projeto", undefined)).toEqual({ kind: "view", value: "hoje" });
    expect(resolveRoute("inexistente", undefined)).toEqual({ kind: "view", value: "hoje" });
  });
});
```

- [ ] **Step 7:** `npx vitest run src/test/` → PASS (nasce verde). `npx tsc --noEmit` exit 0. Mutação rápida de sanidade antes do commit: tirar `"atrasadas"` de `TASK_VIEWS` por `.filter` (M3) → vermelho nomeando `generate.ts:380`; restaurar; `git diff --quiet -- src/lib/tasks`.
- [ ] **Step 8: Commit** `test(redesign): 07-A V4 — contrato da query string dos deep-links`.

---

### Task 4: V1 — `SeletorDeVisao` nas quatro telas

**Files:** Create `src/components/shared/seletor-de-visao.tsx`, `src/components/shared/seletor-de-visao.test.ts`; Modify `agenda-client.tsx:179-197`, `tasks-client.tsx:226-245`, `habits-client.tsx:131-147`, `studies-client.tsx:122-138`.

**Interfaces:** Produces `SeletorDeVisao<V extends string>(props: { rotulo: string; visoes: readonly V[]; rotulos: Record<V, string>; atual: V; aoEscolher: (visao: V) => void; className?: string })`.

- [ ] **Step 1: Teste** (`seletor-de-visao.test.ts`) — varredura de fonte:

```ts
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { semComentarios } from "@/test/links-inline";

const SRC = path.resolve(__dirname, "..", "..");
const ler = (rel: string) => semComentarios(fs.readFileSync(path.join(SRC, rel), "utf8"));
const COMPONENTE = "components/shared/seletor-de-visao.tsx";
const TELAS = [
  "app/(app)/agenda/agenda-client.tsx",
  "app/(app)/tarefas/tasks-client.tsx",
  "app/(app)/habitos/habits-client.tsx",
  "app/(app)/estudos/studies-client.tsx",
];
/** Exceções DECLARADAS, com dono. Cada uma tem de continuar casando (senão sai da lista). */
const EXCECOES = new Map<string, string>([
  ["components/dashboard/general/period-toolbar.tsx", "F3 — defeito vivo, é da REDESIGN-06"],
  ["app/(app)/todo/todo-client.tsx", "alternador só-ícone, já com aria-pressed e aria-label"],
]);

/** Fim do parêntese aberto em `i` (o caractere em `i` é `(`). Sem strings: JSX quebraria. */
function fimDoParentese(fonte: string, i: number): number {
  let prof = 0;
  for (let j = i; j < Math.min(fonte.length, i + 4000); j++) {
    if (fonte[j] === "(") prof++;
    else if (fonte[j] === ")" && --prof === 0) return j;
  }
  return -1;
}

/** Quantos `X_VIEWS[.filter(…)].map(…)` montam botão. */
export function blocosDeVisaoComBotao(fonte: string): number {
  let n = 0;
  for (const m of fonte.matchAll(/\b[A-Z][A-Z0-9_]*_VIEWS\b/g)) {
    let i = m.index + m[0].length;
    const filtro = fonte.slice(i).match(/^\s*\.\s*filter\s*\(/);
    if (filtro) {
      const fim = fimDoParentese(fonte, i + filtro[0].length - 1);
      if (fim < 0) continue;
      i = fim + 1;
    }
    const map = fonte.slice(i).match(/^\s*\.\s*map\s*\(/);
    if (!map) continue;
    const inicio = i + map[0].length - 1;
    const fim = fimDoParentese(fonte, inicio);
    if (fim > 0 && /<(button|Button)\b/.test(fonte.slice(inicio, fim))) n++;
  }
  return n;
}

function tsxDe(dir: string): string[] {
  const achados: string[] = [];
  for (const e of fs.readdirSync(path.join(SRC, dir), { withFileTypes: true })) {
    const rel = path.join(dir, e.name).split(path.sep).join("/");
    if (e.isDirectory()) achados.push(...tsxDe(rel));
    else if (e.name.endsWith(".tsx")) achados.push(rel);
  }
  return achados;
}

describe("V1 — o seletor de visão anuncia o estado", () => {
  const fonte = ler(COMPONENTE);

  it("grupo com nome e botões com aria-pressed", () => {
    expect(fonte).toMatch(/role="group"/);
    expect(fonte).toMatch(/aria-label=\{rotulo\}/);
    expect(fonte).toMatch(/aria-pressed=\{ativa\}/);
  });

  it("a ativa carrega mais que cor: marca e peso", () => {
    expect(fonte).toMatch(/\{\s*ativa\s*&&\s*<MarcaDeAtiva\s*\/>\s*\}/);
    expect(fonte).toMatch(/ativa\s*\?\s*"[^"]*\bfont-semibold\b/);
  });

  it("não importa nada além de React, cn e Button", () => {
    const imports = new Set([...fonte.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]));
    expect(imports).toEqual(new Set(["react", "@/components/ui/button", "@/lib/utils"]));
  });

  it.each(TELAS)("%s usa o componente", (tela) => {
    const f = ler(tela);
    expect(f).toMatch(/from "@\/components\/shared\/seletor-de-visao"/);
    expect(f).toMatch(/<SeletorDeVisao\b/);
  });
});

describe("V1 — nenhuma tela monta o próprio bloco de visões", () => {
  it("a varredura sabe dizer sim e não (fixture)", () => {
    expect(blocosDeVisaoComBotao("{A_VIEWS.map((v) => (<button key={v}>{L[v]}</button>))}")).toBe(1);
    expect(blocosDeVisaoComBotao('{A_VIEWS.filter((v) => v !== "x").map((v) => (<Button key={v}>{v}</Button>))}')).toBe(1);
    expect(blocosDeVisaoComBotao("{A_VIEWS.map((v) => (<SelectItem key={v} value={v}>{L[v]}</SelectItem>))}")).toBe(0);
  });

  it("fora das exceções declaradas, nenhum arquivo monta o bloco", () => {
    const arquivos = [...tsxDe("app"), ...tsxDe("components")].filter((a) => a !== COMPONENTE);
    expect(arquivos.length).toBeGreaterThan(200);
    const reincidentes = arquivos.filter((a) => !EXCECOES.has(a) && blocosDeVisaoComBotao(ler(a)) > 0);
    expect(reincidentes).toEqual([]);
  });

  it.each([...EXCECOES])("a exceção %s ainda existe (%s)", (arquivo) => {
    expect(blocosDeVisaoComBotao(ler(arquivo))).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2:** `npx vitest run src/components/shared/seletor-de-visao.test.ts` → FAIL (componente não existe).
- [ ] **Step 3: Componente** (`src/components/shared/seletor-de-visao.tsx`):

```tsx
"use client";

/**
 * REDESIGN-07-A · V1 — o seletor de visão, escrito UMA vez.
 *
 * Era o mesmo bloco JSX em Agenda, Tarefas, Hábitos e Estudos, e em todos a visão ativa
 * só era dita pela COR (`bg-primary`): nada de `aria-pressed`, nada de foco visível próprio.
 * É o defeito que a 02-E fechou no nav da IA, só que vivo em quatro telas.
 *
 * ⚠️ POR QUE `aria-pressed` E NÃO `radiogroup`. `radiogroup` promete ao leitor de tela uma
 * parada de Tab e navegação por setas; sem implementar o foco itinerante, ele anunciaria
 * "botão de opção" com um teclado que não se comporta como tal. `aria-pressed` é nativo de
 * `<button>` — zero código de teclado — e é anunciado como "botão de alternância,
 * pressionado". O custo aceito: cada visão é uma parada de Tab.
 *
 * ⛔ Imports de runtime: só React, `cn` e a primitiva `Button`. Nada de `lucide-react`, `zod`
 * ou `validators` — a marca de ativo é um traço de SVG inline.
 */
import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SeletorDeVisao<V extends string>({
  rotulo,
  visoes,
  rotulos,
  atual,
  aoEscolher,
  className,
}: {
  /** Nome do grupo, lido pelo leitor de tela ("Visão das tarefas"). */
  rotulo: string;
  visoes: readonly V[];
  rotulos: Record<V, string>;
  atual: V;
  aoEscolher: (visao: V) => void;
  className?: string;
}) {
  const trilha = React.useRef<HTMLDivElement>(null);

  // A 390 px a trilha de Tarefas rola, e a visão que a notificação abre ("Atrasadas") nascia
  // escondida à direita. Rola SÓ a trilha (`scrollLeft`) — `scrollIntoView` rolaria a página.
  React.useEffect(() => {
    const t = trilha.current;
    const ativa = t?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!t || !ativa) return;
    const inicio = ativa.offsetLeft;
    const fim = inicio + ativa.offsetWidth;
    if (inicio < t.scrollLeft || fim > t.scrollLeft + t.clientWidth) {
      t.scrollLeft = inicio - (t.clientWidth - ativa.offsetWidth) / 2;
    }
  }, [atual]);

  return (
    // `relative`: é o offsetParent das opções, para `offsetLeft` ser medido dentro da trilha.
    // `p-1`: a trilha rola, e quem rola recorta sombra — 4 px é o que o anel de foco precisa.
    <div
      ref={trilha}
      role="group"
      aria-label={rotulo}
      className={cn(
        "relative inline-flex max-w-full gap-0.5 overflow-x-auto rounded-lg border bg-muted/40 p-1",
        className,
      )}
    >
      {visoes.map((visao) => {
        const ativa = visao === atual;
        return (
          <Button
            key={visao}
            type="button"
            variant="ghost"
            aria-pressed={ativa}
            onClick={() => aoEscolher(visao)}
            className={cn(
              "px-3",
              ativa
                ? "bg-primary font-semibold text-primary-foreground hover:bg-primary hover:text-primary-foreground dark:hover:bg-primary"
                : "text-muted-foreground",
            )}
          >
            {ativa && <MarcaDeAtiva />}
            {rotulos[visao]}
          </Button>
        );
      })}
    </div>
  );
}

/** Estado que não depende de cor: a marca só existe na opção ativa. */
function MarcaDeAtiva() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-3.5"
    >
      <path d="M4.5 12.5l5 5 10-11" />
    </svg>
  );
}
```

- [ ] **Step 4: As quatro telas.** Trocar o bloco inteiro por:
  - Agenda (`agenda-client.tsx`, a `<div className="inline-flex rounded-lg border p-0.5">…</div>`): `<SeletorDeVisao rotulo="Visão da agenda" visoes={CALENDAR_VIEWS} rotulos={CALENDAR_VIEW_LABELS} atual={view} aoEscolher={(v) => navigate({ view: v })} />`.
  - Tarefas (`tasks-client.tsx`, a `<div className="-mx-1 overflow-x-auto px-1">…</div>`): `<SeletorDeVisao rotulo="Visão das tarefas" visoes={TASK_VIEWS} rotulos={TASK_VIEW_LABELS} atual={view} aoEscolher={(v) => navigate({ view: v })} />`.
  - Hábitos (`habits-client.tsx`, `{/* Navegação de visões */}` + a div): `<SeletorDeVisao rotulo="Visão dos hábitos" visoes={HABIT_VIEWS} rotulos={HABIT_VIEW_LABELS} atual={view} aoEscolher={navigate} />`.
  - Estudos (`studies-client.tsx`): `<SeletorDeVisao rotulo="Visão dos estudos" visoes={STUDY_VIEWS} rotulos={STUDY_VIEW_LABELS} atual={view} aoEscolher={navigate} />`.
  - Em cada uma: `import { SeletorDeVisao } from "@/components/shared/seletor-de-visao";`; se `cn` ficar sem uso, remover o import.
- [ ] **Step 5:** `npx vitest run src/components/shared` PASS; `npx tsc --noEmit`; `npm run lint`.
- [ ] **Step 6:** build + bundle; medir `habitos`, `agenda`, `tarefas`, `estudos`, `configuracoes`.
- [ ] **Step 7: Commit** `feat(redesign): 07-A V1 — um seletor de visao, com estado anunciado` (corpo declara Hábitos/Estudos como invasão consciente da 07-B).

---

### Task 5: V2 + V3 + D4 — "Rotinas e tarefas", item ativo e abas

**Files:**
- Modify: `src/lib/nav/active.ts`, `src/lib/nav/active.test.ts`, `src/config/nav.ts`, `src/config/nav.test.ts`, `src/components/layout/nav-links.tsx` (1 linha + import), `src/components/financeiro/finance-tabs-nav.tsx`, `src/app/(app)/tarefas/tasks-client.tsx`, `src/app/(app)/rotinas/routines-client.tsx`
- Create: `src/components/shared/abas-de-rota.tsx`, `src/components/shared/abas-de-rota.test.ts`, `src/components/tasks/rotinas-e-tarefas.ts`, `src/components/tasks/rotinas-e-tarefas-abas.tsx`

**Interfaces:**
- `active.ts`: `type AlvoDeNavegacao = string | { readonly href: string; readonly tambem?: readonly string[] }`; `rotasDeclaradas(alvo): readonly string[]`; `hrefAtivo(pathname, alvos: readonly AlvoDeNavegacao[]): string | null`.
- `nav.ts`: `NavItem.tambem?: readonly string[]`.
- `abas-de-rota.tsx`: `type AbaDeRota = { href: string; rotulo: string }`; `AbasDeRota({ rotulo, abas })`.
- `rotinas-e-tarefas.ts`: `ABAS_DE_ROTINAS_E_TAREFAS: readonly AbaDeRota[]` (dados puros, sem import de runtime).

- [ ] **Step 1: Testes vermelhos em `active.test.ts`.**
  - Trocar `import { findNavItem, navHrefs } from "@/config/nav";` por `import { allNavItems, findNavItem, navHrefs } from "@/config/nav";` e `import { hrefAtivo } from "./active";` por `import { hrefAtivo, rotasDeclaradas } from "./active";`.
  - Acrescentar ao fim de `describe("hrefAtivo — a regra")`:

```ts
  it("um alvo pode representar outras rotas, e continua vencendo UM", () => {
    const alvos = [{ href: "/a" }, { href: "/b", tambem: ["/a/x"] }];
    expect(hrefAtivo("/a/x/y", alvos)).toBe("/b");
    expect(hrefAtivo("/a/z", alvos)).toBe("/a");
    expect(hrefAtivo("/b", alvos)).toBe("/b");
    // A ordem da lista não decide.
    expect(hrefAtivo("/a/x/y", [...alvos].reverse())).toBe("/b");
    // String pura continua como antes.
    expect(hrefAtivo("/a/x", ["/a", "/a/x"])).toBe("/a/x");
  });
```

  - Em `describe("a sidebar sobre as rotas reais")`: trocar os três testes que usam `navHrefs` como alvo por itens, e acrescentar os novos:

```ts
  it("nenhuma rota real acende mais de um item", () => {
    for (const rota of ROTAS) {
      const acesos = allNavItems.filter((item) => item.href === hrefAtivo(rota, allNavItems));
      expect(acesos.length, `rota ${rota}`).toBeLessThanOrEqual(1);
    }
  });

  it("nenhuma rota real é reivindicada por dois itens na mesma profundidade", () => {
    // O desempate da função esconderia um dos dois; numa decisão item a item, os dois acenderiam.
    for (const rota of ROTAS) {
      const profundidade = (item: (typeof allNavItems)[number]) =>
        Math.max(-1, ...rotasDeclaradas(item).filter((r) => rota === r || rota.startsWith(`${r}/`)).map((r) => r.length));
      const melhor = Math.max(...allNavItems.map(profundidade));
      if (melhor < 0) continue;
      const empatados = allNavItems.filter((item) => profundidade(item) === melhor).map((i) => i.title);
      expect(empatados, `rota ${rota}`).toHaveLength(1);
    }
  });

  it("toda rota real acende um item, salvo as declaradas", () => {
    const orfas = ROTAS.filter((rota) => hrefAtivo(rota, allNavItems) === null);
    expect(new Set(orfas)).toEqual(SEM_ITEM_NO_MENU);
  });

  it("a rota declarada que acendeu o item é ancestral-ou-igual da rota aberta", () => {
    // Com `tambem`, o href do item (/rotinas) não é ancestral de /tarefas — a afirmação
    // antiga seria falsa, não mais fraca. O que continua valendo: alguma rota DELE cobre esta.
    for (const rota of ROTAS) {
      const ativo = allNavItems.find((i) => i.href === hrefAtivo(rota, allNavItems));
      if (!ativo) continue;
      expect(rotasDeclaradas(ativo).some((r) => rota === r || rota.startsWith(`${r}/`)), `rota ${rota}`).toBe(true);
    }
  });

  it("findNavItem responde o mesmo que a tela pinta", () => {
    for (const rota of ROTAS) {
      expect(findNavItem(rota)?.href ?? null, `rota ${rota}`).toBe(hrefAtivo(rota, allNavItems));
    }
  });

  it("Rotinas e tarefas: as duas telas acendem o mesmo item; o TO-DO segue separado", () => {
    expect(findNavItem("/rotinas")?.title).toBe("Rotinas e tarefas");
    expect(findNavItem("/tarefas")?.title).toBe("Rotinas e tarefas");
    expect(findNavItem("/todo")?.title).toBe("TO-DO");
  });
```

  (Os testes antigos "nenhuma rota real acende mais de um item", "toda rota real acende…", "o item aceso é sempre ancestral-ou-igual…" e "findNavItem responde…" são **substituídos** por estes.)
  - Rodar `npx vitest run src/lib/nav` → FAIL (`rotasDeclaradas` não existe; Rotinas e tarefas não existe).
- [ ] **Step 2: `active.ts`.** Substituir `hrefAtivo` por (mantendo o cabeçalho e acrescentando um parágrafo sobre `tambem`):

```ts
/**
 * Um alvo de navegação: o href que ele abre e, opcionalmente, outras rotas que ele
 * REPRESENTA (07-A). "Rotinas e tarefas" abre `/rotinas` e acende também em `/tarefas`;
 * a 05 vai fazer o mesmo com `/cartoes` representando `/faturas` e `/parcelamentos`.
 */
export type AlvoDeNavegacao =
  | string
  | { readonly href: string; readonly tambem?: readonly string[] };

/** Todas as rotas que um alvo reivindica: o href e as que ele representa. */
export function rotasDeclaradas(alvo: AlvoDeNavegacao): readonly string[] {
  return typeof alvo === "string" ? [alvo] : [alvo.href, ...(alvo.tambem ?? [])];
}

/**
 * O `href` do alvo que cobre esta rota com a rota declarada mais funda, ou `null`.
 * Continua UMA decisão com no máximo um vencedor: cada rota declarada de cada alvo disputa,
 * e a comparação por comprimento segue exata (todas as que casam são ancestrais-ou-iguais
 * do mesmo pathname).
 */
export function hrefAtivo(pathname: string, alvos: readonly AlvoDeNavegacao[]): string | null {
  let vencedor: string | null = null;
  let profundidade = -1;
  for (const alvo of alvos) {
    for (const rota of rotasDeclaradas(alvo)) {
      if (casa(pathname, rota) && rota.length > profundidade) {
        profundidade = rota.length;
        vencedor = typeof alvo === "string" ? alvo : alvo.href;
      }
    }
  }
  return vencedor;
}
```

- [ ] **Step 3: `nav.ts`.** `NavItem` ganha `tambem?: readonly string[];` (com doc: "Outras rotas que este item representa — acendem ele. Sem query, sem barra final; há teste no disco."). Seção Organização vira:

```ts
      // TO-DO é o gerenciador principal de execução. "Rotinas e tarefas" agrupa as duas telas
      // do outro módulo — AGRUPAR NÃO É FUNDIR: `todo_*` e `tasks` seguem separadas, e
      // `/tarefas` continua existindo com todos os parâmetros (a busca e o sino linkam para lá).
      { title: "TO-DO", href: "/todo", icon: ListTodo, phase: "Fase 15" },
      { title: "Agenda", href: "/agenda", icon: CalendarDays, phase: "Fase 08" },
      { title: "Rotinas e tarefas", href: "/rotinas", tambem: ["/tarefas"], icon: Repeat, phase: "Fase 09" },
      { title: "Hábitos", href: "/habitos", icon: Target, phase: "Fase 10" },
      { title: "Estudos", href: "/estudos", icon: GraduationCap, phase: "Fase 11" },
```

  Remover `ListChecks` do import do lucide se ficar sem uso. `findNavItem`: `hrefAtivo(pathname, allNavItems)`.
- [ ] **Step 4: `nav-links.tsx`** — **a linha autorizada (D2)**: `import { navSections, navHrefs } from "@/config/nav";` → `import { allNavItems, navSections } from "@/config/nav";` e `const ativo = hrefAtivo(pathname, navHrefs);` → `const ativo = hrefAtivo(pathname, allNavItems);`.
- [ ] **Step 5:** `npx vitest run src/lib/nav` → PASS.
- [ ] **Step 6: `nav.test.ts`** — acrescentar (sem remover nada):

```ts
import { rotasDeclaradas } from "@/lib/nav/active";
import { ABAS_DE_ROTINAS_E_TAREFAS } from "@/components/tasks/rotinas-e-tarefas";

const representadas = allNavItems.flatMap((item) => (item.tambem ?? []).map((rota) => [item.title, rota] as const));

describe("toda rota que um item representa também abre uma tela", () => {
  it("há ao menos uma (guarda)", () => expect(representadas.length).toBeGreaterThan(0));
  it.each(representadas)("%s → %s", (_t, rota) => expect(temPagina(rota)).toBe(true));
});

describe("rotas representadas", () => {
  it("têm a forma de um href do menu", () => {
    for (const [titulo, rota] of representadas) {
      expect(rota.startsWith("/"), titulo).toBe(true);
      expect(rota, titulo).not.toMatch(/[?#]|\/$|http/);
    }
  });
  it("nenhuma rota é declarada por dois itens (href ou tambem)", () => {
    const todas = allNavItems.flatMap((item) => rotasDeclaradas(item));
    expect(new Set(todas).size).toBe(todas.length);
  });
  it("Rotinas e tarefas representa /tarefas, e as abas das duas telas são exatamente as dele", () => {
    const item = allNavItems.find((i) => i.title === "Rotinas e tarefas");
    expect(item?.href).toBe("/rotinas");
    expect(item?.tambem).toEqual(["/tarefas"]);
    expect(ABAS_DE_ROTINAS_E_TAREFAS.map((a) => a.href)).toEqual(item ? [...rotasDeclaradas(item)] : []);
  });
});
```

- [ ] **Step 7: `AbasDeRota` + teste.** `src/components/shared/abas-de-rota.tsx`:

```tsx
"use client";

/**
 * REDESIGN-07-A · D4 — abas por rota, escritas UMA vez (Financeiro e Rotinas e tarefas).
 *
 * É a forma que a 02-E deixou de fora (D23: fita horizontal, não coluna) e que faltava um
 * segundo consumidor para virar componente. Três coisas que as abas do Financeiro não tinham:
 * o landmark com NOME (a página tem dois "navigation"), foco visível próprio (inset, porque a
 * fita rola e recorta sombra) e a aba ativa com PESO além do sublinhado e da cor.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { hrefAtivo } from "@/lib/nav/active";

export type AbaDeRota = { href: string; rotulo: string };

export function AbasDeRota({ rotulo, abas }: { rotulo: string; abas: readonly AbaDeRota[] }) {
  const pathname = usePathname();
  // A decisão única (02-C): `/financeiro` só vence quando nenhuma aba mais funda casou.
  const ativo = hrefAtivo(pathname, abas.map((aba) => aba.href));

  return (
    <nav aria-label={rotulo} className="-mb-px flex gap-1 overflow-x-auto border-b">
      {abas.map((aba) => {
        const ativa = aba.href === ativo;
        return (
          <Link
            key={aba.href}
            href={aba.href}
            aria-current={ativa ? "page" : undefined}
            className={cn(
              "whitespace-nowrap rounded-t-md border-b-2 px-3 py-2 text-sm transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
              ativa
                ? "border-primary font-semibold text-foreground"
                : "border-transparent font-medium text-muted-foreground hover:text-foreground",
            )}
          >
            {aba.rotulo}
          </Link>
        );
      })}
    </nav>
  );
}
```

  `src/components/shared/abas-de-rota.test.ts`:

```ts
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { semComentarios } from "@/test/links-inline";

const SRC = path.resolve(__dirname, "..", "..");
const ler = (rel: string) => semComentarios(fs.readFileSync(path.join(SRC, rel), "utf8"));

describe("D4 — abas por rota", () => {
  const fonte = ler("components/shared/abas-de-rota.tsx");

  it("o landmark tem nome", () => expect(fonte).toMatch(/<nav aria-label=\{rotulo\}/));
  it("a ativa é anunciada e tem peso", () => {
    expect(fonte).toMatch(/aria-current=\{ativa \? "page" : undefined\}/);
    expect(fonte).toMatch(/ativa\s*\?\s*"[^"]*\bfont-semibold\b/);
  });
  it("o foco é visível", () => expect(fonte).toMatch(/focus-visible:ring-2/));
  it("a decisão é a regra única", () => expect(fonte).toMatch(/from "@\/lib\/nav\/active"/));

  it.each(["components/financeiro/finance-tabs-nav.tsx", "components/tasks/rotinas-e-tarefas-abas.tsx"])(
    "%s usa o componente e não monta link por conta própria",
    (arquivo) => {
      const f = ler(arquivo);
      expect(f).toMatch(/<AbasDeRota\b/);
      expect(f).not.toMatch(/<Link\b/);
      expect(f).not.toMatch(/from "next\/link"/);
    },
  );
});
```

- [ ] **Step 8: Consumidores.**
  - `finance-tabs-nav.tsx` inteiro:

```tsx
import { AbasDeRota } from "@/components/shared/abas-de-rota";

// `exact: true` na "Visão geral" era a mesma exceção que os navs de módulo escreviam à mão,
// só que escrita nos DADOS. Com o vencedor decidido sobre a lista inteira (`hrefAtivo`),
// `/financeiro` só ganha quando nenhuma aba mais funda casou. A forma da fita mora em
// `AbasDeRota` desde a 07-A, que ganhou o segundo consumidor (Rotinas e tarefas).
const TABS = [
  { href: "/financeiro", rotulo: "Visão geral" },
  { href: "/financeiro/lancamentos", rotulo: "Lançamentos" },
  { href: "/financeiro/contas", rotulo: "Contas" },
  { href: "/financeiro/categorias", rotulo: "Categorias" },
  { href: "/financeiro/contas-fixas", rotulo: "Contas fixas" },
  { href: "/financeiro/recorrencias", rotulo: "Recorrências" },
];

export function FinanceTabsNav() {
  return <AbasDeRota rotulo="Seções de Financeiro" abas={TABS} />;
}
```

  - `src/components/tasks/rotinas-e-tarefas.ts`:

```ts
import type { AbaDeRota } from "@/components/shared/abas-de-rota";

/**
 * As duas telas do item "Rotinas e tarefas" do menu (07-A). Dados puros — `nav.test.ts`
 * confere que são exatamente `[item.href, ...item.tambem]`, para as abas e a sidebar não
 * divergirem.
 */
export const ABAS_DE_ROTINAS_E_TAREFAS: readonly AbaDeRota[] = [
  { href: "/rotinas", rotulo: "Rotinas" },
  { href: "/tarefas", rotulo: "Tarefas" },
];
```

  - `src/components/tasks/rotinas-e-tarefas-abas.tsx`:

```tsx
import { AbasDeRota } from "@/components/shared/abas-de-rota";
import { ABAS_DE_ROTINAS_E_TAREFAS } from "./rotinas-e-tarefas";

export function RotinasETarefasAbas() {
  return <AbasDeRota rotulo="Seções de Rotinas e tarefas" abas={ABAS_DE_ROTINAS_E_TAREFAS} />;
}
```

  - `tasks-client.tsx`: `<PageHeader title="Tarefas & Rotinas" …>` → `title="Rotinas e tarefas"`; logo depois do `</PageHeader>`: `<RotinasETarefasAbas />`; import `{ RotinasETarefasAbas } from "@/components/tasks/rotinas-e-tarefas-abas"`. O `<a href="/rotinas" className="text-primary hover:underline">` → `<Link href="/rotinas" className="text-primary hover:underline">` (+ `import Link from "next/link"`).
  - `routines-client.tsx`: `title="Rotinas"` → `title="Rotinas e tarefas"`; `<RotinasETarefasAbas />` depois do `</PageHeader>`.
- [ ] **Step 9:** `npx vitest run src/lib/nav src/config src/components/shared` PASS; `npx tsc --noEmit`; `npm run lint`.
- [ ] **Step 10:** build + bundle — `configuracoes` (a casca), `financeiro`, `tarefas`, `rotinas`.
- [ ] **Step 11: Commit** `feat(redesign): 07-A V2+V3+D4 — Rotinas e tarefas, item ativo por rotas declaradas e abas por rota`.

---

### Task 6a: V7 · Agenda

**Files:** `src/components/calendar/month-view.tsx:50-58`, `src/components/calendar/time-grid.tsx:52-58`, `src/app/(app)/agenda/agenda-client.tsx:199-200`, `src/app/(app)/agenda/event-details.tsx:83-86`; Create `src/test/organizacao-contratos.test.ts`.

- [ ] **Step 1: Teste** (`src/test/organizacao-contratos.test.ts`):

```ts
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { semComentarios } from "@/test/links-inline";

/**
 * REDESIGN-07-A · V7 — o que alguém desfaria sem perceber. Uma linha por contrato:
 * arquivo × padrão exigido × por quê. Varredura sem comentários (invariante 25).
 */
const SRC = path.resolve(__dirname, "..");

type Contrato = { arquivo: string; exige: RegExp; porque: string };

export const CONTRATOS: Contrato[] = [
  // Agenda
  { arquivo: "components/calendar/month-view.tsx", exige: /aria-current=\{day\.isToday \? "date" : undefined\}/, porque: "hoje no mês é anunciado, não só pintado" },
  { arquivo: "components/calendar/time-grid.tsx", exige: /aria-current=\{d\.isToday \? "date" : undefined\}/, porque: "hoje na semana é anunciado" },
  { arquivo: "app/(app)/agenda/agenda-client.tsx", exige: /<span className="[^"]*\bmin-w-0\b[^"]*\btruncate\b[^"]*">\{periodLabel\}/, porque: "regra 2: o rótulo do período não empurra os botões" },
  { arquivo: "app/(app)/agenda/event-details.tsx", exige: /<span className="min-w-0 break-words">\{event\.location\}<\/span>/, porque: "regra 2: local longo não empurra o ícone" },
];

describe("V7 — contratos visuais da Organização", () => {
  it.each(CONTRATOS)("$arquivo — $porque", ({ arquivo, exige }) => {
    const fonte = semComentarios(fs.readFileSync(path.join(SRC, arquivo), "utf8"));
    expect(fonte).toMatch(exige);
  });
});
```

- [ ] **Step 2:** `npx vitest run src/test/organizacao-contratos.test.ts` → FAIL nas 4.
- [ ] **Step 3: Edições.**
  - `month-view.tsx`, no `<button … onClick={() => onSelectDay(day.date)}`: acrescentar `aria-current={day.isToday ? "date" : undefined}`.
  - `time-grid.tsx`, no `<span className={cn("grid size-7 …", d.isToday && …)}>`: acrescentar `aria-current={d.isToday ? "date" : undefined}`.
  - `agenda-client.tsx`: `<div className="flex items-center gap-2">` do período → `<div className="flex min-w-0 items-center gap-2">`; `<span className="mr-1 text-sm font-medium capitalize">{periodLabel}</span>` → `<span className="mr-1 min-w-0 truncate text-sm font-medium capitalize">{periodLabel}</span>`.
  - `event-details.tsx`: `{event.location}` solto → `<span className="min-w-0 break-words">{event.location}</span>`.
- [ ] **Step 4:** PASS; `npx vitest run src/components/calendar src/lib/calendar`; `tsc`; `lint`.
- [ ] **Step 5:** build + bundle (`agenda`).
- [ ] **Step 6: Commit** `feat(redesign): 07-A V7 — Agenda: hoje anunciado e rotulos que nao empurram`.

---

### Task 6b: V7 · Rotinas e tarefas (+ M10)

**Files:** `tasks-client.tsx` (ProjectChip, RoutinesTodayCard, WeekView `h3`, linha 594, gaveta `Listas`), `routines-client.tsx:140-143`, `task-form.tsx:~370`, `routine-form.tsx:~240,277,290,373`, `project-form.tsx:~141,154`, `task-details.tsx:118-128,272`, `components/tasks/task-card.tsx:124-129`, `components/tasks/task-calendar.tsx:101-107`; Create `src/test/separacao-todo-tarefas.test.ts`; extend `CONTRATOS`.

- [ ] **Step 1: Testes.** `src/test/separacao-todo-tarefas.test.ts`:

```ts
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * REDESIGN-07-A · M10 — TO-DO e Tarefas continuam SEPARADOS.
 *
 * Agrupar visualmente ("Rotinas e tarefas" na sidebar) não é fundir dados: `todo_*` e `tasks`
 * são tabelas distintas, com semânticas distintas (recorrência que avança a linha × status
 * gravado). Hoje nenhum arquivo de um lado importa do outro; este teste transforma o "é verdade
 * hoje" em regra. Unificar componentes (D6) exigiria um que conhecesse os dois formatos — a
 * porta para a mistura.
 */
const SRC = path.resolve(__dirname, "..");

const LADOS = [
  {
    nome: "Tarefas e Rotinas",
    pastas: ["components/tasks", "app/(app)/tarefas", "app/(app)/rotinas"],
    proibidos: [/^@\/lib\/todo(\/|$)/, /^@\/components\/todo(\/|$)/, /^@\/lib\/actions\/todo[\w-]*$/],
  },
  {
    nome: "TO-DO",
    pastas: ["components/todo", "app/(app)/todo"],
    proibidos: [/^@\/lib\/tasks(\/|$)/, /^@\/components\/tasks(\/|$)/, /^@\/lib\/actions\/(tasks|routines|projects)$/],
  },
] as const;

function arquivos(rel: string): string[] {
  const abs = path.join(SRC, rel);
  return fs.readdirSync(abs, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? arquivos(path.join(rel, e.name)) : /\.(ts|tsx)$/.test(e.name) ? [path.join(rel, e.name)] : [],
  );
}

/** Especificador normalizado para a forma `@/…` (relativos resolvidos a partir do arquivo). */
function especificadores(rel: string): string[] {
  const fonte = fs.readFileSync(path.join(SRC, rel), "utf8");
  return [...fonte.matchAll(/(?:from\s*|import\s*\(\s*)["']([^"']+)["']/g)].map((m) => {
    const s = m[1];
    if (!s.startsWith(".")) return s;
    const abs = path.resolve(path.dirname(path.join(SRC, rel)), s);
    return `@/${path.relative(SRC, abs).split(path.sep).join("/")}`;
  });
}

describe("M10 — TO-DO e Tarefas não se importam", () => {
  it("a regra sabe dizer sim e não", () => {
    const [tarefas, todo] = LADOS;
    expect(tarefas.proibidos.some((re) => re.test("@/lib/todo/constants"))).toBe(true);
    expect(tarefas.proibidos.some((re) => re.test("@/lib/todos"))).toBe(false);
    expect(tarefas.proibidos.some((re) => re.test("@/lib/actions/todo-extras"))).toBe(true);
    expect(todo.proibidos.some((re) => re.test("@/components/tasks/task-card"))).toBe(true);
    expect(todo.proibidos.some((re) => re.test("@/lib/actions/calendar"))).toBe(false);
  });

  it.each(LADOS)("$nome não importa do outro módulo", ({ pastas, proibidos }) => {
    const todos = pastas.flatMap(arquivos);
    expect(todos.length).toBeGreaterThan(5);
    const cruzados = todos.flatMap((arq) =>
      especificadores(arq).filter((s) => proibidos.some((re) => re.test(s))).map((s) => `${arq} → ${s}`),
    );
    expect(cruzados).toEqual([]);
  });
});
```

  Acrescentar a `CONTRATOS` (bloco "Rotinas e tarefas"):

```ts
  { arquivo: "app/(app)/tarefas/tasks-client.tsx", exige: /aria-pressed=\{active\}/, porque: "chip de projeto anuncia o filtro ativo" },
  { arquivo: "app/(app)/tarefas/tasks-client.tsx", exige: /aria-current=\{day\.isToday \? "date" : undefined\}/, porque: "hoje na semana é anunciado" },
  { arquivo: "app/(app)/tarefas/tasks-client.tsx", exige: /<span className="min-w-0 flex-1 truncate text-sm font-medium">\{r\.name\}/, porque: "regra 2: nome da rotina não empurra o selo" },
  { arquivo: "app/(app)/tarefas/task-form.tsx", exige: /aria-pressed=\{active\}/, porque: "dia da semana anuncia se está marcado" },
  { arquivo: "app/(app)/rotinas/routine-form.tsx", exige: /aria-pressed=\{active\}/, porque: "dia da semana anuncia se está marcado" },
  { arquivo: "app/(app)/rotinas/routine-form.tsx", exige: /aria-pressed=\{field\.value === c\}/, porque: "cor escolhida é anunciada" },
  { arquivo: "app/(app)/tarefas/project-form.tsx", exige: /aria-pressed=\{field\.value === c\}/, porque: "cor escolhida é anunciada" },
  { arquivo: "app/(app)/rotinas/routines-client.tsx", exige: /todays\.length === 0 \? \(\s*<EmptyState/, porque: "seção vazia usa o EmptyState compartilhado" },
  { arquivo: "components/tasks/task-card.tsx", exige: /overdue \? \(\s*<TriangleAlert/, porque: "atrasada tem ícone, não só vermelho" },
  { arquivo: "components/tasks/task-calendar.tsx", exige: /aria-current=\{day\.isToday \? "date" : undefined\}/, porque: "hoje no calendário é anunciado" },
```

- [ ] **Step 2:** rodar os dois → separação PASS (nasce verde; só a M10 prova), contratos novos FAIL.
- [ ] **Step 3: Edições.**
  - `ProjectChip`: `<button type="button" onClick={onClick}` → acrescentar `aria-pressed={active}`; no ramo ativo, `"border-primary bg-primary/10 text-foreground"` → `"border-primary bg-primary/10 font-semibold text-foreground"`.
  - `RoutinesTodayCard` vazio: substituir o `<Card><CardContent …>Nenhuma rotina para hoje. <Link…>` por

```tsx
      <EmptyState
        icon={Repeat}
        title="Nenhuma rotina para hoje"
        description="As rotinas ativas aparecem aqui nos dias em que estão agendadas."
        className="py-8"
      >
        <Button asChild size="sm" variant="outline">
          <Link href="/rotinas">Gerenciar rotinas</Link>
        </Button>
      </EmptyState>
```

  (+ `Repeat` no import do lucide).
  - Linha do nome da rotina: `<span className="flex-1 text-sm font-medium">{r.name}</span>` → `<span className="min-w-0 flex-1 truncate text-sm font-medium">{r.name}</span>`.
  - `WeekView` `<h3 className={cn("text-sm font-medium capitalize", day.isToday && "text-primary")}>` → acrescentar `aria-current={day.isToday ? "date" : undefined}`.
  - Gaveta `Listas`: `<SheetContent className="w-full overflow-y-auto sm:max-w-md">` → `<SheetContent className="overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-md">` (F5: medido 384 → 448).
  - `routines-client.tsx` "Rotinas de hoje": `<p className="rounded-lg border border-dashed …">Nenhuma rotina agendada para hoje.</p>` → `<EmptyState icon={CalendarCheck} title="Nenhuma rotina para hoje" description="As rotinas ativas aparecem aqui nos dias em que estão agendadas." className="py-8" />`.
  - `task-form.tsx` e `routine-form.tsx` (dias): no `<button key={d.value} type="button"` acrescentar `aria-pressed={active}`.
  - `routine-form.tsx` e `project-form.tsx` (cores): no botão "Sem cor" `aria-pressed={!field.value}`; em cada amostra `aria-pressed={field.value === c}`.
  - `routine-form.tsx` passo: `<span className="flex-1">{item.label}</span>` → `<span className="min-w-0 flex-1 break-words">{item.label}</span>`.
  - `task-details.tsx`: ícones de recorrência e vínculo com `shrink-0` e o texto em `<span className="min-w-0 break-words">…</span>`; `cnLine` → `"min-w-0 flex-1 break-words text-sm …"` nos dois ramos.
  - `task-card.tsx` data:

```tsx
            {task.due_date && (
              <span className={cn("inline-flex items-center gap-1", overdue && "text-destructive font-medium")}>
                {overdue ? (
                  <TriangleAlert className="size-3" aria-hidden />
                ) : (
                  <CalendarClock className="size-3" aria-hidden />
                )}
                {formatDate(task.due_date)}
                {overdue && <span className="sr-only"> (atrasada)</span>}
              </span>
            )}
```

  (+ `TriangleAlert` no import).
  - `components/tasks/task-calendar.tsx`: no `<div className={cn("mb-1 inline-flex size-6 …", day.isToday && …)}>` acrescentar `aria-current={day.isToday ? "date" : undefined}`.
- [ ] **Step 4:** `npx vitest run src/test src/components/tasks src/lib/tasks` PASS; `tsc`; `lint`.
- [ ] **Step 5:** build + bundle (`tarefas`, `rotinas`).
- [ ] **Step 6: Commit** `feat(redesign): 07-A V7 — Rotinas e tarefas: estado anunciado, vazio compartilhado e gaveta na largura pedida`.

---

### Task 6c: V7 · TO-DO (+ F5 como teste)

**Files:** `components/todo/todo-nav.tsx:106-118,407,425`, `app/(app)/todo/todo-client.tsx:677,806-825`, `components/todo/task-detail-sheet.tsx:231-233`, `components/todo/task-calendar.tsx:197-203,245-263`, `components/todo/task-row.tsx:164`, `components/todo/badges.tsx:55-64,197-198`; Create `src/components/ui/sheet-largura.test.ts`; extend `CONTRATOS`.

- [ ] **Step 1: Testes.** `src/components/ui/sheet-largura.test.ts`:

```ts
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { semComentarios } from "@/test/links-inline";

/**
 * REDESIGN-07-A · F5 — a largura de uma gaveta lateral precisa do prefixo `data-[side=…]:`.
 *
 * A primitiva (`ui/sheet.tsx`) põe a largura em `data-[side=right]:w-3/4` e
 * `data-[side=right]:sm:max-w-sm`. Um `w-full` ou `sm:max-w-xl` do chamador é OUTRO grupo de
 * variante: o `twMerge` mantém os dois, e o seletor de atributo vence a cascata. Medido no
 * Chrome com o CSS real: o painel de detalhe do TO-DO pedia 576 px e saía com 384. É a regra 1
 * do layout (`cn()` é `twMerge`) num lugar que ela não tinha alcançado.
 */
const SRC = path.resolve(__dirname, "..", "..");

/** Exceções DECLARADAS, com dono — e cada uma tem de continuar violando. */
const EXCECOES = new Map<string, string>([
  ["app/(app)/nutricao/planejamento/planning-client.tsx", "07-B"],
  ["app/(app)/nutricao/refeicoes/meal-templates-client.tsx", "07-B"],
  ["components/nutrition/food-detail-sheet.tsx", "07-B"],
  ["components/nutrition/recipe-detail-sheet.tsx", "07-B"],
  ["components/training/exercise-detail-sheet.tsx", "07-C"],
  ["components/training/workout-exercise-sheet.tsx", "07-C"],
  ["components/layout/mobile-nav.tsx", "casca — fora da 07-A"],
  ["components/shared/module-shell.tsx", "compartilhado por Dieta, Treinos e IA — 07-B/C/D"],
]);

/** Texto da abertura `<SheetContent …>` a partir de `i`, respeitando `{…}` e aspas. */
function tag(fonte: string, i: number): string {
  let prof = 0;
  let aspa: string | null = null;
  for (let j = i; j < fonte.length; j++) {
    const c = fonte[j];
    if (aspa) { if (c === aspa) aspa = null; continue; }
    if (c === '"' || c === "'" || c === "`") aspa = c;
    else if (c === "{") prof++;
    else if (c === "}") prof--;
    else if (c === ">" && prof === 0) return fonte.slice(i, j);
  }
  return fonte.slice(i);
}

/** Classes de largura SEM o prefixo de lado nas gavetas laterais do texto. */
export function larguraSemPrefixo(fonte: string): string[] {
  const achadas: string[] = [];
  for (const m of fonte.matchAll(/<SheetContent\b/g)) {
    const t = tag(fonte, m.index);
    const lado = t.match(/\bside="(\w+)"/)?.[1] ?? "right"; // padrão da primitiva
    if (lado !== "left" && lado !== "right") continue;
    const classes = [...t.matchAll(/className=(?:"([^"]*)"|\{[^}]*?"([^"]*)")/g)].map((c) => c[1] ?? c[2]).join(" ");
    for (const cls of classes.split(/\s+/)) {
      if (/^(?:[a-z0-9]+:)*(?:max-|min-)?w-/.test(cls) && !cls.startsWith("data-[side=")) achadas.push(cls);
    }
  }
  return achadas;
}

function tsxDe(dir: string): string[] {
  return fs.readdirSync(path.join(SRC, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = path.join(dir, e.name).split(path.sep).join("/");
    return e.isDirectory() ? tsxDe(rel) : e.name.endsWith(".tsx") ? [rel] : [];
  });
}

describe("F5 — gaveta lateral: largura só com o prefixo de lado", () => {
  it("a varredura sabe dizer sim e não (fixture)", () => {
    expect(larguraSemPrefixo('<SheetContent className="w-full overflow-y-auto sm:max-w-xl">')).toEqual(["w-full", "sm:max-w-xl"]);
    expect(larguraSemPrefixo('<SheetContent side="left" className="data-[side=left]:w-[17rem]">')).toEqual([]);
    expect(larguraSemPrefixo('<SheetContent side="bottom" className="max-h-[88vh] w-full">')).toEqual([]);
    expect(larguraSemPrefixo('<SheetContent\n  side="right"\n  className="flex w-full p-0"\n>')).toEqual(["w-full"]);
  });

  it("nenhuma gaveta lateral fora das exceções passa largura morta", () => {
    const arquivos = [...tsxDe("app"), ...tsxDe("components")].filter((a) => a !== "components/ui/sheet.tsx");
    // Sem comentários: `floating-assistant-panel.tsx` tem um bloco `/* … */` DENTRO da tag
    // `<SheetContent>` (explicando justamente este defeito), e ele citaria classes que não existem.
    const violam = arquivos
      .filter((a) => !EXCECOES.has(a))
      .map((a) => [a, larguraSemPrefixo(semComentarios(fs.readFileSync(path.join(SRC, a), "utf8")))] as const)
      .filter(([, cls]) => cls.length > 0)
      .map(([a, cls]) => `${a}: ${cls.join(" ")}`);
    expect(violam).toEqual([]);
  });

  it.each([...EXCECOES])("a exceção %s ainda viola (%s)", (arquivo) => {
    expect(larguraSemPrefixo(semComentarios(fs.readFileSync(path.join(SRC, arquivo), "utf8"))).length).toBeGreaterThan(0);
  });
});
```

  Acrescentar a `CONTRATOS` (bloco "TO-DO"):

```ts
  { arquivo: "components/todo/todo-nav.tsx", exige: /sticky top-18\b/, porque: "regra 5: com top-4 a coluna escorrega para trás do Header" },
  { arquivo: "components/todo/todo-nav.tsx", exige: /\{danger && <TriangleAlert/, porque: "contagem com atrasadas tem ícone, não só vermelho" },
  { arquivo: "app/(app)/todo/todo-client.tsx", exige: /<PageHeader[^>]*className="[^"]*\bmin-w-0\b/, porque: "regra 2: o título não empurra o botão de navegação" },
  { arquivo: "components/todo/task-calendar.tsx", exige: /aria-current=\{isToday \? "date" : undefined\}/, porque: "hoje no calendário é anunciado" },
  { arquivo: "components/todo/task-calendar.tsx", exige: /\{overdue && <TriangleAlert/, porque: "atrasada no calendário tem ícone" },
  { arquivo: "components/todo/task-row.tsx", exige: /<PriorityFlag[^>]*\brotulo\b/, porque: "prioridade na linha tem a palavra (P1–P3)" },
  { arquivo: "components/todo/badges.tsx", exige: /próximo · /, porque: "prazo próximo é escrito, não só âmbar" },
```

- [ ] **Step 2:** rodar → FAIL (TO-DO ainda viola F5; contratos novos).
- [ ] **Step 3: Edições.**
  - `todo-nav.tsx` `TodoNav`: `"sticky top-4 max-h-[calc(100vh-6rem)] overflow-y-auto pr-1"` → `"sticky top-18 max-h-[calc(100vh-5.5rem)] overflow-y-auto pr-1"`.
  - `todo-nav.tsx` `TodoNavDrawer`: `className="w-[17rem] overflow-y-auto"` → `className="overflow-y-auto data-[side=left]:w-[17rem]"`.
  - `todo-nav.tsx` `NavButton` contagem:

```tsx
        {count !== undefined && count > 0 && (
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[0.7rem] tabular-nums",
              danger ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground",
            )}
          >
            {danger && <TriangleAlert className="size-3" aria-hidden />}
            {count}
            {danger && <span className="sr-only">, com atrasadas</span>}
          </span>
        )}
```

  (+ `TriangleAlert` no import do lucide).
  - `todo-client.tsx`: `<PageHeader title={headerInfo.title} description={headerInfo.description} className="flex-1">` → `className="min-w-0 flex-1"`.
  - `todo-client.tsx` alternador só-ícone (T8): no ramo ativo `"bg-primary/15 text-primary"` → `"bg-primary/15 text-primary shadow-[inset_0_-2px_0_currentColor]"` (barra de 2 px: forma, não matiz). ⚠️ `shadow` some em modo de cores forçadas; ali o `aria-pressed` segue anunciando.
  - `task-detail-sheet.tsx`: `className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-xl"` → `className="flex flex-col gap-0 overflow-y-auto p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-xl"`.
  - `components/todo/task-calendar.tsx`: `<span className={cn("grid size-5 …", isToday && …)}>` → acrescentar `aria-current={isToday ? "date" : undefined}`; em `CalendarTask`, antes do `●`: `{overdue && <TriangleAlert className="size-3 shrink-0 text-destructive" aria-label="Atrasada" />}` (+ import).
  - `badges.tsx` `PriorityFlag` ganha `rotulo`:

```tsx
/** Bandeira da prioridade. Com `rotulo`, P1–P3 ganham a palavra curta ao lado (P4 é a padrão). */
export function PriorityFlag({
  priority,
  className,
  rotulo = false,
}: {
  priority: TodoPriority;
  className?: string;
  rotulo?: boolean;
}) {
  const bandeira = <Flag className={cn("size-4", TODO_PRIORITY_FLAG[priority], !rotulo && className)} aria-hidden />;
  if (!rotulo) return bandeira;
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)} title={TODO_PRIORITY_LABELS[priority]}>
      {bandeira}
      {priority < 4 && (
        <span className="text-[0.7rem] font-semibold leading-none text-muted-foreground">
          {TODO_PRIORITY_SHORT[priority]}
        </span>
      )}
    </span>
  );
}
```

  - `task-row.tsx`: `<PriorityFlag priority={task.priority} className="mt-0.5 shrink-0" />` → `<PriorityFlag priority={task.priority} className="mt-0.5 shrink-0" rotulo />`.
  - `badges.tsx` `DeadlineChip`: `Prazo {vencido ? "vencido" : formatDate(deadlineIso)}` → `Prazo {vencido ? "vencido" : proximo ? \`próximo · ${formatDate(deadlineIso)}\` : formatDate(deadlineIso)}`.
- [ ] **Step 4:** `npx vitest run src/test src/components src/lib/todo` PASS; `tsc`; `lint`.
- [ ] **Step 5:** build + bundle (`todo` ≤ 250).
- [ ] **Step 6: Commit** `feat(redesign): 07-A V7 — TO-DO: coluna sob o Header, painel na largura pedida e prioridade escrita`.

---

### Task 7: Mutações M1–M16 e os cinco comandos

- [ ] **Step 1:** Para cada mutação: aplicar sozinha → `npx tsc --noEmit` (tem de compilar) → `npx vitest run <arquivos de teste envolvidos>` → registrar os **nomes** dos testes que caem → restaurar com `git checkout -- <arquivo>` → `git diff --quiet` (exit 0). Se sair verde, medir antes de concluir (D28).

| # | Mutação concreta |
| --- | --- |
| M1 | `seletor-de-visao.tsx`: remover `aria-pressed={ativa}` |
| M2 | `agenda-client.tsx`: devolver o bloco `CALENDAR_VIEWS.map((v) => (<button …>…</button>))` no lugar do componente |
| M3 | `lib/tasks/constants.ts`: `TASK_VIEWS = ([…] as const).filter((v) => v !== "atrasadas")` (tipo intacto, compila) |
| M4 | `todo/resolve-route.ts`: remover a linha `if (v === "projeto" && id) …` |
| M5 | `active.ts`: `rotasDeclaradas` devolve só `[href]` |
| M6 | `nav.ts`: Agenda ganha `tambem: ["/tarefas"]` |
| M7 | `nav.ts`: `href: "/rotinas"` → `"/rotina"` |
| M8 | `configuracoes/page.tsx`: acrescentar `import { AgendaClient } from "@/app/(app)/agenda/agenda-client";` + `void AgendaClient;` (compila; o arquivo movido não existe mais em `agenda/`) |
| M9 | `search/types.ts`: `tarefa: "Tarefas (Fase 09)"` |
| M10 | `components/tasks/task-card.tsx`: `import { TODO_PRIORITY_FLAG } from "@/lib/todo/constants";` + `void TODO_PRIORITY_FLAG;` |
| M11 | `links-inline.ts`: voltar a `/\blink\s*:/g` |
| M12 | `abas-de-rota.tsx`: remover `aria-label={rotulo}` |
| M13 | `nav.ts`: `tambem: ["/tarefa"]` |
| M14 | `task-detail-sheet.tsx`: voltar a `… p-0 sm:max-w-xl` sem prefixo |
| M15 | `todo-nav.tsx`: `sticky top-18` → `sticky top-4` |
| M16 | `seletor-de-visao.tsx`: remover `{ativa && <MarcaDeAtiva />}` |

- [ ] **Step 2:** Os cinco comandos: `npm run test:run` (esperado: única falha a de ambiente), `npm run lint`, `npx tsc --noEmit`, `npm run build`, `npm run perf:bundle`; rotas da §1 antes × depois; `TZ=UTC npx vitest run <testes tocados>`.
- [ ] **Step 3:** Inspeção visual real: conferir que as classes do gerador da prévia (scratchpad) são as do código final (`seletor-de-visao.tsx`, `abas-de-rota.tsx`, `nav-links.tsx`), ajustar o que divergir, recompilar o `globals.css` real e refotografar claro/escuro × 1280/390 (390 via `iframe`), com o foco de teclado visível.
- [ ] **Step 4:** Commit final só se houver ajuste; relatório de entrega.
