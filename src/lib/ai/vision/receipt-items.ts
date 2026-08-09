/**
 * Fase 18-D — IA · A nota com vários itens, e para onde cada um vai.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ A SOBRA É DECLARADA. NUNCA RATEADA EM SILÊNCIO.                                       ║
 * ║                                                                                       ║
 * ║ Se o dono classificou R$ 80 de uma nota de R$ 100, os R$ 20 restantes viram **"não    ║
 * ║ atribuído"**, visível, com o número. A tentação é distribuí-los proporcionalmente     ║
 * ║ entre o que já foi classificado — e isso produziria um lançamento que parece completo ║
 * ║ e não é, que é o defeito mais caro que este módulo pode ter.                           ║
 * ║                                                                                       ║
 * ║ É a mesma disciplina de `import/split-totals.ts` (16-D/2026-08-07): **divisão que não ║
 * ║ fecha fica FORA da soma, e o lote se declara parcial**.                                ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * ═══════════════ ITEM IGNORADO NÃO SOME ═══════════════
 *
 * "Ignorar itens que não são do dono" é um dos cinco destinos previstos. Ignorado ≠ apagado:
 * ele continua na lista, com o motivo, e o valor dele entra em `ignoradoCentavos`. Uma nota
 * em que metade dos itens sumiu da tela é uma nota que o dono não consegue conferir.
 *
 * ⛔ **A DIVISÃO COM TERCEIROS NÃO É CALCULADA AQUI.** Este arquivo só diz QUANTO é de cada
 * pessoa; quem distribui é `finance/split.ts` (`dividirDespesa` + `toPartesDivisao`), o
 * núcleo único que a importação e o formulário já usam. Uma segunda distribuição faria a
 * tela prometer um número e a fatura receber outro — o bug de 2026-08-07, de novo.
 *
 * Puro. Nenhum I/O.
 */

import type { ItemDaNota } from "./contracts";

export type DestinoDoItem =
  /** Despesa do dono, na categoria principal do lançamento. */
  | { readonly tipo: "meu" }
  /** Despesa do dono, mas em outra categoria — o destino "separar categorias". */
  | { readonly tipo: "categoria"; readonly categoriaId: string }
  /** Parte de outra pessoa. O rateio em si é de `finance/split.ts`. */
  | { readonly tipo: "terceiro"; readonly pessoaId: string }
  /** Não é do dono e não é de ninguém que ele cobre. Continua visível. */
  | { readonly tipo: "ignorado"; readonly motivo: string };

export type ItemClassificado = {
  readonly item: ItemDaNota;
  readonly destino: DestinoDoItem;
};

export type ResumoDaNota = {
  readonly totalDeclarado: number;
  /**
   * `null` quando ALGUM item classificado está ilegível. Não é zero, e não é a soma dos
   * legíveis: uma soma parcial apresentada como total é exatamente a mentira que a
   * invariante 1 da Dieta proíbe.
   */
  readonly somaClassificada: number | null;
  readonly meuCentavos: number | null;
  readonly porCategoria: Readonly<Record<string, number>>;
  readonly porTerceiro: Readonly<Record<string, number>>;
  readonly ignoradoCentavos: number | null;
  /**
   * O que sobrou do total depois de tudo que foi classificado. `null` quando indeterminado.
   * **Positivo é normal** (o dono ainda não classificou tudo); **negativo é erro** e a tela
   * precisa dizer, porque significa que a classificação passou do total impresso.
   */
  readonly naoAtribuidoCentavos: number | null;
  /** `true` só quando tudo foi classificado, tudo é legível e a conta fecha exatamente. */
  readonly fecha: boolean;
  /** pt-BR, para a tela. Sempre presente — nunca um número solto sem explicação. */
  readonly explicacao: string;
};

function reais(centavos: number): string {
  return (centavos / 100).toFixed(2).replace(".", ",");
}

/**
 * Soma um recorte dos itens. `null` assim que encontra um ilegível — a propagação da
 * incerteza é o comportamento, não um caso de borda.
 */
function somar(itens: readonly ItemClassificado[]): number | null {
  let total = 0;
  for (const { item } of itens) {
    if (item.valorTotalCentavos === null) return null;
    total += item.valorTotalCentavos;
  }
  return total;
}

export function resumirNota(
  totalDeclarado: number,
  classificados: readonly ItemClassificado[],
): ResumoDaNota {
  const meus = classificados.filter((c) => c.destino.tipo === "meu");
  const ignorados = classificados.filter((c) => c.destino.tipo === "ignorado");
  const categorizados = classificados.filter((c) => c.destino.tipo === "categoria");
  const terceiros = classificados.filter((c) => c.destino.tipo === "terceiro");

  const porCategoria: Record<string, number> = {};
  for (const c of categorizados) {
    if (c.destino.tipo !== "categoria" || c.item.valorTotalCentavos === null) continue;
    porCategoria[c.destino.categoriaId] =
      (porCategoria[c.destino.categoriaId] ?? 0) + c.item.valorTotalCentavos;
  }

  const porTerceiro: Record<string, number> = {};
  for (const c of terceiros) {
    if (c.destino.tipo !== "terceiro" || c.item.valorTotalCentavos === null) continue;
    porTerceiro[c.destino.pessoaId] =
      (porTerceiro[c.destino.pessoaId] ?? 0) + c.item.valorTotalCentavos;
  }

  // ⚠️ `somar` sobre a lista INTEIRA, e não a soma dos quatro recortes: se um item ilegível
  // estiver em qualquer recorte, o total classificado é indeterminado, e somar recortes
  // (alguns `null`, outros número) esconderia isso.
  const somaClassificada = somar(classificados);
  const naoAtribuido = somaClassificada === null ? null : totalDeclarado - somaClassificada;

  const fecha = naoAtribuido === 0;

  return {
    totalDeclarado,
    somaClassificada,
    meuCentavos: somar(meus),
    porCategoria,
    porTerceiro,
    ignoradoCentavos: somar(ignorados),
    naoAtribuidoCentavos: naoAtribuido,
    fecha,
    explicacao: explicar(totalDeclarado, somaClassificada, naoAtribuido, classificados.length),
  };
}

function explicar(
  total: number,
  soma: number | null,
  naoAtribuido: number | null,
  quantos: number,
): string {
  if (quantos === 0) {
    return `Nenhum item classificado: o lançamento usa o total de R$ ${reais(total)}.`;
  }
  if (soma === null) {
    return (
      "Há item com valor não identificado, então a conta da nota fica indeterminada. " +
      `O lançamento usa o total de R$ ${reais(total)}.`
    );
  }
  if (naoAtribuido === 0) {
    return `Os itens somam exatamente o total de R$ ${reais(total)}.`;
  }
  if (naoAtribuido !== null && naoAtribuido > 0) {
    return (
      `R$ ${reais(naoAtribuido)} do total ainda não foram atribuídos a nenhum item. ` +
      "Eles continuam no lançamento, como parte não detalhada."
    );
  }
  return (
    `Os itens somam R$ ${reais(soma)}, que é MAIS que o total impresso de R$ ${reais(total)}. ` +
    "Confira as quantidades e os descontos antes de continuar."
  );
}

/**
 * Classificação inicial: **tudo é do dono**.
 *
 * É o padrão certo porque é o caso mais comum (a nota inteira é dele) e porque o erro que
 * ele produz é visível — o dono vê o item na lista e o move. O padrão oposto ("nada é meu")
 * produziria um lançamento de R$ 0,00 que parece legítimo.
 */
export function classificacaoInicial(
  itens: readonly ItemDaNota[],
): ItemClassificado[] {
  return itens.map((item) => ({ item, destino: { tipo: "meu" as const } }));
}
