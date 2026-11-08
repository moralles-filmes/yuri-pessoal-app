import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { botaoDeDesfazerVolta } from "./retomar-desfazer";
describe("retomar uma proposta de desfazer sem execução",()=>{
  it.each(["expirada","recusada"] as const)("%s devolve o botão",estado=>expect(botaoDeDesfazerVolta(estado)).toBe(true));
  it.each(["pendente","confirmada","executando","executada","falhou","parcial","nao_aplicada"] as const)("%s não oferece repetição",estado=>expect(botaoDeDesfazerVolta(estado)).toBe(false));
  it("o cartão usa o estado derivado e o host limpa a proposta",()=>{
    const cartao=fs.readFileSync("src/components/ai/proposal-card.tsx","utf8");
    const historico=fs.readFileSync("src/components/ai/action-history-client.tsx","utf8");
    expect(cartao).toMatch(/botaoDeDesfazerVolta\(vista.estado\)/);
    expect(cartao).toMatch(/onSemExecucao\?\.\(\)/);
    expect(historico).toMatch(/proposta={proposta} ehDesfazer/);
    expect(historico).toMatch(/onSemExecucao=\{\(\) => setProposta\(null\)\}/);
    expect(cartao).toContain("Você pode pedir o desfazer de novo pelo botão");
  });
});
