/**
 * REDESIGN-07-D · D3 — IA · O que a região de status do chat anuncia.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ A FASE, NUNCA O TEXTO.                                                                ║
 * ║                                                                                       ║
 * ║ A conversa é um `role="log"` com `aria-live="off"`: o papel `log` traz `polite`       ║
 * ║ implícito, e com streaming o leitor de tela leria cada pedaço da resposta. Quem fala  ║
 * ║ é uma região `role="status"` que só muda quando a fase muda — e o que entra nela sai  ║
 * ║ daqui, de um evento, nunca de um delta.                                               ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * Puro. `rotuloDaFerramenta` vem de `@/lib/ai/constants`, que as telas da IA já carregam.
 */

import { rotuloDaFerramenta } from "@/lib/ai/constants";

export type EventoDaFase =
  | { readonly tipo: "start" }
  | { readonly tipo: "tool"; readonly toolName: string }
  | { readonly tipo: "switch"; readonly motivo: string }
  | { readonly tipo: "proposta" }
  | { readonly tipo: "done" }
  | { readonly tipo: "error"; readonly mensagem: string }
  | { readonly tipo: "cancelada" };

export function faseDoEvento(evento: EventoDaFase): string {
  switch (evento.tipo) {
    case "start":
      return "Respondendo…";
    case "tool": {
      // O rótulo é "Módulo · consulta"; a fase diz o módulo. Ferramenta sem rótulo não vaza o
      // identificador técnico (`rotuloDaFerramenta` devolve o próprio nome nesse caso).
      const rotulo = rotuloDaFerramenta(evento.toolName);
      const separador = rotulo.indexOf(" · ");
      return separador > 0
        ? `Consultando ${rotulo.slice(0, separador)}…`
        : "Consultando seus registros…";
    }
    case "switch":
      return evento.motivo;
    case "proposta":
      return "Uma alteração aguardando você";
    case "done":
      return "Resposta concluída";
    case "error":
      return evento.mensagem;
    case "cancelada":
      return "Resposta cancelada";
  }
}
