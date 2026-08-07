/**
 * Fase 18-B — IA · A DECISÃO de admitir ou rejeitar uma chamada de ferramenta.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ PURO DE PROPÓSITO. A decisão de deixar uma ferramenta rodar não pode depender de       ║
 * ║ banco, de rede nem de ordem de `await` — senão ela é intestável, e uma trava           ║
 * ║ intestável é uma trava que ninguém sabe se funciona.                                   ║
 * ║                                                                                       ║
 * ║ A ORDEM DAS CHECAGENS NÃO É ESTILO:                                                    ║
 * ║  1. registry   — o nome existe?                                                        ║
 * ║  2. allowlist  — este agente pode ver esta ferramenta? (antes de tudo o mais, para a   ║
 * ║                  mensagem de erro não revelar se ela é de escrita nem se a flag do     ║
 * ║                  usuário está ligada)                                                  ║
 * ║  3. coerência  — o descriptor faz sentido?                                             ║
 * ║  4. modo       — 18-C: escrita só é admitida em MODO PROPOSTA                          ║
 * ║  5. permissão  — a flag `allow_*` de LEITURA do módulo está ligada?                    ║
 * ║  6. escrita    — 18-C: e a flag `allow_write_*` do módulo, também?                     ║
 * ║                                                                                       ║
 * ║ A ORDEM SOZINHA NÃO BASTA. Ela decide QUAL motivo sai; o que chega ao modelo é o       ║
 * ║ motivo PÚBLICO (`PUBLIC_REJECTION_CODE`), e "não existe" e "existe mas não é sua"      ║
 * ║ saem com código e texto IDÊNTICOS. Com códigos distintos, bastava o modelo chamar      ║
 * ║ nome por nome e comparar as respostas para mapear ferramentas de outros agentes. O     ║
 * ║ motivo verdadeiro continua inteiro na auditoria, que é onde ele serve para algo.       ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * A validação Zod da ENTRADA não mora aqui: o schema Zod vive junto do adapter, que é
 * `server-only`. Ela é o passo seguinte, no executor.
 */

import {
  isToolDescriptorCoherent,
  type ToolDescriptor,
  type ToolPermission,
  type ToolWritePermission,
} from "./contracts";

export type ToolRejectionReason =
  | "TOOL_UNKNOWN"
  | "TOOL_NOT_ALLOWED_FOR_AGENT"
  | "TOOL_INCOHERENT"
  | "TOOL_WRITE_DISABLED"
  | "TOOL_WRITE_OUT_OF_BAND"
  | "TOOL_PERMISSION_DENIED"
  | "TOOL_INVALID_INPUT"
  | "TOOL_TIMEOUT"
  | "TOOL_FAILED";

/**
 * O texto que volta AO MODELO como `tool-result` de erro. Ele é lido pelo modelo e pode
 * chegar ao usuário, então: pt-BR, sem jargão, sem nome de coluna, sem stack.
 */
const INDISPONIVEL =
  "Esta ferramenta não está disponível. Responda sem ela e diga o que não conseguiu consultar.";

export const REJECTION_MESSAGE: Record<ToolRejectionReason, string> = {
  // ⚠️ MESMO TEXTO de propósito — ver o cabeçalho. Um texto diferente para "não existe" e
  // para "existe e não é sua" é um oráculo: 20 chamadas mapeiam o registry inteiro.
  TOOL_UNKNOWN: INDISPONIVEL,
  TOOL_NOT_ALLOWED_FOR_AGENT: INDISPONIVEL,
  TOOL_INCOHERENT:
    "Esta ferramenta está indisponível por uma inconsistência de configuração. Responda sem ela.",
  // ⚠️ REESCRITA NA 18-C. A frase antiga ("esta versão do assistente só consulta") era
  // verdadeira enquanto NENHUMA escrita existia. Com a escrita ligável por módulo, ela vira
  // mentira exatamente como a trava de honestidade v1 virou na 18-B: o modelo repetiria ao
  // usuário que o assistente não altera nada, num sistema em que ele altera se a chave
  // estiver ligada. Este texto agora diz o que de fato aconteceu — a chave está desligada.
  TOOL_WRITE_DISABLED:
    "O usuário não autorizou a IA a alterar dados deste módulo. Explique isso, diga o que você faria se fosse autorizado e aponte as preferências de IA. Não tente outro caminho para o mesmo efeito.",
  // O laço pediu uma escrita fora do modo proposta. Isso é defeito NOSSO, não do usuário e
  // não do modelo — e o texto não pede ao modelo que resolva nada, porque ele não pode.
  TOOL_WRITE_OUT_OF_BAND:
    "Esta alteração não pôde ser preparada para confirmação. Diga que não conseguiu propor a alteração e não descreva o resultado como se ela tivesse acontecido.",
  TOOL_PERMISSION_DENIED:
    "O usuário ainda não autorizou a leitura deste módulo. Explique isso e diga que a autorização fica nas preferências de IA.",
  TOOL_INVALID_INPUT:
    "Os argumentos enviados não são válidos para esta ferramenta. Revise e tente uma única vez com argumentos corretos.",
  TOOL_TIMEOUT:
    "A consulta demorou demais e foi interrompida. Diga que não conseguiu obter o dado.",
  TOOL_FAILED:
    "A consulta falhou. Diga que não conseguiu obter o dado — não estime um valor.",
};

/**
 * O código que o MODELO vê. `TOOL_INDISPONIVEL` cobre os dois motivos que, juntos,
 * revelariam a existência de uma ferramenta de outro agente. Os demais são informativos e
 * ajudam o modelo a agir certo (revisar argumento, não repetir a chamada, apontar as
 * preferências) sem contar nada que ele já não pudesse deduzir da própria chamada.
 *
 * A auditoria grava o `ToolRejectionReason` verdadeiro — nada se perde, só não vaza.
 */
export const PUBLIC_REJECTION_CODE: Record<ToolRejectionReason, string> = {
  TOOL_UNKNOWN: "TOOL_INDISPONIVEL",
  TOOL_NOT_ALLOWED_FOR_AGENT: "TOOL_INDISPONIVEL",
  TOOL_INCOHERENT: "TOOL_INCOHERENT",
  TOOL_WRITE_DISABLED: "TOOL_WRITE_DISABLED",
  // ⚠️ SAI COMO `TOOL_INCOHERENT`, e não é descuido: escrita pedida fora do modo proposta é
  // erro de configuração NOSSO, e o modelo não tem o que fazer com a distinção. Contá-la
  // ainda por cima informaria que existe um modo em que aquela ferramenta rodaria.
  TOOL_WRITE_OUT_OF_BAND: "TOOL_INCOHERENT",
  TOOL_PERMISSION_DENIED: "TOOL_PERMISSION_DENIED",
  TOOL_INVALID_INPUT: "TOOL_INVALID_INPUT",
  TOOL_TIMEOUT: "TOOL_TIMEOUT",
  TOOL_FAILED: "TOOL_FAILED",
};

/**
 * 18-C — O MODO EM QUE A CHAMADA ESTÁ SENDO ADMITIDA.
 *
 * `"proposta"` é o único em que uma ferramenta de escrita passa, e ainda assim ela não
 * escreve: ela grava uma linha em `ai_action_proposals` e devolve o id ao modelo. Quem
 * executa é uma Server Action, fora do run, depois da confirmação do dono.
 *
 * ⚠️ NÃO TEM VALOR PADRÃO, DE PROPÓSITO. Quem chama o guard declara o modo por escrito; um
 * default `"proposta"` faria qualquer ponto novo do código herdar a permissão de escrita
 * sem que ninguém tivesse decidido isso — que é exatamente como uma trava dessas se perde.
 */
export type GuardMode = "proposta" | "somente_leitura";

export type GuardInput = {
  readonly toolName: string;
  readonly registry: readonly ToolDescriptor[];
  readonly agent: { readonly id: string; readonly allowedTools: readonly string[] };
  readonly permissions: Readonly<Record<ToolPermission, boolean>>;
  readonly modo: GuardMode;
  /**
   * As chaves `allow_write_*`. Separadas de `permissions` no TIPO porque são separadas na
   * decisão: nenhuma leitura consulta este objeto, e nenhuma escrita passa só com o outro.
   */
  readonly writePermissions: Readonly<Partial<Record<ToolWritePermission, boolean>>>;
};

export type GuardResult =
  | { readonly ok: true; readonly tool: ToolDescriptor }
  | {
      readonly ok: false;
      readonly reason: ToolRejectionReason;
      readonly message: string;
    };

function rejeitar(reason: ToolRejectionReason): GuardResult {
  return { ok: false, reason, message: REJECTION_MESSAGE[reason] };
}

export function guardToolCall(input: GuardInput): GuardResult {
  const tool = input.registry.find((t) => t.name === input.toolName);
  if (!tool) return rejeitar("TOOL_UNKNOWN");

  if (!input.agent.allowedTools.includes(tool.name)) {
    return rejeitar("TOOL_NOT_ALLOWED_FOR_AGENT");
  }

  if (!isToolDescriptorCoherent(tool)) return rejeitar("TOOL_INCOHERENT");

  if (tool.kind === "escrita" && input.modo !== "proposta") {
    return rejeitar("TOOL_WRITE_OUT_OF_BAND");
  }

  /**
   * A chave de LEITURA do módulo, para escrita também. Ver o cabeçalho de
   * `TOOL_WRITE_PERMISSIONS`: propor uma alteração começa por resolver de qual registro se
   * está falando, e isso é ler. Vem ANTES da chave de escrita porque é a mais ampla — e
   * porque a mensagem dela ("autorize a leitura nas preferências") é a que orienta certo
   * quem não ligou nada ainda.
   */
  if (input.permissions[tool.requiredPermission] !== true) {
    return rejeitar("TOOL_PERMISSION_DENIED");
  }

  if (tool.kind === "escrita") {
    // `isToolDescriptorCoherent` já garantiu que a chave existe; a checagem repetida é para
    // o TypeScript e para o caso de alguém afrouxar a coerência sem olhar para cá.
    const chave = tool.requiredWritePermission;
    if (!chave || input.writePermissions[chave] !== true) {
      return rejeitar("TOOL_WRITE_DISABLED");
    }
  }

  return { ok: true, tool };
}
