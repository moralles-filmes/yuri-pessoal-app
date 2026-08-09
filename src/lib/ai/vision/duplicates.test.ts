/**
 * Fase 18-D — IA · Duplicidade que sinaliza.
 *
 * O teste mais importante do arquivo é o que prova que **duas compras iguais no mesmo dia
 * continuam possíveis**. É a lição do FITID (bug real de 2026-08-06) aplicada ao módulo novo
 * antes de o defeito acontecer nele.
 */

import { describe, expect, it } from "vitest";
import {
  alertaDeArquivoIdentico,
  alertasDeDuplicidade,
  alertasDeLancamentoParecido,
  type EnvioAnterior,
  type TransacaoParecida,
} from "./duplicates";
import type { ExtracaoDeComprovante } from "./contracts";

const extracao = (
  over: Partial<ExtracaoDeComprovante> = {},
): ExtracaoDeComprovante => ({
  estabelecimento: { valor: "Padaria São João", confianca: "alta", motivo: null },
  cnpj: { valor: null, confianca: "nao_identificado", motivo: null },
  data: { valor: "2026-08-07", confianca: "alta", motivo: null },
  hora: { valor: null, confianca: "nao_identificado", motivo: null },
  totalCentavos: { valor: 4790, confianca: "alta", motivo: null },
  formaPagamento: { valor: "PIX", confianca: "alta", motivo: null },
  numeroDocumento: { valor: null, confianca: "nao_identificado", motivo: null },
  itens: [],
  ...over,
});

const transacao = (over: Partial<TransacaoParecida> = {}): TransacaoParecida => ({
  transacaoId: "t1",
  descricao: "PADARIA SAO JOAO LTDA",
  dataISO: "2026-08-07",
  valorCentavos: 4790,
  ...over,
});

describe("arquivo idêntico — certeza, e ainda assim alerta", () => {
  it("sem envio anterior não alerta", () => {
    expect(alertaDeArquivoIdentico([])).toBeNull();
  });

  it("distingue 'virou lançamento' de 'não virou'", () => {
    const virou: EnvioAnterior = {
      documentoId: "d1",
      enviadoEm: "2026-08-07",
      virouLancamento: true,
    };
    expect(alertaDeArquivoIdentico([virou])?.mensagem).toContain("virou um lançamento");

    const naoVirou: EnvioAnterior = { ...virou, virouLancamento: false };
    expect(alertaDeArquivoIdentico([naoVirou])?.mensagem).toContain(
      "não virou lançamento nenhum",
    );
  });

  it("mostra o MAIS RECENTE, não o primeiro da lista", () => {
    // Listar sete envios do mesmo arquivo não ajuda a decidir; o mais recente é o que
    // responde "e no que deu?".
    const alerta = alertaDeArquivoIdentico([
      { documentoId: "antigo", enviadoEm: "2026-01-02", virouLancamento: false },
      { documentoId: "novo", enviadoEm: "2026-08-07", virouLancamento: true },
      { documentoId: "meio", enviadoEm: "2026-05-05", virouLancamento: false },
    ]);
    // Estreitamento explícito em vez de `alerta?.documentoId`: a união tem duas pernas, e
    // o `tsc` reprova o acesso direto. (Vitest passaria — foi a armadilha nº 3 da 18-B.)
    expect(alerta?.tipo).toBe("arquivo_identico");
    if (alerta?.tipo === "arquivo_identico") {
      expect(alerta.documentoId).toBe("novo");
    }
    expect(alerta?.mensagem).toContain("07/08/2026");
  });

  it("a data sai em formato brasileiro", () => {
    const alerta = alertaDeArquivoIdentico([
      { documentoId: "d", enviadoEm: "2026-12-25", virouLancamento: false },
    ]);
    expect(alerta?.mensagem).toContain("25/12/2026");
  });
});

describe("trio valor + data + estabelecimento", () => {
  it("os três batendo geram alerta, com o valor em BRL", () => {
    const alertas = alertasDeLancamentoParecido(extracao(), [transacao()]);
    expect(alertas).toHaveLength(1);
    expect(alertas[0].mensagem).toContain("R$ 47,90");
    expect(alertas[0].mensagem).toContain("07/08/2026");
  });

  it("⛔ E A MENSAGEM DIZ QUE PODE SER OUTRA COMPRA IGUAL", () => {
    // A frase existe porque a decisão é do dono. Um texto afirmando "isto é duplicado"
    // empurraria para a resposta errada metade das vezes.
    const alertas = alertasDeLancamentoParecido(extracao(), [transacao()]);
    expect(alertas[0].mensagem).toContain("pode ser outra compra igual");
  });

  it("valor diferente não alerta", () => {
    expect(
      alertasDeLancamentoParecido(extracao(), [transacao({ valorCentavos: 4791 })]),
    ).toEqual([]);
  });

  it("data diferente não alerta", () => {
    expect(
      alertasDeLancamentoParecido(extracao(), [transacao({ dataISO: "2026-08-06" })]),
    ).toEqual([]);
  });

  it("⛔ ESTABELECIMENTO DIFERENTE NÃO ALERTA — duas compras de mesmo valor no mesmo dia são comuns", () => {
    // É o caso que enche a tela de ruído se for sinalizado: sábado, R$ 47,90 na padaria e
    // R$ 47,90 no posto. Sinalizar treina o dono a ignorar todos os alertas.
    expect(
      alertasDeLancamentoParecido(extracao(), [
        transacao({ descricao: "POSTO IPIRANGA" }),
      ]),
    ).toEqual([]);
  });

  it("casa apesar de acento, caixa e sufixo societário", () => {
    // "Padaria São João" (da nota) dentro de "PADARIA SAO JOAO LTDA" (do lançamento).
    // Quem normaliza é a Fase 06 — a MESMA função da importação.
    expect(alertasDeLancamentoParecido(extracao(), [transacao()])).toHaveLength(1);
  });

  it("campo essencial faltando não alerta", () => {
    // Sem os três não há trio. Comparar com um campo faltando produziria alerta para toda
    // compra de mesmo valor do mês.
    const semData = extracao({
      data: { valor: null, confianca: "nao_identificado", motivo: null },
    });
    expect(alertasDeLancamentoParecido(semData, [transacao()])).toEqual([]);

    const semTotal = extracao({
      totalCentavos: { valor: null, confianca: "nao_identificado", motivo: null },
    });
    expect(alertasDeLancamentoParecido(semTotal, [transacao()])).toEqual([]);

    const semNome = extracao({
      estabelecimento: { valor: null, confianca: "nao_identificado", motivo: null },
    });
    expect(alertasDeLancamentoParecido(semNome, [transacao()])).toEqual([]);
  });

  it("alerta sobre CADA candidata que bate", () => {
    const alertas = alertasDeLancamentoParecido(extracao(), [
      transacao({ transacaoId: "t1" }),
      transacao({ transacaoId: "t2" }),
    ]);
    expect(alertas.map((a) => "transacaoId" in a && a.transacaoId)).toEqual(["t1", "t2"]);
  });
});

describe("⛔ NENHUM ALERTA BLOQUEIA", () => {
  it("o tipo não tem campo de bloqueio — a tela não pode inventar a recusa", () => {
    const alertas = alertasDeDuplicidade({
      extracao: extracao(),
      enviosAnteriores: [
        { documentoId: "d1", enviadoEm: "2026-08-07", virouLancamento: true },
      ],
      transacoesCandidatas: [transacao()],
    });

    expect(alertas).toHaveLength(2);
    for (const alerta of alertas) {
      expect(alerta).not.toHaveProperty("bloqueia");
      expect(alerta).not.toHaveProperty("impede");
      // Todo alerta nomeia o registro anterior: sem o id, o dono não tem como conferir, e
      // um aviso que não dá para conferir é um aviso que só assusta.
      expect("documentoId" in alerta || "transacaoId" in alerta).toBe(true);
    }
  });

  it("certeza vem antes de heurística", () => {
    const alertas = alertasDeDuplicidade({
      extracao: extracao(),
      enviosAnteriores: [
        { documentoId: "d1", enviadoEm: "2026-08-07", virouLancamento: false },
      ],
      transacoesCandidatas: [transacao()],
    });
    expect(alertas[0].tipo).toBe("arquivo_identico");
    expect(alertas[1].tipo).toBe("lancamento_parecido");
  });

  it("sem nada parecido, nenhum alerta", () => {
    expect(
      alertasDeDuplicidade({
        extracao: extracao(),
        enviosAnteriores: [],
        transacoesCandidatas: [],
      }),
    ).toEqual([]);
  });
});
