/**
 * Ação em massa em "A Receber" — testes puros.
 *
 * O teste que mais importa é "seleção fora do filtro": selecionar 109 recebíveis, filtrar
 * para 5 e confirmar não pode dar baixa nos 109. O recorte acontece aqui, e o que ficou de
 * fora volta CONTADO — a tela precisa poder declarar o número antes de o usuário confirmar.
 *
 * Nenhum teste toca o banco e nenhum depende do fuso: as datas são texto puro.
 */
import { describe, expect, it } from "vitest";
import {
  ORIGENS_DA_ACAO,
  alcanceDaAcao,
  dividirEmBlocos,
  patchDaAcao,
} from "./receivables-bulk";
import type { ReceivableStatus } from "./constants";

type Item = { id: string; status: ReceivableStatus; valor: number };

function item(id: string, status: ReceivableStatus, valor = 1000): Item {
  return { id, status, valor };
}

describe("alcanceDaAcao", () => {
  const visiveis: Item[] = [
    item("a", "pendente", 7003),
    item("b", "cobrado", 3340),
    item("c", "pago", 59493),
    item("d", "ignorado", 2873),
  ];

  it("soma o valor só do que a ação realmente alcança", () => {
    const r = alcanceDaAcao(["a", "b"], visiveis, "receber");
    expect(r.ids).toEqual(["a", "b"]);
    expect(r.valorTotal).toBe(7003 + 3340);
    expect(r.naoAlcancados).toBe(0);
    expect(r.foraDoFiltro).toBe(0);
  });

  it("não alcança quem já está no destino, e devolve a contagem", () => {
    const r = alcanceDaAcao(["a", "b", "c"], visiveis, "receber");
    expect(r.ids).toEqual(["a", "b"]);
    expect(r.valorTotal).toBe(7003 + 3340);
    expect(r.naoAlcancados).toBe(1); // "c" já está pago
  });

  it("AÇÃO EM MASSA NÃO SAI DO FILTRO — o que sumiu da tela volta contado", () => {
    // Seleção feita antes de filtrar: 'z' não está mais visível.
    const r = alcanceDaAcao(["a", "z"], visiveis, "receber");
    expect(r.ids).toEqual(["a"]);
    expect(r.foraDoFiltro).toBe(1);
    expect(r.valorTotal).toBe(7003);
  });

  it("desfazer alcança só o que está pago", () => {
    const r = alcanceDaAcao(["a", "b", "c", "d"], visiveis, "desfazer");
    expect(r.ids).toEqual(["c"]);
    expect(r.naoAlcancados).toBe(3);
    expect(r.valorTotal).toBe(59493);
  });

  it("cobrado não alcança o que já está cobrado nem o que já foi pago", () => {
    const r = alcanceDaAcao(["a", "b", "c", "d"], visiveis, "cobrado");
    expect(r.ids).toEqual(["a", "d"]);
    expect(r.naoAlcancados).toBe(2);
  });

  it("ignorar alcança tudo menos o que já está ignorado", () => {
    const r = alcanceDaAcao(["a", "b", "c", "d"], visiveis, "ignorar");
    expect(r.ids).toEqual(["a", "b", "c"]);
    expect(r.naoAlcancados).toBe(1);
  });

  it("seleção vazia devolve lote vazio, nunca a lista inteira", () => {
    const r = alcanceDaAcao([], visiveis, "receber");
    expect(r.ids).toEqual([]);
    expect(r.valorTotal).toBe(0);
    expect(r.foraDoFiltro).toBe(0);
    expect(r.naoAlcancados).toBe(0);
  });

  it("id repetido na seleção conta uma vez só", () => {
    const r = alcanceDaAcao(["a", "a", "a"], visiveis, "receber");
    expect(r.ids).toEqual(["a"]);
    expect(r.foraDoFiltro).toBe(0);
  });

  it("preserva a ordem em que os itens aparecem na tela", () => {
    const r = alcanceDaAcao(["d", "b", "a"], visiveis, "ignorar");
    expect(r.ids).toEqual(["a", "b"]);
  });
});

describe("ORIGENS_DA_ACAO", () => {
  it("nenhuma ação lista o próprio destino como origem (seria um no-op contado como sucesso)", () => {
    expect(ORIGENS_DA_ACAO.receber).not.toContain("pago");
    expect(ORIGENS_DA_ACAO.cobrado).not.toContain("cobrado");
    expect(ORIGENS_DA_ACAO.ignorar).not.toContain("ignorado");
    expect(ORIGENS_DA_ACAO.desfazer).not.toContain("pendente");
  });
});

describe("patchDaAcao", () => {
  it("receber grava a data informada", () => {
    expect(patchDaAcao("receber", "2026-08-05")).toEqual({
      status: "pago",
      pago_em: "2026-08-05",
    });
  });

  it("toda ação que sai de 'pago' limpa a data do recebimento", () => {
    expect(patchDaAcao("cobrado", "2026-08-05")).toEqual({
      status: "cobrado",
      pago_em: null,
    });
    expect(patchDaAcao("ignorar", "2026-08-05")).toEqual({
      status: "ignorado",
      pago_em: null,
    });
    expect(patchDaAcao("desfazer", "2026-08-05")).toEqual({
      status: "pendente",
      pago_em: null,
    });
  });
});

describe("dividirEmBlocos", () => {
  it("divide sem perder nem duplicar nenhum id", () => {
    const ids = Array.from({ length: 450 }, (_, i) => `id-${i}`);
    const blocos = dividirEmBlocos(ids, 200);
    expect(blocos.map((b) => b.length)).toEqual([200, 200, 50]);
    expect(blocos.flat()).toEqual(ids);
  });

  it("lista menor que o bloco vira um bloco só", () => {
    expect(dividirEmBlocos(["a", "b"], 200)).toEqual([["a", "b"]]);
  });

  it("lista vazia não gera bloco — nenhuma requisição sem alvo", () => {
    expect(dividirEmBlocos([], 200)).toEqual([]);
  });
});
