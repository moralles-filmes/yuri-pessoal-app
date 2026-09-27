import { describe, expect, it } from "vitest";
import { gerarAlertas, type DashCard, type DashStatement } from "./dashboard";
import { generateNotifications } from "@/lib/notifications/generate";

const HOJE = "2026-09-10";
const CARTAO: DashCard = {
  id: "cartao-sintetico",
  nome: "Cartão sintético",
  cor: null,
  limite_total: 1000,
  dia_fechamento: 8,
  dia_vencimento: 15,
};

/** Os dois caminhos recebem os mesmos valores e datas, sem sobrescrever seus defaults. */
function gerarNosDoisCaminhos({
  saidas = 1000,
  totalFatura = 0,
  vencimento = "2026-09-30",
}: {
  saidas?: number;
  totalFatura?: number;
  vencimento?: string;
}) {
  const mediaSaidas = 1000;
  const fatura: DashStatement = {
    id: "fatura-sintetica",
    card_id: CARTAO.id,
    competencia: "2026-09-01",
    data_fechamento: "2026-09-08",
    data_vencimento: vencimento,
    pago_em: null,
    total_atual: totalFatura,
  };

  const tela = gerarAlertas({
    hoje: HOJE,
    resumoAtual: {
      entradas: 0,
      saidas,
      meu: saidas,
      terceiros: 0,
      cartao: totalFatura,
      cartaoMeu: totalFatura,
      aVista: saidas - totalFatura,
      aVistaMeu: saidas - totalFatura,
    },
    mediaSaidas,
    cards: [CARTAO],
    statements: [fatura],
    receivables: [],
  });
  const sino = generateNotifications({
    todayIso: HOJE,
    nowMs: Date.parse(`${HOJE}T12:00:00-03:00`),
    cards: [CARTAO],
    statements: [{
      id: fatura.id,
      cardId: CARTAO.id,
      cardNome: CARTAO.nome,
      competencia: fatura.competencia,
      data_fechamento: fatura.data_fechamento,
      data_vencimento: fatura.data_vencimento,
      pago_em: fatura.pago_em,
      total: totalFatura,
    }],
    spending: { mes: HOJE.slice(0, 7), saidas, mediaSaidas },
  });
  return { tela, sino };
}

describe("limiares de alerta compartilhados pela tela e pelo sino", () => {
  it.each([
    { fator: 1.22, saidas: 1220, avisa: true },
    { fator: 1.18, saidas: 1180, avisa: false },
  ])("concordam sobre gasto a $fator vezes a média", ({ saidas, avisa }) => {
    const { tela, sino } = gerarNosDoisCaminhos({ saidas });
    expect([
      tela.some((a) => a.kind === "gasto_alto"),
      sino.some((n) => n.type === "high_spending"),
    ]).toEqual([avisa, avisa]);
  });

  it.each([
    { uso: 0.81, totalFatura: 810, avisa: true },
    { uso: 0.79, totalFatura: 790, avisa: false },
  ])("concordam sobre uso de limite a $uso", ({ totalFatura, avisa }) => {
    const { tela, sino } = gerarNosDoisCaminhos({ totalFatura });
    expect([
      tela.some((a) => a.kind === "limite_cartao"),
      sino.some((n) => n.type === "card_limit"),
    ]).toEqual([avisa, avisa]);
  });

  it.each([
    { dias: 5, vencimento: "2026-09-15", avisa: true },
    { dias: 6, vencimento: "2026-09-16", avisa: false },
  ])("concordam sobre fatura fechada vencendo em $dias dias", ({ vencimento, avisa }) => {
    const { tela, sino } = gerarNosDoisCaminhos({ totalFatura: 100, vencimento });
    expect([
      tela.some((a) => a.kind === "vencimento" && a.title.startsWith("Fatura a vencer")),
      sino.some((n) => n.type === "invoice_due"),
    ]).toEqual([avisa, avisa]);
  });
});
