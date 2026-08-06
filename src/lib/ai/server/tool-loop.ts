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
    // dois `kind` do passo — a unicidade é `(run_id, step_index, kind)`.
    const indice = passo + 1;

    const stepModelo = await startStep({
      runId: input.ctxBase.runId,
      userId: input.ctxBase.userId,
      stepIndex: indice,
      kind: "modelo",
    });
    const inicioModelo = Date.now();

    let inesperada: string | null = null;

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

    if (stepModelo) {
      await closeStep({
        runId: input.ctxBase.runId,
        stepId: stepModelo,
        userId: input.ctxBase.userId,
        status: inesperada ? "failed" : "completed",
        durationMs: Date.now() - inicioModelo,
      });
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
