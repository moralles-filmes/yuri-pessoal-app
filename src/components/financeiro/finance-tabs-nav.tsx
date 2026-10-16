import { AbasDeRota } from "@/components/shared/abas-de-rota";

// `exact: true` na "Visão geral" era a mesma exceção que os navs de módulo escreviam à mão,
// só que escrita nos DADOS. Com o vencedor decidido sobre a lista inteira (`hrefAtivo`),
// `/financeiro` só ganha quando nenhuma aba mais funda casou. A forma da fita mora em
// `AbasDeRota` desde a 07-A, que ganhou o segundo consumidor (Rotinas e tarefas).
const TABS = [
  { href: "/financeiro", rotulo: "Visão geral" },
  { href: "/financeiro/lancamentos", rotulo: "Lançamentos" },
  { href: "/financeiro/contas", rotulo: "Contas" },
  { href: "/financeiro/categorias", rotulo: "Categorias" },
  { href: "/financeiro/contas-fixas", rotulo: "Contas fixas" },
  { href: "/financeiro/recorrencias", rotulo: "Recorrências" },
];

export function FinanceTabsNav() {
  return <AbasDeRota rotulo="Seções de Financeiro" abas={TABS} />;
}
