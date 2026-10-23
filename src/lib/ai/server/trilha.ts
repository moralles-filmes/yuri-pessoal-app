import "server-only";

/**
 * Coordenador · Task 10 — UMA TRILHA: o laço de tentativas de uma sequência de chamadas ao
 * modelo dentro de um run.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ NÃO É UM TERCEIRO LAÇO DE TENTATIVAS. É O LAÇO QUE ERA DE `runChat`, MUDADO DE CASA.  ║
 * ║                                                                                       ║
 * ║ Retry, fallback, medição por chamada, prazo, credencial decifrada por chamada e a     ║
 * ║ regra "uma tentativa aberta" continuam num lugar só — este. O coordenador e cada      ║
 * ║ especialista são TRILHAS de um mesmo run (spec §5.1), e cada um chama esta função.    ║
 * ║                                                                                       ║
 * ║ ⛔ Ela NÃO FECHA O RUN. `completeRun`/`failRun`/`cancelRun` continuam em quem chama:  ║
 * ║ com várias trilhas, só quem vê todas sabe quando o run acabou. Ela devolve um         ║
 * ║ desfecho, e quem chama decide.                                                        ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */

import type {
  AiMessage,
  AiProviderId,
  AiStreamEvent,
  AiToolDefinition,
  AiUsage,
} from "@/lib/ai/core/contracts";
import { aiError, type AiError } from "@/lib/ai/core/errors";
import { decideFallback } from "@/lib/ai/core/fallback";
import type { AiModelEntry } from "@/lib/ai/core/models";
import { type AiRate, rateFor } from "@/lib/ai/core/pricing";
import { closeStep, startStep, type ToolCallStatus } from "@/lib/ai/tools/audit";
import type { ToolPermission, ToolWritePermission } from "@/lib/ai/tools/contracts";
import type { PropostaParaATela } from "@/lib/ai/tools/executor";
import { UNEXPECTED_TOOL_CALL } from "@/lib/ai/tools/registry";
import { computeAttemptCost } from "@/lib/ai/usage/meter";
import { estimarTokensDeEntrada, projetarCustoDoDestino } from "@/lib/ai/usage/reservation";
import { createProviderClient } from "@/lib/ai/providers/provider-factory";
import { resolveApiKey } from "./credential-store";
import { closeAttempt, startAttempt, type AttemptType } from "./run-store";
import { AI_DEADLINE, MENSAGEM_DO_PRAZO, type Prazo, timeoutDaChamada } from "./prazo";
import { runToolLoop, type ToolLoopEvent } from "./tool-loop";

export type Alvo = { readonly provider: AiProviderId; readonly model: AiModelEntry };

/**
 * Os contadores são DO RUN, não da trilha — e por isso quem os possui é quem chama.
 *
 * ⚠️ `attempt_index` continua `UNIQUE (run_id)` e `step_index` continua `UNIQUE (run_id,
 * step_index, kind)` (invariante 18): duas trilhas que numerassem por conta própria colidiriam
 * em `23505`. `contarFallback` mora aqui pelo mesmo motivo: `ai_runs.fallback_count` é do run,
 * e uma trilha abandonada por `return()` não chega a devolver desfecho nenhum para contá-lo.
 */
export type ContadoresDoRun = {
  readonly proximoAttemptIndex: () => number;
  readonly proximoStepIndex: () => number;
  readonly contarFallback: () => void;
};

export type EventoDaTrilha =
  | { readonly type: "delta"; readonly text: string }
  | {
      readonly type: "tool";
      readonly toolName: string;
      readonly status: ToolCallStatus;
      readonly registros: number;
    }
  | { readonly type: "proposta"; readonly proposta: PropostaParaATela }
  /** Texto do SERVIDOR (o corte pelo teto de passos). Quem chama o põe no texto gravado. */
  | { readonly type: "aviso"; readonly texto: string }
  | {
      readonly type: "switch";
      readonly provider: AiProviderId;
      readonly model: string;
      readonly motivo: string;
    };

export type ChamadaPedida = {
  readonly callId: string;
  readonly toolName: string;
  readonly input: unknown;
  readonly metadadosDoProvedor?: unknown;
};

export type DesfechoDaTrilha =
  | {
      readonly ok: true;
      readonly texto: string;
      readonly finishReason: string;
      readonly alvo: Alvo;
      /** Só no modo `"uma-chamada"`: as tool calls pedidas, NÃO executadas. */
      readonly chamadas: readonly ChamadaPedida[];
      /** O `step_index` do passo `modelo` no modo `"uma-chamada"`; `null` no laço. */
      readonly stepIndex: number | null;
    }
  | {
      readonly ok: false;
      readonly erro: AiError;
      /** `true` só quando o DONO cancelou (ou a conexão caiu): o run fecha `cancelled`. */
      readonly cancelado: boolean;
      /**
       * Por que não houve retry nem fallback, já em pt-BR (`decideFallback`). Vai só para a
       * MENSAGEM da tela, depois do erro — e nunca para a coluna sanitizada do run, que
       * guarda o erro. É o que a mensagem de `runChat` sempre disse.
       */
      readonly motivo?: string;
    };

export type EntradaDaTrilha = {
  readonly run: { readonly runId: string; readonly conversationId: string; readonly userId: string };
  readonly trilha: number;
  readonly agente: { readonly id: string; readonly allowedTools: readonly string[] };
  readonly promptVersion: string;
  readonly system: string;
  readonly mensagens: readonly AiMessage[];
  readonly definicoes: readonly AiToolDefinition[];
  /** "laco": runToolLoop executa as ferramentas do registry (hoje). "uma-chamada": UMA chamada,
   *  as tool calls voltam em `chamadas` SEM executar — é o passo de decisão do coordenador. */
  readonly modo: "laco" | "uma-chamada";
  readonly alvos: readonly Alvo[];
  readonly config: { readonly timeoutMs: number; readonly maxRetries: number };
  readonly fallbackLigado: boolean;
  /** false = falhou, acabou: sem retry nem fallback (especialista em paralelo, spec §5.3). */
  readonly repetir: boolean;
  /**
   * Teto de saída DA TRILHA. Cada chamada usa o menor entre ele e o teto do modelo do alvo —
   * `Number.POSITIVE_INFINITY` = sem teto próprio, cada alvo com o do seu modelo.
   */
  readonly tetoDeSaida: number;
  readonly primeiroTipo: "PRIMARY" | "ESPECIALISTA";
  readonly permissions: Readonly<Partial<Record<ToolPermission, boolean>>>;
  readonly writePermissions: Readonly<Partial<Record<ToolWritePermission, boolean>>>;
  readonly contadores: ContadoresDoRun;
  readonly prazo: Prazo;
  readonly agoraMs: () => number;
  readonly abortSignal: AbortSignal;
  readonly hoje: string;
  /** A sobra da reserva do RUN, em USD. Fallback não ganha orçamento novo. */
  readonly reservaRestante: () => number;
  /** Chamado com o custo de cada tentativa fechada que o provedor mediu. */
  readonly aoGastar: (usd: number) => void;
  readonly promptMontado: string; // para projetarCustoDoDestino
};

export async function* runTrilha(
  e: EntradaDaTrilha,
): AsyncGenerator<EventoDaTrilha, DesfechoDaTrilha> {
  const { runId, conversationId, userId } = e.run;
  // As definições que VÃO ao provedor são a régua da chamada inesperada: o que não foi
  // oferecido não pode voltar.
  const nomesOferecidos = e.definicoes.map((d) => d.name);

  /**
   * O texto DESTA trilha, para o desfecho. Zera em tentativa nova pela mesma regra que zera o
   * texto de `runChat` (invariante 23) — e não no TOOL_STEP.
   */
  let texto = "";
  let retriesUsed = 0;
  let alvoIdx = 0;
  let alvoAnterior: Alvo | null = null;

  /**
   * ╔════════════════════════════════════════════════════════════════════════════════════╗
   * ║ CADA CHAMADA AO MODELO É UMA TENTATIVA PRÓPRIA — E SÓ UMA FICA ABERTA POR TRILHA.   ║
   * ║                                                                                     ║
   * ║ `ai_usage_events_one_active_per_trilha_uidx` é `UNIQUE (run_id, trilha) WHERE        ║
   * ║ status = 'started'`. Abrir a tentativa do passo N+1 com a do passo N ainda aberta,  ║
   * ║ na mesma trilha, é `23505` EM RUNTIME — nenhum teste de unidade da medição pega     ║
   * ║ isso, porque a trava é do banco. Por isso o fechamento acontece AQUI, num ponto só, ║
   * ║ e é a primeira coisa que `chamarModelo` faz antes de abrir a seguinte.              ║
   * ║                                                                                     ║
   * ║ ⛔ MOD-ia-005 — no escopo da FUNÇÃO, e não da tentativa: o `finally` lá embaixo      ║
   * ║ precisa alcançá-la. `return()` do consumidor (a aba fechada no meio da resposta)    ║
   * ║ não passa pelo ramo de cancelamento; sem isso a tentativa ficava `started`, com a   ║
   * ║ medição daquela chamada nunca fechada. A tarifa viaja com ela pelo mesmo motivo.    ║
   * ╚════════════════════════════════════════════════════════════════════════════════════╝
   */
  let aberta: { id: string; inicio: number; tarifa: AiRate } | null = null;
  let usoFinal: AiUsage | null = null;
  let providerRequestId: string | null = null;

  const fecharTentativaAberta = async (
    status: "completed" | "failed" | "cancelled",
    errorCode: string | null,
  ) => {
    if (!aberta) return;
    const atual = aberta;
    aberta = null;
    await closeAttempt({
      attemptId: atual.id,
      userId,
      status,
      usage: usoFinal,
      rate: atual.tarifa,
      latencyMs: Date.now() - atual.inicio,
      providerRequestId,
      errorCode,
    });
    if (usoFinal) {
      const parcial = computeAttemptCost(usoFinal, atual.tarifa);
      if (parcial.totalUsd !== null) e.aoGastar(parcial.totalUsd);
    }
    usoFinal = null;
    providerRequestId = null;
  };

  /**
   * MOD-ia-005 — o prazo não comporta a próxima chamada. Quem chama fecha o run como
   * `failed` com este código, em vez de abrir uma chamada que a plataforma cortaria no meio.
   */
  const prazoEsgotado = (): DesfechoDaTrilha => ({
    ok: false,
    erro: aiError("TIMEOUT", AI_DEADLINE, MENSAGEM_DO_PRAZO),
    cancelado: false,
  });

  try {
    while (alvoIdx < e.alvos.length) {
      const alvo = e.alvos[alvoIdx];
      const tarifa = rateFor(alvo.provider, alvo.model.id, e.hoje);
      if (!tarifa) {
        alvoIdx += 1;
        continue;
      }

      // MOD-ia-005 — a primeira chamada, o retry e o fallback passam por aqui ANTES de abrir a
      // tentativa: abaixo do piso, nenhuma linha nova em `ai_usage_events` e nenhum `switch`.
      const timeoutDaTentativa = timeoutDaChamada(e.prazo, e.agoraMs(), e.config.timeoutMs);
      if (timeoutDaTentativa === null) return prazoEsgotado();

      const attemptIndex = e.contadores.proximoAttemptIndex();
      const tipo = tipoDaTentativa(e.primeiroTipo, alvoAnterior, alvo);
      if (tipo === "FALLBACK") e.contadores.contarFallback();

      if (alvoAnterior !== null) {
        /**
         * ╔════════════════════════════════════════════════════════════════════════════════╗
         * ║ TENTATIVA NOVA COMEÇA COM O TEXTO ZERADO — E A TELA FAZ O MESMO NO `switch`.    ║
         * ║                                                                                 ║
         * ║ Sem isto, a narração da tentativa que falhou ficava colada na da seguinte: o    ║
         * ║ acumulador atravessava o retry e o fallback, e era ele que ia para              ║
         * ║ `heartbeatAndPersist` e para `completeRun`. A resposta gravada virava a mistura ║
         * ║ de duas respostas — e nenhuma leitura da conversa depois disso conseguiria      ║
         * ║ separá-las. (Quem chama zera o texto dele ao receber o `switch`.)               ║
         * ║                                                                                 ║
         * ║ ⚠️ Zerar SÓ AQUI é essencial: o passo TOOL_STEP também consome um               ║
         * ║ `attempt_index`, mas ele é a MESMA resposta continuando depois de uma            ║
         * ║ ferramenta, não uma tentativa nova — e não passa por este ponto (ele vive dentro ║
         * ║ de `chamarModelo`).                                                              ║
         * ║                                                                                 ║
         * ║ ⚠️ E zerar só no servidor seria pior que não zerar: o `router.refresh()` do fim  ║
         * ║ do envio releria o texto novo e APAGARIA da tela algo que o usuário já tinha    ║
         * ║ lido. Por isso `chat-client.tsx` limpa a bolha no mesmo evento.                  ║
         * ╚════════════════════════════════════════════════════════════════════════════════╝
         */
        texto = "";
        yield {
          type: "switch",
          provider: alvo.provider,
          model: alvo.model.id,
          motivo:
            tipo === "RETRY"
              ? "Repetindo a chamada no mesmo modelo."
              : "Continuando em outro provedor.",
        };
      }

      const tentativa = await startAttempt({
        runId,
        userId,
        conversationId,
        agentId: e.agente.id,
        attemptIndex,
        attemptType: tipo,
        provider: alvo.provider,
        modelId: alvo.model.id,
        rate: tarifa,
        trilha: e.trilha,
        promptVersion: e.promptVersion,
      });

      if (!tentativa) {
        return {
          ok: false,
          erro: aiError(
            "ERRO_PERMANENTE",
            "ATTEMPT_NOT_RECORDED",
            "Não foi possível registrar a execução. Nenhuma chamada foi feita.",
          ),
          cancelado: false,
        };
      }

      alvoAnterior = alvo;

      // A credencial é decifrada AQUI, no instante da chamada, para UMA chamada.
      const chave = await resolveApiKey(userId, alvo.provider);
      if (!chave.ok) {
        await closeAttempt({
          attemptId: tentativa.id,
          userId,
          status: "failed",
          usage: null,
          rate: tarifa,
          latencyMs: 0,
          providerRequestId: null,
          errorCode: chave.error.code,
        });
        return { ok: false, erro: chave.error, cancelado: false };
      }

      const inicioTentativa = Date.now();
      // O timer do servidor nasce com o timeout que o PRAZO permite, não com o configurado.
      const { signal, dispose } = combinarSinais(e.abortSignal, timeoutDaTentativa);

      usoFinal = null;
      providerRequestId = null;
      let erroDaTentativa: AiError | null = null;
      let concluiu = false;
      let finishReason = "unknown";
      let toolCallInesperada = false;
      // Só o modo `"uma-chamada"` preenche estes dois — e só com o que ESTA tentativa pediu.
      const pedidas: ChamadaPedida[] = [];
      const passoDaDecisao: { indice: number | null } = { indice: null };

      // A tentativa recém-aberta é a única aberta (ver o quadro de `fecharTentativaAberta`).
      aberta = { id: tentativa.id, inicio: inicioTentativa, tarifa };

      /**
       * A chamada ao provedor, uma por passo do laço. O passo 0 usa a tentativa já aberta
       * (PRIMARY/ESPECIALISTA/RETRY/FALLBACK); os seguintes abrem uma tentativa `TOOL_STEP` —
       * que é o que mantém a medição por CHAMADA, e não por resposta.
       */
      const chamarModelo = (
        msgs: readonly AiMessage[],
        passo: number,
      ): AsyncIterable<AiStreamEvent> =>
        (async function* () {
          let timeoutDestaChamada = timeoutDaTentativa;
          if (passo > 0) {
            // MOD-ia-005 — o passo de ferramenta também é uma chamada, e também cabe ou não
            // no prazo. Sem espaço, a tentativa anterior fecha como `completed` (ela terminou
            // de verdade) e nenhuma nova é aberta; quem chama fecha o run por `AI_DEADLINE`.
            const cabe = timeoutDaChamada(e.prazo, e.agoraMs(), e.config.timeoutMs);
            if (cabe === null) {
              await fecharTentativaAberta("completed", null);
              yield {
                type: "error",
                error: aiError("TIMEOUT", AI_DEADLINE, MENSAGEM_DO_PRAZO),
              };
              return;
            }
            timeoutDestaChamada = cabe;
            await fecharTentativaAberta("completed", null);
            const nova = await startAttempt({
              runId,
              userId,
              conversationId,
              agentId: e.agente.id,
              attemptIndex: e.contadores.proximoAttemptIndex(),
              attemptType: "TOOL_STEP",
              provider: alvo.provider,
              modelId: alvo.model.id,
              rate: tarifa,
              trilha: e.trilha,
              promptVersion: e.promptVersion,
            });
            if (!nova) {
              yield {
                type: "error",
                error: aiError(
                  "ERRO_PERMANENTE",
                  "ATTEMPT_NOT_RECORDED",
                  "Não foi possível registrar a continuação da execução. A resposta foi interrompida.",
                ),
              };
              return;
            }
            aberta = { id: nova.id, inicio: Date.now(), tarifa };
            concluiu = false;
          }

          const client = createProviderClient(alvo.provider, chave.value);
          yield* client.streamText({
            model: alvo.model.id,
            system: e.system,
            messages: msgs,
            maxOutputTokens: Math.min(e.tetoDeSaida, alvo.model.outputCapTokens),
            timeoutMs: timeoutDestaChamada,
            abortSignal: signal,
            // O laço executa SÓ o que passou pela allowlist do agente e pelo guard. O que
            // não está aqui não foi oferecido — e voltar assim mesmo encerra o run.
            tools: e.definicoes,
          });
        })();

      const fonte: AsyncIterable<ToolLoopEvent> =
        e.modo === "laco"
          ? runToolLoop({
              ctxBase: {
                runId,
                // A conversa vem da admissão atômica, nunca do cliente: é ela que a FK
                // composta de `ai_action_proposals` confere contra o run e o dono.
                conversationId,
                userId,
                agent: e.agente,
                permissions: e.permissions,
                writePermissions: e.writePermissions,
              },
              mensagensIniciais: e.mensagens,
              ferramentasOferecidas: nomesOferecidos,
              proximoStepIndex: e.contadores.proximoStepIndex,
              chamarModelo,
            })
          : umaChamadaSo({
              runId,
              userId,
              mensagens: e.mensagens,
              ferramentasOferecidas: nomesOferecidos,
              proximoStepIndex: e.contadores.proximoStepIndex,
              chamarModelo,
              pedidas,
              passoDaDecisao,
            });

      try {
        for await (const evento of fonte) {
          if (evento.type === "delta") {
            texto += evento.text;
            yield { type: "delta", text: evento.text };
            continue;
          }

          if (evento.type === "tool") {
            yield {
              type: "tool",
              toolName: evento.toolName,
              status: evento.status,
              registros: evento.registros,
            };
            continue;
          }

          if (evento.type === "proposta") {
            yield { type: "proposta", proposta: evento.proposta };
            continue;
          }

          if (evento.type === "aviso") {
            // O corte NÃO é silencioso: ele entra na resposta que o usuário lê e na
            // mensagem que fica gravada. Uma resposta interrompida apresentada como
            // completa é a mesma família de mentira que a subfase inteira combate.
            texto += texto === "" ? evento.texto : `\n\n${evento.texto}`;
            yield { type: "aviso", texto: evento.texto };
            continue;
          }

          if (evento.type === "tool-call-inesperada") {
            // Não executamos, não interpretamos como ferramenta válida e não deixamos o run
            // seguir como se nada tivesse ocorrido.
            toolCallInesperada = true;
            erroDaTentativa = aiError(
              "ERRO_PERMANENTE",
              UNEXPECTED_TOOL_CALL,
              "O provedor tentou usar uma ferramenta que não foi oferecida. A execução foi encerrada por segurança.",
            );
            break;
          }

          const doProvedor = evento.evento;

          if (doProvedor.type === "finish") {
            usoFinal = doProvedor.usage;
            providerRequestId = doProvedor.providerRequestId;
            finishReason = doProvedor.finishReason;
            concluiu = true;
            continue;
          }

          if (doProvedor.type === "error") {
            erroDaTentativa = doProvedor.error;
            break;
          }
        }
      } catch (err) {
        erroDaTentativa = aiError(
          "ERRO_TEMPORARIO",
          "STREAM_FAILED",
          err instanceof Error && err.name === "AbortError"
            ? "A resposta foi interrompida."
            : "A resposta foi interrompida por uma falha inesperada.",
        );
      } finally {
        dispose();
      }

      // ── Cancelamento do usuário (ou queda do cliente, que é idêntica) ───────────────
      if (e.abortSignal.aborted) {
        await fecharTentativaAberta("cancelled", "CANCELLED");
        return {
          ok: false,
          erro: aiError("CANCELADO_PELO_USUARIO", "CANCELLED"),
          cancelado: true,
        };
      }

      /**
       * MOD-ia-005 — quem abortou o sinal da chamada foi o timer do SERVIDOR, não o dono (o
       * sinal dele foi tratado logo acima). O adapter só vê um aborto e o relata como
       * cancelamento; deixar assim fecharia a tentativa como `cancelled` e diria ao dono
       * "Resposta cancelada." sobre algo que ninguém cancelou. Como `TIMEOUT`, a decisão de
       * retry segue a regra de sempre — e o prazo, conferido antes da próxima chamada, decide
       * se ela ainda cabe.
       */
      if (signal.aborted && erroDaTentativa?.class === "CANCELADO_PELO_USUARIO") {
        erroDaTentativa = aiError("TIMEOUT", "SERVER_TIMEOUT");
      }

      // ── Sucesso ────────────────────────────────────────────────────────────────────
      if (concluiu && !erroDaTentativa) {
        await fecharTentativaAberta("completed", null);
        return {
          ok: true,
          texto,
          finishReason,
          alvo,
          chamadas: pedidas,
          stepIndex: passoDaDecisao.indice,
        };
      }

      // ── Falha ──────────────────────────────────────────────────────────────────────
      const erro =
        erroDaTentativa ??
        aiError("ERRO_TEMPORARIO", "NO_FINISH", "A resposta terminou sem conclusão.");

      await fecharTentativaAberta(
        erro.class === "CANCELADO_PELO_USUARIO" ? "cancelled" : "failed",
        erro.code,
      );

      // Tool call inesperada NÃO tem recuperação: encerra, ponto.
      if (toolCallInesperada) return { ok: false, erro, cancelado: false };

      // MOD-ia-005 — o passo de ferramenta já recusou abrir a chamada por falta de prazo.
      // Não há o que decidir: nem retry nem fallback cabem no mesmo tempo que não coube.
      if (erro.code === AI_DEADLINE) return prazoEsgotado();

      // Especialista em paralelo: falhou, acabou (spec §5.3).
      if (!e.repetir) return { ok: false, erro, cancelado: false };

      const proximoAlvo = e.alvos[alvoIdx + 1];
      const tarifaProximo = proximoAlvo
        ? rateFor(proximoAlvo.provider, proximoAlvo.model.id, e.hoje)
        : null;
      const custoProjetado =
        tarifaProximo && proximoAlvo
          ? projetarCustoDoDestino(
              tarifaProximo,
              estimarTokensDeEntrada(e.promptMontado),
              Math.min(e.tetoDeSaida, proximoAlvo.model.outputCapTokens),
            )
          : Number.POSITIVE_INFINITY;

      const veredito = decideFallback({
        errorClass: erro.class,
        fallbackAllowed: e.fallbackLigado,
        fallbackTargetsLeft: e.alvos.length - (alvoIdx + 1),
        retriesUsed,
        maxRetries: e.config.maxRetries,
        reservaRestante: e.reservaRestante(),
        custoProjetadoDoDestino: custoProjetado,
      });

      if (veredito.kind === "retry") {
        retriesUsed += 1;
        continue; // mesmo alvo
      }
      if (veredito.kind === "fallback") {
        alvoIdx += 1;
        continue;
      }

      return { ok: false, erro, cancelado: false, motivo: veredito.motivo };
    }

    // Saiu do laço sem sucesso: acabaram os alvos.
    return {
      ok: false,
      erro: aiError(
        "ERRO_PERMANENTE",
        "NO_TARGET_SUCCEEDED",
        "Nenhum provedor autorizado conseguiu responder.",
      ),
      cancelado: false,
    };
  } finally {
    // Rede de segurança: se saímos por `return()` do consumidor (o navegador fechou a aba),
    // a tentativa aberta desta trilha fecha como `cancelled` — ANTES de quem chama fechar o
    // run, porque o `finally` daqui roda quando o `for await` dele abandona este gerador.
    if (aberta) await fecharTentativaAberta("cancelled", "CANCELLED").catch(() => {});
  }
}

/**
 * A primeira tentativa da trilha é `primeiroTipo`; repetir provedor E modelo é `RETRY`;
 * trocar é `FALLBACK`. (`TOOL_STEP` não passa por aqui: é a mesma resposta continuando.)
 */
function tipoDaTentativa(
  primeiroTipo: "PRIMARY" | "ESPECIALISTA",
  anterior: Alvo | null,
  atual: Alvo,
): AttemptType {
  if (anterior === null) return primeiroTipo;
  const mesmo =
    anterior.provider === atual.provider && anterior.model.id === atual.model.id;
  return mesmo ? "RETRY" : "FALLBACK";
}

/**
 * O modo `"uma-chamada"`: UMA chamada ao modelo, e as tool calls voltam SEM executar.
 *
 * É o passo de decisão do coordenador: quem decide o que fazer com cada pedido é ele, e por
 * isso nada aqui alcança `executeTool`. O passo `modelo` em `ai_run_steps` é registrado COMO
 * o `tool-loop` o registra (mesma assimetria: falhar ao abri-lo não bloqueia a chamada, porque
 * ele não ampara leitura nenhuma), e o `step_index` usado sai no desfecho — é nele que quem
 * chama abre o passo `ferramentas` do acionamento.
 */
async function* umaChamadaSo(input: {
  readonly runId: string;
  readonly userId: string;
  readonly mensagens: readonly AiMessage[];
  readonly ferramentasOferecidas: readonly string[];
  readonly proximoStepIndex: () => number;
  readonly chamarModelo: (
    mensagens: readonly AiMessage[],
    passo: number,
  ) => AsyncIterable<AiStreamEvent>;
  readonly pedidas: ChamadaPedida[];
  readonly passoDaDecisao: { indice: number | null };
}): AsyncGenerator<ToolLoopEvent> {
  const oferecidas = new Set(input.ferramentasOferecidas);
  const indice = input.proximoStepIndex();
  input.passoDaDecisao.indice = indice;

  const stepModelo = await startStep({
    runId: input.runId,
    userId: input.userId,
    stepIndex: indice,
    kind: "modelo",
  });
  const inicioModelo = Date.now();
  let inesperada: string | null = null;
  // Ver o mesmo campo em `tool-loop.ts`: `return()` do consumidor chega DENTRO do `for await`.
  let modeloTerminouSozinho = false;

  try {
    for await (const evento of input.chamarModelo(input.mensagens, 0)) {
      if (evento.type === "delta") {
        yield { type: "delta", text: evento.text };
        continue;
      }
      if (evento.type === "tool-call") {
        if (!oferecidas.has(evento.toolName)) {
          inesperada = evento.toolName;
          break;
        }
        input.pedidas.push({
          callId: evento.callId,
          toolName: evento.toolName,
          input: evento.input,
          ...(evento.metadadosDoProvedor != null
            ? { metadadosDoProvedor: evento.metadadosDoProvedor }
            : {}),
        });
        continue;
      }
      yield { type: "passthrough", evento };
    }
    modeloTerminouSozinho = true;
  } finally {
    if (stepModelo) {
      // Lançar daqui sobrescreveria o erro real da tentativa (ver `tool-loop.ts`).
      try {
        await closeStep({
          runId: input.runId,
          stepId: stepModelo,
          userId: input.userId,
          status: modeloTerminouSozinho && !inesperada ? "completed" : "failed",
          durationMs: Date.now() - inicioModelo,
        });
      } catch {
        // Engolido de propósito: a falha de trilha não pode mascarar a falha real.
      }
    }
  }

  if (inesperada) yield { type: "tool-call-inesperada", toolName: inesperada };
}

/**
 * Une o `AbortSignal` do cliente com o timeout do servidor.
 *
 * O timeout do SERVIDOR é menor que o `maxDuration` da plataforma de propósito: assim quem
 * encerra somos nós, e o estado fica consistente. Se a plataforma cortar primeiro, ninguém
 * roda o `finally` — e o run só seria recuperado pela reconciliação.
 *
 * MOD-ia-005 — `timeoutMs` chega já recortado por `timeoutDaChamada` (`server/prazo.ts`): o
 * menor entre o configurado e o que resta do prazo da requisição. O configurado sozinho
 * (padrão 60 s, até 300 s) não garantia a frase acima.
 */
function combinarSinais(
  externo: AbortSignal,
  timeoutMs: number,
): { signal: AbortSignal; dispose: () => void } {
  const controller = new AbortController();

  const abortar = () => controller.abort();
  if (externo.aborted) abortar();
  else externo.addEventListener("abort", abortar, { once: true });

  const timer = setTimeout(abortar, Math.max(1000, timeoutMs));

  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timer);
      externo.removeEventListener("abort", abortar);
    },
  };
}
