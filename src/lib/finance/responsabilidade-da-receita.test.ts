/**
 * REDESIGN-03-C · A1 — a responsabilidade da receita, regra PURA.
 *
 * Cada linha da tabela do §5.1 do desenho (`2026-10-11-03c-renda-pessoal-design.md`) tem o
 * seu `it`. As travas de tipo no fim são conferidas pelo `tsc --noEmit`: se alguém alargar a
 * união para aceitar `terceiro` com valor nulo, o `@ts-expect-error` fica sem uso e o `tsc`
 * reprova com TS2578.
 *
 * Fixture sintética: o repositório é público.
 */
import { describe, expect, it } from "vitest";
import {
  MSG_PARTE_AUSENTE,
  MSG_PARTE_FORA_DA_COMPARTILHADA,
  MSG_PARTE_TOTAL,
  MSG_PARTE_ZERO,
  colunasDaReceita,
  decidirResponsabilidadeDaReceita,
  type ResponsabilidadeDaReceita,
} from "@/lib/finance/responsabilidade-da-receita";

const VALOR = 100_000; // R$ 1.000,00 em centavos

const decidir = (
  classificacao: "pessoal" | "terceiro" | "compartilhada",
  minhaParteCentavos: number | null,
  valorCentavos = VALOR,
) => decidirResponsabilidadeDaReceita({ classificacao, minhaParteCentavos, valorCentavos });

describe("03-C A1 · decidirResponsabilidadeDaReceita — as formas aceitas", () => {
  it("pessoal sem parte: valor pessoal NULO (lido como o valor cheio) e nada de terceiros", () => {
    expect(decidir("pessoal", null)).toEqual({
      ok: true,
      responsabilidade: { classificacao: "pessoal", valorPessoalCentavos: null },
      terceirosCentavos: 0,
    });
  });

  it("terceiro sem parte: valor pessoal ZERO e o valor inteiro é de terceiros", () => {
    expect(decidir("terceiro", null)).toEqual({
      ok: true,
      responsabilidade: { classificacao: "terceiro", valorPessoalCentavos: 0 },
      terceirosCentavos: VALOR,
    });
  });

  it("compartilhada com 0 < parte < valor: a parte é minha e o resto é de terceiros", () => {
    expect(decidir("compartilhada", 40_000)).toEqual({
      ok: true,
      responsabilidade: { classificacao: "compartilhada", valorPessoalCentavos: 40_000 },
      terceirosCentavos: 60_000,
    });
  });

  it("compartilhada nas bordas válidas: 1 centavo e valor − 1 centavo", () => {
    const umCentavo = decidir("compartilhada", 1);
    expect(umCentavo.ok && umCentavo.terceirosCentavos).toBe(VALOR - 1);
    const quaseTudo = decidir("compartilhada", VALOR - 1);
    expect(quaseTudo.ok && quaseTudo.terceirosCentavos).toBe(1);
  });
});

describe("03-C A1 · decidirResponsabilidadeDaReceita — as formas recusadas", () => {
  const recusa = (mensagem: string) => ({ ok: false, campo: "receita_minha_parte", mensagem });

  it("pessoal COM parte é recusada — a parte só existe na compartilhada", () => {
    expect(decidir("pessoal", 40_000)).toEqual(recusa(MSG_PARTE_FORA_DA_COMPARTILHADA));
  });

  it("terceiro COM parte é recusada, inclusive com parte 0", () => {
    expect(decidir("terceiro", 40_000)).toEqual(recusa(MSG_PARTE_FORA_DA_COMPARTILHADA));
    expect(decidir("terceiro", 0)).toEqual(recusa(MSG_PARTE_FORA_DA_COMPARTILHADA));
  });

  it("compartilhada SEM parte é recusada", () => {
    expect(decidir("compartilhada", null)).toEqual(recusa(MSG_PARTE_AUSENTE));
  });

  it("compartilhada com parte ≤ 0 é recusada — nada é meu, então é de terceiro", () => {
    expect(decidir("compartilhada", 0)).toEqual(recusa(MSG_PARTE_ZERO));
    expect(decidir("compartilhada", -1)).toEqual(recusa(MSG_PARTE_ZERO));
  });

  it("compartilhada com parte = valor é recusada — tudo é meu, então é pessoal", () => {
    expect(decidir("compartilhada", VALOR)).toEqual(recusa(MSG_PARTE_TOTAL));
  });

  it("compartilhada com parte > valor é recusada — é o caso de editar o valor para baixo", () => {
    // C0: ao reduzir o valor de uma compartilhada, a parte NÃO é recalculada em silêncio.
    expect(decidir("compartilhada", 40_000, 30_000)).toEqual(recusa(MSG_PARTE_TOTAL));
  });

  it("toda recusa nomeia o campo que existe na tela", () => {
    for (const r of [
      decidir("pessoal", 1),
      decidir("terceiro", 1),
      decidir("compartilhada", null),
      decidir("compartilhada", 0),
      decidir("compartilhada", VALOR),
    ]) {
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.campo).toBe("receita_minha_parte");
    }
  });
});

describe("03-C A1 · a categoria não decide (D8)", () => {
  it("a função recebe só classificação, parte e valor — não há onde passar categoria", () => {
    expect(decidirResponsabilidadeDaReceita.length).toBe(1);
    const args: Parameters<typeof decidirResponsabilidadeDaReceita>[0] = {
      classificacao: "pessoal",
      minhaParteCentavos: null,
      valorCentavos: VALOR,
    };
    expect(Object.keys(args).sort()).toEqual([
      "classificacao",
      "minhaParteCentavos",
      "valorCentavos",
    ]);
  });
});

describe("03-C A1 · colunasDaReceita — o único ponto que converte para as colunas (reais)", () => {
  it("pessoal grava valor_pessoal nulo", () => {
    expect(colunasDaReceita({ classificacao: "pessoal", valorPessoalCentavos: null })).toEqual({
      classificacao: "pessoal",
      valor_pessoal: null,
    });
  });

  it("terceiro grava valor_pessoal 0", () => {
    expect(colunasDaReceita({ classificacao: "terceiro", valorPessoalCentavos: 0 })).toEqual({
      classificacao: "terceiro",
      valor_pessoal: 0,
    });
  });

  it("compartilhada grava a parte em REAIS (numeric(14,2), invariante 63)", () => {
    expect(
      colunasDaReceita({ classificacao: "compartilhada", valorPessoalCentavos: 12_345 }),
    ).toEqual({ classificacao: "compartilhada", valor_pessoal: 123.45 });
  });
});

describe("03-C A1 · contratos de tipo (conferidos pelo tsc --noEmit)", () => {
  it("terceiro nunca tem valor nulo nem diferente de zero; pessoal nunca tem valor", () => {
    // @ts-expect-error — terceiro com valor pessoal nulo não é representável.
    const terceiroNulo: ResponsabilidadeDaReceita = {
      classificacao: "terceiro",
      valorPessoalCentavos: null,
    };
    // @ts-expect-error — terceiro é sempre zero.
    const terceiroComValor: ResponsabilidadeDaReceita = {
      classificacao: "terceiro",
      valorPessoalCentavos: 5,
    };
    // @ts-expect-error — pessoal nunca carrega valor.
    const pessoalComValor: ResponsabilidadeDaReceita = {
      classificacao: "pessoal",
      valorPessoalCentavos: 1000,
    };
    expect(terceiroNulo.classificacao).toBe("terceiro");
    expect(terceiroComValor.classificacao).toBe("terceiro");
    expect(pessoalComValor.classificacao).toBe("pessoal");
  });
});
