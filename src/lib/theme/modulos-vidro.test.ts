/**
 * REDESIGN-09-F — a varredura dos módulos em vidro. Sem infraestrutura de teste de componente
 * (ambiente `node`), a prova é a varredura da FONTE sem comentários, amarrando a classe ao
 * elemento certo: "a classe aparece no arquivo" não prova que ela está no elemento que importa.
 *
 * Os dois ajudantes exportados abaixo (`fonteSemComentarios`, `todosOsTsx`) são reusados pelos
 * blocos seguintes da 09-F, que também varrem o `src/` inteiro.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { bloco, SRC, semComentarios } from "./ler-tokens";

/** Fonte do arquivo com os comentários trocados por espaços (a linha reportada não desliza). */
export function fonteSemComentarios(caminho: string): string {
  return fs
    .readFileSync(caminho, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (_, antes: string) => antes);
}

/** Todo `.tsx` de `src/` (caminho absoluto), em ordem estável. */
export function todosOsTsx(dir: string = SRC): string[] {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) return todosOsTsx(p);
      return e.name.endsWith(".tsx") ? [p] : [];
    })
    .sort();
}

/** Caminho relativo à raiz do repositório, com `/`, para mensagens. */
export const relativo = (p: string) =>
  path.relative(path.resolve(SRC, ".."), p).replaceAll(path.sep, "/");

/** Linha (1-based) de um deslocamento no texto. */
export const linhaDe = (texto: string, i: number) => texto.slice(0, i).split("\n").length;

const dentroDeUi = (p: string) => relativo(p).startsWith("src/components/ui/");

describe("09-F · T1 · campos nativos em ladrilho", () => {
  it("a varredura leu código de verdade", () => {
    expect(todosOsTsx().length).toBeGreaterThan(400);
  });

  it("nenhum campo nativo usa border-input bg-transparent", () => {
    const sobrou: string[] = [];
    for (const arquivo of todosOsTsx()) {
      if (dentroDeUi(arquivo)) continue;
      const fonte = fonteSemComentarios(arquivo);
      // Qualquer literal de texto: className="…", constante "…" ou template `…`. O campo é
      // detectado pelas DUAS classes no mesmo literal, em qualquer ordem e com qualquer raio.
      for (const m of fonte.matchAll(/"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`/g)) {
        const classes = (m[1] ?? m[2] ?? m[3] ?? "").split(/\s+/);
        if (classes.includes("border-input") && classes.includes("bg-transparent")) {
          sobrou.push(`${relativo(arquivo)}:${linhaDe(fonte, m.index ?? 0)}`);
        }
      }
    }
    expect(sobrou, `Campo sem o material (use campo-nativo): ${sobrou.join(", ")}`).toEqual([]);
  });

  it("campo-nativo usa --field-border e --tile", () => {
    const b = semComentarios(bloco("@utility campo-nativo "));
    expect(b, "@utility campo-nativo existe").not.toBe("");
    expect(b).toMatch(/background\s*:\s*var\(--tile\)/);
    expect(b).toMatch(/border\s*:\s*1px solid var\(--field-border\)/);
    expect(b).toMatch(/border-radius\s*:\s*10px/);
    expect(b).toMatch(/box-shadow\s*:\s*inset 0 1px 2px rgba\(16,\s*24,\s*40,\s*0?\.06\)/);
    // Transparência reduzida cai no sólido do ladrilho; cores forçadas, em CanvasText.
    expect(b).toMatch(/prefers-reduced-transparency[\s\S]*background\s*:\s*var\(--tile-solid\)/);
    expect(b).toMatch(/forced-colors[\s\S]*border-color\s*:\s*CanvasText/);
  });
});
