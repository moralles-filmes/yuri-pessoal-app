import type { Metadata } from "next";
import { NutritionShell } from "@/components/nutrition/nutrition-shell";

export const metadata: Metadata = { title: "Dieta e Alimentação" };

/**
 * Fase 16-A — Casca do módulo Dieta e Alimentação.
 * A navegação interna vive aqui para não remontar a cada troca de submódulo.
 */
export default function NutricaoLayout({ children }: { children: React.ReactNode }) {
  return <NutritionShell>{children}</NutritionShell>;
}
