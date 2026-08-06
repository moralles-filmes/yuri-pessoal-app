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

  it("deduplica a linha realmente repetida (mesmo identificador E mesma chave)", () => {
    const rows = [
      row({ linhaIndex: 1, descricao: "A", valorCentavos: 100, identificador: "FIT1" }),
      row({ linhaIndex: 2, descricao: "A", valorCentavos: 100, identificador: "FIT1" }),
    ];
    const res = detectarDuplicados(rows, new Set(), "acc-1");
    expect(res[0].status).toBe("para_importar");
    expect(res[1].status).toBe("duplicada");
    expect(res[1].motivo).toMatch(/identificador/i);
  });

  // Falsos positivos reais de uma fatura OFX do Nubank (2026-08-06). Os dois vinham de tratar
  // a chave composta e o identificador como evidências independentes.
  it("duas compras iguais no mesmo dia NÃO são duplicata quando o FITID difere", () => {
    const rows = [
      row({ linhaIndex: 1, descricao: "Vmt*Gil & Par", valorCentavos: 1895, identificador: "6a30c1f9" }),
      row({ linhaIndex: 2, descricao: "Vmt*Gil & Par", valorCentavos: 1895, identificador: "6a30b2cf" }),
    ];
    const res = detectarDuplicados(rows, new Set(), "card-1");
    expect(res.map((r) => r.status)).toEqual(["para_importar", "para_importar"]);
  });

  it("mesmo FITID em lançamentos diferentes (crédito de parcelamento × 1ª parcela) não é duplicata", () => {
    const rows = [
      row({ linhaIndex: 1, descricao: "Parcelamento de Compra - Tiktok - 1/3", valorCentavos: 6719, identificador: "6a25bc8b" }),
      row({ linhaIndex: 2, descricao: "Crédito de parcelamento de compra", valorCentavos: 18588, tipo: "receita", identificador: "6a25bc8b" }),
    ];
    const res = detectarDuplicados(rows, new Set(), "card-1");
    expect(res.map((r) => r.status)).toEqual(["para_importar", "para_importar"]);
  });

  it("sem identificador em uma das linhas, mantém o aviso (o arquivo não afirma que são distintas)", () => {
    const rows = [
      row({ linhaIndex: 1, descricao: "A", valorCentavos: 100, identificador: null }),
      row({ linhaIndex: 2, descricao: "A", valorCentavos: 100, identificador: "FIT2" }),
    ];
    const res = detectarDuplicados(rows, new Set(), "card-1");
    expect(res[1].status).toBe("duplicada");
  });

  it("a duplicata contra o sistema não é desfeita pelo identificador (transação não guarda FITID)", () => {
    const existing = new Set<string>([
      chaveComposta("2026-06-26", 15090, "MERCADO X", "card-1")!,
    ]);
    const rows = [row({ linhaIndex: 1, identificador: "FIT9" })];
    const res = detectarDuplicados(rows, existing, "card-1");
    expect(res[0].status).toBe("duplicada");
    expect(res[0].motivo).toMatch(/já existe/i);
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
