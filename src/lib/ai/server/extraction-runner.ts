import "server-only";

/**
 * Fase 18-D · Bloco 3c — IA · O PROCESSO 2 do desenho: o arquivo sai, o modelo lê, o
 * servidor duvida.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ⛔ ESTE É O ÚNICO ARQUIVO DO SISTEMA QUE MANDA UM DOCUMENTO DO DONO PARA FORA.        ║
 * ║                                                                                       ║
 * ║ É a primeira vez, em todo o projeto, que o pior caso de um defeito não é reversível   ║
 * ║ dentro do sistema: nenhum `undo`, nenhum Approval Engine e nenhuma FK composta         ║
 * ║ alcançam um arquivo já transmitido. Por isso a ordem abaixo não é estilo — cada passo  ║
 * ║ existe porque o anterior o torna possível, e a chamada externa é a ÚLTIMA coisa.       ║
 * ║                                                                                       ║
 * ║  1. cripto pronta?        → sem keyring, nenhuma credencial é aberta                  ║
 * ║  2. o documento é dele?   → e é de uma espécie que sabemos mandar                     ║
 * ║  3. rota de VISÃO         → modelo sem `visao` verificada não é elegível              ║
 * ║  4. reserva COM o arquivo → `estimarTokensDoArquivo` entra em `computeReservation`    ║
 * ║  5. admissão atômica      → COMMITA aqui; e é aqui que as três chaves são conferidas  ║
 * ║     …                       pelo BANCO, além de na Server Action                       ║
 * ║  6. bytes lidos do bucket → e o MIME reconferido sobre eles                           ║
 * ║  7. tentativas            → cada uma é uma linha própria em `ai_usage_events`         ║
 * ║  8. Zod `.strict()`       → o "structured output" do provedor é conveniência, não     ║
 * ║     …                       validação                                                  ║
 * ║  9. REBAIXAMENTO          → `avaliarExtracao`, puro, `hoje` injetado                  ║
 * ║ 10. `ai_document_extractions` + fechamento do run                                     ║
 * ║                                                                                       ║
 * ║ ⛔ NENHUM REGISTRO DO DONO É TOCADO AQUI. Este arquivo não importa `approval/`, não    ║
 * ║ importa serviço de módulo nenhum e não conhece `lancarTransacao`. Quem propõe é o      ║
 * ║ Processo 3, depois de o dono revisar campo a campo.                                    ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * ⛔ **SEM LAÇO DE FERRAMENTAS, E A AUSÊNCIA É ESTRUTURAL.** `AiObjectRequest` não tem campo
 * `tools` (`core/contracts.ts`), então não existe caminho para uma ferramenta nascer dentro
 * de uma extração — nem por engano, nem por refactor. `maxToolSteps` é 0 na reserva pelo
 * mesmo motivo: reservar passos que não podem acontecer prenderia orçamento à toa.
 */

import type { AiProviderId, AiUsage } from "@/lib/ai/core/contracts";
import { aiError, type AiError } from "@/lib/ai/core/errors";
import type { AiCapability } from "@/lib/ai/core/capabilities";
import { decideFallback } from "@/lib/ai/core/fallback";
import type { AiModelEntry } from "@/lib/ai/core/models";
import { type AiRate, PRICING_VERSION, rateFor } from "@/lib/ai/core/pricing";
import { routeRequest } from "@/lib/ai/core/router";
import { safeUserMessage } from "@/lib/ai/security/redact";
import { computeAttemptCost } from "@/lib/ai/usage/meter";
import {
  computeReservation,
  estimarTokensDeEntrada,
  projetarCustoDoDestino,
  RESERVA_TTL_SEGUNDOS,
} from "@/lib/ai/usage/reservation";
import { estimarTokensDoArquivo } from "@/lib/ai/usage/vision-tokens";
import { createProviderClient } from "@/lib/ai/providers/provider-factory";
import { getAiPreferences, getRouterConfigs } from "@/lib/ai/queries";
import { avaliarExtracao } from "@/lib/ai/vision/confidence";
import type { ExtracaoDeComprovante } from "@/lib/ai/vision/contracts";
import { especieDoMime, type EspecieDeArquivo } from "@/lib/ai/vision/limits";
import {
  EXTRACTION_SYSTEM_PROMPT,
  montarMensagemDaExtracao,
  versaoDoPromptDeExtracao,
} from "@/lib/ai/vision/prompt";
import {
  DESCRICAO_DO_SCHEMA,
  EXTRACAO_JSON_SCHEMA,
  extracaoDoModeloSchema,
  NOME_DO_SCHEMA,
  VERSAO_DO_SCHEMA,
} from "@/lib/ai/vision/schema";
import { createClient } from "@/lib/supabase/server";
import { dateInSaoPaulo } from "@/lib/format";
import type { Json } from "@/types/supabase";
import { AI_CRYPTO_NOT_CONFIGURED, getCryptoReadiness } from "./crypto-readiness";
import { resolveApiKey } from "./credential-store";
import { lerBytesDoDocumento, lerDocumentoParaExtracao } from "./document-store";
import {
  beginExtractionRun,
  closeAttempt,
  completeRun,
  failRun,
  MENSAGEM_ADMISSAO,
  startAttempt,
  type AttemptType,
} from "./run-store";

/**
 * ⛔ O AGENTE É FIXO, E O RPC O FIXA DE NOVO NO BANCO.
 *
 * Uma extração não tem agente escolhível. A constante existe para a trilha nomear a espécie
 * de run; ela **não** é parâmetro do RPC — recebê-la do cliente daria a ele um campo que não
 * usa para nada, mas que apareceria na auditoria como se fosse uma escolha dele.
 */
export const AGENTE_DA_EXTRACAO = "documento.comprovante";

/**
 * As capacidades EXIGIDAS do modelo, por espécie de arquivo.
 *
 * ⛔ `visao` vale para os dois: a Anthropic processa PDF renderizando as páginas como
 * imagens, então um modelo que aceita arquivo mas não enxerga não serve de nada aqui.
 * `saida_estruturada` é o que separa esta chamada de um chat — sem ela a resposta volta como
 * texto e a validação `.strict()` recusaria tudo, depois de já ter sido paga.
 *
 * `hasRate` entra por dentro de `eligibleModel`: modelo sem tarifa não é selecionável, aqui
 * como em toda parte (sem preço não há reserva, e sem reserva o orçamento não protege nada).
 */
export function capacidadesExigidas(
  especie: EspecieDeArquivo,
): readonly AiCapability[] {
  return especie === "pdf"
    ? ["visao", "arquivo", "saida_estruturada"]
    : ["visao", "saida_estruturada"];
}

export type ExtractionRunnerInput = {
  readonly userId: string;
  readonly documentoId: string;
  /** Injetado. Nenhum `Date.now()` decide data nem prazo neste módulo. */
  readonly agora: Date;
  readonly abortSignal?: AbortSignal;
};

export type ExtractionRunnerResult =
  | {
      readonly ok: true;
      readonly runId: string;
      readonly extractionId: string;
      readonly extracao: ExtracaoDeComprovante;
    }
  | {
      readonly ok: false;
      readonly code: string;
      readonly message: string;
      /**
       * O id da tentativa de leitura, quando ela chegou a virar linha. A tela mostra
       * "a leitura falhou" a partir dela — uma falha que não deixa rastro é indistinguível
       * de um botão que não fez nada.
       */
      readonly extractionId: string | null;
    };

function erro(
  code: string,
  message: string,
  extractionId: string | null = null,
): ExtractionRunnerResult {
  return { ok: false, code, message, extractionId };
}

/**
 * Grava a tentativa de leitura. `campos` é NOT NULL no banco, e numa falha ele é `{}` — não
 * uma extração de campos vazios.
 *
 * ⚠️ A diferença importa: um objeto com sete campos `nao_identificado` seria uma LEITURA que
 * não achou nada, e a tela a mostraria como tal. `{}` com `status = 'falhou'` é o que de fato
 * aconteceu — não houve leitura. O CHECK `ai_document_extractions_erro_coerente` obriga a
 * falha a dizer por quê, então o estado "falhou sem motivo" não é representável.
 */
async function gravarExtracao(entrada: {
  readonly userId: string;
  readonly documentoId: string;
  readonly runId: string;
  readonly campos: Json;
  readonly status: "extraida" | "falhou";
  readonly erroCodigo?: string | null;
  readonly erroMensagem?: string | null;
}): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ai_document_extractions")
    .insert({
      user_id: entrada.userId,
      document_id: entrada.documentoId,
      run_id: entrada.runId,
      schema_version: VERSAO_DO_SCHEMA,
      status: entrada.status,
      campos: entrada.campos,
      erro_codigo: entrada.erroCodigo ?? null,
      // Já sanitizada por quem chama (`safeUserMessage`). Nunca corpo de resposta do
      // provedor, nunca stack, nunca nome de tabela.
      erro_mensagem: entrada.erroMensagem ?? null,
    })
    .select("id")
    .single();

  if (error || !data) return null;
  return data.id;
}

type Alvo = { readonly provider: AiProviderId; readonly model: AiModelEntry };

/** `PRIMARY` na primeira; `RETRY` quando repete provedor E modelo; `FALLBACK` quando muda. */
function tipoDaTentativa(
  attemptIndex: number,
  anterior: Alvo | null,
  atual: Alvo,
): AttemptType {
  if (attemptIndex === 1 || anterior === null) return "PRIMARY";
  const mesmo =
    anterior.provider === atual.provider && anterior.model.id === atual.model.id;
  return mesmo ? "RETRY" : "FALLBACK";
}

export async function runExtraction(
  input: ExtractionRunnerInput,
): Promise<ExtractionRunnerResult> {
  // ── 1. Cripto pronta? ───────────────────────────────────────────────────────────────
  const readiness = getCryptoReadiness();
  if (!readiness.ready) {
    return erro(AI_CRYPTO_NOT_CONFIGURED, readiness.message);
  }

  const supabase = await createClient();

  // ── 2. O documento é dele, e é de uma espécie que sabemos mandar ────────────────────
  const documento = await lerDocumentoParaExtracao(
    supabase,
    input.userId,
    input.documentoId,
  );
  if (!documento) {
    return erro(
      "AI_DOCUMENT_NOT_AVAILABLE",
      MENSAGEM_ADMISSAO.AI_DOCUMENT_NOT_AVAILABLE,
    );
  }

  const especie = especieDoMime(documento.mime);
  const hoje = dateInSaoPaulo(input.agora);

  const [configs, prefs] = await Promise.all([
    getRouterConfigs(input.userId),
    getAiPreferences(input.userId),
  ]);

  // ── 3. A rota de VISÃO ──────────────────────────────────────────────────────────────
  //
  // O modelo de visão configurado pelo dono tem precedência: `visionModel` já entra em
  // `configuredModelIds`, e `modelPreference` o coloca em PRIMEIRO na ordem de tentativa.
  // Sem isso, um `defaultModel` de texto seria testado antes e a rota escolheria o segundo
  // elegível — funcionaria, e usaria um modelo que não é o que ele escolheu para imagens.
  const configDoProvedorPadrao = configs.find(
    (c) => c.provider === prefs.defaultProvider,
  );
  const rota = routeRequest({
    configs,
    defaultProvider: prefs.defaultProvider,
    defaultModel: prefs.defaultModel,
    modelPreference: configDoProvedorPadrao?.visionModel ?? null,
    requiredCapabilities: capacidadesExigidas(especie),
    hoje,
  });

  if (!rota.ok) {
    return erro(rota.error.code, safeUserMessage(rota.error));
  }

  const { provider, model, config, fallbackChain } = rota.value;

  const fallbackLigado = config.fallbackAllowed && prefs.allowFallback;
  const alvos: Alvo[] = [
    { provider, model },
    ...(fallbackLigado ? fallbackChain : []),
  ];

  const tarifas: AiRate[] = [];
  for (const alvo of alvos) {
    const r = rateFor(alvo.provider, alvo.model.id, hoje);
    if (r) tarifas.push(r);
  }
  if (tarifas.length === 0) {
    return erro(
      "MODEL_WITHOUT_RATE",
      "O modelo escolhido não tem tarifa cadastrada e por isso não pode ser usado.",
    );
  }

  // ── 4. A RESERVA, COM O CUSTO DO ARQUIVO ────────────────────────────────────────────
  //
  // ╔══════════════════════════════════════════════════════════════════════════════════╗
  // ║ ⛔ ESTA É A LIGAÇÃO MAIS FÁCIL DE PERDER DA SUBFASE INTEIRA, E O SISTEMA NÃO       ║
  // ║ RECLAMARIA SE ELA SUMISSE.                                                        ║
  // ║                                                                                   ║
  // ║ `estimarTokensDeEntrada` conta CARACTERES do prompt montado, e `core/text.ts`      ║
  // ║ devolve `""` para uma parte `image`/`file` — de propósito, para o arquivo não ser  ║
  // ║ contado duas vezes. As duas metades da decisão moram em arquivos diferentes: sem   ║
  // ║ `tokensDeArquivos`, a reserva seria a de um prompt de ~2 KB de texto para uma      ║
  // ║ chamada que pode custar dezenas de milhares de tokens de entrada — e o orçamento   ║
  // ║ deixaria passar, em silêncio, exatamente a chamada que ele existe para barrar.     ║
  // ╚══════════════════════════════════════════════════════════════════════════════════╝
  const arquivo = estimarTokensDoArquivo(
    especie === "pdf"
      ? { especie: "pdf", paginas: documento.paginas }
      : {
          especie: "imagem",
          larguraPx: documento.larguraPx,
          alturaPx: documento.alturaPx,
        },
  );

  const tokensDeTexto = estimarTokensDeEntrada(
    EXTRACTION_SYSTEM_PROMPT +
      JSON.stringify(EXTRACAO_JSON_SCHEMA) +
      (documento.observacao ?? ""),
  );

  const reserva = computeReservation({
    rates: tarifas,
    tokensEntradaEstimados: tokensDeTexto,
    tokensDeArquivos: arquivo.tokens,
    // O teto do modelo PRIMÁRIO, como no chat: a tarifa usada já é a do mais caro da cadeia,
    // e os tetos do catálogo são iguais entre os modelos de visão.
    tetoDeSaida: model.outputCapTokens,
    maxRetries: config.maxRetries,
    maxFallbacks: Math.max(0, alvos.length - 1),
    margem: prefs.reservationMargin,
    // ⛔ ZERO, e não por omissão: uma extração não tem laço de ferramentas, e o tipo da
    // requisição não tem como carregar uma.
    maxToolSteps: 0,
  });

  // ── 5. ADMISSÃO ATÔMICA ─────────────────────────────────────────────────────────────
  //
  // É aqui que as TRÊS chaves (`allow_vision` + `allow_finance` + `allow_write_finance`) são
  // conferidas pelo BANCO — além de na Server Action. Um usuário autenticado pode chamar o
  // RPC direto, e a Server Action não é a última barreira de nada.
  const admissao = await beginExtractionRun({
    documentId: documento.id,
    promptVersion: versaoDoPromptDeExtracao(),
    provider,
    model: model.id,
    reservedCost: reserva.valorUsd,
    reservationRateVersion: PRICING_VERSION,
    reservationTtlSeconds: RESERVA_TTL_SEGUNDOS,
  });

  if (!admissao.ok) {
    return erro(admissao.code, MENSAGEM_ADMISSAO[admissao.code]);
  }

  const runId = admissao.value.runId;
  const inicioMs = Date.now();

  let attemptIndex = 0;
  let retriesUsed = 0;
  let fallbackCount = 0;
  let alvoIdx = 0;
  let alvoAnterior: Alvo | null = null;
  let custoAcumulado = 0;

  const contexto = (concluiu = false) => ({
    runId,
    userId: input.userId,
    // Run de extração não tem mensagem de assistente. Ver `FecharInput`.
    assistantMessageId: null,
    textoFinal: "",
    startedAtMs: inicioMs,
    attemptCount: attemptIndex,
    fallbackCount,
    completedProvider: concluiu
      ? ((alvoAnterior?.provider ?? provider) as AiProviderId)
      : null,
    completedModel: concluiu ? (alvoAnterior?.model.id ?? model.id) : null,
  });

  /** Fecha o run como falho, registra a tentativa de leitura e devolve a recusa. */
  const desistir = async (e: AiError): Promise<ExtractionRunnerResult> => {
    await failRun(contexto(), e);
    const mensagem = safeUserMessage(e);
    const extractionId = await gravarExtracao({
      userId: input.userId,
      documentoId: documento.id,
      runId,
      campos: {},
      status: "falhou",
      erroCodigo: e.code,
      erroMensagem: mensagem,
    });
    return erro(e.code, mensagem, extractionId);
  };

  // ── 6. OS BYTES — lidos UMA vez, depois da admissão ────────────────────────────────
  //
  // Depois da admissão porque baixar 10 MB para descobrir que o orçamento estourou é pagar
  // tráfego por uma chamada que não vai acontecer. Uma vez só porque retry e fallback usam
  // o MESMO arquivo — relê-lo por tentativa não mudaria nada e multiplicaria o download.
  //
  // ⚠️ `lerBytesDoDocumento` RECONFERE o MIME sobre os bytes que voltaram do bucket. Se a
  // coluna e o conteúdo divergirem, ele devolve `null` — e nada sai daqui.
  const arquivoLido = await lerBytesDoDocumento(
    supabase,
    input.userId,
    input.documentoId,
  );
  if (!arquivoLido) {
    return desistir(
      aiError(
        "ERRO_PERMANENTE",
        "DOCUMENT_UNREADABLE",
        "Não foi possível ler o arquivo enviado. Ele pode ter sido removido — envie de novo.",
      ),
    );
  }

  const mensagens = montarMensagemDaExtracao({
    bytes: arquivoLido.bytes,
    mime: arquivoLido.mime,
    observacao: documento.observacao,
  });

  // ── 7. Tentativas ──────────────────────────────────────────────────────────────────
  while (alvoIdx < alvos.length) {
    const alvo = alvos[alvoIdx];
    const tarifa = rateFor(alvo.provider, alvo.model.id, hoje);
    if (!tarifa) {
      alvoIdx += 1;
      continue;
    }

    attemptIndex += 1;
    const tipo = tipoDaTentativa(attemptIndex, alvoAnterior, alvo);
    if (tipo === "FALLBACK") fallbackCount += 1;

    const tentativa = await startAttempt({
      runId,
      userId: input.userId,
      conversationId: null,
      agentId: AGENTE_DA_EXTRACAO,
      attemptIndex,
      attemptType: tipo,
      provider: alvo.provider,
      modelId: alvo.model.id,
      rate: tarifa,
    });

    if (!tentativa) {
      return desistir(
        aiError(
          "ERRO_PERMANENTE",
          "ATTEMPT_NOT_RECORDED",
          "Não foi possível registrar a execução. Nenhuma chamada foi feita.",
        ),
      );
    }

    alvoAnterior = alvo;

    // A credencial é decifrada AQUI, no instante da chamada, para UMA chamada.
    const chave = await resolveApiKey(input.userId, alvo.provider);
    if (!chave.ok) {
      await closeAttempt({
        attemptId: tentativa.id,
        userId: input.userId,
        status: "failed",
        usage: null,
        rate: tarifa,
        latencyMs: 0,
        providerRequestId: null,
        errorCode: chave.error.code,
      });
      return desistir(chave.error);
    }

    const inicioTentativa = Date.now();
    const client = createProviderClient(alvo.provider, chave.value);

    // ⛔ A ÚNICA CHAMADA EXTERNA DE TODA A SUBFASE. Sem streaming, sem ferramentas.
    const resposta = await client.generateObject({
      model: alvo.model.id,
      system: EXTRACTION_SYSTEM_PROMPT,
      messages: mensagens,
      maxOutputTokens: alvo.model.outputCapTokens,
      // Extração não é criação: queremos a leitura mais provável, não uma variação dela.
      temperature: 0,
      timeoutMs: config.timeoutMs,
      abortSignal: input.abortSignal,
      schema: EXTRACAO_JSON_SCHEMA,
      schemaName: NOME_DO_SCHEMA,
      schemaDescription: DESCRICAO_DO_SCHEMA,
    });

    const usoDaTentativa: AiUsage = resposta.usage;
    const fecharTentativa = async (
      status: "completed" | "failed" | "cancelled",
      errorCode: string | null,
    ) => {
      await closeAttempt({
        attemptId: tentativa.id,
        userId: input.userId,
        status,
        usage: usoDaTentativa,
        rate: tarifa,
        latencyMs: Date.now() - inicioTentativa,
        providerRequestId: resposta.providerRequestId,
        errorCode,
      });
      const parcial = computeAttemptCost(usoDaTentativa, tarifa);
      if (parcial.totalUsd !== null) custoAcumulado += parcial.totalUsd;
    };

    // ── 8. O NOSSO Zod. O "structured output" do provedor é conveniência, nunca validação ──
    let erroDaTentativa: AiError | null = resposta.ok ? null : resposta.error;
    let extracao: ExtracaoDeComprovante | null = null;

    if (resposta.ok) {
      const validada = extracaoDoModeloSchema.safeParse(resposta.value);
      if (validada.success) {
        // ── 9. O REBAIXAMENTO. `hoje` injetado, regras puras, e nenhuma promove. ──
        extracao = avaliarExtracao(validada.data, hoje);
      } else {
        /**
         * ⚠️ Resposta fora da forma é ERRO_TEMPORARIO de propósito — e não porque seja
         * "leve". É a classe que autoriza `decideFallback` a repetir ou trocar de modelo, e
         * uma segunda tentativa de fato costuma voltar bem-formada. Classificá-la como
         * permanente desperdiçaria o fallback que o dono autorizou e pagou reserva para ter.
         *
         * A mensagem do Zod NÃO entra: ela cita nomes de campo do nosso schema.
         */
        erroDaTentativa = aiError(
          "ERRO_TEMPORARIO",
          "EXTRACTION_SCHEMA_INVALID",
          "A leitura voltou fora do formato esperado.",
        );
      }
    }

    if (extracao) {
      await fecharTentativa("completed", null);
      await completeRun(contexto(true));

      const extractionId = await gravarExtracao({
        userId: input.userId,
        documentoId: documento.id,
        runId,
        // O que vai para a coluna é a extração JÁ REBAIXADA — nunca a saída crua do modelo.
        // A tela de revisão lê daqui, e ela precisa ler o que o servidor concluiu.
        campos: extracao as unknown as Json,
        status: "extraida",
      });

      if (!extractionId) {
        return erro(
          "EXTRACTION_NOT_RECORDED",
          "A leitura foi feita, mas não foi possível registrá-la. Tente extrair de novo.",
        );
      }

      return { ok: true, runId, extractionId, extracao };
    }

    // ── Falha da tentativa ──
    const e =
      erroDaTentativa ??
      aiError("ERRO_TEMPORARIO", "NO_RESULT", "A leitura terminou sem resultado.");

    await fecharTentativa(
      e.class === "CANCELADO_PELO_USUARIO" ? "cancelled" : "failed",
      e.code,
    );

    if (input.abortSignal?.aborted) {
      return desistir(
        aiError("CANCELADO_PELO_USUARIO", "EXTRACTION_ABORTED", "A leitura foi interrompida."),
      );
    }

    const proximoAlvo = alvos[alvoIdx + 1];
    const tarifaProximo = proximoAlvo
      ? rateFor(proximoAlvo.provider, proximoAlvo.model.id, hoje)
      : null;
    const custoProjetado =
      tarifaProximo && proximoAlvo
        ? projetarCustoDoDestino(
            tarifaProximo,
            // O arquivo entra na projeção também: um destino "barato" por token continua
            // caro quando a entrada é uma foto de 12 MP.
            tokensDeTexto + arquivo.tokens,
            proximoAlvo.model.outputCapTokens,
          )
        : Number.POSITIVE_INFINITY;

    const veredito = decideFallback({
      errorClass: e.class,
      fallbackAllowed: fallbackLigado,
      fallbackTargetsLeft: alvos.length - (alvoIdx + 1),
      retriesUsed,
      maxRetries: config.maxRetries,
      reservaRestante: Math.max(0, reserva.valorUsd - custoAcumulado),
      custoProjetadoDoDestino: custoProjetado,
    });

    if (veredito.kind === "retry") {
      retriesUsed += 1;
      continue;
    }
    if (veredito.kind === "fallback") {
      alvoIdx += 1;
      continue;
    }

    return desistir(e);
  }

  return desistir(
    aiError(
      "ERRO_PERMANENTE",
      "NO_TARGET_SUCCEEDED",
      "Nenhum provedor autorizado conseguiu ler este comprovante.",
    ),
  );
}
