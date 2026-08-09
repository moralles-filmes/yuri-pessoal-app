/**
 * Fase 18-D · Bloco 5 — IA · A REVISÃO DO DONO, e o que ela faz com a confiança.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ⛔ CORRIGIR UM CAMPO O TRAZ PARA `alta` — E O MOTIVO REGISTRA QUEM PREENCHEU.         ║
 * ║                                                                                       ║
 * ║ Não é porque o modelo melhorou: é porque quem preencheu foi o DONO, que é a autoridade║
 * ║ final sobre o próprio comprovante. Mas a tela precisa distinguir "o modelo leu com    ║
 * ║ clareza" de "eu digitei" — as duas coisas seriam `alta` indistinguíveis sem o motivo, ║
 * ║ e a auditoria perderia justamente o que ela existe para guardar.                       ║
 * ║                                                                                       ║
 * ║ É por isso que `correcoes` é uma COLUNA SEPARADA de `campos` em                        ║
 * ║ `ai_document_extractions`: sobrescrever `campos` apagaria a leitura original.          ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * Puro. Nenhum I/O.
 */

import { corrigir, podePropor, type VereditoDaProposta } from "./confidence";
import type { Campo, ExtracaoDeComprovante } from "./contracts";

/**
 * O que o dono pode corrigir.
 *
 * ⛔ `itens` NÃO está aqui, e a ausência é deliberada: o lançamento usa o TOTAL impresso
 * (`receipt-items.ts` § "A SOBRA É DECLARADA"), então corrigir o valor de um item mudaria a
 * conferência da nota sem mudar o que vai ser lançado — um campo que promete um efeito que
 * não existe. A classificação dos itens é conferência, e é tratada à parte.
 *
 * Campo ausente = "não corrigi". Campo com `null` = "não consegui identificar isto", que é
 * uma correção legítima e diferente de não mexer: ela zera um valor que o modelo leu errado.
 */
export type CorrecoesDoDono = {
  readonly estabelecimento?: string | null;
  readonly cnpj?: string | null;
  readonly data?: string | null;
  readonly hora?: string | null;
  readonly totalCentavos?: number | null;
  readonly formaPagamento?: string | null;
  readonly numeroDocumento?: string | null;
};

/** Os campos corrigíveis, para a tela e para o schema não divergirem de uma lista escrita à mão. */
export const CAMPOS_CORRIGIVEIS = [
  "estabelecimento",
  "cnpj",
  "data",
  "hora",
  "totalCentavos",
  "formaPagamento",
  "numeroDocumento",
] as const;

export type CampoCorrigivel = (typeof CAMPOS_CORRIGIVEIS)[number];

/**
 * Aplica as correções e devolve a extração EFETIVA — a que o `podePropor` julga e a que
 * vira lançamento.
 *
 * ⚠️ Correção para `null` NÃO vira `alta`: ela vira `nao_identificado`. "Eu digitei que não
 * consigo identificar" é uma declaração de ausência, e marcá-la como alta confiança faria o
 * bloqueio de campo essencial passar por cima de um campo que o próprio dono disse não saber
 * — que é exatamente o desfecho que `podePropor` existe para impedir.
 */
export const MOTIVO_MARCADO_PELO_DONO =
  "Você marcou este campo como não identificado.";

/** Genérica e sem `as`: o cast seria justamente onde um campo trocaria de tipo sem ninguém ver. */
function aplicarCampo<T extends string | number>(
  atual: Campo<T>,
  novo: T | null | undefined,
): Campo<T> {
  if (novo === undefined) return atual;
  if (novo === null) {
    return { valor: null, confianca: "nao_identificado", motivo: MOTIVO_MARCADO_PELO_DONO };
  }
  return corrigir(novo);
}

export function aplicarCorrecoes(
  extracao: ExtracaoDeComprovante,
  correcoes: CorrecoesDoDono,
): ExtracaoDeComprovante {
  return {
    ...extracao,
    estabelecimento: aplicarCampo(extracao.estabelecimento, correcoes.estabelecimento),
    cnpj: aplicarCampo(extracao.cnpj, correcoes.cnpj),
    data: aplicarCampo(extracao.data, correcoes.data),
    hora: aplicarCampo(extracao.hora, correcoes.hora),
    totalCentavos: aplicarCampo(extracao.totalCentavos, correcoes.totalCentavos),
    formaPagamento: aplicarCampo(extracao.formaPagamento, correcoes.formaPagamento),
    numeroDocumento: aplicarCampo(extracao.numeroDocumento, correcoes.numeroDocumento),
  };
}

export type RevisaoDoComprovante = {
  readonly efetiva: ExtracaoDeComprovante;
  readonly veredito: VereditoDaProposta;
};

/**
 * A revisão inteira: correções aplicadas + o veredito do bloqueio.
 *
 * ⛔ O VEREDITO É DO SERVIDOR. A tela esconde o botão quando `pode: false`, e isso é UX; a
 * garantia é esta função rodar de novo na Server Action, antes de gravar a proposta. Um
 * botão escondido é contornável; uma recusa no servidor não.
 */
export function revisar(
  extracao: ExtracaoDeComprovante,
  correcoes: CorrecoesDoDono,
): RevisaoDoComprovante {
  const efetiva = aplicarCorrecoes(extracao, correcoes);
  return { efetiva, veredito: podePropor(efetiva) };
}

/**
 * A descrição do lançamento, a partir do que sobreviveu à revisão.
 *
 * ⚠️ Sem estabelecimento legível, a descrição NÃO é inventada nem fica vazia: ela diz o que
 * de fato se sabe. `lancarTransacao` exige `descricao` com pelo menos um caractere, e mandar
 * "" faria a proposta falhar na validação com uma mensagem sobre um campo que o dono nem viu.
 */
export const DESCRICAO_SEM_ESTABELECIMENTO = "Compra em estabelecimento não identificado";

export function descricaoDoLancamento(extracao: ExtracaoDeComprovante): string {
  const nome = extracao.estabelecimento.valor?.trim() ?? "";
  return nome.length > 0 ? nome.slice(0, 200) : DESCRICAO_SEM_ESTABELECIMENTO;
}
