import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * RR-C2-10 — o botão "Categorias marcadas como de terceiros", ligado, tem de se distinguir do
 * desligado sem depender de cor: fundo primário + a marca de ativo do SeletorDeVisao.
 *
 * Varredura da fonte (não há teste de componente no projeto). Comentários saem antes, para que
 * uma explicação que cite o trecho não satisfaça a asserção.
 */
const fonte = readFileSync(
  join(process.cwd(), "src/app/(app)/financeiro/lancamentos/transaction-filters.tsx"),
  "utf8",
).replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/[^\r\n]*/g, "");

describe("TransactionFilters — botão de categorias marcadas (RR-C2-10)", () => {
  it("não usa mais o secondary do ligado (que some no escuro)", () => {
    expect(fonte).not.toContain('"secondary" : "outline"');
  });

  it("ligado vira variant default; desligado continua outline", () => {
    expect(fonte).toContain('marcadasLigado ? "default" : "outline"');
  });

  it("importa MarcaDeAtiva do seletor compartilhado (não copia)", () => {
    expect(fonte).toMatch(
      /import\s*\{[^}]*\bMarcaDeAtiva\b[^}]*\}\s*from\s*"@\/components\/shared\/seletor-de-visao"/,
    );
  });

  it("renderiza a marca só quando ligado", () => {
    expect(fonte).toContain("{marcadasLigado && <MarcaDeAtiva />}");
  });

  it("mantém aria-pressed ligado ao estado", () => {
    expect(fonte).toContain("aria-pressed={marcadasLigado}");
  });
});
