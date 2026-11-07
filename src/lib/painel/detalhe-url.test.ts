/**
 * REDESIGN-04-B · T3 — a URL do detalhe e o mês válido, puros.
 */
import { describe, expect, it } from "vitest";
import type { ChaveDoDetalhe } from "@/lib/finance/detalhe";
import {
  CHAVES_DO_DETALHE,
  abreAGaveta,
  mesDaUrl,
  pedidoDaUrl,
  urlComDetalhe,
  urlSemDetalhe,
} from "./detalhe-url";

// Cobertura da união: se uma chave for acrescentada a `ChaveDoDetalhe`, este objeto não compila
// até ela ser declarada aqui — e o teste abaixo reprova se a lista de runtime não a tiver.
const COBERTURA: Record<ChaveDoDetalhe, true> = {
  saldo: true,
  entradas: true,
  saidas: true,
  cartao: true,
  pendente: true,
  "pendente-do-mes": true,
  categoria: true,
  forma: true,
  fatura: true,
  projecao: true,
  contas: true,
  caixa: true,
};

describe("CHAVES_DO_DETALHE", () => {
  it("cobre exatamente a união ChaveDoDetalhe (12 chaves)", () => {
    expect([...CHAVES_DO_DETALHE].sort()).toEqual(Object.keys(COBERTURA).sort());
    expect(new Set(CHAVES_DO_DETALHE).size).toBe(12);
  });

  it("pedidoDaUrl aceita cada chave da lista", () => {
    for (const chave of CHAVES_DO_DETALHE) {
      expect(pedidoDaUrl({ detalhe: chave })).toEqual({ chave, parte: "meu", alvo: null });
    }
  });
});

describe("pedidoDaUrl", () => {
  it("lê detalhe e parte", () => {
    expect(pedidoDaUrl({ detalhe: "saidas", parte: "terceiros" })).toEqual({
      chave: "saidas",
      parte: "terceiros",
      alvo: null,
    });
  });

  it("chave fora da união → null", () => {
    expect(pedidoDaUrl({ detalhe: "xyz" })).toBeNull();
  });

  it("chave repetida → null (não escolhe uma sozinho)", () => {
    expect(pedidoDaUrl({ detalhe: ["saidas", "entradas"] })).toBeNull();
  });

  it("sem detalhe → null", () => {
    expect(pedidoDaUrl({})).toBeNull();
  });

  it("parte ausente, inválida ou repetida → meu", () => {
    expect(pedidoDaUrl({ detalhe: "saidas" })?.parte).toBe("meu");
    expect(pedidoDaUrl({ detalhe: "saidas", parte: "xyz" })?.parte).toBe("meu");
    expect(pedidoDaUrl({ detalhe: "saidas", parte: ["terceiros", "bruto"] })?.parte).toBe("meu");
  });

  it("alvo com barra ou espaço → null", () => {
    expect(pedidoDaUrl({ detalhe: "pendente", alvo: "a/b" })?.alvo).toBeNull();
    expect(pedidoDaUrl({ detalhe: "pendente", alvo: "a b" })?.alvo).toBeNull();
  });

  it("alvo vazio ou com mais de 64 caracteres → null; 64 caracteres passam", () => {
    expect(pedidoDaUrl({ detalhe: "pendente", alvo: "" })?.alvo).toBeNull();
    expect(pedidoDaUrl({ detalhe: "pendente", alvo: "x".repeat(65) })?.alvo).toBeNull();
    expect(pedidoDaUrl({ detalhe: "pendente", alvo: "x".repeat(64) })?.alvo).toBe("x".repeat(64));
  });

  it("alvo com letras, dígitos, _ e - passa", () => {
    expect(pedidoDaUrl({ detalhe: "fatura", alvo: "Abc_12-z" })?.alvo).toBe("Abc_12-z");
  });
});

describe("abreAGaveta", () => {
  it("URL com ?detalhe= abre a gaveta (não rola a página)", () => {
    const href = urlComDetalhe(
      "/dashboard/financeiro",
      { mes: "2026-03" },
      { chave: "saidas", parte: "meu", alvo: null },
    );
    expect(abreAGaveta(href)).toBe(true);
  });

  it("link para outra página sem detalhe rola ao topo", () => {
    expect(abreAGaveta("/faturas")).toBe(false);
  });

  it("outros parâmetros (mes) não abrem a gaveta", () => {
    expect(abreAGaveta("/financeiro/lancamentos?mes=2026-03")).toBe(false);
  });

  it("`detalhes` no plural não é o parâmetro `detalhe`", () => {
    expect(abreAGaveta("/x?detalhes=1")).toBe(false);
  });
});

describe("urlComDetalhe", () => {
  it("preserva a ordem dos parâmetros e acrescenta o detalhe no fim", () => {
    const url = urlComDetalhe(
      "/relatorios",
      { mes: "2026-11", base: "caixa", cartao: "c1" },
      { chave: "saidas", parte: "meu", alvo: null },
    );
    expect(url).toBe("/relatorios?mes=2026-11&base=caixa&cartao=c1&detalhe=saidas");
  });

  it("aceita URLSearchParams com a mesma ordem", () => {
    const url = urlComDetalhe(
      "/relatorios",
      new URLSearchParams("mes=2026-11&base=caixa&cartao=c1"),
      { chave: "saidas", parte: "meu", alvo: null },
    );
    expect(url).toBe("/relatorios?mes=2026-11&base=caixa&cartao=c1&detalhe=saidas");
  });

  it("parte terceiros e alvo entram no fim, nessa ordem", () => {
    const url = urlComDetalhe(
      "/dashboard/financeiro",
      { mes: "2026-11" },
      { chave: "pendente", parte: "terceiros", alvo: "p_1" },
    );
    expect(url).toBe("/dashboard/financeiro?mes=2026-11&detalhe=pendente&parte=terceiros&alvo=p_1");
  });

  it("troca detalhe/parte/alvo já presentes e os devolve ao fim", () => {
    const url = urlComDetalhe(
      "/relatorios",
      { parte: "meu", detalhe: "entradas", mes: "2026-11", alvo: "velho" },
      { chave: "saidas", parte: "terceiros", alvo: null },
    );
    expect(url).toBe("/relatorios?mes=2026-11&detalhe=saidas&parte=terceiros");
  });

  it("parâmetro repetido mantém só o primeiro valor", () => {
    const url = urlComDetalhe(
      "/relatorios",
      { mes: ["2026-11", "2026-10"], base: "caixa" },
      { chave: "saidas", parte: "meu", alvo: null },
    );
    expect(url).toBe("/relatorios?mes=2026-11&base=caixa&detalhe=saidas");
  });
});

describe("urlSemDetalhe", () => {
  it("remove só detalhe, parte e alvo, mantendo o resto", () => {
    const url = urlSemDetalhe("/relatorios", {
      mes: "2026-11",
      base: "caixa",
      cartao: "c1",
      detalhe: "saidas",
    });
    expect(url).toBe("/relatorios?mes=2026-11&base=caixa&cartao=c1");
  });

  it("volta à URL original (ida e volta com urlComDetalhe)", () => {
    const original = { mes: "2026-11", base: "caixa", cartao: "c1" };
    const comDetalhe = urlComDetalhe("/relatorios", original, {
      chave: "saidas",
      parte: "meu",
      alvo: null,
    });
    const sp = new URLSearchParams(comDetalhe.split("?")[1]);
    expect(urlSemDetalhe("/relatorios", sp)).toBe("/relatorios?mes=2026-11&base=caixa&cartao=c1");
  });

  it("sem nenhum parâmetro restante devolve só o caminho", () => {
    expect(urlSemDetalhe("/relatorios", { detalhe: "saidas", parte: "meu" })).toBe("/relatorios");
  });
});

describe("mesDaUrl", () => {
  it("aceita AAAA-MM válido", () => {
    expect(mesDaUrl("2026-12", "2026-11")).toBe("2026-12");
    expect(mesDaUrl("2026-01", "2026-11")).toBe("2026-01");
  });

  it("mês fora de 01–12 → mês atual", () => {
    expect(mesDaUrl("2026-13", "2026-11")).toBe("2026-11");
    expect(mesDaUrl("2026-00", "2026-11")).toBe("2026-11");
  });

  it("formato inválido, ausente ou repetido → mês atual", () => {
    expect(mesDaUrl("2026-1", "2026-11")).toBe("2026-11");
    expect(mesDaUrl("26-11", "2026-11")).toBe("2026-11");
    expect(mesDaUrl("", "2026-11")).toBe("2026-11");
    expect(mesDaUrl(undefined, "2026-11")).toBe("2026-11");
    expect(mesDaUrl(["2026-12", "2026-10"], "2026-11")).toBe("2026-11");
  });
});
