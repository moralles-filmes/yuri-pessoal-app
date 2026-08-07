/**
 * Fase 18-C · Bloco 3 — IA · O ESTADO DE UMA PROPOSTA, e a decisão de admitir a execução.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ PURO, COM `agora` INJETADO — pelo mesmo motivo que o guard é puro.                     ║
 * ║                                                                                       ║
 * ║ A decisão de deixar uma ESCRITA acontecer não pode depender de banco, de rede nem de   ║
 * ║ ordem de `await`. Uma trava intestável é uma trava que ninguém sabe se funciona, e     ║
 * ║ esta é a que separa "a IA propôs" de "a IA alterou um registro seu".                   ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * ⚠️ NENHUM DOS ESTADOS ABAIXO É GRAVADO. `ai_action_proposals` NÃO TEM COLUNA `status` —
 * o estado sai de três fatos que já existem: o prazo (`expires_at`), a linha de
 * `ai_action_approvals` e a linha de `ai_action_executions`. É a mesma regra da fatura de
 * cartão, de `tasks.status='atrasada'` e de `training_scheduled_workouts.status`: estado
 * derivável não vira coluna, senão vira uma segunda verdade que diverge da primeira.
 */

/**
 * ⚠️ COMPARAÇÃO DE INSTANTES, NÃO DE DATAS.
 *
 * `expires_at` é `timestamptz` e `agora` é um instante. Comparar os dois em milissegundos
 * absolutos é correto em qualquer fuso e NÃO precisa de `dateInSaoPaulo` — a regra do
 * projeto ("nunca `.slice(0,10)` num timestamptz") fala de EXTRAIR o dia, que é outra
 * operação. Aqui não se extrai dia nenhum: 10 minutos são 10 minutos em Brasília, em UTC e
 * em Tóquio.
 */
function venceu(expiresAtIso: string, agora: Date): boolean {
  const limite = Date.parse(expiresAtIso);
  // Data ilegível é tratada como VENCIDA. O outro default ("ainda vale") transformaria uma
  // coluna corrompida numa janela de confirmação eterna.
  if (Number.isNaN(limite)) return true;
  return agora.getTime() >= limite;
}

export type DecisaoDoDono = "confirmada" | "recusada";

export type StatusDaExecucao = "executando" | "sucesso" | "falhou" | "parcial";

export type EstadoDaProposta =
  /** Ninguém decidiu ainda, e o prazo não venceu. */
  | "pendente"
  /** O prazo venceu sem decisão. Não é recusa — é uma janela que fechou. */
  | "expirada"
  | "recusada"
  /** Confirmada e ainda não executada (ou a execução ainda não começou). */
  | "confirmada"
  /** Reservou a vaga e não voltou. A tela NÃO pode chamar isto de "feito" nem de "falhou". */
  | "executando"
  | "executada"
  | "falhou"
  /** Ação em massa em que parte dos itens deu certo e parte não. */
  | "parcial";

export type FatosDaProposta = {
  readonly expiresAt: string;
  readonly decisao: DecisaoDoDono | null;
  readonly execucao: StatusDaExecucao | null;
};

/**
 * A precedência é EXECUÇÃO > DECISÃO > PRAZO, e cada degrau tem um motivo:
 *
 *  • A execução vence porque ela é o fato mais recente e o único que tocou dado do usuário.
 *  • A decisão vence o prazo porque uma proposta confirmada ÀS 9h59 continua confirmada às
 *    10h01. Deixar o prazo vencer por cima diria "expirada" sobre uma escrita que já
 *    aconteceu — a pior das leituras erradas possíveis nesta tabela.
 *  • O prazo só decide quando ninguém decidiu.
 */
export function derivarEstadoDaProposta(
  fatos: FatosDaProposta,
  agora: Date,
): EstadoDaProposta {
  if (fatos.execucao) {
    switch (fatos.execucao) {
      case "executando":
        return "executando";
      case "sucesso":
        return "executada";
      case "parcial":
        return "parcial";
      case "falhou":
        return "falhou";
    }
  }
  if (fatos.decisao === "recusada") return "recusada";
  if (fatos.decisao === "confirmada") return "confirmada";
  return venceu(fatos.expiresAt, agora) ? "expirada" : "pendente";
}

/** Estados a partir dos quais NADA mais acontece. A tela usa isto para não oferecer botão. */
export function estadoEhFinal(estado: EstadoDaProposta): boolean {
  return estado !== "pendente" && estado !== "confirmada";
}

// ══════════════════════════════════════════════════════════════════════════════════════
// A decisão de admitir
// ══════════════════════════════════════════════════════════════════════════════════════

export type MotivoDeRecusa =
  | "PROPOSTA_NAO_ENCONTRADA"
  | "PROPOSTA_EXPIRADA"
  | "PROPOSTA_JA_DECIDIDA"
  | "HASH_DIVERGENTE"
  | "EFEITO_MUDOU"
  | "COMMAND_DESCONHECIDO"
  | "JA_EXECUTADA"
  | "SEM_CONFIRMACAO";

/**
 * ⚠️ ESTES TEXTOS VÃO PARA A TELA DO DONO, não para o modelo.
 *
 * Por isso eles dizem O QUE FAZER, e nunca "erro interno": quem está do outro lado acabou de
 * clicar em confirmar e precisa saber se a alteração aconteceu ou não. Nenhum deles descreve
 * o efeito como aplicado quando ele não foi.
 */
export const MENSAGEM_DE_RECUSA: Record<MotivoDeRecusa, string> = {
  PROPOSTA_NAO_ENCONTRADA:
    "Esta proposta não existe mais. Nada foi alterado. Peça a alteração de novo na conversa.",
  PROPOSTA_EXPIRADA:
    "O prazo de confirmação desta proposta terminou e nada foi alterado. Peça a alteração de novo — assim a previsão é recalculada com os dados de agora.",
  PROPOSTA_JA_DECIDIDA:
    "Esta proposta já havia sido decidida. Nada foi alterado agora.",
  HASH_DIVERGENTE:
    "A confirmação não corresponde à previsão que estava na tela. Nada foi alterado. Recarregue a conversa e confirme de novo.",
  // A frase mais importante do arquivo: ela é o que o dono lê quando o mundo mudou entre
  // propor e confirmar, e precisa deixar claro que a recusa PROTEGEU alguma coisa.
  EFEITO_MUDOU:
    "Os dados mudaram depois que esta proposta foi criada, e o efeito não seria mais o que a tela mostrou. Nada foi alterado. Peça a alteração de novo para ver a previsão atualizada.",
  COMMAND_DESCONHECIDO:
    "Esta proposta aponta para uma ação que o sistema não reconhece. Nada foi alterado.",
  JA_EXECUTADA:
    "Esta ação já foi executada. Nada foi feito de novo — confira o registro pelo link da ação.",
  SEM_CONFIRMACAO:
    "Esta proposta ainda não foi confirmada. Nada foi alterado.",
};

export type AdmissaoInput = {
  /** `null` quando a proposta não existe ou não é do usuário — o guard não distingue os dois. */
  readonly proposta: {
    readonly expiresAt: string;
    readonly effectHash: string;
    readonly command: string;
  } | null;
  /** O hash que a TELA devolveu junto do clique. */
  readonly hashDaTela: string;
  /** A decisão já registrada, se houver. */
  readonly decisao: DecisaoDoDono | null;
  /** Se já existe execução para esta proposta. */
  readonly jaExecutou: boolean;
  /** Os commands que o mapa fechado conhece. Vazio na 18-C · Bloco 3, e isso é proposital. */
  readonly commandsConhecidos: readonly string[];
};

export type Admissao =
  | { readonly ok: true }
  | { readonly ok: false; readonly motivo: MotivoDeRecusa; readonly mensagem: string };

function negar(motivo: MotivoDeRecusa): Admissao {
  return { ok: false, motivo, mensagem: MENSAGEM_DE_RECUSA[motivo] };
}

/**
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ A ORDEM DAS CHECAGENS, DE NOVO, NÃO É ESTILO.                                         ║
 * ║                                                                                       ║
 * ║  1. existe?        — sem proposta não há o que dizer sobre prazo nem sobre hash        ║
 * ║  2. já executou?   — o caso do clique duplo e do replay. Vem ANTES do prazo: uma ação  ║
 * ║                      executada às 9h59 não pode ser relatada como "expirada" às 10h01, ║
 * ║                      porque a alteração ACONTECEU e o dono precisa saber disso.        ║
 * ║  3. já decidiu?    — recusa anterior é final                                            ║
 * ║  4. prazo          — a janela                                                          ║
 * ║  5. hash da tela   — o dono confirmou a previsão que leu?                              ║
 * ║  6. command existe — antes de qualquer I/O de domínio                                  ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * A comparação de hash é `===` sobre hex minúsculo de comprimento fixo — o CHECK do banco
 * garante o formato dos dois lados. Não há aqui segredo a proteger de ataque de tempo: o
 * hash não é credencial, e quem o obtém já é o dono da linha pela RLS.
 */
export function admitirExecucao(input: AdmissaoInput, agora: Date): Admissao {
  if (!input.proposta) return negar("PROPOSTA_NAO_ENCONTRADA");
  if (input.jaExecutou) return negar("JA_EXECUTADA");
  if (input.decisao === "recusada") return negar("PROPOSTA_JA_DECIDIDA");
  if (venceu(input.proposta.expiresAt, agora)) return negar("PROPOSTA_EXPIRADA");
  if (input.hashDaTela !== input.proposta.effectHash) return negar("HASH_DIVERGENTE");
  if (!input.commandsConhecidos.includes(input.proposta.command)) {
    return negar("COMMAND_DESCONHECIDO");
  }
  return { ok: true };
}

/**
 * A REVALIDAÇÃO — a checagem que roda DEPOIS de recalcular a previsão com os dados de agora.
 *
 * Separada de `admitirExecucao` porque acontece em outro momento: ali o mundo ainda não foi
 * consultado; aqui já foi. Juntá-las faria o recálculo (que custa consultas) rodar antes das
 * checagens baratas — e, pior, esconderia que são duas garantias distintas.
 */
export function revalidarEfeito(
  hashGravado: string,
  hashRecalculado: string,
): Admissao {
  return hashGravado === hashRecalculado ? { ok: true } : negar("EFEITO_MUDOU");
}
