/**
 * REDESIGN-07-C · D4 — o mês do diário: célula e legenda da MESMA fonte, e cada dia em
 * palavras. Dados sintéticos; `hoje` injetado.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { MonthDayCell } from "@/lib/nutrition/diary-month";
import { semComentarios } from "@/test/links-inline";
import { ORDEM_DOS_TONS, TONS_DO_MES, tomDaCelula } from "./tons-do-mes";
import { textoDaCelulaDoMes } from "./rotulos-do-mes";

const celula = (over: Partial<MonthDayCell>): MonthDayCell => ({
  date: "2026-10-08",
  inMonth: true,
  isToday: false,
  isFuture: false,
  hasRecord: true,
  meals: 3,
  entries: 7,
  energyKcal: 1800,
  quality: "exato",
  targetKcal: 2000,
  goalPercent: 90,
  adherence: 90,
  planned: 0,
  pending: 0,
  ...over,
});

describe("tomDaCelula — os mesmos limites de antes", () => {
  it.each([
    [{ hasRecord: false, energyKcal: null, goalPercent: null }, "sem_registro"],
    [{ goalPercent: null, targetKcal: null }, "sem_meta"],
    [{ goalPercent: 111 }, "acima"],
    [{ goalPercent: 110 }, "na_meta"],
    [{ goalPercent: 90 }, "na_meta"],
    [{ goalPercent: 89.9 }, "perto"],
    [{ goalPercent: 60 }, "perto"],
    [{ goalPercent: 59.9 }, "abaixo"],
    [{ goalPercent: 0 }, "abaixo"],
  ] as const)("%o → %s", (over, tom) => {
    expect(tomDaCelula(celula(over))).toBe(tom);
  });

  it("a legenda cobre todos os tons, na ordem declarada", () => {
    expect([...ORDEM_DOS_TONS].sort()).toEqual(Object.keys(TONS_DO_MES).sort());
  });

  it("nenhum rótulo julga (invariante 25 da Dieta)", () => {
    for (const { rotulo } of Object.values(TONS_DO_MES)) {
      expect(rotulo).not.toMatch(/bom|ruim|excesso|falha|errad|cuidado/i);
    }
  });
});

describe("a tela pinta célula e legenda só com TONS_DO_MES", () => {
  const fonte = semComentarios(
    fs.readFileSync(path.resolve(__dirname, "diary-month-view.tsx"), "utf8"),
  );

  it("a célula lê a classe da fonte única", () => {
    expect(fonte).toMatch(/TONS_DO_MES\[tomDaCelula\(cell\)\]\.classe/);
  });

  it("a legenda percorre ORDEM_DOS_TONS (sem amostras próprias)", () => {
    expect(fonte).toMatch(/ORDEM_DOS_TONS\.map\(/);
    expect(fonte).not.toMatch(/size-2\.5 rounded-sm bg-(muted|primary|destructive)/);
  });

  it("o tom não é mais decidido na tela", () => {
    expect(fonte).not.toMatch(/function cellTone/);
  });
});

describe("textoDaCelulaDoMes — o dia em palavras", () => {
  const HOJE = "2026-10-11";

  it("data por extenso, hoje e a leitura de cellLabel", () => {
    expect(textoDaCelulaDoMes(celula({ date: HOJE, isToday: true }), HOJE)).toBe(
      "11 de outubro de 2026 · hoje · 1800 kcal · 90% da meta · 7 item(ns) em 3 refeição(ões)",
    );
  });

  it("dia de fora do mês é dito", () => {
    expect(textoDaCelulaDoMes(celula({ date: "2026-09-30", inMonth: false }), HOJE)).toMatch(
      /^30 de setembro de 2026 · fora do mês · /,
    );
  });

  it("dia passado com planejamento e sem registro: não fica só 'Sem registro'", () => {
    const texto = textoDaCelulaDoMes(
      celula({ hasRecord: false, energyKcal: null, goalPercent: null, planned: 2, meals: 0, entries: 0 }),
      HOJE,
    );
    expect(texto).toBe("8 de outubro de 2026 · Sem registro · 2 refeições planejadas, sem registro");
  });

  it("refeição pendente é dita, no singular e no plural", () => {
    expect(textoDaCelulaDoMes(celula({ pending: 1 }), HOJE)).toMatch(/· 1 refeição pendente$/);
    expect(textoDaCelulaDoMes(celula({ pending: 2 }), HOJE)).toMatch(/· 2 refeições pendentes$/);
  });

  it("hoje fora da grade: nenhuma célula diz 'hoje'", () => {
    expect(textoDaCelulaDoMes(celula({}), "2026-12-25")).not.toMatch(/hoje/);
  });
});
