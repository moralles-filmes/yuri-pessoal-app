import { describe, expect, it } from "vitest";
import { rotuloDeHoje, rotuloDoDia } from "@/lib/dashboard/rotulos";

describe("rotuloDeHoje", () => {
  it("dia útil: abreviação pt-BR minúscula sem ponto", () => {
    expect(rotuloDeHoje("2026-11-18")).toBe("hoje, qua 18/11");
  });

  it("domingo", () => {
    expect(rotuloDeHoje("2026-11-22")).toBe("hoje, dom 22/11");
  });

  it("sábado", () => {
    expect(rotuloDeHoje("2026-11-21")).toBe("hoje, sáb 21/11");
  });
});

describe("rotuloDoDia", () => {
  it("dd/MM sem dia da semana", () => {
    expect(rotuloDoDia("2026-11-18")).toBe("18/11");
  });
});
