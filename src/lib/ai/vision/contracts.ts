/**
 * Fase 18-D — IA · O que uma extração É.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ `nao_identificado` NÃO É ZERO E NÃO É `null` AMBÍGUO. É UM ESTADO.                    ║
 * ║                                                                                       ║
 * ║ É a invariante 1 da Dieta (`value_state` distingue "medido zero" de "não medido") e a ║
 * ║ 3 dos Treinos ("sem peso corporal, a carga efetiva é INDISPONÍVEL, nunca zero")        ║
 * ║ aplicadas ao OCR. Um campo que o modelo não conseguiu ler é declarado como ilegível — ║
 * ║ nunca preenchido com um palpite, nunca zerado, e nunca escondido da tela.              ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * Puro. Nenhum I/O.
 */

/**
 * O que o MODELO pode dizer sobre a própria leitura. Três níveis, e só isso — pedir uma
 * porcentagem produziria um número com aparência de medida que é chute.
 */
export const CONFIANCAS_DO_MODELO = ["alta", "media", "baixa"] as const;
export type ConfiancaDoModelo = (typeof CONFIANCAS_DO_MODELO)[number];

/**
 * O que o SERVIDOR conclui. Os três do modelo, mais dois que só o servidor pode atribuir:
 *
 *  • `conflito`         — há um valor, e ele DISCORDA de outro dado da mesma nota (o caso
 *                         real: a soma dos itens não fecha com o total impresso). Não é
 *                         "baixa confiança": é uma contradição, e chamá-la de baixa faria
 *                         parecer que basta o dono olhar com atenção.
 *  • `nao_identificado` — não há valor. O campo veio ausente ou ilegível.
 */
export const CONFIANCAS = [
  "alta",
  "media",
  "baixa",
  "conflito",
  "nao_identificado",
] as const;
export type Confianca = (typeof CONFIANCAS)[number];

/**
 * A ordem do PIOR para o MELHOR. Existe para uma coisa só: `rebaixar` sempre devolve o
 * mínimo, e **nunca o máximo**.
 *
 * ⛔ Não existe função `promover`, e a ausência é a trava. A confiança declarada pelo modelo
 * é o TETO do que o servidor pode concluir; nenhuma regra pode elevá-la. Uma função de
 * promoção seria o caminho pelo qual "o modelo disse que estava incerto, mas o formato
 * bateu" viraria "alta" — que é exatamente a autoavaliação virando barreira.
 */
const RANK: Record<Confianca, number> = {
  nao_identificado: 0,
  conflito: 1,
  baixa: 2,
  media: 3,
  alta: 4,
};

/** O pior dos dois. É a única operação de composição que existe. */
export function rebaixar(atual: Confianca, teto: Confianca): Confianca {
  return RANK[teto] < RANK[atual] ? teto : atual;
}

/** Confiança que BLOQUEIA a proposta quando o campo é essencial. */
export function ehIncerta(c: Confianca): boolean {
  return RANK[c] <= RANK.baixa;
}

/**
 * Um campo extraído. `valor: null` ⇒ `confianca: "nao_identificado"` — e o inverso também
 * vale. `motivo` explica o rebaixamento na tela, em pt-BR.
 */
export type Campo<T> = {
  readonly valor: T | null;
  readonly confianca: Confianca;
  /** Por que a confiança é essa, quando o servidor a rebaixou. `null` = o modelo decidiu. */
  readonly motivo: string | null;
};

export type ItemDaNota = {
  readonly descricao: string;
  /** Centavos. `null` = não identificado — nunca 0. */
  readonly valorTotalCentavos: number | null;
  readonly quantidade: number | null;
  readonly confianca: Confianca;
};

/**
 * A extração inteira, já validada e rebaixada pelo servidor.
 *
 * Dinheiro em CENTAVOS (integer), como todo o financeiro do projeto. Data PURA
 * (`'yyyy-MM-dd'`), que não tem fuso e é manipulada como texto.
 */
export type ExtracaoDeComprovante = {
  readonly estabelecimento: Campo<string>;
  readonly cnpj: Campo<string>;
  readonly data: Campo<string>;
  readonly hora: Campo<string>;
  readonly totalCentavos: Campo<number>;
  readonly formaPagamento: Campo<string>;
  readonly numeroDocumento: Campo<string>;
  readonly itens: readonly ItemDaNota[];
};

/**
 * Os campos ESSENCIAIS — os que bloqueiam a proposta quando incertos.
 *
 * ⛔ A lista é curta de propósito, e cada um está aqui por um motivo diferente:
 *  • `totalCentavos` — errar o valor é errar o lançamento inteiro;
 *  • `data`          — a data decide EM QUAL FATURA a compra cai (`invoice.ts`), então uma
 *                      data errada não erra só o dia: erra o mês da fatura.
 *
 * `estabelecimento` NÃO está aqui: ele vira a descrição, e descrição errada é chata, não
 * perigosa — o dono a corrige na tela sem consequência sobre nenhum cálculo. A conta
 * também não, porque ela não vem da imagem: quem a escolhe é o dono, na revisão.
 */
export const CAMPOS_ESSENCIAIS = ["totalCentavos", "data"] as const;
export type CampoEssencial = (typeof CAMPOS_ESSENCIAIS)[number];

export const ROTULO_DO_CAMPO: Record<CampoEssencial, string> = {
  totalCentavos: "valor total",
  data: "data da compra",
};
