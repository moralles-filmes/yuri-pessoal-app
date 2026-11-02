"use client";

/**
 * REDESIGN-05-A — a casca da central de cartões.
 *
 * Fino de propósito: toda a decisão de navegação (item ativo, coluna, gaveta) mora em
 * `@/components/shared/module-shell`, como em `ai-shell.tsx`. Este arquivo só entrega os
 * dados do módulo. Os três `layout.tsx` (`/cartoes`, `/faturas`, `/parcelamentos`) a montam.
 */
import type { ReactNode } from "react";
import { ModuleShell } from "@/components/shared/module-shell";
import { NAV_DA_CENTRAL_DE_CARTOES } from "./cartoes-nav";

export function CartoesShell({ children }: { children: ReactNode }) {
  return <ModuleShell nav={NAV_DA_CENTRAL_DE_CARTOES}>{children}</ModuleShell>;
}
