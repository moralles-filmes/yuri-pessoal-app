import { describe, expect, it } from "vitest";

import {
  type Indicador,
  indicadorCoerente,
  textoSemTokens,
  tokensDeIndicadorEm,
} from "./contracts";

const BASE: Indicador = {
  id: "treinos.sessoes",
  modulo: "treinos",
  rotulo: "Sessões concluídas",
  valor: 12,
  unidade: "sessões",
  qualidade: "exato",
  periodo: { de: "2026-07-01", ate: "2026-07-31" },
  n: 12,
  rota: "/treinos/historico",
};

const com = (parcial: Partial<Indicador>): Indicador => ({ ...BASE, ...parcial });

describe("indicadorCoerente — ausência carrega motivo, presença não carrega ausência", () => {
  it("aceita o indicador bem formado", () => {
    expect(indicadorCoerente(BASE)).toBe(true);
  });

  it("aceita zero MEDIDO — zero é fato, não ausência", () => {
    expect(indicadorCoerente(com({ valor: 0, n: 0 }))).toBe(true);
  });

  it("recusa valor null SEM motivo — é aqui que 'não medi' viraria '—' na tela", () => {
    expect(
      indicadorCoerente(com({ valor: null, indisponivel_porque: undefined })),
    ).toBe(false);
    expect(indicadorCoerente(com({ valor: null, indisponivel_porque: "   " }))).toBe(false);
  });

  it("aceita valor null COM motivo", () => {
    expect(
      indicadorCoerente(
        com({ valor: null, indisponivel_porque: "sem peso corporal registrado no dia" }),
      ),
    ).toBe(true);
  });

  it("recusa motivo de ausência num indicador que TEM valor", () => {
    expect(indicadorCoerente(com({ valor: 12, indisponivel_porque: "qualquer" }))).toBe(
      false,
    );
  });

  it("recusa NaN e Infinity — as duas formas que uma conta ruim toma", () => {
    expect(indicadorCoerente(com({ valor: Number.NaN }))).toBe(false);
    expect(indicadorCoerente(com({ valor: Number.POSITIVE_INFINITY }))).toBe(false);
  });

  it("recusa parcial sem motivo, e motivo sem parcial", () => {
    expect(indicadorCoerente(com({ qualidade: "parcial" }))).toBe(false);
    expect(
      indicadorCoerente(com({ qualidade: "parcial", motivo_incompleto: "2 dias sem peso" })),
    ).toBe(true);
    expect(indicadorCoerente(com({ motivo_incompleto: "sobrou" }))).toBe(false);
  });

  it("recusa n negativo e n fracionário", () => {
    expect(indicadorCoerente(com({ n: -1 }))).toBe(false);
    expect(indicadorCoerente(com({ n: 1.5 }))).toBe(false);
  });

  it("recusa período invertido e data que não é pura", () => {
    expect(indicadorCoerente(com({ periodo: { de: "2026-07-31", ate: "2026-07-01" } }))).toBe(
      false,
    );
    expect(
      indicadorCoerente(com({ periodo: { de: "2026-07-01T00:00:00Z", ate: "2026-07-31" } })),
    ).toBe(false);
  });

  it("aceita período de um dia só", () => {
    expect(indicadorCoerente(com({ periodo: { de: "2026-07-01", ate: "2026-07-01" } }))).toBe(
      true,
    );
  });

  /**
   * A rota vira `href`. As formas abaixo são as mesmas que `rotaInternaAceita` recusa desde a
   * 18-B — inclusive `/\`, que o parser de URL resolve idêntico a `//` e leva para fora do
   * domínio.
   */
  it("recusa rota que não é caminho interno", () => {
    for (const rota of [
      "https://evil.com",
      "//evil.com",
      "/\\evil.com",
      "treinos/historico",
      "/\tevil",
      "javascript:alert(1)",
    ]) {
      expect(indicadorCoerente(com({ rota })), rota).toBe(false);
    }
  });

  it("recusa id fora do formato — ele é a chave do token", () => {
    for (const id of ["Treinos.Sessoes", "sessoes", "treinos sessoes", "treinos.", "", "a.b}"]) {
      expect(indicadorCoerente(com({ id })), JSON.stringify(id)).toBe(false);
    }
  });

  it("recusa rótulo e unidade vazios", () => {
    expect(indicadorCoerente(com({ rotulo: "  " }))).toBe(false);
    expect(indicadorCoerente(com({ unidade: "" }))).toBe(false);
  });
});

describe("os tokens", () => {
  it("acha os ids citados, sem repetir e na ordem", () => {
    expect(
      tokensDeIndicadorEm(
        "Você treinou {{ind:treinos.sessoes}} vezes, contra {{ind:treinos.sessoes_anterior}} — {{ind:treinos.sessoes}} de novo.",
      ),
    ).toEqual(["treinos.sessoes", "treinos.sessoes_anterior"]);
  });

  it("ignora forma malformada em vez de tentar consertar", () => {
    expect(tokensDeIndicadorEm("{{ind: treinos.sessoes}}")).toEqual([]);
    expect(tokensDeIndicadorEm("{{IND:treinos.sessoes}}")).toEqual([]);
    expect(tokensDeIndicadorEm("{{ind:treinos.sessoes}")).toEqual([]);
  });

  it("textoSemTokens deixa o resto intacto — é sobre ele que a busca por dígito roda", () => {
    expect(textoSemTokens("Gastou {{ind:financeiro.gasto}} no mês.")).toBe(
      "Gastou  no mês.",
    );
  });

  /**
   * Os dois são chamados em sequência sobre textos diferentes. Uma regex global guarda
   * `lastIndex`, e um `.test()` no meio do caminho faria a segunda chamada começar do lugar
   * errado — é o defeito clássico de regex global em módulo.
   */
  it("chamadas seguidas não interferem umas nas outras", () => {
    const texto = "a {{ind:x.y}} b";
    expect(tokensDeIndicadorEm(texto)).toEqual(["x.y"]);
    expect(tokensDeIndicadorEm(texto)).toEqual(["x.y"]);
    expect(textoSemTokens(texto)).toBe("a  b");
    expect(textoSemTokens(texto)).toBe("a  b");
  });
});
