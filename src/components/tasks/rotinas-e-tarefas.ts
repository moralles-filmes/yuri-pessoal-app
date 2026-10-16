import type { AbaDeRota } from "@/components/shared/abas-de-rota";

/**
 * As duas telas do item "Rotinas e tarefas" do menu (07-A). Dados puros — `nav.test.ts`
 * confere que são exatamente `[item.href, ...item.tambem]`, para as abas e a sidebar não
 * divergirem.
 */
export const ABAS_DE_ROTINAS_E_TAREFAS: readonly AbaDeRota[] = [
  { href: "/rotinas", rotulo: "Rotinas" },
  { href: "/tarefas", rotulo: "Tarefas" },
];
