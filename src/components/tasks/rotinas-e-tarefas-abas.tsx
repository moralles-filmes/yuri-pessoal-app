import { AbasDeRota } from "@/components/shared/abas-de-rota";
import { ABAS_DE_ROTINAS_E_TAREFAS } from "./rotinas-e-tarefas";

export function RotinasETarefasAbas() {
  return <AbasDeRota rotulo="Seções de Rotinas e tarefas" abas={ABAS_DE_ROTINAS_E_TAREFAS} />;
}
