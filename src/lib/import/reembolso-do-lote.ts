/**
 * 04-C · T7 — a prévia do reembolso na REVISÃO da importação.
 *
 * Várias linhas da mesma pessoa no mesmo lote entram em sequência: a prévia da segunda considera
 * a primeira (o `commitImport` grava na ordem do arquivo, e a dívida que a primeira abate já não
 * existe quando a segunda é gravada). A conta é de `previaDoLote` (`finance/reembolso.ts`) — esta
 * função só AGRUPA por pessoa e ORDENA; reimplementá-la aqui faria a revisão prometer um número e
 * o servidor decidir outro (a mesma disciplina de `split-totals.ts` com o motor da divisão).
 *
 * Puro: sem I/O, sem zod, sem `server-only` — a tela o importa.
 */
import { previaDoLote, type PreviaDoReembolso } from "@/lib/finance/reembolso";

export type SituacaoDaPessoa = { devidoCentavos: number; saldoAFavorCentavos: number };

export type LinhaDoReembolso = {
  id: string;
  valorCentavos: number;
  pessoaId: string | null;
  /** A posição da linha no arquivo (`linha_index`): é a ordem em que o commit grava. */
  ordem: number;
};

const SEM_DIVIDA: SituacaoDaPessoa = { devidoCentavos: 0, saldoAFavorCentavos: 0 };

/**
 * Prévia de cada linha COM pessoa. Quem chama já filtra o que entra (receita, `para_importar`, sem
 * conta de destino); linha sem pessoa é ignorada. Pessoa ausente de `situacoes` conta como quem
 * não deve nada.
 */
export function previasDoReembolsoNoLote(
  linhas: readonly LinhaDoReembolso[],
  situacoes: ReadonlyMap<string, SituacaoDaPessoa> | Readonly<Record<string, SituacaoDaPessoa>>,
): Map<string, PreviaDoReembolso> {
  const situacaoDe = (pessoaId: string): SituacaoDaPessoa =>
    (situacoes instanceof Map ? situacoes.get(pessoaId) : Object.hasOwn(situacoes, pessoaId) ? (situacoes as Record<string, SituacaoDaPessoa>)[pessoaId] : undefined) ??
    SEM_DIVIDA;

  const porPessoa = new Map<string, LinhaDoReembolso[]>();
  for (const l of linhas) {
    if (l.pessoaId === null) continue;
    porPessoa.set(l.pessoaId, [...(porPessoa.get(l.pessoaId) ?? []), l]);
  }

  const previas = new Map<string, PreviaDoReembolso>();
  for (const [pessoaId, daPessoa] of porPessoa) {
    const emOrdem = [...daPessoa].sort((a, b) => a.ordem - b.ordem);
    const calculadas = previaDoLote(
      situacaoDe(pessoaId),
      emOrdem.map((l) => l.valorCentavos),
    );
    emOrdem.forEach((l, i) => previas.set(l.id, calculadas[i]!));
  }
  return previas;
}
