import type { Metadata } from "next";
import { TrainingShell } from "@/components/training/training-shell";

export const metadata: Metadata = { title: "Treinos" };

/**
 * Fase 17-A — Casca do módulo Treinos.
 * A navegação interna vive aqui para não remontar a cada troca de submódulo.
 */
export default function TreinosLayout({ children }: { children: React.ReactNode }) {
  return <TrainingShell>{children}</TrainingShell>;
}
