import type { LinhaDaCentral } from "@/lib/finance/central-cartoes";
import { dateInSaoPaulo } from "@/lib/format";

export type TomDoEstado = "atrasada" | "paga" | "credito" | "prevista" | "aberta" | "neutro";

/** 'yyyy-MM-dd' → 'dd/MM'. Data pura: manipulada como texto. */
function diaMes(iso: string): string {
  const [, mes, dia] = iso.split("-");
  return `${dia}/${mes}`;
}

/**
 * O selo de uma linha da Visão geral: a PALAVRA (nunca só a cor) e o tom. Puro.
 * Crédito vence os outros estados; `paga` lê `pago_em` (instante) em Brasília.
 */
export function rotuloDoEstado(
  linha: LinhaDaCentral,
  tabela: "fechadas" | "abertas",
): { texto: string; tom: TomDoEstado } {
  if (linha.credito) return { texto: "Crédito", tom: "credito" };
  switch (linha.estado) {
    case "atrasada":
      return { texto: "Atrasada", tom: "atrasada" };
    case "fechada":
      return { texto: "Fechada", tom: "neutro" };
    case "paga": {
      if (tabela === "abertas") return { texto: "Paga antes de fechar", tom: "paga" };
      const dia = linha.pagoEm ? dateInSaoPaulo(new Date(linha.pagoEm)) : "";
      return { texto: dia ? `Paga em ${diaMes(dia)}` : "Paga", tom: "paga" };
    }
    case "prevista":
      return { texto: "Prevista", tom: "prevista" };
    case "aberta":
      return { texto: "Aberta", tom: "aberta" };
  }
}
