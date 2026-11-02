/**
 * REDESIGN-05-A — a navegação interna da central de cartões.
 *
 * A central agrupa telas que já existem em rotas próprias: `/cartoes`, `/faturas` e
 * `/parcelamentos`. NENHUMA página muda de lugar nesta fase — o que muda é que elas
 * passam a compartilhar uma casca de módulo com coluna lateral, no mesmo molde de
 * Dieta, Treinos e IA.
 *
 * ⛔ Em `/cartoes` o item da coluna é o próprio módulo (`/cartoes`), e não `/cartoes/meus`.
 * As duas rotas existem e são telas diferentes: a visão geral e a lista de cartões.
 *
 * Próximos meses e Relatórios ficam para a 05-C: aqui só entram as seções entregues.
 * 05-B: o item /faturas passou a se chamar "Faturas e pagamentos".
 */
import { CreditCard, Layers, LayoutGrid, ReceiptText } from "lucide-react";
import type { NavegacaoDeModulo } from "@/components/shared/module-shell";

export const NAV_DA_CENTRAL_DE_CARTOES: NavegacaoDeModulo = {
  nome: "Cartões e faturas",
  grupos: [
    {
      itens: [
        { href: "/cartoes", title: "Visão geral", icon: LayoutGrid },
        { href: "/cartoes/meus", title: "Meus cartões", icon: CreditCard },
        { href: "/faturas", title: "Faturas e pagamentos", icon: ReceiptText },
        { href: "/parcelamentos", title: "Parcelamentos", icon: Layers },
      ],
    },
  ],
};
