import "server-only";

import { getRouterConfigs } from "@/lib/ai/queries";
import { usableProviders } from "@/lib/ai/core/router";
import { cryptoProblemMessage } from "@/lib/ai/server/crypto-readiness";

export type ProntidaoDoChat = {
  readonly podeConversar: boolean;
  readonly motivoBloqueio: string | null;
};

/**
 * Fase 18-F · Bloco 2 — por que o chat pode (ou não pode) começar.
 *
 * ⛔ EXTRAÍDA DE `src/app/(app)/ia/page.tsx`, ONDE ERA A ÚNICA CÓPIA. A partir deste bloco há
 * DOIS caminhos para o mesmo chat — a página e o painel flutuante —, e duas cópias da mesma
 * frase divergiriam na primeira edição: o dono leria um motivo na página e outro no painel
 * para o mesmo sistema. É a disciplina do `getSessionHistory` da 17-F (invariante 24) e do
 * `getUsageSummary` do Bloco 1 (invariante 83), aplicada à frase em vez de ao número.
 *
 * A ordem importa: problema de cripto vence falta de provedor. Sem a master key, cadastrar
 * provedor não resolve nada — e mandar o dono cadastrar um seria mandá-lo ao lugar errado.
 */
export async function prontidaoDoChat(userId: string): Promise<ProntidaoDoChat> {
  const problemaCripto = cryptoProblemMessage();
  const configs = await getRouterConfigs(userId);
  const prontos = usableProviders(configs);

  const motivoBloqueio =
    problemaCripto ??
    (prontos.length === 0
      ? "Nenhum provedor de IA está configurado e ativo. Cadastre uma chave em Configurações para começar."
      : null);

  return { podeConversar: motivoBloqueio === null, motivoBloqueio };
}
