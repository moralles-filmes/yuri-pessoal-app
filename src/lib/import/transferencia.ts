/**
 * Fase 06 (iteração) — Reconhecimento de TRANSFERÊNCIA em EXTRATO DE CONTA (lógica PURA,
 * testada em transferencia.test.ts).
 *
 * Um extrato bancário não traz só despesa e receita. Traz dinheiro que MUDA DE LUGAR sem ser
 * nenhuma das duas — pagamento de fatura de cartão, aplicação, resgate, conta para conta. Sem
 * este passo, toda linha dessas entrava como gasto ou entrada, e o pagamento da fatura contava
 * o cartão DUAS vezes: uma pela fatura importada, outra pelo extrato.
 *
 * ⛔ **O VOCABULÁRIO É ALLOWLIST DE EXPRESSÃO, NUNCA DE PALAVRA SOLTA.** "pix", "ted", "doc" e
 * "transferencia" sozinhos ficam DE FORA de propósito: "PIX ENVIADO - PADARIA" é uma despesa
 * real e "TRANSFERENCIA RECEBIDA - CLIENTE" é uma receita real. Palavra ambígua não erra a
 * classificação, ela a DESLIGA — a mesma disciplina que deixou "meta" e "tarefa" fora do
 * roteador de agentes da 18-C por casarem com três módulos.
 *
 * ── As duas espécies, e por que elas terminam diferente ──
 *
 * **`pagamento_fatura`** vira `ignorada`, exatamente como a fatura de cartão auto-ignora a sua
 * própria linha de pagamento (`ehPagamentoFatura`, mapping.ts). Não é teimosia: quem paga
 * fatura neste sistema é **Faturas → pagar**, que além do lançamento marca `pago_em` e
 * `pago_transacao_id` na fatura. Importá-lo como uma transferência solta criaria um pagamento
 * que não deixa fatura nenhuma paga — uma SEGUNDA verdade sobre o mesmo fato, que é o que a
 * invariante "a fonte de verdade é declarada e única" (17-F) existe para impedir.
 *
 * **`entre_contas`** só ganha um AVISO no `motivo`, e continua `para_importar` com o sentido
 * intacto. Ela não é convertida aqui porque converter exige saber a OUTRA conta, e o pipeline
 * puro não a conhece: quem a escolhe é o usuário na revisão, e essa escolha é o próprio ato de
 * transformar a linha em transferência (ver a migration da coluna `transfer_account_id`).
 * Adivinhar o destino moveria o saldo de uma conta que não teve movimento nenhum, e nada na
 * tela denunciaria isso.
 *
 * ── Para que lado erramos ──
 * Uma linha avisada por engano custa um aviso que o usuário lê e ignora. Uma linha NÃO avisada
 * vira gasto em dobro e some no meio de dezenas de lançamentos. Por isso "pagamento de fatura"
 * basta, mesmo sabendo que casaria também com um improvável "PAGAMENTO FATURA VIVO": ali o
 * erro é visível na revisão (a linha aparece em "Ignoradas", com o motivo escrito) e um clique
 * a traz de volta.
 */
import { normalizarDescricao } from "@/lib/import/normalize";
import type { NormalizedRow } from "@/lib/import/types";

/** O que a linha do extrato parece ser, quando parece uma transferência. */
export type EspecieTransferencia = "pagamento_fatura" | "entre_contas";

export type DeteccaoTransferencia = {
  especie: EspecieTransferencia;
  /** Texto pt-BR mostrado na revisão, sempre dizendo o que fazer a seguir. */
  motivo: string;
};

/**
 * Pagamento de fatura de cartão. Exige uma palavra de PAGAMENTO acompanhada de "fatura" ou de
 * "cartao" — "fatura" sozinha é conta de consumo ("FATURA VIVO") e "cartao" sozinho é compra
 * no débito ("CARTAO 1234 PADARIA"). A folga de até 20 caracteres entre as duas cobre o miolo
 * que os bancos enfiam no meio ("PAGAMENTO DE FATURA", "PAG DE FATURA DO CARTAO").
 */
const PAGAMENTO_FATURA: RegExp[] = [
  /\b(pagamento|pagto|pgto|pag)\b[a-z0-9 ]{0,20}\bfatura\b/,
  /\bfatura\b[a-z0-9 ]{0,20}\b(cartao|credito)\b/,
  /\b(pagamento|pagto|pgto|pag)\b[a-z0-9 ]{0,20}\bcartao de credito\b/,
];

/**
 * Dinheiro andando entre contas do próprio dono. Só expressões sem leitura de despesa: aplicar
 * e resgatar são sempre movimento interno, e "entre contas" é literal.
 */
const ENTRE_CONTAS: RegExp[] = [
  /\baplicacao\b/,
  /\bresgate\b/,
  /\bentre contas\b/,
  /\b(transferencia|transf)\b[a-z0-9 ]{0,20}\b(poupanca|aplicacao|investimento)\b/,
  /\b(poupanca|investimento)\b[a-z0-9 ]{0,20}\b(transferencia|transf)\b/,
];

/**
 * Classifica a descrição de UMA linha de extrato. Retorna `null` para tudo que não casa com o
 * vocabulário — que é a resposta certa para a maioria das linhas, e a única honesta para as
 * ambíguas.
 */
export function detectarTransferencia(
  descricao: string | null | undefined,
): DeteccaoTransferencia | null {
  const d = normalizarDescricao(descricao);
  if (!d) return null;

  if (PAGAMENTO_FATURA.some((re) => re.test(d))) {
    return {
      especie: "pagamento_fatura",
      motivo:
        "Parece pagamento de fatura de cartão — esse gasto já entra pela fatura. Registre o pagamento em Faturas para a fatura constar paga.",
    };
  }
  if (ENTRE_CONTAS.some((re) => re.test(d))) {
    return {
      especie: "entre_contas",
      motivo:
        "Parece transferência entre contas suas. Escolha a outra conta na revisão para não entrar como gasto.",
    };
  }
  return null;
}

/** As duas pernas de uma transferência, no formato que `transactionSchema` espera. */
export type PernasDaTransferencia = {
  /** De onde o dinheiro SAIU (`−amount` no saldo). */
  account_id: string;
  /** Para onde o dinheiro FOI (`+amount` no saldo). */
  transfer_account_id: string;
};

/**
 * Resolve qual das duas contas é a ORIGEM de uma transferência importada de extrato.
 *
 * ⛔ **É aqui que o sentido preservado em `tipo` paga.** O extrato é sempre o da `contaDoLote`,
 * e o sinal do arquivo já disse se o dinheiro saiu dela ou entrou nela:
 *
 *     despesa (saiu)   →  origem = conta do lote,  destino = a outra
 *     receita (entrou) →  origem = a outra,        destino = conta do lote
 *
 * Trocar os dois lados não dá erro em lugar nenhum — `public.account_balance` simplesmente
 * aplica `−amount` na conta errada e `+amount` na outra. Uma aplicação apareceria como resgate,
 * o saldo das duas contas sairia invertido e nada na tela denunciaria. Por isso a decisão é uma
 * função pura com teste, e não três linhas dentro da Server Action.
 */
export function pernasDaTransferencia(params: {
  /**
   * Sentido da linha, vindo do sinal do arquivo. Tipado como `string | null` porque é assim que
   * `import_rows.tipo` (coluna `text`) chega do banco — e interpretar esse texto é justamente o
   * trabalho desta função. Estreitar no chamador espalharia a regra por quem a chama.
   */
  tipo: string | null;
  /** Conta do extrato que está sendo importado. */
  contaDoLote: string;
  /** A conta que o usuário escolheu na revisão (`transfer_account_id` da linha). */
  outraConta: string;
}): PernasDaTransferencia {
  const { tipo, contaDoLote, outraConta } = params;
  // Só 'receita' é entrada; qualquer outra coisa (inclusive nulo) é saída — o mesmo padrão do
  // resto do commit, onde tipo ausente vira despesa.
  const saiuDaConta = tipo !== "receita";
  return saiuDaConta
    ? { account_id: contaDoLote, transfer_account_id: outraConta }
    : { account_id: outraConta, transfer_account_id: contaDoLote };
}

/**
 * Passo do pipeline: avisa sobre as transferências de um lote de EXTRATO.
 *
 * ⚠️ **Roda DEPOIS de `detectarDuplicados`**, como `marcarParcelasJaLancadas`. A dedup promove
 * a linha limpando o `motivo` (`{ status: "para_importar", motivo: null }`) — rodar antes dela
 * faria o aviso desaparecer em silêncio justo nas linhas que ele existe para marcar.
 *
 * Só toca em extrato (`origem === "conta"`): numa fatura de cartão não existe transferência, e
 * a linha de pagamento dela já é resolvida no mapeamento. Linha em `erro`, já `ignorada` ou
 * acusada de `duplicada` passa intacta — o motivo que ela já tem é mais específico que este.
 *
 * ⚠️ **Nenhuma linha muda de `tipo` aqui.** O sentido que veio do sinal do arquivo é o que
 * decide, mais tarde, qual das duas contas é a origem da transferência — sobrescrevê-lo faria
 * uma aplicação virar indistinguível de um resgate.
 */
export function marcarTransferencias(
  rows: NormalizedRow[],
  origem: "cartao" | "conta",
): NormalizedRow[] {
  if (origem !== "conta") return rows;

  return rows.map((r) => {
    if (r.status === "erro" || r.status === "ignorada" || r.status === "duplicada") {
      return r;
    }

    const achado = detectarTransferencia(r.descricao);
    if (!achado) return r;

    if (achado.especie === "pagamento_fatura") {
      return { ...r, status: "ignorada" as const, motivo: achado.motivo };
    }
    return { ...r, motivo: achado.motivo };
  });
}
