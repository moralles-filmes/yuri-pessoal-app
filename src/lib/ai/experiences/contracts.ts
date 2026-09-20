/**
 * Fase 18-F · Bloco 4 — IA · O vocabulário das experiências. Puro, sem I/O.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ⛔ O PLANO É UM OBJETO, E POR ISSO O `chat-runner` NÃO PRECISA CONHECER O CATÁLOGO.    ║
 * ║                                                                                       ║
 * ║ `experience-runner.ts` lê o catálogo, resolve permissões, deriva os argumentos do dia  ║
 * ║ e entrega ESTE objeto pronto. O runner do chat executa uma lista que recebeu — ele não ║
 * ║ tem como buscar uma experiência, inventar uma ferramenta nem escolher outro prompt.    ║
 * ║ É a mesma lição de `LeituraDoDono` (invariante 79): irrepresentável vence recusado.    ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */

export const EXPERIENCIA_IDS = [
  "planejar-dia",
  "encerrar-dia",
  "planejar-semana",
] as const;

export type ExperienciaId = (typeof EXPERIENCIA_IDS)[number];

/**
 * ⛔ O TETO DO LAÇO DIRIGIDO.
 *
 * `MAX_TOOL_STEPS` (3 por tentativa) existe para impedir **o modelo** de decidir quanto o dono
 * gasta. Aqui quem decide é uma lista estática revisada em code review, então aquele teto não
 * se aplica — mas "não se aplica" não pode virar "não há teto". Este número é o que
 * `computeReservation` reserva, SEMPRE, mesmo que a lista da vez tenha duas ferramentas.
 */
export const MAX_FERRAMENTAS_POR_EXPERIENCIA = 5;

export type FerramentaDaExperiencia = {
  readonly toolName: string;
  /**
   * Os argumentos, derivados do DIA. `hoje` é injetado ('yyyy-MM-dd', data pura) — nada aqui
   * chama `new Date()`, e é isso que torna o catálogo testável sem congelar relógio.
   */
  readonly argumentos: (hoje: string) => Record<string, unknown>;
};

export type Experiencia = {
  readonly id: ExperienciaId;
  readonly titulo: string;
  readonly ferramentas: readonly FerramentaDaExperiencia[];
  readonly prompt: string;
  readonly promptVersion: string;
};

/**
 * O que `experience-runner.ts` entrega a `runChat`. Tudo já resolvido: nada aqui precisa ser
 * buscado, derivado ou decidido depois.
 */
export type PlanoDaExperiencia = {
  readonly id: ExperienciaId;
  /** O agente do RUN. Não é do registry de agentes — é fixo por experiência, como `insights.*`. */
  readonly agentId: string;
  readonly promptVersion: string;
  /** O prompt de SISTEMA inteiro: SEGURANÇA + redação. Montado pelo runner da experiência. */
  readonly system: string;
  /** Vira a primeira mensagem da conversa E o título dela. Sai do catálogo, nunca do cliente. */
  readonly userText: string;
  /**
   * As leituras que VÃO rodar, já com argumentos resolvidos, na ordem do catálogo.
   *
   * ⚠️ `rotulo` é o nome do módulo em pt-BR. Ele viaja junto porque quem descobre que uma
   * leitura FALHOU é o `chat-runner`, em runtime — e a frase que declara isso ao dono é nossa,
   * não um pedido ao modelo (ver `falhas.ts`).
   */
  readonly leituras: readonly {
    readonly toolName: string;
    readonly input: unknown;
    readonly rotulo: string;
  }[];
  /**
   * Os MÓDULOS que este panorama de fato lê — derivados do registry, sem repetição, e só os
   * que sobreviveram à checagem de chave.
   *
   * ⚠️ Existe para a MEMÓRIA. `memoriasParaOPrompt` (Bloco 3) decide para um módulo por vez,
   * porque no chat quem responde é um agente só. Um panorama não tem "o módulo do agente":
   * `chat-runner` chama aquela seleção uma vez por módulo daqui e une o resultado, o que
   * preserva o filtro do Bloco 3 intacto — cada memória de módulo continua exigindo a
   * `allow_*` daquele módulo (invariante 26).
   *
   * ⛔ Módulo PULADO não entra: sem a chave de leitura, nem o dado nem a preferência sobre
   * ele alcançam o prompt.
   */
  readonly modulos: readonly string[];
  /**
   * A frase do que ficou de fora, já escrita em pt-BR. `""` quando nada foi pulado.
   *
   * ⛔ Ela é NOSSA e vai para o texto gravado — não é um pedido ao modelo. Um panorama que
   * omite um módulo e não diz isso é um dia pela metade fingindo estar completo.
   */
  readonly aviso: string;
  /** Teto de tokens de contexto a RESERVAR. Do catálogo, nunca de `leituras.length`. */
  readonly tokensDeContextoReservados: number;
};
