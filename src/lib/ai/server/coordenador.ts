import "server-only";

/**
 * Chat livre com coordenador · Tasks 12 e 13 — O COORDENADOR: decisão, resposta direta, modo
 * direto, e especialistas em paralelo com síntese.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ UMA MENSAGEM LIVRE, TRÊS DESFECHOS (spec §4.1):                                       ║
 * ║                                                                                       ║
 * ║  • o coordenador responde sem acionar ninguém ("oi") → o texto dele é a resposta;     ║
 * ║  • aciona UM especialista → o especialista responde direto (modo direto, §4.4);       ║
 * ║  • aciona dois ou mais → especialistas em paralelo + síntese (§4.3, §5.3).            ║
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
  avisoConsultaNaoMontada,
  avisoCruzarModulos,
  avisoDeEspecialistasComLeituraIncompleta,
  avisoDeEspecialistasQueFalharam,
  avisoSemEspecialista,
  blocoDaData,
  blocoDaSintese,
  blocoDoCoordenador,
  blocoDoEspecialista,
} from "@/lib/ai/agents/blocos-do-servidor";
import { moduloDoAgente } from "@/lib/ai/agents/routing";
import type { MemoriaParaPrompt } from "@/lib/ai/memory/contracts";
import { memoriasParaOPrompt } from "@/lib/ai/memory/prompt";
import { renderUntrusted, wrapUntrusted } from "@/lib/ai/security/untrusted";
import { closeStep, startStep } from "@/lib/ai/tools/audit";
import { findTool, toolDefinitionsFor } from "@/lib/ai/tools/registry";
import type { AiPreferencesView } from "@/lib/ai/types";
import {
  estimarTokensDeEntrada,
  TETO_SAIDA_DECISAO,
  TETO_SAIDA_ESPECIALISTA,
} from "@/lib/ai/usage/reservation";
import type { ChatRunnerEvent } from "./chat-runner";
import { mesclar } from "./mesclar";
import { criarPrazo, restanteMs, type Prazo } from "./prazo";
import {
  HEARTBEAT_INTERVAL_MS,
  heartbeatAndPersist,
  markStreaming,
  registrarAcionamento,
} from "./run-store";
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

  const system = sistemaDoCoordenador({ ...input, ofertas, desligados, etapa: "decisao" });

  const mensagens = normalizarAlternancia([
    ...input.historico.map((m) => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: input.texto },
  ]);

  return { system, mensagens, ofertas, desligados };
}

/**
 * O `system` do COORDENADOR — uma montagem só para a decisão e a síntese (duas divergiriam na
 * primeira edição). O que muda entre as etapas é UM bloco: `blocoDoCoordenador` na decisão e
 * `blocoDaSintese` NO LUGAR dele na síntese (`agents/blocos-do-servidor.ts`) — nunca os dois,
 * que se contradiriam: um manda acionar pela ferramenta, o outro diz que ninguém mais é
 * acionado. O perfil (`assistente-pessoal-v3`) descreve as duas etapas. `etapa` não tem valor
 * padrão: um ponto novo do código escolhe a etapa em vez de herdar uma.
 *
 * ⛔ A MEMÓRIA ENTRA POR ÚLTIMO, por `montarSystem` (invariante 98) — depois do bloco da
 * etapa. O coordenador não tem módulo: a seleção é a GLOBAL (`moduloDoAgente: null`), e
 * memória de módulo fica para o especialista daquele módulo — com a `allow_*` dele
 * (invariante 26).
 */
function sistemaDoCoordenador(input: {
  readonly prefs: AiPreferencesView;
  readonly memorias: readonly MemoriaParaPrompt[];
  readonly agora: Date;
  readonly ofertas: readonly EspecialistaOferecido[];
  readonly desligados: readonly string[];
  readonly etapa: "decisao" | "sintese";
}): string {
  const { permissions } = input.prefs;
  const blocoDaEtapa =
    input.etapa === "decisao"
      ? blocoDoCoordenador({
          ofertas: input.ofertas,
          desligados: input.desligados,
          allowCrossModule: input.prefs.allowCrossModule,
        })
      : blocoDaSintese({ desligados: input.desligados });
  return montarSystem({
    base: buildSystemPrompt(perfilDoCoordenador()),
    blocos: [secao(blocoDaData(input.agora)), secao(blocoDaEtapa)],
    memorias: memoriasParaOPrompt({
      memorias: input.memorias,
      moduloDoAgente: null,
      permissions,
      allowMemory: permissions.allow_memory,
    }),
  });
}

/** Tempo guardado para a síntese: os especialistas em paralelo terminam antes disto (§5.6). */
export const RESERVA_DA_SINTESE_MS = 15_000;

/**
 * Task 15b (Rodada 1) — as ferramentas de UM especialista, já filtradas pelas chaves do dono, e
 * as de LEITURA entre elas. As leituras vão sozinhas, com `required`, no primeiro passo de cada
 * tentativa (`runTrilha`): oferecer a allowlist inteira empurrava o modelo a propor escrita ou
 * memória com dado chutado em vez de perguntar. Quem sabe o que é leitura é o registry; por isso
 * a conta mora aqui, e `trilha.ts` só recebe a lista.
 */
function ferramentasDoEspecialista(
  esp: AiAgentProfile,
  prefs: AiPreferencesView,
): { readonly definicoes: readonly AiToolDefinition[]; readonly leituras: readonly AiToolDefinition[] } {
  const definicoes = toolDefinitionsFor(esp.allowedTools, prefs.permissions, prefs.writePermissions);
  const leituras = definicoes.filter((d) => findTool(d.name)?.kind === "leitura");
  return { definicoes, leituras };
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
    // Task 15b — a data e, logo depois, o que fazer quando a leitura não cobre o recorte.
    // O bloco só manda consultar quando há leitura oferecida (Rodada 1): sem ela a frase seria falsa.
    blocos: [
      secao(blocoDaData(agora)),
      secao(blocoDoEspecialista({ temLeitura: ferramentasDoEspecialista(esp, prefs).leituras.length > 0 })),
    ],
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
      // A decisão pode responder direto, sem acionar ninguém ("oi", pergunta geral).
      primeiroPassoExigeLeitura: null,
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
  //
  // ⚠️ Sem nenhum aceito, a recusa só pode ser de FORMA (tarefa vazia ou longa demais) sobre
  // um especialista OFERECIDO — repetido, cruzado e acima do teto exigem um aceito antes, e
  // nome fora da oferta já encerrou a trilha. O módulo está ligado: a frase diz que a
  // consulta não foi montada, em vez de mandar ligar uma leitura que já está ligada.
  if (aceitos.length === 0) {
    const pedidosSemForma = decidido.recusados.filter((r) => r.motivo === "TAREFA_INVALIDA");
    const rotulosSemForma = [
      ...new Set(
        pedidosSemForma.flatMap((r) => {
          const oferta = decisao.ofertas.find((o) => o.agentId === r.agentId);
          return oferta ? [oferta.rotulo] : [];
        }),
      ),
    ];
    const resposta =
      semRegistro > 0
        ? AVISO_SEM_AUDITORIA
        : retido !== ""
          ? retido
          : cruzouDesligado
            ? avisoCruzarModulos()
            : pedidosSemForma.length > 0
              ? avisoConsultaNaoMontada(rotulosSemForma)
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
    // ⚠️ Sem `cruzouDesligado`: com dois ou mais aceitos, "Cruzar módulos" está LIGADA
    // (`decidirAcionamentos` recusa o 2º quando ela está desligada) — ver `emParalelo`.
    return yield* emParalelo({ e, coordenador, decisao, aceitos, comum });
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
  const ferramentas = ferramentasDoEspecialista(esp, e.prefs);
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
      definicoes: ferramentas.definicoes,
      modo: "laco",
      // No modo direto ele segue a política do provedor, como o agente roteado de hoje (§5.3).
      repetir: true,
      // A resposta dele É a final: o teto é o do modelo, como a reserva supõe
      // (`tetoSaidaDaSintese` em `computeReservationDoCoordenador`).
      tetoDeSaida: e.alvos[0]?.model.outputCapTokens ?? Number.POSITIVE_INFINITY,
      primeiroTipo: "ESPECIALISTA",
      // Task 15b — acionado é porque a tarefa depende dos registros: ele LÊ antes de responder
      // (só as leituras no primeiro passo; lista vazia = nada exigido).
      primeiroPassoExigeLeitura: ferramentas.leituras,
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

/** O que uma trilha em paralelo entrega à mescla: os eventos dela e, por último, o desfecho. */
type EventoEmParalelo =
  | { readonly tipo: "evento"; readonly evento: EventoDaTrilha }
  | { readonly tipo: "fim"; readonly desfecho: DesfechoDaTrilha };

/**
 * Uma trilha em paralelo, BLINDADA.
 *
 * ⛔ `runTrilha` lança numa exceção interna (banco, cofre) depois de fechar a tentativa como
 * `failed` — e a mescla, ao receber uma exceção, fecha as outras fontes e a relança. Numa
 * trilha paralela isso derrubaria os outros especialistas e o run por causa de UM módulo
 * (§4.3.6). Aqui a exceção vira o desfecho de falha DAQUELA trilha.
 *
 * O desfecho também sai como evento (`fim`) para a tela ver "pronto"/"falhou" quando cada
 * um termina, e não só quando o último termina.
 */
async function* blindada(
  trilha: AsyncGenerator<EventoDaTrilha, DesfechoDaTrilha>,
): AsyncGenerator<EventoEmParalelo, DesfechoDaTrilha> {
  let desfecho: DesfechoDaTrilha | null = null;
  try {
    for (;;) {
      const passo = await trilha.next();
      if (passo.done) {
        desfecho = passo.value;
        break;
      }
      yield { tipo: "evento", evento: passo.value };
    }
  } catch {
    desfecho = {
      ok: false,
      erro: aiError(
        "ERRO_PERMANENTE",
        "UNEXPECTED_ERROR",
        "O especialista foi interrompido por uma falha inesperada.",
      ),
      cancelado: false,
    };
  } finally {
    // Abandonada no `yield` (a mescla fechando): o `return()` tem de chegar ao `finally` de
    // `runTrilha`, que fecha a tentativa aberta como `cancelled`. `next()` à mão não o leva
    // sozinho — o `for await`/`yield*` levariam, mas engoliriam o desfecho ou a exceção.
    if (desfecho === null) {
      await trilha.return({
        ok: false,
        erro: aiError("CANCELADO_PELO_USUARIO", "CANCELLED"),
        cancelado: true,
      });
    }
  }
  yield { tipo: "fim", desfecho };
  return desfecho;
}

/**
 * ESPECIALISTAS EM PARALELO + SÍNTESE (§4.1, §4.3, §5.3–§5.6).
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ⛔ O TEXTO DOS ESPECIALISTAS NÃO VAI PARA A TELA. Ele é intermediário: entra na      ║
 * ║ síntese como DADO NÃO CONFIÁVEL (invariante 5), numa mensagem `user`, e só o texto  ║
 * ║ da síntese chega ao dono. E nunca entra na auditoria nem no heartbeat (inv. 20).    ║
 * ║                                                                                      ║
 * ║ ⛔ A SÍNTESE NÃO RECEBE FERRAMENTA NENHUMA, nem mensagem `tool`. Uma resposta de    ║
 * ║ especialista que "pede" um acionamento não tem como virar um: não há a quem pedir  ║
 * ║ (Review Focus 5). Reenviar as ferramentas de acionamento desfaria a regra 4.2.5.    ║
 * ║                                                                                      ║
 * ║ ⛔ ESPECIALISTA EM PARALELO NÃO REPETE (§5.3): falhou, é declarado pelo SERVIDOR no ║
 * ║ fim do texto, e os outros seguem. E a síntese que repete NÃO reexecuta especialista ║
 * ║ — as respostas ficam nesta função, na memória do processo, nunca no banco.          ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */
async function* emParalelo(input: {
  readonly e: EntradaDoCoordenador;
  readonly coordenador: AiAgentProfile;
  readonly decisao: ReturnType<typeof prepararDecisao>;
  readonly aceitos: readonly Acionamento[];
  readonly comum: Omit<
    Parameters<typeof runTrilha>[0],
    | "trilha"
    | "agente"
    | "promptVersion"
    | "system"
    | "mensagens"
    | "definicoes"
    | "modo"
    | "repetir"
    | "tetoDeSaida"
    | "primeiroTipo"
    | "primeiroPassoExigeLeitura"
    | "promptMontado"
  >;
}): AsyncGenerator<ChatRunnerEvent, DesfechoDoCoordenador> {
  const { e, coordenador, decisao, aceitos, comum } = input;

  // Trilhas 1..n, NA ORDEM DO ACIONAMENTO.
  const participantes = aceitos.map((aceito, i) => {
    const esp = findAgent(aceito.agentId);
    // Ver o modo direto: aceito sem perfil é incoerência nossa, não do modelo.
    if (!esp) throw new Error(`Especialista aceito sem perfil no registry: ${aceito.agentId}`);
    return { aceito, esp, trilha: i + 1 };
  });

  for (const p of participantes) {
    yield {
      type: "especialista",
      agentId: p.esp.id,
      rotulo: p.aceito.rotulo,
      trilha: p.trilha,
      status: "consultando",
    };
  }
  // Os especialistas não emitem `delta`, e o run tem de sair de `reserved` quando o trabalho
  // começa — não só quando a síntese escrever a primeira letra.
  await markStreaming(e.run.runId, e.run.userId);

  /**
   * ⛔ UM SINAL PRÓPRIO DOS ESPECIALISTAS, encadeado no da requisição. O da requisição chega a
   * todas as trilhas por ele (Review Focus 1); e ele também é o que ESTE gerador aborta quando
   * é abandonado — ver o `finally`.
   */
  const controle = new AbortController();
  const repassarAborto = () => controle.abort();

  /**
   * MOD-ia-005 + §5.6 — o prazo de cada especialista é o restante MENOS a reserva da síntese.
   * `runTrilha` recorta o timeout de cada tentativa por ele, então o lento é cortado pelo prazo
   * DELE (e sai `falhou`), e a síntese começa com o tempo guardado.
   */
  const agoraDoInicio = e.agoraMs();
  const prazoDosEspecialistas = criarPrazo(
    agoraDoInicio,
    restanteMs(e.prazo, agoraDoInicio) - RESERVA_DA_SINTESE_MS,
  );

  const mescla = mesclar(
    participantes.map((p) => {
      const system = sistemaDoEspecialista(p.esp, e.prefs, e.memorias, e.agora);
      const ferramentas = ferramentasDoEspecialista(p.esp, e.prefs);
      // SÓ A TAREFA, SEM O HISTÓRICO (§4.3.2).
      const mensagens: AiMessage[] = [{ role: "user", content: p.aceito.tarefa }];
      return blindada(
        runTrilha({
          ...comum,
          trilha: p.trilha,
          agente: { id: p.esp.id, allowedTools: p.esp.allowedTools },
          promptVersion: promptVersionOf(p.esp),
          system,
          mensagens,
          definicoes: ferramentas.definicoes,
          modo: "laco",
          // §5.3: em paralelo, falhou, acabou — sem retry nem fallback.
          repetir: false,
          // A resposta dele é intermediária: teto menor, o mesmo que a reserva supõe.
          tetoDeSaida: TETO_SAIDA_ESPECIALISTA,
          primeiroTipo: "ESPECIALISTA",
          // Task 15b — como no modo direto: o especialista acionado lê antes de responder.
          primeiroPassoExigeLeitura: ferramentas.leituras,
          prazo: prazoDosEspecialistas,
          abortSignal: controle.signal,
          promptMontado: system + textoDasMensagens(mensagens),
        }),
      );
    }),
  );

  /**
   * ⛔ INVARIANTE 17 NO PARALELO — o corte pelo teto de passos (`aviso`) de um especialista
   * não chega ao dono pelo texto dele: esse texto vai à síntese como DADO NÃO CONFIÁVEL, e o
   * modelo pode omiti-lo. Quem foi cortado é guardado aqui (por índice da trilha) e declarado
   * pelo SERVIDOR no fim da resposta.
   */
  const cortados = new Set<number>();

  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let finais: readonly DesfechoDaTrilha[] | null = null;
  try {
    // Dentro do `try` que os desfaz: nada do que o `finally` limpa nasce fora dele.
    if (e.abortSignal.aborted) controle.abort();
    else e.abortSignal.addEventListener("abort", repassarAborto, { once: true });

    /**
     * §5.6 — sem `delta` não há heartbeat em `runChat`, e o run pareceria travado para a
     * reconciliação (lease). O parcial gravado é VAZIO: o texto dos especialistas não é público.
     */
    heartbeat = setInterval(() => {
      heartbeatAndPersist(e.run.runId, e.run.userId, e.run.assistantMessageId, "").catch(
        () => {},
      );
    }, HEARTBEAT_INTERVAL_MS);

    for (;;) {
      const passo = await mescla.next();
      if (passo.done) {
        finais = passo.value;
        break;
      }
      const { indice, evento } = passo.value;
      const p = participantes[indice]!;

      if (evento.tipo === "fim") {
        const d = evento.desfecho;
        // Cancelado não é falha: não vira "falhou" na linha de especialistas.
        if (d.ok || !d.cancelado) {
          yield {
            type: "especialista",
            agentId: p.esp.id,
            rotulo: p.aceito.rotulo,
            trilha: p.trilha,
            status: d.ok ? "pronto" : "falhou",
          };
        }
        continue;
      }

      const ev = evento.evento;
      switch (ev.type) {
        case "delta":
          // ⛔ NÃO vai para a tela: o texto está no desfecho da trilha.
          break;
        case "aviso":
          // O texto do corte está no desfecho (dado para a síntese); a DECLARAÇÃO ao dono é
          // nossa, no fim — ver `cortados`.
          cortados.add(indice);
          break;
        case "switch":
          // Com `repetir: false` a trilha não troca de tentativa; e nada dela está na tela.
          break;
        case "tool":
          yield ev;
          break;
        case "proposta":
          yield { type: "proposta", proposta: ev.proposta, trilha: p.trilha };
          break;
        default: {
          const naoTratado: never = ev;
          throw new Error(`Evento de trilha não tratado: ${JSON.stringify(naoTratado)}`);
        }
      }
    }
  } finally {
    clearInterval(heartbeat);
    e.abortSignal.removeEventListener("abort", repassarAborto);
    if (finais === null) {
      /**
       * ⛔ ABORTAR ANTES DO `return()` DA MESCLA. O `return()` de um gerador assíncrono entra na
       * fila do `next()` pendente: a trilha com o provedor no meio só o atende depois do
       * próximo evento, que pode nunca vir. Abortado o sinal, cada provedor para, cada trilha
       * fecha a tentativa aberta como `cancelled`, e só então a mescla termina.
       */
      controle.abort();
      await mescla.return([]);
    }
  }

  // ── Cancelamento (o sinal da requisição, que chegou a todas as trilhas) ─────────────
  if (e.abortSignal.aborted || finais.some((d) => !d.ok && d.cancelado)) {
    return { ok: false, erro: aiError("CANCELADO_PELO_USUARIO", "CANCELLED"), cancelado: true };
  }

  const respondidos = participantes.flatMap((p, i) => {
    const d = finais[i]!;
    return d.ok ? [{ p, i, texto: d.texto }] : [];
  });
  const falhos = participantes.flatMap((p, i) => {
    const d = finais[i]!;
    return d.ok ? [] : [{ p, d }];
  });

  // §4.4: todos falharam → o run é `failed`, com o erro do primeiro.
  if (respondidos.length === 0) {
    return falhos[0]!.d;
  }

  // ── SÍNTESE — trilha 0 de novo, sem ferramentas, respostas como dado não confiável ──
  const system = sistemaDoCoordenador({
    prefs: e.prefs,
    memorias: e.memorias,
    agora: e.agora,
    ofertas: decisao.ofertas,
    desligados: decisao.desligados,
    etapa: "sintese",
  });
  /**
   * Resposta maior que `MAX_UNTRUSTED_CHARS` é CORTADA por `wrapUntrusted`, e a síntese recebe
   * só parte dela. Isso também é leitura incompleta, e entra na mesma frase do servidor.
   */
  const blocos = respondidos.map(({ p, i, texto }) => {
    const bloco = wrapUntrusted("resposta_de_especialista", p.aceito.rotulo, { texto });
    if (bloco.truncated) cortados.add(i);
    return renderUntrusted(bloco);
  });
  const incompletos = respondidos
    .filter(({ i }) => cortados.has(i))
    .map(({ p }) => p.aceito.rotulo);
  // Papel `user`, depois do histórico e respeitando a alternância (MOD-ia-027) — nunca
  // `system`, e nunca `tool` (a Anthropic recusa bloco de ferramenta sem `tools`).
  const mensagens = normalizarAlternancia([
    ...e.historico.map((m) => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: `${e.texto}\n\n${blocos.join("\n\n")}` },
  ]);

  const sintese = yield* eventosDaTrilha(
    runTrilha({
      ...comum,
      trilha: 0,
      agente: { id: coordenador.id, allowedTools: coordenador.allowedTools },
      promptVersion: promptVersionOf(coordenador),
      system,
      mensagens,
      // ⛔ Nenhuma ferramenta (Review Focus 5). Se o modelo pedir uma assim mesmo, a lista
      // vazia faz dela uma `tool-call-inesperada`, e a trilha encerra.
      definicoes: [],
      modo: "laco",
      // A síntese segue a política do provedor; repetir não reexecuta especialista nenhum.
      repetir: true,
      tetoDeSaida: e.alvos[0]?.model.outputCapTokens ?? Number.POSITIVE_INFINITY,
      primeiroTipo: "PRIMARY",
      // Sem ferramenta não há o que exigir — e a síntese não lê nada, só junta.
      primeiroPassoExigeLeitura: null,
      promptMontado: system + textoDasMensagens(mensagens),
    }),
    0,
    { reter: false },
  );

  if (!sintese.ok) return sintese;

  /**
   * ⛔ AS FRASES SÃO DO SERVIDOR, E VÃO NO FIM (invariante 103, §4.3.6). A ordem das frases
   * do coordenador é: quem não respondeu → quem respondeu com leitura incompleta → "cruzar
   * módulos". No fim porque tentativa nova zera o texto (invariante 23).
   *
   * ⚠️ A terceira NÃO EXISTE AQUI, e não por esquecimento: com dois ou mais aceitos, "Cruzar
   * módulos" está ligada — desligada, `decidirAcionamentos` recusa o 2º e o caminho é o modo
   * direto, que é onde `avisoCruzarModulos()` fecha a resposta.
   */
  let texto = sintese.texto;
  const frases = [
    avisoDeEspecialistasQueFalharam(falhos.map(({ p }) => p.aceito.rotulo)),
    avisoDeEspecialistasComLeituraIncompleta(incompletos),
  ];
  for (const frase of frases) {
    if (!frase) continue;
    const trecho = texto === "" ? frase : `\n\n${frase}`;
    texto += trecho;
    yield { type: "delta", text: trecho };
  }

  return { ok: true, texto, finishReason: sintese.finishReason, alvo: sintese.alvo };
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
