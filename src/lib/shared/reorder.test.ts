import { describe, expect, it } from "vitest";
import { arrayMoveById, reorderedPositions } from "./reorder";

describe("reorderedPositions", () => {
  it("mapeia cada id para sua posição = índice (começando em 0)", () => {
    expect(reorderedPositions(["a", "b", "c"])).toEqual([
      { id: "a", position: 0 },
      { id: "b", position: 1 },
      { id: "c", position: 2 },
    ]);
  });

  it("retorna lista vazia para entrada vazia", () => {
    expect(reorderedPositions([])).toEqual([]);
  });
});

describe("arrayMoveById", () => {
  const ids = ["a", "b", "c", "d"];

  it("move um id para a posição de outro (para frente)", () => {
    expect(arrayMoveById(ids, "a", "c")).toEqual(["b", "c", "a", "d"]);
  });

  it("move um id para a posição de outro (para trás)", () => {
    expect(arrayMoveById(ids, "d", "b")).toEqual(["a", "d", "b", "c"]);
  });

  it("não altera a ordem quando origem e destino são iguais", () => {
    expect(arrayMoveById(ids, "b", "b")).toEqual(ids);
  });

  it("retorna o mesmo array quando algum id não existe", () => {
    expect(arrayMoveById(ids, "x", "b")).toEqual(ids);
    expect(arrayMoveById(ids, "a", "z")).toEqual(ids);
  });
});
