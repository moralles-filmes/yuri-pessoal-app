/**
 * REDESIGN-09-B — as primitivas em vidro, provadas por chamada direta de `cva`/`cn`
 * (o projeto não tem teste de componente). Um `describe` por primitiva.
 */
import { describe, expect, it } from "vitest";
import { ALFA_PERIGO } from "@/lib/theme/alfas";
import { buttonVariants } from "./button";

describe("Button", () => {
  const padrao = buttonVariants();

  it("é pílula, com preenchimento primário, mola e movimento reduzido", () => {
    for (const classe of [
      "rounded-full",
      "bg-primary-fill",
      "text-primary-fill-foreground",
      "ease-mola",
      "motion-reduce:",
    ]) {
      expect(padrao, classe).toContain(classe);
    }
  });

  it("não conserva o deslocamento nem o azul antigo", () => {
    expect(padrao).not.toContain("translate-y-px");
    expect(padrao).not.toMatch(/bg-primary(\s|$|\/)/);
    expect(padrao).not.toContain("hover:bg-primary/80");
    expect(padrao).toContain("hover:brightness-110");
  });

  it("a escala de pressão só vale fora de gatilho de menu (aria-haspopup)", () => {
    expect(padrao).toMatch(/not-aria-\[haspopup\]:active:scale/);
    // nenhum `active:scale` sem o prefixo (o twMerge não o removeria do gatilho de menu)
    for (const m of padrao.matchAll(/(\S*)active:scale\S*/g)) {
      expect(m[1], m[0]).toMatch(/(^|:)not-aria-\[haspopup\]:$/);
    }
    // e o movimento reduzido fica parado: a escala só nasce sob `motion-safe:`
    expect(padrao).toContain("motion-safe:not-aria-[haspopup]:active:scale");
    expect(padrao).toContain("motion-reduce:transition-none");
  });

  it("foco por contorno, não por anel", () => {
    expect(padrao).toContain("focus-visible:outline-2");
    expect(padrao).toContain("focus-visible:outline-offset-2");
    expect(padrao).toContain("focus-visible:outline-ring");
    expect(padrao).not.toContain("focus-visible:ring-3");
  });

  const alturas = [
    ["default", "h-8"],
    ["xs", "h-6"],
    ["sm", "h-7"],
    ["lg", "h-9"],
    ["icon", "size-8"],
    ["icon-xs", "size-6"],
    ["icon-sm", "size-7"],
    ["icon-lg", "size-9"],
  ] as const;

  it.each(alturas)("tamanho %s mantém a altura %s e é pílula", (size, altura) => {
    const classes = buttonVariants({ size });
    expect(classes.split(/\s+/)).toContain(altura);
    expect(classes).not.toContain("rounded-[");
  });

  it("outline e secondary usam o material de pílula", () => {
    for (const variant of ["outline", "secondary"] as const) {
      const classes = buttonVariants({ variant });
      expect(classes, variant).toContain("bg-pill");
      expect(classes, variant).toContain("hover:bg-pill-strong");
    }
  });

  it("ghost não ganha azul no texto", () => {
    const classes = buttonVariants({ variant: "ghost" });
    expect(classes).toContain("hover:bg-primary/10");
    expect(classes).toContain("hover:text-foreground");
  });

  it("destructive usa o alfa medido na Task 1", () => {
    const classes = buttonVariants({ variant: "destructive" });
    const alfa = Math.round(ALFA_PERIGO * 100);
    expect(classes.split(/\s+/)).toContain(`bg-destructive/${alfa}`);
    expect(classes).toContain("text-destructive");
    expect(classes).toContain("border-destructive/25");
  });
});
