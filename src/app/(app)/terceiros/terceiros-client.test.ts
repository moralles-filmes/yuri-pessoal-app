/**
 * 03-D · A5, reescrito na 04-C · T8 — fiação da tela por varredura do fonte (o projeto não tem
 * teste de componente, invariante 25). A REGRA está em `recebimentos.test.ts`; aqui só se prova
 * que a tela a usa — e que o que SAIU (Receber, receber em massa, diálogo de registro) saiu.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const semComentarios = (c: string) => c.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
const ler = (...partes: string[]) =>
  semComentarios(fs.readFileSync(path.join(process.cwd(), "src", ...partes), "utf8"));
const FONTE = ler("app", "(app)", "terceiros", "terceiros-client.tsx");
const PAGINA = ler("app", "(app)", "terceiros", "page.tsx");

describe("04-C T8 — a tela de terceiros, por pessoa", () => {
  it("o topo usa o total pendente do Painel e o recebido do mês vem de recebidoDaPessoaNoPeriodo", () => {
    expect(FONTE).toContain("totalPendenteAte(");
    expect(FONTE).toContain("recebidoDaPessoaNoPeriodo(");
    expect(FONTE).toContain("entradasManuaisDoRecebivel(");
    expect(FONTE).not.toContain("reembolsosRecebidosNoPeriodo(");
    expect(FONTE).not.toContain("A receber de ${");
  });

  it("RR-D-21: a soma por pessoa sai de resumoDaPessoa, e a tela não faz conta própria de saldo", () => {
    expect(FONTE).toContain("resumoDaPessoa(");
    expect(FONTE).toContain("devidoCentavos");
    expect(FONTE).not.toContain("pendenteDoPeriodo(");
    // o saldo por linha é do motor; a tela só o usa para pesar a seleção em massa
    expect(FONTE.match(/saldoCentavos\(/g)?.length ?? 0).toBeLessThanOrEqual(1);
  });

  it("não declara cópia local de status em aberto", () => {
    expect(FONTE).not.toMatch(/const\s+OPEN_STATUSES\b/);
  });

  it("as listas saem de secoesDaLista, e 'Não será cobrado' continua sendo uma delas (D11)", () => {
    expect(FONTE).toMatch(/secoesDaLista\(/);
    expect(FONTE).toMatch(/naoSeraCobrado/);
    expect(FONTE).toContain("Não será cobrado");
  });

  it("a ficha tem Em aberto, Pagamentos e Pagos, e mostra o saldo a favor só quando houver", () => {
    expect(FONTE).toContain("Em aberto (");
    expect(FONTE).toContain("Pagamentos (");
    expect(FONTE).toContain("Pagos (");
    expect(FONTE).toMatch(/saldoAFavorCentavos\s*>\s*0/);
    expect(FONTE).toContain("/financeiro/lancamentos?month=");
  });

  it("o estado derivado decide as seções, mas nenhuma linha mostra chip de parcial", () => {
    expect(FONTE).toMatch(/estadoDoRecebivel\(/);
    expect(FONTE).not.toContain("EstadoDoRecebivelBadge");
    expect(FONTE).not.toMatch(/restam\s/);
  });

  it("Desfazer só para recebimento manual ou legado", () => {
    expect(FONTE).toContain("recebimentoDesfazivel(");
    expect(FONTE).toContain("desfazerRecebimentoAction(");
  });

  it("SAIU: o botão Receber, o receber em massa e o diálogo de registrar recebimento", () => {
    expect(FONTE).not.toContain("markReceivableReceived");
    expect(FONTE).not.toContain("registrar-recebimento-dialog");
    expect(FONTE).not.toContain("RegistrarRecebimentoDialog");
    expect(FONTE).not.toContain("useLazyDialog");
    expect(FONTE).not.toMatch(/>\s*Receber\s*</);
    expect(FONTE).not.toMatch(/acao\s*===\s*["']receber["']/);
    expect(FONTE).not.toContain("pago_em: dataRecebimento");
    expect(fs.existsSync(path.join(process.cwd(), "src", "app", "(app)", "terceiros", "registrar-recebimento-dialog.tsx"))).toBe(false);
  });

  it("a página lê devido, saldo a favor e pagamentos por pessoa, e o erro sobe", () => {
    expect(PAGINA).toContain("lerReembolsosPorPessoa(");
    expect(PAGINA).toContain("getAccounts(");
    expect(PAGINA).toContain("situacoes=");
    expect(PAGINA).toContain("pagamentos=");
    expect(PAGINA).not.toMatch(/\.catch\(/);
  });

  it("texto de flex com irmão fixo tem min-w-0 ou truncate (390px sem rolagem horizontal)", () => {
    expect(FONTE).toMatch(/min-w-0/);
    expect(FONTE).toMatch(/truncate/);
  });
});
