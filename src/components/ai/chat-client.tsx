"use client";

/**
 * Fase 18-A — IA · O chat.
 *
 * ═══════════════════════ O QUE ESTA TELA GARANTE ═══════════════════════
 *
 *  • CANCELAR de verdade: `AbortController` → `request.signal` no servidor → o provedor
 *    para. Não é só "some da tela e continua cobrando".
 *  • O texto parcial NÃO é perdido: ele já está no banco (o servidor grava periodicamente),
 *    e a política aparece escrita na própria tela.
 *  • QUEM RESPONDEU aparece. Se houve fallback, o usuário vê para onde foi.
 *  • Erro chega em pt-BR, já sanitizado no servidor.
 *
 * Recarregar a página no meio do streaming não perde a conversa: a mensagem do assistente
 * existe desde a admissão, e o Server Component relê tudo.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Send, Sparkles, Square } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { AI_PROVIDER_LABEL, type AiProviderId } from "@/lib/ai/core/contracts";
import { MAX_CHAT_TEXT } from "@/lib/ai/constants";
/**
 * ⚠️ `experiences/atalhos` e NUNCA `experiences/catalog`: aquele arquivo não tem um único
 * import (é a regra 3 do carregamento sob demanda), enquanto o catálogo carrega os prompts de
 * redação inteiros e importa o Tool Registry — que o cliente baixaria por causa de três
 * strings. Um teste amarra as duas listas, então elas não divergem.
 */
import { ATALHOS_DE_EXPERIENCIA } from "@/lib/ai/experiences/atalhos";
import type { EventoDoPainel } from "@/lib/ai/painel";
import type { ToolCallStatus } from "@/lib/ai/tools/contracts";
import { execucaoEmAndamento, type RunSources } from "@/lib/ai/tools/sources";
import {
  SourceChips,
  SourceChipsAoVivo,
  type FerramentaAoVivo,
} from "@/components/ai/source-chips";
import type { PropostaNaTela } from "@/components/ai/proposal-card";
import { ProposalCardSobDemanda } from "@/components/ai/proposal-card-sob-demanda";
import { FraseDeGasto } from "@/components/ai/frase-de-gasto";
import { DESFECHO_INICIAL, type DesfechoDoCartao } from "@/lib/ai/cartao";
import { faseDoEvento } from "@/lib/ai/fase-do-chat";
import {
  aoTrocarDeTentativa,
  aoAtualizarEspecialista,
  linhaDeEspecialistas,
  textoParaDevolver,
  deveEnviarComEnter,
  type PropostaComTrilha,
  type EspecialistaNaTela,
} from "@/lib/ai/resposta-em-andamento";
import { RespostaFormatada } from "@/components/ai/resposta-formatada";
import { settingsLink } from "@/lib/search/ai-links";
import type { ConversationMessage, MessageRunInfo } from "@/lib/ai/types";

type Evento =
  | {
      type: "start";
      conversationId: string;
      runId: string;
      assistantMessageId: string;
      provider: AiProviderId;
      model: string;
      correlationId: string;
    }
  | { type: "delta"; text: string }
  /** A trilha identifica quais cartões pertencem à tentativa que recomeçou. */
  | { type: "switch"; provider: AiProviderId; model: string; motivo: string; trilha: number }
  /**
   * Um especialista foi acionado, respondeu ou falhou; a lista conserva a ordem de chegada.
   */
  | {
      type: "especialista";
      agentId: string;
      rotulo: string;
      trilha: number;
      status: "consultando" | "pronto" | "falhou";
    }
  /**
   * Uma consulta aconteceu (ou foi recusada) DENTRO desta resposta. O runner emite este
   * evento desde a Task 10; até aqui a tela o descartava em silêncio — leitura de dado do
   * usuário passando despercebida é exatamente o oposto do que a subfase promete.
   */
  | { type: "tool"; toolName: string; status: ToolCallStatus; registros: number }
  /**
   * 18-C — uma ALTERAÇÃO foi preparada e aguarda a decisão do dono. Nada foi escrito.
   *
   * É o único evento que traz o `effect_hash`, e ele não passa pelo modelo em momento nenhum:
   * o hash é a prova de que a confirmação vale para a previsão que está desenhada na tela.
   */
  | { type: "proposta"; proposta: PropostaNaTela; trilha: number }
  | { type: "done"; finishReason: string; provider: AiProviderId; model: string }
  | { type: "error"; code: string; message: string; retryAfterSeconds?: number };

type Bolha = {
  id: string;
  role: "user" | "assistant";
  content: string;
  status: "complete" | "streaming" | "cancelled" | "failed";
  provider?: AiProviderId | null;
  model?: string | null;
  erro?: string | null;
  /** A execução que produziu esta bolha — a chave da trilha durável de `ai_tool_calls`. */
  runId?: string | null;
  /**
   * As consultas vistas AO VIVO, do evento SSE `tool`. Some no recarregamento, e é isso
   * mesmo: quem sobrevive é `ai_tool_calls`, lido pelo servidor. Aqui é só o que a tela
   * presenciou nesta sessão.
   */
  ferramentas?: FerramentaAoVivo[];
  /**
   * As alterações que ESTA resposta preparou e que aguardam decisão (18-C).
   *
   * ⚠️ LIMITE DECLARADO: elas vivem só nesta sessão de tela, como os chips ao vivo. O que
   * sobrevive ao recarregamento é a linha em `ai_action_proposals` — e desde o Bloco 5 há
   * onde lê-la: a tela `/ia/acoes`, que mostra a proposta ainda pendente com os mesmos botões de
   * confirmar e recusar. Recarregar aqui esconde o cartão; a proposta continua lá, válida
   * pelos 10 minutos dela, e nada foi aplicado. O cartão sumir NÃO executa e NÃO cancela.
   */
  propostas?: readonly (PropostaNaTela & PropostaComTrilha)[];
  especialistas?: readonly EspecialistaNaTela[];
};

export type ChatClientProps = {
  readonly conversationId: string | null;
  readonly initialMessages: readonly ConversationMessage[];
  readonly runs: Readonly<Record<string, MessageRunInfo>>;
  /**
   * A trilha durável, indexada por `runId` (`getRunSources`). Vazia na página de conversa
   * nova — ali ainda não há execução gravada, e o que a tela mostra é o que ela presenciou.
   */
  readonly sources?: Readonly<Record<string, RunSources>>;
  /** Quando falso, o formulário fica desabilitado com a explicação na tela. */
  readonly podeConversar: boolean;
  readonly podeCruzarModulos: boolean;
  readonly motivoBloqueio: string | null;
  /**
   * 18-F Bloco 2 — o que ESTA conversa fez, para quem a hospeda.
   *
   * ⛔ É uma SAÍDA, nunca uma entrada: o chat continua dono do próprio estado, e quem escuta
   * não tem como mudá-lo. A página `/ia` não passa nada e nada muda para ela; quem escuta é o
   * botão flutuante, que precisa saber se uma resposta chegou enquanto estava fechado.
   *
   * ⚠️ O QUE SAI DAQUI NÃO É DADO DO DONO. Nem texto de resposta, nem número, nem nome de
   * registro — só "respondeu", "propôs (id + prazo)" e "o laço recomeçou". O selo do botão
   * mostra contagem e verbo, e é tudo que ele tem para mostrar.
   */
  readonly onAtividade?: (evento: EventoDoPainel) => void;
  /** O painel hospeda a vista compacta e oferece as ações no próprio cabeçalho. */
  readonly compacto?: boolean;
  /**
   * REDESIGN-07-D · V — o vazio da conversa, DESENHADO POR QUEM HOSPEDA (`VazioDaConversa`):
   * as páginas o montam no servidor e o painel no chunk sob demanda, para o `EmptyState` não
   * entrar no primeiro carregamento de `/ia`. Sem ele, nada ocupa o lugar da conversa vazia.
   */
  readonly vazio?: React.ReactNode;
};

/**
 * O que o MOTOR da conversa entrega a quem a desenha.
 *
 * ⛔ Ele existe porque o estado da conversa NÃO PODE NASCER DENTRO DA GAVETA do painel
 * flutuante (18-F Bloco 2). O `SheetContent` do Radix é embrulhado em
 * `<Presence present={forceMount || context.open}>`: sem `forceMount`, fechar desmonta tudo
 * que está dentro — e com isso ia embora a pergunta, o `conversationId` e, pior, o
 * `AbortController`, que cancelava a resposta em andamento. `useLazyDialog` não resolve isso:
 * ele mantém montado o componente do painel, não os filhos da gaveta.
 *
 * `forceMount` não serve de saída: `RemoveScroll`, `hideOthers` e `FocusScope` moram no mesmo
 * `Presence`, e o app inteiro ficaria com rolagem travada e `aria-hidden` permanentes.
 *
 * Então o motor sobe e a vista desce — que é o que o React manda fazer com estado que precisa
 * viver mais que uma subárvore. `/ia` não sente: `ChatClient` continua juntando os dois.
 */
export type ConversaDaIa = {
  readonly bolhas: readonly Bolha[];
  readonly texto: string;
  readonly setTexto: (valor: string) => void;
  readonly enviando: boolean;
  readonly enviar: () => Promise<void>;
  /** 18-F Bloco 4 — dispara um panorama pelo MESMO endpoint e pelo mesmo leitor de SSE. */
  readonly iniciarExperiencia: (id: string) => Promise<void>;
  readonly cancelar: () => void;
  /**
   * REDESIGN-07-D · D1 — o desfecho de cada cartão de proposta, por id.
   *
   * ⛔ Mora AQUI, e não no cartão, pela mesma razão das bolhas: o cartão vive dentro da gaveta
   * do painel, e fechar a gaveta o desmonta (invariante 95). Com o desfecho lá dentro, reabrir
   * o painel mostrava "aguardando você" de novo — e confirmar outra vez dava "já foi decidida".
   * Os ids são os de `ai_action_proposals`: uma proposta nova (inclusive a que nasce depois de
   * um `switch`) nunca herda o desfecho de outra.
   */
  readonly desfechos: Readonly<Record<string, DesfechoDoCartao>>;
  readonly registrarDesfecho: (proposalId: string, desfecho: DesfechoDoCartao) => void;
  /** O cartão terminou: o selo do botão flutuante deixa de contar esta proposta. */
  readonly avisarDecisao: (proposalId: string) => void;
  /**
   * REDESIGN-07-D · D3 — a FASE da resposta (`faseDoEvento`), para a região `role="status"`.
   * Muda por evento, nunca por delta: é o que o leitor de tela anuncia no lugar do streaming.
   */
  readonly fase: string | null;
  /** A conversa aberta (nasce no evento `start`) — o painel a usa para "abrir em tela cheia". */
  readonly conversaId: string | null;
};

export function useConversaDaIa({
  conversationId,
  initialMessages,
  runs,
  podeConversar,
  podeCruzarModulos,
  onAtividade,
}: Pick<
  ChatClientProps,
  "conversationId" | "initialMessages" | "runs" | "podeConversar" | "podeCruzarModulos" | "onAtividade"
>): ConversaDaIa {
  const router = useRouter();

  const [bolhas, setBolhas] = React.useState<Bolha[]>(() =>
    initialMessages
      .filter((m) => m.role !== "system")
      .map((m) => {
        const run = m.runId ? runs[m.runId] : undefined;
        return {
          id: m.id,
          role: m.role as "user" | "assistant",
          content: m.content,
          status: m.status,
          provider: run?.provider ?? null,
          model: run?.model ?? null,
          erro: run?.errorMessage ?? null,
          runId: m.runId,
        };
      }),
  );

  const [texto, setTexto] = React.useState("");
  const [enviando, setEnviando] = React.useState(false);
  const [conversa, setConversa] = React.useState<string | null>(conversationId);
  const [desfechos, setDesfechos] = React.useState<Record<string, DesfechoDoCartao>>({});
  const [fase, setFase] = React.useState<string | null>(null);
  /** Cartões desta resposta, com a trilha que decide quais caem em cada repetição. */
  const propostasDaRespostaRef = React.useRef<PropostaComTrilha[]>([]);
  const abortRef = React.useRef<AbortController | null>(null);
  const contadorRef = React.useRef(0);

  /*
    Cancela ao desmontar. Sem isso, sair da página deixaria o run rodando e a reserva presa
    até a lease vencer.

    ⛔ E quem desmonta AQUI é a página `/ia` ou a casca do app — nunca o fechar da gaveta. É
    exatamente por isso que este efeito pertence ao motor: enquanto ele morava junto da vista,
    fechar o painel cancelava a resposta que o dono tinha acabado de pedir.
  */
  React.useEffect(() => () => abortRef.current?.abort(), []);

  function cancelar() {
    abortRef.current?.abort();
  }

  /**
   * O caminho ÚNICO do envio: bolhas provisórias, POST, leitor de SSE, `switch` de eventos,
   * `AbortController` e `router.refresh`.
   *
   * ⚠️ 18-F Bloco 4 — `enviar` e `iniciarExperiencia` diferem em DUAS coisas: o corpo do POST
   * e o texto da bolha do dono. Tudo o mais é idêntico, e uma segunda cópia deste bloco
   * divergiria no primeiro evento SSE novo — que é exatamente o que `chat-events.test.ts`
   * existe para impedir do outro lado.
   */
  async function disparar(
    corpo: Record<string, unknown>,
    textoDaBolha: string,
  ) {
    // Contador, e não `Date.now()`: relógio é função impura e o React exige pureza no
    // render (`react-hooks/purity`). Um contador em `ref` é estável e serve igual — estes
    // ids são provisórios e vivem só até o evento `start` trazer os reais do servidor.
    const seq = (contadorRef.current += 1);
    const idProvisorioUsuario = `local-user-${seq}`;
    const idProvisorioAssistente = `local-assistant-${seq}`;

    setBolhas((atual) => [
      ...atual,
      { id: idProvisorioUsuario, role: "user", content: textoDaBolha, status: "complete" },
      {
        id: idProvisorioAssistente,
        role: "assistant",
        content: "",
        status: "streaming",
      },
    ]);
    setEnviando(true);
    // Limpa a região antes da resposta nova: a mesma frase de antes ("Resposta concluída")
    // não seria anunciada de novo se o conteúdo não mudasse.
    setFase(null);
    propostasDaRespostaRef.current = [];

    let iniciou = false;
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const resposta = await fetch("/api/ia/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
        signal: controller.signal,
      });

      // Erro ANTES do streaming volta como JSON com status HTTP — é o caminho que permite
      // a tela distinguir 402 (orçamento) de 429 (limite) de 503 (cripto).
      const contentType = resposta.headers.get("content-type") ?? "";
      if (!contentType.includes("text/event-stream")) {
        const corpo = (await resposta.json().catch(() => null)) as
          | { error?: string; code?: string }
          | null;
        const mensagem = corpo?.error ?? "Não foi possível iniciar a resposta.";
        marcarFalha(idProvisorioAssistente, mensagem);
        setFase(faseDoEvento({ tipo: "error", mensagem }));
        toast.error(mensagem);
        return;
      }

      await consumirSse(resposta, {
        onStart: (e) => {
          iniciou = true;
          setConversa(e.conversationId);
          setFase(faseDoEvento({ tipo: "start" }));
          setBolhas((atual) =>
            atual.map((b) =>
              b.id === idProvisorioAssistente
                ? {
                    ...b,
                    id: e.assistantMessageId,
                    provider: e.provider,
                    model: e.model,
                    runId: e.runId,
                  }
                : b.id === idProvisorioUsuario
                  ? { ...b, id: `${e.runId}-user` }
                  : b,
            ),
          );
        },
        onDelta: (t) =>
          setBolhas((atual) =>
            atual.map((b, i) =>
              i === atual.length - 1 ? { ...b, content: b.content + t } : b,
            ),
          ),
        onSwitch: (e) => {
          setFase(faseDoEvento({ tipo: "switch", motivo: e.motivo }));
          const restantes = aoTrocarDeTentativa(propostasDaRespostaRef.current, e.trilha);
          const zeradas = propostasDaRespostaRef.current.filter(
            (proposta) => !restantes.some((p) => p.id === proposta.id),
          );
          propostasDaRespostaRef.current = [...restantes];
          // O painel recebe só a retirada dos ids: recomecou apagaria também outras trilhas.
          for (const { id } of zeradas) onAtividade?.({ tipo: "decidiu", id });
          if (zeradas.length > 0) {
            setDesfechos((atual) => {
              const resto = { ...atual };
              for (const { id } of zeradas) delete resto[id];
              return resto;
            });
          }
          setBolhas((atual) =>
            atual.map((b, i) =>
              i === atual.length - 1
                ? {
                    ...b,
                    provider: e.provider,
                    model: e.model,
                    content: "",
                    ferramentas: [],
                    // A proposta órfã continua no banco até vencer; nada é confirmado aqui.
                    propostas: aoTrocarDeTentativa(b.propostas ?? [], e.trilha),
                  }
                : b,
            ),
          );
        },
        onTool: (e) => {
          setFase(faseDoEvento({ tipo: "tool", toolName: e.toolName }));
          setBolhas((atual) =>
            atual.map((b, i) =>
              i === atual.length - 1
                ? {
                    ...b,
                    ferramentas: [
                      ...(b.ferramentas ?? []),
                      {
                        toolName: e.toolName,
                        status: e.status,
                        registros: e.registros,
                      },
                    ],
                  }
                : b,
            ),
          );
        },
        onProposta: (e) => {
          const proposta = { ...e.proposta, trilha: e.trilha };
          propostasDaRespostaRef.current.push(proposta);
          setFase(faseDoEvento({ tipo: "proposta" }));
          onAtividade?.({
            tipo: "propos",
            id: e.proposta.id,
            expiraEm: e.proposta.expiresAt,
          });
          setBolhas((atual) =>
            atual.map((b, i) =>
              i === atual.length - 1
                ? { ...b, propostas: [...(b.propostas ?? []), proposta] }
                : b,
            ),
          );
        },
        onEspecialista: (e) => {
          setBolhas((atual) =>
            atual.map((b, i) => i === atual.length - 1
              ? { ...b, especialistas: aoAtualizarEspecialista(b.especialistas ?? [], e) }
              : b),
          );
          if (e.status === "consultando") {
            setFase(faseDoEvento({ tipo: "especialista", rotulo: e.rotulo }));
          }
        },
        onDone: (e) => {
          onAtividade?.({ tipo: "respondeu" });
          setFase(faseDoEvento({ tipo: "done" }));
          setBolhas((atual) =>
            atual.map((b, i) =>
              i === atual.length - 1
                ? { ...b, status: "complete", provider: e.provider, model: e.model }
                : b,
            ),
          );
        },
        onError: (e) => {
          marcarFalha(idProvisorioAssistente, e.message);
          setFase(faseDoEvento({ tipo: "error", mensagem: e.message }));
          toast.error(e.message);
        },
      });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        setBolhas((atual) =>
          atual.map((b, i) =>
            i === atual.length - 1 ? { ...b, status: "cancelled" } : b,
          ),
        );
        setFase(faseDoEvento({ tipo: "cancelada" }));
      } else {
        const mensagem = "A conexão caiu durante a resposta.";
        marcarFalha(idProvisorioAssistente, mensagem);
        setFase(faseDoEvento({ tipo: "error", mensagem }));
      }
    } finally {
      if (!iniciou && typeof corpo.text === "string") {
        setTexto((atual) => textoParaDevolver(textoDaBolha, atual));
      }
      setEnviando(false);
      abortRef.current = null;
      // Reler do servidor: é ele que tem o texto final, o custo e o estado verdadeiro.
      router.refresh();
    }
  }

  async function enviar() {
    const conteudo = texto.trim();
    if (!conteudo || enviando || !podeConversar) return;
    setTexto("");
    await disparar(
      {
        ...(conversa ? { conversationId: conversa } : {}),
        text: conteudo,
      },
      conteudo,
    );
  }

  /**
   * 18-F Bloco 4 — dispara um PANORAMA. É o MESMO caminho de `enviar`: mesmo endpoint, mesmo
   * leitor de SSE, mesmo `switch` de eventos, mesmo `AbortController`, mesmo `router.refresh`.
   * O que muda é o corpo do POST — e o fato de o texto da bolha do dono vir do ATALHO, não
   * do campo de digitar.
   *
   * ⛔ Ela NUNCA manda `conversationId`, e nem teria como: o schema do panorama não tem esse
   * campo. O painel sempre abre conversa nova, que é o que o dono espera de um botão chamado
   * "Planejar meu dia" — e o evento `start` troca `conversa` para a nova.
   */
  async function iniciarExperiencia(id: string) {
    if (enviando || !podeConversar || !podeCruzarModulos) return;
    const atalho = ATALHOS_DE_EXPERIENCIA.find((a) => a.id === id);
    if (!atalho) return;
    await disparar({ experiencia: id }, atalho.titulo);
  }

  function registrarDesfecho(proposalId: string, desfecho: DesfechoDoCartao) {
    setDesfechos((atual) => ({ ...atual, [proposalId]: desfecho }));
  }

  function avisarDecisao(proposalId: string) {
    onAtividade?.({ tipo: "decidiu", id: proposalId });
  }

  function marcarFalha(idFallback: string, mensagem: string) {
    setBolhas((atual) =>
      atual.map((b, i) =>
        i === atual.length - 1 || b.id === idFallback
          ? { ...b, status: "failed", erro: mensagem }
          : b,
      ),
    );
  }

  return {
    bolhas,
    texto,
    setTexto,
    enviando,
    enviar,
    iniciarExperiencia,
    cancelar,
    desfechos,
    registrarDesfecho,
    avisarDecisao,
    fase,
    conversaId: conversa,
  };
}

/**
 * A VISTA da conversa. Ela não tem estado de conversa nenhum — recebe o motor pronto.
 *
 * O `fimRef` e a rolagem ficam aqui, e não no motor, porque a referência aponta para um nó
 * que só existe enquanto a vista está na tela. Efeito colateral bom: reabrir o painel rola
 * para a última mensagem, porque o efeito roda de novo na montagem.
 */
export function ChatView({
  conversa,
  runs,
  sources = {},
  podeConversar,
  podeCruzarModulos,
  motivoBloqueio,
  vazio,
}: Omit<ChatClientProps, "conversationId" | "initialMessages" | "onAtividade"> & {
  readonly conversa: ConversaDaIa;
}) {
  const {
    bolhas,
    texto,
    setTexto,
    enviando,
    enviar,
    iniciarExperiencia,
    cancelar,
    desfechos,
    registrarDesfecho,
    avisarDecisao,
    fase,
  } = conversa;
  const fimRef = React.useRef<HTMLDivElement | null>(null);
  const campoRef = React.useRef<HTMLTextAreaElement | null>(null);
  /*
    A vista aparece em `/ia` e no painel flutuante: id escrito à mão colidiria entre os dois —
    e pela regra do DOM o `<label for>` do painel ativava o PRIMEIRO elemento com o id, que era
    o controle da página por baixo da gaveta (G-h).
  */
  const idBase = React.useId();
  const idDoGasto = `${idBase}-gasto`;
  const idDoCampo = `${idBase}-campo`;
  const idDoAtalho = `${idBase}-atalho`;

  /*
    D3 — terminada a resposta, o foco volta ao campo para a próxima pergunta, mas SÓ se ele
    estiver solto no `body` (o botão Enviar desabilitado o derruba ali). Quem já foi para outro
    lugar — um cartão de proposta, um link — não é puxado de volta.
  */
  const enviandoAntesRef = React.useRef(enviando);
  React.useEffect(() => {
    const terminou = enviandoAntesRef.current && !enviando;
    enviandoAntesRef.current = enviando;
    if (!terminou) return;
    const ativo = document.activeElement;
    if (ativo === null || ativo === document.body) campoRef.current?.focus();
  }, [enviando]);

  React.useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [bolhas]);

  const restante = MAX_CHAT_TEXT - texto.length;

  return (
    <div className="flex min-h-0 flex-col gap-4">
      {motivoBloqueio && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {motivoBloqueio}
        </div>
      )}

      {/*
        D3 — QUEM ANUNCIA É ESTA REGIÃO, E ELA SÓ DIZ A FASE. A conversa abaixo é `role="log"`
        com `aria-live="off"`: sem isso o papel `log` traz `polite` implícito e o leitor de
        tela leria cada pedaço do streaming.
      */}
      <p role="status" className="sr-only">
        {fase}
      </p>

      <div role="log" aria-live="off" aria-label="Conversa com o assistente" className="space-y-4">
        {bolhas.length === 0 && vazio}

        {bolhas.map((b) => (
          <div
            key={b.id}
            className={cn(
              "flex w-full",
              b.role === "user" ? "justify-end" : "justify-start",
            )}
          >
            <div
              className={cn(
                "min-w-0 max-w-full text-sm",
                b.role === "user"
                  ? "max-w-[90%] rounded-2xl bg-primary/10 px-4 py-3 text-foreground"
                  : "w-full py-2 text-foreground",
                b.status === "failed" && "border-destructive/40",
              )}
            >
              {/* Quem falou, para quem não vê o alinhamento das bolhas. */}
              <span className="sr-only">
                {b.role === "user" ? "Você disse: " : "O assistente respondeu: "}
              </span>
              {b.role === "assistant" && b.especialistas && (
                <p className="mb-2 break-words text-xs text-muted-foreground">
                  {linhaDeEspecialistas(b.especialistas)}
                </p>
              )}
              {b.content ? (
                b.role === "assistant"
                  ? <RespostaFormatada texto={b.content} />
                  : <p className="whitespace-pre-wrap break-words">{b.content}</p>
              ) : b.status === "streaming" ? (
                <span className="inline-flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" /> escrevendo…
                </span>
              ) : null}

              {b.status === "cancelled" && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Cancelada. O trecho recebido até aqui foi guardado.
                </p>
              )}

              {b.status === "failed" && b.erro && (
                <p className="mt-2 text-xs text-destructive">{b.erro}</p>
              )}

              {b.role === "assistant" && (b.provider || b.model) && b.status !== "streaming" && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {b.provider && <Badge variant="outline" className="max-w-full min-w-0 text-[11px] font-normal">
                    <span className="min-w-0 truncate">{AI_PROVIDER_LABEL[b.provider]}</span>
                  </Badge>}
                  {b.model && <Badge variant="outline" className="max-w-full min-w-0 text-[11px] font-normal">
                    <span className="min-w-0 truncate">{b.model}</span>
                  </Badge>}
                </div>
              )}

              {/*
                DE ONDE VEIO A RESPOSTA. A trilha DURÁVEL (`ai_tool_calls`) vence a de sessão:
                ela tem argumentos e `refs`, e sobrevive ao recarregamento. Os chips ao vivo
                cobrem a janela em que a resposta ainda está sendo escrita e nada foi relido
                do servidor — não é redundância, é o mesmo fato com duas fontes de tempo.
              */}
              {b.role === "assistant" &&
                (fontesDaBolha(b, sources) ? (
                  <SourceChips
                    fontes={fontesDaBolha(b, sources)}
                    emAndamento={emAndamentoDaBolha(b, runs)}
                  />
                ) : (
                  <SourceChipsAoVivo
                    ferramentas={b.ferramentas ?? []}
                    emAndamento={b.status === "streaming"}
                  />
                ))}

              {/*
                O QUE AGUARDA A SUA DECISÃO. Fica depois da resposta e dos chips de propósito:
                o dono lê o que o assistente diz, vê de onde veio, e só então decide.
              */}
              {b.role === "assistant" &&
                (b.propostas ?? []).map((p) => (
                  <ProposalCardSobDemanda
                    key={p.id}
                    proposta={p}
                    desfecho={desfechos[p.id] ?? DESFECHO_INICIAL}
                    onDecidiu={avisarDecisao}
                    onDesfecho={(d) => registrarDesfecho(p.id, d)}
                  />
                ))}
            </div>
          </div>
        ))}
        <div ref={fimRef} />
      </div>

      {bolhas.length === 0 && podeConversar && (
        <div className="@container pb-1">
          {!podeCruzarModulos && (
            <p className="mb-2 text-xs text-muted-foreground">
              {"Ligue 'Cruzar módulos' para usar os panoramas. "}<Link className="underline" href={settingsLink()}>Configurações da IA</Link>
            </p>
          )}
          <div className="grid gap-2 @[30rem]:grid-cols-3">
            {ATALHOS_DE_EXPERIENCIA.map((a) => (
              <Button
                key={a.id}
                type="button"
                variant="outline"
                aria-describedby={idDoGasto}
                className="h-auto min-w-0 flex-col items-start gap-0.5 p-3 text-left whitespace-normal"
                disabled={enviando || !podeCruzarModulos}
                onClick={() => void iniciarExperiencia(a.id)}
              >
                <span className="flex min-w-0 items-center gap-1.5 font-medium">
                  <Sparkles className="size-4 shrink-0" />
                  {a.titulo}
                </span>
                <span className="text-xs font-normal text-muted-foreground">{a.descricao}</span>
              </Button>
            ))}
          </div>
        </div>
      )}

      <div className="sticky bottom-0 space-y-2 bg-background pt-3">
        <label htmlFor={idDoCampo} className="sr-only">Mensagem para o assistente</label>
        <div className="flex items-end gap-2 rounded-2xl border bg-card p-2 focus-within:ring-2 focus-within:ring-ring">
          <Textarea
            id={idDoCampo}
            ref={campoRef}
            aria-describedby={`${idDoAtalho} ${idDoGasto}`}
            value={texto}
            onChange={(e) => setTexto(e.target.value.slice(0, MAX_CHAT_TEXT))}
            onKeyDown={(e) => {
              if (deveEnviarComEnter({
                tecla: e.key,
                shift: e.shiftKey,
                compondo: e.nativeEvent.isComposing,
                atalho: e.metaKey || e.ctrlKey,
                toque: window.matchMedia("(pointer: coarse)").matches,
              })) {
                e.preventDefault();
                void enviar();
              }
            }}
            placeholder={!podeConversar ? "Configure um provedor de IA para começar." : "Pergunte qualquer coisa…"}
            rows={2}
            disabled={!podeConversar || enviando}
            className="min-w-0 resize-y border-0 bg-transparent shadow-none focus-visible:ring-0"
          />
          <Button
            type="button"
            size="icon"
            className="shrink-0 rounded-full"
            aria-label={enviando ? "Parar resposta" : "Enviar mensagem"}
            aria-describedby={idDoGasto}
            onClick={() => enviando ? cancelar() : void enviar()}
            disabled={!podeConversar || (!enviando && texto.trim().length === 0)}
          >
            {enviando ? <Square className="size-4" /> : <Send className="size-4" />}
          </Button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span id={idDoAtalho}>Enter envia · Shift+Enter quebra linha. No toque, use o botão para enviar.</span>
          {texto.length > MAX_CHAT_TEXT - 2000 && (
            <span className={cn(restante < 500 && "text-destructive")}>
              {restante.toLocaleString("pt-BR")} caracteres restantes
            </span>
          )}
        </div>
        <FraseDeGasto id={idDoGasto} />
      </div>
    </div>
  );
}

/**
 * A PORTA DE SEMPRE: motor + vista no mesmo componente.
 *
 * É o que `/ia` usa desde a 18-A, e nada mudou para ela — ali o chat é a página inteira, e
 * nada desmonta a subárvore por baixo dele. Quem precisa das duas metades separadas é o painel
 * flutuante, e só ele.
 */
export function ChatClient(props: ChatClientProps) {
  const conversa = useConversaDaIa(props);
  return (
    <ChatView
      conversa={conversa}
      runs={props.runs}
      sources={props.sources}
      podeConversar={props.podeConversar}
      podeCruzarModulos={props.podeCruzarModulos}
      motivoBloqueio={props.motivoBloqueio}
      compacto={props.compacto}
      vazio={props.vazio}
    />
  );
}

/** A trilha gravada desta bolha, quando o servidor já a leu. */
function fontesDaBolha(
  bolha: Bolha,
  sources: Readonly<Record<string, RunSources>>,
): RunSources | undefined {
  return bolha.runId ? sources[bolha.runId] : undefined;
}

/**
 * "Ainda está consultando?" sai do STATUS DO RUN — nunca de um passo `started`.
 *
 * Quando o processo morre (timeout da plataforma, deploy no meio do stream) sobra passo aberto
 * em `ai_run_steps` sob um run já terminal, e `ai_reconcile_abandoned_runs` não toca essa
 * tabela. Uma tela que lesse o passo mostraria "consultando…" para sempre.
 */
function emAndamentoDaBolha(
  bolha: Bolha,
  runs: Readonly<Record<string, MessageRunInfo>>,
): boolean {
  if (bolha.status === "streaming") return true;
  const run = bolha.runId ? runs[bolha.runId] : undefined;
  return run ? execucaoEmAndamento(run.status) : false;
}

/**
 * Consome o SSE. O parser acumula por linha em vez de assumir que cada `read()` traz um
 * evento inteiro — um chunk de rede pode cortar um JSON no meio, e aí `JSON.parse` quebraria
 * a resposta por um motivo que nada tem a ver com a IA.
 */
async function consumirSse(
  resposta: Response,
  handlers: {
    onStart: (e: Extract<Evento, { type: "start" }>) => void;
    onDelta: (texto: string) => void;
    onSwitch: (e: Extract<Evento, { type: "switch" }>) => void;
    onTool: (e: Extract<Evento, { type: "tool" }>) => void;
    onProposta: (e: Extract<Evento, { type: "proposta" }>) => void;
    onEspecialista: (e: Extract<Evento, { type: "especialista" }>) => void;
    onDone: (e: Extract<Evento, { type: "done" }>) => void;
    onError: (e: Extract<Evento, { type: "error" }>) => void;
  },
): Promise<void> {
  const reader = resposta.body?.getReader();
  if (!reader) return;

  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const linhas = buffer.split("\n");
    buffer = linhas.pop() ?? "";

    for (const linha of linhas) {
      if (!linha.startsWith("data: ")) continue;
      const payload = linha.slice(6).trim();
      if (payload === "" || payload === "[DONE]") continue;

      let evento: Evento;
      try {
        evento = JSON.parse(payload) as Evento;
      } catch {
        continue;
      }

      switch (evento.type) {
        case "start":
          handlers.onStart(evento);
          break;
        case "delta":
          handlers.onDelta(evento.text);
          break;
        case "switch":
          handlers.onSwitch(evento);
          break;
        case "tool":
          handlers.onTool(evento);
          break;
        case "proposta":
          handlers.onProposta(evento);
          break;
        case "especialista":
          handlers.onEspecialista(evento);
          break;
        case "done":
          handlers.onDone(evento);
          break;
        case "error":
          handlers.onError(evento);
          break;
      }
    }
  }
}
