# REDESIGN-07-B — Hábitos e Estudos · Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mudar a aparência, o anúncio de estado e o carregamento de `/habitos`, `/estudos` e `/estudos/[id]` sem mudar nenhum dado nem nenhuma conta — cada correção presa por um teste confirmado por mutação.

**Architecture:** Server Component lê → `*-client.tsx` renderiza. Diálogos de formulário passam a `next/dynamic` + `useLazyDialog`; estado anunciado por `aria-*` e texto `sr-only`; o contrato com a tela é provado por **varredura do código-fonte sem comentários** (invariante 25 — o projeto não tem teste de componente). Uma única regra pura nova (`refleteOsTreinos`) e funções puras de rótulo acessível, todas testadas.

**Tech Stack:** Next.js 16 (Turbopack), React, Tailwind v4 CSS-first, shadcn/Radix, react-hook-form, Vitest (ambiente `node`).

**Spec:** `docs/superpowers/specs/2026-10-11-07b-habitos-estudos-design.md` (aprovado em 2026-10-11). Em caso de conflito, o spec vence.

## Global Constraints

- Worktree `C:\Users\Yuri\Documents\Desenvolvedor\yuri.app.pessoal-07b`, branch `feat/redesign-07b-habitos-estudos`. Nada na pasta principal nem no worktree da 07-A.
- ⛔ Nenhuma migration; nenhuma coluna de origem em `habit_logs`; nenhum caminho novo de escrita.
- ⛔ Intocados: `src/lib/training/habit-sync.ts`; o upsert de `src/lib/habits/services.ts:73-83`; `recomputeCourseStats`, `totalMinutes`, `minutesInRange`, streaks; `components/financeiro/form-utils.ts`.
- ⛔ Só leitura: `src/lib/{finance,notifications,ai,dashboard,reports}/**`, `src/lib/search/queries.ts`, `src/app/(app)/dashboard/**`, `src/app/(app)/financeiro/page.tsx`, `src/app/(app)/financeiro/contas/**`, `src/app/(app)/{nutricao,treinos}/**`, `src/components/{nutrition,training}/**`, `src/lib/{nutrition,training}/**`.
- ⛔ Não tocar `floating-assistant*.tsx`, `DASH_CARD_IDS`, casca, `nav.ts`, `docs/redesign/STATUS.md`.
- ⛔ Nenhuma rota morre; `/habitos?view=`, `/estudos?view=`, `/estudos/[id]` continuam aceitos; `HABIT_VIEWS`/`STUDY_VIEWS` não mudam.
- Bundle: `/(app)/habitos` < 239,3; `/(app)/estudos` ≤ 218,9; `/(app)/estudos/[id]` ≤ 223,6; `/(app)/configuracoes` ≤ 285 sem subir o teto; nenhuma rota fora de 250.
- `next/dynamic`: segundo argumento **objeto literal escrito ali mesmo**.
- Varreduras usam `semComentarios` de `@/test/links-inline`. Nenhum segundo extrator de links.
- Commits: título pt-BR sem acentos `feat(redesign): 07-B …` / `test(redesign): 07-B …`; corpo com o que mudou/não mudou, testes, bundle (quando runtime), `summary_line` do roteador, o que ficou de fora; termina com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Cada passo: `npx vitest run <dirs tocados>`, `npx tsc --noEmit`, `npx eslint <arquivos tocados>`, `git diff` revisado (nada de `.env`, chave, token, `service_role`). Não editar arquivo durante build nem durante dispatch do roteador.
- Única falha aceita na suíte: `src/lib/ai/approval/schema.test.ts › as travas que o código não pode contornar › a FK da aprovação carrega o hash, amarrando-o ao effect_hash da proposta` (CRLF do worktree).

## Review Focus

1. **Hoje fora da janela** — o `todayIso` do servidor não casa com nenhuma célula/dia (virada do dia entre leituras): nenhuma célula ganha `aria-current`, nada quebra. Teste em `rotulos-acessiveis.test.ts` (Task 7).
2. **Singular/plural** — "1 de 1 concluído", "0 de 2 concluídos", "1 dia seguido", "6 dias seguidos". Teste em `rotulos-acessiveis.test.ts` (Tasks 7 e 9).
3. **Dia sem hábitos agendados × 0%** — `scheduled === 0` diz "sem hábitos agendados", nunca "0 de 0". Teste em `rotulos-acessiveis.test.ts` (Task 7).
4. **Água com meta 0 ou valor fracionário** — "1,5 de 2 L", sem "meta batida" quando `done` é falso; meta 0 não vira "NaN". Teste em `rotulos-acessiveis.test.ts` (Task 7).
5. **Vínculo desligado ou apontando para outro hábito** — `habitId` nulo ⇒ nenhum selo em lugar nenhum. Teste em `vinculo-treinos.test.ts` (Task 8).

---

### Task 1: Rótulos de exceção em `sheet-largura.test.ts`

**Files:**
- Modify: `src/components/ui/sheet-largura.test.ts:19-22,26`

- [ ] **Step 1:** Contar os casos antes: `npx vitest run src/components/ui/sheet-largura.test.ts` (anotar N).
- [ ] **Step 2:** Trocar `"07-B"` → `"07-C"` nas 4 linhas de Dieta (`planning-client`, `meal-templates-client`, `food-detail-sheet`, `recipe-detail-sheet`) e `"compartilhado por Dieta, Treinos e IA — 07-B/C/D"` → `"compartilhado por Dieta, Treinos e IA — 07-C/D"`.
- [ ] **Step 3:** Rodar de novo: mesmo N, verde.
- [ ] **Step 4:** Commit `test(redesign): 07-B — rotulos das excecoes de gaveta apontam para a 07-C`.

### Task 2: V4 — contrato da query string de `/habitos` e `/estudos`

**Files:**
- Modify: `src/test/deep-links-query-string.test.ts`

**Interfaces:**
- Consumes: `lerLinks`, `VALOR_DE_EXEMPLO`, `PontoDeLink` de `@/test/links-inline`; `HABIT_VIEWS` de `@/lib/habits/constants`; `STUDY_VIEWS` de `@/lib/studies/constants`.

- [ ] **Step 1: Estender as rotas**

```ts
const ROTAS = ["/tarefas", "/agenda", "/todo", "/rotinas", "/habitos", "/estudos/[id]"] as const;
type Rota = (typeof ROTAS)[number];
/** Rotas com visão declarada que HOJE não recebem link nenhum (G9). Link novo ⇒ vai para ROTAS com piso. */
const SEM_LINK_HOJE = ["/estudos"] as const;
const PISO: Record<Rota, number> = {
  "/todo": 8, "/tarefas": 3, "/agenda": 2, "/rotinas": 1, "/habitos": 3, "/estudos/[id]": 2,
};
/** Caminho concreto → rota declarada. `[id]` é o único segmento dinâmico coberto. */
function rotaDe(concreta: string): string {
  const c = concreta.split(/[?#]/)[0];
  return /^\/estudos\/[^/]+$/.test(c) ? "/estudos/[id]" : c;
}
```

`caminho(p)` passa a ser `rotaDe(p.concreta)`. `lidosPela(rota)` continua lendo `app/(app)/<rota>/page.tsx` (`"/estudos/[id]".slice(1)` = `estudos/[id]`).

- [ ] **Step 2: View de Hábitos e de Estudos**

```ts
/** A view literal do link pertence à lista da página? `null` = não há view literal a checar. */
function viewAceita(literal: string, visoes: readonly string[]): boolean | null {
  const view = query(literal).get("view");
  if (view === null || view.includes("${")) return null;
  return visoes.includes(view);
}

it.each(PONTOS.filter((p) => caminho(p) === "/habitos"))("$arquivo:$linha → $literal — view de Hábitos", (p) => {
  const ok = viewAceita(p.literal, HABIT_VIEWS);
  if (ok === null) return;
  expect(ok, `${onde(p)}: \`${query(p.literal).get("view")}\` não está em HABIT_VIEWS`).toBe(true);
});

it("/estudos não recebe link hoje — o primeiro que aparecer exige piso (G9)", () => {
  for (const rota of SEM_LINK_HOJE) expect(PONTOS_TODOS.filter((p) => rotaDe(p.concreta) === rota)).toEqual([]);
});

it("a checagem de STUDY_VIEWS sabe dizer sim e não (fixture)", () => {
  expect(viewAceita("/estudos?view=cursos", STUDY_VIEWS)).toBe(true);
  expect(viewAceita("/estudos?view=inexistente", STUDY_VIEWS)).toBe(false);
  expect(viewAceita("/estudos", STUDY_VIEWS)).toBeNull();
});
```

`PONTOS_TODOS` = todos os pontos dos dois arquivos, antes do filtro por `ROTAS`.

- [ ] **Step 3: Cobertura derivada (M2)**

```ts
/** Páginas que validam `sp.view` contra uma constante `*_VIEWS` — derivado do código. */
function paginasComVisao(): string[] {
  const base = path.join(SRC, "app", "(app)");
  const achadas: string[] = [];
  const andar = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) andar(p);
      else if (e.name === "page.tsx") {
        const f = semComentarios(fs.readFileSync(p, "utf8"));
        if (/\bsp\.view\b/.test(f) && /\b[A-Z][A-Z0-9_]*_VIEWS\b/.test(f)) {
          achadas.push("/" + path.relative(base, path.dirname(p)).split(path.sep).join("/"));
        }
      }
    }
  };
  andar(base);
  return achadas.sort();
}

it("toda página que valida `view` está coberta (ROTAS ∪ SEM_LINK_HOJE)", () => {
  const paginas = paginasComVisao();
  expect(paginas.length).toBeGreaterThanOrEqual(5);
  const cobertas = new Set<string>([...ROTAS, ...SEM_LINK_HOJE]);
  for (const p of paginas) expect(cobertas.has(p), `app/(app)${p}/page.tsx valida \`view\` e não está coberta`).toBe(true);
});
```

- [ ] **Step 4:** Ajustar o teste "a leitura do page.tsx sabe dizer sim e não": acrescentar `expect(lidosPela("/habitos")).toEqual(new Set(["view"]))` e `expect(lidosPela("/estudos/[id]").size).toBe(0)`.
- [ ] **Step 5:** `npx vitest run src/test/deep-links-query-string.test.ts` — verde. Conferir que o piso de `/habitos` é 3 e o de `/estudos/[id]` é 2 contando os pontos (se divergir, vale a contagem; dizer no commit).
- [ ] **Step 6:** Commit `test(redesign): 07-B V4 — contrato da query string de Habitos e Estudos`.

### Task 3: D4 — os 8 diálogos sob demanda

**Files:**
- Create: `src/components/studies/module-form-dialog.tsx`, `lesson-form-dialog.tsx`, `vocab-form-dialog.tsx`, `practice-form-dialog.tsx` (corpo **movido** de `course-tree.tsx:353-570`, `vocabulary-view.tsx:234-…` + `toValues`, `practice-view.tsx:223-…`)
- Modify: `src/app/(app)/habitos/habits-client.tsx`, `src/components/habits/{habit-card,water-view,session-view}.tsx`, `src/app/(app)/estudos/studies-client.tsx`, `src/app/(app)/estudos/[id]/course-detail-client.tsx`, `src/components/studies/{course-tree,vocabulary-view,practice-view}.tsx`
- Test: `src/test/habitos-estudos-dialogos.test.ts`

**Interfaces:**
- Produces: `export function ModuleFormDialog`, `LessonFormDialog`, `VocabFormDialog`, `PracticeFormDialog` (mesmas props de hoje).

- [ ] **Step 1: Escrever a varredura (vermelha hoje)**

```ts
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { semComentarios } from "@/test/links-inline";

/**
 * REDESIGN-07-B · D4 — diálogo de formulário entra por `next/dynamic` + `useLazyDialog`.
 * Lê o código (invariante 25). `{aberto && <X/>}` sozinho quebra a animação de fechamento
 * (regra 2 do carregamento sob demanda); import estático põe o formulário no 1º byte da rota.
 */
const SRC = path.resolve(__dirname, "..");
const DIRS = ["app/(app)/habitos", "app/(app)/estudos", "components/habits", "components/studies"];
const DIALOGOS = /^(HabitFormDialog|HabitLogDialog|CourseFormDialog|SessionFormDialog|ModuleFormDialog|LessonFormDialog|VocabFormDialog|PracticeFormDialog)$/;
/** Exceção declarada: recebe o próprio botão por `trigger` — lazy, o botão sumiria. */
const EXCECOES = new Set(["DeleteConfirmDialog"]);

function tsx(dir: string): string[] { /* anda o diretório, devolve caminhos relativos a src */ }

/** Nomes importados POR VALOR (import type não conta). */
export function importsEstaticos(fonte: string): string[] {
  const nomes: string[] = [];
  for (const m of fonte.matchAll(/^import\s+(?!type\b)\{([^}]*)\}\s+from\s+"[^"]+";/gm)) {
    for (const parte of m[1].split(",")) {
      const t = parte.trim();
      if (!t || t.startsWith("type ")) continue;
      nomes.push(t.split(/\s+as\s+/).pop()!.trim());
    }
  }
  return nomes;
}
/** Quantos `dynamic(` carregam um diálogo de formulário e quantos `useLazyDialog(` existem. */
export function contas(fonte: string) {
  const dinamicos = [...fonte.matchAll(/dynamic\(\s*\(\)\s*=>\s*import\([^)]*\)\.then\(\(m\)\s*=>\s*m\.(\w+)\)/g)]
    .filter((m) => DIALOGOS.test(m[1])).length;
  const hooks = (fonte.match(/\buseLazyDialog\(/g) ?? []).length;
  return { dinamicos, hooks };
}

describe("D4 — diálogo de formulário carrega sob demanda", () => {
  it("a varredura sabe dizer sim e não (fixture)", () => {
    expect(importsEstaticos('import { HabitFormDialog } from "./habit-form";')).toEqual(["HabitFormDialog"]);
    expect(importsEstaticos('import type { HabitFormDialog } from "./habit-form";')).toEqual([]);
    expect(contas('const X = dynamic(() => import("./a").then((m) => m.HabitLogDialog), { ssr: false });').dinamicos).toBe(1);
  });
  const arquivos = DIRS.flatMap(tsx);
  it("lê os dois módulos (anti-tautologia)", () => expect(arquivos.length).toBeGreaterThan(25));
  it.each(arquivos)("%s não importa diálogo de formulário estaticamente", (a) => {
    const f = semComentarios(fs.readFileSync(path.join(SRC, a), "utf8"));
    expect(importsEstaticos(f).filter((n) => DIALOGOS.test(n) && !EXCECOES.has(n))).toEqual([]);
  });
  it.each(arquivos)("%s monta cada diálogo lazy atrás de useLazyDialog", (a) => {
    const { dinamicos, hooks } = contas(semComentarios(fs.readFileSync(path.join(SRC, a), "utf8")));
    expect(hooks).toBeGreaterThanOrEqual(dinamicos);
  });
  it("os 8 diálogos são carregados por dynamic em algum lugar", () => {
    const nomes = new Set(arquivos.flatMap((a) =>
      [...semComentarios(fs.readFileSync(path.join(SRC, a), "utf8")).matchAll(/\.then\(\(m\)\s*=>\s*m\.(\w+)\)/g)].map((m) => m[1])));
    for (const d of ["HabitFormDialog","HabitLogDialog","CourseFormDialog","SessionFormDialog","ModuleFormDialog","LessonFormDialog","VocabFormDialog","PracticeFormDialog"]) expect(nomes.has(d), d).toBe(true);
  });
  it("a exceção DeleteConfirmDialog ainda é importada estaticamente (senão sai da lista)", () => {
    expect(arquivos.some((a) => importsEstaticos(semComentarios(fs.readFileSync(path.join(SRC, a), "utf8"))).includes("DeleteConfirmDialog"))).toBe(true);
  });
});
```

(⚠️ Diálogo **definido no próprio arquivo** é pego por "os 8 são carregados por dynamic".)

- [ ] **Step 2:** `npx vitest run src/test/habitos-estudos-dialogos.test.ts` — vermelho (imports estáticos e 0 `dynamic`).
- [ ] **Step 3: Extrair os 4 diálogos internos** — mover o corpo **idêntico** de cada função (e o tipo `*Values`, e `toValues` no caso do vocabulário) para o arquivo novo, com `"use client"` e só os imports que ele usa; `export function`. A visão fica sem a função.
- [ ] **Step 4: Aplicar o molde em cada ponto de montagem**

```tsx
import dynamic from "next/dynamic";
import { useLazyDialog } from "@/components/shared/use-lazy-dialog";

// ⛔ objeto literal escrito ali mesmo (regra 4 do carregamento sob demanda)
const HabitLogDialog = dynamic(() => import("@/components/habits/habit-log-dialog").then((m) => m.HabitLogDialog), { ssr: false });
// no componente:
const logMontado = useLazyDialog(logOpen);
{logMontado && <HabitLogDialog … open={logOpen} onOpenChange={setLogOpen} />}
```

Pontos: `habits-client.tsx:187` (HabitForm), `habit-card.tsx:196`, `water-view.tsx:151`, `session-view.tsx:184` (HabitLog), `studies-client.tsx:145,150` e `course-detail-client.tsx:323,328` (Course, Session), `course-tree.tsx:101,223` (Module, Lesson), `vocabulary-view.tsx:149` (Vocab), `practice-view.tsx:154` (Practice). Tipos usados como prop continuam por `import type`.
- [ ] **Step 5:** `npx vitest run src/test/habitos-estudos-dialogos.test.ts src/components/habits src/components/studies` — verde; `npx tsc --noEmit`; `npx eslint` nos tocados.
- [ ] **Step 6:** `npm run build` e `npm run perf:bundle` (em segundo plano) + `node <scratchpad>/bundle-all.mjs <worktree>`: anotar `/habitos`, `/estudos`, `/estudos/[id]`, `/configuracoes`, mediana. `/habitos` **tem de cair**; os outros dois ≤ antes.
- [ ] **Step 7:** Commit `feat(redesign): 07-B D4 — dialogos de Habitos e Estudos carregam sob demanda` com o bundle antes × depois.

### Task 4: D6 — erros de formulário

**Files:**
- Modify: `src/app/(app)/habitos/habit-form.tsx`, `src/app/(app)/estudos/course-form.tsx`, `src/components/studies/{session-dialog,module-form-dialog,lesson-form-dialog,vocab-form-dialog,practice-form-dialog}.tsx`, `src/components/habits/habit-log-dialog.tsx`
- Test: `src/test/habitos-estudos-formularios.test.ts`

**Interfaces:**
- Consumes: `mapServerFieldErrors(fieldErrors, knownFields): { toSet, orphans }`, `serverErrorMessage(fallback, mapped)` de `@/lib/forms/server-errors`.

- [ ] **Step 1: Varredura (vermelha hoje)**

```ts
const DIRS = ["app/(app)/habitos", "app/(app)/estudos", "components/habits", "components/studies"];
describe("D6 — erro de campo do servidor nunca some", () => {
  const arquivos = DIRS.flatMap(tsx).map((a) => ({ a, f: semComentarios(fs.readFileSync(path.join(SRC, a), "utf8")) }));
  it.each(arquivos.map((x) => x.a))("%s não usa applyFieldErrors", (a) => {
    expect(arquivos.find((x) => x.a === a)!.f).not.toMatch(/\bapplyFieldErrors\b/);
  });
  const leitores = arquivos.filter((x) => /\.fieldErrors\b/.test(x.f));
  it("acha os formulários (anti-tautologia)", () => expect(leitores.length).toBeGreaterThanOrEqual(8));
  it.each(leitores.map((x) => x.a))("%s passa fieldErrors por mapServerFieldErrors", (a) => {
    const f = leitores.find((x) => x.a === a)!.f;
    expect(f).toMatch(/\bmapServerFieldErrors\(/);
    expect(f).toMatch(/\bserverErrorMessage\(/);
  });
});
```

- [ ] **Step 2:** Rodar — vermelho (7 arquivos com `applyFieldErrors`; `HabitLogDialog` não lê `fieldErrors`).
- [ ] **Step 3: Os 7 com RHF** — em cada um, `const FORM_FIELDS = [ …campos registrados na tela… ] as const;` e no `else` do resultado:

```ts
const mapped = mapServerFieldErrors(res.fieldErrors, FORM_FIELDS);
for (const { name, message } of mapped.toSet) setError(name as Path<Values>, { message });
toast.error(serverErrorMessage(res.error, mapped));
```

`FORM_FIELDS` = os `name` que o formulário realmente registra (`register(...)`/`Controller name=`), conferidos no arquivo.
- [ ] **Step 4: `HabitLogDialog`** — `const CAMPOS = ["log_date", "value", "notes"] as const;` + `const [erros, setErros] = React.useState<Partial<Record<(typeof CAMPOS)[number], string>>>({});` zerado ao abrir e ao salvar; no erro:

```ts
const mapped = mapServerFieldErrors(res.fieldErrors, CAMPOS);
setErros(Object.fromEntries(mapped.toSet.map((e) => [e.name.split(".")[0], e.message])));
toast.error(serverErrorMessage(res.error ?? "Não foi possível salvar.", mapped));
```

cada campo: `aria-invalid={erros.value ? true : undefined}` + `aria-describedby={erros.value ? "habit-log-value-erro" : undefined}` e `{erros.value && <p id="habit-log-value-erro" className="text-xs text-destructive">{erros.value}</p>}`. O `|| 0` (G6) **não muda**.
- [ ] **Step 5:** Verde; `src/lib/validators/round-trip.test.ts` continua verde; tsc; eslint.
- [ ] **Step 6:** Commit `feat(redesign): 07-B D6 — erros do servidor destacam o campo ou sobem com o nome`.

### Task 5: H3 + D3 + V1 estendida

**Files:**
- Modify: `src/app/(app)/habitos/habit-form.tsx` (dias 243-261, amostras 338-366), `src/app/(app)/estudos/course-form.tsx` (amostras 339-367), `src/components/studies/vocabulary-view.tsx` (filtros 96-111), `src/app/(app)/habitos/habits-client.tsx` (Power 358-370), `src/app/(app)/estudos/[id]/course-detail-client.tsx` (abas 258-274)
- Modify (teste): `src/components/shared/seletor-de-visao.test.ts`
- Test: `src/test/habitos-estudos-contratos.test.ts` (nasce aqui)

- [ ] **Step 1: V1 estendida (vermelha hoje)** — em `seletor-de-visao.test.ts`, acrescentar `"app/(app)/estudos/[id]/course-detail-client.tsx"` a `TELAS` e:

```ts
/** `.map(` cujo corpo monta botão com a assinatura de alternância e NÃO anuncia o estado. */
function alternanciasMudas(fonte: string): number {
  let n = 0;
  for (const m of fonte.matchAll(/\.\s*map\s*\(/g)) {
    const ini = m.index + m[0].length - 1;
    const fim = fimDoParentese(fonte, ini);
    if (fim < 0) continue;
    const corpo = fonte.slice(ini, fim);
    if (!/<(button|Button)\b/.test(corpo)) continue;
    if (!(/\bbg-primary\b/.test(corpo) && /\btext-primary-foreground\b/.test(corpo))) continue;
    if (!/aria-pressed|aria-current|aria-checked/.test(corpo)) n++;
  }
  return n;
}
const EXCECOES_MUDAS = new Map([["components/dashboard/general/period-toolbar.tsx", "F3 — REDESIGN-06"]]);

describe("V1 estendida — nenhuma alternância montada à mão fica muda", () => {
  it("a varredura sabe dizer sim e não (fixture)", () => {
    expect(alternanciasMudas('{tabs.map((t) => (<button className={t.k === a ? "bg-primary text-primary-foreground" : ""}>{t.l}</button>))}')).toBe(1);
    expect(alternanciasMudas('{tabs.map((t) => (<button aria-pressed={t.k === a} className={t.k === a ? "bg-primary text-primary-foreground" : ""}>{t.l}</button>))}')).toBe(0);
    expect(alternanciasMudas("{xs.map((x) => (<SelectItem key={x}>{x}</SelectItem>))}")).toBe(0);
  });
  it("fora das exceções declaradas, nenhum arquivo tem alternância muda", () => {
    const arquivos = [...tsxDe("app"), ...tsxDe("components")];
    expect(arquivos.length).toBeGreaterThan(200);
    expect(arquivos.filter((a) => !EXCECOES_MUDAS.has(a) && alternanciasMudas(ler(a)) > 0)).toEqual([]);
  });
  it.each([...EXCECOES_MUDAS])("a exceção %s ainda é muda (%s)", (a) => expect(alternanciasMudas(ler(a))).toBeGreaterThan(0));
});
```

`fimDoParentese` passa a olhar até 6000 caracteres (corpos de `.map` de formulário são longos).
- [ ] **Step 2:** Criar `src/test/habitos-estudos-contratos.test.ts` no molde `CONTRATOS` (arquivo × `exige` × `porque`, `semComentarios`, `it.each`), com as linhas deste passo:
  - `habit-form.tsx` exige `/aria-pressed=\{active\}/` (dia anuncia), `/aria-label=\{d\.nome\}/` (dia por extenso), `/role="group"/`, `/aria-pressed=\{field\.value === c\}/` (cor escolhida);
  - `course-form.tsx` exige `/aria-pressed=\{!field\.value\}/` e `/aria-pressed=\{field\.value === c\}/`;
  - `vocabulary-view.tsx` exige `/aria-pressed=\{/`;
  - `habits-client.tsx` exige ``/aria-label=\{\s*h\.is_active\s*\?\s*`Desativar \$\{h\.name\}`/``;
  - `course-detail-client.tsx` exige `/<SeletorDeVisao\b[^>]*rotulo="Seções do curso"/`;
  - foco: `habit-form.tsx` exige `/focus-visible:ring-3/` e `/focus-visible:outline-solid/`; `course-form.tsx` exige `/focus-visible:outline-solid/`.
- [ ] **Step 3:** Rodar os dois — vermelhos.
- [ ] **Step 4: Implementar.**
  - `habit-form.tsx`: `WEEKDAYS` ganha `nome` (`"domingo"`, `"segunda-feira"`, `"terça-feira"`, `"quarta-feira"`, `"quinta-feira"`, `"sexta-feira"`, `"sábado"`); o contêiner dos dias ganha `role="group" aria-labelledby="habit-form-dias"` e o rótulo "Nos dias" ganha `id="habit-form-dias"`; cada botão ganha `aria-pressed={active}`, `aria-label={d.nome}` e `FOCO_DO_SISTEMA = "outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"` nas classes base (aparência em repouso idêntica). Amostras: `aria-pressed={field.value === c}` + `FOCO_DA_AMOSTRA = "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring"`.
  - `course-form.tsx`: amostra "—" ganha `aria-pressed={!field.value}`; as da paleta `aria-pressed={field.value === c}`; todas com `FOCO_DA_AMOSTRA`. (O texto da "—" muda só na Task 10.)
  - `vocabulary-view.tsx`: filtros com `aria-pressed={filter === f.value}` (nome real da variável conferido no arquivo) + `FOCO_DO_SISTEMA`.
  - `habits-client.tsx`: Power com `` aria-label={h.is_active ? `Desativar ${h.name}` : `Ativar ${h.name}`} `` (e `title` igual, se houver).
  - `course-detail-client.tsx`: o bloco de abas vira `<SeletorDeVisao rotulo="Seções do curso" visoes={tabs.map((t) => t.key)} rotulos={ROTULOS_DAS_ABAS} atual={tab} aoEscolher={setTab} />`, com `const ROTULOS_DAS_ABAS: Record<Tab, string> = { conteudo: "Conteúdo", sessoes: "Sessões", idioma: "Idioma" }` e `tabs` virando a lista de chaves (Idioma só se `detail.is_language`).
- [ ] **Step 5:** Verde; tsc; eslint. Varredura toggle-scan no worktree: 10 com assinatura, só `period-toolbar` mudo.
- [ ] **Step 6:** Commit `feat(redesign): 07-B — alternancias anunciam o estado e abas do curso usam o seletor`.

### Task 6 (parte da 7 no spec): rótulos acessíveis puros

**Files:**
- Create: `src/components/habits/rotulos-acessiveis.ts`, `src/components/habits/rotulos-acessiveis.test.ts`

**Interfaces:**
- Produces:
  - `textoDaCelula(cell: { date: string; done: number; scheduled: number }, hoje: string): string`
  - `textoDoDiaDaAgua(d: { date: string; value: number; done: boolean }, hoje: string, meta: number, unidade: string): string`
  - `textoDaSequencia(count: number): string` → `" dia seguido"` | `" dias seguidos"`
  - `ehHoje(date: string, hoje: string): boolean`

- [ ] **Step 1: Teste**

```ts
import { describe, expect, it } from "vitest";
import { ehHoje, textoDaCelula, textoDaSequencia, textoDoDiaDaAgua } from "./rotulos-acessiveis";

describe("rótulos acessíveis de Hábitos (texto, não cor)", () => {
  it("célula com hábitos", () => {
    expect(textoDaCelula({ date: "2026-10-09", done: 2, scheduled: 3 }, "2026-10-11")).toBe("09/10/2026 — 2 de 3 concluídos");
    expect(textoDaCelula({ date: "2026-10-09", done: 1, scheduled: 1 }, "2026-10-11")).toBe("09/10/2026 — 1 de 1 concluído");
    expect(textoDaCelula({ date: "2026-10-09", done: 0, scheduled: 2 }, "2026-10-11")).toBe("09/10/2026 — 0 de 2 concluídos");
  });
  it("sem hábitos agendados não é 0%", () => {
    expect(textoDaCelula({ date: "2026-10-05", done: 0, scheduled: 0 }, "2026-10-11")).toBe("05/10/2026 — sem hábitos agendados");
  });
  it("hoje é dito", () => {
    expect(textoDaCelula({ date: "2026-10-11", done: 1, scheduled: 2 }, "2026-10-11")).toBe("11/10/2026, hoje — 1 de 2 concluídos");
  });
  it("hoje fora da janela: ninguém é hoje", () => {
    expect(ehHoje("2026-10-11", "2026-10-12")).toBe(false);
    expect(textoDaCelula({ date: "2026-10-11", done: 1, scheduled: 2 }, "2026-10-12")).not.toMatch(/hoje/);
  });
  it("dia da água", () => {
    expect(textoDoDiaDaAgua({ date: "2026-10-11", value: 1.5, done: false }, "2026-10-11", 2, "L")).toBe("11/10/2026, hoje — 1,5 de 2 L");
    expect(textoDoDiaDaAgua({ date: "2026-10-10", value: 2.25, done: true }, "2026-10-11", 2, "L")).toBe("10/10/2026 — 2,25 de 2 L, meta batida");
    expect(textoDoDiaDaAgua({ date: "2026-10-10", value: 0, done: false }, "2026-10-11", 0, "copos")).toBe("10/10/2026 — 0 de 0 copos");
  });
  it("sequência no singular e no plural", () => {
    expect(textoDaSequencia(1)).toBe(" dia seguido");
    expect(textoDaSequencia(6)).toBe(" dias seguidos");
  });
});
```

- [ ] **Step 2:** Vermelho (módulo não existe).
- [ ] **Step 3: Implementar** — sem imports além de `formatDate` (`@/lib/format`, data pura como texto) e `formatAmount` (`@/lib/habits/constants`).

```ts
import { formatDate } from "@/lib/format";
import { formatAmount } from "@/lib/habits/constants";

export const ehHoje = (date: string, hoje: string) => date === hoje;
const quando = (date: string, hoje: string) => `${formatDate(date)}${ehHoje(date, hoje) ? ", hoje" : ""}`;

export function textoDaCelula(cell: { date: string; done: number; scheduled: number }, hoje: string): string {
  if (cell.scheduled === 0) return `${quando(cell.date, hoje)} — sem hábitos agendados`;
  return `${quando(cell.date, hoje)} — ${cell.done} de ${cell.scheduled} ${cell.scheduled === 1 ? "concluído" : "concluídos"}`;
}
export function textoDoDiaDaAgua(d: { date: string; value: number; done: boolean }, hoje: string, meta: number, unidade: string): string {
  return `${quando(d.date, hoje)} — ${formatAmount(d.value)} de ${formatAmount(meta)} ${unidade}${d.done ? ", meta batida" : ""}`;
}
export const textoDaSequencia = (count: number) => (count === 1 ? " dia seguido" : " dias seguidos");
```

- [ ] **Step 4:** Verde; `TZ=UTC npx vitest run src/components/habits/rotulos-acessiveis.test.ts` verde. (Entra no commit da Task 7.)

### Task 7: D2 — heatmap e semana

**Files:**
- Modify: `src/components/habits/habit-heatmap.tsx`, `src/components/habits/consistency-view.tsx` (passa `hoje`), `src/components/habits/water-view.tsx` (`WeekStrip`), `src/app/(app)/habitos/habits-client.tsx` (repassa `todayIso`)
- Modify (teste): `src/test/habitos-estudos-contratos.test.ts`

**Interfaces:**
- Consumes: Task 6.
- Produces: `HabitHeatmap({ cells, hoje }: { cells: HabitHeatCell[]; hoje: string })`.

- [ ] **Step 1: Contratos (vermelhos)** — acrescentar:
  - `habit-heatmap.tsx`: `/<ol\b[^>]*aria-label="Consistência diária das últimas 15 semanas"/`; `/aria-current=\{ehHoje\(cell\.date, hoje\) \? "date" : undefined\}/`; `/<span className="sr-only">\{textoDaCelula\(cell, hoje\)\}<\/span>/`; `/border-dashed/`; `/aria-label="Legenda"/`; `/Sem hábitos/`.
  - `water-view.tsx`: `/<ol\b[^>]*aria-label="Últimos 7 dias"/`; `/aria-current=\{ehHoje\(d\.date, hoje\) \? "date" : undefined\}/`; `/<span className="sr-only">\{textoDoDiaDaAgua\(/`; `/meta batida/`.
- [ ] **Step 2: Implementar heatmap** — `cellClass` com as mesmas faixas; `scheduled === 0` → `"border border-dashed border-muted-foreground/50"` (sem `ring` nem fundo); demais → `"ring-1 ring-inset ring-border/40"` + `cellClass`; hoje → `+ "ring-2 ring-foreground ring-offset-1 ring-offset-card"`. Grade: `<ol aria-label=… className="grid grid-flow-col grid-rows-7 gap-1" style={{ gridAutoColumns: "minmax(0, 1fr)" }}>`; enchimento `<li aria-hidden="true" className="aspect-square rounded-[3px]" />`; célula `<li title={…} aria-current={…} className={cn("aspect-square rounded-[3px]", …)}><span className="sr-only">{textoDaCelula(cell, hoje)}</span></li>`. Legenda `<ul aria-label="Legenda" className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-xs text-muted-foreground">` com 7 itens (amostra `aria-hidden` + texto): Sem hábitos · 0% · até 34% · até 67% · até 99% · 100% · Hoje. `title` mantido.
- [ ] **Step 3: Implementar semana** — `WeekStrip` recebe `hoje`; `<ol aria-label="Últimos 7 dias" className="grid grid-cols-7 gap-1.5">`, cada `<li aria-current=…>`; a trilha de hoje ganha `ring-2 ring-foreground ring-offset-1 ring-offset-card`; rótulo do dia `font-semibold text-foreground` em hoje; meta batida: `<Check aria-hidden className="size-2.5" />` antes do número; `<span className="sr-only">{textoDoDiaDaAgua(d, hoje, habit.target_value, habit.unit)}</span>`; legenda `✓ meta batida · ◯ hoje` (`aria-hidden`, o texto já diz). Altura/cor da barra **iguais**.
- [ ] **Step 4:** Verde; tsc; eslint.
- [ ] **Step 5:** Commit `feat(redesign): 07-B D2 — heatmap e semana da agua dizem o estado sem depender da cor` (inclui Task 6).

### Task 8: D1 — o hábito que reflete os treinos

**Files:**
- Create: `src/lib/habits/vinculo-treinos.ts`, `src/lib/habits/vinculo-treinos.test.ts`, `src/components/habits/vinculo-treinos.tsx`
- Modify: `src/app/(app)/habitos/page.tsx`, `habits-client.tsx`, `src/components/habits/{habit-card,water-view,session-view}.tsx`
- Modify (teste): `src/test/habitos-estudos-contratos.test.ts`

**Interfaces:**
- Produces: `refleteOsTreinos(habitId: string, habitoVinculadoId: string | null): boolean`; `SeloReflexoDosTreinos()`, `AvisoReflexoDosTreinos()`.

- [ ] **Step 1: Teste puro**

```ts
import { describe, expect, it } from "vitest";
import { refleteOsTreinos } from "./vinculo-treinos";

describe("refleteOsTreinos — o hábito é o vinculado aos Treinos?", () => {
  it("o vinculado reflete", () => expect(refleteOsTreinos("h1", "h1")).toBe(true));
  it("vínculo desligado (null): ninguém reflete", () => expect(refleteOsTreinos("h1", null)).toBe(false));
  it("outro hábito não reflete", () => expect(refleteOsTreinos("h2", "h1")).toBe(false));
});
```

- [ ] **Step 2:** Vermelho.
- [ ] **Step 3:** `export function refleteOsTreinos(habitId: string, habitoVinculadoId: string | null): boolean { return habitoVinculadoId !== null && habitId === habitoVinculadoId; }` com cabeçalho dizendo o que o reflexo faz (17-F, invariante 20) e que a regra é só leitura.
- [ ] **Step 4: Peça de tela** `components/habits/vinculo-treinos.tsx`: `SeloReflexoDosTreinos` = `<Badge variant="outline" className="gap-1 text-muted-foreground"><Dumbbell aria-hidden />Reflete os treinos</Badge>`; `AvisoReflexoDosTreinos` = `<p className="text-xs text-muted-foreground">` com a frase exata do spec §5.7 e `<Link href="/treinos/configuracoes" className="underline underline-offset-2 hover:text-foreground">Ver o vínculo em Treinos</Link>`.
- [ ] **Step 5: Ligar** — `page.tsx`: `const [dashboard, treinos] = await Promise.all([getHabitsDashboard(todayIso), getTrainingPreferences()]);` → `<HabitsClient … habitoVinculadoId={treinos.habitId} />`; `HabitsClient` repassa a `HabitCard`, `WaterView`/`WaterCard`, `SessionView`/`SessionCard` e usa em `ManageView` (só selo). Cada cartão: `const reflete = refleteOsTreinos(habit.id, habitoVinculadoId);` → `{reflete && <SeloReflexoDosTreinos />}` junto aos selos e `{reflete && <AvisoReflexoDosTreinos />}` sob a descrição.
- [ ] **Step 6: Contratos** — `habitos/page.tsx` exige `/getTrainingPreferences\(\)/`; `habit-card.tsx`, `water-view.tsx`, `session-view.tsx` exigem `/refleteOsTreinos\(/` e `/<AvisoReflexoDosTreinos\s*\/>/`; `habits-client.tsx` exige `/<SeloReflexoDosTreinos\s*\/>/`; `vinculo-treinos.tsx` exige `/apagado \(com a observação\)/` e `/href="\/treinos\/configuracoes"/`.
- [ ] **Step 7:** Verde; tsc; eslint; build + bundle (a consulta é de servidor; o bundle não deve subir além de ~1 KB).
- [ ] **Step 8:** Commit `feat(redesign): 07-B D1 — habito vinculado aos Treinos diz o que o vinculo faz`.

### Task 9: Alinhamento visual — Hábitos

**Files:** `src/app/(app)/habitos/habits-client.tsx`, `src/components/habits/{badges,habit-card,session-view,consistency-view,consistency-chart}.tsx`, contratos.

- [ ] **Step 1: Contratos (vermelhos)**:
  - `habits-client.tsx`: vazio de hoje `/\.length === 0 \? \(\s*<EmptyState/`; alerta `/min-w-0/` no texto do alerta de esquecidos.
  - `consistency-view.tsx`: `/<EmptyState\b/` no ranking vazio.
  - `badges.tsx` (hábitos): `/aria-label=\{rotulo\}/` na barra; `/rotulo: string;/`; `/<span className="sr-only">\{textoDaSequencia\(count\)\}<\/span>/`; selo **sem** `style={{ color` no `Badge` (contrato negativo em teste à parte: `expect(fonte).not.toMatch(/<Badge[^>]*style=\{\{\s*color/)`).
  - `habit-card.tsx`, `session-view.tsx`: `/flex flex-wrap items-center justify-between gap-x-3 gap-y-0\.5/`.
  - `consistency-chart.tsx`: `/<table className="sr-only">/`; `consistency-chart-impl.tsx` **não** contém `sr-only`.
- [ ] **Step 2: Implementar** — EmptyState (`className="py-8"` em seção; `"border-0 bg-transparent py-6"` em card) com ícone e título já usados no `<p>` (texto mantido); `HabitProgressBar` ganha `rotulo: string` e `aria-label={rotulo}` (`` `Progresso de ${habit.name}` `` nos 2 usos); `StreakFlame` com `{count}<span className="sr-only">{textoDaSequencia(count)}</span>`; `HabitCategoryBadge` sem `style` de cor no `Badge` (ponto mantém); `min-w-0`; linhas de valor com `flex-wrap`; fachada do gráfico com `<table className="sr-only"><caption>Consistência por semana</caption><thead><tr><th scope="col">Semana</th><th scope="col">Concluídos</th></tr></thead><tbody>{props.weekly.map((w) => <tr key={w.weekStart}><th scope="row">{w.label}</th><td>{w.done} de {w.scheduled} ({Math.round(w.rate * 100)}%)</td></tr>)}</tbody></table>` (só apresentação do `rate` já calculado).
- [ ] **Step 3:** Verde; tsc; eslint. Commit `feat(redesign): 07-B — Habitos: vazio compartilhado, barras com nome e selos legiveis`.

### Task 10: Alinhamento visual — Estudos

**Files:** `src/app/(app)/estudos/studies-client.tsx`, `src/app/(app)/estudos/course-form.tsx`, `src/components/studies/{badges,course-card,practice-view,vocabulary-view,evolution-chart}.tsx`, contratos.

- [ ] **Step 1: Contratos (vermelhos)**: `studies-client.tsx` três vazios com `<EmptyState`; `practice-view.tsx` e `vocabulary-view.tsx` `<EmptyState`; `studies/badges.tsx` `/aria-label=\{rotulo\}/` + sem `style={{ color` no `Badge`; `course-form.tsx` `/aria-label="Sem cor própria \(usa a cor de destaque\)"/` e **não** `/Cor padrão da categoria/`; `evolution-chart.tsx` `/<table className="sr-only">/` e o `-impl` sem `sr-only`.
- [ ] **Step 2: Implementar** — EmptyState; `StudyProgressBar` com `rotulo` obrigatório (6 usos: `` `Progresso de ${c.title}` `` etc.; prática: `` `Progresso da meta semanal de ${skill}` `` conforme o texto da tela); `DotBadge` sem `style` de cor no `Badge`; rótulo da amostra "—"; fachada do gráfico com tabela `Semana × formatMinutes(w.minutes)` (import de `@/lib/studies/constants`).
- [ ] **Step 3:** Verde; tsc; eslint; Commit `feat(redesign): 07-B — Estudos: vazio compartilhado, barras com nome e selos legiveis`.

### Task 11: Alinhamento visual — Curso

**Files:** `src/app/(app)/estudos/[id]/course-detail-client.tsx`, `src/components/studies/course-tree.tsx`, contratos.

- [ ] **Step 1: Contratos (vermelhos)**: `course-detail-client.tsx` vazio de sessões com `<EmptyState`; `course-tree.tsx` `` /aria-label=\{`Concluir \$\{lesson\.title\}`\}/ ``; e o contrato que **declara** a exceção: `course-tree.tsx` mantém a dica de módulo vazio como `<p` (critério da 07-A — dica em linha dentro de lista).
- [ ] **Step 2: Implementar**; build + bundle das três rotas.
- [ ] **Step 3:** Verde; tsc; eslint; Commit `feat(redesign): 07-B — Curso: sessoes vazias compartilhadas e aula nomeada no checkbox`.

### Task 12: Mutações, verificação final e prévia

- [ ] **Step 1:** Para cada mutação M1–M14 do spec §6: aplicar sozinha → `npx tsc --noEmit` (tem de compilar) → `npx vitest run <testes envolvidos>` → registrar os **nomes** dos testes que caem → `git restore <arquivo>` → `git diff --quiet` (exit 0). Mutação verde = medir antes de concluir (D28).
- [ ] **Step 2:** Os cinco comandos (`test:run`, `lint`, `tsc`, `build`, `perf:bundle`) + `bundle-all.mjs`; `TZ=UTC npx vitest run` nos testes tocados.
- [ ] **Step 3:** Reconferir o gerador da prévia contra as classes do código final, recompilar o `globals.css` real, refotografar claro/escuro × 1280/390 com foco visível; conferir as fotos.
- [ ] **Step 4:** Entrega (sem commit novo se nada mudou; se a prévia apontar defeito, corrigir em commit próprio).
