"use client";

/**
 * REDESIGN-07-D · D1 — o cartão de proposta SOB DEMANDA.
 *
 * O cartão só aparece depois de uma proposta: no chat, quando o assistente prepara uma
 * alteração; nos comprovantes e nos insights, depois de "Preparar"; em `/ia/acoes`, numa linha
 * ainda pendente ou depois de "Desfazer". Com os estados do Approval Engine (D1), ele cresceu —
 * e `/ia` e `/ia/conversas/[id]` têm de caber na linha de base (spec §6.3, acréscimo A). Fora do
 * primeiro carregamento ele sai de todas elas de uma vez.
 *
 * ⛔ O estado NÃO mora aqui: no chat ele vem de `useConversaDaIa` (acima da gaveta, invariante
 * 95); nos outros hosts, do próprio cartão, que monta uma vez e não desmonta.
 * ⛔ O segundo argumento de `next/dynamic` é objeto literal escrito AQUI (regra 4 do
 * carregamento sob demanda). Quem importa o tipo `PropostaNaTela` usa `import type`, que some
 * na compilação e não puxa o cartão de volta.
 */
import dynamic from "next/dynamic";

export const ProposalCardSobDemanda = dynamic(
  () => import("@/components/ai/proposal-card").then((m) => m.ProposalCard),
  {
    loading: () => (
      <div
        className="mt-3 h-32 animate-pulse rounded-xl border bg-muted/30"
        aria-hidden="true"
      />
    ),
  },
);
