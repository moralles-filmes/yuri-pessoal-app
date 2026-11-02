/**
 * REDESIGN-04-B · T5 — as URLs do detalhe de cada número do painel financeiro, prontas.
 *
 * PURO e só `import type`: o servidor monta, o cliente só desenha (o cliente não monta URL). Cada
 * número do painel que abre a gaveta tem aqui o seu endereço, e a regra "o que abre" mora num lugar:
 * na base caixa, `categoria`, `forma` e `cartao` não são calculados (`detalheDoNumero` devolve "não
 * segue"), então o painel NÃO oferece esses links — `cartao` vira `null` e os dois mapas ficam vazios.
 * O contrário vale para as sete linhas do bloco do caixa: só existem na base caixa.
 *
 * Partes (a responsabilidade do número): o painel é sempre "meu" — `saidas` e `entradas` abrem a
 * minha parte; `terceiros` e `bruto` abrem as outras duas colunas de `saidas` (o card-âncora);
 * a fatura abre o valor CHEIO (é o número que o cartão mostra).
 */
import type { ChaveDoDetalhe, LinhaDoCaixa, ParteDoDetalhe } from "@/lib/finance/detalhe";
import { urlComDetalhe } from "@/lib/painel/detalhe-url";

const CAMINHO = "/dashboard/financeiro";

/** Linhas do bloco do caixa, na ordem em que a tela as mostra. */
export const LINHAS_DO_CAIXA_NO_PAINEL: readonly LinhaDoCaixa[] = [
  "renda",
  "reembolsos",
  "outras",
  "saidas",
  "pagamentos",
  "sem-destino",
  "entre-contas",
];

export type HrefsDoPainel = {
  saldo: string;
  entradas: string;
  saidas: string;
  terceiros: string;
  bruto: string;
  /** `null` na base caixa: o gasto no cartão não é calculado lá. */
  cartao: { bruto: string; meu: string } | null;
  pendente: string;
  /** Por `person_id`. */
  pendentePorPessoa: Record<string, string>;
  pendenteDoMes: string;
  /** Por `category_id`; a categoria nula usa a chave `sem-categoria`. Vazio na base caixa. */
  categorias: Record<string, string>;
  /** Por forma de pagamento. Vazio na base caixa. */
  formas: Record<string, string>;
  /** Por `statement_id` (só fatura real). */
  faturas: Record<string, string>;
  /** Por mês 'yyyy-MM'. */
  projecao: Record<string, string>;
  contas: string;
  /** As sete linhas, só na base caixa; vazio na competência. */
  caixa: Partial<Record<LinhaDoCaixa, string>>;
};

type Entrada = {
  sp: Record<string, string | string[] | undefined>;
  base: "competencia" | "caixa";
  /** `person_id` das pessoas com pendente. */
  pessoas: string[];
  /** `category_id` das fatias da rosca (nulo = sem categoria). */
  categorias: (string | null)[];
  /** Formas de pagamento das fatias. */
  formas: string[];
  /** `statement_id` das faturas reais do painel. */
  faturas: string[];
  /** Meses da projeção. */
  meses: string[];
};

export function hrefsDoPainel(p: Entrada): HrefsDoPainel {
  const noCaixa = p.base === "caixa";
  const url = (chave: ChaveDoDetalhe, parte: ParteDoDetalhe, alvo: string | null) =>
    urlComDetalhe(CAMINHO, p.sp, { chave, parte, alvo });

  const porAlvo = (alvos: readonly string[], chave: ChaveDoDetalhe, parte: ParteDoDetalhe) => {
    const out: Record<string, string> = {};
    for (const alvo of alvos) out[alvo] = url(chave, parte, alvo);
    return out;
  };

  const caixa: Partial<Record<LinhaDoCaixa, string>> = {};
  if (noCaixa) {
    for (const linha of LINHAS_DO_CAIXA_NO_PAINEL) caixa[linha] = url("caixa", "meu", linha);
  }

  return {
    saldo: url("saldo", "meu", null),
    entradas: url("entradas", "meu", null),
    saidas: url("saidas", "meu", null),
    terceiros: url("saidas", "terceiros", null),
    bruto: url("saidas", "bruto", null),
    cartao: noCaixa ? null : { bruto: url("cartao", "bruto", null), meu: url("cartao", "meu", null) },
    pendente: url("pendente", "meu", null),
    pendentePorPessoa: porAlvo(p.pessoas, "pendente", "meu"),
    pendenteDoMes: url("pendente-do-mes", "meu", null),
    categorias: noCaixa
      ? {}
      : porAlvo(
          p.categorias.map((c) => c ?? "sem-categoria"),
          "categoria",
          "meu",
        ),
    formas: noCaixa ? {} : porAlvo(p.formas, "forma", "meu"),
    faturas: porAlvo(p.faturas, "fatura", "bruto"),
    projecao: porAlvo(p.meses, "projecao", "meu"),
    contas: url("contas", "meu", null),
    caixa,
  };
}
