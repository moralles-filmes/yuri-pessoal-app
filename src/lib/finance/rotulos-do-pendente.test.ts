// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const semComentarios = (c: string) => c.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

describe("03-D · B2 — rótulos distintos do pendente", () => {
  it.each([
    ["src/components/dashboard/general/finance-card.tsx", "rotuloPendenteDoMes("],
    ["src/components/dashboard/general/invoices-card.tsx", "rotuloTotalPendenteAte("],
    ["src/app/(app)/dashboard/financeiro/financial-dashboard-client.tsx", "rotuloPendenteDoMes("],
    ["src/app/(app)/relatorios/relatorios-client.tsx", "rotuloPendenteDoMes("],
  ])("%s distingue o pendente do mês do total", (arquivo, rotulo) => {
    const FONTE = semComentarios(
      fs.readFileSync(path.join(process.cwd(), arquivo), "utf8"),
    );
    expect(FONTE).not.toContain("A receber de terceiros");
    expect(FONTE).toContain(rotulo);
  });
});
