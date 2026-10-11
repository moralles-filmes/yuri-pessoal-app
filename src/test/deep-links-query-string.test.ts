/**
 * REDESIGN-07-A · V4 — O PARÂMETRO DO DEEP-LINK É ACEITO PELA PÁGINA.
 *
 * O R4 (`deep-links-inline.test.ts`) prova que o CAMINHO do link tem `page.tsx`. Ele não
 * olha a query string: `/tarefas?view=atrasadas` passaria mesmo se `atrasadas` saísse de
 * `TASK_VIEWS`, e a notificação abriria a visão padrão em silêncio. É o defeito que a 07-A
 * pode produzir mexendo nas telas de Organização — por isso o contrato nasce antes delas.
 * A 07-B o estendeu a `/habitos` e `/estudos`.
 *
 * Usa o MESMO extrator do R4 (`@/test/links-inline`), e os dois arquivos varridos são da
 * 03-B2: aqui eles são só LIDOS.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { lerLinks, VALOR_DE_EXEMPLO, semComentarios, type PontoDeLink } from "@/test/links-inline";
import { TASK_VIEWS } from "@/lib/tasks/constants";
import { CALENDAR_VIEWS } from "@/lib/calendar/constants";
import { HABIT_VIEWS } from "@/lib/habits/constants";
import { STUDY_VIEWS } from "@/lib/studies/constants";
import { resolveRoute } from "@/app/(app)/todo/resolve-route";

const SRC = path.resolve(__dirname, "..");
/** Só lidos: os dois são da 03-B2. */
const ARQUIVOS = ["lib/search/queries.ts", "lib/notifications/generate.ts"] as const;
const ROTAS = ["/tarefas", "/agenda", "/todo", "/rotinas", "/habitos", "/estudos/[id]"] as const;
type Rota = (typeof ROTAS)[number];
/** Rotas com visão declarada que HOJE não recebem link nenhum (G9). Link novo ⇒ vai para ROTAS com piso. */
const SEM_LINK_HOJE = ["/estudos"] as const;
/** Contado pela varredura no commit que a introduz. Piso: link novo é bem-vindo. */
const PISO: Record<Rota, number> = {
  "/todo": 8, "/tarefas": 3, "/agenda": 2, "/rotinas": 1, "/habitos": 3, "/estudos/[id]": 2,
};

/** Caminho concreto → rota declarada. `[id]` é o único segmento dinâmico coberto. */
function rotaDe(concreta: string): string {
  const c = concreta.split(/[?#]/)[0];
  return /^\/estudos\/[^/]+$/.test(c) ? "/estudos/[id]" : c;
}

const caminho = (p: PontoDeLink) => rotaDe(p.concreta);
const query = (s: string) => new URLSearchParams(s.split("?")[1]?.split("#")[0] ?? "");
const ehRota = (c: string): c is Rota => (ROTAS as readonly string[]).includes(c);

/** A view literal do link pertence à lista da página? `null` = não há view literal a checar. */
function viewAceita(literal: string, visoes: readonly string[]): boolean | null {
  const view = query(literal).get("view");
  if (view === null || view.includes("${")) return null;
  return visoes.includes(view);
}

/** O que a página LÊ, derivado do `page.tsx` (`sp.<nome>`) — nunca escrito à mão. */
function lidosPela(rota: Rota): Set<string> {
  const fonte = fs.readFileSync(path.join(SRC, "app", "(app)", rota.slice(1), "page.tsx"), "utf8");
  return new Set([...fonte.matchAll(/\bsp\.(\w+)/g)].map((m) => m[1]));
}

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

const PONTOS_TODOS = ARQUIVOS.flatMap((a) => lerLinks(a).pontos);
const PONTOS = PONTOS_TODOS.filter((p): boolean => ehRota(caminho(p)));
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
    expect(lidosPela("/habitos")).toEqual(new Set(["view"]));
    expect(lidosPela("/estudos/[id]").size).toBe(0);
  });

  it("toda página que valida `view` está coberta (ROTAS ∪ SEM_LINK_HOJE)", () => {
    const paginas = paginasComVisao();
    expect(paginas.length).toBeGreaterThanOrEqual(5);
    const cobertas = new Set<string>([...ROTAS, ...SEM_LINK_HOJE]);
    for (const p of paginas) expect(cobertas.has(p), `app/(app)${p}/page.tsx valida \`view\` e não está coberta`).toBe(true);
  });

  it("/estudos não recebe link hoje — o primeiro que aparecer exige piso (G9)", () => {
    for (const rota of SEM_LINK_HOJE) {
      expect(PONTOS_TODOS.filter((p): boolean => caminho(p) === rota), rota).toEqual([]);
    }
  });

  it("a checagem da view de Estudos sabe dizer sim e não (fixture)", () => {
    expect(viewAceita("/estudos?view=cursos", STUDY_VIEWS)).toBe(true);
    expect(viewAceita("/estudos?view=inexistente", STUDY_VIEWS)).toBe(false);
    expect(viewAceita("/estudos", STUDY_VIEWS)).toBeNull();
  });

  it.each(PONTOS.filter((p): boolean => caminho(p) === "/habitos"))("$arquivo:$linha → $literal — view de Hábitos", (p) => {
    const ok = viewAceita(p.literal, HABIT_VIEWS);
    if (ok === null) return;
    expect(ok, `${onde(p)}: \`${query(p.literal).get("view")}\` não está em HABIT_VIEWS`).toBe(true);
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
