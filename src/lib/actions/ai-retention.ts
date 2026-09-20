"use server";

/**
 * Fase 18-F · Bloco 1 — exclusão em massa dos dados de IA.
 *
 * A decisão do que some, do que fica e do que sai junto é PURA (`lib/ai/retention.ts`). Aqui
 * há só auth, Zod, a exclusão e o `revalidatePath` — a casca de sempre.
 *
 * ⛔ CONTAR E APAGAR SAEM DO MESMO SELETOR. `alvosDoEscopo` é o único lugar que decide o que
 * está no escopo; `contarDadosDaIa` conta o que ele devolve e `apagarDadosDaIa` apaga o que
 * ele devolve. Dois filtros separados fariam a tela prometer um número e o banco executar
 * outro — a lição da invariante 43 ("a previsão é o cálculo real, não uma descrição dele").
 *
 * ⛔ COMPROVANTE NÃO É `delete from ai_documents`. Quem descarta um comprovante é
 * `descartarDocumento` (18-D): ele apaga o ARQUIVO do bucket privado antes do metadado e
 * recusa o comprovante que já virou anexo de um lançamento. Um delete direto aqui deixaria
 * o binário do documento pessoal órfão no bucket, com a tela dizendo que tinha apagado.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authContext, dbError, invalid, notAuthed, type AuthContext } from "./helpers";
import type { ActionResult } from "@/types/finance";
import { saoPauloWallClockToInstant } from "@/lib/format";
import { ESCOPOS_DE_EXCLUSAO, type EscopoDeExclusao } from "@/lib/ai/retention";
import { DOCUMENT_ENTITY_TYPE } from "@/lib/ai/vision/constants";
import { descartarDocumento } from "@/lib/ai/server/document-store";

const alvoShape = {
  escopo: z.enum(ESCOPOS_DE_EXCLUSAO),
  /** Só para `conversas_antigas`: data pura 'yyyy-MM-dd'. Apaga o que é ANTERIOR a ela. */
  anteriorA: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.")
    .nullable()
    .optional(),
};

const contagemSchema = z.object(alvoShape).strict();

const exclusaoSchema = z
  .object({
    ...alvoShape,
    /** Confirmação explícita: nada some sozinho, e nada some por engano. */
    confirmar: z.literal(true, { message: "Confirme a exclusão." }),
  })
  .strict();

type Alvo = { escopo: EscopoDeExclusao; anteriorA: string | null };

/**
 * ⛔ `anteriorA` é DATA PURA de Brasília; `created_at` é `timestamptz`. Cortar em
 * `${anteriorA}T00:00:00.000Z` seria meia-noite **UTC** — 21h BRT da véspera —, e três horas
 * da noite anterior seriam apagadas junto sem aparecer na contagem.
 */
function corteEmSaoPaulo(anteriorA: string): string {
  return saoPauloWallClockToInstant(anteriorA).toISOString();
}

/**
 * Os comprovantes que ESTE caminho alcança: só os que ainda são envio solto.
 *
 * O que já virou anexo de um lançamento fica de fora — quem o apaga é o Financeiro, junto
 * com o lançamento (a mesma recusa de `descartarDocumento`). A FK composta
 * `(attachment_id, user_id)` impede o embed do PostgREST (invariante 21 da 16-E), então são
 * duas consultas de propósito.
 */
async function comprovantesSoltos(ctx: AuthContext): Promise<string[] | null> {
  const { data: docs, error } = await ctx.supabase
    .from("ai_documents")
    .select("id, attachment_id")
    .eq("user_id", ctx.userId);
  if (error) return null;
  if (!docs?.length) return [];

  const { data: anexos, error: erroAnexos } = await ctx.supabase
    .from("attachments")
    .select("id")
    .eq("user_id", ctx.userId)
    .eq("entity_type", DOCUMENT_ENTITY_TYPE)
    .in(
      "id",
      docs.map((d) => d.attachment_id),
    );
  if (erroAnexos) return null;

  const soltos = new Set((anexos ?? []).map((a) => a.id));
  return docs.filter((d) => soltos.has(d.attachment_id)).map((d) => d.id);
}

/** `conversas_antigas` sem data não é "apagar tudo" — é entrada incompleta. */
function alvoIncompleto(alvo: Alvo): ActionResult<never> | null {
  if (alvo.escopo === "conversas_antigas" && !alvo.anteriorA) {
    return invalid({ anteriorA: ["Escolha a data de corte."] });
  }
  return null;
}

/** Os ids no escopo. `null` = falha de leitura; a action traduz em erro, nunca em zero. */
async function alvosDoEscopo(ctx: AuthContext, alvo: Alvo): Promise<string[] | null> {
  if (alvo.escopo === "documentos") return comprovantesSoltos(ctx);

  if (alvo.escopo === "insights") {
    const { data, error } = await ctx.supabase
      .from("ai_insights")
      .select("id")
      .eq("user_id", ctx.userId);
    return error ? null : (data ?? []).map((r) => r.id);
  }

  let query = ctx.supabase.from("ai_conversations").select("id").eq("user_id", ctx.userId);
  if (alvo.escopo === "conversas_antigas" && alvo.anteriorA) {
    query = query.lt("created_at", corteEmSaoPaulo(alvo.anteriorA));
  }
  const { data, error } = await query;
  return error ? null : (data ?? []).map((r) => r.id);
}

/**
 * Quantos registros a exclusão vai alcançar. Leitura pura de contagem, chamada pela tela
 * ANTES de confirmar — o diálogo não pergunta "quer apagar?" sem dizer quanto.
 */
export async function contarDadosDaIa(
  input: unknown,
): Promise<ActionResult<{ quantidade: number }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = contagemSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);

  const alvo: Alvo = {
    escopo: parsed.data.escopo,
    anteriorA: parsed.data.anteriorA ?? null,
  };
  const incompleto = alvoIncompleto(alvo);
  if (incompleto) return incompleto;

  const ids = await alvosDoEscopo(ctx, alvo);
  if (ids === null) return dbError("Não foi possível contar o que seria apagado.");

  return { ok: true, data: { quantidade: ids.length } };
}

export async function apagarDadosDaIa(
  input: unknown,
): Promise<ActionResult<{ apagados: number }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = exclusaoSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);

  const alvo: Alvo = {
    escopo: parsed.data.escopo,
    anteriorA: parsed.data.anteriorA ?? null,
  };
  const incompleto = alvoIncompleto(alvo);
  if (incompleto) return incompleto;

  const ids = await alvosDoEscopo(ctx, alvo);
  if (ids === null) return dbError("Não foi possível apagar os dados da IA.");

  let apagados = 0;

  if (alvo.escopo === "documentos") {
    // Um a um, pelo caminho oficial: o arquivo do bucket sai antes do metadado.
    for (const id of ids) {
      if (await descartarDocumento(ctx.supabase, ctx.userId, id)) apagados += 1;
    }
    if (ids.length > 0 && apagados === 0) {
      return dbError("Não foi possível descartar os comprovantes.");
    }
  } else if (ids.length > 0) {
    const tabela = alvo.escopo === "insights" ? "ai_insights" : "ai_conversations";
    const { error, count } = await ctx.supabase
      .from(tabela)
      .delete({ count: "exact" })
      .eq("user_id", ctx.userId)
      .in("id", ids);
    if (error) return dbError("Não foi possível apagar os dados da IA.");
    apagados = count ?? 0;
  }

  revalidatePath("/ia");
  revalidatePath("/ia/conversas");
  revalidatePath("/ia/insights");
  revalidatePath("/ia/comprovantes");
  revalidatePath("/ia/consumo");
  revalidatePath("/ia/configuracoes");

  return { ok: true, data: { apagados } };
}
