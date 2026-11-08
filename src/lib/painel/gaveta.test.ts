import { describe, expect, it } from "vitest";
import type { Detalhe } from "@/lib/finance/detalhe";
import { vistaDaGaveta } from "@/lib/painel/gaveta";

/** 04-B — a vista da gaveta só FORMATA: os números chegam prontos no `Detalhe` (centavos). */

const base = {
  titulo: "Minhas saídas · novembro de 2026",
  linhaDeBase: "competência · minha parte",
  aproximados: 0,
  existentes: 2,
  exibidos: 2,
} as const;

const ok = (over: Partial<Extract<Detalhe, { estado: "ok" }>> = {}): Detalhe => ({
  estado: "ok",
  ...base,
  avisos: [],
  parte: "meu",
  totalCent: 9000,
  somaCent: 9000,
  diferencaCent: 0,
  grupos: [
    {
      rotulo: "Cartão A · vence 18/11",
      fatura: { totalCent: 22000, meuCent: 12000, diferencaCent: 0 },
      registros: [
        {
          id: "a",
          data: "2026-10-28",
          descricao: "Loja",
          origem: "Cartão A",
          categoria: "Categoria A",
          brutoCent: 20000,
          meuCent: 12000,
          terceirosCent: 8000,
          marcas: ["previsto"],
        },
        {
          id: "b",
          data: "2026-11-02",
          descricao: "Estorno",
          origem: "Cartão A",
          categoria: null,
          brutoCent: -3000,
          meuCent: -3000,
          terceirosCent: 0,
          marcas: ["estorno", { parcela: { numero: 3, total: 10 } }],
        },
      ],
    },
  ],
  ...over,
});

describe("vistaDaGaveta", () => {
  it("formata a coluna que concilia e só mostra as outras partes quando divergem", () => {
    const v = vistaDaGaveta(ok());
    if (v.estado !== "ok") throw new Error("estado");
    const [loja, estorno] = v.grupos[0].linhas;
    expect(loja.valor).toMatch(/^R\$\s120,00$/);
    expect(loja.outras.map((o) => o.rotulo)).toEqual(["de terceiros", "valor cheio"]);
    expect(loja.data).toBe("28/10");
    expect(loja.meta).toEqual(["Cartão A", "Categoria A"]);
    expect(estorno.negativo).toBe(true);
    expect(estorno.outras).toEqual([]);
    expect(estorno.marcas).toEqual([
      { texto: "estorno", tom: "estorno" },
      { texto: "parcela 3/10", tom: "neutro" },
    ]);
  });

  it("'minha parte R$ 0,00' não aparece quando tudo é de terceiros (revisão final, achado 4)", () => {
    const v = vistaDaGaveta(
      ok({
        parte: "pendente",
        totalCent: 4000,
        somaCent: 4000,
        grupos: [
          {
            rotulo: "Pessoa A",
            fatura: null,
            registros: [
              {
                id: "r",
                data: "2026-11-02",
                descricao: "Loja",
                origem: null,
                categoria: null,
                brutoCent: 4000,
                meuCent: 0,
                terceirosCent: 4000,
                marcas: [],
              },
            ],
          },
        ],
      }),
    );
    if (v.estado !== "ok") throw new Error("estado");
    expect(v.grupos[0].linhas[0].outras.map((o) => o.rotulo)).not.toContain("minha parte");
  });

  it("soma que fecha não tem diferença; a que não fecha escreve o valor", () => {
    const fecha = vistaDaGaveta(ok());
    const naoFecha = vistaDaGaveta(ok({ somaCent: 6000, diferencaCent: 3000 }));
    if (fecha.estado !== "ok" || naoFecha.estado !== "ok") throw new Error("estado");
    expect(fecha.diferenca).toBeNull();
    expect(fecha.soma.rotulo).toBe("da minha parte");
    expect(naoFecha.diferenca).toMatch(/30,00/);
  });

  it("a fatura que diverge dos itens declara as duas somas", () => {
    const v = vistaDaGaveta(
      ok({
        grupos: [{ rotulo: "Cartão A", fatura: { totalCent: 25000, meuCent: 15000, diferencaCent: 3000 }, registros: [] }],
      }),
    );
    if (v.estado !== "ok") throw new Error("estado");
    expect(v.grupos[0].diferenca?.fatura).toMatch(/250,00/);
    expect(v.grupos[0].diferenca?.itens).toMatch(/220,00/);
  });

  it("os outros estados passam como estão, e o vazio não tem R$", () => {
    const vazio: Detalhe = { estado: "vazio", titulo: "t", linhaDeBase: "l", frase: "Nenhum registro neste mês.", avisos: [] };
    expect(vistaDaGaveta(vazio)).toEqual(vazio);
    expect(JSON.stringify(vistaDaGaveta(vazio))).not.toContain("R$");
    const falha: Detalhe = { estado: "falha", titulo: "t", frase: "Não foi possível ler o caixa agora." };
    expect(vistaDaGaveta(falha)).toEqual(falha);
  });
});
