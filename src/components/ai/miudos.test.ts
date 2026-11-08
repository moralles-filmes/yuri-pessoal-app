import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import ts from "typescript";
const ler = (p: string) => readFileSync(p, "utf8");
function semComentarios(p: string) {
  const f = ts.createSourceFile(p, ler(p), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  return ts.createPrinter({ removeComments: true }).printFile(f);
}
describe("Task 27 — contratos da tela", () => {
  it("o cartão lê o relógio externo sem inicializar Date.now em useState", () => {
    const s = semComentarios("src/components/ai/proposal-card.tsx");
    expect(s).not.toMatch(/useState[^;]*Date\.now/);
    expect(s).toContain('from "./use-agora"');
    expect(s).toContain('useAgora(desfecho.tipo === "pendente")');
    expect(s).toContain('agora === null ? "Conferindo prazo…" :');
    expect(s).toMatch(/disabled=\{agora === null \|\| !vista\.podeConfirmar\}/);
    expect(s).toMatch(/disabled=\{agora === null \|\| !vista\.podeRecusar\}/);
    expect(s).toContain('proposta.expiresAt, agora ?? Number.NEGATIVE_INFINITY');
    expect(s).toContain('agora !== null && duplicataNoChat');
  });
  it("o nome da ação recebe min-w-0 e truncate no próprio texto", () => {
    expect(semComentarios("src/components/ai/action-history-client.tsx")).toMatch(/<span className="min-w-0 flex-auto truncate font-medium">\{acao\.rotuloDoCommand\}<\/span>/);
  });
  it("título, rótulo e valor dos insights cabem junto dos selos e links", () => {
    const s = semComentarios("src/components/ai/insights-client.tsx");
    expect(s).toMatch(/<CardTitle className="min-w-0 flex-auto truncate text-base">\{insight\.titulo\}/);
    expect(s).toMatch(/<span className="min-w-0 truncate text-muted-foreground">\{fonte\.rotulo\}/);
    expect(s).toMatch(/<span className="min-w-0 truncate font-medium">\{textoDaFonte\(fonte\)\}/);
  });
});
