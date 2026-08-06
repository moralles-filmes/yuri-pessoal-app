import { describe, expect, it } from "vitest";
import {
  marcarParcelasJaLancadas,
  type ParcelaLancada,
} from "@/lib/import/parcelas-lancadas";
import type { NormalizedRow } from "@/lib/import/types";

function row(p: Partial<NormalizedRow>): NormalizedRow {
  return {
    linhaIndex: p.linhaIndex ?? 1,
    raw: p.raw ?? [],
    dataNorm: p.dataNorm ?? "2026-08-10",
    descricao: p.descricao ?? "NETSHOES 6/12",
    valorCentavos: p.valorCentavos ?? 10500,
    tipo: p.tipo ?? "despesa",
    parcela: p.parcela ?? null,
    parcelasTotal: p.parcelasTotal ?? null,
    identificador: p.identificador ?? null,
    categoriaSugeridaId: p.categoriaSugeridaId ?? null,
    status: p.status ?? "para_importar",
    motivo: p.motivo ?? null,
  };
}

function parcela(p: Partial<ParcelaLancada>): ParcelaLancada {
  return {
    numero: p.numero ?? 6,
    totalParcelas: p.totalParcelas ?? 12,
    valorCentavos: p.valorCentavos ?? 10500,
    competencia: p.competencia === undefined ? "2026-08-01" : p.competencia,
    descricaoBase: p.descricaoBase ?? "netshoes",
    descricaoOriginal: p.descricaoOriginal ?? "NETSHOES 5/12",
  };
}

const COMP = "2026-08-01";

describe("marcarParcelasJaLancadas", () => {
  it("bloqueia a linha da fatura seguinte cuja parcela já foi lançada", () => {
    const rows = [
      row({ descricao: "NETSHOES 6/12", parcela: 6, parcelasTotal: 12 }),
    ];
    const res = marcarParcelasJaLancadas(rows, [parcela({})], COMP);
    expect(res[0].status).toBe("duplicada");
    expect(res[0].motivo).toBe(
      "Já lançada como parcela 6/12 de «NETSHOES 5/12», na fatura de ago/2026.",
    );
  });

  it("casa por número + total + valor quando o banco muda a descrição entre os meses", () => {
    const rows = [
      row({ descricao: "NETSHOES*LOJA 6/12", parcela: 6, parcelasTotal: 12 }),
    ];
    const res = marcarParcelasJaLancadas(rows, [parcela({})], COMP);
    expect(res[0].status).toBe("duplicada");
  });

  it("casa linha SEM marcação de parcela por valor + descrição na competência do lote", () => {
    const rows = [row({ descricao: "NETSHOES", parcela: null, parcelasTotal: null })];
    const res = marcarParcelasJaLancadas(rows, [parcela({})], COMP);
    expect(res[0].status).toBe("duplicada");
  });

  it("não usa o casamento sem marcação quando a competência do lote é desconhecida", () => {
    const rows = [row({ descricao: "NETSHOES", parcela: null, parcelasTotal: null })];
    const res = marcarParcelasJaLancadas(rows, [parcela({})], null);
    expect(res[0].status).toBe("para_importar");
  });

  it("não bloqueia quando não há parcela ativa correspondente", () => {
    // Parcela cancelada nunca chega nesta lista: ela não ocupa mais a fatura.
    const rows = [
      row({ descricao: "NETSHOES 6/12", parcela: 6, parcelasTotal: 12 }),
    ];
    const res = marcarParcelasJaLancadas(rows, [], COMP);
    expect(res[0].status).toBe("para_importar");
    expect(res[0].motivo).toBeNull();
  });

  it("pega também a última parcela (k = N)", () => {
    const rows = [
      row({ descricao: "NETSHOES 12/12", parcela: 12, parcelasTotal: 12 }),
    ];
    const res = marcarParcelasJaLancadas(
      rows,
      [parcela({ numero: 12, competencia: "2027-02-01" })],
      "2027-02-01",
    );
    expect(res[0].status).toBe("duplicada");
    expect(res[0].motivo).toMatch(/parcela 12\/12/);
  });

  it("não bloqueia compra diferente de mesmo valor na mesma fatura", () => {
    const rows = [
      row({ descricao: "PADARIA CENTRAL", parcela: null, parcelasTotal: null }),
    ];
    const res = marcarParcelasJaLancadas(rows, [parcela({})], COMP);
    expect(res[0].status).toBe("para_importar");
  });

  it("consome cada parcela uma única vez", () => {
    const rows = [
      row({ linhaIndex: 1, parcela: 6, parcelasTotal: 12 }),
      row({ linhaIndex: 2, parcela: 6, parcelasTotal: 12 }),
    ];
    const res = marcarParcelasJaLancadas(rows, [parcela({})], COMP);
    expect(res[0].status).toBe("duplicada");
    expect(res[1].status).toBe("para_importar");
  });

  it("não toca em linha ignorada, com erro ou já duplicada", () => {
    const rows = [
      row({ linhaIndex: 1, parcela: 6, parcelasTotal: 12, status: "ignorada" }),
      row({ linhaIndex: 2, parcela: 6, parcelasTotal: 12, status: "erro", motivo: "Data inválida." }),
      row({ linhaIndex: 3, parcela: 6, parcelasTotal: 12, status: "duplicada", motivo: "Linha repetida no arquivo." }),
    ];
    const res = marcarParcelasJaLancadas(rows, [parcela({})], COMP);
    expect(res.map((r) => r.status)).toEqual(["ignorada", "erro", "duplicada"]);
    expect(res[2].motivo).toBe("Linha repetida no arquivo.");
  });

  it("não casa parcela de número diferente", () => {
    const rows = [
      row({ descricao: "NETSHOES 7/12", parcela: 7, parcelasTotal: 12 }),
    ];
    const res = marcarParcelasJaLancadas(rows, [parcela({ numero: 6 })], COMP);
    expect(res[0].status).toBe("para_importar");
  });

  it("prefere o casamento por descrição ao casamento por valor", () => {
    // Duas parcelas 6/12 de mesmo valor: a linha certa fica com a compra de descrição igual.
    const rows = [
      row({ linhaIndex: 1, descricao: "MAGALU 6/12", parcela: 6, parcelasTotal: 12 }),
      row({ linhaIndex: 2, descricao: "NETSHOES 6/12", parcela: 6, parcelasTotal: 12 }),
    ];
    const res = marcarParcelasJaLancadas(
      rows,
      [
        parcela({ descricaoBase: "netshoes", descricaoOriginal: "NETSHOES 5/12" }),
        parcela({ descricaoBase: "magalu", descricaoOriginal: "MAGALU 5/12" }),
      ],
      COMP,
    );
    expect(res[0].motivo).toMatch(/MAGALU/);
    expect(res[1].motivo).toMatch(/NETSHOES/);
  });

  it("omite a fatura da mensagem quando a parcela não tem competência", () => {
    const rows = [row({ parcela: 6, parcelasTotal: 12 })];
    const res = marcarParcelasJaLancadas(
      rows,
      [parcela({ competencia: null })],
      COMP,
    );
    expect(res[0].motivo).toBe(
      "Já lançada como parcela 6/12 de «NETSHOES 5/12».",
    );
  });
});
