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
import { prontidaoDoChat, type ProntidaoDoChat } from "@/lib/ai/server/chat-readiness";
import { reconcileOwnRuns } from "@/lib/ai/server/reconcile";
import { botaoFlutuanteSchema } from "@/lib/validators/ai";
import type { ActionResult } from "@/types/finance";

/**
 * O que o painel precisa saber para se desenhar, buscado na PRIMEIRA abertura.
 *
 * ⛔ POR QUE NÃO NO LAYOUT. `prontidaoDoChat` lê configs de provedor e checa a cripto. Fazê-lo
 * no layout custaria isso em TODA navegação de `(app)` para um painel que talvez nunca seja
 * aberto. É o mesmo raciocínio que pôs `globalSearch` numa Server Action em vez de semear a
 * busca pelo layout — e o mesmo que pôs o painel atrás de `next/dynamic`: o que só importa
 * depois do clique é cobrado depois do clique.
 *
 * ⚠️ E ELE RECONCILIA, COMO `/ia` FAZ — este detalhe é fácil de perder e caro de perder.
 * Abrir `/ia` é o gatilho PRIMÁRIO da reconciliação preguiçosa: um run travado de uma sessão
 * anterior é fechado ali e a reserva dele deixa de comprometer o orçamento. A partir deste
 * bloco, o caminho mais curto para o chat deixa de ser aquela página — e sem esta linha o
 * gatilho primário simplesmente pararia de disparar para quem passar a conversar pelo painel,
 * com o orçamento mostrando reserva presa sem nada na tela explicando.
 */
export async function estadoDoPainelDaIa(): Promise<ProntidaoDoChat> {
  const ctx = await authContext();
  if (!ctx) {
    return {
      podeConversar: false,
      motivoBloqueio: "Sua sessão expirou. Entre de novo para conversar.",
    };
  }

  await reconcileOwnRuns();
  return prontidaoDoChat(ctx.userId);
}

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
