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

  // Revisão final da 03-F (F2, F3, F4a).
  const confirmar = normalizada(dialogo).slice(normalizada(dialogo).indexOf("async function handleConfirm"));

  it("a confirmação manda o lançamento DA LEITURA, não um relido nem null fixo", () => {
    expect(confirmar.length).toBeGreaterThan(200);
    const chamada = confirmar.indexOf("markStatementUnpaid(statementId, lancamentoId)");
    const origem = confirmar.indexOf("leitura.previsao.lancamentoId");
    expect(origem).toBeGreaterThan(-1);
    expect(chamada).toBeGreaterThan(origem);
  });

  it("depois de uma recusa o diálogo lê de novo — não oferece o botão preso ao lançamento velho", () => {
    expect(confirmar).toContain("setReleitura(");
    expect(normalizada(dialogo)).toContain("[statementId, releitura]");
  });

  it("o texto que chega depois da leitura é anunciado ao leitor de tela", () => {
    expect(normalizada(dialogo)).toContain('aria-live="polite"');
  });
});

const PAGAR = "src/app/(app)/faturas/pagar-fatura-dialog.tsx";

describe("03-F B2 · a recusa de data futura chega ao campo", () => {
  // 05-B: o diálogo de pagamento saiu da tela para o arquivo próprio; a regra é a mesma.
  const pagarDialogo = normalizada(fonteSemComentarios(PAGAR));

  it("leu o diálogo de pagamento (não afirma sobre trecho vazio)", () => {
    expect(pagarDialogo.length).toBeGreaterThan(500);
  });

  it("o campo de data tem max={today}", () => {
    expect(pagarDialogo).toContain("max={today}");
  });

  it("a recusa de data (desfecho 'data') vira erro sob o campo, ligado por aria-describedby", () => {
    expect(pagarDialogo).toContain('case "data"');
    expect(pagarDialogo).toContain("setErroData(");
    expect(pagarDialogo).toContain("aria-describedby=");
    expect(pagarDialogo).toContain("aria-invalid=");
  });
});

describe("05-B · pagamento", () => {
  const tela = fonteSemComentarios(TELA);
  const dialogo = fonteSemComentarios(PAGAR);

  it("leu os dois arquivos (não afirma sobre string vazia)", () => {
    expect(tela.length).toBeGreaterThan(500);
    expect(dialogo.length).toBeGreaterThan(500);
  });

  it("a tela carrega o diálogo sob demanda e não chama markStatementPaid", () => {
    expect(normalizada(tela)).toContain('dynamic(() => import("./pagar-fatura-dialog")');
    expect(tela.split("useLazyDialog(").length - 1).toBeGreaterThanOrEqual(2);
    expect(tela).not.toContain("markStatementPaid");
  });

  it("só o diálogo paga, e uma vez só (no envio)", () => {
    expect(dialogo.split("markStatementPaid(").length - 1).toBe(1);
  });

  it("o desfecho sai de desfechoDoPagamento e o clique duplo é barrado por ref", () => {
    expect(dialogo).toContain("desfechoDoPagamento(");
    expect(dialogo).toContain("useRef");
  });

  it("o diálogo cresce até sm:max-w-md e diz a verdade sobre o reenvio", () => {
    expect(dialogo).toContain("sm:max-w-md");
    expect(dialogo).toContain("Nada foi debitado de novo");
    expect(dialogo).toContain("Tentar de novo é seguro");
  });
});

describe("05-B · tela", () => {
  const tela = fonteSemComentarios(TELA);
  const telaN = normalizada(tela);
  const pagina = fonteSemComentarios("src/app/(app)/faturas/page.tsx");
  const nav = fonteSemComentarios("src/components/cartoes/cartoes-nav.ts");

  it("leu os arquivos (não afirma sobre string vazia)", () => {
    expect(tela.length).toBeGreaterThan(500);
    expect(pagina.length).toBeGreaterThan(200);
    expect(nav.length).toBeGreaterThan(100);
  });

  it("a tela importa a organização, o rótulo e as peças do painel", () => {
    expect(tela).toContain("organizarFaturasDoCartao");
    expect(tela).toContain("rotuloDoEstado");
    expect(tela).toMatch(/import\s*\{[^}]*\bIndicador\b[^}]*\}/);
    expect(tela).toMatch(/import\s*\{[^}]*\bBloco\b[^}]*\}/);
  });

  it("a tela não usa mais StatCard, StatementStatusBadge, resolverFatura nem capitalize", () => {
    expect(tela).not.toContain("StatCard");
    expect(tela).not.toContain("StatementStatusBadge");
    expect(tela).not.toContain("resolverFatura");
    expect(tela).not.toContain("capitalize");
  });

  it("a fatura prevista diz 'sem lançamentos conhecidos' em vez de R$ 0,00", () => {
    expect(telaN).toContain("sem lançamentos conhecidos");
  });

  it("a página e a navegação se chamam 'Faturas e pagamentos'", () => {
    expect(pagina).toContain('"Faturas e pagamentos"');
    expect(normalizada(nav)).toContain('title: "Faturas e pagamentos"');
  });
});
