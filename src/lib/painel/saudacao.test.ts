import { describe, expect, it } from "vitest";
import { termosProibidosEm } from "@/lib/tone/vocabulary";
import { FRASES_DO_BANNER, fraseDoDia, saudacaoPara } from "./saudacao";

describe("saudacaoPara", () => {
  it("respeita as bordas de cada faixa", () => {
    expect(saudacaoPara("04:59")).toBe("Boa noite");
    expect(saudacaoPara("05:00")).toBe("Bom dia");
    expect(saudacaoPara("11:59")).toBe("Bom dia");
    expect(saudacaoPara("12:00")).toBe("Boa tarde");
    expect(saudacaoPara("17:59")).toBe("Boa tarde");
    expect(saudacaoPara("18:00")).toBe("Boa noite");
  });

  it("meia-noite e fim do dia são noite", () => {
    expect(saudacaoPara("00:00")).toBe("Boa noite");
    expect(saudacaoPara("23:59")).toBe("Boa noite");
  });
});

describe("fraseDoDia", () => {
  const lista = ["Frase A", "Frase B", "Frase C"];

  it("o mesmo dia devolve sempre a mesma frase", () => {
    expect(fraseDoDia("2026-11-02", lista)).toBe(fraseDoDia("2026-11-02", lista));
  });

  it("dias consecutivos percorrem a lista, inclusive na virada do mês e do ano", () => {
    const dias = ["2026-11-29", "2026-11-30", "2026-12-01"];
    const frases = dias.map((d) => fraseDoDia(d, lista));
    expect(new Set(frases).size).toBe(3);
    const virada = ["2026-12-31", "2027-01-01", "2027-01-02"].map((d) => fraseDoDia(d, lista));
    expect(new Set(virada).size).toBe(3);
  });

  it("a lista dá a volta depois de tantos dias quanto ela tem de frases", () => {
    expect(fraseDoDia("2026-11-05", lista)).toBe(fraseDoDia("2026-11-02", lista));
    expect(fraseDoDia("2026-11-03", lista)).not.toBe(fraseDoDia("2026-11-02", lista));
  });

  it("conta os dias desde 1970-01-01 (índice 0 no primeiro dia)", () => {
    expect(fraseDoDia("1970-01-01", lista)).toBe("Frase A");
    expect(fraseDoDia("1970-01-02", lista)).toBe("Frase B");
    expect(fraseDoDia("1970-01-04", lista)).toBe("Frase A");
  });
});

describe("FRASES_DO_BANNER", () => {
  it("tem ao menos 8 frases, curtas e sem repetição", () => {
    expect(FRASES_DO_BANNER.length).toBeGreaterThanOrEqual(8);
    expect(new Set(FRASES_DO_BANNER).size).toBe(FRASES_DO_BANNER.length);
    for (const f of FRASES_DO_BANNER) {
      expect(f.trim()).toBe(f);
      expect(f.length).toBeGreaterThan(0);
      expect(f.length).toBeLessThanOrEqual(80);
    }
  });

  it("nenhuma frase cobra nem prescreve", () => {
    for (const f of FRASES_DO_BANNER) {
      expect(termosProibidosEm(f), f).toEqual([]);
    }
  });
});
