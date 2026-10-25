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
