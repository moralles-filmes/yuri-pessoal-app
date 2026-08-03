import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { TrainingSectionPlaceholder } from "@/components/training/training-nav";

export const metadata: Metadata = { title: "Histórico · Treinos" };

/** Fase 17-A — Rota reservada. A tela chega na subfase indicada no placeholder. */
export default function Page() {
  return (
    <div className="space-y-6">
      <PageHeader title="Histórico" description="Tudo o que já foi treinado." />
      <TrainingSectionPlaceholder slug="historico" />
    </div>
  );
}
