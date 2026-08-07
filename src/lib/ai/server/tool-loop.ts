import "server-only";

/**
 * Fase 18-B — IA · O laço de ferramentas. É NOSSO, não do SDK.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ Uma volta = uma chamada ao modelo. Se ela terminar pedindo ferramenta, executamos as  ║
 * ║ ferramentas pelo Tool Executor, acrescentamos o resultado ao histórico COMO BLOCO NÃO ║
 * ║ CONFIÁVEL e voltamos ao modelo. Estourado `MAX_TOOL_STEPS`, paramos — e a resposta    ║
 * ║ DECLARA o corte.                                                                       ║
 * ║                                                                                       ║
 * ║ Este arquivo NÃO fala com o provedor: ele recebe uma função `chamarModelo` e devolve  ║
 * ║ eventos. É o que o mantém testável sem rede — e é o que permite ao chat-runner        ║
 * ║ continuar sendo o único dono de tentativa, medição e fallback.                        ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * ═══════════════════════ ONDE O RESULTADO ENTRA (e onde NUNCA entra) ═══════════════════
 *
 * O resultado de ferramenta volta ao modelo em mensagem de papel `tool`, dentro de uma parte
 * `tool-result`, com o texto de `renderUntrusted` — que põe o aviso ANTES do bloco. Não há
 * neste arquivo nenhum caminho que produza `role: "system"`: instrução tem uma fonte só
 * (`agents/security-prompt.ts` + o perfil), e dado recuperado nunca é instrução.
 */

import type { AiContentPart, AiMessage, AiStreamEvent } from "@/lib/ai/core/contracts";
import { renderUntrusted, wrapUntrusted } from "@/lib/ai/security/untrusted";
import {
  AVISO_TETO_DE_PASSOS,
  MAX_TOOLS_POR_PASSO,
  MAX_TOOL_STEPS,
} from "@/lib/ai/tools/limits";
import {
  executeTool,
  type ToolCallRequest,
  type ToolExecutionContext,
} from "@/lib/ai/tools/executor";
import type { ToolCallStatus } from "@/lib/ai/tools/audit";
import { closeStep, startStep } from "@/lib/ai/tools/audit";

/**
 * Sem linha em `ai_run_steps` não há `step_id`, e sem `step_id` a chamada de ferramenta não
 * pode ser auditada (`ai_tool_calls.step_id` é NOT NULL). Executar assim mesmo seria ler
 * dado do usuário SEM TRILHA — exatamente o que a subfase existe para impedir. Então não
 * lemos, e dizemos que não lemos.
 */
export const AVISO_SEM_AUDITORIA =
  "A consulta não foi executada: não foi possível registrar a leitura na trilha de auditoria, e nenhuma leitura acontece sem registro.";

export type ToolLoopEvent =
  | { readonly type: "delta"; readonly text: string }
  | {
      readonly type: "tool";
      readonly toolName: string;
      readonly status: ToolCallStatus;
      readonly registros: number;
    }
  /** Texto que o USUÁRIO precisa ver junto da resposta. Vai para a mensagem do assistente. */
  | { readonly type: "aviso"; readonly texto: string }
  /**
   * O provedor pediu uma ferramenta que NÃO foi oferecida nesta chamada. Não executamos,
   * não interpretamos e não seguimos: quem decide o que fazer é o chat-runner, que encerra
   * o run como `failed` com `UNEXPECTED_TOOL_CALL`.
   */
  | { readonly type: "tool-call-inesperada"; readonly toolName: string }
  | { readonly type: "passthrough"; readonly evento: AiStreamEvent };

export type ToolLoopInput = {
  readonly ctxBase: Omit<ToolExecutionContext, "stepId">;
  readonly mensagensIniciais: readonly AiMessage[];
  /**
   * Os nomes que FORAM enviados ao provedor nesta requisição (a allowlist do agente já
   * resolvida contra o registry). Qualquer outro nome que volte é chamada inesperada.
   */
  readonly ferramentasOferecidas: readonly string[];
  /**
   * O próximo `step_index` DO RUN — não do laço.
   *
   * ⚠️ `ai_run_steps_run_index_uidx` é `UNIQUE (run_id, step_index, kind)`, e o `run_id` é UM
   * SÓ para toda a cadeia de tentativas: `beginChatRun` roda uma vez, antes do retry e do
   * fallback. Um índice que reinicia a cada volta do laço faz a segunda tentativa inserir
   * `(run, 1, 'modelo')` que já existe → `23505` → `startStep` devolve `null` (ele loga e não
   * lança) → "sem trilha, sem leitura" bloqueia a execução de TODA leitura depois do primeiro
   * retry. Por isso quem numera é o dono do run, e o laço só pede o próximo.
   */
  readonly proximoStepIndex: () => number;
  readonly chamarModelo: (
    mensagens: readonly AiMessage[],
    passo: number,
  ) => AsyncIterable<AiStreamEvent>;
};

export async function* runToolLoop(
  input: ToolLoopInput,
): AsyncGenerator<ToolLoopEvent> {
  const mensagens: AiMessage[] = [...input.mensagensIniciais];
  const oferecidas = new Set(input.ferramentasOferecidas);

  for (let passo = 0; passo <= MAX_TOOL_STEPS; passo += 1) {
    const chamadas: ToolCallRequest[] = [];
    const partesDoAssistente: AiContentPart[] = [];
    let texto = "";

    // `step_index` é base 1 no banco (CHECK `step_index >= 1`), e o índice é o mesmo para os
    // dois `kind` do passo — a unicidade é `(run_id, step_index, kind)`. Quem conta é o run.
    const indice = input.proximoStepIndex();

    /**
     * ⚠️ ASSIMETRIA DELIBERADA — falhar ao abrir ESTE passo não bloqueia nada, e falhar ao
     * abrir o de `ferramentas` (mais abaixo) bloqueia tudo.
     *
     * O passo `modelo` não lê registro nenhum do usuário: ele registra que houve uma chamada
     * ao provedor. O passo `ferramentas` é o que ampara a LEITURA — `ai_tool_calls.step_id` é
     * NOT NULL, então sem ele a consulta aconteceria sem trilha. Derrubar a conversa inteira
     * por causa de uma linha de auditoria da chamada ao modelo seria trocar um buraco na
     * trilha por um sistema que não responde; o inverso, executar leitura sem registro, é
     * exatamente o que a subfase existe para impedir. A regra em uma frase: **sem trilha, sem
     * LEITURA** — não "sem trilha, sem resposta".
     */
    const stepModelo = await startStep({
      runId: input.ctxBase.runId,
      userId: input.ctxBase.userId,
      stepIndex: indice,
      kind: "modelo",
    });
    const inicioModelo = Date.now();

    let inesperada: string | null = null;
    /**
     * ⚠️ Falso enquanto o `for await` abaixo não chegar ao fim POR CONTA PRÓPRIA. Quando o
     * consumidor abandona este gerador (o chat-runner dá `break` no evento `error` do
     * provedor, ou o navegador fecha a aba), o JS chama `.return()` no ponto do `yield` — que
     * está DENTRO do `for await`. Sem o `finally`, o passo ficaria `started` para sempre:
     * `ai_reconcile_abandoned_runs` **não toca `ai_run_steps`** (ela mexe em `ai_runs`,
     * `ai_usage_events` e `ai_messages` — conferido na migration), e não há policy de
     * DELETE em `ai_run_steps`. O `finally` de um async generator roda no `.return()`, e é o
     * que faz a queda da aba fechar o passo também.
     *
     * ⚠️ O que o `finally` NÃO cobre: a morte do processo (timeout da plataforma, deploy no
     * meio do stream). Ali não roda JS nenhum, e `ai_reconcile_abandoned_runs` continua sem
     * tocar `ai_run_steps`. Sobra passo `started` sob run terminal — a tela de rastreabilidade
     * não pode ler isso como "em andamento": quem manda é o status do RUN.
     */
    let modeloTerminouSozinho = false;

    try {
      for await (const evento of input.chamarModelo(mensagens, passo)) {
        if (evento.type === "delta") {
          texto += evento.text;
          yield { type: "delta", text: evento.text };
          continue;
        }
        if (evento.type === "tool-call") {
          if (!oferecidas.has(evento.toolName)) {
            inesperada = evento.toolName;
            break;
          }
          chamadas.push({
            callId: evento.callId,
            toolName: evento.toolName,
            input: evento.input,
          });
          partesDoAssistente.push({
            type: "tool-call",
            callId: evento.callId,
            toolName: evento.toolName,
            input: evento.input,
          });
          continue;
        }
        // `finish` e `error` são do chat-runner: ele fecha estado, mede uso e decide fallback.
        yield { type: "passthrough", evento };
      }
      modeloTerminouSozinho = true;
    } finally {
      if (stepModelo) {
        // Lançar DAQUI sobrescreveria o erro real da tentativa: este `finally` roda enquanto a
        // exceção do provedor sobe, e o `catch` do chat-runner registraria `STREAM_FAILED` no
        // lugar do `PROVIDER_5XX` que de fato aconteceu — diagnóstico errado no log, sobre o
        // caminho em que mais se precisa dele. `closeStep` já é escrito para não lançar (lê
        // `{ error }` e loga); o que ainda pode escapar é o `await createClient()` dentro dele.
        try {
          await closeStep({
            runId: input.ctxBase.runId,
            stepId: stepModelo,
            userId: input.ctxBase.userId,
            status: modeloTerminouSozinho && !inesperada ? "completed" : "failed",
            durationMs: Date.now() - inicioModelo,
          });
        } catch {
          // Engolido de propósito, e só aqui: a falha de trilha não pode mascarar a falha real.
        }
      }
    }

    if (inesperada) {
      yield { type: "tool-call-inesperada", toolName: inesperada };
      return;
    }

    // Sem ferramenta pedida: o modelo respondeu. Fim do laço.
    if (chamadas.length === 0) return;

    // Teto atingido: NÃO executamos mais nada e a resposta declara o corte.
    if (passo === MAX_TOOL_STEPS) {
      yield { type: "aviso", texto: AVISO_TETO_DE_PASSOS };
      return;
    }

    // O outro lado da assimetria explicada no passo `modelo`: ESTE é o que ampara a leitura,
    // e sem ele nada roda.
    const stepFerramentas = await startStep({
      runId: input.ctxBase.runId,
      userId: input.ctxBase.userId,
      stepIndex: indice,
      kind: "ferramentas",
    });

    if (!stepFerramentas) {
      yield { type: "aviso", texto: AVISO_SEM_AUDITORIA };
      return;
    }

    const inicioFerramentas = Date.now();

    // Excedente do passo é RECUSADO, não executado — e o modelo recebe o resultado das que
    // couberam, então ele sabe o que aconteceu.
    const aExecutar = chamadas.slice(0, MAX_TOOLS_POR_PASSO);

    const resultados = await Promise.all(
      aExecutar.map((call) =>
        executeTool({ ...input.ctxBase, stepId: stepFerramentas }, call),
      ),
    );

    await closeStep({
      runId: input.ctxBase.runId,
      stepId: stepFerramentas,
      userId: input.ctxBase.userId,
      status: "completed",
      durationMs: Date.now() - inicioFerramentas,
    });

    for (const r of resultados) {
      yield {
        type: "tool",
        toolName: r.toolName,
        status: r.status,
        registros: r.recordsRead,
      };
    }

    // O turno do assistente precisa ir junto, com TODAS as tool-calls, senão o provedor
    // recusa o tool-result órfão (a Anthropic responde 400 a `tool_use` sem par).
    if (texto) partesDoAssistente.unshift({ type: "text", text: texto });
    mensagens.push({ role: "assistant", content: partesDoAssistente });

    /**
     * O excedente do passo NÃO roda — mas também não some. Cada chamada recusada volta com
     * o SEU `tool-result` de erro, pelos dois motivos ao mesmo tempo: o modelo precisa saber
     * que aquela consulta não aconteceu (senão responde como se tivesse recebido tudo), e
     * `tool_use` sem `tool_result` é 400 na Anthropic.
     */
    const recusadas = chamadas.slice(aExecutar.length).map((call) => ({
      type: "tool-result" as const,
      callId: call.callId,
      toolName: call.toolName,
      output: {
        texto: renderUntrusted(
          wrapUntrusted("resultado_de_ferramenta", call.toolName, {
            erro: "TOOL_LIMITE_POR_PASSO",
            mensagem: `Esta consulta não foi executada: foram pedidas ${chamadas.length} de uma vez e o limite é ${MAX_TOOLS_POR_PASSO} por passo. Peça de novo, uma por vez, se ainda precisar dela.`,
          }),
        ),
      },
      isError: true,
    }));

    mensagens.push({
      role: "tool",
      content: [
        ...resultados.map((r) => ({
          type: "tool-result" as const,
          callId: r.callId,
          toolName: r.toolName,
          // `renderUntrusted` põe o aviso ANTES do bloco: instrução que vier dentro do dado
          // é conteúdo relatado, nunca ordem.
          output: { texto: renderUntrusted(r.block) },
          isError: r.isError,
        })),
        ...recusadas,
      ],
    });
  }
}
