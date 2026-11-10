"use client";

/**
 * Fase 18-F · Bloco 2 — IA · O botão flutuante.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ⛔ ESTE ARQUIVO MORA NA CASCA DO APP, ENTÃO TUDO QUE ELE IMPORTA ENTRA NAS 71 ROTAS.   ║
 * ║                                                                                       ║
 * ║ Medido em 2026-10-15 (REDESIGN-07-D · D4): `/(app)/configuracoes` saiu do teto próprio ║
 * ║ (205,6 KB gz, sem a Segurança no 1º carregamento), e a rota mais apertada passou a ser ║
 * ║ `/(app)/todo`, com 238,3 KB gz dos 250 — **11,7 KB de folga**. É esse o orçamento     ║
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
import { PRESSAO } from "@/components/ui/materiais";
import { useLazyDialog } from "@/components/shared/use-lazy-dialog";
import {
  avisoDoBotao,
  estadoDoBotao,
  type EstadoDoBotao,
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
 * O indicador só cobre o carregamento inicial do chunk; o estado do chat nasce no painel.
 */
const Painel = dynamic(
  () => import("./floating-assistant-panel").then((m) => m.FloatingAssistantPanel),
  { ssr: false, loading: () => (
    <span role="status" className="fixed bottom-[calc(var(--recuo-barra-acoes)+1rem)] max-lg:right-4 max-lg:left-auto z-40 flex size-12 items-center justify-center rounded-full bg-background shadow-lg left-[var(--assistente-esquerda,auto)] right-[var(--assistente-direita,1rem)]">
      <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
      <span className="sr-only">Abrindo o assistente…</span>
    </span>
  ) },
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
  const [preferencias, setPreferencias] = React.useState<EstadoDoBotao>(() => {
    const inicial = { canto: cantoInicial, oculto: ocultoInicial };
    return { servidor: inicial, atual: inicial };
  });
  const proximo = estadoDoBotao(preferencias, { canto: cantoInicial, oculto: ocultoInicial });
  if (proximo !== preferencias) setPreferencias(proximo);
  const { canto, oculto } = proximo.atual;
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
        <button
          type="button"
          data-casca
          // D3 — o selo é um número; o NOME do botão leva a frase inteira. Um span sr-only dentro
          // do botão seria lido como conteúdo depois do nome, e alguns leitores o omitem.
          aria-label={
            aviso ? `Abrir o assistente — ${aviso.texto}` : "Abrir o assistente"
          }
          aria-keyshortcuts="Control+I Meta+I"
          aria-haspopup="dialog"
          aria-expanded={estado.aberto}
          onClick={() => despachar({ tipo: "abriu" })}
          className={cn(
            // Botão nativo: o `Button` traz fundo próprio, e o material (`background` abreviado)
            // disputaria com ele.
            // 09-G: abaixo de `lg` ele é item da barra de ações (52 px, na linha flex) e `relative`
            // ancora o selo `absolute`; a partir de `lg` volta a ser o círculo `fixed` de sempre.
            // `pointer-events-auto`: a barra é `pointer-events: none` e a propriedade é HERDADA,
            // mesmo com `display: contents` — sem ela o botão não receberia toque.
            // z-40: acima do Header (`sticky z-30`), abaixo do overlay do Sheet (`z-50`).
            "vidro-casca",
            PRESSAO,
            "relative pointer-events-auto size-[52px] shrink-0 rounded-full",
            "lg:fixed lg:bottom-4 lg:z-40 lg:size-12",
            "inline-flex items-center justify-center",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            canto === "direita" ? "lg:right-4" : "lg:left-4",
          )}
        >
          <Sparkles className="size-5 text-nav-ativo-ink" />
          {aviso && (
            <span
              aria-hidden
              className={cn(
                "absolute -top-0.5 -right-0.5 flex min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-medium",
                aviso.tipo === "proposta"
                  ? "bg-destructive text-destructive-foreground"
                  : "bg-primary-fill text-primary-fill-foreground",
              )}
            >
              {aviso.quantas > 0 ? aviso.quantas : "•"}
            </span>
          )}
        </button>
      )}

      {montado && (
        // `contents`: este <div> só carrega as variáveis do indicador; como filho da barra, sem
        // isto viraria um item vazio da linha flex e somaria um `gap`.
        <div className={canto === "esquerda" ? "contents [--assistente-esquerda:1rem] [--assistente-direita:auto]" : "contents [--assistente-esquerda:auto] [--assistente-direita:1rem]"}>
        <Painel
          aberto={estado.aberto}
          onOpenChange={(v) => despachar({ tipo: v ? "abriu" : "fechou" })}
          canto={canto}
          oculto={oculto}
          onPreferencia={(p) => {
            setPreferencias((atual) => ({ ...atual, atual: p }));
          }}
          onAtividade={despachar}
        />
        </div>
      )}
    </>
  );
}
