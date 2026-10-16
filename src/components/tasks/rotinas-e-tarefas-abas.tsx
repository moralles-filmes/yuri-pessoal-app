import { AbasDeRota } from "@/components/shared/abas-de-rota";
import { ABAS_DE_ROTINAS_E_TAREFAS } from "./rotinas-e-tarefas";

export function RotinasETarefasAbas() {
  // O invólucro é de propósito. As duas telas põem a fita direto num `space-y-5`, que no
  // Tailwind v4 dá a margem por `:where(…)` (especificidade zero): o `-mb-px` da fita vencia
  // e ela encostava no bloco de baixo, 1 px por cima. A margem vai para o `div`; o `-mb-px`
  // fica dentro, onde só soma −1 px. O Financeiro não precisa: o layout dele já compensa.
  return (
    <div>
      <AbasDeRota rotulo="Seções de Rotinas e tarefas" abas={ABAS_DE_ROTINAS_E_TAREFAS} />
    </div>
  );
}
