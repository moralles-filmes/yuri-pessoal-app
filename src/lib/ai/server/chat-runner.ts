import "server-only";

/**
 * Fase 18-A — IA · O orquestrador do run inteiro.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ A ORDEM ABAIXO NÃO É ESTILO. Cada passo existe porque o anterior o torna possível.    ║
 * ║                                                                                       ║
 * ║  1. keyring pronto?      → sem cripto, nenhuma credencial é aberta                    ║
 * ║  2. preferências         → as flags `allow_*` decidem QUEM pode ser consultado        ║
 * ║  3. coordenador ou plano → `agent_id` do cliente é ignorado (Task 12)                 ║
 * ║  4. rota + reserva       → precisa da cadeia de fallback JÁ resolvida                  ║
 * ║  5. admissão atômica     → COMMITA aqui, antes de qualquer chamada externa             ║
 * ║  6. tentativas           → cada uma é uma linha própria em `ai_usage_events`           ║
 * ║  7. fechamento           → condicional ao estado; `finally` e reconciliador convivem   ║
 * ║                                                                                       ║
 * ║ NENHUMA transação e NENHUM lock permanecem abertos do passo 6 em diante.               ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */

import type { AiMessage, AiProviderId } from "@/lib/ai/core/contracts";
import { aiError } from "@/lib/ai/core/errors";
import { type AiRate, PRICING_VERSION, rateFor } from "@/lib/ai/core/pricing";
import { routeRequest } from "@/lib/ai/core/router";
import { promptVersionOf } from "@/lib/ai/agents/registry";
import { memoriasParaOPrompt } from "@/lib/ai/memory/prompt";
import type { MemoriaParaPrompt } from "@/lib/ai/memory/contracts";
import { getMemoriasVigentes } from "@/lib/ai/memory/queries";
import { montarSystem } from "./system-prompt";
/**
 * ⛔ 18-F Bloco 4 — `contracts` e `inbox`, NUNCA `experiences/catalog`.
 *
 * O plano chega pronto; este arquivo não tem como buscar uma experiência, inventar uma
 * ferramenta nem trocar o prompt de redação. Há teste de fronteira em `boundaries.test.ts`
 * afirmando que `experiences/catalog` só é importado por `server/experience-runner.ts`.
 */
import type { PlanoDaExperiencia } from "@/lib/ai/experiences/contracts";
import { avisoDeLeiturasQueFalharam } from "@/lib/ai/experiences/falhas";
import { closeStep, startStep, type ToolCallStatus } from "@/lib/ai/tools/audit";
import { executeTool, type PropostaParaATela } from "@/lib/ai/tools/executor";
import { renderUntrusted } from "@/lib/ai/security/untrusted";
import { textoDasMensagens } from "@/lib/ai/core/text";
import { safeUserMessage } from "@/lib/ai/security/redact";
import {
  computeReservation,
  computeReservationDoCoordenador,
  estimarTokensDeEntrada,
  RESERVA_TTL_SEGUNDOS,
} from "@/lib/ai/usage/reservation";
import {
  getAiPreferences,
  getHistoryForPrompt,
  getRouterConfigs,
} from "@/lib/ai/queries";
import { dateInSaoPaulo } from "@/lib/format";
import { AI_CRYPTO_NOT_CONFIGURED, getCryptoReadiness } from "./crypto-readiness";
import {
  beginChatRun,
  beginExperienceRun,
  cancelRun,
  completeRun,
  failRun,
  HEARTBEAT_INTERVAL_MS,
  heartbeatAndPersist,
  markStreaming,
  MENSAGEM_ADMISSAO,
} from "./run-store";
import {
  conduzirCoordenador,
  eventosDaTrilha,
  perfilDoCoordenador,
  prepararDecisao,
  tokensDoMaiorEspecialista,
  type DesfechoDoCoordenador,
} from "./coordenador";
import { criarPrazo } from "./prazo";
import {
  runTrilha,
  type Alvo,
  type ContadoresDoRun,
  type DesfechoDaTrilha,
} from "./trilha";

/** O que a fonte de eventos de `runChat` devolve: a trilha do plano ou o coordenador. */
type DesfechoDaFonte = DesfechoDaTrilha | DesfechoDoCoordenador;

export type ChatRunnerEvent =
  | {
      readonly type: "start";
      readonly conversationId: string;
      readonly runId: string;
      readonly assistantMessageId: string;
      readonly provider: AiProviderId;
      readonly model: string;
      readonly correlationId: string;
    }
  | { readonly type: "delta"; readonly text: string }
  /**
   * Trocou de provedor no meio. A tela MOSTRA quem respondeu — não é detalhe interno.
   *
   * Coordenador · Task 12 — `trilha` diz QUAL trilha recomeçou (0 = coordenador, 1..6 =
   * especialista). Só ela zera texto e cartões: no modo direto, o retry do especialista tira
   * os cartões dele, e não os de outra trilha (spec §5.3, Review Focus 2).
   */
  | {
      readonly type: "switch";
      readonly provider: AiProviderId;
      readonly model: string;
      readonly motivo: string;
      readonly trilha: number;
    }
  /**
   * Coordenador · Task 12 — um especialista foi acionado, respondeu ou falhou. Alimenta a
   * linha "Consultando: Finanças…" da tela. Não carrega resposta nenhuma: o que o
   * especialista disse chega por `delta` (modo direto) ou pela síntese (Task 13).
   */
  | {
      readonly type: "especialista";
      readonly agentId: string;
      readonly rotulo: string;
      readonly trilha: number;
      readonly status: "consultando" | "pronto" | "falhou";
    }
  /**
   * Uma ferramenta foi executada (ou recusada) DENTRO desta resposta. A tela mostra o que
   * foi consultado — leitura de dado do usuário nunca acontece em silêncio.
   */
  | {
      readonly type: "tool";
      readonly toolName: string;
      /**
       * O MESMO vocabulário de `ai_tool_calls.status` (`tools/audit.ts`), não uma cópia dele:
       * repetir os literais aqui deixaria um status novo entrar na auditoria sem que o `tsc`
       * apontasse a tela desatualizada. `import type` é apagado na compilação — nada de
       * `server-only` chega ao bundle por causa desta linha.
       */
      readonly status: ToolCallStatus;
      readonly registros: number;
    }
  /**
   * 18-C · Bloco 4 — uma alteração foi PREPARADA e aguarda a confirmação do dono. Nada foi
   * escrito em módulo nenhum. A tela desenha o cartão com a previsão e os dois botões; quem
   * executa é uma Server Action, fora deste streaming.
   *
   * ⚠️ Cancelar a resposta agora NÃO cancela a proposta: ela é uma linha gravada, com prazo
   * próprio de 10 minutos. E confirmar depois NÃO depende deste stream estar vivo — é
   * exatamente essa separação que torna "cancelar o streaming não desfaz ação confirmada"
   * verdadeiro por construção.
   */
  | {
      readonly type: "proposta";
      readonly proposta: PropostaParaATela;
      /** A trilha que preparou o cartão — é por ela que um `switch` remove só os seus. */
      readonly trilha: number;
    }
  | {
      readonly type: "done";
      readonly finishReason: string;
      readonly provider: AiProviderId;
      readonly model: string;
    }
  | {
      readonly type: "error";
      readonly code: string;
      readonly message: string;
      readonly retryAfterSeconds?: number;
    };

export type ChatRunnerInput = {
  readonly userId: string;
  readonly conversationId: string | null;
  readonly text: string;
  /**
   * ⚠️ Coordenador · Task 12 — IGNORADO. Quem responde é o coordenador, e quem ele aciona sai
   * da decisão dele, validada pelo servidor. O campo some do corpo na Task 20.
   */
  readonly agentId: string | null;
  /** ⚠️ Coordenador · Task 12 — IGNORADO; some na Task 20 (spec §4.6). */
  readonly pageContext?: { readonly rota: string; readonly modulo: string } | null;
  readonly providerPreference?: string | null;
  readonly modelPreference?: string | null;
  readonly abortSignal: AbortSignal;
  readonly agora: Date;
  /**
   * MOD-ia-005 — o relógio do PRAZO da requisição, em ms. Ausente = `Date.now`. É injetável
   * pelo mesmo motivo que `agora`: o prazo é uma decisão sobre o tempo, e um teste que
   * dependesse do relógio real teria de esperar 55 s para ver um retry recusado.
   */
  readonly agoraMs?: () => number;
  /**
   * 18-F Bloco 4 — O PLANO DA EXPERIÊNCIA. Ausente = mensagem normal, tudo como antes.
   *
   * ⛔ É um OBJETO PRONTO, e por isso este arquivo NÃO importa `experiences/catalog`: ele não
   * tem como buscar uma experiência, inventar uma ferramenta nem trocar o prompt. Quem lê o
   * catálogo é `server/experience-runner.ts`, e há teste de fronteira sobre isso.
   */
  readonly plano?: PlanoDaExperiencia | null;
  /**
   * ⚠️ Coordenador · Task 12 — IGNORADO. O comportamento da caixa de entrada passa a ser do
   * coordenador sempre (spec §4.6), e o campo some do corpo na Task 20.
   */
  readonly caixaDeEntrada?: boolean;
};

export async function* runChat(
  input: ChatRunnerInput,
): AsyncGenerator<ChatRunnerEvent> {
  /**
   * MOD-ia-005 — o prazo nasce ANTES de tudo, porque preferências, memória, histórico e a
   * admissão também gastam os 60 s da função. Ver `server/prazo.ts`.
   */
  const agoraMs = input.agoraMs ?? Date.now;
  const prazo = criarPrazo(agoraMs());

  // ── 1. Cripto pronta? ───────────────────────────────────────────────────────────────
  const readiness = getCryptoReadiness();
  if (!readiness.ready) {
    yield {
      type: "error",
      code: AI_CRYPTO_NOT_CONFIGURED,
      message: readiness.message,
    };
    return;
  }

  // ── 2. Preferências e configurações ────────────────────────────────────────────────
  //
  // Vêm ANTES de tudo porque as flags `allow_*` decidem quais especialistas o coordenador vê:
  // o de um módulo cuja leitura não está autorizada simplesmente não existe para esta
  // mensagem (`catalogoDeEspecialistas`).
  const [configs, prefs] = await Promise.all([
    getRouterConfigs(input.userId),
    getAiPreferences(input.userId),
  ]);

  // ── 3. Quem responde: o COORDENADOR — ou o plano recebido ──────────────────────────
  //
  // Coordenador · Task 12 — sem plano, quem responde é SEMPRE o coordenador (o agente
  // `assistente-pessoal`). `routeAgent` deixou de decidir o chat: quem cada mensagem consulta
  // sai da decisão do coordenador, e o servidor valida cada acionamento contra a oferta derivada
  // das chaves do dono (`agents/especialistas.ts`). O `agentId` do cliente fica ignorado.
  //
  // ⛔ 18-F Bloco 4 — com plano, o coordenador NÃO roda. A experiência não é um agente do dono:
  // é um roteiro nosso, com lista de leituras fixa e prompt próprio.
  const coordenador = input.plano ? null : perfilDoCoordenador();

  const hoje = dateInSaoPaulo(input.agora);

  const rota = routeRequest({
    configs,
    defaultProvider: prefs.defaultProvider,
    defaultModel: prefs.defaultModel,
    providerPreference: input.providerPreference,
    modelPreference: input.modelPreference,
    // Um panorama só REDIGE: nenhuma capacidade especial é exigida do modelo.
    requiredCapabilities: coordenador?.requiredCapabilities ?? [],
    hoje,
  });

  if (!rota.ok) {
    yield { type: "error", code: rota.error.code, message: safeUserMessage(rota.error) };
    return;
  }

  const { provider, model, config, fallbackChain } = rota.value;

  // Fallback exige as DUAS chaves ligadas: a do provedor e a do usuário. Uma sozinha não
  // basta — gastar em outro provedor é decisão que precisa estar explícita nos dois lugares.
  const fallbackLigado = config.fallbackAllowed && prefs.allowFallback;
  const alvos: Alvo[] = [
    { provider, model },
    ...(fallbackLigado ? fallbackChain : []),
  ];

  // ── 4. Prompt e reserva ────────────────────────────────────────────────────────────
  /**
   * ⚠️ 18-F Bloco 3 — A MEMÓRIA ENTRA POR ÚLTIMO, e a ordem é a garantia (§6.4). A
   * concatenação é `montarSystem` (`./system-prompt`), nos dois caminhos — aqui para o plano,
   * e em `./coordenador` para o coordenador e cada especialista —, e `memory/prompt.test.ts`
   * prova a ordem lá.
   *
   * ⚠️ E isto NÃO muda a versão registrada em `ai_runs`. A versão descreve o PROMPT-BASE e o
   * perfil; memória é dado desta execução. Subir a versão a cada memória nova tornaria a
   * coluna inútil.
   *
   * ⚠️ Custo: duas consultas a mais por mensagem, e SÓ com `allow_memory` ligada.
   */
  const memorias = prefs.permissions.allow_memory
    ? await getMemoriasVigentes(input.userId, input.agora)
    : [];

  const tarifas: AiRate[] = [];
  for (const alvo of alvos) {
    const r = rateFor(alvo.provider, alvo.model.id, hoje);
    // O router já garantiu que existe tarifa; esta checagem é a rede.
    if (r) tarifas.push(r);
  }
  if (tarifas.length === 0) {
    yield {
      type: "error",
      code: "MODEL_WITHOUT_RATE",
      message: "O modelo escolhido não tem tarifa cadastrada e por isso não pode ser usado.",
    };
    return;
  }

  /**
   * O que cada caminho leva à admissão e à trilha. Montado num ramo só por caminho, para o
   * plano não ver nada do coordenador e o coordenador nada do plano.
   */
  let preparo: {
    readonly agentId: string;
    readonly promptVersion: string;
    readonly reserva: { readonly valorUsd: number };
    /** Só no caminho do plano: o que a trilha 0 recebe já montado. */
    readonly doPlano: {
      readonly system: string;
      readonly mensagens: AiMessage[];
      readonly promptMontado: string;
    } | null;
    /** Só no caminho do coordenador: o histórico que o passo de decisão recebe. */
    readonly historico: readonly { role: "user" | "assistant"; content: string }[];
  };

  if (input.plano) {
    /**
     * ⛔ 18-F Bloco 4 — O PANORAMA TAMBÉM CARREGA A MEMÓRIA, E ELA CONTINUA SENDO A ÚLTIMA
     * SEÇÃO. Um panorama não tem "o módulo do agente": ele lê vários. A seleção roda uma vez
     * por módulo do plano, MAIS uma com `null` para alcançar as memórias globais — e a união
     * é deduplicada por id. Cada módulo continua passando pelo MESMO filtro do Bloco 3, que
     * exige a `allow_*` daquele módulo (invariante 26).
     */
    const selecionadas = unirMemorias(
      [null, ...input.plano.modulos].map((m) =>
        memoriasParaOPrompt({
          memorias,
          moduloDoAgente: m,
          permissions: prefs.permissions,
          allowMemory: prefs.permissions.allow_memory,
        }),
      ),
    );

    /** Com plano, nada vem do registry de agentes: a experiência é um roteiro nosso. */
    const perfil = {
      id: input.plano.agentId,
      systemBase: input.plano.system,
      promptVersion: input.plano.promptVersion,
    };

    const system = montarSystem({
      base: perfil.systemBase,
      blocos: [],
      memorias: selecionadas,
    });

    /**
     * ⚠️ MUTÁVEL DE PROPÓSITO. Os blocos das ferramentas só existem DEPOIS da admissão (cada
     * chamada precisa de `run_id` e `step_id`), então eles são acrescentados mais abaixo. O
     * que está aqui é o que a RESERVA enxerga — e a reserva usa o teto do catálogo.
     */
    const mensagens: AiMessage[] = [{ role: "user", content: input.plano.userText }];

    // A estimativa é sobre o prompt JÁ MONTADO, nunca sobre o texto cru do usuário.
    // ⚠️ `textoDasMensagens`, e não `map(m => m.content).join()`: `content` é união desde a
    // 18-B, e concatenar partes direto produz `[object Object]`.
    const promptMontado = system + textoDasMensagens(mensagens);
    const reserva = computeReservation({
      rates: tarifas,
      /**
       * ⛔ 18-F Bloco 4 — O CONTEXTO DA EXPERIÊNCIA ENTRA NA RESERVA, E PELO TETO DO CATÁLOGO
       * (invariante 56): os blocos das ferramentas só existem depois da admissão. O número vem
       * de `MAX_FERRAMENTAS_POR_EXPERIENCIA`, NUNCA de `leituras.length`.
       */
      tokensEntradaEstimados:
        estimarTokensDeEntrada(promptMontado) + input.plano.tokensDeContextoReservados,
      tetoDeSaida: model.outputCapTokens,
      maxRetries: config.maxRetries,
      maxFallbacks: Math.max(0, alvos.length - 1),
      margem: prefs.reservationMargin,
      // ⛔ Num panorama não há laço NENHUM: as ferramentas rodam ANTES da chamada ao modelo.
      maxToolSteps: 0,
    });

    preparo = {
      agentId: perfil.id,
      promptVersion: perfil.promptVersion,
      reserva,
      doPlano: { system, mensagens, promptMontado },
      historico: [],
    };
  } else {
    const historico = input.conversationId
      ? await getHistoryForPrompt(input.userId, input.conversationId)
      : [];

    /**
     * ⛔ A RESERVA DO COORDENADOR É O PIOR CASO, POR CONSTANTES (spec §5.6). Quantos
     * especialistas entram só se sabe depois da admissão; reservar pelo que de fato rodar
     * deixaria passar em silêncio o que o orçamento existe para barrar. O prompt da decisão é
     * o MESMO que `conduzirCoordenador` vai enviar (`prepararDecisao`, uma montagem só).
     */
    const decisao = prepararDecisao({
      prefs,
      memorias,
      agora: input.agora,
      historico,
      texto: input.text,
    });
    const reserva = computeReservationDoCoordenador({
      rates: tarifas,
      maxRetries: config.maxRetries,
      maxFallbacks: Math.max(0, alvos.length - 1),
      margem: prefs.reservationMargin,
      tokensEntradaDoCoordenador: estimarTokensDeEntrada(
        decisao.system + textoDasMensagens(decisao.mensagens),
      ),
      tokensEntradaDoEspecialista: tokensDoMaiorEspecialista({
        prefs,
        memorias,
        agora: input.agora,
      }),
      tetoSaidaDaSintese: model.outputCapTokens,
    });

    preparo = {
      agentId: coordenador!.id,
      // A versão do coordenador (`assistente-pessoal-v3`, invariante 105), derivada do registry.
      promptVersion: promptVersionOf(coordenador!),
      reserva,
      doPlano: null,
      historico,
    };
  }

  const reserva = preparo.reserva;

  // ── 5. ADMISSÃO ATÔMICA — o commit acontece aqui, antes de qualquer chamada externa ──
  //
  // ⛔ 18-F Bloco 4 — o panorama entra por uma RPC própria, que confere `allow_cross_module`
  // dentro da mesma transação e usa o MESMO advisory lock: o recurso disputado é o orçamento
  // do dono, não a espécie do run.
  const admissao = input.plano
    ? await beginExperienceRun({
        experiencia: input.plano.id,
        // O título sai do CATÁLOGO. Não existe parâmetro para texto do cliente, aqui nem lá.
        title: input.plano.userText,
        promptVersion: preparo.promptVersion,
        provider,
        model: model.id,
        reservedCost: reserva.valorUsd,
        reservationRateVersion: PRICING_VERSION,
        reservationTtlSeconds: RESERVA_TTL_SEGUNDOS,
      })
    : await beginChatRun({
        conversationId: input.conversationId,
        agentId: preparo.agentId,
        promptVersion: preparo.promptVersion,
        userText: input.text,
        provider,
        model: model.id,
        reservedCost: reserva.valorUsd,
        reservationRateVersion: PRICING_VERSION,
        reservationTtlSeconds: RESERVA_TTL_SEGUNDOS,
        title: input.conversationId ? null : tituloProvisorio(input.text),
      });

  if (!admissao.ok) {
    yield {
      type: "error",
      code: admissao.code,
      message: MENSAGEM_ADMISSAO[admissao.code],
      ...(admissao.code === "AI_ADMISSION_BUSY" || admissao.code === "AI_RATE_LIMITED"
        ? { retryAfterSeconds: 5 }
        : {}),
    };
    return;
  }

  const run = admissao.value;
  yield {
    type: "start",
    conversationId: run.conversationId,
    runId: run.runId,
    assistantMessageId: run.assistantMessageId,
    provider,
    model: model.id,
    correlationId: run.correlationId,
  };

  // ── 6. Tentativas ──────────────────────────────────────────────────────────────────
  const inicioMs = Date.now();
  let texto = "";
  let custoAcumulado = 0;
  let fechado = false;
  let ultimoHeartbeat = inicioMs;
  /** Quem EFETIVAMENTE concluiu — só existe depois de um desfecho `ok`. */
  let vencedor: Alvo | null = null;

  /**
   * ⚠️ Os contadores são DO RUN, e o run é um só: `beginChatRun` já rodou, e retry, fallback,
   * TOOL_STEP e as trilhas continuam dentro dele. Como `ai_run_steps_run_index_uidx` é
   * `UNIQUE (run_id, step_index, kind)`, um contador que vivesse dentro de `runToolLoop` (ou de
   * uma trilha) reiniciaria a cada tentativa e a segunda colidiria em `23505` — `startStep`
   * devolveria `null` e a regra "sem trilha, sem leitura" bloquearia TODA leitura depois do
   * primeiro retry. Por isso os contadores moram aqui e atravessam a cadeia inteira
   * (invariante 18); `attempt_index` é `UNIQUE (run_id)` pelo mesmo motivo.
   */
  let attemptIndex = 0;
  let stepIndex = 0;
  let fallbackCount = 0;
  const contadores: ContadoresDoRun = {
    proximoAttemptIndex: () => (attemptIndex += 1),
    proximoStepIndex: () => (stepIndex += 1),
    contarFallback: () => {
      fallbackCount += 1;
    },
  };
  const proximoStepIndex = contadores.proximoStepIndex;

  /**
   * 18-F Bloco 4 — o que NÃO chegou porque a leitura falhou, já em pt-BR. Vive fora do `try`
   * porque nasce no passo dirigido e é consumido lá embaixo, no ramo de sucesso: tentativa
   * nova zera o texto do modelo (invariante 23), mas não desfaz uma leitura que falhou.
   */
  let avisoDeFalhas = "";

  /**
   * `completed_provider`/`completed_model` significam "quem EFETIVAMENTE CONCLUIU" — por
   * isso ficam nulos quando o run falha ou é cancelado. Gravar ali o último provedor
   * tentado faria a tela dizer "respondido por X" numa resposta que nunca existiu.
   */
  const contexto = (concluiu = false) => ({
    runId: run.runId,
    userId: input.userId,
    assistantMessageId: run.assistantMessageId,
    textoFinal: texto,
    startedAtMs: inicioMs,
    attemptCount: attemptIndex,
    fallbackCount,
    completedProvider: concluiu ? ((vencedor?.provider ?? provider) as AiProviderId) : null,
    completedModel: concluiu ? (vencedor?.model.id ?? model.id) : null,
  });

  /** O que toda trilha recebe deste run: alvos, prazo, sinal, contadores e a reserva. */
  const doRun = {
    alvos,
    config: { timeoutMs: config.timeoutMs, maxRetries: config.maxRetries },
    fallbackLigado,
    contadores,
    prazo,
    agoraMs,
    abortSignal: input.abortSignal,
    hoje,
    reservaRestante: () => Math.max(0, reserva.valorUsd - custoAcumulado),
    aoGastar: (usd: number) => {
      custoAcumulado += usd;
    },
  };

  try {
    /**
     * ╔════════════════════════════════════════════════════════════════════════════════════╗
     * ║ 18-F Bloco 4 — O LAÇO DIRIGIDO PELO SERVIDOR.                                       ║
     * ║                                                                                     ║
     * ║ Roda DEPOIS da admissão porque cada chamada precisa de `run_id` e de `step_id`:     ║
     * ║ `ai_tool_calls.step_id` é NOT NULL, e "sem trilha, sem leitura" (18-B) vale aqui    ║
     * ║ igual. Roda ANTES da chamada ao modelo porque o modelo não vai pedir nada — ele     ║
     * ║ recebe o resultado pronto e só redige.                                              ║
     * ║                                                                                     ║
     * ║ ⛔ `executeTool` é o MESMO do chat: guard, Zod do adapter, timeout do descriptor,   ║
     * ║ poda por `maxRecords` + envelope, e linha em `ai_tool_calls`. NENHUMA PORTA NOVA.   ║
     * ║                                                                                     ║
     * ║ ⛔ E `MAX_TOOL_STEPS` não se aplica aqui — quem decide o tamanho da lista é o        ║
     * ║ catálogo, validado contra `MAX_FERRAMENTAS_POR_EXPERIENCIA` em teste, e é sobre     ║
     * ║ ESSE número que `computeReservation` reservou lá em cima.                           ║
     * ╚════════════════════════════════════════════════════════════════════════════════════╝
     */
    if (input.plano && preparo.doPlano && input.plano.leituras.length > 0) {
      const stepId = await startStep({
        runId: run.runId,
        userId: input.userId,
        stepIndex: proximoStepIndex(),
        kind: "ferramentas",
      });

      if (!stepId) {
        // Sem trilha, sem leitura — e um panorama sem leitura nenhuma não é um panorama. No
        // chat isto vira um aviso e a resposta segue; aqui encerra, porque a resposta inteira
        // seria escrita sobre nada.
        const erro = aiError(
          "ERRO_PERMANENTE",
          "ATTEMPT_NOT_RECORDED",
          "Não foi possível registrar as consultas deste panorama. Nenhuma leitura foi feita.",
        );
        await failRun(contexto(), erro);
        fechado = true;
        yield { type: "error", code: erro.code, message: safeUserMessage(erro) };
        return;
      }

      const allowedTools = input.plano.leituras.map((l) => l.toolName);
      const inicioFerramentas = Date.now();
      const resultados = await Promise.all(
        input.plano.leituras.map((l, i) =>
          executeTool(
            {
              runId: run.runId,
              conversationId: run.conversationId,
              userId: input.userId,
              stepId,
              agent: { id: preparo.agentId, allowedTools },
              permissions: prefs.permissions,
              writePermissions: prefs.writePermissions,
            },
            // ⚠️ `callId` é NOSSO: não houve provedor pedindo nada. Determinístico, para a
            // trilha poder ser lida na ordem do catálogo.
            {
              callId: `experiencia:${input.plano!.id}:${i}`,
              toolName: l.toolName,
              input: l.input,
            },
          ),
        ),
      );

      await closeStep({
        runId: run.runId,
        stepId,
        userId: input.userId,
        status: "completed",
        durationMs: Date.now() - inicioFerramentas,
      });

      const blocos: string[] = [];
      const rotulosQueFalharam: string[] = [];
      for (const [i, r] of resultados.entries()) {
        // A tela mostra o que foi consultado — leitura nunca acontece em silêncio (18-B).
        yield {
          type: "tool",
          toolName: r.toolName,
          status: r.status,
          registros: r.recordsRead,
        };
        /**
         * ⛔ QUALQUER DESFECHO QUE NÃO SEJA `executada` É DADO QUE NÃO CHEGOU.
         *
         * `rejeitada` entra aqui junto com `falhou`/`timeout` de propósito: a chave pode ter
         * sido desligada ENTRE `decidirLeituras` e a execução, e nesse caso o guard recusa —
         * um pulo que a frase do plano, decidida antes, não tem como conhecer.
         */
        if (r.status !== "executada") {
          rotulosQueFalharam.push(input.plano.leituras[i]!.rotulo);
        }
        blocos.push(renderUntrusted(r.block));
      }
      avisoDeFalhas = avisoDeLeiturasQueFalharam(rotulosQueFalharam);

      /**
       * ⛔ PAPEL `user`, NUNCA `system` E NUNCA `tool`.
       *
       * `renderUntrusted` declara no próprio docblock que é "o texto que vai na mensagem de
       * papel `user`" — o aviso de bloco não confiável vem ANTES do conteúdo, e instrução que
       * venha dentro do dado é conteúdo relatado, nunca ordem. E `tool-result` sem um
       * `tool-call` correspondente é 400 na Anthropic, porque não houve pedido nenhum.
       */
      if (blocos.length > 0) {
        preparo.doPlano.mensagens.push({ role: "user", content: blocos.join("\n\n") });
      }
    }

    /**
     * ╔════════════════════════════════════════════════════════════════════════════════════╗
     * ║ A FONTE DOS EVENTOS — o plano é UMA trilha (a 0); o chat é o COORDENADOR, que       ║
     * ║ conduz a decisão e, se for o caso, o especialista. Este arquivo continua dono do    ║
     * ║ resto: o texto público, o heartbeat, a persistência e o FECHAMENTO do run. Nenhuma  ║
     * ║ trilha e nenhum coordenador fecham run — eles devolvem um desfecho.                 ║
     * ╚════════════════════════════════════════════════════════════════════════════════════╝
     */
    const fonte: AsyncGenerator<ChatRunnerEvent, DesfechoDaFonte> =
      input.plano && preparo.doPlano
        ? eventosDaTrilha(
            runTrilha({
              ...doRun,
              run: { runId: run.runId, conversationId: run.conversationId, userId: input.userId },
              trilha: 0,
              agente: {
                id: preparo.agentId,
                allowedTools: input.plano.leituras.map((l) => l.toolName),
              },
              promptVersion: preparo.promptVersion,
              system: preparo.doPlano.system,
              mensagens: preparo.doPlano.mensagens,
              // ⛔ 18-F Bloco 4 — NUM PANORAMA O MODELO NÃO RECEBE FERRAMENTA NENHUMA. As
              // leituras já aconteceram; ele só redige. Se ainda assim ele pedir uma, a lista
              // está vazia → `tool-call-inesperada` → o run fecha como falha.
              definicoes: [],
              modo: "laco",
              repetir: true,
              // Sem teto próprio: cada alvo usa o teto do SEU modelo, como sempre foi.
              tetoDeSaida: Number.POSITIVE_INFINITY,
              primeiroTipo: "PRIMARY",
              permissions: prefs.permissions,
              writePermissions: prefs.writePermissions,
              promptMontado: preparo.doPlano.promptMontado,
            }),
            0,
            { reter: false },
          )
        : conduzirCoordenador({
            ...doRun,
            run: {
              runId: run.runId,
              conversationId: run.conversationId,
              userId: input.userId,
              assistantMessageId: run.assistantMessageId,
            },
            texto: input.text,
            historico: preparo.historico,
            prefs,
            memorias,
            agora: input.agora,
          });

    /**
     * ⚠️ `next()` à mão, e não `for await`: o `for await` descarta o valor de retorno do
     * gerador, e o DESFECHO é justamente o valor de retorno. O preço é fechar a fonte à mão
     * quando ESTE gerador é abandonado — o `finally` abaixo faz o que o `for await` faria, e é
     * ele que leva o `return()` do navegador até o `finally` de cada trilha (que fecha a
     * tentativa aberta antes de o run ser fechado aqui).
     */
    let desfecho: DesfechoDaFonte | null = null;
    try {
      for (;;) {
        const passo = await fonte.next();
        if (passo.done) {
          desfecho = passo.value;
          break;
        }
        const evento = passo.value;

        if (evento.type === "delta") {
          if (texto === "") await markStreaming(run.runId, input.userId);
          texto += evento.text;
          yield evento;

          // Heartbeat + persistência periódicos. Nunca por token: um stream rápido
          // escreveria centenas de UPDATEs por segundo.
          const agoraDoHeartbeat = Date.now();
          if (agoraDoHeartbeat - ultimoHeartbeat >= HEARTBEAT_INTERVAL_MS) {
            ultimoHeartbeat = agoraDoHeartbeat;
            await heartbeatAndPersist(
              run.runId,
              input.userId,
              run.assistantMessageId,
              texto,
            );
          }
          continue;
        }

        if (evento.type === "switch") {
          // Tentativa nova começa com o texto zerado — o quadro em `runTrilha` explica por
          // quê, e a tela faz o mesmo ao receber este evento (invariante 23).
          texto = "";
          yield evento;
          continue;
        }

        // `tool`, `proposta` e `especialista` passam como vieram.
        yield evento;
      }
    } finally {
      if (desfecho === null) {
        await fonte.return({
          ok: false,
          erro: aiError("CANCELADO_PELO_USUARIO", "CANCELLED"),
          cancelado: true,
        });
      }
    }

    // ── Cancelamento do usuário (ou queda do cliente, que é idêntica) ───────────────────
    if (!desfecho.ok && desfecho.cancelado) {
      await cancelRun(contexto(), "Cancelado pelo usuário ou queda da conexão.");
      fechado = true;
      return;
    }

    // ── Falha ──────────────────────────────────────────────────────────────────────────
    if (!desfecho.ok) {
      const { erro, motivo } = desfecho;
      await failRun(contexto(), erro);
      fechado = true;
      yield {
        type: "error",
        code: erro.code,
        message: motivo ? `${safeUserMessage(erro)} ${motivo}`.trim() : safeUserMessage(erro),
      };
      return;
    }

    // ── Sucesso ────────────────────────────────────────────────────────────────────────
    vencedor = desfecho.alvo;
    /**
     * ╔════════════════════════════════════════════════════════════════════════════════════╗
     * ║ 18-F Bloco 4 — O QUE FICOU DE FORA ENTRA NO TEXTO GRAVADO, E É TEXTO NOSSO.         ║
     * ║                                                                                     ║
     * ║ Pedir ao modelo "diga o que ficou de fora" é a mesma família de erro que a 18-E     ║
     * ║ resolveu tirando os números do texto: ele obedece quase sempre, e "quase            ║
     * ║ sempre" num panorama diário é uma omissão por mês.                                  ║
     * ║                                                                                     ║
     * ║ ⚠️ NO FIM, e não no começo: tentativa nova ZERA `texto` (invariante 23), e um aviso ║
     * ║ escrito antes do modelo sumiria no primeiro retry. Aqui ele acompanha a resposta    ║
     * ║ que de fato venceu.                                                                 ║
     * ╚════════════════════════════════════════════════════════════════════════════════════╝
     */
    for (const frase of [input.plano?.aviso ?? "", avisoDeFalhas]) {
      if (!frase) continue;
      const trecho = texto === "" ? frase : `\n\n${frase}`;
      texto += trecho;
      yield { type: "delta", text: trecho };
    }
    await completeRun(contexto(true));
    fechado = true;
    yield {
      type: "done",
      finishReason: desfecho.finishReason,
      provider: desfecho.alvo.provider,
      model: desfecho.alvo.model.id,
    };
  } finally {
    // Rede de segurança: se saímos por `return()` do consumidor (o navegador fechou a aba),
    // o run não pode ficar aberto prendendo orçamento. O UPDATE é condicional, então se
    // alguém já fechou, isto é no-op.
    //
    // ⛔ MOD-ia-005 — a TENTATIVA aberta já fechou antes daqui, como `cancelled`: o `finally`
    // do consumo da trilha leva o `return()` até o `finally` de `runTrilha`.
    //
    // ⚠️ O run fecha `cancelled` TAMBÉM numa exceção inesperada (o `markStreaming` ou o
    // heartbeat lançando, por exemplo), porque este `finally` não distingue os dois casos e
    // a exceção sobe ao Route Handler logo depois. A tentativa, não: exceção de DENTRO da
    // trilha fecha a tentativa como `failed` (`runTrilha`, ramo `catch`).
    if (!fechado) {
      await cancelRun(contexto(), "Conexão encerrada antes da conclusão.").catch(() => {});
    }
  }
}

/**
 * 18-F Bloco 4 — a união das seleções de memória de um panorama, sem repetir.
 *
 * Um panorama lê vários módulos, e `memoriasParaOPrompt` (Bloco 3) decide para UM módulo por
 * vez. Chamá-la uma vez por módulo — mais uma com `null`, que alcança as globais — preserva
 * o filtro dela INTACTO: cada memória de módulo continua exigindo a `allow_*` daquele módulo
 * (invariante 26). A dedupe é por `id` porque as globais voltam em toda chamada.
 *
 * ⛔ Reescrever aquele filtro aqui, para aceitar uma lista de módulos, seria a segunda
 * implementação que diverge no primeiro campo novo.
 */
function unirMemorias(
  listas: readonly (readonly MemoriaParaPrompt[])[],
): readonly MemoriaParaPrompt[] {
  const vistas = new Set<string>();
  const saida: MemoriaParaPrompt[] = [];
  for (const lista of listas) {
    for (const m of lista) {
      if (vistas.has(m.id)) continue;
      vistas.add(m.id);
      saida.push(m);
    }
  }
  return saida;
}

/** Título provisório da conversa nova: as primeiras palavras da pergunta. */
function tituloProvisorio(texto: string): string {
  const limpo = texto.replace(/\s+/g, " ").trim();
  return limpo.length <= 60 ? limpo : `${limpo.slice(0, 59)}…`;
}
