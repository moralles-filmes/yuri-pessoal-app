/**
 * Fase 18-D · Bloco 5 — A REVISÃO DO DONO.
 *
 * O que se prova aqui: corrigir traz o campo para `alta` COM o motivo dizendo quem
 * preencheu; marcar como não identificado NÃO vira `alta`; e o bloqueio de campo essencial
 * responde às correções — nos dois sentidos.
 */

import { describe, expect, it } from "vitest";
import { avaliarExtracao } from "./confidence";
import type { ExtracaoDeComprovante } from "./contracts";
import type { ExtracaoDoModelo } from "./schema";
import {
  aplicarCorrecoes,
  descricaoDoLancamento,
  DESCRICAO_SEM_ESTABELECIMENTO,
  MOTIVO_MARCADO_PELO_DONO,
  revisar,
} from "./review";

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

const boa = (): ExtracaoDeComprovante => avaliarExtracao(crua(), HOJE);

describe("aplicarCorrecoes", () => {
  it("campo ausente na correção NÃO é tocado", () => {
    const antes = boa();
    const depois = aplicarCorrecoes(antes, {});

    expect(depois).toEqual(antes);
  });

  it("corrigir traz para `alta` E registra que foi o dono", () => {
    const depois = aplicarCorrecoes(boa(), { estabelecimento: "Padaria do Zé" });

    expect(depois.estabelecimento.valor).toBe("Padaria do Zé");
    expect(depois.estabelecimento.confianca).toBe("alta");
    // ⛔ Sem o motivo, "o modelo leu com clareza" e "eu digitei" seriam indistinguíveis.
    expect(depois.estabelecimento.motivo).toBe("Preenchido por você.");
  });

  it("⛔ marcar como NÃO IDENTIFICADO não vira `alta` — vira `nao_identificado`", () => {
    const depois = aplicarCorrecoes(boa(), { totalCentavos: null });

    expect(depois.totalCentavos.valor).toBeNull();
    expect(depois.totalCentavos.confianca).toBe("nao_identificado");
    expect(depois.totalCentavos.motivo).toBe(MOTIVO_MARCADO_PELO_DONO);
  });

  it("corrigir um campo não mexe nos outros nem nos itens", () => {
    const antes = avaliarExtracao(
      crua({
        itens: [
          { descricao: "Pão", valorTotalCentavos: 1000, quantidade: 1, confianca: "alta" },
        ],
      }),
      HOJE,
    );
    const depois = aplicarCorrecoes(antes, { hora: "10:30" });

    expect(depois.hora.valor).toBe("10:30");
    expect(depois.totalCentavos).toEqual(antes.totalCentavos);
    expect(depois.itens).toEqual(antes.itens);
  });
});

describe("revisar — o bloqueio responde à correção, nos dois sentidos", () => {
  it("data ilegível BLOQUEIA, e corrigi-la LIBERA", () => {
    const semData = avaliarExtracao(
      crua({ data: { valor: null, confianca: "baixa" } }),
      HOJE,
    );

    const bloqueado = revisar(semData, {});
    expect(bloqueado.veredito.pode).toBe(false);
    if (bloqueado.veredito.pode) return;
    expect(bloqueado.veredito.campos).toEqual(["data da compra"]);

    const liberado = revisar(semData, { data: "2026-08-07" });
    expect(liberado.veredito.pode).toBe(true);
  });

  it("⛔ e o caminho de volta também vale: apagar o total BLOQUEIA de novo", () => {
    const liberado = revisar(boa(), {});
    expect(liberado.veredito.pode).toBe(true);

    const bloqueado = revisar(boa(), { totalCentavos: null });
    expect(bloqueado.veredito.pode).toBe(false);
    if (bloqueado.veredito.pode) return;
    expect(bloqueado.veredito.campos).toEqual(["valor total"]);
  });

  it("os DOIS campos essenciais incertos aparecem juntos no motivo", () => {
    const ruim = avaliarExtracao(
      crua({
        data: { valor: null, confianca: "baixa" },
        totalCentavos: { valor: null, confianca: "baixa" },
      }),
      HOJE,
    );

    const r = revisar(ruim, {});
    expect(r.veredito.pode).toBe(false);
    if (r.veredito.pode) return;
    expect(r.veredito.campos).toEqual(["valor total", "data da compra"]);
    expect(r.veredito.motivo).toContain("valor total e data da compra");
  });

  it("⛔ `conflito` no total BLOQUEIA — contradição não é 'confira depois'", () => {
    const conflitante = avaliarExtracao(
      crua({
        totalCentavos: { valor: 4790, confianca: "alta" },
        itens: [
          { descricao: "Pão", valorTotalCentavos: 1000, quantidade: 1, confianca: "alta" },
        ],
      }),
      HOJE,
    );

    expect(conflitante.totalCentavos.confianca).toBe("conflito");
    expect(revisar(conflitante, {}).veredito.pode).toBe(false);

    // O dono confirma qual dos dois números está certo, e aí segue.
    expect(revisar(conflitante, { totalCentavos: 4790 }).veredito.pode).toBe(true);
  });
});

describe("descricaoDoLancamento", () => {
  it("usa o estabelecimento quando ele existe", () => {
    expect(descricaoDoLancamento(boa())).toBe("Padaria Dois Irmãos");
  });

  it("⛔ sem estabelecimento, NÃO inventa e NÃO devolve vazio", () => {
    const semNome = avaliarExtracao(
      crua({ estabelecimento: { valor: null, confianca: "baixa" } }),
      HOJE,
    );

    // `lancarTransacao` exige `descricao` com pelo menos um caractere: `""` faria a proposta
    // falhar na validação com uma mensagem sobre um campo que o dono nem viu.
    expect(descricaoDoLancamento(semNome)).toBe(DESCRICAO_SEM_ESTABELECIMENTO);
    expect(descricaoDoLancamento(semNome).length).toBeGreaterThan(0);
  });

  it("corta em 200 caracteres — o teto do schema do formulário", () => {
    const longo = aplicarCorrecoes(boa(), { estabelecimento: "A".repeat(300) });
    expect(descricaoDoLancamento(longo)).toHaveLength(200);
  });
});
