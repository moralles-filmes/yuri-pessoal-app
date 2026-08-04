import type { Metadata } from "next";
import { AiShell } from "@/components/ai/ai-shell";

export const metadata: Metadata = { title: "Inteligência Artificial" };

/**
 * Fase 18-A — Casca do módulo de IA.
 * A navegação interna vive aqui para não remontar a cada troca de seção.
 */
export default function IaLayout({ children }: { children: React.ReactNode }) {
  return <AiShell>{children}</AiShell>;
}
