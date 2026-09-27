import { TODO_NAV_VIEWS } from "@/lib/todo/constants";
import type { TodoRoute } from "@/components/todo/todo-nav";

/**
 * Resolve a rota interna do TO-DO a partir da URL (`?v=` + `?id=`).
 *
 * Mora fora do `page.tsx` porque o Next não aceita export arbitrário de página, e o
 * contrato dos deep-links (`src/test/deep-links-query-string.test.ts`) precisa CHAMÁ-LA:
 * ler o texto dela seria testar a forma, não o comportamento.
 */
export function resolveRoute(v: string | undefined, id: string | undefined): TodoRoute {
  if (v === "projeto" && id) return { kind: "projeto", id };
  if (v === "etiqueta" && id) return { kind: "etiqueta", id };
  if (v === "filtro" && id) return { kind: "filtro", id };
  if (v === "arquivados") return { kind: "arquivados" };
  if (v && (TODO_NAV_VIEWS as readonly string[]).includes(v)) {
    return { kind: "view", value: v as (typeof TODO_NAV_VIEWS)[number] };
  }
  return { kind: "view", value: "hoje" };
}
