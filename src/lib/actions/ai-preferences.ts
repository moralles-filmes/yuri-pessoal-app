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
 *
 * ⚠️ **A 18-B acrescentou as nove flags `allow_*`.** Elas são a AUTORIZAÇÃO DE LEITURA por
 * módulo — o que `guardToolCall` exige antes de qualquer ferramenta rodar. Nascem desligadas
 * no banco e continuam desligadas aqui: nada nesta action liga uma flag por omissão, porque o
 * schema as exige todas e a tela manda o estado completo.
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
      /**
       * As nove autorizações de leitura (18-B). Vão CAMPO A CAMPO, não por espalhamento do
       * objeto validado: um `...dados.permissions` faria qualquer chave nova do schema virar
       * coluna do `upsert` sem ninguém revisar o mapeamento, e uma chave que não existe na
       * tabela derruba a gravação INTEIRA — inclusive orçamento e limites.
       */
      allow_finance: dados.permissions.allow_finance,
      allow_nutrition: dados.permissions.allow_nutrition,
      allow_training: dados.permissions.allow_training,
      allow_body: dados.permissions.allow_body,
      allow_todo: dados.permissions.allow_todo,
      allow_calendar: dados.permissions.allow_calendar,
      allow_tasks: dados.permissions.allow_tasks,
      allow_habits: dados.permissions.allow_habits,
      allow_studies: dados.permissions.allow_studies,
      /**
       * ⚠️ As cinco autorizações de ESCRITA (18-C · Bloco 4). Mesma disciplina campo a campo,
       * e um cuidado a mais: **escrita sem a leitura do mesmo módulo é derrubada aqui**, não
       * só desabilitada na tela. A tela é conveniência; esta linha é a regra.
       *
       * Sem isto, um POST montado à mão gravaria `allow_write_todo = true` com
       * `allow_todo = false` — um estado que o guard recusa na execução, mas que a tela de
       * preferências passaria a exibir como "alterações autorizadas". Estado impossível
       * gravado é pior que estado impossível recusado.
       */
      allow_write_todo: dados.writePermissions.allow_write_todo && dados.permissions.allow_todo,
      allow_write_habits:
        dados.writePermissions.allow_write_habits && dados.permissions.allow_habits,
      allow_write_calendar:
        dados.writePermissions.allow_write_calendar && dados.permissions.allow_calendar,
      allow_write_nutrition:
        dados.writePermissions.allow_write_nutrition && dados.permissions.allow_nutrition,
      allow_write_finance:
        dados.writePermissions.allow_write_finance && dados.permissions.allow_finance,
      /**
       * ⚠️ 18-D — o envio de arquivo, ANDado no SERVIDOR com as duas chaves do Financeiro.
       *
       * Mesma razão das cinco linhas acima, com uma consequência a mais: enviar um
       * comprovante para o provedor só faz sentido se a IA puder LER o Financeiro (para
       * resolver conta e categoria) e ALTERÁ-LO (para propor o lançamento). Gravar
       * `allow_vision = true` sem elas descreveria um estado sem uso — o arquivo sairia do
       * sistema e a extração não teria para onde ir.
       *
       * A tela desabilita a chave nesse caso; esta linha é o que torna isso uma REGRA.
       */
      allow_vision:
        dados.allowVision && dados.permissions.allow_finance && dados.writePermissions.allow_write_finance,
      /**
       * ⛔ 18-E Bloco 4 — E ESTA **NÃO** É ANDADA COM NADA. A diferença com a linha acima é
       * o coração da decisão do bloco.
       *
       * `allow_vision` é ANDada porque as três chaves servem ao MESMO efeito: um comprovante
       * que não pode virar lançamento é um arquivo que saiu do sistema para nada.
       *
       * A varredura não é assim. Ela cobre TRÊS módulos independentes, e ANDar com os três
       * faria desligar a leitura de Dieta calar também o insight de Financeiro. Quem decide
       * módulo a módulo é `insights/job.ts` (que PULA), e o RPC confere de novo. Ligar a
       * chave com os três módulos desligados não é estado impossível: é uma varredura que
       * roda, pula os três e registra o porquê em `ai_insight_jobs`.
       */
      allow_insight_jobs: dados.allowInsightJobs,
      job_monthly_budget: dados.jobMonthlyBudget,
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
