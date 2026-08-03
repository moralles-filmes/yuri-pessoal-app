import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { NutritionSectionPlaceholder } from "@/components/nutrition/nutrition-nav";

export const metadata: Metadata = { title: "Planejamento · Dieta" };

/** Fase 16-A — Rota reservada. A tela chega na subfase indicada no placeholder. */
export default function Page() {
  return (
    <div className="space-y-6">
      <PageHeader title="Planejamento" description="Parte do módulo Dieta e Alimentação." />
      <NutritionSectionPlaceholder slug="planejamento" />
    </div>
  );
}
