/**
 * REDESIGN-07-B · D1 — este hábito é o que REFLETE os treinos?
 *
 * Fase 17-F (invariante 20 de Treinos): o treino é a fonte de verdade, e o hábito vinculado em
 * `training_preferences.habit_id` o reflete por `lib/training/habit-sync.ts` — upsert na linha
 * ÚNICA de `habit_logs` do dia (o valor marcado à mão é substituído; a observação fica) ou
 * EXCLUSÃO dela quando o dia fica sem sessão concluída (observação junto). A tela de Hábitos não
 * dizia nada disso; agora ela marca o hábito, e a decisão "é o vinculado?" mora aqui.
 *
 * Só leitura e acréscimo: nenhuma coluna de origem, nenhuma escrita, `habit-sync.ts` intocado.
 * O vínculo nasce desligado (invariante 21): `null` ⇒ nenhum hábito reflete.
 */
export function refleteOsTreinos(habitId: string, habitoVinculadoId: string | null): boolean {
  return habitoVinculadoId !== null && habitId === habitoVinculadoId;
}
