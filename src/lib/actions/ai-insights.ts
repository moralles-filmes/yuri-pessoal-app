"use server";

/**
 * Fase 18-E — IA · Gerar insight e registrar a decisão do dono.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ⛔ ESTE ARQUIVO É A METADE "GERAÇÃO". O DASHBOARD NÃO O ALCANÇA.                      ║
 * ║                                                                                       ║
 * ║ Há teste de import em `boundaries.test.ts`: nenhum arquivo de `src/lib/dashboard/`,   ║
 * ║ `src/components/dashboard/` ou da rota do dashboard pode importar daqui nem do        ║
 * ║ runner. "O dashboard não chama a IA no carregamento" é verdadeiro POR CONSTRUÇÃO.     ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * Casca fina, como manda o contrato do projeto: auth + Zod + serviço + `revalidatePath`.
 */

import { revalidatePath } from "next/cache";

import { authContext, invalid, notAuthed } from "@/lib/actions/helpers";
import type { ModuloDeInsight } from "@/lib/ai/insights/contracts";
import { getAiPreferences } from "@/lib/ai/queries";
import { registrarFeedback } from "@/lib/ai/server/insight-store";
import { runInsight } from "@/lib/ai/server/insight-runner";
import {
  feedbackDeInsightSchema,
  gerarInsightSchema,
} from "@/lib/validators/ai";
import type { ActionResult } from "@/types/finance";

const ROTA = "/ia/insights";
const ROTA_DASHBOARD = "/dashboard";

/**
 * ⚠️ **A PERMISSÃO É DO MÓDULO PEDIDO** — invariante 26 da 18-C. Ela é conferida aqui E
 * dentro de `ai_begin_insight_run`: um usuário autenticado pode chamar o RPC direto, e a
 * Server Action não é a última barreira de nada.
 *
 * A mensagem diz QUAL chave falta, porque "sem permissão" mandaria o dono caçar entre quinze
 * interruptores.
 */
const CHAVE_DO_MODULO: Record<ModuloDeInsight, { flag: string; nome: string }> = {
  financeiro: { flag: "allow_finance", nome: "Financeiro" },
  treinos: { flag: "allow_training", nome: "Treinos" },
  dieta: { flag: "allow_nutrition", nome: "Dieta e Alimentação" },
};

async function moduloAutorizado(
  userId: string,
  modulo: ModuloDeInsight,
): Promise<string | null> {
  const prefs = await getAiPreferences(userId);
  const chave = CHAVE_DO_MODULO[modulo];
  const ligada = prefs.permissions[chave.flag as keyof typeof prefs.permissions] === true;
  return ligada
    ? null
    : `A leitura de ${chave.nome} pela IA está desligada. Ligue-a em /ia/configuracoes antes de pedir uma análise.`;
}

export type InsightGeradoResultado = {
  readonly insightId: string;
  /**
   * `true` quando os dados não mudaram desde a última análise e o insight existente foi
   * devolvido — nenhuma chamada externa aconteceu, e nada foi cobrado.
   */
  readonly reaproveitado: boolean;
};

/**
 * Gera (ou reaproveita) o insight de um módulo.
 *
 * ⚠️ **`agora` é criado AQUI, na casca**, e injetado no runner. O runner e tudo abaixo dele
 * são puros quanto ao tempo — é o que permite testá-los sem congelar relógio.
 */
export async function gerarInsight(
  input: unknown,
): Promise<ActionResult<InsightGeradoResultado>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = gerarInsightSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);

  const recusa = await moduloAutorizado(ctx.userId, parsed.data.modulo);
  if (recusa) return { ok: false, error: recusa };

  const resultado = await runInsight({
    userId: ctx.userId,
    modulo: parsed.data.modulo,
    janela: parsed.data.janela,
    agora: new Date(),
  });

  if (!resultado.ok) return { ok: false, error: resultado.message };

  revalidatePath(ROTA);
  revalidatePath(ROTA_DASHBOARD);

  return {
    ok: true,
    data: { insightId: resultado.insightId, reaproveitado: resultado.reaproveitado },
  };
}

/**
 * Registra a decisão do dono sobre um insight.
 *
 * ⛔ **Append-only.** A tabela não tem policy de `update` nem de `delete`: mudar de ideia
 * grava linha nova, e `insights/state.ts` resolve o estado a partir da última. Nada aqui
 * escreve em `ai_insights` — o insight é imutável depois de escrito.
 */
export async function registrarDecisaoDeInsight(
  input: unknown,
): Promise<ActionResult<null>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = feedbackDeInsightSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);

  const gravou = await registrarFeedback({
    userId: ctx.userId,
    insightId: parsed.data.insightId,
    decisao: parsed.data.decisao,
    adiadoAte: parsed.data.adiadoAte ?? null,
  });

  if (!gravou) {
    return { ok: false, error: "Não foi possível registrar a decisão. Tente de novo." };
  }

  revalidatePath(ROTA);
  revalidatePath(ROTA_DASHBOARD);

  return { ok: true, data: null };
}
