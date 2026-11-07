import { describe, expect, it } from "vitest";
import { dataDeAdiamento } from "./adiamento";
import fs from "node:fs";
describe("adiamento conta dias de Brasília", () => {
  it("às 22h30 do dia vinte, soma a semana a partir do dia vinte", () => {
    expect(dataDeAdiamento(new Date("2026-10-21T01:30:00Z"), 7)).toBe("2026-10-27");
  });
  it("atravessa mês e ano sem mudar o instante recebido", () => {
    const agora = new Date("2027-01-01T02:00:00Z");
    expect(dataDeAdiamento(agora, 7)).toBe("2027-01-07");
    expect(agora.toISOString()).toBe("2027-01-01T02:00:00.000Z");
  });
  it("a ação da tela usa o helper com uma semana", () => {
    expect(fs.readFileSync("src/components/ai/insights-client.tsx", "utf8")).toMatch(/dataDeAdiamento\(new Date\(\), 7\)/);
  });
});

it.each(["src/components/ai/insights-client.tsx", "src/components/dashboard/general/insights-card.tsx"])("o título pode ocupar linha própria e quebrar palavras em %s", arquivo => {
  expect(fs.readFileSync(arquivo, "utf8")).toContain("min-w-0 flex-auto break-words");
});
