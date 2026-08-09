/**
 * Fase 18-A — IA · Catálogo estático de modelos.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ MODELO FORA DESTE ARQUIVO NÃO EXISTE. O router recusa antes de qualquer chamada, e a  ║
 * ║ função `ai_begin_chat_run` recusa de novo no banco — porque um usuário autenticado    ║
 * ║ pode chamar o RPC direto, sem passar pelo Route Handler.                               ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * ═══════════════════════ HONESTIDADE SOBRE O QUE FOI VERIFICADO ═══════════════════════
 *
 * `verifiedAt` + `verificationSource` são por ENTRADA, não do arquivo: cada linha declara
 * onde e quando foi conferida. Um catálogo que envelhece em silêncio é pior que catálogo
 * nenhum, porque parece confiável. `isCatalogStale()` faz a tela avisar.
 *
 * `contextWindow: null` significa **não verificado**, não "ilimitado". A documentação
 * consultada em 2026-08-04 não trazia esse número para todos os modelos, e inventá-lo seria
 * exatamente o que a regra "nenhum valor é inventado" proíbe. Nada na 18-A decide com base
 * nele — janela estourada chega como erro CONTEXTO_EXCEDIDO do próprio provedor.
 *
 * `outputCapTokens` é O TETO QUE NÓS ENVIAMOS, não um limite do provedor. Toda chamada tem
 * teto explícito (critério 61): sem teto não há reserva possível, e sem reserva o orçamento
 * não protege nada.
 *
 * Puro. Nenhum I/O, nenhum preço (preço mora em `pricing.ts`, fonte única).
 */

import type { AiProviderId } from "./contracts";
import type { AiCapability } from "./capabilities";

export type AiModelStatus = "ativo" | "desativado";

export type AiModelEntry = {
  readonly provider: AiProviderId;
  /** ID exato usado na API do provedor. */
  readonly id: string;
  readonly label: string;
  readonly capabilities: readonly AiCapability[];
  /** `null` = NÃO VERIFICADO. Nunca "ilimitado". */
  readonly contextWindow: number | null;
  /** Teto de saída que ESTE sistema envia. Sempre presente, sempre explícito. */
  readonly outputCapTokens: number;
  /**
   * `desativado` some da seleção mas PERMANECE no catálogo: o histórico precisa continuar
   * conseguindo nomear o modelo que gerou uma resposta antiga (critério 17).
   */
  readonly status: AiModelStatus;
  /** Data (pt-BR puro, 'yyyy-MM-dd') da conferência na documentação oficial. */
  readonly verifiedAt: string;
  readonly verificationSource: string;
  /**
   * Fase 18-D — quando as CAPACIDADES desta entrada foram conferidas, e onde.
   *
   * Separado de `verifiedAt` porque preço e capacidade moram em páginas diferentes e
   * envelhecem em ritmos diferentes. Carimbar a entrada inteira ao acrescentar `visao`
   * afirmaria que o preço também foi reconferido naquele dia — e, para o Gemini, não foi.
   * Um `verifiedAt` que diz mais do que se conferiu é pior que um antigo, porque parece
   * confiável.
   *
   * Ausente = as capacidades valem a conferência de `verifiedAt`, como na 18-A.
   */
  readonly capabilitiesVerifiedAt?: string;
  readonly capabilitiesSource?: string;
};

const TEXTO_STREAM: readonly AiCapability[] = ["texto", "streaming"];

/**
 * Fase 18-D. `saida_estruturada` acompanha `visao` em todas as entradas abaixo porque o
 * Processo 2 exige as duas JUNTAS: um modelo que enxerga a nota mas não devolve objeto
 * validável obrigaria a extrair campo por regex de texto livre — que é exatamente a
 * "confiança do modelo virando autoavaliação" que o desenho da subfase recusa.
 */
const TEXTO_VISAO: readonly AiCapability[] = [
  "texto",
  "streaming",
  "visao",
  "saida_estruturada",
];

const TEXTO_VISAO_ARQUIVO: readonly AiCapability[] = [...TEXTO_VISAO, "arquivo"];

const ANTHROPIC_CAPS_SRC =
  "https://platform.claude.com/docs/en/docs/about-claude/models/overview + /build-with-claude/pdf-support";

/**
 * As capacidades abaixo refletem o que a documentação consultada afirmava. Onde ela não
 * afirmava (o caso de `visao` e `tool_calling` em vários modelos), a capacidade NÃO foi
 * marcada — marcar por suposição faria o sistema enviar imagem para um modelo que talvez não
 * a aceite, e o erro só apareceria depois de a chamada já ter sido cobrada.
 *
 * Isso não limita a 18-A: ela só usa `texto` + `streaming`. Visão é 18-D.
 */
export const AI_MODEL_CATALOG: readonly AiModelEntry[] = [
  // ── OpenAI ───────────────────────────────────────────────────────────────────────────
  //
  // ╔══════════════════════════════════════════════════════════════════════════════════════╗
  // ║ ⛔ 18-D: NENHUM MODELO DA OPENAI GANHOU `visao`, E A RECUSA É O EXEMPLO MAIS ÚTIL     ║
  // ║    DESTE ARQUIVO.                                                                     ║
  // ║                                                                                       ║
  // ║ A página de visão da OpenAI (conferida em 2026-08-08) nomeia `gpt-5.6` entre os       ║
  // ║ modelos com visão. O catálogo NÃO tem `gpt-5.6` — tem `gpt-5.6-terra`, `-luna` e      ║
  // ║ `-sol`, que são os ids que a API aceita e os únicos com tarifa em `pricing.ts`.       ║
  // ║                                                                                       ║
  // ║ `gpt-5.6` ≠ `gpt-5.6-terra`. Marcar os três porque "são da mesma família" é           ║
  // ║ INFERÊNCIA, e a regra do arquivo, escrita na 18-A, é que capacidade não afirmada NÃO  ║
  // ║ é marcada — porque o custo do erro é enviar imagem para um modelo que talvez não a    ║
  // ║ aceite, e descobrir DEPOIS de a chamada ter sido cobrada.                              ║
  // ║                                                                                       ║
  // ║ Consequência assumida: quem só configurou OpenAI não tem visão, e a tela DIZ isso.    ║
  // ║ Para reverter, basta a documentação nomear o id — não é uma decisão de produto, é     ║
  // ║ uma linha de verificação que ainda não existe.                                        ║
  // ╚══════════════════════════════════════════════════════════════════════════════════════╝
  {
    provider: "openai",
    id: "gpt-5.6-terra",
    label: "GPT-5.6 Terra",
    capabilities: TEXTO_STREAM,
    contextWindow: null,
    outputCapTokens: 4000,
    status: "ativo",
    verifiedAt: "2026-08-04",
    verificationSource: "https://developers.openai.com/api/docs/pricing",
  },
  {
    provider: "openai",
    id: "gpt-5.6-luna",
    label: "GPT-5.6 Luna (econômico)",
    capabilities: TEXTO_STREAM,
    contextWindow: null,
    outputCapTokens: 4000,
    status: "ativo",
    verifiedAt: "2026-08-04",
    verificationSource: "https://developers.openai.com/api/docs/pricing",
  },
  {
    provider: "openai",
    id: "gpt-5.6-sol",
    label: "GPT-5.6 Sol (avançado)",
    capabilities: TEXTO_STREAM,
    contextWindow: null,
    outputCapTokens: 4000,
    status: "ativo",
    verifiedAt: "2026-08-04",
    verificationSource: "https://developers.openai.com/api/docs/pricing",
  },

  // ── Google Gemini ────────────────────────────────────────────────────────────────────
  // ⚠️ 18-D: `gemini-3.6-flash` é o ÚNICO Gemini com `visao`, e o único do catálogo com visão
  // sem `arquivo`. A página de *image understanding* usa este id — e só este — em todos os
  // exemplos, declarando JPEG/PNG/WEBP/HEIC/HEIF e 20 MB de limite inline. Os outros dois
  // Gemini do catálogo não são nomeados em lugar nenhum dela, e não foram marcados.
  // PDF: a mesma página não afirma, então `arquivo` fica de fora — para o Gemini, PDF de
  // comprovante simplesmente não é uma opção oferecida.
  {
    provider: "gemini",
    id: "gemini-3.6-flash",
    label: "Gemini 3.6 Flash",
    capabilities: TEXTO_VISAO,
    contextWindow: null,
    outputCapTokens: 4000,
    status: "ativo",
    verifiedAt: "2026-08-04",
    verificationSource: "https://ai.google.dev/gemini-api/docs/pricing",
    capabilitiesVerifiedAt: "2026-08-08",
    capabilitiesSource: "https://ai.google.dev/gemini-api/docs/image-understanding",
  },
  {
    provider: "gemini",
    id: "gemini-3.5-flash-lite",
    label: "Gemini 3.5 Flash-Lite (econômico)",
    capabilities: TEXTO_STREAM,
    contextWindow: null,
    outputCapTokens: 4000,
    status: "ativo",
    verifiedAt: "2026-08-04",
    verificationSource: "https://ai.google.dev/gemini-api/docs/pricing",
  },
  {
    provider: "gemini",
    id: "gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    capabilities: TEXTO_STREAM,
    contextWindow: null,
    outputCapTokens: 4000,
    status: "ativo",
    verifiedAt: "2026-08-04",
    verificationSource: "https://ai.google.dev/gemini-api/docs/pricing",
  },

  // ── Anthropic ────────────────────────────────────────────────────────────────────────
  //
  // ⚠️ 18-D: os TRÊS ganharam `visao` e `arquivo`, e são os únicos do catálogo com as duas.
  // A documentação afirma os dois de forma GENÉRICA, cobrindo a família inteira:
  //   visão   — "All current Claude models support text and image input, text output,
  //             multilingual capabilities, and vision."   (models/overview)
  //   arquivo — "All active models support PDF processing."  (build-with-claude/pdf-support)
  // Afirmação sobre "todos os modelos ativos" alcança um id nomeado; é diferente do caso da
  // OpenAI abaixo, onde a doc nomeia OUTRO id.
  {
    provider: "anthropic",
    id: "claude-sonnet-5",
    label: "Claude Sonnet 5",
    capabilities: TEXTO_VISAO_ARQUIVO,
    contextWindow: null,
    outputCapTokens: 4000,
    status: "ativo",
    verifiedAt: "2026-08-04",
    verificationSource: "https://platform.claude.com/docs/en/docs/about-claude/pricing",
    capabilitiesVerifiedAt: "2026-08-08",
    capabilitiesSource: ANTHROPIC_CAPS_SRC,
  },
  {
    provider: "anthropic",
    id: "claude-haiku-4-5-20251001",
    label: "Claude Haiku 4.5 (econômico)",
    capabilities: TEXTO_VISAO_ARQUIVO,
    contextWindow: null,
    outputCapTokens: 4000,
    status: "ativo",
    verifiedAt: "2026-08-04",
    verificationSource: "https://platform.claude.com/docs/en/docs/about-claude/pricing",
    capabilitiesVerifiedAt: "2026-08-08",
    capabilitiesSource: ANTHROPIC_CAPS_SRC,
  },
  {
    provider: "anthropic",
    id: "claude-opus-5",
    label: "Claude Opus 5 (avançado)",
    capabilities: TEXTO_VISAO_ARQUIVO,
    contextWindow: null,
    outputCapTokens: 4000,
    status: "ativo",
    verifiedAt: "2026-08-04",
    verificationSource: "https://platform.claude.com/docs/en/docs/about-claude/pricing",
    capabilitiesVerifiedAt: "2026-08-08",
    capabilitiesSource: ANTHROPIC_CAPS_SRC,
  },

  // ── xAI ──────────────────────────────────────────────────────────────────────────────
  //
  // ⚠️ 18-D: também sem `visao`. `docs.x.ai/docs/models` (conferida em 2026-08-08) publica
  // limites de imagem gerais — 20 MiB, jpg/png — mas NÃO nomeia `grok-4.3` nem `grok-4.5`
  // como modelos que aceitam imagem. Limite de arquivo não é declaração de capacidade: ele
  // descreve o formato de uma coisa que a página não diz que estes modelos fazem.
  {
    provider: "xai",
    id: "grok-4.3",
    label: "Grok 4.3",
    capabilities: TEXTO_STREAM,
    contextWindow: 1_000_000,
    outputCapTokens: 4000,
    status: "ativo",
    verifiedAt: "2026-08-04",
    verificationSource: "https://docs.x.ai/docs/models",
  },
  {
    provider: "xai",
    id: "grok-4.5",
    label: "Grok 4.5 (avançado)",
    capabilities: TEXTO_STREAM,
    contextWindow: 500_000,
    outputCapTokens: 4000,
    status: "ativo",
    verifiedAt: "2026-08-04",
    verificationSource: "https://docs.x.ai/docs/models",
  },
];

/** Modelo pelo par (provedor, id). `null` quando não existe — nunca um palpite. */
export function findModel(
  provider: AiProviderId,
  modelId: string,
): AiModelEntry | null {
  return (
    AI_MODEL_CATALOG.find((m) => m.provider === provider && m.id === modelId) ?? null
  );
}

/** Só os `ativo` — é o que a tela oferece para escolha. */
export function activeModelsFor(provider: AiProviderId): AiModelEntry[] {
  return AI_MODEL_CATALOG.filter(
    (m) => m.provider === provider && m.status === "ativo",
  );
}

/**
 * Verificação mais antiga do catálogo. A tela usa para avisar que está velho — atualizar é
 * editar este arquivo puro, sem migration e sem deploy de schema.
 */
export function oldestVerification(): string {
  return AI_MODEL_CATALOG.reduce(
    (oldest, m) => (m.verifiedAt < oldest ? m.verifiedAt : oldest),
    AI_MODEL_CATALOG[0]?.verifiedAt ?? "",
  );
}

/**
 * `hoje` INJETADO — nunca `Date.now()`. Datas puras 'yyyy-MM-dd' comparadas como texto:
 * o formato ISO ordena lexicograficamente, e converter para `Date` só para comparar é
 * justamente o que produz drift de fuso neste projeto.
 */
export function isCatalogStale(hoje: string, maxDias = 90): boolean {
  const oldest = oldestVerification();
  if (!oldest) return true;
  return diasEntre(oldest, hoje) > maxDias;
}

/** Diferença em dias entre duas datas puras, via UTC (sem fuso, como manda o projeto). */
export function diasEntre(de: string, ate: string): number {
  const a = Date.UTC(
    Number(de.slice(0, 4)),
    Number(de.slice(5, 7)) - 1,
    Number(de.slice(8, 10)),
  );
  const b = Date.UTC(
    Number(ate.slice(0, 4)),
    Number(ate.slice(5, 7)) - 1,
    Number(ate.slice(8, 10)),
  );
  return Math.round((b - a) / 86_400_000);
}
