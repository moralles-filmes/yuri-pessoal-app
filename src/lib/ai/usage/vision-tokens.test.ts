/**
 * Fase 18-D — IA · A estimativa de tokens de um arquivo.
 *
 * A propriedade que estes testes existem para proteger é UMA: **ausência de medida nunca
 * vira zero**. É a invariante 1 da Dieta aplicada ao custo, e o modo de falhar é silencioso
 * — uma imagem estimada em 0 token passa em qualquer orçamento, e o estouro só aparece na
 * fatura do provedor.
 *
 * Os números abaixo estão calculados à mão nos comentários. Um teste que recalculasse a
 * fórmula com as constantes importadas não teria como falhar sem a implementação falhar
 * junto — foi a armadilha nº 1 da 18-B, seis vezes numa subfase só.
 */

import { describe, expect, it } from "vitest";
import { estimarTokensDoArquivo, estimarTokensDosArquivos } from "./vision-tokens";

describe("imagem", () => {
  it("mede pelas dimensões quando o cabeçalho as informou", () => {
    // 3000 × 2000 = 6.000.000 px = 6,0 MP · 6 × 2000 = 12.000 tokens
    const e = estimarTokensDoArquivo({
      especie: "imagem",
      larguraPx: 3000,
      alturaPx: 2000,
    });
    expect(e.tokens).toBe(12_000);
    expect(e.base).toBe("medido");
    expect(e.explicacao).toContain("3000×2000");
  });

  it("arredonda para CIMA — foto pequena não pode custar menos do que custa", () => {
    // 100 × 100 = 10.000 px = 0,01 MP · 0,01 × 2000 = 20 tokens exatos
    expect(
      estimarTokensDoArquivo({ especie: "imagem", larguraPx: 100, alturaPx: 100 }).tokens,
    ).toBe(20);

    // 101 × 100 = 10.100 px = 0,0101 MP · × 2000 = 20,2 → 21, nunca 20
    expect(
      estimarTokensDoArquivo({ especie: "imagem", larguraPx: 101, alturaPx: 100 }).tokens,
    ).toBe(21);
  });

  it("⛔ SEM DIMENSÃO NÃO É ZERO: cai no teto de 24 MP", () => {
    // 24 MP × 2000 = 48.000 tokens
    const e = estimarTokensDoArquivo({
      especie: "imagem",
      larguraPx: null,
      alturaPx: null,
    });
    expect(e.tokens).toBe(48_000);
    expect(e.base).toBe("teto");
    expect(e.explicacao).toContain("não identificadas");
  });

  it("dimensão parcial também é ausência — largura sem altura cai no teto", () => {
    // Meia medida não é medida: 3000 px de largura não diz nada sobre a área.
    expect(
      estimarTokensDoArquivo({ especie: "imagem", larguraPx: 3000, alturaPx: null }).tokens,
    ).toBe(48_000);
    expect(
      estimarTokensDoArquivo({ especie: "imagem", larguraPx: null, alturaPx: 2000 }).base,
    ).toBe("teto");
  });

  it("dimensão absurda é limitada ao teto, mas continua MEDIDA", () => {
    // 8000 × 8000 = 64 MP → limitado a 24 MP → 48.000 tokens.
    // `base` continua "medido": o cabeçalho FOI lido. A distinção importa para a tela, que
    // diz coisas diferentes em "não consegui medir" e "medi, e é grande demais".
    const e = estimarTokensDoArquivo({
      especie: "imagem",
      larguraPx: 8000,
      alturaPx: 8000,
    });
    expect(e.tokens).toBe(48_000);
    expect(e.base).toBe("medido");
  });

  it("zero e negativo são ausência, não medida", () => {
    // Um cabeçalho corrompido pode devolver 0. Zero px NÃO é uma imagem de custo zero.
    expect(
      estimarTokensDoArquivo({ especie: "imagem", larguraPx: 0, alturaPx: 2000 }).tokens,
    ).toBe(48_000);
    expect(
      estimarTokensDoArquivo({ especie: "imagem", larguraPx: -10, alturaPx: 2000 }).base,
    ).toBe("teto");
  });

  it("NaN é ausência", () => {
    expect(
      estimarTokensDoArquivo({ especie: "imagem", larguraPx: Number.NaN, alturaPx: 100 })
        .base,
    ).toBe("teto");
  });
});

describe("pdf", () => {
  it("mede por página quando a contagem existe", () => {
    // 2 páginas × 3000 = 6.000 tokens
    const e = estimarTokensDoArquivo({ especie: "pdf", paginas: 2 });
    expect(e.tokens).toBe(6_000);
    expect(e.base).toBe("medido");
  });

  it("⛔ SEM CONTAGEM NÃO É ZERO: cai no teto de 20 páginas", () => {
    // 20 × 3000 = 60.000 tokens
    const e = estimarTokensDoArquivo({ especie: "pdf", paginas: null });
    expect(e.tokens).toBe(60_000);
    expect(e.base).toBe("teto");
  });

  it("contagem acima do teto é limitada", () => {
    // 500 páginas → limitado a 20 → 60.000
    expect(estimarTokensDoArquivo({ especie: "pdf", paginas: 500 }).tokens).toBe(60_000);
  });

  it("zero páginas é ausência, não um PDF de graça", () => {
    expect(estimarTokensDoArquivo({ especie: "pdf", paginas: 0 }).tokens).toBe(60_000);
  });
});

describe("conjunto", () => {
  it("soma os arquivos", () => {
    // (2 MP × 2000 = 4.000) + (1 página × 3000 = 3.000) = 7.000
    const e = estimarTokensDosArquivos([
      { especie: "imagem", larguraPx: 2000, alturaPx: 1000 },
      { especie: "pdf", paginas: 1 },
    ]);
    expect(e.tokens).toBe(7_000);
    expect(e.base).toBe("medido");
  });

  it("⛔ A QUALIDADE VIAJA COM O NÚMERO: um no teto faz o conjunto ser teto", () => {
    // Três medidos e um estimado é um conjunto ESTIMADO. Regra 15 da Dieta.
    const e = estimarTokensDosArquivos([
      { especie: "imagem", larguraPx: 2000, alturaPx: 1000 },
      { especie: "imagem", larguraPx: null, alturaPx: null },
    ]);
    expect(e.base).toBe("teto");
    // 4.000 + 48.000 = 52.000
    expect(e.tokens).toBe(52_000);
  });

  it("conjunto vazio é zero — aqui o zero é fato, não ausência", () => {
    const e = estimarTokensDosArquivos([]);
    expect(e.tokens).toBe(0);
    expect(e.base).toBe("medido");
  });
});
