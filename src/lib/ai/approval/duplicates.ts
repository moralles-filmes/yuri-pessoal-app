/** Aviso apenas: duas propostas legítimas iguais continuam confirmáveis separadamente. */
export const AVISO_DUPLICATA = "possível duplicata — há outra igual nesta conversa";

type Candidata = { readonly id: string; readonly runId: string | null; readonly effectHash: string; readonly pendente: boolean };
export function idsDePropostasDuplicadas(propostas: readonly Candidata[]): ReadonlySet<string> {
  const grupos = new Map<string, Set<string>>();
  for (const p of propostas) {
    if (!p.pendente || !p.runId) continue;
    const chave = JSON.stringify([p.runId, p.effectHash]);
    const ids = grupos.get(chave) ?? new Set<string>();
    ids.add(p.id);
    grupos.set(chave, ids);
  }
  return new Set([...grupos.values()].filter(ids => ids.size > 1).flatMap(ids => [...ids]));
}

type Cartao = { readonly id: string; readonly effectHash: string; readonly expiresAt: string };
export function duplicataNoChat(proposta: Cartao, pendentesDaResposta: readonly Cartao[], agora: number): boolean {
  const candidatas = pendentesDaResposta.map(p => ({ ...p, runId: "resposta", pendente: Date.parse(p.expiresAt) > agora }));
  return idsDePropostasDuplicadas(candidatas).has(proposta.id);
}
