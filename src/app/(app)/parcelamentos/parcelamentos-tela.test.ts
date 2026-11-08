/**
 * REDESIGN-05-C · T9 — o contrato da tela de /parcelamentos, por varredura de fonte.
 *
 * O projeto não tem teste de componente (invariante 25): o que a tela promete é provado lendo o
 * código-fonte, SEM comentários.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function fonteSemComentarios(relativo: string): string {
  const bruto = readFileSync(join(process.cwd(), relativo), "utf8");
  return bruto.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/** Aspas simples/duplas viram duplas e todo espaço em branco vira um espaço só. */
function normalizada(fonte: string): string {
  return fonte.replace(/'/g, '"').replace(/\s+/g, " ");
}

const TELA = "src/app/(app)/parcelamentos/installments-client.tsx";
const PAGINA = "src/app/(app)/parcelamentos/page.tsx";

describe("05-C T9 · parcelamentos nas peças comuns", () => {
  const tela = fonteSemComentarios(TELA);
  const telaN = normalizada(tela);
  const pagina = fonteSemComentarios(PAGINA);

  it("leu os arquivos (não afirma sobre string vazia)", () => {
    expect(tela.length).toBeGreaterThan(500);
    expect(pagina.length).toBeGreaterThan(200);
  });

  it("a tela importa as peças do painel e o agrupamento, e não usa StatCard", () => {
    expect(tela).toMatch(/import\s*\{[^}]*\bIndicador\b[^}]*\}/);
    expect(tela).toMatch(/import\s*\{[^}]*\bBloco\b[^}]*\}/);
    expect(tela).toMatch(/import\s*\{[^}]*\bagruparParcelamentos\b[^}]*\}/);
    expect(tela).toMatch(/import\s*\{[^}]*\bOlhoDosValores\b[^}]*\}/);
    expect(tela).not.toContain("StatCard");
  });

  it("as ações continuam as de hoje (cancelar futuras e excluir)", () => {
    expect(tela).toContain("cancelInstallmentFuture");
    expect(tela).toContain("deleteInstallmentPurchase");
  });

  it("a navegação continua montando a URL com card, category e status", () => {
    expect(tela).toContain("card:");
    expect(tela).toContain("category:");
    expect(tela).toContain("status,");
  });

  it("os dois blocos têm o nome do desenho", () => {
    expect(telaN).toContain('"Em andamento"');
    expect(telaN).toContain('"Finalizados e cancelados"');
  });

  it("a página lê o cookie do olho", () => {
    expect(pagina).toContain("COOKIE_DO_OLHO");
    expect(pagina).toContain("ocultoInicial");
  });
});
