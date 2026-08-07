/**
 * Fase 18-B — IA · As FONTES de uma resposta, prontas para a tela. Puro, sem I/O.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ O QUE A AUDITORIA GUARDA — E O QUE ELA DELIBERADAMENTE NÃO GUARDA                     ║
 * ║                                                                                       ║
 * ║ `ai_tool_calls` grava o que foi PEDIDO (`arguments_sanitized`), QUANTO foi encontrado  ║
 * ║ (`records_read`) e PARA ONDE apontar (`refs`). NÃO grava o resultado — seria uma       ║
 * ║ segunda cópia dos dados pessoais do usuário dentro do módulo de IA.                   ║
 * ║                                                                                       ║
 * ║ Consequência que esta tela precisa respeitar: `completude`, `motivo_incompleto` e      ║
 * ║ `itens_truncados` NÃO existem aqui. Nenhum deles é inventado, e a tela não afirma nem  ║
 * ║ que o dado estava completo nem que estava incompleto.                                  ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * ⚠️ **`records_read` é `ToolOutput.contagem` — QUANTOS EXISTEM no período, não quantos itens
 * chegaram ao modelo.** Com a poda por orçamento de caracteres (`executor.ts`) os dois números
 * divergem de propósito: contagem 40 com 12 itens enviados é comportamento correto. Por isso o
 * rótulo desta tela é "registros encontrados", nunca "registros lidos pelo assistente".
 *
 * ⚠️ **Passo `started` NÃO é "em andamento".** `ai_run_steps` não é lido aqui, e o motivo é
 * concreto: quando o processo morre (timeout de plataforma, deploy no meio do stream) sobra
 * passo aberto sob run terminal, e `ai_reconcile_abandoned_runs` não toca `ai_run_steps`. Quem
 * responde "ainda está rodando?" é o STATUS DO RUN — ver `execucaoEmAndamento`.
 */

import type { ToolCallStatus, ToolRef } from "./contracts";
// `import type`: apagado na compilação, então não há ciclo em runtime com `../types`.
import type { RunStatus } from "../types";

/** Uma linha de `ai_tool_calls`, já saneada para a tela. */
export type ToolCallRecord = {
  readonly toolName: string;
  /** `"-"` é MARCADOR de "a chamada nem chegou a uma ferramenta", nunca uma versão. */
  readonly toolVersion: string;
  readonly status: ToolCallStatus;
  readonly rejectionReason: string | null;
  /** `null` = não houve leitura (rejeição, falha, timeout). NUNCA zero por ausência. */
  readonly recordsRead: number | null;
  readonly durationMs: number | null;
  readonly refs: readonly ToolRef[];
  readonly argumentos: readonly ArgumentoExibido[];
  readonly createdAt: string;
};

export type ArgumentoExibido = { readonly chave: string; readonly valor: string };

export type RunSources = {
  readonly runId: string;
  readonly chamadas: readonly ToolCallRecord[];
};

/**
 * O status do run, no vocabulário de `ai_runs.status`. Importado de `types.ts` em vez de
 * reescrito: uma segunda união divergiria no dia em que um status novo entrasse, e esta
 * função continuaria dizendo "terminou" sobre um estado que ela não conhece.
 */
export type RunStatusParaFontes = RunStatus;

/**
 * A execução ainda está viva? Sai do RUN, e só dele.
 *
 * Ler `ai_run_steps.status = 'started'` daria "em andamento" para sempre num run que morreu
 * junto com o processo — o `finally` do laço não roda quando a plataforma corta, e não há
 * reconciliador para os passos.
 */
export function execucaoEmAndamento(status: RunStatusParaFontes): boolean {
  return status === "reserved" || status === "streaming";
}

export type ResumoDasFontes = {
  readonly chamadas: number;
  readonly executadas: number;
  /** Rejeitadas, falhas e timeouts: a ferramenta foi pedida e NÃO trouxe dado. */
  readonly semLeitura: number;
  /**
   * Soma de `records_read` das chamadas executadas. `null` quando nenhuma executou —
   * ausência não é zero. `parcial` marca que alguma executada não informou a contagem.
   */
  readonly registrosEncontrados: number | null;
  readonly parcial: boolean;
};

export function resumirFontes(chamadas: readonly ToolCallRecord[]): ResumoDasFontes {
  const executadas = chamadas.filter((c) => c.status === "executada");

  let soma = 0;
  let parcial = false;
  for (const c of executadas) {
    if (c.recordsRead === null) parcial = true;
    else soma += c.recordsRead;
  }

  return {
    chamadas: chamadas.length,
    executadas: executadas.length,
    semLeitura: chamadas.length - executadas.length,
    registrosEncontrados: executadas.length === 0 ? null : soma,
    parcial,
  };
}

/**
 * A versão da ferramenta, só quando ela existe. `"-"` é o marcador que o executor grava
 * quando a chamada foi rejeitada ANTES de chegar a um descriptor (`ai_tool_calls.tool_version`
 * é NOT NULL, e inventar `"1"` mentiria sobre o que foi rejeitado). Mostrar "versão -" na tela
 * seria transformar o marcador em dado.
 */
export function versaoVisivel(toolVersion: string): string | null {
  const limpo = toolVersion.trim();
  return limpo === "" || limpo === "-" ? null : limpo;
}

/**
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ `refs` VEM DE JSONB E VIRA `href`. É O ÚNICO CAMPO DESTA TELA QUE VIRA NAVEGAÇÃO.      ║
 * ║                                                                                       ║
 * ║ Hoje quem o escreve é o adapter (código nosso), mas a coluna é `jsonb` livre e a       ║
 * ║ tabela é imutável: uma linha malformada — de um adapter futuro, de um `refs` gravado   ║
 * ║ com `javascript:` ou `https://…` — ficaria lá para sempre virando link a cada leitura. ║
 * ║ Aceitamos SÓ caminho interno absoluto (`/…`), e nunca `//` (que o navegador trata      ║
 * ║ como protocolo-relativo e sai do domínio). O que não casa é descartado, não corrigido. ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */
export function parseRefs(valor: unknown): ToolRef[] {
  if (!Array.isArray(valor)) return [];

  const saida: ToolRef[] = [];
  for (const item of valor) {
    if (typeof item !== "object" || item === null) continue;
    const bruto = item as Record<string, unknown>;
    const { tipo, id, rota } = bruto;
    if (typeof tipo !== "string" || typeof id !== "string" || typeof rota !== "string") {
      continue;
    }
    if (!rota.startsWith("/") || rota.startsWith("//")) continue;
    if (tipo.trim() === "" || id.trim() === "") continue;
    saida.push({ tipo, id, rota });
  }
  return saida;
}

/** Teto do texto de um argumento na tela. O valor veio do MODELO — pode ser lixo longo. */
export const MAX_ARGUMENTO_CHARS = 60;

/**
 * Os argumentos que o modelo pediu, achatados para exibição.
 *
 * Só primitivo: objeto e vetor aninhados não são exibidos porque nenhuma ferramenta desta
 * subfase os recebe, e renderizar JSON cru numa tela de auditoria convida a ler o valor como
 * se fosse resultado. `null` aparece como texto explícito — some seria pior.
 */
export function parseArgumentos(valor: unknown): ArgumentoExibido[] {
  if (typeof valor !== "object" || valor === null || Array.isArray(valor)) return [];

  const saida: ArgumentoExibido[] = [];
  for (const [chave, bruto] of Object.entries(valor as Record<string, unknown>)) {
    if (typeof bruto === "object" && bruto !== null) continue;
    const texto = bruto === undefined ? "" : String(bruto);
    if (texto === "") continue;
    saida.push({
      chave: chave.slice(0, MAX_ARGUMENTO_CHARS),
      valor:
        texto.length > MAX_ARGUMENTO_CHARS
          ? `${texto.slice(0, MAX_ARGUMENTO_CHARS)}…`
          : texto,
    });
  }
  return saida;
}
