import "server-only";

/**
 * Fase 18-B — IA · O Tool Executor. É AQUI que a ferramenta roda — e em nenhum outro lugar.
 *
 * A decisão de admitir vem de `guard.ts` (puro e testado). Aqui ficam as três coisas que
 * exigem I/O: validar a entrada com o Zod que mora junto do adapter, aplicar o timeout, e
 * auditar. Rejeição NÃO encerra o run: volta ao modelo como `tool-result` de erro, para ele
 * poder dizer que não conseguiu — silêncio faria o modelo preencher a lacuna sozinho, que é
 * exatamente o que a subfase existe para impedir.
 */

import { AI_TOOL_REGISTRY } from "./registry";
import {
  guardToolCall,
  PUBLIC_REJECTION_CODE,
  REJECTION_MESSAGE,
  type ToolRejectionReason,
} from "./guard";
import { TOOL_EXECUTORS } from "./executors";
import {
  MAX_UNTRUSTED_CHARS,
  wrapUntrusted,
  type UntrustedBlock,
} from "@/lib/ai/security/untrusted";
import type {
  ToolDescriptor,
  ToolPermission,
  ToolWritePermission,
  ToolOutput,
} from "./contracts";
import { recordToolCall, type ToolCallStatus } from "./audit";

export type ToolCallRequest = {
  readonly callId: string;
  readonly toolName: string;
  readonly input: unknown;
};

export type ToolExecutionContext = {
  readonly runId: string;
  readonly userId: string;
  readonly stepId: string;
  readonly agent: { readonly id: string; readonly allowedTools: readonly string[] };
  readonly permissions: Readonly<Partial<Record<ToolPermission, boolean>>>;
  /**
   * 18-C — As chaves `allow_write_*`. Enquanto nenhuma ferramenta de escrita existir, este
   * objeto é lido e não decide nada; ele existe porque o guard exige o campo, e exigir o
   * campo é o que impede um caminho novo de herdar permissão de escrita por omissão.
   */
  readonly writePermissions: Readonly<Partial<Record<ToolWritePermission, boolean>>>;
};

export type ToolExecution = {
  readonly callId: string;
  readonly toolName: string;
  readonly isError: boolean;
  /**
   * O MESMO vocabulário que foi para a auditoria. O laço precisa dele para a tela poder
   * dizer "a consulta demorou demais" em vez de "rejeitada" — deduzir isso de `isError`
   * transformaria timeout e falha em recusa, que é outra coisa e assusta à toa.
   */
  readonly status: ToolCallStatus;
  /** O bloco NÃO CONFIÁVEL que volta ao modelo. Nunca o objeto cru. */
  readonly block: UntrustedBlock;
  readonly recordsRead: number;
};

/**
 * O erro que volta ao modelo carrega o código PÚBLICO e a nossa mensagem — nunca o texto do
 * erro original. Mensagem de banco traz nome de tabela, de coluna e às vezes valor de linha.
 *
 * O código público (`PUBLIC_REJECTION_CODE`) existe porque o motivo interno também é um
 * canal: "não existe" e "existe mas não é deste agente" com códigos distintos deixariam o
 * modelo mapear o registry por sondagem. A auditoria recebe o motivo verdadeiro.
 */
function erro(
  call: ToolCallRequest,
  reason: ToolRejectionReason,
  mensagem: string,
  status: ToolCallStatus = "rejeitada",
): ToolExecution {
  return {
    callId: call.callId,
    toolName: call.toolName,
    isError: true,
    status,
    block: wrapUntrusted("resultado_de_ferramenta", call.toolName, {
      erro: PUBLIC_REJECTION_CODE[reason],
      mensagem,
    }),
    recordsRead: 0,
  };
}

/**
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ DUAS PODAS DE LISTA — E NENHUMA DELAS MEXE EM `completude`.                           ║
 * ║                                                                                       ║
 * ║  1. `maxRecords` do descriptor — o teto de LISTA, auditável num lugar só.             ║
 * ║  2. `MAX_UNTRUSTED_CHARS` — o teto do ENVELOPE. Sem ele, `wrapUntrusted` cortava a    ║
 * ║     string serializada no meio de um token JSON: o modelo recebia `truncated: true`    ║
 * ║     e nenhuma ressalva, e relatava um total de um período cujos últimos registros ele  ║
 * ║     nunca viu.                                                                         ║
 * ║                                                                                       ║
 * ║ ⚠️ AS DUAS FALAM DA LISTA, NÃO DO TOTAL. Os agregados foram calculados sobre o período ║
 * ║ INTEIRO, antes de qualquer poda: marcar o resultado como `completude: "parcial"` só    ║
 * ║ porque a lista encolheu fazia o modelo hedgear um número correto. Por isso a poda      ║
 * ║ escreve em `itens_truncados` e NÃO TOCA em `completude` nem em `motivo_incompleto` —   ║
 * ║ esses dois são do adapter, e a ressalva dele ("sem peso corporal do dia") sobrevive    ║
 * ║ inteira porque ninguém escreve por cima.                                               ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * A medida do orçamento é `JSON.stringify(saida).length` — exatamente a que `wrapUntrusted`
 * usa para decidir cortar. Medir outra coisa deixaria a poda e o corte em desacordo.
 */

/**
 * O caso em que nem a saída SEM ITEM NENHUM cabe no envelope: a parte não-item (`agregados`,
 * `motivo_incompleto`) já estoura sozinha. Nenhuma das três ferramentas de hoje chega perto,
 * mas uma quarta com `agregados` gordo reintroduziria o corte no meio do JSON — que é o
 * defeito que o orçamento existe para eliminar. Aqui é melhor não entregar nada e DIZER
 * isso do que entregar um objeto cortado ao meio.
 */
const GRANDE_DEMAIS =
  "O resultado é grande demais para ser enviado: nem os totais couberam no limite de tamanho da resposta. Nada foi omitido em silêncio — nenhum número deste resultado chegou até você. Peça um período menor ou um filtro mais específico.";

export function podarSaida(saida: ToolOutput, tool: ToolDescriptor): ToolOutput {
  const total = saida.itens.length;

  /**
   * `refs` só pode ser fatiado por POSIÇÃO quando é 1:1 com `itens`. Não é sempre:
   *  • `get_last_workout` tem 1 ref (a sessão) e N itens (os exercícios) — podar até n = 0
   *    apagaria o único link do "Ver dados usados" enquanto os agregados continuam sendo
   *    relatados;
   *  • `get_records` monta `refs` de `recordes.filter(r => r.sessionId)` — com um recorde
   *    sem sessão, o índice k de `refs` deixa de ser o k de `itens` e o `slice` guardaria um
   *    subconjunto que não corresponde aos itens mantidos.
   * Comprimento igual é a única evidência de correspondência posicional que este ponto tem;
   * sem ela, `refs` fica INTEIRO (ele é pequeno, e a rastreabilidade da Task 12 depende dele).
   */
  const refsPorPosicao = saida.refs.length === total;

  const montar = (n: number, motivoDaPoda: string | null): ToolOutput => ({
    ...saida,
    itens: saida.itens.slice(0, n),
    refs: refsPorPosicao ? saida.refs.slice(0, n) : saida.refs,
    ...(motivoDaPoda
      ? { itens_truncados: { mostrando: n, de: total, motivo: motivoDaPoda } }
      : {}),
  });

  const cabe = (candidato: ToolOutput) =>
    JSON.stringify(candidato).length <= MAX_UNTRUSTED_CHARS;

  const teto = Math.min(total, tool.maxRecords);
  const excedeuTeto = total > tool.maxRecords;
  /**
   * ⚠️ A segunda frase é CONDICIONAL, e a condição é o `completude` que o ADAPTER decidiu.
   *
   * Prometer "os totais cobrem o período inteiro" incondicionalmente é falso justamente no
   * caso em que o adapter já avisou o contrário — a consulta saturou o próprio teto de
   * linhas e agregou só uma parte da janela. Seriam duas afirmações opostas no mesmo
   * resultado, e a que o modelo lê por último é esta.
   *
   * A distinção que a fase inteira defende: o TETO DA FERRAMENTA encurta a LISTA e não
   * mexe no total; um total incompleto é outro assunto, mora em `completude` +
   * `motivo_incompleto`, e este ponto só o repassa.
   */
  const motivoDoTeto = excedeuTeto
    ? `Mostrando ${tool.maxRecords} de ${total} ${tool.itemLabel}: o teto da ferramenta é ${tool.maxRecords}. ` +
      (saida.completude === "exato"
        ? "Os totais em `agregados` cobrem o período inteiro."
        : "Os totais em `agregados` NÃO cobrem o período inteiro — o motivo está em `motivo_incompleto`.")
    : null;

  const podadoPeloTeto = montar(teto, motivoDoTeto);
  if (cabe(podadoPeloTeto)) return podadoPeloTeto;

  /**
   * Não coube no envelope: procura o MAIOR prefixo que cabe.
   *
   * A mensagem nomeia AS DUAS CAUSAS quando as duas atuaram. Atribuir todo o corte ao
   * tamanho, com o teto tendo cortado antes, é impreciso na direção errada: sugere que a
   * ferramenta poderia devolver `total` itens numa resposta menor, quando o teto do
   * descriptor a impediria de qualquer forma.
   */
  const motivoDoOrcamento = (n: number) =>
    excedeuTeto
      ? `Mostrando ${n} de ${total} ${tool.itemLabel}: o teto da ferramenta é ${tool.maxRecords} e o restante não coube no limite de tamanho da resposta. Os totais em \`agregados\` cobrem o período inteiro.`
      : `Mostrando ${n} de ${total} ${tool.itemLabel}: o restante não coube no limite de tamanho da resposta. Os totais em \`agregados\` cobrem o período inteiro.`;

  let baixo = 0;
  let alto = teto;
  let melhor = 0;
  while (baixo <= alto) {
    const meio = Math.floor((baixo + alto) / 2);
    if (cabe(montar(meio, motivoDoOrcamento(meio)))) {
      melhor = meio;
      baixo = meio + 1;
    } else {
      alto = meio - 1;
    }
  }

  const final = montar(melhor, motivoDoOrcamento(melhor));
  if (cabe(final)) return final;

  // Nem `montar(0, …)` coube. Aqui os AGREGADOS caem junto — e por isso, e só por isso,
  // `completude` vira "parcial": o total realmente não chegou ao modelo.
  return {
    periodo: saida.periodo,
    contagem: saida.contagem,
    completude: "parcial",
    motivo_incompleto: GRANDE_DEMAIS,
    agregados: {},
    itens: [],
    refs: [],
    itens_truncados: { mostrando: 0, de: total, motivo: GRANDE_DEMAIS },
  };
}

export async function executeTool(
  ctx: ToolExecutionContext,
  call: ToolCallRequest,
): Promise<ToolExecution> {
  const inicio = Date.now();

  const auditar = (
    status: ToolCallStatus,
    reason: ToolRejectionReason | null,
    saida: ToolOutput | null,
    version: string,
  ) =>
    recordToolCall({
      runId: ctx.runId,
      userId: ctx.userId,
      stepId: ctx.stepId,
      toolName: call.toolName,
      toolVersion: version,
      providerCallId: call.callId,
      argumentos: call.input,
      status,
      rejectionReason: reason,
      recordsRead: saida?.contagem ?? null,
      durationMs: Date.now() - inicio,
      refs: saida?.refs ?? [],
    }).catch(() => {
      // ⚠️ Este `catch` NÃO cobre erro de banco: `supabase-js` devolve `{ error }` em vez de
      // lançar, e quem trata isso (com log operacional) é o próprio `audit.ts`. O que sobra
      // para cá é o que ainda PODE lançar antes da query — `createClient()`, que abre os
      // cookies da requisição. Falha de auditoria não derruba a resposta do usuário, mas
      // também não passa calada: o log sai de `audit.ts`.
    });

  const veredito = guardToolCall({
    toolName: call.toolName,
    registry: AI_TOOL_REGISTRY,
    agent: ctx.agent,
    permissions: ctx.permissions as Record<ToolPermission, boolean>,
    /**
     * ⚠️ `"proposta"` E NÃO `"somente_leitura"`, mesmo sem nenhuma ferramenta de escrita
     * existir hoje.
     *
     * Este é o laço da conversa, e é exatamente aqui que a escrita da 18-C deve ser
     * admitida — em modo proposta, que grava uma linha em `ai_action_proposals` e não toca
     * módulo nenhum. Declarar o modo errado agora faria a primeira ferramenta de escrita
     * ser recusada por `TOOL_WRITE_OUT_OF_BAND` e alguém "consertar" isso no lugar mais
     * fácil, que seria afrouxar o guard.
     *
     * O que continua impedindo qualquer escrita, hoje, são três coisas independentes:
     * nenhum descriptor com `kind: "escrita"`, nenhuma chave `allow_write_*` ligada, e o
     * registry de commands vazio em `approval/execute.ts`.
     */
    modo: "proposta",
    writePermissions: ctx.writePermissions,
  });

  if (!veredito.ok) {
    // Sem descriptor não há versão: `-` é o marcador de "a chamada nem chegou a uma
    // ferramenta". A coluna é NOT NULL, e inventar "1" mentiria sobre o que foi rejeitado.
    await auditar("rejeitada", veredito.reason, null, "-");
    return erro(call, veredito.reason, veredito.message);
  }

  const tool = veredito.tool;
  const entrada = TOOL_EXECUTORS[tool.name];
  if (!entrada) {
    // Registry e executores fora de sincronia. Há teste para isso; se chegar aqui em
    // produção, é rejeição, nunca execução às cegas.
    await auditar("rejeitada", "TOOL_UNKNOWN", null, tool.version);
    return erro(call, "TOOL_UNKNOWN", REJECTION_MESSAGE.TOOL_UNKNOWN);
  }

  const parsed = entrada.schema.safeParse(call.input ?? {});
  if (!parsed.success) {
    await auditar("rejeitada", "TOOL_INVALID_INPUT", null, tool.version);
    return erro(call, "TOOL_INVALID_INPUT", REJECTION_MESSAGE.TOOL_INVALID_INPUT);
  }

  let relogio: ReturnType<typeof setTimeout> | undefined;
  try {
    const saida = await Promise.race([
      entrada.run(parsed.data as never),
      new Promise<never>((_, reject) => {
        relogio = setTimeout(() => reject(new Error("TOOL_TIMEOUT")), tool.timeoutMs);
      }),
    ]);

    // Poda aplicada AQUI, depois da query e antes do modelo: o descriptor é a fonte do
    // limite, não o adapter — assim o teto é auditável num lugar só.
    const podada = podarSaida(saida, tool);

    await auditar("executada", null, podada, tool.version);

    return {
      callId: call.callId,
      toolName: call.toolName,
      isError: false,
      status: "executada",
      block: wrapUntrusted("resultado_de_ferramenta", tool.name, podada),
      recordsRead: podada.contagem,
    };
  } catch (e) {
    const timeout = e instanceof Error && e.message === "TOOL_TIMEOUT";
    await auditar(
      timeout ? "timeout" : "falhou",
      timeout ? "TOOL_TIMEOUT" : "TOOL_FAILED",
      null,
      tool.version,
    );
    return timeout
      ? erro(call, "TOOL_TIMEOUT", REJECTION_MESSAGE.TOOL_TIMEOUT, "timeout")
      : erro(call, "TOOL_FAILED", REJECTION_MESSAGE.TOOL_FAILED, "falhou");
  } finally {
    // Sem isto, uma ferramenta rápida deixaria o processo com um timer pendurado até o
    // prazo do descriptor — em teste, a suíte fica presa esperando o event loop esvaziar.
    if (relogio) clearTimeout(relogio);
  }
}
