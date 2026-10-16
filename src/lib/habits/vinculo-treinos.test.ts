import { describe, expect, it } from "vitest";
import { refleteOsTreinos } from "./vinculo-treinos";

describe("refleteOsTreinos — o hábito é o vinculado aos Treinos?", () => {
  it("o hábito vinculado reflete os treinos", () => {
    expect(refleteOsTreinos("h1", "h1")).toBe(true);
  });

  it("vínculo desligado (null, o padrão): nenhum hábito reflete", () => {
    expect(refleteOsTreinos("h1", null)).toBe(false);
  });

  it("outro hábito não reflete", () => {
    expect(refleteOsTreinos("h2", "h1")).toBe(false);
  });
});
