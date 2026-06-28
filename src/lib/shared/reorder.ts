/**
 * Lógica pura de reordenação manual (drag-and-drop). Sem I/O, sem `Date.now()` —
 * coberta por testes Vitest co-localizados. Usada por hábitos e rotinas.
 */

/** Par `{ id, position }` pronto para gravar no banco. */
export type PositionUpdate = { id: string; position: number };

/**
 * Mapeia uma lista já ordenada de ids para `position = índice` (base 0).
 * Esse é o contrato das actions `reorderHabits`/`reorderRoutines`.
 */
export function reorderedPositions(orderedIds: string[]): PositionUpdate[] {
  return orderedIds.map((id, index) => ({ id, position: index }));
}

/**
 * Move `activeId` para a posição ocupada por `overId`, preservando a ordem do resto.
 * Retorna o array inalterado se algum dos ids não existir ou se forem iguais.
 */
export function arrayMoveById(
  ids: string[],
  activeId: string,
  overId: string,
): string[] {
  if (activeId === overId) return ids;
  const from = ids.indexOf(activeId);
  const to = ids.indexOf(overId);
  if (from === -1 || to === -1) return ids;

  const next = [...ids];
  next.splice(from, 1);
  next.splice(to, 0, activeId);
  return next;
}
