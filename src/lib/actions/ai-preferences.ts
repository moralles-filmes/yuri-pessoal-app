"use server";

/**
 * Fase 18-A — IA · Preferências do módulo.
 *
 * ⚠️ `confirmationMode` é GRAVADO aqui para a tela de Configurações existir completa, mas
 * NENHUM código o consome na 18-A — não há escrita nenhuma nesta subfase. A Approval Engine
 * é 18-C. Gravar agora e consumir depois é diferente de fingir que já funciona: a tela diz
 * exatamente isso ao usuário.
 *
 * As chaves de NOTIFICAÇÃO não moram aqui: vão para `settings.notification_prefs`, porque
 * `filterByPrefs` é o único ponto do sistema onde preferência de notificação decide
 * (invariante 24 da 16-F). O sino da IA só entra na 18-F.
 */

import { revalidatePath } from "next/cache";
import { authContext, dbError, invalid, notAuthed } from "@/lib/actions/helpers";
import { aiPreferencesSchema } from "@/lib/validators/ai";
import { findModel } from "@/lib/ai/core/models";
import { hasRate } from "@/lib/ai/core/pricing";
import { hojeISO } from "@/lib/format";
import type { ActionResult } from "@/types/finance";

export async function saveAiPreferences(
  input: unknown,
): Promise<ActionResult<true>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = aiPreferencesSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);

  const dados = parsed.data;

  // Modelo padrão sem provedor padrão não tem como ser resolvido — e o router acabaria
  // ignorando a preferência em silêncio, que é pior que recusar aqui.
  if (dados.defaultModel && !dados.defaultProvider) {
    return invalid({
      defaultProvider: ["Escolha o provedor padrão antes do modelo padrão."],
    });
  }

  if (dados.defaultProvider && dados.defaultModel) {
    const hoje = hojeISO();
    const modelo = findModel(dados.defaultProvider, dados.defaultModel);
    if (!modelo || modelo.status !== "ativo") {
      return invalid({ defaultModel: ["Modelo fora do catálogo para este provedor."] });
    }
    if (!hasRate(dados.defaultProvider, dados.defaultModel, hoje)) {
      return invalid({
        defaultModel: ["Este modelo não tem tarifa cadastrada e não pode ser usado."],
      });
    }
  }

  const { error } = await ctx.supabase.from("ai_user_preferences").upsert(
    {
      user_id: ctx.userId,
      default_provider: dados.defaultProvider,
      default_model: dados.defaultModel,
      confirmation_mode: dados.confirmationMode,
      allow_fallback: dados.allowFallback,
      daily_budget: dados.dailyBudget,
      monthly_budget: dados.monthlyBudget,
      budget_block_on_limit: dados.budgetBlockOnLimit,
      reservation_margin: dados.reservationMargin,
      rate_limit_per_minute: dados.rateLimitPerMinute,
      rate_limit_per_hour: dados.rateLimitPerHour,
    },
    { onConflict: "user_id" },
  );

  if (error) return dbError("Não foi possível salvar as preferências de IA.");

  revalidatePath("/configuracoes");
  revalidatePath("/ia");
  revalidatePath("/ia/configuracoes");
  return { ok: true, data: true };
}

/**
 * Registra o nível de alerta de orçamento já mostrado, para o aviso não reaparecer a cada
 * render. Aviso repetido vira ruído que se ignora — e o próximo, o de verdade, se perde.
 *
 * Nunca DESCE sozinho: só a virada de período (que zera o consumo) justifica baixar o
 * nível, e isso é feito por uma escrita explícita com `nivel = 0`.
 */
export async function registerBudgetAlertLevel(
  nivel: number,
): Promise<ActionResult<true>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  if (![0, 70, 80, 90, 100].includes(nivel)) {
    return invalid({ nivel: ["Nível de alerta inválido."] });
  }

  const { error } = await ctx.supabase
    .from("ai_user_preferences")
    .update({ budget_alert_level_reached: nivel })
    .eq("user_id", ctx.userId);

  if (error) return dbError("Não foi possível registrar o aviso de orçamento.");
  return { ok: true, data: true };
}
