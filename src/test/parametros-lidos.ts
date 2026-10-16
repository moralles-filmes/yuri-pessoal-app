/**
 * REDESIGN-07-C · D6 — os parâmetros de query string que uma rota LÊ, derivados do código.
 *
 * Os testes dos construtores de link (`nutrition-links.test.ts`, `training-links.test.ts`)
 * conferiam o FORMATO da string e se a rota existe — nunca se a página lia o parâmetro. Um
 * `?visao=` que a página ignorasse passava verde e a notificação abria a visão padrão.
 *
 * Lê, sem comentários:
 * - o `page.tsx` da rota: `sp.x`, `params.x`, `params?.x` e a desestruturação de
 *   `await searchParams` (direta ou dentro de `Promise.all([searchParams, …])`);
 * - os `.tsx` da MESMA pasta (o client da página): `searchParams.get("x")`.
 */
import fs from "node:fs";
import path from "node:path";
import { semComentarios } from "@/test/links-inline";

const APP = path.resolve(__dirname, "..", "app", "(app)");

export function parametrosLidosNoTexto(pagina: string, clientes: string[] = []): Set<string> {
  const lidos = new Set<string>();
  for (const m of pagina.matchAll(/\b(?:sp|params)\??\.(\w+)/g)) lidos.add(m[1]);
  for (const m of pagina.matchAll(
    /const\s+\[?\s*\{([^}]*)\}[^=;]*=\s*await\s+(?:Promise\.all\(\[\s*)?(?:props\.)?searchParams\b/g,
  )) {
    for (const parte of m[1].split(",")) {
      const nome = parte.split(":")[0].trim();
      if (/^\w+$/.test(nome)) lidos.add(nome);
    }
  }
  for (const cliente of clientes) {
    for (const m of cliente.matchAll(/\bsearchParams\??\.get\(\s*["'](\w+)["']\s*\)/g)) lidos.add(m[1]);
  }
  // `.get` de Map/URLSearchParams genéricos não contam; `searchParams` é o nome do hook.
  lidos.delete("get");
  return lidos;
}

/** O que a rota (`"/nutricao/planejamento"`, `"/habitos"`) lê, pela página e pelo client dela. */
export function parametrosLidos(rota: string): Set<string> {
  const pasta = path.join(APP, rota.replace(/^\//, ""));
  const pagina = semComentarios(fs.readFileSync(path.join(pasta, "page.tsx"), "utf8"));
  const clientes = fs
    .readdirSync(pasta, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".tsx") && e.name !== "page.tsx")
    .map((e) => semComentarios(fs.readFileSync(path.join(pasta, e.name), "utf8")));
  return parametrosLidosNoTexto(pagina, clientes);
}

/** `/a/b?x=1&y=2` → `["/a/b", ["x", "y"]]`. */
export function rotaEParametros(link: string): [string, string[]] {
  const [caminho, query = ""] = link.split("?");
  return [caminho, [...new URLSearchParams(query.split("#")[0]).keys()]];
}
