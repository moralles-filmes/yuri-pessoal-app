import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { comoFecharAGaveta } from "@/lib/painel/gaveta-historico";

/**
 * 08-C1 — o histórico da gaveta de registros.
 *
 * Abrir é `push`; fechar deve ser `back` quando a gaveta foi aberta por navegação (senão sobra
 * [página, página] e o voltar parece não fazer nada) e `replace` quando veio de URL
 * compartilhada/recarregada (senão o voltar sai do app).
 */
describe("08-C1 · como fechar a gaveta", () => {
  it("aberta por navegação: volta (desfaz o push)", () => {
    expect(comoFecharAGaveta({ abertaPorNavegacao: true })).toBe("voltar");
  });

  it("aberta por URL compartilhada/recarregada: substitui (não sai do app)", () => {
    expect(comoFecharAGaveta({ abertaPorNavegacao: false })).toBe("substituir");
  });

  it("o módulo não tem imports (vai para o bundle do client)", () => {
    const fonte = fs.readFileSync(path.resolve(__dirname, "gaveta-historico.ts"), "utf8");
    const linhasComImport = fonte.split(/\r?\n/).filter((linha) => /^\s*import\b/.test(linha));
    expect(linhasComImport).toEqual([]);
  });
});
