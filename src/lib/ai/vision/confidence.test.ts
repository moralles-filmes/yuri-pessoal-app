/**
 * Fase 18-D — IA · O servidor duvidando.
 *
 * A propriedade central: **nada aqui promove**. O modelo pode dizer `alta` o quanto quiser;
 * se a regra disser que o campo é suspeito, ele desce. E campo ilegível vira
 * `nao_identificado` — nunca zero, nunca um palpite.
 */

import { describe, expect, it } from "vitest";
import {
  avaliarData,
  avaliarExtracao,
  avaliarTotal,
  confrontarItens,
  corrigir,
  ehDataPuraValida,
  podePropor,
  TETO_PLAUSIVEL_CENTAVOS,
} from "./confidence";
import { rebaixar, type Campo, type ItemDaNota } from "./contracts";
import type { ExtracaoDoModelo } from "./schema";

const HOJE = "2026-08-08";

const BRUTA_OK: ExtracaoDoModelo = {
  estabelecimento: { valor: "Padaria São João", confianca: "alta" },
  cnpj: { valor: "12.345.678/0001-90", confianca: "media" },
  data: { valor: "2026-08-07", confianca: "alta" },
  hora: { valor: "09:32", confianca: "media" },
  totalCentavos: { valor: 4790, confianca: "alta" },
  formaPagamento: { valor: "PIX", confianca: "alta" },
  numeroDocumento: { valor: "000123", confianca: "baixa" },
  itens: [],
};

describe("⛔ rebaixar nunca promove", () => {
  it("devolve sempre o pior dos dois", () => {
    expect(rebaixar("alta", "baixa")).toBe("baixa");
    expect(rebaixar("baixa", "alta")).toBe("baixa");
    expect(rebaixar("media", "conflito")).toBe("conflito");
    expect(rebaixar("conflito", "nao_identificado")).toBe("nao_identificado");
    expect(rebaixar("nao_identificado", "alta")).toBe("nao_identificado");
  });

  it("é idempotente e comutativo — a ordem de aplicação não muda o resultado", () => {
    expect(rebaixar("alta", "alta")).toBe("alta");
    expect(rebaixar(rebaixar("alta", "media"), "baixa")).toBe("baixa");
    expect(rebaixar(rebaixar("alta", "baixa"), "media")).toBe("baixa");
  });
});

describe("data — o campo que decide a FATURA", () => {
  it("data válida e recente mantém a confiança do modelo", () => {
    const c = avaliarData({ valor: "2026-08-07", confianca: "media" }, HOJE);
    expect(c).toEqual({ valor: "2026-08-07", confianca: "media", motivo: null });
  });

  it("hoje é aceito — não é futuro", () => {
    expect(avaliarData({ valor: HOJE, confianca: "alta" }, HOJE).confianca).toBe("alta");
  });

  it("⛔ data no FUTURO é rebaixada, mesmo com o modelo dizendo `alta`", () => {
    const c = avaliarData({ valor: "2026-08-09", confianca: "alta" }, HOJE);
    expect(c.confianca).toBe("baixa");
    expect(c.motivo).toContain("futuro");
    // O valor NÃO é descartado: o dono precisa ver o que foi lido para corrigir.
    expect(c.valor).toBe("2026-08-09");
  });

  it("data com mais de 2 anos é rebaixada", () => {
    expect(avaliarData({ valor: "2024-08-07", confianca: "alta" }, HOJE).confianca).toBe(
      "baixa",
    );
    // Exatamente 2 anos ainda passa — o limite é "mais de".
    expect(avaliarData({ valor: "2024-08-08", confianca: "alta" }, HOJE).confianca).toBe(
      "alta",
    );
  });

  it("⛔ 31 de fevereiro NÃO é 'confiança baixa' — não é uma data", () => {
    const c = avaliarData({ valor: "2026-02-31", confianca: "alta" }, HOJE);
    expect(c.confianca).toBe("nao_identificado");
    expect(c.valor).toBeNull();
  });

  it("formato errado é não identificado, não uma tentativa de conversão", () => {
    for (const ruim of ["07/08/2026", "2026-8-7", "ontem", "", "  "]) {
      expect(avaliarData({ valor: ruim, confianca: "alta" }, HOJE).confianca).toBe(
        "nao_identificado",
      );
    }
  });

  it("ehDataPuraValida rejeita mês e dia fora de faixa", () => {
    expect(ehDataPuraValida("2026-13-01")).toBe(false);
    expect(ehDataPuraValida("2026-00-10")).toBe(false);
    expect(ehDataPuraValida("2026-02-29")).toBe(false); // 2026 não é bissexto
    expect(ehDataPuraValida("2024-02-29")).toBe(true); // 2024 é
  });
});

describe("total", () => {
  it("valor plausível mantém a confiança", () => {
    expect(avaliarTotal({ valor: 4790, confianca: "media" })).toEqual({
      valor: 4790,
      confianca: "media",
      motivo: null,
    });
  });

  it("⛔ zero NÃO é um total — é rebaixado", () => {
    const c = avaliarTotal({ valor: 0, confianca: "alta" });
    expect(c.confianca).toBe("baixa");
    expect(c.motivo).toContain("zero");
  });

  it("negativo é rebaixado", () => {
    expect(avaliarTotal({ valor: -500, confianca: "alta" }).confianca).toBe("baixa");
  });

  it("valor absurdo é rebaixado — é o sintoma de vírgula lida errado", () => {
    // R$ 1.234,56 lido como 123456 reais em vez de centavos daria 12345600 centavos.
    const c = avaliarTotal({ valor: TETO_PLAUSIVEL_CENTAVOS + 1, confianca: "alta" });
    expect(c.confianca).toBe("baixa");
    expect(c.motivo).toContain("vírgula");
    // Exatamente no teto ainda passa.
    expect(avaliarTotal({ valor: TETO_PLAUSIVEL_CENTAVOS, confianca: "alta" }).confianca).toBe(
      "alta",
    );
  });

  it("ausente é não identificado", () => {
    const c = avaliarTotal({ valor: null, confianca: "alta" });
    expect(c.confianca).toBe("nao_identificado");
    expect(c.valor).toBeNull();
  });

  it("não inteiro é não identificado — centavos são inteiros", () => {
    expect(avaliarTotal({ valor: 47.9, confianca: "alta" }).confianca).toBe(
      "nao_identificado",
    );
  });
});

describe("⛔ conflito: a soma dos itens contra o total", () => {
  const item = (centavos: number | null): ItemDaNota => ({
    descricao: "x",
    valorTotalCentavos: centavos,
    quantidade: 1,
    confianca: centavos === null ? "nao_identificado" : "alta",
  });

  const total: Campo<number> = { valor: 1000, confianca: "alta", motivo: null };

  it("soma que bate não mexe em nada", () => {
    expect(confrontarItens(total, [item(600), item(400)])).toEqual(total);
  });

  it("soma que NÃO bate vira `conflito` — não `baixa`", () => {
    // A distinção importa na tela: "baixa" sugere olhar com atenção; "conflito" diz que há
    // duas informações na mesma nota que não podem ser as duas verdadeiras.
    const c = confrontarItens(total, [item(600), item(300)]);
    expect(c.confianca).toBe("conflito");
    expect(c.motivo).toContain("não bate");
    expect(c.valor).toBe(1000);
  });

  it("⛔ com item ILEGÍVEL não acusa conflito", () => {
    // A soma seria menor por construção, e acusar conflito bloquearia toda nota
    // parcialmente legível — punindo o dono duas vezes pelo mesmo defeito.
    expect(confrontarItens(total, [item(600), item(null)])).toEqual(total);
  });

  it("nota sem itens não acusa conflito", () => {
    expect(confrontarItens(total, [])).toEqual(total);
  });

  it("total não identificado não vira conflito", () => {
    const semTotal: Campo<number> = {
      valor: null,
      confianca: "nao_identificado",
      motivo: "x",
    };
    expect(confrontarItens(semTotal, [item(600)])).toEqual(semTotal);
  });
});

describe("avaliarExtracao", () => {
  it("campo de texto vazio vira não identificado", () => {
    const e = avaliarExtracao(
      { ...BRUTA_OK, estabelecimento: { valor: "   ", confianca: "alta" } },
      HOJE,
    );
    expect(e.estabelecimento.confianca).toBe("nao_identificado");
    expect(e.estabelecimento.valor).toBeNull();
  });

  it("item sem valor vira não identificado, nunca zero", () => {
    const e = avaliarExtracao(
      {
        ...BRUTA_OK,
        itens: [
          { descricao: "Pão", valorTotalCentavos: null, quantidade: 2, confianca: "alta" },
        ],
      },
      HOJE,
    );
    expect(e.itens[0].valorTotalCentavos).toBeNull();
    expect(e.itens[0].confianca).toBe("nao_identificado");
  });

  it("o confronto de itens é aplicado dentro da avaliação", () => {
    const e = avaliarExtracao(
      {
        ...BRUTA_OK,
        totalCentavos: { valor: 1000, confianca: "alta" },
        itens: [
          { descricao: "a", valorTotalCentavos: 300, quantidade: 1, confianca: "alta" },
        ],
      },
      HOJE,
    );
    expect(e.totalCentavos.confianca).toBe("conflito");
  });
});

describe("⛔ podePropor — o bloqueio, não o aviso", () => {
  const boa = avaliarExtracao(BRUTA_OK, HOJE);

  it("extração boa libera", () => {
    expect(podePropor(boa)).toEqual({ pode: true });
  });

  it("total incerto BLOQUEIA", () => {
    const v = podePropor({
      ...boa,
      totalCentavos: { valor: 4790, confianca: "baixa", motivo: "x" },
    });
    expect(v.pode).toBe(false);
    if (!v.pode) expect(v.campos).toContain("valor total");
  });

  it("total em CONFLITO bloqueia", () => {
    const v = podePropor({
      ...boa,
      totalCentavos: { valor: 4790, confianca: "conflito", motivo: "x" },
    });
    expect(v.pode).toBe(false);
  });

  it("data incerta BLOQUEIA", () => {
    const v = podePropor({
      ...boa,
      data: { valor: null, confianca: "nao_identificado", motivo: "x" },
    });
    expect(v.pode).toBe(false);
    if (!v.pode) expect(v.campos).toContain("data da compra");
  });

  it("os dois incertos aparecem os dois na mensagem", () => {
    const v = podePropor({
      ...boa,
      totalCentavos: { valor: null, confianca: "nao_identificado", motivo: "x" },
      data: { valor: null, confianca: "nao_identificado", motivo: "x" },
    });
    expect(v.pode).toBe(false);
    if (!v.pode) {
      expect(v.campos).toHaveLength(2);
      expect(v.motivo).toContain("valor total e data da compra");
    }
  });

  it("estabelecimento ilegível NÃO bloqueia — vira descrição, e o dono corrige", () => {
    const v = podePropor({
      ...boa,
      estabelecimento: { valor: null, confianca: "nao_identificado", motivo: "x" },
    });
    expect(v.pode).toBe(true);
  });

  it("`media` não bloqueia — só `baixa` para baixo", () => {
    expect(
      podePropor({
        ...boa,
        totalCentavos: { valor: 4790, confianca: "media", motivo: null },
      }).pode,
    ).toBe(true);
  });

  it("⛔ a correção do dono destrava, e fica registrado que foi ELE", () => {
    const corrigida = { ...boa, totalCentavos: corrigir(5000) };
    expect(podePropor(corrigida)).toEqual({ pode: true });
    // A tela precisa distinguir "o modelo leu com clareza" de "o dono digitou".
    expect(corrigida.totalCentavos.motivo).toBe("Preenchido por você.");
    expect(corrigida.totalCentavos.confianca).toBe("alta");
  });
});
