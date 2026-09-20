/**
 * Fase 18-F · Bloco 2 — IA · O botão flutuante: vocabulário e a regra do selo.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ⛔ ESTE ARQUIVO NÃO TEM UM ÚNICO IMPORT, E A AUSÊNCIA É DUPLAMENTE INTENCIONAL.        ║
 * ║                                                                                       ║
 * ║ 1. PESO. Ele é importado pelo botão, que mora na casca do app e portanto entra nas    ║
 * ║    67 rotas. Depois do Bloco 1, a rota mais apertada tem 5,8 KB gz de folga. Um       ║
 * ║    import de `@/lib/ai/constants` (texto grande) ou de `@/lib/validators/ai` (que     ║
 * ║    começa com `import { z } from "zod"`, 62,7 KB gz) estouraria o orçamento de TODAS. ║
 * ║                                                                                       ║
 * ║ 2. FRONTEIRA. O sino é a fonte de verdade para "algo aconteceu no sistema"; este selo ║
 * ║    fala SÓ da conversa que o dono abriu. Sem import, ele não tem como ler insight,    ║
 * ║    notificação, ação travada nem orçamento — a separação vira propriedade do módulo,  ║
 * ║    não promessa de quem o editar depois. Há teste varrendo por `import`.              ║
 * ║                                                                                       ║
 * ║ ⚠️ E ele mora na RAIZ de `src/lib/ai/`, não numa pasta — então `CAMADAS_PURAS` do     ║
 * ║    `boundaries.test.ts`, que itera sobre PASTAS, não o alcança. Quem o protege é o    ║
 * ║    teste próprio, e ele é mais estrito: lá a regra é "não alcança `server/`"; aqui é  ║
 * ║    "não importa NADA".                                                                ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */

// ─────────────────────────── Onde o botão fica ───────────────────────────

/**
 * ⛔ DOIS cantos, não quatro — e a ausência dos de cima é medida, não preguiça.
 *
 * O Header é `sticky top-0 z-30` com `h-16` e ocupa a faixa superior inteira em toda rota
 * `(app)`: busca, lançamento rápido, sino, tema e menu do usuário. Um botão no canto superior
 * colidiria com eles sempre.
 *
 * E não há arrasto. Arrastar exigiria persistência por tipo de aparelho, encaixe em bordas e
 * uma alternativa acessível ao gesto — três subsistemas para fugir de obstáculos que este
 * layout não tem: o lançamento rápido mora no Header e a navegação do celular é um drawer
 * lateral, não uma barra inferior. O canto de baixo está livre em todas as rotas.
 */
export const CANTOS_DO_BOTAO = ["direita", "esquerda"] as const;

export type CantoDoBotao = (typeof CANTOS_DO_BOTAO)[number];

export const CANTO_PADRAO: CantoDoBotao = "direita";

export const ROTULO_DO_CANTO = {
  direita: "Canto inferior direito",
  esquerda: "Canto inferior esquerdo",
} as const satisfies Record<CantoDoBotao, string>;

/** Valor desconhecido (coluna nova lida por código antigo, linha adulterada) cai no padrão. */
export function cantoValido(valor: unknown): CantoDoBotao {
  return valor === "esquerda" ? "esquerda" : "direita";
}

// ─────────────────────────── O atalho ───────────────────────────

/**
 * A tecla do painel, com `Ctrl` no Windows/Linux e `⌘` no Mac.
 *
 * ⚠️ Escolhida por ELIMINAÇÃO, não por gosto: `Ctrl/⌘ + K` já é a busca global
 * (`search-command.tsx`) e é o único outro atalho global do projeto — conferido por varredura
 * de `metaKey|ctrlKey` em `src/components/`. `Ctrl/⌘ + J` é o histórico de downloads no Chrome
 * e no Firefox: dá para suprimir, mas um atalho que o navegador reserva volta a funcionar
 * sozinho no dia em que alguém remover o `preventDefault`.
 *
 * ⛔ O atalho continua valendo com o botão OCULTO. Esconder tira o botão da tela, não o
 * assistente do alcance — e a tela que oferece ocultar diz isso com estas palavras.
 */
export const TECLA_DO_PAINEL = "i";
export const ATALHO_DO_PAINEL = "Ctrl/⌘ + I";

// ─────────────────────────── O estado do painel ───────────────────────────

/** Uma alteração preparada que ainda aguarda decisão, com o prazo dela (18-C). */
export type PropostaPendente = {
  readonly id: string;
  /** Instante ISO (`timestamptz`), como vem de `ai_action_proposals.expires_at`. */
  readonly expiraEm: string;
};

export type EstadoDoPainel = {
  readonly aberto: boolean;
  /** Uma resposta terminou enquanto o painel estava fechado. */
  readonly respostaNaoVista: boolean;
  readonly propostas: readonly PropostaPendente[];
};

export const ESTADO_INICIAL: EstadoDoPainel = {
  aberto: false,
  respostaNaoVista: false,
  propostas: [],
};

/**
 * Os SEIS eventos — e todos falam do painel, nenhum do sistema.
 *
 * ⛔ Se um dia alguém precisar de "insight novo" ou "notificação" aqui, o lugar certo é o
 * sino, não este selo. Há teste travando o tamanho desta união justamente para que essa
 * conversa aconteça antes do commit.
 */
export type EventoDoPainel =
  | { readonly tipo: "abriu" }
  | { readonly tipo: "fechou" }
  | { readonly tipo: "respondeu" }
  | { readonly tipo: "propos"; readonly id: string; readonly expiraEm: string }
  | { readonly tipo: "decidiu"; readonly id: string }
  /**
   * O laço reiniciou (evento SSE `switch`: troca de provedor). `chat-client.tsx` limpa os
   * cartões da tela nesse instante, porque a ferramenta de escrita roda de novo e nasce uma
   * SEGUNDA proposta, com outro id e outro hash (invariante 46). O selo acompanha, senão
   * contaria duas onde o dono vê uma.
   */
  | { readonly tipo: "recomecou" };

export function reduzirPainel(
  estado: EstadoDoPainel,
  evento: EventoDoPainel,
): EstadoDoPainel {
  switch (evento.tipo) {
    case "abriu":
      // Abrir é ver. A resposta deixa de estar por ver; as propostas continuam — elas não se
      // resolvem por serem olhadas, só por decisão ou por prazo.
      return { ...estado, aberto: true, respostaNaoVista: false };
    case "fechou":
      return { ...estado, aberto: false };
    case "respondeu":
      return { ...estado, respostaNaoVista: estado.aberto ? false : true };
    case "propos": {
      if (estado.propostas.some((p) => p.id === evento.id)) return estado;
      return {
        ...estado,
        propostas: [...estado.propostas, { id: evento.id, expiraEm: evento.expiraEm }],
      };
    }
    case "decidiu":
      return { ...estado, propostas: estado.propostas.filter((p) => p.id !== evento.id) };
    case "recomecou":
      return { ...estado, propostas: [] };
  }
}

// ─────────────────────────── O que o selo mostra ───────────────────────────

export type AvisoDoBotao = {
  readonly tipo: "proposta" | "resposta";
  /** Quantas alterações aguardam decisão. Zero quando o aviso é só de leitura. */
  readonly quantas: number;
  readonly texto: string;
};

/**
 * O selo, derivado — nunca gravado.
 *
 * Precedência: **decisão com prazo > leitura**. Uma alteração preparada expira em 10 minutos e
 * some sozinha; uma resposta por ler espera o dono o tempo que for. Avisar da leitura por cima
 * da decisão enterraria a única das duas que tem relógio correndo.
 *
 * `agora` é INJETADO: sem isso a função deixaria de ser pura e o teste do prazo dependeria do
 * relógio da máquina.
 */
export function avisoDoBotao(
  estado: EstadoDoPainel,
  agora: Date,
): AvisoDoBotao | null {
  // Painel aberto não avisa nada: o dono está olhando para o conteúdo do aviso.
  if (estado.aberto) return null;

  const pendentes = estado.propostas.filter(
    (p) => new Date(p.expiraEm).getTime() > agora.getTime(),
  );

  if (pendentes.length > 0) {
    const n = pendentes.length;
    return {
      tipo: "proposta",
      quantas: n,
      texto: n === 1 ? "1 alteração aguardando você." : `${n} alterações aguardando você.`,
    };
  }

  if (estado.respostaNaoVista) {
    return { tipo: "resposta", quantas: 0, texto: "O assistente respondeu." };
  }

  return null;
}
