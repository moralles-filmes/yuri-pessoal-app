"use server";

/**
 * Fase 18-A — IA · Configuração e credenciais dos provedores (em Configurações).
 *
 * Molde do projeto: `authContext()` → Zod `safeParse` → query com `user_id` explícito →
 * `revalidatePath` → `ActionResult`. `user_id` SEMPRE de `auth.getUser()`, nunca do client.
 *
 * ⚠️ NENHUMA action daqui devolve material criptográfico. O que volta para a tela é
 * `status`, `last_four` e `last_validated_at` — o resto não sai de `credential-store.ts`.
 */

import { revalidatePath } from "next/cache";
import { authContext, dbError, invalid, notAuthed } from "@/lib/actions/helpers";
import {
  aiCredentialSchema,
  aiProviderConfigSchema,
  aiProviderRefSchema,
} from "@/lib/validators/ai";
import { findModel } from "@/lib/ai/core/models";
import { hasRate } from "@/lib/ai/core/pricing";
import {
  deleteCredential,
  saveCredential,
  testStoredCredential,
} from "@/lib/ai/server/credential-store";
import { getCryptoReadiness } from "@/lib/ai/server/crypto-readiness";
import { hojeISO } from "@/lib/format";
import type { ActionResult } from "@/types/finance";

const ROTAS = ["/configuracoes", "/ia", "/ia/configuracoes"] as const;

function revalidar() {
  for (const rota of ROTAS) revalidatePath(rota);
}

/**
 * Salva a configuração do provedor.
 *
 * ═══════════════════════ AQUI É ONDE O CATÁLOGO VIRA CONTRATO ═══════════════════════
 *
 * Cada modelo escolhido é conferido contra `core/models.ts` E contra `core/pricing.ts`.
 * Isso não é só validação de formulário: `ai_begin_chat_run` valida o modelo pedido contra
 * as colunas gravadas AQUI. Ou seja, é esta action que garante que um usuário chamando o
 * RPC direto não consiga rodar um modelo arbitrário — o banco não conhece o catálogo, mas
 * conhece o que esta função deixou passar.
 */
export async function saveAiProviderConfig(
  input: unknown,
): Promise<ActionResult<{ provider: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = aiProviderConfigSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);

  const dados = parsed.data;
  const hoje = hojeISO();

  const camposDeModelo = [
    ["defaultModel", dados.defaultModel],
    ["economyModel", dados.economyModel],
    ["advancedModel", dados.advancedModel],
    ["visionModel", dados.visionModel],
  ] as const;

  for (const [campo, valor] of camposDeModelo) {
    if (!valor) continue;
    const modelo = findModel(dados.provider, valor);
    if (!modelo || modelo.status !== "ativo") {
      return invalid({
        [campo]: ["Modelo fora do catálogo (ou desativado) para este provedor."],
      });
    }
    // Modelo sem tarifa NÃO é selecionável: sem preço não há reserva, e sem reserva o
    // orçamento não protege nada.
    if (!hasRate(dados.provider, valor, hoje)) {
      return invalid({
        [campo]: ["Este modelo não tem tarifa cadastrada e por isso não pode ser usado."],
      });
    }
  }

  if (dados.enabled && !dados.defaultModel) {
    return invalid({
      defaultModel: ["Escolha um modelo padrão antes de ativar o provedor."],
    });
  }

  // `ON CONFLICT` do PostgREST exige constraint que ele consiga inferir. Aqui a unique
  // `(user_id, provider)` é total (não é parcial nem de expressão), então o upsert é
  // seguro — mas o `onConflict` vai explícito, para não depender de inferência.
  const { error } = await ctx.supabase.from("ai_provider_configs").upsert(
    {
      user_id: ctx.userId,
      provider: dados.provider,
      enabled: dados.enabled,
      display_name: dados.displayName,
      default_model: dados.defaultModel,
      economy_model: dados.economyModel,
      advanced_model: dados.advancedModel,
      vision_model: dados.visionModel,
      timeout_ms: dados.timeoutMs,
      max_retries: dados.maxRetries,
      daily_limit: dados.dailyLimit,
      monthly_limit: dados.monthlyLimit,
      fallback_allowed: dados.fallbackAllowed,
      fallback_order: dados.fallbackOrder,
    },
    { onConflict: "user_id,provider" },
  );

  if (error) return dbError("Não foi possível salvar a configuração do provedor.");

  revalidar();
  return { ok: true, data: { provider: dados.provider } };
}

/**
 * Cadastra ou substitui a chave de API.
 *
 * A ordem entre cifrar, testar e persistir está em `credential-store.ts`, e a diferença
 * importa: substituir uma credencial que FUNCIONA só grava se a nova passar no teste.
 * Trocar uma chave válida por uma inválida e ficar sem acesso é o pior resultado possível.
 */
export async function saveAiCredential(
  input: unknown,
): Promise<ActionResult<{ substituiu: boolean }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const readiness = getCryptoReadiness();
  if (!readiness.ready) return dbError(readiness.message);

  const parsed = aiCredentialSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);

  // A credencial tem FK COMPOSTA para a configuração: sem linha de config, não há onde
  // pendurar a chave. Criar a config vazia aqui evita obrigar o usuário a salvar duas vezes.
  const { error: erroConfig } = await ctx.supabase.from("ai_provider_configs").upsert(
    { user_id: ctx.userId, provider: parsed.data.provider },
    { onConflict: "user_id,provider", ignoreDuplicates: true },
  );
  if (erroConfig) return dbError("Não foi possível preparar a configuração do provedor.");

  const resultado = await saveCredential({
    userId: ctx.userId,
    provider: parsed.data.provider,
    apiKey: parsed.data.apiKey,
  });

  if (!resultado.ok) {
    // A mensagem já vem sanitizada de `security/redact.ts` — nunca corpo de resposta do
    // provedor, nunca eco da chave.
    return invalid({ apiKey: [resultado.error.message] });
  }

  revalidar();
  return { ok: true, data: resultado.value };
}

/**
 * Testa a credencial guardada. Vai ao endpoint de LISTAGEM DE MODELOS — custo ZERO tokens,
 * sem criar `ai_run`, sem gerar `ai_usage_event` e sem tocar no orçamento.
 */
export async function testAiCredential(
  input: unknown,
): Promise<ActionResult<{ modelosVistos: number }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = aiProviderRefSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);

  const resultado = await testStoredCredential(ctx.userId, parsed.data.provider);
  revalidar();

  if (!resultado.ok) {
    return { ok: false, error: resultado.message };
  }
  return { ok: true, data: { modelosVistos: resultado.modelosVistos } };
}

export async function removeAiCredential(
  input: unknown,
): Promise<ActionResult<{ provider: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = aiProviderRefSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);

  const resultado = await deleteCredential(ctx.userId, parsed.data.provider);
  if (!resultado.ok) return dbError(resultado.error.message);

  // Sem credencial, o provedor não pode ficar ativo — senão o router o ofereceria e toda
  // conversa morreria na admissão.
  await ctx.supabase
    .from("ai_provider_configs")
    .update({ enabled: false })
    .eq("user_id", ctx.userId)
    .eq("provider", parsed.data.provider);

  revalidar();
  return { ok: true, data: { provider: parsed.data.provider } };
}
