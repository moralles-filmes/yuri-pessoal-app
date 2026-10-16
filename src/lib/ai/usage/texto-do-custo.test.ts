import { describe, expect, it } from "vitest";
import { formatUsd } from "@/lib/ai/constants";
import { textoDoCusto } from "./texto-do-custo";

/**
 * REDESIGN-07-D · Z — a célula "Custo" de `/ia/consumo`, por modelo (spec §6.10, M49).
 *
 * `getUsageByModel` começa `custoUsd: 0` e só soma o custo presente: uma linha em que NENHUMA
 * tentativa teve custo informado aparecia como "US$ 0,000000" — ausência virando zero
 * (invariante 11). A célula passa a dizer o que se sabe.
 */
describe("textoDoCusto — ausência nunca é zero (invariante 11)", () => {
  it("nenhuma tentativa com custo informado → 'não medido', nunca US$ 0,000000", () => {
    const texto = textoDoCusto({ execucoes: 3, custoUsd: 0, semCusto: 3 });
    expect(texto).toBe("não medido");
    expect(texto).not.toContain("US$");
  });

  it("parte sem custo → o valor somado, marcado como parcial", () => {
    expect(textoDoCusto({ execucoes: 4, custoUsd: 0.0123, semCusto: 1 })).toBe(
      `${formatUsd(0.0123)} (parcial)`,
    );
  });

  it("todas com custo → só o valor", () => {
    expect(textoDoCusto({ execucoes: 2, custoUsd: 1.5, semCusto: 0 })).toBe(formatUsd(1.5));
  });

  it("custo ZERO medido continua sendo zero (não é ausência)", () => {
    expect(textoDoCusto({ execucoes: 1, custoUsd: 0, semCusto: 0 })).toBe(formatUsd(0));
  });
});
