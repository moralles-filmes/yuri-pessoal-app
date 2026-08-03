import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { TrainingSectionPlaceholder } from "@/components/training/training-nav";

export const metadata: Metadata = { title: "Treinos · Treinos" };

/** Fase 17-A — Rota reservada. A tela chega na subfase indicada no placeholder. */
export default function Page() {
  return (
    <div className="space-y-6">
      <PageHeader title="Treinos" description="Modelos de treino reutilizáveis." />
      <TrainingSectionPlaceholder slug="treinos" />
    </div>
  );
}
