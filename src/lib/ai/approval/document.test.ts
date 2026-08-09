/**
 * Fase 18-D · Bloco 5 — A PONTE COM A 18-C.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ O QUE SÓ SE PROVA AQUI                                                                ║
 * ║                                                                                       ║
 * ║  • ⛔ **CENTAVOS → REAIS, UMA VEZ SÓ.** A extração fala em centavos; `lancarTransacao` ║
 * ║    recebe REAIS (é o que o formulário recebe). Errar isso faz um café de R$ 4,79 virar ║
 * ║    R$ 479,00 — e num comprovante de R$ 100,00 o erro passa despercebido.               ║
 * ║  • o que gravamos em `campos` VOLTA pelo `extracaoGravadaSchema` — round-trip, como    ║
 * ║    manda a regra dos formulários (`validators/round-trip.test.ts`).                    ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */

import { describe, expect, it, vi } from "vitest";
import { avaliarExtracao } from "@/lib/ai/vision/confidence";
import { extracaoGravadaSchema, lerExtracaoGravada } from "@/lib/ai/vision/schema";
import type { ExtracaoDoModelo } from "@/lib/ai/vision/schema";
import { aplicarCorrecoes } from "@/lib/ai/vision/review";

// O módulo abre um client no topo do caminho de I/O; `payloadDoLancamento` é puro e não o
// usa, mas o import precisa resolver.
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));

const { payloadDoLancamento } = await import("./document");

const HOJE = "2026-08-09";

function crua(over: Partial<ExtracaoDoModelo> = {}): ExtracaoDoModelo {
  return {
    estabelecimento: { valor: "Padaria Dois Irmãos", confianca: "alta" },
    cnpj: { valor: "12.345.678/0001-90", confianca: "media" },
    data: { valor: "2026-08-07", confianca: "alta" },
    hora: { valor: "09:12", confianca: "alta" },
    totalCentavos: { valor: 4790, confianca: "alta" },
    formaPagamento: { valor: "PIX", confianca: "media" },
    numeroDocumento: { valor: "000123", confianca: "baixa" },
    itens: [],
    ...over,
  };
}

describe("payloadDoLancamento", () => {
  it("⛔ converte CENTAVOS para REAIS — 4790 vira 47,90, não 4790,00", () => {
    const p = payloadDoLancamento(avaliarExtracao(crua(), HOJE), { conta: "Nubank" });

    // Número escrito à mão: R$ 47,90. `lancarTransacaoEntrada.valor` é em reais, e
    // `transactionSchema` faz a única conversão que o sistema tem daí em diante.
    expect(p.valor).toBe(47.9);
  });

  it("um valor grande também: R$ 1.234,56 são 123456 centavos", () => {
    const p = payloadDoLancamento(
      avaliarExtracao(crua({ totalCentavos: { valor: 123456, confianca: "alta" } }), HOJE),
      { cartao: "Nubank" },
    );

    expect(p.valor).toBe(1234.56);
  });

  it("é SEMPRE despesa — um comprovante de compra é uma saída", () => {
    const p = payloadDoLancamento(avaliarExtracao(crua(), HOJE), { conta: "Nubank" });
    expect(p.tipo).toBe("despesa");
  });

  it("a escolha do dono passa como veio; o que ele não escolheu vai NULO", () => {
    const p = payloadDoLancamento(avaliarExtracao(crua(), HOJE), {
      cartao: "Nubank Ultravioleta",
    });

    expect(p.cartao).toBe("Nubank Ultravioleta");
    // ⛔ Nem conta nem categoria são adivinhadas. `finance-preview.ts` recusa quando faltam
    // as duas origens — escolher a "principal" por ele mudaria o saldo de uma conta que ele
    // não citou.
    expect(p.conta).toBeNull();
    expect(p.categoria).toBeNull();
  });

  it("a data vai como data PURA, do jeito que a extração a guardou", () => {
    const p = payloadDoLancamento(avaliarExtracao(crua(), HOJE), { conta: "Nubank" });
    expect(p.data).toBe("2026-08-07");
  });

  it("a correção do dono é o que chega ao payload, não a leitura original", () => {
    const original = avaliarExtracao(crua(), HOJE);
    const corrigida = aplicarCorrecoes(original, {
      totalCentavos: 5290,
      estabelecimento: "Padaria do Zé",
    });

    const p = payloadDoLancamento(corrigida, { conta: "Nubank" });
    expect(p.valor).toBe(52.9);
    expect(p.descricao).toBe("Padaria do Zé");
  });
});

describe("round-trip de `ai_document_extractions.campos`", () => {
  it("⛔ o que `avaliarExtracao` produz VOLTA pelo schema de leitura", () => {
    const gravada = avaliarExtracao(
      crua({
        itens: [
          { descricao: "Pão", valorTotalCentavos: 1000, quantidade: 2, confianca: "alta" },
          { descricao: "Leite", valorTotalCentavos: null, quantidade: null, confianca: "baixa" },
        ],
      }),
      HOJE,
    );

    // `parse(parse(x))` — a mesma disciplina dos schemas de formulário.
    const devolta = lerExtracaoGravada(JSON.parse(JSON.stringify(gravada)));
    expect(devolta).toEqual(gravada);
  });

  it("linha de outra forma devolve `null`, nunca um objeto meio preenchido", () => {
    expect(lerExtracaoGravada({})).toBeNull();
    // `{}` é exatamente o que o runner grava numa FALHA — e ele não é uma leitura vazia.
    expect(lerExtracaoGravada({ total: 4790 })).toBeNull();
    expect(lerExtracaoGravada(null)).toBeNull();
  });

  it("campo a mais na linha gravada é RECUSA — `.strict()` também na volta", () => {
    const boa = avaliarExtracao(crua(), HOJE);
    const adulterada = { ...boa, executar: "excluirTransacao" };

    expect(extracaoGravadaSchema.safeParse(adulterada).success).toBe(false);
    expect(lerExtracaoGravada(adulterada)).toBeNull();
  });
});
