import { describe, expect, it } from "vitest";
import { totaisPorStatus, type ImportRowTotalInput } from "@/lib/import/totals";

function row(
  status: ImportRowTotalInput["status"],
  valor: number | null,
  tipo: ImportRowTotalInput["tipo"] = "despesa",
): ImportRowTotalInput {
  return { status, valor, tipo };
}

describe("totaisPorStatus", () => {
  it("soma apenas as linhas 'para_importar' por padrão (ignoradas/duplicadas/erro fora)", () => {
    const rows = [
      row("para_importar", 100.5),
      row("para_importar", 50.25),
      row("ignorada", 999.99),
      row("duplicada", 30),
      row("erro", 10),
    ];
    const t = totaisPorStatus(rows);
    expect(t.count).toBe(2);
    expect(t.despesas).toBe(150.75);
    expect(t.liquido).toBe(150.75);
  });

  it("não acumula erro de ponto flutuante (soma em centavos)", () => {
    // 0.10 + 0.20 = 0.30 (em float puro daria 0.30000000000000004)
    const t = totaisPorStatus([row("para_importar", 0.1), row("para_importar", 0.2)]);
    expect(t.despesas).toBe(0.3);
    expect(t.liquido).toBe(0.3);
  });

  it("em fatura de cartão (tudo despesa) o líquido é a soma simples", () => {
    const rows = [
      row("para_importar", 1234.56),
      row("para_importar", 10),
      row("para_importar", 0.44),
    ];
    const t = totaisPorStatus(rows);
    expect(t.despesas).toBe(1245);
    expect(t.receitas).toBe(0);
    expect(t.liquido).toBe(1245);
  });

  it("em conta com receita e despesa, separa os totais e calcula o líquido", () => {
    const rows = [
      row("para_importar", 200, "despesa"),
      row("para_importar", 80, "receita"),
    ];
    const t = totaisPorStatus(rows);
    expect(t.despesas).toBe(200);
    expect(t.receitas).toBe(80);
    expect(t.liquido).toBe(120);
  });

  it("conta a linha sem valor mas não a soma", () => {
    const t = totaisPorStatus([row("para_importar", null), row("para_importar", 25)]);
    expect(t.count).toBe(2);
    expect(t.despesas).toBe(25);
  });

  it("aceita filtrar por outro status (ex.: 'importada' após o commit)", () => {
    const rows = [
      row("importada", 100),
      row("importada", 50),
      row("para_importar", 999),
    ];
    const t = totaisPorStatus(rows, "importada");
    expect(t.count).toBe(2);
    expect(t.liquido).toBe(150);
  });

  it("retorna zeros quando não há linhas no status", () => {
    const t = totaisPorStatus([row("ignorada", 100)]);
    expect(t.count).toBe(0);
    expect(t.despesas).toBe(0);
    expect(t.receitas).toBe(0);
    expect(t.liquido).toBe(0);
  });
});
