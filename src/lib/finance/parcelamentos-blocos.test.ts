import { describe, expect, it } from "vitest";
import type { InstallmentPurchaseStatus } from "./constants";
import { agruparParcelamentos } from "./parcelamentos-blocos";

type Item = { id: string; status: InstallmentPurchaseStatus; ultima: string | null };

const itens: Item[] = [
  { id: "a-2027", status: "ativo", ultima: "2027-06-01" },
  { id: "a-sem", status: "ativo", ultima: null },
  { id: "a-2026", status: "ativo", ultima: "2026-11-01" },
  { id: "f-2026", status: "finalizado", ultima: "2026-03-01" },
  { id: "c-2026", status: "cancelado", ultima: "2026-08-01" },
  { id: "c-sem", status: "cancelado", ultima: null },
  { id: "f-2025", status: "finalizado", ultima: "2025-12-01" },
];

const ids = (l: Item[]) => l.map((i) => i.id);

describe("agruparParcelamentos", () => {
  it("em andamento: só ativos, o que termina antes primeiro, sem data no fim", () => {
    const r = agruparParcelamentos(itens, null);
    expect(ids(r.emAndamento)).toEqual(["a-2026", "a-2027", "a-sem"]);
  });

  it("encerrados: finalizados e cancelados, o que terminou depois primeiro, sem data no fim", () => {
    const r = agruparParcelamentos(itens, null);
    expect(ids(r.encerrados)).toEqual(["c-2026", "f-2026", "f-2025", "c-sem"]);
  });

  it("status ativo deixa os encerrados vazios", () => {
    const r = agruparParcelamentos(itens, "ativo");
    expect(ids(r.emAndamento)).toEqual(["a-2026", "a-2027", "a-sem"]);
    expect(r.encerrados).toEqual([]);
  });

  it("status cancelado deixa só os cancelados e nenhum em andamento", () => {
    const r = agruparParcelamentos(itens, "cancelado");
    expect(r.emAndamento).toEqual([]);
    expect(ids(r.encerrados)).toEqual(["c-2026", "c-sem"]);
  });

  it("status finalizado deixa só os finalizados", () => {
    const r = agruparParcelamentos(itens, "finalizado");
    expect(r.emAndamento).toEqual([]);
    expect(ids(r.encerrados)).toEqual(["f-2026", "f-2025"]);
  });

  it("não muda a entrada e aceita lista vazia", () => {
    const copia = [...itens];
    agruparParcelamentos(itens, null);
    expect(itens).toEqual(copia);
    expect(agruparParcelamentos<Item>([], null)).toEqual({ emAndamento: [], encerrados: [] });
  });
});
