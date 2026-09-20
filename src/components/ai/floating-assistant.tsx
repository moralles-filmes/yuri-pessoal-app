"use client";

/**
 * Fase 18-F · Bloco 2 — IA · O botão flutuante.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ⛔ ESTE ARQUIVO MORA NA CASCA DO APP, ENTÃO TUDO QUE ELE IMPORTA ENTRA NAS 67 ROTAS.   ║
 * ║                                                                                       ║
 * ║ Medido em 2026-09-19, depois do Bloco 1: a rota mais apertada é `/(app)/configuracoes`║
 * ║ com 279,2 KB gz de um teto próprio de 285 — **5,8 KB de folga**. É esse o orçamento   ║
 * ║ deste arquivo e de tudo que ele alcança.                                              ║
 * ║                                                                                       ║
 * ║ Por isso ele NÃO importa: `@/lib/ai/constants` (texto grande, hoje só nas rotas de    ║
 * ║ `/ia`), `@/lib/validators/*` (começa com `import { z } from "zod"`, 62,7 KB gz),      ║
 * ║ `chat-client`, `ui/sheet` nem `ui/dropdown-menu`. Tudo isso está do outro lado do     ║
 * ║ `next/dynamic`, e é lá que tem de ficar. Ao acrescentar um import aqui, rode          ║
 * ║ `npm run build && npm run perf:bundle` ANTES de commitar.                             ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */

import * as React from "react";
import dynamic from "next/dynamic";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useLazyDialog } from "@/components/shared/use-lazy-dialog";
import {
  avisoDoBotao,
  ESTADO_INICIAL,
  reduzirPainel,
  TECLA_DO_PAINEL,
  type CantoDoBotao,
} from "@/lib/ai/painel";

/**
 * ⛔ O segundo argumento tem de ser objeto literal escrito AQUI. O compilador do Next o lê
 * estaticamente e recusa constante compartilhada (`next/dynamic options must be an object
 * literal`). A repetição pelo projeto é exigida, não descuido.
 *
 * `loading: () => null` porque não há nada a reservar: o painel é uma gaveta que entra por
 * cima, não um bloco no fluxo — um esqueleto aqui piscaria no canto sem motivo.
 */
const Painel = dynamic(
  () => import("./floating-assistant-panel").then((m) => m.FloatingAssistantPanel),
  { ssr: false, loading: () => null },
);

export function FloatingAssistant({
  canto: cantoInicial,
  oculto: ocultoInicial,
}: {
  readonly canto: CantoDoBotao;
  readonly oculto: boolean;
}) {
  const [estado, despachar] = React.useReducer(reduzirPainel, ESTADO_INICIAL);
  /**
   * A preferência é SEMEADA pelo servidor e mantida aqui depois. O componente que o dono usou
   * para mover o botão é o que tem de movê-lo na hora; a leitura do layout o confirma na
   * próxima navegação.
   */
  const [canto, setCanto] = React.useState(cantoInicial);
  const [oculto, setOculto] = React.useState(ocultoInicial);
  const montado = useLazyDialog(estado.aberto);

  // O relógio vive no componente, nunca na regra: `avisoDoBotao` recebe `agora`. O minuto é
  // suficiente — o prazo das propostas é de 10, e o selo mostra contagem, não cronômetro.
  const [agora, setAgora] = React.useState(() => new Date());
  React.useEffect(() => {
    const id = setInterval(() => setAgora(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  React.useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === TECLA_DO_PAINEL) {
        e.preventDefault();
        // ⛔ O atalho vale COM O BOTÃO OCULTO. Esconder tira o botão da tela, não o assistente
        // do alcance — e é isso que a mensagem de confirmação promete ao dono.
        despachar({ tipo: "abriu" });
      }
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, []);

  const aviso = avisoDoBotao(estado, agora);

  return (
    <>
      {!oculto && (
        <Button
          type="button"
          size="icon"
          aria-label="Abrir o assistente"
          aria-keyshortcuts="Control+I Meta+I"
          aria-haspopup="dialog"
          aria-expanded={estado.aberto}
          onClick={() => despachar({ tipo: "abriu" })}
          className={cn(
            // z-40: acima do Header (`sticky z-30`), abaixo do overlay do Sheet (`z-50`).
            "fixed bottom-4 z-40 size-12 rounded-full shadow-lg",
            canto === "direita" ? "right-4" : "left-4",
          )}
        >
          <Sparkles className="size-5" />
          {aviso && (
            <>
              <span
                aria-hidden
                className={cn(
                  "absolute -top-0.5 -right-0.5 flex min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-medium",
                  aviso.tipo === "proposta"
                    ? "bg-destructive text-destructive-foreground"
                    : "bg-primary text-primary-foreground",
                )}
              >
                {aviso.quantas > 0 ? aviso.quantas : "•"}
              </span>
              {/* O selo é um número; o leitor de tela recebe a frase inteira. */}
              <span className="sr-only">{aviso.texto}</span>
            </>
          )}
        </Button>
      )}

      {montado && (
        <Painel
          aberto={estado.aberto}
          onOpenChange={(v) => despachar({ tipo: v ? "abriu" : "fechou" })}
          canto={canto}
          oculto={oculto}
          onPreferencia={(p) => {
            setCanto(p.canto);
            setOculto(p.oculto);
          }}
          onAtividade={despachar}
        />
      )}
    </>
  );
}
