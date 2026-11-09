/**
 * Leitor dos tokens de `src/app/globals.css`, compartilhado pelos testes de contrato
 * (`tokens.test.ts`) e de contraste (`contraste-dos-tokens.test.ts`). Só testes importam
 * este arquivo: ele lê o CSS do disco.
 */
import fs from "node:fs";
import path from "node:path";

export const SRC = path.resolve(__dirname, "..", "..");

export function semComentarios(codigo: string): string {
  return codigo.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}

export const css = semComentarios(
  fs.readFileSync(path.join(SRC, "app", "globals.css"), "utf8"),
);

/** Recorta o corpo `{ … }` de um bloco CSS pelo seu seletor, contando profundidade. */
export function bloco(seletor: string): string {
  const inicio = css.indexOf(seletor);
  if (inicio < 0) return "";
  const abre = css.indexOf("{", inicio);
  if (abre < 0) return "";
  let profundidade = 0;
  for (let i = abre; i < css.length; i += 1) {
    if (css[i] === "{") profundidade += 1;
    else if (css[i] === "}") {
      profundidade -= 1;
      if (profundidade === 0) return css.slice(abre + 1, i);
    }
  }
  return "";
}

/** Nome → valor das custom properties declaradas num corpo de bloco. */
export function tokens(corpo: string): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const m of corpo.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    mapa.set(m[1], m[2].trim());
  }
  return mapa;
}

export const tema = tokens(bloco("@theme inline"));
export const claro = tokens(bloco(":root"));
export const escuro = tokens(bloco(".dark {"));
