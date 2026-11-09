import { describe, expect, it, vi } from "vitest";
const { comparar } = vi.hoisted(() => ({ comparar: vi.fn((a: Buffer, b: Buffer) => a.equals(b)) }));
vi.mock("node:crypto", () => ({ timingSafeEqual: comparar }));
const { segredoConfere } = await import("./segredo-cron");
describe("segredo do Cron", () => {
  it("compara buffers do mesmo tamanho em tempo constante", () => {
    expect(segredoConfere("Bearer segredo", "segredo")).toBe(true);
    expect(comparar).toHaveBeenCalledWith(Buffer.from("Bearer segredo"), Buffer.from("Bearer segredo"));
    expect(segredoConfere("Bearer segredX", "segredo")).toBe(false);
  });
  it("não chama timingSafeEqual com tamanho diferente ou segredo ausente", () => {
    comparar.mockClear();
    for (const [header, secret] of [["Bearer undefined", undefined], ["Bearer ", ""], [null, "a"], ["Bearer a", undefined], ["Bearer a", ""], ["Bearer longo", "a"], ["Basic a", "a"]] as const) {
      expect(segredoConfere(header, secret)).toBe(false);
    }
    expect(comparar).not.toHaveBeenCalled();
  });
});
