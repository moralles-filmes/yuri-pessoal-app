/**
 * REDESIGN-07-A · V1 — o seletor de visão anuncia o estado, e nenhuma tela o reescreve.
 *
 * ⚠️ Lê o código, não o renderiza (invariante 25: o projeto não tem teste de componente).
 * Comentários saem antes da leitura — a explicação de uma regra não pode satisfazê-la.
 */
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
function blocosDeVisaoComBotao(fonte: string): number {
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
