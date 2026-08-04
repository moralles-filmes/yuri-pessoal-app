/**
 * Fase 16-C — Dieta e Alimentação · Snapshot → colunas do diário.
 *
 * Extraído de `src/lib/actions/nutrition-diary.ts` (16-B) quando receita e refeição-modelo
 * passaram a gravar na MESMA tabela: três actions escrevendo o mesmo conjunto de colunas por
 * conta própria seria o começo da divergência que o módulo inteiro tenta evitar.
 *
 * Módulo comum (não é `"use server"`), então pode exportar valores síncronos.
 */
import type { DiaryEntrySnapshot } from "./types";

/** Colunas do snapshot, prontas para o insert/update de `nutrition_diary_entries`. */
export function snapshotColumns(snapshot: DiaryEntrySnapshot) {
  return {
    food_name_snapshot: snapshot.foodNameSnapshot,
    preparation_state_snapshot: snapshot.preparationStateSnapshot,
    brand_snapshot: snapshot.brandSnapshot,
    quantity: snapshot.quantity,
    measure_label: snapshot.measureLabel,
    // Nulos são preservados: receita em porções sem peso final não tem equivalente em gramas,
    // e um 0 aqui afirmaria que a porção não pesa nada.
    grams_equivalent: snapshot.gramsEquivalent,
    base_quantity: snapshot.baseQuantity,
    base_unit: snapshot.baseUnit,
    source_id_snapshot: snapshot.sourceIdSnapshot,
    source_name_snapshot: snapshot.sourceNameSnapshot,
    source_version_snapshot: snapshot.sourceVersionSnapshot,
    source_food_code_snapshot: snapshot.sourceFoodCodeSnapshot,
    nutrients_snapshot: snapshot.nutrientsSnapshot,
    energy_kcal: snapshot.energyKcal,
    protein_g: snapshot.proteinG,
    carb_g: snapshot.carbG,
    fat_g: snapshot.fatG,
    fiber_g: snapshot.fiberG,
  };
}
