"use client";

/**
 * Fase 17-A — Treinos · Casca do módulo.
 *
 * REDESIGN-02-E: as três cascas de módulo eram idênticas até o comentário. O que sobrou
 * aqui é o nome do módulo e a sua lista de seções; coluna, gaveta, botão "Seções" e estado
 * vêm de `@/components/shared/module-shell`.
 */
import type { ReactNode } from "react";
import { ModuleShell } from "@/components/shared/module-shell";
import { NAV_DE_TREINOS } from "./training-nav";

export function TrainingShell({ children }: { children: ReactNode }) {
  return <ModuleShell nav={NAV_DE_TREINOS}>{children}</ModuleShell>;
}
