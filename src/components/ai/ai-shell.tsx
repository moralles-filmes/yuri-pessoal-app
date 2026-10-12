"use client";

/**
 * Fase 18-A — IA · Casca do módulo.
 *
 * REDESIGN-02-E: as três cascas de módulo eram idênticas até o comentário. O que sobrou
 * aqui é o nome do módulo e a sua lista de seções; coluna, gaveta, botão "Seções" e estado
 * vêm de `@/components/shared/module-shell`.
 */
import type { ReactNode } from "react";
import { ModuleShell } from "@/components/shared/module-shell";
import { NAV_DA_IA } from "./ai-nav";

export function AiShell({ children }: { children: ReactNode }) {
  return <ModuleShell nav={NAV_DA_IA}>{children}</ModuleShell>;
}
