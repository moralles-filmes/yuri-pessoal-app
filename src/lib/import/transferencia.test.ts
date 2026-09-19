import { describe, expect, it } from "vitest";
import {
  detectarTransferencia,
  marcarTransferencias,
  pernasDaTransferencia,
} from "@/lib/import/transferencia";
import type { NormalizedRow } from "@/lib/import/types";

function linha(over: Partial<NormalizedRow> = {}): NormalizedRow {
  return {
    linhaIndex: 1,
    raw: [],
    dataNorm: "2026-08-10",
    descricao: "",
    valorCentavos: 12000,
    tipo: "despesa",
    parcela: null,
    parcelasTotal: null,
    identificador: null,
    categoriaSugeridaId: null,
    status: "para_importar",
    motivo: null,
    ...over,
  };
}

describe("detectarTransferencia — pagamento de fatura", () => {
  it.each([
    "PAGAMENTO FATURA CARTAO NUBANK",
    "Pagamento de fatura",
    "PAGTO FATURA ITAU",
    "PGTO DE FATURA DO CARTAO",
    "Pag fatura",
    "DEBITO AUTOMATICO FATURA CARTAO",
    "Pagamento cartão de crédito",
  ])("reconhece %s", (d) => {
    expect(detectarTransferencia(d)?.especie).toBe("pagamento_fatura");
  });

  it("o motivo aponta o caminho certo, que é Faturas", () => {
    const m = detectarTransferencia("PAGAMENTO FATURA NUBANK")?.motivo ?? "";
    expect(m).toContain("Faturas");
  });
});

describe("detectarTransferencia — entre contas", () => {
  it.each([
    "APLICACAO AUTOMATICA",
    "Resgate CDB",
    "TRANSFERENCIA ENTRE CONTAS",
    "Transferencia para poupanca",
    "Poupança - transf automática",
  ])("reconhece %s", (d) => {
    expect(detectarTransferencia(d)?.especie).toBe("entre_contas");
  });
});

/**
 * O coração da regra: o vocabulário é allowlist de EXPRESSÃO. Palavra ambígua não pode entrar,
 * porque "PIX ENVIADO - PADARIA" é uma despesa real e "TED RECEBIDA - CLIENTE" é uma receita
 * real. Marcá-las esconderia dinheiro de verdade do total do mês.
 */
describe("detectarTransferencia — o que NÃO pode casar", () => {
  it.each([
    "PIX ENVIADO - PADARIA CENTRAL",
    "PIX RECEBIDO CLIENTE X",
    "TED RECEBIDA",
    "DOC ENVIADO JOAO",
    "TRANSFERENCIA RECEBIDA - CLIENTE X",
    "TRANSFERENCIA ENVIADA JOAO",
    "COMPRA NO DEBITO CARTAO 1234 PADARIA",
    "FATURA VIVO",
    "IFOOD",
    "",
  ])("ignora %s", (d) => {
    expect(detectarTransferencia(d)).toBeNull();
  });

  it("descrição nula ou indefinida não quebra nem casa", () => {
    expect(detectarTransferencia(null)).toBeNull();
    expect(detectarTransferencia(undefined)).toBeNull();
  });

  it("acento e caixa não mudam a decisão", () => {
    expect(detectarTransferencia("aplicação automática")?.especie).toBe(
      "entre_contas",
    );
    expect(detectarTransferencia("PAGAMENTO DE FATURA")?.especie).toBe(
      "pagamento_fatura",
    );
  });
});

describe("marcarTransferencias", () => {
  it("não toca em fatura de cartão", () => {
    const rows = [linha({ descricao: "PAGAMENTO FATURA" })];
    expect(marcarTransferencias(rows, "cartao")).toBe(rows);
  });

  it("pagamento de fatura é auto-ignorado, com motivo", () => {
    const [r] = marcarTransferencias(
      [linha({ descricao: "PAGAMENTO FATURA NUBANK" })],
      "conta",
    );
    expect(r.status).toBe("ignorada");
    expect(r.motivo).toBeTruthy();
  });

  it("transferência entre contas só ganha aviso — continua para importar", () => {
    const [r] = marcarTransferencias(
      [linha({ descricao: "APLICACAO AUTOMATICA" })],
      "conta",
    );
    expect(r.status).toBe("para_importar");
    expect(r.motivo).toContain("transferência entre contas");
  });

  /**
   * A regra central do desenho: o SENTIDO é o que decide, no commit, qual das duas contas é a
   * origem. Sobrescrevê-lo faria uma aplicação (dinheiro saindo) virar indistinguível de um
   * resgate (dinheiro entrando), e o saldo das duas contas sairia invertido.
   */
  it("NUNCA altera o tipo — nem na saída, nem na entrada", () => {
    const [saida] = marcarTransferencias(
      [linha({ descricao: "APLICACAO", tipo: "despesa" })],
      "conta",
    );
    const [entrada] = marcarTransferencias(
      [linha({ descricao: "RESGATE", tipo: "receita" })],
      "conta",
    );
    expect(saida.tipo).toBe("despesa");
    expect(entrada.tipo).toBe("receita");
  });

  it.each(["erro", "ignorada", "duplicada"] as const)(
    "linha %s passa intacta — o motivo que ela já tem é mais específico",
    (status) => {
      const original = linha({
        descricao: "PAGAMENTO FATURA",
        status,
        motivo: "motivo anterior",
      });
      const [r] = marcarTransferencias([original], "conta");
      expect(r).toEqual(original);
    },
  );

  it("linha comum passa sem motivo inventado", () => {
    const [r] = marcarTransferencias(
      [linha({ descricao: "PADARIA CENTRAL" })],
      "conta",
    );
    expect(r.motivo).toBeNull();
    expect(r.status).toBe("para_importar");
  });
});

/**
 * A decisão mais sutil do módulo. Trocar os dois lados não dá erro em lugar nenhum: o saldo
 * simplesmente sai invertido nas duas contas, e nada na tela denuncia.
 */
describe("pernasDaTransferencia", () => {
  const LOTE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const OUTRA = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

  it("saiu da conta do extrato: ela é a ORIGEM", () => {
    expect(
      pernasDaTransferencia({ tipo: "despesa", contaDoLote: LOTE, outraConta: OUTRA }),
    ).toEqual({ account_id: LOTE, transfer_account_id: OUTRA });
  });

  it("entrou na conta do extrato: ela é o DESTINO", () => {
    expect(
      pernasDaTransferencia({ tipo: "receita", contaDoLote: LOTE, outraConta: OUTRA }),
    ).toEqual({ account_id: OUTRA, transfer_account_id: LOTE });
  });

  it("os dois sentidos são de fato opostos — não colapsam no mesmo par", () => {
    const saiu = pernasDaTransferencia({
      tipo: "despesa",
      contaDoLote: LOTE,
      outraConta: OUTRA,
    });
    const entrou = pernasDaTransferencia({
      tipo: "receita",
      contaDoLote: LOTE,
      outraConta: OUTRA,
    });
    expect(saiu.account_id).toBe(entrou.transfer_account_id);
    expect(saiu.transfer_account_id).toBe(entrou.account_id);
  });

  it("tipo ausente cai em 'saiu', como o resto do commit", () => {
    expect(
      pernasDaTransferencia({ tipo: null, contaDoLote: LOTE, outraConta: OUTRA }),
    ).toEqual({ account_id: LOTE, transfer_account_id: OUTRA });
  });

  it("nunca devolve a mesma conta dos dois lados", () => {
    for (const tipo of ["despesa", "receita", null] as const) {
      const p = pernasDaTransferencia({ tipo, contaDoLote: LOTE, outraConta: OUTRA });
      expect(p.account_id).not.toBe(p.transfer_account_id);
    }
  });
});
