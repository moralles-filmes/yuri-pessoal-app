/**
 * Fase 18-A — IA · Resolução SERVIDOR de provedor e modelo.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ O QUE O CLIENTE MANDA É PREFERÊNCIA, NUNCA ORDEM.                                     ║
 * ║ Quem decide é esta função, contra o registry, o catálogo, a configuração DO USUÁRIO e ║
 * ║ a tabela de tarifas. O valor que ela devolve é o que vai para `selected_provider` /   ║
 * ║ `selected_model` — e o banco confere de novo, porque o RPC pode ser chamado direto.   ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * Puro: recebe o estado já lido e devolve decisão. Nenhum I/O, `hoje` injetado.
 */

import {
  isAiProviderId,
  type AiProviderId,
} from "./contracts";
import {
  capabilityError,
  missingCapabilities,
  type AiCapability,
} from "./capabilities";
import { aiError, type AiError } from "./errors";
import { findModel, type AiModelEntry } from "./models";
import { hasRate } from "./pricing";
import { err, ok, type Result } from "./result";

/** O recorte de `ai_provider_configs` que a decisão precisa. */
export type ProviderConfigView = {
  readonly provider: AiProviderId;
  readonly enabled: boolean;
  readonly defaultModel: string | null;
  readonly economyModel: string | null;
  readonly advancedModel: string | null;
  readonly visionModel: string | null;
  readonly fallbackAllowed: boolean;
  readonly fallbackOrder: readonly string[];
  readonly maxRetries: number;
  readonly timeoutMs: number;
  /** Existe credencial utilizável? (`invalida` conta como não utilizável.) */
  readonly hasUsableCredential: boolean;
};

export type RouteInput = {
  readonly configs: readonly ProviderConfigView[];
  /** Preferência do usuário salva em `ai_user_preferences`. */
  readonly defaultProvider: AiProviderId | null;
  readonly defaultModel: string | null;
  /** Preferência da REQUISIÇÃO. Pode ser qualquer coisa — é tratada como sugestão. */
  readonly providerPreference?: string | null;
  readonly modelPreference?: string | null;
  readonly requiredCapabilities: readonly AiCapability[];
  /** Data pura 'yyyy-MM-dd', injetada — decide qual tarifa está vigente. */
  readonly hoje: string;
};

export type RouteDecision = {
  readonly provider: AiProviderId;
  readonly model: AiModelEntry;
  readonly config: ProviderConfigView;
  /** Cadeia de fallback JÁ AUTORIZADA. Vazia quando o fallback está desligado. */
  readonly fallbackChain: readonly { provider: AiProviderId; model: AiModelEntry }[];
};

/** Provedor utilizável = configurado, ativo e com credencial que não está inválida. */
export function usableProviders(
  configs: readonly ProviderConfigView[],
): ProviderConfigView[] {
  return configs.filter((c) => c.enabled && c.hasUsableCredential);
}

/**
 * Modelos que o usuário CONFIGUROU naquele provedor, na ordem de precedência da tela.
 * O banco valida contra exatamente este conjunto — por isso as duas listas têm de sair
 * da mesma ideia, e não de dois lugares diferentes.
 */
export function configuredModelIds(config: ProviderConfigView): string[] {
  const brutos = [
    config.defaultModel,
    config.economyModel,
    config.advancedModel,
    config.visionModel,
  ];
  const vistos = new Set<string>();
  const saida: string[] = [];
  for (const id of brutos) {
    if (id && !vistos.has(id)) {
      vistos.add(id);
      saida.push(id);
    }
  }
  return saida;
}

/**
 * Um modelo só é elegível se: existe no catálogo, está `ativo`, pertence àquele provedor,
 * tem as capacidades exigidas E tem tarifa vigente. A tarifa entra na elegibilidade de
 * propósito — sem preço não há reserva, e sem reserva o orçamento não protege nada.
 */
export function eligibleModel(
  provider: AiProviderId,
  modelId: string,
  required: readonly AiCapability[],
  hoje: string,
): Result<AiModelEntry, AiError> {
  const model = findModel(provider, modelId);
  if (!model) {
    return err(
      aiError(
        "MODELO_INDISPONIVEL",
        "MODEL_NOT_IN_CATALOG",
        `O modelo ${modelId} não está no catálogo deste sistema.`,
      ),
    );
  }
  if (model.status !== "ativo") {
    return err(
      aiError(
        "MODELO_INDISPONIVEL",
        "MODEL_DISABLED",
        `O modelo ${model.label} está desativado.`,
      ),
    );
  }
  const faltando = missingCapabilities(model.capabilities, required);
  if (faltando.length > 0) {
    return err(capabilityError(model.label, faltando));
  }
  if (!hasRate(provider, modelId, hoje)) {
    return err(
      aiError(
        "MODELO_INDISPONIVEL",
        "MODEL_WITHOUT_RATE",
        `O modelo ${model.label} não tem tarifa cadastrada e por isso não pode ser usado.`,
      ),
    );
  }
  return ok(model);
}

/**
 * A decisão inteira. A ordem de preferência é explícita e auditável:
 *   1. o que a requisição pediu (se for utilizável);
 *   2. o padrão do usuário;
 *   3. o primeiro provedor utilizável, com o modelo padrão dele.
 * Em nenhum ramo um valor do cliente é usado sem passar pelas verificações.
 */
export function routeRequest(input: RouteInput): Result<RouteDecision, AiError> {
  const utilizaveis = usableProviders(input.configs);
  if (utilizaveis.length === 0) {
    return err(
      aiError(
        "AUTENTICACAO_INVALIDA",
        "NO_USABLE_PROVIDER",
        "Nenhum provedor de IA está configurado e ativo. Configure um em Configurações.",
      ),
    );
  }

  const candidatos: AiProviderId[] = [];
  if (isAiProviderId(input.providerPreference)) candidatos.push(input.providerPreference);
  if (input.defaultProvider) candidatos.push(input.defaultProvider);
  for (const c of utilizaveis) candidatos.push(c.provider);

  const config =
    candidatos
      .map((p) => utilizaveis.find((c) => c.provider === p))
      .find((c): c is ProviderConfigView => c !== undefined) ?? utilizaveis[0];

  // Preferência de modelo só é considerada se o usuário a configurou naquele provedor.
  // Aceitar um id arbitrário aqui abriria a porta para o cliente escolher um modelo caro
  // fora do que ele mesmo autorizou.
  const configurados = configuredModelIds(config);
  if (configurados.length === 0) {
    return err(
      aiError(
        "MODELO_INDISPONIVEL",
        "PROVIDER_WITHOUT_MODEL",
        `Nenhum modelo está configurado para ${config.provider}. Escolha um em Configurações.`,
      ),
    );
  }

  const ordemModelos: string[] = [];
  if (
    typeof input.modelPreference === "string" &&
    configurados.includes(input.modelPreference)
  ) {
    ordemModelos.push(input.modelPreference);
  }
  if (input.defaultModel && configurados.includes(input.defaultModel)) {
    ordemModelos.push(input.defaultModel);
  }
  ordemModelos.push(...configurados);

  let ultimoErro: AiError | null = null;
  let escolhido: AiModelEntry | null = null;
  for (const id of ordemModelos) {
    const r = eligibleModel(config.provider, id, input.requiredCapabilities, input.hoje);
    if (r.ok) {
      escolhido = r.value;
      break;
    }
    ultimoErro = r.error;
  }

  if (!escolhido) {
    return err(
      ultimoErro ??
        aiError(
          "MODELO_INDISPONIVEL",
          "NO_ELIGIBLE_MODEL",
          "Nenhum modelo elegível para esta requisição.",
        ),
    );
  }

  return ok({
    provider: config.provider,
    model: escolhido,
    config,
    fallbackChain: buildFallbackChain(config, utilizaveis, input, escolhido),
  });
}

/**
 * A cadeia de fallback AUTORIZADA, resolvida já na admissão.
 *
 * Ela é resolvida aqui — e não na hora do erro — porque a RESERVA precisa cobrir o modelo
 * mais caro que a chamada pode acabar usando. Descobrir a cadeia só depois da falha
 * significaria fazer fallback para um custo que ninguém reservou.
 */
function buildFallbackChain(
  origem: ProviderConfigView,
  utilizaveis: readonly ProviderConfigView[],
  input: RouteInput,
  modeloEscolhido: AiModelEntry,
): { provider: AiProviderId; model: AiModelEntry }[] {
  if (!origem.fallbackAllowed) return [];

  const cadeia: { provider: AiProviderId; model: AiModelEntry }[] = [];
  const ordem = origem.fallbackOrder.filter(isAiProviderId);

  for (const providerId of ordem) {
    if (providerId === origem.provider) continue;
    const destino = utilizaveis.find((c) => c.provider === providerId);
    if (!destino) continue;

    for (const modelId of configuredModelIds(destino)) {
      const r = eligibleModel(providerId, modelId, input.requiredCapabilities, input.hoje);
      if (r.ok) {
        cadeia.push({ provider: providerId, model: r.value });
        break;
      }
    }
  }

  return cadeia.filter(
    (d) => !(d.provider === origem.provider && d.model.id === modeloEscolhido.id),
  );
}
