/**
 * REDESIGN-05-A — a navegação interna da central de cartões.
 *
 * A central agrupa telas em rotas próprias: `/cartoes`, `/faturas`, `/cartoes/proximos-meses`,
 * `/parcelamentos`, `/cartoes/relatorios` e `/cartoes/meus`. NENHUMA página muda de lugar — elas compartilham uma
 * casca de módulo com coluna lateral, no mesmo molde de Dieta, Treinos e IA.
 *
 * ⛔ Em `/cartoes` o item da coluna é o próprio módulo (`/cartoes`), e não `/cartoes/meus`.
 * As duas rotas existem e são telas diferentes: a visão geral e a lista de cartões.
 *
 * Só entram seções entregues.
 * 05-B: o item /faturas passou a se chamar "Faturas e pagamentos".
 * 05-C: entra "Próximos meses" (`/cartoes/proximos-meses`), entre Faturas e Parcelamentos.
 * 05-C: entra "Relatórios" (`/cartoes/relatorios`), entre Parcelamentos e Meus cartões.
 */
import {
  CalendarRange,
  ChartColumn,
  CreditCard,
  Layers,
  LayoutGrid,
  ReceiptText,
} from "lucide-react";
import type { NavegacaoDeModulo } from "@/components/shared/module-shell";

export const NAV_DA_CENTRAL_DE_CARTOES: NavegacaoDeModulo = {
  nome: "Cartões e faturas",
  grupos: [
    {
      itens: [
        { href: "/cartoes", title: "Visão geral", icon: LayoutGrid },
        { href: "/faturas", title: "Faturas e pagamentos", icon: ReceiptText },
        { href: "/cartoes/proximos-meses", title: "Próximos meses", icon: CalendarRange },
        { href: "/parcelamentos", title: "Parcelamentos", icon: Layers },
        { href: "/cartoes/relatorios", title: "Relatórios", icon: ChartColumn },
        { href: "/cartoes/meus", title: "Meus cartões", icon: CreditCard },
      ],
    },
  ],
};
