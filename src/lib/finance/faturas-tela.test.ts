/**
 * REDESIGN-03-F · A3 — o contrato da tela de /faturas, por varredura de fonte.
 *
 * O projeto não tem teste de componente (invariante 25): o que a tela promete é provado lendo o
 * código-fonte, SEM comentários (a explicação da regra cita os nomes que a regra proíbe).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function fonteSemComentarios(relativo: string): string {
  const bruto = readFileSync(join(process.cwd(), relativo), "utf8");
  return bruto.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/** Aspas simples/duplas viram duplas e todo espaço em branco vira um espaço só. */
function normalizada(fonte: string): string {
  return fonte.replace(/'/g, '"').replace(/\s+/g, " ");
}

const TELA = "src/app/(app)/faturas/statements-client.tsx";
const DIALOGO = "src/app/(app)/faturas/desfazer-pagamento-dialog.tsx";

describe("03-F A3 · o desfazer da tela passa pela confirmação", () => {
  const tela = fonteSemComentarios(TELA);
  const dialogo = fonteSemComentarios(DIALOGO);

  it("leu os dois arquivos (não afirma sobre string vazia)", () => {
    expect(tela.length).toBeGreaterThan(500);
    expect(dialogo.length).toBeGreaterThan(500);
  });

  it("statements-client não importa nem chama markStatementUnpaid", () => {
    expect(tela).not.toContain("markStatementUnpaid");
  });

  it("o diálogo entra por next/dynamic e por useLazyDialog", () => {
    expect(normalizada(tela)).toContain('dynamic(() => import("./desfazer-pagamento-dialog")');
    expect(tela).toContain("useLazyDialog(");
  });

  it("só o diálogo desfaz, e uma vez só (no handler de confirmação)", () => {
    expect(dialogo.split("markStatementUnpaid(").length - 1).toBe(1);
    expect(dialogo).toContain("preverDesfazerPagamento(");
  });

  it("o texto sai de textoDoDesfazer e o botão é destrutivo", () => {
    expect(dialogo).toContain("textoDoDesfazer(");
    expect(normalizada(dialogo)).toContain('variant="destructive"');
  });
});

describe("03-F B2 · a recusa de data futura chega ao campo", () => {
  const tela = normalizada(fonteSemComentarios(TELA));
  const inicio = tela.indexOf("function PayStatementDialog");
  // O trecho vai do diálogo até o fim do arquivo: é o último componente da tela.
  const pagarDialogo = tela.slice(inicio);

  it("achou o PayStatementDialog (não afirma sobre trecho vazio)", () => {
    expect(inicio).toBeGreaterThan(-1);
    expect(pagarDialogo.length).toBeGreaterThan(500);
  });

  it("o campo de data tem max={today}", () => {
    expect(pagarDialogo).toContain("max={today}");
  });

  it("o diálogo lê fieldErrors.dataPagamento para mostrar a recusa sob o campo", () => {
    expect(pagarDialogo).toContain("fieldErrors?.dataPagamento");
  });
});
