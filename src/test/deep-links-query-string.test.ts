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
import { lerLinks, pontosDeLink, VALOR_DE_EXEMPLO, semComentarios, type PontoDeLink } from "@/test/links-inline";
import { parametrosLidosNoTexto } from "@/test/parametros-lidos";
import { TASK_VIEWS } from "@/lib/tasks/constants";
import { CALENDAR_VIEWS } from "@/lib/calendar/constants";
import { HABIT_VIEWS } from "@/lib/habits/constants";
import { STUDY_VIEWS } from "@/lib/studies/constants";
import { resolveRoute } from "@/app/(app)/todo/resolve-route";

const SRC = path.resolve(__dirname, "..");
/** Só lidos: os dois são da 03-B2. */
const ARQUIVOS = ["lib/search/queries.ts", "lib/notifications/generate.ts"] as const;
/**
 * 07-C · D6 — as notificações de Dieta e Treinos montam TODO link pelos construtores
 * (`nutrition-links.ts`/`training-links.ts`, cujos testes exigem que a página leia cada
 * parâmetro). Link montado à mão aqui é o defeito que a 07-C fechou: a notificação do
 * planejamento saía sem `visao` e abria o dia, não a semana. Teto: ZERO rotas inline.
 */
const SO_CONSTRUTOR = ["lib/notifications/nutrition.ts", "lib/notifications/training.ts"] as const;
/** Páginas com `visao` que só recebem link por construtor (testado no arquivo do construtor). */
const VISAO_SO_POR_CONSTRUTOR = ["/nutricao/diario", "/nutricao/planejamento", "/treinos/calendario"] as const;
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

/**
 * O que a página LÊ, derivado do `page.tsx` — nunca escrito à mão. 07-C: além de `sp.<nome>`,
 * aprende `params.<nome>`, `params?.<nome>` e a desestruturação de `await searchParams` (as
 * páginas de Dieta e Treinos leem assim).
 */
function lidosPela(rota: Rota): Set<string> {
  const fonte = semComentarios(fs.readFileSync(path.join(SRC, "app", "(app)", rota.slice(1), "page.tsx"), "utf8"));
  return parametrosLidosNoTexto(fonte);
}

/**
 * Páginas que validam a visão — `sp.view` contra `*_VIEWS` (07-A/07-B) ou, desde a 07-C,
 * `visao` (`as*View(params.visao)` ou os ternários do calendário de Treinos). Derivado.
 */
function paginasComVisao(): string[] {
  const base = path.join(SRC, "app", "(app)");
  const achadas: string[] = [];
  const andar = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) andar(p);
      else if (e.name === "page.tsx") {
        const f = semComentarios(fs.readFileSync(p, "utf8"));
        const view = /\bsp\.view\b/.test(f) && /\b[A-Z][A-Z0-9_]*_VIEWS\b/.test(f);
        const visao =
          /\b(?:sp|params)\??\.visao\b/.test(f) &&
          (/\bas[A-Z]\w*View\(/.test(f) || /\b[A-Z][A-Z0-9_]*_VIEWS\b/.test(f) || /\.visao\s*===\s*"/.test(f));
        if (view || visao) {
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

  it("toda página que valida a visão está coberta (ROTAS ∪ SEM_LINK_HOJE ∪ VISAO_SO_POR_CONSTRUTOR)", () => {
    const paginas = paginasComVisao();
    // 07-C: contadas aqui — 5 de `view` (07-A/07-B) + 3 de `visao` (Dieta e Treinos).
    expect(paginas.length).toBeGreaterThanOrEqual(8);
    const cobertas = new Set<string>([...ROTAS, ...SEM_LINK_HOJE, ...VISAO_SO_POR_CONSTRUTOR]);
    for (const p of paginas) expect(cobertas.has(p), `app/(app)${p}/page.tsx valida a visão e não está coberta`).toBe(true);
  });

  it("as páginas de `visao` de Dieta e Treinos são vistas pela varredura (anti-tautologia)", () => {
    const paginas = new Set(paginasComVisao());
    for (const p of VISAO_SO_POR_CONSTRUTOR) expect(paginas.has(p), p).toBe(true);
  });

  it.each(SO_CONSTRUTOR)("%s não monta link à mão — todo link sai do construtor (07-C, D6)", (arquivo) => {
    const { pontos } = lerLinks(arquivo);
    expect(pontos.map(onde)).toEqual([]);
  });

  it("e o leitor ainda enxerga um link montado à mão (fixture)", () => {
    const pontos = pontosDeLink("fixture.ts", "const n = { link: `/nutricao/planejamento?data=${w}` };");
    expect(pontos.map((p) => p.literal)).toEqual(["/nutricao/planejamento?data=${w}"]);
  });

  it("a leitura do page.tsx aprendeu params.x e a desestruturação (07-C)", () => {
    expect(parametrosLidosNoTexto("const params = await searchParams; params.visao; params?.data;")).toEqual(
      new Set(["visao", "data"]),
    );
    expect(parametrosLidosNoTexto("const { alimento } = await searchParams;")).toEqual(new Set(["alimento"]));
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
