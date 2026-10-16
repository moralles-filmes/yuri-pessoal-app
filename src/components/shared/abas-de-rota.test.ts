/**
 * REDESIGN-07-A · D4 — abas por rota: um componente, dois consumidores.
 *
 * ⚠️ Lê o código, não o renderiza (invariante 25). Comentários saem antes da leitura.
 */
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
