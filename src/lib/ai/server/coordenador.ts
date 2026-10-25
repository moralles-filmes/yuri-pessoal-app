import "server-only";

/**
 * Chat livre com coordenador · Task 12 — O COORDENADOR: decisão, resposta direta e modo direto.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ UMA MENSAGEM LIVRE, TRÊS DESFECHOS (spec §4.1):                                       ║
 * ║                                                                                       ║
 * ║  • o coordenador responde sem acionar ninguém ("oi") → o texto dele é a resposta;     ║
 * ║  • aciona UM especialista → o especialista responde direto (modo direto, §4.4);       ║
 * ║  • aciona dois ou mais → especialistas em paralelo + síntese (Task 13).               ║
 * ║                                                                                       ║
 * ║ ⛔ NÃO É UM TERCEIRO LAÇO DE TENTATIVAS. Coordenador e especialista são TRILHAS do    ║
 * ║ mesmo run, e cada uma passa por `runTrilha` (`./trilha`). E este arquivo também NÃO   ║
 * ║ FECHA O RUN: ele devolve um desfecho, e `runChat` decide (spec §5.1).                 ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * ⛔ A ESCOLHA DO MODELO DECIDE A QUEM PERGUNTAR, NUNCA QUE PERMISSÃO USAR (§4.2.4). O
 * coordenador só vê como ferramenta os especialistas que `catalogoDeEspecialistas` ofereceu —
 * derivado das chaves do dono —, e cada pedido passa por `decidirAcionamentos` antes de virar
 * trilha. O especialista acionado lê pelo Tool Executor de sempre, com a allowlist e o guard
 * dele: acionar não é ferramenta do registry, porque não lê dado nenhum.
 */

import type { AiMessage } from "@/lib/ai/core/contracts";
import { aiError, type AiError } from "@/lib/ai/core/errors";
import { normalizarAlternancia, textoDasMensagens } from "@/lib/ai/core/text";
import {
  AI_AGENT_REGISTRY,
  ASSISTENTE_PESSOAL_ID,
  buildSystemPrompt,
  findAgent,
  promptVersionOf,
  type AiAgentProfile,
} from "@/lib/ai/agents/registry";
import {
  catalogoDeEspecialistas,
  decidirAcionamentos,
  definicoesDeAcionamento,
  MAX_TAREFA_CHARS,
  MOTIVO_PARA_AUDITORIA,
  type Acionamento,
  type DecisaoDeAcionamentos,
  type EspecialistaOferecido,
} from "@/lib/ai/agents/especialistas";
import {
  avisoCruzarModulos,
  avisoSemEspecialista,
  blocoDaData,
  blocoDoCoordenador,
} from "@/lib/ai/agents/blocos-do-servidor";
import { moduloDoAgente } from "@/lib/ai/agents/routing";
import type { MemoriaParaPrompt } from "@/lib/ai/memory/contracts";
import { memoriasParaOPrompt } from "@/lib/ai/memory/prompt";
import { closeStep, startStep } from "@/lib/ai/tools/audit";
import { toolDefinitionsFor } from "@/lib/ai/tools/registry";
import type { AiPreferencesView } from "@/lib/ai/types";
import { estimarTokensDeEntrada, TETO_SAIDA_DECISAO } from "@/lib/ai/usage/reservation";
import type { ChatRunnerEvent } from "./chat-runner";
import type { Prazo } from "./prazo";
import { registrarAcionamento } from "./run-store";
import { montarSystem } from "./system-prompt";
import { AVISO_SEM_AUDITORIA } from "./tool-loop";
import {
  runTrilha,
  type Alvo,
  type ContadoresDoRun,
  type DesfechoDaTrilha,
  type EventoDaTrilha,
} from "./trilha";

/** Uma mensagem do histórico como `getHistoryForPrompt` a devolve: texto, não partes. */
export type MensagemDoHistorico = {
  readonly role: "user" | "assistant";
  readonly content: string;
};

export type EntradaDoCoordenador = {
  readonly run: {
    readonly runId: string;
    readonly conversationId: string;
    readonly userId: string;
    readonly assistantMessageId: string;
  };
  readonly texto: string;
  /**
   * ⚠️ Texto, não `AiMessage`: `normalizarAlternancia` funde dois `user` seguidos pelo
   * conteúdo, e só sabe fazer isso com string. É o que `getHistoryForPrompt` já devolve.
   */
  readonly historico: readonly MensagemDoHistorico[];
  /** O mesmo objeto que `getAiPreferences` devolve. */
  readonly prefs: AiPreferencesView;
  /** `getMemoriasVigentes` — vazio sem `allow_memory`. A SELEÇÃO acontece aqui, por trilha. */
  readonly memorias: readonly MemoriaParaPrompt[];
  readonly alvos: readonly Alvo[];
  readonly config: { readonly timeoutMs: number; readonly maxRetries: number };
  readonly fallbackLigado: boolean;
  readonly contadores: ContadoresDoRun;
  readonly prazo: Prazo;
  readonly agora: Date;
  readonly agoraMs: () => number;
  readonly abortSignal: AbortSignal;
  readonly hoje: string;
  readonly reservaRestante: () => number;
  readonly aoGastar: (usd: number) => void;
};

export type DesfechoDoCoordenador =
  | {
      readonly ok: true;
      readonly texto: string;
      readonly finishReason: string;
      readonly alvo: Alvo;
    }
  | {
      readonly ok: false;
      readonly erro: AiError;
      readonly cancelado: boolean;
      /** O porquê de não ter havido retry nem fallback, quando a trilha o deu (`runTrilha`). */
      readonly motivo?: string;
    };

/**
 * Os blocos do servidor entram SEPARADOS da base e entre si: `montarSystem` concatena sem
 * separador (cada bloco traz o seu), e a data e o bloco do coordenador são frases soltas.
 * É o mesmo separador que `buildSystemPrompt` põe entre a segurança e o perfil.
 */
function secao(bloco: string): string {
  return `\n\n---\n\n${bloco}`;
}

/** O perfil do coordenador — `runChat` precisa dele antes da admissão (versão e capacidades). */
export function perfilDoCoordenador(): AiAgentProfile {
  const perfil = findAgent(ASSISTENTE_PESSOAL_ID);
  // O coordenador é o `assistente-pessoal` (spec §4.2.1). Sem ele no registry, não há chat.
  if (!perfil) throw new Error("O coordenador não está no registry de agentes.");
  return perfil;
}

/**
 * O que o passo de DECISÃO manda ao provedor: system, mensagens e quem é oferecido.
 *
 * Função pura e exportada porque `runChat` precisa do MESMO prompt para a reserva, antes da
 * admissão, e o coordenador para a chamada, depois dela. Duas montagens divergiriam na
 * primeira edição — e a reserva passaria a proteger um prompt que não é o enviado.
 *
 * ⚠️ A ordem das mensagens: histórico, depois o texto do dono, e SÓ ENTÃO a normalização. Se a
 * última resposta falhou, o histórico termina em `user` (a falha não entra) e o texto novo
 * viraria um segundo `user` seguido — que vários provedores recusam (MOD-ia-027).
 */
export function prepararDecisao(input: {
  readonly prefs: AiPreferencesView;
  readonly memorias: readonly MemoriaParaPrompt[];
  readonly agora: Date;
  readonly historico: readonly MensagemDoHistorico[];
  readonly texto: string;
}): {
  readonly system: string;
  readonly mensagens: readonly AiMessage[];
  readonly ofertas: readonly EspecialistaOferecido[];
  readonly desligados: readonly string[];
} {
  const { permissions, writePermissions } = input.prefs;
  const { ofertas, desligados } = catalogoDeEspecialistas(permissions, writePermissions);

  /**
   * ⛔ A MEMÓRIA ENTRA POR ÚLTIMO, por `montarSystem` (invariante 98). O coordenador não tem
   * módulo: a seleção é a GLOBAL (`moduloDoAgente: null`), e memória de módulo fica para o
   * especialista daquele módulo — com a `allow_*` dele (invariante 26).
   */
  const system = montarSystem({
    base: buildSystemPrompt(perfilDoCoordenador()),
    blocos: [
      secao(blocoDaData(input.agora)),
      secao(
        blocoDoCoordenador({
          ofertas,
          desligados,
          allowCrossModule: input.prefs.allowCrossModule,
        }),
      ),
    ],
    memorias: memoriasParaOPrompt({
      memorias: input.memorias,
      moduloDoAgente: null,
      permissions,
      allowMemory: permissions.allow_memory,
    }),
  });

  const mensagens = normalizarAlternancia([
    ...input.historico.map((m) => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: input.texto },
  ]);

  return { system, mensagens, ofertas, desligados };
}

/**
 * O `system` de UM especialista: segurança + perfil, a data, e a memória DO MÓDULO DELE por
 * último (spec §4.3.3). A seleção usa o módulo do ESPECIALISTA, e a chave exigida continua
 * sendo a do módulo da memória (invariante 26).
 */
function sistemaDoEspecialista(
  esp: AiAgentProfile,
  prefs: AiPreferencesView,
  memorias: readonly MemoriaParaPrompt[],
  agora: Date,
): string {
  return montarSystem({
    base: buildSystemPrompt(esp),
    blocos: [secao(blocoDaData(agora))],
    memorias: memoriasParaOPrompt({
      memorias,
      moduloDoAgente: moduloDoAgente(esp.id),
      permissions: prefs.permissions,
      allowMemory: prefs.permissions.allow_memory,
    }),
  });
}

/**
 * Tokens de entrada do MAIOR especialista possível, para a reserva (`computeReservationDoCoordenador`).
 *
 * ⛔ Sobre o REGISTRY inteiro, nunca sobre os oferecidos nesta mensagem: a reserva sai de
 * constantes do servidor, não da lista em runtime (a lição da invariante 101). A tarefa entra
 * pelo seu teto, `MAX_TAREFA_CHARS`, porque ela só existe depois da decisão.
 */
export function tokensDoMaiorEspecialista(input: {
  readonly prefs: AiPreferencesView;
  readonly memorias: readonly MemoriaParaPrompt[];
  readonly agora: Date;
}): number {
  let maior = 0;
  for (const esp of AI_AGENT_REGISTRY) {
    // O coordenador nunca é especialista de si mesmo (`catalogoDeEspecialistas` o pula).
    if (esp.id === ASSISTENTE_PESSOAL_ID) continue;
    const system = sistemaDoEspecialista(esp, input.prefs, input.memorias, input.agora);
    maior = Math.max(maior, estimarTokensDeEntrada(system + "x".repeat(MAX_TAREFA_CHARS)));
  }
  return maior;
}

/**
 * Converte os eventos de UMA trilha em eventos do chat.
 *
 * - `delta` passa (ou fica RETIDO, no passo de decisão — ver `reter`);
 * - `aviso` (o corte pelo teto de passos, texto do servidor) vira `delta` com o mesmo
 *   separador que a trilha usou no desfecho, para o texto da tela e o gravado coincidirem;
 * - `switch` e `proposta` saem com a TRILHA — é por ela que a tela remove só os cartões da
 *   trilha que recomeçou (Review Focus 2);
 * - `switch` zera o texto acumulado aqui, como a trilha zera o dela (invariante 23).
 *
 * ⚠️ `next()` à mão e `return()` no `finally`: abandonar este gerador (a aba fechou) tem de
 * chegar ao `finally` de `runTrilha`, que fecha a tentativa aberta como `cancelled` antes de
 * `runChat` fechar o run. Delegado por `yield*`, o `return()` de quem chama chega até aqui.
 */
export async function* eventosDaTrilha(
  trilha: AsyncGenerator<EventoDaTrilha, DesfechoDaTrilha>,
  numero: number,
  opcoes: { readonly reter: boolean },
): AsyncGenerator<ChatRunnerEvent, DesfechoDaTrilha> {
  let texto = "";
  let desfecho: DesfechoDaTrilha | null = null;
  try {
    for (;;) {
      const passo = await trilha.next();
      if (passo.done) {
        desfecho = passo.value;
        return desfecho;
      }
      const evento = passo.value;
      switch (evento.type) {
        case "delta":
          texto += evento.text;
          if (!opcoes.reter) yield { type: "delta", text: evento.text };
          break;
        case "aviso": {
          const trecho = texto === "" ? evento.texto : `\n\n${evento.texto}`;
          texto += trecho;
          if (!opcoes.reter) yield { type: "delta", text: trecho };
          break;
        }
        case "switch":
          texto = "";
          yield { ...evento, trilha: numero };
          break;
        case "proposta":
          yield { type: "proposta", proposta: evento.proposta, trilha: numero };
          break;
        case "tool":
          yield evento;
          break;
        default: {
          // Evento novo em `EventoDaTrilha` sem tratamento aqui é erro de compilação, não um
          // evento descartado em silêncio (a lição de `chat-events.test.ts`).
          const naoTratado: never = evento;
          throw new Error(`Evento de trilha não tratado: ${JSON.stringify(naoTratado)}`);
        }
      }
    }
  } finally {
    if (desfecho === null) {
      await trilha.return({
        ok: false,
        erro: aiError("CANCELADO_PELO_USUARIO", "CANCELLED"),
        cancelado: true,
      });
    }
  }
}

export async function* conduzirCoordenador(
  e: EntradaDoCoordenador,
): AsyncGenerator<ChatRunnerEvent, DesfechoDoCoordenador> {
  const coordenador = perfilDoCoordenador();
  const { permissions, writePermissions } = e.prefs;
  const decisao = prepararDecisao({
    prefs: e.prefs,
    memorias: e.memorias,
    agora: e.agora,
    historico: e.historico,
    texto: e.texto,
  });

  const comum = {
    run: { runId: e.run.runId, conversationId: e.run.conversationId, userId: e.run.userId },
    alvos: e.alvos,
    config: e.config,
    fallbackLigado: e.fallbackLigado,
    permissions,
    writePermissions,
    contadores: e.contadores,
    prazo: e.prazo,
    agoraMs: e.agoraMs,
    abortSignal: e.abortSignal,
    hoje: e.hoje,
    reservaRestante: e.reservaRestante,
    aoGastar: e.aoGastar,
  };

  // ── 1. DECISÃO — uma chamada, ferramentas = um "acionar" por especialista oferecido ──
  //
  // ⛔ OS `delta` DESTE PASSO FICAM RETIDOS (§4.4). O modelo costuma escrever "Vou
  // consultar…" antes de acionar; se houve acionamento, esse texto é descartado — não aparece
  // e não é gravado. Se não houve, ele É a resposta e sai de uma vez.
  const passoDeDecisao = yield* eventosDaTrilha(
    runTrilha({
      ...comum,
      trilha: 0,
      agente: { id: coordenador.id, allowedTools: coordenador.allowedTools },
      promptVersion: promptVersionOf(coordenador),
      system: decisao.system,
      mensagens: decisao.mensagens,
      definicoes: definicoesDeAcionamento(decisao.ofertas),
      modo: "uma-chamada",
      repetir: true,
      tetoDeSaida: TETO_SAIDA_DECISAO,
      primeiroTipo: "PRIMARY",
      promptMontado: decisao.system + textoDasMensagens(decisao.mensagens),
    }),
    0,
    { reter: true },
  );

  if (!passoDeDecisao.ok) return passoDeDecisao;

  const retido = passoDeDecisao.texto.trim();
  const chamadas = passoDeDecisao.chamadas;

  // ── Resposta direta: o coordenador não acionou ninguém ───────────────────────────────
  if (chamadas.length === 0) {
    if (retido === "") {
      return {
        ok: false,
        erro: aiError("ERRO_TEMPORARIO", "NO_FINISH", "A resposta terminou sem conclusão."),
        cancelado: false,
      };
    }
    yield { type: "delta", text: retido };
    return {
      ok: true,
      texto: retido,
      finishReason: passoDeDecisao.finishReason,
      alvo: passoDeDecisao.alvo,
    };
  }

  // ── 2. AUDITORIA DO ACIONAMENTO — o PEDIDO, nunca a resposta (invariante 20) ─────────
  const decidido = decidirAcionamentos({
    chamadas,
    ofertas: decisao.ofertas,
    allowCrossModule: e.prefs.allowCrossModule,
  });

  const stepId =
    passoDeDecisao.stepIndex === null
      ? null
      : await startStep({
          runId: e.run.runId,
          userId: e.run.userId,
          stepIndex: passoDeDecisao.stepIndex,
          kind: "ferramentas",
        });

  if (!stepId) {
    // ⛔ SEM TRILHA, SEM LEITURA (18-B). Nenhum especialista roda sem o pedido registrado.
    yield { type: "delta", text: AVISO_SEM_AUDITORIA };
    return {
      ok: true,
      texto: AVISO_SEM_AUDITORIA,
      finishReason: passoDeDecisao.finishReason,
      alvo: passoDeDecisao.alvo,
    };
  }

  /**
   * ⛔ SEM TRILHA, SEM ESPECIALISTA — por acionamento, não só pelo passo. O especialista pode
   * preparar proposta, e é a linha do acionamento em `ai_tool_calls` que diz quem pediu o
   * quê; aceito cuja auditoria falhou NÃO roda. É a disciplina de `executor.ts` ("sem trilha,
   * sem proposta") aplicada ao pedido do coordenador.
   */
  const aceitos = await auditarAcionamentos(e.run, stepId, chamadas, decidido);
  const semRegistro = decidido.aceitos.length - aceitos.length;

  const cruzouDesligado = decidido.recusados.some(
    (r) => r.motivo === "CRUZAR_MODULOS_DESLIGADO",
  );

  // ── 3. Sem aceitos: o texto retido é a resposta, ou a frase do servidor ──────────────
  if (aceitos.length === 0) {
    const resposta =
      semRegistro > 0
        ? AVISO_SEM_AUDITORIA
        : retido !== ""
          ? retido
          : cruzouDesligado
            ? avisoCruzarModulos()
            : avisoSemEspecialista(decisao.desligados);
    yield { type: "delta", text: resposta };
    return {
      ok: true,
      texto: resposta,
      finishReason: passoDeDecisao.finishReason,
      alvo: passoDeDecisao.alvo,
    };
  }

  // ── 5. Dois ou mais aceitos: especialistas em paralelo + síntese ─────────────────────
  if (aceitos.length > 1) {
    throw new Error("Task 13");
  }

  // ── 4. MODO DIRETO — a resposta do especialista É a resposta final (§4.4) ────────────
  const aceito = aceitos[0]!;
  const esp = findAgent(aceito.agentId);
  // `decidirAcionamentos` só aceita quem `catalogoDeEspecialistas` ofereceu, e a oferta sai
  // do registry: um aceito sem perfil é incoerência nossa, não do modelo.
  if (!esp) throw new Error(`Especialista aceito sem perfil no registry: ${aceito.agentId}`);

  yield {
    type: "especialista",
    agentId: esp.id,
    rotulo: aceito.rotulo,
    trilha: 1,
    status: "consultando",
  };

  const system = sistemaDoEspecialista(esp, e.prefs, e.memorias, e.agora);
  /**
   * ⛔ SÓ A TAREFA, SEM O HISTÓRICO (§4.3.2). O coordenador já a escreveu autossuficiente; o
   * histórico pode conter texto colado de fora, e o especialista é quem tem as ferramentas.
   */
  const mensagens: AiMessage[] = [{ role: "user", content: aceito.tarefa }];

  const direto = yield* eventosDaTrilha(
    runTrilha({
      ...comum,
      trilha: 1,
      agente: { id: esp.id, allowedTools: esp.allowedTools },
      promptVersion: promptVersionOf(esp),
      system,
      mensagens,
      definicoes: toolDefinitionsFor(esp.allowedTools, permissions, writePermissions),
      modo: "laco",
      // No modo direto ele segue a política do provedor, como o agente roteado de hoje (§5.3).
      repetir: true,
      // A resposta dele É a final: o teto é o do modelo, como a reserva supõe
      // (`tetoSaidaDaSintese` em `computeReservationDoCoordenador`).
      tetoDeSaida: e.alvos[0]?.model.outputCapTokens ?? Number.POSITIVE_INFINITY,
      primeiroTipo: "ESPECIALISTA",
      promptMontado: system + textoDasMensagens(mensagens),
    }),
    1,
    { reter: false },
  );

  if (!direto.ok) {
    if (!direto.cancelado) {
      yield {
        type: "especialista",
        agentId: esp.id,
        rotulo: aceito.rotulo,
        trilha: 1,
        status: "falhou",
      };
    }
    // §4.4: o único especialista esgotou as tentativas → o run fecha `failed`, com o erro.
    return direto;
  }

  yield {
    type: "especialista",
    agentId: esp.id,
    rotulo: aceito.rotulo,
    trilha: 1,
    status: "pronto",
  };

  /**
   * ⛔ A FRASE DE "CRUZAR MÓDULOS" É NOSSA, E VAI NO FIM (invariante 103, spec §5.7).
   * Pedi-la ao modelo seria obediência "quase sempre". E no FIM porque tentativa nova zera o
   * texto (invariante 23): escrita antes da resposta, ela sumiria no primeiro retry.
   */
  let texto = direto.texto;
  if (cruzouDesligado) {
    const aviso = avisoCruzarModulos();
    const trecho = texto === "" ? aviso : `\n\n${aviso}`;
    texto += trecho;
    yield { type: "delta", text: trecho };
  }

  return { ok: true, texto, finishReason: direto.finishReason, alvo: direto.alvo };
}

/**
 * Uma linha em `ai_tool_calls` por pedido de acionamento: aceito como `executada`, recusado
 * como `rejeitada` com o motivo da auditoria. A tarefa recusada entra só se for texto — a
 * forma inválida não é reescrita para caber.
 *
 * Devolve os aceitos que GANHARAM linha: só eles podem virar trilha.
 */
async function auditarAcionamentos(
  run: EntradaDoCoordenador["run"],
  stepId: string,
  chamadas: readonly { readonly callId: string; readonly toolName: string; readonly input: unknown }[],
  decidido: DecisaoDeAcionamentos,
): Promise<readonly Acionamento[]> {
  const inicio = Date.now();
  const tarefaPedida = (callId: string): string => {
    const pedido = chamadas.find((c) => c.callId === callId)?.input;
    const tarefa =
      pedido && typeof pedido === "object" && "tarefa" in pedido
        ? (pedido as { tarefa: unknown }).tarefa
        : null;
    return typeof tarefa === "string" ? tarefa : "";
  };

  const [idsDosAceitos] = await Promise.all([
    Promise.all(
      decidido.aceitos.map((a) =>
        registrarAcionamento({
          runId: run.runId,
          userId: run.userId,
          stepId,
          especialistaId: a.agentId,
          tarefa: a.tarefa,
          providerCallId: a.callId,
          status: "executada",
          rejectionReason: null,
        }).catch(() => null),
      ),
    ),
    ...decidido.recusados.map((r) =>
      registrarAcionamento({
        runId: run.runId,
        userId: run.userId,
        stepId,
        especialistaId: r.agentId ?? r.toolName,
        tarefa: tarefaPedida(r.callId),
        providerCallId: r.callId,
        status: "rejeitada",
        rejectionReason: MOTIVO_PARA_AUDITORIA[r.motivo],
      }).catch(() => null),
    ),
  ]);

  await closeStep({
    runId: run.runId,
    stepId,
    userId: run.userId,
    status: "completed",
    durationMs: Date.now() - inicio,
  });

  return decidido.aceitos.filter((_, i) => idsDosAceitos[i] !== null);
}
