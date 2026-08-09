/**
 * Fase 18-E — IA · `{{ind:x}}` → o número formatado. Puro.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ O TEXTO GRAVADO NÃO TEM NÚMERO. ESTE ARQUIVO É O ÚNICO LUGAR ONDE ELE APARECE.        ║
 * ║                                                                                       ║
 * ║ `ai_insights.explicacao` guarda "Você treinou {{ind:treinos.sessoes}} vezes". Enquanto ║
 * ║ ele guardar tokens, é IMPOSSÍVEL o banco conter um insight que cite um número fora de  ║
 * ║ `ai_insight_sources` — a garantia é propriedade do dado, não consequência de o          ║
 * ║ validador ter rodado.                                                                  ║
 * ║                                                                                       ║
 * ║ ⛔ INDICADOR NÃO MEDIDO RENDERIZA "não medido" COM O MOTIVO. Nunca "—", nunca "0". É a ║
 * ║ invariante 1 da Dieta e a 57 da 18-D chegando ao pixel: "—" não distingue "medi e deu  ║
 * ║ zero" de "não medi", e é justamente essa distinção que o sistema inteiro carrega.      ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */

import { formatCurrency } from "@/lib/format";

import { TOKEN_DE_INDICADOR } from "./contracts";

/** Uma linha de `ai_insight_sources`, na forma em que a tela a recebe. */
export type FonteDoInsight = {
  readonly indicador_id: string;
  readonly rotulo: string;
  readonly valor: number | null;
  readonly indisponivel_porque: string | null;
  readonly unidade: string;
  readonly qualidade: "exato" | "parcial";
  readonly motivo_incompleto: string | null;
  readonly periodo_de: string;
  readonly periodo_ate: string;
  readonly n: number;
  readonly regra_de_contagem: string | null;
  readonly rota: string;
};

/**
 * ⚠️ O texto que substitui um token cujo id NÃO tem fonte.
 *
 * Não deveria acontecer — o validador recusa o insight antes de gravar. Mas o texto está no
 * banco e a fonte é outra linha: um `delete` mal feito, uma restauração parcial, um bug
 * futuro. Deixar o token cru na tela mostraria `{{ind:x}}` ao dono; apagá-lo em silêncio faria
 * a frase "você treinou vezes" parecer um erro de digitação. O marcador é explícito.
 */
export const TOKEN_SEM_FONTE = "[número indisponível]";

const formatadorPtBR = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/**
 * O número com a unidade, pronto para ler.
 *
 * `R$` entra por `formatCurrency` (que recebe REAIS — ver a nota de dinheiro no CLAUDE.md);
 * `%` cola no número sem espaço; o resto vai com espaço. Arredondar SÓ na apresentação é a
 * regra 7 da Dieta, e é por isso que a fonte guarda o valor cheio.
 */
export function formatarValor(valor: number, unidade: string): string {
  if (unidade === "R$") return formatCurrency(valor);
  if (unidade === "%") {
    const sinal = valor > 0 ? "+" : "";
    return `${sinal}${formatadorPtBR.format(valor)}%`;
  }
  return `${formatadorPtBR.format(valor)} ${unidade}`.trim();
}

/** O que aparece no lugar do token, medido ou não. */
export function textoDaFonte(fonte: FonteDoInsight): string {
  if (fonte.valor === null) {
    const motivo = fonte.indisponivel_porque?.trim();
    return motivo ? `não medido (${motivo})` : "não medido";
  }
  return formatarValor(fonte.valor, fonte.unidade);
}

/**
 * Resolve todos os tokens do texto a partir das fontes.
 *
 * ⚠️ Uma passada só, com `replace` e função — não um laço de `replaceAll` por fonte. Com o
 * laço, um VALOR que por acaso contivesse `{{ind:…}}` seria substituído na volta seguinte, e o
 * conteúdo de uma fonte viraria instrução de renderização. Aqui o texto substituído nunca é
 * reexaminado.
 */
export function renderizarExplicacao(
  texto: string,
  fontes: readonly FonteDoInsight[],
): string {
  const porId = new Map(fontes.map((f) => [f.indicador_id, f]));
  return texto.replace(TOKEN_DE_INDICADOR, (_todo, id: string) => {
    const fonte = porId.get(id);
    return fonte ? textoDaFonte(fonte) : TOKEN_SEM_FONTE;
  });
}

/**
 * A ressalva que acompanha uma fonte na tela: quantos registros entraram, sob que regra, e o
 * que ficou de fora. Vazia quando não há nada a ressalvar.
 *
 * Ela existe porque o número sozinho não é verificável — invariante 12 dos Treinos, e a
 * mesma razão pela qual `regra_de_contagem` viaja com o volume desde a 17-D.
 */
export function ressalvaDaFonte(fonte: FonteDoInsight): string[] {
  const partes: string[] = [];
  if (fonte.qualidade === "parcial" && fonte.motivo_incompleto) {
    partes.push(`Incompleto: ${fonte.motivo_incompleto}`);
  }
  if (fonte.regra_de_contagem) partes.push(`Regra de contagem: ${fonte.regra_de_contagem}`);
  if (fonte.valor !== null) {
    partes.push(
      fonte.n === 1 ? "1 registro no período" : `${fonte.n} registros no período`,
    );
  }
  return partes;
}
