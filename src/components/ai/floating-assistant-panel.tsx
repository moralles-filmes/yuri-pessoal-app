"use client";

/**
 * Fase 18-F · Bloco 2 — IA · O painel do botão flutuante.
 *
 * ⛔ ESTE ARQUIVO É O ALVO DO `next/dynamic`, e é por isso que ele pode ser pesado. Ele
 * arrasta `ChatClient` (streaming, cartões de proposta, chips de fonte) e o `Sheet`; nada
 * disso entra no primeiro byte de rota nenhuma, porque só é baixado no primeiro clique do
 * botão. Quem tem de continuar leve é `floating-assistant.tsx`, do outro lado do `dynamic`.
 *
 * O chat aqui é o MESMO da página `/ia`: mesma `ChatClient`, mesmo `/api/ia/chat`, mesmas
 * chaves, mesmo Approval Engine. Uma segunda implementação de chat divergiria no primeiro
 * campo novo — e "nenhuma regra é reescrita" é regra do projeto, não gentileza.
 */

import * as React from "react";
import Link from "next/link";
import { EyeOff, Loader2, MoveHorizontal, SquareArrowOutUpRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ChatView, useConversaDaIa } from "@/components/ai/chat-client";
import { definirBotaoFlutuante, estadoDoPainelDaIa } from "@/lib/actions/ai-panel";
import { AI_LINK_BASE } from "@/lib/search/ai-links";
import {
  ATALHO_DO_PAINEL,
  ROTULO_DO_CANTO,
  type CantoDoBotao,
  type EventoDoPainel,
} from "@/lib/ai/painel";
import { RESUMO_DO_ASSISTENTE } from "@/lib/ai/constants";
import type { ProntidaoDoChat } from "@/lib/ai/server/chat-readiness";

/**
 * `Sheet` lateral no desktop, gaveta de baixo no celular — e o lado é uma PROP do Radix, não
 * uma classe, então não dá para resolver só com CSS.
 *
 * `useSyncExternalStore` e não `useState` + `useEffect`: este painel só existe depois de um
 * clique (`next/dynamic` com `ssr: false`), então o valor certo está disponível já no primeiro
 * render do cliente — com efeito, haveria um quadro com a gaveta do lado errado.
 */
const CONSULTA_DESKTOP = "(min-width: 640px)";

function assinarLargura(aoMudar: () => void): () => void {
  const mq = window.matchMedia(CONSULTA_DESKTOP);
  mq.addEventListener("change", aoMudar);
  return () => mq.removeEventListener("change", aoMudar);
}

function ehDesktop(): boolean {
  return window.matchMedia(CONSULTA_DESKTOP).matches;
}

function useDesktop(): boolean {
  // O terceiro argumento nunca roda (o componente não é renderizado no servidor), mas o React
  // o exige; `true` é o valor que não faria o celular piscar caso um dia ele rode.
  return React.useSyncExternalStore(assinarLargura, ehDesktop, () => true);
}

export function FloatingAssistantPanel({
  aberto,
  onOpenChange,
  canto,
  oculto,
  onPreferencia,
  onAtividade,
}: {
  readonly aberto: boolean;
  readonly onOpenChange: (valor: boolean) => void;
  readonly canto: CantoDoBotao;
  readonly oculto: boolean;
  readonly onPreferencia: (p: { canto: CantoDoBotao; oculto: boolean }) => void;
  readonly onAtividade: (evento: EventoDoPainel) => void;
}) {
  const desktop = useDesktop();
  const [prontidao, setProntidao] = React.useState<ProntidaoDoChat | null>(null);
  const [salvando, setSalvando] = React.useState(false);

  /*
    ╔══════════════════════════════════════════════════════════════════════════════════════╗
    ║ ⛔ O MOTOR DA CONVERSA NASCE AQUI, ACIMA DO `<Sheet>` — E ISSO NÃO É ESTILO.           ║
    ║                                                                                       ║
    ║ O `SheetContent` do Radix é embrulhado em `<Presence present={forceMount ||           ║
    ║ context.open}>`: fechar a gaveta DESMONTA tudo que está dentro dela. Enquanto o        ║
    ║ `ChatClient` morava ali, fechar o painel apagava a pergunta, perdia o                 ║
    ║ `conversationId` e — o pior — disparava o cleanup do `AbortController`, cancelando a   ║
    ║ resposta em andamento. O dono relatou isso em 2026-09-20.                              ║
    ║                                                                                       ║
    ║ `useLazyDialog` (no botão) mantém montado ESTE componente, não os filhos da gaveta.    ║
    ║ Como este componente sobrevive ao fechamento E à navegação (a casca de `(app)` não     ║
    ║ desmonta entre rotas), o estado que mora aqui é o que faz o critério de aceite 6 ser   ║
    ║ verdadeiro: perguntar, fechar, navegar, e a resposta continuar chegando.               ║
    ║                                                                                       ║
    ║ Guardado por `src/lib/ai/painel-persistencia.test.ts`.                                 ║
    ╚══════════════════════════════════════════════════════════════════════════════════════╝
  */
  const conversa = useConversaDaIa({
    conversationId: null,
    initialMessages: [],
    runs: {},
    podeConversar: prontidao?.podeConversar ?? false,
    onAtividade,
  });

  // A prontidão é buscada UMA vez, na montagem — e a montagem só acontece na primeira
  // abertura, porque quem monta este componente é o `useLazyDialog` do botão.
  React.useEffect(() => {
    let vivo = true;
    estadoDoPainelDaIa()
      .then((r) => {
        if (vivo) setProntidao(r);
      })
      .catch(() =>
        vivo
          ? setProntidao({
              podeConversar: false,
              motivoBloqueio: "Não foi possível falar com o servidor agora.",
            })
          : undefined,
      );
    return () => {
      vivo = false;
    };
  }, []);

  async function salvarPreferencia(proximo: { canto: CantoDoBotao; oculto: boolean }) {
    setSalvando(true);
    // Otimista: o botão se move na hora. Quem acabou de pedir a mudança é quem tem de vê-la.
    onPreferencia(proximo);
    const r = await definirBotaoFlutuante({
      floatingCorner: proximo.canto,
      floatingHidden: proximo.oculto,
    });
    setSalvando(false);
    if (!r.ok) {
      // Desfaz a aposta e diz o que aconteceu — preferência que "salvou" e voltou sozinha no
      // próximo carregamento é pior que preferência que recusou na cara.
      onPreferencia({ canto, oculto });
      toast.error(r.error);
      return;
    }
    if (proximo.oculto) {
      toast.success(`Botão oculto. O atalho ${ATALHO_DO_PAINEL} continua abrindo o painel.`);
      onOpenChange(false);
    }
  }

  const outroCanto: CantoDoBotao = canto === "direita" ? "esquerda" : "direita";

  return (
    <Sheet open={aberto} onOpenChange={onOpenChange}>
      <SheetContent
        side={desktop ? "right" : "bottom"}
        /*
          ⚠️ `data-[side=right]:sm:max-w-lg` com o prefixo REPETIDO, e não `sm:max-w-lg`: a
          primitiva traz `data-[side=right]:sm:max-w-sm`, e o `twMerge` só substitui classe do
          MESMO conjunto de modificadores. Sem o prefixo, as duas sobrevivem e quem decide é a
          ordem do CSS gerado — que o minificador reescreve.
        */
        className="flex w-full flex-col gap-0 p-0 data-[side=bottom]:h-[85svh] data-[side=right]:sm:max-w-lg"
      >
        {/* `pr-12`: o botão de fechar da primitiva fica em `absolute top-3 right-3`. */}
        <SheetHeader className="shrink-0 border-b pr-12">
          <SheetTitle>Assistente</SheetTitle>
          {/*
            A trava de honestidade neste caminho — é a versão curta da mesma regra, e é ela
            que justifica o `compacto` do `ChatClient` abaixo esconder o texto longo.
          */}
          <SheetDescription>{RESUMO_DO_ASSISTENTE}</SheetDescription>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={AI_LINK_BASE} onClick={() => onOpenChange(false)}>
                <SquareArrowOutUpRight className="size-4" /> Abrir em tela cheia
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={salvando}
              onClick={() => void salvarPreferencia({ canto: outroCanto, oculto })}
            >
              <MoveHorizontal className="size-4" /> {ROTULO_DO_CANTO[outroCanto]}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={salvando}
              onClick={() => void salvarPreferencia({ canto, oculto: true })}
            >
              <EyeOff className="size-4" /> Ocultar o botão
            </Button>
          </div>
        </SheetHeader>

        {/*
          `min-h-0 flex-1` — a mesma linha que `mobile-nav.tsx` carrega, pelo mesmo motivo:
          dentro do `flex-col` do SheetContent, sem ela o conteúdo estoura a gaveta sem rolar.
        */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {prontidao === null ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Preparando o assistente…
            </div>
          ) : (
            <ChatView
              conversa={conversa}
              runs={{}}
              podeConversar={prontidao.podeConversar}
              motivoBloqueio={prontidao.motivoBloqueio}
              compacto
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
