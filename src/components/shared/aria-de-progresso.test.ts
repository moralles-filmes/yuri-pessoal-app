import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ariaDeProgresso } from "./aria-de-progresso";

describe("ariaDeProgresso — barra com nome e valor real (REDESIGN-07-C · V)", () => {
  it("dá nome à barra e diz o percentual", () => {
    expect(ariaDeProgresso("Água do dia", 42.4)).toEqual({
      role: "progressbar",
      "aria-label": "Água do dia",
      "aria-valuemin": 0,
      "aria-valuemax": 100,
      "aria-valuenow": 42,
      "aria-valuetext": "42%",
    });
  });

  it("acima de 100%: aria-valuenow fica no máximo, e o texto diz o valor real", () => {
    const aria = ariaDeProgresso("Energia", 120, "120% da meta");
    expect(aria["aria-valuenow"]).toBe(100);
    expect(aria["aria-valuetext"]).toBe("120% da meta");
  });

  it("abaixo de zero não vira valor negativo", () => {
    expect(ariaDeProgresso("Peso", -5)["aria-valuenow"]).toBe(0);
  });

  it("sem percentual: nenhum aria-valuenow — \"0%\" mentiria", () => {
    const aria = ariaDeProgresso("Proteína", null);
    expect(aria["aria-valuenow"]).toBeUndefined();
    expect(aria["aria-valuetext"]).toBe("sem percentual");
    expect(aria["aria-valuetext"]).not.toMatch(/0%/);
  });

  it("NaN e Infinity contam como sem percentual", () => {
    expect(ariaDeProgresso("x", Number.NaN)["aria-valuenow"]).toBeUndefined();
    expect(ariaDeProgresso("x", Number.POSITIVE_INFINITY)["aria-valuenow"]).toBeUndefined();
  });

  it("não tem import (a tela o lê e ele não pode arrastar nada ao bundle)", () => {
    const fonte = fs.readFileSync(path.join(__dirname, "aria-de-progresso.ts"), "utf8");
    expect(fonte).not.toMatch(/^\s*import\s/m);
  });
});
