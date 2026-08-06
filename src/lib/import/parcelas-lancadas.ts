/**
 * A linha desta fatura já está lançada como PARCELA de um parcelamento? (lógica PURA, testada
 * em parcelas-lancadas.test.ts)
 *
 * PROBLEMA QUE RESOLVE (relato do usuário, 2026-08-06)
 * ----------------------------------------------------
 * Importar "NETSHOES 5/12" da fatura de julho como parcelamento cria de uma vez as parcelas
 * 5..12, cada uma ancorada na fatura do seu mês. Aí a fatura de agosto chega com a linha
 * "NETSHOES 6/12" — e a dedup deixava passar, porque ela procura no lugar errado.
 *
 * `existingKeysFor` monta as chaves lendo só `transactions`, mas uma compra parcelada guarda ali
 * apenas a compra-pai (o TOTAL, com a data de julho, sem fatura); quem ocupa a fatura de agosto é
 * uma linha de `transaction_installments`. A linha do arquivo (R$ 105, agosto) não bate com a
 * compra-pai (R$ 840, julho) por nenhum campo — não é heurística frouxa, é um lugar em que a
 * dedup nunca olhou. Resultado: a fatura contava o mesmo gasto duas vezes e, em compra de
 * terceiro, o recebível da pessoa era cobrado em dobro.
 *
 * O QUE ESTE MÓDULO NÃO FAZ
 * -------------------------
 * Não substitui `detectarDuplicados` — roda DEPOIS dela e só encosta em linha que sobrou como
 * `para_importar`. Linha em erro, ignorada ou já duplicada passa intacta.
 *
 * Parcela CANCELADA não chega aqui (o servidor lê só `status = 'ativa'`): ela não ocupa mais a
 * fatura, então não pode bloquear a importação da linha correspondente.
 */
import { descricaoBaseParcela } from "@/lib/import/normalize";
import type { NormalizedRow } from "@/lib/import/types";

/** Uma parcela ATIVA já lançada no cartão de destino. */
export type ParcelaLancada = {
  numero: number;
  totalParcelas: number;
  valorCentavos: number;
  /** Competência da fatura onde a parcela cai ('yyyy-MM-01'); null quando não resolvida. */
  competencia: string | null;
  /** Descrição da compra-pai já em `descricaoBaseParcela` (comparável entre meses). */
  descricaoBase: string;
  /** Descrição da compra-pai como o usuário a vê — só para a mensagem. */
  descricaoOriginal: string;
};

const MESES_CURTOS = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

/** 'yyyy-MM' de uma competência. Competência é DATA PURA: tratada como texto, nunca como Date. */
function mesDe(competencia: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})/.exec(competencia ?? "");
  if (!m) return null;
  const mes = Number(m[2]);
  return mes >= 1 && mes <= 12 ? `${m[1]}-${m[2]}` : null;
}

/** 'ago/2026' a partir da competência — rótulo humano da fatura na mensagem. */
function rotuloCompetencia(competencia: string | null | undefined): string | null {
  const mes = mesDe(competencia);
  if (!mes) return null;
  const [ano, mm] = mes.split("-");
  return `${MESES_CURTOS[Number(mm) - 1]}/${ano}`;
}

/** Motivo mostrado na revisão: diz QUAL parcelamento cobre a linha e em que fatura. */
function motivoDaParcela(p: ParcelaLancada): string {
  const base = `Já lançada como parcela ${p.numero}/${p.totalParcelas} de «${p.descricaoOriginal}»`;
  const rotulo = rotuloCompetencia(p.competencia);
  return rotulo ? `${base}, na fatura de ${rotulo}.` : `${base}.`;
}

type Candidata = { parcela: ParcelaLancada; usada: boolean };

/**
 * Marca como `duplicada` cada linha do lote que já está coberta por uma parcela ativa do cartão.
 *
 * Três passes, NESTA ordem, cada um sobre o que sobrou — a evidência mais forte casa primeiro, e
 * o casamento mais frouxo só alcança o que ninguém reivindicou:
 *
 *   1. linha com "k/N": número + total + descrição-base;
 *   2. linha com "k/N" que sobrou: número + total + valor exato (banco que reescreve o texto da
 *      loja entre os meses);
 *   3. linha SEM marcação de parcela: valor exato + descrição-base, entre as parcelas que caem na
 *      fatura sendo importada.
 *
 * O passe 3 exige `competenciaLote`: sem saber de que fatura é o arquivo, o filtro que segura o
 * falso positivo desaparece — e aviso sem base é pior que nenhum.
 *
 * Cada parcela é consumida no máximo uma vez, para duas linhas do arquivo não apontarem para a
 * mesma parcela.
 */
export function marcarParcelasJaLancadas(
  rows: NormalizedRow[],
  parcelas: ParcelaLancada[],
  competenciaLote: string | null,
): NormalizedRow[] {
  const candidatas: Candidata[] = parcelas.map((parcela) => ({
    parcela,
    usada: false,
  }));
  const casadas = new Map<number, ParcelaLancada>();
  const mesLote = mesDe(competenciaLote);

  function reivindicar(
    indice: number,
    combina: (p: ParcelaLancada) => boolean,
  ): void {
    const alvo = candidatas.find((c) => !c.usada && combina(c.parcela));
    if (!alvo) return;
    alvo.usada = true;
    casadas.set(indice, alvo.parcela);
  }

  function pendente(row: NormalizedRow, indice: number): boolean {
    return row.status === "para_importar" && !casadas.has(indice);
  }

  // Passe 1 — número + total + descrição-base.
  rows.forEach((row, i) => {
    if (!pendente(row, i) || row.parcela == null || row.parcelasTotal == null) return;
    const base = descricaoBaseParcela(row.descricao);
    if (!base) return; // descrição vazia casaria com qualquer compra sem descrição
    reivindicar(
      i,
      (p) =>
        p.numero === row.parcela &&
        p.totalParcelas === row.parcelasTotal &&
        p.descricaoBase === base,
    );
  });

  // Passe 2 — número + total + valor exato.
  rows.forEach((row, i) => {
    if (!pendente(row, i) || row.parcela == null || row.parcelasTotal == null) return;
    if (row.valorCentavos == null) return;
    reivindicar(
      i,
      (p) =>
        p.numero === row.parcela &&
        p.totalParcelas === row.parcelasTotal &&
        p.valorCentavos === row.valorCentavos,
    );
  });

  // Passe 3 — linha sem marcação: valor + descrição-base, na fatura sendo importada.
  if (mesLote) {
    rows.forEach((row, i) => {
      if (!pendente(row, i) || row.parcela != null || row.parcelasTotal != null) return;
      if (row.valorCentavos == null) return;
      const base = descricaoBaseParcela(row.descricao);
      if (!base) return;
      reivindicar(
        i,
        (p) =>
          p.valorCentavos === row.valorCentavos &&
          p.descricaoBase === base &&
          mesDe(p.competencia) === mesLote,
      );
    });
  }

  return rows.map((row, i) => {
    const parcela = casadas.get(i);
    if (!parcela) return row;
    return { ...row, status: "duplicada" as const, motivo: motivoDaParcela(parcela) };
  });
}
