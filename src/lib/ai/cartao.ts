/**
 * REDESIGN-07-D · D1 — O QUE O CARTÃO DE PROPOSTA MOSTRA, EM FUNÇÃO PURA.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ O cartão fala o vocabulário do Approval Engine (`approval/state.ts`), com os rótulos  ║
 * ║ de `ROTULO_DO_ESTADO_DA_ACAO` — os MESMOS de `/ia/acoes`. Até aqui ele guardava um    ║
 * ║ desfecho próprio, e três estados mentiam: o vencido mantinha a cara de pendente (e o  ║
 * ║ Recusar habilitado), `falhou` aparecia no verde da aplicada, e uma promise rejeitada  ║
 * ║ deixava o cartão girando para sempre.                                                 ║
 * ║                                                                                       ║
 * ║ Há UM estado que não é da proposta: `nao_aplicada`, a recusa do servidor (`ok:false`). ║
 * ║ É o desfecho da TENTATIVA — a action devolve só a frase, então o cartão não sabe se a  ║
 * ║ decisão chegou a ser gravada. Ele é final porque nenhuma segunda tentativa com o mesmo ║
 * ║ hash dá certo (hash divergente se repete; decisão gravada responde "já foi decidida"). ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * O relógio é injetado (`agora`) e é o do NAVEGADOR — informativo: quem decide o prazo é o
 * servidor. Por isso a recusa por prazo que o servidor devolver vira `nao_aplicada` com a frase
 * dele, mesmo que o relógio local ainda dissesse "faltam 1 min".
 */
import type { EstadoDaProposta } from "./approval/state";
import { ROTULO_DO_ESTADO_DA_ACAO } from "./constants";

export type DesfechoDoCartao =
  | { readonly tipo: "pendente" }
  | { readonly tipo: "enviando"; readonly acao: "confirmar" | "recusar" }
  | { readonly tipo: "executada" | "parcial" | "falhou"; readonly rota: string | null }
  | { readonly tipo: "recusada" }
  | { readonly tipo: "nao_aplicada"; readonly mensagem: string }
  | { readonly tipo: "sem_desfecho" };

/** `confirmada` não aparece no cartão: ali a confirmação já tem um desfecho (ou não voltou). */
export type EstadoDoCartao = Exclude<EstadoDaProposta, "confirmada"> | "nao_aplicada";

export type VistaDoCartao = {
  readonly estado: EstadoDoCartao;
  readonly rotulo: string;
  /** Não há mais nada a decidir neste cartão. É o momento de avisar o painel (`decidiu`). */
  readonly final: boolean;
  readonly podeConfirmar: boolean;
  readonly podeRecusar: boolean;
  /** Qual botão mostra o spinner — o que foi clicado. */
  readonly girando: "confirmar" | "recusar" | null;
};

export const DESFECHO_INICIAL: DesfechoDoCartao = { tipo: "pendente" };

/**
 * O rótulo da recusa do servidor. Não é "não aplicada": as frases de `MENSAGEM_DE_RECUSA` dizem
 * "nada foi alterado AGORA" — e `JA_EXECUTADA` diz que a ação já tinha sido executada antes
 * (por outra aba, por `/ia/acoes`). O que o cartão sabe é só que ESTE pedido não fez nada.
 */
const ROTULO_NAO_APLICADA = "nada foi feito agora";

function rotuloDe(estado: EstadoDoCartao): string {
  return estado === "nao_aplicada" ? ROTULO_NAO_APLICADA : ROTULO_DO_ESTADO_DA_ACAO[estado];
}

/** Prazo vencido no instante de `expires_at` (`>=`, como `approval/state.ts`). Data ilegível vence. */
function venceu(expiraEm: string, agora: number): boolean {
  const fim = Date.parse(expiraEm);
  return Number.isNaN(fim) || agora >= fim;
}

function finalSemBotoes(estado: EstadoDoCartao): VistaDoCartao {
  return {
    estado,
    rotulo: rotuloDe(estado),
    final: true,
    podeConfirmar: false,
    podeRecusar: false,
    girando: null,
  };
}

export function estadoDoCartao(
  desfecho: DesfechoDoCartao,
  expiraEm: string,
  agora: number,
): VistaDoCartao {
  switch (desfecho.tipo) {
    case "pendente":
      if (venceu(expiraEm, agora)) return finalSemBotoes("expirada");
      return {
        estado: "pendente",
        rotulo: rotuloDe("pendente"),
        final: false,
        podeConfirmar: true,
        podeRecusar: true,
        girando: null,
      };
    case "enviando":
      // Um envio no ar não vira "prazo encerrado" no meio do caminho: quem decide é a resposta.
      return {
        estado: "pendente",
        rotulo: rotuloDe("pendente"),
        final: false,
        podeConfirmar: false,
        podeRecusar: false,
        girando: desfecho.acao,
      };
    case "executada":
      return finalSemBotoes("executada");
    case "parcial":
      return finalSemBotoes("parcial");
    case "falhou":
      return finalSemBotoes("falhou");
    case "recusada":
      return finalSemBotoes("recusada");
    case "nao_aplicada":
      return finalSemBotoes("nao_aplicada");
    case "sem_desfecho":
      // ⛔ Nem sucesso nem falha: o claim-first chegando à tela (invariante 52).
      return finalSemBotoes("executando");
  }
}

/** O resultado de `confirmarAcaoDaIa`, já reduzido ao que o cartão precisa. */
export type ResultadoParaOCartao =
  | { readonly ok: true; readonly status: "sucesso" | "parcial" | "falhou" | "executando"; readonly rota: string | null }
  | { readonly ok: false; readonly mensagem: string };

/**
 * Cada status vira o SEU desfecho. Até aqui era `parcial: status !== "sucesso"`, e `falhou` —
 * o command quebrou depois do claim, e "algo pode ter sido escrito" (`execute.ts`) — aparecia
 * no verde de "aplicada em parte".
 */
export function desfechoDaConfirmacao(r: ResultadoParaOCartao): DesfechoDoCartao {
  if (!r.ok) return { tipo: "nao_aplicada", mensagem: r.mensagem };
  switch (r.status) {
    case "sucesso":
      return { tipo: "executada", rota: r.rota };
    case "parcial":
      return { tipo: "parcial", rota: r.rota };
    case "falhou":
      return { tipo: "falhou", rota: r.rota };
    case "executando":
      // A action não devolve isto hoje (o tipo permite): se devolver, é "sem desfecho".
      return { tipo: "sem_desfecho" };
  }
}
