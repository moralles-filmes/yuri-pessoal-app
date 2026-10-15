import { describe, expect, it } from "vitest";
import { exigirValor, lerCentavos, lerDecimal, lerInteiro } from "./numero";

/**
 * REDESIGN-07-D · D2 — um conversor só para os números digitados nas telas da IA.
 *
 * Os dois defeitos que ele substitui (spec §5c): `Number("1,5")` é `NaN` e chegava ao dono
 * como "expected number, received NaN" num toast; `Number("")` é `0`, e o teto da análise
 * automática em branco passava como zero enquanto a tela dizia que ele não podia ficar em
 * branco. E `textoParaCentavos("12.50")` apagava todos os pontos: R$ 1.250,00.
 */
describe("lerDecimal", () => {
  it.each([
    ["1,5", 1.5],
    ["1.5", 1.5],
    ["12.50", 12.5],
    ["1.250", 1250],
    ["1.234,56", 1234.56],
    ["1.234", 1234],
    ["1.234.567", 1234567],
    ["1.234.567,8", 1234567.8],
    ["0,5", 0.5],
    [",5", 0.5],
    ["0.125", 0.125],
    ["0,125", 0.125],
    [" 7 ", 7],
    ["0", 0],
    ["1234,5", 1234.5],
  ])("%s → %s", (t, v) => expect(lerDecimal(t)).toEqual({ ok: true, valor: v }));

  it("vazio é ausência, nunca zero (M35)", () => {
    expect(lerDecimal("")).toEqual({ ok: true, valor: null });
    expect(lerDecimal("  ")).toEqual({ ok: true, valor: null });
  });

  it.each(["abc", "1.2.3", "1,2,3", "-1", "1e3", "12.", "12,", "1.2500", "1.23,5", "12.34.567", "+1", "1 234"])(
    "%s é recusado com motivo — nunca NaN, nunca zero",
    (t) => {
      const r = lerDecimal(t);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.motivo.length).toBeGreaterThan(10);
    },
  );

  it("o negativo diz que é negativo", () => {
    const r = lerDecimal("-1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/negativ/);
  });
});

describe("lerCentavos", () => {
  it("o ponto decimal não multiplica por 100 (M34)", () => {
    expect(lerCentavos("12.50")).toEqual({ ok: true, valor: 1250 });
    expect(lerCentavos("12,50")).toEqual({ ok: true, valor: 1250 });
    expect(lerCentavos("1.250,00")).toEqual({ ok: true, valor: 125000 });
    expect(lerCentavos("1.250")).toEqual({ ok: true, valor: 125000 });
  });

  it("a conta é feita no texto, sem erro de ponto flutuante", () => {
    // 1,005 × 100 em ponto flutuante dá 100,49999…; aqui não há multiplicação de fração.
    expect(lerCentavos("0,07")).toEqual({ ok: true, valor: 7 });
    expect(lerCentavos("19,9")).toEqual({ ok: true, valor: 1990 });
    expect(lerCentavos("4790")).toEqual({ ok: true, valor: 479000 });
  });

  it("vazio continua sendo 'não identificado', nunca zero", () => {
    expect(lerCentavos("")).toEqual({ ok: true, valor: null });
  });

  it("mais de dois dígitos de centavo é recusado, não arredondado", () => {
    expect(lerCentavos("12,505").ok).toBe(false);
    expect(lerCentavos("abc").ok).toBe(false);
  });
});

describe("exigirValor", () => {
  it("campo obrigatório em branco recusa no campo (M35)", () => {
    expect(exigirValor(lerDecimal(""), "Informe um valor.")).toEqual({
      ok: false,
      motivo: "Informe um valor.",
    });
  });

  it("valor presente e recusa anterior passam como estão", () => {
    expect(exigirValor(lerDecimal("0"), "Informe um valor.")).toEqual({ ok: true, valor: 0 });
    const recusa = lerDecimal("abc");
    expect(exigirValor(recusa, "Informe um valor.")).toEqual(recusa);
  });
});

describe("lerInteiro", () => {
  it("recusa fração", () => {
    expect(lerInteiro("1,5").ok).toBe(false);
    expect(lerInteiro("1.5").ok).toBe(false);
  });

  it("aceita milhar e devolve ausência para o vazio", () => {
    expect(lerInteiro("1.200")).toEqual({ ok: true, valor: 1200 });
    expect(lerInteiro("60")).toEqual({ ok: true, valor: 60 });
    expect(lerInteiro("")).toEqual({ ok: true, valor: null });
  });
});
