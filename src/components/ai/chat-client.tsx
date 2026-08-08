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
import { AlertTriangle, Loader2, Send, Square } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { AI_PROVIDER_LABEL, type AiProviderId } from "@/lib/ai/core/contracts";
import { AVISO_SEM_ACESSO, ROTULO_DA_ROTA_DE_CONTEXTO } from "@/lib/ai/constants";
import {
  MAX_CHAT_TEXT,
  ROTAS_COM_CONTEXTO,
  type RotaComContexto,
} from "@/lib/validators/ai";
import type { ToolCallStatus } from "@/lib/ai/tools/contracts";
import { execucaoEmAndamento, type RunSources } from "@/lib/ai/tools/sources";
import {
  SourceChips,
  SourceChipsAoVivo,
  type FerramentaAoVivo,
} from "@/components/ai/source-chips";
import { ProposalCard, type PropostaNaTela } from "@/components/ai/proposal-card";
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
  | { type: "switch"; provider: AiProviderId; model: string; motivo: string }
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
  | { type: "proposta"; proposta: PropostaNaTela }
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
  propostas?: PropostaNaTela[];
  /**
   * A rota enviada como contexto NESTE envio. É o que a tela sabe: que MANDOU o contexto —
   * quem decide se ele foi usado é o servidor. Por isso o selo diz "enviada com", não "usou".
   *
   * ⚠️ **LIMITE DECLARADO, não disfarçado:** o contexto de página NÃO é persistido em lugar
   * nenhum — nem `ai_runs` nem `ai_conversations` têm coluna para ele, e a 18-B não abre
   * migration nova. A rastreabilidade durável desta subfase é a de FERRAMENTAS
   * (`ai_tool_calls` → `SourceChips`), e ela não cobre este selo: recarregar a página o
   * apaga. Persistir o contexto exige coluna, e coluna exige decisão de esquema.
   */
  contexto?: RotaComContexto | null;
};

/** Valor do item "sem contexto" do Select — `Select` do Radix não aceita valor vazio. */
const SEM_CONTEXTO = "nenhum";

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
  readonly motivoBloqueio: string | null;
};

export function ChatClient({
  conversationId,
  initialMessages,
  runs,
  sources = {},
  podeConversar,
  motivoBloqueio,
}: ChatClientProps) {
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
  /**
   * Contexto da página — **desligado por padrão**, como toda integração deste projeto.
   * Estado LOCAL do componente, não da URL: a regra de não controlar campo pela URL vale
   * para digitação, e esta é uma escolha por clique — mas a página é `force-dynamic`, e
   * gravar na URL faria um round-trip de RSC por clique sem nenhum ganho de link.
   */
  const [contexto, setContexto] = React.useState<RotaComContexto | null>(null);
  const [conversa, setConversa] = React.useState<string | null>(conversationId);
  const abortRef = React.useRef<AbortController | null>(null);
  const fimRef = React.useRef<HTMLDivElement | null>(null);
  const contadorRef = React.useRef(0);

  React.useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [bolhas]);

  // Cancela ao desmontar. Sem isso, sair da página deixaria o run rodando e a reserva presa
  // até a lease vencer.
  React.useEffect(() => () => abortRef.current?.abort(), []);

  function cancelar() {
    abortRef.current?.abort();
  }

  async function enviar() {
    const conteudo = texto.trim();
    if (!conteudo || enviando || !podeConversar) return;

    // Contador, e não `Date.now()`: relógio é função impura e o React exige pureza no
    // render (`react-hooks/purity`). Um contador em `ref` é estável e serve igual — estes
    // ids são provisórios e vivem só até o evento `start` trazer os reais do servidor.
    const seq = (contadorRef.current += 1);
    const idProvisorioUsuario = `local-user-${seq}`;
    const idProvisorioAssistente = `local-assistant-${seq}`;

    setBolhas((atual) => [
      ...atual,
      { id: idProvisorioUsuario, role: "user", content: conteudo, status: "complete" },
      {
        id: idProvisorioAssistente,
        role: "assistant",
        content: "",
        status: "streaming",
        contexto,
      },
    ]);
    setTexto("");
    setEnviando(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const resposta = await fetch("/api/ia/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(conversa ? { conversationId: conversa } : {}),
          text: conteudo,
          // Só a ROTA, e só quando o usuário escolheu uma. Nada do conteúdo da tela sai
          // daqui — título, estado e registro ficam onde estão. O módulo é do servidor.
          ...(contexto ? { pageContext: { rota: contexto } } : {}),
        }),
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
        toast.error(mensagem);
        return;
      }

      await consumirSse(resposta, {
        onStart: (e) => {
          setConversa(e.conversationId);
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
        /**
         * ╔════════════════════════════════════════════════════════════════════════════════╗
         * ║ TENTATIVA NOVA COMEÇA COM A BOLHA LIMPA — e o servidor zera o texto no MESMO    ║
         * ║ instante (`chat-runner.ts`, junto do `yield` deste evento).                     ║
         * ║                                                                                 ║
         * ║ Até aqui `onDelta` concatenava tudo na mesma bolha e este handler só trocava o  ║
         * ║ selo: a narração da tentativa que FALHOU ficava colada na da seguinte, e a      ║
         * ║ resposta gravada era essa mistura. Corrigir só o servidor seria pior — o        ║
         * ║ `router.refresh()` do fim do envio releria o texto novo e apagaria da tela algo ║
         * ║ que o usuário já tinha lido. Os dois lados, ou nenhum.                           ║
         * ║                                                                                 ║
         * ║ As consultas caem junto: o laço recomeça no passo 0 a cada tentativa, então as  ║
         * ║ ferramentas rodam de novo e os chips da tentativa anterior virariam duplicata.  ║
         * ╚════════════════════════════════════════════════════════════════════════════════╝
         */
        onSwitch: (e) =>
          setBolhas((atual) =>
            atual.map((b, i) =>
              i === atual.length - 1
                ? {
                    ...b,
                    provider: e.provider,
                    model: e.model,
                    content: "",
                    ferramentas: [],
                    /**
                     * ⛔ AS PROPOSTAS CAEM JUNTO, E ESTA É A LINHA MAIS IMPORTANTE DO BLOCO.
                     *
                     * O laço recomeça do passo 0 a cada tentativa: a ferramenta de escrita
                     * roda de novo e grava uma SEGUNDA linha em `ai_action_proposals`, com
                     * outro id e outro hash. Mantendo o cartão anterior, o dono veria dois
                     * cartões propondo a mesma coisa — e confirmar os dois criaria DUAS
                     * tarefas. A aprovação de uso único não impede isso: são propostas
                     * distintas, cada uma com a sua aprovação, e o banco está certo em
                     * aceitar as duas.
                     *
                     * A proposta órfã não é cancelada nem executada: ela expira sozinha em 10
                     * minutos sem ter tocado em nada. Perder um cartão de tela é o erro
                     * barato; lançar duas vezes é o caro, e é o bug que este projeto já teve.
                     */
                    propostas: [],
                  }
                : b,
            ),
          ),
        onTool: (e) =>
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
          ),
        onProposta: (e) =>
          setBolhas((atual) =>
            atual.map((b, i) =>
              i === atual.length - 1
                ? { ...b, propostas: [...(b.propostas ?? []), e.proposta] }
                : b,
            ),
          ),
        onDone: (e) =>
          setBolhas((atual) =>
            atual.map((b, i) =>
              i === atual.length - 1
                ? { ...b, status: "complete", provider: e.provider, model: e.model }
                : b,
            ),
          ),
        onError: (e) => {
          marcarFalha(idProvisorioAssistente, e.message);
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
      } else {
        marcarFalha(idProvisorioAssistente, "A conexão caiu durante a resposta.");
      }
    } finally {
      setEnviando(false);
      abortRef.current = null;
      // Reler do servidor: é ele que tem o texto final, o custo e o estado verdadeiro.
      router.refresh();
    }
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

  const restante = MAX_CHAT_TEXT - texto.length;

  return (
    <div className="flex min-h-0 flex-col gap-4">
      {/* TRAVA DE HONESTIDADE, na tela e não só no prompt. */}
      <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />
        <p className="min-w-0 text-muted-foreground">{AVISO_SEM_ACESSO}</p>
      </div>

      {motivoBloqueio && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {motivoBloqueio}
        </div>
      )}

      <div className="space-y-4">
        {bolhas.length === 0 && (
          <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            Nenhuma mensagem ainda. Escreva abaixo para começar.
          </div>
        )}

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
                "min-w-0 max-w-[min(46rem,90%)] rounded-2xl px-4 py-3 text-sm",
                b.role === "user"
                  ? "bg-primary/10 text-foreground"
                  : "border bg-card text-foreground",
                b.status === "failed" && "border-destructive/40",
              )}
            >
              <p className="whitespace-pre-wrap break-words">
                {b.content ||
                  (b.status === "streaming" ? (
                    <span className="inline-flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="size-3.5 animate-spin" /> escrevendo…
                    </span>
                  ) : (
                    ""
                  ))}
              </p>

              {b.status === "cancelled" && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Cancelada. O trecho recebido até aqui foi guardado.
                </p>
              )}

              {b.status === "failed" && b.erro && (
                <p className="mt-2 text-xs text-destructive">{b.erro}</p>
              )}

              {/* QUEM RESPONDEU aparece — em especial quando houve fallback. */}
              {/*
                A condição externa tem de casar EXATAMENTE com a união das internas, senão
                sobra um `<div>` vazio ocupando `mt-2` + `gap`. Foi o que aconteceu quando ela
                virou `(b.provider || b.contexto)`: `onStart` grava o `provider` enquanto o
                status ainda é `"streaming"`, então no fluxo padrão (contexto desligado) a
                bolha ganhava 8px de altura vazia durante toda a resposta.
              */}
              {b.role === "assistant" &&
                (b.contexto || ((b.provider || b.model) && b.status !== "streaming")) && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {b.provider && b.status !== "streaming" && (
                    <Badge variant="outline" className="text-[11px] font-normal">
                      {AI_PROVIDER_LABEL[b.provider]}
                    </Badge>
                  )}
                  {b.model && b.status !== "streaming" && (
                    <Badge variant="outline" className="text-[11px] font-normal">
                      {b.model}
                    </Badge>
                  )}
                  {/* "enviada com", não "usou": quem decide o que fazer com o contexto é o
                      servidor, e a tela não tem como afirmar mais do que sabe. */}
                  {b.contexto && (
                    <Badge variant="outline" className="text-[11px] font-normal">
                      enviada com o contexto de {ROTULO_DA_ROTA_DE_CONTEXTO[b.contexto]}
                    </Badge>
                  )}
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
                  <ProposalCard key={p.id} proposta={p} />
                ))}
            </div>
          </div>
        ))}
        <div ref={fimRef} />
      </div>

      <div className="sticky bottom-0 space-y-2 border-t bg-background pt-3">
        {/*
          CONTEXTO DA PÁGINA — desligado por padrão. O que sai daqui é UMA ROTA de uma lista
          estática do servidor; nunca o que está escrito na tela.
        */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Label
            htmlFor="contexto-da-pagina"
            className="shrink-0 text-xs text-muted-foreground"
          >
            Contexto
          </Label>
          <Select
            value={contexto ?? SEM_CONTEXTO}
            onValueChange={(v) =>
              setContexto(v === SEM_CONTEXTO ? null : (v as RotaComContexto))
            }
            disabled={!podeConversar || enviando}
          >
            <SelectTrigger
              id="contexto-da-pagina"
              className="h-9 w-full min-w-0 sm:w-[15rem]"
              aria-label="Página que dá contexto à conversa"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SEM_CONTEXTO}>Sem contexto de página</SelectItem>
              {ROTAS_COM_CONTEXTO.map((rota) => (
                <SelectItem key={rota} value={rota}>
                  {ROTULO_DA_ROTA_DE_CONTEXTO[rota]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="min-w-0 flex-1 text-xs text-muted-foreground">
            O assistente recebe só o endereço da página — nada do que está escrito nela.
          </p>
        </div>

        <Textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value.slice(0, MAX_CHAT_TEXT))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void enviar();
            }
          }}
          placeholder={
            podeConversar
              ? "Escreva sua mensagem… (Ctrl+Enter envia)"
              : "Configure um provedor de IA para começar."
          }
          rows={3}
          disabled={!podeConversar || enviando}
          className="resize-y"
        />

        <div className="flex flex-wrap items-center justify-between gap-2">
          <span
            className={cn(
              "text-xs",
              restante < 500 ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {restante.toLocaleString("pt-BR")} caracteres restantes
          </span>

          <div className="flex items-center gap-2">
            {enviando && (
              <Button type="button" variant="outline" size="sm" onClick={cancelar}>
                <Square className="size-4" /> Cancelar
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              onClick={() => void enviar()}
              disabled={!podeConversar || enviando || texto.trim().length === 0}
            >
              {enviando ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
              Enviar
            </Button>
          </div>
        </div>
      </div>
    </div>
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
