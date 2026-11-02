/**
 * 05-C T4 · `FaturasChart` aceita mês sem fatura e texto de vazio — por varredura de fonte.
 *
 * O projeto não tem teste de componente: o contrato é provado lendo o código-fonte, SEM comentários
 * (a explicação da regra cita os nomes que a regra proíbe).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function fonteSemComentarios(relativo: string): string {
  const bruto = readFileSync(join(process.cwd(), relativo), "utf8");
  return bruto.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/** Aspas simples viram duplas e todo espaço em branco vira um espaço só. */
function normalizada(fonte: string): string {
  return fonte.replace(/'/g, '"').replace(/\s+/g, " ");
}

const IMPL = "src/components/dashboard/faturas-chart-impl.tsx";
const FACHADA = "src/components/dashboard/faturas-chart.tsx";

describe("05-C T4 · FaturasChart com mês sem fatura", () => {
  const impl = fonteSemComentarios(IMPL);
  const fachada = fonteSemComentarios(FACHADA);

  it("leu os dois arquivos (não afirma sobre string vazia)", () => {
    expect(impl.length).toBeGreaterThan(500);
    expect(fachada.length).toBeGreaterThan(100);
  });

  it("o -impl aceita a prop opcional vazio com titulo e descricao", () => {
    expect(normalizada(impl)).toContain("vazio?: { titulo: string; descricao: string }");
  });

  it("o texto padrão continua sendo 'Sem faturas nos próximos meses'", () => {
    expect(impl).toContain("Sem faturas nos próximos meses");
    expect(impl).toContain("As faturas dos cartões aparecem aqui pelo mês de vencimento.");
  });

  it("o vazio usa total !== null && total !== 0", () => {
    expect(normalizada(impl)).toContain("f.total !== null && f.total !== 0");
  });

  it("mês sem fatura tem total, meu e terceiros nulos (tipo MesSemFatura)", () => {
    expect(normalizada(impl)).toContain(
      'type MesSemFatura = { mes: string; total: null; meu: null; terceiros: null }',
    );
  });

  it("nenhum null vira zero: não há '?? 0' no -impl nem na fachada", () => {
    expect(impl).not.toContain("?? 0");
    expect(fachada).not.toContain("?? 0");
  });

  it("o tooltip não mostra R$ 0,00 para mês nulo", () => {
    expect(impl).toContain('"sem fatura"');
  });

  it("a fachada continua com next/dynamic e ssr: false", () => {
    expect(fachada).toContain("dynamic(");
    expect(normalizada(fachada)).toContain("ssr: false");
  });
});
