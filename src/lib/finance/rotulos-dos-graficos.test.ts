import { describe, expect, it } from "vitest";
import { rotulosDosGraficos } from "@/lib/finance/rotulos-dos-graficos";

describe("rotulosDosGraficos (desenho 2026-10-18, §5)", () => {
  it("competência: títulos dizem que é meu e a base aparece na descrição", () => {
    const r = rotulosDosGraficos({ base: "competencia", ateODia: null });
    expect(r.categorias.titulo).toBe("Meus gastos por categoria");
    expect(r.formas.titulo).toBe("Meus gastos por forma de pagamento");
    expect(r.evolucao.titulo).toBe("Minhas entradas e saídas mês a mês");
    expect(r.evolucao.descricao).toContain("Competência");
    expect(r.evolucao.descricao).toContain("terceiros fora");
    expect(r.mesAMes.titulo).toBe("Meu mês a mês");
    expect(r.projecao.titulo).toBe("Minha projeção dos próximos meses");
    expect(r.faturas.titulo).toBe("Faturas dos próximos meses — valor cheio");
    expect(r.faturas.descricao).toContain("inclui gastos meus e de terceiros");
  });

  it("caixa: a descrição troca a base e explica o cartão", () => {
    const r = rotulosDosGraficos({ base: "caixa", ateODia: null });
    expect(r.evolucao.descricao).toContain("Caixa realizado");
    expect(r.evolucao.descricao).not.toContain("Competência");
    expect(r.categorias.descricao).toContain("no mês em que a fatura foi paga");
    expect(r.mesAMes.descricao).toContain("o cartão entra como pagamento de fatura");
  });

  it("mês em andamento: o título do mês a mês carrega o dia do corte", () => {
    expect(rotulosDosGraficos({ base: "competencia", ateODia: 18 }).mesAMes.titulo).toBe(
      "Meu mês a mês · até o dia 18",
    );
    expect(rotulosDosGraficos({ base: "competencia", ateODia: 18 }).mesAMes.descricao).toContain(
      "o cartão não entra",
    );
  });

  it("projeções são iguais nas duas bases", () => {
    const c = rotulosDosGraficos({ base: "competencia", ateODia: null });
    const x = rotulosDosGraficos({ base: "caixa", ateODia: null });
    expect(x.projecao).toEqual(c.projecao);
    expect(x.faturas).toEqual(c.faturas);
  });

  it("card 'Minhas saídas' diz a base e o que é cada caixinha", () => {
    const c = rotulosDosGraficos({ base: "competencia", ateODia: null }).cardMinhasSaidas;
    expect(c.titulo("outubro de 2026")).toBe("Minhas saídas · outubro de 2026 · Competência");
    expect([c.bruto, c.terceiros]).toEqual(["Saídas totais (bruto)", "Saídas de terceiros"]);
    const x = rotulosDosGraficos({ base: "caixa", ateODia: null }).cardMinhasSaidas;
    expect(x.titulo("outubro de 2026")).toBe("Minhas saídas · outubro de 2026 · Caixa realizado");
    expect([x.bruto, x.terceiros]).toEqual(["Saiu das contas (bruto)", "Parte de terceiros no que saiu"]);
  });
});
