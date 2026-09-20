"use server";

/**
 * Fase 18-F · Bloco 2 — IA · O painel flutuante.
 *
 * Duas funções, e elas fazem coisas de naturezas diferentes:
 *
 *  • `estadoDoPainelDaIa` LÊ sob demanda — Server Action usada como RPC, o mesmo padrão de
 *    `globalSearch` (`src/lib/actions/search.ts`), que o command palette do Header já usa
 *    pela mesma razão: um componente da casca precisa de dado do servidor e não pode
 *    cobrá-lo de todas as 67 rotas.
 *  • `definirBotaoFlutuante` GRAVA só as duas colunas do botão, de onde o dono está.
 */

import { revalidatePath } from "next/cache";
import { authContext, dbError, invalid, notAuthed } from "@/lib/actions/helpers";
import { botaoFlutuanteSchema } from "@/lib/validators/ai";
import type { ActionResult } from "@/types/finance";

/**
 * Move ou esconde o botão, a partir do menu do próprio painel.
 *
 * ⚠️ `upsert` e não `update`: quem nunca abriu `/ia/configuracoes` não tem linha em
 * `ai_user_preferences`, e um `update` afetaria zero linhas devolvendo sucesso — a preferência
 * sumiria em silêncio no próximo carregamento. O `upsert` do PostgREST só atualiza as colunas
 * que vão no payload, então nada mais da linha é tocado; num INSERT, o resto nasce com os
 * defaults do banco, que são os seguros (toda chave desligada).
 */
export async function definirBotaoFlutuante(
  input: unknown,
): Promise<ActionResult<true>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = botaoFlutuanteSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);

  const { error } = await ctx.supabase.from("ai_user_preferences").upsert(
    {
      user_id: ctx.userId,
      floating_corner: parsed.data.floatingCorner,
      floating_hidden: parsed.data.floatingHidden,
    },
    { onConflict: "user_id" },
  );

  if (error) return dbError("Não foi possível salvar a preferência do botão.");

  /**
   * ⚠️ LIMITE DECLARADO. O botão lê a preferência pelo layout, que roda a cada navegação —
   * então a mudança alcança as outras rotas no próximo clique, e alcança outra aba só quando
   * ela navegar. Quem acabou de mexer vê o efeito na hora porque o componente que mudou é o
   * que se move (estado local). Um `revalidatePath("/", "layout")` jogaria fora o cache do app
   * inteiro para adiantar um botão de canto — preço errado para o ganho.
   */
  revalidatePath("/ia/configuracoes");
  return { ok: true, data: true };
}
