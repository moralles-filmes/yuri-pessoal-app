"use client";

/**
 * Fase 16-A — Dieta e Alimentação · Casca do módulo.
 *
 * REDESIGN-02-E: as três cascas de módulo eram idênticas até o comentário. O que sobrou
 * aqui é o nome do módulo e a sua lista de seções; coluna, gaveta, botão "Seções" e estado
 * vêm de `@/components/shared/module-shell`.
 *
 * ⚠️ A diretiva não é decoração: `NAV_DA_DIETA` carrega o ÍCONE de cada item, que é um
 * componente — ou seja, uma função. Prop de Server para Client Component precisa ser
 * serializável, e função não é. Com a casca no grafo do cliente, o objeto é só um objeto.
 */
import type { ReactNode } from "react";
import { ModuleShell } from "@/components/shared/module-shell";
import { NAV_DA_DIETA } from "./nutrition-nav";

export function NutritionShell({ children }: { children: ReactNode }) {
  return <ModuleShell nav={NAV_DA_DIETA}>{children}</ModuleShell>;
}
