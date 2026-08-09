/**
 * Fase 18-D — IA · Os cinco destinos de uma nota com vários itens.
 *
 * Duas propriedades acima de todas: **a sobra é declarada** (nunca rateada em silêncio) e
 * **item ilegível torna a conta indeterminada** (nunca uma soma parcial apresentada como
 * total).
 */

import { describe, expect, it } from "vitest";
import {
  classificacaoInicial,
  resumirNota,
  type ItemClassificado,
} from "./receipt-items";
import type { ItemDaNota } from "./contracts";

const item = (descricao: string, centavos: number | null): ItemDaNota => ({
  descricao,
  valorTotalCentavos: centavos,
  quantidade: 1,
  confianca: centavos === null ? "nao_identificado" : "alta",
});

const meu = (i: ItemDaNota): ItemClassificado => ({ item: i, destino: { tipo: "meu" } });
const ignorado = (i: ItemDaNota, motivo = "não é meu"): ItemClassificado => ({
  item: i,
  destino: { tipo: "ignorado", motivo },
});
const deCategoria = (i: ItemDaNota, categoriaId: string): ItemClassificado => ({
  item: i,
  destino: { tipo: "categoria", categoriaId },
});
const deTerceiro = (i: ItemDaNota, pessoaId: string): ItemClassificado => ({
  item: i,
  destino: { tipo: "terceiro", pessoaId },
});

describe("despesa única — nenhum item classificado", () => {
  it("usa o total, e diz isso", () => {
    const r = resumirNota(10_000, []);
    expect(r.totalDeclarado).toBe(10_000);
    // Sem item nenhum, a soma classificada é 0 e a sobra é o total inteiro — que é o
    // comportamento certo: "uma despesa só" é o caso em que nada foi detalhado.
    expect(r.somaClassificada).toBe(0);
    expect(r.naoAtribuidoCentavos).toBe(10_000);
    expect(r.fecha).toBe(false);
    expect(r.explicacao).toContain("Nenhum item classificado");
  });
});

describe("itens detalhados", () => {
  it("soma exata fecha", () => {
    const r = resumirNota(10_000, [meu(item("a", 6_000)), meu(item("b", 4_000))]);
    expect(r.somaClassificada).toBe(10_000);
    expect(r.meuCentavos).toBe(10_000);
    expect(r.naoAtribuidoCentavos).toBe(0);
    expect(r.fecha).toBe(true);
    expect(r.explicacao).toContain("exatamente");
  });

  it("⛔ A SOBRA É DECLARADA, com o número, e NÃO é rateada", () => {
    const r = resumirNota(10_000, [meu(item("a", 6_000)), meu(item("b", 2_000))]);
    expect(r.somaClassificada).toBe(8_000);
    expect(r.naoAtribuidoCentavos).toBe(2_000);
    expect(r.fecha).toBe(false);
    expect(r.explicacao).toContain("R$ 20,00");
    expect(r.explicacao).toContain("não foram atribuídos");
    // A prova de que não houve rateio: os itens continuam com o valor original.
    expect(r.meuCentavos).toBe(8_000);
  });

  it("soma MAIOR que o total é erro declarado, não silêncio", () => {
    const r = resumirNota(10_000, [meu(item("a", 8_000)), meu(item("b", 5_000))]);
    expect(r.naoAtribuidoCentavos).toBe(-3_000);
    expect(r.fecha).toBe(false);
    expect(r.explicacao).toContain("MAIS que o total");
  });
});

describe("⛔ item ILEGÍVEL torna a conta indeterminada", () => {
  it("a soma vira null — não a soma dos legíveis", () => {
    // Uma soma parcial apresentada como total é a mentira que a invariante 1 da Dieta
    // proíbe. 6.000 aqui seria plausível e errado.
    const r = resumirNota(10_000, [meu(item("a", 6_000)), meu(item("b", null))]);
    expect(r.somaClassificada).toBeNull();
    expect(r.naoAtribuidoCentavos).toBeNull();
    expect(r.meuCentavos).toBeNull();
    expect(r.fecha).toBe(false);
    expect(r.explicacao).toContain("indeterminada");
  });

  it("ilegível em QUALQUER destino contamina o total classificado", () => {
    // Somar recortes (alguns null, outros número) esconderia isto.
    const r = resumirNota(10_000, [
      meu(item("a", 6_000)),
      ignorado(item("b", null)),
    ]);
    expect(r.somaClassificada).toBeNull();
    // Mas o recorte que é todo legível continua somando.
    expect(r.meuCentavos).toBe(6_000);
    expect(r.ignoradoCentavos).toBeNull();
  });
});

describe("categorias separadas", () => {
  it("agrupa por categoria", () => {
    const r = resumirNota(10_000, [
      deCategoria(item("arroz", 3_000), "mercado"),
      deCategoria(item("feijão", 2_000), "mercado"),
      deCategoria(item("remédio", 5_000), "saude"),
    ]);
    expect(r.porCategoria).toEqual({ mercado: 5_000, saude: 5_000 });
    expect(r.fecha).toBe(true);
  });
});

describe("partes de terceiros", () => {
  it("agrupa por pessoa", () => {
    const r = resumirNota(10_000, [
      meu(item("meu café", 4_000)),
      deTerceiro(item("café do João", 3_000), "joao"),
      deTerceiro(item("bolo do João", 1_000), "joao"),
      deTerceiro(item("suco da Ana", 2_000), "ana"),
    ]);
    expect(r.meuCentavos).toBe(4_000);
    expect(r.porTerceiro).toEqual({ joao: 4_000, ana: 2_000 });
    expect(r.fecha).toBe(true);
  });

  it("⛔ este arquivo NÃO distribui — só diz quanto é de cada um", () => {
    // Quem distribui é `finance/split.ts`. O resumo não tem campo de parcela, de recebível
    // nem de valor pessoal: não há como alguém achar que a divisão já foi feita aqui.
    const r = resumirNota(10_000, [deTerceiro(item("x", 10_000), "joao")]);
    expect(r).not.toHaveProperty("partes");
    expect(r).not.toHaveProperty("valorPessoal");
    expect(r).not.toHaveProperty("recebiveis");
  });
});

describe("⛔ item IGNORADO não some", () => {
  it("continua contabilizado e visível", () => {
    const r = resumirNota(10_000, [
      meu(item("meu", 7_000)),
      ignorado(item("do vizinho", 3_000)),
    ]);
    expect(r.ignoradoCentavos).toBe(3_000);
    expect(r.meuCentavos).toBe(7_000);
    // Ignorado ENTRA na soma classificada: ele foi decidido, não esquecido. Por isso a
    // nota fecha, mesmo com parte dela fora do lançamento do dono.
    expect(r.somaClassificada).toBe(10_000);
    expect(r.fecha).toBe(true);
  });

  it("o motivo viaja junto", () => {
    const c = ignorado(item("x", 100), "comprei para o escritório");
    expect(c.destino).toEqual({
      tipo: "ignorado",
      motivo: "comprei para o escritório",
    });
  });
});

describe("classificação inicial", () => {
  it("⛔ tudo nasce como DO DONO", () => {
    // O padrão oposto ("nada é meu") produziria um lançamento de R$ 0,00 que parece
    // legítimo. Errar para "é seu" produz um item visível na lista, que o dono move.
    const c = classificacaoInicial([item("a", 100), item("b", 200)]);
    expect(c).toHaveLength(2);
    expect(c.every((x) => x.destino.tipo === "meu")).toBe(true);
  });

  it("preserva os itens como vieram", () => {
    const itens = [item("a", 100), item("b", null)];
    expect(classificacaoInicial(itens).map((c) => c.item)).toEqual(itens);
  });
});
