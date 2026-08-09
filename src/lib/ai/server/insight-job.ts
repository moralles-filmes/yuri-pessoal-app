import "server-only";

/**
 * Fase 18-E · Bloco 4 — A VARREDURA AUTOMÁTICA. O I/O do job, e só ele.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ⛔ ESTE É O PRIMEIRO GASTO DO SISTEMA SEM O DONO OLHANDO.                             ║
 * ║                                                                                       ║
 * ║ Três consequências que mandam no arquivo inteiro:                                     ║
 * ║                                                                                       ║
 * ║  1. SEM SESSÃO. O escopo do usuário deixa de vir da RLS e passa a ser o                ║
 * ║     `LeituraDoDono` que este arquivo monta e empurra pela cadeia toda.                 ║
 * ║                                                                                       ║
 * ║  2. NÃO REPETE ESCRITA. Cada módulo é tentado UMA VEZ por execução. Não há laço de     ║
 * ║     retry aqui — quem tem retry e fallback é o runner, DENTRO de um run já admitido e  ║
 * ║     já contabilizado. Um retry externo furaria o orçamento por fora do RPC.            ║
 * ║                                                                                       ║
 * ║  3. UM MÓDULO QUE FALHA NÃO DERRUBA OS OUTROS. Cada um tem seu try/catch e sua linha   ║
 * ║     em `ai_insight_jobs`.                                                              ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * ⚠️ **A DEDUPLICAÇÃO NÃO É REIMPLEMENTADA AQUI.** O job entra por `runInsight`, que resolve
 * a chave e consulta `buscarInsightPorChave` **antes** da admissão (Bloco 2). Se a chave
 * repete, os dados não mudaram, nada é chamado e nada é cobrado — e o desfecho vira
 * `reaproveitado`. Uma dedupe própria do job seria uma segunda regra que divergiria da
 * primeira no primeiro campo novo.
 */

import { runInsight } from "./insight-runner";
import { getAiPreferences } from "@/lib/ai/queries";
import {
  decidirVarredura,
  type DecisaoDoModulo,
} from "@/lib/ai/insights/job";
import type { ModuloDeInsight } from "@/lib/ai/insights/contracts";
import { redactSecrets } from "@/lib/ai/security/redact";
import type { LeituraDoDono } from "@/lib/supabase/owner";

/** O que aconteceu com um módulo nesta execução. Espelha o CHECK da tabela. */
export type DesfechoDoJob = "gerado" | "reaproveitado" | "pulado" | "falhou";

export type ResultadoDoModulo = {
  readonly modulo: ModuloDeInsight;
  readonly desfecho: DesfechoDoJob;
  /** SEMPRE presente em `pulado`/`falhou`, SEMPRE sanitizado. Nulo nos outros dois. */
  readonly motivo: string | null;
  readonly insightId: string | null;
};

export type ResultadoDaVarredura = {
  readonly userId: string;
  readonly modulos: readonly ResultadoDoModulo[];
};

/**
 * Teto do motivo gravado. A coluna é `text` livre, mas um erro de provedor pode vir com um
 * corpo de resposta inteiro — e a tabela é do dono, não um depósito de log.
 */
const MAX_MOTIVO = 400;

/**
 * Tudo que vai para `ai_insight_jobs.motivo` passa por aqui.
 *
 * `redactSecrets` é o mesmo caminho de saída de erro do módulo (`security/redact.ts`): uma
 * sanitização local nasceria desatualizada no dia em que um padrão novo entrasse na lista.
 */
function motivoSeguro(texto: string): string {
  const limpo = redactSecrets(texto).replace(/\s+/g, " ").trim();
  const cortado =
    limpo.length > MAX_MOTIVO ? `${limpo.slice(0, MAX_MOTIVO - 1)}…` : limpo;
  // O CHECK `ai_insight_jobs_motivo_coerente` recusa motivo em branco — e um `desfecho` ruim
  // sem motivo é a ausência muda que a invariante 65 proíbe. Nunca devolve string vazia.
  return cortado.length > 0 ? cortado : "motivo não informado";
}

/**
 * Roda a varredura de um usuário.
 *
 * `agora` é INJETADO — nada aqui chama `new Date()`. Quem o cria é a rota do Cron.
 */
export async function runInsightJob(
  owner: LeituraDoDono,
  agora: Date,
): Promise<ResultadoDaVarredura> {
  // A chave do mecanismo e as três de leitura, lidas com o client sem sessão.
  const prefs = await getAiPreferences(owner.userId, owner.client);

  const decisoes = decidirVarredura({
    allowInsightJobs: prefs.allowInsightJobs,
    permissions: prefs.permissions,
  });

  // Lista vazia = o mecanismo está desligado. Nada é gravado: registrar "não rodei porque
  // você não me ligou" todo dia encheria a tabela do dono com o óbvio.
  if (decisoes.length === 0) return { userId: owner.userId, modulos: [] };

  const resultados: ResultadoDoModulo[] = [];

  // Sequencial de propósito, e não `Promise.all`: os três disputam o MESMO advisory lock por
  // usuário dentro da admissão, e o mesmo orçamento. Em paralelo eles só ficariam esperando
  // uns aos outros no banco — com o risco de o segundo estourar `lock_timeout` e virar uma
  // falha que não é falha.
  for (const decisao of decisoes) {
    resultados.push(await executarModulo(owner, decisao, agora));
  }

  await registrar(owner, resultados, agora);

  return { userId: owner.userId, modulos: resultados };
}

async function executarModulo(
  owner: LeituraDoDono,
  decisao: DecisaoDoModulo,
  agora: Date,
): Promise<ResultadoDoModulo> {
  if (!decisao.tentar) {
    return {
      modulo: decisao.modulo,
      desfecho: "pulado",
      motivo: motivoSeguro(decisao.motivo),
      insightId: null,
    };
  }

  try {
    const r = await runInsight({
      userId: owner.userId,
      modulo: decisao.modulo,
      agora,
      owner,
    });

    if (!r.ok) {
      // ⚠️ Orçamento esgotado (próprio OU global), chave desligada e falha de provedor caem
      // TODOS aqui, e todos viram `pulado`/`falhou` com o motivo já em pt-BR vindo de
      // `MENSAGEM_ADMISSAO`. O job não distingue: para o dono, o que importa é por que não
      // saiu análise — e a frase já diz.
      return {
        modulo: decisao.modulo,
        desfecho: barrado(r.code) ? "pulado" : "falhou",
        motivo: motivoSeguro(r.message),
        insightId: null,
      };
    }

    return {
      modulo: decisao.modulo,
      desfecho: r.reaproveitado ? "reaproveitado" : "gerado",
      motivo: null,
      insightId: r.insightId,
    };
  } catch (e) {
    // Nunca propaga: a falha de um módulo não pode interromper os outros dois nem derrubar a
    // rota. A mensagem passa pela mesma sanitização de tudo que sai daqui.
    return {
      modulo: decisao.modulo,
      desfecho: "falhou",
      motivo: motivoSeguro(e instanceof Error ? e.message : "erro não identificado"),
      insightId: null,
    };
  }
}

/**
 * `pulado` = o sistema recusou por regra conhecida (chave, orçamento, rate limit, nada para
 * analisar). `falhou` = alguma coisa deu errado. A distinção existe para a tela poder dizer
 * "você desligou isto" sem chamar de erro o que foi uma decisão do dono.
 */
const BARRADOS: readonly string[] = [
  "AI_JOBS_NOT_ALLOWED",
  "AI_JOB_BUDGET_EXCEEDED",
  "AI_MODULE_NOT_ALLOWED",
  "AI_MODULE_NOT_AVAILABLE",
  "AI_BUDGET_EXCEEDED_DAILY",
  "AI_BUDGET_EXCEEDED_MONTHLY",
  "AI_RATE_LIMITED",
  // Não é falha: é o módulo sem número medido bastante para uma análise honesta.
  "NO_INDICATORS",
];

const barrado = (codigo: string) => BARRADOS.includes(codigo);

/**
 * Uma linha POR MÓDULO, SEMPRE — inclusive `pulado`.
 *
 * ⚠️ Falhar ao registrar não pode desfazer o insight que já foi gerado e pago. Por isso o
 * `insert` é tolerante: o retorno da varredura continua verdadeiro mesmo se a auditoria
 * cair. Errar aqui para "o dono não vê o registro" é muito melhor que errar para "a rota
 * estourou depois de gastar dinheiro".
 */
/**
 * A varredura de TODOS os usuários — o que o Cron chama.
 *
 * Mesma forma de `runNotificationGeneration` (Fase 13): a enumeração mora aqui, e não na
 * rota, porque a rota é transporte. Um usuário que falha não interrompe os outros.
 *
 * ⚠️ O `client` é o de SERVICE ROLE. Ele ignora a RLS, então cada `LeituraDoDono` montado
 * aqui é o único escopo que separa um usuário do outro — daí o `userId` vir de
 * `listUsers()`, e nunca de qualquer coisa que tenha chegado pela requisição.
 */
export async function runInsightJobForAllUsers(
  client: LeituraDoDono["client"],
  agora: Date,
): Promise<{ users: number; resultados: readonly ResultadoDaVarredura[] }> {
  const { data, error } = await client.auth.admin.listUsers();
  if (error) throw new Error("Falha ao listar usuários.");

  const users = data?.users ?? [];
  const resultados: ResultadoDaVarredura[] = [];

  for (const u of users) {
    try {
      resultados.push(await runInsightJob({ client, userId: u.id }, agora));
    } catch {
      // Já é o segundo cinto: `runInsightJob` não propaga por módulo. Este aqui cobre a
      // falha de ler as preferências — e ela não pode calar o próximo usuário.
      resultados.push({ userId: u.id, modulos: [] });
    }
  }

  return { users: users.length, resultados };
}

async function registrar(
  owner: LeituraDoDono,
  resultados: readonly ResultadoDoModulo[],
  agora: Date,
): Promise<void> {
  if (resultados.length === 0) return;

  await owner.client.from("ai_insight_jobs").insert(
    resultados.map((r) => ({
      user_id: owner.userId,
      executed_at: agora.toISOString(),
      modulo: r.modulo,
      desfecho: r.desfecho,
      motivo: r.motivo,
      insight_id: r.insightId,
    })),
  );
}
