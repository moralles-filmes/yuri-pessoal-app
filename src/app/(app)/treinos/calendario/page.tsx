import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { TrainingSectionPlaceholder } from "@/components/training/training-nav";

export const metadata: Metadata = { title: "Calendário · Treinos" };

/** Fase 17-A — Rota reservada. A tela chega na subfase indicada no placeholder. */
export default function Page() {
  return (
    <div className="space-y-6">
      <PageHeader title="Calendário" description="Planejamento e consistência." />
      <TrainingSectionPlaceholder slug="calendario" />
    </div>
  );
}
