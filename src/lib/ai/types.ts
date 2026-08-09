/**
 * Fase 18-A — IA · Tipos compartilhados entre servidor e telas.
 *
 * O que passa daqui para um componente `'use client'` é SÓ o que está neste arquivo — e
 * nada aqui carrega material criptográfico, chave, `storage_path` ou corpo de resposta de
 * provedor. É a mesma disciplina das fotos de evolução (16-E): o tipo é a fronteira.
 */

import type { AiProviderId } from "./core/contracts";
import type { ToolPermission, ToolWritePermission } from "./tools/contracts";

export type CredentialStatus = "nao_validada" | "valida" | "invalida";
export type ConversationStatus = "ativa" | "arquivada";
export type MessageStatus = "complete" | "streaming" | "cancelled" | "failed";
export type MessageRole = "user" | "assistant" | "system";
export type RunStatus = "reserved" | "streaming" | "completed" | "cancelled" | "failed";
export type ConfirmationMode = "seguro" | "equilibrado" | "rapido";

export type ProviderCardView = {
  readonly provider: AiProviderId;
  readonly label: string;
  readonly enabled: boolean;
  readonly displayName: string | null;
  readonly defaultModel: string | null;
  readonly economyModel: string | null;
  readonly advancedModel: string | null;
  readonly visionModel: string | null;
  readonly timeoutMs: number;
  readonly maxRetries: number;
  readonly dailyLimit: number | null;
  readonly monthlyLimit: number | null;
  readonly fallbackAllowed: boolean;
  readonly fallbackOrder: readonly string[];
  /** Da credencial — nunca o material criptográfico. */
  readonly credentialStatus: CredentialStatus | null;
  readonly lastFour: string | null;
  readonly lastValidatedAt: string | null;
  readonly keyHint: string;
  readonly consoleUrl: string;
};

export type AiPreferencesView = {
  readonly defaultProvider: AiProviderId | null;
  readonly defaultModel: string | null;
  readonly confirmationMode: ConfirmationMode;
  readonly allowFallback: boolean;
  readonly dailyBudget: number | null;
  readonly monthlyBudget: number | null;
  readonly budgetBlockOnLimit: boolean;
  readonly budgetAlertLevelReached: number;
  readonly reservationMargin: number;
  readonly rateLimitPerMinute: number;
  readonly rateLimitPerHour: number;
  /**
   * As flags `allow_*` por módulo (18-B). **Chave AUSENTE é DESLIGADA**, nunca "ainda não
   * sei": o guard lê `!== true`, e é assim que uma coluna que não veio na consulta deixa de
   * autorizar leitura em vez de autorizá-la por omissão.
   */
  readonly permissions: Readonly<Record<ToolPermission, boolean>>;
  /**
   * As flags `allow_write_*` (18-C). Mesma disciplina de `permissions`, e um campo à parte
   * porque a decisão é à parte: nenhuma leitura consulta este objeto, e nenhuma escrita
   * passa só com o outro — escrever num módulo exige a chave de leitura E a de escrita.
   */
  readonly writePermissions: Readonly<Record<ToolWritePermission, boolean>>;
  /**
   * Fase 18-D — a autorização para o CONTEÚDO de um arquivo do dono sair deste sistema.
   *
   * ⛔ **NÃO é uma `ToolPermission`, e por isso não está em `permissions`.** As nove
   * `allow_*` respondem "a IA pode ler o módulo X?" e alimentam `permissaoDoModulo`, o
   * guard e a allowlist de ferramentas. Esta responde outra pergunta — "um arquivo meu pode
   * sair daqui?" — que não é sobre módulo nenhum. Enfiá-la naquele `Record` faria o
   * roteador procurar um módulo `vision` que não existe.
   *
   * Campo à parte, decisão à parte: ela é ANDada com `allow_finance` e
   * `allow_write_finance`, nunca lida sozinha.
   */
  readonly allowVision: boolean;
};

export type ConversationListItem = {
  readonly id: string;
  readonly title: string | null;
  readonly agentId: string;
  readonly status: ConversationStatus;
  readonly isFavorite: boolean;
  readonly lastMessageAt: string | null;
  readonly createdAt: string;
};

export type ConversationMessage = {
  readonly id: string;
  readonly role: MessageRole;
  readonly content: string;
  readonly status: MessageStatus;
  readonly createdAt: string;
  readonly runId: string | null;
};

export type MessageRunInfo = {
  readonly runId: string;
  readonly status: RunStatus;
  readonly provider: AiProviderId | null;
  readonly model: string | null;
  /** `null` = o provedor não informou. NUNCA zero por ausência. */
  readonly costUsd: number | null;
  readonly custoParcial: boolean;
  readonly avisoParcial: string | null;
  readonly attemptCount: number;
  readonly fallbackCount: number;
  readonly latencyMs: number | null;
  readonly errorCode: string | null;
  readonly errorMessage: string | null;
};

export type ConversationDetail = {
  readonly conversation: ConversationListItem;
  readonly messages: readonly ConversationMessage[];
  /** Indexado por `runId` — a tela junta mensagem e execução por aqui. */
  readonly runs: Readonly<Record<string, MessageRunInfo>>;
};

export type UsagePeriodSummary = {
  readonly periodo: "dia" | "mes";
  readonly confirmadoUsd: number;
  readonly reservadoUsd: number;
  readonly totalUsd: number;
  readonly limiteUsd: number | null;
  readonly restanteUsd: number | null;
  readonly percentual: number | null;
  readonly nivelDeAlerta: number | null;
  readonly execucoesSemCusto: number;
  readonly runsComReservaAtiva: number;
  readonly execucoes: number;
};

export type ProviderUsageRow = {
  readonly provider: AiProviderId;
  readonly model: string;
  readonly execucoes: number;
  readonly custoUsd: number;
  readonly semCusto: number;
};
