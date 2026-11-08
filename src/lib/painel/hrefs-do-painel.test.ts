import { describe, expect, it } from "vitest";
import { pedidoDaUrl } from "@/lib/painel/detalhe-url";
import { LINHAS_DO_CAIXA_NO_PAINEL, hrefsDoPainel } from "@/lib/painel/hrefs-do-painel";

const BASE = "/dashboard/financeiro";

const ENTRADA = {
  sp: { mes: "2026-11" } as Record<string, string | string[] | undefined>,
  base: "competencia" as const,
  pessoas: ["p1"],
  categorias: ["c1", null],
  formas: ["pix", "outro"],
  faturas: ["f1"],
  meses: ["2026-12", "2027-01"],
};

describe("hrefsDoPainel — competência", () => {
  const h = hrefsDoPainel(ENTRADA);

  it("os quatro indicadores e o card-âncora têm a URL exata", () => {
    expect(h.saldo).toBe(`${BASE}?mes=2026-11&detalhe=saldo`);
    expect(h.entradas).toBe(`${BASE}?mes=2026-11&detalhe=entradas`);
    expect(h.saidas).toBe(`${BASE}?mes=2026-11&detalhe=saidas`);
    expect(h.terceiros).toBe(`${BASE}?mes=2026-11&detalhe=saidas&parte=terceiros`);
    expect(h.bruto).toBe(`${BASE}?mes=2026-11&detalhe=saidas&parte=bruto`);
  });

  it("cartão: o gasto cheio e a minha parte", () => {
    expect(h.cartao).toEqual({
      bruto: `${BASE}?mes=2026-11&detalhe=cartao&parte=bruto`,
      meu: `${BASE}?mes=2026-11&detalhe=cartao`,
    });
  });

  it("pendente: o total, cada pessoa e o referente ao mês", () => {
    expect(h.pendente).toBe(`${BASE}?mes=2026-11&detalhe=pendente`);
    expect(h.pendentePorPessoa).toEqual({ p1: `${BASE}?mes=2026-11&detalhe=pendente&alvo=p1` });
    expect(h.pendenteDoMes).toBe(`${BASE}?mes=2026-11&detalhe=pendente-do-mes`);
  });

  it("categoria nula vira o alvo sem-categoria; forma e fatura têm o alvo", () => {
    expect(h.categorias).toEqual({
      c1: `${BASE}?mes=2026-11&detalhe=categoria&alvo=c1`,
      "sem-categoria": `${BASE}?mes=2026-11&detalhe=categoria&alvo=sem-categoria`,
    });
    expect(h.formas.pix).toBe(`${BASE}?mes=2026-11&detalhe=forma&alvo=pix`);
    expect(h.formas.outro).toBe(`${BASE}?mes=2026-11&detalhe=forma&alvo=outro`);
    expect(h.faturas.f1).toBe(`${BASE}?mes=2026-11&detalhe=fatura&parte=bruto&alvo=f1`);
  });

  it("projeção por mês e próximas contas", () => {
    expect(h.projecao["2026-12"]).toBe(`${BASE}?mes=2026-11&detalhe=projecao&alvo=2026-12`);
    expect(h.projecao["2027-01"]).toBe(`${BASE}?mes=2026-11&detalhe=projecao&alvo=2027-01`);
    expect(h.contas).toBe(`${BASE}?mes=2026-11&detalhe=contas`);
  });

  it("na competência o bloco do caixa não tem link", () => {
    expect(h.caixa).toEqual({});
  });

  it("toda URL volta ao mesmo pedido pela leitura da URL (ida e volta)", () => {
    const pedido = (url: string) => pedidoDaUrl(Object.fromEntries(new URL(url, "http://x").searchParams));
    expect(pedido(h.terceiros)).toEqual({ chave: "saidas", parte: "terceiros", alvo: null });
    expect(pedido(h.pendentePorPessoa.p1)).toEqual({ chave: "pendente", parte: "meu", alvo: "p1" });
    expect(pedido(h.categorias["sem-categoria"])).toEqual({
      chave: "categoria",
      parte: "meu",
      alvo: "sem-categoria",
    });
    expect(pedido(h.faturas.f1)).toEqual({ chave: "fatura", parte: "bruto", alvo: "f1" });
  });

  it("preserva a base e troca um detalhe aberto por outro", () => {
    const aberto = hrefsDoPainel({ ...ENTRADA, sp: { mes: "2026-11", detalhe: "saldo", alvo: "x" } });
    expect(aberto.saidas).toBe(`${BASE}?mes=2026-11&detalhe=saidas`);
  });
});

describe("hrefsDoPainel — base caixa", () => {
  const h = hrefsDoPainel({ ...ENTRADA, sp: { mes: "2026-11", base: "caixa" }, base: "caixa" });

  it("não oferece cartão, categoria nem forma (o caixa não os calcula)", () => {
    expect(h.cartao).toBeNull();
    expect(h.categorias).toEqual({});
    expect(h.formas).toEqual({});
  });

  it("os indicadores mantêm a base na URL", () => {
    expect(h.saidas).toBe(`${BASE}?mes=2026-11&base=caixa&detalhe=saidas`);
    expect(h.terceiros).toBe(`${BASE}?mes=2026-11&base=caixa&detalhe=saidas&parte=terceiros`);
  });

  it("as sete linhas do bloco do caixa têm link", () => {
    expect(Object.keys(h.caixa).sort()).toEqual([...LINHAS_DO_CAIXA_NO_PAINEL].sort());
    expect(LINHAS_DO_CAIXA_NO_PAINEL).toHaveLength(7);
    expect(h.caixa["entre-contas"]).toBe(`${BASE}?mes=2026-11&base=caixa&detalhe=caixa&alvo=entre-contas`);
    expect(h.caixa.renda).toBe(`${BASE}?mes=2026-11&base=caixa&detalhe=caixa&alvo=renda`);
  });

  it("fatura, pendente, projeção e contas seguem abrindo", () => {
    expect(h.faturas.f1).toContain("detalhe=fatura");
    expect(h.pendente).toContain("detalhe=pendente");
    expect(h.projecao["2026-12"]).toContain("detalhe=projecao");
    expect(h.contas).toContain("detalhe=contas");
  });
});
