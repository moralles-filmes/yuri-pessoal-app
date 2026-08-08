"use server";

/**
 * Fase 18-C · Bloco 4 — IA · A CASCA da decisão do dono. O único caminho até a execução.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ESTE ARQUIVO É A ÚNICA PORTA DE `approval/execute.ts` EM TODO O `src/`.               ║
 * ║                                                                                       ║
 * ║ Não é convenção: `boundaries.test.ts` varre o repositório e falha se qualquer arquivo  ║
 * ║ fora de `src/lib/actions/` alcançar o executor de ações. É o que mantém a escrita fora ║
 * ║ do run — e, com ela, a promessa de que cancelar o streaming não desfaz o que já foi    ║
 * ║ confirmado.                                                                            ║
 * ║                                                                                       ║
 * ║ Por que Server Action e não o Route Handler do chat: o Route Handler NÃO herda a       ║
 * ║ proteção CSRF que o Next dá a Server Action (invariante 6 da 18-A). Uma execução de    ║
 * ║ escrita atrás de um endpoint sem CSRF seria a pior porta possível.                     ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * O molde é o de sempre (`accounts.ts`): `authContext` → Zod → serviço → `revalidatePath` →
 * `ActionResult`. O que muda é que o "serviço" aqui é o Approval Engine, e ele decide sozinho
 * se a ação é admissível — prazo, uso único, hash e command são conferidos lá (e no banco),
 * nunca aqui.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authContext, invalid, notAuthed } from "@/lib/actions/helpers";
import { executarAcaoAprovada, registrarDecisao } from "@/lib/ai/approval/execute";
import { prepararDesfazer, type PropostaDeDesfazer } from "@/lib/ai/approval/undo";
import type { StatusDaExecucao } from "@/lib/ai/approval/state";
import type { ActionResult } from "@/types/finance";

/**
 * ⚠️ O HASH VEM DA TELA, e é ele que amarra a confirmação à previsão que o dono LEU.
 *
 * Ele não é validado "contra o banco" aqui, de propósito: quem o confere é a FK composta
 * `(proposal_id, user_id, confirmed_hash) → (id, user_id, effect_hash)` de
 * `ai_action_approvals`. Uma checagem em código seria uma segunda verdade — e a que se
 * esquece de rodar. O formato importa só para não mandar lixo ao Postgres.
 */
const decisaoSchema = z
  .object({
    proposalId: z.uuid(),
    hash: z.string().regex(/^[0-9a-f]{64}$/, "Hash inválido"),
  })
  .strict();

export type ResultadoDaConfirmacao = {
  readonly status: StatusDaExecucao;
  readonly executionId: string;
  /** Rota interna do registro criado ou alterado, quando existe. Já passou pela allowlist. */
  readonly targetRoute: string | null;
};

/**
 * Confirma e EXECUTA. As duas coisas na mesma action de propósito: a janela entre "gravei a
 * confirmação" e "executei" é onde moraria uma proposta confirmada e nunca aplicada, e o dono
 * não teria como saber em qual dos dois lados ela parou.
 *
 * Se a execução falhar depois de a decisão estar gravada, a proposta fica confirmada e a
 * execução fica registrada como falha — que é o estado honesto. A trava contra repetição
 * continua sendo o `unique (proposal_id)` de `ai_action_executions`, no banco.
 */
export async function confirmarAcaoDaIa(
  input: unknown,
): Promise<ActionResult<ResultadoDaConfirmacao>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = decisaoSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);

  const decisao = await registrarDecisao({
    userId: ctx.userId,
    proposalId: parsed.data.proposalId,
    hashDaTela: parsed.data.hash,
    decisao: "confirmada",
  });
  if (!decisao.ok) return { ok: false, error: decisao.mensagem };

  const execucao = await executarAcaoAprovada({
    userId: ctx.userId,
    proposalId: parsed.data.proposalId,
    hashDaTela: parsed.data.hash,
    // O relógio real entra AQUI, na casca, e em nenhum outro lugar do Approval Engine — todo
    // o resto recebe `agora` injetado e é testável sem esperar 10 minutos passarem.
    agora: new Date(),
  });
  if (!execucao.ok) return { ok: false, error: execucao.mensagem };

  /**
   * ⚠️ O `revalidatePath` MORA AQUI, e é por isso que o command declara as rotas em vez de
   * chamá-lo. Um command que revalidasse estaria preso ao Next e não seria chamável de um
   * teste — e o desenho da 18-C manda a invalidação ficar na casca.
   */
  for (const rota of execucao.revalidar) revalidatePath(rota);
  revalidatePath("/ia");
  revalidatePath("/ia/acoes");

  return {
    ok: true,
    data: {
      status: execucao.status,
      executionId: execucao.executionId,
      targetRoute: execucao.targetRoute,
    },
  };
}

/**
 * Recusa. Grava a decisão e não executa nada — e a recusa é DEFINITIVA para aquela proposta,
 * porque `unique (proposal_id)` não deixa uma segunda decisão entrar.
 *
 * Ela é gravada, e não apenas descartada na tela, porque "o dono disse não" é um fato que a
 * auditoria precisa ter. Uma proposta que some sem registro é indistinguível de uma que
 * expirou sozinha.
 */
export async function recusarAcaoDaIa(input: unknown): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = decisaoSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);

  const decisao = await registrarDecisao({
    userId: ctx.userId,
    proposalId: parsed.data.proposalId,
    hashDaTela: parsed.data.hash,
    decisao: "recusada",
  });
  if (!decisao.ok) return { ok: false, error: decisao.mensagem };

  revalidatePath("/ia");
  revalidatePath("/ia/acoes");
  return { ok: true, data: undefined };
}

/**
 * 18-C · Bloco 5 — PREPARA o desfazer de uma execução. Não desfaz nada.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ POR QUE SÃO DOIS CLIQUES, E NÃO UM.                                                   ║
 * ║                                                                                       ║
 * ║ Esta action grava uma PROPOSTA e devolve a previsão do que o desfazer vai fazer. Quem ║
 * ║ executa é `confirmarAcaoDaIa` — a MESMA porta de qualquer outra alteração, com o mesmo ║
 * ║ hash, o mesmo prazo de 10 minutos, o mesmo uso único e a mesma revalidação.            ║
 * ║                                                                                       ║
 * ║ Um desfazer de um clique só seria a única escrita do sistema sem o dono ler o que vai  ║
 * ║ acontecer — e o inverso de uma ação não é inofensivo: ele exclui tarefa, apaga registro ║
 * ║ de diário e cancela compromisso que já foi para o Google.                               ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * ⚠️ A entrada é o id da EXECUÇÃO, e só. Qual command inverso rodar, com que payload e sobre
 * qual registro é decidido no servidor, a partir do que a execução registrou — nada disso vem
 * do cliente, pela mesma razão que `user_id` não vem.
 */
const desfazerSchema = z.object({ executionId: z.uuid() }).strict();

export async function prepararDesfazerDaIa(
  input: unknown,
): Promise<ActionResult<PropostaDeDesfazer>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = desfazerSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);

  const r = await prepararDesfazer({
    userId: ctx.userId,
    executionId: parsed.data.executionId,
  });
  if (!r.ok) return { ok: false, error: r.mensagem };

  // Sem `revalidatePath` aqui: nada mudou nos módulos, e a proposta ainda está por decidir. A
  // invalidação acontece quando ela for confirmada — em `confirmarAcaoDaIa`.
  return { ok: true, data: r.proposta };
}
