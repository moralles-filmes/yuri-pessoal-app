import { MessagesSquare } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";

/**
 * REDESIGN-07-D · V — o vazio da conversa, pelo `EmptyState` de todo o app.
 *
 * ⚠️ SEM `"use client"`, e quem o desenha é QUEM HOSPEDA o chat, não a `ChatView`: `/ia` e
 * `/ia/conversas/[id]` o renderizam no servidor e o passam por `vazio`; o painel flutuante o
 * importa no próprio chunk sob demanda. Importado pela `ChatView`, o `EmptyState` entraria no
 * primeiro carregamento de `/ia` (~0,4 KB gz, acima da folga medida) — o mesmo movimento do D8
 * em `/ia/conversas`.
 */
export function VazioDaConversa() {
  return (
    <EmptyState
      icon={MessagesSquare}
      title="Nenhuma mensagem ainda"
      description="Escreva abaixo para começar."
      className="py-8"
    />
  );
}
