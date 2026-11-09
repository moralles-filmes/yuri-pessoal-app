import type { EstadoDaProposta } from "@/lib/ai/approval/state";

/** Só devolve o botão quando sabemos que a proposta terminou sem executar. */
export function botaoDeDesfazerVolta(estado: EstadoDaProposta | "nao_aplicada"): boolean {
  return estado === "expirada" || estado === "recusada";
}
