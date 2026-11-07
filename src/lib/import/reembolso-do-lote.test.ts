/**
 * 04-C · T7 — a prévia do reembolso na revisão do lote: linhas da MESMA pessoa em sequência (a
 * segunda considera a primeira), na ordem do arquivo. Fixture sintética.
 */
import { describe, expect, it } from "vitest";
import { previasDoReembolsoNoLote } from "@/lib/import/reembolso-do-lote";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

describe("previasDoReembolsoNoLote", () => {
  it("duas linhas da mesma pessoa (60000 e 60000, deve 100000): sobra 0 e 20000", () => {
    const previas = previasDoReembolsoNoLote(
      [
        { id: "l1", valorCentavos: 60000, pessoaId: A, ordem: 1 },
        { id: "l2", valorCentavos: 60000, pessoaId: A, ordem: 2 },
      ],
      new Map([[A, { devidoCentavos: 100000, saldoAFavorCentavos: 0 }]]),
    );
    expect(previas.get("l1")).toEqual({ devidoAntesCentavos: 100000, devidoDepoisCentavos: 40000, sobraCentavos: 0 });
    expect(previas.get("l2")).toEqual({ devidoAntesCentavos: 40000, devidoDepoisCentavos: 0, sobraCentavos: 20000 });
  });

  it("pessoas diferentes não se misturam", () => {
    const previas = previasDoReembolsoNoLote(
      [
        { id: "l1", valorCentavos: 60000, pessoaId: A, ordem: 1 },
        { id: "l2", valorCentavos: 60000, pessoaId: B, ordem: 2 },
      ],
      new Map([
        [A, { devidoCentavos: 100000, saldoAFavorCentavos: 0 }],
        [B, { devidoCentavos: 100000, saldoAFavorCentavos: 0 }],
      ]),
    );
    expect(previas.get("l1")?.devidoAntesCentavos).toBe(100000);
    expect(previas.get("l2")?.devidoAntesCentavos).toBe(100000);
    expect(previas.get("l2")?.sobraCentavos).toBe(0);
  });

  it("respeita a ordem do arquivo mesmo com a entrada fora de ordem", () => {
    const previas = previasDoReembolsoNoLote(
      [
        { id: "depois", valorCentavos: 60000, pessoaId: A, ordem: 9 },
        { id: "antes", valorCentavos: 60000, pessoaId: A, ordem: 3 },
      ],
      { [A]: { devidoCentavos: 100000, saldoAFavorCentavos: 0 } },
    );
    expect(previas.get("antes")?.sobraCentavos).toBe(0);
    expect(previas.get("depois")).toEqual({ devidoAntesCentavos: 40000, devidoDepoisCentavos: 0, sobraCentavos: 20000 });
  });

  it("pessoa sem dívida nem saldo no mapa: tudo é sobra", () => {
    const previas = previasDoReembolsoNoLote(
      [{ id: "l1", valorCentavos: 5000, pessoaId: A, ordem: 1 }],
      new Map(),
    );
    expect(previas.get("l1")).toEqual({ devidoAntesCentavos: 0, devidoDepoisCentavos: 0, sobraCentavos: 5000 });
  });

  it("sem linhas: mapa vazio", () => {
    expect(previasDoReembolsoNoLote([], new Map()).size).toBe(0);
  });
});
