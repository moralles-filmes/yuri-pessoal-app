/**
 * Fase 05 — A divisão com terceiros, MONTADA (puro). Este arquivo não grava nada: devolve o
 * `DivisaoPayload` — o que a rpc recebe — e a MINHA PARTE (centavos), para o caller decidir
 * `transactions.valor_pessoal`. Quem grava `shared_expenses` + `receivables` é a rpc
 * `salvar_lancamento` (e `criar_compra_parcelada`, que a chama), numa transação.
 *
 * Tudo derivado no servidor a partir de `dividirDespesa` (split.ts) — nunca confiando nos
 * valores de divisão do client sem revalidar. O `user_id` é o do `auth.uid()` dentro da rpc.
 *
 * 03-G2 · E4 — `applySplit`/`applySplitParcelado` (a gravação linha a linha) saíram: com a rpc, uma
 * conta só alimenta um único destino.
 */
import {
  distribuirTerceirosPorParcela,
  dividirDespesa,
  toPartesDivisao,
  type ResultadoDivisao,
} from "@/lib/finance/split";
import { centavosParaReais } from "@/lib/format";
import type { SplitPartInput } from "@/lib/validators/split";

/* ───────────────────────── O payload da divisão (puro) ───────────────────────── */

/** Alcance da proteção dos recebíveis (D-G2-4): vai no payload e o SQL reconfere. */
export type AlcanceDaDivisao = "regra-cheia" | "so-dinheiro-registrado";

export type DivisaoPayload = {
  alcance: AlcanceDaDivisao;
  /** 1 por pessoa (`shared_expenses`); `valor` em REAIS. */
  pessoas: {
    person_id: string;
    tipo_divisao: string;
    percentual: number | null;
    valor: number;
  }[];
  /** 1 por pessoa (× parcela); só valor > 0. `parcela_numero` nulo = à vista. */
  recebiveis: {
    person_id: string;
    parcela_numero: number | null;
    statement_id: string | null;
    card_id: string | null;
    valor: number;
    data_prevista: string | null;
  }[];
};

export type DivisaoMontada =
  | { ok: true; divisao: DivisaoPayload; minhaParteCentavos: number }
  | { ok: false; error: string };

/** O "limpar": a despesa virou pessoal — sem divisão e sem recebíveis. */
export function divisaoVazia(alcance: AlcanceDaDivisao): DivisaoPayload {
  return { alcance, pessoas: [], recebiveis: [] };
}

function pessoasDoPayload(
  parts: SplitPartInput[],
  resultado: ResultadoDivisao,
): DivisaoPayload["pessoas"] {
  return parts.map((p, i) => ({
    person_id: p.person_id,
    tipo_divisao: p.tipo,
    percentual: p.tipo === "percentual" ? (p.percentual ?? null) : null,
    valor: centavosParaReais(resultado.partesTerceiros[i].valorCentavos),
  }));
}

/**
 * Divisão de uma despesa À VISTA / cartão simples (não parcelada): 1 recebível por pessoa (na
 * fatura da compra, quando cartão). Mesma conta de sempre: `dividirDespesa` + `toPartesDivisao`.
 */
export function montarDivisaoAVista(args: {
  totalCentavos: number;
  parts: SplitPartInput[];
  statementId: string | null;
  cardId: string | null;
  dataPrevista?: string | null;
  alcance: AlcanceDaDivisao;
}): DivisaoMontada {
  let resultado: ResultadoDivisao;
  try {
    resultado = dividirDespesa(args.totalCentavos, toPartesDivisao(args.parts));
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  return {
    ok: true,
    minhaParteCentavos: resultado.minhaParteCentavos,
    divisao: {
      alcance: args.alcance,
      pessoas: pessoasDoPayload(args.parts, resultado),
      recebiveis: resultado.partesTerceiros
        .filter((t) => t.valorCentavos > 0)
        .map((t) => ({
          person_id: t.personId,
          parcela_numero: null,
          statement_id: args.statementId,
          card_id: args.cardId,
          valor: centavosParaReais(t.valorCentavos),
          data_prevista: args.dataPrevista ?? null,
        })),
    },
  };
}

/**
 * Divisão de uma compra PARCELADA e compartilhada: a parte TOTAL de cada pessoa é distribuída
 * entre as parcelas com `distribuirTerceirosPorParcela` (resto na última, igual ao valor das
 * parcelas) e cai 1 recebível por (pessoa × parcela) na fatura daquela parcela — nenhum de R$ 0.
 */
export function montarDivisaoParcelada(args: {
  totalCentavos: number;
  parts: SplitPartInput[];
  parcelas: {
    numero: number;
    statementId: string | null;
    cardId: string | null;
    valorCentavos: number;
  }[];
  alcance: AlcanceDaDivisao;
}): DivisaoMontada {
  let resultado: ResultadoDivisao;
  try {
    resultado = dividirDespesa(args.totalCentavos, toPartesDivisao(args.parts));
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  // Distribui a parte de cada terceiro entre as parcelas garantindo que a minha parte por
  // parcela (valor da parcela − terceiros) nunca fique negativa, preservando o total de cada
  // pessoa. `m[parcela][terceiro]` em centavos.
  const shares = resultado.partesTerceiros.map((t) => t.valorCentavos);
  const m = distribuirTerceirosPorParcela(
    shares,
    args.parcelas.map((p) => p.valorCentavos),
  );

  const recebiveis: DivisaoPayload["recebiveis"] = [];
  args.parcelas.forEach((parcela, i) => {
    resultado.partesTerceiros.forEach((t, j) => {
      const centavos = m[i][j];
      if (centavos <= 0) return; // não cria recebível de R$0 numa parcela
      recebiveis.push({
        person_id: t.personId,
        parcela_numero: parcela.numero,
        statement_id: parcela.statementId,
        card_id: parcela.cardId,
        valor: centavosParaReais(centavos),
        data_prevista: null,
      });
    });
  });

  return {
    ok: true,
    minhaParteCentavos: resultado.minhaParteCentavos,
    divisao: {
      alcance: args.alcance,
      pessoas: pessoasDoPayload(args.parts, resultado),
      recebiveis,
    },
  };
}
