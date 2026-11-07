/**
 * REDESIGN-06 T8 — o card Financeiro do dashboard geral, por varredura do código-fonte (o projeto
 * não tem teste de componente — invariante 25). Sem comentários, para a prosa não casar por engano.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const codigo = readFileSync(join(__dirname, "finance-card.tsx"), "utf8")
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

describe("06 T8 · FinanceCard", () => {
  it.each([
    "Realmente meu",
    "movimentados",
    "<BarrasEntradasSaidasChart",
    "Ver relatório",
    "/relatorios",
    "rotuloPendenteDoMes(",
    "Próximas contas a pagar",
  ])("contém %s", (trecho) => {
    expect(codigo).toContain(trecho);
  });

  it.each(["getFinanceCardData", "apresentarEntradas", "Saldo das contas"])("não contém %s", (trecho) => {
    expect(codigo).not.toContain(trecho);
  });
});
