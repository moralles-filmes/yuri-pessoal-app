/** 03-G2 K3 — a exclusão em Lançamentos confere antes de confirmar (o projeto não tem teste de componente). */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const DIALOGO = path.resolve(__dirname, "..", "..", "components", "financeiro", "delete-confirm-dialog.tsx");
const LANCAMENTOS = path.resolve(
  __dirname, "..", "..", "app", path.join("(app)"), "financeiro", "lancamentos", "transactions-client.tsx",
);
const semComentarios = (c: string) => c.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
const DLG = semComentarios(fs.readFileSync(DIALOGO, "utf8"));
const LAN = semComentarios(fs.readFileSync(LANCAMENTOS, "utf8"));

describe("03-G2 K3 · a exclusão em Lançamentos confere antes de confirmar", () => {
  it("(Y11) o botão Excluir do diálogo é travado por podeConfirmar", () => {
    expect(DLG).toMatch(/disabled=\{[^}]*!podeConfirmar\(previsao\)/);
  });

  it("a previsão é carregada só no abrir, nunca no corpo do componente", () => {
    const ocorrencias = DLG.match(/carregarPrevisao\(\)/g) ?? [];
    expect(ocorrencias).toHaveLength(1);

    const posicao = DLG.indexOf("carregarPrevisao()");
    const inicioAbertura = DLG.indexOf("function aoMudarAbertura");
    const inicioRetorno = DLG.indexOf("return (");
    expect(inicioAbertura).toBeGreaterThan(-1);
    expect(posicao).toBeGreaterThan(inicioAbertura);
    expect(posicao).toBeLessThan(inicioRetorno);

    expect(DLG).not.toMatch(/useEffect/);
  });

  it("(Y12) Lançamentos passa carregarPrevisao com a previsão do servidor", () => {
    expect(LAN).toContain("carregarPrevisao={() => preverExclusaoDoLancamento(t.id)}");
  });
});
