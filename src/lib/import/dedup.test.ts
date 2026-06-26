import { describe, expect, it } from "vitest";
import {
  chaveComposta,
  contarPorStatus,
  detectarDuplicados,
} from "@/lib/import/dedup";
import type { NormalizedRow } from "@/lib/import/types";

function row(p: Partial<NormalizedRow>): NormalizedRow {
  return {
    linhaIndex: p.linhaIndex ?? 1,
    raw: p.raw ?? [],
    dataNorm: p.dataNorm ?? "2026-06-26",
    descricao: p.descricao ?? "MERCADO X",
    valorCentavos: p.valorCentavos ?? 15090,
    tipo: p.tipo ?? "despesa",
    parcela: p.parcela ?? null,
    parcelasTotal: p.parcelasTotal ?? null,
    identificador: p.identificador ?? null,
    categoriaSugeridaId: p.categoriaSugeridaId ?? null,
    status: p.status ?? "pendente",
    motivo: p.motivo ?? null,
  };
}

describe("chaveComposta", () => {
  it("ignora acento/caixa/espaços da descrição e inclui o alvo", () => {
    const a = chaveComposta("2026-06-26", 15090, "Mercado São João", "card-1");
    const b = chaveComposta("2026-06-26", 15090, "MERCADO SAO  JOAO", "card-1");
    expect(a).toBe(b);
    const outroCartao = chaveComposta("2026-06-26", 15090, "Mercado São João", "card-2");
    expect(a).not.toBe(outroCartao);
  });

  it("retorna null sem data ou valor", () => {
    expect(chaveComposta(null, 100, "X", "c")).toBeNull();
    expect(chaveComposta("2026-06-26", null, "X", "c")).toBeNull();
  });
});

describe("detectarDuplicados", () => {
  it("marca duplicata contra o que já existe e deixa as demais para importar", () => {
    const existing = new Set<string>([
      chaveComposta("2026-06-25", 3250, "UBER", "card-1")!,
    ]);
    const rows = [
      row({ linhaIndex: 1, dataNorm: "2026-06-26", descricao: "MERCADO X", valorCentavos: 15090 }),
      row({ linhaIndex: 2, dataNorm: "2026-06-25", descricao: "UBER", valorCentavos: 3250 }),
    ];
    const res = detectarDuplicados(rows, existing, "card-1");
    expect(res[0].status).toBe("para_importar");
    expect(res[1].status).toBe("duplicada");
    expect(res[1].motivo).toMatch(/já existe/i);
  });

  it("marca a segunda ocorrência repetida no próprio arquivo", () => {
    const rows = [
      row({ linhaIndex: 1, descricao: "MERCADO X", valorCentavos: 15090 }),
      row({ linhaIndex: 2, descricao: "MERCADO  x", valorCentavos: 15090 }),
    ];
    const res = detectarDuplicados(rows, new Set(), "card-1");
    expect(res[0].status).toBe("para_importar");
    expect(res[1].status).toBe("duplicada");
    expect(res[1].motivo).toMatch(/repetida/i);
  });

  it("deduplica por identificador igual dentro do lote (mesmo valor/desc diferentes)", () => {
    const rows = [
      row({ linhaIndex: 1, descricao: "A", valorCentavos: 100, identificador: "FIT1" }),
      row({ linhaIndex: 2, descricao: "B", valorCentavos: 200, identificador: "FIT1" }),
    ];
    const res = detectarDuplicados(rows, new Set(), "acc-1");
    expect(res[0].status).toBe("para_importar");
    expect(res[1].status).toBe("duplicada");
    expect(res[1].motivo).toMatch(/identificador/i);
  });

  it("preserva linhas em erro e não as importa", () => {
    const rows = [
      row({ linhaIndex: 1, status: "erro", motivo: "Data inválida.", dataNorm: null, valorCentavos: null }),
    ];
    const res = detectarDuplicados(rows, new Set(), "card-1");
    expect(res[0].status).toBe("erro");
  });
});

describe("contarPorStatus", () => {
  it("conta por status", () => {
    const rows = [
      row({ status: "para_importar" }),
      row({ status: "para_importar" }),
      row({ status: "duplicada" }),
      row({ status: "erro" }),
    ];
    expect(contarPorStatus(rows)).toEqual({
      para_importar: 2,
      duplicada: 1,
      erro: 1,
    });
  });
});
