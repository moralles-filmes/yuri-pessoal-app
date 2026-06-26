import { describe, expect, it } from "vitest";
import { bestStudyStreak, studyStreak } from "@/lib/studies/streak";

describe("studyStreak", () => {
  it("conta dias consecutivos até hoje", () => {
    const set = new Set(["2026-06-24", "2026-06-25", "2026-06-26"]);
    expect(studyStreak(set, "2026-06-26")).toBe(3);
  });

  it("hoje sem sessão NÃO quebra (dia em andamento), conta a partir de ontem", () => {
    const set = new Set(["2026-06-24", "2026-06-25"]);
    expect(studyStreak(set, "2026-06-26")).toBe(2);
  });

  it("lacuna em um dia passado quebra a sequência", () => {
    // Faltou 25; conta só hoje (26).
    const set = new Set(["2026-06-23", "2026-06-24", "2026-06-26"]);
    expect(studyStreak(set, "2026-06-26")).toBe(1);
  });

  it("nenhuma sessão → 0", () => {
    expect(studyStreak(new Set(), "2026-06-26")).toBe(0);
  });

  it("atravessa a virada de mês", () => {
    const set = new Set(["2026-05-30", "2026-05-31", "2026-06-01"]);
    expect(studyStreak(set, "2026-06-01")).toBe(3);
  });

  it("só hoje → 1", () => {
    expect(studyStreak(new Set(["2026-06-26"]), "2026-06-26")).toBe(1);
  });
});

describe("bestStudyStreak", () => {
  it("encontra o recorde dentro da janela", () => {
    // Sequências: {01,02,03}=3 e {10,11}=2 → recorde 3.
    const set = new Set([
      "2026-06-01",
      "2026-06-02",
      "2026-06-03",
      "2026-06-10",
      "2026-06-11",
    ]);
    expect(bestStudyStreak(set, "2026-06-01", "2026-06-30")).toBe(3);
  });

  it("janela sem sessões → 0", () => {
    expect(bestStudyStreak(new Set(), "2026-06-01", "2026-06-30")).toBe(0);
  });
});
