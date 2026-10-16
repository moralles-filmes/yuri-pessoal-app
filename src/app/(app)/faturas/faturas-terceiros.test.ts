// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const semComentarios = (c: string) => c.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

describe("03-D · B1b — parte dos terceiros nas faturas e parcelamentos", () => {
  it.each([
    ["faturas", "statements-client.tsx"],
    ["parcelamentos", "installments-client.tsx"],
  ])("%s usa a regra única e mostra o perdoado", (pasta, arquivo) => {
    const FONTE = semComentarios(
      fs.readFileSync(path.join(process.cwd(), "src", "app", "(app)", pasta, arquivo), "utf8"),
    );
    const imports = [...FONTE.matchAll(/import\s*\{([^}]+)\}\s*from\s*["']@\/lib\/finance\/recebimentos["']/g)]
      .map((m) => m[1]).join(" ");
    expect(imports).toMatch(/\b(somaDaParteDosTerceiros|parteDoTerceiroCentavos)\b/);
    expect(imports).toMatch(/\bfraseDoPerdoado\b/);
    expect(FONTE).not.toMatch(/sum \+ r\.valor|\+ r\.valor\)|\+= r\.valor/);
  });
});
