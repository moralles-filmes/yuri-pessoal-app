import type { ProviderCardView } from "@/lib/ai/types";

type FormDoProvedor = {
  enabled: boolean;
  defaultModel: string;
  economyModel: string;
  advancedModel: string;
  fallbackAllowed: boolean;
};

export function fallbackDisponivel(fallbackOrder: readonly string[]): boolean {
  return fallbackOrder.length > 0;
}

/** A tela não edita visão, timeout nem ordem: preserva a configuração recebida. */
export function montarConfigDoProvedor(
  card: ProviderCardView,
  form: FormDoProvedor,
  dailyLimit: number | null,
  monthlyLimit: number | null,
) {
  const modelo = (valor: string) => valor === "__nenhum__" ? null : valor;
  return {
    provider: card.provider,
    enabled: form.enabled,
    displayName: card.displayName,
    defaultModel: modelo(form.defaultModel),
    economyModel: modelo(form.economyModel),
    advancedModel: modelo(form.advancedModel),
    visionModel: card.visionModel,
    timeoutMs: card.timeoutMs,
    maxRetries: card.maxRetries,
    dailyLimit,
    monthlyLimit,
    fallbackAllowed: form.fallbackAllowed,
    fallbackOrder: card.fallbackOrder,
  };
}
