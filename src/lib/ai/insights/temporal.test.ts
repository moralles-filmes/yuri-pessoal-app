import { describe, expect, it } from "vitest";

import { type Indicador, type SerieTemporal, indicadorCoerente } from "./contracts";
import {
  comparar,
  fimDoMes,
  janelaDeDias,
  janelaDeMeses,
  media,
  somarDias,
  variacaoPercentual,
} from "./temporal";

/** Série de sessões por semana. Valores escritos à mão; as contas estão nos comentários. */
const SERIE: SerieTemporal = {
  id: "treinos.sessoes",
  modulo: "treinos",
  rotulo: "Sessões concluídas",
  unidade: "sessões",
  rota: "/treinos/historico",
  regra_de_contagem: "aquecimento não conta",
  pontos: [
    { periodo: { de: "2026-07-06", ate: "2026-07-12" }, valor: 10, qualidade: "exato" },
    { periodo: { de: "2026-07-13", ate: "2026-07-19" }, valor: 12, qualidade: "exato" },
    { periodo: { de: "2026-07-20", ate: "2026-07-26" }, valor: 8, qualidade: "exato" },
    { periodo: { de: "2026-07-27", ate: "2026-08-02" }, valor: 14, qualidade: "exato" },
  ],
};

const comPontos = (pontos: SerieTemporal["pontos"]): SerieTemporal => ({ ...SERIE, pontos });

describe("media — janela cheia ou nada", () => {
  it("média das 4 semanas: (10 + 12 + 8 + 14) / 4 = 11", () => {
    const m = media(SERIE, 4);
    expect(m.valor).toBe(11);
    expect(m.n).toBe(4);
    expect(m.qualidade).toBe("exato");
    expect(m.unidade).toBe("sessões");
    expect(m.periodo).toEqual({ de: "2026-07-06", ate: "2026-08-02" });
    expect(m.id).toBe("treinos.sessoes.media_4");
  });

  it("média das 2 últimas: (8 + 14) / 2 = 11 — e o período encolhe junto", () => {
    const m = media(SERIE, 2);
    expect(m.valor).toBe(11);
    expect(m.periodo).toEqual({ de: "2026-07-20", ate: "2026-08-02" });
  });

  it("a regra de contagem viaja com o número", () => {
    expect(media(SERIE, 4).regra_de_contagem).toBe("aquecimento não conta");
  });

  /**
   * ⛔ O caso que dá nome à regra. Dividir por 3 daria 10 — um número plausível, com o nome
   * "média de 4 semanas", que ninguém teria como conferir. Somar o buraco como zero daria
   * 7,5 — pior ainda, porque inventa um dado.
   */
  it("período sem registro dentro da janela ⇒ null com o tamanho do buraco escrito", () => {
    const m = media(
      comPontos([
        SERIE.pontos[0],
        { periodo: { de: "2026-07-13", ate: "2026-07-19" }, valor: null, qualidade: "exato" },
        SERIE.pontos[2],
        SERIE.pontos[3],
      ]),
      4,
    );
    expect(m.valor).toBeNull();
    expect(m.n).toBe(3);
    expect(m.indisponivel_porque).toContain("3 de 4");
    expect(m.valor).not.toBe(0);
  });

  it("série mais curta que a janela ⇒ null dizendo os dois tamanhos", () => {
    const m = media(comPontos(SERIE.pontos.slice(0, 2)), 4);
    expect(m.valor).toBeNull();
    expect(m.n).toBe(2);
    expect(m.indisponivel_porque).toContain("4 períodos e a série tem 2");
  });

  it("série vazia ⇒ null, sem estourar", () => {
    const m = media(comPontos([]), 4);
    expect(m.valor).toBeNull();
    expect(m.n).toBe(0);
  });

  it("janela inválida ⇒ null, nunca divisão por zero", () => {
    for (const janela of [0, -1, 1.5, Number.NaN]) {
      const m = media(SERIE, janela);
      expect(m.valor, String(janela)).toBeNull();
    }
  });

  it("um ponto parcial contamina a média, com o motivo do ponto", () => {
    const m = media(
      comPontos([
        SERIE.pontos[0],
        SERIE.pontos[1],
        {
          periodo: { de: "2026-07-20", ate: "2026-07-26" },
          valor: 8,
          qualidade: "parcial",
          motivo_incompleto: "2 sessões sem peso corporal do dia",
        },
        SERIE.pontos[3],
      ]),
      4,
    );
    expect(m.valor).toBe(11); // a conta é a mesma; o que muda é a ressalva
    expect(m.qualidade).toBe("parcial");
    expect(m.motivo_incompleto).toBe("2 sessões sem peso corporal do dia");
  });

  it("toda média produzida é um indicador coerente", () => {
    for (const janela of [1, 2, 4, 9, 0]) {
      expect(indicadorCoerente(media(SERIE, janela)), String(janela)).toBe(true);
    }
    expect(indicadorCoerente(media(comPontos([]), 3))).toBe(true);
  });
});

describe("variacaoPercentual — base zero não é infinito", () => {
  it("de 100 para 150 são +50%", () => {
    expect(variacaoPercentual(100, 150).valor).toBe(50);
  });

  it("de 200 para 150 são -25%", () => {
    expect(variacaoPercentual(200, 150).valor).toBe(-25);
  });

  it("base negativa usa o módulo: de -100 para -50 são +50%", () => {
    // (-50 − (−100)) / |−100| × 100 = 50 / 100 × 100 = 50
    expect(variacaoPercentual(-100, -50).valor).toBe(50);
  });

  /**
   * ⛔ Em JavaScript `(40 − 0) / 0 × 100` é `Infinity` e `(0 − 0) / 0` é `NaN`. Os dois
   * atravessariam calados até a tela.
   */
  it("base zero ⇒ null com motivo — nunca Infinity, nunca NaN", () => {
    const v = variacaoPercentual(0, 40);
    expect(v.valor).toBeNull();
    expect(v.indisponivel_porque).toContain("zero");

    const w = variacaoPercentual(0, 0);
    expect(w.valor).toBeNull();
    expect(Number.isNaN(w.valor as unknown as number)).toBe(false);
  });

  it("qualquer dos dois ausente ⇒ null", () => {
    expect(variacaoPercentual(null, 40).valor).toBeNull();
    expect(variacaoPercentual(40, null).valor).toBeNull();
    expect(variacaoPercentual(null, null).valor).toBeNull();
  });

  it("valor não finito ⇒ null, e não propaga o infinito adiante", () => {
    expect(variacaoPercentual(Number.POSITIVE_INFINITY, 3).valor).toBeNull();
    expect(variacaoPercentual(3, Number.NaN).valor).toBeNull();
  });

  it("zero para zero não vira 0% — não houve base", () => {
    expect(variacaoPercentual(0, 0).valor).not.toBe(0);
  });
});

const ATUAL: Indicador = {
  id: "treinos.sessoes",
  modulo: "treinos",
  rotulo: "Sessões concluídas",
  valor: 12,
  unidade: "sessões",
  qualidade: "exato",
  periodo: { de: "2026-08-01", ate: "2026-08-31" },
  n: 12,
  rota: "/treinos/historico",
};

const ANTERIOR: Indicador = {
  ...ATUAL,
  valor: 10,
  periodo: { de: "2026-07-01", ate: "2026-07-31" },
  n: 10,
};

describe("comparar", () => {
  it("12 contra 10: diferença 2, variação 20%", () => {
    // (12 − 10) / |10| × 100 = 20
    const c = comparar(ATUAL, ANTERIOR);
    expect(c.diferenca.valor).toBe(2);
    expect(c.diferenca.unidade).toBe("sessões");
    expect(c.variacao.valor).toBe(20);
    expect(c.variacao.unidade).toBe("%");
    expect(c.diferenca.n).toBe(22); // 12 do atual + 10 do anterior
    expect(c.diferenca.periodo).toEqual({ de: "2026-07-01", ate: "2026-08-31" });
  });

  it("sem período anterior ⇒ os dois derivados são null com 'sem base'", () => {
    const c = comparar(ATUAL, null);
    expect(c.anterior).toBeNull();
    expect(c.diferenca.valor).toBeNull();
    expect(c.variacao.valor).toBeNull();
    expect(c.diferenca.indisponivel_porque).toContain("não há período anterior");
  });

  /** Não ter base é diferente de a base ser zero — e os motivos escritos são diferentes. */
  it("base zero ⇒ diferença SAI, variação não", () => {
    const c = comparar(ATUAL, { ...ANTERIOR, valor: 0, n: 0 });
    expect(c.diferenca.valor).toBe(12);
    expect(c.variacao.valor).toBeNull();
    expect(c.variacao.indisponivel_porque).toContain("zero");
  });

  it("período anterior não medido ⇒ null com o motivo DELE, não um genérico", () => {
    const c = comparar(ATUAL, {
      ...ANTERIOR,
      valor: null,
      indisponivel_porque: "nenhuma sessão registrada em julho",
    });
    expect(c.diferenca.valor).toBeNull();
    expect(c.diferenca.indisponivel_porque).toBe("nenhuma sessão registrada em julho");
  });

  /** Invariante 1 dos Treinos aplicada ao tempo: não se compara quilo com segundo. */
  it("unidades diferentes ⇒ recusa explícita, não um número plausível", () => {
    const c = comparar(ATUAL, { ...ANTERIOR, unidade: "kg", valor: 4800 });
    expect(c.diferenca.valor).toBeNull();
    expect(c.variacao.valor).toBeNull();
    expect(c.diferenca.indisponivel_porque).toContain("unidades diferentes");
  });

  it("um lado parcial contamina os dois derivados", () => {
    const c = comparar(ATUAL, {
      ...ANTERIOR,
      qualidade: "parcial",
      motivo_incompleto: "1 sessão sem peso do dia",
    });
    expect(c.diferenca.qualidade).toBe("parcial");
    expect(c.variacao.qualidade).toBe("parcial");
    expect(c.diferenca.motivo_incompleto).toBe("1 sessão sem peso do dia");
  });

  it("todo derivado de comparar é um indicador coerente", () => {
    for (const anterior of [
      ANTERIOR,
      null,
      { ...ANTERIOR, valor: 0, n: 0 },
      { ...ANTERIOR, unidade: "kg" },
      { ...ANTERIOR, valor: null, indisponivel_porque: "sem registro" },
    ]) {
      const c = comparar(ATUAL, anterior);
      expect(indicadorCoerente(c.diferenca), JSON.stringify(anterior)).toBe(true);
      expect(indicadorCoerente(c.variacao), JSON.stringify(anterior)).toBe(true);
    }
  });
});

describe("janelas — aritmética em Date.UTC, data pura como texto", () => {
  it("somarDias atravessa mês e ano", () => {
    expect(somarDias("2026-12-31", 1)).toBe("2027-01-01");
    expect(somarDias("2026-03-01", -1)).toBe("2026-02-28");
    expect(somarDias("2024-03-01", -1)).toBe("2024-02-29"); // bissexto
    expect(somarDias("2026-08-09", 0)).toBe("2026-08-09");
  });

  it("fimDoMes conhece fevereiro e o ano bissexto", () => {
    expect(fimDoMes("2026-02-01")).toBe("2026-02-28");
    expect(fimDoMes("2024-02-15")).toBe("2024-02-29");
    expect(fimDoMes("2026-08-09")).toBe("2026-08-31");
    expect(fimDoMes("2026-04-30")).toBe("2026-04-30");
  });

  it("janelaDeDias devolve os últimos N dias em ordem crescente, hoje incluído", () => {
    expect(janelaDeDias("2026-08-09", 3)).toEqual([
      { de: "2026-08-07", ate: "2026-08-07" },
      { de: "2026-08-08", ate: "2026-08-08" },
      { de: "2026-08-09", ate: "2026-08-09" },
    ]);
    expect(janelaDeDias("2026-08-09", 0)).toEqual([]);
  });

  it("janelaDeMeses devolve meses de calendário fechados, com o corrente por último", () => {
    expect(janelaDeMeses("2026-08-09", 3)).toEqual([
      { de: "2026-06-01", ate: "2026-06-30" },
      { de: "2026-07-01", ate: "2026-07-31" },
      { de: "2026-08-01", ate: "2026-08-31" },
    ]);
  });

  it("janelaDeMeses atravessa a virada do ano", () => {
    expect(janelaDeMeses("2026-01-15", 2)).toEqual([
      { de: "2025-12-01", ate: "2025-12-31" },
      { de: "2026-01-01", ate: "2026-01-31" },
    ]);
  });
});
