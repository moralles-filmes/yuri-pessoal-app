/**
 * Fase 18-A — IA · Navegação interna do módulo.
 *
 * REDESIGN-02-E: o desenho da coluna, da gaveta e do item ativo saiu daqui e foi para
 * `@/components/shared/module-shell`, que é o mesmo dos outros dois módulos. O que fica
 * neste arquivo é o que é DA IA: quais seções e com que ícone.
 *
 * Duas coisas que só apareceram quando as três cópias foram lidas lado a lado, e que a
 * casca compartilhada corrige: este nav não marcava `aria-current="page"` e o `<nav>` não
 * tinha `aria-label`. Em `/ia`, a única pista de "você está aqui" era a cor.
 *
 * ⚠️ O cabeçalho antigo dizia "são 4 seções na 18-A, então não há agrupamento — quando as
 * subfases seguintes acrescentarem itens, aí sim vale agrupar". São OITO desde a 18-F, e a
 * lista corrida continua: Dieta agrupou com 12 e Treinos com 13. Se passar disso, o formato
 * já aceita grupos — basta partir o array.
 */
import {
  Brain,
  Gauge,
  History,
  Lightbulb,
  MessageSquare,
  MessagesSquare,
  ReceiptText,
  Settings,
  type LucideIcon,
} from "lucide-react";
import type { NavegacaoDeModulo } from "@/components/shared/module-shell";
import { AI_SECTIONS } from "@/lib/ai/constants";

const ICONS: Record<string, LucideIcon> = {
  "message-square": MessageSquare,
  "messages-square": MessagesSquare,
  history: History,
  receipt: ReceiptText,
  lightbulb: Lightbulb,
  brain: Brain,
  gauge: Gauge,
  settings: Settings,
};

/** A navegação da IA: um grupo só, sem título — 8 itens ainda se varrem de uma vez. */
export const NAV_DA_IA: NavegacaoDeModulo = {
  nome: "Inteligência Artificial",
  grupos: [
    {
      itens: AI_SECTIONS.map((section) => ({
        href: section.href,
        title: section.title,
        icon: ICONS[section.icon] ?? MessageSquare,
      })),
    },
  ],
};
