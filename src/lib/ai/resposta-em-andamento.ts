import { rotaInternaAceita } from "./tools/sources";

/** Estado transitório do SSE. Cada especialista conserva seus cartões ao repetir outra trilha. */
export type PropostaComTrilha = { readonly id: string; readonly trilha: number };
export type EspecialistaNaTela = {
  readonly agentId: string;
  readonly rotulo: string;
  readonly status: "consultando" | "pronto" | "falhou";
};

export function aoTrocarDeTentativa<P extends PropostaComTrilha>(
  propostas: readonly P[],
  trilha: number,
): readonly P[] {
  return propostas.filter((p) => p.trilha !== trilha);
}

export function aoAtualizarEspecialista(
  lista: readonly EspecialistaNaTela[],
  evento: EspecialistaNaTela,
): readonly EspecialistaNaTela[] {
  return lista.some((e) => e.agentId === evento.agentId)
    ? lista.map((e) => e.agentId === evento.agentId ? evento : e)
    : [...lista, evento];
}

export function linhaDeEspecialistas(lista: readonly EspecialistaNaTela[]): string {
  if (lista.length === 0) return "";
  const marcas = { consultando: "…", pronto: " ✓", falhou: " ✕" } as const;
  return "Consultando: " + lista.map((e) => e.rotulo + marcas[e.status]).join(" · ");
}

/** Recusa antes da admissão: devolve a mensagem sem apagar um rascunho novo. */
export function textoParaDevolver(enviado: string, atual: string): string {
  return atual === "" ? enviado : atual;
}

export function deveEnviarComEnter(e: {
  readonly tecla: string;
  readonly shift: boolean;
  readonly compondo: boolean;
  readonly atalho: boolean;
  readonly toque: boolean;
}): boolean {
  return e.tecla === "Enter" && !e.compondo && (e.atalho || (!e.shift && !e.toque));
}

/** A navegação do painel segue a mesma allowlist de rotas dos chips e da resposta. */
export function deveFecharAoNavegar(href: string | null): boolean {
  return href !== null && rotaInternaAceita(href);
}
